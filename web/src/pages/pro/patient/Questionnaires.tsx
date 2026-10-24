import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../lib/api';
import { useApi } from '../../../lib/hooks';
import { dt } from '../../../lib/format';
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Loading, Textarea, useAction } from '../../../components/ui';
import { RecallEditor } from '../../../components/RecallEditor';
import { BASE_QUESTIONS, RECALL_KEY } from '@shared/questionnaire';

const ST: Record<string, { label: string; tone: string }> = { pendiente: { label: 'Pendiente del paciente', tone: 'warn' }, enviado: { label: 'Enviado: revisar', tone: 'info' }, revisado: { label: 'Revisado', tone: 'ok' } };

export function Questionnaires({ patientId, hasAccount }: { patientId: string; hasAccount: boolean }) {
  const { data, error, loading, reload } = useApi<any[]>(`/api/pro/patients/${patientId}/questionnaires`);
  const { busy, run } = useAction();
  const [note, setNote] = useState('');
  async function request() {
    if (await run(() => api.post(`/api/pro/patients/${patientId}/questionnaires`), 'Cuestionario solicitado')) reload();
  }
  async function review(id: string) {
    if (await run(() => api.post(`/api/pro/patients/${patientId}/questionnaires/${id}/review`, { note }), 'Marcado como revisado')) {
      setNote('');
      reload();
    }
  }
  if (loading && !data) return <Loading />;
  return (
    <Card title="Cuestionario previo a la consulta" actions={<Button onClick={request} busy={busy} disabled={data?.some((q) => q.status === 'pendiente')}>Solicitar cuestionario</Button>}>
      <ErrorBox error={error} onRetry={reload} />
      {!hasAccount ? <Alert tone="warn">El paciente necesita activar su acceso para completar el cuestionario.</Alert> : null}
      <p className="small muted">Incluye preguntas base, registro de 24 horas y tus <Link to="/pro/configuracion">preguntas adicionales</Link> activas al momento de solicitarlo.</p>
      {data?.length ? (
        data.map((q) => (
          <details key={q.id} open={q.status === 'enviado'} className="card" style={{ marginTop: '0.8rem' }}>
            <summary className="row-between" style={{ cursor: 'pointer' }}>
              <span>Solicitado el {dt(q.requested_at)}{q.submitted_at ? ` · enviado el ${dt(q.submitted_at)}` : ''}</span>
              <Badge tone={ST[q.status].tone}>{ST[q.status].label}</Badge>
            </summary>
            {q.status === 'pendiente' ? (
              <p className="muted" style={{ marginTop: '0.6rem' }}>El paciente todavía no lo envió.</p>
            ) : (
              <div style={{ marginTop: '0.8rem' }}>
                <dl className="kv">
                  {BASE_QUESTIONS.map((b) => (
                    <Fragment key={b.key}><dt>{b.label}</dt><dd>{q.answers[b.key] || <span className="muted">Sin respuesta</span>}</dd></Fragment>
                  ))}
                  {q.questions.map((x: any) => (
                    <Fragment key={x.id}><dt>{x.text}</dt><dd>{q.answers[x.id] === true ? 'Sí' : q.answers[x.id] === false ? 'No' : q.answers[x.id] ?? <span className="muted">Sin respuesta</span>}</dd></Fragment>
                  ))}
                </dl>
                <h3 style={{ marginTop: '1rem' }}>Registro de las últimas 24 horas</h3>
                <RecallEditor value={q.answers[RECALL_KEY] ?? []} readOnly />
                {q.status === 'enviado' ? (
                  <div style={{ marginTop: '0.8rem' }}>
                    <Field label="Nota de revisión (interna)">{(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
                    <Button onClick={() => review(q.id)} busy={busy}>Marcar como revisado</Button>
                  </div>
                ) : q.review_note ? (
                  <p className="small muted">Nota de revisión: {q.review_note}</p>
                ) : null}
              </div>
            )}
          </details>
        ))
      ) : (
        <Empty title="Todavía no solicitaste cuestionarios" />
      )}
    </Card>
  );
}
