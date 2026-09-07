import { useMemo, useState } from 'react';
import { usePayroll, DAY_LABELS, ATTENDANCE_LABEL, PAY_METHOD_LABELS } from '../context/PayrollContext.jsx';
import { exportCsv } from '../lib/csvExport.js';
import { IconReceipt, IconDownload, IconCash, IconClockHistory, IconUsers } from '../icons.jsx';

function money(n) {
  return '฿' + (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthKeyOf(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabelOf(date) {
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: 'long', year: 'numeric' }).format(new Date(date));
}
function yearKeyOf(date) {
  return String(new Date(date).getFullYear());
}
function yearLabelOf(date) {
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { year: 'numeric' }).format(new Date(date));
}
function paidDateShort(date) {
  return new Date(date).toLocaleDateString('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short' });
}

// Every finalized payment already carries weekKey/weekLabel (stamped at pay time in
// Payroll.jsx); month/year grouping reads the same records at a coarser granularity by
// re-deriving the bucket from paidAt instead of needing its own stored field.
const REPORT_PERIODS = [
  { key: 'week', label: 'รายสัปดาห์', groupKey: (r) => r.weekKey, groupLabel: (r) => r.weekLabel },
  { key: 'month', label: 'รายเดือน', groupKey: (r) => monthKeyOf(r.paidAt), groupLabel: (r) => monthLabelOf(r.paidAt) },
  { key: 'year', label: 'รายปี', groupKey: (r) => yearKeyOf(r.paidAt), groupLabel: (r) => yearLabelOf(r.paidAt) },
];

