import { describe, expect, it, vi } from 'vitest'
import { crearClienteResultados, esResultados, mensajeError } from '../src/resultados/lib/api'
import { resultadosDePrueba } from './resultados-datos'

const BASE = 'https://api.test/v1/'
const TOKEN = 'token-secreto-de-prueba'

function respuestaJson(estado: number, cuerpo: unknown, cabeceras: Record<string, string> = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json', ...cabeceras },
  })
}

function cliente(respuesta: Response | (() => Promise<Response>)) {
  const fetch = vi.fn(typeof respuesta === 'function' ? respuesta : async () => respuesta)
  return { fetch, api: crearClienteResultados({ baseUrl: BASE, fetch: fetch as unknown as typeof globalThis.fetch }) }
}

describe('obtener', () => {
  it('GET {base}/resultados con el token SOLO en Authorization (nunca en la URL), sin caché ni cookies', async () => {
    const { fetch, api } = cliente(respuestaJson(200, resultadosDePrueba()))
    const r = await api.obtener(`  ${TOKEN} `)
    expect(r.tipo).toBe('ok')
    const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit]
    expect(url).toBe('https://api.test/v1/resultados')
    expect(url).not.toContain(TOKEN)
    const cab = new Headers(init.headers)
    expect(cab.get('Authorization')).toBe(`Bearer ${TOKEN}`)
    expect(cab.get('Accept')).toBe('application/json')
    expect(init.cache).toBe('no-store')
    expect(init.credentials).toBe('omit')
    expect(init.method ?? 'GET').toBe('GET')
  })

  it('200 con forma válida → ok con los datos', async () => {
    const datos = resultadosDePrueba()
    const r = await cliente(respuestaJson(200, datos)).api.obtener(TOKEN)
    expect(r).toEqual({ tipo: 'ok', datos })
  })

  it('200 con JSON roto o forma inesperada → error', async () => {
    expect((await cliente(new Response('<html>', { status: 200 })).api.obtener(TOKEN)).tipo).toBe('error')
    expect((await cliente(respuestaJson(200, { total: 'x' })).api.obtener(TOKEN)).tipo).toBe('error')
  })

  it('401 → no_autorizado; 503 de la API → no_habilitado; 429 → limite con la espera pedida', async () => {
    expect((await cliente(respuestaJson(401, { error: 'No autorizado.' })).api.obtener(TOKEN)).tipo).toBe('no_autorizado')
    expect(
      (await cliente(respuestaJson(503, { error: 'Los resultados no están disponibles: configuración del servidor incompleta.' })).api.obtener(TOKEN)).tipo,
    ).toBe('no_habilitado')
    expect(await cliente(respuestaJson(429, { error: 'x' }, { 'Retry-After': '120' })).api.obtener(TOKEN)).toEqual({
      tipo: 'limite',
      esperaMs: 120_000,
    })
    expect(
      await cliente(respuestaJson(429, { error: 'x' }, { RateLimit: 'limit=30, remaining=0, reset=300' })).api.obtener(TOKEN),
    ).toEqual({ tipo: 'limite', esperaMs: 300_000 })
    expect(await cliente(respuestaJson(429, {})).api.obtener(TOKEN)).toEqual({ tipo: 'limite' })
  })

  it('503 sin el JSON de la API (proxy caído) → error, no "no habilitado"', async () => {
    expect(await cliente(new Response('Service Unavailable', { status: 503 })).api.obtener(TOKEN)).toEqual({
      tipo: 'error',
      status: 503,
    })
  })

  it('500 → error con estado; fallo de red o timeout → red', async () => {
    expect(await cliente(respuestaJson(500, { error: 'x' })).api.obtener(TOKEN)).toEqual({ tipo: 'error', status: 500 })
    expect(
      (await cliente(async () => {
        throw new TypeError('Failed to fetch')
      }).api.obtener(TOKEN)).tipo,
    ).toBe('red')

    vi.useFakeTimers()
    try {
      const fetch = vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise<Response>((_ok, mal) => init.signal!.addEventListener('abort', () => mal(new DOMException('abort', 'AbortError')))),
      )
      const api = crearClienteResultados({ baseUrl: BASE, fetch: fetch as unknown as typeof globalThis.fetch, timeoutMs: 1000 })
      const p = api.obtener(TOKEN)
      await vi.advanceTimersByTimeAsync(1001)
      expect((await p).tipo).toBe('red')
    } finally {
      vi.useRealTimers()
    }
  })

  it('token vacío → no_autorizado sin llamar a la red', async () => {
    const { fetch, api } = cliente(respuestaJson(200, resultadosDePrueba()))
    expect((await api.obtener('   ')).tipo).toBe('no_autorizado')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('descargarCsv', () => {
  it('GET {base}/resultados.csv con Authorization → Blob CSV', async () => {
    const csv = 'uuid,p1\r\na,B\r\n'
    const { fetch, api } = cliente(
      new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8' } }),
    )
    const r = await api.descargarCsv(TOKEN)
    const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit]
    expect(url).toBe('https://api.test/v1/resultados.csv')
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`)
    expect(new Headers(init.headers).get('Accept')).toBe('text/csv')
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.datos.type).toMatch(/^text\/csv/)
    expect(await r.datos.text()).toBe(csv)
  })

  it('conserva los bytes exactos, incluido el BOM UTF-8 que Excel necesita', async () => {
    const bytes = new TextEncoder().encode('\ufeffuuid,p7\r\na,"Ñandú, sí"\r\n')
    const { api } = cliente(new Response(bytes, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8' } }))
    const r = await api.descargarCsv(TOKEN)
    if (r.tipo !== 'ok') throw new Error(r.tipo)
    expect(new Uint8Array(await r.datos.arrayBuffer())).toEqual(bytes)
  })

  it('mismos estados de error que el JSON', async () => {
    expect((await cliente(respuestaJson(401, {})).api.descargarCsv(TOKEN)).tipo).toBe('no_autorizado')
    expect((await cliente(respuestaJson(429, {}, { 'Retry-After': '60' })).api.descargarCsv(TOKEN))).toEqual({
      tipo: 'limite',
      esperaMs: 60_000,
    })
  })
})

describe('esResultados', () => {
  it('acepta la forma del backend y rechaza lo demás', () => {
    expect(esResultados(resultadosDePrueba())).toBe(true)
    expect(esResultados(null)).toBe(false)
    expect(esResultados({ ...resultadosDePrueba(), distribucion: null })).toBe(false)
    expect(esResultados({ ...resultadosDePrueba(), ultimasFrases: 'x' })).toBe(false)
    expect(esResultados({ ...resultadosDePrueba(), matrizP2P3: {} })).toBe(false)
  })
})

describe('mensajeError', () => {
  it('mensajes en español para cada estado', () => {
    expect(mensajeError({ tipo: 'no_autorizado' })).toMatch(/^Token incorrecto/)
    expect(mensajeError({ tipo: 'no_habilitado' })).toBe('Los resultados aún no están habilitados en el servidor.')
    expect(mensajeError({ tipo: 'limite', esperaMs: 90_000 })).toMatch(/Espera 2 minutos/)
    expect(mensajeError({ tipo: 'limite', esperaMs: 30_000 })).toMatch(/Espera 1 minuto /)
    expect(mensajeError({ tipo: 'limite' })).toMatch(/unos minutos/)
    expect(mensajeError({ tipo: 'red' })).toMatch(/conexión/)
    expect(mensajeError({ tipo: 'error', status: 500 })).toMatch(/servidor/)
  })
})
