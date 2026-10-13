// Contratos de empreiteiros: cadastro com planilha, ativação, frente de trabalho ligada ao contrato e contratado × executado × medido × pago.
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const PDF = { nome: 'Contrato.pdf', mime: 'application/pdf', b64: Buffer.from('%PDF-1.4 teste').toString('base64') };
const IMG = n => ({ nome: n, mime: 'image/png', b64: Buffer.from('png-' + n).toString('base64') });

function preparar() {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const login = call('login', { login: 'admin', senha });
  const adm = (acao, d = {}) => call(acao, { token: login.token, ...d });
  const obra = adm('admin_obra_criar', { nome: 'Loteamento Sul', sigla: 'LS', endereco: 'Rua X' }).id;
  const usuario = (nome, perfil, extras = []) => {
    const p = adm('admin_dados').perfis.find(x => x.perfil === perfil);
    adm('admin_usuario_salvar', { usuario: { nome, login: nome, ativo: true }, senha: 'Senha-Forte-26', acessos: [{ obra_id: obra, perfil, permissoes: [...p.permissoes, ...extras] }] });
    const s = call('login', { login: nome, senha: 'Senha-Forte-26' });
    return (acao, d = {}) => call(acao, { token: s.token, obra, ...d });
  };
  return {
    G, adm, obra, call,
    eng: usuario('eng', 'Engenheiro'),
    ctr: usuario('renan', 'Engenheiro', ['contrato_gerir', 'contrato_ver', 'medicao_lancar', 'medicao_ver']),
    ver: usuario('maria', 'Engenheiro', ['contrato_ver']),
    apr: usuario('fabiano', 'Engenheiro', ['medicao_aprovar', 'medicao_ver'])
  };
}
const ITENS = [
  { grupo: '1.1 Rede de Água', codigo: '1.1.1', servico: 'Assentamento de tubo PEAD DN 63', unidade: 'M/L', qtd: '100', unitario: '49,60' },
  { grupo: '1.1 Rede de Água', codigo: '1.1.2', servico: 'Instalação de registros com caixa', unidade: 'UN', qtd: 10, unitario: 322 },
  { grupo: '1.1 Rede de Água', codigo: '1.1.3', servico: 'Hidrante', unidade: 'UN', qtd: 2, unitario: 3093.4 }
];
function contratoVigente(t, extra = {}) {
  const emp = t.eng('exec_equipe_salvar', { nome: 'Equipe VN', pessoas: 6, empresa: 'VN Instalações Hidráulicas Ltda', responsavel: 'Nazareno', documento: '51.880.059/0001-52' }).codigo;
  const { id } = t.ctr('contrato_salvar', Object.assign({
    empreiteiro: emp, numero: '015/2026', objeto: 'Mão de obra para rede de água', vigencia_ini: dia(-20), vigencia_fim: dia(300), data_assinatura: dia(-21),
    pag_forma: 'Por medição', pag_periodicidade: 'Semanal', contratante_nome: 'SPE Prime Beach', itens: ITENS
  }, extra));
  t.ctr('contrato_status', { id, op: 'ativar' });
  return { emp, id };
}
function aprovarFvs(t, itemId) {
  const id = t.eng('fvs_listar').fvs.find(f => f.item_id === itemId).id;
  const d = t.eng('fvs_detalhe', { id }), chk = {};
  d.blocos.forEach((b, bi) => b.itens.forEach((x, ii) => { chk[bi + '.' + ii] = { r: 'O' }; }));
  t.eng('fvs_salvar', { id, checklist: chk, alteracao_sim: 'Não' });
  t.eng('fvs_anexo', { id, tipo: 'base', arquivo: IMG('b') }); t.eng('fvs_anexo', { id, tipo: 'exec', arquivo: IMG('e') });
  t.eng('fvs_enviar', { id });
  return t.apr('fvs_aprovar', { id, pdf: { nome: 'FVS.pdf', b64: PDF.b64 } });
}

