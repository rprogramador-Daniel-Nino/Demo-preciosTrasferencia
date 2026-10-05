/* ─────────────────────────────────────────────────────────────────────────────
   tablasPrestamoColumnasHtml.js — Fase 3 de los estudios tipo préstamo, ruta de PDF
   "plantilla marcada": el HTML de "Transacciones Intercompañías" y "Histórico de la deuda
   intereses sobre Préstamos (42)".

   Archivo nuevo. No toca `tablasOperacionesHtml.js` (la Fase 2 de esta ruta) ni
   `tablasPrestamos.js`: importa de los dos solo lo ya exportado.

   LA PIEZA GENUINAMENTE NUEVA. Hasta ahora esta ruta solo sabía CLONAR una tabla ya
   existente en la plantilla (`insertarTablaHtml`, `tablasHtmlInforme.js`), exigiendo que
   el ancla tenga la MISMA forma que la tabla nueva — por eso la Fase 2, con una tabla de
   5 columnas y un ancla de 2, se resolvía con un aviso en vez de insertar. Esta tabla sí
   fabrica el `<table>` desde cero: reutiliza `tablaHTML` (`analisisMercado.js`), el mismo
   constructor genérico que ya usa la ruta "Crear sin plantilla" — no se inventa un
   mecanismo nuevo de marcado, solo se usa uno que ya existe en otra ruta.

   SIN `colspan`, NUNCA. El conversor final de HTML a `.docx` que usan esta ruta y la de
   "Crear sin plantilla" no soporta celdas fusionadas (`docxWriter.js:685-695`, con su
   propio comentario: «el árbol del PDF no expone ColSpan ni RowSpan»). Un `colspan` aquí
   se vería bien en la vista previa y saldría roto en el archivo descargado. Por eso las
   filas que en la ruta .docx sí funden una celda (Razón social, Identificación fiscal,
   País, Tipo de vinculación, Tipo de operación) salen aquí con el valor REPETIDO en cada
   columna de préstamo — `aMatrizPlana`, en la capa de datos, ya resuelve esa conversión.

   EL MISMO RIESGO DE COLISIÓN DE NOMBRES que la ruta .docx, y la misma solución: quitar
   ANTES de que corra `actualizarTablasOperacionesHtml` (que no excluye el nombre de la
   Tabla 4 al buscar sus dos apariciones de "Transacciones Inter compañía"), insertar
   DESPUÉS. Ver `docxRellenoPrestamoColumnas.js` para el detalle completo del porqué.
   ───────────────────────────────────────────────────────────────────────────── */

import {
  localizarTablaHtml, localizarTablasHtml, borrarTablaHtml, textoPlanoHtml,
} from './tablasHtmlInforme.js';
import { numeroDeTabla } from './docxRelleno.js';
import { tablaHTML } from './analisisMercado.js';
import { tienePrestamos } from './tablasPrestamos.js';
import { NOMBRES_TABLA_TRANSACCIONES, NOMBRES_TABLA_ADICIONAL } from './tablasOperaciones.js';
import { NOMBRES_TABLA_PRESTAMO } from './tablasPrestamos.js';
import {
  filasTablaTransaccionesPrestamos, filasTablaHistoricoDeudaPrestamos, aMatrizPlana,
  NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS, NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS,
} from './tablasPrestamoColumnas.js';

/* Misma lista y mismo motivo que `EXCLUIR_PARA_ANCLA` de `docxRellenoPrestamoColumnas.js`:
   al buscar la ficha genérica como ancla hay que vetar «Operación adicional...» (que la
   contiene) y, por si acaso esta función se llama sin que antes haya corrido
   `quitarTablasPrestamoColumnasHtml`, los nombres propios de la Tabla 4/13 y de la Fase 2. */
const EXCLUIR_PARA_ANCLA = NOMBRES_TABLA_ADICIONAL
  .concat([NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS, NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS], NOMBRES_TABLA_PRESTAMO);

