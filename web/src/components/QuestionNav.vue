<script setup lang="ts">
// Navegación de una pregunta: "Atrás" (siempre visible), "Continuar" y la región aria-live
// donde se anuncian los errores de validación.
defineProps<{
  error: string | null
  /** Texto del botón principal (la última pregunta envía). */
  textoContinuar: string
}>()

defineEmits<{ atras: []; continuar: [] }>()
</script>

<template>
  <div class="nav">
    <p
      class="nav__error"
      role="alert"
      aria-live="assertive"
    >
      <template v-if="error">
        {{ error }}
      </template>
    </p>
    <div class="nav__botones">
      <button
        type="button"
        class="boton-atras"
        @click="$emit('atras')"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Atrás
      </button>
      <button
        type="button"
        class="boton-primario nav__continuar"
        @click="$emit('continuar')"
      >
        {{ textoContinuar }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.nav {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

.nav__error {
  min-height: 1.5em;
  font-weight: 700;
  font-size: var(--fs-sm);
  /* Bermellón oscurecido: ≈ 6:1 sobre la tarjeta (AA texto normal). */
  color: #A3300F;
}

.nav__error:empty {
  min-height: 0;
}

.nav__botones {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.nav__continuar {
  flex: 1;
  max-width: 16rem;
  min-width: 0;
  padding-inline: var(--space-4);
}
</style>
