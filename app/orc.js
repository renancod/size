'use strict';
/* =====================================================================
 * ORÇAMENTO DA OBRA · frentes gerais (ex: Rede de Esgoto) com o que cada uma precisa executar,
 * valores de referência de material e de mão de obra, materiais (composição por serviço ou direto na frente)
 * e o painel da obra: orçado × programado × executado × contratado, falta comprar e consumido.
 * As frentes de execução (exec.js) consomem o saldo; o contrato (ctr.js) puxa a mão de obra.
 * Usa app.js (api, modal, view, comEtapas…) e exec.js (pct, mEtapa, carregarExec).
 * ===================================================================== */
const OR = { d: null };
const orPode = () => can(['orc_ver', 'orc_gerir']);
const orGere = () => can('orc_gerir');
/* número como se digita no Brasil: "2.500" = dois mil e quinhentos, "1,05", "49.6" */
function orPn(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  return num(s);
}
const orV = v => (v === '' || v == null ? '' : String(v).replace('.', ','));
const orM = v => brl(Number(v) || 0);
const orBar = (p, cl) => `<div class="ct-bar ${cl || ''}"><i style="width:${Math.min(100, Math.max(0, Number(p) || 0))}%"></i></div>`;
const OR_SIT = { comprar: ['Comprar', 'fvb-dev'], parcial: ['Falta parte', 'fvb-aprov'], em_compra: ['Em compra', 'fvb-prep'], ok: ['Comprado', 'fvb-ok'], fora: ['Fora do orçamento', 'fvb-exec'] };
const orSit = s => `<span class="badge fvb ${OR_SIT[s] ? OR_SIT[s][1] : ''}">${OR_SIT[s] ? OR_SIT[s][0] : esc(s)}</span>`;
const OR_AL = { comprar: 'cart', consumo: 'box', programado: 'layers', executado: 'alert', contratado: 'file' };

async function carregarOrc() { OR.d = await api('orc_dados'); return OR.d; }
const orFrente = cod => (OR.d?.frentes || []).find(f => f.codigo === cod);
function orSemAcesso() { view('<div class="card vazio"><p>Você não tem acesso ao orçamento desta obra.</p></div>'); }

/* menu lateral comum das telas do orçamento */
function orGrupos(D, aqui) {
  const fr = D.frentes.filter(f => f.ativa || f.itens.length);
  const g = [{ t: 'Obra', itens: [{ k: 'v:painel', t: 'Painel da obra', i: 'chart', on: aqui === 'painel' }, { k: 'v:orc', t: 'Orçamento (quantidades)', i: 'list', on: aqui === 'orc' }, { k: 'v:fin', t: 'Valores (financeiro)', i: 'money', on: aqui === 'fin' }] },
    { t: 'Frentes gerais', itens: fr.map(f => ({ k: 'fr:' + f.codigo, t: f.nome, i: 'grid', n: f.resumo.falta_comprar || undefined, cl: f.resumo.falta_comprar ? 'quente' : '', on: aqui === f.codigo })) }];
  if (orGere()) g.push({ t: 'Ações', itens: [{ k: 'a:frente', t: 'Nova frente geral', i: 'plus', cl: 'acao' }] });
  return g;
}
function orLigar(D) {
  ligarEtapas(k => {
    if (k === 'v:painel') location.hash = '#/obra';
    else if (k === 'v:orc') location.hash = '#/obra/orcamento';
    else if (k === 'v:fin') location.hash = '#/obra/financeiro';
    else if (k.startsWith('fr:')) location.hash = '#/obra/frente/' + enc(k.slice(3));
    else if (k === 'a:frente') mOrFrente();
  });
}

