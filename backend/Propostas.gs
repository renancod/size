/**
 * ORÇAMENTOS DE CLIENTES (planilha central, antes de existir a obra) e o painel da empresa.
 *  - Orçamento: cliente, empreendimento, etapas e itens. Item = composição da base de preços × quantidade
 *    (o custo unitário por categoria fica CONGELADO no orçamento: mudar a base não altera proposta já enviada;
 *    "Atualizar preços pela base" puxa de novo) ou item de preço direto (verba), com material e mão de obra digitados.
 *  - Preço de venda = custo direto + BDI + gestão. BDI e gestão têm % e base configuráveis por orçamento
 *    (ex. AVA: BDI 18% só sobre mão de obra e serviços; gestão 6% sobre o custo total).
 *  - Situação: Rascunho → Enviado → Aprovado | Perdido (ou Cancelado). Nova revisão copia o orçamento (rev. 1, 2…) e a anterior fica "Revisado".
 *  - Gerar obra (administrador, orçamento aprovado): cria a obra com uma frente geral por etapa, os serviços com quantidade,
 *    material, mão de obra e preço de venda, e os materiais de cada serviço (insumos de material das composições).
 * Acesso: o mesmo do módulo Orçamentos (Usuarios.orcamentos = Ver | Gerir).
 */
const PROP_STATUS = ['Rascunho', 'Enviado', 'Aprovado', 'Perdido', 'Cancelado', 'Revisado'];
const PROP_BASES = { servicos: 'mão de obra, equipamento e serviços', total: 'custo total' };
const PROP_CAB_ = { cliente: 150, cliente_doc: 30, contato: 100, telefone: 40, email: 120, empreendimento: 150, local: 200, prazo_txt: 300, pagamento_txt: 500, texto_cliente: 3000, obs: 2000 };

const propR2_ = n => Math.round((Number(n) || 0) * 100) / 100;
function propRotulo_(p) { return String(p.numero) + (num_(p.revisao) ? ' rev.' + num_(p.revisao) : ''); }
function propAchar_(id) {
  const p = central_('Propostas').all().find(x => String(x.id) === String(id));
  if (!p) throw new Error('Orçamento não encontrado.');
  return p;
}
function propItens_(id) {
  return central_('PropostaItens').all().filter(x => String(x.proposta) === String(id)).sort((a, b) => num_(a.ordem) - num_(b.ordem));
}
function propHist_(p, ctx, acao, det) {
  let h = [];
  try { h = JSON.parse(p.historico_json || '[]'); } catch (e) { h = []; }
  h.push({ em: agora_(), por: ctx.u.nome, acao: acao, det: String(det || '').slice(0, 300) });
  p.historico_json = JSON.stringify(h.slice(-80));
}
/* valores: por item, por etapa e do orçamento (custo, BDI, gestão e preço de venda), arredondados como na planilha (2 casas por item) */
function propCalc_(p, itens) {
  const bdiPct = num_(p.bdi_pct) / 100, gesPct = num_(p.gestao_pct) / 100;
  const base = (b, i) => (b === 'total' ? i.custo : i.v_serv);
  const etapas = [], tot = { custo: 0, v_mat: 0, v_serv: 0, bdi: 0, gestao: 0, preco: 0, itens: 0 };
  let et = null;
  const soma = (a, i) => { ['custo', 'v_mat', 'v_serv', 'bdi', 'gestao', 'preco'].forEach(k => { a[k] = propR2_(a[k] + i[k]); }); a.itens++; };
  const linhas = itens.map(x => {
    if (x.tipo === 'E') {
      et = { codigo: String(x.codigo), descricao: x.descricao, custo: 0, v_mat: 0, v_serv: 0, bdi: 0, gestao: 0, preco: 0, itens: 0 };
      etapas.push(et);
      return { tipo: 'E', codigo: String(x.codigo), descricao: x.descricao };
    }
    const q = num_(x.qtd), u = { mat: num_(x.unit_mat), mo: num_(x.unit_mo), eq: num_(x.unit_eq), sv: num_(x.unit_sv) };
    const i = {
      tipo: 'I', codigo: String(x.codigo), comp_cod: String(x.comp_cod || ''), fonte: String(x.fonte || ''), descricao: x.descricao, unidade: x.unidade, qtd: q, unit_mat: u.mat, unit_mo: u.mo, unit_eq: u.eq, unit_sv: u.sv, obs: x.obs || '',
      custo_unit: u.mat + u.mo + u.eq + u.sv, custo: propR2_(q * (u.mat + u.mo + u.eq + u.sv)), v_mat: propR2_(q * u.mat), v_serv: propR2_(q * (u.mo + u.eq + u.sv))
    };
    i.sem_bdi = sim_(x.sem_bdi); i.sem_gestao = sim_(x.sem_gestao);
    i.bdi = i.sem_bdi ? 0 : propR2_(base(p.bdi_base, i) * bdiPct);
    i.gestao = i.sem_gestao ? 0 : propR2_(base(p.gestao_base, i) * gesPct);
    i.preco = propR2_(i.custo + i.bdi + i.gestao);
    i.preco_unit = q ? propR2_(i.preco / q) : 0;
    if (et) soma(et, i);
    soma(tot, i);
    return i;
  });
  tot.pct_material = tot.custo ? propR2_(tot.v_mat / tot.custo * 100) : 0;
  tot.margem = tot.preco ? propR2_((tot.bdi + tot.gestao) / tot.preco * 100) : 0;
  return { linhas: linhas, etapas: etapas, total: tot };
}
function propPub_(p, comTotal) {
  const o = pub_(p);
  delete o.historico_json; delete o.cronograma_json; delete o.aceite_json;
  o.aceite = propAceite_(p);
  o.portal_modo = p.portal_modo === 'fechado' ? 'fechado' : 'aberto';
  o.rotulo = propRotulo_(p);
  o.revisao = num_(p.revisao);
  ['bdi_pct', 'gestao_pct', 'validade_dias'].forEach(k => { o[k] = num_(p[k]); });
  o.data_base = baseData_(p.data_base);
  o.sinapi_regime = p.sinapi_regime === 'cd' ? 'cd' : 'sd';
  if (comTotal) o.total = propCalc_(p, propItens_(p.id)).total;
  return o;
}

