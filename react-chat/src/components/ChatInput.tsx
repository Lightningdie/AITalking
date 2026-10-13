import { useState, useRef, useEffect, useCallback } from 'react';
import { useVoiceInput } from '../hooks/useVoiceInput';

export interface ChatInputProps {
  onSend: (content: string, images?: string[]) => void;
  /** 由全局 status 派生：requesting | streaming 时为 true */
  disabled?: boolean;
  /** 由全局 status 派生：requesting 时为 true，用于显示发送按钮 loading */
  loading?: boolean;
  placeholder?: string;
  /** true 时麦克风优先走服务端 ASR（FunASR/faster-whisper），否则浏览器识别 */
  preferServerAsr?: boolean;
  /** 发送前回调（用于停止语音朗读/输入，实现"插话即停"） */
  onBeforeSend?: () => void;
}

/** 单条消息最多附带图片数 */
const MAX_IMAGES = 4;

/**
 * 压缩图片：最长边压到 1024px、转 JPEG data URL，控制请求体积
 */
async function compressImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('解析图片失败'));
    image.src = dataUrl;
  });

  const MAX_EDGE = 1024;
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  // 无需缩放且体积可接受时直接用原图，避免二次压缩损失画质
  if (scale >= 1 && dataUrl.length < 300 * 1024) return dataUrl;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function ChatInput({
  onSend,
  disabled,
  loading = false,
  placeholder = '输入消息... (Shift+Enter 换行，可粘贴或上传图片)',
  preferServerAsr = false,
  onBeforeSend
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 语音输入：识别结果直接追加进输入框，interim 实时上屏
  const voice = useVoiceInput({
    preferServer: preferServerAsr,
    onFinal: (text) => setValue((prev) => (prev ? `${prev}${text}` : text))
  });

  // 语音识别的错误与图片错误共用一个提示位
  useEffect(() => {
    if (voice.error) setError(voice.error);
  }, [voice.error]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const addFiles = useCallback(
    async (files: File[]) => {
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length === 0) return;
      setError(null);
      try {
        const compressed = await Promise.all(imageFiles.map(compressImage));
        const room = MAX_IMAGES - images.length;
        if (compressed.length > room) {
          setError(`最多上传 ${MAX_IMAGES} 张图片`);
        }
        if (room <= 0) return;
        setImages((prev) => [...prev, ...compressed].slice(0, MAX_IMAGES));
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [images.length]
  );

  const handleSubmit = () => {
    const trimmed = value.trim();
    if ((trimmed || images.length > 0) && !disabled) {
      onBeforeSend?.();
      voice.reset();
      onSend(trimmed, images.length > 0 ? images : undefined);
      setValue('');
      setImages([]);
      setError(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 支持直接粘贴截图/图片
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  };

  return (
    <div className="input-area">
      {(images.length > 0 || error) && (
        <div className="input-previews">
          {images.map((src, idx) => (
            <div key={idx} className="input-preview">
              <img src={src} alt={`附件 ${idx + 1}`} className="input-preview__img" />
              <button
                type="button"
                className="input-preview__remove"
                onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                title="移除图片"
              >
                ✕
              </button>
            </div>
          ))}
          {error && <span className="input-previews__error">⚠️ {error}</span>}
        </div>
      )}
      {/* 语音输入状态：实时识别文本 / 录音提示 */}
      {(voice.interim || voice.listening || voice.phase === 'transcribing') && (
        <div className="voice-status" role="status">
          {voice.phase === 'transcribing' ? (
            <span className="voice-status__text">⏳ 正在识别录音...</span>
          ) : (
            <>
              <span className="voice-status__dot" />
              <span className="voice-status__text">
                {voice.interim || '正在聆听，再次点击麦克风结束'}
              </span>
            </>
          )}
        </div>
      )}
      <div className="input-wrapper">
        <button
          type="button"
          className={`mic-button ${voice.listening ? 'mic-button--listening' : ''}`}
          onClick={() => (voice.listening ? voice.stop() : voice.start())}
          disabled={disabled && !voice.listening}
          title={
            voice.phase === 'transcribing'
              ? '识别中...'
              : voice.listening
                ? '正在聆听，点击结束'
                : preferServerAsr
                  ? '语音输入（服务端识别）：点击开始'
                  : '语音输入（浏览器识别）：点击开始'
          }
          aria-label="语音输入"
        >
          🎙️
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="上传图片（最多 4 张，支持 jpg/png 等）"
          aria-label="上传图片"
        >
          🖼️
        </button>
        <textarea
          ref={textareaRef}
          className="input-field"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
        />
        <button
          className="send-button"
          onClick={handleSubmit}
          disabled={disabled || (!value.trim() && images.length === 0)}
          aria-busy={loading}
          aria-label={loading ? '请求中' : '发送'}
        >
          {loading ? (
            <span className="send-button__icon send-button__icon--loading">◇</span>
          ) : (
            <span className="send-button__icon">➤</span>
          )}
        </button>
      </div>
    </div>
  );
}

export default ChatInput;
