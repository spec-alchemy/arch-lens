import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { atomicWrite, sha256 } from "./core.js";

export const PLANTUML_VERSION = "1.2026.6";
export const PLANTUML_SHA256 = "89948f14c93756c7a3fb7b69078ff37e8489fd79dd430c582b931e2f65358690";
export const PLANTUML_URL = `https://github.com/plantuml/plantuml/releases/download/v${PLANTUML_VERSION}/plantuml-${PLANTUML_VERSION}.jar`;

const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const REDIRECT_HOSTS = new Set(["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"]);

export function managedPlantUmlPath() {
  if (process.env.ARCH_LENS_TEST_MODE === "1" && process.env.ARCH_LENS_TEST_CACHE) {
    return path.resolve(process.env.ARCH_LENS_TEST_CACHE, "arch-lens", "plantuml", PLANTUML_VERSION, "plantuml.jar");
  }
  const cacheRoot = process.platform === "darwin"
    ? path.join(os.homedir(), "Library", "Caches")
    : process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.resolve(cacheRoot, "arch-lens", "plantuml", PLANTUML_VERSION, "plantuml.jar");
}

export async function ensureManagedPlantUml() {
  if (process.env.ARCH_LENS_TEST_MODE === "1" && process.env.ARCH_LENS_TEST_SKIP_RUNTIME === "1") {
    return { installed: false, skipped: true, version: PLANTUML_VERSION, source: PLANTUML_URL, path: null };
  }
  const java = requireJava21();
  const target = managedPlantUmlPath();
  assertSecureCachePath(target);
  if (isValidManagedJar(target)) {
    probeManagedJar(java, target);
    return { installed: false, version: PLANTUML_VERSION, source: PLANTUML_URL, path: target };
  }
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error(`受管 PlantUML 缓存不得是符号链接：${target}`);
  if (fs.existsSync(target) && !fs.lstatSync(target).isFile()) throw new Error(`受管 PlantUML 缓存目标必须是普通文件：${target}`);

  const bytes = await downloadPlantUml();
  if (sha256(bytes) !== expectedSha256()) throw new Error("PlantUML 下载摘要不匹配；缓存未修改。");
  probeManagedJar(java, bytes);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(target), 0o700);
  atomicWrite(target, bytes);
  return { installed: true, version: PLANTUML_VERSION, source: PLANTUML_URL, path: target };
}

export function validManagedPlantUmlPath() {
  const target = managedPlantUmlPath();
  try {
    assertSecureCachePath(target);
    return isValidManagedJar(target) ? target : null;
  } catch {
    return null;
  }
}

export function findExecutable(name) {
  if (name.includes(path.sep) && fs.existsSync(name)) return name;
  for (const directory of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, name);
    try { fs.accessSync(candidate, fs.constants.X_OK); return candidate; } catch {}
  }
  return null;
}

function requireJava21() {
  const java = findExecutable(process.platform === "win32" ? "java.exe" : "java");
  if (!java) throw new Error("Arch Lens init 需要 Java 21 或更高版本，但 PATH 中未找到 java。Arch Lens 只管理 PlantUML，不安装 JRE。");
  const result = spawnSync(java, ["-version"], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  const version = output.match(/version\s+"?(\d+)(?:[._][^"\s]+)?/i)?.[1];
  if (result.status !== 0 || !version || Number(version) < 21) throw new Error("Arch Lens init 需要可运行的 Java 21 或更高版本。请先安装或更新 Java，再重试。");
  return java;
}

