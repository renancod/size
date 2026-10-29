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
    i.bdi = x.sem_bdi ? 0 : ppR2(base(p.bdi_base, i) * bdi);
    i.gestao = x.sem_gestao ? 0 : ppR2(base(p.gestao_base, i) * ges);
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
  // base e lista ao mesmo tempo (uma não espera a outra)
  const L = (await Promise.all([bpCarregar(), api('prop_listar')]))[1].propostas, p = new URLSearchParams(qs || ''), F = PP.fl;
  if (p.has('s')) F.s = p.get('s');
  const conta = s => L.filter(x => (s ? x.status === s : x.status !== 'Revisado')).length;
  bpTela('props', `<div class="cab"><h2>Orçamentos de clientes</h2><span class="contagem" id="ppN"></span>${bpGere() ? `<span class="acoes"><a class="btn sec peq" href="#/orc/orcamento/importar">${ic('upload')} Importar orçamento</a><a class="btn peq bp-ac" href="#/orc/orcamento/novo">${ic('plus')} Novo orçamento</a></span>` : ''}</div>
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
  let d = null;
  if (id) d = PP.d = (await Promise.all([bpCarregar(), api('prop_detalhe', { id })]))[1];
  else await bpCarregar();
  if (!id && !bpGere()) return bpSem('Gerir');
  const p = d ? d.proposta : { cliente: '', empreendimento: '', status: 'Rascunho', bdi_pct: 0, bdi_base: 'servicos', gestao_pct: 0, gestao_base: 'total', validade_dias: 30, data_base: hoje(), rotulo: 'novo' };
  titulo(id ? p.rotulo + ' · ' + p.empreendimento : 'Novo orçamento');
  const edita = !d || d.editavel;
  PP.ed = { id: id || '', p: Object.assign({}, p), linhas: d ? d.itens.map(i => i.tipo === 'E' ? { tipo: 'E', descricao: i.descricao } : { tipo: 'I', comp_cod: i.comp_cod, fonte: i.fonte || '', descricao: i.descricao, unidade: i.unidade, qtd: bpV(i.qtd), unit_mat: i.unit_mat, unit_mo: i.unit_mo, unit_eq: i.unit_eq, unit_sv: i.unit_sv, obs: i.obs, sem_bdi: !!i.sem_bdi, sem_gestao: !!i.sem_gestao }) : [{ tipo: 'E', descricao: 'Serviços preliminares' }], sujo: false };
  // orçamento grande abre com as etapas recolhidas (só nome, quantidade de itens e subtotal)
  if (PP.ed.linhas.filter(l => l.tipo === 'I').length > 10) PP.ed.linhas.forEach(l => { if (l.tipo === 'E') l._fechada = true; });
  const cab = `<a href="#/orc/orcamentos" class="linkbtn">${ic('back')} Orçamentos de clientes</a>
    <div class="bp-hero pp-hero"><div class="bp-hero-t"><span class="bp-selo">${ic('file')} Orçamento <code>${esc(p.rotulo)}</code></span><h2>${esc(p.empreendimento || 'Novo orçamento')}</h2>
      <p>${p.cliente ? esc(p.cliente) + (p.local ? ' · ' + esc(p.local) : '') + ' · ' : ''}${ppSt(p.status)}${d && d.obra ? ` · <a class="pp-obra" href="#" data-obra="${esc(d.obra.id)}">${ic('building')} obra ${esc(d.obra.nome)}</a>` : ''}</p>
      ${d ? `<div class="acoes" id="ppAcoes">${ppAcoes(d)}</div>` : ''}</div>
      <div class="bp-hero-custo"><div><small>Preço de venda</small><b class="bp-mono" id="ppTopo">${bpM(d ? d.total.preco : 0)}</b><small id="ppTopo2">${d ? 'custo ' + bpM(d.total.custo) + ' · BDI + gestão ' + ppPct(d.total.margem) : ''}</small></div></div></div>
    ${p.status === 'Perdido' && p.motivo ? `<div class="aviso warn">Perdido: ${esc(p.motivo)}</div>` : ''}
    ${d && d.revisoes.length > 1 ? `<div class="pp-revs">${d.revisoes.map(r => `<a class="chip ${r.id === id ? 'on' : ''}" href="#/orc/orcamento/${enc(r.id)}">${esc(r.rotulo)} <small>${esc(r.status)}</small></a>`).join('')}</div>` : ''}`;
  if (edita) bpTela('props', cab + ppEditorHtml(PP.ed.p, !d) + (d ? ppPortalHtml(d) : ''));
  else {
    bpTela('props', cab + ppLeitura(d) + ppPortalHtml(d));
    ppLigarVer(d);
  }
  ppLigarAcoes(d);
  if (d) ppPortalLigar(d);
  if (edita) ppEditorLigar();
}
function ppAcoes(d) {
  const p = d.proposta, g = d.nivel === 'Gerir', b = (a, i, t, cl) => `<button type="button" class="btn ${cl || 'sec'}" data-pa="${a}">${ic(i)} ${t}</button>`;
  return [
    `<a class="btn sec" href="#/orc/orcamento/${enc(p.id)}/proposta?m=c">${ic('file')} Proposta (cliente)</a>`,
    `<a class="btn sec" href="#/orc/orcamento/${enc(p.id)}/proposta?m=i">${ic('chart')} Planilha interna</a>`,
    `<a class="btn sec" href="#/orc/orcamento/${enc(p.id)}/cronograma">${ic('cal')} Cronograma</a>`,
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
/* ---------- portal do cliente: a quem este orçamento é mostrado, modo, contrato, aceite e considerações ---------- */
function ppPortalHtml(d) {
  const p = d.proposta, g = d.nivel === 'Gerir', a = p.aceite, C = d.comentarios || [], abertos = C.filter(c => c.status === 'aberto').length;
  if (!g && !p.cliente_id) return '';
  return `<div class="card" id="ppPortal"><div class="bp-h"><h3>${ic('eye')} Portal do cliente ${abertos ? `<span class="bp-flag">${abertos} ${abertos > 1 ? 'considerações' : 'consideração'} para responder</span>` : ''}</h3></div>
    ${a ? `<div class="aviso ok">${ic('check')} <b>Aceito pelo cliente no app</b> em ${esc(a.em)} por <b>${esc(a.nome)}</b>${a.doc ? ' (' + esc(a.doc) + ')' : ''} · ${esc(a.revisao)} · ${bpM(a.total)}${a.arquivo_id ? ` · <button type="button" class="linkbtn" id="ppAceArq">${ic('download')} contrato assinado enviado</button>` : ''}${p.status === 'Aprovado' && !d.obra ? '<br>Próximo passo: <b>Gerar obra</b> e liberar o acompanhamento em Administração → Portal do cliente.' : ''}</div>` : ''}
    ${g ? `<div class="g2"><label>Cliente que vê este orçamento<select id="ppCli"><option value="">— ninguém (não aparece no portal) —</option>${(d.clientes || []).map(c => `<option value="${esc(c.id)}" ${String(c.id) === String(p.cliente_id) ? 'selected' : ''}>${esc(c.nome)}${c.empresa ? ' · ' + esc(c.empresa) : ''}</option>`).join('')}</select></label>
      <label>O que ele vê<select id="ppModo"><option value="aberto" ${p.portal_modo !== 'fechado' ? 'selected' : ''}>Aberto: preços, custo, BDI, administração e insumos</option><option value="fechado" ${p.portal_modo === 'fechado' ? 'selected' : ''}>Fechado: só o total de cada etapa</option></select></label></div>
      <small class="mute">${!(d.clientes || []).length ? 'Cadastre o cliente em Administração → Portal do cliente. ' : ''}O cliente só vê as revisões <b>enviadas</b> (nunca rascunho). <b>Aberto</b> mostra a planilha completa (custo de material e mão de obra, BDI, administração e os insumos de cada composição); <b>fechado</b> mostra só o total de cada etapa.</small>
      <div class="acoes" style="margin-top:8px"><button type="button" class="btn sec peq" id="ppCliSalvar">${ic('check')} Salvar portal</button>
        ${p.contrato_id ? `<button type="button" class="btn sec peq" id="ppCtrRem">Remover contrato (${esc(p.contrato_nome)})</button>` : `<label class="btn sec peq" style="cursor:pointer">${ic('download')} Anexar contrato (PDF)<input type="file" id="ppCtr" accept="application/pdf" hidden></label>`}</div>` : ''}
    ${C.length ? `<div class="pp-coms">${C.map(c => `<div class="pp-com ${c.status}"><div><b>${esc(c.tipo_txt)}</b>${c.item_desc ? ' · ' + esc(c.item_desc) : ''} <small>${esc(c.autor)} · ${esc(c.em)}</small></div><p>${esc(c.texto)}</p>
      ${c.resposta ? `<div class="pp-resp"><small>Resposta de ${esc(c.respondido_por)} · ${esc(c.respondido_em)}</small><p>${esc(c.resposta)}</p></div>` : g ? `<div class="pp-resp-f"><input placeholder="Responder ao cliente…" data-resp="${esc(c.id)}"><button type="button" class="btn peq" data-respok="${esc(c.id)}">Responder</button></div>` : ''}</div>`).join('')}</div>`
      : p.cliente_id ? '<p class="mute" style="margin:8px 0 0">Nenhuma consideração do cliente ainda.</p>' : ''}</div>`;
}
function ppPortalLigar(d) {
  const p = d.proposta, re = () => vProp(p.id);
  const passo = async (fn, b) => { if (b) b.disabled = true; try { await fn(); } catch (e) { toast(e.message, 1); if (b) b.disabled = false; } };
  if ($('#ppCliSalvar')) $('#ppCliSalvar').onclick = e => passo(async () => { toast((await api('prop_portal', { id: p.id, cliente_id: $('#ppCli').value, modo: $('#ppModo').value })).msg); re(); }, e.target);
  if ($('#ppCtr')) $('#ppCtr').onchange = e => passo(async () => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 10e6) throw new Error('Arquivo grande demais (máx. 10 MB).');
    const b64 = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(f); });
    toast((await api('prop_contrato', { id: p.id, arquivo: { b64, nome: f.name, mime: f.type } })).msg); re();
  });
  if ($('#ppCtrRem')) $('#ppCtrRem').onclick = e => passo(async () => { if (!confirm('Remover o contrato anexado?')) return; toast((await api('prop_contrato', { id: p.id, remover: true })).msg); re(); }, e.target);
  $$('[data-respok]').forEach(b => { b.onclick = () => passo(async () => { const i = $(`[data-resp="${b.dataset.respok}"]`); toast((await api('prop_responder', { id: b.dataset.respok, resposta: i.value })).msg); re(); }, b); });
  if ($('#ppAceArq')) $('#ppAceArq').onclick = () => toast('O contrato assinado está na pasta "Orçamentos de clientes" do Drive.');
}
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
function ppTabela(itens, etapas, T, interna, doc) {
  const et = {};
  etapas.forEach(e => { et[e.codigo] = e; });
  // documento (proposta/interna): sem "R$" em cada célula (fica no cabeçalho), para a descrição caber numa linha
  // e a interna (11 colunas) caber num notebook a 100%
  const vm = doc ? v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : bpM;
  return `${doc ? '<p class="pp-moeda">Valores em R$</p>' : ''}<div class="rolar"><table class="tab bp-tab pp-tab"><thead><tr><th>Item</th><th>Descrição</th><th>Un</th><th class="n">Quant.</th>${interna ? '<th class="n">Custo unit.</th><th class="n">Material</th><th class="n">MO/serv.</th><th class="n">BDI</th><th class="n">Gestão</th>' : ''}<th class="n">Preço unit.</th><th class="n">Preço total</th></tr></thead><tbody>
    ${itens.map(i => i.tipo === 'E' ? `<tr class="pp-et"><td>${esc(i.codigo)}</td><td colspan="${interna ? 9 : 4}"><b>${esc(i.descricao)}</b></td><td class="n bp-mono"><b>${vm((et[i.codigo] || {}).preco)}</b></td></tr>`
      : `<tr><td>${esc(i.codigo)}</td><td>${i.comp_cod && i.fonte !== 'SINAPI-INSUMO' ? `<button type="button" class="bp-lnk pp-ver" data-ver-cod="${esc(i.codigo)}" title="Ver os insumos deste serviço">${esc(i.descricao)}</button>` : esc(i.descricao)}${interna && i.comp_cod ? ` <small>${i.fonte ? 'SINAPI ' : ''}<code>${esc(i.comp_cod)}</code></small>` : ''}${interna && (i.sem_bdi || i.sem_gestao) ? ` <span class="bp-flag">${[i.sem_bdi && 'sem BDI', i.sem_gestao && 'sem gestão'].filter(Boolean).join(' · ')}</span>` : ''}</td><td>${esc(i.unidade)}</td><td class="n bp-mono">${nf(i.qtd)}</td>
        ${interna ? `<td class="n bp-mono">${vm(i.custo_unit)}</td><td class="n bp-mono">${vm(i.v_mat)}</td><td class="n bp-mono">${vm(i.v_serv)}</td><td class="n bp-mono">${vm(i.bdi)}</td><td class="n bp-mono">${vm(i.gestao)}</td>` : ''}
        <td class="n bp-mono">${vm(i.preco_unit)}</td><td class="n bp-mono"><b>${vm(i.preco)}</b></td></tr>`).join('')}</tbody>
    ${doc && !interna ? '' /* na proposta o total vem logo abaixo, na faixa "Valor total da proposta" */
      : `<tfoot><tr><td colspan="${interna ? 10 : 5}">Total${interna ? ` · custo ${bpM(T.custo)} · BDI ${bpM(T.bdi)} · gestão ${bpM(T.gestao)}` : ''}</td><td class="n bp-mono"><b>${bpM(T.preco)}</b></td></tr></tfoot>`}</table></div>`;
}

/* ---------- editor ---------- */
function ppEditorHtml(p, novo) {
  const sel = (n, v) => `<select name="${n}">${PP_BASES.map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  return `<form id="ppF" class="bp-bancada" autocomplete="off"><div class="bp-ed-main">
    <details class="card pp-sec" ${novo ? 'open' : ''}><summary><h3>${ic('user')} Cliente e obra</h3><small>${esc([p.cliente, p.local].filter(Boolean).join(' · ') || 'preencha o cliente e o empreendimento')}</small></summary>
      <div class="bp-g3"><label class="bp-span2">Cliente<input name="cliente" required value="${esc(p.cliente || '')}" placeholder="ex: Construtora Mar Azul Ltda"></label><label>CNPJ / CPF<input name="cliente_doc" value="${esc(p.cliente_doc || '')}"></label></div>
      <div class="bp-g3"><label>Contato<input name="contato" value="${esc(p.contato || '')}"></label><label>Telefone<input name="telefone" type="tel" value="${esc(p.telefone || '')}"></label><label>E-mail<input name="email" type="email" value="${esc(p.email || '')}"></label></div>
      <div class="bp-g3"><label class="bp-span2">Empreendimento / obra<input name="empreendimento" required value="${esc(p.empreendimento || '')}" placeholder="ex: Loteamento Dunas · infraestrutura"></label><label>Local<input name="local" value="${esc(p.local || '')}" placeholder="cidade/UF"></label></div>
      <div class="bp-g3"><label>Data-base dos preços<input name="data_base" type="date" value="${esc(p.data_base || hoje())}"></label><label>Validade da proposta (dias)<input name="validade_dias" inputmode="numeric" value="${esc(p.validade_dias ?? 30)}"></label></div></details>
    <div class="card"><div class="bp-h"><h3>${ic('list')} Planilha <small>etapas e itens</small></h3><span class="acoes"><button type="button" class="btn sec peq" id="ppTodas">${ic('layers')} Recolher tudo</button><button type="button" class="btn sec peq" id="ppEt">${ic('plus')} Etapa</button><button type="button" class="btn sec peq" id="ppDir">${ic('plus')} Item de preço direto</button></span></div>
      <div class="bp-add"><div class="busca">${ic('search')}<input id="ppBusca" data-busca placeholder="Incluir serviço da base de preços: código ou descrição  ( / )"></div><div class="bp-res" id="ppRes" hidden></div></div>
      <div class="pp-alvo" id="ppAlvo" hidden></div>
      <div id="ppLin" class="pp-lin"></div></div>
    <details class="card pp-sec" ${novo ? 'open' : ''}><summary><h3>${ic('percent')} BDI e gestão</h3><small>BDI ${esc(bpV(p.bdi_pct))}% ${p.bdi_base === 'total' ? 'sobre o total' : 's/ serviços'} · gestão ${esc(bpV(p.gestao_pct))}% ${p.gestao_base === 'total' ? 'sobre o total' : 's/ serviços'}</small></summary>
      <div class="pp-taxas"><label>BDI (%)<input name="bdi_pct" inputmode="decimal" value="${esc(bpV(p.bdi_pct))}"></label><label>sobre ${sel('bdi_base', p.bdi_base)}</label>
        <label>Gestão de obra (%)<input name="gestao_pct" inputmode="decimal" value="${esc(bpV(p.gestao_pct))}"></label><label>sobre ${sel('gestao_base', p.gestao_base)}</label></div>
      <small>Ex. da AVA: BDI 18% só sobre mão de obra e serviços e gestão 6% sobre o custo total. O preço de venda de cada item = custo + BDI + gestão.</small>
      <div class="pp-sinreg"><label>Itens do SINAPI <select name="sinapi_regime"><option value="sd" ${p.sinapi_regime !== 'cd' ? 'selected' : ''}>Não desonerado</option><option value="cd" ${p.sinapi_regime === 'cd' ? 'selected' : ''}>Desonerado</option></select></label>
        <small>vale para os itens do SINAPI incluídos daqui em diante; os que já estão mantêm o custo (para trocar todos, use "Atualizar preços pela base").</small></div></details>
    <details class="card pp-sec" ${novo ? 'open' : ''}><summary><h3>${ic('file')} Texto da proposta</h3><small>${esc(p.prazo_txt || p.pagamento_txt ? [p.prazo_txt, p.pagamento_txt].filter(Boolean).join(' · ') : 'prazo, pagamento e observações')}</small></summary>
      <div class="g2"><label>Prazo de execução<input name="prazo_txt" value="${esc(p.prazo_txt || '')}" placeholder="ex: 8 meses a partir da ordem de serviço"></label><label>Condições de pagamento<input name="pagamento_txt" value="${esc(p.pagamento_txt || '')}" placeholder="ex: medições mensais, pagamento em 15 dias"></label></div>
      <label>Observações para o cliente<textarea name="texto_cliente" rows="3" placeholder="ex: não inclui licenças, projetos e ligações definitivas">${esc(p.texto_cliente || '')}</textarea></label>
      <label>Observações internas <small>(não saem na proposta)</small><textarea name="obs" rows="2">${esc(p.obs || '')}</textarea></label></details>
  </div><aside class="bp-ed-lado"><div class="bp-resumo" id="ppResumo"></div></aside></form>`;
}
function ppEditorLigar() {
  const f = $('#ppF'), E = PP.ed;
  f.oninput = e => { E.sujo = true; if (/^(bdi|gestao)_/.test(e.target.name)) { ppColher(); ppDesenhar(false); } };
  f.onchange = e => { if (/^(bdi|gestao)_/.test(e.target.name)) { ppColher(); ppDesenhar(false); } };
  f.onkeydown = e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); };
  f.onsubmit = e => { e.preventDefault(); ppSalvar(); };
  // campo obrigatório dentro de um bloco recolhido: abre o bloco para mostrar o que falta
  f.addEventListener('invalid', e => { const d = e.target.closest('details'); if (d) d.open = true; }, true);
  $('#ppEt').onclick = () => { ppColher(); const et = { tipo: 'E', descricao: '' }; E.linhas.push(et); E.alvo = et; E.sujo = true; ppDesenhar(true); ppMostraAlvo(); ppEditarEtapa(E.linhas.length - 1); };
  $('#ppDir').onclick = () => ppIncluir({ tipo: 'I', comp_cod: '', descricao: '', unidade: 'vb', qtd: '1', unit_mat: '', unit_mo: '', unit_eq: 0, unit_sv: 0 }, true);
  // recolher / expandir todas as etapas de uma vez (tela mais limpa)
  $('#ppTodas').onclick = () => { const ets = E.linhas.filter(l => l.tipo === 'E'), fecha = ets.some(l => !l._fechada); ets.forEach(l => { l._fechada = fecha; }); ppDesenhar(true); };
  ppBusca();
  ppDesenhar(true);
  ppMostraAlvo();
}
/* etapa onde entram os itens da busca e do "item de preço direto" (o "+ Item" da etapa escolhe) */
function ppMostraAlvo() {
  const E = PP.ed, el = $('#ppAlvo');
  if (!el) return;
  if (E.alvo && !E.linhas.includes(E.alvo)) E.alvo = null;
  const n = E.alvo ? E.linhas.filter((l, k) => l.tipo === 'E' && k <= E.linhas.indexOf(E.alvo)).length : 0;
  el.hidden = !E.alvo;
  el.innerHTML = E.alvo ? `${ic('plus')} Incluindo itens na etapa <b>${n} · ${esc(E.alvo.descricao || 'sem nome')}</b><button type="button" class="linkbtn" id="ppAlvoX">no fim da planilha</button>` : '';
  if ($('#ppAlvoX')) $('#ppAlvoX').onclick = () => { E.alvo = null; ppMostraAlvo(); ppDesenhar(true); };
}
function ppColher() {
  const f = $('#ppF');
  if (!f) return;
  ['cliente', 'cliente_doc', 'contato', 'telefone', 'email', 'empreendimento', 'local', 'data_base', 'validade_dias', 'bdi_pct', 'bdi_base', 'gestao_pct', 'gestao_base', 'sinapi_regime', 'prazo_txt', 'pagamento_txt', 'texto_cliente', 'obs'].forEach(k => { if (f.elements[k]) PP.ed.p[k] = f.elements[k].value; });
}
function ppIncluir(l, foco) {
  ppColher();
  const E = PP.ed;
  // entra no fim da etapa escolhida ("+ Item" da etapa); sem escolha, no fim da planilha (última etapa)
  let pos = E.linhas.length;
  if (E.alvo && E.linhas.includes(E.alvo)) {
    const i = E.linhas.indexOf(E.alvo), prox = E.linhas.findIndex((x, k) => k > i && x.tipo === 'E');
    pos = prox < 0 ? E.linhas.length : prox;
    E.alvo._fechada = false;
  } else { const ult = E.linhas.filter(x => x.tipo === 'E').pop(); if (ult) ult._fechada = false; }
  E.linhas.splice(pos, 0, l); E.sujo = true;
  ppDesenhar(true);
  const r = $(`#ppLin .pp-r.pi[data-n="${pos}"]`);
  if (r) { r.classList.add('novo'); r.scrollIntoView({ block: 'nearest' }); }
  // preço direto ou celular: abre a edição; computador: cursor na quantidade da linha
  if (!l.comp_cod || ppEstreito()) return ppEditarItem(pos);
  const i = r && $('.pp-qin', r);
  if (i) { i.focus(); i.select(); }
}
/* desenha as linhas (estrutura = refaz tudo; senão só os números) */
function ppDesenhar(estrutura) {
  const E = PP.ed, C = ppCalc(E.p, E.linhas);
  if (estrutura) {
    // linhas fechadas (só leitura): mexer no item ou na etapa é pelo "Editar"; remover só lá dentro, com confirmação.
    // No computador a quantidade continua editável direto na linha.
    let fechada = false;   // itens de etapa recolhida não são desenhados (continuam no cálculo)
    const ed = t => `<button type="button" class="pp-edit" data-a="ed" title="Editar ${t}">${ic('edit')}<span>Editar</span></button>`;
    $('#ppLin').innerHTML = E.linhas.length ? E.linhas.map((l, n) => {
      const c = C.linhas[n];
      if (l.tipo === 'E') {
        fechada = !!l._fechada;
        return `<div class="pp-r pe ${fechada ? 'fechada' : ''} ${E.alvo === l ? 'alvo' : ''}" data-n="${n}"><button type="button" class="pp-tg" data-a="tg" title="${fechada ? 'Expandir' : 'Recolher'} a etapa">${ic('chevron')}</button><span class="pp-cod">${esc(c.codigo)}</span>
          <button type="button" class="pp-en" data-a="tg">${esc(l.descricao) || '<i>sem nome</i>'}</button><small class="pp-ni" data-ni></small><span class="bp-mono pp-sub" data-sub></span>
          <button type="button" class="btn sec peq pp-add" data-a="add" title="Incluir um serviço nesta etapa">${ic('plus')}<span>Item</span></button>${ed('a etapa')}</div>`;
      }
      if (fechada) return '';
      const comp = l.comp_cod ? BP.C[l.comp_cod] : null, fl = [l.sem_bdi && 'sem BDI', l.sem_gestao && 'sem gestão'].filter(Boolean);
      return `<div class="pp-r pi ${l.comp_cod ? 'base' : 'dir'}" data-n="${n}"><span class="pp-cod">${esc(c.codigo)}</span>
        <div class="pp-rd"><b>${esc(l.descricao) || '<i>sem descrição</i>'}</b><small>${l.fonte ? `<span class="sin-tag">SINAPI</span> <code>${esc(l.comp_cod)}</code>${l.fonte === 'SINAPI-INSUMO' ? ' · insumo' : ''}` : l.comp_cod ? `<code>${esc(l.comp_cod)}</code> · da base${comp ? '' : ' (não está mais na base)'}` : 'preço direto'} · custo ${bpM(c.custo_unit)}/${esc(l.unidade)}${l.obs ? ' · ' + esc(l.obs) : ''}${fl.map(f => ` <span class="bp-flag">${f}</span>`).join('')}</small></div>
        <div class="pp-rq"><small>Quant.</small><span><input class="pp-qin" data-c="qtd" inputmode="decimal" value="${esc(l.qtd)}" placeholder="0" aria-label="Quantidade"><b class="pp-qtx bp-mono">${l.qtd === '' ? '—' : nf(bpPn(l.qtd))}</b> <em>${esc(l.unidade)}</em></span></div>
        <div class="pp-rv un"><small>Preço unit.</small><b class="bp-mono" data-pu></b></div><div class="pp-rv"><small>Total</small><b class="bp-mono" data-pt></b></div>${ed('o item')}</div>`;
    }).join('') : `<div class="bp-itens-vazio">${ic('list')}<b>Planilha vazia</b><small>Crie uma etapa e busque acima os serviços da base de preços (ou inclua um item de preço direto).</small></div>`;
    const tb = $('#ppTodas');
    if (tb) tb.lastChild.textContent = E.linhas.some(l => l.tipo === 'E' && !l._fechada) ? ' Recolher tudo' : ' Expandir tudo';
    $$('#ppLin .pp-r').forEach(el => {
      const n = +el.dataset.n;
      $$('input[data-c]', el).forEach(i => { i.oninput = () => { E.linhas[n][i.dataset.c] = i.value; E.sujo = true; ppDesenhar(false); }; });
      // celular: tocar no item abre a edição (os números ficam só para leitura)
      if (el.classList.contains('pi')) el.onclick = e => { if (!e.target.closest('button,input') && ppEstreito()) ppEditarItem(n); };
      $$('[data-a]', el).forEach(b => { b.onclick = () => {
        ppColher();
        const a = b.dataset.a, L = E.linhas;
        if (a === 'tg') { L[n]._fechada = !L[n]._fechada; ppDesenhar(true); return; }
        if (a === 'add') {
          E.alvo = L[n]; L[n]._fechada = false;
          ppDesenhar(true); ppMostraAlvo();
          const bq = $('#ppBusca'); bq.scrollIntoView({ block: 'center' }); bq.focus();
          return;
        }
        if (a === 'ed') L[n].tipo === 'E' ? ppEditarEtapa(n) : ppEditarItem(n);
      }; });
    });
  }
  const etapas = {};
  C.etapas.forEach(e => { etapas[e.codigo] = e; });
  $$('#ppLin .pp-r').forEach(el => {
    const c = C.linhas[+el.dataset.n];
    if (c.tipo === 'E') {
      const e = etapas[c.codigo] || {}, s = $('[data-sub]', el), ni = $('[data-ni]', el);
      if (s) s.textContent = bpM(e.preco);
      if (ni) ni.textContent = plural(e.itens || 0, 'item', 'itens');
      return;
    }
    $('[data-pu]', el).textContent = bpM(c.preco_unit); $('[data-pt]', el).textContent = bpM(c.preco);
    const qt = $('.pp-qtx', el), q = E.linhas[+el.dataset.n].qtd;
    if (qt) qt.textContent = q === '' ? '—' : nf(bpPn(q));
  });
  const T = C.total, salvo = !!E.id;
  $('#ppTopo').textContent = bpM(T.preco);
  $('#ppTopo2').textContent = 'custo ' + bpM(T.custo) + ' · BDI + gestão ' + ppPct(T.margem);
  $('#ppResumo').innerHTML = `<div class="bp-res-top">${bpDonut({ mat: T.v_mat, mo: T.v_serv, eq: T.bdi, sv: T.gestao, total: T.preco })}<div><small>Preço de venda</small><b class="bp-mono">${bpM(T.preco)}</b><small>${plural(T.itens, 'item', 'itens')}</small></div></div>
    <div class="bp-res-cats">${[['mat', 'Material', T.v_mat], ['mo', 'MO e serviços', T.v_serv], ['eq', 'BDI', T.bdi], ['sv', 'Gestão', T.gestao]].map(([k, t, v]) => `<div class="${v ? '' : 'zero'}"><i class="bp-dot k-${k}"></i><span>${t}</span><b class="bp-mono">${bpM(v)}</b><small>${T.preco ? Math.round(v / T.preco * 100) + '%' : ''}</small></div>`).join('')}</div>
    <small class="bp-res-n">custo direto ${bpM(T.custo)} · material ${ppPct(T.pct_material)} do custo</small>
    <button class="btn full bp-ac" id="ppSalvar">${ic('check')} ${salvo ? 'Salvar orçamento' : 'Criar orçamento'}</button>`;
}
/* celular (planilha estreita): quantidade só pelo "Editar" */
const ppEstreito = () => ($('#ppLin') ? $('#ppLin').getBoundingClientRect().width : 999) < 560;
/* "Desfazer" por alguns segundos depois de remover item ou etapa */
function ppDesfazer(texto, antes) {
  const p = document.createElement('p');
  p.className = 'pp-undo';
  p.innerHTML = `<span>${esc(texto)}</span><button type="button">Desfazer</button>`;
  $('#toast').appendChild(p);
  const t = setTimeout(() => p.remove(), 9000);
  $('button', p).onclick = () => { clearTimeout(t); p.remove(); if (!PP.ed || !$('#ppLin')) return; PP.ed.linhas = antes; PP.ed.sujo = true; ppDesenhar(true); ppMostraAlvo(); toast('Desfeito.'); };
}
/* depois de mover: redesenha e destaca a linha */
function ppDestaca(l) {
  const E = PP.ed;
  for (let k = E.linhas.indexOf(l); k >= 0; k--) if (E.linhas[k].tipo === 'E') { E.linhas[k]._fechada = false; break; }
  E.sujo = true; ppDesenhar(true); ppMostraAlvo();
  const r = $(`#ppLin .pp-r[data-n="${E.linhas.indexOf(l)}"]`);
  if (r) { r.classList.add('novo'); r.scrollIntoView({ block: 'nearest' }); }
}
/* editar item: quantidade, BDI/gestão, observação, posição e etapa; (preço direto) descrição, unidade, material e MO; remover com confirmação */
function ppEditarItem(n) {
  ppColher();
  const E = PP.ed, L = E.linhas, l = L[n];
  if (!l || l.tipo !== 'I') return;
  const C = ppCalc(E.p, L), c = C.linhas[n], dir = !l.comp_cod;
  const ets = L.map((x, k) => [x, k]).filter(([x]) => x.tipo === 'E');
  let minha = -1;
  for (let k = n; k >= 0; k--) if (L[k].tipo === 'E') { minha = k; break; }
  const f = modal(`${ic('edit')} Item ${esc(c.codigo)}`, `
    ${dir ? `<label>Descrição<input name="descricao" required value="${esc(l.descricao)}" placeholder="Descrição do item (preço direto)"></label>
      <div class="bp-g3"><label>Unidade<input name="unidade" required value="${esc(l.unidade)}"></label><label>Material / un (R$)<input name="unit_mat" inputmode="decimal" value="${esc(bpV(l.unit_mat))}" placeholder="0,00"></label><label>Mão de obra / un (R$)<input name="unit_mo" inputmode="decimal" value="${esc(bpV(l.unit_mo))}" placeholder="0,00"></label></div>`
      : `<div class="pp-ed-cab"><div><b>${esc(l.descricao)}</b><small>${l.fonte ? '<span class="sin-tag">SINAPI</span> ' : ''}<code>${esc(l.comp_cod)}</code> · ${l.fonte ? 'SINAPI' : 'da base'} · custo ${bpM(c.custo_unit)}/${esc(l.unidade)}</small></div>${l.fonte === 'SINAPI-INSUMO' ? '' : `<button type="button" class="btn sec peq" id="ppEdIns">${ic('layers')} Ver insumos</button>`}</div>`}
    <div class="bp-g3"><label>Quantidade (${esc(l.unidade)})<input name="qtd" inputmode="decimal" required value="${esc(l.qtd)}" placeholder="0"></label><label class="bp-span2">Observação<input name="obs" value="${esc(l.obs || '')}" placeholder="opcional"></label></div>
    <div class="pp-ed-tx"><label class="ck"><input type="checkbox" name="bdi" ${l.sem_bdi ? '' : 'checked'}> Entra no BDI</label><label class="ck"><input type="checkbox" name="ges" ${l.sem_gestao ? '' : 'checked'}> Entra na gestão</label></div>
    <div class="pp-ed-pv" id="ppEdPv"></div>
    <div class="pp-ed-mv"><b>Posição</b><button type="button" class="btn sec peq" data-mv="-1" ${n > 1 ? '' : 'disabled'}>${ic('up')} Subir</button><button type="button" class="btn sec peq" data-mv="1" ${n < L.length - 1 ? '' : 'disabled'}>${ic('down')} Descer</button>
      ${ets.length > 1 ? `<label>Etapa<select name="etapa">${ets.map(([x, k]) => `<option value="${k}" ${k === minha ? 'selected' : ''}>${esc(C.linhas[k].codigo)} · ${esc(x.descricao || 'sem nome')}</option>`).join('')}</select></label>` : ''}</div>
    <div class="pp-ed-perigo"><button type="button" class="btn sec pp-rem" id="ppEdRem">${ic('trash')} Remover item</button></div>`, {
    ok: 'Pronto',
    onOk: ff => {
      aplicar(ff);
      const alvo = ff.etapa ? +ff.etapa.value : minha;
      if (alvo !== minha && L[alvo]) {           // outra etapa: vai para o fim dela
        L.splice(L.indexOf(l), 1);
        const i = L.indexOf(ets.find(([, k]) => k === alvo)[0]), prox = L.findIndex((x, k) => k > i && x.tipo === 'E');
        L.splice(prox < 0 ? L.length : prox, 0, l);
      }
      ppDestaca(l);
    }
  });
  const ler = ff => {
    const o = Object.assign({}, l, { qtd: ff.qtd.value, obs: ff.obs.value.trim(), sem_bdi: !ff.bdi.checked, sem_gestao: !ff.ges.checked });
    if (dir) Object.assign(o, { descricao: ff.descricao.value.trim(), unidade: ff.unidade.value.trim(), unit_mat: ff.unit_mat.value, unit_mo: ff.unit_mo.value });
    return o;
  };
  const aplicar = ff => { Object.assign(l, ler(ff)); E.sujo = true; };
  const previa = () => {
    const tmp = L.slice(); tmp[n] = ler(f);
    const x = ppCalc(E.p, tmp).linhas[n];
    $('#ppEdPv').innerHTML = `<span>Preço unit. <b class="bp-mono">${bpM(x.preco_unit)}</b></span><span>Total <b class="bp-mono">${bpM(x.preco)}</b></span><small>custo ${bpM(x.custo)} · BDI ${bpM(x.bdi)} · gestão ${bpM(x.gestao)}</small>`;
  };
  f.addEventListener('input', previa); f.addEventListener('change', previa); previa();
  if ($('#ppEdIns')) $('#ppEdIns').onclick = () => { aplicar(f); if (l.fonte) return sinVerComposicao(l.comp_cod, E.p.sinapi_regime, bpPn(l.qtd), l.descricao).catch(e => toast(e.message, 1)); ppInsumos(l, ppCalc(E.p, L).linhas[n]); };
  $$('[data-mv]', f).forEach(b => { b.onclick = () => {
    aplicar(f);
    const m = n + +b.dataset.mv;
    [L[n], L[m]] = [L[m], L[n]];
    fecharModal(); ppDestaca(l);
  }; });
  $('#ppEdRem').onclick = () => {
    if (!confirm(`Remover o item ${c.codigo} · ${l.descricao} (${bpM(c.preco)})?`)) return;
    const antes = L.slice();
    L.splice(n, 1); E.sujo = true;
    fecharModal(); ppDesenhar(true); ppMostraAlvo();
    ppDesfazer(`Item ${c.codigo} removido`, antes);
  };
  setTimeout(() => { const q = f.qtd; if (q && !ppEstreito()) { q.focus(); q.select(); } }, 60);
}
/* editar etapa: nome, posição (a etapa anda com os itens) e excluir (avisa quantos itens e quanto sai junto) */
function ppEditarEtapa(n) {
  ppColher();
  const E = PP.ed, L = E.linhas, l = L[n];
  if (!l || l.tipo !== 'E') return;
  const C = ppCalc(E.p, L), cod = C.linhas[n].codigo, e = C.etapas.find(x => x.codigo === cod) || { itens: 0, preco: 0 };
  const fimBloco = i => { let k = i + 1; while (k < L.length && L[k].tipo !== 'E') k++; return k; };
  const nEt = L.filter(x => x.tipo === 'E').length, ordem = L.slice(0, n + 1).filter(x => x.tipo === 'E').length;
  const f = modal(`${ic('edit')} Etapa ${esc(cod)}`, `<label>Nome da etapa<input name="nome" required value="${esc(l.descricao)}" placeholder="ex: Pavimentação"></label>
    <small>${plural(e.itens, 'item', 'itens')} · ${bpM(e.preco)}</small>
    <div class="pp-ed-mv"><b>Posição</b><button type="button" class="btn sec peq" data-mv="-1" ${ordem > 1 ? '' : 'disabled'}>${ic('up')} Subir etapa</button><button type="button" class="btn sec peq" data-mv="1" ${ordem < nEt ? '' : 'disabled'}>${ic('down')} Descer etapa</button><small>a etapa muda de lugar com todos os itens dela</small></div>
    <div class="pp-ed-perigo"><button type="button" class="btn sec pp-rem" id="ppEdRem">${ic('trash')} Excluir etapa</button>${e.itens ? `<small>os ${plural(e.itens, 'item', 'itens')} dela (${bpM(e.preco)}) saem junto</small>` : ''}</div>`, {
    ok: 'Pronto',
    onOk: ff => { const v = ff.nome.value.trim(); if (!v) { toast('Dê um nome para a etapa.', 1); return false; } l.descricao = v; E.sujo = true; ppDesenhar(true); ppMostraAlvo(); }
  });
  $$('[data-mv]', f).forEach(b => { b.onclick = () => {
    const v = f.nome.value.trim(); if (v) l.descricao = v;
    const fim = fimBloco(n), bloco = L.slice(n, fim);
    if (+b.dataset.mv < 0) {
      let p = n - 1; while (p > 0 && L[p].tipo !== 'E') p--;
      L.splice(n, bloco.length); L.splice(p, 0, ...bloco);
    } else {
      const fim2 = fimBloco(fim), prox = L.slice(fim, fim2);
      L.splice(n, bloco.length + prox.length, ...prox, ...bloco);
    }
    fecharModal(); ppDestaca(l);
  }; });
  $('#ppEdRem').onclick = () => {
    if (!confirm(`Excluir a etapa ${cod} · ${l.descricao || 'sem nome'}${e.itens ? ` e os ${plural(e.itens, 'item', 'itens')} dela (${bpM(e.preco)})` : ''}?`)) return;
    const antes = L.slice();
    L.splice(n, fimBloco(n) - n); E.sujo = true;
    fecharModal(); ppDesenhar(true); ppMostraAlvo();
    ppDesfazer(`Etapa ${cod} excluída`, antes);
  };
  setTimeout(() => { if (!l.descricao) f.nome.focus(); }, 60);
}
async function ppSalvar(silencioso) {
  ppColher();
  const E = PP.ed, b = $('#ppSalvar');
  if (b) { b.disabled = true; b.textContent = 'Salvando…'; }
  try {
    const r = await api('prop_salvar', { proposta: Object.assign({}, E.p, { id: E.id || undefined }), itens: E.linhas.map(l => l.tipo === 'E' ? { tipo: 'E', descricao: l.descricao }
      : { tipo: 'I', comp_cod: l.comp_cod, fonte: l.fonte || '', descricao: l.descricao, unidade: l.unidade, qtd: bpPn(l.qtd), unit_mat: bpPn(l.unit_mat), unit_mo: bpPn(l.unit_mo), unit_eq: bpPn(l.unit_eq), unit_sv: bpPn(l.unit_sv), obs: l.obs || '', sem_bdi: !!l.sem_bdi, sem_gestao: !!l.sem_gestao }) });
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
  // SINAPI: o índice (guardado no aparelho) é carregado na primeira busca; enquanto carrega, só a base da Size
  let sin = null, sinPedido = false;
  const carregarSin = () => {
    if (sinPedido || !window.sinIndice) return;
    sinPedido = true;
    sinIndice().then(ix => { sin = ix; if (document.activeElement === inp) desenhar(); }).catch(() => { sin = null; });
  };
  const desenhar = () => {
    const t = norm(inp.value).split(/\s+/).filter(Boolean);
    if (!t.length) { res.hidden = true; return; }
    carregarSin();
    const reg = ($('#ppF') && $('#ppF').elements.sinapi_regime ? $('#ppF').elements.sinapi_regime.value : PP.ed.p.sinapi_regime) === 'cd' ? 'cd' : 'sd';
    const base = BP.d.composicoes.filter(c => c.ativo && t.every(w => norm(c.codigo + ' ' + c.descricao + ' ' + c.grupo).includes(w))).slice(0, 20);
    const sc = sin && sin.mes ? sinBuscar(sin.C, inp.value, 15).filter(x => x[reg] > 0) : [], si = sin && sin.mes ? sinBuscar(sin.I, inp.value, 8).filter(x => x[reg] > 0) : [];
    lista = base.map(c => ({ k: 'b', c })).concat(sc.map(c => ({ k: 's', c })), si.map(c => ({ k: 'si', c })));
    sel = 0;
    const tag = `<span class="sin-tag">SINAPI</span>`;
    res.innerHTML = lista.map(({ k, c }, n) => k === 'b'
      ? `<button type="button" class="bp-op ${n ? '' : 'on'}" data-n="${n}">${bpDonut(c.custo, 'mini')}<span><b>${esc(c.descricao)}</b><small><code>${esc(c.codigo)}</code> · ${esc(c.unidade)}${c.grupo ? ' · ' + esc(c.grupo) : ''}</small></span><span class="bp-mono">${bpM(c.custo.total)}</span></button>`
      : `<button type="button" class="bp-op ${n ? '' : 'on'}" data-n="${n}">${tag}<span><b>${esc(c.descricao)}</b><small><code>${esc(c.codigo)}</code> · ${esc(c.unidade)} · ${k === 's' ? esc(c.grupo) : 'insumo · ' + esc(c.classe.toLowerCase())} · ${SIN_REG[reg].toLowerCase()} ${sinMesTxt(sin.mes)}</small></span><span class="bp-mono">${bpM(c[reg])}</span></button>`).join('')
      + (sinPedido && !sin ? '<div class="bp-res-n"><span class="spin"></span> buscando também no SINAPI…</div>' : '')
      + `<button type="button" class="bp-op bp-op-novo" data-n="dir">${ic('plus')}<span><b>Item de preço direto: “${esc(inp.value.trim())}”</b><small>sem composição: você digita material e mão de obra por unidade</small></span></button>`;
    res.hidden = false;
    $$('.bp-op', res).forEach(b => { b.onmousedown = e => e.preventDefault(); b.onclick = () => escolher(b.dataset.n); });
  };
  const escolher = n => {
    res.hidden = true;
    const txt = inp.value.trim();
    inp.value = '';
    if (n === 'dir') return ppIncluir({ tipo: 'I', comp_cod: '', descricao: txt, unidade: 'vb', qtd: '1', unit_mat: '', unit_mo: '', unit_eq: 0, unit_sv: 0 }, true);
    const e = lista[+n];
    if (!e) return;
    if (e.k !== 'b') {
      const reg = ($('#ppF') && $('#ppF').elements.sinapi_regime ? $('#ppF').elements.sinapi_regime.value : PP.ed.p.sinapi_regime) === 'cd' ? 'cd' : 'sd';
      return ppIncluir(Object.assign({ tipo: 'I', comp_cod: e.c.codigo, fonte: e.k === 's' ? 'SINAPI' : 'SINAPI-INSUMO', descricao: e.c.descricao, unidade: e.c.unidade, qtd: '' }, sinCustos(e.c, e.k === 's' ? 'C' : 'I', reg)));
    }
    const c = e.c;
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

/* ---------- insumos de um item do orçamento (só consulta) ----------
 * abre a composição da base até os insumos: coeficiente, preço, custo por unidade e quanto vai para a quantidade do item.
 * l = linha do orçamento (comp_cod, qtd, custos congelados); c = a mesma linha já calculada (custo_unit) */
/* descrição do item com composição (leitura, proposta e planilha interna): abre os insumos (base da Size ou SINAPI) */
function ppLigarVer(d) {
  $$('[data-ver-cod]').forEach(b => {
    b.onclick = async () => {
      const i = d.itens.find(x => x.codigo === b.dataset.verCod);
      if (!i) return;
      try { if (i.fonte) await sinVerComposicao(i.comp_cod, d.proposta.sinapi_regime, i.qtd, i.descricao); else { await bpCarregar(); ppInsumos(i, i); } }
      catch (e) { toast(e.message, 1); }
    };
  });
}
function ppInsumos(l, c) {
  const comp = BP.C[l.comp_cod], q = bpPn(l.qtd) || 0, congelado = c.custo_unit != null ? c.custo_unit : bpPn(l.unit_mat) + bpPn(l.unit_mo) + bpPn(l.unit_eq) + bpPn(l.unit_sv);
  if (!comp) return modal('Insumos', `<div class="aviso warn">A composição <code>${esc(l.comp_cod)}</code> não está mais na base de preços. O orçamento continua com o custo congelado de ${bpM(congelado)}/${esc(l.unidade)}.</div>`, { semRodape: true });
  const lista = Object.values(bpExplodir(comp.itens, 1, {}, [comp.codigo])).map(a => Object.assign(a, { custo: a.coef * a.preco }));
  const ordem = ['Material', 'Mão de obra', 'Equipamento', 'Serviço'], porTipo = ordem.map(t => [t, lista.filter(a => a.i.tipo === t).sort((x, y) => y.custo - x.custo)]).filter(([, l2]) => l2.length);
  const base = comp.custo.total, dif = Math.abs(base - congelado) > 0.005;
  modal(`${ic('layers')} ${esc(c.codigo || '')} · Insumos do serviço`, `<div class="pp-ins-cab"><b>${esc(l.descricao)}</b>
      <small><code>${esc(comp.codigo)}</code> · ${nf(q)} ${esc(l.unidade)} no orçamento · custo ${bpM(congelado)}/${esc(l.unidade)} · total ${bpM(q * congelado)}</small></div>
    ${dif ? `<div class="aviso warn">O orçamento está com o custo congelado de <b>${bpM(congelado)}</b>/${esc(l.unidade)}; na base hoje esta composição custa <b>${bpM(base)}</b>. A lista abaixo é a da base hoje. Para trazer os preços novos, use "Atualizar preços pela base".</div>` : ''}
    <div class="rolar"><table class="tab bp-tab"><thead><tr><th>Insumo</th><th>Un</th><th class="n">Coef. por ${esc(l.unidade)}</th><th class="n">Preço</th><th class="n">Custo / ${esc(l.unidade)}</th><th class="n">Quant. total</th><th class="n">Custo total</th></tr></thead><tbody>
    ${porTipo.map(([t, l2]) => `<tr class="pp-et"><td colspan="7"><i class="bp-dot k-${bpK(t)}"></i> <b>${t}</b> · ${bpM(l2.reduce((s, a) => s + a.custo, 0))}/${esc(l.unidade)}</td></tr>`
      + l2.map(a => `<tr><td><div class="bp-cel">${bpFoto(a.i, 'mini zoom')}<span>${esc(a.i.descricao)} <small><code>${esc(a.i.codigo)}</code></small>${a.proprio ? ' <span class="bp-flag">preço próprio</span>' : ''}</span></div></td><td>${esc(a.i.unidade)}</td>
        <td class="n bp-mono">${bpN(a.coef)}</td><td class="n bp-mono">${bpM(a.preco)}</td><td class="n bp-mono">${bpM(a.custo)}</td><td class="n bp-mono"><b>${nf(q * a.coef)}</b></td><td class="n bp-mono">${bpM(q * a.custo)}</td></tr>`).join('')).join('')}</tbody>
    <tfoot><tr><td colspan="4">Custo do serviço (base hoje)</td><td class="n bp-mono"><b>${bpM(base)}</b></td><td></td><td class="n bp-mono"><b>${bpM(q * base)}</b></td></tr></tfoot></table></div>
    <div class="acoes" style="margin-top:12px"><a class="btn sec peq" href="#/orc/composicao/${enc(comp.codigo)}">${ic('layers')} Abrir a ficha da composição</a></div>`, { semRodape: true, larga: true });
}

/* ---------- gerar a obra ---------- */
function ppGerarObra(d) {
  const p = d.proposta, sig = norm(p.empreendimento).toUpperCase().replace(/[^A-Z ]/g, '').split(/\s+/).filter(w => w.length > 2).map(w => w[0]).join('').slice(0, 4) || 'OB';
  modal(`${ic('building')} Gerar obra a partir de ${esc(p.rotulo)}`, `<p><small>Cria a obra com a planilha e a pasta no Drive. Cada etapa vira uma <b>frente geral</b> do Orçamento da obra, com os serviços (quantidade, material, mão de obra e preço de venda) e os <b>materiais</b> das composições. Depois é só liberar o acesso das pessoas.</small></p>
    <div class="bp-g3"><label class="bp-span2">Nome da obra<input name="nome" required value="${esc(p.empreendimento)}"></label><label>Sigla (2 a 5 letras)<input name="sigla" required maxlength="5" value="${esc(sig)}" style="text-transform:uppercase"></label></div>
    <label>Endereço<input name="endereco" value="${esc(p.local || '')}"></label>
    <h3 style="margin:8px 0 0">Localização <small>(busque o endereço ou toque no mapa)</small></h3>${mapaLocalHtml('', '')}
    <div class="aviso info">${plural(d.etapas.filter(e => e.itens).length, 'frente geral', 'frentes gerais')} · ${plural(d.total.itens, 'serviço', 'serviços')} · preço de venda ${bpM(d.total.preco)}</div>`, {
    ok: 'Criar a obra', larga: true,
    onOk: async f => {
      const r = await api('prop_gerar_obra', { id: p.id, nome: f.nome.value, sigla: f.sigla.value, endereco: f.endereco.value, lat: f.lat.value, lng: f.lng.value });
      toast(r.msg);
      await recarregarSessao();
      await trocarObra(r.obra_id);
      location.hash = '#/obra';
    }
  });
  mapaLocal($('#modal .ml'), $('#modal form'));
}

/* ---------- proposta para imprimir / salvar em PDF (cliente ou planilha interna) ---------- */
async function vPropDoc(id, qs) {
  if (!baseNivel()) return bpSem();
  const d = await api('prop_detalhe', { id }), p = d.proposta, interna = new URLSearchParams(qs || '').get('m') === 'i', T = d.total;
  const val = p.data_base && p.validade_dias ? (() => { const x = new Date(String(p.data_base).slice(0, 10) + 'T12:00'); x.setDate(x.getDate() + p.validade_dias); return iso(x); })() : '';
  titulo((interna ? 'Planilha interna ' : 'Proposta ') + p.rotulo);
  // a planilha interna tem 11 colunas: sai deitada (A4 paisagem)
  view(`<style>@page{size:A4 ${interna ? 'landscape' : 'portrait'};margin:10mm}</style><div class="pp-doc-bar no-print"><a class="linkbtn" href="#/orc/orcamento/${enc(id)}">${ic('back')} Voltar ao orçamento</a><span class="acoes">
      <a class="btn sec peq" href="#/orc/orcamento/${enc(id)}/proposta?m=${interna ? 'c' : 'i'}">${interna ? 'Ver a proposta do cliente' : 'Ver a planilha interna'}</a><button class="btn sec" id="ppXls">${ic('grid2')} Baixar Excel</button><button class="btn bp-ac" id="ppPrint">${ic('download')} Imprimir / salvar PDF</button></span></div>
    ${interna ? '<div class="aviso warn no-print">Uso interno: mostra custos, BDI e gestão. Não envie ao cliente.</div>' : ''}
    <article class="pp-doc ${interna ? 'interna' : ''}">
      <header class="pp-doc-h"><img src="logo.png" alt=""><div><b>${esc(d.empresa)}</b><small>${interna ? 'Planilha orçamentária · uso interno' : 'Proposta comercial'}</small></div><div class="pp-doc-n"><b>${esc(p.rotulo)}</b><small>${fd(p.data_base)}</small></div></header>
      <section class="pp-doc-c"><div><small>Cliente</small><b>${esc(p.cliente)}</b>${p.cliente_doc ? `<span>${esc(p.cliente_doc)}</span>` : ''}${p.contato ? `<span>A/C ${esc(p.contato)}</span>` : ''}${p.email || p.telefone ? `<span>${esc([p.email, p.telefone].filter(Boolean).join(' · '))}</span>` : ''}</div>
        <div><small>Empreendimento</small><b>${esc(p.empreendimento)}</b>${p.local ? `<span>${esc(p.local)}</span>` : ''}</div></section>
      ${ppTabela(d.itens, d.etapas, T, interna, true)}
      ${interna ? `<section class="pp-doc-res">${[['Custo direto', T.custo], ['Material', T.v_mat], ['Mão de obra e serviços', T.v_serv], ['BDI ' + ppPct(p.bdi_pct) + ' sobre ' + (p.bdi_base === 'total' ? 'o custo total' : 'MO e serviços'), T.bdi], ['Gestão ' + ppPct(p.gestao_pct) + ' sobre ' + (p.gestao_base === 'total' ? 'o custo total' : 'MO e serviços'), T.gestao], ['Preço de venda', T.preco]].map(([t, v]) => `<div><span>${t}</span><b class="bp-mono">${bpM(v)}</b></div>`).join('')}<div><span>BDI + gestão sobre o preço</span><b>${ppPct(T.margem)}</b></div></section>`
        : `<section class="pp-doc-tot"><span>Valor total da proposta</span><b class="bp-mono">${bpM(T.preco)}</b></section>`}
      <div class="pp-doc-fim"><section class="pp-doc-cond"><h4>Condições</h4><ul>
        ${val ? `<li><b>Validade:</b> ${p.validade_dias} dias (até ${fd(val)}).</li>` : ''}<li><b>Data-base dos preços:</b> ${fd(p.data_base)}.</li>
        ${p.prazo_txt ? `<li><b>Prazo de execução:</b> ${esc(p.prazo_txt)}</li>` : ''}${p.pagamento_txt ? `<li><b>Pagamento:</b> ${esc(p.pagamento_txt)}</li>` : ''}</ul>
        ${p.texto_cliente ? `<p style="white-space:pre-wrap">${esc(p.texto_cliente)}</p>` : ''}</section>
      ${interna ? '' : `<footer class="pp-doc-ass"><div><span></span>${esc(d.empresa)}</div><div><span></span>De acordo: ${esc(p.cliente)}</div></footer>`}</div>
      ${ppCronoDoc(d.cronograma) /* anexo: na impressão começa em página própria, deitada */}
    </article>`);
  ppLigarVer(d);
  $('#ppPrint').onclick = () => window.print();
  $('#ppXls').onclick = async () => { const b = $('#ppXls'); b.disabled = true; try { await ppExcel(d); } catch (e) { toast(e.message, 1); } b.disabled = false; };
}
/* cronograma físico-financeiro na proposta: barras por etapa e o valor de cada mês (só quando as etapas têm datas) */
function ppCronoDoc(C) {
  if (!C || !C.meses.length) return '';
  const E = { tipo: 'prop', edita: false, linhas: C.linhas.map(l => ({ codigo: l.codigo, nome: l.descricao, valor: l.valor, ini: crData(l.ini), fim: crData(l.fim), dias: l.dias })) };
  crEscala(E);
  const base = C.com_bdi !== false && C.com_gestao !== false;
  return `${base ? '' : `<div class="aviso warn no-print">O cronograma está ${crBase(C.com_bdi !== false, C.com_gestao !== false)}: o total dele (${bpM(C.total)}) não bate com o valor da proposta. Ligue BDI e gestão na tela do cronograma antes de mandar ao cliente.</div>`}
    <section class="pp-crono"><h4>Cronograma físico-financeiro <small>· ${fd(C.inicio)} a ${fd(C.fim)} (${crPrazo(C.dias)})${base ? '' : ' · valores ' + crBase(C.com_bdi !== false, C.com_gestao !== false)}</small></h4>
    <div class="cr-g"><div class="cr-l cr-cab"><div class="cr-n"></div><div class="cr-t">${crGradeMeses(E, true)}</div></div>${E.linhas.map((l, i) => crLinha(E, l, i)).join('')}</div>
    <div class="cr-tabm">${C.meses.map(m => `<div><b>${crMes(m.mes)}</b><span>${bpM(m.valor)}</span><small>${crPct(m.pct)} · acum. ${crPct(m.pct_acum)}</small></div>`).join('')}</div></section>`;
}
/* Excel com a mesma cara da planilha de orçamento (ExcelJS, carregado só quando precisa): aba "Material x Mão de obra"
 * (cabeçalho verde-petróleo, material em verde, mão de obra em âmbar, BDI/gestão/preço final em roxo, etapas em faixa,
 * subtotais em verde-claro, taxas em azul no quadro amarelo, subtotais e total com fórmula) e aba "Composições"
 * (cada item com os insumos; mão de obra em marrom). Dá para importar de volta no sistema. */
const PP_EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
async function ppExcel(d) {
  await bpCarregar();
  if (!window.ExcelJS) await bpScript(PP_EXCELJS);
  const p = d.proposta, T = d.total, et = {};
  d.etapas.forEach(e => { et[e.codigo] = e; });
  // insumos das composições SINAPI do orçamento (uma chamada só); sem o SINAPI importado, sai só o custo do item
  const sinCods = [...new Set(d.itens.filter(i => i.tipo === 'I' && i.fonte === 'SINAPI').map(i => String(i.comp_cod)))], SC = {};
  if (sinCods.length) (await api('sinapi_composicao', { codigos: sinCods }).catch(() => ({ composicoes: [] }))).composicoes.forEach(x => { SC[x.composicao.codigo] = x; });
  const COR = { petroleo: 'FF027F79', escuro: 'FF035F5E', verde: 'FF1F6E43', ambar: 'FFB07A00', roxo: 'FF7A2E8C', lilas: 'FFF6EFF8', subtotal: 'FFCFE8E1', amarelo: 'FFFFF2CC', borda: 'FFC9D3DC', nota: 'FF5A6475', azul: 'FF0000FF', marrom: 'FF7A4A00' };
  const fonte = (o = {}) => Object.assign({ name: 'Arial', size: 9 }, o);
  const fundo = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
  const borda = { top: { style: 'thin', color: { argb: COR.borda } }, left: { style: 'thin', color: { argb: COR.borda } }, bottom: { style: 'thin', color: { argb: COR.borda } }, right: { style: 'thin', color: { argb: COR.borda } } };
  const MOEDA = '#,##0.00', PCT = '0.0%';
  const wb = new ExcelJS.Workbook();
  wb.creator = d.empresa; wb.created = new Date();

  /* ---- aba do orçamento ---- */
  const A = wb.addWorksheet('Material x Mão de obra', { views: [{ state: 'frozen', xSplit: 3, ySplit: 6, showGridLines: false }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  A.columns = [6, 9, 52, 5, 12, 13, 13, 13, 16, 16, 17, 13, 9, 15, 15, 17, 14].map(width => ({ width }));
  const cel = (ref, v, st) => { const c = A.getCell(ref); c.value = v; Object.assign(c, st || {}); return c; };
  cel('C1', 'PLANILHA ORÇAMENTÁRIA · MATERIAL x MÃO DE OBRA', { font: fonte({ size: 15, bold: true, color: { argb: COR.escuro } }) });
  cel('C2', [p.empreendimento, p.local, p.cliente, p.rotulo].filter(Boolean).join(' · '), { font: fonte({ size: 10, color: { argb: COR.petroleo } }) });
  cel('C3', 'Material = insumos das composições. Mão de obra / serviço = execução, equipamentos e serviços de terceiros.', { font: fonte({ italic: true, color: { argb: COR.nota } }) });
  cel('C4', 'Data-base ' + fd(p.data_base) + ' · validade ' + p.validade_dias + ' dias · ' + d.empresa + '. Os insumos de cada item estão na aba "Composições".', { font: fonte({ italic: true, color: { argb: COR.nota } }) });
  A.getRow(1).height = 18;
  const TOT = 'TOT';   // trocado pela linha do VALOR TOTAL depois de montar a planilha
  [['J1', 'Total', 'I'], ['J2', 'Material', 'J'], ['J3', 'Mão de obra / serviço', 'K'], ['J4', 'Sem detalhe', 'L']].forEach(([r, t, col], n) => {
    cel(r, t, { font: fonte({ bold: !n }) });
    cel('K' + (n + 1), { formula: col + TOT }, { font: fonte({ size: 10, bold: true, color: { argb: n ? 'FF000000' : COR.escuro } }), numFmt: MOEDA });
    if (n) cel('L' + (n + 1), { formula: 'IFERROR(K' + (n + 1) + '/K1,0)' }, { font: fonte(), numFmt: PCT });
  });
  const base = b => (b === 'total' ? 'sobre o total' : 's/ serviços');
  [['N1', 'BDI ' + base(p.bdi_base) + ' (%)', p.bdi_pct / 100], ['N2', 'Gestão de obra ' + base(p.gestao_base) + ' (%)', p.gestao_pct / 100]].forEach(([r, t, v], n) => {
    cel(r, t, { font: fonte({ bold: true }), alignment: { horizontal: 'right' } });
    cel('O' + (n + 1), v, { font: fonte({ size: 11, bold: true, color: { argb: COR.azul } }), fill: fundo(COR.amarelo), numFmt: '0.00%', border: borda });
  });
  [['N3', 'BDI (R$)', 'N'], ['N4', 'Gestão de obra (R$)', 'O'], ['N5', 'PREÇO FINAL (R$)', 'P']].forEach(([r, t, col], n) => {
    cel(r, t, { font: fonte({ bold: n === 2 }), alignment: { horizontal: 'right' } });
    cel('O' + (n + 3), { formula: col + TOT }, { font: fonte({ size: 10, bold: true, color: { argb: n === 2 ? COR.escuro : 'FF000000' } }), numFmt: MOEDA });
  });
  const CAB = ['ITEM', 'CÓD.', 'DESCRIÇÃO', 'UN', 'QUANT.', 'PREÇO UNIT. (R$)', 'MATERIAL UNIT. (R$)', 'MÃO DE OBRA UNIT. (R$)', 'PREÇO TOTAL (R$)', 'MATERIAL TOTAL (R$)', 'MÃO DE OBRA / SERVIÇO TOTAL (R$)', 'SEM DETALHE (R$)', '% MATERIAL', 'BDI S/ SERVIÇOS (R$)', 'GESTÃO DE OBRA (R$)', 'PREÇO FINAL TOTAL (R$)', 'PREÇO FINAL UNIT. (R$)'];
  const corCab = n => ([6, 9].includes(n) ? COR.verde : [7, 10].includes(n) ? COR.ambar : n >= 13 ? COR.roxo : COR.petroleo);
  const hc = A.getRow(6);
  hc.values = CAB; hc.height = 36;
  hc.eachCell((c, n) => { c.font = fonte({ bold: true, color: { argb: 'FFFFFFFF' } }); c.fill = fundo(corCab(n - 1)); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = borda; });
  let r = 7, ini = 0;
  const subtotais = [];
  const faixa = (row, cor, fnt) => { for (let k = 1; k <= 17; k++) { const c = row.getCell(k); c.fill = fundo(cor); c.font = fnt; c.border = borda; } };
  // fórmulas levam o resultado junto: aparece certo até em visualizador que não recalcula (celular, e-mail)
  const VAL = { I: 'custo', J: 'v_mat', K: 'v_serv', N: 'bdi', O: 'gestao', P: 'preco' };
  const res = (o, col) => (VAL[col] ? o[VAL[col]] : 0);
  const fechaEtapa = cod => {
    const row = A.getRow(r), e = et[cod] || {};
    row.getCell(3).value = 'Subtotal ' + cod;
    ['I', 'J', 'K', 'L', 'N', 'O', 'P'].forEach(col => { row.getCell(col).value = { formula: `SUM(${col}${ini}:${col}${r - 1})`, result: res(e, col) }; });
    row.getCell('M').value = { formula: `IFERROR(J${r}/I${r},0)`, result: e.custo ? e.v_mat / e.custo : 0 };
    faixa(row, COR.subtotal, fonte({ bold: true }));
    for (let k = 9; k <= 17; k++) row.getCell(k).numFmt = MOEDA;
    row.getCell('M').numFmt = PCT;
    subtotais.push(r); r++;
  };
  let aberta = null;
  d.itens.forEach(i => {
    if (i.tipo === 'E') {
      if (aberta) fechaEtapa(aberta);
      aberta = i.codigo;
      const row = A.getRow(r);
      row.getCell(1).value = Number(i.codigo) || i.codigo; row.getCell(3).value = String(i.descricao).toUpperCase();
      faixa(row, COR.petroleo, fonte({ size: 10, bold: true, color: { argb: 'FFFFFFFF' } }));
      r++; ini = r; return;
    }
    const row = A.getRow(r);
    row.values = [i.codigo, i.comp_cod || '', i.descricao, i.unidade, i.qtd, ppR2(i.custo_unit), ppR2(i.unit_mat), ppR2(i.unit_mo + i.unit_eq + i.unit_sv), i.custo, i.v_mat, i.v_serv, 0,
      { formula: `IFERROR(J${r}/I${r},0)`, result: i.custo ? i.v_mat / i.custo : 0 }, i.bdi, i.gestao, { formula: `I${r}+N${r}+O${r}`, result: i.preco }, { formula: `IFERROR(ROUND(P${r}/E${r},2),0)`, result: i.preco_unit }];
    row.eachCell({ includeEmpty: true }, (c, n) => {
      c.font = fonte(); c.border = borda;
      if (n >= 5) c.numFmt = n === 13 ? PCT : n === 5 ? '#,##0.00##' : MOEDA;
      if ([1, 2, 4].includes(n)) c.alignment = { horizontal: 'center', vertical: 'middle' };
      if (n === 3) c.alignment = { vertical: 'middle', wrapText: true };
      if (n >= 14) c.fill = fundo(COR.lilas);
    });
    if (i.sem_bdi || i.sem_gestao) row.getCell(3).note = [i.sem_bdi && 'sem BDI', i.sem_gestao && 'sem gestão'].filter(Boolean).join(' · ');
    r++;
  });
  if (aberta) fechaEtapa(aberta);
  r++;
  const tr = A.getRow(r);
  tr.getCell(3).value = 'VALOR TOTAL';
  ['I', 'J', 'K', 'L', 'N', 'O', 'P'].forEach(col => { tr.getCell(col).value = { formula: subtotais.map(x => col + x).join('+') || '0', result: res(T, col) }; });
  tr.getCell('M').value = { formula: `IFERROR(J${r}/I${r},0)`, result: T.custo ? T.v_mat / T.custo : 0 };
  faixa(tr, COR.petroleo, fonte({ size: 10, bold: true, color: { argb: 'FFFFFFFF' } }));
  for (let k = 9; k <= 17; k++) tr.getCell(k).numFmt = MOEDA;
  tr.getCell('M').numFmt = PCT;
  const conf = A.getRow(r + 1);
  conf.getCell(3).value = 'Conferência (material + mão de obra + sem detalhe − total):';
  conf.getCell(9).value = { formula: `J${r}+K${r}+L${r}-I${r}`, result: ppR2(T.v_mat + T.v_serv - T.custo) };
  [3, 9].forEach(k => { conf.getCell(k).font = fonte({ size: 8, italic: true }); });
  conf.getCell(9).numFmt = MOEDA;
  // o resumo do topo aponta para a linha do total
  const RES = { K1: T.custo, K2: T.v_mat, K3: T.v_serv, K4: 0, O3: T.bdi, O4: T.gestao, O5: T.preco };
  ['K1', 'K2', 'K3', 'K4', 'O3', 'O4', 'O5'].forEach(ref => { const c = A.getCell(ref); c.value = { formula: c.value.formula.replace(TOT, r), result: RES[ref] }; });
  ['L2', 'L3', 'L4'].forEach((ref, n) => { const c = A.getCell(ref); c.value = { formula: c.value.formula, result: T.custo ? [T.v_mat, T.v_serv, 0][n] / T.custo : 0 }; });

  /* ---- aba das composições ---- */
  const TIPO = { 'Material': 'Material', 'Mão de obra': 'Mão de obra / serviço', 'Equipamento': 'Equipamento', 'Serviço': 'Serviço' };
  const B = wb.addWorksheet('Composições', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  B.columns = [6, 20, 15, 70, 6, 14, 12, 15, 17].map(width => ({ width }));
  B.getCell('A1').value = String(p.empreendimento).toUpperCase() + ' · COMPOSIÇÕES DO ORÇAMENTO ' + p.rotulo;
  B.getCell('A1').font = fonte({ size: 13, bold: true, color: { argb: COR.escuro } });
  B.getCell('A2').value = 'Linhas de cada composição: insumos (material) e mão de obra / serviço, com a quantidade total e o custo unitário usado no orçamento.';
  B.getCell('A2').font = fonte({ italic: true, color: { argb: COR.nota } });
  const bh = B.getRow(4);
  bh.values = ['ITEM', 'TIPO', 'CÓDIGO', 'DESCRIÇÃO', 'UN', 'QUANT. TOTAL', 'COEF. / UN ITEM', 'CUSTO UNIT. (R$)', 'CUSTO TOTAL (R$)'];
  bh.height = 21.75;
  bh.eachCell(c => { c.font = fonte({ bold: true, color: { argb: 'FFFFFFFF' } }); c.fill = fundo(COR.petroleo); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = borda; });
  let br = 5;
  const linhaB = (vals, cab, cor) => {
    const row = B.getRow(br++);
    row.values = vals;
    row.eachCell({ includeEmpty: true }, (c, n) => {
      c.font = fonte({ bold: cab, color: { argb: cor || 'FF000000' } }); c.border = borda;
      if (cab) c.fill = fundo(COR.subtotal);
      if ([1, 5].includes(n)) c.alignment = { horizontal: 'center' };
      if (n === 6) c.numFmt = '#,##0.00##'; if (n === 7) c.numFmt = '0.0000'; if (n >= 8) c.numFmt = MOEDA;
    });
  };
  d.itens.filter(i => i.tipo === 'I').forEach(i => {
    linhaB([i.codigo, '', i.comp_cod ? (i.fonte ? 'SINAPI ' : '') + i.comp_cod : '', i.descricao, i.unidade, i.qtd, '', ppR2(i.custo_unit), i.custo], true);
    const c = i.comp_cod && !i.fonte && BP.C[i.comp_cod], s = i.fonte === 'SINAPI' && SC[String(i.comp_cod)];
    const reg = p.sinapi_regime === 'cd' ? 'preco_cd' : 'preco_sd';
    const sinTipo = x => x.tipo === 'C' ? 'Composição auxiliar' : /M[AÃ]O DE OBRA|ENCARGO/i.test(x.classe) ? 'Mão de obra / serviço' : /EQUIPAMENTO/i.test(x.classe) ? 'Equipamento' : /SERVI[CÇ]O/i.test(x.classe) ? 'Serviço' : 'Material';
    if (s) s.itens.forEach(x => { const t = sinTipo(x); linhaB([i.codigo, t, x.codigo, x.descricao, x.unidade, Math.round(i.qtd * x.coef * 1e4) / 1e4, Math.round(x.coef * 1e6) / 1e6, x[reg], ppR2(i.qtd * x.coef * x[reg])], false, t === 'Material' ? '' : COR.marrom); });
    else if (c) Object.values(bpExplodir(c.itens, 1, {}, [c.codigo])).forEach(a => linhaB([i.codigo, TIPO[a.i.tipo] || 'Material', a.i.codigo, a.i.descricao, a.i.unidade, Math.round(i.qtd * a.coef * 1e4) / 1e4, Math.round(a.coef * 1e6) / 1e6, a.preco, ppR2(i.qtd * a.coef * a.preco)], false, a.i.tipo === 'Material' ? '' : COR.marrom));
    else {
      if (i.unit_mat) linhaB([i.codigo, 'Material', '', i.descricao + ' – material', i.unidade, i.qtd, 1, i.unit_mat, i.v_mat], false);
      if (i.unit_mo + i.unit_eq + i.unit_sv) linhaB([i.codigo, 'Mão de obra / serviço', '', i.descricao + ' – mão de obra', i.unidade, i.qtd, 1, i.unit_mo + i.unit_eq + i.unit_sv, i.v_serv], false, COR.marrom);
    }
  });

  /* ---- aba do cronograma físico-financeiro (quando as etapas têm datas): valor de cada etapa por mês, total, acumulado e % ---- */
  const C = d.cronograma;
  if (C && C.meses.length) {
    const ms = C.meses.map(m => m.mes), nm = ms.length, col = n => X.getColumn(n).letter, c0 = 7;
    const X = wb.addWorksheet('Cronograma', { views: [{ state: 'frozen', xSplit: 6, ySplit: 4, showGridLines: false }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    X.columns = [6, 40, 11, 11, 7, 16].concat(ms.map(() => 13)).map(width => ({ width }));
    X.getCell('A1').value = 'CRONOGRAMA FÍSICO-FINANCEIRO · ' + String(p.empreendimento).toUpperCase();
    X.getCell('A1').font = fonte({ size: 13, bold: true, color: { argb: COR.escuro } });
    X.getCell('A2').value = [p.cliente, p.rotulo, fd(C.inicio) + ' a ' + fd(C.fim), 'valores ' + crBase(C.com_bdi !== false, C.com_gestao !== false)].filter(Boolean).join(' · ') + '. Valor de cada etapa distribuído por igual nos dias corridos entre o início e o fim.';
    X.getCell('A2').font = fonte({ italic: true, color: { argb: COR.nota } });
    const h = X.getRow(4);
    h.values = ['ITEM', 'ETAPA', 'INÍCIO', 'FIM', 'DIAS', 'VALOR (R$)'].concat(ms.map(m => crMes(m).toUpperCase()));
    h.height = 21.75;
    h.eachCell((c, n) => { c.font = fonte({ bold: true, color: { argb: 'FFFFFFFF' } }); c.fill = fundo(n > 6 ? COR.ambar : COR.petroleo); c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = borda; });
    const r0 = 5;
    C.linhas.forEach((l, k) => {
      const row = X.getRow(r0 + k), dt = s => s ? new Date(s + 'T12:00:00') : '';
      row.values = [Number(l.codigo) || l.codigo, l.descricao, dt(l.ini), dt(l.fim), l.dias || '', l.valor].concat(ms.map(m => l.meses[m] || ''));
      row.eachCell({ includeEmpty: true }, (c, n) => {
        c.font = fonte(); c.border = borda;
        if (n === 3 || n === 4) c.numFmt = 'dd/mm/yyyy';
        if (n >= 6) c.numFmt = MOEDA;
        if ([1, 3, 4, 5].includes(n)) c.alignment = { horizontal: 'center' };
        if (n >= c0 && l.meses[ms[n - c0]]) c.fill = fundo(COR.amarelo);
      });
    });
    const rT = r0 + C.linhas.length, ult = rT - 1, fx = (r, t, f, fmt, cor) => {
      const row = X.getRow(r);
      row.getCell(2).value = t;
      for (let n = 6; n < c0 + nm; n++) { const v = f(n); if (v !== null) row.getCell(n).value = v; row.getCell(n).numFmt = fmt; }
      for (let n = 1; n < c0 + nm; n++) { const c = row.getCell(n); c.font = fonte({ bold: true, color: cor ? { argb: 'FFFFFFFF' } : undefined }); c.fill = fundo(cor || COR.subtotal); c.border = borda; }
    };
    fx(rT, 'TOTAL DO MÊS', n => ({ formula: `SUM(${col(n)}${r0}:${col(n)}${ult})`, result: n === 6 ? C.total : C.meses[n - c0].valor }), MOEDA, COR.petroleo);
    fx(rT + 1, 'ACUMULADO', n => n === 6 ? null : { formula: n === c0 ? `${col(n)}${rT}` : `${col(n - 1)}${rT + 1}+${col(n)}${rT}`, result: C.meses[n - c0].acum }, MOEDA);
    fx(rT + 2, '% DO MÊS', n => n === 6 ? null : { formula: `IFERROR(${col(n)}${rT}/$F$${rT},0)`, result: C.meses[n - c0].pct / 100 }, '0.0%');
    fx(rT + 3, '% ACUMULADO', n => n === 6 ? null : { formula: `IFERROR(${col(n)}${rT + 1}/$F$${rT},0)`, result: C.meses[n - c0].pct_acum / 100 }, '0.0%');
  }

  const buf = await wb.xlsx.writeBuffer(), nome = (p.rotulo + ' - ' + p.empreendimento).replace(/[\\/:*?"<>|]/g, '-').slice(0, 100) + '.xlsx';
  if (PP.excelBase64) return PP.excelBase64(buf, nome);   // só para teste: devolve o arquivo em vez de baixar
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = nome;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ---------- importar um orçamento em planilha (vira orçamento em rascunho + composições na base) ---------- */
async function vPropImportar() {
  titulo('Importar orçamento');
  if (!bpGere()) return bpSem('Gerir');
  await bpCarregar();
  const M = PP.imp = { abas: null, nome: '', pre: null };
  bpTela('props', `<a href="#/orc/orcamentos" class="linkbtn">${ic('back')} Orçamentos de clientes</a>
    <div class="bp-hero bp-hero-imp"><div class="bp-hero-t"><span class="bp-selo">${ic('upload')} Importação</span><h2>Orçamento em planilha</h2>
      <p>Use a planilha com a <b>aba do orçamento</b> (Material x Mão de obra) e a <b>aba Composições</b>. As composições entram (ou são atualizadas) na base de preços e o orçamento é criado em rascunho, com as etapas, as quantidades, o BDI, a gestão e os itens sem BDI da planilha. Nada é gravado antes de você conferir.</p></div>
      <ol class="bp-passos" id="bpPassos"><li class="on"><b>1</b>Arquivo</li><li><b>2</b>Conferir</li><li><b>3</b>Pronto</li></ol></div>
    <div id="ppImp"></div>`);
  const arquivo = () => {
    bpPasso(0);
    $('#ppImp').innerHTML = `<label class="bp-drop" id="ppDrop"><input type="file" id="ppArq" accept=".xlsx,.xlsm,.xls" hidden>${ic('upload')}<b>Arraste a planilha do orçamento aqui ou toque para escolher</b><small>planilha .xlsx do orçamento (inclusive a baixada deste sistema)</small></label>`;
    const dr = $('#ppDrop');
    ['dragenter', 'dragover'].forEach(ev => dr.addEventListener(ev, e => { e.preventDefault(); dr.classList.add('sobre'); }));
    ['dragleave', 'drop'].forEach(ev => dr.addEventListener(ev, e => { e.preventDefault(); dr.classList.remove('sobre'); }));
    dr.addEventListener('drop', e => { if (e.dataTransfer.files[0]) ler(e.dataTransfer.files[0]); });
    $('#ppArq').onchange = e => { if (e.target.files[0]) ler(e.target.files[0]); };
  };
  const ler = async f => {
    $('#ppImp').innerHTML = `<div class="card bp-lendo"><span class="spin"></span><b>Lendo ${esc(f.name)}…</b></div>`;
    try { M.abas = await bpLerPlanilha(f); M.nome = f.name; M.pre = await api('prop_importar', { abas: M.abas }); conferir(); }
    catch (e) { toast(e.message, 1); arquivo(); }
  };
  const conferir = () => {
    bpPasso(1);
    const R = M.pre, S = R.sugestao, B = R.base, sel = (n, v) => `<select name="${n}">${PP_BASES.map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
    const tile = (n, t, s, cl) => `<div class="bp-tile ${cl || ''} ${n ? '' : 'zero'}"><b>${n}</b><span>${t}</span>${s ? `<small>${s}</small>` : ''}</div>`;
    $('#ppImp').innerHTML = `<form id="ppIf" autocomplete="off"><div class="card"><div class="bp-h"><h3>${ic('file')} ${esc(M.nome)}</h3><button type="button" class="linkbtn" id="ppOutro">Escolher outro arquivo</button></div>
        <div class="bp-tiles">${tile(R.etapas, 'etapas')}${tile(R.itens, 'itens')}${tile(bpM(R.custo_planilha), 'custo na planilha', 'sem BDI e gestão')}${tile(B.comp_novas, 'composições novas na base', '', 'ok')}${tile(B.comp_atualizar, 'composições a atualizar', '', 'atu')}${tile(B.insumos_novos, 'insumos novos', '', 'ok')}</div>
        ${R.sem_bdi.length || R.sem_gestao.length ? `<div class="aviso info" style="margin-top:12px">${R.sem_bdi.length ? `<b>Sem BDI na planilha:</b> ${esc(R.sem_bdi.join(' · '))}. ` : ''}${R.sem_gestao.length ? `<b>Sem gestão:</b> ${esc(R.sem_gestao.join(' · '))}.` : ''}</div>` : ''}
        ${R.avisos.length ? `<details class="bp-avisos"><summary>${ic('alert')} ${plural(R.avisos.length, 'observação', 'observações')} da base</summary><ul>${R.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul></details>` : ''}</div>
      <div class="card"><h3>${ic('user')} Orçamento</h3>
        <div class="bp-g3"><label class="bp-span2">Cliente<input name="cliente" required placeholder="ex: AVA Residences"></label><label>Local<input name="local" placeholder="cidade/UF"></label></div>
        <label>Empreendimento / obra<input name="empreendimento" required value="${esc(S.empreendimento || M.nome.replace(/\.\w+$/, ''))}"></label>
        <div class="pp-taxas"><label>BDI (%)<input name="bdi_pct" inputmode="decimal" value="${esc(bpV(S.bdi_pct))}"></label><label>sobre ${sel('bdi_base', S.bdi_base)}</label><label>Gestão (%)<input name="gestao_pct" inputmode="decimal" value="${esc(bpV(S.gestao_pct))}"></label><label>sobre ${sel('gestao_base', S.gestao_base)}</label></div>
        <div class="g2"><label>Data-base dos preços<input type="date" name="data" value="${hoje()}"></label><label class="ck" style="align-self:end"><input type="checkbox" name="atu" checked> Atualizar na base as composições e os insumos que já existem (mesmo código)</label></div></div>
      <div class="barra-acoes"><div class="acoes"><button type="button" class="btn sec" id="ppVolta">${ic('back')} Voltar</button><button class="btn bp-ac" id="ppGo">${ic('check')} Criar orçamento com ${plural(R.itens, 'item', 'itens')}</button></div></div></form>`;
    $('#ppOutro').onclick = $('#ppVolta').onclick = arquivo;
    $('#ppIf').onsubmit = async e => {
      e.preventDefault();
      const f = e.target, b = $('#ppGo'); b.disabled = true; b.textContent = 'Importando…';
      try {
        const r = await api('prop_importar', { abas: M.abas, aplicar: true, atualizar: f.atu.checked, data_preco: f.data.value, fonte: ('Planilha · ' + M.nome).slice(0, 80),
          proposta: { cliente: f.cliente.value, empreendimento: f.empreendimento.value, local: f.local.value, bdi_pct: bpPn(f.bdi_pct.value), bdi_base: f.bdi_base.value, gestao_pct: bpPn(f.gestao_pct.value), gestao_base: f.gestao_base.value } });
        toast(r.msg);
        await bpCarregar(true);
        location.hash = '#/orc/orcamento/' + enc(r.id);
      } catch (x) { toast(x.message, 1); b.disabled = false; b.textContent = 'Tentar de novo'; }
    };
  };
  arquivo();
}

ROTAS.push(
  [/^#\/orc\/orcamentos(?:\?(.*))?$/, vPropLista], [/^#\/orc\/orcamento\/novo$/, () => vProp()], [/^#\/orc\/orcamento\/importar$/, vPropImportar],
  [/^#\/orc\/orcamento\/([^/?]+)\/proposta(?:\?(.*))?$/, vPropDoc], [/^#\/orc\/orcamento\/([^/?]+)$/, vProp]
);
