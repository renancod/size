/**
 * Notificações na tela: o que cada pessoa tem para fazer agora, em todas as obras em que tem acesso,
 * conforme as permissões (cada perfil vê a sua etapa). O app consulta a cada minuto e avisa o que for novo.
 * O id de cada aviso muda quando o pedido muda de etapa, então cada trâmite gera um aviso novo.
 */
function notificacoes_(q, ctx) {
  const itens = [], limiteMeus = Date.now() - 10 * 864e5, hojeStr = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  const fd = d => d instanceof Date ? Utilities.formatDate(d, tz_(), 'dd/MM') : '';
  central_('Obras').all().filter(o => sim_(o.ativa) || ctx.admin).forEach(o => {
    const perms = permsDe_(ctx.u, o.id);
    if (!perms || !o.planilha_id) return;
    const c = { u: ctx.u, admin: ctx.admin, obra: o, perms: perms, ss: SpreadsheetApp.openById(o.planilha_id) };
    const pode = p => pode_(c, p);
    const orcs = {};
    obraTab_(c, 'Orcamentos').all().forEach(x => { orcs[x.pedido] = (orcs[x.pedido] || 0) + 1; });
    const itensPed = {};
    obraTab_(c, 'Itens').all().forEach(i => { (itensPed[i.pedido] = itensPed[i.pedido] || []).push(i.descricao); });

    obraTab_(c, 'Pedidos').all().forEach(p => {
      const sit = situacao_(p), quando = p.atualizado_em || p.criado_em;
      const mat = (itensPed[p.numero] || [])[0] || '';
      const resumo = mat + ((itensPed[p.numero] || []).length > 1 ? ' +' + ((itensPed[p.numero] || []).length - 1) : '');
      // urgência só vale até o material chegar
      const recebido = p.entrega === 'Recebido' || ['Concluído', 'Cancelado'].indexOf(p.status) >= 0;
      const add = (etapa, texto, extraId) => itens.push({
        id: o.id + '|' + p.numero + '|' + etapa + '|' + sit + (extraId ? '|' + extraId : ''), obra: String(o.id), obra_nome: o.nome, numero: p.numero, etapa: etapa,
        texto: texto, resumo: resumo, situacao: sit, prioridade: recebido ? '' : p.prioridade, quando: fmtVal_(quando)
      });
      if (sit === 'Aberto' && pode('compras_cotar')) add('cotar', 'Novo pedido para cotar');
      if (sit === 'Em cotação' && orcs[p.numero] && pode('compras_definir')) add('definir', orcs[p.numero] + ' orçamento(s) recebido(s) — definir a compra');
      if (sit === 'Aguardando aprovação' && pode('compras_aprovar')) add('aprovar', 'Aprovar compra: ' + p.fornecedor + ' ' + brl_(p.valor_total));
      if (sit === 'Liberar entrega' && pode('compras_liberar')) add('liberar', 'Compra aprovada — liberar a entrega');
      // a data prevista entra no id: quando o fornecedor informa ou muda a data, sai um aviso novo
      const prev = p.previsao instanceof Date ? Utilities.formatDate(p.previsao, tz_(), 'yyyy-MM-dd') : '';
      const aCaminho = p.status === 'Aprovado' && ['Entrega liberada', 'Recebido parcial'].indexOf(p.entrega) >= 0;
      if (aCaminho && pode('pedido_receber'))
        add('receber', (p.entrega === 'Recebido parcial' ? 'Restante a receber' : 'Material a caminho') + (prev ? ' · entrega prevista ' + fd(p.previsao) + ' (' + p.fornecedor + ')' : ''), prev);
      else if (aCaminho && prev && pode(['compras_liberar', 'compras_definir']))
        add('entrega', 'Entrega prevista para ' + fd(p.previsao) + ' · ' + p.fornecedor, prev);
      if (p.status === 'Aprovado' && p.fin === 'Aguardando pagamento' && pode('financeiro')) add('pagar', 'Pagamento antecipado (libera a entrega): ' + brl_(p.valor_total));
      if (p.status === 'Aprovado' && p.fin === 'A pagar' && pode('financeiro')) {
        const dias = diasAte_(p.vencimento);
        if (dias === null || dias > 5) add('pagar', 'Nota recebida — pagar ' + brl_(p.valor_total) + (p.vencimento ? ' até ' + fd(p.vencimento) + ' (em ' + dias + ' dias)' : ''));
        // nos últimos 5 dias (e depois de vencido) o aviso se renova todo dia
        else add('pagar', textoVencimento_(dias, p.vencimento) + ' — ' + brl_(p.valor_total) + ' · ' + p.fornecedor, hojeStr);
      }
      if (p.status === 'Aprovado' && p.fin === 'Aguardando NF' && p.entrega === 'Recebido' && pode('financeiro'))
        add('nf', 'Material recebido — aguardando a nota fiscal para programar o pagamento');
      if (p.fin === 'Pago' && p.pago_em instanceof Date && Date.now() - p.pago_em.getTime() < 3 * 864e5 && pode(['financeiro', 'compras_definir', 'compras_aprovar']))
        add('pago', 'Pagamento concluído: ' + brl_(p.valor_total) + ' · ' + p.fornecedor + (p.forma_pagto ? ' (' + p.forma_pagto + ')' : ''));
      // quem abriu o pedido acompanha cada mudança de etapa (últimos 10 dias)
      if (String(p.solicitante_id) === String(ctx.u.id) && quando instanceof Date && quando.getTime() >= limiteMeus)
        add('meu', 'Seu pedido está em: ' + sit);
    });
    // módulo Execução: avisos do engenheiro, diário do dia, alertas de produção e diários para revisar
    try {
      notifExec_(c, x => itens.push(Object.assign({ obra: String(o.id), obra_nome: o.nome, resumo: '', situacao: '', prioridade: '' }, x, { id: o.id + '|' + x.id })));
    } catch (e) { /* execução não derruba os avisos de compras */ }
  });
  return { itens: itens, agora: fmtVal_(new Date()) };
}

