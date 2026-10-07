/**
 * Fluxo do pedido. Três campos controlam a situação:
 *  status : Aberto → Em cotação → Aguardando aprovação → Aprovado → Concluído  (ou Cancelado)
 *  entrega: Bloqueada (direto, antes de pagar) → Aguardando liberação → Entrega liberada → Recebido parcial → Recebido
 *  fin    : Aguardando pagamento (direto) | Aguardando NF → A pagar (faturado) → Pago
 *
 * Regras:
 *  - Definir a compra exige o mínimo de orçamentos de fornecedores diferentes (Config); exceção só com justificativa de quem aprova.
 *  - Faturamento direto: aprovado → financeiro paga → libera entrega → recebe.
 *  - Faturado (ex: 30 dias): aprovado → libera entrega → recebe; quando chega a NF → financeiro (A pagar).
 *  - Concluído = tudo recebido + pago.
 */
const ST_ABERTOS = ['Aberto', 'Em cotação'];

function situacao_(p) {
  if (p.status !== 'Aprovado') return p.status || 'Aberto';
  if (p.fin === 'Aguardando pagamento') return 'Aguardando pagamento';
  if (p.entrega === 'Aguardando liberação') return 'Liberar entrega';
  if (p.entrega === 'Entrega liberada' || p.entrega === 'Recebido parcial') return p.entrega;
  if (p.fin === 'A pagar') return 'A pagar';
  if (p.fin === 'Aguardando NF') return 'Aguardando NF';
  return p.entrega || 'Aprovado';
}

function minOrc_(valor) {
  const c = config_();
  let min = num_(c.MIN_ORCAMENTOS) || 1;
  String(c.REGRAS_ORCAMENTO || '').split(/[;\n]/).forEach(f => {
    const a = f.split(':');
    if (a.length === 2 && num_(valor) >= num_(a[0]) && num_(a[1]) > min) min = num_(a[1]);
  });
  return min;
}

function hist_(p, ctx, txt) {
  p.historico = agora_() + ' · ' + ctx.u.nome + ' — ' + txt + (p.historico ? '\n' + p.historico : '');
}
function salvar_(ctx, p) {
  p.atualizado_em = new Date();
  obraTab_(ctx, 'Pedidos').update(p);
}
function achar_(ctx, numero) {
  const p = obraTab_(ctx, 'Pedidos').all().find(x => String(x.numero) === String(numero));
  if (!p) throw new Error('Pedido ' + numero + ' não encontrado nesta obra.');
  return p;
}
function veTodos_(ctx) {
  return pode_(ctx, ['pedido_ver_todos', 'financeiro', 'compras_cotar', 'compras_definir', 'compras_aprovar', 'compras_liberar', 'pedido_receber']);
}
function itensDe_(ctx, numero) {
  return obraTab_(ctx, 'Itens').all().filter(i => String(i.pedido) === String(numero)).sort((a, b) => a.item - b.item);
}
function fechar_(ctx, p) {
  if (p.status === 'Aprovado' && p.entrega === 'Recebido' && p.fin === 'Pago') {
    p.status = 'Concluído';
    hist_(p, ctx, 'Pedido concluído (recebido e pago)');
  }
}

/* ---------- leitura ---------- */
function obraDados_(q, ctx) {
  const c = config_();
  return {
    obra: { id: String(ctx.obra.id), nome: ctx.obra.nome, sigla: ctx.obra.sigla, endereco: ctx.obra.endereco },
    permissoes: ctx.admin ? Object.keys(PERMISSOES) : ctx.perms,
    materiais: obraTab_(ctx, 'Materiais').all().map(pub_),
    fornecedores: obraTab_(ctx, 'Fornecedores').all().map(pub_),
    frentes: obraTab_(ctx, 'Frentes').all().map(pub_),
    unidades: central_('Unidades').all().map(r => String(r.unidade).trim()).filter(Boolean),
    regras: { min: num_(c.MIN_ORCAMENTOS) || 1, faixas: String(c.REGRAS_ORCAMENTO || ''), prazo: num_(c.PRAZO_FATURADO_PADRAO) || 30 }
  };
}

