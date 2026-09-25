# Tabla "Préstamo con su vinculado" en el informe (Fase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando un estudio es de tipo "préstamo" y trae datos en `study.prestamos`, el
informe Word generado por las tres rutas del sistema (subir plantilla `.docx` propia, PDF con
plantilla marcada, "Crear sin plantilla") incluye la tabla "Préstamo con su vinculado" con los
desembolsos detectados, agrupados bajo el nombre de la contraparte.

**Architecture:** Una función de datos pura (`tablasPrestamos.js`) arma la forma
`{nombre, vinculado, encabezados, filas, fuente}` a partir de `study.prestamos`, compartida
por las tres rutas. Cada ruta la consume con su propio mecanismo ya existente para tablas
condicionales (refrescar si la plantilla la trae, insertar si falta junto a "Transacciones
Inter compañía", borrar si no aplica) — el mismo patrón que ya usa la tabla "Operación
adicional Transacciones Intercompañía".

**Tech Stack:** JavaScript puro (`node:test`/`node:assert`), manipulación de texto OOXML y
HTML ya establecida en el repo — sin librerías nuevas.

**Spec:** `docs/superpowers/specs/2026-09-24-estudios-prestamo-design.md` (sección "Fase 2 —
Tabla 'Préstamo con su vinculado' en el informe")

## Global Constraints

- `study.prestamos` es un arreglo de filas (una por desembolso); cada fila trae `otorga`,
  `recibe` (nombres de las partes), `fechaPacto` (string ISO `"AAAA-MM-DD"` o `null`),
  `valorDesembolsoMoneda` (number), `moneda` (string), `valorCOPDesembolso` (number), `tasaEA`
  (string tal cual del Excel).
- "El vinculado" de una fila es la parte (`otorga` o `recibe`) que NO coincide (normalizada:
  mayúsculas, espacios colapsados) con `study.ent`. Con varios vinculados distintos entre las
  filas, todas se listan bajo el vinculado de la PRIMERA fila — decisión de alcance explícita,
  sin precedente de separarlas.
- La tabla se publica solo si `study.tipo_estudio === 'prestamo'` y `study.prestamos` tiene al
  menos una fila; si la plantilla la trae mientras eso no aplica (informe de otro tipo de
  estudio heredado como plantilla), se borra.
- Aparece hasta DOS veces en una plantilla `.docx`/PDF que ya la traiga (se refrescan ambas,
  de atrás hacia adelante, mismo criterio que "Transacciones Inter compañía"). Si falta, se
  inserta UNA sola vez junto a "Transacciones Inter compañía" — la segunda aparición (dentro
  del análisis de comparabilidad) depende de la Fase 4, que no existe todavía.
- `npm test` (la suite completa) debe quedar en verde después de cada tarea.

## Review Focus

- Un estudio con `tipo_estudio !== 'prestamo'` (o sin `study.prestamos`) nunca debe generar ni
  conservar esta tabla en ninguna de las tres rutas, aunque la plantilla la traiga.
- La determinación de "quién es el vinculado" debe funcionar tanto cuando el contribuyente es
  quien RECIBE el préstamo (el caso real conocido) como cuando es quien lo OTORGA.
- Una fila con `fechaPacto: null` (celda vacía o texto de plantilla sin diligenciar) no debe
  romper el formateo de fecha ni mostrar "undefined"/"NaN".
- La tabla insertada por primera vez (plantilla sin la tabla) no debe intentar fabricar una
  fila fusionada en HTML — el nombre del vinculado va en el título de la tabla, no en un
  `colspan` sin probar.
- Un valor no numérico o ausente en `valorDesembolsoMoneda`/`valorCOPDesembolso` debe mostrar
  "—", no "NaN" ni una celda vacía sin explicación (mismo criterio que `montoTexto` ya usa en
  `tablasOperaciones.js`).

---

## Task 1: Datos de la tabla — `tablasPrestamos.js`

**Files:**
- Create: `frontend/src/services/tablasPrestamos.js`
- Test: `frontend/src/services/tablasPrestamos.test.js`

**Interfaces:**
- Produces: `NOMBRES_TABLA_PRESTAMO: string[]`, `tienePrestamos(estudio): boolean`,
  `filasPrestamoConVinculado(estudio): {nombre, vinculado, encabezados, filas, fuente} | null`

**Filas de datos reales** (mismo archivo de referencia de la Fase 1, Autoland — las 4 filas de
desembolso, ya en la forma que produce `excelPrestamosParser.js`):

```js
const PRESTAMOS_AUTOLAND = [
  { otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS', fechaPacto: '2020-10-27', valorDesembolsoMoneda: 3000000, moneda: 'USD', valorCOPDesembolso: 10431000000, tasaEA: '4,540% Efectivo Anual' },
  { otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS', fechaPacto: '2022-07-07', valorDesembolsoMoneda: 2000000, moneda: 'USD', valorCOPDesembolso: 8822000000, tasaEA: '6,000% Efectivo Anual' },
  { otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS', fechaPacto: '2022-10-24', valorDesembolsoMoneda: 1300000, moneda: 'USD', valorCOPDesembolso: 6194500000, tasaEA: '6,000% Efectivo Anual' },
  { otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS', fechaPacto: '2023-03-09', valorDesembolsoMoneda: 4300000, moneda: 'USD', valorCOPDesembolso: 20657200000, tasaEA: '6,000% Efectivo Anual' },
];
```

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/services/tablasPrestamos.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { NOMBRES_TABLA_PRESTAMO, tienePrestamos, filasPrestamoConVinculado } from './tablasPrestamos.js';

const PRESTAMOS_AUTOLAND = [
  { otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS', fechaPacto: '2020-10-27', valorDesembolsoMoneda: 3000000, moneda: 'USD', valorCOPDesembolso: 10431000000, tasaEA: '4,540% Efectivo Anual' },
  { otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS', fechaPacto: '2022-07-07', valorDesembolsoMoneda: 2000000, moneda: 'USD', valorCOPDesembolso: 8822000000, tasaEA: '6,000% Efectivo Anual' },
  { otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS', fechaPacto: '2022-10-24', valorDesembolsoMoneda: 1300000, moneda: 'USD', valorCOPDesembolso: 6194500000, tasaEA: '6,000% Efectivo Anual' },
  { otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS', fechaPacto: '2023-03-09', valorDesembolsoMoneda: 4300000, moneda: 'USD', valorCOPDesembolso: 20657200000, tasaEA: '6,000% Efectivo Anual' },
];

test('NOMBRES_TABLA_PRESTAMO incluye el rótulo real de la tabla', () => {
  assert.ok(NOMBRES_TABLA_PRESTAMO.includes('Préstamo con su vinculado'));
});

test('tienePrestamos exige tipo_estudio prestamo y al menos una fila', () => {
  assert.strictEqual(tienePrestamos({ tipo_estudio: 'prestamo', prestamos: PRESTAMOS_AUTOLAND }), true);
});

test('tienePrestamos falla sin tipo prestamo, sin filas, o sin estudio', () => {
  assert.strictEqual(tienePrestamos({ tipo_estudio: 'estandar', prestamos: PRESTAMOS_AUTOLAND }), false);
  assert.strictEqual(tienePrestamos({ tipo_estudio: 'prestamo', prestamos: [] }), false);
  assert.strictEqual(tienePrestamos({ tipo_estudio: 'prestamo', prestamos: null }), false);
  assert.strictEqual(tienePrestamos(null), false);
});

test('filasPrestamoConVinculado devuelve null si tienePrestamos es falso', () => {
  assert.strictEqual(filasPrestamoConVinculado({ tipo_estudio: 'estandar', prestamos: PRESTAMOS_AUTOLAND }), null);
});

test('filasPrestamoConVinculado arma la tabla real de Autoland: el contribuyente RECIBE el préstamo', () => {
  const estudio = { tipo_estudio: 'prestamo', ent: 'Autoland SAS', prestamos: PRESTAMOS_AUTOLAND };
  const t = filasPrestamoConVinculado(estudio);

  assert.strictEqual(t.nombre, 'Préstamo con su vinculado');
  assert.strictEqual(t.vinculado, 'Inversiones San Jeronimo SpA', 'el vinculado es quien otorga, no el contribuyente que recibe');
  assert.deepStrictEqual(t.encabezados, [
    'Fecha original en la que se pactó',
    'Valor del desembolso en USD',
    'Moneda pactada',
    'Valor en COP en la fecha de desembolso',
    'E. A',
  ]);
  assert.strictEqual(t.filas.length, 4);
  assert.deepStrictEqual(t.filas[0], ['27/10/2020', '3.000.000', 'USD', '10.431.000.000', '4,540% Efectivo Anual']);
  assert.deepStrictEqual(t.filas[3], ['09/03/2023', '4.300.000', 'USD', '20.657.200.000', '6,000% Efectivo Anual']);
  assert.strictEqual(t.fuente, 'Información suministrada por Autoland SAS.');
});

test('filasPrestamoConVinculado identifica al vinculado cuando el contribuyente OTORGA el préstamo', () => {
  const estudio = {
    tipo_estudio: 'prestamo', ent: 'Inversiones San Jeronimo SpA',
    prestamos: [PRESTAMOS_AUTOLAND[0]],
  };
  const t = filasPrestamoConVinculado(estudio);
  assert.strictEqual(t.vinculado, 'Autoland SAS');
});

test('filasPrestamoConVinculado con varios vinculados usa el de la primera fila para todos', () => {
  const estudio = {
    tipo_estudio: 'prestamo', ent: 'Autoland SAS',
    prestamos: [
      PRESTAMOS_AUTOLAND[0],
      { ...PRESTAMOS_AUTOLAND[1], otorga: 'Otro Vinculado Ltda' },
    ],
  };
  const t = filasPrestamoConVinculado(estudio);
  assert.strictEqual(t.vinculado, 'Inversiones San Jeronimo SpA');
  assert.strictEqual(t.filas.length, 2);
});

test('filasPrestamoConVinculado muestra "—" para fecha o montos ausentes', () => {
  const estudio = {
    tipo_estudio: 'prestamo', ent: 'Autoland SAS',
    prestamos: [{ otorga: 'Vinc SAS', recibe: 'Autoland SAS', fechaPacto: null, valorDesembolsoMoneda: null, moneda: '', valorCOPDesembolso: undefined, tasaEA: '' }],
  };
  const t = filasPrestamoConVinculado(estudio);
  assert.deepStrictEqual(t.filas[0], ['—', '—', '—', '—', '—']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/services/tablasPrestamos.test.js`
Expected: FAIL — `tablasPrestamos.js` no existe todavía.

- [ ] **Step 3: Write minimal implementation**

```js
// frontend/src/services/tablasPrestamos.js
import { fmt, num } from '../utils/calculations.js';

export const NOMBRES_TABLA_PRESTAMO = [
  'Préstamo con su vinculado',
  'Préstamos con su vinculado',
];

const normalizarNombreCompania = (s) =>
  String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();

function vinculadoDePrestamo(fila, ent) {
  const entNorm = normalizarNombreCompania(ent);
  if (normalizarNombreCompania(fila.recibe) === entNorm) return fila.otorga;
  if (normalizarNombreCompania(fila.otorga) === entNorm) return fila.recibe;
  return fila.otorga || fila.recibe || 'el vinculado';
}

function fechaTexto(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

const montoTexto = (v) => {
  const n = num(v);
  return n === null ? '—' : fmt(n);
};

export function tienePrestamos(estudio) {
  return !!estudio && estudio.tipo_estudio === 'prestamo'
    && Array.isArray(estudio.prestamos) && estudio.prestamos.length > 0;
}

export function filasPrestamoConVinculado(estudio) {
  if (!tienePrestamos(estudio)) return null;
  const e = estudio;
  const vinculado = vinculadoDePrestamo(e.prestamos[0], e.ent);
  const moneda = e.prestamos[0].moneda || 'moneda pactada';
  return {
    nombre: 'Préstamo con su vinculado',
    vinculado,
    encabezados: [
      'Fecha original en la que se pactó',
      `Valor del desembolso en ${moneda}`,
      'Moneda pactada',
      'Valor en COP en la fecha de desembolso',
      'E. A',
    ],
    filas: e.prestamos.map((p) => [
      fechaTexto(p.fechaPacto),
      montoTexto(p.valorDesembolsoMoneda),
      p.moneda || '—',
      montoTexto(p.valorCOPDesembolso),
      p.tasaEA || '—',
    ]),
    fuente: 'Información suministrada por ' + (e.ent || 'la Compañía') + '.',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/services/tablasPrestamos.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/tablasPrestamos.js frontend/src/services/tablasPrestamos.test.js
git commit -m "feat: datos de la tabla Prestamo con su vinculado"
```

---

## Task 2: Ruta OOXML (`docxRelleno.js`) — plantilla `.docx` propia del cliente

**Files:**
- Modify: `frontend/src/services/docxRelleno.js`
- Test: `frontend/src/services/docxRelleno.test.js`

**Interfaces:**
- Consumes: `NOMBRES_TABLA_PRESTAMO`, `tienePrestamos`, `filasPrestamoConVinculado` (Task 1)
- Produces: `generarTablaOoxmlConVinculado(titulo, vinculado, cabeceras, filas, fuente): string`
  (exportada, mismo contrato de `generarTablaOoxml` más el parámetro `vinculado`)

- [ ] **Step 1: Write the failing test**

Agregar al final de `docxRelleno.test.js`:

```js
import { generarTablaOoxmlConVinculado } from './docxRelleno.js';
// (agregar al import ya existente de la línea 3-23, no un import nuevo — ver Step 3 de abajo
// para la lista completa de símbolos que ese import ya trae)

test('generarTablaOoxmlConVinculado incluye una fila fusionada con el nombre del vinculado', () => {
  const xml = generarTablaOoxmlConVinculado(
    'Tabla 1. Préstamo con su vinculado', 'INVERSIONES SAN JERONIMO SPA',
    ['Fecha', 'Valor'], [['27/10/2020', '3.000.000']], 'Información de Autoland.'
  );
  assert.match(xml, /<w:gridSpan w:val="2"\/>/, 'la fila del vinculado debe fusionar las 2 columnas');
  assert.match(xml, /INVERSIONES SAN JERONIMO SPA/);
  assert.match(xml, /Fecha/);
  assert.match(xml, /27\/10\/2020/);
  assert.match(xml, /FUENTE: Información de Autoland\./);
});

test('generarTablaOoxmlConVinculado sin fuente no emite la línea FUENTE', () => {
  const xml = generarTablaOoxmlConVinculado('T', 'VINC', ['a'], [['b']], '');
  assert.ok(!xml.includes('FUENTE:'));
});

test('actualizarTablasOperacionesOoxml refresca la tabla de préstamo si la plantilla ya la trae', () => {
  const xml =
    '<w:p><w:t>Tabla 1. Préstamo con su vinculado</w:t></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:t>viejo</w:t></w:p></w:tc></w:tr></w:tbl>';
  const estudio = {
    tipo_estudio: 'prestamo', ent: 'Autoland SAS', anio: 2025,
    prestamos: [{ otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS', fechaPacto: '2020-10-27', valorDesembolsoMoneda: 3000000, moneda: 'USD', valorCOPDesembolso: 10431000000, tasaEA: '4,540% Efectivo Anual' }],
  };
  const salida = actualizarTablasOperacionesOoxml(xml, estudio, []);
  assert.ok(salida.includes('Inversiones San Jeronimo SpA'));
  assert.ok(salida.includes('27/10/2020'));
  assert.ok(!salida.includes('viejo'));
});

test('actualizarTablasOperacionesOoxml inserta la tabla de préstamo junto a Transacciones Inter compañía si falta', () => {
  const xml =
    '<w:p><w:t>Tabla 3. Transacciones Inter compañía</w:t></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:t>Razón social</w:t></w:p></w:tc><w:tc><w:p><w:t>ANTERIOR</w:t></w:p></w:tc></w:tr></w:tbl>';
  const estudio = {
    tipo_estudio: 'prestamo', ent: 'Autoland SAS', anio: 2025,
    prestamos: [{ otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS', fechaPacto: '2020-10-27', valorDesembolsoMoneda: 3000000, moneda: 'USD', valorCOPDesembolso: 10431000000, tasaEA: '4,540% Efectivo Anual' }],
  };
  const avisos = [];
  const salida = actualizarTablasOperacionesOoxml(xml, estudio, avisos);
  assert.ok(salida.includes('Préstamo con su vinculado'));
  assert.ok(salida.includes('Inversiones San Jeronimo SpA'));
  assert.ok(avisos.some((a) => a.includes('se insertó la tabla «Préstamo con su vinculado»')));
});

test('actualizarTablasOperacionesOoxml borra la tabla de préstamo si el estudio no aplica', () => {
  const xml =
    '<w:p><w:t>Tabla 1. Préstamo con su vinculado</w:t></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:t>viejo</w:t></w:p></w:tc></w:tr></w:tbl>' +
    '<w:p><w:t>Prosa que sigue.</w:t></w:p>';
  const estudio = { tipo_estudio: 'estandar', ent: 'Otra Empresa SAS', anio: 2025 };
  const salida = actualizarTablasOperacionesOoxml(xml, estudio, []);
  assert.ok(!salida.includes('Préstamo con su vinculado'));
  assert.ok(salida.includes('Prosa que sigue.'), 'no debe borrar lo que sigue en el documento');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/services/docxRelleno.test.js`
Expected: FAIL — `generarTablaOoxmlConVinculado` no existe, y la tabla de préstamo no se
reconoce todavía en `actualizarTablasOperacionesOoxml`.

- [ ] **Step 3: Write minimal implementation**

En `frontend/src/services/docxRelleno.js`, agregar el import (junto a la línea 59-64
existente):

```js
import {
  filasOperacionesDeIngreso, filasOperacionAnalizar, filasTransaccionesIntercompania,
  filasMetodoAplicable, filasCompaniasVinculadas, filasCriteriosVinculacion,
  filasOperacionAdicional, filasOperacionAdicionalFicha, tieneOperacionAdicional,
  NOMBRES_TABLA_ADICIONAL, NOMBRES_TABLA_TRANSACCIONES,
} from './tablasOperaciones.js';
import { tienePrestamos, filasPrestamoConVinculado, NOMBRES_TABLA_PRESTAMO } from './tablasPrestamos.js';
```

Agregar `generarTablaOoxmlConVinculado`, justo después de `generarTablaOoxml` (línea 271-334):

```js
/** Como `generarTablaOoxml`, pero con una fila adicional fusionada (todas las columnas en
 *  una sola celda) antes de los encabezados, con el nombre del vinculado — es la forma real
 *  de la tabla "Préstamo con su vinculado" en el informe entregado a un cliente. Se duplica
 *  el armado de celdas de `generarTablaOoxml` en vez de parametrizarla: cada función de este
 *  archivo arma su tabla de punta a punta, y es el patrón que ya siguen las demás. */
export function generarTablaOoxmlConVinculado(titulo, vinculado, cabeceras, filas, fuente) {
  const colCount = cabeceras.length;
  const anchoColumna = Math.floor(ANCHO_TABLA_PCT / colCount);
  const anchoDe = (i) => (i === colCount - 1
    ? ANCHO_TABLA_PCT - anchoColumna * (colCount - 1)
    : anchoColumna);

  const letra = `<w:rFonts w:ascii="${FUENTE_TABLA}" w:hAnsi="${FUENTE_TABLA}"/>`
    + `<w:sz w:val="${PUNTOS_TABLA * 2}"/>`;
  const borde = (lado, sz) => `<w:${lado} w:val="single" w:sz="${sz}" w:space="0" w:color="000000"/>`;
  const celda = (texto, cabecera, i) =>
    `<w:tc><w:tcPr><w:tcW w:w="${anchoDe(i)}" w:type="pct"/>`
    + (cabecera ? `<w:shd w:val="clear" w:color="auto" w:fill="999999"/>` : '')
    + `<w:vAlign w:val="center"/></w:tcPr>`
    + `<w:p><w:pPr><w:jc w:val="${!cabecera && esProsaLarga(texto) ? 'both' : 'center'}"/></w:pPr>`
    + `<w:r><w:rPr>${letra}`
    + (cabecera ? `<w:color w:val="000000"/><w:b/>` : '')
    + `</w:rPr><w:t>${escaparXml(texto)}</w:t></w:r></w:p></w:tc>`;

  let xml = `<w:p><w:pPr><w:keepNext/><w:outlineLvl w:val="9"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${escaparXml(titulo)}</w:t></w:r></w:p>`;
  xml += `<w:tbl>`;
  xml += `<w:tblPr><w:tblStyle w:val="TableGrid"/>`
    + `<w:tblW w:w="${ANCHO_TABLA_PCT}" w:type="pct"/><w:tblLayout w:type="fixed"/><w:tblBorders>`
    + borde('top', 12) + borde('bottom', 12) + borde('left', 12) + borde('right', 12)
    + borde('insideH', 6) + borde('insideV', 6)
    + `</w:tblBorders>`
    + `<w:tblCellMar><w:top w:w="75" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>`
    + `<w:bottom w:w="75" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar>`
    + `</w:tblPr>`;

  // Fila fusionada con el nombre del vinculado, ocupando las colCount columnas.
  xml += `<w:tr><w:tc><w:tcPr><w:tcW w:w="${ANCHO_TABLA_PCT}" w:type="pct"/>`
    + `<w:gridSpan w:val="${colCount}"/><w:shd w:val="clear" w:color="auto" w:fill="999999"/>`
    + `<w:vAlign w:val="center"/></w:tcPr>`
    + `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr>${letra}<w:color w:val="000000"/><w:b/></w:rPr>`
    + `<w:t>${escaparXml(vinculado)}</w:t></w:r></w:p></w:tc></w:tr>`;

  xml += `<w:tr><w:trPr><w:tblHeader/></w:trPr>`;
  cabeceras.forEach((h, i) => { xml += celda(h, true, i); });
  xml += `</w:tr>`;

  filas.forEach((f) => {
    xml += `<w:tr>`;
    f.forEach((c, i) => { xml += celda(c, false, i); });
    xml += `</w:tr>`;
  });

  xml += `</w:tbl>`;

  if (fuente) {
    xml += `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:b/></w:rPr><w:t>FUENTE: ${escaparXml(fuente)}</w:t></w:r></w:p>`;
  }

  return xml;
}
```

En `actualizarTablasOperacionesOoxml` (línea 2434-3037), agregar el bloque nuevo justo
después del bloque "3-bis. Operación adicional" (que termina en la línea, antes del cambio,
`2590` con `}`) y antes de `// 4. Método de Precios de Transferencia Aplicable` (línea 2592):

```js
  /* 3-ter. Préstamo con su vinculado — el desembolso a desembolso del Excel de préstamos
     (Fase 1 de esta feature). Mismo criterio que "Operación adicional": se publica solo si
     aplica (`tienePrestamos`) y se borra si la plantilla la trae mientras no aplica. Puede
     aparecer hasta dos veces (descripción + análisis); si falta, se inserta solo una vez —
     la segunda aparición vive en el análisis de comparabilidad de tasas, que todavía no
     existe (Fase 4). */
  if (tienePrestamos(estudio)) {
    const t = filasPrestamoConVinculado(estudio);
    const emitirPrestamo = (b) => generarTablaOoxmlConVinculado(
      tituloDe(b, t.nombre), t.vinculado, t.encabezados, t.filas, t.fuente
    );

    const bloquesPrestamo = candidatosBloqueTabla(doc.xml, NOMBRES_TABLA_PRESTAMO);
    if (bloquesPrestamo.length) {
      for (let idx = bloquesPrestamo.length - 1; idx >= 0; idx--) {
        reemplazar(NOMBRES_TABLA_PRESTAMO, emitirPrestamo, { ocurrencia: idx });
      }
    } else {
      const insertadaPrestamo = doc.insertar(
        NOMBRES_TABLA_TRANSACCIONES,
        (ancla) => {
          const titulo = ancla.numero != null ? 'Tabla ' + (ancla.numero + 1) + '. ' + t.nombre : t.nombre;
          return generarTablaOoxmlConVinculado(titulo, t.vinculado, t.encabezados, t.filas, t.fuente);
        },
        { excluir: NOMBRES_TABLA_PRESTAMO }
      );
      if (Array.isArray(avisos)) {
        avisos.push(insertadaPrestamo
          ? 'se insertó la tabla «' + t.nombre + '» después de «Transacciones Inter compañía» ' +
            'porque la plantilla no la traía: revise la numeración de las tablas siguientes'
          : NOMBRES_TABLA_PRESTAMO[0]);
      }
    }
  } else {
    const bloquesPrestamo = candidatosBloqueTabla(doc.xml, NOMBRES_TABLA_PRESTAMO);
    for (let idx = bloquesPrestamo.length - 1; idx >= 0; idx--) {
      doc.borrar(NOMBRES_TABLA_PRESTAMO, { ocurrencia: idx });
    }
  }

```

Y en `docxRelleno.test.js`, agregar `generarTablaOoxmlConVinculado` al import ya existente de
`docxRelleno.js` (línea 3-23): sumarlo a la lista junto a `generarTablaOoxml,
medidaDeImagenAnexoB,` (línea 22).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/services/docxRelleno.test.js`
Expected: PASS (todas las pruebas del archivo, incluidas las 5 nuevas)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `node --test "scripts/lib"/*.test.js "frontend/src/services"/*.test.js "frontend/src/utils"/*.test.js "functions"/*.test.js`
Expected: PASS, 0 fallos

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/docxRelleno.js frontend/src/services/docxRelleno.test.js
git commit -m "feat: tabla Prestamo con su vinculado en la ruta docx de plantilla propia"
```

---

## Task 3: Ruta HTML de plantilla marcada (`tablasOperacionesHtml.js`)

**Files:**
- Modify: `frontend/src/services/tablasOperacionesHtml.js`
- Test: `frontend/src/services/tablasOperacionesHtml.test.js`

**Interfaces:**
- Consumes: `NOMBRES_TABLA_PRESTAMO`, `tienePrestamos`, `filasPrestamoConVinculado` (Task 1)

- [ ] **Step 1: Write the failing test**

Agregar al final de `tablasOperacionesHtml.test.js`:

```js
const TABLA_PRESTAMO_EN_PLANTILLA =
  '<p><strong> Tabla 1. Préstamo con su vinculado</strong></p>' +
  '<table>' +
  '<tr><th><p><strong> Fecha</strong></p></th><th><p><strong> Valor</strong></p></th></tr>' +
  '<tr><td><p> 01/01/2019</p></td><td><p> 999</p></td></tr>' +
  '</table>';

const ESTUDIO_PRESTAMO = {
  tipo_estudio: 'prestamo', ent: 'Autoland SAS', anio: 2025,
  prestamos: [{
    otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS',
    fechaPacto: '2020-10-27', valorDesembolsoMoneda: 3000000, moneda: 'USD',
    valorCOPDesembolso: 10431000000, tasaEA: '4,540% Efectivo Anual',
  }],
};

test('actualizarTablasOperacionesHtml refresca la tabla de préstamo si la plantilla ya la trae', () => {
  const salida = actualizarTablasOperacionesHtml(TABLA_PRESTAMO_EN_PLANTILLA, ESTUDIO_PRESTAMO);
  assert.ok(salida.includes('27/10/2020'));
  assert.ok(salida.includes('Inversiones San Jeronimo SpA'));
  assert.ok(!salida.includes('01/01/2019'), 'no debe sobrevivir la fila vieja de la plantilla');
});

test('actualizarTablasOperacionesHtml inserta la tabla de préstamo si falta, con el vinculado en el título', () => {
  const conAncla =
    '<p><strong> Tabla 3. Transacciones Inter compañía</strong></p>' +
    '<table><tr><th><p><strong> Razón social</strong></p></th></tr>' +
    '<tr><td><p> ANTERIOR</p></td></tr></table>';
  const avisos = [];
  const salida = actualizarTablasOperacionesHtml(conAncla, ESTUDIO_PRESTAMO, avisos);
  assert.ok(salida.includes('Préstamo con su vinculado'));
  assert.ok(salida.includes('Inversiones San Jeronimo SpA'), 'el vinculado debe quedar visible en el título de la tabla insertada');
});

test('actualizarTablasOperacionesHtml borra la tabla de préstamo si el estudio no es de ese tipo', () => {
  const estudioEstandar = { tipo_estudio: 'estandar', ent: 'Otra Empresa SAS' };
  const salida = actualizarTablasOperacionesHtml(TABLA_PRESTAMO_EN_PLANTILLA, estudioEstandar);
  assert.ok(!salida.includes('Préstamo con su vinculado'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/services/tablasOperacionesHtml.test.js`
Expected: FAIL — la tabla de préstamo todavía no se reconoce.

- [ ] **Step 3: Write minimal implementation**

En `frontend/src/services/tablasOperacionesHtml.js`, agregar al import de
`tablasOperaciones.js` existente... en realidad los nombres de préstamo vienen de
`tablasPrestamos.js`, un archivo nuevo — agregar un import propio junto a los existentes
(línea 22-34):

```js
import { tienePrestamos, filasPrestamoConVinculado, NOMBRES_TABLA_PRESTAMO } from './tablasPrestamos.js';
```

Agregar el bloque nuevo justo después del bloque de "Operación adicional" (que termina en la
línea, antes del cambio, `290` con `}`) y antes del bloque final de avisos de `SIN_MOTOR`
(línea 292):

```js
  /* «Préstamo con su vinculado» (Fase 2 de la feature de préstamos) — mismo criterio que
     «Operación adicional»: se publica solo si aplica (`tienePrestamos`) y se borra si la
     plantilla la trae mientras no aplica. Puede aparecer hasta dos veces (descripción +
     análisis): se refrescan todas las que la plantilla ya traiga, conservando su fila
     fusionada del vinculado tal cual (`reescribirFilasHtml` solo toca las filas de datos).
     Si falta, se inserta una sola vez junto a «Transacciones Inter compañía» — el ancla no
     tiene esa fila fusionada y fabricar un `colspan` en HTML no está probado en este código,
     así que el nombre del vinculado va en el propio título de la tabla insertada. */
  if (tienePrestamos(estudio)) {
    const bloquesPrestamo = localizarTablasHtml(out, NOMBRES_TABLA_PRESTAMO);
    if (bloquesPrestamo.length) {
      for (const bloque of [...bloquesPrestamo].reverse()) {
        out = sustituir(out, bloque, filasPrestamoConVinculado(estudio), false, 0);
      }
    } else {
      const anclaPrestamo = localizarTablaHtml(out, NOMBRES_TABLA_TRANSACCIONES, {
        excluir: NOMBRES_TABLA_ADICIONAL.concat(NOMBRES_TABLA_PRESTAMO),
      });
      const tPrestamo = filasPrestamoConVinculado(estudio);
      if (anclaPrestamo && tPrestamo) {
        const numeroAncla = numeroDeTabla(anclaPrestamo.titulo);
        const titulo = (numeroAncla != null ? 'Tabla ' + (numeroAncla + 1) + '. ' : '')
          + tPrestamo.nombre + ' — ' + tPrestamo.vinculado;
        out = insertarTablaHtml(out, anclaPrestamo, tPrestamo, titulo);
        if (Array.isArray(avisos)) {
          avisos.push(
            'se insertó la tabla «' + tPrestamo.nombre + '» después de «' + anclaPrestamo.titulo
            + '» porque la plantilla no la traía: revise la numeración de las tablas siguientes'
          );
        }
      } else if (Array.isArray(avisos)) {
        avisos.push(NOMBRES_TABLA_PRESTAMO[0]);
      }
    }
  } else {
    const bloquesPrestamo = localizarTablasHtml(out, NOMBRES_TABLA_PRESTAMO);
    for (const bloque of [...bloquesPrestamo].reverse()) {
      out = borrarTablaHtml(out, bloque);
    }
  }

```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/services/tablasOperacionesHtml.test.js`
Expected: PASS (todas las pruebas del archivo, incluidas las 3 nuevas)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/tablasOperacionesHtml.js frontend/src/services/tablasOperacionesHtml.test.js
git commit -m "feat: tabla Prestamo con su vinculado en la ruta html de plantilla marcada"
```

---

## Task 4: Ruta "Crear sin plantilla" (`informeSinPlantilla.js`) y verificación final

**Files:**
- Modify: `frontend/src/services/informeSinPlantilla.js`
- Test: `frontend/src/services/informeSinPlantilla.test.js`

**Interfaces:**
- Consumes: `filasPrestamoConVinculado` (Task 1)

- [ ] **Step 1: Write the failing test**

Agregar al final de `informeSinPlantilla.test.js`:

```js
const CONTRIBUYENTE_PRESTAMO = {
  ent: 'Autoland SAS', nit: '900123456-7', anio: 2025, tipo_estudio: 'prestamo',
  prestamos: [{
    otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS',
    fechaPacto: '2020-10-27', valorDesembolsoMoneda: 3000000, moneda: 'USD',
    valorCOPDesembolso: 10431000000, tasaEA: '4,540% Efectivo Anual',
  }],
};

test('incluye la tabla de préstamo cuando el estudio es de ese tipo y trae datos', () => {
  const html = construirHtmlSinPlantilla(CONTRIBUYENTE_PRESTAMO, null, null);
  assert.ok(html.includes('Préstamo con su vinculado'));
  assert.ok(html.includes('Inversiones San Jeronimo SpA'));
  assert.ok(html.includes('27/10/2020'));
});

test('no incluye la tabla de préstamo en un estudio estándar', () => {
  const html = construirHtmlSinPlantilla({ ...CONTRIBUYENTE_PRESTAMO, tipo_estudio: 'estandar' }, null, null);
  assert.ok(!html.includes('Préstamo con su vinculado'));
});

test('no incluye la tabla de préstamo en un estudio préstamo sin datos cargados', () => {
  const html = construirHtmlSinPlantilla({ ...CONTRIBUYENTE_PRESTAMO, prestamos: [] }, null, null);
  assert.ok(!html.includes('Préstamo con su vinculado'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/services/informeSinPlantilla.test.js`
Expected: FAIL — la sección de préstamo no existe todavía en `construirHtmlSinPlantilla`.

- [ ] **Step 3: Write minimal implementation**

En `frontend/src/services/informeSinPlantilla.js`, agregar el import (junto a la línea 24-29
existente):

```js
import { filasPrestamoConVinculado } from './tablasPrestamos.js';
```

En `construirHtmlSinPlantilla` (línea 186-223), calcular la tabla de préstamo antes del
arreglo `partes` y agregar su sección, junto a las demás secciones condicionales (después de
`seccion('Operaciones con el vinculado', ...)`, línea 199):

```js
export function construirHtmlSinPlantilla(estudio, analisisMercado, analisisSector) {
  const e = estudio || {};
  const year = Number(e.anio) || new Date().getFullYear();
  const tPrestamo = filasPrestamoConVinculado(e);

  const partes = [
    '<h1>Informe Local de Precios de Transferencia — Borrador sin plantilla</h1>',
    '<p>Documento generado directamente con los datos ingresados al sistema para este ' +
      'estudio, sin partir de ninguna plantilla ni informe de referencia. Es un borrador ' +
      'de trabajo: complételo y dele formato antes de radicar.</p>',
    seccion('Datos del contribuyente', fichaContribuyente(e)),
    seccion('Vinculado económico', fichaVinculado(e)),
    seccion('Composición accionaria', tablaDesde(filasComposicionAccionaria(e))),
    seccion('Operación analizada', tablaDesde(filasOperacionAnalizar(e))),
    seccion('Operaciones con el vinculado', tablaDesde(filasOperacionesDeIngreso(e))),
    seccion(
      tPrestamo ? 'Préstamo con su vinculado — ' + tPrestamo.vinculado : 'Préstamo con su vinculado',
      tablaDesde(tPrestamo),
    ),
    seccion('Estados financieros', tablaDesde(filasActivos(e))),
```

(el resto del arreglo `partes` sigue exactamente igual que hoy, sin más cambios).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/services/informeSinPlantilla.test.js`
Expected: PASS (todas las pruebas del archivo, incluidas las 3 nuevas)

- [ ] **Step 5: Run the full suite one more time**

Run: `node --test "scripts/lib"/*.test.js "frontend/src/services"/*.test.js "frontend/src/utils"/*.test.js "functions"/*.test.js`
Expected: PASS, 0 fallos

- [ ] **Step 6: Build and lint**

Run: `npm run build --prefix frontend`
Expected: compila sin errores.

Run: `npm run lint --prefix frontend`
Expected: sin advertencias nuevas en los archivos tocados de esta fase.

- [ ] **Step 7: Verificación manual**

Con `npm run dev --prefix frontend`, en un estudio `tipo_estudio = 'prestamo'` con
`study.prestamos` ya cargado (Fase 1):
1. Generar el informe con "Crear sin plantilla" y confirmar que la sección "Préstamo con su
   vinculado — Inversiones San Jeronimo SpA" aparece con la tabla de 4 filas.
2. Si hay a mano una plantilla `.docx` o PDF de un informe de préstamo anterior, generar el
   informe por esa ruta y confirmar que la tabla aparece (refrescada o insertada según traiga
   o no la plantilla).
3. Repetir con un estudio estándar y confirmar que la tabla NO aparece en ninguna ruta.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/services/informeSinPlantilla.js frontend/src/services/informeSinPlantilla.test.js
git commit -m "feat: tabla Prestamo con su vinculado en la ruta Crear sin plantilla"
```
