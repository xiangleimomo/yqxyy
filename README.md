# Story Fox English V16

## 统一课程解锁规则

Level 0–2 不上锁，可自由选择已发布课程。Level 3 及以上沿用西游记、三国演义的顺序解锁：第一集开放，上一集 Quiz 正确率达到 80% 且记录为完成后，自动解锁下一集已发布课程。级别取自共享加载的 `series.json`，课程列表、直接课程链接、学习弹窗均执行同一规则；Level 3 及以上的旧数据中 `unlockRequiresQuiz: false` 不再跳过课程锁。测验保留最高正确率，已通过后重测低分不会重新锁住下一集。已有学习记录沿用账户同步，无需重新通过已记录的测验。

Level 3 及以上未添加测验的课程仍需等待测验补齐才能解锁下一集，本次不生成或修改课程正文及题目。验证覆盖 Level 0、1、2 自由选课和 Level 3 上锁边界，以及 60% 未通过、80% 通过、只解锁下一集、刷新持久化、低分重测、直接链接与弹窗拦截、筛选后的解锁、系列隔离、原有西游记/三国。

## Read 内置划词词典 V1

速度修复：中文翻译与英文词典独立显示，不再等待两个接口一起结束。英文词典最多等待 5 秒，中文翻译最多等待 12 秒；中文成功结果独立缓存，即使英文词典失败也能复用。缺失的英文词条在下次查询时后台重试。模拟英文词典延迟 2 秒的 Chromium 测试中，中文约 0.21 秒显示，之后补充英文；已验证收藏状态在补充结果后保留，关闭后的迟到结果不会重新打开词卡。

所有课程共用 `readPanel`，由 `js/read-dictionary.js` 和 `css/read-dictionary.css` 提供划词词典。双击英文单词或划选文字查询；单词使用 Free Dictionary API，中文翻译使用 MyMemory，多词片段只请求翻译。接口发音不可用时回退到浏览器英文朗读。词卡可加入已有单词表，沿用账户收藏同步。

Read 顶部可关闭内置词典，偏好保存到本机；不会取消原生文字选择或拦截第三方翻译插件事件。课程重点词原有提示继续保留。点击别处、Escape、滚动、关闭来源窗口时关闭词卡。缓存最多 100 条成功查询，保留 30 天；失败结果不缓存。查询片段最多 500 UTF-8 字节，外部接口超时或不可用时显示提示并可重试。选中文字会发送至上述外部服务。

验证：本地 Chromium 中检查原生双击、单词与句子分流、缓存命中、生词本、接口文本安全显示、开关、关闭、网络失败，以及西游记/三国共享 Read 窗口。成功响应使用模拟接口；当前环境真实接口探测遇到 HTTP 403，在线服务可用性需在实际网络中确认。

# Story Fox English / Little Fox Learning Platform

这是根据“Little Fox Learning Platform 标准化工作流 V1.0”重构的可部署静态网站。

## 已内置系列

1. Journey to the West / 西游记
   - 108 集
   - 已迁移到 `data/journey-to-the-west/`
   - 已补充 `phrases.json`、`grammar.json`、`review.json`
   - 新增内容为自动生成初稿，适合上线测试，后续可逐集精修

2. Romance of the Three Kingdoms / 三国演义
   - 当前配置 8 集
   - Episode 1–6 已完整开放
   - Episode 4–6 已配置各自独立的视频链接
   - Episode 7–8 为 coming

## 发布流程

本项目由 GitHub 管理代码，并由 Netlify 从 `main` 分支自动部署。

1. 修改并提交网站文件到 GitHub。
2. 推送到 `main` 分支。
3. Netlify 自动构建并发布到线上网站。

入口文件：`index.html`

## 后续新增系列

1. 新建 `data/series-id/`
2. 放入标准 JSON 文件
3. 在 `data/series-list.json` 增加系列记录
4. 提交并推送到 GitHub；Netlify 会自动部署

## 后续更新某一集

只需要更新对应系列文件夹中的 JSON：

- `episodes.json`
- `reading-lessons.json`
- `vocabulary.json`
- `phrases.json`
- `grammar.json`
- `quiz.json`
- `review.json`

通常不需要修改 HTML / CSS / JS。


## V12 update
- Removed user-facing video source technical notes.
- Prepared Watch page for cleaner user experience.
- Added Listen as a learning mode entry point where supported by existing data structure.
