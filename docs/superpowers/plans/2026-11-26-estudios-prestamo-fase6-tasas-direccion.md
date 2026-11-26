# Fase 6 — Trío de tasas condicionado por dirección y tasa índice+spread Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El motor de tasas de un estudio de préstamo elige el trío de referencia
(PRIME+SOFR+TMC o PRIME+CIRR+LIBOR) y si aplica riesgo país según la dirección real del
préstamo (pasivo/activo), y resuelve una tasa efectiva cuando el Excel no trae `tasaEA` sino
un índice + spread (p. ej. "LIBOR + 1 punto").

**Architecture:** Mismo patrón de las fases anteriores: módulos de datos puros en
`frontend/src/services/`, probados con `node:test`, consumidos por `tablasPrestamoTasas.js`,
`tablasPrestamoColumnas.js` y el componente de UI `PrestamoTasas.jsx`. Ningún cambio de
formato de persistencia (`estudio.prestamos`, `estudio.tasasPrestamo` conservan su forma).

**Tech Stack:** JavaScript puro, `node:test`/`node:assert` (mismo runner que el resto de
`frontend/src/services/*.test.js`).

**Spec:** `docs/superpowers/specs/2026-11-26-estudios-prestamo-fase6-tasas-direccion-design.md`

## Global Constraints

- El riesgo país nunca se pasa como `null` a `tasaAjustada` cuando no aplica: se pasa `0`
  explícito (pasar `null` activaría la guarda existente y anularía todo el cálculo).
- `trioDeDireccion`/`seriesDePrompt`/`construirPromptTasasPrestamo` con dirección
  desconocida o sin pasar el parámetro caen al trío `pasivo` (PRIME+SOFR+TMC) — es el único
  caso real ya cubierto por las pruebas existentes (Autoland) y no debe regresar.
- `tasaEfectivaDeFila`/`parsearIndiceSpread` nunca inventan una serie de referencia nueva: si
  el índice mencionado no es `libor` ni `sofr`, o no hay tasas capturadas para esa fecha,
  devuelven `null` (declarar el hueco, mismo criterio que ya usa el resto del motor).
- `npm test` (suite completa) debe quedar en verde después de cada tarea.

## Review Focus

- Una fila con `tasaEA` vacío Y `periodicidad`/`tasaPactada` también vacíos (sin ningún dato
  de tasa) debe seguir devolviendo `null` sin lanzar — no debe tratarse como "índice SOFR
  implícito" ni nada por el estilo.
- Un texto de índice con mayúsculas/acentos/espacios irregulares ("Libor  usd  3 meses+1%")
  debe reconocerse igual que la forma canónica.
- Un estudio con `direccionPrestamoEstudio` igual a `null` (otorga/recibe no coinciden con
  `estudio.ent` en ninguna fila) no debe romper ninguna de las funciones de
  `tablasPrestamoTasas.js`: deben degradarse al trío/():comportamiento pasivo por defecto, no
  lanzar.
- Las pruebas EXISTENTES de `totalesPorFecha`/`rangoIntercuartil` (que no pasan el nuevo
  parámetro `series`) deben seguir pasando sin modificarlas — la firma nueva es
  retrocompatible por defecto.
- `conclusionRangoIntercuartilPrestamo` usando `vinculadoDePrestamo` en vez de `estudio.vinc`
  no debe cambiar el texto producido para el caso Autoland ya probado (incluir una prueba de
  regresión que fije `estudio.vinc` a un valor DISTINTO del vinculado real y confirme que el
  texto usa el vinculado real, no `estudio.vinc`).

---

## Task 1: Dirección del préstamo — `tablasPrestamos.js`

**Files:**
- Modify: `frontend/src/services/tablasPrestamos.js`
- Test: `frontend/src/services/tablasPrestamos.test.js`

**Interfaces:**
- Consumes: `normalizarNombreCompania` (privada, ya existe en el archivo), `tienePrestamos`
- Produces: `direccionPrestamo(fila, ent): 'activo'|'pasivo'|null`,
  `direccionPrestamoEstudio(estudio): 'activo'|'pasivo'|null`

- [x] **Step 1: Write the failing test**

