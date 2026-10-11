/**
 * BACKUP AUTOMÁTICO das planilhas (central + uma por obra).
 * Todo dia de madrugada o script copia cada planilha para a pasta "Backups" (dentro da pasta "Compras Size" do Drive),
 * com a data no nome. Guarda os últimos BACKUP_DIAS dias (padrão 14) e manda para a lixeira do Drive as cópias mais antigas.
 * Não sobrescreve o backup do dia anterior: se algo for apagado ou estragado, dá para voltar a qualquer dos últimos dias.
 * (As fotos e PDFs do Drive não são duplicados aqui — ficam protegidos pelo histórico e pela lixeira do próprio Drive.)
 * O gatilho diário é criado sozinho quando um administrador abre a administração; também dá para rodar agora pelo app.
 */
const BACKUP_DIAS_PADRAO = 14;

function pastaBackup_() {
  const raiz = raizPasta_(), it = raiz.getFoldersByName('Backups');
  return it.hasNext() ? it.next() : raiz.createFolder('Backups');
}

/* copia as planilhas de hoje, limpa as antigas e registra o resultado */
function backupExecutar_() {
  const pasta = pastaBackup_(), hoje = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  const dias = Math.max(3, Math.round(num_(config_().BACKUP_DIAS)) || BACKUP_DIAS_PADRAO);
  const alvos = [{ id: centralSS_().getId(), nome: 'Central' }].concat(central_('Obras').all().filter(o => o.planilha_id)
    .map(o => ({ id: String(o.planilha_id), nome: 'Obra ' + String(o.sigla || o.nome).replace(/[\\/:*?"<>|]/g, '-') })));
  const feitos = [], erros = [];
  alvos.forEach(a => {
    const nome = hoje + ' · ' + a.nome;
    try {
      // refazer no mesmo dia troca a cópia de hoje pela nova (as de outros dias ficam intactas)
      const ja = pasta.getFilesByName(nome);
      while (ja.hasNext()) ja.next().setTrashed(true);
      DriveApp.getFileById(a.id).makeCopy(nome, pasta);
      feitos.push(a.nome);
    } catch (e) { erros.push(a.nome + ': ' + (e && e.message ? e.message : e)); }
  });
  const corte = Utilities.formatDate(new Date(Date.now() - dias * 864e5), tz_(), 'yyyy-MM-dd');
  let removidos = 0;
  const it = pasta.getFiles();
  while (it.hasNext()) {
    const f = it.next(), m = /^(\d{4}-\d{2}-\d{2}) · /.exec(f.getName());
    if (m && m[1] < corte) { f.setTrashed(true); removidos++; }
  }
  const r = { quando: Utilities.formatDate(new Date(), tz_(), 'dd/MM/yyyy HH:mm'), feitos: feitos.length, total: alvos.length, removidos: removidos, dias: dias, erros: erros, pasta_url: pasta.getUrl() };
  PropertiesService.getScriptProperties().setProperty('BACKUP_ULTIMO', JSON.stringify(r));
  if (erros.length) avisarAdmins_('Backup com falha', 'O backup automático de ' + r.quando + ' não copiou tudo (' + feitos.length + ' de ' + alvos.length + ').\n\n' + erros.join('\n') + '\n\nAbra Administração → Configurações e use "Fazer backup agora" para tentar de novo.');
  return r;
}

/* gatilho diário (3h): não depende de ninguém estar com o app aberto */
function backupDiario() {
  try { backupExecutar_(); } catch (e) { avisarAdmins_('Backup falhou', 'O backup automático não rodou: ' + (e && e.message ? e.message : e)); }
}

function garantirBackup_() {
  const pr = PropertiesService.getScriptProperties();
  if (pr.getProperty('GATILHO_BACKUP')) return;
  try {
    if (ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()).indexOf('backupDiario') < 0) ScriptApp.newTrigger('backupDiario').timeBased().everyDays(1).atHour(3).create();
    pr.setProperty('GATILHO_BACKUP', 'Sim');
  } catch (e) { /* sem permissão neste contexto: rode instalarBackup() no editor */ }
}
function instalarBackup() { PropertiesService.getScriptProperties().deleteProperty('GATILHO_BACKUP'); garantirBackup_(); }

function adminBackup_(q, ctx) {
  const r = backupExecutar_();
  log_(ctx, 'backup', r.feitos + '/' + r.total + (r.erros.length ? ' com erros' : ''));
  if (r.erros.length) throw new Error('Backup incompleto (' + r.feitos + ' de ' + r.total + '): ' + r.erros.join(' · '));
  return { msg: 'Backup feito: ' + r.feitos + ' planilha(s) copiadas. Guardamos os últimos ' + r.dias + ' dias.', backup: r };
}
function backupInfo_() {
  const v = PropertiesService.getScriptProperties().getProperty('BACKUP_ULTIMO');
  try { return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
