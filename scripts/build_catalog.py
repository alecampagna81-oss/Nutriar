"""
Genera data/catalog/usda_sr28_seleccion.json a partir de los archivos ABBREV.txt y FOOD_DES.txt
de USDA National Nutrient Database for Standard Reference, Release 28 (dominio público, EE.UU.).

Uso: python3 -I scripts/build_catalog.py <carpeta_con_ABBREV_y_FOOD_DES> <salida.json>

Cada entrada curada indica: código NDB, texto que debe contener la descripción original
(control contra errores de transcripción), nombre en español, categoría, estado,
alérgenos (etiquetas orientativas) y medidas caseras USDA a conservar con su nombre en español.
Los valores nutricionales se toman sin modificar. Un campo vacío en USDA queda como null (faltante).
"""
import json, sys

CUP_ML = 236.588   # taza EE.UU.
FLOZ_ML = 29.5735  # onza líquida EE.UU.

# (ndb, control, nombre, categoria, estado, alergenos, [(medida_usda, nombre_es)], liquido_densidad_desde)
C = [
 # Lácteos y huevos
 ('01077','Milk, whole, 3.25%','Leche entera (3,25 % grasa)','Lácteos y huevos','listo_para_consumir',['lactosa','leche'],[('1 cup','1 taza medidora EE.UU. (237 ml)')],'1 cup'),
 ('01079','Milk, reduced fat, fluid, 2%','Leche parcialmente descremada (2 % grasa)','Lácteos y huevos','listo_para_consumir',['lactosa','leche'],[('1 cup','1 taza medidora EE.UU. (237 ml)')],'1 cup'),
 ('01085','Milk, nonfat, fluid','Leche descremada','Lácteos y huevos','listo_para_consumir',['lactosa','leche'],[('1 cup','1 taza medidora EE.UU. (237 ml)')],'1 cup'),
 ('01154','Milk, dry, nonfat, regular','Leche en polvo descremada','Lácteos y huevos','listo_para_consumir',['lactosa','leche'],[('.25 cup','1/4 taza medidora EE.UU.')],None),
 ('01116','Yogurt, plain, whole milk','Yogur natural entero (sin azúcar)','Lácteos y huevos','listo_para_consumir',['lactosa','leche'],[('1 container,  (6 oz)','1 pote de 170 g')],None),
 ('01118','Yogurt, plain, skim milk','Yogur natural descremado (sin azúcar)','Lácteos y huevos','listo_para_consumir',['lactosa','leche'],[('1 container,  (6 oz)','1 pote de 170 g')],None),
 ('01026','Cheese, mozzarella, whole milk','Queso mozzarella (leche entera)','Lácteos y huevos','listo_para_consumir',['lactosa','leche'],[('1 cup, shredded','1 taza medidora EE.UU., rallado')],None),
 ('01032','Cheese, parmesan, grated','Queso parmesano rallado','Lácteos y huevos','listo_para_consumir',['leche'],[('1 tbsp','1 cucharada (medida USDA)')],None),
 ('01035','Cheese, provolone','Queso provolone','Lácteos y huevos','listo_para_consumir',['leche'],[],None),
 ('01036','Cheese, ricotta, whole milk','Ricota (leche entera)','Lácteos y huevos','listo_para_consumir',['lactosa','leche'],[('.5 cup','1/2 taza medidora EE.UU.')],None),
 ('01037','Cheese, ricotta, part skim milk','Ricota (leche parcialmente descremada)','Lácteos y huevos','listo_para_consumir',['lactosa','leche'],[('.5 cup','1/2 taza medidora EE.UU.')],None),
 ('01017','Cheese, cream','Queso crema','Lácteos y huevos','listo_para_consumir',['lactosa','leche'],[('1 tbsp','1 cucharada (medida USDA)')],None),
 ('01016','Cheese, cottage, lowfat, 1%','Queso cottage (1 % grasa)','Lácteos y huevos','listo_para_consumir',['lactosa','leche'],[],None),
 ('01228','Cheese, fresh, queso fresco','Queso fresco (tipo latinoamericano, referencia USDA)','Lácteos y huevos','listo_para_consumir',['lactosa','leche'],[('1 cup, crumbled','1 taza medidora EE.UU., desmenuzado')],None),
 ('01123','Egg, whole, raw, fresh','Huevo entero crudo','Lácteos y huevos','crudo',['huevo'],[('1 large','1 huevo grande (sin cáscara)')],None),
 ('01129','Egg, whole, cooked, hard-boiled','Huevo duro','Lácteos y huevos','cocido',['huevo'],[],None),
 ('01124','Egg, white, raw, fresh','Clara de huevo cruda','Lácteos y huevos','crudo',['huevo'],[('1 large','1 clara de huevo grande')],None),
 ('01145','Butter, without salt','Manteca sin sal','Aceites y grasas','listo_para_consumir',['leche'],[('1 tbsp','1 cucharada (medida USDA)')],None),
 ('01053','Cream, fluid, heavy whipping','Crema de leche (para batir)','Lácteos y huevos','listo_para_consumir',['lactosa','leche'],[],None),
 ('01225','Dulce de Leche','Dulce de leche','Azúcares y dulces','listo_para_consumir',['lactosa','leche'],[('1 tbsp','1 cucharada (medida USDA)')],None),
 # Carnes
 ('23562','Beef, ground, 90% lean meat / 10% fat, raw','Carne vacuna picada magra (90/10), cruda','Carnes','crudo',[],[],None),
 ('23564','Beef, ground, 90% lean meat / 10% fat, patty, cooked, pan-broiled','Carne vacuna picada magra (90/10), cocida a la plancha','Carnes','cocido',[],[],None),
 ('23601','Beef, tenderloin, steak, separable lean only, trimmed to 1/8" fat, all grades, raw','Lomo vacuno, solo magro, crudo (corte EE.UU. "tenderloin")','Carnes','crudo',[],[],None),
 ('23363','Beef, round, eye of round steak, boneless, separable lean only','Peceto, solo magro, crudo (corte EE.UU. "eye of round")','Carnes','crudo',[],[],None),
 ('23354','Beef, round, top round steak, boneless, separable lean only','Nalga, solo magro, cruda (corte EE.UU. "top round")','Carnes','crudo',[],[],None),
 ('13325','Beef, variety meats and by-products, liver, raw','Hígado vacuno crudo','Carnes','crudo',[],[],None),
 ('05062','Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw','Pechuga de pollo sin piel, cruda','Carnes','crudo',[],[],None),
 ('05064','Chicken, broilers or fryers, breast, meat only, cooked, roasted','Pechuga de pollo sin piel, asada','Carnes','cocido',[],[('1 cup, chopped or diced','1 taza medidora EE.UU., en cubos')],None),
 ('05096','Chicken, broilers or fryers, dark meat, thigh, meat only, raw','Muslo de pollo sin piel, crudo','Carnes','crudo',[],[],None),
 ('05098','Chicken, broilers or fryers, thigh, meat only, cooked, roasted','Muslo de pollo sin piel, asado','Carnes','cocido',[],[],None),
 ('10060','Pork, fresh, loin, tenderloin, separable lean only, raw','Solomillo de cerdo, solo magro, crudo','Carnes','crudo',[],[],None),
 ('07029','Ham, sliced, regular','Jamón cocido en fetas (aprox. 11 % grasa, referencia USDA)','Carnes','listo_para_consumir',[],[('1 slice','1 feta (28 g)')],None),
 # Pescados
 ('15121','Fish, tuna, light, canned in water, drained solids','Atún al natural en lata, escurrido','Pescados y mariscos','listo_para_consumir',['pescado'],[],None),
 ('15236','Fish, salmon, Atlantic, farmed, raw','Salmón rosado (del Atlántico, de criadero), crudo','Pescados y mariscos','crudo',['pescado'],[],None),
 ('15088','Fish, sardine, Atlantic, canned in oil, drained solids with bone','Sardinas en aceite, escurridas, con espinas','Pescados y mariscos','listo_para_consumir',['pescado'],[],None),
 # Legumbres
 ('16069','Lentils, raw','Lentejas secas, crudas','Legumbres','crudo',[],[('1 tablespoon','1 cucharada (medida USDA)'),('1 cup','1 taza medidora EE.UU.')],None),
 ('16070','Lentils, mature seeds, cooked, boiled, without salt','Lentejas hervidas, sin sal','Legumbres','cocido',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('16056','Chickpeas (garbanzo beans, bengal gram), mature seeds, raw','Garbanzos secos, crudos','Legumbres','crudo',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('16057','Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt','Garbanzos hervidos, sin sal','Legumbres','cocido',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('16014','Beans, black, mature seeds, raw','Porotos negros secos, crudos','Legumbres','crudo',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('16015','Beans, black, mature seeds, cooked, boiled, without salt','Porotos negros hervidos, sin sal','Legumbres','cocido',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('16049','Beans, white, mature seeds, raw','Porotos blancos (alubias) secos, crudos','Legumbres','crudo',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('16050','Beans, white, mature seeds, cooked, boiled, without salt','Porotos blancos (alubias) hervidos, sin sal','Legumbres','cocido',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('16086','Peas, split, mature seeds, cooked, boiled, without salt','Arvejas partidas hervidas, sin sal','Legumbres','cocido',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('16108','Soybeans, mature seeds, raw','Porotos de soja secos, crudos','Legumbres','crudo',['soja'],[],None),
 ('16087','Peanuts, all types, raw','Maní crudo','Frutos secos y semillas','crudo',['mani'],[],None),
 ('16398','Peanut butter, smooth style, without salt','Pasta de maní sin sal','Frutos secos y semillas','listo_para_consumir',['mani'],[('2 tbsp','2 cucharadas (medida USDA)')],None),
 # Cereales y panificados
 ('20044','Rice, white, long-grain, regular, raw, enriched','Arroz blanco largo fino, crudo','Cereales y derivados','crudo',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('20045','Rice, white, long-grain, regular, enriched, cooked','Arroz blanco largo fino, hervido','Cereales y derivados','cocido',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('20036','Rice, brown, long-grain, raw','Arroz integral largo, crudo','Cereales y derivados','crudo',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('20037','Rice, brown, long-grain, cooked','Arroz integral largo, hervido','Cereales y derivados','cocido',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('20120','Pasta, dry, enriched','Fideos secos de trigo (sin huevo), crudos','Cereales y derivados','crudo',['gluten'],[],None),
 ('20121','Pasta, cooked, enriched, without added salt','Fideos secos de trigo, hervidos, sin sal','Cereales y derivados','cocido',['gluten'],[('1 cup, spaghetti not packed','1 taza medidora EE.UU. de spaghetti (sin apretar)')],None),
 ('08120','Cereals, oats, regular and quick, not fortified, dry','Avena arrollada (tradicional o instantánea), cruda','Cereales y derivados','crudo',['gluten'],[('1 cup','1 taza medidora EE.UU.')],None),
 ('20081','Wheat flour, white, all-purpose, enriched, bleached','Harina de trigo común','Cereales y derivados','crudo',['gluten'],[('1 cup','1 taza medidora EE.UU.')],None),
 ('20022','Cornmeal, degermed, enriched, yellow','Harina de maíz amarilla (polenta), cruda','Cereales y derivados','crudo',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('20035','Quinoa, uncooked','Quinoa cruda','Cereales y derivados','crudo',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('20137','Quinoa, cooked','Quinoa cocida','Cereales y derivados','cocido',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('18069','Bread, white, commercially prepared','Pan de molde blanco','Panificados','listo_para_consumir',['gluten'],[('1 slice','1 rebanada (29 g)')],None),
 ('18075','Bread, whole-wheat, commercially prepared','Pan de molde integral','Panificados','listo_para_consumir',['gluten'],[('1 slice','1 rebanada (32 g)')],None),
 # Verduras
 ('11352','Potatoes, flesh and skin, raw','Papa cruda, con cáscara','Verduras','crudo',[],[],None),
 ('11367','Potatoes, boiled, cooked without skin, flesh, without salt','Papa hervida sin cáscara, sin sal','Verduras','cocido',[],[('.5 cup','1/2 taza medidora EE.UU.')],None),
 ('11507','Sweet potato, raw, unprepared','Batata cruda','Verduras','crudo',[],[],None),
 ('11508','Sweet potato, cooked, baked in skin, flesh, without salt','Batata asada (pulpa), sin sal','Verduras','cocido',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('11124','Carrots, raw','Zanahoria cruda','Verduras','crudo',[],[('1 cup, grated','1 taza medidora EE.UU., rallada')],None),
 ('11529','Tomatoes, red, ripe, raw, year round average','Tomate rojo crudo','Verduras','crudo',[],[('1 cup, chopped or sliced','1 taza medidora EE.UU., picado')],None),
 ('11251','Lettuce, cos or romaine, raw','Lechuga romana','Verduras','crudo',[],[('1 cup, shredded','1 taza medidora EE.UU., cortada')],None),
 ('11253','Lettuce, green leaf, raw','Lechuga de hoja verde','Verduras','crudo',[],[('1 cup, shredded','1 taza medidora EE.UU., cortada')],None),
 ('11282','Onions, raw','Cebolla cruda','Verduras','crudo',[],[('1 cup, chopped','1 taza medidora EE.UU., picada')],None),
 ('11422','Pumpkin, raw','Zapallo crudo','Verduras','crudo',[],[],None),
 ('11485','Squash, winter, butternut, raw','Calabaza (anco / butternut) cruda','Verduras','crudo',[],[('1 cup, cubes','1 taza medidora EE.UU., en cubos')],None),
 ('11477','Squash, summer, zucchini, includes skin, raw','Zucchini crudo, con piel','Verduras','crudo',[],[('1 cup, chopped','1 taza medidora EE.UU., picado')],None),
 ('11147','Chard, swiss, raw','Acelga cruda','Verduras','crudo',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('11457','Spinach, raw','Espinaca cruda','Verduras','crudo',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('11090','Broccoli, raw','Brócoli crudo','Verduras','crudo',[],[('1 cup, chopped','1 taza medidora EE.UU., picado')],None),
 ('11167','Corn, sweet, yellow, raw','Choclo amarillo crudo (granos)','Verduras','crudo',[],[('1 cup','1 taza medidora EE.UU., granos')],None),
 ('11821','Peppers, sweet, red, raw','Morrón rojo crudo','Verduras','crudo',[],[('1 cup, chopped','1 taza medidora EE.UU., picado')],None),
 ('11209','Eggplant, raw','Berenjena cruda','Verduras','crudo',[],[('1 cup, cubes','1 taza medidora EE.UU., en cubos')],None),
 ('11080','Beets, raw','Remolacha cruda','Verduras','crudo',[],[],None),
 ('11109','Cabbage, raw','Repollo crudo','Verduras','crudo',[],[('1 cup, shredded','1 taza medidora EE.UU., cortado fino')],None),
 ('11205','Cucumber, with peel, raw','Pepino crudo, con piel','Verduras','crudo',[],[('.5 cup, slices','1/2 taza medidora EE.UU., en rodajas')],None),
 ('11260','Mushrooms, white, raw','Champiñones crudos','Verduras','crudo',[],[('1 cup, pieces or slices','1 taza medidora EE.UU., fileteados')],None),
 ('11215','Garlic, raw','Ajo crudo','Verduras','crudo',[],[('1 tsp','1 cucharadita (medida USDA)')],None),
 ('11052','Beans, snap, green, raw','Chauchas crudas','Verduras','crudo',[],[],None),
 # Frutas
 ('09040','Bananas, raw','Banana','Frutas','crudo',[],[('1 cup, sliced','1 taza medidora EE.UU., en rodajas')],None),
 ('09003','Apples, raw, with skin','Manzana con cáscara','Frutas','crudo',[],[('1 cup, slices','1 taza medidora EE.UU., en gajos')],None),
 ('09200','Oranges, raw, all commercial varieties','Naranja','Frutas','crudo',[],[('1 cup, sections','1 taza medidora EE.UU., en gajos')],None),
 ('09218','Tangerines, (mandarin oranges), raw','Mandarina','Frutas','crudo',[],[('1 cup, sections','1 taza medidora EE.UU., en gajos')],None),
 ('09252','Pears, raw','Pera','Frutas','crudo',[],[('1 cup, slices','1 taza medidora EE.UU., en gajos')],None),
 ('09236','Peaches, yellow, raw','Durazno amarillo','Frutas','crudo',[],[('1 cup, slices','1 taza medidora EE.UU., en gajos')],None),
 ('09316','Strawberries, raw','Frutillas','Frutas','crudo',[],[('1 cup,  halves','1 taza medidora EE.UU., en mitades')],None),
 ('09132','Grapes, red or green','Uvas (sin semilla)','Frutas','crudo',[],[('1 cup','1 taza medidora EE.UU.')],None),
 ('09148','Kiwifruit, green, raw','Kiwi','Frutas','crudo',[],[],None),
 ('09150','Lemons, raw, without peel','Limón (pulpa, sin cáscara)','Frutas','crudo',[],[],None),
 ('09037','Avocados, raw, all commercial varieties','Palta','Frutas','crudo',[],[('1 cup, cubes','1 taza medidora EE.UU., en cubos')],None),
 ('09266','Pineapple, raw, all varieties','Ananá','Frutas','crudo',[],[('1 cup, chunks','1 taza medidora EE.UU., en trozos')],None),
 ('09326','Watermelon, raw','Sandía','Frutas','crudo',[],[('1 cup, diced','1 taza medidora EE.UU., en cubos')],None),
 ('09181','Melons, cantaloupe, raw','Melón cantalupo','Frutas','crudo',[],[('1 cup, cubes','1 taza medidora EE.UU., en cubos')],None),
 ('09279','Plums, raw','Ciruela','Frutas','crudo',[],[],None),
 ('09112','Grapefruit, raw, pink and red','Pomelo rosado','Frutas','crudo',[],[],None),
 ('09206','Orange juice, raw','Jugo de naranja exprimido','Bebidas','listo_para_consumir',[],[('1 cup','1 taza medidora EE.UU. (237 ml)')],'1 cup'),
 # Frutos secos y semillas
 ('12155','Nuts, walnuts, english','Nueces (mariposa)','Frutos secos y semillas','listo_para_consumir',['frutos_secos'],[],None),
 ('12061','Nuts, almonds','Almendras','Frutos secos y semillas','listo_para_consumir',['frutos_secos'],[],None),
 ('12006','Seeds, chia seeds, dried','Semillas de chía','Frutos secos y semillas','listo_para_consumir',[],[],None),
 ('12220','Seeds, flaxseed','Semillas de lino','Frutos secos y semillas','listo_para_consumir',[],[('1 tbsp, whole','1 cucharada (medida USDA), enteras')],None),
 ('12036','Seeds, sunflower seed kernels, dried','Semillas de girasol peladas','Frutos secos y semillas','listo_para_consumir',[],[],None),
 # Aceites
 ('04060','Oil, sunflower, linoleic (less than 60%)','Aceite de girasol','Aceites y grasas','listo_para_consumir',[],[('1 tbsp','1 cucharada (medida USDA)')],'1 cup'),
 ('04053','Oil, olive, salad or cooking','Aceite de oliva','Aceites y grasas','listo_para_consumir',[],[('1 tablespoon','1 cucharada (medida USDA)')],'1 cup'),
 ('04582','Oil, canola','Aceite de canola','Aceites y grasas','listo_para_consumir',[],[('1 tbsp','1 cucharada (medida USDA)')],'1 cup'),
 ('04518','Oil, corn, industrial and retail','Aceite de maíz','Aceites y grasas','listo_para_consumir',[],[('1 tbsp','1 cucharada (medida USDA)')],'1 cup'),
 # Azúcares y dulces
 ('19335','Sugars, granulated','Azúcar común','Azúcares y dulces','listo_para_consumir',[],[('1 tsp','1 cucharadita (medida USDA)')],None),
 ('19296','Honey','Miel','Azúcares y dulces','listo_para_consumir',[],[],None),
 ('19297','Jams and preserves','Mermelada (con azúcar)','Azúcares y dulces','listo_para_consumir',[],[('1 tbsp','1 cucharada (medida USDA)')],None),
 ('19165','Cocoa, dry powder, unsweetened','Cacao amargo en polvo','Azúcares y dulces','listo_para_consumir',[],[('1 tbsp','1 cucharada (medida USDA)')],None),
 # Bebidas / infusiones
 ('14209','Beverages, coffee, brewed, prepared with tap water','Café de filtro (infusión)','Infusiones','listo_para_consumir',[],[],'1 fl oz'),
 ('14355','Beverages, tea, black, brewed, prepared with tap water','Té negro (infusión)','Infusiones','listo_para_consumir',[],[],'1 fl oz'),
 ('14411','Beverages, water, tap, drinking','Agua de red','Bebidas','listo_para_consumir',[],[],'1 fl oz'),
 # Condimentos
 ('02047','Salt, table','Sal fina de mesa','Condimentos y salsas','listo_para_consumir',[],[('1 tsp','1 cucharadita (medida USDA)')],None),
 ('04025','Salad dressing, mayonnaise, regular','Mayonesa común','Condimentos y salsas','listo_para_consumir',['huevo'],[('1 tbsp','1 cucharada (medida USDA)')],None),
 ('11935','Catsup','Kétchup','Condimentos y salsas','listo_para_consumir',[],[('1 tbsp','1 cucharada (medida USDA)')],None),
 ('02046','Mustard, prepared, yellow','Mostaza','Condimentos y salsas','listo_para_consumir',[],[],None),
]

def main(src, out):
    des, ab = {}, {}
    for l in open(src + '/FOOD_DES.txt', encoding='latin-1'):
        f = l.rstrip('\r\n').split('^'); des[f[0].strip('~')] = f[2].strip('~')
    for l in open(src + '/ABBREV.txt', encoding='latin-1'):
        f = [x.strip('~') for x in l.rstrip('\r\n').split('^')]; ab[f[0]] = f
    def num(s):
        return None if s == '' else float(s)
    items, seen = [], set()
    for ndb, control, name, cat, state, allergens, measures, dens in C:
        assert ndb not in seen, ndb; seen.add(ndb)
        d = des[ndb]; a = ab[ndb]
        assert control.lower() in d.lower(), (ndb, control, d)
        assert len(a) == 53, (ndb, len(a))
        mdesc = {a[49]: num(a[48]), a[51]: num(a[50])}
        ms = []
        for usda, es in measures:
            assert usda in mdesc and mdesc[usda], (ndb, usda, mdesc)
            ms.append({'name': es, 'amount': mdesc[usda], 'unit': 'g', 'usda_desc': usda})
        density = None
        if dens:
            assert dens in mdesc, (ndb, dens, mdesc)
            density = round(mdesc[dens] / (CUP_ML if dens == '1 cup' else FLOZ_ML), 4)
        refuse = num(a[52])
        items.append({
            'ndb': ndb, 'usda_description': d, 'name': name, 'category': cat, 'state': state, 'allergens': allergens,
            'energy_kcal': num(a[3]), 'protein_g': num(a[4]), 'fat_g': num(a[5]), 'carbs_g': num(a[7]),
            'fiber_g': num(a[8]), 'sodium_mg': num(a[15]),
            'edible_portion_pct': (100 - refuse) if refuse else None,
            'density_g_per_ml': density, 'density_from': dens, 'measures': ms,
        })
    json.dump({'source': 'USDA National Nutrient Database for Standard Reference, Release 28 (2015), archivo ABBREV.txt',
               'license': 'Dominio público (obra del Gobierno de EE.UU.). Cita sugerida: US Department of Agriculture, Agricultural Research Service, Nutrient Data Laboratory. USDA National Nutrient Database for Standard Reference, Release 28. Version Current: September 2015.',
               'obtained_from': 'Paquete npm fda-nutrient-database@1.0.2 (redistribución de ABBREV.txt y FOOD_DES.txt); md5 ABBREV.txt 30fd99e3fb88f919b199e7684e58aa96',
               'notes': 'Valores por 100 g de porción comestible. Carbohidratos = totales por diferencia (incluyen fibra). Campo vacío en USDA = dato faltante (null).',
               'items': items}, open(out, 'w'), ensure_ascii=False, indent=1)
    print(len(items), 'alimentos')

main(sys.argv[1], sys.argv[2])
