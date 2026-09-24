import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument, stringify as stringifyYaml } from "yaml";
import {
  completionDigest,
  designDigestFromArtifacts,
  emptyApproval,
  readApproval,
  validateApprovalValue
} from "./approval.js";
import {
  CHANGES_RELATIVE_PATH,
  DIAGRAMS_RELATIVE_PATH,
  PRINCIPLES_RELATIVE_PATH,
  RENDERED_RELATIVE_PATH,
  SCHEMA_VERSION,
  WORKFLOW_PROTOCOL,
  assertNoSymlinkPath,
  atomicWrite,
  diagnostic,
  operationError,
  relativePosix,
  replaceDirectoryAtomically,
  sha256,
  stableJson,
  writeTreeFile
} from "./core.js";
import { requireProtocolWorkspace } from "./repository.js";
import {
  discoverDiagrams,
  inspectDiagramRecords,
  renderDiagramRecords,
  validateDiagramRecordsWithFacts,
  validateSvgMirror
} from "./plantuml.js";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateRoot = path.join(moduleRoot, "templates", "change-pack");
const CHANGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const OPERATIONS = new Set(["add", "modify", "delete"]);
const PACK_FILES = ["change.yaml", "proposal.md", "decisions.md", "tasks.md", "approval.yaml", "verification.md"];
const CHANGE_KEYS = new Set(["schemaVersion", "workflowProtocol", "id", "baselineDigest", "baselineArtifacts", "createdAt", "diagrams"]);
const DIAGRAM_KEYS = new Set(["path", "operation"]);

export function createChange(cwd, id) {
  validateChangeId(id);
  const workspace = requireProtocolWorkspace(cwd);
  requireNoActiveChange(workspace);
  const target = path.join(workspace.changesRoot, id);
  if (fs.existsSync(target)) throw new Error(`Change Pack 已存在：${id}`);
  if (findArchivedChange(workspace.archiveRoot, id)) throw new Error(`该 Change ID 已归档，不能重复使用：${id}`);

  const baseline = baselineSnapshot(workspace);
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    workflowProtocol: WORKFLOW_PROTOCOL,
    id,
    baselineDigest: baseline.digest,
    baselineArtifacts: baseline.artifacts,
    createdAt: new Date().toISOString(),
    diagrams: []
  };
  replaceDirectoryAtomically(target, (temporary) => {
    writeTreeFile(temporary, "change.yaml", stringifyYaml(manifest, { lineWidth: 0 }));
    for (const file of ["proposal.md", "decisions.md", "tasks.md", "verification.md"]) writeTreeFile(temporary, file, fs.readFileSync(path.join(templateRoot, file)));
    writeTreeFile(temporary, "approval.yaml", stringifyYaml(emptyApproval(), { lineWidth: 0 }));
    fs.mkdirSync(path.join(temporary, "diagrams"));
  });
  return { id, path: relativePosix(workspace.root, target), baselineDigest: baseline.digest, workflowProtocol: WORKFLOW_PROTOCOL };
}

export function changeStatus(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  requireSingleActiveChange(workspace, id);
  if (!id) return { workflowProtocol: WORKFLOW_PROTOCOL, changes: listActiveChangeIds(workspace).map((changeId) => summarizePack(workspace, readPack(workspace, changeId))) };
  return statusForPack(workspace, readPack(workspace, id));
}

export function validateChangeCommand(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  requireSingleActiveChange(workspace, id);
  const pack = readPack(workspace, id);
  const result = validatePack(workspace, pack, { plantUml: true });
  if (result.diagnostics.some(isError)) throw operationError(`Change Pack 校验失败：${id}`, result.diagnostics);
  return { id, valid: true, ...result };
}

export function diffChange(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  requireSingleActiveChange(workspace, id);
  const pack = readPack(workspace, id);
  const validation = validatePack(workspace, pack, { plantUml: false });
  if (validation.diagnostics.some(isError)) throw operationError(`Change Pack 无法生成 diff：${id}`, validation.diagnostics);
  const files = [];
  let patch = "";
  for (const item of pack.change.diagrams) {
    const base = item.operation === "add" ? null : canonicalBytes(workspace, item.path);
    const candidate = candidateBytes(pack, item);
    files.push({ path: item.path, operation: item.operation, baseSha256: base ? sha256(base) : null, candidateSha256: candidate ? sha256(candidate) : null });
    const filePatch = unifiedDiff(item.path, base, candidate);
    if (filePatch) patch += `${patch ? "\n" : ""}${filePatch}`;
  }
  const design = designDigest(workspace, pack);
  return { id, baselineDigest: pack.change.baselineDigest, designDigest: design.digest, files, patch };
}

