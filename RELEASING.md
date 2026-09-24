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
- tag 统一使用**附注 tag**（`git tag -a`），保留 tagger 与时间信息；不要混用轻量 tag。

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

## 发布方式

Arch Lens 使用 npm staged publishing，而不是 CI 直接发布：

- GitHub Actions 只在 tag 指向受保护 `main` 当前 HEAD、tag 与 `package.json` 版本一致且全部门禁通过后执行 `npm stage publish`。
- npm Trusted Publisher 只授予 `createStagedPackage`，不授予直接发布权限；仓库和 GitHub 组织不保存 `NPM_TOKEN`。
- OIDC 自动提供 provenance。最终发布必须由维护者在 npm 端检查 staged package，并用交互式 2FA 批准。
- staged publishing 只把构建与批准分离，**不会降低**供应链攻击的影响；因此不得把它描述为比直接发布“更安全”，也不得放宽代码审查和 tag 控制。

当前发布流程要求 Node.js 22.14+ 与 npm 11.15+。本地可通过 `npx npm@11.15.0` 使用相同版本，不需要在仓库或 shell 中长期保存 npm token。

## 发布清单

### 1. 准备发布提交

在受保护分支上更新 `package.json`、`CHANGELOG.md` 和适用文档，完成全部质量门禁后合入 `main`。不要提前创建 tag。

### 2. 在当前受保护 main 上创建附注 tag

从合并后的干净受保护 `main` 执行：

```sh
git checkout main && git pull --ff-only
npm run release:check
git tag -a vX.Y.Z-alpha.N -m "Arch Lens vX.Y.Z-alpha.N"
git push origin vX.Y.Z-alpha.N
```

tag 必须指向该版本的 **release prep commit**（把 `package.json` 版本号改到目标版本的那个提交），并且该提交仍必须是当前受保护 `main` 的 HEAD。工作流会同时校验 tag 名与 `package.json` 版本，以及 tag commit 是否仍等于 `origin/main`。

### 3. 让 GitHub Actions 暂存包

tag push 触发 `.github/workflows/release.yml`。`Stage npm package` job 会：

1. 根据版本号推导 npm dist-tag 并显式传入 `--tag`：alpha 使用 `--tag next`，beta/rc 使用 `--tag beta`，GA 使用 `--tag latest`。
2. 使用 GitHub OIDC 调用 `npm stage publish`，不读取任何 npm secret。
3. 将包暂存到 npm，等待维护者批准。

示例工作流输出：

```text
Staging 0.1.0-alpha.N with npm dist-tag: next
```

### 4. 检查并批准 staged package

在本地检查暂存版本：

```sh
npx npm@11.15.0 stage list @spec-alchemy/arch-lens
npx npm@11.15.0 stage view <stage-id>
npx npm@11.15.0 stage download <stage-id>
```

核对 tarball 内容、版本、dist-tag 和 provenance 后，使用交互式 2FA 批准：

```sh
npx npm@11.15.0 stage approve <stage-id>
```

如果检查失败，拒绝暂存包而不是覆盖已发布版本：

```sh
npx npm@11.15.0 stage reject <stage-id>
```

### 5. 创建 GitHub Release 并核对

npm 批准成功后，为同一个 tag 创建 GitHub Release：

```sh
gh release create vX.Y.Z-alpha.N --repo spec-alchemy/arch-lens \
  --title "Arch Lens vX.Y.Z-alpha.N" --generate-notes --prerelease
npm view @spec-alchemy/arch-lens dist-tags --json
```

alpha 应更新 `next`；beta/rc 应更新 `beta`；GA 应更新 `latest` 且 GitHub Release 不带 `--prerelease`。
