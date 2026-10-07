/**
 * E-mails para fornecedores/financeiro e captura automática dos PDFs respondidos.
 * Os números dos pedidos vão entre colchetes no assunto, ex: "Cotação Size · Prime Beach [PB-0001, PB-0002]".
 * Respostas a "Cotação" viram orçamentos; respostas aos demais (liberação/pagamento) viram nota fiscal.
 */
function empresa_() { return String(config_().EMPRESA || 'Size Engenharia'); }

function emailHtml_(titulo, intro, linhas, comValor) {
  const th = 'style="border:1px solid #ccc;padding:6px;background:#0E2A6B;color:#fff;text-align:left"';
  const td = 'style="border:1px solid #ccc;padding:6px"';
  const lin = linhas.map(l => '<tr><td ' + td + '>' + h_(l.numero) + '</td><td ' + td + '>' + h_(l.descricao) + '</td><td ' + td + '>' +
    h_(l.qtd) + ' ' + h_(l.unidade) + '</td><td ' + td + '>' + h_(l.necessidade || '') + '</td>' +
    (comValor ? '<td ' + td + '>' + (l.valor !== '' && l.valor != null ? brl_(l.valor) : '') + '</td>' : '') + '</tr>').join('');
  return '<div style="font-family:Arial;font-size:14px"><h2 style="color:#0E2A6B">' + h_(titulo) + '</h2><p>' + intro + '</p>' +
    '<table style="border-collapse:collapse;font-size:13px"><tr><th ' + th + '>Pedido</th><th ' + th + '>Material</th><th ' + th + '>Qtd</th><th ' + th + '>Necessário até</th>' +
    (comValor ? '<th ' + th + '>Valor</th>' : '') + '</tr>' + lin + '</table><p>Atenciosamente,<br>Setor de Compras · ' + h_(empresa_()) + '</p></div>';
}

function botaoPortal_(url, texto) {
  return '<p style="margin:18px 0"><a href="' + url + '" style="background:#04857A;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">' +
    h_(texto) + '</a></p>';
}

function linhasEmail_(ctx, ps) {
  const out = [];
  ps.forEach(p => itensDe_(ctx, p.numero).forEach(i => out.push({
    numero: p.numero, descricao: i.descricao, qtd: i.qtd, unidade: i.unidade,
    necessidade: p.necessidade instanceof Date ? Utilities.formatDate(p.necessidade, tz_(), 'dd/MM/yyyy') : '',
    valor: i.valor_unit !== '' && i.valor_unit != null ? num_(i.valor_unit) * num_(i.qtd) : ''
  })));
  return out;
}
function tag_(ps) { return '[' + ps.map(p => p.numero).join(', ') + ']'; }
function enviar_(para, assunto, html, anexos) {
  GmailApp.sendEmail(String(para).replace(/;/g, ','), assunto, 'Abra este e-mail em formato HTML.',
    { htmlBody: html, name: empresa_() + ' · Compras', attachments: anexos || [] });
}

function emailCotacao_(ctx, f, ps, q) {
  const intro = 'Prezados' + (f.contato ? ' (' + h_(f.contato) + ')' : '') + ', solicitamos cotação dos itens abaixo para a obra <b>' + h_(ctx.obra.nome) + '</b>' +
    (ctx.obra.endereco ? ' (' + h_(ctx.obra.endereco) + ')' : '') + '.' +
    (q.prazo ? ' Prazo para resposta: <b>' + String(q.prazo).split('-').reverse().join('/') + '</b>.' : '') +
    (q.msg ? '<br>' + h_(q.msg) : '') +
    botaoPortal_(linkFornecedor_(ctx, f.codigo, ps.map(p => p.numero)), 'Enviar orçamento pelo portal') +
    '<br><small>Se preferir, responda este e-mail anexando o orçamento em PDF (mantenha o assunto).</small>';
  enviar_(f.email, 'Cotação Size · ' + ctx.obra.nome + ' ' + tag_(ps), emailHtml_('Solicitação de cotação', intro, linhasEmail_(ctx, ps), false));
}

