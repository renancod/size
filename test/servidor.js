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
com('pedido_definir', { numero: p4, orcamento: com('pedido_detalhe', { numero: p4 }).orcamentos[0].id, condicao: 'Faturamento direto', aprovar: true });
const p5 = novo('Fundação', 'Urgente', 2, [['Cimento CP-II 50kg', 60, 'sc'], ['Brita 1', 6, 'm³']]);
com('orcamento_salvar', { pedido: p5, fornecedor_cod: 'F001', valor: '3300', arquivo: PDF });
com('pedido_definir', { numero: p5, orcamento: com('pedido_detalhe', { numero: p5 }).orcamentos[0].id, condicao: 'Faturado', prazo_fat: 28, aprovar: true });
com('pedido_liberar', { numero: p5, previsao: d(1) });
est('pedido_receber', { numero: p5, itens: { 1: 40 } });
const p6 = novo('Pintura', 'Normal', 20, [['Tinta acrílica branca 18L', 12, 'lata']]);
com('orcamento_salvar', { pedido: p6, fornecedor_cod: 'F001', valor: '2880', arquivo: PDF });
com('pedido_definir', { numero: p6, orcamento: com('pedido_detalhe', { numero: p6 }).orcamentos[0].id, condicao: 'Faturado', prazo_fat: 30, aprovar: true });
com('pedido_liberar', { numero: p6 });
est('pedido_receber', { numero: p6, itens: { 1: 12 }, nf_numero: '4521', nf_data: d(-20), nf: PDF });
call('pedido_detalhe', { token: tk, obra, numero: p6 });
est('cad_salvar', { tipo: 'materiais', dados: { codigo: 'M0003', descricao: 'Brita 1', unidade: 'm³', categoria: 'Agregados', estoque_min: 20 } });
est('estoque_movimentar', { tipo: 'Saída', material_cod: 'M0001', qtd: 25, frente: 'Fundação' });
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
