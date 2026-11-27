/* ─────────────────────────────────────────────────────────────────────────────
   eeffSegmentacionVerificacion.js — verificación por columna y cuadre de un EEFF
   SEGMENTADO por línea de negocio (o geografía, o lo que el cliente elija como segmento).

   POR QUÉ EXISTE. Es la contraparte de `verificarEeff` (eeffVerificacion.js) para una
   `LecturaSegmentada` (Task 3, eeffSegmentacionParser.js): en vez de verificar las cifras
   del único ejercicio del estudio contra la columna de ese AÑO, aquí se verifican las
   cuatro cifras del SEGMENTO elegido —el que el analista va a aplicar al estudio— contra
   su columna en la geometría del PDF (`extraerEstructuraPdfSegmentos`/
   `ubicacionDeCifraSegmento`, Task 2).

   Dos diferencias de fondo con `verificarEeff`, ambas deliberadas y ya resueltas en el
   spec/plan de este feature (no hay que reabrirlas):

     · Sin fallback de notas. `verificarEeff` puede descartar una cifra que no cuadra y
       dejar el campo en null para que el analista la escriba a mano, o recurrir a una
       pasada angosta a las notas del EEFF. Aquí no: un veredicto distinto de `coincide`
       agrega una ADVERTENCIA pero la cifra leída se mantiene siempre — no hay pasada a
       notas para segmentos (no existe ese camino todavía) y vaciar el campo dejaría el
       segmento sin margen operacional, que es peor que una cifra visible con su aviso.

     · El cuadre es un chequeo propio, que no tiene equivalente en `verificarEeff`: la
       suma de TODOS los segmentos de la lectura debe reproducir, rubro por rubro, el
       total de la compañía que el mismo documento imprime. Con tolerancia relativa más
       holgada que `TOLERANCIA_RELATIVA` de `eeffVerificacion.js` (ver `TOLERANCIA_CUADRE`)
       porque aquí sí puede haber de por medio un prorrateo manual del cliente con sus
       propios redondeos. Un descuadre nunca bloquea ni lanza: solo advierte.

   El módulo es puro salvo por `extraerEstructuraPdfSegmentos`, que lee el PDF (`archivo`)
   cuando hay capa de texto que comprobar; sin ella (o sin `archivo`), se salta ese paso
   igual que hace `verificarEeff` hoy con un documento sin capa de texto.
   ───────────────────────────────────────────────────────────────────────────── */

import { utilidadOperacionalDe, gastosOperativosDe } from './eeffVerificacion.js';
import { extraerEstructuraPdfSegmentos, ubicacionDeCifraSegmento } from './eeffSegmentacionColumnas.js';

/* Tolerancia relativa del cuadre segmentos↔total, por rubro. Más holgada que la milésima
   (`TOLERANCIA_RELATIVA`) de `eeffVerificacion.js` a propósito: ahí la identidad es
   aritmética pura dentro del mismo documento (ingresos − costo − gastos), y aquí puede
   haber de por medio una asignación manual del cliente entre segmentos, con sus propios
   redondeos — 1 % deja pasar ese redondeo sin dejar de atrapar un segmento mal sumado o
   una columna leída de más/de menos. Valor dejado a criterio del implementador por el
   spec; ajustable por el llamador vía `toleranciaCuadre`. */
const TOLERANCIA_CUADRE = 0.01;

/* Los cuatro rubros que trae cada segmento y que se verifican contra el PDF, con el
   nombre que ve el analista en la advertencia. `t_gastos`/`t_op` no están: son derivados
   (paso 1) y no tienen fila propia que verificar — se verifica lo que SÍ está impreso,
   los cuatro insumos de los que salen. */
const ETIQUETA_RUBRO = {
  t_s: 'Ingresos de actividades ordinarias',
  t_c: 'Costo de ventas',
  t_gastos_ventas: 'Gastos de ventas',
  t_gastos_administracion: 'Gastos de administración',
};

const RUBROS_VERIFICABLES = Object.keys(ETIQUETA_RUBRO);

/* Los cuatro rubros que entran al cuadre segmentos↔total. Mismos cuatro que
   `RUBROS_VERIFICABLES`: son los únicos que tanto `lectura.segmentos[i]` como
   `lectura.totalCompania` traen. */
const RUBROS_CUADRE = RUBROS_VERIFICABLES;

const fmtCop = (v) => (v === null || v === undefined || !Number.isFinite(Number(v))
  ? '—'
  : Math.round(Number(v)).toLocaleString('es-CO'));

