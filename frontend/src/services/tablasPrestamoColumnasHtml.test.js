import { test } from 'node:test';
import assert from 'node:assert';
import {
  quitarTablasPrestamoColumnasHtml, insertarTablasPrestamoColumnasHtml,
} from './tablasPrestamoColumnasHtml.js';
import { actualizarTablasOperacionesHtml } from './tablasOperacionesHtml.js';
import { claveTitulo } from './docxRelleno.js';
import { NOMBRES_TABLA_TRANSACCIONES, NOMBRES_TABLA_ADICIONAL } from './tablasOperaciones.js';
import { NOMBRES_TABLA_PRESTAMO } from './tablasPrestamos.js';
import { NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS, NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS } from './tablasPrestamoColumnas.js';

const PRESTAMOS_AUTOLAND = [
  {
    otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS',
    fechaDesembolso: '2020-10-27', valorCOPDesembolso: 10431000000,
    interesesCOP: 545267665, tasaEA: '4,540% E.A.', periodicidad: '12 meses',
  },
  {
    otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS',
    fechaDesembolso: '2022-07-07', valorCOPDesembolso: 8822000000,
    interesesCOP: 480413482, tasaEA: '6,000% E.A.', periodicidad: '6 meses',
  },
];

const ESTUDIO_PRESTAMO = {
  ent: 'Autoland SAS', anio: 2025, tipo_estudio: 'prestamo', prestamos: PRESTAMOS_AUTOLAND,
  vinc: 'Inversiones San Jeronimo SpA', vinc_id: '76.421.180-4', pais_vinc: 'Chile',
  tipo_vinculacion: 'Articulo 260-1 E.T – Literal 1',
};

/* Forma real de la ficha (confirmada en tablasOperacionesHtml.test.js): la primera fila es
   un único <th> "Compañía vinculada" que hace de encabezado fusionado, y «Razón social» es ya
   la primera fila de CUERPO que `reescribirFilasHtml` reescribe. Sin esa fila de encabezado,
   «Razón social» se confunde con el encabezado y no hay fila de datos que reemplazar — nada
   se reescribe, y es justo el defecto que hacía fallar este fixture antes de corregirlo. */
const fichaGenerica = (marca) =>
  '<p><strong>Tabla 3. Transacciones Inter compañía</strong></p>'
  + '<table><tr><th><p><strong>Compañía vinculada</strong></p></th></tr>'
  + '<tr><th><p>Razón social</p></th><td><p>' + marca + '</p></td></tr></table>'
  + '<p>FUENTE: de la ficha.</p>';

/* ══════ quitarTablasPrestamoColumnasHtml ══════ */

test('quitarTablasPrestamoColumnasHtml: sin nada que quitar, no toca el documento', () => {
  const html = '<p>Prosa cualquiera.</p>';
  assert.strictEqual(quitarTablasPrestamoColumnasHtml(html), html);
});

test('quitarTablasPrestamoColumnasHtml: quita la Tabla 4 y su fuente, sin tocar la ficha genérica', () => {
  const html =
    '<p><strong>Tabla 4.' + NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS + '</strong></p>'
    + '<table><tr><th><p>viejo</p></th></tr></table>'
    + '<p>FUENTE: vieja.</p>'
    + fichaGenerica('ACTUAL');
  const salida = quitarTablasPrestamoColumnasHtml(html);
  assert.ok(!salida.includes('viejo'), 'la Tabla 4 vieja se quitó');
  assert.ok(!salida.includes('FUENTE: vieja.'), 'su fuente se fue con ella');
  assert.ok(salida.includes('Transacciones Inter compañía'), 'la ficha genérica sigue ahí');
  assert.ok(salida.includes('ACTUAL'));
});

/* ══════ insertarTablasPrestamoColumnasHtml ══════ */

test('insertarTablasPrestamoColumnasHtml: sin estudio.prestamos, no hace nada', () => {
  const html = fichaGenerica('ACTUAL');
  const avisos = [];
  const salida = insertarTablasPrestamoColumnasHtml(html, { tipo_estudio: 'estandar' }, avisos);
  assert.strictEqual(salida, html);
  assert.deepStrictEqual(avisos, []);
});

test('insertarTablasPrestamoColumnasHtml: inserta las dos tablas sin colspan, con los valores repetidos', () => {
  const html = fichaGenerica('ACTUAL') + '<p>Prosa que sigue.</p>';
  const avisos = [];
  const salida = insertarTablasPrestamoColumnasHtml(html, ESTUDIO_PRESTAMO, avisos);

  assert.ok(!/colspan/i.test(salida), 'nunca se emite colspan en esta ruta');
  assert.match(salida, /Transacciones Intercompañías/);
  assert.match(salida, /Histórico de la deuda intereses sobre Préstamos \(42\)/);
  assert.ok(salida.includes('Prosa que sigue.'), 'no se pierde lo que sigue en el documento');

  /* "Razón social" (fusionada) tiene que aparecer dos veces -una por columna de préstamo-
     dentro de la Tabla 4, ya que no se puede fundir. */
  const iTabla4 = salida.indexOf('Transacciones Intercompañías');
  const iTabla13 = salida.indexOf('Histórico de la deuda');
  const bloqueTabla4 = salida.slice(iTabla4, iTabla13);
  const repeticiones = (bloqueTabla4.match(/Inversiones San Jeronimo SpA/g) || []).length;
  assert.strictEqual(repeticiones, 2, 'el valor fusionado se repite en cada columna de préstamo');

  const iFicha = salida.indexOf('FUENTE: de la ficha.');
  const iProsa = salida.indexOf('Prosa que sigue.');
  assert.ok(iFicha < iTabla4 && iTabla4 < iTabla13 && iTabla13 < iProsa);
  assert.ok(avisos.some((a) => a.includes('se insertó la tabla')));
});

