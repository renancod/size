/**
 * ORÇAMENTO DA OBRA · frentes gerais (aba Frentes), o que cada uma precisa executar e o controle de saldo.
 *
 * Regras combinadas:
 *  - cada frente geral (ex: Rede de Esgoto) tem os serviços do orçamento com a quantidade total (ex: 2.500 m de rede),
 *    o preço de referência de material e o de mão de obra (R$ por unidade do serviço);
 *  - a frente de execução (etapa) escolhe o serviço do orçamento e a quantidade dela consome o saldo
 *    (total − programado em frentes de execução); passar do total não bloqueia, vira alerta;
 *  - o contrato do empreiteiro puxa os serviços do orçamento com o valor de mão de obra já preenchido (pode mudar);
 *  - materiais: por serviço (coeficiente: quanto gasta por unidade do serviço, já com perda) ou direto na frente (quantidade total);
 *    necessário × comprado (pedidos aprovados da frente) × recebido × consumido (teórico pelos diários e real pelas saídas do estoque).
 */
const orcAtivo_ = x => !/^n/i.test(String(x.ativo));
const ORC_CTR_CONTA_ = ['Vigente', 'Encerrado', 'Rescindido'];       // contrato que conta como contratado
const ORC_PED_COMPRADO_ = ['Aprovado', 'Concluído'];
const ORC_PED_FORA_ = ['Cancelado'];

function orcFrentes_(ctx) { return obraTab_(ctx, 'Frentes').all(); }
/* aceita o código (FR01) ou o nome da frente; devolve o registro */
function orcFrente_(ctx, v) {
  const s = String(v || '').trim();
  if (!s) return null;
  return orcFrentes_(ctx).find(f => String(f.codigo) === s) || orcFrentes_(ctx).find(f => norm_(f.nome) === norm_(s)) || null;
}
function orcItemAchar_(ctx, id) {
  const i = obraTab_(ctx, 'OrcItens').all().find(x => String(x.id) === String(id) && orcAtivo_(x));
  if (!i) throw new Error('Serviço do orçamento não encontrado (atualize a tela).');
  return i;
}
const orcChaveMat_ = m => m.material_cod ? String(m.material_cod) : '#' + norm_(m.descricao);
/* número digitado como no Brasil: "2.500" é dois mil e quinhentos (ponto de milhar), "1,05" e "49.6" continuam valendo */
function orcNum_(v) {
  if (typeof v === 'number') return v;
  const s = String(v == null ? '' : v).trim().replace(/[R$\s]/g, '');
  return /^-?\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '')) : num_(s);
}

