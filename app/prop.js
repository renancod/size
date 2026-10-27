'use strict';
/* =====================================================================
 * ORÇAMENTOS DE CLIENTES (módulo Orçamentos, fora de obra): lista, editor (etapas e itens tirados das composições
 * da base de preços ou de preço direto), BDI e gestão configuráveis, situação e revisões, proposta para imprimir/PDF
 * (cliente ou interna) e "Gerar obra" a partir do orçamento aprovado.
 * Usa app.js (api, modal, view…) e base.js (bpCarregar, bpTela, bpFoto, bpM, bpPn…). Cálculo igual ao de Propostas.gs.
 * ===================================================================== */
const PP = { d: null, ed: null, fl: { s: '', q: '' } };
const PP_ST = { Rascunho: ['Rascunho', 'b-aberto'], Enviado: ['Enviado ao cliente', 'b-apr'], Aprovado: ['Aprovado', 'b-ok'], Perdido: ['Perdido', 'b-canc'], Cancelado: ['Cancelado', 'b-canc'], Revisado: ['Revisado', ''] };
const ppSt = s => `<span class="badge ${(PP_ST[s] || [s, ''])[1]}">${esc((PP_ST[s] || [s])[0])}</span>`;
const PP_BASES = [['servicos', 'mão de obra, equipamento e serviços'], ['total', 'custo total']];
const ppR2 = n => Math.round((Number(n) || 0) * 100) / 100;

/* mesmo cálculo do servidor (propCalc_): custo, BDI, gestão e preço por item, etapa e total */
function ppCalc(p, linhas) {
  const bdi = bpPn(p.bdi_pct) / 100, ges = bpPn(p.gestao_pct) / 100, base = (b, i) => (b === 'total' ? i.custo : i.v_serv);
  const tot = { custo: 0, v_mat: 0, v_serv: 0, bdi: 0, gestao: 0, preco: 0, itens: 0 }, etapas = [];
  let et = null, ne = 0, ni = 0;
  const soma = (a, i) => { ['custo', 'v_mat', 'v_serv', 'bdi', 'gestao', 'preco'].forEach(k => { a[k] = ppR2(a[k] + i[k]); }); a.itens++; };
  const out = linhas.map(x => {
    if (x.tipo === 'E') { ne++; ni = 0; et = { codigo: String(ne), descricao: x.descricao, custo: 0, v_mat: 0, v_serv: 0, bdi: 0, gestao: 0, preco: 0, itens: 0 }; etapas.push(et); return Object.assign({}, x, { codigo: String(ne) }); }
    if (!et) { ne = 1; et = { codigo: '1', descricao: 'Serviços', custo: 0, v_mat: 0, v_serv: 0, bdi: 0, gestao: 0, preco: 0, itens: 0 }; etapas.push(et); }
    ni++;
    const q = bpPn(x.qtd), u = [bpPn(x.unit_mat), bpPn(x.unit_mo), bpPn(x.unit_eq), bpPn(x.unit_sv)];
    const i = Object.assign({}, x, { codigo: et.codigo + '.' + ni, q, custo_unit: u[0] + u[1] + u[2] + u[3], custo: ppR2(q * (u[0] + u[1] + u[2] + u[3])), v_mat: ppR2(q * u[0]), v_serv: ppR2(q * (u[1] + u[2] + u[3])) });
    i.bdi = ppR2(base(p.bdi_base, i) * bdi);
    i.gestao = ppR2(base(p.gestao_base, i) * ges);
    i.preco = ppR2(i.custo + i.bdi + i.gestao);
    i.preco_unit = q ? ppR2(i.preco / q) : 0;
    soma(et, i); soma(tot, i);
    return i;
  });
  tot.pct_material = tot.custo ? ppR2(tot.v_mat / tot.custo * 100) : 0;
  tot.margem = tot.preco ? ppR2((tot.bdi + tot.gestao) / tot.preco * 100) : 0;
  return { linhas: out, etapas, total: tot };
}
const ppPct = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

