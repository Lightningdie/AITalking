import { useState, useRef, useEffect } from 'react';

export interface InputBoxProps {
  onSend: (content: string) => void;
  /** 禁用整个输入区域（如正在请求中） */
  disabled?: boolean;
  /** 仅禁用发送按钮（如未填 API Key），输入框仍可聚焦输入 */
  sendDisabled?: boolean;
  loading?: boolean;
  placeholder?: string;
}

export function InputBox({
  onSend,
  disabled,
  sendDisabled,
  loading = false,
  placeholder = '输入消息... (Shift+Enter 换行)'
}: InputBoxProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const canSend = !disabled && !sendDisabled;

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed && canSend) {
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
          disabled={!canSend || !value.trim()}
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

export default InputBox;
