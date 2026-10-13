import { useState, useCallback, useRef, useEffect } from 'react';
import { synthesizeSpeech } from '../services/voiceApi';

/**
 * AI 回复语音朗读 Hook
 *
 * 两种引擎：
 * - browser：window.speechSynthesis，零依赖，音色取决于系统
 * - server：Python 语音服务（edge-tts），音色自然，按句子流式合成
 *
 * 核心能力 feed(id, text, final)：
 * SSE 流式输出期间持续喂入增量文本，按中英文标点切句，
 * 每凑齐一句立即送合成/朗读 —— AI 还在打字时就开始说话。
 */

/** 朗读模式：off 关闭 / browser 浏览器朗读 / server 服务端高清语音 */
export type VoicePlayMode = 'off' | 'browser' | 'server';

/** 服务端合成单句最大长度（防异常超长句拖垮合成） */
const MAX_SENTENCE_LENGTH = 300;

/**
 * 清理 markdown，得到适合朗读的纯文本：
 * 代码块直接跳过（读代码没有意义），链接只读文字，去掉装饰符号
 */
function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '链接')
    .replace(/[#*_>|~$]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 在 buffer 中找第一个句末分隔符的下标（连带其后紧随的收尾引号/括号） */
function findSentenceEnd(buffer: string): number {
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];
    if ('。！？!?；;\n…'.includes(ch)) {
      let end = i;
      while (end + 1 < buffer.length && '"』」）)】"'.includes(buffer[end + 1])) {
        end++;
      }
      return end;
    }
  }
  return -1;
}

interface UseVoicePlaybackOptions {
  mode: VoicePlayMode;
  /** 服务端音色，不传则用服务端默认值 */
  voice?: string;
}

