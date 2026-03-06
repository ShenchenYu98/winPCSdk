# Agent Skill 调用模块需求文档 V1.1

## 1. 文档目的

设计并实现一个 **Agent Skill 调用模块**，用于统一承接 Agent 相关 Skill 的执行、停止、重试、多轮会话、历史记录、状态回调、结果分发等能力。

该模块同时对接三类外部模块：

1. **Agent 服务端**
2. **Agent 客户端**
3. **Agent 小程序**

模块核心目标：

- 前端与服务端通过 **单实例 WebSocket 通道** 通信
- 多个 Skill 会话复用同一条 WebSocket 通道
- 支持 Skill 执行全生命周期管理：执行、停止、重试、重新生成、关闭会话
- 支持流式结果返回
- 支持客户端与小程序双端消费
- 支持断链重连、心跳、超时等稳定性机制
- 支持历史记录查询、多轮对话上下文续接
- 服务端 Skill 调用报文 **遵循 opencode 的 Skill 调用报文规范**

---

## 2. 项目范围

## 2.1 范围内

本期需要实现：

- Agent 前端 Skill 调用管理模块
- 前端到 Agent 服务端的 WebSocket 连接管理
- 基于 opencode 协议的 Skill 调用协议适配层
- 面向 Agent 客户端的接口层
- 面向 Agent 小程序的接口层
- Skill 状态管理与事件分发
- 历史记录查询能力
- 重试、停止、重新生成等控制能力
- 结果复制、发送消息到聊天框等辅助能力

## 2.2 范围外

本期暂不包含：

- Skill 服务端具体执行逻辑实现
- Skill 编排平台后台实现
- 登录态与权限系统设计
- `sendMessage` 与 `getSkillHistory` 服务端接口实现
- 消息长度限制处理
- markdown / 富文本渲染策略细节

---

## 3. 角色与模块关系

## 3.1 模块角色

### 1）Agent 服务端
负责：

- 接收前端发起的 Skill 执行请求
- 按 opencode 协议执行并返回 Skill 结果
- 通过 WebSocket 返回执行状态、流式结果、结束态、错误态等消息
- 提供历史记录查询接口  
  `https://www.Im.com/getSkillHistory`

### 2）Agent 客户端
负责：

- 调用本模块暴露的接口发起 Skill 执行
- 监听 Skill 执行状态
- 发起停止、关闭、重新生成等操作
- 使用复制、发送到聊天框等能力

### 3）Agent 小程序
负责：

- 接收并展示 Skill 返回数据，包含流式内容
- 获取 Skill 历史记录
- 在最小化、关闭动作触发时调用本模块接口
- 使用重新生成、复制、发送消息等能力

---

## 4. 总体目标

构建一个统一的前端 Skill Runtime，具备以下能力：

### 4.1 连接统一化
使用单例 `WebSocketManager` 管理与 Agent 服务端的连接。

### 4.2 会话统一化
通过 `sessionId / requestId` 管理多个 Skill 会话，做到单通道复用多会话。

### 4.3 协议统一化
对上层暴露稳定 API，对下层严格适配 **opencode Skill 调用报文规范**。

### 4.4 状态统一化
Skill 执行过程中的状态统一抽象为：

- pending
- executing
- stopping
- stopped
- completed
- failed
- timeout
- closed

### 4.5 能力统一化
客户端与小程序共享同一套 Skill 调用核心能力，仅在接入层做差异适配。

---

# 5. 功能需求

## 5.1 对接 Agent 服务端

### 5.1.1 WebSocket 单实例连接管理

#### 需求描述
前端需要与 Agent 服务端建立一条 **单实例 WebSocket 连接**，多个 Skill 会话复用同一条连接通道。

#### 具体要求
- 全局仅维护一个 WebSocket 实例
- 当存在多个会话并发执行时，不重复创建连接
- 支持懒加载连接：首次调用 Skill 时建立连接
- 支持连接复用：后续 Skill 会话直接复用现有连接
- 支持连接状态管理：
  - connecting
  - open
  - closing
  - closed
  - reconnecting

