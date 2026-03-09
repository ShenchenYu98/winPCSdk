# AI Chat Viewer (小程序版本)

基于 JSAPI 的小程序 AI 问答展示项目，使用 React 18.3 + TypeScript 开发。

## 功能特点

- 🔗 **JSAPI 集成**: 完整实现 Skill SDK JSAPI 接口
- 📝 **Markdown 渲染**: 基于 marked + shiki 的代码高亮
- 💬 **流式输出**: 实时接收并渲染 AI 响应流
- 📊 **会话管理**: 自动获取历史消息和会话监听
- 🎨 **简洁界面**: 标题区、内容区、操作区三部分布局

## JSAPI 接口实现

### 已实现接口

| 接口 | 说明 |
|------|------|
| getSessionMessage | 获取会话历史消息 |
| registerSessionListener | 注册会话监听器 |
| sendMessage | 发送消息触发 AI 回答 |
| stopSkill | 停止技能生成 |
| sendMessageToIM | 发送 AI 结果到 IM |
| controlSkillWeCode | 控制小程序（关闭/最小化） |

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

访问：`http://localhost:3000?sessionid=your-session-id`

## URL 参数

| 参数 | 说明 |
|------|------|
| sessionid | 会话 ID（必填） |
| sessionId | 会话 ID（兼容） |

## 使用流程

1. **打开小程序**: URL 携带 sessionid 参数
2. **查看历史**: 自动调用 getSessionMessage 获取历史消息
3. **发送消息**: 点击"生成"调用 sendMessage，监听流式响应
4. **停止生成**: 点击"停止"调用 stopSkill
5. **发送到 IM**: 点击 AI 消息的"发送"调用 sendMessageToIM
6. **控制小程序**: 点击放大/缩小或关闭按钮调用 controlSkillWeCode