```js
import { direccionPrestamo, direccionPrestamoEstudio } from './tablasPrestamos.js';

test('direccionPrestamo es pasivo cuando el contribuyente recibe el préstamo (Suma Móvil)', () => {
  const fila = { otorga: 'Grupo Ingenium Tecnologia S.L.', recibe: 'Suma Movil SAS' };
  assert.strictEqual(direccionPrestamo(fila, 'Suma Movil SAS'), 'pasivo');
});

test('direccionPrestamo es activo cuando el contribuyente otorga el préstamo (Alciautos)', () => {
  const fila = { otorga: 'Alciautos S.A.S.', recibe: 'Favina Holdings Inc' };
  assert.strictEqual(direccionPrestamo(fila, 'Alciautos S.A.S.'), 'activo');
});

test('direccionPrestamo es null si ni otorga ni recibe coinciden con el contribuyente', () => {
  const fila = { otorga: 'A', recibe: 'B' };
  assert.strictEqual(direccionPrestamo(fila, 'C'), null);
});

test('direccionPrestamoEstudio usa el primer préstamo del estudio', () => {
  const estudio = { tipo_estudio: 'prestamo', ent: 'Suma Movil SAS', prestamos: [
    { otorga: 'Grupo Ingenium Tecnologia S.L.', recibe: 'Suma Movil SAS' },
  ] };
  assert.strictEqual(direccionPrestamoEstudio(estudio), 'pasivo');
});

test('direccionPrestamoEstudio es null sin préstamos', () => {
  assert.strictEqual(direccionPrestamoEstudio({ tipo_estudio: 'estandar' }), null);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/services/tablasPrestamos.test.js`
Expected: FAIL — `direccionPrestamo`/`direccionPrestamoEstudio` no existen todavía.

- [x] **Step 3: Implement `direccionPrestamo`/`direccionPrestamoEstudio` in `tablasPrestamos.js`**

Colocarlas justo después de `vinculadoDePrestamo` (mismo bloque de comparación
otorga/recibe, reutilizando `normalizarNombreCompania`).

- [x] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/services/tablasPrestamos.test.js`
Expected: PASS (todas, incluidas las 5 nuevas)

- [x] **Step 5: Commit**

```bash
git add frontend/src/services/tablasPrestamos.js frontend/src/services/tablasPrestamos.test.js
git commit -m "feat: direccionPrestamo (activo/pasivo) para estudios de prestamo"
```

---

## Task 2: Trío de tasas condicionado por dirección — `prestamoTasasCalculo.js`

**Files:**
- Modify: `frontend/src/services/prestamoTasasCalculo.js`
- Test: `frontend/src/services/prestamoTasasCalculo.test.js`

**Interfaces:**
- Consumes: nada nuevo de Task 1 (este módulo no importa `tablasPrestamos.js` — recibe la
  dirección ya resuelta como string, lo calcula quien llama).
- Produces: `TRIOS_POR_DIRECCION: {pasivo:string[], activo:string[]}`,
  `trioDeDireccion(direccion): string[]`, `aplicaRiesgoPais(direccion): boolean`.
  `totalesPorFecha(tasasFecha, riesgoPaisPct, series = TRIOS_POR_DIRECCION.pasivo): {[serie]: number|null}`
  (firma retrocompatible: tercer parámetro opcional).

- [x] **Step 1: Write the failing test**

```js
import { TRIOS_POR_DIRECCION, trioDeDireccion, aplicaRiesgoPais, totalesPorFecha } from './prestamoTasasCalculo.js';

test('trioDeDireccion: pasivo es PRIME+SOFR+TMC, activo es PRIME+CIRR+LIBOR', () => {
  assert.deepStrictEqual(trioDeDireccion('pasivo'), ['prime', 'sofr', 'tmc']);
  assert.deepStrictEqual(trioDeDireccion('activo'), ['prime', 'cirr', 'libor']);
});

test('trioDeDireccion cae a pasivo con dirección desconocida o ausente', () => {
  assert.deepStrictEqual(trioDeDireccion(null), TRIOS_POR_DIRECCION.pasivo);
  assert.deepStrictEqual(trioDeDireccion('otra'), TRIOS_POR_DIRECCION.pasivo);
});

test('aplicaRiesgoPais es true en pasivo, false en activo', () => {
  assert.strictEqual(aplicaRiesgoPais('pasivo'), true);
  assert.strictEqual(aplicaRiesgoPais('activo'), false);
  assert.strictEqual(aplicaRiesgoPais(null), true);
});

