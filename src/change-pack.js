import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument, stringify as stringifyYaml } from "yaml";
import {
  completionDigest,
  designDigestFromArtifacts,
  emptyApproval,
  findApprovalCommit,
  readApproval,
  safeApproval as safeApprovalFile,
  validateApprovalValue
} from "./approval.js";
import {
  CHANGES_RELATIVE_PATH,
  DIAGRAMS_RELATIVE_PATH,
  PRINCIPLES_RELATIVE_PATH,
  SCHEMA_VERSION,
  WORKFLOW_PROTOCOL,
  assertNoSymlinkPath,
  atomicWrite,
  diagnostic,
  operationError,
  relativePosix,
  replaceDirectoryAtomically,
  sha256,
  writeTreeFile
} from "./core.js";
import {
  changedFilesBetween,
  changedPaths,
  commitsBetween,
  git,
  gitRef,
  gitShow,
  isAncestor,
  requireCleanWorktree,
  requireProtocolWorkspace
} from "./repository.js";
import { renderDiagramRecords, validateDiagramRecords } from "./plantuml.js";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateRoot = path.join(moduleRoot, "templates", "change-pack");
const CHANGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FULL_COMMIT = /^[0-9a-f]{40,64}$/;
const OPERATIONS = new Set(["add", "modify", "delete"]);
const PACK_FILES = ["change.yaml", "proposal.md", "decisions.md", "tasks.md", "approval.yaml", "verification.md"];
const CHANGE_KEYS = new Set(["schemaVersion", "workflowProtocol", "id", "baseCommit", "createdAt", "diagrams"]);
const DIAGRAM_KEYS = new Set(["path", "operation"]);

export function createChange(cwd, id) {
  validateChangeId(id);
  const workspace = requireProtocolWorkspace(cwd);
  requireChangeCreationWorktree(workspace);
  const target = path.join(workspace.changesRoot, id);
  if (fs.existsSync(target)) throw new Error(`Change Pack 已存在：${id}`);
  if (findArchivedChange(workspace.archiveRoot, id)) throw new Error(`该 Change ID 已归档，不能重复使用：${id}`);

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    workflowProtocol: WORKFLOW_PROTOCOL,
    id,
    baseCommit: workspace.head,
    createdAt: new Date().toISOString(),
    diagrams: []
  };
  replaceDirectoryAtomically(target, (temporary) => {
    writeTreeFile(temporary, "change.yaml", stringifyYaml(manifest, { lineWidth: 0 }));
    for (const file of ["proposal.md", "decisions.md", "tasks.md", "verification.md"]) writeTreeFile(temporary, file, fs.readFileSync(path.join(templateRoot, file)));
    writeTreeFile(temporary, "approval.yaml", stringifyYaml(emptyApproval(), { lineWidth: 0 }));
    fs.mkdirSync(path.join(temporary, "diagrams"));
  });
  return { id, path: relativePosix(workspace.root, target), baseCommit: workspace.head, workflowProtocol: WORKFLOW_PROTOCOL };
}

export function changeStatus(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  if (!id) {
    return { workflowProtocol: WORKFLOW_PROTOCOL, changes: listActiveChangeIds(workspace).map((changeId) => summarizePack(workspace, readPack(workspace, changeId))) };
  }
  const pack = readPack(workspace, id);
  return statusForPack(workspace, pack);
}

export function validateChangeCommand(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  const pack = readPack(workspace, id);
  const result = validatePack(workspace, pack, { plantUml: true });
  if (result.diagnostics.some(isError)) throw operationError(`Change Pack 校验失败：${id}`, result.diagnostics);
  return { id, valid: true, ...result };
}

export function diffChange(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  const pack = readPack(workspace, id);
  const validation = validatePack(workspace, pack, { plantUml: false });
  if (validation.diagnostics.some(isError)) throw operationError(`Change Pack 无法生成 diff：${id}`, validation.diagnostics);
  const files = [];
  let patch = "";
  for (const item of pack.change.diagrams) {
    const base = gitShow(workspace.root, pack.change.baseCommit, item.path);
    const candidate = candidateBytes(pack, item);
    const record = {
      path: item.path,
      operation: item.operation,
      baseSha256: base ? sha256(base) : null,
      candidateSha256: candidate ? sha256(candidate) : null
    };
    files.push(record);
    const filePatch = unifiedDiff(item.path, base, candidate);
    if (filePatch) patch += `${patch ? "\n" : ""}${filePatch.trimEnd()}\n`;
  }
  const design = designDigest(workspace, pack);
  return { id, baseCommit: pack.change.baseCommit, designDigest: design.digest, files, patch };
}

export function renderChange(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  const pack = readPack(workspace, id);
  const validation = validatePack(workspace, pack, { plantUml: false });
  if (validation.diagnostics.some(isError)) throw operationError(`Change Pack 无法渲染：${id}`, validation.diagnostics);
  const records = pack.change.diagrams.filter((item) => item.operation !== "delete" && fs.existsSync(candidatePath(pack, item))).map((item) => ({
    path: item.path,
    relative: diagramRelative(item.path),
    content: candidateBytes(pack, item)
  }));
  const output = pack.renderedRoot;
  if (records.length === 0) {
    fs.rmSync(output, { recursive: true, force: true });
    return { id, output: relativePosix(workspace.root, output), rendered: [], diagnostics: [] };
  }
  const diagnostics = validateDiagramRecords(workspace.root, records, { syntax: false });
  const svgs = renderDiagramRecords(workspace.root, records, diagnostics);
  assertNoSymlinkPath(pack.root, output, `Change Pack ${id} rendered 目录`);
  replaceDirectoryAtomically(output, (temporary) => {
    records.forEach((record, index) => writeTreeFile(temporary, record.relative.replace(/\.puml$/i, ".svg"), svgs[index]));
  });
  return {
    id,
    output: relativePosix(workspace.root, output),
    rendered: records.map((record) => ({ source: itemCandidateRelative(pack, record.relative), output: relativePosix(workspace.root, path.join(output, record.relative.replace(/\.puml$/i, ".svg"))) })),
    diagnostics
  };
}

