# Change Proposal

## Problem And Evidence

`arch-lens init` 当前只创建仓库资产，既不安装 PlantUML，也不建立持久运行时发现路径。真实使用中，先前通过 `<temporary-directory>/plantuml.jar` 和一次性的 `ARCH_LENS_PLANTUML` 完成了验证；新会话中该变量不存在，Homebrew 也显示 PlantUML 未安装，因此同一 Change Pack 只能通过结构检查，无法完成 PlantUML 检查。

这使初始化后的工作区不具备其公开工作流所必需的 `check`、`render` 和 `bundle` 能力，并把临时环境准备错误地留给每个 Agent 会话重复处理。

设计审查还暴露出 Change Pack 的边界问题：未批准候选目前直接修改顶层已批准图集，`bundle` 又强制把 SVG、文本 diff 和 manifest 一起持久化到独立 rendered 根。结果是批准状态不直观、审查材料分散，并且多个未批准 Change Pack 无法在同一工作区真正并存。

## Goals

- `init` 完成后，Arch Lens 在没有 PATH PlantUML 和没有 `ARCH_LENS_PLANTUML` 的后续会话中仍可运行 PlantUML 检查与渲染。
- 运行时来源、版本、摘要、缓存位置和失败行为是确定且可测试的。
- 下载或校验失败不得留下部分 JAR，也不得修改目标 Git 工作区。
- 保持模型离线处理、headless、SANDBOX 和批处理安全边界。
- 把已批准模型、未批准候选和可再生成 SVG 放入由目录层级直接表达的不同边界。
- 允许多个不重叠 Change Pack 同时维护候选 overlay，而不修改顶层已批准模型。

## Non-goals

- 不安装或管理完整 JDK/JRE；Java 仍是显式前置条件，并由 `init` 在写工作区前验证。
- 不通过 Homebrew、apt、系统包管理器或 GUI 安装器修改系统状态。
- 不把 PlantUML JAR、SVG 或其他生成物提交到项目仓库，也不引入远程模型渲染服务。
- 不自动升级到未锁定的新 PlantUML 版本。
- 不持久化文本 diff、bundle manifest 或 base/candidate 源文件副本。
- 不允许多个活动 Change Pack 同时声明同一 canonical diagram 路径；竞争方案继续使用 Git branch/worktree。

## Acceptance Criteria

- AC-001: 在没有 PATH PlantUML 和 `ARCH_LENS_PLANTUML` 的环境中，`init` 将锁定版本的官方 PlantUML JAR 安装到用户缓存，并报告版本、来源和缓存路径。
- AC-002: 首次安装只接受固定 HTTPS 来源与固定 SHA-256；网络、大小、摘要、Java 或版本校验失败时不留下部分缓存文件且目标仓库字节不变。
- AC-003: 成功初始化后的新进程无需环境变量即可自动发现受管 JAR；重复 `init` 在有效缓存上不访问网络、不覆盖项目原则、图或 Change Pack。
- AC-004: 损坏、符号链接或版本不符的受管缓存不得被执行；`init` 可通过重新下载并原子替换恢复普通损坏文件。
- AC-005: 所有受管 JAR 调用继续强制 `-Djava.awt.headless=true`、`-headless`、`SANDBOX` 和 stdin 批处理，不上传或暴露模型内容。
- AC-006: README、Skill、许可说明、CI 和真实 CLI 测试明确覆盖受管运行时，同时保留 `ARCH_LENS_PLANTUML` 作为显式高级覆盖入口。
- AC-007: 顶层 `.arch-lens/diagrams` 只保存已批准模型；每个 Change Pack 的 `diagrams` 只保存该变更 add/modify 候选，delete 只由 change.yaml 表达。
- AC-008: 顶层和 Change Pack 的 `rendered` 都是可选、Git 忽略、严格镜像对应 diagrams 相对路径的纯 SVG 目录；init、validate 和 diff 不创建它们，完整 render 会清除陈旧 SVG。
- AC-009: `change diff` 只向 stdout/JSON 返回 base/candidate 文本差异，`change render` 只按需生成候选 SVG；旧 `change bundle` 不再公开。
- AC-010: 人工设计批准绑定候选 overlay；`change apply-model` 只在批准有效时原子提升 add/modify/delete 到顶层图集并移除候选，不复制 PlantUML 到归档。
- AC-011: 多个不重叠活动 Change Pack 可以在同一工作区创建、验证、diff 和 render；相同 canonical path 必须产生确定性冲突诊断。

## Assumptions

- 支持环境能够从 PATH 启动 Java 21 或更高版本；这与锁定 PlantUML 1.2026.6 的构建要求一致。
- 官方 GitHub release URL 可作为首次安装来源；安装完成后的日常建模不依赖网络。
- 约 28 MiB 的按版本用户缓存可接受，且显著小于捆绑完整 Java 运行时。
- Change Pack 候选路径与 canonical diagram 相对路径严格一致，足以让 CLI 在不增加第二套 DSL 的情况下组合 base 与 overlay。

## Open Questions

- [x] Q001: 是否通过系统包管理器安装？不采用；系统包管理器跨平台行为不一致且会扩大 CLI 权限边界。
- [x] Q002: 是否把 JAR 放入 npm 包或项目仓库？不采用；用户缓存避免扩大仓库资产和 npm 分发许可边界。
- [x] Q003: 是否同时安装 Java？本次不安装；明确检查 Java 21 前置条件，避免重新引入大型平台运行时分发矩阵。
- [x] Q004: rendered 是否保存 diff 或 manifest？不保存；rendered 只允许 SVG，diff 与摘要由 CLI 即时计算。
- [x] Q005: rendered 是否需要 base/candidate 子目录？不需要；顶层与 Change Pack 目录本身已经表达 approved/candidate 状态。
