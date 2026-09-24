# Story Fox English V16

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
