/**
 * Avisos no aparelho com o app FECHADO (Firebase Cloud Messaging, API HTTP v1).
 *
 * Como funciona: o aparelho registra o seu "endereço" (token do Firebase) na aba Aparelhos. A cada 5 minutos
 * pushVarrer() calcula, para cada pessoa que ativou os avisos, o mesmo que o sino do app mostra (notificacoes_)
 * e envia só o que ainda não foi avisado àquele aparelho. Quando o app está aberto, o próprio app já marca
 * os avisos como vistos (parâmetro "push" de notificacoes), então não duplica.
 *
 * Configuração (uma vez): propriedade do script FCM_SA = conteúdo do JSON da conta de serviço do Firebase
 * (Editor do Apps Script > Configurações do projeto > Propriedades do script). A chave NUNCA vai para o GitHub.
 */
const PUSH_VISTOS_MAX = 500, PUSH_MAX_POR_VEZ = 4, PUSH_APARELHOS_MAX = 6;
const PUSH_ETAPAS = {
  cotar: 'Para cotar', definir: 'Orçamentos recebidos', aprovar: 'Aprovar compra', liberar: 'Liberar entrega', receber: 'Receber material',
  entrega: 'Previsão de entrega', pagar: 'Pagamentos', nf: 'Aguardando nota fiscal', pago: 'Pagamento concluído', meu: 'Seu pedido',
  exec_aviso: 'Aviso do engenheiro', exec_diario: 'Diário de obra', exec_alerta: 'Alerta de produção', exec_revisar: 'Diário para revisar',
  fvs_aprovar: 'FVS para aprovar', fvs_devolvida: 'FVS devolvida', fvs_verificar: 'FVS para verificar',
  medicao_aprovar: 'Medição para aprovar', medicao_devolvida: 'Medição devolvida', sinapi: 'SINAPI do mês novo'
};

function pushConta_() {
  const raw = PropertiesService.getScriptProperties().getProperty('FCM_SA');
  if (!raw) return null;
  try { const sa = JSON.parse(raw); return sa.private_key && sa.client_email && sa.project_id ? sa : null; } catch (e) { return null; }
}

/* token de acesso do Google (OAuth) para a conta de serviço; vale 1 h e fica em cache */
function pushAcesso_(sa) {
  const cache = CacheService.getScriptCache(), c = cache.get('fcm_at');
  if (c) return c;
  const agora = Math.floor(Date.now() / 1000);
  const b64 = o => Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/, '');
  const corpo = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600
  });
  const assinatura = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(corpo, sa.private_key)).replace(/=+$/, '');
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: corpo + '.' + assinatura }
  });
  const j = JSON.parse(r.getContentText() || '{}');
  if (!j.access_token) throw new Error('Firebase recusou a chave da conta de serviço: ' + (j.error_description || j.error || r.getResponseCode()));
  cache.put('fcm_at', j.access_token, 3000);
  return j.access_token;
}

/* envia as mensagens [{token, titulo, corpo, url, tag}]; devolve {enviados, mortos:[tokens inválidos], erro} */
function pushEnviar_(msgs) {
  const sa = pushConta_();
  if (!sa) return { enviados: 0, mortos: [], erro: 'Avisos com o app fechado ainda não foram configurados (propriedade FCM_SA).' };
  if (!msgs.length) return { enviados: 0, mortos: [], erro: '' };
  const acesso = pushAcesso_(sa), url = 'https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send';
  const resp = UrlFetchApp.fetchAll(msgs.map(m => ({
    url: url, method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + acesso },
    payload: JSON.stringify({ message: {
      token: m.token,
      data: { titulo: String(m.titulo || ''), corpo: String(m.corpo || ''), url: String(m.url || './'), tag: String(m.tag || '') },
      webpush: { headers: { Urgency: 'high', TTL: '86400' } }
    } })
  })));
  const mortos = []; let enviados = 0, erro = '';
  resp.forEach((r, i) => {
    const cod = r.getResponseCode(), txt = r.getContentText();
    if (cod === 200) enviados++;
    else if (cod === 404 || (cod === 400 && /INVALID_ARGUMENT|UNREGISTERED/.test(txt))) mortos.push(msgs[i].token);
    else { if (cod === 401 || cod === 403) CacheService.getScriptCache().remove('fcm_at'); erro = 'Firebase respondeu ' + cod + ': ' + txt.slice(0, 200); }
  });
  return { enviados: enviados, mortos: mortos, erro: erro };
}

