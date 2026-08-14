import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parse, stringify } from "yaml";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "bin", "arch-lens.js");

test("packaged Skill routes semantic work through protocol 1 without AI self-approval", () => {
  const skillRoot = path.join(root, ".agents/skills/arch-lens");
  const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  assert.match(skill, /arch-lens capabilities --json/);
  assert.match(skill, /workflowProtocol.*1/);
  assert.match(skill, /没有当前会话中的明确授权，禁止调用 `change record-approval`/);
  assert.match(skill, /唯一业务模型/);
  assert.match(skill, /默认只生成或修改一张主视图，通常最多三张/);
  assert.match(skill, /第四张及以后.*人类明确同意/s);
  assert.match(skill, /不按 AC、测试案例、接口或相近场景逐图生成/);
  assert.equal(fs.existsSync(path.join(skillRoot, "workflows/change.md")), false);
  for (const file of ["understand.md", "propose-change.md", "review-model.md", "apply-change.md", "review-implementation.md", "close-change.md"]) {
    assert.equal(fs.existsSync(path.join(skillRoot, "workflows", file)), true, file);
  }
  const contract = fs.readFileSync(path.join(skillRoot, "references/change-pack-contract.md"), "utf8");
  assert.match(contract, /CLI 只做事实/);
  assert.match(contract, /tasks\.md.*不绑定/s);
  assert.match(contract, /避免 commit 哈希自引用/);
  const modelingGuide = fs.readFileSync(path.join(skillRoot, "references/modeling-guide.md"), "utf8");
  assert.match(modelingGuide, /视图预算与复用/);
  assert.match(modelingGuide, /图种.*选择菜单|不能因为指南列出了六种图就各画一张/s);
  const propose = fs.readFileSync(path.join(skillRoot, "workflows/propose-change.md"), "utf8");
  assert.match(propose, /写任何 `.puml` 前.*视图清单/);
  assert.match(propose, /第四张及以后.*人类明确同意/s);
  const review = fs.readFileSync(path.join(skillRoot, "workflows/review-model.md"), "utf8");
  assert.match(review, /对照生成前视图清单检查预算/);
  assert.match(review, /缺少生成前人类明确同意.*收敛候选/s);
  assert.match(review, /标题.*没有把图自身标记为 Candidate、Draft、Approved/s);
  const plantUmlContract = fs.readFileSync(path.join(skillRoot, "references/plantuml-contract.md"), "utf8");
  assert.match(plantUmlContract, /title.*不得用 `Candidate`、`Draft`、`Approved`.*图自身的工作流阶段/s);
  assert.match(plantUmlContract, /候选与正式状态只由目录位置和批准记录表达/);
  const metadata = fs.readFileSync(path.join(skillRoot, "agents/openai.yaml"), "utf8");
  assert.match(metadata, /\$arch-lens/);
  assert.match(metadata, /smallest durable PlantUML view set/);
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.match(readme, /最少必要的视图/);
  assert.match(readme, /PlantUML 是唯一可编辑的业务模型/);
  assert.match(readme, /设计批准和完成验收都来自人类明确决定/);
});

test("change new creates a fixed protocol 1 pack and rejects duplicate IDs", () => {
  const cwd = protocolRepo();
  const created = run(cwd, "change", "new", "retry-policy", "--json");
  assert.equal(created.status, 0, created.stderr || created.stdout);
  const payload = JSON.parse(created.stdout);
  assert.equal(payload.workflowProtocol, 1);
  assert.equal(payload.id, "retry-policy");
  const pack = path.join(cwd, ".arch-lens/changes/retry-policy");
  assert.deepEqual(fs.readdirSync(pack).sort(), ["approval.yaml", "change.yaml", "decisions.md", "diagrams", "proposal.md", "tasks.md", "verification.md"]);
  assert.equal(parse(fs.readFileSync(path.join(pack, "change.yaml"), "utf8")).baseCommit, git(cwd, "rev-parse", "HEAD"));
  assert.deepEqual(parse(fs.readFileSync(path.join(pack, "approval.yaml"), "utf8")).design, []);

  assertJsonError(run(cwd, "change", "new", "Upper_Case", "--json"), /kebab-case/);
  assertJsonError(run(cwd, "change", "new", "retry-policy", "--json"), /已存在/);
  const status = run(cwd, "change", "status", "--json");
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(JSON.parse(status.stdout).changes.map((item) => item.id), ["retry-policy"]);
  const detailed = statusFor(cwd, "retry-policy");
  assert.deepEqual(detailed.plantUml, { checked: false, valid: null });
});

