"""
Convierte el PDF de la Tabla SARA 2 (Ministerio de Salud de la Nación, 2022) a la planilla normalizada
que usa scripts/import-table.ts, conservando la fuente de cada valor (color de la celda según la leyenda
de la propia tabla: Argenfoods, USDA, tabla inglesa, FNDDS, rótulos/otras, valor asumido como cero).

Uso: python3 -I scripts/convert_sara2.py <720.pdf> <salida.csv> <informe.json>
Requiere pdfplumber. No modifica valores: celda vacía = dato faltante.
"""
import sys, re, json, csv, collections, unicodedata
import pdfplumber

LEGEND = {
    'Argenfoods': (0.871, 0.918, 0.965),
    'USDA': (1.0, 0.949, 0.8),
    'Tabla inglesa': (0.969, 0.792, 0.675),
    'FNDDS': (0.706, 0.776, 0.906),
    'Cero asumido': (0.886, 0.937, 0.851),
    'Agua por diferencia': (0.851, 0.851, 0.851),
}
WHITE = 'Rótulos u otras fuentes'

WANT_A = {
    'Valor energético': 'energia_kcal', 'Agua': 'agua_g', 'Proteínas': 'proteinas_g', 'Lípidos totales': 'grasas_g',
    'Carbohidratos disponibles': 'carbohidratos_g', 'Carbohidratos totales': 'carbohidratos_totales_g',
    'Fibra alimentaria': 'fibra_g', 'Alcohol': 'alcohol_g',
}
WANT_B = {'Sodio': 'sodio_mg'}

GROUP_CATEGORY = {
    1: 'Verduras', 2: 'Frutas', 3: None, 4: 'Lácteos y huevos', 5: 'Lácteos y huevos', 6: 'Lácteos y huevos', 7: 'Carnes', 8: 'Lácteos y huevos',
    9: 'Pescados y mariscos', 10: 'Aceites y grasas', 11: 'Frutos secos y semillas', 12: 'Azúcares y dulces', 13: 'Azúcares y dulces',
    14: 'Aceites y grasas', 15: 'Otros', 16: 'Condimentos y salsas', 17: 'Condimentos y salsas', 18: 'Azúcares y dulces', 19: 'Condimentos y salsas',
    20: 'Bebidas', 21: 'Bebidas', 22: 'Bebidas', 23: 'Bebidas', 24: 'Infusiones', 25: 'Preparaciones',
}
EXCLUDED_GROUPS = {26}  # suplementos: expresados cada 100 unidades, fuera del alcance (sin recomendaciones automáticas)

def color_name(c):
    if c is None:
        return WHITE
    c = tuple(c) if isinstance(c, (list, tuple)) else (c, c, c)
    if len(c) != 3:
        return WHITE
    best, dist = WHITE, 0.03
    for name, ref in LEGEND.items():
        d = max(abs(a - b) for a, b in zip(c, ref))
        if d < dist:
            best, dist = name, d
    return best

def cluster(values, tol):
    out = []
    for v in sorted(values):
        if out and v - out[-1][-1] <= tol:
            out[-1].append(v)
        else:
            out.append([v])
    return out

def parse_num(s):
    s = s.strip()
    if s == '':
        return None
    if not re.fullmatch(r'-?\d+(,\d+)?', s):
        raise ValueError(s)
    return float(s.replace(',', '.'))

