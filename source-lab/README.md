# 片源探索 · 独立功能

此目录及 `netlify/functions/source-explorer-api.js` 是新增的独立试播功能，按 AGPL-3.0-only 提供源代码。现有电影目录、播放地址、播放器与广告规则不属于本次修改范围。主站仅增加一个 `/source-lab/` 导航入口。

## 使用

1. 点击主站“片源探索”，输入电影中文名称，自动并行查询预置采集源。
2. 默认仅显示片源明确标注为英语的结果。来源的语言标签可能不准确，试播时仍应核对；国语、粤语不作为英语结果。混合语言与未标注语言归入“待核对”。
3. 选择一条结果试播，可选择它的不同线路，也可以重新寻找同名片源。所有操作独立于现有电影条目，不向现有目录写入地址。
4. 自动跳过已核对的广告时长组合与明确广告路径；可开启 LibreTV 扩展识别，也可以手动标记起止时间。所有过滤都采用播放器 seek，不修改 M3U8 文本或原时间轴。识别结果可逐条取消。标记与导入源只保存在本机浏览器，使用独立存储前缀。
5. 自动检测内嵌英文字幕，尝试匹配站内同名同年份的已有字幕；可导入 SRT/VTT，调整字幕偏移。默认使用无需 API Key 的公共英文字幕服务，会自动搜索并列出英文版本，由用户选择加载，避免错误版本直接覆盖字幕。支持英文片名、中文别名与 IMDb 编号；同名影片需确认年份。
6. 在“管理搜索源”中导入 LibreTV 的 `sources` 数组或裸数组 JSON。自定义源通过浏览器直连；不支持跨域的源会显示失败，不影响其他来源。

现有视频中烧录的水印不能通过跳过 TS 去除。扩展识别是启发式，默认关闭，不把所有 discontinuity 当广告。

## LibreTV 代码来源与许可

- 官方项目：https://github.com/LibreSpark/LibreTV
- 固定版本：`9afeb3de0ae8824c97195bccfa956696d33cf066`
- 使用文件：`src/lib/m3u8.ts` → `vendor/libretv-m3u8.ts`，保留原始源码，未修改。
- `vendor/libretv-m3u8.js` 是上述文件生成的浏览器构建产物，页面使用它的 `stripAdGroups` 扩展广告识别入口。只取其候选片段用于 seek，不用其代理重写功能，也不把改写播放列表接入原播放器。
- 保留完整上游许可证：本目录 `LICENSE`。上游代码及新增独立功能均按 AGPL-3.0-only 提供。
- 新功能完整源码：https://github.com/xiangleimomo/yqxyy/tree/main/source-lab
- 服务端源码：https://github.com/xiangleimomo/yqxyy/blob/main/netlify/functions/source-explorer-api.js
- 新增测试：https://github.com/xiangleimomo/yqxyy/blob/main/tests/source-lab.test.cjs

重建浏览器产物：

```sh
npx --yes esbuild@0.28.2 source-lab/vendor/libretv-m3u8.ts --bundle --format=iife --global-name=LibreTVM3u8 --outfile=source-lab/vendor/libretv-m3u8.js
```

搜索接口兼容 LibreTV 使用的 Apple CMS `ac=videolist&wd=关键词` / `ac=videolist&ids=编号` 格式；支持直接 M3U8 和 MP4 线路，不将解析器 HTML 页塞入 HLS 播放器。

## 部署

静态站点仍发布仓库根目录，无需新前端构建；Netlify 自动部署 `netlify/functions/source-explorer-api.js`。函数只代理管理员配置的采集接口，不接受客户端提供任意代理 URL，不代理影片分片，不覆盖原站重定向规则。默认三源：如意、无尽、魔都。第三方源的可用性会变化；失败源有独立提示，其他源继续搜索。

可选 Netlify 环境变量（不要写入仓库或前端）：

- `SOURCE_LAB_PROVIDERS`：自定义预置接口 JSON 数组，例如 `[{"id":"source1","name":"名称","url":"https://example.com/api.php/provide/vod"}]`，最多 12 个。用于浏览器无法直连的接口。
- `OPENSUBTITLES_API_KEY`：OpenSubtitles 外部字幕搜索所需 API Key。
- `OPENSUBTITLES_TOKEN`：OpenSubtitles Bearer token，按账号下载权限需要配置。下载受服务商配额与账号限制。

无需配置凭据即可使用默认公共服务。已实测《冰雪奇缘》的影片匹配、英文字幕列表、文件下载和浏览器字幕加载。可选账号服务未配置真实凭据，不声称已验证账号下载权限。公共服务可能限流或临时不可用，出现错误时可重试或导入本地文件。

## 验证

```sh
node tests/source-lab.test.cjs
node --check source-lab/app.js
node --check netlify/functions/source-explorer-api.js
```

实测多源搜索、英语结果筛选与 Chrome 真实影片试播；桌面和 390px 手机布局无横向溢出。额外浏览器验证覆盖字幕导入与延迟、广告跳转及手动标记、本机源列表导入、关闭播放器清理；旧站回归测试继续运行。

可选实播浏览器测试（需要 Playwright、Chrome 和上述公共片源可访问；先启动本地静态服务器）：

```sh
python -m http.server 8000
# 在另一个终端
node tests/source-lab-browser.cjs
```

`SOURCE_LAB_TEST_URL` 可指定测试页完整 URL；`HLS_TEST_SCRIPT` 可指定本机 hls.js 副本，便于 CDN 不可用时运行。浏览器测试只模拟搜索 API，播放器与广告 seek 使用实际 HLS；不改电影目录。

## 默认公共字幕服务（2026-10-18）

- Cinemeta 负责按片名和年份解析 IMDb 影片编号；OpenSubtitles v3 Stremio 官方字幕插件提供英文字幕索引。官方插件目录：https://github.com/Stremio/stremio-official-addons 。
- 服务地址：`https://v3-cinemeta.strem.io`、`https://opensubtitles-v3.strem.io`；下载只接受插件返回的 `https://subs数字.strem.io/en/download/…` 地址，不接受客户端指定下载 URL，不跟随下载重定向。
- 搜索前先用本目录 `subtitle-films.json` 将已知电影中文名映射为英文名。映射只包含 ID、片名和年份，不改片源；更新命令：`node scripts/build-subtitle-aliases.cjs`。
- 同名多年份或无法准确匹配时提供影片选择；可在字幕区修改英文片名／IMDb 编号和年份再查找。已配置 OpenSubtitles 账号服务时仍可使用，失败或无结果时回退到公共服务。
- 返回字幕版本包含文件名与可用的帧率，只有用户选定后才下载加载，不自动覆盖现有字幕。SRT 转换成 VTT，显示仍使用原播放器时间轴；不同压制版本可调整延迟。
- 按影片列表缓存一小时，最多 100 条上游结果；不持久保存用户输入与字幕文件。

新增测试：`node tests/public-subtitles.test.cjs`。

外挂字幕默认按不含广告的影片时间计时，自动补偿已识别／手动标记广告的累计时长，避免跳过插入广告后字幕持续错位；如果字幕文件本来包含同样广告时间轴，可取消字幕区的补偿选项。内嵌字幕不应用此变换。
