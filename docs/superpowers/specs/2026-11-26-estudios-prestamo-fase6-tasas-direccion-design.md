# Estudios de tipo préstamo — Fase 6: trío de tasas condicionado por dirección y tasa índice+spread

**Fecha:** 2026-11-26
**Estado:** Diseñada, lista para implementar.
**Precedente:** `docs/superpowers/specs/2026-09-24-estudios-prestamo-design.md` (Fases 1-2),
commits `8366937`/`409184b`/`b9d1c90` (Fases 4-5, sin spec formal propia — este documento las
retoma). Único caso real usado hasta ahora para diseñar el motor de tasas: Autoland (un
vinculado, pasivo, tasa EA directa).

## Problema

El usuario pidió validar el motor de préstamos contra tres estudios reales ya radicados ante
la DIAN (Alciautos, Suma Móvil, Sungrow), cada uno con documentación completa (Excel de
operaciones, EEFF, informe del año anterior, informe entregado). Para entender la metodología
real detrás de los números, también se leyeron los libros de Excel de trabajo que usan los
contadores del despacho para calcular el rango intercuartílico (`Análisis de tasas
ALCIAUTOS 2025.xlsx`, `Análisis de tasas SUNGROUW_2025.xlsx`).

**Hallazgo central:** el motor (`prestamoTasasCalculo.js`, `prestamoTasasPrompts.js`,
`tablasPrestamoTasas.js`) asume SIEMPRE el trío PRIME+SOFR+TMC. Los papeles de trabajo reales
muestran que el trío depende de si el contribuyente colombiano es deudor (préstamo **pasivo**,
recibe el dinero) o acreedor (préstamo **activo**, lo presta):

| Caso real | Dirección | Trío usado (confirmado en el Excel de trabajo) | Riesgo País |
|---|---|---|---|
| Suma Móvil (recibe de Grupo Ingenium Tecnología S.L., España) | Pasivo | PRIME + SOFR + TMC | Se incluye (Colombia) |
| Sungrow (recibe de Sungrow Renewable Energy Investment Pte Ltd, Singapur) | Pasivo | PRIME + SOFR + **CIRR** | Se incluye, pero el papel de trabajo del contador apunta por error a la fila de Singapur (acreedor, Aaa → 0) en vez de Colombia, pese a que su propio comentario ("el país deudor es Colombia") dice lo contrario |
| Alciautos (otorga a Favina Holdings Inc, Panamá) | **Activo** | PRIME + **CIRR + LIBOR** | Se omite, por instrucción expresa documentada en la hoja: *"No se toma Riesgo País según indicaciones"* |

Confirmado en ambos libros de Excel (fórmulas leídas con `openpyxl`, con y sin
`data_only=True`): el ajuste por Moody's Aaa y riesgo país siempre es **interés compuesto**
`=+((1+ref)*(1+moodys)*(1+riesgoPais)-1)` — coincide exactamente con `tasaAjustada()` en
`prestamoTasasCalculo.js:32-38`, no requiere cambios. El cuartil también coincide: `=QUARTILE(
rango, 1|2|3)` sobre **exactamente 3 valores puntuales** (nunca series históricas completas),
igual que `rangoIntercuartil()` vía `cuartilInterpolado`.

**Decisión del usuario** (tras ver esta evidencia, revirtiendo una decisión anterior de
mantener el trío fijo): condicionar el trío por dirección
(pasivo → PRIME+SOFR+TMC, activo → PRIME+CIRR+LIBOR) y aplicar el riesgo país de Colombia
solo en pasivo (replicando la *intención* declarada en los papeles de trabajo, no el bug
mecánico de Sungrow que por accidente apunta a Singapur).

**Segundo hallazgo, independiente pero del mismo caso Alciautos:** su tasa real no es "Efectivo
Anual" sino **"LIBOR + 1 punto"** (índice + spread) — el Excel de operaciones de Alciautos
tiene las columnas `tasaEA`/`tasaPactada`/`periodicidad` completamente vacías para esa fila; el
dato solo existe redactado a mano en el informe. El campo `tasaPactada`/`periodicidad` ya se
captura desde la Fase 1 (`excelPrestamosParser.js`) pero hoy es código muerto: ninguna tabla ni
cálculo lo lee (`numeroDesdeTexto(f.tasaEA)` en `tablasPrestamoColumnas.js:131-134` y
`tablasPrestamoTasas.js:184` solo miran `tasaEA`).

