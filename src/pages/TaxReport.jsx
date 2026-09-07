import { useMemo, useState } from 'react';
import { IconTax, IconPrint, IconUser, IconCalendarBars, IconSplit, IconInfo, IconClockHistory } from '../icons.jsx';
import { exportCsv } from '../lib/csvExport.js';
import { useReceipts, INITIAL_ORDER as RECEIPTS_INITIAL_ORDER } from '../context/ReceiptsContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import './TaxReport.css';

const TAX_YEAR_BE = new Date().getFullYear() + 543;
const THIS_MONTH_LONG = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: 'long', year: 'numeric' }).format(new Date());
const THIS_MONTH_SHORT = new Intl.DateTimeFormat('th-TH', { month: 'short' }).format(new Date());
const YTD_LABEL = `ม.ค.–${THIS_MONTH_SHORT}`;

// Jan-Apr are historical reference figures (this app has no real date-stamped receipt
// history to compute them from); the current month is replaced below with the real,
// live total from the Receipts page so at least this month reflects actual system data.
const HISTORICAL_MONTHLY = [
  { m: `มกราคม ${TAX_YEAR_BE}`, amt: 402300, weightKg: 17240, receiptCount: 142 },
  { m: `กุมภาพันธ์ ${TAX_YEAR_BE}`, amt: 384100, weightKg: 16510, receiptCount: 138 },
  { m: `มีนาคม ${TAX_YEAR_BE}`, amt: 452800, weightKg: 19320, receiptCount: 151 },
  { m: `เมษายน ${TAX_YEAR_BE}`, amt: 396950, weightKg: 17020, receiptCount: 125 },
];

// Same baseline convention as the 512450 baht / 186 receipt figures below, at the same
// ~23.3 baht/kg rate the historical months above average — without this, "current month"
// weight came out as just the seed receipts' raw ~470 kg with no baseline at all, next to
// a baseline'd baht figure, implying an absurd ~1,090 baht/kg for the current month only.
const CURRENT_MONTH_BASELINE_WEIGHT = 21955;

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nowStr() {
  return new Date().toLocaleString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function parseMoney(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}

function parseWeightKg(w) {
  return parseFloat(String(w).replace(/[^\d.]/g, '')) || 0;
}

// Thai personal income tax brackets (progressive)
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
    const taxableInBracket = Math.min(netIncome, bracket.upTo) - lower;
    tax += taxableInBracket * bracket.rate;
    lower = bracket.upTo;
  }
  return tax;
}

