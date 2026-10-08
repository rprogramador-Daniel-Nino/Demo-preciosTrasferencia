/* ─────────────────────────────────────────────────────────────────────────────
   jurisdiccionesNoCooperantes.js — Artículo 260-7 del Estatuto Tributario: jurisdicciones
   no cooperantes o de baja o nula imposición (y regímenes tributarios preferenciales).

   La lista por defecto es la del Artículo 1.2.2.5.1. del Decreto 1625 de 2016 (adicionado
   por el Decreto 2120 de 2017), tal como la trajo el usuario el 2026-10-09. Vive aquí como
   respaldo embebido —para que el sistema nunca se quede sin ninguna lista— pero la fuente
   de verdad en producción es la colección de Firestore `jurisdiccionesNoCooperantes`
   (`jurisdiccionesNoCooperantesRepo.js`): el Gobierno Nacional puede actualizar esta lista
   por resolución, y una jurisdicción que sale de ella se marca `activo:false` en vez de
   borrarse, para conservar el rastro de que alguna vez aplicó.
   ───────────────────────────────────────────────────────────────────────────── */

export const JURISDICCIONES_NO_COOPERANTES_DEFAULT = [
  'Archipiélago de Svalbard',
  'Colectividad Territorial de San Pedro y Miguelón',
  'Estado de Kuwait',
  'Estado de Qatar',
  'Estado Independiente de Samoa Occidental',
  'Isla Queshm',
  'Islas Pitcairn, Henderson, Ducie y Oeno',
  'Islas Salomón',
  'Labuán',
  'Macao',
  'Mancomunidad de las Bahamas',
  'Reino de Bahréin',
  'Reino Hachemí de Jordania',
  'República Cooperativa de Guyana',
  'República de Angola',
  'República de Cabo Verde',
  'República de las Islas Marshall',
  'República de Liberia',
  'República de Maldivas',
  'República de Nauru',
  'República de Trinidad y Tobago',
  'República de Vanuatu',
  'República del Yemen',
  'Santa Elena, Ascensión y Tristán de Cunha',
  'Sultanía de Omán',
].map((nombre) => ({ nombre, activo: true }));

const normalizar = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/**
 * ¿`pais` es una jurisdicción no cooperante activa según `jurisdicciones`?
 *
 * La coincidencia es por INCLUSIÓN, no exacta: el analista llena `pais_vinc` con el nombre
 * de uso común ("Bahréin", "Omán", "Trinidad y Tobago"), nunca con la denominación legal
 * completa del Decreto ("Reino de Bahréin", "Sultanía de Omán", "República de Trinidad y
 * Tobago") — exigir coincidencia exacta habría dejado esta validación automática inútil en
 * la práctica, que es justo lo que el usuario pidió evitar al pedir el cruce automático en
 * vez de un checkbox manual.
 *
 * Una jurisdicción con `activo:false` (removida de la lista vigente por una resolución
 * posterior, pero conservada por su rastro histórico) nunca cuenta.
 */
export function esJurisdiccionNoCooperante(pais, jurisdicciones) {
  const clave = normalizar(pais);
  if (!clave || !Array.isArray(jurisdicciones)) return false;
  return jurisdicciones.some((j) => {
    if (!j || j.activo === false) return false;
    const claveJ = normalizar(j.nombre);
    return !!claveJ && (claveJ.includes(clave) || clave.includes(claveJ));
  });
}
