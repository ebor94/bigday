<script setup lang="ts">
// Contenedor visual de una pregunta: glass claro, bordes orgánicos y sombra suave.
// Solo presentación; la lógica de la encuesta vive en otros componentes.
defineSlots<{
  header?: () => unknown
  default?: () => unknown
}>()
</script>

<template>
  <section class="question-card">
    <header
      v-if="$slots.header"
      class="question-card__header"
    >
      <slot name="header" />
    </header>
    <div class="question-card__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.question-card {
  position: relative;
  width: 100%;
  max-width: var(--card-max);
  margin-inline: auto;
  padding: var(--space-5) var(--space-4);
  border: 1px solid rgb(255 255 255 / 0.7);
  border-radius: var(--radius-organic);
  /* Respaldo sólido: sin backdrop-filter el texto mantiene contraste AA. */
  background: var(--card-gloss), var(--surface-glass-solid);
  box-shadow: var(--shadow-card);
  color: var(--c-ink);
}

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .question-card {
    background: var(--card-gloss), var(--surface-glass);
    -webkit-backdrop-filter: blur(16px) saturate(1.15);
    backdrop-filter: blur(16px) saturate(1.15);
  }
}

.question-card__header {
  margin-bottom: var(--space-4);
  color: var(--c-teal-900);
}

@media (min-width: 768px) {
  .question-card {
    padding: var(--space-6) var(--space-6);
  }
}
</style>
