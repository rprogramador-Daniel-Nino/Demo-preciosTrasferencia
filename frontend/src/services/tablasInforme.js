/* ─────────────────────────────────────────────────────────────────────────────
   tablasInforme.js — filas de tabla y diagnóstico de cobertura del Informe Local.

   Lo que sobrevive de `exactTemplateMapper.js`. Aquel módulo producía el informe
   sustituyendo por expresión regular los literales del documento de END GAME 2024
   (el NIT, el Tax ID del vinculado, el monto de la operación, las anclas
   `_Toc2089309xx` y trece reglas amarradas al año «2024»), de modo que una
   plantilla de otro cliente no casaba con ninguna regla y el informe salía con los
   datos del contribuyente anterior sin una sola señal. Se retiró entero.

   Aquí quedan las tres piezas que no dependían de aquel documento y que consume la
   ruta viva —rellenar el `.docx` del propio cliente con docxtemplater, ver
   `docxRelleno.js`—: las filas de la tabla de razones de rechazo, las filas de la
   muestra de comparables, y el diagnóstico de qué le falta al estudio antes de
   generar.
   ───────────────────────────────────────────────────────────────────────────── */

import { analizarRango } from './rangoIntercuartil.js';
import {
  DATOS_MACRO, resolverSerie, cifraODisponible, marcadorPendiente,
} from './analisisMercado.js';
import { num, pliOf } from '../utils/calculations.js';
import { traducirCriterio } from './criteriosScreeningEs.js';
import { nameKey, claveDeCruce } from './comparablesEngine.js';

/* ══════════════ Nombres de tabla compartidos por las dos rutas ══════════════

   Vive aquí, y no en `docxRelleno.js` ni en `tablasHtmlInforme.js`, porque las dos rutas tienen
   que buscar exactamente lo mismo y ese par de módulos no puede compartir una constante: hay un
   ciclo de imports entre ellos (`tablasHtmlInforme` → `docxRelleno` → `anexoCHtml` →
   `tablasHtmlInforme`), y la constante importada por ese camino llega sin inicializar. Este
   módulo, que ya es la única fuente de las FILAS de ambas rutas, no participa del ciclo.

   Los nombres de la tabla de márgenes son DOS porque la palabra «Compañías» no está en todas las
   plantillas: el informe de END GAME la rotula «Margen Operacional Compañías Comparables» y el
   de MONTACHEM «Margen Operacional Comparables». Los localizadores comparan por inclusión, así
   que el nombre largo NO casa con el rótulo corto —«companias» queda en medio—: con una sola
   clave, la tabla del segundo cliente no se encontraba y se radicaba con los comparables del
   informe anterior. Se reportó con capturas el 2026-08-20; la cita al pie seguía diciendo
   «Fecha de consulta: julio de 2024», que es la prueba de que el motor nunca la había tocado.

   Las dos claves siguen siendo específicas —«Margen Operacional» delante y «Comparables»
   detrás—, así que ninguna casa con la prosa «…el indicador financiero de rentabilidad más
   apropiado es el Margen Operacional…», que es el falso candidato contra el que previene el
   bloque de márgenes de `docxRelleno.js`. */
export const NOMBRES_TABLA_MARGENES = [
  'Margen Operacional Compañías Comparables',
  'Margen Operacional Comparables',
];

/* ══════════════ Razones de rechazo ══════════════
   Cada fila es un criterio del motor. Se omiten las que no descartaron a nadie: un
   informe que declara «Pérdidas operativas: 0» cuando el criterio se puso en «incluir»
   confunde a quien lo revisa. Las letras se asignan sobre las filas que quedan, para
   conservar el formato de la columna «FILTROS APLICADO» del documento. */

const RAZONES_RECHAZO = [
  ['rigorFuncional', 'Diferencias funcionales: perfil no comparable con la parte examinada'],
  ['actividadDistinta', 'Actividad económica distinta a la de la parte examinada'],
  ['sinDescripcion', 'Sin descripción del negocio que permita verificar la actividad'],
  ['holding', 'Compañías holding o de grupo (en la razón social)'],
  /* El descarte por mención en la DESCRIPCIÓN se retiró del motor: la descripción
     nombra al grupo del que la empresa forma parte, que no es lo mismo que ser ella
     la sociedad de cartera. Además su motivo no estaba entre los siete que cuenta la
     hoja de trazabilidad, y esas compañías descuadraban la suma de control.

     Motivo separado del de control y no fundido con él: el holding se presume de la
     razón social, mientras que el control es un hecho de la composición accionaria
     (Art. 260-1 E.T.). Ante la DIAN son dos justificaciones distintas y la tabla las
     tiene que poder sustentar por separado. Los estudios guardados antes de este
     cambio no traen la clave, cuentan 0 y la fila se omite sola. */
  ['controlada', 'Compañías vinculadas: un accionista alcanza o supera el umbral de independencia'],
  ['perdidaOperativa', 'Pérdidas operativas en el período analizado'],
  ['saldoNegativo', 'Saldos negativos en balances: cifras no verosímiles'],
];

/* Los tres motivos de comparabilidad funcional van en UNA sola fila de la tabla, no en
   una cada uno. Es como los presenta la hoja «Matriz de rechazo» del libro de soporte
   (`memoriaCalculoRangoOptimo.js:885`), y el informe tiene que declarar la misma cifra
   que el libro que lo sustenta: con las filas separadas, el documento publicaba 85 y
   1.304 donde el Excel publica 1.389.

   Se unifica solo la PRESENTACIÓN: las claves siguen separadas en el motor, que es
   donde cada compañía conserva el motivo exacto por el que salió. El desglose fino vive
   en la columna «Motivo de rechazo» de la base de datos, igual que en el libro.

   Se exporta porque el ANEXO C tiene que fundir los mismos motivos bajo la misma letra
   (`anexoCHtml.js`): si la tabla declara 1.389 en «A» y el anexo lista ahí otra cifra,
   el anexo deja de sustentar la tabla. Una sola definición para los dos. */
