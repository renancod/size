// Testa o backend de ponta a ponta com o simulador: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

const PDF = { nome: 'orc.pdf', mime: 'application/pdf', b64: Buffer.from('%PDF-1.4 teste').toString('base64') };

function preparar() {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const login = call('login', { login: 'admin', senha });
  const adm = (acao, d = {}) => call(acao, { token: login.token, ...d });
  return { G, call, adm, senha };
}
function criarUsuario(t, login, perfil, obra) {
  const perfis = t.adm('admin_dados').perfis;
  const p = perfis.find(x => x.perfil === perfil);
  t.adm('admin_usuario_salvar', { usuario: { nome: login, login, ativo: true }, senha: 'senha123', acessos: obra ? [{ obra_id: obra, perfil, permissoes: p.permissoes }] : [] });
  const s = t.call('login', { login, senha: 'senha123' });
  return (acao, d = {}) => t.call(acao, { token: s.token, obra, ...d });
}
const falha = (fn, re) => assert.throws(fn, re);

test('setup, login e troca de senha', () => {
  const t = preparar();
  const s = t.call('login', { login: 'admin', senha: t.senha });
  assert.equal(s.usuario.trocar_senha, true);
  falha(() => t.call('login', { login: 'admin', senha: 'errada' }), /incorretos/);
  t.adm('trocarSenha', { atual: t.senha, nova: 'nova123' });
  assert.equal(t.call('login', { login: 'ADMIN', senha: 'nova123' }).usuario.trocar_senha, false);
  falha(() => t.call('sessao', { token: 'x.y' }), /Sessão inválida/);
});

test('obra nova nasce com materiais padrão e frentes', () => {
  const t = preparar();
  t.adm('admin_padrao_salvar', { descricao: 'Cimento CP-II 50kg', unidade: 'sc' });
  t.adm('admin_padrao_salvar', { descricao: 'Areia média', unidade: 'm³' });
  const { id } = t.adm('admin_obra_criar', { nome: 'Prime Beach', sigla: 'pb', endereco: 'Rua A, 1' });
  const d = t.adm('obra_dados', { obra: id });
  assert.equal(d.obra.sigla, 'PB');
  assert.deepEqual(d.materiais.map(m => m.descricao), ['Cimento CP-II 50kg', 'Areia média']);
  assert.ok(d.frentes.length >= 5);
  falha(() => t.adm('admin_obra_criar', { nome: 'Outra', sigla: 'PB' }), /sigla PB/);
});

test('permissões: só vê a obra liberada e só faz o que o perfil permite', () => {
  const t = preparar();
  const a = t.adm('admin_obra_criar', { nome: 'Obra A', sigla: 'OA' }).id;
  const b = t.adm('admin_obra_criar', { nome: 'Obra B', sigla: 'OB' }).id;
  const sol = criarUsuario(t, 'joao', 'Solicitante', a);
  const sess = sol('sessao');
  assert.deepEqual(sess.obras.map(o => o.id), [a]);
  falha(() => sol('obra_dados', { obra: b }), /não tem acesso/);
  const { numero } = sol('pedido_criar', { itens: [{ descricao: 'Prego 18x27', qtd: 5, unidade: 'kg' }] });
  assert.equal(numero, 'OA-0001');
  falha(() => sol('pedido_cotar', { numeros: [numero], fornecedores: ['F001'] }), /permissão/);
  falha(() => sol('admin_dados'), /administradores/);
  const fin = criarUsuario(t, 'maria', 'Financeiro', a);
  falha(() => fin('pedido_criar', { itens: [{ descricao: 'x', qtd: 1 }] }), /permissão/);
  assert.equal(fin('pedidos_listar').pedidos.length, 1);
});

