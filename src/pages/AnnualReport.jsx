import { useMemo } from 'react';
import { IconCalendarBars, IconDownload, IconPrint, IconCategory, IconClockHistory, IconUsers } from '../icons.jsx';
import { exportCsv } from '../lib/csvExport.js';
import { useReceipts, INITIAL_ORDER as RECEIPTS_INITIAL_ORDER } from '../context/ReceiptsContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useCustomers, INITIAL_ORDER as CUSTOMERS_INITIAL_ORDER } from '../context/CustomersContext.jsx';
import { usePayroll } from '../context/PayrollContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import './AnnualReport.css';

// Jan-Apr are historical reference figures (same convention as the Tax Report page — this
// app has no real date-stamped receipt history for past months); adding the real current
// month on top gives a genuine, if partial, year-to-date total instead of a frozen number.
const HISTORICAL_MONTHLY_AMT = [402300, 384100, 452800, 396950];
const HISTORICAL_MONTHLY_WEIGHT = [17240, 16510, 19320, 17020];
const HISTORICAL_MONTHLY_RECEIPTS = [142, 138, 151, 125];

// Same baseline convention as the 512450 baht / 186 receipt figures below, at the same
// ~23.3 baht/kg rate the historical months above average — without this, "current month"
// weight came out as just the seed receipts' raw ~470 kg with no baseline at all, next to
// a baseline'd baht figure, implying an absurd ~1,090 baht/kg for the current month only.
const CURRENT_MONTH_BASELINE_WEIGHT = 21955;

// This app has no real month-by-month receipt history to compute a true 12-month trend
// from, so the monthly chart and quarter cards below stay as historical reference figures.
const MONTHS = [
  { m: 'ม.ค.', v: 145, pct: 52 },
  { m: 'ก.พ.', v: 138, pct: 49 },
  { m: 'มี.ค.', v: 162, pct: 58 },
  { m: 'เม.ย.', v: 171, pct: 61 },
  { m: 'พ.ค.', v: 184, pct: 66, peak: true },
  { m: 'มิ.ย.', v: 0, pct: 6, future: true },
  { m: 'ก.ค.', v: 0, pct: 6, future: true },
  { m: 'ส.ค.', v: 0, pct: 6, future: true },
  { m: 'ก.ย.', v: 0, pct: 6, future: true },
  { m: 'ต.ค.', v: 0, pct: 6, future: true },
  { m: 'พ.ย.', v: 0, pct: 6, future: true },
  { m: 'ธ.ค.', v: 0, pct: 6, future: true },
];

function parseMoney(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}

