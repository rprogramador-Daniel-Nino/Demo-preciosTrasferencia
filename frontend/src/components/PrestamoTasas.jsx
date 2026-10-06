import React, { useState } from 'react';
import { Search, Loader2, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { consultarGeminiConBusqueda } from '../services/comparablesEngine';
import {
  construirPromptTasasPrestamo, parsearRespuestaTasasPrestamo, fusionarTasasPrestamo,
} from '../services/prestamoTasasPrompts';
import { FECHA_INICIO_SOFR } from '../services/prestamoTasasCalculo';
import {
  fechasPactoUnicas, filasTablaRangoIntercuartil, filasTablaTasasSeleccionadas,
  filasTablaAnalisisTasasAjustadas,
} from '../services/tablasPrestamoTasas';
import { prestamoTasasCompleto } from '../services/flujoEstudio';

const SERIES = [
  { clave: 'prime', etiqueta: 'PRIME' },
  { clave: 'sofr', etiqueta: 'SOFR' },
  { clave: 'tmc', etiqueta: 'TMC' },
  { clave: 'moodys', etiqueta: "Moody's" },
];

/* Mismo criterio que `generarTablaOoxml`/`tablaHTML`: un porcentaje se muestra con 3
   decimales y coma, como ya lo hace el resto del informe para estas tasas. */
const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(3).replace('.', ',') + ' %' : '—');

