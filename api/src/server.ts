import 'dotenv/config'
import { crearApp } from './app'
import { crearPool, crearRepositorioMysql } from './db'

const REQUERIDAS = ['HASH_SALT', 'CORS_ORIGIN', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const

const faltan = REQUERIDAS.filter((k) => !process.env[k])
if (faltan.length > 0) {
  console.error(`Configuración incompleta: faltan variables de entorno en .env: ${faltan.join(', ')}`)
  process.exit(1)
}
const env = (k: (typeof REQUERIDAS)[number]) => process.env[k] as string

const pool = crearPool({
  host: env('DB_HOST'),
  port: Number(process.env.DB_PORT) || 3306,
  user: env('DB_USER'),
  password: env('DB_PASSWORD'),
  database: env('DB_NAME'),
})

const app = crearApp({
  repositorio: crearRepositorioMysql(pool),
  config: { hashSalt: env('HASH_SALT'), corsOrigin: env('CORS_ORIGIN') },
})

const puerto = Number(process.env.PORT) || 3000
app.listen(puerto, () => {
  console.log(`API escuchando en el puerto ${puerto}`)
})
