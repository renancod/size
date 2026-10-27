'use strict';
/* =====================================================================
 * ORÇAMENTOS · base de preços da Size: insumos e composições de serviço (estilo RDObras / OrçaFácil).
 * Não depende de obra: o acesso vem do cadastro do usuário (Ver | Gerir).
 * Telas: painel da base, composições (fichas, ficha analítica com curva ABC e simulação de quantidade,
 * bancada de edição com custo ao vivo), insumos (preço, data-base, histórico, reajuste e preços colados)
 * e a importação da planilha de composições do RDObras (lida no navegador com o SheetJS).
 * Usa app.js (api, modal, view, comEtapas, ligarEtapas…).
 * ===================================================================== */
Object.assign(IC, {
  calc: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM8 6h8v4H8zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z', trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  copy: 'M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1', upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  up: 'M18 15l-6-6-6 6', down: 'M6 9l6 6 6-6', paste: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 2h6v4H9z',
  percent: 'M19 5L5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', grid2: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18'
});

const BP = { d: null, ts: 0, I: {}, C: {}, fc: null, fi: null, ed: null, imp: null };
const BP_K = [['mat', 'Material'], ['mo', 'Mão de obra'], ['eq', 'Equipamento'], ['sv', 'Serviço']];
const BP_TIPO_K = { 'Material': 'mat', 'Mão de obra': 'mo', 'Equipamento': 'eq', 'Serviço': 'sv' };
const bpGere = () => baseNivel() === 'Gerir';
const bpK = tipo => BP_TIPO_K[tipo] || 'mat';
/* número como se digita no Brasil: "2.500" = dois mil e quinhentos, "1,05", "0.05" */
function bpPn(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  return num(s);
}
const bpM = v => brl(Number(v) || 0);
const bpN = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
const bpV = v => (v === '' || v == null ? '' : String(v).replace('.', ','));
const bpPct = (a, b) => (b ? Math.round(a / b * 100) + '%' : '—');
const bpDot = tipo => `<i class="bp-dot k-${tipo === 'Composição' ? 'cmp' : bpK(tipo)}" title="${esc(tipo)}"></i>`;
const bpProprio = x => x.preco !== '' && x.preco != null;
function bpDias(d) {
  if (!d) return null;
  return Math.floor((new Date(hoje() + 'T12:00') - new Date(String(d).slice(0, 10) + 'T12:00')) / 864e5);
}
/* idade do preço: até 3 meses em dia, até 6 meses atenção, mais que isso desatualizado */
function bpIdade(d) {
  const n = bpDias(d);
  if (n == null) return '<span class="bp-idade k-sem" title="sem data-base">sem data</span>';
  const cl = n <= 90 ? 'ok' : n <= 180 ? 'meia' : 'velha';
  return `<span class="bp-idade k-${cl}" title="preço de ${fd(d)} (${n} dias)">${fd(d).slice(3)}</span>`;
}
function bpBarra(c, cl) {
  const t = c.total || 0;
  if (!t) return `<div class="bp-barra vazia ${cl || ''}"></div>`;
  return `<div class="bp-barra ${cl || ''}">${BP_K.filter(([k]) => c[k] > 0).map(([k, n]) => `<i class="k-${k}" style="width:${c[k] / t * 100}%" title="${n}: ${bpPct(c[k], t)}"></i>`).join('')}</div>`;
}
const bpLegenda = c => BP_K.filter(([k]) => c[k] > 0.000001).map(([k, n]) => `<span><i class="bp-dot k-${k}"></i>${n} <b>${bpPct(c[k], c.total)}</b></span>`).join('');
function bpDonut(c, extra) {
  const t = c.total || 0;
  let a = 0;
  const seg = t ? BP_K.filter(([k]) => c[k] > 0).map(([k]) => { const i = a; a += c[k] / t * 100; return `var(--k-${k}) ${i}% ${a}%`; }).join(',') : 'rgba(255,255,255,.18) 0 100%';
  return `<div class="bp-donut ${extra || ''}" style="background:conic-gradient(${seg})"></div>`;
}
const bpDominante = c => (BP_K.slice().sort((a, b) => (c[b[0]] || 0) - (c[a[0]] || 0))[0] || ['mat'])[0];

/* ---------- dados ---------- */
async function bpCarregar(forcar) {
  if (!BP.d || forcar || Date.now() - BP.ts > 60000) {
    BP.d = await api('base_dados');
    BP.ts = Date.now();
    BP.I = {}; BP.C = {};
    BP.d.insumos.forEach(i => { BP.I[i.codigo] = i; });
    BP.d.composicoes.forEach(c => { BP.C[c.codigo] = c; });
  }
  return BP.d;
}
/* o que um item da composição é: insumo (com preço do cadastro ou próprio) ou composição auxiliar */
function bpRef(x) {
  if (x.ref_tipo === 'C') {
    const c = BP.C[x.ref];
    return c ? { ok: true, aux: true, codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, tipo: 'Composição', unit: c.custo.total, custo: c.custo, ativo: c.ativo } : { ok: false, codigo: x.ref, descricao: 'Composição não encontrada', unidade: '', tipo: 'Composição', unit: 0 };
  }
  const i = BP.I[x.ref];
  if (!i) return { ok: false, codigo: x.ref, descricao: 'Insumo não encontrado', unidade: '', tipo: 'Material', unit: 0 };
  const proprio = bpProprio(x);
  return { ok: true, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, tipo: i.tipo, unit: proprio ? bpPn(x.preco) : i.preco, cadastro: i.preco, proprio, ativo: i.ativo, data: i.data_preco };
}
function bpCustoItens(itens) {
  const r = { mat: 0, mo: 0, eq: 0, sv: 0, total: 0 };
  itens.forEach(x => {
    const k = bpPn(x.coef), f = bpRef(x);
    if (!f.ok) return;
    if (f.aux) BP_K.forEach(([c]) => { r[c] += k * f.custo[c]; });
    else r[bpK(f.tipo)] += k * f.unit;
  });
  r.total = r.mat + r.mo + r.eq + r.sv;
  return r;
}
/* explode as auxiliares até os insumos e soma o coeficiente de cada um (curva ABC e lista de compra) */
function bpExplodir(itens, fator, acc, pilha) {
  itens.forEach(x => {
    const k = fator * bpPn(x.coef);
    if (x.ref_tipo === 'C') {
      const c = BP.C[x.ref];
      if (c && !pilha.includes(x.ref)) bpExplodir(c.itens, k, acc, pilha.concat(x.ref));
      return;
    }
    const i = BP.I[x.ref];
    if (!i) return;
    const p = bpProprio(x) ? bpPn(x.preco) : i.preco, key = x.ref + '|' + p;
    const a = acc[key] || (acc[key] = { i, coef: 0, preco: p, proprio: Math.abs(p - i.preco) > 0.00001 });
    a.coef += k;
  });
  return acc;
}
function bpAbc(c) {
  const l = Object.values(bpExplodir(c.itens, 1, {}, [c.codigo])).map(a => Object.assign(a, { custo: a.coef * a.preco })).sort((a, b) => b.custo - a.custo);
  const t = l.reduce((s, a) => s + a.custo, 0);
  let ac = 0;
  l.forEach(a => { ac += a.custo; a.acum = t ? ac / t * 100 : 0; a.classe = a.acum - (t ? a.custo / t * 100 : 0) < 80 ? 'A' : a.acum - (t ? a.custo / t * 100 : 0) < 95 ? 'B' : 'C'; });
  return { l, t };
}

