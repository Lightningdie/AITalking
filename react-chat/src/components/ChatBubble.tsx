import { memo, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { MessageContent } from './MessageContent';
import { ToolCallStatus } from './ToolCallStatus';
import { exportDocument } from '../services/toolsApi';
import type { MessageRole, ToolCallInfo } from '../types';

// Milkdown 体积较大，懒加载为独立 chunk，首屏不加载
const MilkdownView = lazy(() =>
  import('./MilkdownView').then((m) => ({ default: m.MilkdownView }))
);

export interface ChatBubbleProps {
  role: MessageRole;
  content: string;
  /** 消息附带的图片（data URL 列表） */
  images?: string[];
  reasoningContent?: string;
  /** 本轮工具调用过程（agent toolCall / toolResult 事件驱动） */
  toolCalls?: ToolCallInfo[];
  isStreaming?: boolean;
  /** 是否显示思考过程（全局开关） */
  showThinking?: boolean;
}

export const ChatBubble = memo(function ChatBubble({
  role,
  content,
  images,
  reasoningContent,
  toolCalls,
  isStreaming = false,
  showThinking = true
}: ChatBubbleProps) {
  const roleClass = role === 'error' ? 'error' : role;
  const avatar = role === 'user' ? '👤' : role === 'error' ? '⚠️' : '🤖';

  // 流式期间第一条思考内容到达时自动展开，之后由用户手动控制
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (showThinking && reasoningContent && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setThinkingOpen(true);
    }
  }, [showThinking, reasoningContent]);

  const hasThinking = showThinking && !!reasoningContent;

  // 消息导出为 Word / Excel / Markdown
  const [exporting, setExporting] = useState<'docx' | 'xlsx' | 'md' | null>(null);

  const handleExport = async (type: 'docx' | 'xlsx' | 'md') => {
    if (!content || exporting) return;
    setExporting(type);
    try {
      const { fileName, url } = await exportDocument({
        type,
        title: content.replace(/[#*`>\s]/g, '').slice(0, 20) || 'AI文档',
        markdown: content
      });
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('导出失败:', error);
      alert(`导出失败: ${(error as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  const canExport = role === 'assistant' && !isStreaming && !!content;

  return (
    <div className={`chat-bubble chat-bubble--${roleClass}`}>
      <div className="chat-bubble__avatar">{avatar}</div>
      <div className="chat-bubble__main">
        <div className="chat-bubble__content">
        {images && images.length > 0 && (
          <div className="bubble-images">
            {images.map((src, idx) => (
              <img
                key={idx}
                src={src}
                alt={`图片 ${idx + 1}`}
                className="bubble-images__item"
                onClick={() => window.open(src, '_blank')}
              />
            ))}
          </div>
        )}
        {hasThinking && (
          <details
            className={`thinking-block ${isStreaming ? 'thinking-block--streaming' : ''}`}
            open={thinkingOpen}
            onClick={(e) => {
              e.preventDefault();
              setThinkingOpen((o) => !o);
            }}
          >
            <summary className="thinking-block__summary">
              💭 思考过程{isStreaming && !content ? '中…' : ''}
            </summary>
            <div className="thinking-block__content">{reasoningContent}</div>
          </details>
        )}
        <ToolCallStatus calls={toolCalls} />
        {isStreaming && !content ? (
          <TypingDots />
        ) : role === 'assistant' && content ? (
          // AI 回复全程用 Milkdown 渲染：流式阶段实时预览 Markdown，完成后保持同一编辑器实例
          <Suspense fallback={<MessageContent content={content} />}>
            <MilkdownView content={content} />
          </Suspense>
        ) : (
          <MessageContent content={content} />
        )}
        </div>

        {canExport && (
          <div className="bubble-actions">
            <button
              type="button"
              className="bubble-actions__btn"
              onClick={() => handleExport('docx')}
              disabled={!!exporting}
              title="将这条回复导出为 Word 文档"
            >
              📄 {exporting === 'docx' ? '生成中…' : 'Word'}
            </button>
            <button
              type="button"
              className="bubble-actions__btn"
              onClick={() => handleExport('xlsx')}
              disabled={!!exporting}
              title="将这条回复中的表格导出为 Excel"
            >
              📊 {exporting === 'xlsx' ? '生成中…' : 'Excel'}
            </button>
            <button
              type="button"
              className="bubble-actions__btn"
              onClick={() => handleExport('md')}
              disabled={!!exporting}
              title="将这条回复原样导出为 Markdown 文件"
            >
              📝 {exporting === 'md' ? '生成中…' : 'Markdown'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export function TypingDots() {
  return (
    <div className="typing-dots">
      <span className="typing-dots__dot" />
      <span className="typing-dots__dot" />
      <span className="typing-dots__dot" />
    </div>
  );
}

export default ChatBubble;
