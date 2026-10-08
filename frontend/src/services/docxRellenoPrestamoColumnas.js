/* ─────────────────────────────────────────────────────────────────────────────
   docxRellenoPrestamoColumnas.js — Fase 3 de los estudios tipo préstamo, ruta .docx de
   plantilla propia: el OOXML de "Transacciones Intercompañías" y "Histórico de la deuda
   intereses sobre Préstamos (42)".

   Archivo nuevo. No importa nada de `tablasPrestamos.js` salvo `tienePrestamos` (sin
   tocar esa Fase 2), y de `docxRelleno.js` solo lo ya exportado para localizar una tabla
   por su título (`localizarBloqueTabla`) — nunca su cuerpo. Cada función arma su tabla de
   punta a punta, igual que el resto de generadores OOXML de este sistema
   (`generarTablaOoxml`/`generarTablaOoxmlConVinculado`, `docxRelleno.js`); se duplican
   aquí el escape XML y las constantes de ancho/tipografía por el mismo motivo que ya
   documenta ese archivo, no por descuido.

   EL RIESGO DE COLISIÓN DE NOMBRES Y CÓMO SE RESUELVE. El título real de la Tabla 4,
   "Transacciones Intercompañías", contiene como subcadena al nombre ya registrado para la
   ficha genérica "Transacciones Inter compañía" (`NOMBRES_TABLA_TRANSACCIONES`,
   `tablasOperaciones.js`). La función existente que refresca esa ficha
   (`actualizarTablasOperacionesOoxml`, `docxRelleno.js:2581-2583`) NO excluye este nombre
   al buscar sus propias dos apariciones, y no se le puede tocar una línea. La corrección
   no es renombrar la Tabla 4 —el usuario pidió conservar el título literal— sino el
   ORDEN: `quitarTablasPrestamoColumnasOoxml` se llama ANTES de esa función (así solo ve
   sus dos apariciones reales, nunca una tercera) e `insertarTablasPrestamoColumnasOoxml`
   se llama DESPUÉS (ancla en la ficha ya refrescada). El efecto visible es el de un
   reemplazo en su sitio; por dentro es quitar y volver a insertar.
   ───────────────────────────────────────────────────────────────────────────── */

import { PUNTOS_TABLA, FUENTE_TABLA } from './estiloDocumento.js';
import { localizarBloqueTabla } from './docxRelleno.js';
import { tienePrestamos } from './tablasPrestamos.js';
import { NOMBRES_TABLA_TRANSACCIONES, NOMBRES_TABLA_ADICIONAL } from './tablasOperaciones.js';
import { NOMBRES_TABLA_PRESTAMO } from './tablasPrestamos.js';
import {
  filasTablaTransaccionesPrestamos, filasTablaHistoricoDeudaPrestamos,
  NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS, NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS,
} from './tablasPrestamoColumnas.js';

function escaparXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* Mismo valor que `ANCHO_TABLA_PCT` de `docxRelleno.js`: 5000 cincuentavos de por ciento
   es el 100 % de la caja de texto, sea cual sea el margen de la plantilla del cliente. */
const ANCHO_TABLA_PCT = 5000;

/* NO hace falta excluir nada al buscar la Tabla 4/13 POR SU PROPIO NOMBRE: el título de la
   Tabla 4, "Transacciones Intercompañías" (plural), es más largo que cualquier nombre ya
   registrado y los contiene a ellos —nunca al revés—, así que buscar por el nombre largo no
   encuentra por error un título corto. (Es la búsqueda en el otro sentido —por el nombre
   corto de la ficha genérica— la que sí encontraría de más a la Tabla 4; de eso protege el
   orden quitar-antes/insertar-después, no esta exclusión.) `descartarPorNombre` con una lista
   vacía no descarta nada (`tablasOperacionesHtml.js`/`docxRelleno.js` comparten ese criterio),
   así que no pasar `excluir` aquí es intencional, no un descuido. */

/* Al buscar la FICHA GENÉRICA como ancla, en cambio, sí hace falta excluir: "Operación
   adicional Transacciones Intercompañía" contiene el nombre de la ficha genérica (mismo
   criterio que ya usa `actualizarTablasOperacionesOoxml`), y la propia Tabla 4/13 lo
   contendría también si por algún motivo todavía estuviera en el documento al buscar el
   ancla —en producción siempre se llama después de `quitarTablasPrestamoColumnasOoxml`, pero
   esta exclusión no depende de que ese orden se respete para seguir siendo segura—. */
