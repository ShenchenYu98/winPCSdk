# Skill Client SDK 产品需求文档（PRD）

## 1. 文档信息
- 文档版本：v1.0（评审稿）
- 事实来源：`documents/skillSdk/SkillClientSdkInterface.md`
- 产出日期：2026-03-07
- 适用范围：Skill Client SDK 主线能力与协同集成边界（Skill Server / IM / 小程序）

## 2. 产品概述
Skill Client SDK 负责连接 IM 客户端、小程序与 Skill 服务端，提供会话管理、流式消息接收、多轮对话、权限确认与小程序控制能力。  
本期目标是在不新增接口的前提下，统一 13 个既有接口的产品契约、状态语义与验收标准，形成可执行的 MVP 研发输入。

## 3. 目标用户与核心场景
## 3.1 目标用户
- IM 客户端研发：负责触发技能执行、同步 AI 结果到 IM 会话。
- 小程序研发：负责展示流式结果、处理生命周期与交互回调。
- Skill 服务端对接研发：负责 REST/WS 协议、状态流转与错误语义对齐。
- 测试与运维：负责接口稳定性、时序一致性和异常恢复验证。

## 3.2 核心场景
- 场景 A：用户首次发起技能执行并实时接收 AI 流式响应。
- 场景 B：用户在同一 session 内进行多轮持续对话。
- 场景 C：用户中断当前生成（stop）后继续提问。
- 场景 D：AI 触发敏感操作，用户进行权限批准/拒绝。
- 场景 E：将 AI 结果同步回 IM 聊天，或控制小程序关闭/最小化。

## 4. 范围与边界
## 4.1 In Scope
- 13 个 SDK 能力的产品需求定义、验收标准与质量指标。
- 接口契约统一（输入输出、状态映射、错误语义、时序约束）。
- SDK 主导实施路径及跨系统协同依赖（Skill Server / IM / 小程序）。

## 4.2 Out of Scope
- 新增业务接口或变更服务端持久化模型。
- AI 模型效果优化、Prompt 策略设计。
- 非本 SDK 的账号体系、组织权限系统扩展。

## 5. 公共契约章节（四文档统一）
## 5.1 接口能力矩阵
| 接口 | 目的 | 关键入参 | 关键出参 | 依赖 REST/WS | 副作用 | 错误码/错误语义 |
|---|---|---|---|---|---|---|
| executeSkill | 创建会话并触发首轮 AI 处理 | imChatId, skillDefinitionId, userId, skillContent, agentId?, title? | SkillSession | `POST /api/skill/sessions` + `POST /api/skill/sessions/{sessionId}/messages` + `ws://{host}:8082/ws/skill/stream` | 创建会话、建立流连接、发送首条消息 | 会话创建失败、网络错误（文档未给固定码） |
| closeSkill | 关闭 SDK 与服务端连接，释放资源 | 无（签名） | status(success/failed) | WS 连接关闭 | 连接释放 | 文档列出 404/409 |
| stopSkill | 中断当前生成但保留会话能力 | sessionId | status(success/failed) | 文档实现写 `DELETE /api/skill/sessions/{sessionId}` | 停止当前回调 | 文档未显式码（示例描述会话不存在/网络错误） |
| onSessionStatusChange | 监听会话执行状态变更 | sessionId, callback | status(executing/stopped/completed) | 依赖既有 WS 消息 | 状态回调触发 | 连接缺少 sessionId、传输错误 |
| onSkillWecodeStatusChange | 监听小程序状态变化 | callback | status(closed/minimized) | 依赖 `controlSkillWeCode` 调用事件 | 小程序状态回调 | 文档未定义 |
| regenerateAnswer | 使用最后一条用户消息重新生成回答 | sessionId | messageId, success | `POST /api/skill/sessions/{sessionId}/messages` + WS | 再次触发 AI 生成 | 会话不存在、WS 未连接、网络错误 |
| sendMessageToIM | 将 AI 结果同步到 IM 聊天 | sessionId, content | success, chatId, contentLength | `POST /api/skill/sessions/{sessionId}/send-to-im` | 调用 IM 平台发送消息 | 400/404/409/500 |
| getSessionMessage | 分页获取会话历史并与流式缓存合并 | sessionId, page?, size? | PageResult\<ChatMessage\> | `GET /api/skill/sessions/{sessionId}/messages` + 本地缓存 | 返回合并后的消息视图 | 404 |
| registerSessionListener | 注册流式回调监听器 | sessionId, onMessage, onError?, onClose? | void | 首次可自动建 WS | 回调注册、事件分发 | 无效 sessionId、连接失败（示例语义） |
| unregisterSessionListener | 移除会话监听器 | sessionId, onMessage, onError?, onClose? | void | 可触发自动断连 | 监听器解绑 | 监听器未注册、无效 sessionId（示例语义） |
| sendMessage | 多轮对话发送用户消息并接收流式响应 | sessionId, content | messageId, seq, createdAt | `POST /api/skill/sessions/{sessionId}/messages` + WS | 触发新一轮 AI 处理 | 400/404/409/500 |
| replyPermission | 回复权限确认请求 | sessionId, permissionId, approved | success, permissionId, approved | `POST /api/skill/sessions/{sessionId}/permissions/{permissionId}` | 影响敏感操作执行 | 400/404/409 |
| controlSkillWeCode | 控制小程序关闭/最小化 | action(close/minimize) | status(success/failed) | 本地控制 + 状态回调 | 改变小程序显示状态 | 文档未定义固定码 |

