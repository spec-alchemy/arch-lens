# Change Proposal

## Problem And Evidence

Change Pack 的完成证据绑定 Git 提交标识：`verification.md` 的 `implementation-commit` 与 `approval.yaml` completion 记录的 `implementationCommit` / `reviewedImplementationCommit`。仓库强制 rebase merge，集成会重写被合并提交的哈希，使这些标识在集成后不再从目标分支可达。

证据（2026-09-23 在 `main` 上核对）：

- 归档包 `2026-09-23-tighten-note-budgets`：`verification.md` 绑定 `bb1e1925`，completion 绑定 `ff7fc25c`、`reviewedImplementationCommit=bb1e1925`；两者都不是 `main` 的祖先。
- 归档包 `2026-09-07-isolate-changes-by-worktree`：绑定 `dc25115d`、`89f1bc3b`、`fdf7016e`，同样不是 `main` 的祖先。
- 两个包的 `baseCommit`（`f87f547c`、`c6b66418`）仍可达：失效的是「被合并的提交」，不是全部引用。
- `node bin/arch-lens.js change validate <archived-id> --json` 返回「找不到活动 Change Pack」：归档包不参与任何 CLI 门禁。

因此当前状态是：归档证据既不可由门禁发现，也没有跨历史重写稳定的内容锚点，人工核对只能依赖本地偶然保留的对象。

同时修正一个先前假设：提交的 tree 是整棵仓库快照，rebase 到新基线后 tree 本身也会变化，所以 tree digest 并不能免疫 rebase。跨 rebase 稳定的是 diff 内容标识。

## Goals

- 完成证据同时绑定提交身份与实现内容标识，使归档证据在集成重写历史后仍可核对。
- 内容标识对 rebase 重放稳定，对实现内容改动敏感。
- 提供只读的 CLI 事实，让归档证据可以在集成后的分支上被核对。
- 保持 active Change Pack 期间的既有门禁语义不变。

## Non-goals

- 不回填两个既有归档包中的历史引用；它们保留为写入时的事实。
- 不改变 rebase merge 策略，也不引入 merge commit。
- 不新增人工关卡或审批阶段。
- 不把内容标识当作安全边界或签名机制。

## Acceptance Criteria

- AC-001: `modeling-review.activity.puml` 表达完成证据按实现内容标识绑定，并在集成后按内容标识核对集成结果。
- AC-002: 完成批准记录同时包含提交身份与实现内容标识，二者在 `approval.yaml` 与 `verification.md` 中一致。
- AC-003: 实现内容标识在 rebase 重放后保持不变；实现内容变化时标识变化。两条路径都有 CLI 测试。
- AC-004: 归档 Change Pack 的完成证据可由只读 CLI 命令报告核对事实；active pack 的 `reviewedImplementationCommit` 祖先检查、实现后仅允许证据提交、`archiveEligible` 与 HEAD 一致性保持不变。

## Assumptions

- 集成使用 rebase merge，非冲突重放保留每个提交相对其父提交的 diff。
- 冲突解决会改变 diff，此时内容标识变化是期望的检测结果，不是缺陷。
- 内容标识用于可核对性，不用于防止恶意伪造。

## Open Questions

- [x] Q001: 用 `git patch-id --stable` 还是按变更文件内容计算的 sha256 清单？结论见 D001：采用 `git patch-id --stable`，它正是 Git 为「跨 rebase 识别同一变更」提供的原语。
