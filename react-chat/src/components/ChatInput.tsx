import { useState, useRef, useEffect } from 'react';

export interface ChatInputProps {
  onSend: (content: string) => void;
  /** 由全局 status 派生：requesting | streaming 时为 true */
  disabled?: boolean;
  /** 由全局 status 派生：requesting 时为 true，用于显示发送按钮 loading */
  loading?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled,
  loading = false,
  placeholder = '输入消息... (Shift+Enter 换行)'
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="input-area">
      <div className="input-wrapper">
        <textarea
          ref={textareaRef}
          className="input-field"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
        />
        <button
          className="send-button"
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
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