/* ---------- leitura ---------- */
function propListar_(q, ctx) {
  // guardada na memória do Google (Db.gs memoria_): renova a cada gravação em Propostas ou PropostaItens
  const propostas = memoria_('prop', 'lista', () => {
    const T = central_('Propostas').all(), I = central_('PropostaItens').all(), por = {};
    I.forEach(x => { (por[x.proposta] = por[x.proposta] || []).push(x); });
    return T.map(p => { const o = propPub_(p); o.total = propCalc_(p, (por[p.id] || []).sort((a, b) => num_(a.ordem) - num_(b.ordem))).total; return o; })
      .sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)));
  });
  return { nivel: ctx.base, admin: ctx.admin, propostas: propostas };
}
function propDetalhe_(q, ctx) {
  const p = propAchar_(q.id), calc = propCalc_(p, propItens_(p.id));
  let hist = [];
  try { hist = JSON.parse(p.historico_json || '[]'); } catch (e) { hist = []; }
  const revisoes = central_('Propostas').all().filter(x => String(x.numero) === String(p.numero)).map(x => ({ id: x.id, rotulo: propRotulo_(x), status: x.status, revisao: num_(x.revisao) }))
    .sort((a, b) => a.revisao - b.revisao);
  const obra = p.obra_id ? central_('Obras').all().find(o => String(o.id) === String(p.obra_id)) : null;
  return {
    proposta: propPub_(p), itens: calc.linhas, etapas: calc.etapas, total: calc.total, historico: hist.reverse(), revisoes: revisoes, cronograma: propCrono_(p, calc),
    obra: obra ? { id: String(obra.id), nome: obra.nome, sigla: obra.sigla } : null,
    editavel: p.status === 'Rascunho' && ctx.base === 'Gerir', nivel: ctx.base, admin: ctx.admin,
    empresa: String(config_().EMPRESA || 'Size Engenharia'),
    // portal do cliente: a quem foi enviado, considerações do cliente (todas as revisões deste número) e clientes para escolher
    comentarios: propComentarios_(p.numero),
    clientes: central_('Clientes').all().filter(c => sim_(c.ativo) || String(c.id) === String(p.cliente_id)).map(c => ({ id: String(c.id), nome: c.nome, empresa: c.empresa || '' }))
  };
}

