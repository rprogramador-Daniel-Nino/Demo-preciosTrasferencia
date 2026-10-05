import { test } from 'node:test';
import assert from 'node:assert';
import {
  filasTablaTransaccionesPrestamos, filasTablaHistoricoDeudaPrestamos, aMatrizPlana,
  tipoOperacionPrestamo, prestamosConMasDeUnVinculado,
  NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS,
} from './tablasPrestamoColumnas.js';

/* Mismos cuatro préstamos que usa tablasPrestamos.test.js (Autoland 2025), con los campos
   adicionales que la Fase 2 no usa pero sí usa esta tabla — intereses, fecha de desembolso y
   periodicidad —, tomados del informe real ya radicado. Permite comparar las cifras de las
   dos tablas contra la misma fuente. */
const PRESTAMOS_AUTOLAND = [
  {
    otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS',
    fechaPacto: '2020-10-27', fechaDesembolso: '2020-10-27',
    valorDesembolsoMoneda: 3000000, moneda: 'USD', valorCOPDesembolso: 10431000000,
    saldoCOP: 9000000000, interesesCOP: 545267665,
    tasaEA: '4,540% E.A.', periodicidad: '12 meses',
  },
  {
    otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS',
    fechaPacto: '2022-07-07', fechaDesembolso: '2022-07-07',
    valorDesembolsoMoneda: 2000000, moneda: 'USD', valorCOPDesembolso: 8822000000,
    saldoCOP: 8000000000, interesesCOP: 480413482,
    tasaEA: '6,000% E.A.', periodicidad: '6 meses',
  },
  {
    otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS',
    fechaPacto: '2022-10-24', fechaDesembolso: '2022-10-24',
    valorDesembolsoMoneda: 1300000, moneda: 'USD', valorCOPDesembolso: 6194500000,
    saldoCOP: 6000000000, interesesCOP: 312268763,
    tasaEA: '6,000% E.A.', periodicidad: '6 meses',
  },
  {
    otorga: 'Inversiones San Jeronimo SpA', recibe: 'Autoland SAS',
    fechaPacto: '2023-03-09', fechaDesembolso: '2023-03-09',
    valorDesembolsoMoneda: 4300000, moneda: 'USD', valorCOPDesembolso: 20657200000,
    saldoCOP: 19000000000, interesesCOP: 1032888986,
    tasaEA: '6,000% E.A.', periodicidad: 'Exigible',
  },
];

const ESTUDIO_PRESTAMO = {
  ent: 'Autoland SAS', nit: '900123456-7', anio: 2025, tipo_estudio: 'prestamo',
  prestamos: PRESTAMOS_AUTOLAND,
  vinc: 'Inversiones San Jeronimo SpA', vinc_id: '76.421.180-4', pais_vinc: 'Chile',
  tipo_vinculacion: 'Articulo 260-1 E.T – Literal 1',
};

const filaDe = (tabla, clave) => tabla.filas.find((f) => f.clave === clave);

test('filasTablaTransaccionesPrestamos: null cuando el estudio no es de tipo préstamo', () => {
  assert.strictEqual(filasTablaTransaccionesPrestamos({ ...ESTUDIO_PRESTAMO, tipo_estudio: 'estandar' }), null);
  assert.strictEqual(filasTablaTransaccionesPrestamos({ ...ESTUDIO_PRESTAMO, prestamos: [] }), null);
  assert.strictEqual(filasTablaTransaccionesPrestamos(null), null);
});

test('filasTablaTransaccionesPrestamos: una etiqueta por préstamo, en orden', () => {
  const t = filasTablaTransaccionesPrestamos(ESTUDIO_PRESTAMO);
  assert.deepStrictEqual(t.etiquetasPrestamo, ['Préstamo 1', 'Préstamo 2', 'Préstamo 3', 'Préstamo 4']);
});

test('filasTablaTransaccionesPrestamos: las filas fusionadas vienen de los campos del vinculado', () => {
  const t = filasTablaTransaccionesPrestamos(ESTUDIO_PRESTAMO);
  assert.strictEqual(filaDe(t, 'razonSocial').valor, 'Inversiones San Jeronimo SpA');
  assert.strictEqual(filaDe(t, 'idFiscal').valor, '76.421.180-4');
  assert.strictEqual(filaDe(t, 'pais').valor, 'Chile');
  assert.strictEqual(filaDe(t, 'tipoVinculacion').valor, 'Articulo 260-1 E.T – Literal 1');
});

test('filasTablaTransaccionesPrestamos: "Monto en Principal" es valorCOPDesembolso, no saldoCOP', () => {
  /* Confirmado cifra a cifra contra el documento real de Autoland y contra la prueba ya
     existente de la Fase 2 (tablasPrestamos.test.js): son los mismos cuatro montos. */
  const t = filasTablaTransaccionesPrestamos(ESTUDIO_PRESTAMO);
  assert.deepStrictEqual(
    filaDe(t, 'montoPrincipal').valores,
    ['10.431.000.000', '8.822.000.000', '6.194.500.000', '20.657.200.000'],
  );
});

