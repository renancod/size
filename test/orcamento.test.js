// Orçamento da obra: frentes gerais, serviços com quantidade total e valores, frentes de execução consumindo o saldo,
// contrato puxando o valor de mão de obra e materiais necessário × comprado × recebido × consumido.
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const PDF = { nome: 'Doc.pdf', mime: 'application/pdf', b64: Buffer.from('%PDF-1.4 teste').toString('base64') };

function preparar() {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const login = call('login', { login: 'admin', senha });
  const raiz = (acao, d = {}) => call(acao, { token: login.token, ...d });
  const criada = raiz('admin_obra_criar', { nome: 'Loteamento Sul', sigla: 'LS', endereco: 'Rua X', frentes: ['Rede de Esgoto', 'Rede de Água', ' rede de esgoto '] });
  const obra = criada.id;
  const adm = (acao, d = {}) => raiz(acao, { obra, ...d });
  const usuario = (nome, perfil, extras = []) => {
    const p = raiz('admin_dados').perfis.find(x => x.perfil === perfil);
    raiz('admin_usuario_salvar', { usuario: { nome, login: nome, ativo: true }, senha: 'Senha-Forte-26', acessos: [{ obra_id: obra, perfil, permissoes: [...p.permissoes, ...extras] }] });
    const s = call('login', { login: nome, senha: 'Senha-Forte-26' });
    return (acao, d = {}) => call(acao, { token: s.token, obra, ...d });
  };
  return { G, raiz, adm, obra, criada, eng: usuario('eng', 'Engenheiro'), ctr: usuario('renan', 'Engenheiro', ['contrato_gerir', 'contrato_ver']) };
}
const frente = (d, nome) => d.frentes.find(f => f.nome === nome);
/* orçamento da Rede de Esgoto: 2.500 m de rede e 30 poços, com material e mão de obra */
function orcar(t) {
  const fr = t.adm('obra_dados').frentes.find(f => f.nome === 'Rede de Esgoto').codigo;
  t.adm('orc_itens_salvar', { frente: fr, itens: [
    { codigo: '1.1', servico: 'Rede coletora PVC DN 150', qtd: '2.500', unit_material: '45,00', unit_mo: '18' },
    { codigo: '1.2', servico: 'Poço de visita de esgoto', unidade: 'un', qtd: 30, unit_material: 1200, unit_mo: 650 }
  ] });
  const tubo = t.adm('cad_salvar', { tipo: 'materiais', dados: { descricao: 'Tubo PVC esgoto DN 150', unidade: 'm', categoria: 'Hidráulica' } }).item.codigo;
  const anel = t.adm('cad_salvar', { tipo: 'materiais', dados: { descricao: 'Anel de borracha DN 150', unidade: 'un' } }).item.codigo;
  const d = t.adm('orc_dados'), f = frente(d, 'Rede de Esgoto'), rede = f.itens[0], pv = f.itens[1];
  t.adm('orc_material_salvar', { orc_item: rede.id, material_cod: tubo, coef: '1,05' });   // 5% de perda
  t.adm('orc_material_salvar', { frente: fr, material_cod: anel, qtd: 420 });              // direto na frente
  return { fr, rede, pv, tubo, anel };
}
function etapa(t, nome, orcItem, qtd, extra = {}) {
  return t.eng('exec_etapa_salvar', Object.assign({ nome, local: nome, contrato_id: '-', itens: [{ orc_item: orcItem, servico: 'qualquer', qtd_prevista: qtd, inicio: dia(-5), termino: dia(20), fvs_modelo: 'FVS.03' }] }, extra));
}
/* compra aprovada, liberada e (parcialmente) recebida */
function comprar(t, frenteNome, itens, receber, frenteRec) {
  const { numero } = t.adm('pedido_criar', { frente: frenteNome, itens });
  const forn = t.adm('obra_dados').fornecedores[0] || (t.adm('cad_salvar', { tipo: 'fornecedores', dados: { nome: 'Tubos Sul', email: 'v@tubos.com' } }), t.adm('obra_dados').fornecedores[0]);
  t.adm('pedido_cotar', { numeros: [numero], fornecedores: [forn.codigo] });
  t.adm('orcamento_salvar', { pedido: numero, fornecedor_cod: forn.codigo, valor: '4.000,00', arquivo: PDF });
  const orc = t.adm('pedido_detalhe', { numero }).orcamentos[0].id;
  t.adm('pedido_definir', { numero, orcamento: orc, condicao: 'Faturado', prazo_fat: 30, aprovar: true });
  if (receber) {
    t.adm('pedido_liberar', { numero, previsao: dia(3) });
    t.adm('pedido_receber', Object.assign({ numero, itens: receber }, frenteRec ? { frente: frenteRec } : {}));
  }
  return numero;
}