/* ---------- cálculo: orçado × programado × executado × contratado, materiais e alertas ---------- */
function orcCalc_(ctx, calc) {
  calc = calc || calcExec_(ctx);
  const frentes = orcFrentes_(ctx), porNome = {};
  frentes.forEach(f => { porNome[norm_(f.nome)] = String(f.codigo); });
  const codDe = nome => porNome[norm_(nome)] || '';
  const itens = obraTab_(ctx, 'OrcItens').all().filter(orcAtivo_);
  const mats = obraTab_(ctx, 'OrcMateriais').all().filter(orcAtivo_);

  // execução: frentes de execução cujos serviços estão ligados ao orçamento
  const exe = {};
  calc.etapas.forEach(e => e.itens.forEach(i => {
    if (!i.orc_item) return;
    const x = exe[i.orc_item] = exe[i.orc_item] || { programado: 0, executado: 0, frentes: [] };
    x.programado += num_(i.prevista); x.executado += num_(i.executado);
    x.frentes.push({ etapa: e.codigo, nome: e.nome, local: e.local, prevista: num_(i.prevista), executado: num_(i.executado), ativa: e.ativa });
  }));
  // contratos: planilhas ligadas ao orçamento
  const stCtr = {}, ctr = {};
  obraTab_(ctx, 'Contratos').all().forEach(c => { stCtr[c.id] = c; });
  ctrAtivos_(ctx).forEach(ci => {
    const c = stCtr[ci.contrato];
    if (!ci.orc_item || !c || ORC_CTR_CONTA_.indexOf(c.status) < 0) return;
    const x = ctr[ci.orc_item] = ctr[ci.orc_item] || { qtd: 0, valor: 0, contratos: [] };
    x.qtd += num_(ci.qtd); x.valor += num_(ci.qtd) * num_(ci.unitario);
    x.contratos.push({ id: c.id, rotulo: ctrRotulo_(c), empreiteiro: c.empreiteiro_nome, qtd: num_(ci.qtd), unitario: num_(ci.unitario) });
  });

  // compras: pedidos da frente (o recebimento pode apontar outra frente)
  const peds = obraTab_(ctx, 'Pedidos').all(), pedPor = {};
  peds.forEach(p => { pedPor[p.numero] = p; });
  const comp = {};   // frente → chave do material → { comprado, em_compra, recebido, saidas, descricao, unidade, material_cod }
  const valorFrente = {};
  const mt = (fr, i) => {
    const f = comp[fr] = comp[fr] || {}, k = orcChaveMat_(i);
    return f[k] = f[k] || { chave: k, material_cod: i.material_cod || '', descricao: i.descricao, unidade: i.unidade, comprado: 0, em_compra: 0, recebido: 0, saidas: 0 };
  };
  obraTab_(ctx, 'Itens').all().forEach(i => {
    const p = pedPor[i.pedido], fr = p && codDe(p.frente);
    if (!fr || ORC_PED_FORA_.indexOf(p.status) >= 0) return;
    const x = mt(fr, i);
    if (ORC_PED_COMPRADO_.indexOf(p.status) >= 0) x.comprado += p.entrega === 'Recebido' ? num_(i.qtd_recebida) : num_(i.qtd);
    else x.em_compra += num_(i.qtd);
  });
  peds.forEach(p => {
    const fr = codDe(p.frente);
    if (fr && ORC_PED_COMPRADO_.indexOf(p.status) >= 0) valorFrente[fr] = (valorFrente[fr] || 0) + num_(p.valor_total);
  });
  obraTab_(ctx, 'Recebimentos').all().forEach(r => {
    const p = pedPor[r.pedido], fr = codDe(r.frente || (p && p.frente));
    if (fr) mt(fr, r).recebido += num_(r.qtd);
  });
  obraTab_(ctx, 'Estoque').all().forEach(m => {
    if (m.tipo !== 'Saída') return;
    const fr = codDe(m.frente);
    if (fr) mt(fr, m).saidas += -num_(m.qtd);
  });

  const cadMat = {};
  obraTab_(ctx, 'Materiais').all().forEach(m => { cadMat[String(m.codigo)] = m; });
  const alertasGeral = [];
  const out = frentes.map(f => {
    const cod = String(f.codigo), alertas = [];
    const its = itens.filter(i => String(i.frente) === cod).sort((a, b) => num_(a.ordem) - num_(b.ordem)).map(i => {
      const q = num_(i.qtd), um = num_(i.unit_material), uo = num_(i.unit_mo), e = exe[i.id] || { programado: 0, executado: 0, frentes: [] }, c = ctr[i.id] || { qtd: 0, valor: 0, contratos: [] };
      const r = {
        id: i.id, frente: cod, ordem: num_(i.ordem), codigo: String(i.codigo || ''), grupo: i.grupo || '', servico_cod: String(i.servico_cod || ''), servico: i.servico, unidade: i.unidade, obs: i.obs || '',
        qtd: q, unit_material: um, unit_mo: uo, unit_total: r2_(um + uo), v_material: r2_(q * um), v_mo: r2_(q * uo), v_total: r2_(q * (um + uo)),
        programado: r2_(e.programado), executado: r2_(e.executado), a_distribuir: r2_(q - e.programado), saldo_exec: r2_(Math.max(0, q - e.executado)),
        pct_exec: q ? r2_(e.executado / q * 100) : 0, pct_prog: q ? r2_(e.programado / q * 100) : 0, v_exec: r2_(Math.min(e.executado, q) * (um + uo)),
        contratado: r2_(c.qtd), contratado_valor: r2_(c.valor), a_contratar: r2_(q - c.qtd), contratos: c.contratos, frentes_exec: e.frentes,
        dif_mo: c.qtd ? r2_(c.valor - c.qtd * uo) : 0
      };
      if (e.programado > q + 0.0001) alertas.push({ tipo: 'programado', item: i.id, texto: i.servico + ': programado ' + nfmt_(e.programado) + ' de ' + nfmt_(q) + ' ' + i.unidade + ' do orçamento (' + nfmt_(e.programado - q) + ' acima)' });
      if (e.executado > q + 0.0001) alertas.push({ tipo: 'executado', item: i.id, texto: i.servico + ': executado ' + nfmt_(e.executado) + ' de ' + nfmt_(q) + ' ' + i.unidade + ' — acima do orçamento' });
      if (c.qtd > q + 0.0001) alertas.push({ tipo: 'contratado', item: i.id, texto: i.servico + ': contratado ' + nfmt_(c.qtd) + ' de ' + nfmt_(q) + ' ' + i.unidade + ' do orçamento' });
      return r;
    });
    const itPor = {};
    its.forEach(i => { itPor[i.id] = i; });

    // materiais: necessário (orçamento) × compras × consumo
    const lin = {};
    const linDe = m => {
      const k = orcChaveMat_(m), cm = m.material_cod ? cadMat[String(m.material_cod)] : null;
      return lin[k] = lin[k] || { chave: k, material_cod: String(m.material_cod || ''), descricao: cm ? cm.descricao : m.descricao, unidade: (cm && cm.unidade) || m.unidade || '', necessario: 0, consumo_teorico: 0, tem_teorico: false, orcado: false, composicao: [] };
    };
    mats.filter(m => String(m.frente) === cod).forEach(m => {
      const l = linDe(m), it = m.orc_item ? itPor[m.orc_item] : null;
      l.orcado = true;
      if (m.orc_item && !it) return;                                  // serviço do orçamento removido
      if (it) {
        const coef = num_(m.coef);
        l.necessario += it.qtd * coef; l.consumo_teorico += it.executado * coef; l.tem_teorico = true;
        l.composicao.push({ id: m.id, orc_item: it.id, servico: it.servico, unidade_srv: it.unidade, coef: coef, necessario: r2_(it.qtd * coef), obs: m.obs || '' });
      } else {
        l.necessario += num_(m.qtd);
        l.composicao.push({ id: m.id, orc_item: '', servico: '', qtd: num_(m.qtd), necessario: r2_(num_(m.qtd)), obs: m.obs || '' });
      }
    });
    Object.keys(comp[cod] || {}).forEach(k => {
      const c = comp[cod][k], l = lin[k] || linDe(c);
      l.comprado = r2_(c.comprado); l.em_compra = r2_(c.em_compra); l.recebido = r2_(c.recebido); l.consumo_real = r2_(c.saidas);
    });
    const materiais = Object.keys(lin).map(k => {
      const l = lin[k];
      ['comprado', 'em_compra', 'recebido', 'consumo_real'].forEach(x => { l[x] = r2_(l[x] || 0); });
      l.necessario = r2_(l.necessario); l.consumo_teorico = l.tem_teorico ? r2_(l.consumo_teorico) : null;
      l.falta_comprar = r2_(Math.max(0, l.necessario - l.comprado - l.em_compra));
      l.pct_comprado = l.necessario ? r2_(Math.min(100, l.comprado / l.necessario * 100)) : 0;
      l.situacao = !l.orcado ? 'fora' : l.falta_comprar > 0.0001 ? (l.comprado + l.em_compra > 0 ? 'parcial' : 'comprar') : l.comprado >= l.necessario - 0.0001 ? 'ok' : 'em_compra';
      if (l.orcado && l.falta_comprar > 0.0001) alertas.push({ tipo: 'comprar', material: k, texto: 'Falta comprar ' + nfmt_(l.falta_comprar) + ' ' + l.unidade + ' de ' + l.descricao + (l.comprado + l.em_compra > 0 ? ' (' + nfmt_(l.comprado + l.em_compra) + ' de ' + nfmt_(l.necessario) + ' já comprado/em compra)' : '') });
      // material comprado bem abaixo do que o executado já consumiu (pela composição) = falta na obra
      if (l.tem_teorico && l.consumo_teorico > l.recebido + 0.0001 && l.necessario > 0) alertas.push({ tipo: 'consumo', material: k, texto: l.descricao + ': o executado já consome ' + nfmt_(l.consumo_teorico) + ' ' + l.unidade + ' (pela composição), mas só ' + nfmt_(l.recebido) + ' chegaram para esta frente' });
      return l;
    }).sort((a, b) => (a.orcado === b.orcado ? 0 : a.orcado ? -1 : 1) || String(a.descricao).localeCompare(String(b.descricao)));

    const vm = r2_(its.reduce((t, i) => t + i.v_material, 0)), vo = r2_(its.reduce((t, i) => t + i.v_mo, 0)), vt = r2_(vm + vo), ve = r2_(its.reduce((t, i) => t + i.v_exec, 0));
    const pctQtd = its.length ? r2_(its.reduce((t, i) => t + Math.min(100, i.pct_exec), 0) / its.length) : 0;
    const res = {
      v_material: vm, v_mo: vo, v_total: vt, v_exec: ve,
      pct_exec: vt > 0 ? r2_(ve / vt * 100) : pctQtd,            // com valores: ponderado pelo R$; sem valores: média dos serviços
      mo_contratado: r2_(its.reduce((t, i) => t + i.contratado_valor, 0)), mo_orcado_contratado: r2_(its.reduce((t, i) => t + i.contratado * i.unit_mo, 0)),
      material_comprado: r2_(valorFrente[cod] || 0),
      servicos: its.length, materiais: materiais.filter(m => m.orcado).length, falta_comprar: materiais.filter(m => m.situacao === 'comprar' || m.situacao === 'parcial').length
    };
    alertas.forEach(a => alertasGeral.push(Object.assign({ frente: cod, frente_nome: f.nome }, a)));
    return { codigo: cod, nome: f.nome, descricao: f.descricao || '', ativa: !/^n/i.test(String(f.ativa)), itens: its, materiais: materiais, resumo: res, alertas: alertas };
  });
  const soma = k => r2_(out.reduce((t, f) => t + num_(f.resumo[k]), 0));
  const vt = soma('v_total'), ve = soma('v_exec');
  const comItens = out.filter(f => f.itens.length);
  return {
    frentes: out, alertas: alertasGeral,
    resumo: {
      v_material: soma('v_material'), v_mo: soma('v_mo'), v_total: vt, v_exec: ve, mo_contratado: soma('mo_contratado'), material_comprado: soma('material_comprado'),
      pct_exec: vt > 0 ? r2_(ve / vt * 100) : comItens.length ? r2_(comItens.reduce((t, f) => t + f.resumo.pct_exec, 0) / comItens.length) : 0,
      frentes: comItens.length, servicos: soma('servicos'), falta_comprar: soma('falta_comprar')
    }
  };
}

