import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import {
  DIAGRAMS_RELATIVE_PATH,
  atomicWrite,
  diagnostic,
  isInside,
  operationError,
  relativePosix,
  replaceDirectoryAtomically,
  resolvePotentialRealPath,
  sha256,
  writeTreeFile
} from "./core.js";
import { findExecutable, validManagedPlantUmlPath } from "./plantuml-runtime.js";
import { requireDiagramWorkspace } from "./repository.js";

const MAX_PLANTUML_OUTPUT = 32 * 1024 * 1024;
export const MIN_PLANTUML_VERSION = "1.2026.6";
const DIAGRAM_TYPES = new Set(["use-case", "domain", "activity", "sequence", "component", "state"]);

export function discoverDiagrams(root) {
  if (!fs.existsSync(root)) return [];
  const found = [];
  const visit = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`图集不允许符号链接：${relativePosix(root, target)}`);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".iuml")) {
        throw new Error(`图集禁止 .iuml 文件；每个 .puml 必须自包含：${relativePosix(root, target)}`);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".puml")) found.push(target);
    }
  };
  visit(root);
  return found.sort((a, b) => relativePosix(root, a).localeCompare(relativePosix(root, b), "en"));
}

export function listDiagrams(cwd) {
  const workspace = requireDiagramWorkspace(cwd);
  return {
    diagramsPath: DIAGRAMS_RELATIVE_PATH,
    diagrams: discoverDiagrams(workspace.diagramsRoot).map((file) => diagramRecord(workspace, file))
  };
}

export function checkDiagrams(cwd, requestedFiles = []) {
  const workspace = requireDiagramWorkspace(cwd);
  const files = resolveRequestedDiagrams(workspace, requestedFiles);
  const records = files.map((file) => ({ path: relativePosix(workspace.root, file), content: fs.readFileSync(file), file }));
  const diagnostics = inspectDiagramRecords(records);
  if (diagnostics.some(isError)) throw operationError("PlantUML 离线资源策略检查失败。", diagnostics);
  if (records.length > 0) validateSyntax(workspace.root, records, diagnostics);
  const mirror = validateSvgMirror(workspace.root, records.map((record) => ({
    ...record,
    svgFile: path.join(workspace.root, ".arch-lens", "rendered", path.relative(workspace.diagramsRoot, record.file).replace(/\.puml$/i, ".svg"))
  })), {
    renderedRoot: path.join(workspace.root, ".arch-lens", "rendered"),
    fullMirror: !requestedFiles || requestedFiles.length === 0
  });
  diagnostics.push(...mirror.diagnostics);
  if (diagnostics.some(isError)) throw operationError("PlantUML 检查失败。", diagnostics);
  return { valid: true, files: records.map((record) => record.path), svg: mirror.facts, diagnostics: diagnostics.sort(compareDiagnostics) };
}

export function renderDiagrams(cwd, requestedFiles = [], output) {
  const workspace = requireDiagramWorkspace(cwd);
  const files = resolveRequestedDiagrams(workspace, requestedFiles);
  const outputRoot = output ? path.resolve(cwd, output) : path.join(workspace.root, ".arch-lens", "rendered");
  assertOutputOutsideSource(workspace.diagramsRoot, outputRoot);
  const records = files.map((file) => ({ path: relativePosix(workspace.root, file), content: fs.readFileSync(file), file }));
  const diagnostics = inspectDiagramRecords(records);
  if (diagnostics.some(isError)) throw operationError("PlantUML 离线资源策略检查失败。", diagnostics);
  const fullMirror = !requestedFiles || requestedFiles.length === 0;
  const standardMirror = !output;
  if (records.length === 0) {
    if (fullMirror) fs.rmSync(outputRoot, { recursive: true, force: true });
    return { output: outputRoot, standardMirror, rendered: [], svg: [], diagnostics };
  }
  const svgs = renderDiagramRecords(workspace.root, records, diagnostics, { managedOnly: standardMirror });
  const pending = records.map((record, index) => {
    const relative = path.relative(workspace.diagramsRoot, record.file).replace(/\.puml$/i, ".svg");
    const target = path.join(outputRoot, relative);
    assertOutputOutsideSource(workspace.diagramsRoot, target);
    return { source: record.path, output: target, svg: svgs[index] };
  });
  const facts = pending.map((item) => svgFacts(item.svg, item.output, workspace.root));
  diagnostics.push(...facts.flatMap((item) => item.diagnostics));
  if (diagnostics.some(isError)) throw operationError("PlantUML 生成的 SVG 不符合标准镜像合同。", diagnostics.sort(compareDiagnostics));
  if (fullMirror) {
    replaceDirectoryAtomically(outputRoot, (temporary) => {
      for (const item of pending) {
        const relative = path.relative(outputRoot, item.output);
        writeTreeFile(temporary, relative, item.svg);
      }
    });
  } else {
    for (const item of pending) atomicWrite(item.output, item.svg);
  }
  return {
    output: outputRoot,
    standardMirror,
    rendered: pending.map(({ source, output: renderedOutput }) => ({ source, output: renderedOutput })),
    svg: facts,
    diagnostics: diagnostics.sort(compareDiagnostics)
  };
}

