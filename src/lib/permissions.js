import rolePermissions from './rolePermissions.json';

// Every real menu key — matches navItems.js `key` and the route `path` in App.jsx, with the
// index route ("/") mapped to "purchase". What each role can open lives in rolePermissions.json,
// which server/src/index.js reads too, so the menus a role sees here and the API writes the
// server lets that role make can never drift apart. "owner" is the role the password login
// returns; "เจ้าของร้าน" is the same full access for a PIN-login staff entry.
export const ALL_MENU_KEYS = rolePermissions.allMenuKeys;
export const ROLE_MENU_ACCESS = rolePermissions.roles;

export function canAccess(role, key) {
  const allowed = ROLE_MENU_ACCESS[role];
  return Array.isArray(allowed) && allowed.includes(key);
}
