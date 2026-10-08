#!/usr/bin/env node
/* Siembra o actualiza la colección `jurisdiccionesNoCooperantes` (Artículo 260-7 del E.T.,
   Artículo 1.2.2.5.1. del Decreto 1625 de 2016) con la lista por defecto embebida en
   `frontend/src/services/jurisdiccionesNoCooperantes.js`.

   Administrativo, no pasa por `firestore.rules` (que prohíbe escribir esa colección desde el
   navegador a propósito): usa el SDK de Admin con las credenciales por defecto del entorno
   (`gcloud auth application-default login`, o las de la cuenta de servicio del proyecto).

   Es un UPSERT por nombre normalizado, no un borrado-y-siembra: correrlo de nuevo no duplica
   jurisdicciones ni revive una que alguien ya marcó `activo:false` a mano. Una jurisdicción
   que el Gobierno Nacional retire de una futura actualización de este archivo NO se borra
   aquí sola —hay que marcarla `activo:false` explícitamente, para conservar el rastro
   histórico—, así que este script nunca borra documentos, solo crea o actualiza los que
   trae la lista.

   Uso:
     node scripts/sembrar-jurisdicciones-no-cooperantes.js --proyecto precios-trasnferencia-pruebas
     node scripts/sembrar-jurisdicciones-no-cooperantes.js --proyecto precios-trasnferencia --dry-run */

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

function normalizarId(nombre) {
  return String(nombre)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function argumento(nombre) {
  const i = process.argv.indexOf('--' + nombre);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function main() {
  const proyecto = argumento('proyecto');
  if (!proyecto) {
    console.error('Falta --proyecto <id>. Ejemplo: --proyecto precios-trasnferencia-pruebas');
    process.exitCode = 1;
    return;
  }
  const dryRun = process.argv.includes('--dry-run');

  // Import tardío: el módulo del frontend es ESM, este script es CommonJS.
  const { JURISDICCIONES_NO_COOPERANTES_DEFAULT } = await import(
    '../frontend/src/services/jurisdiccionesNoCooperantes.js'
  );

  initializeApp({ projectId: proyecto });
  const db = getFirestore();
  const coleccion = db.collection('jurisdiccionesNoCooperantes');

  console.log(`Proyecto: ${proyecto}${dryRun ? ' (dry-run, no escribe nada)' : ''}`);
  console.log(`Jurisdicciones a sembrar: ${JURISDICCIONES_NO_COOPERANTES_DEFAULT.length}`);

  let escritas = 0;
  for (const j of JURISDICCIONES_NO_COOPERANTES_DEFAULT) {
    const id = normalizarId(j.nombre);
    console.log(`  - ${id}: "${j.nombre}" (activo: ${j.activo})`);
    if (!dryRun) {
      // merge:true — nunca pisa un `activo:false` que alguien ya haya puesto a mano.
      await coleccion.doc(id).set(
        { nombre: j.nombre, fuente: 'Decreto 1625 de 2016, Artículo 1.2.2.5.1.' },
        { merge: true },
      );
      const existente = await coleccion.doc(id).get();
      if (existente.data().activo === undefined) {
        await coleccion.doc(id).update({ activo: true });
      }
      escritas += 1;
    }
  }
  console.log(dryRun ? 'Dry-run: nada se escribió.' : `Listo: ${escritas} documento(s) sembrados/actualizados.`);
}

main().catch((err) => {
  console.error('No se pudo sembrar:', err);
  process.exitCode = 1;
});
