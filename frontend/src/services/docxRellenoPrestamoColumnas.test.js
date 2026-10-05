import { test } from 'node:test';
import assert from 'node:assert';
import {
  generarTablaOoxmlPorColumnas, quitarTablasPrestamoColumnasOoxml, insertarTablasPrestamoColumnasOoxml,
} from './docxRellenoPrestamoColumnas.js';
import { actualizarTablasOperacionesOoxml, claveTitulo } from './docxRelleno.js';
import { NOMBRES_TABLA_TRANSACCIONES, NOMBRES_TABLA_ADICIONAL } from './tablasOperaciones.js';
import { NOMBRES_TABLA_PRESTAMO } from './tablasPrestamos.js';
import {
  filasTablaTransaccionesPrestamos, NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS,
  NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS,
} from './tablasPrestamoColumnas.js';

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

/* ══════ generarTablaOoxmlPorColumnas ══════ */

test('generarTablaOoxmlPorColumnas: el banner y las fusionadas funden todas las columnas de préstamo', () => {
  const tabla = filasTablaTransaccionesPrestamos(ESTUDIO_PRESTAMO);
  const xml = generarTablaOoxmlPorColumnas('Tabla 4. ' + tabla.titulo, tabla);
  /* 1 (rótulo) + 2 préstamos = 3 columnas; el banner funde las 3, cada fusionada funde las 2
     de prestamo (todas menos la del rótulo). */
  assert.match(xml, /<w:gridSpan w:val="3"\/>/, 'el banner funde todas las columnas');
  assert.match(xml, /<w:gridSpan w:val="2"\/>/, 'las filas fusionadas funden las columnas de préstamo');
  assert.match(xml, /Compañía Vinculada/);
  assert.match(xml, /Inversiones San Jeronimo SpA/);
  assert.match(xml, /76\.421\.180-4/);
  assert.match(xml, /Préstamo 1/);
  assert.match(xml, /Préstamo 2/);
  assert.match(xml, /FUENTE: Información suministrada por la administración de la Compañía\./);
});

test('generarTablaOoxmlPorColumnas: las filas de datos NO funden nada', () => {
  const tabla = filasTablaTransaccionesPrestamos(ESTUDIO_PRESTAMO);
  const xml = generarTablaOoxmlPorColumnas('Tabla 4. ' + tabla.titulo, tabla);
  const filaIntereses = xml.slice(xml.indexOf('Monto de intereses'), xml.indexOf('Monto de intereses') + 400);
  assert.ok(!filaIntereses.includes('gridSpan'), 'una fila de datos no debe fundir columnas');
  assert.match(xml, /545\.267\.665/);
  assert.match(xml, /480\.413\.482/);
});

/* ══════ quitarTablasPrestamoColumnasOoxml ══════ */

test('quitarTablasPrestamoColumnasOoxml: sin nada que quitar, no toca el documento', () => {
  const xml = '<w:p><w:t>Prosa cualquiera.</w:t></w:p>';
  assert.strictEqual(quitarTablasPrestamoColumnasOoxml(xml), xml);
});

test('quitarTablasPrestamoColumnasOoxml: quita la Tabla 4 y no toca la ficha genérica', () => {
  const xml =
    '<w:p><w:t>Tabla 4.' + NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS + '</w:t></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:t>viejo</w:t></w:p></w:tc></w:tr></w:tbl>'
    + '<w:p><w:t>FUENTE: vieja.</w:t></w:p>'
    + '<w:p><w:t>Tabla 3. Transacciones Inter compañía</w:t></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:t>Razón social</w:t></w:p></w:tc></w:tr></w:tbl>';
  const salida = quitarTablasPrestamoColumnasOoxml(xml);
  assert.ok(!salida.includes('viejo'), 'la Tabla 4 vieja se quitó');
  assert.ok(!salida.includes('FUENTE: vieja.'), 'su fuente se quitó con ella');
  assert.ok(salida.includes('Transacciones Inter compañía'), 'la ficha genérica sigue ahí');
  assert.ok(salida.includes('Razón social'), 'y su contenido también');
});

test('quitarTablasPrestamoColumnasOoxml: quita ambas repeticiones si la tabla aparece más de una vez', () => {
  const unaTabla = (marca) =>
    '<w:p><w:t>' + NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS + '</w:t></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:t>' + marca + '</w:t></w:p></w:tc></w:tr></w:tbl>';
  const xml = unaTabla('uno') + unaTabla('dos');
  const salida = quitarTablasPrestamoColumnasOoxml(xml);
  assert.ok(!salida.includes('uno') && !salida.includes('dos'));
});

/* ══════ insertarTablasPrestamoColumnasOoxml ══════ */