export function renderChange(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  requireSingleActiveChange(workspace, id);
  const pack = readPack(workspace, id);
  const pendingOverlay = hasCandidateOverlay(pack);
  if (isPackPromoted(pack) && !pendingOverlay) throw new Error("候选模型已经提升，且当前没有新的候选 overlay，不能重复生成候选 SVG。");
  const records = candidateDiagramRecords(pack);
  const diagnostics = inspectDiagramRecords(records).diagnostics;
  if (diagnostics.some(isError)) throw operationError("候选 PlantUML 无法生成 SVG。", diagnostics.sort(compareDiagnostics));
  const svgs = renderDiagramRecords(workspace.root, records, diagnostics, { managedOnly: true, inspectPolicy: false });
  const output = pack.renderedRoot;
  assertNoSymlinkPath(pack.root, output, `Change Pack ${id} rendered 目录`);
  if (records.length === 0) {
    fs.rmSync(output, { recursive: true, force: true });
    return { id, output: relativePosix(workspace.root, output), rendered: [], source: inspectDiagramRecords(records).facts, svg: [], diagnostics };
  }
  replaceDirectoryAtomically(output, (temporary) => {
    records.forEach((record, index) => writeTreeFile(temporary, diagramRelative(record.path).replace(/\.puml$/i, ".svg"), svgs[index]));
  });
  const facts = records.map((record, index) => {
    const svgFile = path.join(output, diagramRelative(record.path).replace(/\.puml$/i, ".svg"));
    return { path: relativePosix(workspace.root, svgFile), sha256: sha256(svgs[index]) };
  });
  return {
    id,
    output: relativePosix(workspace.root, output),
    rendered: records.map((record) => ({ source: record.path, output: relativePosix(workspace.root, path.join(output, diagramRelative(record.path).replace(/\.puml$/i, ".svg"))) })),
    source: inspectDiagramRecords(records).facts,
    svg: facts,
    diagnostics
  };
}

export function refreshBaseline(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  requireSingleActiveChange(workspace, id);
  const pack = readPack(workspace, id);
  const promoted = isPackPromoted(pack);
  const pendingOverlay = hasCandidateOverlay(pack);
  const next = baselineSnapshot(workspace);
  const freshness = baselineFreshness(workspace, pack, promoted, next, pendingOverlay);
  if (freshness.state === "current") {
    throw new Error(promoted
      ? "候选模型已提升，当前基线相对本次变更没有外部内容变化，无需刷新。"
      : "baselineDigest 已经与当前 principles 和 canonical .puml 一致，无需刷新。");
  }
  const previousBaselineDigest = pack.change?.baselineDigest ?? null;
  const declared = new Set((pack.change?.diagrams ?? []).map((item) => item?.path));
  const changedBaselinePaths = pendingOverlay
    ? freshness.changedPaths
    : freshness.changedPaths.filter((file) => !promoted || !declared.has(file));
  atomicWrite(pack.paths.change, stringifyYaml({ ...pack.change, baselineDigest: next.digest, baselineArtifacts: next.artifacts }, { lineWidth: 0 }));
  return { id, previousBaselineDigest, baselineDigest: next.digest, changedBaselinePaths, modelApplied: promoted, designApproval: "stale" };
}

export function applyModel(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  requireSingleActiveChange(workspace, id);
  const pack = readPack(workspace, id);
  const status = statusForPack(workspace, pack);
  if (!status.structurallyValid) throw operationError("Change Pack 存在结构或文件事实错误，不能提升候选模型。", status.diagnostics);
  if (status.designApproval.state !== "current") throw new Error("只有当前有效的 design approval 才能提升候选模型。");
  if (isPackPromoted(pack)) throw new Error("当前 Change Pack 的候选模型已经提升。无需重复执行 apply-model。");
  const missingCandidates = pack.change.diagrams.filter((item) => item.operation !== "delete" && !isRealFile(candidatePath(pack, item))).map((item) => item.path);
  if (missingCandidates.length > 0) throw new Error(`候选 overlay 不完整，无法提升：${missingCandidates.join("、")}`);

  applyModelAtomically(workspace, pack);
  const current = statusForPack(workspace, readPack(workspace, id));
  if (current.designApproval.state !== "current") throw new Error("候选提升后设计摘要不一致；请检查工作区。");
  return { id, applied: pack.change.diagrams.map(({ path: diagramPath, operation }) => ({ path: diagramPath, operation })), designDigest: current.designApproval.digest };
}

export function recordApproval(cwd, id, stage, reviewer) {
  if (!new Set(["design", "completion"]).has(stage)) throw new Error("审批阶段必须为 design 或 completion。");
  if (!reviewer?.trim()) throw new Error("--reviewer 必须是非空的人类审查者名称。");
  const workspace = requireProtocolWorkspace(cwd);
  requireSingleActiveChange(workspace, id);
  const pack = readPack(workspace, id);
  return stage === "design" ? recordDesignApproval(workspace, pack, reviewer.trim()) : recordCompletionApproval(workspace, pack, reviewer.trim());
}

