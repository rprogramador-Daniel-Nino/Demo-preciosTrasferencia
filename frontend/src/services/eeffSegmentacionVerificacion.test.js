/* Tests de la verificación por columna y el cuadre de un EEFF SEGMENTADO por línea de
   negocio o geografía: la contraparte de eeffVerificacion.test.js para un segmento elegido
   en vez del único ejercicio del estudio.

   Los tres casos vienen tal cual del plan (task-4-brief.md): el cálculo de t_op/t_gastos
   del segmento elegido, que un descuadre nunca bloquea ni descarta la cifra, y que el
   cuadre suma TODOS los segmentos y no solo dos. */

import { test } from 'node:test';
import assert from 'node:assert';
import { verificarEeffSegmentado } from './eeffSegmentacionVerificacion.js';
import { estructuraSegmentosDeFilas } from './eeffSegmentacionColumnas.js';

/* Fixtures de geometría, calcadas de eeffSegmentacionColumnas.test.js (mismo caso real
   OFIMIO: columnas "Tecnologia"/"Otros"), para ejercer el paso 2 (verificación por
   columna) sin tocar un PDF real: se construye la `estructura` a mano con
   `estructuraSegmentosDeFilas` y se inyecta vía `extraerEstructura`, el mismo mecanismo
   que `extraerEstructuraPdfSegmentos` ya ofrece con su propio `getDocument` para pruebas. */
const celda = (texto, derecha, ancho = 110) => ({ x: derecha - ancho, derecha, texto });
const fila = (y, celdas) => ({ y, celdas });

const ENCABEZADO_OFIMIO = fila(700, [celda('Tecnologia', 400, 120), celda('Otros', 520, 90)]);
const FILA_INGRESOS = fila(680, [
  celda('Ingresos de actividades ordinarias', 200, 190), celda('6.338.341.250', 400), celda('436.958.939', 520, 100),
]);
const FILA_COSTO_VENTAS = fila(650, [
  celda('Costo de ventas', 200, 150), celda('4.480.893.365', 400), celda('255.120.091', 520, 100),
]);
const FILA_GASTOS_VENTAS = fila(630, [
  celda('Gastos de ventas', 200, 150), celda('205.866.452', 400), celda('10.468.160', 520, 100),
]);
const FILA_GASTOS_ADMIN = fila(610, [
  celda('Gastos de administración', 200, 190), celda('709.245.287', 400), celda('895.251.143', 520, 100),
]);

const FILAS_OFIMIO = [
  ENCABEZADO_OFIMIO, FILA_INGRESOS, FILA_COSTO_VENTAS, FILA_GASTOS_VENTAS, FILA_GASTOS_ADMIN,
];

const rotulosComunes = {
  t_s: 'Ingresos de actividades ordinarias',
  t_c: 'Costo de ventas',
  t_gastos_ventas: 'Gastos de ventas',
  t_gastos_administracion: 'Gastos de administración',
};

/* Misma lectura del primer test del brief, pero con `textoPdf` no vacío: solo así entra
   al paso 2 (sin capa de texto, ese paso se salta entero, que es lo que ya cubren los
   5 tests de arriba). */
const lecturaConTexto = () => ({
  segmentos: [
    {
      etiqueta: 'Tecnologia',
      t_s: 6338341250,
      t_c: 4480893365,
      t_gastos_ventas: 205866452,
      t_gastos_administracion: 709245287,
      rotulos: rotulosComunes,
    },
    {
      etiqueta: 'Otros',
      t_s: 436958939,
      t_c: 255120091,
      t_gastos_ventas: 10468160,
      t_gastos_administracion: 895251143,
      rotulos: rotulosComunes,
    },
  ],
  totalCompania: {
    t_s: 6775300189, t_c: 4736013456, t_gastos_ventas: 216334612, t_gastos_administracion: 1604496430,
  },
  textoPdf: 'Estado de resultados segmentado — contenido no vacío, basta con que lo tenga.',
});

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

test('con capa de texto, un segmento cuyas 4 cifras coinciden con su columna no agrega advertencia de columna', async () => {
  const lectura = lecturaConTexto();
  const estructura = estructuraSegmentosDeFilas([{ numero: 1, filas: FILAS_OFIMIO }], ['Tecnologia', 'Otros']);

  const v = await verificarEeffSegmentado(lectura, {
    etiquetaSegmento: 'Tecnologia',
    anioEstudio: 2025,
    archivo: {},
    extraerEstructura: async () => estructura,
  });

  assert.equal(v.verificadoContraTexto, true);
  assert.equal(v.advertencias.some((a) => a.tipo === 'cifra-no-coincide-con-columna-segmento'), false);
  assert.equal(v.campos.t_s, 6338341250);
});

test('con capa de texto, una cifra que no calza con su columna advierte pero no reemplaza ni descarta la cifra leída', async () => {
  const lectura = lecturaConTexto();
  /* El costo de ventas que "leyó" el modelo no es el que de verdad está impreso en la
     columna "Tecnologia" de la fila "Costo de ventas" (4.480.893.365): se simula un dígito
     mal leído, 999, que no aparece en ninguna celda de esa fila — el mismo caso real
     (Llantas Emotion) que motiva el veredicto `corregible` en eeffSegmentacionColumnas.js. */
  lectura.segmentos[0].t_c = 999;
  const estructura = estructuraSegmentosDeFilas([{ numero: 1, filas: FILAS_OFIMIO }], ['Tecnologia', 'Otros']);

  const v = await verificarEeffSegmentado(lectura, {
    etiquetaSegmento: 'Tecnologia',
    anioEstudio: 2025,
    archivo: {},
    extraerEstructura: async () => estructura,
  });

  assert.equal(v.verificadoContraTexto, true);
  const advertencia = v.advertencias.find((a) => a.tipo === 'cifra-no-coincide-con-columna-segmento' && a.campo === 't_c');
  assert.ok(advertencia, 'debe advertir sobre el costo de ventas que no coincide con su columna');
  assert.equal(v.campos.t_c, 999, 'la cifra leída se mantiene: no hay pasada a notas que la reemplace para un segmento');
});
