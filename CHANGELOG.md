# Changelog

本项目的公开变化记录在此文件中。

## 0.1.0-alpha.4 - 2026-09-24

- **Breaking:** 引入 `workflowProtocol 2` 和单一 local-first 模式。CLI/Skill 不再读取、要求或解释 Git，工作区由 `.arch-lens/` 向上发现，`init` 可在非 Git 目录运行。
- 删除 `persistence` / `renderedSvg` 模式、`baseCommit`、model-only commit、implementation commit、`implementation-patch-id`、`archive-evidence` 和 `rebase-stable-evidence-v1`。
- 使用 `baselineDigest`、`designDigest` 和 `completionDigest` 绑定本地内容；新增 `change refresh-baseline`。
- candidate SVG 改为临时视觉审查材料，不进入批准摘要、归档状态或 Git 审计契约；fresh SVG 与逐图 PASS 门禁保留。
- 测试新增非 Git 工作区、gitignored `.arch-lens/`、无 canonical SVG 缓存、内容 stale/refresh 和纯内容完成流程。
- `diagrams render` 使用 `mode: workspace-cache|explicit` 报告输出模式，不再暴露旧镜像字段。
- 协议 1 Change Pack、approval.yaml 与旧的版本控制 SVG 工作区不自动迁移。
- 新增 `RELEASING.md`：定义 alpha → beta → rc → GA 的发布通道、质量门禁与 soak 节奏。beta 与 rc 使用 npm `beta` 通道，GA 使用 `latest`。
- 澄清版本号规则：预发布线内允许破坏性变更且不提升版本号；`0.1.0` 之后的 `0.1.x` 只允许兼容修复。
- 发布引用：`v0.1.0-alpha.4`。

## 0.1.0-alpha.3 - 2026-09-23

- 新增 `rebase-stable-evidence-v1`：完成批准在提交身份之外绑定实现内容标识（`git patch-id --stable`），使归档证据在 rebase merge 重写历史后仍可核对。
- `verification.md` 新增 `implementation-patch-id` 声明，completion approval 记录新增 `implementationPatchId` 字段；缺少该字段的既有归档记录仍可解析。
- 新增只读命令 `change archive-evidence <id> [--ref <ref>]`，报告归档完成证据的提交身份可达性与实现内容标识匹配事实。
- Skill 合同要求 CLI 提供 `rebase-stable-evidence-v1`；旧版 CLI 需升级后再使用新版 Skill。
- 发布引用：`v0.1.0-alpha.3`。

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
