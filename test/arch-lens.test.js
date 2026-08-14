import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "bin", "arch-lens.js");

test("CLI exposes the draft Skill-first surface and keeps removed or semantic commands absent", () => {
  assert.notEqual(fs.statSync(cli).mode & 0o111, 0, "npm bin entry must remain executable");
  const version = run(tempDir(), "--version");
  const help = run(tempDir(), "--help");
  const diagramsHelp = run(tempDir(), "diagrams", "--help");
  const changeHelp = run(tempDir(), "change", "--help");
  const capabilities = run(tempDir(), "capabilities", "--json");
  const renderHelp = run(tempDir(), "diagrams", "render", "--help");
  const removed = run(tempDir(), "model", "view");
  const semanticReview = run(tempDir(), "change", "review");
  const removedBundle = run(tempDir(), "change", "bundle", "example");
  const renderOutsideRepository = run(tempDir(), "diagrams", "render", "--json");

  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), "0.0.0-draft");
  assert.match(help.stdout, /Skill-first 的 PlantUML/);
  assert.match(help.stdout, /capabilities/);
  assert.match(help.stdout, /diagrams/);
  assert.match(help.stdout, /change/);
  assert.doesNotMatch(help.stdout, /\bmodel\b/);
  assert.match(diagramsHelp.stdout, /list/);
  assert.match(diagramsHelp.stdout, /check/);
  assert.match(diagramsHelp.stdout, /render/);
  assert.match(renderHelp.stdout, /默认：Git 根\/\.arch-lens\/rendered/);
  assert.match(changeHelp.stdout, /record-approval/);
  assert.doesNotMatch(changeHelp.stdout, /bundle/);
  assert.doesNotMatch(changeHelp.stdout, /\breview\b|\bapprove\b|\bverify\b/);
  assert.deepEqual(JSON.parse(capabilities.stdout), {
    schemaVersion: 1,
    cliVersion: "0.0.0-draft",
    workflowProtocol: 1,
    features: ["plantuml-batch-render", "change-pack-v1", "approval-digest-v1", "completion-approval-v1", "managed-plantuml-runtime-v1", "change-overlay-v1"]
  });
  assert.equal(removed.status, 1);
  assert.match(removed.stderr, /未知命令/);
  assert.equal(semanticReview.status, 1);
  assert.equal(removedBundle.status, 1);
  assertJsonError(renderOutsideRepository, /只支持 Git 仓库/);
});

