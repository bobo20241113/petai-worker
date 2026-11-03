# 宠AI v47：回答与档案提示解耦

更新完整 Worker **1.17.0**（含 public），修复附加档案查询或列表刷新失败导致答案读不到/被覆盖的问题。没有新 SQL，FastGPT 流程不用更换；此前缺失的 011 迁移仍需补齐。见 [ANSWER_READ_V47.md](ANSWER_READ_V47.md)。

# 宠AI v46：档案补充和待确认提示

先执行 Supabase **011_archive_change_receipts.sql**，再部署完整 Worker **1.16.0**。回复下方新增真实补充、待确认提示，点击直达对应档案或建议区，处理后同步更新提示。FastGPT 流程不用更换。见 [ARCHIVE_V46.md](ARCHIVE_V46.md)。

# 宠AI v45：混合提问建档与创建提示

先执行 Supabase **010_pet_creation_receipts.sql**，再部署完整 Worker **1.15.0**（包括页面），并更新独立记忆提取流程。修复“我有一只柯基……现在还需要打吗”的漏建档问题。真实创建成功后在回复下方提示并可直接打开档案。不能只替换 HTML。见 [ARCHIVE_V45.md](ARCHIVE_V45.md)。

# 宠AI v44：档案原位保存

修复保存档案时弹窗缩小、重载的问题，保留展开、滚动和其他未保存草稿。已部署 v43 时只替换 `public/index.html` 后重新部署，无需更新数据库或工作流。见 [UI_V44.md](UI_V44.md)。

# 宠AI v43：可编辑宠物档案

**本次需要数据库和完整 Worker 升级，不能只换 HTML。** 先执行 Supabase `009_profile_editing.sql`，再部署 Worker **1.14.0**，并更新独立记忆提取流程。支持逐项编辑、手动值保护、冲突建议与有效档案数量徽标。部署顺序见 [PROFILE_V43.md](PROFILE_V43.md)。

# 宠AI v42：档案入口图标

档案按钮增加小爪印与右箭头，沿用绿色样式。已部署 v40/v41 时只需替换 `public/index.html` 后重新部署，无需修改数据库或工作流。见 [UI_V42.md](UI_V42.md)。

# 宠AI v41：简洁档案清单

档案改为紧凑清单，点击展开，补充信息与来源折叠显示。已部署 v40 时只需替换 `public/index.html` 后重新部署，无需修改数据库或工作流。见 [UI_V41.md](UI_V41.md)。

# 宠AI v40：档案持久化、数值复核与留言页

先执行 Supabase **008_feedback.sql**，再部署完整 **Worker 1.13.0（含页面与 feedback.html）**，并更新学校 FastGPT 主流程。已完成旧迁移无需重跑。新增私密留言表单（新标签页）、明确陈述存档兜底、导出状态及下载链接、隐私/帮助和示例只填不发说明。

部署、维护者查看留言的方法和验证边界见 [QUALITY_AND_FEEDBACK_V40.md](QUALITY_AND_FEEDBACK_V40.md)。

# 宠AI v39：回复操作与对话反馈

新增常驻复制/再次请求按钮、即时主题标题、等待计时及输入校验。请同时更新 Worker **1.12.0** 与页面；已执行 v38 的 Supabase 007 无需再执行 SQL。详情见 [CHAT_UX_V39.md](CHAT_UX_V39.md)。

# 宠AI v38：多图上传与手机拍照

本次须先执行 Supabase 增量迁移 **007_multiple_images.sql**，再同时部署 **Worker 1.11.0 与新版页面**。支持最多4图、相机入口、真实上传进度和模糊重拍建议，移除右上角设置齿轮。操作与限制见 [UPLOADS_V38.md](UPLOADS_V38.md)。

以下旧版本说明仅作历史参考，以 v38 更新说明为准。

# 宠AI v30：当前页面首次验证一次

