// Nota lida pelo código de barras da DANFE no recebimento: chave validada, conferida com o pedido e avisos no sino.
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

const PDF = { nome: 'orc.pdf', mime: 'application/pdf', b64: Buffer.from('%PDF-1.4 teste').toString('base64') };

function preparar() {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const tk = call('login', { login: 'admin', senha }).token, adm = (acao, d = {}) => call(acao, { token: tk, ...d });
  const obra = adm('admin_obra_criar', { contrato: { nome: 'contrato-assinado.pdf', mime: 'application/pdf', b64: 'JVBERi0xLjQ=' }, nome: 'Prime Beach', sigla: 'PB' }).id;
  adm('admin_config_salvar', { config: { MIN_ORCAMENTOS: 1, REGRAS_ORCAMENTO: '' } });
  const perfis = adm('admin_dados').perfis, p = perfis.find(x => x.perfil === 'Estoque');
  adm('admin_usuario_salvar', { usuario: { nome: 'mestre', login: 'mestre', ativo: true }, senha: 'Obra#Teste26', acessos: [{ obra_id: obra, perfil: 'Estoque', permissoes: p.permissoes }] });
  const tm = call('login', { login: 'mestre', senha: 'Obra#Teste26' }).token;
  const com = (acao, d = {}) => adm(acao, { obra, ...d }), est = (acao, d = {}) => call(acao, { token: tm, obra, ...d });
  com('cad_salvar', { tipo: 'fornecedores', dados: { nome: 'Casa do Construtor', cnpj: '11.222.333/0001-81', email: 'vendas@casa.com' } });
  return { com, est };
}
// pedido aprovado e liberado: 100 sc × R$ 50 + 10 m³ × R$ 120 = R$ 6.200
function pedidoLiberado(t) {
  const { numero } = t.est('pedido_criar', { itens: [{ descricao: 'Cimento', qtd: 100, unidade: 'sc' }, { descricao: 'Areia', qtd: 10, unidade: 'm³' }] });
  t.com('orcamento_salvar', { pedido: numero, fornecedor_cod: 'F001', valor: '6200', arquivo: PDF });
  const orc = t.com('pedido_detalhe', { numero }).orcamentos[0].id;
  t.com('pedido_definir', { numero, orcamento: orc, condicao: 'Faturado', prazo_fat: 30, valores: { 1: '50', 2: '120' }, aprovar: true });
  t.com('pedido_liberar', { numero });
  return numero;
}
// chave de 44 números com o dígito verificador certo (módulo 11, pesos 2 a 9)
function chave({ uf = '43', aamm, cnpj = '11222333000181', mod = '55', serie = '1', nnf }) {
  if (!aamm) { const d = new Date(); aamm = String(d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2); }
  const c = uf + aamm + cnpj + mod + serie.padStart(3, '0') + String(nnf).padStart(9, '0') + '1' + '12345678';
  let s = 0;
  for (let i = 42, p = 2; i >= 0; i--, p = p === 9 ? 2 : p + 1) s += Number(c[i]) * p;
  const r = s % 11;
  return c + (r < 2 ? 0 : 11 - r);
}

test('chave errada (tamanho ou dígito) para antes de gravar o recebimento', () => {
  const t = preparar(), n = pedidoLiberado(t);
  assert.throws(() => t.est('pedido_receber', { numero: n, itens: { 1: 10 }, nf_chave: '123' }), /44 números/);
  const k = chave({ nnf: 777 }), ruim = k.slice(0, 43) + (Number(k[43]) + 1) % 10;
  assert.throws(() => t.est('pedido_receber', { numero: n, itens: { 1: 10 }, nf_chave: ruim }), /dígito final/);
  assert.equal(t.com('pedido_detalhe', { numero: n }).itens[0].qtd_recebida, 0);   // nada foi gravado
});

test('nota que confere: número vem da chave, vai ao financeiro e não gera aviso', () => {
  const t = preparar(), n = pedidoLiberado(t);
  const k = chave({ nnf: 4521, serie: '2' });
  const r = t.est('pedido_receber', { numero: n, itens: { 1: 100, 2: 10 }, nf_chave: k.replace(/(\d{4})/g, '$1 '), nf_valor: '6.200,00' });
  assert.deepEqual(r.alertas, []);
  assert.doesNotMatch(r.msg, /ATENÇÃO/);
  const d = t.com('pedido_detalhe', { numero: n });
  assert.equal(d.pedido.nf_numero, '4521');
  assert.equal(d.pedido.nf_chave, 'NFe' + k);
  assert.equal(d.pedido.nf_valor, 6200);
  assert.equal(d.pedido.fin, 'A pagar');
  assert.ok(!d.pedido.nf_alerta);
  assert.match(d.pedido.historico, /Nota 4521 \(série 2\) lida pelo código de barras.*confere com o pedido/);
  assert.equal(d.recebimentos[0].nf, '4521');
  assert.equal(t.est('pedido_detalhe', { numero: n }).pedido.nf_valor, '');   // quem não vê valores não vê o valor da nota
  assert.ok(!t.com('notificacoes').itens.some(i => i.etapa === 'nf_conf'));
});