test("init creates protocol 1 assets and current skill without overwriting them, then remains idempotent", () => {
  const cwd = gitRepo();
  fs.writeFileSync(path.join(cwd, "AGENTS.md"), "# Existing\n\nPreserve me.\n");
  commitAll(cwd, "existing agents");

  const first = run(cwd, "init", "--json");
  assert.equal(first.status, 0, first.stderr);
  const payload = JSON.parse(first.stdout);
  assert.deepEqual(payload, {
    schemaVersion: 1,
    created: true,
    workflowProtocol: 1,
    diagramsPath: ".arch-lens/diagrams",
    principlesPath: ".arch-lens/principles.md",
    changesPath: ".arch-lens/changes",
    plantUmlRuntime: {
      installed: false,
      skipped: true,
      version: "1.2026.6",
      source: "https://github.com/plantuml/plantuml/releases/download/v1.2026.6/plantuml-1.2026.6.jar",
      path: null
    }
  });
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/diagrams/.gitkeep")), true);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/changes/archive/.gitkeep")), true);
  assert.match(fs.readFileSync(path.join(cwd, ".arch-lens/principles.md"), "utf8"), /Project Modeling Principles/);
  assert.equal(fs.existsSync(path.join(cwd, ".agents/skills/arch-lens/references/modeling-guide.md")), true);
  assert.match(fs.readFileSync(path.join(cwd, ".agents/skills/arch-lens/SKILL.md"), "utf8"), /PlantUML/);
  assert.match(fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8"), /^# Existing\n\nPreserve me\./);
  assert.match(fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8"), /workflowProtocol 1/);
  assert.match(fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8"), /默认一张主视图、通常最多三张/);
  assert.equal(count(fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8"), "ARCH-LENS:START"), 1);
  assert.match(fs.readFileSync(path.join(cwd, ".gitignore"), "utf8"), /^\.arch-lens\/rendered\/$/m);

  const skill = path.join(cwd, ".agents/skills/arch-lens/SKILL.md");
  fs.writeFileSync(path.join(cwd, ".arch-lens/principles.md"), "# Custom principles\n");
  fs.appendFileSync(skill, "\nproject-local customization\n");
  const second = run(cwd, "init", "--json");
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).created, false);
  assert.doesNotMatch(fs.readFileSync(skill, "utf8"), /project-local customization/);
  assert.equal(fs.readFileSync(path.join(cwd, ".arch-lens/principles.md"), "utf8"), "# Custom principles\n");
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/diagrams/.gitkeep")), true);
});

test("init does not add placeholder files to populated workspaces", () => {
  const cwd = gitRepo();
  assert.equal(run(cwd, "init", "--json").status, 0);
  fs.rmSync(path.join(cwd, ".arch-lens/diagrams/.gitkeep"));
  fs.writeFileSync(path.join(cwd, ".arch-lens/diagrams/domain.puml"), diagram("domain", "已有模型是什么？", "已有模型", "class Existing"));
  commitAll(cwd, "populate model workspace");
  const before = repositoryBytes(cwd);
  const initialized = run(cwd, "init", "--json");
  assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/diagrams/.gitkeep")), false);
  assert.deepEqual(repositoryBytes(cwd), before);
  assert.equal(gitStatus(cwd), "");
});

test("init installs, reuses and repairs the locked managed PlantUML runtime before repository writes", () => {
  const source = path.join(tempDir(), "plantuml.jar");
  fs.writeFileSync(source, "test plantuml jar\n");
  const digest = crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex");
  const cache = fs.realpathSync(tempDir());
  const javaDir = tempDir();
  const java = fakeManagedJava(javaDir);
  const env = {
    ARCH_LENS_TEST_SKIP_RUNTIME: "",
    ARCH_LENS_TEST_CACHE: cache,
    ARCH_LENS_TEST_PLANTUML_SOURCE: source,
    ARCH_LENS_TEST_PLANTUML_SHA256: digest,
    PATH: `${javaDir}${path.delimiter}/usr/bin:/bin`
  };
  const cwd = gitRepo();
  const installed = run(cwd, "init", "--json", env);
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  const runtime = JSON.parse(installed.stdout).plantUmlRuntime;
  assert.equal(runtime.installed, true);
  assert.equal(runtime.version, "1.2026.6");
  assert.deepEqual(fs.readFileSync(runtime.path), fs.readFileSync(source));

  const noSource = { ...env, ARCH_LENS_TEST_PLANTUML_SOURCE: "" };
  const reused = run(cwd, "init", "--json", noSource);
  assert.equal(reused.status, 0, reused.stderr || reused.stdout);
  assert.equal(JSON.parse(reused.stdout).plantUmlRuntime.installed, false);

  fs.writeFileSync(runtime.path, "corrupt\n");
  const repaired = run(cwd, "init", "--json", env);
  assert.equal(repaired.status, 0, repaired.stderr || repaired.stdout);
  assert.equal(JSON.parse(repaired.stdout).plantUmlRuntime.installed, true);
  assert.deepEqual(fs.readFileSync(runtime.path), fs.readFileSync(source));

  const model = path.join(cwd, ".arch-lens/diagrams/runtime.domain.puml");
  fs.writeFileSync(model, diagram("domain", "运行时是否可复用？", "运行时", "class Runtime"));
  const checked = run(cwd, "diagrams", "check", "--json", noSource);
  assert.equal(checked.status, 0, checked.stderr || checked.stdout);
  assert.equal(JSON.parse(checked.stdout).valid, true);
  assert.equal(fs.existsSync(java), true);
});

test("managed runtime failures and symlinked caches leave repository bytes unchanged", () => {
  const source = path.join(tempDir(), "plantuml.jar");
  fs.writeFileSync(source, "unexpected bytes\n");
  const javaDir = tempDir();
  fakeManagedJava(javaDir);
  const cache = fs.realpathSync(tempDir());
  const cwd = gitRepo();
  const before = repositoryBytes(cwd);
  const failed = run(cwd, "init", "--json", {
    ARCH_LENS_TEST_SKIP_RUNTIME: "",
    ARCH_LENS_TEST_CACHE: cache,
    ARCH_LENS_TEST_PLANTUML_SOURCE: source,
    ARCH_LENS_TEST_PLANTUML_SHA256: "0".repeat(64),
    PATH: `${javaDir}${path.delimiter}/usr/bin:/bin`
  });
  assertJsonError(failed, /摘要不匹配/);
  assert.deepEqual(repositoryBytes(cwd), before);

  const target = path.join(cache, "arch-lens", "plantuml", "1.2026.6", "plantuml.jar");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(source, target);
  const linked = run(cwd, "init", "--json", {
    ARCH_LENS_TEST_SKIP_RUNTIME: "",
    ARCH_LENS_TEST_CACHE: cache,
    ARCH_LENS_TEST_PLANTUML_SOURCE: source,
    ARCH_LENS_TEST_PLANTUML_SHA256: crypto.createHash("sha256").update(fs.readFileSync(source)).digest("hex"),
    PATH: `${javaDir}${path.delimiter}/usr/bin:/bin`
  });
  assertJsonError(linked, /符号链接/);
  assert.deepEqual(repositoryBytes(cwd), before);
});

test("init rejects non-Git, unborn and unrelated dirty repositories", () => {
  assertJsonError(run(tempDir(), "init", "--json"), /只支持 Git 仓库/);

  const unborn = tempDir();
  git(unborn, "init", "-q");
  assertJsonError(run(unborn, "init", "--json"), /有效提交/);

  const dirty = gitRepo();
  fs.writeFileSync(path.join(dirty, "dirty.txt"), "dirty\n");
  assertJsonError(run(dirty, "init", "--json"), /请先处理/);
});

test("init hard-fails on incompatible legacy assets and preserves every byte", () => {
  for (const legacyPath of [".arch-lens/architecture.uml", ".arch-lens/architecture-assets.md", ".arch-lens/changes/state.json"]) {
    const legacy = gitRepo();
    fs.mkdirSync(path.dirname(path.join(legacy, legacyPath)), { recursive: true });
    fs.writeFileSync(path.join(legacy, legacyPath), "legacy\n");
    fs.mkdirSync(path.join(legacy, ".agents/skills/arch-lens"), { recursive: true });
    fs.writeFileSync(path.join(legacy, ".agents/skills/arch-lens/SKILL.md"), "old xmi skill\n");
    commitAll(legacy, "legacy");
    const result = run(legacy, "init", "--json");
    assertJsonError(result, /不自动迁移或删除|无法识别的旧/);
    assert.equal(fs.readFileSync(path.join(legacy, legacyPath), "utf8"), "legacy\n");
    assert.equal(fs.existsSync(path.join(legacy, ".arch-lens/diagrams/.gitkeep")), false);
    assert.equal(fs.readFileSync(path.join(legacy, ".agents/skills/arch-lens/SKILL.md"), "utf8"), "old xmi skill\n");
  }
});

test("init preserves untracked or modified legacy data and resumes recognized partial initialization", () => {
  for (const tracked of [false, true]) {
    const cwd = gitRepo();
    const legacy = path.join(cwd, ".arch-lens/architecture.uml");
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, "valuable legacy data\n");
    if (tracked) {
      commitAll(cwd, "legacy");
      fs.appendFileSync(legacy, "modified\n");
    }
    assertJsonError(run(cwd, "init", "--json"), /不自动迁移或删除/);
    assert.match(fs.readFileSync(legacy, "utf8"), /valuable legacy data/);
    assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/diagrams")), false);
  }

  const partial = gitRepo();
  fs.mkdirSync(path.join(partial, ".arch-lens/diagrams"), { recursive: true });
  fs.writeFileSync(path.join(partial, ".arch-lens/diagrams/draft.puml"), diagram("domain", "概念是什么？", "草稿", "class Draft"));
  fs.mkdirSync(path.join(partial, ".agents/skills/arch-lens"), { recursive: true });
  fs.writeFileSync(path.join(partial, ".agents/skills/arch-lens/SKILL.md"), "partial\n");
  const resumed = run(partial, "init", "--json");
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.match(fs.readFileSync(path.join(partial, ".agents/skills/arch-lens/SKILL.md"), "utf8"), /PlantUML/);
  assert.match(fs.readFileSync(path.join(partial, ".arch-lens/diagrams/draft.puml"), "utf8"), /class Draft/);

  const ignored = gitRepo();
  fs.writeFileSync(path.join(ignored, ".gitignore"), ".arch-lens/architecture.uml\n");
  commitAll(ignored, "ignore legacy model");
  const ignoredLegacy = path.join(ignored, ".arch-lens/architecture.uml");
  fs.mkdirSync(path.dirname(ignoredLegacy), { recursive: true });
  fs.writeFileSync(ignoredLegacy, "ignored but valuable\n");
  assertJsonError(run(ignored, "init", "--json"), /不自动迁移或删除/);
  assert.equal(fs.readFileSync(ignoredLegacy, "utf8"), "ignored but valuable\n");
});

