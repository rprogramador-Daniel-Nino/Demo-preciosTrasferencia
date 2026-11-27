/* ─────────────────────────────────────────────────────────────────────────────
   eeffSegmentacionColumnas.js — de qué SEGMENTO (línea de negocio, geografía…) es cada
   cifra del estado financiero segmentado.

   POR QUÉ EXISTE. Es la contraparte de `eeffColumnas.js` para la columna de SEGMENTO en vez
   de la de ejercicio: un estado financiero segmentado (OFIMIO: «Tecnologia» / «Otros») trae
   sus columnas por línea de negocio igual de alineadas geométricamente que un comparativo
   las trae por año, y el mismo razonamiento aplica —el modelo no sabe de qué columna sale
   cada cifra a menos que se le anote—. La diferencia de fondo es que un año se reconoce con
   una regex (`/^(19|20)\d{2}$/`) sin ayuda de nadie, mientras que una etiqueta de segmento es
   texto libre («Tecnologia», «Exportación», «Colombia») que solo se conoce después de una
   primera pasada de OCR/lectura que la identificó: por eso toda función aquí recibe la lista
   de etiquetas esperadas en vez de detectarlas ella misma.

   Se reutiliza, sin tocarla, la geometría de `eeffColumnas.js` (`filasConColumnas`,
   `seccionesDeFilas` —que ya usa `seccionQueAbre`/`subseccionQueAbre` por dentro—,
   `esCeldaDeCifra`): la fila, la celda, la sección y la subsección son el mismo concepto en
   los dos tipos de estado. Lo único que cambia es la clave de la columna, de `anio` a
   `etiqueta`.
   ───────────────────────────────────────────────────────────────────────────── */

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { interpretaciones } from './eeffTextoPdf.js';
import { normalizarPalabra } from './vocabularioEeff.js';
import {
  filasConColumnas, seccionesDeFilas, esCeldaDeCifra,
} from './eeffColumnas.js';

/**
 * El encabezado que declara los segmentos de un estado segmentado, con la posición de cada
 * columna y la tolerancia con la que se le puede atribuir una cifra.
 *
 * Que la etiqueta sea texto conocido de antemano (en vez de una regex de año) quita UNA de
 * las dos fuentes de ambigüedad de `encabezadoDeAnios`: no hace falta desempatar candidatas
 * por una coincidencia de FORMA, porque el rótulo exacto no se confunde con nada más que él
 * mismo. Pero la OTRA fuente sigue intacta: un documento puede repetir las mismas etiquetas
 * dos veces —un título o una leyenda que las cita arriba de la tabla, antes del encabezado de
 * verdad—, y eso no es una coincidencia de forma sino una fila de datos distinta. Por eso se
 * conserva el mismo criterio que usa el original para resolverla: cada candidata se prueba
 * contra las cifras de las filas que vienen después y gana la que más explica (ver
 * `cifrasExplicadasSegmento`), exactamente como `cifrasExplicadas` en `eeffColumnas.js`.
 *
 * @returns {{y:number, columnas:Array<{etiqueta:string, derecha:number}>, tolerancia:number}|null}
 */
export function encabezadoDeSegmentos(filas, etiquetas) {
  /* Se busca por la forma normalizada, pero cada columna guarda la etiqueta TAL COMO LA PIDIÓ
     el llamador (no el texto crudo de la celda del PDF): `ubicacionDeCifraSegmento` compara
     la columna de una celda con la etiqueta pedida por igualdad estricta, y una diferencia de
     solo mayúsculas, tildes o forma NFC/NFD del acento entre el PDF y la lectura dejaba a
     todas las cifras en «otra-columna». */
  const buscadas = (etiquetas || [])
    .map((e) => ({ clave: normalizarPalabra(e), etiqueta: String(e || '').trim() }))
    .filter((b) => b.clave);
  if (buscadas.length < 1) return null;

  const lista = filas || [];
  let mejor = null;

  for (let i = 0; i < lista.length; i += 1) {
    const candidata = encabezadoDeFilaSegmentos(lista[i], buscadas);
    if (!candidata) continue;
    const respaldo = cifrasExplicadasSegmento(lista.slice(i + 1), candidata);
    if (!mejor || respaldo > mejor.respaldo) mejor = { candidata, respaldo };
  }

  if (!mejor) return null;
  /* Sin backing de al menos dos columnas (o de la única columna, si solo se pidió una
     etiqueta) no hay nada que sostenga que esto es un encabezado real y no un título que
     repite las etiquetas sueltas. */
  const minimo = Math.min(MINIMO_CIFRAS_QUE_RESPALDAN, mejor.candidata.columnas.length);
  if (mejor.respaldo < minimo) return null;
  return mejor.candidata;
}

