# 项目理解工作流

1. 运行 `arch-lens capabilities --json`；只读理解可以在不兼容时继续读取代码，但不得修改 Arch Lens 资产。
2. 从当前目录向上确认 `.arch-lens/` 工作区。没有工作区时只报告现状，除非用户要求初始化。
3. 读取 `.arch-lens/principles.md`、`../references/modeling-guide.md` 和 `../references/plantuml-contract.md`。
4. 先读取已有图集，运行 `arch-lens diagrams list` 与 `arch-lens diagrams check`。空图集是合法状态。
5. 从需求、公开接口、代码、测试和数据定义收集证据。不要依赖 Git 历史；若使用者另行提供仓库历史，只能把它当外部证据。
6. 列出当前需要回答的建模问题，并为每个问题选择一张首选图。删除不能支持理解或决策的问题。
7. 只读任务输出理解、证据、假设和问题。若用户要求持久创建或更新图集，转入 `propose-change.md`，不得绕过 Change Pack 直接写 `.puml`。

不要把“扫描了所有源码”误当作“理解了业务”。输出必须帮助审查者判断目标、边界、职责、规则和协作。