test('totalesPorFecha con trio custom (activo) calcula cirr/libor en vez de sofr/tmc', () => {
  const tasasFecha = {
    prime: { valor: 8 }, cirr: { valor: 5 }, libor: { valor: 5.535 }, moodys: { valor: 1.14 },
  };
  const totales = totalesPorFecha(tasasFecha, 0, trioDeDireccion('activo'));
  assert.ok('cirr' in totales && 'libor' in totales && !('sofr' in totales));
  assert.strictEqual(totales.sofr, undefined);
});

test('totalesPorFecha sin tercer argumento sigue devolviendo prime/sofr/tmc (regresión)', () => {
  const tasasFecha = { prime: { valor: 8 }, sofr: { valor: 4.81 }, tmc: { valor: 13.26 }, moodys: { valor: 1.14 } };
  const totales = totalesPorFecha(tasasFecha, 2.845);
  assert.ok(esNumero => true); // placeholder de forma; ver aserción real abajo
  assert.ok(typeof totales.prime === 'number' && typeof totales.sofr === 'number' && typeof totales.tmc === 'number');
});
```

(Ajustar el test de regresión para reutilizar las aserciones numéricas ya existentes en el
archivo — no reinventar `esNumero` dentro del test, usar `assert.strictEqual` con el valor
calculado a mano o reusar una constante ya presente en el archivo de pruebas.)

- [x] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/services/prestamoTasasCalculo.test.js`
Expected: FAIL — los símbolos nuevos no existen.

- [x] **Step 3: Implement**

Agregar `TRIOS_POR_DIRECCION`, `trioDeDireccion`, `aplicaRiesgoPais` antes de
`totalesPorFecha`. Reescribir `totalesPorFecha` para iterar sobre `series` (tercer parámetro,
default `TRIOS_POR_DIRECCION.pasivo`) en vez de las tres claves fijas `prime/sofr/tmc`, armando
el objeto de retorno dinámicamente con `Object.fromEntries`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/services/prestamoTasasCalculo.test.js`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add frontend/src/services/prestamoTasasCalculo.js frontend/src/services/prestamoTasasCalculo.test.js
git commit -m "feat: trio de tasas condicionado por direccion (activo/pasivo)"
```

---

## Task 3: Tasa índice + spread — `prestamoTasasCalculo.js`

**Files:**
- Modify: `frontend/src/services/prestamoTasasCalculo.js`
- Test: `frontend/src/services/prestamoTasasCalculo.test.js`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `numeroDesdeTexto(texto): number|null` (movida aquí desde
  `tablasPrestamoTasas.js`, donde queda re-exportada o importada — decidir en Task 5 cuál de
  los dos archivos es la fuente; este módulo es el dueño porque ahora la usan dos consumidores),
  `parsearIndiceSpread(texto): {indice: 'libor'|'sofr'|null, spreadPct: number}`,
  `tasaEfectivaDeFila(fila, tasasPrestamo): number|null`,
  `FECHA_FIN_LIBOR_USD: '2023-06-30'`, `serieDisponible` gana la rama `libor`.

- [x] **Step 1: Write the failing test**

