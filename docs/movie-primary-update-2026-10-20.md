# 影片主片源更新（2026-10-20）

用户提供的 79 个新地址已设为主片源。保留未在清单中的影片及现有分集学习课程；分集课程的字幕和切片继续使用原先对齐的媒体，不直接套用新版整片时间轴。

- 旧 `hlsUrl`、`backupHlsUrl`、`embedUrl` 均保留为可选择的 `backupSources`，按 URL 去重；旧 `backupHlsUrl` 字段保留兼容性。
- 播放页支持多个备用源；重新加载保留选中的源。只有适用原有广告规则的源显示广告跳过提示。
- 新增《查理与巧克力工厂》(2005)、《飞屋环游记》(2009)、《夏日友晴天》(2021)、《小黄人与怪兽》(2026)。封面地址、资料来源和自行整理的中英文简介记录在 `movie-additions-2026-10-20.json`。
- 用户确认“冰川时代6”指 2022 年《冰河世纪：巴克大冒险》；“小黄人与怪兽”指 2026 年长片。
- 封面和简介参考 Warner Bros、Pixar、Illumination Studios Paris 官方页面。Pixar 两部影片使用官方页面图片作为封面。

重复执行导入（默认仅预览，`--write` 写入；先完成全部匹配与校验再写文件）：

```powershell
node scripts/promote-movie-sources.cjs 'C:\Users\lenovo\Desktop\新的地址.txt' --write
node tests/movie-source-promotion.test.cjs 'C:\Users\lenovo\Desktop\新的地址.txt'
```

验证包括 79 个主地址逐一匹配、基于更新前提交核对旧源完整保留、导入幂等、多备用源切换与重试、旧网页播放器、Chrome/Edge/Safari 播放路径和分集课程数据。Windows 下课程播放列表测试统一换行后验证。

限制：新源服务器拒绝直接读取（主要为 HTTP 403）；本地播放页的《夏日友晴天》也出现片源加载失败。因此本次只确认配置及切换逻辑，不能确认新源可实际播放，亦未核实音轨、字幕和完整时长。已有旧源可通过下拉菜单手动切换。
