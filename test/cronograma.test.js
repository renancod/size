// Cronograma físico-financeiro: datas por etapa no orçamento (distribuição por mês, curva S), levado para a obra no "Gerar obra";
// na obra: previsto × executado (RDO) × medido (só com FVS aprovada) por frente geral.
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const PDF = { nome: 'Medicao.pdf', b64: Buffer.from('%PDF-1.4 teste').toString('base64') };
const IMG = n => ({ nome: n, mime: 'image/png', b64: Buffer.from('png-' + n).toString('base64') });

function preparar() {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const tk = call('login', { login: 'admin', senha }).token;
  const adm = (acao, d = {}) => call(acao, { token: tk, ...d });
  return { G, adm, call };
}

test('orçamento: datas por etapa, valor distribuído por dias corridos em cada mês, revisão leva junto e "Gerar obra" passa para as frentes', () => {
  const t = preparar();
  const id = t.adm('prop_salvar', { proposta: { cliente: 'Mar Azul', empreendimento: 'Dunas', bdi_pct: 0, gestao_pct: 0 }, itens: [
    { tipo: 'E', descricao: 'Terraplenagem' }, { descricao: 'Corte', unidade: 'm³', qtd: 1, unit_mo: 61000 },
    { tipo: 'E', descricao: 'Drenagem' }, { descricao: 'Rede', unidade: 'm', qtd: 1, unit_mo: 30000 }
  ] }).id;
  let C = t.adm('prop_detalhe', { id }).cronograma;
  assert.equal(C.meses.length, 0);
  assert.equal(C.sem_datas, 91000);
  assert.throws(() => t.adm('prop_cronograma', { id, etapas: [{ codigo: '1', ini: '2027-01-10', fim: '2027-01-01' }] }), /antes da de início/);
  assert.throws(() => t.adm('prop_cronograma', { id, etapas: [{ codigo: '1', ini: '2027-01-10' }] }), /data de início e a de fim/);
  // terraplenagem: 61 dias (1/jan a 2/mar/2027) → jan 31, fev 28, mar 2 dias; drenagem: só fevereiro
  const r = t.adm('prop_cronograma', { id, etapas: [{ codigo: '1', ini: '2027-01-01', fim: '2027-03-02' }, { codigo: '2', ini: '2027-02-01', fim: '2027-02-28' }] });
  assert.match(r.msg, /01\/01\/2027 a 02\/03\/2027 \(3 meses\)/);
  C = t.adm('prop_detalhe', { id }).cronograma;
  assert.deepEqual(C.meses.map(m => [m.mes, m.valor, m.pct_acum]), [['2027-01', 31000, 34.07], ['2027-02', 58000, 97.8], ['2027-03', 2000, 100]]);
  assert.deepEqual(C.linhas[0].meses, { '2027-01': 31000, '2027-02': 28000, '2027-03': 2000 });
  assert.equal(C.linhas[0].dias, 61);
  // a etapa muda de lugar: as datas acompanham pelo nome
  t.adm('prop_salvar', { proposta: { id, cliente: 'Mar Azul', empreendimento: 'Dunas' }, itens: [
    { tipo: 'E', descricao: 'Drenagem' }, { descricao: 'Rede', unidade: 'm', qtd: 1, unit_mo: 30000 },
    { tipo: 'E', descricao: 'Terraplenagem' }, { descricao: 'Corte', unidade: 'm³', qtd: 1, unit_mo: 61000 }
  ] });
  C = t.adm('prop_detalhe', { id }).cronograma;
  assert.deepEqual(C.linhas.map(l => [l.descricao, l.ini]), [['Drenagem', '2027-02-01'], ['Terraplenagem', '2027-01-01']]);
  // aprovado e virou obra: frentes com as datas; o cronograma do orçamento não muda mais
  t.adm('prop_status', { id, op: 'aprovar' });
  const obra = t.adm('prop_gerar_obra', { id, sigla: 'DU' }).obra_id;
  assert.throws(() => t.adm('prop_cronograma', { id, etapas: [] }), /dentro da obra/);
  const O = t.adm('crono_obra', { obra });
  assert.deepEqual(O.frentes.map(f => [f.nome, f.valor, f.ini, f.fim]), [['Drenagem', 30000, '2027-02-01', '2027-02-28'], ['Terraplenagem', 61000, '2027-01-01', '2027-03-02']]);
  assert.equal(O.geral.valor, 91000);
  assert.equal(O.meses.find(m => m.mes === '2027-02').prev, 58000);
});

