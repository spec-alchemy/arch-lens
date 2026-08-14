# Arch Lens draft

Arch Lens 是面向人类与 AI 协作的 Skill-first PlantUML 业务建模与变更审查工作区。它帮助团队厘清参与者目标、系统用例、领域实体与规则、业务流程、职责协作、生命周期、组件边界和接口，并让设计批准、实现证据和完成验收可追溯。

产品仍处于未发布草案阶段，版本为 `0.0.0-draft`。这是首次编号的工作流协议，因此当前为 `workflowProtocol: 1`；不兼容也不迁移此前未编号的 XMI、自研 Viewer 或 change 状态实验。

## 产品边界

- **Skill 是主体**：AI 负责理解、需求澄清、视图选择、PlantUML、方案取舍、语义审查和实现一致性检查。
- **CLI 是确定性工具**：只处理文件、Git、Schema、摘要、PlantUML、审批记录和原子归档。
- **PlantUML 是唯一业务模型**：Markdown 不复制实体关系、流程、状态或组件结构。
- **人类作出决定**：设计批准和完成验收都需要当前会话中的明确人工授权。

CLI 校验成功只表示可计算事实成立，不表示设计正确。

## 工作区

```text
.arch-lens/
├── principles.md                    # 项目目的、边界和质量门禁
├── diagrams/**/*.puml               # 已批准业务模型，提交 Git
├── rendered/**/*.svg                # 可选的已批准模型镜像，Git 忽略
├── changes/
│   ├── <change-id>/                 # 活动 Change Pack
│   │   ├── change.yaml
│   │   ├── proposal.md
│   │   ├── decisions.md
│   │   ├── tasks.md
│   │   ├── approval.yaml
│   │   ├── verification.md
│   │   ├── diagrams/**/*.puml       # 未批准 add/modify 候选 overlay
│   │   └── rendered/**/*.svg        # 可选候选镜像，Git 忽略
│   └── archive/                     # 完成后的上下文和证据
```

PlantUML 是唯一模型语言。顶层 diagrams 是已批准真相；Change Pack diagrams 是待批准 overlay，批准后由 CLI 提升并删除，归档不保留 `.puml` 副本。proposal 只说明 WHAT/WHY、范围和 AC；decisions 只说明取舍；tasks 只列执行步骤；verification 保存 AI 语义审查和证据。

## 初始化和能力协商

```sh
arch-lens capabilities --json
arch-lens init
```

`capabilities` 可以在仓库外运行，供项目 Skill 检查 CLI 是否支持 protocol 1。`init` 要求有效 Git HEAD 和 Java 21+；它在写仓库前安装并验证锁定的 PlantUML `1.2026.6` 用户缓存，然后创建缺失的 principles、diagram/change/archive 目录、同步 project-local Skill 和 AGENTS 入口，但不会覆盖现有原则、图或 Change Pack。

发现 `.arch-lens/architecture.uml`、`architecture-assets.md` 或无法识别的旧 changes 状态时，`init` 硬失败并保留全部数据；draft 不提供自动迁移或删除。

## Skill-first 工作流

人向 Agent 使用自然语言表达动作：

```text
understand project
propose change
review model
apply change
review implementation
close change
```

持久 PlantUML 变化必须进入 Change Pack：

1. AI 创建变更，收集证据并填写问题、范围、AC 和决策；写图前先提交视图清单，说明每张图的问题、独立决策价值和已有图复用判断。
2. 持久建模默认一张主视图、通常最多三张；第四张及以后必须逐张说明不可合并理由，并在生成前获得人类明确同意。图种列表不是完整性清单，也不按 AC 或相近场景逐图生成。
3. AI 把最少必要的 add/modify 候选写入 Change Pack diagrams；delete 只写 manifest，并优先更新已有图、合并相同责任结构的场景。
4. CLI 校验结构和语法，并把 PlantUML 文本 diff 输出到终端。人可直接用 IDE 预览；只有需要独立文件时才生成 SVG。
5. AI 做规模、跨图与方案语义审查，人查看材料并决定是否批准。
6. 人明确批准后，CLI 记录 design approval，`apply-model` 原子提升候选；模型、原则、Change Pack 和批准记录形成独立 model-only commit。
7. AI 实施代码、提交实现、运行测试，并对照批准模型逐项验证 AC。
8. 人明确验收后，CLI 记录 completion approval 并归档 Change Pack。

