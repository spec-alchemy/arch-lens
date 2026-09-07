# Arch Lens

Arch Lens 是面向人类与 AI 协作的 Skill-first PlantUML 业务建模与变更审查工作区。它帮助团队理解参与者目标、系统用例、领域实体与规则、业务流程、职责协作、生命周期、组件边界和接口，并让设计决策与实现证据保持可追溯。

当前版本为 `0.0.0-draft`。产品仍在公开早期阶段，首个预览版本会单独定义兼容承诺。

## 安装

通过 npm 的 `draft` 标签安装当前公开草案，安装后的命令名为 `arch-lens`：

```sh
npm install -g @spec-alchemy/arch-lens@draft
arch-lens capabilities --json
```

也可以不做全局安装，直接运行：

```sh
npx @spec-alchemy/arch-lens@draft capabilities --json
```

## 当前能力

- 使用可读、可编辑的 PlantUML 文件表达业务模型。
- 通过最少必要的视图厘清边界、职责、流程和生命周期。
- 由 Skill 负责理解、建模、方案取舍和语义审查。
- 由 CLI 提供文件、Git、摘要和 PlantUML 的确定性校验。
- 通过 Change Pack 记录问题、决策、任务、人工批准和实现证据。
- 每个 worktree 只推进一个活动 Change Pack；并行变更使用独立 branch/worktree。
- 通过受版本控制的标准 SVG 和逐图视觉结论审查实际渲染结果。

## 快速开始

需要 Node.js 20+、Java 21+ 和一个已有提交的 Git 仓库。使用全局安装后运行：

```sh
arch-lens capabilities --json
arch-lens init
arch-lens diagrams check
```

`init` 会在用户缓存中安装并校验受管 PlantUML 运行时，然后创建项目级建模工作区。模型始终在本地处理，不上传到远程服务。

## 协作工作流

```text
understand project
propose change
review model
apply change
review implementation
close change
```

典型变更先形成问题、范围、决策和最少必要的 PlantUML 候选。人类审查模型并批准后，CLI 提升候选并形成 model-only commit；AI 再实施代码、核对验收标准和测试证据，最后由人类验收并归档 Change Pack。

同一 Git worktree 最多存在一个活动 Change Pack。并行贡献者在独立 branch/worktree 中工作，进入目标分支时逐个集成；若 `baseCommit` 后已批准模型发生变化，先同步 Git，再运行 `arch-lens change refresh-base <id>` 并重新审查。

## 工作区

```text
.arch-lens/
├── principles.md                # 项目目的、建模边界和质量门禁
├── diagrams/**/*.puml           # 已批准业务模型
├── rendered/**/*.svg            # 已批准模型的受版本控制标准镜像
├── changes/
│   ├── <change-id>/             # 唯一活动 Change Pack、候选 overlay 与 SVG
│   └── archive/                 # 完成后的 Change Pack
```

PlantUML 是唯一可编辑的业务模型。每个标准 `.puml` 都有由锁定受管 PlantUML 生成的同路径 SVG；SVG 进入 Git 以支持 fresh clone 和历史审查，但仍是不可手工维护的派生材料。Change Pack 记录上下文和证据，不复制图中的实体、关系或流程。

## CLI

```text
arch-lens capabilities [--json]
arch-lens init [--json]
arch-lens diagrams list|check|render [options]
arch-lens change new|status|validate|diff|render|refresh-base [options]
arch-lens change apply-model|record-approval|evidence|archive [options]
arch-lens install-agent codex --scope project|global
```

Skill 负责语义判断，CLI 负责可计算事实。设计批准和完成验收都来自人类明确决定。

## PlantUML 审查

每张 `.puml` 都是自包含文件，也适合用 VS Code 或 JetBrains 的 PlantUML 插件预览。标准审查材料通过以下命令刷新：

```sh
node bin/arch-lens.js diagrams render
node bin/arch-lens.js diagrams check
```

标准 SVG 由锁定运行时原子生成并进入 Git；检查会在内存中重渲染并比较精确字节，同时报告 SHA-256、viewBox、宽高和宽高比。AI 或人类仍必须逐张打开 SVG，检查裁切/重叠、交叉线、密度、边界和阅读顺序；CLI 不会宣称图面美观或语义正确。

## 开发

```sh
npm ci
npm test
node bin/arch-lens.js diagrams check
npm pack --dry-run
```

贡献流程、分支规则和版本计划见 [CONTRIBUTING.md](CONTRIBUTING.md)。许可证和第三方依赖说明见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
