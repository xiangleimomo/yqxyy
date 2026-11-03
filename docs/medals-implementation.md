# 双勋章库实施与验证

现有技术栈：静态 HTML/JavaScript，Netlify 自动部署；Supabase Auth、受限 RPC；sf_family_private.profiles 与双向确认后 active 的 links 负责家庭身份及可信亲子绑定。book_portal 和 Pone 已用于图书及图片。user_learning_state 的学习完成字段来自客户端，不能标作系统核验；sf_family_private.events 的 Quiz 结果经过既有服务端答案校对，可以用于测验规则。

增量模块：js/medals.js、css/medals.css；数据库 sf_medals_private 中的资源目录、作品徽章、完成记录、孩子解锁、荣誉模板、收藏、授予、投诉与审计；公开入口仅为权限校验 RPC。服务端 medals-assets 负责图片校验、加密、Pone 上传及授权解密显示。作品详情与现有“我已完成”入口接入勋章组件，不改变视频、HLS、音频阅读和课程解锁。

Pone 为公网文件服务，为同时保留 Pone 存储并满足私有设计与下架控制，图片在服务器校验为规范 PNG 后先用独立 AES-GCM 密钥加密再上传。密钥、原始密文直链仅存受限私有表；浏览器只得到不透明素材 ID，通过鉴权接口取得图片。下架后历史接口也不再解密该设计。数据库不保存图片文件。已经被合法查看、下载或截图的内容无法远程收回。

资源目录由 scripts/build-medal-resources.mjs 从真实书籍、期刊、电影、系列及已发布集数生成到 data/medal-resources.json，仍由 GitHub / Netlify 提供。Supabase 仅按需保存已经关联勋章的作品索引；medals-catalog 从可信目录验证 ID，再写入选中的条目，全集规则才索引相应分集，不复制整套书库。图书同作品的版本可由管理员关联到作品级 canonical_key，不按文件名发章。作品徽章不凭页面打开或播放开始解锁；自报完成明确显示“用户自报”，测验规则只使用服务器已核对的家庭测验事件。系列规则依据目录中的所有已发布集数完成记录。

已交付：孩子两个独立展区、家长授予确认及幂等、原创私有设计、自主上架分享、收藏采用、投诉下架及管理员审计。使用原有账号与亲子绑定。预置三枚平台原创荣誉纪念章、两枚原创作品徽章（关联现有《狮子王》绘本和《哈利波特与魔法石》电影），没有未经授权的官方徽记。

## 使用入口

- 顶部“我的荣誉馆”：孩子查看作品徽章馆 / 荣誉纪念章墙。
- 家长进入荣誉馆后使用奖章工坊、我的设计、我的收藏、给孩子颁章、颁发记录。先在账号管理中设置家长或孩子身份，通过原有绑定码申请并由家长确认。
- 管理员进入荣誉馆的“管理后台”：配置作品主题徽章、处理举报及下架、查看必要颁发记录和审计。图书管理预览也有对应作品的徽章配置链接。
- 已配置作品的阅读器、电影详情、系列及分集学习页面有徽章入口。阅读器顶部奖章按钮可查看领取条件；现有“我已完成”按钮也接入相关分集/系列规则。

## 文件与数据库升级

前端：js/medals.js、js/medal-images.js、css/medals.css；接入 index.html、js/app.js、books.js、book-admin.js、movies.js、cloud-account.js。资源目录和原画生成：scripts/build-medal-resources.mjs、scripts/seed-medal-art.mjs。

以下四份迁移已经在当前 Supabase 项目执行，现有网站无需再次执行。新环境先具备原有账号、家庭和图书表，再按顺序执行：

1. 20261103063642_dual_medal_libraries.sql：私有表、RLS、可信角色与关联校验、普通/服务专用 RPC。
2. 20261103072618_medal_review_metadata_and_indexes.sql：审核授权资料和查询索引。
3. 20261103074821_medal_audit_query_aliases.sql：颁发 / 审计查询别名。
4. 20261103084315_direct_work_badge_uploads.sql：可选作品多徽章、上传者权限、自主上架，无需管理员审核。

已部署 Supabase Functions：medals-assets（index.ts、handler.mjs、png.mjs）、medals-catalog（index.ts、handler.mjs）。复用平台内置 SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY，前端从未接收服务端密钥或图片密钥。无新增 Storage 桶、无新增账号体系。verify_jwt=false 用于既有项目兼容，处理函数首先调用 Auth.getUser 验证每个请求，后续调用受限服务 RPC。

