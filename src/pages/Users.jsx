import { useState } from 'react';
import { IconUsers, IconUserAdd, IconCheck, IconLock, IconGear, IconEdit, IconTrash } from '../icons.jsx';
import RowMenu from '../components/RowMenu.jsx';
import { useUsers, ROLES } from '../context/UsersContext.jsx';
import { ROLE_MENU_ACCESS } from '../lib/permissions.js';
import { navSections } from '../components/navItems.js';
import { getToken } from '../lib/auth.js';
import './Users.css';

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

const MENU_LABEL = Object.fromEntries(navSections.flatMap((s) => s.items).map((item) => [item.key, item.label]));

function roleMenuSummary(role) {
  const keys = ROLE_MENU_ACCESS[role] || [];
  if (keys.length >= Object.keys(MENU_LABEL).length) return 'เข้าถึงได้ทุกเมนู';
  return keys.map((k) => MENU_LABEL[k]).filter(Boolean).join(', ') || 'ไม่มีสิทธิ์เข้าเมนูใดเลย';
}

function nowTimeStr() {
  return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

export default function Users() {
  const { users, setUsers, order, setOrder, refreshUsers } = useUsers();
  const [selectedId, setSelectedId] = useState(order[0]);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState(ROLES[2]);
  const [newPin, setNewPin] = useState('');
  const [editName, setEditName] = useState(users[order[0]]?.name || '');
  const [editRole, setEditRole] = useState(users[order[0]]?.role || ROLES[0]);
  // Always starts blank, even for a user that already has a PIN set — the server never sends
  // the actual digits back (see GET /api/users' `hasPin` flag instead of `pin`), so this field
  // only ever means "set a new PIN," never "here's the current one."
  const [editPin, setEditPin] = useState('');
  const [banner, setBanner] = useState(null);
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const u = users[selectedId];
  const loggedInToday = order.filter((id) => (users[id].lastLogin || '').startsWith('วันนี้'));

  function selectUser(id) {
    setSelectedId(id);
    setEditName(users[id].name);
    setEditRole(users[id].role);
    setEditPin('');
    setShowPwForm(false);
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
  }

  async function toggleActive(id) {
    const target = users[id];
    const nextActive = !target.active;
    setUsers((prev) => ({ ...prev, [id]: { ...prev[id], active: nextActive } }));
    if (!target.serverId) return;
    try {
      const res = await fetch(`/api/users/${target.serverId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ active: nextActive }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setUsers((prev) => ({ ...prev, [id]: { ...prev[id], active: !nextActive } }));
      setBanner({ type: 'error', text: 'บันทึกสถานะไม่สำเร็จ กรุณาลองใหม่' });
    }
  }

  async function handleSaveChanges() {
    const pin = editPin.trim();
    if (pin && !/^\d{4}$/.test(pin)) {
      setBanner({ type: 'error', text: 'PIN ต้องเป็นตัวเลข 4 หลัก' });
      return;
    }
    if (selectedId === 'admin') {
      setUsers((prev) => ({ ...prev, admin: { ...prev.admin, name: editName.trim() || prev.admin.name, role: editRole } }));
      setBanner({ type: 'success', text: `บันทึกข้อมูลผู้ใช้งาน ${editName.trim() || u.name} เรียบร้อยแล้ว` });
      return;
    }
    if (!u.serverId) {
      setBanner({ type: 'error', text: 'ไม่พบผู้ใช้งานนี้บนเซิร์ฟเวอร์ กรุณารีเฟรชหน้าแล้วลองใหม่' });
      return;
    }
    try {
      const body = { displayName: editName.trim() || u.name, role: editRole };
      if (pin) body.pin = pin; // omitted entirely unless a new PIN was actually typed
      const res = await fetch(`/api/users/${u.serverId}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: 'error', text: data.error || 'บันทึกไม่สำเร็จ' });
        return;
      }
      setEditPin('');
      await refreshUsers();
      setBanner({ type: 'success', text: `บันทึกข้อมูลผู้ใช้งาน ${editName.trim() || u.name} เรียบร้อยแล้ว` });
    } catch {
      setBanner({ type: 'error', text: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง' });
    }
  }

  async function handleClearPin() {
    if (!u.serverId || !window.confirm(`ยืนยันลบ PIN ของ "${u.name}"?`)) return;
    try {
      const res = await fetch(`/api/users/${u.serverId}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ pin: '' }) });
      if (!res.ok) throw new Error();
      setEditPin('');
      await refreshUsers();
      setBanner({ type: 'success', text: `ลบ PIN ของ "${u.name}" แล้ว` });
    } catch {
      setBanner({ type: 'error', text: 'ลบ PIN ไม่สำเร็จ กรุณาลองใหม่' });
    }
  }

  async function handleDelete(id = selectedId) {
    if (id === 'admin') return;
    const target = users[id];
    if (!window.confirm(`ยืนยันลบผู้ใช้งาน "${target.name}"?`)) return;
    if (target.serverId) {
      try {
        const res = await fetch(`/api/users/${target.serverId}`, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setBanner({ type: 'error', text: data.error || 'ลบผู้ใช้งานไม่สำเร็จ' });
          return;
        }
      } catch {
        setBanner({ type: 'error', text: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง' });
        return;
      }
    }
    const remaining = order.filter((oid) => oid !== id);
    setOrder(remaining);
    setUsers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (id === selectedId && remaining[0]) selectUser(remaining[0]);
    setBanner({ type: 'error', text: `ลบผู้ใช้งาน "${target.name}" แล้ว` });
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim() || !newUsername.trim()) return;
    const pin = newPin.trim();
    if (pin && !/^\d{4}$/.test(pin)) {
      setBanner({ type: 'error', text: 'PIN ต้องเป็นตัวเลข 4 หลัก' });
      return;
    }
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ username: newUsername.trim(), displayName: newName.trim(), role: newRole, pin: pin || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: 'error', text: data.error || 'เพิ่มผู้ใช้งานไม่สำเร็จ' });
        return;
      }
      await refreshUsers();
      setSelectedId(data.user.username);
      setEditName(newName.trim());
      setEditRole(newRole);
      setEditPin('');
      setNewName('');
      setNewUsername('');
      setNewPin('');
      setShowNew(false);
      setBanner({ type: 'success', text: `เพิ่มผู้ใช้งาน ${newName.trim()} เรียบร้อยแล้ว` });
    } catch {
      setBanner({ type: 'error', text: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง' });
    }
  }

  // "admin" is the only account with a real backend login (server/src/index.js), so its
  // password change actually calls the API and updates the real bcrypt hash. Non-admin
  // accounts don't have passwords at all — they log in via PIN (see Login.jsx) — so there's
  // no "reset password" action for them to genuinely perform; the PIN field further down in
  // this form, saved via handleSaveChanges, is the real equivalent for those accounts.
  async function handleAdminChangePassword(e) {
    e.preventDefault();
    if (!currentPw || !newPw) return;
    if (newPw !== confirmPw) {
      setBanner({ type: 'error', text: 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน' });
      return;
    }
    setPwSaving(true);
    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner({ type: 'error', text: data.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ' });
        return;
      }
      setUsers((prev) => ({ ...prev, [selectedId]: { ...prev[selectedId], lastPasswordReset: nowTimeStr() } }));
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setShowPwForm(false);
      setBanner({ type: 'success', text: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว — ใช้รหัสผ่านใหม่ในการเข้าสู่ระบบครั้งถัดไป' });
    } catch {
      setBanner({ type: 'error', text: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง' });
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            ตั้งค่า <span>›</span> <b>ผู้ใช้งาน</b>
          </div>
          <h1 className="page-title">ผู้ใช้งาน</h1>
          <div className="page-sub">จัดการบัญชีผู้ใช้งานที่เข้าสู่ระบบร้านและสิทธิ์การเข้าถึง</div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-primary" onClick={() => setShowNew((v) => !v)}>
            <IconUserAdd />
            เพิ่มผู้ใช้งาน
          </button>
        </div>
      </div>

      {banner && <div className={`page-banner banner-${banner.type}`}>{banner.text}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconUsers />
          </div>
          <div>
            <div className="stat-label">ผู้ใช้งานทั้งหมด</div>
            <div className="stat-value">{order.length} คน</div>
            <div className="stat-foot">
              ใช้งาน {order.filter((id) => users[id].active).length} · ปิดใช้งาน {order.filter((id) => !users[id].active).length}
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconCheck />
          </div>
          <div>
            <div className="stat-label">เข้าสู่ระบบวันนี้</div>
            <div className="stat-value">{loggedInToday.length} คน</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              {loggedInToday.length > 0 ? loggedInToday.map((id) => users[id].name).join(', ') : 'ยังไม่มีใครเข้าสู่ระบบวันนี้'}
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <IconGear />
          </div>
          <div>
            <div className="stat-label">ระดับสิทธิ์</div>
            <div className="stat-value">{ROLES.length} ระดับ</div>
            <div className="stat-foot" style={{ color: 'var(--ink-500)' }}>
              เจ้าของร้าน / ผู้จัดการ / แคชเชียร์ / พนักงาน
            </div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ '--detail-w': '340px' }}>
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">
                <IconUsers />
                รายชื่อผู้ใช้งาน
              </div>
              <div className="card-sub">แตะที่รายการเพื่อแก้ไขสิทธิ์และรีเซ็ตรหัสผ่าน</div>
            </div>
          </div>

          {showNew && (
            <form className="inline-add-form" onSubmit={handleCreate}>
              <input className="input-plain" placeholder="ชื่อ-นามสกุล" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              <input className="input-plain" placeholder="ชื่อผู้ใช้งาน (username)" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
              <select className="input-plain" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <input
                className="input-plain"
                style={{ maxWidth: 110 }}
                placeholder="PIN 4 หลัก"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                title="ใช้เข้าสู่ระบบด่วนที่หน้าล็อกอิน — ถ้าไม่ตั้งตอนนี้ ผู้ใช้งานนี้จะยังเข้าสู่ระบบไม่ได้จนกว่าจะตั้ง PIN"
              />
              <button type="submit" className="btn btn-primary">
                บันทึก
              </button>
            </form>
          )}

          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '32%' }}>ผู้ใช้งาน</th>
                <th style={{ width: '20%' }}>สิทธิ์การใช้งาน</th>
                <th style={{ width: '26%' }}>เข้าสู่ระบบล่าสุด</th>
                <th style={{ width: '16%' }}>สถานะ</th>
                <th style={{ width: '6%' }}></th>
              </tr>
            </thead>
            <tbody>
              {order.map((id) => {
                const item = users[id];
                return (
                  <tr key={id} className={`clickable${id === selectedId ? ' selected-row' : ''}`} onClick={() => selectUser(id)}>
                    <td>
                      <div className="row-cell">
                        <div className="row-icon" style={{ background: item.bg, color: item.fg, borderRadius: '99px' }}>
                          {item.init}
                        </div>
                        <div>
                          <div className="row-name">{item.name}</div>
                          <div className="row-sub">@{item.username}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-blue">{item.role}</span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink-500)' }}>{item.lastLogin}</td>
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
                          { label: 'แก้ไข', icon: <IconEdit />, onClick: () => selectUser(id) },
                          ...(id !== 'admin' ? [{ label: 'ลบ', icon: <IconTrash />, danger: true, onClick: () => handleDelete(id) }] : []),
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="table-foot">
            <span>แสดง {order.length} จาก {order.length} คน</span>
          </div>
        </div>

        <div className="summary-sticky">
          <div className="card card-pad">
            <div className="detail-head">
              <div className="detail-icon" style={{ background: u.bg, color: u.fg, borderRadius: '99px' }}>
                {u.init}
              </div>
              <div>
                <div className="detail-name">{u.name}</div>
                <div className="detail-sub">@{u.username}</div>
              </div>
            </div>

            <div className="field">
              <label>ชื่อ-นามสกุล</label>
              <input className="input-plain" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>

            <div className="field">
              <label>สิทธิ์การใช้งาน</label>
              <select
                className="input-plain"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                disabled={selectedId === 'admin'}
                title={selectedId === 'admin' ? 'บัญชี admin ล็อกอินผ่านเซิร์ฟเวอร์และมีสิทธิ์เจ้าของร้านตายตัว เปลี่ยนที่นี่ไม่ได้' : undefined}
              >
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              {selectedId === 'admin' && (
                <div className="sub" style={{ marginTop: 4 }}>
                  บัญชี admin มีสิทธิ์เจ้าของร้านตายตัวจากเซิร์ฟเวอร์ ไม่สามารถเปลี่ยนได้ที่นี่
                </div>
              )}
            </div>

            {selectedId !== 'admin' && (
              <div className="field">
                <label>PIN เข้าสู่ระบบด่วน (4 หลัก)</label>
                <input
                  className="input-plain"
                  placeholder={u.pin ? 'ตั้งไว้แล้ว — พิมพ์ 4 หลักเพื่อเปลี่ยน' : 'ยังไม่ได้ตั้ง PIN'}
                  inputMode="numeric"
                  maxLength={4}
                  value={editPin}
                  onChange={(e) => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
                {u.pin && (
                  <button type="button" className="forgot" style={{ marginTop: 6 }} onClick={handleClearPin}>
                    ลบ PIN
                  </button>
                )}
              </div>
            )}

            <div className="toggle-row">
              <div>
                <div className="lbl">เปิดใช้งานบัญชีนี้</div>
                <div className="sub">อนุญาตให้เข้าสู่ระบบได้</div>
              </div>
              <button type="button" className={`switch${u.active ? ' on' : ''}`} onClick={() => toggleActive(selectedId)} disabled={selectedId === 'admin'}></button>
            </div>

            {selectedId === 'admin' && u.lastPasswordReset && (
              <div className="helper-note">
                <IconLock />
                {`เปลี่ยนรหัสผ่านล่าสุดเมื่อ ${u.lastPasswordReset}`}
              </div>
            )}

            {showPwForm && selectedId === 'admin' && (
              <form className="inline-add-form" style={{ flexDirection: 'column', marginBottom: 14 }} onSubmit={handleAdminChangePassword}>
                <input
                  className="input-plain"
                  type="password"
                  placeholder="รหัสผ่านปัจจุบัน"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  required
                />
                <input
                  className="input-plain"
                  type="password"
                  placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                />
                <input
                  className="input-plain"
                  type="password"
                  placeholder="ยืนยันรหัสผ่านใหม่"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  required
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={pwSaving}>
                    {pwSaving ? 'กำลังบันทึก...' : 'ยืนยันเปลี่ยนรหัสผ่าน'}
                  </button>
                  <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowPwForm(false)}>
                    ยกเลิก
                  </button>
                </div>
              </form>
            )}

            <div className="submit-stack">
              <button type="button" className="btn btn-primary btn-block" onClick={handleSaveChanges}>
                <IconCheck />
                บันทึกการเปลี่ยนแปลง
              </button>
              {selectedId === 'admin' && (
                <button type="button" className="btn btn-ghost btn-block" onClick={() => setShowPwForm((v) => !v)}>
                  <IconEdit />
                  เปลี่ยนรหัสผ่าน
                </button>
              )}
              {selectedId !== 'admin' && (
                <button type="button" className="btn btn-danger-ghost btn-block" onClick={() => handleDelete()}>
                  <IconUsers />
                  ลบผู้ใช้งานนี้
                </button>
              )}
            </div>
          </div>

          <div className="card mini-stat-card">
            <div className="mini-stat-title">
              <IconGear />
              เกี่ยวกับสิทธิ์การใช้งาน
            </div>
            <div className="mini-stat-row" style={{ alignItems: 'flex-start' }}>
              <span>เจ้าของร้าน</span>
              <span className="n" style={{ textAlign: 'right', maxWidth: '65%', whiteSpace: 'normal' }}>{roleMenuSummary('เจ้าของร้าน')}</span>
            </div>
            <div className="mini-stat-row" style={{ alignItems: 'flex-start' }}>
              <span>ผู้จัดการ</span>
              <span className="n" style={{ textAlign: 'right', maxWidth: '65%', whiteSpace: 'normal' }}>{roleMenuSummary('ผู้จัดการ')}</span>
            </div>
            <div className="mini-stat-row" style={{ alignItems: 'flex-start' }}>
              <span>แคชเชียร์</span>
              <span className="n" style={{ textAlign: 'right', maxWidth: '65%', whiteSpace: 'normal' }}>{roleMenuSummary('แคชเชียร์')}</span>
            </div>
            <div className="mini-stat-row" style={{ alignItems: 'flex-start' }}>
              <span>พนักงานชั่งของ</span>
              <span className="n" style={{ textAlign: 'right', maxWidth: '65%', whiteSpace: 'normal' }}>{roleMenuSummary('พนักงานชั่งของ')}</span>
            </div>
            <div className="helper-note" style={{ marginTop: 10 }}>
              <IconLock />
              บัญชีที่ไม่ใช่ "admin" เข้าสู่ระบบด้วย PIN ที่หน้าล็อกอินเท่านั้น ตั้งค่าได้ที่ช่อง "PIN เข้าสู่ระบบด่วน" ด้านบน
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
