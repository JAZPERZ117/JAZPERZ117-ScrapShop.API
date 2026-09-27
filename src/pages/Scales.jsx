import { useEffect, useState } from 'react';
import { IconScale, IconCheck, IconPlus, IconTare, IconRefresh, IconClockHistory, IconWarningTriangle, IconX, IconEdit, IconTrash } from '../icons.jsx';
import RowMenu from '../components/RowMenu.jsx';
import { useScales, BLANK_DEVICE } from '../context/ScalesContext.jsx';
import { useScaleReader } from '../context/ScaleReaderContext.jsx';
import './Scales.css';

const todayThai = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());

function nowTimeStr() {
  return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 115200];

export default function Scales() {
  const { devices, order, activity, logActivity, createDevice, updateDevice, setActiveDevice, toggleConnected, deleteDevice } = useScales();
  const reader = useScaleReader();
  const [selectedId, setSelectedId] = useState(order[0]);
  const [editName, setEditName] = useState(devices[order[0]]?.name || '');
  const [editConn, setEditConn] = useState(devices[order[0]]?.conn || '');
  const [editPort, setEditPort] = useState(devices[order[0]]?.port || '');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newModel, setNewModel] = useState('');
  const [banner, setBanner] = useState(null);

  // Devices now load asynchronously from the server (see ScalesContext.jsx), so `order` is
  // still empty on the very first render — select the first real device once data actually
  // loads, same fix already applied to Products/Receipts/Deliveries/Payroll/Deductions/Categories.
  useEffect(() => {
    if (!selectedId && order.length > 0) selectDevice(order[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, selectedId]);

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
  }

  // Tare here is a software offset on this computer's live reading (ScaleReaderContext) — the
  // scale's own physical tare button works too and needs no action here.
  function tare() {
    if (reader.status !== 'connected' || !reader.reading) {
      setBanner({ type: 'error', text: 'ยังไม่ได้เชื่อมต่อเครื่องชั่ง — กด "เชื่อมต่อเครื่องชั่ง" ก่อน' });
      return;
    }
    reader.tare();
  }
  // "ใช้เป็นเครื่องชั่งหลัก" is exclusive — only one device can be the one ScrapPurchase.jsx
  // reads from, so the server clears every other device's flag in the same request.
  async function toggleActive() {
    try {
      await setActiveDevice(selectedId, !d.active);
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    let created;
    try {
      created = await createDevice({ ...BLANK_DEVICE, name: newName.trim(), model: newModel.trim() || BLANK_DEVICE.model });
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
      return;
    }
    selectDevice(created.id);
    setNewName('');
    setNewModel('');
    setShowNew(false);
    setBanner({ type: 'success', text: `เพิ่มเครื่องชั่ง ${newName.trim()} เรียบร้อยแล้ว` });
  }

  async function handleSave() {
    try {
      await updateDevice(selectedId, { name: editName.trim() || d.name, conn: editConn, port: editPort });
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
      return;
    }
    setBanner({ type: 'success', text: `บันทึกการตั้งค่าของ "${editName.trim() || d.name}" แล้ว` });
  }

  // A real check against a known test weight: the owner puts a certified weight on the scale,
  // enters its nominal value, and the actual deviation is what gets recorded. This used to log a
  // random "คลาดเคลื่อน" number as if a calibration had been measured.
  async function handleCalibrate() {
    if (reader.status !== 'connected' || !reader.reading) {
      setBanner({ type: 'error', text: 'ต้องเชื่อมต่อเครื่องชั่งก่อน จึงจะสอบเทียบกับตุ้มน้ำหนักมาตรฐานได้' });
      return;
    }
    if (!reader.reading.stable) {
      setBanner({ type: 'error', text: 'น้ำหนักยังไม่นิ่ง — รอให้เครื่องชั่งนิ่งแล้วกดสอบเทียบอีกครั้ง' });
      return;
    }
    const input = window.prompt('วางตุ้มน้ำหนักมาตรฐานบนเครื่องชั่ง แล้วกรอกน้ำหนักที่ระบุบนตุ้ม (กก.)');
    if (input === null) return;
    const nominal = parseFloat(input);
    if (!(nominal > 0)) {
      setBanner({ type: 'error', text: 'กรุณากรอกน้ำหนักตุ้มมาตรฐานเป็นตัวเลขมากกว่า 0' });
      return;
    }
    const drift = (reader.netWeight - nominal).toFixed(3);
    try {
      await updateDevice(selectedId, { cal: todayThai, due: '90 วัน', status: 'on' });
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
      return;
    }
    await logActivity({ icon: 'ok', title: `สอบเทียบสำเร็จ · ${d.name}`, sub: `${todayThai} · ${nowTimeStr()} โดยเจ้าของร้าน`, amt: `คลาดเคลื่อน ${drift} กก.` });
    setBanner({ type: 'success', text: `บันทึกผลสอบเทียบ "${d.name}" — ตุ้ม ${nominal} กก. อ่านได้ ${reader.netWeight.toFixed(3)} กก. (คลาดเคลื่อน ${drift} กก.)` });
  }

  async function handleRemove(id = selectedId) {
    // ScrapPurchase.jsx reads `scaleDevices[mainScaleId]` unconditionally, so letting the last
    // scale device be removed would leave that page with no device to fall back to and crash
    // it on the next visit.
    if (order.length <= 1) {
      setBanner({ type: 'error', text: 'ต้องมีเครื่องชั่งอย่างน้อย 1 เครื่อง ไม่สามารถนำเครื่องสุดท้ายออกได้' });
      return;
    }
    const target = devices[id];
    if (!window.confirm(`ยืนยันนำเครื่องชั่ง "${target.name}" ออกจากระบบ?`)) return;
    try {
      await deleteDevice(id);
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
      return;
    }
    if (id === selectedId) {
      const remaining = order.filter((oid) => oid !== id);
      if (remaining[0]) selectDevice(remaining[0]);
      else setSelectedId(null);
    }
    await logActivity({ icon: 'warn', title: `นำเครื่องชั่งออกจากระบบ · ${target.name}`, sub: `${todayThai} · ${nowTimeStr()}`, amt: 'นำออกแล้ว' });
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
            <div className="stat-foot">พร้อมใช้งาน {connectedCount}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-100)', color: 'var(--green-700)' }}>
            <IconCheck />
          </div>
          <div>
            <div className="stat-label">พร้อมใช้งาน</div>
            <div className="stat-value">{connectedCount} เครื่อง</div>
            <div className="stat-foot">{reader.status === 'connected' ? 'คอมนี้เชื่อมเครื่องชั่งอยู่' : 'คอมนี้ยังไม่ได้เชื่อมเครื่องชั่ง'}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <IconWarningTriangle />
          </div>
          <div>
            <div className="stat-label">งดใช้งาน</div>
            <div className="stat-value">{disconnectedCount} เครื่อง</div>
            <div className="stat-foot">{disconnectedCount > 0 ? 'เช่น เสีย / ส่งซ่อม' : 'ทุกเครื่องพร้อมใช้งาน'}</div>
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
              {!reader.supported
                ? 'เบราว์เซอร์นี้เชื่อมเครื่องชั่งโดยตรงไม่ได้ — เปิดหน้านี้ด้วย Chrome หรือ Edge บนคอมที่เสียบสายเครื่องชั่ง (ผ่าน localhost หรือ https)'
                : reader.status === 'connected'
                  ? reader.reading
                    ? reader.reading.stable
                      ? 'เชื่อมต่อแล้ว · น้ำหนักนิ่ง'
                      : 'เชื่อมต่อแล้ว · น้ำหนักยังไม่นิ่ง'
                    : 'เชื่อมต่อแล้ว · รอข้อมูลจากเครื่องชั่ง (ตั้งเครื่องชั่งเป็นโหมดส่งค่าต่อเนื่อง)'
                  : reader.status === 'connecting'
                    ? 'กำลังเชื่อมต่อ...'
                    : reader.error || 'ยังไม่ได้เชื่อมต่อเครื่องชั่งบนคอมเครื่องนี้'}
            </div>
            <div className="hero-device">
              {d.name} · <b>{d.model}</b> · พอร์ต {d.port}
            </div>
            <div className="hero-reading">
              <span className="val">{reader.netWeight.toFixed(2)}</span>
              <span className="unit">กิโลกรัม</span>
            </div>
            <div className="hero-sub">
              ความละเอียด {d.res}
              {reader.tareOffset !== 0 && ` · หักค่าศูนย์ ${reader.tareOffset.toFixed(2)} กก.`}
            </div>
          </div>
          <div className="hero-actions">
            {reader.status === 'connected' ? (
              <button type="button" className="hero-btn" onClick={reader.disconnect}>
                <IconX />
                ตัดการเชื่อมต่อ
              </button>
            ) : (
              <button
                type="button"
                className="hero-btn primary"
                onClick={reader.connect}
                disabled={!reader.supported || reader.status === 'connecting'}
                title="เลือกพอร์ต USB/COM ที่เสียบสายเครื่องชั่งไว้ — ครั้งต่อไปจะเชื่อมต่อให้อัตโนมัติ"
              >
                <IconPlus />
                เชื่อมต่อเครื่องชั่ง
              </button>
            )}
            <button type="button" className="hero-btn" onClick={tare} disabled={reader.status !== 'connected'}>
              <IconTare />
              ตั้งค่าศูนย์ (Tare)
            </button>
            {reader.tareOffset !== 0 && (
              <button type="button" className="hero-btn" onClick={reader.clearTare}>
                <IconX />
                ล้างค่าศูนย์
              </button>
            )}
            <button type="button" className="hero-btn" onClick={handleCalibrate} disabled={reader.status !== 'connected'}>
              <IconRefresh />
              สอบเทียบกับตุ้มมาตรฐาน
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
                        title="กดเพื่อสลับสถานะพร้อมใช้งาน / งดใช้งาน"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleConnected(id);
                        }}
                      >
                        {dev.status === 'on' ? <IconCheck /> : null}
                        {dev.status === 'on' ? 'พร้อมใช้งาน' : 'งดใช้งาน'}
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
            {activity.length === 0 && <div className="empty-hint">ยังไม่มีประวัติสอบเทียบ</div>}
            {activity.slice(0, 5).map((log, i) => (
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

              <div className="field-row">
                <div className="field" style={{ flex: 1 }}>
                  <label>ความเร็วสื่อสาร (Baud rate) — คอมนี้</label>
                  <select
                    className="input-plain"
                    value={reader.serialSettings.baudRate}
                    onChange={(e) => reader.setSerialSettings((prev) => ({ ...prev, baudRate: Number(e.target.value) }))}
                  >
                    {BAUD_RATES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>คำสั่งขอค่า (ถ้าเครื่องต้องการ)</label>
                  <input
                    className="input-plain"
                    placeholder="เว้นว่าง = ส่งค่าต่อเนื่อง"
                    value={reader.serialSettings.pollCommand}
                    onChange={(e) => reader.setSerialSettings((prev) => ({ ...prev, pollCommand: e.target.value }))}
                  />
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
                <button type="button" className="btn btn-ghost btn-block" onClick={handleCalibrate} disabled={reader.status !== 'connected'}>
                  <IconRefresh />
                  สอบเทียบกับตุ้มมาตรฐาน
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
              <span>พร้อมใช้งาน</span>
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
