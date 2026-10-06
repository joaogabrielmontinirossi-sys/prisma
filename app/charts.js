'use strict';
/* Prisma — gráficos em SVG puro. As cores vêm das variáveis CSS (--s1…--s8, --ink, --grid…), então acompanham o tema. */

const Charts = (() => {
  const SER = [1, 2, 3, 4, 5, 6, 7, 8].map(i => `var(--s${i})`);
  const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 11.5}" fill="var(--${o.fill || 'muted'})" text-anchor="${o.anchor || 'start'}"${o.bold ? ' font-weight="600"' : ''}>${esc(s)}</text>`;
  const tip = s => ` data-tip="${esc(s)}"`;
  const svg = (W, H, body) => `<svg class="ch" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${body}</svg>`;
  const minOf = a => a.reduce((x, y) => y < x ? y : x, Infinity), maxOf = a => a.reduce((x, y) => y > x ? y : x, -Infinity);
  function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
  function ticks(lo, hi, n = 4) {
    if (!(hi > lo)) hi = lo + 1;
    const step = niceStep((hi - lo) / n), a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step, out = [];
    for (let v = a; v <= b + step / 2; v += step) out.push(+v.toFixed(10));
    return out;
  }
  /* Mais grupos do que cabem: os menores viram "Outros" (ou ficam de fora, quando é média). */
  function fold(c, max) {
    if (c.items.length <= max) return c.items;
    const head = c.items.slice(0, max), rest = c.items.slice(max);
    if (c.ordered || /^Média/.test(c.sub || '')) return head;
    return [...head, { k: `Outros (${rest.length})`, v: rest.reduce((a, g) => a + g.v, 0), other: true }];
  }
  /* Eixo Y com linhas de grade; devolve a função de escala. */
  function yAxis(lo, hi, unit, x0, x1, y0, y1) {
    const tk = ticks(Math.min(0, lo), hi), a = tk[0], b = tk[tk.length - 1], y = v => y1 - (v - a) / (b - a) * (y1 - y0);
    const g = tk.map(v => `<line x1="${x0}" x2="${x1}" y1="${y(v)}" y2="${y(v)}" stroke="var(--${v === 0 ? 'axis' : 'grid'})"/>` + T(x0 - 6, y(v) + 4, fmtNum(v, unit, true), { anchor: 'end' })).join('');
    return { y, g };
  }

  /* Barras horizontais; com valores negativos, crescem para a esquerda a partir da linha do zero. */
  /* Margem esquerda do tamanho do maior rótulo do eixo (R$ 30 mil ocupa mais que 30). */
  const padL = (lo, hi, unit) => Math.max(40, maxOf(ticks(Math.min(0, lo), hi).map(v => fmtNum(v, unit, true).length)) * 6.6 + 12);
  function bar(c, W) {
    const items = fold(c, 12), rowH = 30, lo = Math.min(0, minOf(items.map(g => g.v))), hi = Math.max(0, maxOf(items.map(g => g.v))), span = hi - lo || 1;
    const labelW = Math.min(W * 0.36, Math.max(56, maxOf(items.map(g => String(g.k).length)) * 6.6 + 14)), fit = Math.floor((labelW - 10) / 6.3);
    const valW = maxOf(items.map(g => fmtNum(g.v, c.unit, true).length)) * 6.9 + 12, x0 = labelW + (lo < 0 ? valW : 0), plot = Math.max(40, W - x0 - (hi > 0 ? valW : 6)), zero = x0 + plot * -lo / span;
    let b = `<line x1="${zero}" y1="0" x2="${zero}" y2="${items.length * rowH}" stroke="var(--axis)"/>`;
    items.forEach((g, i) => {
      const y = i * rowH + 6, h = 18, w = g.v ? Math.max(2, Math.abs(g.v) / span * plot) : 0, r = Math.min(4, w), col = `var(--${g.other ? 'other' : 's1'})`;
      b += `<g class="mk"${tip(`${g.k}: ${fmtNum(g.v, c.unit)}`)}><rect x="0" y="${i * rowH}" width="${W}" height="${rowH}" fill="transparent"/>${T(labelW - 8, y + 13, cut(g.k, fit), { anchor: 'end', fill: 'ink2' })}`
        + (g.v > 0 ? `<path d="M${zero} ${y}h${w - r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 -${r} ${r}h-${w - r}z" fill="${col}"/>` : g.v < 0 ? `<path d="M${zero} ${y}h-${w - r}a${r} ${r} 0 0 0 -${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 0 ${r} ${r}h${w - r}z" fill="${col}"/>` : '')
        + (g.v < 0 ? T(zero - w - 6, y + 13, fmtNum(g.v, c.unit, true), { fill: 'ink', anchor: 'end' }) : T(zero + w + 6, y + 13, fmtNum(g.v, c.unit, true), { fill: 'ink' })) + '</g>';
    });
    return svg(W, items.length * rowH + 4, b);
  }

  function cols(c, W) {
    const items = c.items.slice(0, 36), n = items.length, H = 236, x0 = padL(minOf(items.map(g => g.v)), maxOf(items.map(g => g.v)), c.unit), x1 = W - 8, y0 = 20, y1 = H - 28;
    const ax = yAxis(minOf(items.map(g => g.v)), maxOf(items.map(g => g.v)), c.unit, x0, x1, y0, y1), band = (x1 - x0) / n, bw = Math.max(3, Math.min(24, band - 2));
    const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((x1 - x0) / 46))));
    let b = ax.g;
    items.forEach((g, i) => {
      const cx = x0 + band * (i + 0.5), ya = ax.y(Math.max(0, g.v)), yb = ax.y(Math.min(0, g.v)), h = Math.max(g.v ? 2 : 0, yb - ya), r = Math.min(4, bw / 2, h);
      b += `<g class="mk"${tip(`${g.long || g.k}: ${fmtNum(g.v, c.unit)}`)}><rect x="${x0 + band * i}" y="${y0}" width="${band}" height="${y1 - y0}" fill="transparent"/>`
        + (g.v >= 0 ? `<path d="M${cx - bw / 2} ${ya + h}v-${h - r}a${r} ${r} 0 0 1 ${r} -${r}h${bw - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - r}z" fill="var(--s1)"/>` : `<rect x="${cx - bw / 2}" y="${ya}" width="${bw}" height="${h}" fill="var(--s1)"/>`)
        + (band >= maxOf(items.map(g => fmtNum(g.v, c.unit, true).length)) * 6.3 + 6 ? T(cx, (g.v >= 0 ? ya : yb + 14) - 5, fmtNum(g.v, c.unit, true), { anchor: 'middle', fill: 'ink', size: 11 }) : '')
        + (i % every === 0 ? T(cx, H - 10, cut(g.k, Math.max(4, Math.floor(band * every / 6.4))), { anchor: 'middle' }) : '') + '</g>';
    });
    return svg(W, H, b);
  }

  function line(c, W) {
    const items = c.items, n = items.length, H = 244, x0 = padL(minOf(items.map(g => g.v)), maxOf(items.map(g => g.v)), c.unit), x1 = W - 14 - fmtNum(items[n - 1].v, c.unit, true).length * 7, y0 = 16, y1 = H - 28;
    const ax = yAxis(minOf(items.map(g => g.v)), maxOf(items.map(g => g.v)), c.unit, x0, x1, y0, y1);
    const X = i => n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (n - 1), pts = items.map((g, i) => [X(i), ax.y(g.v)]);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(''), every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((x1 - x0) / 58))));
    let b = ax.g + `<path d="${path}L${pts[n - 1][0]} ${ax.y(0)}L${pts[0][0]} ${ax.y(0)}z" fill="var(--s1)" fill-opacity=".1"/><path d="${path}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const step = n > 1 ? (x1 - x0) / (n - 1) : x1 - x0;
    items.forEach((g, i) => {
      if (i % every === 0 && (i + every < n || i === n - 1 || n - 1 - i >= every * 0.6)) b += T(pts[i][0], H - 10, g.k, { anchor: 'middle' });
      b += `<g class="pt"${tip(`${g.long || g.k}: ${fmtNum(g.v, c.unit)}`)}><rect x="${pts[i][0] - step / 2}" y="${y0}" width="${step}" height="${y1 - y0}" fill="transparent"/><line class="guide" x1="${pts[i][0]}" x2="${pts[i][0]}" y1="${y0}" y2="${y1}" stroke="var(--axis)"/><circle class="dot" cx="${pts[i][0]}" cy="${pts[i][1]}" r="5" fill="var(--s1)" stroke="var(--surface)" stroke-width="2"/></g>`;
    });
    const e = pts[n - 1];
    b += `<circle cx="${e[0]}" cy="${e[1]}" r="5" fill="var(--s1)" stroke="var(--surface)" stroke-width="2" pointer-events="none"/>` + T(e[0] + 9, e[1] + 4, fmtNum(items[n - 1].v, c.unit, true), { fill: 'ink', bold: true });
    return svg(W, H, b);
  }

  function donut(c, W) {
    const all = fold(c, 5), sg = all.some(g => g.v > 0) ? 1 : -1, items = all.filter(g => g.v * sg > 0), tot = items.reduce((a, g) => a + g.v, 0) || 1, R = 62, SW = 24, C = 2 * Math.PI * R, wide = W >= 430, cx = wide ? 98 : W / 2, cy = 98;
    const lx = wide ? 212 : 8, ly = wide ? Math.max(18, 98 - items.length * 13) : 208, H = wide ? 196 : 214 + items.length * 26;
    let b = '', acc = 0;
    items.forEach((g, i) => {
      const fr = g.v / tot, len = Math.max(0.5, fr * C - 2), col = g.other ? 'var(--other)' : SER[i], y = ly + i * 26;
      b += `<circle class="mk" cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${col}" stroke-width="${SW}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc * C}" transform="rotate(-90 ${cx} ${cy})"${tip(`${g.k}: ${fmtNum(g.v, c.unit)} (${fmtPct(fr)})`)}/>`
        + `<rect x="${lx}" y="${y}" width="11" height="11" rx="3" fill="${col}"/>` + T(lx + 18, y + 10, cut(g.k, Math.floor((W - lx - 130) / 6.3)), { fill: 'ink2', size: 12 }) + T(W - 4, y + 10, `${fmtPct(fr)} · ${fmtNum(g.v, c.unit, true)}`, { anchor: 'end', fill: 'ink', size: 12 });
      acc += fr;
    });
    b += T(cx, cy + 3, fmtNum(tot, c.unit, true), { anchor: 'middle', fill: 'ink', size: 19, bold: true }) + T(cx, cy + 20, 'total', { anchor: 'middle', size: 11 });
    return svg(W, H, b);
  }

  function hist(c, W) {
    const v = c.values, lo = minOf(v), hi = maxOf(v), k = Math.min(20, Math.max(5, Math.ceil(Math.log2(v.length || 1)) + 1)), step = niceStep((hi - lo) / k || 1);
    const a = Math.floor(lo / step) * step, n = Math.max(1, Math.ceil((hi - a) / step + 1e-9)), bins = new Array(n).fill(0);
    v.forEach(x => bins[Math.min(n - 1, Math.floor((x - a) / step))]++);
    const H = 236, x0 = 50, x1 = W - 12, y0 = 14, y1 = H - 28, ax = yAxis(0, maxOf(bins), '', x0, x1, y0, y1), band = (x1 - x0) / n, every = Math.max(1, Math.ceil((n + 1) / Math.max(1, Math.floor((x1 - x0) / 58))));
    let b = ax.g;
    bins.forEach((q, i) => {
      const x = x0 + band * i + 1, w = Math.max(1, band - 2), h = q ? Math.max(2, y1 - ax.y(q)) : 0, r = Math.min(4, w / 2, h);
      b += `<g class="mk"${tip(`De ${fmtNum(a + i * step, c.unit)} a ${fmtNum(a + (i + 1) * step, c.unit)}: ${count(q, 'registro', 'registros')}`)}><rect x="${x0 + band * i}" y="${y0}" width="${band}" height="${y1 - y0}" fill="transparent"/>`
        + (h ? `<path d="M${x} ${y1}v-${h - r}a${r} ${r} 0 0 1 ${r} -${r}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - r}z" fill="var(--s1)"/>` : '') + '</g>';
    });
    for (let i = 0; i <= n; i += every) b += T(x0 + band * i, H - 10, fmtNum(+(a + i * step).toFixed(10), c.unit, true), { anchor: 'middle' });
    return svg(W, H, b);
  }

  function scatter(c, W) {
    const stepN = Math.ceil(c.pts.length / 1200), pts = c.pts.filter((_, i) => i % stepN === 0), H = 290, x0 = padL(minOf(pts.map(p => p.y)), maxOf(pts.map(p => p.y)), c.yUnit), x1 = W - 16, y0 = 26, y1 = H - 42;
    const ax = yAxis(minOf(pts.map(p => p.y)), maxOf(pts.map(p => p.y)), c.yUnit, x0, x1, y0, y1), xt = ticks(Math.min(0, minOf(pts.map(p => p.x))), maxOf(pts.map(p => p.x)), Math.max(2, Math.floor((x1 - x0) / 90)));
    const X = v => x0 + (v - xt[0]) / (xt[xt.length - 1] - xt[0]) * (x1 - x0);
    let b = ax.g + xt.map(v => T(X(v), y1 + 16, fmtNum(v, c.xUnit, true), { anchor: 'middle' })).join('') + T(4, 12, c.yLabel, { fill: 'ink2' }) + T(x1, H - 6, c.xLabel, { anchor: 'end', fill: 'ink2' });
    pts.forEach(p => { b += `<circle class="mk" cx="${X(p.x).toFixed(1)}" cy="${ax.y(p.y).toFixed(1)}" r="4.5" fill="var(--s1)" fill-opacity=".72" stroke="var(--surface)" stroke-width="1.5"${tip(`${p.k ? p.k + ' — ' : ''}${c.xLabel}: ${fmtNum(p.x, c.xUnit)} · ${c.yLabel}: ${fmtNum(p.y, c.yUnit)}`)}/>`; });
    return svg(W, H, b);
  }

  const DRAW = { bar, cols, line, donut, hist, scatter };
  const draw = (c, W) => DRAW[c.type](c, Math.max(260, Math.round(W)));
  function mount(el, c) { el.innerHTML = draw(c, el.clientWidth || 600); }

  /* Os mesmos números do gráfico, em tabela. */
  function table(c) {
    const rows = c.type === 'scatter' ? c.pts.slice(0, 200).map(p => [p.k || '', fmtNum(p.x, c.xUnit), fmtNum(p.y, c.yUnit)])
      : c.type === 'hist' ? [] : c.items.map(g => [g.long || g.k, fmtNum(g.v, c.unit)]);
    const head = c.type === 'scatter' ? ['', c.xLabel, c.yLabel] : ['', c.mLabel];
    if (!rows.length) return '<p class="muted">Passe o mouse (ou toque) nas colunas para ver cada faixa.</p>';
    return `<div class="tscroll"><table class="mini"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((v, i) => `<td${i ? ' class="num"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  /* ---------- Exportação em imagem ---------- */
  function flatten(svgText) {
    const cs = getComputedStyle(document.documentElement);
    return svgText.replace(/var\((--[\w-]+)\)/g, (_, n) => cs.getPropertyValue(n).trim() || '#888');
  }
  async function toPng(svgText, scale = 2) {
    const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svgText), w = +m[1], h = +m[2];
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(flatten(svgText).replace('<svg ', '<svg font-family="Segoe UI, system-ui, -apple-system, Roboto, sans-serif" '));
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = w * scale; cv.height = h * scale;
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return new Promise(res => cv.toBlob(res, 'image/png'));
  }
  /* Gráfico com título e fundo, pronto para colar num slide ou mandar por mensagem. */
  function poster(c, W = 760) {
    const inner = draw(c, W - 48), h = +/height="([\d.]+)"/.exec(inner)[1];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h + 96}" width="${W}" height="${h + 96}"><rect width="${W}" height="${h + 96}" fill="var(--surface)"/>${T(24, 36, c.title, { fill: 'ink', size: 17, bold: true })}${T(24, 56, c.sub || '', { size: 12.5 })}<g transform="translate(24 74)">${inner}</g></svg>`;
  }

  /* ---------- Balão de valores (mouse e toque) ---------- */
  function hover(e) {
    const t = e.target.closest && e.target.closest('[data-tip]'), tipEl = $('#tip');
    if (!tipEl) return;
    if (!t) { tipEl.hidden = true; return; }
    tipEl.textContent = t.dataset.tip;
    tipEl.hidden = false;
    const w = tipEl.offsetWidth, x = Math.min(innerWidth - w - 8, Math.max(8, e.clientX + 14)), y = e.clientY + 18 + tipEl.offsetHeight > innerHeight ? e.clientY - tipEl.offsetHeight - 10 : e.clientY + 18;
    tipEl.style.transform = `translate(${x}px, ${y}px)`;
  }
  addEventListener('pointermove', hover);
  addEventListener('pointerdown', hover);
  addEventListener('scroll', () => { const t = $('#tip'); if (t) t.hidden = true; }, true);

  return { draw, mount, table, toPng, poster, flatten, SER };
})();
