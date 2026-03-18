# Digital SDK 接口文档

## 概述

Digital SDK 是 分身创建小程序和分身服务端交互的中间层SDK，负责两者之间的网络请求交互：

---

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
| name | String | 是 | 分身名称 |
| icon | String | 是 | 分身头像地址 |
| description | String | 是 | 分身简介 |
| digitalTwintype | string | 是 | 分身类型: `internal`为内部分身,`custom`为自定义分身 |
| agentType | string | 否 | agent类型 |

### 入参示例

```json
{
  "name": "分身小白",
  "icon": "/mcloud/xxx",
  "description": "数字分身小白能做...",
  "digitalTwintype": "internal",
  "agentType": "员工助手"
}
```

### 接口出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| `data` | String | 分身ID |
| `message` | String | 消息，接口正常是`success` |

### 接口出参示例

```json
{
  "data": "42325235235",
  "message": "success",
}
```

### 实现方法
1. 调用服务端 REST API 创建数字分身：
   - **URL**: `POST /api/skill/sessions`
   - **请求体**:
     ```json
     {
        "name": "分身小白",
        "icon": "/mcloud/xxx",
        "description": "数字分身小白能做...",
        "digitalTwintype": "internal",
        "agentType": "员工助手"
     }
     ```
    - **服务端接口响应**:
    ```json
     {
        "code": 200,
        "data": "860424124",
        "message": "success",
        "error": ""
     }
     ```

### 错误处理

| 错误码 | 错误消息 | 说明 |
|--------|----------|------|
| 1000 | 无效的参数 | 缺少必填参数或参数格式错误 |
| 6000 | 网络错误 | REST API 连接失败或网络请求失败 |
| 7000 | 服务端错误 | 服务端接口返回异常结果 |

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
| agentTypeList | Array<AgentType> | 支持的agent类型列表 |

### 出参示例

```json
{
  "agentTypeList": [
    {
      "agentName": "员工助手",
      "agentIcon": "http:www.test.com/xxx"
    },
    {
      "agentName": "小微助手",
      "agentIcon": "http:www.test.com/aaa"
    },
  ]
}
```

### 实现方法

1. 调用服务端 REST API 获取支持的agent列表：
   - **URL**: `GET /api/skill/getAgentType`
    - **服务端接口响应**:
    ```json
      {
        "code": 200,
        "data": "860424124",
        "message": "success",
        "error": ""
      }
      ```

---

## 数据类型定义

### AgentType

| 字段 | 类型 | 说明 |
|------|------|------|
| agentName | string | agent名称 |
| agentIcon | string | agent图标 |