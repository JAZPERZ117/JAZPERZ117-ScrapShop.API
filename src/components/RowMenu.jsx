import { useEffect, useRef, useState } from 'react';
import { IconDotsVertical } from '../icons.jsx';

export default function RowMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="row-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="row-action" onClick={() => setOpen((v) => !v)}>
        <IconDotsVertical />
      </button>
      {open && (
        <div className="row-menu-dropdown">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              className={`row-menu-item${a.danger ? ' danger' : ''}`}
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
