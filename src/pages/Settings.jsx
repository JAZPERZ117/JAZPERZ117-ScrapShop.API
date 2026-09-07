import { useEffect, useState } from 'react';
import { IconShop, IconLock, IconInfo, IconCheck, IconSun, IconMoon } from '../icons.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import './Settings.css';

export default function Settings() {
  const { settings, setSettings, updateSetting } = useSettings();
  const [form, setForm] = useState(settings);
  const [banner, setBanner] = useState(null);
  const [dbStatus, setDbStatus] = useState('checking');

  // A real reachability check against the auth API — this app has no actual database
  // connection to report on, but the backend going down is a real, recurring failure mode
  // (surfaced elsewhere as "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้" on login), so this reflects that instead
  // of an unconditional "เชื่อมต่อแล้ว" that would say the same thing even when it's down.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((res) => {
        if (!cancelled) setDbStatus(res.ok ? 'connected' : 'disconnected');
      })
      .catch(() => {
        if (!cancelled) setDbStatus('disconnected');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Applies immediately (unlike the other fields below, which wait for "บันทึกการตั้งค่า")
  // since a theme switch should give instant visual feedback, not require a save step.
  function setTheme(theme) {
    updateSetting('theme', theme);
    setForm((prev) => ({ ...prev, theme }));
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setSettings((prev) => ({ ...prev, ...form }));
    setBanner({ type: 'success', text: 'บันทึกการตั้งค่าระบบเรียบร้อยแล้ว' });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            ตั้งค่า <span>›</span> <b>ตั้งค่าระบบ</b>
          </div>
          <h1 className="page-title">ตั้งค่าระบบ</h1>
          <div className="page-sub">ข้อมูลร้าน ธีมการแสดงผล และความปลอดภัยของระบบ</div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            <IconCheck />
            บันทึกการตั้งค่า
          </button>
        </div>
      </div>

      {banner && <div className={`page-banner banner-${banner.type}`}>{banner.text}</div>}

      <div className="grid" style={{ '--detail-w': '320px' }}>
        <div>
          <div className="card card-pad">
            <div className="card-head">
              <div>
                <div className="card-title">
                  <IconShop />
                  ข้อมูลร้าน
                </div>
                <div className="card-sub">ใช้แสดงบนใบเสร็จและเอกสารต่างๆ ของร้าน</div>
              </div>
            </div>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>ชื่อร้าน</label>
                <input className="input-plain" value={form.shopName} onChange={(e) => setField('shopName', e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>เลขประจำตัวผู้เสียภาษี</label>
                <input className="input-plain" value={form.taxId} onChange={(e) => setField('taxId', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>ที่อยู่ร้าน</label>
              <textarea className="input-plain" value={form.address} onChange={(e) => setField('address', e.target.value)} />
            </div>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>เบอร์โทรศัพท์ร้าน</label>
                <input className="input-plain" value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>เวลาเปิด-ปิดร้าน</label>
                <input className="input-plain" value={form.hours} onChange={(e) => setField('hours', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>ข้อความท้ายใบเสร็จ</label>
              <input className="input-plain" value={form.receiptFooter} onChange={(e) => setField('receiptFooter', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="summary-sticky">
          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconSun />
              ธีมการแสดงผล
            </div>
            <div className="filter-tabs" style={{ width: '100%' }}>
              <button
                type="button"
                className={`filter-tab${form.theme !== 'dark' ? ' active' : ''}`}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                onClick={() => setTheme('light')}
              >
                <IconSun style={{ width: 14, height: 14 }} />
                Light
              </button>
              <button
                type="button"
                className={`filter-tab${form.theme === 'dark' ? ' active' : ''}`}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                onClick={() => setTheme('dark')}
              >
                <IconMoon style={{ width: 14, height: 14 }} />
                Night
              </button>
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconLock />
              ความปลอดภัยการเข้าสู่ระบบ
            </div>
            <div className="toggle-row">
              <div>
                <div className="lbl">จดจำการเข้าสู่ระบบ 30 วัน</div>
                <div className="sub">ไม่ต้องล็อกอินใหม่ทุกครั้งบนอุปกรณ์ที่เชื่อถือได้</div>
              </div>
              <button type="button" className={`switch${form.remember30 ? ' on' : ''}`} onClick={() => setField('remember30', !form.remember30)}></button>
            </div>
            <div className="toggle-row">
              <div>
                <div className="lbl">เข้าสู่ระบบด่วนด้วย PIN</div>
                <div className="sub">อนุญาตพนักงานหน้าร้านล็อกอินด่วนด้วย PIN 4 หลัก</div>
              </div>
              <button type="button" className={`switch${form.pinLogin ? ' on' : ''}`} onClick={() => setField('pinLogin', !form.pinLogin)}></button>
            </div>
          </div>

          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              <IconInfo />
              เกี่ยวกับระบบ
            </div>
            <div className="mini-stat-row">
              <span>เวอร์ชันระบบ</span>
              <span className="n">ScrapShop 1.0.0</span>
            </div>
            <div className="mini-stat-row">
              <span>เซิร์ฟเวอร์ API</span>
              <span className="n" style={{ color: dbStatus === 'disconnected' ? 'var(--rose)' : undefined }}>
                {dbStatus === 'checking' ? 'กำลังตรวจสอบ...' : dbStatus === 'connected' ? 'เชื่อมต่อแล้ว' : 'เชื่อมต่อไม่ได้'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