const EXCLUIR_PARA_ANCLA = NOMBRES_TABLA_ADICIONAL
  .concat([NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS, NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS], NOMBRES_TABLA_PRESTAMO);

const RX_PARRAFO_OOXML = /^<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/;
const textoPlanoParrafoOoxml = (p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
  .map((m) => m.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, ''))
  .join('');

/**
 * Desde `desde`, salta párrafos vacíos y, si el siguiente párrafo con texto es una fuente
 * ("Fuente: ..."), devuelve la posición justo después de él. Si no hay un párrafo así
 * pegado ahí, devuelve `desde` sin mover nada.
 *
 * Versión deliberadamente más simple que la privada `finDeFuenteSiguienteOoxml` de
 * `docxRelleno.js` (que no se puede importar: no está exportada, y exportarla tocaría esa
 * Fase 2 por una sola palabra). Alcanza porque el OOXML que recorre aquí —el que esta
 * misma función generó en una pasada anterior, o el que acaba de regenerar en limpio
 * `actualizarTablasOperacionesOoxml` para la ficha ancla— nunca trae marcadores de
 * posición ni comentarios de por medio, solo párrafos vacíos.
 */
function finDeFuenteTrasPosicion(xml, desde) {
  let cursor = desde;
  for (;;) {
    const resto = xml.slice(cursor);
    const m = RX_PARRAFO_OOXML.exec(resto);
    if (!m) return cursor;
    const texto = textoPlanoParrafoOoxml(m[0]).trim();
    if (!texto) { cursor += m[0].length; continue; }
    if (/^fuente\s*:/i.test(texto)) return cursor + m[0].length;
    return cursor;
  }
}

/** Arma el OOXML de una de las dos tablas de columnas-por-préstamo, con fusión real
 *  (`gridSpan`) en las filas que corresponde — la ruta .docx es la única de las tres que
 *  sí puede fundir celdas en el `.docx` final (ver `docxWriter.js:685-695` para las otras
 *  dos). */
export function generarTablaOoxmlPorColumnas(titulo, tabla) {
  const colCount = 1 + tabla.etiquetasPrestamo.length;
  const anchoColumna = Math.floor(ANCHO_TABLA_PCT / colCount);
  const anchoDe = (i) => (i === colCount - 1
    ? ANCHO_TABLA_PCT - anchoColumna * (colCount - 1)
    : anchoColumna);
  const anchoDesde = (inicio, span) => {
    let total = 0;
    for (let k = inicio; k < inicio + span; k++) total += anchoDe(k);
    return total;
  };

  const letra = `<w:rFonts w:ascii="${FUENTE_TABLA}" w:hAnsi="${FUENTE_TABLA}"/>`
    + `<w:sz w:val="${PUNTOS_TABLA * 2}"/>`;
  const borde = (lado, sz) => `<w:${lado} w:val="single" w:sz="${sz}" w:space="0" w:color="000000"/>`;

  const celda = (texto, { cabecera = false, span = 1, inicio = 0 } = {}) =>
    `<w:tc><w:tcPr><w:tcW w:w="${anchoDesde(inicio, span)}" w:type="pct"/>`
    + (span > 1 ? `<w:gridSpan w:val="${span}"/>` : '')
    + (cabecera ? `<w:shd w:val="clear" w:color="auto" w:fill="999999"/>` : '')
    + `<w:vAlign w:val="center"/></w:tcPr>`
    + `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>`
    + `<w:r><w:rPr>${letra}`
    + (cabecera ? `<w:color w:val="000000"/><w:b/>` : '')
    + `</w:rPr><w:t>${escaparXml(texto)}</w:t></w:r></w:p></w:tc>`;

  let xml = `<w:p><w:pPr><w:keepNext/><w:outlineLvl w:val="9"/></w:pPr>`
    + `<w:r><w:rPr><w:b/></w:rPr><w:t>${escaparXml(titulo)}</w:t></w:r></w:p>`;
  xml += `<w:tbl>`;
  xml += `<w:tblPr><w:tblStyle w:val="TableGrid"/>`
    + `<w:tblW w:w="${ANCHO_TABLA_PCT}" w:type="pct"/><w:tblLayout w:type="fixed"/><w:tblBorders>`
    + borde('top', 12) + borde('bottom', 12) + borde('left', 12) + borde('right', 12)
    + borde('insideH', 6) + borde('insideV', 6)
    + `</w:tblBorders>`
    + `<w:tblCellMar><w:top w:w="75" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>`
    + `<w:bottom w:w="75" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar>`
    + `</w:tblPr>`;

  tabla.filas.forEach((f) => {
    if (f.tipo === 'banner') {
      xml += `<w:tr><w:trPr><w:tblHeader/></w:trPr>`
        + celda(f.texto, { cabecera: true, span: colCount, inicio: 0 })
        + `</w:tr>`;
    } else if (f.tipo === 'encabezado') {
      xml += `<w:tr><w:trPr><w:tblHeader/></w:trPr>`
        + celda(f.etiqueta, { cabecera: true, inicio: 0 })
        + f.valores.map((v, i) => celda(v, { cabecera: true, inicio: i + 1 })).join('')
        + `</w:tr>`;
    } else if (f.tipo === 'fusionada') {
      xml += `<w:tr>`
        + celda(f.etiqueta, { inicio: 0 })
        + celda(f.valor, { span: colCount - 1, inicio: 1 })
        + `</w:tr>`;
    } else {
      xml += `<w:tr>`
        + celda(f.etiqueta, { inicio: 0 })
        + f.valores.map((v, i) => celda(v, { inicio: i + 1 })).join('')
        + `</w:tr>`;
    }
  });

  xml += `</w:tbl>`;
  if (tabla.fuente) {
    xml += `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:jc w:val="left"/></w:pPr>`
      + `<w:r><w:rPr><w:sz w:val="18"/><w:b/></w:rPr><w:t>FUENTE: ${escaparXml(tabla.fuente)}</w:t></w:r></w:p>`;
  }
  return xml;
}

