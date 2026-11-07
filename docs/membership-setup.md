# 会员类型与管理（预留版）

本次只在本地加入数据库脚本与账号界面，没有修改线上 Supabase、GitHub 或 Netlify。
不接收付款，不启用到期后的内容拦截。现有课程解锁、积分、亲子身份、学习进度和片源搜索白名单保持原规则。

## 使用规则

- 普通账号默认是体验用户。首次成功调用会员资料接口时，以数据库时间开始连续72小时体验，刷新或换设备不会重置。
- 管理员和 `hanyi888@qq.com` 享有长期使用豁免。这是独立权限，不代表该邮箱有管理员权限。
- 月卡默认为保存时起算30天，年卡为365天；管理员可指定到期时间。保存操作会替换原来的会员类型和到期时间，不是续费累加。
- 改回体验用户时保留最初体验起点，不重新赠送72小时。
- 体验或会员已到期时仅显示状态。`enforcement_enabled` 始终为 `false`，本版不会阻止学习。
- 家长/孩子身份与会员类型独立。月卡、年卡不会获得片源搜索权限。

## 手动部署

1. 按项目现有迁移流程应用 `supabase/migrations/20261107160000_membership_foundation.sql`。也可由项目所有者在 Supabase SQL Editor 中完整执行该文件。只应用一次。
2. 上传本次网站文件，再由现有 GitHub/Netlify 流程发布。
3. 管理员登录后打开“账户设置 → 账号类型 → 会员管理”，输入邮箱查询，点击账号，选择体验/月卡/年卡，填写可选到期时间、备注，再保存。
4. 普通用户的账户设置只显示自己的类型和有效期，没有查询或修改别人的入口。数据库也会拒绝越权请求。

数据库未部署时，账号面板显示“会员服务尚未启用”，其他功能继续使用。
现有账号不会按过去注册时间直接过期：部署后首次成功读取会员资料时才开始体验。

## 接口约定

使用现有 Supabase 登录会话调用 RPC `sf_membership`：

| p_action | p_payload | 权限 / 行为 |
| --- | --- | --- |
| `me` | `{}` | 已登录账号读取自身资料，首次建立体验起点 |
| `list` | `{query, page}` | 仅管理员；邮箱包含匹配，页码从0开始，每页20条 |
| `set` | `{user_id, tier, version, valid_until, note}` | 仅管理员；类型为 `trial` / `monthly` / `annual`；version来自查询结果，防止旧页面覆盖新修改 |

`valid_until` 为带时区的 ISO 时间，留空由服务器计算默认期限。类型为 `trial` 时清空付费期限。
不允许普通用户直接写入会员表，管理员调整会保存操作者、调整前后资料、时间和备注。
管理员身份在每次后端操作时从 `auth.users.raw_app_meta_data.site_admin` 读取；不依赖可编辑用户昵称或前端标志。

### 将来接支付

预留 RPC `sf_membership_payment(p_event_id, p_user, p_tier)`，只授权 `service_role`。
**普通网页和管理员浏览器都不能调用；service_role 密钥只能放后端。**

将来支付服务必须先核验支付平台签名、订单归属、商品与实际到账金额，再调用此接口。
`p_event_id` 应使用“支付平台:唯一订单号”格式，同一事件只延长一次；重复事件资料不同会拒绝。
月卡续费增加30天，年卡增加365天，从当前有效期限和服务器当前时间中较晚者起算。
目前没有开放支付回调 URL、创建订单接口、收款按钮或价格配置，不能实际收款。

## 本地验证

- `node --check js/membership.js`、`node --check js/cloud-account.js`、`git diff --check`
- 安装固定版本 `@electric-sql/pglite@0.5.15` 后，设置 `PGLITE_MODULE` 为该包的绝对路径，运行 `node tests/membership.test.cjs`。测试使用内存 PostgreSQL，模拟 Supabase 的最小 Auth 表和角色，不连接线上数据库。
- 启动 `python scripts/preview.py` 后，设置 `PLAYWRIGHT_MODULE` 指向已有 Playwright 包，运行 `node tests/membership.browser.cjs`。浏览器测试模拟会员接口响应，覆盖移动端编辑、普通账号隔离、未部署提示和切换账号。

后续真正启用3天到期拦截，需要另行决定限制哪些课程与素材，并在内容接口落实权限检查；不能只改前端开关。