export const FUNDIDOS_EN_RIGOR = ['actividadDistinta', 'sinDescripcion'];

/* Mayúsculas para las tablas que las llevan: la de márgenes, la de la muestra y el ANEXO C
   entero (requisito del usuario, 2026-08-19). La «Tabla 16. Razones de rechazo» NO, y por eso
   esto vive aquí como utilidad y no dentro de un generador de tablas: aplicado ahí subiría toda
   tabla del informe y la excepción se perdería. Sube quien arma las filas, tabla por tabla.

   Vive en este módulo porque es el que ya comparten las dos rutas —la de plantilla .docx
   (`docxRelleno.js`) y la de PDF (`tablasHtmlInforme.js`)—, así que las dos suben igual. La
   ruta de PDF tiene además `mayusculasEnTablaHtml`, que sube el texto de una tabla YA armada:
   lo necesita porque ahí los encabezados vienen de la plantilla del cliente y no de un array
   nuestro. */
export const enMayusculas = (valor) => String(valor == null ? '' : valor).toUpperCase();

/** Una matriz de filas, celda a celda. */
export const filasEnMayusculas = (filas) =>
  (filas || []).map((fila) => (fila || []).map(enMayusculas));

/* La fila fundida se nombra en corto, como en el libro y como en los informes de años
   anteriores: la coletilla «perfil no comparable con la parte examinada» describía solo
   uno de los tres motivos que ahora recoge. */
const ETIQUETA_RIGOR = 'Diferencias funcionales';

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Etiqueta de cada motivo, para quien necesite nombrar uno que el embudo no declara. */
export const ETIQUETAS_MOTIVO = Object.freeze({
  ...Object.fromEntries(RAZONES_RECHAZO),
  aceptadas: 'Compañías comparables aceptadas',
});

/**
 * Saca de «aceptadas» a las compañías que el embudo dice retiradas a mano, y las suma a
 * `rigorFuncional` (diferencias funcionales) — el mismo destino que les da la fila fundida.
 *
 * `matrizRechazo` se recalcula al vuelo con el universo completo en memoria
 * (`MotorComparables.jsx`), y ese universo NO se persiste con el estudio: si se retira una
 * comparable con la papelera del paso 4 sin tener el universo cargado —el caso normal al
 * reabrir un estudio guardado—, la matriz persistida se queda con la foto de la última corrida
 * real y sigue listando esa compañía como aceptada, aunque `embudoSeleccion.retiradasManual`
 * (que sí viaja siempre) ya la tenga anotada. Reconciliar aquí, al leer, no depende de que la
 * matriz se haya podido recalcular.
 *
 * Es un no-op si la matriz ya está al día: si la compañía ya no está en `aceptadas` —porque
 * `matrizDeRechazo` sí corrió después del retiro—, no hay nada que mover.
 *
 * Vive aquí y no en `anexoCHtml.js` —donde nació el 2026-09-08— porque ahora la usan también
 * las filas de la Tabla 16 (`filasDesdeMatriz`, más abajo): las dos tienen que reconciliar
 * exactamente igual para no volver a publicar un ANEXO C y un cuerpo que se contradicen.
 *
 * @param {object} porMotivo        el de `matrizRechazo`, sin tocar.
 * @param {Array}  retiradasManual  `nameKey` de las compañías retiradas (`embudoSeleccion`).
 * @returns {object} una copia de `porMotivo` con el ajuste, o el mismo objeto si no hacía falta.
 */
export function reconciliarRetiradasManual(porMotivo, retiradasManual) {
  const claves = new Set((retiradasManual || []).filter(Boolean));
  const aceptadas = Array.isArray(porMotivo.aceptadas) ? porMotivo.aceptadas : [];
  if (!claves.size || !aceptadas.length) return porMotivo;

  const retiradas = aceptadas.filter((nombre) => claves.has(nameKey(nombre)));
  if (!retiradas.length) return porMotivo;

  return {
    ...porMotivo,
    aceptadas: aceptadas.filter((nombre) => !claves.has(nameKey(nombre))),
    rigorFuncional: [...(porMotivo.rigorFuncional || []), ...retiradas].sort((a, b) => a.localeCompare(b, 'es')),
  };
}

/**
 * Reconcilia `matrizRechazo` contra la muestra final ACTUAL (`study.comparables`), sin
 * necesitar el universo. Generaliza `reconciliarRetiradasManual`: en vez de depender de una
 * lista explícita de retiradas, compara la matriz contra la fuente de verdad de la muestra que
 * de verdad se va a radicar —la misma que usa `filasComparablesInforme`/`diagnosticarCobertura`—
 * y mueve en LOS DOS sentidos:
 *
 *   - una compañía que sigue en «aceptadas» pero ya no está en la muestra actual (por cualquier
 *     motivo, no solo un retiro explícito) → a `rigorFuncional`;
 *   - una compañía que la matriz tiene registrada bajo otro motivo pero SÍ está en la muestra
 *     actual (el analista la rescató subiendo su EEFF, en otra pantalla, después de que el
 *     motor la rechazara) → a `aceptadas`.
 *
 * POR QUÉ EXISTE. Detectado auditando ACO SOLUCIONES DE DRENAJE (2026-09-21): la única forma de
 * refrescar `matrizRechazo` era reabrir el paso 3 (Motor de Comparables) con el cribado cargado
 * y volver a ejecutar la selección —algo que nadie puede garantizar que el analista recuerde
 * hacer cada vez—. Esta función deja que el botón «Actualizar información» del generador del
 * informe (`ReporteGenerador.jsx`) corrija la foto SIN pasar por el motor, con lo único que esa
 * pantalla sí tiene a mano: la muestra final tal como está guardada en el estudio.
 *
 * Empareja por `claveDeCruce` y NO por `nameKey`: esta función compara nombres de DOS fuentes
 * distintas —los que trae la matriz congelada del cribado, contra los de `study.comparables`,
 * que el analista escribe o edita a mano—, que es exactamente el escenario para el que se creó
 * `claveDeCruce`. `nameKey` tiene un defecto documentado y todavía abierto con formas societarias
 * que terminan en punto (`S.A.S.`, `CO.`): con ella, una compañía que sigue en la muestra podría
 * salir expulsada de «aceptadas» por error, o una rescatada podría no volver a entrar.
 *
 * DELIBERADAMENTE CONSERVADORA. Una compañía de la muestra actual que no aparece en NINGÚN
 * motivo de la matriz —una creada desde su EEFF que nunca estuvo en el universo de Capital IQ,
 * por ejemplo— se deja fuera: sin el universo real no hay forma de inventarle un lugar. `universo`
 * nunca se toca, porque solo se mueven nombres entre baldes que la matriz ya tenía, nunca se
 * agregan desde fuera. Un estudio así puede seguir necesitando el recálculo completo del paso 3.
 *
 * Es un no-op si la matriz ya está al día: devuelve el MISMO objeto por referencia, y solo
 * reescribe los baldes que de verdad cambiaron —el resto conserva su arreglo y orden originales—,
 * para que el llamador pueda comparar `=== ` y decidir si hace falta guardar algo.
 *
 * @param {{porMotivo:object, universo:number}} matrizRechazo
 * @param {Array} comparables  `study.comparables`, la muestra final tal como está en el estudio.
 * @returns {object} el mismo `matrizRechazo`, o una copia con `porMotivo` ajustado.
 */