test("change validate, diff and render cover isolated add, modify and delete overlays", () => {
  const cwd = protocolRepo();
  writeDiagram(cwd, "existing/modify.domain.puml", "Before");
  writeDiagram(cwd, "existing/delete.domain.puml", "DeleteMe");
  commitAll(cwd, "baseline diagrams");
  assert.equal(run(cwd, "change", "new", "reshape-domain", "--json").status, 0);

  writeCandidate(cwd, "reshape-domain", "existing/modify.domain.puml", "After");
  writeCandidate(cwd, "reshape-domain", "new/add.domain.puml", "Added");
  preparePack(cwd, "reshape-domain", [
    { path: ".arch-lens/diagrams/existing/modify.domain.puml", operation: "modify" },
    { path: ".arch-lens/diagrams/existing/delete.domain.puml", operation: "delete" },
    { path: ".arch-lens/diagrams/new/add.domain.puml", operation: "add" }
  ]);

  const fake = fakePlantUml();
  const validated = run(cwd, "change", "validate", "reshape-domain", "--json", { ARCH_LENS_PLANTUML: fake });
  assert.equal(validated.status, 0, validated.stderr || validated.stdout);
  const diffed = run(cwd, "change", "diff", "reshape-domain", "--json");
  assert.equal(diffed.status, 0, diffed.stderr || diffed.stdout);
  const diff = JSON.parse(diffed.stdout);
  assert.deepEqual(diff.files.map((item) => item.operation), ["modify", "delete", "add"]);
  assert.match(diff.patch, /modify\.domain\.puml/);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/changes/reshape-domain/rendered")), false);

  const rendered = run(cwd, "change", "render", "reshape-domain", "--json", { ARCH_LENS_PLANTUML: fake });
  assert.equal(rendered.status, 0, rendered.stderr || rendered.stdout);
  const view = JSON.parse(rendered.stdout);
  assert.equal(fs.existsSync(path.join(cwd, view.output, "existing/modify.domain.svg")), true);
  assert.equal(fs.existsSync(path.join(cwd, view.output, "new/add.domain.svg")), true);
  assert.equal(fs.existsSync(path.join(cwd, view.output, "existing/delete.domain.svg")), false);
  const before = fs.readFileSync(path.join(cwd, view.output, "existing/modify.domain.svg"));

  const failed = run(cwd, "change", "render", "reshape-domain", "--json", {
    ARCH_LENS_PLANTUML: fake,
    FAKE_PLANTUML_WRONG_SVG_COUNT: "1"
  });
  assertJsonDiagnostic(failed, "PLANTUML_OUTPUT_PROTOCOL");
  assert.deepEqual(fs.readFileSync(path.join(cwd, view.output, "existing/modify.domain.svg")), before);

  const manifestPath = path.join(cwd, ".arch-lens/changes/reshape-domain/change.yaml");
  const manifest = parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.diagrams = manifest.diagrams.filter((item) => item.path !== ".arch-lens/diagrams/new/add.domain.puml");
  fs.writeFileSync(manifestPath, stringify(manifest, { lineWidth: 0 }));
  fs.rmSync(path.join(cwd, ".arch-lens/changes/reshape-domain/diagrams/new/add.domain.puml"));
  const refreshed = run(cwd, "change", "render", "reshape-domain", "--json", { ARCH_LENS_PLANTUML: fake });
  assert.equal(refreshed.status, 0, refreshed.stderr || refreshed.stdout);
  assert.equal(fs.existsSync(path.join(cwd, view.output, "new/add.domain.svg")), false);
});

test("active Change Packs reject overlapping PlantUML ownership", () => {
  const cwd = protocolRepo();
  assert.equal(run(cwd, "change", "new", "first-change", "--json").status, 0);
  writeCandidate(cwd, "first-change", "shared/domain.puml", "Shared");
  preparePack(cwd, "first-change", [{ path: ".arch-lens/diagrams/shared/domain.puml", operation: "add" }]);
  commitAll(cwd, "first active pack");
  assert.equal(run(cwd, "change", "new", "second-change", "--json").status, 0);
  preparePack(cwd, "second-change", [{ path: ".arch-lens/diagrams/shared/domain.puml", operation: "add" }]);
  assertJsonDiagnostic(run(cwd, "change", "validate", "second-change", "--json", { ARCH_LENS_PLANTUML: fakePlantUml() }), "DIAGRAM_CHANGE_CONFLICT");
});

