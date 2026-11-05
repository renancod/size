// Topografia: demandas em obra cadastrada ou "Outra", agenda automática, lançamento do dia com fotos, croqui e arquivo usado,
// mudança de data com motivo, avisos no sino e a produção do mês.
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

const FOTO = n => ({ nome: 'foto' + n + '.jpg', mime: 'image/jpeg', b64: Buffer.from('jpeg ' + n).toString('base64') });
const PDF = { nome: 'croqui.pdf', mime: 'application/pdf', b64: Buffer.from('%PDF-1.4 croqui').toString('base64') };
const DXF = { nome: 'rua10-agua.dxf', mime: 'application/dxf', b64: Buffer.from('0\nSECTION').toString('base64') };
const dia = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv-SE'); };
// próximo dia útil (seg–sex sem feriado nacional) a partir de hoje + n, pela mesma conta do servidor
const G0 = criarGAS(), util = n => G0.rodar(`topoProxUtil_(addDias_(hojeYmd_(), ${n}))`);

function preparar() {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const tk = call('login', { login: 'admin', senha }).token, adm = (acao, d = {}) => call(acao, { token: tk, ...d });
  const obra = adm('admin_obra_criar', { contrato: { nome: 'contrato-assinado.pdf', mime: 'application/pdf', b64: 'JVBERi0xLjQ=' }, nome: 'Prime Beach', sigla: 'PB' }).id;
  const pessoa = (login, nome, topografia) => {
    const id = adm('admin_usuario_salvar', { usuario: { nome, login, ativo: true, topografia }, senha: 'Obra#Teste26', acessos: [] }).id;
    const t = call('login', { login, senha: 'Obra#Teste26' }).token;
    return { id, f: (acao, d = {}) => call(acao, { token: t, ...d }) };
  };
  const eng = pessoa('eng', 'Elisa Engenheira', 'Gerir'), t1 = pessoa('topo1', 'Tiago Topógrafo', 'Topógrafo'), t2 = pessoa('topo2', 'Tânia Topógrafa', 'Topógrafo');
  const semAcesso = pessoa('zeca', 'Zeca', '');
  return { G, adm, obra, eng, t1, t2, semAcesso };
}
const abrir = (t, extra = {}) => t.eng.f('topo_salvar', { demanda: { obra_id: t.obra, tipo: 'Marcação', servico: 'Rede de água', local: 'Rua 10', unidade: 'm', qtd_prevista: 800, topografo_id: t.t1.id, data: util(1), ...extra } }).id;

test('acesso: só quem tem Topografia no cadastro; topógrafo vê só as dele e não abre demanda', () => {
  const t = preparar();
  assert.equal(t.t1.f('sessao').usuario.topografia, 'Topógrafo');
  assert.equal(t.eng.f('sessao').usuario.topografia, 'Gerir');
  assert.throws(() => t.semAcesso.f('topo_dados'), /não tem acesso à Topografia/);
  assert.throws(() => t.t1.f('topo_salvar', { demanda: { obra_id: t.obra, tipo: 'Marcação', servico: 'x', data: util(1), topografo_id: t.t1.id } }), /Só quem gere/);
  const a = abrir(t), b = abrir(t, { topografo_id: t.t2.id, servico: 'Meio-fio' });
  assert.deepEqual(t.t1.f('topo_dados').demandas.map(d => d.id), [a]);
  assert.deepEqual(t.t2.f('topo_dados').demandas.map(d => d.id), [b]);
  assert.equal(t.eng.f('topo_dados').demandas.length, 2);
  assert.throws(() => t.t1.f('topo_demanda', { id: b }), /outro topógrafo/);
  const D = t.eng.f('topo_dados');
  assert.deepEqual(D.topografos.map(x => x.nome), ['Tânia Topógrafa', 'Tiago Topógrafo']);
  assert.equal(D.obras.length, 1);
});

