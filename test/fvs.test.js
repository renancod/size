// FVS (ficha de verificação de serviço): modelos, abertura com a frente de trabalho, RDOs vinculados, preenchimento,
// reinspeção, aprovação com número em sequência e arquivo no Drive. node --test test/
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const PDF = { nome: 'FVS.pdf', b64: Buffer.from('%PDF-1.4 teste').toString('base64') };
const IMG = n => ({ nome: n, mime: 'image/png', b64: Buffer.from('png-falso-' + n).toString('base64') });

function preparar() {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const login = call('login', { login: 'admin', senha });
  const adm = (acao, d = {}) => call(acao, { token: login.token, ...d });
  const obra = adm('admin_obra_criar', { nome: 'Loteamento Sul', sigla: 'LS', endereco: 'Rua X' }).id;
  const usuario = (nome, perfil) => {
    const p = adm('admin_dados').perfis.find(x => x.perfil === perfil);
    adm('admin_usuario_salvar', { usuario: { nome, login: nome, ativo: true }, senha: 'Senha-Forte-26', acessos: [{ obra_id: obra, perfil, permissoes: p.permissoes }] });
    const s = call('login', { login: nome, senha: 'Senha-Forte-26' });
    return (acao, d = {}) => call(acao, { token: s.token, obra, ...d });
  };
  return { G, adm, obra, eng: usuario('eng', 'Engenheiro'), eng2: usuario('fabiano', 'Engenheiro'), enc: usuario('joao', 'Encarregado') };
}
function etapaComFvs(t, modelo = 'FVS.04') {
  const r = t.eng('exec_etapa_salvar', {
    nome: 'Esgoto · Rua A', local: 'Rua A', itens: [
      { servico: 'Rede coletora PVC DN 150', qtd_prevista: 100, inicio: dia(-10), termino: dia(10), fvs_modelo: modelo },
      { servico: 'Boca de lobo', qtd_prevista: 10, inicio: dia(-10), termino: dia(10), fvs_modelo: '-' }
    ]
  });
  const e = t.eng('exec_dados').etapas.find(x => x.codigo === r.codigo);
  return { r, cod: r.codigo, rede: e.itens[0], boca: e.itens[1] };
}
function preencherTudo(t, id, resp = 'O') {
  const d = t.eng('fvs_detalhe', { id }), chk = {};
  d.blocos.forEach((b, bi) => b.itens.forEach((x, ii) => { chk[bi + '.' + ii] = { r: resp }; }));
  t.eng('fvs_salvar', { id, checklist: chk, alteracao_sim: 'Não' });
  t.eng('fvs_anexo', { id, tipo: 'base', arquivo: IMG('base.png') });
  t.eng('fvs_anexo', { id, tipo: 'exec', arquivo: IMG('exec.png') });
  return d;
}

test('modelos importados do Drive: 45 fichas, FVS.03 marcada para revisar, taxonomia categoria → tipo', () => {
  const t = preparar();
  const r = t.eng('fvs_modelos');
  assert.equal(r.modelos.length, 45);
  const m4 = r.modelos.find(m => m.codigo === 'FVS.04');
  assert.equal(m4.tipo, 'Rede de esgoto');
  assert.equal(m4.categoria, 'Infraestrutura');
  assert.equal(m4.n_itens, 11);
  assert.equal(r.modelos.find(m => m.codigo === 'FVS.03').revisar, true);
  assert.ok(r.taxonomia.Infraestrutura.includes('Rede de água') && r.taxonomia.Civil.includes('Alvenaria'));
  // encarregado consulta mas não edita modelos
  t.enc('fvs_modelos');
  assert.throws(() => t.enc('fvs_modelo_salvar', { codigo: 'FVS.99', nome: 'X', categoria: 'Civil', tipo: 'Outros', blocos: [{ itens: ['a'] }] }), /permissão/);
});

