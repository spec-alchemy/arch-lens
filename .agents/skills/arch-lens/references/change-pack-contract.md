# Change Pack 合同

本文件是 Change Pack、内容基线、批准、视觉门禁、reconcile 与 delete 语义的唯一规范来源。CLI 只报告本地文件事实；Skill 负责建模、审查和执行顺序。

## 四类事实与派生状态

- `B` baseline：创建 Change Pack 时记录的 principles 与 canonical `.puml` 内容事实。
- `D` desired：每张声明图希望最终存在的字节；不存在时表示 desired absent。
- `A` approval history：`approval.yaml` 中按时间追加的人类 design/completion 决定。
- `C` canonical：当前 `.arch-lens/diagrams/**/*.puml` 的真实内容。

不持久化 `applied`、`promoted`、`revision` 或逐图状态。`C == D`、effective operation、`modelApplied` 和 diff 都从四类事实派生。

`change.yaml` 字段保持不变。`add` 与 `modify` 都表示 desired present；`delete` 表示 desired absent。原始 operation 不决定生命周期。仓库仍默认最多三张持久图。

## Desired 解析顺序

对每个合法声明：

1. `delete`：desired absent。
2. 存在真实 overlay `.puml`：desired 为 overlay 字节。
3. 无 overlay，且上一份 design approval 绑定当前 canonical：desired 为当前 canonical 字节。
4. 其他情况：`DIAGRAM_DESIRED_UNRESOLVED`，不得推断为 absent，也不得写入 canonical。

同一路径重复、未知 operation、非法路径、symlink 和特殊文件继续失败。delete 不保留占位 overlay。

## 内容基线

`baselineDigest` 绑定创建时的 `.arch-lens/principles.md` 与全部 canonical `.puml`。`baselineArtifacts` 保存同一路径集合和 SHA-256。

freshness 只回答：

- principles 是否变化；
- 是否有未声明 canonical 变化；
- 已声明 canonical 是否属于 baseline 或任一历史 design approval manifest。

新 overlay、整包 apply 状态和 proposal/decisions 变化都不影响 freshness。已声明 canonical 若既不属于 baseline，也不属于历史 approval manifest，则为第三种未知内容，必须失败。

`refresh-baseline` 只在存在外部 principles/canonical drift 时执行 `B := C`，使 design approval stale，不自动批准、不合并 overlay。apply 后或仅 proposal/decisions/overlay 变化时无需 refresh。

## 三类摘要

- `baselineDigest`：principles + canonical `.puml`。
- `designDigest`：baselineDigest + change.yaml + proposal + decisions + 逐图 desired bytes；desired absent 记为 null。
- `completionDigest`：designDigest + tasks + verification。

摘要只依赖 UTF-8 文件字节、稳定 JSON 和 SHA-256。SVG、mtime、Git 身份和 worktree 状态不进入摘要。

## 视觉证据与设计批准

- 整组 desired 与上一份 design approval 逐图一致时，可复用已有视觉证据。
- 任一张图的 desired 字节变化时，整组 present 图必须 fresh render，并逐图在 decisions.md 记录 `PASS`。
- delete 没有 SVG。
- 设计批准前清除 `[TODO]`、解决全部 Q，并使 `designDigest` current。
- 人类在当前会话明确批准后，才可运行 `record-approval --stage design`。

## apply-model 与修订

`apply-model` 是幂等 reconcile：

- 计算 `C -> D`，只写入或删除实际差异；
- 无差异时成功返回 `applied: []`；
- 未修订图不需要 overlay；
- 全部写入使用原子目录替换；
- 成功后清理候选 overlay、候选 SVG 和对应预览缓存。

apply 后若仅修改 proposal/decisions，只需重新 design approval。若修改图，可保留原 operation 字段，只需写 present overlay；未修订图复用历史 approval 绑定的 canonical。整组重新审查并批准后再次 apply。

delete 在 apply 后不可逆。产品不提供 trash、tombstone 或恢复命令；用户若自行保留字节，可重新提交 present overlay，但不承诺自动恢复。

## 完成批准与归档

完成批准要求 design approval current、tasks 全部完成、全部 AC 为 PASS、`semantic-review=pass`，且 verification 绑定当前 designDigest。

```sh
arch-lens change record-approval <id> --stage completion --reviewer <human-name>
arch-lens change archive <id>
```

completion 只绑定内容摘要和人工审查者；代码提交身份、patch-id、Git 祖先关系和 clean worktree 均不属于协议。

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

`status` / `validate` / `evidence` 只报告本地事实；`diff` 展示 outstanding `C -> D`，无差异图不进入 `files`；`render` 只在整组视觉证据不可复用时渲染；`apply-model` 幂等 reconcile。已删除的 Git/patch 命令不得重新进入公开接口。
