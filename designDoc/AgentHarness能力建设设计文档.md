# Agent Harness 能力建设 - 设计文档

> 状态：P1 最小闭环已实施（2026-09-22，见 server/services/agent.js 与 npm run agent:demo）；P2+ 未实施
> 日期：2026-09-20
> 关联文档：[后端上下文拼装改造设计文档.md](./后端上下文拼装改造设计文档.md)（本方案的前置依赖）、[功能设计文档.md](./功能设计文档.md)

## 1. 结论（TL;DR）

**当前项目有"管道"，没有"harness"。**

- ✅ 已具备：SSE 流式管道、工具**执行端**雏形（文档生成/下载，含防路径穿越）、SQLite 持久化、多模态输入、语音输入/输出通道；
- ❌ 核心缺失：**模型驱动的工具调用回路（agentic loop）**——`tools` schema 未下发给模型、`tool_calls` 响应被代理静默丢弃、无工具注册表、无工具结果回填、前端无工具执行状态。

即：现有"文档导出"本质是**用户手动触发的功能按钮**，模型并不知道它的存在，更不能自主决定调用。要支持"丰富能力"（联网搜索、代码执行、自动生成文件、多步任务），需要补齐 harness 内核。

---

## 2. 现状底座盘点

### 2.1 组件清单

| 组件 | 现状 | 评级 | harness 中的角色 |
|---|---|---|---|
| SSE 流式管道 | `chat.js` 转发 `content/reasoning/usage/error` 四类事件，协议为单层 JSON | ✅ 有 | 事件协议可直接扩展 `tool_call/tool_result` 事件 |
| 上游转发 `streamUpstream` | 只提取 `delta.content / delta.reasoning_content / usage`，**`delta.tool_calls` 被静默丢弃** | ❌ 关键缺口 | 需改造为透传 tool_calls 增量 |
| 工具执行端：文档生成 | `filegen.js`（md→docx/xlsx/md）+ `tools.js` 下载端点，防路径穿越、类型校验完善 | ✅ 有（质量好） | 可直接注册为第一个模型可调用工具 |
| 工具触发方式 | 前端按钮（`ChatBubble` → `exportDocument`），**模型无感知** | ❌ 非模型驱动 | 需迁移到模型 function calling 触发 |
| 语音 ASR/TTS | `voice-service` 独立 Python 服务，前端 `useVoiceInput/useVoicePlayback` | ✅ 有 | 输入/输出通道，非模型工具（保持独立） |
| 持久化 | SQLite（sql.js），会话+消息，全量覆盖式保存 | ⚠️ 弱 | 需先完成后端拼装改造（见关联文档） |
| 多模态输入 | 图片以 base64 随消息上传 | ✅ 有 | vision 类工具的基础 |
| 图片生成 | 仅 `useChat.ts` 注释占位（`appendLocalMessage` 预留），无实际端点 | ❌ 无 | P3 工具集候选 |
| 流控制 | `control.js` 暂停/继续、`req.on('close')` 断连销毁上游 | ✅ 有 | loop 取消机制可复用 |
| API Key | 前端持有、每轮明文传输 | ⚠️ 弱 | harness 化时一并收归服务端 |

### 2.2 一句话定性

当前每次用户消息 = **恰好一次**上游模型调用，回答即结束。不存在"模型请求调用工具 → 执行 → 结果回填 → 模型继续"的循环，因此任何需要**模型自主决策**的能力（搜索、计算、生成文件、多步任务）都无法实现。

---

## 3. 目标：什么是 Harness

Harness = 包裹模型的执行回路：把工具清单注入请求 → 解析模型的工具调用请求 → 执行工具 → 把结果以 `role: 'tool'` 回填 → 再次调用模型 → 循环，直到模型产出最终回答或达到步数上限。

```
                ┌──────────────────────────────────────────┐
                │              服务端 Harness 内核            │
                │                                          │
  用户消息 ─────►│  assemble ──► 调用上游 ◄──┐               │
                │               │          │               │
                │        ┌──────┴──────┐   │               │
                │        │ finish_reason│   │               │
                │        └──────┬──────┘   │               │
                │     tool_calls │    stop │               │
                │               ▼          │               │
                │        执行工具(registry)  │               │
                │        docgen / search…  │               │
                │               │          │               │
                │        结果 role:'tool' ───┘ 回填再循环       │
                │               │                          │
  SSE 流 ◄──────┤        最终回答（step 事件全程推送前端）        │
                └──────────────────────────────────────────┘
```

