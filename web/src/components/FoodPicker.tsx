import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { num, VERIFICATION } from '../lib/format';
import { ALLERGENS } from '@shared/nutrition';
import { Badge, Input, Loading, Modal, Select, Toggle } from './ui';

export function FoodBadges({ f }: { f: { verification: string; is_demo?: boolean; kind: string; state?: string | null } }) {
  const v = VERIFICATION[f.verification];
  return (
    <>
      {f.kind === 'producto' ? <Badge tone="accent">Producto</Badge> : f.kind === 'receta' ? <Badge tone="info">Receta</Badge> : null}
      {f.state ? <Badge>{f.state === 'listo_para_consumir' ? 'listo' : f.state}</Badge> : null}
      {v ? <Badge tone={v.tone} title={v.help}>{v.label}</Badge> : null}
    </>
  );
}

/** Buscador de alimentos, productos y recetas. No sugiere reemplazos: la profesional elige. */
export function FoodPicker({ title, onPick, onClose, patientAllergens = [] }: { title: string; onPick: (food: any) => void; onClose: () => void; patientAllergens?: string[] }) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [category, setCategory] = useState('');
  const [demo, setDemo] = useState(false);
  const [rows, setRows] = useState<any[] | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  useEffect(() => {
    api.get('/api/foods/meta').then((m) => setCats(m.categories)).catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      setRows(null);
      api
        .get(`/api/foods?search=${encodeURIComponent(search)}&kind=${kind}&category=${encodeURIComponent(category)}&include_demo=${demo ? 1 : 0}`)
        .then(setRows)
        .catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(t);
  }, [search, kind, category, demo]);
  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="grid-3">
        <Input autoFocus placeholder="Buscar por nombre o marca" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar alimento" />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          <option value="generico">Alimentos genéricos</option>
          <option value="producto">Productos de marca</option>
          <option value="receta">Recetas</option>
        </Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </Select>
      </div>
      <Toggle label="Incluir datos ficticios de demostración" checked={demo} onChange={setDemo} />
      {!rows ? (
        <Loading />
      ) : rows.length ? (
        <div role="list">
          {rows.map((f) => {
            const conflicts = f.allergens.filter((a: string) => patientAllergens.includes(a));
            return (
              <button key={f.id} className="food-result" role="listitem" onClick={() => onPick(f)}>
                <span>
                  <span className="name">{f.name}</span>
                  {f.brand ? <span className="muted"> · {f.brand}</span> : null}
                  {f.own ? <Badge tone="neutral">Propio</Badge> : null}
                  <br />
                  <span className="row" style={{ gap: '0.3rem' }}>
                    <FoodBadges f={f} />
                    {conflicts.map((a: string) => <Badge key={a} tone="danger">⚠ {ALLERGENS[a]}</Badge>)}
                  </span>
                </span>
                <span className="small muted nowrap" style={{ textAlign: 'right' }}>
                  {f.energy_kcal === null ? 'kcal: sin dato' : `${num(f.energy_kcal, 0)} kcal`}
                  <br />
                  por {num(f.basis_amount, 0)} {f.basis_unit}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="muted">No se encontraron alimentos. Podés crearlo en “Alimentos y recetas”.</p>
      )}
    </Modal>
  );
}