test('obra: previsto até hoje × executado pelo RDO × medido com FVS aprovada; a diferença espera FVS/medição', () => {
  const t = preparar();
  const obra = t.adm('admin_obra_criar', { nome: 'Loteamento Sul', sigla: 'LS', endereco: 'Rua X' }).id;
  const o = (acao, d = {}) => t.adm(acao, { obra, ...d });
  const fr = o('orc_frente_salvar', { nome: 'Drenagem', preco: 100000 }).codigo;
  o('orc_itens_salvar', { frente: fr, itens: [
    { codigo: '1.1', servico: 'Boca de lobo', unidade: 'un', qtd: 10, unit_material: 500, unit_mo: 300, unit_venda: 2000 },
    { codigo: '1.2', servico: 'Tubulação DN 600', unidade: 'm', qtd: 200, unit_material: 200, unit_mo: 80, unit_venda: 400 }
  ] });
  const orc = o('orc_dados').frentes.find(x => x.codigo === fr).itens;
  const emp = o('exec_equipe_salvar', { nome: 'Equipe Alas', pessoas: 5, empresa: 'Alas Ltda' }).codigo;
  o('exec_etapa_salvar', { nome: 'Pluvial · Rua A', local: 'Rua A', empreiteiro: emp, contrato_tipo: 'Com contrato', contrato_numero: '015/2026', contrato_data: dia(-40), itens: [
    { orc_item: orc[0].id, servico: 'Boca de lobo', qtd_prevista: 10, inicio: dia(-20), termino: dia(10), fvs_modelo: 'FVS.03' },
    { orc_item: orc[1].id, servico: 'Tubulação DN 600', qtd_prevista: 200, inicio: dia(-25), termino: dia(15), fvs_modelo: 'FVS.03' }
  ] });
  const [boca, tub] = o('exec_dados').etapas[0].itens;
  // sem datas na frente: sugere o período das frentes de execução
  let C = o('crono_obra');
  assert.equal(C.frentes[0].situacao, 'sem_datas');
  assert.deepEqual(C.frentes[0].sugestao, { ini: dia(-25), fim: dia(15) });
  assert.equal(C.pode_editar, true);
  o('exec_diario_salvar', { data: dia(-4), motivo: 'teste', lancamentos: [{ item_id: boca.id, qtd: 10 }, { item_id: tub.id, qtd: 50 }] });
  const fvs = o('fvs_listar').fvs.find(f => f.item_id === boca.id).id, chk = {};
  o('fvs_detalhe', { id: fvs }).blocos.forEach((b, bi) => b.itens.forEach((x, ii) => { chk[bi + '.' + ii] = { r: 'O' }; }));
  o('fvs_salvar', { id: fvs, checklist: chk, alteracao_sim: 'Não' });
  o('fvs_anexo', { id: fvs, tipo: 'base', arquivo: IMG('b') }); o('fvs_anexo', { id: fvs, tipo: 'exec', arquivo: IMG('e') });
  o('fvs_enviar', { id: fvs }); o('fvs_aprovar', { id: fvs, pdf: PDF });
  const med = o('medicao_criar', { empreiteiro: emp, de: dia(-6), ate: dia(0) }).id;
  o('medicao_enviar', { id: med }); o('medicao_aprovar', { id: med, pdf: PDF });
  assert.throws(() => o('crono_salvar', { frentes: [{ codigo: fr, ini: dia(5), fim: dia(1) }] }), /antes da de início/);
  o('crono_salvar', { frentes: [{ codigo: fr, ini: dia(-30), fim: dia(29) }] });   // 60 dias; hoje é o 31º
  C = o('crono_obra');
  const f = C.frentes[0];
  // boca de lobo vale 20% da frente (preço de venda 20.000 de 100.000) e tubulação 80%
  assert.equal(f.v_exec, 40000);                 // 20.000 (boca toda) + 80.000 × 50/200
  assert.equal(f.v_med, 20000);                  // só a boca de lobo (concluída, FVS aprovada, medida)
  assert.equal(f.aguardando, 20000);
  assert.equal(f.v_prev, Math.round(100000 * 31 / 60 * 100) / 100);
  assert.equal(f.situacao, 'atrasada');          // 40% feito para 51,7% previsto
  assert.deepEqual([C.geral.pct_exec, C.geral.pct_med], [40, 20]);
  const mesHoje = C.meses.find(m => m.mes === dia(0).slice(0, 7)), mesFeito = C.meses.find(m => m.mes === dia(-4).slice(0, 7));
  assert.equal(mesHoje.exec_acum, 40000);
  assert.equal(mesFeito.exec >= 0, true);
  assert.equal(C.meses[C.meses.length - 1].prev_acum, 100000);
  assert.equal(C.meses[C.meses.length - 1].futuro, dia(29).slice(0, 7) > dia(0).slice(0, 7));
  // quem só vê o orçamento consulta, mas não altera
  const perf = t.adm('admin_dados').perfis.find(p => p.perfil === 'Engenheiro');
  t.adm('admin_usuario_salvar', { usuario: { nome: 'eng', login: 'eng', ativo: true }, senha: 'Senha-Forte-26', acessos: [{ obra_id: obra, perfil: 'Engenheiro', permissoes: perf.permissoes }] });
  const tk = t.call('login', { login: 'eng', senha: 'Senha-Forte-26' }).token;
  assert.equal(t.call('crono_obra', { token: tk, obra }).pode_editar, false);
  assert.throws(() => t.call('crono_salvar', { token: tk, obra, frentes: [] }), /permissão/);
});
