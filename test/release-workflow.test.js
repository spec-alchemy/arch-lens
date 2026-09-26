import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = YAML.parse(fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8"));
const steps = (job) => job.steps.map((step) => step.run ?? "").join("\n");

test("pull requests only test and version tags trigger the release chain", () => {
  assert.deepEqual(workflow.on.push.tags, ["v*"]);
  assert.ok(Object.hasOwn(workflow.on, "pull_request"));
  assert.equal(workflow.jobs.test.permissions, undefined);
  assert.equal(workflow.jobs.publish.needs, "test");
  assert.equal(workflow.jobs.release.needs, "publish");
  assert.match(workflow.jobs.publish.if, /refs\/tags\/v/);
  assert.match(workflow.jobs.release.if, /refs\/tags\/v/);
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
});

test("jobs have only their required permissions and do not use npm secrets", () => {
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(workflow.jobs.publish.permissions, { contents: "read", "id-token": "write" });
  assert.deepEqual(workflow.jobs.release.permissions, { contents: "write" });
  assert.match(steps(workflow.jobs.publish), /npm publish --provenance --access public --tag/);
  assert.doesNotMatch(steps(workflow.jobs.publish), /npm stage publish/);
  assert.doesNotMatch(JSON.stringify(workflow), /NPM_TOKEN|NODE_AUTH_TOKEN|stage approve/);
  assert.match(steps(workflow.jobs.test), /assertCurrentMain/);
  assert.match(steps(workflow.jobs.publish), /ensureUnpublished/);
  assert.match(steps(workflow.jobs.release), /waitForPublished/);
  assert.match(steps(workflow.jobs.release), /--verify-tag/);
});
