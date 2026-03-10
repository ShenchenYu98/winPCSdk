# Skill SDK 接口文档

## 概述

Skill SDK 是 IM 客户端与 Skill 小程序共用的一层客户端 SDK，负责两类交互：

1. IM 客户端 / Skill 小程序 与 Skill 服务端之间的交互
2. IM 客户端 与 Skill 小程序之间的状态协同

本 SDK 面向以下典型场景：

- IM 客户端创建或复用 Skill 会话
- Skill 小程序接收服务端 WebSocket 流式事件并渲染
- 用户在小程序中继续多轮对话
- 用户处理 AI 提问、权限请求、工具调用结果
- 用户将最终确认的文本发送回 IM 聊天

本文档描述用于 IM 客户端、OpenCode Skill 服务端、小程序之间交互的 Web 端 SDK 接口定义。

**V3 版本说明：**

- `executeSkill` 已废弃，改为 `createSession + sendMessage`
- `CreateSessionParams` 替代 `ExecuteSkillParams`
- 首轮消息不再在建会话接口中触发，只有 `sendMessage` 才会真正触发 AI 执行
- 当前文档中的 `SDKError` 仅用于当前已覆盖的接口与示例，不做全局统一错误契约承诺

---

## 1. 创建或复用会话接口

### 调用方

IM 客户端调用

### 接口说明

创建或复用 Skill 会话，并建立 SDK 与 Skill 服务端之间的 WebSocket 长连接。

**重要说明：**

- SDK 会按 `imGroupId + ak + ACTIVE` 查询当前已有会话并优先复用
- 若查询到多个会话，SDK 暂按服务端返回原始顺序取第一个
- SDK 本身不提供会话列举和切换能力
- Mini Bar 绑定的会话 ID 由 IM 客户端提供
- Skill 小程序启动时也由 IM 客户端传入会话 ID
- `createSession` 只负责创建/复用会话和建立连接，不发送消息

### 接口名

```typescript
createSession(params: CreateSessionParams): Promise<SkillSession>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| ak | string | 是 | Agent Plugin 对应的 Access Key，用于定位 Agent 连接 |
| title | string | 否 | 会话标题，不填则由 AI 自动生成 |
| imGroupId | string | 是 | 关联的 IM 群组 ID |

### 入参示例

```json
{
  "ak": "ak_xxxxxxxx",
  "title": "帮我创建一个React项目",
  "imGroupId": "group_abc123"
}
```

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| welinkSessionId | number | 会话 ID |
| userId | string | 用户 ID |
| ak | string | Access Key |
| title | string | 会话标题 |
| imGroupId | string | IM 群组 ID |
| status | string | 会话状态：`ACTIVE` |
| toolSessionId | string \| null | OpenCode Session ID |
| createdAt | string | 创建时间，ISO-8601 |
| updatedAt | string | 更新时间，ISO-8601 |

### 出参示例

```json
{
  "welinkSessionId": 42,
  "userId": "10001",
  "ak": "ak_xxxxxxxx",
  "title": "帮我创建一个React项目",
  "imGroupId": "group_abc123",
  "status": "ACTIVE",
  "toolSessionId": null,
  "createdAt": "2026-03-09T00:15:00",
  "updatedAt": "2026-03-09T00:15:00"
}
```

### 实现方法

1. 建立 WebSocket 连接，若当前用户已有连接则复用，否则新建
   - **URL**: `ws://host/ws/skill/stream`
2. 调用服务端 REST API 按 `imGroupId + ak + ACTIVE` 查询可复用会话
   - **URL**: `GET /api/skill/sessions`
   - **查询条件**：
     - `imGroupId`
     - `ak`
     - `status=ACTIVE`
3. 若查询结果不为空，则直接复用；若有多个，则按服务端返回原始顺序取第一个
4. 若查询结果为空，则调用 `POST /api/skill/sessions` 新建会话
5. 建连后，所有通过 `registerSessionListener` 注册的监听器都能收到后续消息
6. 若监听器先于 `createSession` 注册，则先暂存，待连接建立后自动生效
7. `createSession` 成功不代表首轮执行已开始，首轮执行需继续调用 `sendMessage`

### 错误处理

| 错误码 | 错误消息 | 说明 |
|--------|----------|------|
| 1000 | 无效的参数 | 缺少必填参数或参数格式错误 |
| 6000 | 网络错误 | WebSocket 连接失败或网络请求失败 |
| 7000 | 服务端错误 | 服务端创建/查询会话失败 |
| 2000 | Agent 离线 | 对应的 Agent 未在线 |
| 2001 | 超出速率限制 | 短时间内创建会话过于频繁 |

### 组合调用场景

IM 首次触发推荐顺序：

1. `createSession`
2. `registerSessionListener` / `onSessionStatusChange`
3. `sendMessage`

补充说明：

- `createSession` 失败时，应停止后续 `sendMessage`
- `createSession` 成功但 `sendMessage` 失败时，会话仍然存在，可稍后重试发送消息

### 调用示例

```typescript
try {
  const session = await createSession({
    ak: "ak_xxxxxxxx",
    title: "帮我创建一个React项目",
    imGroupId: "group_abc123"
  });

  console.log("会话创建成功:", session.welinkSessionId);
} catch (error) {
  console.error("创建会话失败:", error.errorCode, error.errorMessage);
}
```

---