#### 设计建议
引入：
- `WebSocketManager`：负责连接生命周期
- `SessionRegistry`：负责会话注册和路由
- `MessageDispatcher`：负责服务端消息分发到对应会话

---

### 5.1.2 Skill 执行

#### 需求描述
前端需通过 WebSocket 向 Agent 服务端发起 Skill 执行请求。

#### 具体要求
- 支持传入基础参数：
  - 群 ID
  - Skill 标识
  - 用户输入
- 支持扩展参数：
  - 用户 ID
  - 会话 ID
  - 上下文消息
  - 业务扩展字段 ext
  - traceId / requestId
- 支持服务端流式返回执行结果
- 支持一次连接内多个 Skill 并发执行
- WebSocket 报文格式遵循 **opencode Skill 调用报文规范**

#### 输出结果
- 返回执行中状态
- 返回流式分片内容
- 返回最终结果
- 返回错误信息

---

### 5.1.3 停止 Skill 调用

#### 需求描述
前端需要支持对已发起执行的 Skill 请求发送停止指令。

#### 具体要求
- 可通过 `requestId / sessionId` 定位目标 Skill 执行实例
- 前端发送 stop 指令后：
  - 本地状态先置为 `stopping`
  - 收到服务端停止确认消息后置为 `stopped`
- 若 stop 时任务已完成，应保持幂等，不报错
- 服务端停止确认报文格式遵循 opencode 协议

#### 统一状态定义
- 前端 stop 后进入 `stopping`
- 收到服务端确认后进入 `stopped`

---

### 5.1.4 Skill 调用重试

#### 需求描述
支持 Skill 执行失败后的重试调用。

#### 具体要求
- 支持主动重试
- 支持因网络异常导致的可恢复重试
- 支持配置最大重试次数
- 支持重试退避策略
- 重试时保留上下文关联信息
- 区分：
  - **协议级重试**：因连接问题未成功送达服务端
  - **业务级重试**：服务端执行失败后重新发起

#### 建议
- 默认最多重试 2~3 次
- 使用指数退避
- 重试策略可配置

---

### 5.1.5 支持 Skill 多轮对话

#### 需求描述
同一个 Skill 会话内，支持多轮用户输入与服务端连续上下文处理。

#### 具体要求
- 每个会话具备唯一 `sessionId`
- 同一 `sessionId` 下允许多次发送用户输入
- 服务端返回结果与该会话关联
- 客户端可按时间序列渲染多轮消息
- 支持基于历史消息继续提问

---

### 5.1.6 获取 Skill 调用历史记录

#### 需求描述
支持查询 Skill 调用历史记录，用于恢复上下文和展示历史会话。

#### 历史记录来源
由服务端提供历史查询接口：

`https://www.Im.com/getSkillHistory`

#### 具体要求
- 支持按会话 ID 查询
- 支持按群 ID 查询
- 支持按 Skill 查询
- 支持分页
- 支持返回：
  - 会话基本信息
  - 每轮输入输出
  - 执行状态
  - 创建时间、更新时间
  - 是否结束

#### 说明
- 前端模块负责对服务端历史记录接口进行封装
- 前端可做本地缓存优化，但**服务端接口为最终数据源**

---

### 5.1.7 容错处理

#### 需求描述
WebSocket 通道必须具备基础容错能力。

#### 具体要求

##### 1）断链重连
- 连接断开后自动重连
- 支持最大重连次数
- 支持重连间隔退避
- 重连成功后恢复连接状态
- 对未完成会话进行恢复处理

##### 2）心跳机制
- 前端定时发送 ping / heartbeat
- 服务端返回 pong / ack
- 连续多次未收到心跳响应时判定连接异常并重连

##### 3）超时机制
- Skill 执行支持请求级超时
- WebSocket 连接支持心跳超时
- 超时后触发：
  - 请求失败态回调
  - 可选自动重试

