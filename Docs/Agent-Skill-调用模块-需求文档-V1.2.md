# Agent Skill 调用模块需求文档 V1.2

## 1. 文档目的

设计并实现一个 **Agent Skill 调用模块**，用于统一承接 Agent 相关 Skill 的执行、停止、关闭会话、重新生成、历史记录查询、状态回调、结果分发等能力。

该模块同时对接三类外部模块：

1. **Agent 服务端**
2. **Agent 客户端**
3. **Agent 小程序**

模块核心目标：

- 与 Agent 服务端的对接方式调整为：
  - **仅 Skill 执行结果通过 WebSocket 进行流式返回**
  - **其余接口统一通过 REST API 调用**
- 服务端接口规范以 `skill-server-api.md` 为准
- 本模块仅关注：
  - **4.2 会话管理**
  - **4.3 消息管理**
  - **5.1 流式推送端点**
- **4.1 技能定义** 与 **5.2 网关内部端点** 不属于本模块范围，无需考虑

---

## 2. 项目范围

### 2.1 范围内

本期需要实现：

- Agent 前端 Skill 调用管理模块
- 面向 Skill Server 的 REST API 封装
- 面向 Skill Stream 的 WebSocket 订阅能力
- 面向 Agent 客户端的接口层
- 面向 Agent 小程序的接口层
- Skill 状态管理与事件分发
- 会话管理、消息管理、历史消息查询
- 重新生成、停止态管理、关闭会话等控制能力
- 结果复制、发送消息到聊天框等辅助能力

### 2.2 范围外

本期暂不包含：

- Skill 服务端具体执行逻辑实现
- Skill 编排平台后台实现
- 登录态与权限系统设计
- `skill-server-api.md` 中的 **4.1 技能定义接口**
- `skill-server-api.md` 中的 **5.2 网关内部端点**
- 消息长度限制处理
- markdown / 富文本渲染细节
- Skill Server 与 AI-Gateway 的内部通信设计

---

## 3. 角色与模块关系

### 3.1 模块角色

#### 1）Agent 服务端（Skill Server）
负责：

- 提供 REST API：
  - 创建会话
  - 查询会话列表
  - 查询会话详情
  - 关闭会话
  - 发送用户消息
  - 查询消息历史
  - 回复权限确认
  - 发送消息到 IM
- 提供 WebSocket 流式推送端点：
  - 仅用于返回 Skill 执行中的流式结果、完成通知、错误信息、Agent 在线离线通知

#### 2）Agent 客户端
负责：

- 调用本模块暴露的 REST 能力发起会话和消息操作
- 订阅指定会话的 WebSocket 流式结果
- 监听 Skill 执行状态
- 发起关闭、重新生成、发送到聊天框、复制结果等操作

#### 3）Agent 小程序
负责：

- 调用本模块暴露的 REST 能力发起会话和消息操作
- 订阅并展示 Skill 返回数据，包含流式内容
- 获取会话与消息历史
- 在最小化、关闭动作触发时调用本模块接口
- 使用重新生成、复制、发送消息等能力

---

## 4. 总体目标

构建一个统一的前端 Skill Runtime，具备以下能力：

### 4.1 通信模型统一化
- **REST API** 负责控制类、查询类、提交类接口
- **WebSocket** 仅负责 Skill 执行结果的流式推送订阅

### 4.2 会话统一化
通过 `sessionId` 管理 Skill 会话，并围绕 Skill Server 的 `SkillSession` 数据模型进行管理。

### 4.3 消息统一化
围绕服务端 `SkillMessage` 模型管理用户消息、助手消息、历史消息与流式结果拼接。

### 4.4 状态统一化
Skill 执行过程中的状态统一抽象为：

- idle
- pending
- executing
- stopping
- stopped
- completed
- failed
- closed

### 4.5 能力统一化
客户端与小程序共享同一套 Skill 调用核心能力，仅在接入层做差异适配。

---

# 5. 功能需求

## 5.1 对接 Agent 服务端

### 5.1.1 通信方式要求

#### 需求描述
本模块与 Agent 服务端对接时，需要严格区分 REST API 与 WebSocket 的职责边界。

