import { useMemo } from 'react';
import { IconCalendarBars, IconDownload, IconPrint, IconCategory, IconClockHistory, IconUsers } from '../icons.jsx';
import { exportCsv } from '../lib/csvExport.js';
import { useReceipts } from '../context/ReceiptsContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useCustomers } from '../context/CustomersContext.jsx';
import { usePayroll } from '../context/PayrollContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import './AnnualReport.css';

const MONTH_LABELS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MONTH_LABELS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function parseMoney(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}

function parseWeightKg(w) {
  return parseFloat(String(w).replace(/[^\d.]/g, '')) || 0;
}

// `it.w` is a display string ("5.00 กก. × ฿10.00", or with a row deduction shown, "5.00 −
// 1.00 = 4.00 กก. × ฿10.00") — never a bare number, so parseWeightKg's blind digit-stripping
// concatenates the weight and price into garbage (e.g. "5.0010.00" parses as 5.001). Prefer
// the clean `netWeight` stored alongside it on receipts created after this fix; fall back to
// pulling it back out of the display string, same as Receipts.jsx's parseItemNetWeight.
function parseItemNetWeight(it) {
  if (typeof it.netWeight === 'number') return it.netWeight;
  const w = it.w || '';
  const afterEquals = w.includes('=') ? w.split('=')[1] : w;
  const match = afterEquals.match(/([\d,]+\.?\d*)\s*กก\./);
  return match ? parseFloat(match[1].replace(/,/g, '')) || 0 : 0;
}

