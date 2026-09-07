# Design Decisions

## D001: 每个 worktree 最多一个活动 Change Pack

### Context

同一工作区的多个 overlay 会共享未提交状态、审批门禁和顶层模型。按文件路径排除直接重叠，不能排除不同图之间的术语、职责、状态或接口冲突。

### Decision

当前 worktree 只允许零个或一个活动 Change Pack。存在活动变更时，所有创建第二个变更或在遗留多变更状态中推进单个变更的命令都必须失败。真正的并行工作使用独立 branch/worktree；进入目标分支的变更通过外部 Git 集成队列逐个合入。

### Alternatives

- 保留多个非重叠 Change Pack，并扩展路径锁：仍无法覆盖跨图语义耦合。
- 整个仓库全局只允许一个变更：隔离最强，但不必要地取消了 branch/worktree 的安全并行能力。
- 由 CLI 自动管理 worktree：扩大产品边界，并重复 Git 已经提供的职责。

### Consequences

工作区状态、批准归属和提交边界变得确定。代价是并行贡献者必须管理额外 worktree，并且主分支合流吞吐量由串行门禁限制。旧的多活动工作区必须先人工拆分，CLI 不自动迁移。

## D002: 基线变化必须显式刷新并重新审查

### Context

`baseCommit` 当前参与设计摘要，却没有与当前已批准模型进行 freshness 比较。其他 worktree 合入相关模型后，旧候选仍可能显示为 current。

### Decision

设计门禁比较 `baseCommit` 与当前 HEAD 中的 `principles.md` 和顶层 `.puml` 基线。发现外部模型变化时拒绝批准与提升。贡献者先使用 Git 同步目标分支，再调用确定性的基线刷新命令；该命令只更新 Git 基线事实，不合并候选、不作语义判断，并使已有批准 stale。

### Alternatives

- 只检查候选声明路径：无法发现不同图之间的语义影响。
- 自动把 `baseCommit` 改成 HEAD：隐藏基线变化，绕过重新审查。
- 每次任意代码提交都使模型批准 stale：与架构语义无关，噪声过大。

### Consequences

并行分支必须在设计批准前同步最新目标模型，跨图变化会重新进入语义审查。CLI 需要提供清晰的 stale 诊断与显式刷新操作，但不需要理解 Git 远端或目标分支名称。

## D003: 版本控制 SVG，但保持 PlantUML 为唯一真相

### Context

Git 忽略的可选 SVG 无法在 fresh clone 或历史提交中证明审查材料存在，也无法阻止 `.puml` 修改后遗留旧图。

### Decision

标准 `.arch-lens/rendered/**/*.svg` 与活动 Change Pack 的 `rendered/**/*.svg` 成为严格镜像且进入 Git。SVG 只能由 CLI 使用锁定的受管 PlantUML 生成。检查时在内存中重新渲染，并与标准 SVG 字节比较；缺失、孤立、无效或不一致均为错误。设计摘要绑定 `.puml` 与 SVG。SVG 不允许手工表达额外信息，业务语义仍只来自 PlantUML。

### Alternatives

- 保持 Git 忽略，只检查本地文件：fresh clone 和历史审查不可验证。
- 只比较文件修改时间：时间戳不是内容证据，跨 clone 不稳定。
- 只在 SVG 中记录源摘要：摘要可被手工伪造，不能证明渲染输出真实。
- CI 临时生成但不提交：可以证明可渲染，不能满足对应 SVG 必须存在于变更中的要求。

### Consequences

模型提交会增加生成文件 diff，PlantUML 版本升级可能产生集中式 SVG 变化。换取的是审查界面无需本地渲染即可查看图，并且 CLI 能确定性证明源与视图同步。标准镜像必须禁用任意 PlantUML 覆盖，避免不同渲染器污染提交。

## D004: 在 draft protocol 1 内以 capability 收紧合同

### Context

本次变化改变工作流行为和生成资产，但 Change Pack manifest 的固定字段与批准阶段没有必要改变。项目尚处于 `0.0.0-draft`，同时仍需阻止新版 Skill 与旧 CLI 混用。

### Decision

保留 workflowProtocol 1 和现有文件 schema，新增单活动变更、模型基线 freshness 与受版本控制 SVG 的 capability feature。Skill 在写入前要求这些 feature。当前迁移 Change Pack 按旧 feature 集完成模型批准；实现提交负责升级 CLI、Skill、模板、既有 SVG 和 Git ignore 规则。

### Alternatives

- 升级 workflowProtocol 2：边界最明确，但会使正在实施本次迁移的 protocol 1 Change Pack 无法由新 CLI 完成闭环。
- 不增加 capability：新旧 CLI 都报告兼容，却执行不同安全门禁。

### Consequences

draft 用户需要重新运行 init 或 install-agent 同步 Skill。将来发布稳定版前仍应重新评估是否把这组行为固化为新的 workflowProtocol。

## D005: 可视化质量是绑定当前 SVG 的语义门禁

### Context

渲染成功只能证明 PlantUML 能产生 SVG，不证明图面可读。候选组件图已经出现语法有效但关系交叉、阅读顺序混乱的实例。单看 `.puml` 能发现节点、关系和标签密度，却无法可靠预测自动布局的最终交叉与遮挡。

### Decision

CLI 为标准 SVG 提供摘要、viewBox、宽高和宽高比等客观事实，并可对异常值给出风险诊断；CLI 不判断“美观”或“设计清晰”。review-model 在每次候选变化和重新渲染后，必须由具备图像能力的 AI 或人类逐图检查标签裁切或重叠、交叉线、密度、边界和阅读顺序，并输出 PASS、CONCERNS 或 FAIL。只有全部为 PASS 且人类明确批准时，CLI 才记录绑定当前 `.puml`/SVG 摘要的设计批准。

发现视觉问题时先删除无决策价值的节点和关系、缩小问题、建立真实分组或换用更合适的图种；布局提示只在不扭曲语义时使用。不得靠坐标、不可解释的隐藏关系或大量样式补丁掩盖模型过密。

### Alternatives

- 把渲染成功视为视觉通过：已经被当前候选反例否定。
- 让 CLI 按关系数或宽高比自动给出 PASS/FAIL：阈值无法理解图种、问题和阅读语义，会制造伪精确。
- 只在最终人工批准时随意查看：缺少逐图结论和返工循环，容易把可视化问题带入批准模型。
- 为截图增加宽泛快照测试：会把布局噪声固化为契约，也不能判断内容是否可理解。

### Consequences

设计审查会增加一次明确的逐图视觉判断，但批准绑定了确切 SVG，后续源或视图变化会使结果 stale。自动化测试只覆盖客观 SVG 事实和门禁，不断言主观视觉质量；Skill 与人类继续承担语义判断。