export function changeEvidence(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  requireSingleActiveChange(workspace, id);
  const pack = readPack(workspace, id);
  const status = statusForPack(workspace, pack);
  return {
    id,
    baselineDigest: pack.change?.baselineDigest ?? null,
    designDigest: status.designApproval.digest,
    baseline: status.baseline,
    designApproval: status.designApproval,
    completionApproval: status.completionApproval,
    tasks: parseTasks(pack.text.tasks),
    acceptanceResults: parseVerification(pack.text.verification).acceptanceResults
  };
}

export function archiveChange(cwd, id) {
  const workspace = requireProtocolWorkspace(cwd);
  requireSingleActiveChange(workspace, id);
  const pack = readPack(workspace, id);
  const status = statusForPack(workspace, pack);
  if (status.completionApproval.state !== "current") throw new Error("只有当前有效的 completion approval 才能归档。");
  const date = status.completionApproval.recordedAt.slice(0, 10);
  const target = path.join(workspace.archiveRoot, `${date}-${id}`);
  fs.mkdirSync(workspace.archiveRoot, { recursive: true });
  assertNoSymlinkPath(workspace.changesRoot, workspace.archiveRoot, "Change Pack archive 目录");
  if (fs.existsSync(target)) throw new Error(`归档目标已存在：${relativePosix(workspace.root, target)}`);
  fs.renameSync(pack.root, target);
  return { id, archivedPath: relativePosix(workspace.root, target), completionDigest: status.completionApproval.digest };
}

function recordDesignApproval(workspace, pack, reviewer) {
  const validation = validatePack(workspace, pack, { plantUml: true, gate: "design" });
  if (validation.diagnostics.some(isError)) throw operationError("尚不满足设计批准的机械前置条件。", validation.diagnostics);
  const design = designDigest(workspace, pack);
  const approval = readApproval(pack.paths.approval);
  if (approval.design.at(-1)?.digest === design.digest) throw new Error("当前设计摘要已经记录过批准，无需重复记录。");
  const record = { reviewer, recordedAt: new Date().toISOString(), digest: design.digest, baselineDigest: pack.change.baselineDigest, artifacts: design.artifacts };
  approval.design.push(record);
  atomicWrite(pack.paths.approval, stringifyYaml(approval, { lineWidth: 0 }));
  return { id: pack.id, stage: "design", reviewer, digest: design.digest, recordedAt: record.recordedAt };
}

function recordCompletionApproval(workspace, pack, reviewer) {
  const status = statusForPack(workspace, pack);
  if (status.designApproval.state !== "current") throw new Error("当前设计批准缺失或已失效。");
  const completionDiagnostics = validatePack(workspace, pack, { plantUml: true, gate: "completion" }).diagnostics;
  if (completionDiagnostics.some(isError)) throw operationError("尚不满足完成批准的机械前置条件。", completionDiagnostics);
  const verification = parseVerification(pack.text.verification);
  if (verification.designDigest !== status.designApproval.digest) throw new Error("verification.md 绑定的 design digest 不是当前批准摘要。");
  const tasksSha256 = requiredFileSha(pack.paths.tasks);
  const verificationSha256 = requiredFileSha(pack.paths.verification);
  const digest = completionDigest({ designDigest: status.designApproval.digest, tasksSha256, verificationSha256 });
  const approval = readApproval(pack.paths.approval);
  if (approval.completion.at(-1)?.digest === digest) throw new Error("当前完成证据已经记录过批准，无需重复记录。");
  const record = { reviewer, recordedAt: new Date().toISOString(), digest, designDigest: status.designApproval.digest, tasksSha256, verificationSha256 };
  approval.completion.push(record);
  atomicWrite(pack.paths.approval, stringifyYaml(approval, { lineWidth: 0 }));
  return { id: pack.id, stage: "completion", reviewer, digest, designDigest: record.designDigest, recordedAt: record.recordedAt };
}

