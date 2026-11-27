# Diseño: curación financiera por IA de comparables, para estudios segmentados

Este diseño es **adicional** al de
`docs/superpowers/specs/2026-11-27-estudios-segmentados-design.md` (que queda tal cual está,
sin tocar) y depende de él: solo tiene sentido una vez que el estudio tiene un indicador de la
parte examinada calculado sobre el **segmento** con vinculados, no sobre la compañía completa.

## Intención y por qué

El motor de comparables es, hoy, un servicio de IA en un solo punto: `curateCandidatesWithGemini`
(`comparablesEngine.js`) evalúa si la **actividad económica** de cada candidata coincide con la
del contribuyente, antes de que haya cifras financieras de esa candidata. La aceptación final de
una candidata a la muestra —y el cálculo del rango intercuartil en sí— es aritmética pura
(`analizarRango` en `rangoIntercuartil.js`, `cumpleElRango` en `utils/calculations.js`), sin IA.

Para un estudio **segmentado**, esa separación deja un hueco: el indicador del contribuyente sale
de un segmento angosto (solo sus operaciones con vinculados), pero las candidatas externas
(Capital IQ) traen información de **toda la compañía**. Una candidata puede pasar el filtro de
actividad y aun así no ser comparable de verdad al segmento —por ejemplo, si su propio negocio
mezcla líneas que el contribuyente no mezcla en el segmento bajo estudio—, y eso solo se puede
juzgar **con el estado financiero de la candidata ya cargado**, no antes.

## Goals

- Cuando `tipo_estudio === 'segmentacion'`, al cargar el EEFF de una candidata (una fila a la vez
  o en lote) se dispara una evaluación de IA **adicional** a la de actividad: un juicio sobre si
  esa candidata, vista ya con sus cifras, es financieramente comparable al segmento del
  contribuyente.
- El veredicto de esa evaluación se persiste por candidata (igual que `iaMatch` hoy: es una
  consulta pagada y no debe repetirse al reabrir el estudio) y entra como un filtro más del motor,
  con su propio motivo de rechazo visible en la matriz de rechazo / ANEXO C y en la tabla de
  comparables aceptadas/rechazadas del informe final.
- El cálculo del rango intercuartil (P25/mediana/P75) y el veredicto de cumplimiento
  ("CUMPLE"/"NO CUMPLE") siguen siendo 100 % aritméticos: esta IA decide **quién entra a la
  muestra**, nunca si un número cae dentro de un rango. Eso no cambia ni para estudios
  segmentados ni para ningún otro tipo.
- Alcance exclusivo de `tipo_estudio === 'segmentacion'`: para estándar y préstamo, el flujo de
  carga de EEFF de comparables no cambia en nada.

## Non-goals

- No se reemplaza ni se modifica `curateCandidatesWithGemini` (la curación por actividad): esta
  es una segunda evaluación, independiente, con su propio prompt y su propio veredicto — no un
  parche sobre la existente (SOLID, mismo criterio que el diseño de ingesta segmentada).
- No se toca `analizarRango`, `cumpleElRango`, ni `diagnosticarCumplimiento`: el rango sigue
  siendo aritmética pura sobre las candidatas que sí entraron a la muestra.
- No se construye nada para estudios estándar o de préstamo.

## Anti-goals

- Que una candidata entre al rango por su cifra de Capital IQ sin que, en un estudio segmentado,
  nadie haya juzgado si esa cifra es comparable al segmento bajo estudio.
- Que el veredicto de esta IA se use para decidir si el CONTRIBUYENTE está dentro o fuera del
  rango — eso sigue siendo del motor aritmético, nunca de un prompt.

## Restricciones

- Reutiliza la infraestructura de IA ya construida para curación: `consultarGemini`/
  `consultarGeminiConBusqueda`, el patrón de lotes y concurrencia (`CURACION_LOTE`,
  `CURACION_CONCURRENCIA`), y el guardado de veredictos ya pagados en Cloud Storage
  (`subirCuracion`/`descargarCuracion`, visto en `MotorComparables.jsx`) — no se reinventa el
  mecanismo de curación, se añade una segunda instancia de él.
- Debe engancharse en los dos puntos donde HOY se cargan EEFF de comparables en
  `MotorComparables.jsx`: la carga de una fila (`handleComparableEEFFUpload`) y la carga en lote
  (el handler que usa `parseEEFFComparablesLote` + `repartir`). Las dos deben quedar cubiertas, no
  solo una, porque las dos son caminos normales de uso hoy.
- El veredicto de cada candidata debe quedar asociado a su identificador, igual que `iaMatch`, para
  que una candidata ya evaluada no se vuelva a cobrar al recargar el estudio o al repetir el
  cribado.

## Approaches consideradas

Se discutieron tres alcances para "usar los datos segmentados en la curación de comparables":

