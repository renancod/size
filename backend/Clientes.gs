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
  if (!c.obra_id) return null;   // em negociação: ainda sem obra
  const o = central_('Obras').all().find(x => String(x.id) === String(c.obra_id));
  if (!o || !o.planilha_id) throw new Error('A obra deste acesso não foi encontrada. Fale com a Size.');
  return o;
}
function cliPub_(c, o) {
  return {
    id: String(c.id), nome: c.nome, empresa: c.empresa || '', cor: c.cor || CLI_COR_PADRAO_, slug: c.slug || '', modulos: o ? cliModulos_(c) : [], obra_nome: o ? o.nome : '',
    obra: !!o, publicado: !!c.publicado_em, capa: c.slug && c.publicado_em && sim_(c.capa) ? 'c/' + c.slug + '/capa.jpg' : '', orcamentos: cliPropostas_(c.id).length
  };
}

/* contexto das rotas cli: o cliente do usuário (ou, para o administrador pré-visualizar, q.cliente) e a planilha da obra */
function cliCtx_(q, ctx) {
  let id = ctx.u.cliente_id;
  if (!id) { if (!ctx.admin) throw new Error('Área do portal do cliente.'); id = q.cliente; }
  const c = cliAchar_(id);
  if (!c || (!sim_(c.ativo) && !ctx.admin)) throw new Error('O acesso deste cliente está desativado. Fale com a Size.');
  const mods = cliModulos_(c), mod = ROTAS[q.acao].cli;
  ctx.cli = c; ctx.perms = [];
  if (mod === 'orc') return;   // orçamentos: valem com ou sem obra
  if (!c.obra_id) throw new Error('O acompanhamento da obra ainda não foi liberado.');
  if (typeof mod === 'string' && mods.indexOf(mod) < 0) throw new Error('Esta área não está liberada para você.');
  cliAbrirObra_(ctx);
}
function cliAbrirObra_(ctx) {
  const c = ctx.cli;
  let o = authCache_('co|' + c.obra_id);
  if (!o) { o = cliObra_(c); authGuardar_('co|' + c.obra_id, o); }
  ctx.mods = cliModulos_(c); ctx.obra = o; ctx.ss = SpreadsheetApp.openById(o.planilha_id);
}
function cliSessao_(u) {
  const c = cliAchar_(u.cliente_id);
  if (!c || !sim_(c.ativo)) throw new Error('O acesso deste cliente está desativado. Fale com a Size.');
  let o = null;
  try { o = cliObra_(c); } catch (e) { /* mostra o erro ao abrir as telas */ }
  return {
    empresa: String(config_().EMPRESA || 'Size Engenharia'),
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
  const orcs = cliOrcResumo_(ctx.cli.id);
  if (!ctx.cli.obra_id) return { cliente: cliPub_(ctx.cli, null), obra: null, orcamentos: orcs };
  cliAbrirObra_(ctx);
  const and = cliAndamento_(ctx), r = { cliente: cliPub_(ctx.cli, ctx.obra), obra: { nome: ctx.obra.nome, endereco: ctx.obra.endereco || '' }, orcamentos: orcs };
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
  const o = cliObra_(c), base = c.slug && c.publicado_em ? './c/' + c.slug + '/' : './', limite = Date.now() - 20 * 864e5, itens = [];
  const novo = d => d instanceof Date && d.getTime() >= limite;
  const add = (id, etapa, texto, resumo, rota, quando) => itens.push({ id: 'cli|' + id, obra: o ? String(o.id) : '', obra_nome: o ? o.nome : c.nome, numero: '', etapa: etapa, texto: texto, resumo: resumo || '', situacao: '', prioridade: '', quando: fmtVal_(quando), rota: rota, url: base + rota });
  // orçamentos: revisão nova enviada e resposta da Size às considerações
  cliPropostas_(c.id).filter(p => p.status === 'Enviado' && novo(p.enviado_em)).forEach(p => add('o|' + p.id, 'cli_orc', 'Orçamento ' + propRotulo_(p) + ' disponível', p.empreendimento, '#/c/orcamento/' + p.id, p.enviado_em));
  const meus = {};
  cliPropostas_(c.id).forEach(p => { meus[String(p.numero)] = p; });
  central_('PropostaComentarios').all().filter(x => x.status === 'respondido' && meus[String(x.numero)] && novo(x.respondido_em))
    .forEach(x => add('r|' + x.id, 'cli_orc', 'Resposta da Size no orçamento ' + x.numero, String(x.resposta).slice(0, 80), '#/c/orcamento/' + x.proposta, x.respondido_em));
  if (!o) return itens;
  const mods = cliModulos_(c), cx = { u: ctx.u, admin: false, obra: o, perms: [], ss: SpreadsheetApp.openById(o.planilha_id) };
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
      modulos: cliModulos_(c), ativo: sim_(c.ativo), estagio: !sim_(c.ativo) ? 'Inativo' : c.obra_id ? 'Obra' : 'Negociação', orcamentos: cliOrcResumo_(c.id), obra_nome: (obras.find(o => String(o.id) === String(c.obra_id)) || {}).nome || '',
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
  // sem obra = cliente em negociação (só orçamentos); a obra é ligada quando o contrato fecha
  if (d.obra_id && !central_('Obras').all().some(o => String(o.id) === String(d.obra_id))) throw new Error('Obra não encontrada.');
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) throw new Error('Endereço: só letras minúsculas, números e hífen (3 a 40).');
  if (!/^#[0-9a-f]{6}$/i.test(cor)) throw new Error('Cor inválida.');
  let c = d.id ? T.all().find(x => String(x.id) === String(d.id)) : null;
  if (T.all().some(x => x !== c && String(x.slug) === slug)) throw new Error('Esse endereço já é de outro cliente.');
  const novo = !c;
  if (novo) c = { id: T.proxCodigo('id', 'CL', 3), criado_em: new Date(), criado_por: ctx.u.nome, ativo: 'Sim' };
  const modelo = CLI_MODELOS_[d.modelo] ? d.modelo : 'personalizado';
  c.nome = nome; c.empresa = String(d.empresa || '').trim(); c.obra_id = d.obra_id ? String(d.obra_id) : ''; c.cor = cor.toUpperCase(); c.modelo = modelo;
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
  const tok = String(q.chave || '').trim(), repo = String(q.repo || 'renancod/size').trim();
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
    id: './', name: c.nome + ' · Size Engenharia', short_name: curto, description: 'Acompanhamento da obra ' + c.nome + ' — plataforma Size Engenharia', lang: 'pt-BR', start_url: './', scope: './', display: 'standalone',
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
  const capa = !!im['capa.jpg'], dir = 'app/c/' + c.slug + '/';
  c._capa = capa;
  const txt = cliArquivos_(c);
  delete c._capa;
  // texto vai dentro da própria árvore; só as imagens precisam de envio separado (menos idas ao GitHub)
  const tree = Object.keys(txt).map(k => ({ path: dir + k, mode: '100644', type: 'blob', content: txt[k] }));
  obrig.concat(capa ? ['capa.jpg'] : []).forEach(k => {
    const b = String(im[k]).replace(/^data:[^,]+,/, '');
    if (b.length > 2500000) throw new Error('Imagem grande demais (' + k + ').');
    tree.push({ path: dir + k, mode: '100644', type: 'blob', sha: cliGh_('post', '/git/blobs', { content: b, encoding: 'base64' }).sha });
  });
  // um commit só com todos os arquivos (o GitHub Pages publica em ~1 a 2 minutos)
  const ref = cliGh_('get', '/git/ref/heads/main'), base = cliGh_('get', '/git/commits/' + ref.object.sha);
  const t = cliGh_('post', '/git/trees', { base_tree: base.tree.sha, tree: tree });
  const cm = cliGh_('post', '/git/commits', { message: 'Portal do cliente: ' + c.nome + ' (c/' + c.slug + ')', tree: t.sha, parents: [ref.object.sha] });
  cliGh_('patch', '/git/refs/heads/main', { sha: cm.sha });
  // a rota não segura a fila de gravação durante as idas ao GitHub; só aqui, para marcar publicado
  const L = LockService.getScriptLock();
  L.waitLock(20000);
  try { const T2 = central_('Clientes'); T2._rows = null; const c2 = T2.all().find(x => String(x.id) === String(q.id)); c2.publicado_em = new Date(); c2.capa = capa ? 'Sim' : ''; T2.update(c2); }
  finally { L.releaseLock(); }
  log_(ctx, 'cliente_publicar', c.id + ' · c/' + c.slug);
  return { msg: 'Publicado. Em 1 a 2 minutos o endereço fica no ar.', url: cliUrl_(c.slug) };
}

/* ---------- orçamento no portal: negociação antes do contrato ----------
 * O cliente vê as revisões ENVIADAS a ele (Propostas.cliente_id; nunca rascunho nem cancelado), na versão do cliente:
 * aberto = preço de cada item; fechado = só o total de cada etapa. Ele deixa considerações (por item ou geral) e pode aceitar
 * a revisão em vigor (com o contrato assinado, se quiser); a Size responde, faz nova revisão e é avisada no sino. */
const CLI_ORC_ST_ = ['Enviado', 'Aprovado', 'Revisado', 'Perdido'];
const CLI_ORC_TIPOS_ = { duvida: 'Dúvida', incluir: 'Incluir item', retirar: 'Retirar item', quantidade: 'Mudar quantidade', geral: 'Consideração' };
function propAceite_(p) { try { return p.aceite_json ? JSON.parse(p.aceite_json) : null; } catch (e) { return null; } }
/* o orçamento some do portal quando a revisão mais nova volta para a Size (rascunho, nova revisão em
 * andamento ou cancelado): o cliente não fica vendo a versão antiga enquanto ela é refeita */
function cliPropostas_(cid) {
  const todas = central_('Propostas').all(), ult = {};   // a revisão mais nova conta mesmo sem o cliente ligado nela
  todas.forEach(p => { const k = String(p.numero); if (!ult[k] || num_(p.revisao) > num_(ult[k].revisao)) ult[k] = p; });
  return todas.filter(p => String(p.cliente_id) === String(cid) && CLI_ORC_ST_.indexOf(p.status) >= 0 && CLI_ORC_ST_.indexOf(ult[String(p.numero)].status) >= 0);
}
function cliPropAchar_(ctx, id) {
  const p = cliPropostas_(ctx.cli.id).find(x => String(x.id) === String(id));
  if (!p) throw new Error('Orçamento não disponível.');
  return p;
}
/* uma linha por número de orçamento: a revisão mais nova enviada */
function cliOrcResumo_(cid) {
  const por = {};
  cliPropostas_(cid).forEach(p => { const k = String(p.numero); if (!por[k] || num_(p.revisao) > num_(por[k].revisao)) por[k] = p; });
  const com = central_('PropostaComentarios').all();
  return Object.keys(por).map(k => {
    const p = por[k], t = propCalc_(p, propItens_(p.id)).total;
    return { id: String(p.id), numero: p.numero, rotulo: propRotulo_(p), empreendimento: p.empreendimento, status: p.status, total: t.preco, aceite: !!p.aceite_json,
      data: fmtVal_(p.enviado_em || p.atualizado_em), respostas: com.filter(c => String(c.numero) === k && c.status === 'respondido').length, abertos: com.filter(c => String(c.numero) === k && c.status === 'aberto').length };
  }).sort((a, b) => String(b.data).localeCompare(String(a.data)));
}
function cliOrcamentos_(q, ctx) { return { orcamentos: cliOrcResumo_(ctx.cli.id) }; }
function propComentarios_(numero) {
  return central_('PropostaComentarios').all().filter(c => String(c.numero) === String(numero)).map(c => ({
    id: String(c.id), proposta: String(c.proposta), item: String(c.item || ''), item_desc: c.item_desc || '', tipo: c.tipo, tipo_txt: CLI_ORC_TIPOS_[c.tipo] || c.tipo,
    texto: c.texto, autor: c.autor, autor_tipo: c.autor_tipo, em: fmtVal_(c.em), status: c.status, resposta: c.resposta || '', respondido_por: c.respondido_por || '', respondido_em: fmtVal_(c.respondido_em)
  })).sort((a, b) => String(a.em).localeCompare(String(b.em)));
}
/* versão do cliente. Fechado: só o total de cada etapa. Aberto (planilha aberta): preço de cada item com o custo
 * (material e mão de obra / serviço), o BDI e a administração (gestão), e os insumos das composições (cli_orc_insumos).
 * Nunca vai observação interna nem o código da composição da base. */
function cliOrcPub_(p) {
  const calc = propCalc_(p, propItens_(p.id)), aberto = p.portal_modo !== 'fechado', et = [];
  let atual = null;
  calc.linhas.forEach(l => {
    if (l.tipo === 'E') {
      const e = calc.etapas.find(x => x.codigo === l.codigo) || {};
      atual = { codigo: l.codigo, descricao: l.descricao, preco: e.preco || 0, itens: [] };
      if (aberto) Object.assign(atual, { custo: e.custo || 0, bdi: e.bdi || 0, gestao: e.gestao || 0 });
      et.push(atual); return;
    }
    const i = { codigo: l.codigo, descricao: l.descricao, unidade: l.unidade, qtd: l.qtd };
    if (aberto) Object.assign(i, {
      preco_unit: l.preco_unit, preco: l.preco, custo_unit: propR2_(l.custo_unit), unit_mat: propR2_(l.unit_mat), unit_serv: propR2_(l.unit_mo + l.unit_eq + l.unit_sv),
      custo: l.custo, v_mat: l.v_mat, v_serv: l.v_serv, bdi: l.bdi, gestao: l.gestao, sem_bdi: l.sem_bdi, sem_gestao: l.sem_gestao,
      insumos: !!l.comp_cod && l.fonte !== 'SINAPI-INSUMO', fonte: l.fonte ? 'SINAPI' : ''
    });
    if (!atual) { atual = { codigo: '', descricao: 'Itens', preco: 0, itens: [] }; et.push(atual); }
    atual.itens.push(i);
  });
  let crono = null;
  try { const C = propCrono_(p, calc); crono = C && C.linhas ? C.linhas.filter(l => l.ini && l.fim).map(l => ({ codigo: l.codigo, descricao: l.descricao, ini: l.ini, fim: l.fim })) : null; } catch (e) { /* sem cronograma */ }
  const val = p.data_base && num_(p.validade_dias) ? (() => { const d = new Date(String(baseData_(p.data_base)) + 'T12:00:00'); d.setDate(d.getDate() + num_(p.validade_dias)); return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); })() : '';
  return {
    id: String(p.id), numero: p.numero, revisao: num_(p.revisao), rotulo: propRotulo_(p), status: p.status, modo: aberto ? 'aberto' : 'fechado',
    cliente: p.cliente, empreendimento: p.empreendimento, local: p.local || '', data_base: baseData_(p.data_base), validade_ate: val,
    prazo_txt: p.prazo_txt || '', pagamento_txt: p.pagamento_txt || '', texto_cliente: p.texto_cliente || '', total: calc.total.preco,
    resumo: aberto ? { custo: calc.total.custo, v_mat: calc.total.v_mat, v_serv: calc.total.v_serv, bdi: calc.total.bdi, gestao: calc.total.gestao,
      bdi_pct: num_(p.bdi_pct), gestao_pct: num_(p.gestao_pct), bdi_base: p.bdi_base === 'total' ? 'custo total' : 'mão de obra e serviços', gestao_base: p.gestao_base === 'total' ? 'custo total' : 'mão de obra e serviços' } : null,
    etapas: et, cronograma: crono && crono.length ? crono : null, contrato: p.contrato_id ? p.contrato_nome || 'contrato.pdf' : '', aceite: propAceite_(p)
  };
}
/* o que mudou entre duas revisões enviadas (para o cliente ver o resultado da negociação) */
function cliOrcDif_(a, b) {
  const mapa = o => { const m = {}; o.etapas.forEach(e => e.itens.forEach(i => { m[norm_(i.descricao)] = i; })); return m; };
  const A = mapa(a), B = mapa(b), r = { novos: [], retirados: [], alterados: [] };
  Object.keys(B).forEach(k => { if (!A[k]) r.novos.push(B[k].codigo); else if (A[k].qtd !== B[k].qtd || (A[k].preco != null && A[k].preco !== B[k].preco)) r.alterados.push(B[k].codigo); });
  Object.keys(A).forEach(k => { if (!B[k]) r.retirados.push(A[k].descricao); });
  return r;
}
function cliOrcamento_(q, ctx) {
  const p = cliPropAchar_(ctx, q.id), o = cliOrcPub_(p);
  const revs = cliPropostas_(ctx.cli.id).filter(x => String(x.numero) === String(p.numero)).sort((a, b) => num_(a.revisao) - num_(b.revisao));
  const ant = revs.filter(x => num_(x.revisao) < num_(p.revisao)).pop();
  o.revisoes = revs.map(x => ({ id: String(x.id), rotulo: propRotulo_(x), status: x.status }));
  o.diferencas = ant ? Object.assign({ de: propRotulo_(ant) }, cliOrcDif_(cliOrcPub_(ant), o)) : null;
  o.comentarios = propComentarios_(p.numero);
  o.pode_comentar = p.status === 'Enviado';
  o.pode_aceitar = p.status === 'Enviado' && !p.aceite_json;
  o.empresa = String(config_().EMPRESA || 'Size Engenharia');
  return o;
}
function cliOrcComentar_(q, ctx) {
  const p = cliPropAchar_(ctx, q.id);
  if (p.status !== 'Enviado') throw new Error('Esta revisão não está mais em negociação.');
  const texto = String(q.texto || '').trim(), tipo = CLI_ORC_TIPOS_[q.tipo] ? q.tipo : 'geral';
  if (texto.length < 3) throw new Error('Escreva a sua consideração.');
  let desc = '';
  if (q.item) { const l = propItens_(p.id).find(x => String(x.codigo) === String(q.item) && x.tipo !== 'E'); if (!l) throw new Error('Item não encontrado.'); desc = l.descricao; }
  central_('PropostaComentarios').insert({ id: 'PC-' + Utilities.getUuid().slice(0, 8), proposta: p.id, numero: p.numero, item: q.item ? String(q.item) : '', item_desc: desc, tipo: tipo,
    texto: texto.slice(0, 2000), autor_tipo: 'cliente', autor: ctx.u.nome, em: new Date(), status: 'aberto' });
  log_(ctx, 'cliente_comentario', propRotulo_(p) + ' · ' + tipo);
  return { msg: 'Enviado à Size. Você recebe a resposta aqui.' };
}
function cliPasta_(nome) {
  const r = raizPasta_(), it = r.getFoldersByName('Orçamentos de clientes'), f = it.hasNext() ? it.next() : r.createFolder('Orçamentos de clientes');
  const it2 = f.getFoldersByName(nome);
  return it2.hasNext() ? it2.next() : f.createFolder(nome);
}
function cliArquivoSalvar_(arq, pasta, prefixo) {
  const b64 = String(arq.b64 || '').replace(/^data:[^,]+,/, ''), nome = String(arq.nome || 'arquivo.pdf').replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
  if (!b64) throw new Error('Arquivo vazio.');
  if (b64.length > 14000000) throw new Error('Arquivo grande demais (máx. 10 MB).');
  const mime = /^(application\/pdf|image\/(jpeg|png))$/.test(arq.mime || '') ? arq.mime : 'application/pdf';
  const f = pasta.createFile(Utilities.newBlob(Utilities.base64Decode(b64), mime, prefixo + ' - ' + nome));
  return { id: f.getId(), nome: nome };
}
function cliOrcAceitar_(q, ctx) {
  const T = central_('Propostas'), p = cliPropAchar_(ctx, q.id);
  if (p.status !== 'Enviado') throw new Error('Esta revisão não está mais em negociação.');
  if (p.aceite_json) throw new Error('Este orçamento já foi aceito.');
  const nome = String(q.nome || '').trim();
  if (nome.length < 5) throw new Error('Informe o seu nome completo para registrar o aceite.');
  if (!q.concordo) throw new Error('Confirme que leu e aceita o orçamento.');
  const t = propCalc_(p, propItens_(p.id)).total, a = { nome: nome.slice(0, 120), doc: String(q.doc || '').trim().slice(0, 30), usuario: ctx.u.nome, login: ctx.u.login, em: agora_(), revisao: propRotulo_(p), total: t.preco };
  if (q.arquivo && q.arquivo.b64) { const f = cliArquivoSalvar_(q.arquivo, cliPasta_(String(p.numero)), 'Aceite ' + propRotulo_(p)); a.arquivo_id = f.id; a.arquivo_nome = f.nome; }
  p.aceite_json = JSON.stringify(a);
  p.status = 'Aprovado'; p.decidido_em = new Date(); p.atualizado_em = new Date(); p.atualizado_por = 'Cliente: ' + ctx.u.nome;
  propHist_(p, ctx, 'Aceito pelo cliente', nome + (a.arquivo_nome ? ' · contrato anexado' : '') + ' · ' + propRotulo_(p));
  T.update(p);
  log_(ctx, 'cliente_aceite', propRotulo_(p) + ' · ' + nome);
  return { msg: 'Orçamento aceito. A Size foi avisada e entra em contato para os próximos passos.' };
}
/* contrato que a Size anexou ou o arquivo que o cliente mandou no aceite */
function cliOrcArquivo_(q, ctx) {
  const p = cliPropAchar_(ctx, q.id), a = propAceite_(p) || {}, id = q.qual === 'aceite' ? a.arquivo_id : p.contrato_id;
  if (!id) throw new Error('Arquivo não disponível.');
  const f = DriveApp.getFileById(id);
  return { nome: f.getName(), mime: f.getMimeType(), b64: Utilities.base64Encode(f.getBlob().getBytes()) };
}

