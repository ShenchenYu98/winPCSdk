# Skill Client SDK 项目过程文档

版本：会话总结稿  
状态：已落盘，待后续继续补充  
整理时间：2026-03-17  
整理范围：基于当前我与你之间的全部协作记录整理

## 1. 项目背景
本项目以 [`D:\featProject\gitHub\opencode-CUI\documents\skillSdk\SkillClientSdkInterface.md`](/D:/featProject/gitHub/opencode-CUI/documents/skillSdk/SkillClientSdkInterface.md) 为唯一事实源启动，目标不是直接进入编码，而是先建立一套完整的 Skill Client SDK 文档体系，作为后续研发、联调、测试和发布的统一基线。

项目最初的核心要求有四点：
1. 以接口文档为边界，不随意扩展能力范围。
2. 依次输出 PRD、架构设计、方案设计、项目实施计划。
3. 每份文档输出后都保留待评审问题和可优化点。
4. 先审阅，再逐步收口，不直接越过评审阶段。

## 2. 需求确认阶段
### 2.1 事实源确认
项目启动后，首先对 `SkillClientSdkInterface.md` 做了解析和校验。过程中发现文件最初读取存在编码乱码，随后确认使用 UTF-8 才能正确提取内容。基于该文档，完整梳理了：
- 13 个 SDK 接口
- 各接口依赖的 REST API 与 WebSocket 链路
- 会话状态、执行状态与流式消息类型
- 错误码与数据结构定义

### 2.2 范围确认
随后明确了本轮工作的边界：
- 仅以接口文档为能力基线
- 文档语言统一为中文
- 实施计划采用 6 周 MVP 粒度
- 工作节奏采用“逐篇输出、逐篇评审、逐步收口”
- 实施边界定义为“SDK 主导 + Skill Server / IM / 小程序协同项”

### 2.3 冲突识别
在最初分析阶段，就识别出接口文档中的几个关键冲突点，并将其设为四份文档都必须显式处理的问题：
1. `closeSkill()` 无入参，但 `CloseSkillParams` 又要求 `sessionId`
2. `stopSkill` 描述为“停止本轮生成”，实现却写成 `DELETE session`
3. `SkillSession` 字段名 `sessionId` 与类型定义字段 `id` 不一致
4. `userId` 出现 `string/number` 混用
5. `onSessionStatusChange` 不建连，而 `registerSessionListener` 支持自动建连

## 3. 文档建设过程
### 3.1 产品需求文档（PRD）
首先产出并落地了 [`D:\featProject\gitHub\opencode-CUI\documents\skillSdk\01-产品需求文档-PRD.md`](/D:/featProject/gitHub/opencode-CUI/documents/skillSdk/01-产品需求文档-PRD.md)。

这份文档完成了以下内容：
- 明确目标用户、核心场景和能力边界
- 按 13 个接口归纳功能需求与验收标准
- 建立统一公共契约章节：
  - 接口能力矩阵
  - 会话状态机映射
  - 流式消息协议
  - 一致性问题清单
- 输出非功能需求和成功指标

在第一轮评审中，最终锁定了以下关键决策：
- `closeSkill` 无入参
- `stopSkill` 的真实语义是“停止本轮生成”
- `SkillSession` 主键字段统一为 `id`
- `userId` 统一为 `string`
- `onSessionStatusChange` 不允许在无 WS 连接时自动建连

同时确定了第一批优化方向：
- 引入统一错误对象结构
- `StreamMessage` 增补必填 `sessionId`
- 暂不拆分会话状态与执行状态
- 暂不引入 listenerId
- 暂不补充 `regenerateAnswer` 失败码规范

### 3.2 架构设计文档
随后产出并落地了 [`D:\featProject\gitHub\opencode-CUI\documents\skillSdk\02-架构设计文档.md`](/D:/featProject/gitHub/opencode-CUI/documents/skillSdk/02-架构设计文档.md)。

这份文档重点明确了 SDK 的逻辑结构与运行边界，主要包括：
- 核心模块划分：
  - `SessionManager`
  - `WSConnectionManager`
  - `ListenerRegistry`
  - `MessageMergeEngine`
  - `PermissionGateway`
  - `WeCodeController`
  - `ErrorNormalizer`
- 会话状态机与连接生命周期
- 关键时序：首次执行、多轮对话、停止、关闭、权限确认、断线恢复
- 统一错误对象 `SkillSdkError`
- `StreamMessage.sessionId` 必填约束

