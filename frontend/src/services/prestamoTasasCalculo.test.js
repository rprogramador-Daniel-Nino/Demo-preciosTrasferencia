import { test } from 'node:test';
import assert from 'node:assert';
import {
  FECHA_INICIO_SOFR, serieDisponible, tasaAjustada, totalesPorFecha, rangoIntercuartil,
  TRIOS_POR_DIRECCION, trioDeDireccion, aplicaRiesgoPais,
  numeroDesdeTexto, parsearIndiceSpread, tasaEfectivaDeFila,
} from './prestamoTasasCalculo.js';

/* Las cifras de estas pruebas vienen del informe real de Autoland 2025 (Tabla 19/20 del
   documento de referencia), para la fecha de pacto 27/10/2020: PRIME 3,250 %, TASA MONETARIA
   COLOM (TMC) 1,750 %, SOFR 0,090 %, Moody's Seasoned 1,560 %, Country Risk Premium (Colombia
   2025) 2,845 %. Los "TOTAL" que trae el documento (7,844 % / 6,278 % / 4,544 %) reproducen
   la fórmula de composición geométrica casi exactos (la diferencia de milésimas es redondeo
   intermedio del propio documento), así que sirven de fixture real, no inventado. */
const PRIME_PCT = 3.250;
const TMC_PCT = 1.750;
const SOFR_PCT = 0.090;
const MOODYS_PCT = 1.560;
const RIESGO_PAIS_PCT = 2.845;

const cerca = (actual, esperado, tolerancia = 0.001) => Math.abs(actual - esperado) < tolerancia;

test('tasaAjustada: compone geométricamente, no suma — PRIME 27/10/2020 da 7,844 %', () => {
  const total = tasaAjustada(PRIME_PCT, MOODYS_PCT, RIESGO_PAIS_PCT);
  assert.ok(cerca(total, 7.844), `esperaba ~7.844, dio ${total}`);
  // La suma simple (3.250+1.560+2.845=7.655) es un valor distinto: confirma que de verdad
  // compone (1+r)(1+m)(1+p)-1 y no una resta de atajo hacia la adición.
  assert.ok(!cerca(total, 7.655, 0.001));
});

test('tasaAjustada: TMC 27/10/2020 da 6,278 %', () => {
  const total = tasaAjustada(TMC_PCT, MOODYS_PCT, RIESGO_PAIS_PCT);
  assert.ok(cerca(total, 6.278), `esperaba ~6.278, dio ${total}`);
});

test('tasaAjustada: SOFR 27/10/2020 da 4,544 %', () => {
  const total = tasaAjustada(SOFR_PCT, MOODYS_PCT, RIESGO_PAIS_PCT);
  assert.ok(cerca(total, 4.544), `esperaba ~4.544, dio ${total}`);
});

test('tasaAjustada: null si falta cualquiera de las tres tasas', () => {
  assert.strictEqual(tasaAjustada(null, MOODYS_PCT, RIESGO_PAIS_PCT), null);
  assert.strictEqual(tasaAjustada(PRIME_PCT, undefined, RIESGO_PAIS_PCT), null);
  assert.strictEqual(tasaAjustada(PRIME_PCT, MOODYS_PCT, NaN), null);
});

test('totalesPorFecha: arma los tres totales a partir de las tasas crudas de una fecha', () => {
  const tasasFecha = {
    prime: { valor: PRIME_PCT }, tmc: { valor: TMC_PCT }, sofr: { valor: SOFR_PCT },
    moodys: { valor: MOODYS_PCT },
  };
  const totales = totalesPorFecha(tasasFecha, RIESGO_PAIS_PCT);
  assert.ok(cerca(totales.prime, 7.844));
  assert.ok(cerca(totales.tmc, 6.278));
  assert.ok(cerca(totales.sofr, 4.544));
});

