/**
 * 语音服务 API 封装
 *
 * 服务端语音由 Python sidecar 提供（voice-service/）：
 * - ASR：FunASR（默认）或 faster-whisper
 * - TTS：edge-tts（默认音色 zh-CN-XiaoxiaoNeural）
 * Node 端通过 /api/voice/* 代理，前端不直连 Python 服务。
 */

const BASE = '/api/voice';

/** 语音服务健康信息 */
export interface VoiceServiceInfo {
  ok: boolean;
  /** 模型是否已加载完成（首次启动需下载/加载模型） */
  ready: boolean;
  asrEngine?: string;
  ttsEngine?: string;
  /** 服务端默认音色（如 zh-CN-XiaoxiaoNeural） */
  defaultVoice?: string;
}

/** 探测语音服务是否在线 */
export async function checkVoiceService(): Promise<VoiceServiceInfo> {
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) return { ok: false, ready: false };
    const data = (await res.json()) as {
      ok?: boolean;
      ready?: boolean;
      asr?: string;
      tts?: string;
      voice?: string;
    };
    return {
      ok: data.ok === true,
      ready: data.ready === true,
      asrEngine: data.asr,
      ttsEngine: data.tts,
      defaultVoice: data.voice
    };
  } catch {
    return { ok: false, ready: false };
  }
}

/**
 * 录音上传转文字（服务端 ASR）
 * 使用 raw 二进制 body 传输，避免 Node 端做 multipart 解析
 */
export async function transcribeAudio(blob: Blob): Promise<string> {
  const res = await fetch(`${BASE}/asr`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'audio/webm' },
    body: blob
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `语音识别失败: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text || '').trim();
}

/** 文本转语音（服务端 TTS），返回 mp3 音频 Blob */
export async function synthesizeSpeech(text: string, voice?: string): Promise<Blob> {
  const res = await fetch(`${BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, ...(voice ? { voice } : {}) })
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `语音合成失败: HTTP ${res.status}`);
  }
  return res.blob();
}
