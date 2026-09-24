# Change Proposal

## Problem And Evidence

当前实现同时用物理 overlay、持久化 `operation`、整包 `isPackPromoted` 和 baseline freshness 表示 Change Pack 状态。多图 Pack 在 `apply-model` 后只修订一张图时，未修订图没有 overlay，第二次 `apply-model` 因要求所有非 delete 图都有 overlay 而失败；删除图恢复、proposal-only 重批和 apply 后 diff 也表现出不同规则。根因是同一语义存在多套状态来源。

## Goals

- 用 baseline、desired、approval history 与 canonical 四类事实派生逐图状态。
- 让 `apply-model` 成为幂等 reconcile，支持单 Pack、多次设计修订和多次 apply。
- 保持 `workflowProtocol 2`、`SCHEMA_VERSION 2` 和现有命令，不新增持久状态或迁移。
- 让 baseline、design approval 和 canonical 物化互相正交。
- 将视觉证据复用收敛为整组规则，并让规范文本只有一个来源。

## Non-goals

- 不提供 delete 的本地回收站、tombstone 或自动恢复。
- 不引入 workflowProtocol 3、Git 状态、模式开关或逐图持久化 status。
- 不增加 `reopen-design`、`revise-baseline` 等新命令。
- 不改变最多三张图的视图预算或人工批准门禁。

## Acceptance Criteria

- AC-001: 多图 Pack 首次 apply 后只修订一张图时，未修订图无需 overlay，第二次 apply 只物化实际差异且可重复 no-op。
- AC-002: `add`/`modify` 都表示 desired present，`delete` 表示 desired absent；状态判断不再依赖原始 operation。
- AC-003: baseline freshness 只受 principles、未声明 canonical 和历史 approval 的事实影响；新 overlay 不导致无条件 refresh。
- AC-004: proposal/decisions 变化可直接重新批准 design；principles 或外部 canonical drift 必须先 refresh baseline。
- AC-005: capability 使用 `change-pack-v3` 替换 `change-pack-v2`，旧 schema 保持可读且无需迁移。
- AC-006: Skill reference 是 Change Pack 规则唯一规范来源，AGENTS marker 只保留薄指针，README/CONTRIBUTING 不复制门禁细节。
- AC-007: delete 经 apply 后不可由产品自动恢复，合同与帮助文本明确该边界。

## Assumptions

- 单 Pack 内允许设计修订直到 completion approval；`apply-model` 不是终态。
- 最多三张图时，整组 fresh render/PASS 的成本低于维护逐图视觉状态。
- 用户可从外部保留被删除图内容；Arch Lens 不承担未声明的撤销责任。

## Open Questions

- [x] Q001: 是否支持 apply 后继续修订？结论：支持，engineering 边界止于 completion approval。
- [x] Q002: 视觉证据按什么粒度复用？结论：整组 desired 与上一份 approval 逐图一致才复用。
- [x] Q003: 是否提升 workflowProtocol 或 schema？结论：不提升；以 `change-pack-v3` 表达行为兼容边界。
- [x] Q004: delete 是否提供回收？结论：不提供；保持本地-first 状态模型最小。