test('obra nova já nasce com as frentes gerais informadas (sem repetir)', () => {
  const t = preparar();
  assert.match(t.criada.msg, /2 frentes gerais/);
  assert.deepEqual(t.adm('obra_dados').frentes.map(f => f.codigo + ' ' + f.nome), ['FR01 Rede de Esgoto', 'FR02 Rede de Água']);
  assert.ok(Array.isArray(t.raiz('admin_dados').frentes_padrao));
  // frente geral nova pelo orçamento; nome repetido não
  assert.equal(t.adm('orc_frente_salvar', { nome: 'Pavimentação' }).codigo, 'FR03');
  assert.throws(() => t.adm('orc_frente_salvar', { nome: 'rede de água' }), /Já existe/);
});

test('orçamento: quantidade e valores por frente geral, só quem gere cadastra', () => {
  const t = preparar();
  const { rede, pv } = orcar(t);
  assert.equal(rede.unidade, 'm');                                   // unidade do catálogo de serviços
  assert.equal(rede.qtd, 2500); assert.equal(rede.unit_material, 45); assert.equal(rede.unit_mo, 18);
  const f = frente(t.adm('orc_dados'), 'Rede de Esgoto');
  assert.equal(f.resumo.v_material, 2500 * 45 + 30 * 1200);
  assert.equal(f.resumo.v_mo, 2500 * 18 + 30 * 650);
  assert.equal(f.resumo.v_total, f.resumo.v_material + f.resumo.v_mo);
  assert.equal(pv.a_distribuir, 30);
  // o engenheiro vê o orçamento (perfil padrão) mas não cadastra
  assert.equal(frente(t.eng('orc_dados'), 'Rede de Esgoto').itens.length, 2);
  assert.throws(() => t.eng('orc_itens_salvar', { frente: 'FR01', itens: [{ servico: 'X', unidade: 'm', qtd: 1 }] }), /permissão/);
  // validações e edição
  assert.throws(() => t.adm('orc_itens_salvar', { frente: 'FR01', itens: [{ servico: 'Sem qtd', unidade: 'm' }] }), /quantidade total/);
  assert.throws(() => t.adm('orc_itens_salvar', { frente: 'FR01', itens: [{ codigo: '1.1', servico: 'Rede coletora PVC DN 150', qtd: 1 }] }), /já está no orçamento/);
  t.adm('orc_itens_salvar', { frente: 'FR01', itens: [{ id: rede.id, codigo: '1.1', servico: rede.servico, unidade: 'm', qtd: 2600, unit_material: 45, unit_mo: 18 }] });
  assert.equal(frente(t.adm('orc_dados'), 'Rede de Esgoto').itens[0].qtd, 2600);
});

