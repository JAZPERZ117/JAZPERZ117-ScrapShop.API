import { useMemo, useState } from 'react';
import { IconBarChart, IconDownload, IconPrint, IconCategory, IconCash, IconClockHistory } from '../icons.jsx';
import { exportCsv } from '../lib/csvExport.js';
import { useReceipts } from '../context/ReceiptsContext.jsx';
import { useCustomers } from '../context/CustomersContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { usePayroll } from '../context/PayrollContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useDeliveries } from '../context/DeliveriesContext.jsx';
import { useExpenses } from '../context/ExpensesContext.jsx';
import { sumSales, sumExpenses, signedMoney } from '../lib/finance.js';
import './DailySummary.css';

function parseMoney(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}

function parseWeightKg(w) {
  return parseFloat(String(w).replace(/[^\d.]/g, '')) || 0;
}

// `it.w` is a display string for the printed receipt ("5.00 กก. × ฿10.00", or with a
// per-row deduction shown, "5.00 − 1.00 = 4.00 กก. × ฿10.00") — never a bare number, so
// parseWeightKg's blind digit-stripping concatenates the weight and price into garbage
// (e.g. "5.0010.00" parses as 5.001). Prefer the clean `netWeight` number stored alongside
// it on receipts created after this fix; fall back to pulling it back out of the display
// string the same way Receipts.jsx's parseItemNetWeight does, for older receipts.
function parseItemNetWeight(it) {
  if (typeof it.netWeight === 'number') return it.netWeight;
  const w = it.w || '';
  const afterEquals = w.includes('=') ? w.split('=')[1] : w;
  const match = afterEquals.match(/([\d,]+\.?\d*)\s*กก\./);
  return match ? parseFloat(match[1].replace(/,/g, '')) || 0 : 0;
}

// A receipt's item totals (`it.t`) only ever have that item's own row-level deduction
// subtracted — the receipt's separate "หักน้ำหนักรวม" blanket deduction is subtracted once
// from the whole receipt (see receipts[id].total), never allocated back onto individual
// items. Summing raw it.t across a receipt's items therefore overstates revenue by exactly
// that blanket deduction whenever one was used. Scale each item's amount down so a receipt's
// items sum to its own correct, already-net total, before aggregating across receipts.
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

function receiptHour(time) {
  const match = String(time).match(/^(\d{1,2}):/);
  return match ? parseInt(match[1], 10) : null;
}

// This page is specifically "today's" summary (per its title and subtitle), so every
// figure on it must be scoped to today's date — matching the date filtering Receipts.jsx
// already does with its own dateFilter, not the all-time totals other report pages show.
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Local-date key (not toISOString, which shifts to UTC) for comparing a full timestamp
// (customer createdAt, payroll paidAt) against the selected YYYY-MM-DD day.
function localDateKey(isoDateTime) {
  if (!isoDateTime) return '';
  const d = new Date(isoDateTime);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function thaiLongDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d));
}

