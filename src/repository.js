import fs from "node:fs";
import path from "node:path";
import {
  CHANGES_RELATIVE_PATH,
  DIAGRAMS_RELATIVE_PATH,
  PRINCIPLES_RELATIVE_PATH,
  WORKFLOW_PROTOCOL
} from "./core.js";

export function findWorkspaceRoot(cwd = process.cwd()) {
  let current = path.resolve(cwd);
  if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) throw new Error(`工作目录不存在或不是目录：${cwd}`);
  current = fs.realpathSync(current);
  while (true) {
    const marker = path.join(current, ".arch-lens");
    if (fs.existsSync(marker)) {
      if (fs.lstatSync(marker).isSymbolicLink() || !fs.statSync(marker).isDirectory()) {
        throw new Error(".arch-lens 必须是真实目录且不得是符号链接。");
      }
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function projectInstallRoot(cwd = process.cwd()) {
  const discovered = findWorkspaceRoot(cwd);
  return discovered ?? fs.realpathSync(path.resolve(cwd));
}

export function requireWorkspace(cwd) {
  const root = findWorkspaceRoot(cwd);
  if (!root) throw new Error(`未找到 .arch-lens；请先在当前目录运行 arch-lens init。`);
  return { root };
}

export function requireDiagramWorkspace(cwd) {
  const workspace = requireWorkspace(cwd);
  const diagramsRoot = path.join(workspace.root, DIAGRAMS_RELATIVE_PATH);
  if (!isRealDirectory(diagramsRoot)) throw new Error(`未找到 ${DIAGRAMS_RELATIVE_PATH}；请先运行 arch-lens init。`);
  return { ...workspace, diagramsRoot };
}

export function requireProtocolWorkspace(cwd) {
  const workspace = requireDiagramWorkspace(cwd);
  const principlesPath = path.join(workspace.root, PRINCIPLES_RELATIVE_PATH);
  const changesRoot = path.join(workspace.root, CHANGES_RELATIVE_PATH);
  const archiveRoot = path.join(changesRoot, "archive");
  if (!isRealFile(principlesPath) || !isRealDirectory(changesRoot) || !isRealDirectory(archiveRoot)) {
    throw new Error(`当前工作区尚未初始化 workflowProtocol ${WORKFLOW_PROTOCOL}；请运行 arch-lens init。`);
  }
  return { ...workspace, principlesPath, changesRoot, archiveRoot };
}

function isRealDirectory(target) {
  return fs.existsSync(target) && !fs.lstatSync(target).isSymbolicLink() && fs.statSync(target).isDirectory();
}

function isRealFile(target) {
  return fs.existsSync(target) && !fs.lstatSync(target).isSymbolicLink() && fs.statSync(target).isFile();
}
