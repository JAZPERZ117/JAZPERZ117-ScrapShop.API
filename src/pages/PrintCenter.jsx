import { useState } from 'react';
import {
  IconPrint,
  IconRefresh,
  IconReceipt,
  IconPayroll,
  IconBarChart,
  IconCalendarBars,
  IconTag,
  IconIdCard,
  IconTax,
  IconVoucher,
  IconClockHistory,
  IconDownload,
} from '../icons.jsx';
import { usePersistentState } from '../lib/persist.js';
import { usePrinters } from '../context/PrintersContext.jsx';
import { useReceipts, INITIAL_ORDER as RECEIPTS_INITIAL_ORDER } from '../context/ReceiptsContext.jsx';
import { usePayroll } from '../context/PayrollContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useCategories } from '../context/CategoriesContext.jsx';
import { useCustomers } from '../context/CustomersContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import './PrintCenter.css';

const PAY_METHOD_LABELS = { cash: 'เงินสด', transfer: 'โอนเงิน', promptpay: 'พร้อมเพย์' };
const STANDARD_MONTH_DAYS = 26;
// Same baseline convention as the 512450 baht / 186 receipt figures used below (see
// TaxReport.jsx/AnnualReport.jsx/MonthlyReport.jsx, which this mirrors) — without this,
// "this month" weight came out as just the new receipts' raw weight with no baseline at all,
// next to a baseline'd baht figure, implying an impossible baht/kg rate on the printed page.
const CURRENT_MONTH_BASELINE_WEIGHT = 21955;

const NOW = new Date();
const TODAY_THAI_LONG = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'long', year: 'numeric' }).format(NOW);
const TODAY_THAI_SHORT = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' }).format(NOW);
const THIS_MONTH_THAI_LONG = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: 'long', year: 'numeric' }).format(NOW);
const THIS_MONTH_THAI_SHORT_TH = new Intl.DateTimeFormat('th-TH', { month: 'short' }).format(NOW);
const THIS_YEAR_BE = NOW.getFullYear() + 543;

// Jan-Apr are historical reference figures (this app has no real date-stamped receipt
// history to compute them from) — same documented limitation as the Tax Report page,
// whose numbers this mirrors so the two stay consistent.
const HISTORICAL_MONTHLY = [
  { m: `มกราคม ${THIS_YEAR_BE}`, amt: 402300, weightKg: 17240, receiptCount: 142 },
  { m: `กุมภาพันธ์ ${THIS_YEAR_BE}`, amt: 384100, weightKg: 16510, receiptCount: 138 },
  { m: `มีนาคม ${THIS_YEAR_BE}`, amt: 452800, weightKg: 19320, receiptCount: 151 },
  { m: `เมษายน ${THIS_YEAR_BE}`, amt: 396950, weightKg: 17020, receiptCount: 125 },
];

const TAX_BRACKETS = [
  { upTo: 150000, rate: 0 },
  { upTo: 300000, rate: 0.05 },
  { upTo: 500000, rate: 0.1 },
  { upTo: 750000, rate: 0.15 },
  { upTo: 1000000, rate: 0.2 },
  { upTo: 2000000, rate: 0.25 },
  { upTo: 5000000, rate: 0.3 },
  { upTo: Infinity, rate: 0.35 },
];

function calcProgressiveTax(netIncome) {
  let tax = 0;
  let lower = 0;
  for (const bracket of TAX_BRACKETS) {
    if (netIncome <= lower) break;
    tax += (Math.min(netIncome, bracket.upTo) - lower) * bracket.rate;
    lower = bracket.upTo;
  }
  return tax;
}

