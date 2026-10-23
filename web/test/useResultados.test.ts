import { describe, expect, it, vi } from 'vitest'
import type { ClienteResultados, ResultadoApi } from '../src/resultados/lib/api'
import type { Resultados } from '../src/resultados/lib/tipos'
import { useResultados } from '../src/resultados/useResultados'
import { resultadosDePrueba } from './resultados-datos'

function sesionFalsa(inicial: string | null = null) {
  let t = inicial
  return {
    leer: vi.fn(() => t),
    guardar: vi.fn((v: string) => void (t = v)),
    borrar: vi.fn(() => void (t = null)),
    get valor() {
      return t
    },
  }
}

function clienteFalso(respuestas: ResultadoApi<Resultados>[], csv: ResultadoApi<Blob>[] = []) {
  const cliente: ClienteResultados = {
    obtener: vi.fn(async (): Promise<ResultadoApi<Resultados>> => respuestas.shift() ?? { tipo: 'red' }),
    descargarCsv: vi.fn(async (): Promise<ResultadoApi<Blob>> => csv.shift() ?? { tipo: 'red' }),
  }
  return cliente
}

const OK = (): ResultadoApi<Resultados> => ({ tipo: 'ok', datos: resultadosDePrueba() })
const AHORA = new Date('2026-10-20T15:00:00.000Z')

function crear(respuestas: ResultadoApi<Resultados>[], token: string | null = null, csv: ResultadoApi<Blob>[] = []) {
  const sesion = sesionFalsa(token)
  const cliente = clienteFalso(respuestas, csv)
  const guardar = vi.fn(() => 'descargado' as const)
  const r = useResultados({ cliente, sesion, ahora: () => AHORA, guardar })
  return { r, sesion, cliente, guardar }
}

describe('useResultados', () => {
  it('sin token guardado empieza en el formulario sin llamar a la red', async () => {
    const { r, cliente } = crear([])
    await r.iniciar()
    expect(r.vista.value).toBe('login')
    expect(cliente.obtener).not.toHaveBeenCalled()
  })

  it('con token en la sesión (recarga) carga los datos sin pedirlo de nuevo', async () => {
    const { r, cliente } = crear([OK()], 'guardado')
    await r.iniciar()
    expect(cliente.obtener).toHaveBeenCalledWith('guardado')
    expect(r.vista.value).toBe('listo')
    expect(r.datos.value?.total).toBe(120)
    expect(r.actualizadoEn.value).toEqual(AHORA)
  })

  it('entrar con token correcto: lo guarda en la sesión y muestra los datos', async () => {
    const { r, sesion } = crear([OK()])
    await r.entrar('  nuevo ')
    expect(sesion.guardar).toHaveBeenCalledWith('nuevo')
    expect(r.vista.value).toBe('listo')
    expect(r.mensajeLogin.value).toBe('')
  })

  it('entrar con token incorrecto: sigue en el formulario con "Token incorrecto" y no guarda nada', async () => {
    const { r, sesion } = crear([{ tipo: 'no_autorizado' }])
    await r.entrar('malo')
    expect(r.vista.value).toBe('login')
    expect(r.mensajeLogin.value).toMatch(/^Token incorrecto/)
    expect(sesion.guardar).not.toHaveBeenCalled()
  })

  it('entrar con token vacío: pide escribirlo sin llamar a la red', async () => {
    const { r, cliente } = crear([])
    await r.entrar('  ')
    expect(r.mensajeLogin.value).toMatch(/Escribe el token/)
    expect(cliente.obtener).not.toHaveBeenCalled()
  })

  it('503 y 429 al entrar: mensaje claro en el formulario', async () => {
    const a = crear([{ tipo: 'no_habilitado' }])
    await a.r.entrar('x')
    expect(a.r.vista.value).toBe('login')
    expect(a.r.mensajeLogin.value).toBe('Los resultados aún no están habilitados en el servidor.')
    const b = crear([{ tipo: 'limite', esperaMs: 300_000 }])
    await b.r.entrar('x')
    expect(b.r.mensajeLogin.value).toMatch(/Espera 5 minutos/)
  })

  it('actualizar vuelve a pedir los datos; si falla conserva los anteriores con un aviso', async () => {
    const { r, cliente } = crear([OK(), { tipo: 'error', status: 500 }, OK()], 'tok')
    await r.iniciar()
    const anteriores = r.datos.value
    const p = r.actualizar()
    expect(r.actualizando.value).toBe(true)
    await p
    expect(r.actualizando.value).toBe(false)
    expect(r.vista.value).toBe('listo')
    expect(r.datos.value).toBe(anteriores)
    expect(r.aviso.value).toMatch(/servidor/)
    await r.actualizar()
    expect(r.aviso.value).toBe('')
    expect(cliente.obtener).toHaveBeenCalledTimes(3)
  })

  it('error en la primera carga (con sesión): vista de error con el mensaje', async () => {
    const { r } = crear([{ tipo: 'red' }], 'tok')
    await r.iniciar()
    expect(r.vista.value).toBe('error')
    expect(r.aviso.value).toMatch(/conexión/)
  })

  it('401 con un token guardado (lo cambiaron en el servidor): cierra la sesión y vuelve al formulario', async () => {
    const { r, sesion } = crear([OK(), { tipo: 'no_autorizado' }], 'viejo')
    await r.iniciar()
    await r.actualizar()
    expect(sesion.borrar).toHaveBeenCalled()
    expect(r.vista.value).toBe('login')
    expect(r.datos.value).toBeNull()
    expect(r.mensajeLogin.value).toMatch(/^Token incorrecto/)
  })

  it('salir borra el token y los datos', async () => {
    const { r, sesion } = crear([OK()], 'tok')
    await r.iniciar()
    r.salir()
    expect(sesion.valor).toBeNull()
    expect(r.datos.value).toBeNull()
    expect(r.vista.value).toBe('login')
    expect(r.mensajeLogin.value).toBe('')
  })

  it('descargarCsv usa el token de la sesión y guarda el blob como bigday-respuestas.csv', async () => {
    const blob = new Blob(['a,b'], { type: 'text/csv' })
    const { r, cliente, guardar } = crear([OK()], 'tok', [{ tipo: 'ok', datos: blob }, { tipo: 'limite' }])
    await r.iniciar()
    await r.descargarCsv()
    expect(cliente.descargarCsv).toHaveBeenCalledWith('tok')
    expect(guardar).toHaveBeenCalledWith(blob, 'bigday-respuestas.csv')
    expect(r.aviso.value).toBe('')
    await r.descargarCsv()
    expect(r.aviso.value).toMatch(/unos minutos/)
    expect(r.descargando.value).toBe(false)
  })

  it('una petición vieja que llega tarde no pisa el estado tras salir', async () => {
    let soltar!: (v: ResultadoApi<Resultados>) => void
    const sesion = sesionFalsa('tok')
    const cliente: ClienteResultados = {
      obtener: vi.fn(() => new Promise<ResultadoApi<Resultados>>((ok) => (soltar = ok))),
      descargarCsv: vi.fn(),
    }
    const r = useResultados({ cliente, sesion, ahora: () => AHORA, guardar: vi.fn() })
    const p = r.iniciar()
    r.salir()
    soltar(OK())
    await p
    expect(r.vista.value).toBe('login')
    expect(r.datos.value).toBeNull()
  })
})
