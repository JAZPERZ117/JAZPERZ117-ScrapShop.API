import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { exportCsv } from '../lib/csvExport.js';
import { useReceipts, INITIAL_ORDER } from '../context/ReceiptsContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useCustomers } from '../context/CustomersContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useDeductions } from '../context/DeductionsContext.jsx';
import { usePersistentState } from '../lib/persist.js';
import {
  IconReceipt,
  IconDownload,
  IconPlus,
  IconCheck,
  IconX,
  IconPrint,
  IconTrash,
  IconClockHistory,
  IconEdit,
} from '../icons.jsx';
import RowMenu from '../components/RowMenu.jsx';
import './Receipts.css';

function parseMoney(s) {
  return parseFloat((s || '').replace(/[^\d.]/g, '')) || 0;
}

function parseWeightKg(s) {
  return parseFloat((s || '').replace(/[^\d.]/g, '')) || 0;
}

// Receipts created after this fix store a real `netWeight` number per item; older receipts
// only have the formatted display string (e.g. "17.00 − 2.00 = 15.00 กก. × ฿20.00"), so fall
// back to pulling the net figure back out of it — after "=" if a deduction was shown, else
// the plain number right before "กก.".
function parseItemNetWeight(it) {
  if (typeof it.netWeight === 'number') return it.netWeight;
  const w = it.w || '';
  const afterEquals = w.includes('=') ? w.split('=')[1] : w;
  const match = afterEquals.match(/([\d,]+\.?\d*)\s*กก\./);
  return match ? parseFloat(match[1].replace(/,/g, '')) || 0 : 0;
}

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nowTimeStr() {
  return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatThaiDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(name) {
  return (name || '').replace('คุณ', '').trim().slice(0, 2) || '?';
}

// Item lines are stored as a formatted display string ("65.20 กก. × ฿17.00", sometimes
// prefixed with a per-row deduction breakdown like "65.20 − 3.00 = 62.20 กก. × ฿17.00") —
// this pulls back the final net weight/price pair so an edit form can start from real numbers.
function parseItemLine(w) {
  const m = String(w).match(/([\d,.]+)\s*กก\.\s*×\s*฿([\d,.]+)/);
  if (!m) return { weight: 0, price: 0 };
  return { weight: parseFloat(m[1].replace(/,/g, '')) || 0, price: parseFloat(m[2].replace(/,/g, '')) || 0 };
}

const FALLBACK_ACTIVITY = [
  { text: 'พิมพ์ซ้ำ RC670515-010', time: '10:52 น.' },
  { text: 'ยกเลิก RC670515-010', time: '10:50 น.' },
  { text: 'ออกใบเสร็จ RC670515-012', time: '10:45 น.' },
];

export default function Receipts() {
  const navigate = useNavigate();
  const { receipts, setReceipts, order } = useReceipts();
  const { settings } = useSettings();
  const { reversePurchase } = useCustomers();
  const { removeStockByName } = useProducts();
  const { decrementUsage } = useDeductions();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedId, setSelectedId] = useState(order[0]);
  const [banner, setBanner] = useState(null);
  const [activity, setActivity] = usePersistentState('scrapshop_receipts_activity', []);
  const [printedIds, setPrintedIds] = usePersistentState('scrapshop_receipts_printed_ids', []);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);

  const rows = useMemo(() => {
    return order.filter((id) => {
      const r = receipts[id];
      if (filter === 'ok' && r.status !== 'ok') return false;
      if (filter === 'void' && r.status !== 'void') return false;
      if (dateFilter && r.date !== dateFilter) return false;
      const q = query.trim().toLowerCase();
      if (q && !r.no.toLowerCase().includes(q) && !r.cust.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filter, query, dateFilter, receipts, order]);

  const selected = receipts[selectedId] || receipts[order[0]];
  const selectedStatus = selected.status;
  const voidedIds = useMemo(() => order.filter((id) => receipts[id].status === 'void'), [order, receipts]);

  // "วันนี้"/"เดือนนี้" stat cards only count active receipts — a voided receipt shouldn't
  // still add to revenue/count, same convention used on ScrapPurchase/Dashboard/DailySummary.
  const activeOrder = useMemo(() => order.filter((id) => receipts[id].status !== 'void'), [order, receipts]);
  const newReceiptIds = useMemo(() => order.filter((id) => !INITIAL_ORDER.includes(id)), [order]);
  const newActiveReceiptIds = useMemo(() => newReceiptIds.filter((id) => receipts[id].status !== 'void'), [newReceiptIds, receipts]);
  const todayCount = activeOrder.length;
  const todayTotal = useMemo(() => activeOrder.reduce((sum, id) => sum + parseMoney(receipts[id].total), 0), [activeOrder, receipts]);
  const monthCount = 186 + newActiveReceiptIds.length;
  const monthTotal = 512450 + newActiveReceiptIds.reduce((sum, id) => sum + parseMoney(receipts[id].total), 0);
  const reprintCount = 9 + activity.filter((a) => a.text.startsWith('พิมพ์ซ้ำ') || a.text.startsWith('ดาวน์โหลด')).length;
  const reprintFromCount = 6 + printedIds.length;
  const voidTotal = useMemo(
    () => voidedIds.reduce((sum, id) => sum + parseMoney(receipts[id].total), 0),
    [voidedIds, receipts]
  );

  function logActivity(text) {
    setActivity((prev) => [{ text, time: nowTimeStr() }, ...prev].slice(0, 10));
  }

  function handleVoid(id = selectedId) {
    const target = receipts[id];
    if (target.status === 'void') return;
    if (!window.confirm(`ยืนยันยกเลิกใบเสร็จ ${target.no}?`)) return;
    setReceipts((prev) => ({ ...prev, [id]: { ...prev[id], status: 'void' } }));
    // A voided purchase never happened, so give back what it took: the stock it added
    // (matched by item name, mirroring how ScrapPurchase.jsx's addStock looked it up) and
    // the customer's lifetime weight/spend/visit bump (only possible for receipts that
    // recorded which customer id made the purchase — older receipts and walk-in sales
    // have no custId to reverse against, so only the stock side-effect can be undone there).
    for (const it of target.items || []) {
      removeStockByName(it.n, parseItemNetWeight(it));
    }
    if (target.custId) {
      reversePurchase(target.custId, { weightKg: parseWeightKg(target.weight), amount: parseMoney(target.total), receiptNo: target.no });
    }
    for (const du of target.deductionUsage || []) {
      decrementUsage(du.id, du.amount);
    }
    logActivity(`ยกเลิก ${target.no}`);
    setBanner({ type: 'error', text: `ยกเลิกใบเสร็จ ${target.no} แล้ว — คืนสต็อกสินค้าและยอดสะสมลูกค้าที่เกี่ยวข้องแล้ว` });
  }

  function handlePrint() {
    setPrintedIds((prev) => (prev.includes(selectedId) ? prev : [...prev, selectedId]));
    logActivity(`พิมพ์ซ้ำ ${selected.no}`);
    setBanner({ type: 'success', text: `ส่งพิมพ์ใบเสร็จ ${selected.no} ไปยังเครื่องพิมพ์แล้ว` });
    window.print();
  }

  function handleDownloadPdf() {
    setPrintedIds((prev) => (prev.includes(selectedId) ? prev : [...prev, selectedId]));
    logActivity(`ดาวน์โหลด PDF ${selected.no}`);
    setBanner({ type: 'success', text: `เปิดหน้าต่างพิมพ์ใบเสร็จ ${selected.no} แล้ว — เลือก "บันทึกเป็น PDF" เพื่อดาวน์โหลด` });
    window.print();
  }

  function handleExport() {
    exportCsv(
      'receipts.csv',
      ['เลขที่ใบเสร็จ', 'วันที่', 'เวลา', 'ลูกค้า', 'น้ำหนักรวม', 'ยอดเงิน', 'วิธีจ่ายเงิน', 'สถานะ'],
      rows.map((id) => {
        const r = receipts[id];
        return [r.no, r.date, r.time, r.cust, r.weight, r.total, r.method, r.status === 'void' ? 'ยกเลิก' : 'ปกติ'];
      })
    );
  }

  function selectRow(id) {
    if (isEditing && id !== editForm?.id) setIsEditing(false);
    setSelectedId(id);
  }

  function startEdit(id = selectedId) {
    const r = receipts[id];
    if (!r) return;
    if (r.status === 'void') {
      setBanner({ type: 'error', text: `ใบเสร็จ ${r.no} ถูกยกเลิกแล้ว ไม่สามารถแก้ไขได้` });
      return;
    }
    setSelectedId(id);
    const parsedItems = (r.items || []).map((it) => {
      const { weight, price } = parseItemLine(it.w);
      return { name: it.n, weight: String(weight), price: String(price) };
    });
    let deductionWeight = r.deductionWeight || 0;
    if (!deductionWeight) {
      // A few legacy receipts predate per-transaction deduction tracking, so their stored
      // total doesn't line up with the sum of their item totals — back out an equivalent
      // deduction weight here so opening the edit form doesn't silently change the total.
      const itemsSubtotal = parsedItems.reduce((s, it) => s + (parseFloat(it.weight) || 0) * (parseFloat(it.price) || 0), 0);
      const itemsWeight = parsedItems.reduce((s, it) => s + (parseFloat(it.weight) || 0), 0);
      const gap = itemsSubtotal - parseMoney(r.total);
      const blended = itemsWeight > 0 ? itemsSubtotal / itemsWeight : 0;
      if (gap > 0.01 && blended > 0) deductionWeight = gap / blended;
    }
    setEditForm({
      id,
      cust: r.cust,
      method: r.method,
      note: r.note || '',
      items: parsedItems,
      deductionWeight: deductionWeight.toFixed(2),
      deductionLabel: r.deductionLabel || '',
    });
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditForm(null);
  }

  function updateEditItem(i, field, value) {
    setEditForm((f) => ({ ...f, items: f.items.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)) }));
  }
  function addEditItem() {
    setEditForm((f) => ({ ...f, items: [...f.items, { name: '', weight: '', price: '' }] }));
  }
  function removeEditItem(i) {
    setEditForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  }

  const editSubtotal = isEditing ? editForm.items.reduce((s, it) => s + (parseFloat(it.weight) || 0) * (parseFloat(it.price) || 0), 0) : 0;
  const editTotalWeight = isEditing ? editForm.items.reduce((s, it) => s + (parseFloat(it.weight) || 0), 0) : 0;
  const editBlendedPrice = editTotalWeight > 0 ? editSubtotal / editTotalWeight : 0;
  const editDeductionWeight = isEditing ? Math.min(Math.max(parseFloat(editForm.deductionWeight) || 0, 0), editTotalWeight) : 0;
  const editDeductionMoney = editDeductionWeight * editBlendedPrice;
  const editGrandTotal = Math.max(editSubtotal - editDeductionMoney, 0);

  function saveEdit() {
    if (!editForm.cust.trim()) {
      setBanner({ type: 'error', text: 'กรุณากรอกชื่อลูกค้า' });
      return;
    }
    const validItems = editForm.items.filter((it) => it.name.trim() && (parseFloat(it.weight) || 0) > 0);
    if (validItems.length === 0) {
      setBanner({ type: 'error', text: 'กรุณาระบุรายการสินค้าอย่างน้อย 1 รายการพร้อมน้ำหนัก' });
      return;
    }
    const id = editForm.id;
    const original = receipts[id];
    const newItems = validItems.map((it) => {
      const w = parseFloat(it.weight) || 0;
      const p = parseFloat(it.price) || 0;
      return { n: it.name.trim(), w: `${w.toFixed(2)} กก. × ${money(p)}`, t: money(w * p) };
    });
    setReceipts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        cust: editForm.cust.trim(),
        init: initials(editForm.cust.trim()),
        method: editForm.method,
        note: editForm.note.trim(),
        items: newItems,
        weight: editTotalWeight.toFixed(2) + ' กก.',
        deductionWeight: editDeductionWeight,
        deductionLabel: editForm.deductionLabel.trim(),
        total: money(editGrandTotal),
      },
    }));
    logActivity(`แก้ไขใบเสร็จ ${original.no}`);
    setBanner({ type: 'success', text: `บันทึกการแก้ไขใบเสร็จ ${original.no} แล้ว` });
    setIsEditing(false);
    setEditForm(null);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            การทำงาน <span>›</span> <b>ใบเสร็จรับเงิน</b>
          </div>
          <h1 className="page-title">ใบเสร็จรับเงิน</h1>
          <div className="page-sub">ค้นหา ตรวจสอบ พิมพ์ซ้ำ หรือยกเลิกใบเสร็จรับซื้อของเก่า</div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={handleExport}>
            <IconDownload />
            ส่งออก Excel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
            <IconPlus />
            ออกใบเสร็จใหม่
          </button>
        </div>
      </div>

      {banner && (
        <div className={`page-banner banner-${banner.type}`}>
          {banner.text}
          <button type="button" className="banner-close" onClick={() => setBanner(null)}>
            <IconX />
          </button>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconReceipt />
          </div>
          <div>
            <div className="stat-label">ใบเสร็จวันนี้</div>
            <div className="stat-value">{todayCount} ใบ</div>
            <div className="stat-foot">รวม {money(todayTotal)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconReceipt />
          </div>
          <div>
            <div className="stat-label">ใบเสร็จเดือนนี้</div>
            <div className="stat-value">{monthCount} ใบ</div>
            <div className="stat-foot">รวม {money(monthTotal)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--plum-bg)', color: 'var(--plum)' }}>
            <IconPrint />
          </div>
          <div>
            <div className="stat-label">พิมพ์ซ้ำเดือนนี้</div>
            <div className="stat-value">{reprintCount} ครั้ง</div>
            <div className="stat-foot">จาก {reprintFromCount} ใบเสร็จ</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}>
            <IconTrash />
          </div>
          <div>
            <div className="stat-label">ยกเลิกเดือนนี้</div>
            <div className="stat-value">{voidedIds.length} ใบ</div>
            <div className="stat-foot">รวม {money(voidTotal)}</div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ '--detail-w': '340px' }}>
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">
                <IconReceipt />
                รายการใบเสร็จ
              </div>
              <div className="card-sub">แตะที่รายการเพื่อดูตัวอย่างใบเสร็จ</div>
            </div>
            <div className="filter-tabs">
              {[
                ['all', 'ทั้งหมด'],
                ['ok', 'ปกติ'],
                ['void', 'ยกเลิกแล้ว'],
              ].map(([key, label]) => (
                <button key={key} type="button" className={`filter-tab${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="toolbar">
            <div className="search-box">
              <IconReceipt style={{ width: 16, height: 16 }} />
              <input placeholder="ค้นหาเลขที่ใบเสร็จ หรือชื่อลูกค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <input
              type="date"
              className="input-plain"
              style={{ maxWidth: 170 }}
              value={dateFilter}
              max={todayISO()}
              onChange={(e) => setDateFilter(e.target.value)}
              title="เลือกวันที่เพื่อดูใบเสร็จเฉพาะวันนั้น"
            />
            {dateFilter && (
              <button type="button" className="btn btn-ghost" onClick={() => setDateFilter('')}>
                <IconX style={{ width: 14, height: 14 }} />
                ทั้งหมด
              </button>
            )}
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '16%' }}>เลขที่ใบเสร็จ</th>
                <th style={{ width: '24%' }}>ลูกค้า</th>
                <th style={{ width: '14%' }}>น้ำหนักรวม</th>
                <th style={{ width: '16%' }}>ยอดเงิน</th>
                <th style={{ width: '14%' }}>วิธีจ่ายเงิน</th>
                <th style={{ width: '12%' }}>สถานะ</th>
                <th style={{ width: '4%' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((id) => {
                const r = receipts[id];
                const status = r.status;
                return (
                  <tr key={id} className={`clickable${id === selectedId ? ' selected-row' : ''}`} onClick={() => selectRow(id)}>
                    <td>
                      <div className="rc-no">{r.no}</div>
                      <div className="rc-time">{formatThaiDate(r.date)} · {r.time}</div>
                    </td>
                    <td>
                      <div className="row-cell">
                        <div className="row-icon" style={{ background: r.bg, color: r.fg, borderRadius: '99px' }}>
                          {r.init}
                        </div>
                        <div>
                          <div className="row-name">{r.cust}</div>
                          <div className="row-sub">{r.items.length} รายการ</div>
                        </div>
                      </div>
                    </td>
                    <td className="num-cell">{r.weight}</td>
                    <td className="num-cell">{r.total}</td>
                    <td>
                      <span className="badge badge-blue">{r.method}</span>
                    </td>
                    <td>
                      {status === 'ok' ? (
                        <span className="badge badge-green">
                          <IconCheck />
                          ปกติ
                        </span>
                      ) : (
                        <span className="badge badge-rose">
                          <IconX />
                          ยกเลิก
                        </span>
                      )}
                    </td>
                    <td>
                      <RowMenu
                        actions={[
                          { label: 'ดูตัวอย่าง', icon: <IconReceipt />, onClick: () => selectRow(id) },
                          ...(status === 'ok'
                            ? [
                                { label: 'แก้ไขใบเสร็จ', icon: <IconEdit />, onClick: () => startEdit(id) },
                                { label: 'ยกเลิกใบเสร็จ', icon: <IconTrash />, danger: true, onClick: () => handleVoid(id) },
                              ]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="table-foot">
            <span>
              แสดง {rows.length} จาก {order.length} ใบเสร็จ
              {dateFilter ? ` · เฉพาะวันที่ ${formatThaiDate(dateFilter)}` : ''}
            </span>
          </div>
        </div>

        <div className="summary-sticky">
          <div className="receipt-shell">
            <div className="receipt-shell-head">
              <div className="receipt-title-row">
                <div className="card-title">
                  <IconReceipt />
                  {isEditing ? `แก้ไขใบเสร็จ ${receipts[editForm.id]?.no}` : 'ตัวอย่างใบเสร็จ'}
                </div>
                {!isEditing &&
                  (selectedStatus === 'ok' ? (
                    <span className="badge badge-green">
                      <IconCheck />
                      ปกติ
                    </span>
                  ) : (
                    <span className="badge badge-rose">
                      <IconX />
                      ยกเลิก
                    </span>
                  ))}
              </div>
            </div>

            {isEditing ? (
              <div className="paper edit-mode">
                <div className="field">
                  <label>ชื่อลูกค้า</label>
                  <input className="input-plain" value={editForm.cust} onChange={(e) => setEditForm((f) => ({ ...f, cust: e.target.value }))} />
                </div>
                <div className="field">
                  <label>วิธีจ่ายเงิน</label>
                  <select className="input-plain" value={editForm.method} onChange={(e) => setEditForm((f) => ({ ...f, method: e.target.value }))}>
                    <option>เงินสด</option>
                    <option>โอนเงิน</option>
                    <option>พร้อมเพย์</option>
                  </select>
                </div>

                <div className="field">
                  <label>รายการสินค้า</label>
                  {editForm.items.map((it, i) => (
                    <div className="edit-item-row" key={i}>
                      <input className="input-plain" placeholder="ชื่อสินค้า" value={it.name} onChange={(e) => updateEditItem(i, 'name', e.target.value)} />
                      <div className="edit-item-sub">
                        <input className="input-plain" type="number" min="0" step="0.01" placeholder="น้ำหนัก กก." value={it.weight} onChange={(e) => updateEditItem(i, 'weight', e.target.value)} />
                        <input className="input-plain" type="number" min="0" step="0.01" placeholder="ราคา/กก." value={it.price} onChange={(e) => updateEditItem(i, 'price', e.target.value)} />
                        <button type="button" className="edit-item-remove" onClick={() => removeEditItem(i)} disabled={editForm.items.length <= 1} title="ลบรายการนี้">
                          <IconTrash />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="btn btn-ghost btn-block" onClick={addEditItem}>
                    <IconPlus />
                    เพิ่มรายการ
                  </button>
                </div>

                <div className="field-row">
                  <div className="field" style={{ flex: 1 }}>
                    <label>หักน้ำหนักรวม (กก.)</label>
                    <input
                      className="input-plain"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.deductionWeight}
                      onChange={(e) => setEditForm((f) => ({ ...f, deductionWeight: e.target.value }))}
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>เหตุผลที่หัก (ไม่บังคับ)</label>
                    <input className="input-plain" value={editForm.deductionLabel} onChange={(e) => setEditForm((f) => ({ ...f, deductionLabel: e.target.value }))} />
                  </div>
                </div>

                <div className="field">
                  <label>หมายเหตุ</label>
                  <input className="input-plain" value={editForm.note} onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))} />
                </div>

                <div className="paper-meta">
                  <span>น้ำหนักรวม</span>
                  <b>{editTotalWeight.toFixed(2)} กก.</b>
                </div>
                <div className="paper-total-row">
                  <span className="l">ยอดรวมสุทธิ (คำนวณใหม่)</span>
                  <span className="v">{money(editGrandTotal)}</span>
                </div>
              </div>
            ) : (
              <div className="paper">
                <div className="paper-top">
                  <div className="paper-shop">{settings.shopName}</div>
                  <div className="paper-addr">
                    {settings.address}
                    <br />
                    โทร. {settings.phone} &nbsp;|&nbsp; เลขผู้เสียภาษี {settings.taxId}
                  </div>
                </div>
                <hr className="paper-divider" />
                <div className="paper-meta">
                  <span>เลขที่ใบเสร็จ</span>
                  <b>{selected.no}</b>
                </div>
                <div className="paper-meta">
                  <span>วันที่</span>
                  <b>{formatThaiDate(selected.date)} · {selected.time}</b>
                </div>
                <div className="paper-meta">
                  <span>ลูกค้า</span>
                  <b>{selected.cust}</b>
                </div>
                <div className="paper-meta">
                  <span>ผู้ออกใบเสร็จ</span>
                  <b>เจ้าของร้าน</b>
                </div>
                <hr className="paper-divider" />

                <div className="paper-items">
                  {selected.items.map((it, i) => (
                    <div className="paper-item" key={i}>
                      <div className="pn">
                        {it.n}
                        <span className="pw">{it.w}</span>
                      </div>
                      <div className="pt">{it.t}</div>
                    </div>
                  ))}
                </div>

                <div className="paper-meta">
                  <span>น้ำหนักรวม</span>
                  <b>{selected.weight}</b>
                </div>
                <div className="paper-meta">
                  <span>หักน้ำหนัก/เหตุผล{selected.deductionLabel ? ` (${selected.deductionLabel})` : ''}</span>
                  <b>−{(selected.deductionWeight || 0).toFixed(2)} กก.</b>
                </div>

                <div className="paper-total-row">
                  <span className="l">ยอดรวมสุทธิ</span>
                  <span className="v">{selected.total}</span>
                </div>
                <div className="paper-meta" style={{ marginTop: 8 }}>
                  <span>วิธีจ่ายเงิน</span>
                  <b>{selected.method}</b>
                </div>
                {selected.note && (
                  <div className="paper-meta" style={{ marginTop: 8 }}>
                    <span>หมายเหตุ</span>
                    <b>{selected.note}</b>
                  </div>
                )}

                <div className="paper-barcode">
                  {Array.from({ length: 18 }).map((_, i) => (
                    <span key={i} style={{ height: 34, width: (i % 3) + 1 }}></span>
                  ))}
                </div>
                <div className="paper-foot">
                  {selected.no}
                  <br />
                  {settings.receiptFooter}
                </div>
              </div>
            )}

            {isEditing ? (
              <div className="receipt-actions">
                <button type="button" className="btn btn-primary btn-block" onClick={saveEdit}>
                  <IconCheck />
                  บันทึกการแก้ไข
                </button>
                <button type="button" className="btn btn-ghost btn-block" onClick={cancelEdit}>
                  <IconX />
                  ยกเลิกการแก้ไข
                </button>
              </div>
            ) : (
              <div className="receipt-actions">
                <button type="button" className="btn btn-primary btn-block" onClick={handlePrint}>
                  <IconPrint />
                  พิมพ์ใบเสร็จ
                </button>
                <div className="action-row">
                  <button type="button" className="btn btn-ghost" onClick={handleDownloadPdf}>
                    <IconDownload />
                    ดาวน์โหลด PDF
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => startEdit()} disabled={selectedStatus === 'void'}>
                    <IconEdit />
                    แก้ไขใบเสร็จ
                  </button>
                </div>
                <button type="button" className="btn btn-danger-ghost btn-block" onClick={() => handleVoid()} disabled={selectedStatus === 'void'}>
                  <IconTrash />
                  ยกเลิกใบเสร็จ
                </button>
              </div>
            )}
          </div>

          <div className="card mini-stat-card">
            <div className="mini-stat-title">
              <IconClockHistory />
              กิจกรรมล่าสุด
            </div>
            {(activity.length > 0 ? activity : FALLBACK_ACTIVITY).slice(0, 3).map((a, i) => (
              <div className="mini-stat-row" key={i}>
                <span>{a.text}</span>
                <span className="n">{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
