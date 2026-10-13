'use strict';
/* =====================================================================
 * CONTRATOS de empreiteiros: cadastro com planilha de serviços, ativação, aditivos, contrato assinado no Drive,
 * minuta em PDF (ctr-doc.js) e o acompanhamento contratado × executado × medido × pago.
 * A frente de trabalho (exec.js) escolhe um contrato vigente do empreiteiro e seus serviços nascem da planilha.
 * Usa app.js (api, modal, view, comEtapas…), exec.js (EX, mEtapa, pct…) e relatorio.js (baixarBlob).
 * ===================================================================== */
const CT = { L: null, filtro: 'vig', det: null };
const CT_ST = { 'Rascunho': 'exec', 'Vigente': 'ok', 'Encerrado': 'canc', 'Rescindido': 'dev', 'Cancelado': 'canc' };
const ctBadge = s => `<span class="badge fvb fvb-${CT_ST[s] || 'exec'}">${esc(s)}</span>`;
const ctPode = () => can(['contrato_ver', 'contrato_gerir']);
const ctBar = (p, cl) => `<div class="ct-bar ${cl || ''}"><i style="width:${Math.min(100, Math.max(0, Number(p) || 0))}%"></i></div>`;
const ctM = v => brl(Number(v) || 0);
const ctV = v => (v === '' || v == null ? '' : String(v).replace('.', ','));
/* número digitado como na planilha: "1.234,56", "49,60" ou "49.6" */
function ctPn(v) {
  if (typeof v === 'number') return v;
  let s = String(v == null ? '' : v).trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

/* ---------- lista ---------- */
async function vCtr() {
  titulo('Contratos');
  if (!ctPode()) return view('<div class="card vazio"><p>Você não tem acesso aos contratos desta obra.</p></div>');
  const L = await api('contratos');
  CT.L = L;
  const F = {
    vig: ['Vigentes', 'check', c => c.status === 'Vigente'],
    rasc: ['Rascunhos', 'edit', c => c.status === 'Rascunho'],
    enc: ['Encerrados', 'clock', c => c.status === 'Encerrado' || c.status === 'Rescindido'],
    todos: ['Todos', 'layers', c => c.status !== 'Cancelado']
  };
  if (!CT.visto) { CT.visto = true; if (!L.contratos.some(F.vig[2]) && L.contratos.length) CT.filtro = 'todos'; }   // sem contrato vigente, abre em "Todos"
  const grupos = [{ t: 'Situação', itens: Object.entries(F).map(([k, v]) => ({ k, t: v[0], i: v[1], n: L.contratos.filter(v[2]).length, on: k === CT.filtro })) }];
  const acoes = [];
  if (L.pode_gerir) acoes.push({ k: 'a:novo', t: 'Novo contrato', i: 'plus', cl: 'acao' });
  acoes.push({ k: 'a:emp', t: 'Empreiteiros', i: 'users', cl: 'acao' }, { k: 'a:med', t: 'Medições', i: 'sliders2', cl: 'acao' });
  grupos.push({ t: 'Ações', itens: acoes });
  const lista = L.contratos.filter(F[CT.filtro][2]);
  const tot = lista.reduce((t, c) => ({ v: t.v + c.resumo.contratado, m: t.m + c.resumo.medido, p: t.p + c.resumo.pago }), { v: 0, m: 0, p: 0 });
  view(comEtapas(grupos, `<div class="cab"><h2>${F[CT.filtro][0]}</h2><span class="contagem">${esc(S.dados.obra.nome)}</span></div>
    ${lista.length ? `<div class="ct-tot"><span>Contratado <b>${ctM(tot.v)}</b></span><span>Medido <b>${ctM(tot.m)}</b></span><span>Pago <b>${ctM(tot.p)}</b></span></div>` : ''}
    <div class="fv-lista">${lista.map(ctCartao).join('') || `<div class="card vazio"><p>Nenhum contrato nesta visão.${L.pode_gerir ? ' Toque em <b>Novo contrato</b> para cadastrar o primeiro (empreiteiro, planilha de serviços e condições).' : ''}</p></div>`}</div>`));
  ligarEtapas(k => {
    if (k === 'a:novo') { location.hash = '#/ctr/novo'; return; }
    if (k === 'a:emp') { location.hash = '#/med/empreiteiros'; return; }
    if (k === 'a:med') { location.hash = '#/med'; return; }
    CT.filtro = k; vCtr();
  });
}
function ctCartao(c) {
  const r = c.resumo;
  return `<a class="card fv-card fvs-${CT_ST[c.status] || 'exec'}" href="#/ctr/${esc(c.id)}">
    <div class="fv-l1"><span class="fv-num">${esc(c.rotulo)}</span>${ctBadge(c.status)}</div>
    <b class="fv-serv">${esc(c.empreiteiro_nome)}</b>
    <small>${esc(c.objeto.length > 110 ? c.objeto.slice(0, 107) + '…' : c.objeto)}</small>
    <div class="ct-val"><b>${ctM(r.contratado)}</b><small>${plural(c.itens, 'serviço', 'serviços')}${c.vigencia_fim ? ' · até ' + fd(c.vigencia_fim) : ''}</small></div>
    <div class="ct-tres"><span>Executado <b>${pct(r.pct_exec)}</b>${ctBar(r.pct_exec)}</span><span>Medido <b>${pct(r.pct_med)}</b>${ctBar(r.pct_med, 'med')}</span><span>Pago <b>${pct(r.pct_pago)}</b>${ctBar(r.pct_pago, 'pg')}</span></div></a>`;
}

/* ---------- cadastro / edição ---------- */
const CT_TXT = (n, r, v, o = {}) => `<label class="${o.cl || ''}">${r}${o.dica ? ` <small>${o.dica}</small>` : ''}${o.area ? `<textarea name="${n}" rows="${o.area}" placeholder="${esc(o.ph || '')}">${esc(v ?? '')}</textarea>` : `<input name="${n}" type="${o.t || 'text'}" ${o.t === 'number' ? 'step="any" min="0" inputmode="decimal"' : ''} value="${esc(v ?? '')}" placeholder="${esc(o.ph || '')}" ${o.req ? 'required' : ''} ${o.list ? `list="${o.list}"` : ''}>`}</label>`;
async function vCtrNovo() { await ctForm(''); }
async function vCtrEditar(id) { await ctForm(id); }
async function ctForm(id) {
  titulo(id ? 'Editar contrato' : 'Novo contrato');
  if (!can('contrato_gerir')) return view('<div class="card vazio"><p>Só quem tem permissão de gerir contratos cadastra ou edita um contrato.</p></div>');
  const L = await api('contratos');
  CT.L = L;
  let d = null;
  if (id) { d = await api('contrato_detalhe', { id }); if (!d.editavel) { location.hash = '#/ctr/' + id; return; } }
  if (!L.empreiteiros.length) return view('<div class="aviso info">Cadastre o empreiteiro em <a href="#/med/empreiteiros">Empreiteiros</a> primeiro.</div>');
  let cat = [];
  try { cat = (await carregarExec()).catalogo || []; } catch (e) { /* sem acesso à execução: segue sem sugestões de serviço */ }
  const m = d || Object.assign({}, L.modelo, { vigencia_ini: hoje() });
  const empSel = d ? d.empreiteiro : (new URLSearchParams(location.hash.split('?')[1] || '').get('emp') || '');
  view(`<a href="${id ? '#/ctr/' + esc(id) : '#/ctr'}" class="linkbtn">${ic('back')} ${id ? 'Contrato' : 'Contratos'}</a>
    <div class="fv-hero fvs-exec"><div><span class="rel-sel">${ic('file')} Contrato de empreiteiro</span><h2>${id ? 'Editar contrato ' + esc(d.rotulo) : 'Novo contrato'}</h2><p>Monte o contrato com a planilha de serviços. Depois de ativar, ele aparece ao abrir a frente de trabalho do empreiteiro e dá para baixar a minuta em PDF.</p></div></div>
    <form id="ctF" class="ct-form" autocomplete="off">
    <section class="card rel-sec"><div class="rel-h"><b>1</b><div><h3>Partes</h3><small>Quem contrata e quem executa</small></div></div>
      <div class="g2"><label>Empreiteiro (contratado)<select name="empreiteiro" required><option value="">— escolha —</option>${L.empreiteiros.map(e => `<option value="${esc(e.codigo)}" ${(m.empreiteiro || empSel) === e.codigo ? 'selected' : ''}>${esc(e.empresa ? e.empresa + ' · ' + e.nome : e.nome)}</option>`).join('')}</select><small>CNPJ e endereço vêm do cadastro do empreiteiro (<a href="#/med/empreiteiros">editar</a>).</small></label>
        <div class="ct-num"><small>Nº do contrato</small><b>${d ? esc(d.rotulo) : 'automático'}</b><small>${d ? 'numeração automática desta obra' : 'o próximo número da obra (01, 02, 03…) é dado ao salvar'}</small></div></div>
      <div class="g2">${CT_TXT('contratante_nome', 'Contratante', m.contratante_nome, { ph: 'ex: SPE Prime Beach Curumim Ltda', req: true })}${CT_TXT('contratante_doc', 'CNPJ do contratante', m.contratante_doc)}</div>
      ${CT_TXT('contratante_end', 'Endereço do contratante', m.contratante_end, { ph: 'rua, nº, bairro, cidade/UF, CEP' })}
      ${CT_TXT('administradora', 'Administradora da obra', m.administradora, { area: 2, dica: '(representa a contratante perante o contratado; deixe em branco se não houver)' })}</section>
    <section class="card rel-sec"><div class="rel-h"><b>2</b><div><h3>Objeto, local e prazo</h3></div></div>
      ${CT_TXT('objeto', 'Objeto do contrato', m.objeto, { area: 2, ph: 'ex: mão de obra para assentamento de rede de água (PEAD) no empreendimento', req: true })}
      ${CT_TXT('escopo', 'Frentes, trechos ou observações do escopo', m.escopo, { area: 2, dica: '(opcional)', ph: 'ex: considera apenas a planilha referente a esta obra' })}
      <div class="g2">${CT_TXT('data_assinatura', 'Data da assinatura', m.data_assinatura, { t: 'date' })}${CT_TXT('local_assinatura', 'Local da assinatura', m.local_assinatura)}</div>
      <div class="g2">${CT_TXT('vigencia_ini', 'Início da vigência', m.vigencia_ini, { t: 'date', req: true })}${CT_TXT('vigencia_fim', 'Fim da vigência', m.vigencia_fim, { t: 'date' })}</div>
      ${CT_TXT('prazo_txt', 'Prazo estimado de execução', m.prazo_txt, { ph: 'ex: 4 meses, possivelmente de setembro a dezembro de 2026', dica: '(texto do contrato)' })}</section>
    <section class="card rel-sec"><div class="rel-h"><b>3</b><div><h3>Planilha de serviços</h3><small>Etapa/grupo, serviço, unidade, quantidade e preço unitário</small></div></div>
      <div id="ctLin"></div>
      <div class="ct-bt"><button type="button" class="btn sec" id="ctAdd">${ic('plus')} Serviço</button><button type="button" class="btn sec" id="ctColar">${ic('file')} Colar do Excel</button></div>
      <div class="ct-soma" id="ctSoma"></div>
      <div class="g2">${CT_TXT('valor_global', 'Valor global do contrato (R$)', ctV(m.valor_global), { dica: '(preço global; se vazio vale a soma da planilha)', ph: 'ex: 590.738,48' })}<div id="ctDif" class="ct-dif"></div></div></section>
    <section class="card rel-sec"><div class="rel-h"><b>4</b><div><h3>Pagamento e medição</h3></div></div>
      <div class="g2"><label>Forma<select name="pag_forma">${['Por medição', 'Valor fixo / parcelas', 'Misto (medição + permuta)'].map(x => `<option ${m.pag_forma === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label>Medições<select name="pag_periodicidade">${['Semanal', 'Quinzenal', 'Mensal', 'Por tarefa concluída'].map(x => `<option ${m.pag_periodicidade === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
      ${CT_TXT('pag_obs', 'Condições de pagamento', m.pag_obs, { area: 2, ph: 'ex: PIX à vista após a medição aprovada · ou: 12 parcelas mensais vencendo dia 15 do mês seguinte' })}
      <div class="g2">${CT_TXT('permuta_valor', 'Parte paga em permuta (R$)', ctV(m.permuta_valor), { dica: '(opcional)' })}${CT_TXT('permuta_desc', 'Como a permuta é paga', m.permuta_desc, { ph: 'ex: entrega de lotes e/ou veículos, definidos em aditivo' })}</div>
      <div class="g2">${CT_TXT('fat_nf_pct', 'Faturamento em Nota Fiscal (%)', m.fat_nf_pct, { t: 'number', dica: '(opcional)' })}${CT_TXT('fat_recibo_pct', 'Faturamento em Recibo (%)', m.fat_recibo_pct, { t: 'number', dica: '(opcional)' })}</div>
      ${CT_TXT('retencoes', 'Retenções', m.retencoes, { area: 2 })}${CT_TXT('reajuste', 'Reajuste', m.reajuste, { area: 2 })}</section>
    <section class="card rel-sec"><div class="rel-h"><b>5</b><div><h3>Penalidades, garantia e foro</h3></div></div>
      <div class="g2">${CT_TXT('multa1_pct', 'Multa por descumprimento do objeto (%)', m.multa1_pct, { t: 'number' })}${CT_TXT('multa2_pct', 'Multa por outras cláusulas (%)', m.multa2_pct, { t: 'number' })}</div>
      <div class="g2">${CT_TXT('multa_diaria', 'Multa diária (R$)', m.multa_diaria, { t: 'number' })}${CT_TXT('aviso_dias', 'Aviso prévio para rescisão sem justa causa (dias)', m.aviso_dias, { t: 'number' })}</div>
      ${CT_TXT('garantia', 'Garantia dos serviços', m.garantia, { area: 3 })}${CT_TXT('foro', 'Foro', m.foro)}</section>
    <section class="card rel-sec"><div class="rel-h"><b>6</b><div><h3>Cláusulas adicionais e observações</h3></div></div>
      ${CT_TXT('clausulas_extra', 'Cláusulas adicionais (entram no fim das cláusulas gerais da minuta)', m.clausulas_extra, { area: 4, dica: '(opcional)', ph: 'ex: o valor do combustível poderá ser reajustado na mesma proporção…' })}
      ${CT_TXT('obs', 'Observações internas', m.obs, { area: 2, dica: '(não saem na minuta)' })}</section>
    <div class="rel-acoes" style="grid-template-columns:1fr 1fr"><button type="button" class="btn sec" id="ctCancel">Cancelar</button><button class="btn" id="ctSalvar">${ic('check')} ${id ? 'Salvar' : 'Salvar rascunho'}</button></div></form>
    <datalist id="dl-ctsrv">${cat.map(s => `<option value="${esc(s.servico)}">${esc(s.grupo)} · ${esc(s.unidade)}</option>`).join('')}</datalist><datalist id="dl-ctg"></datalist>`);
  const F = $('#ctF');
  (d ? d.itens : []).forEach(i => ctLinha(F, cat, i));
  if (!d) ctLinha(F, cat);
  ctSoma(F);
  $('#ctAdd').onclick = () => ctLinha(F, cat).querySelector('[name=s]').focus();
  $('#ctColar').onclick = () => ctColar(F, cat);
  F.valor_global.oninput = () => ctSoma(F);
  $('#ctCancel').onclick = () => { location.hash = id ? '#/ctr/' + id : '#/ctr'; };
  F.onsubmit = async ev => {
    ev.preventDefault();
    const dados = ctColher(F);
    if (d && d.status === 'Vigente') {
      modal('Alterar contrato vigente', '<label>Motivo da alteração <small>(fica registrado no histórico)</small><textarea name="motivo" required minlength="5" rows="3" placeholder="ex: aditivo nº 1 · correção de quantidade"></textarea></label>', {
        ok: 'Salvar alteração', onOk: async f => { const r = await api('contrato_salvar', Object.assign({ id: d.id, motivo: f.motivo.value }, dados)); toast(r.msg); location.hash = '#/ctr/' + r.id; }
      });
      return;
    }
    const b = $('#ctSalvar'); b.disabled = true;
    try { const r = await api('contrato_salvar', Object.assign({ id: id || undefined }, dados)); toast(r.msg); location.hash = '#/ctr/' + r.id; }
    catch (x) { toast(x.message, 1); b.disabled = false; }
  };
}
function ctColher(F) {
  const o = {};
  ['empreiteiro', 'contratante_nome', 'contratante_doc', 'contratante_end', 'administradora', 'objeto', 'escopo', 'data_assinatura', 'local_assinatura', 'vigencia_ini', 'vigencia_fim', 'prazo_txt',
    'pag_forma', 'pag_periodicidade', 'pag_obs', 'permuta_desc', 'retencoes', 'reajuste', 'garantia', 'foro', 'clausulas_extra', 'obs'].forEach(k => { o[k] = F.elements[k].value; });
  ['valor_global', 'permuta_valor', 'fat_nf_pct', 'fat_recibo_pct', 'multa1_pct', 'multa2_pct', 'multa_diaria', 'aviso_dias'].forEach(k => { const v = F.elements[k].value.trim(); o[k] = v === '' ? '' : ctPn(v); });
  o.itens = $$('.ct-li', F).map(r => ({ id: r.dataset.id || undefined, grupo: $('[name=g]', r).value, codigo: $('[name=c]', r).value, servico: $('[name=s]', r).value, servico_cod: r.dataset.cod || '', unidade: $('[name=u]', r).value, qtd: ctPn($('[name=q]', r).value), unitario: ctPn($('[name=p]', r).value) }))
    .filter(x => x.servico || x.qtd || x.id);
  return o;
}
/* uma linha da planilha */
function ctLinha(F, cat, i) {
  const r = document.createElement('div');
  r.className = 'ct-li'; r.dataset.id = i && i.id ? i.id : ''; r.dataset.cod = (i && i.servico_cod) || '';
  const ant = $$('.ct-li', F).pop();
  r.innerHTML = `<label class="g">Etapa / grupo<input name="g" list="dl-ctg" value="${esc(i ? i.grupo : ant ? $('[name=g]', ant).value : '')}" placeholder="ex: 1.1 Rede de Água"></label>
    <label class="c">Item<input name="c" value="${esc(i ? i.codigo : '')}" placeholder="1.1.2"></label>
    <label class="s">Serviço<input name="s" list="dl-ctsrv" value="${esc(i ? i.servico : '')}" placeholder="Digite ou busque no catálogo"></label>
    <label class="u">Unid.<input name="u" value="${esc(i ? i.unidade : '')}" placeholder="M/L"></label>
    <label class="q">Quantidade<input name="q" inputmode="decimal" value="${i ? esc(String(i.qtd).replace('.', ',')) : ''}"></label>
    <label class="p">Unitário (R$)<input name="p" inputmode="decimal" value="${i ? esc(String(i.unitario).replace('.', ',')) : ''}"></label>
    <span class="t"><small>Total</small><b>R$ 0,00</b></span><button type="button" class="rm" aria-label="Remover linha">${ic('x')}</button>`;
  $('#ctLin').appendChild(r);
  const s = $('[name=s]', r), u = $('[name=u]', r);
  s.onchange = () => { const c = cat.find(x => norm(x.servico) === norm(s.value)); r.dataset.cod = c ? c.codigo : ''; if (c && !u.value) u.value = c.unidade; };
  const calc = () => { $('.t b', r).textContent = ctM(ctPn($('[name=q]', r).value) * ctPn($('[name=p]', r).value)); ctSoma(F); };
  $('[name=q]', r).oninput = calc; $('[name=p]', r).oninput = calc; calc();
  $('[name=g]', r).onchange = () => ctGrupos(F);
  $('.rm', r).onclick = () => { r.remove(); ctSoma(F); };
  ctGrupos(F);
  return r;
}
function ctGrupos(F) { const dl = $('#dl-ctg'); if (dl) dl.innerHTML = [...new Set($$('.ct-li [name=g]', F).map(x => x.value.trim()).filter(Boolean))].map(g => `<option value="${esc(g)}">`).join(''); }
function ctSoma(F) {
  const soma = $$('.ct-li', F).reduce((t, r) => t + ctPn($('[name=q]', r).value) * ctPn($('[name=p]', r).value), 0), g = ctPn(F.valor_global.value);
  $('#ctSoma').innerHTML = `<span>${plural($$('.ct-li', F).filter(r => $('[name=s]', r).value).length, 'serviço', 'serviços')}</span><span>Soma da planilha <b>${ctM(soma)}</b></span>`;
  const dif = g > 0 ? Math.round((g - soma) * 100) / 100 : 0;
  $('#ctDif').innerHTML = g > 0 ? (Math.abs(dif) < 0.005 ? `<small class="ct-ok">${ic('check')} O valor global confere com a planilha.</small>` : `<small class="ct-av">Diferença de <b>${ctM(dif)}</b> entre o valor global e a soma da planilha (arredondamentos de preço unitário são comuns; o contrato vale pelo preço global).</small>`) : '<small>Sem valor global: vale a soma da planilha.</small>';
}
/* cola linhas copiadas do Excel/Word: item | descrição | un | qtd | unitário | total (linhas sem unidade e quantidade viram o nome do grupo) */
function ctColar(F, cat) {
  modal('Colar planilha do Excel', `<small>Copie as linhas da planilha (Excel, Word ou Google Planilhas) e cole abaixo. Colunas: <b>item · descrição · unidade · quantidade · unitário</b>. Linhas só com texto viram grupo/etapa.</small>
    <textarea name="t" rows="10" placeholder="1.1\tRede de Água\n1.1.2\tAssentamento de Tubo PEAD DN 63mm\tM/L\t8.350,00\t49,60"></textarea><div id="ctPrev"></div>`, {
    larga: true, ok: 'Incluir na planilha',
    onOk: f => {
      const itens = ctParseColar(f.t.value);
      if (!itens.length) throw new Error('Não encontrei serviços no texto colado (preciso de unidade e quantidade em cada linha).');
      const vazia = $$('.ct-li', F).filter(r => !$('[name=s]', r).value && !$('[name=q]', r).value);
      vazia.forEach(r => r.remove());
      itens.forEach(i => { const r = ctLinha(F, cat, Object.assign({ id: '', servico_cod: '' }, i)); const c = cat.find(x => norm(x.servico) === norm(i.servico)); if (c) r.dataset.cod = c.codigo; });
      ctSoma(F); toast(plural(itens.length, 'serviço incluído', 'serviços incluídos') + '. Confira os valores antes de salvar.');
    }
  });
}
const CT_UN = /^(m|m2|m²|m3|m³|ml|m\/l|un|und|unid|vb|kg|t|h|dia|dias|pç|pc|cj|l|gl|mês|mes|verba)$/i;
function ctParseColar(txt) {
  let grupo = ''; const itens = [];
  txt.split(/\r?\n/).forEach(lin => {
    const c = lin.split(/\t|;/).map(x => x.trim());
    if (!c.some(Boolean)) return;
    const iu = c.findIndex((x, k) => k >= 1 && CT_UN.test(x));
    if (iu < 1 || !(ctPn(c[iu + 1]) > 0)) {                       // sem unidade/quantidade: é título de grupo
      const t = c.filter(Boolean).join(' ').replace(/\s+\d[\d.,]*$/, '').trim();
      if (t && !/^(item|descri|total|und)/i.test(t)) grupo = t;
      return;
    }
    const antes = c.slice(0, iu).filter(Boolean);
    let codigo = '', servico = '';
    if (antes.length >= 2) { codigo = antes[0]; servico = antes.slice(1).join(' '); }
    else { const mm = /^(\d+(?:\.\d+)*)\s*[-–.]?\s+(.+)$/.exec(antes[0] || ''); if (mm) { codigo = mm[1]; servico = mm[2]; } else servico = antes[0] || ''; }
    if (!servico) return;
    itens.push({ grupo, codigo, servico: servico.replace(/^[-–]\s*/, ''), unidade: c[iu].toUpperCase().replace('ML', 'M/L'), qtd: ctPn(c[iu + 1]), unitario: ctPn(c[iu + 2]) });
  });
  return itens;
}

/* ---------- detalhe ---------- */
async function vCtrDet(id) {
  const d = await api('contrato_detalhe', { id });
  CT.det = d;
  titulo('Contrato ' + d.rotulo);
  const r = d.resumo, grupos = [], porG = {};
  d.itens.forEach(i => { const g = i.grupo || 'Serviços'; if (!porG[g]) { porG[g] = []; grupos.push(g); } porG[g].push(i); });
  const acima = d.itens.filter(i => i.acima);
  view(`<a href="#/ctr" class="linkbtn">${ic('back')} Contratos</a>
    <div class="fv-hero fvs-${CT_ST[d.status] || 'exec'}"><div><span class="rel-sel">${ic('file')} Contrato de empreiteiro</span><h2>${esc(d.rotulo)} · ${esc(d.emp.empresa || d.emp.nome)}</h2><p>${esc(d.objeto)}</p></div>
      <div class="fv-hero-d">${ctBadge(d.status)}<small>${d.vigencia_ini ? 'vigência ' + fd(d.vigencia_ini) + (d.vigencia_fim ? ' a ' + fd(d.vigencia_fim) : '') : ''}</small></div></div>
    ${d.status === 'Rascunho' ? '<div class="aviso info">Este contrato é um <b>rascunho</b>: ainda não aparece nas frentes de trabalho. Confira a planilha e toque em <b>Ativar contrato</b>.</div>' : ''}
    ${acima.length ? `<div class="aviso warn"><b>Acima do contratado:</b> ${acima.map(i => `${esc(i.servico)} (${nf(i.executado)} de ${nf(i.qtd)} ${esc(i.unidade)})`).join('; ')}. Se foi serviço autorizado, registre um aditivo.</div>` : ''}
    ${d.sem_vinculo.length ? `<div class="aviso info">Serviços de frentes deste contrato que <b>não estão na planilha</b>: ${d.sem_vinculo.map(i => esc(i.servico + ' (' + i.etapa_nome + ')')).join('; ')}.</div>` : ''}
    <div class="ct-res">
      <div class="card"><small>Contratado</small><b>${ctM(r.contratado)}</b>${r.aditivos ? `<small>inclui aditivos ${ctM(r.aditivos)}</small>` : ''}</div>
      <div class="card"><small>Executado (diários)</small><b>${ctM(r.executado)}</b>${ctBar(r.pct_exec)}<small>${pct(r.pct_exec)} do contrato</small></div>
      <div class="card"><small>Medido</small><b>${ctM(r.medido)}</b>${ctBar(r.pct_med, 'med')}<small>${pct(r.pct_med)} do contrato</small></div>
      <div class="card"><small>Pago</small><b>${ctM(r.pago)}</b>${ctBar(r.pct_pago, 'pg')}<small>${pct(r.pct_pago)} do contrato</small></div>
      <div class="card"><small>Saldo a medir</small><b>${ctM(r.saldo)}</b><small>contratado − medido</small></div></div>
    <div class="card fv-ident"><dl class="kv"><dt>Obra</dt><dd>${esc(d.obra.nome)}</dd>
      <dt>Contratante</dt><dd>${esc(d.contratante_nome || '—')}${d.contratante_doc ? ' · ' + esc(d.contratante_doc) : ''}</dd>
      <dt>Empreiteiro</dt><dd>${esc(d.emp.empresa || d.emp.nome)}${d.emp.documento ? ' · ' + esc(d.emp.documento) : ''}</dd>
      ${d.emp.responsavel || d.emp.telefone ? `<dt>Contato</dt><dd>${esc([d.emp.responsavel, d.emp.telefone, d.emp.email].filter(Boolean).join(' · '))}</dd>` : ''}
      <dt>Pagamento</dt><dd>${esc(d.pag_forma || '—')} · medição ${esc((d.pag_periodicidade || '').toLowerCase())}${d.pag_obs ? '<br>' + esc(d.pag_obs) : ''}${d.permuta_valor ? `<br>Permuta: ${ctM(d.permuta_valor)}${d.permuta_desc ? ' · ' + esc(d.permuta_desc) : ''}` : ''}${d.fat_nf_pct !== '' || d.fat_recibo_pct !== '' ? `<br>Faturamento: ${d.fat_nf_pct || 0}% nota fiscal · ${d.fat_recibo_pct || 0}% recibo` : ''}</dd>
      ${d.data_assinatura ? `<dt>Assinatura</dt><dd>${fd(d.data_assinatura)}${d.local_assinatura ? ' · ' + esc(d.local_assinatura) : ''}</dd>` : ''}
      <dt>Preço global</dt><dd>${r.valor_global ? ctM(r.valor_global) : 'não informado (vale a soma da planilha)'} · soma da planilha ${ctM(r.soma_itens)}${r.diferenca ? ` <small>(diferença ${ctM(r.diferenca)})</small>` : ''}</dd></dl></div>
    <div class="card"><h3>Planilha: contratado × executado × medido</h3>
      <div class="ct-rol"><table class="tab ct-tab"><thead><tr><th>Serviço</th><th>Un.</th><th class="n">Contratado</th><th class="n">Executado</th><th class="n">Medido</th><th class="n">Saldo</th><th class="n">R$ unit.</th><th class="n">R$ contratado</th><th class="n">R$ medido</th></tr></thead><tbody>
      ${grupos.map(g => `<tr class="ct-g"><td colspan="9">${esc(g)}</td></tr>${porG[g].map(i => `<tr class="${i.acima ? 'ct-acima' : ''}"><td>${i.codigo ? '<small>' + esc(i.codigo) + '</small> ' : ''}${esc(i.servico)}<div class="ct-mini">${ctBar(i.pct_exec)}<small>${pct(i.pct_exec)} executado${i.programado ? ' · ' + nf(i.programado) + ' em frentes' : ''}</small></div></td><td>${esc(i.unidade)}</td><td class="n">${nf(i.qtd)}</td><td class="n">${nf(i.executado)}</td><td class="n">${nf(i.medido)}</td><td class="n">${nf(i.saldo)}</td><td class="n">${ctM(i.unitario)}</td><td class="n">${ctM(i.total)}</td><td class="n">${ctM(i.v_med)}</td></tr>`).join('')}`).join('') || '<tr><td colspan="9">Sem itens na planilha.</td></tr>'}
      </tbody></table></div></div>
    <div class="card"><h3>Frentes de trabalho deste contrato</h3>
      ${d.frentes.map(f => `<a class="ct-fr" href="#/exec/etapa/${esc(f.codigo)}"><span><b>${esc(f.nome)}</b><small>${esc(f.local || '')} · ${plural(f.servicos, 'serviço', 'serviços')}</small></span><b>${pct(f.pct)}</b></a>`).join('') || '<small>Nenhuma frente aberta com este contrato ainda.</small>'}
      ${d.status === 'Vigente' && can('exec_planejar') ? `<div class="acoes" style="margin-top:8px"><button class="btn" id="ctFrente">${ic('plus')} Abrir frente de trabalho deste contrato</button></div>` : ''}</div>
    <div class="card"><h3>Aditivos</h3>
      ${d.aditivos.map(a => `<div class="alt"><b>Aditivo nº ${a.numero}</b> · ${esc(a.tipo)} · ${fd(a.data)}${a.valor ? ' · <b>' + ctM(a.valor) + '</b>' : ''}${a.nova_vigencia ? ' · nova vigência até ' + fd(a.nova_vigencia) : ''}<br><small>${esc(a.descricao)} — ${esc(a.criado_por)}</small></div>`).join('') || '<small>Nenhum aditivo registrado.</small>'}
      ${d.status === 'Vigente' && d.pode_gerir ? `<div class="acoes" style="margin-top:8px"><button class="btn sec" id="ctAditivo">${ic('plus')} Registrar aditivo</button></div>` : ''}</div>
    <div class="card" id="ctAcao"></div>`);
  ctAcoes(d);
}
/* a minuta baixada também fica guardada no Drive, na pasta Contratos da obra */
async function ctGuardaMinuta(d, blob) { return api('contrato_minuta', { id: d.id, pdf: { nome: 'Minuta.pdf', b64: await paraB64(blob) } }); }
function ctAcoes(d) {
  const el = $('#ctAcao'), hist = d.historico.slice().reverse(), ger = d.pode_gerir;
  el.innerHTML = `<h3>Documento e situação</h3>
    <div class="acoes fv-acoes">
      <button class="btn" id="ctMinuta">${ic('download')} Baixar minuta do contrato (PDF)</button>
      ${d.tem_pdf ? `<button class="btn sec" id="ctVer">${ic('eye')} Ver contrato assinado</button>` : ''}
      ${ger ? `<button class="btn sec" id="ctAnexo">${ic('send')} ${d.tem_pdf ? 'Trocar o contrato assinado' : 'Anexar contrato assinado'}</button>` : ''}
      ${d.pasta_url ? `<a class="btn sec" href="${esc(d.pasta_url)}" target="_blank" rel="noopener">${ic('pasta')} Abrir pasta no Drive</a>` : ''}
      ${d.editavel ? `<a class="btn sec" href="#/ctr/editar/${esc(d.id)}">${ic('edit')} Editar contrato e planilha</a>` : ''}
      ${ger && d.status === 'Rascunho' ? `<button class="btn" id="ctAtivar">${ic('check')} Ativar contrato</button><button class="btn perigo" id="ctCancelar">Cancelar rascunho</button>` : ''}
      ${ger && d.status === 'Vigente' ? `<button class="btn sec" id="ctEncerrar">Encerrar contrato</button><button class="btn perigo" id="ctRescindir">Rescindir</button>` : ''}
      ${ger && ['Encerrado', 'Rescindido', 'Cancelado'].includes(d.status) ? `<button class="btn sec" id="ctReabrir">Reabrir</button>` : ''}
    </div>
    <small>${d.minuta_em ? `Minuta guardada no Drive em ${esc(fdh(d.minuta_em))}.` : 'A minuta é guardada no Drive (pasta Contratos) ao ativar o contrato e a cada vez que for baixada.'}</small>
    ${d.status === 'Vigente' ? '<small>Contrato vigente: pode ser escolhido nas frentes de trabalho do empreiteiro. Alterações exigem motivo e ficam no histórico.</small>' : ''}
    <details class="fv-hist"><summary>Histórico (${hist.length})</summary>${hist.map(h => `<div class="alt"><b>${esc(h.acao)}</b>${h.nota ? ': ' + esc(h.nota) : ''}<br><small>${esc(h.por)} · ${esc(fdh(h.q))}</small></div>`).join('')}</details>`;
  const lig = (id, fn) => { const b = $('#' + id); if (b) b.onclick = async e => { const bt = e.currentTarget, t = bt.innerHTML; bt.disabled = true; try { await fn(); } catch (x) { toast(x.message, 1); } if (document.body.contains(bt)) { bt.disabled = false; bt.innerHTML = t; } }; };
  const op = async (acao, motivo) => { toast((await api('contrato_status', { id: d.id, op: acao, motivo })).msg); await vCtrDet(d.id); };
  const pedeMotivo = (tit, acao, rot) => modal(tit, `<label>${rot}<textarea name="motivo" required minlength="5" rows="3"></textarea></label>`, { ok: 'Confirmar', onOk: f => op(acao, f.motivo.value) });
  lig('ctMinuta', async () => {
    toast('Gerando a minuta…');
    const b = await ctMinutaPdf(d);
    baixarBlob(b, 'Contrato ' + d.rotulo.replace(/[\\/:*?"<>|]/g, '-') + ' - ' + (d.emp.empresa || d.emp.nome).replace(/[\\/:*?"<>|]/g, '-') + '.pdf');
    if (ger) { try { toast((await ctGuardaMinuta(d, b)).msg); await vCtrDet(d.id); } catch (x) { toast('Minuta baixada, mas não consegui guardar no Drive: ' + x.message, 1); } }
  });
  lig('ctVer', async () => { const r = await api('contrato_anexo_ver', { id: d.id }); baixarBlob(new Blob([Uint8Array.from(atob(r.b64), c => c.charCodeAt(0))], { type: r.mime }), r.nome); });
  lig('ctAnexo', async () => modal('Contrato assinado', `${campoArquivo('arq', 'Arquivo do contrato assinado (PDF ou foto)', true)}<small>Fica na pasta Contratos desta obra, no Drive. Ao trocar, o arquivo anterior continua guardado na pasta.</small>`, {
    ok: 'Arquivar', onOk: async f => { const arq = await lerArquivo(f.arq); toast((await api('contrato_anexo', { id: d.id, arquivo: arq })).msg); await vCtrDet(d.id); }
  }));
  lig('ctAtivar', async () => {
    if (!confirm('Ativar este contrato? Ele passa a aparecer ao abrir frentes de trabalho do empreiteiro, e a minuta é guardada no Drive.')) return;
    toast((await api('contrato_status', { id: d.id, op: 'ativar' })).msg);
    try { const n = await api('contrato_detalhe', { id: d.id }); await ctGuardaMinuta(n, await ctMinutaPdf(n)); toast('Minuta guardada no Drive (pasta Contratos).'); }
    catch (x) { toast('Contrato ativado, mas não consegui guardar a minuta no Drive: ' + x.message, 1); }
    await vCtrDet(d.id);
  });
  lig('ctCancelar', async () => { if (confirm('Cancelar este rascunho?')) await op('cancelar'); });
  lig('ctEncerrar', async () => { if (confirm('Encerrar o contrato? As frentes continuam, mas não dá mais para abrir frentes novas com ele.')) await op('encerrar'); });
  lig('ctRescindir', async () => pedeMotivo('Rescindir contrato', 'rescindir', 'Motivo da rescisão'));
  lig('ctReabrir', async () => pedeMotivo('Reabrir contrato', 'reabrir', 'Motivo para reabrir'));
  lig('ctFrente', async () => { await carregarExec(true); mEtapa(null, { empreiteiro: d.empreiteiro, contrato: d.id }); });
  const ad = $('#ctAditivo');
  if (ad) ad.onclick = () => modal('Registrar aditivo', `<label>Tipo<select name="tipo">${['Acréscimo de serviços', 'Supressão de serviços', 'Prazo', 'Preço ou forma de pagamento', 'Outro'].map(x => `<option>${x}</option>`).join('')}</select></label>
      <label>O que muda<textarea name="descricao" required minlength="5" rows="3" placeholder="ex: mais 20 registros e 300 m de rede na Rua B"></textarea></label>
      <div class="g2"><label>Valor do aditivo (R$) <small>(use − para redução)</small><input name="valor" inputmode="decimal" placeholder="0,00"></label><label>Data<input type="date" name="data" value="${hoje()}"></label></div>
      <label>Nova data de fim da vigência <small>(se mudar)</small><input type="date" name="nv"></label>
      <small>O valor soma ao contrato. Para mudar quantidades ou preços da planilha, use <b>Editar contrato</b> informando o aditivo no motivo.</small>`, {
    ok: 'Registrar', onOk: async f => { toast((await api('contrato_aditivo', { id: d.id, tipo: f.tipo.value, descricao: f.descricao.value, valor: ctPn(f.valor.value), data: f.data.value, nova_vigencia: f.nv.value })).msg); await vCtrDet(d.id); }
  });
}

/* ---------- rotas ---------- */
ROTAS.push(
  [/^#\/ctr$/, vCtr], [/^#\/ctr\/novo(?:\?.*)?$/, vCtrNovo], [/^#\/ctr\/editar\/(CT-[\w]+)$/, vCtrEditar], [/^#\/ctr\/(CT-[\w]+)$/, vCtrDet]
);
