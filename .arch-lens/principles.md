# Arch Lens 项目原则

## Purpose

Arch Lens 帮助人类与 AI 围绕业务目标、领域概念、流程、状态、职责和接口形成可审查的共同理解。最终决策权属于人类；AI 负责完成背后的分析、建模、实施和一致性检查。

## Modeling Boundary

- `.arch-lens/diagrams/**/*.puml` 是唯一业务建模真相。
- Change Pack 只记录问题、范围、取舍、任务、批准和证据，不复制 PlantUML 中的模型。
- 不把 Arch Lens 默认为前后端、微服务或部署拓扑工具；只有问题确实涉及运行边界时才建模这些内容。
- 不引入 XMI、自定义 DSL、include 片段、自研 Viewer 或 Markdown 业务模型。

## Responsibility Boundary

- Skill 负责需求澄清、视图选择、PlantUML 编写、设计取舍、语义审查和实现一致性判断。
- CLI 只处理文件、Git 事实、摘要、PlantUML 检查与渲染、审批记录和原子归档。
- CLI 的结构或语法成功不得被表述为设计正确。
- 设计批准和完成验收必须来自人类的明确授权，AI 不得自行批准。

## Quality Gates

- 每张图回答一个明确问题，并优先使用业务人员可识别的统一语言。
- 任何持久 PlantUML 变更必须具有可追踪的变更上下文。
- 架构敏感代码只能在模型和决策获得批准并形成 model-only commit 后实施。
- 实现完成后必须逐项核对验收标准、批准模型、代码 diff 和测试证据。
- 若实现推翻设计，返回模型阶段重新审查，不通过修改记录掩盖偏差。