**Tercer hallazgo, un bug ya existente que esta fase corrige de paso:** `tablasPrestamoTasas.js`
(Fase 4) usa `estudio.vinc` para el nombre del vinculado en la Tabla 6/20
(`filasTablaRangoIntercuartil`, línea 63) y en la Conclusión (línea 201) — exactamente el
campo que la Fase 2/3 **decidieron explícitamente no usar**, por quedar desactualizado o traer
la contraparte equivocada (ver comentario de cabecera de `tablasPrestamoColumnas.js:14-23`, caso
real reportado 2026-11-25: "BRUNO FRITSCH SA" en vez de "Inversiones San Jeronimo SpA"). La
Fase 6 alinea la Tabla 6/20 al mismo criterio que ya usan la Tabla 1/4/13
(`vinculadoDePrestamo(fila, ent)`).

## Diseño

### 1. Dirección del préstamo — `tablasPrestamos.js`

Nueva función exportada, junto a `vinculadoDePrestamo` (misma comparación otorga/recibe contra
`estudio.ent`, ya normalizada con `normalizarNombreCompania`):

```js
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
 *  vinculado" que ya usan Tabla 1/4/13 — Fase 7 lo generaliza por grupo). */
export function direccionPrestamoEstudio(estudio) {
  if (!tienePrestamos(estudio)) return null;
  return direccionPrestamo(estudio.prestamos[0], estudio.ent);
}
```

Casos de prueba reales: `direccionPrestamo({otorga:'Grupo Ingenium Tecnologia S.L.', recibe:'Suma Movil SAS'}, 'Suma Movil SAS') === 'pasivo'`;
`direccionPrestamo({otorga:'Alciautos S.A.S.', recibe:'Favina Holdings Inc'}, 'Alciautos S.A.S.') === 'activo'`;
caso sin coincidencia → `null`.

### 2. Trío por dirección + riesgo país condicionado — `prestamoTasasCalculo.js`

```js
export const TRIOS_POR_DIRECCION = {
  pasivo: ['prime', 'sofr', 'tmc'],
  activo: ['prime', 'cirr', 'libor'],
};

/** Trío de series para una dirección dada; `pasivo` es el valor por defecto razonable si la
 *  dirección no se pudo determinar (es el caso ya cubierto por todas las pruebas y el caso
 *  real original, Autoland). */
export function trioDeDireccion(direccion) {
  return TRIOS_POR_DIRECCION[direccion] || TRIOS_POR_DIRECCION.pasivo;
}

/** Si el riesgo país aplica para esta dirección — solo pasivo (Colombia es el país deudor);
 *  en activo se omite por decisión documentada en los papeles de trabajo reales. */
export function aplicaRiesgoPais(direccion) {
  return direccion !== 'activo';
}
```

`tasaAjustada(refPct, moodysPct, riesgoPaisPct)` no cambia de firma — cuando no aplica riesgo
país, quien llama le pasa `0` explícitamente (no `null`, que haría que toda la fórmula
devuelva `null` por la guarda `esNumero` existente). Documentar esto en el JSDoc de la función.

`totalesPorFecha(tasasFecha, riesgoPaisPct, series)` gana un tercer parámetro: la lista de
series a calcular (antes hardcodeada a `['prime','sofr','tmc']` vía las claves fijas del
objeto de retorno `{prime, sofr, tmc}`). Pasa a devolver un objeto dinámico `{[serie]: total}`
con una clave por cada entrada de `series` (default `TRIOS_POR_DIRECCION.pasivo`, para no
romper las pruebas existentes que no pasan el tercer argumento).