export function validateDiagramRecords(root, records, { syntax = true } = {}) {
  const diagnostics = inspectDiagramRecords(records);
  if (syntax && records.length > 0 && !diagnostics.some(isError)) validateSyntax(root, records, diagnostics);
  return diagnostics.sort(compareDiagnostics);
}

export function renderDiagramRecords(root, records, diagnostics = [], { managedOnly = false } = {}) {
  const policyDiagnostics = inspectDiagramRecords(records);
  diagnostics.push(...policyDiagnostics);
  if (diagnostics.some(isError)) throw operationError("PlantUML 离线资源策略检查失败。", diagnostics.sort(compareDiagnostics));
  if (records.length === 0) return [];
  const runner = resolvePlantUmlRunner({ managedOnly });
  requireSupportedPlantUml(runner, root);
  const args = ["-tsvg", "-pipe", "-failfast2", "-charset", "UTF-8"];
  const batch = runPlantUml(runner, args, { cwd: root, input: diagramBatch(records), encoding: null });
  const output = Buffer.isBuffer(batch.stdout) ? batch.stdout : Buffer.from(batch.stdout ?? "");
  const svgs = batch.status === 0 ? splitSvgStream(output) : null;
  const validCount = svgs?.filter(isUsableSvg).length ?? 0;
  if (svgs?.length === records.length && validCount === records.length) return svgs;
  diagnoseRenderFailure(runner, root, records, args, batch, diagnostics);
  if (batch.status === 0) diagnostics.push(diagnostic("error", "PLANTUML_OUTPUT_PROTOCOL", null, null, `PlantUML 批量渲染返回 ${svgs?.length ?? 0} 个 SVG，其中 ${validCount} 个有效；预期 ${records.length} 个。`));
  if (!diagnostics.some(isError)) diagnostics.push(diagnostic("error", "PLANTUML_BATCH_RENDER", null, null, commandMessage(batch) || "PlantUML 批量渲染失败。"));
  throw operationError("PlantUML 渲染失败。", diagnostics.sort(compareDiagnostics));
}

export function validateSvgMirror(root, records, { renderedRoot = null, fullMirror = false } = {}) {
  const diagnostics = [];
  const facts = [];
  const expectedPaths = new Set(records.map((record) => path.resolve(record.svgFile)));

  if (renderedRoot && fs.existsSync(renderedRoot)) {
    if (fs.lstatSync(renderedRoot).isSymbolicLink() || !fs.statSync(renderedRoot).isDirectory()) {
      diagnostics.push(diagnostic("error", "SVG_MIRROR_INVALID", relativePosix(root, renderedRoot), null, "标准 SVG 镜像必须是真实目录且不得是符号链接。"));
    } else if (fullMirror) {
      for (const file of discoverSvgFiles(renderedRoot, root, diagnostics)) {
        if (!expectedPaths.has(path.resolve(file))) diagnostics.push(diagnostic("error", "SVG_ORPHAN", relativePosix(root, file), null, "标准 SVG 没有对应的 .puml 源文件。"));
      }
    }
  }

  for (const record of records) {
    const svgPath = record.svgFile;
    const relative = relativePosix(root, svgPath);
    if (!fs.existsSync(svgPath)) {
      diagnostics.push(diagnostic("error", "SVG_MISSING", relative, null, `缺少 ${record.path} 对应的标准 SVG。`));
      continue;
    }
    if (fs.lstatSync(svgPath).isSymbolicLink() || !fs.statSync(svgPath).isFile()) {
      diagnostics.push(diagnostic("error", "SVG_FILE_INVALID", relative, null, "标准 SVG 必须是普通文件且不得是符号链接。"));
      continue;
    }
    const fact = svgFacts(fs.readFileSync(svgPath), svgPath, root);
    facts.push(fact);
    diagnostics.push(...fact.diagnostics);
  }

  if (records.length > 0 && !diagnostics.some(isError)) {
    const expected = renderDiagramRecords(root, records, diagnostics, { managedOnly: true });
    records.forEach((record, index) => {
      const actual = fs.readFileSync(record.svgFile);
      const actualSource = plantUmlSourceToken(actual);
      const expectedSource = plantUmlSourceToken(expected[index]);
      const fresh = actualSource && expectedSource
        ? actualSource === expectedSource
        : actual.equals(expected[index]);
      if (!fresh) diagnostics.push(diagnostic("error", "SVG_STALE", relativePosix(root, record.svgFile), null, `标准 SVG 与 ${record.path} 的 PlantUML 源指纹不一致。`));
    });
  }
  return { facts, diagnostics: diagnostics.sort(compareDiagnostics) };
}

