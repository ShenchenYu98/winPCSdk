# Agent Skill 调用模块详细技术方案设计文档 V1.0

## 1. 文档说明

本文档用于描述 **Agent Skill 调用模块** 的详细技术方案，作为研发实现、联调、测试和后续维护的依据。

本文档设计目标：

- 对齐需求文档 V1.3
- 对齐客户端 / 小程序 SDK 接口定义
- 对齐 Skill Server REST / WebSocket 接口规范
- 明确模块分层、核心流程、状态机、数据结构、异常处理、扩展策略
- 提供可直接指导前端工程实现的技术细节

---

## 2. 设计依据

### 2.1 SDK 接口依据

对客户端和小程序提供的接口，遵循以下 SDK 接口定义：

- `executeSkill`
- `closeSkill`
- `stopSkill`
- `onSessionStatus`
- `onSkillWecodeStatus`
- `regenerateAnswer`
- `sendMessageToIM`
- `getSessionMessage`
- `sendMessage`
- `replyPermission`
- `controlSkillWeCode`

### 2.2 服务端接口依据

服务端对接仅采用以下接口范围：

#### REST API
- `POST /api/skill/sessions`
- `GET /api/skill/sessions`
- `GET /api/skill/sessions/{id}`
- `DELETE /api/skill/sessions/{id}`
- `POST /api/skill/sessions/{sessionId}/messages`
- `GET /api/skill/sessions/{sessionId}/messages`
- `POST /api/skill/sessions/{sessionId}/permissions/{permId}`
- `POST /api/skill/sessions/{sessionId}/send-to-im`

#### WebSocket
- `ws://{host}:8082/ws/skill/stream/{sessionId}`

### 2.3 通信原则

- 只有执行技能后的返回结果通过 WebSocket 流式返回
- 其余接口全部通过 REST API
- WebSocket 仅承担“结果流订阅”职责，不承担控制指令职责

---

## 3. 总体设计目标

本模块设计为一个 **前端 Skill Runtime + SDK 聚合层**，具备以下能力：

1. 聚合对外 SDK 接口，屏蔽底层 REST / WebSocket 细节
2. 面向服务端封装统一的 API Client 与 Stream Client
3. 管理会话、消息、状态、回调、缓存
4. 同时支持 Agent 客户端与 Agent 小程序使用
5. 支持多会话并发、多轮对话、断线恢复、小程序生命周期联动

---

## 4. 总体架构设计

## 4.1 架构分层

```text
┌─────────────────────────────────────────────┐
│                 上层业务接入层               │
│      Agent 客户端 / Agent 小程序 / IM UI     │
└─────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│               SDK Facade / Runtime           │
│ executeSkill / sendMessage / stopSkill / ... │
└─────────────────────────────────────────────┘
            │                │               │
            ▼                ▼               ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────────┐
│ Session Store  │  │ Message Store  │  │ Status/Event Center │
└────────────────┘  └────────────────┘  └────────────────────┘
            │                │               │
            └────────┬───────┴───────┬──────┘
                     ▼               ▼
          ┌────────────────┐  ┌──────────────────┐
          │ REST API Client │  │ Stream WS Client │
          └────────────────┘  └──────────────────┘
                     │               │
                     └──────┬────────┘
                            ▼
                 ┌──────────────────────┐
                 │     Skill Server      │
                 │  REST + WebSocket     │
                 └──────────────────────┘
```

---

## 4.2 模块职责

### 4.2.1 SDK Facade / Runtime
对外提供统一接口，负责：

- 方法聚合
- 参数校验
- 业务编排
- 状态驱动
- 事件派发
- 多层对象协调

### 4.2.2 REST API Client
负责：

- Skill Server REST 请求封装
- 请求参数适配
- 返回结果标准化
- 超时、重试、异常映射

### 4.2.3 Stream WS Client
负责：

