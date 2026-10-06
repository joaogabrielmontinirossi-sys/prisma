'use strict';
/* Prisma — as visões de uma planilha: resumo, gráficos, relatório, infográfico, fofinho, cartões e dados. */

const Views = (() => {
  const TABS = [['geral', 'Visão geral', 'sheet'], ['resumo', 'Resumo', 'spark'], ['graficos', 'Gráficos', 'chart'], ['relatorio', 'Relatório', 'pdf'], ['info', 'Infográfico', 'img'], ['fofo', 'Fofinho', 'spark'], ['cartoes', 'Cartões', 'copy'], ['dados', 'Dados', 'table']];
  const TYPE = { num: 'Número', cat: 'Categoria', date: 'Data', text: 'Texto', id: 'Código' };
  const byId = (A, ...ids) => ids.map(id => A.ins.find(x => x.id === id)).filter(Boolean);

  /* ---------- Pri, a mascote (um prisma sorridente) ---------- */
  function pri(mood = 'happy') {
    const mouth = mood === 'wow' ? '<ellipse cx="60" cy="86" rx="5" ry="6" fill="#2b2350"/>' : mood === 'hmm' ? '<path d="M53 87h14" stroke="#2b2350" stroke-width="3.2" stroke-linecap="round"/>' : '<path d="M52 83q8 9 16 0" fill="none" stroke="#2b2350" stroke-width="3.2" stroke-linecap="round"/>';
    return `<defs><linearGradient id="prig" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8f7cf7"/><stop offset="1" stop-color="#f08ab4"/></linearGradient></defs>
<g stroke-width="5" stroke-linecap="round" fill="none"><path d="M96 58l18-8" stroke="#ffd166"/><path d="M99 70l19-1" stroke="#7ee0b8"/><path d="M98 82l17 7" stroke="#7fb7f5"/></g>
<path d="M60 22l40 76H20z" fill="url(#prig)" stroke="url(#prig)" stroke-width="14" stroke-linejoin="round"/>
<path d="M56 30l-22 42" stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/>
<circle cx="47" cy="74" r="5.2" fill="#2b2350"/><circle cx="73" cy="74" r="5.2" fill="#2b2350"/><circle cx="48.8" cy="72.2" r="1.7" fill="#fff"/><circle cx="74.8" cy="72.2" r="1.7" fill="#fff"/>
<ellipse cx="37" cy="85" rx="6.5" ry="3.8" fill="#ffb3cf" opacity=".85"/><ellipse cx="83" cy="85" rx="6.5" ry="3.8" fill="#ffb3cf" opacity=".85"/>${mouth}`;
  }
  const priSvg = (mood, size = 96) => `<svg class="pri" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">${pri(mood)}</svg>`;

  const EMO = [[/venda|receita|fatura|valor|preco|custo|lucro|salario|pagamento|gasto|despesa|renda/, '💰'], [/quant|qtd|unidade|estoque/, '📦'], [/nota|avalia|satisfa|nps/, '⭐'], [/idade/, '🎂'], [/cliente|pessoa|aluno|func|vendedor|nome/, '🧑'], [/cidade|estado|regiao|bairro|pais|local/, '📍'], [/produto|item/, '🛍️'], [/tempo|prazo|hora|dia/, '⏰'], [/peso/, '⚖️']];
  const emo = name => (EMO.find(e => e[0].test(norm(name))) || [0, '📊'])[1];

  /* ---------- Textos de síntese ---------- */
  const Texts = {
    one(A) {
      const m = A.measure, t = A.rank[0], tr = A.trend;
      let s = `São ${count(A.n, 'registro', 'registros')}`;
      if (m) s += A.agg === 'sum' ? ` que somam ${A.f(m.st.sum)} em ${m.name}` : ` com média de ${A.f(m.st.mean)} em ${m.name}`;
      if (t && A.dim) s += `, com destaque para ${t.k} em ${A.dim.name}`;
      if (tr) s += tr.dir === 'estável' ? ' e ritmo estável no período' : ` e tendência de ${tr.dir} no período`;
      return s + '.';
    },
    points: A => [...byId(A, 'total', 'mean', 'top', 'trend'), ...A.ins.filter(x => !['size', 'total', 'mean', 'top', 'trend'].includes(x.id))].slice(0, 3),
    full(A) {
      const pick = (...ids) => byId(A, ...ids).map(x => x.text).join(' ');
      return [pick('size', 'total', 'mean', 'skew'), pick('top', 'conc', 'last', 'dim2'), pick('trend', 'peak'), pick('out', 'corr'), pick('gaps', 'dups')].filter(Boolean);
    },
    message(A) {
      return `📊 *${A.title}*\n\n${A.ins.filter(x => x.id !== 'size').slice(0, 6).map(x => `${x.emoji} ${x.lay}`).join('\n')}\n\n(${count(A.n, 'linha analisada', 'linhas analisadas')} com o Prisma)`;
    },
  };

  /* ---------- Peças comuns ---------- */
  const chartCard = (ctx, c, o = {}) => !c ? '' : `<figure class="${o.plain ? 'plainchart' : 'card'} chartcard" data-ci="${ctx.add(c)}">${o.title === ' ' ? '' : `<figcaption><div><h3>${esc(o.title || c.title)}</h3><p class="muted">${esc(c.sub || '')}</p></div>${o.plain ? '' : `<span class="tools"><button class="icon" data-act="ctable" title="Ver os números em tabela">${ic('table')}</button><button class="icon" data-act="cpng" title="Salvar como imagem">${ic('img')}</button>${o.custom != null ? `<button class="icon" data-act="cdel" data-k="${o.custom}" title="Remover este gráfico">${ic('trash')}</button>` : ''}</span>`}</figcaption>`}<div class="chart"></div><div class="ctable" hidden></div></figure>`;
  const insChart = (A, ctx, x, o) => x && x.chart ? chartCard(ctx, Analyze.resolve(A, x.chart), o) : '';
  function tiles(A) {
    const m = A.measure, t = A.rank[0], tr = A.trend, out = [];
    out.push(['Registros', fmtNum(A.n), `${A.cols.length} colunas`]);
    if (m) out.push(A.agg === 'sum' ? ['Média por registro', A.f(m.st.mean), `de ${A.f(m.st.min, true)} a ${A.f(m.st.max, true)}`] : ['Mediana', A.f(m.st.median), `de ${A.f(m.st.min, true)} a ${A.f(m.st.max, true)}`]);
    if (t) out.push([`${A.neg ? 'Maior peso' : 'Maior'} em ${A.dim.name}`, t.k, A.measure ? A.f(t.v, true) : count(t.v, 'registro', 'registros')]);
    if (tr) out.push(['Tendência', (tr.delta > 0 ? '▲ ' : tr.delta < 0 ? '▼ ' : '') + fmtPct(Math.abs(tr.delta)), `${tr.dir}, 2ª metade vs. 1ª`]);
    return out;
  }
  const tileHtml = list => `<div class="tiles">${list.map(([l, v, s]) => `<div class="tile"><span class="tl">${esc(l)}</span><b class="tv" title="${esc(v)}">${esc(cut(v, 22))}</b><span class="ts">${esc(s)}</span></div>`).join('')}</div>`;
  const hbars = (items, f, max = 5, medals) => { const top = Math.max(...items.slice(0, max).map(g => Math.abs(g.v)), 1e-9); return `<div class="hbars">${items.slice(0, max).map((g, i) => `<div class="hb"><span class="hbn">${medals ? ['🥇', '🥈', '🥉'][i] || i + 1 + 'º' : i + 1}</span><span class="hbk">${esc(g.k)}</span><span class="hbt"><i style="width:${Math.max(3, Math.abs(g.v) / top * 100)}%"></i></span><span class="hbv">${esc(f(g.v, true))}</span></div>`).join('')}</div>`; };
  const fval = A => A.measure ? A.f : v => fmtNum(v);
  const source = A => { const s = A.board.source; return s.kind === 'gsheet' ? 'Google Planilhas' : s.kind === 'paste' ? 'dados colados' : s.name || 'arquivo'; };

  /* ---------- Visão geral: tudo o que foi encontrado na planilha inteira ---------- */
  const kpiTile = k => [k.label, typeof k.value === 'number' ? fmtNum(k.value, k.unit) : k.value, k.tab];
  const tabKpis = A => (A.board.kpis || []).filter(k => k.tab === A.sheet.tab);
  function geral(A, ctx) {
    const b = A.board, kp = b.kpis || [], byLabel = new Map(), tabs = [...new Set(b.sheets.map(s => s.tab || s.name))];
    kp.filter(k => typeof k.value === 'number').forEach(k => { const key = norm(k.label); if (!byLabel.has(key)) byLabel.set(key, []); byLabel.get(key).push(k); });
    // o mesmo indicador repetido em várias abas (ex.: saldo de cada mês) vira um gráfico comparando as abas
    const rep = [...byLabel.values()].filter(l => new Set(l.map(k => k.tab)).size >= 3), inRep = new Set(rep.flat());
    const loose = kp.filter(k => !inRep.has(k)), groups = [...new Set(loose.map(k => k.tab))];
    const one = i => { try { return b.sheets.length <= 60 && b.sheets[i].rows.length <= 3000 ? Texts.one(Analyze.build(b, i)) : ''; } catch (e) { return ''; } };
    return `<section class="card hero"><span class="eyebrow">Visão geral da planilha</span><h1 class="gtitle">${esc(A.title)}</h1><p class="lead">Encontrei ${count(b.sheets.length, 'tabela', 'tabelas')}${kp.length ? ` e ${count(kp.length, 'indicador', 'indicadores')}` : ''} em ${count(tabs.length, 'aba', 'abas')}. Escolha uma tabela abaixo para ver resumo, gráficos, relatório, infográfico e a versão fofinha dela.</p></section>
${rep.length ? `<div class="grid2">${rep.slice(0, 8).map(l => chartCard(ctx, { type: 'cols', title: `${l[0].label} em cada aba`, sub: 'O mesmo indicador, aba por aba', items: l.map(k => ({ k: k.tab, v: k.value })), unit: l[0].unit, mLabel: l[0].label, ordered: true })).join('')}</div>` : ''}
${groups.map(gname => `<section class="card"><h3>Indicadores${groups.length > 1 || tabs.length > 1 ? ` · ${esc(gname)}` : ''}</h3>${tileHtml(loose.filter(k => k.tab === gname).slice(0, 12).map(kpiTile).map(([l, v]) => [l, v, '']))}</section>`).join('')}
<section class="card"><h3>Tabelas encontradas</h3><div class="tlist">${b.sheets.map((s, i) => `<button class="tcard${i === b.sheet ? ' on' : ''}" data-act="pick" data-i="${i}"><b>${esc(s.name)}</b><span class="muted">${count(s.rows.length, 'linha', 'linhas')} · ${count(s.header.length, 'coluna', 'colunas')}: ${esc(cut(s.header.join(', '), 70))}</span><span class="tone">${esc(one(i))}</span></button>`).join('')}</div></section>`;
  }

  /* ---------- Resumo ---------- */
  function resumo(A, ctx) {
    const m = A.measure, hero = m ? (A.agg === 'sum' ? [`Total de ${m.name}`, A.f(m.st.sum)] : [`Média de ${m.name}`, A.f(m.st.mean)]) : ['Registros na planilha', fmtNum(A.n)];
    const main = byId(A, 'trend', 'top')[0];
    return `<section class="card hero"><span class="eyebrow">${esc(hero[0])}</span><div class="heronum">${esc(hero[1])}</div><p class="lead">${esc(Texts.one(A))}</p></section>
${tileHtml(tiles(A))}
${tabKpis(A).length ? `<section class="card"><h3>Indicadores da aba ${esc(A.sheet.tab)}</h3>${tileHtml(tabKpis(A).slice(0, 12).map(kpiTile).map(([l, v]) => [l, v, '']))}</section>` : ''}
<section class="card"><h3>Em 3 pontos</h3><ol class="points">${Texts.points(A).map(x => `<li><b>${esc(x.title)}.</b> ${esc(x.text)}</li>`).join('')}</ol></section>
${insChart(A, ctx, main)}
<section class="card"><div class="chead"><h3>Resumo completo</h3><button class="btn ghost sm" data-act="copy" data-text="${esc(Texts.full(A).join('\n\n'))}">${ic('copy')} Copiar</button></div>${Texts.full(A).map(p => `<p class="para">${esc(p)}</p>`).join('')}</section>
<section class="card"><div class="chead"><h3>Para mandar por mensagem</h3><button class="btn ghost sm" data-act="copy" data-text="${esc(Texts.message(A))}">${ic('copy')} Copiar</button></div><pre class="msg">${esc(Texts.message(A))}</pre></section>
<section class="card"><h3>Todos os achados</h3><ul class="findings">${A.ins.map(x => `<li${x.warn ? ' class="warn"' : ''}><span class="femo">${x.emoji}</span><div><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div><span class="fbig">${esc(x.big)}</span></li>`).join('')}</ul></section>`;
  }

  /* ---------- Gráficos ---------- */
  function graficos(A, ctx) {
    const opt = (list, sel) => list.map(([v, l]) => `<option value="${v}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const xs = [...A.cats, ...A.dates, ...A.nums].map(c => [c.i, c.name]), ys = [[-1, 'Contagem de registros'], ...A.nums.map(c => [c.i, c.name])];
    const custom = (A.board.cfg.charts || []).map((s, k) => [s, k]).filter(([s]) => (s.sh || 0) === A.board.sheet);
    // gráfico em que tudo é zero ou só há um grupo não diz nada
    const useful = c => c && (c.items ? c.items.length >= 2 && c.items.some(g => g.v !== 0) : c.values ? new Set(c.values).size > 1 : c.pts.length >= 3);
    const auto = Analyze.gallery(A).map(s => Analyze.resolve(A, s)).filter(useful);
    return `<section class="card builder"><h3>Montar um gráfico</h3><div class="brow">
<label>Tipo<select id="btype">${opt([['bar', 'Barras'], ['line', 'Linha no tempo'], ['donut', 'Rosca (participação)'], ['hist', 'Distribuição'], ['scatter', 'Dispersão (relação)']])}</select></label>
<label>Agrupar por / eixo<select id="bx">${opt(xs, A.dim ? A.dim.i : '')}</select></label>
<label>Valor<select id="by">${opt(ys, A.measure ? A.measure.i : -1)}</select></label>
<label>Conta<select id="bagg">${opt([['', 'Automática'], ['sum', 'Soma'], ['avg', 'Média']])}</select></label>
<button class="btn" data-act="cadd">${ic('plus')} Adicionar</button></div></section>
<div class="grid2">${custom.map(([s, k]) => chartCard(ctx, Analyze.resolve(A, s), { custom: k })).join('')}${auto.map(c => chartCard(ctx, c)).join('')}</div>
${auto.length + custom.length ? '' : '<p class="empty">Não encontrei colunas de números ou categorias para desenhar. Confira os tipos na aba Dados.</p>'}`;
  }

  /* ---------- Relatório ---------- */
  function relatorio(A, ctx) {
    const withChart = A.ins.filter(x => x.chart), rest = A.ins.filter(x => !x.chart && !x.warn && x.id !== 'size'), warn = A.ins.filter(x => x.warn);
    const colSum = c => c.type === 'num' ? `média ${fmtNum(c.st.mean, c.unit)} · de ${fmtNum(c.st.min, c.unit, true)} a ${fmtNum(c.st.max, c.unit, true)}`
      : c.type === 'date' ? (() => { const v = c.vals.filter(x => x != null); return v.length ? `de ${fmtDay(Math.min(...v.slice(0, 50000)))} a ${fmtDay(Math.max(...v.slice(0, 50000)))}` : ''; })()
      : c.type === 'cat' ? (() => { const g = Analyze.group(A, c, null).sort((a, b) => b.v - a.v)[0]; return g ? `mais comum: ${g.k} (${fmtPct(g.v / (c.n || 1))})` : ''; })() : `${fmtNum(c.distinct)} valores diferentes`;
    return `<article class="doc">
<header><span class="eyebrow">Relatório de dados</span><h1>${esc(A.title)}</h1><p class="muted">Fonte: ${esc(source(A))}${A.board.sheets.length > 1 ? ` · tabela “${esc(A.sheet.name)}”` : ''} · ${count(A.n, 'registro', 'registros')} · gerado em ${fmtDate(Date.now())}</p></header>
<h2>1. Sumário executivo</h2><p>${esc(Texts.one(A))}</p><ul>${Texts.points(A).map(x => `<li>${esc(x.text)}</li>`).join('')}</ul>
<h2>2. Indicadores</h2>${tileHtml([...tiles(A), ...tabKpis(A).slice(0, 12).map(kpiTile).map(([l, v]) => [l, v, 'indicador da aba'])])}
<h2>3. Análise</h2>${withChart.map(x => `<h3>${esc(x.title)}</h3><p>${esc(x.text)}</p>${insChart(A, ctx, x, { plain: true })}`).join('')}${rest.map(x => `<h3>${esc(x.title)}</h3><p>${esc(x.text)}</p>`).join('')}
<h2>4. Perfil das colunas</h2><div class="tscroll"><table class="mini"><thead><tr><th>Coluna</th><th>Tipo</th><th>Preenchimento</th><th>Resumo</th></tr></thead><tbody>${A.cols.map(c => `<tr><td>${esc(c.name)}</td><td>${TYPE[c.type]}</td><td class="num">${fmtPct(A.n ? c.n / A.n : 0)}</td><td>${esc(colSum(c))}</td></tr>`).join('')}</tbody></table></div>
<h2>5. Qualidade dos dados</h2>${warn.length ? `<ul>${warn.map(x => `<li>${esc(x.text)}</li>`).join('')}</ul>` : '<p>Nenhum problema relevante: sem linhas repetidas e sem colunas com muitas células vazias.</p>'}
<h2>6. Como este relatório foi feito</h2><p class="muted">Gerado automaticamente pelo Prisma a partir da planilha, sem alterar os dados originais. Células vazias são ignoradas nas contas; linhas de “Total” da planilha são descartadas para não contar em dobro. Valor analisado: ${esc(A.mLabel)}${A.dim ? `; agrupamento principal: ${esc(A.dim.name)}` : ''}. As escolhas podem ser trocadas na barra de foco do aplicativo.</p>
</article>`;
  }

  /* ---------- Infográfico ---------- */
  function info(A, ctx) {
    const m = A.measure, t = A.rank[0], tot = A.rank.reduce((a, g) => a + g.v, 0), share = (!m || A.agg === 'sum') && !A.mixed;
    const bigs = [[fmtNum(A.n), A.n === 1 ? 'registro' : 'registros']];
    if (m) bigs.push([A.f(A.agg === 'sum' ? m.st.sum : m.st.mean, true), A.mLabel.toLowerCase()]);
    if (t && share && tot) bigs.push([fmtPct(t.v / tot), `vem de ${t.k}`]); else if (m) bigs.push([A.f(m.st.max, true), 'maior valor']);
    const facts = byId(A, 'conc', 'skew', 'peak', 'dim2', 'corr', 'out', 'last').slice(0, 4);
    const donut = A.dim && share && A.rank.length <= 8 ? Analyze.resolve(A, { type: 'donut', x: A.dim.i }) : null, tl = A.series.length >= 3 ? Analyze.resolve(A, { type: 'line' }) : null;
    return `<article class="poster">
<header class="phead"><span class="eyebrow">Infográfico</span><h1>${esc(A.title)}</h1><p>${esc(Texts.one(A))}</p></header>
<div class="pbigs">${bigs.map(([v, l]) => `<div class="pbig"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
${A.rank.length >= 2 ? `<section class="pblock"><h2><span class="pnum">1</span>Quem puxa o resultado</h2><p class="muted">${esc(A.mLabel)} por ${esc(A.dim.name)}</p>${hbars(A.rank, fval(A), 6)}</section>` : ''}
${donut ? `<section class="pblock"><h2><span class="pnum">2</span>A fatia de cada um</h2>${chartCard(ctx, donut, { plain: true, title: ' ' })}</section>` : ''}
${tl ? `<section class="pblock"><h2><span class="pnum">${donut ? 3 : 2}</span>A história no tempo</h2>${A.trend ? `<p class="muted">${esc(A.trend.dir === 'estável' ? 'Ritmo estável' : 'Tendência de ' + A.trend.dir)} · pico em ${esc(A.trend.peak.long)}</p>` : ''}${chartCard(ctx, tl, { plain: true, title: ' ' })}</section>` : ''}
${facts.length ? `<section class="pblock"><h2><span class="pnum">★</span>Vale saber</h2><div class="pfacts">${facts.map(x => `<div class="pfact"><span>${x.emoji}</span><b>${esc(x.big)}</b><p>${esc(x.title)}</p></div>`).join('')}</div></section>` : ''}
<footer class="pfoot">Fonte: ${esc(source(A))} · ${count(A.n, 'registro', 'registros')} · feito com o Prisma em ${fmtDate(Date.now())}</footer>
</article>`;
  }

  /* ---------- Fofinho: a Pri explica sem jargão ---------- */
  function fofo(A, ctx) {
    const m = A.measure, x = id => A.ins.find(i => i.id === id), top = x('top'), tr = x('trend'), f = fval(A);
    const sizeTalk = A.n <= 30 ? 'Cabe numa folha de caderno!' : A.n <= 300 ? 'Dá um caderninho inteiro.' : A.n <= 5000 ? 'É bastante coisa: um fichário cheio!' : 'Uau, isso é uma biblioteca de fichinhas!';
    const dots = top && top.frac != null ? Math.max(1, Math.round(top.frac * 10)) : 0;
    const bubble = (mood, html) => `<div class="say">${priSvg(mood, 84)}<div class="bubble">${html}</div></div>`;
    const curios = byId(A, 'conc', 'last', 'peak', 'dim2', 'skew', 'corr', 'out');
    const care = A.ins.filter(i => i.warn);
    const tl = A.series.length >= 3 ? Analyze.resolve(A, { type: 'line' }) : null;
    return `<article class="fofo" data-theme="light">
${bubble('happy', `<b>Oi! Eu sou a Pri.</b> 🌈 Li a planilha <b>${esc(A.title)}</b> inteirinha e vou te contar o que achei, sem palavras difíceis.`)}
<section class="fcard f1"><span class="fico">🗂️</span><h2>O tamanho da coisa</h2><div class="fbignum">${fmtNum(A.n)}</div><p>${esc(x('size').lay)} ${sizeTalk}</p></section>
${m ? `<section class="fcard f2"><span class="fico">${emo(m.name)}</span><h2>O número mais importante</h2><div class="fbignum">${esc(A.f(A.agg === 'sum' ? m.st.sum : m.st.mean, true))}</div><p>${esc((x('total') || x('mean')).lay)}</p></section>` : ''}
${top ? `<section class="fcard f3"><span class="fico">🏆</span><h2>${A.neg || A.mixed ? 'Quem pesa mais?' : 'Quem é o campeão?'}</h2><p class="fwho"><b>${esc(A.rank[0].k)}</b></p>${hbars(A.rank, f, 3, true)}
${dots ? `<div class="tenrow" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i class="${i < dots ? 'on' : ''}"></i>`).join('')}</div>` : ''}<p>${esc(top.lay)}</p></section>` : ''}
${tr ? `<section class="fcard f4"><span class="fico">${tr.emoji}</span><h2>Subiu ou desceu?</h2><p class="fwho"><b>${A.trend.dir === 'alta' ? 'Subiu!' : A.trend.dir === 'queda' ? 'Desceu.' : 'Ficou parecido.'}</b></p>${chartCard(ctx, tl, { plain: true, title: ' ' })}<p>${esc(tr.lay)}</p></section>` : ''}
${curios.length ? `<section class="fcard f5"><span class="fico">💡</span><h2>Curiosidades</h2><ul class="flist">${curios.map(i => `<li><span>${i.emoji}</span>${esc(i.lay)}</li>`).join('')}</ul></section>` : ''}
${care.length ? bubble('hmm', `<b>Só um cuidadinho:</b> ${care.map(i => esc(i.lay)).join(' ')}`) : bubble('wow', '<b>Planilha caprichada!</b> Não achei linhas repetidas nem muitos espaços em branco. ✨')}
<section class="fcard f6"><span class="fico">📖</span><h2>Dicionário da Pri</h2><dl class="fdic"><dt>Total</dt><dd>É tudo somado, como juntar todas as moedas num cofrinho só.</dd><dt>Média</dt><dd>É o total dividido por igual, como repartir um bolo em fatias do mesmo tamanho.</dd><dt>Tendência</dt><dd>É o caminho que os números estão seguindo: ladeira acima, ladeira abaixo ou rua plana.</dd></dl></section>
<p class="fend">Feito com carinho pelo Prisma 💜</p>
</article>`;
  }

  /* ---------- Cartões: um achado por imagem, para compartilhar ---------- */
  const PAL = [['#eef0ff', '#d9dcff', '#2b2565', '#6d5bd6'], ['#fff1f6', '#ffd9e8', '#5a2340', '#d55181'], ['#e9fbf3', '#c9f2e0', '#0f4a37', '#199e70'], ['#fff8e1', '#ffe9ac', '#5a4300', '#c98500'], ['#e8f3ff', '#cde2fb', '#0d366b', '#2a78d6']];
  const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
  let meter = null;
  function wrap(text, size, weight, maxW, maxLines) {
    meter = meter || document.createElement('canvas').getContext('2d');
    meter.font = `${weight} ${size}px ${FONT}`;
    const lines = [];
    let cur = '';
    for (const w of String(text).split(/\s+/)) {
      const t = cur ? cur + ' ' + w : w;
      if (meter.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/[\s.,;:]*\S*$/, '') + '…'; }
    return lines;
  }
  function cardSvg(A, x, k) {
    const [bg1, bg2, ink, acc] = PAL[k % PAL.length], cover = !x, W = 1080, H = 1350;
    const tx = (lines, y, size, weight, lh, fill = ink) => lines.map((l, i) => `<text x="90" y="${y + i * lh}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(l)}</text>`).join('');
    let body;
    if (cover) {
      const t = wrap(A.title, 92, 700, 900, 4);
      body = `<text x="90" y="190" font-size="38" font-weight="600" fill="${acc}" letter-spacing="4">O QUE A PLANILHA CONTA</text>${tx(t, 330, 92, 700, 108)}${tx(wrap(`${count(A.n, 'linha', 'linhas')} e ${A.cols.length} colunas resumidas em ${A.ins.length} cartões.`, 46, 400, 880, 3), 360 + t.length * 108, 46, 400, 62)}<g transform="translate(560 800) scale(4)">${pri('happy')}</g>`;
    } else {
      const big = String(x.big), bs = Math.min(190, Math.floor(900 / Math.max(1, big.length * 0.6))), title = wrap(x.title, 66, 700, 900, 3), lay = wrap(x.lay, 42, 400, 620, 7), y0 = 420 + bs;
      body = `<rect x="90" y="96" rx="36" width="${x.tag.length * 24 + 150}" height="72" fill="${acc}"/><text x="124" y="146" font-size="40">${x.emoji}</text><text x="186" y="145" font-size="36" font-weight="600" fill="#fff">${esc(x.tag)}</text>
<text x="90" y="${330 + bs * 0.6}" font-size="${bs}" font-weight="700" fill="${acc}">${esc(big)}</text>${tx(title, y0, 66, 700, 80)}${tx(lay, y0 + title.length * 80 + 30, 42, 400, 58)}<g transform="translate(730 960) scale(2.6)">${pri(x.warn ? 'hmm' : k % 2 ? 'wow' : 'happy')}</g>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><linearGradient id="cbg${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#cbg${k})"/><circle cx="1000" cy="120" r="210" fill="#fff" opacity=".45"/><circle cx="60" cy="1290" r="150" fill="#fff" opacity=".4"/>${body}
<text x="90" y="1280" font-size="30" fill="${ink}" opacity=".7">${esc(cut(A.title, 44))} · Prisma</text></svg>`;
  }
  function cartoes(A, ctx) {
    ctx.cards = [cardSvg(A, null, 0), ...A.ins.filter(x => x.id !== 'size').map((x, k) => cardSvg(A, x, k + 1))];
    return `<p class="hint">Cada cartão é uma imagem pronta para o grupo da família, a apresentação ou as redes. Toque para salvar ou compartilhar.</p>
<div class="cards">${ctx.cards.map((s, k) => `<figure class="pcard"><div class="pcimg">${s.replace(/ width="1080" height="1350"/, '')}</div><button class="btn ghost sm" data-act="cardpng" data-k="${k}">${ic('share')} Salvar imagem</button></figure>`).join('')}</div>`;
  }

  /* ---------- Dados ---------- */
  function dados(A, ctx) {
    const st = ctx.ds, q = norm(st.q), rows = A.sheet.rows;
    let idx = rows.map((_, i) => i);
    if (q) idx = idx.filter(i => rows[i].some(v => v != null && norm(v).includes(q)));
    if (st.sort != null) {
      const c = A.cols.find(c => c.i === st.sort), num = c.type === 'num' || c.type === 'date';
      idx.sort((a, b) => { const x = c.vals[a], y = c.vals[b]; return x == null ? 1 : y == null ? -1 : (num ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true })) * st.dir; });
    }
    const cell = (c, r) => { const v = c.vals[r]; return v == null ? '' : c.type === 'num' ? fmtNum(v, c.unit) : c.type === 'date' ? fmtDay(v) : esc(v); };
    const forced = ((A.board.cfg.s || {})[A.board.sheet] || {}).types || {};
    return `<div class="dbar"><label class="searchbox">${ic('search')}<input id="dq" type="search" placeholder="Procurar nos dados" value="${esc(st.q)}"></label><span class="muted">${count(idx.length, 'linha', 'linhas')}${q ? ` de ${fmtNum(A.n)}` : ''}</span></div>
<div class="card tscroll big"><table class="data"><thead><tr><th class="rn">#</th>${A.cols.map(c => `<th><button class="thb" data-act="dsort" data-i="${c.i}">${esc(c.name)}${st.sort === c.i ? (st.dir > 0 ? ' ▲' : ' ▼') : ''}</button><select class="tsel" data-i="${c.i}" title="Tipo da coluna"${c.calc ? ' disabled' : ''}><option value="">${TYPE[c.type]}${forced[c.i] ? '' : ' (auto)'}</option>${['num', 'cat', 'text', 'date'].filter(t => t !== c.type).map(t => `<option value="${t}">${TYPE[t]}</option>`).join('')}${forced[c.i] ? '<option value="auto">Voltar ao automático</option>' : ''}</select></th>`).join('')}</tr></thead>
<tbody>${idx.slice(0, st.limit).map(r => `<tr><td class="rn">${r + 1}</td>${A.cols.map(c => `<td${c.type === 'num' ? ' class="num"' : ''}>${cell(c, r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
${idx.length > st.limit ? `<p class="center"><button class="btn ghost" data-act="dmore">Mostrar mais ${fmtNum(Math.min(500, idx.length - st.limit))} linhas</button></p>` : ''}`;
  }

  const RENDER = { geral, resumo, graficos, relatorio, info, fofo, cartoes, dados };
  return { TABS, render: (tab, A, ctx) => (RENDER[tab] || resumo)(A, ctx), priSvg, Texts };
})();
