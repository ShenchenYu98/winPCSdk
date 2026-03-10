# Skill SDK

本工程用于实现和验证 Skill SDK，`docs` 目录下提供了产品需求、架构设计、方案设计和实施计划等文档。

## 目录说明

- `src/sdk`：SDK 正式功能代码
- `test-app`：本地测试页面
- `miniApp`：MiniApp 工程源码
- `tests`：单元测试
- `mocks/server`：本地 Mock Server
- `mocks/runtime`：基于 `mock.json` 的本地模拟运行时
- `mocks/mock.json`：`mock.json` 模拟数据

## 安装依赖

```bash
npm install
```

## 本地启动

### 启动测试页面

```bash
npm run dev
```

### 启动 Mock Server

```bash
npm run mock:server
```

说明：

- 如果设置了 `MOCK_SERVER_PORT`，Mock Server 会使用指定端口。
- 如果没有设置 `MOCK_SERVER_PORT`，系统会自动分配空闲端口。
- 启动后会把实际地址写入 `public/mock-server-runtime.json`，测试页面会自动读取。

PowerShell 示例：

```powershell
$env:MOCK_SERVER_PORT=8788
npm run mock:server
```

## 两种 Mock 验证方式

当前支持两种验证方式，可以根据场景选择。

### 方式一：Mock Server

适用场景：

- 需要验证真实 REST API 请求流程
- 需要验证真实 WebSocket 连接与流式消息
- 需要验证停止技能、发送到 IM 等服务端交互

使用方式：

1. 运行 `npm run mock:server`
2. 再运行 `npm run dev`
3. 在测试页面选择 `Mock Server`

### 方式二：mock.json 本地模拟

适用场景：

- 不想单独启动本地服务
- 只想快速验证 SDK 调用链路和页面交互
- 需要快速修改历史消息、流式内容和状态变化

相关文件：

- 模拟数据：[mocks/mock.json](D:/featProject/gitHub/winPCSdk/winPCSdkV4/mocks/mock.json)
- 模拟运行时：[fixtureSkillSdk.ts](D:/featProject/gitHub/winPCSdk/winPCSdkV4/mocks/runtime/fixtureSkillSdk.ts)

使用方式：

1. 直接运行 `npm run dev`
2. 在测试页面选择 `Mock JSON`
3. 如需修改模拟数据，直接编辑 `mocks/mock.json`

说明：

- `mock.json` 模式下不会启动本地 REST 服务，也不会建立真实 WebSocket。
- 宿主测试页和 MiniApp 会共享同一套本地模拟运行时状态。

## SDK 导出说明

当前主入口为 [index.ts](D:/featProject/gitHub/winPCSdk/winPCSdkV4/src/sdk/index.ts)，主要导出如下：

- `SkillSdk`
- `createBrowserSkillSdk`
- `getSharedBrowserSkillSdk`
- `resetSharedBrowserSkillSdk`
- 各类类型定义，例如 `SkillSdkApi`、`SkillSession`、`StreamMessage`

## SDK 接入指导

### 1. 初始化方式

浏览器环境推荐优先使用共享单例：

```ts
import { getSharedBrowserSkillSdk } from "./src/sdk";

const sdk = getSharedBrowserSkillSdk({
  baseUrl: "http://localhost:8787",
  wsUrl: "ws://localhost:8787/ws/skill/stream"
});
```

也可以直接不传参数，SDK 会使用默认地址：

```ts
import { getSharedBrowserSkillSdk } from "./src/sdk";

const sdk = getSharedBrowserSkillSdk();
```

默认值为：

- `baseUrl`：`http://api.openplatform.hisuat.huawei.com/skill/api`
- `wsUrl`：`ws://api.openplatform.hisuat.huawei.com/skill/api/ws/skill/stream`

说明：

- `getSharedBrowserSkillSdk()` 的入参对象可选。
- `baseUrl` 和 `wsUrl` 也都可选，未传时使用默认值。
- 同一个浏览器运行时内，IM 聊天区和 MiniApp 区域建议共用同一个 `getSharedBrowserSkillSdk(...)` 单例。
- 如果想跳过单例，也可以直接使用 `createBrowserSkillSdk(...)` 创建独立实例。

### 2. 共享单例重置

如果需要丢弃当前共享实例，可以调用：

```ts
import { resetSharedBrowserSkillSdk } from "./src/sdk";

resetSharedBrowserSkillSdk();
```

建议顺序：

