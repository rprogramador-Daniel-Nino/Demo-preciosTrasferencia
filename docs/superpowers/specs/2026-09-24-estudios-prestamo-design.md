# Estudios de tipo préstamo: nuevo flujo cuando `tipo_estudio === 'prestamo'`

**Fecha:** 2026-09-24 (Fase 1), actualizado 2026-09-25 (Fase 2)
**Estado:** Fase 1 implementada y desplegada en pruebas. Fase 2 (tabla del informe) diseñada
en este documento, en revisión — lista para plan de implementación. Fases 3-4 siguen
documentadas como mapa de trabajo futuro, sin diseño detallado.

## Problema

`DatosContribuyente.jsx:122-131` ya tiene un selector "Tipo de Estudio" con las opciones
Estándar / Préstamo / Segmentación, y el valor se guarda, se valida y se pinta como badge en
la bandeja (`BandejaEstudios.jsx`, `firestoreModelo.js:372`). Pero **elegir "Préstamo" no
cambia una sola línea de comportamiento** en ningún otro punto del sistema — ni en la ingesta
de operaciones, ni en el motor de comparables, ni en la generación del informe. Es un campo
de datos puro sin ningún flujo detrás.

Un estudio de préstamo necesita un flujo real: el Excel de operaciones trae una hoja propia
("Op. Prestamos Vinculados Econom" o su equivalente en paraísos fiscales) con una estructura
de 18 columnas que no se parece a nada que el sistema sepa leer hoy, y el informe final
necesita una tabla nueva, "Préstamo con su vinculado", que resume esos desembolsos.

**Evidencia real** (revisada con permiso, dos archivos de un estudio entregado a un
cliente — `Informacion Operaciones PT 2025_Autoland.xlsx` e `Informe Local_Autoland
2025.docx`):

La hoja `Op. Prestamos Vinculados Econom` del Excel trae, con encabezados en la fila 7
(1-based):

| Crédito | Razón Social de quien otorga | Razón Social de quien recibe | Fuente de los recursos | Fecha original en la que se pactó | Valor del desembolso (moneda pactada) | Moneda pactada | No. de desembolsos | Fecha de desembolso | Valor en COP en la fecha de desembolso | Valor en COP del saldo al 31/dic | Intereses del FY (moneda pactada) | Intereses del FY (COP) | Plazo | Renovado | Cancelado | Tasa EA | Tasa pactada (si no hay EA) | Periodicidad |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Inversiones San Jerónimo SpA | Autoland SAS | | 27/10/2020 (serial 44131) | 3.000.000 | USD | 1 | 27/10/2020 | 10.431.000.000 | 13.227.449.999,99 | 138.470 | 579.346.941 | No definido | DD/MM/AAAA | DD/MM/AAAA | 4,540% Efectivo Anual | | |
| 2 | Inversiones San Jerónimo SpA | Autoland SAS | | 07/07/2022 | 2.000.000 | USD | 1 | 07/07/2022 | 8.822.000.000 | 8.818.300.000 | 122.001 | 510.441.906 | No definido | DD/MM/AAAA | DD/MM/AAAA | 6,000% Efectivo Anual | | |

Y el informe entregado incluye, dos veces (descripción de la operación y análisis de
comparabilidad), una tabla derivada de esos mismos desembolsos:

```
Tabla 1. Préstamo con su vinculado.
+-------------------------------------------------------------------------------------+
|                          INVERSIONES SAN JERONIMO SPA.                              |
+------------------+-----------------+----------+---------------------------+--------+
| Fecha original   | Valor del       | Moneda   | Valor en COP en la fecha  | E. A   |
| en la que se     | desembolso en   | pactada  | de desembolso             |        |
| pactó            | USD             |          |                           |        |
+------------------+-----------------+----------+---------------------------+--------+
| 27/10/2020       | 3.000.000       | USD      | 10.431.000.000            | 4,540% |
| 07/07/2022       | 2.000.000       | USD      | 8.822.000.000              | 6,000% |
| 24/10/2022       | 1.300.000       | USD      | 6.194.500.000              | 6,000% |
| 9/03/2023        | 4.300.000       | USD      | 20.657.200.000             | 6,000% |
+------------------+-----------------+----------+---------------------------+--------+
Fuente: Información suministrada por AUTOLAND S.A.S.
```

