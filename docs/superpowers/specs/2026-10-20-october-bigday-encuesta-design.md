# Encuesta de Experiencia — 2.º October Big Day · Parque de Vida Los Olivos

**Fecha:** 2026-10-20
**Autor:** Edwin Ortega (COORDTIC, Serfunorte Los Olivos)
**Estado:** Diseño aprobado — listo para plan de implementación

---

## 1. Objetivo

Medir la **satisfacción** y el **cambio de percepción** de los asistentes al 2.º October Big Day (sábado 17 de octubre, Parque Cementerio Jardines Los Olivos San José) mediante una encuesta web responsive, anónima, que se abre desde un QR o enlace (WhatsApp, redes).

Indicadores que debe producir:

| Indicador | Fuente |
|---|---|
| Conocimiento previo de la biodiversidad | P1 |
| Percepción antes vs. después (cambio de marca "parque cementerio" → "Parque de Vida") | P2 × P3 |
| Hallazgo/aprendizaje principal | P4, P5 |
| NPS del evento | P6 |
| Frases testimoniales para comunicación | P7 |

## 2. Alcance

**Incluye**
- Formulario de 7 preguntas, una por pantalla, con animaciones temáticas (aves volando).
- API que valida y guarda respuestas en MySQL.
- Endpoint protegido de resultados agregados (conteos, NPS, matriz antes/después) + exportación CSV.
- Vista SQL lista para conectar a Superset.

**No incluye (v1)**
- Login, captura de datos personales, sorteos.
- Multi-evento con administración visual (se deja `evento_id` en el modelo para reutilizar en el 3.º Big Day).

## 3. Stack

Coherente con lo que ya corre en `srv-backend` (Mantix, pantallas-api):

- **Frontend:** Vue 3 + Vite + TypeScript, CSS propio (sin framework de UI), GSAP para transiciones complejas; animaciones de aves en SVG + CSS/Web Animations API.
- **Backend:** Node.js 20 + Express + `mysql2` + `zod` (validación) + `express-rate-limit` + `helmet`.
- **BD:** MySQL 8 en `srv-backend`, base nueva `bigday` (o esquema dentro de `serfuweb` si se prefiere; ver §9).
- **Pruebas:** Vitest (unitarias front y back), Supertest (API), Playwright (e2e móvil + escritorio).
- **Despliegue:** build estático servido por Nginx; API con PM2; subdominio sugerido `encuesta.losolivos.co` con HTTPS.

## 4. Identidad visual (derivada del afiche oficial)

### Paleta (tokens CSS)

```css
:root {
  --c-teal-900: #0D4A5A;   /* "October" */
  --c-magenta:  #E8175D;   /* "Big Day" */
  --c-green:    #0E8A5F;   /* "Los Olivos" */
  --c-vermilion:#F0461E;   /* Mosquero Bermellón */
  --c-mustard:  #E8B623;   /* asterisco, bordado */
  --c-lime:     #C8D84A;   /* "arte y vida" */
  --c-sky:      #DCEBF5;   /* cielo acuarela */
  --c-leaf:     #7FA650;   /* follaje */
  --c-paper:    #FBF8F1;   /* fondo papel */
  --c-ink:      #1E2A2E;   /* texto */
}
```

Contraste: texto sobre tarjetas siempre `--c-ink` o `--c-teal-900` sobre blanco/papel (AA mínimo). El magenta y el bermellón solo para acentos, botones grandes y estados.

### Tipografía
- Títulos: **Fredoka** (redondeada, como el afiche), 600–700.
- Cuerpo: **Nunito**, 400–700.
- Cargar desde Google Fonts con `display=swap`; tamaño base 18 px en móvil.

### Atmósfera
- Fondo tipo **acuarela**: degradados radiales difuminados (cielo + follaje) + textura de papel con filtro SVG `feTurbulence` a baja opacidad.
- Capas de follaje en los bordes con **parallax** suave (mouse en escritorio, giroscopio opcional en móvil, scroll como fallback).
- Tarjeta de pregunta con efecto *glass* claro (`backdrop-filter: blur`) y borde orgánico.
- Iconos de actividades (binoculares, cámara, paleta, bastidor) reutilizados como decoración en la pantalla de bienvenida.
- La ilustración del Mosquero Bermellón del afiche es arte propio de la empresa: se usa como hero (exportada a WebP, ≤150 KB).

## 5. Experiencia de usuario

### Flujo
1. **Bienvenida** — logo, "2.º October Big Day · Parque de Vida Los Olivos", texto de introducción, botón "Comenzar". El mosquero entra volando y se posa en una rama.
2. **P1 → P7** — una pregunta por pantalla.
3. **Gracias** — mensaje de cierre, bandada que despega, plumas/confeti suave, invitación a ver el video del evento con enlaces a Instagram y Facebook (decisión de Edwin 2026-10-21; reemplaza el botón de compartir).

