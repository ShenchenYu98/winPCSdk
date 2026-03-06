# Agent Skill 调用模块需求文档 V1.3

## 1. 文档目的

设计并实现一个 **Agent Skill 调用模块**，用于统一承接 Agent 相关 Skill 的执行、停止、关闭会话、重新生成、历史记录查询、状态回调、结果分发、小程序生命周期控制等能力。

该模块同时对接三类外部模块：

1. **Agent 服务端**
2. **Agent 客户端**
3. **Agent 小程序**

模块核心目标：

- 与 Agent 服务端的对接方式为：
  - **仅 Skill 执行结果通过 WebSocket 进行流式返回**
  - **其余接口统一通过 REST API 调用**
- 本模块 **对客户端和小程序暴露的接口定义** 以 `Skill_SDK_接口文档.md` 为准
- 服务端接口规范以 `skill-server-api.md` 为准
- 本模块仅关注服务端：
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
- 面向 Agent 客户端的 SDK 接口层
- 面向 Agent 小程序的 SDK 接口层
- Skill 状态管理与事件分发
- 会话管理、消息管理、历史消息查询
- 重新生成、停止态管理、关闭会话等控制能力
- 结果复制、发送消息到 IM 等辅助能力
- 小程序生命周期状态监听与控制能力

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

## 3. 设计依据

### 3.1 客户端 / 小程序 SDK 接口依据

本模块对外暴露的接口定义参考 `Skill_SDK_接口文档.md`，核心接口包括：

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

### 3.2 服务端接口依据

服务端对接以 `skill-server-api.md` 为准，仅采用：

- 4.2 会话管理
- 4.3 消息管理
- 5.1 流式推送端点

---

## 4. 角色与模块关系

### 4.1 模块角色

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

- 调用 SDK 暴露的统一接口发起 Skill 会话和消息操作
- 监听指定会话的状态变化
- 接收 WebSocket 流式结果
- 调用关闭、停止、重新生成、发送到 IM 等接口

#### 3）Agent 小程序
负责：

- 调用 SDK 暴露的统一接口发起 Skill 会话和消息操作
- 接收并展示流式结果
- 获取会话消息历史
- 响应小程序关闭/最小化事件
- 通过 SDK 控制小程序关闭或最小化

---

## 5. 总体目标

构建一个统一的前端 Skill Runtime / SDK，具备以下能力：

### 5.1 通信模型统一化
- **REST API** 负责控制类、查询类、提交类接口
- **WebSocket** 仅负责 Skill 执行结果的流式推送订阅

### 5.2 SDK 接口统一化
对客户端和小程序统一提供与 `Skill_SDK_接口文档.md` 一致的接口命名和调用语义。

### 5.3 会话统一化
通过 `sessionId` 管理 Skill 会话，并围绕 Skill Server 的 `SkillSession` 数据模型进行管理。

### 5.4 消息统一化
围绕服务端 `SkillMessage` 模型管理用户消息、助手消息、历史消息与流式结果拼接。

### 5.5 状态统一化
对外暴露的会话状态遵循 SDK 文档中的枚举定义：

- `executing`
- `stopped`
- `completed`

内部可扩展管理状态：

- idle
- pending
- executing
- stopped
- completed
- failed
- closed

### 5.6 小程序状态统一化
对外暴露的小程序状态遵循 SDK 文档定义：

- `closed`
- `minimized`

---

# 6. 功能需求

## 6.1 与 Agent 服务端的通信要求

### 6.1.1 通信方式要求

#### 需求描述
本模块与 Agent 服务端对接时，需要严格区分 REST API 与 WebSocket 的职责边界。

#### 具体要求
- **只有执行技能后技能的返回结果通过 WebSocket 流式返回**
- **其余接口全部通过 REST API**
- WebSocket 仅作为指定 `sessionId` 的结果订阅通道
- Skill 的执行触发动作由 REST API “发送用户消息”完成
- WebSocket 不承担：
  - 创建会话
  - 关闭会话
  - 发送用户输入
  - 历史记录查询
  - 权限确认回复
  - IM 转发

### 6.1.2 REST API 能力范围

#### 范围内接口

##### 1）会话管理
- `POST /api/skill/sessions`
- `GET /api/skill/sessions`
- `GET /api/skill/sessions/{id}`
- `DELETE /api/skill/sessions/{id}`

##### 2）消息管理
- `POST /api/skill/sessions/{sessionId}/messages`
- `GET /api/skill/sessions/{sessionId}/messages`
- `POST /api/skill/sessions/{sessionId}/permissions/{permId}`
- `POST /api/skill/sessions/{sessionId}/send-to-im`

