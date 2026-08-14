import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHANGES_RELATIVE_PATH,
  DIAGRAMS_RELATIVE_PATH,
  PRINCIPLES_RELATIVE_PATH,
  WORKFLOW_PROTOCOL,
  atomicWrite
} from "./core.js";
import { changedPaths, git, gitStatusEntries, requireRepository } from "./repository.js";
import { ensureManagedPlantUml } from "./plantuml-runtime.js";

const MARKER_START = "<!-- ARCH-LENS:START -->";
const MARKER_END = "<!-- ARCH-LENS:END -->";
const SUPPORTED_AGENTS = ["codex"];
const INCOMPATIBLE_PATHS = [".arch-lens/architecture.uml", ".arch-lens/architecture-assets.md"];
const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillSource = path.join(moduleRoot, ".agents", "skills", "arch-lens");
const principlesTemplate = path.join(moduleRoot, "templates", "principles.md");

export async function initWorkspace(cwd) {
  const repository = requireRepository(cwd);
  assertNoIncompatibleState(repository.root);
  validateInitWorktree(repository.root);
  const plantUmlRuntime = await ensureManagedPlantUml();

  const diagramsRoot = path.join(repository.root, DIAGRAMS_RELATIVE_PATH);
  const principlesPath = path.join(repository.root, PRINCIPLES_RELATIVE_PATH);
  const changesRoot = path.join(repository.root, CHANGES_RELATIVE_PATH);
  const archiveRoot = path.join(changesRoot, "archive");
  const skillTarget = path.join(repository.root, ".agents", "skills", "arch-lens");
  const agentsPath = path.join(repository.root, "AGENTS.md");
  for (const [target, label] of [[diagramsRoot, DIAGRAMS_RELATIVE_PATH], [changesRoot, CHANGES_RELATIVE_PATH]]) {
    if (fs.existsSync(target) && (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isDirectory())) throw new Error(`${label} 必须是真实目录且不得是符号链接。`);
  }
  if (fs.existsSync(principlesPath) && (fs.lstatSync(principlesPath).isSymbolicLink() || !fs.statSync(principlesPath).isFile())) throw new Error(`${PRINCIPLES_RELATIVE_PATH} 必须是真实文件且不得是符号链接。`);
  assertRecognizedChangeWorkspace(changesRoot);

  const alreadyInitialized = fs.existsSync(diagramsRoot)
    && fs.existsSync(principlesPath)
    && fs.existsSync(archiveRoot)
    && fs.existsSync(path.join(skillTarget, "SKILL.md"))
    && hasManagedMarker(agentsPath);

  fs.mkdirSync(diagramsRoot, { recursive: true });
  fs.mkdirSync(archiveRoot, { recursive: true });
  writeKeepFileForEmptyDirectory(diagramsRoot);
  writeKeepFileForEmptyDirectory(archiveRoot);
  writeExclusiveIfMissing(principlesPath, fs.readFileSync(principlesTemplate));
  installSkill(skillTarget);
  upsertManagedMarker(agentsPath, agentsMarker());
  updateGitignore(repository.root);
  return {
    created: !alreadyInitialized,
    workflowProtocol: WORKFLOW_PROTOCOL,
    plantUmlRuntime,
    diagramsPath: DIAGRAMS_RELATIVE_PATH,
    principlesPath: PRINCIPLES_RELATIVE_PATH,
    changesPath: CHANGES_RELATIVE_PATH
  };
}

export function installAgent(cwd, agent, options) {
  if (!SUPPORTED_AGENTS.includes(agent)) throw new Error(`不支持的 Agent：${agent}。当前仅支持 codex。`);
  const flags = [options.project && "project", options.global && "global", options.scope].filter(Boolean);
  if (flags.length > 1) throw new Error("--scope、--project 和 --global 不能同时使用。");
  const scope = options.scope ?? (options.global ? "global" : "project");
  if (!new Set(["project", "global"]).has(scope)) throw new Error("安装范围必须为 project 或 global。");
  const base = scope === "global" ? path.join(os.homedir(), ".agents", "skills") : path.join(requireRepository(cwd).root, ".agents", "skills");
  const target = path.join(base, "arch-lens");
  const result = installSkill(target);
  return { target, ...result };
}

function assertNoIncompatibleState(root) {
  const found = [];
  for (const entry of INCOMPATIBLE_PATHS) {
    const tracked = git(root, ["ls-files", "--", entry]);
    if (fs.existsSync(path.join(root, entry)) || (tracked.status === 0 && tracked.stdout.trim())) found.push(entry);
  }
  if (found.length > 0) throw new Error(`发现不兼容的旧 Arch Lens 资产；draft 不自动迁移或删除，请先备份并人工处理：${found.join("、")}`);
}

