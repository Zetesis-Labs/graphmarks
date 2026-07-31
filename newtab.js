/* GraphMarks — marcadores como grafo de fuerzas, editable y con vistas
   alternativas: carpetas, etiquetas (tags) y dominios. */
"use strict";

const IS_EXT = typeof chrome !== "undefined" && !!chrome.bookmarks;

const canvas = document.getElementById("graph");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");
const searchBox = document.getElementById("search");
const legendEl = document.getElementById("legend");
const listPanel = document.getElementById("list-panel");
const listToggle = document.getElementById("list-toggle");
const emptyEl = document.getElementById("empty");
const menuEl = document.getElementById("ctxmenu");
const dlg = document.getElementById("dlg");
const toastEl = document.getElementById("toast");
const viewsEl = document.getElementById("views");

function showFatal(msg) {
  emptyEl.hidden = false;
  emptyEl.innerHTML = "<h2>Error en GraphMarks</h2><p></p>";
  emptyEl.querySelector("p").textContent = msg;
}
window.addEventListener("error", (ev) => showFatal(ev.message || "error desconocido"));
window.addEventListener("unhandledrejection", (ev) =>
  showFatal(String(ev.reason?.message || ev.reason || "promesa rechazada")));

const SERIES_VARS = ["--series-1", "--series-2", "--series-3", "--series-4",
  "--series-5", "--series-6", "--series-7", "--series-8"];
const MAX_SLOTS = SERIES_VARS.length;
const UNTAGGED = "t:·";
const LOOSE_DOM = "d:·";

let COLORS = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  COLORS = {
    surface: v("--surface-1"),
    page: v("--page"),
    ink: v("--text-primary"),
    ink2: v("--text-secondary"),
    muted: v("--text-muted"),
    grid: v("--gridline"),
    baseline: v("--baseline"),
    other: v("--other"),
    series: SERIES_VARS.map(v),
  };
}
readColors();

// ---------- estado ----------
let viewMode = "folders";   // folders | tags | domains
let tagsMap = {};           // url -> [tags]
let nodes = [], links = [], byId = new Map(), neighbors = new Map();
let clusters = [];
let clusterOf = new Map();
let lastTree = [];
let simulation = null;
let tf = d3.zoomIdentity;
let hoverNode = null;
let focusSet = null;
let searchQuery = "";
let dropTarget = null;
const favicons = new Map();
let openTabs = new Map();   // id de nodo bm -> pestañas abiertas que le casan
let hoverAux = null;        // {type:"sat",tab} | {type:"plus"} bajo el cursor
let onlyOpen = false;       // filtro: mostrar solo marcadores con pestaña abierta
let lastOpenKey = "";       // firma del conjunto abierto, para detectar cambios
let allBms = [];            // todos los bm del árbol (sin podar), para el matching
let ghostTabs = [];         // pestañas abiertas que no casan con ningún marcador
let showGhosts = true;      // pintar las pestañas sueltas como nodos fantasma
const OTHER_CONTAINER = "2"; // «Otros marcadores»
let pinned = {};            // layout manual por vista: { vista: { id: {x,y} } }
let layoutTimer = null;
function pinsOfView() { return pinned[viewMode] ??= {}; }
function saveLayoutSoon() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => saveStore("layout", pinned), 400);
}
let heatByUrl = new Map();  // url de marcador -> calor 0..1 según historial
let candidates = [];        // sitios muy visitados sin marcador (historial)
let candIgnore = [];        // sugerencias descartadas por el usuario
let showCands = false;      // mostrar candidatos como nodos en el grafo

function strHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const MOCK_CANDIDATES = [
  { url: "https://vercel.com/dashboard", title: "Vercel Dashboard", host: "vercel.com", score: 40 },
  { url: "https://tailscale.com/kb", title: "Tailscale Docs", host: "tailscale.com", score: 30 },
  { url: "https://obsidian.md", title: "Obsidian", host: "obsidian.md", score: 25 },
  { url: "https://docs.docker.com", title: "Docker Docs", host: "docs.docker.com", score: 20 },
];
const SAT_R = 3.6, PLUS_R = 5, MAX_SATS = 6;

// pestañas simuladas para la vista previa fuera de Chrome
const MOCK_TABS = [
  { id: 1, windowId: 1, title: "Gemini", url: "https://gemini.google.com/app", active: true, lastAccessed: 9 },
  { id: 2, windowId: 1, title: "demo-app - Argo CD", url: "https://argocd.example.dev/applications/argocd/demo-app", lastAccessed: 8 },
  { id: 3, windowId: 1, title: "PR #42 · acme/webapp", url: "https://github.com/acme/webapp/pull/42", lastAccessed: 7 },
  { id: 4, windowId: 1, title: "Issues · acme/webapp", url: "https://github.com/acme/webapp/issues", lastAccessed: 6 },
  { id: 5, windowId: 1, title: "Posts - Admin", url: "http://localhost:3000/admin/collections/posts", lastAccessed: 5 },
  { id: 6, windowId: 1, title: "Grafana - Dashboards", url: "https://grafana.example.dev/dashboards", lastAccessed: 4 },
  { id: 7, windowId: 2, title: "YouTube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", active: true, lastAccessed: 2 },
  { id: 8, windowId: 2, title: "Hacker News", url: "https://news.ycombinator.com/item?id=1234567", lastAccessed: 1 },
  // huérfanas (sin marcador) para demostrar los nodos fantasma
  { id: 9, windowId: 1, title: "Deployments – Vercel", url: "https://vercel.com/acme/deployments", lastAccessed: 6 },
  { id: 10, windowId: 1, title: "Recientes – Figma", url: "https://www.figma.com/files/recent", lastAccessed: 5 },
  { id: 11, windowId: 1, title: "Design System – Figma", url: "https://www.figma.com/design/abc123/design-system", lastAccessed: 4 },
  { id: 12, windowId: 2, title: "Bandeja de entrada — Proton Mail", url: "https://mail.proton.me/u/0/inbox", lastAccessed: 3 },
];

// ---------- almacenamiento (chrome.storage.local o localStorage) ----------
const HAS_STORAGE = IS_EXT && !!chrome.storage?.local;
async function loadStore(key, def) {
  if (HAS_STORAGE) {
    const o = await chrome.storage.local.get(key);
    return o[key] ?? def;
  }
  try { return JSON.parse(localStorage.getItem("gm-" + key)) ?? def; }
  catch { return def; }
}
async function saveStore(key, val) {
  if (HAS_STORAGE) await chrome.storage.local.set({ [key]: val });
  else localStorage.setItem("gm-" + key, JSON.stringify(val));
}

// ---------- etiquetas ----------
function tagsOf(url) { return tagsMap[url] || []; }
function allTags() {
  const c = new Map();
  for (const ts of Object.values(tagsMap))
    for (const t of ts) c.set(t, (c.get(t) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
}
function normTags(raw) {
  return [...new Set(raw.split(/[,\s]+/)
    .map((t) => t.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean))];
}
async function setTags(url, tags) {
  if (tags.length) tagsMap[url] = tags;
  else delete tagsMap[url];
  await persistTags();
  rebuildSoon();
}

// --- persistencia de etiquetas: chrome.storage.sync troceado en buckets ---
// (límite de 8 KB por item en sync; repartimos las URLs por hash)
const HAS_SYNC = IS_EXT && !!chrome.storage?.sync;
const TAG_BUCKETS = 12;
let lastBuckets = {};
function tagBucket(url) { return "tags_" + (strHash(url) % TAG_BUCKETS); }

async function loadTags() {
  if (HAS_SYNC) {
    try {
      const all = await chrome.storage.sync.get(null);
      const merged = {};
      lastBuckets = {};
      for (const [k, v] of Object.entries(all)) {
        if (!k.startsWith("tags_")) continue;
        Object.assign(merged, v);
        lastBuckets[k] = JSON.stringify(v);
      }
      if (!Object.keys(merged).length) {
        // migración desde el almacenamiento local de versiones anteriores
        const local = await loadStore("tags", {});
        if (Object.keys(local).length) {
          tagsMap = local;
          await persistTags();
          return local;
        }
      }
      return merged;
    } catch { /* caer a local */ }
  }
  return loadStore("tags", {});
}

async function persistTags() {
  if (HAS_SYNC) {
    try {
      const buckets = {};
      for (let i = 0; i < TAG_BUCKETS; i++) buckets["tags_" + i] = {};
      for (const [url, ts] of Object.entries(tagsMap))
        buckets[tagBucket(url)][url] = ts;
      const changed = {};
      for (const [k, v] of Object.entries(buckets)) {
        const s = JSON.stringify(v);
        if (lastBuckets[k] !== s) { changed[k] = v; lastBuckets[k] = s; }
      }
      if (Object.keys(changed).length) await chrome.storage.sync.set(changed);
      return;
    } catch (e) {
      toast("Sync no disponible, guardando en local: " + (e.message || e));
    }
  }
  await saveStore("tags", tagsMap);
}

// --- exportar / importar (tags, layout, descartes) ---
function exportData() {
  const data = {
    app: "graphmarks", version: 1, exported: new Date().toISOString(),
    tags: tagsMap, layout: pinned, candIgnore,
  };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "graphmarks-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
}
function importData() {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = "application/json";
  inp.addEventListener("change", async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.tags) { tagsMap = { ...tagsMap, ...data.tags }; await persistTags(); }
      if (data.layout) { pinned = data.layout; await saveStore("layout", pinned); }
      if (Array.isArray(data.candIgnore)) {
        candIgnore = [...new Set([...candIgnore, ...data.candIgnore])];
        await saveStore("candIgnore", candIgnore);
      }
      toast("Datos importados");
      rebuildSoon();
    } catch (e) {
      toast("No se pudo importar: " + (e.message || e));
    }
  });
  inp.click();
}

// ---------- historial: calor de marcadores y candidatos ----------
const candchipEl = document.getElementById("candchip");

