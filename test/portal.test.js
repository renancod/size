// Portal do cliente: cadastro, login próprio, trava das rotas internas, módulos por cliente, diário liberado pelo engenheiro e avisos.
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

const FOTO = { b64: Buffer.from('jpeg-falso').toString('base64') };
const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };

function preparar(modelo) {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const tk = call('login', { login: 'admin', senha }).token;
  const adm = (acao, d = {}) => call(acao, { token: tk, ...d });
  const obra = adm('admin_obra_criar', { nome: 'Loteamento Sul', sigla: 'LS', endereco: 'Rua X' }).id;
  const p = adm('admin_dados').perfis.find(x => x.perfil === 'Engenheiro');
  adm('admin_usuario_salvar', { usuario: { nome: 'eng', login: 'eng', ativo: true }, senha: 'Obra#Teste26', acessos: [{ obra_id: obra, perfil: 'Engenheiro', permissoes: p.permissoes }] });
  const se = call('login', { login: 'eng', senha: 'Obra#Teste26' });
  const eng = (acao, d = {}) => call(acao, { token: se.token, obra, ...d });
  const cli = adm('cli_salvar', { cliente: { nome: 'AVA Residence', empresa: 'Mar Azul', obra_id: obra, modelo: modelo || 'gestao', cor: '#1d6f5f', slug: 'ava-residence' } }).id;
  adm('cli_usuario_salvar', { cliente_id: cli, usuario: { nome: 'Dono', login: 'dono.ava' }, senha: 'Cliente#2026x' });
  const sc = call('login', { login: 'dono.ava', senha: 'Cliente#2026x' });
  const cliente = (acao, d = {}) => call(acao, { token: sc.token, ...d });
  const bruto = (acao, d = {}) => G.chamar({ acao, token: sc.token, obra, ...d });
  return { G, adm, eng, cli, obra, cliente, bruto, sessao: sc };
}

test('cliente entra, vê a marca dele e nunca alcança as rotas internas', () => {
  const t = preparar();
  assert.equal(t.sessao.cliente.nome, 'AVA Residence');
  assert.equal(t.sessao.cliente.cor, '#1D6F5F');
  assert.equal(t.sessao.usuario.admin, false);
  assert.deepEqual(t.sessao.obras, []);
  for (const acao of ['admin_dados', 'exec_dados', 'pedidos_listar', 'estoque_saldo', 'contratos', 'medicoes', 'base_dados', 'prop_listar', 'crono_obra', 'cli_admin'])
    assert.match(t.bruto(acao).erro, /Acesso de cliente/, acao);
  const r = t.cliente('cli_inicio');
  assert.equal(r.obra.nome, 'Loteamento Sul');
  assert.ok(r.andamento && typeof r.andamento.pct_exec === 'number');
  // o cliente não aparece na lista de usuários internos e não pode ser editado por lá
  assert.ok(!t.adm('admin_dados').usuarios.some(u => u.login === 'dono.ava'));
});

test('modelo Global: sem financeiro; desativar o cliente corta o acesso na hora', () => {
  const t = preparar('global');
  assert.match(t.bruto('cli_financeiro').erro, /não está liberada/);
  assert.ok(Array.isArray(t.cliente('cli_fvs').fvs));
  assert.equal(t.cliente('cli_inicio').financeiro, undefined);
  t.adm('cli_salvar', { cliente: { id: t.cli, nome: 'AVA Residence', obra_id: t.obra, modelo: 'global', cor: '#1D6F5F', slug: 'ava-residence', ativo: false } });
  assert.match(t.bruto('cli_inicio').erro, /desativado/);
});