test("change new allows dirty disjoint active packs but rejects implementation or canonical model dirt", () => {
  const cwd = protocolRepo();
  assert.equal(run(cwd, "change", "new", "first-change", "--json").status, 0);
  writeCandidate(cwd, "first-change", "one/domain.puml", "One");
  preparePack(cwd, "first-change", [{ path: ".arch-lens/diagrams/one/domain.puml", operation: "add" }]);
  const second = run(cwd, "change", "new", "second-change", "--json");
  assert.equal(second.status, 0, second.stderr || second.stdout);

  fs.writeFileSync(path.join(cwd, "implementation.js"), "export {};\n");
  assertJsonError(run(cwd, "change", "new", "third-change", "--json"), /implementation\.js/);
  fs.rmSync(path.join(cwd, "implementation.js"));
  writeDiagram(cwd, "unapproved/domain.puml", "Unapproved");
  assertJsonError(run(cwd, "change", "new", "third-change", "--json"), /unapproved\/domain\.puml/);
});

test("delete-only Change Packs can be approved and applied without candidate files", () => {
  const cwd = protocolRepo();
  writeDiagram(cwd, "obsolete/domain.puml", "Obsolete");
  commitAll(cwd, "add obsolete diagram");
  assert.equal(run(cwd, "change", "new", "remove-obsolete", "--json").status, 0);
  preparePack(cwd, "remove-obsolete", [{ path: ".arch-lens/diagrams/obsolete/domain.puml", operation: "delete" }]);
  const rejected = run(cwd, "change", "apply-model", "remove-obsolete", "--json");
  assertJsonError(rejected, /design approval/);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/diagrams/obsolete/domain.puml")), true);
  const approved = run(cwd, "change", "record-approval", "remove-obsolete", "--stage", "design", "--reviewer", "Alice", "--json", { ARCH_LENS_PLANTUML: fakePlantUml() });
  assert.equal(approved.status, 0, approved.stderr || approved.stdout);
  const applied = run(cwd, "change", "apply-model", "remove-obsolete", "--json");
  assert.equal(applied.status, 0, applied.stderr || applied.stdout);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/diagrams/obsolete/domain.puml")), false);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/diagrams/.gitkeep")), true);
  assert.equal(statusFor(cwd, "remove-obsolete").designApproval.state, "current");
});