/* ---------- lista ---------- */
async function vPropLista(qs) {
  titulo('Orçamentos de clientes');
  if (!baseNivel()) return bpSem();
  await bpCarregar();
  const L = (await api('prop_listar')).propostas, p = new URLSearchParams(qs || ''), F = PP.fl;
  if (p.has('s')) F.s = p.get('s');
  const conta = s => L.filter(x => (s ? x.status === s : x.status !== 'Revisado')).length;
  bpTela('props', `<div class="cab"><h2>Orçamentos de clientes</h2><span class="contagem" id="ppN"></span>${bpGere() ? `<a class="btn peq bp-ac" href="#/orc/orcamento/novo">${ic('plus')} Novo orçamento</a>` : ''}</div>
    <div class="busca">${ic('search')}<input type="search" id="ppQ" data-busca placeholder="Buscar por número, cliente, empreendimento ou local  ( / )" value="${esc(F.q)}"></div>
    <div class="chips" id="ppChips"><button class="chip ${!F.s ? 'on' : ''}" data-s="">Todos <b>${conta('')}</b></button>
      ${['Rascunho', 'Enviado', 'Aprovado', 'Perdido', 'Cancelado', 'Revisado'].map(s => conta(s) ? `<button class="chip ${F.s === s ? 'on' : ''}" data-s="${s}">${PP_ST[s][0]} <b>${conta(s)}</b></button>` : '').join('')}</div>
    <div class="pp-lista" id="ppLista"></div>`);
  const desenhar = () => {
    const t = norm(F.q).split(/\s+/).filter(Boolean);
    const l = L.filter(x => (F.s ? x.status === F.s : x.status !== 'Revisado') && t.every(w => norm([x.rotulo, x.cliente, x.empreendimento, x.local].join(' ')).includes(w)));
    $('#ppN').textContent = plural(l.length, 'orçamento', 'orçamentos');
    $('#ppLista').innerHTML = l.map(x => { const T = x.total || {};
      return `<a class="pp-card st-${esc(x.status)}" href="#/orc/orcamento/${enc(x.id)}">
        <div class="pp-c1"><code class="bp-cod">${esc(x.rotulo)}</code>${ppSt(x.status)}${x.obra_id ? `<span class="badge b-rec">${ic('building')} virou obra</span>` : ''}<span class="dir">${fdh(x.atualizado_em)}</span></div>
        <b class="pp-emp">${esc(x.empreendimento)}</b><small>${esc(x.cliente)}${x.local ? ' · ' + esc(x.local) : ''}</small>
        <div class="pp-c2"><span class="bp-preco"><b>${bpM(T.preco)}</b></span><small>custo ${bpM(T.custo)} · BDI + gestão ${ppPct(T.margem)} · ${plural(T.itens || 0, 'item', 'itens')}</small></div>
        ${bpBarra({ mat: T.v_mat || 0, mo: T.v_serv || 0, eq: 0, sv: 0, total: (T.v_mat || 0) + (T.v_serv || 0) }, 'fino')}</a>`; }).join('')
      || `<div class="card vazio" style="grid-column:1/-1"><p>Nenhum orçamento${F.q ? ' com “' + esc(F.q) + '”' : ''}.</p>${bpGere() && !L.length ? `<a class="btn bp-ac" href="#/orc/orcamento/novo">${ic('plus')} Fazer o primeiro orçamento</a>` : ''}</div>`;
  };
  let tm;
  $('#ppQ').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { F.q = e.target.value; desenhar(); }, 120); };
  $$('#ppChips .chip').forEach(b => { b.onclick = () => { F.s = b.dataset.s; $$('#ppChips .chip').forEach(x => x.classList.toggle('on', x === b)); desenhar(); }; });
  desenhar();
}