- 按 `sessionId` 建立 WebSocket 流式连接
- 订阅和取消订阅
- 消息解析
- 增量拼接
- 重连控制
- seq 去重与乱序保护

### 4.2.4 Session Store
负责：

- 会话列表缓存
- 会话详情缓存
- 会话状态管理
- session 与 stream 的绑定关系管理

### 4.2.5 Message Store
负责：

- 消息历史缓存
- 当前流式生成中的 assistant 消息缓存
- 按 sessionId 聚合消息
- 重新生成时提取最后一条 USER 消息

### 4.2.6 Status/Event Center
负责：

- `onSessionStatus`
- `onSkillWecodeStatus`
- 流式消息监听派发
- 生命周期广播

### 4.2.7 MiniProgram Controller
负责：

- 小程序关闭、最小化控制
- 小程序生命周期事件监听
- 小程序状态与会话联动

---

## 5. 核心设计原则

### 5.1 Facade 优先
上层只感知 SDK 接口，不直接调用 REST / WebSocket。

### 5.2 会话为核心
所有消息流、历史记录、状态、事件都围绕 `sessionId` 管理。

### 5.3 消息驱动
Skill 执行本质是“发送用户消息后，订阅该会话的 AI 响应流”。

### 5.4 WebSocket 轻职责
WebSocket 仅承担结果流式推送，不处理会话控制。

### 5.5 可恢复
WebSocket 可断线重连；REST 请求可重试；状态可从历史恢复。

### 5.6 多端复用
客户端和小程序复用同一核心 Runtime，仅在生命周期和平台能力上差异适配。

---

## 6. 分层实现设计

## 6.1 RestClient 设计

### 6.1.1 目标
统一封装 Skill Server REST 接口，输出强类型方法。

### 6.1.2 建议接口

```ts
interface SkillRestApi {
  createSession(payload: CreateSessionRequest): Promise<SkillSession>;
  getSessionList(params: GetSessionListParams): Promise<PageResult<SkillSession>>;
  getSessionDetail(sessionId: string): Promise<SkillSession>;
  closeSession(sessionId: string): Promise<CloseSessionResponse>;

  sendUserMessage(sessionId: string, payload: SendMessageRequest): Promise<ChatMessage>;
  getSessionMessages(sessionId: string, page?: number, size?: number): Promise<PageResult<ChatMessage>>;
  replyPermission(sessionId: string, permissionId: string, payload: ReplyPermissionRequest): Promise<ReplyPermissionResponse>;
  sendMessageToIM(sessionId: string, payload: SendToIMRequest): Promise<SendToIMResponse>;
}
```

### 6.1.3 统一处理能力

- 基础 URL 配置
- 统一 headers
- 请求超时
- 请求日志
- 响应日志
- 错误码转换
- 可选重试（只针对查询类接口）

### 6.1.4 REST 错误处理策略

| HTTP 状态码 | SDK错误码 | 说明 |
|---|---|---|
| 400 | INVALID_PARAMS | 参数错误 |
| 404 | SESSION_NOT_FOUND | 会话不存在 |
| 409 | SESSION_CLOSED / CONFLICT | 状态冲突 |
| 500 | SERVER_INTERNAL_ERROR | 服务端异常 |

---

## 6.2 StreamClient 设计

## 6.2.1 目标
管理按 `sessionId` 的 WebSocket 结果流连接。

## 6.2.2 关键点

- 一个 `sessionId` 对应一个连接实例
- 同一 `sessionId` 多处订阅时复用同一连接
- 每个连接维护：
  - connection state
  - seq 游标
  - buffer
  - subscriber 集合
  - reconnect timer

## 6.2.3 连接状态

```ts
type StreamConnectionState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'
  | 'error';
```

## 6.2.4 核心能力

```ts
interface SkillStreamClient {
  subscribe(sessionId: string, listener: StreamListener): () => void;
  ensureConnection(sessionId: string): Promise<void>;
  disconnect(sessionId: string): void;
  disconnectAll(): void;
}
```