1. 先对旧实例调用 `closeSkill()`
2. 再调用 `resetSharedBrowserSkillSdk()`
3. 然后重新获取新的 SDK 实例

### 3. IM 聊天窗口首次触发推荐流程

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
  },
  onError: (error) => {
    console.error(error);
  }
});

await sdk.sendMessage({
  welinkSessionId: session.welinkSessionId,
  content: "请帮我初始化一个 React 项目"
});
```

说明：

- `createSession` 只负责创建或复用会话，并确保 WebSocket 已连接。
- 首次真正触发技能执行的是 `sendMessage`，不是 `createSession`。
- 会话复用规则为 `imGroupId + ak + ACTIVE`。

### 4. Mini Bar 接入方式

通过 `onSessionStatusChange` 监听执行状态，并在点击停止时调用 `stopSkill`：

```ts
sdk.onSessionStatusChange({
  welinkSessionId,
  callback: ({ status }) => {
    updateMiniBar(status);
  }
});

await sdk.stopSkill({ welinkSessionId });
```

小程序控制使用：

```ts
sdk.onSkillWecodeStatusChange({
  callback: ({ status }) => {
    console.log("miniapp status:", status);
  }
});

await sdk.controlSkillWeCode({ action: "minimize" });
await sdk.controlSkillWeCode({ action: "close" });
```

当前 `SkillWecodeStatus` 仅定义了两种值：

- `closed`
- `minimized`

### 5. MiniApp 接入方式

典型调用如下：

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
- `sendMessageToIM` 会优先发送指定 `messageId` 的最终完整内容；如果不传 `messageId`，则发送当前会话里最新一条可发送的完整消息。
- `closeSkill()` 只关闭 WebSocket 连接，不删除服务端会话，本地缓存也会保留。

### 6. HTTP 和 WebSocket 的发起方式

#### HTTP

HTTP 请求统一在 [skillServerClient.ts](D:/featProject/gitHub/winPCSdk/winPCSdkV4/src/sdk/client/skillServerClient.ts) 中通过浏览器原生 `fetch` 发起。

特点：

- 基于 `baseUrl + path`
- 有请求体时自动补 `Content-Type: application/json`
- 当前会统一附带请求头 `Cookie: cookie1`
- 网络错误和服务端错误会转换为 `SDKError`

#### WebSocket

WebSocket 连接在 [createBrowserSkillSdk.ts](D:/featProject/gitHub/winPCSdk/winPCSdkV4/src/sdk/browser/createBrowserSkillSdk.ts) 中通过浏览器原生 `new WebSocket(wsUrl)` 创建。

特点：

- 不是 SDK 初始化时立即建立
- 而是在 `createSession()` 或 `sendMessage()` 前，通过 `ensureConnected()` 懒建立连接
- 收到消息后会统一进入 `StreamConnectionManager`
- 然后分发给监听器，并映射出执行状态

### 7. 主要对外接口

当前 `SkillSdkApi` 对外能力如下：

- `createSession`
- `closeSkill`
- `stopSkill`
- `onSessionStatusChange`
- `onSkillWecodeStatusChange`
- `registerSessionListener`
- `unregisterSessionListener`
- `sendMessage`
- `getSessionMessage`
- `regenerateAnswer`
- `replyPermission`
- `sendMessageToIM`
- `controlSkillWeCode`

### 8. 错误返回

SDK 当前对外使用 `SDKError` 结构：

```ts
{
  errorCode: number;
  errorMessage: string;
}
```

常见场景：

- 参数错误
- 网络错误
- 服务端错误
- 本地缓存中缺少可用消息内容

## MiniApp 工程说明

当前测试页中的 MiniApp 不是通过 `iframe` 打开的，而是作为 React 组件直接挂载在宿主页中。  
这样宿主测试页和 MiniApp 在同一个浏览器运行时里，可以共享同一个 SDK 单例。

MiniApp 源码目录为：

- [miniApp/src](D:/featProject/gitHub/winPCSdk/winPCSdkV4/miniApp/src)

MiniApp 内部通过 [jsapi.ts](D:/featProject/gitHub/winPCSdk/winPCSdkV4/miniApp/src/services/jsapi.ts) 统一适配：

- 移动端且注入 `HWH5` 时，走 JSAPI
- 其他环境，走 SDK

## 测试

```bash
npm test
```

## 构建

主工程构建：

```bash
npm run build
```

MiniApp 构建：

```bash
cd miniApp
npm run build
```