test('diário: só aparece depois que o engenheiro libera, sem ocorrências; foto só de dia liberado; aviso no sino', () => {
  const t = preparar();
  const cod = t.eng('exec_etapa_salvar', { nome: 'Pavimentação', local: 'Rua X', itens: [{ servico: 'Base', qtd_prevista: 500, inicio: dia(-10), termino: dia(10) }] }).codigo;
  const item = t.eng('exec_dados').etapas.find(e => e.codigo === cod).itens[0];
  t.eng('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: item.id, qtd: 40 }], equipes: [{ etapa: cod, equipe: 'Equipe A', pessoas: 6 }], ocorrencias: 'Briga interna na equipe', enviar: true });
  const foto = t.eng('exec_foto', { data: dia(0), etapa: cod, legenda: 'Base compactada', foto: FOTO }).id;
  assert.deepEqual(t.cliente('cli_diarios').diarios, []);
  assert.match(t.bruto('cli_foto', { id: foto }).erro, /não disponível/);
  t.eng('exec_cliente', { data: dia(0), mostrar: true });
  const L = t.cliente('cli_diarios').diarios;
  assert.equal(L.length, 1);
  const d = t.cliente('cli_diario', { data: dia(0) });
  assert.equal(d.servicos[0].qtd, 40);
  assert.equal(d.pessoas, 6);
  assert.equal(d.fotos[0].legenda, 'Base compactada');
  assert.ok(!JSON.stringify(d).includes('Briga'));
  assert.ok(t.cliente('cli_foto', { id: foto }).b64);
  // relatórios: RDO do dia e andamento do período, sem ocorrências internas
  const rdo = t.cliente('cli_rdo', { data: dia(0) });
  assert.equal(rdo.servicos[0].dia, 40);
  assert.equal(rdo.fotos.length, 1);
  assert.ok(!JSON.stringify(rdo).includes('Briga'));
  const rel = t.cliente('cli_rel_andamento', { de: dia(-7), ate: dia(0) });
  assert.ok(rel.geral && Array.isArray(rel.curva));
  assert.deepEqual(rel.ocorrencias, []);
  assert.equal(rel.fotos.length, 1);
  assert.ok(!JSON.stringify(rel).includes('Briga'));
  const n = t.cliente('notificacoes').itens;
  assert.equal(n.length, 1);
  assert.match(n[0].url, /^\.\/(c\/ava-residence\/)?#\/c\/diario\//);
  // recolher: some do portal
  t.eng('exec_cliente', { data: dia(0), mostrar: false });
  assert.deepEqual(t.cliente('cli_diarios').diarios, []);
});

test('administrador: lista, endereço único e publicação exige a chave do GitHub', () => {
  const t = preparar();
  const A = t.adm('cli_admin');
  assert.equal(A.clientes[0].usuarios[0].login, 'dono.ava');
  assert.deepEqual(A.clientes[0].modulos, ['cronograma', 'diario', 'fvs', 'financeiro']);
  assert.equal(A.github, false);
  assert.throws(() => t.adm('cli_salvar', { cliente: { nome: 'Outro', obra_id: t.obra, modelo: 'global', cor: '#000000', slug: 'ava-residence' } }), /outro cliente/);
  const img = 'data:image/png;base64,' + Buffer.from('png').toString('base64');
  assert.throws(() => t.adm('cli_publicar', { id: t.cli, imagens: { 'icon-192.png': img, 'icon-512.png': img, 'icon-maskable-512.png': img, 'icon-180.png': img } }), /chave do GitHub/);
  // guardar a chave do GitHub não troca o login do administrador (o campo é "chave", não "token")
  t.G.UrlFetchApp.fetch = () => ({ getResponseCode: () => 200, getContentText: () => '{}' });
  assert.match(t.adm('cli_github', { chave: 'github_pat_' + 'x'.repeat(40), repo: 'renancod/size' }).msg, /guardada/);
  assert.equal(t.adm('cli_admin').github, true);
  // o administrador pré-visualiza o portal do cliente
  assert.ok(t.adm('cli_inicio', { cliente: t.cli }).andamento);
});

test('negociação: cliente sem obra vê só o orçamento enviado, comenta, recebe resposta, vê a revisão nova e aceita', () => {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const tk = call('login', { login: 'admin', senha }).token, adm = (acao, d = {}) => call(acao, { token: tk, ...d });
  const cli = adm('cli_salvar', { cliente: { nome: 'Dunas', empresa: 'Mar Azul', obra_id: '', modelo: 'global', cor: '#2B4C7E', slug: 'dunas' } }).id;
  adm('cli_usuario_salvar', { cliente_id: cli, usuario: { nome: 'Maria Cliente', login: 'maria' }, senha: 'Cliente#2026x' });
  const sc = call('login', { login: 'maria', senha: 'Cliente#2026x' }), cliente = (acao, d = {}) => call(acao, { token: sc.token, ...d });
  const bruto = (acao, d = {}) => G.chamar({ acao, token: sc.token, ...d });
  assert.equal(sc.cliente.obra, false);
  assert.match(bruto('cli_cronograma').erro, /ainda não foi liberado/);
  const id = adm('prop_salvar', { proposta: { cliente: 'Mar Azul', empreendimento: 'Dunas', bdi_pct: 20, bdi_base: 'total' }, itens: [
    { tipo: 'E', descricao: 'Pavimentação' }, { descricao: 'Base de brita', unidade: 'm3', qtd: 10, unit_mat: 100, unit_mo: 50 }, { descricao: 'Meio-fio', unidade: 'm', qtd: 20, unit_mat: 10, unit_mo: 5 }] }).id;
  adm('prop_portal', { id, cliente_id: cli, modo: 'fechado' });
  assert.deepEqual(cliente('cli_orcamentos').orcamentos, []);                         // rascunho: o cliente não vê
  adm('prop_status', { id, op: 'enviar' });
  let o = cliente('cli_orcamento', { id });
  assert.equal(o.modo, 'fechado');
  assert.equal(o.etapas[0].preco, 2160);                                              // (1500 + 300) × 1,2
  assert.equal(o.etapas[0].itens[0].preco, undefined);                                // fechado: sem preço por item
  assert.ok(!JSON.stringify(o).match(/unit_mat|custo|bdi/));
  assert.equal(cliente('cli_inicio').orcamentos.length, 1);
  cliente('cli_orc_comentar', { id, item: o.etapas[0].itens[1].codigo, tipo: 'quantidade', texto: 'São 30 m de meio-fio' });
  const n = adm('notificacoes').itens.filter(i => i.etapa === 'prop_cli');
  assert.equal(n.length, 1);
  const com = adm('prop_detalhe', { id }).comentarios[0];
  assert.equal(com.item_desc, 'Meio-fio');
  adm('prop_responder', { id: com.id, resposta: 'Ajustado na revisão 1.' });
  // revisão 1 com o meio-fio corrigido e modo aberto
  const id1 = adm('prop_copiar', { id }).id;
  assert.deepEqual(cliente('cli_orcamentos').orcamentos, []);                         // revisão em rascunho: sai do portal
  assert.match(bruto('cli_orcamento', { id }).erro, /não disponível/);
  adm('prop_salvar', { proposta: { id: id1, cliente: 'Mar Azul', empreendimento: 'Dunas', bdi_pct: 20, bdi_base: 'total' }, itens: [
    { tipo: 'E', descricao: 'Pavimentação' }, { descricao: 'Base de brita', unidade: 'm3', qtd: 10, unit_mat: 100, unit_mo: 50 }, { descricao: 'Meio-fio', unidade: 'm', qtd: 30, unit_mat: 10, unit_mo: 5 }] });
  adm('prop_portal', { id: id1, cliente_id: cli, modo: 'aberto' });
  adm('prop_status', { id: id1, op: 'enviar' });
  adm('prop_status', { id: id1, op: 'reabrir' });                                     // reabriu: some de novo
  assert.deepEqual(cliente('cli_orcamentos').orcamentos, []);
  adm('prop_status', { id: id1, op: 'enviar' });
  assert.equal(cliente('cli_orcamentos').orcamentos.length, 1);
  o = cliente('cli_orcamento', { id: id1 });
  assert.equal(o.etapas[0].itens[1].preco, 540);
  // planilha aberta: custo (material e MO), BDI e administração de cada item e o resumo
  assert.deepEqual([o.etapas[0].itens[1].custo, o.etapas[0].itens[1].v_mat, o.etapas[0].itens[1].bdi], [450, 300, 90]);
  assert.deepEqual([o.resumo.bdi_pct, o.resumo.bdi, o.resumo.custo], [20, 390, 1950]);
  assert.match(bruto('cli_orc_insumos', { id: id1, item: o.etapas[0].itens[1].codigo }).erro, /não tem composição/);   // preço direto
  assert.equal(o.diferencas.alterados.length, 1);
  assert.equal(o.comentarios[0].resposta, 'Ajustado na revisão 1.');
  assert.ok(cliente('notificacoes').itens.some(i => i.etapa === 'cli_orc'));
  assert.match(bruto('cli_orc_comentar', { id, texto: 'velha' }).erro, /não está mais em negociação/);   // a rev. 0 ficou "Revisado"
  assert.match(bruto('cli_orc_aceitar', { id: id1, nome: 'Ma', concordo: true }).erro, /nome completo/);
  assert.match(cliente('cli_orc_aceitar', { id: id1, nome: 'Maria da Silva', concordo: true }).msg, /aceito/);
  const p = adm('prop_detalhe', { id: id1 }).proposta;
  assert.equal(p.status, 'Aprovado');
  assert.equal(p.aceite.nome, 'Maria da Silva');
  assert.ok(adm('notificacoes').itens.some(i => /Aceito pelo cliente/.test(i.texto)));
  // não fechou: encerra o acesso e ele perde na hora
  adm('cli_salvar', { cliente: { id: cli, nome: 'Dunas', obra_id: '', modelo: 'global', cor: '#2B4C7E', slug: 'dunas', ativo: false } });
  assert.match(bruto('cli_orcamentos').erro, /desativado/);
});
