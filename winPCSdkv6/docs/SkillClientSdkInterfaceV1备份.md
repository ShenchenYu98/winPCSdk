# Skill SDK 工程文档

## 概述
Skill Sdk是一个中间件，主要用于IM客户端和小程序之间的交互，IM客户端/小程序和Skill服务端之间的交互；
  IM客户端和小程序之间的交互：
    IM客户端注册监听小程序的关闭和最小化状态，小程序关闭和最小化时触发IM客户端对应的事件监听；
  IM客户端/小程序和Skill服务端之间的交互：
    IM客户端触发Skill的开始执行，小程序作为扩展能力可以进行同一Skill的多轮对话；两者都涉及到和Skill之间的一系列网络请求交互；

本文档描述了用于IM客户端、OpenCode Skill服务端、小程序间交互的Web端 SDK接口定义。

---

## 1. 执行技能接口

### 调用方
IM客户端调用

### 接口说明

与Skill服务端建立WebSocket会话连接，并发送用户消息到服务端触发AI处理。

### 接口名

```typescript
executeSkill(params: ExecuteSkillParams): Promise<SkillSession>
```
### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| ak | String | 是 | Agent Plugin 对应的 Access Key，用于定位 Agent 连接 |
| title | String | 否 | 会话标题，不填则由 AI 自动生成 |
| imGroupId | String | 是 | 关联的 IM 群组 ID |

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
| `welinkSessionId` | number   | 会话 ID                                        |
| `userId`          | String | 用户 ID（从 Cookie 解析）                      |
| `ak`              | String | Access Key                                     |
| `title`           | String | 会话标题                                       |
| `imGroupId`       | String | IM 群组 ID                                     |
| `status`          | String | 会话状态：`ACTIVE`                             |
| `toolSessionId`   | String | OpenCode Session ID，创建时为 `null`，异步填充 |
| `createdAt`       | String | 创建时间，ISO-8601                             |
| `updatedAt`       | String | 更新时间，ISO-8601                             |

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
  "createdAt": "2026-03-08T00:15:00",
  "updatedAt": "2026-03-08T00:15:00"
}
```

### 实现方法
1. 建立WebSocket连接，先判读是否存在WebSocket连接，若存在则复用，不存在则新建：
   - **URL**: `ws://host/ws/skill/stream`
   - 用于接收服务端推送的AI响应流（增量内容、完成通知、错误信息等）

2. 调用服务端REST API查询会话列表，根据IM传入的`imGroupId`查询对应的活跃会话：
   - **URL**: `GET /api/skill/sessions`
   - **查询参数**:
    ```json
     {
      "imGroupId": "1001",
      "status": "ACTIVE",
     }
    ```

3. 若不存在活跃会话，则根据IM客户端传入的`imGroupId`新建：
   - 调用 `POST /api/skill/sessions`
   - 请求体:
   ```json
    {
      "ak": "ak_xxxxxxxx",
      "title": "帮我创建一个React项目",
      "imGroupId": "group_abc123"
    }
    ```

4. **WebSocket消息回调机制**：
   - WebSocket连接建立后，服务端会立即开始推送AI响应流
   - 所有通过 `registerSessionListener` 注册的监听器会实时接收消息

5. **时序安全保障**：
   - 如果 `registerSessionListener` 在 `executeSkill` 之前调用，监听器会被暂存
   - WebSocket连接建立后，暂存的监听器会自动生效
   - 确保不会因调用时序问题遗漏任何消息

### 调用示例

```typescript
try {
  const session = await executeSkill({
    ak: "ak_xxxxxxxx",
    title: "帮我创建一个React项目",
    imGroupId: "group_abc123"
  });
  
  console.log('会话创建成功:', session.welinkSessionId);
  console.log('会话状态:', session.status);
} catch (error) {
  console.error('执行技能失败:', error.message);
  // 错误处理：会话创建失败、网络错误等
}
```

---

## 2. 关闭技能接口

