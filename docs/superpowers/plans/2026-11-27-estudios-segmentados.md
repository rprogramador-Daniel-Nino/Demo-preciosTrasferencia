# Estudios de tipo "Segmentación" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un estudio con `tipo_estudio === 'segmentacion'` pide, en el paso 3 ("Estados
financieros"), el estado financiero segmentado real de la compañía, extrae las cifras del
segmento donde está la operación con el vinculado (no de toda la compañía), y no deja avanzar
a la etapa 4 sin esa lectura — todo lo demás (ajustes, motor de comparables, Word) sigue
funcionando sin cambios porque la lectura escribe en los mismos campos canónicos de siempre
(`t_s`, `t_c`, `t_gastos`, `t_op`).

**Architecture:** Tres módulos de servicio nuevos y dedicados (prompt+parseo, detección de
columnas por segmento, verificación+cuadre), ninguno bifurca los módulos existentes de EEFF
estándar. Un candado nuevo en `flujoEstudio.js` que replica el de préstamo. Una sección
condicional en `IngestaCifras.jsx` y una limpieza al cambiar de tipo de estudio en
`DatosContribuyente.jsx`.

**Tech Stack:** React 19 (frontend/), Gemini Vision OCR vía `/api/gemini`, `node:test` +
`node:assert` para la suite de `frontend/src/services/`.

**Spec:** `docs/superpowers/specs/2026-11-27-estudios-segmentados-design.md`

## Global Constraints

- Ningún módulo nuevo bifurca `eeffParser.js`/`eeffVerificacion.js`/`eeffColumnas.js` con un
  `if (tipo_estudio === 'segmentacion')`; se les importan solo los helpers genéricos ya
  exportados, sin modificar su lógica (salvo exportar dos helpers privados, Task 1).
- `tipo_estudio === 'prestamo'` y el flujo `estandar` no cambian de comportamiento en absoluto.
- Nada de universos completos ni páginas OCR crudas en los campos nuevos del estudio — mismo
  criterio que ya aplica a `t_lecturaEeff`.
- Reutilizar `postGeminiWithRetry`, `extraerJSON`, `bloqueDeTexto`, `valorDeRubro`,
  `repararCifrasDelEstudio`, `rotuloDeRubro` (`eeffParser.js`), `utilidadOperacionalDe`,
  `gastosOperativosDe` (`eeffVerificacion.js`), `filasConColumnas`, `seccionQueAbre`,
  `subseccionQueAbre`, `seccionesDeFilas`, `esCeldaDeCifra` (`eeffColumnas.js`) — no se
  reimplementa ninguno de estos.