#### 范围外接口
- `GET /api/skill/definitions`
- `/ws/internal/gateway`

### 6.1.3 WebSocket 能力范围

#### 具体要求
- WebSocket 端点：`ws://{host}:8082/ws/skill/stream/{sessionId}`
- 连接建立后，订阅指定 `sessionId` 的消息流
- 支持多个前端客户端订阅同一会话
- WebSocket 仅接收服务端单向推送
- 不通过 WebSocket 发送业务控制指令

#### 服务端推送消息类型
- `delta`
- `done`
- `error`
- `agent_offline`
- `agent_online`

---

## 6.2 面向客户端和小程序的 SDK 接口需求

以下接口定义以 `Skill_SDK_接口文档.md` 为准。

### 6.2.1 执行技能接口

#### 接口定义
```ts
executeSkill(
  imChatId: string,
  userId: string,
  skillContent: string,
  agentId?: number,
  title?: string
): Promise<SkillSession>
```

#### 接口语义
- 创建会话
- 建立 WebSocket 流式连接
- 自动发送首条用户消息触发 AI 处理

#### 实现要求
1. 调用 `POST /api/skill/sessions` 创建会话
2. 建立 `ws://{host}:8082/ws/skill/stream/{sessionId}` 连接
3. 调用 `POST /api/skill/sessions/{sessionId}/messages` 发送首条消息

#### 返回结果
返回 `SkillSession`，至少包含：
- `sessionId`
- `status`
- `toolSessionId`
- `createdAt`

#### 说明
- `skillDefinitionId` 由模块内部配置或业务上下文确定；由于 SDK 接口未暴露该参数，需在实现层进行映射或默认注入
- `executeSkill` 是对“创建会话 + 建立流 + 发送首条消息”的聚合封装

---

### 6.2.2 关闭技能接口

#### 接口定义
```ts
closeSkill(sessionId: string): Promise<boolean>
```

#### 接口语义
- 关闭服务端会话
- 断开当前会话的 WebSocket 连接
- 释放本地资源
- 会话关闭后不可恢复

#### 实现要求
1. 调用 `DELETE /api/skill/sessions/{sessionId}`
2. 关闭 `sessionId` 关联的 WebSocket 连接
3. 清理本地会话缓存和订阅关系

#### 状态要求
- 关闭成功后，本地状态标记为 `closed`

---

### 6.2.3 停止技能接口

#### 接口定义
```ts
stopSkill(sessionId: string): Promise<boolean>
```

#### 接口语义
- 停止当前会话的持续流式回调
- 中断当前 WebSocket 接收
- 保持会话可继续发送新消息

#### 实现要求
1. 断开 `ws://{host}:8082/ws/skill/stream/{sessionId}` 连接
2. 取消对该会话消息流的订阅
3. 更新本地会话状态为 `stopped`

#### 特别说明
- 此操作仅停止客户端接收 WebSocket 推送
- 不保证服务端 AI 处理立即停止
- 如需彻底终止，应调用 `closeSkill`

---

### 6.2.4 会话状态回调接口

#### 接口定义
```ts
onSessionStatus(
  sessionId: string,
  callback: (status: SessionStatus) => void
): void
```

#### 状态枚举
- `executing`
- `stopped`
- `completed`

#### 实现要求
- 基于 WebSocket 消息类型映射状态：
  - `delta` -> `executing`
  - `done` -> `completed`
  - `error` -> `stopped`
  - `agent_offline` -> `stopped`
  - `agent_online` -> `executing`

---

### 6.2.5 小程序状态回调接口

#### 接口定义
```ts
onSkillWecodeStatus(
  callback: (status: SkillWecodeStatus) => void
): void
```

#### 状态枚举
- `closed`
- `minimized`

#### 实现要求
- 注册系统级生命周期事件监听
- 小程序关闭时触发 `closed`
- 小程序最小化时触发 `minimized`

---

### 6.2.6 重新生成问答接口

#### 接口定义
```ts
regenerateAnswer(sessionId: string): Promise<AnswerResult>
```

#### 接口语义
- 获取当前会话最后一条用户消息
- 使用该消息内容重新触发 AI 处理
- 不覆盖原消息历史

#### 实现要求
1. 调用 `getSessionMessage(sessionId)` 获取消息列表
2. 取最后一条 `USER` 消息内容
3. 调用 `POST /api/skill/sessions/{sessionId}/messages`
4. 通过 WebSocket 接收重新生成结果

