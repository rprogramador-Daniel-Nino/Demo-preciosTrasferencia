/**
 * Candado por etapas del wizard de un estudio. Las 6 pantallas (`contribuyente` →
 * `Operaciones` → `Estados financieros` → `comparables` → `auditoria` → `informe`) se
 * confirman en orden: cada una se desbloquea solo cuando la anterior queda confirmada, y
 * volver a editar una etapa ya confirmada revierte esa confirmación y las que le siguen.
 */

export const NUMERO_ETAPA = {
  contribuyente: 1,
  Operaciones: 2,
  'Estados financieros': 3,
  comparables: 4,
  auditoria: 5,
  informe: 6,
};

export const TOTAL_ETAPAS = 6;

/* Los mismos 5 campos que ya llevan el asterisco en el label de DatosContribuyente.jsx:
   Tipo de Estudio, Razón Social, NIT, Año Gravable, CIIU. */
export const CAMPOS_OBLIGATORIOS_CONTRIBUYENTE = ['tipo_estudio', 'ent', 'nit', 'anio', 'ciiu'];

export function contribuyenteCompleto(study) {
  if (!study) return false;
  return CAMPOS_OBLIGATORIOS_CONTRIBUYENTE.every((campo) => {
    const valor = study[campo];
    if (campo === 'anio') return Number(valor) > 0;
    return typeof valor === 'string' && valor.trim().length > 0;
  });
}

/* La actividad económica específica que detecta (o que edita a mano) el Motor de
   Comparables — es el campo del que depende la ponderación por actividad al puntuar
   candidatas, ver MotorComparables.jsx. */
export const CAMPOS_OBLIGATORIOS_MOTOR_COMPARABLES = ['actividad_especifica'];

export function motorComparableCompleto(study) {
  if (!study) return false;
  return CAMPOS_OBLIGATORIOS_MOTOR_COMPARABLES.every((campo) => {
    const valor = study[campo];
    return typeof valor === 'string' && valor.trim().length > 0;
  });
}

/* En un estudio de tipo préstamo, la etapa de Ingesta de Operaciones no se puede confirmar
   sin haber cargado la hoja de préstamos del Excel — es el único dato que sostiene la
   tabla "Préstamo con su vinculado" del informe. No aplica a estudios estándar/segmentación,
   donde esta etapa nunca exigió nada (ver el `numero === 2 && ...` en App.jsx). */
export function operacionesPrestamoCompleto(study) {
  if (!study) return false;
  return Array.isArray(study.prestamos) && study.prestamos.length > 0;
}

/* `finalizado` es una etiqueta manual y pegajosa (la pone el botón "Finalizar estudio"):
   una vez puesta, no se revierte aunque después se edite una etapa anterior y eso baje
   `etapaMaxima` — así lo pidió el usuario explícitamente. */
export function estadoDesdeEtapa(etapaMaxima, finalizado) {
  if (finalizado) return 'finalizado';
  return etapaMaxima > 0 ? 'en_progreso' : 'borrador';
}

export function etapaAlcanzable(etapaId, etapaMaxima) {
  const numero = NUMERO_ETAPA[etapaId];
  if (!numero) return true;
  return numero <= etapaMaxima + 1;
}

/* Estudios guardados antes de que existiera este candado no traen `etapaMaxima`: no deben
   amanecer bloqueados en la etapa 1 solo por no tener el campo nuevo, así que se asumen con
   todas las etapas alcanzadas. Los estudios realmente nuevos nacen con `etapaMaxima: 0` de
   forma explícita en `estudioEnBlanco()` (App.jsx) — ese 0 sí es un 0 de verdad y se respeta. */
export function etapaMaximaEfectiva(datos) {
  if (Number.isInteger(datos?.etapaMaxima)) {
    return Math.min(Math.max(datos.etapaMaxima, 0), TOTAL_ETAPAS);
  }
  return TOTAL_ETAPAS;
}
