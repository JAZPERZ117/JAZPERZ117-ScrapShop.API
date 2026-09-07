// Every real menu key — matches navItems.js `key` and the route `path` in App.jsx, with
// the index route ("/") mapped to "purchase". Kept in one place so the sidebar (what's
// shown) and the route guard (what's actually reachable by URL) can never drift apart.
export const ALL_MENU_KEYS = [
  'dashboard',
  'purchase',
  'receipts',
  'payroll',
  'customers',
  'products',
  'categories',
  'deductions',
  'scales',
  'deliveries',
  'print-center',
  'daily-summary',
  'monthly-report',
  'annual-report',
  'product-report',
  'tax-report',
  'payroll-report',
  'users',
  'settings',
];

// What each role can genuinely open. "owner" is the role string the real backend login
// returns (server/src/index.js seeds it as the SQL users.role column) for the one account
// with a real password; "เจ้าของร้าน" is the equivalent role a directory entry can carry
// for a PIN-login session, so both map to full access.
export const ROLE_MENU_ACCESS = {
  owner: ALL_MENU_KEYS,
  เจ้าของร้าน: ALL_MENU_KEYS,
  ผู้จัดการ: ALL_MENU_KEYS.filter((k) => k !== 'users' && k !== 'settings'),
  แคชเชียร์: ['dashboard', 'purchase', 'receipts', 'customers', 'deductions', 'print-center', 'daily-summary'],
  พนักงานชั่งของ: ['dashboard', 'purchase', 'scales'],
};

export function canAccess(role, key) {
  const allowed = ROLE_MENU_ACCESS[role];
  return Array.isArray(allowed) && allowed.includes(key);
}
