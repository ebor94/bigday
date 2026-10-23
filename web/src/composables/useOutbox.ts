import { getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Respuesta } from '@bigday/shared'
import { esperaPedida } from '../lib/espera'

// Envío robusto de la respuesta con bandeja de salida (reintento offline).
// - 201 / 200 (uuid duplicado) → éxito: marca "ya respondió" y saca el uuid de la bandeja.
// - SOLO 400, 413 y 422 son definitivos → 'rechazada': no se reintenta (se descarta de la bandeja).
//   La ruta de la API solo devuelve 400/413/429/5xx; cualquier otro 4xx (401, 403, 404, 408…) viene de la
//   infraestructura (redespliegue, WAF, VITE_API_BASE mal puesta) y NO debe borrar respuestas.
// - Todo lo demás (red, timeout ~10 s, 429, 5xx, otros 4xx) → 'pendiente': queda en la bandeja (`bigday:outbox`).
// - Reintento automático mientras la página siga abierta y haya pendientes: al evento `online` y con un
//   temporizador (15 s, 60 s, 5 min y luego cada 5 min). Si un 429/503 trae `Retry-After` (segundos o fecha
//   HTTP), `RateLimit` (draft-7, `reset=`) o `RateLimit-Reset`, se espera eso (máximo 1 h).
//   Sin pendientes no queda ni temporizador ni listener. `detener()` lo limpia todo (en un componente se llama
//   solo al desmontar). Opción `reintentoAutomatico: false` para desactivarlo.
// - `descartadas`: respuestas guardadas que el servidor rechazó al reintentar (la UI no debe decir "ya respondiste").
// - Todo acceso a localStorage va en try/catch; si está bloqueado la bandeja vive en memoria.
// - Si se usa dentro de un componente, `reintentarPendientes()` se registra solo en `onMounted`
//   (opción `reintentarAlMontar: false` para desactivarlo). Fuera de un componente hay que llamarlo.

export { esperaPedida }

export const CLAVE_OUTBOX = 'bigday:outbox'
export const CLAVE_RESPONDIDA = 'bigday:respondida'
export const BASE_API_DEFECTO = '/api/bigday/v1'
export const TIMEOUT_MS = 10_000
/** Esperas del reintento automático; la última se repite mientras queden pendientes. */
export const ESPERAS_REINTENTO_MS = [15_000, 60_000, 300_000] as const
/** Tope a lo que pida el servidor (un Retry-After absurdo no deja la respuesta varada). */
export const ESPERA_MAXIMA_MS = 60 * 60_000
/** Únicos estados que la ruta usa para "esto nunca se va a aceptar". */
const ESTADOS_DEFINITIVOS = new Set([400, 413, 422])

export type EstadoEnvio = 'enviada' | 'pendiente' | 'rechazada'
export interface ResultadoEnvio {
  estado: EstadoEnvio
  /** Mensaje del servidor (solo en 'rechazada'). */
  mensaje?: string
}

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface OpcionesOutbox {
  fetch?: typeof fetch
  storage?: Almacen
  baseUrl?: string
  timeoutMs?: number
  reintentarAlMontar?: boolean
  /** Reintento con temporizador y al evento `online` (por defecto true). */
  reintentoAutomatico?: boolean
}

/** Resultado interno de un POST: en 'pendiente' puede traer cuánto pidió esperar el servidor. */
type ResultadoPost = ResultadoEnvio & { esperaMs?: number }

const MENSAJE_RECHAZO = 'No pudimos guardar tu respuesta. Revisa los datos e inténtalo de nuevo.'

