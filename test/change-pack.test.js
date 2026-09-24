import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parse, stringify } from "yaml";
import {
  assertJsonError,
  assertJsonSuccess,
  completeDecisions,
  completePrinciples,
  completeProposal,
  completeTasks,
  initWorkspace,
  parseJson,
  runCli,
  tempDir,
  writeCandidate,
  writeDiagram
} from "./helpers.js";

test("change new records a local content baseline and one active workspace pack", () => {
  const cwd = tempDir();
  initWorkspace(cwd);
  const created = assertJsonSuccess(runCli(cwd, "change", "new", "local-flow", "--json"));
  assert.equal(created.workflowProtocol, 2);
  assert.equal(created.id, "local-flow");
  assert.match(created.baselineDigest, /^[0-9a-f]{64}$/);
  const manifest = parse(fs.readFileSync(path.join(cwd, ".arch-lens/changes/local-flow/change.yaml"), "utf8"));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.workflowProtocol, 2);
  assert.equal(manifest.baselineDigest, created.baselineDigest);
  assert.equal(Object.hasOwn(manifest, "baseCommit"), false);
  assert.ok(manifest.baselineArtifacts.some((item) => item.path === ".arch-lens/principles.md"));

  assertJsonError(runCli(cwd, "change", "new", "second", "--json"), /已有活动 Change Pack/);
  assertJsonError(runCli(cwd, "change", "new", "Upper_Case", "--json"), /kebab-case/);
  const listed = assertJsonSuccess(runCli(cwd, "change", "status", "--json"));
  assert.equal(listed.changes.length, 1);
});