## 2. 关闭技能接口

### 接口说明

关闭 SDK 与 Skill 服务端之间的 WebSocket 连接，释放本地资源。

**重要说明：**

- `closeSkill` 只负责关闭 WebSocket 连接
- 该接口不会关闭服务端会话，也不会调用 `DELETE /api/skill/sessions/{welinkSessionId}`
- `closeSkill` 为幂等接口：未建立连接也返回成功
- `closeSkill` 后本地缓存保留，可继续用于会话恢复和消息补齐

### 接口名

```typescript
closeSkill(): Promise<CloseSkillResult>
```

### 入参

无

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| status | string | 关闭结果：`success` / `failed` |

### 出参示例

```json
{
  "status": "success"
}
```

### 实现方法

1. 关闭当前 SDK 维护的 WebSocket 连接
2. 清理本地连接态、重连状态
3. 保留消息缓存和会话级缓存
4. 若当前本就未建立连接，则直接返回 `success`

### 错误处理

| 错误码 | 错误消息 | 说明 |
|--------|----------|------|
| 6000 | 网络错误 | 关闭连接时出现网络错误 |
| 5000 | 内部错误 | SDK 内部处理错误 |

### 组合调用场景

- 关闭连接后，所有依赖 WebSocket 的接口将无法继续接收实时事件
- 后续若仍需实时流式消息，应重新通过 `createSession` 建立连接

### 调用示例

```typescript
try {
  const result = await closeSkill();
  console.log("关闭结果:", result.status);
} catch (error) {
  console.error("关闭连接失败:", error.errorCode, error.errorMessage);
}
```

---

## 3. 停止技能接口

### 接口说明

停止当前会话正在进行中的一轮 AI 回答。

### 接口名

```typescript
stopSkill(params: StopSkillParams): Promise<StopSkillResult>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| welinkSessionId | number | 是 | 要停止的会话 ID |

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| welinkSessionId | number | 会话 ID |
| status | string | 中止结果，成功时为 `aborted` |

### 出参示例

```json
{
  "welinkSessionId": 42,
  "status": "aborted"
}
```

### 实现方法

1. 调用服务端接口停止当前轮执行
   - **URL**: `POST /api/skill/sessions/{welinkSessionId}/abort`
2. SDK 收到成功响应后，额外触发一次 `onSessionStatusChange(stopped)`

### 错误处理

| 错误码 | 错误消息 | 说明 |
|--------|----------|------|
| 1000 | 无效的参数 | `welinkSessionId` 缺失或格式错误 |
| 4000 | 会话不存在 | 指定的会话 ID 不存在 |
| 4001 | 会话已关闭 | 会话已被关闭，无法停止 |
| 6000 | 网络错误 | 网络请求失败 |
| 7000 | 服务端错误 | 服务端处理失败 |

### 组合调用场景

- `stopSkill` 失败不影响会话的其他操作
- 停止当前轮后，仍可以继续调用 `sendMessage` 触发新一轮执行

### 调用示例

```typescript
try {
  const result = await stopSkill({ welinkSessionId: 42 });
  console.log("停止结果:", result.status);
} catch (error) {
  console.error("停止会话失败:", error.errorCode, error.errorMessage);
}
```

---

## 4. 会话状态变更回调接口

### 接口说明

监听会话状态变化，并将服务端流式事件映射为上层可直接使用的三态：

- `executing`
- `completed`
- `stopped`

### 接口名

```typescript
onSessionStatusChange(params: OnSessionStatusChangeParams): void
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| welinkSessionId | number | 是 | 会话 ID |
| callback | function | 是 | 状态变更回调函数 |

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| status | SessionStatus | 会话状态：`executing` / `completed` / `stopped` |

### 状态映射

| WebSocket 消息 `type` | 附加条件 | 映射状态 |
|------|------|------|
| `step.start` | 无 | `executing` |
| `session.status` | `sessionStatus = busy` / `retry` | `executing` |
| `text.delta` | 无 | `executing` |
| `thinking.delta` | 无 | `executing` |
| `tool.update` | 无 | `executing` |
| `question` | 无 | `executing` |
| `permission.ask` | 无 | `executing` |
| `permission.reply` | `response = once` / `always` | `executing` |
| `file` | 无 | `executing` |
| `step.done` | 无 | `completed` |
| `session.status` | `sessionStatus = idle` | `completed` |
| `text.done` | 无 | `completed` |
| `thinking.done` | 无 | `completed` |
| `permission.reply` | `response = reject` | `stopped` |
| `session.error` | 无 | `stopped` |
| `error` | 无 | `stopped` |
| `agent.offline` | 无 | `stopped` |

### 补充说明

- `session.title` 不参与状态映射
- `text.done`、`thinking.done` 是部件级完成信号
- 更稳定的整轮完成信号优先看 `step.done` 或 `session.status=idle`
- `stopSkill()` 成功后，SDK 仍会额外触发一次 `stopped`

### 错误处理

| 错误码 | 错误消息 | 说明 |
|--------|----------|------|
| 1000 | 无效的参数 | 缺少 `welinkSessionId` 或 `callback` |
| 4000 | 会话不存在 | 指定的会话 ID 不存在 |

### 组合调用场景

