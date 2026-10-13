/**
 * 上游模型调用代理（P1-1）
 *
 * 自 routes/chat.js 的请求转发逻辑抽取为独立服务，供无状态代理与
 * services/agent.js（agentic loop）共用。
 *
 * 相比 chat.js 的关键扩展（designDoc/AgentHarness能力建设设计文档.md §4.3）：
 *   - 请求体支持下发 tools 数组（registry.toApiTools() 产物）；
 *   - 流式解析累积 delta.tool_calls（按 index 拼接 name/arguments 分片）——
 *     现状 chat.js 该字段被静默丢弃，是 harness 的关键缺口；
 *   - 透传 finish_reason（stop / tool_calls）供 agent.js 决定循环走向；
 *   - setCurrent 钩子暴露底层请求，供路由在客户端断开时 destroy（复用现有模式）。
 */
'use strict';

const http = require('http');
const https = require('https');

/** 默认最大输出 tokens（与 chat.js 保持一致） */
const DEFAULT_MAX_TOKENS = 32768;

/**
 * 构建请求选项（与 chat.js 同构）
 */
function buildRequestOptions(config, apiKey, requestBody) {
  return {
    protocol: `${config.protocol || 'https'}:`,
    hostname: config.hostname,
    port: config.port || 443,
    path: config.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(requestBody)
    }
  };
}

/**
 * 构建请求体：推荐参数 + 可选 tools / 思考档位
 */
function buildRequestBody({ model, messages, tools, stream, reasoningEffort, maxTokens }) {
  return JSON.stringify({
    model,
    messages,
    stream: !!stream,
    // 智谱官方推荐参数（与 chat.js 一致）
    temperature: 1,
    top_p: 0.95,
    thinking: { type: 'enabled', clear_thinking: false },
    // 思考深度：low < high < max
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    // 工具清单：模型据此决定是否发起 tool_calls
    ...(tools && tools.length ? { tools } : {}),
    max_tokens: maxTokens || DEFAULT_MAX_TOKENS
  });
}

/**
 * 从上游错误响应体提取可读信息
 */
function extractApiError(statusCode, body) {
  try {
    const parsed = JSON.parse(body);
    return parsed.error?.message || parsed.message || `HTTP ${statusCode}`;
  } catch {
    return `HTTP ${statusCode}`;
  }
}

/**
 * 非流式调用一轮（最小闭环验证用）
 *
 * @param {Object} params
 * @param {Array}  params.messages OpenAI 格式上下文
 * @param {Array}  [params.tools]  工具声明数组（registry.toApiTools() 产物）
 * @returns {Promise<{ message: Object, finishReason: string, usage: Object|null }>}
 *   message 为 OpenAI 格式 assistant 消息，可直接 push 回 messages 数组
 */
function callUpstream({ apiKey, model, config, messages, tools, reasoningEffort, maxTokens }) {
  const requestBody = buildRequestBody({ model, messages, tools, stream: false, reasoningEffort, maxTokens });
  const options = buildRequestOptions(config, apiKey, requestBody);
  const transport = options.protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const apiReq = transport.request(options, (apiRes) => {
      let body = '';
      apiRes.on('data', (chunk) => (body += chunk));
      apiRes.on('end', () => {
        if (apiRes.statusCode !== 200) {
          reject(new Error(extractApiError(apiRes.statusCode, body)));
          return;
        }
        try {
          const parsed = JSON.parse(body);
          const choice = parsed.choices?.[0];
          resolve({
            message: choice?.message || { role: 'assistant', content: '' },
            finishReason: choice?.finish_reason || 'stop',
            usage: parsed.usage || null
          });
        } catch {
          reject(new Error('上游返回非 JSON 响应'));
        }
      });
      apiRes.on('error', reject);
    });

    apiReq.on('error', reject);
    apiReq.write(requestBody);
    apiReq.end();
  });
}

/**
 * 流式调用一轮（agentic loop 用）
 *
 * 转发语义：content / reasoning 增量通过 onDelta 回调实时交给调用方
 * （路由层转成 SSE 推给前端）；tool_calls 分片在本模块内按 index 累积，
 * 流结束时随 finishReason 一起返回完整 assistant 消息。
 *
 * @param {Object} params
 * @param {Function} [params.onDelta]   ({ content?, reasoning? }) 增量回调
 * @param {Function} [params.setCurrent] (apiReq) => void，暴露请求供外部中断
 * @returns {Promise<{ message: Object, finishReason: string, usage: Object|null }>}
 *   message 含累积完整的 content / reasoning_content / tool_calls
 */
function streamUpstream({
  apiKey, model, config, messages, tools, reasoningEffort, maxTokens, onDelta, setCurrent
}) {
  const requestBody = buildRequestBody({ model, messages, tools, stream: true, reasoningEffort, maxTokens });
  const options = buildRequestOptions(config, apiKey, requestBody);
  const transport = options.protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const apiReq = transport.request(options, (apiRes) => {
      if (apiRes.statusCode !== 200) {
        let body = '';
        apiRes.on('data', (chunk) => (body += chunk));
        apiRes.on('end', () => reject(new Error(extractApiError(apiRes.statusCode, body))));
        return;
      }

      let buffer = '';
      let content = '';
      let reasoning = '';
      /** 按 index 拼接的分片：name 首片到达、arguments 逐片追加 */
      let toolCallsAcc = [];
      let finishReason = 'stop';
      let usage = null;

      apiRes.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            const delta = choice?.delta || {};

            if (choice?.finish_reason) finishReason = choice.finish_reason;
            if (parsed.usage) usage = parsed.usage;

            if (delta.content) {
              content += delta.content;
              onDelta?.({ content: delta.content });
            }
            if (delta.reasoning_content) {
              reasoning += delta.reasoning_content;
              onDelta?.({ reasoning: delta.reasoning_content });
            }

            // 关键增量拼装：tool_calls 按 index 分片到达
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = typeof tc.index === 'number' ? tc.index : 0;
                const slot =
                  toolCallsAcc[idx] ||
                  (toolCallsAcc[idx] = {
                    id: '',
                    type: 'function',
                    function: { name: '', arguments: '' }
                  });
                if (tc.id) slot.id = tc.id;
                if (tc.type) slot.type = tc.type;
                if (tc.function?.name) slot.function.name += tc.function.name;
                if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
              }
            }
          } catch {
            // 忽略解析错误（与 chat.js 一致）
          }
        }
      });

      apiRes.on('end', () => {
        const toolCalls = toolCallsAcc.filter(Boolean);
        const message = {
          role: 'assistant',
          content,
          ...(reasoning ? { reasoning_content: reasoning } : {}),
          ...(toolCalls.length ? { tool_calls: toolCalls } : {})
        };
        resolve({ message, finishReason, usage });
      });
      apiRes.on('error', reject);
    });

    apiReq.on('error', reject);
    setCurrent?.(apiReq);
    apiReq.write(requestBody);
    apiReq.end();
  });
}

module.exports = {
  callUpstream,
  streamUpstream,
  DEFAULT_MAX_TOKENS
};
