import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePayroll, DAY_LABELS, ATTENDANCE_LABEL, PAY_METHOD_LABELS, attendanceTotal, attendanceFromDays } from '../context/PayrollContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { usePersistentState } from '../lib/persist.js';
import { IconUsers, IconSplit, IconCheck, IconClockHistory, IconCash, IconTransfer, IconPhone, IconPrint, IconArchive, IconInfo, IconUserAdd, IconReceipt, IconX, IconEdit, IconTrash } from '../icons.jsx';
import RowMenu from '../components/RowMenu.jsx';
import './Payroll.css';

const ROLES = ['พนักงานชั่งของ', 'คนขับรถรับซื้อ', 'แคชเชียร์', 'พนักงานคัดแยก'];

// Wages are quoted as a monthly base but paid out weekly (Mon–Sat, 6 working days),
// so the daily rate divides the base by a standard 26-working-day reference month.
const STANDARD_MONTH_DAYS = 26;
const MAX_DAYS_PER_WEEK = 6;

function dailyRate(base) {
  return (base || 0) / STANDARD_MONTH_DAYS;
}

function clampDays(v, maxDays) {
  return Math.min(Math.max(parseFloat(v) || 0, 0), maxDays || MAX_DAYS_PER_WEEK);
}

function netPay(p) {
  return Math.max(dailyRate(p.base) * (parseFloat(p.days) || 0) - (parseFloat(p.advance) || 0) + (parseFloat(p.otherAmount) || 0), 0);
}

const OTHER_REASONS = [
  { id: 'rent', label: 'ค่าเช่าบ้าน' },
  { id: 'fuel', label: 'ค่าน้ำมันรถ' },
  { id: 'other', label: 'อื่นๆ (ระบุเอง)' },
];

const FALLBACK_HISTORY = [
  { no: 'PV670515-003', name: 'นายวิทยา', amount: '฿3,000.00' },
  { no: 'PV670515-002', name: 'นายสมชาย', amount: '฿2,500.00' },
  { no: 'PV670515-001', name: 'น.ส.กาญจนา', amount: '฿3,250.00' },
];

function money(n) {
  return '฿' + (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nowTimeStr() {
  return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

function todayThaiDate() {
  return new Date().toLocaleDateString('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' });
}

const THIS_MONTH_LONG = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: 'long', year: 'numeric' }).format(new Date());

