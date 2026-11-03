// Contrato assinado como referência: sem o contrato com o cliente a obra não começa (diário fechado),
// contrato de empreiteiro só fica vigente com o assinado anexado, aditivo só vale com o documento,
// frente "sem contrato" só com a explicação e Gerar obra só com o contrato do cliente.
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const PDF = { nome: 'assinado.pdf', mime: 'application/pdf', b64: Buffer.from('%PDF-1.4 assinado').toString('base64') };

function preparar(comContrato) {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const tk = call('login', { login: 'admin', senha }).token, adm = (acao, d = {}) => call(acao, { token: tk, ...d });
  const r = adm('admin_obra_criar', Object.assign({ nome: 'Loteamento Sul', sigla: 'LS' }, comContrato ? { contrato: PDF } : {}));
  const o = (acao, d = {}) => adm(acao, { obra: r.id, ...d });
  return { G, adm, o, obra: r.id, msg: r.msg };
}
const frente = (t, extra = {}) => t.o('exec_etapa_salvar', Object.assign({ nome: 'Pavimentação · Rua X', itens: [{ servico: 'Base', qtd_prevista: 100, inicio: dia(-5), termino: dia(10) }] }, extra));
const item = (t, cod) => t.o('exec_dados').etapas.find(e => e.codigo === cod).itens[0].id;