/* ---------- lado da Size ---------- */
function propPortal_(q, ctx) {
  const T = central_('Propostas'), p = propAchar_(q.id);
  if (q.cliente_id && !central_('Clientes').all().some(c => String(c.id) === String(q.cliente_id))) throw new Error('Cliente não encontrado.');
  p.cliente_id = q.cliente_id ? String(q.cliente_id) : '';
  p.portal_modo = q.modo === 'fechado' ? 'fechado' : 'aberto';
  p.atualizado_em = new Date(); p.atualizado_por = ctx.u.nome;
  propHist_(p, ctx, 'Portal do cliente', p.cliente_id ? 'cliente ' + p.cliente_id + ' · ' + (p.portal_modo === 'fechado' ? 'só total por etapa' : 'preço por item') : 'retirado do portal');
  T.update(p);
  return { msg: p.cliente_id ? (p.status === 'Rascunho' ? 'Ligado ao cliente. Ele vê quando você enviar o orçamento.' : 'O cliente já vê este orçamento no portal.') : 'Retirado do portal do cliente.' };
}
function propContrato_(q, ctx) {
  const T = central_('Propostas'), p = propAchar_(q.id);
  if (q.remover) { p.contrato_id = ''; p.contrato_nome = ''; }
  else { const f = cliArquivoSalvar_(q.arquivo || {}, cliPasta_(String(p.numero)), 'Contrato ' + propRotulo_(p)); p.contrato_id = f.id; p.contrato_nome = f.nome; }
  propHist_(p, ctx, 'Contrato', q.remover ? 'removido' : 'anexado: ' + p.contrato_nome);
  T.update(p);
  return { msg: q.remover ? 'Contrato removido.' : 'Contrato anexado: o cliente baixa pelo portal.' };
}
function propResponder_(q, ctx) {
  const T = central_('PropostaComentarios'), c = T.all().find(x => String(x.id) === String(q.id));
  if (!c) throw new Error('Consideração não encontrada.');
  const r = String(q.resposta || '').trim();
  if (r.length < 2) throw new Error('Escreva a resposta.');
  c.resposta = r.slice(0, 2000); c.respondido_por = ctx.u.nome; c.respondido_em = new Date(); c.status = 'respondido';
  T.update(c);
  return { msg: 'Resposta enviada ao cliente.' };
}
/* sino da Size: considerações novas e aceites pelo app (para quem gerencia orçamentos) */
function propNotifCli_(ctx) {
  if (nivelBase_(ctx.u) !== 'Gerir') return [];
  const P = {}, itens = [];
  central_('Propostas').all().forEach(p => { P[String(p.id)] = p; });
  central_('PropostaComentarios').all().filter(c => c.autor_tipo === 'cliente' && c.status === 'aberto').forEach(c => {
    const p = P[String(c.proposta)] || {};
    itens.push({ id: 'pc|' + c.id, obra: '', obra_nome: 'Orçamentos', numero: propRotulo_(p), etapa: 'prop_cli', rota: '#/orc/orcamento/' + c.proposta,
      texto: (CLI_ORC_TIPOS_[c.tipo] || 'Consideração') + ' do cliente: ' + String(c.texto).slice(0, 80), resumo: c.autor, situacao: '', prioridade: '', quando: fmtVal_(c.em) });
  });
  Object.keys(P).forEach(k => { const p = P[k], a = propAceite_(p); if (a && p.status === 'Aprovado' && !p.obra_id) itens.push({ id: 'pa|' + p.id, obra: '', obra_nome: 'Orçamentos', numero: propRotulo_(p), etapa: 'prop_cli', rota: '#/orc/orcamento/' + p.id, texto: 'Aceito pelo cliente no app (' + a.nome + ') — gerar a obra', resumo: '', situacao: '', prioridade: '', quando: a.em }); });
  return itens;
}

