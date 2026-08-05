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

export interface TokenRange {
  text: string
  start: number
  end: number
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

export function getTokenAtCursor(text: string, cursorPos: number): TokenRange {
  let start = cursorPos
  let end = cursorPos

  while (start > 0 && !/\s/.test(text[start - 1] ?? '')) {
    start--
  }

  while (end < text.length && !/\s/.test(text[end] ?? '')) {
    end++
  }

  return {
    text: text.slice(start, end),
    start,
    end
  }
}

export function replaceTokenAtCursor(
  text: string,
  cursorPos: number,
  newWord: string
): { newText: string; newCursorPos: number } {
  const token = getTokenAtCursor(text, cursorPos)
  const prefix = text.slice(0, token.start)
  const suffix = text.slice(token.end)
  const replacement = `${newWord} `
  return {
    newText: prefix + replacement + suffix,
    newCursorPos: prefix.length + replacement.length
  }
}

/**
 * Obtiene sugerencias predictivas de autocompletado según el token bajo el cursor.
 */
export function getQuerySuggestions(text: string, cursorPos: number, ctx: AutocompleteContext = {}): QuerySuggestion[] {
  const token = getTokenAtCursor(text, cursorPos)
  const lastWord = token.text

  if (lastWord.startsWith('is:')) {
    const val = lastWord.slice(3).toLowerCase()
    return IS_OPTIONS.filter(o => o.val.startsWith(val)).map(o => ({
      label: `is:${o.val}`,
      replacement: replaceTokenAtCursor(text, cursorPos, `is:${o.val}`).newText,
      detail: o.detail,
      icon: o.icon
    }))
  }

  if (lastWord.startsWith('sort:')) {
    const val = lastWord.slice(5).toLowerCase()
    return SORT_OPTIONS.filter(o => o.val.startsWith(val)).map(o => ({
      label: `sort:${o.val}`,
      replacement: replaceTokenAtCursor(text, cursorPos, `sort:${o.val}`).newText,
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
      .map(t => {
        const cleanT = t.includes(' ') ? `"${t}"` : t
        return {
          label: `tag:${cleanT}`,
          replacement: replaceTokenAtCursor(text, cursorPos, `tag:${cleanT}`).newText,
          detail: 'Etiqueta',
          icon: '🏷️'
        }
      })
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
          replacement: replaceTokenAtCursor(text, cursorPos, `folder:${cleanF}`).newText,
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
        replacement: replaceTokenAtCursor(text, cursorPos, `domain:${d}`).newText,
        detail: 'Dominio web',
        icon: '🌐'
      }))
  }

  const term = lastWord.toLowerCase()
  return PREFIXES.filter(p => p.prefix.startsWith(term)).map(p => ({
    label: p.prefix,
    replacement: replaceTokenAtCursor(text, cursorPos, p.prefix).newText,
    detail: p.detail,
    icon: p.icon
  }))
}