```js
test('parsearIndiceSpread reconoce "LIBOR + 1 punto"', () => {
  assert.deepStrictEqual(parsearIndiceSpread('LIBOR + 1 punto'), { indice: 'libor', spreadPct: 1 });
});

test('parsearIndiceSpread es tolerante a mayusculas/espacios/acentos', () => {
  assert.deepStrictEqual(parsearIndiceSpread('Libor  usd  3 meses+1%'), { indice: 'libor', spreadPct: 1 });
});

test('parsearIndiceSpread reconoce SOFR sin espacio antes del signo', () => {
  assert.deepStrictEqual(parsearIndiceSpread('SOFR+2'), { indice: 'sofr', spreadPct: 2 });
});

test('parsearIndiceSpread sin texto reconocible devuelve indice null', () => {
  assert.deepStrictEqual(parsearIndiceSpread(''), { indice: null, spreadPct: 0 });
  assert.deepStrictEqual(parsearIndiceSpread('Tasa fija'), { indice: null, spreadPct: 0 });
});

test('tasaEfectivaDeFila usa tasaEA si es legible, ignora periodicidad', () => {
  const fila = { tasaEA: '4,540% Efectivo Anual', periodicidad: 'LIBOR + 9 puntos' };
  assert.strictEqual(tasaEfectivaDeFila(fila, {}), 4.54);
});

test('tasaEfectivaDeFila resuelve indice+spread cuando no hay tasaEA (Alciautos)', () => {
  const fila = { tasaEA: '', periodicidad: 'LIBOR + 1 punto', fechaPacto: '2018-06-30' };
  const tasasPrestamo = { porFecha: { '2018-06-30': { libor: { valor: 4.535 } } } };
  assert.strictEqual(tasaEfectivaDeFila(fila, tasasPrestamo), 5.535);
});

test('tasaEfectivaDeFila es null sin tasaEA, sin indice reconocible, o sin el valor del indice capturado', () => {
  assert.strictEqual(tasaEfectivaDeFila({ tasaEA: '', periodicidad: '' }, {}), null);
  assert.strictEqual(tasaEfectivaDeFila({ tasaEA: '', periodicidad: 'Tasa fija 5%' }, {}), null);
  assert.strictEqual(tasaEfectivaDeFila(
    { tasaEA: '', periodicidad: 'LIBOR + 1 punto', fechaPacto: '2018-06-30' }, { porFecha: {} },
  ), null);
});

test('serieDisponible: libor no disponible despues del 30/06/2023', () => {
  assert.strictEqual(serieDisponible('libor', '2018-06-30'), true);
  assert.strictEqual(serieDisponible('libor', '2024-01-01'), false);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/services/prestamoTasasCalculo.test.js`
Expected: FAIL — símbolos nuevos no existen, `serieDisponible` no tiene la rama `libor`.

- [x] **Step 3: Implement**

`numeroDesdeTexto` — copiar tal cual la implementación ya existente en
`tablasPrestamoTasas.js:152-155` (regex del primer número, coma decimal). `parsearIndiceSpread`
— normalizar el texto (mayúsculas, sin tildes, espacios colapsados), buscar `LIBOR`/`SOFR`
como palabra, y un spread con regex tipo `/\+\s*([\d.,]+)\s*(?:%|puntos?|pts?)?/i` (si no hay
`+`, `spreadPct` es 0). `tasaEfectivaDeFila` — si `numeroDesdeTexto(fila.tasaEA)` no es `null`,
devolverlo; si no, `parsearIndiceSpread(fila.periodicidad || fila.tasaPactada)`, y si
`indice` no es `null`, buscar `tasasPrestamo?.porFecha?.[fila.fechaPacto]?.[indice]?.valor`,
sumar `spreadPct`, devolver `null` si ese valor no es un número. `FECHA_FIN_LIBOR_USD` y la
rama `libor` en `serieDisponible` siguen el mismo patrón que la rama `sofr` ya existente, pero
en sentido techo en vez de piso.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/services/prestamoTasasCalculo.test.js`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add frontend/src/services/prestamoTasasCalculo.js frontend/src/services/prestamoTasasCalculo.test.js
git commit -m "feat: tasa efectiva por indice+spread cuando falta tasaEA"
```

---

## Task 4: Prompt de búsqueda dinámico por trío — `prestamoTasasPrompts.js`

**Files:**
- Modify: `frontend/src/services/prestamoTasasPrompts.js`
- Test: `frontend/src/services/prestamoTasasPrompts.test.js`

**Interfaces:**
- Consumes: `TRIOS_POR_DIRECCION` (Task 2)
- Produces: `construirPromptTasasPrestamo(fechasPacto, anioInforme, trio = TRIOS_POR_DIRECCION.pasivo)`,
  `parsearRespuestaTasasPrestamo(texto, groundingChunks, webSearchQueries, trio = TRIOS_POR_DIRECCION.pasivo)`,
  `fusionarTasasPrestamo(actual, nuevo, trio = TRIOS_POR_DIRECCION.pasivo)` — todas ganan el
  parámetro opcional `trio`, reemplazando la constante interna `SERIES` fija.

- [x] **Step 1: Write the failing test**