export default function TaxReport() {
  const [taxForm, setTaxForm] = useState('90');
  const { receipts, order: receiptOrder } = useReceipts();
  const { settings } = useSettings();

  // Same "current month" convention used on Dashboard/Receipts: the seed receipts are
  // this month's baseline, and anything added beyond that baseline extends it for real.
  // A voided receipt shouldn't still inflate taxable income, so the delta is active-only.
  const newReceiptIds = receiptOrder.filter((id) => !RECEIPTS_INITIAL_ORDER.includes(id));
  const newActiveReceiptIds = newReceiptIds.filter((id) => receipts[id].status !== 'void');
  const currentMonthAmt = 512450 + newActiveReceiptIds.reduce((s, id) => s + parseMoney(receipts[id].total), 0);
  const currentMonthWeight = CURRENT_MONTH_BASELINE_WEIGHT + newActiveReceiptIds.reduce((s, id) => s + parseWeightKg(receipts[id].weight), 0);
  const currentMonthReceiptCount = 186 + newActiveReceiptIds.length;

  const monthly = [...HISTORICAL_MONTHLY, { m: THIS_MONTH_LONG, amt: currentMonthAmt, weightKg: currentMonthWeight, receiptCount: currentMonthReceiptCount }];

  const totalIncome = useMemo(() => monthly.reduce((s, m) => s + m.amt, 0), [monthly]);
  const totalWeightKg = monthly.reduce((s, m) => s + m.weightKg, 0);
  const totalReceiptCount = monthly.reduce((s, m) => s + m.receiptCount, 0);
  const expenseDeduct = totalIncome * 0.6;
  // ภงด.94 is the mid-year advance filing (first half of the year only) and by Thai tax
  // rules its personal allowance is half of the full-year ภงด.90 allowance — the two forms
  // are genuinely different filings, not just a relabeled copy of the same numbers.
  const isHalfYear = taxForm === '94';
  const personalDeduct = isHalfYear ? 30000 : 60000;
  const periodLabel = isHalfYear ? `1 ม.ค. – 30 มิ.ย. ${TAX_YEAR_BE} (ครึ่งปีแรก)` : `1 ม.ค. – 31 ธ.ค. ${TAX_YEAR_BE} (เต็มปี)`;
  const netIncome = Math.max(totalIncome - expenseDeduct - personalDeduct, 0);
  const estimatedTax = calcProgressiveTax(netIncome);

  function handleExport() {
    exportCsv(
      'tax-report.csv',
      ['เดือน', 'ยอดรับซื้อ', 'น้ำหนักรวม', 'ใบเสร็จ'],
      monthly.map((m) => [m.m, m.amt.toFixed(2), `${m.weightKg.toLocaleString('th-TH')} กก.`, `${m.receiptCount} ใบ`])
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            รายงาน <span>›</span> <b>ภาษี ภงด.90/94</b>
          </div>
          <h1 className="page-title">ภาษี ภงด.90/94</h1>
          <div className="page-sub">สรุปรายได้และคำนวณภาษีเบื้องต้นสำหรับยื่นแบบประจำปี</div>
        </div>
        <div className="head-actions">
          <div className="date-select">
            <IconCalendarBars />
            ปีภาษี {TAX_YEAR_BE}
          </div>
          <button type="button" className="btn btn-ghost" onClick={handleExport}>
            <IconClockHistory />
            ส่งออก Excel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <IconPrint />
            พิมพ์แบบ ภงด.
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconTax />
          </div>
          <div>
            <div className="stat-label">รายได้รวมทั้งปี</div>
            <div className="stat-value">{money(totalIncome)}</div>
            <div className="stat-foot">ถึงปัจจุบัน ({YTD_LABEL})</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}>
            <IconSplit />
          </div>
          <div>
            <div className="stat-label">หักค่าใช้จ่าย (60%)</div>
            <div className="stat-value">{money(expenseDeduct)}</div>
            <div className="stat-foot">เหมาจ่ายตามประเภทเงินได้</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconSplit />
          </div>
          <div>
            <div className="stat-label">เงินได้สุทธิ</div>
            <div className="stat-value">{money(totalIncome - expenseDeduct)}</div>
            <div className="stat-foot">หลังหักค่าใช้จ่ายและลดหย่อน</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <IconTax />
          </div>
          <div>
            <div className="stat-label">ภาษีที่ต้องชำระโดยประมาณ</div>
            <div className="stat-value">{money(estimatedTax)}</div>
            <div className="stat-foot">คำนวณแบบขั้นบันได</div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ '--detail-w': '340px' }}>
        <div>
          <div className="card card-pad section-gap">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <IconUser />
                  ข้อมูลผู้เสียภาษี
                </div>
                <div className="card-sub">ใช้สำหรับกรอกในแบบ ภงด.90/94 อัตโนมัติ</div>
              </div>
              <div className="filter-tabs">
                <button type="button" className={`filter-tab${taxForm === '90' ? ' active' : ''}`} onClick={() => setTaxForm('90')}>
                  ภงด.90
                </button>
                <button type="button" className={`filter-tab${taxForm === '94' ? ' active' : ''}`} onClick={() => setTaxForm('94')}>
                  ภงด.94
                </button>
              </div>
            </div>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>ชื่อผู้ประกอบการ</label>
                <input className="input-plain" value={settings.shopName} disabled />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>เลขประจำตัวผู้เสียภาษี</label>
                <input className="input-plain" value={settings.taxId} disabled />
              </div>
            </div>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>ประเภทเงินได้</label>
                <input className="input-plain" defaultValue="มาตรา 40(8) รับซื้อของเก่า" disabled />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>รอบระยะเวลาบัญชี</label>
                <input className="input-plain" value={periodLabel} disabled />
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <IconCalendarBars />
                  รายได้แยกตามเดือน
                </div>
                <div className="card-sub">ยอดรับซื้อของเก่าถือเป็นเงินได้ก่อนหักค่าใช้จ่าย</div>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '34%' }}>เดือน</th>
                  <th style={{ width: '22%' }}>ยอดรับซื้อ</th>
                  <th style={{ width: '22%' }}>น้ำหนักรวม</th>
                  <th style={{ width: '22%' }}>ใบเสร็จ</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.m}>
                    <td>{m.m}</td>
                    <td className="num-cell">{money(m.amt)}</td>
                    <td className="num-cell">{m.weightKg.toLocaleString('th-TH')} กก.</td>
                    <td className="num-cell">{m.receiptCount} ใบ</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 600, background: 'var(--green-50)' }}>
                  <td>รวมทั้งสิ้น ({YTD_LABEL})</td>
                  <td className="num-cell">{money(totalIncome)}</td>
                  <td className="num-cell">{totalWeightKg.toLocaleString('th-TH')} กก.</td>
                  <td className="num-cell">{totalReceiptCount} ใบ</td>
                </tr>
              </tbody>
            </table>

            <div className="info-note">
              <IconInfo />
              ตัวเลขนี้เป็นการประมาณการเบื้องต้นจากข้อมูลในระบบเท่านั้น กรุณาตรวจสอบกับผู้ทำบัญชีหรือสรรพากรก่อนยื่นแบบจริง
            </div>
          </div>
        </div>

        <div className="summary-sticky">
          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconSplit />
              คำนวณภาษีเบื้องต้น
            </div>
            <div className="sum-row">
              <span className="label">รายได้รวม</span>
              <span className="val">{money(totalIncome)}</span>
            </div>
            <div className="sum-row">
              <span className="label">หักค่าใช้จ่ายเหมา 60%</span>
              <span className="val minus">−{money(expenseDeduct)}</span>
            </div>
            <div className="sum-row">
              <span className="label">หักลดหย่อนส่วนตัว</span>
              <span className="val minus">−{money(personalDeduct)}</span>
            </div>
            <div className="sum-row">
              <span className="label">เงินได้สุทธิ</span>
              <span className="val">{money(netIncome)}</span>
            </div>
            <div className="grand-total">
              <span className="label">ภาษีโดยประมาณ</span>
              <span className="val">{money(estimatedTax)}</span>
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconClockHistory />
              กำหนดการยื่นแบบ
            </div>
            <div className="mini-stat-row">
              <div>
                <div style={{ fontWeight: 600 }}>ภงด.94 (ครึ่งปี)</div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ยื่นภายในกันยายน</div>
              </div>
              <span className="n">30 ก.ย. {TAX_YEAR_BE}</span>
            </div>
            <div className="mini-stat-row">
              <div>
                <div style={{ fontWeight: 600 }}>ภงด.90 (ประจำปี)</div>
                <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>ยื่นภายในมีนาคมปีถัดไป</div>
              </div>
              <span className="n">31 มี.ค. {TAX_YEAR_BE + 1}</span>
            </div>
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={() => window.print()}>
            <IconPrint />
            พิมพ์แบบสรุปรายได้
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
            <div className="a4-doc-title">แบบสรุปรายได้สำหรับยื่นภาษี ภงด.{taxForm} · ปีภาษี {TAX_YEAR_BE}</div>
          </div>
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
                <td>รวมทั้งสิ้น ({YTD_LABEL})</td>
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
              <span>{money(estimatedTax)}</span>
            </div>
          </div>

          <div className="a4-doc-foot">
            พิมพ์เมื่อ {nowStr()} · ตัวเลขนี้เป็นการประมาณการเบื้องต้นจากข้อมูลในระบบเท่านั้น กรุณาตรวจสอบกับผู้ทำบัญชีหรือสรรพากรก่อนยื่นแบบจริง
          </div>
        </div>
      </div>
    </>
  );
}