/* ---------- gravação ---------- */
/* custo unitário atual de uma composição da base, por categoria */
function propCustoBase_(ix, memo, cod) {
  if (!ix.C[String(cod)]) throw new Error('Composição ' + cod + ' não está mais na base de preços.');
  const r = baseCusto_(ix, cod, memo);
  return { unit_mat: baseR4_(r.mat), unit_mo: baseR4_(r.mo), unit_eq: baseR4_(r.eq), unit_sv: baseR4_(r.sv) };
}
/* etapas numeradas 1, 2, 3… e itens 1.1, 1.2… na ordem da tela */
function propItensValidos_(lista, id, ix, regime) {
  const memo = {}, out = [];
  let six = null;   // índice do SINAPI, só se algum item do SINAPI vier sem custo
  let ne = 0, ni = 0, temEtapa = false;
  [].concat(lista || []).forEach(x => {
    if (!x) return;
    const desc = String(x.descricao || '').trim();
    if (x.tipo === 'E') {
      if (!desc) throw new Error('Dê um nome para cada etapa.');
      ne++; ni = 0; temEtapa = true;
      out.push({ proposta: id, ordem: out.length + 1, tipo: 'E', codigo: String(ne), comp_cod: '', descricao: desc.slice(0, 200), unidade: '', qtd: '', unit_mat: '', unit_mo: '', unit_eq: '', unit_sv: '', obs: '' });
      return;
    }
    if (!temEtapa) { ne = 1; temEtapa = true; out.push({ proposta: id, ordem: out.length + 1, tipo: 'E', codigo: '1', comp_cod: '', descricao: 'Serviços', unidade: '', qtd: '', unit_mat: '', unit_mo: '', unit_eq: '', unit_sv: '', obs: '' }); }
    const comp = String(x.comp_cod || '').trim(), qtd = num_(x.qtd);
    if (!desc && !comp) return;
    if (!(qtd > 0)) throw new Error('Informe a quantidade de ' + (desc || comp) + '.');
    const un = String(x.unidade || '').trim();
    if (!un) throw new Error('Informe a unidade de ' + (desc || comp) + '.');
    const fonte = /^SINAPI(-INSUMO)?$/.test(String(x.fonte || '')) && comp ? String(x.fonte) : '';
    let u = { unit_mat: num_(x.unit_mat), unit_mo: num_(x.unit_mo), unit_eq: num_(x.unit_eq), unit_sv: num_(x.unit_sv) };
    // composição sem custo vindo da tela (ou a pedido): pega da base (ou do SINAPI, no regime do orçamento) agora e congela
    if (comp && (x.recalcular || ['unit_mat', 'unit_mo', 'unit_eq', 'unit_sv'].every(k => x[k] === '' || x[k] == null))) {
      if (fonte) { six = six || sinIndiceServidor_(); u = sinCustoItem_(six, fonte, comp, regime); }
      else u = propCustoBase_(ix, memo, comp);
    }
    Object.keys(u).forEach(k => { if (u[k] < 0) throw new Error('Valor negativo em ' + (desc || comp) + '.'); });
    ni++;
    out.push(Object.assign({ proposta: id, ordem: out.length + 1, tipo: 'I', codigo: ne + '.' + ni, comp_cod: comp, fonte: fonte, descricao: (desc || (!fonte && ix.C[comp] ? ix.C[comp].descricao : comp)).slice(0, 300), unidade: un.slice(0, 20), qtd: qtd, obs: String(x.obs || '').trim().slice(0, 300),
      sem_bdi: sim_(x.sem_bdi) ? 'Sim' : '', sem_gestao: sim_(x.sem_gestao) ? 'Sim' : '' }, u));
  });
  return out;
}
function propSalvar_(q, ctx) {
  const T = central_('Propostas'), d = q.proposta || {};
  let p = d.id ? propAchar_(d.id) : null;
  if (p && p.status !== 'Rascunho') throw new Error('Só dá para alterar o orçamento em rascunho. Para mudar um orçamento enviado, crie uma nova revisão.');
  const nova = !p;
  if (nova) {
    let max = 0;
    T.all().forEach(x => { const n = parseInt(String(x.numero).replace(/\D/g, ''), 10); if (n > max) max = n; });
    p = { id: 'PR-' + Utilities.getUuid().slice(0, 8), numero: 'ORC-' + ('000' + (max + 1)).slice(-4), revisao: 0, status: 'Rascunho', criado_em: new Date(), criado_por: ctx.u.nome };
  }
  Object.keys(PROP_CAB_).forEach(k => { if (d[k] !== undefined) p[k] = String(d[k] || '').trim().slice(0, PROP_CAB_[k]); });
  if (!String(p.cliente || '').trim()) throw new Error('Informe o cliente.');
  if (!String(p.empreendimento || '').trim()) throw new Error('Informe o empreendimento ou obra.');
  if (d.data_base !== undefined) p.data_base = baseDataIso_(d.data_base) || '';
  if (d.validade_dias !== undefined) p.validade_dias = Math.max(0, Math.round(num_(d.validade_dias)));
  ['bdi_pct', 'gestao_pct'].forEach(k => {
    if (d[k] === undefined) return;
    const v = num_(d[k]);
    if (v < 0 || v > 200) throw new Error('Percentual inválido (' + k.replace('_pct', '').toUpperCase() + ').');
    p[k] = v;
  });
  ['bdi_base', 'gestao_base'].forEach(k => { if (d[k] !== undefined) p[k] = PROP_BASES[d[k]] ? d[k] : 'total'; });
  if (d.sinapi_regime !== undefined) p.sinapi_regime = d.sinapi_regime === 'cd' ? 'cd' : 'sd';
  if (nova) { if (p.bdi_base == null) p.bdi_base = 'servicos'; if (p.gestao_base == null) p.gestao_base = 'total'; if (p.validade_dias == null) p.validade_dias = 30; if (!p.data_base) p.data_base = baseHoje_(); }
  p.atualizado_em = new Date();
  p.atualizado_por = ctx.u.nome;
  const I = central_('PropostaItens');
  let itens = null;
  if (q.itens !== undefined) {
    itens = propItensValidos_(q.itens, p.id, baseIndice_(), p.sinapi_regime);
    I.substituir(I.all().filter(x => String(x.proposta) !== String(p.id)).concat(itens));
  }
  const tot = propCalc_(p, itens || propItens_(p.id)).total;
  propHist_(p, ctx, nova ? 'Criado' : 'Alterado', plural_(tot.itens, 'item', 'itens') + ' · ' + brl_(tot.preco));
  if (nova) T.insert(p); else T.update(p);
  log_(ctx, nova ? 'proposta_criar' : 'proposta_editar', propRotulo_(p) + ' ' + p.cliente + ' · ' + brl_(tot.preco));
  return { msg: (nova ? 'Orçamento ' + propRotulo_(p) + ' criado' : 'Orçamento salvo') + ' · ' + brl_(tot.preco) + '.', id: p.id };
}
/* puxa de novo o custo de todas as composições da base (o orçamento em rascunho passa a valer com os preços de hoje) */
function propAtualizarPrecos_(q, ctx) {
  const p = propAchar_(q.id);
  if (p.status !== 'Rascunho') throw new Error('Só o orçamento em rascunho é atualizado pela base.');
  const I = central_('PropostaItens'), ix = baseIndice_(), memo = {}, falta = [];
  const antes = propCalc_(p, propItens_(p.id)).total.preco;
  let n = 0, six = null;
  propItens_(p.id).forEach(x => {
    if (x.tipo !== 'I' || !x.comp_cod) return;
    // item do SINAPI: preço do mês importado, no regime do orçamento
    if (/^SINAPI/.test(String(x.fonte || ''))) {
      six = six || sinIndiceServidor_();
      try { Object.assign(x, sinCustoItem_(six, String(x.fonte), x.comp_cod, p.sinapi_regime)); n++; } catch (e) { falta.push('SINAPI ' + x.comp_cod); }
      return;
    }
    if (!ix.C[String(x.comp_cod)]) { falta.push(String(x.comp_cod)); return; }
    Object.assign(x, propCustoBase_(ix, memo, x.comp_cod));
    n++;
  });
  I.substituir(I.all());
  p.atualizado_em = new Date(); p.atualizado_por = ctx.u.nome;
  const depois = propCalc_(p, propItens_(p.id)).total.preco;
  propHist_(p, ctx, 'Preços atualizados pela base', brl_(antes) + ' → ' + brl_(depois));
  central_('Propostas').update(p);
  return { msg: plural_(n, 'item atualizado', 'itens atualizados') + ' pela base: ' + brl_(antes) + ' → ' + brl_(depois) + '.' + (falta.length ? ' Composições que não estão mais na base: ' + falta.join(', ') + '.' : '') };
}
function propStatus_(q, ctx) {
  const T = central_('Propostas'), p = propAchar_(q.id), op = String(q.op), motivo = String(q.motivo || '').trim();
  const pode = { enviar: ['Rascunho'], aprovar: ['Rascunho', 'Enviado'], perder: ['Rascunho', 'Enviado'], cancelar: ['Rascunho'], reabrir: ['Enviado', 'Perdido', 'Cancelado'] }[op];
  if (!pode) throw new Error('Operação desconhecida.');
  if (pode.indexOf(p.status) < 0) throw new Error('Este orçamento está "' + p.status + '": não dá para ' + op + '.');
  if (op === 'perder' && motivo.length < 3) throw new Error('Informe o motivo (ex: preço, prazo, cliente desistiu).');
  if (op === 'enviar' && !propCalc_(p, propItens_(p.id)).total.itens) throw new Error('Inclua pelo menos um item antes de enviar.');
  const novo = { enviar: 'Enviado', aprovar: 'Aprovado', perder: 'Perdido', cancelar: 'Cancelado', reabrir: 'Rascunho' }[op];
  if (op === 'enviar') p.enviado_em = new Date();
  if (op === 'aprovar' || op === 'perder') p.decidido_em = new Date();
  if (op === 'reabrir') p.decidido_em = '';
  if (motivo) p.motivo = motivo.slice(0, 500);
  p.status = novo;
  p.atualizado_em = new Date(); p.atualizado_por = ctx.u.nome;
  propHist_(p, ctx, novo, motivo);
  T.update(p);
  log_(ctx, 'proposta_' + op, propRotulo_(p));
  return { msg: 'Orçamento ' + propRotulo_(p) + ': ' + novo.toLowerCase() + '.' };
}
/* cópia do orçamento: nova revisão (mesmo número, rev+1; a anterior fica "Revisado") ou orçamento novo (outro número) */
function propCopiar_(q, ctx) {
  const T = central_('Propostas'), I = central_('PropostaItens'), p = propAchar_(q.id), rev = !q.novo;
  if (rev) {
    if (p.status === 'Rascunho') throw new Error('Este orçamento ainda está em rascunho: é só alterar.');
    if (p.status === 'Revisado') throw new Error('Já existe uma revisão mais nova deste orçamento.');
    if (p.obra_id) throw new Error('Este orçamento já virou obra.');
  }
  let max = 0;
  T.all().forEach(x => { const n = parseInt(String(x.numero).replace(/\D/g, ''), 10); if (n > max) max = n; });
  const c = Object.assign({}, p, {
    id: 'PR-' + Utilities.getUuid().slice(0, 8), numero: rev ? p.numero : 'ORC-' + ('000' + (max + 1)).slice(-4), revisao: rev ? num_(p.revisao) + 1 : 0, status: 'Rascunho',
    motivo: '', obra_id: '', historico_json: '', aceite_json: '', criado_em: new Date(), criado_por: ctx.u.nome, atualizado_em: new Date(), atualizado_por: ctx.u.nome, enviado_em: '', decidido_em: ''
  });
  delete c._l;
  if (!rev) { c.empreendimento = String(p.empreendimento) + ' (cópia)'; c.cliente_id = ''; c.contrato_id = ''; c.contrato_nome = ''; c.foto_id = ''; c.portal_tipo = ''; }
  propHist_(c, ctx, rev ? 'Revisão criada' : 'Copiado', 'a partir de ' + propRotulo_(p));
  T.insert(c);
  I.insertMany(propItens_(p.id).map(x => { const o = Object.assign({}, x, { proposta: c.id }); delete o._l; return o; }));
  if (rev) { p.status = 'Revisado'; p.atualizado_em = new Date(); propHist_(p, ctx, 'Revisado', 'substituído por ' + propRotulo_(c)); T.update(p); }
  log_(ctx, rev ? 'proposta_revisao' : 'proposta_copiar', propRotulo_(p) + ' → ' + propRotulo_(c));
  return { msg: (rev ? 'Revisão ' : 'Cópia ') + propRotulo_(c) + ' criada em rascunho.', id: c.id };
}
function propExcluir_(q, ctx) {
  const p = propAchar_(q.id);
  if (p.status !== 'Rascunho' || num_(p.revisao) > 0) throw new Error('Só dá para excluir um orçamento novo em rascunho. Os outros ficam no histórico (cancele ou marque como perdido).');
  central_('Propostas').removeWhere(x => String(x.id) === String(p.id));
  const I = central_('PropostaItens');
  I.substituir(I.all().filter(x => String(x.proposta) !== String(p.id)));
  log_(ctx, 'proposta_excluir', propRotulo_(p));
  return { msg: 'Orçamento ' + propRotulo_(p) + ' excluído.' };
}

