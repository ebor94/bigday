import { describe, expect, it } from 'vitest'
import { CLAVE_TOKEN, crearSesion } from '../src/resultados/lib/sesion'

function almacen() {
  const datos = new Map<string, string>()
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  }
}

const roto = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceeded')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

describe('crearSesion', () => {
  it('guarda, lee y borra el token en el almacén de sesión', () => {
    const a = almacen()
    const s = crearSesion(a)
    expect(s.leer()).toBeNull()
    s.guardar('abc')
    expect(a.datos.get(CLAVE_TOKEN)).toBe('abc')
    expect(crearSesion(a).leer()).toBe('abc') // "recarga" en la misma pestaña
    s.borrar()
    expect(a.datos.has(CLAVE_TOKEN)).toBe(false)
    expect(s.leer()).toBeNull()
  })

  it('funciona en memoria si el almacén lanza o no existe', () => {
    for (const st of [roto, null]) {
      const s = crearSesion(st)
      expect(s.leer()).toBeNull()
      s.guardar('xyz')
      expect(s.leer()).toBe('xyz')
      s.borrar()
      expect(s.leer()).toBeNull()
    }
  })

  it('un valor vacío guardado cuenta como sin sesión', () => {
    const a = almacen()
    a.datos.set(CLAVE_TOKEN, '   ')
    expect(crearSesion(a).leer()).toBeNull()
  })
})
