'use strict';
/* Prisma — interface: lista de planilhas, importação, visões, exportação e sincronização */

(() => {
  let A = null, ctx = null, cache = { key: '', A: null };
  let ds = { q: '', sort: null, dir: 1, limit: 200 };
  const cur = () => S.boards.find(b => b.id === S.set.cur);
  const touch = () => matchMedia('(pointer: coarse)').matches;
  const fname = s => String(s || 'prisma').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'prisma';

  /* ---------- Avisos e janelas ---------- */
  let toastT;
  window.toast = (msg, action) => {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="tact">${esc(action.label)}</button>` : ''}`;
    if (action) $('.tact', t).onclick = () => { action.fn(); t.classList.remove('on'); };
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), action ? 8000 : 3800);
  };
  function modal({ title, body, wide }) {
    const el = document.createElement('div');
    el.className = 'modalwrap';
    el.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><div class="mhead"><h2>${esc(title)}</h2><button class="icon" data-close title="Fechar">${ic('x')}</button></div><div class="mbody">${body}</div></div>`;
    const close = () => { el.remove(); removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-close]')) close(); });
    addEventListener('keydown', key);
    document.body.append(el);
    return { el, close };
  }
  const confirmBox = (title, text, ok, danger) => new Promise(res => {
    const m = modal({ title, body: `<p>${esc(text)}</p><div class="mfoot"><button class="btn ghost" data-close>Cancelar</button><button class="btn${danger ? ' danger' : ''}" id="cok">${esc(ok)}</button></div>` });
    let done = false;
    $('#cok', m.el).onclick = () => { done = true; m.close(); res(true); };
    m.el.addEventListener('click', () => setTimeout(() => { if (!done && !m.el.isConnected) res(false); }));
  });

  function applyTheme() {
    const t = S.set.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : S.set.theme;
    document.documentElement.dataset.theme = t;
    $('meta[name=theme-color]').content = t === 'dark' ? '#131426' : '#5b47d6';
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); renderView(); });

  /* ---------- Instalação como aplicativo (versão web) ---------- */
  const Inst = { prompt: null };
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const canInstall = () => !Sync.avail && !standalone() && /^https:$/.test(location.protocol) && (Inst.prompt || isIOS());
  async function install() {
    if (Inst.prompt) {
      Inst.prompt.prompt();
      const r = await Inst.prompt.userChoice;
      Inst.prompt = null; renderSide();
      if (r.outcome === 'accepted') toast('Prisma instalado: procure o ícone na tela inicial');
      return;
    }
    modal({ title: 'Instalar no iPhone ou iPad', body: `<p>No Safari, toque em <b>Compartilhar</b> (o quadrado com a seta para cima) e depois em <b>Adicionar à Tela de Início</b>.</p><p class="muted">O Prisma passa a abrir como um aplicativo, em tela cheia e também sem internet.</p><div class="mfoot"><button class="btn" data-close>Entendi</button></div>` });
  }
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); Inst.prompt = e; renderSide(); });
  addEventListener('appinstalled', () => { Inst.prompt = null; renderSide(); });

  const Sync = { avail: false, on: false, folder: null, detected: null, drives: [], busy: false, again: false, last: 0, error: '' };

  /* ---------- Barra lateral ---------- */
  function renderSide() {
    const list = [...S.boards].sort((a, b) => b.updated - a.updated);
    $('#sidebar').innerHTML = `<div class="brand">${LOGO}<b>Prisma</b><span class="grow"></span><button class="icon onlysm" data-act="side" title="Fechar">${ic('x')}</button></div>
<button class="btn block" data-act="new">${ic('plus')} Nova planilha</button>
<div class="list">${list.map(b => `<button class="item${b.id === S.set.cur ? ' on' : ''}" data-act="open" data-id="${b.id}"><span class="ititle">${esc(b.title)}</span><span class="imeta">${count((b.sheets[b.sheet] || { rows: [] }).rows.length, 'linha', 'linhas')} · ${fmtRel(b.updated)}</span></button>`).join('') || '<p class="muted pad">Nenhuma planilha ainda.</p>'}</div>
<div class="sidefoot">${canInstall() ? `<button class="link" data-act="install">${ic('dl')}<span>Instalar o aplicativo</span></button>` : ''}
<button class="link" data-act="settings" title="Ajustes e sincronização">${ic(Sync.on ? 'sync' : 'gear')}<span>${Sync.on ? (Sync.error ? 'Falha na sincronização' : Sync.last ? 'Sincronizado ' + fmtRel(Sync.last) : 'Sincronizando…') : 'Ajustes'}</span></button></div>`;
  }
  const sideSoon = debounce(renderSide, 300);

  /* ---------- Topo: título, foco da análise e abas ---------- */
  function analysis() {
    const b = cur();
    if (!b) return null;
    const key = `${b.id}:${b.mod}:${b.sheet}`;
    if (cache.key !== key) cache = { key, A: Analyze.build(b) };
    return cache.A;
  }
  function renderTop() {
    const b = cur(), top = $('#topbar'), tabs = $('#tabs');
    if (!b) { top.innerHTML = `<button class="icon onlysm" data-act="side">${ic('menu')}</button><b class="grow">Prisma</b>`; tabs.innerHTML = ''; return; }
    const sc = (b.cfg.s || {})[b.sheet] || {}, opt = (list, sel) => list.map(([v, l]) => `<option value="${v}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const pdf = ['resumo', 'relatorio', 'info', 'fofo'].includes(S.set.tab);
    top.innerHTML = `<div class="trow"><button class="icon onlysm" data-act="side" title="Planilhas">${ic('menu')}</button><input id="title" value="${esc(b.title)}" aria-label="Título" spellcheck="false">
${b.source.kind === 'gsheet' ? `<button class="btn ghost sm" data-act="refresh" title="Buscar de novo no Google Planilhas">${ic('sync')}<span class="hidesm">Atualizar</span></button>` : ''}
${pdf ? `<button class="btn sm" data-act="pdf">${ic('pdf')}<span class="hidesm">PDF</span></button>` : S.set.tab === 'dados' ? `<button class="btn sm" data-act="csv">${ic('dl')}<span class="hidesm">CSV</span></button>` : ''}
<button class="icon" data-act="remove" title="Excluir esta planilha">${ic('trash')}</button></div>
${A ? `<div class="focus">${b.sheets.length > 1 ? `<label>Aba<select data-f="sheet">${opt(b.sheets.map((s, i) => [i, s.name]), b.sheet)}</select></label>` : ''}
<label>Valor<select data-f="measure">${opt([[-1, 'Contar registros'], ...A.nums.map(c => [c.i, c.name])], A.measure ? A.measure.i : -1)}</select></label>
${A.measure ? `<label>Conta<select data-f="agg">${opt([['sum', 'Soma'], ['avg', 'Média']], A.agg)}</select></label>` : ''}
${A.cats.length ? `<label>Agrupar por<select data-f="dim">${opt(A.cats.map(c => [c.i, c.name]), A.dim ? A.dim.i : '')}</select></label>` : ''}
${A.dates.length > 1 ? `<label>Data<select data-f="date">${opt(A.dates.map(c => [c.i, c.name]), A.date ? A.date.i : '')}</select></label>` : ''}</div>` : ''}`;
    tabs.innerHTML = Views.TABS.map(([id, label, icon]) => `<button class="tab${S.set.tab === id ? ' on' : ''}" data-act="tab" data-id="${id}">${id === 'fofo' ? Views.priSvg('happy', 18) : ic(icon)}${label}</button>`).join('');
    const on = $('.tab.on', tabs);
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /* ---------- Visão atual ---------- */
  const newCtx = () => ({ charts: [], cards: [], ds, add(c) { this.charts.push(c); return this.charts.length - 1; } });
  const mountCharts = (root, c) => $$('.chartcard', root).forEach(el => { const ch = c.charts[el.dataset.ci]; if (ch) Charts.mount($('.chart', el), ch); });
  function renderView() {
    const v = $('#view'), b = cur();
    A = analysis();
    if (!b) {
      v.innerHTML = `<div class="welcome">${Views.priSvg('happy', 132)}<h1>Transforme qualquer planilha em algo que todo mundo entende</h1><p>Abra um arquivo do Excel, um CSV ou um link do Google Planilhas. O Prisma lê os dados e monta resumo, gráficos, relatório, infográfico, cartões e uma versão bem fofinha para quem não é de números.</p><button class="btn big" data-act="new">${ic('plus')} Abrir uma planilha</button><p class="muted">Você também pode arrastar o arquivo para esta janela. Nada sai do seu aparelho.</p></div>`;
      return;
    }
    if (!A || !A.n) { v.innerHTML = '<p class="empty">Esta aba da planilha não tem dados.</p>'; return; }
    ctx = newCtx();
    v.innerHTML = `<div class="view v-${S.set.tab}">${Views.render(S.set.tab, A, ctx)}</div>`;
    mountCharts(v, ctx);
  }
  function renderAll() { A = analysis(); renderSide(); renderTop(); renderView(); }
  function openBoard(id) {
    S.set.cur = id; ds = { q: '', sort: null, dir: 1, limit: 200 };
    Store.saveSet();
    document.body.classList.remove('side-open');
    renderAll();
    $('#view').scrollTop = 0;
  }
  const saveBoard = b => { b.updated = Date.now(); return DB.put('boards', b); };
  const sheetCfg = b => { b.cfg.s = b.cfg.s || {}; return b.cfg.s[b.sheet] = b.cfg.s[b.sheet] || {}; };

  /* ---------- Importação ---------- */
  function ingest(raw, title, source, into) {
    const sheets = raw.map(s => Analyze.shape(s.rows, s.name, s.hints)).filter(Boolean);
    if (!sheets.length) throw new Error('não encontrei uma tabela com dados');
    if (into) {
      into.sheets = sheets; into.sheet = Math.min(into.sheet, sheets.length - 1);
      saveBoard(into); renderAll();
      return into;
    }
    const best = sheets.reduce((a, s, i) => s.rows.length > sheets[a].rows.length * 3 ? i : a, 0);
    const b = Store.create(title, source, sheets);
    if (best) { b.sheet = best; DB.put('boards', b); }
    if (S.set.tab === 'dados') S.set.tab = 'resumo';
    openBoard(b.id);
    toast(`Pronto: ${count(sheets[best].rows.length, 'linha lida', 'linhas lidas')}${sheets.length > 1 ? ` em ${sheets.length} abas` : ''}`);
    return b;
  }
  async function importFile(f) {
    try {
      toast(`Lendo “${f.name}”…`);
      ingest(await Reader.file(f), f.name.replace(/\.[^.]+$/, ''), { kind: 'file', name: f.name, url: '' });
      return true;
    } catch (e) { console.error(e); toast(`Não deu para abrir “${f.name}”: ${e.message}`); return false; }
  }
  const viaDesktop = () => Sync.avail ? url => api('fetch', { method: 'POST', body: url }) : null;
  async function importGoogle(link, into) {
    const g = Reader.googleUrl(link);
    try {
      toast('Buscando no Google Planilhas…');
      const raw = await Reader.google(link, viaDesktop());
      ingest(raw, 'Planilha do Google', { kind: 'gsheet', name: 'Google Planilhas', url: `https://docs.google.com/spreadsheets/d/${g.id}` }, into);
      if (into) toast('Planilha atualizada');
      return true;
    } catch (e) { console.error(e); toast(e.message.charAt(0).toUpperCase() + e.message.slice(1)); return false; }
  }
  function importModal() {
    const m = modal({ title: 'Nova planilha', wide: true, body: `
<div class="dropzone" id="dz">${ic('sheet')}<p><b>Arraste o arquivo para cá</b> ou</p><button class="btn" id="pick">Escolher arquivo</button><p class="muted">Excel (.xlsx), CSV ou TSV. O arquivo é lido aqui mesmo, no seu aparelho.</p></div>
<label>Link do Google Planilhas</label><div class="row"><input id="glink" type="url" placeholder="https://docs.google.com/spreadsheets/d/…"><button class="btn" id="gok">${ic('link')} Abrir</button></div>
<p class="muted">A planilha precisa estar compartilhada como “Qualquer pessoa com o link”. Se for particular, use Arquivo › Fazer download › Microsoft Excel e abra o arquivo, ou copie e cole as células abaixo.</p>
<label>Colar células copiadas</label><textarea id="paste" rows="3" placeholder="Selecione as células no Excel ou no Google Planilhas, copie (Ctrl+C) e cole aqui (Ctrl+V)"></textarea>
<div class="mfoot"><button class="btn ghost" id="pok">Usar os dados colados</button></div>` });
    const dz = $('#dz', m.el), done = ok => { if (ok) m.close(); };
    $('#pick', m.el).onclick = async () => { const fs = await pickFiles('.xlsx,.xlsm,.csv,.tsv,.txt,.xls'); for (const f of fs) done(await importFile(f)); };
    $('#gok', m.el).onclick = async () => { const v = $('#glink', m.el).value.trim(); if (!v) return $('#glink', m.el).focus(); done(await importGoogle(v)); };
    $('#glink', m.el).onkeydown = e => { if (e.key === 'Enter') $('#gok', m.el).click(); };
    $('#pok', m.el).onclick = () => {
      const t = $('#paste', m.el).value;
      if (!t.trim()) return $('#paste', m.el).focus();
      try { ingest(Reader.text(t), 'Dados colados', { kind: 'paste', name: '', url: '' }); m.close(); } catch (e) { toast('Não entendi os dados colados: ' + e.message); }
    };
    ['dragover', 'dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => dz.classList.toggle('over', ev === 'dragover')));
  }
  function pickFiles(accept) {
    return new Promise(res => {
      const inp = $('#filepick');
      inp.accept = accept; inp.value = '';
      inp.onchange = () => res([...inp.files]);
      inp.click();
    });
  }
  addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  addEventListener('drop', async e => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    let ok = false;
    for (const f of e.dataTransfer.files) ok = await (/\.json$/i.test(f.name) ? importBackup([f]) : importFile(f)) || ok;
    if (ok) $$('.modalwrap').forEach(m => m.remove());
  });

  /* ---------- Exportação ---------- */
  const api = (path, opt = {}) => fetch('api/' + path, Object.assign({ cache: 'no-store' }, opt, { headers: { 'X-Prisma': '1' } }));
  async function saveBlob(blob, name) {
    const file = new File([blob], name, { type: blob.type });
    if (touch() && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast('Salvo em Downloads: ' + name);
  }
  /* Monta um documento independente com a visão atual, em tema claro e largura de página. */
  function printable() {
    const host = document.createElement('div'), c = newCtx();
    host.dataset.theme = 'light';
    host.style.cssText = 'position:fixed;left:-9999px;top:0;width:700px';
    host.innerHTML = `<div class="view v-${S.set.tab}">${Views.render(S.set.tab, A, c)}</div>`;
    document.body.append(host);
    mountCharts(host, c);
    const css = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } }).map(r => r.cssText).join('\n');
    const html = `<!doctype html><html lang="pt-BR" data-theme="light"><head><meta charset="utf-8"><title>${esc(A.title)}</title><style>${css}
@page{size:A4;margin:12mm}html,body{height:auto!important;overflow:visible!important;background:#fff!important}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.view{max-width:none;padding:0;overflow:visible}.tools,.btn,.icon{display:none!important}.card,.fcard,.pblock,.say,figure,.tile,li,tr{break-inside:avoid}h2,h3{break-after:avoid}</style></head><body>${host.innerHTML}</body></html>`;
    host.remove();
    return html;
  }
  async function exportPdf() {
    const html = printable(), name = `${fname(A.title)} - ${Views.TABS.find(t => t[0] === S.set.tab)[1]}`;
    if (!Sync.avail) return printDoc(html);
    toast('Escolha onde salvar o PDF na janela que abriu');
    try {
      const r = await api('pdf', { method: 'POST', body: name + '\n' + html });
      if (r.status === 204) return toast('Exportação cancelada');
      if (!r.ok) throw new Error();
      toast('PDF salvo em ' + (await r.json()).saved, { label: 'Abrir', fn: () => api('open', { method: 'POST' }) });
    } catch (e) { toast('Não foi possível gerar o arquivo; usando a impressão'); printDoc(html); }
  }
  function printDoc(html) {
    if (touch()) {
      const w = open(URL.createObjectURL(new Blob([html.replace('</body>', '<script>addEventListener("load",()=>setTimeout(print,400))<\/script></body>')], { type: 'text/html' })), '_blank');
      if (w) return;
    }
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    f.onload = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 120000); };
    f.srcdoc = html;
    document.body.append(f);
    toast('Na janela de impressão, escolha “Salvar como PDF”');
  }
  function exportCsv() {
    const q = v => { const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const text = [A.sheet.header, ...A.sheet.rows].map(r => r.map(q).join(';')).join('\r\n');
    saveBlob(new Blob(['﻿' + text], { type: 'text/csv' }), fname(A.title) + '.csv');
  }
  const backupData = list => JSON.stringify({ app: 'prisma', version: 1, exported: Date.now(), boards: list });
  async function importBackup(files) {
    let total = 0, last;
    for (const f of files) {
      try {
        const j = JSON.parse(await f.text());
        if (j.app !== 'prisma' || !Array.isArray(j.boards)) throw new Error('não é um backup do Prisma');
        for (const o of j.boards) {
          if (!o || !o.id) continue;
          normalize(o);
          const i = S.boards.findIndex(x => x.id === o.id);
          if (i >= 0) S.boards[i] = o; else S.boards.push(o);
          DB.put('boards', o); total++; last = o.id;
        }
      } catch (e) { toast(`Falha ao importar “${f.name}”: ${e.message}`); }
    }
    if (total) { toast(count(total, 'planilha importada', 'planilhas importadas')); openBoard(last); }
    return total > 0;
  }

  /* ---------- Sincronização com pasta do Google Drive (só no app de Windows) ---------- */
  async function syncInfo(r) {
    try {
      r = r || await api('sync/info');
      if (!r.ok) throw new Error('sem API');
      const j = await r.json();
      Object.assign(Sync, { avail: true, on: j.enabled, folder: j.folder, detected: j.detected, drives: j.drives || [] });
    } catch (e) { Sync.avail = Sync.on = false; }
  }
  const syncSig = d => (d.boards || []).map(o => o.id + ':' + (o.mod || 0)).sort().join(',') + '|' + Object.keys(d.tombstones || {}).sort().join(',');
  function mergeRemote(remote) {
    const tomb = DB.tomb();
    let n = 0;
    for (const [k, ts] of Object.entries(remote.tombstones || {})) {
      const id = k.split(':')[1], i = S.boards.findIndex(o => o.id === id);
      if (i >= 0 && (S.boards[i].mod || 0) <= ts) { S.boards.splice(i, 1); DB.del('boards', id, true); n++; }
      if (!(tomb[k] >= ts)) tomb[k] = ts;
    }
    for (const o of remote.boards || []) {
      if (!o || !o.id || (tomb['boards:' + o.id] || 0) >= (o.mod || 0)) continue;
      const i = S.boards.findIndex(x => x.id === o.id);
      if (i >= 0 && (o.mod || 0) <= (S.boards[i].mod || 0)) continue;
      normalize(o);
      if (i < 0) S.boards.push(o); else S.boards[i] = o;
      DB.put('boards', o, true); n++;
    }
    DB.saveTomb();
    return n;
  }
  /* Primeira sincronização num aparelho novo: troca a planilha de exemplo pelo que já está no Drive. */
  function dropSeed() {
    S.boards.filter(o => o.seed).forEach(o => { S.boards = S.boards.filter(x => x !== o); DB.del('boards', o.id, true); });
  }
  async function syncNow(manual) {
    if (!Sync.on) return;
    if (Sync.busy) { Sync.again = true; return; }
    Sync.busy = true;
    try {
      const r = await api('sync');
      if (!r.ok) throw new Error('não foi possível ler a pasta');
      const text = r.status === 200 ? await r.text() : '', remote = text.trim() ? JSON.parse(text) : null;
      let pulled = 0;
      if (remote && remote.app === 'prisma') {
        if (!S.set.syncedOnce && (remote.boards || []).length) dropSeed();
        pulled = mergeRemote(remote);
      }
      const local = { app: 'prisma', version: 1, exported: Date.now(), boards: S.boards, tombstones: DB.tomb() };
      if (!remote || syncSig(remote) !== syncSig(local)) {
        const w = await api('sync', { method: 'POST', body: JSON.stringify(local) });
        if (!w.ok) throw new Error('não foi possível gravar na pasta');
      }
      if (!S.set.syncedOnce) { S.set.syncedOnce = true; Store.saveSet(); }
      Sync.last = Date.now(); Sync.error = '';
      if (pulled) {
        if (!cur()) S.set.cur = ([...S.boards].sort((a, b) => b.updated - a.updated)[0] || {}).id || null;
        // não redesenha por cima de quem está digitando
        if (document.activeElement && document.activeElement.closest('#view input, #title, .modal')) renderSide(); else renderAll();
      } else sideSoon();
      if (manual) toast(pulled ? `Sincronizado: ${count(pulled, 'planilha atualizada', 'planilhas atualizadas')}` : 'Sincronizado com o Google Drive');
    } catch (e) {
      console.error(e); Sync.error = e.message; sideSoon();
      if (manual) toast('Falha ao sincronizar: ' + e.message);
    }
    Sync.busy = false;
    if (Sync.again) { Sync.again = false; syncSoon(); }
  }
  const syncSoon = debounce(() => syncNow(), 4000);
  async function syncConfig(route, body) {
    await syncInfo(await api(route, { method: 'POST', body }));
    if (Sync.on) await syncNow(true); else renderSide();
  }

  function settingsModal() {
    const m = modal({ title: 'Ajustes', body: `
<label>Tema</label><select id="settheme"><option value="auto">Automático (segue o sistema)</option><option value="light">Claro</option><option value="dark">Escuro</option></select>
${Sync.avail ? `<label>Sincronização com o Google Drive</label>
<p style="margin:0 0 6px">${Sync.on ? `Ativa em <b>${esc(Sync.folder)}</b>${Sync.error ? ` · <span class="err">${esc(Sync.error)}</span>` : Sync.last ? ` · última vez ${fmtRel(Sync.last)}` : ''}` : Sync.detected ? 'Desativada. Google Drive encontrado neste computador.' : 'Desativada. Não encontrei o Google Drive; escolha uma pasta sincronizada.'}</p>
<div class="row wrap">${Sync.on ? `<button class="btn ghost sm" data-k="syncnow">${ic('sync')} Sincronizar agora</button><button class="btn ghost sm" data-k="syncoff">Desativar</button>` : Sync.detected ? `<button class="btn sm" data-k="syncauto">Ativar no Google Drive</button>` : ''}<button class="btn ghost sm" data-k="syncpick">Escolher outra pasta…</button></div>
${Sync.drives.length > 1 ? `<p class="muted">Há mais de uma conta do Google Drive neste computador: cada unidade (G:, H:…) é uma conta.</p><div class="row wrap">${Sync.drives.map(d => `<button class="btn ghost sm" data-k="syncuse" data-path="${esc(d)}">${esc(d)}</button>`).join('')}</div>` : ''}
<p class="muted">O Prisma grava o arquivo prisma-sync.json na pasta e o Google Drive leva para os outros computadores.</p>`
      : `<label>Sincronização</label><p class="muted">A sincronização automática pelo Google Drive funciona no aplicativo de Windows (Prisma.exe). Aqui, as planilhas ficam guardadas neste aparelho: use o backup para levar a outro lugar.</p>`}
<label>Backup</label><div class="row wrap"><button class="btn ghost sm" data-k="export">${ic('dl')} Exportar backup</button><button class="btn ghost sm" data-k="import">${ic('up')} Importar…</button></div>
<label>Zona de perigo</label><button class="btn ghost sm danger" data-k="wipe">${ic('trash')} Apagar tudo deste aparelho</button>
<p class="muted center">Prisma 1.0 · seus dados não saem do aparelho</p>` });
    $('#settheme', m.el).value = S.set.theme;
    $('#settheme', m.el).onchange = e => { S.set.theme = e.target.value; Store.saveSet(); applyTheme(); renderView(); };
    const again = () => { m.close(); settingsModal(); };
    m.el.addEventListener('click', async e => {
      const b = e.target.closest('[data-k]'), k = b && b.dataset.k;
      if (!k) return;
      if (k === 'syncnow') { await syncNow(true); again(); }
      if (k === 'syncoff') { await syncConfig('sync/config', 'off'); again(); }
      if (k === 'syncauto') { await syncConfig('sync/config', 'auto'); again(); }
      if (k === 'syncuse') { await syncConfig('sync/config', b.dataset.path); again(); }
      if (k === 'syncpick') { toast('Escolha a pasta na janela que abriu'); await syncConfig('sync/choose', ''); again(); }
      if (k === 'export') saveBlob(new Blob([backupData(S.boards)], { type: 'application/json' }), `prisma-backup-${dayKey(Date.now())}.json`);
      if (k === 'import') { m.close(); importBackup(await pickFiles('.json')); }
      if (k === 'wipe' && await confirmBox('Apagar tudo', 'Todas as planilhas deste aparelho serão apagadas. Isso não pode ser desfeito.' + (Sync.on ? ' A sincronização será desativada e a cópia no Google Drive continua lá.' : ''), 'Apagar tudo', true)) {
        if (Sync.on) await api('sync/config', { method: 'POST', body: 'off' });
        await DB.clear('boards'); await DB.clear('kv');
        location.reload();
      }
    });
  }

  /* ---------- Ações ---------- */
  const ACT = {
    side: () => document.body.classList.toggle('side-open'),
    new: importModal,
    open: el => openBoard(el.dataset.id),
    install, settings: settingsModal,
    tab(el) { S.set.tab = el.dataset.id; Store.saveSet(); renderTop(); renderView(); $('#view').scrollTop = 0; },
    pdf: exportPdf, csv: exportCsv,
    refresh: () => importGoogle(cur().source.url, cur()),
    async remove() {
      const b = cur();
      if (!await confirmBox('Excluir planilha', `“${b.title}” será excluída do Prisma${Sync.on ? ' em todos os aparelhos sincronizados' : ''}. O arquivo original não é afetado.`, 'Excluir', true)) return;
      S.boards = S.boards.filter(x => x !== b);
      DB.del('boards', b.id);
      openBoard(([...S.boards].sort((a, c) => c.updated - a.updated)[0] || {}).id || null);
    },
    copy: async el => { try { await navigator.clipboard.writeText(el.dataset.text); toast('Texto copiado'); } catch (e) { toast('Não consegui copiar; selecione o texto e copie manualmente'); } },
    ctable(el) {
      const card = el.closest('.chartcard'), t = $('.ctable', card);
      if (t.hidden) t.innerHTML = Charts.table(ctx.charts[card.dataset.ci]);
      t.hidden = !t.hidden;
    },
    async cpng(el) {
      const c = ctx.charts[el.closest('.chartcard').dataset.ci];
      saveBlob(await Charts.toPng(Charts.poster(c)), fname(c.title) + '.png');
    },
    cadd() {
      const b = cur(), col = i => A.cols.find(c => c.i === i);
      const s = { sh: b.sheet, type: $('#btype').value, x: +$('#bx').value, y: +$('#by').value, agg: $('#bagg').value || undefined };
      if (s.type === 'hist' && col(s.x).type !== 'num') { if (s.y < 0) return toast('Para a distribuição, escolha uma coluna de números'); s.x = s.y; }
      if (s.type === 'scatter' && (col(s.x).type !== 'num' || s.y < 0)) return toast('Para a dispersão, escolha duas colunas de números (eixo e valor)');
      if (s.type === 'line' && col(s.x).type !== 'date' && !col(s.x).ord && !A.date) return toast('Para a linha no tempo, a planilha precisa de uma coluna de datas');
      if ((s.type === 'bar' || s.type === 'donut') && col(s.x).type === 'num') return toast('Escolha uma coluna de categorias ou datas para agrupar');
      if (!Analyze.resolve(A, s)) return toast('Essa combinação não gera um gráfico');
      b.cfg.charts.unshift(s); saveBoard(b); renderView();
      toast('Gráfico adicionado');
    },
    cdel(el) { const b = cur(); b.cfg.charts.splice(+el.dataset.k, 1); saveBoard(b); renderView(); },
    async cardpng(el) { saveBlob(await Charts.toPng(ctx.cards[+el.dataset.k], 1), `${fname(A.title)} - cartão ${+el.dataset.k + 1}.png`); },
    dsort(el) { const i = +el.dataset.i; if (ds.sort === i) { if (ds.dir < 0) ds.sort = null; ds.dir = -ds.dir; } else { ds.sort = i; ds.dir = 1; } renderView(); },
    dmore() { ds.limit += 500; renderView(); },
  };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (el && ACT[el.dataset.act]) ACT[el.dataset.act](el);
    else if (e.target.id === 'scrim') document.body.classList.remove('side-open');
  });
  document.addEventListener('change', e => {
    const b = cur(), t = e.target;
    if (!b) return;
    if (t.id === 'title') { b.title = t.value.trim() || 'Sem título'; saveBoard(b); renderSide(); cache.key = ''; A = analysis(); renderView(); }
    else if (t.dataset.f === 'sheet') { b.sheet = +t.value; ds = { q: '', sort: null, dir: 1, limit: 200 }; saveBoard(b); renderAll(); }
    else if (t.dataset.f) {
      const sc = sheetCfg(b);
      sc[t.dataset.f] = t.dataset.f === 'agg' ? t.value : +t.value;
      if (t.dataset.f === 'measure') delete sc.agg;
      saveBoard(b); renderAll();
    } else if (t.classList.contains('tsel') && t.value) {
      const sc = sheetCfg(b);
      sc.types = sc.types || {};
      if (t.value === 'auto') delete sc.types[t.dataset.i]; else sc.types[t.dataset.i] = t.value;
      saveBoard(b); renderAll();
    }
  });
  const search = debounce(() => { renderView(); const q = $('#dq'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250);
  document.addEventListener('input', e => { if (e.target.id === 'dq') { ds.q = e.target.value; ds.limit = 200; search(); } });
  document.addEventListener('keydown', e => { if (e.target.id === 'title' && e.key === 'Enter') e.target.blur(); });
  let lastW = innerWidth;
  addEventListener('resize', debounce(() => { if (innerWidth !== lastW && ctx) { lastW = innerWidth; mountCharts($('#view'), ctx); } }, 200));

  async function init() {
    await Store.load();
    applyTheme();
    if (!cur()) S.set.cur = ([...S.boards].sort((a, b) => b.updated - a.updated)[0] || {}).id || null;
    if (!Views.TABS.some(t => t[0] === S.set.tab)) S.set.tab = 'resumo';
    renderAll();
    if (location.protocol === 'https:' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('Sem modo offline:', e));
    }
    if (/^https?:$/.test(location.protocol)) await syncInfo();
    if (Sync.avail) {
      const first = Sync.on && !S.set.syncedOnce;
      DB.onChange = () => { if (Sync.on) syncSoon(); };
      await syncNow();
      if (first && !Sync.error) toast('Sincronizando com o Google Drive: ' + Sync.folder);
      setInterval(() => syncNow(), 60000);
      addEventListener('focus', () => syncNow());
    }
    renderSide();
  }
  init();
})();
