/* ─────────────────────────────────────────────────────────────────────────────
   Lectura con Gemini Vision del estado de resultados de un estudio SEGMENTADO por
   línea de negocio (o geografía, o lo que el cliente elija como segmento).

   A diferencia de `parseEeffWithGeminiOCR` (eeffParser.js:609), que lee el estado
   financiero de una sola columna por ejercicio y puede anotar el texto por AÑO
   (`extraerEstructuraPdf`/`textoAnotado`, en eeffColumnas.js), aquí no hay manera de
   anotar el texto por columna de ANTEMANO: la etiqueta de cada segmento es texto libre
   que elige el cliente ("Tecnología", "Otros", "Unidad A"…) y no se conoce hasta que el
   propio documento se lee por primera vez — a diferencia del año, que sí se puede
   reconocer por regex antes de preguntarle nada al modelo. Por eso esta lectura manda
   el texto SIN anotar (`bloqueDeTexto(textoPdf)`, igual que el camino sin anotar de la
   lectura estándar) y le pide al modelo que identifique él mismo cuántas columnas de
   segmento trae el estado de resultados — pueden ser más de dos — y que transcriba el
   encabezado exacto de cada una. Esa etiqueta es la que `eeffSegmentacionColumnas.js`
   (Task 2) usa después para ubicar la columna en la geometría del PDF y comprobar que
   cada cifra esté impresa en SU fila y SU columna — la verificación de Task 4, que no
   se hace aquí: esta función solo llama a Gemini y mapea su respuesta.

   Los cuatro rubros que se piden por columna son los mismos cuatro que ya usa el resto
   del sistema para derivar márgenes del giro: ingresos de actividades ordinarias, costo
   de ventas, gastos de ventas y gastos de administración — los mismos que
   `RUBROS_DE_COTEJO`/`CAMPO_POR_RUBRO` en eeffParser.js, aquí repetidos por columna en
   vez de una sola vez por documento.
   ───────────────────────────────────────────────────────────────────────────── */

import { extraerJSON } from './comparablesEngine.js';
import { extraerTextoPdf } from './eeffTextoPdf.js';
import {
  leerBase64, mimeDe, postGeminiWithRetry, bloqueDeTexto, valorDeRubro, rotuloDeRubro,
} from './eeffParser.js';

/**
 * Prompt para la lectura del estado de resultados SEGMENTADO por línea de negocio.
 *
 * Sigue la misma REGLA CENTRAL que `EEFF_PROMPT` (eeffParser.js): transcribe, no
 * interpretes. Cada cifra devuelta tiene que estar impresa en el documento, dígito por
 * dígito — nunca estimada, deducida por diferencia o sumada entre filas que el propio
 * documento no suma. La única diferencia de fondo con `EEFF_PROMPT` es que aquí la
 * "columna" no es un año fijo de antemano: es el número de segmentos que el documento
 * decida traer, con un rótulo de encabezado que el modelo tiene que transcribir tal
 * cual, letra por letra, para que Task 2 pueda calzarlo contra la posición horizontal
 * real de esa columna en el PDF.
 */
