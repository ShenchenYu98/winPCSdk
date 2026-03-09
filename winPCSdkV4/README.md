# Skill SDK

本工程用于实现和验证 `Skill SDK` 能力，需求与设计来源于 `docs` 目录下的产品、架构、方案与实施计划文档。

## 目录说明

- `src/sdk`：Skill SDK 正式功能代码
- `test-app`：本地测试页面
- `miniApp`：独立的小程序工程
- `tests`：单元测试代码
- `mocks/server`：本地 Mock Server
- `mocks/runtime`：基于 `mock.json` 的本地内存模拟运行时
- `mocks/mock.json`：`mock.json` 模拟数据

## 安装依赖

```bash
npm install
```

## 本地启动方式

### 启动测试页面

```bash
npm run dev
```

### 启动 Mock Server 模式

```bash
npm run mock:server
```

说明：

- 如果设置了 `MOCK_SERVER_PORT`，Mock Server 会使用指定端口。
- 如果没有设置 `MOCK_SERVER_PORT`，系统会自动分配一个空闲端口。
- 启动后会把实际地址写入 `public/mock-server-runtime.json`，测试页面会自动读取。

PowerShell 示例：

```powershell
$env:MOCK_SERVER_PORT=8788
npm run mock:server
```

## 两种 Mock 验证方式

当前同时支持以下两种验证方式，可并存使用。

### 方式一：本地 Mock Server

适用场景：

- 需要验证真实的 REST API 调用流程
- 需要验证真实 WebSocket 连接、断开、停止生成
- 需要联调 `miniApp iframe` 与宿主页面

使用方式：

1. 运行 `npm run mock:server`
2. 再运行 `npm run dev`
3. 打开测试页面，选择 `Mock Server` 模式

### 方式二：`mock.json` 本地数据模拟

适用场景：

- 不想单独启动本地服务
- 只想用固定数据验证 SDK 的调用链路和页面交互
- 需要快速修改模拟历史消息、流式内容、状态变化

数据与代码位置：

- 模拟数据文件：[mocks/mock.json](D:/featProject/gitHub/winPCSdk/winPCSdkV4/mocks/mock.json)
- 本地运行时实现：[fixtureSkillSdk.ts](D:/featProject/gitHub/winPCSdk/winPCSdkV4/mocks/runtime/fixtureSkillSdk.ts)

使用方式：

1. 直接运行 `npm run dev`
2. 打开测试页面，选择 `Mock JSON` 模式
3. 如需调整模拟数据，直接修改 `mocks/mock.json`

说明：

- `mock.json` 模式下不会启动本地 REST 服务，也不会建立真实 WebSocket。
- 宿主测试页与 `miniApp` 页面会共享同一套本地模拟会话状态和流式数据。

## SDK 接入说明

### 1. 初始化 SDK

浏览器环境推荐使用共享单例：

```ts
import { getSharedBrowserSkillSdk } from "./src/sdk";

const sdk = getSharedBrowserSkillSdk({
  baseUrl: "http://localhost:8787",
  wsUrl: "ws://localhost:8787/ws/skill/stream"
});
```

说明：

- 同一个浏览器运行时内，IM 聊天区和小程序区应复用同一个 SDK 实例。
- 不要在不同组件里分别调用 `createBrowserSkillSdk()` 创建多个实例，否则缓存、监听器和 WebSocket 不会共享。
- 如果是其他运行时，可以直接实例化 `SkillSdk` 并传入自定义 `connectionFactory`。

### 2. IM 聊天窗口首次触发推荐流程

推荐调用顺序如下：

```ts
const session = await sdk.createSession({
  ak: "ak_xxxxxxxx",
  title: "创建一个 React 项目",
  imGroupId: "group_abc123"
});

sdk.onSessionStatusChange({
  welinkSessionId: session.welinkSessionId,
  callback: ({ status }) => {
    console.log("session status:", status);
  }
});

sdk.registerSessionListener({
  welinkSessionId: session.welinkSessionId,
  onMessage: (message) => {
    console.log("stream event:", message);
  }
});

await sdk.sendMessage({
  welinkSessionId: session.welinkSessionId,
  content: "请帮我初始化一个 React 项目"
});
```

说明：

- `createSession` 只负责创建或复用会话，并确保连接建立。
- 首次真正触发技能执行的是 `sendMessage`，不是 `createSession`。
- 会话复用规则为 `imGroupId + ak + ACTIVE`。

### 3. Mini Bar 接入方式

通过 `onSessionStatusChange` 监听执行状态，并在用户点击停止时调用 `stopSkill`：

```ts
sdk.onSessionStatusChange({
  welinkSessionId,
  callback: ({ status }) => updateMiniBar(status)
});

await sdk.stopSkill({ welinkSessionId });
```

小程序最小化和关闭可以通过以下接口控制：

```ts
sdk.onSkillWecodeStatusChange({
  callback: ({ status }) => console.log("miniapp status:", status)
});

await sdk.controlSkillWeCode({ action: "minimize" });
await sdk.controlSkillWeCode({ action: "close" });
```

### 4. Skill MiniApp 接入方式

典型能力调用如下：

```ts
sdk.registerSessionListener({
  welinkSessionId,
  onMessage: renderStreamMessage,
  onError: console.error
});

const history = await sdk.getSessionMessage({
  welinkSessionId,
  page: 0,
  size: 50
});

await sdk.sendMessage({
  welinkSessionId,
  content: "继续上一次的回答"
});

await sdk.regenerateAnswer({ welinkSessionId });

await sdk.replyPermission({
  welinkSessionId,
  permId: "perm_001",
  response: "once"
});

await sdk.sendMessageToIM({
  welinkSessionId,
  messageId: 123
});
```

说明：

- `getSessionMessage` 返回“服务端历史消息 + 本地流式缓存”合并后的结果。
- `sendMessageToIM` 会优先发送指定 `messageId` 的最终完整内容；若未传 `messageId`，则发送最新一条可发送的完整消息。
- `closeSkill()` 只关闭 WebSocket 连接，不删除服务端会话，本地缓存也会保留。

## miniApp 说明

`miniApp` 为独立工程，测试页中的“小程序打开”能力会加载其构建产物。

如果修改了 `miniApp/src` 下代码，需要重新构建 `miniApp`，再同步产物到 `public/miniapp`，测试页中加载的内容才会更新。

## 运行测试

```bash
npm test
```

## 构建

主工程构建：

```bash
npm run build
```

`miniApp` 构建：

```bash
cd miniApp
npm run build
```