function visibleCands() {
  const bmUrls = new Set(allBms.map((b) => b.url));
  return candidates.filter((c) => !candIgnore.includes(c.url) && !bmUrls.has(c.url));
}
function updateCandChip() {
  const n = visibleCands().length;
  candchipEl.hidden = !n;
  candchipEl.textContent = `✦ ${n} sugerencia${n === 1 ? "" : "s"}`;
  candchipEl.classList.toggle("active", showCands);
}

async function computeHistory() {
  if (!IS_EXT) {
    heatByUrl = new Map(allBms.map((b) => [b.url, (strHash(b.url) % 90) / 100]));
    candidates = MOCK_CANDIDATES;
    updateCandChip();
    return;
  }
  if (!chrome.history) { candidates = []; updateCandChip(); return; }
  const cached = await loadStore("histCache", null);
  if (cached && Date.now() - cached.ts < 30 * 60e3) {
    heatByUrl = new Map(Object.entries(cached.heat));
    candidates = cached.cands;
    updateCandChip();
    return;
  }
  const items = await chrome.history.search({
    text: "", startTime: Date.now() - 45 * 864e5, maxResults: 5000,
  });
  const hostIdx = new Map();
  for (const b of allBms) {
    if (!hostIdx.has(b.mHost)) hostIdx.set(b.mHost, []);
    hostIdx.get(b.mHost).push(b);
  }
  const NOISE = /login|log-in|signin|sign-in|logout|oauth|callback|password|verify|\/search\b|accounts\.google|\?q=/i;
  const heatAgg = new Map(), candAgg = new Map();
  for (const it of items) {
    if (!/^https?:/.test(it.url || "")) continue;
    let u;
    try { u = new URL(it.url); } catch { continue; }
    const host = u.host.toLowerCase(), path = normPath(u.pathname);
    let best = null;
    for (const b of hostIdx.get(host) || []) {
      const hit = b.mPath === "/" || path === b.mPath ||
        path.startsWith(b.mPath + "/");
      if (hit && (!best || b.mPath.length > best.mPath.length)) best = b;
    }
    if (best) {
      const a = heatAgg.get(best.url) || { v: 0, last: 0 };
      a.v += Math.min(it.visitCount || 1, 50);
      a.last = Math.max(a.last, it.lastVisitTime || 0);
      heatAgg.set(best.url, a);
    } else {
      if (NOISE.test(it.url) || path.length > 80) continue;
      const key = `${u.protocol}//${u.host}${path === "/" ? "" : path}` || it.url;
      const a = candAgg.get(key) || { url: key, title: "", host: u.host, v: 0, t: 0, last: 0 };
      a.v += Math.min(it.visitCount || 1, 100);
      a.t += it.typedCount || 0;
      a.last = Math.max(a.last, it.lastVisitTime || 0);
      if (!a.title && it.title) a.title = it.title;
      candAgg.set(key, a);
    }
  }
  const now = Date.now();
  const rec = (last) => now - last < 7 * 864e5 ? 1 : now - last < 30 * 864e5 ? 0.7 : 0.4;
  heatByUrl = new Map([...heatAgg].map(([url, a]) =>
    [url, Math.min(1, Math.log1p(a.v) / Math.log1p(150)) * rec(a.last)]));
  candidates = [...candAgg.values()]
    .map((a) => ({ url: a.url, title: a.title || a.url, host: a.host,
      score: a.v + a.t * 8, last: a.last }))
    .filter((c) => c.score >= 12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  await saveStore("histCache", {
    ts: now, heat: Object.fromEntries(heatByUrl), cands: candidates,
  });
  updateCandChip();
}

function addCandidateNodes() {
  if (!showCands) return;
  for (const c of visibleCands()) {
    addNode({
      id: "c:" + c.url, type: "cand", title: short(c.title, 48), url: c.url,
      host: c.host, tags: [], cluster: "cand", parentId: null, hubs: [],
    });
    if (IS_EXT) loadFavicon(c.url);
  }
}

async function dismissCandidate(url) {
  candIgnore.push(url);
  await saveStore("candIgnore", candIgnore);
  updateCandChip();
  toast("Sugerencia descartada — no volverá a aparecer");
  rebuildSoon();
}

candchipEl.addEventListener("click", async () => {
  showCands = !showCands;
  await saveStore("cands", showCands);
  updateCandChip();
  await rebuild(false);
  if (showCands) zoomToNodes(nodes, 80);
});

// ---------- API de marcadores (Chrome o mock en memoria) ----------
let mockNoticeShown = false;
let mockIdCounter = 100000;

function mockLocate(id, list = window.MOCK_TREE[0].children, parent = null) {
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n.id === id) return { node: n, siblings: list, index: i, parent };
    if (n.children) {
      const hit = mockLocate(id, n.children, n);
      if (hit) return hit;
    }
  }
  return null;
}
function mockChanged() {
  if (!mockNoticeShown) {
    mockNoticeShown = true;
    toast("Vista previa: los cambios no se guardan en Chrome");
  }
  rebuildSoon();
}
const mockApi = {
  async create({ parentId, title, url }) {
    const p = mockLocate(parentId);
    if (!p) throw new Error("carpeta no encontrada");
    const n = url ? { id: String(++mockIdCounter), title, url }
      : { id: String(++mockIdCounter), title, children: [] };
    (p.node.children = p.node.children || []).push(n);
    mockChanged();
    return n;
  },
  async update(id, changes) {
    const hit = mockLocate(id);
    if (hit) Object.assign(hit.node, changes);
    mockChanged();
  },
  async move(id, { parentId }) {
    const hit = mockLocate(id);
    const dest = mockLocate(parentId);
    if (!hit || !dest) return;
    hit.siblings.splice(hit.index, 1);
    (dest.node.children = dest.node.children || []).push(hit.node);
    mockChanged();
  },
  async removeTree(id) {
    const hit = mockLocate(id);
    if (hit) hit.siblings.splice(hit.index, 1);
    mockChanged();
  },
};
mockApi.remove = mockApi.removeTree;

const api = IS_EXT ? {
  create: (p) => chrome.bookmarks.create(p),
  update: (id, ch) => chrome.bookmarks.update(id, ch),
  move: (id, dest) => chrome.bookmarks.move(id, dest),
  remove: (id) => chrome.bookmarks.remove(id),
  removeTree: (id) => chrome.bookmarks.removeTree(id),
} : mockApi;

async function safeOp(fn) {
  try { await fn(); }
  catch (e) { toast("No se pudo completar: " + (e.message || e)); }
}

// ---------- datos ----------
async function loadTree() {
  if (IS_EXT) return chrome.bookmarks.getTree();
  return window.MOCK_TREE || [];
}

const bmCount = (n) => (n.url ? 1 :
  (n.children || []).reduce((s, c) => s + bmCount(c), 0));

function normPath(p) {
  p = (p || "/").replace(/\/+$/, "");
  return p || "/";
}
function makeBmNode(it, folderId) {
  let host = "", mPath = "/";
  try {
    const u = new URL(it.url);
    host = u.host;
    mPath = normPath(u.pathname);
  } catch { /* skip */ }
  return {
    id: "b" + it.id, raw: it.id, type: "bm",
    title: it.title || it.url, url: it.url, host,
    mHost: host.toLowerCase(), mPath,
    folderId, tags: tagsOf(it.url),
  };
}

function initCommon() {
  nodes = []; links = []; byId = new Map(); clusterOf = new Map(); clusters = [];
}
const addNode = (n) => { nodes.push(n); byId.set(n.id, n); return n; };
const addLink = (a, b, type) => links.push({ source: a, target: b, type });

function finishGraph(withHostLinks) {
  if (withHostLinks) {
    const byHost = new Map();
    for (const n of nodes) {
      if (n.type === "bm" && n.host) {
        if (!byHost.has(n.host)) byHost.set(n.host, []);
        byHost.get(n.host).push(n);
      }
    }
    for (const group of byHost.values()) {
      if (group.length < 2 || group.length > 6) continue;
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++)
          addLink(group[i].id, group[j].id, "host");
    }
  }
  rebuildNeighbors();
  if (IS_EXT) for (const n of nodes) if (n.type === "bm") loadFavicon(n.url);
}

function rebuildNeighbors() {
  neighbors = new Map(nodes.map((n) => [n.id, new Set()]));
  for (const l of links) {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    neighbors.get(s)?.add(t);
    neighbors.get(t)?.add(s);
  }
}

function assignSlots(list, noSlotIds = new Set()) {
  clusters = list.sort((a, b) => b.count - a.count);
  let slot = 0;
  for (const c of clusters) {
    c.slot = (!noSlotIds.has(c.id) && slot < MAX_SLOTS) ? slot++ : -1;
    clusterOf.set(c.id, c);
  }
}

// --- vista carpetas ---
function buildGraphFolders(tree) {
  initCommon();
  const containers = (tree[0] || { children: [] }).children || [];

  const perDepth = [];
  (function scan(items, d) {
    for (const it of items) {
      if (!it.url && it.children) {
        if (bmCount(it) > 0) (perDepth[d] = perDepth[d] || []).push(it);
        scan(it.children, d + 1);
      }
    }
  })(containers.flatMap((c) => c.children || []), 1);
  let clusterDepth = 1;
  for (let d = 1; d < perDepth.length + 1; d++) {
    if ((perDepth[d] || []).length >= 2) { clusterDepth = d; break; }
  }

  function walk(items, parent, depth, clusterId) {
    for (const it of items) {
      if (it.url) {
        if (!/^https?:/.test(it.url)) continue;
        const n = makeBmNode(it, parent ? parent.id : null);
        n.cluster = clusterId || (parent ? parent.id : "misc");
        n.parentId = parent ? parent.id : null;
        addNode(n);
        if (parent) addLink(parent.id, n.id, "tree");
      } else if (it.children && bmCount(it) > 0) {
        const isCluster = depth === clusterDepth;
        const node = addNode({
          id: it.id, raw: it.id, type: "folder",
          title: it.title || "(sin nombre)", count: bmCount(it),
          cluster: isCluster ? it.id : clusterId,
          parentId: parent ? parent.id : null,
        });
        if (parent) addLink(parent.id, it.id, "tree");
        walk(it.children, node, depth + 1, isCluster ? it.id : clusterId);
      }
    }
  }
  for (const c of containers) {
    const loose = (c.children || []).filter((x) => x.url);
    let parent = null;
    if (loose.length) {
      parent = addNode({
        id: c.id, raw: c.id, type: "folder",
        title: c.title || "Marcadores", count: loose.length,
        cluster: c.id, parentId: null,
      });
    }
    walk((c.children || []).filter((x) => !x.url), null, 1, null);
    if (parent) walk(loose, parent, 1, c.id);
  }

  assignSlots(nodes
    .filter((n) => n.type === "folder" && n.cluster === n.id)
    .map((n) => ({ id: n.id, title: n.title, count: n.count })));
  finishGraph(true);
}

