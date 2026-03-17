# SkillClientSdkInterface V6-V7 Diff Checklist

## Scope

This checklist captures the final document changes needed to align `SkillClientSdkInterfaceV6.md` with the agreed subset of `SkillClientSdkInterfaceV7.md`.

Agreed constraints:

- `onSessionStatusChange` does not need to be changed for now.
- For WebSocket connection wording, use:
  `调用服务端 REST API 前先检查 WebSocket是否建连，未连接则先建连`
- In `getSessionMessage`, the service-side response order is guaranteed to be time-descending; the SDK does not sort it again.

## Required Changes

- In [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L105), update `createSession` implementation step 2 to:
  `调用服务端 REST API 前先检查 WebSocket是否建连，未连接则先建连；然后查询会话列表。`

- In [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L280), add a new prerequisite step in `stopSkill`:
  `调用服务端 REST API 前先检查 WebSocket是否建连，未连接则先建连。`
  Then shift the following step numbers.

- In [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L519), update the `regenerateAnswer` implementation so the REST call is preceded by:
  `调用服务端 REST API 前先检查 WebSocket是否建连，未连接则先建连。`

- In [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L624), add a step before the REST call in `sendMessageToIM`:
  `调用服务端 REST API 前先检查 WebSocket是否建连，未连接则先建连。`

- In [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L752), update the `getSessionMessage` section:
  - Add a note:
    `新增 isFirst 入参用于区分首次获取与后续分页获取。`
  - Add `isFirst | boolean | 否 | false | ...` to the params table.
  - Update the response table so that:
    - `content`: historical message list, and service-side return order is time-descending
    - `page`: passthrough from service-side response
    - `size`: passthrough from service-side response
    - `total`: passthrough from service-side response
    - `totalPages`: passthrough from service-side response
  - Update "获取历史消息" to:
    `调用服务端 REST API 前先检查 WebSocket是否建连，未连接则先建连，然后再请求历史消息。`
  - Update "返回结果" to state:
    - service-side historical messages are already returned in time-descending order, and the SDK does not sort them again
    - when `isFirst=false`, return the service-side result directly
    - when `isFirst=true`, merge local streaming cache
    - insert the locally aggregated message at `content[0]`
    - except for the inserted first message, all remaining messages keep the original service-side order
    - `page/size/total/totalPages` do not change because of the local first-item insertion
  - Update the `messageSeqOrder` comment to:
    `用于缓存合并的稳定消息 ID 列表（不作为对外返回顺序依据）`
  - Update "实时消息处理" to:
    `当调用 getSessionMessage 且 isFirst=true 时，SDK 会将这些实时消息与历史消息合并后返回。`
  - Update "数据一致性保证" to include:
    - first-fetch control
    - pagination metadata passthrough
    - order guarantee should be described as: service-side order is passed through, SDK does not do secondary sorting, and when `isFirst=true` the local aggregated message is fixed at `content[0]`
  - Update the example:
    - add `isFirst: true`
    - change `result.totalElements` to `result.total`
    - change `result.number` to `result.page`

- In [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L1166), update `sendMessage` wording from:
  `检查 WebSocket 连接状态，若未建立则自动建立`
  to:
  `检查 WebSocket是否建连，若未连接则自动建连`

- In [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L1274), add a prerequisite step in `replyPermission`:
  `调用服务端 REST API 前先检查 WebSocket是否建连，未连接则先建连。`

- In [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L1448), add the `isFirst` field to `GetSessionMessageParams`.

- In [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L1528), update `PageResult<T>` so the `total` description changes from `总消息数` to `总记录数`.

## Differences Intentionally Kept

- [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L328) to [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L370): `onSessionStatusChange`
  This section stays different from V7 for now and should not be modified in this round.

## Easy-To-Miss Follow-Ups

- In [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L902), change `result.totalElements` to `result.total`.

- In [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L903), change `result.number` to `result.page`.

- In [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L770) and [SkillClientSdkInterfaceV6.md](D:\featProject\gitHub\winPCSdk\winPCSdk0313-bugfix\docs\SkillClientSdkInterfaceV6.md#L1535), unify `总消息数` to `总记录数`.