/* o que as frentes de execução precisam (sem preços): serviços do orçamento e quanto ainda falta distribuir */
function orcParaFrentes_(ctx, calc) {
  const itens = obraTab_(ctx, 'OrcItens').all().filter(orcAtivo_);
  if (!itens.length) return [];
  return orcCalc_(ctx, calc).frentes.filter(f => f.itens.length).map(f => ({
    codigo: f.codigo, nome: f.nome, ativa: f.ativa,
    itens: f.itens.map(i => ({ id: i.id, codigo: i.codigo, grupo: i.grupo, servico_cod: i.servico_cod, servico: i.servico, unidade: i.unidade, qtd: i.qtd, programado: i.programado, executado: i.executado, a_distribuir: i.a_distribuir }))
  }));
}

/* ---------- rotas de leitura ---------- */
function orcDados_(q, ctx) {
  const c = orcCalc_(ctx);
  return Object.assign(c, {
    pode_gerir: pode_(ctx, 'orc_gerir'),
    catalogo: garantirCatalogo_().all().filter(s => !/^n/i.test(String(s.ativo))).map(s => ({ codigo: s.codigo, grupo: s.grupo, servico: s.servico, unidade: s.unidade })),
    materiais_cad: obraTab_(ctx, 'Materiais').all().filter(m => !/^n/i.test(String(m.ativo))).map(m => ({ codigo: m.codigo, descricao: m.descricao, unidade: m.unidade, categoria: m.categoria })),
    obra: { nome: ctx.obra.nome, sigla: ctx.obra.sigla }
  });
}
/* para a planilha do contrato: serviços do orçamento com o valor de mão de obra de referência e quanto falta contratar */
function orcParaContrato_(q, ctx) {
  return orcCalc_(ctx).frentes.filter(f => f.itens.length).map(f => ({
    codigo: f.codigo, nome: f.nome,
    itens: f.itens.map(i => ({ id: i.id, codigo: i.codigo, grupo: i.grupo, servico_cod: i.servico_cod, servico: i.servico, unidade: i.unidade, qtd: i.qtd, unit_mo: i.unit_mo, contratado: i.contratado, a_contratar: i.a_contratar }))
  }));
}

