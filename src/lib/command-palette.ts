import type { MessageKey } from '../i18n'

export interface CommandItem {
  id: string
  titleKey: MessageKey
  icon: string
  shortcut?: string
  keywords: string[]
  action: () => void | Promise<void>
}

let commandRegistry: CommandItem[] = []

export function registerCommands(commands: CommandItem[]): void {
  commandRegistry = commands
}

export function getCommands(): readonly CommandItem[] {
  return commandRegistry
}

export function matchCommands(query: string, catalog: (key: MessageKey) => string): CommandItem[] {
  const clean = query.trim().slice(1).trim().toLowerCase()
  if (!clean) return commandRegistry

  return commandRegistry.filter(cmd => {
    const title = catalog(cmd.titleKey).toLowerCase()
    if (title.includes(clean)) return true
    return cmd.keywords.some(kw => kw.toLowerCase().includes(clean))
  })
}
