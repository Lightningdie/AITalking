/**
 * AI 聊天代理路由
 *
 * 流程：前端发送 OpenAI 格式 messages（文本或含 image_url 的多模态内容块），
 * 服务端补充推荐参数（思考档位/输出预算/系统提示词）后转发上游，
 * 流式转发文本与思考过程。
 */
const http = require('http');
const https = require('https');
const API_CONFIG = require('../config/api.config');
const { jsonResponse, setSSEHeaders, sendSSEData } = require('../utils/response');
const { readBody } = require('../utils/request');

/** 默认最大输出 tokens（模型支持 128K；代理默认只有 8192，会把长思考截断） */
const DEFAULT_MAX_TOKENS = 32768;

/** 深度思考模式下注入的系统提示词：引导更长思考链与更完整的回答 */
const DEEP_THINKING_PROMPT = [
  '你是一个极其严谨、深入的AI助手。请充分利用思考过程：',
  '把问题拆解为子问题、从多个角度分析、逐步推理，并主动检查推理中的漏洞与边界情况。',
  '最终回答要完整详尽、结构清晰（用 Markdown 标题/列表/表格组织），',
  '必要时给出推导过程、示例和注意事项，不要省略关键步骤。'
].join('');

/** 归一化 max_tokens：非法值回退默认，范围 [1024, 131072] */
function normalizeMaxTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_MAX_TOKENS;
  return Math.min(131072, Math.max(1024, Math.floor(n)));
}

/**
 * 处理 AI 聊天代理请求
 */
async function handleChatProxy(req, res) {
  try {
    const body = await readBody(req);
    const { apiKey, model, messages, stream, provider = 'zhipu', reasoningEffort, maxTokens } = body;

    const validationError = validateChatParams(apiKey, messages, provider);
    if (validationError) {
      jsonResponse(res, 400, { error: validationError });
      return;
    }

    const config = API_CONFIG[provider];

    // 思考深度：仅透传 low/high/max，其余值不传（走模型默认档）
    const effort = ['low', 'high', 'max'].includes(reasoningEffort) ? reasoningEffort : null;
    // 输出预算：默认 32768，避免长思考被 8192 截断（finish_reason=length）
    const tokensLimit = normalizeMaxTokens(maxTokens);

    // 深度思考模式（high/max）注入系统提示词，引导更长思考与更完整回答
    const finalMessages = (effort === 'high' || effort === 'max') && !messages.some((m) => m.role === 'system')
      ? [{ role: 'system', content: DEEP_THINKING_PROMPT }, ...messages]
      : messages;

    console.log(`[${config.name}] Request: model=${model}, messages=${messages.length}, effort=${effort || 'default'}, max_tokens=${tokensLimit}`);

    setSSEHeaders(res);

    // 客户端断开时销毁当前上游请求
    let currentReq = null;
    req.on('close', () => {
      if (currentReq) currentReq.destroy();
    });

    await forwardChatStream({
      req,
      res,
      apiKey,
      model: model || config.defaultModel,
      config,
      messages: finalMessages,
      reasoningEffort: effort,
      maxTokens: tokensLimit,
      setCurrent: (r) => { currentReq = r; }
    });
  } catch (error) {
    console.error('API proxy error:', error);
    if (!res.writableEnded) {
      jsonResponse(res, 500, { error: error.message });
    }
  }
}

/**
 * 转发一轮对话：请求上游 → 流式转发文本/思考过程/用量 → 结束
 */
function forwardChatStream({ req, res, apiKey, model, config, messages, reasoningEffort, maxTokens, setCurrent }) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      model,
      messages,
      stream: true,
      // 智谱官方推荐参数：temperature=1 / top_p=0.95 / 思考内容保留
      temperature: 1,
      top_p: 0.95,
      thinking: { type: 'enabled', clear_thinking: false },
      // 思考深度：low < high < max，max 为官方推荐档，思考时间最长
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      // 输出预算：默认 8192 会把长思考截断（finish_reason=length），提到 32768
      max_tokens: maxTokens || DEFAULT_MAX_TOKENS
    });

    const options = buildRequestOptions(config, apiKey, requestBody);
    const transport = options.protocol === 'http:' ? http : https;

    const apiReq = transport.request(options, (apiRes) => {
      if (apiRes.statusCode !== 200) {
        handleApiError(apiRes, res);
        resolve();
        return;
      }

      const contentType = apiRes.headers['content-type'] || '';
      if (!contentType.includes('text/event-stream')) {
        // 上游未按流式返回，整包转成 SSE
        handleJsonResponse(apiRes, res);
        resolve();
        return;
      }

      streamUpstream(apiRes, res).then(resolve).catch(reject);
    });

    apiReq.on('error', (error) => {
      if (!res.writableEnded) {
        sendSSEData(res, { error: error.message });
        res.end();
      }
      resolve();
    });

    setCurrent(apiReq);
    apiReq.write(requestBody);
    apiReq.end();
  });
}

/**
 * 流式解析上游响应，把 content / reasoning / usage 转发给前端
 */
async function streamUpstream(apiRes, res) {
  let buffer = '';

  await new Promise((resolveStream) => {
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

          if (delta.content) {
            sendSSEData(res, { content: delta.content });
          }
          if (delta.reasoning_content) {
            sendSSEData(res, { reasoning: delta.reasoning_content });
          }
          if (parsed.usage) {
            sendSSEData(res, { content: '', usage: parsed.usage });
          }
        } catch {
          // 忽略解析错误
        }
      }
    });

    apiRes.on('end', () => {
      res.write('data: [DONE]\n\n');
      res.end();
      resolveStream();
    });
    apiRes.on('error', () => resolveStream());
  });
}

/**
 * 验证聊天参数
 */
function validateChatParams(apiKey, messages, provider) {
  if (!apiKey) {
    return 'API Key is required';
  }
  if (!messages || !Array.isArray(messages)) {
    return 'Messages array is required';
  }
  if (!API_CONFIG[provider]) {
    return `Unknown provider: ${provider}`;
  }
  return null;
}

/**
 * 构建请求选项
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
 * 处理 API 错误响应
 */
function handleApiError(apiRes, res) {
  let errorBody = '';
  apiRes.on('data', chunk => errorBody += chunk);
  apiRes.on('end', () => {
    try {
      const error = JSON.parse(errorBody);
      const errorMsg = error.error?.message || error.message || 'API request failed';
      sendSSEData(res, { error: errorMsg });
    } catch (e) {
      sendSSEData(res, { error: `HTTP ${apiRes.statusCode}` });
    }
    res.end();
  });
}

/**
 * 从上游响应中提取内容/思考过程/用量（非流式整包场景）
 */
function extractChunk(parsed) {
  const choice = parsed.choices?.[0];
  const delta = choice?.delta || choice?.message || {};
  return {
    content: delta.content || '',
    reasoning: delta.reasoning_content || '',
    usage: parsed.usage || null
  };
}

/**
 * 处理非流式 JSON 响应，统一转成 SSE 格式发给前端
 */
function handleJsonResponse(apiRes, res) {
  let body = '';
  apiRes.on('data', (chunk) => body += chunk);
  apiRes.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      const { content, reasoning, usage } = extractChunk(parsed);
      sendSSEData(res, { content, reasoning, usage });
    } catch (e) {
      sendSSEData(res, { error: 'Invalid JSON response from API' });
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });

  apiRes.on('error', (error) => {
    sendSSEData(res, { error: error.message });
    res.end();
  });
}

module.exports = {
  handleChatProxy
};