##### 4）幂等处理
- 对 stop / close / retry 等重复请求保持幂等
- 避免重复渲染最终结果

---

### 5.1.8 Skill 报文协议

#### 需求描述
服务端 Skill 执行的请求报文、响应报文、流式报文、停止报文等，统一 **使用 opencode 的 Skill 调用报文规范**。

#### 实现要求
- 模块内部必须建设独立的 **协议适配层**
- 上层业务 API 与 opencode 协议解耦
- 协议适配层负责：
  - 构建 opencode 请求报文
  - 解析 opencode 返回报文
  - 映射为前端内部统一消息模型
  - 为后续协议升级保留兼容能力

#### 协议原则
- 不在业务层直接硬编码协议字段
- 所有报文收发均经过 Protocol Layer
- 状态、delta、complete、error、stop_ack 等消息映射为统一事件

---

## 5.2 对接 Agent 客户端

### 5.2.1 提供 Skill 执行接口

#### 需求描述
向 Agent 客户端提供统一的 Skill 执行接口。

#### 入参要求
主要入参包括：
- 群 ID
- Skill
- 用户输入

并具备扩展性。

#### 建议接口
```ts
executeSkill(params: {
  groupId: string;
  skill: string;
  input: string;
  sessionId?: string;
  userId?: string;
  ext?: Record<string, any>;
}): Promise<{ requestId: string; sessionId: string }>;
```

#### 要求
- 参数结构可扩展
- 返回 requestId / sessionId
- 支持流式监听

---

### 5.2.2 提供停止调用接口

```ts
stopSkill(params: {
  requestId: string;
  sessionId: string;
}): Promise<void>;
```

要求：
- 支持停止执行中任务
- 重复停止幂等
- stop 后立即进入 `stopping`
- 收到服务端确认后进入 `stopped`

---

### 5.2.3 提供 Skill 会话关闭接口

```ts
closeSkillSession(params: {
  sessionId: string;
}): Promise<void>;
```

要求：
- 关闭当前 Skill 会话
- 关闭后不再接收该会话实时消息
- 可选清理本地缓存
- 不删除服务端历史记录

---

### 5.2.4 提供重新生成接口

#### 需求描述
对已执行过的 Skill 支持重新生成。

#### 重新生成语义
- **保留 sessionId**
- **生成新的 requestId**
- **保留历史结果，不覆盖旧记录**
- **UI 层决定是否替换展示**

#### 建议定义
```ts
regenerateSkill(params: {
  sessionId: string;
  requestId?: string;
  input?: string;
}): Promise<{ requestId: string; sessionId: string }>;
```

#### 说明
重新生成代表：
- 沿用原会话上下文
- 针对最近一次输入或指定输入重新发起生成
- 生成新的 requestId
- 历史中新增一条记录，不覆盖旧结果

---

### 5.2.5 提供 Skill 执行状态回调

#### 需求描述
客户端需要监听 Skill 执行状态变化。

#### 状态要求
- executing（执行中）
- stopped（停止）
- completed（完成）

建议完整扩展为：
- pending
- executing
- stopping
- stopped
- completed
- failed
- timeout
- closed

#### 建议接口
```ts
onSkillStatusChange(callback: (event: {
  requestId: string;
  sessionId: string;
  status: SkillStatus;
  reason?: string;
}) => void): () => void;
```

---

### 5.2.6 提供复制结果到剪切板接口

#### 需求描述
支持将已完成 Skill 的结果复制到剪切板。

#### 要求
- 仅允许复制已完成结果
- 若结果为空或未完成，应提示不可复制
- 复制成功/失败需回调

```ts
copySkillResult(params: {
  sessionId: string;
  requestId?: string;
}): Promise<void>;
```

---

### 5.2.7 提供发送结果到聊天框接口

#### 需求描述
支持将已完成 Skill 结果发送到聊天框内。

#### 服务端接口
`POST https://www.Im.com/sendMessage`

#### 鉴权方式
- Cookie