### Interacciones
- **Opción única:** tarjetas grandes (≥56 px de alto). Al elegir: microanimación (pulso + check), y avance automático a los 600 ms. Botón "Atrás" siempre visible.
- **"Otro":** al seleccionarse despliega un campo de texto (máx. 120 caracteres) con foco automático; no avanza solo, requiere "Continuar".
- **P6 (NPS 1–10):** 10 botones en dos filas en móvil (1–5 / 6–10), una fila en escritorio. Color en gradiente rojo→ámbar→verde. Un pajarito se posa sobre el número elegido.
- **P7 (abierta):** textarea con contador (10–280 caracteres), placeholder inspirador ("Ej.: Ven a ver aves increíbles en un lugar lleno de vida").
- **Progreso:** una rama horizontal en la parte superior; un ave avanza de nodo en nodo por cada pregunta respondida.
- **Teclado:** números/letras A–D seleccionan opción, Enter continúa, Esc vuelve atrás.

### Aves animadas (requisito clave)
- SVG propio de un ave estilizada (silueta + ala separada como `<g>` para el aleteo), **no** usar personajes ni ilustraciones de terceros.
- **Ambiente:** 2–4 aves cruzan el fondo cada 8–15 s con trayectorias curvas aleatorias (cubic-bezier / `offset-path`), distinta escala y velocidad para dar profundidad.
- **Reacción a respuesta:** al responder, una pequeña bandada (3–6 aves) despega desde la tarjeta seleccionada y sale de pantalla.
- **Cambio de pregunta:** transición de la tarjeta (slide + fade + leve rotación) sincronizada con el aleteo.
- Rendimiento: solo `transform` y `opacity`; máximo ~12 aves simultáneas; pausar animaciones con `document.hidden`.
- **Accesibilidad:** con `prefers-reduced-motion: reduce` las aves quedan estáticas/posadas y las transiciones se vuelven fundidos cortos.

## 6. Preguntas y códigos

Los textos se muestran literales. Se guardan **códigos**, no textos, para facilitar análisis.

| # | Tipo | Opciones (código → texto) |
|---|---|---|
| P1 | única, obligatoria | `A` No sabía que en Los Olivos habitaban diferentes especies de aves y otros animales. · `B` Sabía que había aves y otros animales, pero desconocía la diversidad de especies. · `C` Sabía que Los Olivos tenía una importante diversidad de aves y conocía algunos ejemplos. · `D` Ya conocía los registros científicos de biodiversidad de Los Olivos. |
| P2 | única, obligatoria | `cementerio` Un parque cementerio. · `naturaleza` Un espacio de naturaleza y biodiversidad. · `ambas` Ambas cosas. · `no_conocia` No conocía Los Olivos. |
| P3 | única + otro, obligatoria | `memoria` Un lugar de memoria y homenaje. · `parque_vida` Un Parque de Vida con biodiversidad. · `ambas` Ambas cosas: memoria, naturaleza y vida. · `sin_cambio` Mi percepción no cambió. · `otro` Otro (+ texto) |
| P4 | única + otro, obligatoria | `diversidad` La diversidad de aves y otras especies presentes. · `cientifico` El trabajo científico de registro y conservación. · `actividades` Las actividades artísticas y educativas. · `relacion` La relación entre Los Olivos y la naturaleza. · `otro` Otro (+ texto) |
| P5 | única, obligatoria | `A` Descubrí que en Los Olivos habitan diferentes especies de aves y otros animales. · `B` Aprendí sobre la diversidad de especies y conocí ejemplares que no sabía que existían aquí. · `C` Comprendí mejor la importancia del registro científico y la conservación de la biodiversidad. · `D` Amplié conocimientos que ya tenía sobre la biodiversidad de Los Olivos. |
| P6 | escala 1–10, obligatoria | 1 = Nada probable · 10 = Muy probable |
| P7 | abierta, obligatoria | 10–280 caracteres |

### Enunciados (literales, aportados por Edwin el 2026-10-21)

| # | Enunciado |
|---|---|
| P1 | Antes de participar en el October Big Day, ¿cuál de las siguientes afirmaciones describe mejor lo que sabes sobre la biodiversidad de Los Olivos? |
| P2 | Antes de participar en el evento, ¿con qué asociabas a Los Olivos? |
| P3 | Después de vivir esta experiencia, ¿con qué asocias ahora a Los Olivos? |
| P4 | ¿Qué fue lo que más te sorprendió o aprendiste durante el evento? |
| P5 | Después de participar en el October Big Day, ¿qué aprendiste sobre la biodiversidad de Los Olivos? |
| P6 | En una escala de 1 a 10, ¿qué tan probable es que recomiendes el October Big Day de Los Olivos a tus familiares o amigos? |
| P7 | En una frase, ¿qué le contarías a alguien para animarlo a conocer Parque de Vida Los Olivos? |

