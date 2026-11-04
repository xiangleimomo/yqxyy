# 剧集对应的官方 PDF 绘本

编号来源是现有 `reading-lessons.json` 的 `sourceId` 和 `episodes.json` 的 `sourceContentId`。两处同时有值必须相同；不同则停止导入，禁止按标题或集数猜测。

官方资源规则：`https://res.littlefox.com/en/supplement/load_pdf/Cxxxxxxx`。对地址做匿名 HEAD 检查，只有 HTTP 200 且 Content-Type 为 application/pdf 的记录才显示绘本入口。没有编号、不可用、网络未确认的记录不开放入口。

运行 `python scripts/import-episode-pdfs.py --check --apply` 重新生成目录。需要 Python 和 requests；已经验证成功的地址会复用检查结果。`--apply` 单独运行时复用既有检查结果，不请求远端。

- `data/littlefox-episode-pdfs.json`：全部编号、剧集、PDF 地址和检查状态。
- `reports/episode-pdfs.json`：统计与缺少编号的剧集清单。
- 每集 `storyBook`：contentId、bookId、pdfUrl、availability；原本缺少 sourceContentId 时由原文编号补齐。

每集显示“Story Book / 本集绘本”，系列页显示“全集绘本库”。使用现有 PDF.js + StPageFlip；文件从固定官方域名通过本站下载通道加载，仓库只存地址和编号，不保存 PDF。已有整本合集继续保留。

编号与目录检查脚本：`node tests/episode-pdfs.test.cjs`。
