import { test } from 'node:test';
import assert from 'node:assert';
import {
  NUMERO_ETAPA, TOTAL_ETAPAS, CAMPOS_OBLIGATORIOS_CONTRIBUYENTE,
  contribuyenteCompleto, CAMPOS_OBLIGATORIOS_MOTOR_COMPARABLES, motorComparableCompleto,
  operacionesPrestamoCompleto, prestamoTasasCompleto,
  estadoDesdeEtapa, etapaAlcanzable, etapaMaximaEfectiva,
  segmentacionCompleto, limpiezaAlCambiarTipoEstudio, teniaLecturaSegmentacion,
  parcheAlAplicarSegmento, parcheAlCargarEeffSegmentado,
} from './flujoEstudio.js';
import { analizarRango } from './rangoIntercuartil.js';

const PRESTAMO_BASE = { tipo_estudio: 'prestamo', actividad_especifica: 'Comercio de vehículos' };
const PRESTAMOS_DOS_FECHAS = [
  { fechaPacto: '2020-10-27' },
  { fechaPacto: '2022-07-07' },
];
const TASAS_COMPLETAS = {
  riesgoPais: { valor: 2.845 },
  porFecha: {
    '2020-10-27': {
      prime: { valor: 3.25 }, tmc: { valor: 1.75 }, sofr: { valor: 0.09 }, moodys: { valor: 1.56 },
    },
    '2022-07-07': {
      prime: { valor: 4.75 }, tmc: { valor: 7.5 }, sofr: { valor: 1.54 }, moodys: { valor: 1.19 },
    },
  },
};

test('NUMERO_ETAPA enumera las 6 etapas del sidebar en el mismo orden en que aparecen', () => {
  /* Layout.jsx numera sus botones "1. Contribuyente" ... "6. Generador Word": este mapa es
     la fuente de verdad que evita que el candado y el sidebar se desincronicen si alguien
     reordena uno de los dos por separado. */
  assert.deepStrictEqual(NUMERO_ETAPA, {
    contribuyente: 1, Operaciones: 2, 'Estados financieros': 3,
    comparables: 4, auditoria: 5, informe: 6,
  });
  assert.strictEqual(TOTAL_ETAPAS, 6);
});

test('contribuyenteCompleto exige los 5 campos que llevan asterisco en el formulario', () => {
  const completo = {
    tipo_estudio: 'estandar', ent: 'Acme S.A.S.', nit: '900123456', anio: 2025, ciiu: '6201',
  };
  assert.strictEqual(contribuyenteCompleto(completo), true);
  assert.deepStrictEqual(CAMPOS_OBLIGATORIOS_CONTRIBUYENTE, ['tipo_estudio', 'ent', 'nit', 'anio', 'ciiu']);
});

test('contribuyenteCompleto falla si falta cualquiera de los 5 campos obligatorios', () => {
  const base = { tipo_estudio: 'estandar', ent: 'Acme S.A.S.', nit: '900123456', anio: 2025, ciiu: '6201' };
  for (const campo of CAMPOS_OBLIGATORIOS_CONTRIBUYENTE) {
    const conUnoVacio = { ...base, [campo]: campo === 'anio' ? 0 : '' };
    assert.strictEqual(contribuyenteCompleto(conUnoVacio), false, `debe fallar sin ${campo}`);
  }
});

test('contribuyenteCompleto ignora espacios en blanco disfrazando un campo vacío', () => {
  /* Sin trim(), " " pasaría el botón "Confirmar etapa" a verde con la Razón Social vacía. */
  assert.strictEqual(
    contribuyenteCompleto({ tipo_estudio: 'estandar', ent: '   ', nit: '900123456', anio: 2025, ciiu: '6201' }),
    false,
  );
});

test('contribuyenteCompleto es falso sin estudio', () => {
  assert.strictEqual(contribuyenteCompleto(null), false);
  assert.strictEqual(contribuyenteCompleto(undefined), false);
});

