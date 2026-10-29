// Servidor local de demonstração: app + API simulada com dados de exemplo.
// Uso: node test/servidor.js  → http://localhost:5173  (login: admin / Admin#Size26 · compras, estoque, fin / Obra#Teste26)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { criarGAS } = require('./gas-mock');

const G = criarGAS();
G.setup();
const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(acao + ': ' + r.erro); return r.dados; };
let tk = call('login', { login: 'admin', senha }).token;
tk = call('trocarSenha', { token: tk, atual: senha, nova: 'Admin#Size26' }).token;
const adm = (acao, d = {}) => call(acao, { token: tk, ...d });

['Cimento CP-II 50kg|sc|Estrutura', 'Areia média|m³|Agregados', 'Brita 1|m³|Agregados', 'Vergalhão CA-50 10mm|barra|Estrutura', 'Tijolo 6 furos|un|Alvenaria',
  'Cabo flexível 2,5mm|rolo|Elétrica', 'Tubo PVC 100mm|barra|Hidráulica', 'Argamassa AC-II|sc|Revestimentos', 'Tinta acrílica branca 18L|lata|Pintura']
  .forEach(l => { const [descricao, unidade, categoria] = l.split('|'); adm('admin_padrao_salvar', { descricao, unidade, categoria }); });
const obra = adm('admin_obra_criar', { nome: 'Prime Beach', sigla: 'PB', endereco: 'Av. Beira-Mar, 1000 — Capão da Canoa/RS' }).id;
adm('admin_obra_criar', { nome: 'Residencial Jardins', sigla: 'RJ', endereco: 'Rua das Flores, 50' });
adm('admin_config_salvar', { config: { REGRAS_ORCAMENTO: '5000:2; 20000:3' } });
const perfis = adm('admin_dados').perfis;
const usuario = (login, nome, perfil) => {
  adm('admin_usuario_salvar', { usuario: { nome, login, ativo: true }, senha: 'Obra#Teste26', acessos: [{ obra_id: obra, perfil, permissoes: perfis.find(p => p.perfil === perfil).permissoes }] });
  const s = call('login', { login, senha: 'Obra#Teste26' });
  const novoToken = call('trocarSenha', { token: s.token, atual: 'Obra#Teste26', nova: 'Obra#Teste26' }).token;
  return (acao, d = {}) => call(acao, { token: novoToken, obra, ...d });
};
const com = usuario('compras', 'Carla Compras', 'Compras');
const est = usuario('estoque', 'Eduardo Almoxarife', 'Estoque');
const fin = usuario('fin', 'Fernanda Financeiro', 'Financeiro');
usuario('joao', 'João Mestre de Obras', 'Solicitante');
const ger = usuario('gestor', 'Gustavo Gestor', 'Aprovador');

[['Casa do Construtor', 'vendas@casadoconstrutor.com', '51999990001', 'Cimento, areia, brita'], ['Depósito Sul', '', '51999990002', 'Agregados'],
  ['Ferragens Litoral', 'contato@ferragens.com', '51999990003', 'Aço, vergalhão'], ['Elétrica Mar', 'eletrica@mar.com', '', 'Material elétrico']]
  .forEach(([nome, email, telefone, materiais]) => com('cad_salvar', { tipo: 'fornecedores', dados: { nome, email, telefone, materiais, condicao: '30 dias' } }));
