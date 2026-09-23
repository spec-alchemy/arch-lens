# Implementation Tasks

- [x] T001 [AC-001] 修改 `modeling-review.activity.puml` 候选 overlay：表达完成证据按实现内容标识绑定，并在集成后按内容标识核对集成结果。
- [x] T002 [AC-001] 运行 `arch-lens change render rebase-stable-completion-evidence` 生成候选标准 SVG，逐张打开并记录视觉审查结论。
- [x] T003 [AC-002] 在 `change-pack-contract.md` 记录 `implementation-patch-id` 标识、字段语义与 `implementation-commit` 的分工。
- [x] T004 [AC-002] 扩展 completion approval 记录与 `verification.md` 解析，保存并校验实现内容标识。
- [x] T005 [AC-003] 实现内容标识计算（`git patch-id --stable`），并补成功与失败路径测试：rebase 重放后稳定、内容变化后改变。
- [x] T006 [AC-004] 新增只读命令报告归档 Change Pack 的完成证据核对事实，并补成功与失败路径测试。
- [x] T007 [AC-004] 回归确认 active pack 门禁语义不变：`reviewedImplementationCommit` 祖先检查、实现后仅允许证据提交、`archiveEligible` 与 HEAD 一致性。
- [x] T008 [AC-001] 同步 Skill 文档、`capabilities` 能力清单与 `CHANGELOG.md`。