function emailFornecedor_(ctx, p, prefixo, titulo, intro, anexos) {
  const f = obraTab_(ctx, 'Fornecedores').all().find(x => String(x.codigo) === String(p.fornecedor_cod) || norm_(x.nome) === norm_(p.fornecedor));
  if (!f || !f.email) return false;
  try {
    intro += botaoPortal_(linkFornecedor_(ctx, f.codigo, [p.numero]), 'Informar data de entrega e enviar a nota fiscal');
    enviar_(f.email, prefixo + ' · ' + ctx.obra.nome + ' ' + tag_([p]), emailHtml_(titulo, intro, linhasEmail_(ctx, [p]), true), anexos);
    return true;
  } catch (e) { return false; } // a operação já foi gravada; o app avisa que o e-mail não saiu
}

/* destinatários do financeiro: e-mail da obra (ou o geral) + usuários com permissão de financeiro nesta obra */
function emailsFinanceiro_(ctx) {
  const c = config_(), lista = [];
  String(ctx.obra.email_financeiro || c.EMAIL_FINANCEIRO || '').split(/[,;\s]+/).filter(Boolean).forEach(e => lista.push(e.toLowerCase()));
  central_('Usuarios').all().filter(u => sim_(u.ativo) && u.email && !sim_(u.admin) && (permsDe_(u, ctx.obra.id) || []).indexOf('financeiro') >= 0)
    .forEach(u => lista.push(String(u.email).trim().toLowerCase()));
  return lista.filter((e, i) => lista.indexOf(e) === i);
}

function avisarFinanceiro_(ctx, p, motivo) {
  const c = config_(), para = emailsFinanceiro_(ctx);
  if (!para.length) return;
  const url = c.APP_URL ? String(c.APP_URL).replace(/\/?$/, '/') + '?obra=' + encodeURIComponent(ctx.obra.id) + '#/pedido/' + encodeURIComponent(p.numero) : '';
  const intro = '<b>' + h_(motivo) + '</b><br>Fornecedor: ' + h_(p.fornecedor) + ' · Valor: <b>' + brl_(p.valor_total) + '</b> · ' + h_(p.condicao) +
    (url ? '<br><a href="' + url + '">Abrir no app de Compras</a>' : '');
  try {
    enviar_(para.join(','), 'Financeiro · ' + ctx.obra.nome + ' ' + tag_([p]), emailHtml_('Pagamento pendente', intro, linhasEmail_(ctx, [p]), true));
  } catch (e) { /* aviso por e-mail é opcional */ }
}

function avisarAprovadores_(ctx, p) {
  const us = central_('Usuarios').all().filter(u => sim_(u.ativo) && u.email && String(u.id) !== String(ctx.u.id) &&
    (sim_(u.admin) || (permsDe_(u, ctx.obra.id) || []).indexOf('compras_aprovar') >= 0));
  if (!us.length) return;
  const c = config_();
  const url = c.APP_URL ? String(c.APP_URL).replace(/\/?$/, '/') + '?obra=' + encodeURIComponent(ctx.obra.id) + '#/pedido/' + encodeURIComponent(p.numero) : '';
  const intro = h_(ctx.u.nome) + ' definiu a compra abaixo e ela aguarda sua aprovação.<br>Fornecedor: <b>' + h_(p.fornecedor) + '</b> · Valor: <b>' + brl_(p.valor_total) +
    '</b> · ' + h_(p.condicao) + (p.prazo_fat ? ' ' + p.prazo_fat + ' dias' : '') + (url ? '<br><a href="' + url + '">Abrir no app para aprovar ou reprovar</a>' : '');
  try {
    enviar_(us.map(u => u.email).join(','), 'Aprovação · ' + ctx.obra.nome + ' ' + tag_([p]), emailHtml_('Compra aguardando aprovação', intro, linhasEmail_(ctx, [p]), true));
  } catch (e) { /* aviso por e-mail é opcional */ }
}