## 本地验证

启动：`python -m http.server 8127 --bind 127.0.0.1`，打开 `http://127.0.0.1:8127/#/honors`。

已实际执行并通过：

- `node --check js/app.js`、`node --check js/medals.js`、`git diff --check`。
- `node scripts/test-medal-assets.mjs`：PNG 尺寸 / CRC / 解压限制、危险输入、AES-GCM 完整性、加密 Pone 上传、CORS、身份与图片读取。
- `node scripts/test-medal-catalog.mjs`：可信静态目录、按需关联、全集权限、图书期刊类型及路径校验。
- `scripts/test-medals.sql`：事务回滚验证孩子幂等领取、测验 / 全集规则、家长绑定、私有草稿隔离及直接上架、设计者与颁发者、重试、撤销收藏后历史保留、自行重新上架与管理员下架。
- `node scripts/test-medals-live.mjs`：真实 Auth 临时账号、实际 Pone 密文上传 / 解密、跨角色权限及完整直接上架及授予流程。
- `node scripts/test-medals-browser-live.cjs`：真实浏览器颁章、孩子荣誉墙、图片显示、原创上传、自主上架、其他家长收藏采用、下架和手机两列布局。
- 原有 HLS / Safari / MP4 备用 / Listen and Read 音频模式、绘本收藏、媒体书架和期刊回归检查通过。

真实接口 / 浏览器验收使用独立生成的临时账号，不发送注册邮件，不提供或复用真实用户密码；通过 scripts/medal-test-fixture.mjs 生成与清理。验收后临时账号和业务数据已清除。supabase/.temp/ 中的图片密钥清单及临时凭据被 .gitignore 排除，不能提交、公开或发给其他人。

## 第一版边界

普通阅读 / 观影采用明确标记的自报完成；已核对测验才使用 quiz_verified，不把打开页面或开始播放当作完成。官方作品徽记尚未导入，需要平台提供合法许可并由管理员配置。当前不包含交易、积分换章、陌生人互赠、公开儿童排名或复杂交换。先交付可用闭环，后续按使用反馈调整视觉和筛选体验。

## 作品上传与图片书架调整

绘本、期刊的家长上传页及管理员发布页增加“作品专属徽章（可选）”。可留空或一次选择 1–8 张 PNG / WebP / JPEG，至少 512×512；确认图片授权后上传到 Pone，自动绑定已发布作品。一个作品可以有多枚不同徽章。家长发布作品与绑定徽章在同一数据库事务完成，失败不留下半成品书籍；重复提交同一素材不会重复创建徽章。上传后还可在“我的设计 → 给作品添加徽章”补充图片，并自主上架或下架自己的作品徽章，不获得其他网站管理权限。

荣誉章公开分享确认后立即上架，不再进入管理员审核队列；草稿仍私有。管理员保留举报处理、违规下架和审计。作品徽章由孩子在完成作品后自报领取，荣誉章由家长授予，两类仍独立。勋章卡片默认只展示图片，悬停或键盘聚焦时显示操作，手机直接显示操作；名称、来源和授予详情点击图片查看。

新增 `node scripts/test-work-badges-browser-live.cjs` 实测 Pone 多图上传、授权确认、悬浮操作、无徽章期刊发布及后续补传；`scripts/test-work-badge-uploads.sql` 验证无徽章发布、作品多徽章、所有权、重试幂等、原子事务回滚及孩子领取。

## 展示简化

勋章列表去掉卡片边框、底色、内边距和装饰阴影，直接展示图片；悬浮操作保留。移除用户举报入口及管理页投诉处理界面，管理员仍可直接下架设计。后续更新不再创建临时测试账号，做基本代码检查后发布，由站点用户实际使用反馈。

## 用户设计的两类奖章

“我的设计 → 原创设计”选择作品徽章或荣誉纪念章；工坊和收藏支持按类别筛选。作品徽章可选择绑定真实作品，上架后同步生成该作品的领取配置；绘本、期刊上传时的可选徽章也统一进入设计列表。现有作品徽章保留原 ID 和孩子已获得的记录，并补齐设计类别。

