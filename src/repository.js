import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  CHANGES_RELATIVE_PATH,
  DIAGRAMS_RELATIVE_PATH,
  PRINCIPLES_RELATIVE_PATH,
  WORKFLOW_PROTOCOL
} from "./core.js";

const GIT_BUFFER = 16 * 1024 * 1024;

export function git(cwd, args, options = {}) {
  return spawnSync("git", args, {
    cwd,
    encoding: options.encoding === null ? null : "utf8",
    maxBuffer: options.maxBuffer ?? GIT_BUFFER
  });
}

export function requireRepository(cwd) {
  const rootResult = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (rootResult.status !== 0) throw new Error("Arch Lens 只支持 Git 仓库。");
  const root = rootResult.stdout.trim();
  const head = git(root, ["rev-parse", "--verify", "HEAD"]);
  if (head.status !== 0) throw new Error("Git 仓库必须先有一个有效提交（HEAD）。");
  return { root, head: head.stdout.trim() };
}

export function requireDiagramWorkspace(cwd) {
  const repository = requireRepository(cwd);
  const diagramsRoot = path.join(repository.root, DIAGRAMS_RELATIVE_PATH);
  if (!isRealDirectory(diagramsRoot)) throw new Error(`未找到 ${DIAGRAMS_RELATIVE_PATH}；请先运行 arch-lens init。`);
  return { ...repository, diagramsRoot };
}

export function requireProtocolWorkspace(cwd) {
  const workspace = requireDiagramWorkspace(cwd);
  const principlesPath = path.join(workspace.root, PRINCIPLES_RELATIVE_PATH);
  const changesRoot = path.join(workspace.root, CHANGES_RELATIVE_PATH);
  const archiveRoot = path.join(changesRoot, "archive");
  if (!isRealFile(principlesPath) || !isRealDirectory(changesRoot) || !isRealDirectory(archiveRoot)) {
    throw new Error(`当前仓库尚未初始化 workflowProtocol ${WORKFLOW_PROTOCOL}；请在干净工作区运行 arch-lens init。`);
  }
  return { ...workspace, principlesPath, changesRoot, archiveRoot };
}

function isRealDirectory(target) {
  return fs.existsSync(target) && !fs.lstatSync(target).isSymbolicLink() && fs.statSync(target).isDirectory();
}

function isRealFile(target) {
  return fs.existsSync(target) && !fs.lstatSync(target).isSymbolicLink() && fs.statSync(target).isFile();
}

export function gitStatusEntries(root, pathspec, includeIgnored = false) {
  const args = ["status", "--porcelain=v1", "-z", "--untracked-files=all"];
  if (includeIgnored) args.push("--ignored=matching");
  if (pathspec) args.push("--", pathspec);
  const result = git(root, args);
  if (result.status !== 0) throw new Error("无法读取 Git 工作区状态。");
  const entries = result.stdout.split("\0");
  const records = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) continue;
    const status = entry.slice(0, 2);
    records.push({ status, file: entry.slice(3) });
    if (/[RC]/.test(status) && entries[index + 1]) records.push({ status, file: entries[++index] });
  }
  return records;
}

export function changedPaths(root) {
  return [...new Set(gitStatusEntries(root).map(({ file }) => file))].sort((a, b) => a.localeCompare(b, "en"));
}

export function requireCleanWorktree(root, message = "该操作要求干净的 Git 工作区。") {
  const changed = changedPaths(root);
  if (changed.length > 0) throw new Error(`${message} 请先处理：${changed.join("、")}`);
}

export function gitShow(root, ref, file) {
  const result = git(root, ["show", `${ref}:${file}`], { encoding: null });
  if (result.status !== 0) return null;
  return Buffer.from(result.stdout);
}

export function gitRef(root, ref) {
  const result = git(root, ["rev-parse", "--verify", `${ref}^{commit}`]);
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

export function gitDiff(root, ref, file) {
  const result = git(root, ["diff", "--no-ext-diff", "--no-color", ref, "--", file]);
  if (result.status !== 0) throw new Error(`无法生成 Git diff：${file}`);
  if (result.stdout) return result.stdout;
  const current = path.join(root, file);
  if (!fs.existsSync(current)) return "";
  const tracked = git(root, ["ls-files", "--error-unmatch", "--", file]);
  if (tracked.status === 0) return "";
  const added = git(root, ["diff", "--no-ext-diff", "--no-color", "--no-index", "--", "/dev/null", current]);
  if (![0, 1].includes(added.status)) throw new Error(`无法生成新增文件 diff：${file}`);
  return added.stdout.replaceAll(current, `b/${file}`);
}

export function commitChangedPaths(root, commit) {
  const result = git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", commit]);
  if (result.status !== 0) throw new Error(`无法读取 commit 变化：${commit}`);
  return result.stdout.split(/\r?\n/).filter(Boolean).sort((a, b) => a.localeCompare(b, "en"));
}

export function isAncestor(root, ancestor, descendant = "HEAD") {
  return git(root, ["merge-base", "--is-ancestor", ancestor, descendant]).status === 0;
}

export function commitsBetween(root, from, to = "HEAD") {
  const result = git(root, ["log", "--format=%H%x09%aI%x09%s", `${from}..${to}`]);
  if (result.status !== 0) throw new Error("无法读取变更 commit 列表。");
  return result.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const [commit, authoredAt, ...subject] = line.split("\t");
    return { commit, authoredAt, subject: subject.join("\t") };
  });
}

export function changedFilesBetween(root, from, to = "HEAD") {
  const result = git(root, ["diff", "--name-status", "--no-renames", `${from}..${to}`]);
  if (result.status !== 0) throw new Error("无法读取实现文件变化。");
  return result.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const [status, ...file] = line.split("\t");
    return { status, path: file.join("\t") };
  });
}

export function commitsTouchingPath(root, file) {
  const result = git(root, ["log", "--reverse", "--format=%H", "--", file]);
  if (result.status !== 0) throw new Error(`无法读取文件历史：${file}`);
  return result.stdout.split(/\r?\n/).filter(Boolean);
}
