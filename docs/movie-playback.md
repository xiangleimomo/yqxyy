# 电影默认播放器

光影课堂沿用本站 `#/movie/<id>` 播放页。默认来源是 111MoviesNet 当前跳转的嵌入播放器：`https://player.vidmario.net/embed/movie/<TMDB编号>`。82 部影片的 TMDB 编号来自 `data/movie-hub-catalog.json`。浏览器地址及站内导航保持不变，不会跳转到第三方整站。

播放模式由 `data/movie-playback.json` 控制：

```json
{
  "mode": "vidmario",
  "legacyPrimaryEnabled": false
}
```

每部电影提供两项可手动切换的嵌入线路：

- `111MoviesNet 主片源`：优先 Pythagoras 服务器；
- `111MoviesNet 备用片源`：优先 Fermat 服务器。

播放器本身仍会在相应线路不可用时尝试其可用的内部服务器。两者来自同一 111MoviesNet 播放器体系，不是将视频流量经过本站或 Netlify 中转。

Dulo、旧主片源及旧备用片源的数据和代码均保留，但默认不启用。若需要恢复旧本站播放器，改为 `"mode": "legacy"`、`"legacyPrimaryEnabled": true` 后部署；若确实要恢复 Dulo 嵌入模式，则改为 `"mode": "dulo"`。是否能播放仍取决于第三方来源在当时的可用性与用户网络。

电影页面保留“其他播放平台”和课程学习入口。电影主线答题从“我的荣誉馆 → 作品徽章馆 → 电影主线 → 对应徽章”进入。

基本核对包括：82 个有效电影编号、111MoviesNet 嵌入地址、备用源切换、JavaScript 语法和 diff。未创建临时账号；没有把播放器页面加载成功当作所有影片已确认播放。