在第二轮评审中，架构层进一步明确：
- `closeSkill` 的作用域是“SDK 管理的全部会话连接”
- `stopSkill` 若服务端现网仍是 `DELETE /sessions/{id}`，本期暂不改造服务端
- `SkillSession.id` 类型统一为 `string`
- `ConnectionPolicy` 采用固定默认值：
  - 最大重试次数 5
  - 退避起始 1s
  - 最大退避 5s
  - 心跳 15s
  - 断线阈值 30s
- ListenerRegistry 启用逐监听器 `try-catch + 熔断计数`
- 新增 `dispatchLatencyMs` 指标

### 3.3 方案设计文档
接着产出并落地了 [`D:\featProject\gitHub\opencode-CUI\documents\skillSdk\03-方案设计文档.md`](/D:/featProject/gitHub/opencode-CUI/documents/skillSdk/03-方案设计文档.md)。

该文档从实现角度对架构进一步细化，主要包括：
- API Facade 设计
- `SessionStore` / `ConnectionManager` / `ListenerRegistry` / `MessageMergeEngine` / `ErrorNormalizer` 的职责和数据结构
- REST / WebSocket 调用方式与路由规则
- `stopSkill` 的 DELETE 兼容处理方案
- 历史消息与流式缓存合并去重策略
- 时序安全策略与重连恢复机制
- `ConnectionPolicy` 与运行时开关
- 联调分层与灰度策略

在第三轮评审中，又进一步确认：
- `closeSkill` 执行后同步清空全部 SessionStore
- `SESSION_TERMINATED_AFTER_STOP` 的交互由前端控制，SDK 不负责 UI
- Listener 熔断自动恢复本期不处理
- `ConnectionPolicy` 需要作为 SDK 初始化参数透出并支持环境覆写
- `dispatchLatencyMs` 正式纳入观测项
- `getSessionMessage(includeStreaming=false)` 本期不做

### 3.4 项目实施计划
最后，产出并持续增强了 [`D:\featProject\gitHub\opencode-CUI\documents\skillSdk\04-项目实施计划.md`](/D:/featProject/gitHub/opencode-CUI/documents/skillSdk/04-项目实施计划.md)。

这份文档最初只是一个 6 周 MVP 周级计划，后续经过多轮补充，逐步演进为一份完整的执行文档，已经覆盖：
- 周级总览
- 每周子任务表、工作量、验收标准
- MVP 阶段验收汇总
- 质量门禁与上线门禁
- 单接口业务场景验证矩阵
- 联动调用测试矩阵
- 模拟真实场景端到端测试

## 4. 实施计划的演进
### 4.1 从周级里程碑到任务级拆解
参考旧版 [`D:\featProject\gitHub\opencode-CUI\documents\obsolete\version-1\项目实施计划.md`](/D:/featProject/gitHub/opencode-CUI/documents/obsolete/version-1/项目实施计划.md) 的 Demo 阶段详细计划风格，后续把第 4 節补成了更适合落地执行的结构：
- W1-W6 每周任务清单
- 每个任务的工作量
- 每周验收标准
- 阶段验收汇总

### 4.2 增加接口业务场景验证
之后新增了两条更强的测试要求：
1. IM 触发 Skill 后，IM 客户端与小程序都能接收到对应 `sessionId` 的流式消息
2. 13 个接口每个接口都必须通过 5 条单元测试

这两条要求最初只写在 W2 局部验收中，后来被升级为全局门禁，并写入实施计划的多个关键位置：
- `4.7 MVP 阶段验收标准汇总`
- `6.1 测试场景门禁`
- `6.2 上线门禁指标`
- `6.3 接口业务场景验证矩阵`

最终形成如下门槛：
- 13/13 接口覆盖
- 每接口 `>= 5` 条
- 总计 `>= 65` 条
- 通过率 100%

### 4.3 增加联动调用测试
之后进一步补充了“可联动调用接口”的联动测试要求。基于接口文档，最终抽象出 6 条关键联动链路：
- L1 `registerSessionListener -> executeSkill -> onSessionStatusChange -> getSessionMessage`
- L2 `executeSkill -> sendMessage -> getSessionMessage`
- L3 `executeSkill -> sendMessage -> stopSkill -> sendMessage`
- L4 `executeSkill -> regenerateAnswer -> sendMessageToIM`
- L5 `controlSkillWeCode -> onSkillWecodeStatusChange -> closeSkill`
- L6 `executeSkill -> (权限请求事件) -> replyPermission -> sendMessage`

