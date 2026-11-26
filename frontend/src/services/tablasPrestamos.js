import { fmt, num } from '../utils/calculations.js';

export const NOMBRES_TABLA_PRESTAMO = [
  'Préstamo con su vinculado',
  'Préstamos con su vinculado',
];

const normalizarNombreCompania = (s) =>
  String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Quien NO es el contribuyente (`ent`) en la fila de un préstamo: el vinculado real,
 *  nunca `estudio.vinc` —un campo del motor de márgenes que puede quedar sin llenar o
 *  desactualizado en un estudio de préstamo (reportado el 2026-10-09: "BRUNO FRITSCH SA",
 *  el nombre de otro cliente, en un estudio real de Autoland). Exportada para que
 *  `docxRelleno.js` identifique al mismo vinculado en cualquier tabla genérica que
 *  necesite su nombre para préstamo (Tabla 11 «Vinculado económica», Tabla 12 «Criterios
 *  de vinculación»), con el mismo criterio que ya usa la Tabla 1. */
export function vinculadoDePrestamo(fila, ent) {
  const entNorm = normalizarNombreCompania(ent);
  if (normalizarNombreCompania(fila.recibe) === entNorm) return fila.otorga;
  if (normalizarNombreCompania(fila.otorga) === entNorm) return fila.recibe;
  return fila.otorga || fila.recibe || 'el vinculado';
}

/**
 * 'pasivo' si `ent` recibe el préstamo (es deudor), 'activo' si `ent` lo otorga (es
 * acreedor), `null` si ninguno de los dos lados coincide con `ent` (dato inconsistente — no
 * se asume una dirección sin evidencia).
 */
export function direccionPrestamo(fila, ent) {
  const entNorm = normalizarNombreCompania(ent);
  if (normalizarNombreCompania(fila.recibe) === entNorm) return 'pasivo';
  if (normalizarNombreCompania(fila.otorga) === entNorm) return 'activo';
  return null;
}

/** Dirección del estudio completo: la de `prestamos[0]` (mismo criterio de "un solo
 *  vinculado" que ya usan Tabla 1/4/13 — la Fase 7 lo generaliza por grupo). */
export function direccionPrestamoEstudio(estudio) {
  if (!tienePrestamos(estudio)) return null;
  return direccionPrestamo(estudio.prestamos[0], estudio.ent);
}

function fechaTexto(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

const montoTexto = (v) => {
  const n = num(v);
  return n === null ? '—' : fmt(n);
};

export function tienePrestamos(estudio) {
  return !!estudio && estudio.tipo_estudio === 'prestamo'
    && Array.isArray(estudio.prestamos) && estudio.prestamos.length > 0;
}

/**
 * Tabla 11 — «Vinculado económica»: identificación genérica del vinculado, presente en
 * cualquier tipo de estudio. Para préstamo no existía ningún código que la llenara —se
 * quedaba con lo que trajera la plantilla reutilizada de otro informe, incluido el nombre
 * de otro cliente (reportado el 2026-10-09: "BRUNO FRITSCH SA" en un estudio de Autoland).
 *
 * El nombre usa la MISMA identificación otorga/recibe que ya usa `filasPrestamoConVinculado`
 * (Tabla 1) — nunca `estudio.vinc`, que es un campo del motor de márgenes y puede quedar
 * desactualizado o sin llenar en un estudio de préstamo. País e identificación fiscal sí son
 * genéricos del estudio (`pais_vinc`/`vinc_id`): un préstamo no trae esos datos por fila.
 */
export function filasVinculadoEconomicoPrestamo(estudio) {
  if (!tienePrestamos(estudio)) return null;
  const e = estudio;
  const nombre = vinculadoDePrestamo(e.prestamos[0], e.ent);
  return {
    nombre: 'Vinculado económica',
    encabezados: ['Nombre Vinculada', 'País', 'Identificación Fiscal'],
    filas: [[nombre, e.pais_vinc || '—', e.vinc_id || '—']],
    fuente: 'Información suministrada por ' + (e.ent || 'la Compañía') + '.',
  };
}

/**
 * Agrupa `estudio.prestamos` por contraparte distinta (normalizada, mismo criterio que
 * `vinculadoDePrestamo`), en el orden en que cada una aparece por primera vez. Caso real que
 * lo exige: Sungrow 2024 tuvo dos vinculados de préstamo distintos (Singapur y Chile) en el
 * mismo estudio.
 */
export function gruposDePrestamos(estudio) {
  if (!tienePrestamos(estudio)) return [];
  const porClave = new Map();
  estudio.prestamos.forEach((p) => {
    const vinculado = vinculadoDePrestamo(p, estudio.ent);
    const clave = normalizarNombreCompania(vinculado);
    if (!porClave.has(clave)) porClave.set(clave, { vinculado, prestamos: [] });
    porClave.get(clave).prestamos.push(p);
  });
  return [...porClave.values()];
}

/**
 * Una tabla por cada vinculado distinto (`gruposDePrestamos`) — antes de la Fase 7 se
 * devolvía un solo objeto, forzando todas las filas bajo el vinculado de la primera. `null`
 * si NINGÚN grupo tiene un préstamo con desembolso real.
 */
export function filasPrestamoConVinculado(estudio) {
  if (!tienePrestamos(estudio)) return null;
  const e = estudio;
  const tablas = gruposDePrestamos(e).map(({ vinculado, prestamos }) => {
    /* Sin un Valor en COP real en la fecha de desembolso, la fila no es un préstamo nuevo
       que declarar aquí: un abono a capital o un movimiento sin desembolso real llega del
       Excel con `valorCOPDesembolso` en 0 o ausente (visto en un informe real: dos filas con
       monto negativo y "0" de COP) — pedido el 2026-10-10. Se excluye de ESTA tabla nada
       más; el préstamo sigue existiendo en `estudio.prestamos` para lo que otras tablas
       necesiten. */
    const prestamosConDesembolso = prestamos.filter((p) => num(p.valorCOPDesembolso) > 0);
    if (!prestamosConDesembolso.length) return null;
    const moneda = prestamosConDesembolso[0].moneda || 'moneda pactada';
    return {
      nombre: 'Préstamo con su vinculado',
      vinculado,
      encabezados: [
        'Fecha original en la que se pactó',
        `Valor del desembolso en ${moneda}`,
        'Moneda pactada',
        'Valor en COP en la fecha de desembolso',
        'E. A',
      ],
      filas: prestamosConDesembolso.map((p) => [
        fechaTexto(p.fechaPacto),
        montoTexto(p.valorDesembolsoMoneda),
        p.moneda || '—',
        montoTexto(p.valorCOPDesembolso),
        p.tasaEA || '—',
      ]),
      fuente: 'Información suministrada por ' + (e.ent || 'la Compañía') + '.',
    };
  }).filter(Boolean);
  return tablas.length ? tablas : null;
}
