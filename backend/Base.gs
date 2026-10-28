/**
 * ORÇAMENTOS · base de preços da empresa (planilha central).
 *  - Insumo: material, mão de obra, equipamento ou serviço de terceiro, com preço e data-base; cada mudança de preço fica em InsumoPrecos.
 *  - Composição: serviço formado por insumos e/ou outras composições (auxiliares) × coeficiente por unidade do serviço.
 *    O item pode ter preço próprio na composição (ex: o assentamento do DN 125 sai mais caro que o do DN 75); vazio = preço do cadastro.
 *  - O custo unitário é calculado na hora, separado em material, mão de obra, equipamento e serviço de terceiro,
 *    com a data-base mais antiga dos preços usados.
 *  - Importação da planilha de composições (Item · Tipo · Código · Descrição · Un · Quant. · Custo unit.).
 * Acesso pelo cadastro do usuário (Usuarios.orcamentos = Ver | Gerir), sem depender de obra; o administrador gere.
 */
const BASE_NIVEIS = ['Ver', 'Gerir'];
const BASE_TIPOS = ['Material', 'Mão de obra', 'Equipamento', 'Serviço'];
const BASE_CAT_ = { 'Material': 'mat', 'Mão de obra': 'mo', 'Equipamento': 'eq', 'Serviço': 'sv' };
const BASE_KS_ = ['mat', 'mo', 'eq', 'sv'];

function nivelBase_(u) {
  if (sim_(u.admin)) return 'Gerir';
  return BASE_NIVEIS.find(n => norm_(n) === norm_(u.orcamentos)) || '';
}
function exigirBase_(ctx, nivel) {
  const n = nivelBase_(ctx.u);
  if (!n) throw new Error('Você não tem acesso ao módulo Orçamentos (peça ao administrador).');
  if (nivel === 'Gerir' && n !== 'Gerir') throw new Error('Você só pode consultar a base de preços (peça ao administrador o acesso "Gerir").');
  ctx.base = n;
}