#### 请求体格式
```json
{
  "groupId": "1234",
  "sendMessage": "这是一条消息"
}
```

#### 返回体格式
```json
{
  "result": "success"
}
```

#### 其他约束
- 支持 markdown / 富文本
- 消息长度限制：本期暂不处理

#### 要求
- 仅允许发送已完成结果
- 发送前应获取最终结果文本
- 支持附加会话信息
- 支持成功/失败回调

#### 建议封装
```ts
sendSkillResultToChat(params: {
  groupId: string;
  sessionId: string;
  requestId?: string;
  content?: string;
}): Promise<void>;
```

---

## 5.3 对接 Agent 小程序

### 5.3.1 获取 Skill 执行数据返回，支持流式数据

#### 需求描述
小程序侧可获取 Skill 执行过程中的实时返回数据。

#### 要求
- 支持流式内容分片
- 支持最终结果整合
- 支持错误态通知
- 支持按会话/请求维度订阅

#### 建议接口
```ts
subscribeSkillStream(params: {
  sessionId: string;
  requestId: string;
  onData: (chunk: string, fullText: string) => void;
  onComplete?: (result: string) => void;
  onError?: (error: any) => void;
}): () => void;
```

---

### 5.3.2 获取 Skill 调用历史记录

#### 历史接口来源
由服务端接口提供：

`https://www.Im.com/getSkillHistory`

#### 建议接口
```ts
getSkillHistory(params: {
  sessionId?: string;
  groupId?: string;
  skill?: string;
  pageNo?: number;
  pageSize?: number;
}): Promise<SkillHistoryResponse>;
```

---

### 5.3.3 获取小程序回调状态（最小化、关闭）

#### 需求描述
小程序在发生最小化、关闭动作时，调用本模块的方法进行状态上报和回调通知。

#### 要求
- 小程序宿主在执行最小化时调用本模块接口
- 小程序宿主在执行关闭时调用本模块接口
- 模块内部触发统一状态事件分发
- 状态包括：
  - minimized
  - closed

#### 建议接口
```ts
notifyMiniProgramState(state: 'minimized' | 'closed'): void;
```

以及：

```ts
onMiniProgramStateChange(callback: (state: 'minimized' | 'closed') => void): () => void;
```

---

### 5.3.4 获取 Skill 执行状态回调

与客户端一致，支持：
- 执行中
- 停止
- 完成

建议复用统一事件总线。

---

### 5.3.5 提供 Skill 调用重新生成接口

与客户端一致，接口能力保持统一。

重新生成语义保持一致：
- 保留 sessionId
- 生成新的 requestId
- 保留历史结果，不覆盖旧记录
- UI 层决定是否替换展示

---

### 5.3.6 提供复制结果到剪切板接口

与客户端一致。

---

### 5.3.7 提供发送结果到聊天框接口

与客户端一致。

#### 服务端接口
`POST https://www.Im.com/sendMessage`

#### 鉴权方式
- Cookie

#### 请求体
```json
{
  "groupId": "1234",
  "sendMessage": "这是一条消息"
}
```

#### 返回体
```json
{
  "result": "success"
}
```

#### 说明
- 支持 markdown / 富文本
- 长度限制本期暂不处理

---

### 5.3.8 提供接口支持回调获取小程序最小化和关闭状态

本需求与 5.3.3 统一，最终收敛为：

- 小程序动作触发时调用 `notifyMiniProgramState`
- 业务侧通过 `onMiniProgramStateChange` 获取回调

---

# 6. 非功能需求

## 6.1 性能要求
- 单 WebSocket 通道支持多会话并发
- 会话消息分发延迟低
- 支持流式消息实时渲染
- 本地缓存不会导致明显内存泄漏

## 6.2 稳定性要求
- WebSocket 异常断开可自动恢复
- 心跳异常可触发重连
- 请求级超时可控制
- 服务端异常不会导致整个模块崩溃