/* ---------- painel da obra ---------- */
async function vObra() {
  titulo('Painel da obra');
  if (!orPode()) return orSemAcesso();
  const D = await carregarOrc(), R = D.resumo;
  const com = D.frentes.filter(f => f.itens.length || f.materiais.some(m => m.orcado));   // frente só com compras fora do orçamento não entra no painel
  const al = D.alertas;
  view(comEtapas(orGrupos(D, 'painel'), `<div class="cab"><h2>Painel da obra</h2><span class="contagem">${esc(D.obra.nome)}</span></div>${obraInativa() ? AVISO_INATIVA : ''}
    ${!com.length ? `<div class="card vazio"><p><b>Comece pelo orçamento da obra.</b><br>Para cada frente geral (ex: Rede de Esgoto), cadastre o que precisa executar (ex: 2.500 m de rede), o valor de material e o de mão de obra, e os materiais. As frentes de execução passam a consumir esse saldo e o painel mostra o que falta comprar.</p>
      ${orGere() ? `<div class="acoes"><a class="btn" href="#/obra/orcamento">${ic('plus')} Montar o orçamento</a></div>` : ''}</div>` : `
    <div class="ct-res or-res">
      <div class="card"><small>Orçado (material + mão de obra)</small><b>${orM(R.v_total)}</b><small>material ${orM(R.v_material)} · MO ${orM(R.v_mo)}</small></div>
      <div class="card"><small>Executado</small><b>${pct(R.pct_exec)}</b>${orBar(R.pct_exec)}<small>${orM(R.v_exec)} do orçado</small></div>
      <div class="card"><small>Mão de obra contratada</small><b>${orM(R.mo_contratado)}</b>${orBar(R.v_mo ? R.mo_contratado / R.v_mo * 100 : 0, 'med')}<small>de ${orM(R.v_mo)} orçados</small></div>
      <div class="card"><small>Material comprado</small><b>${orM(R.material_comprado)}</b>${orBar(R.v_material ? R.material_comprado / R.v_material * 100 : 0, 'pg')}<small>de ${orM(R.v_material)} orçados</small></div>
      <div class="card ${R.falta_comprar ? 'or-quente' : ''}"><small>Materiais a comprar</small><b>${R.falta_comprar}</b><small>${R.falta_comprar ? 'veja abaixo' : 'nada pendente'}</small></div></div>
    ${al.length ? `<div class="card"><h3>${ic('alert')} O que precisa de atenção <small>(${al.length})</small></h3>${al.slice(0, 20).map(a => `<a class="alerta or-al or-al-${a.tipo}" href="#/obra/frente/${enc(a.frente)}">${ic(OR_AL[a.tipo] || 'alert')}<span><b>${esc(a.frente_nome)}</b><small>${esc(a.texto)}</small></span></a>`).join('')}${al.length > 20 ? `<small>+${al.length - 20} na tela de cada frente.</small>` : ''}</div>` : ''}
    <div class="exec-lista">${com.map(orCartao).join('')}</div>`}`));
  orLigar(D);
}
function orCartao(f) {
  const r = f.resumo, falta = obraInativa() ? [] : f.materiais.filter(m => m.situacao === 'comprar' || m.situacao === 'parcial');
  return `<a class="card etapa-card or-card" href="#/obra/frente/${enc(f.codigo)}">
    <div class="l1"><b>${esc(f.nome)}</b>${falta.length ? `<span class="badge fvb fvb-dev">${plural(falta.length, 'material a comprar', 'materiais a comprar')}</span>` : ''}<span class="dir">${pct(r.pct_exec)}</span></div>
    <small>${r.v_total ? 'Orçado ' + orM(r.v_total) + ' · ' : ''}${plural(r.servicos, 'serviço', 'serviços')}${r.mo_contratado ? ' · MO contratada ' + orM(r.mo_contratado) : ''}</small>
    ${orBar(r.pct_exec)}
    <div class="its">${f.itens.slice(0, 5).map(i => `<div class="it"><span class="n">${esc(i.servico)}</span>${orBar(i.pct_exec)}
      <small>${nf(i.executado)} / ${nf(i.qtd)} ${esc(i.unidade)} executado · ${i.a_distribuir < 0 ? `<b class="atrasado">${nf(-i.a_distribuir)} acima do orçado em frentes</b>` : nf(i.a_distribuir) + ' a distribuir'}</small></div>`).join('')}
      ${f.itens.length > 5 ? `<small>+${f.itens.length - 5} serviços</small>` : ''}</div>
    ${falta.length ? `<div class="or-falta">${falta.slice(0, 4).map(m => `<span>${ic('cart')} Falta comprar <b>${nf(m.falta_comprar)} ${esc(m.unidade)}</b> ${esc(m.descricao)}</span>`).join('')}</div>` : ''}</a>`;
}