export function sincronizarMatrizConMuestra(matrizRechazo, comparables) {
  if (!matrizRechazo || !matrizRechazo.porMotivo) return matrizRechazo;
  /* Sin muestra que comparar —estudio todavía sin cargar— no se toca nada. Una muestra
     explícitamente vacía (`[]`, el analista retiró todas las comparables) sí es una decisión
     real y se procesa: debe vaciar «aceptadas». */
  if (!Array.isArray(comparables)) return matrizRechazo;

  const porMotivoOriginal = matrizRechazo.porMotivo;
  const clavesEnMuestra = new Set(
    comparables
      .filter((c) => c && String(c.name || '').trim())
      .map((c) => claveDeCruce(c.name))
      .filter(Boolean)
  );

  const porMotivo = { ...porMotivoOriginal };
  const aceptadasOriginal = Array.isArray(porMotivoOriginal.aceptadas) ? porMotivoOriginal.aceptadas : [];
  let cambio = false;

  /* Dirección 1: fuera de «aceptadas» lo que ya no está en la muestra. */
  const siguenAceptadas = [];
  const salenDeAceptadas = [];
  aceptadasOriginal.forEach((nombre) => {
    if (clavesEnMuestra.has(claveDeCruce(nombre))) siguenAceptadas.push(nombre);
    else salenDeAceptadas.push(nombre);
  });
  if (salenDeAceptadas.length) {
    cambio = true;
    porMotivo.aceptadas = siguenAceptadas;
    porMotivo.rigorFuncional = [...(porMotivoOriginal.rigorFuncional || []), ...salenDeAceptadas]
      .sort((a, b) => a.localeCompare(b, 'es'));
  }

  /* Dirección 2: a «aceptadas» lo que la muestra sí tiene y la matriz tenía en otro motivo. Un
     set de claves ya asignadas evita duplicar una compañía si por algún motivo aparece repetida
     en dos baldes de la matriz a la vez. */
  const entranAAceptadas = [];
  const clavesYaAceptadas = new Set(siguenAceptadas.map((n) => claveDeCruce(n)));
  Object.keys(porMotivoOriginal).forEach((clave) => {
    if (clave === 'aceptadas') return;
    const original = porMotivoOriginal[clave] || [];
    const quedan = [];
    let tocado = false;
    original.forEach((nombre) => {
      const k = claveDeCruce(nombre);
      if (k && clavesEnMuestra.has(k) && !clavesYaAceptadas.has(k)) {
        clavesYaAceptadas.add(k);
        entranAAceptadas.push(nombre);
        tocado = true;
      } else {
        quedan.push(nombre);
      }
    });
    if (tocado) {
      cambio = true;
      porMotivo[clave] = quedan;
    }
  });
  if (entranAAceptadas.length) {
    cambio = true;
    porMotivo.aceptadas = [...siguenAceptadas, ...entranAAceptadas].sort((a, b) => a.localeCompare(b, 'es'));
  }

  if (!cambio) return matrizRechazo;
  return { ...matrizRechazo, porMotivo };
}

/**
 * Las filas de la Tabla 16, contadas sobre la matriz del universo (`matrizRechazo`) en vez de
 * sobre el embudo. Es la MISMA agrupación que arma el ANEXO C (`gruposDelAnexoC`,
 * `anexoCHtml.js`): motivo por motivo, `companias.length` en vez de un contador aparte.
 *
 * POR QUÉ EXISTE. Detectado auditando ACO SOLUCIONES DE DRENAJE (2026-09-21): la Tabla 16 y el
 * ANEXO C son DOS conteos independientes del mismo hecho —uno el embudo que deja
 * `scoreCandidates`, contador por contador y parchado a mano en cada retiro o alta manual; el
 * otro `matrizRechazo`, nombre por nombre, recalculado solo mediante `enriquecerUniverso`—, y
 * nada obligaba a que coincidieran. El embudo se queda desactualizado en cuanto el analista
 * agrega o retira una comparable sin volver a «Ejecutar Selección Automática» —ese botón es el
 * único que lo toca—, mientras que `matrizRechazo` se recalcula solo con abrir el paso 3 con el
 * cribado cargado. El informe salió dos veces con la Tabla 16 y el ANEXO C dando cifras
 * distintas para el mismo universo.
 *
 * La cuenta por nombre es además más robusta que la del embudo: una candidata que ya no está en
 * `comparables` y no tiene un motivo propio de una corrida anterior cae SOLA en «diferencias
 * funcionales» —el `|| 'rigorFuncional'` de `matrizDeRechazo`, `anexoCHtml.js`—, así que no hace
 * falta sumarle aparte la reserva, las que se quedaron sin EEFF o las retiradas a mano: ya están
 * ahí, cada una por su cuenta, sin un contador que se pueda desincronizar.
 *
 * @param {{porMotivo:object, universo:number}} matrizRechazo
 * @param {Array<string>} [retiradasManual]  del embudo, para reconciliar (ver arriba).
 */
