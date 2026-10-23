// Guardar un Blob como archivo. El CSV se pide con fetch (el token va en una cabecera, no en un enlace),
// así que no basta un <a href>: se crea una blob URL y se "pulsa" un enlace temporal con `download`.
// Safari iOS ≥ 13 lo admite; si el navegador no soporta `download`, se abre la blob URL (el usuario la
// guarda o comparte desde ahí). La URL se revoca un minuto después: Safari la necesita viva un rato.

export const NOMBRE_CSV = 'bigday-respuestas.csv'
const REVOCAR_MS = 60_000

export interface OpcionesGuardar {
  url?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>
  abrir?: (url: string) => unknown
  crearEnlace?: () => HTMLAnchorElement
  soportaDownload?: boolean
}

export type ResultadoGuardar = 'descargado' | 'abierto'

export function guardarArchivo(blob: Blob, nombre: string, opciones: OpcionesGuardar = {}): ResultadoGuardar {
  const url = opciones.url ?? URL
  const crearEnlace = opciones.crearEnlace ?? (() => document.createElement('a'))
  const soporta = opciones.soportaDownload ?? 'download' in HTMLAnchorElement.prototype
  const href = url.createObjectURL(blob)
  setTimeout(() => url.revokeObjectURL(href), REVOCAR_MS)

  if (!soporta) {
    const abrir = opciones.abrir ?? ((u: string) => window.open(u, '_blank') ?? window.location.assign(u))
    abrir(href)
    return 'abierto'
  }
  const a = crearEnlace()
  a.href = href
  a.download = nombre
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  try {
    a.click()
  } finally {
    a.remove()
  }
  return 'descargado'
}