/* ---------- orçamento: editor (rascunho) ou leitura ---------- */
async function vProp(id) {
  if (!baseNivel()) return bpSem();
  await bpCarregar();
  let d = null;
  if (id) d = PP.d = await api('prop_detalhe', { id });
  if (!id && !bpGere()) return bpSem('Gerir');
  const p = d ? d.proposta : { cliente: '', empreendimento: '', status: 'Rascunho', bdi_pct: 0, bdi_base: 'servicos', gestao_pct: 0, gestao_base: 'total', validade_dias: 30, data_base: hoje(), rotulo: 'novo' };
  titulo(id ? p.rotulo + ' · ' + p.empreendimento : 'Novo orçamento');
  const edita = !d || d.editavel;
  PP.ed = { id: id || '', p: Object.assign({}, p), linhas: d ? d.itens.map(i => i.tipo === 'E' ? { tipo: 'E', descricao: i.descricao } : { tipo: 'I', comp_cod: i.comp_cod, descricao: i.descricao, unidade: i.unidade, qtd: bpV(i.qtd), unit_mat: i.unit_mat, unit_mo: i.unit_mo, unit_eq: i.unit_eq, unit_sv: i.unit_sv, obs: i.obs }) : [{ tipo: 'E', descricao: 'Serviços preliminares' }], sujo: false };
  const cab = `<a href="#/orc/orcamentos" class="linkbtn">${ic('back')} Orçamentos de clientes</a>
    <div class="bp-hero pp-hero"><div class="bp-hero-t"><span class="bp-selo">${ic('file')} Orçamento <code>${esc(p.rotulo)}</code></span><h2>${esc(p.empreendimento || 'Novo orçamento')}</h2>
      <p>${p.cliente ? esc(p.cliente) + (p.local ? ' · ' + esc(p.local) : '') + ' · ' : ''}${ppSt(p.status)}${d && d.obra ? ` · <a class="pp-obra" href="#" data-obra="${esc(d.obra.id)}">${ic('building')} obra ${esc(d.obra.nome)}</a>` : ''}</p>
      ${d ? `<div class="acoes" id="ppAcoes">${ppAcoes(d)}</div>` : ''}</div>
      <div class="bp-hero-custo"><div><small>Preço de venda</small><b class="bp-mono" id="ppTopo">${bpM(d ? d.total.preco : 0)}</b><small id="ppTopo2">${d ? 'custo ' + bpM(d.total.custo) + ' · BDI + gestão ' + ppPct(d.total.margem) : ''}</small></div></div></div>
    ${p.status === 'Perdido' && p.motivo ? `<div class="aviso warn">Perdido: ${esc(p.motivo)}</div>` : ''}
    ${d && d.revisoes.length > 1 ? `<div class="pp-revs">${d.revisoes.map(r => `<a class="chip ${r.id === id ? 'on' : ''}" href="#/orc/orcamento/${enc(r.id)}">${esc(r.rotulo)} <small>${esc(r.status)}</small></a>`).join('')}</div>` : ''}`;
  if (edita) bpTela('props', cab + ppEditorHtml(PP.ed.p, !d));
  else bpTela('props', cab + ppLeitura(d));
  ppLigarAcoes(d);
  if (edita) ppEditorLigar();
}
function ppAcoes(d) {
  const p = d.proposta, g = d.nivel === 'Gerir', b = (a, i, t, cl) => `<button type="button" class="btn ${cl || 'sec'}" data-pa="${a}">${ic(i)} ${t}</button>`;
  return [
    `<a class="btn sec" href="#/orc/orcamento/${enc(p.id)}/proposta?m=c">${ic('file')} Proposta (cliente)</a>`,
    `<a class="btn sec" href="#/orc/orcamento/${enc(p.id)}/proposta?m=i">${ic('chart')} Planilha interna</a>`,
    g && p.status === 'Rascunho' ? b('enviar', 'send', 'Marcar como enviado', 'bp-ac') : '',
    g && ['Rascunho', 'Enviado'].includes(p.status) ? b('aprovar', 'check', 'Aprovado pelo cliente') : '',
    g && ['Rascunho', 'Enviado'].includes(p.status) ? b('perder', 'x', 'Perdido') : '',
    g && ['Enviado', 'Perdido', 'Aprovado'].includes(p.status) && !p.obra_id ? b('revisao', 'copy', 'Nova revisão') : '',
    g && ['Enviado', 'Perdido', 'Cancelado'].includes(p.status) ? b('reabrir', 'refresh', 'Reabrir') : '',
    g ? b('copiar', 'copy', 'Copiar como novo') : '',
    g && p.status === 'Rascunho' ? b('precos', 'refresh', 'Atualizar preços pela base') : '',
    d.admin && p.status === 'Aprovado' && !p.obra_id ? b('obra', 'building', 'Gerar obra', 'bp-ac') : '',
    g && p.status === 'Rascunho' ? b('cancelar', 'x', 'Cancelar orçamento') : '',
    g && p.status === 'Rascunho' && !p.revisao ? b('excluir', 'trash', 'Excluir') : ''
  ].filter(Boolean).join('');
}
function ppLigarAcoes(d) {
  $$('[data-obra]').forEach(a => { a.onclick = async e => { e.preventDefault(); await trocarObra(a.dataset.obra); location.hash = '#/obra'; }; });
  if (!d) return;
  const p = d.proposta, ir = id => { location.hash = '#/orc/orcamento/' + enc(id); }, recarrega = () => vProp(p.id);
  const salvarAntes = async () => { if (PP.ed && PP.ed.sujo) await ppSalvar(true); };
  const op = async (o, extra) => { await salvarAntes(); const r = await api('prop_status', Object.assign({ id: p.id, op: o }, extra || {})); toast(r.msg); recarrega(); };
  const A = {
    enviar: () => op('enviar'),
    aprovar: () => { if (confirm('Marcar ' + p.rotulo + ' como aprovado pelo cliente?')) op('aprovar'); },
    perder: () => modal('Orçamento perdido', '<label>Motivo<input name="m" required minlength="3" placeholder="ex: preço acima do concorrente, prazo, cliente desistiu"></label>', { ok: 'Marcar como perdido', onOk: f => op('perder', { motivo: f.m.value }) }),
    reabrir: () => op('reabrir'),
    cancelar: () => { if (confirm('Cancelar o orçamento ' + p.rotulo + '?')) op('cancelar'); },
    revisao: async () => { const r = await api('prop_copiar', { id: p.id }); toast(r.msg); ir(r.id); },
    copiar: async () => { await salvarAntes(); const r = await api('prop_copiar', { id: p.id, novo: true }); toast(r.msg); ir(r.id); },
    precos: async () => { await salvarAntes(); toast((await api('prop_precos', { id: p.id })).msg); await bpCarregar(true); recarrega(); },
    excluir: async () => { if (!confirm('Excluir o orçamento ' + p.rotulo + '? Não dá para desfazer.')) return; toast((await api('prop_excluir', { id: p.id })).msg); location.hash = '#/orc/orcamentos'; },
    obra: () => ppGerarObra(d)
  };
  $$('[data-pa]').forEach(b => { b.onclick = async () => { b.disabled = true; try { await A[b.dataset.pa](); } catch (e) { toast(e.message, 1); } b.disabled = false; }; });
}
/* leitura: resumo por etapa e itens (enviado, aprovado, perdido… ou acesso só de consulta) */
function ppLeitura(d) {
  const T = d.total, p = d.proposta;
  return `<div class="bp-cats pp-tot">${[['Custo direto', T.custo, ''], ['Material', T.v_mat, 'k-mat'], ['Mão de obra e serviços', T.v_serv, 'k-mo'], ['BDI ' + ppPct(p.bdi_pct), T.bdi, 'k-eq'], ['Gestão ' + ppPct(p.gestao_pct), T.gestao, 'k-sv']]
      .map(([t, v, k]) => `<div class="bp-cat ${k}"><small>${t}</small><b class="bp-mono">${bpM(v)}</b><span>${T.preco ? ppPct(v / T.preco * 100) + ' do preço' : ''}</span></div>`).join('')}</div>
    <div class="card"><div class="bp-h"><h3>${ic('list')} Planilha</h3><small>data-base ${fd(p.data_base)} · validade ${p.validade_dias} dias</small></div>${ppTabela(d.itens, d.etapas, T, false)}</div>
    ${p.prazo_txt || p.pagamento_txt || p.texto_cliente ? `<div class="card"><h3>Condições da proposta</h3><dl class="kv">${p.prazo_txt ? `<dt>Prazo</dt><dd>${esc(p.prazo_txt)}</dd>` : ''}${p.pagamento_txt ? `<dt>Pagamento</dt><dd>${esc(p.pagamento_txt)}</dd>` : ''}${p.texto_cliente ? `<dt>Observações</dt><dd style="white-space:pre-wrap">${esc(p.texto_cliente)}</dd>` : ''}</dl></div>` : ''}
    ${p.obs ? `<div class="card"><h3>Observações internas</h3><p style="white-space:pre-wrap;margin:0">${esc(p.obs)}</p></div>` : ''}
    <div class="card"><h3>${ic('clock')} Histórico</h3><div class="pp-hist">${d.historico.map(h => `<div><small>${esc(h.em)}</small><b>${esc(h.acao)}</b><span>${esc(h.det || '')}</span><small>${esc(h.por || '')}</small></div>`).join('')}</div></div>`;
}
/* tabela da planilha (leitura ou proposta): etapas com subtotal, itens com preço de venda; interna mostra o custo */
function ppTabela(itens, etapas, T, interna) {
  const et = {};
  etapas.forEach(e => { et[e.codigo] = e; });
  return `<div class="rolar"><table class="tab bp-tab pp-tab"><thead><tr><th>Item</th><th>Descrição</th><th>Un</th><th class="n">Quant.</th>${interna ? '<th class="n">Custo unit.</th><th class="n">Material</th><th class="n">MO/serv.</th><th class="n">BDI</th><th class="n">Gestão</th>' : ''}<th class="n">Preço unit.</th><th class="n">Preço total</th></tr></thead><tbody>
    ${itens.map(i => i.tipo === 'E' ? `<tr class="pp-et"><td>${esc(i.codigo)}</td><td colspan="${interna ? 9 : 4}"><b>${esc(i.descricao)}</b></td><td class="n bp-mono"><b>${bpM((et[i.codigo] || {}).preco)}</b></td></tr>`
      : `<tr><td>${esc(i.codigo)}</td><td>${esc(i.descricao)}${interna && i.comp_cod ? ` <small><code>${esc(i.comp_cod)}</code></small>` : ''}</td><td>${esc(i.unidade)}</td><td class="n bp-mono">${nf(i.qtd)}</td>
        ${interna ? `<td class="n bp-mono">${bpM(i.custo_unit)}</td><td class="n bp-mono">${bpM(i.v_mat)}</td><td class="n bp-mono">${bpM(i.v_serv)}</td><td class="n bp-mono">${bpM(i.bdi)}</td><td class="n bp-mono">${bpM(i.gestao)}</td>` : ''}
        <td class="n bp-mono">${bpM(i.preco_unit)}</td><td class="n bp-mono"><b>${bpM(i.preco)}</b></td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="${interna ? 10 : 5}">Total${interna ? ` · custo ${bpM(T.custo)} · BDI ${bpM(T.bdi)} · gestão ${bpM(T.gestao)}` : ''}</td><td class="n bp-mono"><b>${bpM(T.preco)}</b></td></tr></tfoot></table></div>`;
}

/* ---------- editor ---------- */
function ppEditorHtml(p, novo) {
  const sel = (n, v) => `<select name="${n}">${PP_BASES.map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  return `<form id="ppF" class="bp-bancada" autocomplete="off"><div class="bp-ed-main">
    <div class="card"><h3>${ic('user')} Cliente e obra</h3>
      <div class="bp-g3"><label class="bp-span2">Cliente<input name="cliente" required value="${esc(p.cliente || '')}" placeholder="ex: Construtora Mar Azul Ltda"></label><label>CNPJ / CPF<input name="cliente_doc" value="${esc(p.cliente_doc || '')}"></label></div>
      <div class="bp-g3"><label>Contato<input name="contato" value="${esc(p.contato || '')}"></label><label>Telefone<input name="telefone" type="tel" value="${esc(p.telefone || '')}"></label><label>E-mail<input name="email" type="email" value="${esc(p.email || '')}"></label></div>
      <div class="bp-g3"><label class="bp-span2">Empreendimento / obra<input name="empreendimento" required value="${esc(p.empreendimento || '')}" placeholder="ex: Loteamento Dunas · infraestrutura"></label><label>Local<input name="local" value="${esc(p.local || '')}" placeholder="cidade/UF"></label></div>
      <div class="bp-g3"><label>Data-base dos preços<input name="data_base" type="date" value="${esc(p.data_base || hoje())}"></label><label>Validade da proposta (dias)<input name="validade_dias" inputmode="numeric" value="${esc(p.validade_dias ?? 30)}"></label></div></div>
    <div class="card"><div class="bp-h"><h3>${ic('list')} Planilha <small>etapas e itens</small></h3><span class="acoes"><button type="button" class="btn sec peq" id="ppEt">${ic('plus')} Etapa</button><button type="button" class="btn sec peq" id="ppDir">${ic('plus')} Item de preço direto</button></span></div>
      <div class="bp-add"><div class="busca">${ic('search')}<input id="ppBusca" data-busca placeholder="Incluir serviço da base de preços: código ou descrição  ( / )"></div><div class="bp-res" id="ppRes" hidden></div></div>
      <div id="ppLin" class="pp-lin"></div></div>
    <div class="card"><h3>${ic('percent')} BDI e gestão</h3>
      <div class="pp-taxas"><label>BDI (%)<input name="bdi_pct" inputmode="decimal" value="${esc(bpV(p.bdi_pct))}"></label><label>sobre ${sel('bdi_base', p.bdi_base)}</label>
        <label>Gestão de obra (%)<input name="gestao_pct" inputmode="decimal" value="${esc(bpV(p.gestao_pct))}"></label><label>sobre ${sel('gestao_base', p.gestao_base)}</label></div>
      <small>Ex. da AVA: BDI 18% só sobre mão de obra e serviços e gestão 6% sobre o custo total. O preço de venda de cada item = custo + BDI + gestão.</small></div>
    <div class="card"><h3>${ic('file')} Texto da proposta</h3>
      <div class="g2"><label>Prazo de execução<input name="prazo_txt" value="${esc(p.prazo_txt || '')}" placeholder="ex: 8 meses a partir da ordem de serviço"></label><label>Condições de pagamento<input name="pagamento_txt" value="${esc(p.pagamento_txt || '')}" placeholder="ex: medições mensais, pagamento em 15 dias"></label></div>
      <label>Observações para o cliente<textarea name="texto_cliente" rows="3" placeholder="ex: não inclui licenças, projetos e ligações definitivas">${esc(p.texto_cliente || '')}</textarea></label>
      <label>Observações internas <small>(não saem na proposta)</small><textarea name="obs" rows="2">${esc(p.obs || '')}</textarea></label></div>
  </div><aside class="bp-ed-lado"><div class="bp-resumo" id="ppResumo"></div></aside></form>`;
}
function ppEditorLigar() {
  const f = $('#ppF'), E = PP.ed;
  f.oninput = e => { E.sujo = true; if (/^(bdi|gestao)_/.test(e.target.name)) { ppColher(); ppDesenhar(false); } };
  f.onchange = e => { if (/^(bdi|gestao)_/.test(e.target.name)) { ppColher(); ppDesenhar(false); } };
  f.onkeydown = e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); };
  f.onsubmit = e => { e.preventDefault(); ppSalvar(); };
  $('#ppEt').onclick = () => { ppColher(); E.linhas.push({ tipo: 'E', descricao: '' }); E.sujo = true; ppDesenhar(true); const l = $$('#ppLin .pp-l.et input'); if (l.length) l[l.length - 1].focus(); };
  $('#ppDir').onclick = () => ppIncluir({ tipo: 'I', comp_cod: '', descricao: '', unidade: 'vb', qtd: '1', unit_mat: '', unit_mo: '', unit_eq: 0, unit_sv: 0 }, true);
  ppBusca();
  ppDesenhar(true);
}
function ppColher() {
  const f = $('#ppF');
  if (!f) return;
  ['cliente', 'cliente_doc', 'contato', 'telefone', 'email', 'empreendimento', 'local', 'data_base', 'validade_dias', 'bdi_pct', 'bdi_base', 'gestao_pct', 'gestao_base', 'prazo_txt', 'pagamento_txt', 'texto_cliente', 'obs'].forEach(k => { PP.ed.p[k] = f.elements[k].value; });
}
function ppIncluir(l, foco) {
  ppColher();
  const E = PP.ed;
  E.linhas.push(l); E.sujo = true;
  ppDesenhar(true);
  const rows = $$('#ppLin .pp-l.it'), r = rows[rows.length - 1];
  if (r) { r.classList.add('novo'); const i = $(foco && !l.comp_cod ? '[data-c=descricao]' : '[data-c=qtd]', r); if (i) { i.focus(); i.select && i.select(); } r.scrollIntoView({ block: 'nearest' }); }
}
/* desenha as linhas (estrutura = refaz tudo; senão só os números) */
function ppDesenhar(estrutura) {
  const E = PP.ed, C = ppCalc(E.p, E.linhas);
  if (estrutura) {
    $('#ppLin').innerHTML = E.linhas.length ? E.linhas.map((l, n) => {
      const c = C.linhas[n], mv = `<span class="bp-it-a"><button type="button" class="icbtn" data-a="sobe" ${n ? '' : 'disabled'} title="Subir">${ic('up')}</button><button type="button" class="icbtn" data-a="desce" ${n < E.linhas.length - 1 ? '' : 'disabled'} title="Descer">${ic('down')}</button><button type="button" class="icbtn bp-x" data-a="tira" title="Tirar">${ic('x')}</button></span>`;
      if (l.tipo === 'E') return `<div class="pp-l et" data-n="${n}"><span class="pp-cod">${esc(c.codigo)}</span><input data-c="descricao" value="${esc(l.descricao)}" placeholder="Nome da etapa (ex: Pavimentação)"><span class="bp-mono pp-sub" data-sub></span>${mv}</div>`;
      const comp = l.comp_cod ? BP.C[l.comp_cod] : null;
      return `<div class="pp-l it ${l.comp_cod ? 'base' : 'dir'}" data-n="${n}"><span class="pp-cod">${esc(c.codigo)}</span>
        <span class="pp-d">${l.comp_cod ? `<b>${esc(l.descricao)}</b><small><code>${esc(l.comp_cod)}</code> · da base${comp ? '' : ' (não está mais na base)'} · custo ${bpM(c.custo_unit)}/${esc(l.unidade)}${l.obs ? ' · ' + esc(l.obs) : ''}</small>`
          : `<input data-c="descricao" value="${esc(l.descricao)}" placeholder="Descrição do item (preço direto)"><span class="pp-dir"><label>Material/un<input data-c="unit_mat" inputmode="decimal" value="${esc(bpV(l.unit_mat))}" placeholder="0,00"></label><label>Mão de obra/un<input data-c="unit_mo" inputmode="decimal" value="${esc(bpV(l.unit_mo))}" placeholder="0,00"></label></span>`}</span>
        <label class="pp-un"><small>Un</small>${l.comp_cod ? `<span>${esc(l.unidade)}</span>` : `<input data-c="unidade" value="${esc(l.unidade)}">`}</label>
        <label class="pp-q"><small>Quant.</small><input data-c="qtd" inputmode="decimal" value="${esc(l.qtd)}" placeholder="0"></label>
        <span class="pp-v"><small>Preço unit.</small><b class="bp-mono" data-pu></b></span><span class="pp-v"><small>Total</small><b class="bp-mono" data-pt></b></span>${mv}</div>`;
    }).join('') : `<div class="bp-itens-vazio">${ic('list')}<b>Planilha vazia</b><small>Crie uma etapa e busque acima os serviços da base de preços (ou inclua um item de preço direto).</small></div>`;
    $$('#ppLin .pp-l').forEach(el => {
      const n = +el.dataset.n;
      $$('input[data-c]', el).forEach(i => { i.oninput = () => { E.linhas[n][i.dataset.c] = i.value; E.sujo = true; ppDesenhar(false); }; });
      $$('[data-a]', el).forEach(b => { b.onclick = () => {
        ppColher();
        const a = b.dataset.a, L = E.linhas;
        if (a === 'tira') { if (L[n].tipo === 'E' && L.some((x, k) => k > n && x.tipo === 'I') && !confirm('Tirar a etapa? Os itens dela passam para a etapa anterior.')) return; L.splice(n, 1); }
        else { const m = a === 'sobe' ? n - 1 : n + 1; [L[n], L[m]] = [L[m], L[n]]; }
        E.sujo = true; ppDesenhar(true);
      }; });
    });
  }
  const etapas = {};
  C.etapas.forEach(e => { etapas[e.codigo] = e; });
  $$('#ppLin .pp-l').forEach(el => {
    const c = C.linhas[+el.dataset.n];
    if (c.tipo === 'E') { const s = $('[data-sub]', el); if (s) s.textContent = bpM((etapas[c.codigo] || {}).preco); return; }
    $('[data-pu]', el).textContent = bpM(c.preco_unit); $('[data-pt]', el).textContent = bpM(c.preco);
  });
  const T = C.total, salvo = !!E.id;
  $('#ppTopo').textContent = bpM(T.preco);
  $('#ppTopo2').textContent = 'custo ' + bpM(T.custo) + ' · BDI + gestão ' + ppPct(T.margem);
  $('#ppResumo').innerHTML = `<div class="bp-res-top">${bpDonut({ mat: T.v_mat, mo: T.v_serv, eq: T.bdi, sv: T.gestao, total: T.preco })}<div><small>Preço de venda</small><b class="bp-mono">${bpM(T.preco)}</b><small>${plural(T.itens, 'item', 'itens')}</small></div></div>
    <div class="bp-res-cats">${[['mat', 'Material', T.v_mat], ['mo', 'MO e serviços', T.v_serv], ['eq', 'BDI', T.bdi], ['sv', 'Gestão', T.gestao]].map(([k, t, v]) => `<div class="${v ? '' : 'zero'}"><i class="bp-dot k-${k}"></i><span>${t}</span><b class="bp-mono">${bpM(v)}</b><small>${T.preco ? Math.round(v / T.preco * 100) + '%' : ''}</small></div>`).join('')}</div>
    <small class="bp-res-n">custo direto ${bpM(T.custo)} · material ${ppPct(T.pct_material)} do custo</small>
    <button class="btn full bp-ac" id="ppSalvar">${ic('check')} ${salvo ? 'Salvar orçamento' : 'Criar orçamento'}</button>`;
}
async function ppSalvar(silencioso) {
  ppColher();
  const E = PP.ed, b = $('#ppSalvar');
  if (b) { b.disabled = true; b.textContent = 'Salvando…'; }
  try {
    const r = await api('prop_salvar', { proposta: Object.assign({}, E.p, { id: E.id || undefined }), itens: E.linhas.map(l => l.tipo === 'E' ? { tipo: 'E', descricao: l.descricao }
      : { tipo: 'I', comp_cod: l.comp_cod, descricao: l.descricao, unidade: l.unidade, qtd: bpPn(l.qtd), unit_mat: bpPn(l.unit_mat), unit_mo: bpPn(l.unit_mo), unit_eq: bpPn(l.unit_eq), unit_sv: bpPn(l.unit_sv), obs: l.obs || '' }) });
    E.sujo = false;
    if (!silencioso) toast(r.msg);
    if (!E.id) { location.hash = '#/orc/orcamento/' + enc(r.id); return r; }
    if (!silencioso) vProp(E.id);
    return r;
  } catch (e) { if (silencioso) throw e; toast(e.message, 1); if (b) { b.disabled = false; b.textContent = 'Salvar orçamento'; } }
}
/* busca na base: composições ativas; Enter inclui com quantidade a preencher */
function ppBusca() {
  const inp = $('#ppBusca'), res = $('#ppRes');
  let sel = 0, lista = [], tF;
  const desenhar = () => {
    const t = norm(inp.value).split(/\s+/).filter(Boolean);
    if (!t.length) { res.hidden = true; return; }
    lista = BP.d.composicoes.filter(c => c.ativo && t.every(w => norm(c.codigo + ' ' + c.descricao + ' ' + c.grupo).includes(w))).slice(0, 25);
    sel = 0;
    res.innerHTML = lista.map((c, n) => `<button type="button" class="bp-op ${n ? '' : 'on'}" data-n="${n}">${bpDonut(c.custo, 'mini')}<span><b>${esc(c.descricao)}</b><small><code>${esc(c.codigo)}</code> · ${esc(c.unidade)}${c.grupo ? ' · ' + esc(c.grupo) : ''}</small></span><span class="bp-mono">${bpM(c.custo.total)}</span></button>`).join('')
      + `<button type="button" class="bp-op bp-op-novo" data-n="dir">${ic('plus')}<span><b>Item de preço direto: “${esc(inp.value.trim())}”</b><small>sem composição: você digita material e mão de obra por unidade</small></span></button>`;
    res.hidden = false;
    $$('.bp-op', res).forEach(b => { b.onmousedown = e => e.preventDefault(); b.onclick = () => escolher(b.dataset.n); });
  };
  const escolher = n => {
    res.hidden = true;
    const txt = inp.value.trim();
    inp.value = '';
    if (n === 'dir') return ppIncluir({ tipo: 'I', comp_cod: '', descricao: txt, unidade: 'vb', qtd: '1', unit_mat: '', unit_mo: '', unit_eq: 0, unit_sv: 0 }, true);
    const c = lista[+n];
    if (!c) return;
    if (PP.ed.linhas.some(l => l.comp_cod === c.codigo)) toast('Este serviço já está no orçamento (pode repetir em outra etapa).');
    ppIncluir({ tipo: 'I', comp_cod: c.codigo, descricao: c.descricao, unidade: c.unidade, qtd: '', unit_mat: c.custo.mat, unit_mo: c.custo.mo, unit_eq: c.custo.eq, unit_sv: c.custo.sv });
  };
  inp.oninput = () => { clearTimeout(tF); desenhar(); };
  inp.onfocus = () => { clearTimeout(tF); desenhar(); };
  inp.onblur = () => { tF = setTimeout(() => { res.hidden = true; }, 150); };
  inp.onkeydown = e => {
    if (res.hidden) return;
    const ops = $$('.bp-op', res);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + ops.length) % ops.length; ops.forEach((b, i) => b.classList.toggle('on', i === sel)); ops[sel].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(ops[sel]?.dataset.n); }
    else if (e.key === 'Escape') res.hidden = true;
  };
}

