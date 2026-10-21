<script setup lang="ts">
// Pantalla de bienvenida: marca del evento, hero del mosquero posado en una rama,
// introducción, aviso de anonimato (spec §9) y botón "Comenzar".
//
// Hero: se prefiere `public/img/mosquero.webp` (arte de la empresa, lo entrega Edwin).
// Mientras no exista, se muestra el ave SVG propia (BirdSprite) en grande. La imagen se
// intenta cargar de forma invisible y solo reemplaza al sprite si carga bien; un 404 no rompe nada.
import { ref } from 'vue'
import { ID_TITULO } from '../lib/pantallas'
import ActivityIcons from './ActivityIcons.vue'
import BirdSprite from './BirdSprite.vue'

defineEmits<{ comenzar: [] }>()

const RUTA_HERO = `${import.meta.env.BASE_URL}img/mosquero.webp`
/** Logo de Los Olivos (marca propia de la empresa, spec §5). */
const RUTA_LOGO = `${import.meta.env.BASE_URL}img/logo-olivos.webp`
const heroCargado = ref(false)
</script>

<template>
  <div class="bienvenida">
    <div class="bienvenida__escena">
      <header class="marca">
        <img
          class="marca__logo"
          :src="RUTA_LOGO"
          alt="Los Olivos"
          width="408"
          height="222"
          decoding="async"
        >
        <h1
          :id="ID_TITULO"
          class="marca__titulo"
          tabindex="-1"
        >
          <span class="marca__edicion">2.º</span>
          <span class="marca__october">October</span>
          <span class="marca__bigday">
            Big Day
            <svg
              class="marca__asterisco"
              viewBox="-12 -12 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <g
                stroke="currentColor"
                stroke-width="3.6"
                stroke-linecap="round"
              >
                <path d="M0 -10V10" />
                <path d="M-8.7 -5L8.7 5" />
                <path d="M-8.7 5L8.7 -5" />
              </g>
            </svg>
          </span>
          <span class="sr-only"> · </span>
          <span class="marca__lugar">Parque de Vida Los Olivos</span>
        </h1>
      </header>

      <div
        class="hero"
        aria-hidden="true"
      >
        <svg
          class="hero__rama"
          viewBox="0 0 320 70"
          focusable="false"
        >
          <path
            d="M-10 52C60 40 120 46 180 36s110-18 150-12"
            fill="none"
            stroke="#6B4A2E"
            stroke-width="9"
            stroke-linecap="round"
          />
          <path
            d="M120 44c10-12 22-18 38-20M230 30c8 8 20 12 34 12"
            fill="none"
            stroke="#6B4A2E"
            stroke-width="4"
            stroke-linecap="round"
          />
          <g fill="#7FA650">
            <ellipse
              cx="164"
              cy="22"
              rx="14"
              ry="5"
              transform="rotate(-18 164 22)"
            />
            <ellipse
              cx="270"
              cy="44"
              rx="14"
              ry="5"
              transform="rotate(14 270 44)"
            />
            <ellipse
              cx="40"
              cy="40"
              rx="13"
              ry="4.5"
              transform="rotate(-24 40 40)"
            />
          </g>
          <g fill="#5E8A3A">
            <ellipse
              cx="150"
              cy="30"
              rx="11"
              ry="4"
              transform="rotate(30 150 30)"
            />
            <ellipse
              cx="250"
              cy="40"
              rx="11"
              ry="4"
              transform="rotate(-30 250 40)"
            />
          </g>
        </svg>
        <div class="hero__ave">
          <img
            v-show="heroCargado"
            class="hero__img"
            :src="RUTA_HERO"
            alt=""
            width="320"
            height="320"
            decoding="async"
            @load="heroCargado = true"
            @error="heroCargado = false"
          >
          <BirdSprite
            v-if="!heroCargado"
            class="hero__sprite"
            color="vermilion"
            :aletea="false"
          />
        </div>
      </div>
    </div>

    <section
      class="bienvenida__tarjeta"
      :aria-labelledby="ID_TITULO"
    >
      <p class="intro">
        Gracias por acompañarnos en un día de aves, arte y vida en Los Olivos.
        Cuéntanos cómo lo viviste: son 7 preguntas y toma menos de 2 minutos.
      </p>
      <ActivityIcons />
      <p class="privacidad">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect
            x="5"
            y="10.5"
            width="14"
            height="10"
            rx="2.5"
          />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </svg>
        Tus respuestas son anónimas y se usarán solo para mejorar nuestros espacios.
      </p>
      <button
        type="button"
        class="boton-primario bienvenida__comenzar"
        @click="$emit('comenzar')"
      >
        Comenzar
      </button>
    </section>
  </div>