### 接口说明

关闭SDK与Skill服务端之间的WebSocket连接，释放资源。

### 接口名

```typescript
closeSkill(): Promise<CloseSkillResult>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 无 | 无 | 无 | 无 |

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| status | string | 关闭状态：success（成功）、failed（失败） |

### 出参示例

成功时：

```json
{
  "status": "success"
}
```

### 实现方法

1. 关闭WebSocket连接

### 调用示例

```typescript
try {
  const result = await closeSkill();
  
  if (result.status === 'success') {
    console.log('会话关闭成功');
  }
} catch (error) {
  console.error('关闭会话失败:', error.message);
  // 错误处理：会话不存在、会话已关闭、网络错误等
}
```

---

## 3. 停止技能接口

### 接口说明

停止Skill服务端与SDK之间某个Skill对应的sessionId会话的持续回调，中断当前正在进行的回答生成，但保持WS会话连接。调用此接口后，用户可以后续发送新消息继续对话。

### 接口名

```typescript
stopSkill(params: StopSkillParams): Promise<StopSkillResult>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `welinkSessionId` | number | 会话 ID |
### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `welinkSessionId` | number | 会话 ID |
| `status` | string| 会话状态 |

### 出参示例

成功时：

```json
{
  "welinkSessionId": 42,
  "status": "aborted"
}
```

### 实现方法

1. 调用服务端REST API关闭会话：
   - **URL**: `POST /api/skill/sessions/{welinkSessionId}/abort`
   - **响应**: 
     ```json
     {
      "code": 0,
      "errormsg": "",
      "data": {
        "welinkSessionId": 42,
        "status": "aborted"
      }
    }
     ```

### 调用示例

```typescript
try {
  const result = await stopSkill({ welinkSessionId: 42 });
  
  if (result.status === 'aborted') {
    console.log('会话已停止，可继续发送消息');
  }
} catch (error) {
  console.error('停止会话失败:', error.message);
  // 错误处理：会话不存在、网络错误等
}
```

---

## 4. 会话状态变更回调接口

### 接口说明

监听会话消息状态变更的回调接口，包括执行中、停止、完成三种状态。通过注册回调函数的方式获取状态变化通知。

**重要说明**：
- 调用该接口**不会创建WebSocket连接**
- 该接口基于已创建的WebSocket会话连接，监听WebSocket消息
- 根据消息类型来更新会话状态并触发回调

### 接口名

```typescript
onSessionStatusChange(params: OnSessionStatusChangeParams): void
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| welinkSessionId | number | 是 | 会话ID |
| callback | function | 是 | 状态变更回调函数 |

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| status | SessionStatus | 会话状态，枚举值：executing（执行中）、stopped（停止）、completed（完成） |

### 出参示例

回调函数接收的参数示例：

```typescript
// 执行中状态
{
  status: SessionStatus.EXECUTING,  // "executing"
}

// 停止状态
{
  status: SessionStatus.STOPPED,    // "stopped"
}

// 完成状态
{
  status: SessionStatus.COMPLETED,  // "completed"
}
```

### 实现方法

1. **前提条件**：
   - WebSocket会话连接必须已建立（通过 `executeSkill` 创建）
   - 该接口不会主动创建WebSocket连接

2. **监听WebSocket消息**，根据消息类型更新会话状态：

   | WebSocket消息type | 说明 | SessionStatus |
   |------------------|------|---------------|
  待补充


### 调用示例

```typescript
try {
  onSessionStatusChange({
    welinkSessionId: 42,
    callback: (result) => {
      switch (result.status) {
        case SessionStatus.EXECUTING:
          console.log('AI正在处理中...');
          break;
        case SessionStatus.STOPPED:
          console.log('会话已停止');
          break;
        case SessionStatus.COMPLETED:
          console.log('AI处理完成');
          break;
      }
    }
  });
} catch (error) {
  console.error('注册状态监听失败:', error.message);
}
```

---

## 5. 小程序状态变更回调接口

### 接口说明

监听小程序的状态变化，当小程序被关闭或最小化时触发回调，通知上层应用进行相应处理。该回调用于处理以下场景：
- 调用`controlSkillWeCode`接口主动控制小程序状态

### 触发条件

| 触发场景 | 回调状态 |
|----------|----------|
| 调用`controlSkillWeCode("close")` | closed |
| 调用`controlSkillWeCode("minimize")` | minimized |

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
| status | SkillWecodeStatus | 小程序状态，枚举值：closed（关闭）、minimized（最小化） |

### 出参示例

回调函数接收的参数示例：

```typescript
// 关闭状态
{
  status: SkillWecodeStatus.CLOSED,      // "closed"
}

