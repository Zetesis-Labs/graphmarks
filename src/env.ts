/** Detección de entorno: extensión real o preview standalone (file://). */
export const IS_EXT = typeof chrome !== 'undefined' && !!chrome.bookmarks

export const HAS_STORAGE = IS_EXT && !!chrome.storage?.local
export const HAS_SYNC = IS_EXT && !!chrome.storage?.sync
/** El endpoint /_favicon/ es exclusivo de Chrome; en Firefox el permiso ni existe. */
export const HAS_FAVICON_API = IS_EXT && !!chrome.runtime.getManifest?.().permissions?.includes('favicon')

/** Pestañas simuladas para la vista previa fuera de Chrome (mutable: closeTab). */
export const MOCK_TABS = [
  { id: 1, windowId: 1, title: 'Gemini', url: 'https://gemini.google.com/app', active: true, lastAccessed: 9 },
  {
    id: 2,
    windowId: 1,
    title: 'demo-app - Argo CD',
    url: 'https://argocd.example.dev/applications/argocd/demo-app',
    lastAccessed: 8
  },
  { id: 3, windowId: 1, title: 'PR #42 · acme/webapp', url: 'https://github.com/acme/webapp/pull/42', lastAccessed: 7 },
  { id: 4, windowId: 1, title: 'Issues · acme/webapp', url: 'https://github.com/acme/webapp/issues', lastAccessed: 6 },
  {
    id: 5,
    windowId: 1,
    title: 'Posts - Admin',
    url: 'http://localhost:3000/admin/collections/posts',
    lastAccessed: 5
  },
  { id: 6, windowId: 1, title: 'Grafana - Dashboards', url: 'https://grafana.example.dev/dashboards', lastAccessed: 4 },
  {
    id: 7,
    windowId: 2,
    title: 'YouTube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    active: true,
    lastAccessed: 2
  },
  { id: 8, windowId: 2, title: 'Hacker News', url: 'https://news.ycombinator.com/item?id=1234567', lastAccessed: 1 },
  // huérfanas (sin marcador) para demostrar los nodos fantasma
  { id: 9, windowId: 1, title: 'Deployments – Vercel', url: 'https://vercel.com/acme/deployments', lastAccessed: 6 },
  { id: 10, windowId: 1, title: 'Recientes – Figma', url: 'https://www.figma.com/files/recent', lastAccessed: 5 },
  {
    id: 11,
    windowId: 1,
    title: 'Design System – Figma',
    url: 'https://www.figma.com/design/abc123/design-system',
    lastAccessed: 4
  },
  {
    id: 12,
    windowId: 2,
    title: 'Bandeja de entrada — Proton Mail',
    url: 'https://mail.proton.me/u/0/inbox',
    lastAccessed: 3
  }
]

export type MockTab = (typeof MOCK_TABS)[number] & { active?: boolean; pinned?: boolean; groupId?: number }
