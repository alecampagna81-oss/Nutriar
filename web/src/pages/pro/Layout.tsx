import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { NotificationBell, useNotifications } from '../../components/Notifications';

const NAV = [
  ['/pro', 'Inicio', true],
  ['/pro/pacientes', 'Pacientes'],
  ['/pro/agenda', 'Agenda'],
  ['/pro/mensajes', 'Mensajes'],
  ['/pro/alimentos', 'Alimentos y recetas'],
  ['/pro/plantillas', 'Plantillas de planes'],
  ['/pro/configuracion', 'Configuración'],
] as const;

export function ProLayout() {
  const { me, logout, appName } = useAuth();
  const [open, setOpen] = useState(false);
  const notif = useNotifications();
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    notif.reload();
  }, [loc.pathname]);
  return (
    <div className="pro-shell">
      <div className="topbar">
        <button className="icon-btn" aria-label="Abrir menú" onClick={() => setOpen(true)}>☰</button>
        <strong>{appName}</strong>
        <NotificationBell data={notif.data} reload={notif.reload} light />
      </div>
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Menú principal">
        <div className="row-between">
          <NavLink to="/pro" className="brand">
            <img src="/icon.svg" alt="" /> {appName}
          </NavLink>
        </div>
        {NAV.map(([to, label, end]) => (
          <NavLink key={to} to={to} end={!!end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            {label}
            {to === '/pro/mensajes' && notif.data?.unread_messages ? <span className="nav-count">{notif.data.unread_messages}</span> : null}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div className="row-between" style={{ marginBottom: '0.5rem' }}>
            <span>{me?.name}</span>
            <NotificationBell data={notif.data} reload={notif.reload} light />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Cerrar sesión</button>
        </div>
      </nav>
      <main className="pro-main" id="contenido">
        <Outlet context={{ reloadNotifications: notif.reload }} />
      </main>
    </div>
  );
}
