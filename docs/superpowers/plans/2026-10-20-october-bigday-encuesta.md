# Encuesta October Big Day — Plan de implementación

> **Para Claude Code:** REQUIRED SUB-SKILL: usar `superpowers:executing-plans` (o `superpowers:subagent-driven-development`) para ejecutar este plan tarea por tarea. Aplicar `superpowers:test-driven-development` en cada tarea con lógica y `superpowers:verification-before-completion` antes de marcar cualquier tarea como terminada.

**Objetivo:** Encuesta web responsive y animada (aves volando) para medir satisfacción y cambio de percepción del 2.º October Big Day, con API Node + MySQL y resultados agregados.

**Arquitectura:** Monorepo con dos paquetes (`web/` Vue 3 + Vite + TS, `api/` Express + mysql2) y un paquete compartido `shared/` con la definición de preguntas y el esquema zod, usado por ambos para que la validación sea idéntica en cliente y servidor.

**Stack:** Vue 3, Vite, TypeScript, GSAP, Express, mysql2, zod, Vitest, Supertest, Playwright, MySQL 8, Nginx, PM2.

**Spec de referencia:** `docs/superpowers/specs/2026-10-20-october-bigday-encuesta-design.md` — leerla completa antes de empezar. Ante cualquier duda de diseño, la spec manda.

---

## Estructura objetivo

```
october-bigday-encuesta/
├─ package.json                 # workspaces: shared, api, web
├─ shared/
│  └─ src/survey.config.ts      # preguntas, códigos, esquema zod
├─ api/
│  ├─ src/{app.ts,server.ts,db.ts,routes/,services/}
│  ├─ sql/001_init.sql
│  └─ test/
├─ web/
│  ├─ public/img/mosquero.webp  # recorte del afiche (lo aporta Edwin)
│  ├─ src/
│  │  ├─ styles/{tokens.css,base.css,watercolor.css}
│  │  ├─ components/{BirdSprite.vue,BirdLayer.vue,BranchProgress.vue,
│  │  │              ChoiceQuestion.vue,NpsQuestion.vue,OpenQuestion.vue,
│  │  │              WelcomeScreen.vue,ThanksScreen.vue,QuestionCard.vue}
│  │  ├─ composables/{useSurvey.ts,useBirds.ts,useReducedMotion.ts,useOutbox.ts}
│  │  └─ App.vue
│  └─ e2e/
└─ deploy/{nginx.conf,ecosystem.config.cjs,README.md}
```

---

### Tarea 1: Andamiaje del monorepo

**Archivos:** `package.json`, `tsconfig.base.json`, `.editorconfig`, `.gitignore`, `.env.example`, `README.md`

1. `git init`, npm workspaces (`shared`, `api`, `web`), TypeScript estricto compartido.
2. Scripts raíz: `dev` (api + web en paralelo con `concurrently`), `test`, `test:e2e`, `build`, `lint`.
3. `.env.example` con `DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, RESULTS_TOKEN, HASH_SALT, CORS_ORIGIN, PORT`.
4. Verificar: `npm install` y `npm run lint` sin errores.
5. Commit: `chore: andamiaje monorepo`.

### Tarea 2: Configuración compartida de la encuesta (TDD)

**Archivos:** `shared/src/survey.config.ts`, `shared/test/survey.config.test.ts`

1. **Test primero:** el esquema `respuestaSchema` acepta una respuesta válida; rechaza `p1='E'`, `p6=0`, `p6=11`, `p7` de 9 caracteres, `p3='otro'` sin `p3_otro`, `p3_otro` con > 120 caracteres, y `website` (honeypot) no vacío.
2. Ver el test fallar.
3. Implementar `QUESTIONS` (textos literales de la spec §6, con `code`, `label`, `type`, `allowOther`) y `respuestaSchema` (zod) con `superRefine` para las reglas de "Otro".
4. Exportar helper `labelFor(questionId, code)` para el CSV.
5. Tests en verde. Commit: `feat(shared): definición de preguntas y validación`.

> **Pausa de decisión:** antes de la Tarea 3, preguntar a Edwin si la tabla va en base nueva `bigday` (por defecto) o dentro de `serfuweb`.

### Tarea 3: Esquema MySQL

**Archivos:** `api/sql/001_init.sql`, `api/sql/002_vista_superset.sql`

1. Tabla `bigday_respuestas` exactamente como la spec §7.
2. Vista `vw_bigday_resumen` con `nps_grupo` y `cambio_percepcion` (`CONCAT(p2,'→',p3)`).
3. Script de usuario de BD con privilegios mínimos (comentado, para que Edwin lo ejecute).
4. Verificar contra un MySQL 8 local en Docker (`docker run mysql:8`), aplicar scripts sin error.
5. Commit: `feat(db): tabla de respuestas y vista para Superset`.

### Tarea 4: API — POST /api/respuestas (TDD)

**Archivos:** `api/src/app.ts`, `api/src/db.ts`, `api/src/routes/respuestas.ts`, `api/src/services/hash.ts`, `api/test/respuestas.test.ts`