test('totalesPorFecha: sofr queda null si no vino (fecha anterior a abril de 2018, o sin dato)', () => {
  const tasasFecha = {
    prime: { valor: PRIME_PCT }, tmc: { valor: TMC_PCT }, moodys: { valor: MOODYS_PCT },
  };
  const totales = totalesPorFecha(tasasFecha, RIESGO_PAIS_PCT);
  assert.strictEqual(totales.sofr, null);
  assert.ok(cerca(totales.prime, 7.844));
});

test('rangoIntercuartil: con los tres totales reales de Autoland da P25/mediana/P75 exactos', () => {
  // Totales reales del documento (Tabla 19, 27/10/2020): PRIME 7,844 / TMC 6,278 / SOFR 4,544.
  const r = rangoIntercuartil({ prime: 7.844, tmc: 6.278, sofr: 4.544 });
  assert.strictEqual(r.n, 3);
  assert.ok(cerca(r.minimo, 5.411, 1e-6), `minimo: ${r.minimo}`);
  assert.ok(cerca(r.mediana, 6.278, 1e-6), `mediana: ${r.mediana}`);
  assert.ok(cerca(r.superior, 7.061, 1e-6), `superior: ${r.superior}`);
});

test('rangoIntercuartil: con solo dos totales (sofr ausente) sigue calculando, n=2', () => {
  const r = rangoIntercuartil({ prime: 7.844, tmc: 6.278, sofr: null });
  assert.strictEqual(r.n, 2);
  assert.ok(r.minimo <= r.mediana && r.mediana <= r.superior);
});

test('rangoIntercuartil: con un solo total, los tres valores son ese mismo, n=1', () => {
  const r = rangoIntercuartil({ prime: 7.844 });
  assert.strictEqual(r.n, 1);
  assert.strictEqual(r.minimo, 7.844);
  assert.strictEqual(r.mediana, 7.844);
  assert.strictEqual(r.superior, 7.844);
});

test('rangoIntercuartil: null si no hay ningún total válido', () => {
  assert.strictEqual(rangoIntercuartil({}), null);
  assert.strictEqual(rangoIntercuartil({ prime: null, tmc: null, sofr: null }), null);
});

test('serieDisponible: SOFR no existe antes del 2 de abril de 2018', () => {
  assert.strictEqual(serieDisponible('sofr', '2018-01-01'), false);
  assert.strictEqual(serieDisponible('sofr', FECHA_INICIO_SOFR), true);
  assert.strictEqual(serieDisponible('sofr', '2020-10-27'), true);
});

test('serieDisponible: PRIME y TMC no tienen esa restricción', () => {
  assert.strictEqual(serieDisponible('prime', '2000-01-01'), true);
  assert.strictEqual(serieDisponible('tmc', '2000-01-01'), true);
});

test('TRIOS_POR_DIRECCION: pasivo es PRIME+SOFR+TMC, activo es PRIME+CIRR+LIBOR', () => {
  assert.deepStrictEqual(TRIOS_POR_DIRECCION.pasivo, ['prime', 'sofr', 'tmc']);
  assert.deepStrictEqual(TRIOS_POR_DIRECCION.activo, ['prime', 'cirr', 'libor']);
});

test('trioDeDireccion devuelve el trio de la dirección dada', () => {
  assert.deepStrictEqual(trioDeDireccion('pasivo'), ['prime', 'sofr', 'tmc']);
  assert.deepStrictEqual(trioDeDireccion('activo'), ['prime', 'cirr', 'libor']);
});

test('trioDeDireccion cae a pasivo con dirección desconocida o ausente', () => {
  assert.deepStrictEqual(trioDeDireccion(null), TRIOS_POR_DIRECCION.pasivo);
  assert.deepStrictEqual(trioDeDireccion('otra'), TRIOS_POR_DIRECCION.pasivo);
});

