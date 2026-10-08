// Módulo Execução / Diário de obra: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

const FOTO = { b64: Buffer.from('jpeg-falso').toString('base64') };
const dia = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
// resumo do clima como o app monta a partir da Open-Meteo
const CLIMA = mm => ({ manha: { mm: mm / 2, codigo: mm ? 63 : 1, desc: mm ? 'Chuva moderada' : 'Predomínio de sol', tmin: 18, tmax: 24 }, tarde: { mm: mm / 2, codigo: 1, desc: 'Nublado', tmin: 20, tmax: 26 }, mm_trabalho: mm, mm_dia: mm + 2, tmin: 17, tmax: 26, vento: 12 });

function preparar() {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const login = call('login', { login: 'admin', senha });
  const adm = (acao, d = {}) => call(acao, { token: login.token, ...d });
  const obra = adm('admin_obra_criar', { nome: 'Loteamento Sul', sigla: 'LS', endereco: 'Rua X' }).id;
  adm('admin_obra_salvar', { id: obra, nome: 'Loteamento Sul', endereco: 'Rua X', ativa: true, lat: '-27.6', lng: '-48.5' });
  const usuario = (login, perfil) => {
    const p = adm('admin_dados').perfis.find(x => x.perfil === perfil);
    adm('admin_usuario_salvar', { usuario: { nome: login, login, ativo: true }, senha: 'senha123', acessos: [{ obra_id: obra, perfil, permissoes: p.permissoes }] });
    const s = call('login', { login, senha: 'senha123' });
    return (acao, d = {}) => call(acao, { token: s.token, obra, ...d });
  };
  return { G, adm, obra, eng: usuario('eng', 'Engenheiro'), enc: usuario('joao', 'Encarregado'), enc2: usuario('pedro', 'Encarregado') };
}
function criarEtapa(t, ini = dia(-10), fim = dia(10)) {
  const cod = t.eng('exec_etapa_salvar', {
    nome: 'Pavimentação · Rua X', local: 'Rua X', itens: [
      { servico: 'Asfalto (CBUQ)', qtd_prevista: 500, inicio: ini, termino: fim },
      { servico: 'Base', qtd_prevista: 500, inicio: ini, termino: fim },
      { servico: 'Sarjeta especial', unidade: 'm', qtd_prevista: 80, inicio: ini, termino: fim }
    ]
  }).codigo;
  const e = t.eng('exec_dados').etapas.find(x => x.codigo === cod);
  return { cod, asf: e.itens[0], base: e.itens[1], sarj: e.itens[2] };
}

test('catálogo, perfis e etapa com vários serviços (unidade vem do catálogo; avulso aceita a informada)', () => {
  const t = preparar();
  const A = t.adm('admin_dados');
  assert.ok(A.servicos.length >= 40);
  assert.ok(A.perfis.some(p => p.perfil === 'Encarregado') && A.perfis.some(p => p.perfil === 'Engenheiro'));
  assert.throws(() => t.enc('exec_etapa_salvar', { nome: 'X', itens: [] }), /permissão/);
  const { asf, base, sarj } = criarEtapa(t);
  assert.equal(asf.unidade, 'm²');
  assert.equal(base.unidade, 'm²');
  assert.equal(sarj.unidade, 'm');
  assert.equal(t.eng('exec_dados').catalogo.find(s => s.servico === 'Poço de visita').unidade, 'un');
});

