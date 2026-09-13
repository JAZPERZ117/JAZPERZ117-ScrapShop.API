import { createContext, useContext, useEffect, useCallback } from 'react';
import { usePersistentState } from '../lib/persist.js';
import { getToken } from '../lib/auth.js';

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

// A handful of fixed avatar colors, picked deterministically from the username so a user
// discovered from the server (created on a different device) still gets a stable, distinct
// color here instead of everyone defaulting to the same one.
const AVATAR_COLORS = [
  { bg: 'var(--green-100)', fg: 'var(--green-700)' },
  { bg: 'var(--rose-bg)', fg: 'var(--rose)' },
  { bg: 'var(--blue-bg)', fg: 'var(--blue)' },
  { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
  { bg: 'var(--plum-bg)', fg: 'var(--plum)' },
];
function avatarColorFor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

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

  // Pulls the real staff directory from the shared server database (server/src/index.js
  // GET /api/users) and merges it into the local cache — this is what makes a PIN or staff
  // member added on one device show up on another, instead of staying stuck in that one
  // browser's localStorage. Only the owner's session can call this (the API requires an owner
  // JWT), so it's a silent no-op for a PIN-login session; that's fine, since only the owner
  // ever opens the Users page. Cosmetic-only fields (avatar color, initial, last-login display)
  // aren't tracked server-side at all, so existing local values for a known username are kept
  // as-is and only assigned fresh for a username discovered for the first time.
  const refreshUsers = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    let res;
    try {
      res = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      return; // offline or the API server isn't running — keep showing the last-known cache
    }
    if (!res.ok) return;
    const { users: serverUsers } = await res.json();

    // Match by each entry's `username` field, not its local dict key — the seeded demo
    // accounts are keyed "kanjana"/"wittaya"/"prasert" locally but "kanjana_pos" etc. by
    // username, so matching on the key would wrongly treat them as brand-new server users
    // and duplicate every row.
    const usernameToId = new Map(Object.entries(users).map(([id, u]) => [u.username, id]));
    const merged = {};
    const newKeys = [];
    for (const su of serverUsers) {
      const existingId = usernameToId.get(su.username);
      const id = existingId || su.username;
      if (!existingId) newKeys.push(id);
      const base = users[id] || {
        init: su.displayName.slice(0, 1),
        ...avatarColorFor(su.username),
        lastLogin: 'ยังไม่เคยเข้าสู่ระบบ',
        lastPasswordReset: null,
      };
      merged[id] = {
        ...base,
        username: su.username,
        name: su.displayName,
        role: su.role,
        active: su.active,
        pin: su.hasPin || null,
        serverId: su.id,
      };
    }
    // Every real account lives on the server now, so anything left over here either never
    // actually made it there (created by a stale copy of this page from before the server
    // became the source of truth) or was deleted from another device — drop it rather than
    // leaving a phantom entry that looks real but can't be edited or logged into.
    setUsers(merged);
    setOrder((prev) => {
      const kept = prev.filter((id) => id in merged);
      const withNew = [...kept, ...newKeys.filter((id) => !kept.includes(id))];
      return withNew.length === prev.length && withNew.every((id, i) => id === prev[i]) ? prev : withNew;
    });
  }, [users, setUsers, setOrder]);

  useEffect(() => {
    refreshUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <UsersContext.Provider value={{ users, setUsers, order, setOrder, refreshUsers }}>
      {children}
    </UsersContext.Provider>
  );
}

export function useUsers() {
  const ctx = useContext(UsersContext);
  if (!ctx) throw new Error('useUsers must be used within a UsersProvider');
  return ctx;
}
