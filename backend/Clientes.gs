/**
 * Portal do cliente: o cliente entra com login próprio e acompanha UMA obra, só leitura, com a cor, o nome e o ícone
 * do empreendimento (endereço próprio c/<slug>/ publicado no GitHub Pages).
 * - O que ele vê vem do cadastro (aba Clientes, coluna modulos): andamento sempre; cronograma, diário, FVS e financeiro conforme o modelo
 *   (Gestão = tudo; Global = sem financeiro) ou marcados um a um.
 * - Segurança: o usuário do cliente (Usuarios.cliente_id) só chama as rotas "cli" (rota_ recusa o resto) e cada rota daqui
 *   devolve só o que pode sair: nunca custo, BDI, fornecedor, compras, estoque, ocorrências ou observações internas.
 * - Diário: só os dias que o engenheiro liberou (Diarios.cliente = Sim). Financeiro: contratos das empreiteiras
 *   (contratado, medido, pago, saldo) e medições aprovadas/pagas, com o PDF arquivado.
 */
const CLI_GERAIS_ = ['sessao', 'trocarSenha', 'notificacoes', 'push_registrar', 'push_remover', 'push_teste'];
const CLI_MODULOS_ = { cronograma: 'Cronograma', diario: 'Diário de obra', fvs: 'Qualidade (FVS)', financeiro: 'Financeiro (contratos, medições e pagamentos)' };
const CLI_MODELOS_ = { gestao: ['cronograma', 'diario', 'fvs', 'financeiro'], global: ['cronograma', 'diario', 'fvs'] };
const CLI_COR_PADRAO_ = '#1D6F5F';

function cliModulos_(c) { return String(c.modulos || '').split(',').map(s => s.trim()).filter(m => CLI_MODULOS_[m]); }
function cliAchar_(id) {
  const k = 'cl|' + id;
  let c = authCache_(k);
  if (!c) { c = central_('Clientes').all().find(x => String(x.id) === String(id)); if (c) authGuardar_(k, c); }
  return c;
}
function cliObra_(c) {
  const o = central_('Obras').all().find(x => String(x.id) === String(c.obra_id));
  if (!o || !o.planilha_id) throw new Error('A obra deste acesso não foi encontrada. Fale com a Size.');
  return o;
}
function cliPub_(c, o) {
  return { id: String(c.id), nome: c.nome, empresa: c.empresa || '', cor: c.cor || CLI_COR_PADRAO_, slug: c.slug || '', modulos: cliModulos_(c), obra_nome: o ? o.nome : '', publicado: !!c.publicado_em };
}

/* contexto das rotas cli: o cliente do usuário (ou, para o administrador pré-visualizar, q.cliente) e a planilha da obra */
function cliCtx_(q, ctx) {
  let id = ctx.u.cliente_id;
  if (!id) { if (!ctx.admin) throw new Error('Área do portal do cliente.'); id = q.cliente; }
  const c = cliAchar_(id);
  if (!c || (!sim_(c.ativo) && !ctx.admin)) throw new Error('O acesso deste cliente está desativado. Fale com a Size.');
  const mods = cliModulos_(c), mod = ROTAS[q.acao].cli;
  if (typeof mod === 'string' && mods.indexOf(mod) < 0) throw new Error('Esta área não está liberada para você.');
  let o = authCache_('co|' + c.obra_id);
  if (!o) { o = cliObra_(c); authGuardar_('co|' + c.obra_id, o); }
  ctx.cli = c; ctx.mods = mods; ctx.obra = o; ctx.perms = []; ctx.ss = SpreadsheetApp.openById(o.planilha_id);
}
function cliSessao_(u) {
  const c = cliAchar_(u.cliente_id);
  if (!c || !sim_(c.ativo)) throw new Error('O acesso deste cliente está desativado. Fale com a Size.');
  let o = null;
  try { o = cliObra_(c); } catch (e) { /* mostra o erro ao abrir as telas */ }
  return {
    usuario: { id: String(u.id), nome: u.nome, login: u.login, email: u.email, admin: false, trocar_senha: sim_(u.trocar_senha), orcamentos: '' },
    obras: [], permissoes: {}, cliente: cliPub_(c, o)
  };
}