function validatePack(workspace, pack, options = {}) {
  const diagnostics = [...pack.diagnostics];
  validateManifest(workspace, pack, diagnostics);
  diagnostics.push(...validateApprovalValue(pack.approval, pack.relative.approval));
  validateMarkdown(pack, diagnostics, options.gate);
  const promoted = isPackPromoted(pack);
  const baseline = baselineFreshness(workspace, pack, promoted, null, hasCandidateOverlay(pack));
  if (baseline.state === "stale") diagnostics.push(diag("MODEL_BASELINE_STALE", pack.relative.change, baseline.message));
  const records = candidateDiagramRecords(pack);
  const diagramValidation = validateDiagramRecordsWithFacts(workspace.root, records, { syntax: options.plantUml === true && !diagnostics.some(isError) });
  if (!diagnostics.some(isError)) diagnostics.push(...diagramValidation.diagnostics);

  const reusableVisualEvidence = canReuseVisualEvidence(pack, records);
  const reuseVisualEvidence = options.gate === "design" && reusableVisualEvidence;
  let svg = { checked: false, valid: null, files: [], reused: reusableVisualEvidence };
  if (!diagnostics.some(isError) && ((options.gate === "design" && !reuseVisualEvidence) || fs.existsSync(pack.renderedRoot))) {
    const candidateMirror = validateSvgMirror(workspace.root, records.map((record) => ({
      ...record,
      svgFile: candidateSvgPath(pack, { path: record.path })
    })), { renderedRoot: pack.renderedRoot, fullMirror: true, inspectPolicy: false });
    if (options.gate === "design" && !reuseVisualEvidence) diagnostics.push(...candidateMirror.diagnostics);
    svg = { checked: true, valid: !candidateMirror.diagnostics.some(isError), files: candidateMirror.facts, reused: reusableVisualEvidence };
  }
  if (!diagnostics.some(isError) && reuseVisualEvidence) svg = { checked: true, valid: true, files: [], reused: true };
  return {
    artifacts: { present: PACK_FILES.filter((file) => isRealFile(path.join(pack.root, file))).length, required: PACK_FILES.length },
    plantUml: { checked: options.plantUml === true, valid: options.plantUml === true ? !diagnostics.some(isError) : null },
    baseline,
    source: diagramValidation.facts,
    svg,
    openQuestions: parseOpenQuestions(pack.text.proposal),
    tasks: taskSummary(parseTasks(pack.text.tasks)),
    acceptance: verificationSummary(parseVerification(pack.text.verification), parseAcceptanceCriteria(pack.text.proposal)),
    visualReview: visualReviewSummary(parseVisualReviews(pack.text.decisions), pack.change?.diagrams ?? []),
    diagnostics: diagnostics.sort(compareDiagnostics)
  };
}

function validateManifest(workspace, pack, diagnostics) {
  const change = pack.change;
  if (!change || typeof change !== "object" || Array.isArray(change)) return;
  rejectUnknownKeys(change, CHANGE_KEYS, pack.relative.change, diagnostics);
  if (change.schemaVersion !== SCHEMA_VERSION) diagnostics.push(diag("CHANGE_SCHEMA_VERSION", pack.relative.change, `change.yaml schemaVersion 必须为 ${SCHEMA_VERSION}。`));
  if (change.workflowProtocol !== WORKFLOW_PROTOCOL) diagnostics.push(diag("CHANGE_WORKFLOW_PROTOCOL", pack.relative.change, `change.yaml workflowProtocol 必须为 ${WORKFLOW_PROTOCOL}。`));
  if (change.id !== pack.id || !validChangeId(change.id)) diagnostics.push(diag("CHANGE_ID_INVALID", pack.relative.change, "change.yaml id 必须与目录名一致，并使用最长 64 字符的小写 kebab-case。"));
  if (!SHA256.test(change.baselineDigest ?? "")) diagnostics.push(diag("BASELINE_DIGEST_INVALID", pack.relative.change, "baselineDigest 必须是 SHA-256。"));
  if (!validArtifactList(change.baselineArtifacts)) diagnostics.push(diag("BASELINE_ARTIFACTS_INVALID", pack.relative.change, "baselineArtifacts 必须按路径排序并包含普通文件路径与 SHA-256。"));
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
    if (!validDiagramPath(item.path) || !OPERATIONS.has(item.operation)) return;
    validateDiagramOperation(workspace, pack, item, file, diagnostics);
  });
}

