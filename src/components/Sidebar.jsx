import { NavLink } from 'react-router-dom';
import { IconBrand, IconShop, IconChevronDown, IconLogout } from '../icons.jsx';
import { navSections } from './navItems.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { getStoredAuth } from '../lib/auth.js';
import { canAccess } from '../lib/permissions.js';

export default function Sidebar({ onLogout }) {
  const { settings } = useSettings();
  const role = getStoredAuth()?.role;

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <IconBrand width={20} height={20} />
        </div>
        <div>
          <div className="brand-name">{settings.shopName}</div>
          <div className="brand-sub">ScrapShop</div>
        </div>
      </div>

      <nav className="nav-scroll">
        {navSections.map((section, i) => {
          // Only menus the logged-in account's role is actually allowed to open are shown
          // — this mirrors the route guard in App.jsx, so nothing here is a dead end that
          // a hidden link would otherwise imply exists.
          const visibleItems = section.items.filter((item) => canAccess(role, item.key));
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.label || `section-${i}`}>
              {section.label && <div className="nav-label">{section.label}</div>}
              {visibleItems.map((item) =>
                item.to ? (
                  <NavLink key={item.key} to={item.to} end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                    <item.icon />
                    <span>{item.label}</span>
                  </NavLink>
                ) : (
                  <div key={item.key} className="nav-item nav-item-disabled" title="เร็ว ๆ นี้">
                    <item.icon />
                    <span>{item.label}</span>
                  </div>
                )
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="shop-pill">
          <IconShop />
          <span style={{ flex: 1 }}>{settings.shopName}</span>
          <IconChevronDown style={{ width: 13, height: 13 }} />
        </div>
        <button type="button" className="logout" onClick={onLogout}>
          <IconLogout />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  );
}
