// Medições de empreiteiros: só serviço concluído e com FVS aprovada, uma vez só, numeração por empreiteiro, aprovação e Drive.
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
  const login = call('login', { login: 'admin', senha });
  const adm = (acao, d = {}) => call(acao, { token: login.token, ...d });
  const obra = adm('admin_obra_criar', { nome: 'Loteamento Sul', sigla: 'LS', endereco: 'Rua X' }).id;
  const todas = adm('admin_dados').perfis.find(p => p.perfil === 'Engenheiro').permissoes;
  const usuario = (nome, perfil, extras = []) => {
    const p = adm('admin_dados').perfis.find(x => x.perfil === perfil);
    adm('admin_usuario_salvar', { usuario: { nome, login: nome, ativo: true }, senha: 'Senha-Forte-26', acessos: [{ obra_id: obra, perfil, permissoes: [...p.permissoes, ...extras] }] });
    const s = call('login', { login: nome, senha: 'Senha-Forte-26' });
    return (acao, d = {}) => call(acao, { token: s.token, obra, ...d });
  };
  return {
    G, adm, obra, call,
    eng: usuario('eng', 'Engenheiro'),
    lanc: usuario('renan', 'Engenheiro', ['medicao_lancar', 'medicao_ver']),          // lança as medições
    apr: usuario('fabiano', 'Engenheiro', ['medicao_aprovar', 'medicao_ver']),         // aprova
    enc: usuario('joao', 'Encarregado')
  };
}
const admObra = (t, acao, d = {}) => t.adm(acao, { obra: t.obra, ...d });
function cenario(t) {
  const emp = t.eng('exec_equipe_salvar', { nome: 'Equipe Alas', pessoas: 5, empresa: 'Alas & Cia Ltda', responsavel: 'Carlos Souza', telefone: '51 99999-0001', email: 'carlos@alas.com.br', documento: '12.345.678/0001-90' }).codigo;
  const r = t.eng('exec_etapa_salvar', {
    nome: 'Pluvial · Rua A', local: 'Rua A', empreiteiro: emp, contrato_tipo: 'Com contrato', contrato_numero: '015/2026', contrato_data: dia(-30),
    itens: [
      { servico: 'Boca de lobo', qtd_prevista: 10, inicio: dia(-9), termino: dia(5), fvs_modelo: 'FVS.03' },
      { servico: 'Poço de visita', qtd_prevista: 8, inicio: dia(-9), termino: dia(5), fvs_modelo: 'FVS.03' },
      { servico: 'Tubulação de concreto DN 600', qtd_prevista: 200, inicio: dia(-9), termino: dia(5), fvs_modelo: 'FVS.03' }
    ]
  });
  const e = t.eng('exec_dados').etapas.find(x => x.codigo === r.codigo);
  return { emp, cod: r.codigo, boca: e.itens[0], pv: e.itens[1], tub: e.itens[2] };
}
function lancar(t, item, data, qtd) { t.eng('exec_diario_salvar', { data, motivo: 'retroativo do teste', lancamentos: [{ item_id: item.id, qtd }] }); }
function aprovarFvs(t, itemId) {
  const id = t.eng('fvs_listar').fvs.find(f => f.item_id === itemId).id;
  const d = t.eng('fvs_detalhe', { id }), chk = {};
  d.blocos.forEach((b, bi) => b.itens.forEach((x, ii) => { chk[bi + '.' + ii] = { r: 'O' }; }));
  t.eng('fvs_salvar', { id, checklist: chk, alteracao_sim: 'Não' });
  t.eng('fvs_anexo', { id, tipo: 'base', arquivo: IMG('b') }); t.eng('fvs_anexo', { id, tipo: 'exec', arquivo: IMG('e') });
  t.eng('fvs_enviar', { id });
  return t.apr('fvs_aprovar', { id, pdf: PDF });
}