/* ---------- andamento: % executado × previsto (pelo valor do orçamento da obra; sem orçamento, média das frentes de execução) ---------- */
function cliAndamento_(ctx) {
  let C = null;
  try { C = cronoObra_({}, ctx); } catch (e) { /* obra sem orçamento */ }
  if (C && C.geral.valor > 0) {
    return {
      pct_exec: C.geral.pct_exec, pct_prev: C.geral.pct_prev, inicio: C.geral.inicio, fim: C.geral.fim, hoje: C.hoje,
      frentes: C.frentes.map(f => ({ nome: f.nome, ini: f.ini, fim: f.fim, pct_prev: f.pct_prev, pct_exec: f.pct_exec, situacao: f.situacao })),
      meses: C.meses.map(m => ({ mes: m.mes, pct_prev: m.pct_prev, pct_exec: m.futuro ? null : m.pct_exec }))
    };
  }
  const calc = calcExec_(ctx), E = calc.etapas.filter(e => e.ativa && e.itens.length), med = k => E.length ? r2_(E.reduce((t, e) => t + e[k], 0) / E.length) : 0;
  return {
    pct_exec: med('pct'), pct_prev: med('planejado'), inicio: E.map(e => e.inicio).filter(Boolean).sort()[0] || '', fim: E.map(e => e.termino).filter(Boolean).sort().pop() || '', hoje: calc.hoje,
    frentes: E.map(e => ({ nome: e.nome, ini: e.inicio, fim: e.termino, pct_prev: e.planejado, pct_exec: e.pct, situacao: e.situacao })), meses: []
  };
}

function cliCronograma_(q, ctx) { return cliAndamento_(ctx); }

/* ---------- diário liberado ao cliente ---------- */
function cliDiariosLib_(ctx) {
  return obraTab_(ctx, 'Diarios').all().filter(d => sim_(d.cliente) && d.status !== 'Rascunho').map(d => Object.assign(d, { _dia: ymd_(d.data) })).sort((a, b) => b._dia.localeCompare(a._dia));
}
function cliChuva_(d) { return [d.chuva_manha, d.chuva_tarde].filter(Boolean).join(' / ') || ''; }
function cliDiaResumo_(ctx, d, prod, fotos) {
  const ps = prod.filter(p => ymd_(p.data) === d._dia && num_(p.qtd)), fs = fotos.filter(f => ymd_(f.data) === d._dia);
  return {
    data: d._dia, numero: num_(d.numero), condicao: d.condicao || '', tmin: d.tmin, tmax: d.tmax, chuva: cliChuva_(d),
    servicos: [...new Set(ps.map(p => p.servico))], fotos: fs.length, foto: fs.length ? String(fs[0].id) : ''
  };
}
function cliDiarios_(q, ctx) {
  const prod = obraTab_(ctx, 'Producao').all(), fotos = obraTab_(ctx, 'FotosExec').all();
  return { diarios: cliDiariosLib_(ctx).map(d => cliDiaResumo_(ctx, d, prod, fotos)) };
}
function cliDiario_(q, ctx) {
  const dia = ymd_(q.data), d = cliDiariosLib_(ctx).find(x => x._dia === dia);
  if (!d) throw new Error('Diário não disponível.');
  const et = {};
  obraTab_(ctx, 'Etapas').all().forEach(e => { et[String(e.codigo)] = e.nome; });
  const serv = {};
  obraTab_(ctx, 'Producao').all().filter(p => ymd_(p.data) === dia && num_(p.qtd)).forEach(p => {
    const k = p.etapa + '|' + p.servico + '|' + p.unidade, s = serv[k] = serv[k] || { etapa: et[String(p.etapa)] || '', servico: p.servico, unidade: p.unidade, qtd: 0 };
    s.qtd = r2_(s.qtd + num_(p.qtd));
  });
  const pessoas = obraTab_(ctx, 'EquipesDia').all().filter(e => ymd_(e.data) === dia).reduce((t, e) => t + num_(e.pessoas), 0);
  return {
    data: dia, numero: num_(d.numero), condicao: d.condicao || '', tmin: d.tmin, tmax: d.tmax, chuva_manha: d.chuva_manha || '', chuva_tarde: d.chuva_tarde || '', vento: d.vento || '',
    servicos: Object.values(serv), pessoas: pessoas,
    fotos: obraTab_(ctx, 'FotosExec').all().filter(f => ymd_(f.data) === dia).map(f => ({ id: String(f.id), legenda: f.legenda || '', etapa: et[String(f.etapa)] || '' }))
  };
}
function cliFoto_(q, ctx) {
  const f = obraTab_(ctx, 'FotosExec').all().find(x => String(x.id) === String(q.id));
  if (!f || !cliDiariosLib_(ctx).some(d => d._dia === ymd_(f.data))) throw new Error('Foto não disponível.');
  const file = DriveApp.getFileById(q.mini && f.mini_id ? f.mini_id : f.file_id);
  return { mime: 'image/jpeg', b64: Utilities.base64Encode(file.getBlob().getBytes()) };
}