def page_tables(pg):
    """Devuelve las tablas de la página (puede haber dos: la A y la B, una debajo de la otra)."""
    # Solo lo visible: algunas páginas traen una copia oculta fuera del área de la hoja.
    inside = lambda o: 0 <= o['x0'] <= pg.width and 0 <= o['top'] <= pg.height
    rot = [c for c in pg.chars if not c['upright'] and inside(c)]
    if not rot:
        return []
    xgroups = cluster([c['x0'] for c in rot], 1.6)
    centers = [sum(g) / len(g) for g in xgroups]
    rows = collections.defaultdict(list)
    for c in rot:
        rows[min(range(len(centers)), key=lambda i: abs(centers[i] - c['x0']))].append(c)
    titles = []
    for i, cs in rows.items():
        t = ''.join(ch['text'] for ch in sorted(cs, key=lambda c: -c['top']))
        m = re.search(r'Tabla ?(\d+)\.?([AB]):', t)
        if m:
            # El texto del título manda sobre la letra (hay páginas B rotuladas "A" por error).
            part = 'B' if re.search(r'(?i)vitaminas', t) else 'A' if re.search(r'(?i)macronutrientes', t) else m.group(2)
            titles.append((centers[i], (int(m.group(1)), part, t.strip())))
    titles.sort()
    if not titles:
        return []
    # Tabla sin título antes del primer título (p. ej. pág. 99): se infiere por sus columnas.
    titles.insert(0, (-1e9, None))
    words = [w for w in pg.extract_words(extra_attrs=['upright']) if w['upright'] and w['top'] < 700 and inside(w)]
    out = []
    for k, (tx, title) in enumerate(titles):
        nx = titles[k + 1][0] if k + 1 < len(titles) else 1e9
        in_range = lambda x, tx=tx, nx=nx: tx - 5 <= x < nx - 5
        hg = collections.defaultdict(list)
        for w in words:
            if in_range(w['x0']):
                hg[round(w['top'])].append(w)
        heads = []
        for t in sorted(hg):
            ws = sorted(hg[t], key=lambda w: -w['x0'])
            label = ' '.join(w['text'][::-1] for w in ws)
            top, bottom = min(w['top'] for w in ws), max(w['bottom'] for w in ws)
            if heads and top - heads[-1]['bottom'] < 3:  # encabezado en dos líneas
                prev = heads[-1]['label']
                heads[-1]['label'] = prev.rstrip('-') + ('' if prev.endswith('-') else ' ') + label
                heads[-1]['bottom'] = bottom
            else:
                heads.append({'label': label, 'top': top, 'bottom': bottom})
        for h in heads:
            h['mid'] = (h['top'] + h['bottom']) / 2
            h['label'] = re.sub(r'\s+', ' ', h['label']).strip()
        if not heads:
            continue
        if title is None:
            labels = {h['label'] for h in heads}
            nxt = titles[k + 1][1] if k + 1 < len(titles) else None
            if not nxt:
                continue
            part = 'A' if 'Valor energético' in labels else 'B' if 'Sodio' in labels else None
            if not part:
                continue
            title = (nxt[0], part, f'(sin título) {nxt[0]}.{part}')
        name_from = max(h['mid'] for h in heads) + 40
        out_rows = []
        for i in sorted(rows, key=lambda i: centers[i]):
            if not in_range(centers[i]):
                continue
            cs = sorted(rows[i], key=lambda c: c['top'])
            cells, cur = [], [cs[0]]
            for a, b in zip(cs, cs[1:]):
                if b['top'] - a['bottom'] > 1.5:
                    cells.append(cur)
                    cur = [b]
                else:
                    cur.append(b)
            cells.append(cur)
            name_parts, values = [], {}
            for cell in cells:
                text = ''.join(ch['text'] for ch in reversed(cell)).strip()
                mid = (cell[0]['top'] + cell[-1]['bottom']) / 2
                if mid > name_from:
                    name_parts.append(text)
                    continue
                h = min(heads, key=lambda h: abs(h['mid'] - mid))
                if abs(h['mid'] - mid) > 18:
                    continue
                cx = (cell[0]['x0'] + cell[0]['x1']) / 2
                src = WHITE
                for r in pg.rects:
                    if r['x0'] - 0.5 <= cx <= r['x1'] + 0.5 and r['top'] - 0.5 <= mid <= r['bottom'] + 0.5 and (r['bottom'] - r['top']) < 80:
                        src = color_name(r.get('non_stroking_color'))
                values[h['label']] = (text, src)
            out_rows.append({'x': centers[i], 'name': ' '.join(name_parts), 'values': values})
        out.append({'table': title, 'heads': [h['label'] for h in heads], 'rows': out_rows})
    return out