test('empreiteiro com dados da empresa, empreiteiro e contrato na frente de trabalho', () => {
  const t = preparar();
  const { emp, cod } = cenario(t);
  const q = t.eng('exec_dados');
  const e = q.equipes.find(x => x.codigo === emp);
  assert.equal(e.empresa, 'Alas & Cia Ltda'); assert.equal(e.responsavel, 'Carlos Souza'); assert.equal(e.telefone, '51 99999-0001'); assert.equal(e.email, 'carlos@alas.com.br');
  const et = q.etapas.find(x => x.codigo === cod);
  assert.equal(et.empreiteiro, emp); assert.equal(et.contrato_tipo, 'Com contrato'); assert.equal(et.contrato_numero, '015/2026');
  assert.throws(() => t.eng('exec_equipe_salvar', { nome: 'Outra', email: 'sem-arroba' }), /E-mail/);
  assert.throws(() => t.eng('exec_etapa_salvar', { codigo: cod, nome: 'Pluvial · Rua A', contrato_tipo: 'Com contrato', contrato_numero: '' }), /número do contrato/);
  t.eng('exec_etapa_salvar', { codigo: cod, nome: 'Pluvial · Rua A', contrato_tipo: 'Sem contrato' });
  assert.equal(t.eng('exec_dados').etapas.find(x => x.codigo === cod).contrato_numero, '');
});

test('só serviço concluído e com FVS aprovada entra; o resto aparece como pendente com o motivo', () => {
  const t = preparar();
  const { emp, boca, pv, tub } = cenario(t);
  lancar(t, boca, dia(-4), 10);        // concluída
  lancar(t, pv, dia(-4), 8);           // concluída (mas FVS não aprovada)
  lancar(t, tub, dia(-4), 50);         // em andamento
  aprovarFvs(t, boca.id);
  const r = t.lanc('medicao_prever', { empreiteiro: emp, de: dia(-6), ate: dia(0) });
  assert.deepEqual(r.elegiveis.map(x => x.servico), ['Boca de lobo']);
  assert.equal(r.elegiveis[0].qtd, 10);
  assert.equal(r.elegiveis[0].concluido_em, dia(-4));
  assert.equal(r.elegiveis[0].fvs, 'FVS 001');
  assert.deepEqual(r.elegiveis[0].rdos, [1]);
  assert.deepEqual(r.pendentes.map(x => x.servico), ['Poço de visita']);
  assert.match(r.pendentes[0].motivo, /FVS ainda não aprovada/);
  assert.match(r.elegiveis[0].contrato, /Contrato nº 015\/2026 de /);
  // período em que nada foi concluído → nada
  const vazio = t.lanc('medicao_prever', { empreiteiro: emp, de: dia(-30), ate: dia(-8) });
  assert.equal(vazio.elegiveis.length + vazio.pendentes.length, 0);
  assert.throws(() => t.lanc('medicao_prever', { empreiteiro: emp, de: dia(0), ate: dia(-3) }), /antes/);
  // sem FVS nenhuma: também fica pendente
  const e2 = t.eng('exec_etapa_salvar', { nome: 'Sem ficha', empreiteiro: emp, itens: [{ servico: 'Meio-fio', qtd_prevista: 20, inicio: dia(-9), termino: dia(5), fvs_modelo: '-' }] });
  const mf = t.eng('exec_dados').etapas.find(x => x.codigo === e2.codigo).itens[0];
  lancar(t, mf, dia(-3), 20);
  assert.match(t.lanc('medicao_prever', { empreiteiro: emp, de: dia(-6), ate: dia(0) }).pendentes.find(x => x.servico === 'Meio-fio').motivo, /sem FVS/);
});