// --- marcadores planos (para vistas tags/dominios) ---
function flatBookmarks(tree) {
  const out = [];
  (function walk(items, folderId) {
    for (const it of items) {
      if (it.url) {
        if (/^https?:/.test(it.url)) out.push(makeBmNode(it, folderId));
      } else if (it.children) {
        walk(it.children, it.id);
      }
    }
  })((tree[0] || { children: [] }).children || [], null);
  return out;
}

// --- vista tags ---
function buildGraphTags(tree) {
  initCommon();
  const bms = flatBookmarks(tree);
  const hubCount = new Map();
  for (const b of bms) {
    b.hubs = b.tags.length ? b.tags.map((t) => "t:" + t) : [UNTAGGED];
    for (const h of b.hubs) hubCount.set(h, (hubCount.get(h) || 0) + 1);
  }
  for (const [hid, count] of hubCount) {
    addNode({
      id: hid, type: "folder", subtype: "tag",
      tag: hid === UNTAGGED ? null : hid.slice(2),
      title: hid === UNTAGGED ? "· sin etiquetar" : "#" + hid.slice(2),
      count, cluster: hid, parentId: null,
    });
  }
  for (const b of bms) {
    b.cluster = b.hubs[0];
    b.parentId = b.hubs[0];
    addNode(b);
    for (const h of b.hubs) addLink(h, b.id, "tree");
  }
  assignSlots(
    [...hubCount.entries()].map(([id, count]) =>
      ({ id, title: byId.get(id).title, count })),
    new Set([UNTAGGED]));
  finishGraph(false);
}

// --- vista dominios ---
function domainKey(host) {
  const h = host.replace(/^www\./, "");
  if (/^[\d.:]+$/.test(h) || h.includes("localhost")) return h;
  const parts = h.split(".");
  return parts.length <= 2 ? h : parts.slice(-2).join(".");
}
function buildGraphDomains(tree) {
  initCommon();
  const bms = flatBookmarks(tree);
  const groups = new Map();
  for (const b of bms) {
    const d = b.host ? domainKey(b.host) : "·";
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(b);
  }
  const loose = [];
  for (const [dom, list] of groups) {
    if (list.length < 2) { loose.push(...list); continue; }
    const hid = "d:" + dom;
    addNode({
      id: hid, type: "folder", subtype: "domain", title: dom,
      count: list.length, cluster: hid, parentId: null,
    });
    for (const b of list) {
      b.hubs = [hid]; b.cluster = hid; b.parentId = hid;
      addNode(b);
      addLink(hid, b.id, "tree");
    }
  }
  if (loose.length) {
    addNode({
      id: LOOSE_DOM, type: "folder", subtype: "domain", title: "· sueltos",
      count: loose.length, cluster: LOOSE_DOM, parentId: null,
    });
    for (const b of loose) {
      b.hubs = [LOOSE_DOM]; b.cluster = LOOSE_DOM; b.parentId = LOOSE_DOM;
      addNode(b);
      addLink(LOOSE_DOM, b.id, "tree");
    }
  }
  assignSlots(
    nodes.filter((n) => n.type === "folder")
      .map((n) => ({ id: n.id, title: n.title, count: n.count })),
    new Set([LOOSE_DOM]));
  finishGraph(false);
}

function buildGraph(tree) {
  if (viewMode === "tags") buildGraphTags(tree);
  else if (viewMode === "domains") buildGraphDomains(tree);
  else buildGraphFolders(tree);
}

function loadFavicon(url) {
  if (favicons.has(url)) return;
  const img = new Image();
  const rec = { img, ok: false };
  favicons.set(url, rec);
  img.onload = () => { rec.ok = true; requestDraw(); };
  img.src = chrome.runtime.getURL(
    "/_favicon/?pageUrl=" + encodeURIComponent(url) + "&size=32");
}

function folderOptions(excludeIds = new Set()) {
  const out = [];
  (function walk(items, depth) {
    for (const it of items) {
      if (it.url || excludeIds.has(it.id)) continue;
      out.push({ id: it.id, title: it.title || "(sin nombre)", depth });
      if (it.children) walk(it.children, depth + 1);
    }
  })((lastTree[0]?.children) || [], 0);
  return out;
}

// ---------- colores / radios ----------
function clusterColor(cid) {
  const c = clusterOf.get(cid);
  if (!c || c.slot < 0) return COLORS.other;
  return COLORS.series[c.slot];
}
function nodeColor(n) {
  if (n.type === "ghost" || n.subtype === "ghosthub") return COLORS.muted;
  if (n.type === "cand") return COLORS.series[3];
  if (n.type === "folder" && n.cluster !== n.id && !clusterOf.get(n.cluster))
    return COLORS.muted;
  return clusterColor(n.cluster);
}
function radius(n) {
  if (n.type === "folder")
    return Math.min(9 + Math.sqrt(n.count) * 1.7, 26);
  if (n.type === "bm") return 3.9 + (n.heat ?? 0.35) * 2.8;
  return 5;
}

// ---------- simulación ----------
function startSimulation(alpha) {
  if (simulation) simulation.stop();
  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id)
      .distance((l) => l.type === "host" ? 130 :
        (l.target.type === "folder" ? 110 : 36))
      .strength((l) => l.type === "host" ? 0.04 :
        (l.target.type === "folder" ? 0.55 : 0.45)))
    .force("charge", d3.forceManyBody()
      .strength((d) => d.type === "folder" ? -340 : -38))
    .force("collide", d3.forceCollide((d) => radius(d) + 4))
    .force("x", d3.forceX().strength(0.035))
    .force("y", d3.forceY().strength(0.045))
    .alpha(alpha)
    .on("tick", requestDraw);
}

// ---------- dibujo ----------
let drawPending = false;
function requestDraw() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(() => { drawPending = false; draw(); });
}

function currentFocus() {
  if (hoverNode && !dropTarget) {
    const s = new Set([hoverNode.id]);
    for (const nb of neighbors.get(hoverNode.id) || []) s.add(nb);
    return s;
  }
  return focusSet;
}

