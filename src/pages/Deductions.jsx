import { useMemo, useState } from 'react';
import { exportCsv } from '../lib/csvExport.js';
import { useDeductions, BLANK_REASON } from '../context/DeductionsContext.jsx';
import { IconDeduct, IconDownload, IconPlus, IconCheck, IconEdit, IconClockHistory, IconX, IconTrash } from '../icons.jsx';
import RowMenu from '../components/RowMenu.jsx';
import './Deductions.css';

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Deductions() {
  const { reasons, setReasons, order, setOrder } = useDeductions();
  const totalUsesThisMonth = order.reduce((sum, id) => sum + (reasons[id].uses || 0), 0);
  const totalDeductedThisMonth = order.reduce((sum, id) => sum + (reasons[id].total || 0), 0);
  const mostUsedId = order.reduce((best, id) => (!best || reasons[id].uses > reasons[best].uses ? id : best), null);
  const topUsedReasons = [...order].sort((a, b) => (reasons[b].uses || 0) - (reasons[a].uses || 0)).slice(0, 3);
  // Seeded from whichever reason is actually first in `order`, not a hardcoded 'wet' id —
  // that literal crashed the whole page the moment the "wet" reason specifically got
  // deleted (even with other reasons still left), since `reasons.wet` would be undefined.
  const [selectedId, setSelectedId] = useState(order[0]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [type, setType] = useState(reasons[order[0]]?.type || 'fixed');
  const [editName, setEditName] = useState(reasons[order[0]]?.name || '');
  const [editDesc, setEditDesc] = useState(reasons[order[0]]?.desc || '');
  const [editValue, setEditValue] = useState(reasons[order[0]]?.value || 0);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [banner, setBanner] = useState(null);

  const rows = useMemo(
    () =>
      order.filter((id) => {
        if (filter === 'active' && !reasons[id].active) return false;
        if (filter === 'inactive' && reasons[id].active) return false;
        const q = query.trim().toLowerCase();
        if (q && !reasons[id].name.toLowerCase().includes(q)) return false;
        return true;
      }),
    [filter, query, reasons, order]
  );

  const r = reasons[selectedId];

  function select(id) {
    setSelectedId(id);
    setType(reasons[id].type);
    setEditName(reasons[id].name);
    setEditDesc(reasons[id].desc);
    setEditValue(reasons[id].value);
  }

  function toggleActive() {
    setReasons((prev) => ({ ...prev, [selectedId]: { ...prev[selectedId], active: !prev[selectedId].active } }));
  }

  function handleExport() {
    exportCsv(
      'deduction-reasons.csv',
      ['เหตุผล', 'ประเภท', 'ค่าเริ่มต้น', 'ใช้แล้วสะสม', 'ยอดหักรวม', 'สถานะ'],
      rows.map((id) => {
        const item = reasons[id];
        return [item.name, item.type === 'percent' ? 'เปอร์เซ็นต์' : 'คงที่', item.value, item.uses || 0, (item.total || 0).toFixed(2), item.active ? 'ใช้งาน' : 'ปิดใช้งาน'];
      })
    );
  }

  function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = `new_${Date.now()}`;
    const created = { ...BLANK_REASON, name: newName.trim(), desc: newDesc.trim() };
    setReasons((prev) => ({ ...prev, [id]: created }));
    setOrder((prev) => [id, ...prev]);
    setSelectedId(id);
    setType(created.type);
    setEditName(created.name);
    setEditDesc(created.desc);
    setEditValue(created.value);
    setNewName('');
    setNewDesc('');
    setShowNew(false);
    setBanner({ type: 'success', text: `เพิ่มเหตุผล ${newName.trim()} เรียบร้อยแล้ว` });
  }

  function handleSave() {
    // The value input has min="0" but that only hints the browser's spinner — it doesn't
    // block typing/pasting a negative number, which would otherwise render as a doubled
    // minus sign ("−-5%") in the table below.
    const clampedValue = Math.max(parseFloat(editValue) || 0, 0);
    setReasons((prev) => ({ ...prev, [selectedId]: { ...prev[selectedId], name: editName.trim() || prev[selectedId].name, desc: editDesc, value: clampedValue, type } }));
    setEditValue(clampedValue);
    setBanner({ type: 'success', text: `บันทึกการเปลี่ยนแปลงของ "${editName.trim() || r.name}" แล้ว` });
  }

  function handleDelete(id = selectedId) {
    if (order.length <= 1) {
      setBanner({ type: 'error', text: 'ต้องมีเหตุผลอย่างน้อย 1 รายการ ไม่สามารถลบรายการสุดท้ายได้' });
      return;
    }
    const target = reasons[id];
    if (!window.confirm(`ยืนยันลบเหตุผล "${target.name}"?`)) return;
    const remaining = order.filter((oid) => oid !== id);
    setOrder(remaining);
    setReasons((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (id === selectedId && remaining[0]) select(remaining[0]);
    setBanner({ type: 'error', text: `ลบเหตุผล "${target.name}" แล้ว` });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            การทำงาน <span>›</span> <b>หักน้ำหนัก/เหตุผล</b>
          </div>
          <h1 className="page-title">หักน้ำหนัก/เหตุผล</h1>
          <div className="page-sub">จัดการเหตุผลการหักน้ำหนัก ให้เลือกใช้ได้รวดเร็วตอนรับซื้อของ</div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={handleExport}>
            <IconDownload />
            ส่งออก Excel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowNew((v) => !v)}>
            <IconPlus />
            เพิ่มเหตุผล
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
          <input className="input-plain" placeholder="ชื่อเหตุผล" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <input className="input-plain" placeholder="คำอธิบาย (ไม่บังคับ)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          <button type="submit" className="btn btn-primary">
            บันทึก
          </button>
        </form>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconDeduct />
          </div>
          <div>
            <div className="stat-label">เหตุผลทั้งหมด</div>
            <div className="stat-value">{order.length} รายการ</div>
            <div className="stat-foot">ใช้งาน {order.filter((id) => reasons[id].active).length} · ปิดใช้งาน {order.filter((id) => !reasons[id].active).length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--rose-bg)', color: 'var(--rose)' }}>
            <IconDeduct />
          </div>
          <div>
            <div className="stat-label">ใช้หักไปแล้วสะสม</div>
            <div className="stat-value">{totalUsesThisMonth} ครั้ง</div>
            <div className="stat-foot">ทุกเหตุผลรวมกัน</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <IconClockHistory />
          </div>
          <div>
            <div className="stat-label">เหตุผลใช้บ่อยสุด</div>
            <div className="stat-value">{mostUsedId && reasons[mostUsedId].uses > 0 ? reasons[mostUsedId].name : '—'}</div>
            <div className="stat-foot">{mostUsedId ? reasons[mostUsedId].uses : 0} ครั้งสะสม</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--teal-bg, #E4F6F4)', color: 'var(--teal, #0E8E82)' }}>
            <IconDeduct />
          </div>
          <div>
            <div className="stat-label">ยอดหักรวมสะสม</div>
            <div className="stat-value">−{money(totalDeductedThisMonth)}</div>
            <div className="stat-foot">รวม {totalUsesThisMonth} ครั้งที่หัก</div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ '--detail-w': '350px' }}>
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">
                <IconDeduct />
                เหตุผลการหักน้ำหนัก
              </div>
              <div className="card-sub">แตะที่รายการเพื่อแก้ไขค่าเริ่มต้น</div>
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
              <IconDeduct style={{ width: 16, height: 16 }} />
              <input placeholder="ค้นหาชื่อเหตุผล" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>เหตุผล</th>
                <th style={{ width: '16%' }}>ประเภท</th>
                <th style={{ width: '16%' }}>ค่าเริ่มต้น</th>
                <th style={{ width: '16%' }}>ใช้แล้วสะสม</th>
                <th style={{ width: '16%' }}>สถานะ</th>
                <th style={{ width: '6%' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((id) => {
                const item = reasons[id];
                return (
                  <tr key={id} className={`clickable${id === selectedId ? ' selected-row' : ''}`} onClick={() => select(id)}>
                    <td>
                      <div className="row-cell">
                        <div className="row-icon" style={{ background: item.bg, color: item.fg }}>
                          <item.Icon />
                        </div>
                        <div>
                          <div className="row-name">{item.name}</div>
                          <div className="row-sub">{item.desc}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`type-pill ${item.type === 'percent' ? 'badge-blue' : 'badge-plum'}`}>{item.type === 'percent' ? 'เปอร์เซ็นต์' : 'คงที่'}</span>
                    </td>
                    <td className="num-cell">{item.type === 'percent' ? `−${item.value}%` : `−${item.value} กก.`}</td>
                    <td className="num-cell">{item.uses || 0} ครั้ง</td>
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
                          { label: 'แก้ไข', icon: <IconEdit />, onClick: () => select(id) },
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
          {!r ? (
            <div className="card card-pad">
              <div className="empty-hint">ยังไม่มีเหตุผลการหักน้ำหนักในระบบ — เพิ่มเหตุผลแรกเพื่อเริ่มต้น</div>
            </div>
          ) : (
          <div className="card card-pad">
            <div className="detail-head">
              <div className="detail-icon" style={{ background: r.bg, color: r.fg }}>
                <r.Icon />
              </div>
              <div>
                <div className="detail-name">{r.name}</div>
                <div className="detail-sub">{r.desc}</div>
              </div>
            </div>

            <div className="mini-stats-grid">
              <div className="mini-stat-box">
                <div className="lbl">ใช้แล้วสะสม</div>
                <div className="v">{r.uses || 0} ครั้ง</div>
              </div>
              <div className="mini-stat-box">
                <div className="lbl">ยอดหักรวม</div>
                <div className="v">−{money(r.total)}</div>
              </div>
            </div>

            <div className="field">
              <label>ชื่อเหตุผล</label>
              <input className="input-plain" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>

            <div className="field">
              <label>คำอธิบาย</label>
              <textarea className="input-plain" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </div>

            <div className="field">
              <label>ประเภทการหัก</label>
              <div className="type-toggle">
                <div className={`type-btn${type === 'percent' ? ' selected' : ''}`} onClick={() => setType('percent')} role="button" tabIndex={0}>
                  เปอร์เซ็นต์ (%)
                </div>
                <div className={`type-btn${type === 'fixed' ? ' selected' : ''}`} onClick={() => setType('fixed')} role="button" tabIndex={0}>
                  น้ำหนักคงที่ (กก.)
                </div>
              </div>
            </div>

            <div className="field">
              <label>{type === 'percent' ? 'ค่าเริ่มต้น (% ของน้ำหนัก)' : 'ค่าเริ่มต้น (น้ำหนักที่หัก กก.)'}</label>
              <input
                className="input-plain"
                type="number"
                step="0.01"
                min="0"
                placeholder={type === 'percent' ? 'เช่น 5' : 'เช่น 1.5'}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />
            </div>

            <div className="toggle-row">
              <div>
                <div className="lbl">เปิดใช้งานเหตุผลนี้</div>
                <div className="sub">แสดงเป็นตัวเลือกด่วนในหน้ารับซื้อของ</div>
              </div>
              <button type="button" className={`switch${r.active ? ' on' : ''}`} onClick={toggleActive}></button>
            </div>

            <div className="submit-stack">
              <button type="button" className="btn btn-primary btn-block" onClick={handleSave}>
                <IconCheck />
                บันทึกการเปลี่ยนแปลง
              </button>
              <button type="button" className="btn btn-danger-ghost btn-block" onClick={() => handleDelete()}>
                <IconDeduct />
                ลบเหตุผลนี้
              </button>
            </div>
          </div>
          )}

          <div className="card mini-stat-card">
            <div className="mini-stat-title">
              <IconDeduct />
              เหตุผลใช้บ่อยสุดสะสม
            </div>
            {topUsedReasons.every((id) => !reasons[id].uses) && <div className="empty-hint">ยังไม่มีการใช้งานเหตุผลหักน้ำหนัก</div>}
            {topUsedReasons.map((id) => (
              <div className="mini-stat-row" key={id}>
                <span>{reasons[id].name}</span>
                <span className="n">{reasons[id].uses || 0} ครั้ง</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
