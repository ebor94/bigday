// Cliente de los resultados protegidos (GET {base}/resultados y {base}/resultados.csv).
// - El token viaja SOLO en la cabecera Authorization (nunca en la URL) y nunca se escribe en consola.
// - Sin caché (`no-store`) ni cookies (`credentials: 'omit'`).
// - Estado HTTP → resultado tipado: 401 no_autorizado · 503 (JSON de la API) no_habilitado ·
//   429 limite (con la espera de Retry-After / RateLimit si CORS la expone) · fallo de red o timeout → red ·
//   lo demás → error.
import { esperaPedida } from '../../lib/espera'
import type { Resultados } from './tipos'

export const BASE_API_DEFECTO = '/api/bigday/v1'
export const TIMEOUT_MS = 15_000

export type ResultadoApi<T> =
  | { tipo: 'ok'; datos: T }
  | { tipo: 'no_autorizado' }
  | { tipo: 'no_habilitado' }
  | { tipo: 'limite'; esperaMs?: number }
  | { tipo: 'red' }
  | { tipo: 'error'; status?: number }

export type ErrorApi = Exclude<ResultadoApi<unknown>, { tipo: 'ok' }>

export interface ClienteResultados {
  obtener(token: string): Promise<ResultadoApi<Resultados>>
  descargarCsv(token: string): Promise<ResultadoApi<Blob>>
}

export interface OpcionesCliente {
  baseUrl?: string
  fetch?: typeof fetch
  timeoutMs?: number
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Comprobación de forma (no de contenido): lo suficiente para no romper la vista con una respuesta extraña. */
export function esResultados(x: unknown): x is Resultados {
  if (!esObjeto(x) || typeof x.total !== 'number') return false
  const d = x.distribucion
  if (!esObjeto(d) || !['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].every((k) => Array.isArray(d[k]))) return false
  return esObjeto(x.nps) && Array.isArray(x.matrizP2P3) && Array.isArray(x.ultimasFrases)
}

export function crearClienteResultados(opciones: OpcionesCliente = {}): ClienteResultados {
  const hacerFetch = opciones.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const base = (opciones.baseUrl ?? import.meta.env.VITE_API_BASE ?? BASE_API_DEFECTO).replace(/\/+$/, '')
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS

  async function pedir<T>(
    ruta: string,
    token: string,
    accept: string,
    leer: (res: Response) => Promise<T | undefined>,
  ): Promise<ResultadoApi<T>> {
    const limpio = token.trim()
    if (!limpio) return { tipo: 'no_autorizado' }
    const control = new AbortController()
    const temporizador = setTimeout(() => control.abort(), timeoutMs)
    let res: Response
    try {
      res = await hacerFetch(`${base}${ruta}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${limpio}`, Accept: accept },
        cache: 'no-store',
        credentials: 'omit',
        signal: control.signal,
      })
    } catch {
      return { tipo: 'red' }
    } finally {
      clearTimeout(temporizador)
    }
    if (res.ok) {
      try {
        const datos = await leer(res)
        return datos === undefined ? { tipo: 'error', status: res.status } : { tipo: 'ok', datos }
      } catch {
        return { tipo: 'error', status: res.status }
      }
    }
    if (res.status === 401) return { tipo: 'no_autorizado' }
    if (res.status === 429) {
      const esperaMs = esperaPedida(res)
      return esperaMs === undefined ? { tipo: 'limite' } : { tipo: 'limite', esperaMs }
    }
    if (res.status === 503) {
      // Solo el 503 de la API (JSON con `error`) significa "sin token configurado"; un proxy caído es otro caso.
      const cuerpo: unknown = await res.json().catch(() => null)
      if (esObjeto(cuerpo) && typeof cuerpo.error === 'string') return { tipo: 'no_habilitado' }
    }
    return { tipo: 'error', status: res.status }
  }

  return {
    obtener: (token) =>
      pedir('/resultados', token, 'application/json', async (res) => {
        const json: unknown = await res.json()
        return esResultados(json) ? json : undefined
      }),
    descargarCsv: (token) =>
      pedir('/resultados.csv', token, 'text/csv', async (res) => {
        // Bytes tal cual (no res.text(): el decodificador quitaría el BOM UTF-8 que Excel necesita).
        const bytes = await res.arrayBuffer()
        return new Blob([bytes], { type: 'text/csv;charset=utf-8' })
      }),
  }
}

function minutos(ms: number): string {
  const n = Math.max(1, Math.ceil(ms / 60_000))
  return n === 1 ? '1 minuto' : `${n} minutos`
}

/** Mensaje en español para cada error. */
export function mensajeError(r: ErrorApi): string {
  switch (r.tipo) {
    case 'no_autorizado':
      return 'Token incorrecto. Revísalo e inténtalo de nuevo.'
    case 'no_habilitado':
      return 'Los resultados aún no están habilitados en el servidor.'
    case 'limite':
      return r.esperaMs === undefined
        ? 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.'
        : `Demasiados intentos. Espera ${minutos(r.esperaMs)} y vuelve a intentarlo.`
    case 'red':
      return 'No hay conexión con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.'
    case 'error':
      return 'El servidor no pudo entregar los resultados. Inténtalo de nuevo en unos minutos.'
  }
}
