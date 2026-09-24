# Apply Change

1. 运行 capabilities、status 和 validate。
2. 要求 baseline current、design approval current 且 `modelApplied=true`；否则返回 review model。
3. 读取批准的 proposal、decisions、PlantUML 和 tasks，实施最小代码变化。
4. 不引入批准模型未讨论的新 Actor、规则归属、状态、流程、职责或接口。
5. 可按发现细化 tasks，但不得用 tasks 改写批准设计。
6. 设计变化时返回模型审查；按合同判断是否需要 refresh、render、重批和再次 apply。
7. 运行项目测试，记录精确命令、结果和可定位证据。
8. 规则细节以 `references/change-pack-contract.md` 为准。

完成后进入 review implementation。
