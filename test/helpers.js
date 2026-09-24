import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const root = path.resolve(import.meta.dirname, "..");
export const cli = path.join(root, "bin", "arch-lens.js");

export function tempDir(prefix = "arch-lens-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function runCli(cwd, ...raw) {
  const env = typeof raw.at(-1) === "object" ? raw.pop() : {};
  const managed = env.ARCH_LENS_TEST_MANAGED_PLANTUML ?? fakePlantUml(env.FAKE_PLANTUML_LOG);
  const result = spawnSync(process.execPath, [cli, ...raw], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ARCH_LENS_TEST_MODE: "1",
      ARCH_LENS_TEST_SKIP_RUNTIME: "1",
      ARCH_LENS_TEST_MANAGED_PLANTUML: managed,
      ...env
    }
  });
  return result;
}

export function parseJson(result) {
  return JSON.parse(result.stdout);
}

export function assertJsonSuccess(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return parseJson(result);
}

export function assertJsonError(result, pattern) {
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const payload = parseJson(result);
  assert.equal(payload.schemaVersion, 2);
  assert.match(payload.error, pattern);
  return payload;
}

export function initWorkspace(cwd) {
  return assertJsonSuccess(runCli(cwd, "init", "--json"));
}

export function writeDiagram(cwd, relative, body = "class Concept") {
  const target = path.join(cwd, ".arch-lens/diagrams", relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `@startuml\n' arch-lens: type=domain\n' arch-lens: question=状态如何演进？\ntitle ${path.basename(relative)}\n${body}\n@enduml\n`);
  return target;
}

export function writeCandidate(cwd, id, relative, body = "class Candidate") {
  const target = path.join(cwd, ".arch-lens/changes", id, "diagrams", relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `@startuml\n' arch-lens: type=domain\n' arch-lens: question=状态如何演进？\ntitle ${path.basename(relative)}\n${body}\n@enduml\n`);
  return target;
}

export function fakePlantUml(logFile = null) {
  const directory = tempDir("arch-lens-plantuml-");
  const target = path.join(directory, "plantuml-fake.mjs");
  const log = logFile ? JSON.stringify(logFile) : "null";
  fs.writeFileSync(target, `#!/usr/bin/env node
import fs from "node:fs";
const args = process.argv.slice(2);
const logFile = ${log};
if (logFile) fs.appendFileSync(logFile, JSON.stringify(args) + "\\n");
if (process.env.PLANTUML_SECURITY_PROFILE !== "SANDBOX" || !args.includes("-headless")) process.exit(9);
if (args.includes("-version")) { console.log("PlantUML version 1.2026.6"); process.exit(0); }
let source = "";
for await (const chunk of process.stdin) source += chunk;
if (args.includes("-syntax")) {
  if (!source) process.exit(8);
  if (source.includes("SYNTAX_ERROR")) { console.error("Syntax Error? line 1"); process.exit(200); }
  console.log("CLASS");
  process.exit(0);
}
if (source.includes("RENDER_ERROR")) { console.error("render failed"); process.exit(2); }
const diagrams = [...source.matchAll(/@startuml\\b[\\s\\S]*?@enduml/gi)].map((match) => match[0]);
for (const diagram of diagrams) {
  const width = process.env.FAKE_PLANTUML_WIDTH ?? "800";
  const height = process.env.FAKE_PLANTUML_HEIGHT ?? "400";
  process.stdout.write('<svg xmlns="http://www.w3.org/2000/svg" width="' + width + 'px" height="' + height + 'px" viewBox="0 0 ' + width + ' ' + height + '"><text>' + diagram.length + '</text></svg>');
}
`);
  fs.chmodSync(target, 0o755);
  return target;
}

export function replaceText(file, replacements) {
  let source = fs.readFileSync(file, "utf8");
  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  fs.writeFileSync(file, source);
}

export function completePrinciples(cwd) {
  fs.writeFileSync(path.join(cwd, ".arch-lens/principles.md"), `# Project Modeling Principles

## Purpose

Keep business decisions reviewable.

## Modeling Boundary

PlantUML is the only business model.

## Decision Principles

Responsibilities remain explicit.

## Quality Gates

Humans approve design and completion.
`);
}

export function completeTasks(file) {
  fs.writeFileSync(file, "# Implementation Tasks\n\n- [ ] T001 [AC-001] Implement the local workflow.\n");
}

export function completeProposal(file, id = "change") {
  fs.writeFileSync(file, `# Change Proposal

## Problem And Evidence

The ${id} workflow has a concrete problem.

## Goals

Implement the local workflow.

## Non-goals

Do not add Git integration.

## Acceptance Criteria

- AC-001: The local workflow completes without Git.

## Assumptions

The workspace is writable.

## Open Questions

- [x] Q001: Git must stay outside the core.
`);
}

export function completeDecisions(file, diagramPath) {
  fs.writeFileSync(file, `# Design Decisions

## D001: Keep the core local

### Context

Git is outside the product boundary.

### Decision

Use content digests and local files.

### Alternatives

Use commits.

### Consequences

No cross-clone audit.

## Visual Review

- ${diagramPath}: PASS - Opened the current rendered SVG and reviewed layout, clipping, density, boundaries, and reading order.
`);
}