test('aplicaRiesgoPais es true en pasivo o dirección desconocida, false en activo', () => {
  assert.strictEqual(aplicaRiesgoPais('pasivo'), true);
  assert.strictEqual(aplicaRiesgoPais('activo'), false);
  assert.strictEqual(aplicaRiesgoPais(null), true);
});

test('totalesPorFecha con series custom (activo) calcula cirr/libor en vez de sofr/tmc', () => {
  const tasasFecha = {
    prime: { valor: 8 }, cirr: { valor: 5 }, libor: { valor: 5.535 }, moodys: { valor: 0 },
  };
  const totales = totalesPorFecha(tasasFecha, 0, ['prime', 'cirr', 'libor']);
  assert.ok(cerca(totales.prime, 8));
  assert.ok(cerca(totales.cirr, 5));
  assert.ok(cerca(totales.libor, 5.535));
  assert.strictEqual(totales.sofr, undefined);
  assert.strictEqual(totales.tmc, undefined);
});

test('numeroDesdeTexto extrae el primer número de un texto con coma decimal y sufijo', () => {
  assert.strictEqual(numeroDesdeTexto('4,540% Efectivo Anual'), 4.54);
  assert.strictEqual(numeroDesdeTexto(''), null);
  assert.strictEqual(numeroDesdeTexto(null), null);
});

test('parsearIndiceSpread reconoce "LIBOR + 1 punto"', () => {
  assert.deepStrictEqual(parsearIndiceSpread('LIBOR + 1 punto'), { indice: 'libor', spreadPct: 1 });
});

test('parsearIndiceSpread es tolerante a mayúsculas/espacios/acentos', () => {
  assert.deepStrictEqual(parsearIndiceSpread('Libor  usd  3 meses+1%'), { indice: 'libor', spreadPct: 1 });
});

test('parsearIndiceSpread reconoce SOFR sin espacio antes del signo', () => {
  assert.deepStrictEqual(parsearIndiceSpread('SOFR+2'), { indice: 'sofr', spreadPct: 2 });
});

test('parsearIndiceSpread sin texto reconocible devuelve índice null', () => {
  assert.deepStrictEqual(parsearIndiceSpread(''), { indice: null, spreadPct: 0 });
  assert.deepStrictEqual(parsearIndiceSpread('Tasa fija'), { indice: null, spreadPct: 0 });
});

test('tasaEfectivaDeFila usa tasaEA si es legible, ignora periodicidad', () => {
  const fila = { tasaEA: '4,540% Efectivo Anual', periodicidad: 'LIBOR + 9 puntos' };
  assert.strictEqual(tasaEfectivaDeFila(fila, {}), 4.54);
});

test('tasaEfectivaDeFila resuelve índice+spread cuando no hay tasaEA (Alciautos)', () => {
  const fila = { tasaEA: '', periodicidad: 'LIBOR + 1 punto', fechaPacto: '2018-06-30' };
  const tasasPrestamo = { porFecha: { '2018-06-30': { libor: { valor: 4.535 } } } };
  assert.strictEqual(tasaEfectivaDeFila(fila, tasasPrestamo), 5.535);
});

test('tasaEfectivaDeFila es null sin tasaEA, sin índice reconocible, o sin el valor del índice capturado', () => {
  assert.strictEqual(tasaEfectivaDeFila({ tasaEA: '', periodicidad: '' }, {}), null);
  assert.strictEqual(tasaEfectivaDeFila({ tasaEA: '', periodicidad: 'Tasa fija 5%' }, {}), null);
  assert.strictEqual(tasaEfectivaDeFila(
    { tasaEA: '', periodicidad: 'LIBOR + 1 punto', fechaPacto: '2018-06-30' }, { porFecha: {} },
  ), null);
});

test('serieDisponible: LIBOR no disponible después del 30/06/2023', () => {
  assert.strictEqual(serieDisponible('libor', '2018-06-30'), true);
  assert.strictEqual(serieDisponible('libor', '2024-01-01'), false);
});
