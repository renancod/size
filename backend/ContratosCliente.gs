/**
 * Contratos com o cliente, por obra (aba ContratosCliente da planilha da obra):
 *  - Contrato: o principal, criado no "Gerar obra" com o valor do orçamento aprovado e o contrato assinado;
 *  - Aditivo / Novo contrato: escopo a mais na mesma obra. Pelo orçamento ("Incluir em obra existente") as etapas viram
 *    frentes gerais novas; à mão, liga-se às frentes gerais que já existem. Cada um tem valor, dias úteis de prazo a mais
 *    e o documento (PDF) guardado na pasta da obra.
 *  - ART, Licença, Projeto, Alvará, Outro: só o documento (não mexem no valor nem no prazo).
 * O prazo da obra (Cronograma.gs prazoObra_) soma os dias úteis dos aditivos; cada frente geral sabe de qual contrato veio (Frentes.contrato).
 * Portal do cliente (área Documentos): só os marcados "o cliente vê" (coluna cliente). Contrato e aditivo já vêm marcados;
 * os outros documentos não, para nada interno sair por engano. Registro antigo sem a marca: contrato/aditivo aparecem.
 */
const CC_TIPOS_ = ['Contrato', 'Aditivo', 'Novo contrato', 'ART', 'Licença', 'Projeto', 'Alvará', 'Outro'];
const ccEContrato_ = t => ['Contrato', 'Aditivo', 'Novo contrato'].indexOf(t) >= 0;
const ccCliente_ = c => c.cliente === '' || c.cliente == null ? ccEContrato_(c.tipo) : sim_(c.cliente);
function ccDoCliente_(ctx) {
  return obraTab_(ctx, 'ContratosCliente').all().filter(c => ccCliente_(c) && c.arquivo_id)
    .sort((a, b) => ccOrdem_(a) - ccOrdem_(b) || ymd_(a.data).localeCompare(ymd_(b.data)));
}
const ccOrdem_ = c => c.tipo === 'Contrato' ? 0 : ccEContrato_(c.tipo) ? 1 : 2;

function ccCriar_(ctx, d) {
  const C = obraTab_(ctx, 'ContratosCliente');
  const c = Object.assign({ id: 'CC-' + Utilities.getUuid().slice(0, 8), criado_em: new Date(), criado_por: ctx.u.nome }, d);
  c.valor = num_(c.valor); c.dias_uteis = Math.max(0, parseInt(c.dias_uteis, 10) || 0);
  C.insert(c);
  return c;
}
function ccAditivoDias_(ctx) { return obraTab_(ctx, 'ContratosCliente').all().reduce((t, c) => t + (ccEContrato_(c.tipo) && c.tipo !== 'Contrato' ? Math.max(0, parseInt(c.dias_uteis, 10) || 0) : 0), 0); }

function ccListar_(q, ctx) {
  const fr = orcFrentes_(ctx);
  const L = obraTab_(ctx, 'ContratosCliente').all().map(c => Object.assign(pub_(c), {
    data: ymd_(c.data), valor: num_(c.valor), dias_uteis: num_(c.dias_uteis), arquivo: !!c.arquivo_id, contrato: ccEContrato_(c.tipo), cliente: ccCliente_(c),
    frentes: fr.filter(f => String(f.contrato) === String(c.id)).map(f => ({ codigo: String(f.codigo), nome: f.nome, preco: num_(f.preco) }))
  })).sort((a, b) => (a.tipo === 'Contrato' ? 0 : 1) - (b.tipo === 'Contrato' ? 0 : 1) || String(a.data).localeCompare(String(b.data)));
  let prazo = null;
  try { prazo = prazoObra_(ctx); } catch (e) { prazo = null; }
  return {
    contratos: L, valor_total: r2_(L.filter(c => c.contrato).reduce((t, c) => t + c.valor, 0)), prazo: prazo, tipos: CC_TIPOS_,
    frentes: fr.map(f => ({ codigo: String(f.codigo), nome: f.nome, contrato: String(f.contrato || '') })), gere: pode_(ctx, 'orc_gerir')
  };
}

