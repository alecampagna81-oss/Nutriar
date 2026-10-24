import { useState } from 'react';
import { api } from '../../../lib/api';
import { useApi } from '../../../lib/hooks';
import { dt } from '../../../lib/format';
import { Alert, Badge, Button, Card, Confirm, Empty, ErrorBox, Field, Input, Loading, Toggle, useAction } from '../../../components/ui';
import { UploadButton } from './Photos';

export function Documents({ patientId }: { patientId: string }) {
  const { data, error, loading, reload } = useApi<any[]>(`/api/pro/patients/${patientId}/files?kind=documento`);
  const [title, setTitle] = useState('');
  const [share, setShare] = useState(false);
  const [del, setDel] = useState<any>(null);
  const { busy, run } = useAction();
  async function upload(f: File) {
    const fd = new FormData();
    fd.append('kind', 'documento');
    fd.append('title', title);
    fd.append('shared', String(share));
    fd.append('file', f);
    if (await run(() => api.post(`/api/pro/patients/${patientId}/files`, fd), 'Documento guardado')) {
      setTitle('');
      reload();
    }
  }
  async function toggle(f: any) {
    if (await run(() => api.patch(`/api/pro/patients/${patientId}/files/${f.id}`, { shared_with_patient: !f.shared_with_patient }))) reload();
  }
  async function remove() {
    if (await run(() => api.del(`/api/pro/patients/${patientId}/files/${del.id}`), 'Documento dado de baja')) {
      setDel(null);
      reload();
    }
  }
  if (loading && !data) return <Loading />;
  return (
    <Card title="Documentos adjuntos">
      <ErrorBox error={error} onRetry={reload} />
      <Alert tone="info">PDF o imágenes (máximo 10 MB). Privados por defecto. No se interpretan automáticamente ni se envían a servicios externos.</Alert>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="Título">{(id) => <Input id={id} value={title} placeholder="Ej.: Análisis de sangre" onChange={(e) => setTitle(e.target.value)} />}</Field>
        <div className="field"><Toggle label="Compartir con el paciente" checked={share} onChange={setShare} /></div>
        <div className="field"><UploadButton label="Subir documento" accept="application/pdf,image/jpeg,image/png,image/webp" onFile={upload} busy={busy} /></div>
      </div>
      {data?.length ? (
        <ul className="list">
          {data.map((f) => (
            <li key={f.id} className="row-between">
              <span>
                <a href={`${f.url}?download=1`} className="name">{f.title || f.original_name}</a>
                <br />
                <span className="small muted">{f.original_name} · {(f.size_bytes / 1024).toFixed(0)} KB · {dt(f.created_at)} · {f.uploaded_by_name}</span>
              </span>
              <span className="row">
                {f.shared_with_patient ? <Badge tone="ok">Compartido</Badge> : <Badge>Privado</Badge>}
                <Button variant="ghost" className="btn-sm" onClick={() => toggle(f)}>{f.shared_with_patient ? 'Dejar de compartir' : 'Compartir'}</Button>
                <Button variant="ghost" className="btn-sm" onClick={() => setDel(f)}>Dar de baja</Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="Sin documentos" />
      )}
      {del ? (
        <Confirm title="Dar de baja el documento" danger confirmLabel="Dar de baja" busy={busy} onClose={() => setDel(null)} onConfirm={remove}>
          <p>“{del.title || del.original_name}” dejará de estar accesible. El archivo se conserva hasta la eliminación definitiva del paciente.</p>
        </Confirm>
      ) : null}
    </Card>
  );
}