/**
 * Quita del documento cualquier Tabla 4/13 que ya estuviera —de un informe anterior
 * reutilizado como plantilla—, incluidas sus repeticiones. Se llama SIEMPRE, antes de que
 * corra `actualizarTablasOperacionesOoxml`, exista o no `estudio.prestamos`: es lo que le
 * garantiza a esa función que solo va a encontrar las dos apariciones reales de la ficha
 * genérica.
 */
export function quitarTablasPrestamoColumnasOoxml(xml) {
  let out = String(xml || '');
  [NOMBRE_TABLA_TRANSACCIONES_PRESTAMOS, NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS].forEach((nombre) => {
    let bloque = localizarBloqueTabla(out, [nombre]);
    while (bloque) {
      const fin = finDeFuenteTrasPosicion(out, bloque.fin);
      out = out.slice(0, bloque.inicio) + out.slice(fin);
      bloque = localizarBloqueTabla(out, [nombre]);
    }
  });
  return out;
}

/* Dónde termina el cuerpo del documento: justo antes del `<w:sectPr>` de la última sección,
   o antes de `</w:body>` si no hay uno. Mismo criterio que usa `parrafoHermanoSiguiente`
   (`docxRelleno.js`) para reconocer el final del cuerpo. Es el ancla de ÚLTIMO recurso —
   nunca el objetivo—, para que la regla de "crear siempre, nunca solo avisar" se cumpla
   incluso en una plantilla que no trae ni la ficha genérica ni la tabla de la Fase 2. */
function finDelCuerpoOoxml(xml) {
  const iSect = xml.indexOf('<w:sectPr');
  if (iSect >= 0) return iSect;
  const iBody = xml.indexOf('</w:body>');
  return iBody >= 0 ? iBody : xml.length;
}

/**
 * Inserta la Tabla 4 (Transacciones Intercompañías) y la Tabla 13 (Histórico de la deuda) con
 * los datos frescos del estudio. Sin `estudio.prestamos` no hace nada: ya se quitaron las que
 * hubiera, y no hay nada que insertar.
 *
 * Regla confirmada con el usuario: estas dos tablas se crean SIEMPRE que el estudio es de tipo
 * préstamo, nunca se degradan a un simple aviso de "no encontrada" como sí le pasa a la tabla
 * de la Fase 2 cuando falta su ancla. Lo que SÍ cambió (reportado el 2026-10-08, contra el
 * informe real de referencia): las dos tablas NO van juntas. Cada una tiene su propio lugar:
 *
 *   - Transacciones Intercompañías va junto al resumen de la operación, con la misma cadena de
 *     anclas de siempre: 1) la ficha "Transacciones Inter compañía", 2) "Préstamo con su
 *     vinculado" (Fase 2) si la plantilla no trae la ficha, 3) al final del documento si no
 *     existe ninguna de las dos.
 *   - Histórico de la deuda va MÁS ADELANTE, entre "Criterios de vinculación económica" y
 *     "Activos a 31 de diciembre" — el lugar exacto del informe real (Tabla 12 → Tabla 13 →
 *     Tabla 14) —, y solo si la plantilla no trae "Criterios de vinculación económica" cae de
 *     vuelta a anclarse junto a donde haya quedado Transacciones Intercompañía, para seguir
 *     garantizando que nunca se queda sin crear.
 *
 * Cada ancla se busca sobre el XML ya actualizado por el paso anterior (nunca sobre offsets
 * calculados antes de insertar), así que una tabla que se inserta más arriba en el documento no
 * desactualiza la posición de la que viene después.
 */
