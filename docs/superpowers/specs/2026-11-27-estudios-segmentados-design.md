# Diseño: soporte real para estudios de tipo "Segmentación"

## Intención y por qué

El cliente exige poder cargar al sistema los Estados Financieros **segmentados** de la
compañía (operaciones con vinculados vs. con independientes, NIIF 8) cuando el estudio lo
requiere, y que el indicador de la Parte Examinada se calcule sobre el segmento con
vinculados, no sobre la compañía completa.

Hoy `tipo_estudio` ya ofrece la opción `'segmentacion'` en el selector de
`DatosContribuyente.jsx` y ya aparece categorizado en `Dashboard.jsx`/`BandejaEstudios.jsx`,
pero es un cascarón: ningún otro archivo del código (`IngestaCifras.jsx`,
`MotorComparables.jsx`, `flujoEstudio.js`, `docxRelleno.js`) lo lee. El único mecanismo de
"segmentación" que existe hoy es `seg_excluido`/`seg_motivo` en `IngestaCifras.jsx`: un monto
único a excluir del P&L con una justificación en texto libre, disponible para cualquier
estudio sin importar `tipo_estudio` — no es un estado financiero segmentado real.

## Goals

- Un estudio con `tipo_estudio === 'segmentacion'` pide, en el paso 3 ("Estados
  financieros"), el EEFF segmentado real de la compañía (mismo tipo de archivo PDF/imagen de
  siempre) y extrae ingresos, costo de ventas y gastos operativos **del segmento con
  vinculados**, no de la compañía completa.
- El candado de la etapa 4 ("Motor Comparables") no se puede confirmar para un estudio
  segmentado sin una lectura de segmentación exitosa — replica el patrón ya construido para
  `tipo_estudio === 'prestamo'` (`prestamoTasasCompleto`/`operacionesPrestamoCompleto` en
  `flujoEstudio.js`).
- Todo lo que viene después de la ingesta (ajustes de capital de trabajo, motor de
  comparables, rango intercuartil, generación del Word) sigue funcionando **sin cambios**:
  la lectura de segmentación escribe en los mismos campos canónicos (`t_s`, `t_c`,
  `t_gastos`, `t_op`) que ya consume toda esa cadena, igual que si el analista los hubiera
  digitado a mano.
- Lógica desacoplada (principios SOLID, pedido explícito del usuario): un módulo de servicio
  propio y dedicado para segmentación (prompt, parseo, verificación) — nada de bifurcar
  `eeffParser.js`/`eeffVerificacion.js` con un `if (tipo_estudio === 'segmentacion')`.

## Non-goals (de esta primera fase)

- No se construye un prorrateo algorítmico de costos compartidos por llave de asignación: el
  documento del cliente ya trae el segmento desglosado por NIIF 8 y se transcribe, igual que
  la ingesta estándar no deduce nada que no esté impreso.
- No se toca `MotorComparables.jsx` ni `docxRelleno.js`: siguen consumiendo
  `t_s`/`t_c`/`t_gastos`/`t_op` sin saber de dónde salieron ni si el estudio es segmentado.
- No se retira `seg_excluido`/`seg_motivo` del código: sigue existiendo para estudios
  `estandar` que necesiten excluir una operación puntual del total. Para
  `tipo_estudio === 'segmentacion'` simplemente no se muestra ni se usa — decisión tomada en
  la conversación, con una salvedad: el usuario validará con pruebas reales si hace falta
  combinarlos más adelante; no se cierra la puerta en el código (el campo no se elimina del
  modelo), pero no se construye esa combinación ahora.

## Anti-goals

- Que el analista pueda confirmar la etapa 4 de un estudio segmentado sin haber cargado el
  EEFF segmentado (igual que hoy no se puede confirmar un préstamo sin las tasas).
- Que una cifra de segmento se cuele sin cotejarse contra el documento — mismo estándar de
  rigor que `verificarEeff` ya aplica al EEFF estándar.

## Restricciones

- Debe convivir con `tipo_estudio === 'prestamo'` sin interferir: un estudio es de un solo
  tipo, y las ramas de `flujoEstudio.js`/`IngestaCifras.jsx` deben seguir siendo mutuamente
  excluyentes y sin tocar la rama de préstamo existente.
- El documento de Firestore del estudio debe seguir cabiendo: nada de universos completos ni
  páginas OCR crudas en los campos nuevos (mismo criterio que ya aplica a `t_lecturaEeff`).
- Se reutiliza la infraestructura de IA ya construida (`convertPdfToImages`,
  `respaldarLecturaConOcr`, `registrarUsoIA`, `postGeminiWithRetry`, `extraerJSON`) — no se
  reinventa el pipeline de llamada a Gemini ni el manejo de reintentos/errores.

## Decisiones cerradas tras la revisión del builder check

Un agente externo revisó este documento sin ver la conversación y señaló dos puntos que sí
cambiaban el plan. Se resolvieron así:

