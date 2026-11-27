# Segunda carga de EEFF normal para el balance en estudios segmentados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En un estudio con `tipo_estudio === 'segmentacion'`, agregar una segunda zona de carga
dentro de la tarjeta de ingesta de EEFF para que el analista suba el EEFF normal (de toda la
compañía) y así se llenen solas las "Cifras del Estado de Situación Financiera" — hoy esos
campos solo se pueden escribir a mano porque la única función que los lee de un documento
(`handleEeffUpload`) es inalcanzable en la rama segmentada del componente.

**Architecture:** Una función local nueva (`handleEeffBalanceUpload`) reutiliza, sin tocarlos,
los mismos servicios que ya usa `handleEeffUpload` (OCR, verificación, reparación de cifras),
pero filtra la aplicación final a un allowlist explícito de campos de balance — nunca deja
pasar `t_s/t_c/t_gastos/t_op`, que son del segmento y ya se aplicaron por otra vía. Todo el
cambio vive dentro de `IngestaCifras.jsx`.

**Tech Stack:** React 19 (frontend/), mismo pipeline Gemini Vision OCR que la ingesta estándar.

**Spec:** `docs/superpowers/specs/2026-11-27-balance-eeff-normal-en-segmentacion-design.md`

## Global Constraints

- `handleEeffUpload` y la rama `estandar`/`prestamo` del render no cambian de comportamiento
  en absoluto.
- La nueva función nunca aplica `t_s`, `t_c`, `t_gastos`, `t_op`, `t_correcciones` ni
  `t_lecturaEeff` al estudio — solo los campos de balance (allowlist explícito, ver abajo).
- No se modifica `eeffParser.js`, `eeffVerificacion.js`, `eeffSegmentacionParser.js`,
  `eeffSegmentacionVerificacion.js`, `eeffColumnas.js` ni `eeffSegmentacionColumnas.js` — se
  reutilizan sus exports tal cual.
- Allowlist de campos que sí puede aplicar: `t_ar, t_ap, t_inv, t_act_curr, t_ppe, t_act_tot,
  t_activos_detalle, eeffImages` + los seis de `CLAVES_RUBROS_BALANCE_ADICIONALES` (`t_cash,
  t_inv_assoc, t_tax, t_intang, t_dif, t_act_nocurr`).

## Review Focus

- El analista sube el EEFF normal ANTES de elegir un segmento del documento segmentado (o sin
  haber cargado ninguno todavía): la carga de balance debe funcionar igual, sin depender de que
  `segmentosLeidos`/`study.segmentoSeleccionado` existan.
- El EEFF normal cargado trae también ingresos/costo/gastos reconocibles (es un EEFF completo,
  no uno que solo tenga balance): la función nunca debe dejarlos pasar a `updateStudy`, ni
  siquiera si `verificarEeff` los devuelve con valor.
- Dos cargas sucesivas de EEFF normal (el analista corrige el archivo): la segunda debe
  reemplazar limpiamente los campos de balance de la primera, no acumularlos ni dejar mezcla.
- El estudio ya tenía algún campo de balance escrito a mano (`t_camposAMano` lo marca) antes de
  esta carga: la nueva lectura debe poder sobreescribirlo iguial que ya hace `handleEeffUpload`
  hoy para la ingesta estándar (relee y revalida en cada carga), no "proteger" lo manual.
- Un EEFF normal escaneado sin capa de texto (mismo caso ya resuelto para la ingesta estándar
  vía `respaldarLecturaConOcr`): la carga de balance debe degradarse igual de bien, nunca lanzar
  una excepción sin capturar.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `frontend/src/components/IngestaCifras.jsx` (modificado) | nueva función `handleEeffBalanceUpload`, nuevo estado de componente para su carga/mensaje, nueva zona de dropzone dentro de la tarjeta segmentada |
| `frontend/smoke_panel.mjs` (modificado) | comprobación de que la nueva zona de carga aparece solo para `tipo_estudio === 'segmentacion'` |

---

### Task 1: `handleEeffBalanceUpload` y la segunda zona de carga

**Files:**
- Modify: `frontend/src/components/IngestaCifras.jsx`
- Modify: `frontend/smoke_panel.mjs`

**Interfaces:**
- Consumes (ya existentes, sin cambios): `convertPdfToImages`, `parseEeffWithGeminiOCR`,
  `respaldarLecturaConOcr`, `verificarEeff`, `resolverFaltantesConNotas`, `camposAplicables`,
  `camposParaLimpiar`, `repararCifrasDelEstudio` (`eeffParser.js`/`eeffVerificacion.js`/
  `notasEeffOrquestacion.js`, todos ya importados en este archivo).
- No produce interfaces nuevas para otras tareas (es la única tarea de este plan).

Esta tarea es deliberadamente una copia filtrada de `handleEeffUpload` (líneas 222-403 del
archivo actual), no una abstracción compartida: el spec llama a mantenerlas separadas porque
describen lecturas distintas (ver `arquitectura-software.md`, "una estructura por cálculo", y
el propio comentario ya existente sobre `segmentosLeidos` en este archivo). No refactorice
`handleEeffUpload` para que las dos compartan código — cópiela y ajuste el final.

- [ ] **Step 1: Agregar el caso al smoke panel** (`frontend/smoke_panel.mjs`), junto al render
  existente de `IngestaCifras` con `tipo_estudio: 'segmentacion'`, comprobando que el texto de
  la nueva zona de carga aparece:

```js
const html5 = renderToStaticMarkup(React.createElement(IngestaCifras, {
  study: { tipo_estudio: 'segmentacion', anio: 2025 },
  updateStudy: () => {},
}));
comprobar('estudio segmentado: muestra la segunda carga para el EEFF normal (balance)', /EEFF.*toda la compañía|balance/i.test(html5));
```

