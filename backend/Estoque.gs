/**
 * Estoque da obra: cada linha da aba Estoque é um movimento com quantidade COM SINAL
 * (Entrada +, Saída −, Ajuste ±). Saldo = soma dos movimentos por material.
 */
function chaveMat_(m) { return m.material_cod ? String(m.material_cod) : '#' + norm_(m.descricao); }

function saldos_(ctx) {
  const s = {};
  obraTab_(ctx, 'Estoque').all().forEach(m => {
    const k = chaveMat_(m);
    const x = s[k] = s[k] || { chave: k, material_cod: m.material_cod || '', descricao: m.descricao, unidade: m.unidade, saldo: 0, entradas: 0, saidas: 0, ultimo: '' };
    const qn = num_(m.qtd);
    x.saldo += qn;
    if (qn > 0) x.entradas += qn; else x.saidas -= qn;
    x.ultimo = fmtVal_(m.data);
  });
  return s;
}

function estoqueSaldo_(q, ctx) {
  const s = saldos_(ctx);
  obraTab_(ctx, 'Materiais').all().forEach(mt => {
    const min = num_(mt.estoque_min), x = s[String(mt.codigo)];
    if (x) { x.estoque_min = min; x.descricao = mt.descricao; x.unidade = mt.unidade || x.unidade; x.categoria = mt.categoria; }
    else if (min > 0) s[String(mt.codigo)] = { chave: String(mt.codigo), material_cod: mt.codigo, descricao: mt.descricao, unidade: mt.unidade, categoria: mt.categoria, saldo: 0, entradas: 0, saidas: 0, ultimo: '', estoque_min: min };
  });
  return { itens: Object.keys(s).map(k => s[k]).sort((a, b) => String(a.descricao).localeCompare(String(b.descricao))) };
}

function estoqueExtrato_(q, ctx) {
  const k = String(q.chave || '');
  return { movimentos: obraTab_(ctx, 'Estoque').all().filter(m => chaveMat_(m) === k).slice(-300).reverse().map(pub_) };
}

function estoqueMovimentar_(q, ctx) {
  const tipo = { 'Saída': 'Saída', 'Ajuste': 'Ajuste', 'Entrada': 'Entrada' }[q.tipo];
  if (!tipo) throw new Error('Tipo de movimento inválido.');
  let qtd = num_(q.qtd);
  if (!(qtd > 0)) throw new Error('Informe a quantidade.');
  const mt = obraTab_(ctx, 'Materiais').all().find(m => String(m.codigo) === String(q.material_cod));
  const desc = mt ? mt.descricao : String(q.descricao || '').trim();
  if (!desc) throw new Error('Escolha o material.');
  const base = { material_cod: mt ? mt.codigo : '', descricao: desc };
  const atual = (saldos_(ctx)[chaveMat_(base)] || { saldo: 0 }).saldo;
  if (tipo === 'Saída') {
    if (!q.frente) throw new Error('Informe a frente de trabalho que recebeu o material.');
    if (qtd > atual + 1e-9) throw new Error('Saldo insuficiente: há ' + atual + ' em estoque.');
    qtd = -qtd;
  }
  if (tipo === 'Ajuste') {
    if (!String(q.obs || '').trim()) throw new Error('Explique o motivo do ajuste.');
    if (q.sinal === '-') qtd = -qtd;
    if (atual + qtd < -1e-9) throw new Error('O ajuste deixaria o saldo negativo (saldo atual ' + atual + ').');
  }
  obraTab_(ctx, 'Estoque').insert({
    id: Utilities.getUuid().slice(0, 8), data: new Date(), tipo: tipo, material_cod: base.material_cod, descricao: desc,
    unidade: mt ? mt.unidade : (q.unidade || ''), qtd: qtd, pedido: '', frente: q.frente || '', usuario: ctx.u.nome, obs: String(q.obs || '').trim()
  });
  log_(ctx, 'estoque_' + tipo, desc + ' ' + qtd);
  return { msg: tipo + ' registrada. Saldo: ' + (atual + qtd) + '.' };
}

/* ---------- cadastros da obra ---------- */
const CADASTROS = {
  materiais: { tab: 'Materiais', perm: 'cad_materiais', pref: 'M', dig: 4, nome: 'descricao', ativo: 'ativo' },
  fornecedores: { tab: 'Fornecedores', perm: 'cad_fornecedores', pref: 'F', dig: 3, nome: 'nome', ativo: 'ativo' },
  frentes: { tab: 'Frentes', perm: 'cad_frentes', pref: 'FR', dig: 2, nome: 'nome', ativo: 'ativa' }
};

function cadSalvar_(q, ctx) {
  const cfg = CADASTROS[q.tipo];
  if (!cfg) throw new Error('Cadastro desconhecido.');
  exigir_(ctx, cfg.perm);
  const T = obraTab_(ctx, cfg.tab), d = q.dados || {};
  const nome = String(d[cfg.nome] || '').trim();
  if (!nome) throw new Error('Preencha o nome/descrição.');
  let o = d.codigo ? T.all().find(x => String(x.codigo) === String(d.codigo)) : null;
  if (T.all().some(x => x !== o && norm_(x[cfg.nome]) === norm_(nome))) throw new Error('Já existe um cadastro com esse nome.');
  const novo = !o;
  if (novo) { o = { codigo: T.proxCodigo('codigo', cfg.pref, cfg.dig) }; o[cfg.ativo] = 'Sim'; }
  SCHEMA_OBRA[cfg.tab].forEach(c => {
    if (c !== 'codigo' && d[c] !== undefined) o[c] = typeof d[c] === 'string' ? d[c].trim() : d[c];
  });
  if (cfg.tab === 'Fornecedores' && o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(o.email).split(/[,;]/)[0].trim())) throw new Error('E-mail inválido.');
  if (novo) T.insert(o); else T.update(o);
  log_(ctx, 'cad_' + q.tipo, o.codigo + ' ' + nome);
  return { msg: (novo ? 'Cadastrado: ' : 'Atualizado: ') + nome + ' (' + o.codigo + ').', item: pub_(o) };
}