test("design approval requires fresh candidate SVG and a PASS visual review", () => {
  const cwd = tempDir();
  const { id, diagramPath } = prepareCandidate(cwd, "design-gate");
  completeProposal(path.join(packRoot(cwd, id), "proposal.md"), id);
  completeDecisions(path.join(packRoot(cwd, id), "decisions.md"), diagramPath);

  const beforeRender = runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json");
  assertJsonError(beforeRender, /尚不满足设计批准的机械前置条件/);
  assert.ok(parseJson(beforeRender).diagnostics.some((item) => item.code === "SVG_MISSING"));

  assertJsonSuccess(runCli(cwd, "change", "render", id, "--json"));
  const approved = assertJsonSuccess(runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json"));
  assert.equal(approved.stage, "design");
  assert.match(approved.digest, /^[0-9a-f]{64}$/);
  assert.equal(statusFor(cwd, id).designApproval.state, "current");

  const decisions = path.join(packRoot(cwd, id), "decisions.md");
  fs.writeFileSync(decisions, fs.readFileSync(decisions, "utf8").replace(": PASS -", ": CONCERNS -"));
  assert.equal(statusFor(cwd, id).designApproval.state, "stale");
});

test("local-first flow applies only PlantUML, binds completion to content and archives without Git", () => {
  const cwd = tempDir();
  const { id, diagramPath } = prepareCandidate(cwd, "local-complete");
  const root = packRoot(cwd, id);
  assertJsonSuccess(runCli(cwd, "change", "render", id, "--json"));
  const design = assertJsonSuccess(runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json"));

  const applied = assertJsonSuccess(runCli(cwd, "change", "apply-model", id, "--json"));
  assert.deepEqual(applied.applied, [{ path: diagramPath, operation: "add" }]);
  assert.equal(fs.existsSync(path.join(cwd, diagramPath)), true);
  assert.equal(fs.existsSync(path.join(root, "diagrams")), false);
  assert.equal(fs.existsSync(path.join(root, "rendered")), false);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/rendered", `${path.basename(diagramPath, ".puml")}.svg`)), false);
  assert.equal(statusFor(cwd, id).designApproval.state, "current");
  assertJsonError(runCli(cwd, "change", "refresh-baseline", id, "--json"), /无需刷新/);
  assert.deepEqual(assertJsonSuccess(runCli(cwd, "change", "render", id, "--json")).rendered, []);

  fs.writeFileSync(path.join(root, "tasks.md"), "# Implementation Tasks\n\n- [x] T001 [AC-001] Implement the local workflow.\n");
  fs.writeFileSync(path.join(root, "verification.md"), `# Implementation Verification

<!-- arch-lens: semantic-review=pass -->
<!-- arch-lens: design-digest=${design.digest} -->

## Evidence

- npm test passed.

## Acceptance Results

- AC-001: PASS - The local workflow completed without Git.

## Semantic Review

The implementation matches the approved local-first model.

## Residual Risks

No known residual semantic risk.
`);
  const completion = assertJsonSuccess(runCli(cwd, "change", "record-approval", id, "--stage", "completion", "--reviewer", "BeaconSage", "--json"));
  assert.equal(completion.stage, "completion");
  const evidence = assertJsonSuccess(runCli(cwd, "change", "evidence", id, "--json"));
  assert.equal(evidence.designApproval.state, "current");
  assert.equal(evidence.completionApproval.state, "current");
  assert.equal(Object.hasOwn(evidence, "currentHead"), false);
  assert.equal(Object.hasOwn(evidence.completionApproval, "implementationCommit"), false);
  assert.deepEqual(evidence.acceptanceResults, [{ id: "AC-001", status: "PASS" }]);

  const archived = assertJsonSuccess(runCli(cwd, "change", "archive", id, "--json"));
  assert.match(archived.archivedPath, /\.arch-lens\/changes\/archive\/\d{4}-\d{2}-\d{2}-local-complete$/);
  assert.equal(fs.existsSync(root), false);
  assertJsonError(runCli(cwd, "change", "new", id, "--json"), /已归档/);
});

test("canonical model changes make approval stale and refresh-baseline restores only the content baseline", () => {
  const cwd = tempDir();
  const baselineDiagram = writeDiagram(cwd, "baseline.puml", "class Baseline");
  const { id, diagramPath } = prepareCandidate(cwd, "refresh-baseline", "class Candidate");
  assertJsonSuccess(runCli(cwd, "change", "render", id, "--json"));
  assertJsonSuccess(runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json"));

  fs.writeFileSync(baselineDiagram, fs.readFileSync(baselineDiagram, "utf8").replace("class Baseline", "class ChangedBaseline"));
  const stale = statusFor(cwd, id);
  assert.equal(stale.baseline.state, "stale");
  assert.equal(stale.designApproval.state, "stale");
  assert.deepEqual(stale.baseline.changedPaths, [".arch-lens/diagrams/baseline.puml"]);

  const refreshed = assertJsonSuccess(runCli(cwd, "change", "refresh-baseline", id, "--json"));
  assert.notEqual(refreshed.baselineDigest, refreshed.previousBaselineDigest);
  const current = statusFor(cwd, id);
  assert.equal(current.baseline.state, "current");
  assert.equal(current.designApproval.state, "stale");
  assert.equal(fs.existsSync(path.join(packRoot(cwd, id), "diagrams", path.basename(diagramPath))), true);
});

test("refresh-baseline after apply-model reopens design and reuses evidence for unchanged diagrams", () => {
  const cwd = tempDir();
  const { id, diagramPath } = prepareCandidate(cwd, "refresh-after-apply");
  assertJsonSuccess(runCli(cwd, "change", "render", id, "--json"));
  assertJsonSuccess(runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json"));
  assertJsonSuccess(runCli(cwd, "change", "apply-model", id, "--json"));
  const canonicalPath = path.join(cwd, diagramPath);
  const canonicalBefore = fs.readFileSync(canonicalPath);

  const principles = path.join(cwd, ".arch-lens/principles.md");
  fs.writeFileSync(principles, fs.readFileSync(principles, "utf8").replace("Humans approve design and completion.", "Humans explicitly approve design and completion."));
  const stale = statusFor(cwd, id);
  assert.equal(stale.baseline.state, "stale");
  assert.equal(stale.designApproval.state, "stale");
  assert.equal(stale.designApproval.modelApplied, true);

  const refreshed = assertJsonSuccess(runCli(cwd, "change", "refresh-baseline", id, "--json"));
  assert.equal(refreshed.modelApplied, true);
  assert.deepEqual(refreshed.changedBaselinePaths, [".arch-lens/diagrams/local-flow.puml", ".arch-lens/principles.md"]);
  assert.equal(statusFor(cwd, id).baseline.state, "current");
  assert.equal(statusFor(cwd, id).designApproval.state, "stale");
  assert.equal(statusFor(cwd, id).svg.reused, true);

  const reapproved = assertJsonSuccess(runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json"));
  assert.equal(reapproved.stage, "design");
  assert.equal(statusFor(cwd, id).designApproval.state, "current");
  assert.equal(statusFor(cwd, id).designApproval.modelApplied, true);
  assert.equal(fs.existsSync(path.join(packRoot(cwd, id), "rendered")), false);
  assert.deepEqual(fs.readFileSync(canonicalPath), canonicalBefore);
});

test("diagram changes after apply-model reuse unchanged canonical and require a second apply", () => {
  const cwd = tempDir();
  const { id, diagramPath } = prepareCandidate(cwd, "diagram-after-apply");
  const root = packRoot(cwd, id);
  assertJsonSuccess(runCli(cwd, "change", "render", id, "--json"));
  assertJsonSuccess(runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json"));
  assertJsonSuccess(runCli(cwd, "change", "apply-model", id, "--json"));

  writeCandidate(cwd, id, "local-flow.puml", "class RevisedCandidate");

  const stale = statusFor(cwd, id);
  assert.equal(stale.baseline.state, "current");
  assert.equal(stale.pendingOverlay, true);
  assert.equal(stale.designApproval.modelApplied, false);
  assertJsonError(runCli(cwd, "change", "refresh-baseline", id, "--json"), /无需刷新/);

  assertJsonError(runCli(cwd, "change", "apply-model", id, "--json"), /只有当前有效的 design approval/);
  const denied = runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json");
  assertJsonError(denied, /尚不满足设计批准的机械前置条件/);
  assert.ok(parseJson(denied).diagnostics.some((item) => item.code === "SVG_MISSING"));

  assertJsonSuccess(runCli(cwd, "change", "render", id, "--json"));
  assertJsonSuccess(runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json"));
  const applied = assertJsonSuccess(runCli(cwd, "change", "apply-model", id, "--json"));
  assert.deepEqual(applied.applied, [{ path: diagramPath, operation: "modify" }]);
  assert.match(fs.readFileSync(path.join(cwd, diagramPath), "utf8"), /class RevisedCandidate/);
  assert.equal(statusFor(cwd, id).designApproval.state, "current");
  assert.equal(statusFor(cwd, id).designApproval.modelApplied, true);
});

test("multi-diagram partial revision reconciles only changed canonical bytes and is idempotent", () => {
  const cwd = tempDir();
  initWorkspace(cwd);
  completePrinciples(cwd);
  assertJsonSuccess(runCli(cwd, "change", "new", "partial-reconcile", "--json"));
  const id = "partial-reconcile";
  const root = packRoot(cwd, id);
  const first = ".arch-lens/diagrams/first.puml";
  const second = ".arch-lens/diagrams/second.puml";
  writeCandidate(cwd, id, "first.puml", "class First");
  writeCandidate(cwd, id, "second.puml", "class Second");
  const manifestFile = path.join(root, "change.yaml");
  const manifest = parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.diagrams = [
    { path: first, operation: "add" },
    { path: second, operation: "add" }
  ];
  fs.writeFileSync(manifestFile, stringify(manifest, { lineWidth: 0 }));
  completeProposal(path.join(root, "proposal.md"), id);
  completeDecisions(path.join(root, "decisions.md"), first);
  fs.appendFileSync(path.join(root, "decisions.md"), `- ${second}: PASS - Opened the current rendered SVG and reviewed layout, clipping, density, boundaries, and reading order.\n`);
  completeTasks(path.join(root, "tasks.md"));

  assertJsonSuccess(runCli(cwd, "change", "render", id, "--json"));
  assertJsonSuccess(runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json"));
  const firstApply = assertJsonSuccess(runCli(cwd, "change", "apply-model", id, "--json"));
  assert.deepEqual(firstApply.applied, [
    { path: first, operation: "add" },
    { path: second, operation: "add" }
  ]);

  writeCandidate(cwd, id, "first.puml", "class FirstRevised");
  const revised = statusFor(cwd, id);
  assert.equal(revised.baseline.state, "current");
  assert.equal(revised.pendingOverlay, true);
  assert.equal(revised.designApproval.modelApplied, false);
  assertJsonError(runCli(cwd, "change", "refresh-baseline", id, "--json"), /无需刷新/);

  const rendered = assertJsonSuccess(runCli(cwd, "change", "render", id, "--json"));
  assert.equal(rendered.rendered.length, 2);
  assertJsonSuccess(runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json"));
  const secondApply = assertJsonSuccess(runCli(cwd, "change", "apply-model", id, "--json"));
  assert.deepEqual(secondApply.applied, [{ path: first, operation: "modify" }]);
  assert.match(fs.readFileSync(path.join(cwd, first), "utf8"), /class FirstRevised/);
  assert.match(fs.readFileSync(path.join(cwd, second), "utf8"), /class Second/);

  const noOp = assertJsonSuccess(runCli(cwd, "change", "apply-model", id, "--json"));
  assert.deepEqual(noOp.applied, []);
  const noOpRender = assertJsonSuccess(runCli(cwd, "change", "render", id, "--json"));
  assert.deepEqual(noOpRender.rendered, []);
  const noDiff = assertJsonSuccess(runCli(cwd, "change", "diff", id, "--json"));
  assert.deepEqual(noDiff.files, []);
  assert.equal(noDiff.patch, "");
});

test("proposal-only revision re-approves without refresh and apply remains a no-op", () => {
  const cwd = tempDir();
  const { id, diagramPath } = prepareCandidate(cwd, "proposal-only");
  const root = packRoot(cwd, id);
  assertJsonSuccess(runCli(cwd, "change", "render", id, "--json"));
  assertJsonSuccess(runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json"));
  assertJsonSuccess(runCli(cwd, "change", "apply-model", id, "--json"));
  const canonicalBefore = fs.readFileSync(path.join(cwd, diagramPath));

  fs.appendFileSync(path.join(root, "proposal.md"), "\nAdditional rationale.\n");
  assert.equal(statusFor(cwd, id).baseline.state, "current");
  assert.equal(statusFor(cwd, id).designApproval.state, "stale");
  assertJsonError(runCli(cwd, "change", "refresh-baseline", id, "--json"), /无需刷新/);
  const rendered = assertJsonSuccess(runCli(cwd, "change", "render", id, "--json"));
  assert.deepEqual(rendered.rendered, []);
  assertJsonSuccess(runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json"));
  const applied = assertJsonSuccess(runCli(cwd, "change", "apply-model", id, "--json"));
  assert.deepEqual(applied.applied, []);
  assert.deepEqual(fs.readFileSync(path.join(cwd, diagramPath)), canonicalBefore);
});

test("unresolved desired, unknown operation, duplicate path and symlink candidates fail before apply", () => {
  const unresolved = tempDir();
  initWorkspace(unresolved);
  assertJsonSuccess(runCli(unresolved, "change", "new", "unresolved", "--json"));
  const unresolvedRoot = packRoot(unresolved, "unresolved");
  const unresolvedManifest = parse(fs.readFileSync(path.join(unresolvedRoot, "change.yaml"), "utf8"));
  unresolvedManifest.diagrams = [{ path: ".arch-lens/diagrams/missing.puml", operation: "add" }];
  fs.writeFileSync(path.join(unresolvedRoot, "change.yaml"), stringify(unresolvedManifest, { lineWidth: 0 }));
  const unresolvedStatus = assertJsonSuccess(runCli(unresolved, "change", "status", "unresolved", "--json"));
  assert.ok(unresolvedStatus.diagnostics.some((item) => item.code === "DIAGRAM_DESIRED_UNRESOLVED"));
  assertJsonError(runCli(unresolved, "change", "apply-model", "unresolved", "--json"), /结构或文件事实错误/);

  const duplicate = tempDir();
  initWorkspace(duplicate);
  assertJsonSuccess(runCli(duplicate, "change", "new", "duplicate", "--json"));
  const duplicateRoot = packRoot(duplicate, "duplicate");
  const duplicateManifest = parse(fs.readFileSync(path.join(duplicateRoot, "change.yaml"), "utf8"));
  const duplicatePath = ".arch-lens/diagrams/duplicate.puml";
  writeCandidate(duplicate, "duplicate", "duplicate.puml", "class Duplicate");
  duplicateManifest.diagrams = [{ path: duplicatePath, operation: "add" }, { path: duplicatePath, operation: "modify" }];
  fs.writeFileSync(path.join(duplicateRoot, "change.yaml"), stringify(duplicateManifest, { lineWidth: 0 }));
  const duplicateError = assertJsonError(runCli(duplicate, "change", "validate", "duplicate", "--json"), /校验失败/);
  assert.ok(duplicateError.diagnostics.some((item) => item.code === "DIAGRAM_DUPLICATE"));

  const unknown = tempDir();
  initWorkspace(unknown);
  assertJsonSuccess(runCli(unknown, "change", "new", "unknown", "--json"));
  const unknownRoot = packRoot(unknown, "unknown");
  const unknownManifest = parse(fs.readFileSync(path.join(unknownRoot, "change.yaml"), "utf8"));
  unknownManifest.diagrams = [{ path: ".arch-lens/diagrams/unknown.puml", operation: "promote" }];
  fs.writeFileSync(path.join(unknownRoot, "change.yaml"), stringify(unknownManifest, { lineWidth: 0 }));
  const unknownError = assertJsonError(runCli(unknown, "change", "validate", "unknown", "--json"), /校验失败/);
  assert.ok(unknownError.diagnostics.some((item) => item.code === "DIAGRAM_OPERATION_INVALID"));

  const linked = tempDir();
  initWorkspace(linked);
  assertJsonSuccess(runCli(linked, "change", "new", "symlinked", "--json"));
  const linkedRoot = packRoot(linked, "symlinked");
  const external = path.join(tempDir(), "external.puml");
  fs.writeFileSync(external, "@startuml\n' arch-lens: type=domain\n' arch-lens: question=状态如何演进？\ntitle external\nclass External\n@enduml\n");
  fs.mkdirSync(path.join(linkedRoot, "diagrams"), { recursive: true });
  fs.symlinkSync(external, path.join(linkedRoot, "diagrams", "linked.puml"));
  const linkedManifest = parse(fs.readFileSync(path.join(linkedRoot, "change.yaml"), "utf8"));
  linkedManifest.diagrams = [{ path: ".arch-lens/diagrams/linked.puml", operation: "add" }];
  fs.writeFileSync(path.join(linkedRoot, "change.yaml"), stringify(linkedManifest, { lineWidth: 0 }));
  const linkedError = assertJsonError(runCli(linked, "change", "validate", "symlinked", "--json"), /校验失败/);
  assert.ok(linkedError.diagnostics.some((item) => item.code === "ARTIFACT_SYMLINK" || item.code === "DIAGRAM_SYMLINK"));
});

test("declared canonical third content is stale and blocks apply without approval", () => {
  const cwd = tempDir();
  const { id, diagramPath } = prepareCandidate(cwd, "declared-drift");
  assertJsonSuccess(runCli(cwd, "change", "render", id, "--json"));
  assertJsonSuccess(runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json"));
  assertJsonSuccess(runCli(cwd, "change", "apply-model", id, "--json"));

  fs.writeFileSync(path.join(cwd, diagramPath), "@startuml\n' arch-lens: type=domain\n' arch-lens: question=状态如何演进？\ntitle local-flow.puml\nclass ExternalThirdContent\n@enduml\n");
  const stale = statusFor(cwd, id);
  assert.equal(stale.baseline.state, "stale");
  assert.equal(stale.designApproval.state, "stale");
  assert.ok(stale.diagnostics.some((item) => item.code === "MODEL_BASELINE_STALE"));
  assertJsonError(runCli(cwd, "change", "apply-model", id, "--json"), /结构或文件事实错误/);
});
test("delete operations remove canonical .puml and preserve Git independence", () => {
  const cwd = tempDir();
  writeDiagram(cwd, "obsolete.puml", "class Obsolete");
  const { id, diagramPath } = prepareCandidate(cwd, "delete-flow", "class Replacement");
  const manifestFile = path.join(packRoot(cwd, id), "change.yaml");
  const manifest = parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.diagrams.unshift({ path: ".arch-lens/diagrams/obsolete.puml", operation: "delete" });
  fs.writeFileSync(manifestFile, stringify(manifest, { lineWidth: 0 }));
  completeDecisions(path.join(packRoot(cwd, id), "decisions.md"), diagramPath);
  assertJsonSuccess(runCli(cwd, "change", "render", id, "--json"));
  assertJsonSuccess(runCli(cwd, "change", "record-approval", id, "--stage", "design", "--reviewer", "BeaconSage", "--json"));
  assertJsonSuccess(runCli(cwd, "change", "apply-model", id, "--json"));
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/diagrams/obsolete.puml")), false);
  assert.equal(fs.existsSync(path.join(cwd, diagramPath)), true);
  const repeated = assertJsonSuccess(runCli(cwd, "change", "apply-model", id, "--json"));
  assert.deepEqual(repeated.applied, []);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/diagrams/obsolete.puml")), false);
  assert.equal(statusFor(cwd, id).designApproval.modelApplied, true);
});

test("template and public commands reject Git-era verification fields", () => {
  const cwd = tempDir();
  initWorkspace(cwd);
  assertJsonSuccess(runCli(cwd, "change", "new", "contract", "--json"));
  const root = packRoot(cwd, "contract");
  const verification = fs.readFileSync(path.join(root, "verification.md"), "utf8");
  assert.doesNotMatch(verification, /implementation-commit|implementation-patch-id/);
  assert.match(verification, /design-digest=pending/);
  const help = runCli(cwd, "change", "--help");
  assert.doesNotMatch(help.stdout, /archive-evidence|refresh-base(?!line)|Git|commit/i);
});

function prepareCandidate(cwd, id, body = "class Candidate") {
  initWorkspace(cwd);
  completePrinciples(cwd);
  assertJsonSuccess(runCli(cwd, "change", "new", id, "--json"));
  const root = packRoot(cwd, id);
  const diagramPath = ".arch-lens/diagrams/local-flow.puml";
  writeCandidate(cwd, id, "local-flow.puml", body);
  const manifestFile = path.join(root, "change.yaml");
  const manifest = parse(fs.readFileSync(manifestFile, "utf8"));
  manifest.diagrams = [{ path: diagramPath, operation: "add" }];
  fs.writeFileSync(manifestFile, stringify(manifest, { lineWidth: 0 }));
  completeProposal(path.join(root, "proposal.md"), id);
  completeDecisions(path.join(root, "decisions.md"), diagramPath);
  completeTasks(path.join(root, "tasks.md"));
  return { id, diagramPath };
}

function packRoot(cwd, id) {
  return path.join(cwd, ".arch-lens/changes", id);
}

function statusFor(cwd, id) {
  return assertJsonSuccess(runCli(cwd, "change", "status", id, "--json"));
}
