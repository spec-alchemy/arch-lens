import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import {
  SCHEMA_VERSION,
  WORKFLOW_PROTOCOL,
  diagnostic,
  operationError,
  sha256,
  stableJson
} from "./core.js";
import { commitChangedPaths, commitsTouchingPath, gitShow } from "./repository.js";

const SHA256 = /^[0-9a-f]{64}$/;
const FULL_COMMIT = /^[0-9a-f]{40,64}$/;
const APPROVAL_KEYS = new Set(["schemaVersion", "workflowProtocol", "design", "completion"]);
const DESIGN_KEYS = new Set(["reviewer", "recordedAt", "digest", "baseCommit", "artifacts"]);
const COMPLETION_KEYS = new Set(["reviewer", "recordedAt", "digest", "designDigest", "implementationCommit", "reviewedImplementationCommit", "tasksSha256", "verificationSha256"]);

export function emptyApproval() {
  return { schemaVersion: SCHEMA_VERSION, workflowProtocol: WORKFLOW_PROTOCOL, design: [], completion: [] };
}

export function readApproval(file) {
  let value;
  try {
    const document = parseDocument(fs.readFileSync(file, "utf8"), { uniqueKeys: true, maxAliasCount: 0, prettyErrors: true });
    if (document.errors.length > 0) throw new Error(document.errors.map((error) => error.message).join("; "));
    value = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw operationError("approval.yaml 无法解析。", [diagnostic("error", "APPROVAL_YAML_INVALID", file, null, error.message)]);
  }
  const diagnostics = validateApprovalValue(value, file);
  if (diagnostics.length > 0) throw operationError(`approval.yaml 不符合 workflowProtocol ${WORKFLOW_PROTOCOL} Schema。`, diagnostics);
  return value;
}

export function safeApproval(file) {
  try { return readApproval(file); }
  catch { return emptyApproval(); }
}

export function validateApprovalValue(value, file) {
  const diagnostics = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    diagnostics.push(diag("APPROVAL_SCHEMA_INVALID", file, "approval.yaml 必须是对象。"));
    return diagnostics;
  }
  rejectUnknownKeys(value, APPROVAL_KEYS, file, diagnostics);
  if (value.schemaVersion !== SCHEMA_VERSION || value.workflowProtocol !== WORKFLOW_PROTOCOL || !Array.isArray(value.design) || !Array.isArray(value.completion)) {
    diagnostics.push(diag("APPROVAL_SCHEMA_INVALID", file, `approval.yaml 必须声明 schemaVersion ${SCHEMA_VERSION}、workflowProtocol ${WORKFLOW_PROTOCOL} 以及 design/completion 数组。`));
    return diagnostics;
  }
  value.design.forEach((record, index) => {
    const location = `${file}:design[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) { diagnostics.push(diag("APPROVAL_RECORD_INVALID", location, "design approval 必须是对象。")); return; }
    rejectUnknownKeys(record, DESIGN_KEYS, location, diagnostics);
    if (!validIdentity(record.reviewer, record.recordedAt) || !SHA256.test(record.digest ?? "") || !FULL_COMMIT.test(record.baseCommit ?? "") || !Array.isArray(record.artifacts)) diagnostics.push(diag("APPROVAL_RECORD_INVALID", location, "design approval 的 reviewer、recordedAt、digest、baseCommit 或 artifacts 无效。"));
    for (const artifact of record.artifacts ?? []) if (!artifact || typeof artifact.path !== "string" || !(artifact.sha256 === null || SHA256.test(artifact.sha256 ?? ""))) diagnostics.push(diag("APPROVAL_RECORD_INVALID", location, "design approval artifact 必须包含 path 和 SHA-256/null。"));
  });
  value.completion.forEach((record, index) => {
    const location = `${file}:completion[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) { diagnostics.push(diag("APPROVAL_RECORD_INVALID", location, "completion approval 必须是对象。")); return; }
    rejectUnknownKeys(record, COMPLETION_KEYS, location, diagnostics);
    const hashes = [record.digest, record.designDigest, record.tasksSha256, record.verificationSha256];
    const commits = [record.implementationCommit, record.reviewedImplementationCommit];
    if (!validIdentity(record.reviewer, record.recordedAt) || hashes.some((hash) => !SHA256.test(hash ?? "")) || commits.some((commit) => !FULL_COMMIT.test(commit ?? ""))) diagnostics.push(diag("APPROVAL_RECORD_INVALID", location, "completion approval 的 reviewer、时间、摘要或 commit 无效。"));
  });
  return diagnostics;
}

export function designDigest(root, baseCommit, files) {
  const artifacts = [...new Set(files)].sort((a, b) => a.localeCompare(b, "en")).map((file) => {
    const target = path.join(root, file);
    const readable = fs.existsSync(target) && !fs.lstatSync(target).isSymbolicLink() && fs.statSync(target).isFile();
    return { path: file, sha256: readable ? sha256(fs.readFileSync(target)) : null };
  });
  return designDigestFromArtifacts(baseCommit, artifacts);
}

export function designDigestFromArtifacts(baseCommit, artifacts) {
  const stableArtifacts = [...artifacts].sort((a, b) => a.path.localeCompare(b.path, "en"));
  const manifest = { workflowProtocol: WORKFLOW_PROTOCOL, baseCommit, artifacts: stableArtifacts };
  return { digest: sha256(`${stableJson(manifest)}\n`), artifacts: stableArtifacts };
}

export function completionDigest(value) {
  return sha256(`${stableJson({ workflowProtocol: WORKFLOW_PROTOCOL, ...value })}\n`);
}

export function findApprovalCommit(root, approvalPath, designDigestValue, allowedPaths) {
  if (!designDigestValue) return null;
  for (const commit of commitsTouchingPath(root, approvalPath)) {
    const content = gitShow(root, commit, approvalPath);
    if (!content?.toString("utf8").includes(designDigestValue)) continue;
    if (commitChangedPaths(root, commit).every((file) => allowedPaths.has(file))) return commit;
  }
  return null;
}

function validIdentity(reviewer, recordedAt) {
  return typeof reviewer === "string" && reviewer.trim().length > 0 && typeof recordedAt === "string" && !Number.isNaN(Date.parse(recordedAt)) && new Date(recordedAt).toISOString() === recordedAt;
}

function rejectUnknownKeys(value, allowed, file, diagnostics) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) diagnostics.push(diag("UNKNOWN_SCHEMA_KEY", file, `不支持的字段：${key}`));
}

function diag(code, file, message) {
  return diagnostic("error", code, file, null, message);
}
