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

发布的最后一个人工动作是**从受保护的 `main` 推送版本附注 tag**。随后 `.github/workflows/release.yml` 完成门禁、OIDC 直发 npm、检查版本和 provenance、创建 GitHub Release。PR 只运行测试，不发布。没有 `NPM_TOKEN`，不进行逐版 `npm stage approve`；维护者的 npm 账户仍保留 2FA。

- GitHub 的 `v*` tag 规则只允许组织管理员创建版本 tag，并禁止任何人更新或删除既有版本 tag。当前为单维护者仓库；管理员能够管理规则，保护仍依赖账号安全和发布前审查。
- CI 要求 tag 与 `package.json` 版本完全相同，且其 commit 仍是 `main` 当前 HEAD。只接受 `X.Y.Z-alpha.N`、`X.Y.Z-beta.N`、`X.Y.Z-rc.N` 和 `X.Y.Z`，预发布序号从 1 开始；未知通道不得落入 `latest`。
- npm Trusted Publisher 只绑定 `spec-alchemy/arch-lens` 的 `release.yml`，启用直接 `npm publish`；仅 publish job 有 `id-token: write`。发布使用固定 npm 11.15.0、GitHub 托管运行器及 provenance，不依赖长期 npm 密钥。
- 首次真实 OIDC 直发并核实 provenance **之后**，将该包的 npm Publishing access 设为 **Require two-factor authentication and disallow tokens**，关闭传统 token 发布旁路。设置前保留现有手工发布应急方式；此设置不影响 Trusted Publisher。不得为验证而制造空版本。

## 发布清单

### 1. 准备发布提交

根据上述质量门禁与观察期政策决定目标通道和版本。在 PR 中更新 `package.json`、`package-lock.json`、`CHANGELOG.md` 和必要文档，确保已归档所有在途 Change Pack，再合入受保护的 `main`。不要提前创建 tag；不要为不同通道复用版本号。

### 2. 从当前 main 创建附注 tag

从干净且已同步的 `main` 执行，以下以 alpha 为例；beta、rc、GA 使用相应版本号：

```sh
git checkout main && git pull --ff-only
npm run release:check
git tag -a vX.Y.Z-alpha.N -m "Arch Lens vX.Y.Z-alpha.N"
git push origin vX.Y.Z-alpha.N
```

tag 必须指向该版本的 **release prep commit**，同时仍为当前 `main` HEAD。版本 tag 不可移动或删除。若 tag 打错、门禁失败或 `main` 已前进，应分析原因并准备新的版本/提交；不得重写已推送 tag 或跳过门禁。

### 3. 等待 CI 正式发布与核对

`test` job 通过后，`publish` job 确认 npm 尚无相同版本，并执行 `npm publish --provenance --access public --tag <dist-tag>`：alpha 显式使用 `--tag next`，beta/rc 使用 `--tag beta`，GA 使用 `--tag latest`。`release` job 等待 npm 注册表显示精确版本、预期 dist-tag 和 provenance，再为原 tag 创建 GitHub Release；alpha/beta/rc 为 prerelease，GA 为正式版。

核对 npm、provenance、GitHub Release 与 Actions 运行记录：

```sh
npm view @spec-alchemy/arch-lens dist-tags --json
npm view @spec-alchemy/arch-lens@X.Y.Z-alpha.N dist.attestations --json
gh release view vX.Y.Z-alpha.N --repo spec-alchemy/arch-lens
gh run list --workflow release.yml --limit 5
```

在 npm 的包页进一步核对 provenance 对应的仓库、工作流与提交。首次真实自动直发通过这些检查后，按上文关闭传统 token 发布渠道；不要提前关闭。

### 失败恢复

- 测试或 npm 发布失败、但注册表没有该版本：检查 Actions 日志、配置与 tag 状态；已推送的 tag 不改写。如需修改代码或版本，创建新的 release prep commit 和新版本 tag。
- **npm 已发布、GitHub Release 失败**：从 Actions 页面只重试失败的 `release` job，它会重新核对 npm 后创建或确认已有 Release。不要重试整个工作流，不要再次 `npm publish` 同一版本；必要时核实 npm 元数据后手工用 `gh release create <tag> --verify-tag` 补建。
- npm 已有同版本时，`publish` job 会拒绝重发；网络错误、注册表状态不明或 provenance 缺失也会失败而不是假定成功。先查清真实状态，不得删除/移动 tag 规避校验。