```js
test('construirPromptTasasPrestamo con trio activo pide CIRR y LIBOR, no SOFR/TMC', () => {
  const prompt = construirPromptTasasPrestamo(['2018-06-30'], 2025, ['prime', 'cirr', 'libor']);
  assert.match(prompt, /CIRR/);
  assert.match(prompt, /LIBOR/);
  assert.doesNotMatch(prompt, /\bSOFR\b/);
  assert.doesNotMatch(prompt, /\bTMC\b/);
});

test('construirPromptTasasPrestamo sin trio sigue pidiendo PRIME/SOFR/TMC (regresion)', () => {
  const prompt = construirPromptTasasPrestamo(['2023-01-01'], 2025);
  assert.match(prompt, /\bSOFR\b/);
  assert.match(prompt, /\bTMC\b/);
});

test('parsearRespuestaTasasPrestamo con trio activo procesa cirr/libor', () => {
  const texto = JSON.stringify({
    porFecha: { '2018-06-30': { prime: 5, cirr: 3, libor: 4.535, moodys: 1.1 } },
    riesgoPais: { valor: 2.5 },
  });
  const r = parsearRespuestaTasasPrestamo(texto, ['x'], [], ['prime', 'cirr', 'libor']);
  assert.strictEqual(r.porFecha['2018-06-30'].cirr.valor, 3);
  assert.strictEqual(r.porFecha['2018-06-30'].libor.valor, 4.535);
  assert.strictEqual(r.porFecha['2018-06-30'].sofr, undefined);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/services/prestamoTasasPrompts.test.js`
Expected: FAIL — el prompt siempre menciona SOFR/TMC, `parsearRespuestaTasasPrestamo` ignora
el cuarto argumento.

- [x] **Step 3: Implement**

