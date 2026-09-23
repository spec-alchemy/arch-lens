# Change Proposal

## Problem And Evidence

当前 `note-budget-v1` 对 5 张已批准图执行确定性检查后，3 张图产生 warning：

- `check-and-render.sequence.puml`：1 条 note、6 个 note 行、8.33% 行占比、单条 4 行 / 93 字符，触发 `NOTE_TOO_LONG`。
- `product-goals.use-case.puml`：3 条 note、15 个 note 行、26.32% 行占比、单条 4 行 / 60 字符，触发 `NOTE_TOO_LONG` 与 `NOTE_LINE_SHARE_HIGH`。
- `runtime-responsibilities.component.puml`：3 条 note、12 个 note 行、23.08% 行占比，触发 `NOTE_LINE_SHARE_HIGH`。

这些 note 主要复述建模指南、PlantUML 合同和 Change Pack 合同中已有的规则。图面因此承担了第二份文档的角色，而不是只保留读图必需的语义。`initialize-managed-runtime.sequence.puml` 和 `modeling-review.activity.puml` 已满足预算，不在本次修改范围。

## Goals

- 将 3 张告警图的 note 压缩为读图必需的单行约束，使当前图集不再产生 `NOTE_*` warning。
- 把被移出的规则细节保留在 Change Pack `decisions.md` 或既有合同文档中，避免信息丢失。
- 不新增视图，不改变图的业务边界、职责、流程、状态或关系。

## Non-goals

- 不调整 `note-budget-v1` 的阈值或 CLI 实现；工具改动属于独立工作。
- 不修改 Actor、用例、组件、参与者、消息、关系或状态语义。
- 不新增、删除或拆分持久图。
- 不在本 Change Pack 中实施其他架构敏感代码。

## Acceptance Criteria

- AC-001: 三个候选图渲染并提升后，`diagrams check --json` 对三张图不再返回任何 `NOTE_*` warning。
- AC-002: 候选 diff 只改变 note 文本；`arch-lens: type`、`arch-lens: question`、title、参与者/组件/用例、消息、关系和 `@startuml/@enduml` 结构保持不变。
- AC-003: 每张修改图最多 3 条 note，每条最多 3 行内容且最多 120 字符，`noteLineShare <= 10%`；被移出的细节可在 `decisions.md` 或既有合同文档中追溯。

## Assumptions

- 当前 5 张图仍是覆盖 Arch Lens 关键边界的最小视图集，不需要新增图承载被移出的说明。
- note warning 是风险信号；本次目标是提升图面可读性并保持单一事实来源，而不是单纯消除输出。
- 当前顶层 `.puml`/SVG 是本次修改的批准基线。

## Open Questions

- [x] Q001: 通过压缩 note 还是提高阈值消除告警？结论：压缩 note；预算阈值保持，避免把图面膨胀重新合法化。
- [x] Q002: 是否为移出的细节新增图？结论：不新增；已有合同文档和本 Change Pack 决策足以追溯。