test('verba (VB) em %: 10% + 20% = 30%; mede em parcelas por período, sem FVS; aviso passa de 100%', () => {
  const t = preparar();
  const emp = t.eng('exec_equipe_salvar', { nome: 'Equipe Topo', pessoas: 2 }).codigo;
  const r = t.eng('exec_etapa_salvar', { nome: 'Acompanhamento', empreiteiro: emp, itens: [{ servico: 'Acompanhamento técnico', unidade: 'VB', qtd_prevista: 1, inicio: dia(-30), termino: dia(30), fvs_modelo: '-' }] });
  const vb = t.eng('exec_dados').etapas.find(x => x.codigo === r.codigo).itens[0];
  lancar(t, vb, dia(-12), 0.1);
  lancar(t, vb, dia(-4), 0.2);
  let i = t.eng('exec_dados').etapas.find(x => x.codigo === r.codigo).itens[0];
  assert.deepEqual([i.executado, i.pct], [0.3, 30]);
  // 1ª medição: só o que andou até o fim do período (10%), sem FVS
  const p1 = t.lanc('medicao_prever', { empreiteiro: emp, de: dia(-15), ate: dia(-8) });
  assert.deepEqual(p1.elegiveis.map(x => [x.servico, x.qtd, x.verba]), [['Acompanhamento técnico', 0.1, true]]);
  assert.equal(p1.pendentes.length, 0);
  const m1 = t.lanc('medicao_criar', { empreiteiro: emp, de: dia(-15), ate: dia(-8) }).id;
  t.lanc('medicao_enviar', { id: m1 });
  assert.equal(t.lanc('medicao_detalhe', { id: m1 }).itens[0].prevista, 1);
  // 2ª medição: a parcela seguinte (20%), o já medido não volta
  const p2 = t.lanc('medicao_prever', { empreiteiro: emp, de: dia(-7), ate: dia(0) });
  assert.deepEqual(p2.elegiveis.map(x => x.qtd), [0.2]);
  // passou de 100%: aviso em %, sem travar
  lancar(t, vb, dia(-2), 0.8);
  const al = t.eng('exec_dados').alertas || [];
  assert.ok(JSON.stringify(t.eng('exec_dados')).includes('110% da verba'), JSON.stringify(al).slice(0, 300));
  assert.equal(t.G.rodar(`qun_(0.25, 'VB', 1) + ' | ' + qun_(12.5, 'm', 0) + ' | ' + ehVerba_('vb.') + ehVerba_('verba') + ehVerba_('un')`), '25% | 12,5 m | truetruefalse');
});

test('rascunho → enviar → aprovar: numeração por empreiteiro, reserva dos serviços, PDF e pasta no Drive', () => {
  const t = preparar();
  const { emp, boca, pv } = cenario(t);
  lancar(t, boca, dia(-4), 10); lancar(t, pv, dia(-3), 8);
  aprovarFvs(t, boca.id); aprovarFvs(t, pv.id);
  assert.throws(() => t.enc('medicoes'), /permissão/);
  assert.throws(() => t.apr('medicao_criar', { empreiteiro: emp, de: dia(-6), ate: dia(0) }), /permissão/);   // quem aprova não lança
  const { id } = t.lanc('medicao_criar', { empreiteiro: emp, de: dia(-6), ate: dia(0), obs: 'Primeira medição' });
  let d = t.lanc('medicao_detalhe', { id });
  assert.equal(d.status, 'Rascunho'); assert.equal(d.itens.length, 2);
  assert.deepEqual(d.totais.map(x => x.servico + ':' + x.qtd), ['Boca de lobo:10', 'Poço de visita:8']);
  assert.equal(d.emp.empresa, 'Alas & Cia Ltda');
  // rascunho não reserva: outra pessoa ainda enxerga os serviços
  assert.equal(t.lanc('medicao_prever', { empreiteiro: emp, de: dia(-6), ate: dia(0) }).elegiveis.length, 2);
  assert.throws(() => t.lanc('medicao_aprovar', { id, pdf: PDF }), /permissão/);
  t.lanc('medicao_enviar', { id });
  assert.equal(t.lanc('medicao_detalhe', { id }).status, 'Aguardando aprovação');
  assert.equal(t.lanc('medicao_prever', { empreiteiro: emp, de: dia(-6), ate: dia(0) }).elegiveis.length, 0);   // agora reserva
  assert.ok(t.apr('notificacoes').itens.some(i => i.etapa === 'medicao_aprovar'));                           // o sino chama quem aprova
  assert.throws(() => t.lanc('medicao_salvar', { id, itens: [] }), /não pode ser alterada/);
  assert.throws(() => t.apr('medicao_aprovar', { id }), /PDF/);
  const a = t.apr('medicao_aprovar', { id, pdf: PDF });
  assert.equal(a.numero_txt, 'Medição 001'); assert.equal(a.hash.length, 64);
  d = t.apr('medicao_detalhe', { id });
  assert.equal(d.status, 'Aprovada'); assert.equal(d.aprovado_por, 'fabiano'); assert.equal(d.enviado_por, 'renan'); assert.equal(d.auto_aprovada, false);
  // Drive: …/Medições/Alas & Cia…/Medição 001 · período/ com o PDF
  const pastas = Object.values(t.G._pastas), raiz = pastas.find(p => p.nome === 'Medições'), emp1 = pastas.find(p => p.pai === raiz.id), med1 = pastas.find(p => p.pai === emp1.id && /^Medição 001 · /.test(p.nome));
  assert.ok(med1, 'pasta da medição');
  assert.ok(Object.values(t.G._arquivos).some(a => a.pai === med1.id && /\.pdf$/.test(a.nome)));
  // não troca o empreiteiro de uma frente que já tem medição
  const outro = t.eng('exec_equipe_salvar', { nome: 'Outro', pessoas: 3 }).codigo;
  const cod = t.eng('exec_dados').etapas[0].codigo;
  assert.throws(() => t.eng('exec_etapa_salvar', { codigo: cod, nome: 'Pluvial · Rua A', empreiteiro: outro }), /já tem serviços em medição/);
});