test('motorComparableCompleto exige la actividad económica específica', () => {
  assert.deepStrictEqual(CAMPOS_OBLIGATORIOS_MOTOR_COMPARABLES, ['actividad_especifica']);
  assert.strictEqual(motorComparableCompleto({ actividad_especifica: 'Desarrollo de software' }), true);
});

test('motorComparableCompleto falla sin actividad económica específica, con espacios o sin estudio', () => {
  assert.strictEqual(motorComparableCompleto({ actividad_especifica: '' }), false);
  assert.strictEqual(motorComparableCompleto({ actividad_especifica: '   ' }), false);
  assert.strictEqual(motorComparableCompleto({}), false);
  assert.strictEqual(motorComparableCompleto(null), false);
});

test('motorComparableCompleto para estándar/segmentación sigue exigiendo solo actividad_especifica', () => {
  /* No se rompe el comportamiento actual: sin tipo_estudio === 'prestamo', nunca se exige
     prestamoTasasCompleto. */
  assert.strictEqual(motorComparableCompleto({ actividad_especifica: 'Desarrollo de software' }), true);
  assert.strictEqual(
    motorComparableCompleto({ tipo_estudio: 'estandar', actividad_especifica: 'Desarrollo de software' }),
    true,
  );
});

test('motorComparableCompleto en préstamo exige también las tasas completas', () => {
  assert.strictEqual(motorComparableCompleto({ ...PRESTAMO_BASE, prestamos: PRESTAMOS_DOS_FECHAS }), false);
  assert.strictEqual(
    motorComparableCompleto({
      ...PRESTAMO_BASE, prestamos: PRESTAMOS_DOS_FECHAS, tasasPrestamo: TASAS_COMPLETAS,
    }),
    true,
  );
});

test('motorComparableCompleto en préstamo sigue exigiendo actividad_especifica', () => {
  assert.strictEqual(
    motorComparableCompleto({
      tipo_estudio: 'prestamo', prestamos: PRESTAMOS_DOS_FECHAS, tasasPrestamo: TASAS_COMPLETAS,
    }),
    false,
  );
});

test('prestamoTasasCompleto: falso sin tasasPrestamo, o con riesgoPais sin llenar', () => {
  assert.strictEqual(prestamoTasasCompleto({ prestamos: PRESTAMOS_DOS_FECHAS }), false);
  assert.strictEqual(
    prestamoTasasCompleto({ prestamos: PRESTAMOS_DOS_FECHAS, tasasPrestamo: { porFecha: TASAS_COMPLETAS.porFecha } }),
    false,
  );
});

test('prestamoTasasCompleto: falso si a alguna fecha le falta cualquiera de las 4 tasas', () => {
  const incompleto = {
    prestamos: PRESTAMOS_DOS_FECHAS,
    tasasPrestamo: {
      riesgoPais: { valor: 2.845 },
      porFecha: {
        '2020-10-27': TASAS_COMPLETAS.porFecha['2020-10-27'],
        '2022-07-07': { prime: { valor: 4.75 }, tmc: { valor: 7.5 }, moodys: { valor: 1.19 } }, // sin sofr
      },
    },
  };
  assert.strictEqual(prestamoTasasCompleto(incompleto), false);
});

test('prestamoTasasCompleto: verdadero con todas las fechas llenas', () => {
  assert.strictEqual(
    prestamoTasasCompleto({ prestamos: PRESTAMOS_DOS_FECHAS, tasasPrestamo: TASAS_COMPLETAS }),
    true,
  );
});

test('prestamoTasasCompleto: no exige sofr si la única fecha de pacto es anterior a abril de 2018', () => {
  const prestamoViejo = {
    prestamos: [{ fechaPacto: '2015-01-15' }],
    tasasPrestamo: {
      riesgoPais: { valor: 2.845 },
      porFecha: { '2015-01-15': { prime: { valor: 3 }, tmc: { valor: 2 }, moodys: { valor: 1 } } },
    },
  };
  assert.strictEqual(prestamoTasasCompleto(prestamoViejo), true);
});

