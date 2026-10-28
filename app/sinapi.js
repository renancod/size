'use strict';
/* =====================================================================
 * SINAPI (Caixa) — referência oficial ao lado da base de preços da Size (servidor: Sinapi.gs).
 *  - Tela #/orc/sinapi: mês importado, aviso de mês novo, importar (buscar na Caixa pelo servidor ou escolher o arquivo),
 *    busca de composições e insumos (sem / com desoneração), composição aberta e "copiar para a base da Size".
 *  - O arquivo da Caixa traz todas as UFs (~110 MB aberto): o app lê só o RS, calcula a divisão de cada composição em
 *    material / mão de obra / equipamento / serviço pelo analítico e manda em lotes.
 *  - sinIndice(): lista enxuta para a busca do orçamento, guardada no aparelho até mudar o mês.
 * Usa app.js (api, modal…), base.js (bpTela, bpScript, BP_XLSX, bpM…).
 * ===================================================================== */
const SIN = { info: null, ix: null, reg: 'sd', tipo: 'C', q: '' };
const SIN_JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const SIN_REG = { sd: 'Não desonerado', cd: 'Desonerado' };
const SIN_UF = 'RS';
const sinMesTxt = m => m ? m.slice(5, 7) + '/' + m.slice(0, 4) : '';
const sinCat = c => { const s = norm(c); return /mao de obra|encargos/.test(s) ? 'mo' : /equipamento/.test(s) ? 'eq' : /servico/.test(s) ? 'sv' : 'mat'; };
const sinR4 = n => Math.round((Number(n) || 0) * 10000) / 10000;

