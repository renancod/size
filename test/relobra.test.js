// Relatório da obra: andamento (sem valores) e gerencial (interno), com curva S e estimativa de atraso.
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };

function preparar() {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const login = call('login', { login: 'admin', senha });
  const raiz = (acao, d = {}) => call(acao, { token: login.token, ...d });
  const obra = raiz('admin_obra_criar', { nome: 'Loteamento Sul', sigla: 'LS', endereco: 'Rua X', frentes: ['Rede de Esgoto', 'Rede de Água'] }).id;
  const adm = (acao, d = {}) => raiz(acao, { obra, ...d });
  const p = raiz('admin_dados').perfis.find(x => x.perfil === 'Engenheiro');
  raiz('admin_usuario_salvar', { usuario: { nome: 'eng', login: 'eng', ativo: true }, senha: 'Senha-Forte-26', acessos: [{ obra_id: obra, perfil: 'Engenheiro', permissoes: p.permissoes }] });
  const s = call('login', { login: 'eng', senha: 'Senha-Forte-26' });
  const eng = (acao, d = {}) => call(acao, { token: s.token, obra, ...d });
  // orçamento: esgoto (2.500 m de rede + 30 PV) e água (1.000 m), com preço de venda e valores por frente
  adm('orc_frente_salvar', { codigo: 'FR01', nome: 'Rede de Esgoto', preco: 300000, custo_direto: 200000, adm_local: 10000, indiretas: 10000, tributos: 20000 });
  adm('orc_frente_salvar', { codigo: 'FR02', nome: 'Rede de Água', preco: 100000, custo_direto: 70000 });
  adm('orc_itens_salvar', { frente: 'FR01', itens: [{ codigo: '1.1', servico: 'Rede coletora PVC DN 150', unidade: 'm', qtd: 2500, unit_venda: 100 }, { codigo: '1.2', servico: 'Poço de visita', unidade: 'un', qtd: 30, unit_venda: 1000 }] });
  adm('orc_itens_salvar', { frente: 'FR02', itens: [{ codigo: '2.1', servico: 'Rede de água PEAD', unidade: 'm', qtd: 1000, unit_venda: 100 }] });
  const d = adm('orc_dados');
  const it = (f, n) => d.frentes.find(x => x.codigo === f).itens[n];
  return { adm, eng, rede: it('FR01', 0), pv: it('FR01', 1), agua: it('FR02', 0) };
}
const etapa = (t, nome, orcItem, qtd, ini, fim) => t.eng('exec_etapa_salvar', { nome, local: nome, contrato_id: '-', itens: [{ orc_item: orcItem, servico: 'x', qtd_prevista: qtd, inicio: ini, termino: fim, fvs_modelo: 'FVS.03' }] });
const itemDe = (t, cod) => t.eng('exec_dados').etapas.find(e => e.codigo === cod).itens[0];

test('relatório de andamento: % igual ao painel, sem valores, curva S e prazos', () => {
  const t = preparar();
  const a = etapa(t, 'Esgoto · Rua A', t.rede.id, 250, dia(-5), dia(20));
  const b = etapa(t, 'Água · Rua B', t.agua.id, 1000, dia(-5), dia(10));
  t.eng('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: itemDe(t, a.codigo).id, qtd: 100 }, { item_id: itemDe(t, b.codigo).id, qtd: 10 }] });
  const r = t.eng('obra_relatorio', { modelo: 'andamento', de: dia(-29), ate: dia(0) });
  const painel = t.adm('orc_dados').resumo;
  assert.equal(r.geral.pct, painel.pct_exec);                          // mesmo % do painel da obra (ponderado pelo valor)
  assert.equal(r.geral.avanco, r.geral.pct);                           // tudo foi feito dentro do período
  assert.equal(r.emp, undefined); assert.equal(r.pontos, undefined);   // modelo de andamento não leva valores
  assert.ok(r.frentes.every(f => f.emp === undefined));
  assert.ok(r.curva.length > 2 && r.curva.some(c => c.previsto > 0) && r.curva.some(c => c.realizado > 0));
  const esg = r.frentes.find(f => f.nome === 'Rede de Esgoto');
  assert.equal(esg.itens[0].executado, 100); assert.equal(esg.itens[0].periodo, 100);
  // Rua A: 100 m no dia, faltam 150 → no prazo; Rua B: 10 m/dia para 990 m até dia(10) → atrasado, com o ritmo necessário
  const ea = r.etapas.find(e => e.codigo === a.codigo), eb = r.etapas.find(e => e.codigo === b.codigo);
  assert.equal(ea.situacao, 'no_prazo');
  assert.equal(eb.situacao, 'atrasado'); assert.ok(eb.atraso > 10);
  assert.equal(eb.itens[0].ritmo, 10); assert.ok(eb.itens[0].ritmo_nec > 50);
  assert.equal(r.etapas[0].codigo, b.codigo);                          // o mais grave primeiro
  assert.ok(r.geral.projecao > r.geral.termino); assert.ok(r.geral.atraso > 0);
  assert.equal(r.geral.servicos.atrasados, 1);
  assert.ok(r.semanas.length >= 1 && r.semanas.length <= 3 && r.semanas.some(s => s.avanco > 0));   // não volta antes do início da obra
  assert.equal(r.periodo.trabalhados, 1);
});

test('relatório gerencial: só quem gere o orçamento; custos, déficit e pontos para a reunião', () => {
  const t = preparar();
  const b = etapa(t, 'Água · Rua B', t.agua.id, 1000, dia(-5), dia(10));
  t.eng('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: itemDe(t, b.codigo).id, qtd: 10 }] });
  assert.throws(() => t.eng('obra_relatorio', { modelo: 'gerencial' }), /gerencial/);
  const r = t.adm('obra_relatorio', { modelo: 'gerencial' });
  assert.equal(r.emp.receita, 400000);
  assert.ok(r.frentes.find(f => f.nome === 'Rede de Água').emp.custo_direto === 70000);
  assert.ok(r.custo.length > 0);
  assert.ok(r.pontos.some(p => p.nivel === 'alto' && /Água · Rua B/.test(p.texto) && /Precisa de/.test(p.texto)));
  assert.ok(r.pontos.some(p => /Término da obra projetado/.test(p.texto)));
  assert.ok(Array.isArray(r.materiais) && Array.isArray(r.mao_obra));
});
