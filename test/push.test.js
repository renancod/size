// Avisos com o app fechado (Firebase): registro do aparelho, varredura sem repetir aviso, aparelho inválido e troca de pessoa.
// node --test test/
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { criarGAS } = require('./gas-mock');

function preparar() {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const login = call('login', { login: 'admin', senha });
  const adm = (acao, d = {}) => call(acao, { token: login.token, ...d });
  const obra = adm('admin_obra_criar', { nome: 'Loteamento Sul', sigla: 'LS', endereco: 'Rua X' }).id;
  const usuario = (nome, perfil) => {
    const p = adm('admin_dados').perfis.find(x => x.perfil === perfil);
    adm('admin_usuario_salvar', { usuario: { nome, login: nome, ativo: true }, senha: 'Senha-Forte-26', acessos: [{ obra_id: obra, perfil, permissoes: p.permissoes }] });
    const s = call('login', { login: nome, senha: 'Senha-Forte-26' });
    return (acao, d = {}) => call(acao, { token: s.token, obra, ...d });
  };
  const configurar = () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    G.rodar('PropertiesService.getScriptProperties().setProperty("FCM_SA", ' + JSON.stringify(JSON.stringify({
      project_id: 'app-size-6857f', client_email: 'x@app-size-6857f.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' })
    })) + ')');
  };
  return { G, call, adm, obra, configurar, compras: usuario('maria', 'Compras'), sol: usuario('joao', 'Solicitante') };
}
const TOK = n => 'token-do-aparelho-' + n + '-'.padEnd(30, 'x');
const pedido = (t, nome) => t.sol('pedido_criar', { itens: [{ descricao: nome, qtd: 1, unidade: 'un' }] }).numero;

test('registrar, varrer sem repetir e abrir o pedido certo', () => {
  const t = preparar();
  assert.equal(t.compras('push_registrar', { fcm: TOK('a'), ids: t.compras('notificacoes').itens.map(i => i.id) }).configurado, false);
  assert.throws(() => t.compras('push_teste'), /ainda não foram configurados/);
  t.configurar();
  t.G.rodar('pushVarrer()');
  assert.equal(t.G._fcm.length, 0, 'sem novidade, sem aviso');

  const n1 = pedido(t, 'Cimento CP II');
  t.G.rodar('pushVarrer()');
  assert.equal(t.G._fcm.length, 1);
  const m = t.G._fcm[0];
  assert.equal(m.token, TOK('a'));
  assert.match(m.data.titulo, new RegExp(n1 + ' · Para cotar'));
  assert.match(m.data.url, /^\.\/\?obra=.*#\/pedido\//);
  assert.equal(m.data.tag.split('|')[1], n1);
  assert.equal(m.webpush.headers.Urgency, 'high');

  t.G.rodar('pushVarrer()');
  assert.equal(t.G._fcm.length, 1, 'não repete o mesmo aviso');
  assert.equal(t.compras('push_teste').enviados, 1);
});

test('app aberto marca como visto e não duplica por push', () => {
  const t = preparar();
  t.configurar();
  t.compras('push_registrar', { fcm: TOK('b'), ids: [] });
  t.G.rodar('pushVarrer()'); // inicializa
  pedido(t, 'Areia');
  t.compras('notificacoes', { push: TOK('b') }); // a pessoa viu no app aberto
  t.G.rodar('pushVarrer()');
  assert.equal(t.G._fcm.length, 0);
  pedido(t, 'Brita');
  t.G.rodar('pushVarrer()');
  assert.equal(t.G._fcm.length, 1);
});

test('muitos avisos viram resumo e aparelho inválido é removido', () => {
  const t = preparar();
  t.configurar();
  t.compras('push_registrar', { fcm: TOK('c'), ids: [] });
  for (let i = 0; i < 6; i++) pedido(t, 'Novo ' + i);
  t.G.rodar('pushVarrer()');
  assert.equal(t.G._fcm.length, 5, '4 avisos + 1 resumo');
  assert.match(t.G._fcm[4].data.corpo, /^\+2 avisos novos/);

  t.G._fcmResp = () => 404;
  pedido(t, 'Mais um');
  t.G.rodar('pushVarrer()');
  assert.throws(() => t.compras('push_teste'), /Nenhum aparelho/);
});

test('quem sai deixa de receber e outra pessoa pode registrar o mesmo aparelho', () => {
  const t = preparar();
  t.configurar();
  t.compras('push_registrar', { fcm: TOK('d'), ids: [] });
  t.compras('push_remover', { fcm: TOK('d') });
  assert.throws(() => t.compras('push_teste'), /Nenhum aparelho/);
  t.compras('push_registrar', { fcm: TOK('d'), ids: [] });
  t.sol('push_registrar', { fcm: TOK('d'), ids: [] }); // o aparelho passa para o João
  assert.throws(() => t.compras('push_teste'), /Nenhum aparelho/);
  assert.equal(t.sol('push_teste').enviados, 1);
  assert.throws(() => t.compras('push_registrar', { fcm: 'curto' }), /inválido/);
});

test('obra desativada não avisa ninguém, nem o administrador', () => {
  const t = preparar();
  t.configurar();
  t.adm('push_registrar', { fcm: TOK('e'), ids: [] });
  t.G.rodar('pushVarrer()'); // inicializa
  pedido(t, 'Tubo PVC');
  assert.ok(t.adm('notificacoes').itens.some(i => i.obra === String(t.obra)), 'obra ativa: admin vê o aviso');
  // pedido que ficou pendente quando a obra foi desativada não pode continuar gerando aviso
  t.adm('admin_obra_salvar', { id: t.obra, nome: 'Loteamento Sul', ativa: false });
  assert.equal(t.adm('notificacoes').itens.filter(i => i.obra === String(t.obra)).length, 0);
  t.G.rodar('pushVarrer()');
  assert.equal(t.G._fcm.length, 0);
});
