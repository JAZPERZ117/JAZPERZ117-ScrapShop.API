import {
  IconDashboard,
  IconCart,
  IconReceipt,
  IconPayroll,
  IconUsers,
  IconBox,
  IconCategory,
  IconDeduct,
  IconScale,
  IconTruck,
  IconPrint,
  IconBarChart,
  IconCalendarBars,
  IconProductReport,
  IconTax,
  IconGear,
} from '../icons.jsx';

export const navSections = [
  {
    items: [{ key: 'dashboard', label: 'แดชบอร์ด', icon: IconDashboard, to: '/dashboard' }],
  },
  {
    label: 'การทำงาน',
    items: [
      { key: 'purchase', label: 'รับซื้อสินค้า', icon: IconCart, to: '/' },
      { key: 'receipts', label: 'ใบเสร็จรับเงิน', icon: IconReceipt, to: '/receipts' },
      { key: 'payroll', label: 'เงินเดือน', icon: IconPayroll, to: '/payroll' },
      { key: 'customers', label: 'ลูกค้า', icon: IconUsers, to: '/customers' },
      { key: 'products', label: 'สินค้า/รายการรับซื้อ', icon: IconBox, to: '/products' },
      { key: 'categories', label: 'หมวดหมู่สินค้า', icon: IconCategory, to: '/categories' },
      { key: 'deductions', label: 'หักน้ำหนัก/เหตุผล', icon: IconDeduct, to: '/deductions' },
      { key: 'scales', label: 'เครื่องชั่ง', icon: IconScale, to: '/scales' },
      { key: 'deliveries', label: 'ใบส่งสินค้า', icon: IconTruck, to: '/deliveries' },
      { key: 'print-center', label: 'พิมพ์เอกสาร', icon: IconPrint, to: '/print-center' },
    ],
  },
  {
    label: 'รายงาน',
    items: [
      { key: 'daily-summary', label: 'สรุปยอดประจำวัน', icon: IconBarChart, to: '/daily-summary' },
      { key: 'monthly-report', label: 'รายงานประจำเดือน', icon: IconCalendarBars, to: '/monthly-report' },
      { key: 'annual-report', label: 'รายงานประจำปี', icon: IconCalendarBars, to: '/annual-report' },
      { key: 'product-report', label: 'รายงานสินค้า', icon: IconProductReport, to: '/product-report' },
      { key: 'tax-report', label: 'ภาษี ภงด.90/94', icon: IconTax, to: '/tax-report' },
      { key: 'payroll-report', label: 'รายงานเงินเดือน', icon: IconPayroll, to: '/payroll-report' },
    ],
  },
  {
    label: 'ตั้งค่า',
    items: [
      { key: 'users', label: 'ผู้ใช้งาน', icon: IconUsers, to: '/users' },
      { key: 'settings', label: 'ตั้งค่าระบบ', icon: IconGear, to: '/settings' },
    ],
  },
];
