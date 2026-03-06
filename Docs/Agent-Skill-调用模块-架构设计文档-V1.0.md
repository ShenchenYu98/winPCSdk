# Agent Skill 调用模块架构设计文档 V1.0

## 1. 文档目的

本文档用于从架构层面对 **Agent Skill 调用模块** 进行设计说明，明确：

- 系统边界与职责分工
- 核心组件与分层结构
- 与服务端的通信模型
- 与客户端 / 小程序的对外接口关系
- 会话、消息、流式订阅的运行时拓扑
- 非功能设计与扩展演进方向

本文档主要用于：

- 架构评审
- 研发分工
- 联调边界对齐
- 后续版本演进参考

---

## 2. 架构设计依据

本架构设计建立在以下基础之上：

### 2.1 对外 SDK 接口
模块对客户端和小程序暴露统一 SDK 接口，包括：

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

### 2.2 服务端接口模型
模块与 Skill Server 的对接范围限定为：

#### REST
- 会话管理
- 消息管理
- 权限确认
- 发送到 IM

#### WebSocket
- `ws://{host}:8082/ws/skill/stream/{sessionId}`

### 2.3 通信约束
- 仅 Skill 执行结果通过 WebSocket 流式返回
- 其余全部通过 REST API
- WebSocket 仅承担结果流订阅职责

---

## 3. 架构目标

本模块架构需要满足以下目标：

### 3.1 统一接入
对客户端与小程序提供统一 SDK 接口，避免业务侧直接感知 REST 和 WebSocket 细节。

### 3.2 清晰分层
将对外接口层、运行时编排层、状态存储层、服务端适配层、平台适配层解耦。

### 3.3 会话中心化
以 `sessionId` 作为所有能力的核心主键，统一关联：

- 会话信息
- 消息历史
- 流式连接
- 状态回调
- 小程序生命周期联动

### 3.4 支持多会话并发
允许一个前端实例同时持有多个会话，彼此之间连接、状态、缓存相互隔离。

### 3.5 可恢复与可演进
支持流式连接重连、缓存恢复、SDK 接口扩展、宿主平台扩展。

---

## 4. 架构范围与边界

## 4.1 本模块负责

- Skill SDK 对外能力封装
- Skill Server REST API 封装
- Skill Stream WebSocket 管理
- 会话状态与消息状态管理
- 流式消息分发
- 小程序控制与状态感知
- 基础异常处理与资源释放

## 4.2 本模块不负责

- Skill Server 内部调度逻辑
- AI-Gateway 内部连接与路由
- Skill 定义管理
- IM 服务本身的实现
- 具体 UI 展示与渲染
- markdown / code 富文本渲染安全处理
- 服务端数据库与消息持久化实现

## 4.3 外部依赖系统

- Skill Server
- AI-Gateway（通过 Skill Server 间接依赖）
- IM 平台
- 小程序宿主原生能力
- 浏览器 / 鸿蒙平台 WebSocket、Clipboard、生命周期 API

---

## 5. 总体架构视图

## 5.1 逻辑架构图

```text
┌──────────────────────────────────────────────────────────┐
│                     上层业务应用                          │
│      Agent 客户端 UI / Agent 小程序 UI / 宿主容器         │
└──────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────┐
│                    Skill SDK Facade                      │
│ executeSkill / sendMessage / stopSkill / closeSkill ...  │
└──────────────────────────────────────────────────────────┘
                 │                    │
                 ▼                    ▼
┌────────────────────────┐   ┌────────────────────────────┐
│   Runtime Orchestrator │   │ MiniProgram Controller     │
│ 会话编排 / 状态编排 / 流 │   │ 小程序关闭 / 最小化 / 生命周期 │
└────────────────────────┘   └────────────────────────────┘
                 │                    │
                 └──────────┬─────────┘
                            ▼
┌──────────────────────────────────────────────────────────┐
│               Session Store / Message Store / Event Bus  │
└──────────────────────────────────────────────────────────┘
                 │                           │
                 ▼                           ▼
┌────────────────────────┐      ┌────────────────────────┐
│     Skill REST API     │      │    Skill Stream WS     │
│ create / message / IM  │      │ delta / done / error   │
└────────────────────────┘      └────────────────────────┘
                 │                           │
                 └──────────────┬────────────┘
                                ▼
                     ┌──────────────────────┐
                     │     Skill Server     │
                     └──────────────────────┘
```

