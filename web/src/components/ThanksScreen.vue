<script setup lang="ts">
// Cierre: mensaje según el estado del envío, bandada que despega, plumas suaves y botón para
// compartir el evento (Web Share API → WhatsApp). Modo "ya respondiste" al volver, con
// opción discreta de responder de nuevo (familias que comparten celular).
// Plumas: SVG propio animado solo con transform/opacity; ocultas con reduced-motion.
import { computed, onMounted, ref } from 'vue'
import { useBirds } from '../composables/useBirds'
import { compartir, urlEncuesta } from '../lib/compartir'
import type { ModoGracias } from '../lib/pantallas'

const props = defineProps<{
  modo: ModoGracias
  /** Mensaje del servidor cuando la respuesta fue rechazada. */
  mensaje?: string | undefined
}>()

const emit = defineEmits<{
  revisar: []
  otraVez: []
}>()

const aves = useBirds()
const titulo = ref<HTMLElement | null>(null)

const TEXTOS: Record<ModoGracias, { titulo: string; estado: string }> = {
  enviando: { titulo: '¡Gracias!', estado: 'Enviando tu respuesta…' },
  enviada: {
    titulo: '¡Gracias!',
    estado: 'Recibimos tu respuesta. Nos ayuda a seguir cuidando la vida que habita Los Olivos.',
  },
  pendiente: {
    titulo: '¡Gracias!',
    estado:
      'Guardamos tu respuesta en este dispositivo. Ahora no hay conexión con el servidor; se enviará automáticamente en cuanto vuelva. No se pierde nada.',
  },
  rechazada: { titulo: 'Revisemos tu respuesta', estado: '' },
  pendiente_regreso: {
    titulo: '¡Gracias, ya respondiste!',
    estado: 'Tu respuesta se está enviando; si no hay conexión, se enviará automáticamente al recuperarla.',
  },
  ya_respondiste: { titulo: '¡Gracias, ya respondiste!', estado: 'Tu respuesta ya está con nosotros.' },
}

const texto = computed(() => TEXTOS[props.modo])
const estado = computed(() => (props.modo === 'rechazada' ? (props.mensaje ?? '') : texto.value.estado))
const puedeCompartir = computed(() => props.modo !== 'rechazada' && props.modo !== 'enviando')
const esRegreso = computed(() => props.modo === 'ya_respondiste' || props.modo === 'pendiente_regreso')

const PLUMAS = Array.from({ length: 8 }, (_, i) => ({
  izquierda: 6 + ((i * 37) % 88),
  retraso: (i * 0.45) % 3,
  duracion: 5 + ((i * 13) % 4),
  escala: 0.7 + ((i * 7) % 5) * 0.12,
  color: ['#E8B623', '#F0461E', '#7FA650', '#0D4A5A'][i % 4],
}))

async function alCompartir() {
  await compartir(urlEncuesta(window.location), {
    navegador: navigator,
    abrir: (url) => window.open(url, '_blank', 'noopener'),
  })
}

onMounted(() => {
  if (titulo.value && props.modo !== 'rechazada') aves.launchFlock(titulo.value, 6)
})
</script>

<template>
  <section
    class="gracias"
    aria-labelledby="titulo-paso"
  >
    <div
      class="plumas"
      aria-hidden="true"
    >
      <svg
        v-for="(p, i) in PLUMAS"
        :key="i"
        class="pluma"
        viewBox="0 0 20 48"
        focusable="false"
        :style="{
          left: `${p.izquierda}%`,
          animationDelay: `${p.retraso}s`,
          animationDuration: `${p.duracion}s`,
          '--escala': p.escala,
          color: p.color,
        }"
      >
        <path
          d="M10 2C3 12 2 26 6 38l4 8 4-8c4-12 3-26-4-36Z"
          fill="currentColor"
          fill-opacity="0.75"
        />
        <path
          d="M10 6v40M10 18l-4-3M10 24l4-3M10 30l-4-3"
          stroke="#fff"
          stroke-opacity="0.8"
          stroke-width="1.2"
          fill="none"
        />
      </svg>
    </div>

    <h1
      id="titulo-paso"
      ref="titulo"
      class="gracias__titulo"
      tabindex="-1"
    >
      {{ texto.titulo }}
    </h1>

    <p
      class="gracias__estado"
      role="status"
      aria-live="polite"
    >
      {{ estado }}
    </p>

    <div class="gracias__acciones">
      <button
        v-if="modo === 'rechazada'"
        type="button"
        class="boton-secundario"
        @click="emit('revisar')"
      >
        Revisar mis respuestas
      </button>
      <button
        v-if="puedeCompartir"
        type="button"
        class="boton-secundario gracias__compartir"
        @click="alCompartir"
      >
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
          <circle
            cx="18"
            cy="5"
            r="2.5"
          />
          <circle
            cx="6"
            cy="12"
            r="2.5"
          />
          <circle
            cx="18"
            cy="19"
            r="2.5"
          />
          <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
        </svg>
        Compartir el evento
      </button>
    </div>

    <p
      v-if="modo !== 'enviando' && modo !== 'rechazada'"
      class="gracias__otra"
    >
      <span v-if="esRegreso">¿Alguien más usa este celular?</span>
      <button
        type="button"
        class="boton-enlace"
        @click="emit('otraVez')"
      >
        Responder de nuevo
      </button>
    </p>
  </section>
</template>

<style scoped>
.gracias {
  position: relative;
  display: grid;
  margin-block: auto;
  justify-items: center;
  gap: var(--space-5);
  width: 100%;
  max-width: var(--card-max);
  padding: var(--space-7) var(--space-4) var(--space-6);
  border: 1px solid rgb(255 255 255 / 0.7);
  border-radius: var(--radius-organic);
  background: var(--surface-glass-solid);
  box-shadow: var(--card-gloss), var(--shadow-card);
  text-align: center;
}

@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .gracias {
    background: var(--surface-glass);
    -webkit-backdrop-filter: blur(16px) saturate(1.15);
    backdrop-filter: blur(16px) saturate(1.15);
  }
}

.gracias > :not(.plumas) {
  position: relative;
  z-index: 1;
}

.gracias__titulo {
  font-size: var(--fs-xl);
  color: var(--c-teal-900);
}

.gracias__titulo:focus {
  outline: none;
}

.gracias__estado {
  max-width: 30rem;
  min-height: 1.5em;
  font-size: var(--fs-md);
  color: var(--c-ink);
}

.gracias__acciones {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
}

.gracias__otra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0 var(--space-1);
  font-size: var(--fs-sm);
  color: var(--c-ink);
}

/* ── Plumas que caen suavemente dentro de la tarjeta ── */
.plumas {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}

.pluma {
  position: absolute;
  top: 0;
  width: 14px;
  height: 34px;
  opacity: 0;
  animation: pluma-cae 6s ease-in-out infinite;
}

@keyframes pluma-cae {
  0% {
    opacity: 0;
    transform: translate(0, -40px) rotate(-20deg) scale(var(--escala, 1));
  }
  15% {
    opacity: 0.9;
  }
  50% {
    transform: translate(18px, 140px) rotate(25deg) scale(var(--escala, 1));
  }
  85% {
    opacity: 0.7;
  }
  100% {
    opacity: 0;
    transform: translate(-10px, 300px) rotate(-15deg) scale(var(--escala, 1));
  }
}

@media (prefers-reduced-motion: reduce) {
  .plumas {
    display: none;
  }
}
</style>
