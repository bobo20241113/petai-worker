# 本地验证记录

日期：2026-10-27（香港）。未部署到真实Cloudflare账号，未使用真实Supabase/学校FastGPT密钥。

- `npm run check`：通过JavaScript语法检查。
- `npm test`：14项测试全部通过，无跳过。
- 其中数据库测试使用PGlite的Postgres运行时，执行三份真实迁移及权限检查SQL，验证：跨用户关联与RLS、浏览器写/RPC权限拒绝、请求幂等、任务领取、重复完成不重复消息、自动事实入库、跨会话对象关联、冲突澄清、明确纠正、遗忘来源排除、未知上游结果的受控重试、记忆单独重试和数据删除。
- 访客测试通过mock确认只调用Turnstile和模型上游，不访问数据库、队列或Storage。
- 工作流模板检查：节点引用、云端变量声明、未绑定值避免null、公开模板不携带导出的HTTP鉴权头。
- `wrangler deploy --dry-run`：Wrangler 4.153.0成功打包，识别Queue、限流及环境变量绑定。此命令未进行真实资源创建。

发布前仍需要README中的实网验收：学校V4.14.5工作流导入及JSON提取效果、两个真实账号的身份隔离、Cloudflare队列/Cron、Supabase新密钥与Storage、签名图片URL可达性、前端登录与轮询接入。模型提取有语义误差风险，不能把原文匹配校验当成事实真实性证明。