/* Cuántas columnas hacen falta backing debajo para creerle a un encabezado candidato. Dos,
   igual que en `eeffColumnas.js`: una sola podría caer por casualidad cerca de una celda
   suelta de un título, dos columnas alineadas en filas distintas ya no. Con una sola
   etiqueta pedida (un solo segmento en el documento) se exige esa única columna. */
const MINIMO_CIFRAS_QUE_RESPALDAN = 2;

/* Cuántas celdas con forma de cifra de estas filas caen en alguna columna del encabezado
   candidato. Mismo criterio que `cifrasExplicadas` en `eeffColumnas.js`: se cuentan por
   columna distinta y no en bruto, para que una fila con varios números pegados a una misma
   etiqueta no infle el respaldo de un candidato que en realidad no explica nada. */
function cifrasExplicadasSegmento(filas, encabezado) {
  const porColumna = new Set();
  let total = 0;
  (filas || []).forEach((fila) => {
    const etiquetas = asignarSegmentos(fila, encabezado);
    etiquetas.forEach((etiqueta) => { porColumna.add(etiqueta); total += 1; });
  });
  const minimo = Math.min(MINIMO_CIFRAS_QUE_RESPALDAN, encabezado.columnas.length);
  return porColumna.size >= minimo ? total : 0;
}

/* La fila leída COMO encabezado de segmentos, o `null` si no puede serlo. Sin mirar el resto
   del documento. Dos reglas, calcadas de `encabezadoDeFila`:

     · cada etiqueta buscada debe calzar con una celda DISTINTA de la fila: dos etiquetas no
       pueden compartir la misma celda, igual que dos años no pueden compartir la misma celda
       en el original;
     · ninguna OTRA celda de la fila puede tener forma de cifra. En el original esto descarta
       un «31» suelto de una fecha en prosa; aquí descarta la misma clase de frase, y además
       una fila de datos que por azar repitiera dos rótulos de columna como parte de su
       propio texto.

   Y una tercera, propia de este módulo: si una etiqueta pedida aparece en MÁS de una celda
   de la fila, la fila es ambigua y no se acepta. Es el caso del estado segmentado
   comparativo («Tecnologia | Otros | Tecnologia | Otros», un bloque por año): quedarse en
   silencio con la primera celda verificaba siempre contra el bloque de la izquierda, y una
   cifra leída del año equivocado podía salir como «coincide». Sin cruzar el año (pendiente),
   lo honesto es no reconocer el encabezado y que la verificación quede «sin-verificar». */
function encabezadoDeFilaSegmentos(fila, buscadas) {
  const celdas = (fila && fila.celdas) || [];
  const columnas = [];
  const usadas = new Set();

  for (const { clave, etiqueta } of buscadas) {
    const coincidentes = [];
    celdas.forEach((c, i) => { if (normalizarPalabra(c.texto) === clave) coincidentes.push(i); });
    if (coincidentes.length > 1) return null;
    const idx = coincidentes.find((i) => !usadas.has(i));
    if (idx === undefined) return null;
    usadas.add(idx);
    columnas.push({ etiqueta, derecha: celdas[idx].derecha });
  }

  const otraCifra = celdas.some((c, i) => !usadas.has(i) && esCeldaDeCifra(c.texto));
  if (otraCifra) return null;

  const ordenadas = [...columnas].sort((a, b) => a.derecha - b.derecha);
  let hueco = Infinity;
  for (let i = 1; i < ordenadas.length; i += 1) {
    hueco = Math.min(hueco, ordenadas[i].derecha - ordenadas[i - 1].derecha);
  }
  /* Hueco nulo o negativo con dos o más etiquetas: dos columnas en la misma posición, no se
     puede distinguir cuál es cuál. Con una sola etiqueta no hay hueco que medir —se usa una
     tolerancia generosa fija, porque no hay columna contigua con la que calibrarla. */
  if (ordenadas.length > 1 && (!Number.isFinite(hueco) || hueco <= 0)) return null;
  const tolerancia = Number.isFinite(hueco) && hueco > 0 ? hueco / 2 : 50;

  return { y: fila.y, columnas: ordenadas, tolerancia };
}

/**
 * Qué segmento le corresponde a cada celda de una fila.
 *
 * Idéntico a `asignarAnios`: solo se consideran celdas con forma de cifra, cada columna se
 * queda con la celda más cercana dentro de su tolerancia y cada celda con un solo segmento,
 * resolviendo los pares del más cercano al más lejano.
 *
 * @returns {Map<object, string>} celda → etiqueta.
 */
