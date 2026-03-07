# winPC Skill SDK

基于 `Docs` 下需求/架构/技术方案/接口文档实现的 Agent Skill 调用模块（TypeScript）。

## 已实现能力

- SDK Facade：`executeSkill / closeSkill / stopSkill / sendMessage / regenerateAnswer / getSessionMessage / sendMessageToIM / replyPermission / onSessionStatus / onSkillWecodeStatus / controlSkillWeCode / copySkillResult`
- REST 封装：会话管理 + 消息管理 + 权限确认 + 发送 IM
- WebSocket 流管理：按 `sessionId` 连接复用、状态映射、重连
- Store：SessionStore / MessageStore
- EventCenter：会话状态、流消息、小程序状态广播

## 安装

```bash
npm.cmd install --cache .npm-cache
```

## 第1步：测试

```bash
npm.cmd run test
```

当前包含：

- `executeSkill` 聚合流程测试（创建会话 + 建流 + 首条消息）
- `stopSkill` 断流与状态回调测试
- `regenerateAnswer` 从历史消息回补并重发测试

## 第2步：接入示例

核心入口：

- `createSkillSDK(config)`
- `SkillSDKFacade`

基础示例：

```ts
import { createSkillSDK } from './src/sdk.js';

const sdk = createSkillSDK({
  baseHttpUrl: 'http://localhost:8082',
  baseWsUrl: 'ws://localhost:8082',
  skillDefinitionId: 1
});

const session = await sdk.executeSkill('chat-1', '1001', '你好，帮我分析代码');
await sdk.sendMessage(String(session.id), '继续', (msg) => {
  console.log(msg.type, msg.content);
});
```

## 第3步：本地 Mock 联调

### 启动 mock Skill Server

```bash
npm.cmd run mock:start
```

### 新开终端运行 demo 客户端

```bash
npm.cmd run mock:demo
```

## 可视化测试页面

### 启动 UI 页面（会先 build SDK）

```bash
npm.cmd run ui:start
```

打开浏览器访问：

- `http://localhost:8090`

### 联调建议顺序

1. 终端A：`npm.cmd run mock:start`
2. 终端B：`npm.cmd run ui:start`
3. 浏览器中依次点击：`初始化 SDK -> executeSkill -> sendMessage -> getSessionMessage`

页面支持测试：

- execute / send / stop / close / regenerate
- history / send-to-im / permission
- wecode minimize/close
- copySkillResult

## 目录

- `src/` SDK 与核心实现
- `tests/` 单元测试
- `mock/` 本地 mock 服务与 demo
- `playground/` 可视化测试页