function filasDesdeMatriz(matrizRechazo, retiradasManual) {
  const porMotivo = reconciliarRetiradasManual(matrizRechazo.porMotivo || {}, retiradasManual);

  const filas = [];
  RAZONES_RECHAZO.forEach(([clave, etiqueta]) => {
    if (FUNDIDOS_EN_RIGOR.includes(clave)) return;
    const esRigor = clave === 'rigorFuncional';
    const cuantas = (Array.isArray(porMotivo[clave]) ? porMotivo[clave].length : 0)
      + (esRigor
        ? FUNDIDOS_EN_RIGOR.reduce((acc, k) => acc + (Array.isArray(porMotivo[k]) ? porMotivo[k].length : 0), 0)
        : 0);
    if (cuantas > 0) filas.push({ clave, etiqueta: esRigor ? ETIQUETA_RIGOR : etiqueta, cuantas });
  });

  const aceptadas = Array.isArray(porMotivo.aceptadas) ? porMotivo.aceptadas.length : 0;
  filas.push({ clave: 'aceptadas', etiqueta: 'Compañías comparables aceptadas', cuantas: aceptadas });

  const filasConLetra = filas.map((f, i) => ({ ...f, letra: LETRAS[i] || '' }));
  const suma = filas.reduce((acc, f) => acc + f.cuantas, 0);
  const total = Number(matrizRechazo.universo) || 0;

  return { filas: filasConLetra, total, cuadra: suma === total, suma, sinDatos: false };
}

/**
 * Filas de la tabla de razones de rechazo, ya con su letra y su conteo.
 *
 * Devuelve también si los números cuadran: rechazos —con la reserva ya sumada a las
 * diferencias funcionales— más aceptadas debe dar el universo evaluado. Si no cuadra,
 * quien genera el informe tiene que saberlo antes de radicarlo, no después.
 *
 * `matrizRechazo` (segundo argumento, opcional) manda cuando trae datos: es la misma matriz
 * nombre a nombre que sustenta el ANEXO C y la hoja «Selección comparables» del Excel de
 * soporte, así que preferirla aquí es lo que hace que la Tabla 16 no pueda decir un número
 * distinto al de esas dos. El embudo se usa solo cuando no hay matriz —estudios con las
 * comparables cargadas a mano, sin universo importado nunca— para no perder esa cobertura.
 */
export function filasRazonesRechazo(embudo, matrizRechazo) {
  if (matrizRechazo && matrizRechazo.porMotivo && Object.keys(matrizRechazo.porMotivo).length) {
    return filasDesdeMatriz(matrizRechazo, embudo && embudo.retiradasManual);
  }

  const e = embudo || null;
  if (!e || !e.evaluadas) return { filas: [], total: 0, cuadra: false, sinDatos: true };

  const porMotivo = e.porMotivo || {};

  /* Las válidas que no entraron al cupo se cuentan dentro de las diferencias
     funcionales, no en una fila propia. La fila que tenían declaraba por escrito que
     esas compañías superaron todos los criterios y aun así quedaron fuera, y el motivo
     real —el tamaño de muestra pedido— no es un criterio de comparabilidad que se
     sostenga ante quien revise el informe.

     El destino no es arbitrario: `scoreCandidates` ordena las válidas por puntaje
     descendente (`comparablesEngine.js:505`) y la reserva es la cola de ese orden
     (`:550`), es decir las de menor grado de comparabilidad funcional frente a la parte
     examinada. */
  const reserva = Number(e.reserva) || 0;

  /* Las que se retiraron de la muestra en la ingesta del paso 4 porque su estado
     financiero no traía cifras con las que calcular el margen (`eeffSuficiencia.js`).
     Van al mismo sitio que la reserva y por la misma razón: superaron los filtros
     objetivos y no integran la muestra. El motivo real —falta el documento con las
     cifras— no es un criterio de comparabilidad que se sostenga ante quien revise el
     informe, y sí lo es no ser funcionalmente comparable con la parte examinada.

     Tiene que estar aquí para que la tabla cuadre: el componente baja `seleccionadas`
     al retirarlas, así que sin recogerlas en alguna fila la suma dejaría de dar el
     universo evaluado y el generador avisaría de un descuadre que no existe. */
  const sinEeff = Number(e.sinEeff) || 0;

  /* Las que el analista retiró a mano de la muestra en el paso 4, con la papelera. Van al mismo
     sitio que la reserva y las que se quedaron sin estado financiero, y por la misma razón:
     superaron los filtros objetivos y no integran la muestra, así que el motivo que se sostiene
     ante quien revise el informe es no ser funcionalmente comparable con la parte examinada.

     Sin esto la tabla mentía y nadie se enteraba. El borrado manual solo quitaba la fila de la
     pantalla: el embudo seguía declarando las aceptadas de antes, así que el informe decía «13
     compañías comparables aceptadas» mientras la tabla de márgenes listaba 12 y el rango se
     calculaba sobre 12. Y la comprobación de cuadre seguía dando `true` —los conteos del embudo
     no habían cambiado y seguían sumando el universo—, de modo que el descuadre llegaba hasta la
     radicación sin un solo aviso.

     Es una LISTA de nombres y no un contador para que el conteo no pueda desincronizarse: retirar
     dos veces la misma no la cuenta dos veces, y volver a añadirla la saca de aquí. */
  const retiradasMano = Array.isArray(e.retiradasManual) ? e.retiradasManual.length : 0;

  const filas = [];
  RAZONES_RECHAZO.forEach(([clave, etiqueta]) => {
    /* Sin fila propia: su conteo se suma al de «Diferencias funcionales», más abajo. */
    if (FUNDIDOS_EN_RIGOR.includes(clave)) return;

    const esRigor = clave === 'rigorFuncional';

    /* La reserva se suma ANTES de descartar los ceros. Un estudio que no rechazó a
       nadie por rigor funcional pero dejó reserva necesita igual esta fila: omitirla
       dejaría la columna sin sumar el universo. Los motivos fundidos entran por la
       misma puerta y por el mismo motivo. */
    const cuantas = (Number(porMotivo[clave]) || 0)
      + (esRigor
        ? reserva + sinEeff + retiradasMano
          + FUNDIDOS_EN_RIGOR.reduce((acc, k) => acc + (Number(porMotivo[k]) || 0), 0)
        : 0);
    if (cuantas > 0) filas.push({ clave, etiqueta: esRigor ? ETIQUETA_RIGOR : etiqueta, cuantas });
  });

  const aceptadas = Number(e.seleccionadas) || 0;
  filas.push({ clave: 'aceptadas', etiqueta: 'Compañías comparables aceptadas', cuantas: aceptadas });

  const filasConLetra = filas.map((f, i) => ({ ...f, letra: LETRAS[i] || '' }));
  const suma = filas.reduce((acc, f) => acc + f.cuantas, 0);
  const total = Number(e.evaluadas) || 0;

  return { filas: filasConLetra, total, cuadra: suma === total, suma, sinDatos: false };
}

