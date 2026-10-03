'use strict';

/* Store externo (sin Context, sin Redux) del gasto de IA del estudio abierto.
   Vive fuera del árbol de React a propósito: los 9 puntos de llamada a IA son
   funciones de servicio puras, desperdigadas en frontend/src/services/, sin acceso al
   estado de App.jsx — prop-drilling un callback hasta cada una sería más invasivo que
   un módulo plano que cualquiera importa directo. App.jsx se suscribe una sola vez para
   reflejar este store en `study.gastoIA` (persistencia) y para sembrarlo al abrir o
   cerrar un estudio (ver useGastoIA/cargarEstudio). */
import { useSyncExternalStore } from 'react';
import { costoUSD } from './costoIA.js';

let estado = { totalUSD: 0, operaciones: [] };
const listeners = new Set();

function emitir() {
  listeners.forEach((l) => l());
}

/* Traduce las dos formas de respuesta que puede traer `datosRespuesta`:
   1) Forma Anthropic (nativa de /api/claude, o namespaced bajo `_uso` en extraer-rut/
      extraer-camara/análisis de sector): { model, usage:{input_tokens,output_tokens},
      proveedor? }. Si vino del fallback a Gemini, `model` y `proveedor` ya lo dicen.
   2) Forma Gemini cruda (/api/gemini): { usageMetadata:{promptTokenCount,
      candidatesTokenCount} } — Gemini no ecoa qué modelo respondió, así que requiere
      `modeloExplicito` (el que el propio llamador ya puso en el request).
   Sin ninguna de las dos formas, devuelve null: nunca lanza, para no tumbar una
   operación de negocio que sí tuvo éxito (y para no romper los tests existentes, que
   mockean respuestas sin `usage`/`usageMetadata`). */
function extraerUso(datosRespuesta, modeloExplicito) {
  const d = datosRespuesta || {};
  if (d.usage) {
    return {
      /* `model` es la clave nativa de Anthropic (y de la respuesta traducida del
         fallback); `modelo` es la clave española que usan los `_uso` namespaced que
         arma este mismo backend (extraer-rut, extraer-camara, análisis de sector). */
      modelo: d.model || d.modelo || modeloExplicito || 'desconocido',
      proveedor: d.proveedor || 'anthropic',
      tokensEntrada: d.usage.input_tokens || 0,
      tokensSalida: d.usage.output_tokens || 0,
    };
  }
  if (d.usageMetadata) {
    return {
      modelo: d.modelo || modeloExplicito || 'desconocido',
      proveedor: 'gemini',
      tokensEntrada: d.usageMetadata.promptTokenCount || 0,
      tokensSalida: d.usageMetadata.candidatesTokenCount || 0,
    };
  }
  return null;
}

/** Punto único de instrumentación: callable directo desde cualquier servicio, sin props. */
export function registrarUsoIA(etiqueta, datosRespuesta, modeloExplicito) {
  try {
    const uso = extraerUso(datosRespuesta, modeloExplicito);
    if (!uso || (!uso.tokensEntrada && !uso.tokensSalida)) return;
    const costo = costoUSD(uso.modelo, uso.tokensEntrada, uso.tokensSalida);
    estado = {
      totalUSD: estado.totalUSD + costo,
      operaciones: [...estado.operaciones, { etiqueta, ...uso, costoUSD: costo, ts: Date.now() }],
    };
    emitir();
  } catch (err) {
    console.error('[gastoIA] no se pudo registrar el uso de IA', err);
  }
}

/** Siembra el store al abrir/restaurar un estudio, o lo vacía si no hay acumulado previo. */
export function cargarEstudio(gastoIAPrevio) {
  estado = (gastoIAPrevio && typeof gastoIAPrevio.totalUSD === 'number')
    ? { totalUSD: gastoIAPrevio.totalUSD, operaciones: Array.isArray(gastoIAPrevio.operaciones) ? gastoIAPrevio.operaciones : [] }
    : { totalUSD: 0, operaciones: [] };
  emitir();
}

export function suscribir(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function obtenerEstado() {
  return estado;
}

export function useGastoIA() {
  return useSyncExternalStore(suscribir, obtenerEstado, obtenerEstado);
}