/* ---------- qualidade: FVS aprovadas ---------- */
function cliFvsLista_(ctx) { return obraTab_(ctx, 'Fvs').all().filter(f => f.status === FVS_ST_.ok); }
function cliFvs_(q, ctx) {
  const et = {};
  obraTab_(ctx, 'Etapas').all().forEach(e => { et[String(e.codigo)] = e.nome; });
  return {
    fvs: cliFvsLista_(ctx).map(f => ({ id: String(f.id), numero: f.numero, servico: f.servico || f.modelo_nome, etapa: et[String(f.etapa)] || '', aprovado_em: fmtVal_(f.aprovado_em), pdf: !!f.pdf_id }))
      .sort((a, b) => String(b.aprovado_em).localeCompare(String(a.aprovado_em)))
  };
}
function cliFvsPdf_(q, ctx) {
  if (!cliFvsLista_(ctx).some(f => String(f.id) === String(q.id))) throw new Error('FVS não disponível.');
  return fvsPdfVer_(q, ctx);
}

/* ---------- financeiro: contratos das empreiteiras e medições aprovadas/pagas (valor pelos preços do contrato) ---------- */
function cliFinanceiro_(q, ctx) {
  const calc = calcExec_(ctx), met = ctrMetricas_(ctx, calc), I = ctrAtivos_(ctx), A = obraTab_(ctx, 'ContratoAditivos').all();
  const contratos = obraTab_(ctx, 'Contratos').all().filter(c => [CTR_ST_.rasc, CTR_ST_.canc].indexOf(c.status) < 0).map(c => {
    const r = ctrResumo_(c, ctrLinhas_(I.filter(i => String(i.contrato) === String(c.id)), met), A.filter(a => String(a.contrato) === String(c.id)));
    return { numero: c.numero, empreiteiro: c.empreiteiro_nome || '', objeto: c.objeto || '', status: c.status, vigencia_fim: ymd_(c.vigencia_fim),
      contratado: r.contratado, medido: r.medido, pago: r.pago, saldo: r.saldo, pct_med: r.pct_med, pct_pago: r.pct_pago };
  });
  // valor de cada medição: quantidade medida × preço do item do contrato
  const itemCi = {}, unit = {};
  calc.etapas.forEach(e => e.itens.forEach(i => { if (i.contrato_item) itemCi[i.id] = i.contrato_item; }));
  I.forEach(i => { unit[String(i.id)] = num_(i.unitario); });
  const val = {};
  obraTab_(ctx, 'MedicaoItens').all().forEach(mi => { const ci = itemCi[mi.item_id]; if (ci) val[mi.medicao] = (val[mi.medicao] || 0) + num_(mi.qtd) * (unit[String(ci)] || 0); });
  const medicoes = obraTab_(ctx, 'Medicoes').all().filter(m => [MED_ST_.ok, MED_ST_.paga].indexOf(m.status) >= 0).map(m => ({
    id: String(m.id), numero: m.numero, empreiteiro: m.empreiteiro_nome || '', de: ymd_(m.de), ate: ymd_(m.ate), status: m.status,
    aprovado_em: fmtVal_(m.aprovado_em), pago_em: fmtVal_(m.pago_em), valor: r2_(val[m.id] || 0), pdf: !!m.pdf_id
  })).sort((a, b) => String(b.aprovado_em).localeCompare(String(a.aprovado_em)));
  const soma = k => r2_(contratos.reduce((t, c) => t + c[k], 0));
  return { contratos: contratos, medicoes: medicoes, total: { contratado: soma('contratado'), medido: soma('medido'), pago: soma('pago'), saldo: soma('saldo') } };
}
function cliMedPdf_(q, ctx) {
  const m = obraTab_(ctx, 'Medicoes').all().find(x => String(x.id) === String(q.id));
  if (!m || [MED_ST_.ok, MED_ST_.paga].indexOf(m.status) < 0) throw new Error('Medição não disponível.');
  return medPdfVer_(q, ctx);
}