- El descuadre segmento-vs-compañía es una **advertencia**, nunca bloquea la etapa 4
  (decisión cerrada en el spec, sección "Decisiones cerradas tras la revisión del builder
  check", punto 2).
- La verificación de cada cifra del segmento es **por columna**, no por "aparece en algún
  lugar del texto" (mismo punto, punto 1).

## Review Focus

- Documento segmentado escaneado sin capa de texto: debe degradar a "no verificado" (igual
  que el EEFF estándar), nunca bloquear la carga ni fallar con una excepción sin capturar.
- Una compañía con más de dos segmentos en el estado (no solo "el segmento bajo estudio" y
  "otros"): el cuadre debe sumar TODOS los segmentos devueltos, nunca asumir exactamente dos.
- El analista carga el documento pero todavía no elige cuál columna es el segmento bajo
  estudio: la etapa 4 debe seguir bloqueada (no basta con que exista una lectura, tiene que
  haber un segmento elegido).
- Cambiar `tipo_estudio` de `'segmentacion'` a otro valor después de ya tener cifras del
  segmento aplicadas: deben limpiarse `t_s/t_c/t_gastos/t_op`, no quedar pegadas como si
  fueran de toda la compañía.
- El descuadre segmento-vs-total queda fuera de tolerancia: debe aparecer como advertencia
  visible y dejar pasar la etapa 4 de todas formas, nunca bloquear ni fallar silenciosamente.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `frontend/src/services/eeffParser.js` (modificado) | exporta dos helpers ya existentes (`leerBase64`, `mimeDe`) para que el módulo nuevo los reutilice |
| `frontend/src/services/eeffSegmentacionColumnas.js` (nuevo) | detecta, en la estructura del PDF, cuál columna pertenece a cada segmento (por su rótulo, no por un regex de año) y ubica cada cifra en su columna correcta |
| `frontend/src/services/eeffSegmentacionParser.js` (nuevo) | prompt dedicado + llamada a Gemini Vision; devuelve los rubros de CADA segmento que el documento trae, más el total de la compañía |
| `frontend/src/services/eeffSegmentacionVerificacion.js` (nuevo) | calcula la utilidad operacional del segmento elegido, verifica sus cifras por columna, y cuadra la suma de segmentos contra el total |
| `frontend/src/services/flujoEstudio.js` (modificado) | `segmentacionCompleto(study)`, wiring en `motorComparableCompleto`, `limpiezaAlCambiarTipoEstudio(tipoAnterior, tipoNuevo)` |
| `frontend/src/components/IngestaCifras.jsx` (modificado) | sección condicional de carga para `tipo_estudio === 'segmentacion'`: sube el documento, muestra el selector de segmento, aplica las cifras; oculta `seg_excluido`/`seg_motivo` para este tipo |
| `frontend/src/components/DatosContribuyente.jsx` (modificado) | al cambiar `tipo_estudio`, aplica `limpiezaAlCambiarTipoEstudio` |
| `frontend/smoke_panel.mjs` (modificado) | nuevo render SSR de `IngestaCifras` con `tipo_estudio: 'segmentacion'` |

**Por qué la verificación por columna no se puede anotar de antemano, a diferencia del año.**
Un año se reconoce con un regex (`/^(19|20)\d{2}$/`) sin haber leído nada del documento, así
que `eeffColumnas.js` anota el texto ANTES de llamar a Gemini. Un rótulo de segmento es
texto libre que decide el cliente (p. ej. "Tecnología"/"Otros") y no se puede adivinar sin
haber leído el documento primero. Por eso el flujo aquí es: (1) `eeffSegmentacionParser.js`
le pide a Gemini los rubros de CADA segmento que encuentre, en bruto, sin anotar columnas;
(2) una vez el modelo devuelve los rótulos que de verdad usó, `eeffSegmentacionVerificacion.js`
llama a `eeffSegmentacionColumnas.js` con esos rótulos ya conocidos para verificar cada cifra
contra su columna real — exactamente el mismo papel que `ubicacionDeCifra` cumple para los
años, solo que se invoca después de la primera lectura en vez de antes.

---

### Task 1: Exportar `leerBase64` y `mimeDe` de `eeffParser.js`

**Files:**
- Modify: `frontend/src/services/eeffParser.js:1039-1057`
- Test: `frontend/src/services/eeffParser.test.js`

**Interfaces:**
- Produces: `export async function leerBase64(file): Promise<string>`,
  `export function mimeDe(file): string` — mismo comportamiento de hoy, solo con `export`
  agregado delante de cada declaración.

- [ ] **Step 1: Escribir la prueba que falla**

```js
import { leerBase64, mimeDe } from './eeffParser.js';

test('mimeDe reconoce una imagen por su nombre de archivo', () => {
  assert.equal(mimeDe({ type: '', name: 'foto.jpg' }), 'image/jpeg');
});

test('mimeDe cae en application/pdf para lo demás', () => {
  assert.equal(mimeDe({ type: '', name: 'estado.pdf' }), 'application/pdf');
});
```

- [ ] **Step 2: Confirmar que falla**

Run: `node --test frontend/src/services/eeffParser.test.js`
Expected: FAIL — `leerBase64`/`mimeDe` no están exportados (`undefined` no es una función).

- [ ] **Step 3: Agregar `export` a las dos declaraciones**

Solo anteponer la palabra `export` a `async function leerBase64(file)` y a
`function mimeDe(file)` donde ya están definidas. Ningún otro cambio en el archivo.

- [ ] **Step 4: Confirmar que pasa**

Run: `node --test frontend/src/services/eeffParser.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/eeffParser.js frontend/src/services/eeffParser.test.js
git commit -m "refactor: exportar leerBase64/mimeDe para reutilizarlos en segmentación"
```

---

### Task 2: `eeffSegmentacionColumnas.js` — detección de columnas por segmento

**Files:**
- Create: `frontend/src/services/eeffSegmentacionColumnas.js`
- Test: `frontend/src/services/eeffSegmentacionColumnas.test.js`

**Interfaces:**
- Consumes: `filasConColumnas(items, tolerancia?)`, `seccionQueAbre(fila)`,
  `subseccionQueAbre(fila)`, `seccionesDeFilas(filas)`, `esCeldaDeCifra(texto)` — todas de
  `./eeffColumnas.js`, sin modificar.
- Produces:
  - `export function encabezadoDeSegmentos(filas, etiquetas: string[]): {y, columnas: Array<{etiqueta, derecha}>, tolerancia} | null`
  - `export function asignarSegmentos(fila, encabezado): Map<celda, etiqueta>`
  - `export function estructuraSegmentosDeFilas(paginasDeFilas, etiquetas): {paginas, etiquetasHalladas: string[]}`
  - `export async function extraerEstructuraPdfSegmentos(file, etiquetas): Promise<{paginas, etiquetasHalladas}>`
  - `export function ubicacionDeCifraSegmento(estructura, {rotulo, valor, etiqueta, subseccion?}): {veredicto: 'coincide'|'otra-columna'|'corregible'|'vacio-en-el-segmento'|'fuera-de-columna'|'sin-verificar', etiquetaHallada?, seccion?, rotuloReal?, esperado?}`

Este módulo es la contraparte de `eeffColumnas.js` para columnas de **segmento** en vez de
años. Sigue el mismo algoritmo función por función — implementar cada una mirando su
equivalente exacto en `eeffColumnas.js` y adaptando la clave de agrupación de `anio` a
`etiqueta`:

| Nueva función | Equivalente en `eeffColumnas.js` | Qué cambia |
|---|---|---|
| `encabezadoDeSegmentos` | `encabezadoDeAnios`/`encabezadoDeFila` | en vez de `RX_ANIO_CELDA` (regex de 4 dígitos), una fila es candidata a encabezado si trae, como celdas distintas, un texto que normalizado (usar `normalizarPalabra` de `./vocabularioEeff.js`, igual que ya hace `eeffColumnas.js`) coincide con CADA una de las `etiquetas` recibidas. No hace falta la heurística de "¿cuántas cifras explica debajo?": con el rótulo exacto ya conocido no hay candidatas ambiguas que desempatar. |
| `asignarSegmentos` | `asignarAnios` | idéntico: mismo criterio de borde derecho + tolerancia, mismo desempate "una celda, un segmento" resuelto del más cercano al más lejano. |
| `estructuraSegmentosDeFilas` / `extraerEstructuraPdfSegmentos` | `estructuraDeFilas` / `extraerEstructuraPdf` | idéntico recorrido de páginas; agrega `etiquetasHalladas` (las etiquetas de `encabezadoDeSegmentos` que sí se encontraron en al menos una página) para que el llamador sepa si el documento de verdad trae las columnas que el modelo dijo haber leído. |
| `ubicacionDeCifraSegmento` | `ubicacionDeCifra` | mismos cinco+uno veredictos, renombrando `anio`/`anioObjetivo` a `etiqueta`/`etiquetaObjetivo` y `otro-anio`→`otra-columna`, `vacio-en-el-anio`→`vacio-en-el-segmento`. La función interna de comparación de cifras (`celdaTraeCifra` en el original) se reimplementa igual aquí (no está exportada en `eeffColumnas.js`). |

- [ ] **Step 1: Escribir las pruebas que fallan, con el mismo estilo de fixtures que**
  `eeffColumnas.test.js` (función `celda(texto, derecha, ancho)` y `fila(y, celdas)`)

```js
import { test } from 'node:test';
import assert from 'node:assert';
import {
  encabezadoDeSegmentos, asignarSegmentos, ubicacionDeCifraSegmento, estructuraSegmentosDeFilas,
} from './eeffSegmentacionColumnas.js';

const celda = (texto, derecha, ancho = 60) => ({ x: derecha - ancho, derecha, texto });
const fila = (y, celdas) => ({ y, celdas });

// Caso real: OFIMIO, dos columnas "Tecnologia" / "Otros", año 2025.
const ENCABEZADO_OFIMIO = fila(700, [celda('Tecnologia', 400), celda('Otros', 520)]);
const FILA_COSTO_VENTAS = fila(650, [
  celda('Costo de ventas', 200, 150), celda('4.480.893.365', 400, 100), celda('255.120.091', 520, 90),
]);

test('encabezadoDeSegmentos reconoce las dos columnas por su rótulo exacto', () => {
  const enc = encabezadoDeSegmentos([ENCABEZADO_OFIMIO, FILA_COSTO_VENTAS], ['Tecnologia', 'Otros']);
  assert.ok(enc);
  assert.deepEqual(enc.columnas.map((c) => c.etiqueta), ['Tecnologia', 'Otros']);
});

test('encabezadoDeSegmentos no reconoce una fila que no trae las dos etiquetas pedidas', () => {
  const otra = fila(700, [celda('Tecnologia', 400), celda('Inmobiliario', 520)]);
  assert.equal(encabezadoDeSegmentos([otra], ['Tecnologia', 'Otros']), null);
});

test('asignarSegmentos etiqueta cada cifra con su columna de segmento', () => {
  const enc = encabezadoDeSegmentos([ENCABEZADO_OFIMIO, FILA_COSTO_VENTAS], ['Tecnologia', 'Otros']);
  const asignado = asignarSegmentos(FILA_COSTO_VENTAS, enc);
  const porTexto = new Map([...asignado].map(([c, e]) => [c.texto, e]));
  assert.equal(porTexto.get('4.480.893.365'), 'Tecnologia');
  assert.equal(porTexto.get('255.120.091'), 'Otros');
});

test('ubicacionDeCifraSegmento dice "coincide" cuando la cifra está en su fila y su columna', () => {
  const estructura = estructuraSegmentosDeFilas(
    [{ numero: 1, filas: [ENCABEZADO_OFIMIO, FILA_COSTO_VENTAS] }], ['Tecnologia', 'Otros'],
  );
  const r = ubicacionDeCifraSegmento(estructura, {
    rotulo: 'Costo de ventas', valor: 4480893365, etiqueta: 'Tecnologia',
  });
  assert.equal(r.veredicto, 'coincide');
});

test('ubicacionDeCifraSegmento dice "otra-columna" cuando la cifra es del otro segmento', () => {
  const estructura = estructuraSegmentosDeFilas(
    [{ numero: 1, filas: [ENCABEZADO_OFIMIO, FILA_COSTO_VENTAS] }], ['Tecnologia', 'Otros'],
  );
  const r = ubicacionDeCifraSegmento(estructura, {
    rotulo: 'Costo de ventas', valor: 255120091, etiqueta: 'Tecnologia',
  });
  assert.equal(r.veredicto, 'otra-columna');
  assert.equal(r.etiquetaHallada, 'Otros');
});
```

- [ ] **Step 2: Confirmar que fallan**

Run: `node --test frontend/src/services/eeffSegmentacionColumnas.test.js`
Expected: FAIL — el módulo no existe todavía.

- [ ] **Step 3: Implementar `eeffSegmentacionColumnas.js`** siguiendo la tabla de arriba.

- [ ] **Step 4: Confirmar que pasan**

Run: `node --test frontend/src/services/eeffSegmentacionColumnas.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/eeffSegmentacionColumnas.js frontend/src/services/eeffSegmentacionColumnas.test.js
git commit -m "feat: detección de columnas por segmento para EEFF segmentados"
```

---

### Task 3: `eeffSegmentacionParser.js` — prompt y lectura con Gemini Vision

**Files:**
- Create: `frontend/src/services/eeffSegmentacionParser.js`
- Test: `frontend/src/services/eeffSegmentacionParser.test.js`

**Interfaces:**
- Consumes: `leerBase64`, `mimeDe`, `postGeminiWithRetry`, `bloqueDeTexto`, `valorDeRubro`,
  `rotuloDeRubro` (`./eeffParser.js`, Task 1), `extraerTextoPdf` (`./eeffTextoPdf.js`),
  `extraerJSON` (`./comparablesEngine.js`).
- Produces: `export const EEFF_SEGMENTACION_PROMPT: string`,
  `export async function parseEeffSegmentadoWithGeminiOCR(file, anioEstudio): Promise<LecturaSegmentada>`
  donde `LecturaSegmentada` es:
  ```
  {
    segmentos: Array<{
      etiqueta: string,
      t_s: number|null, t_c: number|null,
      t_gastos_ventas: number|null, t_gastos_administracion: number|null,
      rotulos: { t_s?, t_c?, t_gastos_ventas?, t_gastos_administracion? },
    }>,
    totalCompania: { t_s, t_c, t_gastos_ventas, t_gastos_administracion }, // mismas 4 claves, para el cuadre
    textoPdf: string,
    anioObjetivo: string,
    rawJson: object,
  }
  ```
  Consumida por Task 4 (`eeffSegmentacionVerificacion.js`) y Task 6 (`IngestaCifras.jsx`).

`EEFF_SEGMENTACION_PROMPT` sigue la misma filosofía "transcribe, no interpretes" que
`EEFF_PROMPT` (misma regla central: cada cifra devuelta debe estar impresa, dígito por dígito;
sin estimar ni sumar filas que el documento no sume él mismo). A diferencia de `EEFF_PROMPT`,
NO se le pasa el texto anotado por columnas (ver nota de "File Structure" sobre por qué):
pide al modelo que **identifique cuántos segmentos/columnas de línea de negocio trae el
estado de resultados** (puede haber más de dos) y que, para CADA uno, devuelva con el formato
`{"valor":<número o null>,"rotulo":"<texto exacto de la fila>"}`: ingresos de actividades
ordinarias, costo de ventas, gastos de ventas y gastos de administración — más esas mismas
cuatro cifras para el total/consolidado de la compañía, si el documento lo imprime. El
rótulo de cada columna (`etiqueta`) debe ser el texto EXACTO del encabezado de esa columna
("Tecnología", "Otros", o lo que el documento use), para que Task 2 pueda ubicarlo.

`parseEeffSegmentadoWithGeminiOCR` sigue la misma forma que `parseEeffWithGeminiOCR`
(`eeffParser.js:609`): lee el archivo con `leerBase64`/`mimeDe`, extrae el texto con
`extraerTextoPdf`, arma las `parts` con `bloqueDeTexto(textoPdf)` (sin anotar), llama a
`postGeminiWithRetry({ model: 'gemini-3.5-flash', contents: [...] })`, extrae el JSON de la
respuesta con `extraerJSON`, y mapea `parsed.segmentos` (un array) y `parsed.total_compania`
con `valorDeRubro`/`rotuloDeRubro` sobre cada uno de los 4 rubros.

- [ ] **Step 1: Escribir la prueba que falla** (mockeando `axios.post` o inyectando la
  respuesta, igual que ya hacen las pruebas existentes de `eeffParser.test.js` para
  `parseEeffWithGeminiOCR` — revisar ese archivo para el patrón exacto de mock usado ahí y
  replicarlo)

```js
test('parseEeffSegmentadoWithGeminiOCR mapea los segmentos y el total de la compañía', async () => {
  // mock de la respuesta de Gemini con dos segmentos (Tecnologia, Otros) + total_compania,
  // siguiendo el mismo patrón de mock que usa eeffParser.test.js.
  const lectura = await parseEeffSegmentadoWithGeminiOCR(archivoFalso, 2025);
  assert.equal(lectura.segmentos.length, 2);
  assert.equal(lectura.segmentos[0].etiqueta, 'Tecnologia');
  assert.equal(lectura.segmentos[0].t_s, 6338341250);
  assert.ok(lectura.totalCompania);
});
```

- [ ] **Step 2: Confirmar que falla**

Run: `node --test frontend/src/services/eeffSegmentacionParser.test.js`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar `EEFF_SEGMENTACION_PROMPT` y `parseEeffSegmentadoWithGeminiOCR`**
  según la descripción de arriba.

- [ ] **Step 4: Confirmar que pasa**

Run: `node --test frontend/src/services/eeffSegmentacionParser.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/eeffSegmentacionParser.js frontend/src/services/eeffSegmentacionParser.test.js
git commit -m "feat: lectura de EEFF segmentados por segmento con Gemini Vision"
```

---

### Task 4: `eeffSegmentacionVerificacion.js` — verificación por columna y cuadre

**Files:**
- Create: `frontend/src/services/eeffSegmentacionVerificacion.js`
- Test: `frontend/src/services/eeffSegmentacionVerificacion.test.js`

**Interfaces:**
- Consumes: `utilidadOperacionalDe`, `gastosOperativosDe` (`./eeffVerificacion.js`, sin
  modificar), `extraerEstructuraPdfSegmentos`, `ubicacionDeCifraSegmento` (Task 2),
  `LecturaSegmentada` (forma producida por Task 3).
- Produces:
  `export async function verificarEeffSegmentado(lectura: LecturaSegmentada, { etiquetaSegmento: string, anioEstudio, toleranciaCuadre?: number }): Promise<VerificacionSegmentada>`
  donde `VerificacionSegmentada` es:
  ```
  {
    campos: { t_s, t_c, t_gastos, t_op },     // del segmento elegido, listos para aplicar al estudio
    advertencias: Array<{ tipo: string, mensaje: string, campo?: string }>,
    verificadoContraTexto: boolean,
    segmentosDisponibles: string[],           // las etiquetas que el documento trajo, para el selector de la UI
  }
  ```
  Consumida por Task 6 (`IngestaCifras.jsx`).

Pasos del cálculo:
1. `t_gastos = gastosOperativosDe({ ventas: segmento.t_gastos_ventas, administracion: segmento.t_gastos_administracion })`
   y `t_op = utilidadOperacionalDe({ ventas: segmento.t_s, costo: segmento.t_c, gastos: t_gastos })`
   sobre el segmento cuya `etiqueta === etiquetaSegmento`. Si `etiquetaSegmento` no está entre
   `lectura.segmentos`, lanzar un error (es un uso incorrecto del llamador, no un caso de
   negocio — el selector de la UI solo debe ofrecer etiquetas que sí estén).
2. Si `lectura.textoPdf` tiene contenido: llamar `extraerEstructuraPdfSegmentos` — pero esta
   función recibe un `file`, no texto; como `lectura` (Task 3) no trae el `file` original, el
   llamador (Task 6) debe pasar el `file` también a `verificarEeffSegmentado` (agregar
   `archivo` a los parámetros: `verificarEeffSegmentado(lectura, { etiquetaSegmento,
   anioEstudio, archivo, toleranciaCuadre })`), para poder construir la estructura y llamar
   `ubicacionDeCifraSegmento` por cada uno de los 4 rubros del segmento elegido. Un veredicto
   distinto de `coincide` agrega una advertencia (mensaje con el campo, lo leído y lo que la
   columna correcta dice, mismo tono que las de `eeffVerificacion.js`) pero NO descarta la
   cifra — a diferencia del EEFF estándar, aquí no hay fallback de notas que intente
   reemplazarla (ver spec, Non-goal/límite conocido): la cifra leída se mantiene y la
   advertencia es lo que alerta al analista.
3. Sin capa de texto (`extraerTextoPdf` devuelve vacío) se salta el paso 2 entero y
   `verificadoContraTexto: false`, igual que hace `verificarEeff` hoy.
4. **Cuadre:** sumar `t_s`/`t_c`/`t_gastos_ventas`/`t_gastos_administracion` de TODOS los
   elementos de `lectura.segmentos` (no solo dos) y comparar cada suma contra el rubro
   correspondiente de `lectura.totalCompania`, con tolerancia relativa `toleranciaCuadre`
   (default `0.01`, es decir 1 % — más holgada que la `TOLERANCIA_RELATIVA` de
   `eeffVerificacion.js` porque aquí sí puede haber un prorrateo manual de por medio con
   redondeos; valor dejado a criterio del implementador por el spec). Un descuadre agrega una
   advertencia de tipo `'descuadre-segmentos'` — nunca bloquea, nunca lanza.
5. `segmentosDisponibles` es `lectura.segmentos.map(s => s.etiqueta)`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
test('verificarEeffSegmentado calcula t_op del segmento elegido', async () => {
  const lectura = { segmentos: [
    { etiqueta: 'Tecnologia', t_s: 6338341250, t_c: 4480893365, t_gastos_ventas: 205866452, t_gastos_administracion: 709245287, rotulos: {} },
    { etiqueta: 'Otros', t_s: 436958939, t_c: 255120091, t_gastos_ventas: 10468160, t_gastos_administracion: 895251143, rotulos: {} },
  ], totalCompania: { t_s: 6775300189, t_c: 4736013456, t_gastos_ventas: 216334612, t_gastos_administracion: 1604496430 }, textoPdf: '' };
  const v = await verificarEeffSegmentado(lectura, { etiquetaSegmento: 'Tecnologia', anioEstudio: 2025, archivo: null });
  assert.equal(v.campos.t_s, 6338341250);
  assert.equal(v.verificadoContraTexto, false);
});

test('un descuadre fuera de tolerancia es una advertencia, no un bloqueo', async () => {
  const lectura = { segmentos: [
    { etiqueta: 'Tecnologia', t_s: 1000, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0, rotulos: {} },
  ], totalCompania: { t_s: 5000, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0 }, textoPdf: '' };
  const v = await verificarEeffSegmentado(lectura, { etiquetaSegmento: 'Tecnologia', anioEstudio: 2025, archivo: null });
  assert.ok(v.advertencias.some((a) => a.tipo === 'descuadre-segmentos'));
  assert.equal(v.campos.t_s, 1000, 'la cifra del segmento se mantiene pese al descuadre');
});

test('con más de dos segmentos, el cuadre suma todos antes de comparar', async () => {
  const lectura = { segmentos: [
    { etiqueta: 'A', t_s: 100, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0, rotulos: {} },
    { etiqueta: 'B', t_s: 200, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0, rotulos: {} },
    { etiqueta: 'C', t_s: 300, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0, rotulos: {} },
  ], totalCompania: { t_s: 600, t_c: 0, t_gastos_ventas: 0, t_gastos_administracion: 0 }, textoPdf: '' };
  const v = await verificarEeffSegmentado(lectura, { etiquetaSegmento: 'A', anioEstudio: 2025, archivo: null });
  assert.equal(v.advertencias.some((a) => a.tipo === 'descuadre-segmentos'), false);
});
```

- [ ] **Step 2: Confirmar que fallan**

Run: `node --test frontend/src/services/eeffSegmentacionVerificacion.test.js`
Expected: FAIL

- [ ] **Step 3: Implementar `verificarEeffSegmentado`** según los 5 pasos de arriba.

- [ ] **Step 4: Confirmar que pasan**

Run: `node --test frontend/src/services/eeffSegmentacionVerificacion.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/eeffSegmentacionVerificacion.js frontend/src/services/eeffSegmentacionVerificacion.test.js
git commit -m "feat: verificación por columna y cuadre de EEFF segmentados"
```

---

### Task 5: Candado de la etapa 4 y limpieza al cambiar de tipo de estudio

**Files:**
- Modify: `frontend/src/services/flujoEstudio.js`
- Test: `frontend/src/services/flujoEstudio.test.js`

**Interfaces:**
- Produces:
  - `export function segmentacionCompleto(study): boolean`
  - `export function limpiezaAlCambiarTipoEstudio(tipoAnterior, tipoNuevo): object|null`
  - Modifica `motorComparableCompleto(study)` (ya exportada): pasa de
    `return study.tipo_estudio === 'prestamo' ? prestamoTasasCompleto(study) : true;`
    a reconocer tres ramas (`prestamo`, `segmentacion`, cualquier otro → `true`), sin tocar la
    rama de préstamo.
- Consumes (de Task 4, indirectamente vía la forma del estudio): el estudio trae
  `t_lecturaSegmentacion` y `segmentoSeleccionado` cuando la ingesta de Task 6 ya corrió.

`segmentacionCompleto(study)` es `true` solo si `study.t_lecturaSegmentacion` existe
(truthy) **y** `study.segmentoSeleccionado` es una cadena no vacía — las dos cosas, porque
una lectura sin segmento elegido todavía no decidió qué cifras son las del estudio (ver
Review Focus, punto 3).

`limpiezaAlCambiarTipoEstudio(tipoAnterior, tipoNuevo)` devuelve
`{ t_s: null, t_c: null, t_gastos: null, t_op: null, t_lecturaSegmentacion: null, segmentoSeleccionado: null }`
cuando `tipoAnterior === 'segmentacion' && tipoNuevo !== 'segmentacion'`, y `null` en
cualquier otro caso (incluido cuando `tipoAnterior === tipoNuevo`).

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
test('segmentacionCompleto exige lectura Y segmento elegido', () => {
  assert.equal(segmentacionCompleto({ tipo_estudio: 'segmentacion' }), false);
  assert.equal(segmentacionCompleto({ tipo_estudio: 'segmentacion', t_lecturaSegmentacion: {} }), false, 'sin segmento elegido no basta');
  assert.equal(segmentacionCompleto({ tipo_estudio: 'segmentacion', t_lecturaSegmentacion: {}, segmentoSeleccionado: 'Tecnologia' }), true);
});

test('motorComparableCompleto exige segmentacionCompleto solo para tipo_estudio segmentacion', () => {
  const base = { actividad_especifica: 'Comercio de tecnología' };
  assert.equal(motorComparableCompleto({ ...base, tipo_estudio: 'segmentacion' }), false);
  assert.equal(motorComparableCompleto({
    ...base, tipo_estudio: 'segmentacion', t_lecturaSegmentacion: {}, segmentoSeleccionado: 'Tecnologia',
  }), true);
  // no rompe el caso existente de préstamo ni el estándar:
  assert.equal(motorComparableCompleto({ ...base, tipo_estudio: 'estandar' }), true);
});

test('limpiezaAlCambiarTipoEstudio limpia los campos del segmento al salir de segmentación', () => {
  const patch = limpiezaAlCambiarTipoEstudio('segmentacion', 'estandar');
  assert.deepEqual(patch, {
    t_s: null, t_c: null, t_gastos: null, t_op: null,
    t_lecturaSegmentacion: null, segmentoSeleccionado: null,
  });
});

test('limpiezaAlCambiarTipoEstudio no hace nada si no se sale de segmentación', () => {
  assert.equal(limpiezaAlCambiarTipoEstudio('estandar', 'prestamo'), null);
  assert.equal(limpiezaAlCambiarTipoEstudio('segmentacion', 'segmentacion'), null);
});
```

- [ ] **Step 2: Confirmar que fallan**

Run: `node --test frontend/src/services/flujoEstudio.test.js`
Expected: FAIL

- [ ] **Step 3: Implementar las tres funciones** en `flujoEstudio.js`, junto a
  `prestamoTasasCompleto`/`motorComparableCompleto` existentes.

- [ ] **Step 4: Confirmar que pasan, y que el resto de la suite de este archivo sigue en verde**

Run: `node --test frontend/src/services/flujoEstudio.test.js`
Expected: PASS (todas, incluidas las que ya existían)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/flujoEstudio.js frontend/src/services/flujoEstudio.test.js
git commit -m "feat: candado de etapa 4 y limpieza de campos para estudios segmentados"
```

---

### Task 6: Sección condicional de ingesta segmentada en `IngestaCifras.jsx`

**Files:**
- Modify: `frontend/src/components/IngestaCifras.jsx`
- Modify: `frontend/smoke_panel.mjs`

**Interfaces:**
- Consumes: `parseEeffSegmentadoWithGeminiOCR` (Task 3), `verificarEeffSegmentado` (Task 4),
  `repararCifrasDelEstudio` (`eeffParser.js`, sin cambios).
- No produce interfaces nuevas para otras tareas (es la última pieza de UI de este plan).

Cuando `study.tipo_estudio === 'segmentacion'`, la tarjeta "Ingesta de Estados Financieros"
(línea 403 en adelante del archivo actual) se reemplaza por una variante que:

1. Mismo dropzone de archivo (PDF/imagen), pero `onChange` llama a una función nueva
   `handleEeffSegmentadoUpload(file)` en vez de `handleEeffUpload`.
2. `handleEeffSegmentadoUpload` llama `parseEeffSegmentadoWithGeminiOCR(file, study.anio)`,
   guarda el resultado en un estado local nuevo `segmentosLeidos` (la `LecturaSegmentada`
   completa, para no tener que releer el archivo si el analista cambia de segmento elegido),
   y NO aplica cifras todavía — hace falta elegir el segmento primero.
3. Debajo del dropzone, si `segmentosLeidos` tiene más de una etiqueta, se muestra un botón
   por cada `segmentosLeidos.segmentos[i].etiqueta` (mismo estilo visual que los botones
   "Usar «X» (valor)" que ya existen para candidatas ambiguas en este archivo, línea ~511-519).
   Al hacer clic en uno: llama `verificarEeffSegmentado(segmentosLeidos, { etiquetaSegmento,
   anioEstudio: study.anio, archivo: file })` (el `file` original debe guardarse también en
   estado local junto con `segmentosLeidos`), aplica `verificacion.campos` al estudio vía
   `updateStudy` (pasando antes por `repararCifrasDelEstudio`, igual que hace
   `handleEeffUpload` hoy), y además `updateStudy({ segmentoSeleccionado: etiqueta,
   t_lecturaSegmentacion: { advertencias: verificacion.advertencias, verificadoContraTexto: verificacion.verificadoContraTexto, segmentosDisponibles: verificacion.segmentosDisponibles } })`.
4. Las advertencias de `study.t_lecturaSegmentacion.advertencias` se pintan con el mismo
   bloque visual rojo que ya existe para `hallazgos.advertencias` (línea ~493-526) — puede
   reutilizarse directamente, cambiando la fuente de datos.
5. El bloque "Monto Excluido / Motivo de la Exclusión" (`seg_excluido`/`seg_motivo`, líneas
   ~627-648 del archivo actual) se envuelve en `{study.tipo_estudio !== 'segmentacion' && (...)}`.

Para `tipo_estudio !== 'segmentacion'`, ningún comportamiento existente cambia: la condición
nueva es aditiva (una rama más en el render), no una reescritura del flujo actual.

- [ ] **Step 1: Agregar el caso de segmentación a `frontend/smoke_panel.mjs`**, justo después
  del render existente de `IngestaCifras` (línea ~159), con un estudio
  `{ tipo_estudio: 'segmentacion', anio: 2025, t_s: null, t_c: null }` y comprobar que el
  render no lanza y que el texto del bloque "Monto Excluido" no aparece:

```js
const html4 = renderToStaticMarkup(React.createElement(IngestaCifras, {
  study: { tipo_estudio: 'segmentacion', anio: 2025 },
  updateStudy: () => {},
}));
comprobar('estudio segmentado: no muestra el bloque de exclusión manual', !/Monto Excluido/.test(html4));
```

- [ ] **Step 2: Correr el smoke panel y confirmar que esta comprobación falla**

Run: `node frontend/smoke_panel.mjs`
Expected: FAIL en "estudio segmentado: no muestra el bloque de exclusión manual" (el bloque
siempre se muestra hoy).

- [ ] **Step 3: Implementar la sección condicional** según los 5 puntos de arriba.

- [ ] **Step 4: Correr el smoke panel y confirmar que pasa, junto con las comprobaciones
  existentes (Llantas Emotion, paso 3, etc.)**

Run: `node frontend/smoke_panel.mjs`
Expected: `→ todas las comprobaciones pasaron`

- [ ] **Step 5: Verificación manual en el navegador** (`npm run dev --prefix frontend`): crear
  un estudio con Tipo de Estudio = Segmentación, llegar al paso 3, cargar un PDF de EEFF
  segmentado real, elegir un segmento, confirmar que las cifras aplicadas y la utilidad
  operacional calculada coinciden con lo esperado, y que la etapa 4 sigue bloqueada hasta
  elegir el segmento.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/IngestaCifras.jsx frontend/smoke_panel.mjs
git commit -m "feat: ingesta de EEFF segmentado en el paso 3 del wizard"
```

---

### Task 7: Limpieza al cambiar `tipo_estudio` en `DatosContribuyente.jsx`

**Files:**
- Modify: `frontend/src/components/DatosContribuyente.jsx:21-23,124-133`

**Interfaces:**
- Consumes: `limpiezaAlCambiarTipoEstudio` (Task 5).

El `<select>` de "Tipo de Estudio" (línea 125-133) deja de llamar
`handleFieldChange('tipo_estudio', e.target.value)` genérico y pasa a llamar una función
nueva, local a este componente:

```js
const handleTipoEstudioChange = (nuevoTipo) => {
  const limpieza = limpiezaAlCambiarTipoEstudio(study.tipo_estudio, nuevoTipo);
  updateStudy({ tipo_estudio: nuevoTipo, ...(limpieza || {}) });
};
```

`handleFieldChange` (línea 21-23) no cambia: sigue siendo el genérico para todos los demás
campos de este formulario.

Esta pieza no tiene test unitario propio (la lógica que decide QUÉ limpiar ya la prueba
Task 5; aquí solo se conecta al evento del `<select>`) — se verifica con el mismo paso
manual de Task 6 (crear un estudio segmentado, cargar EEFF, y luego volver a Contribuyente y
cambiar el tipo a "Estándar": las cifras del segmento no deben quedar en el estudio).

- [ ] **Step 1: Implementar `handleTipoEstudioChange`** y conectarlo al `onChange` del
  `<select>` de Tipo de Estudio.

- [ ] **Step 2: Verificación manual** (parte del Step 5 de Task 6): tras cambiar el tipo de
  estudio fuera de "Segmentación", abrir el paso 3 y confirmar que las casillas de Ingresos/
  Costo/Gastos/Utilidad Operacional quedan vacías.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DatosContribuyente.jsx
git commit -m "feat: limpiar cifras del segmento al cambiar el tipo de estudio"
```

---

## Self-Review

**1. Spec coverage:** Goals (lectura por segmento, candado de etapa 4, no tocar el resto de
la cadena, módulo dedicado) → Tasks 2-6. Non-goals (sin prorrateo automático, sin tocar
`MotorComparables.jsx`/`docxRelleno.js`, `seg_excluido`/`seg_motivo` solo ocultos) →
respetados explícitamente en Task 6 (oculta, no borra el código) y en que ningún task toca
esos dos archivos. Anti-goals (no confirmar sin lectura, mismo rigor de columna) → Task 5
(candado) y Task 2/4 (columna). Las dos "Decisiones cerradas" del spec (verificación por
columna, descuadre como advertencia) → Task 2 y Task 4. Sección 6 del spec (limpieza al
cambiar de tipo) → Task 5 + Task 7.

**2. Step scan:** cada test step trae nombres y aserciones concretas; cada step de código
trae la firma exacta y, donde el cuerpo no es obvio de la firma + tests (Task 2's detección
geométrica, Task 3's prompt), una tabla/descripción que fija el algoritmo sin escribirlo.

**3. Type consistency:** `LecturaSegmentada` (Task 3) → consumida tal cual por
`verificarEeffSegmentado` (Task 4) → `VerificacionSegmentada.campos` tiene las mismas 4
claves (`t_s,t_c,t_gastos,t_op`) que `study` ya usa en todo el resto del sistema (Task 6).
`segmentoSeleccionado`/`t_lecturaSegmentacion` se nombran igual en Task 5 (candado), Task 6
(quien los escribe) y Task 7 (quien los limpia).

**4. Review Focus:** los 5 puntos tienen test: escaneo sin texto → Task 4 step 1 (primera
prueba, `verificadoContraTexto: false`); más de dos segmentos → Task 4 step 1 (tercera
prueba); lectura sin segmento elegido → Task 5 step 1 (primera prueba); limpieza al cambiar
de tipo → Task 5 step 1 (tercera/cuarta prueba) + Task 7; descuadre como advertencia no
bloqueante → Task 4 step 1 (segunda prueba).

**5. Proportion:** el spec tiene ~220 líneas; este plan es más largo porque fija firmas y
casos de prueba de un módulo geométrico nuevo (Task 2) que el spec solo describe en prosa —
proporcional al riesgo de esa pieza, no una transcripción: ningún step incluye el cuerpo de
una función cuya firma y pruebas ya la determinan.

---

Plan completo y guardado en `docs/superpowers/plans/2026-11-27-estudios-segmentados.md`. Por favor revísalo.
