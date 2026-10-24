import { useState } from 'react';
import { api } from '../../../lib/api';
import { useApi } from '../../../lib/hooks';
import { formatDate, todayIn } from '../../../lib/format';
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, Textarea, useAction } from '../../../components/ui';
import { RecallEditor } from '../../../components/RecallEditor';

const blank = () => ({ date: todayIn(), title: 'Consulta', internal_notes: '', shared_notes: '', recall_24h: [] as any[] });

export function Consultations({ patientId }: { patientId: string }) {
  const { data, error, loading, reload } = useApi<any[]>(`/api/pro/patients/${patientId}/consultations`);
  const [edit, setEdit] = useState<any>(null);
  const { busy, run } = useAction();
  async function save() {
    const url = `/api/pro/patients/${patientId}/consultations${edit.id ? `/${edit.id}` : ''}`;
    const body = { date: edit.date, title: edit.title, internal_notes: edit.internal_notes, shared_notes: edit.shared_notes, recall_24h: edit.recall_24h };
    if (await run(() => (edit.id ? api.put(url, body) : api.post(url, body)), 'Consulta guardada')) {
      setEdit(null);
      reload();
    }
  }
  if (loading && !data) return <Loading />;
  return (
    <Card title="Consultas y notas de evolución" actions={<Button onClick={() => setEdit(blank())}>Nueva consulta</Button>}>
      <ErrorBox error={error} onRetry={reload} />
      {data?.length ? (
        <ul className="list">
          {data.map((c) => (
            <li key={c.id}>
              <div className="row-between">
                <strong>{formatDate(c.date)} · {c.title}</strong>
                <Button variant="ghost" className="btn-sm" onClick={() => setEdit({ ...c })}>Editar</Button>
              </div>
              {c.internal_notes ? <p><Badge>Interna</Badge> <span style={{ whiteSpace: 'pre-wrap' }}>{c.internal_notes}</span></p> : null}
              {c.shared_notes ? <p><Badge tone="ok">Compartida con el paciente</Badge> <span style={{ whiteSpace: 'pre-wrap' }}>{c.shared_notes}</span></p> : null}
              {c.recall_24h?.length ? <details><summary className="small">Registro de 24 horas ({c.recall_24h.length})</summary><RecallEditor value={c.recall_24h} readOnly /></details> : null}
              <div className="small muted">Registrada por {c.author}</div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Sin consultas registradas" />
      )}
      {edit ? (
        <Modal wide title={edit.id ? 'Editar consulta' : 'Nueva consulta'} onClose={() => setEdit(null)} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={save} busy={busy}>Guardar</Button></>}>
          <div className="grid-2">
            <Field label="Fecha" required>{(id) => <Input id={id} type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} />}</Field>
            <Field label="Título">{(id) => <Input id={id} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />}</Field>
          </div>
          <Alert tone="warn">Las notas internas nunca son visibles para el paciente. Las notas compartidas sí: el paciente las ve en “Avances”.</Alert>
          <Field label="Notas internas (solo profesional)">{(id) => <Textarea id={id} rows={5} value={edit.internal_notes} onChange={(e) => setEdit({ ...edit, internal_notes: e.target.value })} />}</Field>
          <Field label="Indicaciones compartidas con el paciente">{(id) => <Textarea id={id} rows={4} value={edit.shared_notes} onChange={(e) => setEdit({ ...edit, shared_notes: e.target.value })} />}</Field>
          <h3>Registro alimentario de 24 horas</h3>
          <RecallEditor value={edit.recall_24h} onChange={(v) => setEdit({ ...edit, recall_24h: v })} />
        </Modal>
      ) : null}
    </Card>
  );
}
