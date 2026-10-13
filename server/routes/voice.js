/**
 * 语音代理路由 /api/voice/*
 *
 * 前端不直连 Python 语音服务，统一经 Node 代理：
 * - POST /api/voice/asr     录音 → 文字（raw 二进制 body 直传）
 * - POST /api/voice/tts     文字 → mp3 音频流
 * - GET  /api/voice/health  语音服务健康探测
 */
const { VOICE_SERVICE_URL, VOICE_PROXY_TIMEOUT } = require('../config/constants');

/** raw body 上限：60s 录音的 webm/opus 约 300KB，放宽到 15MB 足够 */
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

/** 读取 raw 二进制 body */
function readRawBody(req, limit = MAX_AUDIO_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('录音文件过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** 上游不可达时统一返回 502 */
function sendServiceUnavailable(res) {
  res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(
    JSON.stringify({
      error: '语音服务不可用，请先启动: npm run voice（详见 voice-service/README.md）'
    })
  );
}

/** 录音转文字：raw body 直传上游 */
async function handleVoiceAsr(req, res) {
  try {
    const body = await readRawBody(req);
    if (body.length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '录音内容为空' }));
      return;
    }

    const upstream = await fetch(`${VOICE_SERVICE_URL}/asr`, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'audio/webm',
        'Content-Length': body.length
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(VOICE_PROXY_TIMEOUT)
    });

    const text = await upstream.text();
    res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(text);
  } catch (error) {
    if (error.name === 'TimeoutError') {
      res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '语音识别超时，请重试' }));
      return;
    }
    console.error('ASR 代理失败:', error.message);
    sendServiceUnavailable(res);
  }
}

/** 文字转语音：JSON 进、mp3 流出 */
async function handleVoiceTts(req, res) {
  try {
    const body = await readRawBody(req, 1024 * 1024);
    const payload = JSON.parse(body.toString('utf-8'));
    const text = (payload.text || '').trim();

    if (!text) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '合成文本为空' }));
      return;
    }
    if (text.length > 2000) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '合成文本过长（上限 2000 字）' }));
      return;
    }

    const upstream = await fetch(`${VOICE_SERVICE_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, ...(payload.voice ? { voice: payload.voice } : {}) }),
      signal: AbortSignal.timeout(VOICE_PROXY_TIMEOUT)
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(errText);
      return;
    }

    // 音频流式回传
    res.writeHead(200, {
      'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
      'Cache-Control': 'no-store'
    });
    if (upstream.body) {
      const { Readable } = require('stream');
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error.name === 'TimeoutError') {
      res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '语音合成超时，请重试' }));
      return;
    }
    if (error instanceof SyntaxError) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '请求体不是合法 JSON' }));
      return;
    }
    console.error('TTS 代理失败:', error.message);
    sendServiceUnavailable(res);
  }
}

/** 健康探测：2 秒内无响应视为离线 */
async function handleVoiceHealth(res) {
  try {
    const upstream = await fetch(`${VOICE_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000)
    });
    const data = await upstream.text();
    res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(data);
  } catch {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, ready: false }));
  }
}

module.exports = {
  handleVoiceAsr,
  handleVoiceTts,
  handleVoiceHealth
};
