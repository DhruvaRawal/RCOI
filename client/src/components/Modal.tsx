import { type ReactNode, useEffect } from 'react';

interface ModalProps {
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  className?: string;
  labelledBy?: string;
}

/** Reusable dialog. Escape and the backdrop close it only when onClose is given. */
export function Modal({ title, children, actions, onClose, wide, className }: ModalProps) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`modal panel${wide ? ' modal--wide' : ''}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button className="btn btn--ghost btn--icon modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
        {title && <h2 className="modal__title">{title}</h2>}
        {title && <hr className="ornament" />}
        <div className="modal__body">{children}</div>
        {actions && <div className="modal__actions">{actions}</div>}
      </div>
    </div>
  );
}