#### 注意事项
- 重新生成依赖会话可用
- 重新生成本质是“重新发送最后一条用户消息”

---

### 6.2.7 发送 AI 生成消息结果到 IM 接口

#### 接口定义
```ts
sendMessageToIM(sessionId: string, content: string): Promise<boolean>
```

#### 实现要求
- 调用 `POST /api/skill/sessions/{sessionId}/send-to-im`

#### 说明
- 这是当前“发送到聊天框 / IM”的主路径接口

---

### 6.2.8 获取当前会话消息列表接口

#### 接口定义
```ts
getSessionMessage(
  sessionId: string,
  page?: number,
  size?: number
): Promise<PageResult<ChatMessage>>
```

#### 实现要求
- 调用 `GET /api/skill/sessions/{sessionId}/messages?page={page}&size={size}`
- 支持分页
- 支持将数据持久化存储到本地缓存

---

### 6.2.9 发送消息接口

#### 接口定义
```ts
sendMessage(
  sessionId: string,
  content: string,
  onMessage: (message: StreamMessage) => void
): Promise<boolean>
```

#### 接口语义
- 发送用户输入内容
- 触发会话持续回答
- 持续获取服务端推送的回答内容

#### 实现要求
1. 调用 `POST /api/skill/sessions/{sessionId}/messages`
2. 确保会话对应 WebSocket 连接已建立
3. 通过 WebSocket 持续接收 `StreamMessage`
4. 通过 `onMessage` 回调返回流式消息

---

### 6.2.10 权限确认接口

#### 接口定义
```ts
replyPermission(
  sessionId: string,
  permissionId: string,
  approved: boolean
): Promise<boolean>
```

#### 实现要求
- 调用 `POST /api/skill/sessions/{sessionId}/permissions/{permissionId}`
- 请求体为：
```json
{
  "approved": true
}
```

---

### 6.2.11 小程序控制接口

#### 接口定义
```ts
controlSkillWeCode(action: SkillWeCodeAction): Promise<boolean>
```

#### 动作枚举
- `close`
- `minimize`

#### 实现要求

##### close
1. 调用原生窗口管理能力关闭小程序
2. 同时调用 `closeSkill`
3. 断开 WebSocket 连接
4. 释放相关资源

##### minimize
1. 调用原生窗口管理能力最小化小程序
2. 保持会话连接
3. 会话状态可置为 `IDLE`

---

## 6.3 面向客户端的补充能力

### 6.3.1 复制结果到剪切板接口

#### 需求描述
虽然 `Skill_SDK_接口文档.md` 未单独定义复制接口，但业务需求中仍要求支持复制已完成结果。

#### 建议接口
```ts
copySkillResult(sessionId: string, content?: string): Promise<boolean>
```

#### 实现要求
- 默认复制当前会话最近一次完整 assistant 输出
- 若显式传入 `content`，优先复制传入值

---

## 6.4 面向小程序的补充能力

### 6.4.1 小程序关闭与最小化联动要求

#### 关闭
- 调用 `controlSkillWeCode('close')`
- 触发 `onSkillWecodeStatus('closed')`
- 内部联动 `closeSkill(sessionId)`

#### 最小化
- 调用 `controlSkillWeCode('minimize')`
- 触发 `onSkillWecodeStatus('minimized')`
- 保持会话和连接可恢复

---

# 7. 非功能需求

### 7.1 性能要求
- 支持多个会话并行订阅 WebSocket 流
- 支持消息流实时渲染
- REST 接口封装具备统一超时、重试、错误处理能力
- 不因流式订阅导致明显内存泄漏

### 7.2 稳定性要求
- WebSocket 连接异常断开可重连
- 按 `sessionId` 维度管理连接生命周期
- REST 请求具备超时控制
- 服务端异常不会导致整个模块崩溃

### 7.3 可扩展性要求
- REST API 封装与业务层解耦
- WebSocket 事件处理与 UI 展示解耦
- SDK 聚合接口与底层实现解耦
- 支持后续增加鉴权、埋点、限流等能力

### 7.4 可维护性要求
- REST Client、Stream Client、Session Store、Message Store、MiniProgram Controller 职责清晰
- 类型定义清晰
- 错误码统一
- 日志与调试信息可观测

---

# 8. 建议技术架构

### 8.1 模块拆分

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
- 重新生成时提取最后一条 USER 消息

#### 5）Runtime / SDK Layer
负责：
- `executeSkill`
- `closeSkill`
- `stopSkill`
- `sendMessage`
- `regenerateAnswer`
- `replyPermission`
- `sendMessageToIM`
- `getSessionMessage`
- `onSessionStatus`

