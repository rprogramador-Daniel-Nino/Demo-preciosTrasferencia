/* ─────────────────────────────────────────────────────────────────────────────
   tablasPrestamoTasas.js — Fase 4 de los estudios tipo préstamo: las filas de las
   tablas "Rango intercuartil" (Tabla 6/20), "Tasas seleccionadas" (Tabla 18) y
   "Análisis de las tasas de interés ajustadas" (Tabla 19) del método PC.

   Solo datos — sin OOXML ni HTML, igual que `tablasPrestamoColumnas.js` (Fase 3). Por
   decisión explícita de alcance, esta fase no inserta nada todavía en ninguna de las tres
   rutas de generación del informe; eso es la Fase 5.

   No toca `tablasPrestamos.js` (Fase 2) ni `tablasPrestamoColumnas.js` (Fase 3): solo
   importa `tienePrestamos` de la primera. El vinculado sale de `estudio.vinc` (campo de
   nivel superior), mismo criterio que ya usa la Fase 3 — no de `estudio.prestamos`.
   ───────────────────────────────────────────────────────────────────────────── */

import { fmt, num } from '../utils/calculations.js';
import { tienePrestamos, vinculadoDePrestamo, direccionPrestamoEstudio } from './tablasPrestamos.js';
import {
  serieDisponible, totalesPorFecha, rangoIntercuartil,
  trioDeDireccion, aplicaRiesgoPais, tasaEfectivaDeFila,
} from './prestamoTasasCalculo.js';

export const NOMBRE_TABLA_RANGO_INTERCUARTIL_PRESTAMO = 'Rango intercuartil';
export const NOMBRE_TABLA_TASAS_SELECCIONADAS = 'Tasas seleccionadas';
export const NOMBRE_TABLA_ANALISIS_TASAS_AJUSTADAS = 'Análisis de las tasas de interés ajustadas';

const SIN_DATO = '—';
const montoTexto = (v) => {
  const n = num(v);
  return n === null ? SIN_DATO : fmt(n);
};

/* dd/mm/aaaa, no new Date(iso): mismo motivo que `fechaTexto` de `tablasPrestamos.js:18-23`
   (new Date interpreta el ISO en UTC y corre la fecha un día hacia atrás en Colombia). */
