# Implementation Tasks

- [ ] T001 [AC-001, AC-002] 将活动 Change Pack 数量收紧为每个 worktree 最多一个，并为创建、状态、校验、批准和提升补充稳定诊断。
- [ ] T002 [AC-003] 实现模型基线 freshness 检查与显式刷新命令，确保基线变化触发重新审查。
- [ ] T003 [AC-004, AC-005, AC-010] 将标准 SVG 镜像改为受版本控制资产，实现锁定运行时的原子渲染、严格镜像、freshness 比对和客观布局事实诊断。
- [ ] T004 [AC-006, AC-007] 将 SVG 纳入设计摘要、批准、model-only commit 和 `.puml`/SVG 原子提升或删除。
- [ ] T005 [AC-008, AC-011] 同步 Skill、模板、AGENTS 标记、合同、README、capabilities 和批准模型，把逐图视觉结论与返工循环设为设计批准前置条件，并迁移 `.gitignore` 与现有 SVG。
- [ ] T006 [AC-009, AC-010, AC-011] 使用 node:test 和真实 CLI 入口覆盖客观 SVG 事实、门禁、成功、失败、幂等与不覆盖路径，不用快照测试冒充视觉判断，并运行 npm test。
