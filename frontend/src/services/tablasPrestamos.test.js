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