- SDK 支持先注册后建连
- 若注册时 WebSocket 尚未建立，SDK 会先缓存注册信息，待连接建立后自动生效
- 但推荐在 `createSession` 成功后立即注册，便于上层按顺序组织代码
- 若注册失败，不影响其他接口调用

### 调用示例

```typescript
try {
  onSessionStatusChange({
    welinkSessionId: 42,
    callback: (result) => {
      console.log("状态变化:", result.status);
    }
  });
} catch (error) {
  console.error("注册会话状态回调失败:", error.errorCode, error.errorMessage);
}
```

---

## 5. 小程序状态变更回调接口

### 接口说明

监听 Skill 小程序状态变化。

### 触发条件

| 条件 | 状态 |
|------|------|
| 调用 `controlSkillWeCode("close")` | `closed` |
| 调用 `controlSkillWeCode("minimize")` | `minimized` |

### 接口名

```typescript
onSkillWecodeStatusChange(params: OnSkillWecodeStatusChangeParams): void
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| callback | function | 是 | 小程序状态变更回调函数 |

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| status | SkillWecodeStatus | 小程序状态：`closed` / `minimized` |

### 错误处理

| 错误码 | 错误消息 | 说明 |
|--------|----------|------|
| 1000 | 无效的参数 | 缺少 `callback` |

### 组合调用场景

- 建议在小程序初始化时注册此回调
- 若注册失败，不影响其他接口调用

### 调用示例

```typescript
try {
  onSkillWecodeStatusChange({
    callback: (result) => {
      console.log("小程序状态:", result.status);
    }
  });
} catch (error) {
  console.error("注册小程序状态回调失败:", error.errorCode, error.errorMessage);
}
```

---

## 6. 重新生成问答接口

### 接口说明

在当前会话内重新生成上一轮回答。

### 接口名

```typescript
regenerateAnswer(params: RegenerateAnswerParams): Promise<SendMessageResult>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| welinkSessionId | number | 是 | 需要重新生成的会话 ID |

### 出参

同 `SendMessageResult`

### 实现方法

1. 根据 `welinkSessionId` 找到最后一条用户消息
2. SDK本身需要根据`welinkSessionId`进行用户信息缓存；若 SDK 本地已缓存`welinkSessionId`对应的用户消息，则优先复用本地缓存
3. 若本地缓存不存在，可先从历史消息中定位最后一条 `role=user` 的消息
4. 调用服务端 REST API：
   - **URL**: `POST /api/skill/sessions/{welinkSessionId}/messages`
   - **请求体**:
     ```json
     {
       "content": "{最后一条用户消息内容}"
     }
     ```
5. 通过 WebSocket 继续接收本轮新的流式回答

### 错误处理

| 错误码 | 错误消息 | 说明 |
|--------|----------|------|
| 1000 | 无效的参数 | `welinkSessionId` 缺失或格式错误 |
| 4000 | 会话不存在 | 指定的会话 ID 不存在 |
| 4001 | 会话已关闭 | 会话已被关闭，无法重新生成 |
| 4002 | 无用户消息 | 会话中没有用户消息可用于重新生成 |
| 6000 | 网络错误 | 网络请求失败 |
| 7000 | 服务端错误 | 服务端处理失败 |

### 组合调用场景

- `regenerateAnswer` 失败不影响会话其他操作
- 重新生成过程中，建议暂停其他消息发送

### 调用示例

```typescript
try {
  const result = await regenerateAnswer({ welinkSessionId: 42 });
  console.log("重新生成已启动:", result.id);
} catch (error) {
  console.error("重新生成失败:", error.errorCode, error.errorMessage);
}
```

---

## 7. 发送 AI 生成消息结果接口

### 接口说明

将用户在 Skill 小程序中最终确认的文本内容发送到 IM 聊天，用于“选中文本发送到聊天”场景。

SDK 内部维护消息缓存，记录每个`welinkSessionId`中每条消息完成后的最终内容。调用此接口时，SDK 从缓存中获取对应消息的最终完整文本，然后发送到 IM。

**重要说明：**

- SDK 不支持调用方直接传 `content` 发送到 IM
- 调用此接口时：
  - 若提供 `messageId`，则获取对应消息的最终内容
  - 若不提供 `messageId`，则获取当前会话最后一条最终消息的内容
- 文档中提到的 `content`，指 SDK 根据 `welinkSessionId` 和 `messageId` 最终解析得到的消息内容，不是调用方入参
- `sendMessageToIM` 与 `getSessionMessage` 共享缓存结构
- 服务端历史消息是权威数据源，本地缓存只用于补齐未落库或进行中的消息

### 接口名