/* ══════════════ Muestra y márgenes de las comparables ══════════════
   Las dos tablas salen de `analizarRango`, que es de donde sale también el rango
   intercuartil. Repetir aquí la fórmula del ajuste habría permitido que el informe
   publicara unos márgenes que no sustentan el rango que declara unas páginas más
   adelante. */

/* Las comparables que se pueden nombrar en el informe. Se descartan las filas sin
   razón social —la tabla del motor arranca con filas en blanco que el usuario va
   llenando— porque una fila numerada y sin nombre en la muestra final no dice nada. */
export function filasComparablesInforme(study) {
  const { filas } = analizarRango(study || {});
  return (filas || []).filter((f) => f.nombre);
}

/** Cómo se nombra el ámbito de una comparable en el informe. */
export const AMBITO = { Int: 'INTERNACIONAL', Nac: 'NACIONAL' };

/* Etiquetas de las filas del rango. Se exportan porque hay tablas que publican solo
   algunos percentiles —la versión horizontal del rango lleva P25, mediana y P75— y
   buscarlos por un literal repetido en cada consumidor deja de encontrarlos en silencio
   el día que se reescriba una etiqueta. */
export const ETIQUETAS_RANGO = {
  min: 'Mínimo',
  p25: 'Percentil 25',
  med: 'Mediana',
  p75: 'Percentil 75',
  max: 'Máximo',
};

/**
 * Filas de la tabla «Muestra Compañías comparables»: número, razón social y ámbito.
 *
 * La numeración es la de la tabla, no un identificador: se recalcula sobre las filas que
 * quedan, así que retirar una comparable durante la ingesta no deja huecos en la columna.
 */
export function filasMuestraComparables(study) {
  return filasComparablesInforme(study).map((f, i) => ({
    numero: i + 1,
    nombre: f.nombre,
    ambito: AMBITO[f.amb] || '',
  }));
}

/**
 * Filas del rango intercuartil en vertical, con los valores SIN formatear.
 *
 * Vivía dentro de `actualizarTablasOperacionesOoxml`, que es la ruta de plantilla .docx.
 * Se extrajo al añadir la misma tabla a la ruta de PDF (`tablasHtmlInforme.js`): con el
 * cálculo repetido en cada ruta, las dos podían publicar percentiles distintos para el
 * mismo estudio, y ese defecto ya se pagó una vez en este repo —había dos
 * implementaciones del cuartil y el modal mostraba un rango y el informe otro—.
 *
 * Las dos columnas se le piden al motor: `stats` para la ajustada —la que sostiene la
 * conclusión de cumplimiento— y `statsNoAjustado` para la otra. Ninguna se calcula aquí, así
 * que las dos salen del mismo universo y con el mismo filtro de ámbito.
 *
 * @param {object} study
 * @returns {{filas:Array<{etiqueta:string, noAjustado:number|null, ajustado:number|null}>,
 *            tPLI:number|null, pli:string}}
 */
