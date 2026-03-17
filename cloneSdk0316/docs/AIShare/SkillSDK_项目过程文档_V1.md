# Skill SDK 项目过程文档（V1）

## 1. 项目起点

本项目的初始目标，是围绕 IM 客户端、内嵌小程序与 OpenCode Skill 服务端三方协作，设计并落地一套统一的前端 SDK。SDK 需要承担两类核心职责：

1. Skill 执行过程中的 HTTP / WebSocket 通信。
2. 小程序最小化、关闭等状态向 IM 的回调与协同。

项目没有直接进入编码，而是先进入需求澄清阶段，先把边界、角色、状态、接口职责和异常策略收敛清楚，再进入正式文档与实施规划。

## 2. 需求澄清过程

需求澄清分多轮推进，关键结论逐步收敛。

### 2.1 第一轮澄清

第一轮重点确认 SDK 的集成位置、运行平台、Skill 执行入口、会话标识、请求协议、鉴权方式、状态回调、异常处理和兼容性边界。

确认结果如下：

1. SDK 是一套同时支持 IM 客户端和小程序的统一 SDK。
2. IM 客户端为 Web，小程序是 IM 内嵌的自研容器。
3. Skill 入口在 IM 聊天窗，用户通过 `/skillname 帮我做xxx` 触发执行。
4. HTTP 和 WebSocket 都支持，WebSocket 用于流式返回。
5. Token 由 SDK 获取并传递给服务端。
6. 当前只需要小程序 `minimized` 和 `closed` 两种状态回调。
7. SDK 不负责 IM 收到状态后的业务处理。
8. V1 不考虑兼容旧版本，也不考虑日志加密脱敏。

### 2.2 第二轮澄清

第二轮重点围绕双端执行、会话主导权、状态机、并发约束和 IM/小程序的展示关系做进一步确认。

确认结果如下：

1. IM 与小程序共用一套 SDK API。
2. IM 执行 Skill 时也需要通知小程序。
3. 小程序执行 Skill 时，IM 需要实时感知执行状态。
4. 会话 `sessionId` 由服务端生成并回传。
5. 同一聊天窗内同时只能执行一个 Skill。
6. IM 先发起执行，小程序打开后由小程序承接展示，IM 不再展示执行过程。

### 2.3 接口文档比对与差异识别

在需求收敛过程中，对已有接口文档进行了检查：

1. [SkillClientSdkInterface.md](D:/featProject/skillSdk/documents/SkillClientSdkInterface.md)
2. [SkillServerInterface.md](D:/featProject/skillSdk/documents/SkillServerInterface.md)

识别出的主要问题包括：

1. 服务端文档标注“认证：无”，但实际已确认需要 token。
2. 小程序关闭后的行为描述前后不一致。
3. `stopSkill` 语义在文档中存在冲突。
4. `executeSkill` 缺少显式 `skillCode` 入参。
5. `sessionId` 类型混用 `string/number/Long`，需要统一。

### 2.4 最终需求收口

在最后一轮收口中，确认了以下关键口径：

1. `executeSkill` 显式传 `skillCode`。
2. 小程序关闭后必须调用 `closeSkill`。
3. IM 与小程序之间通过 SDK 内事件总线协同。
4. WebSocket 参数固定为：
   - 最大重试 5 次
   - 起始退避 1s
   - 最大退避 5s
   - 心跳 15s
   - 断线阈值 30s
5. Token 通过 HTTP Header 传递，WebSocket 握手也必须带 token。
6. `sessionId` 全链路统一定义为 `string`。
7. 同聊天窗单 Skill 约束由 IM 保证，SDK 不做互斥裁决。
8. V1 必做接口包含 `regenerateAnswer`、`replyPermission`、`sendMessageToIM`。
9. IM 侧只接收三种高层状态：`executing`、`completed`、`stopped`。

## 3. 需求基线文档形成

在需求收敛完成后，输出并保存了正式需求澄清文档：

1. [SkillSDK_需求澄清文档_V1.md](D:/featProject/skillSdk/documents/SkillSDK_需求澄清文档_V1.md)

该文档固化了项目范围、运行环境、关键业务流程、统一约束、状态回调口径、WebSocket 稳定性参数、V1 必做接口清单，以及与旧文档的差异项。

到此，项目完成了从模糊需求到可评审需求的转化。

## 4. 架构设计过程

在需求基线确认后，继续输出了架构设计文档：

1. [SkillSDK_架构设计文档_V1.md](D:/featProject/skillSdk/documents/SkillSDK_架构设计文档_V1.md)

架构设计围绕“统一 SDK、双端接入、单实例 WS、事件总线协同”展开，形成以下核心结构：

