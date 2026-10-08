/**
 * Lançamentos retroativos combinados com o Renan (rodam uma vez só; a marca fica em Config).
 * Bacia 02 – Regularização Cloacal (Prime Beach · ET001): Tee Coletor Predial 110mm Ocre.
 * Roda sozinho quando um administrador abre o Painel da Execução da Prime Beach,
 * ou manualmente no editor: lancarRetroativoBacia02().
 */
const RETRO_BACIA02_ = [
  ['2026-09-28', 9, 'Village 02: 9 T coletores executados (9 de 18 da rua).'],
  ['2026-09-29', 9, 'Village 02: 9 T coletores executados — rua concluída (18 un).'],
  ['2026-09-30', 10, 'Village 05: 10 T coletores executados (10 de 28 da rua).'],
  ['2026-10-01', 9, 'Village 05: 9 T coletores executados (19 de 28 da rua).'],
  ['2026-10-02', 9, 'Village 05: 9 T coletores executados — rua concluída (28 un; a rua tem 30 ligações, 2 não foram executadas).'],
  ['2026-10-05', 12, 'Village 06: 12 T coletores executados (12 de 29 da rua).'],
  ['2026-10-06', 12, 'Village 06: 12 T coletores executados (24 de 29 da rua).'],
  ['2026-10-07', 5, 'Village 06: 5 T coletores executados — rua concluída (29 un).']
];
function lancarRetroativoBacia02(ctxAdmin) {
  const r1 = lancarRetroativoBacia02Diarios_(ctxAdmin);
  const r2 = equipeRetroativoBacia02_(ctxAdmin);
  return r1 + ' · ' + r2;
}
/* equipe VN Hidráulica (3 colaboradores) nos mesmos 8 dias */
function equipeRetroativoBacia02_(ctxAdmin) {
  const C = central_('Config');
  if (C.all().some(r => r.chave === 'RETRO_BACIA02_EQ')) return 'equipe já lançada';
  if (!C.all().some(r => r.chave === 'RETRO_BACIA02')) return 'aguardando diários';
  const o = central_('Obras').all().find(x => String(x.sigla).toUpperCase() === 'PB');
  const u = (ctxAdmin && ctxAdmin.u) || central_('Usuarios').all().find(x => norm_(x.login) === 'renan');
  const ctx = { u: u, admin: true, obra: o, perms: Object.keys(PERMISSOES), ss: SpreadsheetApp.openById(o.planilha_id) };
  const L = LockService.getScriptLock();
  L.waitLock(30000);
  try {
    if (C.all().some(r => r.chave === 'RETRO_BACIA02_EQ')) return 'equipe já lançada';
    const T = obraTab_(ctx, 'Equipes');
    if (!T.all().some(e => norm_(e.nome) === norm_('VN Hidráulica'))) execEquipeSalvar_({ nome: 'VN Hidráulica', pessoas: 3 }, ctx);
    RETRO_BACIA02_.forEach(r => execDiarioSalvar_({
      data: r[0], motivo: 'Lançamento retroativo — equipe VN Hidráulica (3 colaboradores)',
      etapas: ['ET001'], equipes: [{ etapa: 'ET001', equipe: 'VN Hidráulica', pessoas: 3 }]
    }, ctx));
    C.insert({ chave: 'RETRO_BACIA02_EQ', valor: 'Sim', descricao: 'Equipe VN Hidráulica (3) lançada nos diários retroativos da Bacia 02 em ' + hoje_() });
  } finally { L.releaseLock(); }
  return 'equipe lançada';
}
function lancarRetroativoBacia02Diarios_(ctxAdmin) {
  const C = central_('Config');
  if (C.all().some(r => r.chave === 'RETRO_BACIA02')) return 'já lançado';
  const o = central_('Obras').all().find(x => String(x.sigla).toUpperCase() === 'PB');
  if (!o) return 'obra PB não encontrada';
  const u = (ctxAdmin && ctxAdmin.u) || central_('Usuarios').all().find(x => norm_(x.login) === 'renan');
  const ctx = { u: u, admin: true, obra: o, perms: Object.keys(PERMISSOES), ss: SpreadsheetApp.openById(o.planilha_id) };
  const it = obraTab_(ctx, 'EtapaItens').all().find(i => String(i.etapa) === 'ET001' && /tee coletor/i.test(String(i.servico)));
  if (!it) return 'serviço Tee Coletor (ET001) não encontrado';
  const L = LockService.getScriptLock();
  L.waitLock(30000);
  try {
    if (C.all().some(r => r.chave === 'RETRO_BACIA02')) return 'já lançado';
    RETRO_BACIA02_.forEach(r => execDiarioSalvar_({
      data: r[0], enviar: true, condicao: 'Trabalhável',
      motivo: 'Lançamento retroativo — diário não registrado no dia (sem fotos)',
      lancamentos: [{ cliente_id: 'retro-bacia02-' + r[0], item_id: it.id, qtd: r[1], obs: r[2] }],
      obs: r[2] + '\nResponsável pela frente: Valmir.',
      ocorrencias: 'Diário lançado retroativamente a partir do controle da obra, sem registro fotográfico.'
    }, ctx));
    C.insert({ chave: 'RETRO_BACIA02', valor: 'Sim', descricao: 'Diários retroativos da Bacia 02 (T coletores V02/V05/V06) lançados em ' + hoje_() });
  } finally { L.releaseLock(); }
  log_(ctx, 'exec_retroativo', 'Bacia 02 · ' + RETRO_BACIA02_.length + ' diários · ' + RETRO_BACIA02_.reduce((t, r) => t + r[1], 0) + ' un');
  return 'lançado';
}
