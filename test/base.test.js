// Orçamentos · base de preços: insumos, composições (com auxiliares e preço próprio), acesso sem obra,
// atualização de preços com histórico e importação da planilha de composições.
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
  const usuario = (nome, orcamentos) => {
    adm('admin_usuario_salvar', { usuario: { nome, login: nome, ativo: true, orcamentos }, senha: 'Senha-Forte-26', acessos: [] });
    const s = call('login', { login: nome, senha: 'Senha-Forte-26' });
    return Object.assign((acao, d = {}) => call(acao, { token: s.token, ...d }), { sessao: s });
  };
  return { G, adm, usuario };
}
const ins = (t, codigo, descricao, unidade, tipo, preco, extra = {}) => t.adm('base_insumo_salvar', { insumo: { codigo, descricao, unidade, tipo, preco, ...extra } });
/* base pequena: meio-fio (material + argamassa + mão de obra) e uma composição que usa o meio-fio como auxiliar */
function base(t) {
  ins(t, 'PAV007', 'Meio-fio de concreto 100x30x12', 'm', 'Material', '27,00');
  ins(t, 'APVT20KL', 'Argamassa pronta 20 kg', 'sc', 'Material', 23.5);
  ins(t, '1148', 'Assentamento de meio-fio', 'm', 'Mão de obra', 16);
  ins(t, 'RETRO', 'Retroescavadeira', 'h', 'Equipamento', 180);
  t.adm('base_composicao_salvar', { composicao: { codigo: '10014', descricao: 'Guia de sarjeta pré-moldada', unidade: 'm', grupo: 'Pavimentação' },
    itens: [{ ref: 'PAV007', coef: 1 }, { ref: 'APVT20KL', coef: '0,05' }, { ref: '1148', coef: 1 }] });
  t.adm('base_composicao_salvar', { composicao: { descricao: 'Meio-fio com escavação', unidade: 'm' },
    itens: [{ ref_tipo: 'C', ref: '10014', coef: 1 }, { ref: 'RETRO', coef: 0.02 }, { ref: '1148', coef: 0.5, preco: 20 }] });
}
const comp = (d, cod) => d.composicoes.find(c => c.codigo === cod);

test('custo da composição: insumos, auxiliar, preço próprio e separação material × mão de obra × equipamento', () => {
  const t = preparar();
  base(t);
  const d = t.adm('base_dados');
  const g = comp(d, '10014');
  assert.equal(g.custo.total, 44.175);              // 27 + 0,05 × 23,50 + 16
  assert.equal(g.custo.mat, 28.175);
  assert.equal(g.custo.mo, 16);
  const m = comp(d, 'CMP-0001');                     // código automático
  assert.equal(m.custo.total, 44.175 + 3.6 + 10);    // auxiliar + 0,02 h × 180 + 0,5 × 20 (preço próprio, não os 16 do cadastro)
  assert.equal(m.custo.eq, 3.6);
  assert.equal(m.custo.mo, 26);
  assert.equal(m.itens[2].preco, 20);
  assert.equal(g.usada_em, 1);
  assert.equal(d.insumos.find(i => i.codigo === '1148').usos, 2);
  assert.equal(d.nivel, 'Gerir');
  assert.match(g.custo.data, /^\d{4}-\d{2}-\d{2}$/);
});

test('composição circular, item inexistente e exclusões protegidas', () => {
  const t = preparar();
  base(t);
  assert.throws(() => t.adm('base_composicao_salvar', { composicao: { original: '10014', descricao: 'Guia', unidade: 'm' }, itens: [{ ref_tipo: 'C', ref: 'CMP-0001', coef: 1 }] }), /circular/);
  assert.throws(() => t.adm('base_composicao_salvar', { composicao: { descricao: 'X', unidade: 'm' }, itens: [{ ref: 'NAOEXISTE', coef: 1 }] }), /não encontrado/);
  assert.throws(() => t.adm('base_composicao_salvar', { composicao: { descricao: 'X', unidade: 'm' }, itens: [] }), /pelo menos um/);
  assert.throws(() => t.adm('base_composicao_salvar', { composicao: { codigo: '10014', descricao: 'X', unidade: 'm' }, itens: [{ ref: '1148', coef: 1 }] }), /Já existe/);
  assert.throws(() => t.adm('base_insumo_excluir', { codigo: '1148' }), /2 composições/);
  assert.throws(() => t.adm('base_composicao_excluir', { codigo: '10014' }), /auxiliar/);
  // a composição continua como era depois do erro de ciclo
  assert.equal(comp(t.adm('base_dados'), '10014').itens.length, 3);
  t.adm('base_composicao_excluir', { codigo: 'CMP-0001' });
  t.adm('base_composicao_excluir', { codigo: '10014' });
  const d = t.adm('base_dados');
  assert.equal(d.composicoes.length, 0);
  t.adm('base_insumo_excluir', { codigo: '1148' });
  assert.equal(t.adm('base_dados').insumos.length, 3);
});