## 6.3 可扩展性要求
- Skill 入参支持扩展字段
- 协议层支持适配 opencode 协议升级
- 客户端/小程序接入层与核心 Runtime 解耦
- 支持后续增加鉴权、埋点、限流等能力

## 6.4 可维护性要求
- 连接管理、协议解析、会话管理、接口层职责清晰
- 类型定义清晰
- 错误码统一
- 日志与调试信息可观测

---

# 7. 建议技术架构

## 7.1 模块拆分

建议拆分为以下层次：

### 1）Connection Layer
负责：
- WebSocket 创建
- 单例维护
- 重连
- 心跳
- 连接状态监听

### 2）Protocol Layer
负责：
- 封装 opencode Skill 请求报文
- 解析 opencode Skill 响应报文
- 将协议报文映射为内部统一事件模型

### 3）Session Layer
负责：
- sessionId / requestId 管理
- 会话注册与销毁
- 多轮对话上下文管理
- 历史记录索引与缓存

### 4）Runtime Layer
负责：
- execute
- stop
- retry
- regenerate
- close
- stream subscribe
- 状态流转控制

### 5）Adapter Layer
负责：
- 面向 Agent 客户端暴露 API
- 面向 Agent 小程序暴露 API

### 6）Utility Layer
负责：
- copyToClipboard
- sendToChat
- timeout control
- logging
- getSkillHistory 封装

---

## 7.2 推荐核心对象

### WebSocketManager
管理唯一连接

### SkillSessionManager
管理多 Skill 会话

### SkillTaskManager
管理单次调用 request 生命周期

### SkillHistoryService
封装服务端历史查询接口 `getSkillHistory`

### EventBus
统一状态通知、流式数据通知、小程序状态通知

### ProtocolAdapter
适配 opencode Skill 报文规范

---

# 8. 状态流转设计

## 8.1 Skill 执行状态

建议状态机如下：

- `idle`
- `pending`
- `executing`
- `stopping`
- `stopped`
- `completed`
- `failed`
- `timeout`
- `closed`

## 8.2 典型流转

### 正常执行
`idle -> pending -> executing -> completed`

### 用户停止
`executing -> stopping -> stopped`

### 执行失败
`executing -> failed`

### 超时失败
`executing -> timeout`

### 会话关闭
`completed/stopped/failed -> closed`

### 重新生成
原 request 保持历史状态不变，新 request 进入：
`pending -> executing -> completed/failed/stopped`

---

# 9. 关键业务流程

## 9.1 Skill 执行流程

1. 客户端/小程序调用 `executeSkill`
2. Runtime 检查 WebSocket 是否已连接
3. 若未连接，则创建连接
4. 创建 requestId，必要时创建/复用 sessionId
5. Protocol Layer 组装 opencode Skill 请求报文
6. 发送 Skill 执行请求
7. 服务端返回开始确认
8. 服务端持续推送流式结果
9. 前端更新 fullText 并通知订阅者
10. 服务端返回完成消息
11. 前端更新状态为 completed，并更新历史索引

---

## 9.2 停止流程

1. 上层调用 `stopSkill`
2. Runtime 根据 requestId/sessionId 发送 stop 消息
3. 本地状态进入 `stopping`
4. 服务端返回停止确认
5. 状态进入 `stopped`

---

## 9.3 断链重连流程

1. WebSocket 断开
2. 状态置为 `reconnecting`
3. 按策略发起重连
4. 重连成功后恢复心跳
5. 对未结束会话执行恢复策略：
   - 查询服务端状态
   - 或标记中断待重试
   - 或继续接收服务端后续流

---

## 9.4 重新生成流程

1. 上层调用 `regenerateSkill`
2. 沿用原 `sessionId`
3. 创建新的 `requestId`
4. 保留原历史记录，不覆盖旧结果
5. 基于最近一次输入或指定输入重新发起请求
6. 流式接收新结果
7. UI 层决定是否替换当前展示内容

---

## 9.5 小程序状态上报流程