/* El mensaje de la advertencia de columna, con el mismo tono que las de
   `eeffVerificacion.js`: nombra el campo, lo que la lectura tomó y lo que la columna
   correcta del documento dice, sin descartar la cifra (ver cabecera del módulo). */
function mensajeDeColumna(campo, valor, etiquetaSegmento, donde) {
  const base = `«${ETIQUETA_RUBRO[campo]}» del segmento «${etiquetaSegmento}»: la lectura tomó `
    + `${fmtCop(valor)}`;

  switch (donde.veredicto) {
    case 'otra-columna':
      return `${base}, pero esa cifra está impresa en la columna «${donde.etiquetaHallada}», no `
        + `en «${etiquetaSegmento}».`
        + (donde.esperado && donde.esperado.texto
          ? ` En la columna «${etiquetaSegmento}» esa misma fila dice ${donde.esperado.texto}.`
          : '')
        + ' Se mantuvo la cifra leída; verifíquela contra el estado financiero.';
    case 'corregible':
      return `${base}, pero en el documento esa fila dice ${donde.esperado.texto} en la columna `
        + `«${etiquetaSegmento}»${donde.rotuloReal ? ` (fila «${donde.rotuloReal}»)` : ''}. `
        + 'Se mantuvo la cifra leída; verifíquela contra el estado financiero.';
    case 'vacio-en-el-segmento':
      return `${base}, pero en el documento esa fila no trae cifra en la columna «${etiquetaSegmento}» `
        + '(está en blanco o con un guion). Se mantuvo la cifra leída; verifíquela contra el estado financiero.';
    case 'fuera-de-columna':
      return `${base}, pero esa fila no tiene ninguna celda en las columnas de segmento del documento. `
        + 'Se mantuvo la cifra leída; verifíquela contra el estado financiero.';
    case 'sin-verificar':
    default:
      return `${base}, y no se pudo verificar contra la columna «${etiquetaSegmento}» del documento `
        + '(el rótulo no aparece en ninguna fila, o el documento no trae un encabezado de segmentos '
        + 'reconocible). Se mantuvo la cifra leída; verifíquela contra el estado financiero.';
  }
}

/**
 * Verifica la lectura de un EEFF segmentado para el segmento elegido y devuelve los
 * campos que la ingesta debe aplicar al estudio.
 *
 * Cinco pasos (ver el plan, task-4-brief.md):
 *   1. `t_gastos`/`t_op` del segmento elegido, con las mismas `gastosOperativosDe`/
 *      `utilidadOperacionalDe` que usa la lectura estándar.
 *   2. Con capa de texto: verifica los cuatro rubros del segmento contra su columna en la
 *      geometría del PDF (`archivo`). Un veredicto distinto de `coincide` advierte, pero
 *      nunca descarta la cifra — no hay pasada a notas para un segmento (ver cabecera).
 *   3. Sin capa de texto, se salta el paso 2 entero y `verificadoContraTexto` es `false`.
 *   4. Cuadre: la suma de los cuatro rubros de TODOS los segmentos contra el total de la
 *      compañía, con tolerancia relativa `toleranciaCuadre`. Nunca bloquea ni lanza.
 *   5. `segmentosDisponibles`, para el selector de la UI.
 *
 * @param {object} lectura - `LecturaSegmentada` (eeffSegmentacionParser.js).
 * @param {{etiquetaSegmento:string, anioEstudio:string|number, archivo?:File|null,
 *          toleranciaCuadre?:number, extraerEstructura?:Function}} opciones
 *   `extraerEstructura` es un punto de inyección para pruebas (default:
 *   `extraerEstructuraPdfSegmentos`, la real que lee el PDF): el llamador de producción
 *   nunca lo pasa, y un test puede sustituirlo por una función que devuelva una
 *   `estructura` construida a mano con fixtures, sin tocar `pdfjs` ni un PDF real — misma
 *   técnica que ya usa `extraerEstructuraPdfSegmentos` con su propio parámetro
 *   `getDocument` (eeffSegmentacionColumnas.js).
 * @returns {Promise<{campos:{t_s:number|null,t_c:number|null,t_gastos:number|null,
 *   t_op:number|null}, advertencias:Array<{tipo:string,mensaje:string,campo?:string}>,
 *   verificadoContraTexto:boolean, segmentosDisponibles:string[]}>}
 */
