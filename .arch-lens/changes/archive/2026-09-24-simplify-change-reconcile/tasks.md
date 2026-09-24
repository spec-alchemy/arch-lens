# Implementation Tasks

- [x] T001 [AC-001, AC-002] 统一逐图 desired、effective operation 与 applied 状态解析，并让 apply-model 改为幂等 reconcile。
- [x] T002 [AC-003, AC-004] 重写 baseline freshness、refresh-baseline 和 apply 后修订语义，移除整包 promoted 对状态判断的控制。
- [x] T003 [AC-005] 将 capability 从 change-pack-v2 替换为 change-pack-v3，并保持 workflowProtocol/schema 与 CLI 命令兼容。
- [x] T004 [AC-006] 收敛 contract、SKILL、workflow、AGENTS marker、principles、README/CONTRIBUTING 的规范来源。
- [x] T005 [AC-001, AC-002, AC-003, AC-004] 增加多图部分修订、连续修订、no-op、drift、proposal-only 和 delete 边界测试。
- [x] T006 [AC-005, AC-006, AC-007] 更新公开基线、capability、marker 和文档测试，并执行完整 release check。
