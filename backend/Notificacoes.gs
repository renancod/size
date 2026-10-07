/**
 * Notificações na tela: o que cada pessoa tem para fazer agora, em todas as obras em que tem acesso,
 * conforme as permissões (cada perfil vê a sua etapa). O app consulta a cada minuto e avisa o que for novo.
 * O id de cada aviso muda quando o pedido muda de etapa, então cada trâmite gera um aviso novo.
 */
function notificacoes_(q, ctx) {
  const itens = [], limiteMeus = Date.now() - 10 * 864e5;
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
      const add = (etapa, texto) => itens.push({
        id: o.id + '|' + p.numero + '|' + etapa + '|' + sit, obra: String(o.id), obra_nome: o.nome, numero: p.numero, etapa: etapa,
        texto: texto, resumo: resumo, situacao: sit, prioridade: p.prioridade, quando: fmtVal_(quando)
      });
      if (sit === 'Aberto' && pode('compras_cotar')) add('cotar', 'Novo pedido para cotar');
      if (sit === 'Em cotação' && orcs[p.numero] && pode('compras_definir')) add('definir', orcs[p.numero] + ' orçamento(s) recebido(s) — definir a compra');
      if (sit === 'Aguardando aprovação' && pode('compras_aprovar')) add('aprovar', 'Aprovar compra: ' + p.fornecedor + ' ' + brl_(p.valor_total));
      if (sit === 'Liberar entrega' && pode('compras_liberar')) add('liberar', 'Compra aprovada — liberar a entrega');
      if (p.status === 'Aprovado' && ['Entrega liberada', 'Recebido parcial'].indexOf(p.entrega) >= 0 && pode('pedido_receber'))
        add('receber', (p.entrega === 'Recebido parcial' ? 'Restante a receber' : 'Material a caminho') + (p.previsao ? ' · previsto ' + fd(p.previsao) : ''));
      if (p.status === 'Aprovado' && p.fin === 'Aguardando pagamento' && pode('financeiro')) add('pagar', 'Pagamento antecipado (libera a entrega): ' + brl_(p.valor_total));
      if (p.status === 'Aprovado' && p.fin === 'A pagar' && pode('financeiro')) add('pagar', 'Nota recebida — pagar ' + brl_(p.valor_total) + (p.vencimento ? ' até ' + fd(p.vencimento) : ''));
      // quem abriu o pedido acompanha cada mudança de etapa (últimos 10 dias)
      if (String(p.solicitante_id) === String(ctx.u.id) && quando instanceof Date && quando.getTime() >= limiteMeus)
        add('meu', 'Seu pedido está em: ' + sit);
    });
  });
  return { itens: itens, agora: fmtVal_(new Date()) };
}