/* ---------- gravação ---------- */
function orcFrenteSalvar_(q, ctx) {
  const T = obraTab_(ctx, 'Frentes'), nome = String(q.nome || '').trim();
  if (!nome) throw new Error('Informe o nome da frente geral (ex: Rede de Esgoto).');
  let f = q.codigo ? T.all().find(x => String(x.codigo) === String(q.codigo)) : null;
  if (q.codigo && !f) throw new Error('Frente não encontrada.');
  if (T.all().some(x => x !== f && norm_(x.nome) === norm_(nome))) throw new Error('Já existe uma frente com esse nome.');
  const nova = !f, antes = f ? f.nome : '';
  if (nova) f = { codigo: T.proxCodigo('codigo', 'FR', 2), ativa: 'Sim' };
  f.nome = nome; f.descricao = String(q.descricao || '').trim().slice(0, 300);
  if (q.ativa !== undefined) f.ativa = q.ativa ? 'Sim' : 'Não';
  if (nova) T.insert(f); else T.update(f);
  // pedidos, estoque e frentes de execução guardam o nome: acompanham a troca de nome
  if (!nova && norm_(antes) !== norm_(nome)) {
    [['Pedidos', 'frente'], ['Estoque', 'frente'], ['Etapas', 'frente'], ['Recebimentos', 'frente']].forEach(([tab, k]) => {
      const X = obraTab_(ctx, tab);
      X.all().filter(r => norm_(r[k]) === norm_(antes)).forEach(r => { r[k] = nome; X.update(r); });
    });
  }
  log_(ctx, nova ? 'orc_frente_criar' : 'orc_frente_editar', f.codigo + ' ' + nome);
  return { msg: nova ? 'Frente geral ' + nome + ' criada (' + f.codigo + ').' : 'Frente salva.', codigo: f.codigo };
}

