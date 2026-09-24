# Close Change

1. 运行 capabilities、status 和 evidence，确认 design approval current、任务完成、AC 全部 PASS、semantic review 为 pass。
2. 向人类呈现最终验证结论和残余风险。
3. 只有人类在当前会话明确验收实现后，才运行：

```sh
arch-lens change record-approval <id> --stage completion --reviewer <human-name>
```

4. 确认 completion approval 为 current。
5. 运行 `arch-lens change archive <id>`，把 Change Pack 原子移动到日期归档目录。
6. 报告批准人、design/completion digest 和归档路径。仓库若需要 Git commit 顺序或发布审计，由仓库专用 CI/脚本另行处理。

archiveEligible 只是机械资格，不是 CLI 对设计或实现正确性的判断。
