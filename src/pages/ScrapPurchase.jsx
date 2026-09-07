import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomers } from '../context/CustomersContext.jsx';
import { useReceipts } from '../context/ReceiptsContext.jsx';
import { useDeductions } from '../context/DeductionsContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useCategories } from '../context/CategoriesContext.jsx';
import { useScales } from '../context/ScalesContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { getStoredAuth } from '../lib/auth.js';
import { usePersistentState } from '../lib/persist.js';
import {
  IconUsers,
  IconSearch,
  IconUserAdd,
  IconX,
  IconBox,
  IconPlus,
  IconTrash,
  IconScale,
  IconRefresh,
  IconArchive,
  IconInfo,
  IconClockHistory,
  IconSplit,
  IconCash,
  IconTransfer,
  IconPhone,
  IconPrint,
} from '../icons.jsx';
import './ScrapPurchase.css';

const PAY_LABELS = { cash: 'เงินสด', transfer: 'โอนเงิน', promptpay: 'พร้อมเพย์' };

// The unselected-customer placeholder already tells the cashier "this will be recorded as
// a walk-in customer" — handleSubmit used to contradict that by blocking submission outright
// with no customer picked. This is what a receipt actually becomes in that case.
const WALK_IN_CUSTOMER = { name: 'ลูกค้าขาจร', init: 'ขจ', bg: 'var(--bg)', fg: 'var(--ink-500)' };

let nextRowId = 1;

function initials(name) {
  return (name || '').replace('คุณ', '').trim().slice(0, 2) || '?';
}

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayThaiDate() {
  return new Date().toLocaleDateString('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' });
}

function parseMoneyStr(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}

function parseWeightStr(w) {
  return parseFloat(String(w).replace(/[^\d.]/g, '')) || 0;
}

function makeRow(category) {
  return {
    id: nextRowId++,
    name: category.name,
    icon: category.icon,
    bg: category.bg,
    fg: category.fg,
    price: category.price,
    weight: '',
  };
}

function makeDraftNo() {
  return 'RC' + Date.now().toString().slice(-9);
}