/* inclui/atualiza vários serviços de uma frente (os que não vierem continuam como estão) */
function orcItensSalvar_(q, ctx) {
  const f = orcFrente_(ctx, q.frente);
  if (!f) throw new Error('Escolha a frente geral.');
  const T = obraTab_(ctx, 'OrcItens'), cat = garantirCatalogo_().all(), atuais = T.all().filter(i => String(i.frente) === String(f.codigo) && orcAtivo_(i));
  let ordem = atuais.reduce((m, i) => Math.max(m, num_(i.ordem)), 0);
  const novos = [], mudados = [];
  [].concat(q.itens || []).forEach(x => {
    if (!x) return;
    const nome = String(x.servico || '').trim();
    if (!nome && !num_(x.qtd) && !x.id) return;
    const sc = x.servico_cod ? cat.find(s => String(s.codigo) === String(x.servico_cod)) : cat.find(s => norm_(s.servico) === norm_(nome));
    const servico = nome || (sc ? sc.servico : ''), unidade = String(x.unidade || '').trim() || (sc ? sc.unidade : '');
    if (!servico) throw new Error('Informe o serviço de cada linha.');
    if (!unidade) throw new Error('Informe a unidade de ' + servico + '.');
    const qtd = orcNum_(x.qtd), um = orcNum_(x.unit_material), uo = orcNum_(x.unit_mo);
    if (!(qtd > 0)) throw new Error('Informe a quantidade total de ' + servico + '.');
    if (um < 0 || uo < 0) throw new Error('Valor negativo em ' + servico + '.');
    const reg = {
      codigo: String(x.codigo || '').trim().slice(0, 30), grupo: String(x.grupo || (sc ? sc.grupo : '')).trim().slice(0, 120), servico_cod: sc ? sc.codigo : '', servico: servico.slice(0, 200),
      unidade: unidade.slice(0, 20), qtd: qtd, unit_material: um, unit_mo: uo, obs: String(x.obs || '').trim().slice(0, 300), atualizado_em: new Date()
    };
    if (x.id) {
      const ex = atuais.find(i => String(i.id) === String(x.id));
      if (!ex) throw new Error('Serviço ' + servico + ' não pertence a esta frente.');
      Object.assign(ex, reg); T.update(ex); mudados.push(ex);
    } else {
      if (atuais.concat(novos).some(i => norm_(i.servico) === norm_(servico) && norm_(i.codigo) === norm_(reg.codigo))) throw new Error(servico + ' já está no orçamento desta frente.');
      novos.push(Object.assign({ id: 'OI-' + Utilities.getUuid().slice(0, 6), frente: f.codigo, ordem: ++ordem, ativo: 'Sim', criado_em: new Date(), criado_por: ctx.u.nome }, reg));
    }
  });
  if (!novos.length && !mudados.length) throw new Error('Nada para salvar.');
  T.insertMany(novos);
  log_(ctx, 'orc_itens', f.codigo + ' ' + f.nome + ' · ' + novos.length + ' novo(s), ' + mudados.length + ' alterado(s)');
  return { msg: [novos.length ? plural_(novos.length, 'serviço incluído', 'serviços incluídos') : '', mudados.length ? plural_(mudados.length, 'serviço atualizado', 'serviços atualizados') : ''].filter(Boolean).join(' · ') + ' em ' + f.nome + '.', ids: novos.map(i => i.id) };
}
function plural_(n, a, b) { return n + ' ' + (n === 1 ? a : b); }