function pedidosListar_(q, ctx) {
  const todos = veTodos_(ctx);
  const its = {}, orcs = {};
  obraTab_(ctx, 'Itens').all().forEach(i => { (its[i.pedido] = its[i.pedido] || []).push(i); });
  obraTab_(ctx, 'Orcamentos').all().forEach(o => { (orcs[o.pedido] = orcs[o.pedido] || {})[o.fornecedor_cod || o.fornecedor] = 1; });
  const ps = obraTab_(ctx, 'Pedidos').all().filter(p => todos || String(p.solicitante_id) === String(ctx.u.id));
  return {
    todos: todos,
    pedidos: ps.slice(-2000).reverse().map(p => {
      const o = pub_(p);
      delete o.historico;
      o.situacao = situacao_(p);
      o.n_orc = Object.keys(orcs[p.numero] || {}).length;
      o.itens = (its[p.numero] || []).sort((a, b) => a.item - b.item)
        .map(i => ({ item: i.item, descricao: i.descricao, unidade: i.unidade, qtd: i.qtd, qtd_recebida: i.qtd_recebida || 0 }));
      return o;
    })
  };
}

function pedidoDetalhe_(q, ctx) {
  const p = achar_(ctx, q.numero);
  if (!veTodos_(ctx) && String(p.solicitante_id) !== String(ctx.u.id)) throw new Error('Você só pode ver os seus pedidos.');
  const o = pub_(p);
  o.situacao = situacao_(p);
  const orcs = obraTab_(ctx, 'Orcamentos').all().filter(x => x.pedido === p.numero);
  return {
    pedido: o,
    itens: itensDe_(ctx, p.numero).map(pub_),
    orcamentos: orcs.map(pub_),
    fornecedores_orcados: Object.keys(orcs.reduce((a, x) => { a[x.fornecedor_cod || x.fornecedor] = 1; return a; }, {})).length,
    minimo: minOrc_(p.valor_total || Math.max.apply(null, [0].concat(orcs.map(x => num_(x.valor))))),
    arquivos: obraTab_(ctx, 'Arquivos').all().filter(x => x.pedido === p.numero).map(pub_).reverse(),
    recebimentos: obraTab_(ctx, 'Recebimentos').all().filter(x => x.pedido === p.numero).map(pub_).reverse()
  };
}

/* ---------- abertura ---------- */
function pedidoCriar_(q, ctx) {
  const itens = (q.itens || []).filter(i => String(i.descricao || '').trim() && num_(i.qtd) > 0);
  if (!itens.length) throw new Error('Adicione pelo menos um material com quantidade.');
  const T = obraTab_(ctx, 'Pedidos');
  const numero = T.proxCodigo('numero', ctx.obra.sigla + '-', 4);
  const p = {
    numero: numero, criado_em: new Date(), solicitante_id: ctx.u.id, solicitante: ctx.u.nome,
    frente: q.frente || '', prioridade: q.prioridade || 'Normal', necessidade: dataDe_(q.necessidade),
    observacoes: String(q.observacoes || '').trim(), status: 'Aberto', entrega: '', fin: '', atualizado_em: new Date()
  };
  hist_(p, ctx, 'Pedido aberto com ' + itens.length + ' item(ns)');
  T.insert(p);
  obraTab_(ctx, 'Itens').insertMany(itens.map((i, k) => ({
    pedido: numero, item: k + 1, material_cod: i.material_cod || '', descricao: String(i.descricao).trim(),
    unidade: i.unidade || '', qtd: num_(i.qtd), qtd_recebida: 0, valor_unit: ''
  })));
  log_(ctx, 'pedido_criar', numero);
  return { msg: 'Pedido ' + numero + ' aberto.', numero: numero };
}