export function svgFacts(svg, file, root = process.cwd()) {
  const bytes = Buffer.isBuffer(svg) ? svg : Buffer.from(svg);
  const source = bytes.toString("utf8");
  const diagnostics = [];
  const label = path.isAbsolute(file) ? relativePosix(root, file) : file;
  if (!isUsableSvg(bytes)) diagnostics.push(diagnostic("error", "SVG_INVALID", label, null, "文件不是可用的 PlantUML SVG。"));
  const rootTag = source.match(/<svg\b([^>]*)>/i)?.[1] ?? "";
  const attributes = parseXmlAttributes(rootTag);
  const viewBoxValues = attributes.viewBox?.trim().split(/[\s,]+/).map(Number);
  const viewBox = viewBoxValues?.length === 4 && viewBoxValues.every(Number.isFinite)
    ? { minX: viewBoxValues[0], minY: viewBoxValues[1], width: viewBoxValues[2], height: viewBoxValues[3] }
    : null;
  const width = parseSvgLength(attributes.width);
  const height = parseSvgLength(attributes.height);
  const ratioWidth = width ?? viewBox?.width ?? null;
  const ratioHeight = height ?? viewBox?.height ?? null;
  if (!viewBox || width === null || height === null) diagnostics.push(diagnostic("error", "SVG_DIMENSIONS_MISSING", label, null, "标准 SVG 必须声明可解析的 viewBox、width 和 height。"));
  if ((viewBox && (viewBox.width <= 0 || viewBox.height <= 0)) || (width !== null && width <= 0) || (height !== null && height <= 0)) {
    diagnostics.push(diagnostic("error", "SVG_DIMENSIONS_NON_POSITIVE", label, null, "标准 SVG 的 viewBox、width 和 height 必须为正数。"));
  }
  const aspectRatio = ratioWidth !== null && ratioHeight > 0 ? ratioWidth / ratioHeight : null;
  if (aspectRatio !== null && (aspectRatio > 4 || aspectRatio < 0.25)) diagnostics.push(diagnostic("warning", "SVG_ASPECT_RATIO_EXTREME", label, null, `SVG 宽高比 ${formatNumber(aspectRatio)} 较极端，需要人工检查阅读顺序和密度。`));
  return { path: label, sha256: sha256(bytes), viewBox, width, height, aspectRatio, diagnostics };
}

function resolveRequestedDiagrams(workspace, requested) {
  const discovered = discoverDiagrams(workspace.diagramsRoot);
  if (!requested || requested.length === 0) return discovered;
  const unique = new Set();
  for (const value of requested) {
    const file = path.resolve(process.cwd(), value);
    if (!isInside(workspace.diagramsRoot, file) || !file.toLowerCase().endsWith(".puml")) throw new Error(`只允许选择 ${DIAGRAMS_RELATIVE_PATH} 内的 .puml 文件：${value}`);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`图文件不存在：${value}`);
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`图集不允许符号链接：${value}`);
    unique.add(file);
  }
  return [...unique].sort((a, b) => relativePosix(workspace.diagramsRoot, a).localeCompare(relativePosix(workspace.diagramsRoot, b), "en"));
}

