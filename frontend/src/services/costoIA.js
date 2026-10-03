'use strict';

/* Precios de referencia, USD por millón de tokens. Si Anthropic/Google cambian precios
   o se agrega un modelo nuevo, se actualiza solo aquí. */
export const PRECIOS_USD_POR_MILLON = {
  'gemini-3.5-flash': { entrada: 1.50, salida: 9.00 },
  'gemini-3-flash-preview': { entrada: 0.25, salida: 1.50 },
  'claude-haiku-4-5-20251001': { entrada: 1, salida: 5 },
  'claude-sonnet-5': { entrada: 2, salida: 10 },
};

/** Costo en USD de una operación. Modelo desconocido → 0 (no rompe, no factura fantasmas). */
export function costoUSD(modelo, tokensEntrada, tokensSalida) {
  const precio = PRECIOS_USD_POR_MILLON[modelo];
  if (!precio) return 0;
  const entrada = (Number(tokensEntrada) || 0) / 1e6 * precio.entrada;
  const salida = (Number(tokensSalida) || 0) / 1e6 * precio.salida;
  return entrada + salida;
}
