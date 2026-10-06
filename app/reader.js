'use strict';
/* Prisma — leitura de planilhas: Excel (.xlsx), CSV/TSV, tabelas HTML, texto colado e links do Google Planilhas. Sem dependências. */

const Reader = (() => {
  const MAX_ROWS = 100000;

  /* ---------- ZIP (o .xlsx é um zip de XMLs) ---------- */
  async function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('este navegador é antigo demais para abrir .xlsx; salve a planilha como CSV');
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  }
  function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf), dec = new TextDecoder();
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('o arquivo não é um .xlsx válido');
    const files = {};
    let off = dv.getUint32(e + 16, true);
    for (let i = 0, n = dv.getUint16(e + 10, true); i < n && dv.getUint32(off, true) === 0x02014b50; i++) {
      const nlen = dv.getUint16(off + 28, true);
      files[dec.decode(u8.subarray(off + 46, off + 46 + nlen))] = { method: dv.getUint16(off + 10, true), size: dv.getUint32(off + 20, true), at: dv.getUint32(off + 42, true) };
      off += 46 + nlen + dv.getUint16(off + 30, true) + dv.getUint16(off + 32, true);
    }
    return {
      has: n => !!files[n],
      async text(n) {
        const f = files[n];
        if (!f) return '';
        const start = f.at + 30 + dv.getUint16(f.at + 26, true) + dv.getUint16(f.at + 28, true), data = u8.subarray(start, start + f.size);
        return dec.decode(f.method === 0 ? data : await inflate(data));
      },
    };
  }

  /* ---------- XLSX ---------- */
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const tags = (node, name) => [...node.getElementsByTagName(name)];
  const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
  const fmtKind = (id, code) => {
    if (DATE_IDS.has(id)) return 'date';
    if (id === 9 || id === 10) return 'pct';
    if (id >= 5 && id <= 8 || id === 44 || id === 42) return 'cur';
    if (!code) return '';
    const bare = code.replace(/"[^"]*"/g, '').replace(/\\./g, '');
    if (/[$€£]|R\$/.test(code)) return 'cur';
    if (bare.includes('%')) return 'pct';
    return /[dmyhs]/i.test(bare.replace(/\[[^\]]*\]/g, '')) ? 'date' : '';
  };
  const colIndex = ref => { let n = 0; for (let i = 0; i < ref.length; i++) { const c = ref.charCodeAt(i); if (c < 65 || c > 90) break; n = n * 26 + c - 64; } return n - 1; };
  const pad = n => String(n).padStart(2, '0');
  function serialDate(v, d1904) {
    const ms = Math.round((v - 25569 + (d1904 ? 1462 : 0)) * 86400000), d = new Date(ms);
    if (isNaN(d)) return v;
    const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    if (v < 1) return hm;
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` + (hm === '00:00' ? '' : 'T' + hm);
  }
  async function xlsx(buf) {
    const zip = unzip(buf);
    if (!zip.has('xl/workbook.xml')) throw new Error('o arquivo não parece uma planilha do Excel');
    const wb = xml(await zip.text('xl/workbook.xml'));
    const d1904 = tags(wb, 'workbookPr').some(n => /^(1|true)$/.test(n.getAttribute('date1904') || ''));
    const rels = {};
    tags(xml(await zip.text('xl/_rels/workbook.xml.rels')), 'Relationship').forEach(r => rels[r.getAttribute('Id')] = r.getAttribute('Target'));
    const strings = zip.has('xl/sharedStrings.xml') ? tags(xml(await zip.text('xl/sharedStrings.xml')), 'si').map(si => tags(si, 't').filter(t => t.parentNode.nodeName !== 'rPh').map(t => t.textContent).join('')) : [];
    let kinds = [];
    if (zip.has('xl/styles.xml')) {
      const st = xml(await zip.text('xl/styles.xml')), codes = {};
      tags(st, 'numFmt').forEach(n => codes[n.getAttribute('numFmtId')] = n.getAttribute('formatCode'));
      const xfs = tags(st, 'cellXfs')[0];
      if (xfs) kinds = tags(xfs, 'xf').map(x => { const id = +x.getAttribute('numFmtId') || 0; return fmtKind(id, codes[id]); });
    }
    const sheets = [];
    for (const sh of tags(wb, 'sheet')) {
      if (sh.getAttribute('state') === 'hidden' || sh.getAttribute('state') === 'veryHidden') continue;
      let target = rels[sh.getAttribute('r:id')] || '';
      target = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
      if (!zip.has(target)) continue;
      const doc = xml(await zip.text(target)), rows = [], tally = {};
      for (const row of tags(doc, 'row')) {
        const out = [];
        let next = 0;
        for (const c of tags(row, 'c')) {
          const ref = c.getAttribute('r'), i = ref ? colIndex(ref) : next, t = c.getAttribute('t'), vn = c.getElementsByTagName('v')[0];
          next = i + 1;
          let v = vn ? vn.textContent : null;
          if (t === 'inlineStr') v = tags(c, 't').map(x => x.textContent).join('');
          else if (v == null || v === '') continue;
          else if (t === 's') v = strings[+v] ?? '';
          else if (t === 'b') v = v === '1' ? 'Sim' : 'Não';
          else if (t === 'e') continue;
          else if (t !== 'str') {
            const k = kinds[+c.getAttribute('s') || 0] || '';
            v = +v;
            if (k === 'date') v = serialDate(v, d1904);
            else if (k) (tally[i] = tally[i] || { cur: 0, pct: 0 })[k]++;
          }
          out[i] = v;
        }
        const r = +row.getAttribute('r');
        rows[r ? r - 1 : rows.length] = out;
        if (rows.length > MAX_ROWS) break;
      }
      const hints = {};
      for (const [i, t] of Object.entries(tally)) hints[i] = t.pct > t.cur ? 'pct' : 'cur';
      sheets.push({ name: sh.getAttribute('name') || 'Planilha', rows: [...rows].map(r => r ? [...r].map(v => v ?? null) : []), hints });
    }
    return sheets;
  }

  /* ---------- CSV / TSV / texto colado ---------- */
  function delimited(text) {
    text = text.replace(/^﻿/, '');
    const head = text.slice(0, 20000);
    let best = ',', score = -1;
    for (const d of ['\t', ';', ',', '|']) {
      const lines = head.split(/\r?\n/).filter(Boolean).slice(0, 20), counts = lines.map(l => l.split(d).length - 1);
      const s = counts.length && counts[0] > 0 ? Math.min(...counts) + (counts.every(c => c === counts[0]) ? 1000 : 0) : -1;
      if (s > score) { score = s; best = d; }
    }
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === best) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
        if (rows.length > MAX_ROWS) break;
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map(r => r.map(v => { v = v.trim(); return v === '' ? null : v; }));
  }
  function decode(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }
  /* Muitos sistemas exportam uma tabela HTML com extensão .xls. */
  function htmlTables(text) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return [...doc.querySelectorAll('table')].map((t, i) => ({
      name: 'Tabela ' + (i + 1),
      rows: [...t.rows].map(r => [...r.cells].map(c => c.textContent.trim() || null)),
    })).filter(s => s.rows.length > 1);
  }

  async function fromBuffer(buf, name) {
    const u8 = new Uint8Array(buf.slice(0, 8));
    if (u8[0] === 0x50 && u8[1] === 0x4b) return xlsx(buf);
    if (u8[0] === 0xd0 && u8[1] === 0xcf) throw new Error('formato .xls antigo: abra no Excel ou no Google Planilhas e salve como .xlsx ou .csv');
    const text = decode(buf);
    if (/^\s*<(!doctype|html|table|\?xml)/i.test(text)) {
      const t = htmlTables(text);
      if (t.length) return t;
      throw new Error('o arquivo é uma página, não uma planilha' + (/accounts\.google|ServiceLogin/i.test(text) ? ' (o Google pediu login: a planilha não está compartilhada por link)' : ''));
    }
    return [{ name: (name || 'Dados').replace(/\.[^.]+$/, ''), rows: delimited(text) }];
  }

  /* ---------- Google Planilhas ---------- */
  function googleUrl(link) {
    const s = String(link || '').trim();
    let m = /docs\.google\.com\/spreadsheets\/d\/e\/([\w-]+)/.exec(s);
    if (m) return { id: 'e/' + m[1], url: `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=xlsx` };
    m = /docs\.google\.com\/spreadsheets\/d\/([\w-]{20,})/.exec(s) || /^([\w-]{30,})$/.exec(s);
    if (m) return { id: m[1], url: `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx` };
    return null;
  }
  /* via(url) é o caminho pelo app de Windows, que baixa sem as restrições do navegador. */
  async function google(link, via) {
    const g = googleUrl(link);
    if (!g) throw new Error('não reconheci o link: copie o endereço da planilha no Google Planilhas');
    let buf;
    try {
      const r = via ? await via(g.url) : await fetch(g.url, { credentials: 'omit' });
      if (!r.ok) throw new Error('recusado');
      buf = await r.arrayBuffer();
    } catch (e) {
      throw new Error('não consegui baixar. Confira se a planilha está compartilhada como "Qualquer pessoa com o link" ou use Arquivo › Fazer download › Microsoft Excel (.xlsx) e abra o arquivo aqui');
    }
    return fromBuffer(buf, 'Google Planilhas');
  }

  return {
    file: async f => fromBuffer(await f.arrayBuffer(), f.name),
    text: t => /^\s*<(table|html|meta|!--)/i.test(t) ? htmlTables(t) : [{ name: 'Dados colados', rows: delimited(t) }],
    google, googleUrl,
  };
})();