## 6.2.5 单会话连接模型

```ts
type SessionStreamRuntime = {
  sessionId: string;
  ws?: WebSocket;
  state: StreamConnectionState;
  lastSeq: number;
  reconnectCount: number;
  subscribers: Set<StreamListener>;
  fullText: string;
  currentMessageId?: string;
  currentAssistantBuffer: string[];
  isStoppedByUser: boolean;
};
```

## 6.2.6 WebSocket 消息处理规则

### delta
- 校验 `seq > lastSeq`
- 追加到 `currentAssistantBuffer`
- 合并为 `fullText`
- 更新状态为 `executing`
- 派发 `onMessage`
- 派发 `onSessionStatus(executing)`

### done
- 记录 usage 信息
- 将当前 assistant buffer 持久化到 Message Store
- 更新状态为 `completed`
- 派发 `onSessionStatus(completed)`

### error
- 标记本轮失败
- 更新状态为 `stopped`
- 派发 `onMessage`
- 派发 `onSessionStatus(stopped)`

### agent_online
- 派发状态 `executing`
- 可用于 UI 显示 Agent 已恢复

### agent_offline
- 派发状态 `stopped`
- 可用于 UI 显示 Agent 离线

## 6.2.7 seq 去重策略

- 若消息 `seq <= lastSeq`，直接丢弃
- 若 `seq > lastSeq + 1`，记录乱序告警
- 本期不做复杂重排，仅顺序接收
- 重连后重新从服务端继续接收；如有缺失，由历史消息查询恢复

## 6.2.8 重连策略

### 自动重连条件
- 非用户主动 stop / close
- 非 session 已关闭
- 非小程序主动 close

### 重连策略
- 最大重连次数：3
- 延迟：1s / 2s / 4s
- 重连成功后恢复订阅
- 重连期间派发内部状态 `reconnecting`

### 不重连场景
- 用户执行 `stopSkill`
- 用户执行 `closeSkill`
- 小程序执行 `controlSkillWeCode(close)`

---

## 6.3 SessionStore 设计

### 6.3.1 职责

- 管理会话列表
- 管理会话详情
- 管理会话状态
- 管理 session 与 stream 的绑定关系

### 6.3.2 建议数据结构

```ts
type SessionRecord = {
  session: SkillSession;
  status: 'idle' | 'pending' | 'executing' | 'stopped' | 'completed' | 'failed' | 'closed';
  streamConnected: boolean;
  lastError?: string;
  updatedAt: number;
};

type SessionStoreState = {
  byId: Map<string, SessionRecord>;
  listByUserId: Map<string, string[]>;
};
```

### 6.3.3 写入来源

- `createSession`
- `getSessionList`
- `getSessionDetail`
- `closeSession`
- `stream delta / done / error / agent status`

---

## 6.4 MessageStore 设计

### 6.4.1 职责

- 管理历史消息
- 管理当前会话中的流式生成内容
- 提供最近一条 USER 消息查询
- 提供最近一次完整 ASSISTANT 消息查询

### 6.4.2 建议数据结构

```ts
type MessageStoreState = {
  bySessionId: Map<string, {
    list: ChatMessage[];
    currentStreaming?: {
      buffer: string[];
      fullText: string;
      startedAt: number;
      usage?: {
        inputTokens: number;
        outputTokens: number;
      };
    };
    pageInfo?: {
      page: number;
      size: number;
      totalElements: number;
      totalPages: number;
    };
  }>;
};
```

### 6.4.3 关键方法

```ts
interface SkillMessageStore {
  setMessages(sessionId: string, pageData: PageResult<ChatMessage>): void;
  appendStreamingDelta(sessionId: string, chunk: string): string;
  completeStreaming(sessionId: string, usage?: any): void;
  failStreaming(sessionId: string, error?: string): void;
  getLastUserMessage(sessionId: string): ChatMessage | undefined;
  getLastAssistantMessage(sessionId: string): ChatMessage | undefined;
}
```

