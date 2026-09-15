import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  IconCart,
  IconReceipt,
  IconUsers,
  IconPrint,
  IconCash,
  IconClockHistory,
  IconCheck,
  IconBox,
  IconScale,
  IconX,
} from '../icons.jsx';
import { useReceipts } from '../context/ReceiptsContext.jsx';
import { useCustomers, INITIAL_ORDER as CUSTOMERS_INITIAL_ORDER } from '../context/CustomersContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { usePersistentState } from '../lib/persist.js';
import './Dashboard.css';

// Shown only until the shop's first real receipt exists (see `showOnboarding` below) — a
// brand-new install has nothing purchased, no staff added, and no scale checked yet, so
// pointing at exactly those three setup pages first is more useful here than a generic
// "welcome" message.
const ONBOARDING_STEPS = [
  { to: '/products', label: 'ตรวจสอบราคาสินค้า', desc: 'ปรับราคารับซื้อแต่ละประเภทให้ตรงกับร้านจริง', Icon: IconBox, bg: 'var(--amber-bg)', fg: 'var(--amber)' },
  { to: '/payroll', label: 'เพิ่มพนักงาน', desc: 'เพิ่มรายชื่อลูกน้องที่ทำงานในร้าน', Icon: IconUsers, bg: 'var(--plum-bg)', fg: 'var(--plum)' },
  { to: '/scales', label: 'ตั้งค่าเครื่องชั่ง', desc: 'ตรวจสอบเครื่องชั่งที่ใช้จริงหน้าร้าน', Icon: IconScale, bg: 'var(--blue-bg)', fg: 'var(--blue)' },
  { to: '/', label: 'เริ่มรับซื้อของเก่า', desc: 'เริ่มรายการรับซื้อและออกใบเสร็จใบแรก', Icon: IconCart, bg: 'var(--green-100)', fg: 'var(--green-700)' },
];

const todayThai = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date());

const QUICK_ACTIONS = [
  { to: '/', label: 'รับซื้อสินค้า', desc: 'เริ่มรายการรับซื้อของเก่าใหม่', Icon: IconCart, bg: 'var(--green-100)', fg: 'var(--green-700)' },
  { to: '/receipts', label: 'ใบเสร็จรับเงิน', desc: 'ค้นหาและพิมพ์ใบเสร็จ', Icon: IconReceipt, bg: 'var(--blue-bg)', fg: 'var(--blue)' },
  { to: '/customers', label: 'ลูกค้า', desc: 'ดูรายชื่อและประวัติลูกค้า', Icon: IconUsers, bg: 'var(--plum-bg)', fg: 'var(--plum)' },
  { to: '/print-center', label: 'พิมพ์เอกสาร', desc: 'พิมพ์รายงานและเอกสารร้าน', Icon: IconPrint, bg: 'var(--amber-bg)', fg: 'var(--amber)' },
];

function parseMoney(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}

