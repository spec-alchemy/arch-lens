import { Command, Help } from "commander";
import {
  FEATURES,
  SCHEMA_VERSION,
  VERSION,
  WORKFLOW_PROTOCOL,
  emit,
  localizeCommanderError,
  printJson
} from "./core.js";
import { applyModel, archiveChange, changeEvidence, changeStatus, createChange, diffChange, recordApproval, renderChange, validateChangeCommand } from "./change-pack.js";
import { checkDiagrams, listDiagrams, renderDiagrams } from "./plantuml.js";
import { initWorkspace, installAgent } from "./workspace.js";

export async function runCli(argv = process.argv) {
  let commanderError = "";
  const program = new Command();
  program
    .name("arch-lens")
    .description("Skill-first 的 PlantUML 业务建模与变更审查工作区。")
    .version(VERSION, "-V, --version", "显示版本号")
    .helpOption("-h, --help", "显示帮助")
    .helpCommand("help [command]", "显示命令帮助")
    .configureHelp({
      formatHelp(command, helper) {
        return Help.prototype.formatHelp.call(this, command, helper)
          .replace("Usage:", "用法：")
          .replace("Arguments:", "参数：")
          .replace("Options:", "选项：")
          .replace("Global Options:", "全局选项：")
          .replace("Commands:", "命令：")
          .replaceAll("[options]", "[选项]")
          .replaceAll("[command]", "[命令]");
      }
    })
    .configureOutput({ outputError: (message) => { commanderError = localizeCommanderError(message).trim(); } });

  program
    .command("capabilities")
    .description("报告 CLI 与 Skill 可协商的确定性工作流能力。")
    .option("--json", "输出机器可读 JSON")
    .action((options) => runOrExit(options.json, () => {
      const payload = { schemaVersion: SCHEMA_VERSION, cliVersion: VERSION, workflowProtocol: WORKFLOW_PROTOCOL, features: [...FEATURES] };
      emit(options.json, payload, `Arch Lens ${VERSION}，workflowProtocol ${WORKFLOW_PROTOCOL}：${FEATURES.join(", ")}`);
    }));

  program
    .command("init")
    .description(`创建 protocol ${WORKFLOW_PROTOCOL} 工作区并安装项目本地 Codex Skill。`)
    .option("--json", "输出机器可读 JSON")
    .action((options) => runOrExit(options.json, async () => {
      const payload = { schemaVersion: SCHEMA_VERSION, ...await initWorkspace(process.cwd()) };
      const workspaceMessage = payload.created ? `已创建 Arch Lens workflowProtocol ${WORKFLOW_PROTOCOL} 工作区。` : `Arch Lens protocol ${WORKFLOW_PROTOCOL} 工作区已同步；现有模型和 Change Pack 未被覆盖。`;
      const runtime = payload.plantUmlRuntime;
      const runtimeMessage = runtime.skipped ? "PlantUML 运行时安装仅在测试模式中跳过。" : `PlantUML ${runtime.version} ${runtime.installed ? "已安装" : "已复用"}：${runtime.path}`;
      emit(options.json, payload, `${workspaceMessage}\n${runtimeMessage}`);
    }));

  const diagrams = program.command("diagrams").description("发现、检查和渲染 PlantUML 图集。");
  diagrams.command("list").description("递归列出工作区中的 .puml 图。")
    .option("--json", "输出机器可读 JSON")
    .action((options) => runOrExit(options.json, () => {
      const result = listDiagrams(process.cwd());
      if (options.json) printJson({ schemaVersion: SCHEMA_VERSION, ...result });
      else if (result.diagrams.length === 0) console.log("图集为空。请先根据明确的建模问题创建 Change Pack。");
      else result.diagrams.forEach((record) => console.log(`${record.path}\t${record.type}\t${record.title ?? ""}`.trimEnd()));
    }));
  diagrams.command("check").argument("[files...]", "要检查的图，默认检查完整图集")
    .description("执行离线资源策略检查和 PlantUML 语法检查。")
    .option("--json", "输出机器可读 JSON")
    .action((files, options) => runOrExit(options.json, () => {
      const result = checkDiagrams(process.cwd(), files);
      emit(options.json, { schemaVersion: SCHEMA_VERSION, ...result }, result.files.length === 0 ? "图集为空；无需执行 PlantUML 检查。" : `PlantUML 检查通过（${result.files.length} 个文件）。`);
    }));
  diagrams.command("render").argument("[files...]", "要渲染的图，默认渲染完整图集")
    .option("--output <dir>", "SVG 输出目录（默认：Git 根/.arch-lens/rendered）")
    .description("先检查图集合同，再使用本地 PlantUML 生成 SVG。")
    .option("--json", "输出机器可读 JSON")
    .action((files, options) => runOrExit(options.json, () => {
      const result = renderDiagrams(process.cwd(), files, options.output);
      emit(options.json, { schemaVersion: SCHEMA_VERSION, ...result }, result.rendered.length === 0 ? "图集为空；无需生成 SVG。" : `已生成 ${result.rendered.length} 个 SVG 到 ${result.output}。`);
    }));

  const change = program.command("change").description("管理确定性的 Change Pack 文件、摘要、审批记录与归档事实。");
  change.command("new").argument("<id>", "小写 kebab-case Change ID")
    .option("--json", "输出机器可读 JSON")
    .description("从当前 HEAD 创建固定 Change Pack 脚手架。")
    .action((id, options) => runOrExit(options.json, () => {
      const result = createChange(process.cwd(), id);
      emit(options.json, { schemaVersion: SCHEMA_VERSION, ...result }, `已创建 Change Pack：${result.path}`);
    }));
  change.command("status").argument("[id]", "Change ID；省略时列出全部活动变更")
    .option("--json", "输出机器可读 JSON")
    .description("报告文件、Git、摘要、任务、验证和审批事实。")
    .action((id, options) => runOrExit(options.json, () => {
      const result = changeStatus(process.cwd(), id);
      if (options.json) printJson({ schemaVersion: SCHEMA_VERSION, ...result });
      else console.log(formatStatus(result));
    }));
  change.command("validate").argument("<id>", "Change ID")
    .option("--json", "输出机器可读 JSON")
    .description("检查 Change Pack Schema、引用、Git 事实和 PlantUML。")
    .action((id, options) => runOrExit(options.json, () => {
      const result = validateChangeCommand(process.cwd(), id);
      emit(options.json, { schemaVersion: SCHEMA_VERSION, ...result }, `Change Pack ${id} 的结构、Git 事实和 PlantUML 检查通过。`);
    }));
  change.command("diff").argument("<id>", "Change ID")
    .option("--json", "输出机器可读 JSON")
    .description("从 baseCommit 与候选 overlay 生成只读 PlantUML 文本 diff。")
    .action((id, options) => runOrExit(options.json, () => {
      const result = diffChange(process.cwd(), id);
      if (options.json) printJson({ schemaVersion: SCHEMA_VERSION, ...result });
      else process.stdout.write(result.patch || "没有 PlantUML 文本变化。\n");
    }));
  change.command("render").argument("<id>", "Change ID")
    .option("--json", "输出机器可读 JSON")
    .description("按需生成与候选 diagrams 路径一致的纯 SVG 镜像。")
    .action((id, options) => runOrExit(options.json, () => {
      const result = renderChange(process.cwd(), id);
      emit(options.json, { schemaVersion: SCHEMA_VERSION, ...result }, result.rendered.length === 0 ? "该变更没有可渲染的候选图。" : `已生成 ${result.rendered.length} 个候选 SVG 到 ${result.output}。`);
    }));
  change.command("apply-model").argument("<id>", "Change ID")
    .option("--json", "输出机器可读 JSON")
    .description("在设计批准有效时原子提升候选 overlay 到已批准图集。")
    .action((id, options) => runOrExit(options.json, () => {
      const result = applyModel(process.cwd(), id);
      emit(options.json, { schemaVersion: SCHEMA_VERSION, ...result }, `已提升 Change Pack ${id} 的 ${result.applied.length} 张模型图；请形成 model-only commit。`);
    }));
  change.command("record-approval").argument("<id>", "Change ID")
    .requiredOption("--stage <stage>", "记录阶段：design 或 completion")
    .requiredOption("--reviewer <name>", "明确作出决定的人类审查者")
    .option("--json", "输出机器可读 JSON")
    .description("记录已经由人类作出的批准；该命令不会自行判断或批准设计。")
    .action((id, options) => runOrExit(options.json, () => {
      const result = recordApproval(process.cwd(), id, options.stage, options.reviewer);
      emit(options.json, { schemaVersion: SCHEMA_VERSION, ...result }, `已记录 ${result.stage} approval：${result.digest}`);
    }));
  change.command("evidence").argument("<id>", "Change ID")
    .option("--json", "输出机器可读 JSON")
    .description("读取 model-only commit 之后的 Git、任务和 AC 事实。")
    .action((id, options) => runOrExit(options.json, () => {
      const result = changeEvidence(process.cwd(), id);
      if (options.json) printJson({ schemaVersion: SCHEMA_VERSION, ...result });
      else console.log(JSON.stringify(result, null, 2));
    }));
  change.command("archive").argument("<id>", "Change ID")
    .option("--json", "输出机器可读 JSON")
    .description("在 completion approval 有效时原子归档 Change Pack。")
    .action((id, options) => runOrExit(options.json, () => {
      const result = archiveChange(process.cwd(), id);
      emit(options.json, { schemaVersion: SCHEMA_VERSION, ...result }, `已归档 Change Pack：${result.archivedPath}`);
    }));

  program.command("install-agent").argument("<agent>", "要安装的 Agent 集成，当前仅支持 codex")
    .description("为受支持的 AI 编程 Agent 安装 Arch Lens Skill。")
    .option("--scope <scope>", "安装范围：project 或 global（默认：project）")
    .option("--project", "安装到当前项目的 .agents/skills 目录")
    .option("--global", "安装到当前用户的 .agents/skills 目录")
    .action((agent, options) => runOrExit(false, () => {
      const result = installAgent(process.cwd(), agent, options);
      console.log(`${result.same ? "Arch Lens Codex Skill 已是当前源" : result.existed ? "已更新" : "已安装"}：${result.target}`);
    }));

  enableExitOverride(program);
  try { await program.parseAsync(argv); }
  catch (error) {
    if (error?.code !== "commander.helpDisplayed" && error?.code !== "commander.version") {
      const message = commanderError || error.message || String(error);
      if (argv.includes("--json")) printJson({ schemaVersion: SCHEMA_VERSION, error: message });
      else console.error(message);
      process.exitCode = 1;
    }
  }
}

