import { test } from 'node:test';
import assert from 'node:assert';
import {
  JURISDICCIONES_NO_COOPERANTES_DEFAULT, esJurisdiccionNoCooperante,
} from './jurisdiccionesNoCooperantes.js';

test('JURISDICCIONES_NO_COOPERANTES_DEFAULT trae las 25 jurisdicciones del Artículo 1.2.2.5.1, todas activas', () => {
  assert.strictEqual(JURISDICCIONES_NO_COOPERANTES_DEFAULT.length, 25);
  JURISDICCIONES_NO_COOPERANTES_DEFAULT.forEach((j) => {
    assert.strictEqual(typeof j.nombre, 'string');
    assert.ok(j.nombre.length > 0);
    assert.strictEqual(j.activo, true);
  });
  assert.ok(JURISDICCIONES_NO_COOPERANTES_DEFAULT.some((j) => j.nombre === 'Reino de Bahréin'));
  assert.ok(JURISDICCIONES_NO_COOPERANTES_DEFAULT.some((j) => j.nombre === 'Macao'));
});

test('esJurisdiccionNoCooperante: coincide con el nombre oficial completo', () => {
  assert.strictEqual(
    esJurisdiccionNoCooperante('Macao', JURISDICCIONES_NO_COOPERANTES_DEFAULT), true,
  );
});

test('esJurisdiccionNoCooperante: coincide con el nombre corto de uso común, no solo el nombre legal largo', () => {
  /* `pais_vinc` lo llena el analista con el nombre común ("Bahréin", "Omán", "Qatar"), no
     con la denominación legal completa del Decreto ("Reino de Bahréin", "Sultanía de Omán",
     "Estado de Qatar"). Sin esta tolerancia, la validación automática nunca encontraría una
     coincidencia real y el analista tendría que marcar el campo a mano de todos modos —el
     punto que el usuario pidió evitar. */
  assert.strictEqual(esJurisdiccionNoCooperante('Bahréin', JURISDICCIONES_NO_COOPERANTES_DEFAULT), true);
  assert.strictEqual(esJurisdiccionNoCooperante('Omán', JURISDICCIONES_NO_COOPERANTES_DEFAULT), true);
  assert.strictEqual(esJurisdiccionNoCooperante('Qatar', JURISDICCIONES_NO_COOPERANTES_DEFAULT), true);
  assert.strictEqual(esJurisdiccionNoCooperante('Trinidad y Tobago', JURISDICCIONES_NO_COOPERANTES_DEFAULT), true);
  assert.strictEqual(esJurisdiccionNoCooperante('Bahamas', JURISDICCIONES_NO_COOPERANTES_DEFAULT), true);
});

test('esJurisdiccionNoCooperante: ignora mayúsculas y tildes', () => {
  assert.strictEqual(esJurisdiccionNoCooperante('BAHREIN', JURISDICCIONES_NO_COOPERANTES_DEFAULT), true);
  assert.strictEqual(esJurisdiccionNoCooperante('  macao  ', JURISDICCIONES_NO_COOPERANTES_DEFAULT), true);
});

test('esJurisdiccionNoCooperante: false para un país que no está en la lista', () => {
  assert.strictEqual(esJurisdiccionNoCooperante('Chile', JURISDICCIONES_NO_COOPERANTES_DEFAULT), false);
  assert.strictEqual(esJurisdiccionNoCooperante('Estados Unidos', JURISDICCIONES_NO_COOPERANTES_DEFAULT), false);
});

test('esJurisdiccionNoCooperante: false sin país, sin lista, o con la jurisdicción marcada inactiva', () => {
  assert.strictEqual(esJurisdiccionNoCooperante('', JURISDICCIONES_NO_COOPERANTES_DEFAULT), false);
  assert.strictEqual(esJurisdiccionNoCooperante(null, JURISDICCIONES_NO_COOPERANTES_DEFAULT), false);
  assert.strictEqual(esJurisdiccionNoCooperante('Macao', []), false);
  assert.strictEqual(esJurisdiccionNoCooperante('Macao', null), false);
  /* Una jurisdicción que SALIÓ de la lista vigente se marca `activo:false` en vez de
     borrarse —así queda el rastro histórico de que alguna vez aplicó—, y por eso mismo no
     debe contar para un estudio de hoy. */
  assert.strictEqual(
    esJurisdiccionNoCooperante('Macao', [{ nombre: 'Macao', activo: false }]), false,
  );
});