test("init and diagram commands reject a symlinked diagram workspace", () => {
  const cwd = gitRepo();
  const external = tempDir();
  fs.mkdirSync(path.join(cwd, ".arch-lens"), { recursive: true });
  fs.symlinkSync(external, path.join(cwd, ".arch-lens/diagrams"));
  assertJsonError(run(cwd, "init", "--json"), /不得是符号链接/);
  assertJsonError(run(cwd, "diagrams", "list", "--json"), /请先运行 arch-lens init/);
  assert.deepEqual(fs.readdirSync(external), []);
});

test("install-agent resolves project scope to Git root, supports global scope and rejects invalid combinations", () => {
  const project = gitRepo();
  const nested = path.join(project, "nested/worktree");
  fs.mkdirSync(nested, { recursive: true });
  const first = run(nested, "install-agent", "codex", "--scope", "project");
  assert.equal(first.status, 0, first.stderr);
  const target = path.join(project, ".agents/skills/arch-lens/SKILL.md");
  assert.equal(fs.existsSync(target), true);
  fs.writeFileSync(target, "stale\n");
  const update = run(project, "install-agent", "codex", "--project");
  assert.equal(update.status, 0, update.stderr);
  assert.match(update.stdout, /已更新/);
  assert.match(fs.readFileSync(target, "utf8"), /PlantUML/);
  assert.equal(fs.existsSync(path.join(nested, ".agents/skills/arch-lens/SKILL.md")), false);
  const initialized = run(project, "init", "--json");
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.equal(fs.existsSync(path.join(project, ".arch-lens/diagrams/.gitkeep")), true);

  const home = tempDir();
  const global = run(tempDir(), "install-agent", "codex", "--global", { HOME: home });
  assert.equal(global.status, 0, global.stderr);
  assert.equal(fs.existsSync(path.join(home, ".agents/skills/arch-lens/SKILL.md")), true);
  assert.match(run(tempDir(), "install-agent", "claude").stderr, /不支持的 Agent/);
  assert.match(run(tempDir(), "install-agent", "codex", "--scope", "workspace").stderr, /project 或 global/);
  assert.match(run(tempDir(), "install-agent", "codex", "--scope", "global", "--project").stderr, /不能同时使用/);
});