test('cadastro do contrato: rascunho, totais da planilha e ativação com as regras', () => {
  const t = preparar();
  assert.throws(() => t.eng('contratos'), /permissão/);                       // sem permissão de contratos não vê
  const emp = t.eng('exec_equipe_salvar', { nome: 'Equipe VN', empresa: 'VN Ltda' }).codigo;
  assert.throws(() => t.ctr('contrato_salvar', { empreiteiro: emp, objeto: '', itens: ITENS }), /objeto/);
  assert.throws(() => t.ctr('contrato_salvar', { empreiteiro: 'EQ99', objeto: 'x', itens: ITENS }), /Empreiteiro não encontrado/);
  assert.throws(() => t.ctr('contrato_salvar', { empreiteiro: emp, objeto: 'x', itens: [{ servico: 'A', unidade: 'UN', qtd: 0, unitario: 1 }] }), /quantidade/);
  assert.throws(() => t.ctr('contrato_salvar', { empreiteiro: emp, objeto: 'x', vigencia_ini: dia(5), vigencia_fim: dia(1), itens: ITENS }), /vigência/);
  assert.throws(() => t.ctr('contrato_salvar', { empreiteiro: emp, objeto: 'x', fat_nf_pct: 70, fat_recibo_pct: 50, itens: ITENS }), /100%/);

  const { id } = t.ctr('contrato_salvar', { empreiteiro: emp, objeto: 'Rede de água', numero: '015/2026', valor_global: '590738,48', itens: ITENS });
  assert.equal(id, 'CT-001');
  const d = t.ctr('contrato_detalhe', { id });
  assert.equal(d.status, 'Rascunho');
  assert.equal(d.itens.length, 3);
  assert.equal(d.itens[0].total, 4960);                                       // 100 × 49,60 (preço digitado com vírgula)
  assert.equal(d.resumo.soma_itens, 4960 + 3220 + 6186.8);
  assert.equal(d.resumo.contratado, 590738.48);                               // preço global do contrato manda
  assert.equal(d.resumo.diferenca, r2(590738.48 - d.resumo.soma_itens));
  assert.throws(() => t.ctr('contrato_status', { id, op: 'ativar' }), /início da vigência/);
  t.ctr('contrato_salvar', { id, empreiteiro: emp, objeto: 'Rede de água', vigencia_ini: dia(-1) });
  assert.equal(t.ver('contratos').pode_gerir, false);                          // só consulta
  assert.throws(() => t.ver('contrato_salvar', { id, empreiteiro: emp, objeto: 'x' }), /permissão/);
  assert.equal(t.ctr('contrato_detalhe', { id }).itens.length, 3, 'salvar sem a planilha não mexe nos itens');
  t.ctr('contrato_status', { id, op: 'ativar' });
  assert.equal(t.ctr('contrato_detalhe', { id }).status, 'Vigente');
  // vigente: alteração só com motivo (fica no histórico)
  assert.throws(() => t.ctr('contrato_salvar', { id, empreiteiro: emp, objeto: 'Rede de água e hidrantes' }), /motivo/);
  t.ctr('contrato_salvar', { id, empreiteiro: emp, objeto: 'Rede de água e hidrantes', motivo: 'ajuste do objeto' });
  assert.ok(t.ctr('contrato_detalhe', { id }).historico.some(h => /ajuste do objeto/.test(h.nota)));
  // aditivo soma ao valor e estende a vigência
  assert.throws(() => t.ctr('contrato_aditivo', { id, tipo: 'Prazo', descricao: 'x' }), /Descreva/);
  t.ctr('contrato_aditivo', { id, tipo: 'Acréscimo de serviços', descricao: 'Mais 20 registros', valor: 6440, nova_vigencia: dia(400) });
  const d2 = t.ctr('contrato_detalhe', { id });
  assert.equal(d2.resumo.contratado, 590738.48 + 6440);
  assert.equal(d2.vigencia_fim, dia(400));
  assert.equal(d2.aditivos[0].numero, 1);
  // contrato assinado vai para o Drive
  assert.equal(t.ctr('contrato_anexo', { id, arquivo: PDF }).pdf_nome, 'Contrato.pdf');
  assert.equal(t.ver('contrato_anexo_ver', { id }).mime, 'application/pdf');
  // a minuta gerada no app fica guardada no Drive (pasta Contratos), só para quem gere contratos
  assert.throws(() => t.ver('contrato_minuta', { id, pdf: PDF }), /permissão/);
  assert.throws(() => t.ctr('contrato_minuta', { id }), /vazio/);
  assert.match(t.ctr('contrato_minuta', { id, pdf: PDF }).msg, /Drive/);
  const dm = t.ctr('contrato_detalhe', { id });
  assert.ok(dm.minuta_em); assert.ok(dm.pasta_url); assert.ok(dm.historico.some(h => h.acao === 'Minuta salva no Drive' && /^MINUTA_/.test(h.nota)));
  t.ctr('contrato_status', { id, op: 'rescindir', motivo: 'obra encerrada pelo contratante' });
  assert.throws(() => t.ctr('contrato_salvar', { id, empreiteiro: emp, objeto: 'x' }), /não pode ser editado/);
  t.ctr('contrato_status', { id, op: 'reabrir', motivo: 'foi engano' });
  assert.equal(t.ctr('contrato_detalhe', { id }).status, 'Vigente');
});
const r2 = n => Math.round(n * 100) / 100;