Además hay una **segunda tabla** ("Histórico de la deuda intereses sobre Préstamos (42)",
con cada préstamo como columna), un párrafo narrativo con detalles contractuales del pagaré
(mutuario/mutuante, cláusulas, plazos — texto que no viene del Excel), y un **análisis de
comparabilidad completo** que compara la tasa pactada de cada préstamo contra una tasa Prime
de referencia con percentiles (método de Precio Comparable). Ninguna de esas tres piezas
tiene hoy ningún cimiento en el código: no existe motor de rango para tasas de interés (el
campo `study.prime` que parecía relacionado es en realidad el ajuste de capital de trabajo
del motor de comparables por margen — `ajusteRangoCapitalTrabajo.js:354`,
`MotorComparables.jsx:2344` — sin relación con préstamos).

## Descomposición en fases

Este documento diseña en detalle solo la **Fase 1**. Las fases 2-4 quedan anotadas como mapa
de trabajo para specs futuros, con las decisiones ya tomadas por el usuario que les aplican.

| Fase | Qué hace | Precedente en el código | Estado |
|---|---|---|---|
| **1. Ingesta** | Leer la hoja de préstamos del Excel de Operaciones y guardar los datos en el estudio | Parcial (ver Diseño) | **Implementada y desplegada en pruebas** |
| **2. Tabla del informe** | Tabla "Préstamo con su vinculado", dos apariciones, en el informe Word | Sí — casi idéntico al patrón de "Operación adicional" (DIAN 61-63), ver `docs/superpowers/specs/2026-08-19-operacion-adicional-informacion-adicional-design.md` | **Diseñada en este documento** |
| 3. Histórico de la deuda | Segunda tabla, préstamos como columnas | Ninguno | Sin diseñar |
| 4. Comparabilidad de tasas | Tasa pactada vs. tasa Prime, método PC, percentiles | Ninguno — motor de rango nuevo, paralelo a `rangoIntercuartil.js` | Sin diseñar |

## Fase 1 — Ingesta del Excel de préstamo

### Bug a corregir primero

`excelOperationsParser.js:82-85` reconoce hojas de operaciones por si su nombre (sin tildes,
en mayúsculas) contiene `'VINC'` o `'PARAISO'`. Como "Op. Prestamos Vinculados Econom"
contiene "Vinculados", **hoy ya entra a ese barrido genérico** y se parsea con la estructura
de columnas equivocada (la de vinculado/NIT/país/tipo de operación/monto), perdiendo sus 18
columnas reales. Confirmé que también existe una hoja gemela para vinculados en paraísos
fiscales, "Op. Prestamos Paraisos Fiscales", con la misma estructura de 18 columnas (vacía en
el archivo de referencia, porque Autoland no tiene vinculados en paraísos fiscales).

`excelOperationsParser.test.js:121-132,177-199` ya tiene pruebas que usan el nombre de la
hoja de préstamos, pero asumiendo (incorrectamente) el layout genérico — hay que corregirlas
para que reflejen la estructura real.

### Diseño

**1. Excluir las hojas de préstamo del barrido genérico y reconocerlas aparte**
(`excelOperationsParser.js`, junto a `hojasAEscanear`):

```js
const esHojaDePrestamos = (nombre) => normalizarNombreHoja(nombre).includes('PREST');
const hojasAEscanear = (wb.SheetNames || []).filter((nombre) => {
  const n = normalizarNombreHoja(nombre);
  return (n.includes('VINC') || n.includes('PARAISO')) && !esHojaDePrestamos(nombre);
});
const hojasPrestamos = (wb.SheetNames || []).filter(esHojaDePrestamos);
```