/* ---------- gerar a obra ---------- */
function ppGerarObra(d) {
  const p = d.proposta, sig = norm(p.empreendimento).toUpperCase().replace(/[^A-Z ]/g, '').split(/\s+/).filter(w => w.length > 2).map(w => w[0]).join('').slice(0, 4) || 'OB';
  modal(`${ic('building')} Gerar obra a partir de ${esc(p.rotulo)}`, `<p><small>Cria a obra com a planilha e a pasta no Drive. Cada etapa vira uma <b>frente geral</b> do Orçamento da obra, com os serviços (quantidade, material, mão de obra e preço de venda) e os <b>materiais</b> das composições. Depois é só liberar o acesso das pessoas.</small></p>
    <div class="bp-g3"><label class="bp-span2">Nome da obra<input name="nome" required value="${esc(p.empreendimento)}"></label><label>Sigla (2 a 5 letras)<input name="sigla" required maxlength="5" value="${esc(sig)}" style="text-transform:uppercase"></label></div>
    <label>Endereço<input name="endereco" value="${esc(p.local || '')}"></label>
    <div class="aviso info">${plural(d.etapas.filter(e => e.itens).length, 'frente geral', 'frentes gerais')} · ${plural(d.total.itens, 'serviço', 'serviços')} · preço de venda ${bpM(d.total.preco)}</div>`, {
    ok: 'Criar a obra', larga: true,
    onOk: async f => {
      const r = await api('prop_gerar_obra', { id: p.id, nome: f.nome.value, sigla: f.sigla.value, endereco: f.endereco.value });
      toast(r.msg);
      await recarregarSessao();
      await trocarObra(r.obra_id);
      location.hash = '#/obra';
    }
  });
}