test('obra sem o contrato com o cliente: diário fechado até anexar o contrato principal assinado', () => {
  const t = preparar(false);
  assert.match(t.msg, /Falta anexar o contrato assinado/);
  const cod = frente(t, { contrato_id: '-', sem_contrato_motivo: 'Equipe própria da Size' }).codigo;
  assert.equal(t.o('exec_dados').contrato_obra, false);
  assert.throws(() => t.o('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: item(t, cod), qtd: 10 }] }), /aguardando o contrato assinado/);
  assert.equal(t.o('exec_dados').diarios.length, 0);                       // nada foi gravado
  assert.equal(t.o('cc_listar').assinado, false);
  // contrato e aditivo sem o documento assinado não entram
  assert.throws(() => t.o('cc_salvar', { contrato: { tipo: 'Contrato', numero: 'Contrato 01', valor: '100000' } }), /contrato assinado/);
  t.o('cc_salvar', { contrato: { tipo: 'Contrato', numero: 'Contrato 01', valor: '100000' }, arquivo: PDF });
  assert.equal(t.o('cc_listar').assinado, true);
  assert.match(t.o('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: item(t, cod), qtd: 10 }] }).msg, /RDO 001/);
  assert.throws(() => t.o('cc_salvar', { contrato: { tipo: 'Aditivo', numero: 'Aditivo 01', valor: '500', dias_uteis: 5 } }), /aditivo assinado/);
});

test('obra criada com o contrato anexado já começa liberada', () => {
  const t = preparar(true);
  assert.match(t.msg, /Contrato assinado anexado/);
  const L = t.o('cc_listar');
  assert.deepEqual(L.contratos.map(c => [c.tipo, c.arquivo]), [['Contrato', true]]);
  assert.equal(t.o('exec_dados').contrato_obra, true);
});

test('frente: escolher o contrato ou "sem contrato" com a explicação; frente antiga sem nada não recebe lançamento', () => {
  const t = preparar(true);
  assert.throws(() => frente(t), /Escolha o contrato da frente/);
  assert.throws(() => frente(t, { contrato_id: '-' }), /explique o porquê/);
  assert.throws(() => frente(t, { contrato_id: '-', sem_contrato_motivo: 'curto' }), /explique o porquê/);
  const cod = frente(t, { contrato_id: '-', sem_contrato_motivo: 'Equipe própria da Size, por administração' }).codigo;
  const e = t.o('exec_dados').etapas.find(x => x.codigo === cod);
  assert.equal(e.contrato_tipo, 'Sem contrato'); assert.equal(e.sem_contrato_motivo, 'Equipe própria da Size, por administração'); assert.equal(e.contrato_ok, true);
  // editar mantendo "sem contrato" não pede de novo; trocar para sem motivo vazio bloqueia
  t.o('exec_etapa_salvar', { codigo: cod, nome: 'Pavimentação · Rua X (trecho 2)' });
  assert.throws(() => t.o('exec_etapa_salvar', { codigo: cod, nome: 'Pavimentação', sem_contrato_motivo: '' }), /explique o porquê/);
  // frente de antes da regra (sem contrato nenhum): o diário recusa
  t.G.rodar(`(() => { const o = central_('Obras').all()[0], c = { ss: SpreadsheetApp.openById(o.planilha_id), obra: o }, E = obraTab_(c, 'Etapas'), x = E.all()[0]; x.contrato_tipo = ''; x.sem_contrato_motivo = ''; E.update(x); })()`);
  assert.throws(() => t.o('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: item(t, cod), qtd: 5 }] }), /não tem contrato/);
});

test('contrato de empreiteiro: só ativa com o assinado anexado; aditivo só com o documento assinado', () => {
  const t = preparar(true);
  const emp = t.o('exec_equipe_salvar', { nome: 'Equipe VN', pessoas: 6, empresa: 'VN Ltda' }).codigo;
  const { id } = t.o('contrato_salvar', { empreiteiro: emp, numero: '015/2026', objeto: 'Rede de água', vigencia_ini: dia(-20), vigencia_fim: dia(300), data_assinatura: dia(-21),
    itens: [{ grupo: '1', codigo: '1.1', servico: 'Tubo PEAD', unidade: 'M', qtd: 100, unitario: 50 }] });
  const { rt_id } = t.o('contrato_rt_salvar', { id, tipo: 'ART', descricao: 'Execução', numero: '123', profissional: 'Eng. X', registro: 'CREA 1', emissao: dia(-3) });
  t.o('contrato_rt_arquivo', { id, rt_id, arquivo: PDF });
  assert.throws(() => t.o('contrato_status', { id, op: 'ativar' }), /Anexe o contrato assinado antes de ativar/);
  // frente não pode ligar a contrato que ainda não está vigente
  assert.throws(() => frente(t, { empreiteiro: emp, contrato_id: id }), /não está vigente/);
  t.o('contrato_anexo', { id, arquivo: PDF });
  t.o('contrato_status', { id, op: 'ativar' });
  assert.throws(() => t.o('contrato_aditivo', { id, tipo: 'Prazo', descricao: 'Mais 30 dias de prazo' }), /aditivo assinado/);
  t.o('contrato_aditivo', { id, tipo: 'Acréscimo de serviços', descricao: 'Mais 20 m de rede', valor: 1000, arquivo: PDF });
  const d = t.o('contrato_detalhe', { id });
  assert.equal(d.aditivos[0].arquivo, true);
  assert.equal(Buffer.from(t.o('contrato_anexo_ver', { id, aditivo: d.aditivos[0].id }).b64, 'base64').toString(), '%PDF-1.4 assinado');
  assert.equal(d.resumo.aditivos, 1000);
});

test('lançamento histórico montado no servidor (retroativo) não depende do contrato; o app não consegue pular a trava', () => {
  const t = preparar(false);
  const cod = frente(t, { contrato_id: '-', sem_contrato_motivo: 'Equipe própria da Size' }).codigo, it = item(t, cod);
  assert.throws(() => t.o('exec_diario_salvar', { data: dia(0), historico: true, lancamentos: [{ item_id: it, qtd: 3 }] }), /aguardando o contrato/);
  t.G.rodar(`(() => { const o = central_('Obras').all()[0], u = central_('Usuarios').all()[0]; execDiarioSalvar_({ data: '${dia(0)}', lancamentos: [{ item_id: '${it}', qtd: 3 }] }, { u: u, admin: true, obra: o, perms: Object.keys(PERMISSOES), ss: SpreadsheetApp.openById(o.planilha_id), historico: true }); })()`);
  assert.equal(t.o('exec_dados').diarios.length, 1);
});
