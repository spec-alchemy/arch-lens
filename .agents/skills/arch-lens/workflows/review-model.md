# Review Model

1. 运行 `arch-lens change validate <id>` 和 `arch-lens change diff <id>`。
2. 优先使用本地 IDE 插件直接预览顶层 base 与 Change Pack candidate；需要独立 SVG 时才运行 `arch-lens diagrams render` 和 `arch-lens change render <id>`。检查标签、箭头、交叉线、密度、边界和阅读顺序。
3. 审查跨图术语、目标、实体、事件、状态、职责和接口是否一致；确认标题只描述问题或主题，没有把图自身标记为 Candidate、Draft、Approved 等工作流阶段。
4. 对照生成前视图清单检查预算：默认一张、通常最多三张；查找重复问题、可复用已有图和可合并的相近场景。第四张及以后缺少生成前人类明确同意时，返回建模阶段收敛候选。
5. 检查 proposal 与 decisions 是否提供问题、证据、取舍和 AC，而没有复制 PlantUML。
6. 向人类呈现预览入口、diff、每张图的问题、理由、替代方案、风险和全部未决问题；SVG 未生成不是缺陷。
7. 根据反馈只修改 Change Pack 候选，重新 validate/diff；删除没有独立决策价值的候选，不要创建私有阶段状态。
8. 只有人类在当前会话明确批准设计后，才运行：

```sh
arch-lens change record-approval <id> --stage design --reviewer <human-name>
```

9. 运行 `arch-lens change apply-model <id>`，确认候选被提升到顶层、Change Pack 不再保存 `.puml`，然后将原则、图、Change Pack 和批准记录提交为独立 model-only commit。
10. 再运行 status，确认 `designApproval.state=current` 且 `modelCommit` 非空。

CLI 通过只表示材料结构和语法成立。最终设计判断必须由本步骤的 AI 语义审查和人类决定共同完成。
