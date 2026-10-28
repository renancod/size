// Orçamentos de clientes (fora de obra): itens da base com custo congelado, BDI e gestão configuráveis, situação e revisões,
// gerar a obra a partir do orçamento aprovado e o painel da empresa (tela Início).
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

function preparar() {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const tk = call('login', { login: 'admin', senha }).token;
  const adm = (acao, d = {}) => call(acao, { token: tk, ...d });
  const usuario = (nome, orcamentos) => {
    adm('admin_usuario_salvar', { usuario: { nome, login: nome, ativo: true, orcamentos }, senha: 'Senha-Forte-26', acessos: [] });
    const t2 = call('login', { login: nome, senha: 'Senha-Forte-26' }).token;
    return (acao, d = {}) => call(acao, { token: t2, ...d });
  };
  // base: meio-fio (material + mão de obra) e paver
  const ins = (codigo, descricao, unidade, tipo, preco) => adm('base_insumo_salvar', { insumo: { codigo, descricao, unidade, tipo, preco } });
  ins('PAV007', 'Meio-fio de concreto', 'm', 'Material', 27);
  ins('APV', 'Argamassa pronta 20 kg', 'sc', 'Material', 23.5);
  ins('1148', 'Assentamento de meio-fio', 'm', 'Mão de obra', 16);
  ins('BL', 'Paver 8 cm', 'm²', 'Material', 57.24);
  ins('1146', 'Assentamento de paver', 'm²', 'Mão de obra', 17);
  ins('RETRO', 'Retroescavadeira', 'h', 'Equipamento', 200);
  adm('base_composicao_salvar', { composicao: { codigo: '10014', descricao: 'Guia de sarjeta', unidade: 'm', grupo: 'Pavimentação' }, itens: [{ ref: 'PAV007', coef: 1 }, { ref: 'APV', coef: 0.05 }, { ref: '1148', coef: 1 }] });
  adm('base_composicao_salvar', { composicao: { codigo: '10011', descricao: 'Pavimento intertravado 8 cm', unidade: 'm²' }, itens: [{ ref: 'BL', coef: 1.05 }, { ref: '1146', coef: 1 }, { ref: 'RETRO', coef: 0.01 }] });
  return { G, adm, usuario, call };
}
const ITENS = [
  { tipo: 'E', descricao: 'Pavimentação' },
  { comp_cod: '10014', qtd: 1000, unidade: 'm' },                  // sem custo: o servidor pega da base
  { comp_cod: '10011', qtd: '500', unidade: 'm²' },
  { tipo: 'E', descricao: 'Canteiro' },
  { descricao: 'Mobilização', unidade: 'vb', qtd: 1, unit_mat: 0, unit_mo: 10000 }   // preço direto
];
const novo = (t, extra = {}) => t.adm('prop_salvar', { proposta: { cliente: 'Construtora Mar Azul', empreendimento: 'Residencial Dunas', local: 'Xangri-lá/RS', bdi_pct: 18, bdi_base: 'servicos', gestao_pct: 6, gestao_base: 'total', ...extra }, itens: ITENS }).id;

