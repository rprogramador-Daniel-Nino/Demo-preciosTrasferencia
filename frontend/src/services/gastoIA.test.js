import { test } from 'node:test';
import assert from 'node:assert';
import { registrarUsoIA, cargarEstudio, suscribir, obtenerEstado } from './gastoIA.js';

test('registra un uso con forma Anthropic (data.usage + data.model)', () => {
  cargarEstudio(null);
  registrarUsoIA('Actividad Económica Detectada', {
    model: 'claude-sonnet-5',
    usage: { input_tokens: 1_000_000, output_tokens: 500_000 },
  });
  const estado = obtenerEstado();
  assert.strictEqual(estado.operaciones.length, 1);
  assert.strictEqual(estado.operaciones[0].etiqueta, 'Actividad Económica Detectada');
  assert.strictEqual(estado.operaciones[0].modelo, 'claude-sonnet-5');
  assert.strictEqual(estado.operaciones[0].tokensEntrada, 1_000_000);
  assert.strictEqual(estado.operaciones[0].tokensSalida, 500_000);
  assert.ok(Math.abs(estado.totalUSD - 7) < 1e-9, 'esperaba 7, obtuvo ' + estado.totalUSD);
});

test('registra un uso con forma Gemini cruda (data.usageMetadata), usando el modelo explícito', () => {
  cargarEstudio(null);
  registrarUsoIA('Certificado de Composición Accionaria', {
    usageMetadata: { promptTokenCount: 2_000_000, candidatesTokenCount: 100_000 },
  }, 'gemini-3.5-flash');
  const estado = obtenerEstado();
  assert.strictEqual(estado.operaciones.length, 1);
  assert.strictEqual(estado.operaciones[0].modelo, 'gemini-3.5-flash');
  assert.strictEqual(estado.operaciones[0].proveedor, 'gemini');
  assert.ok(Math.abs(estado.totalUSD - 3.9) < 1e-9, 'esperaba 3.9, obtuvo ' + estado.totalUSD);
});

test('respeta el proveedor "gemini" cuando la respuesta con forma Anthropic viene del fallback', () => {
  cargarEstudio(null);
  registrarUsoIA('Traducción de actividad de comparables', {
    model: 'gemini-3.5-flash',
    proveedor: 'gemini',
    usage: { input_tokens: 100, output_tokens: 100 },
  });
  assert.strictEqual(obtenerEstado().operaciones[0].proveedor, 'gemini');
});

test('registra un uso namespaced bajo _uso (clave "modelo" en español, forma usage)', () => {
  cargarEstudio(null);
  registrarUsoIA('Carga de RUT', {
    modelo: 'gemini-3.5-flash',
    proveedor: 'gemini',
    usage: { input_tokens: 1_000_000, output_tokens: 0 },
  });
  const estado = obtenerEstado();
  assert.strictEqual(estado.operaciones[0].modelo, 'gemini-3.5-flash');
  assert.ok(Math.abs(estado.totalUSD - 1.5) < 1e-9, 'esperaba 1.5, obtuvo ' + estado.totalUSD);
});

test('registra un uso namespaced bajo _uso (clave "modelo" en español, forma usageMetadata)', () => {
  cargarEstudio(null);
  registrarUsoIA('Análisis del sector: búsqueda sector', {
    modelo: 'gemini-3-flash-preview',
    proveedor: 'gemini',
    usageMetadata: { promptTokenCount: 4_000_000, candidatesTokenCount: 0 },
  });
  const estado = obtenerEstado();
  assert.strictEqual(estado.operaciones[0].modelo, 'gemini-3-flash-preview');
  assert.ok(Math.abs(estado.totalUSD - 1) < 1e-9, 'esperaba 1, obtuvo ' + estado.totalUSD);
});

test('sin usage ni usageMetadata no registra nada y no lanza', () => {
  cargarEstudio(null);
  assert.doesNotThrow(() => registrarUsoIA('Ingesta de EEFF', { candidates: [] }));
  assert.doesNotThrow(() => registrarUsoIA('Ingesta de EEFF', undefined));
  assert.doesNotThrow(() => registrarUsoIA('Ingesta de EEFF', null));
  assert.strictEqual(obtenerEstado().operaciones.length, 0);
  assert.strictEqual(obtenerEstado().totalUSD, 0);
});

test('acumula el total a través de varias operaciones', () => {
  cargarEstudio(null);
  registrarUsoIA('a', { model: 'claude-haiku-4-5-20251001', usage: { input_tokens: 1_000_000, output_tokens: 0 } });
  registrarUsoIA('b', { model: 'claude-haiku-4-5-20251001', usage: { input_tokens: 1_000_000, output_tokens: 0 } });
  const estado = obtenerEstado();
  assert.strictEqual(estado.operaciones.length, 2);
  assert.ok(Math.abs(estado.totalUSD - 2) < 1e-9, 'esperaba 2, obtuvo ' + estado.totalUSD);
});

test('cargarEstudio siembra el store con un acumulado previo', () => {
  cargarEstudio({ totalUSD: 4.5, operaciones: [{ etiqueta: 'x', modelo: 'y', costoUSD: 4.5, ts: 1 }] });
  const estado = obtenerEstado();
  assert.strictEqual(estado.totalUSD, 4.5);
  assert.strictEqual(estado.operaciones.length, 1);
});

test('cargarEstudio sin argumento (o null) vacía el store', () => {
  cargarEstudio({ totalUSD: 4.5, operaciones: [{ etiqueta: 'x' }] });
  cargarEstudio(null);
  const estado = obtenerEstado();
  assert.strictEqual(estado.totalUSD, 0);
  assert.strictEqual(estado.operaciones.length, 0);
});

test('suscribir notifica a los oyentes cuando se registra un uso', () => {
  cargarEstudio(null);
  let notificaciones = 0;
  const cancelar = suscribir(() => { notificaciones++; });
  try {
    registrarUsoIA('a', { model: 'claude-haiku-4-5-20251001', usage: { input_tokens: 1, output_tokens: 1 } });
    assert.strictEqual(notificaciones, 1);
  } finally {
    cancelar();
  }
});

test('suscribir notifica también cuando cargarEstudio cambia el store', () => {
  cargarEstudio(null);
  let notificaciones = 0;
  const cancelar = suscribir(() => { notificaciones++; });
  try {
    cargarEstudio({ totalUSD: 1, operaciones: [] });
    assert.strictEqual(notificaciones, 1);
  } finally {
    cancelar();
  }
});

test('cancelar la suscripción detiene las notificaciones', () => {
  cargarEstudio(null);
  let notificaciones = 0;
  const cancelar = suscribir(() => { notificaciones++; });
  cancelar();
  registrarUsoIA('a', { model: 'claude-haiku-4-5-20251001', usage: { input_tokens: 1, output_tokens: 1 } });
  assert.strictEqual(notificaciones, 0);
});