#### 具体要求
- **只有执行技能后技能的返回结果通过 WebSocket 流式返回**
- **其余接口全部通过 REST API**
- 不再要求前端到服务端建立“单例双向 WebSocket 控制通道”
- WebSocket 仅作为指定 `sessionId` 的结果订阅通道
- Skill 的执行触发动作由 REST API “发送用户消息”完成
- WebSocket 连接不承担：
  - 创建会话
  - 关闭会话
  - 发送用户输入
  - 历史记录查询
  - 权限确认回复
  - IM 转发

### 5.1.2 REST API 能力范围

#### 需求描述
本模块需封装 Skill Server 提供的 REST API，范围仅包含 `skill-server-api.md` 中 4.2 与 4.3。

#### 范围内接口

##### 1）会话管理
- `POST /api/skill/sessions`：创建会话
- `GET /api/skill/sessions`：查询会话列表
- `GET /api/skill/sessions/{id}`：查询会话详情
- `DELETE /api/skill/sessions/{id}`：关闭会话

##### 2）消息管理
- `POST /api/skill/sessions/{sessionId}/messages`：发送用户消息
- `GET /api/skill/sessions/{sessionId}/messages`：查询消息历史
- `POST /api/skill/sessions/{sessionId}/permissions/{permId}`：回复权限确认
- `POST /api/skill/sessions/{sessionId}/send-to-im`：发送消息到 IM

#### 范围外接口
- `GET /api/skill/definitions`：不属于本模块
- `/ws/internal/gateway`：不属于本模块

### 5.1.3 WebSocket 能力范围

#### 需求描述
本模块需订阅 Skill Server 提供的流式推送端点，仅用于接收 Skill 执行结果。

#### 具体要求
- WebSocket 端点：`ws://{host}:8082/ws/skill/stream/{sessionId}`
- 连接建立后，订阅指定 `sessionId` 的消息流
- 支持多个前端客户端订阅同一会话
- WebSocket 仅接收服务端单向推送
- 不通过 WebSocket 发送业务控制指令

#### 服务端推送消息类型
- `delta`：增量内容更新
- `done`：执行完成
- `error`：执行错误
- `agent_offline`：关联 Agent 下线
- `agent_online`：关联 Agent 上线

#### 说明
- `delta` 用于流式文本拼接
- `done` 表示本轮 Skill 执行完成
- `error` 表示本轮 Skill 执行失败
- `agent_online / agent_offline` 属于会话相关状态通知，可作为扩展事件处理

### 5.1.4 创建会话

#### 需求描述
调用 REST API 创建 Skill 会话。

#### 服务端接口
`POST /api/skill/sessions`

#### 请求参数
- `userId`：必填
- `skillDefinitionId`：必填
- `agentId`：可选
- `title`：可选
- `imChatId`：可选

#### 返回结果
返回 `SkillSession` 对象，包含：
- `id`
- `userId`
- `skillDefinitionId`
- `agentId`
- `toolSessionId`
- `title`
- `status`
- `imChatId`
- `createdAt`
- `lastActiveAt`

### 5.1.5 查询会话列表

#### 需求描述
按用户 ID 分页查询会话，并支持按状态过滤。

#### 服务端接口
`GET /api/skill/sessions`

#### 查询参数
- `userId`：必填
- `statuses`：可选，多值
- `page`：可选，默认 0
- `size`：可选，默认 20

### 5.1.6 查询会话详情

#### 需求描述
根据会话 ID 获取单个会话详情。

#### 服务端接口
`GET /api/skill/sessions/{id}`

### 5.1.7 关闭会话

#### 需求描述
关闭指定会话。

#### 服务端接口
`DELETE /api/skill/sessions/{id}`

#### 说明
- 关闭后，会话进入 `closed`
- 前端关闭成功后不再允许继续发送消息

### 5.1.8 发送用户消息（触发 Skill 执行）

#### 需求描述
通过 REST API 向指定会话发送用户消息，以此触发 Skill 执行。

#### 服务端接口
`POST /api/skill/sessions/{sessionId}/messages`

#### 请求体
```json
{
  "content": "请帮我重构登录模块的校验逻辑"
}
```

#### 执行机制
- 用户消息先通过 REST 提交
- 服务端持久化消息
- 服务端触发 AI-Gateway 执行
- AI 响应结果随后通过 WebSocket 流式推送返回

### 5.1.9 查询消息历史