test('duplicar composição e editar insumo guardando o histórico de preço', () => {
  const t = preparar();
  base(t);
  const r = t.adm('base_composicao_duplicar', { codigo: '10014' });
  const d = t.adm('base_dados'), c = comp(d, r.codigo);
  assert.match(c.descricao, /cópia/);
  assert.equal(c.custo.total, 44.175);
  t.adm('base_insumo_salvar', { insumo: { original: 'PAV007', descricao: 'Meio-fio de concreto 100x30x12', unidade: 'm', tipo: 'Material', preco: 30, data_preco: '2026-09-01' } });
  const h = t.adm('base_insumo_historico', { codigo: 'PAV007' }).historico;
  assert.equal(h.length, 2);
  assert.deepEqual([h[0].de, h[0].para, h[0].origem], [27, 30, 'Edição']);
  const d2 = t.adm('base_dados');
  assert.equal(comp(d2, '10014').custo.total, 47.175);
  assert.equal(d2.insumos.find(i => i.codigo === 'PAV007').data_preco, '2026-09-01');
  assert.throws(() => ins(t, 'pav007', 'Outro', 'm', 'Material', 1), /Já existe/);
  assert.throws(() => ins(t, '', 'Sem tipo', 'm', 'Coisa', 1), /tipo/);
});

