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
  const esg = o('orc_frente_salvar', { nome: 'Rede de Esgoto', descricao: 'Rede coletora, poços de visita e ligações domiciliares' }).codigo;
  const agua = o('orc_frente_salvar', { nome: 'Rede de Água' }).codigo;
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
  console.log('Orçamento da obra: frentes', esg, agua, '· frente de execução', ex, '· pedido', pt);
}
// obra AVA Residence importada das planilhas (orçamento R02, proposta e quantitativos)
console.log(G.rodar('criarObraAvaResidence()'));

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
  const f = path.join(raiz, u === '/' ? 'index.html' : u);
  if (!f.startsWith(raiz) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(5173, () => console.log('http://localhost:5173'));