test('fluxo FATURADO 30 dias: cotação → regra de orçamentos → aprovação → liberação → recebimento parcial/total → NF → financeiro → concluído', () => {
  const t = preparar();
  const obra = t.adm('admin_obra_criar', { nome: 'Prime Beach', sigla: 'PB' }).id;
  t.adm('admin_config_salvar', { config: { MIN_ORCAMENTOS: 1, REGRAS_ORCAMENTO: '5000:2' } });
  const est = criarUsuario(t, 'estoque', 'Estoque', obra);
  const com = criarUsuario(t, 'compras', 'Compras', obra);
  const fin = criarUsuario(t, 'fin', 'Financeiro', obra);
  const apr = criarUsuario(t, 'gestor', 'Aprovador', obra);
  t.adm('admin_usuario_salvar', { usuario: { id: t.adm('admin_dados').usuarios.find(u => u.login === 'gestor').id, nome: 'gestor', login: 'gestor', email: 'gestor@size.com', ativo: true } });
  com('cad_salvar', { tipo: 'fornecedores', dados: { nome: 'Casa do Construtor', email: 'vendas@casa.com', telefone: '51999990000' } });
  com('cad_salvar', { tipo: 'fornecedores', dados: { nome: 'Depósito Sul' } });
  const forn = com('obra_dados').fornecedores;

  const { numero } = est('pedido_criar', {
    frente: 'Fundação', prioridade: 'Urgente', necessidade: '2026-10-20',
    itens: [{ descricao: 'Cimento CP-II 50kg', qtd: 100, unidade: 'sc' }, { descricao: 'Areia média', qtd: 10, unidade: 'm³' }]
  });

  // cotação: fornecedor sem e-mail recebe e-mail digitado na hora (bug do app antigo)
  const r = com('pedido_cotar', { numeros: [numero], fornecedores: forn.map(f => f.codigo), emails: { [forn[1].codigo]: 'deposito@sul.com' } });
  assert.match(r.msg, /Casa do Construtor, Depósito Sul/);
  assert.equal(t.G._enviados.length, 2);
  assert.match(t.G._enviados[0].assunto, /Cotação Size · Prime Beach \[PB-0001\]/);
  assert.equal(com('obra_dados').fornecedores[1].email, 'deposito@sul.com');

  // sem orçamento não define
  falha(() => com('pedido_definir', { numero, orcamento: 'x', valor: 100 }), /orçamento vencedor/);
  com('orcamento_salvar', { pedido: numero, fornecedor_cod: forn[0].codigo, valor: '6.200,00', arquivo: PDF });
  let det = com('pedido_detalhe', { numero });
  assert.equal(det.minimo, 2); // R$ 6.200 >= 5000 → 2 orçamentos
  const orc1 = det.orcamentos[0].id;
  // 1 orçamento para R$ 6.200: bloqueia; Compras não pode justificar exceção (só quem aprova)
  falha(() => com('pedido_definir', { numero, orcamento: orc1, condicao: 'Faturado' }), /necessários 2 orçamentos/);
  falha(() => com('pedido_definir', { numero, orcamento: orc1, condicao: 'Faturado', excecao: 'urgente' }), /Só quem aprova/);
  com('orcamento_salvar', { pedido: numero, fornecedor_cod: forn[1].codigo, valor: '6500', arquivo: PDF });
  const n = t.G._enviados.length;
  com('pedido_definir', { numero, orcamento: orc1, condicao: 'Faturado', prazo_fat: 30, valores: { 1: '50', 2: '120' }, aprovar: true });
  det = com('pedido_detalhe', { numero });
  assert.equal(det.pedido.situacao, 'Aguardando aprovação'); // Compras pediu "aprovar", mas não tem permissão
  assert.equal(det.pedido.valor_total, 6200);
  assert.equal(det.itens[0].valor_unit, 50);
  assert.equal(t.G._enviados.length, n + 1);
  assert.match(t.G._enviados.at(-1).para, /gestor@size\.com/);
  assert.match(t.G._enviados.at(-1).assunto, /^Aprovação · Prime Beach \[PB-0001\]/);

  falha(() => com('pedido_aprovar', { numero }), /permissão/);
  apr('pedido_aprovar', { numero });
  det = com('pedido_detalhe', { numero });
  assert.equal(det.pedido.situacao, 'Liberar entrega');
  assert.equal(det.pedido.fin, 'Aguardando NF');
  // estoque não recebe antes de liberar
  falha(() => est('pedido_receber', { numero, itens: { 1: 10 } }), /não está liberado/);
  com('pedido_liberar', { numero, previsao: '2026-10-15' });
  assert.match(t.G._enviados.at(-1).assunto, /Pedido Size · Prime Beach \[PB-0001\]/);

  // recebimento parcial, depois excesso bloqueado, depois o resto com NF
  est('pedido_receber', { numero, itens: { 1: 60 } });
  det = est('pedido_detalhe', { numero });
  assert.equal(det.pedido.situacao, 'Recebido parcial');
  falha(() => est('pedido_receber', { numero, itens: { 1: 41 } }), /faltam só 40/);
  assert.equal(est('estoque_saldo').itens.find(i => i.descricao.startsWith('Cimento')).saldo, 60);
  est('pedido_receber', { numero, itens: { 1: 40, 2: 10 }, nf_numero: '12345', nf_data: '2026-10-16', nf: PDF });
  det = est('pedido_detalhe', { numero });
  assert.equal(det.pedido.entrega, 'Recebido');
  assert.equal(det.pedido.fin, 'A pagar');
  assert.equal(det.pedido.vencimento.slice(0, 10), '2026-11-15');
  assert.equal(det.pedido.situacao, 'A pagar');

  // financeiro paga com comprovante → concluído
  falha(() => fin('pedido_pagar', { numero, forma: 'PIX' }), /comprovante/);
  fin('pedido_pagar', { numero, forma: 'Boleto', data: '2026-11-10', comprovante: PDF });
  det = fin('pedido_detalhe', { numero });
  assert.equal(det.pedido.status, 'Concluído');
  assert.equal(det.arquivos.filter(a => a.tipo === 'COMPROVANTE').length, 1);

  // estoque: saída para frente e saldo
  const cim = est('obra_dados').materiais.find(m => /Cimento/.test(m.descricao));
  assert.equal(cim, undefined); // material fora do cadastro (não havia padrão) — saída exige material cadastrado
  est('cad_salvar', { tipo: 'materiais', dados: { descricao: 'Brita 1', unidade: 'm³', estoque_min: 5 } });
  const brita = est('obra_dados').materiais.find(m => m.descricao === 'Brita 1');
  est('estoque_movimentar', { tipo: 'Entrada', material_cod: brita.codigo, qtd: 8 });
  falha(() => est('estoque_movimentar', { tipo: 'Saída', material_cod: brita.codigo, qtd: 9, frente: 'Fundação' }), /Saldo insuficiente/);
  est('estoque_movimentar', { tipo: 'Saída', material_cod: brita.codigo, qtd: 4, frente: 'Fundação' });
  const b = est('estoque_saldo').itens.find(i => i.descricao === 'Brita 1');
  assert.equal(b.saldo, 4);
  assert.equal(b.estoque_min, 5);
});

