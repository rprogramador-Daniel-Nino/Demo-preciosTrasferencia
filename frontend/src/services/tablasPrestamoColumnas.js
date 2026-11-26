/* ─────────────────────────────────────────────────────────────────────────────
   tablasPrestamoColumnas.js — Fase 3 de los estudios tipo préstamo: las filas de
   "Transacciones de Préstamos Intercompañía" y "Histórico de la deuda intereses sobre
   Préstamos (42)", donde cada préstamo va como COLUMNA en vez de como fila.

   Archivo nuevo, no toca la ingesta (`excelPrestamosParser.js`) ni la Fase 2
   (`tablasPrestamos.js`, tabla "Préstamo con su vinculado") — lee de las dos sin
   modificarlas. Verificado contra un informe real ya radicado (Autoland 2025): la forma
   exacta de las dos tablas, qué campo de `estudio.prestamos[i]` alimenta cada fila, y que
   «Monto en Principal (Préstamo)» es `valorCOPDesembolso` (coincide cifra a cifra con el
   documento real y con la prueba ya existente de la Fase 2) y NO `saldoCOP` (que es el
   saldo a 31 de diciembre, un dato distinto).

   La razón social del vinculado la dice el préstamo (`vinculadoDePrestamo`, el otorga/recibe
   que no es `estudio.ent` — Fase 2, `tablasPrestamos.js:11-16`), nunca `estudio.vinc`: ese
   campo es del motor de márgenes y puede traer la contraparte equivocada cuando la ingesta
   genérica de "Operaciones con Vinculados" encontró varias distintas (reportado el
   2026-11-25: un estudio real traía "BRUNO FRITSCH SA" —otro cliente— mientras los
   préstamos eran con "Inversiones San Jeronimo SpA"). Identificación fiscal y país SÍ
   salen de `estudio.vinc_id`/`pais_vinc`: una fila de préstamo no los trae. Mismo criterio
   de simplificación que ya acepta la Fase 2: un solo vinculado por tabla. Si el estudio
   trae préstamos de más de una contraparte distinta, se declara en `avisoVinculados` en vez
   de mezclarlos en silencio.

   Produce las filas como una lista de DESCRIPTORES (`{tipo, ...}`), no como una matriz
   plana: quien las consuma decide cómo pintar cada tipo —con celda fusionada de verdad
   (ruta .docx, que sí soporta `gridSpan`) o con el valor repetido en cada columna (rutas
   de PDF marcado y "Crear sin plantilla", que no soportan celdas fusionadas en el .docx
   final — ver `docxWriter.js:685-695`). `aMatrizPlana` hace esa segunda conversión, lista
   para los generadores de tabla genéricos que ya existen en esas dos rutas.
   ───────────────────────────────────────────────────────────────────────────── */

import { fmt, num } from '../utils/calculations.js';
import { tienePrestamos, vinculadoDePrestamo } from './tablasPrestamos.js';
import { conceptoDeOperacion } from './tablasOperaciones.js';

export const NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS = 'Transacciones Intercompañías';
export const NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS =
  'Histórico de la deuda intereses sobre Préstamos (42)';

const SIN_DATO = '—';
const wrap = (v) => String(v == null || v === '' ? SIN_DATO : v);
const montoTexto = (v) => {
  const n = num(v);
  return n === null ? SIN_DATO : fmt(n);
};

/* Parse manual del ISO y no `new Date(iso)`: el constructor que recibe el string interpreta
   medianoche en UTC, y en un huso horario negativo (Colombia, UTC-5) eso corre la fecha un
   día hacia atrás. Misma disciplina que `fechaTexto` de `tablasPrestamos.js:18-23`. */
