import { useCallback, useEffect, useState } from 'react';
import { IconCash, IconCheck } from '../icons.jsx';
import { getToken } from '../lib/auth.js';
import { usePolling } from '../lib/polling.js';
import { signedMoney } from '../lib/finance.js';

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Daily cash drawer count: the float put in at opening and the cash actually counted at close,
// compared against what should be there (float + the day's net cash from DailySummary). Stored
// server-side per date so any till sees the same count.
export default function CashDrawerCount({ date, netCash }) {
  const [saved, setSaved] = useState(null);
  const [floatInput, setFloatInput] = useState('');
  const [countedInput, setCountedInput] = useState('');
  const [message, setMessage] = useState(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/cash-counts', { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) return;
      const data = await res.json();
      setSaved(data.cashCounts.find((c) => c.date === date) || null);
    } catch {
      // Offline — keep what's shown.
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, 5000);

  // Show the stored values for the selected day, unless the user is mid-edit.
  useEffect(() => {
    if (dirty) return;
    setFloatInput(saved ? String(saved.openingFloat) : '');
    setCountedInput(saved?.countedCash != null ? String(saved.countedCash) : '');
  }, [saved, dirty]);

  useEffect(() => {
    setDirty(false);
    setMessage(null);
  }, [date]);

  const openingFloat = parseFloat(floatInput) || 0;
  const expected = openingFloat + netCash;
  const counted = countedInput === '' ? null : parseFloat(countedInput);
  const diff = counted === null || Number.isNaN(counted) ? null : counted - expected;

  async function handleSave(e) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/cash-counts/${date}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ openingFloat, countedCash: counted }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกยอดเงินสดไม่สำเร็จ');
      setSaved(data.cashCount);
      setDirty(false);
      setMessage({ type: 'ok', text: 'บันทึกยอดลิ้นชักแล้ว' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  function onChange(setter) {
    return (e) => {
      setter(e.target.value);
      setDirty(true);
      setMessage(null);
    };
  }

  return (
    <form className="card card-pad" onSubmit={handleSave}>
      <div className="card-title" style={{ marginBottom: 14 }}>
        <IconCash />
        นับเงินในลิ้นชัก
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: 1 }}>
          <label>เงินทอนตั้งต้น (เปิดร้าน)</label>
          <input type="number" min="0" step="0.01" className="input-plain" value={floatInput} onChange={onChange(setFloatInput)} placeholder="0.00" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>นับได้จริง (ปิดร้าน)</label>
          <input type="number" min="0" step="0.01" className="input-plain" value={countedInput} onChange={onChange(setCountedInput)} placeholder="ยังไม่นับ" />
        </div>
      </div>
      <div className="sum-row">
        <span className="label">ควรมีในลิ้นชัก (ตั้งต้น + เงินสดสุทธิ)</span>
        <span className="val">{money(expected)}</span>
      </div>
      {diff !== null && (
        <div className="grand-total">
          <span className="label">{Math.abs(diff) < 0.005 ? 'ตรงพอดี' : diff > 0 ? 'เงินเกิน' : 'เงินขาด'}</span>
          <span className="val" style={{ color: diff < -0.005 ? 'var(--rose)' : undefined }}>
            {signedMoney(diff)}
          </span>
        </div>
      )}
      {message && <div style={{ fontSize: 12, marginTop: 8, color: message.type === 'error' ? 'var(--rose)' : 'var(--green-700)' }}>{message.text}</div>}
      {saved && !dirty && (
        <div style={{ fontSize: 11, marginTop: 8, color: 'var(--ink-500)' }}>
          บันทึกล่าสุดโดย {saved.updatedBy || '—'}
        </div>
      )}
      <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 10 }} disabled={!dirty}>
        <IconCheck />
        บันทึกยอดลิ้นชัก
      </button>
    </form>
  );
}