## 5.2 会话状态机映射
产品层会话状态与回调状态并存，约定映射如下（用于前端展示和流程判断）：

| 维度 | 枚举 | 语义 |
|---|---|---|
| 会话实体状态（SkillSession.status） | ACTIVE / IDLE / CLOSED | 会话生命周期状态 |
| 执行状态回调（SessionStatus） | executing / stopped / completed | 当前一次生成任务状态 |

映射规则（提案）：
- `executing` 通常发生在会话 `ACTIVE` 下。
- `completed` 不等于会话关闭，会话可继续多轮消息。
- `stopped` 表示本轮生成中断，不默认关闭会话。
- `CLOSED` 会话不应继续发送消息。

## 5.3 流式消息协议
- 消息类型：`delta` / `done` / `error` / `agent_offline` / `agent_online`
- 协议字段：`type`、`seq`、`content`、`usage(done 可带 token 统计)`
- 处理原则：
  - `delta`：追加增量内容并更新执行态。
  - `done`：结束本轮流式并产出完成态。
  - `error`：结束本轮并产出异常态。
  - `agent_offline`：会话进入不可服务态，提示重试或等待。
  - `agent_online`：恢复可服务态，可继续执行。

## 5.4 一致性问题清单（需评审决策）
1. `closeSkill()` 无入参 vs `CloseSkillParams.sessionId` 必填。
2. `stopSkill` 描述为“保持 WS + stopped” vs 实现写成 `DELETE session` 且响应 `closed`。
3. `SkillSession` 返回字段 `sessionId` vs 类型定义字段 `id`。
4. `userId` 在示例中存在 string / number 不一致。
5. `onSessionStatusChange` 明确“不主动建连” vs `registerSessionListener` 支持首次自动建连。

## 6. 功能需求（FR）与验收标准
## 6.1 会话与执行链路
### FR-01 执行技能（executeSkill）
- 需求：创建会话、建立流连接并自动发送首条用户消息。
- 验收标准：
  - 输入必填参数合法时返回会话对象（含会话标识与状态）。
  - 首条 `skillContent` 自动触发 AI 流式响应。
  - 监听先注册后执行，不得丢失该轮流式消息。

