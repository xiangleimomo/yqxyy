# Story Fox English V16

## 单词发音恢复（2026-10-09）

Words 单词卡、Typing Practice 的“听”、短语和阅读朗读共用 `js/pronunciation.js`。点击单词或短语时通过有道 HTTPS 单词发音音频播放，音频异常/拒绝/等待超过 8 秒时尝试设备英文语音；离线和长句直接使用设备语音。只在点击时发送需要发音的英文文本，不发送账户或课程标识。无英文语音且音频也不可用时显示重试提示，不再静默失败。

新点击停止旧音频，旧请求的迟到回调不能覆盖新发音；设备语音在点击调用链内启动并保持对象引用，不再延迟到下一次定时任务。声音提示不修改积分或学习记录。`node tests/pronunciation.test.cjs` 覆盖回退、超时和取消；`tests/pronunciation.browser.cjs` 在桌面/手机模拟环境实际解码播放单词卡、下一词和拼写听力音频，并模拟网络失败验证备用朗读。

## 手机游戏界面（2026-10-09）

`js/mobile-games.js` / `css/mobile-games.css` 只给窄屏或小尺寸触屏的 Games 窗口启用布局；`arcade/mobile.js` / `arcade/mobile.css` 按可用宽高等比缩放画布，不改游戏逻辑坐标。竖屏操作按钮在下方、横屏在右侧；非画布游戏和关末核验可在内部滚动。适应视口变化和安全区，关闭窗口恢复页面滚动。PC 不显示全屏按钮且布局不变。

游戏内“全屏”按钮在点击手势内调用原生 Fullscreen API，浏览器不支持或拒绝时使用网页铺满模式（不能隐藏浏览器地址栏）；全屏切换不经过开始入口，不重开、不额外收费。浏览器测试覆盖 27 款游戏在 390×844、844×390、320×568 下的画布比例、按钮边界，原生/降级全屏、退出/关闭清理，以及移除手机模块前后的 PC 尺寸一致性。测试需安装 Playwright 与 Edge：启动本地静态服务后设置 `GAME_TEST_ORIGIN`，运行 `node tests/mobile-games.browser.cjs`（可用 `PLAYWRIGHT_MODULE` 指定 Playwright 路径）。

## 游戏关卡与完整词库覆盖（2026-10-09）

27 款游戏共用 `arcade/campaign.js`：每局最多 3 关，按本集去重后的词条数均分（相差不超过 1）。单盘容量有限时在关内轮换小盘，泡泡龙每盘 4 词、三消最多 5 词、分拣最多 3 词，其余按各自容量分盘；不足最低玩法容量时只复习本集词，不引入示例词。原有动作玩法、画面和保龄球十局等标准规则保留；游戏内部原有的三关循环由统一关卡管理替代，不再叠加成九关。

每关完成小盘后，必须根据中文逐词输入完整英文完成核验，避免随机玩法中词已入池却未练习。短语、单字母、超长词等有释义的词条也纳入核验；不能拼入交叉网格的词不再导致卡关，仍在核验中练习。缺失英文或中文释义的无效数据无法核验；不足 4 个有效游戏单词的 10 集仍沿用原有提示、不拿其他集词汇补齐。Words 的大小写规范保留，普通词小写。

整个三关流程只在开始时收费 2 积分。关内换盘、关末核验、进入下一关均不扣分；失败结束、重新开始或再来一局仍走原收费入口。仅整局结束保存一次本地成绩，核验不增加积分、不替代 Words 解锁记录。`node tests/campaign.test.cjs` 对 6,135 个可玩词库 × 27 款游戏验证均分、容量与全词覆盖；另有浏览器测试验证 27 款流程及原有积分、管理员和媒体规则。

## Episode Games（2026-10-09）

每集学习顺序为 Watch → Listen and Read → Words → Quiz → Games。有 Words 模块的集会自动显示 Games，无需逐集修改 JSON。Games 读取同一集 `vocabulary.json` 的 `word` 与 `meaningZh`（或 `meaning`），不使用示例词或其他集词库。

- 本集 Typing Practice 正确拼写至少 50% 的不同 Words 词条后解锁 Games（奇数向上取整）。每次打开随机抽取 3 款，不再提供“换一组”按钮。重复拼写同一词只计一次解锁进度，跳过或拼错不计；全部 Words 词条参与解锁进度，包括未适配小游戏的短语。
- 未解锁也展示本次 3 款游戏的全彩预览与名称，并提示还需拼对多少个词；只禁用开始按钮，不隐藏游戏。达标后原来的 3 款直接解锁，不重抽。积分不足仍可看预览、不能开始。课程 Games 入口副标题为“游戏”。
- 每次点击开始游戏或重新开始/再来一局消耗 2 积分。余额不足不允许开始；暂停、继续及返回列表免费，不退还已经开始的一局。页面展示进度、所需词数、余额与价格，所有 27 款通过同一个收费入口。直接访问游戏库不能免费开始。
- 字母小游戏支持 2–16 个 A–Z 字母的单词，重复拼写去重；短语、标点词不拆分，改由关末完整拼写核验覆盖；缺中文释义的词无法核验。可用词少于 4 个时显示提示，不拿示例词补齐。
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

## DYTT 播放器广告跳过（2026-10-16，人工核对后启用）