// 最小化状态
{
  status: SkillWecodeStatus.MINIMIZED,   // "minimized"
}
```

### 实现方法

1. **监听接口调用事件**：
   - 监听`controlSkillWeCode`接口的调用
   - 当该接口被调用时，根据传入的action触发相应状态回调

2. **状态回调触发逻辑**：
   - 当调用`controlSkillWeCode("close")`时，触发回调并传入`closed`状态
   - 当调用`controlSkillWeCode("minimize")`时，触发回调并传入`minimized`状态
   - 回调函数将在接口调用成功后立即执行

### 调用示例

```typescript
try {
  onSkillWecodeStatusChange({
    callback: (result) => {
      switch (result.status) {
        case SkillWecodeStatus.CLOSED:
          console.log('小程序已关闭');
          // 清理资源
          break;
        case SkillWecodeStatus.MINIMIZED:
          console.log('小程序已最小化');
          // 保持连接，可后续恢复
          break;
      }
    }
  });
} catch (error) {
  console.error('注册小程序状态监听失败:', error.message);
  // 错误处理：监听注册失败等
}
```

---

## 6. 重新生成问答接口

### 接口说明

根据当前会话的最后一条用户消息内容重新生成回答，用于用户对回答结果不满意时触发重新回答。

### 接口名

```typescript
regenerateAnswer(): Promise<AnswerResult>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 无 | 无 | 无 | 无 |

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `id`              | number    | 消息 ID                |
| `welinkSessionId` | number    | 所属会话 ID            |
| `userId`          | String  | 发送用户 ID            |
| `role`            | String  | 角色，固定 `"user"`    |
| `content`         | String  | 消息内容               |
| `messageSeq`      | number | 该消息在会话内的顺序号 |
| `createdAt`       | String  | 创建时间，ISO-8601     |

### 实现方法

1. 获取对应`welinkSessionId`用户输入的最后一条消息（Skill SDK本身要根据`welinkSessionId`进行用户输入消息存储）

2. 调用服务端REST API发送用户消息（使用用户输入的最后一条消息内容）：
   - **URL**: `POST /api/skill/sessions/{welinkSessionId}/messages`
   - **请求体**:
     ```json
     {
       "content": "{最后一条用户消息内容}",
       "toolCallId": "call_2"
     }
     ```

3. 通过WebSocket流式连接接收AI重新生成的响应

### 注意事项

- 该接口需要确保WebSocket流式连接已建立
- 适用于AI回答不完整或不满意的情况下重新生成结果

### 调用示例

```typescript
try {
  const result = await regenerateAnswer();
  
  if (result.success) {
    console.log('重新生成已启动，消息ID:', result.messageId);
  }
} catch (error) {
  console.error('重新生成失败:', error.message);
  // 错误处理：会话不存在、WebSocket未连接、网络错误等
}
```

---

## 7. 发送AI生成消息结果接口

### 接口说明

将AI生成的消息结果发送到IM客户端，用于将Skill服务端的回答内容同步到IM会话中。通过调用服务端API，将消息内容转发到会话关联的IM聊天中。

### 接口名

