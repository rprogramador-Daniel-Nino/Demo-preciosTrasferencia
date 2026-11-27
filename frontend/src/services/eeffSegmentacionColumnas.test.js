/* Tests de la ubicación de cada cifra dentro del estado financiero SEGMENTADO por línea de
   negocio o geografía en vez de por ejercicio.

   Es la contraparte de eeffColumnas.test.js: mismos fixtures (`celda`, `fila`), misma
   geometría, pero la clave de columna es una ETIQUETA de segmento (texto libre, conocida de
   antemano por quien llama) en vez de un año detectado por regex. */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  encabezadoDeSegmentos, asignarSegmentos, ubicacionDeCifraSegmento, estructuraSegmentosDeFilas,
} from './eeffSegmentacionColumnas.js';

const celda = (texto, derecha, ancho = 60) => ({ x: derecha - ancho, derecha, texto });
const fila = (y, celdas) => ({ y, celdas });

// Caso real: OFIMIO, dos columnas "Tecnologia" / "Otros", año 2025.
const ENCABEZADO_OFIMIO = fila(700, [celda('Tecnologia', 400), celda('Otros', 520)]);
const FILA_COSTO_VENTAS = fila(650, [
  celda('Costo de ventas', 200, 150), celda('4.480.893.365', 400, 100), celda('255.120.091', 520, 90),
]);

test('encabezadoDeSegmentos reconoce las dos columnas por su rótulo exacto', () => {
  const enc = encabezadoDeSegmentos([ENCABEZADO_OFIMIO, FILA_COSTO_VENTAS], ['Tecnologia', 'Otros']);
  assert.ok(enc);
  assert.deepEqual(enc.columnas.map((c) => c.etiqueta), ['Tecnologia', 'Otros']);
});

test('encabezadoDeSegmentos no reconoce una fila que no trae las dos etiquetas pedidas', () => {
  const otra = fila(700, [celda('Tecnologia', 400), celda('Inmobiliario', 520)]);
  assert.equal(encabezadoDeSegmentos([otra], ['Tecnologia', 'Otros']), null);
});

test('asignarSegmentos etiqueta cada cifra con su columna de segmento', () => {
  const enc = encabezadoDeSegmentos([ENCABEZADO_OFIMIO, FILA_COSTO_VENTAS], ['Tecnologia', 'Otros']);
  const asignado = asignarSegmentos(FILA_COSTO_VENTAS, enc);
  const porTexto = new Map([...asignado].map(([c, e]) => [c.texto, e]));
  assert.equal(porTexto.get('4.480.893.365'), 'Tecnologia');
  assert.equal(porTexto.get('255.120.091'), 'Otros');
});

test('ubicacionDeCifraSegmento dice "coincide" cuando la cifra está en su fila y su columna', () => {
  const estructura = estructuraSegmentosDeFilas(
    [{ numero: 1, filas: [ENCABEZADO_OFIMIO, FILA_COSTO_VENTAS] }], ['Tecnologia', 'Otros'],
  );
  const r = ubicacionDeCifraSegmento(estructura, {
    rotulo: 'Costo de ventas', valor: 4480893365, etiqueta: 'Tecnologia',
  });
  assert.equal(r.veredicto, 'coincide');
});

test('ubicacionDeCifraSegmento dice "otra-columna" cuando la cifra es del otro segmento', () => {
  const estructura = estructuraSegmentosDeFilas(
    [{ numero: 1, filas: [ENCABEZADO_OFIMIO, FILA_COSTO_VENTAS] }], ['Tecnologia', 'Otros'],
  );
  const r = ubicacionDeCifraSegmento(estructura, {
    rotulo: 'Costo de ventas', valor: 255120091, etiqueta: 'Tecnologia',
  });
  assert.equal(r.veredicto, 'otra-columna');
  assert.equal(r.etiquetaHallada, 'Otros');
});