function inspectDiagramRecords(records) {
  const diagnostics = [];
  for (const record of records) inspectDiagramSource(record.path, record.content.toString("utf8"), diagnostics);
  return diagnostics.sort(compareDiagnostics);
}

function inspectDiagramSource(file, source, diagnostics) {
  const lines = source.split(/\r?\n/);
  const starts = lines.filter((line) => /^\s*@startuml(?:\s|$)/i.test(line)).length;
  const ends = lines.filter((line) => /^\s*@enduml(?:\s|$)/i.test(line)).length;
  if (starts !== 1 || ends !== 1) diagnostics.push(diagnostic("error", "ONE_DIAGRAM_PER_FILE", file, null, "每个 .puml 文件必须且只能包含一个 @startuml/@enduml 图。"));
  const metadata = Object.fromEntries([...source.matchAll(/^\s*'\s*arch-lens:\s*([\w-]+)\s*=\s*(.+?)\s*$/gim)].map((match) => [match[1], match[2]]));
  if (!metadata.type || !metadata.question || !/^\s*title\s+\S/im.test(source)) diagnostics.push(diagnostic("error", "DIAGRAM_METADATA_REQUIRED", file, null, "每张图必须声明 arch-lens: type、arch-lens: question 和 title。"));
  if (metadata.type && !DIAGRAM_TYPES.has(metadata.type)) diagnostics.push(diagnostic("error", "DIAGRAM_TYPE_INVALID", file, null, `不支持的 arch-lens: type：${metadata.type}。`));
  lines.forEach((line, index) => {
    if (/(?:https?|ftp|file|jar):\/\//i.test(line) || /<img\s*:/i.test(line)) diagnostics.push(diagnostic("error", "REMOTE_RESOURCE_FORBIDDEN", file, index + 1, "图集必须离线自包含，禁止 URL、file URI 和外部图片。"));
    if (/^\s*!include/i.test(line) || /^\s*!import\b/i.test(line) || /^\s*!pragma\s+includePath\b/i.test(line)) diagnostics.push(diagnostic("error", "INCLUDE_FORBIDDEN", file, index + 1, "每个 .puml 必须自包含；禁止 include、import 和自定义 include path。"));
  });
}

function validateSyntax(root, records, diagnostics) {
  const runner = resolvePlantUmlRunner();
  requireSupportedPlantUml(runner, root);
  const batch = runPlantUml(runner, ["-syntax"], { cwd: root, input: diagramBatch(records) });
  if (batch.status === 0) return;
  const errorsBefore = diagnostics.filter(isError).length;
  for (const record of records) {
    const result = runPlantUml(runner, ["-syntax"], { cwd: root, input: record.content });
    if (result.status !== 0) diagnostics.push(diagnostic("error", "PLANTUML_SYNTAX", record.path, null, commandMessage(result) || "PlantUML 语法检查失败。"));
  }
  if (diagnostics.filter(isError).length === errorsBefore) diagnostics.push(diagnostic("error", "PLANTUML_BATCH_CHECK", null, null, commandMessage(batch) || "PlantUML 批量语法检查失败。"));
}

function resolvePlantUmlRunner({ managedOnly = false } = {}) {
  if (managedOnly) {
    const managed = validManagedPlantUmlPath();
    const testManaged = process.env.ARCH_LENS_TEST_MODE === "1" ? process.env.ARCH_LENS_TEST_MANAGED_PLANTUML?.trim() : null;
    if (testManaged) {
      const executable = path.resolve(testManaged);
      if (!fs.existsSync(executable) || fs.lstatSync(executable).isSymbolicLink() || !fs.statSync(executable).isFile()) throw new Error(`测试受管 PlantUML 不存在：${executable}`);
      return { command: executable, prefix: [] };
    }
    const jar = managed;
    if (!jar || !fs.existsSync(jar) || fs.lstatSync(jar).isSymbolicLink() || !fs.statSync(jar).isFile()) {
      throw new Error("标准 SVG 必须使用锁定的受管 PlantUML；请先运行 arch-lens init。ARCH_LENS_PLANTUML 不能用于标准镜像。");
    }
    const java = findExecutable(process.platform === "win32" ? "java.exe" : "java");
    if (!java) throw new Error("受管 PlantUML 已安装，但 PATH 中未找到 Java 21 或更高版本。");
    return { command: java, prefix: ["-Djava.awt.headless=true", "-jar", jar] };
  }
  const configured = process.env.ARCH_LENS_PLANTUML?.trim();
  if (configured) {
    const resolved = path.resolve(configured);
    if (configured.toLowerCase().endsWith(".jar") || resolved.toLowerCase().endsWith(".jar")) {
      if (!fs.existsSync(resolved)) throw new Error(`ARCH_LENS_PLANTUML 指定的 JAR 不存在：${resolved}`);
      if (fs.lstatSync(resolved).isSymbolicLink() || !fs.statSync(resolved).isFile()) throw new Error(`ARCH_LENS_PLANTUML 指定的 JAR 必须是普通文件且不得是符号链接：${resolved}`);
      const java = findExecutable("java");
      if (!java) throw new Error("使用 PlantUML JAR 需要 java，但 PATH 中未找到。");
      return { command: java, prefix: ["-Djava.awt.headless=true", "-jar", resolved] };
    }
    const executable = fs.existsSync(resolved) ? resolved : findExecutable(configured);
    if (!executable) throw new Error(`ARCH_LENS_PLANTUML 指定的可执行文件不存在：${configured}`);
    return { command: executable, prefix: [] };
  }
  const managed = validManagedPlantUmlPath();
  if (managed) {
    const java = findExecutable(process.platform === "win32" ? "java.exe" : "java");
    if (!java) throw new Error("受管 PlantUML 已安装，但 PATH 中未找到 Java 21 或更高版本。");
    return { command: java, prefix: ["-Djava.awt.headless=true", "-jar", managed] };
  }
  const executable = findExecutable(process.platform === "win32" ? "plantuml.exe" : "plantuml");
  if (!executable) throw new Error("未找到 PlantUML。请先运行 arch-lens init 安装受管运行时，或将 ARCH_LENS_PLANTUML 指向 plantuml 可执行文件或 plantuml.jar。Arch Lens 不会把模型上传到远程服务器。");
  return { command: executable, prefix: [] };
}

function runPlantUml(runner, args, options) {
  const env = { ...process.env, PLANTUML_LIMIT_SIZE: process.env.PLANTUML_LIMIT_SIZE ?? "8192", PLANTUML_SECURITY_PROFILE: "SANDBOX" };
  delete env["plantuml.allowlist.path"];
  delete env["plantuml.allowlist.url"];
  delete env["plantuml.include.path"];
  return spawnSync(runner.command, [...runner.prefix, "-headless", ...args], { cwd: options.cwd, input: options.input, encoding: options.encoding === null ? null : "utf8", maxBuffer: MAX_PLANTUML_OUTPUT, env });
}

function requireSupportedPlantUml(runner, cwd) {
  const result = runPlantUml(runner, ["-version"], { cwd });
  const output = commandMessage(result);
  const version = output.match(/PlantUML\s+version\s+(\d+\.\d+\.\d+)/i)?.[1];
  if (!version) throw new Error(`无法识别 PlantUML 版本${result.status !== 0 ? `：${output || "进程执行失败。"}` : ""}；要求 ${MIN_PLANTUML_VERSION} 或更高版本。`);
  if (compareVersions(version, MIN_PLANTUML_VERSION) < 0) throw new Error(`PlantUML ${version} 过旧；要求 ${MIN_PLANTUML_VERSION} 或更高版本。`);
  return version;
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function diagramBatch(records) {
  return Buffer.from(records.map((record) => record.content.toString("utf8").trimEnd()).join("\n") + "\n");
}

function diagnoseRenderFailure(runner, root, records, args, batch, diagnostics) {
  for (const record of records) {
    const syntax = runPlantUml(runner, ["-syntax"], { cwd: root, input: record.content });
    if (syntax.status !== 0) {
      diagnostics.push(diagnostic("error", "PLANTUML_SYNTAX", record.path, null, commandMessage(syntax) || "PlantUML 语法检查失败。"));
      continue;
    }
    const render = runPlantUml(runner, args, { cwd: root, input: record.content, encoding: null });
    const output = Buffer.isBuffer(render.stdout) ? render.stdout : Buffer.from(render.stdout ?? "");
    const svgs = render.status === 0 ? splitSvgStream(output) : null;
    if (render.status !== 0 || svgs?.length !== 1 || !isUsableSvg(svgs[0])) diagnostics.push(diagnostic("error", "PLANTUML_RENDER", record.path, null, commandMessage(render) || commandMessage(batch) || "PlantUML 未生成有效 SVG。"));
  }
}

function commandMessage(result) {
  if (result.error) return result.error.message;
  const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr;
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString("utf8") : result.stdout;
  return [stderr, stdout].filter(Boolean).join("\n").trim();
}

function isUsableSvg(svg) {
  const source = svg.toString("utf8");
  return source.slice(0, 4096).includes("<svg") && !/(?:Cannot find Graphviz|Dot executable does not exist|Syntax Error\?|An error has occurred|No valid @start)/i.test(source);
}

function plantUmlSourceToken(svg) {
  return svg.toString("utf8").match(/<\?plantuml-src\s+([^?]+)\?>/i)?.[1] ?? null;
}

function discoverSvgFiles(root, workspaceRoot, diagnostics) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) diagnostics.push(diagnostic("error", "SVG_FILE_INVALID", relativePosix(workspaceRoot, target), null, "标准 SVG 镜像不得包含符号链接。"));
      else if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".svg")) files.push(target);
      else if (entry.isFile()) diagnostics.push(diagnostic("error", "SVG_FILE_INVALID", relativePosix(workspaceRoot, target), null, "标准 SVG 镜像只允许 .svg 文件。"));
      else diagnostics.push(diagnostic("error", "SVG_FILE_INVALID", relativePosix(workspaceRoot, target), null, "标准 SVG 镜像不允许特殊文件。"));
    }
  };
  visit(root);
  return files;
}

