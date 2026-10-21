import { describe, expect, it } from 'vitest'
import { accionTecla, esCampoTexto, type TeclaInfo } from '../src/lib/atajos'

const tecla = (key: string, extra: Partial<TeclaInfo> = {}): TeclaInfo => ({
  key,
  enCampoTexto: false,
  enBoton: false,
  shift: false,
  modificador: false,
  ...extra,
})

describe('accionTecla en pregunta de opción única', () => {
  const ctx4 = { tipo: 'single', opciones: 4 } as const
  const ctx5 = { tipo: 'single', opciones: 5 } as const

  it('A–D (mayúscula o minúscula) eligen la opción por índice', () => {
    expect(accionTecla(tecla('a'), ctx4)).toEqual({ tipo: 'elegir', indice: 0 })
    expect(accionTecla(tecla('B'), ctx4)).toEqual({ tipo: 'elegir', indice: 1 })
    expect(accionTecla(tecla('d'), ctx4)).toEqual({ tipo: 'elegir', indice: 3 })
  })

  it('letras fuera del rango no hacen nada (E con 4 opciones sí con 5)', () => {
    expect(accionTecla(tecla('e'), ctx4)).toBeNull()
    expect(accionTecla(tecla('e'), ctx5)).toEqual({ tipo: 'elegir', indice: 4 })
    expect(accionTecla(tecla('z'), ctx5)).toBeNull()
  })

  it('1–5 eligen por índice; 0 y números fuera de rango no', () => {
    expect(accionTecla(tecla('1'), ctx5)).toEqual({ tipo: 'elegir', indice: 0 })
    expect(accionTecla(tecla('5'), ctx5)).toEqual({ tipo: 'elegir', indice: 4 })
    expect(accionTecla(tecla('5'), ctx4)).toBeNull()
    expect(accionTecla(tecla('0'), ctx5)).toBeNull()
  })

  it('Enter continúa y Escape vuelve atrás', () => {
    expect(accionTecla(tecla('Enter'), ctx4)).toEqual({ tipo: 'continuar' })
    expect(accionTecla(tecla('Escape'), ctx4)).toEqual({ tipo: 'atras' })
  })

  it('Enter sobre un botón se deja al navegador (activa el botón)', () => {
    expect(accionTecla(tecla('Enter', { enBoton: true }), ctx4)).toBeNull()
  })

  it('mientras se escribe en un campo ignora letras y números, pero Enter continúa y Escape vuelve', () => {
    const escribiendo = { enCampoTexto: true }
    expect(accionTecla(tecla('a', escribiendo), ctx5)).toBeNull()
    expect(accionTecla(tecla('3', escribiendo), ctx5)).toBeNull()
    expect(accionTecla(tecla('Enter', escribiendo), ctx5)).toEqual({ tipo: 'continuar' })
    expect(accionTecla(tecla('Escape', escribiendo), ctx5)).toEqual({ tipo: 'atras' })
  })

  it('con Ctrl/Cmd/Alt no intercepta nada (atajos del navegador)', () => {
    expect(accionTecla(tecla('a', { modificador: true }), ctx4)).toBeNull()
    expect(accionTecla(tecla('Enter', { modificador: true }), ctx4)).toBeNull()
  })
})

describe('accionTecla en la escala (NPS)', () => {
  const ctx = { tipo: 'scale', min: 1, max: 10 } as const

  it('1–9 dan ese valor y 0 equivale a 10', () => {
    expect(accionTecla(tecla('1'), ctx)).toEqual({ tipo: 'valor', valor: 1 })
    expect(accionTecla(tecla('9'), ctx)).toEqual({ tipo: 'valor', valor: 9 })
    expect(accionTecla(tecla('0'), ctx)).toEqual({ tipo: 'valor', valor: 10 })
  })

  it('las letras no hacen nada', () => {
    expect(accionTecla(tecla('a'), ctx)).toBeNull()
  })

  it('respeta min/max de la configuración', () => {
    expect(accionTecla(tecla('0'), { tipo: 'scale', min: 1, max: 5 })).toBeNull()
    expect(accionTecla(tecla('7'), { tipo: 'scale', min: 1, max: 5 })).toBeNull()
  })
})

describe('accionTecla en la pregunta abierta', () => {
  const ctx = { tipo: 'open' } as const

  it('Enter en el textarea continúa; Shift+Enter deja escribir un salto de línea', () => {
    expect(accionTecla(tecla('Enter', { enCampoTexto: true }), ctx)).toEqual({ tipo: 'continuar' })
    expect(accionTecla(tecla('Enter', { enCampoTexto: true, shift: true }), ctx)).toBeNull()
  })

  it('no hay atajos de opción', () => {
    expect(accionTecla(tecla('a'), ctx)).toBeNull()
    expect(accionTecla(tecla('1'), ctx)).toBeNull()
  })
})

describe('esCampoTexto', () => {
  it('reconoce input de texto, textarea y contenteditable', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    expect(esCampoTexto(input)).toBe(true)
    expect(esCampoTexto(textarea)).toBe(true)
    expect(esCampoTexto(editable)).toBe(true)
  })

  it('no considera campo de texto a botones, radios ni null', () => {
    const radio = document.createElement('input')
    radio.type = 'radio'
    expect(esCampoTexto(document.createElement('button'))).toBe(false)
    expect(esCampoTexto(radio)).toBe(false)
    expect(esCampoTexto(null)).toBe(false)
  })
})