export function applyModel(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  const pack = readPack(workspace, id);
  const status = statusForPack(workspace, pack);
  if (!status.structurallyValid) throw operationError("Change Pack 存在结构或文件事实错误，不能提升候选模型。", status.diagnostics);
  if (status.designApproval.state !== "current") throw new Error("只有当前有效的 design approval 才能提升候选模型。");
  if (isPackPromoted(pack)) throw new Error("当前 Change Pack 的候选模型已经提升。无需重复执行 apply-model。");
  const missingCandidates = pack.change.diagrams.filter((item) => item.operation !== "delete" && !fs.existsSync(candidatePath(pack, item))).map((item) => item.path);
  if (missingCandidates.length > 0) throw new Error(`候选 overlay 不完整，无法提升：${missingCandidates.join("、")}`);
  const changed = changedPaths(workspace.root);
  const disallowed = changed.filter((file) => !isActivePackPath(workspace, file) && file !== PRINCIPLES_RELATIVE_PATH);
  if (disallowed.length > 0) throw new Error(`apply-model 前不得有实现代码或顶层模型变化；请先处理：${disallowed.join("、")}`);

  const candidateRoot = pack.diagramsRoot;
  const backup = `${candidateRoot}.${process.pid}.${Date.now()}.apply`;
  if (fs.existsSync(candidateRoot)) fs.renameSync(candidateRoot, backup);
  try {
    replaceDirectoryAtomically(workspace.diagramsRoot, (temporary) => {
      copyTree(workspace.diagramsRoot, temporary);
      for (const item of pack.change.diagrams) {
        const target = path.join(temporary, diagramRelative(item.path));
        if (item.operation === "delete") fs.rmSync(target, { force: true });
        else {
          const source = path.join(backup, diagramRelative(item.path));
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.copyFileSync(source, target);
        }
      }
      pruneEmptyDirectories(temporary);
      const keepFile = path.join(temporary, ".gitkeep");
      const hasModelFiles = discoverTreeFiles(temporary).some((file) => file !== keepFile);
      if (hasModelFiles) fs.rmSync(keepFile, { force: true });
      else if (!fs.existsSync(keepFile)) fs.writeFileSync(keepFile, "");
    });
  } catch (error) {
    if (fs.existsSync(backup) && !fs.existsSync(candidateRoot)) fs.renameSync(backup, candidateRoot);
    throw error;
  }
  fs.rmSync(backup, { recursive: true, force: true });
  fs.rmSync(pack.renderedRoot, { recursive: true, force: true });
  const current = statusForPack(workspace, readPack(workspace, id));
  if (current.designApproval.state !== "current") throw new Error("候选提升后设计摘要不一致；请勿提交并检查工作区。");
  return { id, applied: pack.change.diagrams.map(({ path: diagramPath, operation }) => ({ path: diagramPath, operation })), designDigest: current.designApproval.digest };
}

export function recordApproval(cwd, id, stage, reviewer) {
  if (!new Set(["design", "completion"]).has(stage)) throw new Error("审批阶段必须为 design 或 completion。");
  if (!reviewer?.trim()) throw new Error("--reviewer 必须是非空的人类审查者名称。");
  const workspace = requireProtocolWorkspace(cwd);
  const pack = readPack(workspace, id);
  return stage === "design" ? recordDesignApproval(workspace, pack, reviewer.trim()) : recordCompletionApproval(workspace, pack, reviewer.trim());
}

export function changeEvidence(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  const pack = readPack(workspace, id);
  const status = statusForPack(workspace, pack);
  const modelCommit = findModelCommit(workspace, pack, status.designApproval.digest);
  if (!modelCommit) throw new Error("尚未找到包含当前设计批准记录的 model-only commit。");
  return {
    id,
    baseCommit: pack.change.baseCommit,
    modelCommit,
    currentHead: workspace.head,
    designApproval: status.designApproval,
    commits: commitsBetween(workspace.root, modelCommit, workspace.head),
    changedFiles: changedFilesBetween(workspace.root, modelCommit, workspace.head),
    tasks: parseTasks(pack.text.tasks),
    acceptanceResults: parseVerification(pack.text.verification).acceptanceResults
  };
}

export function archiveChange(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  const pack = readPack(workspace, id);
  const status = statusForPack(workspace, pack);
  if (status.completionApproval.state !== "current") throw new Error("只有当前有效的 completion approval 才能归档。");
  const allowed = new Set([relativePosix(workspace.root, pack.paths.approval)]);
  const unrelated = changedPaths(workspace.root).filter((file) => !allowed.has(file));
  if (unrelated.length > 0) throw new Error(`归档前只允许 approval.yaml 成为工作区变化；请先处理：${unrelated.join("、")}`);
  if (workspace.head !== status.completionApproval.implementationCommit) throw new Error("HEAD 已偏离完成批准绑定的实现 commit，必须重新验收。");
  const date = status.completionApproval.recordedAt.slice(0, 10);
  fs.mkdirSync(workspace.archiveRoot, { recursive: true });
  const target = path.join(workspace.archiveRoot, `${date}-${id}`);
  assertNoSymlinkPath(workspace.changesRoot, workspace.archiveRoot, "Change Pack archive 目录");
  if (fs.existsSync(target)) throw new Error(`归档目标已存在：${relativePosix(workspace.root, target)}`);
  fs.renameSync(pack.root, target);
  return { id, archivedPath: relativePosix(workspace.root, target), completionDigest: status.completionApproval.digest };
}