function parseXmlAttributes(source) {
  const attributes = {};
  for (const match of source.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attributes[match[1]] = match[2] ?? match[3] ?? "";
  return attributes;
}

function parseSvgLength(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:px|pt|pc|mm|cm|in)?$/i);
  return match ? Number(match[1]) : null;
}

function formatNumber(value) {
  return Number(value.toFixed(4)).toString();
}

function splitSvgStream(output) {
  const source = output.toString("utf8");
  const matches = [...source.matchAll(/<svg\b[\s\S]*?<\/svg\s*>/gi)];
  if (matches.length === 0) return null;
  let offset = 0;
  const svgs = [];
  for (const match of matches) {
    if (!isIgnorableSvgGap(source.slice(offset, match.index))) return null;
    svgs.push(Buffer.from(match[0]));
    offset = match.index + match[0].length;
  }
  return isIgnorableSvgGap(source.slice(offset)) ? svgs : null;
}

function isIgnorableSvgGap(source) {
  return source.replace(/<\?xml[\s\S]*?\?>/gi, "").trim() === "";
}

function assertOutputOutsideSource(sourceRoot, target) {
  const sourceReal = fs.realpathSync(sourceRoot);
  const targetReal = resolvePotentialRealPath(target);
  if (isInside(sourceReal, targetReal)) throw new Error("SVG 输出目录及其真实路径不得位于 .arch-lens/diagrams 源目录内。");
}

