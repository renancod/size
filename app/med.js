'use strict';
/* =====================================================================
 * MEDIÇÕES de empreiteiros
 * Só entra serviço concluído e com FVS aprovada, uma vez só; numeração por empreiteiro; quem lança envia, quem aprova (por obra) aprova.
 * Usa app.js (api, modal, view, comEtapas…), exec.js (EX, vEquipes…), relatorio.js (pdfDeFolha, baixarBlob) e fvs.js (estilos fv-*).
 * ===================================================================== */
const MD = { L: null, filtro: 'prep' };
const MD_ST = { 'Rascunho': 'exec', 'Aguardando aprovação': 'aprov', 'Aprovada': 'ok', 'Devolvida': 'dev', 'Paga': 'ok', 'Cancelada': 'canc' };
const mdBadge = s => `<span class="badge fvb fvb-${MD_ST[s] || 'exec'}">${esc(s)}</span>`;
const mdTit = m => m.numero_txt || 'Medição em preparo';
const mdPer = m => `${fc(m.de)} a ${fc(m.ate)}/${String(m.ate).slice(0, 4)}`;
const mdDataBr = s => s ? fd(s) : '—';
const mdPodeMed = () => can(['medicao_ver', 'medicao_lancar', 'medicao_aprovar']);

/* ---------- lista ---------- */
async function vMed() {
  titulo('Medições');
  if (!mdPodeMed()) return view('<div class="card vazio"><p>Você não tem acesso às medições desta obra.</p></div>');
  const L = await api('medicoes');
  MD.L = L;
  const F = {
    prep: ['Em preparo', 'edit', m => ['Rascunho', 'Devolvida'].includes(m.status)],
    aprovar: ['Para aprovar', 'alert', m => m.status === 'Aguardando aprovação'],
    aprovadas: ['Aprovadas', 'check', m => m.status === 'Aprovada'],
    pagas: ['Pagas', 'money', m => m.status === 'Paga'],
    todas: ['Todas', 'layers', m => m.status !== 'Cancelada']
  };
  const grupos = [{ t: 'Situação', itens: Object.entries(F).map(([k, v]) => ({ k, t: v[0], i: v[1], n: L.medicoes.filter(v[2]).length, on: k === MD.filtro, cl: k === 'aprovar' ? 'quente' : '' })) }];
  const acoes = [];
  if (L.pode_lancar) acoes.push({ k: 'a:nova', t: 'Nova medição', i: 'plus', cl: 'acao' });
  acoes.push({ k: 'a:emp', t: 'Empreiteiros', i: 'users', cl: 'acao' });
  grupos.push({ t: 'Ações', itens: acoes });
  const lista = L.medicoes.filter(F[MD.filtro][2]);
  view(comEtapas(grupos, `<div class="cab"><h2>${F[MD.filtro][0]}</h2><span class="contagem">${esc(S.dados.obra.nome)}</span></div>
    ${L.empreiteiros.length ? `<div class="md-emps">${L.empreiteiros.map(e => `<div class="card md-emp"><div class="eq-t"><span class="eq-av">${esc((e.empresa || e.nome).charAt(0).toUpperCase())}</span><div><b>${esc(e.empresa || e.nome)}</b><small>${esc(e.empresa ? e.nome : '')}${e.responsavel ? ' · ' + esc(e.responsavel) : ''}</small></div></div>
        <div class="md-chips"><span class="md-chip ${e.pago_ate ? 'pg' : ''}">Pago até <b>${mdDataBr(e.pago_ate)}</b></span><span class="md-chip ${e.medido_ate ? 'ap' : ''}">Medido até <b>${mdDataBr(e.medido_ate)}</b></span></div>
        <div class="md-num"><span><b>${e.a_medir}</b> pronto${e.a_medir === 1 ? '' : 's'} para medir</span><span><b>${e.aguardando_fvs}</b> aguardando FVS</span><span><b>${e.frentes}</b> frente${e.frentes === 1 ? '' : 's'}</span></div>
        ${L.pode_lancar ? `<button class="btn sec peq" data-nova="${esc(e.codigo)}">${ic('plus')} Montar medição</button>` : ''}</div>`).join('')}</div>` : `<div class="aviso info">Cadastre o empreiteiro em <a href="#/med/empreiteiros">Empreiteiros</a> e escolha-o na frente de trabalho (etapa) para começar a medir.</div>`}
    <div class="fv-lista">${lista.map(mdCartao).join('') || '<div class="card vazio"><p>Nenhuma medição nesta visão.</p></div>'}</div>`));
  ligarEtapas(k => {
    if (k === 'a:nova') { location.hash = '#/med/nova'; return; }
    if (k === 'a:emp') { location.hash = '#/med/empreiteiros'; return; }
    MD.filtro = k; vMed();
  });
  $$('[data-nova]').forEach(b => { b.onclick = () => { location.hash = '#/med/nova?emp=' + enc(b.dataset.nova); }; });
}
function mdCartao(m) {
  return `<a class="card fv-card fvs-${MD_ST[m.status] || 'exec'}" href="#/med/${esc(m.id)}">
    <div class="fv-l1"><span class="fv-num">${esc(mdTit(m))}</span>${mdBadge(m.status)}</div>
    <b class="fv-serv">${esc(m.empreiteiro_nome)}</b>
    <small>${esc(mdPer(m))} · ${plural(m.itens, 'serviço', 'serviços')}</small>
    <small class="fv-rdo">${m.status === 'Paga' ? 'paga em ' + fd(m.pago_em) : m.status === 'Aprovada' ? 'aprovada por ' + esc(m.aprovado_por) : m.status === 'Aguardando aprovação' ? 'enviada por ' + esc(m.enviado_por) : esc('por ' + m.criado_por)}</small></a>`;
}