test("install-agent is a no-op when the project target is the packaged skill source", () => {
  const before = repositoryBytes(root);
  const status = gitStatus(root);
  const result = run(root, "install-agent", "codex", "--project");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /已是当前源/);
  assert.deepEqual(repositoryBytes(root), before);
  assert.equal(gitStatus(root), status);
});

test("diagrams list recursively returns stable paths, metadata and inferred fallback types", () => {
  const cwd = workspace();
  writeDiagram(cwd, "zeta/state.puml", diagram("state", "订单如何变化？", "订单生命周期", "state Created"));
  writeDiagram(cwd, "alpha/use-cases.puml", diagram("use-case", "谁使用系统？", "参与者目标", "actor User"));
  writeDiagram(cwd, "middle/no-type.puml", "@startuml\n' arch-lens: question=领域中有哪些核心概念？\ntitle 核心领域\nclass Order\n@enduml\n");
  const result = run(cwd, "diagrams", "list", "--json");
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.diagrams.map((item) => item.path), [
    ".arch-lens/diagrams/alpha/use-cases.puml",
    ".arch-lens/diagrams/middle/no-type.puml",
    ".arch-lens/diagrams/zeta/state.puml"
  ]);
  assert.deepEqual(payload.diagrams.map((item) => item.type), ["use-case", "domain", "state"]);
  assert.equal(payload.diagrams[0].question, "谁使用系统？");
  assert.equal(payload.diagrams[0].title, "参与者目标");
});

test("diagrams list reports an intentional empty workspace", () => {
  const cwd = workspace();
  const result = run(cwd, "diagrams", "list");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /图集为空/);
});

test("diagrams check validates metadata and PlantUML syntax through the real CLI", () => {
  const cwd = workspace();
  const good = writeDiagram(cwd, "sales/order.domain.puml", diagram("domain", "订单包含哪些业务概念？", "订单领域", "class Order"));
  const fake = fakePlantUml();
  const valid = run(cwd, "diagrams", "check", "--json", { ARCH_LENS_PLANTUML: fake });
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).valid, true);

  writeDiagram(cwd, "sales/broken.puml", diagram("domain", "什么语法有问题？", "错误图", "SYNTAX_ERROR"));
  const invalid = run(cwd, "diagrams", "check", "--json", { ARCH_LENS_PLANTUML: fake });
  assertJsonDiagnostic(invalid, "PLANTUML_SYNTAX");

  fs.rmSync(path.join(cwd, ".arch-lens/diagrams/sales/broken.puml"));
  fs.writeFileSync(good, "@startuml\nclass Order\n@enduml\n");
  assertJsonDiagnostic(run(cwd, "diagrams", "check", "--json", { ARCH_LENS_PLANTUML: fake }), "DIAGRAM_METADATA_REQUIRED");
});