1. **Tests primero (Supertest, BD de prueba o repositorio en memoria inyectado):**
   - 201 con respuesta válida, guarda códigos.
   - 200 sin duplicar si se reenvía el mismo `uuid`.
   - 400 con errores de zod legibles.
   - 400 si `duracion_seg < 8` o honeypot lleno (respuesta genérica, sin revelar la regla).
   - 429 tras superar el rate limit.
   - La IP nunca se guarda en claro (se guarda SHA-256 con sal).
2. Implementar con `helmet`, CORS desde `CORS_ORIGIN`, `express.json({ limit: '10kb' })`, `INSERT ... ON DUPLICATE KEY UPDATE id=id`.
3. `GET /api/health` con ping a BD.
4. Tests en verde. Commit: `feat(api): registro de respuestas`.

### Tarea 5: API — resultados y CSV (TDD)

**Archivos:** `api/src/routes/resultados.ts`, `api/src/services/stats.ts`, `api/test/resultados.test.ts`

1. **Tests primero:** 401 sin token; cálculo de NPS con datos conocidos (p. ej. 5 promotores, 3 pasivos, 2 detractores → NPS 30); distribución por pregunta; matriz P2×P3; CSV con encabezados legibles y escape correcto de comas/comillas/saltos de línea en P7.
2. Implementar `stats.ts` como funciones puras (testeables sin BD) y la ruta que las alimenta.
3. Tests en verde. Commit: `feat(api): resultados agregados y exportación CSV`.

### Tarea 6: Base visual — tokens, tipografía, fondo acuarela

**Archivos:** `web/` (Vite + Vue + TS), `web/src/styles/*.css`, `web/index.html`

1. Crear app Vite; cargar Fredoka y Nunito.
2. `tokens.css` con la paleta exacta de la spec §4.
3. Fondo acuarela: capas de degradados radiales difuminados + filtro SVG `feTurbulence` como textura de papel; follaje en esquinas como SVG con parallax ligero (pointer en escritorio, scroll en móvil).
4. Estilo de `QuestionCard` (glass claro, radios orgánicos, sombra suave).
5. **Verificación visual:** levantar `npm run dev`, capturar a 375 px y 1440 px con Playwright y revisar contra el afiche que no haya contraste insuficiente ni scroll horizontal.
6. Commit: `feat(web): identidad visual base`.

### Tarea 7: Sistema de aves animadas

**Archivos:** `BirdSprite.vue`, `BirdLayer.vue`, `useBirds.ts`, `useReducedMotion.ts`, tests unitarios de `useBirds`

1. **Test primero (`useBirds`):** nunca supera 12 aves activas; `launchFlock(origin, n)` crea `n` aves con trayectorias que salen del viewport; con reduced-motion no programa vuelos; se pausa con `document.hidden`.
2. `BirdSprite.vue`: SVG original (cuerpo + ala en `<g>` aparte), aleteo con keyframes en `transform`, prop de color (`teal`, `vermilion`, `mustard`).
3. `BirdLayer.vue`: capa `position: fixed; pointer-events: none`; vuelos ambientales cada 8–15 s con curvas aleatorias (Web Animations API u `offset-path`), escala/velocidad variables para profundidad.
4. API pública del composable: `launchFlock(fromElement, count)` para reaccionar a respuestas; `perchAt(element)` para posar un ave (NPS, progreso).
5. Revisar en DevTools Performance que solo hay composición (sin layout/paint por frame).
6. Commit: `feat(web): aves animadas con soporte reduced-motion`.

### Tarea 8: Lógica de la encuesta y envío (TDD)

**Archivos:** `useSurvey.ts`, `useOutbox.ts`, tests

1. **Tests primero:** navegación siguiente/atrás; no avanza si la pregunta obligatoria está vacía; "Otro" exige texto; mide `duracion_seg`; genera `uuid` una sola vez; lee `?src=` como `origen`; `useOutbox` guarda en `localStorage` si el POST falla y reintenta al montar; marca "ya respondió" tras éxito.
2. Implementar reutilizando `respuestaSchema` de `shared` para validar antes de enviar.
3. Tests en verde. Commit: `feat(web): estado de la encuesta y envío con reintento`.

### Tarea 9: Pantallas y componentes de pregunta

**Archivos:** `WelcomeScreen.vue`, `ChoiceQuestion.vue`, `NpsQuestion.vue`, `OpenQuestion.vue`, `BranchProgress.vue`, `ThanksScreen.vue`, `App.vue`

