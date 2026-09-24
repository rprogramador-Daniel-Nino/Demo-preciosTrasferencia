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
    iMoneda: encuentra(s => s === 'moneda pactada'),
    // "No. de desembolsos" es la única columna en plural; las otras tres que mencionan
    // "desembolso" lo hacen en singular.
    iNumDesembolsos: encuentra(s => s.includes('desembolsos')),
    iFechaDesembolso: encuentra(s => s === 'fecha de desembolso'),
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

function numero(valor) {
  const n = parseFloat(String(valor ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function texto(valor) {
  return String(valor ?? '').trim();
}

/**
 * Lee las filas de una hoja de préstamos ya convertida a arreglo de arreglos
 * (`XLSX.utils.sheet_to_json(sh, {header:1, defval:''})`). Devuelve `[]` si no encuentra la
 * fila de encabezados en las primeras 25 filas, o si no hay ninguna fila de datos válida.
 *
 * @param {Array<Array>} datos
 * @param {{esParaisoFiscal?: boolean}} [opciones]
 */
export function parseHojaPrestamos(datos, { esParaisoFiscal = false } = {}) {
  if (!datos || !datos.length) return [];

  let encIdx = -1;
  for (let i = 0; i < Math.min(datos.length, 25); i++) {
    if (esFilaEncabezadoPrestamo(datos[i])) { encIdx = i; break; }
  }
  if (encIdx === -1) return [];

  const idx = indicesColumnasPrestamo(datos[encIdx]);
  const col = (f, i) => (i > -1 ? f[i] : '');
  const filas = [];

  for (let i = encIdx + 1; i < datos.length; i++) {
    const f = datos[i] || [];
    const otorga = texto(col(f, idx.iOtorga));
    const recibe = texto(col(f, idx.iRecibe));
    // Filas de plantilla sin diligenciar (el formato trae varias en blanco por si el
    // contribuyente tiene más préstamos que filas de ejemplo) no son operaciones reales.
    if (!otorga || !recibe) continue;

    filas.push({
      credito: texto(col(f, idx.iCredito)),
      otorga,
      recibe,
      fuente: texto(col(f, idx.iFuente)),
      fechaPacto: fechaISODeSerialExcel(col(f, idx.iFechaPacto)),
      valorDesembolsoMoneda: numero(col(f, idx.iValorMoneda)),
      moneda: texto(col(f, idx.iMoneda)),
      numDesembolsos: texto(col(f, idx.iNumDesembolsos)),
      fechaDesembolso: fechaISODeSerialExcel(col(f, idx.iFechaDesembolso)),
      valorCOPDesembolso: numero(col(f, idx.iValorCOP)),
      saldoCOP: numero(col(f, idx.iSaldoCOP)),
      interesesMoneda: numero(col(f, idx.iInteresesMoneda)),
      interesesCOP: numero(col(f, idx.iInteresesCOP)),
      plazo: texto(col(f, idx.iPlazo)),
      renovado: texto(col(f, idx.iRenovado)),
      cancelado: texto(col(f, idx.iCancelado)),
      tasaEA: texto(col(f, idx.iTasaEA)),
      tasaPactada: texto(col(f, idx.iTasaPactada)),
      periodicidad: texto(col(f, idx.iPeriodicidad)),
      esParaisoFiscal,
    });
  }

  return filas;
}
