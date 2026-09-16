import { useEffect } from 'react';
import { IconX } from '../icons.jsx';
import './Modal.css';

// Shared floating-dialog shell for "edit this document" flows (Receipts' edit form,
// ScrapPurchase's draft review) — previously each swapped its edit form in over the page's
// own layout in place, which meant the thing being edited scrolled out of view or got
// replaced by its own edit form instead of staying visible as a reference alongside it.
export default function Modal({ title, onClose, children, maxWidth = 560 }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button type="button" className="modal-close" onClick={onClose} title="ปิด">
            <IconX />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
