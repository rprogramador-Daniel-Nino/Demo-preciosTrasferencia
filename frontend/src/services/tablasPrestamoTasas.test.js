import { test } from 'node:test';
import assert from 'node:assert';
import {
  fechasPactoUnicas, filasTablaRangoIntercuartil, filasTablaTasasSeleccionadas,
  filasTablaAnalisisTasasAjustadas, NOMBRE_TABLA_RANGO_INTERCUARTIL_PRESTAMO,
  NOMBRE_TABLA_TASAS_SELECCIONADAS, NOMBRE_TABLA_ANALISIS_TASAS_AJUSTADAS,
} from './tablasPrestamoTasas.js';

/* Mismos cuatro préstamos de Autoland 2025 que usan tablasPrestamos.test.js y
   tablasPrestamoColumnas.test.js — solo la primera fecha (27/10/2020) trae tasas, para
   poder comparar contra el documento real sin repetir las cuatro fechas. */
const PRESTAMOS_AUTOLAND = [
  {
    otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS',
    fechaPacto: '2020-10-27', valorDesembolsoMoneda: 3000000, moneda: 'USD',
    valorCOPDesembolso: 10431000000, tasaEA: '4,540% E.A.',
  },
  {
    otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS',
    fechaPacto: '2022-07-07', valorDesembolsoMoneda: 2000000, moneda: 'USD',
    valorCOPDesembolso: 8822000000, tasaEA: '6,000% E.A.',
  },
];

const ESTUDIO_PRESTAMO = {
  ent: 'Autoland SAS', anio: 2025, tipo_estudio: 'prestamo', prestamos: PRESTAMOS_AUTOLAND,
  vinc: 'Inversiones San Jeronimo SpA',
};

const TASAS_PRESTAMO_27_10_2020 = {
  riesgoPais: { valor: 2.845 },
  porFecha: {
    '2020-10-27': {
      prime: { valor: 3.250 }, tmc: { valor: 1.750 }, sofr: { valor: 0.090 },
      moodys: { valor: 1.560 },
    },
  },
};

/* ══════ fechasPactoUnicas ══════ */

test('fechasPactoUnicas: una por fecha, sin repetir, en orden de aparición', () => {
  const conFechaRepetida = {
    ...ESTUDIO_PRESTAMO,
    prestamos: [...PRESTAMOS_AUTOLAND, { ...PRESTAMOS_AUTOLAND[0], otorga: 'Otro' }],
  };
  assert.deepStrictEqual(fechasPactoUnicas(conFechaRepetida), ['2020-10-27', '2022-07-07']);
});

test('fechasPactoUnicas: vacío si el estudio no tiene préstamos', () => {
  assert.deepStrictEqual(fechasPactoUnicas({ ...ESTUDIO_PRESTAMO, tipo_estudio: 'estandar' }), []);
  assert.deepStrictEqual(fechasPactoUnicas(null), []);
});

/* ══════ filasTablaRangoIntercuartil (Tabla 6/20) ══════ */

test('filasTablaRangoIntercuartil: null cuando el estudio no es de tipo préstamo', () => {
  assert.strictEqual(filasTablaRangoIntercuartil({ ...ESTUDIO_PRESTAMO, tipo_estudio: 'estandar' }, null), null);
});

test('filasTablaRangoIntercuartil: una fila por préstamo, con el nombre de tabla correcto', () => {
  const t = filasTablaRangoIntercuartil(ESTUDIO_PRESTAMO, TASAS_PRESTAMO_27_10_2020);
  assert.strictEqual(t.nombre, NOMBRE_TABLA_RANGO_INTERCUARTIL_PRESTAMO);
  assert.strictEqual(t.filas.length, 2);
});

test('filasTablaRangoIntercuartil: reproduce el rango exacto del documento real (27/10/2020)', () => {
  const t = filasTablaRangoIntercuartil(ESTUDIO_PRESTAMO, TASAS_PRESTAMO_27_10_2020);
  const fila = t.filas[0];
  assert.strictEqual(fila.vinculado, 'Inversiones San Jeronimo SpA');
  assert.strictEqual(fila.fechaPacto, '27/10/2020');
  assert.strictEqual(fila.valorDesembolsoMoneda, '3.000.000');
  assert.strictEqual(fila.tasaEA, '4,540% E.A.');
  assert.ok(Math.abs(fila.rango.minimo - 5.411) < 0.001, `minimo: ${fila.rango.minimo}`);
  assert.ok(Math.abs(fila.rango.mediana - 6.278) < 0.001, `mediana: ${fila.rango.mediana}`);
  assert.ok(Math.abs(fila.rango.superior - 7.061) < 0.001, `superior: ${fila.rango.superior}`);
});