1. **Rigor de la verificación del segmento: por columna, no por presencia.** El EEFF estándar
   no se conforma con que una cifra "aparezca en el documento": `eeffColumnas.js`/
   `extraerEstructuraPdf` existen porque un estado comparativo imprime columnas lado a lado y
   una cifra puede colarse de la columna vecina (bug real: Llantas Emotion). Un estado
   segmentado tiene el mismo problema — se decide construir el equivalente de
   `eeffColumnas.js` para columnas de **segmento** en vez de años (ver módulo 2bis más abajo),
   no una verificación de "aparece en alguna parte del texto".

   **Corrección de terminología, tras revisar un caso real (CENTROS DE NEGOCIOS OFIMIO SAS,
   2026-11-27):** el documento real no trae columnas "vinculados / independientes / total".
   Es un "Estado de Resultados Integral — Segmentado por actividad productiva": dos columnas
   por año, una por **línea de negocio** (en ese caso, "Tecnología" — donde está la operación
   con el vinculado — y "Otros" — actividad inmobiliaria sin vinculados—), firmado por
   representante legal, contador y revisor fiscal (esa firma es, en la práctica, el
   "Certificado de segmentación" del ANEXO B — no un documento aparte). El detector de
   columnas debe identificar la columna de la línea de negocio donde está la operación bajo
   estudio frente a las demás, con el rótulo que cada cliente use (no un vocabulario fijo de
   "vinculados/independientes"), y el "cuadre" sigue siendo que las columnas sumen el total de
   la compañía. Ningún otro cambio de diseño se deriva de esto — la estructura (detector de
   columnas + verificación + cuadre como advertencia) se mantiene igual.
2. **El descuadre segmento-vs-compañía es una advertencia, no un bloqueo.** Se encontró que
   hoy, para estudios estándar, `motorComparableCompleto` nunca bloquea la etapa 4 por
   advertencias de la lectura del EEFF — solo exige `actividad_especifica` llena. Préstamo
   bloquea sobre un campo *lleno* (las tasas), no sobre una advertencia *resuelta*: no hay
   precedente en el código para "bloquear hasta que una advertencia se resuelva", y no tendría
   por dónde resolverse si el documento nunca cuadra limpio (el propio diseño ya admite que no
   se modela prorrateo de costos compartidos). Por consistencia con el resto de la app, el
   descuadre se muestra como advertencia visible (igual que las del EEFF estándar hoy) y
   `segmentacionCompleto(study)` solo exige que exista una lectura de segmentación — "campo
   lleno", igual que préstamo exige que las tasas estén llenas.

## Approaches consideradas

Se discutieron tres formas de resolver "dónde vive la carga del documento segmentado y dónde
se valida":

- **A — Carga en el paso 3, candado en el paso 4 (elegida).** Replica exactamente el patrón
  ya probado de préstamo: los datos pesados se cargan en su propia pantalla/sección, y el
  candado de la etapa 4 (`motorComparableCompleto`) solo *verifica* que ya estén. Ventaja:
  reutiliza al 100% el patrón de gating existente y mantiene la carga de EEFF en el paso que
  ya existe para eso.
- **B — Todo en el paso 4.** La carga y su validación viven dentro de `MotorComparables.jsx`.
  Descartada: mezclaría ingestión de cifras financieras con el motor de comparables, que hoy
  asume que `t_s`/`t_c`/`t_op` ya están resueltos al entrar.
- **C — Mínimo viable sin parser nuevo.** El candado solo exige que `seg_excluido`/
  `seg_motivo` estén llenos. Descartada: no cumple el requisito del cliente de cargar el EEFF
  segmentado real, y no calcula el indicador sobre el segmento sino sobre la compañía menos
  un monto.

Sobre "qué es el documento correcto" se consideraron un PDF/imagen leído por el mismo
pipeline de OCR (elegida) vs. una plantilla Excel con columnas fijas por segmento
(descartada por ahora: el usuario confirmó la opción 1).

## Decisiones ya tomadas en la conversación

1. Módulo dedicado para segmentación, con responsabilidad única — no se reutiliza ni se
   bifurca `eeffParser.js`/`eeffVerificacion.js`.
2. Replica el patrón de préstamo (datos propios + candado en `flujoEstudio.js`).
3. El "documento correcto" es el mismo tipo de EEFF (PDF/imagen) de siempre, leído por el
   mismo pipeline Gemini Vision, con un prompt y una verificación dedicados a extraer cifras
   **por segmento** en vez del total de la compañía.
4. Para `tipo_estudio === 'segmentacion'`, esta lectura reemplaza a `seg_excluido`/
   `seg_motivo` (quedan solo para `estandar`), sujeto a reconfirmación del usuario tras
   probar con un caso real.

## Diseño

### 1. Nuevo módulo `frontend/src/services/eeffSegmentacionParser.js`

- `EEFF_SEGMENTACION_PROMPT`: prompt dedicado, misma filosofía de "transcribe, no
  interpretes" que `EEFF_PROMPT` (`eeffParser.js`), pero pide, para el estado de resultados
  segmentado: ingresos, costo de ventas, gastos de ventas y gastos de administración de la
  columna/segmento "operaciones con vinculados" (como el documento la rotule), y además los
  mismos cuatro rubros del segmento "operaciones con independientes" y del total de la
  compañía — estos últimos solo para el cuadre, no para el cálculo del indicador.