/* ---------- cotação ---------- */
function pedidoCotar_(q, ctx) {
  const nums = [].concat(q.numeros || []).map(String);
  const ps = obraTab_(ctx, 'Pedidos').all().filter(p => nums.indexOf(String(p.numero)) >= 0);
  if (!ps.length) throw new Error('Nenhum pedido selecionado.');
  ps.forEach(p => {
    if (ST_ABERTOS.indexOf(p.status) < 0) throw new Error('Pedido ' + p.numero + ' está em "' + situacao_(p) + '": não dá para pedir cotação.');
  });
  const F = obraTab_(ctx, 'Fornecedores'), cods = [].concat(q.fornecedores || []).map(String);
  const fs = F.all().filter(f => cods.indexOf(String(f.codigo)) >= 0);
  if (!fs.length) throw new Error('Escolha ao menos um fornecedor.');
  const emails = q.emails || {}, ok = [], sem = [];
  fs.forEach(f => {
    const novo = String(emails[f.codigo] || '').trim();
    if (novo && !f.email) { f.email = novo; F.update(f); }
    if (!f.email) { sem.push(f.nome); return; }
    emailCotacao_(ctx, f, ps, q);
    ok.push(f.nome);
  });
  if (!ok.length) throw new Error('Nenhum dos fornecedores escolhidos tem e-mail cadastrado.');
  ps.forEach(p => {
    pastaPedido_(ctx, p);
    p.status = 'Em cotação';
    p.cotado_a = (p.cotado_a ? p.cotado_a + ' | ' : '') + ok.join(', ') + ' (' + hoje_() + ')';
    hist_(p, ctx, 'Cotação enviada a ' + ok.join(', '));
    salvar_(ctx, p);
  });
  log_(ctx, 'pedido_cotar', nums.join(',') + ' → ' + ok.join(','));
  return { msg: 'Cotação enviada a ' + ok.join(', ') + '.' + (sem.length ? ' Sem e-mail (não enviado): ' + sem.join(', ') + '.' : '') + ' Os PDFs respondidos por e-mail entram sozinhos como orçamento.' };
}

function orcamentoSalvar_(q, ctx) {
  const p = achar_(ctx, q.pedido);
  if (ST_ABERTOS.indexOf(p.status) < 0) throw new Error('Orçamentos só podem ser registrados antes de definir a compra.');
  const O = obraTab_(ctx, 'Orcamentos');
  let o = q.id ? O.all().find(x => String(x.id) === String(q.id) && x.pedido === p.numero) : null;
  const f = obraTab_(ctx, 'Fornecedores').all().find(x => String(x.codigo) === String(q.fornecedor_cod));
  if (!f) throw new Error('Escolha o fornecedor do orçamento.');
  const novo = !o;
  if (novo) {
    if (!q.arquivo || !q.arquivo.b64) throw new Error('Anexe o PDF ou a foto do orçamento.');
    o = { id: Utilities.getUuid().slice(0, 8), pedido: p.numero, origem: 'manual', recebido_em: new Date(), registrado_por: ctx.u.nome };
  }
  o.fornecedor_cod = f.codigo;
  o.fornecedor = f.nome;
  o.valor = q.valor === '' || q.valor == null ? '' : num_(q.valor);
  o.prazo_entrega = String(q.prazo_entrega || '').trim();
  o.condicao = String(q.condicao || '').trim();
  if (q.arquivo && q.arquivo.b64) {
    const a = salvarArquivo_(ctx, p, 'ORC', q.arquivo, 'orçamento');
    o.arquivo_id = a.file_id;
    o.arquivo_url = a.url;
  }
  if (novo) O.insert(o); else O.update(o);
  if (p.status === 'Aberto') p.status = 'Em cotação';
  hist_(p, ctx, (novo ? 'Orçamento registrado: ' : 'Orçamento atualizado: ') + f.nome + (o.valor !== '' ? ' ' + brl_(o.valor) : ''));
  salvar_(ctx, p);
  return { msg: 'Orçamento de ' + f.nome + ' salvo.' };
}

function orcamentoExcluir_(q, ctx) {
  const p = achar_(ctx, q.pedido);
  if (ST_ABERTOS.indexOf(p.status) < 0) throw new Error('A compra já foi definida; não dá para excluir orçamentos.');
  const O = obraTab_(ctx, 'Orcamentos'), o = O.all().find(x => String(x.id) === String(q.id) && x.pedido === p.numero);
  if (!o) throw new Error('Orçamento não encontrado.');
  O.removeWhere(x => x === o);
  hist_(p, ctx, 'Orçamento excluído: ' + o.fornecedor + ' (o arquivo continua na pasta do Drive)');
  salvar_(ctx, p);
  return { msg: 'Orçamento excluído.' };
}