---

## 6.5 EventCenter 设计

### 6.5.1 职责

提供以下事件管理能力：

- `onSessionStatus`
- `onSkillWecodeStatus`
- `sendMessage` 的 `onMessage`
- 会话级状态广播
- 小程序生命周期广播

### 6.5.2 建议事件类型

```ts
type SessionStatus = 'executing' | 'stopped' | 'completed';
type SkillWecodeStatus = 'closed' | 'minimized';

type EventMap = {
  sessionStatus: { sessionId: string; status: SessionStatus };
  streamMessage: { sessionId: string; message: StreamMessage };
  wecodeStatus: { status: SkillWecodeStatus };
};
```

### 6.5.3 实现建议
- 使用轻量事件总线
- 支持按 `sessionId` 粒度订阅
- 支持自动注销
- 避免重复注册造成内存泄漏

---

## 6.6 MiniProgram Controller 设计

### 6.6.1 职责

- 监听小程序关闭 / 最小化
- 触发 SDK 状态回调
- 协调 close / minimize 行为

### 6.6.2 设计原则

#### close
- 调用宿主原生关闭能力
- 调用 `closeSkill`
- 关闭 stream
- 清理资源
- 派发 `onSkillWecodeStatus('closed')`

#### minimize
- 调用宿主原生最小化能力
- 保持会话可恢复
- 连接策略可配置：
  - 默认保持 stream
  - 若平台限制可断开 stream 并在恢复时自动重连
- 派发 `onSkillWecodeStatus('minimized')`

### 6.6.3 平台适配方式

```ts
interface MiniProgramHostAdapter {
  close(): Promise<void>;
  minimize(): Promise<void>;
  onClosed(callback: () => void): () => void;
  onMinimized(callback: () => void): () => void;
}
```

---

## 7. SDK 对外接口设计

## 7.1 统一接口

```ts
interface SkillSDK {
  executeSkill(
    imChatId: string,
    userId: string,
    skillContent: string,
    agentId?: number,
    title?: string
  ): Promise<SkillSession>;

  closeSkill(sessionId: string): Promise<boolean>;

  stopSkill(sessionId: string): Promise<boolean>;

  onSessionStatus(
    sessionId: string,
    callback: (status: SessionStatus) => void
  ): void;

  onSkillWecodeStatus(
    callback: (status: SkillWecodeStatus) => void
  ): void;

  regenerateAnswer(sessionId: string): Promise<AnswerResult>;

  sendMessageToIM(sessionId: string, content: string): Promise<boolean>;

  getSessionMessage(
    sessionId: string,
    page?: number,
    size?: number
  ): Promise<PageResult<ChatMessage>>;

  sendMessage(
    sessionId: string,
    content: string,
    onMessage: (message: StreamMessage) => void
  ): Promise<boolean>;

  replyPermission(
    sessionId: string,
    permissionId: string,
    approved: boolean
  ): Promise<boolean>;

  controlSkillWeCode(action: SkillWeCodeAction): Promise<boolean>;

  copySkillResult?(sessionId: string, content?: string): Promise<boolean>;
}
```

---

## 7.2 方法实现策略

### 7.2.1 executeSkill

#### 业务语义
创建会话 + 建立流 + 发送首条消息。

#### 执行步骤
1. 调用 `createSession`
2. 写入 SessionStore
3. 建立该 sessionId 的 WebSocket 连接
4. 调用 `sendUserMessage`
5. 将状态置为 `pending`
6. 返回 SkillSession

#### 注意事项
- `skillDefinitionId` 在 SDK 未暴露，需要内部配置注入
- 如果 WebSocket 建立失败，应：
  - 会话创建已成功时保留会话
  - 返回错误，供上层决定是否重试
- 如果首条消息发送失败，应：
  - 保留会话
  - 上层可继续通过 `sendMessage` 发起

---

### 7.2.2 closeSkill

