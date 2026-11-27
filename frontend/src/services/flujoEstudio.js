/**
 * Candado por etapas del wizard de un estudio. Las 6 pantallas (`contribuyente` →
 * `Operaciones` → `Estados financieros` → `comparables` → `auditoria` → `informe`) se
 * confirman en orden: cada una se desbloquea solo cuando la anterior queda confirmada, y
 * volver a editar una etapa ya confirmada revierte esa confirmación y las que le siguen.
 */

import { serieDisponible } from './prestamoTasasCalculo.js';

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

/* Un valor de tasa "lleno" es un número real — ni `null`/`undefined` (sin capturar) ni un
   string vacío del input. No exige `confiable`: un valor traído por IA y marcado "sin
   verificar" sí cuenta para avanzar, el candado es sobre llenado, no sobre certeza. */
const valorDeTasaValido = (v) => typeof v === 'number' && Number.isFinite(v);

/* En un estudio de tipo préstamo, la etapa de Motor de Comparables no se puede confirmar
   sin que las 4 tasas (PRIME/SOFR/TMC/Moody's) de CADA fecha de pacto, más el Riesgo País
   del estudio, estén llenas — es el dato que sostiene las Tablas 6/18/19/20 del informe
   (Fase 4). SOFR se excluye del requisito cuando la fecha es anterior a `FECHA_INICIO_SOFR`
   (`prestamoTasasCalculo.js`): esa serie no existía, así que no se le puede pedir al
   analista un dato que no puede conseguir. */
/* Fechas únicas directo de `study.prestamos`, sin pasar por `fechasPactoUnicas`
   (`tablasPrestamoTasas.js`): esa exige `tipo_estudio === 'prestamo'` de puertas adentro
   (vía `tienePrestamos`), y este candado —igual que `operacionesPrestamoCompleto`, su
   precedente— debe depender solo de `study.prestamos`, no del tipo de estudio: es
   `motorComparableCompleto` quien decide SI aplicar este requisito según `tipo_estudio`. */
function fechasPactoDirecto(study) {
  if (!Array.isArray(study?.prestamos)) return [];
  const vistas = new Set();
  const fechas = [];
  study.prestamos.forEach((p) => {
    if (p?.fechaPacto && !vistas.has(p.fechaPacto)) { vistas.add(p.fechaPacto); fechas.push(p.fechaPacto); }
  });
  return fechas;
}

export function prestamoTasasCompleto(study) {
  if (!study || !valorDeTasaValido(study.tasasPrestamo?.riesgoPais?.valor)) return false;
  return fechasPactoDirecto(study).every((fecha) => {
    const t = study.tasasPrestamo?.porFecha?.[fecha];
    if (!t) return false;
    return ['prime', 'tmc', 'sofr']
      .filter((serie) => serieDisponible(serie, fecha))
      .every((serie) => valorDeTasaValido(t[serie]?.valor))
      && valorDeTasaValido(t.moodys?.valor);
  });
}

export function motorComparableCompleto(study) {
  if (!study) return false;
  const actividadOk = CAMPOS_OBLIGATORIOS_MOTOR_COMPARABLES.every((campo) => {
    const valor = study[campo];
    return typeof valor === 'string' && valor.trim().length > 0;
  });
  if (!actividadOk) return false;
  if (study.tipo_estudio === 'prestamo') return prestamoTasasCompleto(study);
  if (study.tipo_estudio === 'segmentacion') return segmentacionCompleto(study);
  return true;
}

/* En un estudio de segmentación, la etapa de Motor de Comparables no se puede confirmar sin
   una lectura segmentada de los EEFF (`t_lecturaSegmentacion`) Y un segmento elegido: una
   lectura sin segmento todavía no decidió qué cifras son las del estudio. */
export function segmentacionCompleto(study) {
  if (!study) return false;
  const segmentoOk = typeof study.segmentoSeleccionado === 'string' && study.segmentoSeleccionado.trim().length > 0;
  return Boolean(study.t_lecturaSegmentacion) && segmentoOk;
}

/* ¿Corrió alguna vez una lectura de EEFF segmentado sobre este estudio? Basta la lectura o el
   segmento elegido: cualquiera de los dos solo los escribe la ingesta segmentada. */
export function teniaLecturaSegmentacion(study) {
  return Boolean(study && (study.t_lecturaSegmentacion || study.segmentoSeleccionado));
}

/* Al salir de segmentación DESPUÉS de haber corrido una lectura segmentada (spec §6), los
   campos del segmento (tasas t_s/t_c/t_gastos/t_op, la lectura y el segmento elegido) dejan
   de tener sentido para el nuevo tipo: se devuelven en `null` para que el llamador los
   fusione sobre el estudio. `null` si no hay nada que limpiar — en particular si nunca hubo
   lectura (`teniaLectura` falso): un clic errado en «Segmentación» sobre un estudio con
   cifras estándar, o un estudio con cifras a mano, no debe perderlas al volver. */
export function limpiezaAlCambiarTipoEstudio(tipoAnterior, tipoNuevo, teniaLectura = false) {
  if (tipoAnterior === 'segmentacion' && tipoNuevo !== 'segmentacion' && teniaLectura) {
    return {
      t_s: null, t_c: null, t_gastos: null, t_op: null,
      t_lecturaSegmentacion: null, segmentoSeleccionado: null,
    };
  }
  return null;
}

/* El parche que aplica al estudio el segmento elegido de un EEFF segmentado: sus cifras (ya
   reparadas por el llamador con `repararCifrasDelEstudio`), el segmento y el resumen de la
   lectura que exige `segmentacionCompleto`.

   Anula además `seg_excluido`: para segmentación el spec dice que ese campo «no se muestra ni
   se usa», y aunque ya no se ve en la UI, los cálculos del rango, la auditoría, el informe y
   el Excel siguen restando `t_s − seg_excluido` / `t_op − seg_excluido`. Las cifras de un
   segmento ya vienen aisladas; restarles una exclusión pensada para la compañía entera la
   descontaría dos veces. `seg_motivo` no se toca: queda como rastro de auditoría. */
export function parcheAlAplicarSegmento(cifras, etiqueta, verificacion) {
  const v = verificacion || {};
  return {
    ...(cifras || {}),
    seg_excluido: null,
    segmentoSeleccionado: etiqueta,
    t_lecturaSegmentacion: {
      advertencias: v.advertencias,
      verificadoContraTexto: v.verificadoContraTexto,
      segmentosDisponibles: v.segmentosDisponibles,
    },
  };
}

/* Al empezar a cargar un EEFF segmentado NUEVO, la elección hecha sobre el documento anterior
   deja de valer: se anulan el segmento y la lectura para volver a cerrar la etapa 4 hasta que
   se elija un segmento del documento nuevo (y para que ningún botón del nuevo aparezca como
   ya elegido). Las cifras se conservan: las reemplaza la próxima elección. */
export function parcheAlCargarEeffSegmentado() {
  return { segmentoSeleccionado: null, t_lecturaSegmentacion: null };
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
