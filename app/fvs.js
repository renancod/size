'use strict';
/* =====================================================================
 * FVS · Ficha de Verificação de Serviço (controle de qualidade)
 * Lista/consulta, biblioteca de modelos e a ficha (checklist O/X/⊗, croquis, alteração de projeto, aprovação e PDF).
 * Usa app.js (api, modal, view, comEtapas…), exec.js (EX, DSEM, rdoN…) e relatorio.js (pdfDeFolha).
 * ===================================================================== */
Object.assign(IC, {
  clip: 'M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1zM8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M9 13l2 2 4-4',
  clipe: 'M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5',
  lixo: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  escudo: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  pasta: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
});
const FV = { L: null, M: null, filtro: 'andamento', busca: '', tipo: '', det: null, st: null, thumbs: {}, salvando: 0 };
const FV_ST = {
  'Em execução': ['exec', 'Em execução'], 'Em preenchimento': ['prep', 'Em preenchimento'], 'Aguardando aprovação': ['aprov', 'Aguardando aprovação'],
  'Aprovada': ['ok', 'Aprovada'], 'Devolvida': ['dev', 'Devolvida'], 'Cancelada': ['canc', 'Cancelada']
};
const fvBadge = s => `<span class="badge fvb fvb-${(FV_ST[s] || ['x'])[0]}">${esc(s)}</span>`;
const FV_RES = { O: ['O', 'Aprovado'], X: ['X', 'Reprovado'], S: ['⊗', 'Aprovado após reinspeção'], N: ['N/A', 'Não se aplica'] };
const fvTit = f => f.numero_txt || 'FVS em preparação';
const fvAbertas = f => ['Em execução', 'Em preenchimento', 'Devolvida'].includes(f.status);