#### 需求描述
分页查询指定会话的消息历史。

#### 服务端接口
`GET /api/skill/sessions/{sessionId}/messages`

#### 查询参数
- `page`：可选，默认 0
- `size`：可选，默认 50

#### 返回结果
分页 `PageResult<SkillMessage>`

### 5.1.10 回复权限确认

#### 需求描述
对 AI 发起的权限确认请求进行批准或拒绝。

#### 服务端接口
`POST /api/skill/sessions/{sessionId}/permissions/{permId}`

#### 请求体
```json
{
  "approved": true
}
```

### 5.1.11 发送消息到 IM

#### 需求描述
将消息内容通过 Skill Server 转发到会话关联的 IM 聊天中。

#### 服务端接口
`POST /api/skill/sessions/{sessionId}/send-to-im`

#### 请求体
```json
{
  "content": "代码重构已完成，请查看 PR #42"
}
```

#### 说明
- 模块对外仍提供“发送到聊天框/IM”能力
- 模块内部优先封装 Skill Server 的 `send-to-im` REST 接口

### 5.1.12 WebSocket 流式订阅

#### 需求描述
前端在触发 Skill 执行后，通过 WebSocket 订阅指定会话的结果流。

#### 服务端接口
`ws://{host}:8082/ws/skill/stream/{sessionId}`

#### 消息格式
```json
{
  "type": "<消息类型>",
  "seq": 1,
  "content": "<消息内容>"
}
```

#### 字段说明
- `type`：消息类型
- `seq`：递增序列号，用于排序和去重
- `content`：文本或对象

#### 消息处理要求
- `delta`：实时追加到当前 assistant 输出
- `done`：标记本轮执行完成，并记录 usage 等信息
- `error`：标记本轮执行失败
- `agent_online / agent_offline`：派发状态事件，可选展示

---

## 5.2 对接 Agent 客户端

### 5.2.1 提供创建会话接口

```ts
createSkillSession(params: {
  userId: number;
  skillDefinitionId: number;
  agentId?: number;
  title?: string;
  imChatId?: string;
}): Promise<SkillSession>;
```

### 5.2.2 提供查询会话列表接口

```ts
getSkillSessions(params: {
  userId: number;
  statuses?: Array<'ACTIVE' | 'IDLE' | 'CLOSED'>;
  page?: number;
  size?: number;
}): Promise<PageResult<SkillSession>>;
```

### 5.2.3 提供查询会话详情接口

```ts
getSkillSessionDetail(sessionId: number): Promise<SkillSession>;
```

### 5.2.4 提供关闭会话接口

```ts
closeSkillSession(sessionId: number): Promise<{
  status: 'closed';
  sessionId: string;
}>;
```

### 5.2.5 提供发送用户消息接口

```ts
sendSkillMessage(params: {
  sessionId: number;
  content: string;
}): Promise<SkillMessage>;
```

### 5.2.6 提供重新生成接口

#### 重新生成语义
- 保留 `sessionId`
- 不覆盖旧消息记录
- UI 层决定是否替换展示

```ts
regenerateSkill(params: {
  sessionId: number;
  content: string;
}): Promise<SkillMessage>;
```

### 5.2.7 提供查询消息历史接口

```ts
getSkillMessages(params: {
  sessionId: number;
  page?: number;
  size?: number;
}): Promise<PageResult<SkillMessage>>;
```

### 5.2.8 提供权限确认回复接口

```ts
replyPermission(params: {
  sessionId: number;
  permId: string;
  approved: boolean;
}): Promise<{
  success: boolean;
  permissionId: string;
  approved: boolean;
}>;
```

### 5.2.9 提供 Skill 执行状态回调

```ts
onSkillStatusChange(callback: (event: {
  sessionId: number;
  status: SkillStatus;
  reason?: string;
}) => void): () => void;
```

### 5.2.10 提供流式订阅接口

```ts
subscribeSkillStream(params: {
  sessionId: number;
  onData: (chunk: string, fullText: string) => void;
  onDone?: (payload?: any) => void;
  onError?: (error: any) => void;
  onAgentStateChange?: (state: 'agent_online' | 'agent_offline') => void;
}): () => void;
```

### 5.2.11 提供复制结果到剪切板接口

```ts
copySkillResult(params: {
  sessionId: number;
  content?: string;
}): Promise<void>;
```