test("change validation rejects undeclared, traversing, mismatched and symlinked diagram entries", () => {
  const cwd = protocolRepo();
  assert.equal(run(cwd, "change", "new", "secure-model", "--json").status, 0);
  writeCandidate(cwd, "secure-model", "declared/domain.puml", "Declared");
  preparePack(cwd, "secure-model", [{ path: ".arch-lens/diagrams/declared/domain.puml", operation: "add" }]);
  const fake = fakePlantUml();

  const packRoot = path.join(cwd, ".arch-lens/changes/secure-model");
  fs.writeFileSync(path.join(packRoot, "extra.md"), "unexpected\n");
  assertJsonDiagnostic(run(cwd, "change", "validate", "secure-model", "--json", { ARCH_LENS_PLANTUML: fake }), "ARTIFACT_UNKNOWN");
  fs.rmSync(path.join(packRoot, "extra.md"));

  const approvalPath = path.join(packRoot, "approval.yaml");
  fs.writeFileSync(approvalPath, "schemaVersion: 1\nworkflowProtocol: 2\ndesign: []\ncompletion: []\n");
  assertJsonDiagnostic(run(cwd, "change", "validate", "secure-model", "--json", { ARCH_LENS_PLANTUML: fake }), "APPROVAL_SCHEMA_INVALID");
  fs.writeFileSync(approvalPath, "schemaVersion: 1\nworkflowProtocol: 1\ndesign: not-an-array\ncompletion: []\n");
  assertJsonDiagnostic(run(cwd, "change", "validate", "secure-model", "--json", { ARCH_LENS_PLANTUML: fake }), "APPROVAL_SCHEMA_INVALID");
  fs.writeFileSync(approvalPath, "schemaVersion: 1\nworkflowProtocol: 1\ndesign: []\ncompletion: []\n");

  const tasksPath = path.join(packRoot, "tasks.md");
  const tasksSource = fs.readFileSync(tasksPath);
  fs.rmSync(tasksPath);
  const missingStatus = statusFor(cwd, "secure-model");
  assert.equal(missingStatus.structurallyValid, false);
  assert.ok(missingStatus.diagnostics.some((item) => item.code === "ARTIFACT_REQUIRED"));
  fs.writeFileSync(tasksPath, tasksSource);

  const proposalPath = path.join(packRoot, "proposal.md");
  const proposalSource = fs.readFileSync(proposalPath);
  const externalProposal = path.join(tempDir(), "proposal.md");
  fs.writeFileSync(externalProposal, "outside data\n");
  fs.rmSync(proposalPath);
  fs.symlinkSync(externalProposal, proposalPath);
  assertJsonDiagnostic(run(cwd, "change", "validate", "secure-model", "--json", { ARCH_LENS_PLANTUML: fake }), "ARTIFACT_SYMLINK");
  fs.rmSync(proposalPath);
  fs.writeFileSync(proposalPath, proposalSource);

  const decisionsPath = path.join(packRoot, "decisions.md");
  fs.appendFileSync(decisionsPath, "\n## D001: Duplicate\n\n### Context\nX\n\n### Decision\nX\n\n### Alternatives\nX\n\n### Consequences\nX\n");
  assertJsonDiagnostic(run(cwd, "change", "validate", "secure-model", "--json", { ARCH_LENS_PLANTUML: fake }), "DECISION_DUPLICATE");
  fs.writeFileSync(decisionsPath, decisionsText());

  writeCandidate(cwd, "secure-model", "undeclared/domain.puml", "Undeclared");
  assertJsonDiagnostic(run(cwd, "change", "validate", "secure-model", "--json", { ARCH_LENS_PLANTUML: fake }), "UNDECLARED_CANDIDATE_DIAGRAM");
  fs.rmSync(path.join(cwd, ".arch-lens/changes/secure-model/diagrams/undeclared/domain.puml"));

  const manifestPath = path.join(cwd, ".arch-lens/changes/secure-model/change.yaml");
  const manifest = parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.workflowProtocol = 2;
  fs.writeFileSync(manifestPath, stringify(manifest));
  assertJsonDiagnostic(run(cwd, "change", "validate", "secure-model", "--json", { ARCH_LENS_PLANTUML: fake }), "CHANGE_WORKFLOW_PROTOCOL");
  manifest.workflowProtocol = 1;
  manifest.diagrams = [{ path: ".arch-lens/diagrams/../../outside.puml", operation: "add", extra: true }];
  fs.writeFileSync(manifestPath, stringify(manifest));
  const traversal = run(cwd, "change", "validate", "secure-model", "--json", { ARCH_LENS_PLANTUML: fake });
  assertJsonDiagnostic(traversal, "DIAGRAM_PATH_INVALID");
  assertJsonDiagnostic(traversal, "UNKNOWN_SCHEMA_KEY");
  assert.equal(run(cwd, "change", "status", "secure-model", "--json").status, 0);

  manifest.diagrams = [{ path: ".arch-lens/diagrams/declared/domain.puml", operation: "modify" }];
  fs.writeFileSync(manifestPath, stringify(manifest));
  assertJsonDiagnostic(run(cwd, "change", "validate", "secure-model", "--json", { ARCH_LENS_PLANTUML: fake }), "DIAGRAM_OPERATION_MISMATCH");

  const external = path.join(tempDir(), "external.puml");
  fs.writeFileSync(external, "@startuml\nclass External\n@enduml\n");
  const linked = path.join(cwd, ".arch-lens/changes/secure-model/diagrams/linked.puml");
  fs.symlinkSync(external, linked);
  manifest.diagrams = [{ path: ".arch-lens/diagrams/linked.puml", operation: "add" }];
  fs.writeFileSync(manifestPath, stringify(manifest));
  assertJsonDiagnostic(run(cwd, "change", "validate", "secure-model", "--json", { ARCH_LENS_PLANTUML: fake }), "DIAGRAM_SYMLINK");
});

