// Token de resultados en sessionStorage: sobrevive a una recarga en la misma pestaña y se borra al
// cerrarla o con "Salir". Todo acceso va en try/catch; si el almacén falla, el token vive en memoria.

export const CLAVE_TOKEN = 'bigday:resultados-token'

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface Sesion {
  leer(): string | null
  guardar(token: string): void
  borrar(): void
}

function almacenPorDefecto(): Almacen | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

export function crearSesion(almacen: Almacen | null = almacenPorDefecto()): Sesion {
  let memoria: string | null = null
  return {
    leer() {
      let valor = memoria
      try {
        valor = almacen?.getItem(CLAVE_TOKEN) ?? memoria
      } catch {
        // almacén bloqueado: se usa la memoria
      }
      return valor && valor.trim() ? valor : null
    },
    guardar(token) {
      memoria = token
      try {
        almacen?.setItem(CLAVE_TOKEN, token)
      } catch {
        // sin almacén: queda solo en memoria
      }
    },
    borrar() {
      memoria = null
      try {
        almacen?.removeItem(CLAVE_TOKEN)
      } catch {
        // nada que borrar
      }
    },
  }
}
