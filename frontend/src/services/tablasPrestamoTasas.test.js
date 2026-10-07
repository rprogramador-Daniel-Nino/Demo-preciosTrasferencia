import { test } from 'node:test';
import assert from 'node:assert';
import {
  fechasPactoUnicas, filasTablaRangoIntercuartil, filasTablaTasasSeleccionadas,
  filasTablaAnalisisTasasAjustadas, conclusionRangoIntercuartilPrestamo,
  NOMBRE_TABLA_RANGO_INTERCUARTIL_PRESTAMO,
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

/* ══════ conclusionRangoIntercuartilPrestamo ══════
   Verificado contra la "Conclusión" del documento real (Autoland 2025): tasa pactada por
   debajo del rango, operación de egreso -> redacción favorable, sin ajuste. El caso
   desfavorable (fuera de rango del lado que sí erosiona base) NO se redacta solo: el
   sistema nunca inventa una conclusión tributaria, declara que hace falta revisión manual
   (mismo criterio que SOFR no disponible o groundingChunks vacío en otras partes del
   sistema). */

const ESTUDIO_UN_PRESTAMO = {
  ent: 'Autoland SAS', vinc: 'Inversiones San Jeronimo SpA', anio: 2025,
  tipo_estudio: 'prestamo',
  prestamos: [{ fechaPacto: '2020-10-27', tasaEA: '4,500% E.A.' }],
};
const TASAS_UNA_FECHA = {
  riesgoPais: { valor: 2.845 },
  porFecha: {
    '2020-10-27': {
      prime: { valor: 3.250 }, tmc: { valor: 1.750 }, sofr: { valor: 0.090 },
      moodys: { valor: 1.560 },
    },
  },
};

test('conclusión: tasa pactada por debajo del rango en un egreso es favorable y nombra al vinculado', () => {
  const c = conclusionRangoIntercuartilPrestamo(ESTUDIO_UN_PRESTAMO, TASAS_UNA_FECHA);
  assert.strictEqual(c.posicion, 'debajo');
  assert.strictEqual(c.requiereAjuste, false);
  assert.strictEqual(c.parrafos.length, 3);
  assert.ok(c.parrafos[0].includes('Autoland SAS'));
  assert.ok(c.parrafos[0].includes('Inversiones San Jeronimo SpA'));
  assert.ok(c.parrafos[0].includes('por debajo del rango intercuartil'));
  assert.ok(c.parrafos[2].includes('2025'));
  assert.ok(c.parrafos[2].includes('deducción'));
});

test('conclusión: tasa pactada dentro del rango es favorable para egreso o ingreso', () => {
  const estudio = {
    ...ESTUDIO_UN_PRESTAMO,
    prestamos: [{ fechaPacto: '2020-10-27', tasaEA: '6,500% E.A.' }], // entre 5,411% y 7,061%
  };
  const c = conclusionRangoIntercuartilPrestamo(estudio, TASAS_UNA_FECHA);
  assert.strictEqual(c.posicion, 'dentro');
  assert.strictEqual(c.requiereAjuste, false);
  assert.ok(c.parrafos[0].includes('dentro del rango intercuartil'));
});

test('conclusión: egreso con tasa pactada por encima del rango exige revisión, no se inventa redacción', () => {
  const estudio = {
    ...ESTUDIO_UN_PRESTAMO,
    prestamos: [{ fechaPacto: '2020-10-27', tasaEA: '50% E.A.' }],
  };
  const c = conclusionRangoIntercuartilPrestamo(estudio, TASAS_UNA_FECHA);
  assert.strictEqual(c.posicion, 'encima');
  assert.strictEqual(c.requiereAjuste, true);
  assert.strictEqual(c.parrafos, null);
});

test('conclusión: ingreso (estudio.egreso === false) invierte qué posición es favorable', () => {
  const estudioIngreso = {
    ...ESTUDIO_UN_PRESTAMO,
    egreso: false,
    prestamos: [{ fechaPacto: '2020-10-27', tasaEA: '50% E.A.' }],
  };
  const c = conclusionRangoIntercuartilPrestamo(estudioIngreso, TASAS_UNA_FECHA);
  assert.strictEqual(c.posicion, 'encima');
  assert.strictEqual(c.requiereAjuste, false, 'por encima del rango favorece a un ingreso');
  assert.ok(c.parrafos[2].includes('ingreso'));

  const debajoDesfavorable = conclusionRangoIntercuartilPrestamo({
    ...ESTUDIO_UN_PRESTAMO, egreso: false,
  }, TASAS_UNA_FECHA);
  assert.strictEqual(debajoDesfavorable.requiereAjuste, true, 'por debajo del rango erosiona un ingreso');
});

test('conclusión: nula cuando los préstamos quedan con posiciones mixtas entre sí', () => {
  const estudio = {
    ent: 'Autoland SAS', vinc: 'Inversiones San Jeronimo SpA', anio: 2025,
    prestamos: [
      { fechaPacto: '2020-10-27', tasaEA: '4,500% E.A.' }, // debajo
      { fechaPacto: '2022-07-07', tasaEA: '50% E.A.' }, // encima
    ],
  };
  const tasas = {
    riesgoPais: { valor: 2.845 },
    porFecha: {
      '2020-10-27': {
        prime: { valor: 3.250 }, tmc: { valor: 1.750 }, sofr: { valor: 0.090 }, moodys: { valor: 1.560 },
      },
      '2022-07-07': {
        prime: { valor: 4.750 }, tmc: { valor: 7.500 }, sofr: { valor: 1.540 }, moodys: { valor: 1.190 },
      },
    },
  };
  assert.strictEqual(conclusionRangoIntercuartilPrestamo(estudio, tasas), null);
});

test('conclusión: nula cuando falta alguna tasa para calcular el rango de un préstamo', () => {
  assert.strictEqual(conclusionRangoIntercuartilPrestamo(ESTUDIO_UN_PRESTAMO, { riesgoPais: {}, porFecha: {} }), null);
});

test('conclusión: nula cuando no hay E.A. legible para comparar contra el rango', () => {
  const estudio = { ...ESTUDIO_UN_PRESTAMO, prestamos: [{ fechaPacto: '2020-10-27', tasaEA: '' }] };
  assert.strictEqual(conclusionRangoIntercuartilPrestamo(estudio, TASAS_UNA_FECHA), null);
});