export default function PayrollReport() {
  const { payHistory } = usePayroll();
  const [reportPeriod, setReportPeriod] = useState('week');
  const [selectedPeriodKey, setSelectedPeriodKey] = useState(null);

  const periodDef = REPORT_PERIODS.find((p) => p.key === reportPeriod);

  const periodGroups = useMemo(() => {
    const map = new Map();
    for (const rec of payHistory) {
      const k = periodDef.groupKey(rec);
      if (!map.has(k)) {
        map.set(k, { key: k, label: periodDef.groupLabel(rec), records: [], total: 0 });
      }
      const g = map.get(k);
      g.records.push(rec);
      g.total += rec.net;
    }
    return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payHistory, reportPeriod]);

  const activePeriodKey = periodGroups.some((g) => g.key === selectedPeriodKey) ? selectedPeriodKey : periodGroups[0]?.key;
  const activePeriod = periodGroups.find((g) => g.key === activePeriodKey);

  function selectReportPeriod(period) {
    setReportPeriod(period);
    setSelectedPeriodKey(null);
  }

  const allTimeTotal = useMemo(() => payHistory.reduce((sum, r) => sum + (r.net || 0), 0), [payHistory]);
  const staffPaidCount = useMemo(() => new Set(payHistory.map((r) => r.staffId)).size, [payHistory]);
  const mostRecent = payHistory.length
    ? [...payHistory].sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1))[0]
    : null;

  function handleExport() {
    if (!activePeriod) return;
    exportCsv(
      `payroll-report-${activePeriod.key}.csv`,
      ['พนักงาน', 'วันที่จ่าย', 'วันทำงาน', 'เบิกล่วงหน้า', 'อื่นๆ', 'ยอดสุทธิ', 'วิธีจ่าย', 'เวลา'],
      activePeriod.records.map((r) => [
        r.staffName,
        paidDateShort(r.paidAt),
        `${r.days}/${r.maxDays}`,
        r.advance.toFixed(2),
        r.otherAmount.toFixed(2),
        r.net.toFixed(2),
        PAY_METHOD_LABELS[r.payMethod] || r.payMethod,
        r.time,
      ])
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            รายงาน <span>›</span> <b>รายงานเงินเดือน</b>
          </div>
          <h1 className="page-title">รายงานเงินเดือน</h1>
          <div className="page-sub">เก็บและตรวจสอบยอดจ่ายเงินเดือนย้อนหลัง แยกดูได้ทั้งรายสัปดาห์ รายเดือน และรายปี</div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={handleExport} disabled={!activePeriod}>
            <IconDownload />
            ส่งออก Excel
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconCash />
          </div>
          <div>
            <div className="stat-label">ยอดจ่ายเงินเดือนสะสมทั้งหมด</div>
            <div className="stat-value">{money(allTimeTotal)}</div>
            <div className="stat-foot">{payHistory.length} งวดจ่าย นับตั้งแต่เริ่มใช้ระบบ</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconUsers />
          </div>
          <div>
            <div className="stat-label">ลูกน้องที่เคยจ่ายเงิน</div>
            <div className="stat-value">{staffPaidCount} คน</div>
            <div className="stat-foot">นับจากประวัติการจ่ายจริง</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <IconClockHistory />
          </div>
          <div>
            <div className="stat-label">จ่ายล่าสุด</div>
            <div className="stat-value">{mostRecent ? money(mostRecent.net) : '—'}</div>
            <div className="stat-foot">{mostRecent ? `${mostRecent.staffName} · ${paidDateShort(mostRecent.paidAt)}` : 'ยังไม่มีประวัติ'}</div>
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-head">
          <div>
            <div className="card-title">
              <IconReceipt />
              ประวัติการจ่ายเงินเดือน
            </div>
            <div className="card-sub">เลือกช่วงเวลาเพื่อดูรายละเอียดงวดจ่ายและยอดรวม</div>
          </div>
          <div className="filter-tabs">
            {REPORT_PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`filter-tab${reportPeriod === p.key ? ' active' : ''}`}
                onClick={() => selectReportPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {periodGroups.length > 0 && (
          <div className="toolbar">
            <select
              className="input-plain"
              style={{ maxWidth: 280 }}
              value={activePeriodKey}
              onChange={(e) => setSelectedPeriodKey(e.target.value)}
            >
              {periodGroups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label} ({g.records.length} รายการ)
                </option>
              ))}
            </select>
          </div>
        )}

        {periodGroups.length === 0 ? (
          <div className="empty-hint">ยังไม่มีประวัติการจ่ายเงินเดือน — เมื่อกด "จ่ายเงินและพิมพ์สลิป" ที่หน้าเงินเดือน ระบบจะบันทึกไว้ที่นี่โดยอัตโนมัติ</div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '18%' }}>พนักงาน</th>
                  <th style={{ width: '12%' }}>วันที่จ่าย</th>
                  <th style={{ width: '12%' }}>วันทำงาน</th>
                  <th style={{ width: '14%' }}>เบิกล่วงหน้า</th>
                  <th style={{ width: '16%' }}>อื่นๆ</th>
                  <th style={{ width: '13%' }}>ยอดสุทธิ</th>
                  <th style={{ width: '10%' }}>วิธีจ่าย</th>
                  <th style={{ width: '5%' }}>เวลา</th>
                </tr>
              </thead>
              <tbody>
                {activePeriod.records.map((r) => (
                  <tr key={r.no}>
                    <td>{r.staffName}</td>
                    <td>{paidDateShort(r.paidAt)}</td>
                    <td title={r.attendance ? DAY_LABELS.map((l, i) => `${l}:${ATTENDANCE_LABEL[r.attendance[i]] || 'ขาด'}`).join(' ') : undefined}>
                      {r.days} / {r.maxDays} วัน
                    </td>
                    <td className="num-cell neg">−{money(r.advance)}</td>
                    <td className="num-cell plus">
                      +{money(r.otherAmount)}
                      {r.otherLabel ? ` (${r.otherLabel})` : ''}
                    </td>
                    <td className="num-cell">{money(r.net)}</td>
                    <td>{PAY_METHOD_LABELS[r.payMethod]}</td>
                    <td>{r.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="table-foot">
              <span>จ่ายไปแล้ว {activePeriod.records.length} รายการ</span>
              <span>รวม{periodDef.label} {money(activePeriod.total)}</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
