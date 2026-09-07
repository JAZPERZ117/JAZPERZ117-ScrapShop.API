import { useState } from 'react';
import { IconScale, IconCheck, IconPlus, IconTare, IconRefresh, IconClockHistory, IconWarningTriangle, IconX, IconEdit, IconTrash } from '../icons.jsx';
import RowMenu from '../components/RowMenu.jsx';
import { useScales, BLANK_DEVICE } from '../context/ScalesContext.jsx';
import './Scales.css';

const todayThai = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());

function nowTimeStr() {
  return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

const yesterdayThai = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Date.now() - 86400000));

const FALLBACK_LOG = [
  { icon: 'ok', title: 'สอบเทียบสำเร็จ · เครื่องชั่งหลัก', sub: `${yesterdayThai} · 08:15 น. โดยเจ้าของร้าน`, amt: 'คลาดเคลื่อน 0.02 กก.' },
  { icon: 'warn', title: 'แจ้งเตือนไม่ได้เชื่อมต่อ · เครื่องชั่งหลัก', sub: `${todayThai} · 10:40 น.`, amt: 'แก้ไขแล้ว' },
];

// Devices a network scan (จำลอง) can discover, one at a time, until the pool runs out —
// filtered against the current `order` so an already-added device is never "found" twice.
const DISCOVERABLE_POOL = [
  { id: 'wireless1', name: 'เครื่องชั่งไร้สายจุดรับซื้อ 2', model: 'CAS PB-60 60kg', bg: 'var(--amber-bg)', fg: 'var(--amber)', port: 'WS-PB60-7A', conn: 'Wi-Fi', max: '60 กก.', res: '0.01 กก.', cal: 'ยังไม่เคยสอบเทียบ', due: '—', status: 'on', active: false },
  { id: 'wireless2', name: 'เครื่องชั่งคลังสินค้า', model: 'A&D FG-150KAM 150kg', bg: 'var(--teal-bg, #E4F6F4)', fg: 'var(--teal, #0E8E82)', port: 'FG150-C3', conn: 'Bluetooth', max: '150 กก.', res: '0.05 กก.', cal: 'ยังไม่เคยสอบเทียบ', due: '—', status: 'on', active: false },
];

