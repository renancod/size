// SINAPI (Caixa): importação em lotes numa planilha separada, consulta, uso no orçamento (regime sem/com desoneração, custo congelado),
// atualização de preços, cópia para a base da Size e a conferência diária do mês novo na Caixa.
const test = require('node:test');
const assert = require('node:assert');
const { criarGAS } = require('./gas-mock');

function preparar() {
  const G = criarGAS();
  G.setup();
  const senha = G._logs.join('\n').match(/SENHA PROVISÓRIA: (\S+)/)[1];
  const call = (acao, d = {}) => { const r = G.chamar({ acao, ...d }); if (!r.ok) throw new Error(r.erro); return r.dados; };
  const tk = call('login', { login: 'admin', senha }).token;
  const adm = (acao, d = {}) => call(acao, { token: tk, ...d });
  return { G, adm, call, tk };
}
/* um mês do SINAPI (como o app manda depois de ler o arquivo da Caixa) */
function importar(t, mes, areia) {
  t.adm('sinapi_importar', { etapa: 'inicio', mes, uf: 'RS', origem: 'teste' });
  t.adm('sinapi_importar', { etapa: 'lote', tab: 'insumos', linhas: [['88316', 'SERVENTE COM ENCARGOS COMPLEMENTARES', 'H', 'MÃO DE OBRA', 'C', 25, 22], ['370', 'AREIA MEDIA', 'M3', 'MATERIAL', 'C', areia, areia]] });
  // composição 94962: 2 m³ de areia + 4 h de servente; custo e divisão por categoria calculados pelo app
  const sd = 2 * areia + 4 * 25, cd = 2 * areia + 4 * 22;
  t.adm('sinapi_importar', { etapa: 'lote', tab: 'composicoes', linhas: [['94962', 'CONCRETO MAGRO PARA LASTRO', 'M3', 'Concreto', 'COM CUSTO', sd, cd, 2 * areia, 100, 0, 0, 2 * areia, 88, 0, 0]] });
  t.adm('sinapi_importar', { etapa: 'lote', tab: 'itens', linhas: [['94962', 'I', '370', 2], ['94962', 'I', '88316', 4]] });
  return t.adm('sinapi_importar', { etapa: 'fim' });
}

test('importação em lotes: planilha separada, índice, composição aberta e histórico do mês seguinte', () => {
  const t = preparar();
  assert.equal(t.adm('sinapi_info').mes, '');
  assert.match(importar(t, '2026-07', 100).msg, /SINAPI RS 07\/2026 importado: 2 insumos e 1 composição · primeira importação/);
  const info = t.adm('sinapi_info');
  assert.deepEqual([info.mes, info.insumos, info.composicoes, info.itens], ['2026-07', 2, 1, 2]);
  assert.notEqual(t.G.rodar(`PropertiesService.getScriptProperties().getProperty('SINAPI_ID')`), t.G.rodar(`PropertiesService.getScriptProperties().getProperty('CENTRAL_ID')`));
  const ix = t.adm('sinapi_indice');
  assert.deepEqual(ix.composicoes[0].slice(0, 7), ['94962', 'CONCRETO MAGRO PARA LASTRO', 'M3', 'Concreto', 'COM CUSTO', 300, 288]);
  assert.deepEqual(ix.insumos.map(i => i[0]), ['88316', '370']);
  const c = t.adm('sinapi_composicao', { codigo: '94962' });
  assert.deepEqual(c.itens.map(i => [i.codigo, i.coef, i.preco_sd, i.preco_cd]), [['370', 2, 100, 100], ['88316', 4, 25, 22]]);
  // várias de uma vez (Excel do orçamento): a que não está no mês fica de fora, sem erro
  const v = t.adm('sinapi_composicao', { codigos: ['94962', '99999'] });
  assert.deepEqual(v.composicoes.map(x => [x.composicao.codigo, x.itens.length]), [['94962', 2]]);
  // a segunda abertura vem da memória do servidor, igual à primeira
  const r2 = t.G.chamar({ acao: 'sinapi_composicao', token: t.tk, codigo: '94962' });
  assert.match(r2.t.cache, /s/);
  assert.deepEqual(r2.dados.itens.map(i => i.codigo), ['370', '88316']);
  // mês seguinte: areia sobe 10%; o histórico guarda o que mudou
  assert.match(importar(t, '2026-08', 110).msg, /1 insumo mudou de preço desde 07\/2026 \(média \+10%\)/);
  assert.equal(t.adm('sinapi_info').mes, '2026-08');
  assert.equal(t.adm('sinapi_indice').composicoes[0][5], 320);
  // quem só consulta não importa
  t.adm('admin_usuario_salvar', { usuario: { nome: 'vend', login: 'vend', ativo: true, orcamentos: 'Ver' }, senha: 'Senha-Forte-26', acessos: [] });
  const tk = t.call('login', { login: 'vend', senha: 'Senha-Forte-26' }).token;
  assert.equal(t.call('sinapi_indice', { token: tk }).mes, '2026-08');
  assert.throws(() => t.call('sinapi_importar', { token: tk, etapa: 'inicio', mes: '2026-09' }), /consultar/);
});

