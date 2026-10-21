# Encuesta October Big Day

Encuesta web anónima y responsive sobre la experiencia del 2.º October Big Day (Parque de Vida Los Olivos, Serfunorte), con aves animadas.

Monorepo con npm workspaces:

- `shared/`: definición de preguntas y esquema zod.
- `web/`: front Vue 3 + Vite + TypeScript.

## Arquitectura

- Front (este repo): `web/` consume `shared/`.
- Backend: vive en el repo `ebor94/mantix`, módulo `src/bigday` (Express + MySQL). No está en este repo.
- `shared/src/survey.config.ts` es la única fuente de verdad de preguntas y esquema zod. El backend usa una copia generada y autocontenida (CommonJS, zod incluido) en `src/bigday/shared/survey.config.cjs`, con cabecera de aviso y el `sha256` de la fuente.

### Sincronizar con el backend

1. Clona `ebor94/mantix` junto a este repo (por defecto `../mantix-git`) o define `MANTIX_DIR` en `.env`/entorno.
2. Tras cualquier cambio en `shared/src/survey.config.ts`: `npm run sync:backend` y commitea el archivo generado en Mantix.
3. `npm run sync:backend -- --check` comprueba que la copia esté al día. El test de contrato (`shared/test/contrato-backend.test.ts`) hace lo mismo y además carga la copia; se omite si el archivo no existe.

## Requisitos

- Node 20.19 o superior

## Configuración

Copia `.env.example` a `.env` y completa los valores. Los secretos van solo en `.env`.

## Comandos

- `npm install`: instala dependencias de todos los paquetes.
- `npm run dev`: levanta el front (web).
- `npm run sync:backend`: genera la copia del esquema para el backend de Mantix (ver Arquitectura).
- `npm run sync:backend -- --check`: verifica sin escribir que la copia del backend está al día (sale con código distinto de 0 si no).
- `npm test`: pruebas Vitest en todos los paquetes.
- `npm run test:e2e`: pruebas Playwright.
- `npm run build`: compila todos los paquetes.
- `npm run lint`: ESLint sobre todo el repositorio.