取消页面内定时重验，更新访客底部引导文案。本次须同时更新 Worker 与页面。见 [GUEST_SESSION_V30.md](GUEST_SESSION_V30.md)。以下旧版本说明仅供历史参考。

# 宠AI v29：访客验证一次，连续聊天 30 分钟

本次需要同时更新 Worker 后端与 `public/index.html`，不能只替换 HTML。沿用现有 Turnstile 配置，不需要 SQL 或 FastGPT 工作流变更。见 [GUEST_SESSION_V29.md](GUEST_SESSION_V29.md)。

# 宠AI v25 升级提示 · Worker 1.8.0

新会话也能查看账号档案；唯一已确认自养宠物可默认使用，多只按聊天识别。先执行 Supabase 006（此前缺 005 时先补 005），再部署本版 Worker 与页面，并更新记忆提取提示词。

完整步骤：[账号档案与跨会话升级说明](ACCOUNT_MEMORY_V25.md)。主聊天 FastGPT 原文返回机制保持不变。

---

 宠AI Worker 后端

Cloudflare Workers + Supabase + 学校 FastGPT。实现《宠AI后端设计 v2》的后端：已登录云端会话、从聊天自动建档、跨会话事实读取、只读档案 API、临时访客、持久任务与重试。**此目录可单独作为 GitHub 仓库上传。** Supabase 建表文件位于并列的 `petai-supabase/` 目录。

本次已加入云端前端 `public/index.html`，部署后直接打开Worker根地址即可使用。旧的 `6137-12.html`仍是历史版本，不会自动变成云端版。新页面通过Worker API访问会话和档案，访客只用页面内存。


## v22 后台记忆与消息时间（当前版本）

移除聊天中的记忆同步提示及按钮，Cron自动处理有限重试。历史消息读取实际保存时间，新消息显示发送/完成时间，时间标签会自动刷新。新版前端已包含在public/index.html中，更新并部署本目录即可。health版本1.6.0，无新增SQL，FastGPT工作流不变。说明见 [SILENT_MEMORY_TIME.md](SILENT_MEMORY_TIME.md)。

## v21 FastGPT 原文直通（保留的基础功能）

按要求移除Worker对主聊天答案的全部来源审查、改写和兜底替换，直接返回FastGPT的原始 `message.content`，不截断文本。主聊天不再请求detail，也不覆盖工作流回答长度。回答质量优化只在FastGPT工作流中进行。本次无需重新导入JSON。

**先在Supabase追加执行 `004_answer_passthrough.sql`，再更新部署Worker**，否则旧数据库仍会截断24,000字符以上的云端答案。health版本为1.5.0。完整步骤和无法恢复旧原文的限制见 [RAW_ANSWER.md](RAW_ANSWER.md)。以下v19/v20的Worker来源检查仅为历史说明，当前已删除。

## v20 检索恢复更新（历史）

新增一次换词重查、URL-only候选正文读取、检索格式适配和具体原因诊断；有证据先回答核心问题。请同时更新学校主工作流和Worker；health版本1.4.0，无数据库变更。升级和排查见 [SEARCH_RECOVERY.md](SEARCH_RECOVERY.md)。

## v19 通用法规更新（历史）

已删除地区专属法规分支，统一范围规划、缺项补问、检索与证据审查。Worker 增加本次实际来源核对，阻止拼接或无依据引用；主聊天使用 `detail:true`，详细节点结果不返回浏览器。**请同时更新 Worker 和学校主工作流**；无需数据库迁移。保留学校配置的升级步骤见 [GENERIC_WORKFLOW.md](GENERIC_WORKFLOW.md)。

## 2026-10-29 前端接入更新

Worker现在同时托管HTML，并通过`GET /api/config`提供白名单公开配置。请补上 `SUPABASE_PUBLISHABLE_KEY`（也支持旧变量名`SUPABASE_ANON_KEY`）以及访客用的 `TURNSTILE_SITE_KEY`，两者均为公开值，不是后端私钥。`SUPABASE_URL`复用现有值。公开接口不会返回Secret Key或任何FastGPT密钥。

