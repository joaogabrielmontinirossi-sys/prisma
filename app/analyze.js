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
  function shape(raw, name, hints) {
    let rows = (raw || []).filter(r => r && r.some(nonEmpty));
    if (!rows.length) return null;
    const filled = r => r.filter(nonEmpty).length, maxF = Math.max(...rows.slice(0, 30).map(filled));
    let h = rows.findIndex(r => filled(r) >= Math.max(2, maxF * 0.6));
    if (h < 0 || h > 15) h = 0;
    const hr = rows[h], isHeader = rows.length > h + 1 && hr.filter(nonEmpty).every(v => typeof v === 'string' && loose(v) == null && parseDate(v) == null);
    const data = rows.slice(isHeader ? h + 1 : h), width = Math.max(maxOf(data.map(r => r.length)), hr.length);
    const keep = [];
    for (let i = 0; i < width; i++) if (data.some(r => nonEmpty(r[i]))) keep.push(i);
    if (!keep.length || !data.length) return null;
    const seen = {};
    const header = keep.map(i => {
      let n = isHeader && nonEmpty(hr[i]) ? String(hr[i]).trim().replace(/\s+/g, ' ') : 'Coluna ' + colName(i);
      if (seen[n]) n += ' ' + (++seen[n]); else seen[n] = 1;
      return n;
    });
    const isTotal = r => { const t = r.find(v => typeof v === 'string' && v.trim()); return t && /^(sub)?total( geral)?\b|^soma\b/i.test(t.trim()); };
    const out = data.filter(r => !isTotal(r)).map(r => keep.map(i => { const v = r[i]; return nonEmpty(v) ? (typeof v === 'string' ? v.trim() : v) : null; }));
    const hh = {};
    keep.forEach((i, k) => { if (hints && hints[i]) hh[k] = hints[i]; });
    return out.length ? { name: name || 'Planilha', header, rows: out, hints: hh } : null;
  }

  /* ---------- Perfil das colunas ---------- */
  const CUR_RE = /valor|preco|custo|receita|fatura|salario|venda|despesa|gasto|lucro|r\$|montante|pagamento|orcamento|saldo|renda/;
  const AVG_RE = /idade|nota|media|taxa|unitario|preco|score|avalia|satisfa|temperatura|altura|peso|indice|prazo|percent|margem|%|salario|nps|tempo/;
  const ID_RE = /^(id|#|n[ºo°.]?|num(ero)?( d[aeo].*)?|cod(igo)?\b.*|cpf|cnpj|cep|tel(efone)?|celular|matricula|pedido|nf|protocolo|ddd|rg)$/;
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
      if (!type) type = !n ? 'text' : nDate >= n * 0.9 ? 'date' : nNum >= n * 0.9 ? 'num' : 'str';
      if (type === 'date' && !nDate) type = 'str';
      if (type === 'num' && !nNum) type = 'str';
      if (type === 'date') col.vals = raw.map(parseDate);
      else if (type === 'num') {
        col.vals = raw.map(pn);
        const nums = col.vals.filter(v => v != null), ints = nums.every(Number.isInteger), auto = !(types && types[i]);
        const lo = minOf(nums), hi = maxOf(nums), distinct = new Set(nums).size;
        if (auto && ints && lo >= 1900 && hi <= 2100 && nums.length > 1) { type = 'cat'; col.vals = col.vals.map(v => v == null ? null : String(v)); col.ord = k => +k; }
        else if (auto && (ID_RE.test(nn) || (ints && nums.length >= 15 && distinct === nums.length && hi - lo === nums.length - 1))) { type = 'id'; col.vals = asText(); }
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
      if (type === 'str') type = col.distinct <= 40 && (col.distinct <= n * 0.6 || n <= 12 && col.distinct < n) ? 'cat' : 'text';
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
    return dim.ord ? out.sort((a, b) => dim.ord(a.k) - dim.ord(b.k)) : out.sort((a, b) => b.v - a.v);
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

  /* ---------- Modelo completo de um board ---------- */
  function build(board) {
    const sheet = board.sheets[board.sheet];
    if (!sheet) return null;
    const cfg = board.cfg, sc = (cfg.s && cfg.s[board.sheet]) || {};
    const cols = profile(sheet, sc.types), by = t => cols.filter(c => c.type === t);
    const nums = by('num'), cats = by('cat').filter(c => c.distinct >= 2), dates = by('date');
    const pickCol = (v, list, def) => v === -1 ? null : list.find(c => c.i === v) || def || null;
    const A = { board, sheet, title: board.title, n: sheet.rows.length, cols, nums, cats, dates };
    A.measure = pickCol(sc.measure, nums, nums.find(c => c.unit === 'cur') || nums.find(c => /total|quant|qtd/.test(norm(c.name))) || nums[0]);
    A.dim = pickCol(sc.dim, cats, cats.find(c => !c.ord && c.distinct <= 20) || cats[0]);
    A.date = pickCol(sc.date, dates, dates[0]);
    A.agg = A.measure ? (sc.agg || A.measure.agg) : 'sum';
    A.unit = A.measure ? A.measure.unit : '';
    A.dim2 = cats.find(c => c !== A.dim && !c.ord && c.distinct <= 20) || null;
    A.mLabel = A.measure ? (A.agg === 'avg' ? `Média de ${A.measure.name}` : A.measure.name) : 'Registros';
    A.f = (v, compact) => fmtNum(v, A.unit, compact);
    A.byDim = A.dim ? group(A, A.dim, A.measure, A.agg) : [];
    A.rank = [...A.byDim].sort((a, b) => b.v - a.v);
    const ordDim = !A.date && cats.find(c => c.ord);
    A.series = A.date ? series(A, A.date, A.measure, A.agg) : ordDim ? group(A, ordDim, A.measure, A.agg).map(g => ({ k: g.k, long: g.k, n: g.n, v: g.v })) : [];
    A.timeName = A.date ? A.date.name : ordDim ? ordDim.name : '';
    A.corr = null;
    const ns = nums.slice(0, 7);
    for (let a = 0; a < ns.length; a++) for (let b = a + 1; b < ns.length; b++) {
      const r = pearson(ns[a].vals, ns[b].vals);
      if (Math.abs(r) >= 0.5 && (!A.corr || Math.abs(r) > Math.abs(A.corr.r))) A.corr = { a: ns[a], b: ns[b], r };
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
        text: `A soma de ${q(m.name)} é ${f(s.sum)}, com média de ${f(s.mean)} por registro (de ${f(s.min)} a ${f(s.max)}).`,
        lay: `Somando tudo de ${q(m.name)}, dá ${f(s.sum, true)}. Se fosse dividido por igual, cada linha ficaria com ${f(s.mean)}.` });
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
    const share = !m || A.agg === 'sum', what = m ? q(m.name) : 'os registros';
    if (d && A.rank.length >= 2) {
      const [a, b] = A.rank, tot = A.rank.reduce((x, g) => x + Math.max(0, g.v), 0), sh = tot ? a.v / tot : 0, ratio = b.v > 0 ? a.v / b.v : 0;
      add({ id: 'top', emoji: '🏆', tag: 'Destaque', big: share ? fmtPct(sh) : f(a.v), title: share ? `${a.k} lidera com ${fmtPct(sh)}` : `${a.k} tem a maior média`,
        text: share ? `Em ${q(d.name)}, ${q(a.k)} concentra ${fmtPct(sh)} de ${what} (${m ? f(a.v) : count(a.v, 'registro', 'registros')}), seguido por ${q(b.k)} com ${m ? f(b.v) : fmtNum(b.v)}.`
          : `Em ${q(d.name)}, ${q(a.k)} tem a maior média de ${what} (${f(a.v)}), contra ${f(b.v)} de ${q(b.k)}.`,
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
        text: `No outro extremo, ${q(z.k)} tem o menor resultado em ${q(d.name)}: ${m ? f(z.v) : count(z.v, 'registro', 'registros')}${a.v && z.v > 0 ? `, ${fmtNum(a.v / z.v)}× menor que o líder` : ''}.`,
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
      const g = group(A, A.dim2, m, A.agg).sort((a, b) => b.v - a.v);
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
    const gaps = A.gaps.filter(c => c.missing / A.n >= 0.03);
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
    const type = spec.type === 'donut' && (agg === 'avg' || items.some(g => g.v < 0)) ? 'bar' : spec.type === 'bar' && x.ord && items.length <= 24 ? 'cols' : spec.type;
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

  return { shape, build, resolve, gallery, group, stats, parseDate };
})();