test('orçamento: item do SINAPI no regime escolhido, custo congelado e "atualizar preços" puxa o mês novo', () => {
  const t = preparar();
  importar(t, '2026-07', 100);
  const id = t.adm('prop_salvar', { proposta: { cliente: 'Mar Azul', empreendimento: 'Dunas', sinapi_regime: 'cd' }, itens: [
    { tipo: 'E', descricao: 'Fundação' }, { comp_cod: '94962', fonte: 'SINAPI', unidade: 'M3', qtd: 10, descricao: 'CONCRETO MAGRO PARA LASTRO' },
    { comp_cod: '370', fonte: 'SINAPI-INSUMO', unidade: 'M3', qtd: 5, descricao: 'AREIA MEDIA' }] }).id;
  let d = t.adm('prop_detalhe', { id });
  assert.equal(d.proposta.sinapi_regime, 'cd');
  const [c, a] = d.itens.filter(i => i.tipo === 'I');
  assert.deepEqual([c.fonte, c.unit_mat, c.unit_mo, c.custo], ['SINAPI', 200, 88, 2880]);   // desonerado: MO 88
  assert.deepEqual([a.fonte, a.unit_mat, a.custo], ['SINAPI-INSUMO', 100, 500]);
  importar(t, '2026-08', 110);
  assert.equal(t.adm('prop_detalhe', { id }).itens[1].unit_mat, 200);                          // congelado
  t.adm('prop_salvar', { proposta: { id, cliente: 'Mar Azul', empreendimento: 'Dunas', sinapi_regime: 'sd' } });
  assert.match(t.adm('prop_precos', { id }).msg, /2 itens atualizados/);
  d = t.adm('prop_detalhe', { id });
  assert.deepEqual([d.itens[1].unit_mat, d.itens[1].unit_mo, d.itens[2].unit_mat], [220, 100, 110]);   // agosto, sem desoneração
  // vira obra: o serviço entra com a anotação do SINAPI
  t.adm('prop_status', { id, op: 'aprovar' });
  const obra = t.adm('prop_gerar_obra', { id, sigla: 'DU' }).obra_id;
  assert.match(t.adm('orc_dados', { obra }).frentes.find(f => f.nome === 'Fundação').itens[0].obs, /^SINAPI 94962/);
});

test('copiar composição do SINAPI para a base da Size (insumos com os coeficientes e a origem anotada)', () => {
  const t = preparar();
  importar(t, '2026-07', 100);
  assert.match(t.adm('sinapi_para_base', { codigo: '94962', regime: 'sd' }).msg, /copiada para a base da Size como SINAPI-94962 \(2 insumos, 2 novos\)/);
  const D = t.adm('base_dados'), comp = D.composicoes.find(x => x.codigo === 'SINAPI-94962');
  assert.equal(comp.fonte, 'SINAPI RS 07/2026 · não desonerado');
  assert.equal(comp.custo.total, 300);
  assert.equal(D.insumos.find(i => i.codigo === 'SINAPI-88316').tipo, 'Mão de obra');
  // de novo, no mês seguinte: atualiza o preço do insumo (com histórico), não duplica
  importar(t, '2026-08', 110);
  assert.match(t.adm('sinapi_para_base', { codigo: '94962', regime: 'sd' }).msg, /2 insumos\)/);
  assert.equal(t.adm('base_dados').composicoes.find(x => x.codigo === 'SINAPI-94962').custo.total, 320);
});