// A receipt's item totals (it.t) only ever have that item's own row-level deduction
// subtracted — the receipt's separate "หักน้ำหนักรวม" blanket deduction is subtracted once
// from the whole receipt (receipts[id].total), never allocated back onto items. Summing raw
// it.t across a receipt's items overstates revenue by exactly that blanket deduction whenever
// one was used. Scale each item down so a receipt's items sum to its own correct total.
function receiptItemScale(r) {
  const itemsSum = (r.items || []).reduce((s, it) => s + parseMoney(it.t), 0);
  return itemsSum > 0 ? parseMoney(r.total) / itemsSum : 1;
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
  const { order: customerOrder, customers } = useCustomers();
  const { payHistory } = usePayroll();
  const { settings } = useSettings();
  const activeReceipts = receiptOrder.filter((id) => receipts[id].status !== 'void');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth();

  // Every receipt now carries a real date, so the year-to-date figures and monthly chart
  // are computed directly from actual data instead of a "historical demo months + real
  // current month" baseline — a real shop's first year starts with every month at zero.
  const yearActiveReceipts = useMemo(
    () =>
      activeReceipts.filter((id) => {
        const [y] = (receipts[id].date || '').split('-').map(Number);
        return y === currentYear;
      }),
    [activeReceipts, receipts, currentYear]
  );

  const monthlyBreakdown = useMemo(() => {
    const months = Array.from({ length: 12 }, () => ({ amt: 0, weight: 0, count: 0 }));
    for (const id of yearActiveReceipts) {
      const [, m] = receipts[id].date.split('-').map(Number);
      months[m - 1].amt += parseMoney(receipts[id].total);
      months[m - 1].weight += parseWeightKg(receipts[id].weight);
      months[m - 1].count += 1;
    }
    return months;
  }, [yearActiveReceipts, receipts]);

  const ytdRevenue = monthlyBreakdown.reduce((s, m) => s + m.amt, 0);
  const ytdWeight = monthlyBreakdown.reduce((s, m) => s + m.weight, 0);
  const ytdReceiptCount = monthlyBreakdown.reduce((s, m) => s + m.count, 0);

  const MONTHS = useMemo(() => {
    const maxAmt = Math.max(...monthlyBreakdown.map((m) => m.amt), 1);
    return monthlyBreakdown.map((m, i) => {
      const isFuture = i > currentMonthIndex;
      return {
        m: MONTH_LABELS_SHORT[i],
        v: Math.round(m.amt / 1000),
        pct: isFuture ? 6 : Math.max(Math.round((m.amt / maxAmt) * 100), 6),
        peak: !isFuture && m.amt > 0 && m.amt === maxAmt,
        future: isFuture,
      };
    });
  }, [monthlyBreakdown, currentMonthIndex]);

  const quarters = useMemo(() => {
    return [0, 1, 2, 3].map((q) => {
      const startMonth = q * 3;
      const monthsInQ = monthlyBreakdown.slice(startMonth, startMonth + 3);
      const isFuture = startMonth > currentMonthIndex;
      return { total: monthsInQ.reduce((s, m) => s + m.amt, 0), partial: !isFuture && startMonth + 2 > currentMonthIndex, future: isFuture };
    });
  }, [monthlyBreakdown, currentMonthIndex]);

  const topMonths = useMemo(() => {
    return monthlyBreakdown
      .map((m, i) => ({ ...m, i }))
      .filter((m) => m.i <= currentMonthIndex && m.amt > 0)
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 3);
  }, [monthlyBreakdown, currentMonthIndex]);

  // Real payroll payments only, scoped to this year — payHistory persists indefinitely, so
  // summing it unfiltered would silently pull in wages paid in a prior year too once any
  // exist, understating "กำไรสุทธิทั้งปี". Mirrors PayrollReport.jsx's yearKeyOf bucketing.
  const wagesPaid = payHistory
    .filter((p) => new Date(p.paidAt).getFullYear() === currentYear)
    .reduce((s, p) => s + (p.net || 0), 0);
  const netProfit = Math.max(ytdRevenue - wagesPaid, 0);
  // "ลูกค้าใหม่ทั้งปี" means new this calendar year, not "ever added since install" — scope by
  // actual createdAt instead of just excluding the seed customers.
  const newCustomerIds = customerOrder.filter((id) => {
    const createdAt = customers[id]?.createdAt;
    return createdAt && new Date(createdAt).getFullYear() === currentYear;
  });

  const breakdown = useMemo(() => {
    const byCat = {};
    for (const id of yearActiveReceipts) {
      const r = receipts[id];
      const scale = receiptItemScale(r);
      for (const it of r.items || []) {
        const product = Object.values(products).find((p) => p.name === it.n);
        const cat = product?.cat || 'อื่นๆ';
        if (!byCat[cat]) byCat[cat] = { weight: 0, amt: 0, Icon: product?.Icon, bg: product?.bg || 'var(--bg)', fg: product?.fg || 'var(--ink-500)' };
        byCat[cat].weight += parseItemNetWeight(it);
        byCat[cat].amt += parseMoney(it.t) * scale;
      }
    }
    const total = Object.values(byCat).reduce((s, c) => s + c.amt, 0) || 1;
    return Object.entries(byCat)
      .map(([name, c]) => ({ name, ...c, pct: Math.round((c.amt / total) * 100) }))
      .sort((a, b) => b.amt - a.amt);
  }, [yearActiveReceipts, receipts, products]);

  const topCustomers = useMemo(() => {
    const byCust = {};
    for (const id of yearActiveReceipts) {
      const r = receipts[id];
      if (!byCust[r.cust]) byCust[r.cust] = { amt: 0, count: 0 };
      byCust[r.cust].amt += parseMoney(r.total);
      byCust[r.cust].count += 1;
    }
    return Object.entries(byCust).sort((a, b) => b[1].amt - a[1].amt).slice(0, 3);
  }, [yearActiveReceipts, receipts]);

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
              {quarters.map((q, i) => (
                <div className="quarter-card" key={i}>
                  <div className="q">
                    ไตรมาส {i + 1}
                    {q.partial ? ' (บางส่วน)' : ''}
                  </div>
                  <div className="v">{q.future ? '—' : money(q.total)}</div>
                  {q.future && (
                    <div className="c" style={{ color: 'var(--ink-300)' }}>
                      ยังไม่ถึง
                    </div>
                  )}
                </div>
              ))}
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
            {topMonths.length === 0 && <div className="empty-hint">ยังไม่มีข้อมูล</div>}
            {topMonths.map((m) => (
              <div className="mini-stat-row" key={m.i}>
                <div>
                  <div className="name">
                    {MONTH_LABELS_FULL[m.i]} {CURRENT_YEAR_BE}
                  </div>
                </div>
                <span className="n">{money(m.amt)}</span>
              </div>
            ))}
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
