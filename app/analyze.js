'use strict';
/* Prisma — análise: acha o cabeçalho, descobre o tipo de cada coluna, agrega e escreve os achados em português. */

const Analyze = (() => {
  const nonEmpty = v => v != null && !(typeof v === 'string' && !v.trim());
  const minOf = a => a.reduce((x, y) => y < x ? y : x, Infinity), maxOf = a => a.reduce((x, y) => y > x ? y : x, -Infinity);
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MONTH_RE = /^(jan(eiro)?|fev(ereiro)?|mar(co)?|abr(il)?|mai(o)?|jun(ho)?|jul(ho)?|ago(sto)?|set(embro)?|out(ubro)?|nov(embro)?|dez(embro)?)\.?$/;
  const monthIdx = s => { const n = norm(s).trim(); return MONTH_RE.test(n) ? MONTHS.indexOf(n.slice(0, 3)) : -1; };

  function parseDate(v) {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
    if (m) return Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(s);
    if (m) {
      let d = +m[1], mo = +m[2], y = +m[3];
      if (y < 100) y += y < 50 ? 2000 : 1900;
      if (mo > 12 && d <= 12) [d, mo] = [mo, d];
      return mo < 1 || mo > 12 || d < 1 || d > 31 ? null : Date.UTC(y, mo - 1, d, +(m[4] || 0), +(m[5] || 0));
    }
    m = /^(\d{1,2})[\/\-](\d{4})$/.exec(s);
    if (m && +m[1] >= 1 && +m[1] <= 12) return Date.UTC(+m[2], m[1] - 1, 1);
    m = /^([a-zç]{3,9})\.?[\/\- ](?:de )?(\d{4}|\d{2})$/i.exec(s);
    if (m && monthIdx(m[1]) >= 0) return Date.UTC(+m[2] < 100 ? 2000 + +m[2] : +m[2], monthIdx(m[1]), 1);
    return null;
  }
  /* O ponto pode ser milhar (1.234,56) ou decimal (1234.56): decide olhando a coluna inteira. */
  function numParser(strs) {
    let dotDec = false;
    for (const s of strs) {
      const t = s.replace(/[^\d.,-]/g, '');
      if ((!t.includes(',') && /\.\d+$/.test(t) && !/^-?\d{1,3}(\.\d{3})+$/.test(t)) || /,\d{3}\.\d+$/.test(t)) { dotDec = true; break; }
    }
    return v => {
      if (typeof v === 'number') return isFinite(v) ? v : null;
      if (typeof v !== 'string') return null;
      let s = v.trim();
      const neg = /^\(.*\)$/.test(s);
      s = s.replace(/^\(|\)$/g, '').replace(/R\$|US\$|[$€£%\s ]/g, '');
      if (!/^[-+]?(\d[\d.,]*|[.,]\d+)$/.test(s)) return null;
      s = dotDec ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
      const n = parseFloat(s);
      return isFinite(n) ? (neg ? -n : n) : null;
    };
  }
  const loose = numParser([]);

  /* ---------- Forma da tabela: cabeçalho, colunas vazias, linhas de total ---------- */
  const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  /* Traços e erros de fórmula usados como "sem valor" contam como célula vazia. */
  const PLACE = /^(-+|—|–|n\/?[ad]|n\.d\.|#n\/a|#div\/0!|#ref!|#value!|#nome\?|#name\?|null|nan)$/i;
  const clean = v => { if (typeof v !== 'string') return v ?? null; v = v.trim(); return v && !PLACE.test(v) ? v : null; };
  const isText = v => typeof v === 'string' && loose(v) == null && parseDate(v) == null;
  const isYear = v => { const n = typeof v === 'number' ? v : loose(v); return Number.isInteger(n) && n >= 1900 && n <= 2100; };
  /* Cabeçalho que é data (jan/26) ou ano continua sendo cabeçalho: tabelas com os meses nas colunas. */
  function headName(v) {
    const t = typeof v === 'string' ? parseDate(v) : null;
    if (t == null || !/^\d{4}-\d{2}-\d{2}/.test(v)) return String(v).replace(/[\s▼▾▲▴↕⇅]+$/, '').trim().replace(/\s+/g, ' ') || String(v).trim();
    const d = new Date(t);
    return d.getUTCDate() === 1 ? `${MONTHS[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}` : fmtDay(t);
  }
  function shape(raw, name, hints) {
    const all = (raw || []).map(r => (r || []).map(clean)), rows = all.filter(r => r.some(nonEmpty));
    if (!rows.length) return null;
    const filled = r => r.filter(nonEmpty).length, maxF = Math.max(...rows.slice(0, 30).map(filled));
    let h = rows.findIndex(r => filled(r) >= Math.max(2, maxF * 0.6));
    if (h < 0 || h > 15) h = 0;
    const hr = rows[h], hv = hr.filter(nonEmpty), texts = hv.filter(isText).length;
    const isHeader = rows.length > h + 1 && texts >= 1 && hv.every(v => isText(v) || isYear(v) || parseDate(String(v)) != null);
    let data = rows.slice(isHeader ? h + 1 : h);
    const width = Math.max(maxOf(data.map(r => r.length)), hr.length);
    const keep = [];
    for (let i = 0; i < width; i++) if (data.some(r => nonEmpty(r[i]))) keep.push(i);
    if (!keep.length || !data.length) return null;
    const seen = {};
    const header = keep.map(i => {
      let n = isHeader && nonEmpty(hr[i]) ? headName(hr[i]) : 'Coluna ' + colName(i);
      if (seen[n]) n += ' ' + (++seen[n]); else seen[n] = 1;
      return n;
    });
    const isTotal = r => { const t = r.find(v => typeof v === 'string'); return t && /^(sub)?total( geral)?\b|^soma\b/i.test(t); };
    // linha com uma única célula de texto numa tabela larga é subtítulo ou observação, não um registro
    const isNote = r => keep.length >= 3 && filled(r) === 1 && isText(r.find(nonEmpty));
    const out = data.filter(r => !isTotal(r) && !isNote(r)).map(r => keep.map(i => r[i] ?? null));
    if (!isHeader && header.length === 2 && out.every(r => r[0] == null || isText(r[0]))) { header[0] = 'Item'; header[1] = 'Valor'; }
    const hh = {};
    keep.forEach((i, k) => { if (hints && hints[i]) hh[k] = hints[i]; });
    return out.length ? { name: name || 'Planilha', header, rows: out, hints: hh, pre: rows.slice(0, h), hasHeader: isHeader } : null;
  }

  /* ---------- Uma aba pode ter várias coisas: recorta em blocos e separa tabelas, indicadores e títulos ---------- */
  function tables(raw, tab, hints) {
    const g = (raw || []).map(r => (r || []).map(clean)), H = g.length, W = H ? maxOf(g.map(r => r.length)) : 0, res = { tables: [], kpis: [], title: '' };
    if (!H || W <= 0) return res;
    const at = (r, c) => { const row = g[r]; return row ? row[c] ?? null : null; };
    const rowEmpty = (r, c0, c1) => { const row = g[r]; if (row) for (let c = c0; c <= c1; c++) if (row[c] != null) return false; return true; };
    const colEmpty = (c, r0, r1) => { for (let r = r0; r <= r1; r++) if (at(r, c) != null) return false; return true; };
    let blocks = [];
    // corte XY: divide por linhas vazias, depois por colunas vazias, até não haver mais o que dividir
    (function split(r0, r1, c0, c1) {
      while (r0 <= r1 && rowEmpty(r0, c0, c1)) r0++;
      while (r1 >= r0 && rowEmpty(r1, c0, c1)) r1--;
      if (r0 > r1) return;
      while (colEmpty(c0, r0, r1)) c0++;
      while (colEmpty(c1, r0, r1)) c1--;
      const cuts = (a, b, empty) => { const out = []; let s = a; for (let i = a; i <= b + 1; i++) if (i > b || empty(i)) { if (i > s) out.push([s, i - 1]); s = i + 1; } return out; };
      const rs = cuts(r0, r1, r => rowEmpty(r, c0, c1));
      if (rs.length > 1) return rs.forEach(([a, b]) => split(a, b, c0, c1));
      const cs = cuts(c0, c1, c => colEmpty(c, r0, r1));
      if (cs.length > 1) return cs.forEach(([a, b]) => split(r0, r1, a, b));
      blocks.push({ r0, r1, c0, c1 });
    })(0, H - 1, 0, W - 1);
    if (H > 20000 || blocks.length > 4000) blocks = [{ r0: 0, r1: H - 1, c0: 0, c1: W - 1 }];
    const kind = v => v == null ? 0 : isText(v) ? 1 : 2;
    // células mescladas deixam colunas vazias no meio: junta o pedaço de valores ao pedaço de rótulos à esquerda
    const labelCol = b => { for (let r = b.r0 + 1; r <= b.r1; r++) { const v = at(r, b.c0); if (v != null) return isText(v); } return false; };
    blocks.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length && blocks[j].r0 === blocks[i].r0; j++) {
      const a = blocks[i], b = blocks[j];
      if (a.r1 > a.r0 && b.r1 === a.r1 && b.c0 > a.c1 && b.c0 - a.c1 <= 4 && !labelCol(b)) { a.c1 = b.c1; blocks.splice(j--, 1); }
    }
    // linhas em branco no meio de uma tabela: junta o pedaço de baixo se ele continua o de cima (e não é um cabeçalho novo)
    const fits = (a, b) => {
      if (a.r1 === a.r0 || b.c0 < a.c0 || b.c1 > a.c1 || b.r0 - a.r1 < 2) return false;
      let same = 0, diff = 0;
      for (let c = b.c0; c <= b.c1; c++) { const x = kind(at(a.r1, c)), y = kind(at(b.r0, c)); if (x && y) x === y ? same++ : diff++; }
      // perto (1 ou 2 linhas em branco) basta combinar; longe (espaço reservado entre grupos) precisa alinhar à esquerda e combinar bem
      // (uma célula só não conta: é título ou observação, e o que vem depois é outra seção)
      return b.r0 - a.r1 <= 3 ? same >= Math.min(2, a.c1 - a.c0 + 1) && diff <= same / 3 : b.c0 === a.c0 && same >= 3 && diff <= same / 4;
    };
    for (let j = 1; j < blocks.length; j++) {
      const b = blocks[j];
      let best = -1;
      for (let i = 0; i < j; i++) if (fits(blocks[i], b) && (best < 0 || blocks[i].r1 > blocks[best].r1)) best = i;
      if (best >= 0) { blocks[best].r1 = b.r1; blocks.splice(j--, 1); }
    }
    const notes = [], unitOf = (label, v, c) => (hints && hints[c]) || (typeof v === 'string' && /R\$/.test(v) ? 'cur' : typeof v === 'string' && /%\s*$/.test(v) ? 'pct' : CUR_RE.test(norm(label)) ? 'cur' : '');
    const kpi = (label, v, c) => {
      label = String(label).replace(/[\s:▸►→>»]+$/, '').replace(/\s+/g, ' ').trim();
      if (!label || v == null || res.kpis.length >= 60) return;
      const d = typeof v === 'string' ? parseDate(v) : null, n = d != null ? null : loose(v);
      if (n != null) { const u = unitOf(label, v, c); res.kpis.push({ tab, label, value: u === 'pct' && hints && hints[c] === 'pct' ? n * 100 : n, unit: u }); }
      else if (String(v).length <= 28) res.kpis.push({ tab, label, value: d != null ? fmtDay(d) : String(v), unit: 'text' });
    };
    // pares "rótulo | valor" soltos numa linha
    const pairs = (row, c0) => { let n = 0; for (let i = 0; i < row.length - 1; i++) if (isText(row[i]) && row[i + 1] != null && (!isText(row[i + 1]) || /[:▸►→>»]\s*$/.test(row[i]))) { kpi(row[i], row[i + 1], c0 + i); n++; i++; } return n; };
    for (const b of blocks) {
      const rows = [];
      for (let r = b.r0; r <= b.r1; r++) { const row = []; for (let c = b.c0; c <= b.c1; c++) row.push(at(r, c)); rows.push(row); }
      const first = rows[0].find(nonEmpty);
      if (b.r0 === b.r1) { if (!pairs(rows[0], b.c0) && isText(first)) notes.push({ r: b.r0, c: b.c0, text: first }); continue; }
      const hb = {};
      if (hints) for (let c = b.c0; c <= b.c1; c++) if (hints[c]) hb[c - b.c0] = hints[c];
      const s = shape(rows, '', hb);
      if (!s) continue;
      let title = '';
      s.pre.forEach(row => { if (!pairs(row, b.c0) && !title && isText(row.find(nonEmpty))) title = row.find(nonEmpty); else if (!title && isText(row[0])) title = row[0]; });
      const lone = s.rows.length === 1 && s.hasHeader, record = lone && s.header.length >= 3 && s.rows[0].some(isText);
      if (lone && !record) { s.header.forEach((hname, i) => kpi(hname, s.rows[0][i], b.c0 + i)); continue; }
      if (!record && s.rows.length < 2 || (s.header.length < 2 && s.rows.length < 5)) { rows.forEach(row => pairs(row, b.c0)); continue; }
      if (!title) { const n = notes.filter(n => n.r < b.r0 && n.r >= b.r0 - 3 && n.c >= b.c0 - 1 && n.c <= b.c1).pop(); if (n) title = n.text; }
      res.tables.push({ tab, title: String(title).replace(/[\s:▸►→>»]+$/, '').trim(), header: s.header, rows: s.rows, hints: s.hints });
    }
    res.title = (notes.find(n => n.r <= 3) || {}).text || '';
    const names = {};
    res.tables.forEach(t => { const k = t.title || ''; names[k] = (names[k] || 0) + 1; });
    res.tables.forEach(t => { if (t.title && names[t.title] > 1) t.title = `${cut(t.title, 22)} (${t.header.slice(1, 3).join(', ')})`; });
    res.tables.forEach(t => { t.name = res.tables.length === 1 ? tab : `${tab} · ${cut(t.title || t.header.slice(0, 2).join(', '), 48)}`; delete t.title; });
    return res;
  }

  /* ---------- Perfil das colunas ---------- */
  const CUR_RE = /valor|preco|custo|receita|fatura|salario|venda|despesa|gasto|lucro|r\$|montante|pagamento|orcamento|saldo|renda/;
  const AVG_RE = /idade|nota|media|taxa|unitario|preco|score|avalia|satisfa|temperatura|altura|peso|indice|prazo|percent|margem|%|salario|nps|tempo|saldo|estoque|meta/;
  const ID_RE = /^(id|#.*|n[º°]\.? ?.*|no\. .*|cod(igo)?\b.*|cpf|cnpj|cep|tel(efone)?|celular|matricula|protocolo|ddd|rg)$/;
  // nomes que às vezes são código e às vezes são quantidade: só viram código se os valores não se repetem
  const ID_WEAK = /^(n[o.]?|num(ero)?( d[aeo].*)?|pedido|nf)$/;
  const quant = (sorted, q) => { const p = (sorted.length - 1) * q, a = Math.floor(p), b = Math.ceil(p); return sorted[a] + (sorted[b] - sorted[a]) * (p - a); };
  function stats(vals) {
    const v = vals.filter(x => x != null).sort((a, b) => a - b), n = v.length;
    if (!n) return { n: 0, sum: 0, mean: 0, median: 0, min: 0, max: 0, sd: 0, q1: 0, q3: 0 };
    const sum = v.reduce((a, b) => a + b, 0), mean = sum / n;
    return { n, sum, mean, median: quant(v, 0.5), min: v[0], max: v[n - 1], sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / n), q1: quant(v, 0.25), q3: quant(v, 0.75) };
  }
  function profile(sheet, types) {
    const { header, rows, hints = {} } = sheet;
    return header.map((name, i) => {
      const raw = rows.map(r => r[i] ?? null), filled = raw.filter(v => v != null), n = filled.length, nn = norm(name).trim();
      const strs = filled.filter(v => typeof v === 'string'), pn = numParser(strs.slice(0, 2000));
      let nNum = 0, nDate = 0, nMonth = 0, cur = false, pct = false;
      for (const v of filled) {
        if (typeof v === 'string') {
          if (parseDate(v) != null) { nDate++; continue; }
          if (monthIdx(v) >= 0) nMonth++;
          if (!cur && /R\$|[$€£]/.test(v)) cur = true;
          if (!pct && /%\s*$/.test(v)) pct = true;
        }
        if (pn(v) != null) nNum++;
      }
      const col = { i, name, n, missing: rows.length - n, unit: '', agg: 'sum', ord: null };
      const asText = () => raw.map(v => v == null ? null : String(v));
      let type = types && types[i];
      if (!type) type = !n ? 'text' : nDate >= n * 0.9 ? 'date' : nNum >= n * 0.8 ? 'num' : 'str';
      if (type === 'date' && !nDate) type = 'str';
      if (type === 'num' && !nNum) type = 'str';
      if (type === 'date') col.vals = raw.map(parseDate);
      else if (type === 'num') {
        col.vals = raw.map(pn);
        const nums = col.vals.filter(v => v != null), ints = nums.every(Number.isInteger), auto = !(types && types[i]);
        const lo = minOf(nums), hi = maxOf(nums), distinct = new Set(nums).size;
        if (auto && ints && lo >= 1900 && hi <= 2100 && nums.length > 1) { type = 'cat'; col.vals = col.vals.map(v => v == null ? null : String(v)); col.ord = k => +k; }
        else if (auto && (ID_RE.test(nn) || (ID_WEAK.test(nn) && ints && nums.length >= 8 && distinct === nums.length) || (ints && nums.length >= 15 && distinct === nums.length && hi - lo === nums.length - 1))) { type = 'id'; col.vals = asText(); }
        else {
          col.unit = hints[i] === 'pct' || pct || /%|percent/.test(nn) ? 'pct' : hints[i] === 'cur' || cur || CUR_RE.test(nn) ? 'cur' : '';
          if (hints[i] === 'pct') col.vals = col.vals.map(v => v == null ? null : v * 100);
          col.agg = col.unit === 'pct' || AVG_RE.test(nn) ? 'avg' : 'sum';
          col.st = stats(col.vals);
        }
      }
      if (type === 'str' || type === 'cat' && !col.vals) {
        col.vals = asText();
        if (n && nMonth >= n * 0.9) { type = 'cat'; col.ord = k => monthIdx(k); }
      }
      if (type === 'text' || type === 'id') col.vals = col.vals || asText();
      col.distinct = new Set(col.vals.filter(v => v != null)).size;
      // até 40 valores diferentes dá para agrupar e desenhar, mesmo quando cada linha tem o seu (uma lista de itens)
      if (type === 'str') type = col.distinct <= 40 ? 'cat' : 'text';
      col.label = type === 'cat' && !col.ord && col.distinct > n * 0.6 && col.distinct > 1;
      col.type = type;
      return col;
    });
  }

  /* ---------- Agregações ---------- */
  function group(A, dim, measure, agg) {
    const m = new Map();
    for (let r = 0; r < A.n; r++) {
      const k = dim.vals[r];
      if (k == null) continue;
      let g = m.get(k);
      if (!g) m.set(k, g = { k, s: 0, c: 0, n: 0 });
      g.n++;
      if (measure && measure.vals[r] != null) { g.s += measure.vals[r]; g.c++; }
    }
    const out = [...m.values()].map(g => ({ k: g.k, n: g.n, v: !measure ? g.n : agg === 'avg' ? (g.c ? g.s / g.c : 0) : g.s }));
    if (dim.ord) return out.sort((a, b) => dim.ord(a.k) - dim.ord(b.k));
    // só valores negativos (saídas, despesas): o maior peso vem primeiro
    const neg = out.some(g => g.v < 0) && !out.some(g => g.v > 0);
    return out.sort((a, b) => neg ? a.v - b.v : b.v - a.v);
  }
  function series(A, date, measure, agg) {
    const ts = date.vals.filter(v => v != null);
    if (ts.length < 2) return [];
    const lo = minOf(ts), hi = maxOf(ts), days = (hi - lo) / 864e5;
    const gran = days > 1100 ? 'year' : days > 92 ? 'month' : 'day';
    const key = t => { const d = new Date(t); return gran === 'year' ? d.getUTCFullYear() : gran === 'month' ? d.getUTCFullYear() * 12 + d.getUTCMonth() : Math.floor(t / 864e5); };
    const label = k => gran === 'year' ? String(k) : gran === 'month' ? `${MONTHS[k % 12]}/${String(Math.floor(k / 12)).slice(2)}` : new Date(k * 864e5).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });
    const long = k => gran === 'year' ? String(k) : gran === 'month' ? new Date(Date.UTC(Math.floor(k / 12), k % 12, 1)).toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' }) : fmtDay(k * 864e5);
    const m = new Map();
    for (let r = 0; r < A.n; r++) {
      const t = date.vals[r];
      if (t == null) continue;
      const k = key(t);
      let g = m.get(k);
      if (!g) m.set(k, g = { k, s: 0, c: 0, n: 0 });
      g.n++;
      if (measure && measure.vals[r] != null) { g.s += measure.vals[r]; g.c++; }
    }
    const out = [...m.values()].sort((a, b) => a.k - b.k).map(g => ({ k: label(g.k), long: long(g.k), n: g.n, v: !measure ? g.n : agg === 'avg' ? (g.c ? g.s / g.c : 0) : g.s }));
    out.gran = gran;
    return out;
  }
  function pearson(a, b) {
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] == null || b[i] == null) continue;
      n++; sa += a[i]; sb += b[i]; saa += a[i] * a[i]; sbb += b[i] * b[i]; sab += a[i] * b[i];
    }
    const den = Math.sqrt((n * saa - sa * sa) * (n * sbb - sb * sb));
    return n >= 8 && den ? (n * sab - sa * sb) / den : 0;
  }

  /* Nome de coluna que é um período: mês, ano, data, trimestre, semana 3… */
  const timeKey = name => { const s = norm(name).trim(); return monthIdx(s) >= 0 || /^(19|20)\d\d$/.test(s) || parseDate(String(name)) != null || /^\d[ºo°]?\s*(tri|bim|sem|quad)/.test(s) || /^(sem(ana)?|mes|tri(mestre)?|t|q|m|dia)\s*\.?\s*\d{1,2}$/.test(s) ? s : null; };

  /* ---------- Modelo completo de um board ---------- */
  function build(board, idx = board.sheet) {
    const sheet = board.sheets[idx];
    if (!sheet) return null;
    const cfg = board.cfg, sc = (cfg.s && cfg.s[idx]) || {};
    const cols = profile(sheet, sc.types), by = t => cols.filter(c => c.type === t);
    const nums = by('num'), cats = by('cat').filter(c => c.distinct >= 2), dates = by('date');
    const pickCol = (v, list, def) => v === -1 ? null : list.find(c => c.i === v) || def || null;
    const A = { board, sheet, title: board.title, n: sheet.rows.length, cols, nums, cats, dates };
    // Tabela "larga": os períodos (jan, fev… ou 2023, 2024…) estão nas colunas. Soma as colunas numa coluna calculada e usa-as como linha do tempo.
    const wide = nums.filter(c => timeKey(c.name) != null);
    if (wide.length >= 3 && wide.length >= nums.length * 0.6) {
      const vals = sheet.rows.map((_, r) => { let s = null; for (const c of wide) if (c.vals[r] != null) s = (s || 0) + c.vals[r]; return s; });
      const tot = { i: -2, name: 'Total das colunas', type: 'num', calc: true, unit: wide[0].unit, agg: 'sum', ord: null, vals, n: vals.filter(v => v != null).length, missing: 0, distinct: new Set(vals).size, st: stats(vals) };
      cols.push(tot); nums.unshift(tot); A.wide = wide;
    }
    A.measure = pickCol(sc.measure, nums, nums.find(c => c.calc) || nums.find(c => c.unit === 'cur' && /total/.test(norm(c.name))) || nums.find(c => c.unit === 'cur' && /valor/.test(norm(c.name)) && !/unit/.test(norm(c.name))) || nums.find(c => c.unit === 'cur') || nums.find(c => /total|quant|qtd/.test(norm(c.name))) || nums[0]);
    // prefere uma coluna que realmente agrupa (valores repetidos); senão, a coluna de nomes dos itens
    A.dim = pickCol(sc.dim, cats, cats.find(c => !c.ord && !c.label && c.distinct <= 20) || cats.find(c => c.label) || cats[0]);
    A.date = pickCol(sc.date, dates, dates[0]);
    A.agg = A.measure ? (sc.agg || A.measure.agg) : 'sum';
    A.unit = A.measure ? A.measure.unit : '';
    A.dim2 = cats.find(c => c !== A.dim && !c.ord && !c.label && c.distinct <= 20) || null;
    A.mLabel = A.measure ? (A.agg === 'avg' ? `Média de ${A.measure.name}` : A.measure.name) : 'Registros';
    A.f = (v, compact) => fmtNum(v, A.unit, compact);
    A.byDim = A.dim ? group(A, A.dim, A.measure, A.agg) : [];
    A.mixed = A.byDim.some(g => g.v > 0) && A.byDim.some(g => g.v < 0);
    A.neg = !A.mixed && A.byDim.some(g => g.v < 0);
    A.rank = [...A.byDim].sort((a, b) => A.mixed ? Math.abs(b.v) - Math.abs(a.v) : A.neg ? a.v - b.v : b.v - a.v);
    // coluna com entradas (positivos) e saídas (negativos) misturadas
    A.flow = null;
    if (A.measure && A.agg === 'sum') {
      let pos = 0, neg = 0;
      for (const v of A.measure.vals) if (v > 0) pos += v; else if (v < 0) neg += v;
      if (pos && neg) A.flow = { pos, neg };
    }
    const ordDim = !A.date && cats.find(c => c.ord);
    A.series = A.date ? series(A, A.date, A.measure, A.agg) : ordDim ? group(A, ordDim, A.measure, A.agg).map(g => ({ k: g.k, long: g.k, n: g.n, v: g.v })) : [];
    A.timeName = A.date ? A.date.name : ordDim ? ordDim.name : '';
    if (!A.series.length && A.wide) { A.series = A.wide.map(c => ({ k: c.name, long: c.name, n: c.st.n, v: A.agg === 'avg' ? c.st.mean : c.st.sum })); A.timeName = 'período (colunas)'; }
    A.corr = null;
    const ns = nums.slice(0, 7);
    for (let a = 0; a < ns.length; a++) for (let b = a + 1; b < ns.length; b++) {
      const r = pearson(ns[a].vals, ns[b].vals);
      if (Math.abs(r) >= 0.5 && Math.abs(r) < 0.995 && (!A.corr || Math.abs(r) > Math.abs(A.corr.r))) A.corr = { a: ns[a], b: ns[b], r };
    }
    A.gaps = cols.filter(c => c.missing > 0).sort((a, b) => b.missing - a.missing);
    const seen = new Set();
    A.dups = 0;
    if (A.n <= 50000) for (const r of sheet.rows) { const k = JSON.stringify(r); if (seen.has(k)) A.dups++; else seen.add(k); }
    A.labelCol = cols.find(c => c.type === 'text') || cols.find(c => c.type === 'id') || A.dim;
    A.ins = insights(A);
    return A;
  }

  /* ---------- Achados, em duas vozes: text (analista) e lay (para quem não é da área) ---------- */
  const times = (r, b) => r >= 2.8 ? `${Math.round(r)} vezes o de ${b}` : r >= 1.8 ? `cerca do dobro de ${b}` : r >= 1.4 ? `uma vez e meia o de ${b}` : r >= 1.12 ? `um pouco mais que ${b}` : `quase empatado com ${b}`;
  function insights(A) {
    const out = [], m = A.measure, d = A.dim, f = A.f, add = o => out.push(o), q = s => `“${s}”`;
    const kinds = [[A.nums.length, 'de números'], [A.cats.length, 'de categorias'], [A.dates.length, 'de datas']].filter(k => k[0]).map(k => `${k[0]} ${k[1]}`).join(', ');
    add({ id: 'size', emoji: '🗂️', tag: 'Tamanho', big: fmtNum(A.n), title: `${count(A.n, 'registro', 'registros')} em ${count(A.cols.length, 'coluna', 'colunas')}`,
      text: `A planilha tem ${count(A.n, 'linha', 'linhas')} de dados e ${count(A.cols.length, 'coluna', 'colunas')}${kinds ? ` (${kinds})` : ''}.`,
      lay: `Sua planilha tem ${count(A.n, 'linha', 'linhas')}. Pense em cada linha como uma fichinha com ${A.cols.length} informações.` });
    if (m) {
      const s = m.st;
      if (A.agg === 'sum') add({ id: 'total', emoji: '🧮', tag: 'Total', big: f(s.sum, true), title: `${m.name}: ${f(s.sum)} no total`,
        text: `A soma de ${q(m.name)} é ${f(s.sum)}, com média de ${f(s.mean)} por registro (de ${f(s.min)} a ${f(s.max)}).${A.flow ? ` Os valores positivos (entradas) somam ${f(A.flow.pos)} e os negativos (saídas), ${f(A.flow.neg)}.` : ''}`,
        lay: `Somando tudo de ${q(m.name)}, dá ${f(s.sum, true)}. Se fosse dividido por igual, cada linha ficaria com ${f(s.mean)}.${A.flow ? ` Entrou ${f(A.flow.pos, true)} e saiu ${f(Math.abs(A.flow.neg), true)}.` : ''}` });
      else add({ id: 'mean', emoji: '🎯', tag: 'Média', big: f(s.mean), title: `${m.name}: média de ${f(s.mean)}`,
        text: `A média de ${q(m.name)} é ${f(s.mean)}, variando de ${f(s.min)} a ${f(s.max)}; metade dos registros fica até ${f(s.median)}.`,
        lay: `O valor típico de ${q(m.name)} é ${f(s.mean)}. O menor foi ${f(s.min)} e o maior, ${f(s.max)}.` });
      if (s.mean && Math.abs(s.mean - s.median) / Math.abs(s.mean) > 0.25 && s.n >= 10) {
        const up = s.mean > s.median;
        add({ id: 'skew', emoji: '⚖️', tag: 'Distribuição', big: f(s.median), title: `Metade dos registros fica ${up ? 'abaixo' : 'acima'} de ${f(s.median)}`,
          text: `A mediana de ${q(m.name)} (${f(s.median)}) é bem ${up ? 'menor' : 'maior'} que a média (${f(s.mean)}): poucos valores ${up ? 'altos' : 'baixos'} puxam a média.`,
          lay: `A maioria das linhas tem ${q(m.name)} perto de ${f(s.median)}. Alguns poucos valores muito ${up ? 'grandes' : 'pequenos'} distorcem a média.` });
      }
    }
    const share = (!m || A.agg === 'sum') && !A.mixed, what = m ? q(m.name) : 'os registros';
    if (d && m && A.mixed && A.agg === 'sum') {
      const neg = A.byDim.filter(g => g.v < 0).sort((a, b) => a.v - b.v), pos = A.byDim.filter(g => g.v > 0).sort((a, b) => b.v - a.v);
      const tn = neg.reduce((x, g) => x + g.v, 0), tp = pos.reduce((x, g) => x + g.v, 0), sh = neg[0].v / tn, big = Math.abs(tn) >= tp;
      add({ id: 'top', emoji: '🏆', tag: 'Destaque', big: fmtPct(big ? sh : pos[0].v / tp), title: big ? `${neg[0].k} concentra ${fmtPct(sh)} das saídas` : `${pos[0].k} concentra ${fmtPct(pos[0].v / tp)} das entradas`,
        text: `Em ${q(d.name)}, os valores negativos (saídas) somam ${f(tn)} e ${q(neg[0].k)} responde por ${fmtPct(sh)} deles (${f(neg[0].v)}). Os positivos (entradas) somam ${f(tp)}, com ${q(pos[0].k)} à frente (${f(pos[0].v)}).`,
        lay: `De cada 10 ${A.unit === 'cur' ? 'reais ' : ''}que saem, ${Math.max(1, Math.round(sh * 10))} vão para ${q(neg[0].k)}. O que entra soma ${f(tp, true)}, principalmente de ${q(pos[0].k)}.`,
        frac: big ? sh : pos[0].v / tp, chart: { type: 'bar', x: d.i } });
    } else if (d && A.rank.length >= 2) {
      const [a, b] = A.rank, tot = A.rank.reduce((x, g) => x + g.v, 0), sh = tot ? a.v / tot : 0, ratio = b.v && a.v / b.v > 0 ? a.v / b.v : 0;
      add({ id: 'top', emoji: '🏆', tag: 'Destaque', big: share ? fmtPct(sh) : f(a.v), title: share ? `${a.k} ${A.neg ? 'concentra' : 'lidera com'} ${fmtPct(sh)}` : A.agg === 'sum' ? `${a.k} tem o maior valor` : `${a.k} tem a maior média`,
        text: share ? `Em ${q(d.name)}, ${q(a.k)} concentra ${fmtPct(sh)} de ${what} (${m ? f(a.v) : count(a.v, 'registro', 'registros')}), seguido por ${q(b.k)} com ${m ? f(b.v) : fmtNum(b.v)}.`
          : `Em ${q(d.name)}, ${q(a.k)} tem ${A.agg === 'sum' ? 'o maior valor' : 'a maior média'} de ${what} (${f(a.v)}), contra ${f(b.v)} de ${q(b.k)}.`,
        lay: share ? `De cada 10, ${Math.max(1, Math.round(sh * 10))} ${m ? `vêm de ${q(a.k)}` : `são de ${q(a.k)}`}. ${ratio ? `Isso é ${times(ratio, q(b.k))}, que vem em segundo.` : ''}`
          : `${q(a.k)} é quem tem o valor mais alto de ${what}: ${f(a.v)}. Em segundo vem ${q(b.k)}, com ${f(b.v)}.`,
        frac: share ? sh : null, chart: { type: 'bar', x: d.i } });
      if (share && A.rank.length >= 5) {
        const t3 = A.rank.slice(0, 3).reduce((x, g) => x + g.v, 0) / (tot || 1);
        add({ id: 'conc', emoji: t3 > 0.6 ? '🎯' : '🧩', tag: 'Concentração', big: fmtPct(t3), title: t3 > 0.6 ? `Os 3 maiores somam ${fmtPct(t3)}` : 'Resultado bem distribuído',
          text: `Os três maiores de ${q(d.name)} (${A.rank.slice(0, 3).map(g => g.k).join(', ')}) respondem por ${fmtPct(t3)} do total entre ${A.rank.length} grupos.`,
          lay: t3 > 0.6 ? `Só três de ${A.rank.length} grupos já fazem ${fmtPct(t3)} de tudo: ${A.rank.slice(0, 3).map(g => g.k).join(', ')}.` : `O resultado está bem espalhado: nenhum grupo manda sozinho.` });
      }
      const z = A.rank[A.rank.length - 1];
      if (A.rank.length >= 3) add({ id: 'last', emoji: '🐢', tag: 'Lanterna', big: m ? f(z.v, true) : fmtNum(z.v), title: `${z.k} fica por último`,
        text: `No outro extremo, ${q(z.k)} tem o menor resultado em ${q(d.name)}: ${m ? f(z.v) : count(z.v, 'registro', 'registros')}${z.v && a.v / z.v > 1 ? `, ${fmtNum(a.v / z.v)}× menor que o primeiro` : ''}.`,
        lay: `Quem ficou por último foi ${q(z.k)}, com ${m ? f(z.v) : count(z.v, 'linha', 'linhas')}.` });
    }
    const se = A.series;
    if (se.length >= 3) {
      const first = se[0], last = se[se.length - 1], half = Math.floor(se.length / 2), avg = l => l.reduce((x, p) => x + p.v, 0) / l.length;
      const h1 = avg(se.slice(0, half)), h2 = avg(se.slice(se.length - half)), delta = h1 ? (h2 - h1) / Math.abs(h1) : 0;
      const dir = delta > 0.05 ? 'alta' : delta < -0.05 ? 'queda' : 'estável', peak = se.reduce((a, b) => b.v > a.v ? b : a), low = se.reduce((a, b) => b.v < a.v ? b : a);
      A.trend = { dir, delta, first, last, peak, low };
      add({ id: 'trend', emoji: dir === 'alta' ? '📈' : dir === 'queda' ? '📉' : '➡️', tag: 'Tendência', big: (delta > 0 ? '+' : '') + fmtPct(delta), title: dir === 'estável' ? 'Ritmo estável ao longo do tempo' : `Tendência de ${dir} no período`,
        text: `Entre ${first.long} e ${last.long}, ${A.mLabel.toLowerCase()} passou de ${f(first.v)} para ${f(last.v)}; a média da segunda metade do período é ${fmtPct(Math.abs(delta))} ${delta >= 0 ? 'maior' : 'menor'} que a da primeira.`,
        lay: dir === 'estável' ? `Ao longo do tempo, os números ficaram mais ou menos no mesmo nível.` : (last.v - first.v) * delta > 0 ? `Com o passar do tempo, os números ${dir === 'alta' ? 'subiram' : 'caíram'}: começou em ${f(first.v, true)} (${first.long}) e terminou em ${f(last.v, true)} (${last.long}).` : `No geral, os números ${dir === 'alta' ? 'subiram' : 'caíram'}: a segunda metade do período foi ${fmtPct(Math.abs(delta))} ${delta > 0 ? 'maior' : 'menor'} que a primeira, mesmo com altos e baixos no caminho.`,
        chart: { type: 'line' } });
      add({ id: 'peak', emoji: '🚀', tag: 'Melhor momento', big: f(peak.v, true), title: `Pico em ${peak.long}`,
        text: `O ponto mais alto foi ${peak.long} (${f(peak.v)}) e o mais baixo, ${low.long} (${f(low.v)}).`,
        lay: `O melhor momento foi ${peak.long}, com ${f(peak.v, true)}. O mais fraco foi ${low.long}, com ${f(low.v, true)}.` });
    }
    if (A.dim2 && A.rank.length) {
      const g = group(A, A.dim2, m, A.agg);
      if (g.length >= 2) add({ id: 'dim2', emoji: '🔎', tag: A.dim2.name, big: m ? f(g[0].v, true) : fmtNum(g[0].v), title: `Em ${A.dim2.name}, ${g[0].k} vem na frente`,
        text: `Olhando por ${q(A.dim2.name)}, ${q(g[0].k)} lidera com ${m ? f(g[0].v) : count(g[0].v, 'registro', 'registros')}, à frente de ${q(g[1].k)} (${m ? f(g[1].v) : fmtNum(g[1].v)}).`,
        lay: `Separando por ${q(A.dim2.name)}, quem aparece na frente é ${q(g[0].k)}.`, chart: { type: 'bar', x: A.dim2.i } });
    }
    if (m && m.st.n >= 12) {
      const s = m.st, iqr = s.q3 - s.q1, hi = s.q3 + 3 * iqr, lo = s.q1 - 3 * iqr;
      const idx = m.vals.map((v, i) => v != null && iqr > 0 && (v > hi || v < lo) ? i : -1).filter(i => i >= 0);
      if (idx.length && idx.length <= A.n * 0.05 + 1) {
        const top = idx.reduce((a, b) => Math.abs(m.vals[b] - s.median) > Math.abs(m.vals[a] - s.median) ? b : a), who = A.labelCol && A.labelCol.vals[top];
        add({ id: 'out', emoji: '🔭', tag: 'Fora da curva', big: f(m.vals[top], true), title: `${count(idx.length, 'valor', 'valores')} fora do padrão`,
          text: `${count(idx.length, 'registro foge', 'registros fogem')} muito do padrão de ${q(m.name)}; o mais extremo é ${f(m.vals[top])}${who ? ` (${who}, linha ${top + 2})` : ` (linha ${top + 2})`}, contra uma mediana de ${f(s.median)}. Vale conferir se não é erro de digitação.`,
          lay: `Achei ${count(idx.length, 'valor', 'valores')} bem ${idx.length > 1 ? 'diferentes' : 'diferente'} do resto em ${q(m.name)}: ${f(m.vals[top])}${who ? ` (${who})` : ''}. Pode ser algo especial ou um errinho de digitação.` });
      }
    }
    if (A.corr) {
      const { a, b, r } = A.corr, pos = r > 0;
      add({ id: 'corr', emoji: '🔗', tag: 'Relação', big: NF({ maximumFractionDigits: 2 }).format(r), title: `${a.name} e ${b.name} andam ${pos ? 'juntos' : 'em sentidos opostos'}`,
        text: `Há correlação ${Math.abs(r) >= 0.8 ? 'forte' : 'moderada'} ${pos ? 'positiva' : 'negativa'} entre ${q(a.name)} e ${q(b.name)} (r = ${NF({ maximumFractionDigits: 2 }).format(r)}). Correlação não prova causa.`,
        lay: `Quando ${q(a.name)} sobe, ${q(b.name)} costuma ${pos ? 'subir também' : 'descer'}. Parecem estar ligados, mas isso não prova que um causa o outro.`, chart: { type: 'scatter', x: a.i, y: b.i } });
    }
    const gaps = A.gaps.filter(c => c.type !== 'id' && c.missing / A.n >= 0.03);
    if (gaps.length) add({ id: 'gaps', emoji: '🕳️', tag: 'Atenção', big: fmtPct(gaps[0].missing / A.n), title: `${count(gaps.length, 'coluna tem', 'colunas têm')} células vazias`, warn: true,
      text: `Dados faltando: ${gaps.slice(0, 4).map(c => `${q(c.name)} (${fmtPct(c.missing / A.n)} vazio)`).join(', ')}. As contas ignoram as células vazias.`,
      lay: `Algumas casinhas da planilha estão em branco, principalmente em ${q(gaps[0].name)}. Eu pulei essas na hora de fazer as contas.` });
    if (A.dups) add({ id: 'dups', emoji: '👯', tag: 'Atenção', big: fmtNum(A.dups), title: `${count(A.dups, 'linha repetida', 'linhas repetidas')}`, warn: true,
      text: `${count(A.dups, 'linha é cópia exata', 'linhas são cópias exatas')} de outra. Se for duplicidade, os totais estão inflados.`,
      lay: `Encontrei ${count(A.dups, 'linha igualzinha', 'linhas igualzinhas')} a outra. Se foi sem querer, as somas podem estar um pouco maiores do que deveriam.` });
    return out;
  }

  /* ---------- Gráficos: transforma uma escolha {type, x, y, agg} em dados prontos para desenhar ---------- */
  function resolve(A, spec) {
    const col = i => A.cols.find(c => c.i === i), m = spec.y === -1 ? null : spec.y != null ? col(spec.y) : A.measure;
    const agg = m ? (spec.agg || (spec.y != null ? m.agg : A.agg)) : 'sum', unit = m ? m.unit : '', mLabel = m ? (agg === 'avg' ? `Média de ${m.name}` : m.name) : 'Registros';
    const x = spec.x != null ? col(spec.x) : null;
    if (spec.type === 'hist') {
      const c = x || m;
      return c && c.type === 'num' ? { type: 'hist', title: `Como ${c.name} se distribui`, sub: `Quantos registros caem em cada faixa de valor`, values: c.vals.filter(v => v != null), unit: c.unit, xLabel: c.name } : null;
    }
    if (spec.type === 'scatter') {
      const a = x, b = spec.y != null ? col(spec.y) : null;
      if (!a || !b || a.type !== 'num' || b.type !== 'num') return null;
      const pts = [];
      for (let r = 0; r < A.n; r++) if (a.vals[r] != null && b.vals[r] != null) pts.push({ x: a.vals[r], y: b.vals[r], k: A.labelCol ? A.labelCol.vals[r] : '' });
      return { type: 'scatter', title: `${b.name} × ${a.name}`, sub: 'Cada ponto é uma linha da planilha', pts, xUnit: a.unit, yUnit: b.unit, xLabel: a.name, yLabel: b.name };
    }
    if (spec.type === 'line') {
      const dt = x && x.type === 'date' ? x : A.date;
      const items = dt ? series(A, dt, m, agg) : x && x.ord ? group(A, x, m, agg) : spec.x == null ? A.series : [];
      const tn = dt ? dt.name : x ? x.name : A.timeName;
      return items.length >= 2 ? { type: 'line', title: `${mLabel} ao longo do tempo`, sub: `Por ${tn}`, items, unit, mLabel } : null;
    }
    if (!x) return null;
    const items = x.type === 'date' ? series(A, x, m, agg) : group(A, x, m, agg);
    if (items.length < 1) return null;
    const type = spec.type === 'donut' && (agg === 'avg' || (items.some(g => g.v < 0) && items.some(g => g.v > 0))) ? 'bar' : spec.type === 'bar' && x.ord && items.length <= 24 ? 'cols' : spec.type;
    return { type, title: type === 'donut' ? `Participação de cada ${x.name}` : `${mLabel} por ${x.name}`, sub: m ? (agg === 'avg' ? 'Média de cada grupo' : 'Soma de cada grupo') : 'Número de registros em cada grupo', items, unit, mLabel, ordered: !!x.ord || x.type === 'date' };
  }
  /* Galeria automática: o que vale a pena mostrar para esta planilha. */
  function gallery(A) {
    const specs = [];
    if (A.series.length >= 2) specs.push({ type: 'line' });
    A.cats.filter(c => c.distinct <= 40).slice(0, 4).forEach((c, k) => {
      specs.push({ type: 'bar', x: c.i });
      if (k === 0 && c.distinct <= 6 && !c.ord) specs.push({ type: 'donut', x: c.i });
    });
    A.nums.slice(0, 3).forEach(c => specs.push({ type: 'hist', x: c.i }));
    if (A.corr) specs.push({ type: 'scatter', x: A.corr.a.i, y: A.corr.b.i });
    if (A.measure) A.cats.filter(c => c.distinct <= 40).slice(0, 2).forEach(c => specs.push({ type: 'bar', x: c.i, y: -1 }));
    return specs;
  }

  return { shape, tables, build, resolve, gallery, group, stats, parseDate, isNum: v => typeof v === 'number' || loose(v) != null };
})();