test('insertarTablasPrestamoColumnasOoxml: sin estudio.prestamos, no hace nada', () => {
  const xml = '<w:p><w:t>Tabla 3. Transacciones Inter compañía</w:t></w:p><w:tbl><w:tr><w:tc><w:p><w:t>x</w:t></w:p></w:tc></w:tr></w:tbl>';
  const avisos = [];
  const salida = insertarTablasPrestamoColumnasOoxml(xml, { tipo_estudio: 'estandar' }, avisos);
  assert.strictEqual(salida, xml);
  assert.deepStrictEqual(avisos, []);
});

test('insertarTablasPrestamoColumnasOoxml: inserta las dos tablas junto a la ficha genérica, numeradas en orden', () => {
  const xml =
    '<w:p><w:t>Tabla 3. Transacciones Inter compañía</w:t></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:t>Razón social</w:t></w:p></w:tc></w:tr></w:tbl>'
    + '<w:p><w:t>FUENTE: de la ficha.</w:t></w:p>'
    + '<w:p><w:t>Prosa que sigue.</w:t></w:p>';
  const avisos = [];
  const salida = insertarTablasPrestamoColumnasOoxml(xml, ESTUDIO_PRESTAMO, avisos);
  assert.match(salida, /Tabla 4\. Transacciones Intercompañías/);
  assert.match(salida, /Tabla 5\. Histórico de la deuda intereses sobre Préstamos \(42\)/);
  assert.ok(salida.includes('Prosa que sigue.'), 'no se pierde lo que sigue en el documento');
  /* Las dos tablas nuevas van DESPUÉS de la ficha y de su fuente, y la 13 después de la 4. */
  const iFicha = salida.indexOf('FUENTE: de la ficha.');
  const iTabla4 = salida.indexOf('Tabla 4. Transacciones Intercompañías');
  const iTabla13 = salida.indexOf('Histórico de la deuda intereses sobre Préstamos (42)');
  const iProsa = salida.indexOf('Prosa que sigue.');
  assert.ok(iFicha < iTabla4 && iTabla4 < iTabla13 && iTabla13 < iProsa);
  assert.ok(avisos.some((a) => a.includes('se insertó la tabla')));
});

test('insertarTablasPrestamoColumnasOoxml: sin la ficha genérica, ancla junto a "Préstamo con su vinculado"', () => {
  const xml =
    '<w:p><w:t>Préstamo con su vinculado</w:t></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:t>x</w:t></w:p></w:tc></w:tr></w:tbl>'
    + '<w:p><w:t>FUENTE: de la Fase 2.</w:t></w:p>'
    + '<w:p><w:t>Prosa que sigue.</w:t></w:p>';
  const avisos = [];
  const salida = insertarTablasPrestamoColumnasOoxml(xml, ESTUDIO_PRESTAMO, avisos);
  assert.match(salida, /Transacciones Intercompañías/, 'la tabla se crea igual, sin la ficha genérica');
  assert.match(salida, /Histórico de la deuda intereses sobre Préstamos \(42\)/);
  const iFuente = salida.indexOf('FUENTE: de la Fase 2.');
  const iTabla4 = salida.indexOf('Transacciones Intercompañías');
  const iProsa = salida.indexOf('Prosa que sigue.');
  assert.ok(iFuente < iTabla4 && iTabla4 < iProsa, 'se ancla después de la tabla de la Fase 2');
  assert.ok(avisos.some((a) => a.includes('revise la ubicación')));
});

test('insertarTablasPrestamoColumnasOoxml: sin ninguna ancla, igual crea las tablas al final del documento', () => {
  const xml = '<w:p><w:t>Nada que sirva de ancla.</w:t></w:p><w:sectPr/>';
  const avisos = [];
  const salida = insertarTablasPrestamoColumnasOoxml(xml, ESTUDIO_PRESTAMO, avisos);
  assert.match(salida, /Transacciones Intercompañías/, 'la regla es crear siempre, nunca solo avisar');
  assert.match(salida, /Histórico de la deuda intereses sobre Préstamos \(42\)/);
  assert.ok(salida.indexOf('Transacciones Intercompañías') < salida.indexOf('<w:sectPr'),
    'se inserta antes del cierre de sección, no después');
  assert.ok(avisos.some((a) => a.includes('revise la ubicación antes de radicar')));
});

test('insertarTablasPrestamoColumnasOoxml: avisa si el estudio mezcla más de un vinculado', () => {
  const xml =
    '<w:p><w:t>Tabla 3. Transacciones Inter compañía</w:t></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:t>x</w:t></w:p></w:tc></w:tr></w:tbl>';
  const conOtroVinculado = {
    ...ESTUDIO_PRESTAMO,
    prestamos: [...PRESTAMOS_AUTOLAND, { ...PRESTAMOS_AUTOLAND[0], otorga: 'Otra Matriz SA' }],
  };
  const avisos = [];
  insertarTablasPrestamoColumnasOoxml(xml, conOtroVinculado, avisos);
  assert.ok(avisos.some((a) => a.includes('más de un vinculado')));
});