test('abrir: obra cadastrada ou "Outra", anexo opcional, aviso no celular do topógrafo', () => {
  const t = preparar();
  assert.throws(() => t.eng.f('topo_salvar', { demanda: { obra_id: 'outra', tipo: 'Marcação', servico: 'Rua', data: util(1), topografo_id: t.t1.id } }), /nome da obra/);
  assert.throws(() => t.eng.f('topo_salvar', { demanda: { obra_id: t.obra, tipo: 'Marcação', servico: 'Rua', topografo_id: t.t1.id } }), /data/);
  const r = t.eng.f('topo_salvar', { demanda: { obra_id: 'outra', obra_nome: 'Loteamento Dunas', cidade: 'Xangri-lá', tipo: 'Conferência', servico: 'Drenagem', local: 'Quadra 3', unidade: 'pt', qtd_prevista: 40, topografo_id: t.t1.id, data: util(2), prioridade: 'Urgente' }, anexos: [DXF] });
  assert.match(r.msg, /TP-0001 aberta para Tiago/);
  const d = t.t1.f('topo_demanda', { id: r.id }).demanda;
  assert.equal(d.obra_nome, 'Loteamento Dunas'); assert.equal(d.obra_outra, true); assert.equal(d.status, 'Agendada');
  assert.equal(d.anexos.length, 1); assert.equal(d.anexos[0].nome, 'rua10-agua.dxf');
  const arq = t.t1.f('topo_arquivo', { id: d.anexos[0].id });
  assert.equal(Buffer.from(arq.b64, 'base64').toString(), '0\nSECTION');
  assert.throws(() => t.t2.f('topo_arquivo', { id: d.anexos[0].id }), /outro topógrafo/);
  const n = t.t1.f('notificacoes').itens.filter(i => i.etapa === 'topo_nova');
  assert.equal(n.length, 1); assert.match(n[0].texto, /Nova demanda para/); assert.equal(n[0].rota, '#/topo/demanda/' + r.id); assert.equal(n[0].prioridade, 'Urgente');
  // engenheiro muda a data: aviso novo (id novo) para o topógrafo
  t.eng.f('topo_salvar', { demanda: { ...d, obra_id: 'outra', data: util(5) } });
  const n2 = t.t1.f('notificacoes').itens.filter(i => i.etapa === 'topo_nova');
  assert.notEqual(n2[0].id, n[0].id); assert.match(n2[0].texto, /^Demanda para/);
  // obra cadastrada: nome com a sigla
  assert.equal(t.eng.f('topo_demanda', { id: abrir(t) }).demanda.obra_nome, 'PB · Prime Beach');
});