export async function verificarEeffSegmentado(lectura, {
  etiquetaSegmento,
  anioEstudio, // eslint-disable-line no-unused-vars -- parte del contrato (Task 6 lo pasa), sin uso propio todavía: no hay columna por AÑO que cruzar aquí (ver cabecera de eeffSegmentacionParser.js).
  archivo = null,
  toleranciaCuadre = TOLERANCIA_CUADRE,
  extraerEstructura = extraerEstructuraPdfSegmentos,
} = {}) {
  const l = lectura || {};
  const segmentos = Array.isArray(l.segmentos) ? l.segmentos : [];
  const totalCompania = l.totalCompania || {};

  const segmento = segmentos.find((s) => s && s.etiqueta === etiquetaSegmento);
  if (!segmento) {
    throw new Error(
      `verificarEeffSegmentado: no existe el segmento «${etiquetaSegmento}» en la lectura. `
      + `Segmentos disponibles: ${segmentos.map((s) => s.etiqueta).join(', ') || '(ninguno)'}.`,
    );
  }

  const advertencias = [];

  /* ── 1. t_gastos / t_op del segmento elegido ── */
  const tGastos = gastosOperativosDe({
    ventas: segmento.t_gastos_ventas,
    administracion: segmento.t_gastos_administracion,
  });
  const tOp = utilidadOperacionalDe({
    ventas: segmento.t_s, costo: segmento.t_c, gastos: tGastos,
  });

  const campos = {
    t_s: segmento.t_s ?? null,
    t_c: segmento.t_c ?? null,
    t_gastos: tGastos,
    t_op: tOp,
  };

  /* ── 2/3. Verificación por columna contra la geometría del PDF ──
     Solo con capa de texto, igual que `verificarEeff` hoy: sin ella no hay geometría que
     construir y no se afirma haber comprobado nada. */
  const verificadoContraTexto = Boolean(l.textoPdf && String(l.textoPdf).trim());

  if (verificadoContraTexto) {
    const etiquetasSegmentos = segmentos.map((s) => s && s.etiqueta).filter(Boolean);
    const estructura = await extraerEstructura(archivo, etiquetasSegmentos);
    const rotulos = segmento.rotulos || {};

    RUBROS_VERIFICABLES.forEach((campo) => {
      const valor = segmento[campo];
      if (valor === null || valor === undefined) return;
      const rotulo = rotulos[campo] || '';

      const donde = ubicacionDeCifraSegmento(estructura, {
        rotulo, valor, etiqueta: etiquetaSegmento,
      });

      if (donde.veredicto !== 'coincide') {
        advertencias.push({
          tipo: 'cifra-no-coincide-con-columna-segmento',
          campo,
          mensaje: mensajeDeColumna(campo, valor, etiquetaSegmento, donde),
        });
      }
    });
  }

  /* ── 4. Cuadre: la suma de TODOS los segmentos contra el total de la compañía ──
     Por rubro, no en bruto: un segmento de más en t_s y uno de menos en t_c, en la misma
     magnitud, no deben cancelarse y esconder un descuadre real. */
  RUBROS_CUADRE.forEach((campo) => {
    /* Solo si el documento imprime el total de ese rubro: `Number(null)` es 0 —finito—, y
       sin este corte un documento sin columna de total (o un `total_compania` vacío del
       modelo) "descuadraba" cada rubro contra un total de 0. */
    const bruto = totalCompania[campo];
    if (bruto === null || bruto === undefined) return;
    const suma = segmentos.reduce((acc, s) => acc + (Number(s && s[campo]) || 0), 0);
    const total = Number(bruto);
    if (!Number.isFinite(total)) return;

    const escala = Math.max(Math.abs(total), 1);
    const diferencia = Math.abs(suma - total);
    if (diferencia > escala * toleranciaCuadre) {
      advertencias.push({
        tipo: 'descuadre-segmentos',
        campo,
        mensaje: `«${ETIQUETA_RUBRO[campo]}»: la suma de los segmentos (${fmtCop(suma)}) no `
          + `coincide con el total de la compañía que imprime el documento (${fmtCop(total)}); `
          + `la diferencia es ${fmtCop(diferencia)}. No se bloqueó nada; verifique el prorrateo `
          + 'entre segmentos contra el estado financiero.',
      });
    }
  });

  /* ── 5. Las etiquetas disponibles, para el selector de la UI ── */
  const segmentosDisponibles = segmentos.map((s) => s && s.etiqueta);

  return {
    campos,
    advertencias,
    verificadoContraTexto,
    segmentosDisponibles,
  };
}