export function filasRangoIntercuartil(study) {
  const estudio = study || {};
  const r = analizarRango(estudio);
  /* `statsAjustado` y NO `stats`: el segundo es el escenario que sostiene la conclusión
     —el que elige `useadj`—, mientras esta columna se titula «AJUSTADO» y tiene que
     llevar el rango ajustado por capital de trabajo, que el motor calcula siempre. Con
     `stats` aquí, un estudio con la casilla apagada repetía la columna de al lado. */
  const stats = r.statsAjustado || {};
  /* La estadística del escenario SIN ajuste se le pide al motor (`statsNoAjustado`) en vez
     de ordenar la serie aquí. Ordenarla a mano fue el defecto que Juan corrigió el
     2026-08-11 en `rangoIntercuartil.js`: ese cálculo propio no aplicaba el filtro de
     ámbito (`cmode`), así que el mínimo, el máximo y los percentiles de la columna «NO
     AJUSTADO» contaban comparables que el ámbito excluye, y las dos columnas de una misma
     tabla salían sobre universos distintos.

     Al extraer esta función de `docxRelleno.js` esa mañana el cálculo a mano vino con ella,
     de modo que al integrar las dos ramas su arreglo se quedaba sin consumidor y el defecto
     habría vuelto sin que git marcara nada. */
  const sinAjuste = r.statsNoAjustado || {};
  const valor = (o, clave) => (o && o[clave] !== undefined ? o[clave] : null);

  /* Indicador del contribuyente con el mismo método, descontando el segmento excluido:
     es la cifra que la conclusión compara contra el rango. */
  const seg = num(estudio.seg_excluido) || 0;
  const tS = num(estudio.t_s), tOp = num(estudio.t_op);
  const T = {
    s: tS !== null ? tS - seg : null,
    c: num(estudio.t_c),
    op: tOp !== null ? tOp - seg : null,
    ar: num(estudio.t_ar), inv: num(estudio.t_inv), ap: num(estudio.t_ap),
  };
  const pli = estudio.pli || 'MO';
  const tPLI = pliOf(T, pli);

  const nombreContribuyente = estudio.ent ? String(estudio.ent).toUpperCase() : 'CONTRIBUYENTE';

  return {
    pli,
    tPLI,
    filas: [
      { etiqueta: ETIQUETAS_RANGO.min, noAjustado: valor(sinAjuste, 'min'), ajustado: valor(stats, 'min') },
      { etiqueta: ETIQUETAS_RANGO.p25, noAjustado: valor(sinAjuste, 'p25'), ajustado: valor(stats, 'p25') },
      { etiqueta: ETIQUETAS_RANGO.med, noAjustado: valor(sinAjuste, 'med'), ajustado: valor(stats, 'med') },
      { etiqueta: ETIQUETAS_RANGO.p75, noAjustado: valor(sinAjuste, 'p75'), ajustado: valor(stats, 'p75') },
      { etiqueta: ETIQUETAS_RANGO.max, noAjustado: valor(sinAjuste, 'max'), ajustado: valor(stats, 'max') },
      /* El contribuyente cierra la tabla y lleva su indicador en las dos columnas: se
         ajusta contra sí mismo, así que el ajuste es cero. */
      { etiqueta: nombreContribuyente, noAjustado: tPLI, ajustado: tPLI },
    ],
  };
}

/* ══════════════ Tablas de tendencias de la economía ══════════════

   Las ocho salen de las series macro y no del motor de comparables. Se describen aquí —qué
   se busca en la plantilla, qué título llevan, qué columnas y qué filas— para que las dos
   rutas del informe emitan lo mismo: la de plantilla .docx las escribe como OOXML y la de
   PDF reescribe las filas del HTML. Antes la definición vivía dentro del generador de
   OOXML, así que llevarla a la otra ruta habría significado copiar ocho tablas y sus
   fuentes, y cualquier corrección en una habría dejado a la otra atrás. */

/**
 * Descriptores de las ocho tablas macro, ya resueltos contra las series.
 *
 * @param {object} datosMacro  el análisis de mercado del estudio, o null para usar las
 *        series de respaldo de `analisisMercado.js`.
 * @param {number} year  año gravable.
 * @returns {Array<{nombre:string, titulo:string, cabeceras:string[],
 *          filas:Array<string[]>, fuente:string}>} `nombre` es lo que se busca en la
 *          plantilla; el resto es el contenido que debe quedar.
 */
export function tablasMacroInforme(datosMacro, year) {
  const y = Number(year) || 2025;
  const y1 = y - 1, y2 = y, y3 = y + 1;
  const wrap = (v) => String(v == null ? '—' : v);
  const serie = (clave) => resolverSerie(datosMacro, clave);

  const porAnios = (clave, concepto, cabecera, titulo, etiquetaProyeccion) => {
    const { valores: S, fuente } = serie(clave);
    return {
      titulo, fuente, cabeceras: ['Año', cabecera],
      filas: [
        [String(y1), wrap(cifraODisponible(S, y1, concepto))],
        [String(y2), wrap(cifraODisponible(S, y2, concepto))],
        [String(y3) + etiquetaProyeccion, wrap(cifraODisponible(S, y3, 'la proyección de ' + concepto))],
      ],
    };
  };

  const tablas = [];

  tablas.push({
    nombre: 'PIB Mundial',
    ...porAnios('pib_mundial', 'el crecimiento del PIB mundial', 'Crecimiento Mundial (%)',
      'Crecimiento del PIB Mundial (' + y1 + '-' + y3 + ')', ' (Proyección)'),
  });

  tablas.push({
    nombre: 'PIB en Colombia',
    ...porAnios('pib_colombia', 'el crecimiento del PIB de Colombia', 'Crecimiento del PIB (%)',
      'Crecimiento del PIB en Colombia (' + y1 + '-' + y3 + ')', ' (Proyección OCDE)'),
  });

  tablas.push({
    nombre: 'Inflación Global',
    ...porAnios('inflacion_global', 'la inflación global', 'Tasa de Inflación (%)',
      'Tasas de Inflación Global (' + y1 + '-' + y3 + ')', ' (Proyección)'),
  });

  /* Proyecciones por región: las filas dependen de lo que traiga la serie del año, así que
     cuando falta se emiten las cinco regiones del informe con su marcador de pendiente en
     vez de una tabla vacía. */
  {
    const { valores: porAnio, fuente } = serie('crecimiento_por_region');
    const porRegion = porAnio[y];
    const filas = (!porRegion || !porRegion.length)
      ? ['Mundial', 'Estados Unidos', 'China', 'América Latina', 'Colombia (OCDE)']
        .map((r) => [r, wrap(marcadorPendiente(y, 'la proyección de crecimiento de ' + r))])
      : porRegion.map(({ region, valor }) => [region, wrap(valor)]);
    tablas.push({
      nombre: 'por Región/País',
      titulo: 'Proyecciones de Crecimiento del PIB por Región/País (' + y + ')',
      cabeceras: ['Región/País', 'Crecimiento Proyectado (%)'],
      filas, fuente,
    });
  }

  {
    const { valores: S, fuente } = serie('inflacion_colombia');
    tablas.push({
      nombre: 'Inflación en Colombia',
      titulo: 'Inflación en Colombia (' + y + ' vs. Meta ' + y3 + ')',
      cabeceras: ['Indicador', 'Valor (%)'],
      filas: [
        ['Inflación ' + y, wrap(cifraODisponible(S, y, 'la inflación de Colombia'))],
        ['Meta Inflación ' + y3, wrap(DATOS_MACRO.meta_inflacion_banrep)],
      ],
      fuente,
    });
  }

  /* Tasa de intervención: la serie trae su propia etiqueta de fecha («Diciembre 2024»),
     que además da el título. */
  {
    const { valores: S, fuente } = serie('tasa_intervencion');
    const filas = [y1, y2].map((anio) => {
      const obs = S[anio];
      return obs
        ? [obs.etiqueta, wrap(obs.valor)]
        : ['Diciembre ' + anio,
          wrap(marcadorPendiente(anio, 'la tasa de intervención del Banco de la República'))];
    });
    tablas.push({
      nombre: 'Intervención del Banco',
      titulo: 'Tasa de Intervención del Banco de la República ('
        + filas[0][0] + ' - ' + filas[1][0] + ')',
      cabeceras: ['Fecha', 'Tasa de Intervención (%)'],
      filas, fuente,
    });
  }

  {
    const { valores: S, fuente } = serie('trm_promedio');
    tablas.push({
      nombre: 'Tasa Representativa del Mercado',
      titulo: 'Tasa Representativa del Mercado (TRM) Promedio (' + y1 + '-' + y2 + ')',
      cabeceras: ['Año', 'TRM Promedio ($)'],
      filas: [
        [String(y1), wrap(cifraODisponible(S, y1, 'la TRM promedio'))],
        [String(y2), wrap(cifraODisponible(S, y2, 'la TRM promedio'))],
      ],
      fuente,
    });
  }

  {
    const { valores: S, fuente } = serie('desempleo_colombia');
    tablas.push({
      nombre: 'Desempleo en Colombia',
      titulo: 'Tasa de Desempleo en Colombia (' + y + ' vs. Proyección ' + y3 + ')',
      cabeceras: ['Indicador', 'Valor (%)'],
      filas: [
        ['Desempleo ' + y, wrap(cifraODisponible(S, y, 'la tasa de desempleo'))],
        ['Desempleo Proyectado ' + y3, wrap(cifraODisponible(S, y3, 'la proyección de desempleo'))],
      ],
      fuente,
    });
  }

  return tablas;
}

