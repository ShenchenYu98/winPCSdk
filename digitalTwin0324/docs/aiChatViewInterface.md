# aiChatView 接口文档

## 概述

aiChatView 接口文档 描述了助理CUI需要用到的接口

---

## 1. 查询个人助理列表（服务端）

### 接口说明

从服务端获取用户创建的个人助理列表；

### 接口名

```typescript
const res = await window.Pedesstal.callMethod('method://agentSkills/getWeAgentList',{
  pageSize: 20,
  pageNumber: 1
})
```

### 入参

| 参数名     | 类型   | 必填 | 说明                         |
| ---------- | ------ | ---- | ---------------------------- |
| pageSize   | number | 是   | 分页大小，最小值1，最大值100 |
| pageNumber | number | 是   | 页码，最小值1，最大值1000    |

### 入参示例

```json
{
  "pageSize": 1,
  "pageNumber": 1
}
```

### 出参

| 参数名  | 类型           | 说明                  |
| ------- | -------------- | --------------------- |
| content | Array<WeAgent> | 用户创建的WeAgent列表 |

### 出参示例

```json
{
  "content": [
    {
      "name": "员工助手",
      "icon": "http:www.test.com/xxx",
      "description": "我是xxx",
      "partnerAccount": "x00_1",
      "bizRobotName": "员工助手",
      "bizRobotNameEn": "yuangongzhushou",
    },
    {
      "name": "小微助手",
      "icon": "http:www.test.com/aaa",
      "description": "我是xxx",
      "partnerAccount": "x00_1",
      "bizRobotName": "钉钉One",
      "bizRobotNameEn": "dingdingOne",
    },
  ]
}
```

---

## 2. 获取助理详情（服务端）

### 接口说明

从服务端获取某个助理的详细信息；

### 接口名

```typescript
const res = await window.Pedesstal.callMethod('method://agentSkills/getWeAgentDetails',{
  partnerAccount: 'x_001'
})
```

### 入参

| 参数名         | 类型   | 必填 | 说明   |
| -------------- | ------ | ---- | ------ |
| partnerAccount | string | 是   | 助理ID |

### 入参示例

```json
{
  "partnerAccount": "x00_1"
}
```

### 出参

| 参数名          | 类型   | 说明                    |
| --------------- | ------ | ----------------------- |
| name            | string | 助理名称                |
| icon            | string | 助理图标                |
| desc     | string | 助理简介                |
| moduleId     | string | 助理对应的模块Id                |
| appKey           | string | 助理ak     |
| appSecret       | string | 助理sk                  |
| partnerAccount  | string | 助理ID                  |
| createdBy       | string | 创建者的weLinkId        |
| creatorName     | string | 创建者名称              |
| creatorNameEn     | string | 创建者英文名称              |
| creatorWorkId   | string | creatorWorkId         |
| ownerWelinkId   | string | 助理责任人ID            |
| ownerName       | string | 助理责任人名称          |
| ownerNameEn     | string | 助理责任人英文名称      |
| ownerDeptName   | string | 助理责任部门中文名      |
| ownerDeptNameEn | string | 助理责任部门英文名      |
| bizRobotId      | string | agent对应的业务机器人id |
| weCodeUrl      | string | We码地址 |

### 出参示例

```json
{
  "name": "员工助手",
  "icon": "http:www.test.com/xxx",
  "desc": "我是xxx",
  "moduleId": "M1000",
  "partnerAccount": "x00_1",
  "appKey": "",
  "appSecret": "",
  "createdBy": "",
  "creatorName": "",
  "creatorNameEn": "",
  "creatorWorkId": "",
  "ownerWelinkId": "",
  "ownerName": "",
  "ownerNameEn": "",
  "ownerDeptName": "",
  "ownerDeptNameEn": "",
  "bizRobotId": "",
  "weCodeUrl": "https://xxx"
}
```

## 3. 查询个人助理列表（DB）

### 接口说明

从DB获取用户创建的个人助理列表；

### 接口名

```typescript
const resString = await window.Pedesstal.callMethod('method://agentSkills/saveDb',{
    type:'query',
    params:{
      key: 'WeAgentList'
    }
  })
const resObject = JSON.parse(resString);
```

### 出参

| 参数名  | 类型           | 说明                  |
| ------- | -------------- | --------------------- |
| content | Array<WeAgent> | 用户创建的WeAgent列表 |

### 出参示例

```json
{
  "content": [
    {
      "name": "员工助手",
      "icon": "http:www.test.com/xxx",
      "description": "我是xxx",
      "partnerAccount": "x00_1",
      "bizRobotName": "员工助手",
      "bizRobotNameEn": "yuangongzhushou",
    },
    {
      "name": "小微助手",
      "icon": "http:www.test.com/aaa",
      "description": "我是xxx",
      "partnerAccount": "x00_1",
      "bizRobotName": "钉钉One",
      "bizRobotNameEn": "dingdingOne",
    },
  ]
}
```

---

## 4. 获取当前助理详情（DB）

### 接口说明

从DB获取当前助理的详细信息；

### 接口名

```typescript
const resString = await window.Pedesstal.callMethod('method://agentSkills/saveDb',{
    type:'query',
    params:{
      key: 'currentWeAgentDetails'
    }
  })

const resObject = JSON.parse(resString);
```

### 出参

| 参数名          | 类型   | 说明                    |
| --------------- | ------ | ----------------------- |
| name            | string | 助理名称                |
| icon            | string | 助理图标                |
| desc     | string | 助理简介                |
| moduleId     | string | 助理对应的模块Id                |
| appKey           | string | 助理ak     |
| appSecret       | string | 助理sk                  |
| partnerAccount  | string | 助理ID                  |
| createdBy       | string | 创建者的weLinkId        |
| creatorName     | string | 创建者名称              |
| creatorNameEn     | string | 创建者英文名称              |
| creatorWorkId   | string | creatorWorkId         |
| ownerWelinkId   | string | 助理责任人ID            |
| ownerName       | string | 助理责任人名称          |
| ownerNameEn     | string | 助理责任人英文名称      |
| ownerDeptName   | string | 助理责任部门中文名      |
| ownerDeptNameEn | string | 助理责任部门英文名      |
| bizRobotId      | string | agent对应的业务机器人id |
| weCodeUrl      | string | We码地址 |

### 出参示例

```json
{
  "name": "员工助手",
  "icon": "http:www.test.com/xxx",
  "desc": "我是xxx",
  "moduleId": "M1000",
  "partnerAccount": "x00_1",
  "appKey": "",
  "appSecret": "",
  "createdBy": "",
  "creatorName": "",
  "creatorNameEn": "",
  "creatorWorkId": "",
  "ownerWelinkId": "",
  "ownerName": "",
  "ownerNameEn": "",
  "ownerDeptName": "",
  "ownerDeptNameEn": "",
  "bizRobotId": "",
  "weCodeUrl": "https://xxx"
}
```

## 5. 存储当前助理详情（DB）

### 接口说明

把当前助理详情存储到DB；

### 接口名

```typescript
const res = await window.Pedesstal.callMethod('method://agentSkills/saveDb',{
    type:'add',
    params:{
      key: 'currentWeAgentDetails',
      value: JSON.stringfy(WeAgentDetails)
    }
  })
```

---

## 6. 存储当前用户已创建助理列表（DB）

### 接口说明

存储当前用户已创建助理列表到DB；

### 接口名

```typescript
const res = await window.Pedesstal.callMethod('method://agentSkills/saveDb',{
    type:'add',
    params:{
      key: 'WeAgentList',
      value: JSON.stringfy(WeAgentList)
    }
  })
```