test('criar e editar modelo: revisão sobe quando os itens mudam', () => {
  const t = preparar();
  const novo = { codigo: 'fvs.99', nome: 'Execução de Meio-fio', categoria: 'Infraestrutura', tipo: 'Pavimentação', blocos: [{ titulo: '', itens: ['Alinhamento conforme projeto?', 'Rejuntamento completo?'] }] };
  t.eng('fvs_modelo_salvar', novo);
  let m = t.eng('fvs_modelos').modelos.find(x => x.codigo === 'FVS.99');
  assert.equal(m.revisao, '00');
  t.eng('fvs_modelo_salvar', Object.assign({}, novo, { nome: 'Execução de Meio-fio e Sarjeta' }));   // só o nome: mesma revisão
  assert.equal(t.eng('fvs_modelos').modelos.find(x => x.codigo === 'FVS.99').revisao, '00');
  t.eng('fvs_modelo_salvar', Object.assign({}, novo, { blocos: [{ titulo: '', itens: ['Alinhamento conforme projeto?', 'Rejuntamento completo?', 'Limpeza final?'] }] }));
  m = t.eng('fvs_modelos').modelos.find(x => x.codigo === 'FVS.99');
  assert.equal(m.revisao, '01');
  assert.equal(m.n_itens, 3);
  assert.throws(() => t.eng('fvs_modelo_salvar', { codigo: 'FVS.98', nome: 'Sem itens', categoria: 'Civil', tipo: 'Outros', blocos: [] }), /pelo menos um item/);
});

test('abrir a frente de trabalho abre a FVS de cada serviço (escolha do modelo, "-" = sem FVS)', () => {
  const t = preparar();
  const { r, rede, boca } = etapaComFvs(t);
  assert.match(r.msg, /1 FVS aberta/);
  const d = t.eng('exec_dados');
  assert.equal(d.fvs.length, 1);
  assert.equal(d.fvs[0].item_id, rede.id);
  assert.equal(d.fvs[0].status, 'Em execução');
  assert.ok(!d.fvs.some(f => f.item_id === boca.id));
  const sug = d.catalogo.find(s => s.servico === 'Rede coletora PVC DN 150');
  assert.equal(sug.fvs_sugerido, 'FVS.04');                                       // o catálogo sugere o modelo
  assert.equal(d.catalogo.find(s => s.servico === 'Boca de lobo').fvs_sugerido, 'FVS.03');
  // depois dá para abrir a do serviço que ficou sem FVS; não duplica
  const f2 = t.eng('fvs_criar', { item_id: boca.id, modelo: 'FVS.03' });
  assert.match(f2.msg, /FVS aberta/);
  assert.throws(() => t.eng('fvs_criar', { item_id: boca.id, modelo: 'FVS.03' }), /já tem uma FVS/);
  assert.equal(t.eng('fvs_listar').fvs.length, 2);
});

