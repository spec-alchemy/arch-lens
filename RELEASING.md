# 发布政策

本文件定义 Arch Lens 的发布通道、质量门禁和节奏。`CONTRIBUTING.md` 只保留摘要并链接到这里。

## 核心原则

**门禁决定「能不能发」，soak 窗口决定「最快多久能发」。** 不使用固定日历作为发版触发器：固定日期会诱导为赶进度放行未达标内容，而纯事件驱动会失去节奏约束。

## 通道

通道按**稳定性契约**划分，不按标签名划分。

| 阶段 | 版本号 | npm dist-tag | GitHub Release | 稳定性契约 |
| --- | --- | --- | --- | --- |
| alpha | `X.Y.Z-alpha.N` | `next` | 预发布 | 允许破坏性变更 |
| beta | `X.Y.Z-beta.N` | `beta` | 预发布 | 功能冻结，只收修复 |
| rc | `X.Y.Z-rc.N` | `beta` | 预发布 | 功能冻结，只收修复 |
| GA | `X.Y.Z` | `latest` | 正式 | 兼容性承诺生效 |

- `next` = 允许破坏；`beta` = 功能冻结。rc 走 `beta` 通道，因为 beta 消费者应当收到比 beta 更接近 GA 的版本。
- `latest` 在 GA 之前保持占位（当前为 `0.0.0-draft`），预览版一律不更新它。
- npm dist-tag 必须指向已存在的版本，因此 `beta` 标签在第一次发布 beta 时创建，不预先建立空标签。
- `package.json` 的 `publishConfig.tag` 默认是 `next`。beta 与 rc 发布必须显式传 `--tag beta`，否则会把预发布版本错发到 `next`。

## 版本号规则

- 预发布线内（`0.1.0-alpha.N` / `-beta.N` / `-rc.N`）允许破坏性变更，**不**因破坏性变更提升版本号：这条线尚未作出任何已发布的兼容性承诺。
- `0.1.0` 发布后进入 `0.1.x` 补丁线，只允许兼容修复；破坏性变更提升到 `0.2.0-alpha.1`。
- 稳定公开契约（`workflowProtocol`、JSON `schemaVersion`、Skill 合同）定型后才发布 `1.0.0`。
- 产品版本、`workflowProtocol` 和 `schemaVersion` 独立演进；只有对应契约发生不兼容变化时才提升协议或 Schema 版本。

## 质量门禁

以下条件是**全部**阶段共有的基线：

- 目标范围内的 AC 全部 PASS。
- 无已知 P0/P1 缺陷。
- 无在途 Change Pack：全部已归档。
- CI 全绿：`npm test`、`npm run release:check`、tag 校验工作流。
- Skill 要求的 capability 已全部发布：禁止出现「main 的 Skill 要求某个 capability、而 npm 上的 CLI 还没有它」的状态。

### alpha

基线条件满足即可发布。alpha 期允许破坏性变更，面向早期验证。

### alpha → beta（功能冻结）

- 计划内的破坏性变更必须在此前完成，进入 beta 后不再接受。
- 距上一次 alpha ≥ 3 天且期间无 P0/P1。

### beta → rc

- beta 期只接受 bug 修复、稳定性改进、文档和兼容性修复。
- 距 beta 冻结 ≥ 1 周且期间无 P0/P1。
- 无未解决的阻断性外部反馈。

### rc → GA

- 距最后一个 rc ≥ 1 周且期间无 P0/P1。
- 文档齐备：README 快速上手、CONTRIBUTING 发版流程、CHANGELOG 完整。
- 升级路径齐备：从上一个正式版（或 `0.0.0-draft`）的迁移说明。
- `latest` 切换到 GA 的确认。

## 节奏

- **alpha**：有合并内容且门禁通过即可发布，无最短间隔。
- **beta**：距上一个 beta ≥ 1 周，通常 1–2 周一个；**没有需要发布的修复时不发空版本**。
- **rc**：距 beta 冻结 ≥ 1 周。
- **GA**：距最后一个 rc ≥ 1 周且门禁通过。

即：采纳「beta 每 1–2 周」作为 soak 窗口，**不**采用「正式版每 2 周发一次」的固定日历。GA 由质量决定，不由日期决定。

## 发布清单

从合并后的干净受保护 `main` 执行，发布前先同步本地：

```sh
git checkout main && git pull --ff-only
npm run release:check
```

发布 npm（beta 与 rc 必须显式使用 `--tag beta`）：

```sh
npm publish --access public --tag next      # alpha
npm publish --access public --tag beta      # beta / rc
```

打 tag 并创建 GitHub Release：

```sh
git tag vX.Y.Z-alpha.N
git push origin vX.Y.Z-alpha.N
gh release create vX.Y.Z-alpha.N --repo spec-alchemy/arch-lens \
  --title "Arch Lens vX.Y.Z-alpha.N" --generate-notes --prerelease
```

发布后核对：

```sh
npm view @spec-alchemy/arch-lens dist-tags --json
```

GA 发布额外要求：`latest` 指向新版本，GitHub Release 不带 `--prerelease`。