function recordDesignApproval(workspace, pack, reviewer) {
  const validation = validatePack(workspace, pack, { plantUml: true, gate: "design" });
  if (validation.diagnostics.some(isError)) throw operationError("尚不满足设计批准的机械前置条件。", validation.diagnostics);
  const allowed = allowedDesignPaths(workspace, pack);
  const unrelated = changedPaths(workspace.root).filter((file) => !allowed.has(file));
  if (unrelated.length > 0) throw new Error(`设计批准只允许当前 Change Pack、项目原则和声明的图成为工作区变化；请先处理：${unrelated.join("、")}`);
  const design = designDigest(workspace, pack);
  const approval = readApproval(pack.paths.approval);
  const existing = approval.design.at(-1);
  if (existing?.digest === design.digest) throw new Error("当前设计摘要已经记录过批准，无需重复记录。");
  const record = { reviewer, recordedAt: new Date().toISOString(), digest: design.digest, baseCommit: pack.change.baseCommit, artifacts: design.artifacts };
  approval.design.push(record);
  atomicWrite(pack.paths.approval, stringifyYaml(approval, { lineWidth: 0 }));
  return { id: pack.id, stage: "design", reviewer, digest: design.digest, recordedAt: record.recordedAt };
}

function recordCompletionApproval(workspace, pack, reviewer) {
  requireCleanWorktree(workspace.root, "记录完成批准前，任务与验证证据必须已提交且工作区干净。");
  const status = statusForPack(workspace, pack);
  if (status.designApproval.state !== "current") throw new Error("当前设计批准缺失或已失效。");
  const modelCommit = findModelCommit(workspace, pack, status.designApproval.digest);
  if (!modelCommit || !isAncestor(workspace.root, modelCommit, workspace.head)) throw new Error("当前设计批准尚未形成可追溯的 model-only commit。");
  const completionDiagnostics = validatePack(workspace, pack, { plantUml: true, gate: "completion" }).diagnostics;
  if (completionDiagnostics.some(isError)) throw operationError("尚不满足完成批准的机械前置条件。", completionDiagnostics);
  const verification = parseVerification(pack.text.verification);
  if (verification.designDigest !== status.designApproval.digest) throw new Error("verification.md 绑定的 design digest 不是当前批准摘要。");
  const reviewedImplementationCommit = gitRef(workspace.root, verification.implementationCommit ?? "");
  if (!reviewedImplementationCommit || reviewedImplementationCommit !== verification.implementationCommit || !isAncestor(workspace.root, reviewedImplementationCommit, workspace.head)) {
    throw new Error("verification.md 必须绑定当前 HEAD 的一个有效实现祖先 commit。");
  }
  const evidenceOnly = new Set([pack.relative.tasks, pack.relative.verification]);
  const postImplementationChanges = changedFilesBetween(workspace.root, reviewedImplementationCommit, workspace.head).map((item) => item.path).filter((file) => !evidenceOnly.has(file));
  if (postImplementationChanges.length > 0) throw new Error(`实现 commit 之后只允许提交 tasks.md 和 verification.md 证据；发现：${postImplementationChanges.join("、")}`);
  const tasksSha256 = sha256(fs.readFileSync(pack.paths.tasks));
  const verificationSha256 = sha256(fs.readFileSync(pack.paths.verification));
  const digest = completionDigest({ designDigest: status.designApproval.digest, implementationCommit: workspace.head, tasksSha256, verificationSha256 });
  const approval = readApproval(pack.paths.approval);
  if (approval.completion.at(-1)?.digest === digest) throw new Error("当前完成摘要已经记录过批准，无需重复记录。");
  const record = { reviewer, recordedAt: new Date().toISOString(), digest, designDigest: status.designApproval.digest, implementationCommit: workspace.head, reviewedImplementationCommit, tasksSha256, verificationSha256 };
  approval.completion.push(record);
  atomicWrite(pack.paths.approval, stringifyYaml(approval, { lineWidth: 0 }));
  return { id: pack.id, stage: "completion", reviewer, digest, implementationCommit: workspace.head, recordedAt: record.recordedAt };
}

function validatePack(workspace, pack, options = {}) {
  const diagnostics = [...pack.diagnostics];
  validateManifest(workspace, pack, diagnostics);
  diagnostics.push(...validateApprovalValue(pack.approval, pack.relative.approval));
  validateMarkdown(pack, diagnostics, options.gate);
  validateOverlaps(workspace, pack, diagnostics);
  validateDeclaredWorktreeDiagrams(workspace, diagnostics);
  const records = [];
  if (pack.change?.diagrams) {
    for (const item of pack.change.diagrams) {
      if (!item || typeof item.path !== "string" || !OPERATIONS.has(item.operation)) continue;
      if (item.operation === "delete") continue;
      const current = candidatePath(pack, item);
      const promoted = path.join(workspace.root, item.path);
      const source = fs.existsSync(current) ? current : promoted;
      if (fs.existsSync(source) && !fs.lstatSync(source).isSymbolicLink() && fs.statSync(source).isFile()) records.push({ path: item.path, content: fs.readFileSync(source) });
    }
  }
  if (!diagnostics.some(isError)) diagnostics.push(...validateDiagramRecords(workspace.root, records, { syntax: options.plantUml === true }));
  return {
    artifacts: { present: PACK_FILES.filter((file) => fs.existsSync(path.join(pack.root, file))).length, required: PACK_FILES.length },
    plantUml: { checked: options.plantUml === true, valid: options.plantUml === true ? !diagnostics.some(isError) : null },
    openQuestions: parseOpenQuestions(pack.text.proposal),
    tasks: taskSummary(parseTasks(pack.text.tasks)),
    acceptance: verificationSummary(parseVerification(pack.text.verification), parseAcceptanceCriteria(pack.text.proposal)),
    diagnostics: diagnostics.sort(compareDiagnostics)
  };
}

