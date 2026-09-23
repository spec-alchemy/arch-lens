# Design Decisions

## D001: 完成证据绑定实现内容标识，而不是绑定提交身份

### Context

完成证据需要回答「人类验收的实现，是不是集成进目标分支的那个实现」。当前记录只保存提交哈希：它精确表达了写入时的对象身份，但 rebase merge 会重写身份，使归档记录在集成后失去锚点。选择内容标识时还必须排除 tree digest —— 提交的 tree 是整棵仓库快照，rebase 到新基线后 tree 随之变化，因此 tree digest 同样不能免疫 rebase。

### Decision

在提交身份之外，为被审查的实现提交记录一个内容标识：`git patch-id --stable`。它由提交相对父提交的 diff 计算，在非冲突 rebase 重放后保持不变，在 diff 变化时改变。完成批准记录与 `verification.md` 同时保存提交身份与内容标识；身份保留写入时事实，内容标识承担跨历史重写的核对职责。集成后按内容标识核对集成结果，不一致时使批准 stale 并返回重新形成候选设计。

### Alternatives

- tree digest：被排除。tree 是整棵快照，rebase 会改变它，无法免疫历史重写。
- 按变更文件内容计算的 sha256 清单：可行，但需要自行定义「变更文件」的边界与排序，并在父提交变化时重新推导；`git patch-id --stable` 已由 Git 定义了同一语义。
- 只保留提交身份并仅补文档：已在 `5954bb9` 完成，能说明限制但无法恢复可核对性。
- 在集成时记录前后哈希映射表：依赖集成者手工维护，且映射本身仍绑定易失的哈希。
- 归档时重写历史引用为新哈希：抹掉「发生过历史重写」这一事实，破坏批准记录的溯源价值。

### Consequences

归档证据在 rebase 后仍可核对，且保留原始提交身份作为历史事实。代价是完成证据多一个字段，且需要测试覆盖 rebase 稳定性与内容敏感性。内容标识是核对事实，不是防伪手段；集成者若刻意伪造仍可绕过，本决策不声称提供安全保证。

## D002: 只读核对能力放在归档证据上，不改变 active pack 门禁

### Context

active pack 期间不存在历史重写：变更在独立 branch/worktree 上推进，完成批准绑定当时的 HEAD。重写只发生在集成时，此时包已归档。因此收紧 active pack 门禁既无必要，也会破坏既有契约。

### Decision

保持 active pack 的现有门禁语义不变：`reviewedImplementationCommit` 必须是当前 HEAD 的祖先、实现提交之后只允许 `tasks.md` 与 `verification.md` 证据、`archiveEligible` 仍要求 HEAD 与完成批准绑定一致。新增能力只做只读事实报告：让归档 Change Pack 的完成证据可以被核对，报告内容标识是否与指定引用上的提交匹配，不做语义判断、不自动改写记录。

### Alternatives

- 让 active pack 直接改绑内容标识、放弃提交身份：会丢失写入时的事实，且对 active pack 没有收益。
- 让 CLI 在归档时自动把记录改写成集成后的哈希：需要 CLI 在归档时知道未来集成结果，职责错位。
- 让归档包重新参与完整门禁：归档包按定义已关闭，重新施加门禁会让历史记录随目标分支演进而反复失效。

### Consequences

归档证据可核对，active pack 契约零变化，现有测试不受影响。代价是核对能力是独立入口，读者需要知道它存在；文档需要说明身份字段与内容字段各自回答什么问题。

## Visual Review

- .arch-lens/diagrams/modeling-review.activity.puml: PASS - Candidate SVG 1619x2477, aspect=0.654; notes=0, note-lines=0, share=0%, max-note=none. Opened current candidate SVG at full page and 2x zoom on the integration/completion region: no clipping or overlap, no new crossings, all four swimlane boundaries respected, top-to-bottom reading order intact. The combined guard label is wide but fully enclosed by the decision diamond.