export default function DailySummary() {
  const { receipts, order: receiptOrder } = useReceipts();
  const { customers, order: customerOrder } = useCustomers();
  const { products } = useProducts();
  const { payHistory } = usePayroll();
  const { settings } = useSettings();
  const { deliveries, order: deliveryOrder } = useDeliveries();
  const { expenses, order: expenseOrder } = useExpenses();
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const dateLabel = thaiLongDate(selectedDate);

  const activeReceipts = receiptOrder.filter((id) => receipts[id].status !== 'void' && receipts[id].date === selectedDate);
  const newCustomerIds = customerOrder.filter((id) => localDateKey(customers[id].createdAt) === selectedDate);

  const totalToday = activeReceipts.reduce((sum, id) => sum + parseMoney(receipts[id].total), 0);
  const totalWeightToday = activeReceipts.reduce((sum, id) => sum + parseWeightKg(receipts[id].weight), 0);
  const salesToday = sumSales(deliveries, deliveryOrder, (date) => date === selectedDate);
  const wagesPaidToday = payHistory.filter((p) => localDateKey(p.paidAt) === selectedDate).reduce((sum, p) => sum + (p.net || 0), 0);
  const expensesToday = sumExpenses(expenses, expenseOrder, (date) => date === selectedDate);
  const grossProfitToday = salesToday - totalToday - wagesPaidToday - expensesToday;

  // Both of these are money going OUT of the drawer, so the day's cash outflow is their sum —
  // it used to subtract one from the other, which doesn't correspond to any real cash figure.
  const cashFromPurchases = activeReceipts
    .filter((id) => receipts[id].method === 'เงินสด')
    .reduce((sum, id) => sum + parseMoney(receipts[id].total), 0);
  const cashPaidToStaff = payHistory
    .filter((p) => p.payMethod === 'cash' && localDateKey(p.paidAt) === selectedDate)
    .reduce((sum, p) => sum + (p.net || 0), 0);
  const cashExpensesToday = sumExpenses(expenses, expenseOrder, (date) => date === selectedDate, true);
  const cashOut = cashFromPurchases + cashPaidToStaff + cashExpensesToday;
  // Buyers paying for shipments in cash are the drawer's cash IN (Deliveries.jsx "บันทึกรับเงิน").
  const cashFromBuyers = deliveryOrder
    .filter((id) => deliveries[id].paidDate === selectedDate && deliveries[id].paidMethod === 'cash')
    .reduce((sum, id) => sum + (deliveries[id].paidAmount || 0), 0);
  const netCash = cashFromBuyers - cashOut;

  // Hour-of-day buckets computed from each receipt's real recorded time.
  const hourBuckets = useMemo(() => {
    const buckets = {};
    for (const id of activeReceipts) {
      const h = receiptHour(receipts[id].time);
      if (h === null) continue;
      buckets[h] = (buckets[h] || 0) + parseMoney(receipts[id].total);
    }
    const hours = Object.keys(buckets).map(Number).sort((a, b) => a - b);
    const maxVal = Math.max(...hours.map((h) => buckets[h]), 1);
    return hours.map((h) => ({ h: `${h}น.`, v: Math.round((buckets[h] / maxVal) * 100), peak: buckets[h] === maxVal, amt: buckets[h] }));
  }, [activeReceipts, receipts]);

  const categoryRows = useMemo(() => {
    const byCat = {};
    for (const id of activeReceipts) {
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
  }, [activeReceipts, receipts, products]);

  const topProducts = useMemo(() => {
    const byName = {};
    for (const id of activeReceipts) {
      const r = receipts[id];
      const scale = receiptItemScale(r);
      for (const it of r.items || []) {
        byName[it.n] = (byName[it.n] || 0) + parseMoney(it.t) * scale;
      }
    }
    return Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [activeReceipts, receipts]);

  function handleExport() {
    exportCsv(
      'daily-summary.csv',
      ['หมวดหมู่', 'น้ำหนัก (กก.)', 'ยอดเงิน', 'สัดส่วน'],
      categoryRows.map((c) => [c.name, c.weight.toFixed(2), c.amt.toFixed(2), `${c.pct}%`])
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            รายงาน <span>›</span> <b>สรุปยอดประจำวัน</b>
          </div>
          <h1 className="page-title">สรุปยอดประจำวัน</h1>
          <div className="page-sub">ภาพรวมการรับซื้อ กำไร และเงินสดประจำวันที่เลือก</div>
        </div>
        <div className="head-actions">
          <label className="date-select" style={{ cursor: 'pointer' }}>
            <IconClockHistory />
            <input
              type="date"
              value={selectedDate}
              max={todayISO()}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              style={{ border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', padding: 0, cursor: 'pointer' }}
            />
          </label>
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
            <IconBarChart />
          </div>
          <div>
            <div className="stat-label">ยอดรับซื้อวันนี้</div>
            <div className="stat-value">{money(totalToday)}</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              {activeReceipts.length} ใบเสร็จ
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconBarChart />
          </div>
          <div>
            <div className="stat-label">น้ำหนักรวม</div>
            <div className="stat-value">{totalWeightToday.toLocaleString('th-TH')} กก.</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              {activeReceipts.length} ใบเสร็จ
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <IconBarChart />
          </div>
          <div>
            <div className="stat-label">ลูกค้าใหม่</div>
            <div className="stat-value">{newCustomerIds.length} ราย</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              ลูกค้าทั้งหมด {customerOrder.length} ราย
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--teal-bg, #E4F6F4)', color: 'var(--teal, #0E8E82)' }}>
            <IconBarChart />
          </div>
          <div>
            <div className="stat-label">กำไรวันนี้</div>
            <div className="stat-value" style={{ color: grossProfitToday < 0 ? 'var(--rose)' : undefined }}>{signedMoney(grossProfitToday)}</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              ขาย {money(salesToday)} − รับซื้อ − ค่าแรง − ค่าใช้จ่าย
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
                  <IconBarChart />
                  ยอดรับซื้อรายชั่วโมง
                </div>
                <div className="card-sub">การกระจายตัวของยอดรับซื้อตามเวลาในใบเสร็จ (บาท)</div>
              </div>
            </div>
            {hourBuckets.length === 0 ? (
              <div className="empty-hint">ยังไม่มีข้อมูลใบเสร็จ</div>
            ) : (
              <div className="bar-chart">
                {hourBuckets.map((h) => (
                  <div className="bar-col" key={h.h}>
                    <div className={`bar${h.peak ? ' peak' : ''}`} style={{ height: `${h.v}%` }}></div>
                    <div className="bar-lbl">{h.h}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <IconCategory />
                  ยอดรับซื้อแยกตามหมวดหมู่
                </div>
                <div className="card-sub">สัดส่วนยอดเงินของแต่ละหมวดหมู่วันนี้</div>
              </div>
            </div>
            {categoryRows.length === 0 ? (
              <div className="empty-hint">ยังไม่มีข้อมูลใบเสร็จ</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '34%' }}>หมวดหมู่</th>
                    <th style={{ width: '18%' }}>น้ำหนัก</th>
                    <th style={{ width: '18%' }}>ยอดเงิน</th>
                    <th style={{ width: '30%' }}>สัดส่วน</th>
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
                      <td>
                        <div className="bar-wrap">
                          <div className="bar-track">
                            <div className="bar-fill" style={{ width: `${c.pct}%` }}></div>
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{c.pct}%</span>
                        </div>
                      </td>
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
              <IconCash />
              กระทบยอดเงินสด
            </div>
            <div className="sum-row">
              <span className="label">รับเงินสดจากผู้รับซื้อ</span>
              <span className="val">+{money(cashFromBuyers)}</span>
            </div>
            <div className="sum-row">
              <span className="label">รับซื้อของด้วยเงินสด</span>
              <span className="val minus">−{money(cashFromPurchases)}</span>
            </div>
            <div className="sum-row">
              <span className="label">จ่ายเงินเดือนด้วยเงินสด</span>
              <span className="val minus">−{money(cashPaidToStaff)}</span>
            </div>
            <div className="sum-row">
              <span className="label">ค่าใช้จ่ายร้านด้วยเงินสด</span>
              <span className="val minus">−{money(cashExpensesToday)}</span>
            </div>
            <div className="grand-total">
              <span className="label">เงินสดสุทธิวันนี้</span>
              <span className="val" style={{ color: netCash < 0 ? 'var(--rose)' : undefined }}>{signedMoney(netCash)}</span>
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconBarChart />
              สินค้ายอดนิยมวันนี้
            </div>
            {topProducts.length === 0 && <div className="empty-hint">ยังไม่มีข้อมูล</div>}
            {topProducts.map(([name, amt]) => (
              <div className="mini-stat-row" key={name}>
                <span>{name}</span>
                <span className="n">{money(amt)}</span>
              </div>
            ))}
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={() => window.print()}>
            <IconPrint />
            พิมพ์สรุปยอดวันนี้
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
            <div className="a4-doc-title">สรุปยอดประจำวัน · {dateLabel}</div>
          </div>
          <hr className="a4-doc-divider" />

          <div className="a4-doc-meta-grid">
            <div className="a4-doc-meta-row">
              <span>ยอดรับซื้อวันนี้</span>
              <b>{money(totalToday)}</b>
            </div>
            <div className="a4-doc-meta-row">
              <span>น้ำหนักรวม</span>
              <b>{totalWeightToday.toLocaleString('th-TH')} กก.</b>
            </div>
            <div className="a4-doc-meta-row">
              <span>จำนวนใบเสร็จ</span>
              <b>{activeReceipts.length} ใบ</b>
            </div>
            <div className="a4-doc-meta-row">
              <span>ลูกค้าใหม่วันนี้</span>
              <b>{newCustomerIds.length} ราย</b>
            </div>
          </div>

          {categoryRows.length > 0 && (
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
                {categoryRows.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className="num">{c.weight.toLocaleString('th-TH')} กก.</td>
                    <td className="num">{money(c.amt)}</td>
                    <td className="num">{c.pct}%</td>
                  </tr>
                ))}
                <tr className="a4-doc-total-row">
                  <td>รวมทั้งสิ้น</td>
                  <td className="num">{totalWeightToday.toLocaleString('th-TH')} กก.</td>
                  <td className="num">{money(totalToday)}</td>
                  <td className="num">100%</td>
                </tr>
              </tbody>
            </table>
          )}

          <div className="a4-doc-summary">
            <div className="a4-doc-sum-row">
              <span>ยอดขายให้ผู้รับซื้อ</span>
              <b>{money(salesToday)}</b>
            </div>
            <div className="a4-doc-sum-row">
              <span>กำไรวันนี้ (ขาย − รับซื้อ − ค่าแรง − ค่าใช้จ่าย)</span>
              <b>{signedMoney(grossProfitToday)}</b>
            </div>
            <div className="a4-doc-sum-row">
              <span>รับเงินสดจากผู้รับซื้อ</span>
              <b>+{money(cashFromBuyers)}</b>
            </div>
            <div className="a4-doc-sum-row minus">
              <span>รับซื้อของด้วยเงินสด</span>
              <b>−{money(cashFromPurchases)}</b>
            </div>
            <div className="a4-doc-sum-row minus">
              <span>จ่ายเงินเดือนด้วยเงินสด</span>
              <b>−{money(cashPaidToStaff)}</b>
            </div>
            <div className="a4-doc-sum-row minus">
              <span>ค่าใช้จ่ายร้านด้วยเงินสด</span>
              <b>−{money(cashExpensesToday)}</b>
            </div>
            <div className="a4-doc-grand">
              <span>เงินสดสุทธิวันนี้</span>
              <span>{signedMoney(netCash)}</span>
            </div>
          </div>

          <div className="a4-doc-foot">พิมพ์เมื่อ {nowStr()} · ตัวเลขจากระบบ ณ เวลาที่พิมพ์</div>
        </div>
      </div>
    </>
  );
}
