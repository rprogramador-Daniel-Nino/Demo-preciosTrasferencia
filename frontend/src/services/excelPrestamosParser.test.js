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

test('fechaDeSerialExcel devuelve null para vacío, texto de plantilla o cero', () => {
  assert.strictEqual(fechaDeSerialExcel(''), null);
  assert.strictEqual(fechaDeSerialExcel('DD/MM/AAAA'), null);
  assert.strictEqual(fechaDeSerialExcel(0), null);
  assert.strictEqual(fechaDeSerialExcel(null), null);
  assert.strictEqual(fechaDeSerialExcel(undefined), null);
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
