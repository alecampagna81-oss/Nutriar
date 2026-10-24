import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/hooks';
import { dt } from '../../lib/format';
import { Button, Card, Empty, ErrorBox, Loading, PageHeader } from '../../components/ui';
import { NewPlanModal } from './patient/Plans';

export function Templates() {
  const { data, error, loading, reload } = useApi<any[]>('/api/pro/templates');
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Plantillas de planes" subtitle="Planes reutilizables. Al crear un plan para un paciente podés partir de una plantilla." actions={<Button onClick={() => setOpen(true)}>Nueva plantilla</Button>} />
      <Card>
        <ErrorBox error={error} onRetry={reload} />
        {loading && !data ? <Loading /> : data?.length ? (
          <ul className="list">
            {data.map((t) => (
              <li key={t.id} className="row-between">
                <span><Link to={`/pro/planes/${t.id}`} className="name">{t.title}</Link><br /><span className="small muted">{t.weeks} semana{t.weeks > 1 ? 's' : ''} · actualizada {dt(t.updated_at)}</span></span>
                <Link to={`/pro/planes/${t.id}`} className="btn btn-secondary btn-sm">Editar</Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Todavía no tenés plantillas">También podés guardar un plan de paciente como plantilla desde el editor.</Empty>
        )}
      </Card>
      {open ? <NewPlanModal patientId={null} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
