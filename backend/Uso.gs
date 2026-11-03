/**
 * Cotas do Google (conta comum): as tarefas automáticas (gatilhos) podem rodar 90 min por dia somados e os e-mails têm
 * 100 destinatários por dia. Os acessos ao app não têm limite diário (só 30 ao mesmo tempo).
 *  - usoTarefa_: mede cada rodada das tarefas automáticas e guarda o total do dia (propriedade USO_aaaa-mm-dd);
 *  - horaUtil_: as tarefas de 5 e 10 minutos só rodam das 6h às 20h (o que chegar à noite sai às 6h);
 *  - uso_cotas (Configurações): minutos usados hoje, e-mails que ainda dá para mandar e os últimos 7 dias;
 *  - o sino avisa o administrador quando restam poucos e-mails no dia.
 */
const USO_LIMITE_MIN_ = 90, USO_EMAILS_DIA_ = 100, USO_HORA_ = [6, 20], USO_EMAILS_AVISO_ = 15;

function usoDia_(d) { return Utilities.formatDate(d || new Date(), tz_(), 'yyyy-MM-dd'); }
function horaUtil_() { const h = +Utilities.formatDate(new Date(), tz_(), 'H'); return h >= USO_HORA_[0] && h < USO_HORA_[1]; }
function usoLer_(dia) {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('USO_' + dia) || '{}'); } catch (e) { return {}; }
}
/* soma uma rodada da tarefa (ms) ou um "pulou" no total do dia; guarda só os últimos 7 dias */
function usoAnotar_(nome, ms, pulou) {
  try {
    const P = PropertiesService.getScriptProperties(), dia = usoDia_(), u = usoLer_(dia), t = u[nome] = u[nome] || { n: 0, ms: 0, pulou: 0 };
    if (pulou) t.pulou++; else { t.n++; t.ms += Math.round(ms); }
    usoReqGravar_(u, dia);
    P.setProperty('USO_' + dia, JSON.stringify(u));
    const velho = 'USO_' + usoDia_(new Date(Date.now() - 8 * 864e5));
    if (P.getProperty(velho) && P.deleteProperty) P.deleteProperty(velho);
  } catch (e) { /* medir não pode derrubar a tarefa */ }
}
function usoTarefa_(nome, fn) {
  const t0 = Date.now();
  try { return fn(); } finally { usoAnotar_(nome, Date.now() - t0); }
}
/* e-mails: o próprio sistema conta os destinatários de cada envio (MailApp pediria uma autorização nova do Google) */
function usoEmail_(para) {
  const n = String(para || '').split(/[,;]/).map(s => s.trim()).filter(Boolean).length;
  if (!n) return;
  try {
    const P = PropertiesService.getScriptProperties(), dia = usoDia_(), u = usoLer_(dia);
    u.emails = (u.emails || 0) + n;
    P.setProperty('USO_' + dia, JSON.stringify(u));
  } catch (e) { /* contar não pode derrubar o envio */ }
}
/* chamadas ao servidor (de todas as pessoas, do app, do portal do cliente e do fornecedor): o acréscimo fica na memória do
 * Google (rápido, sem gravar a cada chamada) e as tarefas automáticas passam para o total do dia (usoAnotar_ → usoReqGravar_) */
function usoReq_(acao) {
  if (!ROTAS[acao]) return;
  try {
    const c = CacheService.getScriptCache(), k = 'req|' + usoDia_(), s = c.get(k);
    // primeira chamada do dia: o que ficou de ontem na memória vai para o total de ontem
    if (!s) { const ontem = usoDia_(new Date(Date.now() - 864e5)), u = usoLer_(ontem); if (usoReqGravar_(u, ontem)) PropertiesService.getScriptProperties().setProperty('USO_' + ontem, JSON.stringify(u)); }
    const o = JSON.parse(s || '{}');
    o[acao] = (o[acao] || 0) + 1;
    c.put(k, JSON.stringify(o), 21600);
  } catch (e) { /* contar não pode atrasar a chamada */ }
}
function usoReqPendente_(dia) { try { return JSON.parse(CacheService.getScriptCache().get('req|' + dia) || '{}'); } catch (e) { return {}; } }
function usoReqGravar_(u, dia) {
  const p = usoReqPendente_(dia), ks = Object.keys(p);
  if (!ks.length) return false;
  try { CacheService.getScriptCache().remove('req|' + dia); } catch (e) { return false; }
  u.req = u.req || {};
  ks.forEach(a => { u.req[a] = (u.req[a] || 0) + p[a]; });
  return true;
}
function usoEmailsRestantes_() { return Math.max(0, USO_EMAILS_DIA_ - (usoLer_(usoDia_()).emails || 0)); }

const USO_NOMES_ = { push: 'Avisos no celular (a cada 5 min)', captura: 'Leitura dos e-mails dos fornecedores (a cada 10 min)', lembretes: 'Lembretes do financeiro (8h)', backup: 'Backup (3h)', sinapi: 'SINAPI (7h)' };
function usoCotas_(q, ctx) {
  if (!ctx.admin) throw new Error('Só administradores.');
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const dia = usoDia_(new Date(Date.now() - i * 864e5)), u = usoLer_(dia), pend = usoReqPendente_(dia), req = Object.assign({}, u.req || {});
    Object.keys(pend).forEach(a => { req[a] = (req[a] || 0) + pend[a]; });
    const chamadas = Object.keys(req).reduce((s, a) => s + req[a], 0);
    const tarefas = Object.keys(USO_NOMES_).filter(k => u[k]).map(k => ({ chave: k, nome: USO_NOMES_[k], rodadas: u[k].n, puladas: u[k].pulou || 0, min: Math.round(u[k].ms / 6000) / 10 }));
    dias.push({ dia: dia, min: Math.round(tarefas.reduce((s, t) => s + t.min, 0) * 10) / 10, emails: u.emails || 0, tarefas: tarefas, chamadas: chamadas,
      por_acao: i ? [] : Object.keys(req).map(a => ({ acao: a, n: req[a] })).sort((a, b) => b.n - a.n).slice(0, 12) });
  }
  return { dias: dias, limite_min: USO_LIMITE_MIN_, emails_restantes: usoEmailsRestantes_(), limite_emails: USO_EMAILS_DIA_, horario: USO_HORA_ };
}
/* sino do administrador: e-mails do dia acabando (o envio falharia) ou tarefas perto dos 90 min */
function usoAvisos_(add) {
  const r = usoEmailsRestantes_();
  if (r != null && r <= USO_EMAILS_AVISO_) add('cota_email', r ? 'Restam só ' + r + ' e-mails hoje' : 'Acabaram os e-mails de hoje', r ? 'cotações e avisos por e-mail podem falhar até amanhã' : 'os e-mails voltam amanhã; mande por WhatsApp se for urgente');
  const u = usoLer_(usoDia_()), min = Object.keys(u).reduce((s, k) => s + ((u[k] && u[k].ms) || 0), 0) / 60000;
  if (min >= USO_LIMITE_MIN_ * 0.8) add('cota_tempo', 'Tarefas automáticas: ' + Math.round(min) + ' de ' + USO_LIMITE_MIN_ + ' min hoje', 'perto do limite do Google: os avisos no celular podem parar até amanhã');
}
