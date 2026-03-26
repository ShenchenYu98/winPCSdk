# WeAgent用户旅程和数据流转

本文档用于说明WeAgent模块的用户旅程，以及UI交互过程中UI层和SDK层之间的数据交互；

## 初次进入WeAgent
1、初次进入WeAgent模块时会展示功能介绍页；是否初次进入通过客户端通过读取存储进行判断；若是首次进入则展示功能介绍页；如果不是则直接展示助理聊天页面；
  ```typescript
  // 查询是否首次进入WeAgent
  window.Pedesstal.callMethod('method://agentSkills/saveDb',{
    type:'query',
    params:{
      key: 'isFirstOpenWeAgent'
    }
  })
  // 如果不是，即DB查询不到对应key的数据，则新增DB存储
  window.Pedesstal.callMethod('method://agentSkills/saveDb',{
    type:'add',
    params:{
      key: 'isFirstOpenWeAgent',
      value: 'false'
    }
  })
  ```
2、在功能介绍页，会有`选择助理`的按钮，点击后会跳转到`启用助理`页；跳转到`启用助理`页前会调用接口`getWeAgentList`判断用户是否创建过助理，若创建过才跳转到`启用助理`页；若没有创建过则跳转到`创建助理`页；

3、若是跳转到`启用助理`页：

选择启用某个助理后，调用`getWeAgentDetails`获取助理详情，然后将详情存储DB；
  ```typescript
  // 助理详情存储DB
  window.Pedesstal.callMethod('method://agentSkills/saveDb',{
    type:'add',
    params:{
      key: 'currentWeAgentDetails',
      value: JSON.stringfy(WeAgentDetails)
    }
  })
  ```
跳转到对应助理聊天页时，查询DB中当前助理详情，更新导航栏中助理头像和简介
  ```typescript
  // DB查询助理详情
  window.Pedesstal.callMethod('method://agentSkills/saveDb',{
    type:'query',
    params:{
      key: 'currentWeAgentDetails'
    }
  })
  ```

4、若是跳转到`创建助理`页：

创建完助理后，调用`getWeAgentDetails`获取助理详情，然后将详情存储DB；
  ```typescript
  // 助理详情存储DB
  window.Pedesstal.callMethod('method://agentSkills/saveDb',{
    type:'add',
    params:{
      key: 'currentWeAgentDetails',
      value: JSON.stringfy(WeAgentDetails)
    }
  })
  ```
助理创建完后会跳转到对应助理聊天页面，查询DB中当前助理详情，更新导航栏中助理头像和简介；

5、在首次进入WeAgent模块的前提下，跳转到助理聊天页会进行模块功能引导，此时需要展示对应引导UI；

## 核心交互
核心交互指的就是和助理的聊天交互

1、非首次进入WeAgent模块，且和助理聊天过，再次进入WeAgent模块时，展示的是上次离开时的助理聊天页面；

2、首次进入助理的聊天页面时，调用`getHistorySessionsList`获取当前用户历史会话列表，若列表为空，则调用`createNewSession`创建新会话ID，若不为空，会选取最近更新的会话ID为当前会话ID；

3、非首次进入助理聊天页面时，调用`getHistorySessionsList`获取当前用户历史会话列表，会选取最近更新的会话ID为当前会话ID；

4、在助理聊天页面进行助理切换