import type { GraphNode } from './types'

/**
 * Inversión de dependencias mínima: los módulos de dominio necesitan invocar
 * operaciones que orquesta main/interactions (reconstruir, redibujar,
 * encuadrar) sin importar hacia arriba. main.ts asigna las implementaciones
 * en el arranque.
 */
export const app = {
  rebuild: async (_fit: boolean): Promise<void> => {},
  rebuildSoon: (): void => {},
  requestDraw: (): void => {},
  zoomToNodes: (_list: GraphNode[], _pad?: number, _duration?: number): void => {},
  applySearch: (_q: string): void => {},
  clearSearch: (): void => {},
  startGuide: (): void => {},
  /** Aviso al usuario. En el newtab main lo cablea al toast; en el popup el
      no-op deja que el error suba a la superficie del formulario. */
  notify: (_msg: string): void => {}
}
