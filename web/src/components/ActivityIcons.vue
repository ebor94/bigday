<script setup lang="ts">
// Actividades del evento (spec §4): binoculares, cámara, paleta y bastidor de bordado.
// Iconos SVG originales y simples, decorativos (aria-hidden); el nombre va en texto.
const ACTIVIDADES = [
  { clave: 'aves', nombre: 'Avistamiento de aves', color: 'verde' },
  { clave: 'foto', nombre: 'Fotografía', color: 'bermellon' },
  { clave: 'pintura', nombre: 'Pintura', color: 'azul' },
  { clave: 'bordado', nombre: 'Bordado', color: 'mostaza' },
] as const
</script>

<template>
  <ul
    class="actividades"
    role="list"
  >
    <li
      v-for="a in ACTIVIDADES"
      :key="a.clave"
      class="actividad"
    >
      <span
        :class="['actividad__icono', `actividad__icono--${a.color}`]"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 32 32"
          focusable="false"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <template v-if="a.clave === 'aves'">
            <circle
              cx="9.5"
              cy="20"
              r="5.5"
            />
            <circle
              cx="22.5"
              cy="20"
              r="5.5"
            />
            <path d="M6 15.5 8.5 8h4l1 6M26 15.5 23.5 8h-4l-1 6M14 17.5h4" />
          </template>
          <template v-else-if="a.clave === 'foto'">
            <rect
              x="4"
              y="10"
              width="24"
              height="16"
              rx="3.5"
            />
            <path d="M11 10l2-3.5h6L21 10" />
            <circle
              cx="16"
              cy="18"
              r="4.5"
            />
          </template>
          <template v-else-if="a.clave === 'pintura'">
            <path d="M16 4.5C9 4.5 4 9.5 4 15.5S9 27 14 27c2.2 0 2.6-1.6 1.8-3-.9-1.6.2-3 2-3H22c3.4 0 6-2.4 6-5.7C28 9 22.6 4.5 16 4.5Z" />
            <circle
              cx="10"
              cy="14"
              r="1.6"
            />
            <circle
              cx="14.5"
              cy="9.5"
              r="1.6"
            />
            <circle
              cx="20.5"
              cy="10.5"
              r="1.6"
            />
          </template>
          <template v-else>
            <circle
              cx="15"
              cy="17"
              r="10"
            />
            <circle
              cx="15"
              cy="17"
              r="6.5"
              stroke-dasharray="2 2.4"
            />
            <path d="M12.5 6.5 15 4l2.5 2.5M22 9.5l6-6M26 3.5l2 2" />
          </template>
        </svg>
      </span>
      <span class="actividad__nombre">{{ a.nombre }}</span>
    </li>
  </ul>
</template>

<style scoped>
.actividades {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

.actividad {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  text-align: center;
}

.actividad__icono {
  display: grid;
  place-items: center;
  width: 3.25rem;
  height: 3.25rem;
  border: 3px solid var(--c-white);
  border-radius: 50%;
  box-shadow: var(--shadow-soft);
  color: var(--c-white);
}

.actividad__icono svg {
  width: 62%;
  height: 62%;
}

.actividad__icono--verde { background: #2F7D4A; }
.actividad__icono--bermellon { background: #B8461F; }
.actividad__icono--azul { background: #2C6CB0; }
.actividad__icono--mostaza { background: var(--c-mustard); color: var(--c-ink); }

.actividad__nombre {
  font-size: 0.8125rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--c-ink);
}
</style>