function draw() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr; canvas.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.page;
  ctx.fillRect(0, 0, w, h);
  ctx.translate(tf.x, tf.y);
  ctx.scale(tf.k, tf.k);

  const focus = currentFocus();
  const k = tf.k;
  const inFocus = (id) => !focus || focus.has(id);

  for (const l of links) {
    const on = focus && focus.has(l.source.id) && focus.has(l.target.id);
    ctx.globalAlpha = focus ? (on ? 0.9 : 0.04)
      : (l.type === "host" ? 0.16 : 0.34);
    ctx.strokeStyle = on ? COLORS.ink2 : COLORS.muted;
    ctx.lineWidth = (l.type === "host" ? 0.7 : 1) / k;
    ctx.beginPath();
    ctx.moveTo(l.source.x, l.source.y);
    ctx.lineTo(l.target.x, l.target.y);
    ctx.stroke();
  }

  for (const n of nodes) {
    const r = radius(n);
    ctx.globalAlpha = inFocus(n.id) ? 1 : 0.12;
    const col = nodeColor(n);
    const fav = (n.type === "bm" || n.type === "ghost" || n.type === "cand") &&
      k >= 1.15 ? favicons.get(n.url) : null;

    // halo de calor: marcadores muy usados según el historial
    if (n.type === "bm" && (n.heat ?? 0) > 0.65) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 2.1, 0, Math.PI * 2);
      ctx.fillStyle = col;
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * 0.1;
      ctx.fill();
      ctx.globalAlpha = a;
    }

    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    if (n.type === "ghost" || n.type === "cand") {
      // fantasmas (pestañas sueltas) y candidatos del historial: punteados
      ctx.setLineDash([3 / Math.max(k, 1), 2.5 / Math.max(k, 1)]);
      if (fav && fav.ok) {
        ctx.fillStyle = COLORS.surface;
        ctx.fill();
        ctx.save();
        ctx.clip();
        const s = (r - 1) * 2;
        ctx.drawImage(fav.img, n.x - s / 2, n.y - s / 2, s, s);
        ctx.restore();
      } else {
        ctx.fillStyle = COLORS.page;
        ctx.fill();
      }
      ctx.lineWidth = 1.5 / Math.max(k, 1);
      ctx.strokeStyle = col;
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (n.type === "folder" && n.subtype) {
      // hubs de tag/dominio/fantasma: huecos, para distinguirlos de carpetas
      if (n.subtype === "ghosthub")
        ctx.setLineDash([4 / Math.max(k, 1), 3 / Math.max(k, 1)]);
      ctx.fillStyle = COLORS.page;
      ctx.fill();
      ctx.lineWidth = 2.5 / Math.max(k, 1);
      ctx.strokeStyle = col;
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (fav && fav.ok) {
      ctx.fillStyle = COLORS.surface;
      ctx.fill();
      ctx.save();
      ctx.clip();
      const s = (r - 1) * 2;
      ctx.drawImage(fav.img, n.x - s / 2, n.y - s / 2, s, s);
      ctx.restore();
      ctx.lineWidth = 1.8 / Math.max(k, 1);
      ctx.strokeStyle = col;
      ctx.stroke();
    } else {
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 1.5 / Math.max(k, 1);
      ctx.strokeStyle = COLORS.page;
      ctx.stroke();
    }
    // anillo indicador de pestaña abierta
    if (openTabs.has(n.id)) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 3.5 / Math.max(k, 1), 0, Math.PI * 2);
      ctx.lineWidth = 2 / Math.max(k, 1);
      ctx.strokeStyle = col;
      ctx.stroke();
    }
    // punto de nodo fijado (layout manual)
    if (pinsOfView()[n.id]) {
      ctx.beginPath();
      ctx.arc(n.x + r * 0.85, n.y - r * 0.85, 1.7 / Math.max(k, 1), 0, Math.PI * 2);
      ctx.fillStyle = COLORS.ink;
      ctx.fill();
    }
  }

  if (dropTarget) {
    ctx.globalAlpha = 1;
    ctx.setLineDash([5 / k, 4 / k]);
    ctx.lineWidth = 2 / k;
    ctx.strokeStyle = COLORS.ink;
    ctx.beginPath();
    ctx.arc(dropTarget.x, dropTarget.y, radius(dropTarget) + 7 / k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // resultado seleccionado en el buscador: anillo de resalte
  if (searchFocusNode && byId.has(searchFocusNode.id)) {
    const n = searchFocusNode;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2.5 / k;
    ctx.strokeStyle = COLORS.ink;
    ctx.beginPath();
    ctx.arc(n.x, n.y, radius(n) + 8 / k, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const halo = (x, y, text) => {
    ctx.lineWidth = 3 / k;
    ctx.strokeStyle = COLORS.page;
    ctx.strokeText(text, x, y);
  };
  for (const n of nodes) {
    const r = radius(n);
    const focused = inFocus(n.id);
    if (n.type === "folder") {
      if (!focused && focus) continue;
      ctx.globalAlpha = focused ? 1 : 0.5;
      ctx.font = `600 ${12 / k}px system-ui, sans-serif`;
      halo(n.x, n.y + r + 4 / k, n.title);
      ctx.fillStyle = (n === hoverNode || n === dropTarget)
        ? COLORS.ink : COLORS.ink2;
      ctx.fillText(n.title, n.x, n.y + r + 4 / k);
    } else {
      const show = (k >= 1.5 && focused) ||
        ((n.type === "ghost" || n.type === "cand") && k >= 0.8 && focused) ||
        (focus && focused) || n === hoverNode || n === searchFocusNode;
      if (!show) continue;
      ctx.globalAlpha = 1;
      ctx.font = `${10.5 / k}px system-ui, sans-serif`;
      const label = n.title.length > 42 ? n.title.slice(0, 41) + "…" : n.title;
      halo(n.x, n.y + r + 3 / k, label);
      ctx.fillStyle = n === hoverNode ? COLORS.ink : COLORS.muted;
      ctx.fillText(label, n.x, n.y + r + 3 / k);
    }
  }

  // satélites de pestañas abiertas y botón "+" (por encima de todo)
  for (const id of openTabs.keys()) {
    const n = byId.get(id);
    if (!n) continue;
    ctx.globalAlpha = inFocus(n.id) ? 1 : 0.12;
    const col = nodeColor(n);
    const ss = satScale();
    for (const s of satPositions(n)) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, SAT_R * ss, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 1.2 * ss;
      ctx.strokeStyle = COLORS.page;
      ctx.stroke();
      if (s.tab.active) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.4 * ss, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.page;
        ctx.fill();
      }
    }
    if (hoverNode === n) {
      const p = plusPosition(n);
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLUS_R * ss, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.surface;
      ctx.fill();
      ctx.lineWidth = 1.5 * ss;
      ctx.strokeStyle = col;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 2.4 * ss, p.y);
      ctx.lineTo(p.x + 2.4 * ss, p.y);
      ctx.moveTo(p.x, p.y - 2.4 * ss);
      ctx.lineTo(p.x, p.y + 2.4 * ss);
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1.4 * ss;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- pestañas abiertas ----------
// tamaño constante en pantalla: al alejar el zoom crecen en unidades de mundo
function satScale() { return 1 / Math.min(tf.k, 1); }
function satPositions(n) {
  const tabs = (openTabs.get(n.id) || []).slice(0, MAX_SATS);
  const dist = radius(n) + 9 * satScale();
  const m = tabs.length;
  return tabs.map((t, i) => {
    const a = (-90 + (i - (m - 1) / 2) * 34) * Math.PI / 180;
    return { x: n.x + dist * Math.cos(a), y: n.y + dist * Math.sin(a), tab: t };
  });
}
function plusPosition(n) {
  const dist = radius(n) + 9 * satScale();
  const a = 45 * Math.PI / 180;
  return { x: n.x + dist * Math.cos(a), y: n.y + dist * Math.sin(a) };
}

const tabcountEl = document.getElementById("tabcount");
function tabStatus(text, warn) {
  tabcountEl.hidden = !text;
  tabcountEl.textContent = text || "";
  tabcountEl.classList.toggle("warn", !!warn);
}
async function computeOpenTabs(bms) {
  let tabs;
  if (IS_EXT) {
    if (!chrome.tabs) {
      tabStatus("⧉ sin acceso a pestañas — falta el permiso «tabs»", true);
      return new Map();
    }
    tabs = await chrome.tabs.query({});
    const withUrl = tabs.filter((t) => t.url).length;
    if (tabs.length && !withUrl) {
      tabStatus("⧉ Chrome oculta las URLs — acepta el permiso «tabs» en chrome://extensions", true);
      return new Map();
    }
  } else {
    tabs = MOCK_TABS;
  }
  const map = new Map(), ghosts = [];
  for (const t of tabs) {
    if (!/^https?:/.test(t.url || "")) continue;
    let u;
    try { u = new URL(t.url); } catch { continue; }
    const host = u.host.toLowerCase(), path = normPath(u.pathname);
    let best = null;
    for (const b of bms) {
      if (b.mHost !== host) continue;
      const hit = b.mPath === "/" || path === b.mPath ||
        path.startsWith(b.mPath + "/");
      if (hit && (!best || b.mPath.length > best.mPath.length)) best = b;
    }
    const info = {
      id: t.id, windowId: t.windowId, title: t.title || t.url,
      url: t.url, host: u.host, active: !!t.active, last: t.lastAccessed || 0,
    };
    if (best) {
      if (!map.has(best.id)) map.set(best.id, []);
      map.get(best.id).push(info);
    } else {
      ghosts.push(info);
    }
  }
  for (const list of map.values()) list.sort((a, b) => b.last - a.last);
  return { map, ghosts };
}
function openKey(map) { return [...map.keys()].sort().join("|"); }
function sessionKey() {
  return openKey(openTabs) + "‖" +
    ghostTabs.map((g) => g.id).sort((a, b) => a - b).join(",");
}
function updateBadge() {
  const matched = [...openTabs.values()].reduce((s, l) => s + l.length, 0);
  if (tabcountEl.classList.contains("warn")) return;
  const loose = ghostTabs.length ? ` · ${ghostTabs.length} suelta${ghostTabs.length === 1 ? "" : "s"}` : "";
  tabStatus(onlyOpen
    ? `⧉ solo abiertas (${matched}) — º para ver todo`
    : `⧉ ${matched} abierta${matched === 1 ? "" : "s"}${loose}`);
  tabcountEl.classList.toggle("active", onlyOpen);
}
async function refreshTabs() {
  tabcountEl.classList.remove("warn");
  const res = await computeOpenTabs(allBms);
  openTabs = res.map;
  ghostTabs = res.ghosts;
  updateBadge();
  const key = sessionKey();
  const changed = key !== lastOpenKey;
  lastOpenKey = key;
  if (changed && (onlyOpen || showGhosts)) { rebuildSoon(); return; }
  requestDraw();
}

// nodos fantasma: pestañas sin marcador, agrupadas por dominio
function addGhostNodes() {
  if (!showGhosts) return;
  const byDom = new Map();
  for (const g of ghostTabs) {
    const dom = domainKey(g.host.toLowerCase());
    if (!byDom.has(dom)) byDom.set(dom, []);
    byDom.get(dom).push(g);
  }
  for (const [dom, list] of byDom) {
    let hubId = null;
    if (list.length >= 2) {
      hubId = "gh:" + dom;
      addNode({
        id: hubId, type: "folder", subtype: "ghosthub", title: dom,
        count: list.length, cluster: "ghost", parentId: null,
      });
    }
    for (const t of list) {
      addNode({
        id: "g" + t.id, type: "ghost", title: t.title, url: t.url,
        host: t.host, tab: t, tags: [], cluster: "ghost",
        parentId: hubId, hubs: hubId ? [hubId] : [],
      });
      if (hubId) addLink(hubId, "g" + t.id, "tree");
      if (IS_EXT) loadFavicon(t.url);
    }
  }
}

// poda el grafo dejando solo marcadores abiertos y sus hubs/carpetas ancestras
function pruneToOpen() {
  const keep = new Set(openTabs.keys());
  for (const n of nodes)
    if (n.type === "ghost" || n.type === "cand") keep.add(n.id);
  for (const id of [...keep]) {
    const n = byId.get(id);
    if (!n) { keep.delete(id); continue; }
    for (const h of n.hubs || []) keep.add(h);
    let p = n.parentId;
    while (p && !keep.has(p)) { keep.add(p); p = byId.get(p)?.parentId; }
  }
  nodes = nodes.filter((n) => keep.has(n.id));
  byId = new Map(nodes.map((n) => [n.id, n]));
  links = links.filter((l) => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    return keep.has(s) && keep.has(t);
  });
  rebuildNeighbors();
}

async function toggleOnlyOpen() {
  onlyOpen = !onlyOpen;
  await saveStore("onlyOpen", onlyOpen);
  await rebuild(false);
  zoomToNodes(nodes, 80);
}
tabcountEl.addEventListener("click", toggleOnlyOpen);
let tabsTimer = null;
function rescanTabsSoon() {
  clearTimeout(tabsTimer);
  tabsTimer = setTimeout(refreshTabs, 250);
}

async function activateTab(tab) {
  if (!IS_EXT) {
    toast(`Vista previa: iría a la pestaña «${short(tab.title)}»`);
    return;
  }
  try {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    const self = await chrome.tabs.getCurrent();
    if (self && self.id !== tab.id) chrome.tabs.remove(self.id);
  } catch (e) {
    toast("No se pudo ir a la pestaña: " + (e.message || e));
    rescanTabsSoon();
  }
}

// ---------- utilidades de grafo ----------
function findAt(px, py) {
  const [x, y] = tf.invert([px, py]);
  const n = simulation && simulation.find(x, y, 30 / tf.k);
  if (!n) return null;
  const d = Math.hypot(n.x - x, n.y - y);
  return d <= radius(n) + 7 / tf.k ? n : null;
}

// nodo o elemento auxiliar (satélite de pestaña / botón "+") bajo el puntero
function findHit(px, py) {
  const [x, y] = tf.invert([px, py]);
  for (const id of openTabs.keys()) {
    const n = byId.get(id);
    if (!n) continue;
    for (const s of satPositions(n))
      if (Math.hypot(s.x - x, s.y - y) <= SAT_R * satScale() + 4 / tf.k)
        return { node: n, aux: { type: "sat", tab: s.tab } };
    if (hoverNode === n) {
      const p = plusPosition(n);
      if (Math.hypot(p.x - x, p.y - y) <= PLUS_R * satScale() + 4 / tf.k)
        return { node: n, aux: { type: "plus" } };
    }
  }
  return { node: findAt(px, py), aux: null };
}

function findFolderAt(px, py, exclude = new Set()) {
  const [x, y] = tf.invert([px, py]);
  let best = null, bestD = Infinity;
  for (const n of nodes) {
    if (n.type !== "folder" || exclude.has(n.id)) continue;
    if (viewMode === "folders" && n.subtype) continue;   // solo carpetas reales
    if (viewMode === "tags" && n.subtype !== "tag") continue; // solo hubs de tag
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= radius(n) + 10 / tf.k && d < bestD) { best = n; bestD = d; }
  }
  return best;
}

// miembros de un hub: subárbol real (carpetas) o marcadores vinculados (tag/dominio)
function members(hub) {
  if (hub.subtype)
    return [hub, ...nodes.filter((n) => n.hubs && n.hubs.includes(hub.id))];
  const ids = new Set([hub.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id); grew = true;
      }
    }
  }
  return nodes.filter((n) => ids.has(n.id));
}

