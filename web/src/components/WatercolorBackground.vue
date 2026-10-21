<script setup lang="ts">
// Fondo acuarela: lavados de color difuminados, textura de papel (feTurbulence)
// y follaje de olivo en las esquinas con parallax ligero.
// Todo el arte es SVG original generado aquí; no hay assets de terceros.
import { ref } from 'vue'
import { useParallax } from '../composables/useParallax'

interface Punto {
  x: number
  y: number
}

interface Hoja {
  x: number
  y: number
  rot: number
  esc: number
  color: string
  opacidad: number
}

interface Rama {
  d: string
  grosor: number
  hojas: Hoja[]
}

// Pseudoaleatorio determinista (mulberry32): el follaje se ve "a mano"
// pero es idéntico en cada carga (capturas estables).
function generador(semilla: number) {
  let s = semilla >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COLORES = ['var(--c-leaf)', 'var(--c-green)', 'var(--c-lime)', 'var(--c-leaf)']

function bezier(p0: Punto, c: Punto, p1: Punto, t: number): Punto {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  }
}

function anguloTangente(p0: Punto, c: Punto, p1: Punto, t: number): number {
  const dx = 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x)
  const dy = 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y)
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

/** Rama de olivo: tallo curvo con hojas alternas a ambos lados. */
function rama(p0: Punto, c: Punto, p1: Punto, n: number, escala: number, semilla: number): Rama {
  const azar = generador(semilla)
  const hojas: Hoja[] = []
  for (let i = 0; i < n; i++) {
    const t = 0.1 + (0.86 * (i + azar() * 0.35)) / n
    const p = bezier(p0, c, p1, t)
    const tangente = anguloTangente(p0, c, p1, t)
    // Hojas opuestas, como en el olivo; a veces falta una para que no se vea rígido.
    for (const lado of [1, -1]) {
      if (azar() < 0.15) continue
      hojas.push({
        x: p.x,
        y: p.y,
        rot: tangente + lado * (34 + azar() * 24),
        esc: escala * (1.05 - t * 0.4) * (0.8 + azar() * 0.35),
        color: COLORES[Math.floor(azar() * COLORES.length)] ?? 'var(--c-leaf)',
        opacidad: 0.6 + azar() * 0.35,
      })
    }
  }
  // Hoja terminal
  hojas.push({
    x: p1.x,
    y: p1.y,
    rot: anguloTangente(p0, c, p1, 1),
    esc: escala * 0.55,
    color: 'var(--c-green)',
    opacidad: 0.7,
  })
  return {
    d: `M${p0.x} ${p0.y} Q${c.x} ${c.y} ${p1.x} ${p1.y}`,
    grosor: 4 * escala,
    hojas,
  }
}

// Ramas que cuelgan desde la esquina superior (se reflejan para la derecha).
const ramasSuperiores: Rama[] = [
  rama({ x: -20, y: 30 }, { x: 170, y: 0 }, { x: 390, y: 140 }, 11, 1.3, 7),
  rama({ x: -20, y: 120 }, { x: 80, y: 130 }, { x: 210, y: 250 }, 8, 1.1, 19),
  rama({ x: 120, y: 28 }, { x: 200, y: 70 }, { x: 240, y: 170 }, 5, 0.95, 31),
  rama({ x: 240, y: 70 }, { x: 330, y: 70 }, { x: 400, y: 30 }, 4, 0.8, 43),
]

// Matas que suben desde la esquina inferior (se reflejan para la derecha).
const ramasInferiores: Rama[] = [
  rama({ x: 30, y: 330 }, { x: 40, y: 180 }, { x: 150, y: 70 }, 9, 1.25, 3),
  rama({ x: -10, y: 330 }, { x: -5, y: 230 }, { x: 60, y: 150 }, 6, 1.1, 11),
  rama({ x: 90, y: 340 }, { x: 160, y: 250 }, { x: 300, y: 210 }, 7, 1.05, 23),
]

