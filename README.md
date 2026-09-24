# Arch Lens

Arch Lens 是面向人类与 AI 协作的 Skill-first PlantUML 业务建模与变更审查工作区。它帮助团队理解参与者目标、系统用例、领域实体与规则、业务流程、职责协作、生命周期、组件边界和接口，并让设计决策与实现证据保持内容可追溯。

当前版本为 `0.1.0-alpha.5`，本地内容协议为 `workflowProtocol 2`。CLI 与 Skill 不读取、不要求、不解释 Git；`.arch-lens/` 可以整体 gitignore。

## 安装

```sh
npm install -g @spec-alchemy/arch-lens@next
arch-lens capabilities --json
```

也可以不全局安装：

```sh
npx @spec-alchemy/arch-lens@next capabilities --json
```

## 快速开始

需要 Node.js 20+ 和 Java 21+。工作目录可以是普通目录：

```sh
mkdir my-project
cd my-project
arch-lens capabilities --json
arch-lens init
arch-lens diagrams check
```

`init` 创建 `.arch-lens/`、安装受管 PlantUML 运行时和项目级 Codex Skill。模型始终在本地处理。

发布通道见 [RELEASING.md](RELEASING.md)。

## 工作方式

```text
understand project
propose change
review model
apply change
review implementation
close change
```

Skill 负责业务建模、视图选择、语义审查和执行顺序。CLI 只提供本地文件、摘要、Schema、PlantUML facts、人工审批记录和归档能力。每个工作区最多一个活动 Change Pack。

PlantUML 是唯一业务模型。Change Pack 记录问题、决策、任务、批准和实现证据，不复制图中的实体、关系或流程。完整规则见 `.agents/skills/arch-lens/references/change-pack-contract.md`。

## CLI

```text
arch-lens capabilities [--json]
arch-lens init [--json]
arch-lens diagrams list|check|render [options]
arch-lens change new|status|validate|diff|render|refresh-baseline [options]
arch-lens change apply-model|record-approval|evidence|archive [options]
arch-lens install-agent codex --scope project|global
```

常用检查：

```sh
arch-lens diagrams check
arch-lens diagrams render
arch-lens change status <id> --json
arch-lens change diff <id>
```

`diagrams check` 报告离线资源策略、PlantUML 语法、note facts 和结构错误。`change diff` 展示当前 outstanding `C -> D`。SVG 是临时审查材料，可随时删除。

## 开发

```sh
npm ci
npm test
npm run release:check
```

测试使用 Node 内置 `node:test`，通过真实 `bin/arch-lens.js` 入口运行。
