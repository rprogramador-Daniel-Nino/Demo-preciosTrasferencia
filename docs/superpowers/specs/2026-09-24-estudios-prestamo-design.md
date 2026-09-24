# Estudios de tipo préstamo: nuevo flujo cuando `tipo_estudio === 'prestamo'`

**Fecha:** 2026-09-24
**Estado:** diseño en revisión — Fase 1 (ingesta) lista para plan de implementación.
Fases 2-4 quedan documentadas como mapa de trabajo futuro, sin diseño detallado.

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
| **1. Ingesta** | Leer la hoja de préstamos del Excel de Operaciones y guardar los datos en el estudio | Parcial (ver Diseño) | **Diseñada en este documento** |
| 2. Tabla del informe | Tabla "Préstamo con su vinculado", dos apariciones, en el informe Word | Sí — casi idéntico al patrón de "Operación adicional" (DIAN 61-63), ver `docs/superpowers/specs/2026-08-19-operacion-adicional-informacion-adicional-design.md` | Documentada, sin diseño detallado |
| 3. Histórico de la deuda | Segunda tabla, préstamos como columnas | Ninguno | Sin diseñar |
| 4. Comparabilidad de tasas | Tasa pactada vs. tasa Prime, método PC, percentiles | Ninguno — motor de rango nuevo, paralelo a `rangoIntercuartil.js` | Sin diseñar |

Decisiones ya confirmadas por el usuario que aplican a la Fase 2 cuando se diseñe:
- Debe funcionar con los dos botones existentes de generación en `ReporteGenerador.jsx`: el
  de subir la plantilla `.docx` propia del cliente (ruta `docxRelleno.js`, sección
  reemplazada donde la IA la encuentre) y el de "Crear sin plantilla" (la tabla se arma
  solo con los datos ingestados, sin depender de una plantilla marcada).
- La tabla puede faltar en la plantilla del cliente (primer año como estudio de préstamo), así
  que hace falta la lógica de inserción-si-falta, igual que en el patrón de "Operación
  adicional" (`docxRelleno.js:2561-2584`).

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

## Verificación

1. `npm test` — la suite completa, incluida la actualización de
   `excelOperationsParser.test.js`, debe quedar en verde.
2. `npm run lint --prefix frontend`.
3. Manual en `npm run dev --prefix frontend`, con el Excel real de referencia (o una copia
   sintética con la misma forma): crear un estudio con `tipo_estudio = 'prestamo'`, subir el
   Excel de Autoland en el paso de Ingesta de Operaciones, y confirmar que la tarjeta muestra
   las 4 filas de desembolsos con sus fechas, montos y tasas correctas. Repetir con un estudio
   `tipo_estudio = 'estandar'` y el mismo archivo, y confirmar que NO aparece la tarjeta de
   préstamos (aunque el parser sí haya leído la hoja).
