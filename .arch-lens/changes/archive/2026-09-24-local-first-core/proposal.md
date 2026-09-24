# Change Proposal

## Problem And Evidence

当前 alpha.3 把 Arch Lens 的核心工作流绑定到 Git：CLI 以 Git 根目录和 HEAD 作为工作区前提，以 `baseCommit` 判断模型基线，以提交、clean worktree、model-only commit、实现 commit、`reviewedImplementationCommit` 和 `implementation-patch-id` 组织批准与完成证据。`persistence-policy` 方案试图把 Git 审计和 SVG 持久化拆成 `tracked` / `local` 与 `tracked` / `local-only` 组合，但用户已明确否定该方向：可选项本身就是新增产品面，会继续扩大 CLI、Skill、测试、文档和长期兼容成本。

问题不是“Git 审计是否可选”，而是 Git 不应进入 Arch Lens 核心语义。使用者应当可以在普通目录、非 Git 目录或完全 gitignore `.arch-lens/` 的仓库中使用同一套严格流程，不需要理解提交、worktree、patch-id 或持久化策略。

## Goals

- 收敛为单一 local-first 模式：没有 profile、没有 `config.yaml` 模式开关、没有 Git adapter。
- CLI 与 Skill 不读取、不要求、不解释 Git；核心命令可在非 Git 目录运行。
- `.arch-lens/` 是否被 Git 跟踪完全不影响命令行为。
- 用 `baselineDigest` 绑定 `principles.md` 与全部 canonical `.puml` 内容；模型内容变化使旧批准 stale。
- 设计批准只绑定语义内容：principles、change.yaml、proposal、decisions 和候选 `.puml`；SVG 是临时审查材料，不进入摘要。
- 完成批准只绑定 `designDigest`、`tasks.md` 和 `verification.md` 内容，以及人类的语义验收；不要求 commit 或 patch-id。
- 保留严格门禁：设计批准前逐图 fresh SVG 与 PASS 视觉审查，AC 全部 PASS，实现后语义一致性审查，人类批准不可由 AI 代录。
- 删除 `persistence-policy-v1`、`local-svg-policy-v1`、`rebase-stable-evidence-v1` 及所有 Git/模式相关 CLI 行为。
- 将持久建模从 5 张 Git/运行时中心图收敛为 3 张 local-first 图。

## Non-goals

- 不提供 Git 适配器、strict/audit profile、tracked/local 组合或 SVG 跟踪策略。
- 不承诺跨 clone、跨机器、跨 worktree 反查批准历史。
- 不要求 Arch Lens 仓库自身的 commit 顺序、rebase patch-id 或发布审计进入 CLI/Skill；这些只能由仓库专用 CI/脚本处理。
- 不自动迁移旧 Change Pack、旧 `approval.yaml` 或旧 schema；本次允许显式不兼容。
- 不把 `change evidence` 变成代码 diff、提交审查或语义判断工具。

## Acceptance Criteria

- AC-001: CLI 与 Skill 只有一种 local-first 语义；不存在 `persistence`、`renderedSvg`、`config.yaml` 模式开关或 Git/audit profile。
- AC-002: `init` 与非 `init` 命令都不要求 Git 仓库、有效 HEAD、clean worktree 或 `.arch-lens/` 被跟踪；在非 Git 目录可完成核心流程。
- AC-003: `change.yaml` 使用 `baselineDigest` 绑定 `principles.md` 与 canonical `.puml`；canonical 内容变化使旧设计批准 stale，显式 `change refresh-baseline` 后必须重新审查。
- AC-004: 设计批准要求每个 add/modify 候选有 fresh SVG 与 PASS 视觉审查；`designDigest` 绑定 principles、change.yaml、proposal、decisions 和候选 `.puml`，不绑定 SVG。
- AC-005: `change apply-model` 原子提升 `.puml` 内容并移除候选/临时 SVG；不要求或创建 model-only commit。
- AC-006: 完成批准绑定 `designDigest`、tasks 和 verification 内容；要求所有任务完成、全部 AC PASS、semantic review 为 pass，并只在人类明确验收后记录。
- AC-007: 核心 status/validate/evidence 不读取 Git commit、patch-id 或 worktree；旧 Git 能力从 capabilities 与公开命令接口删除。
- AC-008: 持久模型收敛为 `product-goals.use-case.puml`、`local-first-lifecycle.activity.puml` 和 `local-first-responsibilities.component.puml`；删除 4 张以 Git、受版本控制 SVG 或提交边界为中心的旧图。

## Assumptions

- Workspace root 可由当前目录向上查找最近的 `.arch-lens/` 得到；`init` 在调用目录创建该工作区。
- 内容摘要使用稳定 JSON 与 SHA-256，只依赖 UTF-8 文件字节。
- 受管 PlantUML 运行时仍是本地处理前提；它属于 CLI 的确定性渲染能力，不属于 Git 审计。
- 仓库自身如果需要 CI 级提交顺序或 patch-id 审计，使用仓库专用脚本，不进入 Arch Lens 产品契约。

## Open Questions

- [x] Q001: 是否保留旧 Git/双模式兼容？结论：不保留；使用新 workflowProtocol 2，旧 Change Pack 显式不兼容。
- [x] Q002: SVG 是否持久化或进入摘要？结论：不进入；只作为审查期间生成的 fresh 候选材料。
- [x] Q003: 完成验收绑定什么？结论：绑定 designDigest、tasks 与 verification 内容，以及人类明确的语义验收决定。
