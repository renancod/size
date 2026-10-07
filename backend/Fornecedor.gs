/**
 * Portal do fornecedor: link assinado (sem login) por fornecedor + pedido(s).
 *  - Na cotação: o fornecedor vê os itens e envia o orçamento (valor, prazo, condição, PDF opcional).
 *  - Depois de aprovada a compra (só o fornecedor escolhido): vê a situação, baixa o comprovante
 *    (pagamento antecipado), informa a data prevista de entrega e anexa a nota fiscal a qualquer momento.
 */
const PORTAL_DIAS = 60;

function linkFornecedor_(ctx, fornCod, numeros) {
  const c = Utilities.base64EncodeWebSafe(JSON.stringify({ o: String(ctx.obra.id), f: String(fornCod), n: [].concat(numeros).map(String), e: Date.now() + PORTAL_DIAS * 864e5 }), Utilities.Charset.UTF_8);
  const base = String(config_().APP_URL || APP_URL_PADRAO).replace(/\/?$/, '/');
  return base + 'fornecedor.html?t=' + c + '.' + assinar_('forn' + c);
}

function ctxFornecedor_(t) {
  const a = String(t || '').split('.');
  if (a.length !== 2 || assinar_('forn' + a[0]) !== a[1]) throw new Error('Link inválido. Peça um novo link ao setor de Compras.');
  const d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(a[0])).getDataAsString());
  if (d.e < Date.now()) throw new Error('Link expirado. Peça um novo link ao setor de Compras.');
  const o = central_('Obras').all().find(x => String(x.id) === d.o);
  if (!o || !sim_(o.ativa)) throw new Error('Obra indisponível.');
  const ctx = { obra: o, ss: SpreadsheetApp.openById(o.planilha_id), perms: [], admin: false };
  const f = obraTab_(ctx, 'Fornecedores').all().find(x => String(x.codigo) === d.f);
  if (!f) throw new Error('Fornecedor não encontrado.');
  ctx.forn = f;
  ctx.u = { id: '', nome: 'Fornecedor ' + f.nome };
  ctx.nums = d.n;
  return ctx;
}

function etapaFornecedor_(ctx, p) {
  if (p.status === 'Cancelado') return 'cancelado';
  if (ST_ABERTOS.indexOf(p.status) >= 0) return 'cotacao';
  if (String(p.fornecedor_cod) !== String(ctx.forn.codigo)) return p.status === 'Aguardando aprovação' ? 'analise' : 'nao_escolhido';
  return p.status === 'Aguardando aprovação' ? 'analise' : 'compra';
}

function pedidoDoPortal_(ctx, numero) {
  if (ctx.nums.indexOf(String(numero)) < 0) throw new Error('Este pedido não faz parte do seu link.');
  return achar_(ctx, numero);
}

function fornRota_(q) {
  const ctx = ctxFornecedor_(q.t);
  if (q.acao === 'forn_dados') return fornDados_(ctx);
  if (q.acao === 'forn_arquivo') return fornArquivo_(ctx, q);
  const fn = { forn_orcamento: fornOrcamento_, forn_entrega: fornEntrega_, forn_nf: fornNF_ }[q.acao];
  if (!fn) throw new Error('Ação desconhecida.');
  const L = LockService.getScriptLock();
  L.waitLock(30000);
  try { return fn(ctx, q); } finally { L.releaseLock(); }
}

function fornDados_(ctx) {
  const O = obraTab_(ctx, 'Orcamentos').all(), A = obraTab_(ctx, 'Arquivos').all();
  const fmt = d => d instanceof Date ? Utilities.formatDate(d, tz_(), 'yyyy-MM-dd') : '';
  const pedidos = ctx.nums.map(n => obraTab_(ctx, 'Pedidos').all().find(p => String(p.numero) === n)).filter(Boolean).map(p => {
    const etapa = etapaFornecedor_(ctx, p);
    const meu = O.filter(o => o.pedido === p.numero && String(o.fornecedor_cod) === String(ctx.forn.codigo)).pop();
    const r = {
      numero: p.numero, etapa: etapa, necessidade: fmt(p.necessidade), frente: p.frente, observacoes: p.observacoes,
      itens: itensDe_(ctx, p.numero).map(i => ({ item: i.item, descricao: i.descricao, unidade: i.unidade, qtd: i.qtd })),
      orcamento: meu ? { valor: meu.valor, prazo_entrega: meu.prazo_entrega, condicao: meu.condicao, enviado_em: fmtVal_(meu.recebido_em), arquivo: !!meu.arquivo_id } : null
    };
    if (etapa === 'compra') {
      r.compra = {
        valor: p.valor_total, condicao: p.condicao, prazo_fat: p.prazo_fat, previsao: fmt(p.previsao), entrega: p.entrega, fin: p.fin,
        nf_numero: p.nf_numero, nf_em: fmt(p.nf_em), pago_em: fmt(p.pago_em),
        liberada: ['Entrega liberada', 'Recebido parcial', 'Recebido'].indexOf(p.entrega) >= 0,
        comprovantes: A.filter(a => a.pedido === p.numero && a.tipo === 'COMPROVANTE').map(a => ({ id: a.file_id, nome: a.nome })),
        notas: A.filter(a => a.pedido === p.numero && a.tipo === 'NF').map(a => ({ nome: a.nome, data: fmtVal_(a.data) })),
        recebido: itensDe_(ctx, p.numero).map(i => ({ item: i.item, qtd_recebida: i.qtd_recebida || 0 }))
      };
    }
    return r;
  });
  return {
    empresa: String(config_().EMPRESA || 'Size Engenharia'),
    obra: { nome: ctx.obra.nome, endereco: ctx.obra.endereco },
    fornecedor: { nome: ctx.forn.nome, condicao: ctx.forn.condicao },
    pedidos: pedidos
  };
}