test('fluxo FATURAMENTO DIRETO: financeiro paga antes; liberação bloqueada até pagar', () => {
  const t = preparar();
  const obra = t.adm('admin_obra_criar', { nome: 'Obra D', sigla: 'OD' }).id;
  const com = criarUsuario(t, 'compras', 'Compras', obra);
  const fin = criarUsuario(t, 'fin', 'Financeiro', obra);
  const est = criarUsuario(t, 'est', 'Estoque', obra);
  const apr = criarUsuario(t, 'gestor', 'Aprovador', obra);
  com('cad_salvar', { tipo: 'fornecedores', dados: { nome: 'Ferragens X', email: 'x@x.com' } });
  const { numero } = est('pedido_criar', { itens: [{ descricao: 'Vergalhão 10mm', qtd: 20, unidade: 'barra' }] });
  com('orcamento_salvar', { pedido: numero, fornecedor_cod: 'F001', valor: 900, arquivo: PDF });
  const orc = com('pedido_detalhe', { numero }).orcamentos[0].id;
  com('pedido_definir', { numero, orcamento: orc, condicao: 'Faturamento direto' });
  apr('pedido_aprovar', { numero });
  let p = com('pedido_detalhe', { numero }).pedido;
  assert.equal(p.situacao, 'Aguardando pagamento');
  falha(() => com('pedido_liberar', { numero }), /financeiro precisa registrar o pagamento/);
  const antes = t.G._enviados.length;
  fin('pedido_pagar', { numero, forma: 'PIX', comprovante: PDF, avisar: true });
  assert.equal(t.G._enviados.length, antes + 1);
  assert.equal(t.G._enviados.at(-1).anexos, 1);
  assert.match(t.G._enviados.at(-1).html, /fornecedor\.html\?t=/); // e-mail leva o link do portal
  p = com('pedido_detalhe', { numero }).pedido;
  assert.equal(p.situacao, 'Entrega liberada'); // o comprovante já libera a entrega
  falha(() => com('pedido_liberar', { numero }), /não está aguardando liberação/);
  est('pedido_receber', { numero, itens: { 1: 15 }, encerrar: true, obs: 'fornecedor sem estoque' });
  p = com('pedido_detalhe', { numero }).pedido;
  assert.equal(p.status, 'Concluído');
  assert.match(p.historico, /ENCERRADO com falta/);
});

