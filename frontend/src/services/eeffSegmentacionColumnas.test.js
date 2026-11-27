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

/* ══════════ Regresión: un título que repite las etiquetas arriba del encabezado real ══════════

   Reproducido en revisión de código: un documento puede traer, en la misma página, una línea
   de título o leyenda que cita las mismas dos etiquetas de segmento ANTES del encabezado real
   de la tabla. Como `encabezadoDeSegmentos` tomaba la primera fila que calzaba las etiquetas,
   se quedaba con el título —sin ninguna cifra alineada debajo de sus columnas— y
   `asignarSegmentos` terminaba atribuyendo cada cifra al segmento equivocado, en silencio. */
test('encabezadoDeSegmentos no se deja engañar por un título que repite las etiquetas arriba del encabezado real', () => {
  const TITULO = fila(900, [celda('Tecnologia', 300), celda('Otros', 450)]);
  const ENCABEZADO_REAL = fila(700, [celda('Tecnologia', 400), celda('Otros', 520)]);
  const FILA_DATOS = fila(650, [
    celda('Costo de ventas', 200), celda('4.480.893.365', 400), celda('255.120.091', 520),
  ]);

  const enc = encabezadoDeSegmentos([TITULO, ENCABEZADO_REAL, FILA_DATOS], ['Tecnologia', 'Otros']);
  assert.ok(enc);
  assert.equal(enc.y, ENCABEZADO_REAL.y, 'debe elegir el encabezado respaldado por cifras, no el título');

  const asignado = asignarSegmentos(FILA_DATOS, enc);
  const porTexto = new Map([...asignado].map(([c, e]) => [c.texto, e]));
  assert.equal(porTexto.get('4.480.893.365'), 'Tecnologia');
  assert.equal(porTexto.get('255.120.091'), 'Otros');
});

test('una fila de etiquetas sin ninguna cifra alineada debajo no se toma por encabezado', () => {
  /* Sin la regresión de arriba resuelta esto no puede fallar aquí también: una fila suelta de
     etiquetas, sin datos que la respalden, no puede ser el único candidato aceptado. */
  const soloEtiquetas = fila(900, [celda('Tecnologia', 300), celda('Otros', 450)]);
  assert.equal(encabezadoDeSegmentos([soloEtiquetas], ['Tecnologia', 'Otros']), null);
});

/* ══════════ Los demás veredictos ══════════ */

const ESTRUCTURA_VARIA = () => estructuraSegmentosDeFilas([{
  numero: 1,
  filas: [
    ENCABEZADO_OFIMIO,
    FILA_COSTO_VENTAS,
    /* Gasto que solo reporta Otros: Tecnologia viene en «-». */
    fila(630, [
      celda('Gastos no deducibles', 200, 150), celda('-', 400, 20), celda('12.345', 520, 60),
    ]),
    /* Un rótulo de sección, sin ninguna cifra alineada en ninguna columna de segmento. */
    fila(610, [celda('Total segmentos', 200, 150)]),
  ],
}], ['Tecnologia', 'Otros']);

test('ubicacionDeCifraSegmento dice "corregible" cuando la fila trae otra cifra en esa columna', () => {
  const r = ubicacionDeCifraSegmento(ESTRUCTURA_VARIA(), {
    rotulo: 'Costo de ventas', valor: 999999999, etiqueta: 'Tecnologia',
  });
  assert.equal(r.veredicto, 'corregible');
  assert.equal(r.esperado.valor, 4480893365);
});

test('ubicacionDeCifraSegmento dice "vacio-en-el-segmento" cuando esa columna está en guion', () => {
  const r = ubicacionDeCifraSegmento(ESTRUCTURA_VARIA(), {
    rotulo: 'Gastos no deducibles', valor: 999999999, etiqueta: 'Tecnologia',
  });
  assert.equal(r.veredicto, 'vacio-en-el-segmento');
  assert.equal(r.esperado.valor, null);
});

test('ubicacionDeCifraSegmento dice "fuera-de-columna" cuando la fila no trae ninguna cifra de segmento', () => {
  const r = ubicacionDeCifraSegmento(ESTRUCTURA_VARIA(), {
    rotulo: 'Total segmentos', valor: 123, etiqueta: 'Tecnologia',
  });
  assert.equal(r.veredicto, 'fuera-de-columna');
});

test('ubicacionDeCifraSegmento dice "sin-verificar" cuando el rótulo no aparece en el documento', () => {
  const r = ubicacionDeCifraSegmento(ESTRUCTURA_VARIA(), {
    rotulo: 'Rótulo que no existe', valor: 123, etiqueta: 'Tecnologia',
  });
  assert.equal(r.veredicto, 'sin-verificar');
});

/* ══════════ Revisión final (I2): la etiqueta de la columna es la del llamador ══════════

   El encabezado se reconoce con `normalizarPalabra` (sin distinguir mayúsculas, tildes ni
   la forma NFC/NFD del acento), pero `ubicacionDeCifraSegmento` compara la columna de cada
   celda con la etiqueta pedida por igualdad estricta. Si la columna guardaba el texto crudo
   de la celda del PDF, una diferencia de solo mayúsculas o de forma del acento hacía que
   ninguna cifra pudiera «coincidir»: todas salían como «otra-columna». */
const filasConEncabezado = (textoTecnologia, textoOtros) => [
  fila(700, [celda(textoTecnologia, 400), celda(textoOtros, 520)]),
  FILA_COSTO_VENTAS,
];

