import { test } from 'node:test';
import assert from 'node:assert';
import {
  NOMBRES_TABLA_PRESTAMO, tienePrestamos, filasPrestamoConVinculado, filasVinculadoEconomicoPrestamo,
} from './tablasPrestamos.js';

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

test('filasPrestamoConVinculado muestra "—" para fecha o montos ausentes, salvo el Valor en COP real', () => {
  /* El Valor en COP sí tiene que ser real (ver el bloque de arriba): con él presente, los
     demás campos ausentes siguen mostrando "—" como siempre. */
  const estudio = {
    tipo_estudio: 'prestamo', ent: 'Autoland SAS',
    prestamos: [{ otorga: 'Vinc SAS', recibe: 'Autoland SAS', fechaPacto: null, valorDesembolsoMoneda: null, moneda: '', valorCOPDesembolso: 500000, tasaEA: '' }],
  };
  const t = filasPrestamoConVinculado(estudio);
  assert.deepStrictEqual(t.filas[0], ['—', '—', '—', '500.000', '—']);
});

/* ══════ Tabla 11. Vinculado económica — mismo criterio otorga/recibe que la Tabla 1,
   nunca `estudio.vinc` ══════

   Reportado el 2026-10-09: un estudio de préstamo real mostraba "BRUNO FRITSCH SA" como
   vinculado en la Tabla 11, el nombre de OTRO cliente — porque nada en el sistema rellenaba
   esa tabla para préstamo y se quedaba con lo que trajera la plantilla reutilizada de otro
   informe. El vinculado correcto (el prestamista, "Inversiones San Jeronimo SpA" en este
   caso) ya se identifica bien en la Tabla 1 comparando otorga/recibe contra `estudio.ent`:
   esta tabla usa la MISMA identificación, no un campo aparte que puede quedar desactualizado. */

test('filasVinculadoEconomicoPrestamo identifica al vinculado igual que la Tabla 1 (quien NO es el contribuyente)', () => {
  const estudio = {
    tipo_estudio: 'prestamo', ent: 'Autoland SAS', pais_vinc: 'Chile', vinc_id: '76.421.180-4',
    prestamos: [PRESTAMOS_AUTOLAND[0]],
  };
  const t = filasVinculadoEconomicoPrestamo(estudio);
  assert.strictEqual(t.nombre, 'Vinculado económica');
  assert.deepStrictEqual(t.encabezados, ['Nombre Vinculada', 'País', 'Identificación Fiscal']);
  assert.deepStrictEqual(t.filas, [['Inversiones San Jeronimo SpA', 'Chile', '76.421.180-4']]);
});

test('filasVinculadoEconomicoPrestamo identifica al vinculado cuando el contribuyente OTORGA el préstamo', () => {
  const estudio = {
    tipo_estudio: 'prestamo', ent: 'Inversiones San Jeronimo SpA',
    prestamos: [PRESTAMOS_AUTOLAND[0]],
  };
  const t = filasVinculadoEconomicoPrestamo(estudio);
  assert.strictEqual(t.filas[0][0], 'Autoland SAS');
});

test('filasVinculadoEconomicoPrestamo sin país ni identificación muestra "—"', () => {
  const estudio = { tipo_estudio: 'prestamo', ent: 'Autoland SAS', prestamos: [PRESTAMOS_AUTOLAND[0]] };
  const t = filasVinculadoEconomicoPrestamo(estudio);
  assert.deepStrictEqual(t.filas[0], ['Inversiones San Jeronimo SpA', '—', '—']);
});

test('filasVinculadoEconomicoPrestamo: null sin estudio.prestamos', () => {
  assert.strictEqual(filasVinculadoEconomicoPrestamo({ tipo_estudio: 'prestamo' }), null);
});

/* ── Tabla 1. Préstamo con su vinculado: sin Valor en COP, no se indexa ──
   Pedido el 2026-10-10: un abono a capital o un movimiento sin desembolso real llega del
   Excel con `valorCOPDesembolso` en 0 o ausente (visto en un informe real: dos filas con
   monto negativo y "0" de COP). Esa fila no es un préstamo nuevo que declarar en la Tabla
   1, así que no debe aparecer ahí —ni como fila con guiones—, aunque sí siga existiendo en
   `estudio.prestamos` para lo que otras tablas necesiten de ella. */

test('filasPrestamoConVinculado excluye los préstamos sin Valor en COP en la fecha de desembolso', () => {
  const estudio = {
    tipo_estudio: 'prestamo', ent: 'Autoland SAS',
    prestamos: [
      PRESTAMOS_AUTOLAND[0],
      { ...PRESTAMOS_AUTOLAND[1], valorCOPDesembolso: 0 },
      { ...PRESTAMOS_AUTOLAND[2], valorCOPDesembolso: null },
      { ...PRESTAMOS_AUTOLAND[3], valorCOPDesembolso: undefined },
    ],
  };
  const t = filasPrestamoConVinculado(estudio);
  assert.strictEqual(t.filas.length, 1, 'solo el préstamo con un Valor en COP real queda en la tabla');
  assert.strictEqual(t.filas[0][3], '10.431.000.000');
});

test('filasPrestamoConVinculado: null si NINGÚN préstamo trae Valor en COP (nada que indexar)', () => {
  const estudio = {
    tipo_estudio: 'prestamo', ent: 'Autoland SAS',
    prestamos: [{ ...PRESTAMOS_AUTOLAND[0], valorCOPDesembolso: 0 }],
  };
  assert.strictEqual(filasPrestamoConVinculado(estudio), null);
});
