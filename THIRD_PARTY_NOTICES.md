# Third-Party Notices

Arch Lens 的 npm 包只分发自身源码、文档和以下运行时依赖：

| Component | Version range | License/source |
| --- | --- | --- |
| Commander.js | 14.x | MIT, https://github.com/tj/commander.js |
| YAML | 2.x | ISC, https://github.com/eemeli/yaml |

PlantUML JAR 不包含在 Arch Lens npm 包中。`arch-lens init` 从固定官方 HTTPS URL 下载锁定版本、校验 SHA-256 并保存到用户缓存；用户也可显式指定本地安装：

| External tool | License/source |
| --- | --- |
| PlantUML 1.2026.6 | GPL-3.0-or-later, https://plantuml.com/ and https://github.com/plantuml/plantuml/releases/tag/v1.2026.6 |

早期草案中的 Eclipse UML2、EMF、EMF Compare、Tycho、OpenJDK runtime、Sprotty、ELK、Lucide、esbuild 与 Playwright 已从分发和依赖中删除。