### 5.2.12 提供发送结果到聊天框 / IM 接口

```ts
sendSkillResultToIM(params: {
  sessionId: number;
  content: string;
}): Promise<{
  success: boolean;
  chatId: string;
  contentLength: number;
}>;
```

---

## 5.3 对接 Agent 小程序

### 5.3.1 获取 Skill 执行数据返回，支持流式数据
与客户端一致，小程序通过 `subscribeSkillStream` 获取指定会话的流式结果。

### 5.3.2 获取会话列表
与客户端一致，调用会话列表 REST 接口。

### 5.3.3 获取会话详情
与客户端一致，调用会话详情 REST 接口。

### 5.3.4 获取消息历史
与客户端一致，调用消息分页 REST 接口。

### 5.3.5 获取小程序回调状态（最小化、关闭）

```ts
notifyMiniProgramState(state: 'minimized' | 'closed'): void;
```

```ts
onMiniProgramStateChange(callback: (state: 'minimized' | 'closed') => void): () => void;
```

### 5.3.6 获取 Skill 执行状态回调
与客户端一致。

### 5.3.7 提供 Skill 调用重新生成接口
与客户端一致，本质为再次发送消息。

### 5.3.8 提供复制结果到剪切板接口
与客户端一致。

### 5.3.9 提供发送结果到聊天框 / IM 接口
与客户端一致，内部调用 Skill Server 的 `send-to-im` 接口。

---

## 6. 非功能需求

### 6.1 性能要求
- 支持多个会话并行订阅 WebSocket 流
- 支持消息流实时渲染
- REST 接口封装具备统一超时、重试、错误处理能力
- 不因流式订阅导致明显内存泄漏

### 6.2 稳定性要求
- WebSocket 连接异常断开可重连
- 按 `sessionId` 维度管理连接生命周期
- REST 请求具备超时控制
- 服务端异常不会导致整个模块崩溃

### 6.3 可扩展性要求
- REST API 封装与业务层解耦
- WebSocket 事件处理与 UI 展示解耦
- 支持后续增加鉴权、埋点、限流等能力
- 支持后续兼容更多 Skill Server 接口

### 6.4 可维护性要求
- REST Client、Stream Client、Session Store、Message Store 职责清晰
- 类型定义清晰
- 错误码统一
- 日志与调试信息可观测

---

## 7. 建议技术架构

### 7.1 模块拆分

#### 1）RestClient Layer
负责：
- Skill Server REST API 请求封装
- 通用请求头、超时、错误处理
- 会话与消息接口适配

#### 2）StreamClient Layer
负责：
- `ws://{host}:8082/ws/skill/stream/{sessionId}` 连接管理
- 单会话订阅与取消订阅
- 流式事件分发
- 重连与序列号处理

#### 3）Session Layer
负责：
- 会话列表与详情缓存
- 会话状态管理
- 关闭会话后的本地状态更新

#### 4）Message Layer
负责：
- 用户消息提交
- assistant 流式消息拼接
- 历史消息分页缓存
- 重新生成时复用最近 USER 消息

#### 5）Runtime Layer
负责：
- sendSkillMessage
- regenerateSkill
- subscribeSkillStream
- copySkillResult
- sendSkillResultToIM
- 状态流转控制

#### 6）Adapter Layer
负责：
- 面向 Agent 客户端暴露 API
- 面向 Agent 小程序暴露 API

### 7.2 推荐核心对象

- `SkillRestApi`
- `SkillStreamClient`
- `SkillSessionStore`
- `SkillMessageStore`
- `EventBus`

---

## 8. 状态流转设计

### 8.1 Skill 执行状态

- `idle`
- `pending`
- `executing`
- `stopping`
- `stopped`
- `completed`
- `failed`
- `closed`

### 8.2 典型流转

#### 正常执行
`idle -> pending -> executing -> completed`

#### 执行失败
`idle -> pending -> executing -> failed`

#### 会话关闭
`completed/failed/idle -> closed`

#### 重新生成
旧消息保持不变，新一轮结果进入：
`pending -> executing -> completed/failed`

---

## 9. 关键业务流程

### 9.1 创建会话流程
1. 上层调用 `createSkillSession`
2. 模块调用 `POST /api/skill/sessions`
3. 服务端返回 `SkillSession`
4. 前端写入 Session Store