Por decisión del usuario, el match es `'PREST'` (no `'PRESTAM'`): cubre también nombres de
hoja como "...CON PRESTAR..." además de préstamo/préstamos. Es más laxo — un nombre de hoja
no relacionado que empiece por "PREST" (ej. "Prestaciones") también entraría por este filtro,
pero como el resto del reconocimiento exige además la fila de encabezados real (ver abajo),
una hoja así simplemente no producirá ninguna fila y no se distingue de "esta hoja no trae
datos de préstamo".

**2. Reconocer la fila de encabezados y las 18 columnas**, con el mismo estilo que
`indicesDeEncabezado` (`excelOperationsParser.js:34-56`) pero con su propio vocabulario —
p.ej. `iCredito` (contiene "crédito"), `iOtorga` (contiene "otorga"), `iRecibe` (contiene
"recibe"), `iFechaPacto` (contiene "fecha original"), `iValorMoneda` (contiene "valor del
desembolso" y NO contiene "cop" — para no chocar con "valor en cop en la fecha de
desembolso"), `iMoneda` (contiene "moneda pactada"), `iFechaDesembolso` (contiene "fecha de
desembolso"), `iValorCOP` (contiene "valor en cop" y "desembolso" — para no chocar con "valor
en cop del saldo"), `iSaldoCOP` (contiene "saldo al 31"), `iTasaEA` (contiene "efectiva
anual"), y así con el resto. La fila de encabezados se ubica igual que hoy (barrido de las
primeras ~25 filas buscando un texto distintivo, aquí "crédito" + "razón social").

**3. Convertir fechas seriales de Excel.** No existe ninguna utilidad de fechas en el
proyecto hoy. En vez de activar `cellDates: true` globalmente en `XLSX.read` (riesgo de
romper el resto del parser, que lee todas las demás hojas como texto con
`sheet_to_json(sh, {header:1, defval:''})`), se resuelve puntual y localmente para las
columnas de fecha de esta hoja con `XLSX.SSF.parse_date_code(serial)` → `new Date(y, m-1,
d)`, con `null` si la celda no es un número válido.

**4. Nueva forma de fila y campo de retorno.** Cada fila válida (con otorga+recibe no
vacíos) se arma como:

```js
{
  credito, otorga, recibe, fuente,
  fechaPacto,            // Date | null
  valorDesembolsoMoneda, // number
  moneda,                // string, ej. "USD"
  numDesembolsos,
  fechaDesembolso,       // Date | null
  valorCOPDesembolso,    // number
  saldoCOP,              // number
  interesesMoneda, interesesCOP, // number
  plazo, renovado, cancelado,    // string, tal cual vienen
  tasaEA,                // string tal cual, ej. "4,540% Efectivo Anual"
  tasaPactada, periodicidad,     // string
  esParaisoFiscal,        // boolean — true si la fila vino de la hoja cuyo nombre normalizado
                           // también contiene 'PARAISO' (ej. "Op. Prestamos Paraisos
                           // Fiscales"), false si vino de la hoja de vinculados económicos
}
```

`parseExcelOperations` agrega `prestamos: filas.length ? filas : null` a su objeto de
retorno (mismo criterio `null`-cuando-no-aplica que ya usa `operacionAdicional`,
`excelOperationsParser.js:370-378`). Se capturan TODAS las columnas aunque la Fase 1 del
informe solo necesite cinco (fecha de pacto, valor, moneda, valor COP, tasa EA): así las
fases 2-4 no necesitan que el analista vuelva a cargar el Excel ni que se extienda el parser
otra vez.

El parser sigue siendo agnóstico de `study.tipo_estudio` (no recibe `study`, ver hallazgo de
exploración): lee la hoja de préstamos si está presente, sin importar el tipo de estudio. Es
quien lo llama el que decide qué hacer con el resultado.

