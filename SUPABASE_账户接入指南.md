# Story Fox English：Supabase 注册、登录、学习记录云同步

本包基于你确认的 **v22.12_series_intro_update** 制作。保留原 Netlify 静态网站，新增 Supabase Auth 和每位用户独立的学习记录。

> 当前为**待配置的可部署版本**：没有 Supabase 项目 URL 与 Publishable key 时，网站仍可以游客模式运行；无法真的注册或跨设备同步。必须完成以下配置后再公开上线。

## 一、在 Supabase 创建项目

1. 访问 https://supabase.com/dashboard ，创建项目，妥善保管自己的数据库密码（**不要放到网页代码里**）。
2. 在项目 **SQL Editor** 打开 `supabase/setup.sql`，执行。它创建 `public.user_learning_state`，并开启 Row Level Security (RLS)：用户只能查询和修改自己的记录，游客无权读取。
3. 在 **Authentication → Providers → Email** 确认启用 Email。正式公开使用建议开启邮件确认。
4. 在 **Authentication → URL Configuration** 设置：
   - Site URL：你当前部署的网址，例如 `https://yqxyy.netlify.app`（以你的实际 Netlify 域名为准）。
   - Redirect URLs：同一个网址，例如 `https://yqxyy.netlify.app/**`；本地测试按需添加 `http://localhost:8787/**`。
5. 在项目 **Connect** 或 **Settings → API Keys** 找到 **Project URL** 与 **Publishable key**（以 `sb_publishable_` 开头）。将它们写进 `js/supabase-config.js`：

```js
window.STORYFOX_SUPABASE = {
  url: 'https://你的项目.supabase.co',
  publishableKey: 'sb_publishable_你的公钥'
};
```

绝对不要把 **secret key**、旧 `service_role` 密钥、数据库密码写进前端文件或传给别人。

## 二、Netlify 部署

将本包网站根目录内的 `index.html`、`js/`、`css/`、`data/`、`assets/` 等文件一起压缩。Netlify 手动上传 ZIP 时，确认解压后最顶层就是 `index.html`，不是多套一层 `v17_work` 文件夹。

你也可以直接使用本包 ZIP：它已按 Netlify **根目录结构**打包。

## 三、测试注册与跨设备

1. 第一次在电脑打开网站，点击右上角「注册 / 登录」。用自己的邮箱注册；如开启邮件验证，收到确认邮件后点击验证链接。
2. 登录后完成第一集 Watch、Read、Words、Quiz，单词练习获得的积分也会记录。
3. 用另外一台设备登录**同一个账号**，重新打开系列页，观察已完成状态、Quiz 成绩、收藏、积分是否恢复。
4. 在新设备上学完另一个模块，返回旧设备重新打开页面或切回前台；记录会自动合并并尝试同步。
5. 若原浏览器已有未登录的游客学习记录，第一次登录时会询问是否导入。**请确认游客记录属于该账号的本人**。也可在「我的账户」中手动导入。

## 已同步的数据

- 系列/每集 Watch、Listen and Read、Words、Quiz 的完成状态和解锁依据
- Quiz 成绩（合并时保留通过率更高的成绩）
- 单词收藏、句子收藏
- Typing Practice 累计积分
- 签到日期记录

未登录时仍使用旧版 `sf_` 本地数据；登录后改用每个账号单独的 `sf_account_<用户ID>_*` 本地缓存，并同步云端。不同账号在同一浏览器不会直接看到彼此记录。

## 重要限制与正式上线前检查

- 当前积分是本地+云端**累计快照**，多设备合并取较大值，避免重复导入。若两台设备**同时离线分别赚取积分**，无法保证精确相加；如以后要用积分兑换真实奖品，应升级为服务端验证和唯一积分流水。
- 本项目属于静态网站，学籍/积分数据由浏览器提交，不能当作防作弊系统；正式奖励和排行榜应在服务端核验。
- 浏览器断网时仍可继续学习，本设备数据会暂存；连接恢复后自动重试。不要在成功同步前清除浏览器数据。
- Supabase 默认测试邮件服务有限额。大量公开注册需设置自定义 SMTP 邮件服务。
- Supabase 访问速度及邮箱验证邮件在不同网络（特别是中国大陆）可能有所不同；应在目标用户网络中测试。Supabase JavaScript SDK 从 CDN 加载，遇到访问限制应改为同源托管。
- 这次只增加账户及云同步，没有修改原来桌面浮动学习窗口的手机适配问题。手机注册弹窗是自适应的，但要舒适地在手机完成 Watch/Read/Words/Quiz，还需另做移动端学习窗口调整。

官方参考：
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/getting-started/api-keys