循环边界（必须有，防止失控）：最大步数（建议 8）、单工具超时（建议 30s）、总时长上限、用户中断（复用现有 abort 链路）。

---

## 4. 目标架构

### 4.1 分层职责（目标态）

```
routes/chat.js           增量聊天端点（HTTP/SSE 入口）
  └─ services/agent.js   【新增】harness 内核：agentic loop
       ├─ registry.js    【新增】工具注册表：schema + 执行器 + 权限
       ├─ context.js     上下文拼装（关联文档 §4.1，前置依赖）
       └─ llmproxy.js    上游调用（需支持 tools 下发与 tool_calls 解析）
```

### 4.2 工具注册表 `services/tools/registry.js`

每个工具 = 一份声明（供模型）+ 一个执行器（供内核）+ 权限标记（供安全层）：

```js
// 工具定义示例：文档生成
{
  name: 'generate_document',
  description: '把 Markdown 内容生成 docx/xlsx/md 文件，返回下载链接。当用户要求导出/生成文档时调用。',
  parameters: {                       // JSON Schema，直接下发智谱 tools 字段
    type: 'object',
    properties: {
      type:    { type: 'string', enum: ['docx', 'xlsx', 'md'] },
      title:   { type: 'string' },
      markdown:{ type: 'string', description: '完整的 Markdown 正文' }
    },
    required: ['type', 'title', 'markdown']
  },
  permission: 'auto',                 // auto=自动执行 | confirm=需用户确认
  timeoutMs: 30000,
  execute: async (args) => ({         // 返回值序列化后回填 role:'tool'
    ok: true,
    fileName: '报告_1729.docx',
    url: '/api/tools/files/报告_1729.docx'
  })
}
```

注册表职责：

- `toApiTools()` — 导出智谱 `tools` 数组（name/description/parameters）；
- `execute(name, args)` — 执行 + 超时控制 + 异常捕获（异常信息作为工具结果回填，让模型自行决定重试或告知用户）；
- 结果体积护栏 — 工具返回超过阈值（如 8K 字符）时截断并附说明。

### 4.3 Agentic Loop `services/agent.js`

```
async function runAgent({ conversationId, userMessage, config, sse, signal }):
  1. messages = context.assemble(conversationId)  + userMessage
  2. tools = registry.toApiTools()
  3. for step in 1..MAX_STEPS:
       调用上游（stream:true, tools）→ 流式转发 content/reasoning
       - 并累积 delta.tool_calls（按 index 拼接 name/arguments 分片）
       - finish_reason === 'tool_calls':
           sse.emit({ toolCall: { id, name, args } })
           results = registry.execute(...)          // 串行起步，P3 再并行
           messages.push(assistant.tool_calls 消息, ...results.map(role:'tool'))
           sse.emit({ toolResult: {...} })
           continue                                 // 回循环
       - finish_reason === 'stop': break            // 最终回答已流式输出完
  4. 落库：全部中间消息（assistant 带 tool_calls、role:'tool'）+ 最终回答 + usage
```

关键点：

- **tool_calls 增量拼装**：流式下 `delta.tool_calls` 按 `index` 分片到达（name 首片、arguments 逐片），需在 `streamUpstream` 中累积，这是必改点；
- **中间消息全部落库**：assistant 的 `tool_calls` 消息和 `role: 'tool'` 结果要持久化，否则下一轮模型看不到自己调用过什么（DB 的 role 列直接支持 `tool`，无需迁移）；
- **上下文一致性**：context.sanitize 需放行 `role: 'tool'`（现有清洗规则"只留 user/assistant/system"要同步更新），并保证 tool 消息紧跟其所属 assistant 消息不被裁剪拆散。

### 4.4 事件协议扩展（SSE）

现有四类事件保持不变，向后兼容新增三类：

| 事件 | 载荷 | 前端行为 |
|---|---|---|
| `toolCall` | `{ id, name, argsSummary }` | 气泡内插入"🔧 正在调用 文档生成…"状态行 |
| `toolResult` | `{ id, name, ok, summary }` | 状态行变成功/失败，附产物链接 |
| `step` | `{ step, maxSteps }` | （可选）多步进度提示 |

`ChatBubble` 新增 `toolCalls?: { id, name, status, resultUrl? }[]` 渲染区块；`Message` 类型同步扩展。