def build(pdf_path):
    pdf = pdfplumber.open(pdf_path)
    data = collections.OrderedDict()  # (grupo, nombre) -> registro
    problems = []
    pages = []
    for pno, pg in enumerate(pdf.pages):
      for t in page_tables(pg):
        group, part, title = t['table']
        if group in EXCLUDED_GROUPS:
            continue
        rows = t['rows']
        notes = {}
        for r in rows:
            m = re.match(r'^(\*+)\s*(.+)', r['name'].strip())
            if m and len(r['values']) < 3:
                notes[len(m.group(1))] = m.group(2).strip()
        is_num = lambda v: re.fullmatch(r'-?\d+(,\d+)?', v[0]) is not None
        cand = []
        for r in rows:
            numeric = sum(1 for v in r['values'].values() if is_num(v)) >= 3
            name_ok = r['name'] and not re.search(r'(Tabla ?\d+\.?[AB]|SARA 2|ENNYS|^Alimento$|^\*)', r['name'])
            if numeric or name_ok:
                cand.append({**r, 'numeric': numeric, 'name': r['name'] if name_ok else ''})
        # Agrupa renglones del mismo alimento: dentro de un alimento la separación es < 12 pt; entre alimentos ~15 pt.
        clusters = []
        for r in sorted(cand, key=lambda r: r['x']):
            if clusters and r['x'] - clusters[-1][-1]['x'] < 12:
                clusters[-1].append(r)
            else:
                clusters.append([r])
        merged = []
        for cl in clusters:
            nums = [r for r in cl if r['numeric']]
            if len(nums) != 1:
                problems.append({'pagina': pno + 1, 'tabla': f'{group}.{part}', 'renglones': [r['name'] for r in cl], 'motivo': f'{len(nums)} renglones numéricos en un mismo alimento'})
                continue
            name = ''
            for f in cl:
                txt = f['name'].strip()
                if not txt:
                    continue
                if name.endswith('-'):
                    name = name[:-1] + txt
                else:
                    name = (name + ' ' + txt).strip()
            merged.append({'name': name, 'values': nums[0]['values'], 'x': nums[0]['x']})
        for it in merged:
            m = re.search(r'(\*+)', it['name'])
            if m:
                it['nota'] = notes.get(len(m.group(1)))
                it['name'] = re.sub(r'\s*\*+', '', it['name']).strip()
        pages.append({'pno': pno + 1, 'group': group, 'part': part, 'items': merged})
    # Unión de las partes A (macronutrientes) y B (minerales, sodio) por nombre normalizado dentro del grupo.
    # Si el título de una página B no coincide con la A anterior (error del PDF), se usa el grupo de la A.
    last_a_group = None
    b_index = {}
    for pg in pages:
        if pg['part'] == 'A':
            last_a_group = pg['group']
            continue
        group = pg['group']
        if last_a_group is not None and group != last_a_group and not any(p2['part'] == 'A' and p2['group'] == group for p2 in pages):
            problems.append({'pagina': pg['pno'], 'motivo': f'el título dice tabla {group}.B pero no existe la {group}.A; se usa el grupo {last_a_group}'})
            group = last_a_group
        for r in pg['items']:
            b_index.setdefault((group, norm_name(r['name'])), (pg['pno'], r))
    used_b = set()
    for pg in pages:
        if pg['part'] != 'A':
            continue
        for k, r in enumerate(pg['items']):
            name = re.sub(r'\s+', ' ', r['name']).strip()
            rec = {'grupo': pg['group'], 'nombre': name, 'valores': {}, 'fuentes': {}, 'paginas': {pg['pno']}, 'nota': r.get('nota')}
            for label, key in WANT_A.items():
                if label in r['values']:
                    text, src = r['values'][label]
                    try:
                        rec['valores'][key] = parse_num(text)
                    except ValueError:
                        problems.append({'pagina': pg['pno'], 'alimento': name, 'columna': label, 'texto': text})
                        rec['valores'][key] = None
                    rec['fuentes'][key] = src
            bkey = (pg['group'], norm_name(name))
            if bkey not in b_index:
                # Título de la página B mal numerado en el PDF: se busca el mismo nombre en otro grupo, si es único.
                same = [k2 for k2 in b_index if k2[1] == norm_name(name) and k2 not in used_b]
                if len(same) == 1:
                    problems.append({'pagina': b_index[same[0]][0], 'motivo': f'parte B de "{name}" con número de tabla {same[0][0]} en el PDF (la A es {pg["group"]}); se unieron por nombre'})
                    bkey = same[0]
            if bkey in b_index:
                bpno, rb = b_index[bkey]
                used_b.add(bkey)
                rec['paginas'].add(bpno)
                for label, key in WANT_B.items():
                    if label in rb['values']:
                        text, src = rb['values'][label]
                        try:
                            rec['valores'][key] = parse_num(text)
                        except ValueError:
                            problems.append({'pagina': bpno, 'alimento': name, 'columna': label, 'texto': text})
                        rec['fuentes'][key] = src
            else:
                problems.append({'pagina': pg['pno'], 'motivo': f'sin parte B (sodio) en el PDF: {name}'})
            key = (pg['group'], norm_name(name))
            if key in data:
                problems.append({'pagina': pg['pno'], 'motivo': f'alimento repetido: {name}'})
                key = (pg['group'], norm_name(name) + f'#{pg["pno"]}-{k}')
            data[key] = rec
    for bkey, (bpno, rb) in b_index.items():
        if bkey not in used_b:
            problems.append({'pagina': bpno, 'motivo': f'renglón B sin parte A: {rb["name"]}'})
    return data, problems