export function insertarTablasPrestamoColumnasOoxml(xml, estudio, avisos) {
  let out = String(xml || '');
  if (!tienePrestamos(estudio)) return out;

  /* Inserta `tabla` en `cursor`, numerada a partir de `numeroAncla` (la tabla que la precede),
     y devuelve dónde quedó el cursor y qué número usó — lo que la siguiente tabla necesita
     para numerarse en cadena si le toca caer en el mismo sitio (respaldo de Histórico cuando
     no hay «Criterios de vinculación»). */
  const insertarEn = (cursor, tabla, numeroAncla, descripcion) => {
    if (!tabla) return { cursor, numero: numeroAncla };
    if (tabla.avisoVinculados && Array.isArray(avisos)) avisos.push(tabla.avisoVinculados);
    const numero = numeroAncla != null ? numeroAncla + 1 : null;
    const titulo = numero != null ? 'Tabla ' + numero + '. ' + tabla.nombre : tabla.nombre;
    const ooxml = generarTablaOoxmlPorColumnas(titulo, tabla);
    out = out.slice(0, cursor) + ooxml + out.slice(cursor);
    if (Array.isArray(avisos)) avisos.push('se insertó la tabla «' + tabla.nombre + '» ' + descripcion + '.');
    return { cursor: cursor + ooxml.length, numero };
  };

  // 1. Transacciones Intercompañías: misma cadena de anclas que siempre.
  let anclaT = localizarBloqueTabla(out, NOMBRES_TABLA_TRANSACCIONES, { excluir: EXCLUIR_PARA_ANCLA });
  let descT = 'junto a «Transacciones Inter compañía»';
  if (!anclaT) {
    anclaT = localizarBloqueTabla(out, NOMBRES_TABLA_PRESTAMO);
    descT = 'junto a «Préstamo con su vinculado», porque la plantilla no trae '
      + '«Transacciones Inter compañía»: revise la ubicación';
  }
  let cursorT;
  let numeroT;
  if (anclaT) {
    cursorT = finDeFuenteTrasPosicion(out, anclaT.fin);
    numeroT = anclaT.numero != null ? anclaT.numero : null;
  } else {
    cursorT = finDelCuerpoOoxml(out);
    numeroT = null;
    descT = 'al final del documento, porque la plantilla no trae ni '
      + '«Transacciones Inter compañía» ni «Préstamo con su vinculado»: revise la ubicación '
      + 'antes de radicar';
  }
  const { cursor: cursorTrasTransacciones, numero: numeroTrasTransacciones } =
    insertarEn(cursorT, filasTablaTransaccionesPrestamos(estudio), numeroT, descT);

  // 2. Histórico de la deuda: entre «Criterios de vinculación económica» y «Activos a 31 de
  //    diciembre». Se busca sobre `out` YA actualizado por el paso 1.
  const anclaH = localizarBloqueTabla(out, ['Criterios de vinculación']);
  let cursorH;
  let numeroH;
  let descH;
  if (anclaH) {
    cursorH = finDeFuenteTrasPosicion(out, anclaH.fin);
    numeroH = anclaH.numero != null ? anclaH.numero : null;
    descH = 'entre «Criterios de vinculación económica» y «Activos a 31 de diciembre»';
  } else {
    cursorH = cursorTrasTransacciones;
    numeroH = numeroTrasTransacciones;
    descH = 'junto a «Transacciones Intercompañías», porque la plantilla no trae '
      + '«Criterios de vinculación económica»: revise la ubicación';
  }
  insertarEn(cursorH, filasTablaHistoricoDeudaPrestamos(estudio), numeroH, descH);

  return out;
}