function validateManifest(workspace, pack, diagnostics) {
  const change = pack.change;
  if (!change || typeof change !== "object" || Array.isArray(change)) return;
  rejectUnknownKeys(change, CHANGE_KEYS, pack.relative.change, diagnostics);
  if (change.schemaVersion !== SCHEMA_VERSION) diagnostics.push(diag("CHANGE_SCHEMA_VERSION", pack.relative.change, "change.yaml schemaVersion 必须为 1。"));
  if (change.workflowProtocol !== WORKFLOW_PROTOCOL) diagnostics.push(diag("CHANGE_WORKFLOW_PROTOCOL", pack.relative.change, `change.yaml workflowProtocol 必须为 ${WORKFLOW_PROTOCOL}。`));
  if (change.id !== pack.id || !validChangeId(change.id)) diagnostics.push(diag("CHANGE_ID_INVALID", pack.relative.change, "change.yaml id 必须与目录名一致，并使用最长 64 字符的小写 kebab-case。"));
  if (typeof change.baseCommit !== "string" || !FULL_COMMIT.test(change.baseCommit) || gitRef(workspace.root, change.baseCommit) !== change.baseCommit) diagnostics.push(diag("BASE_COMMIT_INVALID", pack.relative.change, "baseCommit 必须是仓库中存在的完整 commit。"));
  if (typeof change.createdAt !== "string" || Number.isNaN(Date.parse(change.createdAt)) || new Date(change.createdAt).toISOString() !== change.createdAt) diagnostics.push(diag("CREATED_AT_INVALID", pack.relative.change, "createdAt 必须是 UTC ISO-8601 时间。"));
  if (!Array.isArray(change.diagrams) || change.diagrams.length === 0) {
    diagnostics.push(diag("DIAGRAMS_REQUIRED", pack.relative.change, "每个 Change Pack 至少声明一张 PlantUML 图。"));
    return;
  }
  const seen = new Set();
  change.diagrams.forEach((item, index) => {
    const file = `${pack.relative.change}:diagrams[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) { diagnostics.push(diag("DIAGRAM_ENTRY_INVALID", file, "diagram 条目必须是对象。")); return; }
    rejectUnknownKeys(item, DIAGRAM_KEYS, file, diagnostics);
    if (!validDiagramPath(item.path)) diagnostics.push(diag("DIAGRAM_PATH_INVALID", file, `图路径必须位于 ${DIAGRAMS_RELATIVE_PATH} 且以 .puml 结尾。`));
    if (!OPERATIONS.has(item.operation)) diagnostics.push(diag("DIAGRAM_OPERATION_INVALID", file, "operation 必须为 add、modify 或 delete。"));
    if (seen.has(item.path)) diagnostics.push(diag("DIAGRAM_DUPLICATE", file, `重复声明图路径：${item.path}`));
    seen.add(item.path);
    if (!validDiagramPath(item.path) || !OPERATIONS.has(item.operation) || !FULL_COMMIT.test(change.baseCommit ?? "")) return;
    validateDiagramOperation(workspace, pack, change.baseCommit, item, file, diagnostics);
  });
}

function validateDiagramOperation(workspace, pack, baseCommit, item, file, diagnostics) {
  const base = gitShow(workspace.root, baseCommit, item.path);
  const overlayPath = candidatePath(pack, item);
  let overlayExists = fs.existsSync(overlayPath) && fs.statSync(overlayPath).isFile();
  if (overlayExists) {
    try { assertNoSymlinkPath(pack.diagramsRoot, overlayPath, item.path); }
    catch (error) {
      diagnostics.push(diag("DIAGRAM_SYMLINK", file, error.message));
      overlayExists = false;
    }
  }
  const overlay = overlayExists ? fs.readFileSync(overlayPath) : null;
  const canonicalPath = path.join(workspace.root, item.path);
  const canonical = fs.existsSync(canonicalPath) && fs.statSync(canonicalPath).isFile() ? fs.readFileSync(canonicalPath) : null;
  const promoted = !overlayExists && approvalBindsCandidate(pack, item, canonical);
  const correct = item.operation === "add" ? !base && ((!!overlay && !canonical) || (promoted && !!canonical))
    : item.operation === "modify" ? !!base && ((!!overlay && !base.equals(overlay) && !!canonical && base.equals(canonical)) || (promoted && !!canonical && !base.equals(canonical)))
      : !!base && !overlay && ((!!canonical && base.equals(canonical)) || (promoted && !canonical));
  if (!correct) diagnostics.push(diag("DIAGRAM_OPERATION_MISMATCH", file, `${item.operation} 与 baseCommit、候选 overlay 和已批准模型的文件事实不一致：${item.path}`));
}

function validateDeclaredWorktreeDiagrams(workspace, diagnostics) {
  for (const file of changedPaths(workspace.root)) {
    if (!file.startsWith(`${DIAGRAMS_RELATIVE_PATH}/`) || !file.endsWith(".puml")) continue;
    if (isApprovedCanonicalChange(workspace, file)) continue;
    diagnostics.push(diag("UNAPPROVED_CANONICAL_DIAGRAM_CHANGE", file, "顶层 diagrams 只保存已批准模型；未批准候选必须位于 Change Pack 的 diagrams overlay。"));
  }
}

function isApprovedCanonicalChange(workspace, canonicalPath) {
  for (const id of listActiveChangeIds(workspace)) {
    let pack;
    try { pack = readPack(workspace, id); } catch { continue; }
    const item = pack.change?.diagrams?.find((entry) => entry?.path === canonicalPath);
    if (!item) continue;
    const record = pack.approval?.design?.at(-1);
    if (!record || record.digest !== designDigest(workspace, pack).digest) continue;
    const target = path.join(workspace.root, canonicalPath);
    const bytes = fs.existsSync(target) && fs.statSync(target).isFile() ? fs.readFileSync(target) : null;
    if (approvalBindsCandidate(pack, item, bytes)) return true;
  }
  return false;
}

function validateMarkdown(pack, diagnostics, gate) {
  requireHeadings(pack.text.proposal, ["Problem And Evidence", "Goals", "Non-goals", "Acceptance Criteria", "Assumptions", "Open Questions"], pack.relative.proposal, diagnostics);
  requireHeadings(pack.text.decisions, ["Context", "Decision", "Alternatives", "Consequences"], pack.relative.decisions, diagnostics, 3);
  requireHeadings(pack.text.verification, ["Evidence", "Acceptance Results", "Semantic Review", "Residual Risks"], pack.relative.verification, diagnostics);
  const criteria = parseAcceptanceCriteria(pack.text.proposal);
  reportDuplicateIds(criteria, "AC_DUPLICATE", pack.relative.proposal, diagnostics);
  if (criteria.length === 0) diagnostics.push(diag("AC_REQUIRED", pack.relative.proposal, "proposal.md 至少需要一个 AC-001 格式的验收标准。"));
  const decisions = parseDecisionBlocks(pack.text.decisions);
  if (decisions.length === 0) diagnostics.push(diag("DECISION_ID_REQUIRED", pack.relative.decisions, "decisions.md 至少需要一个 D001 格式的决策。"));
  reportDuplicateIds(decisions.map((item) => item.id), "DECISION_DUPLICATE", pack.relative.decisions, diagnostics);
  for (const decision of decisions) requireHeadings(decision.source, ["Context", "Decision", "Alternatives", "Consequences"], `${pack.relative.decisions}#${decision.id}`, diagnostics, 3);
  const tasks = parseTasks(pack.text.tasks);
  reportDuplicateIds(tasks.map((item) => item.id), "TASK_DUPLICATE", pack.relative.tasks, diagnostics);
  if (tasks.length === 0) diagnostics.push(diag("TASK_REQUIRED", pack.relative.tasks, "tasks.md 至少需要一个 T001 [AC-001] 格式的任务。"));
  const criterionSet = new Set(criteria);
  for (const task of tasks) for (const reference of task.acceptanceCriteria) if (!criterionSet.has(reference)) diagnostics.push(diag("TASK_AC_UNKNOWN", pack.relative.tasks, `${task.id} 引用了不存在的 ${reference}。`));
  const verification = parseVerification(pack.text.verification);
  reportDuplicateIds(verification.acceptanceResults.map((item) => item.id), "VERIFICATION_AC_DUPLICATE", pack.relative.verification, diagnostics);
  for (const result of verification.acceptanceResults) if (!criterionSet.has(result.id)) diagnostics.push(diag("VERIFICATION_AC_UNKNOWN", pack.relative.verification, `verification.md 引用了不存在的 ${result.id}。`));
  if (gate === "design") {
    for (const [file, source] of [[PRINCIPLES_RELATIVE_PATH, fs.readFileSync(pack.workspace.principlesPath, "utf8")], [pack.relative.proposal, pack.text.proposal], [pack.relative.decisions, pack.text.decisions], [pack.relative.tasks, pack.text.tasks]]) {
      if (source.includes("[TODO")) diagnostics.push(diag("PLACEHOLDER_REMAINING", file, "设计批准前必须清除所有 [TODO] 占位内容。"));
    }
    const questions = parseOpenQuestions(pack.text.proposal);
    if (questions.open > 0) diagnostics.push(diag("OPEN_QUESTIONS_REMAIN", pack.relative.proposal, `设计批准前必须解决全部未决问题；当前还有 ${questions.open} 项。`));
  }
  if (gate === "completion") {
    if (tasks.some((task) => !task.completed)) diagnostics.push(diag("TASKS_INCOMPLETE", pack.relative.tasks, "完成批准前所有任务必须勾选完成。"));
    const byId = new Map(verification.acceptanceResults.map((item) => [item.id, item.status]));
    for (const criterion of criteria) if (byId.get(criterion) !== "PASS") diagnostics.push(diag("AC_NOT_PASS", pack.relative.verification, `${criterion} 必须具有 PASS 验证结果。`));
    if (verification.semanticReview !== "pass") diagnostics.push(diag("SEMANTIC_REVIEW_NOT_PASS", pack.relative.verification, "AI semantic review 必须显式声明为 pass。"));
    if (pack.text.verification.includes("[TODO")) diagnostics.push(diag("PLACEHOLDER_REMAINING", pack.relative.verification, "完成批准前必须清除 verification.md 中的 [TODO]。"));
  }
}

function validateOverlaps(workspace, selected, diagnostics) {
  const selectedPaths = new Set(selected.change?.diagrams?.map((item) => item?.path).filter(Boolean) ?? []);
  for (const id of listActiveChangeIds(workspace)) {
    if (id === selected.id) continue;
    let other;
    try { other = readPack(workspace, id); } catch { continue; }
    for (const item of other.change?.diagrams ?? []) if (selectedPaths.has(item?.path)) diagnostics.push(diag("DIAGRAM_CHANGE_CONFLICT", selected.relative.change, `${item.path} 同时被活动 Change Pack ${id} 声明。`));
  }
}

function statusForPack(workspace, pack) {
  const validation = validatePack(workspace, pack, { plantUml: false });
  const design = pack.change ? designDigest(workspace, pack) : { digest: null };
  const approval = safeApproval(pack);
  const designRecord = approval.design.at(-1) ?? null;
  const designState = !designRecord ? "missing" : designRecord.digest === design.digest ? "current" : "stale";
  const modelApplied = isPackPromoted(pack);
  const modelCommit = designState === "current" && modelApplied ? findModelCommit(workspace, pack, design.digest) : null;
  const tasks = parseTasks(pack.text.tasks);
  const verification = parseVerification(pack.text.verification);
  const completionRecord = approval.completion.at(-1) ?? null;
  const tasksSha256 = fileShaOrNull(pack.paths.tasks);
  const verificationSha256 = fileShaOrNull(pack.paths.verification);
  const currentCompletionDigest = designState === "current"
    ? completionDigest({ designDigest: design.digest, implementationCommit: workspace.head, tasksSha256, verificationSha256 })
    : null;
  const completionState = !completionRecord ? "missing" : completionRecord.digest === currentCompletionDigest ? "current" : "stale";
  const changed = changedPaths(workspace.root);
  const archiveWorktreeAllowed = changed.every((file) => file === pack.relative.approval);
  return {
    id: pack.id,
    baseCommit: pack.change?.baseCommit ?? null,
    head: workspace.head,
    worktree: changed.length === 0 ? "clean" : "dirty",
    artifacts: validation.artifacts,
    structurallyValid: !validation.diagnostics.some(isError),
    plantUml: validation.plantUml,
    diagnostics: validation.diagnostics,
    openQuestions: validation.openQuestions,
    tasks: taskSummary(tasks),
    verification: { semanticReview: verification.semanticReview, acceptance: validation.acceptance },
    designApproval: { state: designState, digest: design.digest, reviewer: designRecord?.reviewer ?? null, recordedAt: designRecord?.recordedAt ?? null, modelApplied, modelCommit },
    completionApproval: { state: completionState, digest: completionRecord?.digest ?? null, reviewer: completionRecord?.reviewer ?? null, recordedAt: completionRecord?.recordedAt ?? null, implementationCommit: completionRecord?.implementationCommit ?? null },
    archiveEligible: completionState === "current" && workspace.head === completionRecord?.implementationCommit && archiveWorktreeAllowed
  };
}

function summarizePack(workspace, pack) {
  const status = statusForPack(workspace, pack);
  return { id: status.id, designApproval: status.designApproval.state, completionApproval: status.completionApproval.state, tasks: status.tasks, archiveEligible: status.archiveEligible };
}

function readPack(workspace, id) {
  validateChangeId(id);
  const root = path.join(workspace.changesRoot, id);
  if (!fs.existsSync(root) || fs.lstatSync(root).isSymbolicLink() || !fs.statSync(root).isDirectory()) throw new Error(`找不到活动 Change Pack：${id}`);
  assertNoSymlinkPath(workspace.changesRoot, root, `Change Pack ${id}`);
  const paths = Object.fromEntries(PACK_FILES.map((file) => [fileKey(file), path.join(root, file)]));
  const relative = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, relativePosix(workspace.root, file)]));
  const diagnostics = [];
  const diagramsRoot = path.join(root, "diagrams");
  const renderedRoot = path.join(root, "rendered");
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const relativeEntry = relativePosix(workspace.root, path.join(root, entry.name));
    if (entry.isSymbolicLink()) diagnostics.push(diag("ARTIFACT_SYMLINK", relativeEntry, "Change Pack 固定资产不得是符号链接。"));
    else if (entry.isDirectory() && new Set(["diagrams", "rendered"]).has(entry.name)) validatePackTree(path.join(root, entry.name), entry.name, relativeEntry, diagnostics);
    else if (!entry.isFile() || !PACK_FILES.includes(entry.name)) diagnostics.push(diag("ARTIFACT_UNKNOWN", relativeEntry, "Change Pack 只允许六个固定协议文件以及可选 diagrams/rendered 目录。"));
  }
  for (const file of PACK_FILES) {
    const target = path.join(root, file);
    if (!fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isFile()) diagnostics.push(diag("ARTIFACT_REQUIRED", relativePosix(workspace.root, target), `缺少固定 Change Pack 文件：${file}`));
  }
  let change = null;
  if (isProtocolFile(paths.change)) change = parseYaml(paths.change, diagnostics, "CHANGE_YAML_INVALID");
  let approval = null;
  if (isProtocolFile(paths.approval)) approval = parseYaml(paths.approval, diagnostics, "APPROVAL_YAML_INVALID");
  const text = {
    proposal: readText(paths.proposal), decisions: readText(paths.decisions), tasks: readText(paths.tasks), verification: readText(paths.verification)
  };
  const declared = new Set((change?.diagrams ?? []).filter((item) => validDiagramPath(item?.path) && item.operation !== "delete").map((item) => diagramRelative(item.path)));
  if (fs.existsSync(diagramsRoot)) {
    for (const file of discoverTreeFiles(diagramsRoot)) {
      const relativeDiagram = relativePosix(diagramsRoot, file);
      if (relativeDiagram !== ".gitkeep" && !declared.has(relativeDiagram)) diagnostics.push(diag("UNDECLARED_CANDIDATE_DIAGRAM", relativePosix(workspace.root, file), "Change Pack diagrams 中的 .puml 必须由 change.yaml 声明，delete 不得保留候选文件。"));
    }
  }
  return { id, root, diagramsRoot, renderedRoot, workspace, paths, relative, diagnostics, change, approval, text };
}

