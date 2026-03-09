# Skill SDK

This workspace contains the first implementation pass for the Skill SDK project
defined in the documents under `docs`.

## Structure

- `src/sdk`: Skill SDK feature code
- `src/app`: local demo chat page
- `tests`: unit tests
- `mocks`: local Mock Skill Server

## Install

```bash
npm install
```

## Start the mock server

```bash
npm run mock:server
```

Behavior:

- If `MOCK_SERVER_PORT` is provided, the server uses that port.
- If `MOCK_SERVER_PORT` is not provided, the OS assigns a free port dynamically.
- After startup, the server writes the actual address into `public/mock-server-runtime.json`.

PowerShell example with an explicit port:

```powershell
$env:MOCK_SERVER_PORT=8788
npm run mock:server
```

## Start the demo page

The demo page first reads `public/mock-server-runtime.json`, so it can follow the
actual mock port automatically.

```bash
npm run dev
```

You can still override addresses manually:

```powershell
$env:VITE_SKILL_SERVER_BASE_URL='http://localhost:8788'
$env:VITE_SKILL_SERVER_WS_URL='ws://localhost:8788/ws/skill/stream'
npm run dev
```

## SDK Integration Guide

### 1. Initialize the SDK

Browser side:

```ts
import { getSharedBrowserSkillSdk } from "./src/sdk";

const sdk = getSharedBrowserSkillSdk({
  baseUrl: "http://localhost:8787",
  wsUrl: "ws://localhost:8787/ws/skill/stream"
});
```

For IM area and Miniapp area inside the same browser runtime, reuse the shared
singleton instead of calling `createBrowserSkillSdk()` separately in each
component. That keeps one SDK instance, one cache, and one WebSocket channel.

If you are integrating in another runtime, use `SkillSdk` directly and provide a
custom `connectionFactory`.

### 2. IM Chat Window: first trigger flow

Recommended call order for the first trigger:

```ts
const session = await sdk.createSession({
  ak: "ak_xxxxxxxx",
  title: "Create a React project",
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
  content: "Please help me scaffold a React project"
});
```

Notes:

- `createSession` only creates or reuses the session and ensures the connection.
- The first AI execution is triggered by `sendMessage`, not by `createSession`.
- Session reuse follows `imGroupId + ak + ACTIVE`.

### 3. Mini Bar integration

Use `onSessionStatusChange` to drive `executing / completed / stopped` display,
and call `stopSkill` when the user clicks Stop.

```ts
sdk.onSessionStatusChange({
  welinkSessionId,
  callback: ({ status }) => updateMiniBar(status)
});

await sdk.stopSkill({ welinkSessionId });
```

Use `controlSkillWeCode` and `onSkillWecodeStatusChange` for close/minimize:

```ts
sdk.onSkillWecodeStatusChange({
  callback: ({ status }) => console.log("miniapp status:", status)
});

await sdk.controlSkillWeCode({ action: "minimize" });
await sdk.controlSkillWeCode({ action: "close" });
```

### 4. Skill Miniapp integration

Typical miniapp capabilities:

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
  content: "Continue the previous answer"
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

Notes:

- `getSessionMessage` returns server history merged with in-memory streaming cache.
- `sendMessageToIM` uses the final cached content of the specified message, or the
  latest final message if `messageId` is omitted.
- `closeSkill()` only closes the WebSocket connection; it does not delete the
  server session, and local message cache is retained.

## Test

```bash
npm test
```