const PDF = { nome: 'orcamento.pdf', mime: 'application/pdf', b64: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64') };
const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv-SE'); };
const mats = est('obra_dados').materiais;
const novo = (frente, prioridade, dias, itens) => est('pedido_criar', {
  frente, prioridade, necessidade: d(dias),
  itens: itens.map(([descricao, qtd, unidade]) => ({ descricao, qtd, unidade, material_cod: (mats.find(m => m.descricao === descricao) || {}).codigo }))
}).numero;

novo('Fundação', 'Urgente', -1, [['Cimento CP-II 50kg', 120, 'sc'], ['Areia média', 12, 'm³'], ['Brita 1', 10, 'm³']]);
const p2 = novo('Estrutura', 'Normal', 10, [['Vergalhão CA-50 10mm', 80, 'barra']]);
com('pedido_cotar', { numeros: [p2], fornecedores: ['F001', 'F003'] });
com('orcamento_salvar', { pedido: p2, fornecedor_cod: 'F003', valor: '3.950,00', prazo_entrega: '5 dias', condicao: '30 dias', arquivo: PDF });
const p3 = novo('Alvenaria', 'Normal', 7, [['Tijolo 6 furos', 5000, 'un'], ['Argamassa AC-II', 40, 'sc']]);
com('orcamento_salvar', { pedido: p3, fornecedor_cod: 'F001', valor: '7200', arquivo: PDF });
com('orcamento_salvar', { pedido: p3, fornecedor_cod: 'F002', valor: '7450', arquivo: PDF });
com('pedido_definir', { numero: p3, orcamento: com('pedido_detalhe', { numero: p3 }).orcamentos[0].id, condicao: 'Faturado', prazo_fat: 30 });
const p4 = novo('Instalações elétricas', 'Normal', 5, [['Cabo flexível 2,5mm', 15, 'rolo']]);
com('orcamento_salvar', { pedido: p4, fornecedor_cod: 'F004', valor: '2100', arquivo: PDF });
com('pedido_definir', { numero: p4, orcamento: com('pedido_detalhe', { numero: p4 }).orcamentos[0].id, condicao: 'Faturamento direto' });
ger('pedido_aprovar', { numero: p4 });
const p5 = novo('Fundação', 'Urgente', 2, [['Cimento CP-II 50kg', 60, 'sc'], ['Brita 1', 6, 'm³']]);
com('orcamento_salvar', { pedido: p5, fornecedor_cod: 'F001', valor: '3300', arquivo: PDF });
com('pedido_definir', { numero: p5, orcamento: com('pedido_detalhe', { numero: p5 }).orcamentos[0].id, condicao: 'Faturado', prazo_fat: 28 });
ger('pedido_aprovar', { numero: p5 });
com('pedido_liberar', { numero: p5, previsao: d(1) });
est('pedido_receber', { numero: p5, itens: { 1: 40 } });
const p6 = novo('Pintura', 'Normal', 20, [['Tinta acrílica branca 18L', 12, 'lata']]);
com('orcamento_salvar', { pedido: p6, fornecedor_cod: 'F001', valor: '2880', arquivo: PDF });
com('pedido_definir', { numero: p6, orcamento: com('pedido_detalhe', { numero: p6 }).orcamentos[0].id, condicao: 'Faturado', prazo_fat: 30 });
ger('pedido_aprovar', { numero: p6 });
com('pedido_liberar', { numero: p6 });
est('pedido_receber', { numero: p6, itens: { 1: 12 }, nf_numero: '4521', nf_data: d(-20), nf: PDF });
call('pedido_detalhe', { token: tk, obra, numero: p6 });
est('cad_salvar', { tipo: 'materiais', dados: { codigo: 'M0003', descricao: 'Brita 1', unidade: 'm³', categoria: 'Agregados', estoque_min: 20 } });
est('estoque_movimentar', { tipo: 'Saída', material_cod: 'M0001', qtd: 25, frente: 'Fundação' });
// ---- execução / diário de obra (login: eng · mestre / Obra#Teste26) ----
adm('admin_obra_salvar', { id: obra, nome: 'Prime Beach', endereco: 'Av. Beira-Mar, 1000 — Capão da Canoa/RS', ativa: true, lat: '-29.746', lng: '-50.009' });
const eng = usuario('eng', 'Ernesto Engenheiro', 'Engenheiro');
const mestre = usuario('mestre', 'Marcos Encarregado', 'Encarregado');
const eqPav = eng('exec_equipe_salvar', { nome: 'Equipe Pavimentação', pessoas: 8, encarregado: 'Marcos', empresa: 'Pavi Sul Ltda', responsavel: 'Carlos Souza', telefone: '(51) 99999-0001', email: 'contato@pavisul.com.br', documento: '12.345.678/0001-90' }).codigo;
const eqDre = eng('exec_equipe_salvar', { nome: 'Equipe Drenagem', pessoas: 6, empresa: 'Drenar Obras Ltda', responsavel: 'Ana Ribeiro', telefone: '(51) 98888-0002', email: 'ana@drenar.com.br' }).codigo;
const e1 = eng('exec_etapa_salvar', { nome: 'Pavimentação · Rua A', local: 'Rua A, estaca 0 a 30', frente: 'Canteiro', empreiteiro: eqPav, contrato_tipo: 'Com contrato', contrato_numero: '015/2026', contrato_data: d(-30), itens: [
  { servico: 'Base', qtd_prevista: 600, inicio: d(-12), termino: d(6), fvs_modelo: 'FVS.05' },
  { servico: 'Asfalto (CBUQ)', qtd_prevista: 600, inicio: d(-4), termino: d(12), fvs_modelo: '-' },
  { servico: 'Meio-fio', qtd_prevista: 300, inicio: d(-12), termino: d(4), fvs_modelo: 'FVS.18.1' }] }).codigo;
const e2 = eng('exec_etapa_salvar', { nome: 'Drenagem pluvial · Rua B', local: 'Rua B', empreiteiro: eqDre, contrato_tipo: 'Sem contrato', itens: [
  { servico: 'Tubulação de concreto DN 600', qtd_prevista: 200, inicio: d(-15), termino: d(2), fvs_modelo: 'FVS.03' },
  { servico: 'Poço de visita', qtd_prevista: 8, inicio: d(-15), termino: d(4), fvs_modelo: 'FVS.03' },
  { servico: 'Boca de lobo', qtd_prevista: 10, inicio: d(-6), termino: d(8), fvs_modelo: '-' }] }).codigo;
const it = Object.fromEntries(eng('exec_dados').etapas.flatMap(e => e.itens).map(i => [i.servico, i.id]));
const clima = mm => ({ manha: { mm: mm * .7, codigo: mm ? 63 : 1, desc: mm ? 'Chuva moderada' : 'Predomínio de sol', tmin: 17, tmax: 23 }, tarde: { mm: mm * .3, codigo: mm ? 61 : 2, desc: mm ? 'Chuva fraca' : 'Parcialmente nublado', tmin: 21, tmax: 26 }, mm_trabalho: mm, mm_dia: mm + 1, tmin: 16, tmax: 26, vento: 14 });
let choveu = false;
for (let n = -12; n <= -1; n++) {
  const dia = d(n), w = new Date(dia + 'T12:00').getDay();
  if (w === 0 || w === 6) continue;
  if (n >= -7 && !choveu) { choveu = true; eng('exec_diario_salvar', { data: dia, motivo: 'dados de exemplo', enviar: true, clima: clima(14), ocorrencias: 'Chuva forte a manhã toda, equipe liberada às 11h.' }); continue; }
  const lanc = [{ item_id: it['Base'], qtd: 38 + (n % 3) * 4 }, { item_id: it['Meio-fio'], qtd: 16 }, { item_id: it['Tubulação de concreto DN 600'], qtd: 11 }];
  if (n % 3 === 0) lanc.push({ item_id: it['Poço de visita'], qtd: 1 });
  if (n >= -4) lanc.push({ item_id: it['Asfalto (CBUQ)'], qtd: 70 });
  if (n >= -6 && n % 2) lanc.push({ item_id: it['Boca de lobo'], qtd: 1 });
  eng('exec_diario_salvar', { data: dia, motivo: 'dados de exemplo', enviar: true, clima: clima(n === -2 ? 1.5 : 0), lancamentos: lanc, ocorrencias: n === -2 ? 'Usina atrasou a entrega do CBUQ em 1h30.' : '',
    equipes: [{ etapa: e1, equipe: 'Equipe Pavimentação', pessoas: 8 }, { etapa: e2, equipe: 'Equipe Drenagem', pessoas: n === -3 ? 4 : 6 }] });
  if (n < -2) eng('exec_revisar', { data: dia });
}
eng('exec_aviso_salvar', { etapa: e2, tipo: 'Rendimento baixo', texto: 'Tubulação abaixo do ritmo: precisamos de 15 m/dia para fechar até o prazo.' });
// Meio-fio concluído no último diário, com FVS aprovada: já aparece pronto para medir (login admin / Admin#Size26)
eng('exec_diario_salvar', { data: d(-1), motivo: 'dados de exemplo', lancamentos: [{ item_id: it['Meio-fio'], qtd: 188 }] });
{
  const fv = eng('fvs_listar').fvs.find(f => f.item_id === it['Meio-fio']).id, det = eng('fvs_detalhe', { id: fv }), chk = {};
  det.blocos.forEach((b, bi) => b.itens.forEach((x, ii) => { chk[bi + '.' + ii] = { r: 'O' }; }));
  eng('fvs_salvar', { id: fv, checklist: chk, alteracao_sim: 'Não' });
  const png = n => ({ nome: n, mime: 'image/png', b64: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64').toString('base64') });
  eng('fvs_anexo', { id: fv, tipo: 'base', arquivo: png('croqui-base.png') }); eng('fvs_anexo', { id: fv, tipo: 'exec', arquivo: png('croqui-execucao.png') });
  eng('fvs_enviar', { id: fv });
  eng('fvs_aprovar', { id: fv, pdf: { nome: 'FVS.pdf', b64: Buffer.from('%PDF-1.4 exemplo').toString('base64') } });
}
console.log('Execução: etapas', e1, e2, '· diários', eng('exec_dados').diarios.length);

// ---- orçamento da obra: Rede de Esgoto (2.500 m) e Rede de Água, com materiais, uma frente de execução consumindo o saldo e compras ----
{
  const o = (acao, x = {}) => adm(acao, { obra, ...x });
  const esg = o('orc_frente_salvar', { nome: 'Rede de Esgoto', descricao: 'Rede coletora, poços de visita e ligações domiciliares', preco: 380000, custo_direto: 240000, adm_local: 15000, indiretas: 18000, tributos: 30000 }).codigo;
  const agua = o('orc_frente_salvar', { nome: 'Rede de Água', preco: 120000, custo_direto: 80000, adm_local: 5000, indiretas: 6000, tributos: 9500 }).codigo;
  o('orc_itens_salvar', { frente: esg, itens: [
    { grupo: '1. Rede coletora', codigo: '1.1', servico: 'Rede coletora PVC DN 150', unidade: 'm', qtd: 2500, unit_material: 45, unit_mo: 18 },
    { grupo: '1. Rede coletora', codigo: '1.2', servico: 'Poço de visita de esgoto', unidade: 'un', qtd: 30, unit_material: 1200, unit_mo: 650 },
    { grupo: '2. Ligações', codigo: '2.1', servico: 'Ligação domiciliar de esgoto', unidade: 'un', qtd: 150, unit_material: 120, unit_mo: 80 }] });
  o('orc_itens_salvar', { frente: agua, itens: [{ codigo: '1.1', servico: 'Rede de água PEAD', unidade: 'm', qtd: 1800, unit_material: 22, unit_mo: 12 }, { codigo: '1.2', servico: 'Ligação domiciliar de água', unidade: 'un', qtd: 150, unit_material: 90, unit_mo: 60 }] });
  const mat = (descricao, unidade) => o('cad_salvar', { tipo: 'materiais', dados: { descricao, unidade, categoria: 'Saneamento' } }).item.codigo;
  const tubo = mat('Tubo PVC esgoto DN 150', 'm'), anel = mat('Anel de borracha DN 150', 'un'), tampao = mat('Tampão de ferro fundido', 'un'), pead = mat('Tubo PEAD 63mm', 'm');
  const its = o('orc_dados').frentes.find(f => f.codigo === esg).itens, [rede, pv] = its;
  o('orc_material_salvar', { orc_item: rede.id, material_cod: tubo, coef: 1.05 });
  o('orc_material_salvar', { orc_item: pv.id, material_cod: tampao, coef: 1 });
  o('orc_material_salvar', { frente: esg, material_cod: anel, qtd: 420 });
  o('orc_material_salvar', { orc_item: o('orc_dados').frentes.find(f => f.codigo === agua).itens[0].id, material_cod: pead, coef: 1.03 });
  const ex = eng('exec_etapa_salvar', { nome: 'Esgoto · Rua das Flores', local: 'Rua das Flores', frente: 'Rede de Esgoto', contrato_id: '-', itens: [
    { orc_item: rede.id, qtd_prevista: 250, inicio: d(-6), termino: d(10), fvs_modelo: 'FVS.03' }, { orc_item: pv.id, qtd_prevista: 4, inicio: d(-6), termino: d(10), fvs_modelo: 'FVS.03' }] }).codigo;
  const ie = eng('exec_dados').etapas.find(e => e.codigo === ex).itens;
  [-3, -2, -1].forEach(n => { const w = new Date(d(n) + 'T12:00').getDay(); if (w > 0 && w < 6) eng('exec_diario_salvar', { data: d(n), motivo: 'dados de exemplo', lancamentos: [{ item_id: ie[0].id, qtd: 30 }, { item_id: ie[1].id, qtd: n === -1 ? 1 : 0 }] }); });
  const pt = est('pedido_criar', { frente: 'Rede de Esgoto', prioridade: 'Alta', necessidade: d(5), itens: [{ descricao: 'Tubo PVC esgoto DN 150', material_cod: tubo, qtd: 1000, unidade: 'm' }, { descricao: 'Anel de borracha DN 150', material_cod: anel, qtd: 200, unidade: 'un' }] }).numero;
  com('orcamento_salvar', { pedido: pt, fornecedor_cod: 'F001', valor: '48.500,00', arquivo: PDF });
  com('orcamento_salvar', { pedido: pt, fornecedor_cod: 'F002', valor: '49.900,00', arquivo: PDF });
  com('orcamento_salvar', { pedido: pt, fornecedor_cod: 'F003', valor: '51.000,00', arquivo: PDF });
  com('pedido_definir', { numero: pt, orcamento: com('pedido_detalhe', { numero: pt }).orcamentos[0].id, condicao: 'Faturado', prazo_fat: 30 });
  ger('pedido_aprovar', { numero: pt });
  com('pedido_liberar', { numero: pt, previsao: d(2) });
  est('pedido_receber', { numero: pt, itens: { 1: 600, 2: 200 } });
  est('estoque_movimentar', { tipo: 'Saída', material_cod: tubo, qtd: 80, frente: 'Rede de Esgoto' });
  o('crono_salvar', { frentes: [{ codigo: esg, ini: d(-40), fim: d(80) }, { codigo: agua, ini: d(20), fim: d(110) }] });
  console.log('Orçamento da obra: frentes', esg, agua, '· frente de execução', ex, '· pedido', pt);
}
// obra AVA Residence importada das planilhas (orçamento R02, proposta e quantitativos)
console.log(G.rodar('criarObraAvaResidence()'));

// ---- Orçamentos · base de preços: planilha de composições no formato da planilha de orçamento + uma composição com auxiliar ----
{
  const MO = 'Mão de obra / serviço', L = [['ITEM', 'TIPO', 'CÓDIGO', 'DESCRIÇÃO', 'UN', 'QUANT. TOTAL', 'COEF.', 'CUSTO UNIT. (R$)']];
  const comp = (item, cod, desc, un, q, unit, itens) => { L.push([item, '', cod, desc, un, q, '', unit]); itens.forEach(([t, c, d, u, k, p]) => L.push([item, t, c, d, u, q * k, '', p])); };
  comp('1.1', 'LCMV', 'LIMPEZA DE CAMADA VEGETAL ESP. 0,15 M, COM REMOÇÃO E TRANSPORTE', 'M2', 10000, 2.6, [[MO, 'LCMV', 'LIMPEZA MECANIZADA DE CAMADA VEGETAL', 'M2', 1, 2.6]]);
  comp('1.2', 'EML', 'ESCAVAÇÃO DE MATERIAL LOCAL', 'M3', 8000, 18, [[MO, 'EML', 'ESCAVAÇÃO MECANIZADA DE MATERIAL LOCAL', 'M3', 1, 18]]);
  comp('2.1', '10014', 'GUIA DE SARJETA (MEIO-FIO) PRÉ-MOLDADA 1,00X0,12X0,20', 'M', 1000, 46.67, [['Material', 'PAV007', 'MEIO-FIO DE CONCRETO 100X30X12X10', 'M', 1, 27], ['Material', 'APVT20KL', 'ARGAMASSA PARA ASSENTAR E REVESTIR, MASSA PRONTA 20KG', 'SC', 0.05, 23.5], [MO, '1148', 'ASSENTAMENTO DE GUIA SARJETA (MEIO-FIO)', 'M', 1, 16], [MO, '1066', 'REJUNTAMENTO DE MEIO-FIO COM CONCRETO FCK 20', 'M', 1, 2.5]]);
  comp('2.2', '10034', 'BASE DE BRITA GRADUADA (BGS) ESP. 15 CM, MECANIZADA', 'M3', 500, 103.5, [['Material', 'PAV001', 'BASE SIMPLES – BGS, COM TRANSPORTE', 'M3', 1, 92], [MO, '1051', 'REGULARIZAÇÃO E COMPACTAÇÃO MECANIZADA DE BASE DE BRITA', 'M2', 1, 11.5]]);
  comp('2.3', '10011', 'PAVIMENTO INTERTRAVADO (PAVER) 8 CM, TIPO HOLANDÊS', 'M2', 3000, 80.99, [['Material', 'BL1202', 'PISO INTERTRAVADO (PAVER) HOLANDÊS CINZA 8 CM', 'M2', 1, 57.24], ['Material', 'CI003', 'AREIA FINA', 'M3', 0.05, 125], [MO, '1146', 'ASSENTAMENTO DE PAVER ESP. 8 CM', 'M2', 1, 17], [MO, '1064', 'ESPALHAMENTO DE AREIA DE SELAGEM', 'M2', 1, 0.5]]);
  comp('3.1', '10023', 'TUBO PEAD CORRUGADO DN400, PONTA E BOLSA, ASSENTADO', 'M', 800, 169.84, [['Material', 'TPEAD400', 'TUBO PEAD CORRUGADO DN400 (BARRA 6 M)', 'M', 1, 128.34], ['Material', 'CI003', 'AREIA FINA', 'M3', 0.12, 125], [MO, '1121', 'ASSENTAMENTO DE TUBO PEAD DN400', 'M', 1, 26.5]]);
  comp('3.2', '10006', 'BOCA DE LOBO 1,00X1,00X1,50 EM BLOCO ESTRUTURAL, COM GRELHA', 'UN', 20, 1564.23, [['Material', 'BLE14', 'BLOCO ESTRUTURAL DE CONCRETO 14X19X39', 'UN', 90, 4.9], ['Material', 'GRFF', 'GRELHA DE FERRO FUNDIDO 100X40', 'UN', 1, 520], ['Material', 'C05', 'CONCRETO USINADO FCK 30', 'M3', 0.35, 650], [MO, '1099', 'EXECUÇÃO DE BOCA DE LOBO', 'UN', 1, 360.73]]);
  const orc = [['ITEM', 'CÓD.', 'DESCRIÇÃO', 'UN'], ['1', '', 'MOVIMENTAÇÃO DE SOLO (TERRAPLENAGEM)'], ['2', '', 'PAVIMENTAÇÃO'], ['3', '', 'REDE DE DRENAGEM PLUVIAL']];
  const r = adm('base_importar', { abas: [{ nome: 'Orçamento', linhas: orc }, { nome: 'Composições', linhas: L }], aplicar: true, data_preco: d(-200), fonte: 'Planilha · exemplo' });
  adm('base_insumo_salvar', { insumo: { codigo: 'RETRO', descricao: 'RETROESCAVADEIRA COM OPERADOR', unidade: 'H', tipo: 'Equipamento', preco: 185, data_preco: d(-20), fonte: 'Cotação Locadora Sul' } });
  adm('base_composicao_salvar', { composicao: { descricao: 'MEIO-FIO COM ABERTURA DE VALA E REATERRO', unidade: 'M', grupo: 'Pavimentação' }, itens: [{ ref_tipo: 'C', ref: '10014', coef: 1 }, { ref: 'RETRO', coef: 0.015 }, { ref: 'EML', coef: 0.06, preco: 21 }] });
  adm('base_precos', { itens: [{ codigo: 'PAV007', preco: 28.9 }, { codigo: 'BL1202', preco: 59.1 }], data_preco: d(-10), origem: 'Cotação Pré-Moldados Sul' });
  adm('admin_usuario_salvar', { usuario: { nome: 'Olívia Orçamentista', login: 'orc', ativo: true, orcamentos: 'Gerir' }, senha: 'Obra#Teste26', acessos: [] });
  console.log('Base de preços:', r.msg, '· login orc / Obra#Teste26 (só Orçamentos, sem obra)');
  // orçamentos de clientes: um em elaboração, um enviado e um aprovado (pronto para "Gerar obra")
  const prop = (cliente, empreendimento, local, itens, extra = {}) => adm('prop_salvar', { proposta: { cliente, empreendimento, local, bdi_pct: 18, bdi_base: 'servicos', gestao_pct: 6, gestao_base: 'total', prazo_txt: '6 meses a partir da ordem de serviço', pagamento_txt: 'Medições mensais, pagamento em 15 dias', ...extra }, itens }).id;
  const p1 = prop('Construtora Mar Azul Ltda', 'Loteamento Dunas · infraestrutura', 'Xangri-lá/RS', [{ tipo: 'E', descricao: 'Terraplenagem' }, { comp_cod: 'LCMV', qtd: 12000, unidade: 'M2' }, { comp_cod: 'EML', qtd: 6500, unidade: 'M3' },
    { tipo: 'E', descricao: 'Pavimentação' }, { comp_cod: '10034', qtd: 900, unidade: 'M3' }, { comp_cod: '10011', qtd: 6000, unidade: 'M2' }, { comp_cod: '10014', qtd: 2400, unidade: 'M' },
    { tipo: 'E', descricao: 'Drenagem pluvial' }, { comp_cod: '10023', qtd: 1100, unidade: 'M' }, { comp_cod: '10006', qtd: 24, unidade: 'UN' }, { tipo: 'E', descricao: 'Canteiro' }, { descricao: 'Mobilização e canteiro de obras', unidade: 'VB', qtd: 1, unit_mat: 18000, unit_mo: 22000 }]);
  adm('prop_cronograma', { id: p1, etapas: [{ codigo: '1', ini: d(30), fim: d(75) }, { codigo: '2', ini: d(70), fim: d(190) }, { codigo: '3', ini: d(60), fim: d(150) }, { codigo: '4', ini: d(25), fim: d(200) }] });
  adm('prop_status', { id: p1, op: 'enviar' });
  const p2 = prop('Incorporadora Litoral', 'Condomínio Brisa · pavimentação', 'Capão da Canoa/RS', [{ tipo: 'E', descricao: 'Pavimentação' }, { comp_cod: '10011', qtd: 3200, unidade: 'M2' }, { comp_cod: 'CMP-0001', qtd: 1400, unidade: 'M' }]);
  adm('prop_status', { id: p2, op: 'aprovar' });
  prop('Prefeitura de Osório', 'Drenagem Rua das Palmeiras', 'Osório/RS', [{ tipo: 'E', descricao: 'Drenagem' }, { comp_cod: '10023', qtd: 380, unidade: 'M' }, { comp_cod: '10006', qtd: 8, unidade: 'UN' }], { bdi_pct: 22, gestao_pct: 0 });
  // localização das outras obras no mapa do Início
  adm('admin_dados').obras.filter(o => !o.lat).forEach((o, n) => adm('admin_obra_salvar', { id: o.id, nome: o.nome, endereco: o.endereco, ativa: true, lat: [-29.64, -29.89][n % 2], lng: [-49.99, -50.27][n % 2] }));
}

const local = u => u.replace(/^https?:\/\/[^/]+\/[^?]*/, 'http://localhost:5173/fornecedor.html');
console.log('Portal (cotação PB-0002):', local(com('forn_link', { fornecedor: 'F003', numeros: [p2] }).url));
console.log('Portal (compra PB-0005):', local(com('forn_link', { fornecedor: 'F001', numeros: [p5] }).url));
console.log('Dados de exemplo prontos:', fin('pedidos_listar').pedidos.map(p => p.numero + ' ' + p.situacao).join(' | '));

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const raiz = path.join(__dirname, '..', 'app');
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api')) {
    let b = '';
    req.on('data', c => { b += c; });
    req.on('end', () => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(G.doPost({ postData: { contents: b } }).getContent());
      }, 250);
    });
    return;
  }
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end("const API_URL = '/api'; const FIREBASE_CFG = { projectId: 'demo', apiKey: '', messagingSenderId: '', appId: '', vapid: '' };"); }
  let f = path.join(raiz, u === '/' ? 'index.html' : u);
  if (f.startsWith(raiz) && fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');   // pasta = index.html, como o GitHub Pages (portal do cliente c/<slug>/)
  if (!f.startsWith(raiz) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(5173, () => console.log('http://localhost:5173'));
