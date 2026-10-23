<script setup lang="ts">
// Fila de indicadores: total de respuestas (cifra principal), NPS con su desglose, nueva percepción de
// marca y hora de la última consulta. El desglose del NPS es una barra apilada con leyenda y números.
import { COLORES_GRUPO_NPS, formatoNps, formatoPct, type DestacadoPercepcion, type ModeloNps } from '../lib/modelo'

defineProps<{ total: number; nps: ModeloNps; destacado: DestacadoPercepcion; actualizado: string }>()
const numero = new Intl.NumberFormat('es-CO')
</script>

<template>
  <section
    class="kpis"
    aria-label="Indicadores principales"
  >
    <article class="tarjeta kpi kpi--principal">
      <h2 class="kpi__etiqueta">
        Respuestas
      </h2>
      <p class="kpi__cifra kpi__cifra--hero">
        {{ numero.format(total) }}
      </p>
      <p class="kpi__nota">
        Encuestas recibidas
      </p>
    </article>

    <article class="tarjeta kpi kpi--nps">
      <h2 class="kpi__etiqueta">
        NPS del evento
      </h2>
      <p class="kpi__cifra">
        {{ formatoNps(nps.valor) }}<span class="kpi__unidad"> de −100 a +100</span>
      </p>
      <div
        v-if="nps.total > 0"
        class="nps-apilada"
        aria-hidden="true"
      >
        <span
          v-for="g in nps.grupos"
          v-show="g.total > 0"
          :key="g.grupo"
          class="nps-apilada__tramo"
          :style="{ flexGrow: g.total, background: COLORES_GRUPO_NPS[g.grupo] }"
        />
      </div>
      <ul
        role="list"
        class="leyenda leyenda--columna"
      >
        <li
          v-for="g in nps.grupos"
          :key="g.grupo"
          class="leyenda__item"
        >
          <span
            class="leyenda__muestra"
            :style="{ background: COLORES_GRUPO_NPS[g.grupo] }"
            aria-hidden="true"
          />
          <span>{{ g.etiqueta }}: <strong>{{ numero.format(g.total) }}</strong> <span class="leyenda__pct">({{ formatoPct(nps.total > 0 ? g.pct : null) }})</span></span>
        </li>
      </ul>
      <p class="kpi__nota">
        Escala de 1 a 10 (spec §7), no de 0 a 10. NPS = % promotores − % detractores.
      </p>
    </article>

    <article class="tarjeta kpi">
      <h2 class="kpi__etiqueta">
        Nueva percepción
      </h2>
      <p class="kpi__cifra">
        {{ formatoPct(destacado.pct) }}
      </p>
      <p class="kpi__nota">
        ahora asocia Los Olivos con «{{ destacado.etiquetas[0] }}» o «{{ destacado.etiquetas[1] }}» (P3).
      </p>
    </article>

    <article class="tarjeta kpi">
      <h2 class="kpi__etiqueta">
        Actualizado
      </h2>
      <p class="kpi__cifra kpi__cifra--fecha">
        {{ actualizado || '—' }}
      </p>
      <p class="kpi__nota">
        Hora de Colombia. Datos en vivo de la API; pulsa «Actualizar» para volver a consultar.
      </p>
    </article>
  </section>
</template>
