<script setup lang="ts">
// Vista de estadísticas de la encuesta, protegida con el token de resultados (BIGDAY_RESULTS_TOKEN de Mantix).
// Orquesta el estado (useResultados) y reparte los modelos ya calculados a los componentes de presentación.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import FormularioToken from './components/FormularioToken.vue'
import FrasesRecientes from './components/FrasesRecientes.vue'
import GraficoDistribucion from './components/GraficoDistribucion.vue'
import GraficoNps from './components/GraficoNps.vue'
import MatrizPercepcion from './components/MatrizPercepcion.vue'
import TarjetasKpi from './components/TarjetasKpi.vue'
import { crearClienteResultados } from './lib/api'
import { guardarArchivo } from './lib/descarga'
import {
  destacadoPercepcion,
  formatoFecha,
  modeloDistribucion,
  modeloFrases,
  modeloMatriz,
  modeloNps,
  type IdOpcion,
} from './lib/modelo'
import { crearSesion } from './lib/sesion'
import { useResultados } from './useResultados'

const r = useResultados({
  cliente: crearClienteResultados(),
  sesion: crearSesion(),
  guardar: (blob, nombre) => guardarArchivo(blob, nombre),
})

const IDS_OPCION: IdOpcion[] = ['p1', 'p2', 'p3', 'p4', 'p5']

const total = computed(() => r.datos.value?.total ?? 0)
const distribuciones = computed(() =>
  IDS_OPCION.map((id) => modeloDistribucion(id, r.datos.value?.distribucion[id])),
)
const nps = computed(() => modeloNps(r.datos.value?.distribucion.p6))
const matriz = computed(() => modeloMatriz(r.datos.value?.matrizP2P3))
const destacado = computed(() => destacadoPercepcion(matriz.value))
const frases = computed(() => modeloFrases(r.datos.value?.ultimasFrases))
const actualizado = computed(() => (r.actualizadoEn.value ? formatoFecha(r.actualizadoEn.value) : ''))

const titulo = ref<HTMLElement | null>(null)
const formulario = ref<InstanceType<typeof FormularioToken> | null>(null)

// Foco al cambiar de vista: al entrar, el título del tablero; al salir, el campo del token.
watch(r.vista, async (vista, antes) => {
  await nextTick()
  if (vista === 'listo' && antes !== 'listo') titulo.value?.focus()
  if (vista === 'login' && antes && antes !== 'login') formulario.value?.enfocar()
})

onMounted(() => {
  void r.iniciar()
})
</script>

<template>
  <div class="resultados">
    <main
      v-if="r.vista.value === 'login'"
      class="resultados__acceso"
    >
      <FormularioToken
        ref="formulario"
        :mensaje="r.mensajeLogin.value"
        :enviando="r.entrando.value"
        @entrar="r.entrar"
      />
    </main>

    <main
      v-else-if="r.vista.value === 'cargando'"
      class="resultados__acceso"
    >
      <p
        class="tarjeta estado"
        role="status"
      >
        Cargando resultados…
      </p>
    </main>

    <main
      v-else-if="r.vista.value === 'error'"
      class="resultados__acceso"
    >
      <section
        class="tarjeta estado"
        aria-labelledby="titulo-error"
      >
        <h1
          id="titulo-error"
          class="estado__titulo"
        >
          No se pudieron cargar los resultados
        </h1>
        <p role="alert">
          {{ r.aviso.value }}
        </p>
        <div class="estado__acciones">
          <button
            type="button"
            class="boton-secundario"
            @click="r.actualizar()"
          >
            Reintentar
          </button>
          <button
            type="button"
            class="boton-atras"
            @click="r.salir()"
          >
            Salir
          </button>
        </div>
      </section>
    </main>

    <template v-else>
      <header class="cabecera">
        <div class="cabecera__textos">
          <p class="cabecera__antetitulo">
            Encuesta de experiencia · Parque de Vida Los Olivos
          </p>
          <h1
            ref="titulo"
            class="cabecera__titulo"
            tabindex="-1"
          >
            Resultados del 2.º October Big Day
          </h1>
        </div>
        <div
          class="cabecera__acciones"
          role="group"
          aria-label="Acciones"
        >
          <button
            type="button"
            class="boton-secundario"
            :aria-busy="r.actualizando.value"
            :disabled="r.actualizando.value"
            @click="r.actualizar()"
          >
            {{ r.actualizando.value ? 'Actualizando…' : 'Actualizar' }}
          </button>
          <button
            type="button"
            class="boton-secundario"
            :aria-busy="r.descargando.value"
            :disabled="r.descargando.value"
            @click="r.descargarCsv()"
          >
            {{ r.descargando.value ? 'Descargando…' : 'Descargar CSV' }}
          </button>
          <button
            type="button"
            class="boton-atras"
            @click="r.salir()"
          >
            Salir
          </button>
        </div>
      </header>

      <p
        v-if="r.aviso.value"
        class="aviso"
        role="alert"
      >
        {{ r.aviso.value }}
      </p>

      <main
        class="tablero"
        :class="{ 'tablero--recargando': r.actualizando.value }"
        :aria-busy="r.actualizando.value"
      >
        <TarjetasKpi
          :total="total"
          :nps="nps"
          :destacado="destacado"
          :actualizado="actualizado"
        />

        <section
          v-if="total === 0"
          class="tarjeta estado estado--vacio"
          aria-labelledby="titulo-vacio"
        >
          <h2
            id="titulo-vacio"
            class="estado__titulo"
          >
            Aún no hay respuestas
          </h2>
          <p>Cuando lleguen las primeras respuestas de la encuesta, sus estadísticas aparecerán aquí. Usa «Actualizar» para volver a consultar.</p>
        </section>

        <template v-else>
          <MatrizPercepcion
            :matriz="matriz"
            :destacado="destacado"
          />
          <GraficoNps :modelo="nps" />
          <section
            class="seccion"
            aria-labelledby="titulo-distribucion"
          >
            <h2
              id="titulo-distribucion"
              class="seccion__titulo"
            >
              Respuestas por pregunta
            </h2>
            <div class="rejilla-graficos">
              <GraficoDistribucion
                v-for="d in distribuciones"
                :key="d.id"
                :modelo="d"
              />
            </div>
          </section>
          <FrasesRecientes :frases="frases" />
        </template>
      </main>
    </template>
  </div>
</template>
