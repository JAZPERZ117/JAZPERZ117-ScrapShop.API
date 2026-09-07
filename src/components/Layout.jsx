import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { clearAuth, getStoredAuth } from '../lib/auth.js';
import './Layout.css';

export default function Layout() {
  const navigate = useNavigate();
  const user = getStoredAuth();

  function handleLogout() {
    clearAuth();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app">
      <Sidebar onLogout={handleLogout} />
      <div className="main">
        <Topbar user={user} />
        <div className="content">
          <Outlet context={{ user }} />
        </div>
      </div>
    </div>
  );
}