test("diagrams check accepts an explicitly configured PlantUML JAR through PATH java", () => {
  const cwd = workspace();
  writeDiagram(cwd, "domain.puml", diagram("domain", "核心概念是什么？", "领域", "class Concept"));
  const javaDir = tempDir();
  const java = path.join(javaDir, "java");
  const fake = fakePlantUml();
  fs.writeFileSync(java, `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`);
  fs.chmodSync(java, 0o755);
  const jar = path.join(javaDir, "plantuml.jar");
  fs.writeFileSync(jar, "fake jar\n");
  const log = path.join(javaDir, "invocations.jsonl");
  const result = run(cwd, "diagrams", "check", "--json", {
    ARCH_LENS_PLANTUML: jar,
    FAKE_PLANTUML_LOG: log,
    PATH: `${javaDir}${path.delimiter}${process.env.PATH}`
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).valid, true);
  for (const args of invocationLog(log)) {
    assert.ok(args.includes("-Djava.awt.headless=true"), JSON.stringify(args));
    assert.ok(args.includes("-headless"), JSON.stringify(args));
  }
});

test("diagram commands use one headless PlantUML batch after the version gate", () => {
  const cwd = workspace();
  writeDiagram(cwd, "orders/create.sequence.puml", diagram("sequence", "如何创建订单？", "创建订单", "actor User\nUser -> System: create"));
  writeDiagram(cwd, "orders/order.domain.puml", diagram("domain", "订单是什么？", "订单", "class Order"));
  const fake = fakePlantUml();

  const checkLog = path.join(tempDir(), "check.jsonl");
  const checked = run(cwd, "diagrams", "check", "--json", { ARCH_LENS_PLANTUML: fake, FAKE_PLANTUML_LOG: checkLog });
  assert.equal(checked.status, 0, checked.stderr || checked.stdout);
  const checkInvocations = invocationLog(checkLog);
  assert.equal(checkInvocations.length, 2, JSON.stringify(checkInvocations));
  assert.equal(checkInvocations.filter((args) => args.includes("-syntax")).length, 1);
  assert.ok(checkInvocations.every((args) => args.includes("-headless")));

  const renderLog = path.join(tempDir(), "render.jsonl");
  const output = path.join(tempDir(), "rendered");
  const rendered = run(cwd, "diagrams", "render", "--output", output, "--json", { ARCH_LENS_PLANTUML: fake, FAKE_PLANTUML_LOG: renderLog });
  assert.equal(rendered.status, 0, rendered.stderr || rendered.stdout);
  assert.equal(JSON.parse(rendered.stdout).rendered.length, 2);
  const renderInvocations = invocationLog(renderLog);
  assert.equal(renderInvocations.length, 2, JSON.stringify(renderInvocations));
  assert.equal(renderInvocations.filter((args) => args.includes("-tsvg")).length, 1);
  assert.equal(renderInvocations.filter((args) => args.includes("-syntax")).length, 0);
  assert.ok(renderInvocations.every((args) => args.includes("-headless")));
  assert.match(fs.readFileSync(path.join(output, "orders/create.sequence.svg"), "utf8"), /PlantUML 0/);
  assert.match(fs.readFileSync(path.join(output, "orders/order.domain.svg"), "utf8"), /PlantUML 1/);

  fs.writeFileSync(path.join(output, "stale.svg"), "stale\n");
  fs.rmSync(path.join(cwd, ".arch-lens/diagrams/orders/order.domain.puml"));
  const refreshed = run(cwd, "diagrams", "render", "--output", output, "--json", { ARCH_LENS_PLANTUML: fake });
  assert.equal(refreshed.status, 0, refreshed.stderr || refreshed.stdout);
  assert.equal(fs.existsSync(path.join(output, "stale.svg")), false);
  assert.equal(fs.existsSync(path.join(output, "orders/order.domain.svg")), false);
  assert.equal(fs.existsSync(path.join(output, "orders/create.sequence.svg")), true);
});

