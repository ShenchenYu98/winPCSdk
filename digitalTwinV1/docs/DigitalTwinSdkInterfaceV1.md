# Digital SDK 接口文档

## 概述

Digital SDK 是 分身创建小程序和分身服务端交互的中间层SDK，负责两者之间的网络请求交互：

---
## 服务端接口域名和文根
测试环境: https://api.assistant.testuat.testWei.com/assistant-api

## 1. 创建分身

### 接口说明

根据分身小程序传入的名称，简介和头像地址，调用服务端接口创建一个新的分身；

### 接口名

```typescript
createDigitalTwin(params: CreateDigitalTwinParams): Promise<CreateResult>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| name | string | 是 | 分身名称 |
| icon | string | 是 | 分身头像地址 |
| description | string | 是 | 分身简介 |
| weCrewType | number | 是 | 分身类型: 1为内部分身,0为自定义分身 |
| bizRobotId | string | 否 | 内部助手业务机器人Id |

### 入参示例

```json
{
  "name": "分身小白",
  "icon": "/mcloud/xxx",
  "description": "数字分身小白能做...",
  "weCrewType": 1,
  "bizRobotId": "员工助手"
}
```

### 接口出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `data` | object | 分身信息 |
| `data.robotId` | string | 分身机器人ID |
| `data.partnerAccount` | string | 分身的partnerAccount |
| `message` | String | 消息，接口正常是`success` |

### 接口出参示例

```json
{
  "data": {
    "robotId": "860306",
    "partnerAccount": "x00123456"
  },
  "message": "success",
}
```

### 实现方法
1. 调用服务端 REST API 创建数字分身：
   - **URL**: `POST /v4-1/we-crew/im-register`
   - **请求体**:
     ```json
     {
        "name": "分身小白",
        "icon": "/mcloud/xxx",
        "description": "数字分身小白能做...",
        "weCrewType": 1,
        "bizRobotId": "员工助手"
     }
     ```
    - **服务端接口响应**:
    ```json
     {
        "code": 200,
        "data": {
          "robotId": "860306",
          "partnerAccount": "x00123456"
        },
        "message": "success",
        "error": ""
     }
     ```
     - **服务端接口异常响应**:
     | HttpCode | code | error |
     |--------|------|------|
     | 429 | 587013 | 请求太频繁 |
     | 500 | 587014 | 创建数字分身失败 |
     | 500 | 587015 | 创建数字分身达到上限 |
     | 400 | 587016 | 没有数字分身的权限 |
     


---

## 2. 获取助理类型

### 接口说明

获取分身创建时支持的agent类型；

### 接口名

```typescript
getAgentType(): Promise<AgentTypeList>
```

### 入参

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| 无 | 无 | 无 | 无 |

### 出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| content | Array<AgentType> | 支持的agent类型列表 |

### 出参示例

```json
{
  "content": [
    {
      "name": "员工助手",
      "icon": "http:www.test.com/xxx",
      "bizRobotId": "8041241"
    },
    {
      "name": "小微助手",
      "icon": "http:www.test.com/aaa",
      "bizRobotId": "8041241"
    },
  ]
}
```

### 实现方法

1. 调用服务端 REST API 获取支持的agent列表：
   - **URL**: `GET /v4-1/we-crew/inner-assistant/list`
    - **服务端接口响应**:
    ```json
      {
        "code": 200,
        "data": [
          {
            "name": "员工助手",
            "icon": "http:www.test.com/xxx",
            "bizRobotId": "8041241"
          },
          {
            "name": "小微助手",
            "icon": "http:www.test.com/aaa",
            "bizRobotId": "8041241"
          },
        ],
        "message": "success",
        "error": ""
      }
      ```

---

## 数据类型定义

### AgentType

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | agent名称 |
| icon | string | agent图标 |
| bizRobotId | string | agent对应的业务机器人id |