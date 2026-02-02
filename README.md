# AITalking

基于 SSE 的 AI 流式对话应用，支持智谱 AI / 讯飞星火，实时流式输出、代码高亮、对话导出。

## 功能

- 智谱 AI、讯飞星火一键切换
- 流式 / 非流式输出、代码高亮、Markdown 导出
- Token 统计、上下文轮数、断网重试、响应式布局

## 技术栈

前端：React 18 + TypeScript + Vite + highlight.js  
后端：Node.js（原生 http/https）  
通信：SSE (Server-Sent Events)

## 快速开始

**环境**：Node.js >= 16

```bash
# 安装依赖（根目录 + react-chat）
npm run install:all

# 同时启动前后端
npm run all
```

| 页面       | 地址                  |
|------------|-----------------------|
| AI 对话    | http://localhost:5173 |
| SSE 演示   | http://localhost:3000  |

**分别启动**：`npm run start`（后端 3000） / `npm run react`（前端 5173）

## 文档

- [功能设计文档](designDoc/功能设计文档.md)
- [API 接口文档](designDoc/API接口文档.md)

## 许可证

MIT
