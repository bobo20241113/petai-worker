# v55：真实流式回复

登录与访客的新回答都改为接收真实FastGPT SSE内容。没有前端逐字播放计时器，按模型实际返回的片段持续显示；一个片段可能包含几个字。历史回答直接完整呈现，复制与最终入库仍使用完整原文。

## 架构和行为

- 主聊天请求使用stream=true、detail=false，只累加公开answer/fastAnswer中的delta.content；隐藏草稿、检索结果、工具输出和工作流内部事件不进入回复。独立记忆提取仍使用原来的非流式JSON协议。
- 登录模式保留持久任务队列。队列向私有的Cloudflare SQLite Durable Object发布生成进度，页面在登录/账号归属验证后订阅/api/turns/:id/stream。最终回答由既有SQL函数原样保存到Supabase。
- 不对每个字反复读写Supabase。进度更新最多约每150ms合并发布一次，临时缓存定期保存以支持重连；仅保存已经实际收到的文本，不伪造中间内容。发布通道不可用时仍保存最终回答；页面降级查询同一个任务，不重新发起模型调用。
- 流通道定时重连并补发当前文本快照，避免同一段重复追加。刷新后可恢复仍在生成的云端任务。最终状态以Supabase为准。
- 访客直接接收Worker转发的SSE，带图请求保留真实XHR上传进度。未完成的答案不加入后续模型历史；访客刷新仍按原设计清空。
- 持续显示Markdown、正在输出状态和已用时间；用户上滑阅读时不强制滚到底。复制入口在回答完成后出现。
- 上游网络中断或格式错误会保留已显示内容并标记“未完成”，提供明确重试；不把断开的流当作成功，不自动重发可能已计费的主聊天请求。恢复只查询现有任务。
- 临时云端流缓存最后更新约10分钟后清理，长期历史仍由Supabase管理。此说明已补充到隐私弹窗。

## 部署（本次没有Supabase SQL升级）

1. 用petai-worker-v55-source.zip更新整个Worker仓库，特别是src/answer-stream.js、src/streaming.js、src/sse.js、public/index.html以及wrangler.jsonc。不要只替换HTML。
2. wrangler.jsonc新增durable_objects绑定ANSWER_STREAMS及迁移answer-stream-v1/new_sqlite_classes:AnswerStream。通过仓库现有部署流程或npm run deploy部署，Wrangler会创建/绑定该命名空间。保留现有Cloudflare变量、FastGPT和Supabase密钥。
3. 已上线应用若使用Dashboard“编辑代码”粘贴JS，无法完整应用这份配置；请用完整仓库执行Wrangler部署。之后继续保留这条Cloudflare迁移配置，不要在下一版本删除。
4. /health应显示version=1.24.0、streaming=true。若streaming=false，检查ANSWER_STREAMS绑定及部署配置。
5. 若前端单独托管，用6137-55.html或petai-frontend/index.html替换页面；Worker托管已包含同一页面。
6. FastGPT主工作流与独立记忆工作流无需更换，也无需执行新的Supabase SQL。此前001—013数据库升级继续保留。

## 上线验证

打开浏览器Network发送新问题：登录模式的/api/turns/…/stream或访客/api/guest/chat应返回text/event-stream。回答生成期间就应出现内容及“正在输出”；结束后复制全文、刷新会话，应与FastGPT公开答案一致。可中途断网后恢复，验证保留部分内容和恢复查询；已结束历史不重复打字。

首次文字前仍需等待队列、记忆提取、检索/图片识别及隐藏草稿节点；流式只能加快最终答案开始返回之后的显示。若学校模型或网关忽略stream=true并返回JSON，仍按原文展示完整结果，不伪造流。若网关缓存SSE到最后，必须由学校调整网关或模型代理，前端和Worker无法使尚未收到的内容提前出现。

学校真实接口未被调用，未读取密钥，未代为部署。已验证官方协议兼容及本地模拟流；学校网关的实际缓冲行为需要部署后实测，不能在本地承诺。

## 本地验证

- 117项后端测试：SSE字节拆分、中文/emoji、CRLF、多行data、原文空白保留、忽略内部事件、部分流中断不误报成功、访客增量与结束事件、Durable Object缓存重连与清理、账号权限隔离、真实队列流式发布后完整保存。
- 70项前端测试：答案未结束时已显示首段、Markdown和复制完成态、中断保留及历史排除、带图上传进度与同步接收SSE、流通道故障降级且只提交一次任务。已有jsdom装饰插画的窗口清理警告可能出现在测试日志中，全部断言通过。
- Wrangler dry-run已验证导出与ANSWER_STREAMS绑定配置；额外使用真实workerd + SQLite Durable Object完成了部分文本推送、最终全文、SSE终止的运行验证，并确认生产导出继承Cloudflare DurableObject基类。Node单元测试仅使用测试专用运行时shim，生产包绑定真实Cloudflare基类。不代表已创建线上资源。本地浏览器完成分段响应预览，outputs/petai-v55/streaming-preview.png使用模拟SSE数据，不是学校线上结果。

参考：[FastGPT Chat API](https://doc.fastgpt.io/en/openapi/chat)、[Cloudflare子请求限制](https://developers.cloudflare.com/workers/platform/limits/)、[SQLite Durable Object配置](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)。
