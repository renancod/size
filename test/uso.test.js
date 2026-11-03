// Cotas do Google (Uso.gs): o gatilho dos avisos só varre no horário e quando algo mudou; tempo e e-mails do dia medidos.
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

function preparar() {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const tk = call('login', { login: 'admin', senha }).token, adm = (acao, d = {}) => call(acao, { token: tk, ...d });
  return { G, adm };
}
const hoje = U => U.dias[0];
const tarefa = (U, k) => hoje(U).tarefas.find(t => t.chave === k) || { rodadas: 0, puladas: 0 };

test('gatilho dos avisos: fora do horário não roda; no horário só varre quando algo foi gravado', () => {
  const t = preparar();
  t.G.rodar('horaUtil_ = () => false; pushVarrer({ triggerUid: "x" })');
  assert.deepEqual([tarefa(t.adm('uso_cotas'), 'push').rodadas, tarefa(t.adm('uso_cotas'), 'push').puladas], [0, 1]);
  t.G.rodar('horaUtil_ = () => true; pushVarrer({ triggerUid: "x" })');   // 1ª no horário: varre
  t.G.rodar('pushVarrer({ triggerUid: "x" })');                          // nada mudou: pula
  let p = tarefa(t.adm('uso_cotas'), 'push');
  assert.deepEqual([p.rodadas, p.puladas], [1, 2]);
  t.adm('admin_obra_criar', { nome: 'Obra Nova', sigla: 'ON', endereco: 'Rua Y' });   // gravou algo
  t.G.rodar('pushVarrer({ triggerUid: "x" })');
  p = tarefa(t.adm('uso_cotas'), 'push');
  assert.equal(p.rodadas, 2);
  t.G.rodar('pushVarrer()');   // sem evento (editor/testes): varre sempre, sem contar como gatilho
  assert.equal(tarefa(t.adm('uso_cotas'), 'push').rodadas, 2);
  // leitura dos e-mails: mesmo horário
  t.G.rodar('horaUtil_ = () => false; capturarEmails({ triggerUid: "y" })');
  assert.equal(tarefa(t.adm('uso_cotas'), 'captura').puladas, 1);
});

test('telas guardadas no aparelho: resposta de gravação vem com w; versão da base muda só quando a base muda', () => {
  const t = preparar();
  const senha = t.G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const tk = t.G.chamar({ acao: 'login', login: 'admin', senha }).dados.token, raw = (acao, d = {}) => t.G.chamar({ acao, token: tk, ...d });
  assert.equal(raw('empresa_dados').w, undefined);                 // leitura
  const b1 = raw('base_dados').dados.ger, n1 = raw('notificacoes').dados.ger_base;
  assert.ok(b1); assert.equal(n1, b1);
  const r = raw('admin_obra_criar', { nome: 'Obra Nova', sigla: 'ON', endereco: 'Rua Y' });
  assert.equal(r.w, 1);                                             // gravou
  assert.equal(raw('notificacoes').dados.ger_base, b1);            // obra nova não mexe na base
  raw('base_insumo_salvar', { insumo: { codigo: 'AREIA', descricao: 'Areia média', unidade: 'm3', tipo: 'Material', preco: 120 } });
  const b2 = raw('notificacoes').dados.ger_base;
  assert.notEqual(b2, b1);
  assert.equal(raw('base_dados').dados.ger, b2);
});

test('e-mails do dia: o sistema conta os destinatários e avisa o administrador no sino quando estão acabando', () => {
  const t = preparar();
  let U = t.adm('uso_cotas');
  assert.deepEqual([U.limite_emails, U.emails_restantes, U.limite_min], [100, 100, 90]);
  t.G.rodar('usoEmail_("a@x.com, b@x.com; c@x.com")');
  U = t.adm('uso_cotas');
  assert.deepEqual([hoje(U).emails, U.emails_restantes], [3, 97]);
  assert.ok(!t.adm('notificacoes').itens.some(i => i.etapa === 'cota_email'));
  t.G.rodar('for (let i = 0; i < 85; i++) usoEmail_("z@x.com"); memMudou_("notif")');   // o sino fica guardado 1 min
  const n = t.adm('notificacoes').itens.find(i => i.etapa === 'cota_email');
  assert.match(n.texto, /Restam só 12 e-mails hoje/);
  assert.equal(n.rota, '#/admin/config');
  assert.throws(() => t.G.chamar({ acao: 'uso_cotas' }).dados.dias.length);   // sem login não vê
});
