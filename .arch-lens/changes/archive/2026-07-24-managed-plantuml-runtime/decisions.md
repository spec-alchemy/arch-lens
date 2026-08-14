# Design Decisions

## D001: 由 CLI 管理锁定 PlantUML JAR

### Context

初始化后的核心检查依赖 PlantUML，但当前仅支持 PATH 或会话环境变量。临时 JAR 能验证功能，却不能形成跨会话产品能力。

### Decision

`init` 在仓库写入前确保一个锁定版本、固定摘要的官方 JAR 可用。没有合格的显式或系统运行时时，将其下载到按版本隔离的用户缓存。后续命令自动发现该缓存。

### Alternatives

- Homebrew/apt：拒绝，平台相关且要求修改系统包状态。
- 把 JAR 放入 npm 包：拒绝，增加分发体积与第三方二进制许可责任。
- 继续要求用户配置 PATH/环境变量：拒绝，这正是已复现的缺陷。
- 自动使用公共 PlantUML server：拒绝，会上传私有模型。

### Consequences

首次初始化需要网络和约 28 MiB 下载；之后可离线复用。CLI 必须维护下载安全、缓存完整性与并发原子性。锁定版本升级需要显式代码、摘要、测试和许可说明变更。

## D002: 保留 Java 为显式前置条件

### Context

官方 PlantUML 渲染器运行于 JVM。捆绑 JRE 会重新引入平台矩阵、数百 MiB 发行物和 OpenJDK 更新责任。

### Decision

`init` 在任何仓库写入或网络下载前确认 Java 可执行，并在安装后用真实 headless 版本探测验证 JAR。缺少或不兼容 Java 时给出可操作错误。

### Alternatives

- 下载平台 JRE：拒绝，超出本次缺陷的最小修复范围并显著扩大供应链面。
- 只检查 `java` 文件存在：拒绝，macOS launcher 或错误 JVM 可能存在但不可运行。

### Consequences

Arch Lens 不再要求用户单独安装 PlantUML，但仍公开要求 Java 21。未来若提供自包含 runtime，应作为独立设计决策，不悄悄进入本安装器。

## D003: 显式覆盖优先且受管缓存可验证

### Context

开发、CI 和故障排查仍需要指定 PlantUML 可执行文件或 JAR；受管缓存也可能被删除、替换或损坏。

### Decision

运行时解析顺序固定为显式 `ARCH_LENS_PLANTUML`、摘要有效的受管 JAR、PATH PlantUML。显式入口仍接受最低版本门禁。受管 JAR 每次解析前检查真实普通文件与 SHA-256；`init` 对普通损坏文件重新下载并原子替换，对符号链接和不安全目录直接拒绝。

### Alternatives

- PATH 永远优先：拒绝，会让已初始化环境被偶然安装的旧版本覆盖。
- 缓存只在安装时校验：拒绝，无法发现后续篡改。

### Consequences

默认行为跨会话稳定，CI 仍可完全控制运行时。每次命令多一次本地 28 MiB SHA-256 计算，换取明确的执行完整性。

## D004: 用 Change Pack overlay 隔离未批准候选

### Context

当前工作区顶层 diagrams 同时承担已批准模型和未批准候选，Change Pack 只用 manifest 指向这些共享文件。它避免了副本，却让状态边界依赖 Git 心智模型，并阻止多个未批准候选在同一工作区自然并存。

### Decision

顶层 `.arch-lens/diagrams` 只保存已批准模型。每个活动 Change Pack 使用 `diagrams/<canonical-relative-path>` 保存 add/modify 候选；delete 只有 change.yaml operation，没有候选文件。批准摘要绑定逻辑 canonical path 与候选字节。批准后 `change apply-model` 原子提升 overlay 并移除候选目录。

### Alternatives

- 继续直接修改顶层工作区：拒绝，批准与候选边界不直观且并行能力受限。
- 在 Change Pack 永久保存批准模型副本：拒绝，会形成第二份长期业务模型。
- 允许同一路径多个 overlay：拒绝，提升顺序会产生隐藏合并语义；使用 branch/worktree 更明确。

### Consequences

设计阶段的 canonical 模型保持稳定，多个不重叠候选可以并存。CLI 需要确定性组合 base/overlay、验证操作事实，并提供可恢复的批准后提升步骤。归档不保留 `.puml` 副本，只保留摘要和证据。

## D005: SVG 是按需生成的严格镜像

### Context

VS Code 等 PlantUML 插件可以直接预览 `.puml`。强制 bundle 同时生成 base/candidate SVG、diff.patch 和 manifest，增加了运行时耦合，并把非图像文件错误归类为 rendered。

### Decision

顶层与 Change Pack 的 `rendered` 目录仅在显式 render 时创建，只包含与对应 diagrams 相对路径一致的 `.svg`。`change diff` 只输出文本或 JSON，不写文件；摘要在内存中计算并只把批准所需事实写入 approval.yaml。

### Alternatives

- 每次 validate 自动渲染：拒绝，语法检查不应产生视图副作用。
- 保留 base/candidate 子目录：拒绝，父目录已经表达 approved/candidate 状态。
- 把 SVG 提交 Git：拒绝，它可再生成且不是模型真相。

### Consequences

IDE 直接预览成为一等人工审查路径，CLI 渲染保持可选。完整 render 必须原子替换镜像以清理已删除源对应的陈旧 SVG；归档前丢弃 ignored rendered 内容。