test('complemento: serviço medido que recebe mais lançamento entra de novo só pela diferença; segunda medição = 002', () => {
  const t = preparar();
  const { emp, boca } = cenario(t);
  lancar(t, boca, dia(-4), 10);
  aprovarFvs(t, boca.id);
  const m1 = t.lanc('medicao_criar', { empreiteiro: emp, de: dia(-6), ate: dia(-2) }).id;
  t.lanc('medicao_enviar', { id: m1 }); t.apr('medicao_aprovar', { id: m1, pdf: PDF });
  t.eng('exec_diario_salvar', { data: dia(-1), motivo: 'aditivo', lancamentos: [{ item_id: boca.id, qtd: 3 }] });
  const r = t.lanc('medicao_prever', { empreiteiro: emp, de: dia(-1), ate: dia(0) });
  assert.equal(r.elegiveis.length, 1);
  assert.equal(r.elegiveis[0].complemento, true);
  assert.equal(r.elegiveis[0].qtd, 3);
  const m2 = t.lanc('medicao_criar', { empreiteiro: emp, de: dia(-1), ate: dia(0) }).id;
  t.lanc('medicao_enviar', { id: m2 });
  assert.equal(t.apr('medicao_aprovar', { id: m2, pdf: PDF }).numero_txt, 'Medição 002');
  assert.equal(t.apr('medicao_detalhe', { id: m2 }).itens[0].complemento, true);
  // outro empreiteiro começa de novo na 001
  const e2 = t.eng('exec_equipe_salvar', { nome: 'Outra empresa', empresa: 'Outra Ltda' }).codigo;
  const r2 = t.eng('exec_etapa_salvar', { nome: 'Esgoto', empreiteiro: e2, itens: [{ servico: 'Poço de visita de esgoto', qtd_prevista: 4, inicio: dia(-9), termino: dia(5), fvs_modelo: 'FVS.04' }] });
  const it = t.eng('exec_dados').etapas.find(x => x.codigo === r2.codigo).itens[0];
  lancar(t, it, dia(-1), 4); aprovarFvs(t, it.id);
  const m3 = t.lanc('medicao_criar', { empreiteiro: e2, de: dia(-1), ate: dia(0) }).id;
  t.lanc('medicao_enviar', { id: m3 });
  assert.equal(t.apr('medicao_aprovar', { id: m3, pdf: PDF }).numero_txt, 'Medição 001');
  // a lista mostra até onde está medido e o que falta medir
  const l = t.lanc('medicoes');
  assert.equal(l.empreiteiros.find(x => x.codigo === emp).medido_ate, dia(0));
  assert.equal(l.medicoes.length, 3);
});

