import React, { useState } from 'react';
import { DollarSign, X } from 'lucide-react';
import { useGastoIA } from '../services/gastoIA';

/* Formato con miles y hasta 4 decimales: una operación individual puede costar
   fracciones de centavo, y redondear a entero (como el formateador de calculations.js,
   pensado para COP) escondería justo lo que este badge existe para mostrar. */
const formateador = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function formatearUSD(valor) {
  return 'US$ ' + formateador.format(valor || 0);
}

/* Badge del gasto en IA del estudio abierto (Claude + Gemini), con el desglose por
   operación. Vive en el header del layout, junto a "Finalizar estudio" y el tema —
   lee el store externo `gastoIA` directo (useSyncExternalStore), sin props: no necesita
   que App.jsx ni Layout le pasen nada porque el store ya sabe a qué estudio pertenece
   (ver services/gastoIA.js). */
export default function GastoIABadge() {
  const [abierto, setAbierto] = useState(false);
  const { totalUSD, operaciones } = useGastoIA();

  const ordenadas = [...operaciones].sort((a, b) => b.ts - a.ts);

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto(!abierto)}
        className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        title="Gasto en IA (Claude + Gemini) de este estudio"
      >
        <DollarSign className="w-3.5 h-3.5 text-[#0FA3A1]" />
        {formatearUSD(totalUSD)}
      </button>

      {abierto && (
        <div className="absolute right-0 top-full mt-1 z-30 w-[26rem] bg-white dark:bg-[#0c0c0f] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100">
              Gasto en IA de este estudio
            </span>
            <button onClick={() => setAbierto(false)} className="text-zinc-400 hover:text-zinc-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {ordenadas.length ? (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-[10.5px]">
                <thead>
                  <tr className="text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                    <th className="text-left font-medium py-1">Operación</th>
                    <th className="text-left font-medium py-1">Modelo</th>
                    <th className="text-right font-medium py-1">Tokens</th>
                    <th className="text-right font-medium py-1">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenadas.map((op, i) => (
                    <tr key={i} className="border-b border-zinc-50 dark:border-zinc-900 text-zinc-700 dark:text-zinc-300">
                      <td className="py-1 pr-2">{op.etiqueta}</td>
                      <td className="py-1 pr-2 font-mono text-zinc-500">{op.modelo}</td>
                      <td className="py-1 text-right font-mono text-zinc-500">
                        {op.tokensEntrada.toLocaleString('es-CO')} / {op.tokensSalida.toLocaleString('es-CO')}
                      </td>
                      <td className="py-1 text-right font-mono">{formatearUSD(op.costoUSD)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-[10.5px] text-zinc-400">
              Todavía no se ha registrado ninguna operación de IA en este estudio.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
