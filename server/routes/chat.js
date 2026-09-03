/**
 * AI 聊天代理路由
 */
const http = require('http');
const https = require('https');
const API_CONFIG = require('../config/api.config');
const { jsonResponse, setSSEHeaders, sendSSEData } = require('../utils/response');
const { readBody } = require('../utils/request');

/**
 * 处理 AI 聊天代理请求
 * @param {Object} req - HTTP 请求对象
 * @param {Object} res - HTTP 响应对象
 */
async function handleChatProxy(req, res) {
  try {
    const body = await readBody(req);
    const { apiKey, model, messages, stream, provider = 'zhipu' } = body;
    
    // 验证参数
    const validationError = validateChatParams(apiKey, messages, provider);
    if (validationError) {
      jsonResponse(res, 400, { error: validationError });
      return;
    }
    
    const config = API_CONFIG[provider];
    console.log(`[${config.name}] Request: model=${model}, messages=${messages.length}`);
    
    // 构建请求
    const requestBody = buildRequestBody(model, messages, stream, config);
    const options = buildRequestOptions(config, apiKey, requestBody);
    
    // 设置 SSE 响应头
    setSSEHeaders(res);
    
    // 发起 API 请求
    const apiReq = createApiRequest(options, res);
    
    // 客户端断开时取消请求
    req.on('close', () => {
      apiReq.destroy();
    });
    
    apiReq.write(requestBody);
    apiReq.end();
    
  } catch (error) {
    console.error('API proxy error:', error);
    jsonResponse(res, 500, { error: error.message });
  }
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
 * 构建请求体
 */
function buildRequestBody(model, messages, stream, config) {
  return JSON.stringify({
    model: model || config.defaultModel,
    messages: messages,
    stream: stream !== false
  });
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
 * 创建 API 请求并处理响应
 */
function createApiRequest(options, res) {
  const transport = options.protocol === 'http:' ? http : https;
  const apiReq = transport.request(options, (apiRes) => {
    // 处理错误响应
    if (apiRes.statusCode !== 200) {
      handleApiError(apiRes, res);
      return;
    }

    const contentType = apiRes.headers['content-type'] || '';
    if (contentType.includes('text/event-stream')) {
      // 流式转发响应
      handleStreamResponse(apiRes, res);
    } else {
      // 非流式 JSON 响应，整包转发
      handleJsonResponse(apiRes, res);
    }
  });
  
  apiReq.on('error', (error) => {
    sendSSEData(res, { error: error.message });
    res.end();
  });
  
  return apiReq;
}

/**
 * 从上游响应中提取内容/思考过程/用量
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
 * 处理流式响应（SSE）
 */
function handleStreamResponse(apiRes, res) {
  apiRes.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);

        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const { content, reasoning, usage } = extractChunk(parsed);

          if (content || reasoning || usage) {
            sendSSEData(res, { content, reasoning, usage });
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  });

  apiRes.on('end', () => {
    res.end();
  });

  apiRes.on('error', (error) => {
    sendSSEData(res, { error: error.message });
    res.end();
  });
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