test('encabezadoDeSegmentos guarda en cada columna la etiqueta del llamador, no el texto crudo del PDF', () => {
  const enc = encabezadoDeSegmentos(filasConEncabezado('TECNOLOGÍA', 'OTROS'), ['Tecnologia', 'Otros']);
  assert.ok(enc);
  assert.deepEqual(enc.columnas.map((c) => c.etiqueta), ['Tecnologia', 'Otros']);
});

test('ubicacionDeCifraSegmento dice "coincide" aunque el PDF escriba la etiqueta con otras mayúsculas, tildes o forma NFD', () => {
  const variantesPdf = [
    'TECNOLOGÍA',
    'Tecnología'.normalize('NFD'),
    'Tecnología'.normalize('NFC'),
    '  tecnologia ',
  ];
  const pedidas = ['Tecnologia', 'Tecnología'.normalize('NFC'), 'Tecnología'.normalize('NFD')];
  for (const textoPdf of variantesPdf) {
    for (const pedida of pedidas) {
      const estructura = estructuraSegmentosDeFilas(
        [{ numero: 1, filas: filasConEncabezado(textoPdf, 'OTROS') }], [pedida, 'Otros'],
      );
      const r = ubicacionDeCifraSegmento(estructura, {
        rotulo: 'Costo de ventas', valor: 4480893365, etiqueta: pedida,
      });
      assert.equal(r.veredicto, 'coincide', `PDF «${textoPdf}» / pedida «${pedida}»`);
    }
  }
});

test('con etiquetas que difieren solo en forma, "otra-columna" nombra la etiqueta del llamador', () => {
  const estructura = estructuraSegmentosDeFilas(
    [{ numero: 1, filas: filasConEncabezado('TECNOLOGÍA', 'OTROS') }], ['Tecnologia', 'Otros'],
  );
  const r = ubicacionDeCifraSegmento(estructura, {
    rotulo: 'Costo de ventas', valor: 255120091, etiqueta: 'Tecnologia',
  });
  assert.equal(r.veredicto, 'otra-columna');
  assert.equal(r.etiquetaHallada, 'Otros');
  assert.equal(r.esperado.valor, 4480893365, 'la cifra de la columna pedida sí se encuentra');
});

/* ══════════ Revisión final (I3, mínimo): encabezado comparativo con etiquetas repetidas ══════════

   Un estado segmentado comparativo trae «Tecnologia | Otros | Tecnologia | Otros», un bloque
   por año. Tomar en silencio la primera celda de cada etiqueta verificaba siempre contra el
   bloque de la izquierda: una cifra leída del año equivocado podía salir como «coincide».
   Mientras no se cruce el año (seguimiento aparte), una fila así es AMBIGUA y no se acepta
   como encabezado: la verificación degrada a «sin-verificar». */
const ENCABEZADO_COMPARATIVO = fila(700, [
  celda('Tecnologia', 400), celda('Otros', 520), celda('Tecnologia', 640), celda('Otros', 760),
]);
const FILA_COSTO_COMPARATIVA = fila(650, [
  celda('Costo de ventas', 200, 150),
  celda('4.480.893.365', 400, 100), celda('255.120.091', 520, 90),
  celda('3.900.000.000', 640, 100), celda('210.000.000', 760, 90),
]);

test('encabezadoDeSegmentos rechaza como ambigua una fila que repite una etiqueta pedida', () => {
  assert.equal(
    encabezadoDeSegmentos([ENCABEZADO_COMPARATIVO, FILA_COSTO_COMPARATIVA], ['Tecnologia', 'Otros']),
    null,
  );
});

test('una etiqueta repetida en otra forma (tildes/mayúsculas) también hace ambigua la fila', () => {
  const comparativoMixto = fila(700, [
    celda('Tecnologia', 400), celda('Otros', 520), celda('TECNOLOGÍA', 640), celda('Otros', 760),
  ]);
  assert.equal(
    encabezadoDeSegmentos([comparativoMixto, FILA_COSTO_COMPARATIVA], ['Tecnologia', 'Otros']),
    null,
  );
});

test('con encabezado comparativo ambiguo, una cifra de cualquiera de los dos bloques queda "sin-verificar"', () => {
  const estructura = estructuraSegmentosDeFilas(
    [{ numero: 1, filas: [ENCABEZADO_COMPARATIVO, FILA_COSTO_COMPARATIVA] }], ['Tecnologia', 'Otros'],
  );
  for (const valor of [4480893365, 3900000000]) {
    const r = ubicacionDeCifraSegmento(estructura, {
      rotulo: 'Costo de ventas', valor, etiqueta: 'Tecnologia',
    });
    assert.equal(r.veredicto, 'sin-verificar', `valor ${valor}`);
  }
});

test('una fila ambigua no impide reconocer otro encabezado no ambiguo del mismo documento', () => {
  const encabezadoUnico = fila(500, [celda('Tecnologia', 400), celda('Otros', 520)]);
  const datosUnicos = fila(450, [
    celda('Costo de ventas', 200, 150), celda('4.480.893.365', 400, 100), celda('255.120.091', 520, 90),
  ]);
  const enc = encabezadoDeSegmentos(
    [ENCABEZADO_COMPARATIVO, FILA_COSTO_COMPARATIVA, encabezadoUnico, datosUnicos],
    ['Tecnologia', 'Otros'],
  );
  assert.ok(enc);
  assert.equal(enc.y, encabezadoUnico.y);
});
