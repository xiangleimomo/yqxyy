# 期刊杂志

主导航入口 #/magazines，与动画故事、光影课堂、绘本阅读同级。期刊复用绘本的封面、悬浮阅读/收藏操作、PDF 阅览器、本地文件、分类收藏与最近五本阅读记录。

story_books.content_kind 区分 book / magazine，原有条目默认 book。期刊上传写入 magazine，目录、顶部搜索、我的收藏、最近阅读、个人上传与管理员管理按栏目筛选。同名查重在各自栏目内执行。个人记录仍按真实条目 ID 隔离，RLS、家长上传及管理员审核规则沿用现有流程。

封面及文件沿用 Pone，数据库不保存上传文件内容。没有预置期刊内容，家长点击右下角“＋”上传；管理员可进入“管理期刊”。账号管理提供“管理我的期刊”，已发布内容修改、删除需审核。

阅读路由 #/magazine-reader/:id 保持期刊导航高亮，返回期刊书架。文件缓存及 PDF 翻页进度沿用现有实现。注册及权限变化只刷新标记为 data-book-navigation 的图书导航，避免覆盖动画、电影的个人书架标签。

验证：node scripts/test-magazines-ui.cjs（本地服务 8127、Playwright、Edge）；scripts/test-magazines.sql 在事务中验证发布类别、查重、收藏进度及待审核状态并回滚。