/* ---------- definição e aprovação ---------- */
function pedidoDefinir_(q, ctx) {
  const p = achar_(ctx, q.numero);
  if (ST_ABERTOS.indexOf(p.status) < 0) throw new Error('Pedido está em "' + situacao_(p) + '".');
  const orcs = obraTab_(ctx, 'Orcamentos').all().filter(x => x.pedido === p.numero);
  const o = orcs.find(x => String(x.id) === String(q.orcamento));
  if (!o) throw new Error('Escolha o orçamento vencedor.');
  const valor = num_(q.valor !== '' && q.valor != null ? q.valor : o.valor);
  if (!(valor > 0)) throw new Error('Informe o valor total da compra.');

  const nForn = Object.keys(orcs.reduce((a, x) => { a[x.fornecedor_cod || x.fornecedor] = 1; return a; }, {})).length;
  const min = minOrc_(valor);
  let exc = '';
  if (nForn < min) {
    exc = String(q.excecao || '').trim();
    if (!exc) throw new Error('Para ' + brl_(valor) + ' são necessários ' + min + ' orçamentos de fornecedores diferentes (há ' + nForn + '). Registre mais orçamentos ou justifique a exceção.');
    if (!pode_(ctx, 'compras_aprovar')) throw new Error('Só quem aprova compras pode liberar exceção à regra de orçamentos.');
  }

  const direto = q.condicao === 'Faturamento direto';
  p.fornecedor_cod = o.fornecedor_cod;
  p.fornecedor = o.fornecedor;
  p.valor_total = valor;
  p.condicao = direto ? 'Faturamento direto' : 'Faturado';
  p.prazo_fat = direto ? '' : (parseInt(q.prazo_fat, 10) || num_(config_().PRAZO_FATURADO_PADRAO) || 30);
  p.previsao = dataDe_(q.previsao);
  p.excecao_orc = exc ? exc + ' (' + ctx.u.nome + ', ' + hoje_() + ')' : '';
  const vals = q.valores || {};
  const I = obraTab_(ctx, 'Itens');
  itensDe_(ctx, p.numero).forEach(i => {
    if (vals[i.item] !== undefined && vals[i.item] !== '') { i.valor_unit = num_(vals[i.item]); I.update(i); }
  });
  p.status = 'Aguardando aprovação';
  hist_(p, ctx, 'Compra definida: ' + p.fornecedor + ' ' + brl_(valor) + ' · ' + p.condicao + (p.prazo_fat ? ' ' + p.prazo_fat + ' dias' : '') +
    (exc ? ' · EXCEÇÃO à regra de ' + min + ' orçamentos: ' + exc : ''));
  if (q.aprovar && pode_(ctx, 'compras_aprovar')) aprovar_(ctx, p);
  salvar_(ctx, p);
  log_(ctx, 'pedido_definir', p.numero + ' ' + p.fornecedor + ' ' + valor);
  return { msg: p.status === 'Aprovado' ? 'Compra definida e aprovada.' : 'Compra definida. Aguardando aprovação.' };
}

function aprovar_(ctx, p) {
  p.status = 'Aprovado';
  p.aprovado_por = ctx.u.nome;
  p.aprovado_em = new Date();
  if (p.condicao === 'Faturamento direto') {
    p.fin = 'Aguardando pagamento';
    p.entrega = 'Bloqueada';
    hist_(p, ctx, 'Compra aprovada → financeiro (faturamento direto: pagar antes de liberar a entrega)');
    avisarFinanceiro_(ctx, p, 'Pagamento antecipado (faturamento direto)');
  } else {
    p.fin = 'Aguardando NF';
    p.entrega = 'Aguardando liberação';
    hist_(p, ctx, 'Compra aprovada → pronta para liberar entrega (faturado ' + p.prazo_fat + ' dias)');
  }
}

function pedidoAprovar_(q, ctx) {
  const p = achar_(ctx, q.numero);
  if (p.status !== 'Aguardando aprovação') throw new Error('Pedido não está aguardando aprovação.');
  aprovar_(ctx, p);
  salvar_(ctx, p);
  log_(ctx, 'pedido_aprovar', p.numero);
  return { msg: 'Compra aprovada.' };
}

function pedidoDevolver_(q, ctx) {
  const p = achar_(ctx, q.numero);
  if (p.status !== 'Aguardando aprovação') throw new Error('Pedido não está aguardando aprovação.');
  const motivo = String(q.motivo || '').trim();
  if (!motivo) throw new Error('Informe o motivo.');
  ['fornecedor_cod', 'fornecedor', 'valor_total', 'condicao', 'prazo_fat', 'previsao', 'excecao_orc'].forEach(k => { p[k] = ''; });
  p.status = 'Em cotação';
  hist_(p, ctx, 'Devolvido para cotação: ' + motivo);
  salvar_(ctx, p);
  return { msg: 'Pedido voltou para cotação.' };
}

