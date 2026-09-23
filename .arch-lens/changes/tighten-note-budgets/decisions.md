# Design Decisions

## D001: 将 note 作为读图接口，而不是第二份文档

### Context

当前 3 张图把合同、审批边界和实现细节写入 note，导致单条 note 过长或图面行数占比过高。`note-budget-v1` 已经把这些事实暴露为 warning，但工具不应替人类判断删除哪些 note。

### Decision

note 只保留读图必需的业务约束、异常条件和责任边界。领域不变量、实现细节和可引用规则回到 `decisions.md`、`references/` 或代码文档；需要跨材料引用时，note 末行只放 `D0xx` / `AC-0xx` 等稳定锚点。三张图统一改为单行 inline note，保留原有术语，不改变图的结构。

### Alternatives

- 保留现有 note，只把 warning 当噪声：会让图面持续膨胀，并削弱机器检查的价值。
- 提高 note 阈值或关闭 warning：会隐藏问题，不能解决重复事实来源。
- 删除全部 note：会丢失读图时的关键约束，尤其是审批边界和唯一模型原则。
- 为被移出的说明新增图：增加视图预算，违背最少必要视图原则。

### Consequences

图面更易扫描，note warning 归零，规则仍可在决策和合同文档中追溯。代价是读者需要跳转到 `decisions.md` 或合同文档才能看到实现细节；后续若某条约束直接影响读图判断，可以再以单行 note 恢复到图面。

## D002: 三个告警图的收敛方式

### Context

三张图的告警原因不同：一张是单条过长，一张同时有单条过长和高行占比，一张只有高行占比。需要按读图必要性分别收敛，而不是机械截断文本。

### Decision

- `check-and-render.sequence.puml`：把 4 行 block note 压缩为单行 note，只保留“PlantUML 是唯一源、SVG 是受版本控制派生视图”；标准输出门禁细节回到合同文档。
- `product-goals.use-case.puml`：把 3 个 block note 改为 3 条单行 note，只保留视图预算、人工批准边界和 Change Pack 不复制模型这三条读图必需语义。
- `runtime-responsibilities.component.puml`：把 3 个 block note 改为 3 条单行 note，只保留视觉审查门禁、CLI 事实边界和源/派生视图一致性。
- `initialize-managed-runtime.sequence.puml` 与 `modeling-review.activity.puml` 保持字节不变：前者已在预算内，后者没有 note。

### Alternatives

- 只压缩超长 note、保留高占比图：仍会让 note 占据超过 10% 的图面行数。
- 只减少 note 数量、保留多行文本：可能通过条数检查，但仍会让单条 note 承担文档职责。
- 重排或增加图元素来稀释行占比：会为了指标改变模型，违反“模型服务于决策”的目标。

### Consequences

三张图的 note 预算和行占比均进入绿色区间，模型语义和跨图术语不变。被移出的细节集中在合同、指南和本决策中，后续审查可从 note 的稳定主题继续追溯。

## Visual Review

- .arch-lens/diagrams/check-and-render.sequence.puml: PASS - Candidate SVG 1685x1417, aspect=1.189; notes=1, note-lines=1, share=1.49%, max-note=1 line/30 chars. Opened current SVG: no clipping/overlap, no new crossings, reading order intact.
- .arch-lens/diagrams/product-goals.use-case.puml: PASS - Candidate SVG 1149x499, aspect=2.303; notes=3, note-lines=3, share=6.98%, max-note=1 line/28 chars. Opened current SVG: no clipping/overlap, no new crossings, reading order intact.
- .arch-lens/diagrams/runtime-responsibilities.component.puml: PASS - Candidate SVG 1232x849, aspect=1.451; notes=3, note-lines=3, share=7.32%, max-note=1 line/35 chars. Opened current SVG: no clipping/overlap, no new crossings, reading order intact.
