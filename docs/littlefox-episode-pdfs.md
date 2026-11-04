# 剧集对应的官方 PDF 绘本

编号来源是现有 `reading-lessons.json` 的 `sourceId` 和 `episodes.json` 的 `sourceContentId`。两处同时有值必须相同；不同则停止导入，禁止按标题或集数猜测。

官方资源规则：`https://res.littlefox.com/en/supplement/load_pdf/Cxxxxxxx`。使用匿名流式 GET，只读取前 1024 字节并校验 `%PDF-` 文件头；官方可能将 PHP 错误页也标成 HTTP 200 application/pdf，因此不能只依赖 HEAD。检查后标记 `verification: pdf-header-v2`。没有编号、不可用、网络未确认的记录不开放入口。本站下载通道也会再次校验文件头，拦截同类错误响应。

运行 `python scripts/import-episode-pdfs.py --check --apply` 重新生成目录。需要 Python 和 requests；只有通过新版文件头检查的成功记录才会复用，其余地址重新检查。`--apply` 单独运行时复用既有检查结果，不请求远端。

- `data/littlefox-episode-pdfs.json`：全部编号、剧集、PDF 地址和检查状态。
- `reports/episode-pdfs.json`：统计与缺少编号的剧集清单。
- 每集 `storyBook`：contentId、bookId、pdfUrl、availability；原本缺少 sourceContentId 时由原文编号补齐。

Level 1–9 的可用剧集显示“Story Book / 本集绘本”；Level 0 不提供绘本入口，也不加入可读绘本目录，原编号和地址记录保留。课程页旧的“全集绘本库”入口已移除，旧合集与关联资料保留。使用现有 PDF.js + StPageFlip；文件从固定官方域名通过本站下载通道加载，仓库只存地址和编号，不保存 PDF。

编号与目录检查脚本：`node tests/episode-pdfs.test.cjs`。
