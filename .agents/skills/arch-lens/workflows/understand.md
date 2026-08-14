# 项目理解工作流

1. 运行 `arch-lens capabilities --json`；只读理解可以在不兼容时继续读取代码，但不得修改 Arch Lens 资产。
2. 读取 `.arch-lens/principles.md`、`../references/modeling-guide.md` 和 `../references/plantuml-contract.md`。
3. 先读取已有图集，记录它已回答的问题、术语和边界；运行 `arch-lens diagrams list` 与 `arch-lens diagrams check`。空图集是合法状态。
4. 从需求、公开接口、代码、测试、数据定义和 Git 历史收集证据。区分业务事实、实现细节、推断和未知。
5. 列出当前需要回答的建模问题，并为每个问题选择一张首选图。删掉不能支持理解或决策的问题。
6. 只读任务输出理解、证据、假设和问题即可。若用户要求持久创建或更新图集，转入 `propose-change.md`，不得绕开 Change Pack 直接写 `.puml`。

不要把“扫描了所有源码”误当作“理解了业务”。输出必须帮助审查者判断目标、边界、职责、规则和协作。
