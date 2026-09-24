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
import { projectInstallRoot } from "./repository.js";
import { ensureManagedPlantUml } from "./plantuml-runtime.js";

const MARKER_START = "<!-- ARCH-LENS:START -->";
const MARKER_END = "<!-- ARCH-LENS:END -->";
const SUPPORTED_AGENTS = ["codex"];
const INCOMPATIBLE_PATHS = [".arch-lens/architecture.uml", ".arch-lens/architecture-assets.md"];
const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillSource = path.join(moduleRoot, ".agents", "skills", "arch-lens");
const principlesTemplate = path.join(moduleRoot, "templates", "principles.md");

export async function initWorkspace(cwd) {
  const root = path.resolve(cwd);
  assertNoIncompatibleState(root);
  const plantUmlRuntime = await ensureManagedPlantUml();

  const diagramsRoot = path.join(root, DIAGRAMS_RELATIVE_PATH);
  const principlesPath = path.join(root, PRINCIPLES_RELATIVE_PATH);
  const changesRoot = path.join(root, CHANGES_RELATIVE_PATH);
  const archiveRoot = path.join(changesRoot, "archive");
  const skillTarget = path.join(root, ".agents", "skills", "arch-lens");
  const agentsPath = path.join(root, "AGENTS.md");
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
  const base = scope === "global" ? path.join(os.homedir(), ".agents", "skills") : path.join(projectInstallRoot(cwd), ".agents", "skills");
  const target = path.join(base, "arch-lens");
  const result = installSkill(target);
  return { target, ...result };
}

function assertNoIncompatibleState(root) {
  const found = INCOMPATIBLE_PATHS.filter((entry) => fs.existsSync(path.join(root, entry)));
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

function agentsMarker() {
  return `${MARKER_START}
本项目使用 Arch Lens local-first workflowProtocol ${WORKFLOW_PROTOCOL}。修改任何建模资产前，先读取并遵循项目 Skill：\`.agents/skills/arch-lens/SKILL.md\`。
${MARKER_END}`;
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
