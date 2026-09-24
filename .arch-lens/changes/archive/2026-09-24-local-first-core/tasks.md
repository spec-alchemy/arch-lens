# Implementation Tasks

- [x] T001 [AC-001] 删除 `persistence` / `renderedSvg` / `config.yaml` 模式开关、组合校验和 Git/audit profile 能力。
- [x] T002 [AC-002] 将工作区定位改为从 `.arch-lens/` 向上发现，并让 `init` 与核心命令在非 Git 目录工作。
- [x] T003 [AC-003] 用 `baselineDigest` 替换 baseCommit，绑定 `principles.md` 与 canonical `.puml`，实现 `change refresh-baseline` 和 stale 检测。
- [x] T004 [AC-004] 用内容型 `designDigest` 绑定批准资产，保留 fresh 候选 SVG 与 PASS 视觉审查门禁但不把 SVG 写入摘要。
- [x] T005 [AC-005] 让 `apply-model` 原子提升 `.puml`、清理临时 SVG，并移除 model-only commit 要求。
- [x] T006 [AC-006] 用内容型 `completionDigest` 绑定 designDigest、tasks、verification 和人类验收，移除提交与 patch-id 门禁。
- [x] T007 [AC-007] 删除 `archive-evidence`、Git 相关 capabilities 和 CLI 事实，更新 status/validate/evidence/documentation 与所有测试。
- [x] T008 [AC-008] 删除 4 张 Git/运行时中心图并提升两张 local-first 候选图，使持久模型收敛为三张。