/* ---------- estrutura comum ---------- */
function bpSem(nivel) {
  titulo('Orçamentos');
  view(`<div class="card vazio"><p><b>${nivel === 'Gerir' && baseNivel() ? 'Seu acesso ao módulo Orçamentos é só de consulta.' : 'Você não tem acesso ao módulo Orçamentos.'}</b></p><p>Peça ao administrador (Usuários e acessos → Orçamentos).</p></div>`);
}
function bpGrupos(aqui) {
  const D = BP.d, g = [{ t: 'Base de preços', itens: [
    { k: 'painel', t: 'Painel da base', i: 'chart', on: aqui === 'painel' },
    { k: 'comp', t: 'Composições', i: 'layers', n: D.composicoes.length, on: aqui === 'comp' },
    { k: 'ins', t: 'Insumos', i: 'box', n: D.insumos.length, on: aqui === 'ins' }] }];
  if (bpGere()) g.push({ t: 'Ações', itens: [{ k: 'a:comp', t: 'Nova composição', i: 'plus', cl: 'acao' }, { k: 'a:ins', t: 'Novo insumo', i: 'plus', cl: 'acao' },
    { k: 'a:imp', t: 'Importar do RDObras', i: 'upload', cl: 'acao', on: aqui === 'imp' }] });
  return g;
}
function bpTela(aqui, html) {
  view(`<div class="bp">${comEtapas(bpGrupos(aqui), html)}</div>`);
  ligarEtapas(k => {
    const f = { painel: () => { location.hash = '#/orc'; }, comp: () => { location.hash = '#/orc/composicoes'; }, ins: () => { location.hash = '#/orc/insumos'; },
      'a:comp': () => { location.hash = '#/orc/composicao/nova'; }, 'a:ins': () => bpInsumoModal(), 'a:imp': () => { location.hash = '#/orc/importar'; } }[k];
    if (f) f();
  });
}
/* "/" leva para a busca da tela */
document.addEventListener('keydown', e => {
  if (e.key !== '/' || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
  const b = $('.bp [data-busca]');
  if (b) { e.preventDefault(); b.focus(); }
});
function bpCsv(nome, cab, linhas) {
  const v = x => (typeof x === 'number' ? String(x).replace('.', ',') : '"' + String(x ?? '').replace(/"/g, '""') + '"');
  const txt = '﻿' + [cab, ...linhas].map(l => l.map(v).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
  a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ---------- painel da base ---------- */
async function vBase() {
  titulo('Orçamentos · base de preços');
  if (!baseNivel()) return bpSem();
  const D = await bpCarregar(), I = D.insumos, C = D.composicoes, g = bpGere();
  if (!I.length && !C.length) {
    return bpTela('painel', `${bpHero('Base de preços', 'Insumos e composições que alimentam os orçamentos dos novos clientes. Comece trazendo o que você já tem no RDObras.', '', '')}
      <div class="bp-comeco">${[['upload', 'Importe do RDObras', 'A planilha de composições exportada vira insumos e composições aqui, com os mesmos custos.', '#/orc/importar'],
        ['box', 'Cadastre insumos', 'Materiais, mão de obra, equipamentos e serviços de terceiro, com preço e data-base.', 'ins'],
        ['layers', 'Monte composições', 'Cada serviço com seus insumos e coeficientes. O custo é recalculado sozinho quando um preço muda.', '#/orc/composicao/nova']]
        .map(([i, t, s, h], n) => `<div class="bp-passo"><span class="bp-num">${n + 1}</span>${ic(i)}<b>${t}</b><small>${s}</small>${g ? (h === 'ins' ? '<button class="btn sec peq" id="bpNovoIns">Novo insumo</button>' : `<a class="btn ${n ? 'sec' : ''} peq" href="${h}">${n ? 'Nova composição' : 'Importar planilha'}</a>`) : ''}</div>`).join('')}</div>`), bpLigaNovoIns();
  }
  const usados = I.filter(i => i.ativo && i.usos), velhos = usados.filter(i => (bpDias(i.data_preco) ?? 9999) > 180);
  const datas = usados.map(i => i.data_preco).filter(Boolean).sort(), maisAntiga = datas[0];
  const prob = C.filter(c => c.erro || c.custo.falta), proprios = C.filter(c => c.itens.some(bpProprio));
  const porTipo = BP_K.map(([k, n]) => ({ k, n, q: I.filter(i => bpK(i.tipo) === k).length })), totI = I.length || 1;
  const grupos = {};
  C.filter(c => c.ativo).forEach(c => { const k = c.grupo || 'Sem grupo'; const x = grupos[k] || (grupos[k] = { g: k, n: 0, min: Infinity, max: 0, c: { mat: 0, mo: 0, eq: 0, sv: 0, total: 0 } }); x.n++; x.min = Math.min(x.min, c.custo.total); x.max = Math.max(x.max, c.custo.total); BP_K.forEach(([q]) => { x.c[q] += c.custo[q] / (c.custo.total || 1); }); x.c.total += c.custo.total ? 1 : 0; });
  const top = I.filter(i => i.usos).sort((a, b) => b.usos - a.usos || b.preco - a.preco).slice(0, 8);
  const recentes = C.slice().sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em))).slice(0, 5);
  bpTela('painel', `${bpHero('Base de preços', 'Insumos e composições que alimentam os orçamentos dos novos clientes. Os custos são recalculados na hora a partir dos preços dos insumos.',
    `<div class="bp-hero-n"><div><b>${C.length}</b><small>composições</small></div><div><b>${I.length}</b><small>insumos</small></div><div><b>${maisAntiga ? fd(maisAntiga).slice(3) : '—'}</b><small>preço mais antigo em uso</small></div></div>`,
    g ? `<a class="btn bp-ac" href="#/orc/composicao/nova">${ic('plus')} Nova composição</a><a class="btn sec" href="#/orc/importar">${ic('upload')} Importar do RDObras</a>` : '')}
    <div class="bp-kpis">
      <div class="card"><small>Insumos por tipo</small><div class="bp-barra grossa">${porTipo.filter(t => t.q).map(t => `<i class="k-${t.k}" style="width:${t.q / totI * 100}%"></i>`).join('')}</div>
        <div class="bp-leg">${porTipo.filter(t => t.q).map(t => `<span><i class="bp-dot k-${t.k}"></i>${t.n} <b>${t.q}</b></span>`).join('')}</div></div>
      <a class="card bp-kpi ${velhos.length ? 'quente' : ''}" href="#/orc/insumos?f=velhos"><small>Preços com mais de 6 meses</small><b>${velhos.length}</b><small>${velhos.length ? 'de ' + usados.length + ' insumos em uso · revisar' : 'tudo em dia'}</small></a>
      <a class="card bp-kpi" href="#/orc/composicoes?f=proprio"><small>Com preço próprio</small><b>${proprios.length}</b><small>composições com item de preço diferente do cadastro</small></a>
      <a class="card bp-kpi ${prob.length ? 'quente' : ''}" href="#/orc/composicoes?f=prob"><small>Com problema</small><b>${prob.length}</b><small>${prob.length ? 'item sem cadastro ou circular' : 'nenhuma'}</small></a>
    </div>
    <div class="card"><div class="bp-h"><h3>${ic('grid2')} Grupos de serviço</h3><a class="linkbtn" href="#/orc/composicoes">Ver todas</a></div>
      <div class="bp-grupos">${Object.values(grupos).sort((a, b) => b.n - a.n).map(x => { const m = { mat: x.c.mat, mo: x.c.mo, eq: x.c.eq, sv: x.c.sv, total: x.c.mat + x.c.mo + x.c.eq + x.c.sv };
        return `<a class="bp-grupo" href="#/orc/composicoes?g=${enc(x.g)}"><b>${esc(x.g)}</b><small>${plural(x.n, 'composição', 'composições')} · ${x.n > 1 ? bpM(x.min) + ' a ' + bpM(x.max) : bpM(x.min)}</small>${bpBarra(m, 'fino')}</a>`; }).join('')}</div></div>
    <div class="bp-2">
      <div class="card"><h3>${ic('box')} Insumos mais usados</h3>${top.map(i => `<button type="button" class="bp-linha" data-ins="${esc(i.codigo)}">${bpDot(i.tipo)}<span><b>${esc(i.descricao)}</b><small><code>${esc(i.codigo)}</code> · em ${plural(i.usos, 'composição', 'composições')}</small></span><span class="bp-mono">${bpM(i.preco)}<small>/${esc(i.unidade)}</small></span></button>`).join('') || '<p class="vazio">Nenhum insumo em composição ainda.</p>'}</div>
      <div class="card"><h3>${ic('clock')} Alteradas por último</h3>${recentes.map(c => `<a class="bp-linha" href="#/orc/composicao/${enc(c.codigo)}">${bpDonut(c.custo, 'mini')}<span><b>${esc(c.descricao)}</b><small><code>${esc(c.codigo)}</code> · ${fdh(c.atualizado_em)}${c.atualizado_por ? ' · ' + esc(c.atualizado_por) : ''}</small></span><span class="bp-mono">${bpM(c.custo.total)}<small>/${esc(c.unidade)}</small></span></a>`).join('')}</div>
    </div>`);
  $$('[data-ins]').forEach(b => { b.onclick = () => bpInsumoModal(BP.I[b.dataset.ins]); });
}
function bpHero(t, p, dir, acoes) {
  return `<div class="bp-hero"><div class="bp-hero-t"><span class="bp-selo">${ic('calc')} Orçamentos · Size Engenharia</span><h2>${t}</h2><p>${p}</p>${acoes ? `<div class="acoes">${acoes}</div>` : ''}</div>${dir || ''}</div>`;
}
function bpLigaNovoIns() { const b = $('#bpNovoIns'); if (b) b.onclick = () => bpInsumoModal(); }

/* ---------- composições: fichas ---------- */
function bpFicha(c) {
  const flags = [c.erro || c.custo.falta ? `<span class="bp-flag erro">${ic('alert')} problema</span>` : '', c.itens.some(bpProprio) ? '<span class="bp-flag">preço próprio</span>' : '',
    c.usada_em ? `<span class="bp-flag aux">auxiliar ×${c.usada_em}</span>` : '', c.ativo ? '' : '<span class="bp-flag">inativa</span>'].join('');
  return `<a class="bp-ficha k-${bpDominante(c.custo)} ${c.ativo ? '' : 'inativa'}" href="#/orc/composicao/${enc(c.codigo)}">
    <div class="bp-f1"><code class="bp-cod">${esc(c.codigo)}</code>${c.grupo ? `<span class="bp-grp">${esc(c.grupo)}</span>` : ''}${flags}</div>
    <b class="bp-desc">${esc(c.descricao)}</b>
    <div class="bp-f2"><span class="bp-preco"><b>${bpM(c.custo.total)}</b><small>/${esc(c.unidade)}</small></span>${bpIdade(c.custo.data)}</div>
    ${bpBarra(c.custo)}
    <div class="bp-leg">${bpLegenda(c.custo)}<span class="dir">${plural(c.itens.length, 'item', 'itens')}</span></div></a>`;
}
async function vBaseComps(qs) {
  titulo('Composições');
  if (!baseNivel()) return bpSem();
  const D = await bpCarregar(), p = new URLSearchParams(qs || '');
  const F = BP.fc = Object.assign({ q: '', g: '', f: '', ord: 'cod', lim: 60 }, qs ? {} : BP.fc || {});
  ['q', 'g', 'f'].forEach(k => { if (p.has(k)) F[k] = p.get(k); });
  F.lim = 60;
  const grupos = [...new Set(D.composicoes.map(c => c.grupo || ''))].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b));
  const conta = fn => D.composicoes.filter(fn).length;
  const ESPECIAIS = { proprio: ['Com preço próprio', c => c.itens.some(bpProprio)], prob: ['Com problema', c => c.erro || c.custo.falta], aux: ['Auxiliares', c => c.usada_em > 0], inativas: ['Inativas', c => !c.ativo] };
  bpTela('comp', `<div class="cab"><h2>Composições</h2><span class="contagem" id="bpN"></span>
      <span class="acoes"><button class="btn sec peq" id="bpCsv">${ic('download')} Exportar</button>${bpGere() ? `<a class="btn peq bp-ac" href="#/orc/composicao/nova">${ic('plus')} Nova</a>` : ''}</span></div>
    <div class="bp-filtros"><div class="busca">${ic('search')}<input type="search" id="bpQ" data-busca placeholder="Buscar por código, descrição ou insumo  ( / )" value="${esc(F.q)}"></div>
      <select id="bpOrd">${[['cod', 'Código'], ['desc', 'Descrição'], ['maior', 'Maior custo'], ['menor', 'Menor custo'], ['velho', 'Preço mais antigo']].map(([v, t]) => `<option value="${v}" ${F.ord === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="chips" id="bpChips"><button class="chip ${!F.g && !F.f ? 'on' : ''}" data-g="" data-f="">Todas <b>${D.composicoes.length}</b></button>
      ${grupos.filter(Boolean).map(g => `<button class="chip ${F.g === g ? 'on' : ''}" data-g="${esc(g)}">${esc(g)} <b>${conta(c => c.grupo === g)}</b></button>`).join('')}
      ${Object.entries(ESPECIAIS).map(([k, [t, fn]]) => { const n = conta(fn); return n ? `<button class="chip bp-chip-f ${F.f === k ? 'on' : ''}" data-f="${k}">${t} <b>${n}</b></button>` : ''; }).join('')}</div>
    <div class="bp-fichas" id="bpLista"></div><div class="acoes" style="justify-content:center;margin-top:12px"><button class="btn sec" id="bpMais" hidden>Mostrar mais</button></div>`);
  const filtrar = () => {
    const t = norm(F.q).split(/\s+/).filter(Boolean);
    let l = D.composicoes.filter(c => (F.f === 'inativas' || c.ativo) && (!F.g || (c.grupo || '') === F.g) && (!F.f || ESPECIAIS[F.f][1](c)));
    if (t.length) l = l.filter(c => { const s = norm(c.codigo + ' ' + c.descricao + ' ' + c.grupo + ' ' + c.itens.map(x => { const r = bpRef(x); return r.codigo + ' ' + r.descricao; }).join(' ')); return t.every(x => s.includes(x)); });
    const ord = { cod: (a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }), desc: (a, b) => a.descricao.localeCompare(b.descricao), maior: (a, b) => b.custo.total - a.custo.total, menor: (a, b) => a.custo.total - b.custo.total, velho: (a, b) => String(a.custo.data || '9').localeCompare(String(b.custo.data || '9')) }[F.ord];
    return l.sort(ord);
  };
  const desenhar = () => {
    const l = filtrar();
    $('#bpN').textContent = plural(l.length, 'composição', 'composições');
    $('#bpLista').innerHTML = l.slice(0, F.lim).map(bpFicha).join('') || `<div class="card vazio" style="grid-column:1/-1"><p>Nenhuma composição ${F.q ? 'com “' + esc(F.q) + '”' : 'aqui'}.</p>${bpGere() && !D.composicoes.length ? `<a class="btn" href="#/orc/importar">${ic('upload')} Importar do RDObras</a>` : ''}</div>`;
    $('#bpMais').hidden = l.length <= F.lim;
  };
  let tm;
  $('#bpQ').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { F.q = e.target.value; F.lim = 60; desenhar(); }, 120); };
  $('#bpOrd').onchange = e => { F.ord = e.target.value; desenhar(); };
  $$('#bpChips .chip').forEach(b => { b.onclick = () => {
    if (b.dataset.f !== undefined && b.dataset.g === undefined) { F.f = F.f === b.dataset.f ? '' : b.dataset.f; } else { F.g = b.dataset.g; if (!b.dataset.g) F.f = ''; }
    $$('#bpChips .chip').forEach(x => x.classList.toggle('on', x.dataset.g !== undefined && x.dataset.f === undefined ? x.dataset.g === F.g && !!F.g : x.dataset.f !== undefined && x.dataset.g === undefined ? x.dataset.f === F.f && !!F.f : !F.g && !F.f));
    F.lim = 60; desenhar();
  }; });
  $('#bpMais').onclick = () => { F.lim += 60; desenhar(); };
  $('#bpCsv').onclick = () => bpCsvComposicoes(filtrar());
  desenhar();
}
function bpCsvComposicoes(l) {
  const linhas = [];
  l.forEach(c => c.itens.forEach(x => { const r = bpRef(x), k = bpPn(x.coef); linhas.push([c.codigo, c.descricao, c.unidade, c.grupo || '', Math.round(c.custo.total * 100) / 100, r.aux ? 'Composição' : r.tipo, r.codigo, r.descricao, r.unidade, k, Math.round(r.unit * 10000) / 10000, Math.round(k * r.unit * 10000) / 10000, r.proprio ? 'Sim' : '']); }));
  bpCsv(`composicoes_${hoje()}.csv`, ['Composição', 'Descrição', 'Un', 'Grupo', 'Custo unit. (R$)', 'Tipo do item', 'Código do item', 'Descrição do item', 'Un item', 'Coeficiente', 'Preço unit. (R$)', 'Custo no serviço (R$)', 'Preço próprio'], linhas);
}

/* ---------- ficha analítica da composição ---------- */
async function vBaseComp(cod) {
  if (!baseNivel()) return bpSem();
  const D = await bpCarregar(), c = BP.C[cod];
  if (!c) { toast('Composição não encontrada.', 1); location.hash = '#/orc/composicoes'; return; }
  titulo(c.codigo + ' · ' + c.descricao);
  const g = bpGere(), cu = c.custo, usada = D.composicoes.filter(x => x.itens.some(i => i.ref_tipo === 'C' && i.ref === c.codigo));
  bpTela('comp', `<a href="#/orc/composicoes" class="linkbtn">${ic('back')} Composições</a>
    <div class="bp-hero bp-hero-c k-${bpDominante(cu)}">
      <div class="bp-hero-t"><span class="bp-selo"><code>${esc(c.codigo)}</code>${c.grupo ? ' · ' + esc(c.grupo) : ''}${c.ativo ? '' : ' · inativa'}</span><h2>${esc(c.descricao)}</h2>
        <p>Por <b>${esc(c.unidade)}</b> · ${plural(c.itens.length, 'item', 'itens')} · ${cu.data ? 'preços de até ' + fd(cu.data) : 'sem data-base'}${c.fonte ? ' · ' + esc(c.fonte) : ''}</p>
        ${g ? `<div class="acoes"><a class="btn bp-ac" href="#/orc/composicao/${enc(c.codigo)}/editar">${ic('edit')} Editar</a><button class="btn sec" id="bpDup">${ic('copy')} Duplicar</button>${usada.length ? '' : `<button class="btn sec bp-x" id="bpDel">${ic('trash')} Excluir</button>`}</div>` : ''}</div>
      <div class="bp-hero-custo">${bpDonut(cu)}<div><small>Custo unitário</small><b class="bp-mono">${bpM(cu.total)}</b><small>por ${esc(c.unidade)}</small></div></div>
    </div>
    ${c.erro ? `<div class="aviso erro">${esc(c.erro)}</div>` : ''}${cu.falta ? `<div class="aviso warn">${plural(cu.falta, 'item aponta', 'itens apontam')} para cadastro que não existe mais: o custo está incompleto.${g ? ' Edite a composição.' : ''}</div>` : ''}
    <div class="bp-cats">${BP_K.map(([k, n]) => `<div class="bp-cat k-${k} ${cu[k] ? '' : 'zero'}"><small><i class="bp-dot k-${k}"></i>${n}</small><b class="bp-mono">${bpM(cu[k])}</b><span>${bpPct(cu[k], cu.total)}</span></div>`).join('')}</div>
    <div class="card"><div class="bp-h"><h3>Composição analítica</h3><div class="bp-seg" id="bpModo"><button type="button" data-m="arv" class="on">${ic('layers')} Estrutura</button><button type="button" data-m="abc">${ic('chart')} Curva ABC dos insumos</button></div></div>
      <div id="bpAnal" class="rolar"></div></div>
    <div class="card bp-sim"><div class="bp-h"><h3>${ic('calc')} Quanto custa e o que comprar</h3></div>
      <div class="bp-sim-l"><label>Quantidade do serviço (${esc(c.unidade)})<input id="bpQtd" inputmode="decimal" placeholder="ex: 2.500" autocomplete="off"></label><div id="bpSimR" class="bp-sim-r"><small>Digite a quantidade para ver o custo total e a lista de insumos.</small></div></div>
      <div id="bpSimL" class="rolar"></div></div>
    ${usada.length ? `<div class="card"><h3>${ic('layers')} Usada como auxiliar em</h3>${usada.map(u => `<a class="bp-linha" href="#/orc/composicao/${enc(u.codigo)}">${bpDonut(u.custo, 'mini')}<span><b>${esc(u.descricao)}</b><small><code>${esc(u.codigo)}</code></small></span><span class="bp-mono">${bpM(u.custo.total)}<small>/${esc(u.unidade)}</small></span></a>`).join('')}</div>` : ''}
    ${c.obs ? `<div class="card"><h3>Observações</h3><p style="white-space:pre-wrap;margin:0">${esc(c.obs)}</p></div>` : ''}
    <small class="bp-meta">${c.atualizado_em ? 'Atualizada em ' + fdh(c.atualizado_em) + (c.atualizado_por ? ' por ' + esc(c.atualizado_por) : '') : ''}</small>`);
  const modo = m => {
    $$('#bpModo button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    $('#bpAnal').innerHTML = m === 'abc' ? bpTabAbc(c) : bpTabArvore(c);
    // abre/fecha a auxiliar: filhos diretos seguem o clique; netos só aparecem se a auxiliar deles também estiver aberta
    $$('#bpAnal tr[data-tg]').forEach(tr => { tr.onclick = () => {
      const tg = tr.dataset.tg, ab = tr.classList.toggle('aberto');
      $$(`#bpAnal tr[data-pai="${tg}"], #bpAnal tr[data-pai^="${tg}."]`).forEach(x => { x.hidden = !ab || (x.dataset.pai !== tg && !$(`#bpAnal tr[data-tg="${x.dataset.pai}"]`)?.classList.contains('aberto')); });
    }; });
    $$('#bpAnal [data-ins]').forEach(b => { b.onclick = e => { e.stopPropagation(); bpInsumoModal(BP.I[b.dataset.ins]); }; });
  };
  $$('#bpModo button').forEach(b => { b.onclick = () => modo(b.dataset.m); });
  modo('arv');
  $('#bpQtd').oninput = e => bpSimular(c, bpPn(e.target.value));
  if (g) {
    $('#bpDup').onclick = async () => { try { const r = await api('base_composicao_duplicar', { codigo: c.codigo }); toast(r.msg); await bpCarregar(true); location.hash = '#/orc/composicao/' + enc(r.codigo) + '/editar'; } catch (e) { toast(e.message, 1); } };
    if ($('#bpDel')) $('#bpDel').onclick = async () => { if (!confirm(`Excluir a composição ${c.codigo} · ${c.descricao}?`)) return; try { toast((await api('base_composicao_excluir', { codigo: c.codigo })).msg); await bpCarregar(true); location.hash = '#/orc/composicoes'; } catch (e) { toast(e.message, 1); } };
  }
}
/* estrutura: itens da composição; auxiliar abre os itens dela (custo já multiplicado pelo coeficiente) */
function bpTabArvore(c) {
  const linhas = [], tot = c.custo.total || 0;
  const add = (itens, fator, nivel, pai, pilha) => itens.forEach((x, n) => {
    const r = bpRef(x), k = bpPn(x.coef), custo = fator * k * (r.unit || 0), id = (pai ? pai + '.' : 'n') + n;
    linhas.push(`<tr class="${nivel ? 'bp-sub' : ''} ${r.aux ? 'bp-aux' : ''} ${r.ok ? '' : 'bp-falta'}" ${pai ? `data-pai="${pai}" hidden` : ''} ${r.aux ? `data-tg="${id}"` : ''}>
      <td style="padding-left:${8 + nivel * 18}px">${r.aux ? `<span class="bp-seta">${ic('chevron')}</span>` : ''}${bpDot(r.tipo)} <code>${esc(r.codigo)}</code></td>
      <td>${r.aux || !r.ok ? `<b>${esc(r.descricao)}</b>` : `<button type="button" class="bp-lnk" data-ins="${esc(r.codigo)}">${esc(r.descricao)}</button>`}${r.proprio ? ` <span class="bp-flag" title="no cadastro: ${bpM(r.cadastro)}">preço próprio</span>` : ''}${r.ok && r.ativo === false ? ' <span class="bp-flag">inativo</span>' : ''}</td>
      <td>${esc(r.unidade)}</td><td class="n bp-mono">${bpN(k)}</td><td class="n bp-mono">${bpM(r.unit)}</td><td class="n bp-mono"><b>${bpM(custo)}</b></td><td class="n">${nivel ? '' : bpPct(custo, tot)}</td></tr>`);
    if (r.aux && !pilha.includes(x.ref)) add(BP.C[x.ref].itens, fator * k, nivel + 1, id, pilha.concat(x.ref));
  });
  add(c.itens, 1, 0, '', [c.codigo]);
  return `<table class="tab bp-tab"><thead><tr><th>Código</th><th>Descrição</th><th>Un</th><th class="n">Coef.</th><th class="n">Preço unit.</th><th class="n">Custo / ${esc(c.unidade)}</th><th class="n">%</th></tr></thead>
    <tbody>${linhas.join('')}</tbody><tfoot><tr><td colspan="5">Custo unitário</td><td class="n bp-mono"><b>${bpM(tot)}</b></td><td></td></tr></tfoot></table>`;
}
function bpTabAbc(c) {
  const { l, t } = bpAbc(c);
  return `<table class="tab bp-tab"><thead><tr><th>Classe</th><th>Insumo</th><th>Un</th><th class="n">Coef. total</th><th class="n">Preço</th><th class="n">Custo / ${esc(c.unidade)}</th><th class="n">%</th><th class="n">Acumulado</th></tr></thead><tbody>
    ${l.map(a => `<tr><td><span class="bp-abc k-${a.classe}">${a.classe}</span></td><td>${bpDot(a.i.tipo)} <button type="button" class="bp-lnk" data-ins="${esc(a.i.codigo)}">${esc(a.i.descricao)}</button> <small><code>${esc(a.i.codigo)}</code></small>${a.proprio ? ' <span class="bp-flag">preço próprio</span>' : ''}</td>
      <td>${esc(a.i.unidade)}</td><td class="n bp-mono">${bpN(a.coef)}</td><td class="n bp-mono">${bpM(a.preco)}</td><td class="n bp-mono"><b>${bpM(a.custo)}</b></td><td class="n">${bpPct(a.custo, t)}</td>
      <td class="n"><div class="bp-acum"><i style="width:${Math.min(100, a.acum)}%"></i><span>${Math.round(a.acum)}%</span></div></td></tr>`).join('')}</tbody></table>
    <small class="bp-nota">A curva ABC abre as composições auxiliares até os insumos: os de classe A somam 80% do custo do serviço e são os que mais pesam numa negociação de preço.</small>`;
}
function bpSimular(c, q) {
  if (!(q > 0)) { $('#bpSimR').innerHTML = '<small>Digite a quantidade para ver o custo total e a lista de insumos.</small>'; $('#bpSimL').innerHTML = ''; return; }
  const cu = c.custo, { l } = bpAbc(c);
  $('#bpSimR').innerHTML = `<div class="bp-sim-tot"><small>Custo de ${nf(q)} ${esc(c.unidade)}</small><b class="bp-mono">${bpM(q * cu.total)}</b></div>
    ${BP_K.filter(([k]) => cu[k]).map(([k, n]) => `<div class="bp-sim-c"><i class="bp-dot k-${k}"></i>${n}<b class="bp-mono">${bpM(q * cu[k])}</b></div>`).join('')}`;
  $('#bpSimL').innerHTML = `<table class="tab bp-tab"><thead><tr><th>Insumo</th><th class="n">Quantidade</th><th>Un</th><th class="n">Custo</th></tr></thead><tbody>
    ${l.slice().sort((a, b) => (a.i.tipo === b.i.tipo ? b.custo - a.custo : BP_K.findIndex(([k]) => k === bpK(a.i.tipo)) - BP_K.findIndex(([k]) => k === bpK(b.i.tipo))))
      .map(a => `<tr><td>${bpDot(a.i.tipo)} ${esc(a.i.descricao)} <small><code>${esc(a.i.codigo)}</code></small></td><td class="n bp-mono"><b>${nf(q * a.coef)}</b></td><td>${esc(a.i.unidade)}</td><td class="n bp-mono">${bpM(q * a.custo)}</td></tr>`).join('')}</tbody></table>`;
}

