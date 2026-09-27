// A scrap shop's revenue is what buyers/factories pay for scrap shipped out (Deliveries), not
// what the shop pays sellers when buying it in (Receipts) — that's cost. Every report that shows
// profit or taxable income sums sales from here so they can't drift apart again.
export function sumSales(deliveries, order, inRange) {
  let total = 0;
  for (const id of order) {
    const d = deliveries[id];
    if (d && inRange(d.date || '')) total += d.totalAmount || 0;
  }
  return total;
}

// Shop running costs (ExpensesContext) in the same date range; `onlyCash` narrows to money that
// physically left the cash drawer, for the daily cash figures.
export function sumExpenses(expenses, order, inRange, onlyCash = false) {
  let total = 0;
  for (const id of order) {
    const e = expenses[id];
    if (e && inRange(e.date || '') && (!onlyCash || e.payMethod === 'cash')) total += e.amount || 0;
  }
  return total;
}

// Thai personal income tax brackets (progressive).
const TAX_BRACKETS = [
  { upTo: 150000, rate: 0 },
  { upTo: 300000, rate: 0.05 },
  { upTo: 500000, rate: 0.1 },
  { upTo: 750000, rate: 0.15 },
  { upTo: 1000000, rate: 0.2 },
  { upTo: 2000000, rate: 0.25 },
  { upTo: 5000000, rate: 0.3 },
  { upTo: Infinity, rate: 0.35 },
];

export function calcProgressiveTax(netIncome) {
  let tax = 0;
  let lower = 0;
  for (const bracket of TAX_BRACKETS) {
    if (netIncome <= lower) break;
    tax += (Math.min(netIncome, bracket.upTo) - lower) * bracket.rate;
    lower = bracket.upTo;
  }
  return tax;
}

// Income here is sales (see sumSales). A business under section 40(8) deducts either its actual
// costs or a flat percentage of income — for a reseller whose biggest cost is buying stock in,
// "actual" is usually the relevant one, so it's the default; "flat60" stays for comparison.
// Which method this shop may use is for the Revenue Department to confirm, not this app.
export function estimateTax({ income, actualExpenses, method, isHalfYear }) {
  const expenseDeduct = method === 'flat60' ? income * 0.6 : actualExpenses;
  const personalDeduct = isHalfYear ? 30000 : 60000;
  const netIncome = Math.max(income - expenseDeduct - personalDeduct, 0);
  return { expenseDeduct, personalDeduct, netIncome, tax: calcProgressiveTax(netIncome) };
}

export const EXPENSE_METHOD_LABELS = { actual: 'หักค่าใช้จ่ายตามจริง', flat60: 'หักค่าใช้จ่ายเหมา 60%' };

// Profit can genuinely go negative (a month spent stocking up before selling), so losses show
// with a minus sign instead of being clamped to zero.
export function signedMoney(n) {
  const abs = Math.abs(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '−฿' : '฿') + abs;
}