function parseWeightKg(w) {
  return parseFloat(String(w).replace(/[^\d.]/g, '')) || 0;
}

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nowStr() {
  return new Date().toLocaleString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const CURRENT_YEAR_BE = new Date().getFullYear() + 543;

export default function AnnualReport() {
  const { receipts, order: receiptOrder } = useReceipts();
  const { products } = useProducts();
  const { order: customerOrder } = useCustomers();
  const { payHistory } = usePayroll();
  const { settings } = useSettings();
  const activeReceipts = receiptOrder.filter((id) => receipts[id].status !== 'void');

  // Same "current month" convention used on Dashboard/Receipts/MonthlyReport/TaxReport:
  // seed receipts are this month's baseline, and anything added beyond it (excluding
  // voided receipts) extends it for real.
  const newReceiptIds = receiptOrder.filter((id) => !RECEIPTS_INITIAL_ORDER.includes(id));
  const newActiveReceiptIds = newReceiptIds.filter((id) => receipts[id].status !== 'void');
  const currentMonthAmt = 512450 + newActiveReceiptIds.reduce((s, id) => s + parseMoney(receipts[id].total), 0);
  const currentMonthWeight = CURRENT_MONTH_BASELINE_WEIGHT + newActiveReceiptIds.reduce((s, id) => s + parseWeightKg(receipts[id].weight), 0);
  const currentMonthReceiptCount = 186 + newActiveReceiptIds.length;

  const ytdRevenue = HISTORICAL_MONTHLY_AMT.reduce((a, b) => a + b, 0) + currentMonthAmt;
  const ytdWeight = HISTORICAL_MONTHLY_WEIGHT.reduce((a, b) => a + b, 0) + currentMonthWeight;
  const ytdReceiptCount = HISTORICAL_MONTHLY_RECEIPTS.reduce((a, b) => a + b, 0) + currentMonthReceiptCount;
  // Real payroll payments only, scoped to this year — payHistory persists indefinitely, so
  // summing it unfiltered would silently pull in wages paid in a prior year too once any
  // exist, understating "กำไรสุทธิทั้งปี". Mirrors PayrollReport.jsx's yearKeyOf bucketing.
  const currentYear = new Date().getFullYear();
  const wagesPaid = payHistory
    .filter((p) => new Date(p.paidAt).getFullYear() === currentYear)
    .reduce((s, p) => s + (p.net || 0), 0);
  const netProfit = Math.max(ytdRevenue - wagesPaid, 0);
  const newCustomerIds = customerOrder.filter((id) => !CUSTOMERS_INITIAL_ORDER.includes(id));

  const breakdown = useMemo(() => {
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
    const total = Object.values(byCat).reduce((s, c) => s + c.amt, 0) || 1;
    return Object.entries(byCat)
      .map(([name, c]) => ({ name, ...c, pct: Math.round((c.amt / total) * 100) }))
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
      'annual-report.csv',
      ['หมวดหมู่', 'น้ำหนัก', 'ยอดเงิน', 'สัดส่วน'],
      breakdown.map((b) => [b.name, `${b.weight.toFixed(2)} กก.`, money(b.amt), `${b.pct}%`])
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            รายงาน <span>›</span> <b>รายงานประจำปี</b>
          </div>
          <h1 className="page-title">รายงานประจำปี</h1>
          <div className="page-sub">ภาพรวมยอดรับซื้อและกำไรตลอดปี แยกตามไตรมาสและหมวดหมู่</div>
        </div>
        <div className="head-actions">
          <div className="date-select">
            <IconClockHistory />
            ปี {CURRENT_YEAR_BE}
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
            <div className="stat-label">ยอดรับซื้อรวมปีนี้</div>
            <div className="stat-value">{money(ytdRevenue)}</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              สะสมตั้งแต่ต้นปี
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconCalendarBars />
          </div>
          <div>
            <div className="stat-label">น้ำหนักรวมทั้งปี</div>
            <div className="stat-value">{ytdWeight.toLocaleString('th-TH')} กก.</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              {ytdReceiptCount} ใบเสร็จ
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--teal-bg, #E4F6F4)', color: 'var(--teal, #0E8E82)' }}>
            <IconCalendarBars />
          </div>
          <div>
            <div className="stat-label">กำไรสุทธิทั้งปี</div>
            <div className="stat-value">{money(netProfit)}</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              หลังหักเงินเดือน
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <IconUsers />
          </div>
          <div>
            <div className="stat-label">ลูกค้าใหม่ทั้งปี</div>
            <div className="stat-value">{newCustomerIds.length} ราย</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              ลูกค้าทั้งหมด {customerOrder.length} ราย
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
                  ยอดรับซื้อรายเดือนตลอดปี
                </div>
                <div className="card-sub">หน่วยเป็นพันบาท</div>
              </div>
            </div>
            <div className="bar-chart">
              {MONTHS.map((m) => (
                <div className="bar-col" key={m.m}>
                  <div className="bar-val">{m.v}</div>
                  <div className={`bar${m.peak ? ' peak' : ''}`} style={{ height: `${m.pct}%`, background: m.future ? 'var(--border)' : undefined }}></div>
                  <div className="bar-lbl">{m.m}</div>
                </div>
              ))}
            </div>

            <div className="quarter-grid">
              <div className="quarter-card">
                <div className="q">ไตรมาส 1</div>
                <div className="v">฿445,000</div>
              </div>
              <div className="quarter-card">
                <div className="q">ไตรมาส 2 (บางส่วน)</div>
                <div className="v">฿355,000</div>
              </div>
              <div className="quarter-card">
                <div className="q">ไตรมาส 3</div>
                <div className="v">—</div>
                <div className="c" style={{ color: 'var(--ink-300)' }}>
                  ยังไม่ถึง
                </div>
              </div>
              <div className="quarter-card">
                <div className="q">ไตรมาส 4</div>
                <div className="v">—</div>
                <div className="c" style={{ color: 'var(--ink-300)' }}>
                  ยังไม่ถึง
                </div>
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <IconCategory />
                  สัดส่วนยอดรับซื้อแยกตามหมวดหมู่ทั้งปี
                </div>
              </div>
            </div>
            {breakdown.length === 0 ? (
              <div className="empty-hint">ยังไม่มีข้อมูลใบเสร็จ</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '34%' }}>หมวดหมู่</th>
                    <th style={{ width: '22%' }}>น้ำหนัก</th>
                    <th style={{ width: '22%' }}>ยอดเงิน</th>
                    <th style={{ width: '22%' }}>สัดส่วน</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((b) => (
                    <tr key={b.name}>
                      <td>
                        <div className="row-cell">
                          {b.Icon && (
                            <div className="row-icon" style={{ background: b.bg, color: b.fg }}>
                              <b.Icon />
                            </div>
                          )}
                          <div className="row-name">{b.name}</div>
                        </div>
                      </td>
                      <td className="num-cell">{b.weight.toLocaleString('th-TH')} กก.</td>
                      <td className="num-cell">{money(b.amt)}</td>
                      <td className="num-cell">{b.pct}%</td>
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
              <IconClockHistory />
              เดือนยอดสูงสุดปีนี้
            </div>
            <div className="mini-stat-row">
              <div>
                <div className="name">พฤษภาคม {CURRENT_YEAR_BE}</div>
                <div className="sub">เดือนล่าสุดในข้อมูลอ้างอิง</div>
              </div>
              <span className="n">฿184,000</span>
            </div>
            <div className="mini-stat-row">
              <div>
                <div className="name">เมษายน {CURRENT_YEAR_BE}</div>
              </div>
              <span className="n">฿171,000</span>
            </div>
            <div className="mini-stat-row">
              <div>
                <div className="name">มีนาคม {CURRENT_YEAR_BE}</div>
              </div>
              <span className="n">฿162,000</span>
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconUsers />
              ลูกค้ายอดสูงสุด
            </div>
            {topCustomers.length === 0 && <div className="empty-hint">ยังไม่มีข้อมูล</div>}
            {topCustomers.map(([name, c]) => (
              <div className="mini-stat-row" key={name}>
                <div>
                  <div className="name">{name}</div>
                  <div className="sub">{c.count} ครั้ง</div>
                </div>
                <span className="n">{money(c.amt)}</span>
              </div>
            ))}
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={() => window.print()}>
            <IconPrint />
            พิมพ์รายงานประจำปี
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
            <div className="a4-doc-title">รายงานประจำปี · ปี {CURRENT_YEAR_BE}</div>
          </div>
          <hr className="a4-doc-divider" />

          <div className="a4-doc-meta-grid">
            <div className="a4-doc-meta-row">
              <span>ยอดรับซื้อรวมปีนี้</span>
              <b>{money(ytdRevenue)}</b>
            </div>
            <div className="a4-doc-meta-row">
              <span>น้ำหนักรวมทั้งปี</span>
              <b>{ytdWeight.toLocaleString('th-TH')} กก.</b>
            </div>
            <div className="a4-doc-meta-row">
              <span>กำไรสุทธิทั้งปี</span>
              <b>{money(netProfit)}</b>
            </div>
            <div className="a4-doc-meta-row">
              <span>ลูกค้าใหม่ทั้งปี</span>
              <b>{newCustomerIds.length} ราย (ทั้งหมด {customerOrder.length} ราย)</b>
            </div>
          </div>

          {breakdown.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>หมวดหมู่</th>
                  <th className="num">น้ำหนัก</th>
                  <th className="num">ยอดเงิน</th>
                  <th className="num">สัดส่วน</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((b) => (
                  <tr key={b.name}>
                    <td>{b.name}</td>
                    <td className="num">{b.weight.toLocaleString('th-TH')} กก.</td>
                    <td className="num">{money(b.amt)}</td>
                    <td className="num">{b.pct}%</td>
                  </tr>
                ))}
                <tr className="a4-doc-total-row">
                  <td>รวมทั้งสิ้น</td>
                  <td className="num">{breakdown.reduce((s, b) => s + b.weight, 0).toLocaleString('th-TH')} กก.</td>
                  <td className="num">{money(breakdown.reduce((s, b) => s + b.amt, 0))}</td>
                  <td className="num">100%</td>
                </tr>
              </tbody>
            </table>
          )}

          <div className="a4-doc-summary">
            {topCustomers.length === 0 && (
              <div className="a4-doc-sum-row">
                <span>ยังไม่มีข้อมูลลูกค้า</span>
                <b>-</b>
              </div>
            )}
            {topCustomers.map(([name, c]) => (
              <div className="a4-doc-sum-row" key={name}>
                <span>{name} ({c.count} ครั้ง)</span>
                <b>{money(c.amt)}</b>
              </div>
            ))}
            <div className="a4-doc-grand">
              <span>กำไรสุทธิทั้งปี</span>
              <span>{money(netProfit)}</span>
            </div>
          </div>

          <div className="a4-doc-foot">พิมพ์เมื่อ {nowStr()} · ตัวเลขจากระบบ ณ เวลาที่พิมพ์</div>
        </div>
      </div>
    </>
  );
}