### 4.5 前置依赖与衔接

**必须先完成《后端上下文拼装改造》的 P1**（服务端持有会话状态 + 增量落库）。原因：agentic loop 中服务端要自主回填 tool 消息并再次调用模型，若上下文仍由前端拼装，中间消息将无法闭环。两份方案的执行顺序：

```
上下文拼装 P0-1（清洗） → P1（端点+增量落库） → 本方案 P1（harness 内核）
```

---

## 5. 安全与边界

| 风险 | 对策 |
|---|---|
| 模型幻觉调用不存在的工具 | 注册表白名单，未注册直接返回错误结果回填 |
| 无限循环（工具结果诱发再调用） | MAX_STEPS=8 强制截断，最终消息注明"已达到工具调用上限" |
| 工具卡死拖住会话 | 每工具 timeoutMs，超时返回错误结果回填 |
| 危险操作无确认 | `permission: 'confirm'` 类工具先下发 `toolConfirm` 事件等前端确认（P2 实现；P1 阶段全部 `auto` 且只注册只读/生成类工具） |
| 工具结果注入（提示词攻击） | 结果以 `role:'tool'` 传递并截断，不拼接进 user 消息 |
| 文件系统越权 | 复用 `resolveSafeFilePath` 路径穿越防护模式，新工具一律限定工作目录 |
| 上游不支持 tools 的模型 | 请求前校验模型能力表（`api.config.js` 增加 supportsTools 标记），不支持则工具不注入并提示 |

---

## 6. 分阶段实施计划

| 阶段 | 内容 | 交付物 | 预估 | 前置 |
|---|---|---|---|---|
| P1-1 | `streamUpstream` 支持下发 `tools`、累积 `delta.tool_calls`、透传 `finish_reason` | `llmproxy` 改造 | 0.5 天 | 上下文拼装 P1 |
| P1-2 | 工具注册表 + `generate_document` 迁入（前端按钮保留，双通道并存） | `registry.js` | 0.5 天 | — |
| P1-3 | agentic loop 内核（单工具单步起步）+ `toolCall/toolResult` 事件 + 前端状态 UI | `agent.js` + ChatBubble 扩展 | 1.5 天 | P1-1/2 |
| P2-1 | 中间消息落库（assistant.tool_calls + role:'tool'）+ sanitize 放行 tool 消息 | 持久化扩展 | 0.5 天 | P1-3 |
| P2-2 | `permission: 'confirm'` 确认机制（`toolConfirm` 事件 + 前端确认卡片） | 安全层 | 1 天 | P1-3 |
| P3-1 | 工具集扩充：web_search（智谱 web-search API）、generate_image（cogview，补齐现有占位）、calculator | registry 增项 | 1-2 天 | P1-3 |
| P3-2 | 多步任务打磨：并行工具调用、step 事件、重试策略 | loop 增强 | 1 天 | P2-1 |
| P4 | MCP 接入层（外部工具服务器）、代码执行沙箱（独立进程/容器）、会话内工具调用审计页 | 生态扩展 | 按需 | P3 |

里程碑验收标准：

- P1 后：对话中说"把刚才的表格导出成 xlsx"，模型自主调用 `generate_document`，前端看到工具状态行并拿到下载链接；
- P2 后：刷新页面重新加载会话，工具调用过程完整可见；confirm 类工具未经确认不执行；
- P3 后："搜一下今天的新闻然后生成一份摘要文档"能在一个回合内完成搜索→综合→生成文件的多步链路。

---

## 7. 待定项（TBD）

1. **工具消息可见性**：中间的 tool_calls/tool 消息在前端是渲染为独立气泡还是折叠进最终回答的"过程"区块（倾向后者，与主流产品一致）；
2. **智谱 web-search 用内建检索**（`tools: [{type:'web_search'}]` 由上游代执行）**还是自建 search 工具**（loop 内执行、可控可审计）——倾向自建，统一走 registry；
3. **thinking 与 tools 的组合**：当前请求强制 `thinking: { type: 'enabled' }`，部分模型在 tools+thinking 下有行为差异，P1 需实测决定是否在工具调用轮自动降级 thinking；
4. **代码执行沙箱选型**：独立 Node 子进程（轻、隔离弱）vs 容器（重、隔离强），P4 前不需要定；
5. **工具结果是否参与上下文预算**：长结果截断阈值与摘要策略，建议与上下文拼装的 budget 模块统一处理。
