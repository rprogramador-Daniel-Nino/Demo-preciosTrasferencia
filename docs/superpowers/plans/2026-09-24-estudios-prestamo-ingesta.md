# Ingesta del Excel de préstamo (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando un estudio es de tipo "préstamo", el paso "Ingesta de Operaciones" lee la
hoja de préstamos del Excel de operaciones (18 columnas propias, nombre de hoja variable) y
guarda esos datos en el estudio, mostrándolos en una tarjeta de resumen.

**Architecture:** Un módulo nuevo y puro, `excelPrestamosParser.js`, sabe reconocer la fila
de encabezados de la hoja de préstamos, indexar sus 18 columnas por texto (sin tildes,
insensible a mayúsculas) y convertir sus filas a objetos de datos, incluida la conversión de
fechas seriales de Excel a texto ISO. `excelOperationsParser.js` deja de barrer esas hojas
con el filtro genérico de "VINC"/"PARAISO" (que hoy las atrapa por error) y en su lugar las
enruta a este módulo nuevo, agregando el resultado en un campo `prestamos` del objeto que ya
devuelve. `IngestaOperaciones.jsx` guarda ese campo en el estudio y lo muestra, pero SOLO
cuando `study.tipo_estudio === 'prestamo'` — el parser en sí sigue sin saber qué tipo de
estudio es.

**Tech Stack:** React 19, `xlsx-js-style` (ya en uso), `node:test`/`node:assert` para pruebas
unitarias (mismo runner que el resto de `frontend/src/services/*.test.js`).