- [ ] **Step 2: Correr el smoke panel y confirmar que esta comprobación falla**

Run: `node frontend/smoke_panel.mjs`
Expected: FAIL en "estudio segmentado: muestra la segunda carga para el EEFF normal (balance)"
(la zona de carga no existe todavía).

- [ ] **Step 3: Agregar estado de componente** para esta carga, análogo al de las otras dos
  (`loadingEeffBalance`, `eeffBalanceMsg`, `eeffBalanceFileName`), sin tocar
  `loadingEeff`/`eeffMsg`/`eeffFileName` (ingesta estándar) ni
  `loadingEeffSegmentado`/`eeffSegmentadoMsg` (ingesta segmentada).

- [ ] **Step 4: Implementar `handleEeffBalanceUpload(file)`** siguiendo el pipeline de
  `handleEeffUpload` (mismas llamadas, mismo orden: `convertPdfToImages` →
  `parseEeffWithGeminiOCR(file, study.anio)` → `respaldarLecturaConOcr` → `verificarEeff` →
  `resolverFaltantesConNotas` → `camposAplicables(verificacion.campos)` →
  `repararCifrasDelEstudio(...)` → `camposParaLimpiar(verificacion.campos,
  verificacion.advertencias)`), pero antes del `updateStudy` final, construya el objeto a
  aplicar filtrando SOLO estas claves (si están presentes en el resultado combinado):
  `t_ar, t_ap, t_inv, t_act_curr, t_ppe, t_act_tot, t_activos_detalle, eeffImages, t_cash,
  t_inv_assoc, t_tax, t_intang, t_dif, t_act_nocurr`. No incluya `t_s, t_c, t_gastos, t_op,
  t_correcciones, t_lecturaEeff, t_camposAMano` (reinicio completo) en ese objeto filtrado.
  Para `t_camposAMano`, en cambio, quite del arreglo existente (`study.t_camposAMano`)
  únicamente las claves del allowlist de arriba que sí llegaron con valor en esta lectura —
  no toque las entradas de `t_s/t_c/t_gastos/t_op` que ya estuvieran ahí.
  Maneje errores con el mismo patrón try/catch/finally que `handleEeffUpload` (mensaje de
  error genérico, `loadingEeffBalance` a `false` en el `finally`).

- [ ] **Step 5: Agregar la segunda zona de carga en el JSX**, dentro de la rama
  `tipo_estudio === 'segmentacion'` del render (después del bloque de advertencias de
  `t_lecturaSegmentacion`, antes del cierre de la tarjeta), con el mismo estilo visual de
  dropzone que las otras dos, texto propio explicando que es para el EEFF de toda la compañía
  y que solo llena el balance, `onChange` apuntando a `handleEeffBalanceUpload`, y su propio
  mensaje de estado (`eeffBalanceMsg`) y spinner (`loadingEeffBalance`).

- [ ] **Step 6: Correr el smoke panel y confirmar que TODAS las comprobaciones pasan**
  (incluida la nueva y las ya existentes: Llantas Emotion, paso 3, el bloque de exclusión
  oculto, la colisión de segmento sin etiqueta).

Run: `node frontend/smoke_panel.mjs`
Expected: `→ todas las comprobaciones pasaron`

- [ ] **Step 7: Verificación manual en el navegador** (`npm run dev --prefix frontend`): crear
  un estudio segmentado, cargar el documento segmentado y elegir un segmento (como ya se
  probó), y luego, en la misma tarjeta, cargar el EEFF normal de la compañía y confirmar que:
  (a) las cifras de balance (CxC, Inventarios, CxP, Total activo corriente, PP&E) se llenan,
  (b) las cifras de resultados del segmento (Ingresos/Costo/Gastos/Utilidad Operacional) NO
  cambian al hacerlo.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/IngestaCifras.jsx frontend/smoke_panel.mjs
git commit -m "feat: segunda carga de EEFF normal para el balance en estudios segmentados"
```

---

## Self-Review

**1. Spec coverage:** la decisión de diseño clave (no reutilizar `handleEeffUpload` sin
filtrar) → Step 4 (allowlist explícito). La zona de carga nueva → Step 5. Los no-goals
(`handleEeffUpload`/estandar/prestamo intactos, módulos de servicio sin tocar) → respetados al
no modificar ningún archivo fuera de `IngestaCifras.jsx`/`smoke_panel.mjs`.

**2. Step scan:** cada step de código trae la firma, el pipeline exacto a replicar y el
allowlist exacto; el único step sin aserciones de código (Step 7) es la verificación manual,
que no decide nada nuevo, solo confirma lo que los steps anteriores ya fijaron.

**3. Type consistency:** `handleEeffBalanceUpload` no produce ninguna interfaz que otra tarea
consuma (plan de una sola tarea) — no aplica.

**4. Review Focus:** las 5 líneas de arriba tienen test o verificación: orden de carga
(Step 7, probado en el orden descrito); nunca deja pasar P&L (Step 4, allowlist); dos cargas
sucesivas se reemplazan limpias (consecuencia directa de que `handleEeffBalanceUpload`
reconstruye el objeto completo desde la lectura más reciente, igual que `handleEeffUpload`);
sobreescribe lo manual (mismo comportamiento ya documentado de `handleEeffUpload`, heredado
sin cambios); degrada sin capa de texto (reutiliza `respaldarLecturaConOcr` tal cual).

**5. Proportion:** el spec tiene ~70 líneas; este plan es comparable, porque la tarea es
literalmente "copiar un pipeline ya escrito y cambiar el filtro final" — no hay lógica nueva
que documentar más allá del allowlist exacto.

---

Plan completo y guardado en
`docs/superpowers/plans/2026-11-27-balance-eeff-normal-en-segmentacion.md`.