仅对用户在 Excel 中确认的8部影片启用：赛车总动员2、神偷奶爸、海底总动员、哈利波特与魔法石、哈利波特与死亡圣器（上）、哈利波特与死亡圣器（下）、刺猬索尼克3、魔发精灵2：世界之旅。原始来源必须是 HTTPS、域名为 `vip.dytt-live.com`，且路径位于 `js/dytt-ad-skip.js` 的白名单中；其他影片保持原样。

每部4处，共32处广告区间已由用户核对。连续分段时长为两组：5.566667 / 2.933333 / 5.7 / 3.333333 / 1.533333秒，以及6.666667 / 2.133333 / 3.233333 / 3.733333秒。逐段容差0.001秒，整组前后须有切换标记。按特征匹配，不依赖固定序号或分钟位置。

不改动影片数据、原始M3U8地址、TS地址或列表内容，仅在原始播放器时间轴上seek跳过广告，字幕和学习进度仍使用原时间轴。HLS.js读取已解析片段的start/duration/cc，不额外请求列表；原生HLS在metadata就绪后异步读取列表，检测请求失败时保持原播放。关闭、重试、切换备用源时清理检测。广告TS可能仍被缓冲，边界处可能短暂显示画面。

验证：`node tests/dytt-ad-skip.test.cjs`、`node scripts/test-hls-playback.cjs`、JS语法检查、`git diff --check`。可给广告测试传入本地审核资料目录（包含analysis.json和8个实际列表快照），核对32处区间以及原生/HLS解析结果和逐段跳过；审核资料不提交到仓库。


## 电影 Chrome 播放兼容（2026-10-16）

部分桌面 Chrome 对 HLS 的 canPlayType 返回 maybe，但直接设置 M3U8 后仍报 MEDIA_ERR_SRC_NOT_SUPPORTED。电影播放器现与课程播放器保持一致：Safari 优先原生 HLS，Chrome/Edge 使用 HLS.js；没有 MSE 且具备原生 HLS 的设备保留原生回退。片源地址及广告规则不变。

验证：`node tests/movie-playback.test.cjs` 覆盖 Chrome/Edge 的 maybe/probably、手机 Safari 原生、无 MSE 回退和广告检测清理。当前《赛车总动员》片源在本机 Chrome 155 实测：修复前原生播放 error code 4，修复后 HLS.js 成功读取时长并播放。原课程播放回归与32处广告区间验证均通过。


## 光影课堂主片源及备用片源（2026-10-16）

按用户提供的38条完整影片/地址记录设置主片源（37条替换，赛车总动员原已更新）。通过 `node scripts/import-movie-sources.cjs <清单.txt> --write` 可重复执行导入；不带 `--write` 仅检查。脚本先验证全部标题、URL及影片ID，再修改字段，保持目录、标题和字幕元数据不变。

此前人工确认的8个DYTT地址保存在各影片的 `backupHlsUrl`，并保留原有广告跳过规则。清单中有新主源的3部哈利波特（魔法石、死亡圣器上/下）显示主/备用切换菜单；其余5部尚无新地址，继续使用原主源，同时保留备用记录。主备地址相同时不显示重复选项。切换源从头播放，重新加载保留所选源。备用源的检测始终使用实际播放URL，不把旧广告时间套用到新源。

验证：`node tests/movie-sources.test.cjs <清单.txt>`、`node tests/movie-playback.test.cjs`、课程播放回归及32处已确认广告的回归。38个新地址在本次检查时均返回有效M3U8。Chrome桌面/手机尺寸通过测试媒体验证主备解码、播放、双向切换、重试和控件边界；未逐部完整播放38个远程视频。

清单中的《超人总动员》第一部未填写地址，保留现有来源。新增的5条 mujizybf.com/m3u8/?url= 播放器页面链接已提取其显式 url 参数中的实际 M3U8。


## 英语片源复核（2026-10-16）

本轮核查并采用29部英语正片，含用户补充的神偷奶爸1—4及小黄人大眼萌：神偷奶爸前传。实际M3U8写入影片数据，保留此前8个DYTT备用地址。优先查片库自营4K60帧，逐一核对电影、时长、抽样英语对白和Chrome解码/启动播放；线路名称不当作真实分辨率或帧率。11部未找到可靠替代，保持原状态。

详情及排除原因见 `docs/movie-source-audit-2026-10-16.md`；精确地址、实测时长和分辨率见 `docs/movie-source-review-2026-10-16.json`。所给欢乐好声音地址为约11分钟短片，不用来替换正片；原误放在第二部的短片已改为约110分钟英语版第二部。未使用用户取消的skr网站。

可用 `node scripts/apply-reviewed-movie-sources.cjs docs/movie-source-review-2026-10-16.json --write` 重复执行本轮地址更新，不带 `--write` 仅检查。运行 `node tests/reviewed-movie-sources.test.cjs`、`node tests/movie-sources.test.cjs`、`node tests/movie-playback.test.cjs` 以及现有课程/广告回归。29个实际来源逐一通过桌面Chrome启动播放；未完整观看全片，不承诺任意时间点绝无广告。

已合并用户同期更新的地址：冰川时代1—3保留等价的直接地址；玩具总动员5新片源补充通过英语对白及Chrome检查。小黄人大眼萌第一部误填的前传地址已纠正。