/* ---------- financeiro ---------- */
function pedidoPagar_(q, ctx) {
  const p = achar_(ctx, q.numero);
  if (p.status !== 'Aprovado' || ['Aguardando pagamento', 'A pagar'].indexOf(p.fin) < 0) throw new Error('Este pedido não está aguardando pagamento.');
  if (!q.comprovante || !q.comprovante.b64) throw new Error('Anexe o comprovante de pagamento.');
  const a = salvarArquivo_(ctx, p, 'COMPROVANTE', q.comprovante, 'financeiro');
  const antecipado = p.fin === 'Aguardando pagamento';
  p.fin = 'Pago';
  p.pago_em = dataDe_(q.data) || new Date();
  p.pago_por = ctx.u.nome;
  p.forma_pagto = String(q.forma || '').trim();
  if (antecipado) p.entrega = 'Aguardando liberação';
  hist_(p, ctx, 'Pagamento registrado' + (p.forma_pagto ? ' (' + p.forma_pagto + ')' : '') + (antecipado ? ' → compras pode liberar a entrega' : ''));
  fechar_(ctx, p);
  salvar_(ctx, p);
  if (antecipado && q.avisar !== false) {
    emailFornecedor_(ctx, p, 'Pagamento Size', 'Pagamento efetuado',
      'Prezados, o pagamento do pedido abaixo foi efetuado' + (p.forma_pagto ? ' via <b>' + h_(p.forma_pagto) + '</b>' : '') + '. Segue o comprovante em anexo.',
      [DriveApp.getFileById(a.file_id).getBlob()]);
  }
  log_(ctx, 'pedido_pagar', p.numero);
  return { msg: 'Pagamento registrado.' };
}

function registrarNF_(ctx, p, numero, data) {
  p.nf_numero = String(numero || '').trim() || p.nf_numero || 's/ nº';
  p.nf_em = dataDe_(data) || new Date();
  if (p.condicao === 'Faturado') {
    const v = new Date(p.nf_em.getTime());
    v.setDate(v.getDate() + (num_(p.prazo_fat) || 0));
    p.vencimento = v;
  }
  const encaminha = p.fin === 'Aguardando NF';
  if (encaminha) p.fin = 'A pagar';
  hist_(p, ctx, 'Nota fiscal ' + p.nf_numero + ' registrada' + (encaminha ? ' → financeiro (a pagar)' : ''));
  if (encaminha) avisarFinanceiro_(ctx, p, 'Nota fiscal recebida — vencimento ' + (p.vencimento ? Utilities.formatDate(p.vencimento, tz_(), 'dd/MM/yyyy') : '-'));
}

function pedidoNF_(q, ctx) {
  const p = achar_(ctx, q.numero);
  if (p.status !== 'Aprovado' && p.status !== 'Concluído') throw new Error('A nota fiscal só entra depois da compra aprovada.');
  if (!String(q.nf_numero || '').trim() && !(q.arquivo && q.arquivo.b64)) throw new Error('Informe o número da nota ou anexe o arquivo.');
  if (q.arquivo && q.arquivo.b64) salvarArquivo_(ctx, p, 'NF', q.arquivo, 'nota fiscal');
  registrarNF_(ctx, p, q.nf_numero, q.nf_data);
  salvar_(ctx, p);
  return { msg: 'Nota fiscal registrada.' + (p.fin === 'A pagar' ? ' Encaminhada ao financeiro.' : '') };
}

