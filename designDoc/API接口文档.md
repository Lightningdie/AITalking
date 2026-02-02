# API 接口文档

## 概述

本文档描述了 AI 流式对话应用的后端 API 接口规范。

**基础 URL:** `http://localhost:3000`

---

## 1. AI 对话接口

### POST /api/chat

AI 对话代理接口，支持流式和非流式两种模式。

#### 请求

**Headers:**

| Header | 值 | 说明 |
|--------|-----|------|
| Content-Type | application/json | 请求体格式 |
| Accept | text/event-stream | 期望的响应格式（SSE） |

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| apiKey | string | ✅ | AI 平台的 API Key |
| model | string | ❌ | 模型名称，默认使用平台默认模型 |
| provider | string | ❌ | 平台标识，默认 "zhipu" |
| messages | array | ✅ | 消息列表 |
| stream | boolean | ❌ | 是否流式输出，默认 true |

**messages 数组格式：**

```json
[
  { "role": "user", "content": "你好" },
  { "role": "assistant", "content": "你好！有什么可以帮助你的？" },
  { "role": "user", "content": "介绍一下 JavaScript" }
]
```

**请求示例：**

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "your-api-key",
    "model": "glm-4.5-flash",
    "provider": "zhipu",
    "messages": [
      { "role": "user", "content": "你好" }
    ],
    "stream": true
  }'
```

#### 响应

**Content-Type:** `text/event-stream`

**流式响应格式（SSE）：**

```
data: {"content": "你", "usage": null}

data: {"content": "好", "usage": null}

data: {"content": "！", "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8}}

data: [DONE]
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| content | string | 增量内容片段 |
| usage | object | Token 使用统计（仅最后一条消息包含） |
| usage.prompt_tokens | number | 输入 Token 数 |
| usage.completion_tokens | number | 输出 Token 数 |
| usage.total_tokens | number | 总 Token 数 |

**错误响应：**

```
data: {"error": "API Key is required"}
```

#### 错误码

| HTTP 状态码 | 错误信息 | 说明 |
|------------|---------|------|
| 400 | API Key is required | 缺少 API Key |
| 400 | Messages array is required | 缺少消息列表 |
| 400 | Unknown provider: xxx | 不支持的平台 |
| 500 | 内部错误信息 | 服务器内部错误 |

---

## 2. SSE 演示接口

### GET /sse

SSE 流式输出演示接口，逐字发送文本。

#### 请求

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| speed | number | 50 | 每个字符的发送间隔（毫秒） |
| text | string | 默认演示文本 | 自定义发送文本（需 URL 编码） |

**请求示例：**

```bash
# 默认演示
curl http://localhost:3000/sse

# 自定义速度
curl http://localhost:3000/sse?speed=100

# 自定义文本
curl "http://localhost:3000/sse?text=%E4%BD%A0%E5%A5%BD%E4%B8%96%E7%95%8C"
```

#### 响应

**Content-Type:** `text/event-stream`

**事件类型：**

**1. connected 事件（连接建立）**

```
event: connected
data: {"status": "connected", "connectionId": "1"}
```

**2. data 事件（字符数据）**

```
data: {"char": "你", "index": 0, "total": 100}
data: {"char": "好", "index": 1, "total": 100}
```

**3. done 事件（发送完成）**

```
event: done
data: {"status": "complete"}
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| connectionId | string | 连接唯一标识 |
| char | string | 当前发送的字符 |
| index | number | 当前字符索引（从 0 开始） |
| total | number | 文本总长度 |

---

## 3. 连接控制接口

### POST /pause

暂停指定连接的输出。

#### 请求

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | 连接 ID（从 connected 事件获取） |

**请求示例：**

```bash
curl -X POST "http://localhost:3000/pause?id=1"
```

#### 响应

**成功响应：**

```json
{
  "success": true,
  "status": "paused"
}
```

**失败响应：**

```json
{
  "success": false,
  "error": "Connection not found"
}
```

---

### POST /resume

恢复指定连接的输出。

#### 请求

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | ✅ | 连接 ID |

**请求示例：**

```bash
curl -X POST "http://localhost:3000/resume?id=1"
```

#### 响应

**成功响应：**

```json
{
  "success": true,
  "status": "resumed"
}
```

**失败响应：**

```json
{
  "success": false,
  "error": "Connection not found"
}
```

---

## 4. 静态资源接口

### GET /

返回 SSE 演示页面 (index.html)。

### GET /css/*

返回 CSS 样式文件。

### GET /js/*

返回 JavaScript 文件。

> **注意：** AI 聊天功能请访问 React 应用 (http://localhost:5173)

---

## 5. CORS 支持

所有 API 接口均支持跨域访问：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

---

## 6. 支持的 AI 平台

### 智谱 AI (zhipu)

| 属性 | 值 |
|------|-----|
| provider | zhipu |
| API 域名 | open.bigmodel.cn |
| API 路径 | /api/paas/v4/chat/completions |
| 默认模型 | glm-4.5-flash |

**可用模型：**

| 模型 | 说明 |
|------|------|
| glm-4.5-flash | GLM-4.5 Flash（免费） |
| glm-4-flash | GLM-4 Flash（免费） |
| glm-4-plus | GLM-4 Plus |
| glm-4 | GLM-4 |

### 讯飞星火 (spark)

| 属性 | 值 |
|------|-----|
| provider | spark |
| API 域名 | spark-api-open.xf-yun.com |
| API 路径 | /v1/chat/completions |
| 默认模型 | lite |

**可用模型：**

| 模型 | 说明 |
|------|------|
| lite | Spark Lite（免费） |
| generalv3 | Spark Pro |
| pro-128k | Spark Pro 128K |
| max-32k | Spark Max 32K |
| 4.0Ultra | Spark 4.0 Ultra |

---

## 7. 前端调用示例

### JavaScript (Fetch API)

```javascript
// 流式调用（含连接中断处理）
async function streamChat(messages) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',  // 声明期望 SSE 格式
    },
    body: JSON.stringify({
      apiKey: 'your-api-key',
      model: 'glm-4.5-flash',
      provider: 'zhipu',
      messages: messages,
      stream: true
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 累加到 buffer，处理跨 chunk 的数据
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';  // 保留不完整的行

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          const parsed = JSON.parse(data);
          if (parsed.content) {
            fullContent += parsed.content;
            console.log(parsed.content); // 增量内容
          }
          if (parsed.usage) {
            console.log('Token 使用:', parsed.usage);
          }
          if (parsed.error) {
            throw new Error(parsed.error);
          }
        }
      }
    }
  } catch (error) {
    // 连接中断处理
    console.error('流式读取错误:', error);
    if (fullContent) {
      console.log('已接收的部分内容:', fullContent);
    }
    throw error;
  }
  
  return fullContent;
}
```

### SSE 演示监听

```javascript
const eventSource = new EventSource('/sse?speed=50');

eventSource.addEventListener('connected', (e) => {
  const data = JSON.parse(e.data);
  console.log('连接成功, ID:', data.connectionId);
});

eventSource.addEventListener('message', (e) => {
  const data = JSON.parse(e.data);
  console.log('收到字符:', data.char);
});

eventSource.addEventListener('done', (e) => {
  console.log('传输完成');
  eventSource.close();
});
```

---

*文档版本: 1.1*
*更新日期: 2026-01-20*