test('conferência diária: acha o mês novo na Caixa, avisa no sino de quem gerencia e o app baixa o arquivo em partes', () => {
  const t = preparar();
  const ant = m => { let y = +m.slice(0, 4), n = +m.slice(5, 7) - 1; if (n < 1) { n = 12; y--; } return y + '-' + String(n).padStart(2, '0'); };
  const hoje = new Date().toLocaleDateString('sv-SE').slice(0, 7), novo = ant(hoje);
  importar(t, ant(novo), 100);
  const pedidos = [];
  t.G.UrlFetchApp.fetch = (url, op) => {
    pedidos.push(url);
    const tem = url.indexOf('SINAPI-' + novo + '-formato-xlsx.zip') > 0;
    return { getResponseCode: () => tem ? (op && op.headers ? 206 : 200) : 404, getHeaders: () => ({ 'Content-Type': 'application/x-zip-compressed' }),
      getBlob: () => t.G.Utilities.newBlob('PK-arquivo-falso', 'application/zip', 'x.zip'), getContentText: () => '' };
  };
  assert.equal(t.G.rodar('sinapiVerificar()'), 'novo ' + novo);
  assert.ok(pedidos.some(u => /_Retificacao01\.zip$/.test(u)));        // procura também as retificações
  assert.equal(t.adm('sinapi_info').novo.mes, novo);
  assert.ok(t.adm('notificacoes').itens.some(i => i.etapa === 'sinapi' && i.texto.indexOf('publicado pela Caixa') > 0));
  const b = t.adm('sinapi_baixar', { mes: novo, parte: 0 });
  assert.deepEqual([b.partes, Buffer.from(b.b64, 'base64').toString()], [1, 'PK-arquivo-falso']);
  // depois de importar o mês novo, o aviso some
  importar(t, novo, 105);
  assert.equal(t.adm('sinapi_info').novo, null);
  assert.ok(!t.adm('notificacoes').itens.some(i => i.etapa === 'sinapi'));
});

test('Caixa recusa o servidor: o motivo aparece no erro e o aviso do mês novo segue o calendário', () => {
  const t = preparar();
  importar(t, '2025-01', 100);
  t.G.UrlFetchApp.fetch = () => ({ getResponseCode: () => 403, getHeaders: () => ({ 'Content-Type': 'text/html; charset=utf-8' }), getContentText: () => '<html>bloqueado</html>' });
  assert.equal(t.G.rodar('sinapiVerificar()'), 'bloqueado');
  assert.throws(() => t.adm('sinapi_baixar', { mes: '2025-02', parte: 0 }), /recusou o servidor \(403 text\/html/);
  const d = new Date(), ant = m => { let y = +m.slice(0, 4), n = +m.slice(5, 7) - 1; if (n < 1) { n = 12; y--; } return y + '-' + String(n).padStart(2, '0'); };
  const m = d.toLocaleDateString('sv-SE').slice(0, 7), esperado = d.getDate() >= 12 ? ant(m) : ant(ant(m));
  const n = t.adm('sinapi_info').novo;
  assert.deepEqual([n.mes, n.confirmado], [esperado, false]);
  assert.ok(t.adm('notificacoes').itens.some(i => i.etapa === 'sinapi' && /deve ter saído/.test(i.texto)));
});
test('editor de composição: insumo do SINAPI vem para a base no regime escolhido (sem duplicar)', () => {
  const t = preparar();
  importar(t, '2026-07', 100);
  assert.match(t.adm('sinapi_insumo_para_base', { codigo: '88316', regime: 'cd' }).msg, /Insumo trazido do SINAPI: SINAPI-88316 · R\$ 22,00\/H/);
  let ins = t.adm('base_dados').insumos.find(i => i.codigo === 'SINAPI-88316');
  assert.deepEqual([ins.preco, ins.tipo, ins.fonte], [22, 'Mão de obra', 'SINAPI RS 07/2026 · desonerado']);
  assert.match(t.adm('sinapi_insumo_para_base', { codigo: '88316', regime: 'sd' }).msg, /atualizado na base/);
  assert.equal(t.adm('base_dados').insumos.filter(i => i.codigo === 'SINAPI-88316').length, 1);
  assert.equal(t.adm('base_dados').insumos.find(i => i.codigo === 'SINAPI-88316').preco, 25);
  t.adm('base_composicao_salvar', { composicao: { descricao: 'Ensaio de compactação', unidade: 'un', grupo: 'Controle tecnológico' }, itens: [{ ref: 'SINAPI-88316', coef: 2 }] });
  assert.equal(t.adm('base_dados').composicoes.find(c => c.descricao === 'Ensaio de compactação').custo.total, 50);
  assert.throws(() => t.adm('sinapi_insumo_para_base', { codigo: '999' }), /não está no SINAPI/);
});