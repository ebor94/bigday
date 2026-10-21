# Encuesta October Big Day

Encuesta web anónima y responsive sobre la experiencia del 2.º October Big Day (Parque de Vida Los Olivos, Serfunorte), con aves animadas.

Monorepo con npm workspaces:

- `shared/`: definición de preguntas y esquema zod.
- `api/`: API Express + mysql2.
- `web/`: front Vue 3 + Vite + TypeScript.

## Requisitos

- Node 20.19 o superior
- MySQL (para la API)

## Configuración

Copia `.env.example` a `.env` y completa los valores. Los secretos van solo en `.env`.

## Comandos

- `npm install`: instala dependencias de todos los paquetes.
- `npm run dev`: levanta API y web.
- `npm test`: pruebas Vitest en todos los paquetes.
- `npm run test:e2e`: pruebas Playwright.
- `npm run build`: compila todos los paquetes.
- `npm run lint`: ESLint sobre todo el repositorio.