/* ---------- bancada: criar e editar composição com custo ao vivo ---------- */
async function vBaseEditor(cod) {
  if (!bpGere()) return bpSem('Gerir');
  const D = await bpCarregar(), c = cod ? BP.C[cod] : null;
  if (cod && !c) { toast('Composição não encontrada.', 1); location.hash = '#/orc/composicoes'; return; }
  titulo(c ? 'Editar ' + c.codigo : 'Nova composição');
  const E = BP.ed = { orig: c ? c.codigo : '', sujo: false, itens: c ? c.itens.map(x => ({ ref_tipo: x.ref_tipo, ref: x.ref, coef: bpV(x.coef), preco: bpV(x.preco) })) : [] };
  const grupos = [...new Set(D.composicoes.map(x => x.grupo).filter(Boolean))].sort();
  const unidades = [...new Set([...D.unidades, ...D.composicoes.map(x => x.unidade), ...D.insumos.map(x => x.unidade)].filter(Boolean))].sort();
  const voltar = c ? '#/orc/composicao/' + enc(c.codigo) : '#/orc/composicoes';
  bpTela('comp', `<a href="${voltar}" class="linkbtn" id="bpVoltar">${ic('back')} ${c ? 'Voltar para a ficha' : 'Composições'}</a>
    <form id="bpEd" class="bp-bancada" autocomplete="off">
      <div class="bp-ed-main">
        <div class="card"><h3>${c ? 'Editar composição' : 'Nova composição'}</h3>
          <div class="bp-g3"><label>Código<input name="codigo" value="${c ? esc(c.codigo) : ''}" ${c ? 'disabled' : ''} placeholder="automático (CMP-…)"></label>
            <label class="bp-span2">Descrição do serviço<input name="descricao" required value="${esc(c?.descricao || '')}" placeholder="ex: Rede coletora PVC DN 150, incluindo escavação e reaterro"></label></div>
          <div class="bp-g3"><label>Unidade<input name="unidade" required list="bpUn" value="${esc(c?.unidade || '')}" placeholder="m, m², m³, un…"></label>
            <label>Grupo / etapa<input name="grupo" list="bpGr" value="${esc(c?.grupo || '')}" placeholder="ex: Pavimentação"></label>
            <label class="ck bp-ck"><input type="checkbox" name="ativo" ${!c || c.ativo ? 'checked' : ''}> Ativa (aparece para orçar)</label></div>
          <details ${c?.obs ? 'open' : ''}><summary>Observações</summary><textarea name="obs" rows="2">${esc(c?.obs || '')}</textarea></details></div>
        <div class="card"><div class="bp-h"><h3>Itens <small>quanto vai em 1 unidade do serviço</small></h3><button type="button" class="btn sec peq" id="bpColar">${ic('paste')} Colar do Excel</button></div>
          <div class="bp-add"><div class="busca">${ic('search')}<input id="bpBusca" data-busca placeholder="Incluir insumo ou composição auxiliar: código ou descrição  ( / )"></div><div class="bp-res" id="bpRes" hidden></div></div>
          <div id="bpItens" class="bp-itens"></div></div>
      </div>
      <aside class="bp-ed-lado"><div class="bp-resumo" id="bpResumo"></div></aside>
    </form>
    <datalist id="bpUn">${unidades.map(u => `<option value="${esc(u)}">`).join('')}</datalist><datalist id="bpGr">${grupos.map(g => `<option value="${esc(g)}">`).join('')}</datalist>`);
  const f = $('#bpEd');
  f.oninput = e => { E.sujo = true; if (e.target.name === 'unidade') bpResumo(); };
  // Enter num campo não salva a composição sem querer (só o botão salva)
  f.onkeydown = e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); };
  $('#bpVoltar').onclick = e => { if (E.sujo && !confirm('Sair sem salvar as mudanças?')) e.preventDefault(); };
  bpItens(); bpResumo(); bpBuscaLigar(c ? c.codigo : '');
  $('#bpColar').onclick = () => bpColarItens();
  f.onsubmit = async e => {
    e.preventDefault();
    const b = $('#bpSalvar'); b.disabled = true; b.textContent = 'Salvando…';
    try {
      const r = await api('base_composicao_salvar', { composicao: { original: E.orig, codigo: f.codigo.value, descricao: f.descricao.value, unidade: f.unidade.value, grupo: f.grupo.value, obs: f.obs.value, ativo: f.ativo.checked },
        itens: E.itens.map(x => ({ ref_tipo: x.ref_tipo, ref: x.ref, coef: bpPn(x.coef), preco: x.preco === '' || x.ref_tipo === 'C' ? '' : bpPn(x.preco) })) });
      E.sujo = false;
      toast(r.msg);
      await bpCarregar(true);
      location.hash = '#/orc/composicao/' + enc(r.codigo);
    } catch (x) { toast(x.message, 1); b.disabled = false; b.textContent = 'Salvar composição'; }
  };
}
function bpItens() {
  const E = BP.ed;
  $('#bpItens').innerHTML = E.itens.length ? `<div class="bp-it bp-it-cab"><span></span><span>Item</span><span>Coef.</span><span>Preço unit.</span><span>Custo</span><span></span></div>` + E.itens.map((x, n) => {
    const r = bpRef(x);
    return `<div class="bp-it ${r.ok ? '' : 'bp-falta'} ${r.aux ? 'bp-aux' : ''}" data-n="${n}">
      <span>${bpDot(r.tipo)}</span>
      <span class="bp-it-d"><b>${esc(r.descricao)}</b><small><code>${esc(r.codigo)}</code> · ${esc(r.unidade)}${r.aux ? ' · composição auxiliar' : ''}${!r.ok ? ' · <b>sem cadastro</b>' : ''}${r.ok && r.ativo === false ? ' · inativo' : ''}</small></span>
      <label class="bp-it-c"><small>Coef.</small><input data-c="coef" inputmode="decimal" value="${esc(x.coef)}" aria-label="Coeficiente"></label>
      <label class="bp-it-p ${r.proprio ? 'proprio' : ''}"><small>Preço</small>${r.aux ? `<span class="bp-mono">${bpM(r.unit)}</span>` : `<input data-c="preco" inputmode="decimal" value="${esc(x.preco)}" placeholder="${esc(bpV(Math.round((r.cadastro || 0) * 10000) / 10000))}" title="Vazio = preço do cadastro (${bpM(r.cadastro)}). Preencha para um preço só desta composição." aria-label="Preço próprio">`}</label>
      <span class="bp-it-s bp-mono" data-s>${bpM(bpPn(x.coef) * r.unit)}</span>
      <span class="bp-it-a"><button type="button" class="icbtn" data-a="sobe" title="Subir" ${n ? '' : 'disabled'}>${ic('up')}</button><button type="button" class="icbtn" data-a="desce" title="Descer" ${n < E.itens.length - 1 ? '' : 'disabled'}>${ic('down')}</button><button type="button" class="icbtn bp-x" data-a="tira" title="Tirar">${ic('x')}</button></span></div>`;
  }).join('') : `<div class="bp-itens-vazio">${ic('layers')}<b>Nenhum item ainda</b><small>Busque acima o insumo (ex: “meio-fio”, “PAV007”) ou cole as linhas do Excel. O custo aparece ao lado na hora.</small></div>`;
  $$('#bpItens .bp-it[data-n]').forEach(el => {
    const n = +el.dataset.n;
    $$('input[data-c]', el).forEach(i => { i.oninput = () => {
      E.itens[n][i.dataset.c] = i.value; E.sujo = true;
      const r = bpRef(E.itens[n]);
      $('[data-s]', el).textContent = bpM(bpPn(E.itens[n].coef) * r.unit);
      if (i.dataset.c === 'preco') i.closest('label').classList.toggle('proprio', i.value.trim() !== '');
      bpResumo();
    }; });
    $$('[data-a]', el).forEach(b => { b.onclick = () => {
      const a = b.dataset.a, l = E.itens;
      if (a === 'tira') l.splice(n, 1);
      else { const m = a === 'sobe' ? n - 1 : n + 1; [l[n], l[m]] = [l[m], l[n]]; }
      E.sujo = true; bpItens(); bpResumo();
    }; });
  });
}
function bpResumo() {
  const E = BP.ed, cu = bpCustoItens(E.itens), un = $('#bpEd')?.unidade.value || 'un';
  const props = E.itens.filter(x => x.ref_tipo !== 'C' && String(x.preco).trim() !== '').length;
  $('#bpResumo').innerHTML = `<div class="bp-res-top">${bpDonut(cu)}<div><small>Custo unitário</small><b class="bp-mono">${bpM(cu.total)}</b><small>por ${esc(un)}</small></div></div>
    <div class="bp-res-cats">${BP_K.map(([k, n]) => `<div class="${cu[k] ? '' : 'zero'}"><i class="bp-dot k-${k}"></i><span>${n}</span><b class="bp-mono">${bpM(cu[k])}</b><small>${bpPct(cu[k], cu.total)}</small></div>`).join('')}</div>
    <small class="bp-res-n">${plural(E.itens.length, 'item', 'itens')}${props ? ` · ${plural(props, 'preço próprio', 'preços próprios')}` : ''}</small>
    <button class="btn full bp-ac" id="bpSalvar" ${E.itens.length ? '' : 'disabled'}>${ic('check')} Salvar composição</button>`;
}
function bpIncluir(t, ref) {
  const E = BP.ed;
  const ja = E.itens.findIndex(x => x.ref_tipo === t && x.ref === ref);
  if (ja >= 0) { toast('Este item já está na composição: ajuste o coeficiente.'); }
  else { E.itens.push({ ref_tipo: t, ref, coef: '1', preco: '' }); E.sujo = true; }
  bpItens(); bpResumo();
  const n = ja >= 0 ? ja : E.itens.length - 1, inp = $(`#bpItens .bp-it[data-n="${n}"] input[data-c="coef"]`);
  if (inp) { inp.focus(); inp.select(); inp.closest('.bp-it').classList.add('novo'); }
}
function bpBuscaLigar(proprio) {
  const inp = $('#bpBusca'), res = $('#bpRes');
  let sel = 0, lista = [];
  const desenhar = () => {
    const t = norm(inp.value).split(/\s+/).filter(Boolean);
    if (!t.length) { res.hidden = true; return; }
    const ok = s => t.every(x => s.includes(x));
    lista = [...BP.d.insumos.filter(i => i.ativo && ok(norm(i.codigo + ' ' + i.descricao + ' ' + i.grupo))).map(i => ({ t: 'I', o: i })),
      ...BP.d.composicoes.filter(c => c.ativo && c.codigo !== proprio && ok(norm(c.codigo + ' ' + c.descricao + ' ' + c.grupo))).map(c => ({ t: 'C', o: c }))]
      .sort((a, b) => (norm(b.o.codigo) === t.join(' ') ? 1 : 0) - (norm(a.o.codigo) === t.join(' ') ? 1 : 0)).slice(0, 30);
    sel = 0;
    res.innerHTML = lista.map((x, n) => `<button type="button" class="bp-op ${n === sel ? 'on' : ''}" data-n="${n}">${bpDot(x.t === 'C' ? 'Composição' : x.o.tipo)}<span><b>${esc(x.o.descricao)}</b><small><code>${esc(x.o.codigo)}</code> · ${esc(x.o.unidade)}${x.t === 'C' ? ' · composição' : ' · ' + esc(x.o.tipo)}</small></span><span class="bp-mono">${bpM(x.t === 'C' ? x.o.custo.total : x.o.preco)}</span></button>`).join('')
      + `<button type="button" class="bp-op bp-op-novo" data-n="novo">${ic('plus')}<span><b>Cadastrar insumo “${esc(inp.value.trim())}”</b><small>abre o cadastro e já inclui na composição</small></span></button>`;
    res.hidden = false;
    $$('.bp-op', res).forEach(b => { b.onmousedown = e => e.preventDefault(); b.onclick = () => escolher(b.dataset.n); });
  };
  const escolher = n => {
    if (n === 'novo' || (n == null && !lista.length)) { const d = inp.value.trim(); inp.value = ''; res.hidden = true; return bpInsumoModal({ descricao: d }, novo => bpIncluir('I', novo)); }
    const x = lista[+n];
    if (!x) return;
    inp.value = ''; res.hidden = true;
    bpIncluir(x.t, x.o.codigo);
  };
  // fechar a lista ao sair do campo, mas sem atropelar quem voltou a digitar logo em seguida
  let tFecha;
  inp.oninput = () => { clearTimeout(tFecha); desenhar(); };
  inp.onfocus = () => { clearTimeout(tFecha); desenhar(); };
  inp.onblur = () => { tFecha = setTimeout(() => { res.hidden = true; }, 150); };
  inp.onkeydown = e => {
    if (res.hidden) return;
    const ops = $$('.bp-op', res);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + ops.length) % ops.length; ops.forEach((b, i) => b.classList.toggle('on', i === sel)); ops[sel].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(ops[sel]?.dataset.n); }
    else if (e.key === 'Escape') { res.hidden = true; }
  };
}
/* linhas copiadas do Excel: código ⇥ coeficiente (⇥ preço próprio, opcional) */
function bpColarItens() {
  modal('Colar itens do Excel', `<p><small>Uma linha por item: <b>código</b>, <b>coeficiente</b> e, se quiser, um <b>preço só desta composição</b> (colunas separadas por tabulação, como sai do Excel, ou por ponto e vírgula).</small></p>
    <textarea name="txt" rows="8" placeholder="PAV007\t1\nAPVT20KL\t0,05\n1148\t1\t16,00"></textarea><div id="bpColP"></div>`, {
    ok: 'Incluir', larga: true,
    onOk: f => {
      const { ok, falta } = ler(f.txt.value);
      if (!ok.length) throw new Error(falta.length ? 'Nenhum código encontrado na base.' : 'Cole pelo menos uma linha.');
      ok.forEach(x => { const i = BP.ed.itens.find(y => y.ref_tipo === x.ref_tipo && y.ref === x.ref); if (i) Object.assign(i, x); else BP.ed.itens.push(x); });
      BP.ed.sujo = true; bpItens(); bpResumo();
      toast(plural(ok.length, 'item incluído', 'itens incluídos') + (falta.length ? ' · não achei: ' + falta.join(', ') : '.'), falta.length > 0);
    }
  });
  const ler = txt => {
    const ok = [], falta = [];
    txt.split(/\r?\n/).map(l => l.split(/\t|;/).map(s => s.trim())).filter(l => l[0]).forEach(([cod, coef, preco]) => {
      const k = Object.keys(BP.I).find(x => norm(x) === norm(cod)), kc = !k && Object.keys(BP.C).find(x => norm(x) === norm(cod));
      if (k) ok.push({ ref_tipo: 'I', ref: k, coef: coef || '1', preco: preco || '' });
      else if (kc) ok.push({ ref_tipo: 'C', ref: kc, coef: coef || '1', preco: '' });
      else falta.push(cod);
    });
    return { ok, falta };
  };
  $('#modal textarea').oninput = e => { const { ok, falta } = ler(e.target.value); $('#bpColP').innerHTML = e.target.value.trim() ? `<small>${plural(ok.length, 'item reconhecido', 'itens reconhecidos')}${falta.length ? ` · <b class="atrasado">não encontrados: ${esc(falta.join(', '))}</b>` : ''}</small>` : ''; };
}

