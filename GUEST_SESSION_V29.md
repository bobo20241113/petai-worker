# 宠AI v29：访客首次验证与短期通行

## 使用体验

首次进入未登录页面时完成 Turnstile 验证，Worker 校验通过后签发 30 分钟访客通行凭证，验证区域自动收起。有效期内发送多条消息或新建临时会话都无需重复验证。

30 分钟从签发时起计算，不随聊天自动延长。到期后再次验证。新建会话清空聊天上下文，但保留当前页面尚有效的通行凭证；刷新、关闭、离开页面或登录后清空凭证。凭证只在 JavaScript 内存中，不写 Cookie、localStorage、sessionStorage 或数据库。

验证失败时显示简短说明与“重新验证”，不会自动反复调用验证服务，也不会把普通访客引导到管理员连接设置。发送时发现凭证过期，会保留未发送问题；服务器拒绝凭证时恢复问题供重新发送。已完成的临时聊天保留到页面被清空。

## 部署顺序

这是前端和 Worker 配合的功能，不能只更新 `public/index.html`。

1. 将本次 Worker 更新包内的代码合入你的仓库，包含 `src/index.js`、新增的 `src/guest-session.js` 和 `public/index.html`。若全量覆盖，请保留你自己修改过的 Wrangler 名称、队列名和部署绑定。
2. 沿用已配置的 `GUEST_ENABLED=true`、`TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY`、`TURNSTILE_HOSTNAMES`。Turnstile 站点也须允许实际前端域名。其他 Secrets、数据库和队列绑定沿用原配置。
3. 提交后触发已有 Cloudflare Git 构建，或在 Worker 目录执行 `npm run deploy`。
4. 刷新前端。`/health` 应返回版本 `1.9.0`。第一次完成验证后，浏览器网络面板会有一次 `POST /api/guest/session`；后续 `POST /api/guest/chat` 携带 `guest_session_token`，不再反复提交同一 Turnstile token。

无需执行 SQL，无需修改 FastGPT 工作流。主答案继续原样返回。

独立 HTML 位于项目根目录 `6137-29.html`，同样需要本版 Worker 服务。未升级后端时，新页面不会跳过验证，会提示访客服务需要更新。

## 配置与实现

- 新增 `POST /api/guest/session`：只接受未登录请求；保持来源白名单和每 IP 限流；调用 Cloudflare Siteverify，严格检查 success、hostname 和 action。验证通过才签发凭证。
- 凭证使用 Web Crypto HMAC SHA-256 签名，包含用途、版本、签发和过期时间、随机标识，并绑定前端 Origin。Worker 对每条聊天校验签名、来源和有效期。
- 默认使用已有 `TURNSTILE_SECRET_KEY` 加固定用途前缀形成签名密钥，因此不必增加环境变量。可选的 Secret `GUEST_SESSION_SECRET` 可以提供独立随机签名密钥，建议至少 32 字节。它只在 Worker 后端使用，不返回前端。
- 更换签名密钥会使已有通行凭证立即失效。关闭 `GUEST_ENABLED` 后已有凭证也不能继续使用。
- 仍然执行每 IP 限流。通行凭证不提供登录、数据库、云端档案或历史记录的访问权限。
- 旧页面使用全新的一次性 Turnstile token 调用访客聊天的路径暂时保留，便于前后端滚动升级。它同样必须通过服务器校验。
- 不需要新增数据库表、KV、Durable Object 或 Cookie。不会持久化访客问答。

## 验证范围

前端 28 项、后端 70 项测试通过。新增覆盖一次验证后多次聊天、过期、篡改、错误签名、跨来源、验证失败、关闭访客、限流、退出页面清空凭证，以及不修改 FastGPT 原文。

本地浏览器使用模拟验证按钮和模拟接口，确认验证一次后连续聊天与组件收起。未代替用户完成真实 CAPTCHA、执行线上部署或修改线上数据。