test('devolver, cancelar libera os serviços, pagar e proteções', () => {
  const t = preparar();
  const { emp, boca } = cenario(t);
  lancar(t, boca, dia(-4), 10); aprovarFvs(t, boca.id);
  const id = t.lanc('medicao_criar', { empreiteiro: emp, de: dia(-6), ate: dia(0) }).id;
  t.lanc('medicao_enviar', { id });
  assert.throws(() => t.apr('medicao_devolver', { id, motivo: 'x' }), /motivo/);
  t.apr('medicao_devolver', { id, motivo: 'Conferir a quantidade das bocas de lobo' });
  assert.equal(t.lanc('medicao_detalhe', { id }).status, 'Devolvida');
  assert.ok(t.lanc('notificacoes').itens.some(i => i.etapa === 'medicao_devolvida'));            // volta para quem lançou
  t.lanc('medicao_salvar', { id, obs: 'ajustado' });
  t.lanc('medicao_enviar', { id });
  assert.throws(() => t.apr('medicao_pagar', { id }), /não pode ser alterada/);                  // só depois de aprovada
  t.apr('medicao_aprovar', { id, pdf: PDF });
  assert.throws(() => t.lanc('medicao_pagar', { id }), /permissão/);
  const p = t.apr('medicao_pagar', { id, pago_em: dia(0), obs: 'PIX' });
  assert.match(p.msg, /paga em/);
  const d = t.apr('medicao_detalhe', { id });
  assert.equal(d.status, 'Paga'); assert.equal(d.pago_em, dia(0));
  assert.equal(t.apr('medicoes').empreiteiros.find(x => x.codigo === emp).pago_ate, dia(0));
  assert.throws(() => t.apr('medicao_cancelar', { id, motivo: 'engano total' }), /não pode ser alterada/);   // paga não cancela
  // outra medição: cancelar devolve os serviços
  const e2 = t.eng('exec_equipe_salvar', { nome: 'Equipe B' }).codigo;
  const r2 = t.eng('exec_etapa_salvar', { nome: 'Frente B', empreiteiro: e2, itens: [{ servico: 'Poço de visita', qtd_prevista: 4, inicio: dia(-9), termino: dia(5), fvs_modelo: 'FVS.03' }] });
  const it = t.eng('exec_dados').etapas.find(x => x.codigo === r2.codigo).itens[0];
  lancar(t, it, dia(-2), 4); aprovarFvs(t, it.id);
  const m2 = t.lanc('medicao_criar', { empreiteiro: e2, de: dia(-3), ate: dia(0) }).id;
  t.lanc('medicao_enviar', { id: m2 });
  assert.equal(t.lanc('medicao_prever', { empreiteiro: e2, de: dia(-3), ate: dia(0) }).elegiveis.length, 0);
  assert.throws(() => t.lanc('medicao_cancelar', { id: m2, motivo: 'x' }), /motivo/);
  t.lanc('medicao_cancelar', { id: m2, motivo: 'Medição criada por engano' });
  assert.equal(t.lanc('medicao_prever', { empreiteiro: e2, de: dia(-3), ate: dia(0) }).elegiveis.length, 1);
  // sem serviço pronto, não cria medição
  assert.throws(() => t.lanc('medicao_criar', { empreiteiro: emp, de: dia(-30), ate: dia(-20) }), /Nenhum serviço pronto/);
});

test('mudança entre o rascunho e o envio é detectada (não mede quantidade velha)', () => {
  const t = preparar();
  const { emp, boca } = cenario(t);
  lancar(t, boca, dia(-4), 10); aprovarFvs(t, boca.id);
  const id = t.lanc('medicao_criar', { empreiteiro: emp, de: dia(-6), ate: dia(0) }).id;
  t.eng('exec_diario_salvar', { data: dia(-4), motivo: 'correção do engenheiro', lancamentos: [{ item_id: boca.id, qtd: 12 }] });
  assert.throws(() => t.lanc('medicao_enviar', { id }), /Mudou algo/);
  t.lanc('medicao_salvar', { id });
  t.lanc('medicao_enviar', { id });
  assert.equal(t.apr('medicao_detalhe', { id }).itens[0].qtd, 12);
});