```typescript
sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResult>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| welinkSessionId | number | 是 | 会话 ID |
| messageId | number | 否 | 要发送到 IM 的消息 ID。不填则获取当前会话最后一条最终消息的内容 |

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| status | string | 发送结果：`success` / `failed` |
| chatId | string | 目标聊天消息 ID |
| contentLength | number | 发送内容长度 |

### 出参示例

```json
{
  "status": "success",
  "chatId": "chat-789",
  "contentLength": 22
}
```

### 实现方法

1. SDK 内部维护消息缓存，记录每条消息完成后的最终内容：
   - 监听 `text.done` / `thinking.done` 事件，落定最终内容
   - 按 `welinkSessionId + messageId` 存储消息的最终聚合文本
   - 同时维护每个会话的消息顺序，以便获取最后一条消息
   - 缓存结构与 `getSessionMessage` 共享，确保数据一致性
2. 调用 `sendMessageToIM` 时：
   - 若提供 `messageId`：根据 `welinkSessionId` 和 `messageId` 从 SDK 缓存中获取该消息的最终完整内容
   - 若未提供 `messageId`：获取当前会话最后一条最终消息的内容
   - 若缓存中不存在对应消息的最终内容，返回错误
3. SDK 调用 Skill 服务端"发送到 IM"接口，传入 `welinkSessionId` 和解析得到的最终 `content`
调用服务端REST API发送消息到IM：
- **URL**: `POST /api/skill/sessions/{welinkSessionId}/send-to-im`
- **请求体**:
  ```json
  {
    "content": "代码重构已完成，请查看 PR #42"
  }
  ```
- **响应**:
  ```json
  {
    "success": true,
    "chatId": "chat-789",
    "contentLength": 22
  }
  ```

### 缓存管理

#### 缓存键设计

| 键 | 说明 |
|---|---|
| `welinkSessionId` | 会话 ID |
| `messageId` | 消息 ID |

#### 缓存更新时机

| 事件类型 | 缓存操作 |
|---------|---------|
| `text.delta` | 追加临时缓存，用于实时预览 |
| `text.done` | 落定最终内容，更新缓存为最终状态 |
| `thinking.done` | 可选：是否计入最终文本由上层决定 |
| `step.done` | 标记当前步骤完成，缓存已就绪 |
| `streaming` | 用于断线重连时恢复缓存状态 |

### 最终完整内容获取机制

1. 根据 `welinkSessionId` 和 `messageId` 定位缓存中的消息
2. 检查消息是否已完成
3. 对多个 part 按 `partSeq` 顺序聚合最终内容
4. 返回聚合后的最终完整内容

### 缓存生命周期

- `closeSkill` 后缓存保留
- 小程序关闭后缓存保留
- 应用重启后缓存不可用
- 服务端历史消息是权威来源，本地缓存只补齐进行中或未落库内容

### 错误处理

| 错误码 | 错误消息 | 说明 |
|--------|----------|------|
| 1000 | 无效的参数 | `welinkSessionId` 缺失或格式错误 |
| 4000 | 会话不存在 | 指定的会话 ID 不存在 |
| 4003 | 消息不存在 | 请求的消息在缓存中不存在 |
| 4004 | 消息未完成 | 请求的消息尚未收到完成事件 |
| 4005 | 无最终消息 | 会话中没有已完成的消息 |
| 6000 | 网络错误 | 网络请求失败 |
| 7000 | 服务端错误 | 服务端处理失败 |

### 组合调用场景

- 建议在 `getSessionMessage` 获取消息后再调用 `sendMessageToIM`
- 若失败，可重试发送，但需注意避免重复发送

### 调用示例

```typescript
try {
  const result = await sendMessageToIM({
    welinkSessionId: 42,
    messageId: 101
  });

  console.log("发送到 IM 成功:", result.chatId);
} catch (error) {
  console.error("发送到 IM 失败:", error.errorCode, error.errorMessage);
}
```

---

## 8. 获取当前会话的消息列表接口

### 接口说明

获取当前会话的消息列表。SDK 会将服务端历史消息与本地尚未落库的流式消息缓存合并后返回。

本接口适用于以下场景：

- 小程序打开，渲染历史消息
- Mini Bar 展开进入小程序时，展示当前会话消息
- 会话仍在执行中时，获取历史消息和当前已返回的增量内容
- 当前会话没有执行中消息时，也可正常返回纯历史消息

### 接口名

```typescript
getSessionMessage(params: GetSessionMessageParams): Promise<PageResult<SessionMessage>>
```

### 入参

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| welinkSessionId | number | 是 | - | 会话 ID |
| page | number | 否 | 0 | 页码（从 0 开始） |
| size | number | 否 | 50 | 每页条数 |

### 出参

`PageResult<SessionMessage>`

### 实现方法

#### 1. 获取历史消息

调用服务端 REST API 获取当前会话历史消息。

#### 2. 合并本地流式缓存

SDK 内部维护流式消息缓存，用于存储尚未落库但已经通过 WebSocket 收到的消息。

#### 3. 缓存更新逻辑

收到流式消息后，SDK 按 `welinkSessionId + messageId + partId` 更新缓存：

- `text.delta` / `thinking.delta`：追加内容到临时缓存
- `text.done` / `thinking.done`：落定最终内容
- `tool.update`：更新同一工具部件状态和结果
- `question` / `permission.ask` / `file`：追加或更新对应 part
- `snapshot` / `streaming`：用于断线重连恢复本地状态

#### 4. 返回结果

1. 获取服务端历史消息
2. 获取本地缓存中的已完成消息和进行中消息
3. 对同一 `messageId` 做去重和合并
4. 按 `messageSeq` 排序
5. 若当前存在未持久化的进行中消息，将其追加到返回列表
6. 处理分页逻辑并返回结果

### 缓存实现细节

#### 缓存结构

```typescript
interface MessageCache {
  [welinkSessionId: string]: {
    messages: {
      [messageId: string]: {
        id: string;
        messageSeq: number;
        role: string;
        content: string;
        parts: Record<string, unknown>;
        isCompleted: boolean;
        createdAt: string;
      };
    };
    messageSeqOrder: string[];
  };
}
```

#### 数据一致性保证

- 服务端历史消息是权威来源
- 本地缓存仅补齐未落库或进行中的内容
- 通过 `messageId` 去重，通过 `messageSeq` 保证顺序

### 消息角色说明

| 角色 | 说明 |
|------|------|
| user | 用户消息 |
| assistant | AI 回复消息 |
| system | 系统消息 |
| tool | 工具消息 |

### 错误处理

| 错误码 | 错误消息 | 说明 |
|--------|----------|------|
| 1000 | 无效的参数 | `welinkSessionId` 缺失或格式错误 |
| 4000 | 会话不存在 | 指定的会话 ID 不存在 |
| 6000 | 网络错误 | 网络请求失败 |
| 7000 | 服务端错误 | 服务端处理失败 |

### 组合调用场景

- `getSessionMessage` 根据传入的 `welinkSessionId` 读取指定会话
- 建议在 IM 客户端/小程序传入当前绑定会话 ID 后调用
- 若失败，不影响其他接口调用

### 调用示例

```typescript
try {
  const result = await getSessionMessage({
    welinkSessionId: 42,
    page: 0,
    size: 20
  });

  console.log("消息条数:", result.content.length);
} catch (error) {
  console.error("获取消息列表失败:", error.errorCode, error.errorMessage);
}
```

---

## 9. 注册会话监听器接口

### 接口说明

注册会话监听器，用于接收该会话的流式消息、错误事件和关闭事件。

### 接口名

```typescript
registerSessionListener(params: RegisterSessionListenerParams): void
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| welinkSessionId | number | 是 | 会话 ID |
| onMessage | function | 是 | 接收 `StreamMessage` 的回调 |
| onError | function | 否 | 错误回调 |
| onClose | function | 否 | 连接关闭回调 |

