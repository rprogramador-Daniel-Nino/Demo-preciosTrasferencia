import XLSX from 'xlsx-js-style';

/* Convierte una fecha serial de Excel (días desde el 30/12/1899) a un objeto Date. Solo se
   usa para las columnas de fecha de la hoja de préstamos: el resto del parser de
   operaciones lee todas las hojas como texto plano
   (`sheet_to_json(sh, {header:1, defval:''})`), y activar `cellDates:true` globalmente en
   `XLSX.read` arriesgaba cambiar ese comportamiento en hojas que hoy funcionan bien. */
export function fechaDeSerialExcel(valor) {
  if (valor instanceof Date) return valor;
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return null;
  const parsed = XLSX.SSF.parse_date_code(n);
  if (!parsed) return null;
  const { y, m, d } = parsed;
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/* Fecha en formato ISO de solo fecha ("AAAA-MM-DD"), no un objeto Date: `study` se guarda
   tal cual en localStorage (JSON, donde un Date se vuelve texto y no se revive al releer) y
   en Firestore (donde un Date se vuelve Timestamp, con otra forma). Un string ISO viaja
   igual por las dos rutas y se reconstruye al mostrarlo, así que es lo único seguro de
   guardar en el estudio. */
export function fechaISODeSerialExcel(valor) {
  const fecha = fechaDeSerialExcel(valor);
  if (!fecha) return null;
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
