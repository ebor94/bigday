<script setup lang="ts">
// DEMO TEMPORAL (Tarea 6): muestra la identidad visual base.
// La Tarea 9 reemplaza este componente por las pantallas reales de la encuesta.
// No se muestra el enunciado de P1: los títulos de las preguntas están pendientes (Edwin).
import { QUESTIONS } from '@bigday/shared'
import QuestionCard from './components/QuestionCard.vue'
import WatercolorBackground from './components/WatercolorBackground.vue'

const p1 = QUESTIONS.find((q) => q.id === 'p1')
const opciones = p1?.options ?? []
</script>

<template>
  <WatercolorBackground />

  <main class="demo">
    <header class="marca">
      <h1 class="marca__titulo">
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
      </h1>
      <p class="marca__lugar">
        Parque de Vida Los Olivos
      </p>
    </header>

    <QuestionCard>
      <ul
        class="opciones"
        role="list"
      >
        <li
          v-for="opcion in opciones"
          :key="opcion.code"
          class="opcion"
        >
          <span
            class="opcion__letra"
            aria-hidden="true"
          >{{ opcion.code }}</span>
          <span class="opcion__texto">{{ opcion.label }}</span>
        </li>
      </ul>
    </QuestionCard>

    <button
      type="button"
      class="boton-primario"
    >
      Comenzar
    </button>
  </main>
</template>

<style scoped>
.demo {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
  min-height: 100vh;
  min-height: 100dvh;
  padding: var(--space-7) var(--gutter) var(--space-8);
}

.marca {
  text-align: center;
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
  font-family: var(--font-title);
  font-weight: 700;
  /* ≥ 24 px y negrita: cuenta como texto grande para WCAG (verde sobre papel). */
  font-size: clamp(1.375rem, 1.1rem + 1.2vw, 2rem);
  line-height: 1.1;
  color: var(--c-green);
  text-shadow:
    0 0 2px var(--c-white),
    0 0 12px rgb(255 255 255 / 0.95);
}

.opciones {
  display: grid;
  gap: var(--space-3);
}

.opcion {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 56px;
  padding: var(--space-3) var(--space-4);
  border: 2px solid var(--border-option);
  border-radius: var(--radius-organic-sm);
  background: var(--surface-option);
  box-shadow: var(--shadow-soft);
  color: var(--c-ink);
  font-size: var(--fs-md);
  line-height: 1.35;
}

.opcion__letra {
  display: grid;
  flex: none;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: var(--c-teal-900);
  color: var(--c-white);
  font-family: var(--font-title);
  font-weight: 700;
}

.boton-primario {
  min-width: 12rem;
  min-height: 56px;
  padding: var(--space-3) var(--space-6);
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--c-magenta);
  box-shadow: var(--shadow-button);
  color: var(--c-white);
  /* Blanco sobre magenta ≈ 4,46:1: solo apto como texto grande (≥ 18,66 px en negrita).
     --fs-lg = 1.375rem ≈ 22 px (rem = 16 px). Mantener ≥ 1.1875rem (19 px) y 700. */
  font-family: var(--font-title);
  font-weight: 700;
  font-size: var(--fs-lg);
  letter-spacing: 0.01em;
  transition: transform var(--dur-fast) var(--ease-out);
}

.boton-primario:hover {
  transform: translateY(-2px);
}

.boton-primario:active {
  transform: translateY(1px) scale(0.98);
}
</style>
