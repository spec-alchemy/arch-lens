# Arch Lens

Arch Lens 是面向人类与 AI 协作的 Skill-first PlantUML 业务建模与变更审查工作区。它帮助团队理解参与者目标、系统用例、领域实体与规则、业务流程、职责协作、生命周期、组件边界和接口，并让设计决策与实现证据保持可追溯。

当前版本为 `0.0.0-draft`。产品仍在公开早期阶段，首个预览版本会单独定义兼容承诺。

## 当前能力

- 使用可读、可编辑的 PlantUML 文件表达业务模型。
- 通过最少必要的视图厘清边界、职责、流程和生命周期。
- 由 Skill 负责理解、建模、方案取舍和语义审查。
- 由 CLI 提供文件、Git、摘要和 PlantUML 的确定性校验。
- 通过 Change Pack 记录问题、决策、任务、人工批准和实现证据。
- 通过本地 PlantUML 和 IDE 预览图形化审查模型。

## 快速开始

需要 Node.js 20+、Java 21+ 和一个已有提交的 Git 仓库：

```sh
npm ci
node bin/arch-lens.js capabilities --json
node bin/arch-lens.js init
node bin/arch-lens.js diagrams check
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

## 工作区

```text
.arch-lens/
├── principles.md                # 项目目的、建模边界和质量门禁
├── diagrams/**/*.puml           # 已批准业务模型
├── changes/
│   ├── <change-id>/             # 活动 Change Pack 与候选 overlay
│   └── archive/                 # 完成后的 Change Pack
└── rendered/                    # 按需生成的 Git 忽略 SVG
```

PlantUML 是唯一可编辑的业务模型。Change Pack 记录上下文和证据，不复制图中的实体、关系或流程；SVG 是可再生成的审查材料。

## CLI

```text
arch-lens capabilities [--json]
arch-lens init [--json]
arch-lens diagrams list|check|render [options]
arch-lens change new|status|validate|diff|render [options]
arch-lens change apply-model|record-approval|evidence|archive [options]
arch-lens install-agent codex --scope project|global
```

Skill 负责语义判断，CLI 负责可计算事实。设计批准和完成验收都来自人类明确决定。

## PlantUML 预览

每张 `.puml` 都是自包含文件，适合直接使用 VS Code 或 JetBrains 的 PlantUML 插件预览。需要独立审查材料时运行：

```sh
node bin/arch-lens.js diagrams render --output .arch-lens/rendered
```

生成的 SVG 位于 Git 忽略目录，不构成第二份模型真相。

## 开发

```sh
npm ci
npm test
node bin/arch-lens.js diagrams check
npm pack --dry-run
```

贡献流程、分支规则和版本计划见 [CONTRIBUTING.md](CONTRIBUTING.md)。许可证和第三方依赖说明见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
