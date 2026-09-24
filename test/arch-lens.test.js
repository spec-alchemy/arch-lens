import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assertJsonError, assertJsonSuccess, cli, initWorkspace, parseJson, root, runCli, tempDir, writeDiagram } from "./helpers.js";

test("CLI exposes protocol 2 local-first commands and no Git-specific surface", () => {
  const cwd = tempDir();
  const version = runCli(cwd, "--version");
  const help = runCli(cwd, "--help");
  const changeHelp = runCli(cwd, "change", "--help");
  const renderHelp = runCli(cwd, "diagrams", "render", "--help");
  const capabilities = assertJsonSuccess(runCli(cwd, "capabilities", "--json"));

  assert.equal(version.stdout.trim(), "0.1.0-alpha.4");
  assert.match(help.stdout, /Skill-first 的 PlantUML/);
  assert.doesNotMatch(help.stdout, /\bgit\b|Git/);
  assert.match(changeHelp.stdout, /refresh-baseline/);
  assert.match(changeHelp.stdout, /record-approval/);
  assert.doesNotMatch(changeHelp.stdout, /archive-evidence|refresh-base(?!line)|bundle|\breview\b|\bapprove\b|\bverify\b/);
  assert.match(renderHelp.stdout, /工作区\/\.arch-lens\/rendered/);
  assert.deepEqual(capabilities, {
    schemaVersion: 2,
    cliVersion: "0.1.0-alpha.4",
    workflowProtocol: 2,
    features: [
      "plantuml-batch-render",
      "change-pack-v2",
      "approval-digest-v2",
      "completion-approval-v2",
      "managed-plantuml-runtime-v1",
      "change-overlay-v1",
      "single-active-change-v1",
      "content-baseline-v1",
      "local-first-workspace-v1",
      "svg-facts-v1",
      "note-budget-v1",
      "visual-review-gate-v1"
    ]
  });
  assertJsonError(runCli(cwd, "diagrams", "render", "--json"), /未找到 \.arch-lens/);
});

test("init works in a non-Git directory, is idempotent and does not create .gitignore", () => {
  const cwd = tempDir();
  fs.writeFileSync(path.join(cwd, "AGENTS.md"), "# Existing\n\nPreserve me.\n");
  const first = initWorkspace(cwd);
  assert.equal(first.created, true);
  assert.equal(first.workflowProtocol, 2);
  assert.equal(fs.existsSync(path.join(cwd, ".git")), false);
  assert.equal(fs.existsSync(path.join(cwd, ".gitignore")), false);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/diagrams/.gitkeep")), true);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/changes/archive/.gitkeep")), true);
  assert.equal(fs.existsSync(path.join(cwd, ".agents/skills/arch-lens/SKILL.md")), true);
  assert.match(fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8"), /^# Existing\n\nPreserve me\./);
  assert.match(fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf8"), /local-first workflowProtocol 2/);

  fs.writeFileSync(path.join(cwd, ".arch-lens/principles.md"), "# Custom principles\n");
  fs.appendFileSync(path.join(cwd, ".agents/skills/arch-lens/SKILL.md"), "\nlocal customization\n");
  const second = initWorkspace(cwd);
  assert.equal(second.created, false);
  assert.equal(fs.readFileSync(path.join(cwd, ".arch-lens/principles.md"), "utf8"), "# Custom principles\n");
  assert.doesNotMatch(fs.readFileSync(path.join(cwd, ".agents/skills/arch-lens/SKILL.md"), "utf8"), /local customization/);
});

test("init and workflow commands leave a gitignored .arch-lens directory untouched by Git semantics", () => {
  const cwd = tempDir();
  git(cwd, "init", "-q");
  git(cwd, "config", "user.email", "arch-lens@example.test");
  git(cwd, "config", "user.name", "Arch Lens Test");
  fs.writeFileSync(path.join(cwd, ".gitignore"), ".arch-lens/\n");
  fs.writeFileSync(path.join(cwd, "seed.txt"), "seed\n");
  git(cwd, "add", ".gitignore", "seed.txt");
  git(cwd, "commit", "-qm", "seed");

  initWorkspace(cwd);
  assert.equal(parseJson(runCli(cwd, "change", "status", "--json")).schemaVersion, 2);
  const ignored = git(cwd, "status", "--porcelain", "--ignored");
  assert.match(ignored, /^!! \.arch-lens\/$/m);
  assert.equal(fs.readFileSync(path.join(cwd, ".gitignore"), "utf8"), ".arch-lens/\n");
});