test('portal do fornecedor: orçamento pelo link, prazo de entrega e NF depois da entrega', () => {
  const t = preparar();
  const obra = t.adm('admin_obra_criar', { nome: 'Prime Beach', sigla: 'PB', endereco: 'Av. Beira-Mar' }).id;
  const com = criarUsuario(t, 'compras', 'Compras', obra);
  const apr = criarUsuario(t, 'gestor', 'Aprovador', obra);
  const est = criarUsuario(t, 'est', 'Estoque', obra);
  const fin = criarUsuario(t, 'fin', 'Financeiro', obra);
  com('cad_salvar', { tipo: 'fornecedores', dados: { nome: 'Casa', email: 'casa@x.com', condicao: '28 dias boleto' } });
  com('cad_salvar', { tipo: 'fornecedores', dados: { nome: 'Depósito sem e-mail', telefone: '51999990000' } });
  const n = est('pedido_criar', { itens: [{ descricao: 'Cimento', qtd: 20, unidade: 'sc' }, { descricao: 'Areia', qtd: 2, unidade: 'm³' }] }).numero;

  // cotação: quem não tem e-mail não trava; todos recebem link
  const r = com('pedido_cotar', { numeros: [n], fornecedores: ['F001', 'F002'] });
  assert.equal(r.links.length, 2);
  assert.match(t.G._enviados.at(-1).html, /Enviar orçamento pelo portal/);
  const tok = u => new URL(u).searchParams.get('t');
  const casa = (acao, d = {}) => t.call(acao, { t: tok(r.links[0].url), ...d });
  const dep = (acao, d = {}) => t.call(acao, { t: tok(r.links[1].url), ...d });

  falha(() => t.call('forn_dados', { t: tok(r.links[0].url).slice(0, -3) + 'abc' }), /Link inválido/);
  let pd = casa('forn_dados');
  assert.equal(pd.fornecedor.nome, 'Casa');
  assert.equal(pd.pedidos[0].etapa, 'cotacao');
  assert.equal(pd.pedidos[0].itens.length, 2);
  falha(() => casa('forn_orcamento', { numero: n, valor: '', prazo_entrega: '2 dias' }), /valor total/);
  casa('forn_orcamento', { numero: n, valor: '1.200,00', prazo_entrega: '2 dias', condicao: '28 dias' });
  casa('forn_orcamento', { numero: n, valor: '1.150,00', prazo_entrega: '2 dias', condicao: '28 dias', arquivo: PDF }); // atualiza, não duplica
  dep('forn_orcamento', { numero: n, valor: 1300, prazo_entrega: '1 dia', condicao: 'à vista' });
  falha(() => casa('forn_orcamento', { numero: 'PB-9999', valor: 1, prazo_entrega: 'x' }), /não faz parte/);
  let d = com('pedido_detalhe', { numero: n });
  assert.equal(d.orcamentos.length, 2);
  assert.equal(d.orcamentos.find(o => o.fornecedor_cod === 'F001').valor, 1150);

  // compra com a Casa (faturado 28): só a Casa vê a compra; o outro vê "outra opção"
  com('pedido_definir', { numero: n, orcamento: d.orcamentos.find(o => o.fornecedor_cod === 'F001').id, condicao: 'Faturado', prazo_fat: 28 });
  assert.equal(casa('forn_dados').pedidos[0].etapa, 'analise');
  apr('pedido_aprovar', { numero: n });
  assert.equal(dep('forn_dados').pedidos[0].etapa, 'nao_escolhido');
  falha(() => dep('forn_entrega', { numero: n, previsao: '2026-12-01' }), /não está com você/);
  pd = casa('forn_dados');
  assert.equal(pd.pedidos[0].etapa, 'compra');
  assert.equal(pd.pedidos[0].compra.liberada, false);

  // liberação → fornecedor informa a data; recebe; NF chega DEPOIS da entrega e vai ao financeiro
  com('pedido_liberar', { numero: n });
  assert.match(t.G._enviados.at(-1).html, /fornecedor\.html\?t=/);
  casa('forn_entrega', { numero: n, previsao: '2026-12-01' });
  assert.equal(com('pedido_detalhe', { numero: n }).pedido.previsao.slice(0, 10), '2026-12-01');
  est('pedido_receber', { numero: n, itens: { 1: 20, 2: 2 } });
  d = com('pedido_detalhe', { numero: n });
  assert.equal(d.pedido.situacao, 'Aguardando NF');
  falha(() => casa('forn_nf', { numero: n, nf_numero: '55' }), /Anexe/);
  casa('forn_nf', { numero: n, nf_numero: '55', nf_data: '2026-12-02', arquivo: PDF });
  d = fin('pedido_detalhe', { numero: n });
  assert.equal(d.pedido.situacao, 'A pagar');
  assert.equal(d.pedido.vencimento.slice(0, 10), '2026-12-30');
  fin('pedido_pagar', { numero: n, forma: 'Boleto', comprovante: PDF });
  assert.equal(fin('pedido_detalhe', { numero: n }).pedido.status, 'Concluído');
  assert.equal(com('forn_link', { fornecedor: 'F001', numeros: [n] }).nome, 'Casa');
});