- `parseEeffSegmentadoWithGeminiOCR(file, anioEstudio)`: misma forma que
  `parseEeffWithGeminiOCR` (mismo manejo de reintentos, mismo `extraerJSON`), llamando a
  Gemini con el prompt de arriba.

### 2. Nuevo módulo `frontend/src/services/eeffSegmentacionColumnas.js`

- Equivalente de `eeffColumnas.js` (`extraerEstructuraPdf`/`asignarAnios`) pero para columnas
  de **segmento** en vez de años: detecta las columnas "operaciones con vinculados",
  "operaciones con independientes" y "total"/"consolidado" (como el documento las rotule) en
  la estructura del PDF, y asigna cada cifra extraída a la columna de la que de verdad viene.
  Existe porque un estado segmentado imprime las tres columnas lado a lado con órdenes de
  magnitud parecidos — el mismo riesgo que ya obligó a construir `eeffColumnas.js` para años
  (bug real: Llantas Emotion, cifra tomada de la columna vecina). La verificación por
  "aparece en algún lugar del texto" no es suficiente aquí.

### 3. Nuevo módulo `frontend/src/services/eeffSegmentacionVerificacion.js`

- `verificarEeffSegmentado(lectura, { anioEstudio })`: calcula la utilidad operacional del
  segmento reutilizando `utilidadOperacionalDe` de `eeffVerificacion.js` (ingresos − costo −
  gastos; no se duplica esa fórmula), verifica cada cifra del segmento contra el texto del
  documento **en su columna correcta** (vía el módulo 2bis de arriba), y además **cuadra**
  segmento vinculado + segmento independiente contra el total de la compañía impreso
  (principio de `metodo-tu.md` §2: "verificar que el segmento cuadre con el estado de
  resultados"). Un descuadre fuera de tolerancia es una **advertencia visible** —no bloquea
  la etapa 4—, igual que las advertencias que ya produce `verificarEeff` para el EEFF
  estándar (ver "Decisiones cerradas tras la revisión del builder check").

### 4. Sección condicional en `IngestaCifras.jsx`

- Cuando `study.tipo_estudio === 'segmentacion'`: la caja de carga de EEFF usa
  `parseEeffSegmentadoWithGeminiOCR`/`verificarEeffSegmentado` en vez de las funciones
  estándar, y escribe en `t_s`/`t_c`/`t_gastos`/`t_op` igual que hoy (reutilizando
  `repararCifrasDelEstudio`, `camposAplicables`, `camposParaLimpiar` sin cambios). Publica su
  propio rastro — `t_lecturaSegmentacion` (mirror de `t_lecturaEeff`) — en vez de
  `t_lecturaEeff`.
- El bloque "Monto Excluido / Motivo de la Exclusión" (`seg_excluido`/`seg_motivo`) deja de
  renderizarse para este tipo de estudio.
- Para `tipo_estudio !== 'segmentacion'` nada cambia: misma caja, mismo flujo de hoy,
  `seg_excluido`/`seg_motivo` siguen ahí.

### 5. Candado de la etapa 4

- `segmentacionCompleto(study)`, nueva función en `flujoEstudio.js`: `true` solo si
  `study.t_lecturaSegmentacion` existe (campo lleno) — igual criterio que
  `prestamoTasasCompleto` (campos llenos, no advertencias resueltas). Un descuadre o
  cualquier otra advertencia de la lectura de segmentación queda visible en la UI de
  `IngestaCifras.jsx` pero no impide confirmar la etapa.
- `motorComparableCompleto` pasa de la rama única de préstamo a reconocer también
  `'segmentacion'`, sin tocar el caso préstamo existente ni el caso general.

### 6. Limpieza al cambiar de tipo de estudio

- Si `tipo_estudio` cambia de `'segmentacion'` a cualquier otro valor después de haber corrido
  una lectura de segmentación, se limpian `t_s`/`t_c`/`t_gastos`/`t_op`/`t_op` derivado y
  `t_lecturaSegmentacion` — para que una cifra del segmento no quede pegada como si fuera el
  total de la compañía. Decisión del implementador (bajo riesgo), documentada aquí para que
  quede explícita y no "caiga por accidente".
- El lector de segmentación no incluye, en esta primera versión, el segundo intento a notas
  (`resolverFaltantesConNotas`) ni el aprendizaje de vocabulario (`aprenderRotuloConfirmado`)
  que sí tiene el EEFF estándar — lector más simple a propósito, documentado como límite
  conocido de esta fase, a revisar cuando el usuario pruebe con un caso real.

## Qué queda a criterio del implementador

- Nombres exactos de los campos nuevos del estudio (`t_lecturaSegmentacion`, nombre del
  criterio de asignación si el documento lo declara), siempre que no choquen con los campos
  ya existentes.
- Redacción exacta del prompt — sujeta a prueba con un caso real (el usuario validará con
  pruebas propias antes de dar por cerrado el diseño del prompt).
- Tolerancia numérica del cuadre segmento-vs-compañía.
