# AITalking

基于 SSE 的 AI 流式对话应用：React 前端 + Node 原生后端 + 独立 Python 语音服务。
支持智谱 AI 深度思考流式输出、模型自主调用工具（Agent Harness）、多模态图片输入、
语音输入/输出、会话持久化与 Office 文档导出。

## 功能

- **流式对话**：SSE 实时输出，深度思考（reasoning）过程可见，思考档位 / 输出预算可调
- **Agent 工具调用**：模型自主决定调用工具（当前支持 `generate_document` 文档生成），
  对话中说"把表格导出成 xlsx"即可触发，气泡内实时显示 🔧 调用状态与下载链接
- **多模态**：图片随消息上传（base64）
- **语音**：录音识别（ASR，FunASR / faster-whisper 可切换）+ 回答朗读（TTS，edge-tts）
- **会话管理**：SQLite 持久化，多会话切换 / 删除，Markdown 导出
- **文档导出**：一键把 Markdown 回答导出为 docx / xlsx / md（前端按钮与模型自主调用双通道）
- **工程体验**：Token 统计、上下文轮数、断网重试、响应式布局

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端 `react-chat/` | React 18 + TypeScript + Vite + Milkdown + highlight.js |
| 后端 `server/` | Node.js（原生 http/https，无框架）+ sql.js（SQLite） |
| 语音 `voice-service/` | Python + FastAPI（ASR/TTS sidecar） |
| 通信 | SSE（Server-Sent Events）+ REST |

## 项目结构

```text
AITalking/
├── server/                        # Node 后端（原生 http）
│   ├── index.js                   #   入口：路由分发 + 数据库初始化
│   ├── config/                    #   上游 API / 常量 / MIME / 存储路径
│   ├── routes/                    #   路由层
│   │   ├── chat.js                #     AI 聊天代理（SSE 流式转发）
│   │   ├── agent.js               #     Agent Harness 聊天端点（/api/agent/chat）
│   │   ├── history.js             #     会话历史 CRUD
│   │   ├── tools.js               #     文档生成 / 生成文件下载
│   │   ├── voice.js               #     语音 ASR/TTS 代理
│   │   └── control.js / sse.js / static.js
│   ├── services/                  #   业务服务层
│   │   ├── database.js            #     SQLite（sql.js）持久化
│   │   ├── filegen.js             #     Markdown → docx/xlsx 文件生成
│   │   ├── connection.js          #     SSE 连接 / 流控制
│   │   ├── agent.js               #     Agent Harness 内核：agentic loop（P1 已实现）
│   │   ├── llmproxy.js            #     上游调用：tools 下发 / tool_calls 增量解析（P1 已实现）
│   │   ├── context.js             #     【预留】服务端上下文拼装管线（下一阶段）
│   │   └── tools/                 #     工具注册表（P1 已实现）
│   │       ├── registry.js        #       工具注册（schema / 执行器 / 权限 / 超时）
│   │       ├── document.js        #       generate_document 工具（模型可自主调用）
│   │       └── index.js
│   ├── scripts/                   #   独立脚本（agent-loop-demo.js：harness 最小闭环验证）
│   └── utils/                     #   request / response 工具
├── react-chat/                    # React 前端
│   └── src/
│       ├── components/            #   ChatBubble / ChatContainer / ChatInput / MilkdownView / Sidebar …
│       │   └── ToolCallStatus.tsx #     工具调用状态行（toolCall/toolResult 事件）
│       ├── hooks/                 #   useChat（核心对话）/ useVoiceInput / useVoicePlayback
│       ├── services/              #   historyApi / toolsApi / voiceApi
│       ├── types/                 #   Message 等全局类型
│       └── styles/
├── voice-service/                 # Python 语音 sidecar（ASR/TTS）
├── designDoc/                     # 设计文档
└── index.html / js/ / css/        # 旧版 SSE 演示页（legacy）
```

## 快速开始

**环境**：Node.js >= 16；语音功能需 Python 3.9+

```bash
# 安装依赖（根目录 + react-chat）
npm run install:all

# 可选：安装语音服务依赖（不用语音可跳过）
npm run voice:setup

# 同时启动前后端
npm run all

# 可选：启动语音服务（另开终端，默认 127.0.0.1:5800）
npm run voice

# 可选：离线验证 Agent 工具调用闭环（不需要 API Key）
npm run agent:demo
```

| 页面 | 地址 |
| --- | --- |
| AI 对话 | `http://localhost:5173` |
| SSE 演示 | `http://localhost:3000` |
| 语音服务 | `http://127.0.0.1:5800` |

**分别启动**：`npm run start`（后端 3000） / `npm run react`（前端 5173）

## Agent Harness（最小闭环已实现）

当前已落地 harness 内核的**最小闭环**：模型可自主调用 `generate_document` 工具
（"把下面的表格导出成 xlsx" → 模型发起 tool_calls → 服务端执行 → 结果回填 → 模型继续回答），
前端实时显示工具调用状态行。对应
[AgentHarness 能力建设设计文档](designDoc/AgentHarness能力建设设计文档.md) 的 P1 阶段。

| 模块 | 文件 | 说明 |
| --- | --- | --- |
| 上游调用 | `server/services/llmproxy.js` | 下发 `tools`、累积 `delta.tool_calls`、透传 `finish_reason`；流式/非流式两个入口 |
| 工具注册表 | `server/services/tools/registry.js` | `toApiTools()` / `execute()`，白名单、超时、异常转结果、8K 截断护栏 |
| 文档工具 | `server/services/tools/document.js` | `generate_document`（复用 `filegen.js` + 现有下载端点），前端按钮双通道并存 |
| harness 内核 | `server/services/agent.js` | agentic loop（默认 2 步，硬上限 8），中间消息回填、边界截断 |
| SSE 端点 | `server/routes/agent.js` | `POST /api/agent/chat`，事件兼容 `/api/chat` 并新增 `toolCall` / `toolResult` |
| 前端状态行 | `react-chat/src/components/ToolCallStatus.tsx` | 🔧 调用中 → ✅/❌ + 下载链接；`useChat` 已切换到 agent 端点 |
| 验证脚本 | `server/scripts/agent-loop-demo.js` | `npm run agent:demo` 离线验证循环（mock 上游，断言消息配对与落盘） |

离线验证：`npm run agent:demo`（不需要 API Key，工具真实执行落盘）；
真实联调：`AITALKING_API_KEY=<key> node server/scripts/agent-loop-demo.js --live "把表格导出成xlsx"`。

尚未实施（见设计文档 §6）：服务端上下文拼装（`context.js`，中间消息跨轮持久化的前置）、
confirm 权限确认、web_search 等工具扩充。

## 文档

- [功能设计文档](designDoc/功能设计文档.md)
- [API 接口文档](designDoc/API接口文档.md)
- [后端上下文拼装改造设计文档](designDoc/后端上下文拼装改造设计文档.md)（设计稿，下一阶段）
- [AgentHarness 能力建设设计文档](designDoc/AgentHarness能力建设设计文档.md)（P1 已实施，`/api/agent/chat` 事件协议见 §4.4）

## 许可证

MIT