#### 业务语义
彻底关闭会话，不可恢复。

#### 执行步骤
1. 调用 `DELETE /api/skill/sessions/{sessionId}`
2. 关闭流式连接
3. 清理 Event 订阅
4. 清理 MessageStore 的 streaming 状态
5. 更新 SessionStore 状态为 `closed`
6. 返回 `true`

---

### 7.2.3 stopSkill

#### 业务语义
仅停止客户端接收结果流，不关闭服务端会话。

#### 执行步骤
1. 标记 `isStoppedByUser = true`
2. 断开该 session 对应 WebSocket
3. 更新 SessionStore 状态为 `stopped`
4. 派发 `onSessionStatus(stopped)`
5. 返回 `true`

#### 说明
- stop 后可以继续 `sendMessage`
- 再次 `sendMessage` 时需要重新建立 WebSocket

---

### 7.2.4 sendMessage

#### 业务语义
向既有会话发送一条用户消息，并持续接收新的流式结果。

#### 执行步骤
1. 参数校验
2. 如果 stream 未连接，则 `ensureConnection`
3. 注册本次 `onMessage` 监听
4. 调用 `POST /messages`
5. 将状态更新为 `pending`
6. 由 stream 持续驱动后续回调

#### 结果接收
- delta -> `onMessage`
- done -> `onMessage`
- error -> `onMessage`

---

### 7.2.5 getSessionMessage

#### 业务语义
查询消息历史并更新本地缓存。

#### 执行步骤
1. 调用 `GET /messages?page=x&size=y`
2. 将结果写入 MessageStore
3. 返回 PageResult

---

### 7.2.6 regenerateAnswer

#### 业务语义
使用最后一条 USER 消息重新发起一次回答。

#### 执行步骤
1. 从 MessageStore 读取最后一条 USER 消息
2. 如果本地没有，先调用 `getSessionMessage`
3. 重新建立 stream（如有必要）
4. 再次调用 `POST /messages`
5. 返回新的 AnswerResult

#### 注意事项
- 不覆盖旧回答
- 新回答视为新一轮 assistant 输出
- UI 层决定是否替换显示

---

### 7.2.7 sendMessageToIM

#### 执行步骤
1. 调用 `POST /send-to-im`
2. 成功则返回 `true`
3. 失败映射为 `SEND_TO_IM_FAILED`

---

### 7.2.8 replyPermission

#### 执行步骤
1. 调用 `POST /permissions/{permissionId}`
2. 返回 success

---

### 7.2.9 onSessionStatus

#### 行为
- 注册指定 session 的状态监听器
- 状态来自 stream 消息映射

#### 状态映射表

| WebSocket type | SessionStatus |
|---|---|
| delta | executing |
| done | completed |
| error | stopped |
| agent_offline | stopped |
| agent_online | executing |

---

### 7.2.10 onSkillWecodeStatus

#### 行为
- 注册小程序生命周期状态监听器
- 来源于宿主事件或 SDK 控制调用

---

### 7.2.11 controlSkillWeCode

#### close
1. 调用宿主 close
2. 联动 `closeSkill`
3. 派发 `closed`

#### minimize
1. 调用宿主 minimize
2. 保持会话可恢复
3. 派发 `minimized`

---

### 7.2.12 copySkillResult

#### 执行步骤
1. 若传入 content，直接复制
2. 否则读取最近一次 assistant 完整消息
3. 调用浏览器 / 宿主剪切板 API
4. 返回 success

---

## 8. 会话与消息状态机设计

## 8.1 会话内部状态

```ts
type InternalSessionState =
  | 'idle'
  | 'pending'
  | 'executing'
  | 'stopped'
  | 'completed'
  | 'failed'
  | 'closed';
```

## 8.2 状态流转