- **(a) Solo cambia el criterio de búsqueda/actividad** (curar contra la actividad del segmento en
  vez de la actividad de toda la compañía). Descartada como alcance único: no resuelve lo que el
  usuario pidió — un juicio al cargar el EEFF de la candidata.
- **(b) La IA evalúa financieramente a cada candidata al cargar su EEFF, como filtro adicional de
  entrada a la muestra — elegida.** El rango sigue siendo aritmética.
- **(c) La IA decide si un número está dentro del rango intercuartil**, reemplazando el cálculo
  determinista. Descartada explícitamente: no es defendible ante una revisión de la DIAN (no hay
  fórmula que mostrar si "lo dice la IA"), y el usuario confirmó que no es lo que busca.

## Decisiones ya tomadas en la conversación

1. Alcance (b): juicio financiero de IA al cargar el EEFF de la candidata, como filtro adicional
   de aceptación a la muestra — no reemplaza el cálculo del rango.
2. Exclusivo de `tipo_estudio === 'segmentacion'`.

## Diseño

### 1. Nuevo módulo `frontend/src/services/eeffSegmentacionCuracionFinanciera.js`

- Prompt dedicado (nombre provisional `CURACION_FINANCIERA_SEGMENTO_PROMPT`): recibe la matriz
  contable ya extraída de la candidata (lo que hoy devuelve `parseEEFFComparableOCR`/
  `parseEEFFComparablesLote`) y el contexto del segmento del contribuyente (actividad del
  segmento, qué tipo de operación se analiza), y devuelve un veredicto por candidata: acepta o
  rechaza para esta muestra segmentada, con el motivo en texto — mismo contrato de forma que
  `curateCandidatesWithGemini` (para que encaje en los mismos mecanismos de persistencia y
  matriz de rechazo), pero prompt, función y veredicto **propios** — módulo separado, no una
  rama dentro de `comparablesEngine.js`.
- `evaluarComparableSegmentadaConGemini(candidata, contextoSegmento)`: una llamada por candidata
  (o en lote, siguiendo el mismo patrón de `CURACION_LOTE`/`CURACION_CONCURRENCIA` que ya usa la
  curación por actividad) — se decide al implementar, según cuántas candidatas con EEFF cargado
  suele haber en la práctica (normalmente bastantes menos que el universo completo, porque esto
  corre DESPUÉS de cargar el estado financiero, no sobre todo el universo).

### 2. Forma del veredicto y persistencia

- Mismo patrón que `iaMatch`: un objeto guardado por identificador de candidata
  (`iaMatchFinancieroSegmento`, nombre provisional), que viaja con el estudio igual que el
  veredicto de actividad, se sube a Cloud Storage con la misma mecánica de `subirCuracion`/
  `descargarCuracion`, y no se vuelve a pagar si ya existe para esa candidata.

### 3. Puntos de enganche en `MotorComparables.jsx`

- En `handleComparableEEFFUpload` (carga de una fila): después de aplicar las cifras leídas a la
  fila, si `study.tipo_estudio === 'segmentacion'`, se dispara la evaluación financiera para esa
  candidata.
- En el handler de carga en lote (`parseEEFFComparablesLote` + `repartir` +
  `separarPorSuficiencia`): igual, para cada candidata que sí trajo cifras suficientes
  (`conCifras`), en el mismo punto donde hoy se decide qué entra a la muestra.
- Para `tipo_estudio !== 'segmentacion'` ninguno de los dos handlers cambia.

### 4. Integración con la matriz de rechazo / ANEXO C

- Un rechazo de esta evaluación se trata como un motivo más, con la misma forma que
  `MOTIVO_RESERVA`/`MOTIVO_SIN_CURAR` (`comparablesEngine.js`): la candidata queda fuera de la
  muestra, con su motivo visible en la matriz de rechazo del informe (ANEXO C) y en la tabla de
  comparables del paso 4 — igual que hoy se ve el motivo de un rechazo por actividad o por
  filtro duro.
- No se crea una tabla ni un anexo nuevo: se reutiliza la estructura de rechazo que ya existe,
  solo con una categoría de motivo adicional.

### 5. Lo que NO cambia

- `analizarRango`, `cumpleElRango`, `diagnosticarCumplimiento`: sin tocar.
- El veredicto de actividad (`curateCandidatesWithGemini`/`iaMatch`): sin tocar, sigue corriendo
  igual que hoy, antes de que haya EEFF de la candidata.

## Qué queda a criterio del implementador / a validar con pruebas reales

- Redacción exacta del prompt y los criterios financieros concretos que hacen que una candidata
  se rechace (p. ej. mezcla de líneas de negocio, tamaño relativo, calidad del EEFF) — el usuario
  ya indicó que esto se ajustará al probar con casos reales.
- Si la llamada es una por candidata o en lote, y el tamaño de lote.
- Nombres exactos de los campos nuevos (`iaMatchFinancieroSegmento` es provisional).