/* insumos da composição de um item (só na planilha aberta): da base da Size (abre as auxiliares) ou do SINAPI */
function cliOrcInsumos_(q, ctx) {
  const p = cliPropAchar_(ctx, q.id);
  if (p.portal_modo === 'fechado') throw new Error('Este orçamento mostra só o total de cada etapa.');
  const l = propItens_(p.id).find(x => x.tipo !== 'E' && String(x.codigo) === String(q.item));
  if (!l || !l.comp_cod || l.fonte === 'SINAPI-INSUMO') throw new Error('Este item não tem composição.');
  const r = { descricao: l.descricao, unidade: l.unidade, qtd: num_(l.qtd), custo_unit: propR2_(num_(l.unit_mat) + num_(l.unit_mo) + num_(l.unit_eq) + num_(l.unit_sv)), insumos: [], fonte: l.fonte ? 'SINAPI' : 'Size' };
  if (l.fonte === 'SINAPI') {
    const s = sinapiComposicao_({ codigo: l.comp_cod }, ctx), reg = p.sinapi_regime === 'cd' ? 'preco_cd' : 'preco_sd';
    r.insumos = s.itens.map(i => ({ codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, tipo: i.tipo === 'C' ? 'Composição auxiliar' : sinCat_(i.classe) === 'mat' ? 'Material' : sinCat_(i.classe) === 'eq' ? 'Equipamento' : sinCat_(i.classe) === 'sv' ? 'Serviço' : 'Mão de obra', coef: i.coef, preco: i[reg] }));
    r.referencia = 'SINAPI ' + sinMesTxt_(s.mes) + (p.sinapi_regime === 'cd' ? ' desonerado' : ' não desonerado');
  } else {
    const ix = baseIndice_(), acc = {};
    if (!ix.C[String(l.comp_cod)]) throw new Error('A composição deste item não está mais disponível.');
    const abre = (cod, fator, pilha) => (ix.itens[String(cod)] || []).forEach(x => {
      const k = fator * num_(x.coef);
      if (x.ref_tipo === 'C') { if (ix.C[String(x.ref)] && pilha.indexOf(String(x.ref)) < 0) abre(x.ref, k, pilha.concat(String(x.ref))); return; }
      const i = ix.I[String(x.ref)];
      if (!i) return;
      const preco = basePrecoProprio_(x) ? num_(x.preco) : num_(i.preco), key = i.codigo + '|' + preco;
      const a = acc[key] || (acc[key] = { codigo: String(i.codigo), descricao: i.descricao, unidade: i.unidade, tipo: i.tipo || 'Material', coef: 0, preco: preco });
      a.coef += k;
    });
    abre(l.comp_cod, 1, [String(l.comp_cod)]);
    r.insumos = Object.values(acc);
    r.referencia = 'base de preços da Size';
  }
  r.insumos.forEach(i => { i.coef = Math.round(i.coef * 1e6) / 1e6; i.custo = propR2_(i.coef * i.preco); i.qtd_total = Math.round(i.coef * r.qtd * 1e4) / 1e4; });
  r.insumos.sort((a, b) => b.custo - a.custo);
  r.soma = propR2_(r.insumos.reduce((t, i) => t + i.custo, 0));
  return r;
}

