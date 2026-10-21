// Compartir el evento al final de la encuesta: Web Share API y, si no existe o falla,
// WhatsApp (`https://wa.me/?text=`). El enlace es el de la encuesta sin query (no se
// comparte el `?src=` de quien respondió).

const TITULO = '2.º October Big Day · Parque de Vida Los Olivos'
const TEXTO = 'Viví el 2.º October Big Day en el Parque de Vida Los Olivos: aves, arte y vida. ¡Cuéntanos tu experiencia!'

export function urlEncuesta(loc: Pick<Location, 'origin' | 'pathname'>): string {
  return `${loc.origin}${loc.pathname}`
}

export function mensajeCompartir(url: string): string {
  return `${TEXTO} ${url}`.trim()
}

export function urlWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`
}

export interface EntornoCompartir {
  navegador: { share?: (datos: ShareData) => Promise<void> }
  abrir: (url: string) => void
}

export type ResultadoCompartir = 'nativo' | 'whatsapp' | 'cancelado'

export async function compartir(url: string, entorno: EntornoCompartir): Promise<ResultadoCompartir> {
  const { navegador, abrir } = entorno
  if (typeof navegador.share === 'function') {
    try {
      await navegador.share({ title: TITULO, text: mensajeCompartir(''), url })
      return 'nativo'
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelado'
      // Otro error (p. ej. sin permiso): se ofrece WhatsApp.
    }
  }
  abrir(urlWhatsApp(mensajeCompartir(url)))
  return 'whatsapp'
}