/* ══════ El guardián: el nombre literal de la Tabla 4 no puede pisar la ficha genérica ══════

   Reproduce el escenario exacto: un documento donde la Tabla 4 ya está (de un "año
   anterior" reutilizado como plantilla) ANTES de las dos apariciones reales de la ficha
   "Transacciones Inter compañía" —el orden real del informe de Autoland—, que es
   justamente el que hace que `ocurrencia:0`/`ocurrencia:1` se equivoquen si no se quita
   primero. Corre la secuencia completa (quitar → la función genérica SIN TOCAR →
   insertar) y confirma que las tres tablas terminan intactas, cada una con lo suyo. */

test('la secuencia quitar/genérica/insertar deja las tres tablas intactas, sin que ninguna pise a otra', () => {
  const fichaGenerica = (marca) =>
    '<w:p><w:t>Tabla 3. Transacciones Inter compañía</w:t></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:t>Razón social</w:t></w:p></w:tc>'
    + '<w:tc><w:p><w:t>' + marca + '</w:t></w:p></w:tc></w:tr></w:tbl>';

  const xml =
    /* La Tabla 4 ya presente, PRIMERO en el documento — el orden real del resumen
       ejecutivo de Autoland. */
    '<w:p><w:t>Tabla 4.' + NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS + '</w:t></w:p>'
    + '<w:tbl><w:tr><w:tc><w:p><w:t>DATO_TABLA_4_VIEJO</w:t></w:p></w:tc></w:tr></w:tbl>'
    + '<w:p><w:t>FUENTE: vieja de la tabla 4.</w:t></w:p>'
    /* Las dos apariciones reales de la ficha genérica, después. */
    + fichaGenerica('ANTERIOR_1')
    + fichaGenerica('ANTERIOR_2');

  const estudio = { ...ESTUDIO_PRESTAMO, vinc: 'Inversiones San Jeronimo SpA' };
  const avisos = [];

  let out = quitarTablasPrestamoColumnasOoxml(xml);
  assert.ok(!out.includes('DATO_TABLA_4_VIEJO'), 'la Tabla 4 vieja se quitó antes de que corra la genérica');

  out = actualizarTablasOperacionesOoxml(out, estudio, avisos);
  /* La función genérica, sin tocarle una línea, ve ahora exactamente sus dos apariciones
     reales y las refresca las dos — ninguna quedó pisada por la Tabla 4. */
  assert.ok(!out.includes('ANTERIOR_1') && !out.includes('ANTERIOR_2'), 'las dos fichas se refrescaron');
  const ocurrencias = (out.match(/Transacciones Inter compañía/g) || []).length;
  assert.strictEqual(ocurrencias, 2, 'las dos apariciones de la ficha siguen ahí, ninguna de más ni de menos');

  out = insertarTablasPrestamoColumnasOoxml(out, estudio, avisos);
  assert.match(out, /Tabla 4\. Transacciones Intercompañías/, 'la Tabla 4 se reinsertó fresca');
  assert.match(out, /Histórico de la deuda intereses sobre Préstamos \(42\)/, 'y la Tabla 13 con ella');
  assert.ok(out.includes('Inversiones San Jeronimo SpA'), 'con los datos del estudio, no los viejos');
});

/* ══════ Desambiguación de nombres: el guardián en frío ══════

   El nombre de la Tabla 4 SÍ contiene, a propósito, el de la ficha genérica —el usuario
   pidió conservar el título literal del documento real—, así que su protección es la
   secuencia quitar/insertar que ya prueba el test de arriba, no el nombre. Este test cubre
   lo que SÍ tiene que ser verdad siempre: la Tabla 13 (nombre sin ninguna relación) no
   colisiona con nada, y ninguna de las dos tablas nuevas colisiona con la Fase 2. */
test('la Tabla 13 no colisiona con ningún nombre ya registrado, ni ninguna de las dos con la Fase 2', () => {
  const ajenos = NOMBRES_TABLA_TRANSACCIONES.concat(NOMBRES_TABLA_ADICIONAL, NOMBRES_TABLA_PRESTAMO);
  const claveHistorico = claveTitulo(NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS);
  const claveTransacciones = claveTitulo(NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS);
  ajenos.forEach((ajeno) => {
    const claveA = claveTitulo(ajeno);
    assert.ok(!claveHistorico.includes(claveA) && !claveA.includes(claveHistorico),
      `"Histórico de la deuda..." y "${ajeno}" no deberían ser intercambiables`);
  });
  NOMBRES_TABLA_PRESTAMO.forEach((nombrePrestamo) => {
    const claveP = claveTitulo(nombrePrestamo);
    assert.ok(!claveTransacciones.includes(claveP) && !claveP.includes(claveTransacciones));
    assert.ok(!claveHistorico.includes(claveP) && !claveP.includes(claveHistorico));
  });
});