/* ---------- relatórios do cliente (folhas para imprimir / salvar PDF no portal) ----------
 * Andamento: o relatório "andamento" da obra (sem R$), sem as ocorrências e com fotos só dos dias liberados.
 * RDO: o diário do dia liberado, sem ocorrências, observações nem avisos internos. */
function cliRelAndamento_(q, ctx) {
  const r = obraRelatorio_({ modelo: 'andamento', de: q.de, ate: q.ate, fotos: false }, ctx);
  const lib = {};
  cliDiariosLib_(ctx).forEach(d => { lib[d._dia] = 1; });
  const et = {};
  obraTab_(ctx, 'Etapas').all().forEach(e => { et[String(e.codigo)] = e.nome; });
  r.fotos = obraTab_(ctx, 'FotosExec').all().filter(f => { const d = ymd_(f.data); return lib[d] && d >= r.de && d <= r.ate; })
    .sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 8).map(f => {
      let b64 = '';
      try { b64 = Utilities.base64Encode(DriveApp.getFileById(f.mini_id || f.file_id).getBlob().getBytes()); } catch (e) { /* foto apagada */ }
      return { b64: b64, legenda: f.legenda || '', data: ymd_(f.data), etapa: et[String(f.etapa)] || '' };
    }).filter(f => f.b64);
  r.ocorrencias = [];
  r.emissor = 'Size Engenharia';
  r.cliente = cliPub_(ctx.cli, ctx.obra);
  return r;
}
function cliRdo_(q, ctx) {
  const dia = ymd_(q.data);
  if (!cliDiariosLib_(ctx).some(d => d._dia === dia)) throw new Error('Diário não disponível.');
  const r = execRdo_({ data: dia }, ctx), d = r.diario;
  r.diario = { numero: d.numero, data: d.data, status: d.status, condicao: d.condicao, responsavel: d.responsavel, revisado_por: d.revisado_por, revisado_em: d.revisado_em, clima: d.clima };
  r.servicos.forEach(s => { delete s.obs; });
  r.avisos = [];
  r.fotos = r.fotos.filter(f => f.b64).map(f => ({ b64: f.b64, legenda: f.legenda || '', tirada_em: f.tirada_em }));
  r.cliente = cliPub_(ctx.cli, ctx.obra);
  return r;
}
