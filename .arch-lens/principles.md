# Arch Lens 项目原则

## Purpose

Arch Lens 帮助人类与 AI 围绕业务目标、领域概念、流程、状态、职责和接口形成可审查的共同理解。模型服务于边界厘清、方案比较和重要决策；人类保留最终决策权，AI 负责分析、建模、实施和一致性检查。

## Modeling Boundary

- `.arch-lens/diagrams/**/*.puml` 保存唯一业务建模真相。
- 模型表达参与者、用例、实体、规则、流程、状态、职责、协作、组件和接口。
- 只有影响业务边界、职责或接口判断的技术内容进入模型。
- Change Pack 保存问题、范围、取舍、任务、批准和证据，并通过路径引用模型资产。
- SVG 只是审查期间的临时派生产物，不是业务模型或长期状态。

## Responsibility Boundary

- Skill 负责需求澄清、视图选择、PlantUML 编写、设计取舍、视觉与语义审查，以及实现一致性判断。
- CLI 负责本地文件、内容摘要、Schema、PlantUML facts、人工审批记录和原子归档。
- 人类审查模型、批准设计、验收实现并接受风险；AI 不代录批准。

## Quality Gates

- 每张图回答一个明确问题，并使用业务人员可识别的统一语言。
- 持久 PlantUML 变化必须进入 Change Pack，并遵守当前 Change Pack 合同。
- 设计批准前必须满足当前合同定义的视觉审查门禁。
- 实现与验收必须对照批准模型、代码 diff、测试和 AC，并保留可定位证据。
- 设计发生变化时返回模型审查阶段，直到 design approval current。
- Arch Lens 仓库不额外要求 Git 提交顺序、patch-id、rebase 或 SVG 持久化。