test("install-agent resolves project scope from a nested workspace directory and rejects ambiguous options", () => {
  const cwd = tempDir();
  initWorkspace(cwd);
  const nested = path.join(cwd, "packages/app");
  fs.mkdirSync(nested, { recursive: true });
  const installed = runCli(nested, "install-agent", "codex", "--project");
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  assert.match(installed.stdout, new RegExp(path.join(cwd, ".agents/skills/arch-lens").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const ambiguous = runCli(cwd, "install-agent", "codex", "--project", "--global");
  assert.equal(ambiguous.status, 1);
  assert.match(ambiguous.stderr, /不能同时使用/);
  const invalid = runCli(cwd, "install-agent", "codex", "--scope", "workspace");
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /project 或 global/);

  const home = tempDir("arch-lens-home-");
  const global = runCli(cwd, "install-agent", "codex", "--global", { HOME: home });
  assert.equal(global.status, 0, global.stderr || global.stdout);
  assert.equal(fs.existsSync(path.join(home, ".agents/skills/arch-lens/SKILL.md")), true);
});

test("diagram list, check and render work without a canonical SVG cache", () => {
  const cwd = tempDir();
  initWorkspace(cwd);
  writeDiagram(cwd, "orders/order.puml", "class Order");
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/rendered")), false);

  const listed = assertJsonSuccess(runCli(cwd, "diagrams", "list", "--json"));
  assert.equal(listed.diagrams[0].path, ".arch-lens/diagrams/orders/order.puml");
  assert.equal(listed.diagrams[0].type, "domain");

  const checked = assertJsonSuccess(runCli(cwd, "diagrams", "check", "--json"));
  assert.deepEqual(checked.svg, []);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/rendered")), false);

  const rendered = assertJsonSuccess(runCli(cwd, "diagrams", "render", "--json"));
  assert.equal(rendered.mode, "workspace-cache");
  assert.equal(Object.hasOwn(rendered, "standardMirror"), false);
  assert.equal(rendered.rendered.length, 1);
  assert.equal(fs.existsSync(path.join(cwd, ".arch-lens/rendered/orders/order.svg")), true);
  fs.rmSync(path.join(cwd, ".arch-lens/rendered"), { recursive: true, force: true });
  assert.equal(assertJsonSuccess(runCli(cwd, "diagrams", "check", "--json")).valid, true);
});

test("diagram safety checks reject includes, hidden .iuml files and symlinks", () => {
  const included = tempDir();
  initWorkspace(included);
  writeDiagram(included, "unsafe.puml", "!include <C4/C4_Context>");
  const forbidden = parseJson(runCli(included, "diagrams", "check", "--json"));
  assert.equal(forbidden.error, "PlantUML 离线资源策略检查失败。");
  assert.ok(forbidden.diagnostics.some((item) => item.code === "INCLUDE_FORBIDDEN"));

  const hidden = tempDir();
  initWorkspace(hidden);
  fs.writeFileSync(path.join(hidden, ".arch-lens/diagrams/style.iuml"), "skinparam shadowing false\n");
  assertJsonError(runCli(hidden, "diagrams", "check", "--json"), /禁止 \.iuml/);

  const linked = tempDir();
  initWorkspace(linked);
  const outside = path.join(tempDir(), "outside.puml");
  fs.writeFileSync(outside, "@startuml\nclass Outside\n@enduml\n");
  fs.symlinkSync(outside, path.join(linked, ".arch-lens/diagrams/linked.puml"));
  assertJsonError(runCli(linked, "diagrams", "check", "--json"), /符号链接/);
});

test("explicit render is atomic, outside sources and preserves project bytes", () => {
  const cwd = tempDir();
  initWorkspace(cwd);
  const source = writeDiagram(cwd, "model.puml", "class Model");
  const before = fs.readFileSync(source);
  const output = path.join(tempDir(), "views");
  const rendered = assertJsonSuccess(runCli(cwd, "diagrams", "render", "--output", output, "--json"));
  assert.equal(rendered.mode, "explicit");
  assert.equal(Object.hasOwn(rendered, "standardMirror"), false);
  assert.equal(rendered.rendered.length, 1);
  assert.equal(fs.existsSync(path.join(output, "model.svg")), true);
  assert.deepEqual(fs.readFileSync(source), before);
  assertJsonError(runCli(cwd, "diagrams", "render", "--output", ".arch-lens/diagrams/out", "--json"), /不得位于/);
});

test("runtime source contains no Git subprocess adapter", () => {
  const source = fs.readdirSync(path.join(root, "src"))
    .filter((file) => file.endsWith(".js"))
    .map((file) => fs.readFileSync(path.join(root, "src", file), "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /spawnSync\(\s*["']git["']|\bgit\s*:\s*spawnSync/);
  assert.doesNotMatch(source, /implementationCommit|reviewedImplementationCommit|implementationPatchId|baseCommit/);
});

test("public CLI entry remains executable", () => {
  assert.notEqual(fs.statSync(cli).mode & 0o111, 0);
  assert.equal(fs.existsSync(path.join(root, "bin/arch-lens.js")), true);
});

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