/* ---------- importar um orçamento em planilha (a mesma planilha da base: aba do orçamento + aba Composições) ----------
 * conferir (sem gravar) ou aplicar: atualiza a base de preços com as composições do arquivo e cria o orçamento em rascunho,
 * com uma etapa por grupo da planilha, cada item ligado à composição e na quantidade da planilha; BDI e gestão vêm do arquivo */
function propImportar_(q, ctx) {
  const P = baseLerPlanilha_(q.abas), plano = basePlanoImport_(P, q.atualizar !== false && q.atualizar !== 'false', { fonte: q.fonte, substituir: q.substituir });
  const itens = [];
  let et = null, precoPlan = 0;
  P.blocos.forEach(b => {
    const e = String(b.item).split('.')[0] || '1';
    if (e !== et) { et = e; itens.push({ tipo: 'E', descricao: P.etapasNomes[e] || 'Etapa ' + e }); }
    const fx = P.semTaxa[String(b.item)] || {};
    itens.push({ tipo: 'I', comp_cod: b.cod_final, descricao: b.descricao, unidade: b.unidade, qtd: num_(b.qtd) || 1, sem_bdi: !!fx.bdi, sem_gestao: !!fx.gestao });
    precoPlan += (num_(b.qtd) || 1) * (b.unit == null ? 0 : b.unit);
  });
  const sugestao = { empreendimento: P.titulo, bdi_pct: P.taxas.bdi == null ? '' : P.taxas.bdi, bdi_base: P.taxas.bdi_base || 'servicos', gestao_pct: P.taxas.gestao == null ? '' : P.taxas.gestao, gestao_base: P.taxas.gestao_base || 'total' };
  const resumo = { base: plano.resumo, etapas: itens.filter(i => i.tipo === 'E').length, itens: itens.filter(i => i.tipo === 'I').length, custo_planilha: propR2_(precoPlan), sugestao: sugestao, avisos: plano.avisos, conflitos: plano.conflitos,
    sem_bdi: itens.filter(i => i.sem_bdi).map(i => i.descricao), sem_gestao: itens.filter(i => i.sem_gestao).map(i => i.descricao) };
  if (!q.aplicar) return resumo;
  // 1º a base (mesmo plano: os códigos das composições são os mesmos), depois o orçamento
  baseImportar_({ abas: q.abas, atualizar: q.atualizar, aplicar: true, data_preco: q.data_preco, fonte: q.fonte, substituir: q.substituir }, ctx);
  const d = Object.assign({}, sugestao, q.proposta || {});
  ['bdi_pct', 'gestao_pct'].forEach(k => { if (d[k] === '' || d[k] == null) d[k] = 0; });
  if (!d.data_base) d.data_base = q.data_preco;
  const r = propSalvar_({ proposta: d, itens: itens }, ctx);
  return Object.assign(resumo, { id: r.id, msg: r.msg });
}

