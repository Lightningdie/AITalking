import type { ToolCallInfo } from '../types';

/** 工具显示名（新工具在 registry 注册后在此补充中文标签） */
const TOOL_LABELS: Record<string, string> = {
  generate_document: '文档生成'
};

const STATUS_META: Record<ToolCallInfo['status'], { icon: string; label: string }> = {
  running: { icon: '🔧', label: '调用中…' },
  ok: { icon: '✅', label: '完成' },
  error: { icon: '❌', label: '失败' }
};

/**
 * 工具调用状态行：渲染 agent 循环中的 toolCall / toolResult 过程，
 * 让模型自主调用工具的过程对用户可见（设计文档 §4.4）。
 */
export function ToolCallStatus({ calls }: { calls?: ToolCallInfo[] }) {
  if (!calls || calls.length === 0) return null;

  return (
    <div className="tool-call-list">
      {calls.map((call, idx) => {
        const meta = STATUS_META[call.status] || STATUS_META.running;
        return (
          <div key={call.id || `${call.name}-${idx}`} className={`tool-call tool-call--${call.status}`}>
            <span className="tool-call__icon">{meta.icon}</span>
            <span className="tool-call__body">
              <span className="tool-call__name">
                {TOOL_LABELS[call.name] || call.name}
                {call.status === 'running' ? ` ${meta.label}` : ` ${meta.label}`}
              </span>
              {call.argsSummary && (
                <span className="tool-call__detail" title={call.argsSummary}>
                  {call.argsSummary}
                </span>
              )}
              {call.resultSummary && (
                <span className="tool-call__detail">{call.resultSummary}</span>
              )}
            </span>
            {call.resultUrl && (
              <a
                className="tool-call__link"
                href={call.resultUrl}
                target="_blank"
                rel="noreferrer"
              >
                下载
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ToolCallStatus;
