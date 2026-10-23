import { afterEach, describe, expect, it, vi } from 'vitest'
import { NOMBRE_CSV, guardarArchivo } from '../src/resultados/lib/descarga'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

function entorno(soportaDownload: boolean) {
  const clics: { href: string; download: string; enDom: boolean }[] = []
  const abrir = vi.fn(() => ({}) as Window)
  const url = {
    createObjectURL: vi.fn(() => 'blob:https://x/123'),
    revokeObjectURL: vi.fn(),
  }
  const crearEnlace = () => {
    const a = document.createElement('a')
    a.click = () => clics.push({ href: a.href, download: a.download, enDom: document.body.contains(a) })
    return a
  }
  return { clics, abrir, url, opciones: { url, abrir, crearEnlace, soportaDownload } }
}

describe('guardarArchivo', () => {
  it('nombre por defecto bigday-respuestas.csv', () => {
    expect(NOMBRE_CSV).toBe('bigday-respuestas.csv')
  })

  it('con soporte de download: enlace temporal con blob URL y nombre; revoca la URL más tarde', () => {
    vi.useFakeTimers()
    const e = entorno(true)
    const r = guardarArchivo(new Blob(['a,b']), NOMBRE_CSV, e.opciones)
    expect(r).toBe('descargado')
    expect(e.clics).toEqual([{ href: 'blob:https://x/123', download: NOMBRE_CSV, enDom: true }])
    expect(document.querySelectorAll('a')).toHaveLength(0)
    expect(e.url.revokeObjectURL).not.toHaveBeenCalled() // Safari necesita la URL viva un rato
    vi.advanceTimersByTime(60_000)
    expect(e.url.revokeObjectURL).toHaveBeenCalledWith('blob:https://x/123')
    expect(e.abrir).not.toHaveBeenCalled()
  })

  it('sin soporte de download (Safari antiguo): abre la blob URL', () => {
    const e = entorno(false)
    expect(guardarArchivo(new Blob(['a,b']), NOMBRE_CSV, e.opciones)).toBe('abierto')
    expect(e.abrir).toHaveBeenCalledWith('blob:https://x/123')
    expect(e.clics).toEqual([])
  })
})