function zoomToNodes(list, pad = 60, duration = 550) {
  if (!list.length) return;
  const xs = list.map((n) => n.x), ys = list.map((n) => n.y);
  const [x0, x1] = [Math.min(...xs) - pad, Math.max(...xs) + pad];
  const [y0, y1] = [Math.min(...ys) - pad, Math.max(...ys) + pad];
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const k = Math.min(4, 0.95 / Math.max((x1 - x0) / w, (y1 - y0) / h));
  const t = d3.zoomIdentity
    .translate(w / 2, h / 2).scale(k)
    .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  d3.select(canvas).transition().duration(duration)
    .call(zoom.transform, t);
}

// ---------- zoom / drag (soltar sobre hub: mover carpeta o añadir tag) ----------
const zoom = d3.zoom()
  .scaleExtent([0.15, 5])
  .filter((ev) => {
    if (ev.type === "mousedown" || ev.type === "touchstart") {
      const [px, py] = d3.pointer(ev, canvas);
      return !findHit(px, py).node;
    }
    return !ev.button;
  })
  .on("zoom", (ev) => { tf = ev.transform; requestDraw(); });

const ADOPTABLE = new Set(["ghost", "cand"]);
function dropExcludes(subject) {
  if (viewMode === "domains") return null;          // sin semántica de soltado
  if (viewMode === "tags") {
    if (subject.type !== "bm" && !ADOPTABLE.has(subject.type)) return null;
    return new Set([...(subject.hubs || []), UNTAGGED]);
  }
  if (ADOPTABLE.has(subject.type)) return new Set(subject.hubs || []);
  const ex = new Set([subject.id]);
  if (subject.parentId) ex.add(subject.parentId);
  if (subject.type === "folder")
    for (const d of members(subject)) ex.add(d.id);
  return ex;
}

// adopción: crear un marcador a partir de una pestaña suelta o un candidato
async function adopt(subj, parentId, tag) {
  const created = await api.create({
    parentId, title: subj.title, url: subj.url,
  });
  if (tag) await setTags(subj.url, [...tagsOf(subj.url), tag]);
  const where = tag ? `#${tag}` : `«${short(byId.get(parentId)?.title ?? "carpeta")}»`;
  toast(`«${short(subj.title)}» guardado en ${where}`, () => safeOp(async () => {
    await api.remove(created.id);
    if (tag) await setTags(subj.url, tagsOf(subj.url).filter((t) => t !== tag));
  }));
}

const drag = d3.drag()
  .subject((ev) => {
    const h = findHit(ev.x, ev.y);
    return h.aux ? null : h.node;    // los satélites no se arrastran
  })
  .on("start", (ev) => {
    canvas.classList.add("dragging");
    hideMenu();
    if (!ev.active) simulation.alphaTarget(0.25).restart();
    ev.subject.fx = ev.subject.x;
    ev.subject.fy = ev.subject.y;
  })
  .on("drag", (ev) => {
    const [px, py] = d3.pointer(ev, canvas);
    const [x, y] = tf.invert([px, py]);
    ev.subject.fx = x;
    ev.subject.fy = y;
    const ex = dropExcludes(ev.subject);
    dropTarget = ex ? findFolderAt(px, py, ex) : null;
    requestDraw();
  })
  .on("end", (ev) => {
    canvas.classList.remove("dragging");
    if (!ev.active) simulation.alphaTarget(0);
    if (!dropTarget) {
      // arrastrar fija el nodo: layout manual persistente por vista
      ev.subject.fx = ev.subject.x;
      ev.subject.fy = ev.subject.y;
      pinsOfView()[ev.subject.id] = { x: ev.subject.x, y: ev.subject.y };
      saveLayoutSoon();
    } else {
      ev.subject.fx = null;
      ev.subject.fy = null;
    }
    if (dropTarget) {
      const subj = ev.subject, target = dropTarget;
      dropTarget = null;
      if (ADOPTABLE.has(subj.type)) {
        safeOp(() => viewMode === "tags"
          ? adopt(subj, OTHER_CONTAINER, target.tag)
          : adopt(subj, target.raw));
      } else if (viewMode === "tags") {
        const oldTags = tagsOf(subj.url);
        safeOp(async () => {
          await setTags(subj.url, [...oldTags, target.tag]);
          toast(`#${target.tag} añadida a «${short(subj.title)}»`,
            () => setTags(subj.url, oldTags));
        });
      } else {
        const oldParent = subj.parentId;
        safeOp(async () => {
          await api.move(subj.raw, { parentId: target.raw });
          toast(`«${short(subj.title)}» movido a «${short(target.title)}»`,
            oldParent ? () => safeOp(() =>
              api.move(subj.raw, { parentId: byId.get(oldParent)?.raw ?? oldParent })) : null);
        });
      }
    }
    requestDraw();
  });

d3.select(canvas).call(drag).call(zoom);

// ---------- hover / click ----------
canvas.addEventListener("mousemove", (ev) => {
  if (ev.buttons) return;
  const h = findHit(ev.offsetX, ev.offsetY);
  const n = h.node;
  const changed = n !== hoverNode ||
    h.aux?.type !== hoverAux?.type || h.aux?.tab !== hoverAux?.tab;
  hoverNode = n;
  hoverAux = h.aux;
  if (changed) {
    canvas.classList.toggle("pointing", !!n);
    requestDraw();
  }
  if (n) {
    tooltip.hidden = false;
    tooltip.innerHTML = `<span class="t"></span><span class="u"></span><span class="tags"></span>`;
    let title = n.title, sub, tagLine = "";
    if (h.aux?.type === "sat") {
      title = h.aux.tab.title;
      sub = "clic: ir a la pestaña abierta";
    } else if (h.aux?.type === "plus") {
      title = "Abrir en pestaña nueva";
      sub = n.url;
    } else if (n.type === "bm") {
      sub = n.url;
      const open = openTabs.get(n.id);
      if (open?.length) sub += `  ·  ${open.length} pestaña${open.length > 1 ? "s" : ""} abierta${open.length > 1 ? "s" : ""}`;
      tagLine = n.tags.length ? n.tags.map((t) => "#" + t).join("  ") : "";
    } else {
      sub = `${n.count} marcadores`;
    }
    tooltip.querySelector(".t").textContent = title;
    tooltip.querySelector(".u").textContent = sub;
    tooltip.querySelector(".tags").textContent = tagLine;
    tooltip.querySelector(".tags").style.display = tagLine ? "" : "none";
    const pad = 14;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    const r = tooltip.getBoundingClientRect();
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
  } else {
    tooltip.hidden = true;
  }
});
canvas.addEventListener("mouseleave", () => {
  hoverNode = null; hoverAux = null; tooltip.hidden = true; requestDraw();
});

