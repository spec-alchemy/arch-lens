# Agent 指令

## Arch Lens

<!-- ARCH-LENS:START -->
本项目使用 Arch Lens draft workflowProtocol 1；Skill 负责业务建模与语义审查，CLI 只提供确定性辅助能力。

- 修改建模资产前，Skill 必须先执行 `arch-lens capabilities --json` 并确认协议兼容。
- 已批准的业务模型位于 `.arch-lens/diagrams/**/*.puml`；未批准候选只位于对应 Change Pack 的 `diagrams/` overlay。
- 持久建模默认一张主视图、通常最多三张；第四张起须逐张论证，并在生成前取得人类明确同意。
- SVG 只在显式 render 时生成到与源图相邻层级的 Git 忽略 `rendered/` 镜像，也可直接使用 IDE 预览。
- 任何持久 PlantUML 变更必须进入 Change Pack，并在实现代码前获得人类设计批准、`change apply-model` 和 model-only commit。
- AI 不得自行记录设计或完成批准；实现后必须对照批准模型、代码 diff、测试和 AC 做语义审查。
- 规范 Skill 位于 `.agents/skills/arch-lens/`。
<!-- ARCH-LENS:END -->

## 本仓库测试规范

这些规范只适用于 Arch Lens 仓库。除非明确要求，不要将它们复制到生成的 `.arch-lens/` 模板中。

- `npm test` 是必需的本地验证命令。
- 测试必须使用 Node 内置的 `node:test` 和 `node:assert/strict`；除非项目确实需要 `node:test` 无法提供的能力，否则不要增加测试框架。
- 测试必须在临时目录运行，且不得写入仓库工作区；提交的刻意 fixture 文件除外。
- CLI 测试必须通过 `process.execPath` 执行 `bin/arch-lens.js`，以覆盖真实命令入口。
- 每项 CLI 行为修改都必须包含成功与失败路径的测试。
- `init` 测试必须验证幂等性与不覆盖行为。
- `install-agent` 测试必须覆盖 project/global 范围和无效选项组合。
- 已删除的命令必须持续不出现在公开 CLI 接口中。
- 只有当输出属于 CLI 契约时，测试才应断言用户可见文本。
- fixture 应保持最小且仅限本地使用；避免宽泛的快照式断言。