/* identificador curto de cada aviso (a aba guarda só isso, não o texto inteiro) */
function pushId_(id) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(id), Utilities.Charset.UTF_8)).slice(0, 8); }
function pushLerVistos_(ap) {
  if (!ap.vistos) return null; // nunca inicializado: o primeiro ciclo só registra o que já existe
  try { return JSON.parse(ap.vistos); } catch (e) { return null; }
}
function pushAbrir_(i) { return './?obra=' + encodeURIComponent(i.obra) + (i.rota || '#/pedido/' + encodeURIComponent(i.numero)); }
function pushMensagem_(i, token, varias) {
  return {
    token: token, titulo: (i.numero ? i.numero + ' · ' : '') + (PUSH_ETAPAS[i.etapa] || i.etapa),
    corpo: i.texto + (i.resumo ? ' — ' + i.resumo : '') + (varias && i.obra_nome ? ' (' + i.obra_nome + ')' : ''), url: pushAbrir_(i), tag: i.id
  };
}

/* ---------- rotas ---------- */
function pushRegistrar_(q, ctx) {
  const tok = String(q.fcm || '').trim();
  if (tok.length < 20 || tok.length > 4000) throw new Error('Aparelho inválido.');
  const T = central_('Aparelhos'), ids = (q.ids || []).map(pushId_).slice(-PUSH_VISTOS_MAX);
  let a = T.all().find(x => x.token === tok);
  if (a) { a.usuario_id = ctx.u.id; a.usuario = ctx.u.nome; a.ua = String(q.ua || '').slice(0, 120); a.vistos = JSON.stringify(ids); T.update(a); }
  else {
    T.insert({ token: tok, usuario_id: ctx.u.id, usuario: ctx.u.nome, ua: String(q.ua || '').slice(0, 120), criado_em: agora_(), vistos: JSON.stringify(ids) });
    // guarda só os aparelhos mais recentes de cada pessoa
    const meus = T.all().filter(x => String(x.usuario_id) === String(ctx.u.id));
    if (meus.length > PUSH_APARELHOS_MAX) { const velhos = meus.slice(0, meus.length - PUSH_APARELHOS_MAX).map(x => x.token); T.removeWhere(x => velhos.indexOf(x.token) >= 0); }
  }
  garantirGatilhoPush_();
  return { ok: true, configurado: !!pushConta_() };
}
function pushRemover_(q, ctx) {
  central_('Aparelhos').removeWhere(a => a.token === String(q.fcm || '') && String(a.usuario_id) === String(ctx.u.id));
  return { ok: true };
}
function pushTeste_(q, ctx) {
  if (!pushConta_()) throw new Error('Os avisos com o app fechado ainda não foram configurados no servidor (peça ao administrador: propriedade FCM_SA).');
  const meus = central_('Aparelhos').all().filter(a => String(a.usuario_id) === String(ctx.u.id));
  if (!meus.length) throw new Error('Nenhum aparelho seu está com os avisos ativos.');
  const cache = CacheService.getScriptCache(), k = 'pt|' + ctx.u.id;
  if (cache.get(k)) throw new Error('Aguarde alguns segundos para enviar outro teste.');
  cache.put(k, '1', 20);
  const r = pushEnviar_(meus.map(a => ({ token: a.token, titulo: 'Size Engenharia', corpo: 'Teste: os avisos estão funcionando neste aparelho.', url: './', tag: 'teste' })));
  if (r.mortos.length) central_('Aparelhos').removeWhere(a => r.mortos.indexOf(a.token) >= 0);
  if (!r.enviados) throw new Error(r.erro || 'Não foi possível enviar. Desative e ative os avisos de novo neste aparelho.');
  return { enviados: r.enviados };
}

