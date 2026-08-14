# Contributing to Arch Lens

Arch Lens 目前处于 `0.0.0-draft`。欢迎通过 issue 和 pull request 参与；首个预览版本会明确 CLI、Skill、PlantUML 合同和 Change Pack 协议的兼容范围。

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

## 版本与发布

- draft 阶段保持 `0.0.0-draft`，不创建 `v0.0.0-draft` 标签、GitHub Release 或 npm 包。需要不可变引用时使用 `snapshot-YYYY-MM-DD`。
- 首个外部预览版为 `0.1.0-alpha.1`，之后按 `alpha.N`、`beta.N`、`rc.N`、`0.1.0` 演进。
- `0.1.x` 只包含兼容修复；pre-1.0 的破坏性产品变化提升到 `0.2.0`；稳定公开契约后才发布 `1.0.0`。
- 产品版本、`workflowProtocol` 和 JSON `schemaVersion` 独立演进；只有对应契约发生不兼容变化时才提升协议或 Schema 版本。
- 每次发布必须更新 `CHANGELOG.md`、通过完整 CI、验证 npm 包清单，并从干净的受保护 `main` 创建 `vX.Y.Z` 标签。

提交 PR 即表示贡献按本仓库的 [EPL 2.0](LICENSE) 许可提供。