export default function PrestamoTasas({ study, updateStudy }) {
  const [buscando, setBuscando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const tasas = study.tasasPrestamo || { riesgoPais: {}, porFecha: {} };
  const fechas = fechasPactoUnicas(study);
  const completo = prestamoTasasCompleto(study);

  const guardarTasas = (siguiente) => updateStudy({ tasasPrestamo: siguiente });

  const handleCambiarValor = (fecha, serie, crudo) => {
    const valor = crudo === '' ? null : Number(crudo);
    const porFechaActual = tasas.porFecha?.[fecha] || {};
    guardarTasas({
      ...tasas,
      porFecha: {
        ...tasas.porFecha,
        [fecha]: { ...porFechaActual, [serie]: { ...porFechaActual[serie], valor, editadoManualmente: true } },
      },
    });
  };

  const handleCambiarRiesgoPais = (crudo) => {
    const valor = crudo === '' ? null : Number(crudo);
    guardarTasas({ ...tasas, riesgoPais: { ...tasas.riesgoPais, valor, editadoManualmente: true } });
  };

  const handleBuscarConIA = async () => {
    setBuscando(true);
    setMensaje('Buscando PRIME, SOFR, TMC, Moody\'s y Riesgo País con Inteligencia Artificial...');
    try {
      const prompt = construirPromptTasasPrestamo(fechas, study.anio);
      const { texto, groundingChunks, webSearchQueries } = await consultarGeminiConBusqueda(prompt);
      const resultado = parsearRespuestaTasasPrestamo(texto, groundingChunks, webSearchQueries);
      guardarTasas(fusionarTasasPrestamo(tasas, resultado));
      setMensaje('✅ Tasas encontradas. Revise cada valor y su fuente antes de confirmar la etapa.');
    } catch (err) {
      console.error('Error buscando tasas de préstamo con IA:', err);
      setMensaje('⚠ No se pudieron buscar las tasas automáticamente. Complételas manualmente abajo.');
    } finally {
      setBuscando(false);
    }
  };

  const tablaRango = filasTablaRangoIntercuartil(study, tasas);
  const tablaSeleccionadas = filasTablaTasasSeleccionadas(study);
  const tablaAjustadas = filasTablaAnalisisTasasAjustadas(study, tasas);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm space-y-2">
        <h2 className="text-lg font-bold text-zinc-950 dark:text-zinc-50">
          Comparabilidad de tasas — Método PC
        </h2>
        <p className="text-xs text-zinc-500">
          Para cada fecha de pacto, compare la tasa pactada contra tasas de mercado DE ESA
          misma fecha — no las de hoy. Las tasas se pueden buscar con IA o escribir a mano;
          siempre quedan editables.
        </p>
        <p className={`text-xs font-semibold mt-1 ${completo
          ? 'text-emerald-600 dark:text-emerald-500' : 'text-amber-600 dark:text-amber-500'}`}
        >
          Tasas de préstamo* — obligatorias para avanzar a la siguiente etapa
        </p>
      </div>

      <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-zinc-500 mb-1.5">
              Riesgo País Colombia (%) — un solo valor para todo el estudio
            </label>
            <input
              type="number" step="0.001"
              value={tasas.riesgoPais?.valor ?? ''}
              onChange={(e) => handleCambiarRiesgoPais(e.target.value)}
              placeholder="Ej: 2.845"
              className="bg-[#ffffff] dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-[8px] px-[12px] py-[8px] text-sm focus:outline-none focus:ring-2 focus:ring-[#0FA3A1]/50 focus:border-[#0FA3A1] text-zinc-950 dark:text-zinc-100 w-48"
            />
            <p className="text-[10px] text-zinc-500 mt-1.5">
              Country Risk Premium (Damodaran, NYU Stern), para el año {study.anio || 'del estudio'}.
            </p>
          </div>
          <button
            type="button"
            onClick={handleBuscarConIA}
            disabled={buscando || !fechas.length}
            className="flex items-center gap-2 bg-[#0FA3A1] hover:bg-[#0c8d8b] disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors shrink-0"
          >
            {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar con IA
          </button>
        </div>
        {mensaje && (
          <div className="p-3 rounded-lg text-xs bg-zinc-50 dark:bg-zinc-900/50 text-zinc-600 dark:text-zinc-400">
            {mensaje}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">Tasas por fecha de pacto</h3>
        {fechas.map((fecha) => {
          const porFecha = tasas.porFecha?.[fecha] || {};
          return (
            <div key={fecha} className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{fecha}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {SERIES.map(({ clave, etiqueta }) => {
                  const disponible = clave !== 'sofr' || fecha >= FECHA_INICIO_SOFR;
                  const campo = porFecha[clave] || {};
                  return (
                    <div key={clave} className="flex flex-col">
                      <label className="text-[10px] font-semibold text-zinc-500 mb-1 flex items-center gap-1">
                        {etiqueta} (%)
                        {disponible && (campo.valor != null) && (
                          campo.confiable
                            ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            : <AlertTriangle className="w-3 h-3 text-amber-500" />
                        )}
                      </label>
                      <input
                        type="number" step="0.001"
                        disabled={!disponible}
                        value={campo.valor ?? ''}
                        onChange={(e) => handleCambiarValor(fecha, clave, e.target.value)}
                        placeholder={disponible ? '—' : 'No existía'}
                        className="bg-[#ffffff] dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-[8px] px-[10px] py-[6px] text-sm disabled:opacity-40 disabled:bg-zinc-100 dark:disabled:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#0FA3A1]/50 text-zinc-950 dark:text-zinc-100"
                      />
                      {!disponible && (
                        <p className="text-[9px] text-zinc-400 mt-1">SOFR no existía antes del 2/04/2018</p>
                      )}
                      {disponible && campo.fuenteUrl && (
                        <a href={campo.fuenteUrl} target="_blank" rel="noreferrer"
                          className="text-[9px] text-[#0FA3A1] mt-1 flex items-center gap-0.5 truncate">
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" /> fuente
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!fechas.length && (
          <p className="text-xs text-zinc-500">No hay préstamos con fecha de pacto para analizar todavía.</p>
        )}
      </div>

      {tablaRango && (
        <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm overflow-x-auto">
          <h3 className="text-sm font-bold text-zinc-950 dark:text-zinc-50 mb-3">
            Vista previa — {tablaRango.nombre}
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-1.5 pr-3">Vinculado</th>
                <th className="py-1.5 pr-3">Fecha de pacto</th>
                <th className="py-1.5 pr-3">Valor USD</th>
                <th className="py-1.5 pr-3">E. A</th>
                <th className="py-1.5 pr-3">Rango mínimo</th>
                <th className="py-1.5 pr-3">Rango mediana</th>
                <th className="py-1.5 pr-3">Rango superior</th>
              </tr>
            </thead>
            <tbody>
              {tablaRango.filas.map((fila, i) => (
                <tr key={i} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-1.5 pr-3">{fila.vinculado}</td>
                  <td className="py-1.5 pr-3">{fila.fechaPacto}</td>
                  <td className="py-1.5 pr-3">{fila.valorDesembolsoMoneda}</td>
                  <td className="py-1.5 pr-3">{fila.tasaEA}</td>
                  <td className="py-1.5 pr-3">{fila.rango ? pct(fila.rango.minimo) : '—'}</td>
                  <td className="py-1.5 pr-3">{fila.rango ? pct(fila.rango.mediana) : '—'}</td>
                  <td className="py-1.5 pr-3">{fila.rango ? pct(fila.rango.superior) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tablaAjustadas && (
        <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm overflow-x-auto">
          <h3 className="text-sm font-bold text-zinc-950 dark:text-zinc-50 mb-3">
            Vista previa — {tablaAjustadas.nombre}
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-1.5 pr-3">Fecha</th>
                <th className="py-1.5 pr-3">Tasa utilizada</th>
                <th className="py-1.5 pr-3">% Tasa</th>
                <th className="py-1.5 pr-3">Moody's Seasoned</th>
                <th className="py-1.5 pr-3">Country Risk Premium</th>
                <th className="py-1.5 pr-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {tablaAjustadas.filas.map((fila, i) => (
                <tr key={i} className="border-b border-zinc-100 dark:border-zinc-900">
                  <td className="py-1.5 pr-3">{fila.fechaPacto}</td>
                  <td className="py-1.5 pr-3">{fila.tasa}</td>
                  <td className="py-1.5 pr-3">{pct(fila.porcentajeTasa)}</td>
                  <td className="py-1.5 pr-3">{pct(fila.moodys)}</td>
                  <td className="py-1.5 pr-3">{pct(fila.riesgoPais)}</td>
                  <td className="py-1.5 pr-3 font-semibold">{pct(fila.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tablaSeleccionadas && (
        <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm space-y-2">
          <h3 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">
            Vista previa — {tablaSeleccionadas.nombre}
          </h3>
          <p className="text-xs text-zinc-500">{tablaSeleccionadas.banner}</p>
          {tablaSeleccionadas.filas.map((fila) => (
            <div key={fila.tasa} className="text-xs border-t border-zinc-100 dark:border-zinc-900 pt-2">
              <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                {fila.tasa} — <span className="text-emerald-600 dark:text-emerald-500">{fila.conclusion}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
