import test from "node:test";
import assert from "node:assert/strict";
import {
  releaseForTag,
  assertCurrentMain,
  assertUnpublished,
  assertPublished,
  ensureUnpublished,
  waitForPublished,
  registryUrl
} from "../scripts/release-policy.mjs";

const name = "@spec-alchemy/arch-lens";
const sha = "a".repeat(40);
const version = "0.1.0-alpha.6";
const release = releaseForTag(version, `v${version}`);
const published = {
  name,
  version,
  dist: {
    attestations: {
      url: "https://registry.npmjs.org/-/npm/v1/attestations/example",
      provenance: { predicateType: "https://slsa.dev/provenance/v1" }
    }
  }
};

function fakeFetch(status, body = {}) {
  return async () => ({ status, json: async () => body });
}

test("release channels map to their exact npm dist-tags", () => {
  for (const [value, distTag, prerelease] of [
    ["0.1.0-alpha.6", "next", true],
    ["0.1.0-beta.1", "beta", true],
    ["0.1.0-rc.2", "beta", true],
    ["0.1.0", "latest", false]
  ]) {
    assert.deepEqual(releaseForTag(value, `v${value}`), { version: value, tag: `v${value}`, distTag, prerelease });
  }
});

test("reject unsupported versions and mismatched tags before publishing", () => {
  for (const value of ["0.1.0-dev.1", "0.1.0-alpha.0", "01.0.0", "1.0.0+meta", "not-a-version"]) {
    assert.throws(() => releaseForTag(value, `v${value}`), /Unsupported release version/);
  }
  assert.throws(() => releaseForTag(version, "v0.1.0-alpha.5"), /does not match/);
  assert.throws(() => releaseForTag(version, "alpha.6"), /does not match/);
});

test("release tag must be the current main commit", () => {
  assert.doesNotThrow(() => assertCurrentMain(sha, sha));
  assert.throws(() => assertCurrentMain(sha, "b".repeat(40)), /current main/);
  assert.throws(() => assertCurrentMain(sha, ""), /Cannot verify/);
});

test("only npm's exact 404 proves a version is unpublished", async () => {
  assert.doesNotThrow(() => assertUnpublished(404, name, version));
  assert.throws(() => assertUnpublished(200, name, version), /already exists/);
  assert.throws(() => assertUnpublished(503, name, version), /Cannot establish/);
  await assert.doesNotReject(() => ensureUnpublished(name, version, fakeFetch(404)));
  await assert.rejects(() => ensureUnpublished(name, version, fakeFetch(200)), /already exists/);
  await assert.rejects(() => ensureUnpublished(name, version, fakeFetch(401)), /Cannot establish/);
});

test("registry URLs target the exact scoped package and immutable version", () => {
  assert.equal(registryUrl(name, version), "https://registry.npmjs.org/%40spec-alchemy%2Farch-lens/0.1.0-alpha.6");
});

test("published version, dist-tag and provenance must all match", () => {
  assert.doesNotThrow(() => assertPublished(published, { "dist-tags": { next: version } }, name, release));
  assert.throws(() => assertPublished({ ...published, version: "0.1.0-alpha.5" }, { "dist-tags": { next: version } }, name, release), /expected/);
  assert.throws(() => assertPublished(published, { "dist-tags": { next: "0.1.0-alpha.5" } }, name, release), /dist-tag/);
  assert.throws(() => assertPublished({ ...published, dist: {} }, { "dist-tags": { next: version } }, name, release), /provenance/);
});

test("registry verification retries indexing lag and fails closed", async () => {
  let versionChecks = 0;
  const delayed = async (url) => {
    if (url === registryUrl(name, version) && ++versionChecks === 1) return { status: 404 };
    const body = url === registryUrl(name, version) ? published : { "dist-tags": { next: version } };
    return { status: 200, json: async () => body };
  };
  await assert.doesNotReject(() => waitForPublished(name, release, { fetcher: delayed, sleep: async () => {}, attempts: 2 }));
  await assert.rejects(() => waitForPublished(name, release, { fetcher: fakeFetch(503), sleep: async () => {}, attempts: 2 }), /Cannot verify npm release/);
});
