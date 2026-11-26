# Estudios de tipo préstamo — Fase 7: múltiples vinculados en un mismo estudio

**Fecha:** 2026-11-26
**Precedente:** Fase 6 (`docs/superpowers/specs/2026-11-26-estudios-prestamo-fase6-tasas-direccion-design.md`).
Caso real que exige esta fase: Sungrow 2024 tuvo dos vinculados de préstamo distintos
(Sungrow Renewable Energy Investment Pte Ltd, Singapur, y Sungrow Power Chile SpA, con
vencimiento en junio de 2024 — por eso en 2025 ya solo queda uno).

## Problema

`filasPrestamoConVinculado` (Tabla 1, `tablasPrestamos.js`) y
`filasTablaTransaccionesPrestamos`/`filasTablaHistoricoDeudaPrestamos` (Tabla 4/13,
`tablasPrestamoColumnas.js`) toman el vinculado de `prestamos[0]` y fuerzan TODAS las filas
bajo ese nombre. Si hay más de una contraparte distinta, `prestamosConMasDeUnVinculado`
detecta el caso y solo agrega un aviso de "revísala" — el informe sigue saliendo con un único
nombre de vinculado incorrecto para las filas de la otra contraparte.

## Diseño

### Agrupación — `gruposDePrestamos`, nueva en `tablasPrestamos.js`

```js
/** Agrupa estudio.prestamos por contraparte distinta (normalizada, mismo criterio que ya
 *  usa vinculadoDePrestamo/prestamosConMasDeUnVinculado), en el orden en que aparece cada
 *  contraparte por primera vez. */
export function gruposDePrestamos(estudio) {
  if (!tienePrestamos(estudio)) return [];
  const porClave = new Map();
  estudio.prestamos.forEach((p) => {
    const vinculado = vinculadoDePrestamo(p, estudio.ent);
    const clave = normalizarNombreCompania(vinculado);
    if (!porClave.has(clave)) porClave.set(clave, { vinculado, prestamos: [] });
    porClave.get(clave).prestamos.push(p);
  });
  return [...porClave.values()];
}
```

### Tabla 1 "Préstamo con su vinculado" — `filasPrestamoConVinculado` pasa a devolver un ARRAY

`filasPrestamoConVinculado(estudio)`: `Array<{nombre, vinculado, encabezados, filas,
fuente}> | null` — una entrada por grupo con al menos un préstamo con desembolso real (mismo
filtro `valorCOPDesembolso > 0` que ya existía, ahora por grupo); `null` si NINGÚN grupo tiene
desembolsos. Rompe el contrato anterior (devolvía un objeto) — se actualizan los tres
consumidores:

- **`docxRelleno.js`** (ruta .docx plantilla propia): el patrón existente de "refrescar hasta
  M apariciones, o insertar una si falta" se mantiene igual en CUÁNTAS veces se toca el
  documento — lo que cambia es que cada ocurrencia/inserción, en vez de 1 tabla, concatena
  las N tablas de los N grupos (`grupos.map(g => generarTablaOoxmlConVinculado(...)).join('')`).
  Soporta N grupos completo.
- **`informeSinPlantilla.js`** (sin plantilla): una `seccion(...)` por grupo en vez de una
  sola, con el nombre del vinculado en el título de cada una cuando hay más de un grupo.
  Soporta N grupos completo.
- **`tablasOperacionesHtml.js`** (ruta HTML de PDF marcado): **por decisión explícita de
  alcance, NO se generaliza a N grupos en esta fase.** Esta ruta reescribe FILAS dentro de
  una tabla ya existente en el HTML extraído del PDF (`sustituir`/`reescribirFilasHtml`) —a
  diferencia de las otras dos rutas, que fabrican la tabla completa desde cero y por eso
  pueden simplemente concatenar N tablas—, y duplicar esa estructura ya localizada N veces de
  forma segura no tiene precedente en este archivo ni se puede verificar sin un caso real de
  plantilla PDF con más de un vinculado. Se sigue usando el PRIMER grupo (`grupos[0]`), igual
  que hoy, pero el aviso cuando hay más de uno pasa de genérico ("revísala") a nombrar
  explícitamente los vinculados que quedaron fuera y que hay que agregar a mano.

### Tabla 4/13 "Transacciones Intercompañías"/"Histórico de la deuda" — mismo cambio de forma

`filasTablaTransaccionesPrestamos`/`filasTablaHistoricoDeudaPrestamos` (`tablasPrestamoColumnas.js`)
pasan a devolver `Array<{nombre, titulo, vinculado, etiquetasPrestamo, filas, fuente}>` (se
agrega el campo `vinculado`, útil para titular cada sección/tabla; se quita
`avisoVinculados`, que esta fase ya resuelve agrupando en vez de avisar). `aMatrizPlana` sigue
operando sobre UN descriptor (quien llama la invoca una vez por grupo).

Las dos rutas que consumen esta tabla (`docxRellenoPrestamoColumnas.js`,
`tablasPrestamoColumnasHtml.js`) **ya regeneran la tabla completa desde cero** (quitan todas
las apariciones viejas y insertan una nueva en un único punto — nunca reescriben filas de una
tabla existente), así que las DOS soportan N grupos completo: la función `insertarEn` de cada
archivo pasa de insertar 1 tabla a concatenar N tablas (una por grupo), numerándolas en
secuencia (Tabla X, X+1, X+2...) para que las anclas de las tablas siguientes sigan
calculando bien su propio número.

### Fuera de alcance de esta fase, por decisión explícita

- Tabla 11 "Vinculado económica" y Tabla 12 "Criterios de vinculación económica" siguen
  usando `prestamos[0]` (un solo vinculado) — son fichas de identificación genérica, no
  tablas de desembolsos; no hay evidencia real de que necesiten separarse por vinculado, y
  generalizarlas sin un caso real que lo exija no se justifica en esta ronda.
- Tabla 1 en la ruta HTML de PDF marcado (`tablasOperacionesHtml.js`) sigue con un solo
  vinculado, con mejor aviso — ver arriba.
- Direcciones mixtas dentro de un mismo grupo (el mismo vinculado a la vez acreedor y deudor):
  sin caso real, se detecta y se avisa, no se resuelve.

## Verificación

1. `node --test frontend/src/services/tablasPrestamos.test.js frontend/src/services/tablasPrestamoColumnas.test.js frontend/src/services/docxRelleno.test.js frontend/src/services/docxRellenoPrestamoColumnas.test.js frontend/src/services/tablasOperacionesHtml.test.js frontend/src/services/tablasPrestamoColumnasHtml.test.js frontend/src/services/informeSinPlantilla.test.js` en verde, con casos nuevos usando los 2 vinculados reales de Sungrow 2024.
2. Suite completa, lint, build.
3. Manual: estudio con los 2 vinculados de Sungrow 2024 en las tres rutas — confirmar 2
   tablas (Tabla 1 y Tabla 4/13) en las rutas .docx y sin-plantilla; en la ruta HTML, 1 tabla
   más un aviso nombrando el vinculado faltante. Regresión: un estudio de 1 solo vinculado
   sigue mostrando exactamente 1 tabla en las tres rutas.