### 9.2 发送消息并执行 Skill 流程
1. 上层调用 `sendSkillMessage`
2. 模块调用 `POST /api/skill/sessions/{sessionId}/messages`
3. 服务端持久化消息并触发 AI 处理
4. 前端调用 `subscribeSkillStream(sessionId)`
5. WebSocket 接收 `delta`
6. 前端拼接 assistant 输出
7. WebSocket 接收 `done`
8. 前端标记本轮执行完成

### 9.3 查询消息历史流程
1. 上层调用 `getSkillMessages`
2. 模块调用 `GET /api/skill/sessions/{sessionId}/messages`
3. 服务端返回 `PageResult<SkillMessage>`
4. 前端写入 Message Store

### 9.4 重新生成流程
1. 前端读取最近一条 USER 消息
2. 再次调用 `sendSkillMessage`
3. 重新订阅或复用该会话的流式连接
4. 将新一轮 assistant 输出展示为新的结果块
5. 不覆盖原消息历史

### 9.5 关闭会话流程
1. 上层调用 `closeSkillSession`
2. 模块调用 `DELETE /api/skill/sessions/{id}`
3. 服务端返回关闭结果
4. 前端更新会话状态为 `closed`
5. 关闭该会话关联的流式订阅

### 9.6 发送结果到 IM 流程
1. 上层调用 `sendSkillResultToIM`
2. 模块调用 `POST /api/skill/sessions/{sessionId}/send-to-im`
3. 服务端将内容转发到关联 IM 聊天
4. 返回发送结果

---

## 10. 数据模型建议

### 10.1 SkillSession

```ts
type SkillSession = {
  id: number;
  userId: number;
  skillDefinitionId: number;
  agentId?: number;
  toolSessionId?: string | null;
  title?: string;
  status: 'ACTIVE' | 'IDLE' | 'CLOSED';
  imChatId?: string;
  createdAt: string;
  lastActiveAt: string;
};
```

### 10.2 SkillMessage

```ts
type SkillMessage = {
  id: number;
  sessionId: number;
  seq: number;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  contentType: 'MARKDOWN' | 'CODE' | 'PLAIN';
  createdAt: string;
  meta?: any;
};
```

### 10.3 PageResult<T>

```ts
type PageResult<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
};
```

### 10.4 StreamMessage

```ts
type StreamMessage = {
  type: 'delta' | 'done' | 'error' | 'agent_offline' | 'agent_online';
  seq: number;
  content: string | Record<string, any> | null;
};
```

---

## 11. 接口清单建议

```ts
interface AgentSkillRuntime {
  createSkillSession(params: {
    userId: number;
    skillDefinitionId: number;
    agentId?: number;
    title?: string;
    imChatId?: string;
  }): Promise<SkillSession>;

  getSkillSessions(params: {
    userId: number;
    statuses?: Array<'ACTIVE' | 'IDLE' | 'CLOSED'>;
    page?: number;
    size?: number;
  }): Promise<PageResult<SkillSession>>;

  getSkillSessionDetail(sessionId: number): Promise<SkillSession>;

  closeSkillSession(sessionId: number): Promise<{
    status: 'closed';
    sessionId: string;
  }>;

  sendSkillMessage(params: {
    sessionId: number;
    content: string;
  }): Promise<SkillMessage>;

  regenerateSkill(params: {
    sessionId: number;
    content: string;
  }): Promise<SkillMessage>;

  getSkillMessages(params: {
    sessionId: number;
    page?: number;
    size?: number;
  }): Promise<PageResult<SkillMessage>>;

  replyPermission(params: {
    sessionId: number;
    permId: string;
    approved: boolean;
  }): Promise<{
    success: boolean;
    permissionId: string;
    approved: boolean;
  }>;

  subscribeSkillStream(params: {
    sessionId: number;
    onData: (chunk: string, fullText: string) => void;
    onDone?: (payload?: any) => void;
    onError?: (error: any) => void;
    onAgentStateChange?: (state: 'agent_online' | 'agent_offline') => void;
  }): () => void;

  onSkillStatusChange(
    callback: (event: {
      sessionId: number;
      status: string;
      reason?: string;
    }) => void
  ): () => void;

  copySkillResult(params: {
    sessionId: number;
    content?: string;
  }): Promise<void>;

  sendSkillResultToIM(params: {
    sessionId: number;
    content: string;
  }): Promise<{
    success: boolean;
    chatId: string;
    contentLength: number;
  }>;

  notifyMiniProgramState?(state: 'minimized' | 'closed'): void;

  onMiniProgramStateChange?(
    callback: (state: 'minimized' | 'closed') => void
  ): () => void;
}
```

