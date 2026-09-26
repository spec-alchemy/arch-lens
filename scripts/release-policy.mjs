const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(alpha|beta|rc)\.([1-9]\d*))?$/;
const REGISTRY = "https://registry.npmjs.org";

export function releaseForTag(version, tag) {
  const match = VERSION_PATTERN.exec(version);
  if (!match) throw new Error(`Unsupported release version: ${version}`);
  if (tag !== `v${version}`) throw new Error(`Tag ${tag} does not match package version ${version}`);

  const channel = match[1] ?? "ga";
  return {
    version,
    tag,
    distTag: channel === "alpha" ? "next" : channel === "ga" ? "latest" : "beta",
    prerelease: channel !== "ga"
  };
}

export function assertCurrentMain(tagCommit, mainCommit) {
  if (!/^[0-9a-f]{40}$/.test(tagCommit) || !/^[0-9a-f]{40}$/.test(mainCommit)) {
    throw new Error("Cannot verify release commit against main");
  }
  if (tagCommit !== mainCommit) throw new Error("Release tag must point to the current main commit");
}

export function assertUnpublished(status, name, version) {
  if (status === 404) return;
  if (status === 200) throw new Error(`${name}@${version} already exists on npm; never republish a version`);
  throw new Error(`Cannot establish that ${name}@${version} is unpublished (HTTP ${status})`);
}

export function assertPublished(versionMetadata, packageMetadata, name, release) {
  if (versionMetadata?.name !== name || versionMetadata?.version !== release.version) {
    throw new Error(`npm has not returned the expected ${name}@${release.version}`);
  }
  if (packageMetadata?.["dist-tags"]?.[release.distTag] !== release.version) {
    throw new Error(`npm dist-tag ${release.distTag} does not point to ${release.version}`);
  }
  const attestation = versionMetadata.dist?.attestations;
  if (!attestation?.url || attestation.provenance?.predicateType !== "https://slsa.dev/provenance/v1") {
    throw new Error(`npm provenance attestation is missing for ${name}@${release.version}`);
  }
}

export function registryUrl(name, version) {
  const packagePath = encodeURIComponent(name);
  return `${REGISTRY}/${packagePath}${version ? `/${encodeURIComponent(version)}` : ""}`;
}

async function readRegistry(url, fetcher) {
  const response = await fetcher(url, {
    headers: { accept: "application/json", "cache-control": "no-cache" },
    signal: AbortSignal.timeout(15_000)
  });
  return { status: response.status, body: response.status === 200 ? await response.json() : null };
}

export async function ensureUnpublished(name, version, fetcher = globalThis.fetch) {
  const result = await readRegistry(registryUrl(name, version), fetcher);
  assertUnpublished(result.status, name, version);
}

export async function waitForPublished(name, release, { fetcher = globalThis.fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), attempts = 12, intervalMs = 10_000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const version = await readRegistry(registryUrl(name, release.version), fetcher);
      const pkg = await readRegistry(registryUrl(name), fetcher);
      if (version.status !== 200 || pkg.status !== 200) {
        throw new Error(`npm registry has not indexed the release (HTTP ${version.status}/${pkg.status})`);
      }
      assertPublished(version.body, pkg.body, name, release);
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await sleep(intervalMs);
    }
  }
  throw new Error(`Cannot verify npm release after ${attempts} attempts: ${lastError?.message}`);
}