function fornOrcamento_(ctx, q) {
  const p = pedidoDoPortal_(ctx, q.numero);
  if (ST_ABERTOS.indexOf(p.status) < 0) throw new Error('A cotação deste pedido já foi encerrada.');
  const valor = num_(q.valor);
  if (!(valor > 0)) throw new Error('Informe o valor total do orçamento.');
  if (!String(q.prazo_entrega || '').trim()) throw new Error('Informe o prazo de entrega.');
  const O = obraTab_(ctx, 'Orcamentos');
  // um orçamento por fornecedor: atualiza o que já existe (registrado por Compras, por e-mail ou pelo portal)
  let o = O.all().filter(x => x.pedido === p.numero && String(x.fornecedor_cod) === String(ctx.forn.codigo)).pop();
  const novo = !o;
  if (novo) o = { id: Utilities.getUuid().slice(0, 8), pedido: p.numero, fornecedor_cod: ctx.forn.codigo, fornecedor: ctx.forn.nome, registrado_por: 'Portal do fornecedor' };
  o.origem = 'portal';
  o.valor = valor;
  o.prazo_entrega = String(q.prazo_entrega).trim();
  o.condicao = String(q.condicao || '').trim();
  o.recebido_em = new Date();
  if (q.arquivo && q.arquivo.b64) {
    const a = salvarArquivo_(ctx, p, 'ORC', q.arquivo, 'portal do fornecedor');
    o.arquivo_id = a.file_id;
    o.arquivo_url = a.url;
  }
  if (novo) O.insert(o); else O.update(o);
  if (p.status === 'Aberto') p.status = 'Em cotação';
  hist_(p, ctx, (novo ? 'Orçamento enviado pelo portal: ' : 'Orçamento atualizado pelo portal: ') + brl_(valor) + ' · entrega ' + o.prazo_entrega + (o.condicao ? ' · ' + o.condicao : '') + (q.obs ? ' · obs: ' + String(q.obs).slice(0, 200) : ''));
  salvar_(ctx, p);
  return { msg: 'Orçamento enviado. Obrigado!' };
}

function fornEntrega_(ctx, q) {
  const p = pedidoDoPortal_(ctx, q.numero);
  if (etapaFornecedor_(ctx, p) !== 'compra') throw new Error('Este pedido não está com você.');
  const d = dataDe_(q.previsao);
  if (!d) throw new Error('Informe a data prevista de entrega.');
  p.previsao = d;
  hist_(p, ctx, 'Fornecedor informou entrega prevista para ' + Utilities.formatDate(d, tz_(), 'dd/MM/yyyy') + (q.obs ? ' · ' + String(q.obs).slice(0, 200) : ''));
  salvar_(ctx, p);
  return { msg: 'Data de entrega registrada.' };
}

function fornNF_(ctx, q) {
  const p = pedidoDoPortal_(ctx, q.numero);
  if (etapaFornecedor_(ctx, p) !== 'compra') throw new Error('Este pedido não está com você.');
  if (!(q.arquivo && q.arquivo.b64)) throw new Error('Anexe o PDF ou a foto da nota fiscal.');
  salvarArquivo_(ctx, p, 'NF', q.arquivo, 'portal do fornecedor');
  registrarNF_(ctx, p, q.nf_numero, q.nf_data);
  salvar_(ctx, p);
  return { msg: 'Nota fiscal enviada. Obrigado!' };
}

function fornArquivo_(ctx, q) {
  const p = pedidoDoPortal_(ctx, q.numero);
  if (etapaFornecedor_(ctx, p) !== 'compra') throw new Error('Sem acesso.');
  const a = obraTab_(ctx, 'Arquivos').all().find(x => x.pedido === p.numero && x.tipo === 'COMPROVANTE' && String(x.file_id) === String(q.id));
  if (!a) throw new Error('Arquivo não encontrado.');
  const f = DriveApp.getFileById(a.file_id);
  return { nome: a.nome || f.getName(), mime: f.getMimeType(), b64: Utilities.base64Encode(f.getBlob().getBytes()) };
}

/* link para Compras copiar/enviar por WhatsApp */
function fornLink_(q, ctx) {
  const f = obraTab_(ctx, 'Fornecedores').all().find(x => String(x.codigo) === String(q.fornecedor));
  if (!f) throw new Error('Fornecedor não encontrado.');
  const nums = [].concat(q.numeros || []).map(String);
  nums.forEach(n => achar_(ctx, n));
  return { url: linkFornecedor_(ctx, f.codigo, nums), nome: f.nome, telefone: f.telefone };
}