/* ---------- início ---------- */
function cliInicio_(q, ctx) {
  const and = cliAndamento_(ctx), r = { cliente: cliPub_(ctx.cli, ctx.obra), obra: { nome: ctx.obra.nome, endereco: ctx.obra.endereco || '' } };
  r.andamento = { pct_exec: and.pct_exec, pct_prev: and.pct_prev, inicio: and.inicio, fim: and.fim };
  r.proximas = and.frentes.filter(f => f.ini && f.ini > and.hoje).sort((a, b) => a.ini.localeCompare(b.ini)).slice(0, 3).map(f => ({ nome: f.nome, ini: f.ini }));
  if (ctx.mods.indexOf('diario') >= 0) {
    const d = cliDiariosLib_(ctx)[0];
    r.diario = d ? cliDiaResumo_(ctx, d, obraTab_(ctx, 'Producao').all(), obraTab_(ctx, 'FotosExec').all()) : null;
  }
  if (ctx.mods.indexOf('financeiro') >= 0) {
    try { const F = cliFinanceiro_(q, ctx); r.financeiro = F.total; r.medicao = F.medicoes[0] || null; } catch (e) { r.financeiro = null; }
  }
  return r;
}

/* ---------- avisos (sino e push) do cliente ---------- */
function cliNotif_(ctx) {
  const c = cliAchar_(ctx.u.cliente_id);
  if (!c || !sim_(c.ativo)) return [];
  const o = cliObra_(c), mods = cliModulos_(c), cx = { u: ctx.u, admin: false, obra: o, perms: [], ss: SpreadsheetApp.openById(o.planilha_id) };
  const base = c.slug && c.publicado_em ? './c/' + c.slug + '/' : './', limite = Date.now() - 20 * 864e5, itens = [];
  const novo = d => d instanceof Date && d.getTime() >= limite;
  const add = (id, etapa, texto, resumo, rota, quando) => itens.push({ id: 'cli|' + id, obra: String(o.id), obra_nome: o.nome, numero: '', etapa: etapa, texto: texto, resumo: resumo || '', situacao: '', prioridade: '', quando: fmtVal_(quando), rota: rota, url: base + rota });
  if (mods.indexOf('diario') >= 0) cliDiariosLib_(cx).filter(d => novo(d.cliente_em)).forEach(d => add('d|' + d._dia, 'cli_diario', 'Diário de ' + fmtBr_(d._dia) + ' disponível', d.condicao, '#/c/diario/' + d._dia, d.cliente_em));
  if (mods.indexOf('financeiro') >= 0) obraTab_(cx, 'Medicoes').all().filter(m => (m.status === MED_ST_.ok && novo(m.aprovado_em)) || (m.status === MED_ST_.paga && novo(m.pago_em)))
    .forEach(m => add('m|' + m.id + '|' + m.status, 'cli_med', 'Medição ' + (m.numero || '') + ' · ' + (m.empreiteiro_nome || ''), m.status === MED_ST_.paga ? 'paga' : 'aprovada', '#/c/financeiro', m.status === MED_ST_.paga ? m.pago_em : m.aprovado_em));
  if (mods.indexOf('fvs') >= 0) cliFvsLista_(cx).filter(f => novo(f.aprovado_em)).forEach(f => add('f|' + f.id, 'cli_fvs', 'FVS ' + (f.numero || '') + ' aprovada', f.servico || f.modelo_nome, '#/c/qualidade', f.aprovado_em));
  return itens;
}

