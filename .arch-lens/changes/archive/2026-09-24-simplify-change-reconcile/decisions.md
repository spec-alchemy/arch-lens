# Design Decisions

## D001: 四类内容事实派生 Change Pack 状态

### Context

当前整包 promoted、物理 overlay、operation 和 baseline freshness 交叉判断，无法表达部分修订状态。

### Decision

以 baseline `B`、desired `D`、approval history `A` 和 canonical `C` 为四类事实。`add` 与 `modify` 都表示 desired present，`delete` 表示 desired absent；逐图 applied 与 effective operation 全部派生，不新增持久状态。

### Alternatives

增加逐图 applied/promoted 字段；限制 Change Pack 只能包含一张图；支持 apply 后修订但强制写操作类型。

### Consequences

现有 schema 和旧 Pack 保持兼容，多图部分修订可自然表达；代价是实现必须统一使用一个 desired 解析入口。

## D002: apply-model 是幂等 reconcile

### Context

第二次 apply 目前要求未变图重新提供 overlay，而 overlay 与 canonical 相同的 modify 又被拒绝，形成无官方路径的死锁。

### Decision

`apply-model` 只根据 `C -> D` 差异原子写入。已批准且未变的图直接 no-op；无差异时成功返回空 `applied`；delete 最终态为 absent。未变化图不再要求 overlay。

### Alternatives

要求重建所有 overlay；为每次 apply 生成新 revision schema；禁止 apply 后继续修订。

### Consequences

单 Pack 可多轮修订，重复 apply 安全；delete 仍是不可逆破坏性操作，恢复依赖用户自行保留内容。

## D003: baseline 与 design/apply 正交

### Context

当前新 overlay 会强制 baseline stale，proposal-only 变化又被文档错误要求 refresh，导致状态概念互相污染。

### Decision

baseline 只回答 principles、未声明 canonical 和已声明 canonical 是否属于 baseline 或历史 approval。新 overlay 不触发 refresh；proposal/decisions 变化只重批 design；principles 或未知 canonical drift 才需要显式 refresh 后重批。

### Alternatives

所有 Pack 内容变化都 refresh；自动 refresh；把 proposal 纳入 baseline。

### Consequences

用户只需在真实外部 drift 时 refresh，命令语义更单一；历史 approval manifest 成为 baseline 判断的一部分。

## D004: 整组视觉证据与单一规范来源

### Context

文档对逐图复用与实际整组复用描述不一致，且 Skill、AGENTS、principles 和 README 重复了门禁规则。

### Decision

整组 desired 与上一份 design approval 逐图一致时复用全部视觉证据；任一张变化则整组 fresh render 并要求逐图 PASS。Change Pack contract 成为唯一规范来源；SKILL/workflow 只引用，AGENTS marker 只指向 Skill，principles 只保留仓库特有约束。

### Alternatives

逐图维护视觉状态；继续在多个文档复制完整规则；移除视觉批准门禁。

### Consequences

规则更少且与实现一致；整组重新审查最多三张图，忽略少量重复成本。

## D005: change-pack-v3 与不可逆 delete

### Context

旧的 `change-pack-v2` 无法表达幂等多图 reconcile；而回收站会重新引入候选、持久状态和清理规则。

### Decision

以 `change-pack-v3` 替换 `change-pack-v2`，保持 workflowProtocol 和 schema 为 2。delete 经 apply 后明确不可逆；若用户另有内容副本，可重新提交 present overlay。

### Alternatives

继续声称 v2；新增独立 reconcile capability；保存本地 tombstone。

### Consequences

新 Skill 会拒绝不支持 reconcile 的旧 CLI，旧 Pack 无需迁移；产品不承诺自动撤销删除。

## Visual Review

- .arch-lens/diagrams/local-first-lifecycle.activity.puml: PASS - Candidate SVG 1132x1905, aspect=0.594; opened current SVG: no clipping/overlap, lane boundaries clear, no ambiguous crossings, reading order intact.