test('insertarTablasPrestamoColumnasHtml: sin la ficha genérica, ancla junto a "Préstamo con su vinculado"', () => {
  const html =
    '<p><strong>Préstamo con su vinculado</strong></p>'
    + '<table><tr><th><p>x</p></th></tr></table>'
    + '<p>FUENTE: de la Fase 2.</p>'
    + '<p>Prosa que sigue.</p>';
  const avisos = [];
  const salida = insertarTablasPrestamoColumnasHtml(html, ESTUDIO_PRESTAMO, avisos);
  assert.match(salida, /Transacciones Intercompañías/, 'la tabla se crea igual, sin la ficha genérica');
  assert.match(salida, /Histórico de la deuda intereses sobre Préstamos \(42\)/);
  const iFuente = salida.indexOf('FUENTE: de la Fase 2.');
  const iTabla4 = salida.indexOf('Transacciones Intercompañías');
  const iProsa = salida.indexOf('Prosa que sigue.');
  assert.ok(iFuente < iTabla4 && iTabla4 < iProsa, 'se ancla después de la tabla de la Fase 2');
  assert.ok(avisos.some((a) => a.includes('revise la ubicación')));
});

test('insertarTablasPrestamoColumnasHtml: sin ninguna ancla, igual crea las tablas al final del documento', () => {
  const html = '<p>Nada que sirva de ancla.</p>';
  const avisos = [];
  const salida = insertarTablasPrestamoColumnasHtml(html, ESTUDIO_PRESTAMO, avisos);
  assert.match(salida, /Transacciones Intercompañías/, 'la regla es crear siempre, nunca solo avisar');
  assert.match(salida, /Histórico de la deuda intereses sobre Préstamos \(42\)/);
  assert.ok(salida.startsWith(html), 'lo que ya había en el documento no se mueve ni se pierde');
  assert.ok(avisos.some((a) => a.includes('revise la ubicación antes de radicar')));
});

/* ══════ El guardián: la secuencia completa no deja que la Tabla 4 pise a la ficha genérica ══════ */

test('la secuencia quitar/genérica/insertar deja las tres tablas intactas, sin que ninguna pise a otra', () => {
  const html =
    /* La Tabla 4 ya presente, PRIMERO en el documento — el orden real del resumen
       ejecutivo de Autoland. */
    '<p><strong>Tabla 4.' + NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS + '</strong></p>'
    + '<table><tr><th><p>DATO_TABLA_4_VIEJO</p></th></tr></table>'
    + '<p>FUENTE: vieja de la tabla 4.</p>'
    + fichaGenerica('ANTERIOR_1')
    + fichaGenerica('ANTERIOR_2');

  const avisos = [];
  let out = quitarTablasPrestamoColumnasHtml(html);
  assert.ok(!out.includes('DATO_TABLA_4_VIEJO'), 'la Tabla 4 vieja se quitó antes de que corra la genérica');

  out = actualizarTablasOperacionesHtml(out, ESTUDIO_PRESTAMO, avisos);
  assert.ok(!out.includes('ANTERIOR_1') && !out.includes('ANTERIOR_2'), 'las dos fichas se refrescaron');
  const ocurrencias = (out.match(/Transacciones Inter compañía/g) || []).length;
  assert.strictEqual(ocurrencias, 2, 'las dos apariciones de la ficha siguen ahí, ninguna de más ni de menos');

  out = insertarTablasPrestamoColumnasHtml(out, ESTUDIO_PRESTAMO, avisos);
  assert.match(out, /Tabla \d+\. Transacciones Intercompañías/, 'la Tabla 4 se reinsertó fresca');
  assert.match(out, /Histórico de la deuda intereses sobre Préstamos \(42\)/, 'y la Tabla 13 con ella');
  assert.ok(out.includes('Inversiones San Jeronimo SpA'), 'con los datos del estudio, no los viejos');
  assert.ok(!/colspan/i.test(out));
});

/* ══════ Desambiguación de nombres ══════ */

test('la Tabla 13 no colisiona con ningún nombre ya registrado, ni ninguna de las dos con la Fase 2', () => {
  const ajenos = NOMBRES_TABLA_TRANSACCIONES.concat(NOMBRES_TABLA_ADICIONAL, NOMBRES_TABLA_PRESTAMO);
  const claveHistorico = claveTitulo(NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS);
  const claveTransacciones = claveTitulo(NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS);
  ajenos.forEach((ajeno) => {
    const claveA = claveTitulo(ajeno);
    assert.ok(!claveHistorico.includes(claveA) && !claveA.includes(claveHistorico));
  });
  NOMBRES_TABLA_PRESTAMO.forEach((nombrePrestamo) => {
    const claveP = claveTitulo(nombrePrestamo);
    assert.ok(!claveTransacciones.includes(claveP) && !claveP.includes(claveTransacciones));
    assert.ok(!claveHistorico.includes(claveP) && !claveP.includes(claveHistorico));
  });
});