/* ---------- engenheiro libera (ou recolhe) o diário do dia para o portal ---------- */
function execCliente_(q, ctx) {
  const d = diarioDo_(ctx, ymd_(q.data), false);
  if (!d) throw new Error('Não há diário nesse dia.');
  if (d.status === 'Rascunho') throw new Error('Envie o diário antes de liberar para o cliente.');
  d.cliente = q.mostrar ? 'Sim' : ''; d.cliente_por = ctx.u.nome; d.cliente_em = new Date();
  obraTab_(ctx, 'Diarios').update(d);
  return { msg: q.mostrar ? 'Diário liberado para o cliente.' : 'O cliente não vê mais este diário.', cliente: !!q.mostrar };
}

/* ---------- cadastro (administrador) ---------- */
function cliAdmin_(q, ctx) {
  const U = central_('Usuarios').all(), obras = central_('Obras').all();
  return {
    clientes: central_('Clientes').all().map(c => Object.assign(pub_(c), {
      modulos: cliModulos_(c), ativo: sim_(c.ativo), obra_nome: (obras.find(o => String(o.id) === String(c.obra_id)) || {}).nome || '',
      url: c.slug && c.publicado_em ? cliUrl_(c.slug) : '',
      usuarios: U.filter(u => String(u.cliente_id) === String(c.id)).map(u => ({ id: String(u.id), nome: u.nome, login: u.login, email: u.email || '', ativo: sim_(u.ativo), ultimo_acesso: fmtVal_(u.ultimo_acesso) }))
    })),
    obras: obras.filter(o => sim_(o.ativa)).map(o => ({ id: String(o.id), nome: o.nome })),
    modulos: CLI_MODULOS_, modelos: CLI_MODELOS_, github: !!PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN'), app_url: cliUrl_('')
  };
}
function cliUrl_(slug) { return String(config_().APP_URL || APP_URL_PADRAO).replace(/\/?$/, '/') + (slug ? 'c/' + slug + '/' : ''); }
function cliSalvar_(q, ctx) {
  const T = central_('Clientes'), d = q.cliente || {};
  const nome = String(d.nome || '').trim(), slug = String(d.slug || '').trim().toLowerCase(), cor = String(d.cor || '').trim();
  if (!nome) throw new Error('Informe o nome do empreendimento (é o nome do app do cliente).');
  if (!central_('Obras').all().some(o => String(o.id) === String(d.obra_id))) throw new Error('Escolha a obra.');
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) throw new Error('Endereço: só letras minúsculas, números e hífen (3 a 40).');
  if (!/^#[0-9a-f]{6}$/i.test(cor)) throw new Error('Cor inválida.');
  let c = d.id ? T.all().find(x => String(x.id) === String(d.id)) : null;
  if (T.all().some(x => x !== c && String(x.slug) === slug)) throw new Error('Esse endereço já é de outro cliente.');
  const novo = !c;
  if (novo) c = { id: T.proxCodigo('id', 'CL', 3), criado_em: new Date(), criado_por: ctx.u.nome, ativo: 'Sim' };
  const modelo = CLI_MODELOS_[d.modelo] ? d.modelo : 'personalizado';
  c.nome = nome; c.empresa = String(d.empresa || '').trim(); c.obra_id = String(d.obra_id); c.cor = cor.toUpperCase(); c.modelo = modelo;
  c.modulos = (modelo === 'personalizado' ? [].concat(d.modulos || []).filter(m => CLI_MODULOS_[m]) : CLI_MODELOS_[modelo]).join(',');
  if (c.slug && c.slug !== slug) c.publicado_em = '';   // endereço novo precisa ser publicado de novo
  c.slug = slug;
  if (d.ativo !== undefined) c.ativo = d.ativo ? 'Sim' : 'Não';
  c.atualizado_em = new Date();
  if (novo) T.insert(c); else T.update(c);
  log_(ctx, 'cliente_salvar', c.id + ' · ' + nome);
  return { msg: novo ? 'Cliente criado.' : 'Cliente salvo.', id: c.id };
}
function cliUsuarioSalvar_(q, ctx) {
  const c = central_('Clientes').all().find(x => String(x.id) === String(q.cliente_id));
  if (!c) throw new Error('Cliente não encontrado.');
  const U = central_('Usuarios'), d = q.usuario || {};
  const nome = String(d.nome || '').trim(), login = String(d.login || '').trim().toLowerCase();
  if (!nome || !login) throw new Error('Preencha nome e usuário (login).');
  if (!/^[a-z0-9._@-]{3,}$/.test(login)) throw new Error('Login: só letras minúsculas, números, ponto, hífen ou @ (mín. 3).');
  let u = d.id ? U.all().find(x => String(x.id) === String(d.id)) : null;
  if (u && String(u.cliente_id) !== String(c.id)) throw new Error('Este usuário não é deste cliente.');
  if (U.all().some(x => x !== u && norm_(x.login) === login)) throw new Error('Já existe um usuário com esse login.');
  const novo = !u;
  if (novo) u = { id: U.proxCodigo('id', 'U', 3), criado_em: new Date(), admin: 'Não', orcamentos: '', cliente_id: String(c.id) };
  if (novo || q.senha) { definirSenha_(u, q.senha); u.trocar_senha = 'Sim'; }
  u.nome = nome; u.login = login; u.email = String(d.email || '').trim(); u.telefone = String(d.telefone || '').trim();
  u.ativo = d.ativo === false ? 'Não' : 'Sim';
  if (novo) U.insert(u); else U.update(u);
  log_(ctx, 'cliente_usuario', c.id + ' · ' + login);
  return { msg: novo ? 'Acesso criado. Envie o link, o usuário e a senha provisória ao cliente.' : q.senha ? 'Senha provisória definida.' : 'Acesso salvo.', id: u.id };
}

