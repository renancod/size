/**
 * COMPRAS · Size Engenharia — API (Google Apps Script, projeto independente).
 *
 * Estrutura:
 *  - Planilha central "Size · Cadastros": usuários, acessos, obras, perfis, materiais padrão, configurações.
 *  - Uma planilha por obra: pedidos, itens, orçamentos, fornecedores, materiais, frentes, recebimentos, estoque.
 *
 * Implantar > Nova implantação > App da Web: executar como "Eu", acesso "Qualquer pessoa".
 * Antes da primeira implantação rode setup() no editor (veja Setup.gs).
 */
const SESSAO_DIAS = 30;

function doGet() {
  return ContentService.createTextOutput('Compras Size API ok');
}

function doPost(e) {
  let out;
  try {
    const q = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = { ok: true, dados: rota_(q) };
  } catch (err) {
    out = { ok: false, erro: err && err.message ? err.message : String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- rotas ----------
 * pub: sem login · admin: só administradores · obra: precisa de q.obra · perm: permissão (ou lista: basta uma)
 * lock: ação que grava (serializada com LockService)
 */
const ROTAS = {
  login: { pub: true, fn: login_ },
  forn_dados: { pub: true, fn: fornRota_ },
  forn_orcamento: { pub: true, fn: fornRota_ },
  forn_entrega: { pub: true, fn: fornRota_ },
  forn_nf: { pub: true, fn: fornRota_ },
  forn_arquivo: { pub: true, fn: fornRota_ },
  forn_link: { obra: true, perm: ['compras_cotar', 'compras_liberar', 'financeiro'], fn: fornLink_ },
  sessao: { fn: (q, ctx) => sessaoDe_(ctx.u) },
  trocarSenha: { lock: true, fn: trocarSenha_ },
  notificacoes: { fn: notificacoes_ },

  obra_dados: { obra: true, fn: obraDados_ },
  pedidos_listar: { obra: true, fn: pedidosListar_ },
  pedido_detalhe: { obra: true, fn: pedidoDetalhe_ },
  pedido_criar: { obra: true, perm: 'pedido_abrir', lock: true, fn: pedidoCriar_ },
  pedido_cotar: { obra: true, perm: 'compras_cotar', lock: true, fn: pedidoCotar_ },
  orcamento_salvar: { obra: true, perm: 'compras_cotar', lock: true, fn: orcamentoSalvar_ },
  orcamento_excluir: { obra: true, perm: 'compras_cotar', lock: true, fn: orcamentoExcluir_ },
  pedido_definir: { obra: true, perm: 'compras_definir', lock: true, fn: pedidoDefinir_ },
  pedido_aprovar: { obra: true, perm: 'compras_aprovar', lock: true, fn: pedidoAprovar_ },
  pedido_devolver: { obra: true, perm: 'compras_aprovar', lock: true, fn: pedidoDevolver_ },
  pedido_pagar: { obra: true, perm: 'financeiro', lock: true, fn: pedidoPagar_ },
  pedido_liberar: { obra: true, perm: 'compras_liberar', lock: true, fn: pedidoLiberar_ },
  pedido_receber: { obra: true, perm: 'pedido_receber', lock: true, fn: pedidoReceber_ },
  pedido_nf: { obra: true, perm: ['financeiro', 'pedido_receber', 'compras_cotar'], lock: true, fn: pedidoNF_ },
  pedido_cancelar: { obra: true, perm: 'compras_cancelar', lock: true, fn: pedidoCancelar_ },
  arquivo_anexar: { obra: true, lock: true, fn: arquivoAnexar_ },
  arquivo_ver: { obra: true, fn: arquivoVer_ },
  capturar_emails: { obra: true, perm: 'compras_cotar', fn: () => capturarEmails() },

  estoque_saldo: { obra: true, perm: ['estoque_ver', 'estoque_movimentar', 'pedido_receber'], fn: estoqueSaldo_ },
  estoque_extrato: { obra: true, perm: ['estoque_ver', 'estoque_movimentar', 'pedido_receber'], fn: estoqueExtrato_ },
  estoque_movimentar: { obra: true, perm: 'estoque_movimentar', lock: true, fn: estoqueMovimentar_ },

  cad_salvar: { obra: true, lock: true, fn: cadSalvar_ },

  exec_dados: { obra: true, perm: ['exec_ver', 'exec_lancar', 'exec_planejar'], fn: execDados_ },
  exec_etapa: { obra: true, perm: ['exec_ver', 'exec_lancar', 'exec_planejar'], fn: execEtapa_ },
  exec_diario: { obra: true, perm: ['exec_ver', 'exec_lancar', 'exec_planejar'], fn: execDiario_ },
  exec_clima_salvar: { obra: true, perm: ['exec_lancar', 'exec_planejar'], lock: true, fn: execClimaSalvar_ },
  exec_rdo: { obra: true, perm: ['exec_ver', 'exec_lancar', 'exec_planejar'], fn: execRdo_ },
  exec_foto_ver: { obra: true, perm: ['exec_ver', 'exec_lancar', 'exec_planejar'], fn: execFotoVer_ },
  exec_diario_salvar: { obra: true, perm: ['exec_lancar', 'exec_planejar'], lock: true, fn: execDiarioSalvar_ },
  exec_foto: { obra: true, perm: ['exec_lancar', 'exec_planejar'], lock: true, fn: execFoto_ },
  exec_equipe_salvar: { obra: true, perm: ['exec_lancar', 'exec_planejar'], lock: true, fn: execEquipeSalvar_ },
  exec_aviso_ciente: { obra: true, perm: ['exec_ver', 'exec_lancar', 'exec_planejar'], lock: true, fn: execAvisoCiente_ },
  exec_etapa_salvar: { obra: true, perm: 'exec_planejar', lock: true, fn: execEtapaSalvar_ },
  exec_item_alterar: { obra: true, perm: 'exec_planejar', lock: true, fn: execItemAlterar_ },
  exec_aviso_salvar: { obra: true, perm: 'exec_planejar', lock: true, fn: execAvisoSalvar_ },
  exec_revisar: { obra: true, perm: 'exec_planejar', lock: true, fn: execRevisar_ },

  admin_dados: { admin: true, fn: adminDados_ },
  admin_usuario_salvar: { admin: true, lock: true, fn: adminUsuarioSalvar_ },
  admin_senha: { admin: true, lock: true, fn: adminSenha_ },
  admin_obra_criar: { admin: true, lock: true, fn: adminObraCriar_ },
  admin_obra_salvar: { admin: true, lock: true, fn: adminObraSalvar_ },
  admin_config_salvar: { admin: true, lock: true, fn: adminConfigSalvar_ },
  admin_perfil_salvar: { admin: true, lock: true, fn: adminPerfilSalvar_ },
  admin_padrao_salvar: { admin: true, lock: true, fn: adminPadraoSalvar_ },
  admin_padrao_excluir: { admin: true, lock: true, fn: adminPadraoExcluir_ },
  admin_servico_salvar: { admin: true, lock: true, fn: adminServicoSalvar_ }
};

function rota_(q) {
  const r = ROTAS[q.acao];
  if (!r) throw new Error('Ação desconhecida: ' + q.acao);
  if (r.pub) return r.fn(q);
  const ctx = { u: usuarioDoToken_(q.token) };
  ctx.admin = sim_(ctx.u.admin);
  if (r.admin && !ctx.admin) throw new Error('Apenas administradores.');
  if (r.obra) abrirObra_(ctx, q.obra);
  if (r.perm) exigir_(ctx, r.perm);
  if (!r.lock) return r.fn(q, ctx);
  const L = LockService.getScriptLock();
  L.waitLock(30000);
  try { return r.fn(q, ctx); } finally { L.releaseLock(); }
}

/* ---------- permissões ---------- */
const PERMISSOES = {
  pedido_abrir: 'Abrir pedidos',
  pedido_ver_todos: 'Ver todos os pedidos da obra',
  pedido_receber: 'Receber pedidos (conferência)',
  estoque_ver: 'Ver estoque',
  estoque_movimentar: 'Registrar saídas e ajustes de estoque',
  compras_cotar: 'Pedir cotação e registrar orçamentos',
  compras_definir: 'Definir fornecedor e valor da compra',
  compras_aprovar: 'Aprovar compras',
  compras_liberar: 'Liberar entrega',
  compras_cancelar: 'Cancelar pedidos',
  financeiro: 'Financeiro (pagamentos e notas fiscais)',
  cad_materiais: 'Cadastrar materiais',
  cad_fornecedores: 'Cadastrar fornecedores',
  cad_frentes: 'Cadastrar frentes de trabalho',
  exec_ver: 'Execução: ver etapas, painel e diários',
  exec_lancar: 'Execução: lançar diário de obra (quantidades, equipes, fotos)',
  exec_planejar: 'Execução: planejar etapas, alterar previsto, corrigir lançamentos e avisar a equipe'
};
const PERFIS_PADRAO = [
  ['Admin', Object.keys(PERMISSOES).join(','), 'Tudo na obra'],
  ['Aprovador', 'pedido_ver_todos,estoque_ver,compras_aprovar,compras_cancelar', 'Aprova ou reprova as compras definidas pelo setor de Compras'],
  ['Compras', 'pedido_abrir,pedido_ver_todos,estoque_ver,compras_cotar,compras_definir,compras_liberar,compras_cancelar,cad_materiais,cad_fornecedores', 'Cotação, definição da compra e liberação de entrega (não aprova)'],
  ['Estoque', 'pedido_abrir,pedido_ver_todos,pedido_receber,estoque_ver,estoque_movimentar,cad_materiais,cad_frentes', 'Abre pedidos, recebe na obra e controla o estoque'],
  ['Financeiro', 'pedido_ver_todos,financeiro', 'Pagamentos e notas fiscais'],
  ['Solicitante', 'pedido_abrir', 'Só abre e acompanha os próprios pedidos'],
  ['Encarregado', 'exec_ver,exec_lancar,pedido_abrir', 'Lança o diário de obra (quantidades, equipes, fotos) e abre pedidos de material'],
  ['Engenheiro', 'exec_ver,exec_lancar,exec_planejar,pedido_abrir,pedido_ver_todos,estoque_ver', 'Planeja as etapas, acompanha a produção, revisa os diários e avisa a equipe']
];

function permsDe_(u, obraId) {
  if (sim_(u.admin)) return Object.keys(PERMISSOES);
  const a = central_('Acessos').all().find(x => String(x.usuario_id) === String(u.id) && String(x.obra_id) === String(obraId));
  return a ? String(a.permissoes || '').split(',').map(s => s.trim()).filter(Boolean) : null;
}
function pode_(ctx, p) {
  return ctx.admin || [].concat(p).some(x => ctx.perms.indexOf(x) >= 0);
}
function exigir_(ctx, p) {
  if (!pode_(ctx, p)) throw new Error('Você não tem permissão para isso nesta obra (' + [].concat(p).map(x => PERMISSOES[x] || x).join(' / ') + ').');
}
function abrirObra_(ctx, obraId) {
  const o = central_('Obras').all().find(x => String(x.id) === String(obraId));
  if (!o) throw new Error('Escolha uma obra.');
  const perms = permsDe_(ctx.u, o.id);
  if (!perms) throw new Error('Você não tem acesso à obra ' + o.nome + '.');
  if (!sim_(o.ativa) && !ctx.admin) throw new Error('A obra ' + o.nome + ' está desativada.');
  ctx.obra = o;
  ctx.perms = perms;
  ctx.ss = SpreadsheetApp.openById(o.planilha_id);
}

/* ---------- login e sessão ---------- */
function hash_(senha, salt) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + senha, Utilities.Charset.UTF_8));
}
function segredo_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('SEGREDO');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SEGREDO', s); }
  return s;
}
function assinar_(txt) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(txt, segredo_()));
}
function token_(uid) {
  const c = Utilities.base64EncodeWebSafe(JSON.stringify({ u: String(uid), e: Date.now() + SESSAO_DIAS * 864e5 }), Utilities.Charset.UTF_8);
  return c + '.' + assinar_(c);
}
function usuarioDoToken_(t) {
  const a = String(t || '').split('.');
  if (a.length !== 2 || assinar_(a[0]) !== a[1]) throw new Error('Sessão inválida. Entre novamente.');
  const d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(a[0])).getDataAsString());
  if (d.e < Date.now()) throw new Error('Sessão expirada. Entre novamente.');
  const u = central_('Usuarios').all().find(x => String(x.id) === d.u);
  if (!u || !sim_(u.ativo)) throw new Error('Sessão inválida: usuário desativado.');
  return u;
}
function login_(q) {
  const login = norm_(q.login), senha = String(q.senha || '');
  if (!login || !senha) throw new Error('Informe usuário e senha.');
  const T = central_('Usuarios');
  const u = T.all().find(x => norm_(x.login) === login || (x.email && norm_(x.email) === login));
  if (!u || !sim_(u.ativo) || hash_(senha, u.salt) !== u.senha_hash) {
    Utilities.sleep(800);
    throw new Error('Usuário ou senha incorretos.');
  }
  u.ultimo_acesso = new Date();
  T.update(u);
  return Object.assign({ token: token_(u.id) }, sessaoDe_(u));
}
function sessaoDe_(u) {
  const admin = sim_(u.admin);
  const obras = central_('Obras').all()
    .filter(o => sim_(o.ativa) || admin)
    .map(o => ({ id: String(o.id), sigla: o.sigla, nome: o.nome, ativa: sim_(o.ativa), permissoes: permsDe_(u, o.id) }))
    .filter(o => o.permissoes);
  return {
    usuario: { id: String(u.id), nome: u.nome, login: u.login, email: u.email, admin: admin, trocar_senha: sim_(u.trocar_senha) },
    obras: obras,
    permissoes: PERMISSOES
  };
}
function trocarSenha_(q, ctx) {
  const T = central_('Usuarios'), u = T.all().find(x => String(x.id) === String(ctx.u.id));
  if (hash_(String(q.atual || ''), u.salt) !== u.senha_hash) throw new Error('Senha atual incorreta.');
  definirSenha_(u, q.nova);
  u.trocar_senha = 'Não';
  T.update(u);
  return { msg: 'Senha alterada.' };
}
function definirSenha_(u, senha) {
  senha = String(senha || '');
  if (senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  u.salt = Utilities.getUuid();
  u.senha_hash = hash_(senha, u.salt);
}
