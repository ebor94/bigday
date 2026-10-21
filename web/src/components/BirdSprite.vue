<script setup lang="ts">
// Ave estilizada original (SVG propio): cola, cuerpo con copete, ojo y el ala en un <g> aparte.
// Mira hacia la derecha. Inspirada libremente en la silueta de un mosquero; no reproduce
// ilustraciones de terceros.
//
// El ala vive en su propio <svg> superpuesto y el aleteo anima el `transform` de ese <svg>
// (caja CSS), no del <g>: en Chrome animar transform dentro de un SVG fuerza layout en cada
// frame, mientras que sobre la caja se compone en GPU (medido con CDP en e2e/aves.spec.ts).
import type { ColorAve } from '../composables/useBirds'

withDefaults(
  defineProps<{
    color?: ColorAve
    /** `false` para aves posadas o con reduced-motion: el ala queda plegada. */
    aletea?: boolean
  }>(),
  { color: 'vermilion', aletea: true },
)
</script>

<template>
  <span
    :class="['ave-sprite', `ave-sprite--${color}`, { 'ave-sprite--quieta': !aletea }]"
    aria-hidden="true"
  >
    <svg
      class="ave-sprite__cuerpo"
      viewBox="0 0 48 36"
      focusable="false"
    >
      <path
        class="ave-sprite__oscuro"
        d="M13 21 1 16.5 3.2 21 0 25.5 13 24.5Z"
      />
      <path d="M10 22c1-7 8-10 16-9 3-4 8-6 12-5 4 1 6 3 7 5l3 1.5-3.5 1c-.5 5.5-6.5 11.5-15.5 11.5-9 .5-16-1-19-5Z" />
      <path d="M31 10.5 29.5 5.5l4 2.5.5-4 3 3.5 2-2v4Z" />
      <path
        class="ave-sprite__vientre"
        d="M14 23c6 3 16 3 23-2-4 4-15 6-23 2Z"
      />
      <circle
        class="ave-sprite__ojo"
        cx="39.5"
        cy="12"
        r="1.4"
      />
      <circle
        class="ave-sprite__brillo"
        cx="40"
        cy="11.5"
        r="0.5"
      />
    </svg>
    <svg
      class="ave-sprite__ala"
      viewBox="0 0 48 36"
      focusable="false"
    >
      <g class="ave-sprite__oscuro">
        <path d="M16 19c2-10 9-16 17-17-3 5-4 10-5 16-4 2-9 2-12 1Z" />
      </g>
    </svg>
  </span>
</template>

<style scoped>
.ave-sprite {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
}

.ave-sprite svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  fill: currentColor;
}

.ave-sprite--teal { color: var(--c-teal-900); }
.ave-sprite--vermilion { color: var(--c-vermilion); }
.ave-sprite--mustard { color: var(--c-mustard); }

/* Alas y cola oscuras, como el mosquero del afiche: tinta translúcida sobre el color base. */
.ave-sprite__oscuro {
  fill: var(--c-ink);
  fill-opacity: 0.82;
}

.ave-sprite__vientre {
  fill: var(--c-white);
  fill-opacity: 0.35;
}

.ave-sprite__ojo {
  fill: var(--c-ink);
}

.ave-sprite__brillo {
  fill: var(--c-white);
}

/* Bisagra del ala en el hombro (x≈22, y≈19 de 48×36). */
.ave-sprite__ala {
  transform-origin: 46% 53%;
  animation: ave-aleteo var(--aleteo, 0.26s) ease-in-out infinite alternate;
  animation-delay: var(--aleteo-retraso, 0s);
}

/* Ala plegada sobre el lomo. */
.ave-sprite--quieta .ave-sprite__ala {
  animation: none;
  transform: scaleY(0.45);
}

@keyframes ave-aleteo {
  from { transform: scaleY(1); }
  to { transform: scaleY(-0.6); }
}

@media (prefers-reduced-motion: reduce) {
  .ave-sprite__ala {
    animation: none;
    transform: scaleY(0.45);
  }
}
</style>