```text
            executeSkill / sendMessage
idle ---------------------------------> pending
                                           |
                                           | 收到 delta
                                           v
                                       executing
                                      /    |                                         /     |                                    done /   error     \ stopSkill
                                   v       v       v
                              completed  failed   stopped
                                   \        |        /
                                    \       |       /
                                     \      |      /
                                      \     |     /
                                       sendMessage
                                           |
                                           v
                                         pending

closeSkill ----------------------------------------> closed
```

## 8.3 对外状态映射

| 内部状态 | 对外 SessionStatus |
|---|---|
| pending | executing（可选不外露） |
| executing | executing |
| stopped | stopped |
| failed | stopped |
| completed | completed |
| closed | 不通过 onSessionStatus 暴露，交由 closeSkill 语义处理 |

---

## 9. 关键时序设计

## 9.1 executeSkill 时序

```text
Client
  |
  | executeSkill(imChatId, userId, skillContent, agentId, title)
  v
SkillSDK Runtime
  |
  | POST /api/skill/sessions
  v
Skill Server
  |----> 返回 SkillSession(sessionId)
  v
SkillSDK Runtime
  |
  | connect ws://{host}:8082/ws/skill/stream/{sessionId}
  v
Skill Server
  |
  | POST /api/skill/sessions/{sessionId}/messages
  v
Skill Server
  |
  | WebSocket push: delta / delta / done
  v
StreamClient
  |
  | 更新 MessageStore / SessionStore
  | 触发 onMessage / onSessionStatus
  v
Client
```

---

## 9.2 sendMessage 时序

```text
Client -> SkillSDK.sendMessage
       -> ensure WS connected
       -> POST /messages
       -> WS delta...
       -> WS done / error
       -> callback(onMessage)
```

---

## 9.3 regenerateAnswer 时序

```text
Client -> regenerateAnswer(sessionId)
       -> getLastUserMessage()
       -> ensure WS connected
       -> POST /messages(lastUserContent)
       -> WS delta...
       -> WS done
```

---

## 9.4 closeSkill 时序

```text
Client -> closeSkill(sessionId)
       -> DELETE /sessions/{id}
       -> disconnect ws(sessionId)
       -> clear stores
       -> return true
```

---

## 9.5 stopSkill 时序

```text
Client -> stopSkill(sessionId)
       -> mark stoppedByUser
       -> disconnect ws(sessionId)
       -> update session status = stopped
       -> return true
```

---

## 9.6 小程序关闭时序

```text
MiniProgram -> controlSkillWeCode(close)
            -> HostAdapter.close()
            -> closeSkill(sessionId)
            -> disconnect ws
            -> dispatch onSkillWecodeStatus(closed)
```

---

## 10. 数据结构设计

## 10.1 SessionStatus

```ts
type SessionStatus = 'executing' | 'stopped' | 'completed';
```

## 10.2 SkillWecodeStatus

```ts
type SkillWecodeStatus = 'closed' | 'minimized';
```

## 10.3 SkillWeCodeAction

```ts
type SkillWeCodeAction = 'close' | 'minimize';
```

## 10.4 SkillSession

```ts
type SkillSession = {
  id: number;
  userId: number;
  skillDefinitionId: number;
  agentId?: number;
  toolSessionId?: string;
  title?: string;
  status: 'ACTIVE' | 'IDLE' | 'CLOSED';
  imChatId?: string;
  createdAt: string | number;
  lastActiveAt?: string;
};
```

## 10.5 ChatMessage

```ts
type ChatMessage = {
  id: number;
  sessionId: number;
  seq: number;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  contentType: 'MARKDOWN' | 'CODE' | 'PLAIN';
  createdAt: string;
  meta?: string | null;
};
```

## 10.6 StreamMessage

```ts
type StreamMessage = {
  type: 'delta' | 'done' | 'error' | 'agent_offline' | 'agent_online';
  seq: number;
  content: any;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
};
```

## 10.7 PageResult<T>

```ts
type PageResult<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
};
```

## 10.8 AnswerResult

```ts
type AnswerResult = {
  messageId: string;
  success: boolean;
};
```

