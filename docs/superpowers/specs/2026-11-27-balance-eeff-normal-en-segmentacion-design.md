# Segunda carga de EEFF normal para el balance en estudios segmentados — Design (corto)

## Intención

Para `tipo_estudio === 'segmentacion'`, la tarjeta de ingesta de EEFF (paso 3) solo lee el
documento segmentado (ERI por línea de negocio), y ese documento nunca trae un balance por
segmento — se confirmó contra un caso real (OFIMIO): no existe un "balance segmentado", solo
un estado de resultados segmentado. Hoy, para un estudio segmentado, las "Cifras del Estado de
Situación Financiera" (CxC/CxP a relacionadas, Inventarios, Total activo corriente, PP&E, y los
seis rubros adicionales del Análisis Vertical) solo se pueden llenar a mano, porque la única
función que las lee de un documento (`handleEeffUpload`) es inalcanzable: la tarjeta segmentada
reemplaza por completo a la tarjeta estándar en vez de convivir con ella.

Esta mejora agrega una **segunda zona de carga**, dentro de la misma tarjeta de ingesta
segmentada, para que el analista suba el EEFF normal (de toda la compañía) y esas cifras de
balance se llenen solas — igual que ya pasa en un estudio estándar.

## Decisión de diseño clave

`handleEeffUpload` aplica, en un solo `updateStudy`, TODOS los campos que `verificarEeff`
devuelve — incluidos `t_s`/`t_c`/`t_gastos`/`t_op` (las cifras de **toda la compañía**).
Reutilizarla sin cambios sobrescribiría las cifras del segmento ya verificadas (Task 3/4 de la
feature de segmentación) con las de la compañía completa: exactamente el tipo de error que la
revisión final de ese plan ya corrigió una vez (`seg_excluido`). Por eso la nueva carga no
puede ser un simple `onChange` apuntando a `handleEeffUpload`: necesita su propia función que
reutilice el mismo pipeline de lectura y verificación, pero filtre la aplicación final a un
listado explícito (allowlist) de campos de balance, nunca a los de resultados.

## Diseño

- Nueva función local `handleEeffBalanceUpload(file)` en `IngestaCifras.jsx`, usada solo dentro
  de la rama `tipo_estudio === 'segmentacion'` del render.
- Reutiliza, sin modificarlos, el mismo pipeline que ya usa `handleEeffUpload`:
  `convertPdfToImages`, `parseEeffWithGeminiOCR(file, study.anio)`, `respaldarLecturaConOcr`,
  `verificarEeff`, `resolverFaltantesConNotas`, `repararCifrasDelEstudio`, `camposAplicables`,
  `camposParaLimpiar` — ninguno de estos archivos de servicio cambia.
- Al aplicar el resultado, filtra el objeto de `updates` a un **allowlist** explícito:
  `t_ar, t_ap, t_inv, t_act_curr, t_ppe, t_act_tot, t_activos_detalle, eeffImages` más los seis
  de `CLAVES_RUBROS_BALANCE_ADICIONALES` (`t_cash, t_inv_assoc, t_tax, t_intang, t_dif,
  t_act_nocurr`). Nunca deja pasar `t_s, t_c, t_gastos, t_op, t_correcciones, t_lecturaEeff` —
  estos son del segmento y de la lectura segmentada, no de esta carga.
- `t_camposAMano`: solo quita de ese arreglo los campos de balance que sí llegaron con valor
  en esta lectura (no reinicia el arreglo completo, para no borrar el rastro de
  `t_s/t_c/t_gastos/t_op` como "digitado a mano" si el analista ya los había tocado).
- Estado de componente propio (mensaje, nombre de archivo, bandera de carga) separado del de
  la ingesta estándar (`eeffMsg`/`eeffFileName`/`loadingEeff`) y del de la segmentada
  (`eeffSegmentadoMsg`/`loadingEeffSegmentado`), para que ninguna de las tres pise a las otras.
- Nueva zona de carga en el JSX: un segundo bloque de dropzone dentro de la tarjeta de ingesta
  segmentada (después del selector de segmento y sus advertencias), con texto propio que
  explica que es para el EEFF de toda la compañía y que solo llena el balance, no el estado
  de resultados.

## No-goals / lo que no cambia

- `handleEeffUpload` y la rama `estandar`/`prestamo` del componente: cero cambio de
  comportamiento.
- `eeffParser.js`, `eeffVerificacion.js`, `eeffSegmentacionParser.js`,
  `eeffSegmentacionVerificacion.js`, `eeffColumnas.js`, `eeffSegmentacionColumnas.js`: ninguno
  se toca. Todo el cambio vive dentro de `IngestaCifras.jsx`.
- No se agrega verificación por columna para el EEFF normal cargado aquí más allá de la que
  `verificarEeff` ya hace — es exactamente el mismo rigor que ya tiene la ingesta estándar.

## Aprobación

Acordado en conversación con el usuario (2026-11-27): "exacto dejar una segunda carga de
documentos. dividirla" — confirma la forma (segunda carga, tarjeta dividida en dos zonas) tras
la explicación de por qué `handleEeffUpload` no se puede reutilizar sin filtrar. Tamaño
pequeño: sin ronda de builder-check, va directo al plan.