### SessionListener 类型定义

见文末数据类型定义。

### SessionError 类型定义

见文末数据类型定义。

### 实现方法

1. 将监听器注册到指定会话
2. 若 WebSocket 已建立，则后续事件直接分发
3. 若 WebSocket 尚未建立，则先缓存注册信息，待连接建立后自动生效
4. 收到流式消息时触发 `onMessage`
5. 连接错误时触发 `onError`
6. 连接关闭时触发 `onClose`

### 错误处理

| 错误码 | 错误消息 | 说明 |
|--------|----------|------|
| 1000 | 无效的参数 | 缺少 `welinkSessionId` 或 `onMessage` |
| 4000 | 会话不存在 | 指定的会话 ID 不存在 |

### 组合调用场景

- SDK 支持先注册后建连
- 若注册时 WebSocket 尚未建立，SDK 会先缓存注册信息，待连接建立后自动生效
- 但推荐在 `createSession` 成功后立即注册，便于上层按顺序组织代码
- 若注册失败，不影响其他接口调用

### 注意事项

- 移除监听器需调用 `unregisterSessionListener({ welinkSessionId, onMessage, onError?, onClose? })`

### 调用示例

```typescript
try {
  registerSessionListener({
    welinkSessionId: 42,
    onMessage: (message) => {
      console.log("收到事件:", message.type);
    },
    onError: (error) => {
      console.error("连接错误:", error.code, error.message);
    }
  });
} catch (error) {
  console.error("注册会话监听器失败:", error.errorCode, error.errorMessage);
}
```

---

## 10. 移除会话监听器接口

### 接口说明

移除指定会话监听器。

### 接口名

```typescript
unregisterSessionListener(params: UnregisterSessionListenerParams): void
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| welinkSessionId | number | 是 | 会话 ID |
| onMessage | function | 是 | 要移除的消息回调函数 |
| onError | function | 否 | 要移除的错误回调函数 |
| onClose | function | 否 | 要移除的连接关闭回调函数 |

### 实现方法

1. 从会话监听器列表中移除指定监听器
2. 若移除后无剩余监听器，暂不关闭WS连接；
3. 若监听器不存在，则直接返回成功
4. 本接口为幂等接口

### 错误处理

| 错误码 | 错误消息 | 说明 |
|--------|----------|------|
| 1000 | 无效的参数 | 缺少 `welinkSessionId` 或 `onMessage` |
| 4000 | 会话不存在 | 指定的会话 ID 不存在 |

### 组合调用场景

- 建议在组件卸载时调用，避免内存泄漏
- 重复移除不视为错误

### 调用示例

```typescript
try {
  unregisterSessionListener({
    welinkSessionId: 42,
    onMessage
  });
} catch (error) {
  console.error("移除会话监听器失败:", error.errorCode, error.errorMessage);
}
```

---

## 11. 发送消息内容接口

### 接口说明

发送用户输入内容，触发会话的新一轮回答。支持首次发送消息和后续多轮对话。AI 响应通过 `registerSessionListener` 注册的回调接收。

### 接口名

```typescript
sendMessage(params: SendMessageParams): Promise<SendMessageResult>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| welinkSessionId | number | 是 | 会话 ID |
| content | string | 是 | 用户输入的消息内容 |
| toolCallId | string | 否 | 回答 AI `question` 时携带的工具调用 ID |

### 出参

见文末 `SendMessageResult`

### 实现方法

1. 检查 WebSocket 连接状态，若当前连接已断开，则自动重建连接
2. 调用服务端 REST API 发送消息
   - **URL**: `POST /api/skill/sessions/{welinkSessionId}/messages`
