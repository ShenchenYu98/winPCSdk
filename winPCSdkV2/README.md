# Skill WinPC SDK

TypeScript SDK MVP implementation for Skill Client capabilities.

## Features

- Frozen API surface: 13 methods via `createSkillClient`.
- Unified types: `SkillSession.id` and `userId` are `string`.
- Unified stream routing: `StreamMessage.sessionId` is required.
- Unified error object: `SkillSdkError`.
- Connection policy defaults with env override (`dev/test/prod`).
- Session store, connection manager, listener bus isolation, message merge engine, error normalizer.
- Mock REST/WS harness and L7 fixture script.

## Quick Start

```bash
cd skill-winPc
npm install
npm run typecheck
npm run test
npm run l7
```

## Web UI Harness (inside skill-winPc)

1. Start mock backend in terminal A:

```bash
cd skill-winPc
npm run mock:server
```

`mock:server` defaults to a slow-visible stream mode for UI verification.  
Use `npm run mock:server -- --fast-stream` for faster test-style streaming.

2. Start Web UI in terminal B:

```bash
cd skill-winPc
npm run ui:dev
```

3. Open browser on the printed Vite URL and run actions directly in UI:
- Init Client
- executeSkill
- registerSessionListener / onSessionStatusChange
- sendMessage / stopSkill / regenerateAnswer
- sendMessageToIM / replyPermission / controlSkillWeCode
- closeSkill

The Web UI is implemented under `ui/` and does not depend on `skill-miniapp`.

### Pages
- `http://localhost:<vite-port>/index.html`: API harness page
- `http://localhost:<vite-port>/im-chat.html`: IM chat scenario page (command `/skillName ...`, execute/send/stop switch, mini app container simulation)

## Public API

```ts
import { createSkillClient } from '@opencode-cui/skill-winpc-sdk';

const client = createSkillClient({
  baseUrl: 'http://localhost:8082',
  wsUrl: 'ws://localhost:8082',
  env: 'prod',
});
```

## SDK 接入指导（全接口）

### 1) 初始化客户端

#### `createSkillClient(initOptions)`

功能说明：创建 SDK 客户端实例，后续所有接口都通过该实例调用。

入参 `SkillClientInitOptions`：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `baseUrl` | `string` | 是 | Skill REST 服务地址，例如 `http://127.0.0.1:19082` |
| `wsUrl` | `string` | 否 | Skill WS 服务地址，默认使用 `baseUrl` |
| `env` | `'dev' \| 'test' \| 'prod'` | 否 | 连接策略环境，默认 `prod` |
| `connectionPolicy` | `Partial<ConnectionPolicy>` | 否 | 自定义重连/心跳参数 |
| `autoConnectOnRegister` | `boolean` | 否 | `registerSessionListener` 时是否自动建连，默认 `true` |
| `autoDisconnectWhenNoListeners` | `boolean` | 否 | 无监听器时是否自动断连，默认 `true` |
| `listenerCircuitBreakerThreshold` | `number` | 否 | 监听器异常熔断阈值，默认 `5` |
| `fetchImpl` | `typeof fetch` | 否 | 自定义 fetch 实现（测试/Node 场景） |
| `socketFactory` | `SocketFactory` | 否 | 自定义 WebSocket 工厂（测试场景） |

出参：`SkillClient`

---

### 2) `SkillClient` 接口清单（13个核心接口）

| 接口 | 功能 |
| --- | --- |
| `executeSkill` | 创建会话并自动发送首条技能内容 |
| `closeSkill` | 关闭 SDK：断连、清监听、清会话与缓存 |
| `stopSkill` | 终止指定会话（兼容服务端 DELETE 语义） |
| `onSessionStatusChange` | 监听会话执行状态（不主动建连） |
| `onSkillWecodeStatusChange` | 监听技能小窗状态（close/minimize） |
| `regenerateAnswer` | 基于最近一条用户消息重新生成回答 |
| `sendMessageToIM` | 将内容同步到 IM 会话 |
| `getSessionMessage` | 分页拉取会话历史消息（含流式合并结果） |
| `registerSessionListener` | 注册流式消息监听器（支持 onMessage/onError/onClose） |
| `unregisterSessionListener` | 注销流式消息监听器 |
| `sendMessage` | 对指定会话继续发送消息 |
| `replyPermission` | 响应权限请求（同意/拒绝） |
| `controlSkillWeCode` | 控制技能小窗（最小化/关闭） |