// Payroll runs Mon-Sat weekly cycles, so history is grouped by the Monday that starts
// each cycle — weekKey is a stable sortable id, weekLabel is what's shown to the user.
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekKeyOf(date) {
  const monday = getWeekStart(date);
  // Build the local YYYY-MM-DD string directly (same pattern as todayISO() elsewhere in the
  // app) instead of toISOString(), which converts to UTC — in UTC+7 that shifted local
  // midnight Monday back to 17:00 the previous day, stamping every week's key (and its
  // "ส่งออก Excel" filename on PayrollReport.jsx) one calendar day earlier than the week
  // actually shown.
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

function weekLabelOf(date) {
  const monday = getWeekStart(date);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  const startStr = monday.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const endStr = saturday.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  return `สัปดาห์ ${startStr} – ${endStr}`;
}

// The 6 real calendar dates (Mon..Sat) of the current pay week, so the attendance
// picker can show which actual date each day-button represents, not just จ/อ/พ/พฤ/ศ/ส.
function thisWeekDates() {
  const monday = getWeekStart(new Date());
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export default function Payroll() {
  const navigate = useNavigate();
  const { staff, setStaff, order, setOrder, payHistory, addPayHistory } = usePayroll();
  const { settings } = useSettings();
  const [selectedId, setSelectedId] = useState(order[0]);
  const [filter, setFilter] = useState('all');
  const [payMethod, setPayMethod] = useState('cash');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState(ROLES[0]);
  const [newBase, setNewBase] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editStaffName, setEditStaffName] = useState(staff[order[0]]?.name || '');
  const [editStaffRole, setEditStaffRole] = useState(staff[order[0]]?.role.split(' · ')[0] || ROLES[0]);
  const [editStaffBase, setEditStaffBase] = useState(String(staff[order[0]]?.base || ''));
  const [banner, setBanner] = useState(null);
  const [lastUpdated, setLastUpdated] = usePersistentState('scrapshop_payroll_last_updated', '10:42 น.');
  const [printSnapshot, setPrintSnapshot] = useState(null);
  const weekDates = useMemo(() => thisWeekDates(), []);

  const s = staff[selectedId];
  const net = Math.max(dailyRate(s.base) * (parseFloat(s.days) || 0) - (parseFloat(s.advance) || 0) + (parseFloat(s.otherAmount) || 0), 0);
  const totalWeeklyDue = useMemo(() => order.reduce((sum, id) => sum + netPay(staff[id]), 0), [order, staff]);

  function touchUpdated() {
    setLastUpdated(nowTimeStr());
  }

  // Writes straight into the persisted staff record on every keystroke so a value
  // is never lost by switching to another staff member or reloading before saving.
  function updateStaffField(key, value) {
    setStaff((prev) => ({ ...prev, [selectedId]: { ...prev[selectedId], [key]: value } }));
  }

  // Cycles one day's attendance (เต็มวัน → ครึ่งวัน → ขาด → เต็มวัน...) and recomputes the
  // week's total from the real per-day breakdown, instead of trusting a manually-typed sum.
  const CYCLE = ['full', 'half', 'off'];
  function toggleAttendanceDay(dayIndex) {
    setStaff((prev) => {
      const cur = prev[selectedId];
      const attendance = [...(cur.attendance || attendanceFromDays(cur.days))];
      attendance[dayIndex] = CYCLE[(CYCLE.indexOf(attendance[dayIndex] || 'off') + 1) % CYCLE.length];
      return { ...prev, [selectedId]: { ...cur, attendance, days: attendanceTotal(attendance) } };
    });
  }

  const rows = useMemo(
    () =>
      order.filter((id) => {
        if (filter === 'pending') return !staff[id].paid;
        if (filter === 'paid') return staff[id].paid;
        return true;
      }),
    [filter, staff, order]
  );

  function selectStaff(id) {
    setSelectedId(id);
    setEditStaffName(staff[id].name);
    setEditStaffRole(staff[id].role.split(' · ')[0]);
    setEditStaffBase(String(staff[id].base));
    setEditOpen(false);
  }

  function otherReasonLabel() {
    if (s.otherReasonId === 'other') return (s.otherCustomReason || '').trim();
    return OTHER_REASONS.find((r) => r.id === s.otherReasonId)?.label || '';
  }

  function openEditStaff(id = selectedId) {
    selectStaff(id);
    setEditOpen(true);
  }

  function handleSaveStaff() {
    const tenureSuffix = s.role.split(' · ').slice(1).join(' · ');
    const nextRole = tenureSuffix ? `${editStaffRole} · ${tenureSuffix}` : editStaffRole;
    setStaff((prev) => ({
      ...prev,
      [selectedId]: {
        ...prev[selectedId],
        name: editStaffName.trim() || prev[selectedId].name,
        role: nextRole,
        base: parseFloat(editStaffBase) || prev[selectedId].base,
      },
    }));
    setEditOpen(false);
    touchUpdated();
    setBanner({ type: 'success', text: `บันทึกข้อมูลพนักงาน ${editStaffName.trim() || s.name} เรียบร้อยแล้ว` });
  }

  function handleDeleteStaff(id = selectedId) {
    // The pay panel reads `staff[selectedId]` unconditionally (dailyRate(s.base) etc.), so
    // letting the last staff record be deleted would leave selectedId pointing at nothing
    // and crash the whole page on the next render.
    if (order.length <= 1) {
      setBanner({ type: 'error', text: 'ต้องมีลูกน้องอย่างน้อย 1 คน ไม่สามารถลบคนสุดท้ายได้' });
      return;
    }
    const target = staff[id];
    if (!window.confirm(`ยืนยันลบข้อมูลพนักงาน "${target.name}"?`)) return;
    const remaining = order.filter((oid) => oid !== id);
    setOrder(remaining);
    setStaff((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (id === selectedId && remaining[0]) selectStaff(remaining[0]);
    touchUpdated();
    setBanner({ type: 'error', text: `ลบข้อมูลพนักงาน "${target.name}" แล้ว` });
  }

  function toggleStaffPaid(id) {
    const target = staff[id];
    const nextPaid = !target.paid;
    setStaff((prev) => ({ ...prev, [id]: { ...prev[id], paid: nextPaid } }));
    touchUpdated();
    setBanner({
      type: nextPaid ? 'success' : 'error',
      text: `ทำเครื่องหมาย ${target.name} เป็น "${nextPaid ? 'จ่ายแล้ว' : 'ค้างจ่าย'}" แล้ว`,
    });
  }

  function handlePay() {
    const payNo = 'PV' + Date.now().toString().slice(-9);
    const now = new Date();
    const timeStr = nowTimeStr();
    const finalDays = clampDays(s.days, s.maxDays);
    const finalAdvance = parseFloat(s.advance) || 0;
    const finalOther = parseFloat(s.otherAmount) || 0;
    const finalOtherLabel = otherReasonLabel();
    const finalNet = Math.max(dailyRate(s.base) * finalDays - finalAdvance + finalOther, 0);
    const finalAttendance = s.attendance || attendanceFromDays(s.days);
    setPrintSnapshot({
      no: payNo,
      time: timeStr,
      date: todayThaiDate(),
      staffName: s.name,
      staffRole: s.role,
      days: finalDays,
      maxDays: s.maxDays,
      attendance: finalAttendance,
      rate: dailyRate(s.base),
      base: s.base,
      advance: finalAdvance,
      otherAmount: finalOther,
      otherLabel: finalOtherLabel,
      net: finalNet,
      payMethod,
    });
    // Pay period is weekly: record the payment, then reset attendance/advances so the next week starts fresh.
    setStaff((prev) => ({
      ...prev,
      [selectedId]: { ...prev[selectedId], days: 0, attendance: attendanceFromDays(0), advance: 0, otherAmount: 0, otherReasonId: '', otherCustomReason: '', paid: false },
    }));
    addPayHistory({
      no: payNo,
      time: timeStr,
      paidAt: now.toISOString(),
      weekKey: weekKeyOf(now),
      weekLabel: weekLabelOf(now),
      staffId: selectedId,
      staffName: s.name,
      staffRole: s.role,
      days: finalDays,
      maxDays: s.maxDays,
      attendance: finalAttendance,
      base: s.base,
      advance: finalAdvance,
      otherAmount: finalOther,
      otherLabel: finalOtherLabel,
      net: finalNet,
      payMethod,
    });
    touchUpdated();
    setBanner({ type: 'success', text: `จ่ายเงินเดือน ${s.name} เรียบร้อยแล้ว ยอดสุทธิ ${money(finalNet)} — เริ่มบันทึกวันทำงานรอบสัปดาห์ใหม่ได้เลย` });
    setTimeout(() => window.print(), 50);
  }

  // Fields already auto-save on every keystroke via updateStaffField; this just normalizes
  // (clamps days, parses numbers) and gives the user an explicit confirmation banner.
  function handleSaveDraft() {
    const finalDays = clampDays(s.days, s.maxDays);
    const finalAdvance = parseFloat(s.advance) || 0;
    const finalOther = parseFloat(s.otherAmount) || 0;
    setStaff((prev) => ({
      ...prev,
      [selectedId]: {
        ...prev[selectedId],
        days: finalDays,
        advance: finalAdvance,
        otherAmount: finalOther,
        otherCustomReason: (prev[selectedId].otherCustomReason || '').trim(),
      },
    }));
    touchUpdated();
    setBanner({ type: 'success', text: `บันทึกวันทำงาน (${finalDays} วัน) เบิกล่วงหน้า และเงินเพิ่มอื่นๆ ของ ${s.name} ไว้แล้ว — ยังไม่ได้จ่ายเงิน` });
  }

  function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = `new_${Date.now()}`;
    const base = parseFloat(newBase) || 0;
    const created = {
      name: newName.trim(),
      role: `${newRole} · เริ่มงานใหม่`,
      init: newName.trim().replace(/^(นาย|นาง|น\.ส\.)/, '').trim().slice(0, 1) || 'ล',
      bg: 'var(--green-100)',
      fg: 'var(--green-700)',
      base,
      days: 0,
      maxDays: MAX_DAYS_PER_WEEK,
      attendance: attendanceFromDays(0),
      advance: 0,
      otherAmount: 0,
      otherReasonId: '',
      otherCustomReason: '',
      paid: false,
    };
    setStaff((prev) => ({ ...prev, [id]: created }));
    setOrder((prev) => [id, ...prev]);
    setSelectedId(id);
    setNewName('');
    setNewBase('');
    setShowNew(false);
    touchUpdated();
    setBanner({ type: 'success', text: `เพิ่มลูกน้อง ${newName.trim()} เรียบร้อยแล้ว` });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            การทำงาน <span>›</span> <b>เงินเดือน</b>
          </div>
          <h1 className="page-title">เงินเดือน</h1>
          <div className="page-sub">บันทึกวันทำงาน (จันทร์-เสาร์) เบิกล่วงหน้า และจ่ายค่าแรงเป็นรายสัปดาห์</div>
        </div>
        <div className="head-actions">
          <div className="month-select">
            <IconClockHistory />
            {THIS_MONTH_LONG}
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setShowNew((v) => !v)}>
            <IconUserAdd />
            เพิ่มลูกน้อง
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

      {showNew && (
        <form className="inline-add-form" onSubmit={handleCreate}>
          <input className="input-plain" placeholder="ชื่อ-นามสกุล" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <select className="input-plain" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <input className="input-plain" placeholder="ฐานเงินเดือน" inputMode="decimal" value={newBase} onChange={(e) => setNewBase(e.target.value)} />
          <button type="submit" className="btn btn-primary">
            บันทึก
          </button>
        </form>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconUsers />
          </div>
          <div>
            <div className="stat-label">ลูกน้องทั้งหมด</div>
            <div className="stat-value">{order.length} คน</div>
            <div className="stat-foot">ทำงานอยู่ {order.length} · ลาออก 0</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconSplit />
          </div>
          <div>
            <div className="stat-label">ยอดค่าแรงที่ต้องจ่ายสัปดาห์นี้</div>
            <div className="stat-value">{money(totalWeeklyDue)}</div>
            <div className="stat-foot">ตามวันทำงานที่บันทึกไว้ (จ.-ส.)</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconCheck />
          </div>
          <div>
            <div className="stat-label">จ่ายแล้ว</div>
            <div className="stat-value">{order.filter((id) => staff[id].paid).length} คน</div>
            <div className="stat-foot">ยอดรวม {money(order.filter((id) => staff[id].paid).reduce((s2, id) => s2 + netPay(staff[id]), 0))}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <IconClockHistory />
          </div>
          <div>
            <div className="stat-label">ค้างจ่าย</div>
            <div className="stat-value">{order.filter((id) => !staff[id].paid).length} คน</div>
            <div className="stat-foot">ยอดรวม {money(order.filter((id) => !staff[id].paid).reduce((s2, id) => s2 + netPay(staff[id]), 0))}</div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ '--detail-w': '360px' }}>
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">
                <IconUsers />
                รายชื่อลูกน้อง
              </div>
              <div className="card-sub">แตะที่ชื่อเพื่อเตรียมจ่ายเงินเดือน</div>
            </div>
            <div className="filter-tabs">
              {[
                ['all', 'ทั้งหมด'],
                ['pending', 'ค้างจ่าย'],
                ['paid', 'จ่ายแล้ว'],
              ].map(([key, label]) => (
                <button key={key} type="button" className={`filter-tab${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '26%' }}>พนักงาน</th>
                <th style={{ width: '14%' }}>วันทำงาน</th>
                <th style={{ width: '15%' }}>ฐานเงินเดือน</th>
                <th style={{ width: '15%' }}>เบิกล่วงหน้า</th>
                <th style={{ width: '15%' }}>ยอดสุทธิ</th>
                <th style={{ width: '11%' }}>สถานะ</th>
                <th style={{ width: '4%' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((id) => {
                const p = staff[id];
                return (
                  <tr key={id} className={`clickable${id === selectedId ? ' selected-row' : ''}`} onClick={() => selectStaff(id)}>
                    <td>
                      <div className="row-cell">
                        <div className="row-icon" style={{ background: p.bg, color: p.fg, borderRadius: '99px' }}>
                          {p.init}
                        </div>
                        <div>
                          <div className="row-name">{p.name}</div>
                          <div className="row-sub">{p.role.split(' · ')[0]}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-blue">
                        {p.days} / {p.maxDays} วัน
                      </span>
                    </td>
                    <td className="num-cell">{money(p.base)}</td>
                    <td className="num-cell neg">−{money(p.advance)}</td>
                    <td className="num-cell">{money(netPay(p))}</td>
                    <td>
                      <button
                        type="button"
                        className={`badge badge-btn ${p.paid ? 'badge-green' : 'badge-amber'}`}
                        title="กดเพื่อสลับสถานะการจ่ายเงิน"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStaffPaid(id);
                        }}
                      >
                        {p.paid ? <IconCheck /> : <IconClockHistory />}
                        {p.paid ? 'จ่ายแล้ว' : 'ค้างจ่าย'}
                      </button>
                    </td>
                    <td>
                      <RowMenu
                        actions={[
                          { label: 'แก้ไข', icon: <IconEdit />, onClick: () => openEditStaff(id) },
                          { label: 'ลบ', icon: <IconTrash />, danger: true, onClick: () => handleDeleteStaff(id) },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="table-foot">
            <span>แสดง {rows.length} จาก {order.length} คน</span>
            <span>อัปเดตล่าสุด {todayThaiDate()} · {lastUpdated}</span>
          </div>
        </div>

        <div className="summary-sticky">
          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconCash />
              จ่ายเงินเดือน
            </div>

            <div className="pay-staff-header">
              <div className="row-icon" style={{ background: s.bg, color: s.fg, borderRadius: '99px', width: 44, height: 44 }}>
                {s.init}
              </div>
              <div>
                <div className="name">{s.name}</div>
                <div className="meta">{s.role}</div>
              </div>
              <button type="button" className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '6px 10px' }} onClick={() => setEditOpen((v) => !v)}>
                <IconEdit style={{ width: 14, height: 14 }} />
              </button>
            </div>

            {editOpen && (
              <div className="inline-add-form" style={{ flexDirection: 'column', marginBottom: 14 }}>
                <input className="input-plain" placeholder="ชื่อ-นามสกุล" value={editStaffName} onChange={(e) => setEditStaffName(e.target.value)} />
                <select className="input-plain" value={editStaffRole} onChange={(e) => setEditStaffRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <input className="input-plain" placeholder="ฐานเงินเดือน" inputMode="decimal" value={editStaffBase} onChange={(e) => setEditStaffBase(e.target.value)} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSaveStaff}>
                    บันทึกข้อมูลพนักงาน
                  </button>
                  <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setEditOpen(false)}>
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}

            <div className="field">
              <label>วันทำงาน (สัปดาห์นี้ จ.-ส.) — แตะแต่ละวันเพื่อสลับ เต็มวัน/ครึ่งวัน/ขาด</label>
              <div className="attendance-picker">
                {DAY_LABELS.map((label, i) => {
                  const st = (s.attendance || attendanceFromDays(s.days))[i] || 'off';
                  const dateNum = weekDates[i].getDate();
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`attendance-day attendance-${st}`}
                      onClick={() => toggleAttendanceDay(i)}
                      title={`${label} ${dateNum} — ${ATTENDANCE_LABEL[st]}`}
                    >
                      <span className="d">{label}</span>
                      <span className="s">{dateNum}</span>
                    </button>
                  );
                })}
              </div>
              <div className="attendance-total">
                รวม <b>{attendanceTotal(s.attendance || attendanceFromDays(s.days))}</b> จาก {s.maxDays} วัน
              </div>
            </div>

            <div className="field">
              <label>เบิกล่วงหน้า</label>
              <input
                className="input-plain"
                inputMode="decimal"
                placeholder="จำนวนเงิน"
                value={s.advance}
                onChange={(e) => updateStaffField('advance', e.target.value)}
              />
            </div>

            <div className="field">
              <label>อื่นๆ (เงินเพิ่ม)</label>
              <select
                className="input-plain"
                style={{ marginBottom: 8 }}
                value={s.otherReasonId || ''}
                onChange={(e) => updateStaffField('otherReasonId', e.target.value)}
              >
                <option value="">เลือกประเภท (ไม่บังคับ)...</option>
                {OTHER_REASONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              {s.otherReasonId === 'other' && (
                <input
                  className="input-plain"
                  style={{ marginBottom: 8 }}
                  placeholder="ระบุประเภทเอง"
                  value={s.otherCustomReason || ''}
                  onChange={(e) => updateStaffField('otherCustomReason', e.target.value)}
                />
              )}
              <input
                className="input-plain"
                inputMode="decimal"
                placeholder="จำนวนเงิน"
                value={s.otherAmount}
                onChange={(e) => updateStaffField('otherAmount', e.target.value)}
              />
            </div>

            <div className="sum-row">
              <span className="label">ค่าแรงต่อวัน</span>
              <span className="val">{money(dailyRate(s.base))}</span>
            </div>
            <div className="sum-row">
              <span className="label">ฐานเงินเดือน</span>
              <span className="val">{money(s.base)}</span>
            </div>
            <div className="sum-row">
              <span className="label">เบิกล่วงหน้า</span>
              <span className="val minus">−{money(parseFloat(s.advance) || 0)}</span>
            </div>
            <div className="sum-row">
              <span className="label">อื่นๆ{otherReasonLabel() ? ` (${otherReasonLabel()})` : ''}</span>
              <span className="val plus">+{money(parseFloat(s.otherAmount) || 0)}</span>
            </div>
            <hr className="sum-divider" />

            <div className="grand-total">
              <span className="label">ยอดสุทธิที่ต้องจ่าย</span>
              <span className="val">{money(net)}</span>
            </div>

            <div style={{ marginTop: 18 }}>
              <label className="pay-label">วิธีจ่ายเงิน</label>
              <div className="pay-methods">
                <div className={`pay-btn${payMethod === 'cash' ? ' selected' : ''}`} onClick={() => setPayMethod('cash')} role="button" tabIndex={0}>
                  <IconCash />
                  เงินสด
                </div>
                <div className={`pay-btn${payMethod === 'transfer' ? ' selected' : ''}`} onClick={() => setPayMethod('transfer')} role="button" tabIndex={0}>
                  <IconTransfer />
                  โอนเงิน
                </div>
                <div className={`pay-btn${payMethod === 'promptpay' ? ' selected' : ''}`} onClick={() => setPayMethod('promptpay')} role="button" tabIndex={0}>
                  <IconPhone />
                  พร้อมเพย์
                </div>
              </div>
            </div>

            <div className="submit-stack">
              <button type="button" className="btn btn-primary btn-block" onClick={handlePay} disabled={s.paid}>
                <IconPrint />
                {s.paid ? 'จ่ายเงินแล้ว' : 'จ่ายเงินและพิมพ์สลิป'}
              </button>
              <button type="button" className="btn btn-ghost btn-block" onClick={handleSaveDraft}>
                <IconArchive />
                บันทึกไว้ก่อน
              </button>
              <button type="button" className="btn btn-danger-ghost btn-block" onClick={() => handleDeleteStaff()}>
                <IconTrash />
                ลบพนักงานคนนี้
              </button>
              <div className="helper-note">
                <IconInfo />
                ระบบจะบันทึกลงประวัติเงินเดือนอัตโนมัติ
              </div>
            </div>
          </div>

          <div className="card mini-stat-card">
            <div className="mini-stat-title">
              <IconReceipt />
              ประวัติจ่ายล่าสุด
            </div>
            {(payHistory.length > 0 ? payHistory : FALLBACK_HISTORY).slice(0, 3).map((p, i) => (
              <div className="mini-stat-row" key={i}>
                <span>
                  {p.no} · {p.staffName || p.name}
                </span>
                <span className="n">{p.net !== undefined ? money(p.net) : p.amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}>
            <IconReceipt />
            รายงานเงินเดือนย้อนหลัง
          </div>
          <div className="card-sub">ดูสรุปยอดจ่ายเงินเดือนย้อนหลัง แยกรายสัปดาห์ รายเดือน และรายปี ได้ที่หน้ารายงาน</div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/payroll-report')}>
          <IconReceipt />
          ไปที่รายงานเงินเดือน
        </button>
      </div>

      {printSnapshot && (
        <div className="hidden-until-print">
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
              <span>เลขที่สลิปเงินเดือน</span>
              <b>{printSnapshot.no}</b>
            </div>
            <div className="paper-meta">
              <span>วันที่จ่าย</span>
              <b>{printSnapshot.date} · {printSnapshot.time}</b>
            </div>
            <div className="paper-meta">
              <span>พนักงาน</span>
              <b>{printSnapshot.staffName}</b>
            </div>
            <div className="paper-meta">
              <span>ตำแหน่ง</span>
              <b>{printSnapshot.staffRole}</b>
            </div>
            <hr className="paper-divider" />

            <div className="paper-items">
              <div className="paper-item">
                <div className="pn">
                  ค่าแรงรายสัปดาห์
                  <span className="pw">
                    {money(printSnapshot.rate)}/วัน × ทำงาน {printSnapshot.days} จาก {printSnapshot.maxDays} วัน (จ.-ส.)
                  </span>
                  <span className="pw">
                    {DAY_LABELS.map((label, i) => `${label} ${printSnapshot.attendance?.[i] === 'full' ? '✓' : printSnapshot.attendance?.[i] === 'half' ? '½' : '✕'}`).join('  ')}
                  </span>
                </div>
                <div className="pt">{money(printSnapshot.rate * printSnapshot.days)}</div>
              </div>
              <div className="paper-item">
                <div className="pn">เบิกล่วงหน้า</div>
                <div className="pt">−{money(printSnapshot.advance)}</div>
              </div>
              <div className="paper-item">
                <div className="pn">อื่นๆ{printSnapshot.otherLabel ? ` (${printSnapshot.otherLabel})` : ''}</div>
                <div className="pt">+{money(printSnapshot.otherAmount)}</div>
              </div>
            </div>

            <div className="paper-total-row">
              <span className="l">ยอดสุทธิที่จ่าย</span>
              <span className="v">{money(printSnapshot.net)}</span>
            </div>
            <div className="paper-meta" style={{ marginTop: 8 }}>
              <span>วิธีจ่ายเงิน</span>
              <b>{PAY_METHOD_LABELS[printSnapshot.payMethod]}</b>
            </div>

            <div className="paper-barcode">
              {Array.from({ length: 18 }).map((_, i) => (
                <span key={i} style={{ height: 34, width: (i % 3) + 1 }}></span>
              ))}
            </div>
            <div className="paper-foot">
              {printSnapshot.no} · สลิปเงินเดือนนี้ออกโดยระบบอัตโนมัติ
              <br />
              โปรดเก็บสลิปไว้เป็นหลักฐาน
            </div>
          </div>
        </div>
      )}
    </>
  );
}
