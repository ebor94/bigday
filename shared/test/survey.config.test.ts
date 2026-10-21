import { describe, expect, it } from 'vitest'
import { QUESTIONS, labelFor, respuestaSchema } from '../src/survey.config'

const valida = {
  uuid: '3b241101-e2bb-4255-8caf-4136c566a962',
  p1: 'A',
  p2: 'cementerio',
  p3: 'memoria',
  p4: 'diversidad',
  p5: 'B',
  p6: 8,
  p7: 'Me encantó descubrir tantas aves.',
}

const codigos = (id: string) =>
  QUESTIONS.flatMap((q) => (q.id === id && q.type === 'single' ? q.options.map((o) => o.code) : []))

describe('QUESTIONS', () => {
  it('tiene los códigos exactos de la spec §6, en orden', () => {
    expect(QUESTIONS.map((q) => q.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'])
    expect(codigos('p1')).toEqual(['A', 'B', 'C', 'D'])
    expect(codigos('p2')).toEqual(['cementerio', 'naturaleza', 'ambas', 'no_conocia'])
    expect(codigos('p3')).toEqual(['memoria', 'parque_vida', 'ambas', 'sin_cambio', 'otro'])
    expect(codigos('p4')).toEqual(['diversidad', 'cientifico', 'actividades', 'relacion', 'otro'])
    expect(codigos('p5')).toEqual(['A', 'B', 'C', 'D'])
  })

  it('tiene los enunciados literales de la spec §6 "Enunciados"', () => {
    expect(QUESTIONS.map((q) => q.title)).toEqual([
      'Antes de participar en el October Big Day, ¿cuál de las siguientes afirmaciones describe mejor lo que sabes sobre la biodiversidad de Los Olivos?',
      'Antes de participar en el evento, ¿con qué asociabas a Los Olivos?',
      'Después de vivir esta experiencia, ¿con qué asocias ahora a Los Olivos?',
      '¿Qué fue lo que más te sorprendió o aprendiste durante el evento?',
      'Después de participar en el October Big Day, ¿qué aprendiste sobre la biodiversidad de Los Olivos?',
      'En una escala de 1 a 10, ¿qué tan probable es que recomiendes el October Big Day de Los Olivos a tus familiares o amigos?',
      'En una frase, ¿qué le contarías a alguien para animarlo a conocer Parque de Vida Los Olivos?',
    ])
  })

  it('solo p3 y p4 permiten "otro"', () => {
    expect(QUESTIONS.filter((q) => q.allowOther).map((q) => q.id)).toEqual(['p3', 'p4'])
  })
})

describe('respuestaSchema', () => {
  const parse = (extra: Record<string, unknown>) => respuestaSchema.safeParse({ ...valida, ...extra })

  it('acepta una respuesta válida', () => {
    expect(respuestaSchema.safeParse(valida).success).toBe(true)
  })

  it('acepta campos opcionales y recorta p7', () => {
    const r = parse({ origen: 'qr-entrada', duracion_seg: 45, website: '', p7: '   Muy buena experiencia   ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.p7).toBe('Muy buena experiencia')
  })

  it('rechaza p1 fuera de las opciones', () => {
    expect(parse({ p1: 'E' }).success).toBe(false)
  })

  it('rechaza p6 = 0 y p6 = 11', () => {
    expect(parse({ p6: 0 }).success).toBe(false)
    expect(parse({ p6: 11 }).success).toBe(false)
  })

  it('rechaza p7 de 9 caracteres y acepta 10', () => {
    expect(parse({ p7: '123456789' }).success).toBe(false)
    expect(parse({ p7: '1234567890' }).success).toBe(true)
  })

  it('rechaza p7 de solo espacios y de más de 280', () => {
    expect(parse({ p7: ' '.repeat(20) }).success).toBe(false)
    expect(parse({ p7: 'a'.repeat(281) }).success).toBe(false)
  })

  it('rechaza p3 = otro sin p3_otro (o solo espacios)', () => {
    expect(parse({ p3: 'otro' }).success).toBe(false)
    expect(parse({ p3: 'otro', p3_otro: '   ' }).success).toBe(false)
  })

  it('rechaza p4 = otro sin p4_otro', () => {
    expect(parse({ p4: 'otro' }).success).toBe(false)
  })

  it('acepta p3 = otro con texto', () => {
    expect(parse({ p3: 'otro', p3_otro: 'Un refugio' }).success).toBe(true)
  })

  it('rechaza p3_otro de más de 120 caracteres', () => {
    expect(parse({ p3: 'otro', p3_otro: 'a'.repeat(121) }).success).toBe(false)
    expect(parse({ p3: 'otro', p3_otro: 'a'.repeat(120) }).success).toBe(true)
  })

  it('rechaza texto "otro" cuando la opción elegida no es otro', () => {
    expect(parse({ p3: 'memoria', p3_otro: 'algo' }).success).toBe(false)
    expect(parse({ p4: 'diversidad', p4_otro: 'algo' }).success).toBe(false)
  })

  it('rechaza website (honeypot) no vacío', () => {
    expect(parse({ website: 'http://spam.example' }).success).toBe(false)
  })

  it('rechaza uuid inválido y duracion_seg negativa o decimal', () => {
    expect(parse({ uuid: 'no-es-uuid' }).success).toBe(false)
    expect(parse({ duracion_seg: -1 }).success).toBe(false)
    expect(parse({ duracion_seg: 1.5 }).success).toBe(false)
  })
})

describe('labelFor', () => {
  it('devuelve el texto literal de un código conocido', () => {
    expect(labelFor('p2', 'ambas')).toBe('Ambas cosas.')
  })

  it('devuelve el código tal cual si no se conoce', () => {
    expect(labelFor('p2', 'zzz')).toBe('zzz')
    expect(labelFor('p99', 'A')).toBe('A')
  })

  it('devuelve el valor como cadena para p6 y p7', () => {
    expect(labelFor('p6', 7)).toBe('7')
    expect(labelFor('p7', 'hola')).toBe('hola')
  })
})
