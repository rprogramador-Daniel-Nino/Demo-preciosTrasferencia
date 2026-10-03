// functions/analisisSectorActualizar.js
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const {
  normalizarActividad,
  claveActividad,
  necesitaResumenActividad,
  recortarActividad,
  construirPromptResumenActividad,
  parsearRespuestaResumenActividad,
  construirPromptBusquedaSector,
  parsearRespuestaBusquedaSector,
  filtrarConfiables,
  construirPromptRedaccionSector,
  parsearRespuestaRedaccionSector,
  armarEntradaAnio,
} = require('./analisisSectorPrompts');
const { redactarConFallback } = require('./redaccionConFallback');
const { asegurarAppFirebasePorDefecto } = require('./firebaseAdmin');

asegurarAppFirebasePorDefecto();

/* NO usar 'gemini-2.0-flash' (retirado, 404) ni 'gemini-3.5-flash': verificado en vivo
   el 2026-08-05 que este último nunca devuelve `groundingMetadata` (ni siquiera
   `webSearchQueries`) con `tools:[{google_search:{}}]` + salida JSON en texto, así que
   `filtrarConfiables` descarta todo y `actualizarAnalisisSector` falla el 100% de las
   corridas con "Ningún dato del sector trajo confirmación de búsqueda esta corrida".
   'gemini-3-flash-preview' sí devuelve `webSearchQueries` de forma consistente (mismo
   modelo con el que se probó en vivo el fix del 2026-08-04, ver commit ef79aa6). */
const GEMINI_MODEL = 'gemini-3-flash-preview';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

/** La `actividad` que llega del estudio a veces es la descripción completa del
 *  objeto social (varios cientos de caracteres, con la matriz, los activos y
 *  los riesgos), no una etiqueta corta de sector. Buscarla tal cual con
 *  `google_search` no da grounding —ver el comentario junto a
 *  LARGO_ACTIVIDAD_CORTA en analisisSectorPrompts.js—, así que primero se
 *  reduce a una frase de sector con un llamado liviano a Gemini (sin
 *  herramienta de búsqueda). Si ese llamado falla, se recorta sin IA: sigue
 *  siendo mejor una frase corta imperfecta que la descripción completa. */
/** @returns {Promise<{actividadBusqueda:string, uso:object|null}>} `uso` es null cuando
 *  no hubo llamada a IA (actividad ya corta) o cuando la llamada falló y se recortó sin
 *  IA — en ninguno de los dos casos hay tokens que cobrar. */
async function resumirActividad(geminiApiKey, actividad) {
  if (!necesitaResumenActividad(actividad)) return { actividadBusqueda: actividad, uso: null };
  try {
    const prompt = construirPromptResumenActividad(actividad);
    const respuesta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await respuesta.json();
    const candidato = data && data.candidates && data.candidates[0];
    if (!respuesta.ok || !candidato) {
      throw new Error('Gemini no devolvió una respuesta usable: ' + JSON.stringify(data).slice(0, 500));
    }
    const texto = (candidato.content.parts || []).map((p) => p.text || '').join('');
    return {
      actividadBusqueda: parsearRespuestaResumenActividad(texto),
      uso: { modelo: GEMINI_MODEL, proveedor: 'gemini', usageMetadata: data.usageMetadata },
    };
  } catch (err) {
    console.error('No se pudo resumir la actividad con IA, se recorta sin IA:', err.message);
    return { actividadBusqueda: recortarActividad(actividad), uso: null };
  }
}

/** @returns {Promise<{datos:object, uso:object}>} */
async function buscarDatosSector(geminiApiKey, actividad, year) {
  const prompt = construirPromptBusquedaSector(actividad, year);
  const respuesta = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    }
  );
  const data = await respuesta.json();
  const candidato = data && data.candidates && data.candidates[0];
  if (!respuesta.ok || !candidato) {
    throw new Error('Gemini no devolvió una respuesta usable: ' + JSON.stringify(data).slice(0, 500));
  }
  const texto = (candidato.content.parts || []).map((p) => p.text || '').join('');
  /* groundingChunks nunca llega con este modelo + google_search + JSON en texto
     (confirmado en vivo) — webSearchQueries es el campo que sí confirma que hubo
     una búsqueda real. Ver el comentario en analisisSectorPrompts.js. */
  const webSearchQueries = (candidato.groundingMetadata && candidato.groundingMetadata.webSearchQueries) || [];
  return {
    datos: parsearRespuestaBusquedaSector(texto, webSearchQueries),
    uso: { modelo: GEMINI_MODEL, proveedor: 'gemini', usageMetadata: data.usageMetadata },
  };
}

