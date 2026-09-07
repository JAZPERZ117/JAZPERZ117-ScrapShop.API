import { useMemo, useState } from 'react';
import { IconCategory, IconSort, IconPlus, IconCheck, IconBottle, IconX } from '../icons.jsx';
import { useCategories, SWATCHES, SWATCH_COLOR } from '../context/CategoriesContext.jsx';
import { useProducts } from '../context/ProductsContext.jsx';
import { useReceipts } from '../context/ReceiptsContext.jsx';
import './Categories.css';

function parseStockKg(stock) {
  return parseFloat(String(stock).replace(/[^\d.]/g, '')) || 0;
}

function parseMoney(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Categories() {
  const { categories, setCategoriesRaw, order, setOrder } = useCategories();
  const { products, setProducts } = useProducts();
  const { receipts } = useReceipts();
  const [selectedId, setSelectedId] = useState(order[0]);
  const [swatch, setSwatch] = useState(categories[order[0]]?.color || 'slate');
  const [editName, setEditName] = useState(categories[order[0]]?.name || '');
  const [editDesc, setEditDesc] = useState(categories[order[0]]?.desc || '');
  const [sortAsc, setSortAsc] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [banner, setBanner] = useState(null);

  const c = categories[selectedId];

  // All per-category numbers below are derived live from real Products/Receipts data
  // instead of hardcoded figures, so they stay correct after any add/edit/delete.
  const productIds = Object.keys(products);
  const revenueByCategory = useMemo(() => {
    const byName = {};
    for (const id of Object.values(receipts)) {
      if (id.status === 'void') continue;
      for (const it of id.items || []) {
        byName[it.n] = (byName[it.n] || 0) + parseMoney(it.t);
      }
    }
    const out = {};
    for (const pid of productIds) {
      const p = products[pid];
      out[p.cat] = (out[p.cat] || 0) + (byName[p.name] || 0);
    }
    return out;
  }, [receipts, products]);

  const categoryStats = useMemo(() => {
    const out = {};
    for (const id in categories) {
      const catName = categories[id].name;
      const items = productIds.filter((pid) => products[pid].cat === catName).map((pid) => products[pid]);
      const stock = items.reduce((sum, it) => sum + parseStockKg(it.stock), 0);
      const activeCount = items.filter((it) => it.active).length;
      const prices = items.map((it) => it.price);
      out[id] = {
        items,
        count: items.length,
        stock,
        activeCount,
        range: prices.length ? (Math.min(...prices) === Math.max(...prices) ? money(prices[0]) : `฿${Math.min(...prices).toFixed(0)} – ${Math.max(...prices).toFixed(0)}`) : '—',
        revenue: revenueByCategory[catName] || 0,
      };
    }
    return out;
  }, [categories, products, revenueByCategory]);

  const totalItems = productIds.length;
  const totalStock = productIds.reduce((sum, pid) => sum + parseStockKg(products[pid].stock), 0);
  const topCategoryId = order.reduce((best, id) => (!best || categoryStats[id]?.revenue > categoryStats[best]?.revenue ? id : best), null);
  const topCategories = [...order].sort((a, b) => (categoryStats[b]?.revenue || 0) - (categoryStats[a]?.revenue || 0)).slice(0, 3);

  function select(id) {
    setSelectedId(id);
    setSwatch(categories[id].color);
    setEditName(categories[id].name);
    setEditDesc(categories[id].desc);
  }

  function toggleActive() {
    setCategoriesRaw((prev) => ({ ...prev, [selectedId]: { ...prev[selectedId], isActive: !prev[selectedId].isActive } }));
  }

  function handleSort() {
    const next = [...order].sort((a, b) => (sortAsc ? categories[a].name.localeCompare(categories[b].name, 'th') : categories[b].name.localeCompare(categories[a].name, 'th')));
    setOrder(next);
    setSortAsc((v) => !v);
    setBanner({ type: 'success', text: `เรียงลำดับหมวดหมู่ตามชื่อ ${sortAsc ? 'ก-ฮ' : 'ฮ-ก'} แล้ว` });
  }

  function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = `cat_${Date.now()}`;
    setCategoriesRaw((prev) => ({ ...prev, [id]: { name: newName.trim(), iconKey: 'other', color: 'slate', desc: newDesc.trim(), isActive: true } }));
    setOrder((prev) => [id, ...prev]);
    setSelectedId(id);
    setSwatch('slate');
    setEditName(newName.trim());
    setEditDesc(newDesc.trim());
    setNewName('');
    setNewDesc('');
    setShowNew(false);
    setBanner({ type: 'success', text: `เพิ่มหมวดหมู่ ${newName.trim()} เรียบร้อยแล้ว` });
  }

  function handleSave() {
    const nextName = editName.trim() || c.name;
    const prevName = c.name;
    setCategoriesRaw((prev) => ({ ...prev, [selectedId]: { ...prev[selectedId], name: nextName, desc: editDesc, color: swatch } }));
    // Products reference their category by name, not id (see ProductsContext.jsx) — without
    // this, renaming a category would silently orphan every product already assigned to it:
    // they'd keep the old name string and drop out of this category everywhere it's grouped.
    if (nextName !== prevName) {
      setProducts((prev) => {
        let changed = false;
        const next = {};
        for (const id in prev) {
          if (prev[id].cat === prevName) {
            changed = true;
            next[id] = { ...prev[id], cat: nextName };
          } else {
            next[id] = prev[id];
          }
        }
        return changed ? next : prev;
      });
    }
    setBanner({ type: 'success', text: `บันทึกการเปลี่ยนแปลงของหมวดหมู่ "${nextName}" แล้ว` });
  }

  function handleDelete() {
    if (order.length <= 1) {
      setBanner({ type: 'error', text: 'ต้องมีหมวดหมู่อย่างน้อย 1 รายการ ไม่สามารถลบหมวดหมู่สุดท้ายได้' });
      return;
    }
    if (!window.confirm(`ยืนยันลบหมวดหมู่ "${c.name}"?`)) return;
    const remaining = order.filter((id) => id !== selectedId);
    const deletedName = c.name;
    // Same reason handleSave cascades a rename to every product referencing this category by
    // name: without reassigning them here too, deleting a category would silently orphan its
    // products (they'd keep pointing at a name that no longer exists in any category). Falls
    // back to "อื่นๆ" if it's still around, otherwise the first remaining category.
    const fallbackName = categories[remaining.find((id) => categories[id].name === 'อื่นๆ')]?.name || categories[remaining[0]]?.name;
    let movedCount = 0;
    setProducts((prev) => {
      const next = {};
      for (const id in prev) {
        if (prev[id].cat === deletedName) {
          movedCount++;
          next[id] = { ...prev[id], cat: fallbackName };
        } else {
          next[id] = prev[id];
        }
      }
      return movedCount ? next : prev;
    });
    setOrder(remaining);
    setCategoriesRaw((prev) => {
      const next = { ...prev };
      delete next[selectedId];
      return next;
    });
    if (remaining[0]) select(remaining[0]);
    setBanner({
      type: 'error',
      text: movedCount
        ? `ลบหมวดหมู่ "${deletedName}" แล้ว — ย้ายสินค้า ${movedCount} รายการไปยัง "${fallbackName}" แล้ว`
        : `ลบหมวดหมู่ "${deletedName}" แล้ว`,
    });
  }

  if (!c) {
    return (
      <div className="page-head">
        <div>
          <div className="crumb">
            การทำงาน <span>›</span> <b>หมวดหมู่สินค้า</b>
          </div>
          <h1 className="page-title">หมวดหมู่สินค้า</h1>
          <div className="page-sub">ยังไม่มีหมวดหมู่สินค้า — เพิ่มหมวดหมู่แรกเพื่อเริ่มต้น</div>
        </div>
      </div>
    );
  }
  const stats = categoryStats[selectedId];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            การทำงาน <span>›</span> <b>หมวดหมู่สินค้า</b>
          </div>
          <h1 className="page-title">หมวดหมู่สินค้า</h1>
          <div className="page-sub">จัดกลุ่มรายการรับซื้อของเก่าให้ค้นหาและตั้งราคาได้ง่ายขึ้น</div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={handleSort}>
            <IconSort />
            จัดเรียงลำดับ
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowNew((v) => !v)}>
            <IconPlus />
            เพิ่มหมวดหมู่
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
          <input className="input-plain" placeholder="ชื่อหมวดหมู่" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <input className="input-plain" placeholder="คำอธิบาย (ไม่บังคับ)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          <button type="submit" className="btn btn-primary">
            บันทึก
          </button>
        </form>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--bg)', color: 'var(--ink-500)' }}>
            <IconCategory />
          </div>
          <div>
            <div className="stat-label">หมวดหมู่ทั้งหมด</div>
            <div className="stat-value">{order.length} หมวดหมู่</div>
            <div className="stat-foot">ใช้งาน {order.filter((id) => categories[id].isActive).length} · ปิดใช้งาน {order.filter((id) => !categories[id].isActive).length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconBottle />
          </div>
          <div>
            <div className="stat-label">รายการสินค้ารวม</div>
            <div className="stat-value">{totalItems} รายการ</div>
            <div className="stat-foot">เฉลี่ย {order.length ? (totalItems / order.length).toFixed(1) : 0} รายการ/หมวด</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconCheck />
          </div>
          <div>
            <div className="stat-label">หมวดยอดนิยม</div>
            <div className="stat-value">{topCategoryId ? categories[topCategoryId].name : '—'}</div>
            <div className="stat-foot">{money(topCategoryId ? categoryStats[topCategoryId].revenue : 0)} สะสม</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--teal-bg, #E4F6F4)', color: 'var(--teal, #0E8E82)' }}>
            <IconBottle />
          </div>
          <div>
            <div className="stat-label">สต็อกคงเหลือรวม</div>
            <div className="stat-value">{totalStock.toLocaleString('th-TH')} กก.</div>
            <div className="stat-foot">ทุกหมวดหมู่</div>
          </div>
        </div>
      </div>

      <div className="layout">
        <div>
          <div className="card card-pad section-gap">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <IconCategory />
                  หมวดหมู่ทั้งหมด
                </div>
                <div className="card-sub">แตะการ์ดเพื่อดูรายการสินค้าในหมวดหมู่นั้น</div>
              </div>
            </div>

            <div className="cat-grid">
              {order.map((id) => {
                const cat = categories[id];
                const st = categoryStats[id];
                return (
                  <div key={id} className={`cat-card${id === selectedId ? ' selected' : ''}`} onClick={() => select(id)} role="button" tabIndex={0}>
                    <div className="cat-card-top">
                      <div className="cat-icon" style={{ background: cat.bg, color: cat.fg }}>
                        <cat.Icon />
                      </div>
                      {!cat.isActive && <span className="cat-off-tag">ปิดใช้งาน</span>}
                    </div>
                    <div className="cat-name">{cat.name}</div>
                    <div className="cat-count">{st.count} รายการสินค้า</div>
                    <div className="cat-meta-row">
                      <span>สต็อก</span>
                      <b>{st.stock.toLocaleString('th-TH')} กก.</b>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <IconBottle />
                  รายการในหมวดหมู่ <span style={{ color: 'var(--green-700)' }}>"{c.name}"</span>
                </div>
                <div className="card-sub">สินค้าทั้งหมดที่อยู่ในหมวดหมู่นี้</div>
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>สินค้า</th>
                  <th style={{ width: '20%' }}>ราคา/กก.</th>
                  <th style={{ width: '25%' }}>สต็อกคงเหลือ</th>
                  <th style={{ width: '15%' }}>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {stats.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty-hint">
                      ยังไม่มีสินค้าในหมวดหมู่นี้ — ไปเพิ่มที่หน้า "สินค้า/รายการรับซื้อ"
                    </td>
                  </tr>
                )}
                {stats.items.map((it) => (
                  <tr key={it.name}>
                    <td>
                      <div className="row-cell">
                        <div className="row-icon" style={{ background: it.bg, color: it.fg }}>
                          <it.Icon />
                        </div>
                        <div className="row-name">{it.name}</div>
                      </div>
                    </td>
                    <td className="num-cell">{money(it.price)}</td>
                    <td className="num-cell">{it.stock}</td>
                    <td>
                      {it.active ? (
                        <span className="badge badge-green">
                          <IconCheck />
                          ใช้งาน
                        </span>
                      ) : (
                        <span className="badge badge-neutral">ปิดใช้งาน</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="summary-sticky">
          <div className="card card-pad">
            <div className="detail-head">
              <div className="detail-icon" style={{ background: c.bg, color: c.fg }}>
                <c.Icon />
              </div>
              <div>
                <div className="detail-name">{c.name}</div>
                <div className="detail-sub">{stats.count} รายการสินค้า</div>
              </div>
            </div>

            <div className="mini-stats-grid">
              <div className="mini-stat-box">
                <div className="lbl">สต็อกคงเหลือ</div>
                <div className="v">{stats.stock.toLocaleString('th-TH')} กก.</div>
              </div>
              <div className="mini-stat-box">
                <div className="lbl">ยอดรับซื้อสะสม</div>
                <div className="v">{money(stats.revenue)}</div>
              </div>
              <div className="mini-stat-box">
                <div className="lbl">ช่วงราคา</div>
                <div className="v">{stats.range}</div>
              </div>
              <div className="mini-stat-box">
                <div className="lbl">รายการใช้งาน</div>
                <div className="v">{stats.activeCount} / {stats.count}</div>
              </div>
            </div>

            <div className="field">
              <label>ชื่อหมวดหมู่</label>
              <input className="input-plain" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>

            <div className="field">
              <label>คำอธิบาย</label>
              <textarea className="input-plain" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </div>

            <div className="field">
              <label>สีประจำหมวดหมู่</label>
              <div className="swatch-row">
                {SWATCHES.map((sw) => (
                  <button
                    type="button"
                    key={sw}
                    className={`swatch${swatch === sw ? ' selected' : ''}`}
                    style={{ background: SWATCH_COLOR[sw] }}
                    onClick={() => setSwatch(sw)}
                  >
                    {swatch === sw && <IconCheck strokeWidth="3" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="toggle-row">
              <div>
                <div className="lbl">เปิดใช้งานหมวดหมู่นี้</div>
                <div className="sub">แสดงในหน้ารับซื้อของและตัวกรองสินค้า</div>
              </div>
              <button type="button" className={`switch${c.isActive ? ' on' : ''}`} onClick={toggleActive}></button>
            </div>

            <div className="submit-stack">
              <button type="button" className="btn btn-primary btn-block" onClick={handleSave}>
                <IconCheck />
                บันทึกการเปลี่ยนแปลง
              </button>
              <button type="button" className="btn btn-danger-ghost btn-block" onClick={handleDelete}>
                <IconCategory />
                ลบหมวดหมู่
              </button>
            </div>
          </div>

          <div className="card mini-stat-card">
            <div className="mini-stat-title">
              <IconCheck />
              หมวดยอดนิยม (สะสม)
            </div>
            {topCategories.map((id) => (
              <div className="mini-stat-row" key={id}>
                <span>{categories[id].name}</span>
                <span className="n">{money(categoryStats[id].revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
