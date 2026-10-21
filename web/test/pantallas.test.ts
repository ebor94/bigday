import { describe, expect, it } from 'vitest'
import { QUESTIONS } from '@bigday/shared'
import { modoGracias, pantallaDe } from '../src/lib/pantallas'

describe('pantallaDe', () => {
  it('bienvenida y gracias son pantallas propias', () => {
    expect(pantallaDe('bienvenida')).toEqual({ tipo: 'bienvenida' })
    expect(pantallaDe('gracias')).toEqual({ tipo: 'gracias' })
  })

  it('cada pregunta va a su componente según el tipo de QUESTIONS', () => {
    const tipos = QUESTIONS.map((q) => pantallaDe(q.id).tipo)
    expect(tipos).toEqual(['opcion', 'opcion', 'opcion', 'opcion', 'opcion', 'escala', 'abierta'])
  })

  it('entrega la pregunta de shared (no una copia con textos propios)', () => {
    const p = pantallaDe('p3')
    expect(p.tipo === 'opcion' && p.pregunta).toBe(QUESTIONS[2])
  })
})

describe('modoGracias', () => {
  const base = { regreso: false, enviando: false, resultado: null, yaRespondio: false, pendientes: 0, descartadas: 0 }

  it('mientras se envía', () => {
    expect(modoGracias({ ...base, enviando: true })).toBe('enviando')
  })

  it('refleja el resultado del envío', () => {
    expect(modoGracias({ ...base, resultado: { estado: 'enviada' }, yaRespondio: true })).toBe('enviada')
    expect(modoGracias({ ...base, resultado: { estado: 'pendiente' }, pendientes: 1 })).toBe('pendiente')
    expect(modoGracias({ ...base, resultado: { estado: 'rechazada', mensaje: 'x' } })).toBe('rechazada')
  })

  it('una pendiente que luego se envía en segundo plano pasa a enviada', () => {
    expect(modoGracias({ ...base, resultado: { estado: 'pendiente' }, pendientes: 0, yaRespondio: true })).toBe('enviada')
  })

  it('al volver: pendiente si quedan en la bandeja; si no, "ya respondiste"', () => {
    expect(modoGracias({ ...base, regreso: true, pendientes: 1 })).toBe('pendiente_regreso')
    expect(modoGracias({ ...base, regreso: true, yaRespondio: true })).toBe('ya_respondiste')
  })

  it('al volver, si la respuesta guardada fue rechazada al reintentar: no dice "ya respondiste"', () => {
    expect(modoGracias({ ...base, regreso: true, descartadas: 1 })).toBe('no_registrada')
    // aunque hubiera una respuesta anterior aceptada, lo último que pasó fue un rechazo
    expect(modoGracias({ ...base, regreso: true, yaRespondio: true, descartadas: 1 })).toBe('no_registrada')
    // mientras quede algo en la bandeja sigue "enviándose"
    expect(modoGracias({ ...base, regreso: true, pendientes: 1, descartadas: 1 })).toBe('pendiente_regreso')
  })

  it('en la misma visita, una pendiente rechazada en segundo plano tampoco se presenta como enviada', () => {
    expect(modoGracias({ ...base, resultado: { estado: 'pendiente' }, pendientes: 0, descartadas: 1 })).toBe('no_registrada')
  })
})