Supabase Auth的Site URL/允许重定向地址设为实际Worker根URL。Turnstile允许实际Worker hostname，`TURNSTILE_HOSTNAMES`同步修改，访客开启时`GUEST_ENABLED=true`。前后端同域无需额外配置ALLOWED_ORIGINS；其他托管域名仍要加到白名单。

本次后端更新不涉及SQL迁移，原数据库不需要重建。完整的前端操作说明见并列`petai-frontend/README.md`，该前端也有独立单文件版本6137-19.html。

## 一键部署按钮

**上传 GitHub 后先替换 `YOUR_GITHUB_USER/YOUR_REPO`。这个占位按钮在替换前不能部署。**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FYOUR_GITHUB_USER%2FYOUR_REPO)

如果将本目录内容作为仓库根目录，使用上面的仓库URL；如果将完整项目上传，使用子目录URL：

```text
https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FYOUR_GITHUB_USER%2FYOUR_REPO%2Ftree%2Fmain%2Fpetai-worker
```

也可以生成准确的Markdown按钮：

```sh
# 本目录作为独立仓库
npm run deploy:link -- https://github.com/你的用户名/你的仓库
# 后端位于大仓库的 petai-worker 子目录
npm run deploy:link -- https://github.com/你的用户名/你的仓库 main petai-worker
```

按钮按 Cloudflare 官方 Deploy to Cloudflare 机制克隆公开仓库、配置 Worker 和所需资源。**不会替你创建外部 Supabase 项目、执行SQL、导入FastGPT应用或提供API密钥。** 部署页如要求 Queue 名称，保留默认或同步修改消费者与生产者；部署后检查Cron与队列绑定。仓库必须公开才能分享此按钮；私人仓库可自行通过 Cloudflare Git 集成部署。

## 1. 先配置 Supabase

1. 创建 Supabase 项目。
2. 在 SQL Editor 按顺序执行并列目录中的：
   - `001_schema.sql`
   - `002_jobs.sql`
   - `003_memory_and_privacy.sql`
   - `004_answer_passthrough.sql`（已有001–003的项目只需追加这一份）
3. 开启邮箱密码登录，配置 Site URL、允许的认证回调地址及邮件发送。生产演示使用你自己的测试账号，**不要把密码提交到仓库**。
4. 取得 Project URL、浏览器使用的 publishable key、后端使用的 secret key。也兼容旧版 `service_role` JWT key。
5. SQL创建 `petai-private` 私有bucket。不要改成public，也不要给匿名用户添加公开读写策略。

浏览器只使用publishable key及自己的登录token，不能接触secret key。本后端不代管密码，注册/登录/重置由Supabase Auth SDK完成。数据通过Worker访问。

## 2. 配置两个 FastGPT 应用

`fastgpt/` 中提供两个可导入 V4.14.5 的工作流：

| 文件 | 用途 | 密钥配置 |
| --- | --- | --- |
| `chat-cloud.json` | v20 通用范围、补问、两轮检索与证据审查 | `FASTGPT_API_KEY` |
| `memory-extractor.json` | 独立的用户事实JSON提取器，不是普通问答 | `MEMORY_API_KEY` |

导入后在学校平台选择实际可用模型，主应用自行绑定知识库。**公开模板已清空HTTP节点的隐藏鉴权头**，联网搜索所需鉴权需在学校平台自行重配；不要把带真实密钥的导出JSON上传公开仓库。记忆应用不需要知识库、联网或视觉。

记忆接口输入是一个JSON字符串，输出必须是仅含operations/state的JSON；源码 `src/memory.js` 包含校验器及提取提示词。另用其他OpenAI兼容模型也可以，但需要正确配置相同提示词/工作流，不能直接拿主聊天应用密钥代替。