/* ---------- frente geral: serviços e materiais ---------- */
async function vObraFrente(cod) {
  if (!orPode()) return orSemAcesso();
  const D = await carregarOrc(), f = orFrente(cod);
  if (!f) { location.hash = '#/obra'; return; }
  titulo(f.nome);
  const r = f.resumo, ger = orGere();
  const grupos = [], porG = {};
  f.itens.forEach(i => { const g = i.grupo || 'Serviços'; if (!porG[g]) { porG[g] = []; grupos.push(g); } porG[g].push(i); });
  view(comEtapas(orGrupos(D, f.codigo), `<a href="#/obra" class="linkbtn">${ic('back')} Painel da obra</a>${obraInativa() ? AVISO_INATIVA : ''}
    <div class="fv-hero fvs-exec"><div><span class="rel-sel">${ic('grid')} Frente geral · ${esc(f.codigo)}</span><h2>${esc(f.nome)}</h2><p>${esc(f.descricao || 'Tudo o que esta frente precisa executar, quanto já foi para frentes de execução, o executado e os materiais.')}</p></div>
      <div class="fv-hero-d"><b class="or-pct">${pct(r.pct_exec)}</b><small>executado${r.v_total ? ' (pelo valor)' : ''}</small></div></div>
    ${f.alertas.length ? `<div class="card"><h3>${ic('alert')} Atenção</h3>${f.alertas.map(a => `<div class="alerta or-al or-al-${a.tipo}">${ic(OR_AL[a.tipo] || 'alert')}<span><small>${esc(a.texto)}</small></span></div>`).join('')}</div>` : ''}
    <div class="ct-res or-res">
      <div class="card"><small>Orçado</small><b>${orM(r.v_total)}</b><small>material ${orM(r.v_material)} · MO ${orM(r.v_mo)}</small></div>
      <div class="card"><small>Executado</small><b>${orM(r.v_exec)}</b>${orBar(r.pct_exec)}<small>${pct(r.pct_exec)} do orçado</small></div>
      <div class="card"><small>Mão de obra contratada</small><b>${orM(r.mo_contratado)}</b><small>${r.mo_orcado_contratado ? (r.mo_contratado <= r.mo_orcado_contratado ? 'abaixo' : 'acima') + ' do orçado em ' + orM(Math.abs(r.mo_contratado - r.mo_orcado_contratado)) : 'nenhum contrato ligado ainda'}</small></div>
      <div class="card"><small>Material comprado</small><b>${orM(r.material_comprado)}</b><small>pedidos aprovados desta frente</small></div></div>
    <div class="card"><div class="or-h"><h3>Serviços do orçamento</h3>${ger ? `<span class="acoes"><button class="btn sec peq" id="orAdd">${ic('plus')} Incluir serviços</button><button class="btn sec peq" id="orColar">${ic('file')} Colar do Excel</button></span>` : ''}</div>
      ${f.itens.length ? `<div class="ct-rol"><table class="tab ct-tab or-tab"><thead><tr><th>Serviço</th><th>Un.</th><th class="n">Orçado</th><th class="n">Em frentes</th><th class="n">Executado</th><th class="n">A distribuir</th><th class="n">Contratado</th><th class="n">R$ material/un</th><th class="n">R$ MO/un</th><th class="n">R$ total</th></tr></thead><tbody>
      ${grupos.map(g => `${grupos.length > 1 || g !== 'Serviços' ? `<tr class="ct-g"><td colspan="10">${esc(g)}</td></tr>` : ''}${porG[g].map(i => `<tr class="${ger ? 'click' : ''} ${i.a_distribuir < -0.0001 || i.executado > i.qtd + 0.0001 ? 'ct-acima' : ''}" data-oi="${esc(i.id)}">
        <td>${i.codigo ? '<small>' + esc(i.codigo) + '</small> ' : ''}<b>${esc(i.servico)}</b><div class="ct-mini">${orBar(i.pct_exec)}<small>${pct(i.pct_exec)} executado · ${pct(i.pct_prog)} em frentes</small></div>
          ${i.frentes_exec.length ? `<small class="or-fx">${i.frentes_exec.map(x => `<a href="#/exec/etapa/${enc(x.etapa)}">${esc(x.nome)}</a> ${nf(x.executado)}/${nf(x.prevista)}`).join(' · ')}</small>` : ''}
          ${i.contratos.length ? `<small class="or-fx">${i.contratos.map(c => `Contrato ${esc(c.rotulo)} (${esc(c.empreiteiro)}): ${nf(c.qtd)} a ${orM(c.unitario)}`).join(' · ')}</small>` : ''}</td>
        <td>${esc(i.unidade)}</td><td class="n">${nf(i.qtd)}</td><td class="n">${nf(i.programado)}</td><td class="n">${nf(i.executado)}</td>
        <td class="n ${i.a_distribuir < 0 ? 'atrasado' : ''}">${nf(i.a_distribuir)}</td><td class="n">${nf(i.contratado)}</td>
        <td class="n">${orM(i.unit_material)}</td><td class="n">${orM(i.unit_mo)}</td><td class="n"><b>${orM(i.v_total)}</b></td></tr>`).join('')}`).join('')}
      </tbody></table></div>` : `<p class="vazio">Nenhum serviço nesta frente.${ger ? ' Toque em <b>Incluir serviços</b> (ex: 2.500 m de rede coletora) ou cole a planilha do Excel.' : ''}</p>`}
      <div class="acoes" style="margin-top:10px">${can('exec_planejar') && f.itens.length ? `<button class="btn sec" id="orExec">${ic('plus')} Abrir frente de execução</button>` : ''}${can('contrato_gerir') && f.itens.length ? `<a class="btn sec" href="#/ctr/novo?orc=${enc(f.codigo)}">${ic('file')} Contrato com estes serviços</a>` : ''}</div></div>
    <div class="card"><div class="or-h"><h3>Materiais</h3>${ger ? `<span class="acoes"><button class="btn sec peq" id="orMat">${ic('plus')} Incluir material</button></span>` : ''}</div>
      <small>Necessário = orçamento × composição (por serviço) ou quantidade direta da frente. Comprado = pedidos aprovados da frente; recebido = o que chegou para ela; consumido = executado × composição (diários) e saídas do estoque.</small>
      ${f.materiais.length ? `<div class="ct-rol"><table class="tab ct-tab or-tab"><thead><tr><th>Material</th><th>Un.</th><th class="n">Necessário</th><th class="n">Comprado</th><th class="n">Em compra</th><th class="n">Recebido</th><th class="n">Consumo (diários)</th><th class="n">Saídas</th><th class="n">Falta comprar</th><th></th></tr></thead><tbody>
      ${f.materiais.map(m => `<tr class="${ger && m.orcado ? 'click' : ''}" data-om="${esc(m.chave)}"><td><b>${esc(m.descricao)}</b><div class="ct-mini">${m.necessario ? orBar(m.pct_comprado, 'pg') : ''}<small>${m.composicao.map(c => c.orc_item ? `${nf(c.coef)} ${esc(m.unidade)}/${esc(c.unidade_srv)} em ${esc(c.servico)}` : `${nf(c.qtd)} ${esc(m.unidade)} direto na frente`).join(' · ') || 'comprado para a frente, sem previsão no orçamento'}</small></div></td>
        <td>${esc(m.unidade)}</td><td class="n">${nf(m.necessario)}</td><td class="n">${nf(m.comprado)}</td><td class="n">${nf(m.em_compra)}</td><td class="n">${nf(m.recebido)}</td>
        <td class="n">${m.consumo_teorico == null ? '—' : nf(m.consumo_teorico)}</td><td class="n">${nf(m.consumo_real)}</td><td class="n ${m.falta_comprar && !obraInativa() ? 'atrasado' : ''}"><b>${nf(m.falta_comprar)}</b></td><td>${obraInativa() ? '' : orSit(m.situacao)}</td></tr>`).join('')}
      </tbody></table></div>` : `<p class="vazio">Nenhum material.${ger ? ' Inclua o material de cada serviço (ex: tubo PVC 150, 1,05 m por metro de rede) ou direto na frente (ex: 420 anéis).' : ''}</p>`}</div>
    ${ger ? `<div class="acoes"><button class="btn sec" id="orEdF">${ic('edit')} Editar frente geral</button></div>` : ''}`));
  orLigar(D);
  const volta = () => vObraFrente(f.codigo);
  const b = (id, fn) => { const x = $('#' + id); if (x) x.onclick = fn; };
  b('orAdd', () => mOrItens(f, null, volta));
  b('orColar', () => mOrColar(f, volta));
  b('orMat', () => mOrMat(f, null, volta));
  b('orEdF', () => mOrFrente(f));
  b('orExec', async () => { await carregarExec(true); mEtapa(null, { frente: f.nome, orc_frente: f.codigo }); });
  if (ger) {
    $$('[data-oi]').forEach(tr => { tr.onclick = e => { if (!e.target.closest('a')) mOrItens(f, f.itens.find(i => i.id === tr.dataset.oi), volta); }; });
    $$('[data-om]').forEach(tr => { const m = f.materiais.find(x => x.chave === tr.dataset.om); if (m && m.orcado) tr.onclick = () => mOrMatLista(f, m, volta); });
  }
}

