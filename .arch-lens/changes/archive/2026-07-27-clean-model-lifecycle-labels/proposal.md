# Change Proposal

## Problem And Evidence

两张已经通过人工批准并提升到顶层图集的正式 PlantUML 仍在标题中使用 `Candidate -` 前缀，使权威模型视觉上继续表现为候选。初始化序列图还把已经删除的 `bundle` 写成正常运行时入口。当前 PlantUML 合同没有明确禁止用标题编码工作流阶段，因此同类状态泄漏可能再次发生。

全局 `arch-lens` 当前由 Volta live symlink 直接指向开发仓库，未提交编辑会立即改变全局命令；顶层 `.arch-lens/rendered/` 还保留可再生成的旧 SVG。二者不改变模型真相，但都不适合作为本轮清理后的稳定交付状态。

## Goals

- 正式图标题只描述图回答的问题，不再表现候选、草案或已批准状态。
- 初始化序列图不再引用已删除的公开命令。
- Skill 合同与审查流程阻止生命周期状态再次泄漏进标题，同时保持 CLI 只处理确定性事实。
- 全局 CLI 使用当前 npm tarball 的固定安装，不再 live-link 开发仓库；不安装全局 Skill。
- 删除不需要的本地 SVG 镜像，继续允许 IDE 直接预览。

## Non-goals

- 不修改临时 iws-server 的候选图、Markdown、Change Pack 或 Git 工作区。
- 不编辑已经归档的历史 Change Pack，即使其中记录了当时的旧术语。
- 不禁止图在业务语义中讨论“候选设计”；只禁止标题把图自身标记为 Candidate、Draft 或 Approved。
- 不让 CLI 判断标题是否语义正确，也不增加新的公共命令。

## Acceptance Criteria

- AC-001: 两张正式图的标题移除 `Candidate -`，且图的问题、元素、关系和消息语义保持不变。
- AC-002: 初始化序列图不再提及已删除的 `bundle`，改用不绑定废弃命令名的模型检查与渲染表述。
- AC-003: PlantUML 合同和模型审查工作流明确要求标题不得编码 Candidate、Draft、Approved 等生命周期状态，工作流状态只由目录和批准记录表达。
- AC-004: 静态 Skill 契约测试覆盖标题状态规则，全部 Node 测试和正式 PlantUML 检查通过。
- AC-005: Volta 全局 CLI 从当前 npm tarball 安装，解析路径不再指向开发仓库，版本、workflowProtocol 和 feature 列表与项目一致，且全局 Skill 仍不存在。
- AC-006: `.arch-lens/rendered/` 不存在或为空，Git 工作区保持干净，IDE 预览仍是默认查看方式。

## Assumptions

- `Candidate -` 只是一项候选阶段遗留，不表达需要保留的业务语义。
- 当前五张正式图回答不同问题；本次只纠正状态与接口文字，不借机重构图集。
- 本机 Volta/npm 支持从本地 tarball 安装 CLI，且该操作不会创建全局 Skill。

## Open Questions

- [x] Q001: 图中是否可以出现“候选设计”？可以；当它描述 Change Pack 工作流中的业务概念时保留，只移除把图自身标为候选的标题前缀。
- [x] Q002: 是否保留顶层 SVG？不保留；它们可再生成，当前使用 IDE 可直接预览 `.puml`。