export default function ScrapPurchase() {
  const navigate = useNavigate();
  const { customers, order: customerOrder, addCustomer, recordPurchase } = useCustomers();
  const { receipts, order: receiptOrder, addReceipt } = useReceipts();
  const { reasons, order: reasonOrder, incrementUsage } = useDeductions();
  const { products, order: productOrder, addStock } = useProducts();
  const { categories } = useCategories();
  const { devices: scaleDevices, order: scaleOrder } = useScales();
  const { settings } = useSettings();

  const mainScaleId = scaleOrder.find((id) => scaleDevices[id].active) || scaleOrder[0];
  const mainScale = scaleDevices[mainScaleId];

  // A product whose category was deactivated on the หมวดหมู่สินค้า page shouldn't offer a
  // quick-add chip here — matches that page's own "แสดงในหน้ารับซื้อของ..." description of
  // what turning a category off does.
  const activeCategoryNames = useMemo(() => new Set(Object.values(categories).filter((c) => c.isActive).map((c) => c.name)), [categories]);
  const quickCategories = useMemo(
    () =>
      productOrder
        .map((id) => products[id])
        .filter((p) => p && p.active && activeCategoryNames.has(p.cat))
        .slice(0, 5)
        .map((p) => ({ name: p.name, price: p.price, icon: p.Icon, bg: p.bg, fg: p.fg })),
    [products, productOrder, activeCategoryNames]
  );
  const [draftNo, setDraftNo] = useState(makeDraftNo);
  const [custQuery, setCustQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');

  const [rows, setRows] = useState([]);

  const [note, setNote] = useState('');
  const [scaleReading, setScaleReading] = useState(0);
  const [payMethod, setPayMethod] = useState('cash');

  const [showDeduction, setShowDeduction] = useState(false);
  const [deductionWeight, setDeductionWeight] = useState('');
  const [deductionReasonId, setDeductionReasonId] = useState('');
  const [customReason, setCustomReason] = useState('');

  const [banner, setBanner] = useState(null);
  const [printSnapshot, setPrintSnapshot] = useState(null);
  const noteRef = useRef(null);

  const [draft, setDraft] = usePersistentState('scrapshop_purchase_draft', null);

  // Restore a saved draft once on mount, but only into an otherwise-empty form so it
  // never clobbers a purchase already being entered (e.g. after a route change/refresh).
  useEffect(() => {
    if (!draft || rows.length > 0 || selectedCustomer) return;
    if (draft.selectedCustomer) setSelectedCustomer(draft.selectedCustomer);
    if (draft.rows?.length) {
      setRows(
        draft.rows.map((r) => {
          const product = Object.values(products).find((p) => p.name === r.name);
          return { ...r, icon: product?.Icon || IconBox, bg: r.bg || product?.bg || 'var(--bg)', fg: r.fg || product?.fg || 'var(--ink-500)' };
        })
      );
    }
    if (draft.note) setNote(draft.note);
    if (draft.deductionWeight) setDeductionWeight(draft.deductionWeight);
    if (draft.deductionReasonId) setDeductionReasonId(draft.deductionReasonId);
    if (draft.customReason) setCustomReason(draft.customReason);
    if (draft.payMethod) setPayMethod(draft.payMethod);
    setBanner({ type: 'info', text: `กู้คืนฉบับร่างที่บันทึกไว้เมื่อ ${draft.savedAt} แล้ว` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = custQuery.trim().toLowerCase();
    if (!q) return [];
    return customerOrder
      .map((id) => ({ id, ...customers[id] }))
      .filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.idNumber || '').toLowerCase().includes(q));
  }, [custQuery, customers, customerOrder]);

  function rowWeight(r) {
    return Math.max(parseFloat(r.weight) || 0, 0);
  }
  function rowPrice(r) {
    return Math.max(parseFloat(r.price) || 0, 0);
  }
  function rowGross(r) {
    return rowWeight(r) * rowPrice(r);
  }
  function rowDeductionWeight(r) {
    const d = parseFloat(r.deductionWeight) || 0;
    return Math.min(Math.max(d, 0), rowWeight(r));
  }
  function rowDeductionMoney(r) {
    return rowDeductionWeight(r) * rowPrice(r);
  }
  function rowNetWeight(r) {
    return rowWeight(r) - rowDeductionWeight(r);
  }
  function rowNetTotal(r) {
    return rowNetWeight(r) * rowPrice(r);
  }
  function rowDeductionLabel(r) {
    return r.deductionReasonId === 'other' ? (r.customReason || '').trim() : reasons[r.deductionReasonId]?.name || '';
  }

  // Same "today" convention used across the app: seed receipts represent today's baseline
  // business, real activity adds on top of it — see Dashboard/Receipts for the same pattern.
  const todayReceipts = receiptOrder.filter((id) => receipts[id].status !== 'void');
  const todayReceiptCount = todayReceipts.length;
  const todayWeightTotal = todayReceipts.reduce((sum, id) => sum + parseWeightStr(receipts[id].weight), 0);
  const todayMoneyTotal = todayReceipts.reduce((sum, id) => sum + parseMoneyStr(receipts[id].total), 0);
  const todayCashTotal = todayReceipts
    .filter((id) => receipts[id].method === 'เงินสด')
    .reduce((sum, id) => sum + parseMoneyStr(receipts[id].total), 0);

  const subtotal = useMemo(() => rows.reduce((sum, r) => sum + rowGross(r), 0), [rows]);
  const totalWeight = useMemo(() => rows.reduce((sum, r) => sum + rowWeight(r), 0), [rows]);
  const blendedPrice = totalWeight > 0 ? subtotal / totalWeight : 0;
  const rowDeductionsWeightTotal = useMemo(() => rows.reduce((sum, r) => sum + rowDeductionWeight(r), 0), [rows]);
  const rowDeductionsMoneyTotal = useMemo(() => rows.reduce((sum, r) => sum + rowDeductionMoney(r), 0), [rows]);
  const overallDeductionWeight = Math.min(parseFloat(deductionWeight) || 0, Math.max(totalWeight - rowDeductionsWeightTotal, 0));
  const overallDeductionMoney = overallDeductionWeight * blendedPrice;
  const totalDeductionWeight = overallDeductionWeight + rowDeductionsWeightTotal;
  const deduction = overallDeductionMoney + rowDeductionsMoneyTotal;
  const grandTotal = Math.max(subtotal - deduction, 0);
  const deductionLabel = deductionReasonId === 'other' ? customReason.trim() : reasons[deductionReasonId]?.name || '';

  function updateRow(id, field, value) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function selectDeductionReason(id) {
    setDeductionReasonId(id);
    if (!id) {
      setDeductionWeight('');
      return;
    }
    const reason = reasons[id];
    if (id === 'other') {
      setDeductionWeight('');
    } else if (reason.type === 'percent') {
      const pct = parseFloat(reason.value) || 0;
      setDeductionWeight(((totalWeight * pct) / 100).toFixed(2));
    } else {
      setDeductionWeight(reason.value);
    }
  }

  function selectRowDeductionReason(rowId, reasonId) {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    updateRow(rowId, 'deductionReasonId', reasonId);
    if (!reasonId) {
      updateRow(rowId, 'deductionWeight', '');
      return;
    }
    const reason = reasons[reasonId];
    const rowWeight = parseFloat(row.weight) || 0;
    if (reasonId === 'other') {
      updateRow(rowId, 'deductionWeight', '');
    } else if (reason.type === 'percent') {
      const pct = parseFloat(reason.value) || 0;
      updateRow(rowId, 'deductionWeight', ((rowWeight * pct) / 100).toFixed(2));
    } else {
      updateRow(rowId, 'deductionWeight', reason.value);
    }
  }

  function removeRow(id) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function addRowFromCategory(category) {
    const row = makeRow(category);
    setRows((prev) => [...prev, row]);
    setBanner(null);
  }

  function addBlankRow() {
    setRows((prev) => [...prev, { id: nextRowId++, name: 'รายการใหม่', icon: IconBox, bg: 'var(--bg)', fg: 'var(--ink-500)', price: '', weight: '' }]);
  }

  function selectCustomer(c) {
    setSelectedCustomer(c);
    setCustQuery('');
  }

  function handleCreateCustomer(e) {
    e.preventDefault();
    if (!newCustName.trim() || !newCustPhone.trim()) return;
    const created = addCustomer({ name: newCustName.trim(), phone: newCustPhone.trim() });
    setSelectedCustomer(created);
    setNewCustName('');
    setNewCustPhone('');
    setShowNewCustomer(false);
  }

  function pullWeight() {
    if (mainScale.status !== 'on') {
      setBanner({ type: 'error', text: `${mainScale.name} ไม่ได้เชื่อมต่ออยู่ — ไปที่หน้า "เครื่องชั่ง" เพื่อเชื่อมต่อก่อน` });
      return;
    }
    if (rows.length === 0) {
      setBanner({ type: 'error', text: 'กรุณาเพิ่มรายการสินค้าก่อนดึงน้ำหนัก' });
      return;
    }
    // No browser API can read a real digital scale, so this simulates a reading the same
    // way the "(จำลอง)" button on the เครื่องชั่ง page does.
    const val = Number((Math.random() * 40 + 2).toFixed(2));
    setScaleReading(val);
    setRows((prev) => {
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], weight: val.toFixed(2) };
      return next;
    });
  }

  function resetForm() {
    setSelectedCustomer(null);
    setRows([]);
    setNote('');
    setScaleReading(0);
    setDeductionWeight('');
    setDeductionReasonId('');
    setCustomReason('');
    setShowDeduction(false);
    setPayMethod('cash');
    setDraftNo(makeDraftNo());
    setDraft(null);
  }

  function handleCancel() {
    if (!window.confirm('ยืนยันยกเลิกรายการนี้ทั้งหมด?')) return;
    resetForm();
    setBanner({ type: 'info', text: 'ยกเลิกรายการแล้ว' });
  }

  function handleSaveDraft() {
    if (rows.length === 0 && !selectedCustomer) {
      setBanner({ type: 'error', text: 'ยังไม่มีข้อมูลในรายการนี้ให้บันทึกฉบับร่าง' });
      return;
    }
    setDraft({
      savedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.',
      selectedCustomer,
      rows: rows.map(({ icon, ...rest }) => rest),
      note,
      deductionWeight,
      deductionReasonId,
      customReason,
      payMethod,
    });
    setBanner({ type: 'success', text: 'บันทึกฉบับร่างเรียบร้อยแล้ว — ระบบจะดึงกลับมาให้อัตโนมัติเมื่อเปิดหน้านี้ครั้งถัดไป' });
  }

  function handleSubmit() {
    if (rows.length === 0 || totalWeight <= 0) {
      setBanner({ type: 'error', text: 'กรุณาเพิ่มรายการสินค้าและระบุน้ำหนักก่อนบันทึก' });
      return;
    }
    // No customer selected genuinely means a walk-in sale, per the placeholder text right
    // above the customer search box ("รายการนี้จะบันทึกเป็นลูกค้าขาจร") — this used to
    // contradict that by blocking submission outright instead of actually recording one.
    const cust = selectedCustomer || WALK_IN_CUSTOMER;
    const receiptNo = 'RC' + Date.now().toString().slice(-9);
    const user = getStoredAuth();
    const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
    setPrintSnapshot({
      no: receiptNo,
      time: timeStr,
      date: todayThaiDate(),
      customerName: cust.name,
      issuedBy: user?.displayName || 'เจ้าของร้าน',
      items: rows.map((r) => ({
        name: r.name,
        weight: rowWeight(r),
        price: rowPrice(r),
        rowDeductionWeight: rowDeductionWeight(r),
        rowDeductionLabel: rowDeductionLabel(r),
        netWeight: rowNetWeight(r),
        total: rowNetTotal(r),
      })),
      totalWeight,
      deduction,
      deductionLabel,
      totalDeductionWeight,
      grandTotal,
      payMethod,
      note: note.trim(),
    });
    addReceipt({
      no: receiptNo,
      time: timeStr,
      cust: cust.name,
      // Receipts previously only stored the customer's name — voiding one had no reliable
      // way to find which customer record to reverse recordPurchase's effect on. Kept
      // alongside `cust` (the display name) rather than replacing it. Walk-in sales
      // legitimately have no id — that's fine, there's no customer ledger to reverse.
      custId: selectedCustomer?.id || null,
      init: cust.init || initials(cust.name),
      bg: cust.bg || 'var(--green-100)',
      fg: cust.fg || 'var(--green-700)',
      status: 'ok',
      weight: totalWeight.toFixed(2) + ' กก.',
      deductionWeight: totalDeductionWeight,
      deductionLabel,
      note: note.trim(),
      method: PAY_LABELS[payMethod],
      items: rows.map((r) => ({
        n: r.name,
        w:
          rowDeductionWeight(r) > 0
            ? `${rowWeight(r).toFixed(2)} − ${rowDeductionWeight(r).toFixed(2)} = ${rowNetWeight(r).toFixed(2)} กก. × ${money(rowPrice(r))}`
            : `${rowWeight(r).toFixed(2)} กก. × ${money(rowPrice(r))}`,
        // Kept as a real number alongside the display string `w` above — voiding a receipt
        // needs the exact net weight added to stock per product, and parsing it back out of
        // the formatted string would be fragile.
        netWeight: rowNetWeight(r),
        t: money(rowNetTotal(r)),
      })),
      total: money(grandTotal),
      // Which deduction reasons this receipt actually incremented usage on, and by how much —
      // voiding the receipt needs this to call decrementUsage the same number of times with
      // the same amounts, or the reason's "ใช้แล้ว N ครั้ง"/ยอดหักรวม would stay inflated forever.
      deductionUsage: [
        ...(deductionReasonId && overallDeductionWeight > 0 ? [{ id: deductionReasonId, amount: overallDeductionMoney }] : []),
        ...rows
          .filter((r) => r.deductionReasonId && rowDeductionWeight(r) > 0)
          .map((r) => ({ id: r.deductionReasonId, amount: rowDeductionMoney(r) })),
      ],
    });
    // Record real usage against each deduction reason actually applied on this receipt —
    // both the overall reason and any per-row reasons — so the "ใช้แล้ว N ครั้ง" / total
    // figures on the หักน้ำหนัก/เหตุผล page reflect real activity, not frozen seed numbers.
    if (deductionReasonId && overallDeductionWeight > 0) {
      incrementUsage(deductionReasonId, overallDeductionMoney);
    }
    for (const r of rows) {
      if (r.deductionReasonId && rowDeductionWeight(r) > 0) {
        incrementUsage(r.deductionReasonId, rowDeductionMoney(r));
      }
    }
    // Update the customer's real cumulative weight/spend/visit history, and add the net
    // weight bought to each product's stock — neither happened automatically before, so
    // Customers.jsx and Products.jsx stayed frozen at seed values no matter how many real
    // purchases went through.
    if (selectedCustomer?.id) {
      recordPurchase(selectedCustomer.id, { weightKg: totalWeight, amount: grandTotal, receiptNo, timeStr });
    }
    for (const r of rows) {
      addStock(r.name, rowNetWeight(r), rowPrice(r));
    }
    setBanner({ type: 'success', text: `บันทึกและพิมพ์ใบเสร็จ ${receiptNo} เรียบร้อยแล้ว ยอดสุทธิ ${money(grandTotal)}` });
    resetForm();
    setTimeout(() => window.print(), 50);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            รับซื้อสินค้า <span>›</span> <b>เริ่มรับซื้อ</b>
          </div>
          <h1 className="page-title">
            รับซื้อของเก่า <span className="receipt-tag">ฉบับร่าง · {draftNo}</span>
          </h1>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-danger-ghost" onClick={handleCancel}>
            <IconTrash />
            ยกเลิกรายการ
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleSaveDraft}>
            <IconArchive />
            บันทึกฉบับร่าง
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

      <div className="grid">
        {/* ===== LEFT: form ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card card-pad">
            <div className="card-head">
              <div className="card-title">
                <IconUsers />
                ข้อมูลลูกค้า
              </div>
            </div>
            <div className="cust-row">
              <div className="cust-search">
                <IconSearch />
                <input
                  type="text"
                  placeholder="ค้นหาด้วยชื่อ, เบอร์โทร หรือเลขบัตรประชาชน"
                  value={custQuery}
                  onChange={(e) => setCustQuery(e.target.value)}
                />
                {filteredCustomers.length > 0 && (
                  <div className="cust-dropdown">
                    {filteredCustomers.map((c) => (
                      <button type="button" key={c.id} className="cust-option" onClick={() => selectCustomer(c)}>
                        <span className="cust-avatar-sm">{initials(c.name)}</span>
                        <span>
                          <span className="name">{c.name}</span>
                          <span className="meta"> · {c.phone}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className="btn btn-ghost btn-new-cust" onClick={() => setShowNewCustomer((v) => !v)}>
                <IconUserAdd />
                ลูกค้าใหม่
              </button>
            </div>

            {showNewCustomer && (
              <form className="new-cust-form" onSubmit={handleCreateCustomer}>
                <input type="text" placeholder="ชื่อลูกค้า" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} required />
                <input type="text" placeholder="เบอร์โทรศัพท์" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} required />
                <button type="submit" className="btn btn-primary">
                  บันทึก
                </button>
              </form>
            )}

            {selectedCustomer ? (
              <div className="cust-selected">
                <div className="cust-avatar">{initials(selectedCustomer.name)}</div>
                <div className="cust-info">
                  <div className="name">{selectedCustomer.name}</div>
                  <div className="meta">
                    {selectedCustomer.phone} &nbsp;·&nbsp; ซื้อขายแล้ว {selectedCustomer.visits}
                  </div>
                </div>
                {selectedCustomer.tag === 'regular' && <span className="cust-badge">ลูกค้าประจำ</span>}
                <div className="cust-clear" onClick={() => setSelectedCustomer(null)} role="button" tabIndex={0}>
                  <IconX />
                </div>
              </div>
            ) : (
              <div className="cust-empty">ยังไม่ได้เลือกลูกค้า — รายการนี้จะบันทึกเป็นลูกค้าขาจร</div>
            )}
          </div>

          <div className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <IconBox />
                  รายการสินค้าที่รับซื้อ
                </div>
                <div className="card-sub">เลือกจากรายการยอดนิยม หรือเพิ่มรายการเอง</div>
              </div>
            </div>

            <div className="quick-add">
              {quickCategories.map((c) => (
                <div className="chip" key={c.name} onClick={() => addRowFromCategory(c)} role="button" tabIndex={0}>
                  <span className="dot" style={{ background: c.bg, color: c.fg }}>
                    <c.icon />
                  </span>
                  {c.name}
                </div>
              ))}
              <div className="chip chip-outline" role="button" tabIndex={0} onClick={() => navigate('/categories')}>
                <IconPlus style={{ width: 13, height: 13 }} />
                ดูหมวดหมู่ทั้งหมด
              </div>
            </div>

            <table className="item-table">
              <thead>
                <tr>
                  <th style={{ width: '26%' }}>รายการ</th>
                  <th style={{ width: '13%' }}>น้ำหนัก</th>
                  <th style={{ width: '13%' }}>ราคา/กก.</th>
                  <th style={{ width: '22%' }}>หักน้ำหนัก</th>
                  <th style={{ width: '20%', textAlign: 'right' }}>ยอดรวม</th>
                  <th style={{ width: '6%' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td>
                        <div className="it-cat">
                          <div className="it-icon" style={{ background: r.bg, color: r.fg }}>
                            <r.icon />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <input
                              className="it-name-input"
                              value={r.name}
                              onChange={(e) => updateRow(r.id, 'name', e.target.value)}
                            />
                            <div className="it-price">{rowPrice(r).toFixed(2)} บาท/กก.</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <input
                          className="cell-input"
                          inputMode="decimal"
                          value={r.weight}
                          onChange={(e) => updateRow(r.id, 'weight', e.target.value)}
                        />
                        <span className="unit">กก.</span>
                      </td>
                      <td>
                        <input
                          className="cell-input"
                          inputMode="decimal"
                          value={r.price}
                          onChange={(e) => updateRow(r.id, 'price', e.target.value)}
                        />
                        <span className="unit">฿</span>
                      </td>
                      <td>
                        <select
                          className="cell-select"
                          value={r.deductionReasonId || ''}
                          onChange={(e) => selectRowDeductionReason(r.id, e.target.value)}
                        >
                          <option value="">เลือกเหตุผล...</option>
                          {reasonOrder
                            .filter((id) => reasons[id].active)
                            .map((id) => (
                              <option key={id} value={id}>
                                {reasons[id].name} ({reasons[id].type === 'percent' ? `−${reasons[id].value}%` : `−${reasons[id].value} กก.`})
                              </option>
                            ))}
                        </select>
                        {r.deductionReasonId && (
                          <div className="row-deduct-detail">
                            {r.deductionReasonId === 'other' && (
                              <input
                                type="text"
                                className="cell-input-sm"
                                placeholder="ระบุเหตุผลเอง"
                                value={r.customReason || ''}
                                onChange={(e) => updateRow(r.id, 'customReason', e.target.value)}
                              />
                            )}
                            <input
                              type="text"
                              className="cell-input-sm"
                              inputMode="decimal"
                              placeholder="น้ำหนักที่หัก (กก.)"
                              value={r.deductionWeight || ''}
                              onChange={(e) => updateRow(r.id, 'deductionWeight', e.target.value)}
                            />
                            {rowDeductionWeight(r) > 0 && (
                              <div className="row-deduct-summary">
                                {rowWeight(r).toFixed(2)} − {rowDeductionWeight(r).toFixed(2)} = {rowNetWeight(r).toFixed(2)} กก.
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }} className="row-total">
                        {money(rowNetTotal(r))}
                      </td>
                      <td>
                        <div className="row-del" onClick={() => removeRow(r.id)} role="button" tabIndex={0}>
                          <IconTrash />
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-row">
                      ยังไม่มีรายการสินค้า — เลือกหมวดหมู่ด้านบนหรือกด “เพิ่มรายการสินค้า”
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <button type="button" className="add-row-btn" onClick={addBlankRow}>
              <IconPlus />
              เพิ่มรายการสินค้า
            </button>

            <div className="scale-card">
              <div className="scale-left">
                <div className="scale-icon">
                  <IconScale />
                </div>
                <div>
                  <div className="scale-label">น้ำหนักจากเครื่องชั่งดิจิทัล ({mainScale.name})</div>
                  <div className="scale-reading">
                    {scaleReading.toFixed(2)}
                    <span className="u">กก.</span>
                  </div>
                  <div className="scale-status">
                    <span className="scale-dot" style={{ background: mainScale.status === 'on' ? undefined : 'var(--ink-300)' }}></span>
                    {mainScale.status === 'on' ? 'เชื่อมต่อแล้ว' : 'ไม่ได้เชื่อมต่อ'} · พอร์ต {mainScale.port}
                  </div>
                </div>
              </div>
              <button type="button" className="btn-scale" onClick={pullWeight}>
                <IconRefresh />
                ดึงน้ำหนักเข้ารายการ (จำลอง)
              </button>
            </div>

            <div className="note-area">
              <label htmlFor="note">หมายเหตุรายการ</label>
              <textarea
                id="note"
                ref={noteRef}
                placeholder="เช่น สภาพสินค้า แหล่งที่มา หรือข้อตกลงพิเศษ..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ===== RIGHT: summary ===== */}
        <div className="summary-sticky">
          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconSplit />
              สรุปยอดรับซื้อ
            </div>

            <div className="sum-row">
              <span className="label">จำนวนรายการ</span>
              <span className="val">{rows.length} รายการ</span>
            </div>
            <div className="sum-row">
              <span className="label">น้ำหนักรวม</span>
              <span className="val">{totalWeight.toFixed(2)} กก.</span>
            </div>
            <hr className="sum-divider" />
            <div className="sum-row">
              <span className="label">ยอดรวมก่อนหัก</span>
              <span className="val">{money(subtotal)}</span>
            </div>
            <div className="sum-row">
              <button type="button" className="deduct-link" onClick={() => setShowDeduction((v) => !v)}>
                <IconPlus />
                หักน้ำหนัก/เหตุผล
              </button>
              <span className="val" style={{ color: '#C0392B' }}>
                −{totalDeductionWeight.toFixed(2)} กก.
              </span>
            </div>
            {showDeduction && (
              <div className="deduction-form">
                <select value={deductionReasonId} onChange={(e) => selectDeductionReason(e.target.value)}>
                  <option value="">เลือกเหตุผล...</option>
                  {reasonOrder
                    .filter((id) => reasons[id].active)
                    .map((id) => (
                      <option key={id} value={id}>
                        {reasons[id].name} ({reasons[id].type === 'percent' ? `−${reasons[id].value}%` : `−${reasons[id].value} กก.`})
                      </option>
                    ))}
                </select>
                {deductionReasonId === 'other' && (
                  <input
                    type="text"
                    placeholder="ระบุเหตุผลเอง"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                  />
                )}
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="น้ำหนักที่หัก (กก.)"
                  value={deductionWeight}
                  onChange={(e) => setDeductionWeight(e.target.value)}
                />
              </div>
            )}

            <div className="grand-total">
              <span className="label">ยอดสุทธิที่ต้องจ่าย</span>
              <span className="val">{money(grandTotal)}</span>
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
              <button type="button" className="btn btn-primary btn-block" onClick={handleSubmit}>
                <IconPrint />
                บันทึกและพิมพ์ใบเสร็จ
              </button>
              <button type="button" className="btn btn-ghost btn-block" onClick={handleSaveDraft}>
                <IconArchive />
                บันทึกไว้ก่อน
              </button>
              <div className="helper-note">
                <IconInfo />
                ระบบจะเพิ่มสต็อกสินค้าและบันทึกประวัติลูกค้าอัตโนมัติ
              </div>
            </div>
          </div>

          <div className="card mini-stat-card">
            <div className="mini-stat-title">
              <IconClockHistory />
              สรุปวันนี้
            </div>
            <div className="mini-stat-row">
              <span>รับซื้อแล้ว</span>
              <span className="n">{todayReceiptCount} ใบเสร็จ</span>
            </div>
            <div className="mini-stat-row">
              <span>น้ำหนักรวม</span>
              <span className="n">{todayWeightTotal.toLocaleString('th-TH')} กก.</span>
            </div>
            <div className="mini-stat-row">
              <span>ยอดจ่ายรวม</span>
              <span className="n">{money(todayMoneyTotal)}</span>
            </div>
            <div className="mini-stat-row">
              <span>รับซื้อด้วยเงินสด</span>
              <span className="n">{money(todayCashTotal)}</span>
            </div>
          </div>
        </div>
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
              <span>เลขที่ใบเสร็จ</span>
              <b>{printSnapshot.no}</b>
            </div>
            <div className="paper-meta">
              <span>วันที่</span>
              <b>{printSnapshot.date} · {printSnapshot.time}</b>
            </div>
            <div className="paper-meta">
              <span>ลูกค้า</span>
              <b>{printSnapshot.customerName}</b>
            </div>
            <div className="paper-meta">
              <span>ผู้ออกใบเสร็จ</span>
              <b>{printSnapshot.issuedBy}</b>
            </div>
            <hr className="paper-divider" />

            <div className="paper-items">
              {printSnapshot.items.map((it, i) => (
                <div className="paper-item" key={i}>
                  <div className="pn">
                    {it.name}
                    <span className="pw">
                      {it.rowDeductionWeight > 0 ? (
                        <>
                          {it.weight.toFixed(2)} − {it.rowDeductionWeight.toFixed(2)} = {it.netWeight.toFixed(2)} กก.
                          {it.rowDeductionLabel ? ` (${it.rowDeductionLabel})` : ''} × {money(it.price)}
                        </>
                      ) : (
                        <>
                          {it.weight.toFixed(2)} กก. × {money(it.price)}
                        </>
                      )}
                    </span>
                  </div>
                  <div className="pt">{money(it.total)}</div>
                </div>
              ))}
            </div>

            <div className="paper-meta">
              <span>น้ำหนักรวม</span>
              <b>{printSnapshot.totalWeight.toFixed(2)} กก.</b>
            </div>
            <div className="paper-meta">
              <span>หักน้ำหนัก/เหตุผล{printSnapshot.deductionLabel ? ` (${printSnapshot.deductionLabel})` : ''}</span>
              <b>−{printSnapshot.totalDeductionWeight.toFixed(2)} กก.</b>
            </div>

            <div className="paper-total-row">
              <span className="l">ยอดรวมสุทธิ</span>
              <span className="v">{money(printSnapshot.grandTotal)}</span>
            </div>
            <div className="paper-meta" style={{ marginTop: 8 }}>
              <span>วิธีจ่ายเงิน</span>
              <b>{PAY_LABELS[printSnapshot.payMethod]}</b>
            </div>
            {printSnapshot.note && (
              <div className="paper-meta" style={{ marginTop: 8 }}>
                <span>หมายเหตุ</span>
                <b>{printSnapshot.note}</b>
              </div>
            )}

            <div className="paper-barcode">
              {Array.from({ length: 18 }).map((_, i) => (
                <span key={i} style={{ height: 34, width: (i % 3) + 1 }}></span>
              ))}
            </div>
            <div className="paper-foot">
              {printSnapshot.no}
              <br />
              {settings.receiptFooter}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