/* ---------- orçamento (quantidades) de todas as frentes ---------- */
async function vObraOrc() {
  titulo('Orçamento da obra');
  if (!orPode()) return orSemAcesso();
  const D = await carregarOrc(), ger = orGere(), fr = D.frentes.filter(f => f.ativa || f.itens.length);
  view(comEtapas(orGrupos(D, 'orc'), `<div class="cab"><h2>Orçamento · quantidades</h2><span class="contagem">${plural(D.resumo.servicos, 'serviço', 'serviços')} em ${plural(fr.length, 'frente geral', 'frentes gerais')}</span></div>
    <div class="aviso info">Cada <b>frente geral</b> (ex: Rede de Esgoto) tem o total que precisa executar. Ao abrir uma <b>frente de execução</b> (ex: 250 m na Rua das Flores) o saldo é consumido e o painel mostra o que falta distribuir, executar e comprar.</div>
    ${fr.map(f => `<div class="card"><div class="or-h"><h3><a href="#/obra/frente/${enc(f.codigo)}">${esc(f.nome)}</a> <small>${esc(f.codigo)}</small></h3>${ger ? `<span class="acoes"><button class="btn sec peq" data-add="${esc(f.codigo)}">${ic('plus')} Serviços</button><button class="btn sec peq" data-colar="${esc(f.codigo)}">${ic('file')} Colar</button></span>` : ''}</div>
      ${f.itens.length ? `<div class="ct-rol"><table class="tab or-tab or-mini"><thead><tr><th>Serviço</th><th>Un.</th><th class="n">Total</th><th class="n">Em frentes</th><th class="n">Executado</th><th class="n">A distribuir</th></tr></thead><tbody>
        ${f.itens.map(i => `<tr class="${ger ? 'click' : ''}" data-fr="${esc(f.codigo)}" data-oi="${esc(i.id)}"><td>${i.codigo ? '<small>' + esc(i.codigo) + '</small> ' : ''}${esc(i.servico)}${orBar(i.pct_exec)}</td><td>${esc(i.unidade)}</td><td class="n"><b>${nf(i.qtd)}</b></td><td class="n">${nf(i.programado)}</td><td class="n">${nf(i.executado)}</td><td class="n ${i.a_distribuir < 0 ? 'atrasado' : ''}">${nf(i.a_distribuir)}</td></tr>`).join('')}
      </tbody></table></div>` : '<small>Sem serviços ainda.</small>'}</div>`).join('') || '<div class="card vazio"><p>Nenhuma frente geral. Crie a primeira (ex: Rede de Esgoto).</p></div>'}
    ${ger ? `<div class="acoes"><button class="btn" id="orNovaF">${ic('plus')} Nova frente geral</button></div>` : ''}`));
  orLigar(D);
  const volta = () => vObraOrc();
  $$('[data-add]').forEach(x => { x.onclick = () => mOrItens(orFrente(x.dataset.add), null, volta); });
  $$('[data-colar]').forEach(x => { x.onclick = () => mOrColar(orFrente(x.dataset.colar), volta); });
  if (ger) $$('tr[data-oi]').forEach(tr => { tr.onclick = () => { const f = orFrente(tr.dataset.fr); mOrItens(f, f.itens.find(i => i.id === tr.dataset.oi), volta); }; });
  const n = $('#orNovaF'); if (n) n.onclick = () => mOrFrente();
}