1. Bienvenida con hero del mosquero (si `public/img/mosquero.webp` no existe aún, usar un `BirdSprite` grande como placeholder y dejar TODO visible en el README), texto de introducción y aviso de anonimato.
2. `ChoiceQuestion`: tarjetas grandes, atajos A–D / 1–5, microanimación de selección, avance automático 600 ms (salvo "Otro"), campo "Otro" con foco automático.
3. `NpsQuestion`: 10 botones (2 filas en móvil), gradiente rojo→ámbar→verde, `perchAt` sobre el número elegido, etiquetas de extremos.
4. `OpenQuestion`: textarea con contador 10–280.
5. `BranchProgress`: rama con nodos; un ave salta al siguiente nodo al avanzar.
6. Transiciones entre preguntas con GSAP (slide + fade + leve rotación) y `launchFlock` desde la opción elegida.
7. `ThanksScreen`: bandada que despega, plumas suaves, botón compartir (Web Share API → fallback `https://wa.me/?text=`); estado "ya respondiste" con opción de responder de nuevo.
8. Accesibilidad: `role="radiogroup"`, `aria-checked`, foco visible, `aria-live` para errores, orden de tabulación correcto.
9. Commit: `feat(web): flujo completo de la encuesta`.

### Tarea 10: Pruebas e2e y auditoría

**Archivos:** `web/e2e/*.spec.ts`, `playwright.config.ts`

1. Proyectos Playwright: `Pixel 7`, `iPhone 13`, `Desktop Chrome`.
2. Casos: flujo completo feliz; "Otro" en P3 y P4; validación de P7 corta; API caída → mensaje amable + reintento exitoso al recargar; `reducedMotion: 'reduce'` sin animaciones de vuelo; segunda visita muestra "ya respondiste".
3. Lighthouse móvil (CLI) sobre el build: Performance ≥ 85, Accesibilidad ≥ 95; ajustar hasta cumplir.
4. Verificar peso JS+CSS gzip ≤ 180 KB.
5. Commit: `test: e2e y auditoría de rendimiento`.

### Tarea 11: Despliegue

**Archivos:** `deploy/nginx.conf`, `deploy/ecosystem.config.cjs`, `deploy/README.md`

1. Nginx: sirve `web/dist` con caché larga para assets con hash, proxy `/api` → `127.0.0.1:${PORT}`, HTTPS (certbot), cabeceras de seguridad.
2. PM2 para la API en `srv-backend`.
3. README de despliegue paso a paso + cómo generar el QR con `?src=qr-entrada` y enlaces con `?src=whatsapp` / `?src=instagram`.
4. Instrucciones para conectar `vw_bigday_resumen` en Superset.
5. Commit: `chore(deploy): configuración de producción`.

### Tarea 12: Cierre

1. `superpowers:requesting-code-review` sobre todo el diff.
2. Corregir hallazgos.
3. `superpowers:finishing-a-development-branch`.

---

## Enmienda 2026-10-20 (decisiones de Edwin)

1. **Tabla en `serfuweb`** (no base `bigday`).
2. **Backend en `ebor94/mantix`** (clon local `../mantix-git`, rama `feature/bigday`), como módulo `src/bigday` al estilo de `src/trk`: CommonJS, Jest + Supertest, rutas bajo `/api/bigday/v1` (`POST /respuestas`, `GET /resultados`, `GET /resultados.csv`, `GET /health`), pool mysql2 propio con variables `BIGDAY_DB_*`, `BIGDAY_HASH_SALT`, `BIGDAY_RESULTS_TOKEN`; exento del limitador global de Mantix con limitador propio; parser JSON propio de 10 KB. Migraciones en `src/bigday/migrations/`.
3. **`shared/` sigue siendo la fuente única.** `npm run sync:backend` genera `src/bigday/shared/survey.config.cjs` en Mantix (bundle con zod incluido, cabecera "GENERADO" y hash de la fuente); `--check` y un test de contrato fallan si hay desincronización.
4. **Front (`web/`), `shared/` y `deploy/` siguen en este repo.** Se elimina `api/` de este repo.
5. Los enunciados de P1–P7 los aporta Edwin antes de la Tarea 9.

Tareas resultantes: **4a** (este repo) script de sincronización + eliminar `api/`; **4b** (Mantix) módulo `src/bigday` con POST + health + migraciones, portando la lógica de `73a0efd`; **5** (Mantix) resultados y CSV. Tarea 11 ajusta Nginx para proxyar `/api/bigday/` al proceso de Mantix existente (sin PM2 nuevo).

## Enmienda 2026-10-21 (decisiones de Edwin)

1. **Enunciados P1–P7** añadidos a la spec §6 (literales; saltos de línea del mensaje original unidos con un espacio).
2. **Repositorio del front:** `https://github.com/ebor94/bigday` (remoto `origin` de este repo).
3. **Despliegue del front:** copiar `web/dist` a `smb://192.9.17.11/AppServ/www/bigDay-encuesta` (montado en `/Volumes/AppServ/www/bigDay-encuesta`), servido por AppServ (Apache 2.2 en Windows) bajo la subruta `/bigDay-encuesta/`. La Tarea 11 sustituye Nginx/PM2 por: build con `base` relativa, `.htaccess` compatible con Apache 2.2 (caché de assets con hash, cabeceras de seguridad si `mod_headers` está disponible) y API en Mantix por URL absoluta (`VITE_API_BASE`) con CORS en Mantix.
4. **Zona horaria MySQL producción:** `@@global.time_zone = SYSTEM`, `@@system_time_zone = -05` → el `timezone: '-05:00'` del pool es correcto.
