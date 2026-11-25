'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   politicaModelos.js — Qué puede pedirle el navegador al proxy de IA.

   POR QUÉ. `/api/claude` y `/api/gemini` reenviaban el cuerpo tal cual: un usuario
   autenticado podía pedir cualquier modelo (los más caros) con cualquier
   `max_tokens`, y en Gemini el nombre del modelo iba sin validar dentro de la URL.
   Aquí se fija la lista de familias que la app usa de verdad y un techo de salida
   holgado (el llamador más grande del frontend pide 4000).

   Pura y COMPARTIDA por `server.js` y `functions/index.js`, como fallbackGemini.js
   y verificarSesion.js. El PHP de cPanel no la tiene.
   ───────────────────────────────────────────────────────────────────────────── */

const MODELO_CLAUDE_DEFAULT = 'claude-haiku-4-5-20251001';
const MAX_TOKENS_TECHO = 16000;

/* Haiku y Sonnet: el reparto por costo de CLAUDE.md. Opus/Fable quedan fuera. */
const PATRON_CLAUDE = /^claude-(haiku|sonnet)-[a-z0-9.-]+$/;
/* Solo la gama flash, que es la que lee documentos. El patrón también impide meter
   `/`, `:` o `..` en la URL de generativelanguage. */
const PATRON_GEMINI = /^gemini-[0-9][0-9a-z.]*-flash(-[0-9a-z.-]+)?$/;

/** Normaliza el cuerpo para Anthropic. Devuelve { body } o { error } (400). */
function politicaClaude(entrada) {
  const body = { ...(entrada || {}) };
  if (!body.model) body.model = MODELO_CLAUDE_DEFAULT;
  if (typeof body.model !== 'string' || !PATRON_CLAUDE.test(body.model)) {
    return { error: `Modelo no permitido por el proxy: ${String(body.model).slice(0, 60)}` };
  }
  const max = Number(body.max_tokens);
  if (!Number.isFinite(max) || max <= 0) body.max_tokens = 4000;
  else if (max > MAX_TOKENS_TECHO) body.max_tokens = MAX_TOKENS_TECHO;
  return { body };
}

/** Valida el modelo de Gemini. Devuelve { modelo } o { error } (400). */
function politicaGemini(modelo, porDefecto) {
  const elegido = modelo || porDefecto;
  if (typeof elegido !== 'string' || !PATRON_GEMINI.test(elegido)) {
    return { error: `Modelo no permitido por el proxy: ${String(elegido).slice(0, 60)}` };
  }
  return { modelo: elegido };
}

module.exports = {
  politicaClaude, politicaGemini, MODELO_CLAUDE_DEFAULT, MAX_TOKENS_TECHO,
};