</template>

<style scoped>
.bienvenida {
  display: grid;
  justify-items: center;
  gap: var(--space-4);
  width: 100%;
  max-width: 68rem;
}

.bienvenida__escena {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
}

.marca {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  text-align: center;
}

/* Logo sobre el título: discreto en móvil (≈ 6,5 rem de ancho), algo mayor en escritorio.
   width/height en el HTML reservan el espacio (sin salto de diseño). */
.marca__logo {
  width: 6.5rem;
  height: auto;
  filter: drop-shadow(0 0 10px rgb(255 255 255 / 0.95));
}

.marca__titulo {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: var(--fs-display);
  line-height: 0.98;
  letter-spacing: -0.01em;
  /* Halo blanco como en el afiche: separa el título del fondo. */
  text-shadow:
    0 0 2px var(--c-white),
    0 0 14px rgb(255 255 255 / 0.95),
    0 0 28px rgb(255 255 255 / 0.8);
}

.marca__titulo:focus {
  outline: none;
}

.marca__edicion {
  font-size: 0.5em;
  color: var(--c-teal-900);
}

.marca__october {
  color: var(--c-teal-900);
}

.marca__bigday {
  position: relative;
  color: var(--c-magenta);
}

.marca__asterisco {
  position: absolute;
  top: -0.2em;
  right: -0.55em;
  width: 0.42em;
  height: 0.42em;
  color: var(--c-mustard);
  filter: drop-shadow(0 0 4px rgb(255 255 255 / 0.9));
}

.marca__lugar {
  margin-top: var(--space-3);
  /* ≥ 24 px y negrita: cuenta como texto grande para WCAG (verde sobre papel). */
  font-size: clamp(1.5rem, 1.2rem + 1.2vw, 2rem);
  line-height: 1.1;
  color: var(--c-green);
  text-shadow:
    0 0 2px var(--c-white),
    0 0 12px rgb(255 255 255 / 0.95);
}

/* ── Hero: el mosquero llega volando y se posa en la rama ── */
.hero {
  position: relative;
  width: min(15rem, 70vw);
  aspect-ratio: 320 / 150;
}

.hero__rama {
  position: absolute;
  inset: auto 0 0;
  width: 100%;
  height: auto;
}

.hero__ave {
  position: absolute;
  left: 30%;
  bottom: 20%;
  width: 46%;
  aspect-ratio: 48 / 36;
  animation: mosquero-llega 1.2s var(--ease-out) 0.2s both;
}

.hero__sprite,
.hero__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 6px 10px rgb(13 74 90 / 0.25));
}

@keyframes mosquero-llega {
  0% {
    opacity: 0;
    transform: translate(-60vw, -40vh) rotate(-18deg) scale(0.6);
  }
  70% {
    opacity: 1;
    transform: translate(4%, -8%) rotate(4deg) scale(1.02);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

/* ── Tarjeta ── */
.bienvenida__tarjeta {
  display: grid;
  gap: var(--space-5);
  justify-items: center;
  width: 100%;
  max-width: var(--card-max);
  padding: var(--space-5) var(--space-4);
  border: 1px solid rgb(255 255 255 / 0.7);
  border-radius: var(--radius-organic);
  background: var(--surface-glass-solid);
  box-shadow: var(--card-gloss), var(--shadow-card);
  text-align: center;
}

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .bienvenida__tarjeta {
    background: var(--surface-glass);
    -webkit-backdrop-filter: blur(16px) saturate(1.15);
    backdrop-filter: blur(16px) saturate(1.15);
  }
}

.intro {
  font-size: var(--fs-md);
  color: var(--c-ink);
}

.privacidad {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  max-width: 30rem;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-teal-900);
  text-align: left;
}

.privacidad svg {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  margin-top: 0.1rem;
}

.bienvenida__comenzar {
  min-width: 12rem;
}

@media (min-width: 960px) {
  .bienvenida {
    grid-template-columns: 1fr minmax(0, var(--card-max));
    align-items: center;
    gap: var(--space-7);
    min-height: calc(100vh - 2 * var(--space-7));
    min-height: calc(100dvh - 2 * var(--space-7));
  }

  .hero {
    width: min(24rem, 32vw);
  }

  .marca__logo {
    width: 9.5rem;
  }

  .bienvenida__tarjeta {
    padding: var(--space-6);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero__ave {
    animation: none;
  }
}
</style>