3. AI 流式响应由 WebSocket 推送到 SDK，再通过监听器分发
4. 首次发送消息和后续多轮对话均走此接口

### 错误处理

| 错误码 | 错误消息 | 说明 |
|--------|----------|------|
| 1000 | 无效的参数 | `welinkSessionId` 或 `content` 缺失或格式错误 |
| 4000 | 会话不存在 | 指定的会话 ID 不存在 |
| 4001 | 会话已关闭 | 会话已被关闭，无法发送消息 |
| 6000 | 网络错误 | 网络请求失败 |
| 7000 | 服务端错误 | 服务端处理失败 |
| 7001 | AI 网关错误 | AI-Gateway 调度失败 |

### 组合调用场景

- `sendMessage` 的 WebSocket 自动建连只是容错兜底，不替代 `createSession`
- `sendMessage` 只能在已有 `welinkSessionId` 的前提下工作，不能隐式创建会话
- 推荐在 `createSession` 成功后再调用 `sendMessage`
- 发送消息后应注册监听器接收 AI 响应

### 调用示例

```typescript
try {
  const session = await createSession({
    ak: "ak_xxxxxxxx",
    title: "帮我创建一个React项目",
    imGroupId: "group_abc123"
  });

  registerSessionListener({
    welinkSessionId: session.welinkSessionId,
    onMessage: console.log
  });

  const result = await sendMessage({
    welinkSessionId: session.welinkSessionId,
    content: "帮我创建一个React项目"
  });

  console.log("消息发送成功:", result.id);
} catch (error) {
  console.error("发送消息失败:", error.errorCode, error.errorMessage);
}
```

---

## 12. 权限确认接口

### 接口说明

回复 AI 发起的权限请求。

### 接口名

```typescript
replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResult>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| welinkSessionId | number | 是 | 会话 ID |
| permId | string | 是 | 权限请求 ID |
| response | string | 是 | `once` / `always` / `reject` |

### 出参

见文末 `ReplyPermissionResult`

### 实现方法

调用服务端权限回复接口，并在后续继续通过 WebSocket 接收结果事件。

### 错误处理

| 错误码 | 错误消息 | 说明 |
|--------|----------|------|
| 1000 | 无效的参数 | 缺少 `welinkSessionId`、`permId` 或 `response` 无效 |
| 4000 | 会话不存在 | 指定的会话 ID 不存在 |
| 4007 | 权限请求不存在 | 指定的权限请求 ID 不存在 |
| 4008 | 权限请求已过期 | 权限请求已超时或已处理 |
| 6000 | 网络错误 | 网络请求失败 |
| 7000 | 服务端错误 | 服务端处理失败 |

### 组合调用场景

- 建议在收到 `permission.ask` 事件后再调用 `replyPermission`
- 若失败，可重试，但需避免重复处理

### 调用示例

```typescript
try {
  const result = await replyPermission({
    welinkSessionId: 42,
    permId: "perm_001",
    response: "once"
  });

  console.log("权限确认结果:", result.response);
} catch (error) {
  console.error("回复权限确认失败:", error.errorCode, error.errorMessage);
}
```

---

## 13. 小程序控制接口

### 接口说明

控制 Skill 小程序关闭或最小化。

**重要说明：**

- `close`：关闭小程序窗口，不关闭服务端会话
- `minimize`：最小化小程序窗口，保留会话和连接
- 上层可在 `close` 成功后继续调用 `closeSkill()` 释放 WebSocket
- 小程序关闭后缓存仍保留

### 接口名

```typescript
controlSkillWeCode(params: ControlSkillWeCodeParams): Promise<ControlSkillWeCodeResult>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| action | SkillWeCodeAction | 是 | 操作类型：`close` / `minimize` |

### 出参

见文末 `ControlSkillWeCodeResult`

### 实现方法

- `close`
  - 关闭 Skill 小程序窗口
  - 触发 `onSkillWecodeStatusChange(closed)`
- `minimize`
  - 最小化 Skill 小程序窗口
  - 触发 `onSkillWecodeStatusChange(minimized)`

### 错误处理

| 错误码 | 错误消息 | 说明 |
|--------|----------|------|
| 1000 | 无效的参数 | `action` 缺失或值无效 |
| 4009 | 小程序不存在 | 小程序未初始化或已关闭 |
| 4010 | 操作失败 | 小程序操作执行失败 |

### 组合调用场景

- 若 `controlSkillWeCode` 失败，不影响其他接口调用
- 建议在 `close` 操作后按需调用 `closeSkill`

### 调用示例

```typescript
try {
  await controlSkillWeCode({
    action: "minimize"
  });
} catch (error) {
  console.error("控制小程序失败:", error.errorCode, error.errorMessage);
}
```

---

## 14. V2 到 V3 迁移说明

### 迁移要点

- `executeSkill` 已废弃，改为 `createSession + sendMessage`
- `ExecuteSkillParams` 改为 `CreateSessionParams`
- 首轮消息不再在建会话接口中触发
- IM 首次触发推荐顺序为：
  1. `createSession`
  2. `registerSessionListener` / `onSessionStatusChange`
  3. `sendMessage`

### 升级影响

