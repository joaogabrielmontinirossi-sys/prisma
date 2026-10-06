'use strict';
/* Prisma — utilitários, ícones e armazenamento local (IndexedDB) */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const count = (n, one, many) => `${fmtNum(n)} ${n === 1 ? one : many}`;
const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, Math.max(1, n - 1)).trimEnd() + '…' : s; };

const LOGO = '<svg viewBox="0 0 512 512"><rect width="512" height="512" rx="116" fill="#5b47d6"/><g fill="none" stroke-width="26" stroke-linecap="round"><path d="M60 290l150-22" stroke="#fff"/><path d="M318 236l134-62" stroke="#ffd166"/><path d="M330 272l126-6" stroke="#7ee0b8"/><path d="M322 308l126 54" stroke="#ff9fc0"/></g><path d="M256 120l124 250H132z" fill="#fff" stroke="#fff" stroke-width="34" stroke-linejoin="round"/></svg>';

const IC = {
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  gear: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M10 10v4M18 16v4',
  x: 'M6 6l12 12M18 6L6 18',
  dl: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  up: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  copy: 'M8 8h11v12H8zM5 16V4h10',
  pdf: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6',
  img: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01',
  sync: 'M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5',
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-7',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
  share: 'M12 15V4M8 8l4-4 4 4M5 12v8h14v-8',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  sheet: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h6M9 16h6M12 12v4',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24"><path d="${IC[n] || ''}"/></svg>`;

const NF = o => new Intl.NumberFormat('pt-BR', o);
/* unit: 'cur' (R$), 'pct' (%) ou ''. compact encurta números grandes (1,2 mi). */
function fmtNum(v, unit, compact) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (unit === 'pct') return NF({ maximumFractionDigits: a < 100 ? 1 : 0 }).format(v) + '%';
  if (compact && a >= 10000) { const s = NF({ notation: 'compact', maximumFractionDigits: 1 }).format(v); return unit === 'cur' ? 'R$ ' + s : s; }
  if (unit === 'cur') return NF({ style: 'currency', currency: 'BRL', maximumFractionDigits: a >= 1000 || (compact && Number.isInteger(v)) ? 0 : 2 }).format(v);
  return NF({ maximumFractionDigits: Number.isInteger(v) || a >= 1000 ? 0 : a >= 10 ? 1 : 2 }).format(v);
}
const fmtPct = f => NF({ maximumFractionDigits: Math.abs(f) < 0.1 ? 1 : 0 }).format(f * 100) + '%';
const fmtDay = ts => new Date(ts).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });

const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDate = ts => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
function fmtRel(ts) {
  const diff = Date.now() - ts, min = 60000, d = new Date(ts);
  if (diff < min) return 'agora';
  if (diff < 60 * min) return `há ${Math.floor(diff / min)} min`;
  if (dayKey(ts) === dayKey(Date.now())) return `há ${Math.floor(diff / (60 * min))} h`;
  if (dayKey(ts) === dayKey(Date.now() - 864e5)) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

const DB = (() => {
  const STORES = ['boards', 'kv'];
  const SYNCED = ['boards'];
  let db = null, mem = null, tomb = { id: 'tombstones', items: {} };
  const useMem = () => { mem = {}; STORES.forEach(s => mem[s] = new Map()); };
  const run = (store, mode, fn) => new Promise((res, rej) => {
    const t = db.transaction(store, mode), rq = fn(t.objectStore(store));
    t.oncomplete = () => res(rq && rq.result);
    t.onerror = t.onabort = () => rej(t.error);
  });
  return {
    STORES, SYNCED,
    onChange: () => {},
    tomb: () => tomb.items,
    setTomb: t => { tomb = t; },
    saveTomb: () => DB.put('kv', tomb),
    open: () => new Promise(res => {
      try {
        const rq = indexedDB.open('prisma', 1);
        rq.onupgradeneeded = () => STORES.forEach(s => rq.result.objectStoreNames.contains(s) || rq.result.createObjectStore(s, { keyPath: 'id' }));
        rq.onsuccess = () => { db = rq.result; res(); };
        rq.onerror = rq.onblocked = () => { useMem(); res(); };
      } catch (e) { useMem(); res(); }
    }),
    all: s => mem ? Promise.resolve([...mem[s].values()]) : run(s, 'readonly', o => o.getAll()),
    // raw = gravação vinda da sincronização: não carimba a data de modificação nem dispara novo envio
    put(s, v, raw) {
      if (!raw && SYNCED.includes(s)) { v.mod = Date.now(); DB.onChange(); }
      return mem ? Promise.resolve(mem[s].set(v.id, v)) : run(s, 'readwrite', o => o.put(v)).catch(e => { console.error(e); toast('Não foi possível salvar: armazenamento cheio?'); });
    },
    del(s, id, raw) {
      if (!raw && SYNCED.includes(s)) { tomb.items[s + ':' + id] = Date.now(); DB.saveTomb(); DB.onChange(); }
      return mem ? Promise.resolve(mem[s].delete(id)) : run(s, 'readwrite', o => o.delete(id));
    },
    clear: s => mem ? Promise.resolve(mem[s].clear()) : run(s, 'readwrite', o => o.clear()),
  };
})();

/* Estado em memória. Um "board" é uma planilha importada com as escolhas de análise. */
const S = {
  boards: [],
  set: { id: 'settings', theme: 'auto', cur: null, tab: 'resumo' },
};

/* Garante o formato de um board vindo de fora (sincronização, backup). */
function normalize(b) {
  const str = v => typeof v === 'string' ? v : '';
  b.title = str(b.title) || 'Sem título';
  b.source = b.source && typeof b.source === 'object' ? { kind: str(b.source.kind), name: str(b.source.name), url: str(b.source.url) } : { kind: 'file', name: '', url: '' };
  b.sheets = (Array.isArray(b.sheets) ? b.sheets : []).filter(s => s && Array.isArray(s.header) && Array.isArray(s.rows)).map(s => ({
    name: str(s.name) || 'Planilha', header: s.header.map(h => String(h ?? '')), rows: s.rows.filter(Array.isArray), hints: s.hints && typeof s.hints === 'object' ? s.hints : {},
  }));
  b.sheet = Math.min(Math.max(0, parseInt(b.sheet) || 0), Math.max(0, b.sheets.length - 1));
  b.cfg = b.cfg && typeof b.cfg === 'object' ? b.cfg : {};
  b.cfg.charts = Array.isArray(b.cfg.charts) ? b.cfg.charts.filter(c => c && typeof c === 'object') : [];
  b.created = +b.created || Date.now(); b.updated = +b.updated || b.created;
  return b;
}

const Store = {
  async load() {
    await DB.open();
    S.boards = (await DB.all('boards')).map(normalize);
    const kv = await DB.all('kv');
    const st = kv.find(k => k.id === 'settings');
    if (st) Object.assign(S.set, st);
    const tb = kv.find(k => k.id === 'tombstones');
    if (tb) DB.setTomb(tb);
    if (!st && !S.boards.length) Store.seed();
  },
  create(title, source, sheets, seed) {
    const now = Date.now();
    const b = normalize({ id: uid(), title, source, sheets, sheet: 0, cfg: {}, created: now, updated: now });
    if (seed) b.seed = true;
    S.boards.push(b);
    DB.put('boards', b);
    return b;
  },
  // seed: true marca a planilha de exemplo, descartada se a primeira sincronização já encontrar dados
  seed() {
    let x = 7;
    const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
    const prods = [['Café especial 250g', 'Bebidas', 38], ['Chá de hibisco', 'Bebidas', 19], ['Bolo de cenoura', 'Doces', 42], ['Brigadeiro (cx. 6)', 'Doces', 24], ['Pão de queijo (kg)', 'Salgados', 46], ['Coxinha (cento)', 'Salgados', 95], ['Caneca Prisma', 'Presentes', 55]];
    const sellers = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa'], regions = ['Centro', 'Zona Norte', 'Zona Sul', 'Zona Leste', 'Online', 'Online', 'Centro'];
    const rows = [];
    for (let m = 0; m < 12; m++) {
      for (let k = 0, n = 9 + m + Math.floor(rnd() * 5); k < n; k++) {
        const p = pick(prods), q = 1 + Math.floor(rnd() * rnd() * 9);
        rows.push([`2025-${String(m + 1).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`, pick(sellers), pick(regions), p[1], p[0], q, Math.round(p[2] * q * (0.9 + rnd() * 0.25) * 100) / 100, rnd() < 0.06 ? null : 3 + Math.floor(rnd() * 3)]);
      }
    }
    rows.sort((a, b) => a[0] < b[0] ? -1 : 1);
    const b = Store.create('Exemplo: vendas da cafeteria', { kind: 'file', name: 'exemplo', url: '' }, [{ name: 'Vendas', header: ['Data', 'Vendedor', 'Região', 'Categoria', 'Produto', 'Quantidade', 'Valor', 'Nota do cliente'], rows }], true);
    S.set.cur = b.id;
  },
  saveSet: () => DB.put('kv', S.set),
};