test('filasTablaTransaccionesPrestamos: monto de intereses, fecha de desembolso y periodicidad por préstamo', () => {
  const t = filasTablaTransaccionesPrestamos(ESTUDIO_PRESTAMO);
  assert.deepStrictEqual(
    filaDe(t, 'montoIntereses').valores,
    ['545.267.665', '480.413.482', '312.268.763', '1.032.888.986'],
  );
  assert.deepStrictEqual(
    filaDe(t, 'fechaDesembolso').valores,
    ['27 de octubre de 2020', '7 de julio de 2022', '24 de octubre de 2022', '9 de marzo de 2023'],
  );
  assert.deepStrictEqual(
    filaDe(t, 'periodicidad').valores,
    ['12 meses', '6 meses', '6 meses', 'Exigible'],
  );
});

test('filasTablaTransaccionesPrestamos: "Tasa Pactada" es el campo tal cual, sin prefijos inventados', () => {
  /* El documento real trae «Préstamo 4,540% E.A.» — confirmado que es un artefacto de edición
     manual de ese cliente, no un patrón a replicar. */
  const t = filasTablaTransaccionesPrestamos(ESTUDIO_PRESTAMO);
  assert.deepStrictEqual(
    filaDe(t, 'tasaPactada').valores,
    ['4,540% E.A.', '6,000% E.A.', '6,000% E.A.', '6,000% E.A.'],
  );
});

test('filasTablaHistoricoDeudaPrestamos: mismo molde sin intereses, fecha de desembolso ni periodicidad', () => {
  const t13 = filasTablaHistoricoDeudaPrestamos(ESTUDIO_PRESTAMO);
  const claves = t13.filas.map((f) => f.clave || f.tipo);
  assert.ok(!claves.includes('montoIntereses'));
  assert.ok(!claves.includes('fechaDesembolso'));
  assert.ok(!claves.includes('periodicidad'));
  assert.ok(claves.includes('razonSocial'));
  assert.ok(claves.includes('tasaPactada'));
  assert.ok(claves.includes('montoPrincipal'));
  assert.strictEqual(t13.nombre, NOMBRE_TABLA_HISTORICO_DEUDA_PRESTAMOS);
});

test('filasTablaHistoricoDeudaPrestamos: null cuando no aplica, igual que la tabla completa', () => {
  assert.strictEqual(filasTablaHistoricoDeudaPrestamos({ ...ESTUDIO_PRESTAMO, tipo_estudio: 'estandar' }), null);
});

test('tipoOperacionPrestamo: usa vinc_tipo si ya declara un concepto de intereses sobre préstamos', () => {
  const concepto = tipoOperacionPrestamo({ ...ESTUDIO_PRESTAMO, vinc_tipo: 'Intereses sobre préstamos (42)' });
  assert.strictEqual(concepto, 'Intereses sobre préstamos (42)');
});

test('tipoOperacionPrestamo: cae en el catálogo DIAN cuando vinc_tipo no aplica', () => {
  assert.strictEqual(tipoOperacionPrestamo(ESTUDIO_PRESTAMO), 'Intereses sobre préstamos (42)');
  assert.strictEqual(tipoOperacionPrestamo({ ...ESTUDIO_PRESTAMO, egreso: false }), 'Intereses sobre préstamos (13)');
});

test('prestamosConMasDeUnVinculado: detecta más de una contraparte distinta', () => {
  assert.strictEqual(prestamosConMasDeUnVinculado(ESTUDIO_PRESTAMO), false);
  const conOtroVinculado = {
    ...ESTUDIO_PRESTAMO,
    prestamos: [...PRESTAMOS_AUTOLAND, { ...PRESTAMOS_AUTOLAND[0], otorga: 'Otra Matriz SA' }],
  };
  assert.strictEqual(prestamosConMasDeUnVinculado(conOtroVinculado), true);
});

test('filasTablaTransaccionesPrestamos: avisoVinculados solo cuando hace falta', () => {
  assert.strictEqual(filasTablaTransaccionesPrestamos(ESTUDIO_PRESTAMO).avisoVinculados, null);
  const conOtroVinculado = {
    ...ESTUDIO_PRESTAMO,
    prestamos: [...PRESTAMOS_AUTOLAND, { ...PRESTAMOS_AUTOLAND[0], otorga: 'Otra Matriz SA' }],
  };
  assert.match(filasTablaTransaccionesPrestamos(conOtroVinculado).avisoVinculados, /más de un vinculado/);
});

test('aMatrizPlana: la fila banner sale en blanco salvo la etiqueta', () => {
  const plano = aMatrizPlana(filasTablaTransaccionesPrestamos(ESTUDIO_PRESTAMO));
  const banner = plano.filas[0];
  assert.strictEqual(banner[0], 'Compañía Vinculada');
  assert.deepStrictEqual(banner.slice(1), ['', '', '', '']);
});

test('aMatrizPlana: las filas fusionadas repiten el valor en cada columna de préstamo', () => {
  const plano = aMatrizPlana(filasTablaTransaccionesPrestamos(ESTUDIO_PRESTAMO));
  const razonSocial = plano.filas.find((f) => f[0] === 'Razón social');
  assert.deepStrictEqual(razonSocial.slice(1), Array(4).fill('Inversiones San Jeronimo SpA'));
});

test('aMatrizPlana: encabezados trae una columna por préstamo más el rótulo', () => {
  const plano = aMatrizPlana(filasTablaTransaccionesPrestamos(ESTUDIO_PRESTAMO));
  assert.deepStrictEqual(plano.encabezados, ['Nº de prestamos', 'Préstamo 1', 'Préstamo 2', 'Préstamo 3', 'Préstamo 4']);
});

test('aMatrizPlana: null si la tabla es null', () => {
  assert.strictEqual(aMatrizPlana(null), null);
});
