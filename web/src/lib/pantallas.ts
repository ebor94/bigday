import { QUESTIONS } from '@bigday/shared'
import type { ResultadoEnvio } from '../composables/useOutbox'
import type { Paso } from '../composables/useSurvey'

// Qué pantalla corresponde a cada paso y en qué modo se muestra la de gracias.

/** id del h1 de cada pantalla: recibe el foco al cambiar de paso y etiqueta grupos y secciones. */
export const ID_TITULO = 'titulo-paso'

type Pregunta = (typeof QUESTIONS)[number]

export type Pantalla =
  | { tipo: 'bienvenida' }
  | { tipo: 'gracias' }
  | { tipo: 'opcion'; pregunta: Extract<Pregunta, { type: 'single' }> }
  | { tipo: 'escala'; pregunta: Extract<Pregunta, { type: 'scale' }> }
  | { tipo: 'abierta'; pregunta: Extract<Pregunta, { type: 'open' }> }

export function pantallaDe(paso: Paso): Pantalla {
  if (paso === 'bienvenida' || paso === 'gracias') return { tipo: paso }
  const pregunta = QUESTIONS.find((q) => q.id === paso)!
  switch (pregunta.type) {
    case 'single':
      return { tipo: 'opcion', pregunta }
    case 'scale':
      return { tipo: 'escala', pregunta }
    case 'open':
      return { tipo: 'abierta', pregunta }
  }
}

export type ModoGracias =
  | 'enviando'
  | 'enviada'
  | 'pendiente'
  | 'rechazada'
  | 'pendiente_regreso'
  | 'ya_respondiste'
  /** La respuesta guardada se rechazó al reintentarla: no se presenta como recibida. */
  | 'no_registrada'

export interface EstadoGracias {
  /** Se llegó a gracias al abrir la página (ya había respondido o hay envíos pendientes). */
  regreso: boolean
  enviando: boolean
  resultado: ResultadoEnvio | null
  yaRespondio: boolean
  pendientes: number
  /** Respuestas guardadas que el servidor rechazó al reintentarlas (useOutbox.descartadas). */
  descartadas: number
}

export function modoGracias(e: EstadoGracias): ModoGracias {
  if (e.regreso) {
    if (e.pendientes > 0) return 'pendiente_regreso'
    return e.descartadas > 0 ? 'no_registrada' : 'ya_respondiste'
  }
  if (e.enviando || !e.resultado) return 'enviando'
  if (e.resultado.estado === 'pendiente') {
    if (e.pendientes > 0) return 'pendiente'
    if (e.descartadas > 0) return 'no_registrada'
    return e.yaRespondio ? 'enviada' : 'pendiente'
  }
  return e.resultado.estado
}