test('orçamento: custo da base congelado, numeração automática e BDI só sobre mão de obra + gestão sobre o total', () => {
  const t = preparar();
  const id = novo(t);
  const d = t.adm('prop_detalhe', { id });
  assert.equal(d.proposta.rotulo, 'ORC-0001');
  assert.equal(d.proposta.status, 'Rascunho');
  assert.deepEqual(d.itens.map(i => i.codigo), ['1', '1.1', '1.2', '2', '2.1']);
  const g = d.itens[1], pv = d.itens[2], mob = d.itens[4];
  assert.deepEqual([g.unit_mat, g.unit_mo, g.descricao], [28.175, 16, 'Guia de sarjeta']);
  assert.equal(g.custo, 44175);
  assert.equal(g.bdi, 2880);                    // 18% de 16.000 (mão de obra)
  assert.equal(g.gestao, 2650.5);               // 6% de 44.175
  assert.equal(g.preco, 49705.5);
  assert.equal(g.preco_unit, 49.71);
  assert.equal(pv.unit_eq, 2);                  // 0,01 h × 200
  assert.equal(pv.bdi, Math.round(500 * (17 + 2) * 0.18 * 100) / 100);
  assert.equal(mob.bdi, 1800);
  const T = d.total;
  assert.equal(T.itens, 3);
  assert.equal(T.preco, Math.round((T.custo + T.bdi + T.gestao) * 100) / 100);
  assert.equal(d.etapas[0].itens, 2);
  // mudar o preço na base não muda o orçamento até "atualizar pela base"
  t.adm('base_insumo_salvar', { insumo: { original: '1148', descricao: 'Assentamento de meio-fio', unidade: 'm', tipo: 'Mão de obra', preco: 20 } });
  assert.equal(t.adm('prop_detalhe', { id }).itens[1].unit_mo, 16);
  assert.match(t.adm('prop_precos', { id }).msg, /2 itens atualizados/);
  assert.equal(t.adm('prop_detalhe', { id }).itens[1].unit_mo, 20);
  // segundo orçamento: número seguinte
  assert.equal(t.adm('prop_detalhe', { id: novo(t) }).proposta.numero, 'ORC-0002');
});

test('situação e revisões: enviado não muda; nova revisão copia e a anterior fica "Revisado"; perdido pede motivo', () => {
  const t = preparar();
  const id = novo(t);
  t.adm('prop_status', { id, op: 'enviar' });
  assert.throws(() => t.adm('prop_salvar', { proposta: { id, cliente: 'X', empreendimento: 'Y' } }), /rascunho/);
  assert.throws(() => t.adm('prop_status', { id, op: 'perder' }), /motivo/);
  const r = t.adm('prop_copiar', { id });
  const d = t.adm('prop_detalhe', { id: r.id });
  assert.equal(d.proposta.rotulo, 'ORC-0001 rev.1');
  assert.equal(d.total.preco, t.adm('prop_detalhe', { id }).total.preco);
  assert.equal(t.adm('prop_detalhe', { id }).proposta.status, 'Revisado');
  assert.deepEqual(d.revisoes.map(x => x.rotulo), ['ORC-0001', 'ORC-0001 rev.1']);
  assert.throws(() => t.adm('prop_copiar', { id }), /mais nova/);
  t.adm('prop_status', { id: r.id, op: 'perder', motivo: 'Preço acima do concorrente' });
  t.adm('prop_status', { id: r.id, op: 'reabrir' });
  assert.equal(t.adm('prop_detalhe', { id: r.id }).proposta.status, 'Rascunho');
  // cópia como orçamento novo
  const c = t.adm('prop_copiar', { id: r.id, novo: true });
  assert.equal(t.adm('prop_detalhe', { id: c.id }).proposta.rotulo, 'ORC-0002');
  t.adm('prop_excluir', { id: c.id });
  assert.equal(t.adm('prop_listar').propostas.length, 2);
  assert.throws(() => t.adm('prop_excluir', { id: r.id }), /novo em rascunho/);
});

test('acesso: "Ver" consulta; sem acesso não vê; gerar obra só administrador', () => {
  const t = preparar();
  const id = novo(t);
  const ver = t.usuario('vendedor', 'Ver'), ger = t.usuario('orcamentista', 'Gerir'), nada = t.usuario('campo', '');
  assert.equal(ver('prop_listar').propostas.length, 1);
  assert.throws(() => ver('prop_salvar', { proposta: { cliente: 'A', empreendimento: 'B' } }), /só pode consultar/);
  assert.throws(() => nada('prop_listar'), /não tem acesso/);
  ger('prop_status', { id, op: 'aprovar' });
  assert.throws(() => ger('prop_gerar_obra', { id, sigla: 'RD' }), /administradores/);
  // Início: quem não tem Orçamentos não recebe orçamentos nem base
  const e = nada('empresa_dados');
  assert.equal(e.propostas, undefined);
  assert.deepEqual(e.obras, []);
});

