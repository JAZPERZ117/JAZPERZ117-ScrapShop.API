import { createContext, useContext } from 'react';
import { usePersistentState } from '../lib/persist.js';

export const INITIAL_DEVICES = {
  main: { name: 'เครื่องชั่งหลัก', model: 'CAS DB-II 300kg', bg: 'var(--blue-bg)', fg: 'var(--blue)', port: 'COM4', conn: 'สาย USB / RS-232', max: '300 กก.', res: '0.01 กก.', cal: '28 เม.ย. 2567', due: '43 วัน', status: 'on', active: true },
  dock: { name: 'เครื่องชั่งลานหลังร้าน', model: 'Yamato DP-6900 500kg', bg: 'var(--plum-bg)', fg: 'var(--plum)', port: 'YM-6900-A2', conn: 'Bluetooth', max: '500 กก.', res: '0.1 กก.', cal: '15 เม.ย. 2567', due: '30 วัน', status: 'on', active: false },
  mobile: { name: 'เครื่องชั่งเคลื่อนที่', model: 'Tanita KD-200 60kg', bg: 'var(--bg)', fg: 'var(--ink-500)', port: 'COM7', conn: 'สาย USB / RS-232', max: '60 กก.', res: '0.005 กก.', cal: '2 มี.ค. 2567', due: 'เลยกำหนดแล้ว', status: 'off', active: false },
};

export const INITIAL_ORDER = ['main', 'dock', 'mobile'];

export const BLANK_DEVICE = { name: '', model: 'ไม่ระบุรุ่น', bg: 'var(--bg)', fg: 'var(--ink-500)', port: '—', conn: 'สาย USB / RS-232', max: '—', res: '—', cal: 'ยังไม่เคยสอบเทียบ', due: '—', status: 'off', active: false };

const ScalesContext = createContext(null);

export function ScalesProvider({ children }) {
  const [devices, setDevices] = usePersistentState('scrapshop_scales', INITIAL_DEVICES);
  const [order, setOrder] = usePersistentState('scrapshop_scales_order', INITIAL_ORDER);
  const [activity, setActivity] = usePersistentState('scrapshop_scales_activity', []);

  function logActivity(entry) {
    setActivity((prev) => [entry, ...prev].slice(0, 20));
  }

  function toggleConnected(id) {
    setDevices((prev) => ({ ...prev, [id]: { ...prev[id], status: prev[id].status === 'on' ? 'off' : 'on' } }));
  }

  return (
    <ScalesContext.Provider value={{ devices, setDevices, order, setOrder, activity, logActivity, toggleConnected }}>
      {children}
    </ScalesContext.Provider>
  );
}

export function useScales() {
  const ctx = useContext(ScalesContext);
  if (!ctx) throw new Error('useScales must be used within a ScalesProvider');
  return ctx;
}