Caso de prueba real (Alciautos, activo, sin riesgo país, trío PRIME+CIRR+LIBOR): rango
reportado 4,708 % / 5,164 % / 5,775 %. Caso de prueba real (Sungrow, pasivo, con riesgo país
de Colombia = 2,845 %, trío PRIME+SOFR+CIRR — **nota:** Sungrow usó CIRR en vez de TMC pese a
ser pasivo, apartándose del trío por defecto; tratarlo como una entrada manual que sobreescribe
el trío calculado, no como una regla nueva — ver §6): tasas ajustadas reportadas PRIME 12,339 %
/ SOFR 9,021 % / CIRR (no capturado en la extracción, pendiente de confirmar con el libro de
trabajo si hace falta una prueba exacta), rango 10,680 % / 12,339 % / 15,075 %.

### 3. Prompt de búsqueda — `prestamoTasasPrompts.js`

`SERIES` deja de ser la constante fija `['prime', 'sofr', 'tmc', 'moodys']`. Se construye a
partir del trío recibido: `seriesDePrompt(trio) => [...trio, 'moodys']`.

`construirPromptTasasPrestamo(fechasPacto, anioInforme, trio)` gana el parámetro `trio`
(default `TRIOS_POR_DIRECCION.pasivo`, para no romper las llamadas existentes): el texto del
prompt arma la lista de series a buscar dinámicamente, agregando la descripción de CIRR y
LIBOR cuando el trío las incluya:

- **LIBOR**: "London Interbank Offered Rate, USD, a 12 meses, tasa diaria vigente en la
  fecha. Esta serie dejó de publicarse el 30 de junio de 2023 — si la fecha es posterior,
  OMITE la clave 'libor' para esa fecha, nunca inventes ni estimes un valor publicado después
  de esa fecha de cesación" (mismo criterio textual que ya usa la descripción de SOFR para su
  fecha de inicio — se prefirió "omite la clave" a "usa la serie de reemplazo" para no mezclar
  SOFR en un prompt que, en un trío activo, no la pide).
- **CIRR**: "Commercial Interest Reference Rate de la OCDE (Arrangement on Officially
  Supported Export Credits, Anexo XVI), para la moneda del préstamo, tasa vigente en la
  fecha."

`parsearRespuestaTasasPrestamo`/`fusionarTasasPrestamo` generalizan `SERIES` al trío recibido
(mismo parámetro, mismo default) — su lógica de `confiable`/`disponible`/fusión no cambia,
solo la lista de claves que procesan.

`serieDisponible(serie, fechaIso)` gana una rama para `libor`: disponible siempre que la fecha
NO sea posterior al 30/06/2023 (`FECHA_FIN_LIBOR_USD = '2023-06-30'`) — a diferencia de SOFR
(que es un piso), LIBOR es un techo. Caso de prueba: fecha de pacto 2018 (Alciautos) →
disponible; una fecha hipotética 2024 → no disponible (declarar el hueco, igual criterio que
ya existe para SOFR antes de abril de 2018).

### 4. Tasa índice + spread — resolución cuando falta `tasaEA`

Nueva función en `prestamoTasasCalculo.js` (vive ahí porque es aritmética pura sobre tasas, no
sobre texto de tablas):

```js
/**
 * La tasa efectiva anual de un préstamo: si `tasaEA` trae un número legible, se usa tal
 * cual (vía `numeroDesdeTexto`, ya existente en `tablasPrestamoTasas.js` — se mueve a este
 * archivo porque ahora la usan dos módulos). Si no, y `periodicidad`/`tasaPactada` describen
 * un índice reconocido ("LIBOR"/"SOFR", con o sin "+ N punto(s)"/"+ N%"), se resuelve
 * buscando el valor del índice en `tasasPrestamo.porFecha[fechaPacto]` y sumando el spread.
 * `null` si no hay ninguna de las dos fuentes, o el índice mencionado no es uno de los ya
 * soportados (nunca se inventa una serie nueva).
 */
export function tasaEfectivaDeFila(fila, tasasPrestamo) { /* ... */ }

/** Extrae `{indice, spreadPct}` de un texto libre tipo "LIBOR + 1 punto" / "Libor USD tres
 *  meses + 1,5%" / "SOFR+2". `indice` es 'libor'|'sofr'|null; `spreadPct` es 0 si no se
 *  menciona spread. Nunca reconoce 'prime'/'tmc'/'cirr' como índice variable del préstamo
 *  mismo (son solo tasas de referencia de mercado para el rango, no tasas que un contrato
 *  real paute como base + spread en los 3 casos vistos). */
export function parsearIndiceSpread(texto) { /* ... */ }
```