export function asignarSegmentos(fila, encabezado) {
  const asignado = new Map();
  if (!fila || !encabezado || !encabezado.columnas.length) return asignado;

  const candidatas = (fila.celdas || []).filter((c) => esCeldaDeCifra(c.texto));
  const pares = [];
  encabezado.columnas.forEach((col) => {
    candidatas.forEach((celda) => {
      const d = Math.abs(col.derecha - celda.derecha);
      if (d <= encabezado.tolerancia) pares.push({ etiqueta: col.etiqueta, celda, d });
    });
  });
  pares.sort((a, b) => a.d - b.d);

  const etiquetasUsadas = new Set();
  pares.forEach(({ etiqueta, celda }) => {
    if (asignado.has(celda) || etiquetasUsadas.has(etiqueta)) return;
    asignado.set(celda, etiqueta);
    etiquetasUsadas.add(etiqueta);
  });
  return asignado;
}

/**
 * La estructura de un PDF segmentado: por página, sus filas con posición, su encabezado de
 * segmentos y la sección en la que cae cada fila. Igual que `extraerEstructuraPdf`, pero
 * con las etiquetas de segmento recibidas en vez de detectadas.
 */
export async function extraerEstructuraPdfSegmentos(file, etiquetas, { getDocument = pdfjs.getDocument } = {}) {
  const vacio = { paginas: [], etiquetasHalladas: [] };
  if (!file) return vacio;
  if (file.type && file.type.startsWith('image/')) return vacio;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const doc = await getDocument({
      data: new Uint8Array(arrayBuffer),
      isOffscreenCanvasSupported: false,
    }).promise;

    const paginasDeFilas = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const contenido = await page.getTextContent();
      const filas = filasConColumnas(contenido.items);
      if (filas.length) paginasDeFilas.push({ numero: n, filas });
    }
    return estructuraSegmentosDeFilas(paginasDeFilas, etiquetas);
  } catch (err) {
    console.warn('[eeffSegmentacionColumnas] no se pudo leer la estructura del PDF:', err && err.message);
    return vacio;
  }
}

/**
 * La misma estructura, a partir de las filas ya extraídas (el OCR de respaldo las entrega
 * así, igual que en `estructuraDeFilas`).
 *
 * @returns {{paginas, etiquetasHalladas: string[]}}
 */
export function estructuraSegmentosDeFilas(paginasDeFilas, etiquetas) {
  const paginas = [];
  const halladas = new Set();
  (paginasDeFilas || []).forEach(({ numero, filas }) => {
    if (!filas || !filas.length) return;
    const encabezado = encabezadoDeSegmentos(filas, etiquetas);
    if (encabezado) encabezado.columnas.forEach((c) => halladas.add(c.etiqueta));
    paginas.push({ numero, filas, encabezado, conSeccion: seccionesDeFilas(filas) });
  });
  return { paginas, etiquetasHalladas: [...halladas] };
}

/* Texto de una fila tal como lo vería `unirTrozos`, para comparar contra el rótulo que
   devolvió la lectura. */
const textoDeFila = (fila) => ((fila && fila.celdas) || []).map((c) => c.texto).join(' | ');

/** El rótulo de una fila: sus celdas hasta la primera que sea de una columna de segmento. */
function rotuloDeFila(fila, encabezado) {
  const etiquetas = asignarSegmentos(fila, encabezado);
  const partes = [];
  for (const celda of fila.celdas || []) {
    if (etiquetas.has(celda)) break;
    partes.push(celda.texto);
  }
  return partes.join(' ').trim() || textoDeFila(fila);
}

/** ¿Esta celda contiene la cifra buscada? Misma tolerancia de un peso y mismas dos
 *  convenciones de separador de miles que `celdaTraeCifra` en `eeffColumnas.js` — se
 *  reimplementa porque esa función no está exportada. */
function celdaTraeCifra(celda, objetivo) {
  return interpretaciones(String(celda.texto))
    .some((n) => Math.abs(Math.abs(n) - objetivo) <= 1);
}

/** La cifra de una fila que cae en la columna de un segmento dado, o `null`. */
function cifraDelSegmentoEnFila(fila, encabezado, etiqueta) {
  const etiquetas = asignarSegmentos(fila, encabezado);
  for (const celda of fila.celdas || []) {
    if (etiquetas.get(celda) !== etiqueta) continue;
    const lecturas = interpretaciones(String(celda.texto));
    if (lecturas.length) return { texto: celda.texto, valor: lecturas[0] };
    return { texto: celda.texto, valor: null };
  }
  return null;
}