/* ---------- gerar a obra a partir do orçamento aprovado ---------- */
/* insumos de material de uma composição (abre as auxiliares), em quantidade por unidade do serviço */
function propMateriais_(ix, cod, fator, acc, pilha) {
  (ix.itens[String(cod)] || []).forEach(x => {
    const k = fator * num_(x.coef);
    if (x.ref_tipo === 'C') { if (ix.C[String(x.ref)] && pilha.indexOf(String(x.ref)) < 0) propMateriais_(ix, x.ref, k, acc, pilha.concat(String(x.ref))); return; }
    const i = ix.I[String(x.ref)];
    if (!i || i.tipo !== 'Material' || !(k > 0)) return;
    const a = acc[String(i.codigo)] || (acc[String(i.codigo)] = { i: i, coef: 0 });
    a.coef += k;
  });
  return acc;
}
function propGerarObra_(q, ctx) {
  if (!ctx.admin) throw new Error('Só administradores criam obras.');
  const T = central_('Propostas'), p = propAchar_(q.id);
  if (p.status !== 'Aprovado') throw new Error('Só o orçamento aprovado vira obra.');
  if (p.obra_id) throw new Error('Este orçamento já virou a obra ' + p.obra_id + '.');
  const calc = propCalc_(p, propItens_(p.id));
  if (!calc.total.itens) throw new Error('O orçamento não tem itens.');
  const etapas = calc.etapas.filter(e => e.itens), nomes = etapas.map(e => e.descricao);
  obraLocal_({}, q);
  const o = criarObra_(String(q.nome || p.empreendimento).trim(), q.sigla, String(q.endereco || p.local || '').trim(), nomes);
  if (q.lat !== undefined && String(q.lat || '').trim()) { obraLocal_(o, q); central_('Obras').update(o); }
  const octx = { u: ctx.u, admin: true, obra: o, perms: Object.keys(PERMISSOES), ss: SpreadsheetApp.openById(o.planilha_id) };
  // contrato principal com o cliente (o contrato assinado do orçamento vai anexado)
  const cc = ccCriar_(octx, { tipo: 'Contrato', numero: String(q.contrato_numero || '').trim() || propRotulo_(p), data: hojeYmd_(), descricao: 'Contrato principal · ' + (p.empreendimento || ''),
    valor: calc.total.preco, dias_uteis: 0, proposta_id: p.id, proposta: propRotulo_(p), arquivo_id: p.contrato_id || (propAceite_(p) || {}).arquivo_id || '', arquivo_nome: p.contrato_nome || ((propAceite_(p) || {}).arquivo_id ? 'contrato assinado (aceite).pdf' : '') });
  const r = propLevar_(p, calc, octx, e => orcFrente_(octx, e.descricao), cc.id);
  const nServ = r.nServ, nMat = r.nMat;
  p.obra_id = o.id;
  p.atualizado_em = new Date(); p.atualizado_por = ctx.u.nome;
  propHist_(p, ctx, 'Obra gerada', o.id + ' · ' + o.nome);
  T.update(p);
  log_(ctx, 'proposta_obra', propRotulo_(p) + ' → ' + o.id + ' ' + o.nome);
  // portal do cliente: a obra entra como empreendimento do cliente do orçamento (com o tipo e a foto do orçamento)
  const cli = q.portal && p.cliente_id ? propObraPortal_(p, o, q.tipo) : '';
  return { msg: 'Obra ' + o.nome + ' criada com ' + plural_(etapas.length, 'frente geral', 'frentes gerais') + ', ' + plural_(nServ, 'serviço', 'serviços') + ' e ' + plural_(nMat, 'material', 'materiais') + ' no orçamento da obra.'
    + (cli ? ' ' + cli + ' já acompanha a obra pelo portal.' : ''), obra_id: String(o.id), portal: cli };
}
/* aditivo ou novo contrato numa obra que já existe: as etapas do orçamento aprovado viram frentes gerais NOVAS
 * ("Pavimentação · Aditivo 1"), com serviços, materiais e datas; o prazo a mais (dias úteis) entra no prazo da obra */