**5. `IngestaOperaciones.jsx`** — condicionar el guardado y la UI a
`study.tipo_estudio === 'prestamo'`:
- En `handleExcelUpload`, si `study.tipo_estudio === 'prestamo'`, agregar
  `prestamos: res.prestamos` al `updateStudy(...)` existente (línea 25-40) — siempre,
  también `null`, para que un archivo sin la hoja borre datos de una carga anterior (mismo
  criterio que `operacionAdicional`).
- Aviso nuevo en el mensaje de resultado: si `study.tipo_estudio === 'prestamo'` y
  `res.prestamos` es `null`, avisar que no se encontró la hoja de préstamos; si trae filas,
  confirmar cuántas y con qué vinculado.
- Tarjeta nueva de resumen (mismo patrón visual que "Operación Adicional Detectada",
  líneas 261-310), visible solo si `study.tipo_estudio === 'prestamo' && study.prestamos`,
  con una tabla de las columnas que alimentan la Fase 2: fecha de pacto, valor del
  desembolso, moneda, valor en COP, tasa EA.

**6. Pruebas.** Corregir `excelOperationsParser.test.js:121-132,177-199` (hoy asumen el
layout genérico para la hoja de préstamos) y agregar casos nuevos: exclusión del barrido
genérico, reconocimiento de headers con nombres de hoja variantes (mayúsculas/tildes/
truncado a 31 caracteres), conversión de fecha serial, filas vacías de plantilla descartadas
(como las de la hoja de paraísos fiscales del archivo de referencia, sin otorga/recibe
diligenciados), y la forma completa del objeto devuelto.

### Lo que entra en la Fase 1

1. Reconocimiento propio de la(s) hoja(s) de préstamo, separado del barrido genérico.
2. Lectura de las 18 columnas, con conversión de fecha.
3. Guardado en `study.prestamos`, condicionado a `tipo_estudio === 'prestamo'`.
4. Aviso y tarjeta de resumen en `IngestaOperaciones.jsx`.
5. Pruebas corregidas y nuevas en `excelOperationsParser.test.js`.

### Lo que NO entra en la Fase 1, por decisión explícita

- La tabla "Préstamo con su vinculado" en el informe Word (Fase 2).
- La tabla "Histórico de la deuda" (Fase 3).
- El análisis de comparabilidad de tasas contra la tasa Prime (Fase 4).
- Edición manual de los datos de préstamo desde la UI si el Excel no trae la hoja (hoy solo
  se avisa que falta; diligenciar a mano queda para cuando se sepa si hace falta).

### Verificación (Fase 1)

1. `npm test` — la suite completa, incluida la actualización de
   `excelOperationsParser.test.js`, debe quedar en verde.
2. `npm run lint --prefix frontend`.
3. Manual en `npm run dev --prefix frontend`, con el Excel real de referencia (o una copia
   sintética con la misma forma): crear un estudio con `tipo_estudio = 'prestamo'`, subir el
   Excel de Autoland en el paso de Ingesta de Operaciones, y confirmar que la tarjeta muestra
   las 4 filas de desembolsos con sus fechas, montos y tasas correctas. Repetir con un estudio
   `tipo_estudio = 'estandar'` y el mismo archivo, y confirmar que NO aparece la tarjeta de
   préstamos (aunque el parser sí haya leído la hoja).

**Nota (2026-09-25): la Fase 1 ya se implementó, se revisó con subagentes y se desplegó al
entorno de pruebas.** El candado por etapas también se extendió: la etapa "Ingesta de
Operaciones" no se puede confirmar en un estudio de préstamo sin datos de `study.prestamos`
(`flujoEstudio.js: operacionesPrestamoCompleto`, `App.jsx`).

## Fase 2 — Tabla "Préstamo con su vinculado" en el informe

### Evidencia real de la tabla a reproducir

