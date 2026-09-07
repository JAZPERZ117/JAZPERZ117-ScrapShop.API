import { useMemo } from 'react';
import { IconCalendarBars, IconDownload, IconPrint, IconCategory, IconUsers, IconCash, IconClockHistory } from '../icons.jsx';
import { exportCsv } from '../lib/csvExport.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { useReceipts, INITIAL_ORDER as RECEIPTS_INITIAL_ORDER } from '../context/ReceiptsContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { usePayroll } from '../context/PayrollContext.jsx';
import './MonthlyReport.css';

// This app has no real day-by-day receipt history to compute a true 31-day trend from
// (the seed data only represents "today"), so this daily chart stays as reference/
// illustrative figures — same documented limitation as the 12-month chart on the
// Annual Report page.
// Same baseline convention as the 512450 baht / 186 receipt figures below, at the same
// ~23.3 baht/kg rate the historical months on TaxReport.jsx/AnnualReport.jsx average —
// without this, "this month" weight came out as just the seed receipts' raw ~470 kg with
// no baseline at all, next to a baseline'd baht figure, implying an absurd ~1,090 baht/kg.
const MONTH_BASELINE_WEIGHT = 21955;

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));
const THIS_MONTH = [8, 12, 15, 11, 17, 22, 19, 14, 10, 16, 21, 25, 20, 18, 23, 28, 24, 19, 15, 20, 26, 30, 27, 22, 18, 24, 29, 33, 28, 24, 20].map((v) => v * 750);
const LAST_MONTH = [9, 11, 13, 10, 14, 18, 17, 13, 9, 14, 18, 21, 19, 15, 20, 24, 21, 17, 13, 17, 22, 26, 24, 19, 15, 20, 25, 28, 24, 20, 17].map((v) => v * 720);

function parseMoney(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}

function parseWeightKg(w) {
  return parseFloat(String(w).replace(/[^\d.]/g, '')) || 0;
}

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthLabelBE(offset, style) {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: style, year: 'numeric' }).format(d);
}
const THIS_MONTH_LONG = monthLabelBE(0, 'long');
const THIS_MONTH_SHORT = monthLabelBE(0, 'short');
const LAST_MONTH_SHORT = monthLabelBE(1, 'short');