test("diagrams check rejects every include form and hidden .iuml carriers", () => {
  const cases = [
    ["!includeurl https://example.invalid/theme.iuml", "INCLUDE_FORBIDDEN"],
    ["!include <C4/C4_Context>", "INCLUDE_FORBIDDEN"],
    ["!include_once style.puml", "INCLUDE_FORBIDDEN"],
    ["!include_many style.puml", "INCLUDE_FORBIDDEN"],
    ["!includesub flows.puml!SUB", "INCLUDE_FORBIDDEN"],
    ["!import ../../secret.puml", "INCLUDE_FORBIDDEN"],
    ["!pragma includePath /tmp", "INCLUDE_FORBIDDEN"],
    ["note right: https://example.invalid/image.svg", "REMOTE_RESOURCE_FORBIDDEN"]
  ];
  for (const [body, code] of cases) {
    const cwd = workspace();
    writeDiagram(cwd, "unsafe.puml", diagram("component", "边界安全吗？", "不安全引用", body));
    assertJsonDiagnostic(run(cwd, "diagrams", "check", "--json", { ARCH_LENS_PLANTUML: fakePlantUml() }), code);
  }

  const hidden = workspace();
  fs.writeFileSync(path.join(hidden, ".arch-lens/diagrams/style.iuml"), "skinparam shadowing false\n");
  assertJsonError(run(hidden, "diagrams", "check", "--json"), /禁止 \.iuml/);

  const linked = workspace();
  const external = path.join(tempDir(), "outside.puml");
  fs.writeFileSync(external, diagram("domain", "外部是什么？", "外部图", "class External"));
  fs.symlinkSync(external, path.join(linked, ".arch-lens/diagrams/linked.puml"));
  assertJsonError(run(linked, "diagrams", "check", "--json", { ARCH_LENS_PLANTUML: fakePlantUml() }), /符号链接/);
});

test("diagrams check treats empty workspaces as valid without requiring PlantUML", () => {
  const empty = workspace();
  const checked = run(empty, "diagrams", "check", "--json", { ARCH_LENS_PLANTUML: path.join(tempDir(), "missing-plantuml") });
  assert.equal(checked.status, 0, checked.stderr);
  assert.deepEqual(JSON.parse(checked.stdout).files, []);
  const output = path.join(tempDir(), "empty-render");
  const rendered = run(empty, "diagrams", "render", "--output", output, "--json", { ARCH_LENS_PLANTUML: path.join(tempDir(), "missing-plantuml") });
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.deepEqual(JSON.parse(rendered.stdout).rendered, []);
  assert.equal(fs.existsSync(output), false);
});

test("diagrams check rejects missing, old and unrecognizable PlantUML plus outside files", () => {
  const cwd = workspace();
  writeDiagram(cwd, "valid.puml", diagram("use-case", "谁使用？", "用例", "actor User"));
  assertJsonError(run(cwd, "diagrams", "check", "--json", { ARCH_LENS_PLANTUML: path.join(tempDir(), "missing-plantuml") }), /不存在/);
  assertJsonError(run(cwd, "diagrams", "check", "--json", { ARCH_LENS_PLANTUML: fakePlantUml(), FAKE_PLANTUML_VERSION: "1.2025.0" }), /过旧/);
  assertJsonError(run(cwd, "diagrams", "check", "--json", { ARCH_LENS_PLANTUML: fakePlantUml(), FAKE_PLANTUML_VERSION: "unparseable" }), /无法识别/);
  const outside = path.join(tempDir(), "outside.puml");
  fs.writeFileSync(outside, diagram("domain", "是什么？", "外部", "class Outside"));
  assertJsonError(run(cwd, "diagrams", "check", outside, "--json", { ARCH_LENS_PLANTUML: fakePlantUml() }), /只允许选择/);
  assertJsonError(run(cwd, "diagrams", "check", ".arch-lens/diagrams/missing.puml", "--json", { ARCH_LENS_PLANTUML: fakePlantUml() }), /不存在/);
});