/* ---------- utilidades ---------- */
const baseR2_ = n => Math.round((Number(n) || 0) * 100) / 100;
const baseR4_ = n => Math.round((Number(n) || 0) * 1e4) / 1e4;
const baseR8_ = n => Math.round((Number(n) || 0) * 1e8) / 1e8;
function baseCodigo_(v) { return String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, 40); }
function baseHoje_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function baseData_(v) { if (!v) return ''; return v instanceof Date ? Utilities.formatDate(v, tz_(), 'yyyy-MM-dd') : String(v).slice(0, 10); }
function baseDataIso_(v) { const s = baseData_(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
const baseAtivo_ = o => o.ativo === '' || o.ativo == null || sim_(o.ativo);
const basePrecoProprio_ = x => x.preco !== '' && x.preco != null;
/* tipo como vem da planilha ("Mão de obra / serviço") ou digitado ("mao de obra", "equip.") */
function baseTipo_(t) {
  const s = norm_(t);
  if (!s) return '';
  const exato = BASE_TIPOS.find(x => norm_(x) === s);
  if (exato) return exato;
  if (/mao de obra|^m\.?o\.?$/.test(s)) return 'Mão de obra';
  if (/equip/.test(s)) return 'Equipamento';
  if (/servi|terceir|composi/.test(s)) return 'Serviço';
  if (/mater/.test(s)) return 'Material';
  return '';
}
/* próximo código livre com prefixo (INS-0001, CMP-0001), sem repetir os já usados nesta operação */
function baseGerador_(usados, prefixo) {
  const set = {};
  let max = 0;
  usados.forEach(c => {
    const s = String(c);
    set[norm_(s)] = 1;
    if (s.indexOf(prefixo) === 0) { const n = parseInt(s.slice(prefixo.length).replace(/\D/g, ''), 10); if (n > max) max = n; }
  });
  return () => { let c; do { c = prefixo + ('000' + (++max)).slice(-4); } while (set[norm_(c)]); set[norm_(c)] = 1; return c; };
}
const baseTitulo_ = s => { const t = String(s || '').trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

/* ---------- custo das composições ---------- */
function baseIndice_() {
  const ix = { I: {}, C: {}, itens: {} };
  central_('Insumos').all().forEach(i => { ix.I[String(i.codigo)] = i; });
  central_('Composicoes').all().forEach(c => { ix.C[String(c.codigo)] = c; });
  central_('ComposicaoItens').all().forEach(x => { const k = String(x.composicao); (ix.itens[k] = ix.itens[k] || []).push(x); });
  Object.keys(ix.itens).forEach(k => ix.itens[k].sort((a, b) => num_(a.ordem) - num_(b.ordem)));
  return ix;
}
/* custo unitário por categoria; data = data-base mais antiga dos preços usados; falta = itens que apontam para cadastro inexistente */
function baseCusto_(ix, cod, memo, pilha) {
  cod = String(cod);
  if (memo[cod]) return memo[cod];
  pilha = pilha || [];
  if (pilha.indexOf(cod) >= 0) throw new Error('Composição circular: ' + pilha.concat(cod).join(' → ') + '.');
  const r = { mat: 0, mo: 0, eq: 0, sv: 0, total: 0, data: '', falta: 0 };
  const data = d => { if (d && (!r.data || d < r.data)) r.data = d; };
  (ix.itens[cod] || []).forEach(x => {
    const k = num_(x.coef);
    if (x.ref_tipo === 'C') {
      if (!ix.C[String(x.ref)]) { r.falta++; return; }
      const s = baseCusto_(ix, x.ref, memo, pilha.concat(cod));
      BASE_KS_.forEach(c => { r[c] += k * s[c]; });
      data(s.data);
      r.falta += s.falta;
    } else {
      const i = ix.I[String(x.ref)];
      if (!i) { r.falta++; return; }
      r[BASE_CAT_[i.tipo] || 'mat'] += k * (basePrecoProprio_(x) ? num_(x.preco) : num_(i.preco));
      data(baseData_(i.data_preco));
    }
  });
  r.total = r.mat + r.mo + r.eq + r.sv;
  return (memo[cod] = r);
}
function baseUsos_(ix) {
  const ins = {}, comp = {};
  Object.keys(ix.itens).forEach(c => {
    if (!ix.C[c]) return;
    ix.itens[c].forEach(x => { const m = x.ref_tipo === 'C' ? comp : ins, k = String(x.ref); (m[k] = m[k] || {})[c] = 1; });
  });
  return { ins, comp };
}

/* ---------- leitura ---------- */
function baseDados_(q, ctx) {
  const ix = baseIndice_(), memo = {}, u = baseUsos_(ix);
  const insumos = Object.keys(ix.I).map(k => {
    const i = ix.I[k];
    return { codigo: k, descricao: i.descricao, unidade: i.unidade, tipo: BASE_TIPOS.indexOf(i.tipo) >= 0 ? i.tipo : 'Material', grupo: i.grupo, preco: num_(i.preco),
      data_preco: baseData_(i.data_preco), fonte: i.fonte, obs: i.obs, ativo: baseAtivo_(i), usos: Object.keys(u.ins[k] || {}).length, foto: baseFotoUrl_(i.foto_id) };
  });
  const composicoes = Object.keys(ix.C).map(k => {
    const c = ix.C[k], o = {
      codigo: k, descricao: c.descricao, unidade: c.unidade, grupo: c.grupo, obs: c.obs, fonte: c.fonte, ativo: baseAtivo_(c),
      atualizado_em: fmtVal_(c.atualizado_em), atualizado_por: c.atualizado_por, usada_em: Object.keys(u.comp[k] || {}).length,
      itens: (ix.itens[k] || []).map(x => ({ ref_tipo: x.ref_tipo === 'C' ? 'C' : 'I', ref: String(x.ref), coef: num_(x.coef), preco: basePrecoProprio_(x) ? num_(x.preco) : '', obs: x.obs || '' }))
    };
    try {
      const r = baseCusto_(ix, k, memo);
      o.custo = { mat: baseR4_(r.mat), mo: baseR4_(r.mo), eq: baseR4_(r.eq), sv: baseR4_(r.sv), total: baseR4_(r.total), data: r.data, falta: r.falta };
    } catch (e) { o.erro = e.message; o.custo = { mat: 0, mo: 0, eq: 0, sv: 0, total: 0, data: '', falta: 0 }; }
    return o;
  });
  return {
    nivel: ctx.base, tipos: BASE_TIPOS, insumos: insumos, composicoes: composicoes, hoje: baseHoje_(),
    unidades: central_('Unidades').all().map(r => String(r.unidade).trim()).filter(Boolean)
  };
}
function baseInsumoHistorico_(q, ctx) {
  const cod = String(q.codigo);
  return {
    // mais recente primeiro (na mesma hora, vale a ordem em que foi gravado)
    historico: central_('InsumoPrecos').all().filter(h => String(h.insumo) === cod)
      .map((h, n) => ({ n: n, data: fmtVal_(h.data), de: h.de === '' ? '' : num_(h.de), para: num_(h.para), origem: h.origem, usuario: h.usuario }))
      .sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.n - a.n)
      .map(h => { delete h.n; return h; })
  };
}

/* serviços da base para a planilha do contrato de empreiteiro (quem gere contratos na obra, mesmo sem acesso ao módulo Orçamentos):
 * só as composições ativas, com o custo de referência sem material (mão de obra + equipamento + serviço de terceiro) */
function baseParaContrato_(q, ctx) {
  const ix = baseIndice_(), memo = {};
  return {
    composicoes: Object.keys(ix.C).filter(k => baseAtivo_(ix.C[k])).map(k => {
      const c = ix.C[k];
      let r;
      try { r = baseCusto_(ix, k, memo); } catch (e) { r = { mat: 0, mo: 0, eq: 0, sv: 0, total: 0 }; }
      return { codigo: k, descricao: c.descricao, unidade: c.unidade, grupo: c.grupo, mo: baseR2_(r.mo), sem_material: baseR2_(r.mo + r.eq + r.sv), total: baseR2_(r.total) };
    }).sort((a, b) => String(a.grupo).localeCompare(String(b.grupo)) || String(a.descricao).localeCompare(String(b.descricao)))
  };
}

/* ---------- insumos ---------- */
function baseInsumoSalvar_(q, ctx) {
  const T = central_('Insumos'), d = q.insumo || {};
  const desc = String(d.descricao || '').trim(), un = String(d.unidade || '').trim(), tipo = baseTipo_(d.tipo), preco = baseR4_(num_(d.preco));
  if (!desc) throw new Error('Informe a descrição do insumo.');
  if (!un) throw new Error('Informe a unidade.');
  if (!tipo) throw new Error('Escolha o tipo: ' + BASE_TIPOS.join(', ') + '.');
  if (preco < 0) throw new Error('O preço não pode ser negativo.');
  let i = d.original ? T.all().find(x => String(x.codigo) === String(d.original)) : null;
  if (d.original && !i) throw new Error('Insumo não encontrado (pode ter sido excluído). Atualize a tela.');
  const novo = !i;
  if (novo) {
    const cod = baseCodigo_(d.codigo) || T.proxCodigo('codigo', 'INS-', 4);
    if (T.all().some(x => norm_(x.codigo) === norm_(cod))) throw new Error('Já existe um insumo com o código ' + cod + '.');
    i = { codigo: cod, criado_em: new Date(), fonte: 'Própria' };
  }
  const antes = novo ? 0 : num_(i.preco), mudou = novo || Math.abs(antes - preco) > 1e-9;
  i.descricao = desc;
  i.unidade = un;
  i.tipo = tipo;
  i.grupo = String(d.grupo || '').trim();
  i.preco = preco;
  i.data_preco = baseDataIso_(d.data_preco) || (mudou ? baseHoje_() : baseData_(i.data_preco));
  if (d.fonte !== undefined) i.fonte = String(d.fonte || '').trim();
  i.obs = String(d.obs || '').trim();
  i.ativo = d.ativo === undefined || sim_(d.ativo) ? 'Sim' : 'Não';
  i.atualizado_em = new Date();
  i.atualizado_por = ctx.u.nome;
  if (novo) T.insert(i); else T.update(i);
  if (mudou) central_('InsumoPrecos').insert({ insumo: i.codigo, data: new Date(), de: novo ? '' : antes, para: preco, origem: novo ? 'Cadastro' : 'Edição', usuario: ctx.u.nome });
  log_(ctx, novo ? 'insumo_criar' : 'insumo_editar', i.codigo + ' ' + desc);
  return { msg: (novo ? 'Insumo criado: ' : 'Insumo salvo: ') + i.codigo + '.', codigo: String(i.codigo) };
}
function baseInsumoExcluir_(q, ctx) {
  const cod = String(q.codigo), ix = baseIndice_();
  if (!ix.I[cod]) throw new Error('Insumo não encontrado.');
  const em = Object.keys(baseUsos_(ix).ins[cod] || {});
  if (em.length) throw new Error('Este insumo está em ' + plural_(em.length, 'composição', 'composições') + ' (' + em.slice(0, 5).join(', ') + (em.length > 5 ? '…' : '') + '). Tire das composições ou desative o insumo.');
  baseFotoLixo_(ix.I[cod].foto_id);
  central_('Insumos').removeWhere(x => String(x.codigo) === cod);
  log_(ctx, 'insumo_excluir', cod);
  return { msg: 'Insumo ' + cod + ' excluído.' };
}
/* foto do insumo: arquivo no Drive (Compras Size / Base de preços / Fotos dos insumos), aberto para quem tem o link,
 * para o app mostrar direto pela miniatura do Drive (sem passar pela API a cada imagem) */
const BASE_FOTO_MAX_ = 4 * 1024 * 1024;
function baseFotoUrl_(id) { return id ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w800' : ''; }
function baseFotoLixo_(id) { if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* já não existe */ } } }
function baseInsumoFoto_(q, ctx) {
  const T = central_('Insumos'), i = T.all().find(x => String(x.codigo) === String(q.codigo));
  if (!i) throw new Error('Insumo não encontrado.');
  if (q.remover) {
    baseFotoLixo_(i.foto_id);
    i.foto_id = '';
    T.update(i);
    log_(ctx, 'insumo_foto', i.codigo + ' removida');
    return { msg: 'Foto removida.', foto: '' };
  }
  const a = q.arquivo || {};
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(String(a.mime || ''))) throw new Error('Envie uma imagem (JPG, PNG ou WEBP).');
  const bytes = Utilities.base64Decode(String(a.b64 || ''));
  if (!bytes.length) throw new Error('Imagem vazia.');
  if (bytes.length > BASE_FOTO_MAX_) throw new Error('Imagem maior que 4 MB.');
  const pasta = subpasta_(subpasta_(raizPasta_(), 'Base de preços'), 'Fotos dos insumos');
  const ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[String(a.mime).toLowerCase()] || 'jpg';
  const f = pasta.createFile(Utilities.newBlob(bytes, a.mime, nomeArq_(i.codigo + ' · ' + i.descricao) + '.' + ext));
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  baseFotoLixo_(i.foto_id);
  i.foto_id = f.getId();
  i.atualizado_em = new Date();
  i.atualizado_por = ctx.u.nome;
  T.update(i);
  log_(ctx, 'insumo_foto', i.codigo);
  return { msg: 'Foto salva.', foto: baseFotoUrl_(i.foto_id) };
}
/* atualização de preços em lote: reajuste por % (o app calcula) ou lista colada do Excel (código · preço) */
function basePrecos_(q, ctx) {
  const T = central_('Insumos'), data = baseDataIso_(q.data_preco) || baseHoje_(), origem = String(q.origem || 'Atualização de preços').slice(0, 80);
  const por = {}, falta = [], hist = [], agora = new Date();
  T.all().forEach(i => { por[norm_(i.codigo)] = i; });
  let n = 0;
  [].concat(q.itens || []).forEach(x => {
    if (!x || x.codigo == null || x.codigo === '') return;
    const i = por[norm_(x.codigo)];
    if (!i) { falta.push(String(x.codigo)); return; }
    const p = baseR4_(num_(x.preco)), antes = num_(i.preco);
    if (p < 0) throw new Error('Preço negativo para ' + i.codigo + '.');
    if (Math.abs(antes - p) > 1e-9) { hist.push({ insumo: i.codigo, data: agora, de: antes, para: p, origem: origem, usuario: ctx.u.nome }); i.preco = p; }
    i.data_preco = data;
    i.atualizado_em = agora;
    i.atualizado_por = ctx.u.nome;
    n++;
  });
  if (!n) throw new Error('Nenhum insumo encontrado' + (falta.length ? ' (códigos: ' + falta.slice(0, 10).join(', ') + ')' : '') + '.');
  T.substituir(T.all());
  if (hist.length) central_('InsumoPrecos').insertMany(hist);
  log_(ctx, 'insumo_precos', origem + ': ' + n + ' insumos, ' + hist.length + ' preços alterados');
  return {
    msg: plural_(hist.length, 'preço alterado', 'preços alterados') + (n > hist.length ? ', ' + (n - hist.length) + ' confirmados sem mudança' : '') + ' · data-base ' + data.split('-').reverse().join('/') +
      (falta.length ? '. Não encontrados: ' + falta.slice(0, 10).join(', ') + (falta.length > 10 ? '…' : '') : '.'),
    alterados: hist.length, confirmados: n - hist.length, falta: falta
  };
}