修改 tasks 不会让设计批准失效；修改 principles、change.yaml、proposal、decisions 或声明的 `.puml` 会立即令批准变为 stale。

## CLI

```sh
arch-lens capabilities [--json]
arch-lens init [--json]
arch-lens diagrams list [--json]
arch-lens diagrams check [files...] [--json]
arch-lens diagrams render [files...] [--output <dir>] [--json]

arch-lens change new <id> [--json]
arch-lens change status [id] [--json]
arch-lens change validate <id> [--json]
arch-lens change diff <id> [--json]
arch-lens change render <id> [--json]
arch-lens change apply-model <id> [--json]
arch-lens change record-approval <id> --stage design|completion --reviewer <name> [--json]
arch-lens change evidence <id> [--json]
arch-lens change archive <id> [--json]

arch-lens install-agent codex --scope project|global
```

没有 `change review`、`approve`、`verify` 或旧 `bundle`：这些词要么包含语义判断，要么混合了不必要的持久产物。CLI 只提供 `diff`、按需 `render`、确定性 `apply-model`、`record-approval` 和 `evidence`。

JSON 输出统一包含 `schemaVersion: 1`。`capabilities` 另含 `cliVersion`、`workflowProtocol` 和稳定 feature 列表。

## PlantUML

Arch Lens 只使用本地 PlantUML，不上传私有模型。每张 `.puml` 必须自包含并声明 `arch-lens: type`、`arch-lens: question` 和 title；title 只描述问题或主题，不编码 Candidate、Draft、Approved 等工作流阶段。禁止 `.iuml`、include、URL、file URI、外部图片和符号链接。

```sh
# init 管理 PlantUML JAR；Java 21+ 是唯一显式运行时前置条件
arch-lens init

# 高级覆盖：指定本地可执行文件/JAR
ARCH_LENS_PLANTUML=/path/to/plantuml arch-lens diagrams check
ARCH_LENS_PLANTUML=/path/to/plantuml.jar arch-lens diagrams render
```

运行时解析顺序是显式 `ARCH_LENS_PLANTUML`、摘要有效的受管 JAR、PATH PlantUML。CLI 强制 PlantUML `1.2026.6` 或更高、`SANDBOX`、stdin、自包含批处理和 headless 模式。顶层与 Change Pack 的完整 render 都会原子替换同路径 SVG 镜像并清理陈旧文件；不 render 就不会创建目录。

详细方法见 [建模指南](.agents/skills/arch-lens/references/modeling-guide.md)、[PlantUML 合同](.agents/skills/arch-lens/references/plantuml-contract.md)和 [Change Pack 合同](.agents/skills/arch-lens/references/change-pack-contract.md)。

## 开发

```sh
npm install
npm test
node bin/arch-lens.js diagrams check
npm pack --dry-run
```

测试使用 Node 内置 `node:test` 和真实 CLI 入口，在临时 Git 仓库中覆盖成功、失败、安全边界与完整双批准闭环。CI 使用锁定 SHA-256 的 PlantUML `1.2026.6` 检查和渲染自举图集。

提交问题或代码前，请阅读 [贡献指南](CONTRIBUTING.md)。其中固定了开发验证、Change Pack、分支管理和 draft 版本演进规则。当前版本不发布 npm 包，也不承诺向后兼容。

本项目按 [EPL 2.0](LICENSE) 发布。第三方说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
