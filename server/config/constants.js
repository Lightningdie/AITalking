/**
 * 常量配置
 */
const PORT = Number(process.env.PORT) || 3000;

/** Python 语音服务地址（voice-service/，ASR + TTS） */
const VOICE_SERVICE_URL = process.env.VOICE_SERVICE_URL || 'http://127.0.0.1:5800';

/** 语音代理超时（毫秒）：ASR 首次加载模型较慢，给足时间 */
const VOICE_PROXY_TIMEOUT = Number(process.env.VOICE_PROXY_TIMEOUT) || 120000;

const DEFAULT_TEXT = `你好！我是一个 SSE 流式消息演示。

这段文字正在被逐字发送到前端，模拟 AI 大模型的流式输出效果。

SSE（Server-Sent Events）是一种允许服务器向客户端推送事件的技术。它基于 HTTP 协议，使用简单的文本格式传输数据。

✨ 特点：
• 基于 HTTP，无需额外协议
• 自动重连机制
• 轻量级，易于实现

现在你看到的就是一个完整的打字机效果演示！🎉`;

module.exports = {
  PORT,
  VOICE_SERVICE_URL,
  VOICE_PROXY_TIMEOUT,
  DEFAULT_TEXT
};