function almacenPorDefecto(): Almacen | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function useOutbox(opciones: OpcionesOutbox = {}) {
  const hacerFetch = opciones.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const almacen = opciones.storage ?? almacenPorDefecto()
  const base = (opciones.baseUrl ?? import.meta.env.VITE_API_BASE ?? BASE_API_DEFECTO).replace(/\/+$/, '')
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS
  const automatico = (opciones.reintentoAutomatico ?? true) && typeof window !== 'undefined'

  // Copia en memoria: respaldo si localStorage no está disponible (`yaRespondio` también es una ref en memoria).
  let memoria: Respuesta[] = []

  function leerAlmacen(): Respuesta[] {
    try {
      const crudo = almacen?.getItem(CLAVE_OUTBOX)
      const lista: unknown = crudo ? JSON.parse(crudo) : []
      return Array.isArray(lista) ? lista.filter((x): x is Respuesta => !!x && typeof x.uuid === 'string') : []
    } catch {
      return []
    }
  }

  /** Bandeja = almacenamiento ∪ memoria, sin duplicados por uuid. */
  function cargar(): Respuesta[] {
    const porUuid = new Map<string, Respuesta>()
    for (const r of [...leerAlmacen(), ...memoria]) porUuid.set(r.uuid, r)
    return [...porUuid.values()]
  }

  const pendientes = ref(0)

  function guardar(lista: Respuesta[]) {
    memoria = lista
    pendientes.value = lista.length
    try {
      if (lista.length === 0) almacen?.removeItem(CLAVE_OUTBOX)
      else almacen?.setItem(CLAVE_OUTBOX, JSON.stringify(lista))
    } catch {
      /* almacenamiento bloqueado: queda en memoria */
    }
  }

  function agregar(r: Respuesta) {
    guardar([...cargar().filter((x) => x.uuid !== r.uuid), r])
  }
  function quitar(uuid: string) {
    guardar(cargar().filter((x) => x.uuid !== uuid))
  }

  function leerMarca(): boolean {
    try {
      return !!almacen?.getItem(CLAVE_RESPONDIDA)
    } catch {
      return false
    }
  }
  const yaRespondio = ref(leerMarca())
  pendientes.value = cargar().length
  /** Respuestas guardadas que el servidor rechazó (400/413/422) al reintentarlas. */
  const descartadas = ref(0)

  function marcarRespondida() {
    yaRespondio.value = true
    try {
      almacen?.setItem(CLAVE_RESPONDIDA, new Date().toISOString())
    } catch {
      /* sin persistencia */
    }
  }

  /** Quita la marca para dejar responder de nuevo (familias que comparten celular). */
  function permitirOtraRespuesta() {
    yaRespondio.value = false
    descartadas.value = 0
    try {
      almacen?.removeItem(CLAVE_RESPONDIDA)
    } catch {
      /* sin persistencia */
    }
  }

  async function mensajeDe(res: Response): Promise<string> {
    try {
      const cuerpo: unknown = await res.json()
      const msg = (cuerpo as { error?: unknown } | null)?.error
      if (typeof msg === 'string' && msg.trim() !== '') return msg
    } catch {
      /* sin cuerpo JSON */
    }
    return MENSAJE_RECHAZO
  }

  /** POST único; no toca la bandeja. */
  async function postear(r: Respuesta): Promise<ResultadoPost> {
    const control = new AbortController()
    const temporizador = setTimeout(() => control.abort(), timeoutMs)
    try {
      const res = await hacerFetch(`${base}/respuestas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...r, website: '' }),
        signal: control.signal,
      })
      if (res.status === 201 || res.status === 200) return { estado: 'enviada' }
      // Solo lo que la ruta usa para datos inválidos es definitivo: reintentar no lo arreglaría.
      if (ESTADOS_DEFINITIVOS.has(res.status)) return { estado: 'rechazada', mensaje: await mensajeDe(res) }
      // 429, 5xx y cualquier otro (incl. 401/403/404/408 de la infraestructura): se reintenta más tarde.
      const esperaMs = res.status === 429 || res.status === 503 ? esperaPedida(res) : undefined
      return esperaMs === undefined ? { estado: 'pendiente' } : { estado: 'pendiente', esperaMs }
    } catch {
      return { estado: 'pendiente' } // red caída o timeout
    } finally {
      clearTimeout(temporizador)
    }
  }

  async function enviar(r: Respuesta): Promise<ResultadoEnvio> {
    const { esperaMs, ...resultado } = await postear(r)
    if (resultado.estado === 'pendiente') {
      agregar(r)
      esperaServidorMs = esperaMs
      if (!enCurso) programarReintento() // si hay un reintento en curso, él programará el siguiente al terminar
    } else {
      quitar(r.uuid)
      if (resultado.estado === 'enviada') marcarRespondida()
      if (pendientes.value === 0 && !enCurso) programarReintento() // bandeja vacía: limpia temporizador y listener
    }
    return resultado
  }

  let enCurso: Promise<void> | null = null

  // ── Reintento automático ──
  let temporizador: ReturnType<typeof setTimeout> | null = null
  let intento = 0
  let esperaServidorMs: number | undefined
  let escuchando = false
  let detenido = false

  function alVolverLaConexion() {
    void reintentarPendientes()
  }

  function cancelarTemporizador() {
    if (temporizador !== null) clearTimeout(temporizador)
    temporizador = null
  }

  function dejarDeEscuchar() {
    if (!escuchando) return
    escuchando = false
    window.removeEventListener('online', alVolverLaConexion)
  }

  /** Programa el siguiente intento si quedan pendientes; si no, lo limpia todo. */
  function programarReintento() {
    if (!automatico || detenido) return
    cancelarTemporizador()
    if (pendientes.value === 0) {
      intento = 0
      esperaServidorMs = undefined
      dejarDeEscuchar()
      return
    }
    if (!escuchando) {
      escuchando = true
      window.addEventListener('online', alVolverLaConexion)
    }
    const calendario = ESPERAS_REINTENTO_MS[Math.min(intento, ESPERAS_REINTENTO_MS.length - 1)]!
    const espera = esperaServidorMs !== undefined ? Math.min(Math.max(esperaServidorMs, 1_000), ESPERA_MAXIMA_MS) : calendario
    esperaServidorMs = undefined
    intento++
    temporizador = setTimeout(() => {
      temporizador = null
      void reintentarPendientes()
    }, espera)
  }

  /** Quita temporizador y listener `online` (se llama solo al desmontar el componente). */
  function detener() {
    detenido = true
    cancelarTemporizador()
    dejarDeEscuchar()
  }

  /** Envía lo guardado. Si ya hay un reintento en marcha reutiliza esa misma promesa. */
  function reintentarPendientes(): Promise<void> {
    if (enCurso) return enCurso
    cancelarTemporizador()
    enCurso = (async () => {
      for (const r of cargar()) {
        const resultado = await postear(r)
        if (resultado.estado === 'pendiente') {
          esperaServidorMs = resultado.esperaMs
          break // el servidor sigue mal: no insistir ahora
        }
        quitar(r.uuid)
        if (resultado.estado === 'enviada') marcarRespondida()
        else descartadas.value++
      }
    })().finally(() => {
      enCurso = null
      programarReintento()
    })
    return enCurso
  }

  if (getCurrentInstance()) {
    if (opciones.reintentarAlMontar ?? true) onMounted(() => void reintentarPendientes())
    onBeforeUnmount(detener)
  }

  return { enviar, reintentarPendientes, permitirOtraRespuesta, detener, yaRespondio, pendientes, descartadas }
}