/* ---------- valores (financeiro): R$ de material e de mão de obra por unidade ---------- */
async function vObraFin() {
  titulo('Orçamento · valores');
  if (!orPode()) return orSemAcesso();
  const D = await carregarOrc(), ger = orGere(), fr = D.frentes.filter(f => f.itens.length), R = D.resumo;
  view(comEtapas(orGrupos(D, 'fin'), `<div class="cab"><h2>Valores de referência</h2><span class="contagem">${esc(D.obra.nome)}</span></div>
    <div class="ct-tot"><span>Material <b>${orM(R.v_material)}</b></span><span>Mão de obra <b>${orM(R.v_mo)}</b></span><span>Total <b>${orM(R.v_total)}</b></span><span>MO contratada <b>${orM(R.mo_contratado)}</b></span><span>Material comprado <b>${orM(R.material_comprado)}</b></span></div>
    <small class="ct-dica">Preço por unidade do serviço. O valor de <b>mão de obra</b> já vem preenchido quando você monta o contrato do empreiteiro com estes serviços (pode ser mudado lá).</small>
    ${fr.map(f => `<form class="card or-fin" data-fr="${esc(f.codigo)}"><div class="or-h"><h3><a href="#/obra/frente/${enc(f.codigo)}">${esc(f.nome)}</a></h3><span class="or-ft"></span></div>
      <div class="ct-rol"><table class="tab or-tab"><thead><tr><th>Serviço</th><th>Un.</th><th class="n">Qtd</th><th class="n">R$ material/un</th><th class="n">R$ MO/un</th><th class="n">Material</th><th class="n">Mão de obra</th><th class="n">Total</th><th class="n">MO contratada</th></tr></thead><tbody>
      ${f.itens.map(i => `<tr data-oi="${esc(i.id)}"><td>${i.codigo ? '<small>' + esc(i.codigo) + '</small> ' : ''}${esc(i.servico)}</td><td>${esc(i.unidade)}</td><td class="n">${nf(i.qtd)}</td>
        <td class="n">${ger ? `<input name="um" inputmode="decimal" value="${esc(orV(i.unit_material))}" class="or-in">` : orM(i.unit_material)}</td>
        <td class="n">${ger ? `<input name="uo" inputmode="decimal" value="${esc(orV(i.unit_mo))}" class="or-in">` : orM(i.unit_mo)}</td>
        <td class="n" data-vm></td><td class="n" data-vo></td><td class="n"><b data-vt></b></td>
        <td class="n">${i.contratado ? `${orM(i.contratado_valor)}<br><small class="${i.dif_mo > 0 ? 'atrasado' : 'ct-ok'}">${i.dif_mo > 0 ? '+' : ''}${orM(i.dif_mo)} vs orçado</small>` : '—'}</td></tr>`).join('')}
      </tbody></table></div>${ger ? `<div class="acoes" style="margin-top:8px"><button class="btn">${ic('check')} Salvar valores de ${esc(f.nome)}</button></div>` : ''}</form>`).join('') || '<div class="card vazio"><p>Cadastre os serviços no <a href="#/obra/orcamento">orçamento</a> primeiro; aqui entram os valores.</p></div>'}`));
  orLigar(D);
  $$('form.or-fin').forEach(F => {
    const f = orFrente(F.dataset.fr);
    const calc = () => {
      let tm = 0, to = 0;
      $$('tr[data-oi]', F).forEach(tr => {
        const i = f.itens.find(x => x.id === tr.dataset.oi), um = ger ? orPn($('[name=um]', tr).value) : i.unit_material, uo = ger ? orPn($('[name=uo]', tr).value) : i.unit_mo;
        $('[data-vm]', tr).textContent = orM(i.qtd * um); $('[data-vo]', tr).textContent = orM(i.qtd * uo); $('[data-vt]', tr).textContent = orM(i.qtd * (um + uo));
        tm += i.qtd * um; to += i.qtd * uo;
      });
      $('.or-ft', F).innerHTML = `<small>material <b>${orM(tm)}</b> · MO <b>${orM(to)}</b> · total <b>${orM(tm + to)}</b></small>`;
    };
    $$('input', F).forEach(x => { x.oninput = calc; });
    calc();
    F.onsubmit = async ev => {
      ev.preventDefault();
      const bt = $('button', F); bt.disabled = true;
      try {
        const itens = $$('tr[data-oi]', F).map(tr => { const i = f.itens.find(x => x.id === tr.dataset.oi); return { id: i.id, codigo: i.codigo, grupo: i.grupo, servico: i.servico, servico_cod: i.servico_cod, unidade: i.unidade, qtd: i.qtd, obs: i.obs, unit_material: orPn($('[name=um]', tr).value), unit_mo: orPn($('[name=uo]', tr).value) }; });
        toast((await api('orc_itens_salvar', { frente: f.codigo, itens })).msg);
        await vObraFin();
      } catch (x) { toast(x.message, 1); bt.disabled = false; }
    };
  });
}