function propIncluirObra_(q, ctx) {
  if (!ctx.admin) throw new Error('Só administradores incluem orçamento em obra.');
  const T = central_('Propostas'), p = propAchar_(q.id);
  if (p.status !== 'Aprovado') throw new Error('Só o orçamento aprovado entra na obra.');
  if (p.obra_id) throw new Error('Este orçamento já está na obra ' + p.obra_id + '.');
  const o = central_('Obras').all().find(x => String(x.id) === String(q.obra_id));
  if (!o || !o.planilha_id) throw new Error('Escolha a obra.');
  const calc = propCalc_(p, propItens_(p.id));
  if (!calc.total.itens) throw new Error('O orçamento não tem itens.');
  const tipo = q.tipo === 'Novo contrato' ? 'Novo contrato' : 'Aditivo';
  const octx = { u: ctx.u, admin: true, obra: o, perms: Object.keys(PERMISSOES), ss: SpreadsheetApp.openById(o.planilha_id) };
  const C = obraTab_(octx, 'ContratosCliente'), n = C.all().filter(x => x.tipo === tipo).length + 1;
  const rotulo = String(q.numero || '').trim() || (tipo === 'Aditivo' ? 'Aditivo ' + n : 'Contrato ' + (C.all().filter(x => x.tipo !== 'Aditivo').length + 1));
  const cc = ccCriar_(octx, { tipo: tipo, numero: rotulo, data: ymd_(q.data) || hojeYmd_(), descricao: String(q.descricao || '').trim() || (p.empreendimento || propRotulo_(p)),
    valor: calc.total.preco, dias_uteis: Math.max(0, parseInt(q.dias_uteis, 10) || 0), proposta_id: p.id, proposta: propRotulo_(p), arquivo_id: p.contrato_id || (propAceite_(p) || {}).arquivo_id || '', arquivo_nome: p.contrato_nome || '' });
  const Fr = obraTab_(octx, 'Frentes');
  const r = propLevar_(p, calc, octx, e => {
    let nome = e.descricao + ' · ' + rotulo, k = 2;
    while (Fr.all().some(f => norm_(f.nome) === norm_(nome))) nome = e.descricao + ' · ' + rotulo + ' (' + k++ + ')';
    return Fr.insert({ codigo: Fr.proxCodigo('codigo', 'FR', 2), nome: nome, ativa: 'Sim' });
  }, cc.id);
  p.obra_id = o.id;
  p.atualizado_em = new Date(); p.atualizado_por = ctx.u.nome;
  propHist_(p, ctx, tipo + ' na obra', o.id + ' · ' + o.nome + ' · ' + rotulo);
  T.update(p);
  log_(ctx, 'proposta_aditivo', propRotulo_(p) + ' → ' + o.id + ' ' + rotulo);
  return { msg: rotulo + ' incluído na obra ' + o.nome + ': ' + plural_(r.frentes, 'frente geral nova', 'frentes gerais novas') + ', ' + plural_(r.nServ, 'serviço', 'serviços') + (cc.dias_uteis ? ' e +' + cc.dias_uteis + ' dias úteis de prazo' : '') + '.', obra_id: String(o.id) };
}
/* leva as etapas do orçamento para frentes gerais da obra: serviços (quantidade, material, MO, venda), materiais das composições e datas */
function propLevar_(p, calc, octx, frenteDe, contratoId) {
  const etapas = calc.etapas.filter(e => e.itens);
  const ix = baseIndice_(), Mt = obraTab_(octx, 'Materiais'), Fr = obraTab_(octx, 'Frentes'), crono = {};
  propCrono_(p, calc).linhas.forEach(l => { crono[l.codigo] = l; });
  let nServ = 0, nMat = 0;
  etapas.forEach(e => {
    const f = frenteDe(e);
    const its = calc.linhas.filter(l => l.tipo === 'I' && String(l.codigo).split('.')[0] === e.codigo);
    const r = orcItensSalvar_({ frente: f.codigo, itens: its.map(i => ({ codigo: i.codigo, grupo: e.descricao, servico: i.descricao, unidade: i.unidade, qtd: i.qtd,
      unit_material: baseR4_(i.unit_mat), unit_mo: baseR4_(i.unit_mo + i.unit_eq + i.unit_sv), unit_venda: i.preco_unit, obs: i.comp_cod ? (i.fonte ? 'SINAPI ' : 'Composição ') + i.comp_cod + ' · ' + propRotulo_(p) : propRotulo_(p) })) }, octx);
    nServ += its.length;
    Object.assign(f, { preco: e.preco, custo_direto: e.custo, adm_local: 0, indiretas: 0, tributos: 0, descricao: 'Do orçamento ' + propRotulo_(p),
      inicio: (crono[e.codigo] || {}).ini || '', fim: (crono[e.codigo] || {}).fim || '', contrato: contratoId || '' });
    Fr.update(f);
    // materiais de cada serviço: o que a composição gasta por unidade (já com a perda que estiver no coeficiente)
    its.forEach((i, n) => {
      if (!i.comp_cod || i.fonte || !ix.C[i.comp_cod]) return;   // SINAPI: materiais ficam para cadastrar na obra
      const mats = propMateriais_(ix, i.comp_cod, 1, {}, [i.comp_cod]);
      Object.keys(mats).forEach(k => {
        const m = mats[k].i;
        let cad = Mt.all().find(x => norm_(x.descricao) === norm_(m.descricao));
        if (!cad) cad = Mt.insert({ codigo: Mt.proxCodigo('codigo', 'M', 4), descricao: m.descricao, unidade: m.unidade, categoria: m.grupo || 'Orçamento', estoque_min: '', ativo: 'Sim' });
        orcMaterialSalvar_({ orc_item: r.ids[n], material_cod: cad.codigo, coef: baseR4_(mats[k].coef) }, octx);
        nMat++;
      });
    });
  });
  return { nServ: nServ, nMat: nMat, frentes: etapas.length };
}