/* ══════════════ Diagnóstico de cobertura ══════════════ */

/* Texto plano, sin etiquetas, sin acentos y en minúsculas. Sirve para reconocer un
   apartado del informe por lo que dice y no por cómo está marcado: la plantilla de
   cada cliente trae su propio HTML. */
const textoPlano = (html) => String(html || '')
  .replace(/<[^>]*>/g, ' ')
  .normalize('NFD')
  /* \p{M} (marcas combinantes) y no una clase con los caracteres literales: escritos
     tal cual son invisibles en el editor y cualquier herramienta que normalice el
     fuente los borraría sin que se note. */
  .replace(/\p{M}/gu, '')
  .replace(/\s+/g, ' ')
  .toLowerCase();

/* Antes esto era `html.includes('id="_Toc208930979"')`: el ancla de Word del
   apartado III.C en el .docx de End Game. Ese identificador no existe en la
   plantilla de ningún otro cliente, así que el diagnóstico daba «no cubierto» para
   todo el mundo y el aviso se volvía ruido que se aprende a ignorar.

   Se reconoce por texto porque el encabezado del apartado sí es estable entre
   informes: «Análisis del Sector …» o «… del sector de …». La detección es
   deliberadamente laxa —basta con que la frase aparezca en cualquier parte— porque
   el coste de los dos errores no es simétrico: un falso «cubierto» calla un aviso
   informativo, mientras que un falso «no cubierto» acusa de incompleta a una
   plantilla que está bien, que es como se enseña a la gente a no leer el banner. */
const RX_SECTORIAL = /analisis del sector|del sector de /;

/** Qué quedó sin cubrir en el informe. Alimenta el aviso de ReporteGenerador: un
 *  banner que dice qué falta sirve; uno que solo dice «revise el documento» no. */