---

## 5.2 运行时拓扑图

```text
一个前端实例
│
├─ Session A
│   ├─ REST: /sessions/A/messages
│   ├─ WS: /ws/skill/stream/A
│   ├─ SessionState(A)
│   └─ MessageBuffer(A)
│
├─ Session B
│   ├─ REST: /sessions/B/messages
│   ├─ WS: /ws/skill/stream/B
│   ├─ SessionState(B)
│   └─ MessageBuffer(B)
│
└─ Global
    ├─ SDK Facade
    ├─ Event Bus
    ├─ Host Adapter
    └─ Config / Logger / Metrics
```

---

## 6. 核心架构决策

## 6.1 采用 REST + WebSocket 混合架构

### 决策内容
- 控制类与查询类接口全部走 REST
- 流式结果走 WebSocket

### 设计原因
- 与服务端职责划分清晰
- 控制行为天然适合请求-响应模型
- 结果流天然适合单向推送模型
- 便于调试、埋点、错误治理

### 影响
- SDK 需要承担“发送消息后自动订阅流”的聚合能力
- `executeSkill` 变成聚合流程而不是单次底层调用

---

## 6.2 采用 sessionId 作为运行时主索引

### 决策内容
所有状态与资源围绕 `sessionId` 管理。

### 管理对象
- 会话缓存
- 消息历史
- 流式连接
- 状态回调
- 订阅者
- 小程序联动关系

### 影响
- 便于多轮对话
- 便于多会话并发
- 便于资源释放
- 便于重连与恢复

---

## 6.3 采用单 Session 单流连接模型

### 决策内容
一个 `sessionId` 只维护一个 WebSocket 连接实例。

### 优点
- 避免同会话重复连接
- 简化 seq 管理
- 降低资源消耗
- 便于 stop / close 的精确控制

### 影响
- 多个订阅者共享同一流
- StreamClient 内部需要维护引用计数或订阅列表

---

## 6.4 SDK Facade 聚合对外能力

### 决策内容
业务侧不直接调用 RESTClient 和 StreamClient，而是统一调用 SDK 方法。

### 好处
- 降低业务接入复杂度
- 隐藏底层通信模型
- 统一状态管理
- 统一错误处理
- 统一埋点与日志

---

## 6.5 小程序平台能力独立适配

### 决策内容
通过 `MiniProgramHostAdapter` 对接宿主能力，而不是在 SDK 内部直接耦合平台 API。

### 好处
- 兼容不同宿主环境
- 降低平台变更影响
- 提升可测试性
- 支持浏览器模拟或测试环境替身实现

---

## 7. 分层架构设计

## 7.1 Facade Layer

### 职责
- 提供对外 SDK 接口
- 屏蔽底层复杂度
- 编排多步骤操作
- 负责对外语义一致性

### 输出接口
- `executeSkill`
- `sendMessage`
- `stopSkill`
- `closeSkill`
- `regenerateAnswer`
- `getSessionMessage`
- `sendMessageToIM`
- `replyPermission`
- `controlSkillWeCode`
- `onSessionStatus`
- `onSkillWecodeStatus`

---

## 7.2 Orchestrator Layer

### 职责
协调多个底层组件完成一次完整业务行为。

### 典型编排

#### executeSkill
- create session
- connect stream
- send first message
- register status

#### regenerateAnswer
- load last USER message
- ensure stream
- send message again

#### closeSkill
- call REST
- disconnect stream
- clear state

---

## 7.3 State Layer

### 组成
- Session Store
- Message Store
- Runtime Cache

### 职责
- 管理会话状态
- 管理消息历史
- 管理流式 buffer
- 提供恢复依据

