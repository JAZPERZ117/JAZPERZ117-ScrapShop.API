import { useMemo, useState } from 'react';
import { exportCsv } from '../lib/csvExport.js';
import {
  IconBox,
  IconX,
  IconTrendUp,
  IconTrendDown,
  IconArrowUpSmall,
  IconArrowDownSmall,
  IconMinus,
  IconCheck,
  IconDownload,
  IconPlus,
  IconEdit,
  IconTrash,
} from '../icons.jsx';
import RowMenu from '../components/RowMenu.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useCategories } from '../context/CategoriesContext.jsx';
import './Products.css';

const dirIcon = { up: IconArrowUpSmall, down: IconArrowDownSmall, flat: IconMinus };
const dirClass = { up: 'change-up', down: 'change-down', flat: 'change-flat' };
const dirColor = { up: '#1B7A4D', down: '#C0392B', flat: '#78857F' };

function makeSpark(values, color) {
  const w = 280,
    h = 54,
    pad = 4;
  const min = Math.min(...values),
    max = Math.max(...values);
  const range = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const areaPts = pts.join(' ') + ` ${(w - pad).toFixed(1)},${h} ${pad},${h}`;
  const last = pts[pts.length - 1].split(',');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="54" preserveAspectRatio="none">
      <polyline points={areaPts} fill={color} opacity="0.12" stroke="none" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3.2" fill={color} />
    </svg>
  );
}

function money(n) {
  return '฿' + (n || 0).toFixed(2);
}

function parseStockKg(stock) {
  return parseFloat(String(stock).replace(/[^\d.]/g, '')) || 0;
}

