# Propose Change

1. 运行 `arch-lens capabilities --json` 并确认 protocol 1 feature 完整。
2. 读取项目原则、现有图集、建模指南、PlantUML 合同和 Change Pack 合同。
3. 确认这是具有建模影响的变更；普通实现修复不强行创建图或 Change Pack。
4. 在有效 HEAD 上运行 `arch-lens change new <id>`；其他不重叠活动 Change Pack 可以保持未提交，但实现代码和顶层模型必须干净。
5. 从需求、代码、测试、数据和历史收集证据，区分事实、推断和未知。
6. 填写 proposal 的问题、目标、非目标、AC、假设和 Q；不要在 Markdown 重述模型。
7. 把关键方案取舍写入 decisions。
8. 在写任何 `.puml` 前向人类给出视图清单：每张图的问题、独立决策价值、修改已有图或新增图的选择，以及为什么文字或已有图不足。
9. 默认一张主视图，通常最多三张。第二、第三张必须互补；第四张及以后逐张说明不可合并理由，并在创建文件前等待当前会话中人类明确同意。
10. 优先更新已有图；相同参与者、责任边界或生命周期的场景使用 `alt/opt`、guard、活动分支或状态转换合并，不按 AC 或测试案例逐图生成。标题只描述问题或主题，不用 Candidate、Draft、Approved 等词标记图自身阶段。
11. 在 `<change-pack>/diagrams/<canonical-relative-path>` 写 add/modify 候选，并在 change.yaml 声明 canonical path 与 operation；delete 只声明 operation，不创建占位图。不得直接修改顶层图集。
12. 把 tasks 写成引用 AC 的实施步骤；它可以在批准后细化。
13. 运行 `arch-lens change status <id> --json` 和 `validate`，修复结构、路径、Git 或 PlantUML 事实错误。

结束时进入 review model，不要实施架构敏感代码。