function parseYaml(file, diagnostics, code) {
  try {
    const document = parseDocument(fs.readFileSync(file, "utf8"), { uniqueKeys: true, maxAliasCount: 0, prettyErrors: true });
    if (document.errors.length > 0) throw new Error(document.errors.map((error) => error.message).join("; "));
    return document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    diagnostics.push(diag(code, file, error.message));
    return null;
  }
}

function safeApproval(pack) {
  return safeApprovalFile(pack.paths.approval);
}

function designDigest(workspace, pack) {
  const artifacts = [PRINCIPLES_RELATIVE_PATH, pack.relative.change, pack.relative.proposal, pack.relative.decisions].map((artifactPath) => ({
    path: artifactPath,
    sha256: fileShaOrNull(path.join(workspace.root, artifactPath))
  }));
  for (const item of pack.change?.diagrams ?? []) {
    if (!validDiagramPath(item?.path)) continue;
    const bytes = candidateBytes(pack, item);
    artifacts.push({ path: item.path, sha256: bytes ? sha256(bytes) : null });
  }
  return designDigestFromArtifacts(pack.change?.baseCommit ?? null, artifacts);
}

function findModelCommit(workspace, pack, designDigestValue) {
  return findApprovalCommit(workspace.root, pack.relative.approval, designDigestValue, allowedDesignPaths(workspace, pack));
}