调用主应用时变量为字符串：`petProfile`、`petRecords`、`clarificationState`、`currentDate`、`memoryStatus`。当前问题仍在最后一条user消息里。后端不使用上游 `chatId`，避免双重历史。

学校接口可达不代表模型一定服从JSON格式，导入后须实际测试提取工作流。失败时系统保留用户消息，`memory_status=pending`，不会虚假声称已保存，可单独重试记忆同步。

## 3. 部署 Worker

按钮部署时按提示填Secrets；也可用CLI：

```sh
npm ci
npx wrangler login
# 仅CLI首次部署需要手工建资源；按钮部署会按配置申请资源。
npx wrangler queues create petai-chat
npx wrangler queues create petai-chat-dead
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put FASTGPT_API_KEY
npx wrangler secret put MEMORY_API_KEY
npm run deploy
```

若队列已存在，跳过create命令。部署配置使用 Workers Queue 消费者、Cron及限流绑定；请确认账户支持对应资源和额度。生产域名和私钥不是按钮能自动推断的，需要你配置。

### 配置清单

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `SUPABASE_URL` | Secret | `https://YOUR_PROJECT.supabase.co` |
| `SUPABASE_SECRET_KEY` | Secret | 服务端secret或旧service_role，仅后端可见 |
| `FASTGPT_API_KEY` | Secret | 主聊天应用API key |
| `MEMORY_API_KEY` | Secret | 独立提取应用API key |
| `SUPABASE_PUBLISHABLE_KEY` | 公开变量 | 浏览器登录使用的Publishable Key或旧anon key，不能填service_role |
| `TURNSTILE_SITE_KEY` | 公开变量 | 浏览器人机验证使用，与私钥来自同一站点 |
| `FASTGPT_API_URL` | 普通变量 | 完整chat/completions URL，默认学校接口 |
| `MEMORY_API_URL` | 普通变量 | 提取应用接口URL，默认学校接口 |
| `ALLOWED_ORIGINS` | 普通变量 | 逗号分隔的前端origin，例`https://pet.example.com,http://localhost:8080`，无末尾斜杠，不支持`*` |
| `GUEST_ENABLED` | 普通变量 | 默认`false`；完成Turnstile配置后改`true` |
| `TURNSTILE_SECRET_KEY` | Secret | 公开访客必须设置 |
| `TURNSTILE_HOSTNAMES` | 普通变量 | Turnstile允许的hostname列表，不带协议 |
| `FASTGPT_TIMEOUT_MS` | 普通变量 | 默认90000，最大120000毫秒 |
| `MAX_USER_TURNS_PER_DAY` | 普通变量 | 默认每用户每天100次新问题；重试另受最多5次attempt约束 |
| `WORKFLOW_VERSION` | 普通变量 | 快照中的流程版本标记 |

配置使用keep_vars保留控制台中的额外变量。ALLOWED_ORIGINS、GUEST_ENABLED、TURNSTILE_HOSTNAMES由控制台配置，不再用仓库默认值覆盖；wrangler.jsonc中仍明确列出的变量会以仓库值部署。

检查 `GET /health` 返回`ok:true`。该检查仅表示Worker存活，不表示数据库、提取模型或聊天模型配置成功；再用下文登录用户测试验证整条链路。

本地开发：复制 `.dev.vars.example` 为 `.dev.vars`，填你自己的测试环境值，再运行`npm run dev`。这些私钥文件已被gitignore。

## 4. 登录用户 API

每个登录请求带 `Authorization: Bearer <Supabase access_token>`，Worker通过Auth验证身份。请求体中的owner_id不会用于授权。已登录业务写入不开放给浏览器Supabase SDK。