test("change render refuses a symlinked generated-output directory", () => {
  const cwd = protocolRepo();
  assert.equal(run(cwd, "change", "new", "safe-render", "--json").status, 0);
  writeCandidate(cwd, "safe-render", "safe/domain.puml", "Safe");
  preparePack(cwd, "safe-render", [{ path: ".arch-lens/diagrams/safe/domain.puml", operation: "add" }]);
  const external = tempDir();
  fs.symlinkSync(external, path.join(cwd, ".arch-lens/changes/safe-render/rendered"));
  assertJsonDiagnostic(run(cwd, "change", "render", "safe-render", "--json", { ARCH_LENS_PLANTUML: fakePlantUml() }), "ARTIFACT_SYMLINK");
  assert.deepEqual(fs.readdirSync(external), []);
});

test("design digest, model-only commit, evidence, completion approval and archive form a closed loop", () => {
  const cwd = protocolRepo();
  assert.equal(run(cwd, "change", "new", "notification-policy", "--json").status, 0);
  writeCandidate(cwd, "notification-policy", "notification/policy.state.puml", "Policy");
  preparePack(cwd, "notification-policy", [{ path: ".arch-lens/diagrams/notification/policy.state.puml", operation: "add" }], { openQuestion: true });
  const fake = fakePlantUml();

  assertJsonDiagnostic(run(cwd, "change", "record-approval", "notification-policy", "--stage", "design", "--reviewer", "Alice", "--json", { ARCH_LENS_PLANTUML: fake }), "OPEN_QUESTIONS_REMAIN");
  preparePack(cwd, "notification-policy", [{ path: ".arch-lens/diagrams/notification/policy.state.puml", operation: "add" }]);
  const approved = run(cwd, "change", "record-approval", "notification-policy", "--stage", "design", "--reviewer", "Alice", "--json", { ARCH_LENS_PLANTUML: fake });
  assert.equal(approved.status, 0, approved.stderr || approved.stdout);
  const designDigest = JSON.parse(approved.stdout).digest;
  assert.match(designDigest, /^[0-9a-f]{64}$/);
  assert.equal(statusFor(cwd, "notification-policy").designApproval.modelApplied, false);

  const pack = path.join(cwd, ".arch-lens/changes/notification-policy");
  const tasks = path.join(pack, "tasks.md");
  const proposal = path.join(pack, "proposal.md");
  const principles = path.join(cwd, ".arch-lens/principles.md");
  const originalTasks = fs.readFileSync(tasks, "utf8");
  fs.writeFileSync(tasks, originalTasks.replace("[ ]", "[x]"));
  assert.equal(statusFor(cwd, "notification-policy").designApproval.state, "current");
  fs.writeFileSync(tasks, originalTasks);
  fs.appendFileSync(proposal, "\nChanged after approval.\n");
  assert.equal(statusFor(cwd, "notification-policy").designApproval.state, "stale");
  fs.writeFileSync(proposal, proposalText(false));
  fs.appendFileSync(principles, "\nChanged principle.\n");
  assert.equal(statusFor(cwd, "notification-policy").designApproval.state, "stale");
  fs.writeFileSync(principles, principlesText());
  assert.equal(statusFor(cwd, "notification-policy").designApproval.state, "current");

  const applied = run(cwd, "change", "apply-model", "notification-policy", "--json");
  assert.equal(applied.status, 0, applied.stderr || applied.stdout);
  assert.equal(fs.existsSync(path.join(pack, "diagrams/notification/policy.state.puml")), false);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/diagrams/notification/policy.state.puml")), true);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/diagrams/.gitkeep")), false);
  assert.equal(statusFor(cwd, "notification-policy").structurallyValid, true);
  assert.equal(statusFor(cwd, "notification-policy").designApproval.modelApplied, true);
  commitAll(cwd, "model notification policy");
  const afterModel = statusFor(cwd, "notification-policy");
  assert.match(afterModel.designApproval.modelCommit, /^[0-9a-f]{40}$/);
  const evidence = run(cwd, "change", "evidence", "notification-policy", "--json");
  assert.equal(evidence.status, 0, evidence.stderr || evidence.stdout);
  assert.equal(JSON.parse(evidence.stdout).modelCommit, afterModel.designApproval.modelCommit);

  fs.writeFileSync(path.join(cwd, "implementation.txt"), "implemented\n");
  commitAll(cwd, "implement notification policy");
  const implementationCommit = git(cwd, "rev-parse", "HEAD");
  assertJsonDiagnostic(run(cwd, "change", "record-approval", "notification-policy", "--stage", "completion", "--reviewer", "Bob", "--json", { ARCH_LENS_PLANTUML: fake }), "TASKS_INCOMPLETE");
  fs.writeFileSync(tasks, originalTasks.replace("[ ]", "[x]"));
  fs.writeFileSync(path.join(pack, "verification.md"), verificationText(designDigest, implementationCommit));
  assertJsonError(run(cwd, "change", "record-approval", "notification-policy", "--stage", "completion", "--reviewer", "Bob", "--json", { ARCH_LENS_PLANTUML: fake }), /必须已提交且工作区干净/);
  commitAll(cwd, "verify notification policy");

  const completed = run(cwd, "change", "record-approval", "notification-policy", "--stage", "completion", "--reviewer", "Bob", "--json", { ARCH_LENS_PLANTUML: fake });
  assert.equal(completed.status, 0, completed.stderr || completed.stdout);
  const completion = JSON.parse(completed.stdout);
  assert.equal(completion.implementationCommit, git(cwd, "rev-parse", "HEAD"));
  assert.equal(statusFor(cwd, "notification-policy").archiveEligible, true);

  fs.writeFileSync(path.join(cwd, "unrelated.txt"), "dirty\n");
  assert.equal(statusFor(cwd, "notification-policy").archiveEligible, false);
  assertJsonError(run(cwd, "change", "archive", "notification-policy", "--json"), /只允许 approval\.yaml/);
  fs.rmSync(path.join(cwd, "unrelated.txt"));
  assert.equal(statusFor(cwd, "notification-policy").archiveEligible, true);

  const archived = run(cwd, "change", "archive", "notification-policy", "--json");
  assert.equal(archived.status, 0, archived.stderr || archived.stdout);
  const archivedPath = path.join(cwd, JSON.parse(archived.stdout).archivedPath);
  assert.equal(fs.existsSync(archivedPath), true);
  assert.equal(fs.existsSync(pack), false);
  assert.match(git(cwd, "status", "--porcelain", "--untracked-files=all"), /\.arch-lens\/changes\/archive/);
});

