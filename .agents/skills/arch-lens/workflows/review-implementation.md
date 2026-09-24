# Review Implementation

1. 运行 `arch-lens change evidence <id> --json`，读取内容摘要、任务和 AC facts。不要要求 commit、patch-id 或 Git 祖先关系。
2. 对照批准图逐项审查参与者目标、规则归属、流程分支、状态转换、组件责任和接口方向。
3. 逐项验证 proposal 中每个 AC；运行相关测试并记录精确命令、退出结果和可定位证据。
4. 完成 tasks checkbox，填写 verification 的 AC 结果、语义结论和残余风险。
5. 将 semantic-review 设为 pass、concerns 或 fail，并填入当前批准的 design digest。删除模板中的实现 commit/patch-id 字段，不再填写这些 Git 事实。
6. 若 semantic review 不是 pass，或任何 AC 不是 PASS，不进入完成批准；修复实现或返回设计阶段。
7. 由仓库自行决定代码与证据提交方式；CLI 不检查提交顺序、工作区 clean 状态或 verification 之外的实现文件。
8. 向人类提交模型一致性结论、代码和测试证据、逐项 AC、残余风险，并等待完成验收。

不要因为测试通过就自动把 semantic-review 写成 pass；它必须来自对批准模型和实际实现 diff 的语义比较。
