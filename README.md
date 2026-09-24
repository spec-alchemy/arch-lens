# Arch Lens

Arch Lens 是面向人类与 AI 协作的 Skill-first PlantUML 业务建模与变更审查工作区。它帮助团队理解参与者目标、系统用例、领域实体与规则、业务流程、职责协作、生命周期、组件边界和接口，并让设计决策与实现证据保持内容可追溯。

当前版本为 `0.1.0-alpha.5`，本地内容协议为 `workflowProtocol 2`。协议 2 允许显式不兼容旧的 commit/SVG 审计模型。

## 安装

通过 npm 的 `next` 标签安装当前公开预览版，安装后的命令名为 `arch-lens`：

```sh
npm install -g @spec-alchemy/arch-lens@next
arch-lens capabilities --json
```

也可以不做全局安装，直接运行：

```sh
npx @spec-alchemy/arch-lens@next capabilities --json
```

## 当前能力

- 使用可读、可编辑的 PlantUML 文件表达业务模型。
- 通过最少必要的视图厘清边界、职责、流程和生命周期。
- 由 Skill 负责理解、建模、方案取舍和语义审查。
- 由 CLI 提供本地文件、内容摘要、Schema、PlantUML 检查/渲染和归档的确定性辅助。
- 通过 Change Pack 记录问题、决策、任务、人工批准和实现证据。
- 每个工作区只推进一个活动 Change Pack；并行变更使用独立工作区。
- 设计批准前生成 fresh 候选 SVG 并要求逐图视觉 `PASS`；SVG 只是可清理的审查材料。
- 对 PlantUML note 报告条数、行数、行数占比和单条规模 warning，避免图面成为第二份需求或代码文档。
- CLI 与 Skill 不读取、不要求、不解释 Git；`.arch-lens/` 可以整体 gitignore。

## 快速开始

需要 Node.js 20+ 和 Java 21+。工作目录可以是普通目录，无需 Git 仓库或已有提交：

```sh
mkdir my-project
cd my-project
arch-lens capabilities --json
arch-lens init
arch-lens diagrams check
```

`init` 会在当前目录创建 `.arch-lens/`，在用户缓存中安装并校验受管 PlantUML 运行时，并安装项目级 Codex Skill。模型始终在本地处理，不上传到远程服务。

发布通道：alpha 使用 npm `next`，beta 与 rc 使用 `beta`，GA 使用 `latest`；完整规则见 [RELEASING.md](RELEASING.md)。

## 协作工作流

```text
understand project
propose change
review model
apply change
review implementation
close change
```

典型变更先形成问题、范围、决策和最少必要的 PlantUML 候选。设计批准要求 fresh 候选 SVG 和逐图 `PASS`；人类批准后，CLI 提升 `.puml` 并清理临时 SVG。AI 再实施代码、对照模型检查语义并核对验收标准和测试证据，最后由人类完成验收并归档 Change Pack。

同一工作区最多存在一个活动 Change Pack。canonical `principles.md` 或 `.puml` 内容变化后，`baselineDigest` 变为 stale；确认内容后运行：

```sh
arch-lens change refresh-baseline <id>
```

刷新只更新本地内容基线并使旧设计批准 stale，必须重新进行语义审查和人工批准。`apply-model` 后也可以使用它，例如实现期间修正 `principles.md`；如果图与上一份设计批准逐字节一致，可复用已有 `PASS` 视觉证据，不要求重复 render。若图内容发生变化，仍必须 render、重新审查并再次 `apply-model`。

## 工作区

```text
.arch-lens/
├── principles.md                # 项目目的、建模边界和质量门禁
├── diagrams/**/*.puml           # 唯一业务模型与已批准内容
├── rendered/**/*.svg            # 可选预览缓存，不参与门禁或摘要
└── changes/
    ├── <change-id>/             # 唯一活动 Change Pack、候选 overlay 与临时 SVG
    └── archive/                 # 完成后的 Change Pack
```

PlantUML 是唯一可编辑的业务模型。Change Pack 记录上下文和证据，不复制图中的实体、关系或流程。SVG 可以在本地生成、打开和删除，但不进入 `designDigest`、归档状态或 Git 审计契约。

## CLI

```text
arch-lens capabilities [--json]
arch-lens init [--json]
arch-lens diagrams list|check|render [options]
arch-lens change new|status|validate|diff|render|refresh-baseline [options]
arch-lens change apply-model|record-approval|evidence|archive [options]
arch-lens install-agent codex --scope project|global
```

Skill 负责语义判断，CLI 负责可计算事实。设计批准和完成验收都来自人类明确决定。已删除的 `change archive-evidence`、baseCommit、implementation commit 和 patch-id 不属于协议 2 接口。

## PlantUML 审查

每个 `.puml` 都自包含，也适合用 VS Code 或 JetBrains 的 PlantUML 插件预览。常用命令：

```sh
arch-lens diagrams check
arch-lens diagrams render              # 可选预览缓存
arch-lens change render <id>           # 候选视觉审查材料
```

`diagrams check` 检查离线资源策略、PlantUML 语法、note facts 和结构，不要求 canonical SVG 缓存。`change render` 在 Change Pack 的临时 `rendered/` 中生成候选 SVG；设计批准前必须逐张打开并检查裁切、重叠、交叉线、密度、边界和阅读顺序。

CLI 报告 SHA-256、viewBox、宽高、宽高比和稳定风险 facts，但不声称图面美观或语义正确。极端的宽高比以及 note 预算超限是 warning，需要人工判断。

## 离线与边界

Arch Lens 禁止 PlantUML include、URL、外部图片和符号链接，并以 SANDBOX、headless 和 stdin 方式调用本地 PlantUML。它不会把模型上传到远程渲染服务。

仓库若需要提交顺序、patch-id、rebase merge、Release 或长期审计，由仓库专用 CI/脚本处理；这些事实不属于 Arch Lens CLI/Skill 产品协议。

## 开发

```sh
npm ci
npm test
npm run release:check
```

测试使用 Node 内置 `node:test`，在临时目录中通过真实 `bin/arch-lens.js` 入口运行，并覆盖非 Git 工作区和整体 gitignore `.arch-lens/` 的行为。