export function useVoicePlayback({ mode, voice }: UseVoicePlaybackOptions) {
  const [speaking, setSpeaking] = useState(false);

  /** 代数令牌：stop/换消息时自增，持旧代数的异步任务结果全部丢弃 */
  const genRef = useRef(0);
  /** 当前正在朗读的消息 id（只朗读自己喂过流式增量的那条消息） */
  const currentIdRef = useRef<string | null>(null);
  /** 尚未凑成完整句子的原始文本 */
  const bufferRef = useRef('');
  /** 当前消息已消费到第几个字符（feed 支持传全量内容，内部取增量） */
  const consumedRef = useRef(0);
  /** 浏览器模式：已入队未播完的 utterance 数 */
  const pendingUtterancesRef = useRef(0);
  /** 服务端模式：句子序号 → 已合成音频，按序号顺序播放 */
  const seqRef = useRef(0);
  const playSeqRef = useRef(0);
  const blobQueueRef = useRef(new Map<number, Blob>());
  const drainingRef = useRef(false);
  const inFlightRef = useRef(0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  /** mode/voice 存 ref，保证 feed 等回调稳定不重建 */
  const modeRef = useRef(mode);
  const voiceRef = useRef(voice);
  useEffect(() => {
    modeRef.current = mode;
    voiceRef.current = voice;
  }, [mode, voice]);

  /** 若没有任何在播/在合成/待播的内容，复位 speaking */
  const maybeSettleSpeaking = useCallback(() => {
    if (
      !drainingRef.current &&
      inFlightRef.current === 0 &&
      !blobQueueRef.current.has(playSeqRef.current) &&
      pendingUtterancesRef.current === 0
    ) {
      setSpeaking(false);
    }
  }, []);

  /** 停止朗读并清空所有队列 */
  const stop = useCallback(() => {
    genRef.current++;
    currentIdRef.current = null;
    bufferRef.current = '';
    consumedRef.current = 0;
    pendingUtterancesRef.current = 0;
    seqRef.current = 0;
    playSeqRef.current = 0;
    blobQueueRef.current.clear();
    drainingRef.current = false;
    inFlightRef.current = 0;
    window.speechSynthesis?.cancel();
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      if (currentAudioRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(currentAudioRef.current.src);
      }
      currentAudioRef.current = null;
    }
    setSpeaking(false);
  }, []);

  // 切到 off 时立即停止
  useEffect(() => {
    if (mode === 'off') stop();
  }, [mode, stop]);

  // 组件卸载时清理音频资源
  useEffect(() => {
    const audio = currentAudioRef.current;
    return () => {
      window.speechSynthesis?.cancel();
      audio?.pause();
    };
  }, []);

  // ---------- 浏览器引擎 ----------

  const speakWithBrowser = useCallback((text: string) => {
    const gen = genRef.current;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.05;
    pendingUtterancesRef.current++;
    setSpeaking(true);
    const done = () => {
      if (gen !== genRef.current) return;
      pendingUtterancesRef.current--;
      if (pendingUtterancesRef.current <= 0) {
        pendingUtterancesRef.current = 0;
        setSpeaking(false);
      }
    };
    utterance.onend = done;
    utterance.onerror = done;
    window.speechSynthesis.speak(utterance);
  }, []);

  // ---------- 服务端引擎 ----------

  /** 顺序消费已合成的句子音频，保证与文本一致的计划顺序 */
  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    const drainGen = genRef.current;
    setSpeaking(true);
    try {
      while (true) {
        if (genRef.current !== drainGen || !blobQueueRef.current.has(playSeqRef.current)) break;

        const blob = blobQueueRef.current.get(playSeqRef.current)!;
        blobQueueRef.current.delete(playSeqRef.current);
        playSeqRef.current++;

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudioRef.current = audio;
        try {
          await new Promise<void>((resolve) => {
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            audio.play().catch(() => resolve());
          });
        } finally {
          URL.revokeObjectURL(url);
          if (currentAudioRef.current === audio) currentAudioRef.current = null;
        }
      }
    } finally {
      drainingRef.current = false;
      maybeSettleSpeaking();
    }
  }, [maybeSettleSpeaking]);

  const enqueueServerSentence = useCallback(
    (text: string) => {
      const gen = genRef.current;
      const seq = seqRef.current++;
      inFlightRef.current++;
      setSpeaking(true);
      synthesizeSpeech(text.slice(0, MAX_SENTENCE_LENGTH), voiceRef.current)
        .then((blob) => {
          if (gen !== genRef.current) return;
          blobQueueRef.current.set(seq, blob);
          drainQueue();
        })
        .catch((err) => {
          console.warn(`第 ${seq + 1} 句语音合成失败，已跳过:`, (err as Error).message);
        })
        .finally(() => {
          inFlightRef.current--;
          if (gen === genRef.current) maybeSettleSpeaking();
        });
    },
    [drainQueue, maybeSettleSpeaking]
  );

  // ---------- 句子切分与分发 ----------

  const emitSentence = useCallback(
    (raw: string) => {
      const cleaned = cleanForSpeech(raw);
      if (!cleaned) return;
      if (modeRef.current === 'browser') {
        speakWithBrowser(cleaned);
      } else if (modeRef.current === 'server') {
        enqueueServerSentence(cleaned);
      }
    },
    [speakWithBrowser, enqueueServerSentence]
  );

  /**
   * 喂入消息文本。
   * - 流式期间：feed(id, partialContent, false)，内部自动取增量切句
   * - 消息完成：feed(id, fullContent, true) 冲刷最后一句
   * 只有已经喂过流式增量（id 匹配）的 final 才会生效，
   * 避免加载历史对话时把整段记录读出来。
   */
  const feed = useCallback(
    (id: string, text: string, final: boolean) => {
      if (modeRef.current === 'off') return;
      if (final && currentIdRef.current !== id) return;

      if (currentIdRef.current !== id) {
        // 新消息：换代废弃旧任务，重置缓冲从头消费
        genRef.current++;
        currentIdRef.current = id;
        bufferRef.current = '';
        consumedRef.current = 0;
        seqRef.current = 0;
        playSeqRef.current = 0;
      }

      if (text.length > consumedRef.current) {
        bufferRef.current += text.slice(consumedRef.current);
        consumedRef.current = text.length;
      }

      // 循环切出完整句子
      while (true) {
        const end = findSentenceEnd(bufferRef.current);
        if (end === -1) break;
        const sentence = bufferRef.current.slice(0, end + 1);
        bufferRef.current = bufferRef.current.slice(end + 1);
        emitSentence(sentence);
      }

      if (final) {
        const rest = bufferRef.current;
        bufferRef.current = '';
        if (rest.trim()) emitSentence(rest);
        maybeSettleSpeaking();
      }
    },
    [emitSentence, maybeSettleSpeaking]
  );

  return { speaking, feed, stop };
}
