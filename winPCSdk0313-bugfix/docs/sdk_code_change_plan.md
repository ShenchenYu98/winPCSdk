# SDK Code Change Plan

## Purpose

This document captures the concrete code-level changes needed in `src/` based on:

- `docs/SkillClientSdkInterfaceV6_V7_diff_checklist.md`
- current SDK implementation
- agreed constraints in the discussion

Agreed constraints:

- `onSessionStatusChange` is intentionally not changed in this round.
- `regenerateAnswer()` only needs connection establishment at the SDK entry.
- In `getSessionMessage`, except for the locally aggregated message inserted at `content[0]`, all other messages must keep the exact service-side return order.
- In `getSessionMessage`, the service-side response is already time-descending, and the SDK must not sort it again.

## File-Level Change Plan

### `src/SkillSdk.ts`

- Update `stopSkill()` to connect before calling REST:

```ts
async stopSkill(params: StopSkillParams): Promise<StopSkillResult> {
  await this.connectionManager.ensureConnected();
  const result = await this.client.abortSession(params.welinkSessionId);
  this.connectionManager.emitStatus(params.welinkSessionId, { status: "stopped" });
  return result;
}
```

- Update `regenerateAnswer()` to connect only at entry:

```ts
async regenerateAnswer(params: RegenerateAnswerParams): Promise<SendMessageResult> {
  await this.connectionManager.ensureConnected();
  return this.orchestrator.regenerateAnswer(params);
}
```

- Update `sendMessageToIM()` to connect before orchestrator call:

```ts
async sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResult> {
  await this.connectionManager.ensureConnected();
  return this.orchestrator.sendMessageToIM(params);
}
```

- Update `getSessionMessage()` to connect before orchestrator call:

```ts
async getSessionMessage(params: GetSessionMessageParams): Promise<PageResult<SessionMessage>> {
  await this.connectionManager.ensureConnected();
  return this.orchestrator.getSessionMessage(params);
}
```

- Update `replyPermission()` to connect before orchestrator call:

```ts
async replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResult> {
  await this.connectionManager.ensureConnected();
  return this.orchestrator.replyPermission(params);
}
```

### `src/types.ts`

- Add `isFirst?: boolean` to `GetSessionMessageParams`:

```ts
export interface GetSessionMessageParams {
  welinkSessionId: string;
  page?: number;
  size?: number;
  isFirst?: boolean;
}
```

- `PageResult<T>` does not need structural changes because it already uses:

```ts
export interface PageResult<T> {
  content: T[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}
```

### `src/core/sessionOrchestrator.ts`

- Keep `regenerateAnswer()` connection-free at this layer. Entry-level connection establishment in `SkillSdk` is sufficient.

- Change `getSessionMessage()` to branch on `isFirst`:

```ts
async getSessionMessage(params: GetSessionMessageParams): Promise<PageResult<SessionMessage>> {
  validateSessionId(params.welinkSessionId);

  const page = params.page ?? 0;
  const size = params.size ?? 50;
  const isFirst = params.isFirst ?? false;

  const history = await this.client.getSessionMessages(params.welinkSessionId, page, size);

  if (!isFirst) {
    this.cacheStore.applyHistory(params.welinkSessionId, history.content);
    return history;
  }

  return this.cacheStore.toFirstFetchPageResult(params.welinkSessionId, history);
}
```

### `src/core/messageCacheStore.ts`

- Do not use merged-and-resorted results as the outward `getSessionMessage()` page result anymore.

- Replace the current pagination-merging behavior with a first-fetch-only helper:

```ts
toFirstFetchPageResult(
  sessionId: string,
  historyPage: PageResult<SessionMessage>
): PageResult<SessionMessage> {
  this.applyHistory(sessionId, historyPage.content);

  const localMessage = this.getLatestAggregatedMessage(sessionId);

  if (!localMessage) {
    return historyPage;
  }

  const contentWithoutDuplicate = historyPage.content.filter(
    (message) => message.id !== localMessage.id
  );

  return {
    content: [localMessage, ...contentWithoutDuplicate],
    page: historyPage.page,
    size: historyPage.size,
    total: historyPage.total,
    totalPages: historyPage.totalPages
  };
}
```

- Add a helper for the latest local aggregated message:

```ts
getLatestAggregatedMessage(sessionId: string): SessionMessage | undefined {
  const sessionStore = this.sessions.get(sessionId);

  if (!sessionStore || sessionStore.size === 0) {
    return undefined;
  }

  const latest = [...sessionStore.values()].sort(compareCachedMessagesByLatest)[0];
  return latest ? toSessionMessage(latest) : undefined;
}
```

- Add a latest-message comparator. Prefer `createdAt`, then fall back to `seq/messageSeq`:

```ts
function compareCachedMessagesByLatest(left: CachedMessage, right: CachedMessage): number {
  const leftTime = Date.parse(left.createdAt || "");
  const rightTime = Date.parse(right.createdAt || "");

  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  const leftSeq = left.seq ?? Number.MIN_SAFE_INTEGER;
  const rightSeq = right.seq ?? Number.MIN_SAFE_INTEGER;
  if (leftSeq !== rightSeq) {
    return rightSeq - leftSeq;
  }

  const leftMessageSeq = left.messageSeq ?? Number.MIN_SAFE_INTEGER;
  const rightMessageSeq = right.messageSeq ?? Number.MIN_SAFE_INTEGER;
  return rightMessageSeq - leftMessageSeq;
}
```

- Keep `getMergedMessages()`, `trackOrder()`, `compareCachedEntries()`, and `compareBySequence()` only for cache-internal support if still needed, but do not let them determine outward `getSessionMessage()` ordering.

- Stop using the current `toPageResult()` for outward message retrieval, because it currently:
  - merges history and local cache
  - re-sorts them
  - re-slices by page
  - recalculates `total`
  - recalculates `totalPages`

Those behaviors are not compatible with the target semantics.

### `src/client/skillServerClient.ts`

- No changes required for now.

- `isFirst` remains an SDK-side behavior switch and does not need to be passed to the service if the service contract is unchanged.

## Expected Behavior After Changes

- When `isFirst=false`:
  - fetch page from service
  - cache `history.content`
  - return service result directly
  - do not re-sort
  - do not recalculate pagination metadata

- When `isFirst=true`:
  - fetch page from service
  - cache `history.content`
  - compute one latest local aggregated message
  - insert it at `content[0]`
  - deduplicate by `id` if the same message already exists in the service page
  - keep all remaining messages in the exact service-side order
  - preserve `page/size/total/totalPages` from the service response