function allowedDesignPaths(workspace, pack) {
  const allowed = new Set([PRINCIPLES_RELATIVE_PATH, `${DIAGRAMS_RELATIVE_PATH}/.gitkeep`]);
  for (const file of PACK_FILES) allowed.add(relativePosix(workspace.root, path.join(pack.root, file)));
  for (const item of pack.change?.diagrams ?? []) if (validDiagramPath(item?.path)) {
    allowed.add(item.path);
    allowed.add(relativePosix(workspace.root, candidatePath(pack, item)));
  }
  return allowed;
}

function listActiveChangeIds(workspace) {
  if (!fs.existsSync(workspace.changesRoot)) return [];
  const ids = [];
  for (const entry of fs.readdirSync(workspace.changesRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    if (entry.name === "archive" || entry.name === ".gitkeep") continue;
    if (entry.isSymbolicLink()) throw new Error(`Change Pack 不得是符号链接：${entry.name}`);
    if (entry.isDirectory()) ids.push(entry.name);
    else throw new Error(`无法识别的 Change Pack 路径：${entry.name}`);
  }
  return ids;
}

function findArchivedChange(archiveRoot, id) {
  if (!fs.existsSync(archiveRoot)) return null;
  return fs.readdirSync(archiveRoot).find((name) => name === id || name.endsWith(`-${id}`)) ?? null;
}

function parseAcceptanceCriteria(source) {
  return [...source.matchAll(/^\s*-\s+(AC-\d{3}):\s+\S.*$/gm)].map((match) => match[1]);
}

function parseDecisionBlocks(source) {
  const matches = [...source.matchAll(/^## (D\d{3}):\s+\S.*$/gm)];
  return matches.map((match, index) => ({ id: match[1], source: source.slice(match.index, matches[index + 1]?.index ?? source.length) }));
}

function parseOpenQuestions(source) {
  const items = [...source.matchAll(/^\s*-\s+\[([ xX])\]\s+(Q\d{3}):\s+\S.*$/gm)].map((match) => ({ id: match[2], resolved: match[1].toLowerCase() === "x" }));
  return { open: items.filter((item) => !item.resolved).length, total: items.length };
}

function parseTasks(source) {
  return [...source.matchAll(/^\s*-\s+\[([ xX])\]\s+(T\d{3})\s+\[((?:AC-\d{3})(?:\s*,\s*AC-\d{3})*)\]\s+\S.*$/gm)].map((match) => ({ id: match[2], completed: match[1].toLowerCase() === "x", acceptanceCriteria: match[3].split(/\s*,\s*/) }));
}

function parseVerification(source) {
  const acceptanceResults = [...source.matchAll(/^\s*-\s+(AC-\d{3}):\s+(PASS|FAIL|NOT-RUN)\s+-\s+\S.*$/gm)].map((match) => ({ id: match[1], status: match[2] }));
  return {
    semanticReview: source.match(/<!--\s*arch-lens:\s*semantic-review=(pass|concerns|fail|pending)\s*-->/i)?.[1].toLowerCase() ?? "missing",
    designDigest: source.match(/<!--\s*arch-lens:\s*design-digest=([0-9a-f]{64}|pending)\s*-->/i)?.[1] ?? null,
    implementationCommit: source.match(/<!--\s*arch-lens:\s*implementation-commit=([0-9a-f]{40,64}|pending)\s*-->/i)?.[1] ?? null,
    acceptanceResults
  };
}

function taskSummary(tasks) {
  return { completed: tasks.filter((task) => task.completed).length, total: tasks.length };
}

function verificationSummary(verification, criteria) {
  const byId = new Map(verification.acceptanceResults.map((item) => [item.id, item.status]));
  return { pass: criteria.filter((id) => byId.get(id) === "PASS").length, total: criteria.length };
}

function requireHeadings(source, headings, file, diagnostics, level = 2) {
  for (const heading of headings) if (!new RegExp(`^${"#".repeat(level)}\\s+${escapeRegExp(heading)}\\s*$`, "mi").test(source)) diagnostics.push(diag("SECTION_REQUIRED", file, `缺少固定章节：${heading}`));
}

function reportDuplicateIds(ids, code, file, diagnostics) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) diagnostics.push(diag(code, file, `重复标识：${id}`));
    seen.add(id);
  }
}