这些联动测试被写入：
- `6.1 测试场景门禁`
- `6.2 上线门禁指标`
- `6.4 联动调用测试矩阵`

同时也挂接到周计划里：
- W4：联动矩阵设计
- W5：联动矩阵执行与报告输出
- W6：联动门禁 100% 通过作为发布阻断条件

### 4.4 增加模拟真实场景测试
在最后一轮补充中，又加入了一条更贴近产品真实使用方式的场景测试，并作为联动链路 L7 纳入全局硬门禁。

该场景要求构建一个聊天窗口页面，具备以下行为：
1. 在输入区输入 `/skillName 帮我做xxx` 时，发送按钮切换为技能执行按钮
2. 点击后触发 Skill 全链路执行，按钮进一步切换为技能停止按钮
3. 同时拉起最小化状态的小程序容器
4. WebSocket 若不存在则新建，若存在则复用
5. Skill 服务端通过 mock 的 REST / WebSocket 返回执行结果
6. IM 客户端和小程序都按相同 `sessionId` 接收流式结果
7. 最小化状态的小程序容器实时展示技能状态：执行中、已停止、已完成
8. 打开小程序后进入多轮对话页，可执行：
   - 停止执行中的 Skill
   - 将执行完成内容发送到 IM
   - Skill 完成后继续对话
   - 重新生成当前 Skill 执行结果

这条场景被正式定义为联动链路 L7，并同步升级门禁口径：
- 总门禁从 18 项变成 19 项
- 联动覆盖从 6/6 升级为 7/7
- 联动最小用例数从 `>= 18` 升级为 `>= 21`
- W4 增加 L7 的测试夹具与 mock 契约设计
- W5 增加 L7 的实际执行与验收

## 5. 当前项目基线
到目前为止，项目已经形成了完整的执行基线，不再停留在“需求讨论”阶段，而是已经进入“可按文档启动构建”的准备完成状态。

当前的核心基线包括：
- 事实源：`SkillClientSdkInterface.md`
- 文档体系：PRD、架构设计、方案设计、实施计划四件套
- 实施边界：SDK 主导，联动 Skill Server / IM / 小程序
- 计划周期：6 周 MVP

当前已确认的关键运行约束：
- `closeSkill` 无入参，关闭全部会话连接并清空 SessionStore
- `stopSkill` 语义是停止本轮生成，现网 DELETE 暂兼容
- `SkillSession.id` 和 `userId` 统一为 `string`
- `onSessionStatusChange` 不允许自动建连
- `StreamMessage.sessionId` 为必填
- `ConnectionPolicy` 作为 SDK 初始化参数
- `SkillSdkError` 作为统一错误对象
- `dispatchLatencyMs` 作为新增指标

## 6. 当前质量与测试门禁
项目当前已经建立三层测试门槛：

### 6.1 单接口门禁
- 覆盖：13/13 接口
- 每接口：`>= 5` 条
- 总数：`>= 65`
- 通过率：100%

### 6.2 联动链路门禁
- 覆盖：7/7 链路
- 每链路：`>= 3` 条
- 总数：`>= 21`
- 通过率：100%

### 6.3 总门禁场景
- 总计 19 项门禁场景
- 联动失败将直接阻断 W6 发布检查

## 7. 当前核心产出
目前已经形成并持续更新的核心文档如下：
1. [01-产品需求文档-PRD.md](/D:/featProject/gitHub/opencode-CUI/documents/skillSdk/01-产品需求文档-PRD.md)
2. [02-架构设计文档.md](/D:/featProject/gitHub/opencode-CUI/documents/skillSdk/02-架构设计文档.md)
3. [03-方案设计文档.md](/D:/featProject/gitHub/opencode-CUI/documents/skillSdk/03-方案设计文档.md)
4. [04-项目实施计划.md](/D:/featProject/gitHub/opencode-CUI/documents/skillSdk/04-项目实施计划.md)

## 8. 当前阶段结论
从“需求确定”到“项目构建准备”的全过程已经基本完成，主要完成的事项包括：
- 需求边界与事实源确认
- 接口冲突收敛与统一口径确认
- 产品需求文档建立
- 架构与模块职责定义
- 技术方案与实现策略定义
- 6 周实施计划与门禁机制建立
- 单接口、联动链路、真实场景三层测试门禁形成

因此，当前项目已经从“需求讨论期”进入“项目构建前准备完成期”，具备继续向实际实现和联调推进的条件。
