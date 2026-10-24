import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { formatDate, num, VERIFICATION } from '../../lib/format';
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, FormError, Input, Loading, Modal, PageHeader, Select, Textarea, Toggle, useAction } from '../../components/ui';
import { FoodBadges, FoodPicker } from '../../components/FoodPicker';
import { ALLERGENS } from '@shared/nutrition';

export function Foods() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [mine, setMine] = useState(false);
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQ(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const { data, error, loading, reload } = useApi<any[]>(`/api/foods?search=${encodeURIComponent(q)}&kind=${kind}&mine=${mine ? 1 : 0}&include_demo=${demo ? 1 : 0}`);
  const [detail, setDetail] = useState<string | null>(null);
  const [editFood, setEditFood] = useState<any>(null);
  const [editRecipe, setEditRecipe] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const done = () => {
    setEditFood(null);
    setEditRecipe(null);
    setImporting(false);
    reload();
  };
  return (
    <>
      <PageHeader
        title="Alimentos, productos y recetas"
        actions={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>Importar CSV</Button>
            <Button variant="secondary" onClick={() => setEditRecipe({})}>Nueva receta</Button>
            <Button onClick={() => setEditFood({})}>Nuevo alimento o producto</Button>
          </>
        }
      />
      <Alert tone="info">
        Catálogo inicial: 121 alimentos genéricos de la tabla USDA SR28 (dominio público) seleccionados y traducidos, y 6 recetas base sin cocción. No incluye productos de marca argentinos verificados: cargalos desde la etiqueta. Los alimentos que crees son privados.
      </Alert>
      <Card>
        <div className="row" style={{ marginBottom: '0.6rem' }}>
          <Input placeholder="Buscar por nombre, marca o categoría" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 360 }} aria-label="Buscar" />
          <Select value={kind} onChange={(e) => setKind(e.target.value)} style={{ maxWidth: 220 }} aria-label="Tipo">
            <option value="">Todos los tipos</option>
            <option value="generico">Genéricos</option>
            <option value="producto">Productos de marca</option>
            <option value="receta">Recetas</option>
          </Select>
          <Toggle label="Solo los míos" checked={mine} onChange={setMine} />
          <Toggle label="Mostrar datos DEMO" checked={demo} onChange={setDemo} />
        </div>
        <ErrorBox error={error} onRetry={reload} />
        {loading && !data ? <Loading /> : data?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nombre</th><th>Categoría</th><th className="num">Energía</th><th className="num">Prot.</th><th className="num">Carb.</th><th className="num">Grasas</th><th>Referencia</th></tr></thead>
              <tbody>
                {data.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ padding: 0, minHeight: 0, textAlign: 'left' }} onClick={() => setDetail(f.id)}>{f.name}</button>
                      {f.brand ? <span className="muted small"> · {f.brand}</span> : null}
                      <div className="row" style={{ gap: '0.25rem' }}><FoodBadges f={f} />{f.own ? <Badge>Propio</Badge> : null}</div>
                    </td>
                    <td className="small">{f.category}</td>
                    {(['energy_kcal', 'protein_g', 'carbs_g', 'fat_g'] as const).map((k) => <td key={k} className="num">{f[k] === null ? <span className="muted" title="Dato faltante">s/d</span> : num(f[k], k === 'energy_kcal' ? 0 : 1)}</td>)}
                    <td className="small">por {num(f.basis_amount, 0)} {f.basis_unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted">“s/d” = sin dato (no es cero). Se muestran hasta 60 resultados: refiná la búsqueda.</p>
          </div>
        ) : (
          <Empty title="Sin resultados" />
        )}
      </Card>
      {detail ? <FoodDetail id={detail} onClose={() => setDetail(null)} onEdit={(f) => { setDetail(null); f.kind === 'receta' ? setEditRecipe(f) : setEditFood(f); }} onChanged={reload} /> : null}
      {editFood ? <FoodForm initial={editFood} onClose={() => setEditFood(null)} onSaved={done} /> : null}
      {editRecipe ? <RecipeForm initial={editRecipe} onClose={() => setEditRecipe(null)} onSaved={done} /> : null}
      {importing ? <ImportCsv onClose={() => setImporting(false)} onDone={done} /> : null}
    </>
  );
}

