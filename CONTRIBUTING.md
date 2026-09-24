# Contributing

## 开发环境

- Node.js 20 或更高版本。
- Java 21 或更高版本，仅在需要真实 PlantUML 时使用。
- Arch Lens 产品不要求 Git；仓库自身的协作仍可使用 Git 和 GitHub。

```sh
npm ci
npm test
npm run release:check
```

## 测试规范

- 使用 Node 内置 `node:test` 和 `node:assert/strict`。
- CLI 测试通过 `process.execPath` 调用真实入口，并在临时目录运行。
- 行为修改同时覆盖成功与失败路径。
- `init` 覆盖非 Git 目录、幂等性、不覆盖行为和整体 gitignore。
- `install-agent` 覆盖 project/global 与无效选项组合。
- Change Pack 覆盖 desired 解析、幂等 reconcile、baseline drift、视觉证据复用、delete、completion 和归档。
- 不依赖 Git HEAD、commit、patch-id、clean worktree 或持久 SVG 缓存。

## 变更流程

- 持久 `.puml` 修改进入 Change Pack；Skill 负责语义建模与审查。
- 人类明确批准设计后，才可记录 design approval 并运行 `change apply-model`。
- 实现前检查 `change status <id> --json`。
- 实现后对照批准模型、代码 diff、测试和 AC 完成语义审查。
- 人类验收后才记录 completion approval 并归档。
- 完整规则见 `.agents/skills/arch-lens/references/change-pack-contract.md`。

仓库自身若需要提交顺序、rebase、Release 或审计，由专用 CI/脚本处理。发版步骤见 [RELEASING.md](RELEASING.md)。

## 许可

提交 PR 即表示贡献按本仓库的 [EPL 2.0](LICENSE) 许可提供。