test("diagrams check accepts a parseable version even when the version probe reports missing Graphviz", () => {
  const cwd = workspace();
  writeDiagram(cwd, "valid.puml", diagram("sequence", "如何协作？", "协作", "actor User\nUser -> System: request"));
  const result = run(cwd, "diagrams", "check", "--json", {
    ARCH_LENS_PLANTUML: fakePlantUml(),
    FAKE_PLANTUML_VERSION_EXIT: "1"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("diagrams render writes deterministic relative SVG outputs only to the explicit directory", () => {
  const cwd = workspace();
  const diagramFile = writeDiagram(cwd, "orders/create.sequence.puml", diagram("sequence", "如何创建订单？", "创建订单", "actor User\nUser -> System: create"));
  const before = fs.readFileSync(diagramFile);
  const statusBefore = gitStatus(cwd);
  const output = path.join(tempDir(), "rendered views");
  const result = run(cwd, "diagrams", "render", "--output", output, "--json", { ARCH_LENS_PLANTUML: fakePlantUml() });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.rendered.length, 1);
  const svg = path.join(output, "orders/create.sequence.svg");
  assert.match(fs.readFileSync(svg, "utf8"), /<svg/);
  assert.deepEqual(fs.readFileSync(diagramFile), before);
  assert.equal(gitStatus(cwd), statusBefore);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/diagrams/orders/create.sequence.svg")), false);
});

test("diagrams render defaults to the Git-root rendered workspace from a repository subdirectory", () => {
  const cwd = gitRepo();
  const initialized = run(cwd, "init", "--json");
  assert.equal(initialized.status, 0, initialized.stderr);
  commitAll(cwd, "initialize arch lens");
  writeDiagram(cwd, "orders/create.sequence.puml", diagram("sequence", "如何创建订单？", "创建订单", "actor User\nUser -> System: create"));
  commitAll(cwd, "add diagram");
  const nested = path.join(cwd, "nested/workdir");
  fs.mkdirSync(nested, { recursive: true });
  const statusBefore = gitStatus(cwd);

  const result = run(nested, "diagrams", "render", "--json", { ARCH_LENS_PLANTUML: fakePlantUml() });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const outputRoot = path.join(fs.realpathSync(cwd), ".arch-lens/rendered");
  const svg = path.join(outputRoot, "orders/create.sequence.svg");
  assert.equal(payload.output, outputRoot);
  assert.deepEqual(payload.rendered, [{
    source: ".arch-lens/diagrams/orders/create.sequence.puml",
    output: svg
  }]);
  assert.match(fs.readFileSync(svg, "utf8"), /<svg/);
  assert.equal(gitStatus(cwd), statusBefore);
  assert.equal(fs.existsSync(path.join(nested, ".arch-lens/rendered")), false);
});

test("diagrams render rejects source-contained output and does not leave files after renderer failure", () => {
  const cwd = workspace();
  writeDiagram(cwd, "broken.puml", diagram("sequence", "失败如何报告？", "失败", "RENDER_ERROR"));
  assertJsonError(
    run(cwd, "diagrams", "render", "--output", ".arch-lens/diagrams/generated", "--json", { ARCH_LENS_PLANTUML: fakePlantUml() }),
    /不得位于/
  );
  const output = path.join(tempDir(), "failure-output");
  assertJsonDiagnostic(run(cwd, "diagrams", "render", "--output", output, "--json", { ARCH_LENS_PLANTUML: fakePlantUml() }), "PLANTUML_RENDER");
  assert.equal(fs.existsSync(output), false);

  const errorSvgRepo = workspace();
  writeDiagram(errorSvgRepo, "error-svg.puml", diagram("component", "错误图会被接受吗？", "错误 SVG", "ERROR_SVG"));
  const errorSvgOutput = path.join(tempDir(), "error-svg-output");
  assertJsonDiagnostic(run(errorSvgRepo, "diagrams", "render", "--output", errorSvgOutput, "--json", { ARCH_LENS_PLANTUML: fakePlantUml() }), "PLANTUML_RENDER");
  assert.equal(fs.existsSync(errorSvgOutput), false);

  const protocolRepo = workspace();
  writeDiagram(protocolRepo, "one.puml", diagram("domain", "一是什么？", "一", "class One"));
  writeDiagram(protocolRepo, "two.puml", diagram("domain", "二是什么？", "二", "class Two"));
  const protocolOutput = path.join(tempDir(), "protocol-output");
  assertJsonDiagnostic(run(protocolRepo, "diagrams", "render", "--output", protocolOutput, "--json", {
    ARCH_LENS_PLANTUML: fakePlantUml(),
    FAKE_PLANTUML_WRONG_SVG_COUNT: "1"
  }), "PLANTUML_OUTPUT_PROTOCOL");
  assert.equal(fs.existsSync(protocolOutput), false);

  const linkedRepo = workspace();
  writeDiagram(linkedRepo, "safe.puml", diagram("component", "边界安全吗？", "边界", "component Core"));
  fs.mkdirSync(path.join(linkedRepo, ".arch-lens"), { recursive: true });
  fs.symlinkSync(path.join(linkedRepo, ".arch-lens/diagrams"), path.join(linkedRepo, ".arch-lens/rendered"));
  assertJsonError(
    run(linkedRepo, "diagrams", "render", "--json", { ARCH_LENS_PLANTUML: fakePlantUml() }),
    /真实路径不得位于/
  );
  assert.equal(fs.existsSync(path.join(linkedRepo, ".arch-lens/diagrams/safe.svg")), false);
});

test("all read-only diagram commands preserve repository source bytes", () => {
  const cwd = workspace();
  writeDiagram(cwd, "domain.puml", diagram("domain", "核心概念是什么？", "领域", "class Concept"));
  commitAll(cwd, "diagram");
  const before = repositoryBytes(cwd);
  const fake = fakePlantUml();
  assert.equal(run(cwd, "diagrams", "list", "--json", { ARCH_LENS_PLANTUML: fake }).status, 0);
  assert.equal(run(cwd, "diagrams", "check", "--json", { ARCH_LENS_PLANTUML: fake }).status, 0);
  const output = path.join(tempDir(), "rendered");
  assert.equal(run(cwd, "diagrams", "render", "--output", output, "--json", { ARCH_LENS_PLANTUML: fake }).status, 0);
  assert.deepEqual(repositoryBytes(cwd), before);
  assert.equal(gitStatus(cwd), "");
});

function workspace() {
  const cwd = gitRepo();
  fs.mkdirSync(path.join(cwd, ".arch-lens/diagrams"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".arch-lens/diagrams/.gitkeep"), "");
  commitAll(cwd, "workspace");
  return cwd;
}

function diagram(type, question, title, body) {
  return `@startuml\n' arch-lens: type=${type}\n' arch-lens: question=${question}\ntitle ${title}\n${body}\n@enduml\n`;
}

function writeDiagram(cwd, relative, content) {
  const target = path.join(cwd, ".arch-lens/diagrams", relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function fakePlantUml() {
  const target = path.join(tempDir(), "plantuml-fake.mjs");
  fs.writeFileSync(target, `#!/usr/bin/env node
import fs from "node:fs";
const args = process.argv.slice(2);
if (process.env.FAKE_PLANTUML_LOG) fs.appendFileSync(process.env.FAKE_PLANTUML_LOG, JSON.stringify(args) + "\\n");
if (process.env.PLANTUML_SECURITY_PROFILE !== "SANDBOX") {
  console.error("expected SANDBOX security profile");
  process.exit(9);
}

if (!args.includes("-headless")) {
  console.error("expected headless mode");
  process.exit(10);
}
if (args.includes("-version")) {
  console.log("PlantUML version " + (process.env.FAKE_PLANTUML_VERSION ?? "1.2026.6"));
  if (process.env.FAKE_PLANTUML_VERSION_EXIT) console.error("Error: Dot executable does not exist");
  process.exit(Number(process.env.FAKE_PLANTUML_VERSION_EXIT ?? 0));
}
let source = "";
for await (const chunk of process.stdin) source += chunk;
if (args.includes("-syntax")) {
  if (!source) { console.error("expected diagram on stdin"); process.exit(8); }
  if (source.includes("SYNTAX_ERROR")) { console.error("Syntax Error? line 5"); process.exit(200); }
  console.log("CLASS");
  process.exit(0);
}
if (source.includes("RENDER_ERROR")) { console.error("render failed"); process.exit(2); }
if (source.includes("ERROR_SVG")) { process.stdout.write('<svg><text>Cannot find Graphviz</text></svg>'); process.exit(0); }
const diagrams = (source.match(/@startuml\\b/gi) ?? []).length;
const rendered = process.env.FAKE_PLANTUML_WRONG_SVG_COUNT && diagrams > 1 ? diagrams - 1 : diagrams;
for (let index = 0; index < rendered; index += 1) {
  process.stdout.write('<svg xmlns="http://www.w3.org/2000/svg"><text>PlantUML ' + index + '</text></svg>');
}
`);
  fs.chmodSync(target, 0o755);
  return target;
}

function fakeManagedJava(directory) {
  const target = path.join(directory, "java");
  fs.writeFileSync(target, `#!${process.execPath}
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "-version") { console.error('openjdk version "21.0.2"'); process.exit(0); }
if (args.includes("-version")) { console.log("PlantUML version 1.2026.6"); process.exit(0); }
const source = require("node:fs").readFileSync(0, "utf8");
if (args.includes("-syntax")) { console.log("CLASS"); process.exit(0); }
const count = (source.match(/@startuml\\b/gi) ?? []).length;
for (let index = 0; index < count; index += 1) process.stdout.write('<svg xmlns="http://www.w3.org/2000/svg"><text>managed</text></svg>');
`);
  fs.chmodSync(target, 0o755);
  return target;
}

function invocationLog(file) {
  return fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
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

function gitStatus(cwd) {
  return git(cwd, "status", "--porcelain", "--untracked-files=all");
}

function run(cwd, ...raw) {
  const env = typeof raw.at(-1) === "object" ? raw.pop() : {};
  return spawnSync(process.execPath, [cli, ...raw], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ARCH_LENS_TEST_MODE: "1", ARCH_LENS_TEST_SKIP_RUNTIME: "1", ...env }
  });
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
  return fs.mkdtempSync(path.join(os.tmpdir(), "arch-lens-test-"));
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

function repositoryBytes(cwd) {
  const result = new Map();
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) result.set(path.relative(cwd, target), fs.readFileSync(target));
    }
  };
  visit(cwd);
  return result;
}