export const EEFF_SEGMENTACION_PROMPT = `Eres un contador público que lee estados financieros colombianos preparados bajo NIIF, de una compañía que reporta su estado de resultados SEGMENTADO por línea de negocio, unidad de negocio o geografía: en vez de una sola columna de cifras trae varias columnas, una por segmento, y normalmente una columna adicional de TOTAL o CONSOLIDADO de la compañía.

REGLA CENTRAL: transcribe, no interpretes. Cada cifra que devuelvas debe estar impresa en el documento, dígito por dígito. Si un concepto no aparece en una columna, ese campo va en null para esa columna. NO estimes, NO deduzcas por diferencia, NO inventes, NO sumes columnas entre sí ni filas que el documento no sume él mismo para armar una cifra.

PRIMERO identifica cuántas columnas de segmento trae el estado de resultados: pueden ser dos, tres o más — no asumas que son exactamente dos, cuéntalas de verdad en el documento. Cada columna tiene su propio encabezado, elegido libremente por el cliente ("Tecnología", "Consultoría", "Otros", "Unidad A", una ciudad, etc.). Transcribe ESE encabezado tal cual, letra por letra, en "etiqueta": NO lo traduzcas, NO lo normalices, NO le cambies mayúsculas, minúsculas o tildes, porque ese texto exacto es lo único que permite después ubicar esa misma columna en el propio PDF.

Para CADA columna de segmento, y además para la columna de TOTAL o CONSOLIDADO de la compañía si el documento la imprime, extrae estos cuatro rubros del estado de resultados de esa columna:
· ingresos_operacionales: ingresos de actividades ordinarias, ventas netas, ingresos operacionales, ingresos por servicios.
· costo_ventas: costo de ventas, costo de los servicios prestados, costo de mercancía vendida.
· gastos_ventas: gastos de ventas, gastos de ventas y distribución, gastos comerciales.
· gastos_administracion: gastos de administración, gastos administrativos.

Para CADA uno de estos cuatro campos, en CADA columna, devuelve un objeto {"valor": <número o null>, "rotulo": "<el texto EXACTO de la fila del documento de donde tomaste la cifra, o cadena vacía si el campo va en null>"}. El rótulo es obligatorio cuando hay valor: es lo que permite revisar si la fila que elegiste es la correcta.

NO sumes los segmentos entre sí para rellenar el total de la compañía, ni repartas el total de la compañía entre los segmentos: son cifras independientes, cada una tiene que estar impresa en SU propia columna. Si una columna no imprime una cifra para alguno de estos cuatro rubros, ese campo va en null en esa columna, aunque el mismo rubro sí aparezca en otra columna.

── REGLAS DE TRANSCRIPCIÓN ──
· Si una cifra aparece entre paréntesis o con signo negativo, devuélvela con signo negativo, tal como está impresa.
· Una raya, un guion o una celda vacía significan que no hay cifra: eso es null, no cero. Un cero explícito impreso sí es 0.
· El separador de miles NO va en el JSON: "4.064.393" se devuelve como 4064393, y "51.512" como 51512. El punto en un número JSON es SIEMPRE decimal: úsalo solo si el documento imprime decimales de verdad, y entonces con los dígitos que imprima ("1.234,56" → 1234.56).
· Regla de escala, obligatoria y sin excepción: cada cifra numérica va EXACTAMENTE como aparece impresa en el documento, dígito por dígito — NUNCA la multipliques ni la conviertas tú, así el documento diga "en miles" o "en millones" en el encabezado.

Devuelve SOLO este JSON, sin marcas markdown:
{
  "segmentos": [
    {
      "etiqueta": "<encabezado EXACTO de la columna, tal como lo imprime el documento>",
      "ingresos_operacionales": {"valor": null, "rotulo": ""},
      "costo_ventas": {"valor": null, "rotulo": ""},
      "gastos_ventas": {"valor": null, "rotulo": ""},
      "gastos_administracion": {"valor": null, "rotulo": ""}
    }
  ],
  "total_compania": {
    "ingresos_operacionales": {"valor": null, "rotulo": ""},
    "costo_ventas": {"valor": null, "rotulo": ""},
    "gastos_ventas": {"valor": null, "rotulo": ""},
    "gastos_administracion": {"valor": null, "rotulo": ""}
  }
}`;

/* El documento del estudio también puede ser comparativo —imprimir el ejercicio y el
   anterior— y ahí no hay geometría de columnas por AÑO ya calculada para este caso (eso
   es lo que `extraerEstructuraPdf`/`textoAnotado` resuelven en la lectura estándar, y
   que aquí no se usa — ver el comentario de cabecera). Se le pide igual al modelo que
   se ciña al año del estudio, en prosa, igual que hacía `EEFF_PROMPT` antes de que
   existiera el texto anotado por año. */
function promptSegmentadoParaAnio(anio) {
  const anioLimpio = String(anio || '').trim();
  if (!anioLimpio) return EEFF_SEGMENTACION_PROMPT;
  return `${EEFF_SEGMENTACION_PROMPT}

── AÑO A EXTRAER: ${anioLimpio} ──
El documento puede ser comparativo y traer más de un ejercicio. Extrae ÚNICAMENTE las cifras de la columna del año ${anioLimpio}, en cada segmento y en el total de la compañía. Si el documento NO trae una columna del ${anioLimpio}, extrae el año que sí tenga y no mezcles cifras de dos ejercicios distintos.`;
}

/* Los cuatro rubros que se piden por columna, y el campo del estudio al que va cada
   uno. `t_s`/`t_c` repiten el nombre que ya usa `CAMPO_POR_RUBRO` en eeffParser.js para
   ingresos y costo de ventas —son el mismo concepto, ahora por segmento—; los dos
   gastos no tenían campo propio en la lectura estándar (ahí son solo rubros de cotejo,
   ver `RUBROS_DE_COTEJO`) porque la utilidad operacional del estudio se deriva de su
   suma y nunca se guardan por separado. Aquí sí hace falta cada uno por su lado: el
   cuadre de un segmento contra su columna del PDF (Task 4) necesita la fila exacta de
   cada rubro, no ya sumados. */