const FALLBACK_LOG = [
  { icon: 'receipt', title: 'ใบเสร็จ RC670515-012', sub: `โดยเจ้าของร้าน · วันนี้ 10:45 น. · เครื่องพิมพ์ใบเสร็จหน้าร้าน` },
  { icon: 'daily', title: `สรุปยอดประจำวัน · ${TODAY_THAI_SHORT}`, sub: 'โดยเจ้าของร้าน · วันนี้ 08:00 น. · เครื่องพิมพ์สำนักงาน A4' },
  { icon: 'payslip', title: 'สลิปเงินเดือน · นายประเสริฐ แสงทอง', sub: 'โดยเจ้าของร้าน · เมื่อวาน 16:20 น. · เครื่องพิมพ์สำนักงาน A4' },
];

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseMoney(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}
function parseWeight(w) {
  return parseFloat(String(w).replace(/[^\d.]/g, '')) || 0;
}
function formatThaiDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' });
}
function nowStr() {
  return new Date().toLocaleString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function nowTimeStr() {
  return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}
// "สรุปยอดประจำวัน" below is specifically today's summary (per its own title), so it must be
// scoped to today's date the same way DailySummary.jsx is — not the all-time totals the
// monthly/tax documents further down intentionally show.
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isToday(isoDateTime) {
  if (!isoDateTime) return false;
  const d = new Date(isoDateTime);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}
function dailyRate(base) {
  return (base || 0) / STANDARD_MONTH_DAYS;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Formats a print-log timestamp relative to today ("วันนี้ HH:MM น." / "เมื่อวาน HH:MM น." /
// a full date), so each document card's "พิมพ์ล่าสุด" reflects a real log entry instead of
// a frozen placeholder date.
function formatLastPrinted(ts) {
  if (!ts) return 'ยังไม่เคยพิมพ์';
  const d = new Date(ts);
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
  if (dayDiff === 0) return `วันนี้ ${time}`;
  if (dayDiff === 1) return `เมื่อวาน ${time}`;
  const dateStr = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  return `${dateStr} ${time}`;
}

const DOCS = {
  receipt: { name: 'ใบเสร็จรับเงิน', bg: 'var(--green-100)', fg: 'var(--green-700)', Icon: IconReceipt, desc: 'พิมพ์ใบเสร็จรับซื้อของเก่าตามเลขที่ใบเสร็จ' },
  payslip: { name: 'สลิปเงินเดือน', bg: 'var(--blue-bg)', fg: 'var(--blue)', Icon: IconPayroll, desc: 'พิมพ์สลิปเงินเดือนจากประวัติการจ่ายจริง' },
  daily: { name: 'สรุปยอดประจำวัน', bg: 'var(--amber-bg)', fg: 'var(--amber)', Icon: IconBarChart, desc: 'รายงานยอดรับซื้อ น้ำหนัก และเงินสดของวันนี้' },
  monthly: { name: 'รายงานประจำเดือน', bg: 'var(--teal-bg, #E4F6F4)', fg: 'var(--teal, #0E8E82)', Icon: IconCalendarBars, desc: 'สรุปยอดรับซื้อ-จ่ายเงินเดือนนี้' },
  pricetag: { name: 'ป้ายราคาสินค้า', bg: 'var(--plum-bg)', fg: 'var(--plum)', Icon: IconTag, desc: 'พิมพ์ป้ายราคารับซื้อล่าสุดติดหน้าร้าน' },
  idcard: { name: 'บัตรสมาชิกลูกค้า', bg: 'var(--rose-bg)', fg: 'var(--rose)', Icon: IconIdCard, desc: 'พิมพ์บัตรสมาชิกให้ลูกค้าที่มีอยู่ในระบบ' },
  tax: { name: 'เอกสารภาษี ภงด.90/94', bg: 'var(--bg)', fg: 'var(--ink-500)', Icon: IconTax, desc: 'พิมพ์แบบสรุปรายได้สำหรับยื่นภาษี' },
  voucher: { name: 'ใบสำคัญจ่าย', bg: 'var(--green-100)', fg: 'var(--green-700)', Icon: IconVoucher, desc: 'พิมพ์เอกสารยืนยันการจ่ายเงินจากประวัติจ่ายจริง' },
};

const ORDER = ['receipt', 'payslip', 'daily', 'monthly', 'pricetag', 'idcard', 'tax', 'voucher'];

export default function PrintCenter() {
  const [selectedId, setSelectedId] = useState('receipt');
  const { printers, order: printerOrder, toggleConnected } = usePrinters();
  const [printer, setPrinter] = useState(printerOrder[0]);
  const [banner, setBanner] = useState(null);
  const [printLog, setPrintLog] = usePersistentState('scrapshop_print_log', []);

  const { receipts, order: receiptOrder } = useReceipts();
  const { payHistory } = usePayroll();
  const { products, order: productOrder } = useProducts();
  const { categories, order: categoryOrder } = useCategories();
  const { customers, order: customerOrder } = useCustomers();
  const { settings } = useSettings();

  const [selectedReceiptId, setSelectedReceiptId] = useState(receiptOrder[0]);
  const [selectedPayIdx, setSelectedPayIdx] = useState(0);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerOrder[0]);
  const [taxForm, setTaxForm] = useState('90');

  const d = DOCS[selectedId];
  const receiptPrintCount = printLog.filter((l) => l.icon === 'receipt').length;
  const otherPrintCount = printLog.length - receiptPrintCount;
  const connectedPrinters = printerOrder.filter((id) => printers[id].connected);
  const offlinePrinters = printerOrder.filter((id) => !printers[id].connected);

  const pricetagList = productOrder
    .map((id) => products[id])
    .filter((p) => p.active && (!selectedCategoryId || p.cat === categories[selectedCategoryId]?.name));

  function docHasData(id) {
    switch (id) {
      case 'receipt':
        return receiptOrder.length > 0;
      case 'payslip':
      case 'voucher':
        return payHistory.length > 0;
      case 'idcard':
        return customerOrder.length > 0;
      case 'pricetag':
        return pricetagList.length > 0;
      default:
        return true;
    }
  }

  function logPrint(docId, printerKey) {
    const doc = DOCS[docId];
    // docId is already one of the DOCS keys, so it doubles as the log icon key —
    // every document type gets its own real icon instead of everything but three
    // types falling back to the receipt icon.
    setPrintLog((prev) => [{ icon: docId, title: doc.name, sub: `โดยเจ้าของร้าน · ${nowTimeStr()} · ${printers[printerKey].name}`, at: Date.now() }, ...prev].slice(0, 20));
  }

  function lastPrintedMeta(docId) {
    const entry = printLog.find((l) => l.title === DOCS[docId].name);
    return `พิมพ์ล่าสุด ${formatLastPrinted(entry?.at)}`;
  }

  function tryPrint(docId, { thenPrint }) {
    if (!docHasData(docId)) {
      setBanner({ type: 'error', text: `ไม่มีข้อมูลสำหรับพิมพ์ ${DOCS[docId].name} — กรุณาเลือกรายการที่มีอยู่จริงก่อน` });
      return false;
    }
    if (!printers[printer].connected) {
      setBanner({ type: 'error', text: `ส่งพิมพ์ไม่สำเร็จ: ${printers[printer].name} ออฟไลน์อยู่ กรุณาเชื่อมต่อก่อน` });
      return false;
    }
    logPrint(docId, printer);
    if (thenPrint) setTimeout(() => window.print(), 50);
    return true;
  }

  function handlePrint() {
    if (tryPrint(selectedId, { thenPrint: true })) {
      setBanner({ type: 'success', text: `ส่งพิมพ์ ${d.name} ไปยัง${printers[printer].name} แล้ว` });
    }
  }

  function handleDownloadPdf() {
    if (tryPrint(selectedId, { thenPrint: true })) {
      setBanner({ type: 'success', text: `เปิดหน้าต่างพิมพ์ ${d.name} แล้ว — เลือก "บันทึกเป็น PDF" เพื่อดาวน์โหลด` });
    }
  }

  function handleCheckPrinters() {
    if (offlinePrinters.length === 0) {
      setBanner({ type: 'success', text: `ตรวจสอบแล้ว: เครื่องพิมพ์ทั้ง ${printerOrder.length} เครื่องพร้อมใช้งาน (${printerOrder.map((id) => printers[id].name).join(', ')})` });
    } else {
      setBanner({
        type: 'error',
        text: `ตรวจสอบแล้ว: ${offlinePrinters.map((id) => printers[id].name).join(', ')} ไม่ได้เชื่อมต่อ — เชื่อมต่ออยู่ ${connectedPrinters.length}/${printerOrder.length} เครื่อง`,
      });
    }
  }

  function renderPicker() {
    switch (selectedId) {
      case 'receipt':
        return (
          <div className="field">
            <label>เลขที่ใบเสร็จ</label>
            {receiptOrder.length === 0 ? (
              <div className="empty-hint">ยังไม่มีใบเสร็จในระบบ</div>
            ) : (
              <select className="input-plain" value={selectedReceiptId} onChange={(e) => setSelectedReceiptId(e.target.value)}>
                {receiptOrder.map((id) => (
                  <option key={id} value={id}>
                    {receipts[id].no} · {receipts[id].cust}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      case 'payslip':
      case 'voucher':
        return (
          <div className="field">
            <label>ประวัติการจ่ายเงินเดือน</label>
            {payHistory.length === 0 ? (
              <div className="empty-hint">ยังไม่มีประวัติจ่ายเงินเดือน — จ่ายเงินเดือนอย่างน้อย 1 ครั้งก่อน</div>
            ) : (
              <select className="input-plain" value={selectedPayIdx} onChange={(e) => setSelectedPayIdx(Number(e.target.value))}>
                {payHistory.map((p, i) => (
                  <option key={i} value={i}>
                    {p.staffName} · {p.weekLabel} · {money(p.net)}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      case 'daily':
        return (
          <div className="field">
            <label>วันที่</label>
            <input className="input-plain" value={TODAY_THAI_LONG} disabled />
          </div>
        );
      case 'monthly':
        return (
          <div className="field">
            <label>เดือน</label>
            <input className="input-plain" value={THIS_MONTH_THAI_LONG} disabled />
          </div>
        );
      case 'pricetag':
        return (
          <div className="field">
            <label>หมวดหมู่สินค้า</label>
            <select className="input-plain" value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)}>
              <option value="">ทุกหมวดหมู่</option>
              {categoryOrder.map((id) => (
                <option key={id} value={id}>
                  {categories[id].name}
                </option>
              ))}
            </select>
          </div>
        );
      case 'idcard':
        return (
          <div className="field">
            <label>ลูกค้า</label>
            {customerOrder.length === 0 ? (
              <div className="empty-hint">ยังไม่มีลูกค้าในระบบ</div>
            ) : (
              <select className="input-plain" value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
                {customerOrder.map((id) => (
                  <option key={id} value={id}>
                    {customers[id].name}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      case 'tax':
        return (
          <>
            <div className="field">
              <label>ปีภาษี</label>
              <input className="input-plain" value={THIS_YEAR_BE} disabled />
            </div>
            <div className="field">
              <label>แบบภาษี</label>
              <select className="input-plain" value={taxForm} onChange={(e) => setTaxForm(e.target.value)}>
                <option value="90">ภงด.90 (ประจำปี)</option>
                <option value="94">ภงด.94 (ครึ่งปี)</option>
              </select>
            </div>
          </>
        );
      default:
        return null;
    }
  }

  function renderPaperTop(subtitle) {
    return (
      <div className="paper-top">
        <div className="paper-shop">{settings.shopName}</div>
        <div className="paper-addr">
          {subtitle || (
            <>
              {settings.address}
              <br />
              โทร. {settings.phone} &nbsp;|&nbsp; เลขผู้เสียภาษี {settings.taxId}
            </>
          )}
        </div>
      </div>
    );
  }

  function renderA4Top(title) {
    return (
      <div className="a4-doc-top">
        <div className="a4-doc-shop">{settings.shopName}</div>
        <div className="a4-doc-addr">
          {settings.address}
          <br />
          โทร. {settings.phone} &nbsp;|&nbsp; เลขผู้เสียภาษี {settings.taxId}
        </div>
        <div className="a4-doc-title">{title}</div>
      </div>
    );
  }

  function renderReceiptDoc() {
    const r = receipts[selectedReceiptId];
    if (!r) return null;
    return (
      <div className="paper">
        {renderPaperTop()}
        <hr className="paper-divider" />
        <div className="paper-meta">
          <span>เลขที่ใบเสร็จ</span>
          <b>{r.no}</b>
        </div>
        <div className="paper-meta">
          <span>วันที่</span>
          <b>{formatThaiDate(r.date)} · {r.time}</b>
        </div>
        <div className="paper-meta">
          <span>ลูกค้า</span>
          <b>{r.cust}</b>
        </div>
        <div className="paper-meta">
          <span>ผู้ออกใบเสร็จ</span>
          <b>เจ้าของร้าน</b>
        </div>
        <hr className="paper-divider" />
        <div className="paper-items">
          {r.items.map((it, i) => (
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
          <b>{r.weight}</b>
        </div>
        <div className="paper-meta">
          <span>หักน้ำหนัก/เหตุผล{r.deductionLabel ? ` (${r.deductionLabel})` : ''}</span>
          <b>−{(r.deductionWeight || 0).toFixed(2)} กก.</b>
        </div>
        <div className="paper-total-row">
          <span className="l">ยอดรวมสุทธิ</span>
          <span className="v">{r.total}</span>
        </div>
        <div className="paper-meta" style={{ marginTop: 8 }}>
          <span>วิธีจ่ายเงิน</span>
          <b>{r.method}</b>
        </div>
        {r.note && (
          <div className="paper-meta" style={{ marginTop: 8 }}>
            <span>หมายเหตุ</span>
            <b>{r.note}</b>
          </div>
        )}
        <div className="paper-barcode">
          {Array.from({ length: 18 }).map((_, i) => (
            <span key={i} style={{ height: 34, width: (i % 3) + 1 }}></span>
          ))}
        </div>
        <div className="paper-foot">
          {r.no}
          <br />
          {settings.receiptFooter}
        </div>
      </div>
    );
  }

  function renderPayslipDoc() {
    const p = payHistory[selectedPayIdx];
    if (!p) return null;
    const rate = dailyRate(p.base);
    return (
      <div className="paper">
        {renderPaperTop()}
        <hr className="paper-divider" />
        <div className="paper-meta">
          <span>เลขที่สลิป</span>
          <b>{p.no}</b>
        </div>
        <div className="paper-meta">
          <span>งวดจ่าย</span>
          <b>{p.weekLabel}</b>
        </div>
        <div className="paper-meta">
          <span>พนักงาน</span>
          <b>{p.staffName}</b>
        </div>
        <div className="paper-meta">
          <span>ตำแหน่ง</span>
          <b>{p.staffRole}</b>
        </div>
        <hr className="paper-divider" />
        <div className="paper-items">
          <div className="paper-item">
            <div className="pn">
              ค่าแรง
              <span className="pw">{money(rate)}/วัน × ทำงาน {p.days} จาก {p.maxDays} วัน (จ.-ส.)</span>
            </div>
            <div className="pt">{money(rate * p.days)}</div>
          </div>
          <div className="paper-item">
            <div className="pn">เบิกล่วงหน้า</div>
            <div className="pt">−{money(p.advance)}</div>
          </div>
          <div className="paper-item">
            <div className="pn">อื่นๆ{p.otherLabel ? ` (${p.otherLabel})` : ''}</div>
            <div className="pt">+{money(p.otherAmount)}</div>
          </div>
        </div>
        <div className="paper-total-row">
          <span className="l">ยอดรับสุทธิ</span>
          <span className="v">{money(p.net)}</span>
        </div>
        <div className="paper-meta" style={{ marginTop: 8 }}>
          <span>วิธีจ่ายเงิน</span>
          <b>{PAY_METHOD_LABELS[p.payMethod] || p.payMethod}</b>
        </div>
        <div className="paper-barcode">
          {Array.from({ length: 18 }).map((_, i) => (
            <span key={i} style={{ height: 34, width: (i % 3) + 1 }}></span>
          ))}
        </div>
        <div className="paper-foot">{p.no} · สลิปเงินเดือนนี้ออกโดยระบบอัตโนมัติ</div>
      </div>
    );
  }

  function renderVoucherDoc() {
    const p = payHistory[selectedPayIdx];
    if (!p) return null;
    return (
      <div className="paper">
        {renderPaperTop('ใบสำคัญจ่าย')}
        <hr className="paper-divider" />
        <div className="paper-meta">
          <span>ใบสำคัญจ่ายเลขที่</span>
          <b>{p.no}</b>
        </div>
        <div className="paper-meta">
          <span>งวดจ่าย</span>
          <b>{p.weekLabel}</b>
        </div>
        <div className="paper-meta">
          <span>จ่ายให้</span>
          <b>{p.staffName}</b>
        </div>
        <div className="paper-meta">
          <span>ตำแหน่ง</span>
          <b>{p.staffRole}</b>
        </div>
        <div className="paper-meta">
          <span>รายการ</span>
          <b>ค่าแรงประจำ{p.weekLabel}</b>
        </div>
        <hr className="paper-divider" />
        <div className="paper-total-row">
          <span className="l">จำนวนเงิน</span>
          <span className="v">{money(p.net)}</span>
        </div>
        <div className="paper-meta" style={{ marginTop: 8 }}>
          <span>วิธีจ่ายเงิน</span>
          <b>{PAY_METHOD_LABELS[p.payMethod] || p.payMethod}</b>
        </div>
        <div className="paper-meta" style={{ marginTop: 24 }}>
          <span>ลงชื่อผู้จ่ายเงิน</span>
          <b>. . . . . . . . . . . . . . .</b>
        </div>
        <div className="paper-meta" style={{ marginTop: 16 }}>
          <span>ลงชื่อผู้รับเงิน</span>
          <b>. . . . . . . . . . . . . . .</b>
        </div>
        <div className="paper-foot">{p.no} · เอกสารนี้เป็นหลักฐานการจ่ายเงินภายใน</div>
      </div>
    );
  }

  function renderDailyDoc() {
    const activeReceipts = receiptOrder.filter((id) => receipts[id].status !== 'void' && receipts[id].date === todayISO());
    const totalToday = activeReceipts.reduce((sum, id) => sum + parseMoney(receipts[id].total), 0);
    const totalWeightToday = activeReceipts.reduce((sum, id) => sum + parseWeight(receipts[id].weight), 0);
    const newCustomerIds = customerOrder.filter((id) => isToday(customers[id].createdAt));
    const cashFromPurchases = activeReceipts
      .filter((id) => receipts[id].method === 'เงินสด')
      .reduce((sum, id) => sum + parseMoney(receipts[id].total), 0);
    const cashPaidToStaff = payHistory
      .filter((p) => p.payMethod === 'cash' && isToday(p.paidAt))
      .reduce((sum, p) => sum + (p.net || 0), 0);
    const netCash = cashFromPurchases - cashPaidToStaff;
    return (
      <div className="a4-doc">
        {renderA4Top(`สรุปยอดประจำวัน · ${TODAY_THAI_LONG}`)}
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
        <div className="a4-doc-summary">
          <div className="a4-doc-sum-row">
            <span>รับซื้อด้วยเงินสด</span>
            <b>{money(cashFromPurchases)}</b>
          </div>
          <div className="a4-doc-sum-row minus">
            <span>จ่ายเงินเดือนด้วยเงินสด</span>
            <b>−{money(cashPaidToStaff)}</b>
          </div>
          <div className="a4-doc-sum-row">
            <span>เงินสดสุทธิวันนี้</span>
            <b>{money(netCash)}</b>
          </div>
        </div>
        <div className="a4-doc-foot">พิมพ์เมื่อ {nowStr()}</div>
      </div>
    );
  }

  function renderMonthlyDoc() {
    const newReceiptIds = receiptOrder.filter((id) => !RECEIPTS_INITIAL_ORDER.includes(id));
    const activeReceipts = receiptOrder.filter((id) => receipts[id].status !== 'void');
    const newActiveReceiptIds = newReceiptIds.filter((id) => receipts[id].status !== 'void');
    const monthTotal = 512450 + newActiveReceiptIds.reduce((s, id) => s + parseMoney(receipts[id].total), 0);
    const monthCount = 186 + newActiveReceiptIds.length;
    const monthWeight = CURRENT_MONTH_BASELINE_WEIGHT + newActiveReceiptIds.reduce((s, id) => s + parseWeight(receipts[id].weight), 0);
    const totalDeductionKg = activeReceipts.reduce((s, id) => s + (receipts[id].deductionWeight || 0), 0);
    const wagesPaid = payHistory.reduce((s, p) => s + (p.net || 0), 0);
    const netProfit = Math.max(monthTotal - wagesPaid, 0);
    return (
      <div className="a4-doc">
        {renderA4Top(`รายงานประจำเดือน · ${THIS_MONTH_THAI_LONG}`)}
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
            <span>จำนวนใบเสร็จ</span>
            <b>{monthCount} ใบ</b>
          </div>
          <div className="a4-doc-meta-row">
            <span>หักน้ำหนักไปแล้ว</span>
            <b>{totalDeductionKg.toFixed(2)} กก.</b>
          </div>
        </div>
        <div className="a4-doc-summary">
          <div className="a4-doc-sum-row">
            <span>ยอดรับซื้อรวม</span>
            <b>{money(monthTotal)}</b>
          </div>
          <div className="a4-doc-sum-row minus">
            <span>เงินเดือนที่จ่ายไปแล้ว</span>
            <b>−{money(wagesPaid)}</b>
          </div>
          <div className="a4-doc-sum-row">
            <span>กำไรสุทธิเดือนนี้</span>
            <b>{money(netProfit)}</b>
          </div>
        </div>
        <div className="a4-doc-foot">พิมพ์เมื่อ {nowStr()}</div>
      </div>
    );
  }

  function renderTaxDoc() {
    const newReceiptIds = receiptOrder.filter((id) => !RECEIPTS_INITIAL_ORDER.includes(id));
    const newActiveReceiptIds = newReceiptIds.filter((id) => receipts[id].status !== 'void');
    const currentMonthAmt = 512450 + newActiveReceiptIds.reduce((s, id) => s + parseMoney(receipts[id].total), 0);
    const currentMonthWeight = CURRENT_MONTH_BASELINE_WEIGHT + newActiveReceiptIds.reduce((s, id) => s + parseWeight(receipts[id].weight), 0);
    const currentMonthReceiptCount = 186 + newActiveReceiptIds.length;
    const monthly = [...HISTORICAL_MONTHLY, { m: THIS_MONTH_THAI_LONG, amt: currentMonthAmt, weightKg: currentMonthWeight, receiptCount: currentMonthReceiptCount }];
    const totalIncome = monthly.reduce((s, m) => s + m.amt, 0);
    const totalWeightKg = monthly.reduce((s, m) => s + m.weightKg, 0);
    const totalReceiptCount = monthly.reduce((s, m) => s + m.receiptCount, 0);
    const expenseDeduct = totalIncome * 0.6;
    const isHalfYear = taxForm === '94';
    const personalDeduct = isHalfYear ? 30000 : 60000;
    const periodLabel = isHalfYear ? `1 ม.ค. – 30 มิ.ย. ${THIS_YEAR_BE} (ครึ่งปีแรก)` : `1 ม.ค. – 31 ธ.ค. ${THIS_YEAR_BE} (เต็มปี)`;
    const netIncome = Math.max(totalIncome - expenseDeduct - personalDeduct, 0);
    const estimatedTax = calcProgressiveTax(netIncome);
    return (
      <div className="a4-doc">
        {renderA4Top(`แบบสรุปรายได้สำหรับยื่นภาษี ภงด.${taxForm} · ปีภาษี ${THIS_YEAR_BE}`)}
        <hr className="a4-doc-divider" />
        <div className="a4-doc-meta-grid">
          <div className="a4-doc-meta-row">
            <span>ชื่อผู้ประกอบการ</span>
            <b>{settings.shopName}</b>
          </div>
          <div className="a4-doc-meta-row">
            <span>เลขประจำตัวผู้เสียภาษี</span>
            <b>{settings.taxId}</b>
          </div>
          <div className="a4-doc-meta-row">
            <span>ประเภทเงินได้</span>
            <b>มาตรา 40(8) รับซื้อของเก่า</b>
          </div>
          <div className="a4-doc-meta-row">
            <span>รอบระยะเวลาบัญชี</span>
            <b>{periodLabel}</b>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>เดือน</th>
              <th className="num">ยอดรับซื้อ</th>
              <th className="num">น้ำหนักรวม</th>
              <th className="num">ใบเสร็จ</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.m}>
                <td>{m.m}</td>
                <td className="num">{money(m.amt)}</td>
                <td className="num">{m.weightKg.toLocaleString('th-TH')} กก.</td>
                <td className="num">{m.receiptCount} ใบ</td>
              </tr>
            ))}
            <tr className="a4-doc-total-row">
              <td>รวมทั้งสิ้น (ม.ค.–{THIS_MONTH_THAI_SHORT_TH})</td>
              <td className="num">{money(totalIncome)}</td>
              <td className="num">{totalWeightKg.toLocaleString('th-TH')} กก.</td>
              <td className="num">{totalReceiptCount} ใบ</td>
            </tr>
          </tbody>
        </table>
        <div className="a4-doc-summary">
          <div className="a4-doc-sum-row">
            <span>รายได้รวม</span>
            <b>{money(totalIncome)}</b>
          </div>
          <div className="a4-doc-sum-row minus">
            <span>หักค่าใช้จ่ายเหมา 60%</span>
            <b>−{money(expenseDeduct)}</b>
          </div>
          <div className="a4-doc-sum-row minus">
            <span>หักลดหย่อนส่วนตัว</span>
            <b>−{money(personalDeduct)}</b>
          </div>
          <div className="a4-doc-sum-row">
            <span>เงินได้สุทธิ</span>
            <b>{money(netIncome)}</b>
          </div>
          <div className="a4-doc-grand">
            <span>ภาษีโดยประมาณ</span>
            <b>{money(estimatedTax)}</b>
          </div>
        </div>
        <div className="a4-doc-foot">ตัวเลขนี้เป็นการประมาณการเบื้องต้นจากข้อมูลในระบบเท่านั้น กรุณาตรวจสอบกับผู้ทำบัญชีหรือสรรพากรก่อนยื่นแบบจริง</div>
      </div>
    );
  }

  function renderPricetagDoc() {
    if (pricetagList.length === 0) return null;
    const catLabel = selectedCategoryId ? ` · หมวด${categories[selectedCategoryId]?.name}` : '';
    return (
      <div className="a4-doc">
        {renderA4Top(`ป้ายราคารับซื้อของเก่า${catLabel}`)}
        <hr className="a4-doc-divider" />
        <table>
          <thead>
            <tr>
              <th>รายการ</th>
              <th>หมวดหมู่</th>
              <th className="num">ราคารับซื้อ</th>
            </tr>
          </thead>
          <tbody>
            {pricetagList.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>{p.cat}</td>
                <td className="num">{money(p.price)} / กก.</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="a4-doc-foot">ราคา ณ วันที่ {TODAY_THAI_LONG} · ราคาอาจเปลี่ยนแปลงตามสภาวะตลาด</div>
      </div>
    );
  }

  function renderIdcardDoc() {
    const c = customers[selectedCustomerId];
    if (!c) return null;
    return (
      <div className="paper">
        {renderPaperTop('บัตรสมาชิกลูกค้า')}
        <hr className="paper-divider" />
        <div className="paper-meta">
          <span>ชื่อ</span>
          <b>{c.name}</b>
        </div>
        <div className="paper-meta">
          <span>เบอร์โทร</span>
          <b>{c.phone}</b>
        </div>
        <div className="paper-meta">
          <span>เลขบัตรประชาชน</span>
          <b>{c.idNumber || '—'}</b>
        </div>
        <div className="paper-meta">
          <span>ประเภทสมาชิก</span>
          <b>{c.tag === 'regular' ? 'ลูกค้าประจำ' : 'ลูกค้าทั่วไป'}</b>
        </div>
        <div className="paper-meta">
          <span>สมาชิกตั้งแต่</span>
          <b>{c.since}</b>
        </div>
        <hr className="paper-divider" />
        <div className="paper-foot">
          {settings.shopName} · {settings.phone}
          <br />
          กรุณาแสดงบัตรนี้ทุกครั้งที่ขายของ
        </div>
      </div>
    );
  }

  const DOC_RENDERERS = {
    receipt: renderReceiptDoc,
    payslip: renderPayslipDoc,
    voucher: renderVoucherDoc,
    daily: renderDailyDoc,
    monthly: renderMonthlyDoc,
    tax: renderTaxDoc,
    pricetag: renderPricetagDoc,
    idcard: renderIdcardDoc,
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            การทำงาน <span>›</span> <b>พิมพ์เอกสาร</b>
          </div>
          <h1 className="page-title">พิมพ์เอกสาร</h1>
          <div className="page-sub">ศูนย์รวมการพิมพ์ใบเสร็จ สลิปเงินเดือน รายงาน และเอกสารอื่นๆ ของร้าน</div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={handleCheckPrinters}>
            <IconRefresh />
            ตรวจสอบเครื่องพิมพ์
          </button>
        </div>
      </div>

      {banner && <div className={`page-banner banner-${banner.type}`}>{banner.text}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconPrint />
          </div>
          <div>
            <div className="stat-label">พิมพ์ล่าสุด</div>
            <div className="stat-value">{printLog.length} ครั้ง</div>
            <div className="stat-foot">ใบเสร็จ {receiptPrintCount} · อื่นๆ {otherPrintCount}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconPrint />
          </div>
          <div>
            <div className="stat-label">เครื่องพิมพ์เชื่อมต่อ</div>
            <div className="stat-value">{connectedPrinters.length} / {printerOrder.length} เครื่อง</div>
            <div className="stat-foot">{offlinePrinters.length === 0 ? 'พร้อมใช้งานทั้งหมด' : `${offlinePrinters.length} เครื่องออฟไลน์`}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <IconClockHistory />
          </div>
          <div>
            <div className="stat-label">เครื่องพิมพ์ออฟไลน์</div>
            <div className="stat-value">{offlinePrinters.length} เครื่อง</div>
            <div className="stat-foot">{offlinePrinters.length > 0 ? 'ตรวจสอบการเชื่อมต่อ' : 'ทุกเครื่องพร้อมใช้งาน'}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--plum-bg)', color: 'var(--plum)' }}>
            <IconTag />
          </div>
          <div>
            <div className="stat-label">ประเภทเอกสาร</div>
            <div className="stat-value">{ORDER.length} ประเภท</div>
            <div className="stat-foot">พร้อมพิมพ์</div>
          </div>
        </div>
      </div>

      <div className="layout">
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">
                <IconPrint />
                เลือกประเภทเอกสาร
              </div>
              <div className="card-sub">แตะการ์ดเพื่อตั้งค่าและพิมพ์ หรือกดไอคอนพิมพ์ด่วน</div>
            </div>
          </div>

          <div className="doc-grid">
            {ORDER.map((id) => {
              const doc = DOCS[id];
              return (
                <div key={id} className={`doc-card${id === selectedId ? ' selected' : ''}`} onClick={() => setSelectedId(id)} role="button" tabIndex={0}>
                  <div className="doc-icon" style={{ background: doc.bg, color: doc.fg }}>
                    <doc.Icon />
                  </div>
                  <div className="doc-mid">
                    <div className="doc-name">{doc.name}</div>
                    <div className="doc-desc">{doc.desc}</div>
                    <div className="doc-meta">{lastPrintedMeta(id)}</div>
                  </div>
                  <button
                    type="button"
                    className="doc-print-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(id);
                      if (tryPrint(id, { thenPrint: true })) {
                        setBanner({ type: 'success', text: `ส่งพิมพ์ ${doc.name} ด่วนแล้ว` });
                      }
                    }}
                  >
                    <IconPrint />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="log-title">
            <IconClockHistory />
            ประวัติการพิมพ์ล่าสุด
          </div>
          <div>
            {(printLog.length > 0 ? printLog : FALLBACK_LOG).slice(0, 6).map((log, i) => {
              const LogIcon = DOCS[log.icon]?.Icon || IconPrint;
              return (
                <div className="log-row" key={i}>
                  <div className="log-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
                    <LogIcon />
                  </div>
                  <div className="log-mid">
                    <div className="log-title-txt">{log.title}</div>
                    <div className="log-sub">{log.sub}</div>
                  </div>
                  <span className="log-badge">สำเร็จ</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="summary-sticky">
          <div className="card card-pad">
            <div className="detail-head">
              <div className="detail-icon" style={{ background: d.bg, color: d.fg }}>
                <d.Icon />
              </div>
              <div>
                <div className="detail-name">{d.name}</div>
                <div className="detail-sub">ตั้งค่าและพิมพ์เอกสาร</div>
              </div>
            </div>

            {renderPicker()}

            <div className="field">
              <label>เลือกเครื่องพิมพ์</label>
              <div className="printer-pick">
                {printerOrder.map((id) => {
                  const p = printers[id];
                  return (
                    <div key={id} className={`printer-opt${printer === id ? ' selected' : ''}${!p.connected ? ' offline' : ''}`} onClick={() => setPrinter(id)} role="button" tabIndex={0}>
                      <IconPrint />
                      <div className="printer-opt-mid">
                        <div className="printer-opt-name">{p.name}</div>
                        <div className="printer-opt-sub">{p.model}{!p.connected ? ' · ออฟไลน์' : ''}</div>
                      </div>
                      <div className="printer-dot"></div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="submit-stack">
              <button type="button" className="btn btn-primary btn-block" onClick={handlePrint} disabled={!docHasData(selectedId)}>
                <IconPrint />
                พิมพ์เอกสารนี้
              </button>
              <button type="button" className="btn btn-ghost btn-block" onClick={handleDownloadPdf} disabled={!docHasData(selectedId)}>
                <IconDownload />
                บันทึกเป็น PDF แทน
              </button>
            </div>
          </div>

          <div className="card mini-stat-card">
            <div className="mini-stat-title">
              <IconPrint />
              สถานะเครื่องพิมพ์
            </div>
            {printerOrder.map((id) => {
              const p = printers[id];
              return (
                <div className="mini-stat-row" key={id}>
                  <div>
                    <div className="name">{p.name}</div>
                    <div className="sub">{p.model}</div>
                  </div>
                  <button type="button" className={`badge badge-btn ${p.connected ? 'badge-green' : 'badge-neutral'}`} onClick={() => toggleConnected(id)}>
                    {p.connected ? 'พร้อมใช้งาน' : 'ออฟไลน์'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="hidden-until-print">{DOC_RENDERERS[selectedId]?.()}</div>
    </>
  );
}