---

### 3) 各接口接入说明（功能 + 出入参）

#### 3.1 `executeSkill(params)`

功能说明：创建一个新的技能会话，并自动发送首条消息 `skillContent`。

入参 `ExecuteSkillParams`：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `imChatId` | `string` | 是 | IM 会话标识 |
| `skillDefinitionId` | `number` | 是 | 技能定义 ID（正整数） |
| `userId` | `string` | 是 | 用户 ID |
| `skillContent` | `string` | 是 | 首条执行内容 |
| `title` | `string` | 否 | 会话标题 |
| `agentId` | `number` | 否 | 指定 agent |

出参 `Promise<SkillSession>`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 会话 ID |
| `userId` | `string` | 用户 ID |
| `skillDefinitionId` | `number` | 技能定义 ID |
| `agentId` | `number?` | agent ID |
| `toolSessionId` | `string?` | 工具侧会话 ID |
| `title` | `string?` | 标题 |
| `status` | `'ACTIVE' \| 'IDLE' \| 'CLOSED'` | 生命周期状态 |
| `imChatId` | `string` | IM 会话 ID |
| `createdAt` | `string` | 创建时间（ISO） |
| `lastActiveAt` | `string` | 最近活跃时间（ISO） |

#### 3.2 `closeSkill()`

功能说明：关闭 SDK，释放连接、监听器、会话状态与消息缓存（幂等）。

入参：无  
出参 `Promise<CloseSkillResult>`：`{ status: 'success' | 'failed' }`

#### 3.3 `stopSkill(params)`

功能说明：终止指定会话。  
入参 `StopSkillParams`：`{ sessionId: string }`  
出参 `Promise<StopSkillResult>`：`{ status: 'success' | 'failed' }`

#### 3.4 `onSessionStatusChange(params)`

功能说明：订阅会话执行态变化；仅消费已有 WS 事件，不触发主动建连。

入参 `OnSessionStatusChangeParams`：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sessionId` | `string` | 是 | 会话 ID |
| `callback` | `(result: SessionStatusResult) => void` | 是 | 状态回调 |

回调参数 `SessionStatusResult`：`{ status: 'executing' | 'stopped' | 'completed' }`

#### 3.5 `onSkillWecodeStatusChange(params)`

功能说明：监听技能小窗状态变化。  
入参 `OnSkillWecodeStatusChangeParams`：`{ callback }`

回调参数 `SkillWecodeStatusResult`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `status` | `'closed' \| 'minimized'` | 小窗状态 |
| `timestamp` | `number` | 触发时间戳 |
| `message` | `string?` | 附加信息 |

出参：无（通过回调消费）

#### 3.6 `regenerateAnswer(params)`

功能说明：基于历史中最近一条 `USER` 消息触发重答。

入参 `RegenerateAnswerParams`：`{ sessionId: string }`  
出参 `Promise<AnswerResult>`：`{ messageId: string; success: boolean }`

#### 3.7 `sendMessageToIM(params)`

功能说明：将内容同步到 IM 会话。

入参 `SendMessageToIMParams`：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sessionId` | `string` | 是 | 会话 ID |
| `content` | `string` | 是 | 待发送内容 |

出参 `Promise<SendMessageToIMResult>`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 是否成功 |
| `chatId` | `string?` | IM 会话 ID |
| `contentLength` | `number?` | 内容长度 |
| `errorMessage` | `string?` | 失败原因 |

#### 3.8 `getSessionMessage(params)`

功能说明：分页拉取消息历史；SDK 会合并流式缓存并去重。

入参 `GetSessionMessageParams`：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sessionId` | `string` | 是 | 会话 ID |
| `page` | `number` | 否 | 页码，默认 `0` |
| `size` | `number` | 否 | 页大小，默认 `50` |

出参 `Promise<PageResult<ChatMessage>>`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `content` | `ChatMessage[]` | 消息列表 |
| `totalElements` | `number` | 总条数 |
| `totalPages` | `number` | 总页数 |
| `number` | `number` | 当前页码 |
| `size` | `number` | 当前页大小 |

`ChatMessage` 字段：`id, sessionId, seq, role, content, contentType, createdAt, meta?`

#### 3.9 `registerSessionListener(params)`

功能说明：为会话注册流式监听器。支持多监听器并发，逐监听器隔离和异常熔断。

入参 `RegisterSessionListenerParams`：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sessionId` | `string` | 是 | 会话 ID |
| `onMessage` | `(message: StreamMessage) => void` | 是 | 流式消息回调 |
| `onError` | `(error: SkillSdkError) => void` | 否 | 错误回调 |
| `onClose` | `(reason: string) => void` | 否 | 关闭回调 |