test('frente de trabalho ligada ao contrato: serviços nascem da planilha, empreiteiro e contrato conferem', () => {
  const t = preparar();
  const { emp, id } = contratoVigente(t);
  const outro = t.eng('exec_equipe_salvar', { nome: 'Equipe B', empresa: 'B Ltda' }).codigo;
  const dados = t.eng('exec_dados');                                            // quem planeja vê os contratos (sem preços) para escolher
  const ct = dados.contratos.find(c => c.id === id);
  assert.equal(ct.itens.length, 3); assert.equal(ct.itens[0].a_programar, 100); assert.equal(ct.itens[0].unitario, undefined);
  const [i1, i2] = ct.itens;
  // contrato de outro empreiteiro / inexistente / item que não é do contrato
  assert.throws(() => t.eng('exec_etapa_salvar', { nome: 'X', empreiteiro: outro, contrato_id: id, itens: [{ contrato_item: i1.id, qtd_prevista: 10, inicio: dia(0), termino: dia(5), fvs_modelo: 'FVS.03' }] }), /outro empreiteiro/);
  assert.throws(() => t.eng('exec_etapa_salvar', { nome: 'X', empreiteiro: emp, contrato_id: id, itens: [{ contrato_item: 'CI-nao', qtd_prevista: 10, inicio: dia(0), termino: dia(5), fvs_modelo: 'FVS.03' }] }), /não pertence ao contrato/);
  const r = t.eng('exec_etapa_salvar', {
    nome: 'Rede de água · Rua A', local: 'Rua A', empreiteiro: emp, contrato_id: id,
    itens: [{ contrato_item: i1.id, servico: 'qualquer coisa', qtd_prevista: 60, inicio: dia(-9), termino: dia(5), fvs_modelo: 'FVS.03' }, { contrato_item: i2.id, qtd_prevista: 5, inicio: dia(-9), termino: dia(5), fvs_modelo: 'FVS.03' }]
  });
  const e = t.eng('exec_dados').etapas.find(x => x.codigo === r.codigo);
  assert.equal(e.contrato_id, id); assert.equal(e.contrato_tipo, 'Com contrato'); assert.equal(e.contrato_numero, '015/2026');
  assert.equal(e.itens[0].servico, 'Assentamento de tubo PEAD DN 63');          // nome e unidade vêm do contrato
  assert.equal(e.itens[0].unidade, 'M/L'); assert.equal(e.itens[0].contrato_item, i1.id);
  assert.equal(t.eng('exec_dados').contratos[0].itens[0].a_programar, 40);        // 100 − 60 já programado
  // contrato que não está vigente não serve para abrir frente nova
  t.ctr('contrato_status', { id, op: 'encerrar' });
  assert.throws(() => t.eng('exec_etapa_salvar', { nome: 'Y', empreiteiro: emp, contrato_id: id, itens: [{ contrato_item: i1.id, qtd_prevista: 10, inicio: dia(0), termino: dia(5), fvs_modelo: 'FVS.03' }] }), /não está vigente/);
  t.ctr('contrato_status', { id, op: 'reabrir', motivo: 'continua valendo' });
  // sem contrato continua valendo (e "-" desliga o vínculo)
  const s = t.eng('exec_etapa_salvar', { nome: 'Avulsa', empreiteiro: emp, contrato_id: '-', itens: [{ servico: 'Hidrante', unidade: 'UN', qtd_prevista: 1, inicio: dia(0), termino: dia(3), fvs_modelo: 'FVS.03' }] });
  assert.equal(t.eng('exec_dados').etapas.find(x => x.codigo === s.codigo).contrato_tipo, 'Sem contrato');
  // trocar o empreiteiro do contrato ou tirar item usado: travado
  assert.throws(() => t.ctr('contrato_salvar', { id, empreiteiro: outro, objeto: 'x', motivo: 'troca' }), /frentes de trabalho ligadas/);
  assert.throws(() => t.ctr('contrato_salvar', { id, empreiteiro: emp, objeto: 'x', motivo: 'tirando item', itens: [{ id: i2.id, servico: 'a', unidade: 'UN', qtd: 1, unitario: 1 }] }), /já está em uma frente/);
  assert.throws(() => t.ctr('contrato_status', { id, op: 'cancelar' }), /Só rascunho/);
});