/* chamado por notificacoes_ quando o app aberto informa seu token: o que ele já mostrou não vai de novo por push */
function pushMarcarVistos_(tok, usuarioId, itens) {
  try {
    const ids = itens.map(i => pushId_(i.id)).slice(-PUSH_VISTOS_MAX), novo = JSON.stringify(ids);
    const a = central_('Aparelhos').all().find(x => x.token === tok && String(x.usuario_id) === String(usuarioId));
    if (!a || a.vistos === novo) return;
    const L = LockService.getScriptLock();
    if (!L.tryLock(5000)) return;
    try {
      const T = central_('Aparelhos'); T._rows = null;
      const b = T.all().find(x => x.token === tok);
      if (b) { b.vistos = novo; T.update(b); }
    } finally { L.releaseLock(); }
  } catch (e) { /* o sino continua funcionando mesmo se isso falhar */ }
}

/* ---------- varredura automática (gatilho de 5 em 5 minutos) ---------- */
function pushVarrer() {
  if (!pushConta_()) return;
  const T0 = central_('Aparelhos'), todos = T0.all().slice();
  if (!todos.length) return;
  const usuarios = central_('Usuarios').all(), obras = central_('Obras').all().filter(o => sim_(o.ativa)).length;
  const porPessoa = {};
  todos.forEach(a => { (porPessoa[a.usuario_id] = porPessoa[a.usuario_id] || []).push(a); });
  const decisoes = [], envios = [], mortos = [];
  Object.keys(porPessoa).forEach(id => {
    const u = usuarios.find(x => String(x.id) === String(id));
    if (!u || !sim_(u.ativo)) { porPessoa[id].forEach(a => mortos.push(a.token)); return; }
    let itens;
    try { itens = notificacoes_({}, { u: u, admin: sim_(u.admin) }).itens; } catch (e) { return; }
    const atuais = itens.map(i => pushId_(i.id)).slice(-PUSH_VISTOS_MAX);
    porPessoa[id].forEach(a => {
      const vistos = pushLerVistos_(a);
      const novos = vistos ? itens.filter(i => vistos.indexOf(pushId_(i.id)) < 0) : [];
      if (!vistos || JSON.stringify(vistos) !== JSON.stringify(atuais)) decisoes.push({ token: a.token, vistos: JSON.stringify(atuais) });
      novos.slice(0, PUSH_MAX_POR_VEZ).forEach(i => envios.push(pushMensagem_(i, a.token, obras > 1)));
      if (novos.length > PUSH_MAX_POR_VEZ) envios.push({ token: a.token, titulo: 'Size Engenharia', corpo: '+' + (novos.length - PUSH_MAX_POR_VEZ) + ' avisos novos. Abra o app para ver.', url: './', tag: 'resumo' });
    });
  });
  // grava o que já foi avisado ANTES de enviar (se algo falhar, não repete aviso)
  const L = LockService.getScriptLock();
  if (decisoes.length || mortos.length) {
    L.waitLock(30000);
    try {
      const T = central_('Aparelhos'); T._rows = null;
      const mapa = {}; T.all().forEach(a => { mapa[a.token] = a; });
      decisoes.forEach(d => { const a = mapa[d.token]; if (a) { a.vistos = d.vistos; T.update(a); } });
      if (mortos.length) T.removeWhere(a => mortos.indexOf(a.token) >= 0);
    } finally { L.releaseLock(); }
  }
  if (!envios.length) return;
  const r = pushEnviar_(envios);
  if (r.mortos.length) {
    L.waitLock(30000);
    try { const T = central_('Aparelhos'); T._rows = null; T.removeWhere(a => r.mortos.indexOf(a.token) >= 0); } finally { L.releaseLock(); }
  }
  if (r.erro) console.error(r.erro);
}

function garantirGatilhoPush_() {
  const pr = PropertiesService.getScriptProperties();
  if (pr.getProperty('GATILHO_PUSH')) return;
  try {
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'pushVarrer')) ScriptApp.newTrigger('pushVarrer').timeBased().everyMinutes(5).create();
    pr.setProperty('GATILHO_PUSH', 'Sim');
  } catch (e) { /* sem permissão neste contexto: rode garantirGatilhoPush_() no editor */ }
}
