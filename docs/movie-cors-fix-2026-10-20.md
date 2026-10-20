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