test('contratado × executado × medido × pago acompanha os diários e as medições', () => {
  const t = preparar();
  const { emp, id } = contratoVigente(t, { valor_global: 14366.8 });
  const [i1, i2] = t.eng('exec_dados').contratos[0].itens;
  const r = t.eng('exec_etapa_salvar', {
    nome: 'Rede de água · Rua A', empreiteiro: emp, contrato_id: id,
    itens: [{ contrato_item: i1.id, qtd_prevista: 100, inicio: dia(-9), termino: dia(5), fvs_modelo: 'FVS.03' }, { contrato_item: i2.id, qtd_prevista: 10, inicio: dia(-9), termino: dia(5), fvs_modelo: 'FVS.03' }]
  });
  const e = t.eng('exec_dados').etapas.find(x => x.codigo === r.codigo);
  const [tubo, reg] = e.itens;
  t.eng('exec_diario_salvar', { data: dia(-4), motivo: 'retroativo do teste', lancamentos: [{ item_id: tubo.id, qtd: 40 }, { item_id: reg.id, qtd: 10 }] });
  let d = t.ctr('contrato_detalhe', { id });
  const l1 = d.itens.find(x => x.id === i1.id), l2 = d.itens.find(x => x.id === i2.id);
  assert.equal(l1.executado, 40); assert.equal(l1.v_exec, r2(40 * 49.6)); assert.equal(l1.pct_exec, 40);
  assert.equal(l2.executado, 10); assert.equal(l2.v_exec, 3220); assert.equal(l2.medido, 0);
  assert.equal(d.resumo.executado, r2(40 * 49.6 + 3220));
  assert.equal(d.resumo.medido, 0);
  assert.equal(d.frentes.length, 1);
  // registros concluídos + FVS aprovada entram na medição; o valor medido e pago vem do contrato
  aprovarFvs(t, reg.id);
  const m = t.ctr('medicao_criar', { empreiteiro: emp, de: dia(-6), ate: dia(0) }).id;
  d = t.ctr('contrato_detalhe', { id });
  assert.equal(d.itens.find(x => x.id === i2.id).medido, 0, 'rascunho de medição não conta');
  t.ctr('medicao_enviar', { id: m });
  d = t.ctr('contrato_detalhe', { id });
  assert.equal(d.itens.find(x => x.id === i2.id).medido, 10); assert.equal(d.resumo.medido, 3220); assert.equal(d.resumo.pago, 0);
  assert.equal(d.itens.find(x => x.id === i2.id).saldo, 0);
  t.apr('medicao_aprovar', { id: m, pdf: { nome: 'M.pdf', b64: PDF.b64 } });
  t.apr('medicao_pagar', { id: m, data: dia(0) });
  d = t.ctr('contrato_detalhe', { id });
  assert.equal(d.resumo.pago, 3220); assert.equal(d.resumo.saldo, r2(14366.8 - 3220));
  assert.equal(d.resumo.pct_pago, r2(3220 / 14366.8 * 100));
  // passou do contratado: só avisa (nada trava a obra)
  t.eng('exec_diario_salvar', { data: dia(-3), motivo: 'retroativo do teste', lancamentos: [{ item_id: reg.id, qtd: 3 }] });
  assert.equal(t.ctr('contrato_detalhe', { id }).itens.find(x => x.id === i2.id).acima, true);
  // serviço da frente que não é da planilha aparece como "sem vínculo"
  t.eng('exec_etapa_salvar', { codigo: r.codigo, nome: 'Rede de água · Rua A', itens: [{ servico: 'Serviço extra', unidade: 'UN', qtd_prevista: 1, inicio: dia(0), termino: dia(2), fvs_modelo: 'FVS.03' }] });
  assert.equal(t.ctr('contrato_detalhe', { id }).sem_vinculo[0].servico, 'Serviço extra');
  // a lista traz o resumo de cada contrato
  const lista = t.ctr('contratos');
  assert.equal(lista.contratos[0].resumo.pago, 3220); assert.equal(lista.modelo.multa1_pct, 10); assert.equal(lista.modelo.contratante_nome, 'SPE Prime Beach');
});