/* ---------- modais ---------- */
function mOrFrente(f) {
  modal(f ? 'Editar frente geral' : 'Nova frente geral', `<label>Nome<input name="nome" required value="${esc(f?.nome || '')}" placeholder="ex: Rede de Esgoto"></label>
    <label>Descrição <small>(opcional)</small><input name="descricao" value="${esc(f?.descricao || '')}" placeholder="ex: rede coletora, poços de visita e ligações"></label>
    ${f ? `<label class="ck"><input type="checkbox" name="ativa" ${f.ativa ? 'checked' : ''}> Ativa (aparece nos pedidos, no estoque e nas frentes de execução)</label><small>Trocar o nome atualiza os pedidos, o estoque e as frentes de execução desta frente.</small>` : '<small>A frente geral também aparece nos pedidos de material e nas saídas do estoque.</small>'}`, {
    ok: 'Salvar',
    onOk: async F => {
      const r = await api('orc_frente_salvar', { codigo: f?.codigo, nome: F.nome.value, descricao: F.descricao.value, ativa: f ? F.ativa.checked : undefined });
      toast(r.msg); await recarregarDados();
      const h = '#/obra/frente/' + enc(r.codigo);
      if (location.hash === h) rotear(); else location.hash = h;
    }
  });
}
/* incluir vários serviços (ou editar um) */
function mOrItens(f, item, depois, pre) {
  const cat = (OR.d.catalogo || []).slice().sort((a, b) => (a.grupo + a.servico).localeCompare(b.grupo + b.servico));
  const F = modal(item ? 'Editar serviço · ' + esc(f.nome) : 'Incluir serviços · ' + esc(f.nome), `
    <small>Quantidade <b>total</b> que a frente geral precisa executar e o preço de referência por unidade (material e mão de obra). Os valores podem ficar para depois, na tela <a href="#/obra/financeiro">Valores</a>.</small>
    <div id="orLin"></div>${item ? '' : `<button type="button" class="btn sec" id="orMais">${ic('plus')} Outro serviço</button>`}
    ${item ? `<label>Observação<input name="obs" value="${esc(item.obs || '')}"></label>
      ${item.programado || item.contratado ? `<div class="aviso info">Já tem ${nf(item.programado)} ${esc(item.unidade)} em frentes de execução${item.contratado ? ' e ' + nf(item.contratado) + ' contratados' : ''}: dá para mudar quantidade e valores, mas não remover.</div>` : '<label class="ck"><input type="checkbox" name="rem"> Remover este serviço do orçamento</label>'}` : ''}
    <datalist id="dl-orsrv">${cat.map(s => `<option value="${esc(s.servico)}">${esc(s.grupo)} · ${esc(s.unidade)}</option>`).join('')}</datalist>`, {
    larga: true, ok: item ? 'Salvar' : 'Incluir no orçamento',
    onOk: async F => {
      if (item && F.rem?.checked) { if (!confirm('Remover ' + item.servico + ' do orçamento?')) return; toast((await api('orc_item_remover', { id: item.id })).msg); return depois(); }
      const itens = $$('.or-li', F).map(r => ({ id: r.dataset.id || undefined, codigo: $('[name=c]', r).value, grupo: $('[name=g]', r).value, servico: $('[name=s]', r).value, servico_cod: r.dataset.cod || '', unidade: $('[name=u]', r).value, qtd: orPn($('[name=q]', r).value), unit_material: orPn($('[name=m]', r).value), unit_mo: orPn($('[name=o]', r).value), obs: F.obs ? F.obs.value : undefined }))
        .filter(x => x.servico || x.qtd);
      if (!itens.length) throw new Error('Informe pelo menos um serviço.');
      toast((await api('orc_itens_salvar', { frente: f.codigo, itens })).msg);
      await depois();
    }
  });
  const linha = i => {
    const r = document.createElement('div');
    r.className = 'or-li'; r.dataset.id = i?.id || ''; r.dataset.cod = i?.servico_cod || '';
    const ant = $$('.or-li', F).pop();
    r.innerHTML = `<label class="g">Grupo<input name="g" value="${esc(i ? i.grupo : ant ? $('[name=g]', ant).value : '')}" placeholder="ex: 1. Rede"></label>
      <label class="c">Item<input name="c" value="${esc(i?.codigo || '')}" placeholder="1.1"></label>
      <label class="s">Serviço<input name="s" list="dl-orsrv" value="${esc(i?.servico || '')}" placeholder="Digite ou busque no catálogo" autocomplete="off"></label>
      <label class="u">Un.<input name="u" value="${esc(i?.unidade || '')}" placeholder="m"></label>
      <label class="q">Qtd total<input name="q" inputmode="decimal" value="${esc(orV(i?.qtd))}" placeholder="2.500"></label>
      <label class="m">R$ material/un<input name="m" inputmode="decimal" value="${esc(orV(i?.unit_material))}"></label>
      <label class="o">R$ MO/un<input name="o" inputmode="decimal" value="${esc(orV(i?.unit_mo))}"></label>
      <span class="t"><small>Total</small><b>R$ 0,00</b></span>${item ? '' : `<button type="button" class="rm" aria-label="Remover linha">${ic('x')}</button>`}`;
    $('#orLin', F).appendChild(r);
    const s = $('[name=s]', r), u = $('[name=u]', r);
    s.onchange = () => { const c = cat.find(x => norm(x.servico) === norm(s.value)); r.dataset.cod = c ? c.codigo : ''; if (c && !u.value) u.value = c.unidade; if (c && !$('[name=g]', r).value) $('[name=g]', r).value = c.grupo; };
    const calc = () => { $('.t b', r).textContent = orM(orPn($('[name=q]', r).value) * (orPn($('[name=m]', r).value) + orPn($('[name=o]', r).value))); };
    ['q', 'm', 'o'].forEach(k => { $(`[name=${k}]`, r).oninput = calc; });
    calc();
    const rm = $('.rm', r); if (rm) rm.onclick = () => { if ($$('.or-li', F).length > 1) r.remove(); };
    return r;
  };
  if (item) linha(item); else (pre && pre.length ? pre : [null]).forEach(linha);
  const mais = $('#orMais', F); if (mais) mais.onclick = () => $('[name=s]', linha()).focus();
}
/* cola do Excel: item · descrição · unidade · quantidade · R$ material · R$ mão de obra (linhas só com texto viram grupo) */
function mOrColar(f, depois) {
  modal('Colar orçamento do Excel · ' + esc(f.nome), `<small>Copie as linhas da planilha e cole abaixo. Colunas: <b>item · descrição · unidade · quantidade · R$ material/un · R$ mão de obra/un</b> (os valores podem faltar). Linhas só com texto viram grupo.</small>
    <textarea name="t" rows="10" placeholder="1\tRede coletora\n1.1\tRede coletora PVC DN 150\tm\t2.500\t45,00\t18,00\n1.2\tPoço de visita\tun\t30\t1.200,00\t650,00"></textarea>`, {
    larga: true, ok: 'Conferir',
    onOk: F => {
      const its = orParseColar(F.t.value);
      if (!its.length) throw new Error('Não encontrei serviços no texto (preciso de unidade e quantidade em cada linha).');
      setTimeout(() => mOrItens(f, null, depois, its), 0);
    }
  });
}
function orParseColar(txt) {
  let grupo = ''; const itens = [];
  const UN = typeof CT_UN !== 'undefined' ? CT_UN : /^(m|m2|m²|m3|m³|ml|un|und|vb|kg|t|h|pç|cj|l)$/i;
  txt.split(/\r?\n/).forEach(lin => {
    const c = lin.split(/\t|;/).map(x => x.trim());
    if (!c.some(Boolean)) return;
    const iu = c.findIndex((x, k) => k >= 1 && UN.test(x));
    if (iu < 1 || !(orPn(c[iu + 1]) > 0)) { const t = c.filter(Boolean).join(' ').replace(/\s+\d[\d.,]*$/, '').trim(); if (t && !/^(item|descri|total|und)/i.test(t)) grupo = t; return; }
    const antes = c.slice(0, iu).filter(Boolean);
    let codigo = '', servico = '';
    if (antes.length >= 2) { codigo = antes[0]; servico = antes.slice(1).join(' '); }
    else { const mm = /^(\d+(?:\.\d+)*)\s*[-–.]?\s+(.+)$/.exec(antes[0] || ''); if (mm) { codigo = mm[1]; servico = mm[2]; } else servico = antes[0] || ''; }
    if (servico) itens.push({ grupo, codigo, servico, unidade: c[iu], qtd: orPn(c[iu + 1]), unit_material: orPn(c[iu + 2]), unit_mo: orPn(c[iu + 3]) });
  });
  return itens;
}
/* material: na composição de um serviço (coeficiente) ou direto na frente (quantidade total) */
function mOrMat(f, m, depois, preItem) {
  const mats = (OR.d.materiais_cad || []).slice().sort((a, b) => a.descricao.localeCompare(b.descricao));
  const direto = m ? !m.orc_item : !f.itens.length;
  const F = modal(m ? 'Editar material' : 'Incluir material · ' + esc(f.nome), `
    <label>Material<input name="mat" list="dl-ormat" required value="${esc(m?.descricao || '')}" placeholder="Digite para buscar no cadastro de materiais" autocomplete="off"></label>
    <div class="g2"><label>Unidade<input name="un" value="${esc(m?.unidade || '')}" placeholder="m"></label>
      <label>Como entra<select name="tipo"><option value="srv" ${!direto ? 'selected' : ''} ${f.itens.length ? '' : 'disabled'}>Por serviço (composição)</option><option value="dir" ${direto ? 'selected' : ''}>Direto na frente (quantidade total)</option></select></label></div>
    <div id="orSrv"><label>Serviço<select name="srv">${f.itens.map(i => `<option value="${esc(i.id)}" ${(m?.orc_item || preItem) === i.id ? 'selected' : ''}>${esc(i.servico)} · ${nf(i.qtd)} ${esc(i.unidade)}</option>`).join('')}</select></label>
      <label>Quanto gasta por unidade do serviço <small>(já com a perda: ex 1,05 = 5%)</small><input name="coef" inputmode="decimal" value="${esc(orV(m?.coef))}"></label></div>
    <div id="orDir"><label>Quantidade total para a frente<input name="qtd" inputmode="decimal" value="${esc(orV(m?.qtd))}"></label></div>
    <label>Observação <small>(opcional)</small><input name="obs" value="${esc(m?.obs || '')}"></label>
    <div class="aviso info" id="orPrev"></div>
    <small>Fora do cadastro? Cadastre em <a href="#/cad/materiais">Materiais</a> para os pedidos casarem com o orçamento (o vínculo é pelo material do cadastro).</small>
    <datalist id="dl-ormat">${mats.map(x => `<option value="${esc(x.descricao)}">${esc(x.unidade || '')}${x.categoria ? ' · ' + esc(x.categoria) : ''}</option>`).join('')}</datalist>`, {
    ok: 'Salvar',
    onOk: async F => {
      const cad = mats.find(x => norm(x.descricao) === norm(F.mat.value)), srv = F.tipo.value === 'srv';
      const r = await api('orc_material_salvar', { id: m?.id, frente: f.codigo, orc_item: srv ? F.srv.value : '', material_cod: cad ? cad.codigo : '', descricao: F.mat.value, unidade: F.un.value, coef: srv ? orPn(F.coef.value) : '', qtd: srv ? '' : orPn(F.qtd.value), obs: F.obs.value });
      toast(r.msg); await depois();
    }
  });
  const prev = () => {
    const srv = F.tipo.value === 'srv', i = f.itens.find(x => x.id === F.srv.value);
    $('#orSrv', F).hidden = !srv; $('#orDir', F).hidden = srv;
    const un = F.un.value || 'un';
    $('#orPrev', F).innerHTML = srv ? (i ? `Necessário: <b>${nf(i.qtd * orPn(F.coef.value))} ${esc(un)}</b> para ${nf(i.qtd)} ${esc(i.unidade)} de ${esc(i.servico)}. O consumo é calculado pelo executado nos diários.` : '') : `Necessário: <b>${nf(orPn(F.qtd.value))} ${esc(un)}</b> para a frente.`;
  };
  F.mat.onchange = () => { const c = mats.find(x => norm(x.descricao) === norm(F.mat.value)); if (c && c.unidade) F.un.value = c.unidade; prev(); };
  [F.tipo, F.srv, F.coef, F.qtd, F.un].forEach(x => { x.oninput = prev; x.onchange = prev; });
  prev();
}
/* um material do orçamento pode estar em vários serviços: lista as entradas para editar ou remover */
function mOrMatLista(f, m, depois) {
  modal(esc(m.descricao), `<div class="aviso info">Necessário <b>${nf(m.necessario)} ${esc(m.unidade)}</b> · comprado ${nf(m.comprado)} · em compra ${nf(m.em_compra)} · recebido ${nf(m.recebido)}${m.falta_comprar ? ` · <b>falta comprar ${nf(m.falta_comprar)}</b>` : ''}</div>
    ${m.composicao.map(c => `<div class="or-comp"><span>${c.orc_item ? `<b>${esc(c.servico)}</b><small>${nf(c.coef)} ${esc(m.unidade)} por ${esc(c.unidade_srv)} → ${nf(c.necessario)} ${esc(m.unidade)}</small>` : `<b>Direto na frente</b><small>${nf(c.qtd)} ${esc(m.unidade)}</small>`}${c.obs ? `<small>${esc(c.obs)}</small>` : ''}</span>
      <button type="button" class="btn sec peq" data-ed="${esc(c.id)}">${ic('edit')}</button><button type="button" class="btn sec peq" data-rm="${esc(c.id)}" aria-label="Remover">${ic('x')}</button></div>`).join('')}
    <div class="acoes" style="margin-top:8px"><button type="button" class="btn sec" id="orMaisComp">${ic('plus')} Este material em outro serviço</button></div>`, { semRodape: true, larga: true });
  const ent = id => { const c = m.composicao.find(x => x.id === id); return { id: c.id, orc_item: c.orc_item, coef: c.coef, qtd: c.qtd, obs: c.obs, descricao: m.descricao, unidade: m.unidade }; };
  $$('[data-ed]').forEach(b => { b.onclick = () => { fecharModal(); mOrMat(f, ent(b.dataset.ed), depois); }; });
  $$('[data-rm]').forEach(b => { b.onclick = async () => { if (!confirm('Tirar esta entrada do orçamento?')) return; try { toast((await api('orc_material_remover', { id: b.dataset.rm })).msg); fecharModal(); await depois(); } catch (x) { toast(x.message, 1); } }; });
  $('#orMaisComp').onclick = () => { fecharModal(); mOrMat(f, null, depois); setTimeout(() => { const F = $('#modal form'); if (F) { F.mat.value = m.descricao; F.un.value = m.unidade; F.mat.onchange(); } }, 0); };
}

/* ---------- rotas ---------- */
ROTAS.push([/^#\/obra$/, vObra], [/^#\/obra\/orcamento$/, vObraOrc], [/^#\/obra\/financeiro$/, vObraFin], [/^#\/obra\/frente\/(FR\w+)$/, vObraFrente]);