test('prestamoTasasCompleto: falso sin estudio', () => {
  assert.strictEqual(prestamoTasasCompleto(null), false);
});

test('operacionesPrestamoCompleto exige al menos una fila de préstamo detectada', () => {
  assert.strictEqual(operacionesPrestamoCompleto({ prestamos: [{ otorga: 'Acme' }] }), true);
});

test('operacionesPrestamoCompleto falla sin préstamos, con arreglo vacío, null o sin estudio', () => {
  assert.strictEqual(operacionesPrestamoCompleto({ prestamos: [] }), false);
  assert.strictEqual(operacionesPrestamoCompleto({ prestamos: null }), false);
  assert.strictEqual(operacionesPrestamoCompleto({}), false);
  assert.strictEqual(operacionesPrestamoCompleto(null), false);
});

test('estadoDesdeEtapa: sin ninguna etapa confirmada el estudio es un borrador', () => {
  assert.strictEqual(estadoDesdeEtapa(0, false), 'borrador');
});

test('estadoDesdeEtapa: con al menos una etapa confirmada el estudio está en progreso', () => {
  assert.strictEqual(estadoDesdeEtapa(1, false), 'en_progreso');
  assert.strictEqual(estadoDesdeEtapa(5, false), 'en_progreso');
});

test('estadoDesdeEtapa: `finalizado` es pegajoso, gana aunque etapaMaxima baje después', () => {
  /* El botón Finalizar es solo una etiqueta: si luego se edita una etapa anterior y eso
     revierte `etapaMaxima` a 0, el badge de la bandeja debe seguir diciendo "Finalizado" —
     así lo pidió el usuario, y es justo el caso que este test fija. */
  assert.strictEqual(estadoDesdeEtapa(0, true), 'finalizado');
  assert.strictEqual(estadoDesdeEtapa(6, true), 'finalizado');
});

test('etapaAlcanzable deja pasar la etapa siguiente a la última confirmada, no más', () => {
  assert.strictEqual(etapaAlcanzable('contribuyente', 0), true, 'la etapa 1 siempre se puede ver');
  assert.strictEqual(etapaAlcanzable('Operaciones', 0), false, 'sin confirmar la 1, la 2 está bloqueada');
  assert.strictEqual(etapaAlcanzable('Operaciones', 1), true, 'con la 1 confirmada, la 2 se desbloquea');
  assert.strictEqual(etapaAlcanzable('comparables', 1), false, 'no se puede saltar de la 2 a la 4');
  assert.strictEqual(etapaAlcanzable('comparables', 3), true, 'con la 3 confirmada, la 4 se desbloquea');
});

test('etapaAlcanzable deja pasar cualquier id que no sea una etapa del wizard', () => {
  /* Dashboard, Clientes y Catálogo no participan del candado. */
  assert.strictEqual(etapaAlcanzable('dashboard', 0), true);
  assert.strictEqual(etapaAlcanzable('clientes', 0), true);
});

test('etapaMaximaEfectiva respeta un 0 explícito de un estudio recién creado', () => {
  assert.strictEqual(etapaMaximaEfectiva({ etapaMaxima: 0 }), 0);
});

test('etapaMaximaEfectiva acota el valor guardado al rango 0-6', () => {
  assert.strictEqual(etapaMaximaEfectiva({ etapaMaxima: 9 }), 6);
  assert.strictEqual(etapaMaximaEfectiva({ etapaMaxima: -3 }), 0);
});

test('etapaMaximaEfectiva trata un estudio sin el campo como completamente desbloqueado', () => {
  /* Estudios guardados antes de que existiera este candado no deben amanecer bloqueados en
     la etapa 1 solo por no tener `etapaMaxima` — ver el comentario en flujoEstudio.js. */
  assert.strictEqual(etapaMaximaEfectiva({}), 6);
  assert.strictEqual(etapaMaximaEfectiva(null), 6);
  assert.strictEqual(etapaMaximaEfectiva(undefined), 6);
});