test('lançamento do dia: mínimo 2 fotos, vários dias, croqui e arquivo usado para terminar', () => {
  const t = preparar(), id = abrir(t);
  assert.throws(() => t.t1.f('topo_lancar', { demanda: id, qtd: 300, fotos: [FOTO(1)] }), /pelo menos 2 fotos/);
  assert.throws(() => t.t1.f('topo_lancar', { demanda: id, qtd: 0, fotos: [FOTO(1), FOTO(2)] }), /quanto foi feito/);
  assert.throws(() => t.t1.f('topo_lancar', { demanda: id, qtd: 10, data: dia(1), fotos: [FOTO(1), FOTO(2)] }), /depois de hoje/);
  const r1 = t.t1.f('topo_lancar', { demanda: id, data: dia(-1), qtd: 350, fotos: [FOTO(1), FOTO(2)], obs: 'trecho 1' });
  assert.match(r1.msg, /350 m \(350 de 800 m\)/);
  let d = t.t1.f('topo_demanda', { id });
  assert.equal(d.demanda.status, 'Em execução'); assert.equal(d.demanda.pct, 43.8); assert.equal(d.diarios.length, 1);
  // terminar sem croqui / sem arquivo
  assert.throws(() => t.t1.f('topo_lancar', { demanda: id, qtd: 450, terminou: true, fotos: [FOTO(3), FOTO(4)], arquivo_usado: 'rua10.dxf' }), /croqui/);
  assert.throws(() => t.t1.f('topo_lancar', { demanda: id, qtd: 450, terminou: true, fotos: [FOTO(3), FOTO(4)], croquis: [PDF] }), /qual arquivo/);
  const r2 = t.t1.f('topo_lancar', { demanda: id, qtd: 450, terminou: true, fotos: [FOTO(3), FOTO(4), FOTO(5)], croquis: [PDF], arquivo_usado: 'Projeto rede água rev.02 (anexo)' });
  assert.match(r2.msg, /concluída/);
  d = t.eng.f('topo_demanda', { id });
  assert.equal(d.demanda.status, 'Concluída'); assert.equal(d.demanda.qtd_feita, 800); assert.equal(d.demanda.pct, 100);
  assert.equal(d.demanda.arquivo_usado, 'Projeto rede água rev.02 (anexo)');
  assert.equal(d.diarios[0].fotos.length, 3); assert.equal(d.diarios[0].croquis.length, 1); assert.equal(d.diarios[0].terminou, true);
  assert.ok(d.historico.some(h => /TERMINOU/.test(h.det)));
  // concluída: não aceita lançamento novo; aviso para quem abriu
  assert.throws(() => t.t1.f('topo_lancar', { demanda: id, qtd: 5, fotos: [FOTO(1), FOTO(2)] }), /concluída/);
  assert.ok(t.eng.f('notificacoes').itens.some(i => i.etapa === 'topo_concluida' && i.numero === id));
  // corrigir: o topógrafo só o de hoje; dia anterior só quem gere
  assert.throws(() => t.t1.f('topo_lancar', { demanda: id, id: d.diarios[1].id, data: dia(-1), qtd: 340, remover: [] }), /lançamento de hoje/);
  t.eng.f('topo_lancar', { demanda: id, id: d.diarios[1].id, data: dia(-1), qtd: 340 });
  assert.equal(t.eng.f('topo_demanda', { id }).demanda.qtd_feita, 790);
});

test('mudar a data: topógrafo precisa do motivo e quem abriu é avisado', () => {
  const t = preparar(), id = abrir(t);
  assert.throws(() => t.t1.f('topo_data', { id, data: util(3) }), /porquê/);
  assert.throws(() => t.t1.f('topo_data', { id, data: dia(-2), motivo: 'chuva forte' }), /antes de hoje/);
  assert.throws(() => t.t2.f('topo_data', { id, data: util(3), motivo: 'chuva forte' }), /outro topógrafo/);
  const r = t.t1.f('topo_data', { id, data: util(3), motivo: 'Chuva forte, frente alagada' });
  assert.match(r.msg, /Elisa Engenheira foi avisado/);
  const d = t.eng.f('topo_demanda', { id });
  assert.equal(d.demanda.data, util(3));
  assert.match(d.historico[0].det, /motivo: Chuva forte/);
  const av = t.eng.f('notificacoes').itens.find(i => i.etapa === 'topo_adiada');
  assert.match(av.texto, /Tiago Topógrafo mudou a data .* Chuva forte/);
  // aviso só informativo: dispensado (ou aberto) some do sino de quem dispensou; o de tarefa não é afetado
  t.eng.f('notif_dispensar', { ids: [av.id, 'qualquer|outro'] });
  assert.ok(!t.eng.f('notificacoes').itens.some(i => i.id === av.id));
  assert.equal(t.eng.f('notif_dispensar', { ids: [av.id] }).dispensados, 0);   // não duplica
  t.t1.f('notif_dispensar', { ids: t.t1.f('notificacoes').itens.filter(i => i.etapa === 'topo_nova').map(i => i.id) });
  assert.ok(t.t1.f('notificacoes').itens.some(i => i.etapa === 'topo_nova'));      // demanda nova do topógrafo continua
});