/* ---------- composições ---------- */
function baseItensValidos_(ix, lista, cod) {
  const its = [];
  [].concat(lista || []).forEach(x => {
    if (!x) return;
    const t = x.ref_tipo === 'C' ? 'C' : 'I', ref = String(x.ref == null ? '' : x.ref).trim();
    if (!ref) return;
    if (t === 'I' && !ix.I[ref]) throw new Error('Insumo não encontrado: ' + ref + '.');
    if (t === 'C' && !ix.C[ref]) throw new Error('Composição auxiliar não encontrada: ' + ref + '.');
    if (t === 'C' && ref === cod) throw new Error('Uma composição não pode usar ela mesma.');
    const coef = baseR8_(num_(x.coef));
    if (coef < 0) throw new Error('Coeficiente negativo em ' + ref + '.');
    const p = t === 'C' || x.preco === '' || x.preco == null ? '' : baseR4_(num_(x.preco));
    if (p !== '' && p < 0) throw new Error('Preço negativo em ' + ref + '.');
    its.push({ composicao: cod, ordem: its.length + 1, ref_tipo: t, ref: ref, coef: coef, preco: p, obs: String(x.obs || '').trim() });
  });
  return its;
}
function baseComposicaoSalvar_(q, ctx) {
  const C = central_('Composicoes'), IT = central_('ComposicaoItens'), d = q.composicao || {}, ix = baseIndice_();
  const desc = String(d.descricao || '').trim(), un = String(d.unidade || '').trim();
  if (!desc) throw new Error('Informe a descrição do serviço.');
  if (!un) throw new Error('Informe a unidade do serviço.');
  let c = d.original ? C.all().find(x => String(x.codigo) === String(d.original)) : null;
  if (d.original && !c) throw new Error('Composição não encontrada (pode ter sido excluída). Atualize a tela.');
  const novo = !c, cod = novo ? (baseCodigo_(d.codigo) || C.proxCodigo('codigo', 'CMP-', 4)) : String(c.codigo);
  if (novo && C.all().some(x => norm_(x.codigo) === norm_(cod))) throw new Error('Já existe uma composição com o código ' + cod + '.');
  const its = baseItensValidos_(ix, q.itens, cod);
  if (!its.length) throw new Error('Inclua pelo menos um insumo ou composição auxiliar.');
  ix.itens[cod] = its;
  ix.C[cod] = ix.C[cod] || { codigo: cod };
  const r = baseCusto_(ix, cod, {});   // composição circular → erro, nada é gravado
  if (novo) c = { codigo: cod, criado_em: new Date(), fonte: 'Própria' };
  c.descricao = desc;
  c.unidade = un;
  c.grupo = String(d.grupo || '').trim();
  c.obs = String(d.obs || '').trim();
  c.ativo = d.ativo === undefined || sim_(d.ativo) ? 'Sim' : 'Não';
  c.atualizado_em = new Date();
  c.atualizado_por = ctx.u.nome;
  if (novo) C.insert(c); else C.update(c);
  IT.substituir(IT.all().filter(x => String(x.composicao) !== cod).concat(its));
  log_(ctx, novo ? 'composicao_criar' : 'composicao_editar', cod + ' ' + desc + ' · ' + brl_(r.total));
  return { msg: (novo ? 'Composição criada: ' : 'Composição salva: ') + cod + ' · ' + brl_(r.total) + '/' + un + '.', codigo: cod, custo: baseR4_(r.total) };
}
function baseComposicaoExcluir_(q, ctx) {
  const cod = String(q.codigo), ix = baseIndice_();
  if (!ix.C[cod]) throw new Error('Composição não encontrada.');
  const em = Object.keys(baseUsos_(ix).comp[cod] || {});
  if (em.length) throw new Error('Esta composição é auxiliar de ' + plural_(em.length, 'outra composição', 'outras composições') + ' (' + em.slice(0, 5).join(', ') + (em.length > 5 ? '…' : '') + '). Tire de lá ou desative.');
  central_('Composicoes').removeWhere(x => String(x.codigo) === cod);
  const IT = central_('ComposicaoItens');
  IT.substituir(IT.all().filter(x => String(x.composicao) !== cod));
  log_(ctx, 'composicao_excluir', cod);
  return { msg: 'Composição ' + cod + ' excluída.' };
}
function baseComposicaoDuplicar_(q, ctx) {
  const C = central_('Composicoes'), IT = central_('ComposicaoItens'), cod = String(q.codigo);
  const o = C.all().find(x => String(x.codigo) === cod);
  if (!o) throw new Error('Composição não encontrada.');
  const novo = baseCodigo_(q.novo_codigo) || C.proxCodigo('codigo', 'CMP-', 4);
  if (C.all().some(x => norm_(x.codigo) === norm_(novo))) throw new Error('Já existe uma composição com o código ' + novo + '.');
  const agora = new Date();
  C.insert({ codigo: novo, descricao: String(o.descricao) + ' (cópia)', unidade: o.unidade, grupo: o.grupo, obs: o.obs, fonte: 'Própria', ativo: 'Sim', criado_em: agora, atualizado_em: agora, atualizado_por: ctx.u.nome });
  IT.insertMany(IT.all().filter(x => String(x.composicao) === cod).sort((a, b) => num_(a.ordem) - num_(b.ordem))
    .map(x => ({ composicao: novo, ordem: x.ordem, ref_tipo: x.ref_tipo, ref: x.ref, coef: x.coef, preco: x.preco, obs: x.obs })));
  log_(ctx, 'composicao_duplicar', cod + ' → ' + novo);
  return { msg: 'Cópia criada: ' + novo + '. Ajuste a descrição e os itens.', codigo: novo };
}

