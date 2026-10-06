import { test } from 'node:test';
import assert from 'node:assert';
import {
  construirPromptTasasPrestamo, parsearRespuestaTasasPrestamo,
} from './prestamoTasasPrompts.js';

/* ══════ construirPromptTasasPrestamo ══════ */

test('construirPromptTasasPrestamo: menciona cada fecha y las 4 series, más el Riesgo País del año', () => {
  const prompt = construirPromptTasasPrestamo(['2020-10-27', '2022-07-07'], 2025);
  assert.match(prompt, /2020-10-27/);
  assert.match(prompt, /2022-07-07/);
  assert.match(prompt, /PRIME/i);
  assert.match(prompt, /SOFR/i);
  assert.match(prompt, /TMC|Tasa.*Interés.*Monetaria|Banco de la Rep[uú]blica/i);
  assert.match(prompt, /Moody/i);
  assert.match(prompt, /Riesgo Pa[ií]s/i);
  assert.match(prompt, /2025/);
});

test('construirPromptTasasPrestamo: instruye explícitamente a no inventar datos', () => {
  const prompt = construirPromptTasasPrestamo(['2020-10-27'], 2025);
  assert.match(prompt, /no invent/i);
});

test('construirPromptTasasPrestamo: pide JSON como única salida', () => {
  const prompt = construirPromptTasasPrestamo(['2020-10-27'], 2025);
  assert.match(prompt, /JSON/);
});

/* ══════ parsearRespuestaTasasPrestamo ══════ */

const RESPUESTA_COMPLETA = JSON.stringify({
  porFecha: {
    '2020-10-27': {
      prime: 3.250, sofr: 0.090, tmc: 1.750, moodys: 1.560,
      fuentes: { prime: 'https://fred.stlouisfed.org/series/RIFSPBLPNA' },
    },
  },
  riesgoPais: { valor: 2.845, fuenteUrl: 'https://pages.stern.nyu.edu/~adamodar/' },
});

test('parsearRespuestaTasasPrestamo: con groundingChunks no vacíos, marca todo confiable', () => {
  const r = parsearRespuestaTasasPrestamo(RESPUESTA_COMPLETA, [{ web: { uri: 'https://fred.stlouisfed.org' } }], []);
  assert.strictEqual(r.porFecha['2020-10-27'].prime.valor, 3.250);
  assert.strictEqual(r.porFecha['2020-10-27'].prime.confiable, true);
  assert.strictEqual(r.riesgoPais.confiable, true);
  assert.strictEqual(r.riesgoPais.valor, 2.845);
});

test('parsearRespuestaTasasPrestamo: sin groundingChunks pero con webSearchQueries, igual confiable', () => {
  /* gemini-3-flash-preview trae webSearchQueries de forma consistente pero no siempre
     groundingChunks — no se puede exigir solo el primero (ver comparablesEngine.js). */
  const r = parsearRespuestaTasasPrestamo(RESPUESTA_COMPLETA, [], ['PRIME rate 27 octubre 2020']);
  assert.strictEqual(r.porFecha['2020-10-27'].prime.confiable, true);
  assert.strictEqual(r.riesgoPais.confiable, true);
});

test('parsearRespuestaTasasPrestamo: sin ningún indicio de búsqueda real, nada es confiable', () => {
  const r = parsearRespuestaTasasPrestamo(RESPUESTA_COMPLETA, [], []);
  assert.strictEqual(r.porFecha['2020-10-27'].prime.confiable, false);
  assert.strictEqual(r.porFecha['2020-10-27'].sofr.confiable, false);
  assert.strictEqual(r.riesgoPais.confiable, false);
  // el valor igual se precarga -- el analista decide si lo confirma o lo corrige
  assert.strictEqual(r.porFecha['2020-10-27'].prime.valor, 3.250);
});

test('parsearRespuestaTasasPrestamo: fuenteUrl pasa de la respuesta al resultado', () => {
  const r = parsearRespuestaTasasPrestamo(RESPUESTA_COMPLETA, [{}], []);
  assert.strictEqual(r.porFecha['2020-10-27'].prime.fuenteUrl, 'https://fred.stlouisfed.org/series/RIFSPBLPNA');
  assert.strictEqual(r.riesgoPais.fuenteUrl, 'https://pages.stern.nyu.edu/~adamodar/');
});

test('parsearRespuestaTasasPrestamo: SOFR antes del 2 de abril de 2018 sale disponible:false, valor null', () => {
  const respuestaPreSofr = JSON.stringify({
    porFecha: {
      '2015-01-15': { prime: 3.0, tmc: 2.0, moodys: 1.0, sofr: 9.99 }, // la IA se equivocó e igual lo mandó
    },
    riesgoPais: { valor: 2.845 },
  });
  const r = parsearRespuestaTasasPrestamo(respuestaPreSofr, [{}], []);
  assert.strictEqual(r.porFecha['2015-01-15'].sofr.disponible, false);
  assert.strictEqual(r.porFecha['2015-01-15'].sofr.valor, null, 'se descarta aunque la IA lo haya mandado');
  assert.strictEqual(r.porFecha['2015-01-15'].prime.disponible, true);
});

test('parsearRespuestaTasasPrestamo: una fecha sin sofr en la respuesta (posterior a 2018) sale disponible:true, valor null', () => {
  const sinSofr = JSON.stringify({
    porFecha: { '2020-10-27': { prime: 3.25, tmc: 1.75, moodys: 1.56 } },
    riesgoPais: { valor: 2.845 },
  });
  const r = parsearRespuestaTasasPrestamo(sinSofr, [], []);
  assert.strictEqual(r.porFecha['2020-10-27'].sofr.disponible, true);
  assert.strictEqual(r.porFecha['2020-10-27'].sofr.valor, null, 'disponible pero la IA no lo encontró');
});

test('parsearRespuestaTasasPrestamo: sin ningún objeto JSON en el texto, lanza (como extraerJSON)', () => {
  assert.throws(() => parsearRespuestaTasasPrestamo('esto no es JSON', [], []));
});