test('agenda automática: produção média estima os dias, a fila anda quando atrasa e sugere o topógrafo livre', () => {
  const t = preparar();
  // padrão 400 m/dia: 800 m = 2 dias; 200 m = meio dia (cabe no mesmo dia da próxima)
  const a = abrir(t, { qtd_prevista: 800, data: util(0) }), b = abrir(t, { qtd_prevista: 200, data: util(0), servico: 'Esgoto' }), c = abrir(t, { qtd_prevista: 200, data: util(0), servico: 'Drenagem' });
  const P = id => t.eng.f('topo_dados').demandas.find(d => d.id === id).previsao;
  assert.equal(P(a).carga, 2); assert.equal(P(b).carga, 0.5);
  assert.equal(P(a).ini, util(0)); assert.equal(P(a).fim, util(1) === util(0) ? util(1) : P(a).fim);
  assert.equal(P(c).ini, P(b).ini);              // b e c dividem o mesmo dia
  assert.ok(P(b).ini > P(a).ini);                 // b vem depois de a (2 dias)
  assert.equal(P(b).empurrada, true);
  // urgente na mesma data passa na frente
  const u = abrir(t, { qtd_prevista: 400, data: util(0), prioridade: 'Urgente', servico: 'Meio-fio' });
  assert.equal(P(u).ini, util(0)); assert.ok(P(a).ini > util(0));
  // sugestão: a Tânia está livre, o Tiago tem fila
  const s = t.eng.f('topo_sugerir', { tipo: 'Marcação', unidade: 'm', qtd: 400 });
  assert.equal(s.melhor.nome, 'Tânia Topógrafa'); assert.equal(s.melhor.data, util(0)); assert.equal(s.melhor.dias, 1);
  // "Qualquer um": vai para quem está livre
  const q = t.eng.f('topo_salvar', { demanda: { obra_id: t.obra, tipo: 'Marcação', servico: 'Lotes', local: 'Q2', unidade: 'un', qtd_prevista: 15, topografo_id: 'auto', data: util(0) } });
  assert.match(q.msg, /Tânia/);
  // produção real passa a valer a partir de 3 dias lançados: 100 m/dia → 800 m restantes = 8 dias
  const x = abrir(t, { topografo_id: t.t2.id, qtd_prevista: 1100, data: util(0), servico: 'Rede de água' });
  [-3, -2, -1].forEach(n => t.t2.f('topo_lancar', { demanda: x, data: dia(n), qtd: 100, fotos: [FOTO(1), FOTO(2)] }));
  assert.equal(P(x).carga, 8);
  // prazo digitado vale sobre a média (1413 m em 3 dias, não 3,5); com 1/3 feito, restam 2 dias
  const s3 = t.eng.f('topo_sugerir', { tipo: 'Marcação', unidade: 'm', qtd: 1413, dias: 3 });
  assert.equal(s3.melhor.dias, 3);
  const z = abrir(t, { topografo_id: t.t2.id, qtd_prevista: 900, dias_previstos: 3, data: util(0), servico: 'Pluvial' });
  assert.equal(P(z).carga, 3);
  t.t2.f('topo_lancar', { demanda: z, data: dia(0), qtd: 300, fotos: [FOTO(1), FOTO(2)] });
  assert.equal(P(z).carga, 2);
});