/* ---------- montar / editar o rascunho ---------- */
const MF = { id: '', emp: '', de: '', ate: '', obs: '', sel: new Set(), prev: null, mes: '', pick: null, tok: 0, medicoes: [] };
async function vMedNova(query) {
  const p = new URLSearchParams(query || '');
  await medForm('', p.get('emp') || '');
}
async function vMedEditar(id) { await medForm(id, ''); }
async function medForm(id, empCod) {
  titulo(id ? 'Editar medição' : 'Nova medição');
  if (!can('medicao_lancar')) return view('<div class="card vazio"><p>Só quem tem permissão de lançar medições monta uma medição.</p></div>');
  const L = await api('medicoes');
  MD.L = L;
  MF.id = id; MF.medicoes = L.medicoes; MF.pick = null; MF.prev = null; MF.sel = new Set();
  if (id) {
    const d = await api('medicao_detalhe', { id });
    if (!d.editavel) { location.hash = '#/med/' + id; return; }
    MF.emp = d.empreiteiro; MF.de = d.de; MF.ate = d.ate; MF.obs = d.obs; d.itens.forEach(i => MF.sel.add(i.item_id));
  } else {
    MF.emp = empCod || (L.empreiteiros[0] || {}).codigo || ''; MF.obs = '';
    const e = L.empreiteiros.find(x => x.codigo === MF.emp);
    MF.de = e && e.medido_ate ? addD(e.medido_ate, 1) : addD(hoje(), -14); MF.ate = hoje(); if (MF.de > MF.ate) MF.ate = MF.de;
  }
  MF.mes = MF.de.slice(0, 7);
  if (!L.empreiteiros.length) return view('<div class="aviso info">Cadastre o empreiteiro em <a href="#/med/empreiteiros">Empreiteiros</a> primeiro.</div>');
  view(`<a href="#/med" class="linkbtn">${ic('back')} Medições</a>
    <div class="fv-hero fvs-exec"><div><span class="rel-sel">${ic('check')} Medição de empreiteiro</span><h2>${id ? 'Editar rascunho' : 'Nova medição'}</h2><p>Entram os serviços concluídos no período, com a FVS aprovada.</p></div></div>
    <div class="rel-grid"><div class="rel-col">
      <section class="card rel-sec"><div class="rel-h"><b>1</b><div><h3>Empreiteiro</h3><small>As frentes dele são somadas</small></div></div>
        <select id="mfEmp" ${id ? 'disabled' : ''}>${L.empreiteiros.map(e => `<option value="${esc(e.codigo)}" ${e.codigo === MF.emp ? 'selected' : ''}>${esc(e.empresa ? e.empresa + ' · ' + e.nome : e.nome)}</option>`).join('')}</select><div id="mfInfo" class="md-info"></div></section>
      <section class="card rel-sec"><div class="rel-h"><b>2</b><div><h3>Período</h3><small>Serviços concluídos entre as duas datas. Toque no calendário ou digite.</small></div></div>
        <div class="g2"><label>De<input type="date" id="mfDe"></label><label>Até<input type="date" id="mfAte"></label></div><div class="rel-atalhos" id="mfAt"></div>
        <div id="mfCal"></div></section>
      <section class="card rel-sec"><div class="rel-h"><b>3</b><div><h3>Observações</h3><small>Aparecem no boletim de medição</small></div></div><textarea id="mfObs" rows="3" placeholder="opcional"></textarea></section>
    </div><div class="rel-col"><section class="card rel-sec"><div class="rel-h"><b>4</b><div><h3>Serviços da medição</h3><small>Desmarque o que não quer medir agora</small></div></div><div id="mfPrev"></div>
      <div class="rel-acoes" style="grid-template-columns:1fr 1fr"><button type="button" class="btn sec" id="mfCancel">Cancelar</button><button type="button" class="btn" id="mfSalvar">${ic('check')} Salvar rascunho</button></div></section></div></div>`);
  $('#mfDe').value = MF.de; $('#mfAte').value = MF.ate; $('#mfObs').value = MF.obs;
  $('#mfEmp').onchange = e => { MF.emp = e.target.value; const em = L.empreiteiros.find(x => x.codigo === MF.emp); if (em && em.medido_ate) { MF.de = addD(em.medido_ate, 1); if (MF.ate < MF.de) MF.ate = MF.de; $('#mfDe').value = MF.de; $('#mfAte').value = MF.ate; } MF.sel = new Set(); mfRefaz(); };
  $('#mfDe').onchange = e => { MF.de = e.target.value; if (MF.ate < MF.de) { MF.ate = MF.de; $('#mfAte').value = MF.ate; } MF.mes = MF.de.slice(0, 7); mfRefaz(); };
  $('#mfAte').onchange = e => { MF.ate = e.target.value; if (MF.ate < MF.de) { MF.de = MF.ate; $('#mfDe').value = MF.de; } mfRefaz(); };
  $('#mfObs').oninput = e => { MF.obs = e.target.value; };
  $('#mfCancel').onclick = () => { location.hash = id ? '#/med/' + id : '#/med'; };
  $('#mfSalvar').onclick = mfSalvar;
  mfAtalhos();
  mfRefaz();
}
function mfAtalhos() {
  const e = () => (MD.L.empreiteiros || []).find(x => x.codigo === MF.emp) || {};
  $('#mfAt').innerHTML = `<button type="button" class="rel-at" data-a="desde">Desde a última medição</button><button type="button" class="rel-at" data-a="mes">Este mês</button><button type="button" class="rel-at" data-a="30">Últimos 30 dias</button>`;
  $$('#mfAt [data-a]').forEach(b => {
    b.onclick = () => {
      const h = hoje(), k = b.dataset.a;
      if (k === 'desde') { MF.de = e().medido_ate ? addD(e().medido_ate, 1) : addD(h, -30); MF.ate = MF.de > h ? MF.de : h; }
      else if (k === 'mes') { MF.de = h.slice(0, 8) + '01'; MF.ate = h; }
      else { MF.de = addD(h, -30); MF.ate = h; }
      MF.pick = null; MF.mes = MF.de.slice(0, 7); $('#mfDe').value = MF.de; $('#mfAte').value = MF.ate; mfRefaz();
    };
  });
}
function mfCal() {
  const h = hoje(), [y, m] = MF.mes.split('-').map(Number), off = (new Date(y, m - 1, 1).getDay() + 6) % 7, n = new Date(y, m, 0).getDate();
  const ant = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`, prox = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const per = MF.medicoes.filter(x => x.empreiteiro === MF.emp && x.status !== 'Cancelada' && x.id !== MF.id);
  const cls = s => { const p = per.filter(x => s >= x.de && s <= x.ate).map(x => x.status); return p.includes('Paga') ? 'pg' : p.includes('Aprovada') ? 'ap' : p.length ? 'pn' : ''; };
  let cel = '<span class="cd vz"></span>'.repeat(off);
  for (let d = 1; d <= n; d++) {
    const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cel += `<button type="button" class="cd ${cls(s)} ${s === h ? 'hoje' : ''} ${s >= MF.de && s <= MF.ate ? 'sel' + (s === MF.de ? ' a' : '') + (s === MF.ate ? ' b' : '') : ''}" data-d="${s}"><span>${d}</span></button>`;
  }
  $('#mfCal').innerHTML = `<div class="cal-cab"><button type="button" class="icbtn" id="mcMenos">${ic('left')}</button><b>${mesNome(MF.mes)}</b><button type="button" class="icbtn" id="mcMais">${ic('right')}</button></div>
    <div class="cal-sem">${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(x => `<span>${x}</span>`).join('')}</div><div class="cal-g">${cel}</div>
    <div class="cal-leg"><span><i class="l-pg"></i>Medido e pago</span><span><i class="l-ap"></i>Aprovado (a pagar)</span><span><i class="l-pn"></i>Em andamento</span><span><i class="l-sel"></i>Período escolhido</span></div>`;
  $('#mcMenos').onclick = () => { MF.mes = ant; mfCal(); };
  $('#mcMais').onclick = () => { MF.mes = prox; mfCal(); };
  $$('#mfCal [data-d]').forEach(b => {
    b.onclick = () => {
      const s = b.dataset.d;
      if (MF.pick) { MF.de = s < MF.pick ? s : MF.pick; MF.ate = s < MF.pick ? MF.pick : s; MF.pick = null; $('#mfDe').value = MF.de; $('#mfAte').value = MF.ate; mfRefaz(); }
      else { MF.de = MF.ate = MF.pick = s; $('#mfDe').value = s; $('#mfAte').value = s; mfCal(); }
    };
  });
}
let MFT = null;
function mfRefaz() {
  mfCal();
  const e = (MD.L.empreiteiros || []).find(x => x.codigo === MF.emp);
  $('#mfInfo').innerHTML = e ? `<small>${e.medido_ate ? 'Medido até <b>' + fd(e.medido_ate) + '</b>' : 'Ainda sem medição'}${e.pago_ate ? ' · pago até <b>' + fd(e.pago_ate) + '</b>' : ''} · ${plural(e.frentes, 'frente', 'frentes')}</small>` : '';
  clearTimeout(MFT);
  $('#mfPrev').innerHTML = '<div class="rel-vazio"><span class="spin"></span>Calculando…</div>';
  MFT = setTimeout(async () => {
    const t = ++MF.tok;
    try {
      const r = await api('medicao_prever', { empreiteiro: MF.emp, de: MF.de, ate: MF.ate, id: MF.id });
      if (t !== MF.tok) return;
      MF.prev = r;
      const ids = r.elegiveis.map(x => x.item_id);
      MF.sel = new Set([...MF.sel].filter(x => ids.includes(x)));
      if (!MF.sel.size) r.elegiveis.forEach(x => MF.sel.add(x.item_id));
      mfPrev();
    } catch (x) { if (t === MF.tok) $('#mfPrev').innerHTML = `<div class="aviso erro">${esc(x.message)}</div>`; }
  }, 350);
}
function mfPrev() {
  const r = MF.prev; if (!r) return;
  const total = {};
  r.elegiveis.filter(x => MF.sel.has(x.item_id) && !x.verba).forEach(x => { const k = x.unidade; total[k] = (total[k] || 0) + x.qtd; });
  $('#mfPrev').innerHTML = `${r.elegiveis.length ? r.elegiveis.map(x => `<label class="md-it"><input type="checkbox" data-i="${esc(x.item_id)}" ${MF.sel.has(x.item_id) ? 'checked' : ''}>
      <span class="md-it-t"><b>${esc(x.servico)}</b>${x.complemento ? ' <span class="badge fvb fvb-vist">complemento</span>' : ''}<small>${esc(x.etapa_nome)}${x.etapa_local ? ' · ' + esc(x.etapa_local) : ''} · ${x.verba ? 'verba (em parcelas) · último lançamento ' + fd(x.concluido_em) : 'concluído em ' + fd(x.concluido_em)}</small>
      <small>${esc(x.fvs || 'FVS')} · ${x.rdos.length ? rdoN(x.rdos[0]) + (x.rdos.length > 1 ? ' a ' + rdoN(x.rdos[x.rdos.length - 1]) : '') : ''}${x.contrato ? ' · ' + esc(x.contrato) : ''}</small></span><b class="md-q">${esc(qun(x.qtd, x.unidade, x.prevista))}</b></label>`).join('')
      : '<div class="aviso info">Nenhum serviço pronto para medir neste período: precisa estar concluído e com FVS aprovada.</div>'}
    ${r.elegiveis.length ? `<div class="md-tot">${Object.keys(total).map(u => `<span><b>${nf(total[u])}</b> ${esc(u)}</span>`).join(' · ')} <small>no total</small></div>` : ''}
    ${r.pendentes.length ? `<div class="md-pend"><h4>${ic('alert')} Concluídos, mas ainda não podem ser medidos</h4>${r.pendentes.map(x => `<div class="md-pi"><b>${esc(x.servico)}</b> <small>${esc(x.etapa_nome)} · ${esc(qun(x.qtd, x.unidade, x.prevista))} · concluído em ${fd(x.concluido_em)}</small><small class="md-motivo">${esc(x.motivo)}</small></div>`).join('')}</div>` : ''}`;
  $$('#mfPrev [data-i]').forEach(c => { c.onchange = () => { c.checked ? MF.sel.add(c.dataset.i) : MF.sel.delete(c.dataset.i); mfPrev(); }; });
  $('#mfSalvar').disabled = !MF.sel.size;
}
async function mfSalvar() {
  const b = $('#mfSalvar'); b.disabled = true;
  try {
    const itens = [...MF.sel];
    if (MF.id) { toast((await api('medicao_salvar', { id: MF.id, de: MF.de, ate: MF.ate, obs: MF.obs, itens })).msg); location.hash = '#/med/' + MF.id; }
    else { const r = await api('medicao_criar', { empreiteiro: MF.emp, de: MF.de, ate: MF.ate, obs: MF.obs, itens }); toast(r.msg); location.hash = '#/med/' + r.id; }
  } catch (x) { toast(x.message, 1); b.disabled = false; }
}

/* ---------- detalhe ---------- */
async function vMedDet(id) {
  const d = await api('medicao_detalhe', { id });
  MD.det = d;
  titulo(mdTit(d));
  const porEtapa = {};
  d.itens.forEach(i => { (porEtapa[i.etapa_nome] = porEtapa[i.etapa_nome] || []).push(i); });
  const contratos = [...new Set(d.itens.map(i => i.contrato).filter(Boolean))];
  view(`<a href="#/med" class="linkbtn">${ic('back')} Medições</a>
    <div class="fv-hero fvs-${MD_ST[d.status] || 'exec'}"><div><span class="rel-sel">${ic('check')} Boletim de medição</span><h2>${esc(mdTit(d))}</h2><p>${esc(d.emp.empresa || d.emp.nome)} · ${esc(mdPer(d))}</p></div>
      <div class="fv-hero-d">${mdBadge(d.status)}<small>${plural(d.itens.length, 'serviço', 'serviços')}</small></div></div>
    ${d.status === 'Devolvida' && d.motivo ? `<div class="aviso warn"><b>Devolvida:</b> ${esc(d.motivo)}</div>` : ''}
    <div class="card fv-ident"><dl class="kv"><dt>Obra</dt><dd>${esc(d.obra.nome)}</dd>
      <dt>Empreiteiro</dt><dd>${esc(d.emp.empresa || d.emp.nome)}${d.emp.documento ? ' · ' + esc(d.emp.documento) : ''}</dd>
      ${d.emp.responsavel || d.emp.telefone ? `<dt>Contato</dt><dd>${esc([d.emp.responsavel, d.emp.telefone, d.emp.email].filter(Boolean).join(' · '))}</dd>` : ''}
      <dt>Período</dt><dd>${fd(d.de)} a ${fd(d.ate)}</dd>
      <dt>Contrato</dt><dd>${contratos.length ? esc(contratos.join(' · ')) : '—'}</dd>
      <dt>Lançada por</dt><dd>${esc(d.criado_por)}${d.enviado_por ? ' · enviada por ' + esc(d.enviado_por) : ''}</dd>
      ${d.obs ? `<dt>Observações</dt><dd>${esc(d.obs)}</dd>` : ''}</dl></div>
    ${Object.keys(porEtapa).map(en => `<div class="card"><h3>${esc(en)}</h3><table class="tab md-tab"><thead><tr><th>Serviço</th><th class="n">Quantidade</th><th>Concluído</th><th>RDOs</th><th>FVS</th></tr></thead><tbody>
      ${porEtapa[en].map(i => `<tr><td>${esc(i.servico)}${i.complemento ? ' <span class="badge fvb fvb-vist">complemento</span>' : ''}</td><td class="n"><b>${esc(qun(i.qtd, i.unidade, i.prevista))}</b></td><td>${fd(i.concluido_em)}</td><td>${i.rdos.length ? rdoN(i.rdos[0]) + (i.rdos.length > 1 ? ' a ' + rdoN(i.rdos[i.rdos.length - 1]) : '') : '—'}</td><td>${esc(i.fvs || '—')}</td></tr>`).join('')}</tbody></table></div>`).join('')}
    <div class="card"><h3>Total por serviço</h3>${d.totais.map(t => `<div class="md-total"><span>${esc(t.servico)}</span><b>${esc(qun(t.qtd, t.unidade, t.prevista))}</b></div>`).join('')}</div>
    <details class="card fv-hist"><summary>Memória de cálculo (lançamentos por diário)</summary>${d.itens.map(i => `<div class="alt"><b>${esc(i.servico)}</b> <small>${esc(i.etapa_nome)}</small><br><small>${i.dias.map(x => `${rdoN(x.rdo)} (${fc(x.data)}): ${esc(qun(x.qtd, i.unidade, i.prevista))}`).join(' · ')}</small></div>`).join('')}</details>
    <div class="card" id="mdAcao"></div>`);
  mdDesenhaAcao();
}
function mdDesenhaAcao() {
  const d = MD.det, el = $('#mdAcao'), hist = d.historico.slice().reverse();
  const apr = can('medicao_aprovar');
  el.innerHTML = `<h3>Aprovação</h3>
    ${['Aprovada', 'Paga'].includes(d.status) ? `<div class="aviso ok">${ic('escudo')} <b>${esc(d.numero_txt)}</b> aprovada por <b>${esc(d.aprovado_por)}</b> em ${esc(fdh(d.aprovado_em))}${d.auto_aprovada ? ' (mesma pessoa que lançou)' : ''}${d.status === 'Paga' ? ` · <b>paga em ${fd(d.pago_em)}</b>${d.pago_obs ? ' (' + esc(d.pago_obs) + ')' : ''}` : ''}.<br><small>Código de verificação: <code>${esc(d.hash.slice(0, 16))}</code> · arquivada no Drive.</small></div>` : ''}
    ${d.status === 'Aguardando aprovação' ? `<div class="aviso info">Enviada por ${esc(d.enviado_por)}. ${d.pode_aprovar ? 'Confira e aprove ou devolva para ajustes.' : 'Aguardando quem aprova as medições desta obra.'}</div>` : ''}
    <div class="acoes fv-acoes">
      ${d.editavel ? `<a class="btn sec" href="#/med/editar/${esc(d.id)}">${ic('edit')} Editar período e serviços</a><button class="btn" id="mdEnviar">${ic('send')} Enviar para aprovação</button>` : ''}
      ${d.pode_aprovar ? `<button class="btn" id="mdAprovar">${ic('escudo')} Aprovar e arquivar</button><button class="btn sec" id="mdDevolver">Devolver para ajustes</button>` : ''}
      ${d.status === 'Aprovada' && apr ? `<button class="btn" id="mdPagar">${ic('money')} Marcar como paga</button>` : ''}
      ${['Aprovada', 'Paga'].includes(d.status) ? `<button class="btn sec" id="mdPdf">${ic('download')} Baixar PDF</button>${d.pasta_url ? `<a class="btn sec" href="${esc(d.pasta_url)}" target="_blank" rel="noopener">${ic('pasta')} Abrir pasta no Drive</a>` : ''}` : ''}
      ${['Rascunho', 'Devolvida', 'Aguardando aprovação'].includes(d.status) && (d.pode_lancar || apr) || (d.status === 'Aprovada' && apr) ? `<button class="btn perigo" id="mdCancelar">Cancelar medição</button>` : ''}
      ${!['Aprovada', 'Paga', 'Cancelada'].includes(d.status) ? `<button class="btn sec" id="mdPrev">${ic('eye')} Ver como PDF</button>` : ''}
    </div>
    <details class="fv-hist"><summary>Histórico (${hist.length})</summary>${hist.map(h => `<div class="alt"><b>${esc(h.acao)}</b>${h.nota ? ': ' + esc(h.nota) : ''}<br><small>${esc(h.por)} · ${esc(fdh(h.q))}</small></div>`).join('')}</details>`;
  const lig = (id, fn) => { const b = $('#' + id); if (b) b.onclick = async e => { const bt = e.currentTarget, t = bt.innerHTML; bt.disabled = true; try { await fn(); } catch (x) { toast(x.message, 1); } if (document.body.contains(bt)) { bt.disabled = false; bt.innerHTML = t; } }; };
  lig('mdEnviar', async () => { toast((await api('medicao_enviar', { id: d.id })).msg); await vMedDet(d.id); });
  lig('mdAprovar', async () => {
    if (!confirm('Aprovar esta medição? Ela recebe o número, é travada e arquivada no Drive com o seu aceite (login e horário).')) return;
    toast('Gerando o PDF…');
    const blob = await mdGerarPdf(d, true);
    const r = await api('medicao_aprovar', { id: d.id, numero_previsto: d.numero === '' ? d.proximo_numero : undefined, pdf: { nome: 'Medicao.pdf', b64: await paraB64(blob) } });
    toast(r.msg); await vMedDet(d.id);
  });
  lig('mdDevolver', async () => mdMotivo('Devolver para ajustes', 'medicao_devolver', 'O que precisa ser ajustado?'));
  lig('mdCancelar', async () => mdMotivo('Cancelar medição', 'medicao_cancelar', 'Motivo do cancelamento (os serviços ficam livres para outra medição)'));
  lig('mdPagar', async () => modal('Marcar como paga', `<label>Data do pagamento<input type="date" name="dia" value="${hoje()}" required></label><label>Observação <small>(opcional)</small><input name="obs" placeholder="ex: PIX, NF 123"></label>`, {
    ok: 'Marcar como paga', onOk: async f => { toast((await api('medicao_pagar', { id: d.id, pago_em: f.dia.value, obs: f.obs.value })).msg); await vMedDet(d.id); }
  }));
  lig('mdPdf', async () => { const r = await api('medicao_pdf', { id: d.id }); baixarBlob(new Blob([Uint8Array.from(atob(r.b64), c => c.charCodeAt(0))], { type: 'application/pdf' }), r.nome); });
  lig('mdPrev', async () => { const b = await mdGerarPdf(d, false); const u = URL.createObjectURL(b); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 120000); });
}
function mdMotivo(tit, acao, rotulo) {
  modal(tit, `<label>${rotulo}<textarea name="motivo" required minlength="5" rows="3"></textarea></label>`, {
    ok: 'Confirmar', onOk: async f => { toast((await api(acao, { id: MD.det.id, motivo: f.motivo.value })).msg); await vMedDet(MD.det.id); }
  });
}

/* ---------- PDF do boletim de medição ---------- */
async function mdGerarPdf(d, aprovando) {
  const numero = d.numero_txt || (aprovando && d.proximo_numero ? 'Medição ' + String(d.proximo_numero).padStart(3, '0') : 'Medição em preparo');
  return pdfDeFolha(mdFolha(d, numero, aprovando), { cab: `${numero} - ${d.emp.empresa || d.emp.nome} - ${d.obra.nome}`, rod: `${d.empresa} - ${d.obra.nome} - ${numero}` });
}
function mdFolha(d, numero, aprovando) {
  const quem = (S.sess && S.sess.usuario && S.sess.usuario.nome) || '';
  const porEtapa = {};
  d.itens.forEach(i => { (porEtapa[i.etapa_nome] = porEtapa[i.etapa_nome] || []).push(i); });
  const contratos = [...new Set(d.itens.map(i => i.contrato).filter(Boolean))];
  const sec = (t, c) => `<div class="rl-sec"><div class="rl-sec-t">${t}</div>${c}</div>`;
  const rdos = i => i.rdos.length ? rdoN(i.rdos[0]) + (i.rdos.length > 1 ? ' a ' + rdoN(i.rdos[i.rdos.length - 1]) : '') : '—';
  const aprov = aprovando ? `${esc(quem)} · ${new Date().toLocaleString('pt-BR')}` : d.aprovado_por ? `${esc(d.aprovado_por)} · ${esc(fdh(d.aprovado_em))}` : '';
  return `<div class="rl" id="mdFolha">
    <div class="rl-top rl-cut"><div class="rl-logo"><img src="logo.png" alt="Size Engenharia"></div>
      <div class="rl-tit"><small>${esc(d.empresa)}</small><b>BOLETIM DE MEDIÇÃO</b><span>${esc(d.emp.empresa || d.emp.nome)}</span></div>
      <div class="rl-per"><small>Identificação</small><b>${esc(numero)}</b><span>${fc(d.de)} a ${fc(d.ate)}/${String(d.ate).slice(0, 4)}</span></div></div>
    <div class="rl-sec"><table class="rl-t fv-idt"><tbody>
      <tr class="rl-cut"><td><small>Obra</small>${esc(d.obra.nome)}${d.obra.endereco ? ' · ' + esc(d.obra.endereco) : ''}</td><td><small>Período medido</small>${fd(d.de)} a ${fd(d.ate)}</td></tr>
      <tr class="rl-cut"><td><small>Empreiteiro</small>${esc(d.emp.empresa || d.emp.nome)}${d.emp.documento ? '<br>' + esc(d.emp.documento) : ''}</td><td><small>Responsável / contato</small>${esc([d.emp.responsavel, d.emp.telefone, d.emp.email].filter(Boolean).join(' · ') || '—')}</td></tr>
      <tr class="rl-cut"><td colspan="2"><small>Contrato de execução</small>${contratos.length ? esc(contratos.join(' · ')) : 'Não informado'}</td></tr></tbody></table></div>
    ${d.obs ? `<div class="rl-callout rl-cut"><div class="rl-sec-t sm">Observações</div>${esc(d.obs).replace(/\n/g, '<br>')}</div>` : ''}
    ${sec('Serviços medidos (concluídos, com FVS aprovada)', Object.keys(porEtapa).map(en => `<div class="rl-bloco rl-et"><div class="rl-et-t"><div><b>${esc(en)}</b></div></div>
      <table class="rl-t"><thead><tr><th>Serviço</th><th class="n">Quantidade</th><th>Concluído</th><th>Diários</th><th>FVS</th></tr></thead><tbody>
      ${porEtapa[en].map(i => `<tr><td>${esc(i.servico)}${i.complemento ? '<small>complemento de serviço já medido</small>' : ''}</td><td class="n"><b>${esc(qun(i.qtd, i.unidade, i.prevista))}</b></td><td>${fd(i.concluido_em)}</td><td>${rdos(i)}</td><td>${esc(i.fvs || '—')}</td></tr>`).join('')}</tbody></table></div>`).join(''))}
    ${sec('Total por serviço', `<div class="rl-bloco rl-et"><table class="rl-t"><tbody>${d.totais.map(t => `<tr><td>${esc(t.servico)}</td><td class="n"><b>${esc(qun(t.qtd, t.unidade, t.prevista))}</b></td></tr>`).join('')}</tbody></table></div>`)}
    ${sec('Memória de cálculo', `<div class="rl-bloco rl-lis">${d.itens.map(i => `<div class="rl-li"><span><b>${esc(i.servico)}</b> <small>${esc(i.etapa_nome)}</small><br><small>${i.dias.map(x => `${rdoN(x.rdo)} (${fc(x.data)}): ${esc(ehVerba(i.unidade) ? qun(x.qtd, i.unidade, i.prevista) : nf(x.qtd))}`).join(' · ')}</small></span></div>`).join('')}</div>`)}
    <div class="rl-sec rl-cut"><div class="fv-ass"><div><span></span><b>${esc(d.enviado_por || d.criado_por || quem)}</b><small>Medição lançada por</small></div>
      <div><span></span><b>${aprov || '&nbsp;'}</b><small>Aprovação (aceite eletrônico com login)</small></div></div></div>
    <div class="rl-nota rl-cut">Documento gerado pelo sistema Size Engenharia. A medição considera apenas serviços concluídos e com FVS aprovada. O aceite eletrônico e o código de verificação ficam registrados no sistema.</div></div>`;
}

/* ---------- rotas ---------- */
ROTAS.push(
  [/^#\/med$/, vMed], [/^#\/med\/nova(?:\?(.*))?$/, vMedNova], [/^#\/med\/editar\/(MD-[\w]+)$/, vMedEditar], [/^#\/med\/empreiteiros$/, vEquipes], [/^#\/med\/(MD-[\w]+)$/, vMedDet]
);
