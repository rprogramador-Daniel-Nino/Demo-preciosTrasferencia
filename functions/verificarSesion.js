'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   verificarSesion.js — Confirma que quien llama a las funciones de IA es un
   usuario logueado de la app, no un script que descubrió la URL de la función.

   POR QUÉ HACE FALTA. El login de Firebase Auth protege la INTERFAZ —`App.jsx`
   no renderiza nada sin `usuario`—, pero `claude`, `gemini`, `extraerRut`,
   `extraerCamara` y `generarAnalisisSector` viven en una dirección aparte
   (`https://us-central1-<proyecto>.cloudfunctions.net/<función>`) que nunca
   comprobaba sesión: solo el método HTTP. Alguien con esa URL podía llamarla sin
   loguearse nunca y sin dejar ningún rastro de qué usuario lo hizo, gastando la
   cuota de Anthropic/Gemini del proyecto.

   CÓMO VERIFICA. El frontend manda el ID token de Firebase Auth del usuario activo
   en `Authorization: Bearer <token>` — ver frontend/src/services/axiosAutenticado.js,
   que lo adjunta una sola vez para toda llamada a /api/* o a *.cloudfunctions.net.
   Verificar la firma de ese token contra las llaves públicas de Google NO necesita
   credenciales de servicio propias —por eso `initializeApp` alcanza solo con el
   `projectId`—; local (`server.js`) puede recibir tokens de producción O de pruebas
   (ver `resolverEntorno` en frontend/src/services/firebase.js), así que se intenta
   contra los dos proyectos conocidos antes de rechazar.

   NUNCA LANZA: un token ausente, vencido o mal formado cuenta como "no
   autenticado", no como error del servidor — la función responde 401, no 500.

   ES COMPARTIDO por `server.js` y `functions/index.js`, mismo patrón que
   `fallbackGemini.js`: una sola definición en vez de que las dos implementaciones
   de JavaScript diverjan. La versión PHP de cPanel sigue siendo un port a mano.
   ───────────────────────────────────────────────────────────────────────────── */

const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

/* Los dos proyectos reales: local puede apuntar a cualquiera de los dos (ver
   CLAVE_ENTORNO_LOCAL en firebase.js), y una función ya desplegada solo recibirá
   tokens del suyo, así que probar el otro no cuesta nada extra en ese caso. */
const PROYECTOS_VALIDOS = ['precios-trasnferencia', 'precios-trasnferencia-pruebas'];

/* Una función DESPLEGADA solo acepta tokens de su propio proyecto: antes, producción
   aceptaba también los de pruebas, y una cuenta creada en pruebas gastaba la key de
   producción. Cloud Functions publica su proyecto en GCLOUD_PROJECT; local
   (`server.js`) no lo trae y sigue aceptando los dos, como antes. */
function proyectosAceptados(entorno = process.env) {
  const propio = entorno.GCLOUD_PROJECT || entorno.GOOGLE_CLOUD_PROJECT || '';
  return PROYECTOS_VALIDOS.includes(propio) ? [propio] : PROYECTOS_VALIDOS;
}

/* Los mismos dominios que `firestore.rules` (función `esMiembro`) y que
   DOMINIOS_PERMITIDOS en frontend/src/services/firebase.js. La firma del token solo
   prueba que la cuenta existe en Auth, no que sea del despacho: sin esto, cualquier
   cuenta de Google que lograra entrar a Auth usaba el proxy de IA. */
const DOMINIOS_PERMITIDOS = ['crconsultorescolombia.com', 'scientia-legal.com'];

/** true si el token decodificado es de una cuenta verificada de un dominio permitido. */
function cuentaPermitida(claims) {
  if (!claims || typeof claims !== 'object') return false;
  if (claims.email_verified !== true) return false;
  const correo = String(claims.email || '').trim().toLowerCase();
  return DOMINIOS_PERMITIDOS.some((d) => correo.endsWith('@' + d));
}

function appParaProyecto(projectId) {
  const nombre = 'auth-' + projectId;
  const existente = getApps().find((a) => a.name === nombre);
  if (existente) return existente;
  return initializeApp({ projectId }, nombre);
}

/** Verificación real contra Firebase: intenta cada proyecto aceptado hasta que
 *  uno acepte el token. Devuelve los claims decodificados, o null. */
async function verificarConFirebase(token) {
  for (const projectId of proyectosAceptados()) {
    try {
      return await getAuth(appParaProyecto(projectId)).verifyIdToken(token);
    } catch {
      /* no es de este proyecto, o el token ya venció: probar el siguiente */
    }
  }
  return null;
}

/** El token de `Authorization: Bearer <token>`, o cadena vacía si no viene o trae
 *  otro esquema. */
function tokenDeLaPeticion(req) {
  const cabecera = (req.get ? req.get('authorization') : (req.headers && req.headers.authorization)) || '';
  return cabecera.startsWith('Bearer ') ? cabecera.slice('Bearer '.length).trim() : '';
}

/** true si la petición trae un ID token de Firebase Auth válido, de una cuenta
 *  verificada de un dominio del despacho.
 *
 *  `verificar` es inyectable para poder probar la extracción de la cabecera y la
 *  lógica de aceptación/rechazo sin llamar a Firebase de verdad (ver
 *  verificarSesion.test.js); por defecto verifica contra los proyectos reales. */
async function peticionAutenticada(req, verificar = verificarConFirebase) {
  const token = tokenDeLaPeticion(req);
  if (!token) return false;
  try {
    return cuentaPermitida(await verificar(token));
  } catch {
    return false;
  }
}

module.exports = {
  peticionAutenticada, tokenDeLaPeticion, cuentaPermitida, proyectosAceptados,
  PROYECTOS_VALIDOS, DOMINIOS_PERMITIDOS,
};
