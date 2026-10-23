<script setup lang="ts">
// Cambio de percepción P2 (antes) × P3 (después): el indicador clave de marca (spec §1).
// Escritorio: tabla real (th de fila y de columna) como mapa de calor secuencial de un solo tono; cada celda
// muestra su conteo y el % dentro de su fila, con texto que cumple AA sobre su fondo.
// Móvil (< 760 px): la misma información como barras por cada percepción de partida (sin scroll horizontal).
// Solo una de las dos versiones se muestra (display: none oculta la otra también a los lectores de pantalla).
import { QUESTIONS } from '@bigday/shared'
import {
  COLORES_CALOR,
  TEXTO_CALOR,
  formatoPct,
  type DestacadoPercepcion,
  type ModeloMatriz,
} from '../lib/modelo'

defineProps<{ matriz: ModeloMatriz; destacado: DestacadoPercepcion }>()
const tituloP2 = QUESTIONS.find((q) => q.id === 'p2')!.title
const tituloP3 = QUESTIONS.find((q) => q.id === 'p3')!.title
const numero = new Intl.NumberFormat('es-CO')
</script>

<template>
  <section
    class="seccion"
    aria-labelledby="seccion-percepcion"
  >
    <h2
      id="seccion-percepcion"
      class="seccion__titulo"
    >
      Cambio de percepción (P2 → P3)
    </h2>
    <div class="tarjeta grafico">
      <p class="destacado">
        <strong class="destacado__cifra">{{ formatoPct(destacado.pct) }}</strong>
        <span>
          ahora asocia Los Olivos con «{{ destacado.etiquetas[0] }}» o «{{ destacado.etiquetas[1] }}»
          ({{ numero.format(destacado.nueva) }} de {{ numero.format(destacado.total) }}).
        </span>
      </p>
      <p class="destacado destacado--secundario">
        <strong class="destacado__cifra">{{ formatoPct(destacado.desdeCementerio.pct) }}</strong>
        <span>
          de quienes antes lo asociaban con «{{ destacado.etiquetaAntes }}» ahora lo ve así
          ({{ numero.format(destacado.desdeCementerio.nueva) }} de {{ numero.format(destacado.desdeCementerio.total) }}).
        </span>
      </p>

      <dl class="matriz-preguntas">
        <div>
          <dt>Antes (filas, P2)</dt>
          <dd>{{ tituloP2 }}</dd>
        </div>
        <div>
          <dt>Ahora (columnas, P3)</dt>
          <dd>{{ tituloP3 }}</dd>
        </div>
      </dl>

      <div class="matriz-tabla">
        <table class="matriz">
          <caption class="sr-only">
            Respuestas por combinación de percepción antes (P2, filas) y ahora (P3, columnas), con el porcentaje dentro de cada fila
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                class="matriz__esquina"
              >
                Antes ↓ · Ahora →
              </th>
              <th
                v-for="c in matriz.columnas"
                :key="c.codigo"
                scope="col"
              >
                {{ c.etiqueta }}
              </th>
              <th
                scope="col"
                class="matriz__total"
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="f in matriz.filas"
              :key="f.codigo"
            >
              <th scope="row">
                {{ f.etiqueta }}
              </th>
              <td
                v-for="c in f.celdas"
                :key="c.codigo"
                class="matriz__celda"
                :style="{ background: COLORES_CALOR[c.nivel], color: TEXTO_CALOR[c.nivel] }"
              >
                <strong>{{ numero.format(c.total) }}</strong>
                <span class="matriz__pct">{{ formatoPct(f.total > 0 ? c.pctFila : null) }}</span>
              </td>
              <td class="matriz__total">
                {{ numero.format(f.total) }}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">
                Total
              </th>
              <td
                v-for="c in matriz.columnas"
                :key="c.codigo"
                class="matriz__total"
              >
                {{ numero.format(c.total) }}
              </td>
              <td class="matriz__total">
                {{ numero.format(matriz.total) }}
              </td>
            </tr>
          </tfoot>
        </table>
        <div
          class="escala"
          aria-hidden="true"
        >
          <span>Menos</span>
          <span
            v-for="(color, i) in COLORES_CALOR"
            :key="i"
            class="escala__paso"
            :style="{ background: color }"
          />
          <span>Más</span>
        </div>
      </div>

      <div class="matriz-lista">
        <div
          v-for="f in matriz.filas"
          :key="f.codigo"
          class="matriz-lista__grupo"
        >
          <h3 class="matriz-lista__titulo">
            Antes: «{{ f.etiqueta }}»
            <span class="matriz-lista__n">{{ numero.format(f.total) }} respuestas</span>
          </h3>
          <ul
            role="list"
            class="barras"
          >
            <li
              v-for="c in f.celdas"
              :key="c.codigo"
              class="barra"
            >
              <span class="barra__etiqueta">Ahora: {{ c.etiqueta }}</span>
              <span class="barra__fila">
                <span
                  class="barra__pista"
                  aria-hidden="true"
                >
                  <span
                    class="barra__relleno"
                    :style="{ width: `${f.total > 0 ? (c.total / f.total) * 100 : 0}%` }"
                  />
                </span>
                <span class="barra__valor">
                  <strong>{{ numero.format(c.total) }}</strong><span class="sr-only"> respuestas, </span>
                  <span class="barra__pct">{{ formatoPct(f.total > 0 ? c.pctFila : null) }}</span>
                </span>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>
