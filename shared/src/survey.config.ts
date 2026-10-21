import { z } from 'zod'

// Fuente única de verdad de la encuesta: front y back importan de aquí.
// Se guardan códigos, nunca los textos (spec §6).

// Los enunciados (`title`) son literales de la spec §6 "Enunciados" (aportados por Edwin el 2026-10-21).

export const QUESTIONS = [
  {
    id: 'p1',
    title:
      'Antes de participar en el October Big Day, ¿cuál de las siguientes afirmaciones describe mejor lo que sabes sobre la biodiversidad de Los Olivos?',
    type: 'single',
    required: true,
    allowOther: false,
    options: [
      { code: 'A', label: 'No sabía que en Los Olivos habitaban diferentes especies de aves y otros animales.' },
      { code: 'B', label: 'Sabía que había aves y otros animales, pero desconocía la diversidad de especies.' },
      { code: 'C', label: 'Sabía que Los Olivos tenía una importante diversidad de aves y conocía algunos ejemplos.' },
      { code: 'D', label: 'Ya conocía los registros científicos de biodiversidad de Los Olivos.' },
    ],
  },
  {
    id: 'p2',
    title:
      'Antes de participar en el evento, ¿con qué asociabas a Los Olivos?',
    type: 'single',
    required: true,
    allowOther: false,
    options: [
      { code: 'cementerio', label: 'Un parque cementerio.' },
      { code: 'naturaleza', label: 'Un espacio de naturaleza y biodiversidad.' },
      { code: 'ambas', label: 'Ambas cosas.' },
      { code: 'no_conocia', label: 'No conocía Los Olivos.' },
    ],
  },
  {
    id: 'p3',
    title:
      'Después de vivir esta experiencia, ¿con qué asocias ahora a Los Olivos?',
    type: 'single',
    required: true,
    allowOther: true,
    options: [
      { code: 'memoria', label: 'Un lugar de memoria y homenaje.' },
      { code: 'parque_vida', label: 'Un Parque de Vida con biodiversidad.' },
      { code: 'ambas', label: 'Ambas cosas: memoria, naturaleza y vida.' },
      { code: 'sin_cambio', label: 'Mi percepción no cambió.' },
      { code: 'otro', label: 'Otro' },
    ],
  },
  {
    id: 'p4',
    title:
      '¿Qué fue lo que más te sorprendió o aprendiste durante el evento?',
    type: 'single',
    required: true,
    allowOther: true,
    options: [
      { code: 'diversidad', label: 'La diversidad de aves y otras especies presentes.' },
      { code: 'cientifico', label: 'El trabajo científico de registro y conservación.' },
      { code: 'actividades', label: 'Las actividades artísticas y educativas.' },
      { code: 'relacion', label: 'La relación entre Los Olivos y la naturaleza.' },
      { code: 'otro', label: 'Otro' },
    ],
  },
  {
    id: 'p5',
    title:
      'Después de participar en el October Big Day, ¿qué aprendiste sobre la biodiversidad de Los Olivos?',
    type: 'single',
    required: true,
    allowOther: false,
    options: [
      { code: 'A', label: 'Descubrí que en Los Olivos habitan diferentes especies de aves y otros animales.' },
      { code: 'B', label: 'Aprendí sobre la diversidad de especies y conocí ejemplares que no sabía que existían aquí.' },
      { code: 'C', label: 'Comprendí mejor la importancia del registro científico y la conservación de la biodiversidad.' },
      { code: 'D', label: 'Amplié conocimientos que ya tenía sobre la biodiversidad de Los Olivos.' },
    ],
  },
  {
    id: 'p6',
    title:
      'En una escala de 1 a 10, ¿qué tan probable es que recomiendes el October Big Day de Los Olivos a tus familiares o amigos?',
    type: 'scale',
    required: true,
    allowOther: false,
    min: 1,
    max: 10,
    minLabel: 'Nada probable',
    maxLabel: 'Muy probable',
  },
  {
    id: 'p7',
    title:
      'En una frase, ¿qué le contarías a alguien para animarlo a conocer Parque de Vida Los Olivos?',
    type: 'open',
    required: true,
    allowOther: false,
    minLength: 10,
    maxLength: 280,
  },
] as const

type Pregunta = (typeof QUESTIONS)[number]
type PreguntaUnica = Extract<Pregunta, { type: 'single' }>
type IdUnica = PreguntaUnica['id']

export const OTRO_MAX = 120

/** Códigos permitidos de una pregunta única, derivados de QUESTIONS. */
function codigosDe<I extends IdUnica>(id: I) {
  const pregunta = QUESTIONS.find((q) => q.id === id) as Extract<PreguntaUnica, { id: I }>
  return pregunta.options.map((o) => o.code) as unknown as [
    Extract<PreguntaUnica, { id: I }>['options'][number]['code'],
    ...Extract<PreguntaUnica, { id: I }>['options'][number]['code'][],
  ]
}

const p6 = QUESTIONS.find((q) => q.id === 'p6') as Extract<Pregunta, { id: 'p6' }>
const p7 = QUESTIONS.find((q) => q.id === 'p7') as Extract<Pregunta, { id: 'p7' }>

const textoOtro = z.string().trim().max(OTRO_MAX, `Máximo ${OTRO_MAX} caracteres`).optional()

export const respuestaSchema = z
  .object({
    uuid: z.uuid('UUID inválido'),
    p1: z.enum(codigosDe('p1'), 'Opción inválida'),
    p2: z.enum(codigosDe('p2'), 'Opción inválida'),
    p3: z.enum(codigosDe('p3'), 'Opción inválida'),
    p3_otro: textoOtro,
    p4: z.enum(codigosDe('p4'), 'Opción inválida'),
    p4_otro: textoOtro,
    p5: z.enum(codigosDe('p5'), 'Opción inválida'),
    p6: z
      .number('Debe ser un número')
      .int('Debe ser un entero')
      .min(p6.min, `Mínimo ${p6.min}`)
      .max(p6.max, `Máximo ${p6.max}`),
    p7: z
      .string('Debe ser texto')
      .trim()
      .min(p7.minLength, `Mínimo ${p7.minLength} caracteres`)
      .max(p7.maxLength, `Máximo ${p7.maxLength} caracteres`),
    origen: z.string().max(40, 'Máximo 40 caracteres').optional(),
    // La regla anti-bot (>= 8 s) la aplica la API, no este esquema.
    duracion_seg: z.number().int('Debe ser un entero').nonnegative('No puede ser negativa').optional(),
    // Honeypot: un humano nunca lo rellena.
    website: z.literal('', 'Campo no permitido').optional(),
  })
  .superRefine((r, ctx) => {
    for (const campo of ['p3', 'p4'] as const) {
      const clave = `${campo}_otro` as const
      const texto = r[clave] ?? ''
      if (r[campo] === 'otro' && texto === '') {
        ctx.addIssue({ code: 'custom', path: [clave], message: 'Escribe tu respuesta en "Otro"' })
      } else if (r[campo] !== 'otro' && texto !== '') {
        ctx.addIssue({ code: 'custom', path: [clave], message: 'Texto "Otro" sin haber elegido "Otro"' })
      }
    }
  })

export type Respuesta = z.infer<typeof respuestaSchema>

/** Texto literal de un código (para el CSV). Si no se conoce, devuelve el código tal cual. */
export function labelFor(questionId: string, code: string | number): string {
  const pregunta = QUESTIONS.find((q) => q.id === questionId)
  if (pregunta?.type === 'single') {
    const opcion = pregunta.options.find((o) => o.code === code)
    if (opcion) return opcion.label
  }
  return String(code)
}