/* ---------- entrega e recebimento ---------- */
function pedidoLiberar_(q, ctx) {
  const p = achar_(ctx, q.numero);
  if (p.status === 'Aprovado' && p.entrega === 'Bloqueada') throw new Error('Faturamento direto: o financeiro precisa registrar o pagamento antes de liberar a entrega.');
  if (p.status !== 'Aprovado' || p.entrega !== 'Aguardando liberação') throw new Error('Pedido não está aguardando liberação de entrega.');
  p.entrega = 'Entrega liberada';
  p.liberado_em = new Date();
  if (q.previsao) p.previsao = dataDe_(q.previsao);
  hist_(p, ctx, 'Entrega liberada' + (p.previsao ? ' · previsão ' + Utilities.formatDate(p.previsao, tz_(), 'dd/MM/yyyy') : ''));
  salvar_(ctx, p);
  const ok = emailFornecedor_(ctx, p, 'Pedido Size', 'Entrega liberada',
    'Prezados, está <b>liberada a entrega</b> do pedido abaixo na obra <b>' + h_(ctx.obra.nome) + '</b>' +
    (ctx.obra.endereco ? ' (' + h_(ctx.obra.endereco) + ')' : '') + '.' +
    (p.previsao ? ' Data prevista: <b>' + Utilities.formatDate(p.previsao, tz_(), 'dd/MM/yyyy') + '</b>.' : '') +
    (q.msg ? '<br>' + h_(q.msg) : '') +
    (p.fin === 'Aguardando NF' ? '<br><b>Favor responder este e-mail anexando a nota fiscal.</b>' : ''));
  log_(ctx, 'pedido_liberar', p.numero);
  return { msg: 'Entrega liberada.' + (ok ? ' E-mail enviado a ' + p.fornecedor + '.' : ' Fornecedor sem e-mail: avise por telefone/WhatsApp.') };
}

function pedidoReceber_(q, ctx) {
  const p = achar_(ctx, q.numero);
  if (p.status !== 'Aprovado' || ['Entrega liberada', 'Recebido parcial'].indexOf(p.entrega) < 0) throw new Error('Este pedido não está liberado para recebimento.');
  const I = obraTab_(ctx, 'Itens'), its = itensDe_(ctx, p.numero), qs = q.itens || {};
  const recs = [], movs = [], quando = new Date();
  its.forEach(i => {
    const qtd = num_(qs[i.item]);
    if (!(qtd > 0)) return;
    const falta = num_(i.qtd) - num_(i.qtd_recebida);
    if (qtd > falta + 1e-9) throw new Error('Item ' + i.item + ' (' + i.descricao + '): recebendo ' + qtd + ', mas faltam só ' + falta + '.');
    i.qtd_recebida = num_(i.qtd_recebida) + qtd;
    I.update(i);
    const id = Utilities.getUuid().slice(0, 8);
    recs.push({ id: id, pedido: p.numero, item: i.item, material_cod: i.material_cod, descricao: i.descricao, qtd: qtd, unidade: i.unidade, data: quando, usuario: ctx.u.nome, nf: q.nf_numero || '', obs: q.obs || '' });
    movs.push({ id: id, data: quando, tipo: 'Entrada', material_cod: i.material_cod, descricao: i.descricao, unidade: i.unidade, qtd: qtd, pedido: p.numero, frente: p.frente, usuario: ctx.u.nome, obs: 'Recebimento ' + p.numero });
  });
  if (!recs.length && !q.encerrar) throw new Error('Informe a quantidade recebida de pelo menos um item.');
  obraTab_(ctx, 'Recebimentos').insertMany(recs);
  obraTab_(ctx, 'Estoque').insertMany(movs);
  if (q.foto && q.foto.b64) salvarArquivo_(ctx, p, 'FOTO', q.foto, 'recebimento');
  if (q.nf && q.nf.b64) salvarArquivo_(ctx, p, 'NF', q.nf, 'recebimento');
  if (String(q.nf_numero || '').trim() || (q.nf && q.nf.b64)) registrarNF_(ctx, p, q.nf_numero, q.nf_data);

  const completo = its.every(i => num_(i.qtd_recebida) >= num_(i.qtd) - 1e-9);
  const txt = recs.map(r => r.qtd + ' ' + r.unidade + ' ' + r.descricao).join('; ');
  if (completo || q.encerrar) {
    p.entrega = 'Recebido';
    p.recebido_em = quando;
    hist_(p, ctx, (completo ? 'Recebimento total' : 'Recebimento ENCERRADO com falta (' + String(q.obs || 'sem motivo') + ')') + (txt ? ': ' + txt : ''));
  } else {
    p.entrega = 'Recebido parcial';
    hist_(p, ctx, 'Recebimento parcial: ' + txt);
  }
  fechar_(ctx, p);
  salvar_(ctx, p);
  log_(ctx, 'pedido_receber', p.numero + ' ' + txt);
  return { msg: p.entrega === 'Recebido' ? 'Recebimento concluído.' : 'Recebimento parcial registrado.' };
}