/* planilha de orçamento: aba do orçamento (com BDI e gestão no topo e a mobilização sem BDI) + aba Composições */
const ORC = [
  ['', '', 'PLANILHA ORÇAMENTÁRIA · MATERIAL x MÃO DE OBRA', '', '', '', '', '', '', '', '', '', '', 'BDI s/ serviços (%)', 0.18],
  ['', '', 'Residencial Dunas · Xangri-lá/RS · Orçamento nº 7', '', '', '', '', '', '', '', '', '', '', 'Gestão de obra (%)', 0.06],
  ['', '', '', '', '', '', '', '', '', '', '', '', '', 'BDI (R$)', 3000],
  [],
  ['ITEM', 'CÓD.', 'DESCRIÇÃO', 'UN', 'QUANT.', 'PREÇO UNIT. (R$)', 'MATERIAL UNIT. (R$)', 'MÃO DE OBRA UNIT. (R$)', 'PREÇO TOTAL (R$)', 'MATERIAL TOTAL (R$)', 'MÃO DE OBRA / SERVIÇO TOTAL (R$)', 'SEM DETALHE (R$)', '% MATERIAL', 'BDI S/ SERVIÇOS (R$)', 'GESTÃO DE OBRA (R$)'],
  ['1', '', 'PAVIMENTAÇÃO'],
  ['1.1', '10014', 'GUIA', 'M', 100, 44.18, 28.18, 16, 4417.5, 2817.5, 1600, 0, 0.64, 288, 265.05],
  ['2', '', 'MOBILIZAÇÃO E CANTEIRO'],
  ['2.1', '', 'MOBILIZAÇÃO', 'VB', 1, 5000, 0, 5000, 5000, 0, 5000, 0, 0, 0, 300]
];
const COMP = [
  ['ITEM', 'TIPO', 'CÓDIGO', 'DESCRIÇÃO', 'UN', 'QUANT. TOTAL', 'COEF.', 'CUSTO UNIT. (R$)'],
  ['1.1', '', '10014', 'GUIA', 'M', 100, '', 44.18],
  ['1.1', 'Material', 'PAV007', 'Meio-fio de concreto', 'M', 100, '', 27],
  ['1.1', 'Material', 'APV', 'Argamassa pronta 20 kg', 'SC', 5, '', 23.5],
  ['1.1', 'Mão de obra / serviço', '1148', 'Assentamento de meio-fio', 'M', 100, '', 16],
  ['2.1', '', '', 'MOBILIZAÇÃO', 'VB', 1, '', 5000],
  ['2.1', 'Mão de obra / serviço', 'MOB1', 'MOBILIZAÇÃO DE EQUIPE', 'VB', 1, '', 5000]
];
test('importar orçamento em planilha: etapas, quantidades, BDI e gestão do arquivo, item sem BDI e composições na base', () => {
  const t = preparar();
  const abas = [{ nome: 'Material x Mão de obra', linhas: ORC }, { nome: 'Composições', linhas: COMP }];
  const pre = t.adm('prop_importar', { abas });
  assert.deepEqual([pre.etapas, pre.itens], [2, 2]);
  assert.deepEqual(pre.sugestao, { empreendimento: 'Residencial Dunas · Xangri-lá/RS · Orçamento nº 7', bdi_pct: 18, bdi_base: 'servicos', gestao_pct: 6, gestao_base: 'total' });
  assert.deepEqual(pre.sem_bdi, ['MOBILIZAÇÃO']);
  assert.equal(t.adm('prop_listar').propostas.length, 0);           // conferir não grava
  const r = t.adm('prop_importar', { abas, aplicar: true, proposta: { cliente: 'Mar Azul', bdi_pct: 18, bdi_base: 'servicos', gestao_pct: 6, gestao_base: 'total' } });
  const d = t.adm('prop_detalhe', { id: r.id });
  assert.deepEqual(d.etapas.map(e => e.descricao), ['Pavimentação', 'Mobilização e canteiro']);
  const [g, mob] = d.itens.filter(i => i.tipo === 'I');
  assert.deepEqual([g.comp_cod, g.qtd, g.bdi, g.gestao], ['10014', 100, 288, 265.05]);
  assert.deepEqual([mob.sem_bdi, mob.bdi, mob.gestao, mob.preco], [true, 0, 300, 5300]);
  assert.ok(mob.comp_cod.startsWith('CMP-'));                        // serviço sem código ganhou composição na base
  assert.equal(d.proposta.empreendimento, 'Residencial Dunas · Xangri-lá/RS · Orçamento nº 7');
  assert.ok(t.adm('base_dados').insumos.some(i => i.codigo === 'MOB1'));
});