test('notificações por etapa e financeiro por obra', () => {
  const t = preparar();
  const obra = t.adm('admin_obra_criar', { nome: 'Prime Beach', sigla: 'PB', email_financeiro: 'fin.pb@size.com' }).id;
  const outra = t.adm('admin_obra_criar', { nome: 'Outra', sigla: 'OT' }).id;
  const est = criarUsuario(t, 'est', 'Estoque', obra);
  const com = criarUsuario(t, 'compras', 'Compras', obra);
  const apr = criarUsuario(t, 'gestor', 'Aprovador', obra);
  const fin = criarUsuario(t, 'fin', 'Financeiro', obra);
  const etapas = f => f('notificacoes').itens.filter(i => i.etapa !== 'meu').map(i => i.etapa + ':' + i.numero);
  com('cad_salvar', { tipo: 'fornecedores', dados: { nome: 'Casa', email: 'casa@x.com' } });
  const n = est('pedido_criar', { itens: [{ descricao: 'Cimento', qtd: 5, unidade: 'sc' }] }).numero;
  t.adm('pedido_criar', { obra: outra, itens: [{ descricao: 'Areia', qtd: 1, unidade: 'm³' }] }); // obra sem acesso: ninguém daqui vê
  assert.deepEqual(etapas(com), ['cotar:' + n]);
  assert.deepEqual(etapas(apr), []);
  assert.deepEqual(etapas(fin), []);
  assert.ok(est('notificacoes').itens.some(i => i.etapa === 'meu' && i.situacao === 'Aberto'));
  com('orcamento_salvar', { pedido: n, fornecedor_cod: 'F001', valor: 500, arquivo: PDF });
  assert.deepEqual(etapas(com), ['definir:' + n]);
  com('pedido_definir', { numero: n, orcamento: com('pedido_detalhe', { numero: n }).orcamentos[0].id, condicao: 'Faturamento direto' });
  assert.deepEqual(etapas(apr), ['aprovar:' + n]);
  const antes = t.G._enviados.length;
  apr('pedido_aprovar', { numero: n });
  assert.deepEqual(etapas(fin), ['pagar:' + n]);
  assert.equal(t.G._enviados.length, antes + 1);
  assert.match(t.G._enviados.at(-1).para, /fin\.pb@size\.com/); // e-mail do financeiro DESTA obra
  fin('pedido_pagar', { numero: n, forma: 'PIX', comprovante: PDF });
  assert.deepEqual(etapas(est), ['receber:' + n]);
  const meus = est('notificacoes').itens.filter(i => i.etapa === 'meu');
  assert.equal(meus.length, 1);
  assert.equal(meus[0].situacao, 'Entrega liberada'); // o id muda a cada etapa → aviso novo
  t.adm('admin_obra_salvar', { id: obra, nome: 'Prime Beach', email_financeiro: 'outro@size.com', ativa: true });
  assert.equal(t.adm('admin_dados').obras.find(o => o.id === obra).email_financeiro, 'outro@size.com');
});

