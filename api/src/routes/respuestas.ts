import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { respuestaSchema } from '@bigday/shared'
import type { Repositorio } from '../db'
import { hashConSal } from '../services/hash'

const DURACION_MIN_SEG = 8
const MSG_GENERICO = 'No se pudo registrar la respuesta.'

export function crearRouterRespuestas(repositorio: Repositorio, hashSalt: string): Router {
  const router = Router()

  // 10 peticiones por IP cada 10 minutos (req.ip depende de `trust proxy`, ver app.ts).
  const limitador = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Inténtalo de nuevo en unos minutos.' },
  })

  router.post('/respuestas', limitador, async (req, res) => {
    const cuerpo: unknown = req.body

    // Anti-bot ANTES de zod: la respuesta es genérica y no revela la regla.
    const crudo = (cuerpo ?? {}) as Record<string, unknown>
    const honeypotLleno = typeof crudo.website === 'string' && crudo.website !== ''
    const duracion = crudo.duracion_seg
    const muyRapido = typeof duracion !== 'number' || !(duracion >= DURACION_MIN_SEG)
    if (honeypotLleno || muyRapido) {
      res.status(400).json({ error: MSG_GENERICO })
      return
    }

    const parseo = respuestaSchema.safeParse(cuerpo)
    if (!parseo.success) {
      res.status(400).json({
        error: 'Datos inválidos.',
        detalles: parseo.error.issues.map((i) => ({
          campo: i.path.join('.') || 'cuerpo',
          mensaje: i.message,
        })),
      })
      return
    }
    const r = parseo.data

    const ua = req.get('user-agent')
    try {
      const resultado = await repositorio.guardar({
        uuid: r.uuid,
        p1: r.p1,
        p2: r.p2,
        p3: r.p3,
        p3_otro: r.p3_otro ? r.p3_otro : null,
        p4: r.p4,
        p4_otro: r.p4_otro ? r.p4_otro : null,
        p5: r.p5,
        p6: r.p6,
        p7: r.p7,
        origen: r.origen ? r.origen : null,
        duracion_seg: r.duracion_seg ?? null,
        ip_hash: req.ip ? hashConSal(req.ip, hashSalt) : null,
        ua_hash: ua ? hashConSal(ua, hashSalt) : null,
      })
      if (resultado === 'creada') res.status(201).json({ ok: true })
      else res.status(200).json({ ok: true, duplicada: true })
    } catch (err) {
      // Solo el mensaje del error: sin IP, cuerpo ni user-agent.
      console.error('Error al guardar respuesta:', err instanceof Error ? err.message : 'desconocido')
      res.status(500).json({ error: 'No se pudo guardar la respuesta. Inténtalo de nuevo.' })
    }
  })

  return router
}
