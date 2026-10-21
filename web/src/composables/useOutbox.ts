import { getCurrentInstance, onMounted, ref } from 'vue'
import type { Respuesta } from '@bigday/shared'

// Envío robusto de la respuesta con bandeja de salida (reintento offline).
// - 201 / 200 (uuid duplicado) → éxito: marca "ya respondió" y saca el uuid de la bandeja.
// - Red, timeout (~10 s), 429, 5xx → 'pendiente': queda en la bandeja (`bigday:outbox`).
// - 4xx definitivos (400, 413, 401, 403, 404, 422…; no 408 ni 429) → 'rechazada': no se reintenta (se descarta de la bandeja).
// - Todo acceso a localStorage va en try/catch; si está bloqueado la bandeja vive en memoria.
// - Si se usa dentro de un componente, `reintentarPendientes()` se registra solo en `onMounted`
//   (opción `reintentarAlMontar: false` para desactivarlo). Fuera de un componente hay que llamarlo.

export const CLAVE_OUTBOX = 'bigday:outbox'
export const CLAVE_RESPONDIDA = 'bigday:respondida'
export const BASE_API_DEFECTO = '/api/bigday/v1'
export const TIMEOUT_MS = 10_000

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
}

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
  async function postear(r: Respuesta): Promise<ResultadoEnvio> {
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
      // Cualquier 4xx salvo 408 (timeout) y 429 (rate limit) es definitivo: reintentar no lo arregla.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) return { estado: 'rechazada', mensaje: await mensajeDe(res) }
      return { estado: 'pendiente' } // 429, 5xx y cualquier otro: se reintenta más tarde
    } catch {
      return { estado: 'pendiente' } // red caída o timeout
    } finally {
      clearTimeout(temporizador)
    }
  }

  async function enviar(r: Respuesta): Promise<ResultadoEnvio> {
    const resultado = await postear(r)
    if (resultado.estado === 'pendiente') agregar(r)
    else {
      quitar(r.uuid)
      if (resultado.estado === 'enviada') marcarRespondida()
    }
    return resultado
  }

  let enCurso: Promise<void> | null = null

  /** Envía lo guardado. Si ya hay un reintento en marcha reutiliza esa misma promesa. */
  function reintentarPendientes(): Promise<void> {
    if (enCurso) return enCurso
    enCurso = (async () => {
      for (const r of cargar()) {
        const resultado = await postear(r)
        if (resultado.estado === 'pendiente') break // el servidor sigue mal: no insistir ahora
        quitar(r.uuid)
        if (resultado.estado === 'enviada') marcarRespondida()
      }
    })().finally(() => {
      enCurso = null
    })
    return enCurso
  }

  if ((opciones.reintentarAlMontar ?? true) && getCurrentInstance()) {
    onMounted(() => void reintentarPendientes())
  }

  return { enviar, reintentarPendientes, permitirOtraRespuesta, yaRespondio, pendientes }
}