test('segmentacionCompleto exige lectura Y segmento elegido', () => {
  assert.equal(segmentacionCompleto({ tipo_estudio: 'segmentacion' }), false);
  assert.equal(segmentacionCompleto({ tipo_estudio: 'segmentacion', t_lecturaSegmentacion: {} }), false, 'sin segmento elegido no basta');
  assert.equal(segmentacionCompleto({ tipo_estudio: 'segmentacion', t_lecturaSegmentacion: {}, segmentoSeleccionado: 'Tecnologia' }), true);
});

test('motorComparableCompleto exige segmentacionCompleto solo para tipo_estudio segmentacion', () => {
  const base = { actividad_especifica: 'Comercio de tecnología' };
  assert.equal(motorComparableCompleto({ ...base, tipo_estudio: 'segmentacion' }), false);
  assert.equal(motorComparableCompleto({
    ...base, tipo_estudio: 'segmentacion', t_lecturaSegmentacion: {}, segmentoSeleccionado: 'Tecnologia',
  }), true);
  // no rompe el caso existente de préstamo ni el estándar:
  assert.equal(motorComparableCompleto({ ...base, tipo_estudio: 'estandar' }), true);
});

test('segmentacionCompleto no acepta un segmento elegido que es solo espacios', () => {
  assert.equal(segmentacionCompleto({ tipo_estudio: 'segmentacion', t_lecturaSegmentacion: {}, segmentoSeleccionado: '   ' }), false);
});

test('limpiezaAlCambiarTipoEstudio limpia los campos del segmento al salir de segmentación con una lectura corrida', () => {
  const patch = limpiezaAlCambiarTipoEstudio('segmentacion', 'estandar', true);
  assert.deepEqual(patch, {
    t_s: null, t_c: null, t_gastos: null, t_op: null,
    t_lecturaSegmentacion: null, segmentoSeleccionado: null,
  });
});

test('limpiezaAlCambiarTipoEstudio no hace nada si no se sale de segmentación', () => {
  assert.equal(limpiezaAlCambiarTipoEstudio('estandar', 'prestamo', true), null);
  assert.equal(limpiezaAlCambiarTipoEstudio('estandar', 'prestamo', false), null);
  assert.equal(limpiezaAlCambiarTipoEstudio('segmentacion', 'segmentacion', true), null);
});

/* Revisión final (I4): el spec solo autoriza borrar las cifras al salir de Segmentación
   «después de haber corrido una lectura de segmentación». Un clic errado en Segmentación
   sobre un estudio con cifras estándar —o un estudio de la era anterior con cifras a mano—
   no debe perderlas al volver. */
test('limpiezaAlCambiarTipoEstudio: segmentacion → estandar sin haber corrido nunca una lectura no borra las cifras', () => {
  assert.equal(limpiezaAlCambiarTipoEstudio('segmentacion', 'estandar', false), null);
  assert.equal(limpiezaAlCambiarTipoEstudio('segmentacion', 'prestamo', false), null);
  assert.equal(limpiezaAlCambiarTipoEstudio('segmentacion', 'estandar'), null, 'sin el flag, no se asume lectura');
});

test('teniaLecturaSegmentacion: basta la lectura o el segmento elegido', () => {
  assert.equal(teniaLecturaSegmentacion({}), false);
  assert.equal(teniaLecturaSegmentacion(null), false);
  assert.equal(teniaLecturaSegmentacion({ t_s: 1000, t_op: 100 }), false, 'cifras a mano no son una lectura');
  assert.equal(teniaLecturaSegmentacion({ t_lecturaSegmentacion: { advertencias: [] } }), true);
  assert.equal(teniaLecturaSegmentacion({ segmentoSeleccionado: 'Tecnologia' }), true);
});