```typescript
sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResult>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| welinkSessionId | number | 是 | 会话ID |

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| status | string | 发送结果 |

### 出参示例

成功时：
```json
{
  "status": "success"
}
```


### 实现方法

待补充

---

## 8. 获取当前会话的消息列表接口

### 接口说明

获取当前会话的消息列表，将数据持久化存储到本地。分页查询指定会话的消息历史记录，包括用户消息和AI回答。

### 接口名

```typescript
getSessionMessage(params: GetSessionMessageParams): Promise<PageResult<T>>
```

### 入参

| 参数   | 类型      | 必填 | 默认值 | 说明              |
| ------ | --------- | ---- | ------ | ----------------- |
| welinkSessionId | number | 是 | - | 会话ID |
| page | number | 否   | 0    | 页码（从 0 开始） |
| size | number | 否   | 50   | 每页条数          |

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| content | Array<T> | 历史消息列表，包含用户消息和AI回答 |
| totalElements | number | 总记录数 |
| totalPages | number | 总页数 |
| number | number | 当前页码（从 0 开始） |
| size | number | 每页大小 |

### 实现方法

#### 1. 获取历史消息（服务端持久化数据）

调用服务端REST API查询消息历史：
- **URL**: `GET /api/skill/sessions/{welinkSessionId}/messages`
- **响应**:
  ```json
  {
    "content": [
      {
        "id": 101,
        "welinkSessionId": 42,
        "userId": "10001",
        "role": "user",
        "content": "帮我创建一个React项目",
        "messageSeq": 1,
        "parts": [],
        "createdAt": "2026-03-08T00:15:00"
      },
      {
        "id": 102,
        "welinkSessionId": 42,
        "userId": null,
        "role": "assistant",
        "content": "好的，我来帮你创建...",
        "messageSeq": 2,
        "parts": [
          {
            "partId": "p_1",
            "partSeq": 1,
            "type": "text",
            "content": "好的，我来帮你创建..."
          },
          {
            "partId": "p_2",
            "partSeq": 2,
            "type": "tool",
            "toolName": "bash",
            "toolStatus": "completed",
            "toolInput": { "command": "npx create-vite" },
            "toolOutput": "Done."
          }
        ],
        "createdAt": "2026-03-08T00:15:05"
      }
    ],
    "page": 0,
    "size": 50,
    "total": 2
  }
  ```

#### 2. 合并正在流式传输中的消息内容

当AI正在流式返回内容但尚未完成时，需要将本地缓存的增量内容与历史消息合并：

**2.1 本地增量消息缓存机制**

SDK内部维护一个增量消息缓存，用于存储WebSocket接收的`delta`类型消息：

**2.2 缓存更新逻辑**

收到增量消息时，更新缓存：

**2.3 消息合并逻辑**

调用 `getSessionMessage` 时，SDK执行以下步骤：
Step 1: 获取服务端历史消息
Step 2: 获取本地流式消息缓存
Step 3: 判断是否需要合并
  检查历史消息中是否已包含该消息（避免重复）
  构造流式消息对象
  追加到消息列表末尾
Step 4: 如果流式消息已完成但未同步到服务端，也需合并

#### 3. 数据流图示

```
┌─────────────────────────────────────────────────────────────────┐
│                    getSessionMessage 调用流程                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐    ┌──────────────────┐                  │
│  │  REST API 调用   │    │  本地缓存查询    │                  │
│  │  历史消息列表    │    │  流式消息缓存    │                  │
│  └────────┬─────────┘    └────────┬─────────┘                  │
│           │                       │                            │
│           │   ┌───────────────────┘                            │
│           │   │                                                │
│           ▼   ▼                                                │
│      ┌─────────────┐                                           │
│      │  消息合并    │         │
│      │  去重处理    │     │
│      └──────┬──────┘                                           │
│             │                                                  │
│             ▼                                                  │
│      ┌─────────────┐                                           │
│      │  返回结果   │                                           │
│      │  历史消息   │                                           │
│      │  + 流式消息 │（如果正在传输中）                         │
│      └─────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 消息角色说明