| 方法/路径 | 说明 |
| --- | --- |
| `POST /api/guest/session` | Turnstile 验证后签发页面范围通行凭证，无数据库访问 |
| `GET /api/config` | 无需登录，只返回公开配置白名单 |
| `GET /api/pets` | 自动生成的宠物列表，只读 |
| `GET /api/pets/:id` | 当前有效档案、记录和待澄清冲突 |
| `GET /api/pets/:id/records` | 有效记录，只读 |
| `DELETE /api/facts/:id`、`DELETE /api/records/:id` | 从个性化记忆中忘记指定条目；不是编辑表单 |
| `GET/POST /api/conversations` | 会话列表/创建，body可选`pet_id`、`title` |
| `GET/PATCH/DELETE /api/conversations/:id` | 详情/只改标题/删除对话；删除对话默认保留已形成宠物记忆 |
| `GET /api/conversations/:id/messages?before=sequence` | 倒序分页，每页50条，显示时按sequence重排 |
| `POST /api/conversations/:id/turns` | 提交问题，返回202及turn_id |
| `GET /api/turns/:id` | 状态、答案、memory_status；不返回内部快照或lease token |
| `POST /api/turns/:id/retry` | 明确失败后的受控重试，body`{}` |
| `POST /api/turns/:id/cancel` | 请求取消，body`{}` |
| `POST /api/turns/:id/sync-memory` | 只重试完成回答但未保存的记忆，最多3次，不重新生成答案 |
| `POST /api/attachments` | 压缩图片上传，返回附件ID |
| `GET /api/export` | 导出当前用户业务数据，不包括图片二进制和Auth密码 |
| `DELETE /api/account/data` | body`{"confirm":"DELETE_MY_DATA"}`，删除业务数据，Auth账号保留 |

聊天示例：

```js
// token由supabase.auth.getSession()取得；不是secret key。
const headers = {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'};
const conversation = await fetch(`${API}/api/conversations`, {
  method: 'POST', headers, body: JSON.stringify({})
}).then(r => r.json());
const requestId = crypto.randomUUID(); // 同一次提交/断网重发必须复用这个ID
const task = await fetch(`${API}/api/conversations/${conversation.id}/turns`, {
  method: 'POST', headers,
  body: JSON.stringify({client_request_id: requestId, text: '我家的豆豆是猫，已经绝育'})
}).then(r => r.json());
// 每2秒左右轮询一次；完成/失败/取消即停止，不无限轮询。
const result = await fetch(`${API}/api/turns/${task.turn_id}`, {headers}).then(r => r.json());
```

客户端提交自己的完整history/petProfile不会用于登录问答；服务端加载真实历史、关联宠物和长期记录。同一会话一次只处理一个问题，有并发返回409。

状态：`pending → processing → completed`；失败可能是`failed`、`needs_review`或`cancelled`。`completed`且`memory_status=pending`表示回答已完成但自动记忆还未保存，界面不能提示“已记住”，可调用sync-memory。

`needs_review`表示上游可能已执行但回包丢失。用户接受可能重复调用/计费后，才能用`{"accept_possible_duplicate":true}`请求retry。数据库防重复落库，不保证上游只计费一次。

### 图片

已登录用户先POST `/api/attachments`：

```json
{"conversation_id":"UUID","image":"data:image/jpeg;base64,..."}
```

图片限制压缩后约1MB、JPEG/PNG/WebP，先在浏览器缩小尺寸（建议最大边1400）。后端验证文件签名，写私有Storage；提问时传`attachment_id`，不能用任意外链代替。生成时创建10分钟签名URL，学校视觉服务需要能读取该URL。签名URL不永久公开；每轮重新签名覆盖排队时间。该上游兼容性需在学校实际验证。

## 5. 访客 API：不持久化

首次调用 `POST /api/guest/session`，提交一次性 `turnstile_token` 和 `session_version:2`，Worker 验证成功后返回 `guest_session_token` 和 `session_scope:"page"`。Turnstile 组件 action 为 `guest_chat`。之后在当前页面调用 `POST /api/guest/chat` 携带该通行凭证，不带 Authorization；两条路径均要求允许的 Origin、开启访客及限流通过。

