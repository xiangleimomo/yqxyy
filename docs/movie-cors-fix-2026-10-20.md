# 2026-10-20 主片源跨域播放修复

## 原因与修复

`zcdn.bluevelvet.space` 能返回 HTTP 200 和有效 HLS 内容，但响应没有 `Access-Control-Allow-Origin`。直接访问播放链接与网页内 HLS.js 的跨域 fetch/XHR 权限不同，网站会被浏览器 CORS 拦截。此前 Python 请求返回的 403 也不能据此判定用户浏览器中的片源已过期。

`MovieClassroom.mediaUrl` 仅将该固定 HTTPS 域名的 `/play/` 地址映射到本站 `/_movie-media/bluevelvet/`；Netlify 在 SPA 回退规则之前执行固定上游 200 代理。主清单、子清单、相对初始化 MP4 和 m4s/TS 分片使用同域路径。原始目录地址保留不变，其他域名及旧备用源的加载方式不变。Safari 原生 HLS 与 HLS.js 使用同一路径。

配置依据：https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/

视频数据会经过 Netlify 转发，因此产生站点流量消耗。此路径需要 Netlify 代理规则；普通静态 HTTP 服务器不执行 `netlify.toml`，本地验证需要等效代理。

## 验证

- 播放单测：HLS.js/Safari 同域映射、多备用源切换及重试、网页播放器、源域名边界、Netlify 代理规则位于 SPA 回退前。
- TOML 解析、JavaScript 语法及 diff 检查。
- 真实上游与本地同域代理：Luca 时长 5718.087 秒，1920×1080，readyState=4，点击播放成功。
- 线上验证结果在交付消息中报告。

## 后续调整：国内访问优先直连（2026-10-20）

用户反馈：国内浏览器打开原始地址可以播放，但站内兼容转发持续转圈。上一版解决了 HLS.js 的跨域限制，却强制所有浏览器绕经 Netlify，增加了另一条网络路径，不能代表国内访问表现。

现在对这一固定片源优先使用浏览器原生 HLS，`video.src` 直接设置为原始地址，不设置 `crossorigin`，不经过 HLS.js 的跨域 fetch，也不经过 Netlify 视频转发。仅浏览器不支持原生 HLS、原生播放器报错，或 15 秒仍无法获得元数据时才使用兼容转发。播放器关闭或切源取消旧计时器，旧错误和超时不能重开已关闭的影片。

新增“直接打开播放”入口以复用用户已验证可用的浏览器打开路径。缓冲时显示缓冲提示，重新加载重新尝试直连。旧备用源仍保留原播放方式。

验证：真实播放页面的 `currentSrc` 是 `https://zcdn.bluevelvet.space/play/...`，能够以 1920×1080 播放并跨多个分片推进；单测覆盖原生直连、无原生支持的转发、原生失败/超时回退、清理和过期事件，以及备用源切换。国内不同运营商、设备的实际速度仍取决于原片源及浏览器支持。
