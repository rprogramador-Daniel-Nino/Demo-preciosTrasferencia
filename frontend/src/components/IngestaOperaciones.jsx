import React, { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, Loader2, FileCheck, ArrowRight, Building2, Globe, DollarSign, AlertTriangle, Trash2 } from 'lucide-react';
import { fmt, montoOperacion } from '../utils/calculations';
import { parseExcelOperations } from '../services/excelOperationsParser';
import { avisoIdentificacionVinculado } from '../services/cotejoVinculado';
import {
  umbralOperacionAdicional, tieneOperacionAdicional, montoOperacionAdicional,
} from '../services/tablasOperaciones';
import { operacionesPrestamoCompleto } from '../services/flujoEstudio';

export default function IngestaOperaciones({ study, updateStudy }) {
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [excelMsg, setExcelMsg] = useState('');
  const [fileName, setFileName] = useState('');

  const actualizarPrestamo = (indice, campo, valor) => {
    const prestamos = study.prestamos.map((p, i) => (i === indice ? { ...p, [campo]: valor } : p));
    updateStudy({ prestamos });
  };

  const agregarPrestamo = () => {
    const nuevo = {
      credito: '', otorga: study.vinc || '', recibe: study.ent || '', fuente: '',
      fechaPacto: '', valorDesembolsoMoneda: 0, moneda: '', numDesembolsos: '',
      fechaDesembolso: '', valorCOPDesembolso: 0, saldoCOP: 0,
      interesesMoneda: 0, interesesCOP: 0, plazo: '', renovado: '', cancelado: '',
      tasaEA: '', tasaPactada: '', periodicidad: '', esParaisoFiscal: false,
    };
    updateStudy({ prestamos: [...(study.prestamos || []), nuevo] });
  };

  const eliminarPrestamo = (indice) => {
    updateStudy({ prestamos: study.prestamos.filter((_, i) => i !== indice) });
  };

  const actualizarMontoOperacion = (valor) => {
    updateStudy({ monto_operacion: valor === '' ? null : Number(valor) });
  };

  const actualizarMontoOperacionAdicional = (valor) => {
    updateStudy({
      operacionAdicional: { ...study.operacionAdicional, monto: valor === '' ? 0 : Number(valor) },
    });
  };

  const handleExcelUpload = async (file) => {
    if (!file) return;
    setLoadingExcel(true);
    setFileName(file.name);
    setExcelMsg('Analizando Excel de Operaciones con Vinculados...');
    
    try {
      const res = await parseExcelOperations(file);
      if (res && res.vinc && (res.monto || res.t_s)) {
        const valMonto = res.monto || res.t_s;
        updateStudy({
          vinc: res.vinc,
          vinc_id: res.vinc_id,
          pais_vinc: res.pais_vinc,
          vinc_tipo: res.vinc_tipo,
          monto: valMonto,
          monto_operacion: valMonto,
          egreso: res.egreso || false,
          /* La sección «4. Información adicional» del formato (códigos DIAN 61 a 63). Se
             guarda tal como vino, supere o no el umbral: el dato está en el archivo del
             contribuyente y quien revise el estudio tiene que poder verlo. Quién decide si
             llega al informe es `tieneOperacionAdicional`, no esta pantalla.
             Se escribe siempre —también cuando es `null`— para que cargar un archivo sin la
             sección borre la del archivo anterior en vez de dejarla pegada al estudio. */
          operacionAdicional: res.operacionAdicional || null,
          /* Solo para estudios de tipo préstamo: el parser lee la hoja de préstamos sin
             importar el tipo de estudio, pero guardarla siempre expondría datos de
             préstamo en un estudio estándar que nunca los va a usar. `res.prestamos || null`
             y no condicionar el spread entero: así un Excel nuevo sin la hoja borra los
             préstamos de una carga anterior, igual que ya hace `operacionAdicional`. */
          ...(study.tipo_estudio === 'prestamo' ? { prestamos: res.prestamos || null } : {}),
        });
        const avisos = [];
        /* Con varias contrapartes el total es la suma de todas y el estudio se queda
           con la primera. Decirlo aquí es lo que evita que el informe declare ante la
           DIAN una operación con un vinculado que no es el único. */
        if (res.contrapartes > 1) {
          avisos.push(
            `⚠ el archivo trae ${res.contrapartes} contrapartes distintas y el estudio guarda una sola ` +
            `(${res.vinc}): revise el vinculado y el monto antes de generar el informe`
          );
        }
        /* Misma razón social con varios NIT entre secciones. El estudio guarda un solo
           `vinc_id`, así que sin este aviso el informe se va con la identificación de la
           primera fila y la diferencia con el resto del archivo no la ve nadie. */
        (res.idsDivergentes || []).forEach(d => {
          avisos.push(
            `⚠ «${d.vinculado}» aparece en el archivo con ${d.ids.length} identificaciones distintas ` +
            `(${d.ids.join(', ')}): verifique cuál corresponde al vinculado del informe`
          );
        });
        /* Los egresos son de otro formato (1001) y por eso no se suman, pero callarlo hacía
           que el usuario viera un total menor al del archivo sin explicación. */
        const egresos = res.egresosDescartados;
        if (egresos && egresos.filas > 0) {
          avisos.push(
            `⚠ se descartaron ${egresos.filas} ${egresos.filas === 1 ? 'operación' : 'operaciones'} de egreso ` +
            `por COP $ ${fmt(egresos.monto)}: el estudio solo suma las operaciones de ingreso`
          );
        }
        /* El parser ya no rellena el tipo con «Otros servicios (07)» cuando el archivo no
           lo trae, así que aquí puede llegar vacío. Decirlo es la mitad del trabajo: la
           Tabla 1 del informe saldrá con el concepto en blanco y hay que completarlo. */
        if (!res.vinc_tipo) {
          avisos.push(
            '⚠ el archivo no trae el tipo de operación (columna «Tipo de operación»): ' +
            'el concepto de la Tabla 1 saldrá en blanco, complételo antes de radicar'
          );
        }
        /* «4. Información adicional»: préstamos, reintegros y operaciones a nombre de
           vinculados que no se reflejan en el Estado de Resultados. No entran en el monto
           analizado ni sustentan el rango, pero por encima del umbral hay que declararlas en
           su propia tabla. Se avisa en los dos sentidos: cuando entra, para que se revise; y
           cuando se leyó pero no llega al umbral, para que nadie la busque en el informe. */
        const ad = res.operacionAdicional;
        if (ad && ad.monto > umbralOperacionAdicional(study.anio)) {
          avisos.push(
            `ℹ el archivo trae información adicional (códigos 61 a 63) por COP $ ${fmt(ad.monto)} ` +
            `en ${ad.filas.length} ${ad.filas.length === 1 ? 'operación' : 'operaciones'}: ` +
            'supera el umbral, así que se publicará en la tabla «Operación adicional ' +
            'Transacciones Intercompañía»'
          );
        } else if (ad) {
          avisos.push(
            `ℹ el archivo trae información adicional por COP $ ${fmt(ad.monto)}, que no supera ` +
            `los COP $ ${fmt(umbralOperacionAdicional(study.anio))}: no se publica en el informe`
          );
        }
        /* Aviso propio de estudios de préstamo: el parser ya leyó la hoja (o no la
           encontró) sin importar el tipo de estudio; aquí es donde se le dice al analista
           qué significa eso para SU estudio. */
        if (study.tipo_estudio === 'prestamo') {
          if (res.prestamos && res.prestamos.length) {
            avisos.push(
              `ℹ se detectaron ${res.prestamos.length} ${res.prestamos.length === 1 ? 'operación' : 'operaciones'} ` +
              `de préstamo con ${res.prestamos[0].otorga || res.prestamos[0].recibe || 'el vinculado'}`
            );
          } else {
            avisos.push(
              '⚠ no se encontró la hoja de préstamos en este Excel (se esperaba un nombre que ' +
              'contenga «préstamo»): verifique el archivo o ingrese los datos manualmente'
            );
          }
        }
        const aviso = avisos.length ? ' · ' + avisos.join(' · ') : '';
        const concepto = res.vinc_tipo || 'sin tipo de operación';
        setExcelMsg(`✅ Operaciones procesadas con éxito: ${concepto} por COP $ ${fmt(valMonto)}${aviso}`);
      } else if (study.tipo_estudio === 'prestamo' && res && res.prestamos && res.prestamos.length) {
        /* Excel de un estudio préstamo con solo la hoja de desembolsos, sin una operación de
           vinculados en la hoja genérica (p. ej. los intereses del préstamo todavía no se
           registraron ahí). Desde que la Tarea 4 excluyó las hojas de préstamo del barrido
           genérico, este archivo nunca va a llenar `res.vinc`/`res.monto` y cae aquí en vez
           de en el `if` de arriba. Los préstamos sí se guardan —no caen en el mensaje
           genérico de "no se encontraron las hojas", que sería falso: sí se encontraron. */
        updateStudy({ prestamos: res.prestamos });
        setExcelMsg(
          `✅ Se detectaron ${res.prestamos.length} ${res.prestamos.length === 1 ? 'operación' : 'operaciones'} de préstamo ` +
          `con ${res.prestamos[0].otorga || res.prestamos[0].recibe || 'el vinculado'}. ` +
          'No se encontró una operación de vinculados en la hoja genérica del Excel — verifique si el archivo debía traer también los intereses.'
        );
      } else {
        setExcelMsg('⚠ No se encontraron las hojas u operaciones esperadas en este Excel. Verifique la estructura o ingrese los datos manualmente.');
      }
    } catch (err) {
      console.error("Error al procesar el Excel de operaciones:", err);
      setExcelMsg('⚠ No se pudo procesar el archivo Excel. Verifique la estructura de las hojas.');
    } finally {
      setLoadingExcel(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-950 dark:text-zinc-50">2. Ingesta de Cifras y Operaciones con Vinculados</h2>
          <p className="text-xs text-zinc-500">Cargue el archivo Excel de operaciones del año gravable para extraer montos y contrapartes.</p>
          {/* Solo en estudios de tipo préstamo esta etapa exige la hoja de préstamos para
              poder confirmarla y avanzar (ver `operacionesPrestamoCompleto` en
              flujoEstudio.js y el botón "Confirmar etapa" en App.jsx). En estándar y
              segmentación esta etapa nunca exigió nada, así que aquí no se muestra nada. */}
          {study.tipo_estudio === 'prestamo' && (
            <p className={`text-xs font-semibold mt-1 ${
              operacionesPrestamoCompleto(study)
                ? 'text-emerald-600 dark:text-emerald-500'
                : 'text-amber-600 dark:text-amber-500'
            }`}>
              Datos de préstamo* — obligatorios para avanzar a la siguiente etapa
            </p>
          )}
        </div>
        {fileName && (
          <span className="text-xs bg-[#0FA3A1]/10 text-[#0FA3A1] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <FileCheck className="w-4 h-4" />
            {fileName}
          </span>
        )}
      </div>

      {/* Recuadro de Carga de Archivo */}
      <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm space-y-4">
        <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-[#0FA3A1] transition-colors relative cursor-pointer bg-zinc-50/50 dark:bg-zinc-900/30">
          <input
            type="file"
            accept=".xlsx,.xls"
            disabled={loadingExcel}
            onChange={(e) => {
              if (e.target.files[0]) {
                handleExcelUpload(e.target.files[0]);
              }
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          {loadingExcel ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <Loader2 className="w-10 h-10 text-[#0FA3A1] animate-spin" />
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Procesando hojas de operaciones...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              <FileSpreadsheet className="w-10 h-10 text-[#0FA3A1]" />
              <div>
                <span className="text-sm text-zinc-800 dark:text-zinc-200 font-bold block">
                  Seleccionar o arrastrar archivo Excel de Operaciones PT (.xlsx)
                </span>
                <span className="text-xs text-zinc-400">Ejemplo: <code>Información Operaciones PT 2025-2 modificado cr.xlsx</code></span>
              </div>
            </div>
          )}
        </div>

        {excelMsg && (
          <div className={`p-4 rounded-xl text-xs flex gap-2 items-center ${
            excelMsg.includes('✅')
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/20 border border-rose-200 text-rose-800 dark:text-rose-300'
          }`}>
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <span className="font-medium text-sm">{excelMsg}</span>
          </div>
        )}
      </div>

      {/* El cotejo contra el informe del año anterior va aparte del mensaje de la carga:
          el estudio anterior se ingiere en el paso 4, después de este, así que cuando
          llega ya no hay mensaje de carga donde colgarlo. Como se calcula del estudio,
          aparece en cuanto el dato existe y sigue visible al volver a este paso. */}
      {avisoIdentificacionVinculado(study) && (
        <div className="p-4 rounded-xl text-xs flex gap-2 items-start bg-amber-50 dark:bg-amber-950/20 border border-amber-200 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium text-sm">{avisoIdentificacionVinculado(study)}</span>
        </div>
      )}

      {/* Tarjeta Detallada de Operación Extraída. La condición no puede ser solo
          `study.vinc_tipo`: desde que el parser dejó de inventarlo, un archivo sin la
          columna «Tipo de operación» escondía la tarjeta entera —vinculado, país y monto
          incluidos— justo cuando hay más que revisar. */}
      {(study.vinc_tipo || study.vinc || montoOperacion(study) !== null || study.operacionAdicional) && (
        <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="text-md font-bold text-zinc-900 dark:text-zinc-50 border-b border-zinc-100 dark:border-zinc-800 pb-2">
            Resumen de Operación Extraída
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 space-y-1">
              <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block">Concepto de Operación</span>
              <input
                type="text"
                value={study.vinc_tipo || ''}
                onChange={(e) => updateStudy({ vinc_tipo: e.target.value })}
                className="w-full bg-transparent border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-base font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0FA3A1]"
              />
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-200 dark:border-emerald-900/30 space-y-1">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold uppercase tracking-wider block">Monto Total Transaccionado</span>
              {/* El monto de la operación, no `t_s`: este paso escribe `monto` y
                  `monto_operacion`, y `t_s` son los ingresos operacionales que llegan
                  del estado financiero. Leer t_s aquí mostraba «COP $ 0» justo al lado
                  del mensaje de éxito que sí traía la cifra. Al editar se escribe siempre
                  en `monto_operacion`, que es el campo con prioridad en `montoOperacion()`. */}
              <div className="flex items-center gap-1">
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">COP $</span>
                <input
                  type="number"
                  value={montoOperacion(study) ?? ''}
                  onChange={(e) => actualizarMontoOperacion(e.target.value)}
                  className="w-full bg-transparent border border-emerald-200 dark:border-emerald-900/40 rounded px-2 py-1 text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 space-y-1">
              <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block">Compañía Vinculada</span>
              <input
                type="text"
                value={study.vinc || ''}
                onChange={(e) => updateStudy({ vinc: e.target.value })}
                className="w-full bg-transparent border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-base font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0FA3A1]"
              />
            </div>

            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 space-y-1">
              <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block">País e ID Fiscal</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={study.pais_vinc || ''}
                  onChange={(e) => updateStudy({ pais_vinc: e.target.value })}
                  placeholder="País"
                  className="w-1/2 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-base font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0FA3A1]"
                />
                <input
                  type="text"
                  value={study.vinc_id || ''}
                  onChange={(e) => updateStudy({ vinc_id: e.target.value })}
                  placeholder="ID Fiscal"
                  className="w-1/2 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-base font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0FA3A1]"
                />
              </div>
            </div>

            {/* El monto de la sección «4. Información adicional» del formato, en el resumen y
                no solo en la tarjeta de detalle de abajo. Va aquí porque este recuadro lee del
                ESTUDIO y sobrevive a salir del paso y volver, mientras el mensaje de carga es
                estado del componente y se pierde. Sin esto, el caso en que más falta saber la
                cifra —la sección existe, no llega al umbral y por eso la tabla se borra del
                informe— era justo el que no la mostraba.

                Ámbar y no verde: no es el monto analizado. La leyenda dice cuál de las dos
                cosas va a pasar en el informe, que es lo que el usuario necesita antes de
                generar. */}
            {study.operacionAdicional && (
              <div className="md:col-span-2 p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/30 space-y-1">
                <span className="text-xs text-amber-700 dark:text-amber-500 font-semibold uppercase tracking-wider block">
                  Monto de Operación · Información Adicional (códigos 61 a 63)
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xl font-bold text-amber-700 dark:text-amber-500 font-mono">COP $</span>
                  <input
                    type="number"
                    value={montoOperacionAdicional(study) ?? ''}
                    onChange={(e) => actualizarMontoOperacionAdicional(e.target.value)}
                    className="w-full bg-transparent border border-amber-200 dark:border-amber-900/40 rounded px-2 py-1 text-xl font-bold text-amber-700 dark:text-amber-500 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <span className="text-xs text-zinc-500 block">
                  {tieneOperacionAdicional(study)
                    ? `Supera el umbral de 45.000 UVT (COP $ ${fmt(umbralOperacionAdicional(study.anio))}): se declara en la tabla «Operación adicional Transacciones Intercompañía» del informe.`
                    : `No supera el umbral de 45.000 UVT (COP $ ${fmt(umbralOperacionAdicional(study.anio))}): esa tabla se elimina del informe.`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Operación adicional — sección «4. Información adicional» del formato (códigos DIAN
          61 a 63: préstamos, reintegros y operaciones a nombre de vinculados que no se
          reflejan en el Estado de Resultados).

          Se dibuja siempre que el formato TRAIGA la sección, supere o no el umbral. Antes
          solo aparecía por encima, con el criterio de que enseñar una tarjeta de algo que no
          va a salir en el informe hace esperarlo ahí. Pero el monto se leyó del archivo y es
          un dato del estudio: esconderlo dejaba la cifra viva solo en el mensaje de carga,
          que es estado del componente y se pierde al salir del paso y volver. Y desde que la
          tabla se ELIMINA del informe cuando no llega al umbral, saber por qué desapareció
          importa más, no menos. Lo que hace el trabajo de no crear expectativa es la
          leyenda, que dice explícitamente cuál de las dos cosas va a pasar. */}
      {study.operacionAdicional && (
        <div className="bg-white dark:bg-[#0c0c0f] border border-amber-200 dark:border-amber-900/40 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-start gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
            <div>
              <h3 className="text-md font-bold text-zinc-900 dark:text-zinc-50">
                Operación Adicional Detectada
              </h3>
              <p className="text-xs text-zinc-500">
                Información adicional del formato (códigos 61 a 63) por COP $ {fmt(montoOperacionAdicional(study))}
                {tieneOperacionAdicional(study)
                  ? `, que supera los COP $ ${fmt(umbralOperacionAdicional(study.anio))}. Se publicará en la tabla «Operación adicional Transacciones Intercompañía».`
                  : `, que no supera los COP $ ${fmt(umbralOperacionAdicional(study.anio))}. No se publica en el informe, y la tabla que traiga la plantilla se elimina.`}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-zinc-500 uppercase tracking-wider text-left">
                  <th className="py-2 pr-4 font-semibold">Compañía vinculada</th>
                  <th className="py-2 pr-4 font-semibold">País</th>
                  <th className="py-2 pr-4 font-semibold">Tipo de operación</th>
                  <th className="py-2 font-semibold text-right">Monto en pesos</th>
                </tr>
              </thead>
              <tbody>
                {(study.operacionAdicional.filas || []).map((f, i) => (
                  <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-100">{f.vinculado || '—'}</td>
                    <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{f.pais || '—'}</td>
                    <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">{f.tipo || '—'}</td>
                    <td className="py-2 text-right font-mono text-zinc-900 dark:text-zinc-100">
                      {f.monto == null ? '—' : fmt(f.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* No se suma al monto analizado y eso hay que decirlo aquí: si no, la diferencia
              entre este total y el de arriba parece un error del lector del archivo. */}
          <p className="text-xs text-zinc-500">
            No se suma al monto total transaccionado: son operaciones que no afectan el Estado
            de Resultados, así que no sustentan el rango ni la operación analizada.
          </p>
        </div>
      )}

      {/* Resumen de préstamos con vinculados — solo para estudios de tipo préstamo. Muestra
          las columnas que alimentan la Tabla "Préstamo con su vinculado" del informe
          (ver docs/superpowers/specs/2026-09-24-estudios-prestamo-design.md); el resto de
          columnas que trae la hoja (saldo, intereses, plazo...) ya quedaron guardadas en el
          estudio, pero no hace falta mostrarlas aquí todavía. "Otorga"/"Recibe" son editables
          porque tablasPrestamos.js las usa para identificar el vinculado en el informe: una
          fila agregada a mano sin ellas no podría clasificarse. */}
      {study.tipo_estudio === 'prestamo' && (
        <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
            <h3 className="text-md font-bold text-zinc-900 dark:text-zinc-50">
              Operaciones de Préstamo Detectadas
            </h3>
            <button
              type="button"
              onClick={agregarPrestamo}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#0FA3A1]/10 text-[#0FA3A1] hover:bg-[#0FA3A1]/20 transition-colors"
            >
              + Agregar préstamo
            </button>
          </div>
          {!study.prestamos || !study.prestamos.length ? (
            <p className="text-xs text-zinc-500">
              No hay operaciones de préstamo cargadas todavía. Suba el Excel de operaciones o agregue una fila a mano.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-zinc-500 uppercase tracking-wider text-left">
                    <th className="py-2 pr-2 font-semibold">Otorga</th>
                    <th className="py-2 pr-2 font-semibold">Recibe</th>
                    <th className="py-2 pr-2 font-semibold">Fecha original en la que se pactó</th>
                    <th className="py-2 pr-2 font-semibold text-right">Valor del desembolso</th>
                    <th className="py-2 pr-2 font-semibold">Moneda pactada</th>
                    <th className="py-2 pr-2 font-semibold text-right">Valor en COP en la fecha de desembolso</th>
                    <th className="py-2 pr-2 font-semibold">Tasa EA</th>
                    <th className="py-2 font-semibold text-center">Quitar</th>
                  </tr>
                </thead>
                <tbody>
                  {study.prestamos.map((p, i) => (
                    <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={p.otorga || ''}
                          onChange={(e) => actualizarPrestamo(i, 'otorga', e.target.value)}
                          className="w-32 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-xs text-zinc-950 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0FA3A1]"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={p.recibe || ''}
                          onChange={(e) => actualizarPrestamo(i, 'recibe', e.target.value)}
                          className="w-32 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-xs text-zinc-950 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0FA3A1]"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="date"
                          value={p.fechaPacto || ''}
                          onChange={(e) => actualizarPrestamo(i, 'fechaPacto', e.target.value)}
                          className="bg-transparent border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-xs text-zinc-950 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0FA3A1]"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          value={p.valorDesembolsoMoneda ?? ''}
                          onChange={(e) => actualizarPrestamo(i, 'valorDesembolsoMoneda', e.target.value === '' ? 0 : Number(e.target.value))}
                          className="w-32 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-xs text-right font-mono text-zinc-950 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0FA3A1]"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={p.moneda || ''}
                          onChange={(e) => actualizarPrestamo(i, 'moneda', e.target.value)}
                          className="w-16 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-xs text-zinc-950 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0FA3A1]"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          value={p.valorCOPDesembolso ?? ''}
                          onChange={(e) => actualizarPrestamo(i, 'valorCOPDesembolso', e.target.value === '' ? 0 : Number(e.target.value))}
                          className="w-36 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-xs text-right font-mono text-zinc-950 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0FA3A1]"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={p.tasaEA || ''}
                          onChange={(e) => actualizarPrestamo(i, 'tasaEA', e.target.value)}
                          className="w-28 bg-transparent border border-zinc-200 dark:border-zinc-800 rounded px-2 py-1 text-xs text-zinc-950 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-[#0FA3A1]"
                        />
                      </td>
                      <td className="py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => eliminarPrestamo(i)}
                          title="Quitar esta operación"
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-zinc-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