/* ---------- painel da empresa (tela Início, fora de obra) ---------- */
/* resumo leve de cada obra (guardado 3 minutos para o Início abrir rápido) */
function empObraResumo_(o) {
  const cache = CacheService.getScriptCache(), k = 'emp|' + o.id, c = cache.get(k);
  if (c) return JSON.parse(c);
  const r = { pedidos_andamento: 0, pedidos_urgentes: 0, ultimo_diario: '', frentes_exec: 0, erro: '' };
  try {
    const ctx = { ss: SpreadsheetApp.openById(o.planilha_id) };
    obraTab_(ctx, 'Pedidos').all().forEach(p => {
      if (['Concluído', 'Cancelado'].indexOf(p.status) >= 0) return;
      r.pedidos_andamento++;
      if (/^(alta|urgente)$/i.test(String(p.prioridade)) && p.entrega !== 'Recebido') r.pedidos_urgentes++;
    });
    obraTab_(ctx, 'Diarios').all().forEach(d => { const s = baseData_(d.data); if (s > r.ultimo_diario) r.ultimo_diario = s; });
    r.frentes_exec = obraTab_(ctx, 'Etapas').all().filter(e => !/^n/i.test(String(e.ativa))).length;
    // prazo em dias úteis (o mesmo cálculo do cartão do cliente)
    try { r.prazo = prazoObra_(Object.assign(ctx, { obra: o, u: { id: '', nome: 'Início' }, perms: [], admin: true })); } catch (e) { r.prazo = null; }
  } catch (e) { r.erro = 'não consegui abrir a planilha da obra'; }
  cache.put(k, JSON.stringify(r), 180);
  return r;
}
function empresaDados_(q, ctx) {
  const nivel = nivelBase_(ctx.u), sess = sessaoDe_(ctx.u), cfg = config_();
  const obras = central_('Obras').all().filter(o => sess.obras.some(s => s.id === String(o.id))).map(o => Object.assign({
    id: String(o.id), sigla: o.sigla, nome: o.nome, endereco: o.endereco, ativa: sim_(o.ativa), lat: o.lat === '' ? '' : num_(o.lat), lng: o.lng === '' ? '' : num_(o.lng)
  }, sim_(o.ativa) ? empObraResumo_(o) : {}));
  const r = { empresa: String(cfg.EMPRESA || 'Size Engenharia'), obras: obras, nivel: nivel, admin: ctx.admin, hoje: baseHoje_() };
  if (nivel) {
    ctx.base = nivel;
    r.propostas = propListar_(q, ctx).propostas;
    r.base = baseResumo_();
  }
  return r;
}