---

## 11. 关键实现细节

## 11.1 skillDefinitionId 注入策略

由于 SDK `executeSkill` 未暴露 `skillDefinitionId`，需采用以下方案之一：

### 方案 A：运行时配置注入（推荐）
```ts
new SkillSDK({
  skillDefinitionId: 1
})
```

### 方案 B：按 agentId 映射
```ts
agentId -> skillDefinitionId
```

### 方案 C：业务层初始化时注入 context
适合多 skillDefinition 业务场景。

---

## 11.2 WebSocket 复用策略

### 单 session 单连接
- 同一 sessionId 只维护一个连接对象
- 多个 `sendMessage` / `onSessionStatus` / UI 组件共享该连接

### 多 session 多连接
- 不同 sessionId 独立连接
- 便于并发会话和单会话 stop / close 控制

---

## 11.3 流式内容拼接策略

- delta 仅做字符串追加
- done 时将 buffer 固化为一条 ASSISTANT 消息
- error 时保留当前 partial 内容，供 UI 决定是否显示“未完成回答”

---

## 11.4 本地缓存策略

### SessionStore
- 内存缓存为主
- 可选 localStorage / IndexedDB 持久化最近会话列表

### MessageStore
- 内存缓存当前活跃会话
- 历史消息分页按需缓存
- 小程序场景可选持久化

---

## 11.5 并发控制

### sendMessage 并发
- 同一 sessionId 不建议同时并发发送多条消息
- 建议加会话级互斥锁
- 若在 executing 中再次 sendMessage，可配置为：
  - 拒绝
  - 排队
  - 或允许，交给服务端串行处理

### 推荐方案
- 默认拒绝：返回 `SESSION_BUSY`
- 重新生成前若正在执行，可先 stop 再 regenerate

---

## 11.6 资源释放策略

### 触发点
- closeSkill
- controlSkillWeCode(close)
- 页面销毁
- 应用退出

### 释放内容
- ws connection
- subscriber
- retry timer
- streaming buffer
- 临时状态

---

## 12. 异常与容错设计

## 12.1 REST 异常

| 场景 | 处理方式 |
|---|---|
| 400 | 参数错误，直接返回 |
| 404 | 标记 session 不存在 |
| 409 | 标记 session closed |
| 500 | 返回统一服务端异常 |

## 12.2 WebSocket 异常

| 场景 | 处理方式 |
|---|---|
| 连接失败 | 自动重连（非用户 stop/close） |
| 消息格式非法 | 丢弃并记录日志 |
| seq 重复 | 丢弃 |
| 网络断开 | 重连后继续订阅 |
| 用户主动 stop | 不重连 |
| 用户主动 close | 不重连 |

## 12.3 小程序异常

| 场景 | 处理方式 |
|---|---|
| 原生 close 失败 | 返回 `WECODE_CLOSE_FAILED` |
| 原生 minimize 失败 | 返回 `WECODE_MINIMIZE_FAILED` |
| 生命周期监听注册失败 | 返回 `WECODE_STATUS_LISTEN_FAILED` |

---

## 13. 埋点与日志设计

## 13.1 建议埋点

### 会话类
- create_session_success
- create_session_failed
- close_session_success
- close_session_failed

### 消息类
- send_message_success
- send_message_failed
- regenerate_answer
- reply_permission_success
- reply_permission_failed

### 流式类
- stream_connect_success
- stream_connect_failed
- stream_reconnect
- stream_first_delta_cost
- stream_done_cost
- stream_error

### IM 类
- send_to_im_success
- send_to_im_failed

### 小程序类
- wecode_closed
- wecode_minimized
- wecode_control_failed

## 13.2 日志字段建议

- sessionId
- userId
- imChatId
- agentId
- skillDefinitionId
- wsState
- restApi
- errorCode
- errorMessage
- elapsedMs

---

## 14. 安全与边界控制

