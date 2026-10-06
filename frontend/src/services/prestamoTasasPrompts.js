/* ─────────────────────────────────────────────────────────────────────────────
   prestamoTasasPrompts.js — Fase 4 de los estudios tipo préstamo: construcción del
   prompt de búsqueda (PRIME/SOFR/TMC/Moody's/Riesgo País) y parseo de la respuesta.

   On-demand por estudio (lo dispara el botón "Buscar con IA" del componente nuevo), no un
   cron — a diferencia de `functions/analisisMercadoPrompts.js`, que es su precedente más
   cercano pero corre una vez al mes para el año en curso. Si el estudio tiene muchas fechas
   de pacto distintas, el troceo en varias llamadas es responsabilidad de quien llama
   (`construirPromptTasasPrestamo` arma un prompt para la lista que se le dé, sin opinar
   sobre cuántas fechas es razonable pedir de una vez).

   El criterio de "confiable" nunca es un asunto del LLM: por decisión explícita del
   usuario, la búsqueda trae el dato, el código decide qué tan confiable es (según si
   `groundingChunks`/`webSearchQueries` confirman que hubo una búsqueda real) y si la serie
   existía para esa fecha (`serieDisponible`, nunca lo que la IA diga de sí misma).
   ───────────────────────────────────────────────────────────────────────────── */

import { extraerJSON } from './comparablesEngine.js';
import { serieDisponible } from './prestamoTasasCalculo.js';

const SERIES = ['prime', 'sofr', 'tmc', 'moodys'];

export function construirPromptTasasPrestamo(fechasPacto, anioInforme) {
  const listaFechas = (fechasPacto || []).map((f) => `- ${f}`).join('\n');
  return `Eres un asistente de investigación de precios de transferencia. Para cada una de
las siguientes fechas de pacto de un préstamo intercompañía, busca el valor real y publicado
de estas 4 tasas/series de referencia:

- PRIME: Bank Prime Loan Rate de Estados Unidos (Reserva Federal, H.15, serie FRED
  RIFSPBLPNA), tasa diaria vigente en la fecha.
- SOFR: Secured Overnight Financing Rate, promedio mensual del mes que contiene la fecha.
  Esta serie no existe antes del 2 de abril de 2018 — si la fecha es anterior, OMITE la
  clave "sofr" para esa fecha, nunca pongas un 0 ni una estimación.
- TMC: Tasa de Interés Monetaria (tasa de intervención) del Banco de la República de
  Colombia, promedio mensual del mes que contiene la fecha.
- MOODY'S: Moody's Seasoned Aaa Corporate Bond Yield, valor más cercano a la fecha.

Fechas de pacto a buscar:
${listaFechas}

Además, busca una sola vez el Riesgo País (Country Risk Premium) de Colombia para el año
${anioInforme}, según la publicación de Damodaran (NYU Stern, pages.stern.nyu.edu/~adamodar).

Reglas estrictas:
- NO inventes, redondees ni estimes ningún valor que no encuentres publicado. Si no
  encuentras un dato real para una fecha o serie, omite esa clave por completo.
- Responde ÚNICAMENTE con un objeto JSON, sin texto antes ni después, con esta forma exacta:

{
  "porFecha": {
    "<fecha ISO>": { "prime": <número>, "sofr": <número>, "tmc": <número>, "moodys": <número>,
      "fuentes": { "prime": "<url>", "sofr": "<url>", "tmc": "<url>", "moodys": "<url>" } }
  },
  "riesgoPais": { "valor": <número>, "fuenteUrl": "<url>" }
}

Los valores van en porcentaje (ej. 3.25 significa 3,25 %), nunca en fracción.`;
}

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Convierte la respuesta cruda de `consultarGeminiConBusqueda` en la forma que persiste
 * `estudio.tasasPrestamo`: cada valor con `{valor, confiable, fuenteUrl, disponible}`.
 *
 * `confiable` es el mismo criterio OR verificado en `comparablesEngine.js` para este
 * modelo: `groundingChunks.length>0 || webSearchQueries.length>0`. `disponible` lo decide
 * `serieDisponible` a partir de la fecha, nunca lo que la IA haya mandado — si la IA
 * devuelve un `sofr` para una fecha anterior a abril de 2018 (no debería, pero puede
 * equivocarse), se descarta: `valor` sale `null` y `disponible:false` igual.
 */
export function parsearRespuestaTasasPrestamo(texto, groundingChunks, webSearchQueries) {
  const datos = extraerJSON(texto);
  const confiable = Boolean((groundingChunks || []).length) || Boolean((webSearchQueries || []).length);

  const porFecha = {};
  Object.entries(datos.porFecha || {}).forEach(([fecha, valores]) => {
    const fuentes = valores?.fuentes || {};
    const fila = {};
    SERIES.forEach((serie) => {
      const disponible = serieDisponible(serie, fecha);
      const crudo = valores?.[serie];
      fila[serie] = {
        valor: disponible && esNumero(crudo) ? crudo : null,
        confiable: disponible && esNumero(crudo) ? confiable : false,
        fuenteUrl: (disponible && fuentes[serie]) || null,
        disponible,
      };
    });
    porFecha[fecha] = fila;
  });

  const rp = datos.riesgoPais || {};
  const riesgoPais = {
    valor: esNumero(rp.valor) ? rp.valor : null,
    confiable: esNumero(rp.valor) ? confiable : false,
    fuenteUrl: rp.fuenteUrl || null,
  };

  return { porFecha, riesgoPais };
}