function diasAte_(d) {
  if (!(d instanceof Date)) return null;
  const h = new Date(); h.setHours(0, 0, 0, 0);
  const v = new Date(d.getTime()); v.setHours(0, 0, 0, 0);
  return Math.round((v - h) / 864e5);
}
function textoVencimento_(dias, venc) {
  const data = Utilities.formatDate(venc, tz_(), 'dd/MM');
  if (dias > 1) return 'Vence em ' + dias + ' dias (' + data + ')';
  if (dias === 1) return 'Vence AMANHÃ (' + data + ')';
  if (dias === 0) return 'Vence HOJE (' + data + ')';
  return 'VENCIDO há ' + (-dias) + (dias === -1 ? ' dia' : ' dias') + ' (' + data + ')';
}

/* e-mail diário (8h) ao financeiro de cada obra com o que vence em até 5 dias ou já venceu */
function lembretesDiarios() {
  central_('Obras').all().filter(o => sim_(o.ativa) && o.planilha_id).forEach(o => {
    const ctx = { u: { id: '', nome: 'Lembrete automático' }, obra: o, ss: SpreadsheetApp.openById(o.planilha_id), perms: [], admin: true };
    const ps = obraTab_(ctx, 'Pedidos').all().filter(p => p.status === 'Aprovado' && p.fin === 'A pagar' && diasAte_(p.vencimento) !== null && diasAte_(p.vencimento) <= 5)
      .sort((a, b) => a.vencimento - b.vencimento);
    const para = emailsFinanceiro_(ctx);
    if (!ps.length || !para.length) return;
    const th = 'style="border:1px solid #ccc;padding:6px;background:#0E2A6B;color:#fff;text-align:left"', td = 'style="border:1px solid #ccc;padding:6px"';
    const html = '<div style="font-family:Arial;font-size:14px"><h2 style="color:#0E2A6B">Pagamentos próximos do vencimento · ' + h_(o.nome) + '</h2>' +
      '<table style="border-collapse:collapse;font-size:13px"><tr><th ' + th + '>Pedido</th><th ' + th + '>Fornecedor</th><th ' + th + '>Valor</th><th ' + th + '>NF</th><th ' + th + '>Vencimento</th></tr>' +
      ps.map(p => '<tr><td ' + td + '>' + h_(p.numero) + '</td><td ' + td + '>' + h_(p.fornecedor) + '</td><td ' + td + '>' + brl_(p.valor_total) + '</td><td ' + td + '>' + h_(p.nf_numero) +
        '</td><td ' + td + '><b>' + h_(textoVencimento_(diasAte_(p.vencimento), p.vencimento)) + '</b></td></tr>').join('') +
      '</table><p>Total: <b>' + brl_(ps.reduce((s, p) => s + num_(p.valor_total), 0)) + '</b></p>' +
      (config_().APP_URL ? '<p><a href="' + String(config_().APP_URL).replace(/\/?$/, '/') + '?obra=' + encodeURIComponent(o.id) + '#/financeiro">Abrir o Financeiro no app</a></p>' : '') + '</div>';
    try { enviar_(para.join(','), 'Pagamentos a vencer · ' + o.nome + ' (' + ps.length + ')', html); } catch (e) { /* tenta de novo amanhã */ }
  });
}

/* cria os gatilhos automáticos que faltarem (e-mails a cada 10 min e lembrete diário às 8h) */
function garantirGatilhos_() {
  const pr = PropertiesService.getScriptProperties();
  if (pr.getProperty('GATILHOS_V2')) return;
  try {
    const ts = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
    if (ts.indexOf('capturarEmails') < 0) ScriptApp.newTrigger('capturarEmails').timeBased().everyMinutes(10).create();
    if (ts.indexOf('lembretesDiarios') < 0) ScriptApp.newTrigger('lembretesDiarios').timeBased().everyDays(1).atHour(8).create();
    pr.setProperty('GATILHOS_V2', 'Sim');
  } catch (e) { /* sem permissão neste contexto: rode instalarGatilho() no editor */ }
}