function validateDiagramOperation(workspace, pack, item, file, diagnostics) {
  const overlayPath = candidatePath(pack, item);
  let overlayExists = isRealFile(overlayPath);
  if (overlayExists) {
    try { assertNoSymlinkPath(pack.diagramsRoot, overlayPath, item.path); }
    catch (error) { diagnostics.push(diag("DIAGRAM_SYMLINK", file, error.message)); overlayExists = false; }
  }
  const overlay = overlayExists ? fs.readFileSync(overlayPath) : null;
  const canonical = canonicalBytes(workspace, item.path);
  const promoted = !overlayExists && approvalBindsCandidate(pack, item, canonical);
  const correct = item.operation === "add" ? ((!!overlay && !canonical) || (promoted && !!canonical))
    : item.operation === "modify" ? ((!!overlay && !!canonical && !canonical.equals(overlay)) || (promoted && !!canonical))
      : item.operation === "delete" ? ((!overlay && !!canonical) || (promoted && !canonical))
        : false;
  if (!correct) diagnostics.push(diag("DIAGRAM_OPERATION_MISMATCH", file, `${item.operation} 与 canonical、候选 overlay 和已批准内容摘要不一致：${item.path}`));
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
  const visualReviews = parseVisualReviews(pack.text.decisions);
  const declaredVisualPaths = new Set((pack.change?.diagrams ?? []).filter((item) => item?.operation !== "delete" && validDiagramPath(item?.path)).map((item) => item.path));
  reportDuplicateIds(visualReviews.map((item) => item.path), "VISUAL_REVIEW_DUPLICATE", pack.relative.decisions, diagnostics);
  for (const review of visualReviews) if (!declaredVisualPaths.has(review.path)) diagnostics.push(diag("VISUAL_REVIEW_UNKNOWN", pack.relative.decisions, `视觉审查引用了未声明的 add/modify 图：${review.path}`));
  if (gate === "design") {
    for (const [file, source] of [[PRINCIPLES_RELATIVE_PATH, fs.readFileSync(pack.workspace.principlesPath, "utf8")], [pack.relative.proposal, pack.text.proposal], [pack.relative.decisions, pack.text.decisions], [pack.relative.tasks, pack.text.tasks]]) {
      if (source.includes("[TODO")) diagnostics.push(diag("PLACEHOLDER_REMAINING", file, "设计批准前必须清除所有 [TODO] 占位内容。"));
    }
    const questions = parseOpenQuestions(pack.text.proposal);
    if (questions.open > 0) diagnostics.push(diag("OPEN_QUESTIONS_REMAIN", pack.relative.proposal, `设计批准前必须解决全部未决问题；当前还有 ${questions.open} 项。`));
    const visualByPath = new Map(visualReviews.map((item) => [item.path, item.status]));
    for (const diagramPath of declaredVisualPaths) {
      const visualStatus = visualByPath.get(diagramPath);
      if (visualStatus !== "PASS") diagnostics.push(diag("VISUAL_REVIEW_NOT_PASS", pack.relative.decisions, `${diagramPath} 必须具有当前 SVG 的 PASS 视觉审查结果；当前为 ${visualStatus ?? "missing"}。`));
    }
  }
  if (gate === "completion") {
    if (tasks.some((task) => !task.completed)) diagnostics.push(diag("TASKS_INCOMPLETE", pack.relative.tasks, "完成批准前所有任务必须勾选完成。"));
    const byId = new Map(verification.acceptanceResults.map((item) => [item.id, item.status]));
    for (const criterion of criteria) if (byId.get(criterion) !== "PASS") diagnostics.push(diag("AC_NOT_PASS", pack.relative.verification, `${criterion} 必须具有 PASS 验证结果。`));
    if (verification.semanticReview !== "pass") diagnostics.push(diag("SEMANTIC_REVIEW_NOT_PASS", pack.relative.verification, "AI semantic review 必须显式声明为 pass。"));
    if (pack.text.verification.includes("[TODO")) diagnostics.push(diag("PLACEHOLDER_REMAINING", pack.relative.verification, "完成批准前必须清除 verification.md 中的 [TODO]。"));
  }
}

function statusForPack(workspace, pack) {
  const validation = validatePack(workspace, pack, { plantUml: false });
  const design = pack.change ? designDigest(workspace, pack) : { digest: null };
  const approval = safeApproval(pack);
  const designRecord = approval.design.at(-1) ?? null;
  const modelApplied = isPackPromoted(pack);
  const pendingOverlay = hasCandidateOverlay(pack);
  const matchingDigest = designRecord?.digest === design.digest ? design.digest : null;
  const designState = !designRecord ? "missing" : matchingDigest && validation.baseline.state === "current" ? "current" : "stale";
  const tasks = parseTasks(pack.text.tasks);
  const verification = parseVerification(pack.text.verification);
  const completionRecord = approval.completion.at(-1) ?? null;
  const currentCompletionDigest = designState === "current"
    ? completionDigest({ designDigest: matchingDigest, tasksSha256: fileShaOrNull(pack.paths.tasks), verificationSha256: fileShaOrNull(pack.paths.verification) })
    : null;
  const completionState = !completionRecord ? "missing" : completionRecord.digest === currentCompletionDigest ? "current" : "stale";
  return {
    id: pack.id,
    baselineDigest: pack.change?.baselineDigest ?? null,
    structurallyValid: !validation.diagnostics.some(isError),
    plantUml: validation.plantUml,
    baseline: validation.baseline,
    pendingOverlay,
    source: validation.source,
    svg: validation.svg,
    diagnostics: validation.diagnostics,
    openQuestions: validation.openQuestions,
    tasks: taskSummary(tasks),
    visualReview: validation.visualReview,
    verification: { semanticReview: verification.semanticReview, acceptance: validation.acceptance },
    designApproval: { state: designState, digest: matchingDigest ?? design.digest, reviewer: designRecord?.reviewer ?? null, recordedAt: designRecord?.recordedAt ?? null, baselineDigest: designRecord?.baselineDigest ?? null, modelApplied },
    completionApproval: { state: completionState, digest: completionRecord?.digest ?? null, reviewer: completionRecord?.reviewer ?? null, recordedAt: completionRecord?.recordedAt ?? null },
    archiveEligible: completionState === "current"
  };
}

