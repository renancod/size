// Segurança: login com bloqueio por tentativas, senha forte só para senhas novas, sessões e backup. node --test test/
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

function preparar() {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const login = call('login', { login: 'admin', senha });
  const adm = (acao, d = {}) => call(acao, { token: login.token, ...d });
  return { G, call, adm, senha, login };
}
const falha = (fn, re) => assert.throws(fn, re);

test('senha nova precisa de 10 caracteres e não pode ser óbvia; senha antiga curta continua entrando', () => {
  const t = preparar();
  falha(() => t.adm('trocarSenha', { atual: t.senha, nova: 'curta12' }), /10 caracteres/);
  falha(() => t.adm('trocarSenha', { atual: t.senha, nova: '1234567890' }), /fácil de adivinhar/);
  falha(() => t.adm('trocarSenha', { atual: t.senha, nova: 'aaaaaaaaaaaa' }), /fácil de adivinhar/);
  // quem já tinha senha curta (criada antes da regra nova) segue entrando normalmente
  t.G.rodar(`(() => { const T = central_('Usuarios'), u = T.all().find(x => x.login === 'admin'); u.salt = 'sal-antigo'; u.senha_hash = hash_('abc123', 'sal-antigo'); T.update(u); })()`);
  assert.ok(t.call('login', { login: 'admin', senha: 'abc123' }).token);
  // ao trocar, aí sim vale a regra nova
  const tk = t.call('login', { login: 'admin', senha: 'abc123' }).token;
  falha(() => t.call('trocarSenha', { token: tk, atual: 'abc123', nova: 'abc1234' }), /10 caracteres/);
  assert.match(t.call('trocarSenha', { token: tk, atual: 'abc123', nova: 'Senha-Forte-26' }).msg, /alterada/);
});

test('5 senhas erradas bloqueiam o usuário por 15 minutos, avisam o admin e não revelam quem existe', () => {
  const t = preparar();
  const antes = t.G._enviados.length;
  for (let i = 0; i < 5; i++) falha(() => t.call('login', { login: 'admin', senha: 'errada' + i }), /incorretos/);
  falha(() => t.call('login', { login: 'admin', senha: t.senha }), /Muitas tentativas/); // nem a senha certa entra bloqueado
  const av = t.G._enviados.slice(antes).filter(e => /Alerta de segurança/.test(e.assunto));
  assert.equal(av.length, 1);
  // usuário que não existe também é bloqueado igual (não dá para descobrir quem tem conta)
  for (let i = 0; i < 5; i++) falha(() => t.call('login', { login: 'fantasma', senha: 'x' + i }), /incorretos/);
  falha(() => t.call('login', { login: 'fantasma', senha: 'qualquer' }), /Muitas tentativas/);
  // passados os 15 minutos, volta ao normal
  Object.keys(t.G._cache).forEach(k => { t.G._cache[k].exp = 0; });
  assert.ok(t.call('login', { login: 'admin', senha: t.senha }).token);
});

test('acerto no login zera as tentativas erradas', () => {
  const t = preparar();
  for (let i = 0; i < 4; i++) falha(() => t.call('login', { login: 'admin', senha: 'errada' + i }), /incorretos/);
  assert.ok(t.call('login', { login: 'admin', senha: t.senha }).token);
  for (let i = 0; i < 4; i++) falha(() => t.call('login', { login: 'admin', senha: 'errada' + i }), /incorretos/);
  assert.ok(t.call('login', { login: 'admin', senha: t.senha }).token);
});

test('trocar a senha derruba as outras sessões; a atual recebe token novo; token antigo (sem versão) ainda vale até vencer', () => {
  const t = preparar();
  const outro = t.call('login', { login: 'admin', senha: t.senha }).token;       // "outro aparelho"
  const r = t.adm('trocarSenha', { atual: t.senha, nova: 'Senha-Forte-26' });
  assert.ok(r.token);
  falha(() => t.call('sessao', { token: outro }), /senha foi alterada/);
  falha(() => t.adm('sessao'), /senha foi alterada/);                            // o token usado no login também caiu
  assert.ok(t.call('sessao', { token: r.token }).usuario);                       // o novo funciona
  // token no formato antigo (sem "v") continua valendo
  const legado = t.G.rodar(`(() => { const c = Utilities.base64EncodeWebSafe(JSON.stringify({ u: central_('Usuarios').all()[0].id, e: Date.now() + 864e5 }), Utilities.Charset.UTF_8); return c + '.' + assinar_(c); })()`);
  assert.ok(t.call('sessao', { token: legado }).usuario);
});

