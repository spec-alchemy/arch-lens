# Design Decisions

## D001: 单一 local-first 模式

### Context

alpha.3 和 `persistence-policy` 方案都把 Git 审计、SVG 持久化和本地使用变成模式选择。用户明确指出，可选项本身仍会占用产品心智、代码分支、测试和文档，因此不是减法。

### Decision

Arch Lens 只保留一套 local-first 工作流。删除 `persistence`、`renderedSvg`、`config.yaml` 模式开关和组合校验；所有命令使用相同语义与门禁。

### Alternatives

- 保留 tracked/local 与 renderedSvg 组合。
- 增加 strict/audit profile。
- 通过 `.gitignore` 自动推断模式。

### Consequences

产品面显著收窄，用户无需先选择策略。Arch Lens 不再承诺 Git 级审计；需要审计的团队在自身仓库工具中实现。

## D002: 核心不依赖 Git

### Context

Git 根目录、HEAD、clean worktree、baseCommit、提交边界和 patch-id 把 Arch Lens 从本地建模工具变成 Git 平台集成。用户目标要求 `.arch-lens/` 整体可忽略且不影响使用。

### Decision

CLI 与 Skill 不读取、不要求、不解释 Git。工作区根由 `.arch-lens/` 向上发现；`init` 直接在当前目录创建协议资产。删除 baseCommit、model-only commit、implementation commit、reviewedImplementationCommit、implementation-patch-id 和 archive-evidence。仓库自身的提交顺序、CI 或 rebase 审计留在仓库专用脚本中。

### Alternatives

- Git adapter 加本地 fallback。
- 仅删除 SVG 的 Git 绑定。
- 使用 Git notes 或独立 ref 隐藏审计。

### Consequences

Arch Lens 可在非 Git 目录使用，`.arch-lens/` 的 Git 跟踪状态不影响命令。跨 clone 审计不再由产品保证。

## D003: 内容摘要取代提交身份

### Context

没有 Git 历史后，模型基线、设计批准和完成验收仍需可检测的内容身份。

### Decision

使用 `baselineDigest`、`designDigest` 和 `completionDigest`：

- `baselineDigest` 绑定 `principles.md` 与排序后的 canonical `.puml`。
- `designDigest` 绑定 baseline、change.yaml、proposal、decisions 和候选/已提升 `.puml`，不绑定 SVG。
- `completionDigest` 绑定 designDigest、tasks.md 和 verification.md。

`change refresh-baseline` 显式刷新本地基线并使旧批准 stale。

### Alternatives

- 继续使用 baseCommit 和 patch-id。
- 让 CLI 维护一份实现内容摘要。
- 只依赖文件 mtime。

### Consequences

模型批准与完成验收可在任意目录核对，且不依赖 Git 历史。代码实现本身的完整审计需要仓库专用 CI 或人工流程。

## D004: SVG 是临时审查材料

### Context

SVG 是 PlantUML 的派生产物，用于人类检查布局、裁切、密度和阅读顺序；把它作为持久状态会重新引入 Git 绑定和模式分支。

### Decision

候选 SVG 只在设计审查期间生成并检查 freshness。设计批准要求每张 add/modify 图有 fresh SVG 和 PASS 视觉记录，但 SVG 不进入 designDigest、不进入归档状态，也不作为 Git 审计对象。`apply-model` 后清理候选 SVG；canonical 预览输出只进入可清理缓存或用户指定目录。

### Alternatives

- 顶层和候选 SVG 受版本控制。
- 把 SVG 哈希写入批准。
- 取消 SVG 审查。

### Consequences

PlantUML 仍是唯一业务模型，视觉审查仍严格。不同机器的渲染字节差异不会影响批准内容身份。

## D005: 完成验收基于内容与人工语义结论

### Context

没有 Git 后，不能用提交身份代替实现审查。需要保留的是“人是否基于检查过的内容明确验收”，而不是提交机器事实。

### Decision

完成批准要求 designDigest current、tasks 全部完成、AC 全部 PASS、semantic review 为 pass，并由人类明确验收。`verification.md` 记录实现后的模型一致性判断和证据；completionDigest 绑定其内容。CLI 不声称理解代码，也不根据测试通过自动批准。

### Alternatives

- 要求用户手工提供 commit 或 patch-id。
- 仅依赖测试退出码。
- 由 AI 自动记录完成批准。

### Consequences

人类语义结论重新成为完成门禁的核心。测试和代码审查仍是 Skill workflow 的必需证据，但其 Git 身份不属于 Arch Lens 核心。

## D006: 不兼容旧协议并压缩模型集

### Context

旧 Change Pack 以 baseCommit、SVG 批准和提交边界为核心。若保留兼容分支，会重新引入本次要删除的复杂度。当前模型集还包含多张 Git/运行时中心图。

### Decision

使用 `workflowProtocol 2` 和新的内容摘要 schema；旧 protocol 1 Change Pack 不自动迁移、不继续解释。持久模型收敛为三张：保留 `product-goals.use-case.puml`，新增 `local-first-lifecycle.activity.puml` 与 `local-first-responsibilities.component.puml`，删除 `check-and-render.sequence.puml`、`initialize-managed-runtime.sequence.puml`、`modeling-review.activity.puml` 和 `runtime-responsibilities.component.puml`。

### Alternatives

- 保留双读兼容。
- 保留旧图并叠加新图。
- 只改代码，不重构模型。

### Consequences

迁移成本显式存在：旧未归档 Change Pack 需要废弃或重建。换来的是一套更小、更一致、没有 Git/模式层的核心模型。

## Visual Review

- .arch-lens/diagrams/local-first-lifecycle.activity.puml: PASS - 已打开 1450x1511 当前候选 SVG；内容基线、临时 SVG freshness、视觉审查、人类设计批准、apply-model、实现语义审查、完成验收和本地归档的顺序清楚，无标签裁切、重叠或异常交叉线；noteCount=0。
- .arch-lens/diagrams/local-first-responsibilities.component.puml: PASS - 已打开 1338x648 当前候选 SVG；Skill、CLI、Workspace、Managed PlantUML 与人类的职责方向清楚，Git 与仓库 CI 位于产品边界外并明确不进入 CLI/Skill；无标签裁切、重叠或异常交叉线；noteCount=1、noteLineCount=1、noteLineShare=2.63%、maxNoteContentLines=1、maxNoteCharacters=31。