test('cancelamento e devolução respeitam a etapa', () => {
  const t = preparar();
  const obra = t.adm('admin_obra_criar', { nome: 'Obra C', sigla: 'OC' }).id;
  const com = criarUsuario(t, 'compras', 'Compras', obra);
  com('cad_salvar', { tipo: 'fornecedores', dados: { nome: 'F' } });
  const n1 = com('pedido_criar', { itens: [{ descricao: 'Tinta', qtd: 2, unidade: 'lata' }] }).numero;
  com('orcamento_salvar', { pedido: n1, fornecedor_cod: 'F001', valor: 300, arquivo: PDF });
  const orc = com('pedido_detalhe', { numero: n1 }).orcamentos[0].id;
  const apr = criarUsuario(t, 'gestor', 'Aprovador', obra);
  com('pedido_definir', { numero: n1, orcamento: orc, condicao: 'Faturado' });
  falha(() => com('pedido_devolver', { numero: n1, motivo: 'x' }), /permissão/);
  apr('pedido_devolver', { numero: n1, motivo: 'preço alto' });
  assert.equal(com('pedido_detalhe', { numero: n1 }).pedido.situacao, 'Em cotação');
  com('pedido_definir', { numero: n1, orcamento: orc, condicao: 'Faturado' });
  apr('pedido_aprovar', { numero: n1 });
  falha(() => com('pedido_cancelar', { numero: n1, motivo: 'x' }), /só um administrador/);
  t.adm('pedido_cancelar', { obra, numero: n1, motivo: 'obra parada' });
  assert.equal(com('pedido_detalhe', { numero: n1 }).pedido.situacao, 'Cancelado');
});

test('perfis v2: instalação existente — Compras perde "aprovar" e surge o perfil Aprovador', () => {
  const t = preparar();
  const obra = t.adm('admin_obra_criar', { nome: 'Obra V', sigla: 'OV' }).id;
  // simula a instalação feita com a versão anterior
  t.G.rodar(`(function () {
    const C = central_('Config'); C.removeWhere(r => r.chave === 'PERFIS_V2');
    const P = central_('Perfis'); P.removeWhere(p => p.perfil === 'Aprovador');
    const c = P.all().find(p => p.perfil === 'Compras'); c.permissoes += ',compras_aprovar'; P.update(c);
  })()`);
  const antigos = t.adm('admin_dados'); // primeira abertura da administração já ajusta
  assert.ok(antigos.perfis.some(p => p.perfil === 'Aprovador'));
  t.G.rodar(`central_('Acessos').insert({ usuario_id: 'U999', obra_id: '${obra}', perfil: 'Compras', permissoes: 'compras_definir,compras_aprovar' })`);
  t.G.rodar(`(function () { central_('Config').removeWhere(r => r.chave === 'PERFIS_V2'); })()`);
  const d = t.adm('admin_dados');
  assert.ok(!d.perfis.find(p => p.perfil === 'Compras').permissoes.includes('compras_aprovar'));
  assert.ok(!d.acessos.find(a => a.usuario_id === 'U999').permissoes.includes('compras_aprovar'));
  assert.equal(d.perfis.filter(p => p.perfil === 'Aprovador').length, 1);
});