// Local, not UTC — matches ReceiptsContext.jsx's own todayISO(), which is what every
// receipt's `date` field is actually stamped with.
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Dashboard() {
  const { receipts, order: receiptOrder } = useReceipts();
  const { order: customerOrder } = useCustomers();
  const { products } = useProducts();
  const [onboardingDismissed, setOnboardingDismissed] = usePersistentState('scrapshop_onboarding_dismissed', false);
  // Once a real receipt exists the shop is clearly up and running, so there's no need to
  // keep asking — this check alone (not the dismiss flag) is what makes the card disappear
  // permanently the moment the owner actually starts using the app for real.
  const showOnboarding = !onboardingDismissed && receiptOrder.length === 0;

  const activeReceipts = receiptOrder.filter((id) => receipts[id].status !== 'void');
  // "วันนี้" cards need the actual date filter on top of "active" — active receipts alone are
  // every non-void receipt ever, which would make these stats only ever grow, never reset.
  const todayActiveReceipts = useMemo(() => activeReceipts.filter((id) => receipts[id].date === todayISO()), [activeReceipts, receipts]);
  const todayTotal = useMemo(() => todayActiveReceipts.reduce((sum, id) => sum + parseMoney(receipts[id].total), 0), [todayActiveReceipts, receipts]);
  // "เดือนนี้" needs its own calendar-month filter too, not just "active" — receipts persist
  // indefinitely, so without this, once the shop has been running more than a month this would
  // silently become an all-time total instead of resetting every month.
  const monthActiveReceipts = useMemo(() => {
    const now = new Date();
    return activeReceipts.filter((id) => {
      const [y, m] = (receipts[id].date || '').split('-').map(Number);
      return y === now.getFullYear() && m === now.getMonth() + 1;
    });
  }, [activeReceipts, receipts]);
  const monthCount = monthActiveReceipts.length;
  const monthTotal = monthActiveReceipts.reduce((sum, id) => sum + parseMoney(receipts[id].total), 0);
  const cashOnHand = useMemo(
    () => todayActiveReceipts.filter((id) => receipts[id].method === 'เงินสด').reduce((sum, id) => sum + parseMoney(receipts[id].total), 0),
    [todayActiveReceipts, receipts]
  );
  const newCustomerIds = customerOrder.filter((id) => !CUSTOMERS_INITIAL_ORDER.includes(id));

  // Voided receipts are excluded everywhere else on this page — keep "recent" consistent
  // instead of showing a voided sale's full total as if it were a normal one.
  const recentReceipts = activeReceipts.slice(0, 4).map((id) => receipts[id]);

  const topProducts = useMemo(() => {
    const byName = {};
    for (const id of activeReceipts) {
      for (const it of receipts[id].items || []) {
        byName[it.n] = (byName[it.n] || 0) + parseMoney(it.t);
      }
    }
    return Object.entries(byName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amt]) => {
        const product = Object.values(products).find((p) => p.name === name);
        return { name, amt, Icon: product?.Icon, bg: product?.bg || 'var(--bg)', fg: product?.fg || 'var(--ink-500)' };
      });
  }, [activeReceipts, receipts, products]);

  const latestNewReceipt = receipts[receiptOrder[0]];
  // Voided receipts can be voided out of creation order, so pick by voidedAt (when
  // present) rather than receiptOrder's creation-time ordering — otherwise voiding an
  // older receipt after a newer one is already void would keep showing the older event.
  const latestVoided = useMemo(() => {
    const voidedIds = receiptOrder.filter((id) => receipts[id].status === 'void');
    if (voidedIds.length === 0) return undefined;
    return voidedIds.reduce((latest, id) => ((receipts[id].voidedAt || 0) > (receipts[latest].voidedAt || 0) ? id : latest));
  }, [receiptOrder, receipts]);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <b>แดชบอร์ด</b>
          </div>
          <h1 className="page-title">ภาพรวมร้านวันนี้</h1>
          <div className="page-sub">สรุปการดำเนินงานและทางลัดไปยังงานที่ใช้บ่อย</div>
        </div>
        <div className="head-actions">
          <div className="date-select">
            <IconClockHistory />
            {todayThai}
          </div>
        </div>
      </div>

      {showOnboarding && (
        <div className="card card-pad section-gap" style={{ background: 'var(--green-50)', border: '1px solid var(--green-100)' }}>
          <div className="card-head">
            <div>
              <div className="card-title">เริ่มต้นใช้งานร้านของคุณ</div>
              <div className="card-sub">ตั้งค่าเบื้องต้นให้เรียบร้อยก่อนเริ่มรับซื้อของเก่าจริง — ข้ามได้ถ้าตั้งค่าไว้แล้ว</div>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setOnboardingDismissed(true)}>
              <IconX />
              ซ่อน
            </button>
          </div>
          <div className="quick-action-grid">
            {ONBOARDING_STEPS.map((s) => (
              <Link to={s.to} className="quick-action-card" key={s.to}>
                <div className="quick-action-icon" style={{ background: s.bg, color: s.fg }}>
                  <s.Icon />
                </div>
                <div className="quick-action-label">{s.label}</div>
                <div className="quick-action-desc">{s.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconReceipt />
          </div>
          <div>
            <div className="stat-label">ยอดรับซื้อวันนี้</div>
            <div className="stat-value">{money(todayTotal)}</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              {todayActiveReceipts.length} ใบเสร็จ
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconCash />
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
          <div className="stat-icon" style={{ background: 'var(--plum-bg)', color: 'var(--plum)' }}>
            <IconUsers />
          </div>
          <div>
            <div className="stat-label">ลูกค้าทั้งหมด</div>
            <div className="stat-value">{customerOrder.length} ราย</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              ลูกค้าใหม่ {newCustomerIds.length} ราย
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--teal-bg, #E4F6F4)', color: 'var(--teal, #0E8E82)' }}>
            <IconCash />
          </div>
          <div>
            <div className="stat-label">ยอดจ่ายเงินสดวันนี้</div>
            <div className="stat-value">{money(cashOnHand)}</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              จากใบเสร็จที่จ่ายเงินสด
            </div>
          </div>
        </div>
      </div>

      <div className="card card-pad section-gap">
        <div className="card-head">
          <div className="card-title">ทางลัดที่ใช้บ่อย</div>
        </div>
        <div className="quick-action-grid">
          {QUICK_ACTIONS.map((a) => (
            <Link to={a.to} className="quick-action-card" key={a.to}>
              <div className="quick-action-icon" style={{ background: a.bg, color: a.fg }}>
                <a.Icon />
              </div>
              <div className="quick-action-label">{a.label}</div>
              <div className="quick-action-desc">{a.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid" style={{ '--detail-w': '340px' }}>
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">
                <IconReceipt />
                ใบเสร็จล่าสุด
              </div>
              <div className="card-sub">รายการรับซื้อล่าสุด</div>
            </div>
            <Link to="/receipts" className="btn btn-ghost">
              ดูทั้งหมด
            </Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '20%' }}>เลขที่</th>
                <th style={{ width: '40%' }}>ลูกค้า</th>
                <th style={{ width: '20%' }}>เวลา</th>
                <th style={{ width: '20%' }}>ยอดเงิน</th>
              </tr>
            </thead>
            <tbody>
              {recentReceipts.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-hint">
                    ยังไม่มีใบเสร็จ
                  </td>
                </tr>
              )}
              {recentReceipts.map((r) => (
                <tr key={r.no}>
                  <td className="num-cell">{r.no}</td>
                  <td>{r.cust}</td>
                  <td style={{ color: 'var(--ink-500)', fontSize: 12.5 }}>{r.time}</td>
                  <td className="num-cell">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="summary-sticky">
          <div className="card mini-stat-card">
            <div className="mini-stat-title">
              <IconCheck />
              สินค้ายอดนิยม
            </div>
            {topProducts.length === 0 && <div className="empty-hint">ยังไม่มีข้อมูลการรับซื้อ</div>}
            {topProducts.map((p) => (
              <div className="mini-stat-row" key={p.name}>
                <div className="row-cell">
                  {p.Icon && (
                    <div className="row-icon sm" style={{ background: p.bg, color: p.fg }}>
                      <p.Icon />
                    </div>
                  )}
                  <span>{p.name}</span>
                </div>
                <span className="n">{money(p.amt)}</span>
              </div>
            ))}
          </div>

          <div className="card mini-stat-card">
            <div className="mini-stat-title">
              <IconClockHistory />
              กิจกรรมล่าสุด
            </div>
            {!latestNewReceipt && !latestVoided && <div className="empty-hint">ยังไม่มีกิจกรรม</div>}
            {latestNewReceipt && (
              <div className="mini-stat-row">
                <span>ออกใบเสร็จ {latestNewReceipt.no}</span>
                <span className="n">{latestNewReceipt.time}</span>
              </div>
            )}
            {latestVoided && (
              <div className="mini-stat-row">
                <span>ยกเลิก {receipts[latestVoided].no}</span>
                <span className="n">{receipts[latestVoided].time}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