test('obra: localização escolhida no mapa ao criar; excluir pede a sigla, tira do sistema e guarda a pasta em "Obras excluídas"', () => {
  const t = preparar();
  const r = t.adm('admin_obra_criar', { nome: 'AVA Residence', sigla: 'AVA', endereco: 'Maquiné/RS', lat: '-29,78378', lng: -50.07392 });
  let o = t.adm('admin_dados').obras.find(x => x.id === r.id);
  assert.deepEqual([o.lat, o.lng], [-29.78378, -50.07392]);
  assert.throws(() => t.adm('admin_obra_criar', { nome: 'X', sigla: 'XX', lat: 123, lng: 0 }), /inválidas/);
  const pasta = o.pasta_id;
  assert.throws(() => t.adm('admin_obra_excluir', { id: r.id, confirmar: 'PB' }), /digite a sigla/);
  assert.match(t.adm('admin_obra_excluir', { id: r.id, confirmar: 'ava' }).msg, /Obras excluídas/);
  assert.equal(t.adm('admin_dados').obras.some(x => x.id === r.id), false);
  const P = t.G._pastas[pasta];
  assert.match(P.nome, /^AVA · AVA Residence \(excluída em /);
  assert.equal(t.G._pastas[P.pai].nome, 'Obras excluídas');
  assert.equal(t.adm('empresa_dados').obras.length, 0);
});

test('gerar obra: frentes = etapas, serviços com material, mão de obra e preço de venda, materiais das composições', () => {
  const t = preparar();
  const id = novo(t);
  assert.throws(() => t.adm('prop_gerar_obra', { id, sigla: 'RD' }), /aprovado/);
  t.adm('prop_status', { id, op: 'aprovar' });
  const r = t.adm('prop_gerar_obra', { id, sigla: 'RD' });
  assert.match(r.msg, /2 frentes gerais, 3 serviços e 3 materiais/);
  const obra = r.obra_id, o = (acao, d = {}) => t.adm(acao, { obra, ...d });
  const D = o('orc_dados');
  assert.deepEqual(D.frentes.map(f => f.nome), ['Pavimentação', 'Canteiro']);
  const pav = D.frentes[0], det = t.adm('prop_detalhe', { id });
  const g = pav.itens.find(i => i.codigo === '1.1');
  assert.deepEqual([g.servico, g.qtd, g.unit_material, g.unit_mo, g.unit_venda], ['Guia de sarjeta', 1000, 28.175, 16, 49.71]);
  assert.equal(t.G.rodar(`orcFrente_({ ss: SpreadsheetApp.openById(central_('Obras').all().find(x => x.id === '${obra}').planilha_id) }, 'Pavimentação').preco`), det.etapas[0].preco);
  const mats = pav.materiais.map(m => m.descricao).sort();
  assert.deepEqual(mats, ['Argamassa pronta 20 kg', 'Meio-fio de concreto', 'Paver 8 cm']);
  assert.equal(pav.materiais.find(m => m.descricao === 'Paver 8 cm').necessario, 525);   // 500 m² × 1,05
  assert.equal(det.obra.id, obra);
  assert.throws(() => t.adm('prop_gerar_obra', { id, sigla: 'RX' }), /já virou/);
  // Início: a obra nova aparece com o resumo
  const e = t.adm('empresa_dados');
  assert.ok(e.obras.some(x => x.id === obra && x.pedidos_andamento === 0));
  assert.equal(e.propostas.length, 1);
  assert.equal(e.base.composicoes, 2);
});
