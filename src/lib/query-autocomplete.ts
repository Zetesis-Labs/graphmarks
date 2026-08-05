export interface AutocompleteContext {
  tags?: string[]
  folders?: string[]
  domains?: string[]
}

export interface QuerySuggestion {
  label: string
  replacement: string
  detail?: string
  icon?: string
}

const PREFIXES = [
  { prefix: 'tag:', detail: 'Filtrar por etiqueta', icon: '🏷️' },
  { prefix: 'folder:', detail: 'Filtrar por carpeta', icon: '📁' },
  { prefix: 'domain:', detail: 'Filtrar por dominio', icon: '🌐' },
  { prefix: 'is:', detail: 'Filtrar por estado', icon: '⚡' },
  { prefix: 'sort:', detail: 'Ordenar resultados', icon: '📊' },
  { prefix: 'visits:', detail: 'Rango de visitas (ej: >5)', icon: '◷' },
  { prefix: 'limit:', detail: 'Límite de resultados (ej: 20)', icon: '🔢' }
]

const IS_OPTIONS = [
  { val: 'open', detail: 'Pestañas actualmente abiertas', icon: '⧉' },
  { val: 'unsaved', detail: 'Marcadores sin guardar', icon: '💾' },
  { val: 'ghost', detail: 'Pestañas sueltas (fantasmas)', icon: '👻' },
  { val: 'pinned', detail: 'Nodos con posición fijada', icon: '📍' },
  { val: 'folder', detail: 'Solo carpetas', icon: '📁' },
  { val: 'bm', detail: 'Solo marcadores', icon: '🔖' }
]

const SORT_OPTIONS = [
  { val: 'heat', detail: 'Frecuencia y calor de uso', icon: '🔥' },
  { val: 'visits', detail: 'Número de visitas', icon: '◷' },
  { val: 'degree', detail: 'Conexiones en el grafo', icon: '🌐' },
  { val: 'title', detail: 'Orden alfabético', icon: '🔤' }
]

/**
 * Obtiene sugerencias predictivas de autocompletado según el texto del cursor.
 */
export function getQuerySuggestions(text: string, cursorPos: number, ctx: AutocompleteContext = {}): QuerySuggestion[] {
  const left = text.slice(0, cursorPos)
  const lastWord = left.split(/\s+/).pop() ?? ''

  if (lastWord.startsWith('is:')) {
    const val = lastWord.slice(3).toLowerCase()
    return IS_OPTIONS.filter(o => o.val.startsWith(val)).map(o => ({
      label: `is:${o.val}`,
      replacement: replaceLastWord(left, `is:${o.val}`),
      detail: o.detail,
      icon: o.icon
    }))
  }

  if (lastWord.startsWith('sort:')) {
    const val = lastWord.slice(5).toLowerCase()
    return SORT_OPTIONS.filter(o => o.val.startsWith(val)).map(o => ({
      label: `sort:${o.val}`,
      replacement: replaceLastWord(left, `sort:${o.val}`),
      detail: o.detail,
      icon: o.icon
    }))
  }

  if (lastWord.startsWith('tag:')) {
    const val = lastWord.slice(4).toLowerCase()
    const tags = ctx.tags ?? []
    return tags
      .filter(t => t.toLowerCase().includes(val))
      .slice(0, 8)
      .map(t => ({
        label: `tag:${t}`,
        replacement: replaceLastWord(left, `tag:${t}`),
        detail: 'Etiqueta',
        icon: '🏷️'
      }))
  }

  if (lastWord.startsWith('folder:')) {
    const val = lastWord.slice(7).toLowerCase()
    const folders = ctx.folders ?? []
    return folders
      .filter(f => f.toLowerCase().includes(val))
      .slice(0, 8)
      .map(f => {
        const cleanF = f.includes(' ') ? `"${f}"` : f
        return {
          label: `folder:${cleanF}`,
          replacement: replaceLastWord(left, `folder:${cleanF}`),
          detail: 'Carpeta',
          icon: '📁'
        }
      })
  }

  if (lastWord.startsWith('domain:')) {
    const val = lastWord.slice(7).toLowerCase()
    const domains = ctx.domains ?? []
    return domains
      .filter(d => d.toLowerCase().includes(val))
      .slice(0, 8)
      .map(d => ({
        label: `domain:${d}`,
        replacement: replaceLastWord(left, `domain:${d}`),
        detail: 'Dominio web',
        icon: '🌐'
      }))
  }

  // Sugerir prefijos disponibles
  const term = lastWord.toLowerCase()
  return PREFIXES.filter(p => p.prefix.startsWith(term)).map(p => ({
    label: p.prefix,
    replacement: replaceLastWord(left, p.prefix),
    detail: p.detail,
    icon: p.icon
  }))
}

function replaceLastWord(text: string, newWord: string): string {
  const parts = text.split(/(\s+)/)
  parts[parts.length - 1] = `${newWord} `
  return parts.join('')
}
