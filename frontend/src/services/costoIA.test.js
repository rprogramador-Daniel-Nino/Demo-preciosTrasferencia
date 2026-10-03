import { test } from 'node:test';
import assert from 'node:assert';
import { costoUSD, PRECIOS_USD_POR_MILLON } from './costoIA.js';

function cerca(a, b) {
  return Math.abs(a - b) < 1e-9;
}

test('calcula el costo de claude-haiku-4-5-20251001 con 1M de entrada y 1M de salida', () => {
  const costo = costoUSD('claude-haiku-4-5-20251001', 1_000_000, 1_000_000);
  assert.ok(cerca(costo, 6), 'esperaba 6, obtuvo ' + costo);
});

test('calcula el costo de claude-sonnet-5 con tokens parciales', () => {
  const costo = costoUSD('claude-sonnet-5', 500_000, 200_000);
  assert.ok(cerca(costo, 3), 'esperaba 3, obtuvo ' + costo);
});

test('calcula el costo de gemini-3.5-flash', () => {
  const costo = costoUSD('gemini-3.5-flash', 2_000_000, 100_000);
  assert.ok(cerca(costo, 3.9), 'esperaba 3.9, obtuvo ' + costo);
});

test('calcula el costo de gemini-3-flash-preview', () => {
  const costo = costoUSD('gemini-3-flash-preview', 4_000_000, 1_000_000);
  assert.ok(cerca(costo, 2.5), 'esperaba 2.5, obtuvo ' + costo);
});

test('modelo desconocido no rompe y cuesta 0', () => {
  const costo = costoUSD('modelo-que-no-existe', 1000, 1000);
  assert.strictEqual(costo, 0);
});

test('tokens ausentes (undefined/null) se tratan como 0', () => {
  assert.strictEqual(costoUSD('claude-haiku-4-5-20251001', undefined, undefined), 0);
  assert.strictEqual(costoUSD('claude-haiku-4-5-20251001', null, null), 0);
});

test('la tabla de precios expone los cuatro modelos vigentes', () => {
  assert.ok(PRECIOS_USD_POR_MILLON['gemini-3.5-flash']);
  assert.ok(PRECIOS_USD_POR_MILLON['gemini-3-flash-preview']);
  assert.ok(PRECIOS_USD_POR_MILLON['claude-haiku-4-5-20251001']);
  assert.ok(PRECIOS_USD_POR_MILLON['claude-sonnet-5']);
});