function assertRecognizedChangeWorkspace(changesRoot) {
  if (!fs.existsSync(changesRoot)) return;
  for (const entry of fs.readdirSync(changesRoot, { withFileTypes: true })) {
    if (entry.name === ".gitkeep") continue;
    const target = path.join(changesRoot, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Change Pack 不得包含符号链接：${entry.name}`);
    if (entry.name === "archive") {
      if (!entry.isDirectory()) throw new Error(".arch-lens/changes/archive 必须是目录。");
      continue;
    }
    if (!entry.isDirectory() || !fs.existsSync(path.join(target, "change.yaml"))) {
      throw new Error(`发现无法识别的旧 .arch-lens/changes 状态；draft 不自动迁移或删除：${entry.name}`);
    }
  }
}

function validateInitWorktree(root) {
  const disallowed = changedPaths(root).filter((entry) => !isManagedInitPath(entry));
  if (disallowed.length > 0) throw new Error(`init 只允许干净工作区或 Arch Lens 自身的初始化状态；请先处理：${disallowed.join("、")}`);
  for (const incompatible of INCOMPATIBLE_PATHS) {
    const statuses = gitStatusEntries(root, incompatible, true);
    if (statuses.length > 0) throw new Error(`发现不兼容的旧 Arch Lens 资产；draft 不自动迁移或删除：${incompatible}`);
  }
}

function isManagedInitPath(entry) {
  return entry === "AGENTS.md"
    || entry === ".gitignore"
    || entry === ".arch-lens"
    || entry.startsWith(".arch-lens/")
    || entry === ".agents/skills/arch-lens"
    || entry.startsWith(".agents/skills/arch-lens/");
}

function agentsMarker() {
  return `${MARKER_START}\n本项目使用 Arch Lens draft workflowProtocol ${WORKFLOW_PROTOCOL}；Skill 负责业务建模与语义审查，CLI 只提供确定性辅助能力。\n\n- 修改建模资产前，Skill 必须先执行 \`arch-lens capabilities --json\` 并确认协议兼容。\n- 已批准的业务模型位于 \`.arch-lens/diagrams/**/*.puml\`；未批准候选只位于对应 Change Pack 的 \`diagrams/\` overlay。\n- 持久建模默认一张主视图、通常最多三张；第四张起须逐张论证，并在生成前取得人类明确同意。\n- SVG 只在显式 render 时生成到与源图相邻层级的 Git 忽略 \`rendered/\` 镜像，也可直接使用 IDE 预览。\n- 任何持久 PlantUML 变更必须进入 Change Pack，并在实现代码前获得人类设计批准、\`change apply-model\` 和 model-only commit。\n- AI 不得自行记录设计或完成批准；实现后必须对照批准模型、代码 diff、测试和 AC 做语义审查。\n- 规范 Skill 位于 \`.agents/skills/arch-lens/\`。\n${MARKER_END}`;
}

function hasManagedMarker(file) {
  if (!fs.existsSync(file)) return false;
  const content = fs.readFileSync(file, "utf8");
  return content.includes(MARKER_START) && content.includes(MARKER_END);
}

function upsertManagedMarker(file, marker) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const start = current.indexOf(MARKER_START);
  const end = current.indexOf(MARKER_END);
  const next = start >= 0 && end >= start
    ? `${current.slice(0, start)}${marker}${current.slice(end + MARKER_END.length)}`
    : `${current}${current && !current.endsWith("\n") ? "\n" : ""}${current ? "\n" : ""}${marker}\n`;
  atomicWrite(file, Buffer.from(next));
}

function updateGitignore(root) {
  const target = path.join(root, ".gitignore");
  const rules = [".arch-lens/rendered/", ".arch-lens/changes/**/rendered/"];
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  const existing = new Set(current.split(/\r?\n/));
  const missing = rules.filter((rule) => !existing.has(rule));
  if (missing.length === 0) return;
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  atomicWrite(target, Buffer.from(`${current}${prefix}${missing.join("\n")}\n`));
}

function writeExclusiveIfMissing(file, content) {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o666);
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    try { fs.linkSync(temporary, file); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

function writeKeepFileForEmptyDirectory(directory) {
  if (fs.readdirSync(directory).length === 0) writeExclusiveIfMissing(path.join(directory, ".gitkeep"), "");
}

function installSkill(target) {
  const existed = fs.existsSync(target);
  if (sameFilesystemEntry(skillSource, target)) return { existed, same: true };
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  const nonce = `${process.pid}.${Date.now()}`;
  const temporary = path.join(parent, `.arch-lens.install.${nonce}.tmp`);
  const backup = path.join(parent, `.arch-lens.install.${nonce}.backup`);
  try {
    copyDirectory(skillSource, temporary);
    if (existed) fs.renameSync(target, backup);
    try { fs.renameSync(temporary, target); }
    catch (error) {
      if (existed && fs.existsSync(backup)) fs.renameSync(backup, target);
      throw error;
    }
    if (existed) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return { existed, same: false };
}

function sameFilesystemEntry(left, right) {
  if (path.resolve(left) === path.resolve(right)) return true;
  if (!fs.existsSync(left) || !fs.existsSync(right)) return false;
  return fs.realpathSync(left) === fs.realpathSync(right);
}

function copyDirectory(source, target) {
  if (!fs.existsSync(source)) throw new Error(`找不到内置 Skill：${source}`);
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
  }
}
