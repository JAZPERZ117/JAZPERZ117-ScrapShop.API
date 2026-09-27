import { useCallback, useEffect, useState } from 'react';
import { IconCheck } from '../icons.jsx';
import { getToken } from '../lib/auth.js';
import { useProducts } from '../context/ProductsContext.jsx';

const REASONS = ['ตรวจนับสต็อกจริง', 'น้ำหนักหาย / ความชื้นระเหย', 'สูญหาย / ถูกขโมย', 'ชำรุด / คัดทิ้ง', 'แก้ไขข้อมูลที่บันทึกผิด', 'อื่นๆ'];

function parseStockKg(stock) {
  return parseFloat(String(stock).replace(/[^\d.]/g, '')) || 0;
}

function thaiDateTime(sqlUtc) {
  // SQLite datetime('now') is UTC without a zone marker.
  const d = new Date(`${sqlUtc.replace(' ', 'T')}Z`);
  return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Manual stock correction for one product: new stock + a required reason, logged server-side,
// with that product's adjustment history underneath.
export default function StockAdjustPanel({ product, onResult }) {
  const { adjustStock } = useProducts();
  const [newStock, setNewStock] = useState('');
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState('');
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/stock-adjustments?productId=${encodeURIComponent(product.id)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data.adjustments);
    } catch {
      // Offline — keep what's shown.
    }
  }, [product.id]);

  useEffect(() => {
    loadHistory();
    setOpen(false);
    setNote('');
    setReason(REASONS[0]);
  }, [loadHistory]);

  function startAdjust() {
    setNewStock(parseStockKg(product.stock).toFixed(2));
    setOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const before = parseStockKg(product.stock);
    const after = parseFloat(newStock);
    try {
      await adjustStock(product.id, { newStockKg: after, reason, note });
    } catch (err) {
      onResult({ type: 'error', text: err.message });
      return;
    }
    const delta = after - before;
    onResult({ type: 'success', text: `ปรับสต็อก ${product.name} จาก ${before.toFixed(2)} เป็น ${after.toFixed(2)} กก. (${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)}) — ${reason}` });
    setOpen(false);
    setNote('');
    loadHistory();
  }

  return (
    <div style={{ marginTop: 6 }}>
      {open ? (
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>สต็อกที่ถูกต้อง (กก.)</label>
              <input type="number" min="0" step="0.01" className="input-plain" value={newStock} onChange={(e) => setNewStock(e.target.value)} required />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>เหตุผล</label>
              <select className="input-plain" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>รายละเอียดเพิ่มเติม (ไม่บังคับ)</label>
            <input className="input-plain" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ชั่งตรวจนับสิ้นเดือน" />
          </div>
          <div className="action-row">
            <button type="submit" className="btn btn-primary">
              <IconCheck />
              บันทึกการปรับสต็อก
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              ยกเลิก
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost btn-block" onClick={startAdjust}>
          ปรับสต็อก (ต้องระบุเหตุผล)
        </button>
      )}

      <div className="hist-title">ประวัติการปรับสต็อก</div>
      {history.length === 0 ? (
        <div className="empty-hint">ยังไม่เคยปรับสต็อกด้วยมือ</div>
      ) : (
        history.slice(0, 10).map((h) => (
          <div className="hist-row" key={h.id} title={h.note || undefined}>
            <span className="dt">
              {thaiDateTime(h.createdAt)} · {h.reason}
              {h.createdBy ? ` · ${h.createdBy}` : ''}
            </span>
            <span className="pv">
              {h.beforeKg.toFixed(2)} → {h.afterKg.toFixed(2)} กก.
            </span>
          </div>
        ))
      )}
    </div>
  );
}