/* Equivalente HTML de `finDeFuenteTrasPosicion` de la ruta .docx: desde `desde`, salta
   párrafos vacíos y, si el siguiente párrafo con texto es una fuente, devuelve la posición
   justo después. Versión local y deliberadamente más simple que la privada
   `elementoFuenteSiguiente` de `tablasHtmlInforme.js` (no exportada): alcanza porque el HTML
   que recorre aquí —el que `actualizarTablasOperacionesHtml` acaba de regenerar para la
   ficha ancla, sin tocarle una línea— es siempre un párrafo simple, sin marcadores de por
   medio. */
function finDeFuenteTrasPosicionHtml(html, desde) {
  let cursor = desde;
  for (;;) {
    const resto = html.slice(cursor);
    const m = /^\s*<p(?:\s[^>]*)?>[\s\S]*?<\/p\s*>/i.exec(resto);
    if (!m) return cursor;
    const texto = textoPlanoHtml(m[0]);
    if (!texto) { cursor += m[0].length; continue; }
    if (/^fuentes?\s*:/i.test(texto)) return cursor + m[0].length;
    return cursor;
  }
}

/**
 * Quita del documento cualquier Tabla 4/13 que ya estuviera —de un informe anterior
 * reutilizado como plantilla—. Se llama SIEMPRE, antes de `actualizarTablasOperacionesHtml`,
 * exista o no `estudio.prestamos`: le garantiza a esa función que solo va a encontrar las
 * dos apariciones reales de la ficha genérica. No hace falta ningún `excluir` al buscar
 * por el propio nombre de la Tabla 4: su título, más largo que cualquier nombre ya
 * registrado, nunca encuentra uno corto por error — es la búsqueda en el sentido contrario
 * la que arriesgaría, y de esa protege el orden quitar/insertar, no esta exclusión.
 */
export function quitarTablasPrestamoColumnasHtml(html) {
  let out = String(html || '');
  [NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS, NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS].forEach((nombre) => {
    const bloques = localizarTablasHtml(out, [nombre]);
    for (const bloque of [...bloques].reverse()) {
      out = borrarTablaHtml(out, bloque);
    }
  });
  return out;
}

/**
 * Inserta la Tabla 4 y la Tabla 13 con los datos frescos del estudio, ancladas justo
 * después de la ficha "Transacciones Inter compañía" —ya refrescada por
 * `actualizarTablasOperacionesHtml`, que corre antes—. Sin `estudio.prestamos` no hace
 * nada: ya se quitaron las que hubiera.
 */
export function insertarTablasPrestamoColumnasHtml(html, estudio, avisos) {
  let out = String(html || '');
  if (!tienePrestamos(estudio)) return out;

  const ancla = localizarTablaHtml(out, NOMBRES_TABLA_TRANSACCIONES, { excluir: EXCLUIR_PARA_ANCLA });
  if (!ancla) {
    if (Array.isArray(avisos)) {
      avisos.push(NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS);
      avisos.push(NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS);
    }
    return out;
  }

  let cursor = finDeFuenteTrasPosicionHtml(out, ancla.fin);
  const numeroAncla = numeroDeTabla(ancla.titulo);
  let numero = numeroAncla != null ? numeroAncla : null;

  [
    { nombre: NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS, tabla: filasTablaTransaccionesPrestamos(estudio) },
    { nombre: NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS, tabla: filasTablaHistoricoDeudaPrestamos(estudio) },
  ].forEach(({ nombre, tabla }) => {
    if (!tabla) return;
    if (tabla.avisoVinculados && Array.isArray(avisos)) avisos.push(tabla.avisoVinculados);
    if (numero != null) numero += 1;
    const titulo = numero != null ? 'Tabla ' + numero + '. ' + nombre : nombre;
    const plano = aMatrizPlana(tabla);
    const bloque = tablaHTML(titulo, plano.encabezados, plano.filas, plano.fuente) + '\n';
    out = out.slice(0, cursor) + bloque + out.slice(cursor);
    cursor += bloque.length;
    if (Array.isArray(avisos)) {
      avisos.push('se insertó la tabla «' + nombre + '» junto a «Transacciones Inter compañía».');
    }
  });

  return out;
}
