/* Service worker: omnibox «gm» para saltar a marcadores y pestañas. */

const esc = (s: string): string =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

chrome.omnibox.setDefaultSuggestion({ description: chrome.i18n.getMessage('omniboxDefault') })

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  if (!text.trim()) {
    suggest([])
    return
  }
  void chrome.bookmarks.search(text).then(res => {
    suggest(
      res
        .filter(b => b.url)
        .slice(0, 6)
        .map(b => ({
          content: b.url ?? '',
          description: `${esc(b.title || (b.url ?? ''))} <dim>—</dim> <url>${esc(b.url ?? '')}</url>`
        }))
    )
  })
})

chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  void (async () => {
    let url = text
    if (!/^https?:/.test(url)) {
      const res = await chrome.bookmarks.search(text)
      const hit = res.find(b => b.url)?.url
      if (!hit) return
      url = hit
    }
    // si ya hay una pestaña abierta con esa URL (o una subruta), ir a ella
    const tabs = await chrome.tabs.query({})
    const base = url.replace(/\/$/, '')
    const open = tabs.find(t => t.url === url || t.url === base || (t.url ?? '').startsWith(`${base}/`))
    if (open?.id !== undefined) {
      await chrome.tabs.update(open.id, { active: true })
      if (open.windowId !== undefined) await chrome.windows.update(open.windowId, { focused: true })
      return
    }
    if (disposition === 'currentTab') void chrome.tabs.update({ url })
    else void chrome.tabs.create({ url, active: disposition === 'newForegroundTab' })
  })()
})