- 旧接入方如果仍按单接口触发首轮执行，需要改造为两步式调用
- Mini Bar 和 Skill 小程序都应显式持有 `welinkSessionId`
- `getSessionMessage`、`sendMessageToIM` 等接口都以外部传入的会话 ID 为准

---

## 数据类型定义

> 说明：
> - 以下类型以客户端 SDK 对外契约为准
> - `StreamMessage` 与服务端 WebSocket 事件模型保持对齐
> - 本文档仅修订客户端契约；未在服务端文档中补齐的接口，仍需后续与服务端统一

### SkillSession

| 字段 | 类型 | 说明 |
|------|------|------|
| welinkSessionId | number | 会话 ID |
| userId | string | 用户 ID |
| ak | string | Access Key |
| title | string | 会话标题 |
| imGroupId | string | IM 群组 ID |
| status | string | 会话状态 |
| toolSessionId | string \| null | OpenCode Session ID |
| createdAt | string | 创建时间，ISO-8601 |
| updatedAt | string | 更新时间，ISO-8601 |

### CreateSessionParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ak | string | 是 | Agent Plugin 对应的 Access Key |
| title | string | 否 | 会话标题 |
| imGroupId | string | 是 | 关联的 IM 群组 ID |

### StopSkillParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| welinkSessionId | number | 是 | 要停止的会话 ID |

### RegenerateAnswerParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| welinkSessionId | number | 是 | 需要重新生成的会话 ID |

### OnSessionStatusChangeParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| welinkSessionId | number | 是 | 会话 ID |
| callback | function | 是 | 状态变更回调函数 |

### OnSkillWecodeStatusChangeParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | function | 是 | 小程序状态变更回调函数 |

### GetSessionMessageParams

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| welinkSessionId | number | 是 | - | 会话 ID |
| page | number | 否 | 0 | 页码（从 0 开始） |
| size | number | 否 | 50 | 每页条数 |

### RegisterSessionListenerParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| welinkSessionId | number | 是 | 会话 ID |
| onMessage | function | 是 | 接收 `StreamMessage` 的回调 |
| onError | function | 否 | 错误回调 |
| onClose | function | 否 | 连接关闭回调 |

### UnregisterSessionListenerParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| welinkSessionId | number | 是 | 会话 ID |
| onMessage | function | 是 | 要移除的消息回调函数 |
| onError | function | 否 | 要移除的错误回调函数 |
| onClose | function | 否 | 要移除的连接关闭回调函数 |

### SendMessageParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| welinkSessionId | number | 是 | 会话 ID |
| content | string | 是 | 用户输入的消息内容 |
| toolCallId | string | 否 | 回答 AI `question` 时携带的工具调用 ID |

### ReplyPermissionParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| welinkSessionId | number | 是 | 会话 ID |
| permId | string | 是 | 权限请求 ID |
| response | string | 是 | `once` / `always` / `reject` |

### ControlSkillWeCodeParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | SkillWeCodeAction | 是 | 操作类型：`close` / `minimize` |

### SendMessageToIMParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| welinkSessionId | number | 是 | 会话 ID |
| messageId | number | 否 | 要发送到 IM 的消息 ID；不填则获取当前会话最后一条最终消息的内容 |

### SessionListener

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| onMessage | function | 是 | 消息回调函数，接收完整 `StreamMessage` 事件 |
| onError | function | 否 | 错误回调函数 |
| onClose | function | 否 | 连接关闭回调函数 |

### SessionError

| 字段 | 类型 | 说明 |
|------|------|------|
| code | string | 错误码 |
| message | string | 错误信息 |
| timestamp | number | 时间戳（毫秒） |

### SDKError

| 字段 | 类型 | 说明 |
|------|------|------|
| errorCode | number | 错误码 |
| errorMessage | string | 错误消息 |

### PageResult<T>

| 字段 | 类型 | 说明 |
|------|------|------|
| content | Array<T> | 当前页数据 |
| page | number | 当前页码（从 0 开始） |
| size | number | 每页大小 |
| total | number | 总记录数 |

### SessionMessage

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 消息 ID |
| welinkSessionId | number | 所属会话 ID |
| userId | string \| null | 用户 ID |
| role | string | `user` / `assistant` / `system` / `tool` |
| content | string | 聚合后的消息内容 |
| messageSeq | number | 会话内消息顺序 |
| parts | Array<SessionMessagePart> | 消息部件列表 |
| createdAt | string | 创建时间，ISO-8601 |

### SessionMessagePart

| 字段 | 类型 | 说明 |
|------|------|------|
| partId | string | Part 唯一 ID |
| partSeq | number | Part 在消息内的顺序 |
| type | string | `text` / `thinking` / `tool` / `question` / `permission` / `file` |
| content | string | 文本内容 |
| toolName | string | 工具名 |
| toolCallId | string | 工具调用 ID |
| toolStatus | string | 工具状态 |
| toolInput | object | 工具输入 |
| toolOutput | string | 工具输出 |
| question | string | 问题正文 |
| options | string[] | 问题选项 |
| permissionId | string | 权限请求 ID |
| fileName | string | 文件名 |
| fileUrl | string | 文件 URL |
| fileMime | string | 文件 MIME 类型 |

### SessionStatusResult

| 字段 | 类型 | 说明 |
|------|------|------|
| status | SessionStatus | 会话状态：`executing` / `stopped` / `completed` |

### SessionStatus