Reemplazar la constante `SERIES` por una función `seriesDePrompt(trio) => [...trio, 'moodys']`.
En `construirPromptTasasPrestamo`, armar la sección "busca estas tasas" iterando `trio` con un
`switch`/mapa de descripciones por clave (prime/sofr/tmc/cirr/libor ya redactadas en el spec,
§3) en vez del texto fijo actual. `parsearRespuestaTasasPrestamo`/`fusionarTasasPrestamo`
cambian su `SERIES.forEach` interno por `seriesDePrompt(trio).forEach`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/services/prestamoTasasPrompts.test.js`
Expected: PASS

- [x] **Step 5: Run full suite, lint, commit**

```bash
node --test "scripts/lib"/*.test.js "frontend/src/services"/*.test.js "frontend/src/utils"/*.test.js "functions"/*.test.js
npm run lint --prefix frontend
git add frontend/src/services/prestamoTasasPrompts.js frontend/src/services/prestamoTasasPrompts.test.js
git commit -m "feat: prompt de busqueda de tasas dinamico segun el trio por direccion"
```

---

## Task 5: `tablasPrestamoTasas.js` — usar dirección, trío e índice+spread; corregir el vinculado

**Files:**
- Modify: `frontend/src/services/tablasPrestamoTasas.js`
- Test: `frontend/src/services/tablasPrestamoTasas.test.js`

**Interfaces:**
- Consumes: `direccionPrestamoEstudio` (Task 1), `trioDeDireccion`, `aplicaRiesgoPais`,
  `tasaEfectivaDeFila`, `numeroDesdeTexto` (Tasks 2-3), `vinculadoDePrestamo` (ya importado de
  `tablasPrestamos.js` en otros archivos de esta fase — agregar el import aquí).
- Produces: mismas funciones exportadas, firma sin cambios (`estudio`, `tasasPrestamo`) — el
  cambio es interno.

- [x] **Step 1: Write the failing test**

```js
test('filasTablaRangoIntercuartil usa vinculadoDePrestamo, no estudio.vinc (regresion del bug 2026-11-25)', () => {
  const estudio = {
    tipo_estudio: 'prestamo', ent: 'Autoland SAS', vinc: 'BRUNO FRITSCH SA', // vinc desactualizado
    prestamos: [{ otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS', fechaPacto: '2020-10-27', valorDesembolsoMoneda: 3000000, tasaEA: '4,540% Efectivo Anual' }],
  };
  const t = filasTablaRangoIntercuartil(estudio, {});
  assert.strictEqual(t.filas[0].vinculado, 'Inversiones San Jeronimo SpA');
});

test('filasTablaRangoIntercuartil en un estudio activo (Alciautos) no aplica riesgo pais y usa el trio PRIME+CIRR+LIBOR', () => {
  const estudio = {
    tipo_estudio: 'prestamo', ent: 'Alciautos S.A.S.',
    prestamos: [{ otorga: 'Alciautos S.A.S.', recibe: 'Favina Holdings Inc', fechaPacto: '2018-06-30', valorDesembolsoMoneda: 1190800, tasaEA: '', periodicidad: 'LIBOR + 1 punto' }],
  };
  const tasasPrestamo = {
    riesgoPais: { valor: 99 }, // si se aplicara, el rango se dispararia; no debe usarse en activo
    porFecha: { '2018-06-30': { prime: { valor: 8 }, cirr: { valor: 5 }, libor: { valor: 4.535 }, moodys: { valor: 1.14 } } },
  };
  const t = filasTablaRangoIntercuartil(estudio, tasasPrestamo);
  assert.ok(t.filas[0].rango.superior < 50, 'el riesgo pais de 99 no debe haberse aplicado');
  assert.strictEqual(t.filas[0].tasaEA, '5.535', 'o el texto que produzca tasaEfectivaDeFila para mostrar'); // ajustar aserción exacta al formato real elegido en Task 3
});
```

(Precisar en la implementación real si `tasaEA` en la fila de salida se muestra como el texto
original `periodicidad` ("LIBOR + 1 punto") o el número resuelto — decidir por consistencia
con `tablasPrestamoColumnas.js` Task 6, que sí debe mostrar el texto original; ajustar la
aserción de este test a lo que se decida, documentándolo con un comentario.)

- [x] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/services/tablasPrestamoTasas.test.js`
Expected: FAIL — usa `estudio.vinc` y el trío fijo hoy.

- [x] **Step 3: Implement**

En `filasTablaRangoIntercuartil`: calcular `const direccion = direccionPrestamoEstudio(estudio)`,
`const trio = trioDeDireccion(direccion)`, `const riesgoPais = aplicaRiesgoPais(direccion) ?
tasasPrestamo?.riesgoPais?.valor : 0`; pasar `trio` a `totalesPorFecha`; `vinculado:
vinculadoDePrestamo(p, estudio.ent)` en vez de `estudio.vinc` (por fila, no una sola vez —
cada préstamo puede tener su propio otorga/recibe aunque hoy todos compartan el mismo
vinculado). En `filasTablaAnalisisTasasAjustadas`: mismo cambio de `trio`/`riesgoPais`, y
`ETIQUETA_SERIE` gana entradas `cirr: 'CIRR'`, `libor: 'LIBOR'`. En
`filasTablaTasasSeleccionadas`: `DESCRIPCIONES_TASAS_SELECCIONADAS` deja de ser una lista fija
de 3 — se arma filtrando/mapeando un catálogo completo (prime/sofr/tmc/cirr/libor, con sus
textos ya redactados, cirr y libor nuevos) por las claves de `trioDeDireccion(direccionPrestamoEstudio(estudio))`.
En `conclusionRangoIntercuartilPrestamo`: `vinc` sale de `vinculadoDePrestamo(estudio.prestamos[0], estudio.ent)`
en vez de `estudio.vinc`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/services/tablasPrestamoTasas.test.js`
Expected: PASS

- [x] **Step 5: Run full suite, lint, commit**

```bash
node --test "scripts/lib"/*.test.js "frontend/src/services"/*.test.js "frontend/src/utils"/*.test.js "functions"/*.test.js
npm run lint --prefix frontend
git add frontend/src/services/tablasPrestamoTasas.js frontend/src/services/tablasPrestamoTasas.test.js
git commit -m "fix: tablas de tasas usan vinculadoDePrestamo y el trio por direccion, no estudio.vinc"
```

---

## Task 6: `tablasPrestamoColumnas.js` — tasa efectiva para la fila "Tasa Pactada"

**Files:**
- Modify: `frontend/src/services/tablasPrestamoColumnas.js`
- Test: `frontend/src/services/tablasPrestamoColumnas.test.js`

**Interfaces:**
- Consumes: `tasaEfectivaDeFila` (Task 3) — solo para decidir si hay un número resoluble;
  el texto mostrado sigue siendo `p.tasaEA || p.periodicidad || p.tasaPactada` (nunca el
  número), para no cambiar el formato visual de una columna que hoy ya muestra texto libre.

- [x] **Step 1: Write the failing test**

```js
test('la fila Tasa Pactada muestra periodicidad cuando no hay tasaEA (Alciautos)', () => {
  const estudio = {
    tipo_estudio: 'prestamo', ent: 'Alciautos S.A.S.', vinc_id: '900629498', pais_vinc: 'Panamá',
    prestamos: [{ otorga: 'Alciautos S.A.S.', recibe: 'Favina Holdings Inc', tasaEA: '', periodicidad: 'LIBOR + 1 punto', valorCOPDesembolso: 9436452900, interesesCOP: 890410340, fechaDesembolso: '2019-03-01' }],
  };
  const t = filasTablaTransaccionesPrestamos(estudio);
  const fila = t.filas.find(f => f.clave === 'tasaPactada');
  assert.deepStrictEqual(fila.valores, ['LIBOR + 1 punto']);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/services/tablasPrestamoColumnas.test.js`
Expected: FAIL — hoy `wrap(p.tasaEA)` da "—" porque `tasaEA` está vacío.

- [x] **Step 3: Implement**

Cambiar `valores: prestamos.map((p) => wrap(p.tasaEA))` por
`valores: prestamos.map((p) => wrap(p.tasaEA || p.periodicidad || p.tasaPactada))`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/services/tablasPrestamoColumnas.test.js`
Expected: PASS

- [x] **Step 5: Run full suite, lint, build, commit**

```bash
node --test "scripts/lib"/*.test.js "frontend/src/services"/*.test.js "frontend/src/utils"/*.test.js "functions"/*.test.js
npm run lint --prefix frontend
npm run build --prefix frontend
git add frontend/src/services/tablasPrestamoColumnas.js frontend/src/services/tablasPrestamoColumnas.test.js
git commit -m "fix: tabla de transacciones muestra periodicidad/tasa pactada cuando falta la EA"
```

---

## Task 7: UI — `PrestamoTasas.jsx` muestra el trío por dirección (manual, sin prueba unitaria)

**Files:**
- Modify: `frontend/src/components/PrestamoTasas.jsx`

No hay pruebas unitarias de componentes React en este proyecto (confirmado para las fases
anteriores) — verificación manual únicamente.

- [x] **Step 1: Reemplazar la constante `SERIES` fija por el trío resuelto**

Importar `direccionPrestamoEstudio` de `tablasPrestamos.js` y `trioDeDireccion`,
`TRIOS_POR_DIRECCION` de `prestamoTasasCalculo.js`. Calcular
`const direccion = direccionPrestamoEstudio(study)` y
`const serieClaves = trioDeDireccion(direccion)` al inicio del componente; construir la lista
de columnas a partir de `serieClaves.map(clave => ({clave, etiqueta: clave.toUpperCase()}))`
más `{clave:'moodys', etiqueta:"Moody's"}` — reemplaza la constante `SERIES` fija de las
líneas 16-20.

- [x] **Step 2: Generalizar la columna "disponible" (hoy solo mira `sofr`)**

Reemplazar `const disponible = clave !== 'sofr' || fecha >= FECHA_INICIO_SOFR;` (línea 241)
por `const disponible = serieDisponible(clave, fecha);`, importando `serieDisponible` (ya
exportado) en vez de `FECHA_INICIO_SOFR` a secas.

- [x] **Step 3: Mostrar la dirección resuelta**

Agregar un texto visible cerca del encabezado de la vista ("Préstamo pasivo — el
contribuyente recibe" / "Préstamo activo — el contribuyente otorga" / sin texto si
`direccion` es `null`), para que el analista entienda por qué ve ese trío.

- [x] **Step 4: Verificación manual**

`npm run build --prefix frontend` compila. `npm run dev --prefix frontend`: crear un estudio
préstamo con datos tipo Suma (pasivo) y confirmar columnas PRIME/SOFR/TMC/Moody's; crear uno
con datos tipo Alciautos (activo, `tasaEA` vacío) y confirmar columnas PRIME/CIRR/LIBOR/Moody's
y que el texto de dirección cambia.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/PrestamoTasas.jsx
git commit -m "feat: PrestamoTasas.jsx muestra el trio de tasas segun la direccion del prestamo"
```

---

## Verificación final de todo el plan

1. `node --test "scripts/lib"/*.test.js "frontend/src/services"/*.test.js "frontend/src/utils"/*.test.js "functions"/*.test.js` — en verde, 0 fallos.
2. `npm run lint --prefix frontend` sin advertencias nuevas.
3. `npm run build --prefix frontend` compila.
4. Verificación manual del Step 4 de la Task 7 (los dos casos, pasivo y activo).
