# Estudios de tipo préstamo — Fase 8: OCR de EEFF escaneados

**Fecha:** 2026-11-26
**Precedente:** Fases 6-7 (specs del mismo día). Evidencia real: de los 3 EEFF de las
empresas investigadas (Alciautos, Suma, Sungrow), 2 son PDFs escaneados sin capa de texto
(Suma completo; el paquete consolidado de Alciautos) — ni `pdftotext` ni `pdfplumber` pudieron
extraer su contenido durante la investigación. Sungrow, en cambio, sí trae capa de texto.

## Problema

El sistema no tiene ningún paso de OCR para EEFF. Solo existe OCR (vía Gemini Vision) para
RUT y Cámara de Comercio (`/api/extraer-rut`, `/api/extraer-camara`, en `server.js` y
`functions/index.js`). Sin esto, un EEFF escaneado es ilegible para cualquier automatización
futura (p. ej. conciliar el saldo de `study.prestamos` contra la nota de partes relacionadas).

## Diseño

Nuevo endpoint `/api/extraer-eeff`, mismo patrón exacto que `extraer-rut`/`extraer-camara`:
un solo POST con `{archivo_base64, tipo}`, sin paginar (Gemini ya acepta el PDF completo
como `inline_data`, igual que las otras dos rutas — si en la práctica aparece un límite de
tamaño con un EEFF de muchas páginas, se revisita entonces).

Prompt pide, en JSON estricto:
- `es_separado` (boolean|null): separados/individuales vs. consolidados.
- `unidad` (string): "pesos" o "miles de pesos", tal como viene en el estado — nunca se
  convierte, para no introducir un error de escala.
- `saldo_partes_relacionadas` (number|null): saldo de la nota de partes relacionadas al
  cierre, en la unidad del propio estado.
- `vinculado` (string|null): nombre de la parte relacionada principal.
- `nota_texto` (string|null): texto literal de la nota (o su extracto relevante).
- `confianza` (número 0-100).

Implementado en las dos implementaciones activas del proxy (`server.js`,
`functions/index.js`) — límite de tasa propio (`limitadorExtraerEeff`, 20/min, mismo criterio
que las demás), rewrite nuevo en `firebase.json`. **No se porta a `Cpanel/public_html/api/*.php`**:
ese backend tampoco porta `extraer-camara` (el precedente más cercano), así que esta fase no
introduce una inconsistencia nueva, solo sigue el patrón ya existente de que el cPanel legado
va un paso atrás de las dos implementaciones activas.

## Fuera de alcance de esta fase

- Consumir este endpoint desde el frontend (ningún componente lo llama todavía) — esta fase
  solo construye el endpoint; conectarlo a `IngestaOperaciones.jsx` o a un paso de EEFF
  específico, y usar `saldo_partes_relacionadas` para conciliar contra `study.prestamos`,
  queda para cuando haya un flujo real que lo consuma.
- OCR de los EEFF ya cargados en `study` por otras vías (RUT, Cámara, etc.) — esta fase crea
  la capacidad, no la integra retroactivamente en ningún flujo existente.

## Verificación

1. `node --check server.js` y `node --check functions/index.js` — sintaxis válida.
2. `npm test` (suite completa) en verde — no hay pruebas unitarias nuevas para este endpoint
   porque el patrón gemelo (`extraerRut`/`extraerCamara`) tampoco las tiene (son un proxy de
   red + prompt, sin lógica pura que aislar); la verificación es manual.
3. Manual: una vez desplegado a pruebas, enviar `EEFF_Suma_COL_2025_signedAll.pdf` (escaneado)
   y `4. EEFF 2025 y 2024 SUNGROW - con opinión de RF.pdf` (con texto) a `/api/extraer-eeff` y
   confirmar que ambos devuelven el saldo de partes relacionadas correcto, pese a que uno no
   tiene capa de texto.