canvas.addEventListener("click", (ev) => {
  if (!menuEl.hidden) { hideMenu(); return; }
  const h = findHit(ev.offsetX, ev.offsetY);
  const n = h.node;
  if (!n) { clearSearch(); return; }
  if (h.aux?.type === "sat") { activateTab(h.aux.tab); return; }
  if (h.aux?.type === "plus") { window.open(n.url); return; }
  if (n.type === "ghost") { activateTab(n.tab); return; }
  if (n.type === "cand") {
    if (ev.metaKey || ev.ctrlKey) window.open(n.url);
    else window.location.href = n.url;
    return;
  }
  if (n.type === "bm") {
    if (ev.metaKey || ev.ctrlKey) { window.open(n.url); return; }
    const open = openTabs.get(n.id);
    if (open?.length) activateTab(open[0]);
    else window.location.href = n.url;
  } else {
    zoomToNodes(members(n), 90);
  }
});

// ---------- pin / layout manual ----------
function unpinNode(n) {
  const pins = pinsOfView();
  if (!pins[n.id]) return;
  delete pins[n.id];
  n.fx = null;
  n.fy = null;
  saveLayoutSoon();
  simulation.alpha(0.25).restart();
}
function unpinAll() {
  pinned[viewMode] = {};
  for (const n of nodes) { n.fx = null; n.fy = null; }
  saveLayoutSoon();
  simulation.alpha(0.5).restart();
  toast("Todos los nodos sueltos — la física recoloca la vista");
}
function pinItem(n) {
  return pinsOfView()[n.id]
    ? [{ label: "Soltar posición fijada", action: () => unpinNode(n) }]
    : [];
}
canvas.addEventListener("dblclick", (ev) => {
  const n = findAt(ev.offsetX, ev.offsetY);
  if (n && n.type === "folder") unpinNode(n);
});

// ---------- menú contextual ----------
function short(s, n = 34) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function hideMenu() { menuEl.hidden = true; }

function showMenu(x, y, items) {
  menuEl.innerHTML = "";
  for (const it of items) {
    if (it.sep) {
      const hr = document.createElement("div");
      hr.className = "sep";
      menuEl.appendChild(hr);
      continue;
    }
    const b = document.createElement("button");
    b.textContent = it.label;
    if (it.danger) b.classList.add("danger");
    b.addEventListener("click", () => { hideMenu(); it.action(); });
    menuEl.appendChild(b);
  }
  menuEl.hidden = false;
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.min(x, innerWidth - r.width - 8) + "px";
  menuEl.style.top = Math.min(y, innerHeight - r.height - 8) + "px";
}

canvas.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  tooltip.hidden = true;
  const n = findAt(ev.offsetX, ev.offsetY);
  if (!n) {
    showMenu(ev.clientX, ev.clientY, [
      { label: "Nueva carpeta…", action: () => promptNewFolder() },
      { label: "Nuevo marcador…", action: () => promptNewBookmark() },
      { sep: true },
      {
        label: showGhosts ? "Ocultar pestañas sueltas" : "Mostrar pestañas sueltas",
        action: async () => {
          showGhosts = !showGhosts;
          await saveStore("ghosts", showGhosts);
          rebuildSoon();
        },
      },
      { label: "Soltar todos los nodos", action: () => unpinAll() },
      { label: "Encuadrar todo", action: () => zoomToNodes(nodes, 80) },
      { sep: true },
      { label: "Exportar datos (JSON)…", action: () => exportData() },
      { label: "Importar datos…", action: () => importData() },
    ]);
  } else if (n.type === "bm") {
    const open = openTabs.get(n.id) || [];
    showMenu(ev.clientX, ev.clientY, [
      ...(open.length ? [{
        label: `Ir a la pestaña abierta${open.length > 1 ? ` (${open.length})` : ""}`,
        action: () => activateTab(open[0]),
      }] : []),
      { label: "Abrir", action: () => { window.location.href = n.url; } },
      { label: "Abrir en pestaña nueva", action: () => window.open(n.url) },
      { sep: true },
      { label: "Etiquetas…", action: () => promptTags(n) },
      { label: "Renombrar…", action: () => promptRename(n) },
      { label: "Editar URL…", action: () => promptUrl(n) },
      { label: "Mover a carpeta…", action: () => promptMove(n) },
      ...pinItem(n),
      { sep: true },
      { label: "Eliminar", danger: true, action: () => confirmDelete(n) },
    ]);
  } else if (n.type === "ghost") {
    showMenu(ev.clientX, ev.clientY, [
      { label: "Ir a la pestaña", action: () => activateTab(n.tab) },
      { label: "Guardar como marcador…", action: () => promptAdopt(n) },
      { sep: true },
      { label: "Cerrar pestaña", danger: true, action: () => closeTab(n.tab) },
    ]);
  } else if (n.type === "cand") {
    showMenu(ev.clientX, ev.clientY, [
      { label: "Abrir", action: () => { window.location.href = n.url; } },
      { label: "Abrir en pestaña nueva", action: () => window.open(n.url) },
      { label: "Guardar como marcador…", action: () => promptAdopt(n) },
      { sep: true },
      { label: "Descartar sugerencia", danger: true, action: () => dismissCandidate(n.url) },
    ]);
  } else if (n.subtype === "ghosthub") {
    showMenu(ev.clientX, ev.clientY, [
      { label: "Encuadrar", action: () => zoomToNodes(members(n), 90) },
    ]);
  } else if (n.subtype === "tag") {
    showMenu(ev.clientX, ev.clientY, [
      { label: "Encuadrar", action: () => zoomToNodes(members(n), 90) },
      ...(n.tag ? [
        { sep: true },
        { label: "Renombrar etiqueta…", action: () => promptRenameTag(n.tag) },
        { label: `Eliminar etiqueta (${n.count})`, danger: true, action: () => confirmDeleteTag(n.tag) },
      ] : []),
    ]);
  } else if (n.subtype === "domain") {
    showMenu(ev.clientX, ev.clientY, [
      { label: "Encuadrar", action: () => zoomToNodes(members(n), 90) },
    ]);
  } else {
    showMenu(ev.clientX, ev.clientY, [
      { label: "Encuadrar clúster", action: () => zoomToNodes(members(n), 90) },
      { sep: true },
      { label: "Renombrar…", action: () => promptRename(n) },
      { label: "Etiquetar contenido…", action: () => promptTagFolder(n) },
      { label: "Nueva subcarpeta…", action: () => promptNewFolder(n) },
      { label: "Nuevo marcador aquí…", action: () => promptNewBookmark(n) },
      { label: "Mover a carpeta…", action: () => promptMove(n) },
      ...pinItem(n),
      { sep: true },
      { label: `Eliminar carpeta (${n.count})`, danger: true, action: () => confirmDelete(n) },
    ]);
  }
});
document.addEventListener("click", (ev) => {
  if (!menuEl.contains(ev.target)) hideMenu();
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") hideMenu();
});

// ---------- diálogos ----------
function openDialog({ title, fields = [], submitLabel = "Guardar", danger = false, note }, onSubmit) {
  dlg.innerHTML = "";
  const h = document.createElement("h3");
  h.textContent = title;
  dlg.appendChild(h);
  const form = document.createElement("form");
  form.method = "dialog";
  const inputs = {};
  for (const f of fields) {
    const lab = document.createElement("label");
    lab.textContent = f.label;
    let inp;
    if (f.type === "select") {
      inp = document.createElement("select");
      for (const o of f.options) {
        const opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
        if (o.value === f.value) opt.selected = true;
        inp.appendChild(opt);
      }
    } else {
      inp = document.createElement("input");
      inp.type = f.type === "tags" ? "text" : (f.type || "text");
      inp.value = f.value || "";
      if (f.placeholder) inp.placeholder = f.placeholder;
      if (f.required) inp.required = true;
    }
    inp.name = f.name;
    inputs[f.name] = inp;
    lab.appendChild(inp);
    form.appendChild(lab);
    if (f.type === "tags" && f.cloud?.length) {
      const cloud = document.createElement("div");
      cloud.className = "tagcloud";
      for (const [t, cnt] of f.cloud) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = `#${t} ${cnt}`;
        b.addEventListener("click", () => {
          const cur = normTags(inp.value);
          inp.value = (cur.includes(t)
            ? cur.filter((x) => x !== t)
            : [...cur, t]).join(", ");
          inp.focus();
        });
        cloud.appendChild(b);
      }
      form.appendChild(cloud);
    }
  }
  if (note) {
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = note;
    form.appendChild(p);
  }
  const row = document.createElement("div");
  row.className = "actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancelar";
  cancel.addEventListener("click", () => dlg.close());
  const ok = document.createElement("button");
  ok.type = "submit";
  ok.className = danger ? "primary danger" : "primary";
  ok.textContent = submitLabel;
  row.append(cancel, ok);
  form.appendChild(row);
  form.addEventListener("submit", () => {
    const values = {};
    for (const [k, inp] of Object.entries(inputs)) values[k] = inp.value.trim();
    onSubmit(values);
  });
  dlg.appendChild(form);
  dlg.showModal();
  const first = form.querySelector("input, select");
  if (first) { first.focus(); if (first.select) first.select(); }
}

function promptTags(n) {
  openDialog({
    title: `Etiquetas de «${short(n.title)}»`,
    fields: [{
      name: "tags", label: "Etiquetas (separadas por comas)", type: "tags",
      value: n.tags.join(", "), cloud: allTags().slice(0, 24),
    }],
  }, (v) => setTags(n.url, normTags(v.tags)));
}

function promptTagFolder(folder) {
  openDialog({
    title: `Etiquetar todo «${short(folder.title)}»`,
    note: `Añade las etiquetas a los ${folder.count} marcadores de la carpeta (sin quitar las existentes).`,
    fields: [{
      name: "tags", label: "Etiquetas a añadir", type: "tags",
      value: "", cloud: allTags().slice(0, 24),
    }],
    submitLabel: "Etiquetar",
  }, async (v) => {
    const add = normTags(v.tags);
    if (!add.length) return;
    for (const m of members(folder)) {
      if (m.type !== "bm") continue;
      tagsMap[m.url] = [...new Set([...tagsOf(m.url), ...add])];
    }
    await persistTags();
    rebuildSoon();
  });
}