test('foto do insumo: vai para a pasta da base no Drive, aberta pelo link; trocar e remover mandam a antiga para a lixeira', () => {
  const t = preparar();
  base(t);
  const PNG = { nome: 'meio-fio.png', mime: 'image/png', b64: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64').toString('base64') };
  const r = t.adm('base_insumo_foto', { codigo: 'PAV007', arquivo: PNG });
  assert.match(r.foto, /^https:\/\/drive\.google\.com\/thumbnail\?id=/);
  const id1 = decodeURIComponent(r.foto.match(/id=([^&]+)/)[1]), f1 = t.G._arquivos[id1];
  assert.equal(f1.compartilhado, 'ANYONE_WITH_LINK:VIEW');
  assert.equal(t.G._pastas[f1.pai].nome, 'Fotos dos insumos');
  assert.equal(t.G._pastas[t.G._pastas[f1.pai].pai].nome, 'Base de preços');
  assert.match(f1.nome, /^PAV007 · Meio-fio/);
  assert.equal(t.adm('base_dados').insumos.find(i => i.codigo === 'PAV007').foto, r.foto);
  const r2 = t.adm('base_insumo_foto', { codigo: 'PAV007', arquivo: { ...PNG, mime: 'image/jpeg' } });
  assert.notEqual(r2.foto, r.foto);
  assert.ok(f1.lixo);
  assert.throws(() => t.adm('base_insumo_foto', { codigo: 'PAV007', arquivo: { nome: 'x.pdf', mime: 'application/pdf', b64: PNG.b64 } }), /imagem/);
  t.adm('base_insumo_foto', { codigo: 'PAV007', remover: true });
  assert.equal(t.adm('base_dados').insumos.find(i => i.codigo === 'PAV007').foto, '');
  assert.ok(t.G._arquivos[decodeURIComponent(r2.foto.match(/id=([^&]+)/)[1])].lixo);
  assert.throws(() => t.usuario('vendo', 'Ver')('base_insumo_foto', { codigo: 'PAV007', remover: true }), /só pode consultar/);
});

test('contrato de empreiteiro escolhe serviços da base de preços (referência sem material) e guarda de qual composição veio', () => {
  const t = preparar();
  base(t);
  const obra = t.adm('admin_obra_criar', { nome: 'Loteamento Sul', sigla: 'LS', endereco: 'Rua X' }).id;
  const o = (acao, d = {}) => t.adm(acao, { obra, ...d });
  // quem gere contratos na obra enxerga a base, mesmo sem acesso ao módulo Orçamentos
  t.adm('admin_usuario_salvar', { usuario: { nome: 'ctr', login: 'ctr', ativo: true }, senha: 'Senha-Forte-26', acessos: [{ obra_id: obra, perfil: 'Personalizado', permissoes: ['contrato_gerir', 'contrato_ver'] }] });
  const tk = t.G.chamar({ acao: 'login', login: 'ctr', senha: 'Senha-Forte-26' }).dados.token;
  const ctr = (acao, d = {}) => { const r = t.G.chamar({ acao, token: tk, obra, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const L = ctr('base_para_contrato').composicoes;
  const g = L.find(c => c.codigo === '10014'), m = L.find(c => c.codigo === 'CMP-0001');
  assert.deepEqual([g.unidade, g.mo, g.sem_material, g.total], ['m', 16, 16, 44.18]);
  assert.equal(m.sem_material, 26 + 3.6);               // mão de obra + equipamento
  assert.throws(() => ctr('base_dados'), /não tem acesso/);
  const emp = o('exec_equipe_salvar', { nome: 'Equipe Meio-fio', empresa: 'Pavi Sul' }).codigo;
  const { id } = o('contrato_salvar', { empreiteiro: emp, objeto: 'Mão de obra de meio-fio', vigencia_ini: '2026-11-01', contratante_nome: 'SPE Teste',
    itens: [{ grupo: 'Pavimentação', servico: g.descricao, unidade: 'm', qtd: 500, unitario: 16, comp_cod: '10014' }, { servico: 'Limpeza final', unidade: 'vb', qtd: 1, unitario: 800 }] });
  const d = o('contrato_detalhe', { id });
  assert.deepEqual(d.itens.map(i => i.comp_cod), ['10014', '']);
});

test('reajuste e preços colados: só muda o que mudou e avisa os códigos que não existem', () => {
  const t = preparar();
  base(t);
  const r = t.adm('base_precos', { itens: [{ codigo: 'PAV007', preco: 29.7 }, { codigo: 'apvt20kl', preco: '23,50' }, { codigo: 'XYZ', preco: 1 }], origem: 'Reajuste 10%', data_preco: '2026-10-01' });
  assert.equal(r.alterados, 1);
  assert.equal(r.confirmados, 1);
  assert.deepEqual(r.falta, ['XYZ']);
  const d = t.adm('base_dados');
  assert.equal(d.insumos.find(i => i.codigo === 'PAV007').preco, 29.7);
  assert.equal(d.insumos.find(i => i.codigo === 'APVT20KL').data_preco, '2026-10-01');
  assert.equal(t.adm('base_insumo_historico', { codigo: 'PAV007' }).historico[0].origem, 'Reajuste 10%');
  assert.throws(() => t.adm('base_precos', { itens: [{ codigo: 'NADA', preco: 1 }] }), /Nenhum insumo/);
});

test('acesso: sem obra nenhuma; "Ver" consulta e não grava; sem acesso não entra', () => {
  const t = preparar();
  base(t);
  const ver = t.usuario('orcamentista', 'Ver'), nada = t.usuario('campo', ''), ger = t.usuario('orcgestor', 'Gerir');
  assert.equal(ver.sessao.usuario.orcamentos, 'Ver');
  assert.equal(ver('base_dados').composicoes.length, 2);
  assert.throws(() => ver('base_insumo_salvar', { insumo: { descricao: 'X', unidade: 'm', tipo: 'Material', preco: 1 } }), /só pode consultar/);
  assert.throws(() => nada('base_dados'), /não tem acesso/);
  assert.equal(nada.sessao.usuario.orcamentos, '');
  assert.match(ger('base_insumo_salvar', { insumo: { descricao: 'Brita 1', unidade: 'm³', tipo: 'material', preco: '110,00' } }).msg, /INS-0001/);
});

/* planilha "Composições" da planilha de orçamento (linha de cabeçalho da composição sem Tipo; itens com a quantidade total) */
const CAB = ['ITEM', 'TIPO', 'CÓDIGO', 'DESCRIÇÃO', 'UN', 'QUANT. TOTAL', 'COEF. / UN ITEM', 'CUSTO UNIT. (R$)', 'CUSTO TOTAL (R$)'];
const MO = 'Mão de obra / serviço';
const COMPOSICOES = [
  ['AVA · COMPOSIÇÕES DO ORÇAMENTO'], [], CAB,
  ['2.2', '', '10014', 'GUIA DE SARJETA – SISTEMA VIÁRIO', 'M', 14800, '', 46.67, 690716],
  ['2.2', 'Material', 'PAV007', 'MEIO-FIO DE CONCRETO 100X30X12X10', 'M', 14800, '', 27, ''],
  ['2.2', 'Material', 'APVT20KL', 'ARGAMASSA PRONTA 20KG', 'SC', 740, '', 23.5, ''],
  ['2.2', MO, '1148', 'ASSENTAMENTO DE GUIA SARJETA', 'M', 14800, '', 16, ''],
  ['2.2', MO, '1066', 'REJUNTAMENTO DE MEIO-FIO', 'M', 14800, '', 2.5, ''],
  ['2.6', '', '10014', 'GUIA DE SARJETA (CALÇADA)', 'M', 7400, '', 46.67, 345358],            // mesmos itens: repetida
  ['2.6', 'Material', 'PAV007', 'MEIO-FIO DE CONCRETO 100X30X12X10', 'M', 7400, '', 27, ''],
  ['2.6', 'Material', 'APVT20KL', 'ARGAMASSA PRONTA 20KG', 'SC', 370, '', 23.5, ''],
  ['2.6', MO, '1148', 'ASSENTAMENTO DE GUIA SARJETA', 'M', 7400, '', 16, ''],
  ['2.6', MO, '1066', 'REJUNTAMENTO DE MEIO-FIO', 'M', 7400, '', 2.5, ''],
  ['6.1', '', '10075', 'LINHA DE RECALQUE PEAD DE75', 'VB', 1, '', 1500, 1500],
  ['6.1', 'Material', '008', 'LUVA DE CORRER PVC DN 150', 'UN', 10, '', 38.28, ''],
  ['6.1', MO, 'ASSTBE75', 'ASSENTAMENTO DE REDE PEAD', 'M', 40, '', 25.6, ''],
  ['6.2', '', '10075', 'LINHA DE RECALQUE PEAD DE90', 'VB', 1, '', 2000, 2000],              // mesmo código, itens diferentes: variante
  ['6.2', 'Material', '008', 'LUVA DE CORRER PVC DN 150', 'UN', 10, '', 38.28, ''],
  ['6.2', MO, 'ASSTBE75', 'ASSENTAMENTO DE REDE PEAD', 'M', 50, '', 32, ''],                // preço diferente do 1º: preço próprio
  ['5.1', '', '', 'ESTAÇÃO ELEVATÓRIA COMPACTA EM PRFV', 'VB', 3, '', 74564, 223692],
  ['5.1', 'Material', '', 'ESTAÇÃO ELEVATÓRIA COMPACTA EM PRFV', 'VB', 3, '', 74564, ''],     // sem código: gera INS-…
  ['9.1', '', 'EXMUR', 'MURO EM GRADIL', 'M2', 100, '', 560, 56000]                            // sem itens: vira insumo Serviço
];
const ORCAMENTO = [
  ['PLANILHA ORÇAMENTÁRIA'], [], [], [], [],
  ['ITEM', 'CÓD.', 'DESCRIÇÃO', 'UN', 'QUANT.', 'PREÇO UNIT. (R$)'],
  ['2', '', 'PAVIMENTAÇÃO'], ['5', '', 'REDE CLOACAL (ESTAÇÕES DE BOMBEAMENTO INTERNA)'], ['6', '', 'REDE CLOACAL (RECALQUE)'], ['9', '', 'EXECUÇÃO DE MURO']
];
const ABAS = [{ nome: 'Material x Mão de obra', linhas: ORCAMENTO }, { nome: 'Composições', linhas: COMPOSICOES }];

test('importação de planilha: conferência antes de gravar (repetidas, variantes, preço próprio, código gerado, etapas)', () => {
  const t = preparar();
  const p = t.adm('base_importar', { abas: ABAS });
  const R = p.resumo;
  assert.equal(R.aba, 'Composições');
  assert.equal(R.comp_novas, 5);                     // 10014, 10075, 10075-2, CMP-0001, EXMUR
  assert.equal(R.comp_repetidas, 1);
  assert.equal(R.insumos_novos, 8);
  assert.equal(R.precos_proprios, 1);
  assert.deepEqual(p.composicoes.map(c => c.codigo), ['10014', '10075', '10075-2', 'CMP-0001', 'EXMUR']);
  const g = p.composicoes[0];
  assert.equal(g.grupo, 'Pavimentação');
  assert.equal(g.unit_calc, 46.675);
  assert.ok(!g.aviso);                                // 46,67 × 46,675: dentro da tolerância
  assert.deepEqual(g.repetidas, ['2.6']);
  assert.ok(p.composicoes[2].variante);
  assert.equal(p.composicoes[2].unit_calc, 10 * 38.28 + 50 * 32);
  assert.ok(p.composicoes[2].aviso);                  // planilha 2.000 × calculado 1.982,80
  assert.ok(p.avisos.some(a => /10075-2/.test(a)));
  assert.ok(p.insumos.some(i => i.codigo === 'INS-0001' && i.gerado));
  assert.ok(p.insumos.some(i => i.codigo === 'EXMUR' && i.tipo === 'Serviço' && i.preco === 560));
  assert.equal(p.insumos.find(i => i.codigo === '1148').tipo, 'Mão de obra');
  // nada foi gravado ainda
  assert.equal(t.adm('base_dados').insumos.length, 0);
});

test('importação de planilha: grava, reproduz os custos e importar de novo não duplica', () => {
  const t = preparar();
  const r = t.adm('base_importar', { abas: ABAS, aplicar: true, data_preco: '2026-03-15', fonte: 'Planilha · ORC14' });
  assert.match(r.msg, /8 insumos novos/);
  let d = t.adm('base_dados');
  assert.equal(d.insumos.length, 8);
  assert.equal(d.composicoes.length, 5);
  assert.equal(comp(d, '10014').custo.total, 46.675);
  assert.equal(comp(d, '10014').custo.mo, 18.5);
  assert.equal(comp(d, '10075-2').custo.total, 1982.8);  // preço próprio da mão de obra (32,00) mantido
  assert.equal(comp(d, '10075').custo.total, 1406.8);
  assert.equal(comp(d, 'CMP-0001').custo.total, 74564);
  assert.equal(comp(d, 'EXMUR').custo.total, 560);
  assert.equal(comp(d, '10014').fonte, 'Planilha · ORC14');
  assert.equal(d.insumos.find(i => i.codigo === '008').descricao, 'LUVA DE CORRER PVC DN 150');
  assert.equal(d.insumos.find(i => i.codigo === 'PAV007').data_preco, '2026-03-15');
  // código com zero à esquerda vai como texto para o Planilhas não trocar "008" por 8
  assert.ok(t.G.rodar("TEXTO_FORCADO_.test('008') && TEXTO_FORCADO_.test('000082') && !TEXTO_FORCADO_.test('1148')"));
  // de novo, com um preço mudado: atualiza, não duplica
  const outra = COMPOSICOES.map(l => (l[2] === 'PAV007' ? l.map((x, i) => (i === 7 ? 30 : x)) : l));
  const p2 = t.adm('base_importar', { abas: [{ nome: 'Composições', linhas: outra }] });
  assert.equal(p2.resumo.insumos_novos, 0);
  assert.equal(p2.resumo.insumos_atualizar, 1);
  assert.equal(p2.resumo.comp_novas, 0);
  assert.equal(p2.resumo.comp_atualizar, 5);
  t.adm('base_importar', { abas: [{ nome: 'Composições', linhas: outra }], aplicar: true });
  d = t.adm('base_dados');
  assert.equal(d.insumos.length, 8);
  assert.equal(d.composicoes.length, 5);
  assert.equal(comp(d, '10014').custo.total, 49.675);
  assert.equal(comp(d, '10014').grupo, 'Pavimentação');    // sem a aba do orçamento, mantém a etapa
  assert.equal(t.adm('base_insumo_historico', { codigo: 'PAV007' }).historico[0].de, 27);
  // sem atualizar: mantém o preço da base
  const p3 = t.adm('base_importar', { abas: ABAS, atualizar: false });
  assert.equal(p3.resumo.insumos_manter, 1);
  assert.equal(p3.resumo.comp_manter, 5);
});

test('importação: planilha sem as colunas certas explica o que falta', () => {
  const t = preparar();
  assert.throws(() => t.adm('base_importar', { abas: [{ nome: 'X', linhas: [['A', 'B'], [1, 2]] }] }), /colunas Tipo, Código/);
  assert.throws(() => t.usuario('fulano', 'Ver')('base_importar', { abas: ABAS }), /só pode consultar/);
});