function orcItemRemover_(q, ctx) {
  const T = obraTab_(ctx, 'OrcItens'), i = orcItemAchar_(ctx, q.id);
  const usoExec = obraTab_(ctx, 'EtapaItens').all().some(x => String(x.orc_item) === String(i.id) && orcAtivo_(x));
  if (usoExec) throw new Error(i.servico + ' já está em uma frente de execução: ajuste a quantidade em vez de remover.');
  const usoCtr = ctrAtivos_(ctx).some(x => String(x.orc_item) === String(i.id));
  if (usoCtr) throw new Error(i.servico + ' está na planilha de um contrato: tire de lá primeiro.');
  i.ativo = 'Não'; i.atualizado_em = new Date(); T.update(i);
  const M = obraTab_(ctx, 'OrcMateriais');
  M.all().filter(m => String(m.orc_item) === String(i.id) && orcAtivo_(m)).forEach(m => { m.ativo = 'Não'; M.update(m); });
  log_(ctx, 'orc_item_remover', i.id + ' ' + i.servico);
  return { msg: i.servico + ' saiu do orçamento.' };
}

function orcMaterialSalvar_(q, ctx) {
  const M = obraTab_(ctx, 'OrcMateriais');
  let it = null, f = null;
  if (q.orc_item) { it = orcItemAchar_(ctx, q.orc_item); f = orcFrente_(ctx, it.frente); }
  else f = orcFrente_(ctx, q.frente);
  if (!f) throw new Error('Escolha a frente geral.');
  const cad = q.material_cod ? obraTab_(ctx, 'Materiais').all().find(m => String(m.codigo) === String(q.material_cod)) : obraTab_(ctx, 'Materiais').all().find(m => norm_(m.descricao) === norm_(q.descricao));
  const desc = cad ? cad.descricao : String(q.descricao || '').trim(), un = cad ? (cad.unidade || String(q.unidade || '').trim()) : String(q.unidade || '').trim();
  if (!desc) throw new Error('Escolha o material.');
  if (!un) throw new Error('Informe a unidade de ' + desc + '.');
  const coef = orcNum_(q.coef), qtd = orcNum_(q.qtd);
  if (it && !(coef > 0)) throw new Error('Informe quanto de ' + desc + ' gasta por ' + it.unidade + ' de ' + it.servico + ' (ex: 1,05 com 5% de perda).');
  if (!it && !(qtd > 0)) throw new Error('Informe a quantidade total de ' + desc + ' para a frente.');
  let m = q.id ? M.all().find(x => String(x.id) === String(q.id) && orcAtivo_(x)) : null;
  if (q.id && !m) throw new Error('Material não encontrado no orçamento.');
  const chave = orcChaveMat_({ material_cod: cad ? cad.codigo : '', descricao: desc });
  if (M.all().some(x => x !== m && orcAtivo_(x) && String(x.frente) === String(f.codigo) && String(x.orc_item || '') === String(it ? it.id : '') && orcChaveMat_(x) === chave))
    throw new Error(desc + ' já está ' + (it ? 'na composição de ' + it.servico : 'nesta frente') + '.');
  const nova = !m;
  if (nova) m = { id: 'OM-' + Utilities.getUuid().slice(0, 6), ativo: 'Sim' };
  Object.assign(m, { frente: f.codigo, orc_item: it ? it.id : '', material_cod: cad ? cad.codigo : '', descricao: desc.slice(0, 200), unidade: un.slice(0, 20), coef: it ? coef : '', qtd: it ? '' : qtd, obs: String(q.obs || '').trim().slice(0, 300) });
  if (nova) M.insert(m); else M.update(m);
  const total = it ? r2_(num_(it.qtd) * coef) : qtd;
  return { msg: desc + (it ? ': ' + nfmt_(coef) + ' ' + un + ' por ' + it.unidade + ' → ' + nfmt_(total) + ' ' + un + ' para ' + nfmt_(it.qtd) + ' ' + it.unidade : ': ' + nfmt_(qtd) + ' ' + un + ' na frente') + '.', id: m.id };
}
function orcMaterialRemover_(q, ctx) {
  const M = obraTab_(ctx, 'OrcMateriais'), m = M.all().find(x => String(x.id) === String(q.id) && orcAtivo_(x));
  if (!m) throw new Error('Material não encontrado no orçamento.');
  m.ativo = 'Não'; M.update(m);
  return { msg: m.descricao + ' saiu do orçamento.' };
}

/* ---------- perfis: o dono (admin) já tem tudo; as outras pessoas recebem por obra na tela de acessos ---------- */
function atualizarPerfisOrc_() {
  const C = central_('Config');
  if (C.all().some(r => r.chave === 'PERFIS_ORC_V1')) return;
  const P = central_('Perfis'), A = central_('Acessos'), novas = ['orc_ver', 'orc_gerir'];
  const une = txt => { const s = String(txt || '').split(',').map(x => x.trim()).filter(Boolean); novas.forEach(e => { if (s.indexOf(e) < 0) s.push(e); }); return s.join(','); };
  const p = P.all().find(x => norm_(x.perfil) === 'admin');
  if (p) { p.permissoes = une(p.permissoes); P.update(p); }
  A.all().filter(a => norm_(a.perfil) === 'admin').forEach(a => { a.permissoes = une(a.permissoes); A.update(a); });
  C.insert({ chave: 'PERFIS_ORC_V1', valor: 'Sim', descricao: 'Ajuste automático: permissões do Orçamento da obra (Admin tem todas; as demais pessoas são liberadas por obra)' });
}