function fechaCorta(iso) {
  if (!iso) return SIN_DATO;
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${d}/${m}/${y}` : SIN_DATO;
}

export function fechasPactoUnicas(estudio) {
  if (!tienePrestamos(estudio)) return [];
  const vistas = new Set();
  const fechas = [];
  estudio.prestamos.forEach((p) => {
    if (p.fechaPacto && !vistas.has(p.fechaPacto)) {
      vistas.add(p.fechaPacto);
      fechas.push(p.fechaPacto);
    }
  });
  return fechas;
}

/**
 * Tabla 6/20 "Rango intercuartil": una fila por préstamo, con el rango calculado a partir
 * de las tasas capturadas para SU fecha de pacto (`tasasPrestamo`, la forma que persiste
 * `estudio.tasasPrestamo`). Si para esa fecha no hay tasas capturadas, `rango` sale `null`
 * — la fila igual se construye, para que la vista previa muestre todos los préstamos.
 */
export function filasTablaRangoIntercuartil(estudio, tasasPrestamo) {
  if (!tienePrestamos(estudio)) return null;
  const direccion = direccionPrestamoEstudio(estudio);
  const trio = trioDeDireccion(direccion);
  const riesgoPais = aplicaRiesgoPais(direccion) ? tasasPrestamo?.riesgoPais?.valor : 0;
  const filas = estudio.prestamos.map((p) => {
    const tasasFecha = tasasPrestamo?.porFecha?.[p.fechaPacto];
    const totales = tasasFecha ? totalesPorFecha(tasasFecha, riesgoPais, trio) : null;
    return {
      /* Por fila, no una sola vez por estudio: cada préstamo puede traer su propio
         otorga/recibe (la Fase 7 generaliza esto a varios vinculados distintos). Nunca
         `estudio.vinc` — campo del motor de márgenes que puede quedar desactualizado o traer
         la contraparte equivocada (reportado 2026-11-25: "BRUNO FRITSCH SA" en vez del
         vinculado real de un estudio de préstamo). */
      vinculado: vinculadoDePrestamo(p, estudio.ent),
      fechaPacto: fechaCorta(p.fechaPacto),
      valorDesembolsoMoneda: montoTexto(p.valorDesembolsoMoneda),
      /* Texto para mostrar: el original del Excel/captura manual (tasaEA, o si falta,
         periodicidad/tasaPactada — p.ej. "LIBOR + 1 punto", nunca resuelto a número aquí). */
      tasaEA: p.tasaEA || p.periodicidad || p.tasaPactada || SIN_DATO,
      /* Número a usar para la posición frente al rango (Conclusión): resuelve índice+spread
         cuando no hay tasaEA directa — ver `tasaEfectivaDeFila`. */
      tasaResuelta: tasaEfectivaDeFila(p, tasasPrestamo),
      rango: totales ? rangoIntercuartil(totales) : null,
    };
  });
  return { nombre: NOMBRE_TABLA_RANGO_INTERCUARTIL_PRESTAMO, filas };
}

/* Texto verbatim del documento de referencia: son definiciones genéricas de qué es cada
   tasa de mercado, no cifras ni montos del cliente — "forma", no "datos del anterior"
   (misma distinción que ya se aplicó en Fase 2/3). Catálogo completo de las 5 series que el
   sistema reconoce; `filasTablaTasasSeleccionadas` filtra por el trío de la dirección. */
const CATALOGO_DESCRIPCIONES_TASAS = {
  prime: {
    tasa: 'PRIME RATE (DIARIA)',
    descripcion: 'La Prime rate publicada en el portal del Banco de la República de Colombia '
      + 'es calculada por Bloomberg L. P. Desde diciembre 9 de 2003, Bloomberg L. P. sigue el '
      + 'procedimiento definido por el Federal Reserve Bank para los cambios en la Prime rate. '
      + 'Esta Prime rate resulta de un cálculo matemático que depende del comportamiento que '
      + 'tengan las tasas de interés de 25 de los bancos más grandes de Estados Unidos. Cuando '
      + '13 de estos 25 bancos cambian su tasa de interés entonces la Prime rate calculada por '
      + 'Bloomberg también cambia. La Prime rate es un indicador de la tasa de interés más '
      + 'baja para préstamos ofrecida por los bancos a sus mejores clientes comerciales.',
    conclusion: 'Aceptado',
  },
  sofr: {
    tasa: 'SOFR (Promedio Mensual)',
    descripcion: 'Tasa de interés que mide el costo del dinero en dólares americanos, en un '
      + 'plazo de un día y que es calculada con base en operaciones de crédito garantizadas.',
    conclusion: 'Aceptado',
  },
  tmc: {
    tasa: 'Tasa interés Monetaria Banco de la República de Colombia, Promedio Mensual (TMC)',
    descripcion: 'La tasa de interés monetaria de Colombia, también conocida como la "tasa de '
      + 'interés de intervención" o "tasa de política monetaria", es la tasa de interés que '
      + 'establece el Banco de la República de Colombia, que es el banco central del país. '
      + 'Esta tasa se utiliza para influir en las condiciones monetarias y crediticias de la '
      + 'economía colombiana.',
    conclusion: 'Aceptado',
  },
  cirr: {
    tasa: 'CIRR (Diaria)',
    descripcion: 'Commercial Interest Reference Rate, acordada por los países pertenecientes a '
      + 'la OCDE (Arrangement on Officially Supported Export Credits, Anexo XVI). Su '
      + 'aplicación se da a los créditos de exportación financiados oficialmente.',
    conclusion: 'Aceptado',
  },
  libor: {
    tasa: 'LIBOR, Diaria (12 meses)',
    descripcion: 'London Interbank Offered Rate, tasa de referencia interbancaria en dólares '
      + 'americanos a 12 meses.',
    conclusion: 'Aceptado',
  },
};

/**
 * Tabla 18 "Tasas seleccionadas": las 3 tasas de referencia del trío (según la dirección del
 * préstamo — pasivo: PRIME+SOFR+TMC, activo: PRIME+CIRR+LIBOR) con su descripción y un
 * veredicto fijo "Aceptado", con el nombre del contribuyente en el banner. No depende de
 * `tasasPrestamo`: es la misma independientemente de qué cifras se hayan capturado.
 */
export function filasTablaTasasSeleccionadas(estudio) {
  if (!tienePrestamos(estudio)) return null;
  const trio = trioDeDireccion(direccionPrestamoEstudio(estudio));
  return {
    nombre: NOMBRE_TABLA_TASAS_SELECCIONADAS,
    banner: 'PRÉSTAMO DE ' + String(estudio.ent || 'LA COMPAÑÍA').toUpperCase(),
    filas: trio.map((serie) => CATALOGO_DESCRIPCIONES_TASAS[serie]),
  };
}

const ETIQUETA_SERIE = {
  prime: 'PRIME', tmc: 'TASA MONETARIA COLOM', sofr: 'SOFR', cirr: 'CIRR', libor: 'LIBOR',
};

/**
 * Tabla 19 "Análisis de las tasas de interés ajustadas": 3 filas (el trío de la dirección)
 * por cada fecha de pacto única — no por préstamo, varios préstamos con la misma fecha
 * comparten las mismas 3 filas. Omite una serie, sin fila ni cero, cuando no está disponible
 * para esa fecha (`serieDisponible` — SOFR antes de abril de 2018, LIBOR después de junio de
 * 2023). El riesgo país sale `null` cuando no aplica (préstamo activo), nunca un valor
 * fantasma.
 */
export function filasTablaAnalisisTasasAjustadas(estudio, tasasPrestamo) {
  if (!tienePrestamos(estudio)) return null;
  const direccion = direccionPrestamoEstudio(estudio);
  const trio = trioDeDireccion(direccion);
  const riesgoPaisAplica = aplicaRiesgoPais(direccion);
  const riesgoPais = riesgoPaisAplica ? tasasPrestamo?.riesgoPais?.valor : 0;
  const filas = fechasPactoUnicas(estudio).flatMap((fecha) => {
    const tasasFecha = tasasPrestamo?.porFecha?.[fecha];
    const totales = totalesPorFecha(tasasFecha, riesgoPais, trio);
    return trio
      .filter((serie) => serieDisponible(serie, fecha))
      .map((serie) => ({
        fechaPacto: fecha,
        tasa: ETIQUETA_SERIE[serie],
        porcentajeTasa: tasasFecha?.[serie]?.valor ?? null,
        moodys: tasasFecha?.moodys?.valor ?? null,
        riesgoPais: riesgoPaisAplica ? (riesgoPais ?? null) : null,
        total: totales[serie],
      }));
  });
  return { nombre: NOMBRE_TABLA_ANALISIS_TASAS_AJUSTADAS, filas };
}

/**
 * La "Conclusión" que sigue a la Tabla 6/20, verificada contra el informe real de
 * referencia (Autoland 2025): si la tasa pactada queda por debajo o por encima del rango
 * intercuartil es FAVORABLE o DESFAVORABLE según el sentido de la operación —un egreso
 * (`estudio.egreso !== false`, mismo criterio que ya usa `tablasPrestamoColumnas.js`)
 * erosiona base gravable si paga MÁS que el mercado (por encima), un ingreso si recibe
 * MENOS (por debajo)—. Dentro del rango es favorable para cualquiera de los dos sentidos.
 *
 * Por decisión explícita: la redacción favorable SÍ se genera (su texto está verificado
 * contra el informe real), pero el caso desfavorable nunca se inventa — es una conclusión
 * tributaria real, con un ajuste que depende de criterio profesional, no de una fórmula.
 * Ahí se devuelve `{posicion, requiereAjuste:true, parrafos:null}` para que quien llama
 * deje la plantilla como está y avise que hace falta redactarla a mano, mismo criterio que
 * ya usa el sistema para SOFR no disponible o un `groundingChunks` vacío: declarar el hueco
 * en vez de rellenarlo con algo no verificado.
 *
 * `null` cuando no se puede calcular una posición para TODOS los préstamos —falta el rango
 * de alguna fecha, no hay E.A. legible, o los préstamos quedan en posiciones distintas entre
 * sí (la conclusión del documento real habla en singular de "la tasa pactada", no por
 * préstamo)—: en cualquiera de esos casos no hay una sola conclusión que redactar.
 */
export function conclusionRangoIntercuartilPrestamo(estudio, tasasPrestamo) {
  const tabla = filasTablaRangoIntercuartil(estudio, tasasPrestamo);
  if (!tabla || !tabla.filas.length) return null;

  const posiciones = tabla.filas.map((f) => {
    if (!f.rango) return null;
    const pactada = f.tasaResuelta;
    if (pactada === null) return null;
    if (pactada < f.rango.minimo) return 'debajo';
    if (pactada > f.rango.superior) return 'encima';
    return 'dentro';
  });
  if (posiciones.some((p) => p === null)) return null;

  const unica = new Set(posiciones);
  if (unica.size > 1) return null;
  const posicion = [...unica][0];

  const esEgreso = estudio.egreso !== false;
  const requiereAjuste = posicion === 'debajo' ? !esEgreso : posicion === 'encima' ? esEgreso : false;
  if (requiereAjuste) return { posicion, requiereAjuste: true, parrafos: null };

  const ent = estudio.ent || 'La Compañía';
  const vinc = vinculadoDePrestamo(estudio.prestamos[0], estudio.ent) || 'su compañía vinculada';
  const anio = estudio.anio || new Date().getFullYear();
  const tipoDeuda = esEgreso ? 'endeudamiento pasivo - deducción' : 'endeudamiento activo - ingreso';

  const parrafo1 = posicion === 'dentro'
    ? `Los resultados presentados anteriormente, permiten evidenciar que la tasa pactada por `
      + `${ent} e ${vinc} se encuentra dentro del rango intercuartil, lo cual indica que la `
      + `operación cumple con el principio de plena competencia y no supone un deterioro en `
      + `base impositiva con relevancia en este estudio en la medida que se trata de una `
      + `operación de ${tipoDeuda}.`
    : `Los resultados presentados anteriormente, permiten evidenciar que la tasa pactada por `
      + `${ent} e ${vinc} se encuentra por ${posicion} del rango intercuartil, lo cual, desde `
      + `el punto de vista impositivo, no supone un deterioro en base impositiva con relevancia `
      + `en este estudio en la medida que se trata de una operación de ${tipoDeuda}.`;

  const parrafo2 = `En este sentido, no se considera necesario hacer un ajuste que signifique `
    + `una mayor deducción en la medida que no hay una afectación al principio de plena `
    + `competencia con afectación a los fines del impuesto sobre la renta, es posible inferir `
    + `que las mismas fueron pactadas cumpliendo con el principio de operador independiente o `
    + `Arm's Length.`;

  const parrafo3 = esEgreso
    ? `Durante el año gravable ${anio} la Compañía causó egreso por intereses, sobre el préstamo `
      + `otorgado de su compañía vinculada ${vinc}; por lo tanto, existió un gasto el cual fue `
      + `tomado como deducción en la Renta del año gravable ${anio}.`
    : `Durante el año gravable ${anio} la Compañía causó ingreso por intereses, sobre el préstamo `
      + `otorgado a su compañía vinculada ${vinc}; por lo tanto, existió un ingreso el cual fue `
      + `incluido en la Renta del año gravable ${anio}.`;

  return { posicion, requiereAjuste: false, parrafos: [parrafo1, parrafo2, parrafo3] };
}
