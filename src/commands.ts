import { app } from './bus'
import { promptNewBookmark, promptNewFolder } from './dialogs'
import { openHygieneDialog } from './hygiene'
import { unpinAll, zoomToNodes } from './interactions'
import { registerCommands } from './lib/command-palette'
import { saveStore } from './lib/storage'
import { switchView } from './panels'
import { promptSaveSession } from './sessions'
import { openSettingsPanel } from './settings'
import { S } from './state'
import { toggleOnlyOpen } from './tabs'
import { exportData, importData } from './transfer'

/**
 * Catálogo de la paleta (`>`). Vive aparte para que el buscador no tenga que
 * conocer a media aplicación: search solo pinta y ejecuta CommandItem.
 */
export function registerDefaultCommands(): void {
  registerCommands([
    {
      id: 'cmd-new-folder',
      titleKey: 'cmdNewFolder',
      icon: '📁',
      keywords: ['nueva', 'carpeta', 'folder', 'new'],
      action: () => promptNewFolder()
    },
    {
      id: 'cmd-new-bookmark',
      titleKey: 'cmdNewBookmark',
      icon: '🔖',
      keywords: ['nuevo', 'marcador', 'bookmark', 'add'],
      action: () => promptNewBookmark()
    },
    {
      id: 'cmd-view-folders',
      titleKey: 'cmdViewFolders',
      icon: '📂',
      keywords: ['carpetas', 'folders', 'vista'],
      action: () => switchView('folders')
    },
    {
      id: 'cmd-view-tags',
      titleKey: 'cmdViewTags',
      icon: '🏷️',
      keywords: ['tags', 'etiquetas', 'vista'],
      action: () => switchView('tags')
    },
    {
      id: 'cmd-view-domains',
      titleKey: 'cmdViewDomains',
      icon: '🌐',
      keywords: ['dominios', 'domains', 'vista'],
      action: () => switchView('domains')
    },
    {
      id: 'cmd-view-history',
      titleKey: 'cmdViewHistory',
      icon: '◷',
      keywords: ['historial', 'history', 'vista'],
      action: () => switchView('history')
    },
    {
      id: 'cmd-toggle-only-open',
      titleKey: 'cmdToggleOnlyOpen',
      icon: '⧉',
      shortcut: 'º',
      keywords: ['abiertas', 'open', 'filtro'],
      action: () => void toggleOnlyOpen()
    },
    {
      id: 'cmd-toggle-ghosts',
      titleKey: 'cmdToggleGhosts',
      icon: '👻',
      keywords: ['fantasmas', 'ghosts', 'pestañas'],
      action: () => {
        void (async () => {
          S.showGhosts = !S.showGhosts
          await saveStore('ghosts', S.showGhosts)
          app.rebuildSoon()
        })()
      }
    },
    {
      id: 'cmd-save-session',
      titleKey: 'cmdSaveSession',
      icon: '▤',
      keywords: ['sesion', 'session', 'ventanas', 'guardar', 'save'],
      action: () => void promptSaveSession()
    },
    {
      id: 'cmd-unpin-all',
      titleKey: 'cmdUnpinAll',
      icon: '📍',
      keywords: ['desfijar', 'unpin', 'posiciones', 'layout'],
      action: () => unpinAll()
    },
    {
      id: 'cmd-frame-all',
      titleKey: 'cmdFrameAll',
      icon: '⌂',
      keywords: ['encuadrar', 'frame', 'todo', 'zoom'],
      action: () => zoomToNodes(S.nodes, 80)
    },
    {
      id: 'cmd-export',
      titleKey: 'cmdExport',
      icon: '📤',
      keywords: ['exportar', 'export', 'json'],
      action: () => exportData()
    },
    {
      id: 'cmd-import',
      titleKey: 'cmdImport',
      icon: '📥',
      keywords: ['importar', 'import', 'json'],
      action: () => importData()
    },
    {
      id: 'cmd-show-guide',
      titleKey: 'cmdShowGuide',
      icon: '💡',
      keywords: ['guia', 'tour', 'ayuda', 'guide'],
      action: () => app.startGuide()
    },
    {
      id: 'cmd-settings',
      titleKey: 'cmdSettings',
      icon: '⚙',
      keywords: ['ajustes', 'settings', 'preferencias', 'configuracion'],
      action: () => openSettingsPanel()
    },
    {
      id: 'cmd-hygiene',
      titleKey: 'cmdHygiene',
      icon: '🧹',
      keywords: ['higiene', 'duplicados', 'limpiar', 'hygiene', 'duplicates', 'cleanup'],
      action: () => openHygieneDialog()
    }
  ])
}
