import { test } from 'node:test';
import assert from 'node:assert';
import {
  NUMERO_ETAPA, TOTAL_ETAPAS, CAMPOS_OBLIGATORIOS_CONTRIBUYENTE,
  contribuyenteCompleto, CAMPOS_OBLIGATORIOS_MOTOR_COMPARABLES, motorComparableCompleto,
  estadoDesdeEtapa, etapaAlcanzable, etapaMaximaEfectiva,
} from './flujoEstudio.js';

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