Caso de prueba real: `parsearIndiceSpread('LIBOR + 1 punto')` → `{indice:'libor', spreadPct:1}`;
`parsearIndiceSpread('')` → `{indice:null, spreadPct:0}`.
`tasaEfectivaDeFila({tasaEA:'', periodicidad:'LIBOR + 1 punto', fechaPacto:'2018-06-30'},
tasasPrestamoConLiborDeEsaFecha)` → `4.535 + 1 = 5.535` (reproduce el 5,535 % reportado por
Alciautos para el desembolso del 30/06/2018 — la cifra de LIBOR exacta de esa fecha no se
confirmó en esta ronda de investigación; el caso de prueba del plan debe fijar el valor de
entrada, no asumir que el sistema lo busca solo en esta fase, dado que la búsqueda de LIBOR
vía IA es parte del punto 3, no de este punto).

`tablasPrestamoColumnas.js` (fila "Tasa Pactada", hoy `wrap(p.tasaEA)`) y
`tablasPrestamoTasas.js` (`filasTablaRangoIntercuartil`, `conclusionRangoIntercuartilPrestamo`)
pasan a usar `tasaEfectivaDeFila(p, tasasPrestamo)` en vez de leer `p.tasaEA` directo —
cuando resuelve por índice+spread, el texto mostrado en la tabla debe seguir siendo el
original del Excel/captura manual (`p.tasaEA || p.periodicidad || '—'`), solo el NÚMERO usado
para la posición/el cálculo cambia de fuente.

### 5. Corrección del vinculado en Tabla 6/20 y Conclusión

En `tablasPrestamoTasas.js`, `filasTablaRangoIntercuartil` y
`conclusionRangoIntercuartilPrestamo` dejan de leer `estudio.vinc` y usan
`vinculadoDePrestamo(estudio.prestamos[0], estudio.ent)` (import ya existente de
`tablasPrestamos.js`, misma Fase 2) — alineado con Tabla 1/4/13.

### 6. Qué NO entra en esta fase, por decisión explícita

- **Selección automática de CIRR en vez de TMC para un préstamo pasivo** (el caso real de
  Sungrow, que se apartó del trío por defecto): no hay ninguna regla en los papeles de trabajo
  que explique esa elección más allá del criterio del analista en ese caso puntual — se deja
  como **edición manual** del trío en la UI (Fase 6 incluye un selector editable, no solo un
  trío calculado y fijo), no como una regla condicionada nueva sin evidencia que la respalde.
- Fase 7 (múltiples vinculados con direcciones potencialmente distintas) y Fase 8 (OCR de
  EEFF) — specs separados.
- La corrección del Riesgo País de Sungrow (apunta a Singapur en vez de Colombia) es un bug
  del PAPEL DE TRABAJO del cliente, no del software — no se replica ese bug; el software
  aplicará siempre el riesgo país de Colombia en pasivo, como dicen los papeles de trabajo que
  debería ser.

## Verificación

1. `node --test frontend/src/services/tablasPrestamos.test.js frontend/src/services/prestamoTasasCalculo.test.js frontend/src/services/prestamoTasasPrompts.test.js frontend/src/services/tablasPrestamoTasas.test.js frontend/src/services/tablasPrestamoColumnas.test.js` — casos nuevos en verde.
2. `node --test "scripts/lib"/*.test.js "frontend/src/services"/*.test.js "frontend/src/utils"/*.test.js "functions"/*.test.js` — suite completa en verde.
3. `npm run lint --prefix frontend` sin advertencias nuevas.
4. `npm run build --prefix frontend` compila.
5. Manual: un estudio préstamo pasivo (datos tipo Suma: sin override, debe salir PRIME+SOFR+TMC
   con riesgo país) y uno activo (datos tipo Alciautos: PRIME+CIRR+LIBOR sin riesgo país, tasa
   resuelta por índice+spread) en `PrestamoTasas.jsx`, confirmando que el trío mostrado cambia
   solo y que el analista puede editarlo a mano.