export default function Scales() {
  const { devices, setDevices, order, setOrder, activity, logActivity, toggleConnected } = useScales();
  const [selectedId, setSelectedId] = useState(order[0]);
  const [liveWeight, setLiveWeight] = useState(0);
  const [editName, setEditName] = useState(devices[order[0]]?.name || '');
  const [editConn, setEditConn] = useState(devices[order[0]]?.conn || '');
  const [editPort, setEditPort] = useState(devices[order[0]]?.port || '');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newModel, setNewModel] = useState('');
  const [banner, setBanner] = useState(null);

  const d = devices[selectedId];
  const connectedCount = order.filter((id) => devices[id].status === 'on').length;
  const disconnectedCount = order.length - connectedCount;
  // "หลัก" (main) is whichever device is actually flagged active — not a hardcoded id —
  // so this stays correct after the user switches which scale is primary.
  const mainDeviceId = order.find((id) => devices[id].active) || order[0];
  const mainDevice = devices[mainDeviceId];

  function selectDevice(id) {
    setSelectedId(id);
    setEditName(devices[id].name);
    setEditConn(devices[id].conn);
    setEditPort(devices[id].port);
    setLiveWeight(0);
  }

  function simulate() {
    if (d.status !== 'on') {
      setBanner({ type: 'error', text: `${d.name} ไม่ได้เชื่อมต่ออยู่ — กดเชื่อมต่อก่อนอ่านค่าน้ำหนัก` });
      return;
    }
    setLiveWeight(Number((Math.random() * 60 + 1).toFixed(2)));
  }
  function tare() {
    if (d.status !== 'on') {
      setBanner({ type: 'error', text: `${d.name} ไม่ได้เชื่อมต่ออยู่ — กดเชื่อมต่อก่อนตั้งค่าศูนย์` });
      return;
    }
    setLiveWeight(0);
  }
  // "ใช้เป็นเครื่องชั่งหลัก" is exclusive — only one device can be the one ScrapPurchase.jsx
  // reads from, so turning it on for this device turns it off for every other one.
  function toggleActive() {
    setDevices((prev) => {
      const turningOn = !prev[selectedId].active;
      const next = {};
      for (const id in prev) {
        next[id] = { ...prev[id], active: id === selectedId ? turningOn : turningOn ? false : prev[id].active };
      }
      return next;
    });
  }

  function handleScan() {
    const found = DISCOVERABLE_POOL.find((dev) => !order.includes(dev.id));
    if (!found) {
      setBanner({ type: 'info', text: 'สแกนเครือข่ายแล้ว — ไม่พบเครื่องชั่งใหม่เพิ่มเติม' });
      return;
    }
    const { id, ...rest } = found;
    setDevices((prev) => ({ ...prev, [id]: rest }));
    setOrder((prev) => [...prev, id]);
    logActivity({ icon: 'ok', title: `พบเครื่องชั่งใหม่ · ${rest.name}`, sub: `${todayThai} · ${nowTimeStr()} จากการสแกนเครือข่าย`, amt: 'เพิ่มเข้าระบบแล้ว' });
    setBanner({ type: 'success', text: `สแกนเครือข่ายพบเครื่องชั่งใหม่ 1 เครื่อง: "${rest.name}" — เพิ่มเข้าระบบแล้ว` });
  }

  function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = `new_${Date.now()}`;
    const created = { ...BLANK_DEVICE, name: newName.trim(), model: newModel.trim() || BLANK_DEVICE.model };
    setDevices((prev) => ({ ...prev, [id]: created }));
    setOrder((prev) => [id, ...prev]);
    setSelectedId(id);
    setEditName(created.name);
    setEditConn(created.conn);
    setEditPort(created.port);
    setNewName('');
    setNewModel('');
    setShowNew(false);
    setBanner({ type: 'success', text: `เพิ่มเครื่องชั่ง ${newName.trim()} เรียบร้อยแล้ว` });
  }

  function handleSave() {
    setDevices((prev) => ({ ...prev, [selectedId]: { ...prev[selectedId], name: editName.trim() || prev[selectedId].name, conn: editConn, port: editPort } }));
    setBanner({ type: 'success', text: `บันทึกการตั้งค่าของ "${editName.trim() || d.name}" แล้ว` });
  }

  function handleCalibrate() {
    const drift = (Math.random() * 0.1).toFixed(2);
    setDevices((prev) => ({ ...prev, [selectedId]: { ...prev[selectedId], cal: todayThai, due: '90 วัน', status: 'on' } }));
    logActivity({ icon: 'ok', title: `สอบเทียบสำเร็จ · ${d.name}`, sub: `${todayThai} · ${nowTimeStr()} โดยเจ้าของร้าน`, amt: `คลาดเคลื่อน ${drift} กก.` });
    setBanner({ type: 'success', text: `สอบเทียบ "${d.name}" สำเร็จ — คลาดเคลื่อน ${drift} กก.` });
  }

  function handleRemove(id = selectedId) {
    const target = devices[id];
    if (!window.confirm(`ยืนยันนำเครื่องชั่ง "${target.name}" ออกจากระบบ?`)) return;
    const remaining = order.filter((oid) => oid !== id);
    setOrder(remaining);
    setDevices((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (id === selectedId) {
      if (remaining[0]) selectDevice(remaining[0]);
      else setSelectedId(null);
    }
    logActivity({ icon: 'warn', title: `นำเครื่องชั่งออกจากระบบ · ${target.name}`, sub: `${todayThai} · ${nowTimeStr()}`, amt: 'นำออกแล้ว' });
    setBanner({ type: 'error', text: `นำเครื่องชั่ง "${target.name}" ออกจากระบบแล้ว` });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            การทำงาน <span>›</span> <b>เครื่องชั่ง</b>
          </div>
          <h1 className="page-title">เครื่องชั่ง</h1>
          <div className="page-sub">เชื่อมต่อ ปรับเทียบ และตรวจสอบสถานะเครื่องชั่งดิจิทัลของร้าน</div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={handleScan}>
            <IconRefresh />
            สแกนหาเครื่องใหม่
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setShowNew((v) => !v)}>
            <IconPlus />
            เพิ่มเครื่องชั่ง
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
          <input className="input-plain" placeholder="ชื่อเครื่องชั่ง" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <input className="input-plain" placeholder="รุ่น (ไม่บังคับ)" value={newModel} onChange={(e) => setNewModel(e.target.value)} />
          <button type="submit" className="btn btn-primary">
            บันทึก
          </button>
        </form>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}>
            <IconScale />
          </div>
          <div>
            <div className="stat-label">เครื่องชั่งทั้งหมด</div>
            <div className="stat-value">{order.length} เครื่อง</div>
            <div className="stat-foot">เชื่อมต่ออยู่ {connectedCount}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconCheck />
          </div>
          <div>
            <div className="stat-label">เชื่อมต่อสำเร็จ</div>
            <div className="stat-value">{connectedCount} เครื่อง</div>
            <div className="stat-foot">พร้อมใช้งาน</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <IconWarningTriangle />
          </div>
          <div>
            <div className="stat-label">ไม่ได้เชื่อมต่อ</div>
            <div className="stat-value">{disconnectedCount} เครื่อง</div>
            <div className="stat-foot">{disconnectedCount > 0 ? 'ตรวจสอบการเชื่อมต่อ' : 'ทุกเครื่องเชื่อมต่ออยู่'}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--teal-bg, #E4F6F4)', color: 'var(--teal, #0E8E82)' }}>
            <IconClockHistory />
          </div>
          <div>
            <div className="stat-label">สอบเทียบล่าสุด (หลัก)</div>
            <div className="stat-value">{mainDevice?.cal || '—'}</div>
            <div className="stat-foot">ครบกำหนดอีก {mainDevice?.due || '—'}</div>
          </div>
        </div>
      </div>

      {!d ? (
        <div className="card card-pad">
          <div className="empty-hint">ยังไม่มีเครื่องชั่งในระบบ — กด "เพิ่มเครื่องชั่ง" เพื่อเริ่มต้น</div>
        </div>
      ) : (
        <div className="scale-hero">
          <div className="hero-left">
            <div className="hero-status">
              <span className="hero-dot"></span>
              {d.status === 'on' ? 'เชื่อมต่อแล้ว' : 'ไม่ได้เชื่อมต่อ'} · อัปเดตล่าสุดเมื่อสักครู่
            </div>
            <div className="hero-device">
              {d.name} · <b>{d.model}</b> · พอร์ต {d.port}
            </div>
            <div className="hero-reading">
              <span className="val">{(d.status === 'on' ? liveWeight : 0).toFixed(2)}</span>
              <span className="unit">กิโลกรัม</span>
            </div>
            <div className="hero-sub">ความละเอียด {d.res}</div>
          </div>
          <div className="hero-actions">
            <button type="button" className="hero-btn primary" onClick={simulate} disabled={d.status !== 'on'}>
              <IconPlus />
              วางของบนเครื่องชั่ง (จำลอง)
            </button>
            <button type="button" className="hero-btn" onClick={tare} disabled={d.status !== 'on'}>
              <IconTare />
              ตั้งค่าศูนย์ (Tare)
            </button>
            <button type="button" className="hero-btn" onClick={handleCalibrate}>
              <IconRefresh />
              สอบเทียบเครื่องชั่ง
            </button>
            <button type="button" className="hero-btn" onClick={() => toggleConnected(selectedId)}>
              <IconCheck />
              {d.status === 'on' ? 'ตัดการเชื่อมต่อ' : 'เชื่อมต่อ'}
            </button>
          </div>
        </div>
      )}

      <div className="grid" style={{ '--detail-w': '350px' }}>
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">
                <IconScale />
                เครื่องชั่งทั้งหมด
              </div>
              <div className="card-sub">แตะที่รายการเพื่อดูรายละเอียดและตั้งค่า</div>
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>เครื่องชั่ง</th>
                <th style={{ width: '18%' }}>พอร์ต/ที่อยู่</th>
                <th style={{ width: '16%' }}>น้ำหนักสูงสุด</th>
                <th style={{ width: '18%' }}>สอบเทียบล่าสุด</th>
                <th style={{ width: '14%' }}>สถานะ</th>
                <th style={{ width: '4%' }}></th>
              </tr>
            </thead>
            <tbody>
              {order.map((id) => {
                const dev = devices[id];
                return (
                  <tr key={id} className={`clickable${id === selectedId ? ' selected-row' : ''}`} onClick={() => selectDevice(id)}>
                    <td>
                      <div className="row-cell">
                        <div className="row-icon" style={{ background: dev.bg, color: dev.fg }}>
                          <IconScale />
                        </div>
                        <div>
                          <div className="row-name">{dev.name}</div>
                          <div className="row-sub">{dev.model}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num-cell">{dev.port}</td>
                    <td className="num-cell">{dev.max}</td>
                    <td className="num-cell">{dev.cal}</td>
                    <td>
                      <button
                        type="button"
                        className={`badge badge-btn ${dev.status === 'on' ? 'badge-green' : 'badge-neutral'}`}
                        title="กดเพื่อสลับสถานะการเชื่อมต่อ"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleConnected(id);
                        }}
                      >
                        {dev.status === 'on' ? <IconCheck /> : null}
                        {dev.status === 'on' ? 'เชื่อมต่อ' : 'ไม่ได้เชื่อมต่อ'}
                      </button>
                    </td>
                    <td>
                      <RowMenu
                        actions={[
                          { label: 'แก้ไข', icon: <IconEdit />, onClick: () => selectDevice(id) },
                          { label: 'นำออก', icon: <IconTrash />, danger: true, onClick: () => handleRemove(id) },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="log-title">
            <IconRefresh />
            ประวัติสอบเทียบและการแจ้งเตือน
          </div>
          <div>
            {(activity.length > 0 ? activity : FALLBACK_LOG).slice(0, 5).map((log, i) => (
              <div className="log-row" key={i}>
                <div
                  className="log-icon"
                  style={
                    log.icon === 'ok'
                      ? { background: 'var(--green-100)', color: 'var(--green-700)' }
                      : { background: 'var(--amber-bg)', color: 'var(--amber)' }
                  }
                >
                  {log.icon === 'ok' ? <IconCheck /> : <IconWarningTriangle />}
                </div>
                <div className="log-mid">
                  <div className="log-title-txt">{log.title}</div>
                  <div className="log-sub">{log.sub}</div>
                </div>
                <div className="log-amt">{log.amt}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="summary-sticky">
          {!d ? (
            <div className="card card-pad">
              <div className="empty-hint">เลือกเครื่องชั่งจากรายการเพื่อดูรายละเอียด</div>
            </div>
          ) : (
            <div className="card card-pad">
              <div className="detail-head">
                <div className="detail-icon" style={{ background: d.bg, color: d.fg }}>
                  <IconScale />
                </div>
                <div>
                  <div className="detail-name">{d.name}</div>
                  <div className="detail-sub">{d.model}</div>
                </div>
              </div>

              <div className="mini-stats-grid">
                <div className="mini-stat-box">
                  <div className="lbl">น้ำหนักสูงสุด</div>
                  <div className="v">{d.max}</div>
                </div>
                <div className="mini-stat-box">
                  <div className="lbl">ความละเอียด</div>
                  <div className="v">{d.res}</div>
                </div>
                <div className="mini-stat-box">
                  <div className="lbl">สอบเทียบล่าสุด</div>
                  <div className="v">{d.cal}</div>
                </div>
                <div className="mini-stat-box">
                  <div className="lbl">ครบกำหนดอีก</div>
                  <div className="v">{d.due}</div>
                </div>
              </div>

              <div className="field">
                <label>ชื่อเครื่องชั่ง</label>
                <input className="input-plain" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>

              <div className="field-row">
                <div className="field" style={{ flex: 1 }}>
                  <label>วิธีเชื่อมต่อ</label>
                  <select className="input-plain" value={editConn} onChange={(e) => setEditConn(e.target.value)}>
                    <option>สาย USB / RS-232</option>
                    <option>Bluetooth</option>
                    <option>Wi-Fi</option>
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>พอร์ต/ที่อยู่</label>
                  <input className="input-plain" value={editPort} onChange={(e) => setEditPort(e.target.value)} />
                </div>
              </div>

              <div className="toggle-row">
                <div>
                  <div className="lbl">ใช้เป็นเครื่องชั่งหลัก</div>
                  <div className="sub">แสดงในหน้ารับซื้อของโดยอัตโนมัติ</div>
                </div>
                <button type="button" className={`switch${d.active ? ' on' : ''}`} onClick={toggleActive}></button>
              </div>

              <div className="submit-stack">
                <button type="button" className="btn btn-primary btn-block" onClick={handleSave}>
                  <IconCheck />
                  บันทึกการตั้งค่า
                </button>
                <button type="button" className="btn btn-ghost btn-block" onClick={handleCalibrate}>
                  <IconRefresh />
                  สอบเทียบเครื่องนี้
                </button>
                <button type="button" className="btn btn-danger-ghost btn-block" onClick={() => handleRemove()}>
                  <IconScale />
                  นำเครื่องชั่งออก
                </button>
              </div>
            </div>
          )}

          <div className="card mini-stat-card">
            <div className="mini-stat-title">
              <IconClockHistory />
              สรุปเครื่องชั่ง
            </div>
            <div className="mini-stat-row">
              <span>เชื่อมต่ออยู่</span>
              <span className="n">{connectedCount} / {order.length} เครื่อง</span>
            </div>
            <div className="mini-stat-row">
              <span>เครื่องหลัก</span>
              <span className="n">{mainDevice?.name || '—'}</span>
            </div>
            <div className="mini-stat-row">
              <span>สอบเทียบล่าสุด</span>
              <span className="n">{mainDevice?.cal || '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