### FR-02 关闭技能（closeSkill）
- 需求：关闭 SDK 与服务端连接并释放会话相关连接资源。
- 验收标准：
  - 成功关闭返回 `status=success`。
  - 重复关闭可识别并返回可处理错误语义（如 409）。

### FR-03 停止技能（stopSkill）
- 需求：中断当前生成回调，允许后续继续发送消息。
- 验收标准：
  - 停止调用后本轮不再继续推送 `delta`。
  - 同一会话可再次 `sendMessage` 发起新一轮生成。

## 6.2 回调与监听能力
### FR-04 会话状态回调（onSessionStatusChange）
- 需求：基于 WS 消息映射执行态并触发业务回调。
- 验收标准：
  - `delta/done/error/agent_offline/agent_online` 正确映射到状态回调。
  - 回调异常不影响后续消息分发。

### FR-05 小程序状态回调（onSkillWecodeStatusChange）
- 需求：在小程序 close/minimize 操作后回调状态。
- 验收标准：
  - `controlSkillWeCode(close)` 触发 `closed`。
  - `controlSkillWeCode(minimize)` 触发 `minimized`。

### FR-06 注册监听器（registerSessionListener）
- 需求：支持任意时机注册，多监听器共享连接并接收事件。
- 验收标准：
  - 同一 session 支持多个监听器并行接收。
  - 未建连时可暂存监听器并在建连后自动生效。

### FR-07 移除监听器（unregisterSessionListener）
- 需求：按回调引用精确移除监听器，必要时断连。
- 验收标准：
  - 仅移除目标监听器，不影响其他监听器。
  - 当无剩余监听器且开启自动断连时，连接按配置释放。

## 6.3 消息能力
### FR-08 发送消息（sendMessage）
- 需求：支持多轮用户消息发送与流式回答接收。
- 验收标准：
  - 发送成功返回消息标识、序号、创建时间。
  - 失败时返回对应错误语义（400/404/409/500）。

### FR-09 重新生成回答（regenerateAnswer）
- 需求：读取最后一条用户消息并触发重答。
- 验收标准：
  - 重答成功返回 `success=true` 与新消息标识。
  - 无最后用户消息时返回明确失败语义（由实现定义）。

### FR-10 获取会话消息（getSessionMessage）
- 需求：返回服务端历史消息，并合并本地流式缓存形成完整可渲染结果。
- 验收标准：
  - 支持分页（默认 page=0, size=50）。
  - 流式未完成消息可临时展示且不重复。
  - 会话不存在时返回 404 语义。

### FR-11 发送 AI 结果到 IM（sendMessageToIM）
- 需求：将 AI 内容同步到会话关联 IM 聊天。
- 验收标准：
  - 成功返回 `success=true`、`chatId`、`contentLength`。
  - content 为空时返回 400 语义。

## 6.4 权限与小程序控制
### FR-12 权限确认（replyPermission）
- 需求：用户可对权限请求批准或拒绝。
- 验收标准：
  - `approved=true/false` 均可成功提交并返回确认结果。
  - 会话关闭或不存在时返回错误语义（404/409）。

### FR-13 小程序控制（controlSkillWeCode）
- 需求：控制小程序 close/minimize，并反馈操作结果。
- 验收标准：
  - 两种 action 均可返回 `status`。
  - 成功后触发对应的小程序状态回调。

## 7. 非功能需求（NFR）
## 7.1 可靠性
- SDK 接口可用率目标：`>= 99.9%`（MVP 运行窗口内）。
- 流式监听回调丢失率目标：`<= 0.1%`（按 seq 连续性统计）。
- 关键接口具备幂等处理：重复注册/重复关闭可安全处理。

## 7.2 性能
- 流式首包时延（用户发消息到首个 `delta`）：P95 `<= 2s`。
- `getSessionMessage` 50 条分页响应：P95 `<= 500ms`（不含弱网波动）。