/**
 * Dónde está de verdad una cifra que la lectura atribuyó a un rótulo, dentro de la columna
 * de un SEGMENTO en vez de un ejercicio. Es la contraparte exacta de `ubicacionDeCifra`.
 *
 * Veredictos:
 *   `coincide`               está en la fila del rótulo y en la columna del segmento objetivo.
 *   `otra-columna`           está en esa fila pero en la columna de otro segmento.
 *   `corregible`             la fila de su rótulo trae OTRA cifra en la columna del segmento
 *                            objetivo, en `esperado`.
 *   `vacio-en-el-segmento`   la fila existe y su columna del segmento objetivo está en blanco
 *                            o en «-».
 *   `fuera-de-columna`       la fila del rótulo existe pero no tiene ninguna celda en las
 *                            columnas de segmento.
 *   `sin-verificar`         no se puede afirmar nada.
 *
 * @returns {{veredicto:string, etiquetaHallada?:string, seccion?:string, rotuloReal?:string,
 *            esperado?:{texto:string, valor:number|null}|null}}
 */
export function ubicacionDeCifraSegmento(estructura, {
  rotulo, valor, etiqueta, subseccion,
}) {
  const objetivo = Math.abs(Number(valor));
  const clave = normalizarPalabra(rotulo);
  const etiquetaObjetivo = String(etiqueta || '').trim();
  if (!clave || !Number.isFinite(objetivo) || !etiquetaObjetivo) {
    return { veredicto: 'sin-verificar' };
  }

  const paginas = (estructura && estructura.paginas) || [];
  const candidatas = [];
  paginas.forEach((pagina) => {
    if (!pagina.encabezado) return;
    (pagina.conSeccion || []).forEach(({ fila, seccion, subseccion: sub }) => {
      if (fila.y === pagina.encabezado.y) return;
      if (!normalizarPalabra(textoDeFila(fila)).includes(clave)) return;
      candidatas.push({
        fila, seccion, subseccion: sub, encabezado: pagina.encabezado,
      });
    });
  });

  if (!candidatas.length) return { veredicto: 'sin-verificar' };

  const preferida = String(subseccion || '').trim().toUpperCase();
  if (preferida) {
    const enSubseccion = candidatas.filter((c) => c.subseccion === preferida);
    if (enSubseccion.length) {
      candidatas.length = 0;
      candidatas.push(...enSubseccion);
    }
  }

  /* 1. ¿Está en la columna pedida de alguna fila del rótulo? */
  for (const c of candidatas) {
    const etiquetas = asignarSegmentos(c.fila, c.encabezado);
    for (const celda of c.fila.celdas || []) {
      if (!celdaTraeCifra(celda, objetivo)) continue;
      if (etiquetas.get(celda) === etiquetaObjetivo) {
        return { veredicto: 'coincide', etiquetaHallada: etiquetaObjetivo, seccion: c.seccion };
      }
    }
  }

  /* 2. ¿Está en otra columna de la misma fila? */
  for (const c of candidatas) {
    const etiquetas = asignarSegmentos(c.fila, c.encabezado);
    for (const celda of c.fila.celdas || []) {
      if (!celdaTraeCifra(celda, objetivo)) continue;
      const etiquetaCelda = etiquetas.get(celda);
      if (etiquetaCelda && etiquetaCelda !== etiquetaObjetivo) {
        return {
          veredicto: 'otra-columna',
          etiquetaHallada: etiquetaCelda,
          seccion: c.seccion,
          esperado: cifraDelSegmentoEnFila(c.fila, c.encabezado, etiquetaObjetivo),
        };
      }
    }
  }

  /* 3. La cifra leída no está en la fila de su rótulo: se mira qué dice esa fila en la
        columna del segmento pedido. */
  const conCifra = candidatas
    .map((c) => ({ ...c, esperado: cifraDelSegmentoEnFila(c.fila, c.encabezado, etiquetaObjetivo) }))
    .filter((c) => c.esperado);
  const elegida = conCifra.find((c) => c.esperado.valor !== null) || conCifra[0] || null;

  if (elegida && elegida.esperado.valor !== null) {
    return {
      veredicto: 'corregible',
      etiquetaHallada: etiquetaObjetivo,
      seccion: elegida.seccion,
      rotuloReal: rotuloDeFila(elegida.fila, elegida.encabezado),
      esperado: elegida.esperado,
    };
  }

  if (elegida) {
    return {
      veredicto: 'vacio-en-el-segmento',
      etiquetaHallada: etiquetaObjetivo,
      seccion: elegida.seccion,
      esperado: elegida.esperado,
    };
  }

  const primera = candidatas[0];
  return {
    veredicto: 'fuera-de-columna',
    seccion: primera.seccion,
    esperado: null,
  };
}