function pedidoCancelar_(q, ctx) {
  const p = achar_(ctx, q.numero);
  const motivo = String(q.motivo || '').trim();
  if (!motivo) throw new Error('Informe o motivo do cancelamento.');
  if (p.status === 'Cancelado' || p.status === 'Concluído') throw new Error('Pedido já está ' + p.status.toLowerCase() + '.');
  if (p.status === 'Aprovado' && !ctx.admin) throw new Error('Compra já aprovada: só um administrador pode cancelar.');
  if (p.fin === 'Pago' && !ctx.admin) throw new Error('Pedido já pago: só um administrador pode cancelar.');
  p.status = 'Cancelado';
  hist_(p, ctx, 'Cancelado: ' + motivo);
  salvar_(ctx, p);
  log_(ctx, 'pedido_cancelar', p.numero + ' ' + motivo);
  return { msg: 'Pedido cancelado.' };
}

/* ---------- arquivos ---------- */
function arquivoAnexar_(q, ctx) {
  const p = achar_(ctx, q.pedido);
  if (!veTodos_(ctx) && String(p.solicitante_id) !== String(ctx.u.id)) throw new Error('Você só pode anexar nos seus pedidos.');
  const tipo = ['ORC', 'NF', 'COMPROVANTE', 'FOTO', 'OUTRO'].indexOf(q.tipo) >= 0 ? q.tipo : 'OUTRO';
  salvarArquivo_(ctx, p, tipo, q.arquivo, 'anexo');
  hist_(p, ctx, 'Arquivo anexado (' + tipo + '): ' + (q.arquivo && q.arquivo.nome || ''));
  salvar_(ctx, p);
  return { msg: 'Arquivo anexado.' };
}

function arquivoVer_(q, ctx) {
  const a = obraTab_(ctx, 'Arquivos').all().find(x => String(x.file_id) === String(q.id));
  if (!a) throw new Error('Arquivo não pertence a esta obra.');
  const p = achar_(ctx, a.pedido);
  if (!veTodos_(ctx) && String(p.solicitante_id) !== String(ctx.u.id)) throw new Error('Sem acesso a este arquivo.');
  const f = DriveApp.getFileById(a.file_id);
  return { nome: a.nome || f.getName(), mime: f.getMimeType(), b64: Utilities.base64Encode(f.getBlob().getBytes()) };
}

/* ---------- Drive ---------- */
function raizPasta_() {
  const pr = PropertiesService.getScriptProperties(), id = pr.getProperty('RAIZ_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recria */ } }
  const it = DriveApp.getFoldersByName('Compras Size'), f = it.hasNext() ? it.next() : DriveApp.createFolder('Compras Size');
  pr.setProperty('RAIZ_ID', f.getId());
  return f;
}
function pastaObra_(ctx) {
  try { return DriveApp.getFolderById(ctx.obra.pasta_id); } catch (e) {
    const f = raizPasta_().createFolder(ctx.obra.nome);
    const O = central_('Obras'), o = O.all().find(x => String(x.id) === String(ctx.obra.id));
    o.pasta_id = f.getId(); O.update(o); ctx.obra.pasta_id = o.pasta_id;
    return f;
  }
}
function pastaPedido_(ctx, p) {
  const m = String(p.pasta_url || '').match(/folders\/([-\w]+)/);
  if (m) { try { return DriveApp.getFolderById(m[1]); } catch (e) { /* recria */ } }
  const f = pastaObra_(ctx).createFolder(p.numero);
  p.pasta_url = f.getUrl();
  return f;
}
function salvarArquivo_(ctx, p, tipo, arq, origem) {
  if (!arq || !arq.b64) throw new Error('Arquivo vazio.');
  if (arq.b64.length > 14000000) throw new Error('Arquivo maior que ~10 MB.');
  const blob = Utilities.newBlob(Utilities.base64Decode(arq.b64), arq.mime || 'application/octet-stream', tipo + '_' + stamp_() + '_' + limpa_(arq.nome));
  return salvarBlob_(ctx, p, tipo, blob, arq.nome, origem);
}
function salvarBlob_(ctx, p, tipo, blob, nome, origem) {
  const f = pastaPedido_(ctx, p).createFile(blob);
  return obraTab_(ctx, 'Arquivos').insert({
    id: Utilities.getUuid().slice(0, 8), pedido: p.numero, tipo: tipo, nome: nome || f.getName(), url: f.getUrl(),
    file_id: f.getId(), data: new Date(), usuario: ctx.u.nome, origem: origem || 'app'
  });
}
