import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const VERSION = "0.0.0-draft";
export const SCHEMA_VERSION = 1;
export const WORKFLOW_PROTOCOL = 1;
export const FEATURES = Object.freeze([
  "plantuml-batch-render",
  "change-pack-v1",
  "approval-digest-v1",
  "completion-approval-v1",
  "managed-plantuml-runtime-v1",
  "change-overlay-v1"
]);
export const DIAGRAMS_RELATIVE_PATH = ".arch-lens/diagrams";
export const PRINCIPLES_RELATIVE_PATH = ".arch-lens/principles.md";
export const CHANGES_RELATIVE_PATH = ".arch-lens/changes";
export const RENDERED_RELATIVE_PATH = ".arch-lens/rendered";

export function operationError(message, diagnostics = []) {
  const error = new Error(message);
  error.diagnostics = diagnostics;
  return error;
}

export function diagnostic(severity, code, file, line, message) {
  return { severity, code, file, line, message };
}

export function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function stableJson(value) {
  return JSON.stringify(sortObject(value));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object" || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

export function atomicWrite(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o666);
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, target);
    fsyncDirectory(path.dirname(target));
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

export function replaceDirectoryAtomically(target, writer) {
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  const nonce = `${process.pid}.${Date.now()}`;
  const temporary = path.join(parent, `.${path.basename(target)}.${nonce}.tmp`);
  const backup = path.join(parent, `.${path.basename(target)}.${nonce}.backup`);
  fs.mkdirSync(temporary);
  let backedUp = false;
  try {
    writer(temporary);
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      backedUp = true;
    }
    fs.renameSync(temporary, target);
    fsyncDirectory(parent);
    if (backedUp) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    if (backedUp && !fs.existsSync(target) && fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  }
}

export function writeTreeFile(root, relative, content) {
  const target = path.join(root, relative);
  if (!isInside(root, target)) throw new Error(`生成路径越界：${relative}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const descriptor = fs.openSync(target, "wx", 0o666);
  try {
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, "r");
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EBADF"].includes(error.code)) throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

export function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function relativePosix(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

export function resolvePotentialRealPath(target) {
  let existing = path.resolve(target);
  const suffix = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(fs.realpathSync(existing), ...suffix);
}

export function assertNoSymlinkPath(root, target, label) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!isInside(resolvedRoot, resolvedTarget)) throw new Error(`${label} 位于允许目录之外。`);
  let current = resolvedRoot;
  for (const segment of path.relative(resolvedRoot, resolvedTarget).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`${label} 不得包含符号链接：${relativePosix(root, current)}`);
  }
}

export function printJson(value) {
  console.log(JSON.stringify(value));
}

export function emit(json, payload, message) {
  if (json) printJson(payload);
  else console.log(message);
}

export function localizeCommanderError(message) {
  return message
    .replace(/^error:/i, "错误：")
    .replace(/unknown command/i, "未知命令")
    .replace(/required option/i, "缺少必填选项")
    .replace(/missing mandatory option/i, "缺少必填选项")
    .replace(/missing required argument/i, "缺少必填参数")
    .replace(/too many arguments/i, "参数过多");
}