test('sessão nova vale 14 dias', () => {
  const t = preparar();
  const d = JSON.parse(Buffer.from(t.login.token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  const dias = Math.round((d.e - Date.now()) / 864e5);
  assert.equal(dias, 14);
});

test('backup: copia central e obras para a pasta Backups, não duplica no mesmo dia, guarda só os últimos dias e só admin faz', () => {
  const t = preparar();
  t.adm('admin_obra_criar', { nome: 'Obra A', sigla: 'OA', endereco: 'x' });
  t.adm('admin_obra_criar', { nome: 'Obra B', sigla: 'OB', endereco: 'y' });
  const r = t.adm('admin_backup');
  assert.equal(r.backup.feitos, 3);                                              // central + 2 obras
  assert.equal(r.backup.total, 3);
  const lista = () => JSON.parse(t.G.rodar(`JSON.stringify((() => { const f = pastaBackup_().getFiles(), o = []; while (f.hasNext()) o.push(f.next().getName()); return o; })())`));
  assert.equal(lista().length, 3);
  assert.ok(lista().some(n => / · Central$/.test(n)) && lista().some(n => / · Obra OA$/.test(n)));
  t.adm('admin_backup');                                                         // de novo no mesmo dia: troca, não acumula
  assert.equal(lista().length, 3);
  // cópias antigas (além do limite de dias) vão para a lixeira; as recentes ficam
  t.G.rodar(`(() => { const p = pastaBackup_(); p.createFile(Utilities.newBlob('x', 'text/plain', '2020-01-01 · Central')); p.createFile(Utilities.newBlob('x', 'text/plain', '2020-01-02 · Obra OA')); })()`);
  const r2 = t.adm('admin_backup');
  assert.equal(r2.backup.removidos, 2);
  assert.equal(lista().length, 3);
  assert.equal(t.adm('admin_dados').backup.feitos, 3);                           // a tela mostra o último backup
  // quem não é administrador não faz backup
  const perfis = t.adm('admin_dados').perfis;
  const obra = t.adm('admin_dados').obras[0].id;
  t.adm('admin_usuario_salvar', { usuario: { nome: 'Joao', login: 'joao', ativo: true }, senha: 'Joao-Senha-26', acessos: [{ obra_id: obra, perfil: 'Solicitante', permissoes: perfis.find(p => p.perfil === 'Solicitante').permissoes }] });
  const tk = t.call('login', { login: 'joao', senha: 'Joao-Senha-26' }).token;
  falha(() => t.call('admin_backup', { token: tk }), /administradores/);
});
test('memória do login: segunda chamada não relê usuários e acessos; desativar ou tirar o acesso vale na hora', () => {
  const t = preparar();
  const obra = t.adm('admin_obra_criar', { nome: 'Prime Beach', sigla: 'PB' }).id;
  const ac = [{ obra_id: obra, perfil: 'Estoque', permissoes: ['estoque_ver'] }];
  t.adm('admin_usuario_salvar', { usuario: { nome: 'Joca', login: 'joca', ativo: true }, senha: 'Obra#Teste26', acessos: ac });
  const tk = t.call('login', { login: 'joca', senha: 'Obra#Teste26' }).token;
  const id = t.adm('admin_dados').usuarios.find(u => u.login === 'joca').id;
  const chamar = (acao, d) => t.G.chamar(Object.assign({ acao, token: tk, obra }, d || {}));
  chamar('estoque_saldo');
  const r = chamar('estoque_saldo');
  assert.ok(r.ok && r.t && r.t.ms >= 0);
  assert.match(r.t.cache, /a/);                                           // usuário e obra vieram da memória
  // tirar o acesso à obra: a próxima chamada já recusa
  t.adm('admin_usuario_salvar', { usuario: { id, nome: 'Joca', login: 'joca', ativo: true }, acessos: [] });
  assert.match(chamar('estoque_saldo').erro, /não tem acesso à obra/);
  // desativar: a sessão cai na hora
  t.adm('admin_usuario_salvar', { usuario: { id, nome: 'Joca', login: 'joca', ativo: false }, acessos: ac });
  assert.match(chamar('estoque_saldo').erro, /usuário desativado/);
});
