/* Tests de la verificación por columna y el cuadre de un EEFF SEGMENTADO por línea de
   negocio o geografía: la contraparte de eeffVerificacion.test.js para un segmento elegido
   en vez del único ejercicio del estudio.

   Los tres casos vienen tal cual del plan (task-4-brief.md): el cálculo de t_op/t_gastos
   del segmento elegido, que un descuadre nunca bloquea ni descarta la cifra, y que el
   cuadre suma TODOS los segmentos y no solo dos. */

import { test } from 'node:test';
import assert from 'node:assert';
import { verificarEeffSegmentado } from './eeffSegmentacionVerificacion.js';

test('verificarEeffSegmentado calcula t_op del segmento elegido', async () => {
  const lectura = {
    segmentos: [
      {
        etiqueta: 'Tecnologia', t_s: 6338341250, t_c: 4480893365, t_gastos_ventas: 205866452, t_gastos_administracion: 709245287, rotulos: {},
      },
      {
        etiqueta: 'Otros', t_s: 436958939, t_c: 255120091, t_gastos_ventas: 10468160, t_gastos_administracion: 895251143, rotulos: {},
      },
    ],
    totalCompania: {
      t_s: 6775300189, t_c: 4736013456, t_gastos_ventas: 216334612, t_gastos_administracion: 1604496430,
    },
    textoPdf: '',
  };
  const v = await verificarEeffSegmentado(lectura, { etiquetaSegmento: 'Tecnologia', anioEstudio: 2025, archivo: null });
  assert.equal(v.campos.t_s, 6338341250);
  assert.equal(v.verificadoContraTexto, false);
});

test('un descuadre fuera de tolerancia es una advertencia, no un bloqueo', async () => {
  const lectura = {
    segmentos: [
      {
        etiqueta: 'Tecnologia', t_s: 1000, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0, rotulos: {},
      },
    ],
    totalCompania: {
      t_s: 5000, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0,
    },
    textoPdf: '',
  };
  const v = await verificarEeffSegmentado(lectura, { etiquetaSegmento: 'Tecnologia', anioEstudio: 2025, archivo: null });
  assert.ok(v.advertencias.some((a) => a.tipo === 'descuadre-segmentos'));
  assert.equal(v.campos.t_s, 1000, 'la cifra del segmento se mantiene pese al descuadre');
});

test('con más de dos segmentos, el cuadre suma todos antes de comparar', async () => {
  const lectura = {
    segmentos: [
      {
        etiqueta: 'A', t_s: 100, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0, rotulos: {},
      },
      {
        etiqueta: 'B', t_s: 200, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0, rotulos: {},
      },
      {
        etiqueta: 'C', t_s: 300, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0, rotulos: {},
      },
    ],
    totalCompania: {
      t_s: 600, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0,
    },
    textoPdf: '',
  };
  const v = await verificarEeffSegmentado(lectura, { etiquetaSegmento: 'A', anioEstudio: 2025, archivo: null });
  assert.equal(v.advertencias.some((a) => a.tipo === 'descuadre-segmentos'), false);
});

test('lanza si la etiqueta pedida no está entre los segmentos de la lectura', async () => {
  const lectura = {
    segmentos: [
      {
        etiqueta: 'A', t_s: 100, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0, rotulos: {},
      },
    ],
    totalCompania: {
      t_s: 100, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0,
    },
    textoPdf: '',
  };
  await assert.rejects(() => verificarEeffSegmentado(lectura, { etiquetaSegmento: 'No existe', anioEstudio: 2025, archivo: null }));
});

test('segmentosDisponibles lista las etiquetas tal como las trajo el documento', async () => {
  const lectura = {
    segmentos: [
      {
        etiqueta: 'A', t_s: 100, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0, rotulos: {},
      },
      {
        etiqueta: 'B', t_s: 200, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0, rotulos: {},
      },
    ],
    totalCompania: {
      t_s: 300, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0,
    },
    textoPdf: '',
  };
  const v = await verificarEeffSegmentado(lectura, { etiquetaSegmento: 'A', anioEstudio: 2025, archivo: null });
  assert.deepEqual(v.segmentosDisponibles, ['A', 'B']);
});