---

## 7.4 Event Layer

### 组成
- Session Status Event Bus
- Stream Message Event Bus
- WeCode Lifecycle Event Bus

### 职责
- 回调注册
- 事件分发
- 多订阅者广播
- 事件与状态解耦

---

## 7.5 Adapter Layer

### 组成
- REST API Adapter
- WebSocket Stream Adapter
- MiniProgram Host Adapter

### 职责
- 对接 Skill Server
- 对接宿主平台
- 屏蔽底层协议差异

---

## 8. 组件设计

## 8.1 SkillSDKFacade

### 定位
对外唯一入口。

### 核心职责
- 参数校验
- 编排底层调用
- 错误包装
- 对外返回统一 Promise / 回调行为

### 依赖组件
- RuntimeOrchestrator
- EventBus
- SessionStore
- MessageStore

---

## 8.2 RuntimeOrchestrator

### 定位
业务流程编排器。

### 核心职责
- executeSkill 流程编排
- sendMessage 流程编排
- regenerateAnswer 流程编排
- close / stop 流程编排
- 状态转换触发

### 不负责
- 直接保存 UI 状态
- 具体平台控制实现

---

## 8.3 SkillRestApi

### 定位
Skill Server REST 接口代理。

### 核心职责
- 构造请求
- 解析响应
- 映射错误
- 统一重试与超时控制

### 关键接口
- createSession
- getSessionList
- getSessionDetail
- closeSession
- sendUserMessage
- getSessionMessages
- replyPermission
- sendMessageToIM

---

## 8.4 SkillStreamClient

### 定位
会话级流式连接管理器。

### 核心职责
- 按 session 建立 WS 连接
- 复用连接
- 分发消息
- 处理 delta / done / error / agent 状态
- 执行断线重连

### 内部状态
- connectionState
- lastSeq
- subscriberSet
- fullText
- currentStreamingBuffer
- reconnectCount
- stoppedByUser

---

## 8.5 SessionStore

### 定位
会话状态中心。

### 核心职责
- 缓存 SkillSession
- 跟踪内部执行状态
- 管理 session 与 stream 关系
- 标记关闭、停止、完成状态

---

## 8.6 MessageStore

### 定位
消息状态中心。

### 核心职责
- 缓存历史消息
- 管理当前流式消息 buffer
- 持久化当前 assistant 完整输出
- 提供“最后一条 USER 消息”查询

---

## 8.7 EventBus

### 定位
模块内部与对外事件总线。

### 核心职责
- session status 分发
- stream message 分发
- wecode status 分发
- 多订阅者解耦

---

## 8.8 MiniProgramController

### 定位
小程序生命周期适配组件。

### 核心职责
- 关闭小程序
- 最小化小程序
- 监听小程序状态变化
- 与 closeSkill / stopSkill / session 状态联动

---

## 9. 接口架构映射

## 9.1 对外 SDK 到内部架构映射

| SDK接口 | Facade | Orchestrator | REST | WS | Store/Event |
|---|---|---|---|---|---|
| executeSkill | 是 | 是 | createSession + sendMessage | connect | Session/Message/Event |
| closeSkill | 是 | 是 | closeSession | disconnect | Session/Event |
| stopSkill | 是 | 是 | 否 | disconnect | Session/Event |
| onSessionStatus | 是 | 否 | 否 | listen | Event |
| onSkillWecodeStatus | 是 | 否 | 否 | 否 | Event |
| regenerateAnswer | 是 | 是 | sendMessage | ensureConnection | Message/Event |
| sendMessageToIM | 是 | 否 | send-to-im | 否 | 否 |
| getSessionMessage | 是 | 否 | get messages | 否 | Message |
| sendMessage | 是 | 是 | send message | ensureConnection | Message/Event |
| replyPermission | 是 | 否 | reply permission | 否 | 否 |
| controlSkillWeCode | 是 | 是 | closeSession(可选) | disconnect(可选) | Event |

---

## 9.2 对外 SDK 到服务端接口映射

