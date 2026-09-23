# Contributing to Arch Lens

Arch Lens 当前为 `0.1.0-alpha.3` 外部预览版。欢迎通过 issue 和 pull request 参与；预览版会持续明确 CLI、Skill、PlantUML 合同和 Change Pack 协议的兼容范围。

## 开发环境

需要 Node.js 20+ 和 Java 21+。从干净 clone 开始运行：

```sh
npm ci
npm test
node bin/arch-lens.js capabilities --json
node bin/arch-lens.js init --json
node bin/arch-lens.js diagrams check
npm pack --dry-run
```

测试必须继续使用 Node 内置的 `node:test` 和 `node:assert/strict`。CLI 测试通过 `process.execPath` 调用真实入口，并在临时 Git 仓库中运行，不得写入本仓库工作区。

## 变更工作流

- 普通代码、测试或文档修复不需要为了形式创建业务模型。
- 任何持久 `.puml` 修改必须进入 Change Pack。Skill 负责语义建模和审查；CLI 只验证文件、Git、摘要、Schema 和 PlantUML 事实。
- 人类明确批准设计后，才可记录 design approval、应用候选模型并形成独立 model-only commit。
- 实现完成后，AI 必须对照批准模型、代码 diff、测试和 AC 做语义审查；人类明确验收后才可记录 completion approval 并归档。
- PlantUML 文件保持自包含，并作为唯一可编辑业务模型；Change Pack 保存上下文和证据。
- `approval.yaml` 的 `reviewer` 是稳定的人类标识：同一审查者始终使用同一写法。本仓库统一写作 `BeaconSage`，不要混用 `beacon.sage` 等变体。

## 分支与合并

`main` 必须始终可构建且 CI 通过。不使用长期 `develop` 分支。分支命名为：

```text
feature/<change-id>-<slug>
fix/<slug>
docs/<slug>
release/v<version>
hotfix/<version>-<slug>
```

模型敏感变更默认在一个 PR 中保留候选模型、model-only commit、实现、验证和归档的提交顺序；高风险变更可拆成模型 PR 与实现 PR。仓库使用 rebase merge，不使用 squash 或 merge commit，以保留这些独立提交。

rebase merge 会重写被合并提交的哈希。集成到 `main` 之后，Change Pack 归档记录里的 commit 引用（`verification.md` 的 `implementation-commit`、`approval.yaml` 的 `implementationCommit` 与 `reviewedImplementationCommit`）可能不再从 `main` 可达，也可能已被 Git 回收。归档包不参与 CLI 门禁校验，这些引用只作为写入时的审计线索保留，不是可长期反查的定位符；集成后核对以集成结果的内容为准。需要长期可核对的证据时，在 PR 描述或 Release Notes 中记录集成前后的对应关系。

## 版本与发布

发布通道、质量门禁、soak 窗口和发版清单见 [RELEASING.md](RELEASING.md)。要点：

- 通道按稳定性契约划分：alpha → npm `next`（允许破坏）；beta 与 rc → npm `beta`（功能冻结）；GA → npm `latest`。预览版一律不更新 `latest`。
- 节奏：门禁决定「能不能发」，soak 窗口决定「最快多久能发」。alpha 有合并内容且门禁通过即可发；beta 距上一次 ≥ 1 周、通常 1–2 周一个；GA 距最后一个 rc ≥ 1 周且门禁通过。
- 预发布线内（`0.1.0-alpha.N` / `-beta.N` / `-rc.N`）允许破坏性变更，且不因破坏性变更提升版本号；`0.1.0` 发布后 `0.1.x` 只允许兼容修复，破坏性变更提升到 `0.2.0-alpha.1`；稳定公开契约后才发布 `1.0.0`。
- 产品版本、`workflowProtocol` 和 JSON `schemaVersion` 独立演进；只有对应契约发生不兼容变化时才提升协议或 Schema 版本。
- 每次发布必须更新 `CHANGELOG.md`、通过完整 CI 并验证 npm 包清单。带正式版本号的发布从干净的受保护 `main` 创建 `vX.Y.Z` 标签。

常规 CI 只执行验证，不持有 npm 发布权限。预览包从合并后的干净 `main` 显式发布，并在发布前运行 `npm run release:check`；GitHub Release 必须绑定同名 `vX.Y.Z` 标签。

本次 `0.1.0-alpha.3` 发布命令为：

```sh
npm run release:check
npm publish --access public --tag next
git tag -a v0.1.0-alpha.3 -m "Arch Lens v0.1.0-alpha.3"
git push origin v0.1.0-alpha.3
gh release create v0.1.0-alpha.3 --repo spec-alchemy/arch-lens --title "Arch Lens v0.1.0-alpha.3" --generate-notes --prerelease
```

提交 PR 即表示贡献按本仓库的 [EPL 2.0](LICENSE) 许可提供。