#### 6）MiniProgram Controller Layer
负责：
- `onSkillWecodeStatus`
- `controlSkillWeCode`
- 与原生生命周期能力对接

---

## 9. 状态流转设计

### 9.1 对外状态

#### SessionStatus
- `executing`
- `stopped`
- `completed`

#### SkillWecodeStatus
- `closed`
- `minimized`

### 9.2 典型流转

#### 执行中
`executeSkill / sendMessage -> delta -> executing`

#### 完成
`executing -> done -> completed`

#### 停止
`executing -> stopSkill -> stopped`

#### 关闭
`executing/stopped/completed -> closeSkill -> closed`

#### 小程序最小化
`foreground -> controlSkillWeCode(minimize) -> minimized`

---

## 10. 数据模型建议

### 10.1 SessionStatus

```ts
type SessionStatus = 'executing' | 'stopped' | 'completed';
```

### 10.2 SkillWecodeStatus

```ts
type SkillWecodeStatus = 'closed' | 'minimized';
```

### 10.3 SkillWeCodeAction

```ts
type SkillWeCodeAction = 'close' | 'minimize';
```

### 10.4 ChatMessage

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

### 10.5 StreamMessage

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

### 10.6 SkillSession

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

### 10.7 PageResult<T>

```ts
type PageResult<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
};
```

### 10.8 AnswerResult

```ts
type AnswerResult = {
  messageId: string;
  success: boolean;
};
```

---

## 11. 对外接口清单

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

### 12.3 小程序控制类
- `WECODE_CLOSE_FAILED`
- `WECODE_MINIMIZE_FAILED`
- `WECODE_STATUS_LISTEN_FAILED`

### 12.4 参数类
- `INVALID_PARAMS`
- `MISSING_SESSION_ID`
- `MISSING_USER_ID`
- `MISSING_CONTENT`

---

## 13. 验收标准

### 13.1 服务端对接验收
- 仅 Skill 执行结果通过 WebSocket 返回
- 其余能力全部通过 REST API 实现
- 能创建会话、发送消息、查询消息、关闭会话
- 能回复权限确认
- 能发送消息到 IM
- 能订阅指定 `sessionId` 的 Skill 流式结果

### 13.2 客户端 SDK 验收
- `executeSkill` 能完成“建会话 + 建流 + 首条消息发送”
- `closeSkill` 能关闭会话并释放流
- `stopSkill` 能停止当前流式回调但保留会话
- `onSessionStatus` 能正确回调 `executing / stopped / completed`
- `regenerateAnswer` 能基于最后一条用户消息重新生成
- `sendMessage` 能支持多轮对话
- `getSessionMessage` 能返回分页历史
- `sendMessageToIM` 能成功发送内容到 IM

### 13.3 小程序 SDK 验收
- `onSkillWecodeStatus` 能回调 `closed / minimized`
- `controlSkillWeCode(close)` 能联动关闭会话
- `controlSkillWeCode(minimize)` 能最小化且保持可恢复
- 小程序可接收 Skill 流式结果
- 小程序可查询消息历史
- 小程序可重新生成、发送到 IM

---

## 14. 已确认项归档（更新后）

### 14.1 通信模式
- 只有执行技能后的返回结果通过 WebSocket 流式返回
- 其余接口全部通过 REST API

### 14.2 SDK 接口依据
- 此模块对客户端和小程序提供的接口定义参考 `Skill_SDK_接口文档.md`

### 14.3 服务端接口依据
- 以 `skill-server-api.md` 为准
- 仅考虑：
  - 4.2 会话管理
  - 4.3 消息管理
  - 5.1 流式推送端点
- 不考虑：
  - 4.1 技能定义
  - 5.2 网关内部端点

### 14.4 重新生成语义
- 基于最后一条用户消息重新发送
- 保留 `sessionId`
- 不覆盖旧记录
- UI 层决定是否替换展示

### 14.5 小程序状态能力
- 通过 `onSkillWecodeStatus` 监听关闭和最小化
- 通过 `controlSkillWeCode` 执行关闭和最小化

---

## 15. 下一步建议

当前这版需求文档已经完成了与 SDK 接口文档的对齐，适合继续向下输出：

1. **详细技术方案设计**
   - SDK 分层架构图
   - REST + WebSocket 混合时序图
   - Session / Message / Stream 管理设计
   - 小程序控制层设计

2. **接口定义文档**
   - TypeScript 类型定义
   - SDK 方法签名
   - 错误码与状态映射
   - 示例调用代码
