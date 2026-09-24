# Contributing

## 开发环境

- Node.js 20 或更高版本。
- Java 21 或更高版本，只在需要运行真实 PlantUML 时使用；`npm test` 的 CLI 测试使用锁定的测试替身。
- 不需要 Git 仓库即可运行 Arch Lens，但本仓库自身的贡献流程仍可独立使用 Git 和 GitHub。

```sh
npm ci
npm test
npm run release:check
```

## 测试规范

测试必须继续使用 Node 内置的 `node:test` 和 `node:assert/strict`。CLI 测试通过 `process.execPath` 调用真实入口，并在临时目录中运行，不得写入本仓库工作区。

每项 CLI 行为修改都必须同时覆盖成功与失败路径：

- `init` 必须验证非 Git 目录、幂等性、不覆盖行为和 `.arch-lens/` 可被整体忽略。
- `install-agent` 必须覆盖 project/global 范围与无效选项组合。
- Change Pack 必须覆盖内容基线 stale、显式 refresh、fresh SVG 视觉门禁、apply-model、内容型 completion、归档和已删除命令。
- 测试不得依赖 Git HEAD、commit、patch-id、clean worktree 或 canonical SVG 镜像。

## 变更流程

- 任何持久 `.puml` 修改必须进入 Change Pack。Skill 负责语义建模和审查；CLI 只验证本地文件、内容摘要、Schema、PlantUML facts 和人工审批。
- 人类明确批准设计后，才可记录 design approval、运行 `change apply-model` 开始实现。
- 设计批准绑定 `baselineDigest`、change.yaml、proposal、decisions 和候选 `.puml`；SVG 仅在审查期间要求 fresh。
- 实现前必须检查 `change status <id> --json`：baseline current、design approval current、modelApplied=true。
- 实现后对照批准模型、代码 diff、测试和 AC 完成语义审查；只有人类当前会话明确验收后才记录 completion approval。
- completion approval 绑定 designDigest、tasks 和 verification 内容，不要求 commit、patch-id 或 clean worktree。

## 仓库自身的提交与集成

Arch Lens 产品 CLI 不读取或解释 Git。本仓库若需要保留模型提交、实现提交、rebase merge 或发布审计，必须使用仓库专用 CI/脚本和贡献规范，不得把这些要求反向写入 CLI、Skill 或生成项目模板。

仓库特有的发版步骤见 [RELEASING.md](RELEASING.md)。预览包从合并后的 `main` 显式发布，并在发布前运行 `npm run release:check`。

## 许可

提交 PR 即表示贡献按本仓库的 [EPL 2.0](LICENSE) 许可提供。