1. 小程序触发最小化或关闭动作
2. 小程序调用本模块 `notifyMiniProgramState`
3. 本模块向 EventBus 派发状态变更事件
4. 业务侧通过 `onMiniProgramStateChange` 接收状态通知

---

## 9.6 发送结果到聊天框流程

1. 上层调用 `sendSkillResultToChat`
2. 读取指定 `sessionId/requestId` 对应的最终结果
3. 组装 POST 请求到 `https://www.Im.com/sendMessage`
4. 通过 Cookie 鉴权
5. 请求体为：
```json
{
  "groupId": "1234",
  "sendMessage": "这是一条消息"
}
```
6. 服务端返回：
```json
{
  "result": "success"
}
```
7. 模块返回成功或失败状态

---

# 10. 数据模型建议

## 10.1 Skill 执行请求

```ts
type ExecuteSkillParams = {
  groupId: string;
  skill: string;
  input: string;
  sessionId?: string;
  userId?: string;
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  ext?: Record<string, any>;
  timeoutMs?: number;
};
```

## 10.2 Skill 执行结果

```ts
type SkillExecutionResult = {
  requestId: string;
  sessionId: string;
  status: 'executing' | 'stopping' | 'stopped' | 'completed' | 'failed' | 'timeout';
  chunks: string[];
  fullText: string;
  error?: {
    code: string;
    message: string;
  };
  startedAt: number;
  endedAt?: number;
};
```

## 10.3 历史记录

```ts
type SkillHistoryItem = {
  sessionId: string;
  requestId: string;
  groupId: string;
  skill: string;
  input: string;
  output: string;
  status: string;
  createdAt: number;
  updatedAt: number;
};
```

## 10.4 发送消息请求

```ts
type SendMessagePayload = {
  groupId: string;
  sendMessage: string;
};
```

## 10.5 发送消息响应

```ts
type SendMessageResponse = {
  result: 'success';
};
```

---

# 11. 接口清单建议

## 11.1 对客户端/小程序统一暴露的核心接口

```ts
interface AgentSkillRuntime {
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  executeSkill(params: ExecuteSkillParams): Promise<{
    requestId: string;
    sessionId: string;
  }>;

  stopSkill(params: {
    requestId: string;
    sessionId: string;
  }): Promise<void>;

  closeSkillSession(params: {
    sessionId: string;
  }): Promise<void>;

  regenerateSkill(params: {
    sessionId: string;
    requestId?: string;
    input?: string;
  }): Promise<{
    requestId: string;
    sessionId: string;
  }>;

  getSkillHistory(params: {
    sessionId?: string;
    groupId?: string;
    skill?: string;
    pageNo?: number;
    pageSize?: number;
  }): Promise<SkillHistoryItem[]>;

  subscribeSkillStream(params: {
    requestId: string;
    sessionId: string;
    onData: (chunk: string, fullText: string) => void;
    onComplete?: (result: string) => void;
    onError?: (error: any) => void;
  }): () => void;

  onSkillStatusChange(
    callback: (event: {
      requestId: string;
      sessionId: string;
      status: string;
      reason?: string;
    }) => void
  ): () => void;

  copySkillResult(params: {
    sessionId: string;
    requestId?: string;
  }): Promise<void>;

  sendSkillResultToChat(params: {
    groupId: string;
    sessionId: string;
    requestId?: string;
    content?: string;
  }): Promise<void>;

  notifyMiniProgramState?(state: 'minimized' | 'closed'): void;

  onMiniProgramStateChange?(
    callback: (state: 'minimized' | 'closed') => void
  ): () => void;
}
```

---

# 12. 异常与错误码建议

建议统一错误分类：

## 12.1 连接类
- `WS_CONNECT_FAILED`
- `WS_DISCONNECTED`
- `WS_RECONNECT_FAILED`
- `WS_HEARTBEAT_TIMEOUT`

