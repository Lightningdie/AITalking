/**
 * Agent Harness 聊天路由（P1-3）
 *
 * POST /api/agent/chat —— agentic loop 的 SSE 入口。
 * 入参与 /api/chat 同构（apiKey/model/messages/provider/reasoningEffort/maxTokens），
 * 额外接受 maxSteps（默认 2，硬上限 8）。
 *
 * SSE 事件协议：沿用 /api/chat 的单层 JSON 事件，向后兼容新增两类（设计文档 §4.4）：
 *   { toolCall: { id, name, argsSummary } }
 *   { toolResult: { id, name, ok, summary, url? } }
 */
'use strict';

const API_CONFIG = require('../config/api.config');
const { jsonResponse, setSSEHeaders, sendSSEData } = require('../utils/response');
const { readBody } = require('../utils/request');
const { runAgent } = require('../services/agent');

/** 把 agent 事件转成 SSE 单层 JSON 事件下发 */
function emitAgentEvent(res, event) {
  switch (event.type) {
    case 'delta':
      if (event.content) sendSSEData(res, { content: event.content });
      if (event.reasoning) sendSSEData(res, { reasoning: event.reasoning });
      break;
    case 'toolCall':
      sendSSEData(res, {
        toolCall: { id: event.id, name: event.name, argsSummary: event.argsSummary }
      });
      break;
    case 'toolResult':
      sendSSEData(res, {
        toolResult: {
          id: event.id,
          name: event.name,
          ok: event.ok,
          summary: event.summary,
          ...(event.url ? { url: event.url } : {})
        }
      });
      break;
    default:
      break; // step 等内部事件不下发
  }
}

/**
 * POST /api/agent/chat
 */
async function handleAgentChat(req, res) {
  let currentReq = null;
  let clientGone = false;

  try {
    const body = await readBody(req);
    const { apiKey, model, messages, provider = 'zhipu' } = body;
    const { reasoningEffort, maxTokens, maxSteps } = body;

    if (!apiKey) return jsonResponse(res, 400, { error: 'API Key is required' });
    if (!messages || !Array.isArray(messages)) {
      return jsonResponse(res, 400, { error: 'Messages array is required' });
    }
    if (!API_CONFIG[provider]) {
      return jsonResponse(res, 400, { error: `Unknown provider: ${provider}` });
    }

    setSSEHeaders(res);

    // 客户端断开 → 销毁当前上游请求并中止循环（复用 chat.js 的 close 模式）
    req.on('close', () => {
      clientGone = true;
      if (currentReq) currentReq.destroy();
    });

    let streamError = null;
    try {
      await runAgent({
        apiKey,
        model,
        provider,
        messages,
        reasoningEffort,
        maxTokens,
        maxSteps,
        stream: true,
        isCancelled: () => clientGone,
        setCurrent: (r) => { currentReq = r; },
        onEvent: (event) => {
          if (clientGone || res.writableEnded) return;
          try {
            emitAgentEvent(res, event);
          } catch {
            // 客户端可能已断开，忽略写失败
          }
        }
      }).then((result) => {
        if (clientGone || res.writableEnded) return;
        // 用量：循环结束后一次性下发（与 /api/chat 的事件形状一致）
        if (result.usage) {
          sendSSEData(res, { content: '', usage: result.usage });
        }
      });
    } catch (error) {
      streamError = error.message;
    }

    if (streamError && !res.writableEnded) {
      sendSSEData(res, { error: streamError });
    }

    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (error) {
    if (!res.writableEnded) {
      jsonResponse(res, 500, { error: error.message });
    }
  }
}

module.exports = {
  handleAgentChat
};
