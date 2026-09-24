# Review Model

1. 先读取 `change status <id> --json`。存在新 overlay 或图摘要变化时，运行 `change render <id>`；仅 principles 等非图内容变化且图与上一份 design approval 一致时，可复用已有视觉证据，不重复 render。随后运行 `change validate <id> --json` 和 `change diff <id>`，确认 baseline current 并读取 source facts。
2. 对 fresh SVG，必须逐张打开并检查标签裁切或重叠、交叉线、密度、边界和阅读顺序，同时核对 `NOTE_BUDGET_EXCEEDED`、`NOTE_TOO_LONG`、`NOTE_LINE_SHARE_HIGH`、`noteCount`、`noteLineCount`、`noteLineShare` 和单条 note 最大规模。在 decisions.md 记录 `PASS`、`CONCERNS` 或 `FAIL`。复用证据只适用于摘要逐字节一致的图；IDE 预览不能替代 fresh SVG 审查。
3. 审查跨图术语、目标、实体、事件、状态、职责和接口是否一致；确认标题只描述问题或主题。
4. 对照生成前视图清单检查预算：默认一张、通常最多三张；查找重复问题、可复用已有图和可合并的相近场景。第四张及以后缺少生成前人类明确同意时，返回建模阶段收敛候选。
5. 检查 proposal 与 decisions 是否提供问题、证据、取舍和 AC，而没有复制 PlantUML。
6. 向人类呈现候选 SVG、diff、每张图的问题、客观 SVG/source facts、视觉结论、理由、替代方案、风险和全部未决问题。
7. 任一结果为 CONCERNS/FAIL 时，先收敛模型，再重新 render、逐张打开并复审；不得请求批准。
8. 根据反馈只修改 Change Pack 候选，重新 validate/diff；删除没有独立决策价值的候选。
9. 只有全部 add/modify 图为 PASS（fresh 或按摘要复用），且人类在当前会话明确批准设计后，才运行：

```sh
arch-lens change record-approval <id> --stage design --reviewer <human-name>
```

10. 运行 `arch-lens change apply-model <id>`，确认候选 `.puml` 被提升、delete 生效、候选/临时 SVG 已清理。不得要求 model-only commit。
11. 再运行 status，确认 `designApproval.state=current` 且 `modelApplied=true`。

CLI 通过只表示材料结构和语法成立。最终设计判断必须由本步骤的 AI 语义审查和人类决定共同完成。