Las preguntas viven en un único archivo de configuración (`survey.config.ts`) compartido por front y back (validación), para poder reutilizar la app en otros eventos.

## 7. Modelo de datos

```sql
CREATE TABLE bigday_respuestas (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid          CHAR(36)     NOT NULL UNIQUE,      -- generado en el cliente (idempotencia)
  evento_id     VARCHAR(40)  NOT NULL DEFAULT 'october-bigday-2',
  p1            ENUM('A','B','C','D') NOT NULL,
  p2            VARCHAR(20)  NOT NULL,
  p3            VARCHAR(20)  NOT NULL,
  p3_otro       VARCHAR(120) NULL,
  p4            VARCHAR(20)  NOT NULL,
  p4_otro       VARCHAR(120) NULL,
  p5            ENUM('A','B','C','D') NOT NULL,
  p6            TINYINT UNSIGNED NOT NULL CHECK (p6 BETWEEN 1 AND 10),
  p7            VARCHAR(280) NOT NULL,
  origen        VARCHAR(40)  NULL,                 -- ?src=qr-entrada, whatsapp, instagram…
  duracion_seg  INT UNSIGNED NULL,
  ip_hash       CHAR(64)     NULL,                 -- SHA-256(ip + sal), nunca la IP
  ua_hash       CHAR(64)     NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_evento_fecha (evento_id, created_at)
);
```

Vista para Superset: `vw_bigday_resumen` con columnas derivadas `nps_grupo` (`promotor` 9–10, `pasivo` 7–8, `detractor` 1–6) y `cambio_percepcion` (P2 → P3).

> Nota NPS: la escala pedida es 1–10 (no 0–10). Se conserva y se documenta en el informe; NPS = %promotores − %detractores.

## 8. API

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/respuestas` | Valida con zod y guarda. Idempotente por `uuid` (repetido → 200 sin duplicar). Honeypot `website` vacío obligatorio. Rate limit: 10 req / 10 min por IP + hash del user-agent (decisión de Edwin 2026-10-20: evita que una red compartida agote un cupo común). |
| `GET` | `/api/resultados` | Header `Authorization: Bearer <RESULTS_TOKEN>`. Devuelve totales, distribución por pregunta, NPS, matriz P2×P3, últimas 20 frases de P7. |
| `GET` | `/api/resultados.csv` | Mismo token. Exporta todas las respuestas con textos legibles. |
| `GET` | `/api/health` | Estado y conexión a BD. |

## 9. Antiduplicados, seguridad y privacidad

- **Duplicados:** al enviar se guarda una marca en `localStorage`; si el visitante vuelve, ve la pantalla de "Gracias, ya respondiste" con opción discreta de responder de nuevo (familias comparten celular). No se bloquea por IP porque en el evento muchos comparten Wi-Fi.
- **Anti-bot:** honeypot + tiempo mínimo de respuesta (`duracion_seg ≥ 8`) + rate limit.
- **Privacidad:** encuesta anónima, sin datos personales. IP y user-agent solo como hash con sal (`HASH_SALT` en `.env`). Texto breve en la bienvenida: "Tus respuestas son anónimas y se usarán solo para mejorar nuestros espacios."
- **Seguridad:** `helmet`, CORS restringido al dominio, consultas parametrizadas, tamaño máximo de body 10 KB, secretos solo en `.env`.
- **BD:** por defecto base separada `bigday` con usuario de solo `INSERT/SELECT` sobre su tabla. Alternativa: tabla dentro de `serfuweb` para tenerla junto a lo que Superset ya consume — decisión de Edwin antes de la Tarea 2.

## 10. Calidad y criterios de aceptación

- Lighthouse móvil: Performance ≥ 85, Accesibilidad ≥ 95.
- Peso inicial (JS+CSS gzip) ≤ 180 KB, sin contar fuentes e imagen hero.
- Funciona en Chrome Android, Safari iOS 15+, escritorio; ancho mínimo 320 px.
- Toda la encuesta se completa en < 2 minutos.
- Con `prefers-reduced-motion` no hay aves en movimiento.
- Si la API falla, la respuesta queda en `localStorage` y se reintenta al recargar (mensaje amable, sin perder datos).
- Pruebas e2e cubren: flujo completo, "Otro" con texto, validaciones, reintento offline, reduced-motion.