/* ---------- captura automática ---------- */
function capturarEmails() {
  const L = LockService.getScriptLock();
  L.waitLock(30000);
  try {
    const eu = Session.getEffectiveUser().getEmail().toLowerCase();
    const threads = GmailApp.search('has:attachment newer_than:45d subject:Size', 0, 60);
    if (!threads.length) return { msg: 'Nenhum e-mail novo.' };
    const obras = central_('Obras').all().filter(o => sim_(o.ativa));
    const ctxs = {};
    const ctxDe = o => ctxs[o.id] = ctxs[o.id] || { u: { id: '', nome: 'E-mail automático' }, obra: o, ss: SpreadsheetApp.openById(o.planilha_id), perms: [], admin: true };
    let salvos = 0;

    threads.forEach(t => t.getMessages().forEach(m => {
      const de = m.getFrom(), rem = ((de.match(/<([^>]+)>/) || [0, de])[1]).trim().toLowerCase();
      if (rem === eu) return;
      const subj = m.getSubject(), nums = subj.match(/\b[A-Z]{1,5}-\d{4}\b/g);
      if (!nums) return;
      const tipo = /cota/i.test(subj) ? 'ORC' : 'NF';
      const anexos = m.getAttachments({ includeInlineImages: false }).filter(a => /pdf/i.test(a.getContentType()) || a.getSize() >= 30000);
      if (!anexos.length) return;

      nums.forEach(n => {
        let ctx = null, p = null;
        obras.some(o => {
          const c = ctxDe(o), x = obraTab_(c, 'Pedidos').all().find(y => String(y.numero) === n);
          if (x) { ctx = c; p = x; return true; }
          return false;
        });
        if (!p) return;
        const A = obraTab_(ctx, 'Arquivos');
        const F = obraTab_(ctx, 'Fornecedores').all().find(f => String(f.email || '').toLowerCase().split(/[,;\s]+/).indexOf(rem) >= 0);
        let mudou = false;
        anexos.forEach(a => {
          const marca = 'email ' + m.getId() + ' ' + a.getName();
          if (A.all().some(x => x.pedido === p.numero && x.origem === marca)) return;
          // o mesmo PDF pode já estar na pasta (salvo pelo app antigo ou por outra resposta): reaproveita em vez de duplicar
          const igual = arquivoIgualNaPasta_(ctx, p, a);
          if (igual && A.all().some(x => x.pedido === p.numero && String(x.file_id) === String(igual.getId()))) return; // já registrado
          const reg = igual
            ? A.insert({ id: Utilities.getUuid().slice(0, 8), pedido: p.numero, tipo: tipo, nome: a.getName(), url: igual.getUrl(), file_id: igual.getId(), data: new Date(), usuario: ctx.u.nome, origem: marca })
            : salvarBlob_(ctx, p, tipo, a.copyBlob().setName(tipo + '_' + limpa_(rem) + '_' + limpa_(a.getName())), a.getName(), marca);
          salvos++;
          mudou = true;
          if (tipo === 'ORC' && ST_ABERTOS.indexOf(p.status) >= 0) {
            obraTab_(ctx, 'Orcamentos').insert({
              id: Utilities.getUuid().slice(0, 8), pedido: p.numero, fornecedor_cod: F ? F.codigo : '', fornecedor: F ? F.nome : rem,
              valor: '', prazo_entrega: '', condicao: '', arquivo_id: reg.file_id, arquivo_url: reg.url, origem: 'e-mail', recebido_em: new Date(), registrado_por: 'E-mail automático'
            });
            if (p.status === 'Aberto') p.status = 'Em cotação';
            hist_(p, ctx, 'Orçamento recebido por e-mail de ' + (F ? F.nome : rem) + ' (preencher o valor)');
          } else if (tipo === 'NF' && p.status === 'Aprovado' && p.fin === 'Aguardando NF') {
            registrarNF_(ctx, p, '', '');
          } else {
            hist_(p, ctx, 'Arquivo recebido por e-mail de ' + rem + ': ' + a.getName());
          }
        });
        if (mudou) salvar_(ctx, p);
      });
    }));
    return { msg: salvos + ' arquivo(s) novo(s) recebido(s) por e-mail.' };
  } finally { L.releaseLock(); }
}

function arquivoIgualNaPasta_(ctx, p, anexo) {
  const nome = limpa_(anexo.getName()), tam = anexo.getSize();
  const it = pastaPedido_(ctx, p).getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getSize() === tam && (f.getName() === anexo.getName() || f.getName().slice(-nome.length) === nome)) return f;
  }
  return null;
}

// Rode UMA vez no editor: autoriza Gmail/Drive e agenda a captura de e-mails a cada 10 min.
function instalarGatilho() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'capturarEmails') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('capturarEmails').timeBased().everyMinutes(10).create();
}