/* ---------- importação de planilha ---------- */
const PLAN_COLS_ = { item: /^item$/, tipo: /^tipo$/, cod: /^(cod|codigo)\b/, desc: /^descri/, un: /^(un|und|unid|unidade)\.?$/, qtd: /^quant/, unit: /^(custo|preco|valor) unit/,
  bdi: /^bdi/, gest: /^gestao/, mot: /^mao de obra.*total/, ptot: /^preco total/ };   // as 4 últimas só na aba do orçamento (item sem BDI / sem gestão)
function planCabecalho_(linhas, obrig) {
  for (let r = 0; r < Math.min(linhas.length, 40); r++) {
    const row = (linhas[r] || []).map(x => norm_(x)), c = {};
    Object.keys(PLAN_COLS_).forEach(k => { c[k] = row.findIndex(x => PLAN_COLS_[k].test(x)); });
    if (obrig.every(k => c[k] >= 0)) return { r: r, c: c };
  }
  return null;
}
const planNum_ = v => (typeof v === 'number' ? v : /^\s*=/.test(String(v == null ? '' : v)) || String(v == null ? '' : v).trim() === '' ? null : num_(v));
/* lê as abas (linhas × colunas, como o Excel mostra): a de composições (com a coluna Tipo) e, se vier, a do orçamento (para o nome das etapas) */
function baseLerPlanilha_(abas) {
  let comp = null, orc = null;
  [].concat(abas || []).forEach(a => {
    const L = (a && a.linhas) || [];
    if (!comp) { const h = planCabecalho_(L, ['tipo', 'desc', 'qtd', 'unit']); if (h) { comp = { nome: a.nome, L: L, h: h }; return; } }
    if (!orc) { const h = planCabecalho_(L, ['item', 'desc', 'un']); if (h) orc = { L: L, h: h }; }
  });
  if (!comp) throw new Error('Não encontrei a planilha de composições. Ela precisa das colunas Tipo, Código, Descrição, Un, Quant. e Custo unitário (como a aba "Composições" da planilha de orçamento).');
  const etapas = {}, taxas = {}, semTaxa = {};
  let titulo = '';
  if (orc) {
    // acima do cabeçalho: título do orçamento e as taxas (ex: "BDI s/ serviços (%)" 0,18 · "Gestão de obra (%)" 0,06)
    for (let r = 0; r < orc.h.r; r++) {
      const row = orc.L[r] || [];
      row.forEach((x, j) => {
        const s = norm_(x), v = row[j + 1];
        // título: a 1ª linha do tipo "AVA Residences · Dorata · Maquiné/RS · Orçamento nº 15" (não o "PLANILHA ORÇAMENTÁRIA" nem as notas)
        if (!titulo && typeof x === 'string' && /·/.test(x) && x.trim().length < 180 && !/^(planilha|bdi|gest|total|material|mao de obra|sem detalhe|preco)/.test(s)) titulo = x.trim();
        if (v === '' || v == null || (typeof v !== 'number' && !/^\s*[\d.,]+\s*%?\s*$/.test(String(v)))) return;
        let n = num_(String(v).replace('%', ''));
        if (!(/%/.test(String(x)) || n <= 1)) return;          // "BDI (R$)" é valor, não taxa
        if (n > 0 && n <= 1) n = Math.round(n * 10000) / 100;
        const base = /serv|mao de obra/.test(s) ? 'servicos' : 'total';
        if (/^bdi/.test(s) && taxas.bdi == null) { taxas.bdi = n; taxas.bdi_base = base; }
        if (/^gest/.test(s) && taxas.gestao == null) { taxas.gestao = n; taxas.gestao_base = base; }
      });
    }
    const c = orc.h.c;
    for (let r = orc.h.r + 1; r < orc.L.length; r++) {
      const row = orc.L[r] || [], it = String(row[c.item] == null ? '' : row[c.item]).trim(), ds = String(row[c.desc] == null ? '' : row[c.desc]).trim();
      if (/^\d+$/.test(it) && ds && !String(row[c.un] == null ? '' : row[c.un]).trim()) etapas[it] = baseTitulo_(ds);
      // BDI (ou gestão) zerado num item que tem valor: esse item fica fora da taxa (ex: mobilização e canteiro)
      if (/^\d+(\.\d+)+$/.test(it)) {
        const v = k => (c[k] >= 0 && row[c[k]] != null ? row[c[k]] : ''), zero = x => x === 0 || (typeof x === 'string' && x.trim() !== '' && !/^=/.test(x) && num_(x) === 0);
        const mo = num_(v('mot')), pt = num_(v('ptot')), fx = {};
        if (c.bdi >= 0 && zero(v('bdi')) && (mo > 0 || (c.mot < 0 && pt > 0))) fx.bdi = true;
        if (c.gest >= 0 && zero(v('gest')) && pt > 0) fx.gestao = true;
        if (fx.bdi || fx.gestao) semTaxa[it] = fx;
      }
    }
  }
  const c = comp.h.c, cel = (row, k) => (c[k] >= 0 && row[c[k]] != null ? row[c[k]] : '');
  const blocos = [], avisos = [];
  let cur = null;
  for (let r = comp.h.r + 1; r < comp.L.length; r++) {
    const row = comp.L[r] || [], desc = String(cel(row, 'desc')).trim();
    if (!desc) continue;
    const tipoTxt = String(cel(row, 'tipo')).trim();
    const l = { item: String(cel(row, 'item')).trim(), codigo: baseCodigo_(cel(row, 'cod')), descricao: desc.slice(0, 300), unidade: String(cel(row, 'un')).trim(), qtd: planNum_(cel(row, 'qtd')), unit: planNum_(cel(row, 'unit')) };
    if (!tipoTxt) {
      cur = { item: l.item, codigo: l.codigo, descricao: l.descricao, unidade: l.unidade, qtd: l.qtd || 0, unit: l.unit, grupo: etapas[l.item.split('.')[0]] || '', itens: [] };
      blocos.push(cur);
    } else if (cur) {
      if (l.unit == null) avisos.push('Linha ' + (r + 1) + ' (' + desc.slice(0, 40) + '): sem custo unitário, entrou com R$ 0,00.');
      cur.itens.push({ tipo: baseTipo_(tipoTxt) || 'Material', codigo: l.codigo, descricao: l.descricao, unidade: l.unidade || cur.unidade, qtd: l.qtd || 0, preco: l.unit || 0 });
    } else avisos.push('Linha ' + (r + 1) + ': insumo antes da primeira composição, ignorado.');
  }
  // serviço sem detalhamento: vira um insumo "Serviço" com o preço da composição
  blocos.forEach(b => { if (!b.itens.length) b.itens.push({ tipo: 'Serviço', codigo: b.codigo, descricao: b.descricao, unidade: b.unidade, qtd: b.qtd || 1, preco: b.unit || 0 }); });
  if (!blocos.length) throw new Error('A aba "' + comp.nome + '" não tem nenhuma composição.');
  return { aba: comp.nome, blocos: blocos, avisos: avisos, etapas: Object.keys(etapas).length, etapasNomes: etapas, taxas: taxas, semTaxa: semTaxa, titulo: titulo.slice(0, 200) };
}
/* o que a importação vai fazer: insumos e composições novos, atualizados, mantidos ou repetidos */
function basePlanoImport_(P, atualizar) {
  const ix = baseIndice_(), avisos = P.avisos.slice();
  const novoI = baseGerador_(Object.keys(ix.I), 'INS-'), novoC = baseGerador_(Object.keys(ix.C), 'CMP-');
  const chave = (d, u) => norm_(d) + '|' + norm_(u);
  // 1. insumos: pelo código; sem código, pela descrição + unidade (na base ou no próprio arquivo)
  const porDesc = {}, insF = {}, ordemI = [];
  Object.keys(ix.I).forEach(k => { porDesc[chave(ix.I[k].descricao, ix.I[k].unidade)] = k; });
  P.blocos.forEach(b => b.itens.forEach(x => {
    const kd = chave(x.descricao, x.unidade);
    if (!x.codigo) { x.codigo = porDesc[kd] || novoI(); x.gerado = !ix.I[x.codigo]; }
    if (!porDesc[kd]) porDesc[kd] = x.codigo;
    const f = insF[x.codigo];
    if (!f) { insF[x.codigo] = { codigo: x.codigo, descricao: x.descricao, unidade: x.unidade, tipo: x.tipo, preco: baseR4_(x.preco), gerado: !!x.gerado, divergentes: 0 }; ordemI.push(x.codigo); }
    else if (Math.abs(f.preco - x.preco) > 0.005) f.divergentes++;
  }));
  const insumos = ordemI.map(k => {
    const f = insF[k], db = ix.I[k];
    if (!db) return Object.assign(f, { status: 'novo', preco_atual: '' });
    const igual = Math.abs(num_(db.preco) - f.preco) < 0.00005 && norm_(db.descricao) === norm_(f.descricao) && norm_(db.unidade) === norm_(f.unidade) && db.tipo === f.tipo;
    return Object.assign(f, { status: igual ? 'igual' : atualizar ? 'atualizar' : 'manter', preco_atual: num_(db.preco) });
  });
  // 2. composições: pelo código; o mesmo código com itens diferentes vira variante (código-2, código-3…); itens iguais = repetida
  const porCod = {}, composicoes = [];
  let proprios = 0;
  P.blocos.forEach(b => {
    const Q = num_(b.qtd);
    const its = b.itens.map(x => ({ ref_tipo: 'I', ref: x.codigo, coef: baseR8_(Q ? x.qtd / Q : x.qtd), preco: Math.abs(x.preco - insF[x.codigo].preco) > 0.005 ? baseR4_(x.preco) : '' }));
    const assin = norm_(b.unidade) + '#' + its.map(i => i.ref + ':' + i.coef + ':' + i.preco).sort().join('|');
    let base = b.codigo;
    if (!base) {
      const mesma = Object.keys(ix.C).find(k => chave(ix.C[k].descricao, ix.C[k].unidade) === chave(b.descricao, b.unidade)) ||
        Object.keys(porCod).find(k => chave(porCod[k].descricao, porCod[k].unidade) === chave(b.descricao, b.unidade));
      base = mesma || novoC();
    }
    let cod = base, n = 1, rep = null;
    while (porCod[cod]) {
      if (porCod[cod].assin === assin) { rep = porCod[cod]; break; }
      cod = base + '-' + (++n);
    }
    if (rep) { rep.repetidas.push(b.item || b.descricao.slice(0, 30)); b.cod_final = rep.codigo; return; }
    b.cod_final = cod;   // composição da base que este item da planilha usa (para montar o orçamento do cliente)
    const calc = b.itens.reduce((s, x, i) => s + its[i].coef * x.preco, 0);
    const o = {
      codigo: cod, item: b.item, descricao: b.descricao, unidade: b.unidade, grupo: b.grupo, itens: its, assin: assin, variante: n > 1,
      unit_planilha: b.unit == null ? '' : baseR4_(b.unit), unit_calc: baseR4_(calc), status: ix.C[cod] ? (atualizar ? 'atualizar' : 'manter') : 'nova', repetidas: [],
      proprios: its.filter(i => i.preco !== '').length, n_itens: its.length
    };
    if (b.unit != null && Math.abs(b.unit - calc) > Math.max(0.02, Math.abs(b.unit) * 0.005)) o.aviso = 'Custo na planilha ' + brl_(b.unit) + ' × calculado ' + brl_(calc) + ' (o sistema usa o calculado).';
    if (n > 1) avisos.push('Código ' + base + ' aparece com itens diferentes: o item ' + (b.item || b.descricao.slice(0, 30)) + ' entrou como ' + cod + '.');
    proprios += o.proprios;
    composicoes.push(porCod[cod] = o);
  });
  const conta = (l, s) => l.filter(x => x.status === s).length;
  return {
    insumos: insumos, composicoes: composicoes, avisos: avisos,
    resumo: {
      aba: P.aba, etapas: P.etapas, insumos: insumos.length, insumos_novos: conta(insumos, 'novo'), insumos_atualizar: conta(insumos, 'atualizar'), insumos_iguais: conta(insumos, 'igual'), insumos_manter: conta(insumos, 'manter'),
      composicoes: composicoes.length, comp_novas: conta(composicoes, 'nova'), comp_atualizar: conta(composicoes, 'atualizar'), comp_manter: conta(composicoes, 'manter'),
      comp_repetidas: composicoes.reduce((s, c) => s + c.repetidas.length, 0), precos_proprios: proprios, diferencas: composicoes.filter(c => c.aviso).length
    }
  };
}
function baseImportar_(q, ctx) {
  const atualizar = q.atualizar !== false && q.atualizar !== 'false';
  const plano = basePlanoImport_(baseLerPlanilha_(q.abas), atualizar);
  const saida = () => ({ resumo: plano.resumo, avisos: plano.avisos, insumos: plano.insumos, composicoes: plano.composicoes.map(c => { const o = Object.assign({}, c); delete o.assin; delete o.itens; return o; }) });
  if (!q.aplicar) return saida();
  const T = central_('Insumos'), C = central_('Composicoes'), IT = central_('ComposicaoItens'), ix = baseIndice_();
  const agora = new Date(), data = baseDataIso_(q.data_preco) || baseHoje_(), fonte = String(q.fonte || 'Importação de planilha').slice(0, 80), quem = ctx.u.nome;
  const novosI = [], hist = [];
  let mudouI = false;
  plano.insumos.forEach(p => {
    if (p.status === 'novo') {
      novosI.push({ codigo: p.codigo, descricao: p.descricao, unidade: p.unidade, tipo: p.tipo, grupo: '', preco: p.preco, data_preco: data, fonte: fonte, obs: '', ativo: 'Sim', criado_em: agora, atualizado_em: agora, atualizado_por: quem });
      hist.push({ insumo: p.codigo, data: agora, de: '', para: p.preco, origem: fonte, usuario: quem });
    } else if (p.status === 'atualizar') {
      const db = ix.I[p.codigo];
      if (Math.abs(num_(db.preco) - p.preco) > 1e-9) hist.push({ insumo: p.codigo, data: agora, de: num_(db.preco), para: p.preco, origem: fonte, usuario: quem });
      Object.assign(db, { descricao: p.descricao, unidade: p.unidade, tipo: p.tipo, preco: p.preco, data_preco: data, atualizado_em: agora, atualizado_por: quem });
      mudouI = true;
    }
  });
  if (mudouI) T.substituir(T.all());
  T.insertMany(novosI);
  if (hist.length) central_('InsumoPrecos').insertMany(hist);
  const alvos = {}, novasC = [], itens = [];
  let mudouC = false;
  plano.composicoes.forEach(p => {
    if (p.status === 'manter') return;
    alvos[p.codigo] = 1;
    p.itens.forEach((x, i) => itens.push({ composicao: p.codigo, ordem: i + 1, ref_tipo: 'I', ref: x.ref, coef: x.coef, preco: x.preco, obs: '' }));
    if (p.status === 'nova') novasC.push({ codigo: p.codigo, descricao: p.descricao, unidade: p.unidade, grupo: p.grupo, obs: '', fonte: fonte, ativo: 'Sim', criado_em: agora, atualizado_em: agora, atualizado_por: quem });
    else { Object.assign(ix.C[p.codigo], { descricao: p.descricao, unidade: p.unidade, grupo: p.grupo || ix.C[p.codigo].grupo, fonte: fonte, atualizado_em: agora, atualizado_por: quem }); mudouC = true; }
  });
  if (mudouC) C.substituir(C.all());
  C.insertMany(novasC);
  IT.substituir(IT.all().filter(x => !alvos[String(x.composicao)]).concat(itens));
  const R = plano.resumo;
  const msg = 'Importado: ' + plural_(R.insumos_novos, 'insumo novo', 'insumos novos') + (R.insumos_atualizar ? ', ' + R.insumos_atualizar + ' atualizados' : '') +
    ' · ' + plural_(R.comp_novas, 'composição nova', 'composições novas') + (R.comp_atualizar ? ', ' + R.comp_atualizar + ' atualizadas' : '') + '.';
  log_(ctx, 'base_importar', fonte + ' · ' + msg);
  return Object.assign(saida(), { msg: msg, aplicado: true });
}