| role值 | 说明 |
|--------|------|
| user | 用户消息 |
| assistant | AI回答 |
| system | 系统消息 |
| tool | 工具执行结果 |

### 调用示例

```typescript
try {
  const result = await getSessionMessage({
    welinkSessionId: 42,
    page: 0,
    size: 50
  });
  
  console.log('总消息数:', result.totalElements);
  console.log('当前页:', result.number);
  
  result.content.forEach(message => {
    console.log(`[${message.role}] ${message.content}`);
  });
} catch (error) {
  console.error('获取消息列表失败:', error.message);
  // 错误处理：会话不存在、网络错误等
}
```

---

## 9. 注册会话监听器接口

### 接口说明

注册会话监听器，用于接收WebSocket推送的AI响应流、错误信息和连接关闭事件。该接口独立于消息发送操作，支持在任何时机注册监听器，SDK会确保不会因调用时序问题遗漏消息。

### 接口名

```typescript
registerSessionListener(params: RegisterSessionListenerParams): void
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| welinkSessionId | number | 是 | 会话ID |
| onMessage | function | 是 | 消息回调函数，接收AI响应流 |
| onError | function | 否 | 错误回调函数，接收错误信息 |
| onClose | function | 否 | 连接关闭回调函数 |


### SessionListener 类型定义

```typescript
interface SessionListener {
  onMessage: (message: StreamMessage) => void;
  onError?: (error: SessionError) => void;
  onClose?: (reason: string) => void;
}
```

### SessionError 类型定义

```typescript
interface SessionError {
  code: string;
  message: string;
  timestamp: number;
}
```

### 实现方法

1. **回调注册机制**：
   - SDK内部维护每个会话的监听器列表
   - 支持多个监听器同时注册同一会话
   - 回调注册是幂等的，重复注册不会产生副作用

2. **时序安全保障**：
   - 如果WebSocket连接已建立，新注册的监听器会立即开始接收后续消息
   - 如果WebSocket尚未建立，监听器会被暂存，连接建立后自动生效
   - SDK保证回调注册与WebSocket连接建立的时序无关

3. **连接管理**：
   - 首次注册监听器时，如果WebSocket未连接，监听器会被暂存，连接建立后自动生效
   - 多个监听器共享同一个WebSocket连接

4. **事件分发**：
   - WebSocket收到消息后，调用所有监听器的 `onMessage` 回调
   - 连接错误时，调用所有监听器的 `onError` 回调
   - 连接关闭时，调用所有监听器的 `onClose` 回调


### 注意事项

- 回调注册是异步安全的，可在任何时机调用
- 移除监听器需调用 `unregisterSessionListener(sessionId, onMessage, onError?, onClose?)`

### 调用示例

```typescript
// 定义回调函数
const onMessage = (message: StreamMessage) => {
  switch (message.type) {
    case 'delta':
      console.log('AI响应片段:', message.content);
      break;
    case 'done':
      console.log('AI处理完成');
      break;
    case 'error':
      console.error('处理错误:', message.content);
      break;
  }
};

const onError = (error: SessionError) => {
  console.error('连接错误:', error.code, error.message);
};

const onClose = (reason: string) => {
  console.log('连接关闭:', reason);
};

try {
  registerSessionListener({
    sessionId: '42',
    onMessage,
    onError,
    onClose
  });
  console.log('监听器注册成功');
} catch (error) {
  console.error('注册监听器失败:', error.message);
  // 错误处理：无效sessionId、连接失败等
}
```

---

## 10. 移除会话监听器接口

### 接口说明

移除已注册的会话监听器。当监听器不再需要接收消息时调用，例如小程序关闭或切换页面时。

### 接口名

```typescript
unregisterSessionListener(params: UnregisterSessionListenerParams): void
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| welinkSessionId | number | 是 | 会话ID |
| onMessage | function | 是 | 要移除的消息回调函数 |
| onError | function | 否 | 要移除的错误回调函数 |
| onClose | function | 否 | 要移除的连接关闭回调函数 |

