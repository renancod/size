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
  assert.deepEqual(A.clientes[0].empreendimentos[0].modulos, ['cronograma', 'diario', 'fvs', 'financeiro', 'documentos']);   // cadastro antigo (uma obra) vira o 1º empreendimento
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
  adm('prop_portal', { id: id1, cliente_id: '', modo: 'aberto' });                    // tirou o cliente da revisão nova: a velha não volta
  assert.deepEqual(cliente('cli_orcamentos').orcamentos, []);
  adm('prop_status', { id: id1, op: 'enviar' });                                      // nem quando a nova é enviada sem cliente
  assert.deepEqual(cliente('cli_orcamentos').orcamentos, []);
  adm('prop_status', { id: id1, op: 'reabrir' });
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

test('vários empreendimentos: cartões no início, cada obra com o seu tipo, foto do cadastro e aviso que abre na obra certa', () => {
  const t = preparar('gestao');
  const obra2 = t.adm('admin_obra_criar', { nome: 'Condomínio Norte', sigla: 'CN', endereco: 'Rua Y' }).id;
  const emps = [{ obra: t.obra, modelo: 'gestao' }, { obra: obra2, modelo: 'global' }];
  assert.throws(() => t.adm('cli_salvar', { cliente: { id: t.cli, nome: 'Mar Azul', obra_id: '', empreendimentos: [emps[0], emps[0]], cor: '#1D6F5F', slug: 'ava-residence' } }), /duas vezes/);
  t.adm('cli_salvar', { cliente: { id: t.cli, nome: 'Mar Azul', empresa: 'Mar Azul', empreendimentos: emps, cor: '#1D6F5F', slug: 'ava-residence' } });
  const ini = t.cliente('cli_inicio');
  assert.equal(ini.obra, null);
  assert.deepEqual(ini.empreendimentos.map(e => [e.nome, e.tipo]), [['Loteamento Sul', 'Gerenciamento'], ['Condomínio Norte', 'Execução']]);
  assert.ok(typeof ini.empreendimentos[1].andamento.pct_exec === 'number');
  assert.equal(t.cliente('cli_inicio', { obra: obra2 }).obra.nome, 'Condomínio Norte');
  // Execução não mostra financeiro; Gerenciamento mostra
  assert.match(t.G.chamar({ acao: 'cli_financeiro', token: t.sessao.token, obra: obra2 }).erro, /não está liberada/);
  assert.ok(t.cliente('cli_financeiro', { obra: t.obra }).total);
  // obra que não é dele
  const outra = t.adm('admin_obra_criar', { nome: 'Outra', sigla: 'OT', endereco: 'Z' }).id;
  assert.match(t.G.chamar({ acao: 'cli_cronograma', token: t.sessao.token, obra: outra }).erro, /não está liberado/);
  // foto do cartão: sem foto nem diário → vazia; com a foto do cadastro → a imagem; salvar o cadastro mantém a foto
  assert.equal(t.cliente('cli_emp_foto', { obra: obra2 }).b64, '');
  t.adm('cli_emp_foto_salvar', { id: t.cli, obra: obra2, arquivo: FOTO });
  t.adm('cli_salvar', { cliente: { id: t.cli, nome: 'Mar Azul', empreendimentos: emps, cor: '#1D6F5F', slug: 'ava-residence' } });
  assert.ok(t.cliente('cli_emp_foto', { obra: obra2 }).b64);
  assert.equal(t.adm('cli_admin').clientes[0].empreendimentos[1].foto, true);
  // aviso de diário liberado leva o empreendimento na rota
  const cod = t.eng('exec_etapa_salvar', { nome: 'Pavimentação', local: 'Rua X', itens: [{ servico: 'Base', qtd_prevista: 500, inicio: dia(-10), termino: dia(10) }] }).codigo;
  const item = t.eng('exec_dados').etapas.find(e => e.codigo === cod).itens[0];
  t.eng('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: item.id, qtd: 40 }], enviar: true });
  t.eng('exec_cliente', { data: dia(0), mostrar: true });
  const n = t.cliente('notificacoes').itens.find(i => i.etapa === 'cli_diario');
  assert.equal(n.obra_nome, 'Loteamento Sul');
  assert.match(n.rota, new RegExp('\\?o=' + t.obra + '$'));
  // a sessão traz a lista para o menu
  assert.equal(t.cliente('sessao').cliente.empreendimentos.length, 2);
});

test('do orçamento à obra: tipo e foto no orçamento, o cliente vê a foto e o Gerar obra já libera a obra no portal', () => {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const tk = call('login', { login: 'admin', senha }).token, adm = (acao, d = {}) => call(acao, { token: tk, ...d });
  const cli = adm('cli_salvar', { cliente: { nome: 'Dunas', empresa: 'Mar Azul', cor: '#2B4C7E', slug: 'dunas' } }).id;
  adm('cli_usuario_salvar', { cliente_id: cli, usuario: { nome: 'Maria', login: 'maria' }, senha: 'Cliente#2026x' });
  const sc = call('login', { login: 'maria', senha: 'Cliente#2026x' }), cliente = (acao, d = {}) => call(acao, { token: sc.token, ...d });
  const id = adm('prop_salvar', { proposta: { cliente: 'Mar Azul', empreendimento: 'Residencial Dunas', local: 'Xangri-lá/RS', bdi_pct: 20 }, itens: [
    { tipo: 'E', descricao: 'Pavimentação' }, { descricao: 'Base de brita', unidade: 'm3', qtd: 10, unit_mat: 100, unit_mo: 50 }] }).id;
  adm('prop_portal', { id, cliente_id: cli, modo: 'fechado', tipo: 'global' });
  adm('prop_foto', { id, arquivo: FOTO });
  assert.ok(adm('prop_foto_ver', { id }).b64);
  adm('prop_status', { id, op: 'enviar' });
  const o = cliente('cli_orcamento', { id });
  assert.equal(o.foto, true);
  assert.equal(o.tipo, 'Execução');
  assert.ok(cliente('cli_orc_foto', { id }).b64);
  cliente('cli_orc_aceitar', { id, nome: 'Maria da Silva', concordo: true });
  const r = adm('prop_gerar_obra', { id, nome: 'Residencial Dunas', sigla: 'RD', endereco: 'Xangri-lá/RS', portal: true });
  assert.match(r.msg, /Dunas já acompanha a obra/);
  const s = cliente('sessao').cliente;
  assert.deepEqual(s.empreendimentos.map(e => [e.id, e.tipo]), [[r.obra_id, 'Execução']]);
  assert.ok(cliente('cli_emp_foto', { obra: r.obra_id }).b64);                       // a foto do orçamento virou a foto do cartão
  assert.match(cliente('cli_inicio').orcamentos[0].obra_id, new RegExp(r.obra_id));   // o orçamento aparece no painel da obra
  assert.ok(cliente('notificacoes').itens.some(i => i.etapa === 'cli_obra' && /começou/.test(i.texto)));
  // sem marcar o portal, a obra não entra para o cliente
  const id2 = adm('prop_copiar', { id, novo: true }).id;
  assert.equal(adm('prop_detalhe', { id: id2 }).proposta.foto_id, '');
});

test('excluir acesso do cliente: só o login daquele cliente, e ele não entra mais', () => {
  const t = preparar();
  const outro = t.adm('cli_salvar', { cliente: { nome: 'Outro', cor: '#2B4C7E', slug: 'outro' } }).id;
  const uid = t.adm('cli_admin').clientes.find(c => c.id === t.cli).usuarios[0].id;
  assert.throws(() => t.adm('cli_usuario_excluir', { cliente_id: outro, id: uid }), /não é deste cliente/);
  assert.match(t.adm('cli_usuario_excluir', { cliente_id: t.cli, id: uid }).msg, /excluído/);
  assert.equal(t.adm('cli_admin').clientes.find(c => c.id === t.cli).usuarios.length, 0);
  assert.equal(t.G.chamar({ acao: 'login', login: 'dono.ava', senha: 'Cliente#2026x' }).ok, false);
  assert.equal(t.bruto('cli_inicio').ok, false);
});

test('cada acesso vê o que foi liberado: obras escolhidas, sem orçamentos ou sem financeiro', () => {
  const t = preparar('gestao');
  const obra2 = t.adm('admin_obra_criar', { nome: 'Condomínio Norte', sigla: 'CN', endereco: 'Rua Y' }).id;
  t.adm('cli_salvar', { cliente: { id: t.cli, nome: 'Mar Azul', empreendimentos: [{ obra: t.obra, modelo: 'gestao' }, { obra: obra2, modelo: 'gestao' }], cor: '#1D6F5F', slug: 'ava-residence' } });
  // engenheiro: só a obra 2, sem orçamentos e sem financeiro
  const eng = t.adm('cli_usuario_salvar', { cliente_id: t.cli, usuario: { nome: 'Eng. Paulo', login: 'paulo.eng' }, senha: 'Engenheiro#26', portal: { obras: [obra2], orcamentos: false, modulos: ['cronograma', 'diario', 'fvs'] } }).id;
  assert.throws(() => t.adm('cli_usuario_salvar', { cliente_id: t.cli, usuario: { id: eng, nome: 'Eng. Paulo', login: 'paulo.eng' }, portal: { obras: [], orcamentos: false } }), /não vê nada/);
  const s = t.G.chamar({ acao: 'login', login: 'paulo.eng', senha: 'Engenheiro#26' }).dados, ch = (acao, d = {}) => t.G.chamar({ acao, token: s.token, ...d });
  assert.deepEqual(s.cliente.empreendimentos.map(e => e.id), [obra2]);
  assert.deepEqual(s.cliente.empreendimentos[0].modulos, ['cronograma', 'diario', 'fvs']);
  assert.equal(s.cliente.ve_orcamentos, false);
  assert.match(ch('cli_cronograma', { obra: t.obra }).erro, /não está liberado/);
  assert.ok(ch('cli_cronograma', { obra: obra2 }).ok);
  assert.match(ch('cli_financeiro', { obra: obra2 }).erro, /não está liberada/);
  assert.match(ch('cli_orcamentos').erro, /não estão liberados/);
  assert.deepEqual(ch('cli_inicio').dados.orcamentos, []);
  // o dono continua vendo tudo
  assert.equal(t.cliente('sessao').cliente.empreendimentos.length, 2);
  assert.ok(t.cliente('cli_financeiro', { obra: t.obra }).total);
  const A = t.adm('cli_admin').clientes[0].usuarios.find(u => u.login === 'paulo.eng').portal;
  assert.deepEqual([A.obras, A.orcamentos, A.modulos], [[obra2], false, ['cronograma', 'diario', 'fvs']]);
});

test('cadastro do cliente: CNPJ conferido, contato, contagem de orçamentos (com rascunho) e o orçamento puxa os dados', () => {
  const t = preparar();
  const base = { id: t.cli, nome: 'AVA Residence', obra_id: t.obra, modelo: 'gestao', cor: '#1d6f5f', slug: 'ava-residence' };
  assert.throws(() => t.adm('cli_salvar', { cliente: { ...base, cnpj: '11.222.333/0001-82' } }), /CNPJ inválido/);
  assert.throws(() => t.adm('cli_salvar', { cliente: { ...base, cnpj: '123' } }), /14 números/);
  t.adm('cli_salvar', { cliente: { ...base, razao_social: 'Mar Azul Ltda', cnpj: '11222333000181', contato: 'Paulo', cargo: 'diretor', email: 'paulo@marazul.com', telefone: '(51) 99999-0000', cidade: 'Xangri-lá/RS', obs: 'paga em 30 dias' } });
  let c = t.adm('cli_admin').clientes[0];
  assert.deepEqual([c.cnpj, c.contato, c.email, c.orc_total, c.logo_url], ['11.222.333/0001-81', 'Paulo', 'paulo@marazul.com', 0, '']);
  assert.equal(t.adm('cli_salvar', { cliente: { ...base, cnpj: '52998224725' } }).id, t.cli);   // CPF também vale
  // orçamento em rascunho ligado ao cliente: conta na lista e puxa CNPJ, contato, telefone, e-mail e cidade
  const id = t.adm('prop_salvar', { proposta: { cliente: 'AVA', empreendimento: 'Praça', bdi_pct: 0 }, itens: [{ tipo: 'E', descricao: 'Praça' }, { descricao: 'Grama', unidade: 'm2', qtd: 1, unit_mat: 10 }] }).id;
  t.adm('cli_salvar', { cliente: { ...base, cnpj: '11222333000181', contato: 'Paulo', telefone: '51 9', email: 'p@m.com', cidade: 'Xangri-lá/RS' } });
  t.adm('prop_portal', { id, cliente_id: t.cli, modo: 'aberto' });
  const p = t.adm('prop_detalhe', { id }).proposta;
  assert.deepEqual([p.cliente, p.cliente_doc, p.contato, p.telefone, p.email, p.local], ['AVA', '11.222.333/0001-81', 'Paulo', '51 9', 'p@m.com', 'Xangri-lá/RS']);
  c = t.adm('cli_admin').clientes[0];
  assert.deepEqual([c.orc_total, c.orcamentos.length], [1, 0]);   // no portal ainda não (rascunho)
});

test('acesso por e-mail pelo sistema: sem e-mail avisa, com e-mail envia com o botão do portal, guarda o e-mail e a data', () => {
  const t = preparar();
  const u = t.adm('cli_admin').clientes[0].usuarios[0];
  assert.equal(u.email, '');
  const msg = 'Olá, Dono! Segue seu acesso ao portal.\nUsuário: dono.ava';
  assert.throws(() => t.adm('cli_acesso_email', { cliente_id: t.cli, id: u.id, para: '', mensagem: msg }), /não tem e-mail cadastrado/);
  assert.throws(() => t.adm('cli_acesso_email', { cliente_id: t.cli, id: u.id, para: 'sem-arroba', mensagem: msg }), /E-mail inválido/);
  const outro = t.adm('cli_salvar', { cliente: { nome: 'Outro', cor: '#2B4C7E', slug: 'outro' } }).id;
  assert.throws(() => t.adm('cli_acesso_email', { cliente_id: outro, id: u.id, para: 'a@b.com', mensagem: msg }), /não é deste cliente/);
  const n0 = t.G._enviados.length;
  assert.match(t.adm('cli_acesso_email', { cliente_id: t.cli, id: u.id, para: 'dono@marazul.com', mensagem: msg }).msg, /enviado para dono@marazul\.com/);
  const e = t.G._enviados[n0];
  assert.equal(e.para, 'dono@marazul.com');
  assert.match(e.assunto, /Acesso ao portal AVA Residence/);
  assert.match(e.html, /Acessar o portal/);
  assert.match(e.html, /Usuário: dono\.ava/);
  const u2 = t.adm('cli_admin').clientes.find(c => c.id === t.cli).usuarios[0];
  assert.equal(u2.email, 'dono@marazul.com');
  assert.ok(u2.enviado_em);
  assert.throws(() => t.cliente('cli_acesso_email', { cliente_id: t.cli, id: u.id, para: 'x@y.com', mensagem: msg }));   // só a Size envia
});

test('documentos da obra no portal: só os marcados "cliente vê", só para quem tem a área; ART e projeto não mexem no valor', () => {
  const t = preparar('gestao');
  assert.throws(() => t.adm('cc_salvar', { obra: t.obra, contrato: { tipo: 'ART', numero: 'ART 1' } }), /Anexe o arquivo/);
  const art = t.adm('cc_salvar', { obra: t.obra, contrato: { tipo: 'ART', numero: 'ART 1', valor: '999', dias_uteis: 9 }, arquivo: FOTO }).id;
  const proj = t.adm('cc_salvar', { obra: t.obra, contrato: { tipo: 'Projeto', numero: 'Projeto de drenagem', cliente: true }, arquivo: FOTO }).id;
  const ad = t.adm('cc_salvar', { obra: t.obra, contrato: { tipo: 'Aditivo', numero: 'Aditivo 01', valor: '500', dias_uteis: 3 }, arquivo: FOTO }).id;
  const L = t.adm('cc_listar', { obra: t.obra });
  assert.equal(L.valor_total, 500);
  assert.deepEqual(L.contratos.filter(c => !c.contrato).map(c => [c.numero, c.valor, c.dias_uteis, c.cliente]), [['ART 1', 0, 0, false], ['Projeto de drenagem', 0, 0, true]]);
  assert.equal(t.G.rodar(`ccAditivoDias_({ ss: SpreadsheetApp.openById(central_('Obras').all()[0].planilha_id), obra: central_('Obras').all()[0] })`), 3);
  // cliente: aditivo (marcado por padrão) e projeto; a ART interna não aparece nem abre
  const D = t.cliente('cli_documentos', { obra: t.obra }).documentos;
  assert.deepEqual(D.map(d => [d.numero, d.valor]), [['Aditivo 01', 500], ['Projeto de drenagem', null]]);
  assert.ok(t.cliente('cli_doc_arquivo', { obra: t.obra, id: proj }).b64);
  assert.match(t.bruto('cli_doc_arquivo', { id: art }).erro, /não disponível/);
  assert.ok(t.cliente('notificacoes').itens.some(i => i.etapa === 'cli_doc' && /Aditivo 01/.test(i.texto)));
  // engenheiro do cliente sem a área Documentos
  t.adm('cli_usuario_salvar', { cliente_id: t.cli, usuario: { nome: 'Eng', login: 'eng.cli' }, senha: 'Engenheiro#26', portal: { obras: 'todas', orcamentos: false, modulos: ['cronograma', 'diario', 'fvs'] } });
  const s = t.G.chamar({ acao: 'login', login: 'eng.cli', senha: 'Engenheiro#26' }).dados;
  assert.match(t.G.chamar({ acao: 'cli_documentos', token: s.token, obra: t.obra }).erro, /não está liberada/);
  assert.ok(ad);
});

test('endereço do cliente: ícone, logo e fundo com versão (o navegador não fica com a imagem antiga)', () => {
  const G = criarGAS();
  const a = G.rodar(`cliArquivos_({ id: 'CL001', slug: 'x', nome: 'X', cor: '#1D6F5F', _capa: true, _logo: true, _v: 'abc' })`);
  assert.match(a['index.html'], /icon-192\.png\?v=abc/);
  assert.match(a['index.html'], /manifest\.json\?v=abc/);
  assert.match(a['manifest.json'], /icon-512\.png\?v=abc/);
  assert.match(a['cliente.js'], /logo\.png\?v=abc/);
  assert.match(a['cliente.js'], /capa\.jpg\?v=abc/);
});

test('contratos do cliente: principal no Gerar obra, aditivo pelo orçamento (frentes novas) e à mão, prazo em dias úteis', () => {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const tk = call('login', { login: 'admin', senha }).token, adm = (acao, d = {}) => call(acao, { token: tk, ...d });
  const orc = (nome, etapa) => {
    const id = adm('prop_salvar', { proposta: { cliente: 'Mar Azul', empreendimento: nome, bdi_pct: 0 }, itens: [{ tipo: 'E', descricao: etapa }, { descricao: 'Base de brita', unidade: 'm3', qtd: 10, unit_mat: 100 }] }).id;
    adm('prop_cronograma', { id, etapas: [{ codigo: '1', ini: dia(-20), fim: dia(40) }] });
    adm('prop_status', { id, op: 'aprovar' });
    return id;
  };
  const id = orc('Residencial Dunas', 'Pavimentação');
  const obra = adm('prop_gerar_obra', { id, nome: 'Residencial Dunas', sigla: 'RD', endereco: 'X' }).obra_id;
  let L = adm('cc_listar', { obra });
  assert.deepEqual(L.contratos.map(c => [c.tipo, c.valor]), [['Contrato', 1000]]);
  assert.equal(L.contratos[0].frentes[0].nome, 'Pavimentação');
  const P0 = L.prazo;
  assert.ok(P0.total > 30 && P0.passados > 0 && P0.restantes > 0);
  assert.equal(P0.situacao, 'andamento');
  // aditivo vindo de outro orçamento aprovado: frente geral nova e +10 dias úteis
  const id2 = orc('Dunas · praça', 'Paisagismo');
  assert.match(adm('prop_incluir_obra', { id: id2, obra_id: obra, tipo: 'Aditivo', dias_uteis: 10 }).msg, /Aditivo 1 incluído.*\+10 dias úteis/);
  L = adm('cc_listar', { obra });
  assert.equal(L.contratos.length, 2);
  assert.equal(L.contratos[1].frentes[0].nome, 'Paisagismo · Aditivo 1');
  assert.equal(L.valor_total, 2000);
  assert.equal(L.prazo.total, P0.total + 10);
  assert.equal(L.prazo.aditivo_dias, 10);
  assert.throws(() => adm('prop_incluir_obra', { id: id2, obra_id: obra }), /já está na obra/);
  // aditivo à mão com o documento, ligado a uma frente que já existe
  const fr = L.frentes.find(f => f.nome === 'Pavimentação').codigo;
  assert.throws(() => adm('cc_salvar', { obra, contrato: { tipo: 'Contrato', numero: 'X' } }), /já tem o contrato principal/);
  const cc = adm('cc_salvar', { obra, contrato: { tipo: 'Aditivo', numero: 'Aditivo 02', valor: '1.500,00', dias_uteis: 5, frentes: [fr] }, arquivo: FOTO }).id;
  L = adm('cc_listar', { obra });
  const a2 = L.contratos.find(c => c.id === cc);
  assert.deepEqual([a2.valor, a2.dias_uteis, a2.arquivo, a2.frentes.map(f => f.nome)], [1500, 5, true, ['Pavimentação']]);
  assert.equal(L.contratos.find(c => c.tipo === 'Contrato').frentes.length, 0);   // a frente passou para o aditivo
  assert.ok(adm('cc_arquivo', { obra, id: cc }).b64);
  assert.equal(L.prazo.aditivo_dias, 15);
  adm('cc_excluir', { obra, id: cc });
  assert.equal(adm('cc_listar', { obra }).prazo.aditivo_dias, 10);
  // o cartão do Início mostra o prazo
  assert.equal(adm('empresa_dados').obras.find(o => o.id === obra).prazo.total, P0.total + 10);
});