function promptRenameTag(tag) {
  openDialog({
    title: `Renombrar #${tag}`,
    fields: [{ name: "name", label: "Nuevo nombre", value: tag, required: true }],
  }, async (v) => {
    const to = normTags(v.name)[0];
    if (!to || to === tag) return;
    for (const [url, ts] of Object.entries(tagsMap))
      tagsMap[url] = [...new Set(ts.map((t) => t === tag ? to : t))];
    await persistTags();
    rebuildSoon();
  });
}

function confirmDeleteTag(tag) {
  openDialog({
    title: `¿Eliminar la etiqueta #${tag}?`,
    note: "Se quitará de todos los marcadores. Los marcadores no se tocan.",
    submitLabel: "Eliminar",
    danger: true,
  }, async () => {
    for (const [url, ts] of Object.entries(tagsMap)) {
      const left = ts.filter((t) => t !== tag);
      if (left.length) tagsMap[url] = left;
      else delete tagsMap[url];
    }
    await persistTags();
    rebuildSoon();
  });
}

function promptAdopt(n) {
  openDialog({
    title: "Guardar como marcador",
    fields: [
      { name: "title", label: "Título", value: n.title, required: true },
      folderSelectField("dest", "Carpeta", folderOptions()[0]?.id ?? ""),
    ],
    submitLabel: "Guardar",
  }, (v) => safeOp(() => adopt({ ...n, title: v.title }, v.dest)));
}

async function closeTab(tab) {
  if (!IS_EXT) {
    const i = MOCK_TABS.findIndex((t) => t.id === tab.id);
    if (i >= 0) MOCK_TABS.splice(i, 1);
    toast(`Vista previa: cerraría «${short(tab.title)}»`);
    rescanTabsSoon();
    return;
  }
  try { await chrome.tabs.remove(tab.id); }
  catch (e) { toast("No se pudo cerrar: " + (e.message || e)); }
}

function promptRename(n) {
  openDialog({
    title: n.type === "bm" ? "Renombrar marcador" : "Renombrar carpeta",
    fields: [{ name: "title", label: "Nombre", value: n.title, required: true }],
  }, (v) => safeOp(() => api.update(n.raw, { title: v.title })));
}

function promptUrl(n) {
  openDialog({
    title: "Editar URL",
    fields: [{ name: "url", label: "URL", value: n.url, type: "url", required: true }],
  }, (v) => safeOp(() => api.update(n.raw, { url: v.url })));
}

function folderSelectField(name, label, value, excludeIds) {
  return {
    name, label, type: "select", value,
    options: folderOptions(excludeIds).map((f) => ({
      value: f.id, label: "  ".repeat(f.depth) + f.title,
    })),
  };
}

function promptMove(n) {
  const exclude = new Set([n.id]);
  if (n.type === "folder" && !n.subtype)
    for (const d of members(n)) exclude.add(d.id);
  openDialog({
    title: `Mover «${short(n.title)}»`,
    fields: [folderSelectField("dest", "Carpeta de destino",
      n.folderId ?? n.parentId ?? "", exclude)],
    submitLabel: "Mover",
  }, (v) => safeOp(() => api.move(n.raw, { parentId: v.dest })));
}

function promptNewFolder(parent) {
  const fields = [{ name: "title", label: "Nombre", required: true, placeholder: "Nueva carpeta" }];
  if (!parent) fields.push(folderSelectField("dest", "Dentro de",
    folderOptions()[0]?.id ?? ""));
  openDialog({ title: "Nueva carpeta", fields, submitLabel: "Crear" },
    (v) => safeOp(() => api.create({
      parentId: parent ? parent.raw : v.dest, title: v.title,
    })));
}

function promptNewBookmark(parent) {
  const fields = [
    { name: "title", label: "Título", required: true },
    { name: "url", label: "URL", type: "url", required: true, placeholder: "https://…" },
  ];
  if (!parent) fields.push(folderSelectField("dest", "Carpeta",
    folderOptions()[0]?.id ?? ""));
  openDialog({ title: "Nuevo marcador", fields, submitLabel: "Crear" },
    (v) => safeOp(() => api.create({
      parentId: parent ? parent.raw : v.dest, title: v.title, url: v.url,
    })));
}

function confirmDelete(n) {
  openDialog({
    title: n.type === "bm"
      ? `¿Eliminar «${short(n.title)}»?`
      : `¿Eliminar la carpeta «${short(n.title)}»?`,
    note: n.type === "bm"
      ? n.url
      : `Se eliminarán la carpeta y sus ${n.count} marcadores.`,
    submitLabel: "Eliminar",
    danger: true,
  }, () => safeOp(() =>
    n.type === "bm" ? api.remove(n.raw) : api.removeTree(n.raw)));
}

// ---------- toast ----------
let toastTimer = null;
function toast(msg, undoFn = null) {
  toastEl.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = msg;
  toastEl.appendChild(span);
  if (undoFn) {
    const b = document.createElement("button");
    b.textContent = "Deshacer";
    b.addEventListener("click", () => { toastEl.hidden = true; undoFn(); });
    toastEl.appendChild(b);
  }
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 6000);
}

// ---------- buscador-paleta ----------
const resultsEl = document.getElementById("results");
let searchItems = [];       // resultados visibles
let searchSel = -1;         // índice seleccionado
let searchFocusNode = null; // nodo resaltado desde la lista
let dwellTimer = null;      // 3 s de permanencia -> focalizar
let preSearchTf = null;     // transform previo al modo búsqueda

function enterSearchMode() {
  if (preSearchTf) return;
  preSearchTf = tf;
  zoomToNodes(nodes, 80, 450);   // el grafo se ve amplio, sin zoom
}
function exitSearchMode() {
  if (preSearchTf) {
    d3.select(canvas).transition().duration(450)
      .call(zoom.transform, preSearchTf);
    preSearchTf = null;
  }
  clearTimeout(dwellTimer);
  searchFocusNode = null;
  resultsEl.hidden = true;
  searchItems = [];
  searchSel = -1;
}

function nodeKind(n) {
  if (n.type === "ghost") return "pestaña";
  if (n.type === "cand") return "sugerencia";
  if (n.type === "bm") return openTabs.has(n.id) ? "abierta" : "marcador";
  if (n.subtype === "tag") return "tag";
  return "carpeta";
}

function buildResults(q) {
  const query = q.trim().toLowerCase();
  const scored = [];
  for (const n of nodes) {
    const title = (n.title || "").toLowerCase();
    const url = (n.url || "").toLowerCase();
    const tagText = (n.tags || []).map((t) => "#" + t).join(" ");
    let s = -1;
    if (!query) {
      // sin texto: la sesión abierta primero, luego lo más usado
      if (n.type === "bm" && openTabs.has(n.id)) s = 90;
      else if (n.type === "ghost") s = 80;
      else if (n.type === "bm") s = (n.heat ?? 0) * 50;
    } else if (query.startsWith("#")) {
      const tq = query.slice(1);
      if (n.subtype === "tag" && n.tag?.includes(tq)) s = 100;
      else if ((n.tags || []).some((t) => t.includes(tq))) s = 60;
    } else {
      if (title.startsWith(query)) s = 100;
      else if (title.includes(query)) s = 70;
      else if (url.includes(query)) s = 50;
      else if (tagText.includes(query)) s = 40;
      if (s > 0 && n.type === "bm" && openTabs.has(n.id)) s += 15;
      if (s > 0 && n.type === "folder") s -= 10;
    }
    if (s > 0) scored.push({ n, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, 12).map((x) => x.n);
}

function renderResults() {
  resultsEl.innerHTML = "";
  resultsEl.hidden = !searchItems.length;
  searchItems.forEach((n, i) => {
    const li = document.createElement("li");
    li.classList.toggle("sel", i === searchSel);
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = nodeColor(n);
    const t = document.createElement("span");
    t.className = "rt";
    t.textContent = n.title;
    t.title = n.url || n.title;
    const kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = nodeKind(n);
    li.append(dot, t, kind);
    li.addEventListener("mousedown", (ev) => { ev.preventDefault(); runResult(n); });
    li.addEventListener("mouseenter", () => selectResult(i, false));
    resultsEl.appendChild(li);
  });
}

function selectResult(i, scroll = true) {
  searchSel = i;
  [...resultsEl.children].forEach((li, j) => li.classList.toggle("sel", j === i));
  const n = searchItems[i] ?? null;
  searchFocusNode = n;
  clearTimeout(dwellTimer);
  if (n) {
    // quedarse 3 s sobre un resultado focaliza ese nodo en el grafo
    dwellTimer = setTimeout(() => zoomToNodes([n], 150), 3000);
    if (scroll) resultsEl.children[i]?.scrollIntoView({ block: "nearest" });
  }
  requestDraw();
}

function runResult(n) {
  if (!n) return;
  if (n.type === "ghost") { activateTab(n.tab); return; }
  if (n.type === "bm") {
    const open = openTabs.get(n.id);
    if (open?.length) { activateTab(open[0]); return; }
    window.location.href = n.url;
    return;
  }
  if (n.type === "cand") { window.location.href = n.url; return; }
  if (n.subtype === "tag") {
    searchBox.value = "#" + n.tag;
    applySearch(searchBox.value);
    return;
  }
  zoomToNodes(members(n), 90);
  searchBox.blur();
}

function applySearch(q) {
  searchQuery = q.trim().toLowerCase();
  if (!searchQuery) {
    focusSet = null;
  } else {
    const tagQuery = searchQuery.startsWith("#") ? searchQuery.slice(1) : null;
    const s = new Set();
    for (const n of nodes) {
      let hit;
      if (tagQuery !== null) {
        hit = n.subtype === "tag"
          ? (n.tag && n.tag.includes(tagQuery))
          : (n.tags || []).some((t) => t.includes(tagQuery));
      } else {
        const hay = (n.title + " " + (n.url || "") + " " +
          (n.tags || []).map((t) => "#" + t).join(" ")).toLowerCase();
        hit = hay.includes(searchQuery);
      }
      if (hit) {
        s.add(n.id);
        for (const h of n.hubs || []) s.add(h);
        if (n.parentId) s.add(n.parentId);
      }
    }
    focusSet = s;
  }
  searchItems = buildResults(q);
  searchSel = searchItems.length ? 0 : -1;
  renderResults();
  selectResult(searchSel, false);
  requestDraw();
}
function clearSearch() {
  searchBox.value = "";
  searchQuery = "";
  focusSet = null;
  exitSearchMode();
  requestDraw();
}

searchBox.addEventListener("input", (e) => applySearch(e.target.value));
searchBox.addEventListener("focus", () => {
  enterSearchMode();
  applySearch(searchBox.value);
});
searchBox.addEventListener("blur", () => {
  setTimeout(() => {
    if (document.activeElement !== searchBox) {
      resultsEl.hidden = true;
      clearTimeout(dwellTimer);
      searchFocusNode = null;
      requestDraw();
    }
  }, 150);
});
searchBox.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!searchItems.length) return;
    const d = e.key === "ArrowDown" ? 1 : -1;
    selectResult((searchSel + d + searchItems.length) % searchItems.length);
  } else if (e.key === "Enter") {
    runResult(searchItems[searchSel] ?? searchItems[0]);
  } else if (e.key === "Escape") {
    clearSearch();
    searchBox.blur();
  }
});

