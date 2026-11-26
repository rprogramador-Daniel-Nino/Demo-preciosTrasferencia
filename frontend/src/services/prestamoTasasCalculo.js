/* ─────────────────────────────────────────────────────────────────────────────
   prestamoTasasCalculo.js — Fase 4 de los estudios tipo préstamo: núcleo matemático
   del método PC (Precio Comparable) sobre tasas de interés.

   Código puro, sin IA: la búsqueda de las tasas crudas (PRIME/SOFR/TMC/Moody's/Riesgo
   País) vive en `prestamoTasasPrompts.js` y nunca entra aquí — por decisión explícita del
   usuario, la aritmética nunca se delega al LLM.

   Todas las tasas de este archivo son PORCENTAJES (p.ej. 3.25 significa 3,25 %), igual
   que el campo `study.prime` ya existente (`IngestaCifras.jsx`) — la conversión a
   fracción para la fórmula de composición es interna a `tasaAjustada`.
   ───────────────────────────────────────────────────────────────────────────── */

import { cuartilInterpolado } from './ajusteRangoCapitalTrabajo.js';

/* SOFR empezó a publicarse el 2 de abril de 2018 (New York Fed) — un préstamo pactado
   antes de esa fecha no tiene con qué comparar esa serie, y no debe tratarse como un
   dato faltante por error de captura. */
export const FECHA_INICIO_SOFR = '2018-04-02';

export function serieDisponible(serie, fechaIso) {
  if (serie === 'sofr') return !fechaIso || fechaIso >= FECHA_INICIO_SOFR;
  return true;
}

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Tasa Ajustada = (1+Ref) * (1+Moody's) * (1+RiesgoPaís) - 1, compuesta (no sumada).
 * Entra y sale en porcentaje. `null` si falta cualquiera de las tres tasas.
 */
export function tasaAjustada(refPct, moodysPct, riesgoPaisPct) {
  if (!esNumero(refPct) || !esNumero(moodysPct) || !esNumero(riesgoPaisPct)) return null;
  const ref = refPct / 100;
  const moodys = moodysPct / 100;
  const riesgo = riesgoPaisPct / 100;
  return ((1 + ref) * (1 + moodys) * (1 + riesgo) - 1) * 100;
}

/* El trío de tasas de referencia depende de si el contribuyente colombiano es deudor
   (préstamo pasivo, recibe el dinero) o acreedor (préstamo activo, lo presta) — confirmado
   contra los libros de Excel reales que usan los contadores del despacho para calcular el
   rango intercuartil ("Análisis de tasas ALCIAUTOS 2025.xlsx", "...SUNGROUW_2025.xlsx"):
   los préstamos pasivos usan PRIME+SOFR+TMC, los activos PRIME+CIRR+LIBOR. */
export const TRIOS_POR_DIRECCION = {
  pasivo: ['prime', 'sofr', 'tmc'],
  activo: ['prime', 'cirr', 'libor'],
};

/** Trío de series para una dirección dada; cae a `pasivo` si la dirección es `null` o
 *  desconocida — es el único caso real cubierto hasta ahora (Autoland). */
export function trioDeDireccion(direccion) {
  return TRIOS_POR_DIRECCION[direccion] || TRIOS_POR_DIRECCION.pasivo;
}

/** Si el riesgo país aplica para esta dirección: solo en pasivo (Colombia es el país
 *  deudor). En activo se omite, por decisión documentada en los papeles de trabajo reales
 *  (Alciautos: "No se toma Riesgo País según indicaciones"). */
export function aplicaRiesgoPais(direccion) {
  return direccion !== 'activo';
}

/**
 * Arma los totales ajustados de cada serie del trío (por defecto PRIME/SOFR/TMC, para no
 * romper el comportamiento de un préstamo pasivo) para una fecha de pacto, a partir de las
 * tasas crudas de esa fecha (`{prime:{valor}, sofr:{valor}, tmc:{valor}, cirr:{valor},
 * libor:{valor}, moodys:{valor}}`, la forma que persiste `estudio.tasasPrestamo.porFecha[fecha]`)
 * y el Riesgo País del estudio (un solo número, igual para todas las fechas — `0` cuando no
 * aplica, nunca `null`: `tasaAjustada` trataría `null` como "falta el dato" y anularía todo
 * el cálculo). Si una serie del trío no vino (SOFR ausente antes de abril de 2018, o
 * cualquier otra sin capturar aún), su total sale `null` — no se inventa un cero.
 */
export function totalesPorFecha(tasasFecha, riesgoPaisPct, series = TRIOS_POR_DIRECCION.pasivo) {
  const t = tasasFecha || {};
  const moodys = t.moodys?.valor;
  const calc = (serie) => tasaAjustada(t[serie]?.valor, moodys, riesgoPaisPct);
  return Object.fromEntries(series.map((serie) => [serie, calc(serie)]));
}

/**
 * Rango intercuartil (P25/mediana/P75, por interpolación lineal — `cuartilInterpolado`,
 * la misma función ya usada por el motor de comparables) sobre los totales no nulos de
 * `totalesPorFecha`. `null` si ninguno es válido.
 */
export function rangoIntercuartil(totales) {
  const valores = Object.values(totales || {}).filter(esNumero).sort((a, b) => a - b);
  if (!valores.length) return null;
  return {
    minimo: cuartilInterpolado(valores, 0.25),
    mediana: cuartilInterpolado(valores, 0.5),
    superior: cuartilInterpolado(valores, 0.75),
    n: valores.length,
  };
}