function diagramRecord(workspace, file) {
  const source = fs.readFileSync(file, "utf8");
  const metadata = Object.fromEntries([...source.matchAll(/^\s*'\s*arch-lens:\s*([\w-]+)\s*=\s*(.+?)\s*$/gim)].map((match) => [match[1], match[2]]));
  return { path: relativePosix(workspace.root, file), type: metadata.type ?? inferDiagramType(source), question: metadata.question ?? null, title: source.match(/^\s*title\s+(.+?)\s*$/im)?.[1] ?? null };
}

function inferDiagramType(source) {
  if (/^\s*(?:actor|usecase)\b/im.test(source)) return "use-case";
  if (/^\s*(?:state)\b/im.test(source) || /\[\*\]\s*-->/m.test(source)) return "state";
  if (/^\s*(?:participant|boundary|control|database|collections|queue)\b/im.test(source) || /^\s*[^']+\s*[-.]+>\s*/m.test(source)) return "sequence";
  if (/^\s*(?:start|stop|partition|fork|repeat|while)\b/im.test(source)) return "activity";
  if (/^\s*(?:component|interface|port)\b/im.test(source)) return "component";
  if (/^\s*(?:class|entity|enum|annotation)\b/im.test(source)) return "domain";
  return "uml";
}

function isError(item) { return item.severity === "error"; }
function compareDiagnostics(a, b) { return `${a.file ?? ""}:${a.line ?? 0}:${a.code}`.localeCompare(`${b.file ?? ""}:${b.line ?? 0}:${b.code}`, "en"); }
