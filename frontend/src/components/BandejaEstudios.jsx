import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Trash2 } from 'lucide-react';
import { fmt } from '../utils/calculations';

const TIPO_ESTUDIO_INFO = {
  estandar: { label: 'Estándar', clases: 'border-zinc-300 dark:border-zinc-700 text-zinc-500' },
  prestamo: { label: 'Préstamo', clases: 'border-[#0FA3A1]/50 text-[#0FA3A1]' },
  segmentacion: { label: 'Segmentación', clases: 'border-amber-400/50 text-amber-600 dark:text-amber-400' },
};

const ESTADO_INFO = {
  borrador: { label: 'Borrador', clases: 'border-zinc-300 dark:border-zinc-700 text-zinc-500' },
  en_progreso: { label: 'En progreso', clases: 'border-amber-400/50 text-amber-600 dark:text-amber-400' },
  finalizado: { label: 'Finalizado', clases: 'border-emerald-400/50 text-emerald-600 dark:text-emerald-400' },
};

function Badge({ info }) {
  return (
    <span className={'text-[10.5px] px-1.5 py-0.5 rounded border whitespace-nowrap ' + info.clases}>
      {info.label}
    </span>
  );
}

/* Sección colapsable de la bandeja de estudios: envuelve la tabla completa (no una
   fila) porque hacen falta 3 instancias idénticas (general, préstamo, segmentación)
   con el mismo header+contador+chevron, así que se factoriza en vez de triplicar el
   JSX de la tabla dentro de Dashboard.jsx. */
export default function BandejaEstudios({
  titulo, estudios, abiertoPorDefecto = true, selectStudy, duplicateStudy, onEliminar,
}) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto);

  return (
    <div className="bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="w-full flex items-center gap-2 p-4 border-b border-zinc-200 dark:border-zinc-800 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
      >
        {abierto ? <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />}
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{titulo}</h3>
        <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-0.5">
          {estudios.length}
        </span>
      </button>

      {abierto && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-[#0f0f13] text-zinc-500 dark:text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800">ID</th>
                <th className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800">Empresa (Contribuyente)</th>
                <th className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800">NIT</th>
                <th className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800">Año Fiscal</th>
                <th className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800">Tipo de Estudio</th>
                <th className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800">Estado</th>
                <th className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800 text-right">Monto Analizado (COP)</th>
                <th className="py-3 px-4 border-b border-zinc-200 dark:border-zinc-800 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
              {estudios.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-500 dark:text-zinc-400">
                    No se encontraron estudios registrados.
                  </td>
                </tr>
              ) : (
                estudios.map((study) => {
                  const tipo = TIPO_ESTUDIO_INFO[study.tipoEstudio] || TIPO_ESTUDIO_INFO.estandar;
                  const estado = ESTADO_INFO[study.estado] || ESTADO_INFO.borrador;
                  return (
                    <tr
                      key={study.id}
                      onClick={() => selectStudy(study.id)}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors"
                    >
                      {/* El identificador del documento, visible: los errores de la base lo
                          nombran («no se pudo guardar … estudios/study_1785772970844») y sin
                          verlo en ninguna parte no hay forma de saber de qué estudio hablan.
                          También sirve para buscarlo en la consola de Firestore. */}
                      <td
                        className="py-3 px-4 font-mono text-xs text-zinc-500 dark:text-zinc-400 select-all"
                        title="Identificador del estudio en la base de datos"
                      >
                        {study.id}
                      </td>
                      <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">{study.ent}</td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400 font-mono text-xs">{study.nit}</td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">{study.anio}</td>
                      <td className="py-3 px-4"><Badge info={tipo} /></td>
                      <td className="py-3 px-4"><Badge info={estado} /></td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-zinc-700 dark:text-zinc-300">
                        {study.monto ? fmt(study.monto) : '0'}
                      </td>
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => duplicateStudy(study.id)}
                            title="Duplicar"
                            className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-700 transition-colors"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onEliminar(study)}
                            title="Eliminar"
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg text-zinc-500 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