document.addEventListener("keydown", (e) => {
  if (dlg.open) return;
  const typing = document.activeElement === searchBox ||
    /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
  if (e.key === "º" || e.key === "ª") {
    if (!typing) { e.preventDefault(); toggleOnlyOpen(); }
    return;
  }
  if (typing) return;
  if (e.key === "/") {
    e.preventDefault();
    searchBox.focus();
  } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
    // escribir en cualquier parte activa el buscador directamente
    e.preventDefault();
    searchBox.focus();
    searchBox.value += e.key;
    applySearch(searchBox.value);
  }
});

// ---------- conmutador de vistas ----------
const VIEW_LABELS = { folders: "Carpetas", tags: "Tags", domains: "Dominios" };
function buildViews() {
  viewsEl.innerHTML = "";
  for (const [mode, label] of Object.entries(VIEW_LABELS)) {
    const b = document.createElement("button");
    b.textContent = label;
    b.classList.toggle("active", mode === viewMode);
    b.addEventListener("click", async () => {
      if (mode === viewMode) return;
      viewMode = mode;
      await saveStore("view", mode);
      buildViews();
      await rebuild(false);
      zoomToNodes(nodes, 80);
    });
    viewsEl.appendChild(b);
  }
}

// ---------- leyenda ----------
function buildLegend() {
  legendEl.innerHTML = "";
  const all = document.createElement("button");
  all.className = "chip";
  all.textContent = "⌂ Todo";
  all.title = "Encuadrar todo el grafo";
  all.addEventListener("click", () => zoomToNodes(nodes, 80));
  legendEl.appendChild(all);

  for (const c of clusters) {
    const chip = document.createElement("button");
    chip.className = "chip";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = c.slot >= 0
      ? `var(${SERIES_VARS[c.slot]})` : "var(--other)";
    const name = document.createElement("span");
    name.textContent = c.title;
    const n = document.createElement("span");
    n.className = "n";
    n.textContent = c.count;
    chip.append(dot, name, n);
    chip.addEventListener("mouseenter", () => {
      focusSet = new Set(members(byId.get(c.id)).map((x) => x.id));
      requestDraw();
    });
    chip.addEventListener("mouseleave", () => {
      if (!searchQuery) { focusSet = null; requestDraw(); }
      else applySearch(searchQuery);
    });
    chip.addEventListener("click", () =>
      zoomToNodes(members(byId.get(c.id)), 90));
    legendEl.appendChild(chip);
  }
}

// ---------- vista de lista ----------
function buildList() {
  listPanel.innerHTML = "";
  for (const c of clusters) {
    const det = document.createElement("details");
    const sum = document.createElement("summary");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = c.slot >= 0
      ? `var(${SERIES_VARS[c.slot]})` : "var(--other)";
    const name = document.createElement("span");
    name.textContent = c.title;
    const n = document.createElement("span");
    n.className = "n";
    n.textContent = `(${c.count})`;
    sum.append(dot, name, n);
    det.appendChild(sum);
    for (const node of members(byId.get(c.id))) {
      if (node.type !== "bm") continue;
      const a = document.createElement("a");
      a.href = node.url;
      a.textContent = node.title;
      a.title = node.url;
      det.appendChild(a);
    }
    listPanel.appendChild(det);
  }
}
listToggle.addEventListener("click", () => {
  listPanel.hidden = !listPanel.hidden;
  listToggle.textContent = listPanel.hidden ? "☰ Lista" : "✕ Cerrar";
});

// ---------- tema y resize ----------
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  readColors(); requestDraw();
});
new ResizeObserver(requestDraw).observe(canvas);

// ---------- arranque ----------
async function rebuild(fit) {
  const prevPos = new Map(nodes.map((n) =>
    [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }]));
  lastTree = await loadTree();
  buildGraph(lastTree);
  allBms = nodes.filter((n) => n.type === "bm");
  tabcountEl.classList.remove("warn");
  const res = await computeOpenTabs(allBms);
  openTabs = res.map;
  ghostTabs = res.ghosts;
  lastOpenKey = sessionKey();
  updateBadge();
  await computeHistory();
  for (const n of allBms) n.heat = heatByUrl.get(n.url) ?? 0.35;
  addCandidateNodes();
  addGhostNodes();
  rebuildNeighbors();
  if (onlyOpen) {
    pruneToOpen();
    clusters = clusters.filter((c) => byId.has(c.id));
  }
  for (const n of nodes) {
    const p = prevPos.get(n.id);
    if (p) Object.assign(n, p);
  }
  for (const n of nodes) {
    if (n.x === undefined && n.parentId) {
      const par = byId.get(n.parentId);
      if (par && par.x !== undefined) {
        n.x = par.x + (Math.random() - 0.5) * 50;
        n.y = par.y + (Math.random() - 0.5) * 50;
      }
    }
  }
  // layout manual: aplicar posiciones fijadas de esta vista
  const pins = pinned[viewMode] || {};
  for (const n of nodes) {
    const p = pins[n.id];
    if (p) { n.x = p.x; n.y = p.y; n.fx = p.x; n.fy = p.y; }
  }
  const total = nodes.filter((n) => n.type === "bm").length;
  emptyEl.hidden = total > 0;
  if (!emptyEl.hidden) {
    emptyEl.innerHTML = onlyOpen
      ? "<h2>Sin pestañas abiertas</h2><p>Ninguna pestaña abierta casa con tus marcadores. Pulsa <code>A</code> o el botón ⧉ para ver todo.</p>"
      : "<h2>No hay marcadores</h2><p>Importa marcadores desde <code>chrome://bookmarks</code> y aparecerán aquí como un grafo.</p>";
  }
  buildLegend();
  buildList();
  startSimulation(fit ? 1 : 0.5);
  if (fit) {
    tf = d3.zoomIdentity.translate(canvas.clientWidth / 2, canvas.clientHeight / 2);
    d3.select(canvas).call(zoom.transform, tf);
    simulation.tick(120);
    zoomToNodes(nodes, 80, 0);
  }
  if (searchQuery) applySearch(searchQuery);
  requestDraw();
}

let rebuildTimer = null;
function rebuildSoon() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => rebuild(false), 350);
}

if (IS_EXT) {
  chrome.bookmarks.onCreated.addListener(rebuildSoon);
  chrome.bookmarks.onRemoved.addListener(rebuildSoon);
  chrome.bookmarks.onChanged.addListener(rebuildSoon);
  chrome.bookmarks.onMoved.addListener(rebuildSoon);
  chrome.storage?.onChanged?.addListener((ch, area) => {
    if (area === "sync" && Object.keys(ch).some((k) => k.startsWith("tags_"))) {
      (async () => { tagsMap = await loadTags(); rebuildSoon(); })();
    } else if (area === "local" && ch.tags) {
      tagsMap = ch.tags.newValue || {};
      rebuildSoon();
    }
  });
  if (chrome.tabs) {
    for (const e of ["onCreated", "onRemoved", "onUpdated", "onActivated", "onReplaced", "onAttached"])
      chrome.tabs[e]?.addListener(rescanTabsSoon);
  }
}

(async function boot() {
  const params = new URLSearchParams(location.search);
  viewMode = params.get("view") || await loadStore("view", "folders");
  if (!VIEW_LABELS[viewMode]) viewMode = "folders";
  onlyOpen = params.get("filter") === "open" ||
    await loadStore("onlyOpen", false);
  showGhosts = await loadStore("ghosts", true);
  showCands = params.get("cands") === "1" || await loadStore("cands", false);
  candIgnore = await loadStore("candIgnore", []);
  pinned = await loadStore("layout", {});
  tagsMap = await loadTags();
  buildViews();
  await rebuild(true);

  // primera vez: sembrar etiquetas derivadas del análisis del historial
  if (!Object.keys(tagsMap).length && window.SEED_TAGS) {
    const urls = new Set();
    (function walk(items) {
      for (const it of items) it.url ? urls.add(it.url) : walk(it.children || []);
    })((lastTree[0]?.children) || []);
    const seed = {};
    for (const [url, ts] of Object.entries(window.SEED_TAGS))
      if (urls.has(url)) seed[url] = ts;
    if (Object.keys(seed).length) {
      tagsMap = seed;
      await persistTags();
      toast("Etiquetas iniciales generadas del análisis — clic derecho › Etiquetas para editarlas");
      if (viewMode === "tags") {
        await rebuild(false);
        simulation.tick(120);
        zoomToNodes(nodes, 80, 0);
      }
    }
  }
})();
