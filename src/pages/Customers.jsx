import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { exportCsv } from '../lib/csvExport.js';
import { useCustomers, BLANK_CUSTOMER, INITIAL_ORDER } from '../context/CustomersContext.jsx';
import { IconUsers, IconDownload, IconUserAdd, IconCheck, IconPhoneCall, IconIdCard, IconMapPin, IconWarningTriangle, IconPlus, IconEdit, IconX, IconTrash } from '../icons.jsx';
import RowMenu from '../components/RowMenu.jsx';
import IdPhotoCapture from '../components/IdPhotoCapture.jsx';
import './Customers.css';

function parseMoney(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}

function money(n) {
  return '฿' + (n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Customers() {
  const navigate = useNavigate();
  const { customers, setCustomers, order, setOrder } = useCustomers();
  const newCustomerIds = order.filter((id) => !INITIAL_ORDER.includes(id));
  const regularCount = order.filter((id) => customers[id].tag === 'regular').length;
  const totalRevenue = order.reduce((sum, id) => sum + parseMoney(customers[id].total), 0);
  const idWarnList = useMemo(
    () =>
      order
        .filter((id) => customers[id].idWarn)
        .sort((a, b) => customers[a].idDaysLeft - customers[b].idDaysLeft),
    [order, customers]
  );
  const [selectedId, setSelectedId] = useState(order[0]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newIdNumber, setNewIdNumber] = useState('');
  const [newIdExpiry, setNewIdExpiry] = useState('');
  const [newIdPhoto, setNewIdPhoto] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editIdNumber, setEditIdNumber] = useState('');
  const [editIdExpiry, setEditIdExpiry] = useState('');
  const [editIdPhoto, setEditIdPhoto] = useState('');
  const [editTag, setEditTag] = useState('general');
  const [banner, setBanner] = useState(null);

  const rows = useMemo(() => {
    return order.filter((id) => {
      const c = customers[id];
      if (filter === 'regular' && c.tag !== 'regular') return false;
      if (filter === 'general' && c.tag !== 'general') return false;
      const q = query.trim().toLowerCase();
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q) && !(c.idNumber || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filter, query, order, customers]);

  const c = customers[selectedId];

  function handleExport() {
    exportCsv(
      'customers.csv',
      ['ชื่อลูกค้า', 'เบอร์โทร', 'ประเภท', 'ครั้งที่ขาย', 'ยอดสะสม', 'ครั้งล่าสุด'],
      rows.map((id) => {
        const cu = customers[id];
        return [cu.name, cu.phone, cu.tag === 'regular' ? 'ลูกค้าประจำ' : 'ทั่วไป', cu.visits, cu.total, cu.lastVisit];
      })
    );
  }

  function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;
    const id = `new_${Date.now()}`;
    setCustomers((prev) => ({
      ...prev,
      [id]: {
        ...BLANK_CUSTOMER,
        name: newName.trim(),
        phone: newPhone.trim(),
        idNumber: newIdNumber.trim(),
        idExpiry: newIdExpiry,
        idPhoto: newIdPhoto,
        init: newName.trim().replace('คุณ', '').trim().slice(0, 2),
        createdAt: new Date().toISOString(),
      },
    }));
    setOrder((prev) => [id, ...prev]);
    setSelectedId(id);
    setNewName('');
    setNewPhone('');
    setNewIdNumber('');
    setNewIdExpiry('');
    setNewIdPhoto('');
    setShowNew(false);
    setBanner({ type: 'success', text: `เพิ่มลูกค้า ${newName.trim()} เรียบร้อยแล้ว` });
  }

  function openEdit(id = selectedId) {
    const target = customers[id];
    setSelectedId(id);
    setEditName(target.name);
    setEditPhone(target.phone);
    setEditIdNumber(target.idNumber || '');
    setEditIdExpiry(target.idExpiry || '');
    setEditIdPhoto(target.idPhoto || '');
    setEditTag(target.tag || 'general');
    setEditOpen(true);
  }

  function handleSaveEdit(e) {
    e.preventDefault();
    setCustomers((prev) => {
      const nextName = editName.trim() || prev[selectedId].name;
      return {
        ...prev,
        [selectedId]: {
          ...prev[selectedId],
          name: nextName,
          // Recomputed the same way handleCreate derives it, so renaming a customer
          // doesn't leave their avatar showing initials from the old name.
          init: nextName.replace('คุณ', '').trim().slice(0, 2) || prev[selectedId].init,
          phone: editPhone.trim() || prev[selectedId].phone,
          idNumber: editIdNumber.trim(),
          idExpiry: editIdExpiry,
          idPhoto: editIdPhoto,
          tag: editTag,
        },
      };
    });
    setEditOpen(false);
    setBanner({ type: 'success', text: 'บันทึกข้อมูลลูกค้าเรียบร้อยแล้ว' });
  }

  function handleDelete(id = selectedId) {
    const target = customers[id];
    if (!window.confirm(`ยืนยันลบข้อมูลลูกค้า "${target.name}"?`)) return;
    const remaining = order.filter((oid) => oid !== id);
    setOrder(remaining);
    setCustomers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (id === selectedId && remaining[0]) setSelectedId(remaining[0]);
    setBanner({ type: 'error', text: `ลบข้อมูลลูกค้า "${target.name}" แล้ว` });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            การทำงาน <span>›</span> <b>ลูกค้า</b>
          </div>
          <h1 className="page-title">ลูกค้า</h1>
          <div className="page-sub">ค้นหา จัดการข้อมูล และดูประวัติการซื้อขายของลูกค้าแต่ละราย</div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={handleExport}>
            <IconDownload />
            ส่งออก Excel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowNew((v) => !v)}>
            <IconUserAdd />
            เพิ่มลูกค้าใหม่
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
        <form className="inline-add-form" onSubmit={handleCreate} style={{ flexDirection: 'column', alignItems: 'stretch', maxWidth: 420 }}>
          <input className="input-plain" placeholder="ชื่อลูกค้า" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <input className="input-plain" placeholder="เบอร์โทรศัพท์" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} required />
          <IdPhotoCapture value={newIdPhoto} onChange={setNewIdPhoto} onError={(msg) => setBanner({ type: 'error', text: msg })} />
          <input className="input-plain" placeholder="เลขบัตรประชาชน (ดูจากรูปที่ถ่าย)" value={newIdNumber} onChange={(e) => setNewIdNumber(e.target.value)} />
          <div className="field">
            <label style={{ fontSize: 12, color: 'var(--ink-500)' }}>วันหมดอายุบัตรประชาชน</label>
            <input className="input-plain" type="date" value={newIdExpiry} onChange={(e) => setNewIdExpiry(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary btn-block" style={{ justifyContent: 'center' }}>
            บันทึกลูกค้าใหม่
          </button>
        </form>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconUsers />
          </div>
          <div>
            <div className="stat-label">ลูกค้าทั้งหมด</div>
            <div className="stat-value">{order.length} ราย</div>
            <div className="stat-foot">ประจำ {regularCount} · ทั่วไป {order.length - regularCount}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconUserAdd />
          </div>
          <div>
            <div className="stat-label">ลูกค้าใหม่</div>
            <div className="stat-value">{newCustomerIds.length} ราย</div>
            <div className="stat-foot">นับตั้งแต่เริ่มใช้ระบบ</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--plum-bg)', color: 'var(--plum)' }}>
            <IconUsers />
          </div>
          <div>
            <div className="stat-label">ยอดซื้อขายสะสมทั้งหมด</div>
            <div className="stat-value">{money(totalRevenue)}</div>
            <div className="stat-foot">{order.length} ราย</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <IconWarningTriangle />
          </div>
          <div>
            <div className="stat-label">บัตรประชาชนใกล้หมดอายุ</div>
            <div className="stat-value">{idWarnList.length} ราย</div>
            <div className="stat-foot">ภายใน 30 วัน</div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ '--detail-w': '360px' }}>
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">
                <IconUsers />
                รายชื่อลูกค้า
              </div>
              <div className="card-sub">แตะที่ชื่อเพื่อดูประวัติและเริ่มรับซื้อให้ลูกค้ารายนี้</div>
            </div>
            <div className="filter-tabs">
              {[
                ['all', 'ทั้งหมด'],
                ['regular', 'ลูกค้าประจำ'],
                ['general', 'ทั่วไป'],
              ].map(([key, label]) => (
                <button key={key} type="button" className={`filter-tab${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="toolbar">
            <div className="search-box">
              <IconUsers style={{ width: 16, height: 16 }} />
              <input placeholder="ค้นหาชื่อ, เบอร์โทร หรือเลขบัตรประชาชน" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>ลูกค้า</th>
                <th style={{ width: '16%' }}>ประเภท</th>
                <th style={{ width: '16%' }}>ครั้งที่ขาย</th>
                <th style={{ width: '18%' }}>ยอดสะสม</th>
                <th style={{ width: '16%' }}>ครั้งล่าสุด</th>
                <th style={{ width: '6%' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((id) => {
                const cu = customers[id];
                return (
                  <tr key={id} className={`clickable${id === selectedId ? ' selected-row' : ''}`} onClick={() => setSelectedId(id)}>
                    <td>
                      <div className="row-cell">
                        <div className="row-icon" style={{ background: cu.bg, color: cu.fg, borderRadius: '99px' }}>
                          {cu.init}
                        </div>
                        <div>
                          <div className="row-name">{cu.name}</div>
                          <div className="row-sub">{cu.phone}</div>
                          {cu.idWarn && (
                            <div className="id-warn">
                              <IconWarningTriangle />
                              บัตร ปชช. ใกล้หมดอายุ
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      {cu.tag === 'regular' ? (
                        <span className="badge badge-green">
                          <IconCheck />
                          ลูกค้าประจำ
                        </span>
                      ) : (
                        <span className="badge badge-neutral">ทั่วไป</span>
                      )}
                    </td>
                    <td className="num-cell">{cu.visits}</td>
                    <td className="num-cell">{cu.total}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-500)' }}>{cu.lastVisit}</td>
                    <td>
                      <RowMenu
                        actions={[
                          { label: 'แก้ไข', icon: <IconEdit />, onClick: () => openEdit(id) },
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
            <span>แสดง {rows.length} จาก {order.length} ราย</span>
          </div>
        </div>

        <div className="summary-sticky">
          {!c ? (
            <div className="card card-pad">
              <div className="empty-hint">ยังไม่มีลูกค้าในระบบ — เพิ่มลูกค้ารายแรกเพื่อเริ่มต้น</div>
            </div>
          ) : (
          <div className="card card-pad">
            <div className="profile-head">
              <div className="profile-avatar" style={{ background: c.bg, color: c.fg }}>
                {c.init}
              </div>
              <div className="profile-name">{c.name}</div>
              <div className="profile-tags">
                {c.tag === 'regular' ? (
                  <span className="badge badge-green">
                    <IconCheck />
                    ลูกค้าประจำ
                  </span>
                ) : (
                  <span className="badge badge-neutral">ทั่วไป</span>
                )}
              </div>
            </div>

            <div className="profile-row">
              <IconPhoneCall />
              <span>{c.phone}</span>
            </div>
            <div className="profile-row">
              <IconIdCard />
              <span>{c.idNumber ? `เลขบัตร ${c.idNumber}` : 'ยังไม่ได้บันทึกเลขบัตร'}{c.idExpiry ? ` · หมดอายุ ${c.idExpiry}` : ''}</span>
            </div>
            {c.idPhoto && (
              <img
                src={c.idPhoto}
                alt="รูปบัตรประชาชน"
                className="profile-id-photo"
                onClick={() => window.open(c.idPhoto, '_blank')}
                title="กดเพื่อดูขนาดเต็ม"
              />
            )}
            <div className="profile-row">
              <IconMapPin />
              <span>{c.addr}</span>
            </div>

            {c.idWarn && (
              <div className="id-alert">
                <IconWarningTriangle />
                <span>
                  <b>{c.idDaysLeft < 0 ? 'บัตรประชาชนหมดอายุแล้ว' : 'บัตรประชาชนใกล้หมดอายุ'}</b>
                  <br />
                  {c.idDaysLeft < 0
                    ? `หมดอายุไปแล้ว ${Math.abs(c.idDaysLeft)} วัน — แจ้งลูกค้าให้ต่ออายุก่อนทำรายการครั้งถัดไป`
                    : `หมดอายุใน ${c.idDaysLeft} วัน — แจ้งลูกค้าให้ต่ออายุก่อนทำรายการครั้งถัดไป`}
                  <br />
                  <span style={{ color: 'var(--ink-500)' }}>แก้ไขได้ที่ปุ่ม "แก้ไขข้อมูลลูกค้า" ด้านล่าง — กรอกวันหมดอายุใหม่หลังลูกค้าต่อบัตรแล้ว</span>
                </span>
              </div>
            )}

            <div className="mini-stats-grid">
              <div className="mini-stat-box">
                <div className="lbl">น้ำหนักสะสม</div>
                <div className="v">{c.weight}</div>
              </div>
              <div className="mini-stat-box">
                <div className="lbl">ยอดสะสมทั้งหมด</div>
                <div className="v">{c.total}</div>
              </div>
              <div className="mini-stat-box">
                <div className="lbl">จำนวนครั้ง</div>
                <div className="v">{c.visits}</div>
              </div>
              <div className="mini-stat-box">
                <div className="lbl">ลูกค้าตั้งแต่</div>
                <div className="v">{c.since}</div>
              </div>
            </div>

            <div className="hist-title">
              ประวัติล่าสุด
              <span className="link" role="button" tabIndex={0} onClick={() => navigate('/receipts')}>
                ดูทั้งหมด
              </span>
            </div>
            <div>
              {c.hist.length === 0 && <div className="empty-hint">ยังไม่มีประวัติการซื้อขาย</div>}
              {c.hist.map((h) => (
                <div className="hist-row" key={h.no}>
                  <div className="hist-left">
                    <div className="no">{h.no}</div>
                    <div className="dt">{h.dt}</div>
                  </div>
                  <div className="hist-right">{h.amt}</div>
                </div>
              ))}
            </div>

            {editOpen && (
              <form className="inline-add-form" onSubmit={handleSaveEdit} style={{ flexDirection: 'column', marginTop: 14 }}>
                <input className="input-plain" placeholder="ชื่อลูกค้า" value={editName} onChange={(e) => setEditName(e.target.value)} />
                <input className="input-plain" placeholder="เบอร์โทรศัพท์" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                <IdPhotoCapture value={editIdPhoto} onChange={setEditIdPhoto} onError={(msg) => setBanner({ type: 'error', text: msg })} />
                <input className="input-plain" placeholder="เลขบัตรประชาชน (ดูจากรูปที่ถ่าย)" value={editIdNumber} onChange={(e) => setEditIdNumber(e.target.value)} />
                <div className="field">
                  <label style={{ fontSize: 12, color: 'var(--ink-500)' }}>วันหมดอายุบัตรประชาชน</label>
                  <input className="input-plain" type="date" value={editIdExpiry} onChange={(e) => setEditIdExpiry(e.target.value)} />
                </div>
                <div className="toggle-row">
                  <div>
                    <div className="lbl">ตั้งเป็นลูกค้าประจำ</div>
                    <div className="sub">ลูกค้าประจำจะได้ป้ายพิเศษและกรองแยกได้ในรายชื่อ</div>
                  </div>
                  <button
                    type="button"
                    className={`switch${editTag === 'regular' ? ' on' : ''}`}
                    onClick={() => setEditTag((v) => (v === 'regular' ? 'general' : 'regular'))}
                  ></button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                    บันทึก
                  </button>
                  <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setEditOpen(false)}>
                    ยกเลิก
                  </button>
                </div>
              </form>
            )}

            <div className="submit-stack">
              <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('/')}>
                <IconPlus />
                เริ่มรับซื้อให้ลูกค้านี้
              </button>
              <button type="button" className="btn btn-ghost btn-block" onClick={() => openEdit()}>
                <IconEdit />
                แก้ไขข้อมูลลูกค้า
              </button>
              <button type="button" className="btn btn-danger-ghost btn-block" onClick={() => handleDelete()}>
                <IconTrash />
                ลบข้อมูลลูกค้า
              </button>
            </div>
          </div>
          )}

          <div className="card mini-stat-card">
            <div className="mini-stat-title">
              <IconWarningTriangle />
              บัตรใกล้หมดอายุ
            </div>
            {idWarnList.length === 0 && <div className="empty-hint">ไม่มีบัตรที่ใกล้หมดอายุ</div>}
            {idWarnList.map((id) => (
              <div
                className="mini-stat-row"
                key={id}
                style={{ cursor: 'pointer' }}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(id)}
              >
                <span>{customers[id].name}</span>
                <span className="n">{customers[id].idDaysLeft < 0 ? `หมดอายุแล้ว ${Math.abs(customers[id].idDaysLeft)} วัน` : `${customers[id].idDaysLeft} วัน`}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