test('entrega parcial: a nota pode ser só do que chegou agora', () => {
  const t = preparar(), n = pedidoLiberado(t);
  const r = t.est('pedido_receber', { numero: n, itens: { 1: 100 }, nf_chave: chave({ nnf: 10 }), nf_valor: '5000' });   // 100 × 50
  assert.deepEqual(r.alertas, []);
});

test('nota de outro fornecedor, valor diferente, repetida e antiga: avisa Compras, recebedor vê sem valores; resolver tira o aviso', () => {
  const t = preparar(), n = pedidoLiberado(t), n2 = pedidoLiberado(t);
  const k1 = chave({ nnf: 900 });
  t.est('pedido_receber', { numero: n, itens: { 1: 100, 2: 10 }, nf_chave: k1, nf_valor: '6200', arquivo: PDF });
  // outra empresa (raiz do CNPJ diferente) e valor errado
  const k2 = chave({ nnf: 901, cnpj: '99888777000155' });
  const r = t.est('pedido_receber', { numero: n2, itens: { 1: 100, 2: 10 }, nf_chave: k2, nf_valor: '6900' });
  assert.equal(r.alertas.length, 2);
  assert.match(r.alertas[0], /CNPJ 99\.888\.777\/0001-55, que não é o do fornecedor do pedido \(Casa do Construtor\)/);
  assert.match(r.alertas[1], /valor da nota R\$ •••, pedido R\$ •••/);   // mestre não vê os valores
  assert.match(r.msg, /ATENÇÃO: .*Compras foi avisado/);
  let det = t.com('pedido_detalhe', { numero: n2 });
  assert.match(det.pedido.nf_alerta, /NF 901: valor da nota R\$ 6\.900,00, pedido R\$ 6\.200,00/);
  assert.match(t.est('pedido_detalhe', { numero: n2 }).pedido.nf_alerta, /R\$ •••/);
  const av = t.com('notificacoes').itens.find(i => i.etapa === 'nf_conf');
  assert.equal(av.numero, n2);
  assert.match(av.texto, /Nota com diferença — NF 901/);
  assert.ok(!t.est('notificacoes').itens.some(i => i.etapa === 'nf_conf'));   // o recebedor não recebe esse aviso

  // a mesma nota lançada em outro pedido (Corrigir NF) e nota antiga
  const n3 = pedidoLiberado(t);
  const r3 = t.com('pedido_nf', { numero: n3, nf_chave: k1 });
  assert.match(r3.alertas.join(), /já foi lançada no pedido PB-0001/);
  const r4 = t.com('pedido_nf', { numero: n3, nf_chave: chave({ nnf: 55, aamm: '2401' }) });
  assert.match(r4.alertas.join(), /emitida em 01\/2024/);
  assert.equal(t.com('pedido_detalhe', { numero: n3 }).pedido.nf_chave.split(' ').length, 2);   // as duas notas ficam guardadas

  // Compras resolve: precisa contar o que fez; o aviso some e fica no histórico
  assert.throws(() => t.com('pedido_nf_ok', { numero: n2 }), /Conte o que foi resolvido/);
  assert.throws(() => t.est('pedido_nf_ok', { numero: n2, obs: 'x' }), /permissão/);
  t.com('pedido_nf_ok', { numero: n2, obs: 'fornecedor vai emitir nota de devolução' });
  det = t.com('pedido_detalhe', { numero: n2 });
  assert.ok(!det.pedido.nf_alerta);
  assert.match(det.pedido.historico, /Diferença da nota resolvida: fornecedor vai emitir nota de devolução/);
  assert.ok(!t.com('notificacoes').itens.some(i => i.etapa === 'nf_conf' && i.numero === n2));
});

test('mesma empresa, outra filial (mesma raiz do CNPJ) e fornecedor sem CNPJ: não é diferença', () => {
  const t = preparar(), n = pedidoLiberado(t);
  assert.deepEqual(t.est('pedido_receber', { numero: n, itens: { 1: 10 }, nf_chave: chave({ nnf: 1, cnpj: '11222333000262' }) }).alertas, []);
  t.com('cad_salvar', { tipo: 'fornecedores', dados: { nome: 'Depósito Sul' } });
  const { numero } = t.est('pedido_criar', { itens: [{ descricao: 'Brita', qtd: 5, unidade: 'm³' }] });
  t.com('orcamento_salvar', { pedido: numero, fornecedor_cod: 'F002', valor: '500', arquivo: PDF });
  t.com('pedido_definir', { numero, orcamento: t.com('pedido_detalhe', { numero }).orcamentos[0].id, condicao: 'Faturado', prazo_fat: 30, aprovar: true });
  t.com('pedido_liberar', { numero });
  assert.deepEqual(t.est('pedido_receber', { numero, itens: { 1: 5 }, nf_chave: chave({ nnf: 2, cnpj: '55444333000122' }) }).alertas, []);
});
