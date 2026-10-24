import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { formatDate, MEAL_STATUS, todayIn } from '../../lib/format';
import { Alert, Badge, Button, Card, Field, FormError, Input, PrivateImage, Select, Tabs, Textarea, useToast } from '../../components/ui';
import { MEASURE_KINDS } from '@shared/measures';
import { HabitCounter } from './Home';

export function LogPage() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') ?? 'comida');
  const { me } = useAuth();
  return (
    <>
      <h1>Registrar</h1>
      <Tabs
        tabs={[
          { key: 'comida', label: 'Comida' },
          { key: 'habitos', label: 'Agua y hábitos' },
          ...(me?.allow_self_measurements ? [{ key: 'medidas', label: 'Peso y medidas' }] : []),
          ...(me?.allow_body_photos ? [{ key: 'fotos', label: 'Fotos' }] : []),
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'comida' && <MealLog initialMeal={params.get('comida')} />}
      {tab === 'habitos' && <Habits />}
      {tab === 'medidas' && <SelfMeasurements />}
      {tab === 'fotos' && <BodyPhotos />}
    </>
  );
}

function MealLog({ initialMeal }: { initialMeal: string | null }) {
  const { me } = useAuth();
  const plan = useApi<any>('/api/me/plan');
  const logs = useApi<any[]>('/api/me/meal-logs');
  const toast = useToast();
  const meals: { key: string; name: string }[] = plan.data?.content.meals ?? [{ key: 'desayuno', name: 'Desayuno' }, { key: 'almuerzo', name: 'Almuerzo' }, { key: 'merienda', name: 'Merienda' }, { key: 'cena', name: 'Cena' }];
  const blank = () => ({ log_date: todayIn(me?.timezone), meal_key: initialMeal ?? meals[0]?.key ?? '', status: 'cumplida', description: '', comment: '', difficulty: '' });
  const [f, setF] = useState(blank);
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (initialMeal) setF((x) => ({ ...x, meal_key: initialMeal }));
  }, [initialMeal]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const meal = meals.find((m) => m.key === f.meal_key);
    const fd = new FormData();
    fd.append('log_date', f.log_date);
    fd.append('meal_key', meal ? meal.key : 'otra');
    fd.append('meal_name', meal ? meal.name : 'Otra comida');
    fd.append('status', f.status);
    for (const k of ['description', 'comment', 'difficulty'] as const) if (f[k]) fd.append(k, f[k]);
    if (photo) fd.append('photo', photo);
    try {
      await api.post('/api/me/meal-logs', fd);
      toast('Registro guardado. Tu nutricionista lo va a ver.');
      setF(blank());
      setPhoto(null);
      logs.reload();
    } catch (err) {
      setError(err); // el formulario conserva lo escrito
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Card>
        <form onSubmit={submit} noValidate>
          <FormError error={error} />
          <div className="grid-2">
            <Field label="Fecha">{(id) => <Input id={id} type="date" max={todayIn(me?.timezone)} value={f.log_date} onChange={(e) => setF({ ...f, log_date: e.target.value })} />}</Field>
            <Field label="Comida">{(id) => (
              <Select id={id} value={f.meal_key} onChange={(e) => setF({ ...f, meal_key: e.target.value })}>
                {meals.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
                <option value="otra">Otra / fuera de horario</option>
              </Select>
            )}</Field>
          </div>
          <div className="field">
            <label>¿Cómo te fue con lo indicado?</label>
            <div className="row" role="radiogroup">
              {Object.entries(MEAL_STATUS).map(([k, v]) => (
                <button type="button" key={k} role="radio" aria-checked={f.status === k} className={`day-chip ${f.status === k ? 'active' : ''}`} onClick={() => setF({ ...f, status: k })}>{v}</button>
              ))}
            </div>
          </div>
          <Field label="¿Qué comiste?" hint="Opcional si cumpliste el plan tal cual">{(id) => <Textarea id={id} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
          <Field label="Comentario">{(id) => <Input id={id} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} />}</Field>
          <Field label="¿Tuviste alguna dificultad?">{(id) => <Input id={id} value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })} />}</Field>
          <div className="field">
            <label>Foto (opcional)</label>
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
              {photo ? `Foto: ${photo.name}` : 'Sacar o elegir foto'}
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
            <span className="hint">Solo la ve tu nutricionista. Se borran los datos de ubicación de la foto.</span>
          </div>
          <Button type="submit" busy={busy} style={{ width: '100%' }}>Guardar registro</Button>
        </form>
      </Card>
      <Card title="Tus últimos registros">
        {logs.data?.length ? (
          <ul className="list">
            {logs.data.slice(0, 20).map((l) => (
              <li key={l.id} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                {l.photo_url ? <PrivateImage src={l.photo_url} alt={`Foto de ${l.meal_name}`} className="thumb" /> : null}
                <div style={{ flex: 1 }}>
                  <div className="row-between"><strong>{formatDate(l.log_date)} · {l.meal_name}</strong><Badge>{MEAL_STATUS[l.status]}</Badge></div>
                  {l.description ? <div className="small">{l.description}</div> : null}
                  {l.comment ? <div className="small muted">{l.comment}</div> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Todavía no registraste comidas.</p>
        )}
      </Card>
    </>
  );
}

function Habits() {
  const { me } = useAuth();
  const today = todayIn(me?.timezone);
  const { data, reload } = useApi<any[]>('/api/me/habit-logs');
  const habits = me?.habits ?? [];
  if (!habits.length) return <Card><p className="muted" style={{ margin: 0 }}>Tu nutricionista no definió hábitos para registrar.</p></Card>;
  const total = (k: string, d = today) => data?.find((x) => x.log_date === d && x.habit_key === k)?.total ?? 0;
  const days = [...new Set((data ?? []).map((x) => x.log_date))].filter((d) => d !== today).slice(0, 7);
  return (
    <>
      <Card title={`Hoy, ${formatDate(today)}`}>
        {habits.map((h) => <HabitCounter key={h.key} habit={h} total={total(h.key)} date={today} onChanged={reload} />)}
      </Card>
      {days.length ? (
        <Card title="Días anteriores">
          <table className="table">
            <thead><tr><th>Fecha</th>{habits.map((h) => <th key={h.key} className="num">{h.name}</th>)}</tr></thead>
            <tbody>{days.map((d) => <tr key={d}><td>{formatDate(d)}</td>{habits.map((h) => <td key={h.key} className="num">{total(h.key, d)}</td>)}</tr>)}</tbody>
          </table>
        </Card>
      ) : null}
      <p className="small muted">Los recordatorios de agua o comidas no están disponibles todavía: la aplicación no puede avisarte si está cerrada.</p>
    </>
  );
}

function SelfMeasurements() {
  const { me } = useAuth();
  const toast = useToast();
  const kinds = MEASURE_KINDS.filter((k) => k.patientCanReport);
  const [f, setF] = useState({ measured_on: todayIn(me?.timezone), kind: 'peso', value: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const unit = kinds.find((k) => k.key === f.kind)?.unit;
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/me/measurements', { ...f, value: Number(f.value.replace(',', '.')) });
      toast('Medición guardada');
      setF({ ...f, value: '' });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Alert tone="info">Tus mediciones quedan marcadas como “informadas por vos”, separadas de las que toma tu nutricionista.</Alert>
      <FormError error={error} />
      <Field label="Fecha">{(id) => <Input id={id} type="date" value={f.measured_on} onChange={(e) => setF({ ...f, measured_on: e.target.value })} />}</Field>
      <Field label="Qué medís">{(id) => <Select id={id} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</Select>}</Field>
      <Field label={`Valor (${unit})`}>{(id) => <Input id={id} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />}</Field>
      <Button onClick={save} busy={busy} disabled={!f.value} style={{ width: '100%' }}>Guardar</Button>
    </Card>
  );
}

function BodyPhotos() {
  const { me } = useAuth();
  const { data, reload } = useApi<any>('/api/me/body-photos');
  const toast = useToast();
  const [date, setDate] = useState(todayIn(me?.timezone));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append('taken_on', date);
    fd.append('file', file);
    try {
      await api.post('/api/me/body-photos', fd);
      toast('Foto guardada');
      reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Alert tone="info">Opcional. Las fotos son privadas: solo las ven vos y tu nutricionista. Se eliminan los datos de ubicación y cámara.</Alert>
      <FormError error={error} />
      <Field label="Fecha de la foto">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      <label className="btn btn-secondary" style={{ cursor: 'pointer', width: '100%' }}>
        {busy ? <span className="spinner" aria-hidden /> : null} Sacar o elegir foto
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
      </label>
      {data?.photos?.length ? (
        <div className="photo-grid" style={{ marginTop: '1rem' }}>
          {data.photos.map((p: any) => <figure key={p.id}><PrivateImage src={p.url} alt={`Foto del ${p.taken_on ?? ''}`} /><figcaption>{p.taken_on ? formatDate(p.taken_on) : ''}{p.mine ? '' : ' · compartida por tu nutricionista'}</figcaption></figure>)}
        </div>
      ) : null}
    </Card>
  );
}