/* ---------- endereço próprio do cliente: c/<slug>/ com ícone, nome e cor, publicado no repositório do app ---------- */
function cliGithub_(q, ctx) {
  const tok = String(q.token || '').trim(), repo = String(q.repo || 'renancod/size').trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Repositório inválido (dono/nome).');
  if (tok.length < 20) throw new Error('Cole a chave (token) do GitHub.');
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + repo, { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('O GitHub recusou a chave (' + r.getResponseCode() + '). Confira se ela tem acesso de escrita ao repositório ' + repo + '.');
  const P = PropertiesService.getScriptProperties();
  P.setProperty('GITHUB_TOKEN', tok); P.setProperty('GITHUB_REPO', repo);
  log_(ctx, 'cliente_github', repo);
  return { msg: 'Chave do GitHub guardada no servidor.' };
}
function cliGh_(metodo, caminho, corpo) {
  const P = PropertiesService.getScriptProperties(), tok = P.getProperty('GITHUB_TOKEN'), repo = P.getProperty('GITHUB_REPO') || 'renancod/size';
  if (!tok) throw new Error('Falta a chave do GitHub: configure em Clientes → Publicação.');
  const o = { method: metodo, headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' }, muteHttpExceptions: true, contentType: 'application/json' };
  if (corpo) o.payload = JSON.stringify(corpo);
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + caminho, o), cod = r.getResponseCode();
  if (cod >= 300) throw new Error('GitHub respondeu ' + cod + ' em ' + caminho + ': ' + r.getContentText().slice(0, 200));
  return JSON.parse(r.getContentText() || '{}');
}
const CLI_CSP_ = "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://script.google.com https://script.googleusercontent.com https://fcmregistrations.googleapis.com https://fcm.googleapis.com https://firebaseinstallations.googleapis.com; frame-src blob: data:; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";
function cliArquivos_(c) {
  const h = s => String(s).replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[x]), p = 'c/' + c.slug + '/';
  const curto = String(c.nome).length <= 12 ? String(c.nome) : String(c.nome).split(/\s+/)[0].slice(0, 12);
  const index = '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<base href="../../">\n'
    + '<meta http-equiv="Content-Security-Policy" content="' + CLI_CSP_ + '">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>' + h(c.nome) + '</title>\n'
    + '<meta name="theme-color" content="' + h(c.cor) + '">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-capable" content="yes">\n'
    + '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n<meta name="apple-mobile-web-app-title" content="' + h(curto) + '">\n<meta name="format-detection" content="telephone=no">\n'
    + '<link rel="manifest" href="' + p + 'manifest.json">\n<link rel="icon" type="image/png" sizes="192x192" href="' + p + 'icon-192.png">\n'
    + '<link rel="apple-touch-icon" sizes="180x180" href="' + p + 'icon-180.png">\n<link rel="stylesheet" href="style.css">\n</head>\n<body class="portal">\n'
    + '<div id="raiz"><div class="carregando tela"><span class="spin"></span></div></div>\n<div id="modal" class="modal"></div>\n<div id="toast" class="toast"></div>\n'
    + ['cliente.js'].map(f => '<script src="' + p + f + '"></script>\n').join('')
    + ['config.js', 'app.js', 'portal.js', 'push.js', 'sw-registro.js'].map(f => '<script src="' + f + '"></script>\n').join('') + '</body>\n</html>\n';
  const manifest = {
    id: './', name: c.nome, short_name: curto, description: 'Acompanhamento da obra ' + c.nome, lang: 'pt-BR', start_url: './', scope: './', display: 'standalone',
    orientation: 'any', background_color: '#FFFFFF', theme_color: c.cor,
    icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
  };
  const cfg = { id: String(c.id), slug: c.slug, nome: c.nome, empresa: c.empresa || '', cor: c.cor, capa: c._capa ? p + 'capa.jpg' : '' };
  return { 'index.html': index, 'manifest.json': JSON.stringify(manifest, null, 2), 'cliente.js': '// gerado pelo cadastro de clientes do sistema (não editar à mão)\nwindow.CLIENTE = ' + JSON.stringify(cfg) + ';\n' };
}
/* q.imagens: { 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon-180.png', 'capa.jpg'? } em base64 (o app recorta no navegador) */
function cliPublicar_(q, ctx) {
  const T = central_('Clientes'), c = T.all().find(x => String(x.id) === String(q.id));
  if (!c) throw new Error('Cliente não encontrado.');
  if (!c.slug) throw new Error('Defina o endereço do cliente antes de publicar.');
  const im = q.imagens || {}, obrig = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon-180.png'];
  if (obrig.some(k => !im[k])) throw new Error('Escolha a imagem do empreendimento (vira o ícone do app).');
  c._capa = !!im['capa.jpg'];
  const txt = cliArquivos_(c), arq = [];
  Object.keys(txt).forEach(k => arq.push([k, Utilities.base64Encode(txt[k], Utilities.Charset.UTF_8)]));
  obrig.concat(c._capa ? ['capa.jpg'] : []).forEach(k => {
    const b = String(im[k]).replace(/^data:[^,]+,/, '');
    if (b.length > 2500000) throw new Error('Imagem grande demais (' + k + ').');
    arq.push([k, b]);
  });
  delete c._capa;
  // um commit só com todos os arquivos (o GitHub Pages publica em ~1 minuto)
  const ref = cliGh_('get', '/git/ref/heads/main'), base = cliGh_('get', '/git/commits/' + ref.object.sha);
  const tree = arq.map(([nome, b64]) => ({ path: 'app/c/' + c.slug + '/' + nome, mode: '100644', type: 'blob', sha: cliGh_('post', '/git/blobs', { content: b64, encoding: 'base64' }).sha }));
  const t = cliGh_('post', '/git/trees', { base_tree: base.tree.sha, tree: tree });
  const cm = cliGh_('post', '/git/commits', { message: 'Portal do cliente: ' + c.nome + ' (c/' + c.slug + ')', tree: t.sha, parents: [ref.object.sha] });
  cliGh_('patch', '/git/refs/heads/main', { sha: cm.sha });
  c.publicado_em = new Date(); T.update(c);
  log_(ctx, 'cliente_publicar', c.id + ' · c/' + c.slug);
  return { msg: 'Publicado. Em 1 a 2 minutos o endereço fica no ar.', url: cliUrl_(c.slug) };
}