function enableExitOverride(command) {
  command.exitOverride();
  command.commands.forEach(enableExitOverride);
}

async function runOrExit(json, operation) {
  try { await operation(); }
  catch (error) {
    if (json) printJson({ schemaVersion: SCHEMA_VERSION, error: error.message, diagnostics: error.diagnostics ?? [] });
    else {
      console.error(`错误：${error.message}`);
      for (const item of error.diagnostics ?? []) console.error(`${item.file ?? "change"}${item.line ? `:${item.line}` : ""} [${item.code}] ${item.message}`);
    }
    process.exitCode = 1;
  }
}

function formatStatus(result) {
  if (result.changes) return result.changes.length === 0 ? "没有活动 Change Pack。" : result.changes.map((item) => `${item.id}\tdesign=${item.designApproval}\tcompletion=${item.completionApproval}\ttasks=${item.tasks.completed}/${item.tasks.total}`).join("\n");
  return [
    `Change Pack: ${result.id}`,
    `Design approval: ${result.designApproval.state}`,
    `Completion approval: ${result.completionApproval.state}`,
    `Tasks: ${result.tasks.completed}/${result.tasks.total}`,
    `Open questions: ${result.openQuestions.open}/${result.openQuestions.total}`,
    `Archive eligible: ${result.archiveEligible}`
  ].join("\n");
}