test('frente de execução consome o saldo do orçamento; passar do total só avisa', () => {
  const t = preparar();
  const { rede } = orcar(t);
  const r = etapa(t, 'Esgoto · Rua das Flores', rede.id, 250);
  const ex = t.eng('exec_dados');
  const e = ex.etapas.find(x => x.codigo === r.codigo);
  assert.equal(e.frente, 'Rede de Esgoto');                          // frente geral vem do orçamento
  assert.equal(e.itens[0].servico, 'Rede coletora PVC DN 150');      // nome e unidade seguem o orçamento
  assert.equal(e.itens[0].orc_item, rede.id);
  const o = ex.orcamento.find(f => f.nome === 'Rede de Esgoto').itens[0];
  assert.equal(o.programado, 250); assert.equal(o.a_distribuir, 2250);
  assert.equal(o.unit_mo, undefined);                                // quem planeja a execução não recebe preços
  // execução pelos diários
  t.eng('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: e.itens[0].id, qtd: 100 }] });
  let it = frente(t.adm('orc_dados'), 'Rede de Esgoto').itens[0];
  assert.equal(it.executado, 100); assert.equal(it.pct_exec, 4); assert.equal(it.v_exec, 100 * 63);
  // outra frente estoura o total: grava, mas avisa
  const r2 = etapa(t, 'Esgoto · Rua B', rede.id, 2300);
  assert.match(r2.msg, /passou do orçamento da obra em Rede coletora PVC DN 150 \(2\.550 de 2\.500 m\)/);
  const d = t.adm('orc_dados');
  it = frente(d, 'Rede de Esgoto').itens[0];
  assert.equal(it.a_distribuir, -50); assert.equal(it.frentes_exec.length, 2);
  assert.ok(d.alertas.some(a => a.tipo === 'programado' && /50 acima/.test(a.texto)));
  // serviço em uso não sai do orçamento
  assert.throws(() => t.adm('orc_item_remover', { id: rede.id }), /frente de execução/);
});

test('materiais: necessário × comprado × recebido × consumido e o alerta de falta comprar', () => {
  const t = preparar();
  const { rede, tubo, anel } = orcar(t);
  let f = frente(t.adm('orc_dados'), 'Rede de Esgoto');
  const tb = () => f.materiais.find(m => m.material_cod === tubo), an = () => f.materiais.find(m => m.material_cod === anel);
  assert.equal(tb().necessario, 2625); assert.equal(tb().falta_comprar, 2625); assert.equal(tb().situacao, 'comprar');
  assert.equal(an().necessario, 420); assert.equal(an().consumo_teorico, null);   // direto na frente: sem consumo teórico
  assert.ok(f.alertas.some(a => a.tipo === 'comprar' && /Falta comprar 2\.625 m de Tubo PVC esgoto DN 150/.test(a.texto)));
  // pedido em cotação conta como "em compra"; aprovado como comprado; recebimento parcial como recebido
  comprar(t, 'Rede de Esgoto', [{ descricao: 'Tubo PVC esgoto DN 150', material_cod: tubo, qtd: 1000, unidade: 'm' }, { descricao: 'Anel de borracha DN 150', material_cod: anel, qtd: 420, unidade: 'un' }], { 1: 600, 2: 420 });
  t.adm('pedido_criar', { frente: 'Rede de Esgoto', itens: [{ descricao: 'Tubo PVC esgoto DN 150', material_cod: tubo, qtd: 500, unidade: 'm' }] });
  // execução e saída do estoque para a frente
  const e = etapa(t, 'Esgoto · Rua A', rede.id, 300);
  const item = t.eng('exec_dados').etapas.find(x => x.codigo === e.codigo).itens[0];
  t.eng('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: item.id, qtd: 200 }] });
  t.adm('estoque_movimentar', { tipo: 'Saída', material_cod: tubo, qtd: 190, frente: 'Rede de Esgoto' });
  f = frente(t.adm('orc_dados'), 'Rede de Esgoto');
  assert.equal(tb().comprado, 1000); assert.equal(tb().em_compra, 500); assert.equal(tb().recebido, 600);
  assert.equal(tb().consumo_teorico, 210); assert.equal(tb().consumo_real, 190);
  assert.equal(tb().falta_comprar, 1125); assert.equal(tb().situacao, 'parcial');
  assert.equal(an().situacao, 'ok'); assert.equal(an().falta_comprar, 0);
  assert.equal(f.resumo.material_comprado, 4000);
  // material comprado para a frente que não está no orçamento aparece como "fora do orçamento"
  comprar(t, 'Rede de Esgoto', [{ descricao: 'Brita 1', qtd: 5, unidade: 'm³' }], { 1: 5 });
  f = frente(t.adm('orc_dados'), 'Rede de Esgoto');
  assert.equal(f.materiais.find(m => m.descricao === 'Brita 1').situacao, 'fora');
  // composição: coeficiente obrigatório, sem duplicar
  assert.throws(() => t.adm('orc_material_salvar', { orc_item: rede.id, material_cod: tubo, coef: 0 }), /quanto de/);
  assert.throws(() => t.adm('orc_material_salvar', { orc_item: rede.id, material_cod: tubo, coef: 1 }), /já está na composição/);
});

test('recebimento vincula o material à frente; pedido sem frente passa a ter a frente do recebimento', () => {
  const t = preparar();
  const { tubo } = orcar(t);
  const numero = comprar(t, '', [{ descricao: 'Tubo PVC esgoto DN 150', material_cod: tubo, qtd: 100, unidade: 'm' }], { 1: 100 }, 'Rede de Esgoto');
  assert.equal(t.adm('pedido_detalhe', { numero }).pedido.frente, 'Rede de Esgoto');
  const m = frente(t.adm('orc_dados'), 'Rede de Esgoto').materiais.find(x => x.material_cod === tubo);
  assert.equal(m.recebido, 100); assert.equal(m.comprado, 100);
  assert.throws(() => comprar(t, '', [{ descricao: 'X', qtd: 1, unidade: 'un' }], { 1: 1 }, 'Frente que não existe'), /Frente de trabalho não encontrada/);
});

test('contrato puxa o valor de mão de obra do orçamento e a frente do contrato consome o saldo', () => {
  const t = preparar();
  const { rede } = orcar(t);
  const emp = t.eng('exec_equipe_salvar', { nome: 'Equipe VN', empresa: 'VN Ltda' }).codigo;
  const ref = t.ctr('orc_para_contrato').find(f => f.nome === 'Rede de Esgoto').itens[0];
  assert.equal(ref.unit_mo, 18); assert.equal(ref.a_contratar, 2500);
  assert.throws(() => t.eng('orc_para_contrato'), /permissão/);
  const { id } = t.ctr('contrato_salvar', { empreiteiro: emp, objeto: 'Mão de obra da rede de esgoto', vigencia_ini: dia(-1), itens: [
    { grupo: 'Esgoto', servico: ref.servico, unidade: ref.unidade, qtd: 2500, unitario: '16,50', orc_item: ref.id }
  ] });
  const { rt_id } = t.ctr('contrato_rt_salvar', { id, tipo: 'ART', descricao: 'Rede de esgoto', numero: '123' });
  t.ctr('contrato_rt_arquivo', { id, rt_id, arquivo: PDF });
  t.ctr('contrato_status', { id, op: 'ativar' });
  const det = t.ctr('contrato_detalhe', { id });
  assert.equal(det.itens[0].orc_unit_mo, 18);
  assert.deepEqual(det.orcamento, { linhas: 1, orcado: 45000, contratado: 41250, diferenca: -3750, pct: -8.33 });
  let it = frente(t.adm('orc_dados'), 'Rede de Esgoto').itens[0];
  assert.equal(it.contratado, 2500); assert.equal(it.a_contratar, 0); assert.equal(it.dif_mo, -3750);
  assert.equal(frente(t.adm('orc_dados'), 'Rede de Esgoto').resumo.mo_contratado, 41250);
  // frente aberta pelo item do contrato herda o vínculo com o orçamento
  const ci = t.eng('exec_dados').contratos.find(c => c.id === id).itens[0];
  assert.equal(ci.orc_item, rede.id);
  t.eng('exec_etapa_salvar', { nome: 'Esgoto · Rua C', empreiteiro: emp, contrato_id: id, itens: [{ contrato_item: ci.id, qtd_prevista: 400, inicio: dia(0), termino: dia(10), fvs_modelo: 'FVS.03' }] });
  it = frente(t.adm('orc_dados'), 'Rede de Esgoto').itens[0];
  assert.equal(it.programado, 400);
  // editar o contrato sem mandar o vínculo mantém o vínculo; serviço no contrato não sai do orçamento
  t.ctr('contrato_salvar', { id, empreiteiro: emp, objeto: 'Mão de obra da rede de esgoto', motivo: 'ajuste de texto', itens: [{ id: ci.id, grupo: 'Esgoto', servico: ref.servico, unidade: ref.unidade, qtd: 2500, unitario: 16.5 }] });
  assert.equal(t.ctr('contrato_detalhe', { id }).itens[0].orc_item, rede.id);
  assert.throws(() => t.adm('orc_item_remover', { id: rede.id }), /frente de execução/);
});

test('serviço só na planilha de um contrato também não sai do orçamento', () => {
  const t = preparar();
  const { pv } = orcar(t);
  const emp = t.eng('exec_equipe_salvar', { nome: 'Equipe PV' }).codigo;
  t.ctr('contrato_salvar', { empreiteiro: emp, objeto: 'Poços de visita', vigencia_ini: dia(0), itens: [{ servico: pv.servico, unidade: pv.unidade, qtd: 30, unitario: 600, orc_item: pv.id }] });
  assert.throws(() => t.adm('orc_item_remover', { id: pv.id }), /planilha de um contrato/);
  assert.throws(() => t.ctr('contrato_salvar', { empreiteiro: emp, objeto: 'x', vigencia_ini: dia(0), itens: [{ servico: 'Y', unidade: 'un', qtd: 1, unitario: 1, orc_item: 'OI-nao' }] }), /não está mais no orçamento/);
});

test('trocar o nome da frente geral acompanha pedidos, estoque e frentes de execução', () => {
  const t = preparar();
  const { rede, fr } = orcar(t);
  const e = etapa(t, 'Esgoto · Rua A', rede.id, 10);
  const { numero } = t.adm('pedido_criar', { frente: 'Rede de Esgoto', itens: [{ descricao: 'Areia', qtd: 1, unidade: 'm³' }] });
  t.adm('orc_frente_salvar', { codigo: fr, nome: 'Esgoto Sanitário' });
  assert.equal(t.adm('pedido_detalhe', { numero }).pedido.frente, 'Esgoto Sanitário');
  assert.equal(t.eng('exec_dados').etapas.find(x => x.codigo === e.codigo).frente, 'Esgoto Sanitário');
  assert.equal(frente(t.adm('orc_dados'), 'Esgoto Sanitário').itens.length, 2);
});

test('obra desativada: sem atraso, sem alerta e sem pendência de material (o histórico continua)', () => {
  const t = preparar();
  const { rede } = orcar(t);
  t.eng('exec_etapa_salvar', { nome: 'Atrasada', local: 'Rua X', contrato_id: '-', itens: [{ orc_item: rede.id, qtd_prevista: 100, inicio: dia(-30), termino: dia(-10), fvs_modelo: 'FVS.03' }] });
  assert.equal(t.adm('exec_dados').etapas[0].situacao, 'atrasado');
  assert.ok(t.adm('exec_dados').alertas.length);
  assert.ok(t.adm('orc_dados').alertas.length);
  t.raiz('admin_obra_salvar', { id: t.obra, nome: 'Loteamento Sul', ativa: false });
  const ex = t.adm('exec_dados'), o = t.adm('orc_dados');
  assert.equal(ex.etapas[0].situacao, 'desativada');
  assert.equal(ex.alertas.length, 0);
  assert.equal(o.alertas.length, 0); assert.equal(o.resumo.falta_comprar, 0);
  assert.equal(frente(o, 'Rede de Esgoto').itens[0].programado, 100);      // números continuam para consulta
  assert.throws(() => t.eng('exec_dados'), /desativada/);                   // quem não é admin nem abre a obra
});

test('importação da obra AVA Residence: frentes, serviços e materiais das planilhas, sem duplicar', () => {
  const t = preparar();
  assert.match(t.G.rodar('criarObraAvaResidence()'), /AVA Residence \(OB\d+\) criada · 70 serviços e 58 materiais/);
  const ava = t.raiz('sessao').obras.find(o => o.sigla === 'AVA');
  const d = t.raiz('orc_dados', { obra: ava.id });
  assert.deepEqual(d.frentes.map(f => f.nome), ['Terraplenagem', 'Pavimentação e vias', 'Drenagem pluvial', 'Esgoto sanitário', 'Abastecimento de água', 'Urbanização e paisagismo', 'Contenções em gabião', 'Marina externa e heliponto']);
  const dren = frente(d, 'Drenagem pluvial'), tubo = dren.itens.find(i => i.codigo === '1.3.1');
  assert.equal(tubo.qtd, 3431.4); assert.equal(tubo.unit_material, 582.96); assert.equal(tubo.unit_mo, 0);
  assert.equal(dren.itens.find(i => i.codigo === '1.3.4').unit_mo, 39.75);              // assentamento → mão de obra
  const terra = frente(d, 'Terraplenagem').itens[0];
  assert.equal(terra.unit_material, 0); assert.equal(terra.unit_venda, 2.65); assert.match(terra.obs, /^Fonte: Estimativa SIZE/);
  assert.equal(tubo.unit_venda, 582.96);
  // valores da R02: preço cobrado e custos por frente; terceiros (estacas, elétrica) fora
  const E = d.resumo.emp;
  assert.equal(Math.round(E.receita), 101012763); assert.equal(Math.round(E.custo_direto), 66272839);
  assert.equal(Math.round(frente(d, 'Contenções em gabião').resumo.emp.preco), 21902438);
  assert.equal(Math.round(E.lucro_orcado), 18086550); assert.equal(E.margem_orcada, 17.91);
  assert.equal(E.custo_fim, E.custo_direto); assert.equal(E.pct, 0);                       // nada executado nem gasto ainda
  // valor mudado à mão não é apagado ao rodar de novo
  const fr = frente(d, 'Terraplenagem').codigo;
  t.raiz('orc_frente_salvar', { obra: ava.id, codigo: fr, nome: 'Terraplenagem', preco: '30.000.000' });
  assert.equal(dren.materiais.find(m => /DN400, junta/.test(m.descricao)).necessario, r2(3431.4 * 1.15));   // tubo ligado ao serviço com a margem
  assert.ok(frente(d, 'Esgoto sanitário').materiais.some(m => /DE125/.test(m.descricao) && m.necessario === 474.95));
  assert.equal(t.raiz('obra_dados', { obra: ava.id }).materiais.filter(m => m.categoria === 'FoFo').length > 10, true);
  // de novo: nada duplica
  assert.match(t.G.rodar('criarObraAvaResidence()'), /já existia · 0 serviços e 0 materiais incluídos no orçamento · valores da R02 em 0 frentes/);
  const d2 = t.raiz('orc_dados', { obra: ava.id });
  assert.equal(d2.resumo.servicos, 70);
  assert.equal(frente(d2, 'Terraplenagem').resumo.emp.preco, 30000000);
});

test('importação AVA conserta códigos trocados por data e tira os serviços duplicados', () => {
  const t = preparar();
  t.G.rodar('criarObraAvaResidence()');
  // estado da 1ª versão em produção: código "1.1.1" virou "1.1.2001" e sem preço de venda; a 2ª rodada duplicou os serviços
  t.G.rodar(`(() => {
    const o = central_('Obras').all().find(x => x.sigla === 'AVA'), ctx = { ss: SpreadsheetApp.openById(o.planilha_id) }, T = obraTab_(ctx, 'OrcItens');
    const ori = T.all().filter(orcAtivo_);
    ori.forEach(i => { i.codigo = i.codigo + '001'; i.unit_venda = ''; i.obs = 'Proposta: R$ 1,00/un (material + MO juntos) · total R$ 10,00 · ' + i.obs; T.update(i); });
    T.insertMany(ori.slice(0, 66).map(i => Object.assign({}, i, { id: 'OI-dup' + i.id.slice(3), unit_venda: 9 })));
  })()`);
  const ava = t.raiz('sessao').obras.find(o => o.sigla === 'AVA');
  assert.equal(t.raiz('orc_dados', { obra: ava.id }).resumo.servicos, 136);
  assert.match(t.G.rodar('criarObraAvaResidence()'), /0 serviços e 0 materiais .* 66 serviços duplicados retirados e 70 códigos corrigidos/);
  const d = t.raiz('orc_dados', { obra: ava.id });
  assert.equal(d.resumo.servicos, 70);
  const dren = frente(d, 'Drenagem pluvial'), tubo = dren.itens.find(i => i.codigo === '1.3.1');
  assert.equal(tubo.unit_venda, 582.96); assert.ok(!/^Proposta/.test(tubo.obs));
  assert.equal(dren.materiais.find(m => /DN400, junta/.test(m.descricao)).necessario, r2(3431.4 * 1.15));   // composição continua ligada
  assert.match(t.G.rodar('criarObraAvaResidence()'), /0 serviços e 0 materiais incluídos no orçamento · valores da R02 em 0 frentes$/);
});

test('empreendimento: receita, avanço físico, custo real, estimativa no fim e lucro projetado', () => {
  const t = preparar();
  const { rede, pv, tubo, fr } = orcar(t);
  // preço de venda dos serviços e valores da frente (preço cobrado e custos orçados)
  t.adm('orc_itens_salvar', { frente: fr, itens: [
    { id: rede.id, codigo: '1.1', servico: rede.servico, unidade: 'm', qtd: 2500, unit_material: 45, unit_mo: 18, unit_venda: 100 },
    { id: pv.id, codigo: '1.2', servico: pv.servico, unidade: 'un', qtd: 30, unit_material: 1200, unit_mo: 650, unit_venda: 2500 }] });
  t.adm('orc_frente_salvar', { codigo: fr, nome: 'Rede de Esgoto', preco: '325.000', custo_direto: 200000, adm_local: 12000, indiretas: 18000, tributos: '21.612,50' });
  let E = frente(t.adm('orc_dados'), 'Rede de Esgoto').resumo.emp;
  assert.equal(E.lucro_orcado, 325000 - 200000 - 12000 - 18000 - 21612.5); assert.equal(E.custo_fim, 200000);
  // executa 500 m de rede: avanço pelo preço de venda = 500×100 / (2500×100 + 30×2500) = 15,38 %
  const e = etapa(t, 'Esgoto · Rua A', rede.id, 600);
  const item = t.eng('exec_dados').etapas.find(x => x.codigo === e.codigo).itens[0];
  t.eng('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: item.id, qtd: 500 }] });
  // compra de R$ 4.000 de material para a frente (pedido aprovado)
  comprar(t, 'Rede de Esgoto', [{ descricao: 'Tubo PVC esgoto DN 150', material_cod: tubo, qtd: 100, unidade: 'm' }]);
  const d = t.adm('orc_dados');
  E = frente(d, 'Rede de Esgoto').resumo.emp;
  const pct = Math.round(500 * 100 / (2500 * 100 + 30 * 2500) * 10000) / 100;
  assert.equal(frente(d, 'Rede de Esgoto').resumo.pct_exec, pct);
  assert.equal(E.receita_exec, Math.round(325000 * pct / 100 * 100) / 100);
  assert.equal(E.custo_real, 4000); assert.equal(E.custo_material, 4000); assert.equal(E.custo_mo, 0);
  // gasto (4.000) abaixo do previsto para o avanço: o executado conta pelo orçado até a medição ser lançada → estimativa = orçado
  assert.equal(E.custo_fim, 200000); assert.equal(E.desvio, 0);
  // gasto acima do previsto para o avanço: a estimativa sobe e o lucro projetado cai
  comprar(t, 'Rede de Esgoto', [{ descricao: 'Tubo PVC esgoto DN 150', material_cod: tubo, qtd: 100, unidade: 'm' }]);
  for (let k = 0; k < 8; k++) comprar(t, 'Rede de Esgoto', [{ descricao: 'Tubo PVC esgoto DN 150', material_cod: tubo, qtd: 10, unidade: 'm' }]);
  E = frente(t.adm('orc_dados'), 'Rede de Esgoto').resumo.emp;
  assert.equal(E.custo_real, 40000);
  assert.equal(E.custo_fim, Math.round((40000 + 200000 * (1 - pct / 100)) * 100) / 100);
  assert.ok(E.desvio > 0); assert.ok(E.lucro_proj < E.lucro_orcado);
  assert.equal(E.lucro_proj, Math.round((325000 - 12000 - 18000 - 21612.5 - E.custo_fim) * 100) / 100);
  // o total do empreendimento soma as frentes
  assert.equal(d.resumo.emp.receita, 325000); assert.equal(d.resumo.emp.pct, pct);
  assert.throws(() => t.adm('orc_frente_salvar', { codigo: fr, nome: 'Rede de Esgoto', preco: -1 }), /negativo/);
});
const r2 = x => Math.round(x * 100) / 100;

test('remover serviço sem uso tira as composições dele', () => {
  const t = preparar();
  const { pv, fr } = orcar(t);
  const anelPv = t.adm('cad_salvar', { tipo: 'materiais', dados: { descricao: 'Tampão FoFo', unidade: 'un' } }).item.codigo;
  t.adm('orc_material_salvar', { orc_item: pv.id, material_cod: anelPv, coef: 1 });
  assert.ok(frente(t.adm('orc_dados'), 'Rede de Esgoto').materiais.some(m => m.material_cod === anelPv && m.necessario === 30));
  t.adm('orc_item_remover', { id: pv.id });
  const f = frente(t.adm('orc_dados'), 'Rede de Esgoto');
  assert.equal(f.itens.length, 1);
  assert.ok(!f.materiais.some(m => m.material_cod === anelPv));
  assert.equal(fr, 'FR01');
});