```
Tabla 1. Préstamo con su vinculado.
+-------------------------------------------------------------------------------------+
|                          INVERSIONES SAN JERONIMO SPA.                              |
+------------------+-----------------+----------+---------------------------+--------+
| Fecha original   | Valor del       | Moneda   | Valor en COP en la fecha  | E. A   |
| en la que se     | desembolso en   | pactada  | de desembolso             |        |
| pactó            | USD             |          |                           |        |
+------------------+-----------------+----------+---------------------------+--------+
| 27/10/2020       | 3.000.000       | USD      | 10.431.000.000            | 4,540% |
| 07/07/2022       | 2.000.000       | USD      | 8.822.000.000             | 6,000% |
| 24/10/2022       | 1.300.000       | USD      | 6.194.500.000             | 6,000% |
| 9/03/2023        | 4.300.000       | USD      | 20.657.200.000            | 6,000% |
+------------------+-----------------+----------+---------------------------+--------+
Fuente: Información suministrada por AUTOLAND S.A.S.
```

Diferencia clave frente al precedente más cercano (la tabla "Operación adicional
Transacciones Intercompañía", DIAN 61-63): esta tabla trae el **nombre del vinculado como
fila de encabezado fusionada** (una sola celda que ocupa las 5 columnas) por encima de los
títulos de columna — algo que `generarTablaOoxml()` (`docxRelleno.js:271-334`) no soporta
hoy, porque ninguna tabla existente del informe lo necesita.

Aparece **dos veces** en el documento entregado (descripción de la operación y análisis de
comparabilidad), igual que la Tabla 3 "Transacciones Inter compañía".

### Origen de los datos

`study.prestamos` (poblado por la Fase 1, `excelPrestamosParser.js:122-143`): un arreglo de
filas, una por desembolso, con `otorga`/`recibe` (nombres de las partes), `fechaPacto` (string
ISO `"AAAA-MM-DD"` o `null`), `valorDesembolsoMoneda` (number), `moneda` (string),
`valorCOPDesembolso` (number), `tasaEA` (string tal cual del Excel, ej. `"4,540% Efectivo
Anual"`), y más columnas que esta fase no usa todavía (se guardaron pensando en las Fases 3-4).

**Quién es "el vinculado" de la fila de encabezado**: ni `otorga` ni `recibe` son
inherentemente "el vinculado" — depende de si el contribuyente prestó o recibió el préstamo.
Se determina comparando cada nombre (normalizado: mayúsculas, espacios colapsados) contra
`study.ent` (la razón social del contribuyente) y tomando el que NO coincide.

**Si hay más de un vinculado distinto** entre las filas de `study.prestamos` (no ocurre en el
archivo de referencia, que solo tiene uno): por decisión de alcance, todas las filas se listan
bajo el nombre del vinculado de la PRIMERA fila. No hay precedente en el código de cómo
separar una tabla en varias por vinculado, y el único caso real disponible no lo necesita —
se revisita si aparece un caso real con varios vinculados.

### Diseño

**1. Nuevo archivo de datos `frontend/src/services/tablasPrestamos.js`** (mismo rol que
`tablasContribuyente.js`: datos de tablas específicas de un dominio, compartidos entre las dos
rutas de generación):

```js
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
  return `${d}/${m}/${y}`;
}

const montoTexto = (v) => {
  const n = num(v);
  return n === null ? '—' : fmt(n);
};

export function tienePrestamos(estudio) {
  return !!estudio && Array.isArray(estudio.prestamos) && estudio.prestamos.length > 0;
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
```

**2. Ruta OOXML (`docxRelleno.js`)** — nueva función `generarTablaOoxmlConVinculado(titulo,
vinculado, cabeceras, filas, fuente)`, junto a `generarTablaOoxml` (línea 271-334): mismo
código (anchos de columna, bordes, fuente de letra, celdas) más una fila adicional ANTES de
la fila de encabezados, con una sola celda fusionada (`<w:gridSpan w:val="{colCount}"/>`) del
ancho completo de la tabla, centrada y en negrita, con el nombre del vinculado. Se duplica el
código de las celdas en vez de parametrizar `generarTablaOoxml` porque cada función de este
archivo ya arma su propia tabla de punta a punta (es el patrón que siguen `generarTabla19` y
las demás) — mantiene cada una legible de una sola pasada, a costa de un poco de repetición
que el propio archivo ya acepta en otras tablas.

En `actualizarTablasOperacionesOoxml` (`docxRelleno.js:2434-3037`), agregar un bloque nuevo
junto al de "3-bis. Operación adicional" (línea 2524-2590), siguiendo el MISMO patrón:

```js
if (tienePrestamos(estudio)) {
  const t = filasPrestamoConVinculado(estudio);
  const emitirPrestamo = (b) => generarTablaOoxmlConVinculado(
    tituloDe(b, t.nombre), t.vinculado, t.encabezados, t.filas, t.fuente
  );

  const bloques = candidatosBloqueTabla(doc.xml, NOMBRES_TABLA_PRESTAMO);
  if (bloques.length) {
    /* Aparece hasta dos veces en la plantilla (descripción + análisis). Se refrescan TODAS
       las que la plantilla ya traiga, de atrás hacia adelante, igual que Transacciones Inter
       compañía — conservando la forma que cada una ya tenía ahí. */
    for (let idx = bloques.length - 1; idx >= 0; idx--) {
      reemplazar(NOMBRES_TABLA_PRESTAMO, emitirPrestamo, { ocurrencia: idx });
    }
  } else {
    /* La plantilla no la trae (primer año como estudio de préstamo): se inserta UNA vez,
       junto a «Transacciones Inter compañía», igual que «Operación adicional». La segunda
       aparición (dentro del análisis de comparabilidad) depende de esa sección, que no existe
       todavía — se construye cuando se diseñe la Fase 4. */
    const insertada = doc.insertar(
      NOMBRES_TABLA_TRANSACCIONES,
      (ancla) => {
        const titulo = ancla.numero != null ? 'Tabla ' + (ancla.numero + 1) + '. ' + t.nombre : t.nombre;
        return generarTablaOoxmlConVinculado(titulo, t.vinculado, t.encabezados, t.filas, t.fuente);
      },
      { excluir: NOMBRES_TABLA_PRESTAMO }
    );
    if (Array.isArray(avisos)) {
      avisos.push(insertada
        ? 'se insertó la tabla «' + t.nombre + '» después de «Transacciones Inter compañía» ' +
          'porque la plantilla no la traía: revise la numeración de las tablas siguientes'
        : NOMBRES_TABLA_PRESTAMO[0]);
    }
  }
} else {
  /* No aplica a este estudio (no es de tipo préstamo, o no tiene datos de préstamo): si la
     plantilla trae la tabla —heredada de un informe de otro tipo de estudio—, se borra. */
  const bloques = candidatosBloqueTabla(doc.xml, NOMBRES_TABLA_PRESTAMO);
  for (let idx = bloques.length - 1; idx >= 0; idx--) {
    doc.borrar(NOMBRES_TABLA_PRESTAMO, { ocurrencia: idx });
  }
}
```

**3. Ruta HTML — plantilla marcada (`tablasOperacionesHtml.js`)**: agregar una entrada al
array `OBJETIVOS` cuando la tabla YA está en la plantilla (mismo mecanismo que usa
`localizarTablasHtml`/`reescribirFilasHtml`, que conserva la fila fusionada del vinculado tal
cual la trae la plantilla — solo se reescriben las filas de datos, nunca el encabezado). Para
el caso "la plantilla no la trae", replicar el bloque de `NOMBRES_TABLA_ADICIONAL` (líneas
233-290 de ese archivo) adaptado a `NOMBRES_TABLA_PRESTAMO`/`tienePrestamos`, con una
diferencia deliberada: `insertarTablaHtml` clona la forma del ancla, y el ancla
("Transacciones Inter compañía") no tiene la fila fusionada del vinculado — en vez de
intentar fabricar esa fusión en HTML (arriesgando que `docxWriter.js` no traduzca bien un
`colspan`, algo que no está probado en este código), el vinculado se agrega como un párrafo
en negrita ANTES de la tabla insertada, usando el mismo título. Es una diferencia menor y solo
aplica al caso "insertar por primera vez"; una tabla que la plantilla ya trae conserva su
fusión real sin tocarla.

**4. Ruta HTML — sin plantilla (`informeSinPlantilla.js`)**: agregar una sección nueva al
array `partes` de `construirHtmlSinPlantilla`, siguiendo el patrón `tablaDesde`:

```js
seccion(
  t.vinculado ? `Préstamo con su vinculado — ${t.vinculado}` : 'Préstamo con su vinculado',
  tablaDesde(filasPrestamoConVinculado(e)),
),
```

donde `t = filasPrestamoConVinculado(e)` se calcula una vez antes del array (patrón ya usado
para otras secciones condicionales de ese archivo). Como este documento es explícitamente un
borrador de trabajo (no lleva prosa legal ni membrete), el nombre del vinculado va en el
título de la sección en vez de una fila fusionada — coherente con que el resto de tablas de
esta ruta tampoco llevan esa clase de adorno.

**5. Alcance de "aparece dos veces"**: cubierto completamente cuando la plantilla YA trae las
dos apariciones (se refrescan ambas). Cuando falta, solo se inserta UNA vez (junto a
Transacciones Inter compañía) — la segunda aparición vive dentro del análisis de
comparabilidad de tasas, que es la Fase 4 y no existe todavía; intentar insertarla ahí sin esa
sección construida no tiene un ancla real a la cual anclarse.

### Lo que entra en la Fase 2

1. `tablasPrestamos.js` con `filasPrestamoConVinculado`/`tienePrestamos`/`NOMBRES_TABLA_PRESTAMO`.
2. `generarTablaOoxmlConVinculado` y su bloque en `actualizarTablasOperacionesOoxml` (ruta
   .docx marcado): refresca hasta dos apariciones si la plantilla las trae; inserta una si no
   las trae; borra la tabla si el estudio no aplica.
3. Bloque equivalente en `tablasOperacionesHtml.js` (ruta plantilla marcada por IA desde PDF).
4. Sección nueva en `informeSinPlantilla.js` (ruta "Crear sin plantilla").
5. Pruebas unitarias de `filasPrestamoConVinculado`/`vinculadoDePrestamo` con los datos reales
   de Autoland, y de `generarTablaOoxmlConVinculado` (que el XML resultante sea válido y
   contenga el `gridSpan` y el nombre del vinculado).

### Lo que NO entra en la Fase 2, por decisión explícita

- Separar la tabla en varias cuando hay más de un vinculado distinto (sin precedente, sin
  caso real que lo exija todavía).
- La segunda aparición de la tabla cuando la plantilla no la trae (depende del análisis de
  comparabilidad, Fase 4).
- La tabla "Histórico de la deuda" (Fase 3) y el análisis de comparabilidad de tasas (Fase 4).

### Verificación (Fase 2)

1. `npm test` en verde, incluidas las pruebas nuevas de `tablasPrestamos.js` y de
   `generarTablaOoxmlConVinculado`.
2. `npm run lint --prefix frontend`.
3. Manual: generar el informe (las tres rutas — subir plantilla .docx, plantilla PDF marcada,
   y "Crear sin plantilla") para un estudio de préstamo con los datos de Autoland, y confirmar
   que la tabla aparece con el nombre del vinculado, las 4 filas y los valores correctos.
   Repetir con un estudio estándar y confirmar que la tabla no aparece (y que se borra si la
   plantilla la traía de un informe anterior de otro tipo).