```json
{
  "text":"猫能吃什么",
  "history":[{"role":"user","content":"我家有一只猫"},{"role":"assistant","content":"你想了解哪方面？"}],
  "guest_session_token":"服务器签发的短期访客通行凭证"
}
```

返回`{"answer":"...","mode":"guest","persistent":false}`，可选`image`为受限data URL。history只接受成对的user/assistant文字，最多12条，合计最多24000字符；不接受system角色、任意图片URL或自定义上游。

此路径不创建Supabase用户、不写数据库或Storage、不入持久Queue。前端必须只用页面内存，点击新对话/刷新/关闭即清空；不要套用旧HTML的IndexedDB。登录后开始云端新对话，默认不迁移访客内容。失效登录令牌返回401，不降级成访客。

Worker关闭请求日志且代码不打印正文。Cloudflare/学校/模型供应商自身可能保有基础设施日志，须核对学校留存设置；不能承诺全链路零留存。访客history在浏览器可改，不作为任何云端已确认事实。

## 6. 自动记忆行为及边界

- 明确用户陈述自动保存，不逐项点击确认；只读档案通过聊天纠正。
- 名字明确的新宠物自动创建，使用UUID区分身份；名字重名无法唯一识别时形成待澄清问题。
- 生日支持年月精度，年龄由后端按香港当前日期计算。
- 物种等字段冲突时不静默覆盖；明确纠正时旧值标superseded，新值生效。
- 驱虫、疫苗、体重、主人转述诊断、计划分别作为事件；未知产品保留null，不推算统一有效期或下次日期。
- 首版保留“昨天/9月初”等时间原文，只把用户明确写出的有效ISO日期持久化为精确occurred_on；**不承诺相对日期已转成精确日期**。
- 先提取并入库，再调用聊天模型，让同轮回答看到新档案；明显危险文字优先回答，记忆稍后单独同步。
- 提取器是模型，原文片段校验和字段白名单减少错误，但不是事实真实性证明。正式使用前需用多宠物、朋友宠物、假设、纠错场景实测。
- 只保存当前用户消息产生的操作，重复队列投递不会重复建立同一轮记忆。助手推测不被当作用户事实。晚到的记忆不会覆盖更新的会话状态。
- `不记录本次资料`禁止形成长期事实；原始聊天仍是云端会话历史，若也不希望留原话，需要删除该会话或所有业务数据。
- 忘记接口/聊天忘记使事实不再参与个性化、并排除来源轮次继续作为上下文；原始消息和审计行并未物理抹除，可导出/删除。不要将“忘记一条”宣传成彻底清除所有备份。
- 一个会话首次明确关联的宠物作为主对象，另一个宠物的事实可以独立记录；对象不明确时追问。新会话选择pet_id最可靠，不自动续接上一场问卷。

## 7. 可靠性、权限和运维

SQL事务建立用户消息、任务和outbox；API队列投递失败时每2分钟Cron恢复。消费者以lease领取，重复投递不重复落库；处理前持久化answer_started。lease超时不自动重复未知结果的上游调用，而是标needs_review。

业务表RLS隔离直接读取；浏览器没有表写权限或petai_* RPC执行权限。Worker使用secret key处理服务端写入，**该key绕过RLS**，所以API和数据库RPC同时检查归属及关联。严禁将它配置到前端。

私有图片未使用超过1天会清理；删会话/业务数据后Storage删除队列由Cron重试；调试快照30天后清理。消息/长期记忆默认保留至用户删除，备份保留取决于Supabase配置。任务处理期间删除会返回409，请先取消并等状态结束。

限流使用Cloudflare绑定，访客按IP、登录按用户，每分钟30次API调用；轮询2秒可能接近上限，多个页面应退避。每日新问题限额在数据库事务中检查，访客由Turnstile和IP限流保护；大规模公开前还应设置账户预算告警及更严格额度。

