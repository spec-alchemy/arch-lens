# Review Model

1. 读取 `change status <id> --json`、`validate` 和 `diff`。
2. 按合同判断视觉证据是否可整组复用；不可复用时运行 `change render`。
3. 打开整组 fresh SVG，逐图检查裁切、重叠、交叉线、密度、边界和阅读顺序，并核对 note facts。
4. 在 decisions.md 记录每张 present 图的 `PASS|CONCERNS|FAIL`。
5. 审查视图预算、跨图语义和 proposal/decisions 的取舍与 AC。
6. 向人类呈现 SVG、diff、理由、替代方案、风险和未决问题。
7. 存在 CONCERNS/FAIL 时收敛并复审，不请求批准。
8. 只有全部 present 图 PASS 且人类在当前会话明确批准后，记录 design approval。
9. 运行 `change apply-model <id>`，再确认 `designApproval=current` 且 `modelApplied=true`。
10. 规则细节以 `references/change-pack-contract.md` 为准。
