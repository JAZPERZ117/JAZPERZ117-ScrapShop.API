import { useMemo, useState } from 'react';
import { useDeliveries } from '../context/DeliveriesContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { exportCsv } from '../lib/csvExport.js';
import RowMenu from '../components/RowMenu.jsx';
import { IconTruck, IconPlus, IconTrash, IconX, IconCheck, IconPrint, IconDownload, IconClockHistory, IconEdit } from '../icons.jsx';
import './Deliveries.css';

let nextRowId = 1;

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseStockKg(stock) {
  return parseFloat(String(stock).replace(/[^\d.]/g, '')) || 0;
}
function formatThaiDate(iso) {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' });
}
function nowTimeStr() {
  return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}
function makeDeliveryNo() {
  return 'DO' + Date.now().toString().slice(-9);
}

const THAI_DIGIT_WORDS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const THAI_POSITION_WORDS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function thaiIntToWords(numStr) {
  if (numStr === '0') return '';
  let result = '';
  const len = numStr.length;
  for (let i = 0; i < len; i++) {
    const digit = parseInt(numStr[i], 10);
    const pos = len - i - 1;
    const posInMillion = pos % 6;
    if (digit === 0) continue;
    if (posInMillion === 1 && digit === 1) {
      result += 'สิบ';
    } else if (posInMillion === 1 && digit === 2) {
      result += 'ยี่สิบ';
    } else if (pos === 0 && digit === 1 && len > 1) {
      result += 'เอ็ด';
    } else {
      result += THAI_DIGIT_WORDS[digit] + THAI_POSITION_WORDS[posInMillion];
    }
    if (posInMillion === 0 && pos !== 0) {
      result += 'ล้าน';
    }
  }
  return result;
}

// Standard Thai tax-invoice "amount in words" line (บาทถ้วน format).
function bahtText(amount) {
  const rounded = Math.round((amount || 0) * 100) / 100;
  const baht = Math.floor(rounded);
  const satang = Math.round((rounded - baht) * 100);
  let text = (thaiIntToWords(String(baht)) || 'ศูนย์') + 'บาท';
  text += satang === 0 ? 'ถ้วน' : thaiIntToWords(String(satang)) + 'สตางค์';
  return text;
}