const RUBRO_A_CAMPO_SEGMENTO = {
  ingresos_operacionales: 't_s',
  costo_ventas: 't_c',
  gastos_ventas: 't_gastos_ventas',
  gastos_administracion: 't_gastos_administracion',
};

/** Mapea los cuatro rubros de UNA columna (un segmento, o el total de la compañía) a
 *  sus campos `t_*` y a los rótulos de origen, con `valorDeRubro`/`rotuloDeRubro` —las
 *  mismas funciones que usa `parseEeffWithGeminiOCR`, así que las dos lecturas reparan
 *  igual el separador de miles colado como decimal y exigen el mismo formato
 *  `{"valor","rotulo"}` por campo. */
function mapearRubrosDeColumna(columna) {
  const campos = {};
  const rotulos = {};
  Object.entries(RUBRO_A_CAMPO_SEGMENTO).forEach(([rubro, campo]) => {
    const fuente = columna ? columna[rubro] : null;
    campos[campo] = valorDeRubro(fuente);
    const rotulo = rotuloDeRubro(fuente);
    if (rotulo) rotulos[campo] = rotulo;
  });
  return { campos, rotulos };
}

/**
 * Lee el estado de resultados SEGMENTADO del contribuyente.
 *
 * Misma forma que `parseEeffWithGeminiOCR` (eeffParser.js:609): lee el archivo con
 * `leerBase64`/`mimeDe`, extrae su capa de texto con `extraerTextoPdf`, arma las
 * `parts` de Gemini con la imagen y el texto SIN anotar (`bloqueDeTexto(textoPdf)` —
 * no hay anotación por columna posible aquí, ver el comentario de cabecera), llama a
 * `postGeminiWithRetry` y extrae el JSON de la respuesta con `extraerJSON`, que
 * tolera que el modelo agregue prosa antes o después del objeto.
 *
 * `anioEstudio` no es opcional en la práctica: sin él, un documento comparativo se lee
 * por el ejercicio que el modelo elija, igual que en la lectura estándar.
 *
 * NO hace ninguna verificación de columnas contra la geometría del PDF — eso es
 * `eeffSegmentacionVerificacion.js` (Task 4), que consume el `textoPdf` y el
 * `rawJson` que esta función devuelve.
 *
 * @returns {Promise<{
 *   segmentos: Array<{etiqueta:string, t_s:number|null, t_c:number|null,
 *     t_gastos_ventas:number|null, t_gastos_administracion:number|null,
 *     rotulos:object}>,
 *   totalCompania: {t_s:number|null, t_c:number|null,
 *     t_gastos_ventas:number|null, t_gastos_administracion:number|null},
 *   textoPdf: string, anioObjetivo: string, rawJson: object,
 * }>}
 */
export async function parseEeffSegmentadoWithGeminiOCR(file, anioEstudio) {
  const base64Data = await leerBase64(file);
  const mimeType = mimeDe(file);
  const textoPdf = await extraerTextoPdf(file);

  const partes = [
    { inline_data: { mime_type: mimeType, data: base64Data } },
    { text: promptSegmentadoParaAnio(anioEstudio) },
  ];
  const conTexto = bloqueDeTexto(textoPdf);
  if (conTexto) partes.push({ text: conTexto });

  const response = await postGeminiWithRetry({
    model: 'gemini-3.5-flash',
    contents: [{ parts: partes }],
  });

  const text = response.data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error('No se obtuvo respuesta en formato JSON de Gemini Vision OCR.');

  /* `extraerJSON` y no un `replace` de fences: el modelo agrega prosa antes o después del
     objeto con frecuencia (ver comparablesEngine.js). */
  const parsed = extraerJSON(text);
  if (!parsed) {
    throw new Error('La respuesta de la lectura del estado de resultados segmentado no traía un JSON reconocible.');
  }

  const segmentos = (Array.isArray(parsed.segmentos) ? parsed.segmentos : [])
    .map((seg) => {
      const etiqueta = String((seg && seg.etiqueta) || '').trim();
      const { campos, rotulos } = mapearRubrosDeColumna(seg);
      return { etiqueta, ...campos, rotulos };
    })
    /* Una columna sin etiqueta no se puede ubicar después contra el PDF (Task 2 calza
       por el texto exacto del encabezado): se descarta en vez de guardarla con un
       rótulo vacío que nadie podría cuadrar. */
    .filter((seg) => seg.etiqueta);

  const { campos: totalCompania } = mapearRubrosDeColumna(parsed.total_compania);

  return {
    segmentos,
    totalCompania,
    textoPdf,
    anioObjetivo: String(anioEstudio || '').trim(),
    rawJson: parsed,
  };
}