function probeManagedJar(java, jarOrBytes) {
  let temporary = null;
  let jar = jarOrBytes;
  if (Buffer.isBuffer(jarOrBytes)) {
    temporary = path.join(os.tmpdir(), `.arch-lens-plantuml-${process.pid}-${Date.now()}.jar`);
    fs.writeFileSync(temporary, jarOrBytes, { flag: "wx", mode: 0o600 });
    jar = temporary;
  }
  try {
    const result = spawnSync(java, ["-Djava.awt.headless=true", "-jar", jar, "-headless", "-version"], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      env: securePlantUmlEnv()
    });
    const output = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
    const version = output.match(/PlantUML\s+version\s+(\d+\.\d+\.\d+)/i)?.[1];
    if (!version || version !== PLANTUML_VERSION) throw new Error(`受管 PlantUML 版本探测失败；要求 ${PLANTUML_VERSION}。`);
  } finally {
    if (temporary) fs.rmSync(temporary, { force: true });
  }
}

function securePlantUmlEnv() {
  const env = { ...process.env, PLANTUML_SECURITY_PROFILE: "SANDBOX" };
  delete env["plantuml.allowlist.path"];
  delete env["plantuml.allowlist.url"];
  delete env["plantuml.include.path"];
  return env;
}

function assertSecureCachePath(target) {
  let current = path.parse(path.resolve(target)).root;
  for (const segment of path.resolve(target).slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) continue;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`受管 PlantUML 缓存路径不得包含符号链接：${current}`);
    if (current !== target && !stat.isDirectory()) throw new Error(`受管 PlantUML 缓存父路径必须是目录：${current}`);
  }
  const managedRoot = target.slice(0, target.indexOf(`${path.sep}plantuml${path.sep}`) + `${path.sep}plantuml`.length);
  if (managedRoot && fs.existsSync(managedRoot)) {
    const stat = fs.statSync(managedRoot);
    if (typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error(`受管 PlantUML 缓存必须由当前用户拥有：${managedRoot}`);
    if ((stat.mode & 0o022) !== 0) throw new Error(`受管 PlantUML 缓存不得允许其他用户写入：${managedRoot}`);
  }
}

function isValidManagedJar(target) {
  if (!fs.existsSync(target)) return false;
  const stat = fs.lstatSync(target);
  return stat.isFile() && !stat.isSymbolicLink() && sha256(fs.readFileSync(target)) === expectedSha256();
}

function expectedSha256() {
  if (process.env.ARCH_LENS_TEST_MODE === "1" && /^[0-9a-f]{64}$/.test(process.env.ARCH_LENS_TEST_PLANTUML_SHA256 ?? "")) return process.env.ARCH_LENS_TEST_PLANTUML_SHA256;
  return PLANTUML_SHA256;
}

async function downloadPlantUml() {
  if (process.env.ARCH_LENS_TEST_MODE === "1" && process.env.ARCH_LENS_TEST_PLANTUML_SOURCE) {
    const source = path.resolve(process.env.ARCH_LENS_TEST_PLANTUML_SOURCE);
    const stat = fs.lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_DOWNLOAD_BYTES) throw new Error("测试 PlantUML 来源必须是大小受限的普通文件。");
    return fs.readFileSync(source);
  }
  return downloadHttps(new URL(PLANTUML_URL), 0);
}

function downloadHttps(url, redirects) {
  if (url.protocol !== "https:" || !REDIRECT_HOSTS.has(url.hostname)) return Promise.reject(new Error(`拒绝不受信任的 PlantUML 下载地址：${url.href}`));
  if (redirects > 5) return Promise.reject(new Error("PlantUML 下载重定向次数过多。"));
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: DOWNLOAD_TIMEOUT_MS, headers: { "User-Agent": "arch-lens/0.0.0-draft" } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadHttps(new URL(response.headers.location, url), redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`PlantUML 下载失败：HTTP ${response.statusCode}`));
        return;
      }
      const expected = Number(response.headers["content-length"] ?? 0);
      if (expected > MAX_DOWNLOAD_BYTES) {
        response.destroy();
        reject(new Error("PlantUML 下载超过允许大小。"));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on("data", (chunk) => {
        total += chunk.length;
        if (total > MAX_DOWNLOAD_BYTES) response.destroy(new Error("PlantUML 下载超过允许大小。"));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("PlantUML 下载超时。")));
    request.on("error", reject);
  });
}