/* ---------- insumos ---------- */
async function vBaseIns(qs) {
  titulo('Insumos');
  if (!baseNivel()) return bpSem();
  const D = await bpCarregar(), p = new URLSearchParams(qs || ''), g = bpGere();
  const F = BP.fi = Object.assign({ q: '', tipo: '', grupo: '', f: '', ord: 'desc', lim: 150 }, qs ? {} : BP.fi || {});
  ['q', 'tipo', 'grupo', 'f'].forEach(k => { if (p.has(k)) F[k] = p.get(k); });
  F.lim = 150;
  const grupos = [...new Set(D.insumos.map(i => i.grupo).filter(Boolean))].sort();
  const ESP = { velhos: ['Preço com mais de 6 meses', i => (bpDias(i.data_preco) ?? 9999) > 180], sem_uso: ['Sem uso em composição', i => !i.usos], inativos: ['Inativos', i => !i.ativo] };
  bpTela('ins', `<div class="cab"><h2>Insumos</h2><span class="contagem" id="bpN"></span>
      <span class="acoes"><button class="btn sec peq" id="bpCsv">${ic('download')} Exportar</button>${g ? `<button class="btn sec peq" id="bpReaj">${ic('percent')} Reajustar</button><button class="btn sec peq" id="bpCola">${ic('paste')} Colar preços</button><button class="btn peq" id="bpNovo">${ic('plus')} Novo</button>` : ''}</span></div>
    <div class="bp-filtros"><div class="busca">${ic('search')}<input type="search" id="bpQ" data-busca placeholder="Buscar por código ou descrição  ( / )" value="${esc(F.q)}"></div>
      ${grupos.length ? `<select id="bpGrp"><option value="">Todos os grupos</option>${grupos.map(x => `<option ${F.grupo === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}
      <select id="bpOrd">${[['desc', 'Descrição'], ['cod', 'Código'], ['maior', 'Maior preço'], ['usos', 'Mais usados'], ['velho', 'Preço mais antigo']].map(([v, t]) => `<option value="${v}" ${F.ord === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="chips" id="bpChips"><button class="chip ${!F.tipo ? 'on' : ''}" data-t="">Todos <b>${D.insumos.length}</b></button>
      ${BP_K.map(([k, n]) => { const q = D.insumos.filter(i => bpK(i.tipo) === k).length; return q ? `<button class="chip ${F.tipo === n ? 'on' : ''}" data-t="${n}"><i class="bp-dot k-${k}"></i> ${n} <b>${q}</b></button>` : ''; }).join('')}
      ${Object.entries(ESP).map(([k, [t, fn]]) => { const q = D.insumos.filter(fn).length; return q ? `<button class="chip bp-chip-f ${F.f === k ? 'on' : ''}" data-f="${k}">${t} <b>${q}</b></button>` : ''; }).join('')}</div>
    <div class="card bp-ins-card"><div class="bp-ins bp-ins-cab"><span></span><span>Código</span><span>Descrição</span><span>Un</span><span class="n">Preço</span><span>Data-base</span><span class="n">Usos</span></div><div id="bpLista"></div></div>
    <div class="acoes" style="justify-content:center"><button class="btn sec" id="bpMais" hidden>Mostrar mais</button></div>`);
  const filtrar = () => {
    const t = norm(F.q).split(/\s+/).filter(Boolean);
    let l = D.insumos.filter(i => (F.f === 'inativos' || i.ativo) && (!F.tipo || i.tipo === F.tipo) && (!F.grupo || i.grupo === F.grupo) && (!F.f || ESP[F.f][1](i)));
    if (t.length) l = l.filter(i => { const s = norm(i.codigo + ' ' + i.descricao + ' ' + i.grupo + ' ' + i.fonte); return t.every(x => s.includes(x)); });
    return l.sort({ desc: (a, b) => a.descricao.localeCompare(b.descricao), cod: (a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }), maior: (a, b) => b.preco - a.preco,
      usos: (a, b) => b.usos - a.usos, velho: (a, b) => String(a.data_preco || '0').localeCompare(String(b.data_preco || '0')) }[F.ord]);
  };
  const desenhar = () => {
    const l = filtrar();
    BP.filtrados = l;
    $('#bpN').textContent = plural(l.length, 'insumo', 'insumos');
    $('#bpLista').innerHTML = l.slice(0, F.lim).map(i => `<button type="button" class="bp-ins ${i.ativo ? '' : 'inativo'}" data-ins="${esc(i.codigo)}">${bpDot(i.tipo)}<code class="bp-cod">${esc(i.codigo)}</code>
      <span class="bp-ins-d"><b>${esc(i.descricao)}</b>${i.grupo || i.fonte ? `<small>${esc([i.grupo, i.fonte].filter(Boolean).join(' · '))}</small>` : ''}</span><span class="bp-ins-u">${esc(i.unidade)}</span>
      <span class="n bp-mono"><b>${bpM(i.preco)}</b></span><span>${bpIdade(i.data_preco)}</span><span class="n bp-usos ${i.usos ? '' : 'zero'}">${i.usos}</span></button>`).join('')
      || `<p class="vazio">Nenhum insumo${F.q ? ' com “' + esc(F.q) + '”' : ''}.</p>`;
    $$('#bpLista [data-ins]').forEach(b => { b.onclick = () => bpInsumoModal(BP.I[b.dataset.ins]); });
    $('#bpMais').hidden = l.length <= F.lim;
  };
  let tm;
  $('#bpQ').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { F.q = e.target.value; F.lim = 150; desenhar(); }, 120); };
  $('#bpOrd').onchange = e => { F.ord = e.target.value; desenhar(); };
  if ($('#bpGrp')) $('#bpGrp').onchange = e => { F.grupo = e.target.value; desenhar(); };
  $$('#bpChips .chip').forEach(b => { b.onclick = () => {
    if (b.dataset.f) F.f = F.f === b.dataset.f ? '' : b.dataset.f; else { F.tipo = b.dataset.t; }
    $$('#bpChips .chip').forEach(x => x.classList.toggle('on', x.dataset.f ? x.dataset.f === F.f : x.dataset.t === F.tipo));
    F.lim = 150; desenhar();
  }; });
  $('#bpMais').onclick = () => { F.lim += 150; desenhar(); };
  $('#bpCsv').onclick = () => bpCsv(`insumos_${hoje()}.csv`, ['Código', 'Descrição', 'Un', 'Tipo', 'Grupo', 'Preço (R$)', 'Data-base', 'Fonte', 'Usado em', 'Ativo'],
    filtrar().map(i => [i.codigo, i.descricao, i.unidade, i.tipo, i.grupo || '', i.preco, i.data_preco ? fd(i.data_preco) : '', i.fonte || '', i.usos, i.ativo ? 'Sim' : 'Não']));
  if (g) {
    $('#bpNovo').onclick = () => bpInsumoModal();
    $('#bpReaj').onclick = () => bpReajuste(filtrar());
    $('#bpCola').onclick = () => bpColarPrecos();
  }
  desenhar();
}
function bpInsumoModal(i, depois) {
  const g = bpGere(), novo = !i || !i.codigo, D = BP.d;
  const usado = novo ? [] : D.composicoes.filter(c => c.itens.some(x => x.ref_tipo !== 'C' && x.ref === i.codigo));
  const grupos = [...new Set(D.insumos.map(x => x.grupo).filter(Boolean))].sort();
  const unidades = [...new Set([...D.unidades, ...D.insumos.map(x => x.unidade)].filter(Boolean))].sort();
  const cab = novo ? 'Novo insumo' : `${bpDot(i.tipo)} <code class="bp-cod">${esc(i.codigo)}</code>`;
  const leitura = !novo && !g ? `<div class="bp-ins-ver"><b>${esc(i.descricao)}</b><div class="bp-ins-preco"><b class="bp-mono">${bpM(i.preco)}</b><small>por ${esc(i.unidade)} · ${esc(i.tipo)}</small>${bpIdade(i.data_preco)}</div>
      <dl class="kv">${i.grupo ? `<dt>Grupo</dt><dd>${esc(i.grupo)}</dd>` : ''}${i.fonte ? `<dt>Fonte</dt><dd>${esc(i.fonte)}</dd>` : ''}${i.obs ? `<dt>Obs.</dt><dd>${esc(i.obs)}</dd>` : ''}</dl></div>` : '';
  const form = g ? `<div class="bp-tipos">${BP_K.map(([k, n]) => `<label class="k-${k}"><input type="radio" name="tipo" value="${n}" ${(i?.tipo || 'Material') === n ? 'checked' : ''}><span><i class="bp-dot k-${k}"></i>${n}</span></label>`).join('')}</div>
      <div class="bp-g3">${novo ? `<label>Código<input name="codigo" placeholder="automático (INS-…)" autocomplete="off"></label>` : ''}<label class="${novo ? 'bp-span2' : 'bp-span3'}">Descrição<input name="descricao" required value="${esc(i?.descricao || '')}"></label></div>
      <div class="bp-g3"><label>Unidade<input name="unidade" required list="bpUnI" value="${esc(i?.unidade || '')}"></label>
        <label>Preço (R$)<input name="preco" required inputmode="decimal" value="${esc(bpV(i?.preco ?? ''))}" placeholder="0,00"></label>
        <label>Data-base do preço<input name="data_preco" type="date" value="${esc(i?.data_preco || hoje())}"></label></div>
      <div class="g2"><label>Grupo<input name="grupo" list="bpGrI" value="${esc(i?.grupo || '')}" placeholder="ex: Tubos e conexões"></label><label>Fonte do preço<input name="fonte" value="${esc(i?.fonte || '')}" placeholder="ex: cotação Tubos Sul, SINAPI 09/2026"></label></div>
      <label>Observações<input name="obs" value="${esc(i?.obs || '')}"></label>
      ${novo ? '' : `<label class="ck"><input type="checkbox" name="ativo" ${i.ativo ? 'checked' : ''}> Ativo (inativo não aparece para incluir em composições)</label>`}
      <datalist id="bpUnI">${unidades.map(u => `<option value="${esc(u)}">`).join('')}</datalist><datalist id="bpGrI">${grupos.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : '';
  const extra = novo ? '' : `<div class="bp-hist"><h3>${ic('chart')} Histórico do preço</h3><div id="bpHist"><div class="carregando"><span class="spin"></span></div></div></div>
    <div><h3>${ic('layers')} Usado em ${plural(usado.length, 'composição', 'composições')}</h3>${usado.map(c => { const x = c.itens.find(y => y.ref === i.codigo); return `<a class="bp-linha" href="#/orc/composicao/${enc(c.codigo)}"><span><b>${esc(c.descricao)}</b><small><code>${esc(c.codigo)}</code> · coef. ${bpN(x.coef)}${bpProprio(x) ? ' · preço próprio ' + bpM(x.preco) : ''}</small></span><span class="bp-mono">${bpM(c.custo.total)}<small>/${esc(c.unidade)}</small></span></a>`; }).join('') || '<small>Ainda não está em nenhuma composição.</small>'}
      ${g && !usado.length ? `<button type="button" class="btn sec bp-x peq" id="bpExcluirI" style="margin-top:10px">${ic('trash')} Excluir insumo</button>` : ''}</div>`;
  const f = modal(cab, `${leitura}${form}${extra}`, {
    ok: novo ? 'Cadastrar' : 'Salvar', larga: !novo, semRodape: !g,
    onOk: async f => {
      const r = await api('base_insumo_salvar', { insumo: { original: novo ? '' : i.codigo, codigo: f.codigo?.value, descricao: f.descricao.value, unidade: f.unidade.value, tipo: f.tipo.value,
        preco: bpPn(f.preco.value), data_preco: f.data_preco.value, grupo: f.grupo.value, fonte: f.fonte.value, obs: f.obs.value, ativo: f.ativo ? f.ativo.checked : true } });
      toast(r.msg);
      await bpCarregar(true);
      if (depois) depois(r.codigo); else rotear();
    }
  });
  if (!novo) {
    api('base_insumo_historico', { codigo: i.codigo }).then(r => { const el = $('#bpHist'); if (el) el.innerHTML = bpHistorico(r.historico, i); }).catch(e => { const el = $('#bpHist'); if (el) el.innerHTML = `<small>${esc(e.message)}</small>`; });
    const x = $('#bpExcluirI');
    if (x) x.onclick = async () => { if (!confirm(`Excluir o insumo ${i.codigo} · ${i.descricao}?`)) return; try { toast((await api('base_insumo_excluir', { codigo: i.codigo })).msg); fecharModal(); await bpCarregar(true); rotear(); } catch (e) { toast(e.message, 1); } };
  }
  return f;
}
function bpHistorico(h, i) {
  if (!h.length) return '<small>Sem registro de mudança de preço.</small>';
  const pts = h.slice().reverse().map(x => x.para), mn = Math.min(...pts), mx = Math.max(...pts), W = 300, H = 56;
  const xy = pts.map((v, n) => [pts.length > 1 ? n / (pts.length - 1) * W : W / 2, mx === mn ? H / 2 : H - 6 - (v - mn) / (mx - mn) * (H - 12)]);
  const var1 = h.length > 1 && h[h.length - 1].para ? (h[0].para / h[h.length - 1].para - 1) * 100 : 0;
  return `${pts.length > 1 ? `<div class="bp-spark"><svg viewBox="-4 0 ${W + 8} ${H}" preserveAspectRatio="none"><polyline points="${xy.map(p => p.join(',')).join(' ')}"/>${xy.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3"/>`).join('')}</svg>
      <small>${bpM(pts[0])} → <b>${bpM(pts[pts.length - 1])}</b> <span class="${var1 > 0 ? 'atrasado' : 'ct-ok'}">${var1 > 0 ? '+' : ''}${var1.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span> desde o primeiro registro</small></div>` : ''}
    <div class="bp-hist-l">${h.slice(0, 12).map(x => { const d = x.de === '' || !x.de ? null : (x.para / x.de - 1) * 100;
      return `<div><span>${fd(x.data)}</span><span class="bp-mono">${x.de === '' ? '' : bpM(x.de) + ' → '}<b>${bpM(x.para)}</b></span><span class="${d > 0 ? 'atrasado' : d < 0 ? 'ct-ok' : ''}">${d == null ? 'inicial' : (d > 0 ? '+' : '') + d.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'}</span><small>${esc(x.origem || '')}${x.usuario ? ' · ' + esc(x.usuario) : ''}</small></div>`; }).join('')}</div>`;
}
function bpReajuste(lista) {
  if (!lista.length) return toast('Nenhum insumo na lista filtrada.', 1);
  const novo = (p, pct) => Math.round(p * (1 + pct / 100) * 100) / 100;
  modal(`${ic('percent')} Reajustar preços`, `<div class="aviso info">Vale para os <b>${plural(lista.length, 'insumo', 'insumos')}</b> da lista filtrada. Use os filtros (tipo, grupo, busca) antes para reajustar só uma parte.</div>
    <div class="bp-g3"><label>Reajuste (%)<input name="pct" inputmode="decimal" required placeholder="ex: 5 ou -3,5" autocomplete="off"></label><label>Data-base dos novos preços<input name="data" type="date" value="${hoje()}"></label><label>Motivo (histórico)<input name="origem" value="Reajuste"></label></div>
    <div id="bpPrev"></div>`, {
    ok: 'Aplicar reajuste', larga: true,
    onOk: async f => {
      const pct = bpPn(f.pct.value);
      if (!pct) throw new Error('Informe o percentual (ex: 5 ou -3,5).');
      if (!confirm(`Aplicar ${pct > 0 ? '+' : ''}${pct.toLocaleString('pt-BR')}% em ${plural(lista.length, 'insumo', 'insumos')}?`)) return false;
      const r = await api('base_precos', { itens: lista.map(i => ({ codigo: i.codigo, preco: novo(i.preco, pct) })), data_preco: f.data.value, origem: `${f.origem.value || 'Reajuste'} ${pct > 0 ? '+' : ''}${pct.toLocaleString('pt-BR')}%` });
      toast(r.msg);
      await bpCarregar(true); rotear();
    }
  });
  const prev = () => {
    const pct = bpPn($('#modal [name=pct]').value);
    $('#bpPrev').innerHTML = pct ? `<table class="tab bp-tab"><thead><tr><th>Insumo</th><th class="n">Hoje</th><th class="n">Novo</th></tr></thead><tbody>${lista.slice(0, 8).map(i => `<tr><td>${bpDot(i.tipo)} ${esc(i.descricao)} <small><code>${esc(i.codigo)}</code></small></td><td class="n bp-mono">${bpM(i.preco)}</td><td class="n bp-mono"><b>${bpM(novo(i.preco, pct))}</b></td></tr>`).join('')}</tbody></table>${lista.length > 8 ? `<small>+${lista.length - 8} insumos</small>` : ''}` : '';
  };
  $('#modal [name=pct]').oninput = prev;
}
function bpColarPrecos() {
  const ler = txt => {
    const ok = [], falta = [];
    txt.split(/\r?\n/).map(l => l.split(/\t|;/).map(s => s.trim())).filter(l => l[0] && l.length > 1).forEach(([cod, ...r]) => {
      const i = BP.d.insumos.find(x => norm(x.codigo) === norm(cod)), p = bpPn(r.filter(Boolean).pop());
      if (i && p >= 0) ok.push({ i, preco: p }); else falta.push(cod);
    });
    return { ok, falta };
  };
  modal(`${ic('paste')} Colar preços do Excel`, `<p><small>Cole duas colunas: <b>código do insumo</b> e <b>preço novo</b> (ex: a resposta de uma cotação). Os outros insumos não mudam.</small></p>
    <textarea name="txt" rows="8" placeholder="PAV007\t28,50\nAPVT20KL\t24,90"></textarea>
    <div class="g2"><label>Data-base<input name="data" type="date" value="${hoje()}"></label><label>Origem (histórico)<input name="origem" value="Preços colados" placeholder="ex: cotação Tubos Sul"></label></div><div id="bpPrev"></div>`, {
    ok: 'Atualizar preços', larga: true,
    onOk: async f => {
      const { ok } = ler(f.txt.value);
      if (!ok.length) throw new Error('Nenhum código da base encontrado.');
      const r = await api('base_precos', { itens: ok.map(x => ({ codigo: x.i.codigo, preco: x.preco })), data_preco: f.data.value, origem: f.origem.value });
      toast(r.msg);
      await bpCarregar(true); rotear();
    }
  });
  $('#modal textarea').oninput = e => {
    const { ok, falta } = ler(e.target.value);
    $('#bpPrev').innerHTML = ok.length || falta.length ? `<table class="tab bp-tab"><thead><tr><th>Insumo</th><th class="n">Hoje</th><th class="n">Novo</th><th class="n">Variação</th></tr></thead><tbody>${ok.slice(0, 30).map(x => { const d = x.i.preco ? (x.preco / x.i.preco - 1) * 100 : 0;
      return `<tr><td>${bpDot(x.i.tipo)} ${esc(x.i.descricao)} <small><code>${esc(x.i.codigo)}</code></small></td><td class="n bp-mono">${bpM(x.i.preco)}</td><td class="n bp-mono"><b>${bpM(x.preco)}</b></td><td class="n ${d > 0.05 ? 'atrasado' : d < -0.05 ? 'ct-ok' : ''}">${d > 0 ? '+' : ''}${d.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td></tr>`; }).join('')}</tbody></table>
      ${falta.length ? `<div class="aviso warn">Não encontrados na base: ${esc(falta.join(', '))}</div>` : ''}` : '';
  };
}

/* ---------- importação do RDObras ---------- */
const BP_XLSX = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
function bpScript(u) {
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = u; s.onload = ok; s.onerror = () => no(new Error('Não consegui carregar o leitor de planilhas. Confira a internet e tente de novo.')); document.head.appendChild(s); });
}
async function vBaseImportar() {
  titulo('Importar do RDObras');
  if (!bpGere()) return bpSem('Gerir');
  await bpCarregar();
  BP.imp = { abas: null, nome: '', plano: null, data: hoje(), atualizar: true };
  bpTela('imp', `<div class="bp-hero bp-hero-imp"><div class="bp-hero-t"><span class="bp-selo">${ic('upload')} Importação</span><h2>Trazer composições do RDObras</h2>
      <p>Use a planilha exportada do RDObras: a aba <b>Composições</b> (Item, Tipo, Código, Descrição, Un, Quant. e Custo unitário). Se a aba do orçamento vier junto, cada composição já entra com o nome da etapa. Nada é gravado antes de você conferir.</p></div>
      <ol class="bp-passos" id="bpPassos"><li class="on"><b>1</b>Arquivo</li><li><b>2</b>Conferir</li><li><b>3</b>Pronto</li></ol></div>
    <div id="bpImp"></div>`);
  bpImpArquivo();
}
const bpPasso = n => $$('#bpPassos li').forEach((l, i) => { l.classList.toggle('on', i === n); l.classList.toggle('feito', i < n); });
function bpImpArquivo() {
  bpPasso(0);
  const M = BP.imp;
  $('#bpImp').innerHTML = `<label class="bp-drop" id="bpDrop"><input type="file" id="bpArq" accept=".xlsx,.xlsm,.xls,.csv" hidden>
      ${ic('upload')}<b>Arraste a planilha aqui ou toque para escolher</b><small>.xlsx, .xls ou .csv · lida no seu aparelho, só os dados vão para o servidor</small></label>
    <details class="card bp-colar"><summary>${ic('paste')} Ou cole as linhas copiadas do Excel</summary>
      <textarea id="bpTxt" rows="7" placeholder="Copie no Excel a aba Composições inteira (com a linha de títulos) e cole aqui"></textarea><button type="button" class="btn sec" id="bpTxtOk">Conferir as linhas coladas</button></details>
    <div class="card bp-opc"><h3>Opções</h3><div class="g2"><label>Data-base dos preços importados<input type="date" id="bpData" value="${esc(M.data)}"></label>
      <label class="ck" style="align-self:end"><input type="checkbox" id="bpAtu" ${M.atualizar ? 'checked' : ''}> Atualizar os insumos e as composições que já existem na base (mesmo código)</label></div></div>`;
  const drop = $('#bpDrop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('sobre'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('sobre'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) bpImpLer(f); });
  $('#bpArq').onchange = e => { const f = e.target.files[0]; if (f) bpImpLer(f); };
  $('#bpData').onchange = e => { M.data = e.target.value; };
  $('#bpAtu').onchange = e => { M.atualizar = e.target.checked; };
  $('#bpTxtOk').onclick = () => {
    const t = $('#bpTxt').value;
    if (!t.trim()) return toast('Cole as linhas da planilha.', 1);
    M.nome = 'linhas coladas';
    M.abas = [{ nome: 'Colado', linhas: t.split(/\r?\n/).map(l => l.split('\t').map(s => { const v = s.trim(); return /^-?[\d.]+(,\d+)?$/.test(v) ? bpPn(v) : v; })) }];
    bpImpConferir();
  };
}
async function bpImpLer(f) {
  const M = BP.imp;
  $('#bpImp').innerHTML = `<div class="card bp-lendo"><span class="spin"></span><b>Lendo ${esc(f.name)}…</b></div>`;
  try {
    if (!window.XLSX) await bpScript(BP_XLSX);
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    M.nome = f.name;
    M.abas = wb.SheetNames.map(n => ({ nome: n, linhas: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }).slice(0, 6000).map(r => r.slice(0, 24)) }))
      .map(a => { while (a.linhas.length && a.linhas[a.linhas.length - 1].every(x => x === '')) a.linhas.pop(); return a; });
    await bpImpConferir();
  } catch (e) { toast(e.message, 1); bpImpArquivo(); }
}
const BP_ST = { novo: ['novo', 'ok'], nova: ['nova', 'ok'], atualizar: ['atualizar', 'atu'], igual: ['igual', 'igual'], manter: ['mantém a base', 'igual'] };
const bpSt = s => `<span class="bp-st k-${(BP_ST[s] || [s, ''])[1]}">${(BP_ST[s] || [s])[0]}</span>`;
async function bpImpConferir() {
  const M = BP.imp;
  $('#bpImp').innerHTML = `<div class="card bp-lendo"><span class="spin"></span><b>Conferindo ${esc(M.nome)}…</b></div>`;
  try { M.plano = await api('base_importar', { abas: M.abas, atualizar: M.atualizar }); }
  catch (e) { toast(e.message, 1); return bpImpArquivo(); }
  bpPasso(1);
  const P = M.plano, R = P.resumo, grava = R.comp_novas + R.comp_atualizar + R.insumos_novos + R.insumos_atualizar;
  const tile = (n, t, s, cl) => `<div class="bp-tile ${cl || ''} ${n ? '' : 'zero'}"><b>${n}</b><span>${t}</span>${s ? `<small>${s}</small>` : ''}</div>`;
  $('#bpImp').innerHTML = `<div class="card"><div class="bp-h"><h3>${ic('file')} ${esc(M.nome)} <small>aba “${esc(R.aba)}”${R.etapas ? ` · ${plural(R.etapas, 'etapa', 'etapas')} do orçamento` : ''}</small></h3><button type="button" class="linkbtn" id="bpOutro">Escolher outro arquivo</button></div>
      <div class="bp-tiles">${tile(R.comp_novas, 'composições novas', '', 'ok')}${tile(R.comp_atualizar, 'composições a atualizar', 'mesmo código já na base', 'atu')}${tile(R.insumos_novos, 'insumos novos', '', 'ok')}${tile(R.insumos_atualizar, 'insumos a atualizar', 'preço ou descrição mudou', 'atu')}
        ${tile(R.insumos_iguais + R.insumos_manter + R.comp_manter, 'sem mudança', 'já estão iguais na base')}${tile(R.comp_repetidas, 'repetidas no arquivo', 'mesmo serviço em outro item: entra uma vez')}${tile(R.precos_proprios, 'preços próprios', 'item com preço diferente do cadastro')}${tile(R.diferencas, 'custos diferentes', 'planilha × calculado', R.diferencas ? 'warn' : '')}</div>
      ${P.avisos.length ? `<details class="bp-avisos" ${P.avisos.length <= 6 ? 'open' : ''}><summary>${ic('alert')} ${plural(P.avisos.length, 'observação', 'observações')}</summary><ul>${P.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul></details>` : ''}</div>
    <div class="card"><div class="bp-seg" id="bpAba"><button type="button" data-a="c" class="on">${ic('layers')} Composições <b>${P.composicoes.length}</b></button><button type="button" data-a="i">${ic('box')} Insumos <b>${P.insumos.length}</b></button></div>
      <div class="rolar" id="bpTab"></div></div>
    <div class="barra-acoes"><div class="acoes"><button class="btn sec" id="bpVolta">${ic('back')} Voltar</button><button class="btn bp-ac" id="bpGo" ${grava ? '' : 'disabled'}>${ic('check')} ${grava ? `Importar ${plural(R.comp_novas + R.comp_atualizar, 'composição', 'composições')} e ${plural(R.insumos_novos + R.insumos_atualizar, 'insumo', 'insumos')}` : 'Nada para importar: a base já está igual'}</button></div></div>`;
  const tabC = () => `<table class="tab bp-tab"><thead><tr><th></th><th>Item</th><th>Código</th><th>Descrição</th><th>Un</th><th class="n">Itens</th><th class="n">Planilha</th><th class="n">Calculado</th></tr></thead><tbody>
    ${P.composicoes.map(c => `<tr class="${c.aviso ? 'bp-dif' : ''}"><td>${bpSt(c.status)}</td><td>${esc(c.item)}${c.repetidas.length ? `<br><small>+${esc(c.repetidas.join(', '))}</small>` : ''}</td><td><code>${esc(c.codigo)}</code>${c.variante ? ' <span class="bp-flag">variante</span>' : ''}</td>
      <td><b>${esc(c.descricao)}</b>${c.grupo ? `<br><small>${esc(c.grupo)}</small>` : ''}${c.aviso ? `<br><small class="atrasado">${esc(c.aviso)}</small>` : ''}</td><td>${esc(c.unidade)}</td><td class="n">${c.n_itens}${c.proprios ? `<br><small>${c.proprios} próprio${c.proprios > 1 ? 's' : ''}</small>` : ''}</td>
      <td class="n bp-mono">${c.unit_planilha === '' ? '—' : bpM(c.unit_planilha)}</td><td class="n bp-mono"><b>${bpM(c.unit_calc)}</b> ${c.aviso ? ic('alert') : `<span class="ct-ok">${ic('check')}</span>`}</td></tr>`).join('')}</tbody></table>`;
  const tabI = () => `<table class="tab bp-tab"><thead><tr><th></th><th>Código</th><th>Descrição</th><th>Un</th><th>Tipo</th><th class="n">Preço</th></tr></thead><tbody>
    ${P.insumos.map(i => `<tr><td>${bpSt(i.status)}</td><td><code>${esc(i.codigo)}</code>${i.gerado ? ' <span class="bp-flag" title="a planilha não tinha código">código novo</span>' : ''}</td><td>${esc(i.descricao)}${i.divergentes ? `<br><small>${plural(i.divergentes, 'composição usa', 'composições usam')} outro preço (fica como preço próprio)</small>` : ''}</td>
      <td>${esc(i.unidade)}</td><td>${bpDot(i.tipo)} ${esc(i.tipo)}</td><td class="n bp-mono">${i.status === 'atualizar' || i.status === 'manter' ? `<small>${bpM(i.preco_atual)} → </small>` : ''}<b>${bpM(i.status === 'manter' ? i.preco_atual : i.preco)}</b></td></tr>`).join('')}</tbody></table>`;
  const aba = a => { $$('#bpAba button').forEach(b => b.classList.toggle('on', b.dataset.a === a)); $('#bpTab').innerHTML = a === 'c' ? tabC() : tabI(); };
  $$('#bpAba button').forEach(b => { b.onclick = () => aba(b.dataset.a); });
  aba('c');
  $('#bpOutro').onclick = $('#bpVolta').onclick = () => bpImpArquivo();
  $('#bpGo').onclick = async () => {
    const b = $('#bpGo'); b.disabled = true; b.textContent = 'Importando…';
    try {
      const r = await api('base_importar', { abas: M.abas, atualizar: M.atualizar, aplicar: true, data_preco: M.data, fonte: ('RDObras · ' + M.nome).slice(0, 80) });
      await bpCarregar(true);
      bpImpPronto(r);
    } catch (e) { toast(e.message, 1); b.disabled = false; b.textContent = 'Tentar de novo'; }
  };
}
function bpImpPronto(r) {
  bpPasso(2);
  const R = r.resumo;
  $('#bpImp').innerHTML = `<div class="card bp-pronto"><span class="bp-ok">${ic('check')}</span><h2>Base atualizada</h2><p>${esc(r.msg)}</p>
    <div class="bp-tiles">${[[R.comp_novas + R.comp_atualizar, 'composições'], [R.insumos_novos + R.insumos_atualizar, 'insumos'], [R.precos_proprios, 'preços próprios']].map(([n, t]) => `<div class="bp-tile ok"><b>${n}</b><span>${t}</span></div>`).join('')}</div>
    <div class="acoes" style="justify-content:center"><a class="btn bp-ac" href="#/orc/composicoes">${ic('layers')} Ver composições</a><a class="btn sec" href="#/orc/insumos">${ic('box')} Ver insumos</a><button class="btn sec" id="bpDeNovo">${ic('upload')} Importar outra</button></div></div>`;
  $('#bpDeNovo').onclick = () => vBaseImportar();
}

ROTAS.push(
  [/^#\/orc$/, vBase], [/^#\/orc\/composicoes(?:\?(.*))?$/, vBaseComps], [/^#\/orc\/insumos(?:\?(.*))?$/, vBaseIns], [/^#\/orc\/importar$/, vBaseImportar],
  [/^#\/orc\/composicao\/nova$/, () => vBaseEditor()], [/^#\/orc\/composicao\/(.+)\/editar$/, vBaseEditor], [/^#\/orc\/composicao\/(.+)$/, vBaseComp]
);
