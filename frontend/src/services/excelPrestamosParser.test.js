import { test } from 'node:test';
import assert from 'node:assert';
import { fechaDeSerialExcel, fechaISODeSerialExcel } from './excelPrestamosParser.js';

test('fechaDeSerialExcel convierte un serial real de Excel a la fecha correcta', () => {
  // 44131 es la fecha del primer desembolso del archivo de referencia: 27/10/2020.
  const fecha = fechaDeSerialExcel(44131);
  assert.strictEqual(fecha.getFullYear(), 2020);
  assert.strictEqual(fecha.getMonth(), 9); // octubre, 0-indexado
  assert.strictEqual(fecha.getDate(), 27);
});

test('fechaDeSerialExcel devuelve null para vacío, texto de plantilla, cero u out-of-range', () => {
  assert.strictEqual(fechaDeSerialExcel(''), null);
  assert.strictEqual(fechaDeSerialExcel('DD/MM/AAAA'), null);
  assert.strictEqual(fechaDeSerialExcel(0), null);
  assert.strictEqual(fechaDeSerialExcel(null), null);
  assert.strictEqual(fechaDeSerialExcel(undefined), null);
  assert.strictEqual(fechaDeSerialExcel(99999999), null);
  assert.strictEqual(fechaDeSerialExcel(2958466), null);
});

test('fechaDeSerialExcel deja pasar un Date ya construido', () => {
  const d = new Date(2020, 9, 27);
  assert.strictEqual(fechaDeSerialExcel(d), d);
});

test('fechaISODeSerialExcel devuelve texto "AAAA-MM-DD", no un objeto Date', () => {
  assert.strictEqual(fechaISODeSerialExcel(44131), '2020-10-27');
  assert.strictEqual(typeof fechaISODeSerialExcel(44131), 'string');
  assert.strictEqual(fechaISODeSerialExcel(''), null);
});

import { esFilaEncabezadoPrestamo, indicesColumnasPrestamo } from './excelPrestamosParser.js';

const ENCABEZADO_PRESTAMOS = [
  'Crédito',
  'Razón Social de quien otorga el préstamo',
  'Razón Social de quien recibe el préstamo',
  'Fuente de los recursos',
  'Fecha original en la que se pactó',
  'Valor del desembolso en la moneda pactada',
  'Moneda pactada',
  'No. de desembolsos',
  'Fecha de desembolso',
  'Valor en COP en la fecha de desembolso',
  'Valor en COP del saldo al 31 de diciembre de 2025',
  'Monto de intereses causados o recibidos durante el FY 2025 (Moneda pactada)',
  'Monto de intereses causados o recibidos durante el FY 2025 (COP)',
  'Plazo',
  'El préstamo fue renovado (Si aplica indicar la fecha de su última renovación)',
  'El préstamo fue cancelado (Si aplica indicar la fecha de su cancelación)',
  'Tasa de interés EFECTIVA ANUAL',
  'Tasa de interés pactada (en caso de no haber pactado una tasa en términos EA)',
  'Indicar periodicidad y valor de la tasa pactada (ej Libor USD tres meses) de aplicar',
];

test('esFilaEncabezadoPrestamo reconoce la fila real de encabezados', () => {
  assert.strictEqual(esFilaEncabezadoPrestamo(ENCABEZADO_PRESTAMOS), true);
});

test('esFilaEncabezadoPrestamo no confunde una fila de datos ni el título de la hoja', () => {
  assert.strictEqual(esFilaEncabezadoPrestamo(['Operaciones de préstamo']), false);
  assert.strictEqual(esFilaEncabezadoPrestamo([1, 'Inversiones San Jeronimo SpA', 'Autoland SAS']), false);
  assert.strictEqual(esFilaEncabezadoPrestamo([]), false);
  assert.strictEqual(esFilaEncabezadoPrestamo(null), false);
});

test('indicesColumnasPrestamo ubica cada columna de la fila real, sin colisiones', () => {
  const idx = indicesColumnasPrestamo(ENCABEZADO_PRESTAMOS);
  assert.strictEqual(idx.iCredito, 0);
  assert.strictEqual(idx.iOtorga, 1);
  assert.strictEqual(idx.iRecibe, 2);
  assert.strictEqual(idx.iFuente, 3);
  assert.strictEqual(idx.iFechaPacto, 4);
  assert.strictEqual(idx.iValorMoneda, 5, 'valor del desembolso en moneda pactada, no en COP');
  assert.strictEqual(idx.iMoneda, 6);
  assert.strictEqual(idx.iNumDesembolsos, 7);
  assert.strictEqual(idx.iFechaDesembolso, 8);
  assert.strictEqual(idx.iValorCOP, 9, 'valor en COP EN LA FECHA DE DESEMBOLSO, no el saldo');
  assert.strictEqual(idx.iSaldoCOP, 10);
  assert.strictEqual(idx.iInteresesMoneda, 11, 'intereses en moneda pactada, no en COP');
  assert.strictEqual(idx.iInteresesCOP, 12);
  assert.strictEqual(idx.iPlazo, 13);
  assert.strictEqual(idx.iRenovado, 14);
  assert.strictEqual(idx.iCancelado, 15);
  assert.strictEqual(idx.iTasaEA, 16);
  assert.strictEqual(idx.iTasaPactada, 17);
  assert.strictEqual(idx.iPeriodicidad, 18);
  // Verificar que no hay dos campos que resuelvan al mismo índice (no hay colisiones)
  const valores = Object.values(idx);
  assert.strictEqual(new Set(valores).size, valores.length, 'ningún campo debe resolver al mismo índice que otro');
});

test('indicesColumnasPrestamo devuelve -1 para columnas ausentes', () => {
  const idx = indicesColumnasPrestamo(['Crédito', 'Razón Social de quien otorga el préstamo']);
  assert.strictEqual(idx.iRecibe, -1);
  assert.strictEqual(idx.iTasaEA, -1);
});
