/* GraphMarks — service worker: omnibox «gm» para saltar a marcadores/pestañas */
"use strict";

const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

chrome.omnibox.setDefaultSuggestion({
  description: "GraphMarks: buscar en tus marcadores",
});

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  if (!text.trim()) return suggest([]);
  const res = await chrome.bookmarks.search(text);
  suggest(res.filter((b) => b.url).slice(0, 6).map((b) => ({
    content: b.url,
    description: `${esc(b.title || b.url)} <dim>—</dim> <url>${esc(b.url)}</url>`,
  })));
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  let url = text;
  if (!/^https?:/.test(url)) {
    const res = await chrome.bookmarks.search(text);
    url = res.find((b) => b.url)?.url;
    if (!url) return;
  }
  // si ya hay una pestaña abierta con esa URL (o una subruta), ir a ella
  const tabs = await chrome.tabs.query({});
  const base = url.replace(/\/$/, "");
  const open = tabs.find((t) =>
    t.url === url || t.url === base || (t.url || "").startsWith(base + "/"));
  if (open) {
    await chrome.tabs.update(open.id, { active: true });
    await chrome.windows.update(open.windowId, { focused: true });
    return;
  }
  if (disposition === "currentTab") chrome.tabs.update({ url });
  else chrome.tabs.create({ url, active: disposition === "newForegroundTab" });
});
