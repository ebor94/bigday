import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import type { Respuesta } from '@bigday/shared'
import { CLAVE_OUTBOX, CLAVE_RESPONDIDA, useOutbox } from '../src/composables/useOutbox'

const BASE = 'https://api.test/v1'

function respuesta(uuid: string): Respuesta {
  return {
    uuid,
    p1: 'A',
    p2: 'ambas',
    p3: 'memoria',
    p4: 'diversidad',
    p5: 'B',
    p6: 9,
    p7: 'Un lugar lleno de vida',
    duracion_seg: 40,
    website: '',
  }
}
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'

function almacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial))
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  }
}

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })
}

function outboxDe(a: ReturnType<typeof almacen>): { uuid: string }[] {
  return JSON.parse(a.datos.get(CLAVE_OUTBOX) ?? '[]')
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-21T15:00:00.000Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('enviar: éxito', () => {
  it('201 -> enviada, hace POST JSON a {base}/respuestas con website vacío y marca "ya respondió"', async () => {
    const a = almacen()
    const fetchMock = vi.fn().mockResolvedValue(json(201, { ok: true }))
    const o = useOutbox({ fetch: fetchMock, storage: a, baseUrl: BASE })
    expect(o.yaRespondio.value).toBe(false)

    const r = await o.enviar(respuesta(U1))

    expect(r.estado).toBe('enviada')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${BASE}/respuestas`)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toMatchObject({ uuid: U1, p1: 'A', website: '' })
    expect(a.datos.get(CLAVE_RESPONDIDA)).toBe('2026-10-21T15:00:00.000Z')
    expect(o.yaRespondio.value).toBe(true)
    expect(outboxDe(a)).toEqual([])
  })

  it('200 duplicada cuenta como éxito', async () => {
    const a = almacen()
    const o = useOutbox({ fetch: vi.fn().mockResolvedValue(json(200, { ok: true, duplicada: true })), storage: a, baseUrl: BASE })
    const r = await o.enviar(respuesta(U1))
    expect(r.estado).toBe('enviada')
    expect(o.yaRespondio.value).toBe(true)
  })

  it('un éxito retira ese uuid de la bandeja', async () => {
    const a = almacen({ [CLAVE_OUTBOX]: JSON.stringify([respuesta(U1), respuesta(U2)]) })
    const o = useOutbox({ fetch: vi.fn().mockResolvedValue(json(201, { ok: true })), storage: a, baseUrl: BASE })
    await o.enviar(respuesta(U1))
    expect(outboxDe(a).map((x) => x.uuid)).toEqual([U2])
  })

  it('yaRespondio se lee del almacenamiento al crear', () => {
    const a = almacen({ [CLAVE_RESPONDIDA]: '2026-10-20T10:00:00.000Z' })
    expect(useOutbox({ fetch: vi.fn(), storage: a, baseUrl: BASE }).yaRespondio.value).toBe(true)
  })

  it('permitirOtraRespuesta() borra la marca', async () => {
    const a = almacen({ [CLAVE_RESPONDIDA]: '2026-10-20T10:00:00.000Z' })
    const o = useOutbox({ fetch: vi.fn(), storage: a, baseUrl: BASE })
    o.permitirOtraRespuesta()
    expect(o.yaRespondio.value).toBe(false)
    expect(a.datos.has(CLAVE_RESPONDIDA)).toBe(false)
  })
})

describe('enviar: fallos recuperables -> pendiente', () => {
  it.each([
    ['error de red', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['429', () => Promise.resolve(json(429, { error: 'Demasiadas solicitudes' }))],
    ['500', () => Promise.resolve(json(500, { error: 'x' }))],
    ['503', () => Promise.resolve(new Response('', { status: 503 }))],
  ])('%s guarda en la bandeja y devuelve pendiente', async (_n, impl) => {
    const a = almacen()
    const o = useOutbox({ fetch: vi.fn().mockImplementation(impl), storage: a, baseUrl: BASE })
    const r = await o.enviar(respuesta(U1))
    expect(r.estado).toBe('pendiente')
    expect(outboxDe(a).map((x) => x.uuid)).toEqual([U1])
    expect(a.datos.has(CLAVE_RESPONDIDA)).toBe(false)
    expect(o.yaRespondio.value).toBe(false)
    expect(o.pendientes.value).toBe(1)
  })

  it('no duplica por uuid al fallar dos veces', async () => {
    const a = almacen()
    const o = useOutbox({ fetch: vi.fn().mockRejectedValue(new TypeError('red')), storage: a, baseUrl: BASE })
    await o.enviar(respuesta(U1))
    await o.enviar(respuesta(U1))
    expect(outboxDe(a)).toHaveLength(1)
  })

  it('timeout (~10 s) aborta el fetch y queda pendiente', async () => {
    const a = almacen()
    const fetchMock = vi.fn((_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init!.signal!.addEventListener('abort', () => rej(new DOMException('abortado', 'AbortError')))
      }),
    )
    const o = useOutbox({ fetch: fetchMock, storage: a, baseUrl: BASE })
    const promesa = o.enviar(respuesta(U1))
    await vi.advanceTimersByTimeAsync(9_999)
    expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const r = await promesa
    expect(r.estado).toBe('pendiente')
    expect(outboxDe(a)).toHaveLength(1)
  })
})

describe('enviar: rechazos -> sin reintento', () => {
  it('400 devuelve rechazada con el mensaje del servidor y no queda en la bandeja', async () => {
    const a = almacen({ [CLAVE_OUTBOX]: JSON.stringify([respuesta(U1)]) })
    const o = useOutbox({ fetch: vi.fn().mockResolvedValue(json(400, { error: 'Solicitud inválida' })), storage: a, baseUrl: BASE })
    const r = await o.enviar(respuesta(U1))
    expect(r.estado).toBe('rechazada')
    expect(r.mensaje).toBe('Solicitud inválida')
    expect(outboxDe(a)).toEqual([])
    expect(o.yaRespondio.value).toBe(false)
  })

  it('413 sin cuerpo JSON -> rechazada con mensaje por defecto', async () => {
    const a = almacen()
    const o = useOutbox({ fetch: vi.fn().mockResolvedValue(new Response('', { status: 413 })), storage: a, baseUrl: BASE })
    const r = await o.enviar(respuesta(U1))
    expect(r.estado).toBe('rechazada')
    expect(r.mensaje).toBeTruthy()
    expect(outboxDe(a)).toEqual([])
  })

  it.each([401, 403, 404, 422])('%i es definitivo: rechazada y fuera de la bandeja', async (status) => {
    const a = almacen({ [CLAVE_OUTBOX]: JSON.stringify([respuesta(U1)]) })
    const o = useOutbox({ fetch: vi.fn().mockResolvedValue(json(status, { error: 'no' })), storage: a, baseUrl: BASE })
    const r = await o.enviar(respuesta(U1))
    expect(r.estado).toBe('rechazada')
    expect(outboxDe(a)).toEqual([])
  })

  it('408 sigue siendo pendiente', async () => {
    const a = almacen()
    const o = useOutbox({ fetch: vi.fn().mockResolvedValue(new Response('', { status: 408 })), storage: a, baseUrl: BASE })
    expect((await o.enviar(respuesta(U1))).estado).toBe('pendiente')
    expect(outboxDe(a)).toHaveLength(1)
  })

  it('un 400 no se reintenta en reintentarPendientes', async () => {
    const a = almacen()
    const fetchMock = vi.fn().mockResolvedValue(json(400, { error: 'mal' }))
    const o = useOutbox({ fetch: fetchMock, storage: a, baseUrl: BASE })
    await o.enviar(respuesta(U1))
    await o.reintentarPendientes()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('reintentarPendientes', () => {
  it('envía todo lo guardado, vacía la bandeja y marca "ya respondió"', async () => {
    const a = almacen({ [CLAVE_OUTBOX]: JSON.stringify([respuesta(U1), respuesta(U2)]) })
    const fetchMock = vi.fn().mockResolvedValue(json(201, { ok: true }))
    const o = useOutbox({ fetch: fetchMock, storage: a, baseUrl: BASE })
    await o.reintentarPendientes()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(outboxDe(a)).toEqual([])
    expect(o.yaRespondio.value).toBe(true)
    expect(o.pendientes.value).toBe(0)
  })

  it('si sigue fallando la red conserva la bandeja', async () => {
    const a = almacen({ [CLAVE_OUTBOX]: JSON.stringify([respuesta(U1)]) })
    const o = useOutbox({ fetch: vi.fn().mockRejectedValue(new TypeError('red')), storage: a, baseUrl: BASE })
    await o.reintentarPendientes()
    expect(outboxDe(a).map((x) => x.uuid)).toEqual([U1])
    expect(o.yaRespondio.value).toBe(false)
  })

  it('una entrada guardada que da 400 se elimina y la siguiente se sigue enviando', async () => {
    const a = almacen({ [CLAVE_OUTBOX]: JSON.stringify([respuesta(U1), respuesta(U2)]) })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(400, { error: 'mal' }))
      .mockResolvedValueOnce(json(201, { ok: true }))
    const o = useOutbox({ fetch: fetchMock, storage: a, baseUrl: BASE })
    await o.reintentarPendientes()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(outboxDe(a)).toEqual([])
    expect(o.yaRespondio.value).toBe(true)
  })

  it('se detiene en el primer pendiente y deja intactas las siguientes', async () => {
    const a = almacen({ [CLAVE_OUTBOX]: JSON.stringify([respuesta(U1), respuesta(U2)]) })
    const fetchMock = vi.fn().mockResolvedValue(json(503, { error: 'x' }))
    const o = useOutbox({ fetch: fetchMock, storage: a, baseUrl: BASE })
    await o.reintentarPendientes()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(outboxDe(a).map((x) => x.uuid)).toEqual([U1, U2])
  })

  it('enviar y reintentarPendientes del mismo uuid en paralelo terminan sin el uuid en la bandeja y con la marca', async () => {
    const a = almacen({ [CLAVE_OUTBOX]: JSON.stringify([respuesta(U1)]) })
    const fetchMock = vi.fn().mockResolvedValue(json(201, { ok: true }))
    const o = useOutbox({ fetch: fetchMock, storage: a, baseUrl: BASE })
    await Promise.all([o.reintentarPendientes(), o.enviar(respuesta(U1))])
    expect(outboxDe(a)).toEqual([])
    expect(a.datos.get(CLAVE_RESPONDIDA)).toBe('2026-10-21T15:00:00.000Z')
    expect(o.pendientes.value).toBe(0)
  })

  it('con la bandeja vacía no hace peticiones', async () => {
    const fetchMock = vi.fn()
    const o = useOutbox({ fetch: fetchMock, storage: almacen(), baseUrl: BASE })
    await o.reintentarPendientes()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('guarda de concurrencia: dos reintentos simultáneos no envían doble', async () => {
    const a = almacen({ [CLAVE_OUTBOX]: JSON.stringify([respuesta(U1)]) })
    let resolver!: (r: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((res) => (resolver = res)))
    const o = useOutbox({ fetch: fetchMock, storage: a, baseUrl: BASE })
    const p1 = o.reintentarPendientes()
    const p2 = o.reintentarPendientes()
    await vi.advanceTimersByTimeAsync(0)
    resolver(json(201, { ok: true }))
    await Promise.all([p1, p2])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ignora entradas corruptas en la bandeja', async () => {
    const a = almacen({ [CLAVE_OUTBOX]: '{no es json' })
    const fetchMock = vi.fn()
    const o = useOutbox({ fetch: fetchMock, storage: a, baseUrl: BASE })
    await expect(o.reintentarPendientes()).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('se ejecuta al montar el componente que usa el composable', async () => {
    const a = almacen({ [CLAVE_OUTBOX]: JSON.stringify([respuesta(U1)]) })
    const fetchMock = vi.fn().mockResolvedValue(json(201, { ok: true }))
    const Comp = defineComponent({
      setup() {
        useOutbox({ fetch: fetchMock, storage: a, baseUrl: BASE })
        return () => h('div')
      },
    })
    const app = createApp(Comp)
    app.mount(document.createElement('div'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    app.unmount()
  })
})

describe('almacenamiento bloqueado', () => {
  function roto() {
    const falla = () => {
      throw new DOMException('bloqueado', 'SecurityError')
    }
    return { getItem: falla, setItem: falla, removeItem: falla }
  }

  it('si el POST falla devuelve pendiente igualmente y lo conserva en memoria', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('red')).mockResolvedValue(json(201, { ok: true }))
    const o = useOutbox({ fetch: fetchMock, storage: roto(), baseUrl: BASE })
    const r = await o.enviar(respuesta(U1))
    expect(r.estado).toBe('pendiente')
    expect(o.pendientes.value).toBe(1)
    await o.reintentarPendientes()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(o.pendientes.value).toBe(0)
  })

  it('un éxito no lanza aunque no se pueda marcar; yaRespondio queda en true en memoria', async () => {
    const o = useOutbox({ fetch: vi.fn().mockResolvedValue(json(201, { ok: true })), storage: roto(), baseUrl: BASE })
    expect((await o.enviar(respuesta(U1))).estado).toBe('enviada')
    expect(o.yaRespondio.value).toBe(true)
  })

  it('crear el composable con almacenamiento roto no lanza', () => {
    expect(() => useOutbox({ fetch: vi.fn(), storage: roto(), baseUrl: BASE })).not.toThrow()
  })

  it('el acceso a window.localStorage que lanza tampoco rompe', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    try {
      expect(() => useOutbox({ fetch: vi.fn(), baseUrl: BASE })).not.toThrow()
    } finally {
      vi.restoreAllMocks()
    }
  })
})
