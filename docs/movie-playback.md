# 电影默认播放器

光影课堂沿用本站 `#/movie/<id>` 播放页，默认在原播放器位置嵌入 `https://dulo.mov/watch/movie/<TMDB编号>`。82 部影片的编号来自现有 `data/movie-hub-catalog.json`，不使用旧目录里已经失效的固定主片源 URL，也不跳转浏览器到 Dulo 网站。Dulo 播放器自行加载它的最新播放线路。

播放模式由 `data/movie-playback.json` 控制：

```json
{
  "mode": "dulo",
  "legacyPrimaryEnabled": false
}
```

原 `data/movies/*/movies.json` 中的 `hlsUrl`、原嵌入地址、备用片源、学习课程等数据均保留。Dulo 模式不显示和启用旧主片源 / 备用源选择器。以后需要恢复本站原播放器时，改为 `"mode": "legacy"`、`"legacyPrimaryEnabled": true` 后部署即可；是否能播放仍取决于恢复时相应地址的有效性。

Dulo 框架允许脚本、同源运行、表单和演示，保留沙箱隔离；允许播放器全屏、音视频及画中画，禁止子页面主动跳转本站顶层。浏览器地址及站内导航保持不变。播放页保留原有“其他播放平台”和课程学习入口。

电影页面不再生成作品徽章、进度提示框或答题按钮。电影主线答题从“我的荣誉馆 → 作品徽章馆 → 电影主线 → 对应徽章”进入，徽章进度继续在该处显示。

基本核对包括：82 个有效电影编号、默认模式下的 Dulo 嵌入地址、旧模式恢复开关、JavaScript 语法和 diff。未创建临时账号；没有把页面加载成功当作所有影片已确认播放。
