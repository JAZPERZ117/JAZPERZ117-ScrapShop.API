import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconSearch, IconBell, IconUsers, IconReceipt, IconWarningTriangle, IconSun, IconMoon } from '../icons.jsx';
import { SEARCH_INDEX, TYPE_LABELS } from '../lib/searchIndex.js';
import { useCustomers } from '../context/CustomersContext.jsx';
import { useReceipts } from '../context/ReceiptsContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

function initials(name) {
  return (name || '').trim().slice(0, 1) || '?';
}

export default function Topbar({ user }) {
  const navigate = useNavigate();
  const { customers, order: customerOrder } = useCustomers();
  const { receipts, order: receiptOrder } = useReceipts();
  const { settings, updateSetting } = useSettings();
  const isDark = settings.theme === 'dark';
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const bellRef = useRef(null);

  // Notification bell is reserved for things that actually need attention/action — not
  // routine activity like stock levels or the receipt feed (removed per explicit request).
  const notifications = useMemo(() => {
    const idWarnItems = customerOrder
      .filter((id) => customers[id].idWarn)
      .map((id) => ({
        icon: IconWarningTriangle,
        bg: 'var(--amber-bg)',
        fg: 'var(--amber)',
        title: `บัตรประชาชนของ ${customers[id].name} ใกล้หมดอายุ`,
        subtitle: 'ตรวจสอบและแจ้งลูกค้าต่ออายุ',
        to: '/customers',
      }));
    return [...idWarnItems];
  }, [customers, customerOrder]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const customerItems = customerOrder
      .map((id) => customers[id])
      .filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.idNumber || '').toLowerCase().includes(q))
      .map((c) => ({
        type: 'customer',
        icon: IconUsers,
        title: c.name,
        subtitle: `${c.phone} · ${c.tag === 'regular' ? 'ลูกค้าประจำ' : 'ทั่วไป'}`,
        to: '/customers',
      }));
    const receiptItems = receiptOrder
      .map((id) => receipts[id])
      .filter((r) => r.no.toLowerCase().includes(q) || r.cust.toLowerCase().includes(q))
      .map((r) => ({
        type: 'receipt',
        icon: IconReceipt,
        title: r.no,
        subtitle: `${r.cust} · ${r.total}${r.status === 'void' ? ' (ยกเลิก)' : ''}`,
        to: '/receipts',
      }));
    const otherItems = SEARCH_INDEX.filter(
      (item) => item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q)
    );
    return [...receiptItems, ...customerItems, ...otherItems].slice(0, 8);
  }, [query, customers, customerOrder, receipts, receiptOrder]);

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
      }
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(item) {
    navigate(item.to);
    setQuery('');
    setOpen(false);
  }

  function handleNotificationSelect(item) {
    navigate(item.to);
    setBellOpen(false);
  }

  return (
    <div className="topbar">
      <div className="search-box" ref={boxRef}>
        <IconSearch />
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          placeholder="ค้นหาใบเสร็จ, ลูกค้า, รายการ..."
        />
        <span className="kbd">Ctrl + K</span>
        {open && query.trim() && (
          <div className="search-dropdown">
            {results.length === 0 ? (
              <div className="search-empty">ไม่พบผลลัพธ์สำหรับ "{query}"</div>
            ) : (
              results.map((item, i) => (
                <button
                  type="button"
                  key={`${item.type}-${i}`}
                  className="search-option"
                  onClick={() => handleSelect(item)}
                >
                  <span className="search-option-icon">
                    <item.icon />
                  </span>
                  <span className="search-option-mid">
                    <span className="search-option-title">{item.title}</span>
                    <span className="search-option-sub">{item.subtitle}</span>
                  </span>
                  <span className="search-option-type">{TYPE_LABELS[item.type]}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <div className="topbar-right">
        <button
          type="button"
          className="bell"
          onClick={() => updateSetting('theme', isDark ? 'light' : 'dark')}
          title={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
        >
          {isDark ? <IconMoon /> : <IconSun />}
        </button>
        <div className="bell-wrap" ref={bellRef}>
          <button type="button" className="bell" onClick={() => setBellOpen((v) => !v)}>
            <IconBell />
            {notifications.length > 0 && <span className="bell-badge">{notifications.length}</span>}
          </button>
          {bellOpen && (
            <div className="bell-dropdown">
              <div className="bell-dropdown-title">การแจ้งเตือน</div>
              {notifications.length === 0 ? (
                <div className="bell-empty">ไม่มีการแจ้งเตือนใหม่</div>
              ) : (
                notifications.map((n, i) => (
                  <button type="button" key={i} className="bell-item" onClick={() => handleNotificationSelect(n)}>
                    <span className="bell-item-icon" style={{ background: n.bg, color: n.fg }}>
                      <n.icon />
                    </span>
                    <span className="bell-item-mid">
                      <span className="bell-item-title">{n.title}</span>
                      <span className="bell-item-sub">{n.subtitle}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div className="user-chip">
          <div className="avatar">{initials(user?.displayName)}</div>
          <div>
            <div className="user-name">{user?.displayName || 'ผู้ใช้งาน'}</div>
            <div className="user-role">{user?.role === 'owner' ? 'Administrator' : user?.role}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