/* Con respaldo en Gemini, por lo mismo que en el análisis de mercado: esta función llama a
   Anthropic directamente y no pasa por `/api/claude`, así que se quedaba sin el fallback del
   proxy. Aquí duele más que en el cron mensual, porque esta corre por demanda: con el tope
   de uso alcanzado, la primera actividad nueva del día se quedaba sin análisis de sector. */
/** @returns {Promise<{narrativa:object, uso:object}>} */
async function redactarSector(claudeApiKey, geminiApiKey, datosConfiables, actividad, year) {
  const { texto, modelo, proveedor, usage } = await redactarConFallback({
    prompt: construirPromptRedaccionSector(datosConfiables, actividad, year),
    claudeApiKey, geminiApiKey,
    modeloClaude: CLAUDE_MODEL, modeloGemini: GEMINI_MODEL,
    /* Los 4096 por defecto de `redactarConFallback` no alcanzan desde que
       `construirPromptRedaccionSector` exige mínimos por apartado: 200+450+350+350+450 son
       1.800 palabras de piso, que en español pasan de 3.000 tokens antes de contar el JSON,
       las etiquetas <p> y las fuentes citadas. Con 4096 la respuesta se cortaba a media
       redacción y `extraerJSON` fallaba con «llaves sin cerrar» — la corrida entera se
       perdía con un 502, verificado en vivo el 2026-08-13. */
    maxTokens: 12288,
  });
  return { narrativa: parsearRespuestaRedaccionSector(texto), uso: { modelo, proveedor, usage } };
}

/** Corrida completa para una actividad y un año: busca, redacta y guarda bajo
 *  `analisisSector/{clave}.porAnio.{year}`, con `merge: true` para no pisar
 *  otros años ya guardados para la misma actividad. Si Gemini o Claude
 *  fallan, la excepción se propaga sin escribir nada. */
async function actualizarAnalisisSector({ geminiApiKey, claudeApiKey, actividad, year }) {
  const actividadNormalizada = normalizarActividad(actividad);
  if (!actividadNormalizada) {
    throw new Error('La actividad está vacía: no hay nada que buscar ni bajo qué clave guardarlo.');
  }
  const clave = claveActividad(actividadNormalizada);

  const { actividadBusqueda, uso: usoResumen } = await resumirActividad(geminiApiKey, actividad);
  const { datos, uso: usoBusqueda } = await buscarDatosSector(geminiApiKey, actividadBusqueda, year);
  const datosConfiables = filtrarConfiables(datos);
  const hayAlgunDato =
    datosConfiables.datosClaveTabla.length ||
    datosConfiables.datosComportamiento.length ||
    datosConfiables.datosComercioExterior.length ||
    datosConfiables.datosProyeccion.length;
  if (!hayAlgunDato) {
    throw new Error('Ningún dato del sector trajo confirmación de búsqueda esta corrida.');
  }

  const { narrativa, uso: usoRedaccion } = await redactarSector(claudeApiKey, geminiApiKey, datosConfiables, actividad, year);

  const ahora = Timestamp.now();
  const entrada = armarEntradaAnio({ datosVerificados: datosConfiables, narrativa, ahora });

  const db = getFirestore();
  await db.doc(`analisisSector/${clave}`).set({
    actividadOriginal: actividad,
    actividadNormalizada,
    porAnio: { [String(year)]: entrada },
  }, { merge: true });

  /* Para el contador de gasto en IA del frontend (ver frontend/src/services/gastoIA.js):
     esta corrida hace hasta 3 llamadas a IA server-a-server que el frontend nunca ve
     directamente, así que su costo viaja aparte en `_uso`. */
  const usos = [];
  if (usoResumen) usos.push({ etapa: 'resumen actividad', ...usoResumen });
  usos.push({ etapa: 'búsqueda sector', ...usoBusqueda });
  usos.push({ etapa: 'redacción', ...usoRedaccion });

  return { clave, entrada, _uso: usos };
}

module.exports = { actualizarAnalisisSector };