export default function Products() {
  const { products, setProducts, order, setOrder, updatePrice } = useProducts();
  const { categories } = useCategories();
  const categoryNames = Object.values(categories).map((c) => c.name);
  // New products can only be assigned to an active category — an inactive one is meant to
  // be hidden from category pickers ("แสดงในหน้ารับซื้อของและตัวกรองสินค้า" on Categories.jsx),
  // though an existing product already assigned to one keeps showing it in its own edit form
  // rather than being silently orphaned.
  const activeCategoryNames = Object.values(categories)
    .filter((c) => c.isActive)
    .map((c) => c.name);
  const [selectedId, setSelectedId] = useState(order[0]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [priceInput, setPriceInput] = useState(products[order[0]] ? products[order[0]].price.toFixed(2) : '0.00');
  const [stockInput, setStockInput] = useState(products[order[0]]?.stock || '');
  const [catInput, setCatInput] = useState(products[order[0]]?.cat || categoryNames[0] || 'อื่นๆ');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCat, setNewCat] = useState(activeCategoryNames[0] || 'อื่นๆ');
  const [banner, setBanner] = useState(null);

  const rows = useMemo(() => {
    return order.filter((id) => {
      const p = products[id];
      if (filter === 'active' && !p.active) return false;
      if (filter === 'inactive' && p.active) return false;
      const q = query.trim().toLowerCase();
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filter, query, products, order]);

  const p = products[selectedId];
  const DirIcon = p ? dirIcon[p.dir] : null;

  function parsePct(s) {
    // the app displays negative percentages with a Unicode minus sign (−), not ASCII "-"
    return parseFloat(String(s).replace(/−/g, '-').replace(/[^\d.-]/g, '')) || 0;
  }

  const totalStock = order.reduce((sum, id) => sum + parseStockKg(products[id].stock), 0);
  const upIds = order.filter((id) => products[id].dir === 'up');
  const downIds = order.filter((id) => products[id].dir === 'down');
  const avgUpPct = upIds.length ? upIds.reduce((s, id) => s + parsePct(products[id].change), 0) / upIds.length : 0;
  const avgDownPct = downIds.length ? downIds.reduce((s, id) => s + parsePct(products[id].change), 0) / downIds.length : 0;
  const activeCount = order.filter((id) => products[id].active).length;
  const categoryCount = new Set(order.map((id) => products[id].cat)).size;
  const topByPrice = [...order].sort((a, b) => products[b].price - products[a].price).slice(0, 3);

  function selectProduct(id) {
    setSelectedId(id);
    setPriceInput(products[id].price.toFixed(2));
    setStockInput(products[id].stock);
    setCatInput(products[id].cat);
  }

  function toggleActive(id) {
    setProducts((prev) => ({ ...prev, [id]: { ...prev[id], active: !prev[id].active } }));
  }

  function handleSave() {
    const parsed = parseFloat(priceInput);
    const newPrice = parsed || p.price;
    updatePrice(selectedId, newPrice);
    setProducts((prev) => ({
      ...prev,
      [selectedId]: { ...prev[selectedId], stock: stockInput, cat: catInput },
    }));
    // If the typed price didn't parse (or was 0), the real price silently stays unchanged —
    // reset the field back to it too, otherwise it keeps showing the rejected text forever
    // while the price hero/table above correctly still show the real, unchanged price.
    if (!parsed) setPriceInput(newPrice.toFixed(2));
    setBanner({ type: 'success', text: `บันทึกการเปลี่ยนแปลงของ ${p.name} เรียบร้อยแล้ว` });
  }

  function handleExport() {
    exportCsv(
      'products.csv',
      ['สินค้า', 'หมวดหมู่', 'ราคาล่าสุด', 'สต็อกคงเหลือ', 'สถานะ'],
      rows.map((id) => {
        const item = products[id];
        return [item.name, item.cat, item.price.toFixed(2), item.stock, item.active ? 'ใช้งาน' : 'ปิดใช้งาน'];
      })
    );
  }

  function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = `new_${Date.now()}`;
    const price = parseFloat(newPrice) || 0;
    const cat = newCat || activeCategoryNames[0] || 'อื่นๆ';
    setProducts((prev) => ({
      ...prev,
      [id]: {
        name: newName.trim(),
        cat,
        iconKey: 'box',
        bg: 'var(--bg)',
        fg: 'var(--ink-500)',
        price,
        change: '0.0%',
        dir: 'flat',
        stock: '0 กก.',
        stockPct: 0,
        active: true,
        spark: [price, price, price, price, price, price, price],
        hist: [],
      },
    }));
    setOrder((prev) => [id, ...prev]);
    setSelectedId(id);
    setPriceInput(price.toFixed(2));
    setStockInput('0 กก.');
    setCatInput(cat);
    setNewName('');
    setNewPrice('');
    setNewCat(activeCategoryNames[0] || 'อื่นๆ');
    setShowNew(false);
    setBanner({ type: 'success', text: `เพิ่มรายการสินค้า ${newName.trim()} เรียบร้อยแล้ว` });
  }

  function handleDelete(id = selectedId) {
    const target = products[id];
    if (!window.confirm(`ยืนยันลบรายการสินค้า "${target.name}"?`)) return;
    const remaining = order.filter((oid) => oid !== id);
    setOrder(remaining);
    setProducts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (id === selectedId && remaining[0]) selectProduct(remaining[0]);
    setBanner({ type: 'error', text: `ลบรายการสินค้า "${target.name}" แล้ว` });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            การทำงาน <span>›</span> <b>สินค้า/รายการรับซื้อ</b>
          </div>
          <h1 className="page-title">สินค้า/รายการรับซื้อ</h1>
          <div className="page-sub">จัดการรายการสินค้า ปรับราคารับซื้อ และติดตามสต็อกคงเหลือ</div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={handleExport}>
            <IconDownload />
            ส่งออก Excel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowNew((v) => !v)}>
            <IconPlus />
            เพิ่มรายการสินค้า
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

      {showNew && (
        <form className="inline-add-form" onSubmit={handleCreate}>
          <input className="input-plain" placeholder="ชื่อสินค้า" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <select className="input-plain" value={newCat} onChange={(e) => setNewCat(e.target.value)}>
            {activeCategoryNames.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <input className="input-plain" placeholder="ราคา (บาท/กก.)" inputMode="decimal" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
          <button type="submit" className="btn btn-primary">
            บันทึก
          </button>
        </form>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconBox />
          </div>
          <div>
            <div className="stat-label">รายการสินค้าทั้งหมด</div>
            <div className="stat-value">{order.length} รายการ</div>
            <div className="stat-foot">{categoryCount} หมวดหมู่ · ใช้งาน {activeCount}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconTrendUp />
          </div>
          <div>
            <div className="stat-label">ราคาปรับขึ้น</div>
            <div className="stat-value">{upIds.length} รายการ</div>
            <div className="stat-foot">เฉลี่ย +{avgUpPct.toFixed(1)}%</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}>
            <IconTrendDown />
          </div>
          <div>
            <div className="stat-label">ราคาปรับลง</div>
            <div className="stat-value">{downIds.length} รายการ</div>
            <div className="stat-foot">เฉลี่ย {avgDownPct.toFixed(1)}%</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--teal-bg, #E4F6F4)', color: 'var(--teal, #0E8E82)' }}>
            <IconBox />
          </div>
          <div>
            <div className="stat-label">สต็อกคงเหลือรวม</div>
            <div className="stat-value">{totalStock.toLocaleString('th-TH')} กก.</div>
            <div className="stat-foot">รอส่งขายต่อ</div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ '--detail-w': '350px' }}>
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">
                <IconBox />
                รายการสินค้า
              </div>
              <div className="card-sub">แตะที่รายการเพื่อแก้ไขราคาและดูแนวโน้ม</div>
            </div>
            <div className="filter-tabs">
              {[
                ['all', 'ทั้งหมด'],
                ['active', 'ใช้งาน'],
                ['inactive', 'ปิดใช้งาน'],
              ].map(([key, label]) => (
                <button key={key} type="button" className={`filter-tab${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="toolbar">
            <div className="search-box">
              <IconBox style={{ width: 16, height: 16 }} />
              <input placeholder="ค้นหาชื่อสินค้า" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="select-mini">ทุกหมวดหมู่</div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '26%' }}>สินค้า</th>
                <th style={{ width: '16%' }}>ราคาล่าสุด</th>
                <th style={{ width: '14%' }}>เทียบเมื่อวาน</th>
                <th style={{ width: '18%' }}>สต็อกคงเหลือ</th>
                <th style={{ width: '14%' }}>สถานะ</th>
                <th style={{ width: '4%' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((id) => {
                const item = products[id];
                const RowDir = dirIcon[item.dir];
                return (
                  <tr key={id} className={`clickable${id === selectedId ? ' selected-row' : ''}`} onClick={() => selectProduct(id)}>
                    <td>
                      <div className="row-cell">
                        <div className="row-icon" style={{ background: item.bg, color: item.fg }}>
                          <item.Icon />
                        </div>
                        <div>
                          <div className="row-name">{item.name}</div>
                          <div className="row-sub">{item.cat}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num-cell">{money(item.price)}</td>
                    <td>
                      <span className={`price-change ${dirClass[item.dir]}`}>
                        <RowDir />
                        {item.change}
                      </span>
                    </td>
                    <td>
                      <div className="bar-wrap">
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${item.stockPct}%` }}></div>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{item.stock}</span>
                      </div>
                    </td>
                    <td>
                      {item.active ? (
                        <span className="badge badge-green">
                          <IconCheck />
                          ใช้งาน
                        </span>
                      ) : (
                        <span className="badge badge-neutral">ปิดใช้งาน</span>
                      )}
                    </td>
                    <td>
                      <RowMenu
                        actions={[
                          { label: 'แก้ไข', icon: <IconEdit />, onClick: () => selectProduct(id) },
                          { label: 'ลบ', icon: <IconTrash />, danger: true, onClick: () => handleDelete(id) },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="table-foot">
            <span>แสดง {rows.length} จาก {order.length} รายการ</span>
          </div>
        </div>

        <div className="summary-sticky">
          {!p ? (
            <div className="card card-pad">
              <div className="empty-hint">ยังไม่มีรายการสินค้า — เพิ่มรายการใหม่เพื่อเริ่มต้น</div>
            </div>
          ) : (
          <div className="card card-pad">
            <div className="detail-head">
              <div className="detail-icon" style={{ background: p.bg, color: p.fg }}>
                <p.Icon />
              </div>
              <div>
                <div className="detail-name">{p.name}</div>
                <div className="detail-sub">หมวดหมู่ · {p.cat}</div>
              </div>
            </div>

            <div className="price-hero">
              <div className="price-hero-top">
                <div>
                  <div className="price-hero-label">ราคารับซื้อล่าสุด</div>
                  <div className="price-hero-val">
                    {money(p.price)} <span className="price-hero-unit">/ กก.</span>
                  </div>
                </div>
                <span className={`price-change ${dirClass[p.dir]}`}>
                  <DirIcon />
                  {p.change}
                </span>
              </div>
              <div className="sparkline-wrap">{makeSpark(p.spark, dirColor[p.dir])}</div>
            </div>

            <div className="field">
              <label>ราคารับซื้อ (บาท/กก.)</label>
              <input className="input-plain" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} onBlur={handleSave} />
            </div>

            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>หมวดหมู่</label>
                <select className="input-plain" value={catInput} onChange={(e) => setCatInput(e.target.value)}>
                  {categoryNames.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>สต็อกคงเหลือ</label>
                <input className="input-plain" value={stockInput} onChange={(e) => setStockInput(e.target.value)} />
              </div>
            </div>

            <div className="toggle-row">
              <div>
                <div className="lbl">เปิดใช้งานรายการนี้</div>
                <div className="sub">แสดงในหน้ารับซื้อของและปุ่มเพิ่มด่วน</div>
              </div>
              <button type="button" className={`switch${p.active ? ' on' : ''}`} onClick={() => toggleActive(selectedId)}></button>
            </div>

            <div className="hist-title">ประวัติราคา 7 วันล่าสุด</div>
            <div>
              {p.hist.length === 0 && <div className="empty-hint">ยังไม่มีประวัติราคา</div>}
              {p.hist.map((h) => (
                <div className="hist-row" key={h.d}>
                  <span className="dt">{h.d}</span>
                  <span className="pv">{h.v}</span>
                </div>
              ))}
            </div>

            <div className="submit-stack">
              <button type="button" className="btn btn-primary btn-block" onClick={handleSave}>
                <IconCheck />
                บันทึกการเปลี่ยนแปลง
              </button>
              <button type="button" className="btn btn-ghost btn-block" onClick={() => handleDelete()}>
                <IconBox />
                ลบรายการสินค้า
              </button>
            </div>
          </div>
          )}

          <div className="card mini-stat-card">
            <div className="mini-stat-title">
              <IconTrendUp />
              ราคาสูงสุด 3 อันดับ
            </div>
            {topByPrice.map((id) => (
              <div className="mini-stat-row" key={id}>
                <span>{products[id].name}</span>
                <span className="n">{money(products[id].price)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