**Spec:** `docs/superpowers/specs/2026-09-24-estudios-prestamo-design.md` (sección "Fase 1 —
Ingesta del Excel de préstamo")

## Global Constraints

- El reconocimiento de la hoja de préstamos hace match si el nombre normalizado (sin tildes,
  mayúsculas) contiene `'PREST'` — decisión explícita del usuario, más laxa que `'PRESTAM'`.
- No se activa `cellDates: true` en `XLSX.read` (afectaría a todas las demás hojas); la
  conversión de fecha serial se hace puntual, solo sobre las columnas de fecha de la hoja de
  préstamos.
- Las fechas se guardan en `study.prestamos` como texto ISO `"AAAA-MM-DD"`, nunca como
  objetos `Date`: `study` se serializa a JSON en `localStorage` (un `Date` se vuelve texto y
  no se revive al releer) y a Firestore (un `Date` se vuelve `Timestamp`, con otra forma). Un
  string ISO viaja igual por las dos rutas.
- `excelOperationsParser.js` y `excelPrestamosParser.js` siguen siendo agnósticos de
  `study.tipo_estudio` (no reciben `study`). El único punto que decide "esto aplica porque el
  estudio es de tipo préstamo" es `IngestaOperaciones.jsx`.
- `npm test` (la suite completa, ~2840 pruebas) debe quedar en verde después de cada tarea.

## Review Focus

- Una celda de fecha vacía o con el texto de plantilla sin diligenciar ("DD/MM/AAAA") no debe
  romper el parser ni producir una fecha inválida — debe devolver `null`.
- Reconstruir la fecha ISO guardada (`"2020-10-27"`) como `Date` para mostrarla en la tarjeta
  no debe desplazarse un día por la zona horaria de Colombia (UTC-5).
- Un estudio que NO es de tipo préstamo, con un Excel que sí trae la hoja de préstamos, no
  debe guardar `study.prestamos` ni mostrar la tarjeta nueva.
- Las filas de plantilla sin diligenciar (otorgante/receptor vacíos, como las de la hoja de
  paraísos fiscales del archivo de referencia) no deben colarse como operaciones reales.
- Un nombre de hoja que contiene "PREST" por coincidencia pero no tiene el formato de
  préstamo (sin fila "crédito"+"razón social" en las primeras 25 filas) debe devolver
  `prestamos: null` en silencio, no fallar.

---

## Task 1: Conversión de fecha serial de Excel

**Files:**
- Create: `frontend/src/services/excelPrestamosParser.js`
- Test: `frontend/src/services/excelPrestamosParser.test.js`

**Interfaces:**
- Produces: `fechaDeSerialExcel(valor): Date | null`, `fechaISODeSerialExcel(valor): string | null` (formato `"AAAA-MM-DD"`)

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/services/excelPrestamosParser.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { fechaDeSerialExcel, fechaISODeSerialExcel } from './excelPrestamosParser.js';

test('fechaDeSerialExcel convierte un serial real de Excel a la fecha correcta', () => {
  // 44131 es la fecha del primer desembolso del archivo de referencia: 27/10/2020.
  const fecha = fechaDeSerialExcel(44131);
  assert.strictEqual(fecha.getFullYear(), 2020);
  assert.strictEqual(fecha.getMonth(), 9); // octubre, 0-indexado
  assert.strictEqual(fecha.getDate(), 27);
});

test('fechaDeSerialExcel devuelve null para vacío, texto de plantilla o cero', () => {
  assert.strictEqual(fechaDeSerialExcel(''), null);
  assert.strictEqual(fechaDeSerialExcel('DD/MM/AAAA'), null);
  assert.strictEqual(fechaDeSerialExcel(0), null);
  assert.strictEqual(fechaDeSerialExcel(null), null);
  assert.strictEqual(fechaDeSerialExcel(undefined), null);
});

test('fechaDeSerialExcel deja pasar un Date ya construido', () => {
  const d = new Date(2020, 9, 27);
  assert.strictEqual(fechaDeSerialExcel(d), d);
});

test('fechaISODeSerialExcel devuelve texto "AAAA-MM-DD", no un objeto Date', () => {
  assert.strictEqual(fechaISODeSerialExcel(44131), '2020-10-27');
  assert.strictEqual(typeof fechaISODeSerialExcel(44131), 'string');
  assert.strictEqual(fechaISODeSerialExcel(''), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/services/excelPrestamosParser.test.js`
Expected: FAIL — `excelPrestamosParser.js` no existe todavía (error de import).

- [ ] **Step 3: Write minimal implementation**

```js
// frontend/src/services/excelPrestamosParser.js
import XLSX from 'xlsx-js-style';

/* Convierte una fecha serial de Excel (días desde el 30/12/1899) a un objeto Date. Solo se
   usa para las columnas de fecha de la hoja de préstamos: el resto del parser de
   operaciones lee todas las hojas como texto plano
   (`sheet_to_json(sh, {header:1, defval:''})`), y activar `cellDates:true` globalmente en
   `XLSX.read` arriesgaba cambiar ese comportamiento en hojas que hoy funcionan bien. */
export function fechaDeSerialExcel(valor) {
  if (valor instanceof Date) return valor;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return null;
  const { y, m, d } = XLSX.SSF.parse_date_code(n);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/* Fecha en formato ISO de solo fecha ("AAAA-MM-DD"), no un objeto Date: `study` se guarda
   tal cual en localStorage (JSON, donde un Date se vuelve texto y no se revive al releer) y
   en Firestore (donde un Date se vuelve Timestamp, con otra forma). Un string ISO viaja
   igual por las dos rutas y se reconstruye al mostrarlo, así que es lo único seguro de
   guardar en el estudio. */
export function fechaISODeSerialExcel(valor) {
  const fecha = fechaDeSerialExcel(valor);
  if (!fecha) return null;
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/services/excelPrestamosParser.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/excelPrestamosParser.js frontend/src/services/excelPrestamosParser.test.js
git commit -m "feat: conversion de fecha serial de Excel para la hoja de prestamos"
```

---

## Task 2: Reconocimiento de encabezados y columnas de la hoja de préstamos

**Files:**
- Modify: `frontend/src/services/excelPrestamosParser.js`
- Modify: `frontend/src/services/excelPrestamosParser.test.js`

**Interfaces:**
- Consumes: nada nuevo de Task 1.
- Produces: `esFilaEncabezadoPrestamo(fila: Array): boolean`,
  `indicesColumnasPrestamo(encabezado: Array): {iCredito, iOtorga, iRecibe, iFuente,
  iFechaPacto, iValorMoneda, iMoneda, iNumDesembolsos, iFechaDesembolso, iValorCOP,
  iSaldoCOP, iInteresesMoneda, iInteresesCOP, iPlazo, iRenovado, iCancelado, iTasaEA,
  iTasaPactada, iPeriodicidad}` (todos `number`, `-1` si no se encontró la columna)

**Fila de encabezado real** (para las pruebas — verbatim del archivo de referencia
`Informacion Operaciones PT 2025_Autoland.xlsx`, hoja `Op. Prestamos Vinculados Econom`,
fila 7 1-based):

```js
const ENCABEZADO_PRESTAMOS = [
  'Crédito',
  'Razón Social de quien otorga el préstamo',
  'Razón Social de quien recibe el préstamo',
  'Fuente de los recursos',
  'Fecha original en la que se pactó',
  'Valor del desembolso en la moneda pactada',
  'Moneda pactada',
  'No. de desembolsos',
  'Fecha de desembolso',
  'Valor en COP en la fecha de desembolso',
  'Valor en COP del saldo al 31 de diciembre de 2025',
  'Monto de intereses causados o recibidos durante el FY 2025 (Moneda pactada)',
  'Monto de intereses causados o recibidos durante el FY 2025 (COP)',
  'Plazo',
  'El préstamo fue renovado (Si aplica indicar la fecha de su última renovación)',
  'El préstamo fue cancelado (Si aplica indicar la fecha de su cancelación)',
  'Tasa de interés EFECTIVA ANUAL',
  'Tasa de interés pactada (en caso de no haber pactado una tasa en términos EA)',
  'Indicar periodicidad y valor de la tasa pactada (ej Libor USD tres meses) de aplicar',
];
```

- [ ] **Step 1: Write the failing test**

Agregar al final de `excelPrestamosParser.test.js`:

```js
import { esFilaEncabezadoPrestamo, indicesColumnasPrestamo } from './excelPrestamosParser.js';

const ENCABEZADO_PRESTAMOS = [
  'Crédito',
  'Razón Social de quien otorga el préstamo',
  'Razón Social de quien recibe el préstamo',
  'Fuente de los recursos',
  'Fecha original en la que se pactó',
  'Valor del desembolso en la moneda pactada',
  'Moneda pactada',
  'No. de desembolsos',
  'Fecha de desembolso',
  'Valor en COP en la fecha de desembolso',
  'Valor en COP del saldo al 31 de diciembre de 2025',
  'Monto de intereses causados o recibidos durante el FY 2025 (Moneda pactada)',
  'Monto de intereses causados o recibidos durante el FY 2025 (COP)',
  'Plazo',
  'El préstamo fue renovado (Si aplica indicar la fecha de su última renovación)',
  'El préstamo fue cancelado (Si aplica indicar la fecha de su cancelación)',
  'Tasa de interés EFECTIVA ANUAL',
  'Tasa de interés pactada (en caso de no haber pactado una tasa en términos EA)',
  'Indicar periodicidad y valor de la tasa pactada (ej Libor USD tres meses) de aplicar',
];

test('esFilaEncabezadoPrestamo reconoce la fila real de encabezados', () => {
  assert.strictEqual(esFilaEncabezadoPrestamo(ENCABEZADO_PRESTAMOS), true);
});

test('esFilaEncabezadoPrestamo no confunde una fila de datos ni el título de la hoja', () => {
  assert.strictEqual(esFilaEncabezadoPrestamo(['Operaciones de préstamo']), false);
  assert.strictEqual(esFilaEncabezadoPrestamo([1, 'Inversiones San Jeronimo SpA', 'Autoland SAS']), false);
  assert.strictEqual(esFilaEncabezadoPrestamo([]), false);
  assert.strictEqual(esFilaEncabezadoPrestamo(null), false);
});

test('indicesColumnasPrestamo ubica cada columna de la fila real, sin colisiones', () => {
  const idx = indicesColumnasPrestamo(ENCABEZADO_PRESTAMOS);
  assert.strictEqual(idx.iCredito, 0);
  assert.strictEqual(idx.iOtorga, 1);
  assert.strictEqual(idx.iRecibe, 2);
  assert.strictEqual(idx.iFuente, 3);
  assert.strictEqual(idx.iFechaPacto, 4);
  assert.strictEqual(idx.iValorMoneda, 5, 'valor del desembolso en moneda pactada, no en COP');
  assert.strictEqual(idx.iMoneda, 6);
  assert.strictEqual(idx.iNumDesembolsos, 7);
  assert.strictEqual(idx.iFechaDesembolso, 8);
  assert.strictEqual(idx.iValorCOP, 9, 'valor en COP EN LA FECHA DE DESEMBOLSO, no el saldo');
  assert.strictEqual(idx.iSaldoCOP, 10);
  assert.strictEqual(idx.iInteresesMoneda, 11, 'intereses en moneda pactada, no en COP');
  assert.strictEqual(idx.iInteresesCOP, 12);
  assert.strictEqual(idx.iPlazo, 13);
  assert.strictEqual(idx.iRenovado, 14);
  assert.strictEqual(idx.iCancelado, 15);
  assert.strictEqual(idx.iTasaEA, 16);
  assert.strictEqual(idx.iTasaPactada, 17);
  assert.strictEqual(idx.iPeriodicidad, 18);
});

test('indicesColumnasPrestamo devuelve -1 para columnas ausentes', () => {
  const idx = indicesColumnasPrestamo(['Crédito', 'Razón Social de quien otorga el préstamo']);
  assert.strictEqual(idx.iRecibe, -1);
  assert.strictEqual(idx.iTasaEA, -1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/services/excelPrestamosParser.test.js`
Expected: FAIL — `esFilaEncabezadoPrestamo`/`indicesColumnasPrestamo` no existen todavía.

- [ ] **Step 3: Write minimal implementation**

Agregar a `excelPrestamosParser.js`, antes de `fechaDeSerialExcel` (o después, el orden no
importa mientras quede antes de `parseHojaPrestamos` en la Task 3):

```js
/* Mismo criterio de normalización que usa excelOperationsParser.js para nombres de hoja:
   cada contribuyente titula sus columnas a su manera y no hay que exigir el texto exacto de
   la plantilla. */
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** ¿Esta fila es la de encabezados de la hoja de préstamos? */
export function esFilaEncabezadoPrestamo(fila) {
  const s = (fila || []).map(norm).join(' ');
  return s.includes('credito') && s.includes('razon social');
}

/**
 * Dónde está cada dato en la fila de encabezados de la hoja de préstamos. A diferencia de
 * `indicesDeEncabezado` (excelOperationsParser.js), esta hoja no comparte ninguna columna
 * con el formato genérico de vinculados/paraísos fiscales.
 */
export function indicesColumnasPrestamo(encabezado) {
  const fila = (encabezado || []).map(norm);
  const encuentra = (pred) => fila.findIndex(pred);
  return {
    iCredito: encuentra(s => s.includes('credito')),
    iOtorga: encuentra(s => s.includes('otorga')),
    iRecibe: encuentra(s => s.includes('recibe')),
    iFuente: encuentra(s => s.includes('fuente de los recursos')),
    iFechaPacto: encuentra(s => s.includes('fecha original')),
    // Sin excluir "cop" aquí, "valor del desembolso en la moneda pactada" y "valor en cop
    // en la fecha de desembolso" no colisionan porque ninguna contiene el texto de la otra;
    // el filtro real que hace falta es el de iValorCOP, más abajo.
    iValorMoneda: encuentra(s => s.includes('valor del desembolso')),
    iMoneda: encuentra(s => s.includes('moneda pactada')),
    // "No. de desembolsos" es la única columna en plural; las otras tres que mencionan
    // "desembolso" lo hacen en singular.
    iNumDesembolsos: encuentra(s => s.includes('desembolsos')),
    iFechaDesembolso: encuentra(s => s.includes('fecha de desembolso')),
    // Necesita las dos palabras: "valor en cop" sola también calza con el saldo al 31 de
    // diciembre, que es una columna distinta.
    iValorCOP: encuentra(s => s.includes('valor en cop') && s.includes('desembolso')),
    iSaldoCOP: encuentra(s => s.includes('saldo al 31')),
    iInteresesMoneda: encuentra(s => s.includes('monto de intereses') && !s.includes('cop')),
    iInteresesCOP: encuentra(s => s.includes('monto de intereses') && s.includes('cop')),
    iPlazo: encuentra(s => s === 'plazo'),
    iRenovado: encuentra(s => s.includes('renovado')),
    iCancelado: encuentra(s => s.includes('cancelado')),
    iTasaEA: encuentra(s => s.includes('efectiva anual')),
    iTasaPactada: encuentra(s => s.includes('tasa de interes pactada')),
    iPeriodicidad: encuentra(s => s.includes('periodicidad')),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/services/excelPrestamosParser.test.js`
Expected: PASS (8 tests en total)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/excelPrestamosParser.js frontend/src/services/excelPrestamosParser.test.js
git commit -m "feat: reconocimiento de encabezados y columnas de la hoja de prestamos"
```

---

## Task 3: `parseHojaPrestamos` — de filas crudas a objetos de préstamo

**Files:**
- Modify: `frontend/src/services/excelPrestamosParser.js`
- Modify: `frontend/src/services/excelPrestamosParser.test.js`

**Interfaces:**
- Consumes: `fechaISODeSerialExcel` (Task 1), `esFilaEncabezadoPrestamo`,
  `indicesColumnasPrestamo` (Task 2)
- Produces: `parseHojaPrestamos(datos: Array<Array>, opciones?: {esParaisoFiscal?: boolean}):
  Array<{credito, otorga, recibe, fuente, fechaPacto, valorDesembolsoMoneda, moneda,
  numDesembolsos, fechaDesembolso, valorCOPDesembolso, saldoCOP, interesesMoneda,
  interesesCOP, plazo, renovado, cancelado, tasaEA, tasaPactada, periodicidad,
  esParaisoFiscal}>` — `fechaPacto`/`fechaDesembolso` son string ISO o `null`; los montos son
  `number`; el resto son `string`.

**Filas de datos reales** (mismo archivo de referencia, las 4 primeras filas de desembolso —
las que después alimentan la Tabla 1 del informe en la Fase 2):

```js
const FILAS_PRESTAMOS_AUTOLAND = [
  [1, 'Inversiones San Jeronimo SpA', 'Autoland SAS', '', 44131, 3000000, 'USD', 1, 44131, 10431000000, 13227449999.999998, 138470.00000000003, 579346941, 'No definido', 'DD/MM/AAAA', 'DD/MM/AAAA', '4,540% Efectivo Anual', '', ''],
  [2, 'Inversiones San Jeronimo SpA', 'Autoland SAS', '', 44749, 2000000, 'USD', 1, 44749, 8822000000, 8818300000, 122001, 510441906, 'No definido', 'DD/MM/AAAA', 'DD/MM/AAAA', '6,000% Efectivo Anual', '', ''],
  [3, 'Inversiones San Jeronimo SpA', 'Autoland SAS', '', 44858, 1300000, 'USD', 1, 44858, 6194500000, 5731895000, 79300, 331784592, 'No definido', 'DD/MM/AAAA', 'DD/MM/AAAA', '6,000% Efectivo Anual', '', ''],
  [3, 'Inversiones San Jeronimo SpA', 'Autoland SAS', '', 44994, 4300000, 'USD', 1, 44994, 20657200000, 18959345000, 262301, 1097445415, 'No definido', 'DD/MM/AAAA', 'DD/MM/AAAA', '6,000% Efectivo Anual', '', ''],
];
```

- [ ] **Step 1: Write the failing test**

Agregar al final de `excelPrestamosParser.test.js`:

```js
import { parseHojaPrestamos } from './excelPrestamosParser.js';

const FILAS_PRESTAMOS_AUTOLAND = [
  [1, 'Inversiones San Jeronimo SpA', 'Autoland SAS', '', 44131, 3000000, 'USD', 1, 44131, 10431000000, 13227449999.999998, 138470.00000000003, 579346941, 'No definido', 'DD/MM/AAAA', 'DD/MM/AAAA', '4,540% Efectivo Anual', '', ''],
  [2, 'Inversiones San Jeronimo SpA', 'Autoland SAS', '', 44749, 2000000, 'USD', 1, 44749, 8822000000, 8818300000, 122001, 510441906, 'No definido', 'DD/MM/AAAA', 'DD/MM/AAAA', '6,000% Efectivo Anual', '', ''],
  [3, 'Inversiones San Jeronimo SpA', 'Autoland SAS', '', 44858, 1300000, 'USD', 1, 44858, 6194500000, 5731895000, 79300, 331784592, 'No definido', 'DD/MM/AAAA', 'DD/MM/AAAA', '6,000% Efectivo Anual', '', ''],
  [3, 'Inversiones San Jeronimo SpA', 'Autoland SAS', '', 44994, 4300000, 'USD', 1, 44994, 20657200000, 18959345000, 262301, 1097445415, 'No definido', 'DD/MM/AAAA', 'DD/MM/AAAA', '6,000% Efectivo Anual', '', ''],
];

function hojaPrestamosCompleta(filasDeDatos) {
  const datos = [];
  for (let i = 0; i < 6; i++) datos.push([]); // portada/instrucciones, como en el archivo real
  datos.push(ENCABEZADO_PRESTAMOS);
  filasDeDatos.forEach(f => datos.push(f));
  return datos;
}

test('parseHojaPrestamos lee las 4 filas reales de Autoland con sus valores correctos', () => {
  const filas = parseHojaPrestamos(hojaPrestamosCompleta(FILAS_PRESTAMOS_AUTOLAND));

  assert.strictEqual(filas.length, 4);
  assert.deepStrictEqual(filas[0], {
    credito: '1',
    otorga: 'Inversiones San Jeronimo SpA',
    recibe: 'Autoland SAS',
    fuente: '',
    fechaPacto: '2020-10-27',
    valorDesembolsoMoneda: 3000000,
    moneda: 'USD',
    numDesembolsos: '1',
    fechaDesembolso: '2020-10-27',
    valorCOPDesembolso: 10431000000,
    saldoCOP: 13227449999.999998,
    interesesMoneda: 138470.00000000003,
    interesesCOP: 579346941,
    plazo: 'No definido',
    renovado: 'DD/MM/AAAA',
    cancelado: 'DD/MM/AAAA',
    tasaEA: '4,540% Efectivo Anual',
    tasaPactada: '',
    periodicidad: '',
    esParaisoFiscal: false,
  });
  assert.strictEqual(filas[3].fechaPacto, '2023-03-09', 'último desembolso: 9/03/2023');
  assert.strictEqual(filas[3].valorDesembolsoMoneda, 4300000);
  assert.strictEqual(filas[3].tasaEA, '6,000% Efectivo Anual');
});

test('parseHojaPrestamos marca esParaisoFiscal según la opción recibida', () => {
  const filas = parseHojaPrestamos(hojaPrestamosCompleta(FILAS_PRESTAMOS_AUTOLAND.slice(0, 1)), { esParaisoFiscal: true });
  assert.strictEqual(filas[0].esParaisoFiscal, true);
});

test('parseHojaPrestamos descarta las filas de plantilla sin otorgante ni receptor', () => {
  // Igual a las filas vacías de "Op. Prestamos Paraisos Fiscales" en el archivo real: el
  // formato trae varias filas en blanco por si el contribuyente tiene más préstamos.
  const filaPlantillaVacia = [1, '', '', '', '', '', '', 1, 'DD/MM/AAAA', '', '', 0, 0, '', 'DD/MM/AAAA', 'DD/MM/AAAA', '', '', ''];
  const filas = parseHojaPrestamos(hojaPrestamosCompleta([FILAS_PRESTAMOS_AUTOLAND[0], filaPlantillaVacia]));
  assert.strictEqual(filas.length, 1, 'la fila en blanco no debe colarse como operación');
});

test('parseHojaPrestamos devuelve [] si no encuentra la fila de encabezados', () => {
  const datos = [['nada aquí'], ['tampoco esto']];
  assert.deepStrictEqual(parseHojaPrestamos(datos), []);
});

test('parseHojaPrestamos devuelve [] con datos vacíos o ausentes', () => {
  assert.deepStrictEqual(parseHojaPrestamos([]), []);
  assert.deepStrictEqual(parseHojaPrestamos(null), []);
  assert.deepStrictEqual(parseHojaPrestamos(undefined), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/services/excelPrestamosParser.test.js`
Expected: FAIL — `parseHojaPrestamos` no existe todavía.

- [ ] **Step 3: Write minimal implementation**

Agregar a `excelPrestamosParser.js`:

```js
function numero(valor) {
  const n = parseFloat(String(valor ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function texto(valor) {
  return String(valor ?? '').trim();
}

/**
 * Lee las filas de una hoja de préstamos ya convertida a arreglo de arreglos
 * (`XLSX.utils.sheet_to_json(sh, {header:1, defval:''})`). Devuelve `[]` si no encuentra la
 * fila de encabezados en las primeras 25 filas, o si no hay ninguna fila de datos válida.
 *
 * @param {Array<Array>} datos
 * @param {{esParaisoFiscal?: boolean}} [opciones]
 */
export function parseHojaPrestamos(datos, { esParaisoFiscal = false } = {}) {
  if (!datos || !datos.length) return [];

  let encIdx = -1;
  for (let i = 0; i < Math.min(datos.length, 25); i++) {
    if (esFilaEncabezadoPrestamo(datos[i])) { encIdx = i; break; }
  }
  if (encIdx === -1) return [];

  const idx = indicesColumnasPrestamo(datos[encIdx]);
  const col = (f, i) => (i > -1 ? f[i] : '');
  const filas = [];

  for (let i = encIdx + 1; i < datos.length; i++) {
    const f = datos[i] || [];
    const otorga = texto(col(f, idx.iOtorga));
    const recibe = texto(col(f, idx.iRecibe));
    // Filas de plantilla sin diligenciar (el formato trae varias en blanco por si el
    // contribuyente tiene más préstamos que filas de ejemplo) no son operaciones reales.
    if (!otorga || !recibe) continue;

    filas.push({
      credito: texto(col(f, idx.iCredito)),
      otorga,
      recibe,
      fuente: texto(col(f, idx.iFuente)),
      fechaPacto: fechaISODeSerialExcel(col(f, idx.iFechaPacto)),
      valorDesembolsoMoneda: numero(col(f, idx.iValorMoneda)),
      moneda: texto(col(f, idx.iMoneda)),
      numDesembolsos: texto(col(f, idx.iNumDesembolsos)),
      fechaDesembolso: fechaISODeSerialExcel(col(f, idx.iFechaDesembolso)),
      valorCOPDesembolso: numero(col(f, idx.iValorCOP)),
      saldoCOP: numero(col(f, idx.iSaldoCOP)),
      interesesMoneda: numero(col(f, idx.iInteresesMoneda)),
      interesesCOP: numero(col(f, idx.iInteresesCOP)),
      plazo: texto(col(f, idx.iPlazo)),
      renovado: texto(col(f, idx.iRenovado)),
      cancelado: texto(col(f, idx.iCancelado)),
      tasaEA: texto(col(f, idx.iTasaEA)),
      tasaPactada: texto(col(f, idx.iTasaPactada)),
      periodicidad: texto(col(f, idx.iPeriodicidad)),
      esParaisoFiscal,
    });
  }

  return filas;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/services/excelPrestamosParser.test.js`
Expected: PASS (13 tests en total)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/excelPrestamosParser.js frontend/src/services/excelPrestamosParser.test.js
git commit -m "feat: parseHojaPrestamos arma las filas de prestamo con sus 18 columnas"
```

---

## Task 4: Enrutar la(s) hoja(s) de préstamo desde `excelOperationsParser.js`

**Files:**
- Modify: `frontend/src/services/excelOperationsParser.js`
- Modify: `frontend/src/services/excelOperationsParser.test.js`

**Interfaces:**
- Consumes: `parseHojaPrestamos` (Task 3)
- Produces: `parseExcelOperations(file)` ahora también devuelve `prestamos: Array | null` en
  su objeto de retorno (mismo criterio `null`-cuando-no-aplica que ya usa
  `operacionAdicional`).

Hoy `hojasAEscanear` (`excelOperationsParser.js:82-85`) barre cualquier hoja cuyo nombre
contenga `'VINC'` o `'PARAISO'` con el formato GENÉRICO de columnas. Como "Op. Prestamos
Vinculados Econom" contiene "Vinculados", hoy cae ahí por error. Hay que sacarla de ese
barrido y enrutarla a `parseHojaPrestamos`.

- [ ] **Step 1: Write the failing test**

Primero, dos pruebas EXISTENTES quedan mal desde que las hojas de préstamo se excluyen del
barrido genérico — sus nombres de hoja usaban "PRESTAMOS" solo de forma incidental, no para
probar el formato de préstamo. Corregirlas:

En `frontend/src/services/excelOperationsParser.test.js`, reemplazar el test completo
(actualmente en las líneas 121-132):

```js
test('una hoja de préstamos truncada a 31 caracteres ("...CON VINC") también se reconoce', async () => {
  /* El límite de 31 caracteres de Excel trunca "Operaciones Prestamos Con Vinculados" hasta
     dejar solo "VINC" del final, sin llegar a "VINCULADOS". */
  const wb = conEncabezadoEnHoja('OPERACIONES PRESTAMOS CON VINC', [
    ['ACME PRESTAMOS SAS', '900123456', 'MEXICO', '', 'INTERESES', '', '', '1007', '4001', '', 700000],
  ]);

  const res = await parseExcelOperations(workbookToFakeFile(wb));

  assert.strictEqual(res.vinc, 'ACME PRESTAMOS SAS');
  assert.strictEqual(res.monto, 700000);
});
```

por:

```js
test('una hoja truncada a 31 caracteres ("...CON VINC") también se reconoce', async () => {
  /* El límite de 31 caracteres de Excel trunca "Operaciones Economicas Con Vinculados" hasta
     dejar solo "VINC" del final, sin llegar a "VINCULADOS". (Antes esta prueba usaba un
     nombre de hoja con "PRESTAMOS" — desde que esas hojas se excluyen del barrido genérico y
     se leen con su propio formato (`excelPrestamosParser.js`), ese nombre ya no probaba lo
     que el título dice.) */
  const wb = conEncabezadoEnHoja('OPERACIONES ECONOMICAS CON VINC', [
    ['ACME ECONOMICA SAS', '900123456', 'MEXICO', '', 'INTERESES', '', '', '1007', '4001', '', 700000],
  ]);

  const res = await parseExcelOperations(workbookToFakeFile(wb));

  assert.strictEqual(res.vinc, 'ACME ECONOMICA SAS');
  assert.strictEqual(res.monto, 700000);
});
```

Y reemplazar, dentro del test `'el filtro por Cod se decide por hoja, no por el archivo
entero'` (líneas 177-199), la línea:

```js
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sinCod), 'Op. Prestamos Vinculados Econom');
```

por:

```js
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sinCod), 'Op. Paraisos Fiscales');
```

(mismo formato genérico de la prueba, solo cambia el nombre de la segunda hoja para no
depender de una coincidencia con "préstamos" que ya no aplica).

Ahora sí, agregar las pruebas nuevas al final del archivo (import de `parseHojaPrestamos` NO
hace falta aquí — se prueba a través de `parseExcelOperations`):

```js
test('una hoja de préstamos con formato genérico (no el propio de 18 columnas) no se lee como vinculados ni como préstamos', async () => {
  // Antes de este cambio, esta hoja se leía con el formato genérico por contener "Vinculados"
  // en el nombre. Ahora se enruta a parseHojaPrestamos, que no encuentra su fila de
  // encabezados ("crédito" + "razón social") en este formato y devuelve nada.
  const wb = conEncabezadoEnHoja('Op. Prestamos Vinculados Econom', [
    ['ACME PRESTAMOS SAS', '900123456', 'MEXICO', '', 'INTERESES', '', '', '1007', '4001', '', 700000],
  ]);

  const res = await parseExcelOperations(workbookToFakeFile(wb));

  assert.strictEqual(res.vinc, null, 'ya no debe leerse con el formato genérico de vinculados');
  assert.strictEqual(res.prestamos, null, 'el formato de esta hoja no es el de préstamos, así que tampoco hay filas de préstamo');
});

test('una hoja real de préstamos alimenta res.prestamos y no res.vinc/res.monto', async () => {
  const filas = [];
  for (let i = 0; i < 6; i++) filas.push(['']);
  filas.push([
    'Crédito', 'Razón Social de quien otorga el préstamo', 'Razón Social de quien recibe el préstamo',
    'Fuente de los recursos', 'Fecha original en la que se pactó', 'Valor del desembolso en la moneda pactada',
    'Moneda pactada', 'No. de desembolsos', 'Fecha de desembolso', 'Valor en COP en la fecha de desembolso',
    'Valor en COP del saldo al 31 de diciembre de 2025',
    'Monto de intereses causados o recibidos durante el FY 2025 (Moneda pactada)',
    'Monto de intereses causados o recibidos durante el FY 2025 (COP)', 'Plazo',
    'El préstamo fue renovado', 'El préstamo fue cancelado', 'Tasa de interés EFECTIVA ANUAL',
    'Tasa de interés pactada', 'Periodicidad',
  ]);
  filas.push([1, 'Inversiones San Jeronimo SpA', 'Autoland SAS', '', 44131, 3000000, 'USD', 1, 44131, 10431000000, 13227449999.999998, 138470, 579346941, 'No definido', '', '', '4,540% Efectivo Anual', '', '']);
  const wb = workbookConHoja('Op. Prestamos Vinculados Econom', filas);

  const res = await parseExcelOperations(workbookToFakeFile(wb));

  assert.strictEqual(res.prestamos.length, 1);
  assert.strictEqual(res.prestamos[0].otorga, 'Inversiones San Jeronimo SpA');
  assert.strictEqual(res.prestamos[0].fechaPacto, '2020-10-27');
  assert.strictEqual(res.prestamos[0].esParaisoFiscal, false);
  assert.strictEqual(res.vinc, null, 'los préstamos no alimentan el vinculado del formato genérico');
  assert.strictEqual(res.monto, null, 'los préstamos no alimentan el monto de operación del formato genérico');
});

test('una hoja "Op. Prestamos Paraisos Fiscales" marca esParaisoFiscal en sus filas', async () => {
  const filas = [];
  for (let i = 0; i < 6; i++) filas.push(['']);
  filas.push([
    'Crédito', 'Razón Social de quien otorga el préstamo', 'Razón Social de quien recibe el préstamo',
    'Fuente de los recursos', 'Fecha original en la que se pactó', 'Valor del desembolso en la moneda pactada',
    'Moneda pactada', 'No. de desembolsos', 'Fecha de desembolso', 'Valor en COP en la fecha de desembolso',
    'Valor en COP del saldo al 31 de diciembre de 2025',
    'Monto de intereses causados o recibidos durante el FY 2025 (Moneda pactada)',
    'Monto de intereses causados o recibidos durante el FY 2025 (COP)', 'Plazo',
    'El préstamo fue renovado', 'El préstamo fue cancelado', 'Tasa de interés EFECTIVA ANUAL',
    'Tasa de interés pactada', 'Periodicidad',
  ]);
  filas.push([1, 'Offshore Holdings Ltd', 'Autoland SAS', '', 44131, 1000000, 'USD', 1, 44131, 3477000000, 3477000000, 10000, 34770000, 'No definido', '', '', '5,000% Efectivo Anual', '', '']);
  const wb = workbookConHoja('Op. Prestamos Paraisos Fiscales', filas);

  const res = await parseExcelOperations(workbookToFakeFile(wb));

  assert.strictEqual(res.prestamos.length, 1);
  assert.strictEqual(res.prestamos[0].esParaisoFiscal, true);
});

test('sin ninguna hoja de préstamos, res.prestamos es null', async () => {
  const wb = workbookConHoja('Hoja1', [['nada aquí']]);
  const res = await parseExcelOperations(workbookToFakeFile(wb));
  assert.strictEqual(res.prestamos, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/services/excelOperationsParser.test.js`
Expected: FAIL — `res.prestamos` es `undefined` (el campo no existe todavía en el objeto de
retorno), y la prueba de regresión de la hoja con formato genérico también falla porque hoy
esa hoja SÍ se lee como vinculados.

- [ ] **Step 3: Write minimal implementation**

En `excelOperationsParser.js`, agregar el import al inicio del archivo:

```js
import { parseHojaPrestamos } from './excelPrestamosParser.js';
```

Reemplazar el bloque de `hojasAEscanear` (líneas 82-85):

```js
    const hojasAEscanear = (wb.SheetNames || []).filter((nombre) => {
      const n = normalizarNombreHoja(nombre);
      return n.includes('VINC') || n.includes('PARAISO');
    });
```

por:

```js
    // Las hojas de préstamo ("Op. Prestamos Vinculados Econom", "Op. Prestamos Paraisos
    // Fiscales") contienen "Vinculados"/"Paraisos" en el nombre y por eso caían en este
    // barrido genérico, leyéndose con el formato de columnas equivocado. Se excluyen aquí y
    // se leen aparte, más abajo, con `parseHojaPrestamos`.
    const esHojaDePrestamos = (nombre) => normalizarNombreHoja(nombre).includes('PREST');
    const hojasAEscanear = (wb.SheetNames || []).filter((nombre) => {
      const n = normalizarNombreHoja(nombre);
      return (n.includes('VINC') || n.includes('PARAISO')) && !esHojaDePrestamos(nombre);
    });
    const hojasPrestamos = (wb.SheetNames || []).filter(esHojaDePrestamos);
```

Después del `hojasAEscanear.forEach(...)` (que termina en la línea, antes del cambio,
`285` con `});`), agregar el barrido de las hojas de préstamo:

```js
    // Las hojas de préstamo se leen aparte: su formato (18 columnas propias) no tiene nada
    // en común con el genérico de vinculados/paraísos fiscales de arriba.
    const filasPrestamos = [];
    hojasPrestamos.forEach(nombreHoja => {
      const sh = wb.Sheets[nombreHoja];
      if (!sh) return;
      const d = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
      const esParaisoFiscal = normalizarNombreHoja(nombreHoja).includes('PARAISO');
      filasPrestamos.push(...parseHojaPrestamos(d, { esParaisoFiscal }));
    });
```

Y en el objeto que devuelve `parseExcelOperations` (cerca de la línea 373, junto a
`operacionAdicional`), agregar el campo:

```js
      // `null` y no un arreglo vacío cuando ninguna hoja de préstamo trajo filas válidas:
      // mismo criterio que `operacionAdicional`, para distinguir "no hay hoja de préstamos"
      // de "la hoja existe pero está vacía".
      prestamos: filasPrestamos.length ? filasPrestamos : null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/services/excelOperationsParser.test.js`
Expected: PASS (todas las pruebas del archivo, incluidas las nuevas y las dos corregidas)

- [ ] **Step 5: Run the full suite to confirm no regressions elsewhere**

Run: `node --test "scripts/lib"/*.test.js "frontend/src/services"/*.test.js "frontend/src/utils"/*.test.js "functions"/*.test.js`
Expected: PASS, 0 fallos (más de 2840 pruebas)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/excelOperationsParser.js frontend/src/services/excelOperationsParser.test.js
git commit -m "fix: las hojas de prestamo ya no se leen con el formato generico de vinculados"
```

---

## Task 5: Guardar y mostrar los préstamos en `IngestaOperaciones.jsx`

**Files:**
- Modify: `frontend/src/components/IngestaOperaciones.jsx`

**Interfaces:**
- Consumes: `res.prestamos` de `parseExcelOperations` (Task 4); `study.tipo_estudio`,
  `study.prestamos`, `updateStudy` (props existentes del componente)

No hay ningún test unitario de UI en este proyecto para componentes React (confirmado: la
suite de `npm test` no incluye `frontend/src/components/`); la verificación de esta tarea es
manual, con el archivo Excel de referencia, en el paso 4 de este task.

- [ ] **Step 1: Guardar `prestamos` en el estudio, condicionado al tipo de estudio**

En `frontend/src/components/IngestaOperaciones.jsx`, dentro de `handleExcelUpload`,
reemplazar el `updateStudy({...})` (líneas 25-34):

```jsx
        updateStudy({
          vinc: res.vinc,
          vinc_id: res.vinc_id,
          pais_vinc: res.pais_vinc,
          vinc_tipo: res.vinc_tipo,
          monto: valMonto,
          monto_operacion: valMonto,
          egreso: res.egreso || false,
          operacionAdicional: res.operacionAdicional || null,
        });
```

por:

```jsx
        updateStudy({
          vinc: res.vinc,
          vinc_id: res.vinc_id,
          pais_vinc: res.pais_vinc,
          vinc_tipo: res.vinc_tipo,
          monto: valMonto,
          monto_operacion: valMonto,
          egreso: res.egreso || false,
          operacionAdicional: res.operacionAdicional || null,
          /* Solo para estudios de tipo préstamo: el parser lee la hoja de préstamos sin
             importar el tipo de estudio, pero guardarla siempre expondría datos de
             préstamo en un estudio estándar que nunca los va a usar. `res.prestamos || null`
             y no condicionar el spread entero: así un Excel nuevo sin la hoja borra los
             préstamos de una carga anterior, igual que ya hace `operacionAdicional`. */
          ...(study.tipo_estudio === 'prestamo' ? { prestamos: res.prestamos || null } : {}),
        });
```

- [ ] **Step 2: Aviso de resultado para estudios de préstamo**

En el mismo archivo, dentro del mismo `try`, después del bloque de aviso de
`operacionAdicional` (que termina en la línea, antes del cambio, `97` con `}`) y antes de
`const aviso = avisos.length ? ...` (línea 98), agregar:

```jsx
        /* Aviso propio de estudios de préstamo: el parser ya leyó la hoja (o no la
           encontró) sin importar el tipo de estudio; aquí es donde se le dice al analista
           qué significa eso para SU estudio. */
        if (study.tipo_estudio === 'prestamo') {
          if (res.prestamos && res.prestamos.length) {
            avisos.push(
              `ℹ se detectaron ${res.prestamos.length} ${res.prestamos.length === 1 ? 'operación' : 'operaciones'} ` +
              `de préstamo con ${res.prestamos[0].otorga || res.prestamos[0].recibe || 'el vinculado'}`
            );
          } else {
            avisos.push(
              '⚠ no se encontró la hoja de préstamos en este Excel (se esperaba un nombre que ' +
              'contenga «préstamo»): verifique el archivo o ingrese los datos manualmente'
            );
          }
        }
```

- [ ] **Step 3: Tarjeta de resumen de préstamos**

En el mismo archivo, después del bloque de la tarjeta "Operación Adicional Detectada"
(termina en la línea, antes del cambio, `310` con `)}`) y antes del cierre del `return`
(`</div>` + `);` finales), agregar:

```jsx
      {/* Resumen de préstamos con vinculados — solo para estudios de tipo préstamo. Muestra
          las 5 columnas que alimentan la Tabla "Préstamo con su vinculado" del informe
          (fase futura, ver docs/superpowers/specs/2026-09-24-estudios-prestamo-design.md);
          el resto de columnas que trae la hoja (saldo, intereses, plazo...) ya quedaron
          guardadas en el estudio para cuando esa fase se construya, pero no hace falta
          mostrarlas aquí todavía. */}
      {study.tipo_estudio === 'prestamo' && study.prestamos && (
        <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="text-md font-bold text-zinc-900 dark:text-zinc-50 border-b border-zinc-100 dark:border-zinc-800 pb-2">
            Operaciones de Préstamo Detectadas
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-500 uppercase tracking-wider text-left">
                  <th className="py-2 pr-4 font-semibold">Fecha original en la que se pactó</th>
                  <th className="py-2 pr-4 font-semibold text-right">Valor del desembolso</th>
                  <th className="py-2 pr-4 font-semibold">Moneda pactada</th>
                  <th className="py-2 pr-4 font-semibold text-right">Valor en COP en la fecha de desembolso</th>
                  <th className="py-2 font-semibold text-right">Tasa EA</th>
                </tr>
              </thead>
              <tbody>
                {study.prestamos.map((p, i) => (
                  <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                    {/* Se reconstruye el Date a mediodía local y no a medianoche UTC: un
                        string ISO de solo fecha ("2020-10-27") se interpreta como medianoche
                        UTC, y en Colombia (UTC-5) eso muestra el día anterior. */}
                    <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-100">
                      {p.fechaPacto ? new Date(p.fechaPacto + 'T12:00:00').toLocaleDateString('es-CO') : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-zinc-900 dark:text-zinc-100">{fmt(p.valorDesembolsoMoneda)}</td>
                    <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{p.moneda || '—'}</td>
                    <td className="py-2 pr-4 text-right font-mono text-zinc-900 dark:text-zinc-100">{fmt(p.valorCOPDesembolso)}</td>
                    <td className="py-2 text-right font-mono text-zinc-900 dark:text-zinc-100">{p.tasaEA || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verificación manual**

Run: `npm run build --prefix frontend` (debe compilar sin errores)
Run: `npm run lint --prefix frontend` (no debe agregar advertencias nuevas en los archivos
tocados: `IngestaOperaciones.jsx`, `excelOperationsParser.js`, `excelPrestamosParser.js`)

Con `npm run dev --prefix frontend`:
1. Crear un estudio con `tipo_estudio = 'prestamo'` (selector en el paso 1, "Datos del
   Contribuyente").
2. En el paso 2 ("Ingesta de Operaciones"), subir el Excel real de referencia (o una copia
   sintética con la misma hoja `Op. Prestamos Vinculados Econom` y sus 4 filas de
   desembolso).
3. Confirmar que aparece la tarjeta "Operaciones de Préstamo Detectadas" con las 4 filas,
   fechas 27/10/2020, 07/07/2022, 24/10/2022 y 9/03/2023, montos 3.000.000 / 2.000.000 /
   1.300.000 / 4.300.000 y tasas 4,540% / 6,000% / 6,000% / 6,000%.
4. Crear otro estudio con `tipo_estudio = 'estandar'`, subir el MISMO Excel, y confirmar que
   la tarjeta de préstamos NO aparece (aunque el parser haya leído la hoja igual).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/IngestaOperaciones.jsx
git commit -m "feat: guardar y mostrar los prestamos detectados en estudios tipo prestamo"
```

---

## Verificación final de todo el plan

1. `node --test "scripts/lib"/*.test.js "frontend/src/services"/*.test.js "frontend/src/utils"/*.test.js "functions"/*.test.js` — en verde.
2. `npm run lint --prefix frontend` — sin advertencias nuevas en los archivos tocados.
3. `npm run build --prefix frontend` — compila sin errores.
4. Verificación manual del Step 4 de la Task 5.