export default function Deliveries() {
  const { deliveries, setDeliveries, order, setOrder, addDelivery, markDelivered } = useDeliveries();
  const { products, order: productOrder, addStock, removeStock } = useProducts();
  const { settings } = useSettings();

  const [showForm, setShowForm] = useState(false);
  const [buyerName, setBuyerName] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [buyerContact, setBuyerContact] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [driver, setDriver] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState([]);
  const [banner, setBanner] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);

  // Only products with real stock on hand can go out on a delivery.
  const availableProductIds = productOrder.filter((id) => products[id].active && parseStockKg(products[id].stock) > 0);

  function addRow() {
    if (availableProductIds.length === 0) {
      setBanner({ type: 'error', text: 'ไม่มีสินค้าที่มีสต็อกคงเหลือให้เลือก' });
      return;
    }
    // Default to a product not already used by another row in this draft, when one exists,
    // so a new row doesn't silently start out competing with an existing row for the same
    // stock (the math is still correct either way — this just avoids the confusing default).
    const usedIds = new Set(rows.map((r) => r.productId));
    const nextId = availableProductIds.find((id) => !usedIds.has(id)) || availableProductIds[0];
    setRows((prev) => [...prev, { id: nextRowId++, productId: nextId, weight: '', price: '' }]);
  }
  function updateRow(id, field, value) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }
  function removeRow(id) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  // Rows earlier in the same draft that reference the same product (e.g. a second row left
  // on its default product) already claim some of the live stock, so this row's real ceiling
  // is live stock minus whatever those earlier rows already committed — otherwise two rows on
  // the same product could each independently claim the full stock and double it in the total.
  function rowMaxStock(r) {
    if (!r.productId) return 0;
    const idx = rows.indexOf(r);
    const claimedBySiblings = rows.slice(0, idx).reduce((sum, row) => (row.productId === r.productId ? sum + rowWeight(row) : sum), 0);
    return Math.max(parseStockKg(products[r.productId]?.stock) - claimedBySiblings, 0);
  }
  // Clamped so a delivery can never claim to ship more of a product than the shop actually
  // has on hand — this is what keeps "สต็อกคงเหลือ" on Products.jsx honest after removeStock.
  function rowWeight(r) {
    return Math.min(Math.max(parseFloat(r.weight) || 0, 0), rowMaxStock(r));
  }
  function rowAmount(r) {
    return rowWeight(r) * (parseFloat(r.price) || 0);
  }

  const totalWeight = useMemo(() => rows.reduce((s, r) => s + rowWeight(r), 0), [rows, products]);
  const totalAmount = useMemo(() => rows.reduce((s, r) => s + rowAmount(r), 0), [rows, products]);

  function resetForm() {
    setBuyerName('');
    setBuyerAddress('');
    setBuyerContact('');
    setVehicle('');
    setDriver('');
    setNote('');
    setRows([]);
    setShowForm(false);
  }

  function handleCancelForm() {
    if ((buyerName.trim() || rows.length > 0) && !window.confirm('ยืนยันยกเลิกใบส่งของนี้?')) return;
    resetForm();
  }

  function handleSubmit() {
    if (!buyerName.trim()) {
      setBanner({ type: 'error', text: 'กรุณากรอกชื่อผู้รับซื้อปลายทาง' });
      return;
    }
    const validRows = rows.filter((r) => r.productId && rowWeight(r) > 0);
    if (validRows.length === 0) {
      setBanner({ type: 'error', text: 'กรุณาเพิ่มรายการสินค้าและระบุน้ำหนักก่อนบันทึก' });
      return;
    }
    const no = makeDeliveryNo();
    const timeStr = nowTimeStr();
    const items = validRows.map((r) => ({
      name: products[r.productId].name,
      weight: rowWeight(r),
      price: parseFloat(r.price) || 0,
      amount: rowAmount(r),
    }));
    addDelivery({
      no,
      time: timeStr,
      buyerName: buyerName.trim(),
      buyerAddress: buyerAddress.trim(),
      buyerContact: buyerContact.trim(),
      vehicle: vehicle.trim(),
      driver: driver.trim(),
      note: note.trim(),
      items,
      totalWeight,
      totalAmount,
    });
    // Goods physically leave the shop once the delivery is dispatched, so stock drops now —
    // "ยืนยันส่งถึงแล้ว" afterwards only confirms arrival, it doesn't move any more stock.
    for (const r of validRows) {
      removeStock(r.productId, rowWeight(r));
    }
    setBanner({ type: 'success', text: `บันทึกใบส่งของ ${no} เรียบร้อยแล้ว น้ำหนักรวม ${totalWeight.toFixed(2)} กก.` });
    setSelectedId(no);
    resetForm();
    setTimeout(() => window.print(), 50);
  }

  function selectRow(id) {
    if (isEditing && id !== editForm?.id) setIsEditing(false);
    setSelectedId(id);
  }

  function startEditDelivery(id = selectedId) {
    const d = deliveries[id];
    if (!d) return;
    setSelectedId(id);
    setEditForm({
      id,
      buyerName: d.buyerName,
      buyerAddress: d.buyerAddress || '',
      buyerContact: d.buyerContact || '',
      vehicle: d.vehicle || '',
      driver: d.driver || '',
      note: d.note || '',
      originalItems: d.items,
      items: d.items.map((it) => ({
        rowId: nextRowId++,
        productId: productOrder.find((pid) => products[pid].name === it.name) || '',
        weight: String(it.weight),
        price: String(it.price),
      })),
    });
    setIsEditing(true);
  }

  function cancelEditDelivery() {
    setIsEditing(false);
    setEditForm(null);
  }

  function updateEditItem(rowId, field, value) {
    setEditForm((f) => ({ ...f, items: f.items.map((it) => (it.rowId === rowId ? { ...it, [field]: value } : it)) }));
  }
  function addEditItemRow() {
    if (availableProductIds.length === 0) {
      setBanner({ type: 'error', text: 'ไม่มีสินค้าที่มีสต็อกคงเหลือให้เลือก' });
      return;
    }
    const usedIds = new Set(editForm.items.map((it) => it.productId));
    const nextId = availableProductIds.find((id) => !usedIds.has(id)) || availableProductIds[0];
    setEditForm((f) => ({ ...f, items: [...f.items, { rowId: nextRowId++, productId: nextId, weight: '', price: '' }] }));
  }
  function removeEditItemRow(rowId) {
    setEditForm((f) => ({ ...f, items: f.items.filter((it) => it.rowId !== rowId) }));
  }

  // While editing, a row can use up to the product's current stock PLUS whatever this
  // delivery already committed to that same product — saving reverses the old commitment
  // before reapplying the new one, so that weight is genuinely still available to reuse.
  // As in the create form, earlier rows in the same edit draft that share a product already
  // claim part of that combined pool, so this row's ceiling must subtract their weight too.
  function editRowMax(row) {
    if (!row.productId || !editForm) return 0;
    const live = parseStockKg(products[row.productId]?.stock);
    const productName = products[row.productId]?.name;
    const reserved = editForm.originalItems.filter((it) => it.name === productName).reduce((s, it) => s + it.weight, 0);
    const idx = editForm.items.indexOf(row);
    const claimedBySiblings = editForm.items.slice(0, idx).reduce((sum, it) => (it.productId === row.productId ? sum + editRowWeight(it) : sum), 0);
    return Math.max(live + reserved - claimedBySiblings, 0);
  }
  function editRowWeight(row) {
    return Math.min(Math.max(parseFloat(row.weight) || 0, 0), editRowMax(row));
  }
  function editRowAmount(row) {
    return editRowWeight(row) * (parseFloat(row.price) || 0);
  }

  const editTotalWeight = isEditing ? editForm.items.reduce((s, r) => s + editRowWeight(r), 0) : 0;
  const editTotalAmount = isEditing ? editForm.items.reduce((s, r) => s + editRowAmount(r), 0) : 0;

  function saveEditDelivery() {
    if (!editForm.buyerName.trim()) {
      setBanner({ type: 'error', text: 'กรุณากรอกชื่อผู้รับซื้อปลายทาง' });
      return;
    }
    const validRows = editForm.items.filter((r) => r.productId && editRowWeight(r) > 0);
    if (validRows.length === 0) {
      setBanner({ type: 'error', text: 'กรุณาระบุรายการสินค้าอย่างน้อย 1 รายการพร้อมน้ำหนัก' });
      return;
    }
    const id = editForm.id;
    const original = deliveries[id];
    // Give back the delivery's old stock commitment, then take the edited amounts — correct
    // regardless of what changed (weights, products added/removed, or both at once).
    for (const it of editForm.originalItems) {
      addStock(it.name, it.weight);
    }
    const items = validRows.map((r) => ({
      name: products[r.productId].name,
      weight: editRowWeight(r),
      price: parseFloat(r.price) || 0,
      amount: editRowAmount(r),
    }));
    for (const r of validRows) {
      removeStock(r.productId, editRowWeight(r));
    }
    setDeliveries((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        buyerName: editForm.buyerName.trim(),
        buyerAddress: editForm.buyerAddress.trim(),
        buyerContact: editForm.buyerContact.trim(),
        vehicle: editForm.vehicle.trim(),
        driver: editForm.driver.trim(),
        note: editForm.note.trim(),
        items,
        totalWeight: editTotalWeight,
        totalAmount: editTotalAmount,
      },
    }));
    setBanner({ type: 'success', text: `บันทึกการแก้ไขใบส่งของ ${original.no} แล้ว` });
    setIsEditing(false);
    setEditForm(null);
  }

  function handleDeleteDelivery(id = selectedId) {
    const d = deliveries[id];
    if (!d) return;
    if (!window.confirm(`ยืนยันลบใบส่งของ "${d.no}"? ระบบจะคืนน้ำหนักสินค้ากลับเข้าสต็อกให้อัตโนมัติ`)) return;
    // The goods never actually left, so give the weight back to each product's stock.
    for (const it of d.items) {
      addStock(it.name, it.weight);
    }
    const remaining = order.filter((oid) => oid !== id);
    setOrder(remaining);
    setDeliveries((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (id === selectedId) setSelectedId(null);
    if (isEditing && editForm?.id === id) {
      setIsEditing(false);
      setEditForm(null);
    }
    setBanner({ type: 'error', text: `ลบใบส่งของ "${d.no}" แล้ว — คืนน้ำหนักสินค้ากลับเข้าสต็อกแล้ว` });
  }

  const rowsFiltered = useMemo(() => {
    return order.filter((id) => {
      if (filter === 'pending' && deliveries[id].status !== 'pending') return false;
      if (filter === 'delivered' && deliveries[id].status !== 'delivered') return false;
      return true;
    });
  }, [order, deliveries, filter]);

  const pendingCount = order.filter((id) => deliveries[id].status === 'pending').length;
  const deliveredCount = order.length - pendingCount;
  const totalWeightShipped = order.reduce((s, id) => s + (deliveries[id].totalWeight || 0), 0);
  const totalAmountShipped = order.reduce((s, id) => s + (deliveries[id].totalAmount || 0), 0);

  const selected = selectedId ? deliveries[selectedId] : null;
  // Thai tax invoices show VAT as a separate line on top of item prices (which are treated
  // as VAT-exclusive) — this shop already tracks a real เลขผู้เสียภาษี in Settings, so this
  // is a genuine calculation, not decoration.
  const invSubtotal = selected?.totalAmount || 0;
  const invVat = invSubtotal * 0.07;
  const invNetTotal = invSubtotal + invVat;

  function handleExport() {
    exportCsv(
      'deliveries.csv',
      ['เลขที่ใบส่งของ', 'วันที่', 'ผู้รับซื้อปลายทาง', 'น้ำหนักรวม', 'มูลค่ารวม', 'สถานะ'],
      order.map((id) => {
        const d = deliveries[id];
        return [d.no, d.date, d.buyerName, `${d.totalWeight.toFixed(2)} กก.`, d.totalAmount.toFixed(2), d.status === 'delivered' ? 'ส่งถึงแล้ว' : 'รอส่งถึง'];
      })
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            การทำงาน <span>›</span> <b>ใบส่งสินค้า</b>
          </div>
          <h1 className="page-title">ใบส่งสินค้า</h1>
          <div className="page-sub">บันทึกการส่งวัสดุที่รับซื้อสะสมไว้ ออกไปยังโรงงาน/พ่อค้าคนกลาง</div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={handleExport}>
            <IconDownload />
            ส่งออก Excel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            <IconPlus />
            ออกใบส่งของใหม่
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

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconTruck />
          </div>
          <div>
            <div className="stat-label">ใบส่งของทั้งหมด</div>
            <div className="stat-value">{order.length} ใบ</div>
            <div className="stat-foot">น้ำหนักรวม {totalWeightShipped.toLocaleString('th-TH')} กก.</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <IconClockHistory />
          </div>
          <div>
            <div className="stat-label">รอส่งถึง</div>
            <div className="stat-value">{pendingCount} ใบ</div>
            <div className="stat-foot">ยังไม่ยืนยันส่งถึงปลายทาง</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconCheck />
          </div>
          <div>
            <div className="stat-label">ส่งถึงแล้ว</div>
            <div className="stat-value">{deliveredCount} ใบ</div>
            <div className="stat-foot">ยืนยันรับของแล้ว</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--teal-bg, #E4F6F4)', color: 'var(--teal, #0E8E82)' }}>
            <IconTruck />
          </div>
          <div>
            <div className="stat-label">มูลค่ารวม</div>
            <div className="stat-value">{money(totalAmountShipped)}</div>
            <div className="stat-foot">จากใบส่งของทั้งหมด</div>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="card card-pad section-gap">
          <div className="card-head">
            <div className="card-title">
              <IconTruck />
              ออกใบส่งของใหม่
            </div>
          </div>

          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>ผู้รับซื้อปลายทาง</label>
              <input className="input-plain" placeholder="เช่น โรงงานรีไซเคิล ก.รุ่งเรือง" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>เบอร์ติดต่อ (ไม่บังคับ)</label>
              <input className="input-plain" value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>ที่อยู่ผู้รับซื้อปลายทาง (ไม่บังคับ)</label>
            <input className="input-plain" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 1 }}>
              <label>ทะเบียนรถ (ไม่บังคับ)</label>
              <input className="input-plain" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>คนขับ (ไม่บังคับ)</label>
              <input className="input-plain" value={driver} onChange={(e) => setDriver(e.target.value)} />
            </div>
          </div>

          <table className="item-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>สินค้า</th>
                <th style={{ width: '20%' }}>น้ำหนัก</th>
                <th style={{ width: '20%' }}>ราคา/กก. (ไม่บังคับ)</th>
                <th style={{ width: '24%', textAlign: 'right' }}>ยอดรวม</th>
                <th style={{ width: '6%' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const max = rowMaxStock(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <select className="cell-select" value={r.productId || ''} onChange={(e) => updateRow(r.id, 'productId', e.target.value)}>
                        {availableProductIds.map((id) => (
                          <option key={id} value={id}>
                            {products[id].name} (มี {products[id].stock})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="cell-input" inputMode="decimal" value={r.weight} onChange={(e) => updateRow(r.id, 'weight', e.target.value)} />
                      <span className="unit">/ {max.toLocaleString('th-TH')} กก.</span>
                    </td>
                    <td>
                      <input className="cell-input" inputMode="decimal" value={r.price} onChange={(e) => updateRow(r.id, 'price', e.target.value)} />
                      <span className="unit">฿</span>
                    </td>
                    <td style={{ textAlign: 'right' }} className="row-total">
                      {money(rowAmount(r))}
                    </td>
                    <td>
                      <div className="row-del" onClick={() => removeRow(r.id)} role="button" tabIndex={0}>
                        <IconTrash />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-row">
                    ยังไม่มีรายการสินค้า — กด "เพิ่มรายการสินค้า"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <button type="button" className="add-row-btn" onClick={addRow}>
            <IconPlus />
            เพิ่มรายการสินค้า
          </button>

          <div className="field" style={{ marginTop: 14 }}>
            <label>หมายเหตุ</label>
            <input className="input-plain" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="delivery-form-total">
            <span>น้ำหนักรวม {totalWeight.toFixed(2)} กก.</span>
            <b>{money(totalAmount)}</b>
          </div>

          <div className="submit-stack">
            <button type="button" className="btn btn-primary btn-block" onClick={handleSubmit}>
              <IconPrint />
              บันทึกและพิมพ์ใบส่งของ
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={handleCancelForm}>
              <IconX />
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      <div className="grid" style={{ '--detail-w': '340px' }}>
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">
                <IconTruck />
                ประวัติการส่งของ
              </div>
              <div className="card-sub">แตะที่รายการเพื่อดูใบส่งของ</div>
            </div>
            <div className="filter-tabs">
              {[
                ['all', 'ทั้งหมด'],
                ['pending', 'รอส่งถึง'],
                ['delivered', 'ส่งถึงแล้ว'],
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
                <th style={{ width: '18%' }}>เลขที่</th>
                <th style={{ width: '28%' }}>ผู้รับซื้อปลายทาง</th>
                <th style={{ width: '16%' }}>น้ำหนักรวม</th>
                <th style={{ width: '18%' }}>มูลค่ารวม</th>
                <th style={{ width: '14%' }}>สถานะ</th>
                <th style={{ width: '6%' }}></th>
              </tr>
            </thead>
            <tbody>
              {rowsFiltered.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-hint">
                    ยังไม่มีรายการส่งของ — กด "ออกใบส่งของใหม่" เพื่อเริ่มต้น
                  </td>
                </tr>
              )}
              {rowsFiltered.map((id) => {
                const d = deliveries[id];
                return (
                  <tr key={id} className={`clickable${id === selectedId ? ' selected-row' : ''}`} onClick={() => selectRow(id)}>
                    <td>
                      <div className="rc-no">{d.no}</div>
                      <div className="rc-time">
                        {formatThaiDate(d.date)} · {d.time}
                      </div>
                    </td>
                    <td>{d.buyerName}</td>
                    <td className="num-cell">{d.totalWeight.toFixed(2)} กก.</td>
                    <td className="num-cell">{money(d.totalAmount)}</td>
                    <td>
                      {d.status === 'delivered' ? (
                        <span className="badge badge-green">
                          <IconCheck />
                          ส่งถึงแล้ว
                        </span>
                      ) : (
                        <span className="badge badge-neutral">รอส่งถึง</span>
                      )}
                    </td>
                    <td>
                      <RowMenu
                        actions={[
                          { label: 'ดูใบส่งของ', icon: <IconTruck />, onClick: () => selectRow(id) },
                          { label: 'แก้ไข', icon: <IconEdit />, onClick: () => startEditDelivery(id) },
                          ...(d.status === 'pending' ? [{ label: 'ยืนยันส่งถึงแล้ว', icon: <IconCheck />, onClick: () => markDelivered(id) }] : []),
                          { label: 'ลบ', icon: <IconTrash />, danger: true, onClick: () => handleDeleteDelivery(id) },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="summary-sticky">
          {!selected ? (
            <div className="card card-pad">
              <div className="empty-hint">เลือกใบส่งของจากรายการเพื่อดูรายละเอียด</div>
            </div>
          ) : (
            <div className="receipt-shell">
              <div className="receipt-shell-head">
                <div className="receipt-title-row">
                  <div className="card-title">
                    <IconTruck />
                    {isEditing ? `แก้ไขใบส่งของ ${selected.no}` : 'ใบส่งของ'}
                  </div>
                  {!isEditing &&
                    (selected.status === 'delivered' ? (
                      <span className="badge badge-green">
                        <IconCheck />
                        ส่งถึงแล้ว
                      </span>
                    ) : (
                      <span className="badge badge-neutral">รอส่งถึง</span>
                    ))}
                </div>
              </div>

              {isEditing ? (
                <div className="paper edit-mode">
                  <div className="field">
                    <label>ผู้รับซื้อปลายทาง</label>
                    <input className="input-plain" value={editForm.buyerName} onChange={(e) => setEditForm((f) => ({ ...f, buyerName: e.target.value }))} />
                  </div>
                  <div className="field-row">
                    <div className="field" style={{ flex: 1 }}>
                      <label>เบอร์ติดต่อ</label>
                      <input className="input-plain" value={editForm.buyerContact} onChange={(e) => setEditForm((f) => ({ ...f, buyerContact: e.target.value }))} />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label>ทะเบียนรถ</label>
                      <input className="input-plain" value={editForm.vehicle} onChange={(e) => setEditForm((f) => ({ ...f, vehicle: e.target.value }))} />
                    </div>
                  </div>
                  <div className="field">
                    <label>ที่อยู่ผู้รับซื้อปลายทาง</label>
                    <input className="input-plain" value={editForm.buyerAddress} onChange={(e) => setEditForm((f) => ({ ...f, buyerAddress: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>คนขับ</label>
                    <input className="input-plain" value={editForm.driver} onChange={(e) => setEditForm((f) => ({ ...f, driver: e.target.value }))} />
                  </div>

                  <div className="field">
                    <label>รายการสินค้า</label>
                    {editForm.items.map((r) => {
                      const max = editRowMax(r);
                      return (
                        <div className="edit-item-row" key={r.rowId}>
                          <select className="cell-select" value={r.productId} onChange={(e) => updateEditItem(r.rowId, 'productId', e.target.value)}>
                            {!availableProductIds.includes(r.productId) && r.productId && (
                              <option value={r.productId}>{products[r.productId]?.name || '(ไม่พบสินค้านี้แล้ว)'}</option>
                            )}
                            {availableProductIds.map((id) => (
                              <option key={id} value={id}>
                                {products[id].name} (มี {products[id].stock})
                              </option>
                            ))}
                          </select>
                          <div className="edit-item-sub">
                            <input className="input-plain" inputMode="decimal" placeholder="น้ำหนัก กก." value={r.weight} onChange={(e) => updateEditItem(r.rowId, 'weight', e.target.value)} />
                            <input className="input-plain" inputMode="decimal" placeholder="ราคา/กก." value={r.price} onChange={(e) => updateEditItem(r.rowId, 'price', e.target.value)} />
                            <button type="button" className="edit-item-remove" onClick={() => removeEditItemRow(r.rowId)} disabled={editForm.items.length <= 1} title="ลบรายการนี้">
                              <IconTrash />
                            </button>
                          </div>
                          <div className="unit">สูงสุด {max.toLocaleString('th-TH')} กก.</div>
                        </div>
                      );
                    })}
                    <button type="button" className="btn btn-ghost btn-block" onClick={addEditItemRow}>
                      <IconPlus />
                      เพิ่มรายการ
                    </button>
                  </div>

                  <div className="field">
                    <label>หมายเหตุ</label>
                    <input className="input-plain" value={editForm.note} onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))} />
                  </div>

                  <div className="paper-meta">
                    <span>น้ำหนักรวม</span>
                    <b>{editTotalWeight.toFixed(2)} กก.</b>
                  </div>
                  <div className="paper-total-row">
                    <span className="l">มูลค่ารวม (คำนวณใหม่)</span>
                    <span className="v">{money(editTotalAmount)}</span>
                  </div>
                </div>
              ) : (
                <div className="paper delivery-screen-preview">
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
                    <span>เลขที่ใบส่งของ</span>
                    <b>{selected.no}</b>
                  </div>
                  <div className="paper-meta">
                    <span>วันที่</span>
                    <b>{formatThaiDate(selected.date)} · {selected.time}</b>
                  </div>
                  <div className="paper-meta">
                    <span>ผู้รับซื้อปลายทาง</span>
                    <b>{selected.buyerName}</b>
                  </div>
                  {selected.buyerContact && (
                    <div className="paper-meta">
                      <span>เบอร์ติดต่อ</span>
                      <b>{selected.buyerContact}</b>
                    </div>
                  )}
                  {selected.vehicle && (
                    <div className="paper-meta">
                      <span>ทะเบียนรถ</span>
                      <b>{selected.vehicle}</b>
                    </div>
                  )}
                  {selected.driver && (
                    <div className="paper-meta">
                      <span>คนขับ</span>
                      <b>{selected.driver}</b>
                    </div>
                  )}
                  <hr className="paper-divider" />
                  <div className="paper-items">
                    {selected.items.map((it, i) => (
                      <div className="paper-item" key={i}>
                        <div className="pn">
                          {it.name}
                          <span className="pw">{it.weight.toFixed(2)} กก. × {money(it.price)}</span>
                        </div>
                        <div className="pt">{money(it.amount)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="paper-meta">
                    <span>น้ำหนักรวม</span>
                    <b>{selected.totalWeight.toFixed(2)} กก.</b>
                  </div>
                  <div className="paper-total-row">
                    <span className="l">มูลค่ารวม</span>
                    <span className="v">{money(selected.totalAmount)}</span>
                  </div>
                  {selected.note && (
                    <div className="paper-meta" style={{ marginTop: 8 }}>
                      <span>หมายเหตุ</span>
                      <b>{selected.note}</b>
                    </div>
                  )}
                  <div className="paper-foot">{selected.no}</div>
                </div>
              )}

              {isEditing ? (
                <div className="receipt-actions">
                  <button type="button" className="btn btn-primary btn-block" onClick={saveEditDelivery}>
                    <IconCheck />
                    บันทึกการแก้ไข
                  </button>
                  <button type="button" className="btn btn-ghost btn-block" onClick={cancelEditDelivery}>
                    <IconX />
                    ยกเลิกการแก้ไข
                  </button>
                </div>
              ) : (
                <div className="receipt-actions">
                  <button type="button" className="btn btn-primary btn-block" onClick={() => window.print()}>
                    <IconPrint />
                    พิมพ์ใบส่งของ
                  </button>
                  <div className="action-row">
                    <button type="button" className="btn btn-ghost" onClick={() => startEditDelivery()}>
                      <IconEdit />
                      แก้ไข
                    </button>
                    {selected.status === 'pending' && (
                      <button type="button" className="btn btn-ghost" onClick={() => markDelivered(selectedId)}>
                        <IconCheck />
                        ยืนยันส่งถึงแล้ว
                      </button>
                    )}
                  </div>
                  <button type="button" className="btn btn-danger-ghost btn-block" onClick={() => handleDeleteDelivery()}>
                    <IconTrash />
                    ลบใบส่งของนี้
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="hidden-until-print">
          <div className="a4-doc">
            <div className="inv-head">
              <div className="inv-head-left">
                <div className="inv-logo">
                  <IconTruck />
                </div>
                <div>
                  <div className="inv-company-name">{settings.shopName}</div>
                  <div className="inv-company-addr">{settings.address}</div>
                  <div className="inv-company-contact">โทร. {settings.phone}</div>
                </div>
              </div>
              <div className="inv-head-right">
                <div className="inv-doc-badge">ใบส่งสินค้า/ใบกำกับภาษี</div>
                <div className="inv-doc-copy">ต้นฉบับ</div>
                <div className="inv-taxid-row">
                  <span>เลขผู้เสียภาษี</span>
                  <b>{settings.taxId}</b>
                </div>
              </div>
            </div>

            <div className="inv-meta-box">
              <div className="inv-meta-col">
                <div className="inv-meta-label">ลูกค้า</div>
                <div className="inv-meta-value">{selected.buyerName}</div>
                {selected.buyerAddress && <div className="inv-meta-sub">{selected.buyerAddress}</div>}
                {selected.buyerContact && <div className="inv-meta-sub">โทร. {selected.buyerContact}</div>}
              </div>
              <div className="inv-meta-col inv-meta-col-right">
                <div className="inv-meta-row">
                  <span>เลขที่</span>
                  <b>{selected.no}</b>
                </div>
                <div className="inv-meta-row">
                  <span>วันที่</span>
                  <b>{formatThaiDate(selected.date)}</b>
                </div>
                {selected.vehicle && (
                  <div className="inv-meta-row">
                    <span>ทะเบียนรถ</span>
                    <b>{selected.vehicle}</b>
                  </div>
                )}
                {selected.driver && (
                  <div className="inv-meta-row">
                    <span>คนขับ</span>
                    <b>{selected.driver}</b>
                  </div>
                )}
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th style={{ width: '8%' }}>ลำดับ</th>
                  <th style={{ width: '42%' }}>รายการ</th>
                  <th className="num" style={{ width: '17%' }}>น้ำหนัก (กก.)</th>
                  <th className="num" style={{ width: '15%' }}>ราคา/กก.</th>
                  <th className="num" style={{ width: '18%' }}>จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {selected.items.map((it, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{it.name}</td>
                    <td className="num">{it.weight.toFixed(2)}</td>
                    <td className="num">{money(it.price)}</td>
                    <td className="num">{money(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="inv-bottom">
              <div>
                {selected.note && (
                  <div className="inv-note">
                    <span>หมายเหตุ:</span> {selected.note}
                  </div>
                )}
                <div className="inv-words-box">({bahtText(invNetTotal)})</div>
              </div>
              <div className="inv-totals a4-doc-summary">
                <div className="a4-doc-sum-row">
                  <span>รวม</span>
                  <b>{money(invSubtotal)}</b>
                </div>
                <div className="a4-doc-sum-row">
                  <span>ภาษีมูลค่าเพิ่ม 7%</span>
                  <b>{money(invVat)}</b>
                </div>
                <div className="a4-doc-grand">
                  <span>สุทธิ</span>
                  <span>{money(invNetTotal)}</span>
                </div>
              </div>
            </div>

            <div className="inv-sign-row">
              <div className="inv-sign-box">
                <div>ผู้รับสินค้า</div>
                <div className="inv-sign-line"></div>
                <div className="inv-sign-date">วันที่ ...............................</div>
              </div>
              <div className="inv-sign-box">
                <div>ผู้ส่งสินค้า</div>
                <div className="inv-sign-line"></div>
                <div className="inv-sign-date">วันที่ ...............................</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