| SDK接口 | 服务端REST | 服务端WS |
|---|---|---|
| executeSkill | POST /sessions + POST /messages | /ws/skill/stream/{sessionId} |
| closeSkill | DELETE /sessions/{id} | 断开连接 |
| stopSkill | 无 | 断开连接 |
| regenerateAnswer | GET /messages + POST /messages | /ws/skill/stream/{sessionId} |
| sendMessageToIM | POST /send-to-im | 无 |
| getSessionMessage | GET /messages | 无 |
| sendMessage | POST /messages | /ws/skill/stream/{sessionId} |
| replyPermission | POST /permissions/{permId} | 无 |

---

## 10. 核心业务流架构设计

## 10.1 executeSkill 架构流

### 说明
`executeSkill` 是一个聚合入口，不是单一底层调用。

### 架构步骤
1. Facade 接收请求
2. Orchestrator 创建会话
3. SessionStore 写入会话
4. StreamClient 建立 session 连接
5. RestApi 发送首条用户消息
6. WebSocket 返回 delta / done / error
7. MessageStore 拼接和落库
8. EventBus 派发状态

---

## 10.2 sendMessage 架构流

### 说明
多轮对话基于既有会话进行。

### 架构步骤
1. 确保 session 存在
2. 确保 stream 可用
3. 调用 send message REST
4. 进入 pending
5. 流式返回增量内容
6. done / error 后完成该轮消息

---

## 10.3 regenerateAnswer 架构流

### 说明
重新生成不创建新会话，不覆盖旧消息。

### 架构步骤
1. MessageStore 查询最后一条 USER 消息
2. 若本地无数据，则从服务端拉取历史
3. 复用同一 session
4. 再次 send message
5. 新回答作为新一轮 assistant 消息插入

---

## 10.4 stopSkill 架构流

### 说明
stop 是“停止客户端继续接收结果流”，不是“强制中止服务端处理”。

### 架构步骤
1. 标记 stoppedByUser
2. 断开 session 对应 stream
3. 更新内部状态为 stopped
4. 向上派发 stopped

### 架构影响
- session 仍可用
- 后续仍可以 sendMessage
- 若继续对话，需重新建流

---

## 10.5 closeSkill 架构流

### 说明
close 是会话终止语义。

### 架构步骤
1. 调用服务端 close session
2. 断开 stream
3. 清理 session runtime
4. 清理回调与 buffer
5. 更新状态为 closed

### 架构影响
- session 不可恢复
- 相关资源完全释放

---

## 10.6 小程序控制流

### close
- 宿主关闭小程序
- SDK 调用 closeSkill
- 释放会话资源
- 派发 wecode closed

### minimize
- 宿主最小化小程序
- 视平台能力决定是否保持 stream
- 派发 wecode minimized

---

## 11. 状态架构设计

## 11.1 内部状态

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

## 11.2 对外状态

```ts
type SessionStatus = 'executing' | 'stopped' | 'completed';
type SkillWecodeStatus = 'closed' | 'minimized';
```

## 11.3 状态映射原则

| 触发源 | 内部状态 | 对外状态 |
|---|---|---|
| sendMessage / executeSkill | pending | executing（可选延迟暴露） |
| delta | executing | executing |
| done | completed | completed |
| error | failed | stopped |
| agent_offline | stopped | stopped |
| stopSkill | stopped | stopped |
| closeSkill | closed | 不通过 SessionStatus 暴露 |

---

## 12. 通信架构设计

## 12.1 REST 通信模型

### 特点
- 请求-响应
- 明确成功与失败
- 适合控制类行为
- 易于统一错误治理

### 使用场景
- create session
- close session
- send message
- get messages
- reply permission
- send to IM

---

## 12.2 WebSocket 通信模型

### 特点
- 服务端单向推送
- 适合增量内容流
- 与 session 强绑定

### 消息类型
- delta
- done
- error
- agent_online
- agent_offline

### 架构原则
- 不通过 WS 发业务控制命令
- 一个 session 一个 WS runtime
- 多订阅者共享同一连接