test('lembrete da véspera, diários separados do RDO e produção do mês', () => {
  const t = preparar(), a = abrir(t, { qtd_prevista: 400, data: util(1) });
  t.G.rodar('Utilities.__fd = Utilities.formatDate; Utilities.formatDate = (d, tz, f) => f === "H" ? "18" : Utilities.__fd(d, tz, f);');
  const l = t.t1.f('notificacoes').itens.find(i => i.etapa === 'topo_amanha');
  assert.ok(l, 'lembrete às 18h'); assert.match(l.resumo, /Rede de água · Rua 10/);
  t.G.rodar('Utilities.formatDate = Utilities.__fd;');
  t.t1.f('topo_lancar', { demanda: a, qtd: 150, fotos: [FOTO(1), FOTO(2)] });
  const b = abrir(t, { topografo_id: t.t2.id, tipo: 'Levantamento', unidade: 'pt', qtd_prevista: 60, data: util(0) });
  t.t2.f('topo_lancar', { demanda: b, qtd: 60, terminou: true, fotos: [FOTO(1), FOTO(2)], croquis: [PDF], arquivos: [DXF] });
  const mes = dia(0).slice(0, 7);
  assert.equal(t.t1.f('topo_diarios', { mes }).diarios.length, 1);          // só os dele
  assert.equal(t.eng.f('topo_diarios', { mes }).diarios.length, 2);
  assert.equal(t.eng.f('topo_demanda', { id: b }).demanda.arquivo_usado, 'rua10-agua.dxf');   // arquivo enviado vale como "arquivo usado"
  const p = t.eng.f('topo_producao', { mes });
  const ti = p.topografos.find(x => x.nome === 'Tiago Topógrafo'), ta = p.topografos.find(x => x.nome === 'Tânia Topógrafa');
  assert.equal(ti.un.m, 150); assert.equal(ti.dias, 1); assert.equal(ti.concluidas, 0);
  assert.equal(ta.un.pt, 60); assert.equal(ta.concluidas, 1); assert.equal(ta.no_prazo, 1);
  assert.equal(t.t1.f('topo_producao', { mes }).topografos.length, 1);
  // o RDO da obra não recebe nada da topografia
  assert.equal(t.adm('exec_dados', { obra: t.obra }).diarios.length, 0);
});

test('localização: o celular do topógrafo manda ao abrir; quem gere vê o último ponto e o caminho do dia', () => {
  const t = preparar();
  assert.throws(() => t.t1.f('topo_local', { lat: 0, lng: 0 }), /inválida/);
  t.t1.f('topo_local', { lat: -29.75, lng: -50.01, precisao: 30 });
  t.t1.f('topo_local', { lat: -29.7502, lng: -50.0101, precisao: 12 });     // ~25 m: mesmo lugar, só renova o horário
  t.t1.f('topo_local', { lat: -29.76, lng: -50.02, precisao: 8 });          // andou ~1,4 km: ponto novo
  assert.equal(t.eng.f('topo_local', { lat: -29.7, lng: -50 }).ignorado, true);   // quem gere não é rastreado
  const L = t.eng.f('topo_dados').locais;
  assert.equal(L.length, 1);
  assert.equal(L[0].nome, 'Tiago Topógrafo'); assert.equal(L[0].lat, -29.76); assert.equal(L[0].hoje.length, 2);
  assert.equal(L[0].hoje[0][0], -29.7502);                                    // o ponto parado guardou a leitura mais precisa
  assert.deepEqual(t.t1.f('topo_dados').locais, []);                          // o topógrafo não vê a equipe
  assert.throws(() => t.semAcesso.f('topo_local', { lat: -29.7, lng: -50 }), /não tem acesso à Topografia/);
});

test('cancelar e reabrir (quem gere)', () => {
  const t = preparar(), id = abrir(t);
  assert.throws(() => t.t1.f('topo_status', { id, op: 'cancelar', motivo: 'xx' }), /Só quem gere/);
  assert.throws(() => t.eng.f('topo_status', { id, op: 'cancelar' }), /motivo/);
  t.eng.f('topo_status', { id, op: 'cancelar', motivo: 'projeto mudou' });
  assert.equal(t.eng.f('topo_demanda', { id }).demanda.status, 'Cancelada');
  assert.equal(t.t1.f('notificacoes').itens.filter(i => i.etapa === 'topo_nova').length, 0);
  t.eng.f('topo_status', { id, op: 'reabrir', data: util(2) });
  const d = t.eng.f('topo_demanda', { id }).demanda;
  assert.equal(d.status, 'Agendada'); assert.equal(d.data, util(2));
});
