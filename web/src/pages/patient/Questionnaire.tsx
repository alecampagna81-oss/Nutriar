import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { dt } from '../../lib/format';
import { Alert, Button, Card, ErrorBox, Field, Input, Loading, Select, Textarea, useAction } from '../../components/ui';
import { RecallEditor } from '../../components/RecallEditor';
import { BASE_QUESTIONS, RECALL_KEY } from '@shared/questionnaire';

export function Questionnaire() {
  const { data, error, loading, reload } = useApi<any[]>('/api/me/questionnaires');
  const pending = data?.find((q) => q.status === 'pendiente');
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const { busy, run } = useAction();
  const nav = useNavigate();
  useEffect(() => {
    if (pending) setAnswers(pending.answers ?? {});
  }, [pending?.id]);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!pending) {
    const last = data?.[0];
    return (
      <>
        <h1>Cuestionario</h1>
        <Card><p style={{ margin: 0 }}>{last ? `Enviaste tu cuestionario el ${dt(last.submitted_at)}. ¡Gracias!` : 'No tenés cuestionarios pendientes.'}</p></Card>
      </>
    );
  }
  const set = (k: string, v: any) => setAnswers({ ...answers, [k]: v });
  async function save(submit: boolean) {
    const r = await run(() => api.put(`/api/me/questionnaires/${pending.id}`, { answers, submit }), submit ? 'Cuestionario enviado a tu nutricionista' : 'Borrador guardado');
    if (r && submit) nav('/app');
  }
  return (
    <>
      <h1>Cuestionario previo a la consulta</h1>
      <Alert tone="info">Podés guardarlo y seguir después. Cuando lo envíes, ya no se puede modificar.</Alert>
      <Card>
        {BASE_QUESTIONS.map((q) => (
          <Field key={q.key} label={q.label} hint={q.hint}>{(id) => <Textarea id={id} value={answers[q.key] ?? ''} onChange={(e) => set(q.key, e.target.value)} />}</Field>
        ))}
        {pending.questions.map((q: any) => (
          <Field key={q.id} label={q.text}>{(id) =>
            q.kind === 'si_no' ? (
              <Select id={id} value={answers[q.id] === true ? 'si' : answers[q.id] === false ? 'no' : ''} onChange={(e) => set(q.id, e.target.value === '' ? null : e.target.value === 'si')}><option value="">Elegí</option><option value="si">Sí</option><option value="no">No</option></Select>
            ) : q.kind === 'opciones' ? (
              <Select id={id} value={answers[q.id] ?? ''} onChange={(e) => set(q.id, e.target.value)}><option value="">Elegí</option>{q.options.map((o: string) => <option key={o}>{o}</option>)}</Select>
            ) : q.kind === 'numero' ? (
              <Input id={id} inputMode="decimal" value={answers[q.id] ?? ''} onChange={(e) => set(q.id, e.target.value)} />
            ) : (
              <Textarea id={id} value={answers[q.id] ?? ''} onChange={(e) => set(q.id, e.target.value)} />
            )
          }</Field>
        ))}
      </Card>
      <Card title="Todo lo que comiste y tomaste ayer (últimas 24 horas)">
        <p className="small muted">Anotá cada comida o bebida con la hora y la cantidad aproximada.</p>
        <RecallEditor value={answers[RECALL_KEY] ?? []} onChange={(v) => set(RECALL_KEY, v)} />
      </Card>
      <div className="row" style={{ marginTop: '1rem' }}>
        <Button variant="secondary" onClick={() => save(false)} busy={busy}>Guardar y seguir después</Button>
        <Button onClick={() => save(true)} busy={busy}>Enviar a mi nutricionista</Button>
      </div>
    </>
  );
}