test('diário do dia: lança quantidade, desconta o saldo, equipes e clima automático com sugestão de chuva', () => {
  const t = preparar();
  const { cod, asf } = criarEtapa(t);
  const r = t.enc('exec_diario_salvar', {
    data: dia(0), clima: CLIMA(10), gps: { lat: -27.6, lng: -48.5 }, lancamentos: [{ cliente_id: 'c1', item_id: asf.id, qtd: 50 }], equipes: [{ etapa: cod, equipe: 'Equipe Pavimentação', pessoas: 8 }]
  });
  assert.match(r.msg, /RDO 001/);
  const e = t.eng('exec_dados').etapas[0].itens[0];
  assert.equal(e.executado, 50);
  assert.equal(e.saldo, 450);
  assert.equal(e.hoje_qtd, 50);
  assert.equal(e.homem_dia, 8);
  const d = t.enc('exec_diario', { data: dia(0) });
  assert.equal(d.diario.sugestao, 'Parado por chuva');
  assert.equal(d.diario.chuva_trabalho, 10);
  assert.equal(d.diario.condicao, 'Parado por chuva'); // sem escolha do encarregado, vale a sugestão
  assert.equal(d.diario.clima.limite, 5);
  // diário enviado sem sinal (sem clima): o app completa depois
  t.enc('exec_diario_salvar', { data: dia(-1), lancamentos: [{ cliente_id: 'c0', item_id: asf.id, qtd: 5 }] });
  assert.equal(t.enc('exec_diario', { data: dia(-1) }).diario.clima, null);
  t.enc('exec_clima_salvar', { data: dia(-1), clima: CLIMA(2) });
  const ontem = t.enc('exec_diario', { data: dia(-1) }).diario;
  assert.equal(ontem.chuva_trabalho, 2);
  assert.equal(ontem.clima_final, 'Sim');
  assert.match(t.enc('exec_clima_salvar', { data: dia(-1), clima: CLIMA(30) }).msg, /já registrado/);
  t.enc('exec_diario_salvar', { data: dia(0), condicao: 'Parcial' });
  assert.equal(t.enc('exec_diario', { data: dia(0) }).diario.condicao, 'Parcial');
  // reenvio do mesmo lançamento (fila offline mandando duas vezes) não duplica
  t.enc('exec_diario_salvar', { data: dia(0), lancamentos: [{ cliente_id: 'c1', item_id: asf.id, qtd: 50 }] });
  assert.equal(t.eng('exec_dados').etapas[0].itens[0].executado, 55);
});

test('regras de data: encarregado só hoje/ontem; engenheiro corrige dias anteriores com motivo (registrado)', () => {
  const t = preparar();
  const { asf } = criarEtapa(t);
  t.enc('exec_diario_salvar', { data: dia(-1), lancamentos: [{ cliente_id: 'o1', item_id: asf.id, qtd: 30 }] });
  assert.throws(() => t.enc('exec_diario_salvar', { data: dia(-3), lancamentos: [{ item_id: asf.id, qtd: 10 }] }), /só o engenheiro/);
  assert.throws(() => t.enc('exec_diario_salvar', { data: dia(1), lancamentos: [] }), /futura/);
  assert.throws(() => t.eng('exec_diario_salvar', { data: dia(-3), lancamentos: [{ item_id: asf.id, qtd: 10 }] }), /motivo/);
  t.eng('exec_diario_salvar', { data: dia(-3), motivo: 'esqueceram de lançar', lancamentos: [{ cliente_id: 'x1', item_id: asf.id, qtd: 10 }] });
  // outro encarregado não muda o lançamento de quem lançou
  assert.throws(() => t.enc2('exec_diario_salvar', { data: dia(-1), lancamentos: [{ cliente_id: 'o1', item_id: asf.id, qtd: 5 }] }), /Só ele ou o engenheiro/);
  const det = t.eng('exec_etapa', { codigo: asf.etapa });
  assert.equal(det.etapa.itens[0].executado, 40);
  assert.ok(det.alteracoes.some(a => a.motivo === 'esqueceram de lançar'));
});

