import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("公开基线只呈现当前产品入口和空的历史归档", () => {
  const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
  const readme = read("README.md");
  const principles = read(".arch-lens/principles.md");
  const archive = path.join(root, ".arch-lens", "changes", "archive");
  const archiveEntries = fs.readdirSync(archive).sort();

  assert.match(principles, /## Purpose/);
  assert.match(principles, /## Modeling Boundary/);
  assert.match(principles, /## Responsibility Boundary/);
  assert.match(principles, /## Quality Gates/);
  assert.doesNotMatch(principles, /TODO/);

  assert.deepEqual(archiveEntries, [".gitkeep"]);
  for (const command of ["capabilities --json", "init", "diagrams check", "change new", "archive"]) {
    assert.match(readme, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(readme, /XMI|Viewer|bundle|architecture\.uml|change review|change approve|change verify/);
  assert.doesNotMatch(readme, /\/Users\/|\/private\/tmp|\/tmp\/|worktrees\//);

  const diagrams = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.name.endsWith(".puml")) diagrams.push(path.relative(root, target));
    }
  };
  visit(path.join(root, ".arch-lens", "diagrams"));
  assert.equal(diagrams.length, 5);
});

test("npm 草案发布保持 scoped 包、draft 标签和稳定 CLI 名称", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

  assert.equal(packageJson.name, "@spec-alchemy/arch-lens");
  assert.equal(packageJson.version, "0.0.0-draft");
  assert.equal(packageJson.private, false);
  assert.deepEqual(packageJson.publishConfig, {
    access: "public",
    tag: "draft",
  });
  assert.deepEqual(packageJson.bin, {
    "arch-lens": "bin/arch-lens.js",
  });
  assert.ok(packageJson.files.includes("CHANGELOG.md"));
  assert.ok(packageJson.files.includes("CONTRIBUTING.md"));
});
