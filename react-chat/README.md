# React Chat Components 🤖

基于 React 18 的可复用 AI 对话组件库，支持智谱 AI / 讯飞星火双平台，流式输出、代码高亮、移动端适配。

## ✨ 特性

- **🔄 多平台支持** - 智谱 AI 和讯飞星火一键切换
- **🚀 流式输出** - 实时显示 AI 回复，支持流式/非流式切换
- **💻 代码高亮** - 集成 highlight.js，支持 180+ 编程语言
- **📱 响应式** - 完美适配移动端和桌面端
- **🛡️ 异常处理** - 断网检测 + 自动重试机制
- **📥 导出功能** - 对话历史导出为 Markdown
- **🎨 主题美观** - GitHub Dark 风格，支持自定义样式
- **♻️ 可复用** - 组件化设计，易于集成到其他项目
- **📦 工程化** - ESLint + Prettier 代码规范

## 🚀 快速开始

### 安装依赖

```bash
cd react-chat
npm install
```

### 启动开发服务器

```bash
# 先确保后端服务已启动 (端口 3000)
cd ..
node server.js

# 启动 React 开发服务器 (端口 5173)
cd react-chat
npm run dev
```

### 访问

- React 应用: <http://localhost:5173>
- API 代理: <http://localhost:3000/api/chat>

## 📁 项目结构

```
react-chat/
├── src/
│   ├── components/          # React 组件
│   │   ├── ChatBubble.jsx     # 聊天气泡
│   │   ├── ChatContainer.jsx  # 聊天容器
│   │   ├── ChatInput.jsx      # 输入框
│   │   ├── CodeBlock.jsx      # 代码块（高亮）
│   │   ├── MessageContent.jsx # 消息内容渲染
│   │   ├── Sidebar.jsx        # 侧边栏配置
│   │   └── index.js           # 组件导出
│   ├── hooks/               # 自定义 Hooks
│   │   ├── useChat.js         # 聊天逻辑
│   │   ├── useLocalStorage.js # 本地存储
│   │   └── index.js
│   ├── styles/              # 样式文件
│   │   ├── index.css          # 全局样式
│   │   ├── components.css     # 组件样式
│   │   └── code-highlight.css # 代码高亮样式
│   ├── App.jsx              # 主应用
│   └── main.jsx             # 入口文件
├── .eslintrc.cjs            # ESLint 配置
├── .prettierrc              # Prettier 配置
├── vite.config.js           # Vite 配置
└── package.json
```

## 🧩 组件 API

### ChatBubble

聊天气泡组件。

```jsx
<ChatBubble
  role="user | assistant | error"
  content="消息内容"
  isStreaming={false}
/>
```

### ChatContainer

聊天容器，包含消息列表和输入框。

```jsx
<ChatContainer
  messages={[{ role: 'user', content: '你好' }]}
  isStreaming={false}
  streamingContent=""
  onSendMessage={(content) => {}}
  streamMode={true}
  onStreamModeChange={(enabled) => {}}
  disabled={false}
/>
```

### CodeBlock

代码块组件，支持语法高亮。

```jsx
<CodeBlock
  code="console.log('Hello')"
  language="javascript"
/>
```

### useChat Hook

管理聊天状态和 API 调用。

```jsx
const {
  messages,           // 消息列表
  isStreaming,        // 是否正在流式输出
  streamingContent,   // 当前流式内容
  stats,              // Token 统计
  sendMessageStream,  // 流式发送
  sendMessageNonStream, // 非流式发送
  cancel,             // 取消请求
  clear,              // 清空对话
  addError,           // 添加错误
} = useChat({ apiKey, model, contextLength });
```

## 🛠 脚本命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 构建生产版本
npm run preview  # 预览构建结果
npm run lint     # ESLint 检查
npm run format   # Prettier 格式化
```

## 📝 支持的 Markdown 格式

- \`\`\`language 代码块（支持语法高亮）
- \`inline code\` 行内代码
- **粗体** 和 *斜体*
- > 引用块
- 换行保持

## 🎨 自定义主题

修改 `src/styles/index.css` 中的 CSS 变量：

```css
:root {
  --color-bg-primary: #0d1117;
  --color-accent-blue: #58a6ff;
  --color-accent-purple: #a371f7;
  /* ... */
}
```

## 📦 集成到其他项目

1. 复制 `src/components` 和 `src/hooks` 目录
2. 复制 `src/styles` 中的样式文件
3. 安装依赖: `npm install highlight.js clsx`
4. 在你的项目中导入组件使用

```jsx
import { ChatBubble, CodeBlock, useChat } from './components';
```

## License

MIT