---

## 12.3 错误与重连架构

### REST
- 查询类请求可有限重试
- 提交类请求默认不自动重试

### WebSocket
- 非用户主动 stop / close 时可自动重连
- 重连次数有限
- 重连失败后保持 stopped / failed

---

## 13. 存储架构设计

## 13.1 存储分类

### 内存态
- 当前会话状态
- 当前流式 buffer
- 当前连接 runtime
- 当前订阅列表

### 持久化态（可选）
- 会话列表缓存
- 最近消息分页
- 最近一次完整 assistant 消息

---

## 13.2 存储原则

- 内存存储用于实时交互
- 持久化存储用于恢复与性能优化
- 不依赖本地存储作为最终事实来源
- 最终事实来源仍是 Skill Server

---

## 14. 非功能架构设计

## 14.1 可用性
- stream 可重连
- session 可恢复查询
- message 可重新拉取

## 14.2 可扩展性
- 支持新增 SDK 方法
- 支持新增宿主平台
- 支持显式 stop API 接入
- 支持多 skillDefinition 配置

## 14.3 可维护性
- 单一职责分层
- Facade 与 Adapter 解耦
- Store 与 UI 解耦
- HostAdapter 与平台解耦

## 14.4 可测试性
- RestClient 可 mock
- StreamClient 可 mock
- HostAdapter 可替换
- Store 与 EventBus 可单测

## 14.5 可观测性
- 支持日志、埋点、耗时统计
- 支持 session 维度定位问题
- 支持 stream 连接状态诊断

---

## 15. 部署与运行环境视图

## 15.1 运行环境

### 浏览器 / PC 客户端
- HTTP 客户端
- WebSocket
- 剪贴板 API
- 页面生命周期

### 鸿蒙 / 小程序宿主
- HTTP 客户端
- WebSocket
- 原生窗口管理
- 前后台生命周期事件

---

## 15.2 依赖配置项

建议提供统一配置对象：

```ts
type SkillSDKConfig = {
  baseHttpUrl: string;
  baseWsUrl: string;
  skillDefinitionId?: number;
  sessionListPageSize?: number;
  messagePageSize?: number;
  wsReconnectMaxTimes?: number;
  wsReconnectBaseDelayMs?: number;
  hostAdapter?: MiniProgramHostAdapter;
};
```

---

## 16. 风险与架构约束

## 16.1 skillDefinitionId 未在 SDK 暴露
需要通过配置或上下文注入。

## 16.2 stopSkill 不是服务端显式 stop
当前只能停止客户端接收，不保证服务端立即终止生成。

## 16.3 小程序后台连接策略受平台约束
不同宿主对后台 WebSocket 支持不一致，需要联调确认。

## 16.4 同一 session 并发发送消息策略未完全明确
建议默认串行，防止状态和消息顺序混乱。

## 16.5 Stream 缺失消息恢复依赖历史查询
若出现异常断流，完整恢复需依赖历史接口重新拉取。

---

## 17. 架构演进建议

## 17.1 第一阶段
- 完成 REST + WS 基础架构
- 完成 SDK 基础接口
- 完成客户端 / 小程序双端打通

## 17.2 第二阶段
- 增加本地持久化恢复
- 优化断线重连
- 增加更多埋点和诊断能力

## 17.3 第三阶段
- 支持服务端显式 stop API
- 支持多 skillDefinition 动态选择
- 支持更细粒度的流式事件模型
- 支持消息并发控制策略配置

---

## 18. 结论

本架构方案采用 **Facade + Orchestrator + Store + Adapter** 的组合模式：

- **Facade** 提供统一 SDK 能力
- **Orchestrator** 负责流程编排
- **Store** 负责会话与消息状态管理
- **Adapter** 负责对接服务端与宿主平台
- **WebSocket** 仅负责结果流
- **REST** 负责控制与查询

该架构满足当前需求，并具备良好的：

- 可落地性
- 可维护性
- 可扩展性
- 多端复用能力
