# Review Model

1. 运行 `arch-lens change render <id>`、`change validate <id>` 和 `change diff <id>`；确认基线 current，标准 SVG 的摘要与尺寸事实完整。
2. 必须逐张打开当前候选 SVG，检查标签裁切或重叠、交叉线、密度、边界和阅读顺序，并在 decisions.md 记录 `PASS`、`CONCERNS` 或 `FAIL`。IDE 预览可辅助，但不能替代绑定当前 SVG 的结论。
3. 审查跨图术语、目标、实体、事件、状态、职责和接口是否一致；确认标题只描述问题或主题，没有把图自身标记为 Candidate、Draft、Approved 等工作流阶段。
4. 对照生成前视图清单检查预算：默认一张、通常最多三张；查找重复问题、可复用已有图和可合并的相近场景。第四张及以后缺少生成前人类明确同意时，返回建模阶段收敛候选。
5. 检查 proposal 与 decisions 是否提供问题、证据、取舍和 AC，而没有复制 PlantUML。
6. 向人类呈现标准 SVG、预览入口、diff、每张图的问题、客观 SVG facts、视觉结论、理由、替代方案、风险和全部未决问题。CLI 的哈希、尺寸和宽高比只提示风险，不代表图面清晰。
7. 任一结果为 CONCERNS/FAIL 时，先删除无决策价值的关系、缩小问题、重组真实边界或更换图种；只有不扭曲语义时才使用布局提示。修改候选后重新 render、逐张打开并复审，不得请求批准。
8. 根据反馈只修改 Change Pack 候选，重新 validate/diff；删除没有独立决策价值的候选，不要创建私有阶段状态。
9. 只有全部 add/modify 图为 PASS，且人类在当前会话明确批准设计后，才运行：

```sh
arch-lens change record-approval <id> --stage design --reviewer <human-name>
```

10. 运行 `arch-lens change apply-model <id>`，确认候选 `.puml`/SVG 对被提升到顶层、Change Pack 不再保存候选镜像，然后将原则、图、标准 SVG、Change Pack 和批准记录提交为独立 model-only commit。
11. 再运行 status，确认 `designApproval.state=current` 且 `modelCommit` 非空。

CLI 通过只表示材料结构和语法成立。最终设计判断必须由本步骤的 AI 语义审查和人类决定共同完成。
