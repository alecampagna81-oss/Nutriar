import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { NotificationBell, useNotifications } from '../../components/Notifications';

const icons: Record<string, string> = {
  hoy: 'M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  plan: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h4',
  registrar: 'M12 5v14M5 12h14',
  avances: 'M4 19h16M6 15l4-4 3 3 5-6',
  mensajes: 'M4 5h16v11H8l-4 4z',
};

export function PatientLayout() {
  const { appName, me } = useAuth();
  const notif = useNotifications();
  const loc = useLocation();
  useEffect(() => {
    notif.reload();
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  const items = [
    ['/app', 'Hoy', 'hoy'],
    ['/app/plan', 'Mi plan', 'plan'],
    ['/app/registrar', 'Registrar', 'registrar'],
    ['/app/avances', 'Avances', 'avances'],
    ['/app/mensajes', 'Mensajes', 'mensajes'],
  ];
  return (
    <div className="patient-shell">
      <header className="patient-top">
        <Link to="/app" className="row" style={{ textDecoration: 'none', color: 'var(--primary)', fontWeight: 800, gap: '0.4rem' }}>
          <img src="/icon.svg" alt="" width={28} height={28} /> {appName}
        </Link>
        <div className="row" style={{ gap: '0.2rem' }}>
          <NotificationBell data={notif.data} reload={notif.reload} />
          <Link to="/app/perfil" className="btn btn-ghost btn-sm" aria-label="Mi perfil">{me?.first_name ?? 'Perfil'}</Link>
        </div>
      </header>
      <main className="patient-main">
        <Outlet />
      </main>
      <nav className="bottom-nav" aria-label="Secciones">
        {items.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end={to === '/app'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={icons[icon]} />
            </svg>
            {label}
            {icon === 'mensajes' && notif.data?.unread_messages ? <span className="dot">{notif.data.unread_messages}</span> : null}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
