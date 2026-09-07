# Change Proposal

## Problem And Evidence

当前工作流允许同一 Git worktree 中存在多个不重叠的活动 Change Pack。`requireChangeCreationWorktree` 放行所有活动 Change Pack 路径，`validateOverlaps` 只按 canonical `.puml` 路径发现直接冲突；不同文件表达同一实体、职责或接口时，CLI 无法隔离其工作区状态，也无法判断跨图语义冲突。现有测试还把“允许脏的非重叠活动 Change Pack”固定为公开行为。

设计摘要虽然绑定 `baseCommit`，但只要求该 commit 存在。一个长期分支可在其他模型变更合入后继续保持旧批准为 `current`，没有门禁要求它先同步最新已批准模型。

当前 SVG 仅在显式 render 时生成到 Git 忽略目录。`validate` 不要求 SVG 存在，也不检查 SVG 是否由当前 `.puml` 和受管 PlantUML 版本生成，因此代码审查、fresh clone 和历史提交无法证明被批准文本拥有同步的可视化审查材料。用户明确要求 `.puml` 发生变更时，对应 SVG 必须存在且更新。

本 Change Pack 第一版候选 `runtime-responsibilities.component.svg` 已暴露另一类缺口：PlantUML 语法和渲染均成功，但 19 条关系在多个高连接度节点之间交叉，阅读路径混乱。`.puml` 可以暴露密度风险，却不能可靠证明自动布局结果清晰；当前 CLI 没有 SVG 布局事实，Skill 中的视觉检查也只是文字要求，尚未形成阻止设计批准的显式循环。

## Goals

- 每个 Git worktree 最多存在一个活动 Change Pack，并把并行变更隔离到不同 branch/worktree。
- 在设计批准前拒绝相对于 `baseCommit` 已变化的项目原则或已批准 PlantUML 基线，并提供显式的基线刷新动作。
- 把标准 `rendered/` SVG 定义为受版本控制、不可手工维护的派生审查产物。
- 对每个 add/modify `.puml` 强制要求同路径 SVG 存在，并由锁定的受管 PlantUML 重新生成后精确验证；delete 同步删除二者。
- 把 SVG 客观布局事实和逐图视觉审查纳入 review-model 工作流；视觉问题必须通过精简关系、重组边界或更换视图解决后才能批准。
- 保持 PlantUML 为唯一业务模型，SVG 不承载独立语义。
- 保持设计批准、model-only commit、实现审查和人工完成验收的闭环。

## Non-goals

- CLI 不创建、删除、切换、rebase 或 merge Git branch/worktree。
- CLI 不自动合并竞争候选，也不自动判断跨图语义是否一致。
- 不引入远程渲染服务、浏览器 Viewer、其他建模语言或可编辑 SVG 工作流。
- 不要求 PNG、PDF 或自定义 `--output` 导出进入版本控制。

## Acceptance Criteria

- AC-001: 当前 worktree 已有活动 Change Pack 时，`change new` 以稳定诊断拒绝第二个变更且不写入任何新资产；不同 branch/worktree 可各自拥有一个活动变更。
- AC-002: `status`、`validate`、设计批准和模型提升对遗留的多活动 Change Pack 工作区报告错误，不能静默选择或推进其中一个变更。
- AC-003: 设计批准前若 `baseCommit` 之后的项目原则或顶层已批准 `.puml` 基线发生外部变化，CLI 报告 stale；同步目标分支后只能通过显式刷新基线并重新审查恢复。
- AC-004: 标准顶层图集和活动 Change Pack 的每个 add/modify `.puml` 都有严格镜像的受版本控制 SVG；缺失、孤立、无效或与锁定受管 PlantUML 输出不一致时检查失败。
- AC-005: `diagrams render` 与 `change render` 原子刷新标准 SVG 镜像；渲染失败不留下部分结果，`.puml` 删除或 Change Pack delete operation 会同步移除对应 SVG。
- AC-006: 设计摘要、设计批准和 model-only commit 同时绑定声明的 `.puml` 与对应 SVG；批准后任一内容变化都会使设计批准 stale。
- AC-007: `apply-model` 原子提升或删除 `.puml`/SVG 对，并清理候选 overlay；自定义导出目录不满足标准 SVG 门禁。
- AC-008: Skill、项目模板、AGENTS 标记、合同、README 和已批准模型统一表达“worktree 内单变更、worktree 间并行、串行集成”和“PlantUML 唯一真相、SVG 必需且受版本控制”。
- AC-009: `npm test` 覆盖以上 CLI 行为的成功与失败路径，并继续验证 init 幂等且不覆盖非托管用户内容。
- AC-010: `diagrams render`、`change render`、`status` 和 `validate` 为每张标准 SVG 返回可计算的路径、摘要、viewBox、宽高和宽高比事实，并对缺失尺寸、非正尺寸或极端宽高比给出稳定诊断，但不输出“设计清晰”等语义结论。
- AC-011: review-model 必须打开并逐张检查当前 SVG，报告标签裁切或重叠、交叉线、密度、边界和阅读顺序的 PASS、CONCERNS 或 FAIL；存在 CONCERNS/FAIL 时不得记录设计批准，批准记录绑定通过审查的 SVG 摘要。

## Assumptions

- npm 包仍处于 `0.0.0-draft`，本次收紧可继续使用 workflowProtocol 1，但必须增加 capability feature，使新版 Skill 在写入前拒绝旧 CLI。
- 标准 SVG 一律由锁定的受管 PlantUML JAR、headless 模式和 SANDBOX 配置生成；显式 `ARCH_LENS_PLANTUML` 与 PATH fallback 可用于临时检查，但不能生成或验证受版本控制的标准镜像。
- Git 仍是 branch/worktree 隔离、串行合入和代码冲突处理的唯一责任方。
- SVG 的客观尺寸和宽高比只能提示风险，不能替代 AI 与人类对实际图面的视觉判断。

## Open Questions

- [x] Q001: SVG 是否只要求本地存在？结论：否。为使 fresh clone、代码审查和历史提交可验证，标准 SVG 必须进入 Git；它仍是可再生成的派生产物，不是第二份业务模型。
- [x] Q002: 是否由 Arch Lens 管理 Git worktree 生命周期？结论：否。CLI 只验证当前 worktree 的单活动变更和 Git 事实，worktree 生命周期继续由 Git 与人类管理。
