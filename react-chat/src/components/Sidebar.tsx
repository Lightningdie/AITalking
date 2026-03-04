import type { TokenStats, ChatStatus, Message, SessionMeta } from '../types';

const PROVIDERS = {
  zhipu: {
    name: '智谱 AI',
    models: [
      { value: 'glm-4.5-flash', label: 'GLM-4.5 Flash (免费)' },
      { value: 'glm-4-flash', label: 'GLM-4 Flash (免费)' },
      { value: 'glm-4-plus', label: 'GLM-4 Plus' },
      { value: 'glm-4', label: 'GLM-4' }
    ],
    placeholder: '请输入智谱 API Key'
  },
  spark: {
    name: '讯飞星火',
    models: [
      { value: 'lite', label: 'Spark Lite (免费)' },
      { value: 'generalv3', label: 'Spark Pro' },
      { value: 'pro-128k', label: 'Spark Pro 128K' },
      { value: 'max-32k', label: 'Spark Max 32K' },
      { value: '4.0Ultra', label: 'Spark 4.0 Ultra' }
    ],
    placeholder: '请输入讯飞 API Key'
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
  contextLength: number;
  onContextLengthChange: (value: number) => void;
  stats: TokenStats;
  onClear: () => void;
  onExport: () => void;
  hasMessages: boolean;
  isOffline: boolean;
  status: ChatStatus;
  /** 当前上下文估算 token 数 */
  contextTokens: number;
  /** 是否达到预警阈值（如 80%） */
  tokenWarningReached: boolean;
  contextTokenLimit?: number;
  tokenWarningThreshold?: number;
  /** 当前会发给模型的上下文消息（用于可视化） */
  contextMessages: Message[];
  /** 是否将 system 纳入上下文 */
  includeSystemInContext?: boolean;
  onIncludeSystemInContextChange?: (value: boolean) => void;
  /** 会话管理（可选） */
  sessions?: SessionMeta[];
  currentSessionId?: string;
  onCreateSession?: () => void;
  onSwitchSession?: (id: string) => void;
  onDeleteSession?: (id: string) => void;
}

export function Sidebar({
  provider,
  onProviderChange,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  contextLength,
  onContextLengthChange,
  stats,
  onClear,
  onExport,
  hasMessages,
  isOffline,
  status,
  contextTokens,
  tokenWarningReached,
  contextTokenLimit = 128000,
  tokenWarningThreshold = 0.8,
  contextMessages,
  includeSystemInContext = true,
  onIncludeSystemInContextChange,
  sessions = [],
  currentSessionId,
  onCreateSession,
  onSwitchSession,
  onDeleteSession
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

        {onCreateSession && onSwitchSession && (
          <div className="session-list">
            <div className="session-list__header">
              <span className="session-list__title">💬 会话</span>
              <button
                type="button"
                className="btn btn--ghost session-list__new"
                onClick={onCreateSession}
                disabled={actionDisabled}
                title="新建会话"
              >
                ➕ 新建
              </button>
            </div>
            <ul className="session-list__items">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  className={`session-list__item ${currentSessionId === s.id ? 'session-list__item--active' : ''}`}
                  onClick={() => onSwitchSession(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSwitchSession(s.id);
                    }
                  }}
                  title={s.title || '新对话'}
                >
                  <span className="session-list__item-btn session-list__item-title">
                    {s.title || '新对话'}
                  </span>
                  {onDeleteSession && (
                    <button
                      type="button"
                      className="session-list__item-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onDeleteSession(s.id);
                      }}
                      disabled={actionDisabled}
                      title="删除会话"
                      aria-label="删除会话"
                    >
                      🗑️
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="config-section">
          <label className="config-section__label">🏢 API 提供商</label>
          <select
            className="config-section__select"
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
          >
            <option value="zhipu">智谱 AI</option>
            <option value="spark">讯飞星火</option>
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

        <div className="stats-card stats-card--context">
          <h3 className="stats-card__title">📐 上下文 Token</h3>
          <div className="stats-grid">
            <div className="stats-item">
              <span className="stats-item__label">当前估算</span>
              <span className="stats-item__value">{contextTokens.toLocaleString()}</span>
            </div>
            <div className="stats-item">
              <span className="stats-item__label">上限</span>
              <span className="stats-item__value">{contextTokenLimit.toLocaleString()}</span>
            </div>
          </div>
          {tokenWarningReached && (
            <div className="token-warning" role="alert">
              ⚠️ 上下文已达 {Math.round(tokenWarningThreshold * 100)}%，建议清空或减少轮数，避免超限报错
            </div>
          )}
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
          <small className="config-section__hint">只保留最近 N 轮对话作为上下文</small>
        </div>

        {onIncludeSystemInContextChange && (
          <label className="config-section config-section--checkbox">
            <input
              type="checkbox"
              checked={includeSystemInContext}
              onChange={(e) => onIncludeSystemInContextChange(e.target.checked)}
            />
            <span className="config-section__label">上下文包含 system 消息</span>
          </label>
        )}

        <div className="context-preview">
          <h3 className="context-preview__title">📋 当前上下文（将发给模型）</h3>
          <p className="context-preview__hint">以下 {contextMessages.length} 条消息会在下次请求时作为上下文发送</p>
          {contextMessages.length === 0 ? (
            <p className="context-preview__empty">暂无，发送一条消息后此处会显示</p>
          ) : (
            <ul className="context-preview__list">
              {contextMessages.map((msg) => (
                <li key={msg.id} className="context-preview__item">
                  <span className="context-preview__role">
                    {msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '⚙️'}
                  </span>
                  <span className="context-preview__content" title={msg.content}>
                    {msg.content.slice(0, 50)}
                    {msg.content.length > 50 ? '…' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--full context-preview__clear"
            onClick={onClear}
            disabled={actionDisabled}
            title="清空后上下文为空，下次发送将无历史"
          >
            🗑️ 一键清空上下文
          </button>
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
          title={actionDisabled ? '请求进行中时不可用' : '清空对话与上下文'}
        >
          🗑️ 清空对话
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