### 14.1 输入校验
- sessionId 非空
- userId 非空
- content 非空
- permissionId 非空

### 14.2 输出转义
- UI 层渲染 markdown / code 时注意 XSS 防护
- SDK 层不负责 HTML 渲染

### 14.3 敏感信息控制
- 不在日志中打印完整敏感消息内容
- 长文本日志截断

---

## 15. 测试方案

## 15.1 单元测试

### RestClient
- 正常请求
- 400/404/409/500 错误映射
- timeout 处理

### StreamClient
- delta 拼接
- done 完成
- error 失败
- reconnect 逻辑
- seq 去重

### MessageStore
- append streaming
- complete streaming
- getLastUserMessage
- getLastAssistantMessage

### SDK Runtime
- executeSkill 聚合行为
- stopSkill / closeSkill 区别
- regenerateAnswer
- sendMessageToIM
- controlSkillWeCode

---

## 15.2 集成测试

### 场景 1：首次执行技能
- create session
- connect ws
- send message
- receive delta/done

### 场景 2：多轮对话
- 同一 session 连续 sendMessage
- 历史查询正确

### 场景 3：停止后继续对话
- stopSkill
- sendMessage
- ws 重建
- 新回答正常

### 场景 4：关闭后不可恢复
- closeSkill
- 再 sendMessage 返回失败

### 场景 5：重新生成
- 取最后一条 USER
- 重新回答
- 历史保留旧答案

### 场景 6：小程序最小化
- minimized 回调触发
- 恢复后继续可用

### 场景 7：小程序关闭
- close 回调触发
- 会话关闭
- ws 释放

---

## 16. 实施建议

## 16.1 推荐开发顺序

### 第一阶段：底层能力
- RestClient
- StreamClient
- 类型定义
- 错误码体系

### 第二阶段：状态与缓存
- SessionStore
- MessageStore
- EventCenter

### 第三阶段：SDK 方法
- executeSkill
- sendMessage
- getSessionMessage
- closeSkill
- stopSkill
- regenerateAnswer
- sendMessageToIM
- replyPermission

### 第四阶段：小程序能力
- onSkillWecodeStatus
- controlSkillWeCode
- HostAdapter

### 第五阶段：增强
- 埋点
- 重连优化
- 本地缓存
- 性能优化

---

## 17. 风险与待补充项

### 17.1 skillDefinitionId 来源
SDK 未暴露该字段，需尽早确认具体注入方案。

### 17.2 stopSkill 语义
当前 stop 仅停止客户端流，不保证服务端中止执行。若后续服务端提供显式 stop API，可升级为真正终止。

### 17.3 小程序最小化后的连接策略
不同宿主平台对后台 WebSocket 支持可能不同，需要平台联调确认。

### 17.4 并发发送策略
是否允许同一 session 在执行中再次发送消息，需要产品与后端进一步明确。

---

## 18. 结论

本技术方案采用 **REST + WebSocket 混合架构**：

- REST 负责会话与消息控制
- WebSocket 负责结果流推送
- SDK Facade 聚合对外接口
- SessionStore / MessageStore / EventCenter 管理本地状态
- MiniProgram Controller 负责小程序生命周期联动

该方案满足当前需求，并为后续扩展以下能力预留空间：

- 更多 Skill 类型接入
- 更多宿主端适配
- 显式 stop API 升级
- 离线恢复与持久化增强
- 更强的消息并发控制


[2026-03-06T08:56:38.898Z] ERROR {"message":"REST request failed: POST /api/skill/sessions","code":"SESSION_CREATE_FAILED"}
[2026-03-06T08:56:35.350Z] controlSkillWeCode(close) {"ok":true}
[2026-03-06T08:56:32.545Z] controlSkillWeCode(minimize) {"ok":true}
[2026-03-06T08:56:25.134Z] SDK 初始化成功
[2026-03-06T08:56:20.608Z] 页面已加载，请先点击“初始化 SDK”
执行executeSkill后报错