---

## 12. 异常与错误码建议

### 12.1 REST 类
- `SESSION_CREATE_FAILED`
- `SESSION_NOT_FOUND`
- `SESSION_CLOSED`
- `MESSAGE_SEND_FAILED`
- `MESSAGE_HISTORY_FETCH_FAILED`
- `PERMISSION_REPLY_FAILED`
- `SEND_TO_IM_FAILED`

### 12.2 Stream 类
- `STREAM_CONNECT_FAILED`
- `STREAM_DISCONNECTED`
- `STREAM_MESSAGE_INVALID`
- `STREAM_EXECUTION_FAILED`

### 12.3 参数类
- `INVALID_PARAMS`
- `MISSING_USER_ID`
- `MISSING_SKILL_DEFINITION_ID`
- `MISSING_SESSION_ID`
- `MISSING_CONTENT`

---

## 13. 埋点与日志建议

- 创建会话成功/失败
- 查询会话列表成功/失败
- 查询消息历史成功/失败
- 发送用户消息成功/失败
- WebSocket 建连成功/失败
- 首个 delta 到达耗时
- done 到达耗时
- error 到达次数
- 关闭会话成功/失败
- 复制结果
- 发送到 IM 成功/失败
- 小程序最小化/关闭事件

---

## 14. 验收标准

### 14.1 服务端对接验收
- 仅 Skill 执行结果通过 WebSocket 返回
- 其余能力全部通过 REST API 实现
- 能创建会话、查询会话、关闭会话
- 能发送用户消息并触发 Skill 执行
- 能查询消息历史
- 能回复权限确认
- 能发送消息到 IM
- 能订阅指定 `sessionId` 的 Skill 流式结果
- 能正确处理 `delta`、`done`、`error`、`agent_online`、`agent_offline`

### 14.2 客户端对接验收
- 能通过 REST 创建会话
- 能发送消息并通过 WebSocket 获取流式返回
- 能关闭会话
- 能重新生成
- 能收到状态回调
- 能复制结果
- 能发送结果到 IM

### 14.3 小程序对接验收
- 能接收流式结果
- 能查询会话与消息历史
- 能在最小化、关闭时调用模块接口上报状态
- 能接收小程序状态回调
- 能接收 Skill 状态回调
- 能重新生成
- 能复制结果
- 能发送结果到 IM

---

## 15. 已确认项归档（更新后）

### 15.1 通信模式
- 只有执行技能后的返回结果通过 WebSocket 流式返回
- 其余接口全部通过 REST API

### 15.2 服务端接口依据
- 以 `skill-server-api.md` 为准
- 仅考虑：
  - 4.2 会话管理
  - 4.3 消息管理
  - 5.1 流式推送端点
- 不考虑：
  - 4.1 技能定义
  - 5.2 网关内部端点

### 15.3 重新生成语义
- 保留 sessionId
- 不覆盖旧记录
- 通过再次发送消息实现
- UI 层决定是否替换展示

### 15.4 历史记录来源
- 会话历史：会话 REST 接口
- 消息历史：消息 REST 接口

### 15.5 小程序状态回调能力来源
- 小程序在调用最小化、关闭时调用本模块的方法

### 15.6 发送到聊天框 / IM
- 当前主路径改为调用 Skill Server 的 `send-to-im` 接口
- 早先的独立 `sendMessage` 方案不再作为本版主路径

---

## 16. 下一步建议

当前这版需求文档已经完成了与 `skill-server-api.md` 的对齐，适合继续向下输出：

1. **详细技术方案设计**
   - REST + WebSocket 混合架构图
   - 会话与消息状态机
   - StreamClient 设计
   - Session / Message Store 设计
   - 时序图

2. **前端接口定义文档**
   - TypeScript 类型
   - REST Client 封装规范
   - WebSocket 事件模型
   - 错误码与状态码映射
