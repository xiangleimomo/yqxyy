# Story Fox English V16

## Episode Games（2026-10-09）

每集学习顺序为 Watch → Listen and Read → Words → Quiz → Games。有 Words 模块的集会自动显示 Games，无需逐集修改 JSON。Games 读取同一集 `vocabulary.json` 的 `word` 与 `meaningZh`（或 `meaning`），不使用示例词或其他集词库。

- 本集 Typing Practice 正确拼写至少 50% 的不同 Words 词条后解锁 Games（奇数向上取整）。每次打开随机抽取 3 款，不再提供“换一组”按钮。重复拼写同一词只计一次解锁进度，跳过或拼错不计；全部 Words 词条参与解锁进度，包括未适配小游戏的短语。
- 未解锁也展示本次 3 款游戏的全彩预览与名称，并提示还需拼对多少个词；只禁用开始按钮，不隐藏游戏。达标后原来的 3 款直接解锁，不重抽。积分不足仍可看预览、不能开始。课程 Games 入口副标题为“游戏”。
- 每次点击开始游戏或重新开始/再来一局消耗 2 积分。余额不足不允许开始；暂停、继续及返回列表免费，不退还已经开始的一局。页面展示进度、所需词数、余额与价格，所有 27 款通过同一个收费入口。直接访问游戏库不能免费开始。
- 游戏支持 2–16 个 A–Z 字母的单词，重复拼写去重；短语、标点词、缺中文释义的词不拆分，页面明确列出未参与的词条。可用词少于 4 个时显示提示，不拿示例词补齐。
- 游戏普通单词和干扰字母使用小写，不再整体转大写。Words 中原有的专名大小写、固定缩写（如 Venus、Guanyin、TV、CD）保留；词条也可用 `preserveCase: true` 显式保留特殊拼写。填字接受大小写输入，按格子的规范大小写显示。
- 游戏在独立 iframe 中运行，键盘、暂停、词库互不干扰；关闭窗口或切换模块结束游戏。成绩按系列与集数保存在本机 `episodeArcadeScores:<series>:<episode>`，不修改原有 Quiz 解锁规则，也不自动发放奖励积分。
- 入口及词库传递：`js/episode-games.js`；完整游戏库：`arcade/`；只允许本次 3 款及本集词库：`arcade/episode-bridge.js`。
- 拼写正确词记录在账户作用域的 `progress[series:episode].typingCorrect`，积分消费以唯一请求记录在同一集 `pointSpends`。云同步合并已拼对词和消费记录，按消费前余额合并再扣除唯一消费，避免高余额旧快照恢复已花积分。HTTPS Web Locks 串行同浏览器多标签页消费；重复消息不重复收费。无需改动数据库表结构。
- 历史版本只记录积分、模块完成，无法还原具体答对词；不能把旧的“Words 已完成”（可能包含跳过）当作 50% 拼写证明，需要新版本逐词正确记录。现有每次拼对 +1 积分的奖励方式不变。
- 这是现有静态站点的客户端学习积分规则，不是服务端防作弊钱包；恶意修改浏览器数据以及跨设备同时离线超额消费需要后续服务器事务账本防护。

验证：`node --check js/app.js`、`node --check js/episode-games.js`、`node tests/episode-games.test.cjs`、`node tests/game-access.test.cjs`、`git diff --check`。新增验证覆盖 50% 奇偶边界、拼错/跳过/重复词、实际 Typing Practice 解锁、单局/重玩扣 2 分、暂停/返回免费、余额不足、并发/重复请求、关闭等待中的窗口、多标签页余额、账户及集数隔离、刷新持久化、云同步不恢复已花积分。视频和听读入口未改变。

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

## 云端开发（GitHub Codespaces）

不需要保留本机开发环境。项目已由 GitHub 托管，Netlify 会在 `main` 分支更新后自动上线；通过 Codespaces 可直接在浏览器中开发。

1. 打开 GitHub 仓库，点击 **Code → Codespaces → Create codespace on main**。
2. 等待云端工作区初始化完成后，在终端运行：`python3 -m http.server 8000`。
3. 在 Ports 面板打开 `8000` 的预览链接，即可查看网站。
4. 修改文件后，在 Source Control 中提交并同步；或者在终端执行 `git add`、`git commit`、`git push`。
5. 推送到 `main` 后，Netlify 会自动发布，无需打开本机电脑。

项目已提供 `.devcontainer/devcontainer.json`，Codespaces 会自动使用 Node.js 22 并转发预览端口。请勿把 `.env`、令牌或数据库密钥提交到仓库。

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

## 开发调试管理员

先在网站注册专用账户，再由 Supabase 项目所有者在 Dashboard → SQL Editor 中执行 `supabase/grant-site-admin.sql`，将其中的邮箱占位符替换为已注册邮箱。脚本只授权一个现有账户，不创建账号或设置密码。请勿将密码、service_role 密钥提交到仓库。

授权后退出并重新登录，账户入口会显示“管理员”。该账户可以直接进入所有已发布课程，无需逐集通过 Quiz；游戏无需完成 50% 拼写挑战、无需积分，显示全部 27 款便于调试。管理员可以使用浏览器开发者工具。权限不会自动填写学习记录，也不会提供尚未上传的课程素材。

网站通过 Auth 的 `getUser()` 验证服务器返回的 `app_metadata.site_admin === true`，不会使用用户可编辑的 `user_metadata` 或本地缓存授权。验证失败时不启用管理员模式。撤销时由所有者执行 `supabase/revoke-site-admin.sql`，然后让账户重新登录或刷新验证；已打开页面需重新验证才反映权限变更。

这是学习网站的调试访问模式，不授予修改其他用户资料或数据库的权限。现有静态页面的访问限制不是服务端内容保护；数据库仍由 Supabase RLS 控制。
