import type { TokenStats, ChatStatus, ConversationMeta } from '../types';

const PROVIDERS = {
  zhipu: {
    name: '智谱 AI',
    models: [
      { value: 'glm-5.3', label: 'GLM-5.3' },
      { value: 'glm-5.3-flash', label: 'GLM-5.3 Flash (免费)' },
      { value: 'glm-5', label: 'GLM-5' }
    ],
    placeholder: '请输入智谱 API Key'
  }
} as const;

export type ProviderKey = keyof typeof PROVIDERS;

export interface SidebarProps {
  provider: ProviderKey;
  onProviderChange: (provider: ProviderKey) => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  /** 思考深度：low / high / max / default */
  reasoningEffort: string;
  onReasoningEffortChange: (value: string) => void;
  contextLength: number;
  onContextLengthChange: (value: number) => void;
  stats: TokenStats;
  onClear: () => void;
  onExport: () => void;
  hasMessages: boolean;
  isOffline: boolean;
  /** 全局对话状态，导出/清空按钮禁用由此派生 */
  status: ChatStatus;
  /** 历史对话 */
  conversations: ConversationMeta[];
  currentConversationId: string | null;
  onLoadConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}

export function Sidebar({
  provider,
  onProviderChange,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  reasoningEffort,
  onReasoningEffortChange,
  contextLength,
  onContextLengthChange,
  stats,
  onClear,
  onExport,
  hasMessages,
  isOffline,
  status,
  conversations,
  currentConversationId,
  onLoadConversation,
  onDeleteConversation
}: SidebarProps) {
  const actionDisabled = status === 'requesting' || status === 'streaming';
  const currentProvider = PROVIDERS[provider] ?? PROVIDERS.zhipu;

  const handleProviderChange = (newProvider: string) => {
    const key = newProvider as ProviderKey;
    onProviderChange(key);
    const defaultModel = PROVIDERS[key]?.models[0]?.value;
    if (defaultModel) {
      onModelChange(defaultModel);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <h1 className="sidebar__logo">🤖 AI Chat</h1>
        {isOffline && <div className="offline-badge">📡 离线</div>}
      </div>

      <div className="sidebar__content">
        {isOffline && (
          <div className="offline-notice">⚠️ 网络连接已断开，请检查网络后重试</div>
        )}

        <div className="config-section">
          <label className="config-section__label">🏢 API 提供商</label>
          <select
            className="config-section__select"
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
          >
            <option value="zhipu">智谱 AI</option>
          </select>
        </div>

        <div className="config-section">
          <label className="config-section__label">🔑 API Key</label>
          <input
            type="password"
            className="config-section__input"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={currentProvider.placeholder}
          />
          <small className="config-section__hint">密钥仅保存在本地浏览器</small>
        </div>

        <div className="config-section">
          <label className="config-section__label">🧠 模型</label>
          <select
            className="config-section__select"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
          >
            {currentProvider.models.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="config-section">
          <label className="config-section__label">🧩 思考深度</label>
          <select
            className="config-section__select"
            value={reasoningEffort}
            onChange={(e) => onReasoningEffortChange(e.target.value)}
          >
            <option value="max">极限（思考最久，推荐）</option>
            <option value="high">深度（思考更久）</option>
            <option value="low">快速（浅思考）</option>
            <option value="default">模型默认</option>
          </select>
          <small className="config-section__hint">
            档位越高思考时间越长，回答更严谨但响应更慢
          </small>
        </div>

        <div className="stats-card">
          <h3 className="stats-card__title">📊 Token 统计</h3>
          <div className="stats-grid">
            <div className="stats-item">
              <span className="stats-item__label">本轮输入</span>
              <span className="stats-item__value">{stats.promptTokens.toLocaleString()}</span>
            </div>
            <div className="stats-item">
              <span className="stats-item__label">本轮输出</span>
              <span className="stats-item__value">{stats.completionTokens.toLocaleString()}</span>
            </div>
            <div className="stats-item">
              <span className="stats-item__label">累计消耗</span>
              <span className="stats-item__value stats-item__value--highlight">
                {stats.totalTokens.toLocaleString()}
              </span>
            </div>
            <div className="stats-item">
              <span className="stats-item__label">对话轮数</span>
              <span className="stats-item__value">{stats.turnCount}</span>
            </div>
          </div>
        </div>

        <div className="config-section">
          <label className="config-section__label">💬 上下文轮数</label>
          <input
            type="number"
            className="config-section__input"
            value={contextLength}
            onChange={(e) => onContextLengthChange(Number(e.target.value))}
            min={1}
            max={50}
          />
          <small className="config-section__hint">保留最近 N 轮对话作为上下文</small>
        </div>

        <div className="history-section">
          <label className="config-section__label">🕓 历史对话</label>
          {conversations.length === 0 ? (
            <div className="history-empty">暂无历史记录</div>
          ) : (
            <div className="history-list">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`history-item ${
                    conv.id === currentConversationId ? 'history-item--active' : ''
                  }`}
                  onClick={() => onLoadConversation(conv.id)}
                >
                  <div className="history-item__body">
                    <div className="history-item__title" title={conv.title}>
                      {conv.title || '未命名对话'}
                    </div>
                    <div className="history-item__meta">
                      {conv.model || '未知模型'} · {conv.messageCount} 条 ·{' '}
                      {new Date(conv.updatedAt).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="history-item__delete"
                    title="删除该对话"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sidebar__footer">
        <button
          className="btn btn--primary btn--full"
          onClick={onExport}
          disabled={!hasMessages || actionDisabled}
          style={{ marginBottom: '8px' }}
          title={actionDisabled ? '请求进行中时不可用' : undefined}
        >
          📥 导出 Markdown
        </button>
        <button
          className="btn btn--ghost btn--full"
          onClick={onClear}
          disabled={actionDisabled}
          title={actionDisabled ? '请求进行中时不可用' : undefined}
        >
          🗑️ 清空对话
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