test('migração da planilha antiga para Prime Beach', () => {
  const t = preparar();
  const v = t.G.SpreadsheetApp.create('Pedidos Size');
  v.insertSheet('Como usar').getRange(1, 1, 2, 2).setValues([['Pedidos Size', ''], ['Pedidos', 'Preenchida pelo app']]);
  const pe = v.insertSheet('Pedidos'), fo = v.insertSheet('Fornecedores'), ma = v.insertSheet('Materiais'), li = v.insertSheet('Listas');
  v.insertSheet('Acessos').getRange(1, 1, 4, 5).setValues([['Nome (login)', 'Senha', 'Perfil', 'Ativo', 'Último acesso'], ['RENAN', 789852123, 'Compras', 'Sim', ''], ['BARBARA', '123456', 'Compras', 'Sim', ''], ['jean', '12345', 'Solicitante', 'Sim', '']]);
  v.insertSheet('Obras').getRange(1, 1, 3, 2).setValues([['Edificação / Centro de custo', 'Ativa'], ['Torre A', 'Sim'], ['INFRA', 'Sim']]);
  const cab = Array.from({ length: 25 }, (_, i) => 'c' + i);
  const linha = (num, st, extra = {}) => { const r = Array(25).fill(''); Object.assign(r, { 0: num, 2: 'Zé', 3: 'Torre A', 4: 'Fundação', 5: 'Cimento', 6: 50, 7: 'sc', 8: 'Normal', 11: st }, extra); return r; };
  pe.getRange(1, 1, 5, 25).setValues([cab,
    linha('PED-0001', 'Aberto'),
    linha('PED-0002', 'Comprado', { 12: 'Loja Y', 13: 1500, 20: 'Faturado 30 dias', 21: 'Aprovado por Ana em 01/10/2026' }),
    linha('PED-0003', 'Entregue', { 12: 'Loja Y', 13: 800, 15: t.G.rodar('new Date(2026, 8, 1)'), 20: 'Faturamento direto' }),
    linha('PED-0004', 'Cancelado')]);
  fo.getRange(1, 1, 2, 11).setValues([Array(11).fill('h'), ['F001', 'Loja Y', '', 'Ana', '519', 'y@y.com', 'POA', '', '', '', 'Sim']]);
  ma.getRange(1, 1, 2, 2).setValues([['d', 'u'], ['Cimento', 'sc']]);
  li.getRange(1, 1, 2, 1).setValues([['Unidade'], ['sc']]);
  t.G.rodar(`migrarPlanilhaAntiga_('${v.getId()}', 'Prime Beach', 'PB')`);
  t.G.rodar(`migrarPlanilhaAntiga_('${v.getId()}', 'Prime Beach', 'PB')`); // rodar 2x não duplica
  const obra = t.adm('admin_dados').obras.find(o => o.sigla === 'PB').id;
  const ps = t.adm('pedidos_listar', { obra }).pedidos;
  assert.equal(ps.length, 4);
  const s = Object.fromEntries(ps.map(p => [p.numero, p.situacao]));
  assert.deepEqual(s, { 'PED-0001': 'Aberto', 'PED-0002': 'Liberar entrega', 'PED-0003': 'Concluído', 'PED-0004': 'Cancelado' });
  const novo = t.adm('pedido_criar', { obra, itens: [{ descricao: 'Cimento', qtd: 1, unidade: 'sc' }] });
  assert.equal(novo.numero, 'PB-0001');
  const od = t.adm('obra_dados', { obra });
  assert.equal(od.fornecedores[0].email, 'y@y.com');
  assert.ok(od.frentes.some(f => f.nome === 'Torre A') && od.frentes.some(f => f.nome === 'INFRA'));
  assert.equal(ps.find(p => p.numero === 'PED-0001').frente, 'Torre A');
  assert.equal(ps.find(p => p.numero === 'PED-0001').itens[0].descricao, 'Cimento');
  // usuários antigos entram com a mesma senha (número na planilha também) e precisam trocar
  const r = t.call('login', { login: 'renan', senha: '789852123' });
  assert.equal(r.usuario.trocar_senha, true);
  assert.deepEqual(r.obras.map(o => o.nome), ['Prime Beach']);
  assert.ok(r.obras[0].permissoes.includes('compras_definir'));
  assert.ok(!r.obras[0].permissoes.includes('compras_aprovar')); // Compras não aprova (perfis v2)
  const j = t.call('login', { login: 'jean', senha: '12345' });
  assert.deepEqual(j.obras[0].permissoes, ['pedido_abrir']);
  const meus = t.call('pedidos_listar', { token: j.token, obra }).pedidos;
  assert.equal(meus.length, 0); // pedidos antigos eram de "Zé"
  assert.equal(t.adm('admin_dados').usuarios.length, 4);
});

