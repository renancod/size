// Servidor local de demonstração: app + API simulada com dados de exemplo.
// Uso: node test/servidor.js  → http://localhost:5173  (login: admin / admin123 · compras, estoque, fin / senha123)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { criarGAS } = require('./gas-mock');

const G = criarGAS();
G.setup();
const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(acao + ': ' + r.erro); return r.dados; };
let tk = call('login', { login: 'admin', senha }).token;
call('trocarSenha', { token: tk, atual: senha, nova: 'admin123' });
const adm = (acao, d = {}) => call(acao, { token: tk, ...d });

['Cimento CP-II 50kg|sc|Estrutura', 'Areia média|m³|Agregados', 'Brita 1|m³|Agregados', 'Vergalhão CA-50 10mm|barra|Estrutura', 'Tijolo 6 furos|un|Alvenaria',
  'Cabo flexível 2,5mm|rolo|Elétrica', 'Tubo PVC 100mm|barra|Hidráulica', 'Argamassa AC-II|sc|Revestimentos', 'Tinta acrílica branca 18L|lata|Pintura']
  .forEach(l => { const [descricao, unidade, categoria] = l.split('|'); adm('admin_padrao_salvar', { descricao, unidade, categoria }); });
const obra = adm('admin_obra_criar', { nome: 'Prime Beach', sigla: 'PB', endereco: 'Av. Beira-Mar, 1000 — Capão da Canoa/RS' }).id;
adm('admin_obra_criar', { nome: 'Residencial Jardins', sigla: 'RJ', endereco: 'Rua das Flores, 50' });
adm('admin_config_salvar', { config: { REGRAS_ORCAMENTO: '5000:2; 20000:3' } });
const perfis = adm('admin_dados').perfis;
const usuario = (login, nome, perfil) => {
  adm('admin_usuario_salvar', { usuario: { nome, login, ativo: true }, senha: 'senha123', acessos: [{ obra_id: obra, perfil, permissoes: perfis.find(p => p.perfil === perfil).permissoes }] });
  const s = call('login', { login, senha: 'senha123' });
  call('trocarSenha', { token: s.token, atual: 'senha123', nova: 'senha123' });
  return (acao, d = {}) => call(acao, { token: s.token, obra, ...d });
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
// ---- execução / diário de obra (login: eng · mestre / senha123) ----
adm('admin_obra_salvar', { id: obra, nome: 'Prime Beach', endereco: 'Av. Beira-Mar, 1000 — Capão da Canoa/RS', ativa: true, lat: '-29.746', lng: '-50.009' });
const eng = usuario('eng', 'Ernesto Engenheiro', 'Engenheiro');
const mestre = usuario('mestre', 'Marcos Encarregado', 'Encarregado');
eng('exec_equipe_salvar', { nome: 'Equipe Pavimentação', pessoas: 8, encarregado: 'Marcos' });
eng('exec_equipe_salvar', { nome: 'Equipe Drenagem', pessoas: 6 });
const e1 = eng('exec_etapa_salvar', { nome: 'Pavimentação · Rua A', local: 'Rua A, estaca 0 a 30', frente: 'Canteiro', itens: [
  { servico: 'Base', qtd_prevista: 600, inicio: d(-12), termino: d(6) },
  { servico: 'Asfalto (CBUQ)', qtd_prevista: 600, inicio: d(-4), termino: d(12) },
  { servico: 'Meio-fio', qtd_prevista: 300, inicio: d(-12), termino: d(4) }] }).codigo;
const e2 = eng('exec_etapa_salvar', { nome: 'Drenagem pluvial · Rua B', local: 'Rua B', itens: [
  { servico: 'Tubulação de concreto DN 600', qtd_prevista: 200, inicio: d(-15), termino: d(2) },
  { servico: 'Poço de visita', qtd_prevista: 8, inicio: d(-15), termino: d(4) },
  { servico: 'Boca de lobo', qtd_prevista: 10, inicio: d(-6), termino: d(8) }] }).codigo;
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
console.log('Execução: etapas', e1, e2, '· diários', eng('exec_dados').diarios.length);

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
  if (u === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end("const API_URL = '/api';"); }
  const f = path.join(raiz, u === '/' ? 'index.html' : u);
  if (!f.startsWith(raiz) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(5173, () => console.log('http://localhost:5173'));
