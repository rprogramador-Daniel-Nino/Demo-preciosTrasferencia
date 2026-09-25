import { fmt, num } from '../utils/calculations.js';

export const NOMBRES_TABLA_PRESTAMO = [
  'Préstamo con su vinculado',
  'Préstamos con su vinculado',
];

const normalizarNombreCompania = (s) =>
  String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();

function vinculadoDePrestamo(fila, ent) {
  const entNorm = normalizarNombreCompania(ent);
  if (normalizarNombreCompania(fila.recibe) === entNorm) return fila.otorga;
  if (normalizarNombreCompania(fila.otorga) === entNorm) return fila.recibe;
  return fila.otorga || fila.recibe || 'el vinculado';
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

export function filasPrestamoConVinculado(estudio) {
  if (!tienePrestamos(estudio)) return null;
  const e = estudio;
  const vinculado = vinculadoDePrestamo(e.prestamos[0], e.ent);
  const moneda = e.prestamos[0].moneda || 'moneda pactada';
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
    filas: e.prestamos.map((p) => [
      fechaTexto(p.fechaPacto),
      montoTexto(p.valorDesembolsoMoneda),
      p.moneda || '—',
      montoTexto(p.valorCOPDesembolso),
      p.tasaEA || '—',
    ]),
    fuente: 'Información suministrada por ' + (e.ent || 'la Compañía') + '.',
  };
}