/* ---------- índice para a busca (guardado no aparelho até mudar o mês) ---------- */
function sinMontarIx(r) {
  return {
    mes: r.mes,
    C: r.composicoes.map(a => ({ codigo: a[0], descricao: a[1], unidade: a[2], grupo: a[3], situacao: a[4], sd: a[5], cd: a[6], div: { sd: a[7], cd: a[8] }, busca: norm(a[0] + ' ' + a[1] + ' ' + a[3]) })),
    I: r.insumos.map(a => ({ codigo: a[0], descricao: a[1], unidade: a[2], classe: a[3], sd: a[4], cd: a[5], busca: norm(a[0] + ' ' + a[1] + ' ' + a[3]) }))
  };
}
/* guardado no IndexedDB do aparelho (o índice tem alguns MB: não cabe com folga no armazenamento simples do navegador) */
function sinGuarda(op, valor) {
  return new Promise(ok => {
    try {
      const r = indexedDB.open('size-sinapi', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('ix');
      r.onerror = () => ok(null);
      r.onsuccess = () => {
        const t = r.result.transaction('ix', op === 'get' ? 'readonly' : 'readwrite'), s = t.objectStore('ix');
        const q = op === 'get' ? s.get('ix') : op === 'del' ? s.delete('ix') : s.put(valor, 'ix');
        q.onsuccess = () => ok(op === 'get' ? q.result || null : true);
        q.onerror = () => ok(null);
      };
    } catch (e) { ok(null); }
  });
}
async function sinIndice(forcar) {
  if (SIN.ix && !forcar) return SIN.ix;
  if (!SIN.info || forcar) SIN.info = await api('sinapi_info');
  const mes = SIN.info.mes;
  if (!mes) return (SIN.ix = { mes: '', C: [], I: [] });
  const g = forcar ? null : await sinGuarda('get');
  if (g && g.mes === mes) return (SIN.ix = sinMontarIx(g));
  const r = await api('sinapi_indice');
  await sinGuarda('put', r);
  return (SIN.ix = sinMontarIx(r));
}
/* busca: todas as palavras; primeiro o código exato, depois quem tem as palavras no começo de uma palavra
 * ("locação" não fica atrás de "colocação") */
function sinBuscar(lista, q, lim) {
  const t = norm(q).split(/\s+/).filter(Boolean), cod = q.trim();
  if (!t.length) return [];
  const pts = x => (x.codigo === cod ? 100 : 0) + t.reduce((s, w) => s + (x.busca.startsWith(w) || x.busca.includes(' ' + w) ? 2 : 0), 0);
  return lista.filter(x => t.every(w => x.busca.includes(w))).map(x => [pts(x), x]).sort((a, b) => b[0] - a[0]).slice(0, lim).map(a => a[1]);
}
/* endereço do arquivo do mês no site da Caixa (baixa pelo navegador: a Caixa recusa servidores fora do Brasil) */
const sinUrl = m => 'https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais/SINAPI-' + m + '-formato-xlsx.zip';
const SIN_PAG = 'https://www.caixa.gov.br/site/Paginas/downloads.aspx#categoria_888';
/* custo por categoria de um item do SINAPI no regime do orçamento (o mesmo do servidor) */
function sinCustos(x, tipo, reg) {
  if (tipo === 'I') { const o = { unit_mat: 0, unit_mo: 0, unit_eq: 0, unit_sv: 0 }; o['unit_' + sinCat(x.classe)] = x[reg]; return o; }
  const d = x.div[reg] || [0, 0, 0, 0];
  return { unit_mat: d[0], unit_mo: d[1], unit_eq: d[2], unit_sv: d[3] };
}

/* ---------- leitura do arquivo da Caixa (só o RS) ---------- */
async function sinLer(buf, passo) {
  if (!window.XLSX) await bpScript(BP_XLSX);
  if (!window.JSZip) await bpScript(SIN_JSZIP);
  let u8 = new Uint8Array(buf);
  passo('Abrindo o arquivo…');
  // .zip da Caixa: tira de dentro a planilha "SINAPI_Referência_aaaa_mm.xlsx"; .xlsx: usa direto
  try {
    const z = await JSZip.loadAsync(u8), ref = Object.keys(z.files).find(n => /SINAPI_Refer.*\.xlsx$/i.test(n));
    if (ref) u8 = await z.file(ref).async('uint8array');
  } catch (e) { /* não é zip comum: tenta como planilha */ }
  const ler = (nome, formulas) => {
    const wb = XLSX.read(u8, { type: 'array', sheets: [nome], cellFormula: !!formulas, cellHTML: false, cellText: false, cellStyles: false });
    const ws = wb.Sheets[nome];
    if (!ws) throw new Error('A aba "' + nome + '" não está no arquivo. É o arquivo de relatórios mensais do SINAPI (formato xlsx)?');
    return ws;
  };
  const linhas = ws => XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  const num = v => (typeof v === 'number' ? v : v === '' || v == null ? null : Number(String(v).replace(/\./g, '').replace(',', '.')));
  // insumos (sem e com desoneração)
  let mes = '';
  const ins = {};
  for (const [aba, reg] of [['ISD', 'sd'], ['ICD', 'cd']]) {
    passo('Lendo os insumos (' + SIN_REG[reg].toLowerCase() + ')…');
    await new Promise(r => setTimeout(r, 30));
    const L = linhas(ler(aba));
    if (!mes) { const m = L.find(r => /m[eê]s de refer/i.test(String(r[0]))); const v = m && String(m[1]).match(/(\d{2})\/(\d{4})/); if (v) mes = v[2] + '-' + v[1]; }
    const h = L.findIndex(r => /classifica/i.test(String(r[0])) && r.includes(SIN_UF));
    if (h < 0) throw new Error('Não achei a coluna do ' + SIN_UF + ' na aba ' + aba + '.');
    const c = L[h].indexOf(SIN_UF);
    for (let i = h + 1; i < L.length; i++) {
      const r = L[i], cod = String(r[1]).trim();
      if (!cod || !/^\d+$/.test(cod)) continue;
      const o = ins[cod] = ins[cod] || { codigo: cod, descricao: String(r[2]).trim(), unidade: String(r[3]).trim(), classe: String(r[0]).trim(), origem: String(r[4]).trim(), sd: '', cd: '' };
      const p = num(r[c]);
      o[reg] = p == null ? '' : p;
    }
  }
  if (!mes) throw new Error('Não achei o mês de referência no arquivo.');
  // composições (custo do RS) — o código vem numa fórmula HYPERLINK(...;104658)
  const comp = {};
  for (const [aba, reg] of [['CSD', 'sd'], ['CCD', 'cd']]) {
    passo('Lendo as composições (' + SIN_REG[reg].toLowerCase() + ')…');
    await new Promise(r => setTimeout(r, 30));
    const ws = ler(aba, true), L = linhas(ws);
    const hu = L.findIndex(r => r.includes(SIN_UF) && r.includes('AC'));
    if (hu < 0) throw new Error('Não achei a coluna do ' + SIN_UF + ' na aba ' + aba + '.');
    const c = L[hu].indexOf(SIN_UF), h = L.findIndex((r, i) => i > hu && /grupo/i.test(String(r[0])));
    for (let i = h + 1; i < L.length; i++) {
      const r = L[i], cel = ws[XLSX.utils.encode_cell({ r: i, c: 1 })];
      let cod = cel && cel.f ? (String(cel.f).match(/(\d+)\s*\)\s*$/) || [])[1] : String(r[1]).trim();
      if (!cod || !/^\d+$/.test(cod) || cod === '0') continue;
      const o = comp[cod] = comp[cod] || { codigo: cod, descricao: String(r[2]).trim(), unidade: String(r[3]).trim(), grupo: String(r[0]).trim(), situacao: '', sd: '', cd: '' };
      const p = num(r[c]);
      o[reg] = p == null ? '' : p;
    }
  }
  // analítico: itens de cada composição e a situação
  passo('Lendo o analítico (itens de cada composição)…');
  await new Promise(r => setTimeout(r, 30));
  const L = linhas(ler('Analítico')), itens = {}, linhasItens = [];
  const h = L.findIndex(r => /grupo/i.test(String(r[0])) && /tipo/i.test(String(r[2])));
  for (let i = h + 1; i < L.length; i++) {
    const r = L[i], cc = String(r[1]).trim();
    if (!/^\d+$/.test(cc)) continue;
    if (!r[2]) { if (comp[cc]) comp[cc].situacao = String(r[7]).trim(); continue; }
    const t = /^COMPOSI/i.test(String(r[2])) ? 'C' : 'I', k = String(r[3]).trim(), cf = num(r[6]) || 0;
    (itens[cc] = itens[cc] || []).push({ t, k, cf });
    linhasItens.push([cc, t, k, cf]);
  }
  // divisão material / MO / equipamento / serviço: abre as auxiliares até os insumos e ajusta ao custo oficial
  passo('Calculando material e mão de obra de cada composição…');
  await new Promise(r => setTimeout(r, 30));
  const CAT = ['mat', 'mo', 'eq', 'sv'], memo = { sd: {}, cd: {} };
  const bruto = (cod, reg, pilha) => {
    if (memo[reg][cod]) return memo[reg][cod];
    const s = [0, 0, 0, 0];
    (itens[cod] || []).forEach(x => {
      if (x.t === 'C') { if (pilha.includes(x.k)) return; const b = bruto(x.k, reg, pilha.concat(x.k)); for (let j = 0; j < 4; j++) s[j] += x.cf * b[j]; return; }
      const i = ins[x.k];
      if (i && i[reg] !== '') s[CAT.indexOf(sinCat(i.classe))] += x.cf * i[reg];
    });
    return (memo[reg][cod] = s);
  };
  const div = (cod, reg) => {
    const of = comp[cod][reg];
    if (of === '' || of == null) return ['', '', '', ''];
    const b = bruto(cod, reg, [cod]), tot = b[0] + b[1] + b[2] + b[3];
    if (!(tot > 0)) return [0, 0, 0, sinR4(of)];
    const v = b.map(x => sinR4(x * of / tot));
    v[v.indexOf(Math.max(...v))] = sinR4(v[v.indexOf(Math.max(...v))] + of - v.reduce((a, x) => a + x, 0));   // fecha no custo oficial
    return v;
  };
  const linhasComp = Object.values(comp).map(o => [o.codigo, o.descricao, o.unidade, o.grupo, o.situacao, o.sd, o.cd, ...div(o.codigo, 'sd'), ...div(o.codigo, 'cd')]);
  const linhasIns = Object.values(ins).map(o => [o.codigo, o.descricao, o.unidade, o.classe, o.origem, o.sd, o.cd]);
  return { mes, insumos: linhasIns, composicoes: linhasComp, itens: linhasItens };
}
/* manda para o servidor em lotes */
async function sinEnviar(D, origem, passo) {
  await api('sinapi_importar', { etapa: 'inicio', mes: D.mes, uf: SIN_UF, origem });
  const lotes = [['insumos', D.insumos, 5000], ['composicoes', D.composicoes, 3000], ['itens', D.itens, 12000]];
  const total = lotes.reduce((t, l) => t + Math.ceil(l[1].length / l[2]), 0);
  let feito = 0;
  for (const [tab, L, n] of lotes) {
    for (let i = 0; i < L.length; i += n) {
      passo('Gravando no sistema… ' + Math.round(feito / total * 100) + '%', feito / total);
      await api('sinapi_importar', { etapa: 'lote', tab, linhas: L.slice(i, i + n) });
      feito++;
    }
  }
  passo('Conferindo e trocando o mês…', 1);
  return api('sinapi_importar', { etapa: 'fim' });
}
/* o servidor baixa o arquivo do mês na Caixa e entrega em partes */
async function sinBaixar(mes, passo) {
  const partes = [];
  let total = 1;
  for (let i = 0; i < total; i++) {
    passo(i ? 'Baixando da Caixa… parte ' + (i + 1) + ' de ' + total : 'Baixando o arquivo da Caixa…', i / total);
    const r = await api('sinapi_baixar', { mes, parte: i });
    total = r.partes;
    const s = atob(r.b64), b = new Uint8Array(s.length);
    for (let j = 0; j < s.length; j++) b[j] = s.charCodeAt(j);
    partes.push(b);
  }
  const u8 = new Uint8Array(partes.reduce((t, p) => t + p.length, 0));
  let o = 0;
  partes.forEach(p => { u8.set(p, o); o += p.length; });
  return u8.buffer;
}
/* importação completa (arquivo escolhido ou baixado), com o andamento na tela */
async function sinImportar(obter, origem) {
  const el = $('#sinProg'), bts = $$('#sinBuscar,#sinArqBt,#sinAtualizar');
  const passo = (t, f) => { if (el) el.innerHTML = `<div class="sin-prog"><span class="spin"></span><b>${esc(t)}</b>${f != null ? `<div class="ct-bar"><i style="width:${Math.round(f * 100)}%"></i></div>` : ''}</div>`; };
  bts.forEach(b => { b.disabled = true; });
  try {
    const buf = await obter(passo);
    const D = await sinLer(buf, passo);
    passo('SINAPI ' + sinMesTxt(D.mes) + ': ' + nf(D.composicoes.length) + ' composições e ' + nf(D.insumos.length) + ' insumos do ' + SIN_UF + '. Enviando…', 0);
    const r = await sinEnviar(D, origem, passo);
    toast(r.msg);
    await sinGuarda('del');
    SIN.ix = null; SIN.info = null;
    vSinapi();
  } catch (e) {
    if (el) el.innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`;
    bts.forEach(b => { b.disabled = false; });
  }
}

/* ---------- tela ---------- */
const sinMesAnt = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return iso(d).slice(0, 7); };
async function vSinapi() {
  titulo('SINAPI · Caixa');
  if (!baseNivel()) return bpSem();
  await bpCarregar();
  const I = SIN.info = await api('sinapi_info'), g = I.nivel === 'Gerir';
  const reg = k => `<button type="button" class="chip ${SIN.reg === k ? 'on' : ''}" data-reg="${k}">${SIN_REG[k]}</button>`;
  bpTela('sinapi', `<div class="bp-hero sin-hero"><div class="bp-hero-t"><span class="bp-selo">${ic('grid2')} Referência oficial · Caixa / IBGE</span><h2>SINAPI ${esc(I.uf)}${I.mes ? ' · ' + esc(I.mes_txt) : ''}</h2>
      <p>${I.mes ? `<b>${nf(I.composicoes)}</b> composições · <b>${nf(I.insumos)}</b> insumos · importado em ${esc(I.importado_em)}${I.importado_por ? ' por ' + esc(I.importado_por) : ''}${I.resumo ? '<br>' + esc(I.resumo) : ''}` : 'Ainda não importado. Importe o mês para usar composições e insumos do SINAPI nos orçamentos.'}</p></div>
      <div class="sin-reg"><small>Preços</small><div class="chips">${reg('sd')}${reg('cd')}</div><small>${I.verificado_em ? 'Caixa conferida em ' + esc(I.verificado_em) : ''}</small></div></div>
    ${I.novo ? `<div class="aviso info sin-novo">${ic('bell')}<span>${I.novo.confirmado ? 'A Caixa publicou' : 'Pelo calendário da Caixa já deve ter saído'} o SINAPI de <b>${sinMesTxt(I.novo.mes)}</b>.</span>
      ${g ? `<a class="btn sec peq" href="${esc(sinUrl(I.novo.mes))}" target="_blank" rel="noopener">${ic('download')} 1. Baixar da Caixa</a><button type="button" class="btn bp-ac peq" data-arq>${ic('upload')} 2. Escolher o arquivo</button>` : '<span>Peça a quem gerencia a base de preços para atualizar.</span>'}</div>` : ''}
    ${g ? `<details class="card pp-sec" ${I.mes ? '' : 'open'}><summary><h3>${ic('upload')} Importar ou atualizar</h3><small>${I.mes ? 'o sistema avisa no sino quando sair o mês novo' : 'comece pelo mês mais recente'}</small></summary>
      <div class="sin-imp"><div><b>1. Baixar o arquivo da Caixa</b><small>Baixa pelo seu navegador (o site da Caixa não aceita servidores de fora do Brasil). Todas as UFs; o app usa só o ${SIN_UF}.</small>
          <div class="sin-lin"><label>Mês<input type="month" id="sinMes" value="${esc((I.novo && I.novo.mes) || sinMesAnt())}"></label><a class="btn sec" id="sinLink" href="${esc(sinUrl((I.novo && I.novo.mes) || sinMesAnt()))}" target="_blank" rel="noopener">${ic('download')} Baixar da Caixa</a></div>
          <small>Não baixou? Alguns meses têm correção ("Retificação") com outro nome: <a href="${SIN_PAG}" target="_blank" rel="noopener">abra a página de downloads do SINAPI</a> e baixe o "formato xlsx" do mês.</small></div>
        <div><b>2. Escolher o arquivo baixado</b><small>O .zip (SINAPI-aaaa-mm-formato-xlsx.zip) ou a planilha SINAPI_Referência de dentro dele.</small>
          <label class="btn bp-ac" id="sinArqBt"><input type="file" id="sinArq" accept=".zip,.xlsx" hidden>${ic('upload')} Escolher arquivo e importar</label>
          <button type="button" class="linkbtn" id="sinBuscar">ou tentar baixar pelo servidor</button></div></div>
      <div id="sinProg"></div><small class="sin-dica">Faça no computador: o arquivo da Caixa é grande (cerca de 110 MB aberto) e leva cerca de um minuto. Orçamentos já feitos não mudam.</small></details>` : ''}
    ${I.mes ? `<div class="card"><div class="busca">${ic('search')}<input type="search" id="sinQ" data-busca placeholder="Buscar no SINAPI: código ou descrição  ( / )" value="${esc(SIN.q)}"></div>
      <div class="chips" id="sinTipo"><button type="button" class="chip ${SIN.tipo === 'C' ? 'on' : ''}" data-t="C">Composições</button><button type="button" class="chip ${SIN.tipo === 'I' ? 'on' : ''}" data-t="I">Insumos</button></div>
      <div id="sinLista" class="sin-lista"><div class="bp-lendo"><span class="spin"></span> Carregando o índice do SINAPI…</div></div></div>` : ''}`);
  $$('[data-reg]').forEach(b => { b.onclick = () => { SIN.reg = b.dataset.reg; $$('[data-reg]').forEach(x => x.classList.toggle('on', x === b)); desenhar(); }; });
  $$('[data-arq]').forEach(b => { b.onclick = () => { const d = $('details.pp-sec'); if (d) d.open = true; $('#sinArq').click(); }; });
  if ($('#sinMes')) $('#sinMes').oninput = e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) $('#sinLink').href = sinUrl(e.target.value); };
  if ($('#sinBuscar')) $('#sinBuscar').onclick = () => { const m = $('#sinMes').value; if (!/^\d{4}-\d{2}$/.test(m)) return toast('Escolha o mês.', 1); sinImportar(p => sinBaixar(m, p), 'Caixa · SINAPI-' + m); };
  if ($('#sinArq')) $('#sinArq').onchange = e => { const f = e.target.files[0]; if (f) sinImportar(async p => { p('Lendo ' + f.name + '…'); return f.arrayBuffer(); }, 'Arquivo · ' + f.name); };
  if (!I.mes) return;
  const desenhar = () => {
    const ix = SIN.ix, el = $('#sinLista');
    if (!ix || !el) return;
    const lista = SIN.tipo === 'C' ? ix.C : ix.I, q = SIN.q.trim();
    const l = q ? sinBuscar(lista, q, 80) : lista.slice(0, 40);
    el.innerHTML = `<small class="sin-n">${q ? plural(l.length, 'resultado', 'resultados') + (l.length === 80 ? ' (refine a busca)' : '') : 'Digite para buscar entre ' + nf(lista.length) + (SIN.tipo === 'C' ? ' composições' : ' insumos')}</small>`
      + l.map(x => SIN.tipo === 'C'
        ? `<button type="button" class="sin-r" data-c="${esc(x.codigo)}"><code>${esc(x.codigo)}</code><span><b>${esc(x.descricao)}</b><small>${esc(x.grupo)}${x.situacao && x.situacao !== 'COM CUSTO' ? ' · <span class="bp-flag">' + esc(x.situacao.toLowerCase()) + '</span>' : ''}</small></span><span class="sin-p"><b class="bp-mono">${x[SIN.reg] === '' ? '—' : bpM(x[SIN.reg])}</b><small>/${esc(x.unidade)}</small></span></button>`
        : `<div class="sin-r"><code>${esc(x.codigo)}</code><span><b>${esc(x.descricao)}</b><small>${esc(x.classe)}</small></span><span class="sin-p"><b class="bp-mono">${x[SIN.reg] === '' ? '—' : bpM(x[SIN.reg])}</b><small>/${esc(x.unidade)}</small></span></div>`).join('');
    $$('[data-c]', el).forEach(b => { b.onclick = () => sinVerComposicao(b.dataset.c, SIN.reg); });
  };
  let tm;
  $('#sinQ').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { SIN.q = e.target.value; desenhar(); }, 150); };
  $$('#sinTipo .chip').forEach(b => { b.onclick = () => { SIN.tipo = b.dataset.t; $$('#sinTipo .chip').forEach(x => x.classList.toggle('on', x === b)); desenhar(); }; });
  try { await sinIndice(); desenhar(); } catch (e) { $('#sinLista').innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; }
}

/* composição do SINAPI aberta (itens com preço do regime) e "copiar para a base da Size" */
async function sinVerComposicao(cod, reg, qtd) {
  reg = reg === 'cd' ? 'cd' : 'sd';
  const d = await api('sinapi_composicao', { codigo: cod }), c = d.composicao, q = Number(qtd) || 0;
  const g = baseNivel() === 'Gerir';
  const tot = d.itens.reduce((t, i) => t + i.coef * i['preco_' + reg], 0);
  modal(`${ic('grid2')} SINAPI ${esc(cod)}`, `<div class="pp-ins-cab"><b>${esc(c.descricao)}</b>
      <small>${esc(c.grupo)} · ${SIN_REG[reg].toLowerCase()} · ${SIN_UF} ${sinMesTxt(d.mes)} · custo <b>${bpM(c['custo_' + reg])}</b>/${esc(c.unidade)}${q ? ' · ' + nf(q) + ' ' + esc(c.unidade) + ' = ' + bpM(q * c['custo_' + reg]) : ''}${c.situacao && c.situacao !== 'COM CUSTO' ? ' · <span class="bp-flag">' + esc(c.situacao.toLowerCase()) + '</span>' : ''}</small></div>
    <div class="rolar"><table class="tab bp-tab"><thead><tr><th>Item</th><th>Un</th><th class="n">Coef.</th><th class="n">Preço</th><th class="n">Custo / ${esc(c.unidade)}</th>${q ? '<th class="n">Quant. total</th>' : ''}</tr></thead><tbody>
      ${d.itens.map(i => `<tr><td><span class="sin-ti">${i.tipo === 'C' ? 'composição' : esc(i.classe.toLowerCase())}</span> ${esc(i.descricao)} <small><code>${esc(i.codigo)}</code></small></td><td>${esc(i.unidade)}</td><td class="n bp-mono">${bpN(i.coef)}</td>
        <td class="n bp-mono">${bpM(i['preco_' + reg])}</td><td class="n bp-mono">${bpM(i.coef * i['preco_' + reg])}</td>${q ? `<td class="n bp-mono">${nf(q * i.coef)}</td>` : ''}</tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Soma dos itens${Math.abs(tot - c['custo_' + reg]) > 0.05 ? ' (o custo oficial arredonda cada item)' : ''}</td><td class="n bp-mono"><b>${bpM(tot)}</b></td>${q ? '<td></td>' : ''}</tr></tfoot></table></div>
    ${g ? `<div class="acoes" style="margin-top:12px"><button type="button" class="btn sec peq" id="sinBase">${ic('copy')} Copiar para a base da Size</button><small>vira a composição SINAPI-${esc(cod)}, com os insumos e os coeficientes, para você ajustar</small></div>` : ''}`, { semRodape: true, larga: true });
  if ($('#sinBase')) $('#sinBase').onclick = async () => {
    const b = $('#sinBase'); b.disabled = true;
    try { const r = await api('sinapi_para_base', { codigo: cod, regime: reg }); toast(r.msg); await bpCarregar(true); fecharModal(); location.hash = '#/orc/composicao/' + enc(r.codigo); }
    catch (e) { toast(e.message, 1); b.disabled = false; }
  };
}

ROTAS.push([/^#\/orc\/sinapi$/, vSinapi]);