export function diagnosticarCobertura(rawHtml, study, datosMacro, analisisSector) {
  const year = Number(study && study.anio) || 2025;

  const seriesFaltantes = [];
  const porAnio = [
    ['el crecimiento del PIB mundial', 'pib_mundial'],
    ['el crecimiento del PIB de Colombia', 'pib_colombia'],
    ['la inflación global', 'inflacion_global'],
    ['la inflación de Colombia', 'inflacion_colombia'],
    ['la TRM promedio', 'trm_promedio'],
    ['la tasa de desempleo', 'desempleo_colombia'],
    ['la tasa de intervención del Banco de la República', 'tasa_intervencion'],
    ['las proyecciones de crecimiento por región', 'crecimiento_por_region'],
  ];
  porAnio.forEach(([concepto, clave]) => {
    const remota = datosMacro && datosMacro.series && datosMacro.series[clave];
    const serie = (remota && remota.valores) || DATOS_MACRO[clave];
    if (!serie || serie[year] === undefined) seriesFaltantes.push(concepto);
  });

  /* La tabla de razones de rechazo solo se puede armar si el motor dejó su embudo, o si el
     estudio trae la matriz del universo (`matrizRechazo`, que manda cuando está presente —
     ver `filasRazonesRechazo`). Sin ninguna de las dos, esa tabla sale con los números que
     traiga la plantilla, que es exactamente lo que no debe pasar en un documento que se
     radica: hay que avisarlo antes. */
  const razones = filasRazonesRechazo(study && study.embudoSeleccion, study && study.matrizRechazo);

  /* Lo mismo para las tablas de la muestra y de los márgenes: sin comparables en el
     estudio se quedan con las compañías que trajera la plantilla, con nombre y margen.
     Es la fuga más visible que puede tener el documento, así que se avisa aparte. */
  const comparables = filasComparablesInforme(study);

  /* ── LA MATRIZ PUEDE ESTAR AL DÍA CONSIGO MISMA Y AUN ASÍ ATRASADA RESPECTO A LA MUESTRA ──
     `matrizRechazo` es una FOTO: se guarda cuando el paso 3 tiene el universo cargado, y desde
     ahí puede quedar atrás si el estudio se sigue editando sin volver a abrir ese paso —una
     comparable que se agrega o retira en otra pantalla no la toca—. `razones.cuadra` no lo
     detecta: la foto puede sumar perfectamente el universo que ella misma declara y aun así no
     ser la foto DE la muestra que el informe está a punto de radicar. Se compara con la cuenta
     real —`filasComparablesInforme`, la misma que arma la Tabla 17— porque esa sí es siempre la
     muestra vigente, foto o no.
     Detectado auditando ACO SOLUCIONES DE DRENAJE (2026-09-21). */
  const filaAceptadas = razones.filas.find((f) => f.clave === 'aceptadas');
  const matrizConDatos = !!(study && study.matrizRechazo && study.matrizRechazo.porMotivo
    && Object.keys(study.matrizRechazo.porMotivo).length);
  const matrizRechazoDesactualizada = matrizConDatos
    && (filaAceptadas ? filaAceptadas.cuantas : 0) !== comparables.length;

  return {
    year,
    sectorialCubierto: RX_SECTORIAL.test(textoPlano(rawHtml)),
    seriesFaltantes,
    narrativaCubierta: !!(datosMacro && datosMacro.narrativa && datosMacro.narrativa.mundial && datosMacro.narrativa.colombia),
    /* Distinto de sectorialCubierto: ese solo dice si la plantilla trae el apartado
       III.C; esto dice si YA se generó (o se reutilizó) el análisis de esa actividad
       para este año — sin eso, el apartado sale con el respaldo genérico y marcador. */
    sectorNarrativaCubierta: !!(analisisSector && analisisSector.porAnio && analisisSector.porAnio[String(year)]),
    razonesRechazoCubiertas: !razones.sinDatos,
    /* Los conteos no suman el universo evaluado: algo cambió en el estudio después de
       ejecutar la selección y la tabla quedaría inconsistente. */
    razonesRechazoDescuadradas: !razones.sinDatos && !razones.cuadra,
    /* La matriz cuadra consigo misma pero no con la muestra que el informe va a radicar (ver
       arriba): hay que reabrir el paso 3 con el cribado cargado para refrescarla, aunque esta
       tabla en concreto no avise de ningún descuadre interno. */
    matrizRechazoDesactualizada,
    comparablesCubiertas: comparables.length > 0,
    /* Comparables de la muestra sin estados financieros cargados: salen con hueco en la
       tabla de márgenes y no entran al rango. */
    comparablesSinCifras: comparables.filter((f) => f.ajustado === null).length,
    /* ── LAS QUE SALDRIAN SIN ACTIVIDAD, POR NOMBRE ──
       El ANEXO B publica `descActividad || desc` y, faltando las dos, imprime literalmente
       «Descripción de actividad no disponible.» (anexoBHtml.js, docxRelleno.js). Eso se radicaba
       sin que nada lo advirtiera, y es justo el sustento de comparabilidad que pregunta la DIAN
       (Art. 260-4 E.T.): una comparable de la que el informe no dice a qué se dedica no sostiene
       la comparación que se está usando para justificar el precio.

       Se leen de `study.comparables` y con el MISMO filtro del anexo —las que tienen razón
       social—, para que lo que se cuenta aquí sea exactamente lo que va a salir impreso. Y se
       devuelven los NOMBRES y no un conteo: «3 comparables sin actividad» obliga a buscarlas
       una por una en la tabla. */
    comparablesSinActividad: ((study && study.comparables) || [])
      .filter((c) => c && String(c.name || '').trim())
      .filter((c) => !String((c.descActividad || c.desc) || '').trim())
      .map((c) => String(c.name).trim()),
  };
}

/* ══════════════ Criterios de búsqueda (Tablas 13 a 15) ══════════════

   Los criterios con los que se cribó el universo salen de la hoja «Screen Criteria» del
   export de Capital IQ y `parsearCriteriosScreening` los deja en `study.criteriosScreening`
   —ver el comentario de esa función en `comparablesEngine.js`, que ya anticipaba esta
   tabla y la dejó «a la espera de que la ruta por campos con nombre lo publique»—. Hasta
   ahora nadie los publicaba: el informe se radicaba con los criterios de la corrida del año
   anterior, incluidos el rango de códigos SIC y la ventana de cierre fiscal.

   La plantilla arma la tabla con una fila de dos celdas (etiqueta y valor) por criterio.
   El conector lógico con el que Capital IQ combina un criterio con el anterior (`Y`/`O`)
   no se muestra como fila propia: solo importa cuando une varias opciones dentro del
   valor de un mismo criterio (p. ej. «Compañía pública O compañía privada»), y eso ya
   queda resuelto en el propio `valor` traducido — ver `criteriosScreeningEs.js`. */

/**
 * Filas de la tabla de criterios de búsqueda, una por criterio.
 *
 * Devuelve `[]` cuando el estudio no trae criterios: la tabla conserva entonces lo que
 * traía la plantilla y el motor lo avisa. Blanquearla sería peor —quien revisa no sabría
 * que el cribado de este año no dejó criterios— y es el mismo contrato que siguen las
 * demás tablas del motor.
 *
 * El texto se traduce aquí, en el render, y no al importar el Excel: la hoja «Screen
 * Criteria» de Capital IQ viene en inglés, y traducir en este punto hace que los estudios
 * ya guardados —que tienen el inglés almacenado en Firestore— salgan en español sin
 * reimportar nada. `traducirCriterio` es puro e idempotente, así que un criterio que ya
 * esté en español pasa sin cambio (ver `criteriosScreeningEs.js`).
 *
 * @param {object} study
 * @returns {string[][]}
 */
export function filasCriteriosScreening(study) {
  const criterios = (study && study.criteriosScreening) || [];
  const filas = [];
  criterios.forEach((c) => {
    if (!c) return;
    const es = traducirCriterio(c);
    filas.push([es.etiqueta, es.valor]);
  });
  return filas;
}