出参：无

#### 3.10 `unregisterSessionListener(params)`

功能说明：移除会话监听器；若无剩余监听器可触发自动断连（取决于配置）。

入参 `UnregisterSessionListenerParams`：与 `registerSessionListener` 一致。  
出参：无（若监听器不存在会抛 `LISTENER_NOT_FOUND`）

#### 3.11 `sendMessage(params)`

功能说明：向既有会话发送消息，触发新的流式回复。

入参 `SendMessageParams`：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sessionId` | `string` | 是 | 会话 ID |
| `content` | `string` | 是 | 消息内容 |

出参 `Promise<SendMessageResult>`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `messageId` | `string` | 消息 ID |
| `seq` | `number` | 序号 |
| `createdAt` | `string` | 创建时间（ISO） |

#### 3.12 `replyPermission(params)`

功能说明：响应权限请求，形成权限闭环。

入参 `ReplyPermissionParams`：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sessionId` | `string` | 是 | 会话 ID |
| `permissionId` | `string` | 是 | 权限请求 ID |
| `approved` | `boolean` | 是 | `true` 同意，`false` 拒绝 |

出参 `Promise<ReplyPermissionResult>`：`{ success, permissionId, approved }`

#### 3.13 `controlSkillWeCode(params)`

功能说明：控制技能小窗行为。

入参 `ControlSkillWeCodeParams`：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `action` | `'close' \| 'minimize'` | 是 | 控制动作 |

出参 `Promise<ControlSkillWeCodeResult>`：`{ status: 'success' | 'failed' }`

---

### 4) 观测接口（补充）

#### `getMetricsSnapshot()`

功能说明：获取 SDK 运行指标快照（调用成功率、重连、回调、时延 P95 等）。

入参：无  
出参 `MetricsSnapshot`：

`interfaceCalls, interfaceSuccess, wsReconnects, callbackDelivered, callbackFailed, firstPacketLatencyMsP95, dispatchLatencyMsP95, permissionCycleMsP95`

---

### 5) 统一错误对象

所有接口抛错统一为 `SkillSdkError`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | `string` | 错误码 |
| `message` | `string` | 错误信息 |
| `httpStatus` | `number?` | HTTP 状态码 |
| `retriable` | `boolean` | 是否建议重试 |
| `source` | `'REST' \| 'WS' \| 'SDK'` | 错误来源 |
| `sessionId` | `string?` | 关联会话 |
| `timestamp` | `number` | 时间戳 |

常见 `code`：

`INVALID_ARGUMENT`、`SESSION_NOT_FOUND`、`SESSION_CLOSED`、`SESSION_TERMINATED_AFTER_STOP`、`LISTENER_NOT_FOUND`、`NO_USER_MESSAGE_FOR_REGENERATE`、`CONNECTION_UNAVAILABLE`、`WS_ERROR`、`REST_ERROR`、`NETWORK_ERROR`、`INTERNAL_ERROR`

## Test Coverage Layout

- Unit tests: `tests/unit/skill-client.interfaces.spec.ts` (13 interfaces, >=5 tests each).
- Integration tests: `tests/integration/linked-chains.spec.ts` (L1-L7 chains, >=3 tests each).
- Mock server: `src/mock/mock-skill-server.ts`.
- L7 runnable fixture: `scripts/run-l7.ts`.
- Web UI harness: `ui/index.html` + `ui/main.ts`.
- IM scenario page: `ui/im-chat.html` + `ui/im-chat.ts`.

## Notes

- `stopSkill` remains `DELETE /api/skill/sessions/{id}` for compatibility.
- If post-stop `sendMessage` returns 404/409, SDK maps to `SESSION_TERMINATED_AFTER_STOP` with `retriable=true`.
