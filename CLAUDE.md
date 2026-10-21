# CLAUDE.md — Encuesta October Big Day

## Contexto
Encuesta web de experiencia del 2.º October Big Day (Parque de Vida Los Olivos, Serfunorte). Anónima, responsive, con aves animadas. Spec: `docs/superpowers/specs/2026-10-20-october-bigday-encuesta-design.md`. Plan: `docs/superpowers/plans/2026-10-20-october-bigday-encuesta.md`.

## Reglas del proyecto
- Idioma de la UI, comentarios y commits: **español**.
- Textos de las preguntas: **literales** de la spec §6. No reescribirlos.
- Se guardan **códigos**, nunca los textos, en la BD.
- La definición de preguntas y el esquema zod viven SOLO en `shared/`; el front importa de ahí. El backend (módulo `src/bigday` de `ebor94/mantix`, clonado en `../mantix-git`) usa una copia **generada** con `npm run sync:backend`; nunca se edita a mano y un test de contrato detecta desincronización.
- Backend: CommonJS + Jest, rutas bajo `/api/bigday/v1`, tabla `bigday_respuestas` en la base `serfuweb`. Trabajar en la rama `feature/bigday` de `mantix-git`; no hacer push sin autorización.
- Animaciones solo con `transform` y `opacity`. Respetar siempre `prefers-reduced-motion`.
- Las aves son SVG originales. No usar ilustraciones, personajes ni assets de terceros.
- Nunca guardar IP ni user-agent en claro. Secretos solo en `.env`.
- TDD para toda lógica (shared, api, composables). Los componentes visuales se verifican con capturas Playwright a 375 px y 1440 px.
- No marcar una tarea como terminada sin ejecutar sus pruebas y mostrar la salida.

## Comandos
- `npm run dev` — API + web
- `npm test` — Vitest en todos los paquetes
- `npm run test:e2e` — Playwright
- `npm run build`
