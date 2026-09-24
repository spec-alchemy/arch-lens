---
name: arch-lens
description: 使用 PlantUML 帮助人类与 AI 理解和设计软件中的业务模型、参与者目标、系统用例、领域实体与关系、业务流程与数据流、职责协作、生命周期、组件边界和接口，并通过 Change Pack 管理设计批准、实施证据和完成验收。用于项目理解、需求澄清、领域建模、用例分析、流程或状态设计、组件职责划分、架构敏感变更及实现后的模型一致性审查；不要把它默认为前后端、微服务或部署拓扑工具。
---

# Arch Lens

以 Skill 作为语义工作流，以 CLI 作为确定性辅助工具。把 PlantUML 作为唯一业务模型：顶层 `.arch-lens/diagrams/**/*.puml` 是已批准模型，活动 Change Pack 的 `diagrams/**/*.puml` 是待批准 overlay。候选 `rendered/**/*.svg` 只在视觉审查期间临时存在，不进入内容摘要。

## 开始工作

在修改任何 Arch Lens 资产前运行：

```sh
arch-lens capabilities --json
```

只在 `workflowProtocol` 为 `2` 且包含 `plantuml-batch-render`、`change-pack-v2`、`approval-digest-v2`、`completion-approval-v2`、`managed-plantuml-runtime-v1`、`change-overlay-v1`、`single-active-change-v1`、`content-baseline-v1`、`local-first-workspace-v1`、`svg-facts-v1`、`note-budget-v1` 和 `visual-review-gate-v1` 时继续。不兼容时停止写入并说明应更新 CLI 或项目 Skill。

1. 从当前目录向上查找最近的 `.arch-lens/` 作为工作区；没有时只在当前目录运行 `arch-lens init`。不要要求 Git 仓库、HEAD、commit 或干净工作区。
2. 确认每个工作区最多一个活动 Change Pack；并行工作使用独立工作区，完成后逐个整合。
3. 读取 `.arch-lens/principles.md`、现有图集，以及 `references/modeling-guide.md`。
4. 创建或修改 PlantUML 时读取 `references/plantuml-contract.md`。
5. 创建或推进变更时读取 `references/change-pack-contract.md` 和对应 workflow。
6. 先写出问题，再选择最少必要视图；不要为了资产齐全而画图。

## 视图预算

- 持久建模默认只生成或修改一张主视图，通常最多三张。图种列表是选择菜单，不是完整性清单。
- 写任何 `.puml` 前，先给出视图清单：每张图的问题、支持的独立人类决策、复用已有图还是新增，以及为什么文字或已有图不足。
- 第二、第三张图必须回答主视图无法回答的独立判断。第四张及以后必须逐张说明不可合并理由，并在生成文件前获得当前会话中人类明确同意。
- 优先修改已有图。相同参与者、责任边界或生命周期下的正常、失败、取消和重试路径优先用 `alt`、`opt`、guard、活动分支或状态转换合并表达。
- 不按 AC、测试案例、接口或相近场景逐图生成。“一图一问”不等于“一问一图”；只有影响边界、职责、规则或人类决策的问题才进入持久图集。

## 动作路由

- **understand project**：读取 `workflows/understand.md`。只读理解不强制 Change Pack；若要持久修改 `.puml`，转入 propose change。
- **propose change**：读取 `workflows/propose-change.md`。创建 Change Pack，澄清范围与 AC，并形成候选模型。
- **review model**：读取 `workflows/review-model.md`。生成临时候选 SVG，执行语义审查并等待人类决定。
- **apply change**：读取 `workflows/apply-change.md`。确认设计批准 current 且候选 `.puml` 已提升后实施代码。
- **review implementation**：读取 `workflows/review-implementation.md`。对照批准模型、AC、代码 diff 和测试编写验证结论。
- **close change**：读取 `workflows/close-change.md`。在人类明确验收后记录完成批准并归档。

## 不可越过的边界

- Skill 负责需求澄清、视图选择、PlantUML、方案取舍、跨图一致性和实现语义审查。
- CLI 只报告本地文件、内容摘要、Schema、PlantUML facts 和人工审批记录；CLI 成功不等于设计正确，也不读取或解释 Git。
- 人类负责设计批准、完成验收和风险接受。没有当前会话中的明确授权，禁止调用 `change record-approval`。
- 不手工编辑 `approval.yaml`，不把 CLI 命令命名为 review、approve 或 verify，也不让脚本模拟语义判断。
- `baselineDigest` stale 时返回模型审查；实现推翻设计时更新 `.puml` 并重新批准。
- 顶层图集只保存批准模型；新增和修改候选写入 Change Pack overlay，删除只写入 change.yaml。
- add/modify 候选必须先用 `change render <id>` 生成 fresh SVG，并由人类逐图给出 PASS 后才可请求设计批准；SVG 不进入 `designDigest`。
- `change apply-model <id>` 只提升 `.puml` 并清理候选/临时 SVG；不得要求或创建 model-only commit。
- `designDigest` 绑定 principles、change.yaml、proposal、decisions 和候选 `.puml`；`completionDigest` 再绑定 tasks 与 verification。
- 仓库需要提交顺序、patch-id、rebase 或 release 审计时，使用仓库专用 CI/脚本；不得把这些事实写入 CLI/Skill 产品契约。

## 稳定工作规则

- 不绕过 `change new` 直接把未批准候选写进顶层图集。
- 不因测试通过就声称实现符合模型；必须完成语义一致性审查。
- 不把 SVG 当业务模型、长期审计对象或 freshness 摘要输入。
- 不用 AI 或脚本代替当前会话中的人类设计批准和完成验收。
- `.arch-lens/` 是否被 Git 跟踪不影响任何 Arch Lens 命令；用户可以整体 gitignore 它。
