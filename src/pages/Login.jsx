import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconScale,
  IconReceipt,
  IconClock,
  IconBrand,
  IconCheck,
  IconCalendar,
  IconUser,
  IconLock,
  IconLockDot,
  IconEye,
  IconArrow,
} from '../icons.jsx';
import { storeAuth } from '../lib/auth.js';
import { useCustomers } from '../context/CustomersContext.jsx';
import { useReceipts, INITIAL_ORDER as RECEIPTS_INITIAL_ORDER } from '../context/ReceiptsContext.jsx';
import { usePayroll } from '../context/PayrollContext.jsx';
import { useUsers } from '../context/UsersContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import './Login.css';

const todayThai = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date());

function parseMoney(s) {
  return parseFloat(String(s).replace(/[^\d.]/g, '')) || 0;
}
function parseWeight(w) {
  return parseFloat(String(w).replace(/[^\d.]/g, '')) || 0;
}
function nowTimeStr() {
  return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
}

export default function Login() {
  const navigate = useNavigate();
  const { order: customerOrder } = useCustomers();
  const { receipts, order: receiptOrder } = useReceipts();
  const { order: staffOrder } = usePayroll();
  const { users, setUsers } = useUsers();
  const { settings } = useSettings();

  const newReceiptIds = receiptOrder.filter((id) => !RECEIPTS_INITIAL_ORDER.includes(id));
  const activeReceipts = receiptOrder.filter((id) => receipts[id].status !== 'void');
  const newActiveReceiptIds = newReceiptIds.filter((id) => receipts[id].status !== 'void');
  const monthTotal = 512450 + newActiveReceiptIds.reduce((s, id) => s + parseMoney(receipts[id].total), 0);
  const monthCount = 186 + newActiveReceiptIds.length;
  const todayWeight = activeReceipts.reduce((s, id) => s + parseWeight(receipts[id].weight), 0);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Seeded from the real "จดจำการเข้าสู่ระบบ 30 วัน" setting (Settings.jsx) instead of always
  // defaulting to true, so turning that setting off genuinely changes what happens here.
  const [remember, setRemember] = useState(settings.remember30);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [showPinLogin, setShowPinLogin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  function validate() {
    const next = {};
    if (!username.trim()) next.username = 'กรุณากรอกชื่อผู้ใช้งานหรือเบอร์โทรศัพท์';
    if (!password) next.password = 'กรุณากรอกรหัสผ่าน';
    return next;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
        return;
      }

      storeAuth(data, remember);
      const matchedId = Object.keys(users).find((id) => users[id].username === data.user.username);
      if (matchedId) {
        const ts = nowTimeStr();
        setUsers((prev) => ({ ...prev, [matchedId]: { ...prev[matchedId], lastLogin: `วันนี้ ${ts}` } }));
      }
      navigate('/', { replace: true });
    } catch {
      setFormError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบว่าเปิดเซิร์ฟเวอร์ API แล้ว');
    } finally {
      setSubmitting(false);
    }
  }

  // Non-admin accounts have no real backend login (see UsersContext.jsx) — this is a
  // deliberately lower-security "shared front-counter device" shortcut, so the session it
  // creates isn't remembered past the browser tab (sessionStorage, not localStorage) and
  // carries a synthetic token rather than a real backend JWT.
  function handlePinLogin(e) {
    e.preventDefault();
    setPinError('');
    if (!/^\d{4}$/.test(pin)) {
      setPinError('กรุณากรอก PIN 4 หลัก');
      return;
    }
    const matchedId = Object.keys(users).find((id) => id !== 'admin' && users[id].pin === pin);
    const matched = matchedId ? users[matchedId] : null;
    if (!matched || !matched.active) {
      setPinError('PIN ไม่ถูกต้อง หรือบัญชีนี้ถูกปิดใช้งาน');
      return;
    }
    storeAuth({ token: 'pin-session', user: { id: matchedId, username: matched.username, displayName: matched.name, role: matched.role } }, false);
    const ts = nowTimeStr();
    setUsers((prev) => ({ ...prev, [matchedId]: { ...prev[matchedId], lastLogin: `วันนี้ ${ts}` } }));
    navigate('/', { replace: true });
  }

  return (
    <div className="login-root">
      <div className="screen">
        <div className="left">
          <div className="ring-sm"></div>
          <div className="float-chip chip-1">
            <IconScale />
            น้ำหนักวันนี้ {todayWeight.toLocaleString('th-TH')} กก.
          </div>
          <div className="float-chip chip-2">
            <IconReceipt />
            ออกใบเสร็จแล้ว {monthCount} ใบ
          </div>
          <div className="float-chip chip-3">
            <IconClock />
            เปิดร้าน {settings.hours}
          </div>

          <div className="left-top">
            <div className="left-brand">
              <div className="left-brand-icon">
                <IconBrand />
              </div>
              <div>
                <div className="left-brand-name">ร้าน อ.อนงค์ค้าของเก่า</div>
                <div className="left-brand-sub">ScrapShop · ระบบบริหารจัดการร้านรับซื้อของเก่า</div>
              </div>
            </div>
          </div>

          <div className="left-mid">
            <div className="left-eyebrow">
              <IconCheck />
              เข้าสู่ระบบอย่างปลอดภัย
            </div>
            <h1 className="left-headline">
              จัดการร้านรับซื้อของเก่า
              <br />
              ให้ <span>ง่ายและแม่นยำ</span> ทุกใบเสร็จ
            </h1>
            <p className="left-body">
              ชั่งน้ำหนัก คำนวณยอด และออกใบเสร็จได้ในหน้าจอเดียว พร้อมสรุปยอดประจำวันและรายงานให้พร้อมทุกสิ้นเดือน
            </p>
          </div>

          <div className="left-stats">
            <div className="stat">
              <div className="num">{customerOrder.length}</div>
              <div className="lbl">ลูกค้าทั้งหมด</div>
            </div>
            <div className="stat">
              <div className="num">{staffOrder.length}</div>
              <div className="lbl">รายชื่อลูกน้อง</div>
            </div>
            <div className="stat">
              <div className="num">฿{monthTotal.toLocaleString('th-TH', { maximumFractionDigits: 0 })}</div>
              <div className="lbl">ยอดรับซื้อเดือนนี้</div>
            </div>
          </div>
        </div>

        <div className="right">
          <div className="form-wrap">
            <div className="form-top">
              <div className="date-pill">
                <IconCalendar />
                {todayThai}
              </div>
            </div>

            <div className="form-head">
              <h1>เข้าสู่ระบบ</h1>
              <p>ยินดีต้อนรับกลับมา กรอกข้อมูลเพื่อเข้าใช้งานระบบร้าน</p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {formError && <div className="form-alert">{formError}</div>}

              <div className={`field${errors.username ? ' has-error' : ''}`}>
                <label htmlFor="username">ชื่อผู้ใช้งาน หรือเบอร์โทรศัพท์</label>
                <div className="input-wrap">
                  <IconUser />
                  <input
                    id="username"
                    type="text"
                    placeholder="เช่น somchai_admin หรือ 089-421-7765"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                </div>
                {errors.username && <p className="field-error">{errors.username}</p>}
              </div>

              <div className={`field${errors.password ? ' has-error' : ''}`}>
                <label htmlFor="password">รหัสผ่าน</label>
                <div className="input-wrap">
                  <IconLock />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="กรอกรหัสผ่านของคุณ"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="toggle-eye"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    <IconEye open={showPassword} />
                  </button>
                </div>
                {errors.password && <p className="field-error">{errors.password}</p>}
              </div>

              <div className="row-between">
                <label className="remember">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  จดจำการเข้าสู่ระบบ
                </label>
                <button type="button" className="forgot" onClick={() => setShowForgotHelp((v) => !v)}>
                  ลืมรหัสผ่าน?
                </button>
              </div>

              {showForgotHelp && (
                <div className="pin-hint" style={{ marginBottom: 16 }}>
                  <IconLockDot />
                  กรุณาติดต่อ <b>เจ้าของร้าน</b> เพื่อขอรีเซ็ตรหัสผ่านให้บัญชีของคุณ
                </div>
              )}

              <button type="submit" className="btn-login" disabled={submitting}>
                {submitting ? <span className="spinner" aria-hidden="true"></span> : <IconArrow />}
                {submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>

              {settings.pinLogin && (
                <>
                  <div className="divider">หรือ</div>

                  {!showPinLogin ? (
                    <button
                      type="button"
                      className="pin-hint"
                      style={{ width: '100%', cursor: 'pointer', textAlign: 'left', background: 'transparent', font: 'inherit', color: 'inherit' }}
                      onClick={() => setShowPinLogin(true)}
                    >
                      <IconLockDot />
                      พนักงานหน้าร้านเข้าสู่ระบบด่วนด้วย PIN 4 หลักได้ที่เครื่องหน้าร้าน
                    </button>
                  ) : (
                    <div className="field" style={{ marginTop: 4 }}>
                      <label htmlFor="pin">PIN 4 หลัก</label>
                      <div className="input-wrap">
                        <IconLockDot />
                        <input
                          id="pin"
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="••••"
                          value={pin}
                          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          autoFocus
                        />
                      </div>
                      {pinError && <p className="field-error">{pinError}</p>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button type="button" className="btn-login" style={{ flex: 1 }} onClick={handlePinLogin}>
                          เข้าสู่ระบบด่วน
                        </button>
                        <button
                          type="button"
                          className="forgot"
                          onClick={() => {
                            setShowPinLogin(false);
                            setPin('');
                            setPinError('');
                          }}
                        >
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </form>

            <div className="form-footer">
              พบปัญหาการเข้าใช้งาน? ติดต่อ <b>เจ้าของร้าน</b> หรือฝ่ายสนับสนุนระบบ
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