function summarizePack(workspace, pack) {
  const status = statusForPack(workspace, pack);
  return { id: status.id, designApproval: status.designApproval.state, completionApproval: status.completionApproval.state, tasks: status.tasks, source: status.source, archiveEligible: status.archiveEligible };
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
    if (!isRealFile(target)) diagnostics.push(diag("ARTIFACT_REQUIRED", relativePosix(workspace.root, target), `缺少固定 Change Pack 文件：${file}`));
  }
  let change = null;
  if (isRealFile(paths.change)) change = parseYaml(paths.change, diagnostics, "CHANGE_YAML_INVALID");
  let approval = null;
  if (isRealFile(paths.approval)) approval = parseYaml(paths.approval, diagnostics, "APPROVAL_YAML_INVALID");
  const text = { proposal: readText(paths.proposal), decisions: readText(paths.decisions), tasks: readText(paths.tasks), verification: readText(paths.verification) };
  const declared = new Set((change?.diagrams ?? []).filter((item) => validDiagramPath(item?.path) && item.operation !== "delete").map((item) => diagramRelative(item.path)));
  if (fs.existsSync(diagramsRoot)) {
    for (const file of discoverTreeFiles(diagramsRoot)) {
      const relativeDiagram = relativePosix(diagramsRoot, file);
      if (relativeDiagram !== ".gitkeep" && !declared.has(relativeDiagram)) diagnostics.push(diag("UNDECLARED_CANDIDATE_DIAGRAM", relativePosix(workspace.root, file), "Change Pack diagrams 中的 .puml 必须由 change.yaml 声明，delete 不得保留候选文件。"));
    }
  }
  if (fs.existsSync(renderedRoot)) {
    for (const file of discoverTreeFiles(renderedRoot)) {
      const relativeSvg = relativePosix(renderedRoot, file);
      const sourceRelative = relativeSvg.replace(/\.svg$/i, ".puml");
      if (!declared.has(sourceRelative)) diagnostics.push(diag("SVG_ORPHAN", relativePosix(workspace.root, file), "Change Pack 审查 SVG 没有对应的已声明 add/modify 候选。"));
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
  if (pack.approval && Array.isArray(pack.approval.design) && Array.isArray(pack.approval.completion)) return pack.approval;
  return emptyApproval();
}

function designDigest(workspace, pack) {
  const artifacts = [PRINCIPLES_RELATIVE_PATH, pack.relative.change, pack.relative.proposal, pack.relative.decisions]
    .map((artifactPath) => artifactRecord(workspace.root, artifactPath));
  for (const item of pack.change?.diagrams ?? []) {
    if (!validDiagramPath(item?.path)) continue;
    const bytes = candidateBytes(pack, item);
    artifacts.push({ path: item.path, sha256: bytes ? sha256(bytes) : null });
  }
  return designDigestFromArtifacts(pack.change?.baselineDigest ?? null, artifacts);
}

function baselineSnapshot(workspace) {
  const paths = [PRINCIPLES_RELATIVE_PATH, ...discoverDiagrams(workspace.diagramsRoot).map((file) => relativePosix(workspace.root, file))].sort((a, b) => a.localeCompare(b, "en"));
  const artifacts = paths.map((file) => artifactRecord(workspace.root, file));
  const digest = sha256(`${stableJson({ workflowProtocol: WORKFLOW_PROTOCOL, kind: "baseline", artifacts })}\n`);
  return { digest, artifacts };
}

function baselineFreshness(workspace, pack, promoted, snapshot = null, pendingOverlay = false) {
  if (!SHA256.test(pack.change?.baselineDigest ?? "") || !validArtifactList(pack.change?.baselineArtifacts)) {
    return { state: "invalid", digest: null, recordedDigest: pack.change?.baselineDigest ?? null, changedPaths: [], modelApplied: promoted, message: "baselineDigest 或 baselineArtifacts 无效，无法判断模型基线 freshness。" };
  }
  const current = snapshot ?? baselineSnapshot(workspace);
  const changedPaths = compareArtifacts(pack.change.baselineArtifacts, current.artifacts);
  const declared = new Set((pack.change.diagrams ?? []).map((item) => item?.path));
  const externalChanges = changedPaths.filter((file) => !declared.has(file));
  const expectedState = current.digest === pack.change.baselineDigest ? "current" : promoted && externalChanges.length === 0 && !pendingOverlay ? "current" : "stale";
  return {
    state: expectedState,
    digest: current.digest,
    recordedDigest: pack.change.baselineDigest,
    changedPaths,
    modelApplied: promoted,
    message: expectedState === "current"
      ? promoted ? "候选模型已按当前设计批准提升，基线变化仅限本 Change Pack 声明的图。" : "模型基线与当前 principles 和 canonical .puml 一致。"
      : `已批准模型基线发生变化：${externalChanges.join("、") || changedPaths.join("、")}。请运行 change refresh-baseline，并重新审查设计。`
  };
}

function compareArtifacts(previous, current) {
  const before = new Map((previous ?? []).map((item) => [item.path, item.sha256]));
  const after = new Map((current ?? []).map((item) => [item.path, item.sha256]));
  return [...new Set([...before.keys(), ...after.keys()])].filter((file) => before.get(file) !== after.get(file)).sort((a, b) => a.localeCompare(b, "en"));
}

function validArtifactList(value) {
  if (!Array.isArray(value)) return false;
  const paths = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.path !== "string" || !SHA256.test(item.sha256 ?? "")) return false;
    paths.push(item.path);
  }
  return paths.every((file, index) => index === 0 || paths[index - 1].localeCompare(file, "en") < 0);
}

