import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi, useInterval } from '../lib/hooks';
import { ago } from '../lib/format';

export interface NotifData {
  items: { id: string; kind: string; title: string; link: string | null; created_at: string; read_at: string | null }[];
  unread: number;
  unread_messages: number;
}

/** Notificaciones internas (se actualizan cada 30 s mientras la pestaña está visible). */
export function useNotifications() {
  const n = useApi<NotifData>('/api/notifications');
  useInterval(n.reload, 30000);
  return n;
}

export function NotificationBell({ data, reload, light }: { data: NotifData | null; reload: () => void; light?: boolean }) {
  const [open, setOpen] = useState(false);
  const unread = data?.unread ?? 0;
  async function markAll() {
    await api.post('/api/notifications/read').catch(() => undefined);
    reload();
  }
  return (
    <div className="notif-wrap">
      <button className="icon-btn" style={{ color: light ? '#fff' : undefined, fontSize: '1.1rem' }} aria-label={`Notificaciones${unread ? `: ${unread} sin leer` : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg>
        {unread ? <span className="nav-count" style={{ marginLeft: 2 }}>{unread}</span> : null}
      </button>
      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Notificaciones">
          <div className="row-between" style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--line)' }}>
            <strong>Notificaciones</strong>
            {unread ? <button className="btn btn-ghost btn-sm" onClick={markAll}>Marcar todas como leídas</button> : null}
          </div>
          {data?.items.length ? (
            data.items.map((n) => (
              <Link
                key={n.id}
                to={n.link ?? '#'}
                className={`notif-item ${n.read_at ? '' : 'unread'}`}
                onClick={() => {
                  setOpen(false);
                  if (!n.read_at) api.post('/api/notifications/read', { id: n.id }).then(reload).catch(() => undefined);
                }}
              >
                <div>{n.title}</div>
                <div className="small muted">{ago(n.created_at)}</div>
              </Link>
            ))
          ) : (
            <p className="muted" style={{ padding: '0.9rem' }}>No tenés notificaciones.</p>
          )}
          <p className="small muted" style={{ padding: '0.6rem 0.9rem' }}>Los avisos se ven dentro de la aplicación. No hay notificaciones push con la app cerrada.</p>
        </div>
      ) : null}
    </div>
  );
}
