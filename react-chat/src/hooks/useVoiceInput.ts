import { useState, useCallback, useRef, useEffect } from 'react';
import { transcribeAudio } from '../services/voiceApi';

/**
 * 用户语音输入 Hook（双引擎自动切换）
 *
 * - browser：Web Speech API（Chrome/Edge），实时上屏、边说边出字，无需后端
 * - server：MediaRecorder 录音 → 服务端 FunASR/faster-whisper 识别，精度更高
 *
 * preferServer 为 true 且录音不可用时自动回退浏览器识别。
 */

export type VoiceInputPhase = 'idle' | 'listening' | 'transcribing';

interface UseVoiceInputOptions {
  /** 识别语言（仅浏览器引擎生效） */
  lang?: string;
  /** true 时优先走服务端 ASR */
  preferServer?: boolean;
  /** 单次录音/听写上限（毫秒），超时自动停止 */
  maxDurationMs?: number;
  /** 拿到最终识别文本（可能分多段回调，调用方自行拼接） */
  onFinal: (text: string) => void;
}

/** Web Speech API 在不同浏览器的实现前缀 */
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** 单段录音上限 */
const DEFAULT_MAX_DURATION = 60_000;

export function useVoiceInput({
  lang = 'zh-CN',
  preferServer = false,
  maxDurationMs = DEFAULT_MAX_DURATION,
  onFinal
}: UseVoiceInputOptions) {
  const [phase, setPhase] = useState<VoiceInputPhase>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const phaseRef = useRef<VoiceInputPhase>('idle');
  const setPhaseSafe = useCallback((next: VoiceInputPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const genRef = useRef(0);
  const preferServerRef = useRef(preferServer);
  const onFinalRef = useRef(onFinal);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    preferServerRef.current = preferServer;
  }, [preferServer]);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ---------- 浏览器识别 ----------

  const startRecognition = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      // 浏览器不支持时回退服务端录音识别
      if (navigator.mediaDevices) {
        startRecording();
      } else {
        setPhaseSafe('idle');
        setError('当前浏览器不支持语音识别，请使用 Chrome/Edge 或启动语音服务');
      }
      return;
    }

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          const trimmed = text.trim();
          if (trimmed) onFinalRef.current(trimmed);
        } else {
          interimText += text;
        }
      }
      setInterim(interimText);
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('麦克风权限被拒绝，请在浏览器设置中允许麦克风访问');
        shouldListenRef.current = false;
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('语音识别错误:', event.error);
      }
    };

    // Chrome 会在静音后自动断开，未手动停止时自动重启，保持连续听写
    recognition.onend = () => {
      if (shouldListenRef.current && phaseRef.current === 'listening') {
        try {
          recognition.start();
          return;
        } catch {
          // start 抛错说明引擎还没完全释放，落入正常停止流程
        }
      }
      if (phaseRef.current === 'listening') {
        setPhaseSafe('idle');
        setInterim('');
      }
    };

    recognitionRef.current = recognition;
    shouldListenRef.current = true;
    recognition.start();
    setPhaseSafe('listening');
  }, [lang, setPhaseSafe]);

  const stopRecognition = useCallback(() => {
    shouldListenRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    setInterim('');
    // onend 可能不触发（如从未成功启动），兜底复位
    if (phaseRef.current === 'listening') setPhaseSafe('idle');
  }, [setPhaseSafe]);

  // ---------- 服务端录音识别 ----------

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];

        if (blob.size === 0) {
          setPhaseSafe('idle');
          return;
        }

        // 送服务端识别
        setPhaseSafe('transcribing');
        const gen = genRef.current;
        transcribeAudio(blob)
          .then((text) => {
            if (gen !== genRef.current) return;
            if (text) onFinalRef.current(text);
            setPhaseSafe('idle');
          })
          .catch((err) => {
            if (gen !== genRef.current) return;
            setError((err as Error).message || '语音识别失败');
            setPhaseSafe('idle');
          });
      };

      recorderRef.current = recorder;
      recorder.start(250);
      setPhaseSafe('listening');

      // 超时自动停止
      timerRef.current = setTimeout(() => {
        if (phaseRef.current === 'listening' && recorderRef.current?.state === 'recording') {
          recorderRef.current.stop();
        }
      }, maxDurationMs);
    } catch (err) {
      setPhaseSafe('idle');
      const e = err as Error;
      if (e.name === 'NotAllowedError') {
        setError('麦克风权限被拒绝，请在浏览器设置中允许麦克风访问');
      } else {
        setError('无法访问麦克风: ' + e.message);
      }
    }
  }, [maxDurationMs, setPhaseSafe]);

  const stopRecording = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      // 录音从未启动（如权限弹窗阶段点了停止）
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setPhaseSafe('idle');
    }
    recorderRef.current = null;
  }, [clearTimer, setPhaseSafe]);

  // ---------- 对外接口 ----------

  /** 结束语音输入（再次点击麦克风） */
  const stop = useCallback(() => {
    clearTimer();
    genRef.current++;
    if (phaseRef.current === 'listening') {
      if (recognitionRef.current) stopRecognition();
      else stopRecording();
    } else if (phaseRef.current === 'transcribing') {
      // 识别中点停止：放弃本次结果
      genRef.current++;
      setPhaseSafe('idle');
    }
  }, [clearTimer, setPhaseSafe, stopRecognition, stopRecording]);

  /** 开始语音输入（点击麦克风） */
  const start = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    setError(null);
    genRef.current++;
    if (preferServerRef.current) {
      startRecording();
    } else {
      startRecognition();
    }
    // 单次会话总时长上限（浏览器引擎也适用，避免无限听写）
    timerRef.current = setTimeout(() => {
      stop();
    }, maxDurationMs + 10_000);
  }, [startRecording, startRecognition, stop, maxDurationMs]);

  /** 发送消息前清理语音状态 */
  const reset = useCallback(() => {
    genRef.current++;
    clearTimer();
    shouldListenRef.current = false;
    try {
      recognitionRef.current?.abort();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    chunksRef.current = [];
    setInterim('');
    setPhaseSafe('idle');
  }, [clearTimer, setPhaseSafe]);

  // 卸载时兜底释放麦克风
  useEffect(() => {
    return () => {
      genRef.current++;
      clearTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      recorderRef.current?.stream?.getTracks().forEach((track) => track.stop());
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [clearTimer]);

  return { phase, listening: phase === 'listening', interim, error, start, stop, reset };
}