1. `SkillSdkFacade`：统一对外 API 门面。
2. `SessionManager`：负责本地会话上下文、监听器和状态管理。
3. `TransportManager`：负责 HTTP、WS、心跳、重连与退避。
4. `EventBusBridge`：负责 IM 与小程序之间的本地事件发布订阅。
5. `StateMapper`：把底层流事件映射为 IM 三态状态。

架构文档同时定义了：

1. IM 发起 Skill 的关键时序。
2. 小程序最小化与关闭的处理时序。
3. 鉴权方式、错误分类与恢复策略。
4. 测试设计和已知风险。

## 5. API 详细设计与评审过程

在架构文档基础上，继续输出了 API 详细设计文档，并经历了一轮完整评审与修订。

### 5.1 第一版 API 设计

第一版 API 文档定义了：

1. TypeScript 类型系统。
2. 对外 SDK API。
3. 各接口处理流程。
4. 事件模型与错误码模型。
5. 服务端接口映射关系。
6. WebSocket 连接与重连策略。

### 5.2 评审与修订

在 API 评审中，提出了一个关键修正意见：

1. `stopSkill` 关闭的是 `sessionId` 对应的会话，而不是 WebSocket 通道。
2. WebSocket 通道是 SDK 全局单实例，可复用，仅在 IM 客户端关闭时才关闭。
3. `sendMessage` 返回值保持为 `Promise<boolean>`。

基于这轮评审，对 API 文档进行了修订，形成以下正式结论：

1. `stopSkill` 定义为关闭指定会话，不关闭 WS。
2. WS 生命周期定义为全局单实例，可复用，仅在 IM 关闭时断开。
3. WS 内部按 `sessionId` 路由消息。
4. WebSocket token 默认采用 query 参数传递。
5. `sendMessage` 返回约定保持 `Promise<boolean>`。

### 5.3 API 基线文档形成

最终形成并通过评审的 API 文档如下：

1. [SkillSDK_API详细设计文档_V1.1_评审通过.md](D:/featProject/skillSdk/documents/SkillSDK_API详细设计文档_V1.1_评审通过.md)

## 6. 项目实施计划形成过程

在需求、架构和 API 三份文档稳定后，进一步输出项目实施计划。

### 6.1 初版实施计划

最初先输出了一版实施计划，用于定义里程碑、工作分解、角色分工、风险与验收标准。

### 6.2 参考基线文档重写

随后，项目实施计划参考了外部项目实施计划文档的结构，改写为“阶段化里程碑 + 分阶段任务 + 交付物 + 验收标准 + 风险/质量/发布”的风格。

重写后的实施计划将项目分为六个阶段：

1. P1 方案冻结
2. P2 核心底座开发
3. P3 API 全量实现
4. P4 三方联调闭环
5. P5 稳定性与验收
6. P6 灰度发布与全量

### 6.3 实施计划评审通过

重写后的实施计划经过评审，最终通过，形成正式文档：

1. [SkillSDK_项目实施计划_V1_评审通过.md](D:/featProject/skillSdk/documents/SkillSDK_项目实施计划_V1_评审通过.md)

## 7. 当前项目阶段结论

截至目前，项目已经完成了从需求确定到项目构建准备的完整前置过程，但尚未进入 SDK 代码实现阶段。

当前完成的是“文档基线与实施基线”的建设，具体包括：

1. 需求已经冻结，范围、边界、状态与约束已明确。
2. 架构已经形成，模块分层与协同机制已定义。
3. API 已设计并评审通过，接口语义与 WS 生命周期已锁定。
4. 实施计划已评审通过，项目具备明确的阶段推进路径、交付物与验收标准。

因此，当前项目状态可以定义为：

**已完成立项与设计阶段，具备进入研发实现阶段的全部文档条件。**

## 8. 当前正式基线文档

当前项目已经形成以下正式基线文档：

1. [SkillSDK_需求澄清文档_V1.md](D:/featProject/skillSdk/documents/SkillSDK_需求澄清文档_V1.md)
2. [SkillSDK_架构设计文档_V1.md](D:/featProject/skillSdk/documents/SkillSDK_架构设计文档_V1.md)
3. [SkillSDK_API详细设计文档_V1.1_评审通过.md](D:/featProject/skillSdk/documents/SkillSDK_API详细设计文档_V1.1_评审通过.md)
4. [SkillSDK_项目实施计划_V1_评审通过.md](D:/featProject/skillSdk/documents/SkillSDK_项目实施计划_V1_评审通过.md)

## 9. 总结

本项目从启动到当前阶段，采取了“先需求澄清、再架构设计、再 API 评审、最后制定实施计划”的推进路径。整个过程先解决口径一致性，再形成正式基线，避免直接进入编码导致返工。

当前阶段的成果不是代码交付，而是研发启动前必须具备的完整设计资产。项目已经具备进入实际开发、联调与发布阶段的条件。

