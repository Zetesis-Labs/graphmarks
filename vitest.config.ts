import solid from 'vite-plugin-solid'
import { defineConfig } from 'vitest/config'

/**
 * Los specs pueden importar cualquier módulo de la app, incluidos los que
 * tocan DOM al cargar (ui/dom resuelve sus elementos en el import): el
 * entorno happy-dom más el esqueleto de vitest.setup.ts lo hacen posible.
 * Eso es lo que permite la regla «todos los imports arriba»: ningún módulo
 * necesita import dinámico para ser testeable.
 */
export default defineConfig({
  plugins: [solid()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts']
  }
})
