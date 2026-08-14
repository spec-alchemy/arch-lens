# Design Decisions

## D001: 生命周期状态只由资产位置与批准记录表达

### Context

候选 overlay 被原子提升时会保留 PlantUML 原始字节。如果图标题包含临时阶段词，提升后正式图仍会错误显示为候选，而自动改写标题又会破坏被批准字节与摘要的一致性。

### Decision

图标题只描述建模问题，不编码 Candidate、Draft、Approved 或类似生命周期状态。候选与正式边界由 Change Pack `diagrams/`、顶层 `diagrams/` 和 `approval.yaml` 表达。修复现有两处标题，并在生成与审查规则中前置检查。

### Alternatives

- `apply-model` 自动删除状态前缀：拒绝，会修改已经批准的候选字节并让摘要语义复杂化。
- CLI 禁止标题中的全部 Candidate/Draft/Approved 单词：拒绝，这些词可以合法描述工作流概念，纯文本禁词会产生误报。
- 保留标题并依赖目录解释：拒绝，人类首先看到的是图标题，误导仍然存在。

### Consequences

正式图和目录状态一致，批准摘要继续绑定原始字节，CLI 不承担语义判断。Skill 必须在候选生成和审查时识别“图自身的阶段状态”与“图中描述的工作流概念”。

## D002: 全局 CLI 使用打包快照而不是开发链接

### Context

本地路径的全局 npm 安装创建了指向开发仓库的 symlink，导致全局工具受未提交编辑和仓库位置影响。

### Decision

在测试和提交完成后生成 npm tarball，并从 tarball 重新安装 Volta 全局 CLI。通过真实路径、capabilities 和无全局 Skill 检查验收。

### Alternatives

- 保持 live symlink：拒绝，它适合开发联调，不适合作为稳定全局入口。
- 发布到 npm registry 再安装：拒绝，项目仍为未公开的 `0.0.0-draft`。

### Consequences

全局 CLI 成为可复现快照；后续仓库变化不会自动同步，需要在明确更新时重新打包安装。
