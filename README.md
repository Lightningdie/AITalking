# AI 流式对话应用

基于 SSE（Server-Sent Events）技术的 AI 流式对话应用，支持智谱 AI 和讯飞星火双平台，提供实时流式输出、代码高亮、对话导出等功能。

## 功能特性

- **多平台支持** - 智谱 AI / 讯飞星火一键切换
- **流式输出** - SSE 实时显示 AI 回复，打字机效果
- **非流式输出** - 支持一次性返回完整回复
- **代码高亮** - 支持 180+ 编程语言语法高亮
- **对话导出** - 导出对话记录为 Markdown 文件
- **断网重试** - 自动检测网络状态并重试
- **Token 统计** - 显示消耗的 Token 数量
- **上下文管理** - 可配置对话上下文轮数
- **响应式设计** - 移动端 / 桌面端自适应

## 技术栈

| 层级 | 技术选型 |
|------|----------|
| 前端 | React 18 + TypeScript + Vite 5 + highlight.js |
| 后端 | Node.js (原生 http/https 模块) |
| 通信协议 | SSE (Server-Sent Events) |
| 代码高亮 | highlight.js 11 |
| 代码规范 | ESLint + Prettier |

## 项目结构

```
project/
├── server/                   # Node.js 后端服务（模块化）
│   ├── index.js              # 主入口
│   ├── config/               # 配置文件
│   │   ├── api.config.js     # AI API 配置
│   │   ├── constants.js      # 常量配置
│   │   ├── mime.config.js    # MIME 类型
│   │   └── index.js          # 配置导出
│   ├── routes/               # 路由处理
│   │   ├── chat.js           # AI 聊天代理
│   │   ├── sse.js            # SSE 演示
│   │   ├── control.js        # 暂停/继续控制
│   │   ├── static.js         # 静态文件
│   │   └── index.js          # 路由导出
│   ├── services/             # 业务服务
│   │   ├── connection.js     # 连接状态管理
│   │   └── index.js          # 服务导出
│   └── utils/                # 工具函数
│       ├── request.js        # 请求处理
│       ├── response.js       # 响应处理
│       └── index.js          # 工具导出
├── react-chat/               # React 前端应用 (TypeScript)
│   ├── src/
│   │   ├── App.tsx           # 应用入口组件
│   │   ├── main.tsx          # React 挂载入口
│   │   ├── components/       # React 组件
│   │   │   ├── ChatBubble.tsx
│   │   │   ├── ChatContainer.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── CodeBlock.tsx
│   │   │   ├── MessageContent.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── index.ts
│   │   ├── hooks/            # 自定义 Hooks
│   │   │   ├── useChat.ts        # 聊天核心逻辑
│   │   │   ├── useLocalStorage.ts
│   │   │   └── index.ts
│   │   ├── types/            # TypeScript 类型定义
│   │   │   └── index.ts          # Message, UseChatConfig 等
│   │   └── styles/           # 样式文件
│   │       ├── components.css
│   │       ├── code-highlight.css
│   │       └── index.css
│   ├── tsconfig.json         # TypeScript 配置
│   ├── tsconfig.node.json    # Vite 配置文件的 TS 配置
│   └── vite.config.ts        # Vite 配置（含代理配置）
├── index.html                # SSE 演示页面
├── css/                      # SSE 演示样式
├── js/                       # SSE 演示逻辑
├── designDoc/                # 设计文档
│   ├── 功能设计文档.md
│   └── API接口文档.md
├── .vscode/
│   └── launch.json           # 调试配置
└── package.json
```

## 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm >= 7.0.0

### 安装依赖

```bash
# 安装所有依赖（根目录和 react-chat）
npm run install:all
```

### 启动服务

```bash
# 方式一：同时启动前后端（推荐）
npm run all

# 方式二：分别启动
npm run start        # 启动后端 http://localhost:3000
npm run react        # 启动前端 http://localhost:5173
```

### 访问地址

| 页面 | 地址 | 说明 |
|------|------|------|
| React 聊天 | http://localhost:5173 | AI 对话应用（推荐） |
| SSE 演示 | http://localhost:3000 | 打字机效果演示 |

## 前端开发命令

```bash
cd react-chat

npm run dev          # 启动开发服务器
npm run build        # 生产构建
npm run preview      # 预览生产构建
npm run typecheck    # TypeScript 类型检查
npm run lint         # ESLint 检查并修复
npm run format       # Prettier 格式化
```

## 支持的 AI 平台

### 智谱 AI

| 模型 | 说明 |
|------|------|
| glm-4.5-flash | GLM-4.5 Flash（免费） |
| glm-4-flash | GLM-4 Flash（免费） |
| glm-4-plus | GLM-4 Plus |
| glm-4 | GLM-4 |

### 讯飞星火

| 模型 | 说明 |
|------|------|
| lite | Spark Lite（免费） |
| generalv3 | Spark Pro |
| pro-128k | Spark Pro 128K |
| max-32k | Spark Max 32K |
| 4.0Ultra | Spark 4.0 Ultra |

## API 接口

### AI 对话接口

```bash
POST /api/chat
```

**请求示例：**

```json
{
  "apiKey": "your-api-key",
  "model": "glm-4.5-flash",
  "provider": "zhipu",
  "messages": [
    { "role": "user", "content": "你好" }
  ],
  "stream": true
}
```

**响应格式（SSE）：**

```
data: {"content": "你好", "usage": null}
data: {"content": "！", "usage": {"prompt_tokens": 5, "completion_tokens": 2}}
data: [DONE]
```

### SSE 演示接口

```bash
GET /sse?speed=50&text=自定义文本
```

### 连接控制接口

```bash
POST /pause?id={connectionId}   # 暂停输出
POST /resume?id={connectionId}  # 恢复输出
```

## 核心架构

### 前端状态管理

```
useChat Hook
├── messages: Message[]           # 已完成的历史消息（稳定）
├── streamingMessage: Message | null  # 当前流式生成中的消息
├── stats: TokenStats             # Token 统计
├── isOffline: boolean            # 网络状态
├── sendMessageStream()           # 流式发送
├── sendMessageNonStream()        # 非流式发送
├── cancel()                      # 取消请求
├── clear()                       # 清空对话
├── exportToMarkdown()            # 导出 Markdown
└── addError()                    # 添加错误消息
```

### 消息类型定义

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  status: 'idle' | 'streaming' | 'done' | 'error';
  createdAt: number;
}
```

## 调试方法

### VS Code / Cursor 调试

1. 在代码中打断点（点击行号左侧）
2. 按 `F5` 启动调试
3. 选择 "Debug Server"
4. 浏览器发起请求，断点会触发

### Chrome DevTools 调试

```bash
node --inspect server/index.js
```

然后访问 `chrome://inspect` 连接调试器。

## 安全说明

- API Key 仅存储在浏览器本地存储
- 通过后端代理转发请求，避免前端直接调用 AI API
- 服务端不存储任何 API Key
- 所有用户输入在渲染前进行 HTML 转义

## 后续规划

- [ ] 对话历史持久化（IndexedDB）
- [ ] 多会话管理
- [ ] 自定义系统提示词
- [ ] 图片/文件上传
- [ ] 语音输入/输出
- [ ] 主题切换（亮/暗）
- [ ] 国际化支持

## 许可证

MIT License

---

*文档版本: 1.1*