### 实现方法

1. 从会话的监听器列表中移除指定的监听器
2. 如果移除后该会话无剩余监听器，且配置为自动断开，则关闭WebSocket连接

### 使用场景

```typescript
// 小程序页面销毁时移除监听
onUnmounted(() => {
  unregisterSessionListener(sessionId, onMessage, onError, onClose);
});
```

### 注意事项

- 移除的监听器必须是之前通过 `registerSessionListener` 注册的同一个监听器对象
- 建议保存监听器对象引用以便后续移除

### 调用示例

```typescript
// 保存回调函数引用
const onMessage = (message: StreamMessage) => {
  console.log('收到消息:', message);
};

try {
  // 移除监听器
  unregisterSessionListener({
    welinkSessionId: 42,
    onMessage
  });
  console.log('监听器已移除');
} catch (error) {
  console.error('移除监听器失败:', error.message);
  // 错误处理：监听器未注册、无效sessionId等
}
```

---

## 11. 发送消息内容接口

### 接口说明

发送用户输入的内容，触发会话的持续回答，用于多轮对话场景。该接口会先发送消息到服务端，然后通过WebSocket接收AI的流式响应。

### 接口名

```typescript
sendMessage(params: SendMessageParams): Promise<SendMessageResult>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| welinkSessionId | number | 是 | 会话ID |
| content | string | 是 | 用户输入的消息内容 |
| toolCallId | string | 否 | 回答 AI question 时携带对应的工具调用 ID。不带则按普通消息处理 |

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `id`              | number    | 消息 ID                |
| `welinkSessionId` | number    | 所属会话 ID            |
| `userId`          | String  | 发送用户 ID            |
| `role`            | String  | 角色，固定 `"user"`    |
| `content`         | String  | 消息内容               |
| `messageSeq`      | Integer | 该消息在会话内的顺序号 |
| `createdAt`       | String  | 创建时间，ISO-8601     |

### 出参示例

成功时：

```json
{
  "id": 101,
  "welinkSessionId": 42,
  "userId": "10001",
  "role": "user",
  "content": "帮我创建一个React项目",
  "messageSeq": 3,
  "createdAt": "2026-03-08T00:16:00"
}
```

### 实现方法

1. 调用服务端REST API发送用户消息：
   - **URL**: `POST /api/skill/sessions/{welinkSessionId}/messages`
   - **请求体**:
     ```json
     {
       "content": "请帮我重构登录模块的校验逻辑",
       "toolCallId": "call_2"
     }
     ```
   - **响应**:
     ```json
     {
      "code": 0,
      "errormsg": "",
      "data": {
        "id": 101,
        "welinkSessionId": 42,
        "userId": "10001",
        "role": "user",
        "content": "帮我创建一个React项目",
        "messageSeq": 3,
        "createdAt": "2026-03-08T00:16:00"
      }
    }
     ```

### 错误处理

| HTTP状态码 | 条件 | 说明 |
|------------|------|------|
| 400 | Bad Request | content为空或空白字符串 |
| 404 | Not Found | 会话不存在 |
| 409 | Conflict | 会话已关闭（状态为CLOSED） |
| 500 | Internal Server Error | AI-Gateway调度失败 |


### 调用示例

```typescript
try {
  const result = await sendMessage({
    welinkSessionId: 42,
    content: '请帮我重构登录模块的校验逻辑'
  });
  
  console.log('创建时间:', result.createdAt);
  
  // AI响应将通过 registerSessionListener 注册的回调接收
} catch (error) {
  console.error('发送消息失败:', error.message);
  // 错误处理：会话不存在、会话已关闭、网络错误等
}
```

---

## 12. 权限确认接口

### 接口说明

对AI发起的权限确认请求进行批准或拒绝。当AI需要执行文件修改、命令执行等敏感操作时，会发送权限确认请求。前端收到后展示确认UI，用户决策后调用此接口回复。

### 接口名

```typescript
replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResult>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `welinkSessionId` |是   | number   | 会话 ID     |
| `permId`          | 是   |String | 权限请求 ID |
| `response` | String |   是   | `once` / `always` / `reject` | 直接使用 OpenCode SDK 定义的值 |

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `welinkSessionId` | number   | 会话 ID     |
| `permissionId`    | String | 权限请求 ID |
| `response`        | String | 回复值      |