def norm_name(name):
    n = unicodedata.normalize('NFC', name.lower())
    n = re.sub(r'-\s+', '', n)
    return re.sub(r'\s+', ' ', n).strip()

def fix_names(data):
    """Une nombres de dos renglones cuya segunda parte quedó suelta (p. ej. 'Ají verde o amarillo / morrón verde o' + 'amarillo, crudo')."""
    return data

def slug(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(ch for ch in s if unicodedata.category(ch) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:70]

COOKED = re.compile(r'\b(hervid|cocid|asad|frit|rehogad|al horno|horneado|a la plancha|grillad|salteado|al vapor|tostad|guisad|braseado|estofad)', re.I)
RAW = re.compile(r'\b(crud[oa]s?)\b', re.I)

def category_for(group, name):
    if group != 3:
        return GROUP_CATEGORY.get(group, 'Otros')
    n = name.lower()
    if re.match(r'(lenteja|garbanzo|poroto|arveja, semilla seca|arveja seca|soja|habas? secas?)', n):
        return 'Legumbres'
    if re.match(r'(pan\b|pan |panes|galletit|galleta|tostad|bizcoch|facturas?|grisin|medialuna|budín|vainilla|brownie|bollito|cheesecake|chip[aá]|masa|alfajor|torta|tarta|prepizza|pizza|scon|muffin|magdalena|rosquit|sándwich|sandwich)', n):
        return 'Panificados'
    if re.match(r'(papa|batata|choclo|mandioca)', n):
        return 'Verduras'
    return 'Cereales y derivados'

def main(pdf_path, out_csv, out_json):
    data, problems = build(pdf_path)
    rows, skipped = [], []
    seen = collections.Counter()
    for (group, _key), rec in data.items():
        name = rec['nombre']
        v = rec['valores']
        if not any(v.get(k) is not None for k in ('energia_kcal', 'proteinas_g', 'carbohidratos_g', 'grasas_g')):
            skipped.append({'grupo': group, 'nombre': name, 'motivo': 'sin macronutrientes (solo tabla B)'})
            continue
        code = f'G{group:02d}-{slug(name)}'
        seen[code] += 1
        if seen[code] > 1:
            code += f'-{seen[code]}'
        estado = 'cocido' if COOKED.search(name) else 'crudo' if RAW.search(name) else ''
        zeros = sorted(k for k, s in rec['fuentes'].items() if s == 'Cero asumido')
        fuentes = {k: s for k, s in rec['fuentes'].items()}
        rows.append({
            'codigo': code, 'nombre': name, 'categoria': category_for(group, name), 'estado': estado,
            'energia_kcal': v.get('energia_kcal'), 'proteinas_g': v.get('proteinas_g'), 'carbohidratos_g': v.get('carbohidratos_g'),
            'grasas_g': v.get('grasas_g'), 'fibra_g': v.get('fibra_g'), 'sodio_mg': v.get('sodio_mg'), 'porcion_comestible_pct': '',
            'fuente_original': json.dumps({'grupo_sara2': group, 'paginas': sorted(rec['paginas']), 'fuente_por_nutriente': fuentes, 'ceros_asumidos': zeros,
                                           'carbohidratos_totales_g': v.get('carbohidratos_totales_g'), 'agua_g': v.get('agua_g'), 'alcohol_g': v.get('alcohol_g'), 'nota_pdf': rec.get('nota')}, ensure_ascii=False),
        })
    cols = ['codigo', 'nombre', 'categoria', 'estado', 'energia_kcal', 'proteinas_g', 'carbohidratos_g', 'grasas_g', 'fibra_g', 'sodio_mg', 'porcion_comestible_pct', 'fuente_original']
    with open(out_csv, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(cols)
        for r in rows:
            w.writerow([('' if r[c] is None else (str(r[c]).replace('.', ',') if isinstance(r[c], float) else r[c])) for c in cols])
    json.dump({'filas': len(rows), 'omitidos': skipped, 'problemas': problems}, open(out_json, 'w'), ensure_ascii=False, indent=1)
    print(len(rows), 'alimentos;', len(skipped), 'omitidos;', len(problems), 'avisos (ver informe)')

if __name__ == '__main__':
    main(*sys.argv[1:4])
