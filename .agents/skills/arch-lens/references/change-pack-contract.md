# Change Pack 合同

CLI 只做事实：解析本地文件、计算内容摘要、检查 PlantUML、渲染临时 SVG、机械记录人工决定并原子归档。CLI 不评价语义，不读取 Git，也不自动批准。

## 工作区与活动变更

- 工作区根由当前目录向上查找最近的 `.arch-lens/` 得到。
- `init` 直接在调用目录创建协议资产，不要求 Git 仓库、HEAD 或干净状态。
- `.arch-lens/` 是否被 Git 跟踪不影响任何命令；它可以被整体 gitignore。
- 每个工作区最多一个活动 Change Pack。并行变更使用独立工作区，完成后逐个整合。

## 固定文件

每个活动包包含：

```text
change.yaml
proposal.md
decisions.md
tasks.md
approval.yaml
verification.md
diagrams/**/*.puml       # 可选 add/modify overlay
rendered/**/*.svg        # render 生成的临时视觉审查材料
```

`change.yaml` 只保存协议版本、ID、本地内容基线和 diagram operations。候选 overlay 的 `.puml` 路径必须与 canonical 路径一致；delete 不保留占位图。

> 候选 SVG 是审查期间的可删除派生材料，不是归档、摘要、Git 审计或长期状态的一部分。

## 内容基线

`change.yaml` 的 `baselineDigest` 绑定排序后的：

- `.arch-lens/principles.md`
- 全部 canonical `.arch-lens/diagrams/**/*.puml`

`baselineArtifacts` 保存同一路径集合与 SHA-256，供报告变化路径。canonical 内容变化后，基线变为 stale：

```sh
arch-lens change refresh-baseline <id>
```

该命令只显式刷新本地内容基线，不合并候选、不评价语义，并使既有设计批准 stale。不得自动刷新。它在 `apply-model` 后仍然有效：若新增或修改候选 overlay，`baselineDigest` 会先变 stale，再显式刷新到当前 canonical 基底。

## 三类内容摘要

- `baselineDigest`：principles + 全部 canonical `.puml`。
- `designDigest`：baselineDigest + change.yaml + proposal + decisions + 声明的候选/已提升 `.puml` 内容。
- `completionDigest`：designDigest + tasks.md + verification.md 内容。

摘要只依赖 UTF-8 文件字节、稳定 JSON 和 SHA-256。SVG、mtime、提交哈希、patch-id 和 worktree 状态均不进入摘要。

## 设计和 apply-model

设计批准要求：

1. 设计批准前清除 proposal、decisions、tasks 和 principles 中的 `[TODO]`。
2. 全部未决问题已解决。
3. 每个新增或发生变化的 add/modify 候选都有当前新鲜 SVG；如果图与上一份 design approval 的 SHA-256 逐字节一致，可复用已有视觉审查，不要求重新 render。
4. decisions.md 为每张候选记录 `PASS`；fresh SVG 必须已实际打开并检查裁切、重叠、交叉线、密度、边界和阅读顺序。
5. `designDigest` current。

人类批准后记录：

```sh
arch-lens change record-approval <id> --stage design --reviewer <human-name>
arch-lens change apply-model <id>
```

`apply-model` 原子提升 `.puml`，删除操作移除 canonical `.puml`，清理候选 `diagrams/`、`rendered/` 和可清理的 canonical SVG 缓存。它不读取 Git，也不要求 model-only commit。

### apply-model 后修订

- 仅 `principles.md` 或提案文字变化：确认内容后运行 `change refresh-baseline <id>`，再重新记录 design approval。图未变化时可复用已有视觉证据。
- 图内容变化：在 Change Pack 写入 `modify` overlay；基线 stale 时先 `change refresh-baseline <id>`，再 `change render <id>`，逐图得到 `PASS`，重新记录 design approval，最后再次运行 `change apply-model <id>`。
- 不得通过伪造 `delete` 声明、直接改写 canonical、并行新 Pack 或提前归档绕过该路径。

## 完成批准

完成批准要求：

- design approval current；
- tasks.md 全部完成；
- proposal 中全部 AC 在 verification.md 为 PASS；
- semantic-review 显式为 pass；
- verification.md 绑定当前 designDigest。

```sh
arch-lens change record-approval <id> --stage completion --reviewer <human-name>
```

completion approval 只绑定内容摘要和人工审查者。代码提交身份、实现 patch-id、Git 祖先关系或 clean worktree 均不属于协议门禁。

## 命令语义

```text
arch-lens change new <id>
arch-lens change status [id]
arch-lens change validate <id>
arch-lens change diff <id>
arch-lens change render <id>
arch-lens change refresh-baseline <id>
arch-lens change apply-model <id>
arch-lens change record-approval <id> --stage design|completion --reviewer <name>
arch-lens change evidence <id>
arch-lens change archive <id>
```

- `status`/`validate`/`evidence` 只报告本地内容事实，不读取 Git。
- `diff` 比较 canonical 文本与候选 overlay，不落盘。
- `render` 使用锁定受管 PlantUML 刷新候选 SVG 审查材料。
- `record-approval` 只记录当前会话中人类已经作出的决定，不自行判断或批准。
- `archive` 在 completion approval current 时原子移动 Change Pack。
- 已删除的 `archive-evidence` 和 Git/patch-id 能力不得重新进入公开接口。