test('acima do previsto não bloqueia e vira alerta para o engenheiro', () => {
  const t = preparar();
  const { base } = criarEtapa(t);
  const r = t.enc('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: base.id, qtd: 520 }] });
  assert.match(r.msg, /Acima do previsto: Base \(520 de 500 m²\)/);
  const d = t.eng('exec_dados');
  assert.equal(d.etapas[0].itens[1].pct, 104);
  assert.ok(d.alertas.some(a => a.tipo === 'excedido'));
  assert.ok(t.eng('notificacoes').itens.some(i => i.etapa === 'exec_alerta' && /corrigir a quantidade/.test(i.texto)));
  // engenheiro corrige o previsto com motivo; o original fica guardado
  assert.throws(() => t.eng('exec_item_alterar', { id: base.id, qtd_prevista: 520 }), /motivo/);
  t.eng('exec_item_alterar', { id: base.id, qtd_prevista: 520, termino: dia(15), motivo: 'medição de campo maior que o projeto' });
  const it = t.eng('exec_dados').etapas[0].itens[1];
  assert.equal(it.prevista, 520);
  assert.equal(it.original, 500);
  assert.equal(it.termino, dia(15));
  assert.equal(it.termino_original, dia(10));
  assert.ok(!t.eng('exec_dados').alertas.some(a => a.tipo === 'excedido'));
});

test('cálculos: média sem o dia parado por chuva, ritmo necessário, término projetado e % planejado', () => {
  const t = preparar();
  // 02/03/2026 (seg) a 13/03/2026 (sex) = 10 dias úteis, 100 m
  const cod = t.eng('exec_etapa_salvar', { nome: 'Drenagem', itens: [{ servico: 'Meio-fio', qtd_prevista: 100, inicio: '2026-03-02', termino: '2026-03-13' }] }).codigo;
  const id = t.eng('exec_dados').etapas[0].itens[0].id;
  const m = 'lançamento retroativo do teste';
  t.eng('exec_diario_salvar', { data: '2026-03-02', motivo: m, lancamentos: [{ item_id: id, qtd: 10 }], equipes: [{ etapa: cod, equipe: 'A', pessoas: 5 }] });
  t.eng('exec_diario_salvar', { data: '2026-03-03', motivo: m, lancamentos: [{ item_id: id, qtd: 10 }], equipes: [{ etapa: cod, equipe: 'A', pessoas: 5 }] });
  t.eng('exec_diario_salvar', { data: '2026-03-04', motivo: m, condicao: 'Parado por chuva', lancamentos: [] });
  const c = JSON.parse(t.G.rodar(`JSON.stringify((() => { const o = central_('Obras').all()[0];
    return calcExec_({ obra: o, ss: SpreadsheetApp.openById(o.planilha_id) }, '2026-03-05').etapas[0].itens[0]; })())`));
  assert.equal(c.executado, 20);
  assert.equal(c.dias_trab, 2);          // 04/03 parado não conta
  assert.equal(c.media, 10);
  assert.equal(c.dias_restantes, 7);     // 05/03 a 13/03
  assert.equal(c.ritmo, 11.43);          // 80 m ÷ 7 dias
  assert.equal(c.projecao, '2026-03-16'); // 8 dias úteis a 10 m/dia → passa do prazo
  assert.equal(c.situacao, 'atrasado');
  assert.equal(c.planejado, 40);         // 4 de 10 dias úteis
  assert.equal(c.homem_dia, 10);
  assert.equal(c.prod_hd, 2);            // 20 m ÷ 10 homens-dia
});

test('sábado e feriado: lançamento livre marcado como aditivo especial; feriados nacionais calculados', () => {
  const t = preparar();
  const f = JSON.parse(t.G.rodar(`JSON.stringify(listaFeriados_({}, 2026, 2026))`));
  ['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04', '2026-11-20', '2026-12-25'].forEach(d => assert.ok(f.includes(d), d));
  const { asf } = criarEtapa(t, '2026-03-02', '2026-03-31');
  t.eng('exec_diario_salvar', { data: '2026-03-07', motivo: 'sábado com aditivo', lancamentos: [{ item_id: asf.id, qtd: 15 }] });
  const d = t.eng('exec_diario', { data: '2026-03-07' });
  assert.equal(d.util, false);
  assert.equal(d.diario.aditivo, 'Sim');
  // feriado municipal da obra
  t.adm('admin_obra_salvar', { id: t.obra, nome: 'Loteamento Sul', ativa: true, feriados: '19/03' });
  assert.equal(t.eng('exec_diario', { data: '2026-03-19' }).feriado, true);
});

test('avisos do engenheiro, fotos (sem duplicar), revisão e RDO', () => {
  const t = preparar();
  const { cod, asf } = criarEtapa(t);
  t.eng('exec_aviso_salvar', { etapa: cod, tipo: 'Acelerar equipe', texto: 'faltam 400 m² e o prazo é dia 20' });
  const n = t.enc('notificacoes').itens.find(i => i.etapa === 'exec_aviso');
  assert.match(n.texto, /Acelerar equipe/);
  assert.equal(n.rota, '#/diario');
  t.enc('exec_aviso_ciente', { id: t.enc('exec_dados').avisos[0].id });
  assert.ok(!t.enc('notificacoes').itens.some(i => i.etapa === 'exec_aviso'));

  t.enc('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: asf.id, qtd: 60 }], equipes: [{ etapa: cod, equipe: 'Equipe 1', pessoas: 6 }], ocorrencias: 'Caminhão atrasou 1h', enviar: true });
  const foto = { data: dia(0), etapa: cod, cliente_id: 'f1', foto: FOTO, mini: FOTO, lat: -27.6, lng: -48.5, tirada_em: dia(0) + ' 10:30', legenda: 'Base compactada' };
  t.enc('exec_foto', foto);
  t.enc('exec_foto', foto);
  assert.equal(t.enc('exec_diario', { data: dia(0) }).fotos.length, 1);
  assert.ok(t.eng('notificacoes').itens.some(i => i.etapa === 'exec_revisar'));
  t.eng('exec_revisar', { data: dia(0) });
  assert.throws(() => t.enc('exec_diario_salvar', { data: dia(0), lancamentos: [{ item_id: asf.id, qtd: 70 }] }), /revisado/);
  const rdo = t.enc('exec_rdo', { data: dia(0) });
  assert.equal(rdo.diario.status, 'Revisado');
  assert.equal(rdo.servicos[0].dia, 60);
  assert.equal(rdo.servicos[0].acumulado, 60);
  assert.equal(rdo.equipes[0].pessoas, 6);
  assert.equal(rdo.fotos.length, 1);
  assert.ok(rdo.fotos[0].b64);
  assert.equal(rdo.diario.ocorrencias, 'Caminhão atrasou 1h');
});

test('retroativo Bacia 02 (Prime Beach): 8 diários, 75 T coletores, uma vez só, quando o admin abre o painel', () => {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const tk = call('login', { login: 'admin', senha }).token;
  const adm = (acao, d = {}) => call(acao, { token: tk, ...d });
  const obra = adm('admin_obra_criar', { nome: 'Prime Beach', sigla: 'PB' }).id;
  adm('exec_etapa_salvar', { obra, nome: 'Bacia 02 - Regularização Cloacal', itens: [
    { servico: 'Tee Coletor Predial 110mm Ocre', unidade: 'un', qtd_prevista: 102, inicio: '2026-09-28', termino: '2026-10-28' },
    { servico: 'Impermeabilização - PV', unidade: 'un', qtd_prevista: 4, inicio: '2026-10-16', termino: '2026-10-28' }] });
  const d = adm('exec_dados', { obra });
  const tee = d.etapas[0].itens[0];
  assert.equal(tee.executado, 75);
  assert.equal(d.etapas[0].itens[1].executado, 0);
  assert.equal(d.diarios.length, 8);
  assert.ok(d.diarios.every(x => x.status === 'Enviado'));
  assert.equal(adm('exec_diario', { obra, data: '2026-10-07' }).lancamentos[0].qtd, 5);
  assert.match(adm('exec_diario', { obra, data: '2026-10-02' }).diario.obs, /2 não foram executadas/);
  assert.equal(d.equipes[0].nome, 'VN Hidráulica');
  assert.equal(d.equipes[0].pessoas, 3);
  assert.equal(tee.homem_dia, 24);              // 8 dias × 3 colaboradores
  assert.equal(tee.prod_hd, 3.13);              // 75 un ÷ 24 homens-dia
  assert.equal(adm('exec_diario', { obra, data: '2026-09-28' }).equipes[0].equipe, 'VN Hidráulica');
  adm('exec_dados', { obra }); // abrir de novo não lança outra vez
  const d2 = adm('exec_dados', { obra });
  assert.equal(d2.etapas[0].itens[0].executado, 75);
  assert.equal(d2.equipes.length, 1);
  assert.equal(d2.etapas[0].itens[0].homem_dia, 24);
});