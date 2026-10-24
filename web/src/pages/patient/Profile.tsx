import { Link } from 'react-router-dom';
import { download } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { dt } from '../../lib/format';
import { Button, Card, useAction } from '../../components/ui';
import { ChangePassword } from '../../components/ChangePassword';

export function Profile() {
  const { me, logout } = useAuth();
  const docs = useApi<any[]>('/api/me/documents');
  const { busy, run } = useAction();
  return (
    <>
      <h1>Mi perfil</h1>
      <Card>
        <p style={{ margin: 0 }}>
          <strong>{me?.name}</strong>
          <br />
          <span className="muted">{me?.email}</span>
          <br />
          Nutricionista: {me?.professional_name}
        </p>
      </Card>
      <Card title="Más secciones">
        <div className="stack" style={{ gap: '0.4rem' }}>
          <Link to="/app/turnos" className="btn btn-secondary">Mis turnos</Link>
          <Link to="/app/cuestionario" className="btn btn-secondary">Cuestionario</Link>
          <Link to="/app/compras" className="btn btn-secondary">Lista de compras</Link>
        </div>
      </Card>
      <Card title="Documentos compartidos">
        {docs.data?.length ? (
          <ul className="list">{docs.data.map((d) => <li key={d.id}><a href={`${d.url}?download=1`}>{d.title || d.original_name}</a> <span className="small muted">{dt(d.created_at)}</span></li>)}</ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Tu nutricionista no compartió documentos.</p>
        )}
      </Card>
      <ChangePassword />
      <Card title="Tus datos">
        <p className="small">Podés descargar una copia de la información que ves en la aplicación (plan, registros, mensajes, mediciones y fotos).</p>
        <Button variant="secondary" busy={busy} onClick={() => run(() => download('/api/me/export', 'mis-datos.zip'), 'Descarga lista')}>Descargar mis datos</Button>
      </Card>
      <Button variant="secondary" onClick={logout} style={{ width: '100%', marginTop: '1rem' }}>Cerrar sesión</Button>
    </>
  );
}
