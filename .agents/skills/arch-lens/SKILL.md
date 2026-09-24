---
name: arch-lens
description: 使用 PlantUML 帮助人类与 AI 理解业务模型、参与者目标、用例、领域关系、流程、职责、生命周期和接口，并通过 Change Pack 管理设计批准、实施证据和完成验收。不要把它默认为前后端、微服务或部署拓扑工具。
---

# Arch Lens

以 Skill 作为语义工作流，以 CLI 作为确定性辅助工具。PlantUML 是唯一业务模型；`.arch-lens/diagrams/**/*.puml` 保存 canonical，Change Pack 保存 desired、决策、批准与证据。

## 开始工作

修改任何 Arch Lens 资产前运行：

```sh
arch-lens capabilities --json
```

只在 `workflowProtocol=2` 且包含 `change-pack-v3` 时继续；不兼容时停止并说明需要更新 CLI 或项目 Skill。

1. 从当前目录向上查找最近的 `.arch-lens/`；不存在时在当前目录运行 `arch-lens init`。
2. 确认当前工作区最多一个活动 Change Pack；并行工作使用独立工作区。
3. 读取 `.arch-lens/principles.md`、现有图集和 `references/modeling-guide.md`。
4. 修改 PlantUML 前读取 `references/plantuml-contract.md`；推进变更前读取 `references/change-pack-contract.md`。
5. 先写问题和人类决策，再选择最少必要视图。

## 视图预算

- 默认一张主视图，通常最多三张。
- 第二、第三张必须回答主视图无法回答的独立决策。
- 第四张起须逐张论证并先取得人类明确同意。
- 优先修改已有图；相近正常、失败、取消和重试路径优先合并表达。

## 动作路由

- **understand**：读取 `workflows/understand.md`。只读理解不强制 Change Pack。
- **propose change**：读取 `workflows/propose-change.md`。
- **review model**：读取 `workflows/review-model.md`。
- **apply change**：读取 `workflows/apply-change.md`。
- **review implementation**：读取 `workflows/review-implementation.md`。
- **close change**：读取 `workflows/close-change.md`。

## 边界

- Skill 负责需求澄清、视图选择、PlantUML、取舍、跨图一致性和实现语义审查。
- CLI 只报告本地文件、摘要、Schema、PlantUML facts 和人工审批记录，不读取 Git。
- 人类负责设计批准、完成验收和风险接受；没有当前会话中的明确授权，禁止记录 approval。
- 不手工编辑 `approval.yaml`，不让脚本模拟语义判断，不绕过 Change Pack 合同。
- 规范规则只在 `references/change-pack-contract.md`；本 Skill 和 workflows 只定义入口与顺序。
- `apply-model` 不是终态；completion approval 和归档前允许同一 Pack 继续修订。
