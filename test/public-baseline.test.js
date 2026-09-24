import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("公开基线只呈现当前产品入口并保留合法历史归档", () => {
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
  assert.doesNotMatch(principles, /model-only commit|implementation-commit|implementation-patch-id|baseCommit|受版本控制|标准 SVG|\bGit\b/);
  assert.match(principles, /baselineDigest.*designDigest.*completionDigest/s);
  assert.match(principles, /fresh 候选 SVG/);

  assert.ok(archiveEntries.includes(".gitkeep"));
  assert.ok(archiveEntries.every((entry) => entry === ".gitkeep" || /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry)));
  for (const command of ["capabilities --json", "init", "diagrams check", "change new", "archive"]) {
    assert.match(readme, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(readme, /XMI|Viewer|bundle|architecture\.uml|change review|change approve|change verify/);
  assert.match(readme, /RELEASING\.md/);

  const releasing = read("RELEASING.md");
  for (const channel of ["alpha", "beta", "rc", "GA"]) assert.match(releasing, new RegExp(`\\b${channel}\\b`));
  assert.match(releasing, /门禁决定「能不能发」/);
  assert.match(releasing, /不\*\*采用「正式版每 2 周发一次」的固定日历/);
  assert.match(releasing, /--tag beta/);
  assert.match(releasing, /git tag -a vX\.Y\.Z-alpha\.N -m/);
  assert.match(releasing, /附注 tag/);
  assert.match(releasing, /release prep commit/);
  assert.doesNotMatch(read("CONTRIBUTING.md"), /git tag v0\.1\.0-alpha\.3\n/);
  assert.doesNotMatch(read("README.md"), /git tag v0\.1\.0-alpha\.3\n/);
  assert.match(read("CONTRIBUTING.md"), /RELEASING\.md/);
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
  assert.equal(diagrams.length, 3);
  assert.deepEqual(diagrams.map((file) => file.split(path.sep).join("/")).sort(), [
    ".arch-lens/diagrams/local-first-lifecycle.activity.puml",
    ".arch-lens/diagrams/local-first-responsibilities.component.puml",
    ".arch-lens/diagrams/product-goals.use-case.puml"
  ]);
});

test("npm 预览发布保持 scoped 包、next 标签和稳定 CLI 名称", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

  assert.equal(packageJson.name, "@spec-alchemy/arch-lens");
  assert.equal(packageJson.version, "0.1.0-alpha.3");
  assert.equal(packageJson.private, false);
  assert.deepEqual(packageJson.publishConfig, {
    access: "public",
    tag: "next",
  });
  assert.deepEqual(packageJson.bin, {
    "arch-lens": "bin/arch-lens.js",
  });
  assert.ok(packageJson.files.includes("CHANGELOG.md"));
  assert.ok(packageJson.files.includes("CONTRIBUTING.md"));
  assert.ok(packageJson.files.includes("RELEASING.md"));
});
