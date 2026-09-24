# Apply Change

1. 运行 capabilities 和 `arch-lens change status <id> --json`。
2. 要求 baseline current、design approval current、候选 `.puml` 已 `apply-model` 且 `modelApplied=true`；否则停止代码修改并返回 review model。
3. 读取批准的 proposal、decisions、PlantUML 和 tasks，实施引用 AC 的最小代码变化。
4. 不在实现中悄悄引入模型未讨论的新 Actor、规则归属、状态、流程、职责或接口。
5. 可根据发现细化 tasks，但不得用 tasks 改写已批准设计。
6. 若实现证据推翻设计，先停止代码扩展，更新绑定资产并重新走设计批准。
7. 运行项目测试和契约验证，记录精确命令、退出结果和可定位证据。Git commit 不是 Arch Lens 协议要求；仓库若自行使用 Git，由其 CI/流程决定。

完成实现和证据收集后进入 review implementation。