错误格式：`{"error":{"code":"...","message":"...","request_id":"..."}}`。常见401登录失效、403来源或验证不符、404对象不存在/越权、409状态冲突、429额度、503配置或数据库异常。响应不缓存，不返回原始上游错误/密钥。

## 8. 测试与发布前验收

```sh
npm ci
npm run check
npm test
npx wrangler deploy --dry-run
```

测试包含HTTP输入、CORS、登录验证、提取原文校验，以及PGlite本地Postgres执行SQL的事务/RLS/幂等/纠错/遗忘测试。SQL测试需与此目录并列保留 `petai-supabase/migrations`，独立上传Worker时可通过`PETAI_SQL_DIR`指定建表文件目录；未提供则跳过SQL测试，核心测试仍执行。

代码构建和本地数据库测试不等于完成学校/Supabase/Cloudflare实网集成。部署后必须验证：

1. 账号A聊“豆豆是猫”后，新会话选择豆豆能读到；账号B完全不可见。
2. 问“该驱虫吗”不生成已驱虫记录；“9月初做过体外驱虫”药名未知，不编造周期。
3. 冲突先澄清，明确“刚才说错了”才替换；同名/朋友宠物不串档。
4. 重复request_id不重复建消息；断网刷新能查任务；needs_review要求明确接受重复风险。
5. 访客不产生任何表记录或图片对象；前端刷新/新会话不恢复消息。
6. 图片私有URL能被学校视觉模型读取；删除后对象最终清理。
7. 普通登录用户不能直接写pets/pet_records或调用服务端RPC。

## 目录

```text
src/index.js       HTTP、CORS、鉴权路由、访客与Queue/Cron入口
src/core.js        输入边界、模型适配与请求超时
src/db.js          Supabase HTTPS访问及身份验证
src/jobs.js        持久任务执行、上下文和恢复
src/memory.js      结构化事实校验、提取提示词
fastgpt/          可导入的聊天及记忆工作流（无真实密钥）
scripts/          GitHub部署按钮链接生成器
tests/            核心及本地Postgres测试
```

参考：[Deploy按钮](https://developers.cloudflare.com/workers/platform/deploy-buttons/)、[Queues配置](https://developers.cloudflare.com/queues/configuration/configure-queues/)、[Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。

## 2026-10-29 图片输入兼容修复

FastGPT V4.14.5会根据AI节点fileUrlList中的URL后缀判断图片类型。旧上传路径只有UUID，导致“空扩展名文件不支持”。新上传保留jpg/png/webp后缀，旧签名URL补filename参数；不改私有bucket，不迁移数据库。

本次新增`src/images.js`，请不要只提交index.js而漏掉该文件。详细说明见[IMAGE_FIX.md](IMAGE_FIX.md)。在FastGPT现有应用中清空图片识别/日常/健康节点的fileUrlList引用，选择学校实际支持视觉的模型；或使用已更新的fastgpt/chat-cloud.json。仅勾选视觉开关不能让文本模型识图。

自动记忆也拦截了“这是什么猫”被误建成“猫”档案的情况；旧误建数据不自动删除。

## 2026-10-29 v18 短追问与法规路由

“香港呢”通过完整成功的历史问答理解，分类器读取改写后的问题；Worker增加法规意图辅助与安全路由，模糊短句可澄清，不直接拒绝。前端同时修复空行引起的有序列表重复编号。

需要更新本目录代码并同步更新FastGPT主工作流；没有数据库迁移。**优先使用`scripts/upgrade-workflow.mjs`升级你当前学校导出，以保留实际视觉模型、知识库与私有HTTP配置**，不要把带私钥的升级结果公开。详见[CONTEXT_FIX.md](CONTEXT_FIX.md)。公开模板在fastgpt/chat-cloud.json，独立版本为6137-18.json。