function FoodDetail({ id, onClose, onEdit, onChanged }: { id: string; onClose: () => void; onEdit: (f: any) => void; onChanged: () => void }) {
  const { data: f, error, reload } = useApi<any>(`/api/foods/${id}`);
  const [m, setM] = useState({ name: '', amount: '', unit: 'g', source: '' });
  const { busy, run } = useAction();
  async function addMeasure() {
    if (await run(() => api.post(`/api/foods/${id}/measures`, { ...m, amount: Number(m.amount.replace(',', '.')) }), 'Medida agregada')) {
      setM({ name: '', amount: '', unit: 'g', source: '' });
      reload();
    }
  }
  async function archive() {
    if (await run(() => api.post(`/api/foods/${id}/archive`), 'Alimento archivado')) {
      onChanged();
      onClose();
    }
  }
  return (
    <Modal wide title={f?.name ?? 'Alimento'} onClose={onClose} footer={f?.own ? <><Button variant="ghost" onClick={archive} busy={busy}>Archivar</Button><Button onClick={() => onEdit(f)}>Editar</Button></> : <Button onClick={onClose}>Cerrar</Button>}>
      <ErrorBox error={error} />
      {!f ? <Loading /> : (
        <>
          <div className="row" style={{ gap: '0.3rem', marginBottom: '0.6rem' }}><FoodBadges f={f} />{f.allergens.map((a: string) => <Badge key={a} tone="danger">{ALLERGENS[a]}</Badge>)}</div>
          {f.is_demo ? <Alert tone="danger">Dato FICTICIO de demostración. No usar con pacientes reales.</Alert> : null}
          <div className="grid-2">
            <dl className="kv">
              <dt>Tipo</dt><dd>{f.kind}</dd>
              {f.brand ? <><dt>Marca</dt><dd>{f.brand}</dd></> : null}
              {f.presentation ? <><dt>Presentación</dt><dd>{f.presentation}</dd></> : null}
              <dt>Categoría</dt><dd>{f.category}</dd>
              <dt>Estado</dt><dd>{f.state ?? '—'}</dd>
              <dt>Porción comestible</dt><dd>{f.edible_portion_pct ? `${num(f.edible_portion_pct, 0)} %` : '—'}</dd>
              <dt>Densidad</dt><dd>{f.density_g_per_ml ? `${f.density_g_per_ml} g/ml` : 'no documentada'}</dd>
            </dl>
            <table className="table">
              <thead><tr><th>Por {num(f.basis_amount, 0)} {f.basis_unit}</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {[['Energía', f.energy_kcal, 'kcal'], ['Proteínas', f.protein_g, 'g'], ['Carbohidratos', f.carbs_g, 'g'], ['Grasas', f.fat_g, 'g'], ['Fibra', f.fiber_g, 'g'], ['Sodio', f.sodium_mg, 'mg']].map(([l, v, u]) => (
                  <tr key={l as string}><td>{l}</td><td className="num">{v === null || v === undefined ? <span className="muted">sin dato</span> : `${num(v as number, 1)} ${u}`}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Fuente y trazabilidad</h3>
          <p className="small">{f.source}{f.source_ref ? ` · ${f.source_ref}` : ''}{f.source_date ? ` · ${formatDate(f.source_date)}` : ''}</p>
          <p className="small muted">Estado de verificación: {VERIFICATION[f.verification]?.label} — {VERIFICATION[f.verification]?.help}</p>
          {f.label_data?.usda_description ? <p className="small muted">Descripción original: {f.label_data.usda_description}. {f.label_data.carbs_note}. {f.label_data.density_from ?? ''}</p> : null}
          {f.recipe ? (
            <>
              <h3>Receta</h3>
              <p className="small">Rinde {num(f.recipe.yield_grams, 0)} g en {num(f.recipe.servings, 0)} porciones ({num(f.recipe.yield_grams / f.recipe.servings, 0)} g por porción).</p>
              <ul>{f.recipe.ingredients.map((i: any) => <li key={i.id}>{i.name}: {num(i.quantity, 0)} {i.unit.startsWith('medida:') ? 'medida(s)' : i.unit}</li>)}</ul>
              <p style={{ whiteSpace: 'pre-wrap' }}>{f.recipe.preparation}</p>
            </>
          ) : null}
          <h3>Medidas caseras</h3>
          {f.measures.length ? <ul>{f.measures.map((x: any) => <li key={x.id}>{x.name} = {num(x.amount, 1)} {x.unit} <span className="small muted">({x.source})</span></li>)}</ul> : <p className="small muted">Sin medidas documentadas: se indica en gramos o mililitros.</p>}
          {f.own && f.kind !== 'receta' ? (
            <div className="grid-3" style={{ alignItems: 'end' }}>
              <Field label="Nueva medida">{(id) => <Input id={id} placeholder="1 unidad mediana" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />}</Field>
              <Field label="Equivale a">{(id) => <div className="row" style={{ flexWrap: 'nowrap' }}><Input id={id} inputMode="decimal" value={m.amount} onChange={(e) => setM({ ...m, amount: e.target.value })} /><Select value={m.unit} onChange={(e) => setM({ ...m, unit: e.target.value })} style={{ width: 80 }}><option>g</option><option>ml</option></Select></div>}</Field>
              <Field label="Origen de la equivalencia">{(id) => <Input id={id} placeholder="Pesado en consultorio / etiqueta" value={m.source} onChange={(e) => setM({ ...m, source: e.target.value })} />}</Field>
              <Button onClick={addMeasure} busy={busy}>Agregar medida</Button>
            </div>
          ) : null}
          {f.used_in?.length ? <p className="small muted">Se usa en: {f.used_in.map((u: any) => u.name).join(', ')}</p> : null}
        </>
      )}
    </Modal>
  );
}

const nOrNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
const str = (v: any) => (v === null || v === undefined ? '' : String(v));

function FoodForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const meta = useApi<any>('/api/foods/meta');
  const [f, setF] = useState<any>({
    kind: initial.kind ?? 'producto', name: initial.name ?? '', brand: initial.brand ?? '', category: initial.category ?? 'Otros', presentation: initial.presentation ?? '',
    state: initial.state ?? '', edible_portion_pct: str(initial.edible_portion_pct), basis_amount: str(initial.basis_amount ?? 100), basis_unit: initial.basis_unit ?? 'g',
    energy_kcal: str(initial.energy_kcal), protein_g: str(initial.protein_g), carbs_g: str(initial.carbs_g), fat_g: str(initial.fat_g), fiber_g: str(initial.fiber_g), sodium_mg: str(initial.sodium_mg),
    density_g_per_ml: str(initial.density_g_per_ml), allergens: initial.allergens ?? [], serving_size: initial.label_data?.serving_size ?? '', ean: initial.label_data?.ean ?? '',
    source: initial.source ?? 'Etiqueta del envase', source_ref: initial.source_ref ?? '', source_date: initial.source_date ?? new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      kind: f.kind, name: f.name, brand: f.brand || null, category: f.category, presentation: f.presentation || null, state: f.state || null,
      edible_portion_pct: nOrNull(f.edible_portion_pct), basis_amount: Number(String(f.basis_amount).replace(',', '.')), basis_unit: f.basis_unit,
      energy_kcal: nOrNull(f.energy_kcal), protein_g: nOrNull(f.protein_g), carbs_g: nOrNull(f.carbs_g), fat_g: nOrNull(f.fat_g), fiber_g: nOrNull(f.fiber_g), sodium_mg: nOrNull(f.sodium_mg),
      density_g_per_ml: nOrNull(f.density_g_per_ml), allergens: f.allergens, label_data: f.kind === 'producto' ? { serving_size: f.serving_size || undefined, ean: f.ean || undefined } : null,
      source: f.source, source_ref: f.source_ref || null, source_date: f.source_date || null,
    };
    try {
      if (initial.id) await api.put(`/api/foods/${initial.id}`, body);
      else await api.post('/api/foods', body);
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal wide title={initial.id ? 'Editar alimento' : 'Nuevo alimento o producto'} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} busy={busy}>Guardar</Button></>}>
      <FormError error={error} />
      <Alert tone="info">Dejá vacío un valor que no conozcas: se registra como dato faltante, no como cero. Los alimentos que cargás quedan “sin verificar” y son privados.</Alert>
      <div className="grid-3">
        <Field label="Tipo">{(id) => <Select id={id} value={f.kind} onChange={set('kind')}><option value="producto">Producto de marca</option><option value="generico">Alimento genérico</option></Select>}</Field>
        <Field label="Nombre" required>{(id) => <Input id={id} value={f.name} onChange={set('name')} />}</Field>
        <Field label="Marca" required={f.kind === 'producto'}>{(id) => <Input id={id} value={f.brand} onChange={set('brand')} />}</Field>
        <Field label="Categoría">{(id) => <Select id={id} value={f.category} onChange={set('category')}>{meta.data?.categories.map((c: string) => <option key={c}>{c}</option>)}</Select>}</Field>
        <Field label="Presentación">{(id) => <Input id={id} placeholder="Paquete 500 g" value={f.presentation} onChange={set('presentation')} />}</Field>
        <Field label="Estado">{(id) => <Select id={id} value={f.state} onChange={set('state')}><option value="">Sin especificar</option><option value="crudo">Crudo</option><option value="cocido">Cocido</option><option value="listo_para_consumir">Listo para consumir</option></Select>}</Field>
      </div>
      <h3>Información nutricional</h3>
      <div className="grid-3">
        <Field label="Valores cada">{(id) => <div className="row" style={{ flexWrap: 'nowrap' }}><Input id={id} inputMode="decimal" value={f.basis_amount} onChange={set('basis_amount')} /><Select value={f.basis_unit} onChange={set('basis_unit')} style={{ width: 80 }} aria-label="Unidad"><option>g</option><option>ml</option></Select></div>}</Field>
        <Field label="Energía (kcal)">{(id) => <Input id={id} inputMode="decimal" value={f.energy_kcal} onChange={set('energy_kcal')} />}</Field>
        <Field label="Proteínas (g)">{(id) => <Input id={id} inputMode="decimal" value={f.protein_g} onChange={set('protein_g')} />}</Field>
        <Field label="Carbohidratos (g)" hint="En etiquetas argentinas: carbohidratos disponibles">{(id) => <Input id={id} inputMode="decimal" value={f.carbs_g} onChange={set('carbs_g')} />}</Field>
        <Field label="Grasas totales (g)">{(id) => <Input id={id} inputMode="decimal" value={f.fat_g} onChange={set('fat_g')} />}</Field>
        <Field label="Fibra (g)">{(id) => <Input id={id} inputMode="decimal" value={f.fiber_g} onChange={set('fiber_g')} />}</Field>
        <Field label="Sodio (mg)">{(id) => <Input id={id} inputMode="decimal" value={f.sodium_mg} onChange={set('sodium_mg')} />}</Field>
        <Field label="Porción comestible (%)" hint="Si se compra con cáscara o hueso">{(id) => <Input id={id} inputMode="decimal" value={f.edible_portion_pct} onChange={set('edible_portion_pct')} />}</Field>
        <Field label="Densidad (g/ml)" hint="Solo si está documentada">{(id) => <Input id={id} inputMode="decimal" value={f.density_g_per_ml} onChange={set('density_g_per_ml')} />}</Field>
      </div>
      {f.kind === 'producto' ? (
        <div className="grid-3">
          <Field label="Porción de la etiqueta">{(id) => <Input id={id} placeholder="30 g (3 unidades)" value={f.serving_size} onChange={set('serving_size')} />}</Field>
          <Field label="Código de barras (EAN)">{(id) => <Input id={id} inputMode="numeric" value={f.ean} onChange={set('ean')} />}</Field>
        </div>
      ) : null}
      <div className="field">
        <label>Contiene (alérgenos)</label>
        <div className="checks">{Object.entries(ALLERGENS).map(([k, l]) => <label key={k}><input type="checkbox" checked={f.allergens.includes(k)} onChange={(e) => setF({ ...f, allergens: e.target.checked ? [...f.allergens, k] : f.allergens.filter((a: string) => a !== k) })} />{l}</label>)}</div>
      </div>
      <h3>Fuente</h3>
      <div className="grid-3">
        <Field label="Fuente de los datos" required>{(id) => <Input id={id} value={f.source} onChange={set('source')} />}</Field>
        <Field label="Referencia" hint="Lote, URL, edición de la tabla">{(id) => <Input id={id} value={f.source_ref} onChange={set('source_ref')} />}</Field>
        <Field label="Fecha de la fuente">{(id) => <Input id={id} type="date" value={f.source_date} onChange={set('source_date')} />}</Field>
      </div>
    </Modal>
  );
}

function RecipeForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({ name: initial.name ?? '', servings: str(initial.recipe?.servings ?? 2), yield_grams: str(initial.recipe?.yield_grams ?? ''), preparation: initial.recipe?.preparation ?? '', minutes: str(initial.recipe?.minutes ?? '') });
  const [ings, setIngs] = useState<any[]>(initial.recipe?.ingredients?.map((i: any) => ({ ingredient_id: i.ingredient_id, name: i.name, quantity: str(i.quantity), unit: i.unit, measures: [] })) ?? []);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const rawSum = ings.filter((i) => i.unit === 'g').reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  useEffect(() => {
    // Medidas de los ingredientes existentes (para editar)
    if (!initial.id) return;
    ings.forEach((i, idx) => api.get(`/api/foods/${i.ingredient_id}`).then((d) => setIngs((xs) => xs.map((x, j) => (j === idx ? { ...x, measures: d.measures, basis_unit: d.basis_unit, density: d.density_g_per_ml } : x)))));
  }, []);
  async function save() {
    setBusy(true);
    setError(null);
    const body = { name: f.name, servings: Number(f.servings), yield_grams: Number(String(f.yield_grams).replace(',', '.')), preparation: f.preparation, minutes: f.minutes ? Number(f.minutes) : null, ingredients: ings.map((i) => ({ ingredient_id: i.ingredient_id, quantity: Number(String(i.quantity).replace(',', '.')), unit: i.unit })) };
    try {
      if (initial.id) await api.put(`/api/foods/recipes/${initial.id}`, body);
      else await api.post('/api/foods/recipes', body);
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal wide title={initial.id ? 'Editar receta' : 'Nueva receta'} onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} busy={busy}>Guardar receta</Button></>}>
      <FormError error={error} />
      <Field label="Nombre" required>{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
      <h3>Ingredientes</h3>
      {ings.map((i, idx) => (
        <div key={idx} className="row" style={{ flexWrap: 'nowrap', marginBottom: '0.4rem' }}>
          <span style={{ flex: 1 }}>{i.name}</span>
          <Input aria-label="Cantidad" inputMode="decimal" style={{ width: 90 }} value={i.quantity} onChange={(e) => setIngs(ings.map((x, j) => (j === idx ? { ...x, quantity: e.target.value } : x)))} />
          <Select aria-label="Unidad" style={{ width: 200 }} value={i.unit} onChange={(e) => setIngs(ings.map((x, j) => (j === idx ? { ...x, unit: e.target.value } : x)))}>
            <option value="g">g</option>
            {i.basis_unit === 'ml' || i.density ? <option value="ml">ml</option> : null}
            {i.measures?.map((m: any) => <option key={m.id} value={`medida:${m.id}`}>{m.name} ({num(m.amount, 0)} {m.unit})</option>)}
          </Select>
          <button className="icon-btn" aria-label="Quitar ingrediente" onClick={() => setIngs(ings.filter((_, j) => j !== idx))}>×</button>
        </div>
      ))}
      <Button variant="secondary" className="btn-sm" onClick={() => setPicking(true)}>+ Agregar ingrediente</Button>
      <h3 style={{ marginTop: '1rem' }}>Rendimiento</h3>
      <Alert tone="info">Indicá el peso final real de la preparación (después de cocinar) y en cuántas porciones se divide. Los valores por porción y por 100 g se calculan con ese rendimiento declarado.{rawSum ? ` Suma de ingredientes en gramos: ${num(rawSum, 0)} g.` : ''}</Alert>
      <div className="grid-3">
        <Field label="Peso final (g)" required>{(id) => <Input id={id} inputMode="decimal" value={f.yield_grams} onChange={(e) => setF({ ...f, yield_grams: e.target.value })} />}</Field>
        <Field label="Porciones" required>{(id) => <Input id={id} inputMode="decimal" value={f.servings} onChange={(e) => setF({ ...f, servings: e.target.value })} />}</Field>
        <Field label="Tiempo (minutos)">{(id) => <Input id={id} inputMode="numeric" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} />}</Field>
      </div>
      <Field label="Preparación">{(id) => <Textarea id={id} rows={6} value={f.preparation} onChange={(e) => setF({ ...f, preparation: e.target.value })} />}</Field>
      {picking ? (
        <FoodPicker
          title="Agregar ingrediente"
          onClose={() => setPicking(false)}
          onPick={async (food) => {
            setPicking(false);
            if (food.kind === 'receta') return;
            setIngs([...ings, { ingredient_id: food.id, name: food.name, quantity: '100', unit: 'g', measures: food.measures ?? [], basis_unit: food.basis_unit }]);
          }}
        />
      ) : null}
    </Modal>
  );
}