## 7.3 安全
- 权限确认链路必须显式用户决策，不得默认放行敏感操作。
- 错误信息返回不暴露凭证与敏感内部细节。

## 7.4 可观测性
- 记录关键事件日志：建连、断连、注册/移除监听、错误码、状态切换、权限回复。
- 提供最小监控维度：接口成功率、WS 重连次数、流式完成率。

## 7.5 兼容性
- 向后兼容既有调用方式，优先通过文档契约统一解决歧义，不强制一次性改接口名。
- 枚举值保持原文档定义，不在 MVP 内引入破坏性改动。

## 8. 成功指标（产品验收口径）
| 指标 | 定义 | MVP 目标 |
|---|---|---|
| 接口可用率 | 13 接口成功调用占比 | >= 99.9% |
| 流式首包时延 | send/execute 到首个 delta 的时延 | P95 <= 2s |
| 回调丢失率 | 应收回调与实收回调差异率 | <= 0.1% |
| 权限确认闭环时长 | permission request 到 reply 完成时长 | P95 <= 10s |

## 9. 共用验证场景（四文档统一）
1. 首次执行技能到流式完成闭环。
2. 监听先注册/后注册两种时序不丢消息。
3. 多轮对话连续发送与并发回调分发。
4. `stopSkill` 后继续对话行为校验。
5. `closeSkill` 后资源释放与重复关闭处理。
6. 分页历史与流式缓存合并去重。
7. 权限确认批准/拒绝双路径。
8. `sendMessageToIM` 成功与典型失败码。
9. 小程序 `close/minimize` 控制与状态回调。
10. 断线重连与状态恢复一致性。
11. 错误码映射与前端提示一致性。
12. 向后兼容：旧调用方最小改动可用。

## 10. 依赖与协同
- Skill Server：提供会话、消息、权限、IM 转发 REST 能力及 WS 推流。
- IM 平台：提供消息投递能力，反馈失败语义。
- 小程序宿主：支持窗口状态控制与生命周期通知。
- 测试环境：需具备可复现弱网、断线、重连的联调条件。

## 11. 不理解/待澄清点（请评审）
1. `closeSkill` 是否最终以 `sessionId` 为必填参数？若否，`CloseSkillParams` 是否应删除。
2. `stopSkill` 的真实语义是“停止本轮生成”还是“关闭会话”（`DELETE session`）？
3. `SkillSession` 统一主键字段名采用 `sessionId` 还是 `id`？
4. `userId` 在 SDK 层统一为 `string` 还是 `number`？
5. `onSessionStatusChange` 在无现有 WS 连接时，是否允许内部触发建连？

## 12. 可优化点（含建议改法，请评审）
1. 建议引入统一错误对象结构（`code/message/retriable/httpStatus`），替代当前“接口分散错误语义”。
2. 建议将“会话状态”和“执行状态”拆成两个明确字段，避免 `ACTIVE` 与 `executing` 混用歧义。
3. 建议在 `StreamMessage` 增补 `sessionId` 为必填，统一多会话并发分发。
4. 建议为 `register/unregister` 提供返回 `listenerId` 的可选模式，降低引用匹配失败风险。
5. 建议补充 `regenerateAnswer` 的失败码规范（无最后用户消息、会话无权限、会话关闭）。

## 11. 不理解/待澄清点（请评审）
1. `closeSkill` 无入参。
2. `stopSkill` 的真实语义是“停止本轮生成”。
3. `SkillSession` 统一主键字段名采用 `id`。
4. `userId` 在 SDK 层统一为 `string`。
5. `onSessionStatusChange` 在无现有 WS 连接时，不允许内部触发建连。

## 12. 可优化点（含建议改法，请评审）
1. 引入统一错误对象结构
2. 先不拆分。
3. 在 `StreamMessage` 增补 `sessionId` 为必填，统一多会话并发分发。
4. 暂不需要。
5. 先不补充失败码规范。