function ccPasta_(ctx) {
  const it = pastaObra_(ctx).getFoldersByName('Contratos do cliente');
  return it.hasNext() ? it.next() : pastaObra_(ctx).createFolder('Contratos do cliente');
}
function ccSalvar_(q, ctx) {
  const C = obraTab_(ctx, 'ContratosCliente'), d = q.contrato || {};
  let c = d.id ? C.all().find(x => String(x.id) === String(d.id)) : null;
  if (d.id && !c) throw new Error('Contrato não encontrado.');
  const tipo = CC_TIPOS_.indexOf(d.tipo) >= 0 ? d.tipo : 'Aditivo', numero = String(d.numero || '').trim();
  if (!numero) throw new Error('Informe o número ou o nome (ex: Aditivo 01).');
  if (tipo === 'Contrato' && C.all().some(x => x !== c && x.tipo === 'Contrato')) throw new Error('A obra já tem o contrato principal: cadastre como aditivo ou novo contrato.');
  const novo = !c;
  if (novo) c = { id: 'CC-' + Utilities.getUuid().slice(0, 8), criado_em: new Date(), criado_por: ctx.u.nome };
  const ct = ccEContrato_(tipo);
  Object.assign(c, { tipo: tipo, numero: numero.slice(0, 60), data: ymd_(d.data) || hojeYmd_(), descricao: String(d.descricao || '').trim().slice(0, 500),
    valor: !ct || d.valor === '' || d.valor == null ? 0 : orcNum_(d.valor), dias_uteis: ct ? Math.max(0, parseInt(d.dias_uteis, 10) || 0) : 0,
    cliente: (d.cliente === undefined ? ct : d.cliente === true || d.cliente === 'Sim') ? 'Sim' : 'Não' });
  if (c.valor < 0) throw new Error('Valor negativo.');
  if (!ct && !c.arquivo_id && !(q.arquivo && q.arquivo.b64)) throw new Error('Anexe o arquivo do documento (PDF ou imagem).');
  if (q.arquivo && q.arquivo.b64) {
    const a = q.arquivo, b64 = String(a.b64).replace(/^data:[^,]+,/, '');
    if (b64.length > 14000000) throw new Error('Arquivo maior que ~10 MB.');
    const f = ccPasta_(ctx).createFile(Utilities.newBlob(Utilities.base64Decode(b64), /^(application\/pdf|image\/(jpeg|png))$/.test(a.mime || '') ? a.mime : 'application/pdf', c.numero + ' - ' + String(a.nome || 'documento.pdf').replace(/[\\/:*?"<>|]/g, '-')));
    c.arquivo_id = f.getId(); c.arquivo_nome = String(a.nome || f.getName()).slice(0, 120);
  }
  if (novo) C.insert(c); else C.update(c);
  // frentes gerais deste contrato (as que estavam nele e saíram da lista ficam sem contrato)
  if (Array.isArray(d.frentes) && ct) {
    const F = obraTab_(ctx, 'Frentes'), sel = d.frentes.map(String);
    F.all().forEach(f => {
      const era = String(f.contrato) === String(c.id), fica = sel.indexOf(String(f.codigo)) >= 0;
      if (era !== fica) { f.contrato = fica ? c.id : ''; F.update(f); }
    });
  }
  log_(ctx, 'contrato_cliente', c.tipo + ' ' + c.numero);
  return { msg: (novo ? c.tipo + ' cadastrado' : 'Salvo') + (c.dias_uteis ? ' · +' + c.dias_uteis + ' dias úteis de prazo' : '') + '.', id: c.id };
}
function ccExcluir_(q, ctx) {
  const C = obraTab_(ctx, 'ContratosCliente'), c = C.all().find(x => String(x.id) === String(q.id));
  if (!c) throw new Error('Contrato não encontrado.');
  const F = obraTab_(ctx, 'Frentes');
  F.all().filter(f => String(f.contrato) === String(c.id)).forEach(f => { f.contrato = ''; F.update(f); });
  C.removeWhere(x => x === c);
  log_(ctx, 'contrato_cliente_excluir', c.tipo + ' ' + c.numero);
  return { msg: c.tipo + ' ' + c.numero + ' excluído (as frentes gerais e o documento no Drive continuam).' };
}
function ccArquivo_(q, ctx) {
  const c = obraTab_(ctx, 'ContratosCliente').all().find(x => String(x.id) === String(q.id));
  if (!c || !c.arquivo_id) throw new Error('Documento não encontrado.');
  const f = DriveApp.getFileById(c.arquivo_id);
  return { nome: c.arquivo_nome || f.getName(), mime: f.getMimeType(), b64: Utilities.base64Encode(f.getBlob().getBytes()) };
}