function rejectUnknownKeys(value, allowed, file, diagnostics) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) diagnostics.push(diag("UNKNOWN_SCHEMA_KEY", file, `不支持的字段：${key}`));
}

function validDiagramPath(value) {
  if (typeof value !== "string" || !value.startsWith(`${DIAGRAMS_RELATIVE_PATH}/`) || !value.endsWith(".puml") || value.includes("\\")) return false;
  const normalized = path.posix.normalize(value);
  return normalized === value && !value.split("/").includes("..");
}

function diagramRelative(canonicalPath) {
  return canonicalPath.slice(`${DIAGRAMS_RELATIVE_PATH}/`.length);
}

function candidatePath(pack, item) {
  return path.join(pack.diagramsRoot, diagramRelative(item.path));
}

function candidateBytes(pack, item) {
  if (item.operation === "delete") return null;
  const overlay = candidatePath(pack, item);
  if (fs.existsSync(overlay) && !fs.lstatSync(overlay).isSymbolicLink() && fs.statSync(overlay).isFile()) return fs.readFileSync(overlay);
  const canonical = path.join(pack.workspace.root, item.path);
  if (fs.existsSync(canonical) && !fs.lstatSync(canonical).isSymbolicLink() && fs.statSync(canonical).isFile()) return fs.readFileSync(canonical);
  return null;
}