### 出参示例

成功时：

```json
{
  "welinkSessionId": 42,
  "permissionId": "perm_1",
  "response": "once"
}
```


### 实现方法

调用服务端REST API回复权限确认：
- **URL**: `POST /api/skill/sessions/{welinkSessionId}/permissions/{permId}`
- **请求体**:
  ```json
  {
    "response": "once"
  }
  ```
- **响应**:
  ```json
  {
    "code": 0,
    "errormsg": "",
    "data": {
      "welinkSessionId": 42,
      "permissionId": "perm_1",
      "response": "once"
    }
  }
  ```

### 错误处理

| HTTP状态码 | 条件 | 说明 |
|------------|------|------|
| 400 | Bad Request | permId字段缺失 |
| 404 | Not Found | 会话不存在或无关联Agent |
| 409 | Conflict | 会话已关闭 |


### 调用示例

```typescript
try {
  // 用户批准权限请求
  const result = await replyPermission({
    welinkSessionId: 42,
    permId: "perm_1",
    response: "once"
  });
  
  if (result.success) {
    console.log('权限确认已发送，审批结果:', result.e);
  }
} catch (error) {
  console.error('回复权限确认失败:', error.message);
  // 错误处理：会话不存在、无关联Agent、会话已关闭等
}
```

---

## 13. 小程序控制接口

### 接口说明

执行小程序的关闭或最小化操作，用于控制小程序的生命周期。该接口直接控制OpenCode小程序的显示状态。

### 接口名

```typescript
controlSkillWeCode(params: ControlSkillWeCodeParams): Promise<ControlSkillWeCodeResult>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| action | SkillWeCodeAction | 是 | 操作类型：close（关闭）、minimize（最小化） |

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| status | string | 操作状态：success（成功）、failed（失败） |

### 出参示例

成功时：

```json
{
  "status": "success"
}
```


### 实现方法

1. **close - 关闭小程序**:
   - **触发回调**: 通过`onSkillWecodeStatusChange`回调通知上层应用小程序状态变更为`closed`

2. **minimize - 最小化小程序**:
   - **触发回调**: 通过`onSkillWecodeStatusChange`回调通知上层应用小程序状态变更为`minimized`

### 调用示例

```typescript
// 关闭小程序
try {
  const result = await controlSkillWeCode({
    action: SkillWeCodeAction.CLOSE
  });
  
  if (result.status === 'success') {
    console.log('小程序已关闭');
    // 会自动调用 closeSkill 关闭会话
  }
} catch (error) {
  console.error('关闭小程序失败:', error.message);
  // 错误处理：窗口管理失败、网络错误等
}

