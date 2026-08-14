# Close Change

1. 运行 capabilities、status 和 evidence，确认设计批准 current、任务完成、AC 全部 PASS、semantic review 为 pass，工作区干净。
2. 向人类呈现最终验证结论和残余风险。
3. 只有人类在当前会话明确验收实现后，才运行：

```sh
arch-lens change record-approval <id> --stage completion --reviewer <human-name>
```

4. 确认 completion approval 为 current，且 approval.yaml 是唯一工作区变化。
5. 运行 `arch-lens change archive <id>`，把 Change Pack 原子移动到日期归档目录。
6. 创建只包含归档移动的最终 commit，并报告 model commit、implementation commit、evidence commit、批准人、摘要和归档路径。

archiveEligible 只是机械资格，不是 CLI 对设计或实现正确性的判断。
