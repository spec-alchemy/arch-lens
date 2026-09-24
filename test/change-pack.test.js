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
  assertJsonError(runCli(cwd, "change", "refresh-baseline", id, "--json"), /已经提升/);

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