function artifactRecord(root, relative) {
  const bytes = canonicalBytes({ root }, relative);
  return { path: relative, sha256: bytes ? sha256(bytes) : null };
}

function candidateDiagramRecords(pack) {
  const records = [];
  for (const item of pack.change?.diagrams ?? []) {
    if (!item || !OPERATIONS.has(item.operation) || item.operation === "delete") continue;
    const bytes = candidateBytes(pack, item);
    if (bytes) records.push({ path: item.path, content: bytes, file: candidatePath(pack, item) });
  }
  return records.sort((a, b) => a.path.localeCompare(b.path, "en"));
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

function requireSingleActiveChange(workspace, expectedId = null) {
  const ids = listActiveChangeIds(workspace);
  if (ids.length > 1) {
    const issue = diagnostic("error", "MULTIPLE_ACTIVE_CHANGES", CHANGES_RELATIVE_PATH, null, `当前工作区存在多个活动 Change Pack：${ids.join("、")}。并行变更请使用独立工作区。`);
    throw operationError("每个工作区最多只能有一个活动 Change Pack。", [issue]);
  }
  if (expectedId && ids.length === 1 && ids[0] !== expectedId) throw new Error(`当前工作区的活动 Change Pack 是 ${ids[0]}，不是 ${expectedId}。`);
  return ids[0] ?? null;
}

function requireNoActiveChange(workspace) {
  const active = requireSingleActiveChange(workspace);
  if (active) throw new Error(`当前工作区已有活动 Change Pack：${active}。并行变更请使用独立工作区。`);
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

function parseVisualReviews(source) {
  return [...source.matchAll(/^\s*-\s+(\.arch-lens\/diagrams\/[^\s:]+\.puml):\s+(PASS|CONCERNS|FAIL)\s+-\s+\S.*$/gm)].map((match) => ({ path: match[1], status: match[2] }));
}

function visualReviewSummary(reviews, diagrams) {
  const required = diagrams.filter((item) => item?.operation !== "delete" && validDiagramPath(item?.path)).map((item) => item.path);
  const byPath = new Map(reviews.map((item) => [item.path, item.status]));
  return {
    pass: required.filter((diagramPath) => byPath.get(diagramPath) === "PASS").length,
    concerns: required.filter((diagramPath) => byPath.get(diagramPath) === "CONCERNS").length,
    fail: required.filter((diagramPath) => byPath.get(diagramPath) === "FAIL").length,
    missing: required.filter((diagramPath) => !byPath.has(diagramPath)).length,
    total: required.length,
    results: reviews
  };
}

function parseVerification(source) {
  const acceptanceResults = [...source.matchAll(/^\s*-\s+(AC-\d{3}):\s+(PASS|FAIL|NOT-RUN)\s+-\s+\S.*$/gm)].map((match) => ({ id: match[1], status: match[2] }));
  return {
    semanticReview: source.match(/<!--\s*arch-lens:\s*semantic-review=(pass|concerns|fail|pending)\s*-->/i)?.[1].toLowerCase() ?? "missing",
    designDigest: source.match(/<!--\s*arch-lens:\s*design-digest=([0-9a-f]{64}|pending)\s*-->/i)?.[1] ?? null,
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

function candidateSvgPath(pack, item) {
  return path.join(pack.renderedRoot, diagramRelative(item.path).replace(/\.puml$/i, ".svg"));
}

function canonicalBytes(workspace, canonicalPath) {
  const target = path.join(workspace.root, canonicalPath);
  return isRealFile(target) ? fs.readFileSync(target) : null;
}

function candidateBytes(pack, item) {
  if (!item || item.operation === "delete" || !validDiagramPath(item.path)) return null;
  const overlay = candidatePath(pack, item);
  if (isRealFile(overlay)) return fs.readFileSync(overlay);
  return canonicalBytes(pack.workspace, item.path);
}

function hasCandidateOverlay(pack) {
  return (pack.change?.diagrams ?? []).some((item) => item && item.operation !== "delete" && isRealFile(candidatePath(pack, item)));
}

function approvalBindsCandidate(pack, item, canonical) {
  const record = safeApproval(pack).design.at(-1);
  const artifact = record?.artifacts?.find((entry) => entry?.path === item.path);
  return !!artifact && artifact.sha256 === (canonical ? sha256(canonical) : null);
}

function canReuseVisualEvidence(pack, records) {
  const record = safeApproval(pack).design.at(-1);
  if (!record) return false;
  return records.every((candidate) => {
    const artifact = record.artifacts?.find((entry) => entry?.path === candidate.path);
    return !!artifact && artifact.sha256 === sha256(candidate.content);
  });
}

function isPackPromoted(pack) {
  const changed = pack.change?.diagrams ?? [];
  if (changed.length === 0) return false;
  return changed.every((item) => {
    const canonical = canonicalBytes(pack.workspace, item.path);
    if (item.operation === "delete") return !canonical && approvalBindsCandidate(pack, item, canonical);
    return !!canonical && approvalBindsCandidate(pack, item, canonical);
  });
}

function findArchivedChange(archiveRoot, id) {
  if (!fs.existsSync(archiveRoot)) return null;
  return fs.readdirSync(archiveRoot).find((name) => name === id || name.endsWith(`-${id}`)) ?? null;
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
      if (entry.isSymbolicLink()) diagnostics?.push(diag("ARTIFACT_SYMLINK", `${relativeRoot}/${relativePosix(root, target)}`, "Change Pack diagrams/rendered 不得包含符号链接。"));
      else if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) files.push(target);
      else diagnostics?.push(diag("ARTIFACT_UNKNOWN", `${relativeRoot}/${relativePosix(root, target)}`, "Change Pack 不允许特殊文件。"));
    }
  };
  visit(root);
  return files;
}

function unifiedDiff(canonicalPath, base, candidate) {
  if ((base && candidate && base.equals(candidate)) || (!base && !candidate)) return "";
  const before = base ? base.toString("utf8").replace(/\n$/, "").split("\n") : [];
  const after = candidate ? candidate.toString("utf8").replace(/\n$/, "").split("\n") : [];
  const lines = [
    `diff --arch-lens a/${canonicalPath} b/${canonicalPath}`,
    base ? `--- a/${canonicalPath}` : "--- /dev/null",
    candidate ? `+++ b/${canonicalPath}` : "+++ /dev/null",
    `@@ -1,${before.length} +1,${after.length} @@`,
    ...before.map((line) => `-${line}`),
    ...after.map((line) => `+${line}`)
  ];
  return `${lines.join("\n")}\n`;
}

function applyModelAtomically(workspace, pack) {
  const parent = path.dirname(workspace.diagramsRoot);
  const nonce = `${process.pid}.${Date.now()}`;
  const pending = path.join(parent, `.diagrams.${nonce}.tmp`);
  const backup = path.join(parent, `.diagrams.${nonce}.backup`);
  fs.mkdirSync(pending);
  let backedUp = false;
  let installed = false;
  try {
    copyTree(workspace.diagramsRoot, pending);
    for (const item of pack.change.diagrams) {
      const relative = diagramRelative(item.path);
      const target = path.join(pending, relative);
      if (item.operation === "delete") fs.rmSync(target, { force: true });
      else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(candidatePath(pack, item), target);
      }
    }
    pruneEmptyDirectories(pending);
    const keepFile = path.join(pending, ".gitkeep");
    const modelFiles = discoverTreeFiles(pending).filter((file) => file !== keepFile);
    if (modelFiles.length > 0) fs.rmSync(keepFile, { force: true });
    else if (!fs.existsSync(keepFile)) fs.writeFileSync(keepFile, "");

    fs.renameSync(workspace.diagramsRoot, backup);
    backedUp = true;
    fs.renameSync(pending, workspace.diagramsRoot);
    installed = true;
  } catch (error) {
    if (installed && fs.existsSync(workspace.diagramsRoot)) fs.rmSync(workspace.diagramsRoot, { recursive: true, force: true });
    if (backedUp && fs.existsSync(backup)) fs.renameSync(backup, workspace.diagramsRoot);
    fs.rmSync(pending, { recursive: true, force: true });
    throw error;
  }
  fs.rmSync(backup, { recursive: true, force: true });
  fs.rmSync(pack.diagramsRoot, { recursive: true, force: true });
  fs.rmSync(pack.renderedRoot, { recursive: true, force: true });
  for (const item of pack.change.diagrams) fs.rmSync(path.join(workspace.root, RENDERED_RELATIVE_PATH, diagramRelative(item.path).replace(/\.puml$/i, ".svg")), { force: true });
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

function requiredFileSha(file) {
  if (!isRealFile(file)) throw new Error(`缺少协议文件：${file}`);
  return sha256(fs.readFileSync(file));
}

function fileKey(file) { return file.replace(/\.(?:yaml|md)$/, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); }
function isRealFile(file) { return fs.existsSync(file) && !fs.lstatSync(file).isSymbolicLink() && fs.statSync(file).isFile(); }
function readText(file) { return isRealFile(file) ? fs.readFileSync(file, "utf8") : ""; }
function fileShaOrNull(file) { return isRealFile(file) ? sha256(fs.readFileSync(file)) : null; }
function diag(code, file, message) { return diagnostic("error", code, file, null, message); }
function isError(item) { return item.severity === "error"; }
function compareDiagnostics(a, b) { return `${a.file ?? ""}:${a.line ?? 0}:${a.code}`.localeCompare(`${b.file ?? ""}:${b.line ?? 0}:${b.code}`, "en"); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