| 枚举值 | 说明 |
|--------|------|
| executing | 执行中 |
| stopped | 已停止 |
| completed | 已完成 |

### SkillWecodeStatusResult

| 字段 | 类型 | 说明 |
|------|------|------|
| status | SkillWecodeStatus | 小程序状态：`closed` / `minimized` |
| timestamp | number | 状态变更时间戳（毫秒） |
| message | string | 状态变更说明（可选） |

### SkillWecodeStatus

| 枚举值 | 说明 |
|--------|------|
| closed | 小程序已关闭 |
| minimized | 小程序已缩小到后台 |

### SkillWeCodeAction

| 枚举值 | 说明 |
|--------|------|
| close | 关闭小程序 |
| minimize | 最小化小程序 |

### StreamMessage

#### 公共字段

| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | 事件类型 |
| seq | number | 递增序列号 |
| welinkSessionId | string | 所属会话 ID |
| emittedAt | string | 事件产生时间，ISO-8601 |
| raw | object | 原始 OpenCode 事件，仅调试用 |

#### 消息级字段

| 字段 | 类型 | 说明 |
|------|------|------|
| messageId | string | 稳定消息 ID |
| messageSeq | number | 会话内消息顺序 |
| role | string | `user` / `assistant` / `system` / `tool` |

#### Part级字段

| 字段 | 类型 | 说明 |
|------|------|------|
| partId | string | Part 唯一 ID |
| partSeq | number | Part 在消息内的顺序 |

#### 支持的事件类型

| type | 说明 | 关键附加字段 |
|------|------|--------------|
| `text.delta` | AI 文本增量 | `content` |
| `text.done` | AI 文本完成 | `content` |
| `thinking.delta` | 思维链增量 | `content` |
| `thinking.done` | 思维链完成 | `content` |
| `tool.update` | 工具调用状态更新 | `toolName` `toolCallId` `status` `input` `output` `error` `title` |
| `question` | AI 提问交互 | `toolName` `toolCallId` `status` `header` `question` `options` |
| `file` | 文件或图片附件 | `fileName` `fileUrl` `fileMime` |
| `step.start` | 推理步骤开始 | 无额外必填字段 |
| `step.done` | 推理步骤结束 | `tokens` `cost` `reason` |
| `session.status` | 会话状态变化 | `sessionStatus` |
| `session.title` | 会话标题变化 | `title` |
| `session.error` | 会话级错误 | `error` |
| `permission.ask` | 权限请求 | `permissionId` `permType` `title` `metadata` |
| `permission.reply` | 权限响应结果 | `permissionId` `response` |
| `agent.online` | Agent 上线 | 无额外字段 |
| `agent.offline` | Agent 下线 | 无额外字段 |
| `error` | 非会话级错误 | `error` |
| `snapshot` | 断线恢复快照 | `messages` |
| `streaming` | 断线恢复中的进行中消息 | `sessionStatus` `messageId` `messageSeq` `role` `parts` |

#### 常用附加字段

| 字段 | 类型 | 说明 |
|------|------|------|
| content | string | 文本内容或最终完整内容 |
| toolName | string | 工具名称 |
| toolCallId | string | 工具调用 ID |
| status | string | 工具状态或问题运行状态 |
| input | object | 工具输入参数 |
| output | string | 工具输出结果 |
| error | string | 错误描述 |
| title | string | 工具标题或会话标题 |
| header | string | 问题分组标题 |
| question | string | 问题正文 |
| options | string[] | 问题预设选项 |
| fileName | string | 文件名 |
| fileUrl | string | 文件访问 URL |
| fileMime | string | MIME 类型 |
| tokens | object | token 使用统计 |
| cost | number | 本步骤费用 |
| reason | string | 结束原因 |
| sessionStatus | string | 服务端原始状态：`busy` / `idle` / `retry` |
| permissionId | string | 权限请求 ID |
| permType | string | 权限类型 |
| metadata | object | 权限请求详情 |
| response | string | 权限回复值：`once` / `always` / `reject` |
| messages | array | `snapshot` 携带的已完成消息快照 |
| parts | array | `streaming` 携带的进行中消息部件 |

### SendMessageResult

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 消息 ID |
| welinkSessionId | number | 所属会话 ID |
| userId | string | 发送用户 ID |
| role | string | 固定为 `user` |
| content | string | 消息内容 |
| messageSeq | number | 该消息在会话中的顺序号 |
| createdAt | string | 创建时间，ISO-8601 |

### StopSkillResult

| 字段 | 类型 | 说明 |
|------|------|------|
| welinkSessionId | number | 会话 ID |
| status | string | 中止结果，成功时为 `aborted` |

### CloseSkillResult

| 字段 | 类型 | 说明 |
|------|------|------|
| status | string | 关闭结果：`success` / `failed` |

### ReplyPermissionResult

| 字段 | 类型 | 说明 |
|------|------|------|
| welinkSessionId | number | 会话 ID |
| permissionId | string | 权限请求 ID |
| response | string | 回复值 |

### ControlSkillWeCodeResult

| 字段 | 类型 | 说明 |
|------|------|------|
| status | string | 操作状态：`success` / `failed` |

### SendMessageToIMResult

| 字段 | 类型 | 说明 |
|------|------|------|
| status | string | 发送是否成功 |
| chatId | string | 目标聊天消息 ID |
| contentLength | number | 发送内容长度 |