function protocolRepo() {
  const cwd = gitRepo();
  const initialized = run(cwd, "init", "--json");
  assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);
  fs.writeFileSync(path.join(cwd, ".arch-lens/principles.md"), principlesText());
  commitAll(cwd, "initialize protocol 1");
  return cwd;
}

function preparePack(cwd, id, diagrams, options = {}) {
  const root = path.join(cwd, ".arch-lens/changes", id);
  const manifestPath = path.join(root, "change.yaml");
  const manifest = parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.diagrams = diagrams;
  fs.writeFileSync(manifestPath, stringify(manifest, { lineWidth: 0 }));
  fs.writeFileSync(path.join(root, "proposal.md"), proposalText(options.openQuestion));
  fs.writeFileSync(path.join(root, "decisions.md"), decisionsText());
  fs.writeFileSync(path.join(root, "tasks.md"), "# Implementation Tasks\n\n- [ ] T001 [AC-001] Implement and test the approved behavior.\n");
  fs.writeFileSync(path.join(root, "verification.md"), pendingVerificationText());
}

function proposalText(openQuestion) {
  return `# Change Proposal

## Problem And Evidence

Observed behavior conflicts with the product requirement.

## Goals

Make the approved outcome explicit and testable.

## Non-goals

Do not redesign unrelated capabilities.

## Acceptance Criteria

- AC-001: The approved behavior is implemented and verified.

## Assumptions

The current Git baseline is representative.

## Open Questions

- [${openQuestion ? " " : "x"}] Q001: Confirm the intended policy. ${openQuestion ? "" : "Resolved by reviewer."}
`;
}

function decisionsText() {
  return `# Design Decisions

## D001: Keep one explicit responsibility

### Context

The change requires a stable ownership boundary.

### Decision

Use the responsibility shown in the PlantUML candidate.

### Alternatives

Distribute the behavior across callers.

### Consequences

The boundary is easier to review and test.
`;
}