function fechaLargaEs(iso) {
  if (!iso) return SIN_DATO;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return SIN_DATO;
  return new Date(y, m - 1, d)
    .toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * «Tipo de operación» de la tabla: delega en `conceptoDeOperacion` (`tablasOperaciones.js`),
 * que para un estudio de préstamo ya resuelve siempre al catálogo DIAN ("Intereses sobre
 * préstamos", 42 egreso / 13 ingreso) — un solo lugar para esa resolución en vez de dos
 * copias del mismo regex contra el catálogo.
 */
export function tipoOperacionPrestamo(estudio) {
  const { desc, cod } = conceptoDeOperacion(estudio);
  return desc && cod ? desc + ' (' + cod + ')' : 'Intereses sobre préstamos';
}

const normalizarNombreCompania = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();

/** ¿`estudio.prestamos` mezcla más de una contraparte distinta? Reutiliza la misma
 *  normalización que `vinculadoDePrestamo` de la Fase 2 (privada ahí, trivial de repetir
 *  aquí) para decidir, por cada préstamo, cuál de los dos lados es «el vinculado». */
export function prestamosConMasDeUnVinculado(estudio) {
  const ent = normalizarNombreCompania(estudio && estudio.ent);
  const contrapartes = new Set();
  ((estudio && estudio.prestamos) || []).forEach((p) => {
    const o = normalizarNombreCompania(p.otorga);
    const r = normalizarNombreCompania(p.recibe);
    contrapartes.add(o === ent ? r : (r === ent ? o : (o || r)));
  });
  return contrapartes.size > 1;
}

/**
 * Filas de "Transacciones de Préstamos Intercompañía", como descriptores.
 *
 * @param {object} estudio
 * @returns {{
 *   nombre:string, titulo:string, etiquetasPrestamo:string[],
 *   filas: Array<
 *     {tipo:'banner', texto:string} |
 *     {tipo:'encabezado', etiqueta:string, valores:string[]} |
 *     {tipo:'fusionada', clave:string, etiqueta:string, valor:string} |
 *     {tipo:'datos', clave:string, etiqueta:string, valores:string[]}
 *   >,
 *   fuente:string, avisoVinculados:string|null,
 * }|null}
 */
export function filasTablaTransaccionesPrestamos(estudio) {
  if (!tienePrestamos(estudio)) return null;
  const e = estudio;
  const prestamos = e.prestamos;
  const etiquetasPrestamo = prestamos.map((_, i) => 'Préstamo ' + (i + 1));
  const razonSocial = vinculadoDePrestamo(prestamos[0], e.ent);

  return {
    nombre: NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS,
    titulo: NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS,
    etiquetasPrestamo,
    filas: [
      { tipo: 'banner', texto: 'Compañía Vinculada' },
      { tipo: 'encabezado', etiqueta: 'Nº de prestamos', valores: etiquetasPrestamo },
      { tipo: 'fusionada', clave: 'razonSocial', etiqueta: 'Razón social', valor: wrap(razonSocial) },
      { tipo: 'fusionada', clave: 'idFiscal', etiqueta: 'Identificación fiscal', valor: wrap(e.vinc_id) },
      { tipo: 'fusionada', clave: 'pais', etiqueta: 'País-Residencia fiscal', valor: wrap(e.pais_vinc) },
      {
        tipo: 'fusionada', clave: 'tipoVinculacion', etiqueta: 'Tipo de vinculación',
        valor: wrap(e.tipo_vinculacion || 'Art 260-1 E-T Inciso 1'),
      },
      { tipo: 'fusionada', clave: 'tipoOperacion', etiqueta: 'Tipo de operación', valor: tipoOperacionPrestamo(e) },
      {
        tipo: 'datos', clave: 'montoIntereses', etiqueta: 'Monto de intereses',
        valores: prestamos.map((p) => montoTexto(p.interesesCOP)),
      },
      {
        tipo: 'datos', clave: 'fechaDesembolso', etiqueta: 'Fecha de Desembolso',
        valores: prestamos.map((p) => fechaLargaEs(p.fechaDesembolso)),
      },
      {
        /* `p.tasaEA || p.periodicidad || p.tasaPactada`: cuando el Excel no trae una tasa
           Efectiva Anual (visto en un informe real: Alciautos, tasa pactada "LIBOR + 1
           punto", capturada solo en `periodicidad`), se muestra el texto que sí haya en vez
           de "—" — el número a usar para cálculos sale de `tasaEfectivaDeFila`
           (`prestamoTasasCalculo.js`), no de este texto. */
        tipo: 'datos', clave: 'tasaPactada', etiqueta: 'Tasa Pactada',
        valores: prestamos.map((p) => wrap(p.tasaEA || p.periodicidad || p.tasaPactada)),
      },
      {
        tipo: 'datos', clave: 'periodicidad', etiqueta: 'Periodicidad de intereses',
        valores: prestamos.map((p) => wrap(p.periodicidad)),
      },
      {
        tipo: 'datos', clave: 'montoPrincipal', etiqueta: 'Monto en Principal (Préstamo)',
        /* valorCOPDesembolso, NO saldoCOP — ver la nota de cabecera del archivo. */
        valores: prestamos.map((p) => montoTexto(p.valorCOPDesembolso)),
      },
    ],
    fuente: 'Información suministrada por la administración de la Compañía.',
    avisoVinculados: prestamosConMasDeUnVinculado(e)
      ? 'el estudio trae préstamos con más de un vinculado; la tabla "' + NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS
        + '" declara un solo vinculado para todos, revísala'
      : null,
  };
}

/**
 * Filas de "Histórico de la deuda intereses sobre Préstamos (42)": el mismo molde de
 * "Transacciones de Préstamos Intercompañía", sin las filas de monto de intereses, fecha
 * de desembolso y periodicidad — una sola fuente de cifras para las dos tablas.
 */
export function filasTablaHistoricoDeudaPrestamos(estudio) {
  const base = filasTablaTransaccionesPrestamos(estudio);
  if (!base) return null;
  const OMITIR = new Set(['montoIntereses', 'fechaDesembolso', 'periodicidad']);
  return {
    ...base,
    nombre: NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS,
    titulo: NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS,
    filas: base.filas.filter((f) => !OMITIR.has(f.clave)),
  };
}

/**
 * La misma tabla, aplanada a `{titulo, encabezados, filas, fuente}` — lista para los
 * generadores de tabla genéricos de las rutas que NO pueden fusionar celdas en el .docx
 * final (PDF marcado y "Crear sin plantilla"; ver la nota de cabecera). Una fila
 * "fusionada" sale con su valor REPETIDO en cada columna de préstamo; el banner sale con
 * su etiqueta y el resto de la fila en blanco, como un separador de sección.
 */
export function aMatrizPlana(tabla) {
  if (!tabla) return null;
  const n = tabla.etiquetasPrestamo.length;
  const filas = tabla.filas
    .filter((f) => f.tipo !== 'encabezado')
    .map((f) => {
      if (f.tipo === 'banner') return [f.texto, ...Array(n).fill('')];
      if (f.tipo === 'fusionada') return [f.etiqueta, ...Array(n).fill(f.valor)];
      return [f.etiqueta, ...f.valores];
    });
  return {
    titulo: tabla.titulo,
    encabezados: ['Nº de prestamos', ...tabla.etiquetasPrestamo],
    filas,
    fuente: tabla.fuente,
  };
}