/* ---------- lista e consulta ---------- */
async function vFvsLista() {
  titulo('FVS · Qualidade');
  const [L, M] = await Promise.all([api('fvs_listar'), api('fvs_modelos')]);
  FV.L = L; FV.M = M;
  const F = {
    andamento: ['Em andamento', 'clock', f => ['Em execução', 'Em preenchimento', 'Devolvida'].includes(f.status)],
    aprovar: ['Para aprovar', 'alert', f => f.status === 'Aguardando aprovação'],
    aprovadas: ['Aprovadas (consulta)', 'check', f => f.status === 'Aprovada'],
    todas: ['Todas', 'layers', f => f.status !== 'Cancelada']
  };
  const todas = L.fvs;
  const grupos = [{ t: 'Situação', itens: Object.entries(F).map(([k, v]) => ({ k, t: v[0], i: v[1], n: todas.filter(v[2]).length, on: k === FV.filtro, cl: k === 'aprovar' ? 'quente' : '' })) }];
  const acoes = [];
  if (can('fvs_aprovar')) acoes.push({ k: 'a:modelos', t: 'Modelos de FVS', i: 'clip', cl: 'acao' });
  if (acoes.length) grupos.push({ t: 'Ações', itens: acoes });
  const tipos = [...new Set(todas.map(f => f.tipo))].sort();
  const base = todas.filter(F[FV.filtro][2]);
  const t = norm(FV.busca);
  const lista = base.filter(f => (!FV.tipo || f.tipo === FV.tipo) && (!t || norm([f.numero_txt, f.servico, f.etapa_nome, f.local, f.tipo, f.modelo, f.modelo_nome].join(' ')).includes(t)));
  view(comEtapas(grupos, `<div class="cab"><h2>${F[FV.filtro][0]}</h2><span class="contagem">${esc(S.dados.obra.nome)}</span></div>
    <div class="fv-filtros"><div class="busca">${ic('search')}<input type="search" id="fvBusca" placeholder="Buscar por número, serviço, rua, tipo…" value="${esc(FV.busca)}"></div>
      <select id="fvTipo" aria-label="Tipo"><option value="">Todos os tipos</option>${tipos.map(x => `<option ${x === FV.tipo ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
    <div class="fv-lista">${lista.map(fvCartao).join('') || `<div class="card vazio"><p>${todas.length ? 'Nenhuma FVS nesta visão.' : 'Nenhuma FVS ainda. Elas são abertas junto com cada frente de trabalho (em Execução → Nova etapa).'}</p></div>`}</div>`));
  ligarEtapas(k => { if (k === 'a:modelos') { location.hash = '#/fvs/modelos'; return; } FV.filtro = k; vFvsLista(); });
  $('#fvBusca').oninput = e => { FV.busca = e.target.value; const p = e.target.selectionStart; vFvsListaRender(F, todas); };
  $('#fvTipo').onchange = e => { FV.tipo = e.target.value; vFvsLista(); };
}
function vFvsListaRender(F, todas) { // só a lista (não perde o foco da busca)
  const t = norm(FV.busca), base = todas.filter(F[FV.filtro][2]);
  const lista = base.filter(f => (!FV.tipo || f.tipo === FV.tipo) && (!t || norm([f.numero_txt, f.servico, f.etapa_nome, f.local, f.tipo, f.modelo, f.modelo_nome].join(' ')).includes(t)));
  $('.fv-lista').innerHTML = lista.map(fvCartao).join('') || '<div class="card vazio"><p>Nenhuma FVS nesta visão.</p></div>';
}
function fvCartao(f) {
  const rdo = f.rdos ? (f.rdos === 1 ? rdoN(f.rdo_de) : `${rdoN(f.rdo_de)} a ${rdoN(f.rdo_ate)}`) : 'sem RDO ainda';
  return `<a class="card fv-card fvs-${(FV_ST[f.status] || ['x'])[0]}" href="#/fvs/${esc(f.id)}">
    <div class="fv-l1"><span class="fv-num">${esc(fvTit(f))}</span>${fvBadge(f.status)}${f.vistoria > 1 ? `<span class="badge fvb fvb-vist">${f.vistoria}ª vistoria</span>` : ''}${f.servico_concluido && fvAbertas(f) ? '<span class="badge fvb fvb-pronta">serviço concluído · verificar</span>' : ''}</div>
    <b class="fv-serv">${esc(f.servico)}</b>
    <small>${esc([f.tipo, f.modelo, f.etapa_nome + (f.local ? ' · ' + f.local : '')].filter(Boolean).join(' · '))}</small>
    <small class="fv-rdo">${ic('book')} ${esc(rdo)}${f.status === 'Aprovada' && f.aprovado_em ? ' · aprovada em ' + fd(f.aprovado_em) : ''}</small></a>`;
}

/* ---------- biblioteca de modelos ---------- */
async function vFvsModelos() {
  titulo('Modelos de FVS');
  if (!can('fvs_aprovar')) return view('<div class="card vazio"><p>Só o engenheiro ou o administrador edita os modelos de FVS.</p></div>');
  const M = await api('fvs_modelos');
  FV.M = M;
  const porCat = {};
  M.modelos.forEach(m => { ((porCat[m.categoria] = porCat[m.categoria] || {})[m.tipo] = (porCat[m.categoria][m.tipo] || [])).push(m); });
  view(`<a href="#/fvs" class="linkbtn">${ic('back')} FVS</a>
    <div class="cab"><h2>Modelos de FVS <span class="contagem">${M.modelos.length}</span></h2><button class="btn" id="novoMod">${ic('plus')} Novo modelo</button></div>
    <small>Cada modelo traz os itens de verificação. Ao mudar os itens, a revisão sobe sozinha; as FVS já emitidas guardam a revisão que usaram.</small>
    ${Object.keys(porCat).sort().map(cat => `<div class="card"><h3>${esc(cat)}</h3>${Object.keys(porCat[cat]).sort().map(tp => `<div class="fv-tipo"><div class="fv-tipo-t">${esc(tp)}</div>
      ${porCat[cat][tp].map(m => `<div class="arq fv-mod ${m.ativo ? '' : 'inativo'}" data-m="${esc(m.codigo)}" style="cursor:pointer"><span class="nome"><b>${esc(m.codigo)}</b> · ${esc(m.nome)}${m.revisar ? ' <span class="badge b-canc">revisar</span>' : ''}${m.ativo ? '' : ' <span class="badge b-canc">arquivada</span>'}<br><small>rev. ${esc(m.revisao)} · ${m.n_itens} itens${m.nota ? ' · ' + esc(m.nota) : ''}</small></span></div>`).join('')}</div>`).join('')}</div>`).join('')}`);
  $('#novoMod').onclick = () => mModelo(null);
  $$('[data-m]').forEach(el => { el.onclick = () => mModelo(M.modelos.find(m => m.codigo === el.dataset.m)); });
}
function mModelo(m) {
  const tax = FV.M.taxonomia, cats = Object.keys(tax);
  const f = modal(m ? 'Editar ' + m.codigo : 'Novo modelo de FVS', `
    <div class="g2"><label>Código<input name="codigo" required value="${esc(m?.codigo || '')}" placeholder="ex: FVS.31"></label>
      <label>Categoria<select name="categoria">${cats.map(c => `<option ${c === (m?.categoria || 'Infraestrutura') ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div>
    <label>Nome<input name="nome" required value="${esc(m?.nome || '')}" placeholder="ex: Execução de Meio-fio"></label>
    <label>Tipo <small>(rede de esgoto, rede de água, pavimentação… é por aqui que você pesquisa depois)</small><input name="tipo" list="dl-tipos" required value="${esc(m?.tipo || '')}"></label><datalist id="dl-tipos"></datalist>
    ${m && m.nota ? `<div class="aviso warn">${esc(m.nota)}</div>` : ''}
    <h3 style="margin:8px 0 0">Itens de verificação</h3>
    <small>Um item por linha. Para separar em blocos (ex.: Valetas, Fossa), use "Adicionar bloco".</small>
    <div id="blocos"></div><button type="button" class="btn sec peq" id="addBloco">${ic('plus')} Adicionar bloco</button>
    ${m ? `<label class="ck"><input type="checkbox" name="ativo" ${m.ativo ? 'checked' : ''}> Modelo ativo (desmarque para arquivar)</label>` : ''}`, {
    larga: true, ok: 'Salvar modelo',
    onOk: async fm => {
      const blocos = $$('.fv-bloco', fm).map(b => ({ titulo: $('[name=bt]', b).value.trim(), itens: $('[name=bi]', b).value.split('\n').map(s => s.trim()).filter(Boolean) })).filter(b => b.itens.length);
      const r = await api('fvs_modelo_salvar', { original: m?.codigo, codigo: fm.codigo.value, nome: fm.nome.value, categoria: fm.categoria.value, tipo: fm.tipo.value, ativo: fm.ativo ? fm.ativo.checked : true, blocos });
      toast(r.msg); await vFvsModelos();
    }
  });
  const dl = () => { $('#dl-tipos', f).innerHTML = (tax[f.categoria.value] || []).map(t => `<option value="${esc(t)}">`).join(''); };
  dl(); f.categoria.onchange = dl;
  const add = b => {
    const d = document.createElement('div');
    d.className = 'fv-bloco';
    d.innerHTML = `<label>Título do bloco <small>(opcional)</small><input name="bt" value="${esc(b?.titulo || '')}" placeholder="ex: A. Valetas"></label>
      <label>Itens <small>(um por linha)</small><textarea name="bi" rows="6" placeholder="Posição geográfica condiz com o projeto?">${esc((b?.itens || []).join('\n'))}</textarea></label>
      <button type="button" class="linkbtn rm">${ic('lixo')} remover este bloco</button>`;
    $('.rm', d).onclick = () => d.remove();
    $('#blocos', f).appendChild(d);
  };
  (m?.blocos?.length ? m.blocos : [{ itens: [] }]).forEach(add);
  $('#addBloco', f).onclick = () => add();
}

/* ---------- a ficha ---------- */
async function vFvs(id) {
  const d = await api('fvs_detalhe', { id });
  FV.det = d;
  FV.st = { chk: {}, nc: d.nc.map(x => Object.assign({}, x)), alt_sim: d.alteracao_sim, alt: d.alteracao, aut: d.alteracao_aut };
  titulo(fvTit(d));
  const n = d.vistoria, rdoTxt = d.rdo_lista.length ? d.rdo_lista.map(r => `<a class="rdo-chip" href="#/diario/${esc(r.data)}" title="${fd(r.data)}">${rdoN(r.numero)}<small>${fc(r.data)}</small></a>`).join('') : '<span class="mute">nenhum diário ainda — o serviço ainda não teve lançamento</span>';
  const si = d.servico_info;
  view(`<a href="#/fvs" class="linkbtn">${ic('back')} FVS</a>
    <div class="fv-hero ${'fvs-' + (FV_ST[d.status] || ['x'])[0]}"><div><span class="rel-sel">${ic('escudo')} Ficha de verificação de serviço</span><h2>${esc(fvTit(d))}</h2><p>${esc(d.servico)} · ${esc(d.tipo)}</p></div>
      <div class="fv-hero-d">${fvBadge(d.status)}<small>${esc(d.modelo)} · ${esc(d.modelo_nome)} · rev. ${esc(d.modelo_rev)}</small></div></div>
    ${d.status === 'Devolvida' && d.motivo ? `<div class="aviso warn"><b>Devolvida:</b> ${esc(d.motivo)}</div>` : ''}
    <div class="card fv-ident"><dl class="kv"><dt>Obra</dt><dd>${esc(d.obra.nome)}</dd>
      <dt>Frente de trabalho</dt><dd>${esc([d.etapa_nome, d.etapa_local, d.frente].filter(Boolean).join(' · '))}</dd>
      <dt>Serviço</dt><dd>${esc(d.servico)} — ${nf(si.executado)} de ${nf(si.prevista)} ${esc(si.unidade)} (${pct(si.pct)})</dd>
      <dt>Executor</dt><dd>${d.equipes.length ? esc(d.equipes.join(', ')) : '—'}</dd>
      <dt>Verificação</dt><dd>${esc(d.preenchido_por || '—')}${d.enviado_por && d.enviado_por !== d.preenchido_por ? ' · enviada por ' + esc(d.enviado_por) : ''}</dd></dl>
      <div class="fv-rdos"><b>${ic('book')} Diários de obra vinculados</b><div class="rdo-chips">${rdoTxt}</div><small class="mute">A lista cresce a cada diário em que este serviço é lançado.</small></div></div>
    <div id="fvPend"></div>
    <div class="card" id="fvChk"></div>
    <div class="card" id="fvAlt"></div>
    <div class="card" id="fvNc"></div>
    <div class="card" id="fvCro"></div>
    <div class="card" id="fvAcao"></div>`);
  fvDesenhaChk(); fvDesenhaAlt(); fvDesenhaNc(); fvDesenhaCro(); fvDesenhaAcao(); fvDesenhaPend(d.pendencias);
}
function fvDesenhaPend(p) {
  const el = $('#fvPend'); if (!el) return;
  el.innerHTML = FV.det.pode_preencher && p && p.length ? `<div class="aviso info"><b>Para enviar para aprovação falta:</b><ul>${p.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
}
function fvEfetivo(k, n, d) { const c = d.checklist[k] || {}; for (let i = n; i >= 1; i--) { const r = (FV.st.chk[k] && i === n ? FV.st.chk[k].r : c['r' + i]); if (r) return r; } return ''; }

/* checklist */
function fvDesenhaChk() {
  const d = FV.det, n = d.vistoria, ed = d.pode_preencher, el = $('#fvChk');
  const vd = d.vistorias[n] || '';
  const temX = d.blocos.some((b, bi) => b.itens.some((t, ii) => fvEfetivo(bi + '.' + ii, n, d) === 'X'));
  el.innerHTML = `<div class="cab"><h3 style="flex:1;margin:0">Verificação do serviço</h3><span class="badge fvb fvb-vist">${n}ª vistoria${vd ? ' · ' + fd(vd) : ''}</span></div>
    <small class="fv-leg"><b>O</b> aprovado · <b>X</b> reprovado · <b>⊗</b> aprovado após reinspeção · <b>N/A</b> não se aplica</small>
    ${d.blocos.map((b, bi) => `${b.titulo ? `<div class="fv-bt">${esc(b.titulo)}</div>` : ''}${b.itens.map((t, ii) => {
      const k = bi + '.' + ii, c = d.checklist[k] || {}, atual = FV.st.chk[k] ? FV.st.chk[k].r : (c['r' + n] || ''), ant = !atual && n > 1 ? fvEfetivo(k, n - 1, d) : '';
      const hist = [1, 2, 3].filter(i => i < n && c['r' + i]).map(i => `<span class="fv-h h-${c['r' + i]}">${i}ª: ${FV_RES[c['r' + i]][0]}</span>`).join('');
      const obs = FV.st.chk[k] && FV.st.chk[k].obs !== undefined ? FV.st.chk[k].obs : (c.obs || '');
      return `<div class="fv-item" data-k="${k}"><div class="fv-t"><b>${d.blocos.slice(0, bi).reduce((s, x) => s + x.itens.length, 0) + ii + 1}</b><span>${esc(t)}</span></div>
        <div class="fv-res">${ed ? Object.keys(FV_RES).filter(r => r !== 'S' || n >= 2).map(r => `<button type="button" class="fv-r r-${r} ${atual === r ? 'on' : ''}" data-r="${r}" title="${FV_RES[r][1]}">${FV_RES[r][0]}</button>`).join('') : `<span class="fv-h h-${atual || 'v'}">${atual ? FV_RES[atual][0] : '—'}</span>`}
          ${hist}${ant ? `<small class="mute">mantido da vistoria anterior: ${FV_RES[ant][0]}</small>` : ''}</div>
        ${ed ? `<input class="fv-obs" placeholder="Observação (opcional)" value="${esc(obs)}">` : obs ? `<small class="mute">${esc(obs)}</small>` : ''}</div>`;
    }).join('')}`).join('')}
    ${ed ? `<div class="acoes" style="margin-top:12px"><span class="mute" id="fvSalvo"></span>${temX && n < 3 ? `<button type="button" class="btn sec peq" id="fvVist">${ic('refresh')} Registrar nova vistoria (reinspeção)</button>` : ''}</div>${temX && n >= 3 ? '<div class="aviso warn">Já foram feitas 3 vistorias e ainda há item reprovado: resolva com o executor (a 3ª pode gerar multa).</div>' : ''}` : ''}`;
  if (!ed) return;
  $$('.fv-item', el).forEach(it => {
    const k = it.dataset.k;
    $$('.fv-r', it).forEach(b => { b.onclick = () => { fvSet(k, { r: FV.st.chk[k] && FV.st.chk[k].r === b.dataset.r ? '' : b.dataset.r }); $$('.fv-r', it).forEach(x => x.classList.toggle('on', FV.st.chk[k].r === x.dataset.r)); fvAuto(); }; });
    $('.fv-obs', it).oninput = e => { fvSet(k, { obs: e.target.value }); fvAuto(); };
  });
  if ($('#fvVist')) $('#fvVist').onclick = async () => { try { await fvSalvarJa(); toast((await api('fvs_nova_vistoria', { id: d.id })).msg); await vFvs(d.id); } catch (x) { toast(x.message, 1); } };
}
function fvSet(k, v) {
  const d = FV.det, c = d.checklist[k] || {};
  const cur = FV.st.chk[k] || { r: c['r' + d.vistoria] || '', obs: c.obs || '' };
  FV.st.chk[k] = Object.assign(cur, v);
}
let FVT = null;
function fvAuto() { clearTimeout(FVT); const s = $('#fvSalvo'); if (s) s.textContent = 'Alterações não salvas…'; FVT = setTimeout(() => fvSalvarJa().catch(x => toast(x.message, 1)), 1200); }
async function fvSalvarJa() {
  clearTimeout(FVT);
  const d = FV.det, s = FV.st;
  if (!d.pode_preencher) return;
  const checklist = {};
  Object.keys(s.chk).forEach(k => { checklist[k] = { r: s.chk[k].r || '', obs: s.chk[k].obs || '' }; });
  const r = await api('fvs_salvar', { id: d.id, checklist, nc: s.nc.filter(x => x.ocorrencia || x.item), alteracao_sim: s.alt_sim, alteracao: s.alt, alteracao_aut: s.aut });
  // o que foi salvo vira "o estado do servidor"
  Object.keys(checklist).forEach(k => { d.checklist[k] = d.checklist[k] || {}; d.checklist[k]['r' + d.vistoria] = checklist[k].r; d.checklist[k].obs = checklist[k].obs; });
  FV.st.chk = {};
  d.pendencias = r.pendencias; d.alteracao_sim = s.alt_sim; d.alteracao = s.alt; d.alteracao_aut = s.aut;
  if (d.status === 'Em execução' || d.status === 'Devolvida') d.status = 'Em preenchimento';
  const e = $('#fvSalvo'); if (e) e.textContent = 'Salvo ✓';
  fvDesenhaPend(r.pendencias);
}

/* alteração em relação ao projeto */
function fvDesenhaAlt() {
  const d = FV.det, s = FV.st, ed = d.pode_preencher, el = $('#fvAlt');
  el.innerHTML = `<h3>Executado conforme o projeto?</h3>
    ${ed ? `<div class="fv-sn"><button type="button" class="fv-r r-O ${s.alt_sim === 'Não' ? 'on' : ''}" data-s="Não">Sim, sem alteração</button><button type="button" class="fv-r r-X ${s.alt_sim === 'Sim' ? 'on' : ''}" data-s="Sim">Houve alteração</button></div>`
      : `<p>${s.alt_sim === 'Sim' ? '<b>Houve alteração em relação ao projeto.</b>' : s.alt_sim === 'Não' ? 'Executado conforme o projeto, sem alteração.' : '—'}</p>`}
    ${s.alt_sim === 'Sim' ? (ed ? `<label>O que mudou<textarea id="fvAlt1" rows="3" placeholder="ex: PV 4 deslocado 2 m por interferência de rede de água">${esc(s.alt)}</textarea></label>
      <label>Quem autorizou<input id="fvAlt2" value="${esc(s.aut)}" placeholder="nome de quem autorizou a alteração"></label>` : `<dl class="kv"><dt>O que mudou</dt><dd>${esc(s.alt)}</dd><dt>Autorizado por</dt><dd>${esc(s.aut)}</dd></dl>`) : ''}
    ${ed && s.alt_sim === 'Sim' ? '<small class="mute">Junte a autorização de serviço aos anexos, se houver.</small>' : ''}`;
  if (!ed) return;
  $$('[data-s]', el).forEach(b => { b.onclick = () => { s.alt_sim = b.dataset.s; fvDesenhaAlt(); fvAuto(); }; });
  if ($('#fvAlt1')) { $('#fvAlt1').oninput = e => { s.alt = e.target.value; fvAuto(); }; $('#fvAlt2').oninput = e => { s.aut = e.target.value; fvAuto(); }; }
}

/* não conformidades */
function fvDesenhaNc() {
  const d = FV.det, s = FV.st, ed = d.pode_preencher, el = $('#fvNc');
  if (!ed && !s.nc.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="cab"><h3 style="flex:1;margin:0">Não conformidades e tratamento</h3>${ed ? `<button type="button" class="btn sec peq" id="ncAdd">${ic('plus')} Registrar</button>` : ''}</div>
    ${s.nc.map((x, i) => `<div class="fv-nc" data-i="${i}">${ed ? `<div class="g2"><label>Item<input data-f="item" value="${esc(x.item)}" placeholder="nº do item"></label><label>Local<input data-f="local" value="${esc(x.local)}" placeholder="ex: PV 3, estaca 12"></label></div>
      <label>Ocorrência<textarea data-f="ocorrencia" rows="2">${esc(x.ocorrencia)}</textarea></label><label>Solução adotada<textarea data-f="solucao" rows="2">${esc(x.solucao)}</textarea></label>
      <button type="button" class="linkbtn" data-del="${i}">${ic('lixo')} remover</button>`
      : `<dl class="kv"><dt>Item</dt><dd>${esc(x.item)}</dd><dt>Local</dt><dd>${esc(x.local)}</dd><dt>Ocorrência</dt><dd>${esc(x.ocorrencia)}</dd><dt>Solução</dt><dd>${esc(x.solucao)}</dd></dl>`}</div>`).join('') || '<p class="vazio">Nenhuma não conformidade registrada.</p>'}`;
  if (!ed) return;
  $('#ncAdd').onclick = () => { s.nc.push({ item: '', ocorrencia: '', local: '', solucao: '' }); fvDesenhaNc(); };
  $$('.fv-nc', el).forEach(b => {
    const i = +b.dataset.i;
    $$('[data-f]', b).forEach(inp => { inp.oninput = () => { s.nc[i][inp.dataset.f] = inp.value; fvAuto(); }; });
    $('[data-del]', b).onclick = () => { s.nc.splice(i, 1); fvDesenhaNc(); fvAuto(); };
  });
}

/* croquis e anexos */
const fvEhImg = a => /^image\//i.test(a.mime || '') || /\.(png|jpe?g|webp)$/i.test(a.nome || '');
async function fvImg(id, arq) {
  const k = id + '|' + arq;
  if (!FV.thumbs[k]) FV.thumbs[k] = api('fvs_anexo_ver', { id, arquivo: arq });
  return FV.thumbs[k];
}
function fvDesenhaCro() {
  const d = FV.det, ed = d.pode_preencher, el = $('#fvCro');
  const slot = (tipo, tit, sub) => {
    const l = d.anexos.filter(a => a.tipo === tipo);
    return `<div class="fv-slot"><div class="fv-slot-t"><b>${tit}</b><small>${sub}</small></div>
      <div class="fv-arqs">${l.map(a => `<div class="fv-arq" data-a="${esc(a.id)}">${fvEhImg(a) ? '<img alt="" class="fv-th">' : `<span class="fv-doc">${ic('file')}</span>`}<small>${esc(a.nome)}</small>${ed ? `<button type="button" class="icbtn" data-rm="${esc(a.id)}" aria-label="Remover">${ic('lixo')}</button>` : ''}</div>`).join('') || '<small class="mute">nenhum arquivo ainda</small>'}</div>
      ${ed ? `<label class="btn sec peq fv-up">${ic('clipe')} Anexar<input type="file" accept="image/*,application/pdf" data-up="${tipo}" hidden></label>` : ''}</div>`;
  };
  el.innerHTML = `<h3>Croquis e anexos</h3><div class="fv-slots">${slot('base', 'Croqui base', 'projeto com as alturas e locações (de onde foi coletado)')}${slot('exec', 'Croqui de execução', 'o que foi coletado em campo, sobre o existente')}</div>
    <div class="fv-slot fv-outro"><div class="fv-slot-t"><b>Outros documentos</b><small>autorização de serviço, laudos, fotos…</small></div>${(() => { const l = d.anexos.filter(a => a.tipo === 'outro'); return `<div class="fv-arqs">${l.map(a => `<div class="fv-arq" data-a="${esc(a.id)}">${fvEhImg(a) ? '<img alt="" class="fv-th">' : `<span class="fv-doc">${ic('file')}</span>`}<small>${esc(a.nome)}</small>${ed ? `<button type="button" class="icbtn" data-rm="${esc(a.id)}" aria-label="Remover">${ic('lixo')}</button>` : ''}</div>`).join('') || '<small class="mute">nenhum arquivo</small>'}</div>${ed ? `<label class="btn sec peq fv-up">${ic('clipe')} Anexar<input type="file" accept="image/*,application/pdf" data-up="outro" hidden></label>` : ''}`; })()}</div>`;
  $$('.fv-arq', el).forEach(b => {
    const a = d.anexos.find(x => x.id === b.dataset.a), im = $('img', b);
    if (im) fvImg(d.id, a.id).then(r => { im.src = `data:${r.mime};base64,${r.b64}`; }).catch(() => {});
    b.onclick = async ev => { if (ev.target.closest('[data-rm]')) return; try { const r = await fvImg(d.id, a.id); const u = URL.createObjectURL(new Blob([Uint8Array.from(atob(r.b64), c => c.charCodeAt(0))], { type: r.mime })); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000); } catch (x) { toast(x.message, 1); } };
  });
  $$('[data-rm]', el).forEach(b => { b.onclick = async () => { if (!confirm('Remover este anexo?')) return; try { const r = await api('fvs_anexo_remover', { id: d.id, arquivo: b.dataset.rm }); d.anexos = r.anexos; fvDesenhaCro(); await fvRefazPend(); } catch (x) { toast(x.message, 1); } }; });
  $$('[data-up]', el).forEach(inp => {
    inp.onchange = async () => {
      try {
        const arq = await lerArquivo(inp);
        if (!arq) return;
        toast('Enviando o arquivo…');
        const r = await api('fvs_anexo', { id: d.id, tipo: inp.dataset.up, arquivo: arq });
        d.anexos = r.anexos; toast(r.msg); fvDesenhaCro(); await fvRefazPend();
      } catch (x) { toast(x.message, 1); }
    };
  });
}
async function fvRefazPend() { const r = await api('fvs_detalhe', { id: FV.det.id }); FV.det.pendencias = r.pendencias; fvDesenhaPend(r.pendencias); }

/* rodapé de ações: enviar, aprovar, devolver, reabrir, cancelar, PDF */
function fvDesenhaAcao() {
  const d = FV.det, el = $('#fvAcao');
  const hist = d.historico.slice().reverse();
  el.innerHTML = `<h3>Aprovação</h3>
    ${d.status === 'Aprovada' ? `<div class="aviso ok">${ic('escudo')} <b>${esc(d.numero_txt)}</b> aprovada por <b>${esc(d.aprovado_por)}</b> em ${esc(fdh(d.aprovado_em))}${d.auto_aprovada ? ' (mesma pessoa que preencheu)' : ''}.<br><small>Código de verificação: <code>${esc(d.hash.slice(0, 16))}</code> · arquivada na pasta de FVS do mês no Drive.</small></div>` : ''}
    ${d.status === 'Aguardando aprovação' ? `<div class="aviso info">Enviada por ${esc(d.enviado_por)}. ${d.pode_aprovar ? 'Confira e aprove ou devolva para ajustes.' : 'Aguardando um engenheiro ou administrador aprovar.'}</div>` : ''}
    <div class="acoes fv-acoes">
      ${d.pode_preencher ? `<button class="btn sec" id="fvSalvar">${ic('check')} Salvar</button><button class="btn" id="fvEnviar">${ic('send')} Enviar para aprovação</button>` : ''}
      ${d.pode_aprovar ? `<button class="btn" id="fvAprovar">${ic('escudo')} Aprovar e arquivar</button><button class="btn sec" id="fvDevolver">Devolver para ajustes</button>` : ''}
      ${d.status === 'Aprovada' ? `<button class="btn sec" id="fvPdf">${ic('download')} Baixar PDF</button>${d.pasta_url ? `<a class="btn sec" href="${esc(d.pasta_url)}" target="_blank" rel="noopener">${ic('pasta')} Abrir pasta no Drive</a>` : ''}` : ''}
      ${d.status === 'Aprovada' && can('fvs_aprovar') ? `<button class="btn perigo" id="fvReabrir">Reabrir</button>` : ''}
      ${['Em execução', 'Em preenchimento', 'Devolvida', 'Aguardando aprovação'].includes(d.status) && can('fvs_aprovar') ? `<button class="btn perigo" id="fvCancelar">Cancelar FVS</button>` : ''}
      ${d.status !== 'Aprovada' && d.status !== 'Cancelada' ? `<button class="btn sec" id="fvPrev">${ic('eye')} Ver como PDF</button>` : ''}
    </div>
    <details class="fv-hist"><summary>Histórico (${hist.length})</summary>${hist.map(h => `<div class="alt"><b>${esc(h.acao)}</b>${h.nota ? ': ' + esc(h.nota) : ''}<br><small>${esc(h.por)} · ${esc(fdh(h.q))}</small></div>`).join('')}</details>`;
  const lig = (id, fn) => { const b = $('#' + id); if (b) b.onclick = async e => { const bt = e.currentTarget, t = bt.innerHTML; bt.disabled = true; try { await fn(); } catch (x) { toast(x.message, 1); } if (document.body.contains(bt)) { bt.disabled = false; bt.innerHTML = t; } }; };
  lig('fvSalvar', async () => { await fvSalvarJa(); toast('FVS salva.'); });
  lig('fvEnviar', async () => { await fvSalvarJa(); toast((await api('fvs_enviar', { id: d.id })).msg); await vFvs(d.id); });
  lig('fvAprovar', () => fvAprovar());
  lig('fvDevolver', () => fvMotivo('Devolver para ajustes', 'fvs_devolver', 'O que precisa ser ajustado?'));
  lig('fvReabrir', () => fvMotivo('Reabrir FVS aprovada', 'fvs_reabrir', 'Por que está reabrindo? (fica registrado)'));
  lig('fvCancelar', () => fvMotivo('Cancelar FVS', 'fvs_cancelar', 'Motivo do cancelamento'));
  lig('fvPrev', async () => { await fvSalvarJa(); const b = await fvGerarPdf(d, false); const u = URL.createObjectURL(b); window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 120000); });
  lig('fvPdf', async () => { const r = await api('fvs_pdf', { id: d.id }); baixarBlob(new Blob([Uint8Array.from(atob(r.b64), c => c.charCodeAt(0))], { type: 'application/pdf' }), r.nome); });
}
function fvMotivo(titulo_, acao, rotulo) {
  modal(titulo_, `<label>${rotulo}<textarea name="motivo" required minlength="5" rows="3"></textarea></label>`, {
    ok: 'Confirmar',
    onOk: async f => { toast((await api(acao, { id: FV.det.id, motivo: f.motivo.value })).msg); await vFvs(FV.det.id); }
  });
}
async function fvAprovar() {
  const d = FV.det;
  if (!confirm('Aprovar esta FVS? Ela recebe o número, é travada e arquivada no Drive com o seu aceite (login e horário).')) return;
  toast('Gerando o PDF…');
  const blob = await fvGerarPdf(d, true);
  const r = await api('fvs_aprovar', { id: d.id, numero_previsto: d.numero === '' ? d.proximo_numero : undefined, pdf: { nome: 'FVS.pdf', b64: await paraB64(blob) } });
  toast(r.msg);
  await vFvs(d.id);
}

/* ---------- PDF da ficha ---------- */
async function fvGerarPdf(d, aprovando) {
  const imgs = {};
  for (const a of d.anexos.filter(fvEhImg)) { try { const r = await fvImg(d.id, a.id); imgs[a.id] = `data:${r.mime};base64,${r.b64}`; } catch (e) { /* sem a imagem */ } }
  const numero = d.numero_txt || (aprovando && d.proximo_numero ? 'FVS ' + String(d.proximo_numero).padStart(3, '0') : 'FVS (número na aprovação)');
  const html = fvFolha(d, imgs, numero, aprovando);
  return pdfDeFolha(html, { cab: `${numero} - ${d.servico} - ${d.obra.nome}`, rod: `${d.empresa} - ${d.obra.nome} - ${numero}` });
}
function fvFolha(d, imgs, numero, aprovando) {
  const n = d.vistoria, vs = d.vistorias, quem = ctxUsuarioNome();
  const res = r => r ? `<b class="fr-${r}">${FV_RES[r][0]}</b>` : '';
  let seq = 0;
  const linhas = d.blocos.map((b, bi) => `${b.titulo ? `<tr class="fr-bt"><td colspan="5">${esc(b.titulo)}</td></tr>` : ''}${b.itens.map((t, ii) => {
    const c = d.checklist[bi + '.' + ii] || {}; seq++;
    return `<tr><td class="n">${seq}</td><td>${esc(t)}${c.obs ? `<small>${esc(c.obs)}</small>` : ''}</td>${[1, 2, 3].map(i => `<td class="v">${res(c['r' + i])}</td>`).join('')}</tr>`;
  }).join('')}`).join('');
  const croq = tipo => d.anexos.filter(a => a.tipo === tipo).map(a => imgs[a.id]
    ? `<div class="rl-bloco fv-cq"><img src="${imgs[a.id]}" alt=""><small>${esc(a.nome)}</small></div>`
    : `<div class="rl-bloco fv-cq"><small>${esc(a.nome)} — arquivo guardado na pasta da FVS no Drive.</small></div>`).join('');
  const outros = d.anexos.filter(a => a.tipo === 'outro').map(a => esc(a.nome)).join(' · ');
  const sec = (t, c) => `<div class="rl-sec"><div class="rl-sec-t">${t}</div>${c}</div>`;
  const vtxt = Object.keys(vs).sort().map(i => `${i}ª: ${fd(vs[i])}`).join(' · ');
  const aprov = aprovando ? `${esc(quem)} · ${new Date().toLocaleString('pt-BR')}` : d.aprovado_por ? `${esc(d.aprovado_por)} · ${esc(fdh(d.aprovado_em))}` : '';
  return `<div class="rl" id="fvFolha">
    <div class="rl-top rl-cut"><div class="rl-logo"><img src="logo.png" alt="Size Engenharia"></div>
      <div class="rl-tit"><small>${esc(d.empresa)}</small><b>FICHA DE VERIFICAÇÃO DE SERVIÇO</b><span>${esc(d.modelo)} · ${esc(d.modelo_nome)} · rev. ${esc(d.modelo_rev)}</span></div>
      <div class="rl-per"><small>Identificação</small><b>${esc(numero)}</b><span>${esc(d.tipo)}</span></div></div>
    <div class="rl-sec"><table class="rl-t fv-idt"><tbody>
      <tr class="rl-cut"><td><small>Obra</small>${esc(d.obra.nome)}</td><td><small>Frente de trabalho</small>${esc([d.etapa_nome, d.etapa_local].filter(Boolean).join(' · '))}</td></tr>
      <tr class="rl-cut"><td><small>Serviço</small>${esc(d.servico)} · ${nf(d.servico_info.executado)} de ${nf(d.servico_info.prevista)} ${esc(d.servico_info.unidade)}</td><td><small>Executor</small>${esc(d.equipes.join(', ') || '—')}</td></tr>
      <tr class="rl-cut"><td><small>Conferente / engenheiro</small>${esc(d.preenchido_por || quem || '—')}</td><td><small>Vistorias</small>${esc(vtxt || '—')}</td></tr>
      <tr class="rl-cut"><td colspan="2"><small>Diários de obra vinculados</small>${d.rdo_lista.length ? d.rdo_lista.map(r => `${rdoN(r.numero)} (${fc(r.data)})`).join(' · ') : 'nenhum'}</td></tr></tbody></table></div>
    ${sec('Verificação do serviço', `<table class="rl-t fv-vt"><thead><tr><th class="n">Item</th><th>Descrição</th><th class="v">1ª</th><th class="v">2ª</th><th class="v">3ª</th></tr></thead><tbody>${linhas}</tbody></table>
      <div class="rl-leg" style="margin:6px 0 0"><b>O</b> aprovado · <b>X</b> reprovado · <b>⊗</b> aprovado após reinspeção · <b>N/A</b> não se aplica</div>`)}
    ${sec('Executado conforme o projeto?', `<div class="rl-bloco fv-alt">${d.alteracao_sim === 'Sim' ? `<b>Houve alteração:</b> ${esc(d.alteracao)}<br><small>Autorizado por: ${esc(d.alteracao_aut)}</small>` : d.alteracao_sim === 'Não' ? 'Sim, executado conforme o projeto, sem alteração.' : '—'}</div>`)}
    ${d.nc.length ? sec('Não conformidades e tratamento', `<table class="rl-t"><thead><tr><th>Item</th><th>Ocorrência</th><th>Local</th><th>Solução adotada</th></tr></thead><tbody>${d.nc.map(x => `<tr><td>${esc(x.item)}</td><td>${esc(x.ocorrencia)}</td><td>${esc(x.local)}</td><td>${esc(x.solucao)}</td></tr>`).join('')}</tbody></table>`) : ''}
    ${d.anexos.some(a => a.tipo === 'base') ? sec('Croqui base (projeto: alturas e locações)', croq('base')) : ''}
    ${d.anexos.some(a => a.tipo === 'exec') ? sec('Croqui de execução (coleta em campo)', croq('exec')) : ''}
    ${outros ? `<div class="rl-leg rl-cut">Outros documentos anexados (na pasta da FVS): ${outros}</div>` : ''}
    <div class="rl-sec rl-cut"><div class="fv-ass"><div><span></span><b>${esc(d.preenchido_por || quem || '')}</b><small>Conferente · engenheiro responsável</small></div>
      <div><span></span><b>${aprov || '&nbsp;'}</b><small>Aprovação (aceite eletrônico com login)</small></div></div></div>
    <div class="rl-nota rl-cut">Documento gerado pelo sistema Size Engenharia. O aceite eletrônico (usuário, data e hora) e o código de verificação ficam registrados na ficha digital.</div></div>`;
}
const ctxUsuarioNome = () => (S.sess && S.sess.usuario && S.sess.usuario.nome) || '';

/* ---------- rotas ---------- */
ROTAS.push([/^#\/fvs$/, vFvsLista], [/^#\/fvs\/modelos$/, vFvsModelos], [/^#\/fvs\/(FV-[\w]+)$/, vFvs]);