孩子账号在站内 PDF 阅读器翻至最后一页（包含双页展示的最后一页），或 EPUB 阅读至末尾时，自动记录完成并领取该作品当前绑定的徽章。不将打开绘本或开始加载当作阅读完成。此判断是客户端阅读器记录，不宣称服务端核验完整阅读。未绑定作品的作品徽章，以及所有荣誉纪念章，由可信绑定家长手动授予；家长也可手动授予绑定作品的徽章。

“给孩子颁章”先选择作品徽章 / 荣誉纪念章，再选择来源和具体设计。服务端从设计记录确定授予类别，作品徽章进入作品徽章馆，荣誉纪念章进入纪念章墙；历史授予保存当时类别，后续设计变更不改变历史归属。

数据库增量：20261103093004_user_medal_types.sql。仅做语法检查、变更检查和数据库结构核对；没有创建测试账号。

## Little Fox 与光影课堂主线任务

新增 158 枚 Little Fox 系列勋章和 82 枚电影勋章，共 240 个主线位置。已有《哈利波特与魔法石》平台作品徽章升级为电影答题主线，保留既有图片和已获得记录；其余 239 枚待管理员补图。没有生成或上传新的勋章图片。

Little Fox 以整套系列为单位：每一集的服务端答题成绩达到当前达标线才解锁，默认 80%。所需集数为目录声明总集数和实际已发布集数中的较大值，不按当前少量连载集数提前发章。当前 111 个系列题库完整，47 个系列部分或全部题目待补；这些系列保留勋章位置及已有成绩，题库齐全后才具备解锁条件。现有分集 Quiz 提交后自动核对整套进度；系列页和作品徽章详情也可手动“核对答题进度”。只使用已经由家庭学习接口核对的 Quiz 事件，不用观看完成标记替代答题。

电影每部 5 道简短剧情理解题，共 410 道；中文题干配英语选项。影片页登录后出现“答题赢取勋章”，孩子提交全部选择题后由数据库按题库版本计分，达到默认 80% 自动发章。未达标可重答，同一枚勋章不会重复领取。题库变更后不把旧版本分数直接当作新版本达标；既有已获得勋章不自动撤销。主线勋章不出现在家长手动授予模板里，也不能通过自报完成或家长授予绕过答题。绘本、期刊及用户自行设计的普通徽章逻辑保持不变。

管理员在“荣誉馆 → 管理后台”选择 Little Fox 主线 / 电影主线，可按名称搜索并勾选“只看待配图”。悬停图片位置点“编辑配置”补图，仍走既有 Pone 加密上传。名称、说明、达标百分比及启停可调整；主线所属作品及规则不可改成自报领取。暂缺图片不妨碍完成任务及保存已获得记录。

源数据：`data/movie-mainline-prompts.txt` 为原创短题，`scripts/build-mainline-medals.mjs` 重复生成 `data/movie-mainline-quiz.json` 和 `data/mainline-medals.json`。运行 `node scripts/build-mainline-medals.mjs` 检查并生成目录；`--seed-page N` 输出每页 15 项的事务 SQL，当前共 16 页。导入按作品/勋章标识幂等，不覆盖已经补充的图片与设置的达标线。配置与题库源文件仍在 GitHub，Supabase 保存用于服务端判分和解锁的受限配置索引及成绩。

新增数据库迁移按顺序为 `20261103111338_mainline_quiz_medals.sql`、`20261103112238_mainline_episode_lookup.sql`、`20261103112712_mainline_medal_metadata.sql`；均已应用。分集主线查询按系列和有效集号解析，不为此复制整套分集资源库。

较新影片的基础设定参照官方简介后独立编题：[Toy Story 5](https://www.pixar.com/toy-story-5)、[Minions & Monsters](https://www.illumination.com/movie/minions-monsters/)、[Zootopia 2](https://d23.com/d23-exclusive-go-behind-the-scenes-with-zootopia-2s-filmmakers/)、[The Bad Guys 2](https://www.dreamworks.com/movies/the-bad-guys-2)、[Paddington in Peru](https://www.sonypictures.com.sg/movies/paddington-in-peru)、[Buck Wild](https://news.disney.com/ice-age-buck-wild)。题库为基础可用版，后续根据实际使用反馈修订难度和措辞。

遵照用户要求，本次没有创建临时账号。完成 JavaScript 语法、diff 检查及只读数据库核对：158/82 个主线位置、111 个完整系列、82 个有效五题题库、410 道题、答案选项完整、有效分集关联和未登录零进度。
