import { useState } from 'react';
import { IconCash, IconPlus, IconEdit, IconTrash, IconDownload, IconClockHistory, IconX, IconCheck, IconCategory } from '../icons.jsx';
import RowMenu from '../components/RowMenu.jsx';
import { exportCsv } from '../lib/csvExport.js';
import { useExpenses, EXPENSE_CATEGORIES, EXPENSE_PAY_LABELS } from '../context/ExpensesContext.jsx';

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Local date, not toISOString (UTC) — a late-evening entry would otherwise land on tomorrow.
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function thaiDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, d));
}

const BLANK_FORM = { date: '', category: EXPENSE_CATEGORIES[0], amount: '', payMethod: 'cash', note: '' };

export default function Expenses() {
  const { expenses, order, addExpense, updateExpense, deleteExpense } = useExpenses();
  const [selectedMonth, setSelectedMonth] = useState(() => todayISO().slice(0, 7));
  const [form, setForm] = useState(() => ({ ...BLANK_FORM, date: todayISO() }));
  const [editingId, setEditingId] = useState(null);
  const [banner, setBanner] = useState(null);
  const [saving, setSaving] = useState(false);

  const monthIds = order.filter((id) => expenses[id]?.date.startsWith(selectedMonth));
  const monthTotal = monthIds.reduce((s, id) => s + expenses[id].amount, 0);
  const monthCash = monthIds.filter((id) => expenses[id].payMethod === 'cash').reduce((s, id) => s + expenses[id].amount, 0);

  const categoryTotals = {};
  for (const id of monthIds) categoryTotals[expenses[id].category] = (categoryTotals[expenses[id].category] || 0) + expenses[id].amount;
  const byCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEdit(id) {
    const e = expenses[id];
    setEditingId(id);
    setForm({ date: e.date, category: e.category, amount: String(e.amount), payMethod: e.payMethod, note: e.note });
    setBanner(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...BLANK_FORM, date: todayISO() });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) };
      if (editingId) {
        await updateExpense(editingId, payload);
        setBanner({ type: 'success', text: `แก้ไขรายการ ${form.category} แล้ว` });
      } else {
        await addExpense(payload);
        setBanner({ type: 'success', text: `บันทึกค่าใช้จ่าย ${form.category} ${money(payload.amount)} แล้ว` });
      }
      setEditingId(null);
      setForm({ ...BLANK_FORM, date: form.date });
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const e = expenses[id];
    if (!window.confirm(`ยืนยันลบค่าใช้จ่าย "${e.category}" ${money(e.amount)} วันที่ ${thaiDate(e.date)}?`)) return;
    try {
      await deleteExpense(id);
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
      return;
    }
    if (editingId === id) cancelEdit();
    setBanner({ type: 'success', text: `ลบค่าใช้จ่าย ${e.category} แล้ว` });
  }

  function handleExport() {
    exportCsv(
      `expenses-${selectedMonth}.csv`,
      ['วันที่', 'หมวด', 'รายละเอียด', 'วิธีจ่าย', 'จำนวนเงิน', 'บันทึกโดย'],
      monthIds.map((id) => {
        const e = expenses[id];
        return [e.date, e.category, e.note, EXPENSE_PAY_LABELS[e.payMethod] || e.payMethod, e.amount.toFixed(2), e.createdBy];
      })
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            การทำงาน <span>›</span> <b>ค่าใช้จ่ายร้าน</b>
          </div>
          <h1 className="page-title">ค่าใช้จ่ายร้าน</h1>
          <div className="page-sub">ค่าไฟ ค่าน้ำมัน ค่าเช่า ค่าซ่อม ฯลฯ — นำไปหักในกำไรสุทธิและภาษีแบบหักตามจริง</div>
        </div>
        <div className="head-actions">
          <label className="date-select" style={{ cursor: 'pointer' }}>
            <IconClockHistory />
            <input
              type="month"
              value={selectedMonth}
              max={todayISO().slice(0, 7)}
              onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
              style={{ border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', padding: 0, cursor: 'pointer' }}
            />
          </label>
          <button type="button" className="btn btn-ghost" onClick={handleExport} disabled={monthIds.length === 0}>
            <IconDownload />
            ส่งออก Excel
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
          <div className="stat-icon" style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}>
            <IconCash />
          </div>
          <div>
            <div className="stat-label">ค่าใช้จ่ายเดือนนี้</div>
            <div className="stat-value">{money(monthTotal)}</div>
            <div className="stat-foot">{monthIds.length} รายการ</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <IconCash />
          </div>
          <div>
            <div className="stat-label">จ่ายด้วยเงินสด</div>
            <div className="stat-value">{money(monthCash)}</div>
            <div className="stat-foot">หักจากลิ้นชักเงินสด</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconCategory />
          </div>
          <div>
            <div className="stat-label">หมวดที่จ่ายมากที่สุด</div>
            <div className="stat-value" style={{ fontSize: 18 }}>{byCategory[0]?.[0] || '—'}</div>
            <div className="stat-foot">{byCategory[0] ? money(byCategory[0][1]) : 'ยังไม่มีรายการ'}</div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ '--detail-w': '340px' }}>
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">
                <IconCash />
                รายการค่าใช้จ่าย
              </div>
              <div className="card-sub">เรียงจากวันล่าสุด</div>
            </div>
          </div>
          {monthIds.length === 0 ? (
            <div className="empty-hint">ยังไม่มีค่าใช้จ่ายในเดือนนี้ — บันทึกได้ที่แบบฟอร์มด้านขวา</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '18%' }}>วันที่</th>
                  <th style={{ width: '24%' }}>หมวด</th>
                  <th style={{ width: '28%' }}>รายละเอียด</th>
                  <th style={{ width: '12%' }}>วิธีจ่าย</th>
                  <th style={{ width: '14%' }}>จำนวนเงิน</th>
                  <th style={{ width: '4%' }}></th>
                </tr>
              </thead>
              <tbody>
                {monthIds.map((id) => {
                  const e = expenses[id];
                  return (
                    <tr key={id} className={id === editingId ? 'selected-row' : undefined}>
                      <td>{thaiDate(e.date)}</td>
                      <td>{e.category}</td>
                      <td>{e.note || '—'}</td>
                      <td>{EXPENSE_PAY_LABELS[e.payMethod] || e.payMethod}</td>
                      <td className="num-cell">{money(e.amount)}</td>
                      <td>
                        <RowMenu
                          actions={[
                            { label: 'แก้ไข', icon: <IconEdit />, onClick: () => startEdit(id) },
                            { label: 'ลบ', icon: <IconTrash />, danger: true, onClick: () => handleDelete(id) },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="summary-sticky">
          <form className="card card-pad" onSubmit={handleSubmit}>
            <div className="card-title" style={{ marginBottom: 14 }}>
              {editingId ? <IconEdit /> : <IconPlus />}
              {editingId ? 'แก้ไขค่าใช้จ่าย' : 'บันทึกค่าใช้จ่าย'}
            </div>
            <div className="field">
              <label>วันที่</label>
              <input type="date" className="input-plain" value={form.date} max={todayISO()} onChange={(e) => setField('date', e.target.value)} required />
            </div>
            <div className="field">
              <label>หมวด</label>
              <select className="input-plain" value={form.category} onChange={(e) => setField('category', e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>จำนวนเงิน (บาท)</label>
                <input type="number" min="0.01" step="0.01" className="input-plain" value={form.amount} onChange={(e) => setField('amount', e.target.value)} required />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>วิธีจ่าย</label>
                <select className="input-plain" value={form.payMethod} onChange={(e) => setField('payMethod', e.target.value)}>
                  {Object.entries(EXPENSE_PAY_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>รายละเอียด (ไม่บังคับ)</label>
              <input className="input-plain" placeholder="เช่น ค่าไฟเดือน ก.ย. / เติมน้ำมันรถกระบะ" value={form.note} onChange={(e) => setField('note', e.target.value)} />
            </div>
            <div className="submit-stack">
              <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
                <IconCheck />
                {editingId ? 'บันทึกการแก้ไข' : 'บันทึกค่าใช้จ่าย'}
              </button>
              {editingId && (
                <button type="button" className="btn btn-ghost btn-block" onClick={cancelEdit}>
                  <IconX />
                  ยกเลิกการแก้ไข
                </button>
              )}
            </div>
          </form>

          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconCategory />
              แยกตามหมวด
            </div>
            {byCategory.length === 0 && <div className="empty-hint">ยังไม่มีข้อมูล</div>}
            {byCategory.map(([cat, amt]) => (
              <div className="sum-row" key={cat}>
                <span className="label">{cat}</span>
                <span className="val">{money(amt)}</span>
              </div>
            ))}
            {byCategory.length > 0 && (
              <div className="grand-total">
                <span className="label">รวม</span>
                <span className="val">{money(monthTotal)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