test('filasTablaRangoIntercuartil: sin tasas capturadas para esa fecha, el rango sale null', () => {
  const t = filasTablaRangoIntercuartil(ESTUDIO_PRESTAMO, null);
  assert.strictEqual(t.filas[0].rango, null);
});

/* ══════ filasTablaTasasSeleccionadas (Tabla 18) ══════ */

test('filasTablaTasasSeleccionadas: null cuando el estudio no es de tipo préstamo', () => {
  assert.strictEqual(filasTablaTasasSeleccionadas({ ...ESTUDIO_PRESTAMO, tipo_estudio: 'estandar' }), null);
});

test('filasTablaTasasSeleccionadas: banner con el nombre del contribuyente y las 3 tasas', () => {
  const t = filasTablaTasasSeleccionadas(ESTUDIO_PRESTAMO);
  assert.strictEqual(t.nombre, NOMBRE_TABLA_TASAS_SELECCIONADAS);
  assert.match(t.banner, /AUTOLAND SAS/);
  assert.strictEqual(t.filas.length, 3);
  assert.ok(t.filas.every((f) => f.conclusion === 'Aceptado'));
  assert.ok(t.filas.some((f) => /PRIME/.test(f.tasa)));
  assert.ok(t.filas.some((f) => /SOFR/.test(f.tasa)));
  assert.ok(t.filas.some((f) => /TMC|Monetaria/.test(f.tasa)));
});

/* ══════ filasTablaAnalisisTasasAjustadas (Tabla 19) ══════ */

test('filasTablaAnalisisTasasAjustadas: null cuando el estudio no es de tipo préstamo', () => {
  assert.strictEqual(filasTablaAnalisisTasasAjustadas({ ...ESTUDIO_PRESTAMO, tipo_estudio: 'estandar' }, null), null);
});

test('filasTablaAnalisisTasasAjustadas: 3 filas (PRIME/TMC/SOFR) para la fecha con tasas', () => {
  const t = filasTablaAnalisisTasasAjustadas(
    { ...ESTUDIO_PRESTAMO, prestamos: [PRESTAMOS_AUTOLAND[0]] },
    TASAS_PRESTAMO_27_10_2020,
  );
  assert.strictEqual(t.nombre, NOMBRE_TABLA_ANALISIS_TASAS_AJUSTADAS);
  assert.strictEqual(t.filas.length, 3);
  const prime = t.filas.find((f) => f.tasa === 'PRIME');
  assert.strictEqual(prime.fechaPacto, '2020-10-27');
  assert.strictEqual(prime.porcentajeTasa, 3.250);
  assert.strictEqual(prime.moodys, 1.560);
  assert.strictEqual(prime.riesgoPais, 2.845);
  assert.ok(Math.abs(prime.total - 7.844) < 0.001);
});

test('filasTablaAnalisisTasasAjustadas: dos préstamos con la misma fecha de pacto no duplican sus 3 filas', () => {
  const dosEnLaMismaFecha = {
    ...ESTUDIO_PRESTAMO,
    prestamos: [PRESTAMOS_AUTOLAND[0], { ...PRESTAMOS_AUTOLAND[0], otorga: 'Otro Vinculado' }],
  };
  const t = filasTablaAnalisisTasasAjustadas(dosEnLaMismaFecha, TASAS_PRESTAMO_27_10_2020);
  assert.strictEqual(t.filas.length, 3, 'una sola fecha de pacto -> 3 filas, no 6');
});

test('filasTablaAnalisisTasasAjustadas: omite SOFR (no 3 filas) si la fecha es anterior a abril de 2018', () => {
  const estudioViejo = {
    ...ESTUDIO_PRESTAMO,
    prestamos: [{ ...PRESTAMOS_AUTOLAND[0], fechaPacto: '2015-01-15' }],
  };
  const tasas = {
    riesgoPais: { valor: 2.845 },
    porFecha: { '2015-01-15': { prime: { valor: 3 }, tmc: { valor: 2 }, moodys: { valor: 1 } } },
  };
  const t = filasTablaAnalisisTasasAjustadas(estudioViejo, tasas);
  assert.strictEqual(t.filas.length, 2, 'solo PRIME y TMC; SOFR no existía en esa fecha');
  assert.ok(!t.filas.some((f) => f.tasa === 'SOFR'));
});