## 12.2 业务类
- `SKILL_EXECUTE_FAILED`
- `SKILL_STOP_FAILED`
- `SKILL_TIMEOUT`
- `SKILL_NOT_FOUND`
- `SESSION_CLOSED`
- `HISTORY_FETCH_FAILED`

## 12.3 参数类
- `INVALID_PARAMS`
- `MISSING_GROUP_ID`
- `MISSING_SKILL`
- `MISSING_INPUT`

## 12.4 能力类
- `COPY_RESULT_FAILED`
- `SEND_MESSAGE_FAILED`

---

# 13. 埋点与日志建议

建议埋点以下关键事件：

- WebSocket 建连成功/失败
- WebSocket 重连次数
- 心跳成功/失败
- Skill 发起执行
- Skill 首包耗时
- Skill 完成耗时
- Skill 停止
- Skill 重试
- Skill 超时
- 历史记录查询成功/失败
- 复制结果
- 发送到聊天框成功/失败
- 小程序最小化/关闭事件

---

# 14. 验收标准

## 14.1 服务端对接验收
- 能建立单例 WebSocket 连接
- 多会话可复用单一连接
- 能基于 opencode 协议正常执行 Skill
- 能停止 Skill，且状态正确流转为 `stopping -> stopped`
- 能重试 Skill
- 能支持多轮对话
- 能通过 `https://www.Im.com/getSkillHistory` 获取历史记录
- 能处理断链重连、心跳、超时

## 14.2 客户端对接验收
- 能通过接口发起 Skill 执行
- 能通过接口停止已执行 Skill
- 能关闭会话
- 能重新生成，且：
  - 保留 sessionId
  - 新建 requestId
  - 不覆盖历史记录
- 能收到状态回调
- 能复制结果
- 能调用 `sendMessage` 将结果发送到聊天框

## 14.3 小程序对接验收
- 能接收流式结果
- 能查询历史记录
- 能在最小化、关闭时调用模块接口上报状态
- 能接收小程序状态回调
- 能接收 Skill 状态回调
- 能重新生成
- 能复制结果
- 能发送结果到聊天框

---

# 15. 已确认项归档

## 15.1 opencode Skill 协议报文样例
- 使用 **opencode 的 Skill 调用报文规范**

## 15.2 历史记录来源
- 由服务端提供历史查询接口：  
  `https://www.Im.com/getSkillHistory`

## 15.3 “重新生成”的语义
- 保留 `sessionId`
- 生成新的 `requestId`
- 保留历史结果，不覆盖旧记录
- UI 层决定是否替换展示

## 15.4 Skill 停止后的状态定义
- 前端 stop 后进入 `stopping`
- 收到服务端确认后进入 `stopped`

## 15.5 小程序状态回调能力来源
- 小程序在调用最小化、关闭时调用本模块的方法

## 15.6 sendMessage 接口契约
- 请求方法：`POST`
- 鉴权方式：`Cookie`
- 请求体格式：
```json
{
  "groupId": "1234",
  "sendMessage": "这是一条消息"
}
```
- 返回体格式：
```json
{
  "result": "success"
}
```
- 支持 markdown / 富文本
- 消息长度限制：暂不处理

---

# 16. 下一步建议

现在这份需求文档已经可以继续往下收敛成研发可执行产物了。最适合继续补的两份文档是：

1. **详细技术方案设计**
   - 模块分层图
   - 状态机
   - WebSocket 单例复用设计
   - 多会话路由设计
   - 容错机制
   - 时序图

2. **前端接口定义文档**
   - TypeScript 类型
   - API 约束
   - 事件回调规范
   - 错误码规范

下一轮我可以直接继续帮你输出 **《详细技术方案设计文档》**。

需求有改动：
1、只有执行技能后技能的返回结果通过websocket进行流式返回；2、其余的接口都是REST API；
服务端的接口规范可以重新参考skill-server-api.md文档，其中4.1和5.5的接口是本模块不涉及的，无需考虑；

需求有改动：
1、此模块对客户端和小程序提供的接口定义参考文档：Skill_SDK_接口文档.md