/* Revisión final (C1): para segmentación, `seg_excluido` «no se muestra ni se usa». El campo
   ya no se ve en la UI, pero ~9 cálculos (rango, auditoría, informe, Excel…) siguen restando
   `t_s − seg_excluido` y `t_op − seg_excluido`. Aplicar un segmento lo deja en null en el mismo
   parche, así ninguno de ellos descuenta dos veces una exclusión pensada para la compañía
   entera. `seg_motivo` se conserva como rastro de auditoría. */
const VERIFICACION_TECNOLOGIA = {
  campos: { t_s: 1000, t_c: 600, t_gastos: 300, t_op: 100 },
  advertencias: [{ tipo: 'descuadre-segmentos', campo: 't_s', mensaje: 'x' }],
  verificadoContraTexto: true,
  segmentosDisponibles: ['Tecnologia', 'Otros'],
};

test('parcheAlAplicarSegmento aplica las cifras, el segmento, la lectura y anula seg_excluido', () => {
  const parche = parcheAlAplicarSegmento(VERIFICACION_TECNOLOGIA.campos, 'Tecnologia', VERIFICACION_TECNOLOGIA);
  assert.deepEqual(parche, {
    t_s: 1000, t_c: 600, t_gastos: 300, t_op: 100,
    seg_excluido: null,
    segmentoSeleccionado: 'Tecnologia',
    t_lecturaSegmentacion: {
      advertencias: VERIFICACION_TECNOLOGIA.advertencias,
      verificadoContraTexto: true,
      segmentosDisponibles: ['Tecnologia', 'Otros'],
    },
  });
  assert.equal('seg_motivo' in parche, false, 'seg_motivo no se toca: queda como rastro');
});

test('un estudio de segmentación con seg_excluido viejo mide el margen del segmento tras aplicarlo, sin descontar dos veces', () => {
  const estudio = {
    tipo_estudio: 'segmentacion', pli: 'MO',
    t_s: 9000, t_c: 5000, t_op: 900,
    seg_excluido: 500, seg_motivo: 'Ingreso no operacional de la compañía',
  };
  // Antes de aplicar el segmento, el seg_excluido viejo sí entra al cálculo (comportamiento existente).
  const antes = analizarRango(estudio).tPLI;
  const despues = { ...estudio, ...parcheAlAplicarSegmento(VERIFICACION_TECNOLOGIA.campos, 'Tecnologia', VERIFICACION_TECNOLOGIA) };
  const { tPLI } = analizarRango(despues);
  assert.ok(Math.abs(tPLI - 100 / 1000) < 1e-9, `margen del segmento 10 %, no ${tPLI}`);
  assert.notEqual(antes, tPLI);
  assert.equal(despues.seg_motivo, 'Ingreso no operacional de la compañía');
  assert.equal(segmentacionCompleto(despues), true);
});

/* Revisión final (I5): subir un documento nuevo deja sin efecto la elección hecha sobre el
   anterior —vuelve a cerrar la etapa 4 y ningún botón del documento nuevo aparece como ya
   elegido—, pero NO borra las cifras: se reemplazan cuando se elija un segmento del nuevo. */
test('parcheAlCargarEeffSegmentado anula la elección y la lectura anteriores sin tocar las cifras', () => {
  const parche = parcheAlCargarEeffSegmentado();
  assert.deepEqual(parche, { segmentoSeleccionado: null, t_lecturaSegmentacion: null });

  const estudioPrevio = {
    tipo_estudio: 'segmentacion', actividad_especifica: 'Comercio de tecnología',
    t_s: 1000, t_c: 600, t_gastos: 300, t_op: 100,
    segmentoSeleccionado: 'Tecnologia', t_lecturaSegmentacion: { advertencias: [] },
  };
  assert.equal(motorComparableCompleto(estudioPrevio), true);
  const tras = { ...estudioPrevio, ...parche };
  assert.equal(motorComparableCompleto(tras), false, 'la etapa 4 vuelve a cerrarse');
  assert.deepEqual([tras.t_s, tras.t_c, tras.t_gastos, tras.t_op], [1000, 600, 300, 100]);
});