function pendingVerificationText() {
  return `# Implementation Verification

<!-- arch-lens: semantic-review=pending -->
<!-- arch-lens: design-digest=pending -->
<!-- arch-lens: implementation-commit=pending -->

## Evidence

Evidence will be recorded after implementation.

## Acceptance Results

- AC-001: NOT-RUN - Implementation has not started.

## Semantic Review

Pending implementation review.

## Residual Risks

Pending implementation review.
`;
}

function verificationText(designDigest, implementationCommit) {
  return `# Implementation Verification

<!-- arch-lens: semantic-review=pass -->
<!-- arch-lens: design-digest=${designDigest} -->
<!-- arch-lens: implementation-commit=${implementationCommit} -->

## Evidence

The real project tests and code diff were reviewed successfully.

## Acceptance Results

- AC-001: PASS - The implementation and tests demonstrate the approved behavior.

## Semantic Review

The implementation preserves the approved goal, rule ownership and responsibility boundary.

## Residual Risks

No known residual semantic risk.
`;
}

function principlesText() {
  return `# Project Modeling Principles

## Purpose

Make business decisions easy for humans to review.

## Modeling Boundary

PlantUML is the only business model.

## Decision Principles

Responsibilities must remain explicit.

## Quality Gates

Humans approve design and completion.
`;
}

function writeDiagram(cwd, relative, className) {
  const target = path.join(cwd, ".arch-lens/diagrams", relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `@startuml\n' arch-lens: type=domain\n' arch-lens: question=Which concept owns this policy?\ntitle Policy domain\nclass ${className}\n@enduml\n`);
}

function writeCandidate(cwd, id, relative, className) {
  const target = path.join(cwd, ".arch-lens/changes", id, "diagrams", relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `@startuml\n' arch-lens: type=domain\n' arch-lens: question=Which concept owns this policy?\ntitle Policy domain\nclass ${className}\n@enduml\n`);
}

function statusFor(cwd, id) {
  const result = run(cwd, "change", "status", id, "--json");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function fakePlantUml() {
  const target = path.join(tempDir(), "plantuml-fake.mjs");
  fs.writeFileSync(target, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (process.env.PLANTUML_SECURITY_PROFILE !== "SANDBOX" || !args.includes("-headless")) process.exit(9);
if (args.includes("-version")) { console.log("PlantUML version 1.2026.6"); process.exit(0); }
let source = "";
for await (const chunk of process.stdin) source += chunk;
if (args.includes("-syntax")) { if (source.includes("SYNTAX_ERROR")) process.exit(200); console.log("CLASS"); process.exit(0); }
const count = (source.match(/@startuml\\b/gi) ?? []).length;
const rendered = process.env.FAKE_PLANTUML_WRONG_SVG_COUNT && count > 1 ? count - 1 : count;
for (let index = 0; index < rendered; index += 1) process.stdout.write('<svg xmlns="http://www.w3.org/2000/svg"><text>' + index + '</text></svg>');
`);
  fs.chmodSync(target, 0o755);
  return target;
}

function gitRepo() {
  const cwd = tempDir();
  git(cwd, "init", "-q");
  git(cwd, "config", "user.email", "arch-lens@example.test");
  git(cwd, "config", "user.name", "Arch Lens Test");
  fs.writeFileSync(path.join(cwd, "seed.txt"), "seed\n");
  commitAll(cwd, "seed");
  return cwd;
}

function commitAll(cwd, message) {
  git(cwd, "add", ".");
  git(cwd, "commit", "-qm", message);
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function run(cwd, ...raw) {
  const env = typeof raw.at(-1) === "object" ? raw.pop() : {};
  return spawnSync(process.execPath, [cli, ...raw], { cwd, encoding: "utf8", env: { ...process.env, ARCH_LENS_TEST_MODE: "1", ARCH_LENS_TEST_SKIP_RUNTIME: "1", ...env } });
}

function assertJsonError(result, pattern) {
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schemaVersion, 1);
  assert.match(payload.error, pattern);
}

function assertJsonDiagnostic(result, code) {
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.ok(payload.diagnostics.some((item) => item.code === code), JSON.stringify(payload));
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "arch-lens-change-test-"));
}
