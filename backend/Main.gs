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
const SESSAO_DIAS = 14;
const LOGIN_MAX_FALHAS = 5, LOGIN_BLOQUEIO_MIN = 15;

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
 * base: nível mínimo no módulo Orçamentos (Ver | Gerir), que não depende de obra
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
  push_registrar: { lock: true, fn: pushRegistrar_ },
  push_remover: { lock: true, fn: pushRemover_ },
  push_teste: { fn: pushTeste_ },

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
  exec_relatorio: { obra: true, perm: 'exec_planejar', fn: execRelatorio_ },
  fvs_modelos: { obra: true, perm: ['fvs_ver', 'fvs_preencher', 'fvs_aprovar', 'exec_planejar'], fn: fvsModelos_ },
  fvs_modelo_salvar: { obra: true, perm: 'fvs_aprovar', lock: true, fn: fvsModeloSalvar_ },
  fvs_listar: { obra: true, perm: ['fvs_ver', 'fvs_preencher', 'fvs_aprovar'], fn: fvsListar_ },
  fvs_detalhe: { obra: true, perm: ['fvs_ver', 'fvs_preencher', 'fvs_aprovar'], fn: fvsDetalhe_ },
  fvs_criar: { obra: true, perm: ['fvs_preencher', 'exec_planejar'], lock: true, fn: fvsCriar_ },
  fvs_salvar: { obra: true, perm: 'fvs_preencher', lock: true, fn: fvsSalvar_ },
  fvs_nova_vistoria: { obra: true, perm: 'fvs_preencher', lock: true, fn: fvsNovaVistoria_ },
  fvs_anexo: { obra: true, perm: 'fvs_preencher', lock: true, fn: fvsAnexo_ },
  fvs_anexo_remover: { obra: true, perm: 'fvs_preencher', lock: true, fn: fvsAnexoRemover_ },
  medicoes: { obra: true, perm: ['medicao_ver', 'medicao_lancar', 'medicao_aprovar'], fn: medListar_ },
  medicao_prever: { obra: true, perm: ['medicao_lancar', 'medicao_aprovar'], fn: medPrever_ },
  medicao_detalhe: { obra: true, perm: ['medicao_ver', 'medicao_lancar', 'medicao_aprovar'], fn: medDetalhe_ },
  medicao_criar: { obra: true, perm: 'medicao_lancar', lock: true, fn: medCriar_ },
  medicao_salvar: { obra: true, perm: 'medicao_lancar', lock: true, fn: medSalvar_ },
  medicao_enviar: { obra: true, perm: 'medicao_lancar', lock: true, fn: medEnviar_ },
  medicao_aprovar: { obra: true, perm: 'medicao_aprovar', lock: true, fn: medAprovar_ },
  medicao_devolver: { obra: true, perm: 'medicao_aprovar', lock: true, fn: medDevolver_ },
  medicao_cancelar: { obra: true, perm: ['medicao_lancar', 'medicao_aprovar'], lock: true, fn: medCancelar_ },
  medicao_pagar: { obra: true, perm: 'medicao_aprovar', lock: true, fn: medPagar_ },
  medicao_pdf: { obra: true, perm: ['medicao_ver', 'medicao_lancar', 'medicao_aprovar'], fn: medPdfVer_ },
  fvs_pdf: { obra: true, perm: ['fvs_ver', 'fvs_preencher', 'fvs_aprovar'], fn: fvsPdfVer_ },
  fvs_anexo_ver: { obra: true, perm: ['fvs_ver', 'fvs_preencher', 'fvs_aprovar'], fn: fvsAnexoVer_ },
  fvs_enviar: { obra: true, perm: 'fvs_preencher', lock: true, fn: fvsEnviar_ },
  fvs_devolver: { obra: true, perm: 'fvs_aprovar', lock: true, fn: fvsDevolver_ },
  fvs_aprovar: { obra: true, perm: 'fvs_aprovar', lock: true, fn: fvsAprovar_ },
  fvs_reabrir: { obra: true, perm: 'fvs_aprovar', lock: true, fn: fvsReabrir_ },
  fvs_cancelar: { obra: true, perm: 'fvs_aprovar', lock: true, fn: fvsCancelar_ },
  exec_relatorio_email: { obra: true, perm: 'exec_planejar', fn: execRelatorioEmail_ },
  contratos: { obra: true, perm: ['contrato_ver', 'contrato_gerir'], fn: ctrListar_ },
  contrato_detalhe: { obra: true, perm: ['contrato_ver', 'contrato_gerir'], fn: ctrDetalhe_ },
  contrato_salvar: { obra: true, perm: 'contrato_gerir', lock: true, fn: ctrSalvar_ },
  contrato_status: { obra: true, perm: 'contrato_gerir', lock: true, fn: ctrStatus_ },
  contrato_aditivo: { obra: true, perm: 'contrato_gerir', lock: true, fn: ctrAditivo_ },
  contrato_anexo: { obra: true, perm: 'contrato_gerir', lock: true, fn: ctrAnexo_ },
  contrato_minuta: { obra: true, perm: 'contrato_gerir', lock: true, fn: ctrMinuta_ },
  contrato_rt_salvar: { obra: true, perm: 'contrato_gerir', lock: true, fn: ctrRtSalvar_ },
  contrato_rt_arquivo: { obra: true, perm: 'contrato_gerir', lock: true, fn: ctrRtArquivo_ },
  contrato_rt_remover: { obra: true, perm: 'contrato_gerir', lock: true, fn: ctrRtRemover_ },
  contrato_rt_ver: { obra: true, perm: ['contrato_ver', 'contrato_gerir'], fn: ctrRtVer_ },
  contrato_anexo_ver: { obra: true, perm: ['contrato_ver', 'contrato_gerir'], fn: ctrAnexoVer_ },
  orc_dados: { obra: true, perm: ['orc_ver', 'orc_gerir'], fn: orcDados_ },
  orc_para_contrato: { obra: true, perm: 'contrato_gerir', fn: orcParaContrato_ },
  base_para_contrato: { obra: true, perm: 'contrato_gerir', fn: baseParaContrato_ },
  obra_relatorio: { obra: true, perm: ['orc_ver', 'orc_gerir', 'exec_planejar'], fn: obraRelatorio_ },
  obra_relatorio_email: { obra: true, perm: ['orc_ver', 'orc_gerir', 'exec_planejar'], fn: execRelatorioEmail_ },
  orc_frente_salvar: { obra: true, perm: 'orc_gerir', lock: true, fn: orcFrenteSalvar_ },
  orc_itens_salvar: { obra: true, perm: 'orc_gerir', lock: true, fn: orcItensSalvar_ },
  orc_item_remover: { obra: true, perm: 'orc_gerir', lock: true, fn: orcItemRemover_ },
  orc_material_salvar: { obra: true, perm: 'orc_gerir', lock: true, fn: orcMaterialSalvar_ },
  orc_material_remover: { obra: true, perm: 'orc_gerir', lock: true, fn: orcMaterialRemover_ },

  // módulo Orçamentos · base de preços da empresa (sem obra: acesso pelo cadastro do usuário)
  base_dados: { base: 'Ver', fn: baseDados_ },
  base_insumo_historico: { base: 'Ver', fn: baseInsumoHistorico_ },
  base_insumo_salvar: { base: 'Gerir', lock: true, fn: baseInsumoSalvar_ },
  base_insumo_excluir: { base: 'Gerir', lock: true, fn: baseInsumoExcluir_ },
  base_insumo_foto: { base: 'Gerir', lock: true, fn: baseInsumoFoto_ },
  base_composicao_salvar: { base: 'Gerir', lock: true, fn: baseComposicaoSalvar_ },
  base_composicao_excluir: { base: 'Gerir', lock: true, fn: baseComposicaoExcluir_ },
  base_composicao_duplicar: { base: 'Gerir', lock: true, fn: baseComposicaoDuplicar_ },
  base_precos: { base: 'Gerir', lock: true, fn: basePrecos_ },
  base_importar: { base: 'Gerir', lock: true, fn: baseImportar_ },
  // orçamentos de clientes (fora de obra) e o painel da empresa (tela Início)
  empresa_dados: { fn: empresaDados_ },
  prop_listar: { base: 'Ver', fn: propListar_ },
  prop_detalhe: { base: 'Ver', fn: propDetalhe_ },
  prop_salvar: { base: 'Gerir', lock: true, fn: propSalvar_ },
  prop_status: { base: 'Gerir', lock: true, fn: propStatus_ },
  prop_copiar: { base: 'Gerir', lock: true, fn: propCopiar_ },
  prop_precos: { base: 'Gerir', lock: true, fn: propAtualizarPrecos_ },
  prop_excluir: { base: 'Gerir', lock: true, fn: propExcluir_ },
  prop_gerar_obra: { admin: true, base: 'Gerir', lock: true, fn: propGerarObra_ },
  prop_importar: { base: 'Gerir', lock: true, fn: propImportar_ },

  admin_dados: { admin: true, fn: adminDados_ },
  admin_usuario_salvar: { admin: true, lock: true, fn: adminUsuarioSalvar_ },
  admin_senha: { admin: true, lock: true, fn: adminSenha_ },
  admin_obra_criar: { admin: true, lock: true, fn: adminObraCriar_ },
  admin_obra_salvar: { admin: true, lock: true, fn: adminObraSalvar_ },
  admin_config_salvar: { admin: true, lock: true, fn: adminConfigSalvar_ },
  admin_backup: { admin: true, lock: true, fn: adminBackup_ },
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
  if (r.base) exigirBase_(ctx, r.base);
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
  exec_planejar: 'Execução: planejar etapas, alterar previsto, corrigir lançamentos e avisar a equipe',
  fvs_ver: 'FVS (qualidade): consultar as fichas',
  fvs_preencher: 'FVS (qualidade): abrir, preencher, anexar croquis e enviar para aprovação',
  fvs_aprovar: 'FVS (qualidade): aprovar ou devolver fichas e editar os modelos',
  medicao_ver: 'Medições: consultar',
  medicao_lancar: 'Medições: montar e enviar para aprovação',
  medicao_aprovar: 'Medições: aprovar, devolver e marcar como paga',
  contrato_ver: 'Contratos: consultar (valores, planilha, saldo)',
  contrato_gerir: 'Contratos: cadastrar, editar, aditivos, ativar e arquivar o contrato assinado',
  orc_ver: 'Orçamento da obra: ver frentes gerais, quantidades, valores e o painel da obra (falta comprar, consumido)',
  orc_gerir: 'Orçamento da obra: cadastrar frentes gerais, serviços, valores de material e mão de obra e materiais'
};
const PERFIS_PADRAO = [
  ['Admin', Object.keys(PERMISSOES).join(','), 'Tudo na obra'],
  ['Aprovador', 'pedido_ver_todos,estoque_ver,compras_aprovar,compras_cancelar', 'Aprova ou reprova as compras definidas pelo setor de Compras'],
  ['Compras', 'pedido_abrir,pedido_ver_todos,estoque_ver,compras_cotar,compras_definir,compras_liberar,compras_cancelar,cad_materiais,cad_fornecedores', 'Cotação, definição da compra e liberação de entrega (não aprova)'],
  ['Estoque', 'pedido_abrir,pedido_ver_todos,pedido_receber,estoque_ver,estoque_movimentar,cad_materiais,cad_frentes', 'Abre pedidos, recebe na obra e controla o estoque'],
  ['Financeiro', 'pedido_ver_todos,financeiro', 'Pagamentos e notas fiscais'],
  ['Solicitante', 'pedido_abrir', 'Só abre e acompanha os próprios pedidos'],
  ['Encarregado', 'exec_ver,exec_lancar,pedido_abrir,fvs_ver', 'Lança o diário de obra (quantidades, equipes, fotos) e abre pedidos de material'],
  ['Engenheiro', 'exec_ver,exec_lancar,exec_planejar,pedido_abrir,pedido_ver_todos,estoque_ver,fvs_ver,fvs_preencher,fvs_aprovar,orc_ver','Planeja as etapas, acompanha a produção, revisa os diários e avisa a equipe']
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
function token_(u) {
  const c = Utilities.base64EncodeWebSafe(JSON.stringify({ u: String(u.id), v: versaoSenha_(u), e: Date.now() + SESSAO_DIAS * 864e5 }), Utilities.Charset.UTF_8);
  return c + '.' + assinar_(c);
}
/* "versão" da senha dentro do token: trocar a senha invalida as sessões abertas em outros aparelhos */
function versaoSenha_(u) { return assinar_('sv|' + u.senha_hash).slice(0, 12); }
function usuarioDoToken_(t) {
  const a = String(t || '').split('.');
  if (a.length !== 2 || assinar_(a[0]) !== a[1]) throw new Error('Sessão inválida. Entre novamente.');
  const d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(a[0])).getDataAsString());
  if (d.e < Date.now()) throw new Error('Sessão expirada. Entre novamente.');
  const u = central_('Usuarios').all().find(x => String(x.id) === d.u);
  if (!u || !sim_(u.ativo)) throw new Error('Sessão inválida: usuário desativado.');
  // tokens antigos (sem "v") continuam valendo até vencer; os novos acompanham a senha
  if (d.v && d.v !== versaoSenha_(u)) throw new Error('Sessão encerrada: a senha foi alterada. Entre novamente.');
  return u;
}
/* e-mail de segurança para os administradores (nunca derruba o fluxo se falhar) */
function avisarAdmins_(assunto, texto) {
  try {
    const para = central_('Usuarios').all().filter(u => sim_(u.admin) && sim_(u.ativo) && /@/.test(String(u.email || ''))).map(u => String(u.email).trim());
    if (!para.length) para.push(Session.getEffectiveUser().getEmail());
    GmailApp.sendEmail(para.filter(Boolean).join(','), assunto, texto, { name: String(config_().EMPRESA || 'Size Engenharia') + ' · Segurança' });
    return true;
  } catch (e) { return false; }
}
function login_(q) {
  const login = norm_(q.login), senha = String(q.senha || '');
  if (!login || !senha) throw new Error('Informe usuário e senha.');
  // bloqueio por tentativas erradas (por usuário digitado, exista ou não — não revela quem tem conta)
  const cache = CacheService.getScriptCache(), kf = 'lf|' + login.slice(0, 80), falhas = Number(cache.get(kf)) || 0;
  if (falhas >= LOGIN_MAX_FALHAS) {
    Utilities.sleep(800);
    throw new Error('Muitas tentativas erradas. Por segurança o acesso ficou bloqueado por ' + LOGIN_BLOQUEIO_MIN + ' minutos. Tente de novo depois (ou peça ao administrador).');
  }
  const T = central_('Usuarios');
  const u = T.all().find(x => norm_(x.login) === login || (x.email && norm_(x.email) === login));
  if (!u || !sim_(u.ativo) || hash_(senha, u.salt) !== u.senha_hash) {
    cache.put(kf, String(falhas + 1), LOGIN_BLOQUEIO_MIN * 60);
    if (falhas + 1 === LOGIN_MAX_FALHAS && !cache.get('la|' + kf)) {
      cache.put('la|' + kf, '1', 3600);
      avisarAdmins_('Alerta de segurança: tentativas de login erradas', 'Houve ' + LOGIN_MAX_FALHAS + ' tentativas de login erradas seguidas para o usuário "' + login + '". O acesso desse usuário ficou bloqueado por ' + LOGIN_BLOQUEIO_MIN + ' minutos. Se não foi a própria pessoa, considere trocar a senha dela.');
    }
    Utilities.sleep(800);
    throw new Error('Usuário ou senha incorretos.');
  }
  cache.remove(kf);
  try { atualizarPerfisFvs_(); atualizarPerfisMed_(); atualizarPerfisCtr_(); atualizarPerfisOrc_(); } catch (e) { /* o ajuste de perfis roda de novo no próximo acesso */ }
  u.ultimo_acesso = new Date();
  T.update(u);
  return Object.assign({ token: token_(u) }, sessaoDe_(u));
}
function sessaoDe_(u) {
  const admin = sim_(u.admin);
  const obras = central_('Obras').all()
    .filter(o => sim_(o.ativa) || admin)
    .map(o => ({ id: String(o.id), sigla: o.sigla, nome: o.nome, ativa: sim_(o.ativa), permissoes: permsDe_(u, o.id) }))
    .filter(o => o.permissoes);
  return {
    usuario: { id: String(u.id), nome: u.nome, login: u.login, email: u.email, admin: admin, trocar_senha: sim_(u.trocar_senha), orcamentos: nivelBase_(u) },
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
  // as outras sessões deste usuário caem (a versão da senha mudou); esta recebe um token novo
  return { msg: 'Senha alterada.', token: token_(u) };
}
const SENHAS_FRACAS_ = ['1234567890', '0123456789', '12345678910', '1234567890a', 'senha12345', 'senha123456', 'password12', 'password123', 'qwertyuiop', 'abcdefghij', 'admin12345', 'size123456', 'sizeengenharia'];
function definirSenha_(u, senha) {
  senha = String(senha || '');
  if (senha.length < 10) throw new Error('A senha precisa ter pelo menos 10 caracteres.');
  if (SENHAS_FRACAS_.indexOf(senha.toLowerCase()) >= 0 || /^(.)\1+$/.test(senha) || (u.login && norm_(senha) === norm_(u.login)))
    throw new Error('Essa senha é fácil de adivinhar. Escolha outra (misture letras e números).');
  u.salt = Utilities.getUuid();
  u.senha_hash = hash_(senha, u.salt);
}