// 最小化小程序
try {
  const result = await controlSkillWeCode({
    action: SkillWeCodeAction.MINIMIZE
  });
  
  if (result.status === 'success') {
    console.log('小程序已最小化');
    // WebSocket连接保持，可后续恢复
  }
} catch (error) {
  console.error('最小化小程序失败:', error.message);
  // 错误处理：窗口管理失败、网络错误等
}
```

## 数据类型定义

### ExecuteSkillParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ak | String | 是 | Agent Plugin 对应的 Access Key，用于定位 Agent 连接 |
| title | String | 否 | 会话标题，不填则由 AI 自动生成 |
| imGroupId | String | 是 | 关联的 IM 群组 ID |

### StopSkillParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| welinkSessionId | number | 是 | 要停止的会话ID |

### OnSessionStatusChangeParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| welinkSessionId | Number | 是 | 会话ID |
| callback | function | 是 | 状态变更回调函数 |

### OnSkillWecodeStatusChangeParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| callback | function | 是 | 小程序状态变更回调函数 |


### GetSessionMessageParams

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|------|------|
| welinkSessionId | number | 是 | - | 会话ID |
| page | number | 否 | 0 | 页码（从 0 开始） |
| size | number | 否 | 50 | 每页条数 |

### RegisterSessionListenerParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| welinkSessionId | number | 是 | 会话ID |
| onMessage | function | 是 | 消息回调函数，接收AI响应流 |
| onError | function | 否 | 错误回调函数，接收错误信息 |
| onClose | function | 否 | 连接关闭回调函数 |

### UnregisterSessionListenerParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| welinkSessionId | number | 是 | 会话ID |
| onMessage | function | 是 | 要移除的消息回调函数 |
| onError | function | 否 | 要移除的错误回调函数 |
| onClose | function | 否 | 要移除的连接关闭回调函数 |

### SendMessageParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| welinkSessionId | number | 是 | 会话ID |
| content | string | 是 | 用户输入的消息内容 |
| toolCallId | string | 否 | 回答 AI question 时携带对应的工具调用 ID。不带则按普通消息处理 |

### ReplyPermissionParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `welinkSessionId` |是   | number   | 会话 ID     |
| `permId`          | 是   |String | 权限请求 ID |
| `response` | String |   是   | `once` / `always` / `reject` | 直接使用 OpenCode SDK 定义的值 |

### ControlSkillWeCodeParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | SkillWeCodeAction | 是 | 操作类型：close（关闭）、minimize（最小化） |

  ### SessionListener

  | 字段 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | onMessage | function | 是 | 消息回调函数，接收AI响应流 |
  | onError | function | 否 | 错误回调函数，接收错误信息 |
  | onClose | function | 否 | 连接关闭回调函数 |

  ### SessionStatusResult

| 字段 | 类型 | 说明 |
|------|------|------|
| status | SessionStatus | 会话状态，枚举值：executing（执行中）、stopped（停止）、completed（完成） |

### SessionStatus

| 枚举值 | 说明 |
|--------|------|
| executing | 执行中 |
| stopped | 已停止 |
| completed | 已完成 |

### SkillWecodeStatusResult

| 字段 | 类型 | 说明 |
|------|------|------|
| status | SkillWecodeStatus | 小程序状态，枚举值：closed（关闭）、minimized（缩小） |
| timestamp | number | 状态变更时间戳（毫秒） |
| message | string | 状态变更说明信息（可选） |

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

| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | 消息类型：delta（增量）、done（完成）、error（错误）、agent_offline、agent_online |
| seq | number | 递增序列号 |
| content | string | 消息内容 |
| usage | object | token用量统计（仅done类型） |

### SendMessageResult

| 字段 | 类型 | 说明 |
|------|------|------|
| welinkSessionId | number | 是 | 会话ID |
| content | string | 是 | 用户输入的消息内容 |
| toolCallId | string | 否 | 回答 AI question 时携带对应的工具调用 ID。不带则按普通消息处理 |

### ReplyPermissionResult

| 字段 | 类型 | 说明 |
|------|------|------|
| `welinkSessionId` | number   | 会话 ID     |
| `permissionId`    | String | 权限请求 ID |
| `response`        | String | 回复值      |

### ControlSkillWeCodeResult

| 字段 | 类型 | 说明 |
|------|------|------|
| status | string | 操作状态：success（成功）、failed（失败） |

### SendMessageToIMParams

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| welinkSessionId | number | 是 | 会话ID |

### SendMessageToIMResult

| 字段 | 类型 | 说明 |
|------|------|------|
| status | string | 发送是否成功 |
