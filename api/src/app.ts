import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import helmet from 'helmet'
import type { Repositorio } from './db'
import { crearRouterRespuestas } from './routes/respuestas'

export interface Config {
  hashSalt: string
  corsOrigin: string
}

export interface Dependencias {
  repositorio: Repositorio
  config: Config
}

export function crearApp({ repositorio, config }: Dependencias) {
  const app = express()

  // La API corre detrás de Nginx: confiar en 1 salto para que req.ip sea la IP real
  // del visitante (X-Forwarded-For) y el rate limit y el hash funcionen por visitante.
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  app.use(helmet())
  // CORS solo para el origen configurado; cualquier otro no recibe cabeceras CORS.
  app.use(cors({ origin: (origen, cb) => cb(null, origen === config.corsOrigin ? origen : false) }))
  app.use(express.json({ limit: '10kb' }))

  app.get('/api/health', async (_req, res) => {
    try {
      await repositorio.ping()
      res.json({ estado: 'ok', bd: 'ok' })
    } catch (err) {
      console.error('Health: fallo el ping a la BD:', err instanceof Error ? err.message : 'desconocido')
      res.status(503).json({ estado: 'error', bd: 'error' })
    }
  })

  app.use('/api', crearRouterRespuestas(repositorio, config.hashSalt))

  const manejarErrores: ErrorRequestHandler = (err: { status?: number; type?: string }, _req, res, next) => {
    if (res.headersSent) {
      next(err)
      return
    }
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'La solicitud es demasiado grande.' })
    } else if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'JSON inválido.' })
    } else {
      console.error('Error no controlado:', err instanceof Error ? err.message : 'desconocido')
      res.status(500).json({ error: 'Error interno.' })
    }
  }
  app.use(manejarErrores)

  return app
}
