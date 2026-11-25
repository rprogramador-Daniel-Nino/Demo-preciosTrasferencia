const { test } = require('node:test');
const assert = require('node:assert');
const {
  peticionAutenticada, tokenDeLaPeticion, cuentaPermitida, proyectosAceptados, PROYECTOS_VALIDOS,
} = require('./verificarSesion');

const CLAIMS_OK = { email: 'ana@crconsultorescolombia.com', email_verified: true };

test('tokenDeLaPeticion extrae el token del header Bearer', () => {
  const req = { get: (h) => (h === 'authorization' ? 'Bearer abc.def.ghi' : '') };
  assert.strictEqual(tokenDeLaPeticion(req), 'abc.def.ghi');
});

test('tokenDeLaPeticion devuelve vacío sin cabecera, o con otro esquema', () => {
  assert.strictEqual(tokenDeLaPeticion({ get: () => '' }), '');
  assert.strictEqual(tokenDeLaPeticion({ get: (h) => (h === 'authorization' ? 'Basic xyz' : '') }), '');
});

test('acepta cuando el verificador inyectado dice que el token es válido', async () => {
  const req = { get: (h) => (h === 'authorization' ? 'Bearer token-valido' : '') };
  const verificar = async (token) => (token === 'token-valido' ? CLAIMS_OK : null);
  assert.strictEqual(await peticionAutenticada(req, verificar), true);
});

test('rechaza sin token, sin siquiera llamar al verificador', async () => {
  const req = { get: () => '' };
  let llamado = false;
  const resultado = await peticionAutenticada(req, async () => { llamado = true; return CLAIMS_OK; });
  assert.strictEqual(resultado, false);
  assert.strictEqual(llamado, false);
});

test('rechaza si el verificador lanza (token vencido o inválido)', async () => {
  const req = { get: (h) => (h === 'authorization' ? 'Bearer token-vencido' : '') };
  const verificar = async () => { throw new Error('Firebase ID token has expired'); };
  assert.strictEqual(await peticionAutenticada(req, verificar), false);
});

test('rechaza si el verificador devuelve false (token de otro proyecto)', async () => {
  const req = { get: (h) => (h === 'authorization' ? 'Bearer token-de-otro-proyecto' : '') };
  assert.strictEqual(await peticionAutenticada(req, async () => false), false);
});

test('rechaza un token válido de una cuenta fuera de los dominios del despacho', async () => {
  const req = { get: (h) => (h === 'authorization' ? 'Bearer t' : '') };
  const ajena = async () => ({ email: 'alguien@gmail.com', email_verified: true });
  assert.strictEqual(await peticionAutenticada(req, ajena), false);
});

test('cuentaPermitida exige correo verificado y dominio exacto', () => {
  assert.strictEqual(cuentaPermitida(CLAIMS_OK), true);
  assert.strictEqual(cuentaPermitida({ email: 'Ana@Scientia-Legal.com', email_verified: true }), true);
  assert.strictEqual(cuentaPermitida({ ...CLAIMS_OK, email_verified: false }), false);
  assert.strictEqual(cuentaPermitida({ email: 'x@evilcrconsultorescolombia.com', email_verified: true }), false);
  assert.strictEqual(cuentaPermitida({ email: 'x@crconsultorescolombia.com.co', email_verified: true }), false);
  assert.strictEqual(cuentaPermitida(null), false);
  assert.strictEqual(cuentaPermitida(true), false);
});

test('proyectosAceptados: desplegada solo acepta su proyecto; local, los dos', () => {
  assert.deepStrictEqual(proyectosAceptados({ GCLOUD_PROJECT: 'precios-trasnferencia' }), ['precios-trasnferencia']);
  assert.deepStrictEqual(proyectosAceptados({ GCLOUD_PROJECT: 'precios-trasnferencia-pruebas' }), ['precios-trasnferencia-pruebas']);
  assert.deepStrictEqual(proyectosAceptados({}), PROYECTOS_VALIDOS);
});
