import { describe, expect, it } from 'vitest'
import { getQuerySuggestions } from './query-autocomplete'

describe('query-autocomplete', () => {
  const context = {
    tags: ['frontend', 'backend', 'design'],
    folders: ['Proyectos', 'Trabajo', 'Personal'],
    domains: ['github.com', 'google.com']
  }

  it('sugiere prefijos cuando el texto está vacío', () => {
    const suggestions = getQuerySuggestions('', 0, context)
    expect(suggestions.map(s => s.label)).toContain('tag:')
    expect(suggestions.map(s => s.label)).toContain('is:')
  })

  it('sugiere estados para is:', () => {
    const suggestions = getQuerySuggestions('is:o', 4, context)
    expect(suggestions.map(s => s.label)).toContain('is:open')
  })

  it('sugiere etiquetas reales de context para tag:', () => {
    const suggestions = getQuerySuggestions('tag:front', 9, context)
    expect(suggestions.map(s => s.label)).toContain('tag:frontend')
  })

  it('sugiere carpetas reales con comillas si llevan espacios', () => {
    const suggestions = getQuerySuggestions('folder:Proy', 11, context)
    expect(suggestions.map(s => s.label)).toContain('folder:Proyectos')
  })
})
