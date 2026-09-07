# Change Pack 合同

Change Pack 为架构敏感变更保存决策上下文和实施证据，但不复制 PlantUML 业务模型。没有建模影响的普通代码修改无需创建 Change Pack。

## 固定资产

```text
.arch-lens/
├── principles.md
├── diagrams/**/*.puml              # 已批准模型
├── rendered/**/*.svg               # 必需、受版本控制的标准镜像
├── changes/
│   ├── <change-id>/
│   │   ├── change.yaml
│   │   ├── proposal.md
│   │   ├── decisions.md
│   │   ├── tasks.md
│   │   ├── approval.yaml
│   │   ├── verification.md
│   │   ├── diagrams/**/*.puml      # 待批准 add/modify overlay
│   │   └── rendered/**/*.svg       # add/modify 候选的必需标准镜像
│   └── archive/
```

- `principles.md`：项目目的、建模边界、决策原则和质量门禁。
- `proposal.md`：问题证据、目标、非目标、AC、假设和未决问题。
- `decisions.md`：取舍的上下文、决定、替代方案和后果。
- `tasks.md`：实现清单，不承载设计语义。
- `approval.yaml`：CLI 追加的人工决定和内容摘要，禁止手工编辑。
- `verification.md`：AI 的实现语义审查、AC 结果、测试证据和残余风险。
- 顶层 `diagrams/`：唯一已批准业务模型。
- Change Pack `diagrams/`：未批准候选，不是长期副本；提升后删除，归档不保留 `.puml`。
- 两处 `rendered/`：受版本控制、只含 SVG，并严格镜像相邻 diagrams 的路径。SVG 只能由 CLI 使用锁定受管 PlantUML 生成；它是派生审查产物，PlantUML 仍是唯一业务模型。

## change.yaml

```yaml
schemaVersion: 1
workflowProtocol: 1
id: notification-retry-policy
baseCommit: <full-git-commit>
createdAt: <UTC-ISO-8601>
diagrams:
  - path: .arch-lens/diagrams/notification/retry.state.puml
    operation: add
```

ID 使用最长 64 字符的小写 kebab-case。每个变更至少声明一张图；operation 只使用 `add`、`modify`、`delete`。add/modify 的候选位于 `<pack>/diagrams/<path-after-.arch-lens/diagrams/>`，并具有 `<pack>/rendered/` 下的同路径 SVG；delete 不得保留候选 `.puml` 或 SVG。每个 Git worktree 最多一个活动 Change Pack；并行变更使用独立 branch/worktree，目标分支逐个集成。

## Markdown 标识

- 验收标准：`- AC-001: ...`
- 未决问题：`- [ ] Q001: ...`；解决后改为 `[x]` 并写结论。
- 决策：`## D001: ...`，包含 Context、Decision、Alternatives、Consequences。
- 任务：`- [ ] T001 [AC-001] ...`
- 视觉审查：`- .arch-lens/diagrams/path.puml: PASS|CONCERNS|FAIL - evidence`
- 验证：`- AC-001: PASS|FAIL|NOT-RUN - evidence`

`verification.md` 还必须声明：

```markdown
<!-- arch-lens: semantic-review=pass|concerns|fail|pending -->
<!-- arch-lens: design-digest=<sha256>|pending -->
<!-- arch-lens: implementation-commit=<full-commit>|pending -->
```

implementation commit 是被审查的代码提交。它之后只能提交 `tasks.md` 和 `verification.md` 证据；completion approval 再绑定包含证据的当前 HEAD，避免 commit 哈希自引用。

## 摘要和门禁

设计摘要绑定 `principles.md`、change.yaml、proposal.md、decisions.md、声明的候选 `.puml`/SVG 字节和 baseCommit；artifact 使用 logical canonical path，因此批准前读取 overlay，提升后读取顶层同一路径，摘要保持一致。不绑定 tasks.md。修改 tasks 可细化实施，修改其他绑定资产会让批准 stale。

设计批准前比较 `baseCommit..HEAD` 的项目原则和顶层 `.puml`。发现外部模型变化时状态为 stale；先用 Git 同步目标分支，再显式运行 `arch-lens change refresh-base <id>`。该命令只更新 baseCommit，不合并候选、不判断语义，并使既有批准 stale。

设计批准要求每张 add/modify 图具有 PASS 视觉审查记录。批准后运行 `change apply-model`：原子应用 add/modify/delete 的 `.puml`/SVG 对并移除候选。再把项目原则、批准图、标准 SVG、Change Pack 和 approval.yaml 形成独立 model-only commit。CLI 会从 Git 历史确认该 commit 只包含允许路径。

完成批准要求：设计批准 current、model-only commit 可追溯、全部任务完成、全部 AC 为 PASS、semantic review 为 pass、verification 绑定有效设计摘要和实现祖先 commit、工作区干净。

## CLI 只做事实

```text
arch-lens change new <id>
arch-lens change status [id] [--json]
arch-lens change validate <id> [--json]
arch-lens change diff <id> [--json]
arch-lens change render <id> [--json]
arch-lens change refresh-base <id> [--json]
arch-lens change apply-model <id> [--json]
arch-lens change record-approval <id> --stage design|completion --reviewer <name>
arch-lens change evidence <id> [--json]
arch-lens change archive <id> [--json]
```

`status` 和 `validate` 不做语义结论，只报告基线、SVG 哈希、viewBox、宽高、宽高比和稳定风险诊断；`diff` 只返回 base/candidate 文本差异；`render` 使用锁定受管运行时生成标准候选 SVG；`refresh-base` 只更新已同步 HEAD 的基线事实；`apply-model` 只在现有人工批准有效时执行确定性文件提升；`evidence` 只读取 Git、任务和 AC 事实；`record-approval` 只记录当前会话中人类已经作出的决定。
