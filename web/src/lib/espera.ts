// Lectura de las cabeceras de reintento (429/503). La usan la encuesta (useOutbox) y la vista de resultados:
// vive aparte para que la vista de resultados no arrastre el módulo de la bandeja de salida.

/**
 * Cuánto pide esperar el servidor (ms) según `Retry-After` (segundos o fecha HTTP), `RateLimit` (draft-7,
 * `reset=N`) o `RateLimit-Reset` (segundos). undefined si no hay cabecera válida.
 */
export function esperaPedida(res: Response, ahora = Date.now()): number | undefined {
  const retryAfter = res.headers.get('Retry-After')?.trim()
  if (retryAfter) {
    if (/^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000
    const fecha = Date.parse(retryAfter)
    if (!Number.isNaN(fecha)) return Math.max(0, fecha - ahora)
  }
  const reset = res.headers.get('RateLimit')?.match(/(?:^|[;,\s])reset=(\d+)/i)?.[1] ?? res.headers.get('RateLimit-Reset')?.trim()
  if (reset && /^\d+$/.test(reset)) return Number(reset) * 1000
  return undefined
}