test('a FVS lista os RDOs em que o serviço teve produção (cresce até o serviço terminar)', () => {
  const t = preparar();
  const { rede } = etapaComFvs(t);
  const id = t.eng('fvs_listar').fvs[0].id;
  assert.equal(t.eng('fvs_detalhe', { id }).rdo_lista.length, 0);
  t.eng('exec_diario_salvar', { data: dia(-2), motivo: 'retroativo do teste', lancamentos: [{ item_id: rede.id, qtd: 20 }], equipes: [{ etapa: rede.etapa, equipe: 'Empreiteiro A', pessoas: 5 }] });
  t.eng('exec_diario_salvar', { data: dia(-1), motivo: 'retroativo do teste', lancamentos: [{ item_id: rede.id, qtd: 30 }] });
  t.eng('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: rede.id, qtd: 0 }] });
  const d = t.eng('fvs_detalhe', { id });
  assert.deepEqual(d.rdo_lista.map(x => x.numero), [1, 2]);
  assert.equal(d.rdo_ate, 2);
  assert.equal(d.servico_info.executado, 50);
  assert.deepEqual(d.equipes, ['Empreiteiro A']);
  assert.equal(d.etapa_nome, 'Esgoto · Rua A');
  t.eng('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: rede.id, qtd: 10 }] });
  assert.equal(t.eng('fvs_detalhe', { id }).rdo_lista.length, 3);
});

test('preencher, anexar croquis e enviar: o sistema diz o que falta e só o encarregado consulta', () => {
  const t = preparar();
  etapaComFvs(t);
  const id = t.eng('fvs_listar').fvs[0].id;
  let d = t.eng('fvs_detalhe', { id });
  assert.ok(d.pendencias.some(p => /sem resposta/.test(p)) && d.pendencias.some(p => /croqui base/.test(p)) && d.pendencias.some(p => /croqui de execução/.test(p)) && d.pendencias.some(p => /alteração/.test(p)));
  assert.throws(() => t.eng('fvs_enviar', { id }), /Falta:/);
  assert.throws(() => t.enc('fvs_salvar', { id, checklist: {} }), /permissão/);
  assert.equal(t.enc('fvs_detalhe', { id }).pode_preencher, false);
  assert.throws(() => t.eng('fvs_salvar', { id, checklist: { '9.9': { r: 'O' } } }), /Item inválido/);
  assert.throws(() => t.eng('fvs_salvar', { id, checklist: { '0.0': { r: 'S' } } }), /2ª vistoria/);
  preencherTudo(t, id);
  d = t.eng('fvs_detalhe', { id });
  assert.equal(d.status, 'Em preenchimento');
  assert.deepEqual(d.pendencias, []);
  assert.equal(d.anexos.length, 2);
  const ver = t.eng('fvs_anexo_ver', { id, arquivo: d.anexos[0].id });
  assert.equal(Buffer.from(ver.b64, 'base64').toString(), 'png-falso-base.png');
  // alteração em relação ao projeto exige descrição e quem autorizou
  t.eng('fvs_salvar', { id, alteracao_sim: 'Sim', alteracao: 'PV deslocado 2 m por interferência de rede de água' });
  assert.ok(t.eng('fvs_detalhe', { id }).pendencias.some(p => /quem autorizou/.test(p)));
  t.eng('fvs_salvar', { id, alteracao_aut: 'Fabiano' });
  assert.equal(t.eng('fvs_enviar', { id }).msg, 'FVS enviada para aprovação.');
  assert.equal(t.eng('fvs_detalhe', { id }).status, 'Aguardando aprovação');
  assert.throws(() => t.eng('fvs_salvar', { id, checklist: {} }), /não pode ser alterada/);   // travada enquanto aguarda
});

test('aprovação: número em sequência (001, 002…), PDF e croquis na pasta do mês, código de verificação; encarregado não aprova', () => {
  const t = preparar();
  const { boca } = etapaComFvs(t);
  const id1 = t.eng('fvs_listar').fvs[0].id;
  const id2 = t.eng('fvs_criar', { item_id: boca.id, modelo: 'FVS.03' }).id;
  preencherTudo(t, id1); preencherTudo(t, id2);
  t.eng('fvs_enviar', { id: id1 }); t.eng('fvs_enviar', { id: id2 });
  assert.throws(() => t.enc('fvs_aprovar', { id: id1, pdf: PDF }), /permissão/);
  assert.throws(() => t.eng2('fvs_aprovar', { id: id1 }), /PDF/);
  assert.throws(() => t.eng2('fvs_aprovar', { id: id1, pdf: { b64: Buffer.from('nao-e-pdf').toString('base64') } }), /não é um PDF/);
  const a1 = t.eng2('fvs_aprovar', { id: id1, pdf: PDF });
  assert.equal(a1.numero_txt, 'FVS 001');
  assert.equal(a1.hash.length, 64);
  const a2 = t.eng('fvs_aprovar', { id: id2, pdf: PDF });                              // aprova a própria: permitido, mas marcado
  assert.equal(a2.numero_txt, 'FVS 002');
  const d1 = t.eng('fvs_detalhe', { id: id1 }), d2 = t.eng('fvs_detalhe', { id: id2 });
  assert.equal(d1.status, 'Aprovada'); assert.equal(d1.aprovado_por, 'fabiano'); assert.equal(d1.auto_aprovada, false);
  assert.equal(d2.auto_aprovada, true);
  assert.equal(d1.editavel, false);
  assert.throws(() => t.eng('fvs_salvar', { id: id1, checklist: {} }), /Aprovada/);
  // Drive: …/FVS/AAAA-MM/FVS 001 · …/ com o PDF e os croquis
  const mes = new Date().toISOString().slice(0, 7);
  const pastas = Object.values(t.G._pastas);
  const fvsRaiz = pastas.find(p => p.nome === 'FVS'), pMes = pastas.find(p => p.pai === fvsRaiz.id && p.nome === mes), p1 = pastas.find(p => p.pai === pMes.id && /^FVS 001 · /.test(p.nome));
  assert.ok(p1, 'pasta da FVS 001 dentro da pasta do mês');
  const arqs = Object.values(t.G._arquivos).filter(a => a.pai === p1.id).map(a => a.nome);
  assert.ok(arqs.some(n => /\.pdf$/.test(n)) && arqs.some(n => /CROQUI-BASE/.test(n)) && arqs.some(n => /CROQUI-EXEC/.test(n)));
  // o sino: aprovador vê o que espera aprovação; não sobra nada depois de aprovado
  assert.ok(!t.eng2('notificacoes').itens.some(i => i.etapa === 'fvs_aprovar'));
});

test('devolver para ajustes, reinspeção (X → ⊗) e reabrir uma FVS aprovada mantendo o número', () => {
  const t = preparar();
  etapaComFvs(t);
  const id = t.eng('fvs_listar').fvs[0].id;
  preencherTudo(t, id);
  t.eng('fvs_enviar', { id });
  assert.ok(t.eng2('notificacoes').itens.some(i => i.etapa === 'fvs_aprovar'));        // aparece no sino de quem aprova
  assert.throws(() => t.eng2('fvs_devolver', { id, motivo: 'x' }), /motivo/);
  t.eng2('fvs_devolver', { id, motivo: 'Faltou o croqui com as cotas dos poços' });
  assert.equal(t.eng('fvs_detalhe', { id }).status, 'Devolvida');
  assert.ok(t.eng('notificacoes').itens.some(i => i.etapa === 'fvs_devolvida'));
  // reprova um item na 1ª vistoria → não dá para enviar; abre a 2ª vistoria e marca ⊗
  t.eng('fvs_salvar', { id, checklist: { '0.4': { r: 'X', obs: 'tubo desalinhado' } }, nc: [{ item: '5', ocorrencia: 'Tubo desalinhado no PV 3', local: 'PV 3', solucao: 'Refazer o assentamento' }] });
  assert.ok(t.eng('fvs_detalhe', { id }).pendencias.some(p => /reprovado/.test(p)));
  assert.throws(() => t.eng('fvs_enviar', { id }), /reprovado/);
  assert.match(t.eng('fvs_nova_vistoria', { id }).msg, /2ª vistoria/);
  assert.equal(t.eng('fvs_detalhe', { id }).vistoria, 2);
  t.eng('fvs_salvar', { id, checklist: { '0.4': { r: 'S' } } });
  const d = t.eng('fvs_detalhe', { id });
  assert.equal(d.checklist['0.4'].r1, 'X'); assert.equal(d.checklist['0.4'].r2, 'S');      // o histórico da 1ª vistoria fica
  assert.equal(d.nc.length, 1);
  assert.deepEqual(d.pendencias, []);
  assert.throws(() => t.eng('fvs_nova_vistoria', { id }), /reprovado/);                    // sem X, não há reinspeção
  t.eng('fvs_enviar', { id });
  t.eng2('fvs_aprovar', { id, pdf: PDF });
  assert.throws(() => t.eng('fvs_reabrir', { id, motivo: 'x' }), /motivo/);
  t.eng('fvs_reabrir', { id, motivo: 'Cota do PV 5 conferida de novo' });
  assert.equal(t.eng('fvs_detalhe', { id }).status, 'Em preenchimento');
  t.eng('fvs_enviar', { id });
  const a = t.eng2('fvs_aprovar', { id, pdf: PDF });
  assert.equal(a.numero_txt, 'FVS 001');                                                  // o número não muda
  assert.ok(t.eng('fvs_detalhe', { id }).historico.some(h => h.acao === 'Reaberta'));
});

test('cancelar FVS aberta por engano e permissões novas chegam aos perfis Engenheiro e Encarregado', () => {
  const t = preparar();
  etapaComFvs(t);
  const id = t.eng('fvs_listar').fvs[0].id;
  assert.throws(() => t.enc('fvs_cancelar', { id, motivo: 'engano' }), /permissão/);
  t.eng('fvs_cancelar', { id, motivo: 'Aberta por engano' });
  assert.equal(t.eng('fvs_detalhe', { id }).status, 'Cancelada');
  assert.equal(t.eng('exec_dados').fvs.length, 0);                                         // cancelada não aparece no resumo da execução
  const perfis = t.adm('admin_dados').perfis;
  assert.ok(perfis.find(p => p.perfil === 'Engenheiro').permissoes.includes('fvs_aprovar'));
  assert.ok(perfis.find(p => p.perfil === 'Encarregado').permissoes.includes('fvs_ver') && !perfis.find(p => p.perfil === 'Encarregado').permissoes.includes('fvs_preencher'));
});