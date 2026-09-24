import XLSX from 'xlsx-js-style';

/* Mismo criterio de normalización que usa excelOperationsParser.js para nombres de hoja:
   cada contribuyente titula sus columnas a su manera y no hay que exigir el texto exacto de
   la plantilla. */
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** ¿Esta fila es la de encabezados de la hoja de préstamos? */
export function esFilaEncabezadoPrestamo(fila) {
  const s = (fila || []).map(norm).join(' ');
  return s.includes('credito') && s.includes('razon social');
}

/**
 * Dónde está cada dato en la fila de encabezados de la hoja de préstamos. A diferencia de
 * `indicesDeEncabezado` (excelOperationsParser.js), esta hoja no comparte ninguna columna
 * con el formato genérico de vinculados/paraísos fiscales.
 */
export function indicesColumnasPrestamo(encabezado) {
  const fila = (encabezado || []).map(norm);
  const encuentra = (pred) => fila.findIndex(pred);
  return {
    iCredito: encuentra(s => s.includes('credito')),
    iOtorga: encuentra(s => s.includes('otorga')),
    iRecibe: encuentra(s => s.includes('recibe')),
    iFuente: encuentra(s => s.includes('fuente de los recursos')),
    iFechaPacto: encuentra(s => s.includes('fecha original')),
    // Sin excluir "cop" aquí, "valor del desembolso en la moneda pactada" y "valor en cop
    // en la fecha de desembolso" no colisionan porque ninguna contiene el texto de la otra;
    // el filtro real que hace falta es el de iValorCOP, más abajo.
    iValorMoneda: encuentra(s => s.includes('valor del desembolso')),
    iMoneda: encuentra(s => s.includes('moneda pactada') && !s.includes('valor del desembolso')),
    // "No. de desembolsos" es la única columna en plural; las otras tres que mencionan
    // "desembolso" lo hacen en singular.
    iNumDesembolsos: encuentra(s => s.includes('desembolsos')),
    iFechaDesembolso: encuentra(s => s.includes('fecha de desembolso')),
    // Necesita las dos palabras: "valor en cop" sola también calza con el saldo al 31 de
    // diciembre, que es una columna distinta.
    iValorCOP: encuentra(s => s.includes('valor en cop') && s.includes('desembolso')),
    iSaldoCOP: encuentra(s => s.includes('saldo al 31')),
    iInteresesMoneda: encuentra(s => s.includes('monto de intereses') && !s.includes('cop')),
    iInteresesCOP: encuentra(s => s.includes('monto de intereses') && s.includes('cop')),
    iPlazo: encuentra(s => s === 'plazo'),
    iRenovado: encuentra(s => s.includes('renovado')),
    iCancelado: encuentra(s => s.includes('cancelado')),
    iTasaEA: encuentra(s => s.includes('efectiva anual')),
    iTasaPactada: encuentra(s => s.includes('tasa de interes pactada')),
    iPeriodicidad: encuentra(s => s.includes('periodicidad')),
  };
}

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
