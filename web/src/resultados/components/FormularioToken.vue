<script setup lang="ts">
// Formulario del token de resultados. El campo NO tiene `name`: aunque el JS fallara y el formulario se
// enviara de forma nativa, el token nunca viajaría en la URL ni en un cuerpo. Solo se emite al padre.
import { ref } from 'vue'

defineProps<{ mensaje: string; enviando: boolean }>()
const emit = defineEmits<{ entrar: [token: string] }>()

const token = ref('')
const campo = ref<HTMLInputElement | null>(null)

function enviar() {
  emit('entrar', token.value)
}

defineExpose({ enfocar: () => campo.value?.focus() })
</script>

<template>
  <section
    class="tarjeta acceso"
    aria-labelledby="titulo-acceso"
  >
    <p class="cabecera__antetitulo">
      2.º October Big Day · Parque de Vida Los Olivos
    </p>
    <h1
      id="titulo-acceso"
      class="acceso__titulo"
    >
      Resultados de la encuesta
    </h1>
    <p class="acceso__texto">
      Escribe el token de resultados para ver las estadísticas.
    </p>
    <form
      class="acceso__form"
      method="post"
      novalidate
      @submit.prevent="enviar"
    >
      <label
        class="acceso__etiqueta"
        for="token-resultados"
      >Token de resultados</label>
      <input
        id="token-resultados"
        ref="campo"
        v-model="token"
        class="acceso__campo"
        type="password"
        autocomplete="current-password"
        autocapitalize="off"
        spellcheck="false"
        required
        :aria-invalid="mensaje ? 'true' : undefined"
        :aria-describedby="mensaje ? 'error-token' : undefined"
      >
      <p
        v-if="mensaje"
        id="error-token"
        class="acceso__error"
        role="alert"
      >
        {{ mensaje }}
      </p>
      <button
        type="submit"
        class="boton-primario acceso__boton"
        :disabled="enviando"
        :aria-busy="enviando"
      >
        {{ enviando ? 'Verificando…' : 'Ver resultados' }}
      </button>
    </form>
  </section>
</template>
