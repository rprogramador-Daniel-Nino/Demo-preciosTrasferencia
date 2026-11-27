/* Pruebas de la lectura con Gemini Vision de un estado de resultados SEGMENTADO por línea de
   negocio: `parseEeffSegmentadoWithGeminiOCR` recibe el PDF/imagen del contribuyente y devuelve
   los cuatro rubros estándar (ingresos, costo de ventas, gastos de ventas, gastos de
   administración) por cada columna de segmento que el documento traiga, más el total de la
   compañía.

   Mismo patrón de mock que `eeffParser.test.js` usa para `parseEEFFComparableOCR`: se
   reemplaza `axios.post` por un stub que devuelve el JSON ya envuelto como lo hace Gemini, y se
   restaura en el `finally`. */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  EEFF_SEGMENTACION_PROMPT, parseEeffSegmentadoWithGeminiOCR,
} from './eeffSegmentacionParser.js';

/* Caso real: OFIMIO, estado de resultados con dos columnas de segmento ("Tecnologia" /
   "Otros") y una columna de total de la compañía — mismas etiquetas que usa
   eeffSegmentacionColumnas.test.js, para que las cifras de una prueba sirvan de fixture a la
   otra sin inventar un segundo caso. */
function mockFile() {
  return {
    name: 'ofimio_segmentado.png',
    type: 'image/png',
    arrayBuffer: async () => Buffer.from('bytes falsos de imagen'),
  };
}

function respuestaGemini(objeto) {
  return {
    data: {
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify(objeto) }],
        },
      }],
    },
  };
}

test('EEFF_SEGMENTACION_PROMPT sigue la regla de transcribir y no interpretar', () => {
  assert.match(EEFF_SEGMENTACION_PROMPT, /transcribe, no interpretes/i);
  assert.match(EEFF_SEGMENTACION_PROMPT, /NO estimes/i);
  assert.match(EEFF_SEGMENTACION_PROMPT, /NO sumes/i);
});

test('EEFF_SEGMENTACION_PROMPT pide los cuatro rubros por columna y el total de la compañía', () => {
  ['ingresos_operacionales', 'costo_ventas', 'gastos_ventas', 'gastos_administracion', 'segmentos', 'total_compania']
    .forEach((campo) => {
      assert.ok(EEFF_SEGMENTACION_PROMPT.includes(campo), `falta "${campo}" en el prompt`);
    });
});

test('parseEeffSegmentadoWithGeminiOCR mapea los segmentos y el total de la compañía', async () => {
  const axios = (await import('axios')).default;
  const originalPost = axios.post;

  axios.post = async () => respuestaGemini({
    segmentos: [
      {
        etiqueta: 'Tecnologia',
        ingresos_operacionales: { valor: 6338341250, rotulo: 'Ingresos de actividades ordinarias' },
        costo_ventas: { valor: 4480893365, rotulo: 'Costo de ventas' },
        gastos_ventas: { valor: 120000000, rotulo: 'Gastos de ventas' },
        gastos_administracion: { valor: 300000000, rotulo: 'Gastos de administración' },
      },
      {
        etiqueta: 'Otros',
        ingresos_operacionales: { valor: 900000000, rotulo: 'Ingresos de actividades ordinarias' },
        costo_ventas: { valor: 255120091, rotulo: 'Costo de ventas' },
        gastos_ventas: { valor: null, rotulo: '' },
        gastos_administracion: { valor: 50000000, rotulo: 'Gastos de administración' },
      },
    ],
    total_compania: {
      ingresos_operacionales: { valor: 7238341250, rotulo: 'Total ingresos' },
      costo_ventas: { valor: 4736013456, rotulo: 'Total costo de ventas' },
      gastos_ventas: { valor: 120000000, rotulo: 'Total gastos de ventas' },
      gastos_administracion: { valor: 350000000, rotulo: 'Total gastos de administración' },
    },
  });

  try {
    const lectura = await parseEeffSegmentadoWithGeminiOCR(mockFile(), 2025);

    assert.equal(lectura.segmentos.length, 2);
    assert.equal(lectura.segmentos[0].etiqueta, 'Tecnologia');
    assert.equal(lectura.segmentos[0].t_s, 6338341250);
    assert.equal(lectura.segmentos[0].t_c, 4480893365);
    assert.equal(lectura.segmentos[0].t_gastos_ventas, 120000000);
    assert.equal(lectura.segmentos[0].t_gastos_administracion, 300000000);
    assert.equal(lectura.segmentos[0].rotulos.t_s, 'Ingresos de actividades ordinarias');

    assert.equal(lectura.segmentos[1].etiqueta, 'Otros');
    assert.equal(lectura.segmentos[1].t_gastos_ventas, null, 'sin cifra en el documento, va en null y no en 0');
    assert.equal(lectura.segmentos[1].rotulos.t_gastos_ventas, undefined, 'sin rótulo cuando el valor es null');

    assert.ok(lectura.totalCompania);
    assert.equal(lectura.totalCompania.t_s, 7238341250);
    assert.equal(lectura.totalCompania.t_c, 4736013456);
    assert.equal(lectura.totalCompania.t_gastos_ventas, 120000000);
    assert.equal(lectura.totalCompania.t_gastos_administracion, 350000000);

    assert.equal(lectura.anioObjetivo, '2025');
    assert.ok(lectura.rawJson);
    assert.equal(typeof lectura.textoPdf, 'string');
  } finally {
    axios.post = originalPost;
  }
});

test('parseEeffSegmentadoWithGeminiOCR no revienta si el documento no imprime un segmento con cifra', async () => {
  const axios = (await import('axios')).default;
  const originalPost = axios.post;

  axios.post = async () => respuestaGemini({
    segmentos: [
      { etiqueta: '', ingresos_operacionales: { valor: null, rotulo: '' } },
      {
        etiqueta: 'Tecnologia',
        ingresos_operacionales: { valor: 100, rotulo: 'Ingresos' },
      },
    ],
    total_compania: null,
  });

  try {
    const lectura = await parseEeffSegmentadoWithGeminiOCR(mockFile(), 2025);
    /* La columna sin etiqueta (encabezado vacío, probablemente ruido de la tabla) se
       descarta: no hay forma de que Task 2 la ubique sin un rótulo de columna. */
    assert.equal(lectura.segmentos.length, 1);
    assert.equal(lectura.segmentos[0].etiqueta, 'Tecnologia');
    assert.ok(lectura.totalCompania, 'sin total_compania en el documento, igual se devuelve el objeto con las 4 claves en null');
    assert.equal(lectura.totalCompania.t_s, null);
  } finally {
    axios.post = originalPost;
  }
});
