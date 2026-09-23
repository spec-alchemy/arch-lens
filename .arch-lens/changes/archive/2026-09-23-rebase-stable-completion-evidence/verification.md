# Implementation Verification

<!-- arch-lens: semantic-review=pass -->
<!-- arch-lens: design-digest=6327ed0a677e4533864488a53a165eb32549255a2e0707f663e4ac9886397d6e -->
<!-- arch-lens: implementation-commit=e3bacf6ce5e474ee57ebd0b6c7d14d0a9638ee69 -->
<!-- arch-lens: implementation-patch-id=36bebe22bbbaa5e789a78f18f5b9166c9374d4b9 -->

## Evidence

- Model-only commit: `b2f6fbae967316f3288043f9af2ae4eedd9bed09`（`arch: bind completion evidence to implementation content identity`）。
- Implementation commit: `e3bacf6ce5e474ee57ebd0b6c7d14d0a9638ee69`（`feat: bind completion evidence to implementation content identity`），patch-id `36bebe22bbbaa5e789a78f18f5b9166c9374d4b9`；该 commit 之后只提交 tasks.md 与 verification.md 证据。
- `npm test`：PASS；45 tests，45 pass，0 fail。新增用例覆盖内容标识的 rebase 稳定性与内容敏感性，以及 `archive-evidence` 的成功与失败路径。
- `npm run release:check`：PASS；45 tests、capabilities、`diagrams check` 与 `npm pack --dry-run` 全部通过。
- `node bin/arch-lens.js change validate rebase-stable-completion-evidence --json`：PASS；`valid=true`、baseline current、diagnostics 0。
- 实证（本仓库真实数据）：三对 pre-rebase / post-rebase 提交的 patch-id 完全一致 —— `bb1e1925`→`5e4df22` 均为 `34868283…`，`ff7fc25c`→`51f9f2d` 均为 `77a5a0a3…`，`8faaa828`→`86c1de0` 均为 `ad7154d7…`。
- 实证（归档包）：`change archive-evidence tighten-note-budgets --json` 对旧归档记录报告 `implementationPatchId=null`、`matched=false`，未因缺少新字段而报错。
- `git diff --check`：PASS。

## Acceptance Results

- AC-001: PASS - `modeling-review.activity.puml` 增加「按实现内容标识核对集成结果与已审查实现」，guard 改为「内容标识不匹配，或已批准设计被推翻？」，完成节点改为「记录完成批准，绑定提交身份与实现内容标识」。候选 SVG 逐张视觉审查 PASS（1564x2477，note 数 0）。
- AC-002: PASS - completion approval 记录新增 `implementationPatchId`，`verification.md` 新增 `implementation-patch-id`；`record-approval --stage completion` 在标记缺失时以 `IMPLEMENTATION_PATCH_ID_REQUIRED` 拒绝，在标记与被审查实现提交不一致时拒绝；两者一致时写入记录。
- AC-003: PASS - 独立用例 `implementation content identity survives rebase and is sensitive to content changes` 验证 rebase 重放后 patch-id 不变、内容变化后 patch-id 改变；闭环用例在真实 rebase 后验证 `reviewedImplementationCommitReachable=false` 而 `contentIdentity.matched=true`。
- AC-004: PASS - 新增只读 `change archive-evidence <id> [--ref <ref>]`，报告提交身份可达性、内容标识与匹配提交；未知归档 id 与不可解析引用均返回错误。既有闭环用例继续验证 `reviewedImplementationCommit` 祖先检查、实现后仅允许证据提交、`archiveEligible` 与 HEAD 一致性全部不变。

## Semantic Review

PASS。对照批准模型、实现 diff 与 AC：完成证据现在同时绑定提交身份与实现内容标识，集成后按内容标识核对，与 `modeling-review.activity.puml` 的集成分支和完成节点一致。CLI 仍然只报告事实：`archive-evidence` 不做语义结论、不自动改写归档记录；内容标识由 `git patch-id --stable` 计算，没有引入新的判断逻辑或人工关卡。active pack 期间的门禁语义未改变，重写只发生在集成之后，符合 D002。跨图术语未变化；`check-and-render.sequence.puml` 只描述设计绑定，不受影响。

## Residual Risks

- `patch-id` 对冲突解决导致的 diff 变化敏感，这是期望的检测结果；但若集成者改写了 diff 又同步更新了 `verification.md`，内容标识核对无法发现，本能力不声称防伪。
- `archive-evidence` 需要扫描搜索范围内的提交历史；仓库提交量很大时耗时和内存会上升（当前实现为单次 `git log -p | git patch-id` 批处理）。
- 既有归档包没有内容标识，只能报告 `matched=false`；若要补录，必须回到当时的实现提交，本变更不回填历史。
- `patch-id` 是 sha1 长度的 Git 原语，与项目其他 sha256 摘要不同源；Schema 允许 40-64 位十六进制以兼容 sha256 仓库。