function makeLineChart(seriesA, seriesB, labels) {
  const w = 640,
    h = 220,
    padL = 30,
    padR = 10,
    padT = 10,
    padB = 24;
  const allVals = [...seriesA, ...seriesB];
  const min = Math.min(...allVals) * 0.9,
    max = Math.max(...allVals) * 1.05;
  const range = max - min;
  const stepX = (w - padL - padR) / (seriesA.length - 1);
  const toY = (v) => padT + (h - padT - padB) - ((v - min) / range) * (h - padT - padB);
  const ptsA = seriesA.map((v, i) => `${(padL + i * stepX).toFixed(1)},${toY(v).toFixed(1)}`);
  const ptsB = seriesB.map((v, i) => `${(padL + i * stepX).toFixed(1)},${toY(v).toFixed(1)}`);
  const areaA = ptsA.join(' ') + ` ${(padL + (seriesA.length - 1) * stepX).toFixed(1)},${h - padB} ${padL},${h - padB}`;
  const gridLines = [];
  for (let i = 0; i <= 3; i++) {
    const y = padT + (i * (h - padT - padB)) / 3;
    gridLines.push(<line key={i} x1={padL} y1={y.toFixed(1)} x2={w - padR} y2={y.toFixed(1)} stroke="#E6EAE7" strokeWidth="1" />);
  }
  const xLabels = [];
  labels.forEach((lb, i) => {
    if (i % 5 === 0 || i === labels.length - 1) {
      xLabels.push(
        <text key={i} x={(padL + i * stepX).toFixed(1)} y={h - 6} fontSize="9" fill="#78857F" textAnchor="middle" fontFamily="Sarabun">
          {lb}
        </text>
      );
    }
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="220" preserveAspectRatio="none">
      {gridLines}
      <polyline points={areaA} fill="#2CB868" opacity="0.10" stroke="none" />
      <polyline points={ptsB.join(' ')} fill="none" stroke="#AAB4AF" strokeWidth="2" strokeDasharray="4,3" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={ptsA.join(' ')} fill="none" stroke="#1F9D5C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {xLabels}
    </svg>
  );
}

function nowStr() {
  return new Date().toLocaleString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MonthlyReport() {
  const { settings } = useSettings();
  const { receipts, order: receiptOrder } = useReceipts();
  const { products } = useProducts();
  const { order: staffOrder, payHistory } = usePayroll();
  const chart = useMemo(() => makeLineChart(THIS_MONTH, LAST_MONTH, DAYS), []);

  const activeReceipts = receiptOrder.filter((id) => receipts[id].status !== 'void');
  // Same "current month" convention used on Dashboard/Receipts/TaxReport: seed receipts
  // are this month's baseline, anything added beyond that baseline extends it for real.
  // A voided receipt shouldn't still count toward revenue, so the delta is active-only.
  const newReceiptIds = receiptOrder.filter((id) => !RECEIPTS_INITIAL_ORDER.includes(id));
  const newActiveReceiptIds = newReceiptIds.filter((id) => receipts[id].status !== 'void');
  const monthTotal = 512450 + newActiveReceiptIds.reduce((s, id) => s + parseMoney(receipts[id].total), 0);
  const monthCount = 186 + newActiveReceiptIds.length;
  const monthWeight = MONTH_BASELINE_WEIGHT + newActiveReceiptIds.reduce((s, id) => s + parseWeightKg(receipts[id].weight), 0);
  const totalDeductionKg = activeReceipts.reduce((s, id) => s + (receipts[id].deductionWeight || 0), 0);
  // Real payroll payments only, scoped to this calendar month — payHistory persists
  // indefinitely, so summing it unfiltered would silently pull in prior months' wages too
  // once payroll has run more than once, understating "กำไรสุทธิเดือนนี้". Mirrors
  // PayrollReport.jsx's monthKeyOf bucketing.
  const now = new Date();
  const wagesPaid = payHistory
    .filter((p) => {
      const d = new Date(p.paidAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((s, p) => s + (p.net || 0), 0);
  const netProfit = Math.max(monthTotal - wagesPaid, 0);

  const categoryRows = useMemo(() => {
    const byCat = {};
    for (const id of activeReceipts) {
      for (const it of receipts[id].items || []) {
        const product = Object.values(products).find((p) => p.name === it.n);
        const cat = product?.cat || 'อื่นๆ';
        if (!byCat[cat]) byCat[cat] = { weight: 0, amt: 0, Icon: product?.Icon, bg: product?.bg || 'var(--bg)', fg: product?.fg || 'var(--ink-500)' };
        byCat[cat].weight += parseWeightKg(it.w);
        byCat[cat].amt += parseMoney(it.t);
      }
    }
    return Object.entries(byCat)
      .map(([name, c]) => ({ name, ...c }))
      .sort((a, b) => b.amt - a.amt);
  }, [activeReceipts, receipts, products]);

  const topCustomers = useMemo(() => {
    const byCust = {};
    for (const id of activeReceipts) {
      const r = receipts[id];
      if (!byCust[r.cust]) byCust[r.cust] = { amt: 0, count: 0 };
      byCust[r.cust].amt += parseMoney(r.total);
      byCust[r.cust].count += 1;
    }
    return Object.entries(byCust).sort((a, b) => b[1].amt - a[1].amt).slice(0, 3);
  }, [activeReceipts, receipts]);

  function handleExport() {
    exportCsv(
      'monthly-report.csv',
      ['หมวดหมู่', 'น้ำหนัก (กก.)', 'ยอดเงิน'],
      categoryRows.map((c) => [c.name, c.weight.toFixed(2), c.amt.toFixed(2)])
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            รายงาน <span>›</span> <b>รายงานประจำเดือน</b>
          </div>
          <h1 className="page-title">รายงานประจำเดือน</h1>
          <div className="page-sub">แนวโน้มยอดรับซื้อ กำไร และเปรียบเทียบกับเดือนก่อนหน้า</div>
        </div>
        <div className="head-actions">
          <div className="date-select">
            <IconClockHistory />
            {THIS_MONTH_LONG}
          </div>
          <button type="button" className="btn btn-ghost" onClick={handleExport}>
            <IconDownload />
            ส่งออก Excel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <IconPrint />
            พิมพ์รายงาน
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconCalendarBars />
          </div>
          <div>
            <div className="stat-label">ยอดรับซื้อเดือนนี้</div>
            <div className="stat-value">{money(monthTotal)}</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              {monthCount} ใบเสร็จ
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconCalendarBars />
          </div>
          <div>
            <div className="stat-label">น้ำหนักรวม</div>
            <div className="stat-value">{monthWeight.toLocaleString('th-TH')} กก.</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              หักน้ำหนักไปแล้ว {totalDeductionKg.toFixed(2)} กก.
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--teal-bg, #E4F6F4)', color: 'var(--teal, #0E8E82)' }}>
            <IconCash />
          </div>
          <div>
            <div className="stat-label">กำไรสุทธิเดือนนี้</div>
            <div className="stat-value">{money(netProfit)}</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              หลังหักเงินเดือน
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}>
            <IconCash />
          </div>
          <div>
            <div className="stat-label">เงินเดือนที่จ่ายไปแล้ว</div>
            <div className="stat-value">{money(wagesPaid)}</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              {staffOrder.length} คนในระบบ
            </div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ '--detail-w': '340px' }}>
        <div>
          <div className="card card-pad section-gap">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <IconCalendarBars />
                  ยอดรับซื้อรายวันตลอดเดือน
                </div>
                <div className="card-sub">เปรียบเทียบกับเดือนก่อนหน้า (บาท) — ตัวเลขอ้างอิงสำหรับแสดงแนวโน้ม</div>
              </div>
              <div className="legend">
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: 'var(--green-600)' }}></span>{THIS_MONTH_SHORT}
                </div>
                <div className="legend-item">
                  <span className="legend-dot" style={{ background: 'var(--ink-300)' }}></span>{LAST_MONTH_SHORT}
                </div>
              </div>
            </div>
            {chart}
          </div>

          <div className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <IconCategory />
                  ยอดรับซื้อแยกตามหมวดหมู่
                </div>
                <div className="card-sub">สัดส่วนยอดเงินของแต่ละหมวดหมู่เดือนนี้</div>
              </div>
            </div>
            {categoryRows.length === 0 ? (
              <div className="empty-hint">ยังไม่มีข้อมูลใบเสร็จ</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>หมวดหมู่</th>
                    <th style={{ width: '30%' }}>น้ำหนัก</th>
                    <th style={{ width: '30%' }}>ยอดเงิน</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map((c) => (
                    <tr key={c.name}>
                      <td>
                        <div className="row-cell">
                          {c.Icon && (
                            <div className="row-icon" style={{ background: c.bg, color: c.fg }}>
                              <c.Icon />
                            </div>
                          )}
                          <div className="row-name">{c.name}</div>
                        </div>
                      </td>
                      <td className="num-cell">{c.weight.toLocaleString('th-TH')} กก.</td>
                      <td className="num-cell">{money(c.amt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="summary-sticky">
          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconUsers />
              ลูกค้ายอดซื้อขายสูงสุด
            </div>
            {topCustomers.length === 0 && <div className="empty-hint">ยังไม่มีข้อมูล</div>}
            {topCustomers.map(([name, c]) => (
              <div className="mini-stat-row" key={name}>
                <div>
                  <div className="name">{name}</div>
                  <div className="sub">{c.count} ครั้งเดือนนี้</div>
                </div>
                <span className="n">{money(c.amt)}</span>
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconCash />
              ค่าใช้จ่ายเดือนนี้
            </div>
            <div className="sum-row">
              <span className="label">เงินเดือนลูกน้อง {staffOrder.length} คน</span>
              <span className="val">{money(wagesPaid)}</span>
            </div>
            <div className="sum-row">
              <span className="label">หักน้ำหนัก/เหตุผล</span>
              <span className="val">{totalDeductionKg.toFixed(2)} กก.</span>
            </div>
            <div className="grand-total">
              <span className="label">กำไรสุทธิ</span>
              <span className="val">{money(netProfit)}</span>
            </div>
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={() => window.print()}>
            <IconPrint />
            พิมพ์รายงานเดือนนี้
          </button>
        </div>
      </div>

      <div className="hidden-until-print">
        <div className="a4-doc">
          <div className="a4-doc-top">
            <div className="a4-doc-shop">{settings.shopName}</div>
            <div className="a4-doc-addr">
              {settings.address}
              <br />
              โทร. {settings.phone} &nbsp;|&nbsp; เลขผู้เสียภาษี {settings.taxId}
            </div>
            <div className="a4-doc-title">รายงานประจำเดือน · {THIS_MONTH_LONG}</div>
          </div>
          <hr className="a4-doc-divider" />

          <div className="a4-doc-meta-grid">
            <div className="a4-doc-meta-row">
              <span>ยอดรับซื้อเดือนนี้</span>
              <b>{money(monthTotal)}</b>
            </div>
            <div className="a4-doc-meta-row">
              <span>น้ำหนักรวม</span>
              <b>{monthWeight.toLocaleString('th-TH')} กก.</b>
            </div>
            <div className="a4-doc-meta-row">
              <span>กำไรสุทธิเดือนนี้</span>
              <b>{money(netProfit)}</b>
            </div>
            <div className="a4-doc-meta-row">
              <span>เงินเดือนที่จ่ายไปแล้ว</span>
              <b>{money(wagesPaid)}</b>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>หมวดหมู่</th>
                <th className="num">น้ำหนัก</th>
                <th className="num">ยอดเงิน</th>
              </tr>
            </thead>
            <tbody>
              {categoryRows.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td className="num">{c.weight.toLocaleString('th-TH')} กก.</td>
                  <td className="num">{money(c.amt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="a4-doc-summary">
            {topCustomers.map(([name, c]) => (
              <div className="a4-doc-sum-row" key={name}>
                <span>{name} ({c.count} ครั้งเดือนนี้)</span>
                <b>{money(c.amt)}</b>
              </div>
            ))}
            <div className="a4-doc-sum-row">
              <span>เงินเดือนลูกน้อง {staffOrder.length} คน</span>
              <b>{money(wagesPaid)}</b>
            </div>
            <div className="a4-doc-sum-row">
              <span>หักน้ำหนัก/เหตุผล</span>
              <b>{totalDeductionKg.toFixed(2)} กก.</b>
            </div>
            <div className="a4-doc-grand">
              <span>กำไรสุทธิ</span>
              <span>{money(netProfit)}</span>
            </div>
          </div>

          <div className="a4-doc-foot">พิมพ์เมื่อ {nowStr()} · ตัวเลขจากระบบ ณ เวลาที่พิมพ์</div>
        </div>
      </div>
    </>
  );
}