test('captura de e-mail: resposta com PDF vira orçamento; NF encaminha ao financeiro', () => {
  const t = preparar();
  const obra = t.adm('admin_obra_criar', { nome: 'Prime Beach', sigla: 'PB' }).id;
  t.adm('cad_salvar', { obra, tipo: 'fornecedores', dados: { nome: 'Casa', email: 'vendas@casa.com' } });
  const { numero } = t.adm('pedido_criar', { obra, itens: [{ descricao: 'Cal', qtd: 3, unidade: 'sc' }] });
  const msg = (assunto, de, arq = 'proposta.pdf', conteudo = '%PDF') => ({
    getFrom: () => 'Vendas <' + de + '>', getSubject: () => assunto, getId: () => 'm' + assunto.length,
    getAttachments: () => [new t.G.Blob(Buffer.from(conteudo), 'application/pdf', arq)]
  });
  // o app antigo já tinha salvo o mesmo PDF na pasta do pedido (nome com o código da mensagem)
  t.G.rodar(`(function () {
    const o = central_('Obras').all()[0], ctx = { u: { nome: 'x' }, obra: o, ss: SpreadsheetApp.openById(o.planilha_id) };
    const p = obraTab_(ctx, 'Pedidos').all()[0];
    pastaPedido_(ctx, p).createFile(Utilities.newBlob('%PDF', 'application/pdf', 'ORC_vendas_casa.com_1a11234b_proposta.pdf'));
    salvar_(ctx, p);
  })()`);
  const antes = Object.keys(t.G._arquivos).length;
  t.G._threads.push({ getMessages: () => [msg('Re: Cotação Size · Prime Beach [' + numero + ']', 'vendas@casa.com')] });
  t.adm('capturar_emails', { obra });
  t.adm('capturar_emails', { obra }); // não duplica
  assert.equal(Object.keys(t.G._arquivos).length, antes); // nenhum arquivo novo no Drive: reaproveitou o do app antigo
  let d = t.adm('pedido_detalhe', { obra, numero });
  assert.equal(d.arquivos.length, 1);
  assert.equal(d.orcamentos.length, 1);
  assert.equal(d.orcamentos[0].fornecedor, 'Casa');
  assert.equal(d.pedido.situacao, 'Em cotação');
  t.adm('orcamento_salvar', { obra, pedido: numero, id: d.orcamentos[0].id, fornecedor_cod: 'F001', valor: '90' });
  t.adm('pedido_definir', { obra, numero, orcamento: d.orcamentos[0].id, condicao: 'Faturado', aprovar: true });
  t.G._threads.length = 0;
  t.G._threads.push({ getMessages: () => [msg('Re: Pedido Size · Prime Beach [' + numero + '] NF', 'vendas@casa.com', 'NF-1234.pdf', '%PDF nota fiscal')] });
  t.adm('capturar_emails', { obra });
  d = t.adm('pedido_detalhe', { obra, numero });
  assert.equal(d.pedido.fin, 'A pagar');
  assert.ok(d.arquivos.some(a => a.tipo === 'NF'));
});
