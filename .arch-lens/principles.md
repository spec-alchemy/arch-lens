# Arch Lens 项目原则

## Purpose

Arch Lens 帮助人类与 AI 围绕业务目标、领域概念、流程、状态、职责和接口形成可审查的共同理解。模型服务于边界厘清、方案比较和重要决策；人类保留最终决策权，AI 负责分析、建模、实施和一致性检查。

## Modeling Boundary

- `.arch-lens/diagrams/**/*.puml` 保存唯一业务建模真相。
- 模型表达参与者、用例、实体、规则、流程、状态、职责、协作、组件和接口。
- 只有影响业务边界、职责或接口判断的技术内容进入模型。
- Change Pack 保存问题、范围、取舍、任务、批准和证据，并通过路径引用模型资产。
- SVG 只是审查期间的临时派生产物，不是业务模型、长期状态或批准摘要的一部分。

## Responsibility Boundary

- Skill 负责需求澄清、视图选择、PlantUML 编写、设计取舍、视觉审查、语义审查和实现一致性判断。
- CLI 负责本地文件、内容摘要、Schema、PlantUML 检查与渲染、人工审批记录和原子归档等确定性工作。
- CLI 不读取、不要求、不解释仓库外部版本控制状态；工作区由 `.arch-lens/` 向上发现。
- 人类审查模型、批准设计、验收实现并接受风险；AI 只提供证据和审查材料，不代录批准。

## Quality Gates

- 每张图回答一个明确问题，并使用业务人员可识别的统一语言。
- 持久 PlantUML 变化必须进入 Change Pack，并绑定 `baselineDigest`、`designDigest` 和 `completionDigest` 的本地内容事实。
- 设计批准前必须生成 fresh 候选 SVG，逐图检查裁切、重叠、交叉线、密度、边界和阅读顺序，并记录 PASS。
- 架构敏感代码只在设计和决策获得人类批准、`change apply-model` 提升候选 `.puml` 后实施。
- 实现完成后逐项核对验收标准、批准模型、代码 diff 和测试证据；只有人类明确验收后才记录 completion approval。
- 设计发生变化时返回模型审查阶段，保持模型、实现和证据的一致性。
- 提交顺序、patch-id、rebase 和发布审计属于仓库专用 CI/脚本，不进入 Arch Lens CLI/Skill 协议。
