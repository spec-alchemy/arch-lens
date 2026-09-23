# Changelog

本项目的公开变化记录在此文件中。

## Unreleased

后续变化将在下一个版本发布前记录。

## 0.1.0-alpha.2 - 2026-09-23

- 新增 `note-budget-v1` 确定性能力：解析 PlantUML note，报告条数、行数、行数占比和单条规模 facts。
- 新增 `NOTE_BUDGET_EXCEEDED`、`NOTE_TOO_LONG`、`NOTE_LINE_SHARE_HIGH` warning；不会阻塞 `diagrams check` 或 `change validate`。
- `diagrams check|render` 和 `change status|validate|render --json` 暴露 source facts，供视觉复核引用。
- Skill 的建模指南和 review-model 流程加入 note 三分法、类型预算和视觉审查记录要求。
- Skill 合同要求 CLI 提供 `note-budget-v1`；旧版 CLI 需升级后再使用新版 Skill。
- 发布引用：`v0.1.0-alpha.2`。

## 0.1.0-alpha.1 - 2026-09-07

- Arch Lens 首个外部预览版本，npm dist-tag 为 `next`。
- 每个 Git worktree 收紧为最多一个活动 Change Pack，并新增显式 `change refresh-base` 基线刷新。
- 标准 SVG 改为受版本控制的强制镜像；检查绑定锁定受管 PlantUML 的精确输出并报告客观布局 facts。
- 设计批准要求每张 add/modify 候选图具有 PASS 视觉审查记录。
- 发布引用：`v0.1.0-alpha.1`。