function approvalBindsCandidate(pack, item, canonical) {
  const record = pack.approval?.design?.at(-1);
  if (!record?.artifacts) return false;
  const artifact = record.artifacts.find((entry) => entry?.path === item.path);
  return !!artifact && artifact.sha256 === (canonical ? sha256(canonical) : null);
}

function isPackPromoted(pack) {
  return (pack.change?.diagrams ?? []).every((item) => {
    const canonical = path.join(pack.workspace.root, item.path);
    const bytes = fs.existsSync(canonical) && fs.statSync(canonical).isFile() ? fs.readFileSync(canonical) : null;
    return approvalBindsCandidate(pack, item, bytes);
  });
}

function validatePackTree(root, kind, relativeRoot, diagnostics) {
  for (const file of discoverTreeFiles(root, diagnostics, relativeRoot)) {
    const relative = relativePosix(root, file);
    if (relative === ".gitkeep" && kind === "diagrams") continue;
    const valid = kind === "diagrams" ? relative.toLowerCase().endsWith(".puml") : relative.toLowerCase().endsWith(".svg");
    if (!valid) diagnostics.push(diag(kind === "diagrams" ? "CANDIDATE_FILE_INVALID" : "RENDERED_FILE_INVALID", `${relativeRoot}/${relative}`, `${kind} 目录只允许 ${kind === "diagrams" ? ".puml" : ".svg"} 文件。`));
  }
}

function discoverTreeFiles(root, diagnostics = null, relativeRoot = root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        diagnostics?.push(diag("ARTIFACT_SYMLINK", `${relativeRoot}/${relativePosix(root, target)}`, "Change Pack diagrams/rendered 不得包含符号链接。"));
      } else if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) files.push(target);
      else diagnostics?.push(diag("ARTIFACT_UNKNOWN", `${relativeRoot}/${relativePosix(root, target)}`, "Change Pack 不允许特殊文件。"));
    }
  };
  visit(root);
  return files;
}

function requireChangeCreationWorktree(workspace) {
  const changed = changedPaths(workspace.root);
  const disallowed = changed.filter((file) => !isActivePackPath(workspace, file));
  if (disallowed.length > 0) throw new Error(`创建 Change Pack 前只允许其他活动 Change Pack 存在未提交变化；请先处理：${disallowed.join("、")}`);
}

function isActivePackPath(workspace, file) {
  return listActiveChangeIds(workspace).some((id) => file === `${CHANGES_RELATIVE_PATH}/${id}` || file.startsWith(`${CHANGES_RELATIVE_PATH}/${id}/`));
}

function unifiedDiff(canonicalPath, base, candidate) {
  if ((base && candidate && base.equals(candidate)) || (!base && !candidate)) return "";
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arch-lens-diff-"));
  try {
    const before = path.join(temporary, "before");
    const after = path.join(temporary, "after");
    if (base) fs.writeFileSync(before, base);
    if (candidate) fs.writeFileSync(after, candidate);
    const result = git(temporary, ["diff", "--no-index", "--no-ext-diff", "--no-color", "--", base ? before : "/dev/null", candidate ? after : "/dev/null"]);
    if (![0, 1].includes(result.status)) throw new Error(`无法生成文本 diff：${canonicalPath}`);
    return result.stdout
      .replace(/^diff --git .*$/m, `diff --git a/${canonicalPath} b/${canonicalPath}`)
      .replace(/^--- .*$/m, base ? `--- a/${canonicalPath}` : "--- /dev/null")
      .replace(/^\+\+\+ .*$/m, candidate ? `+++ b/${canonicalPath}` : "+++ /dev/null");
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function itemCandidateRelative(pack, relative) {
  return relativePosix(pack.workspace.root, path.join(pack.diagramsRoot, relative));
}

function copyTree(source, target) {
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`已批准图集不得包含符号链接：${relativePosix(source, from)}`);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyTree(from, to);
    } else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function pruneEmptyDirectories(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = path.join(root, entry.name);
    pruneEmptyDirectories(target);
    if (fs.readdirSync(target).length === 0) fs.rmdirSync(target);
  }
}

function validateChangeId(id) {
  if (!validChangeId(id)) throw new Error("Change ID 必须使用最长 64 字符的小写 kebab-case。");
}

function validChangeId(id) {
  return typeof id === "string" && id.length <= 64 && CHANGE_ID.test(id);
}

function fileKey(file) { return file.replace(/\.(?:yaml|md)$/, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); }
function isProtocolFile(file) { return fs.existsSync(file) && !fs.lstatSync(file).isSymbolicLink() && fs.statSync(file).isFile(); }
function readText(file) { return isProtocolFile(file) ? fs.readFileSync(file, "utf8") : ""; }
function fileShaOrNull(file) { return isProtocolFile(file) ? sha256(fs.readFileSync(file)) : null; }
function diag(code, file, message) { return diagnostic("error", code, typeof file === "string" && path.isAbsolute(file) ? file : file, null, message); }
function isError(item) { return item.severity === "error"; }
function compareDiagnostics(a, b) { return `${a.file ?? ""}:${a.line ?? 0}:${a.code}`.localeCompare(`${b.file ?? ""}:${b.line ?? 0}:${b.code}`, "en"); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