const raiz = ref<HTMLElement | null>(null)
useParallax(raiz)
</script>

<template>
  <div
    ref="raiz"
    class="acuarela"
    aria-hidden="true"
  >
    <svg
      class="acuarela__defs"
      width="0"
      height="0"
      focusable="false"
    >
      <defs>
        <!-- Textura de papel: ruido fino en escala de grises -->
        <filter
          id="acuarela-papel"
          x="0"
          y="0"
          width="100%"
          height="100%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="3"
            seed="4"
            result="ruido"
          />
          <feColorMatrix
            in="ruido"
            type="matrix"
            values="0 0 0 0 0.36  0 0 0 0 0.3  0 0 0 0 0.2  1.7 0 0 0 -0.6"
          />
        </filter>
        <!-- Bordes irregulares de pigmento para el follaje -->
        <filter
          id="acuarela-borde"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.035"
            numOctaves="2"
            seed="9"
            result="mancha"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="mancha"
            scale="7"
            xChannelSelector="R"
            yChannelSelector="G"
            result="desplazado"
          />
          <feGaussianBlur
            in="desplazado"
            stdDeviation="0.6"
          />
        </filter>
        <!-- Hoja de olivo: lanceolada, apunta hacia +x desde el origen -->
        <path
          id="acuarela-hoja"
          d="M0 0 C10 -9 34 -11 58 0 C34 11 10 9 0 0 Z"
        />
      </defs>
    </svg>

    <div class="acuarela__lavado">
      <span class="mancha mancha--cielo-a" />
      <span class="mancha mancha--cielo-b" />
      <span class="mancha mancha--cielo-c" />
      <span class="mancha mancha--hoja-a" />
      <span class="mancha mancha--hoja-b" />
      <span class="mancha mancha--lima" />
    </div>

    <svg
      class="acuarela__papel"
      preserveAspectRatio="none"
      focusable="false"
    >
      <rect
        width="100%"
        height="100%"
        filter="url(#acuarela-papel)"
      />
    </svg>

    <div
      v-for="esquina in ['sup-izq', 'sup-der']"
      :key="esquina"
      :class="['acuarela__follaje', `acuarela__follaje--${esquina}`]"
      data-profundidad="0.7"
    >
      <span class="acuarela__copa" />
      <svg
        viewBox="0 0 400 300"
        focusable="false"
      >
        <g filter="url(#acuarela-borde)">
          <g
            v-for="(r, i) in ramasSuperiores"
            :key="i"
          >
            <path
              :d="r.d"
              class="acuarela__tallo"
              :style="{ strokeWidth: r.grosor }"
            />
            <use
              v-for="(h, j) in r.hojas"
              :key="j"
              href="#acuarela-hoja"
              :transform="`translate(${h.x} ${h.y}) rotate(${h.rot}) scale(${h.esc})`"
              :style="{ fill: h.color, opacity: h.opacidad }"
            />
          </g>
        </g>
      </svg>
    </div>

    <div
      v-for="esquina in ['inf-izq', 'inf-der']"
      :key="esquina"
      :class="['acuarela__follaje', `acuarela__follaje--${esquina}`]"
      data-profundidad="1"
    >
      <span class="acuarela__copa" />
      <svg
        viewBox="0 0 320 320"
        focusable="false"
      >
        <g filter="url(#acuarela-borde)">
          <g
            v-for="(r, i) in ramasInferiores"
            :key="i"
          >
            <path
              :d="r.d"
              class="acuarela__tallo"
              :style="{ strokeWidth: r.grosor }"
            />
            <use
              v-for="(h, j) in r.hojas"
              :key="j"
              href="#acuarela-hoja"
              :transform="`translate(${h.x} ${h.y}) rotate(${h.rot}) scale(${h.esc})`"
              :style="{ fill: h.color, opacity: h.opacidad }"
            />
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>