function ImportCsv({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<unknown>(null);
  const { busy, run } = useAction();
  const header = 'tipo;nombre;marca;categoria;presentacion;estado;cantidad_referencia;unidad_referencia;energia_kcal;proteinas_g;carbohidratos_g;grasas_g;fibra_g;sodio_mg;alergenos;fuente;fecha_fuente';
  async function check() {
    setError(null);
    try {
      setResult(await api.post('/api/foods/import', { csv, dry_run: true }));
    } catch (e) {
      setError(e);
      setResult(null);
    }
  }
  async function doImport() {
    const r = await run(() => api.post('/api/foods/import', { csv, dry_run: false }));
    if (r) {
      setResult(r);
      onDone();
    }
  }
  return (
    <Modal wide title="Importar alimentos desde CSV" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cerrar</Button><Button variant="secondary" onClick={check}>Validar</Button><Button onClick={doImport} busy={busy} disabled={!result || result.errors.length || !result.valid}>Importar {result?.valid ?? ''}</Button></>}>
      <p className="small">Separador “;” o “,”. Celdas vacías = dato faltante. Decimales con coma o punto. Alérgenos separados por “|” ({Object.keys(ALLERGENS).join(', ')}). Primera fila:</p>
      <pre className="small" style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', padding: '0.5rem', borderRadius: 8 }}>{header}</pre>
      <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>
        Elegir archivo .csv
        <input type="file" accept=".csv,text/csv" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (file) setCsv(await file.text()); }} />
      </label>
      <Textarea aria-label="Contenido CSV" rows={8} value={csv} onChange={(e) => { setCsv(e.target.value); setResult(null); }} placeholder="o pegá el contenido acá" />
      <FormError error={error} />
      {result ? (
        <div style={{ marginTop: '0.6rem' }}>
          {result.imported ? <Alert tone="ok">Se importaron {result.imported} alimentos.</Alert> : <Alert tone={result.errors.length ? 'warn' : 'ok'}>{result.valid} filas válidas, {result.errors.length} con errores. No se importa nada hasta que no haya errores.</Alert>}
          {result.errors.map((e: any) => <p key={e.fila} className="small" style={{ color: 'var(--danger)' }}>Fila {e.fila}: {e.errores.join('; ')}</p>)}
        </div>
      ) : null}
    </Modal>
  );
}
