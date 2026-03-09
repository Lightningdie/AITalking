import type { ReactNode } from 'react';

export interface SwitchModelConfirmModalProps {
  visible: boolean;
  onKeep: () => void;
  onClear: () => void;
  onCancel: () => void;
  /** 可选：展示即将切换到的模型名 */
  targetModelLabel?: ReactNode;
}

export function SwitchModelConfirmModal({
  visible,
  onKeep,
  onClear,
  onCancel,
  targetModelLabel
}: SwitchModelConfirmModalProps) {
  if (!visible) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="switch-model-title">
      <div className="modal-card">
        <h2 id="switch-model-title" className="modal-title">
          切换模型
        </h2>
        <p className="modal-desc">
          当前对话存在历史上下文，切换后是否保留？
          {targetModelLabel != null && (
            <span className="modal-target"> 将切换到：{targetModelLabel}</span>
          )}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn--secondary" onClick={onClear}>
            清空上下文
          </button>
          <button type="button" className="btn btn--primary" onClick={onKeep}>
            保留上下文
          </button>
        </div>
      </div>
    </div>
  );
}
