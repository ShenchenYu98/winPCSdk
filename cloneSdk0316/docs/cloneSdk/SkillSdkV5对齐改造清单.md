# SkillSdk V5 对齐改造清单

建议按 `P0 -> P1 -> P2` 顺序推进，先把协议契约对齐，再修缓存与连接行为，最后补测试和文档。

## P0 契约必须对齐

- `welinkSessionId` 全面改为 `string`，包括入参、返回值、缓存 key、WS 解析结果，禁止再做 `Number(...)` 强转。涉及 [types.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/types.ts)、[eventNormalizer.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/eventNormalizer.ts)、[skillServerClient.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/client/skillServerClient.ts)、[sessionOrchestrator.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/sessionOrchestrator.ts)、[streamConnectionManager.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/streamConnectionManager.ts)。
- `PageResult<T>` 改为文档/服务端格式：`content`、`number`、`size`、`totalElements`。涉及 [types.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/types.ts)、[messageCacheStore.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/messageCacheStore.ts)、[skillServerClient.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/client/skillServerClient.ts)。
- `SkillSession`、`SendMessageResult`、`SessionMessage`、`SessionMessagePart`、`StreamMessage` 按 V5/服务端字段补齐，去掉自定义别名字段。重点补 `seq`、`contentType`、`meta`、`sourceMessageId`、`status`、`input`、`output`、`error`、`title`、`header`、`permType`、`metadata`、`response`。涉及 [types.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/types.ts)。
- `SendMessageToIMResult` 改为 `{ success: boolean }`，不要再包装成 `status: "success" | "failed"`。涉及 [types.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/types.ts)、[skillServerClient.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/client/skillServerClient.ts)、[sessionOrchestrator.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/sessionOrchestrator.ts)。
- `CreateSessionParams.ak` 改为可选；`createOrReuseSession` 查询逻辑按文档支持“有 `ak` 用 `imGroupId + ak + ACTIVE`，无 `ak` 用 `imGroupId + ACTIVE`”。涉及 [types.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/types.ts)、[skillServerClient.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/client/skillServerClient.ts)。

## P1 行为逻辑对齐

- `createSession` 复用会话时按 `updatedAt` 倒序取最新一条，不要直接拿 `content[0]`。涉及 [skillServerClient.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/client/skillServerClient.ts)。
- `closeSkill` 按文档补全清理动作：关闭 WS、清理监听器、状态回调、流式缓存、本地重连状态。涉及 [SkillSdk.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/SkillSdk.ts)、[streamConnectionManager.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/streamConnectionManager.ts)、[messageCacheStore.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/messageCacheStore.ts)。
- `registerSessionListener` 保持“先注册后建连可生效”的语义，同时为后续 `resume` 留接口；当前这部分基本可用，但连接恢复逻辑还没补。涉及 [streamConnectionManager.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/streamConnectionManager.ts)。
- `getSessionMessage` 的合并排序改为“优先 `seq`，再 `messageSeq`”，并保留进行中消息。涉及 [messageCacheStore.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/messageCacheStore.ts)。
- `sendMessageToIM` 按文档区分错误码：`4003` 消息不存在、`4004` 消息未完成、`4005` 无完成消息，不要统一 `4000`。涉及 [sessionOrchestrator.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/sessionOrchestrator.ts)。
- `regenerateAnswer` 无用户消息时错误码改为 `4002`，并保持返回结构与 `sendMessage` 完全一致。涉及 [sessionOrchestrator.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/sessionOrchestrator.ts)、[types.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/types.ts)。
- `onSkillWecodeStatusChange` 增加 `callback` 参数校验，和文档一致。涉及 [miniappBridge.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/miniappBridge.ts)、[SkillSdk.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/SkillSdk.ts)。

## P1 WS 与缓存模型对齐

- `normalizeStreamMessage` 保留服务端原始字段，不做丢字段映射；尤其要保住字符串 ID 和 `sourceMessageId`。涉及 [eventNormalizer.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/eventNormalizer.ts)。
- `MessageCacheStore` 中的 part 字段从 `toolStatus/toolInput/toolOutput` 改成协议原字段 `status/input/output`，并补 `error/title/header/permType/metadata/response` 的缓存落盘。涉及 [messageCacheStore.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/messageCacheStore.ts)。
- `permission.ask`、`permission.reply`、`question`、`tool.update`、`streaming`、`snapshot` 的聚合规则按服务端结构补齐，保证 `SessionMessagePart` 和 `StreamMessage.parts` 一致。涉及 [messageCacheStore.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/messageCacheStore.ts)。
- `buildContent` 需要重新定义聚合策略，避免工具输出、问题、权限标题被无条件拼到最终正文里；这部分要以 V5 对“完成消息内容”的定义为准。涉及 [messageCacheStore.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/messageCacheStore.ts)。

## P2 连接恢复与兼容性

- 浏览器 WS 连接补重连策略，至少支持断线后重建连接。涉及 [createBrowserSkillSdk.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/browser/createBrowserSkillSdk.ts)、[streamConnectionManager.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/streamConnectionManager.ts)。
- 连接恢复后补发 `{"action":"resume"}`，消费服务端 `snapshot` + `streaming` 恢复缓存。涉及 [createBrowserSkillSdk.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/browser/createBrowserSkillSdk.ts)、[streamConnectionManager.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/core/streamConnectionManager.ts)。
- 运行期 WS `error` 事件需要转发到 `onError`，不能只在首次建连失败时 reject。涉及 [createBrowserSkillSdk.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/src/browser/createBrowserSkillSdk.ts)。

## P2 测试与文档

- 全量更新类型测试，改成字符串 `welinkSessionId`、新分页字段、新消息字段。涉及 [types.test.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/tests/unit/types.test.ts)。
- 补 SDK 行为测试：`ak` 可选、按 `updatedAt` 复用、`sendMessageToIM` 新返回结构、`4003/4004/4005`、`4002`、`seq` 排序、`resume` 恢复。涉及 [skillSdk.test.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/tests/unit/skillSdk.test.ts)、[messageCacheStore.test.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/tests/unit/messageCacheStore.test.ts)、[skillServerClient.test.ts](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/tests/unit/skillServerClient.test.ts)。
- 更新 README 和对外示例，避免继续展示数字型 `welinkSessionId` 和旧版 `status` 风格 `sendMessageToIMResult`。涉及 [README.md](/D:/featProject/gitHub/winPCSdk/winPCSdk0313/README.md)。

## 建议拆分成 4 个提交

1. 类型契约对齐
2. REST 返回与错误码对齐
3. WS 缓存与消息聚合对齐
4. 重连恢复、测试、文档补齐
