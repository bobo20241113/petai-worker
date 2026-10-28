# 宠AI v17：图片被当成文档的修复

截图中“Only support ... \"\" is not supported”与“无图片”的组合，说明识别节点执行了，但其文件引用被当成不支持的文档，不代表用户没上传。

## 已定位的原因

原Worker把私有图片路径写成`owner/conversation/uuid`，没有图片后缀。FastGPT V4.14.5在AI节点的fileUrlList路径中，会重新调用parseUrlToFileType按URL的filename参数或路径后缀分类；无后缀会成为file，而非image，随后出现文档解析错误。

这是原上传实现的兼容性遗漏。参考官方固定版本源码：

- [文件类型推断](https://github.com/labring/FastGPT/blob/v4.14.5/packages/global/common/file/tools.ts)
- [AI节点多模态输入](https://github.com/labring/FastGPT/blob/v4.14.5/packages/service/core/workflow/dispatch/ai/chat.ts)
- [OpenAI image_url转聊天附件](https://github.com/labring/FastGPT/blob/v4.14.5/packages/global/core/chat/adapt.ts)

## 后端更新

更新petai-worker源码并重新部署：

- 新图片对象带真实`.jpg/.png/.webp`后缀。
- 旧对象不重命名，生成签名URL时加FastGPT支持的`filename=petai-image.jpg`类型提示，保留原token及对象路径。
- 继续以OpenAI兼容的image_url发送，图片仍是私有存储，不改成公开bucket。
- 自动记忆拒绝把“这是什么猫”生成主人事实，也不将“猫/狗/宠物”等类别词当作新名字。明确说“名字叫猫”仍可正常处理。

新增实现文件src/images.js，修改src/index.js、src/jobs.js、src/memory.js；相应回归测试在tests/images.test.js。没有新增变量或数据库迁移，不需要重建表。

签名URL追加filename依赖Supabase对附加查询参数的正常处理；本地测试确认原路径及token没有被修改，学校/Supabase实网仍需你更新部署后上传图片验证。

## FastGPT配置（二选一）

### 推荐：在现有应用中修改，保留已绑定知识库与联网密钥

1. 打开“图片识别（新增）”节点，清空它的“文件链接”引用（即fileUrlList），让其直接使用本轮原生上传图片。
2. 日常养宠、宠物健康节点的fileUrlList也清空，避免把同一张图片再次当文档解析。
3. **图片识别节点选择学校实际支持视觉/图片的模型。** 仅把aiChatVision勾为true不会让文本模型获得视觉能力，学校模型配置也必须vision=true。无法根据导出文件确认学校具体模型清单，所以未擅自替换为一个可能不存在的模型名。
4. 在最终回答的提示词中引用`{{$petcareImageVision2026.answerText$}}`，要求先回答本轮图片问题，读取失败则说明失败，不用档案列表代替视觉回答。可从v17模板复制相应提示词。
5. 发布工作流后再测试。

### 或导入新版JSON

`6137-17.json`是图片修复时的模板；当前`fastgpt/chat-cloud.json`已合并v18上下文修复，并继续保留以下图片修复：清空上述文件链接，增加最终回答的图片观察约束。公开模板不携带学校HTTP密钥；导入时自行恢复知识库和联网鉴权，并选择学校实际可用的视觉模型。

记忆提取工作流也补充了禁止类别词命名的规则，文件是`petai-worker/fastgpt/memory-extractor.json`；可复制新systemPrompt到现有记忆应用，或重新导入。Worker端已有独立校验，因此即使提取器没及时更新，“这是什么猫”也不会通过新后端生成档案。

## 验收与既有数据

- 新建会话，上传图片问“这是什么猫”：识别节点应含真实图片输入，不再出现空扩展名文档错误；回答应针对外观/可能品种，不能只列档案。
- 不上传图片的普通问题仍能使用正常文本流程。
- 纯图片询问不新建“猫”档案；介绍“我家豆豆是猫”仍可自动建立豆豆资料。
- 已经误建的历史档案不会被本次更新自动删除。测试时先用不关联旧档案的新会话，确认后再单独处理旧错误数据，避免误删正常记录。

本地测试验证了文件命名、签名URL分类、实际上传路由和记忆拦截；不等于已用学校模型完成识别效果验收。