/* ---------- proposta para imprimir / salvar em PDF (cliente ou planilha interna) ---------- */
async function vPropDoc(id, qs) {
  if (!baseNivel()) return bpSem();
  const d = await api('prop_detalhe', { id }), p = d.proposta, interna = new URLSearchParams(qs || '').get('m') === 'i', T = d.total;
  const val = p.data_base && p.validade_dias ? (() => { const x = new Date(String(p.data_base).slice(0, 10) + 'T12:00'); x.setDate(x.getDate() + p.validade_dias); return iso(x); })() : '';
  titulo((interna ? 'Planilha interna ' : 'Proposta ') + p.rotulo);
  view(`<div class="pp-doc-bar no-print"><a class="linkbtn" href="#/orc/orcamento/${enc(id)}">${ic('back')} Voltar ao orçamento</a><span class="acoes">
      <a class="btn sec peq" href="#/orc/orcamento/${enc(id)}/proposta?m=${interna ? 'c' : 'i'}">${interna ? 'Ver a proposta do cliente' : 'Ver a planilha interna'}</a><button class="btn bp-ac" id="ppPrint">${ic('download')} Imprimir / salvar PDF</button></span></div>
    ${interna ? '<div class="aviso warn no-print">Uso interno: mostra custos, BDI e gestão. Não envie ao cliente.</div>' : ''}
    <article class="pp-doc ${interna ? 'interna' : ''}">
      <header class="pp-doc-h"><img src="logo.png" alt=""><div><b>${esc(d.empresa)}</b><small>${interna ? 'Planilha orçamentária · uso interno' : 'Proposta comercial'}</small></div><div class="pp-doc-n"><b>${esc(p.rotulo)}</b><small>${fd(p.data_base)}</small></div></header>
      <section class="pp-doc-c"><div><small>Cliente</small><b>${esc(p.cliente)}</b>${p.cliente_doc ? `<span>${esc(p.cliente_doc)}</span>` : ''}${p.contato ? `<span>A/C ${esc(p.contato)}</span>` : ''}${p.email || p.telefone ? `<span>${esc([p.email, p.telefone].filter(Boolean).join(' · '))}</span>` : ''}</div>
        <div><small>Empreendimento</small><b>${esc(p.empreendimento)}</b>${p.local ? `<span>${esc(p.local)}</span>` : ''}</div></section>
      ${ppTabela(d.itens, d.etapas, T, interna)}
      ${interna ? `<section class="pp-doc-res">${[['Custo direto', T.custo], ['Material', T.v_mat], ['Mão de obra e serviços', T.v_serv], ['BDI ' + ppPct(p.bdi_pct) + ' sobre ' + (p.bdi_base === 'total' ? 'o custo total' : 'MO e serviços'), T.bdi], ['Gestão ' + ppPct(p.gestao_pct) + ' sobre ' + (p.gestao_base === 'total' ? 'o custo total' : 'MO e serviços'), T.gestao], ['Preço de venda', T.preco]].map(([t, v]) => `<div><span>${t}</span><b class="bp-mono">${bpM(v)}</b></div>`).join('')}<div><span>BDI + gestão sobre o preço</span><b>${ppPct(T.margem)}</b></div></section>`
        : `<section class="pp-doc-tot"><span>Valor total da proposta</span><b class="bp-mono">${bpM(T.preco)}</b></section>`}
      <section class="pp-doc-cond"><h4>Condições</h4><ul>
        ${val ? `<li><b>Validade:</b> ${p.validade_dias} dias (até ${fd(val)}).</li>` : ''}<li><b>Data-base dos preços:</b> ${fd(p.data_base)}.</li>
        ${p.prazo_txt ? `<li><b>Prazo de execução:</b> ${esc(p.prazo_txt)}</li>` : ''}${p.pagamento_txt ? `<li><b>Pagamento:</b> ${esc(p.pagamento_txt)}</li>` : ''}</ul>
        ${p.texto_cliente ? `<p style="white-space:pre-wrap">${esc(p.texto_cliente)}</p>` : ''}</section>
      ${interna ? '' : `<footer class="pp-doc-ass"><div><span></span>${esc(d.empresa)}</div><div><span></span>De acordo: ${esc(p.cliente)}</div></footer>`}
    </article>`);
  $('#ppPrint').onclick = () => window.print();
}

ROTAS.push(
  [/^#\/orc\/orcamentos(?:\?(.*))?$/, vPropLista], [/^#\/orc\/orcamento\/novo$/, () => vProp()],
  [/^#\/orc\/orcamento\/([^/?]+)\/proposta(?:\?(.*))?$/, vPropDoc], [/^#\/orc\/orcamento\/([^/?]+)$/, vProp]
);
