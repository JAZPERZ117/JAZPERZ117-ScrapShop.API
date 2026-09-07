import { createContext, useContext, useEffect } from 'react';
import { usePersistentState } from '../lib/persist.js';

export const ROLES = ['เจ้าของร้าน', 'ผู้จัดการ', 'แคชเชียร์', 'พนักงานชั่งของ'];

// "admin" is the only account with a real backend login (username/password against the
// SQLite users table) — everyone else here logs in only via the PIN quick-login on the
// login page (see Login.jsx), so their `pin` is what a shared front-counter device checks.
export const INITIAL_USERS = {
  admin: { username: 'admin', name: 'เจ้าของร้าน', role: 'เจ้าของร้าน', init: 'จ', bg: 'var(--plum-bg)', fg: 'var(--plum)', lastLogin: 'วันนี้ 10:45 น.', active: true, lastPasswordReset: null, pin: null },
  kanjana: { username: 'kanjana_pos', name: 'น.ส.กาญจนา ศรีสุข', role: 'แคชเชียร์', init: 'กา', bg: 'var(--rose-bg)', fg: 'var(--rose)', lastLogin: 'วันนี้ 09:02 น.', active: true, lastPasswordReset: null, pin: '1234' },
  wittaya: { username: 'wittaya_scale', name: 'นายวิทยา ทองสุข', role: 'พนักงานชั่งของ', init: 'วิ', bg: 'var(--blue-bg)', fg: 'var(--blue)', lastLogin: 'เมื่อวาน 16:20 น.', active: true, lastPasswordReset: null, pin: '5678' },
  prasert: { username: 'prasert_sort', name: 'นายประเสริฐ แสงทอง', role: 'พนักงานชั่งของ', init: 'ปร', bg: 'var(--amber-bg)', fg: 'var(--amber)', lastLogin: '3 พ.ค. 2567', active: false, lastPasswordReset: null, pin: '9012' },
};

export const INITIAL_ORDER = ['admin', 'kanjana', 'wittaya', 'prasert'];

const UsersContext = createContext(null);

export function UsersProvider({ children }) {
  const [users, setUsers] = usePersistentState('scrapshop_users', INITIAL_USERS);
  const [order, setOrder] = usePersistentState('scrapshop_users_order', INITIAL_ORDER);

  // One-time migration: users saved before the PIN quick-login feature existed have no
  // `pin` field at all, which would make them impossible to select in the Users page's
  // edit form (undefined vs '' mismatch) — backfill it to null (no PIN set yet).
  useEffect(() => {
    setUsers((prev) => {
      let changed = false;
      const next = {};
      for (const id in prev) {
        if (prev[id].pin === undefined) {
          changed = true;
          next[id] = { ...prev[id], pin: null };
        } else {
          next[id] = prev[id];
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <UsersContext.Provider value={{ users, setUsers, order, setOrder }}>
      {children}
    </UsersContext.Provider>
  );
}

export function useUsers() {
  const ctx = useContext(UsersContext);
  if (!ctx) throw new Error('useUsers must be used within a UsersProvider');
  return ctx;
}
