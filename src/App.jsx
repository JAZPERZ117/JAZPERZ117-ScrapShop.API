import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import ScrapPurchase from './pages/ScrapPurchase.jsx';
import Receipts from './pages/Receipts.jsx';
import Payroll from './pages/Payroll.jsx';
import PayrollReport from './pages/PayrollReport.jsx';
import Customers from './pages/Customers.jsx';
import Products from './pages/Products.jsx';
import Categories from './pages/Categories.jsx';
import Deductions from './pages/Deductions.jsx';
import Scales from './pages/Scales.jsx';
import Deliveries from './pages/Deliveries.jsx';
import PrintCenter from './pages/PrintCenter.jsx';
import DailySummary from './pages/DailySummary.jsx';
import MonthlyReport from './pages/MonthlyReport.jsx';
import AnnualReport from './pages/AnnualReport.jsx';
import ProductReport from './pages/ProductReport.jsx';
import TaxReport from './pages/TaxReport.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import { getStoredAuth } from './lib/auth.js';
import { canAccess } from './lib/permissions.js';
import { CustomersProvider } from './context/CustomersContext.jsx';
import { ReceiptsProvider } from './context/ReceiptsContext.jsx';
import { DeductionsProvider } from './context/DeductionsContext.jsx';
import { PayrollProvider } from './context/PayrollContext.jsx';
import { CategoriesProvider } from './context/CategoriesContext.jsx';
import { ProductsProvider } from './context/ProductsContext.jsx';
import { ScalesProvider } from './context/ScalesContext.jsx';
import { UsersProvider } from './context/UsersContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { PrintersProvider } from './context/PrintersContext.jsx';
import { DeliveriesProvider } from './context/DeliveriesContext.jsx';

function ProtectedRoute({ children }) {
  const user = getStoredAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Hiding a menu in the sidebar isn't real access control by itself — a role that can't see
// "ตั้งค่าระบบ" must also be blocked from opening /settings directly by URL, so every page
// route is wrapped with this instead of trusting the sidebar filter alone.
function RoleRoute({ permKey, children }) {
  const user = getStoredAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccess(user.role, permKey)) {
    return (
      <div className="page-head">
        <div>
          <h1 className="page-title">ไม่มีสิทธิ์เข้าถึงหน้านี้</h1>
          <div className="page-sub">
            บัญชีของคุณ ({user.role === 'owner' ? 'เจ้าของร้าน' : user.role}) ไม่มีสิทธิ์เปิดเมนูนี้ — ติดต่อเจ้าของร้านหากต้องการสิทธิ์เพิ่มเติม
          </div>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <CustomersProvider>
    <ReceiptsProvider>
    <DeductionsProvider>
    <PayrollProvider>
    <CategoriesProvider>
    <ProductsProvider>
    <ScalesProvider>
    <UsersProvider>
    <SettingsProvider>
    <PrintersProvider>
    <DeliveriesProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RoleRoute permKey="purchase"><ScrapPurchase /></RoleRoute>} />
        <Route path="receipts" element={<RoleRoute permKey="receipts"><Receipts /></RoleRoute>} />
        <Route path="payroll" element={<RoleRoute permKey="payroll"><Payroll /></RoleRoute>} />
        <Route path="customers" element={<RoleRoute permKey="customers"><Customers /></RoleRoute>} />
        <Route path="products" element={<RoleRoute permKey="products"><Products /></RoleRoute>} />
        <Route path="categories" element={<RoleRoute permKey="categories"><Categories /></RoleRoute>} />
        <Route path="deductions" element={<RoleRoute permKey="deductions"><Deductions /></RoleRoute>} />
        <Route path="scales" element={<RoleRoute permKey="scales"><Scales /></RoleRoute>} />
        <Route path="deliveries" element={<RoleRoute permKey="deliveries"><Deliveries /></RoleRoute>} />
        <Route path="print-center" element={<RoleRoute permKey="print-center"><PrintCenter /></RoleRoute>} />
        <Route path="daily-summary" element={<RoleRoute permKey="daily-summary"><DailySummary /></RoleRoute>} />
        <Route path="monthly-report" element={<RoleRoute permKey="monthly-report"><MonthlyReport /></RoleRoute>} />
        <Route path="annual-report" element={<RoleRoute permKey="annual-report"><AnnualReport /></RoleRoute>} />
        <Route path="product-report" element={<RoleRoute permKey="product-report"><ProductReport /></RoleRoute>} />
        <Route path="tax-report" element={<RoleRoute permKey="tax-report"><TaxReport /></RoleRoute>} />
        <Route path="payroll-report" element={<RoleRoute permKey="payroll-report"><PayrollReport /></RoleRoute>} />
        <Route path="dashboard" element={<RoleRoute permKey="dashboard"><Dashboard /></RoleRoute>} />
        <Route path="users" element={<RoleRoute permKey="users"><Users /></RoleRoute>} />
        <Route path="settings" element={<RoleRoute permKey="settings"><Settings /></RoleRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </DeliveriesProvider>
    </PrintersProvider>
    </SettingsProvider>
    </UsersProvider>
    </ScalesProvider>
    </ProductsProvider>
    </CategoriesProvider>
    </PayrollProvider>
    </DeductionsProvider>
    </ReceiptsProvider>
    </CustomersProvider>
  );
}
