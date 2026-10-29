/**
 * SINAPI (Caixa) como referência de preços, ao lado da base da Size.
 *  - Fica numa planilha separada ("Size · SINAPI", id em SINAPI_ID) para não pesar a planilha central.
 *  - Só o RS e o mês atual: insumos (preço sem e com desoneração), composições (custo sem e com desoneração, já dividido
 *    em material / mão de obra / equipamento / serviço pelo analítico) e os itens de cada composição (coeficientes).
 *  - A Caixa publica um arquivo por mês (todas as UFs, ~15 MB zip / ~110 MB aberto). Ler esse arquivo no servidor estoura
 *    a memória do Apps Script, então quem lê é o app (no computador): o servidor baixa o zip da Caixa e entrega em partes,
 *    o app abre, separa o RS e devolve em lotes (sinapi_importar: inicio → lotes → fim). Também aceita o arquivo escolhido à mão.
 *  - Todo dia (gatilho sinapiVerificar) o servidor confere se a Caixa já publicou o mês seguinte e avisa quem gerencia
 *    a base de preços (sino do app). Orçamentos já feitos não mudam: o custo fica congelado no item.
 */
const SIN_URL_ = 'https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais/SINAPI-';
const SIN_SCHEMA_ = {
  SinapiInsumos: ['codigo', 'descricao', 'unidade', 'classe', 'origem', 'preco_sd', 'preco_cd'],
  SinapiComposicoes: ['codigo', 'descricao', 'unidade', 'grupo', 'situacao', 'custo_sd', 'custo_cd', 'mat_sd', 'mo_sd', 'eq_sd', 'sv_sd', 'mat_cd', 'mo_cd', 'eq_cd', 'sv_cd'],
  SinapiItens: ['composicao', 'tipo', 'codigo', 'coef'],
  SinapiHist: ['mes', 'codigo', 'descricao', 'de_sd', 'para_sd', 'de_cd', 'para_cd'],
  SinapiInfo: ['chave', 'valor']
};
const SIN_LOTE_TAB_ = { insumos: 'SinapiInsumos', composicoes: 'SinapiComposicoes', itens: 'SinapiItens' };
const SIN_REGIMES_ = { sd: 'não desonerado', cd: 'desonerado' };

function sinSS_(criar) {
  const P = PropertiesService.getScriptProperties();
  let id = P.getProperty('SINAPI_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { if (!criar) throw new Error('A planilha do SINAPI não foi encontrada no Drive.'); } }
  if (!criar) return null;
  const ss = SpreadsheetApp.create('Size · SINAPI');
  try { const pai = DriveApp.getFileById(PropertiesService.getScriptProperties().getProperty('CENTRAL_ID')).getParents(); if (pai && pai.hasNext()) DriveApp.getFileById(ss.getId()).moveTo(pai.next()); } catch (e) { /* fica na raiz do Drive */ }
  P.setProperty('SINAPI_ID', ss.getId());
  return ss;
}
function sinTab_(nome, ss) { return tabela_(ss || sinSS_(), nome, SIN_SCHEMA_[nome]); }
function sinInfo_(ss) {
  const o = {};
  if (!ss) return o;
  sinTab_('SinapiInfo', ss).all().forEach(r => { o[String(r.chave)] = r.valor; });
  return o;
}
function sinInfoGravar_(ss, d) {
  const T = sinTab_('SinapiInfo', ss);
  Object.keys(d).forEach(k => {
    const r = T.all().find(x => String(x.chave) === k);
    if (r) { r.valor = d[k]; T.update(r); } else T.insert({ chave: k, valor: d[k] });
  });
}
const sinMesTxt_ = m => m ? String(m).slice(5, 7) + '/' + String(m).slice(0, 4) : '';
/* mês seguinte (aaaa-mm) */
function sinProxMes_(m) { let y = +m.slice(0, 4), n = +m.slice(5, 7) + 1; if (n > 12) { n = 1; y++; } return y + '-' + ('0' + n).slice(-2); }
function sinAntMes_(m) { let y = +m.slice(0, 4), n = +m.slice(5, 7) - 1; if (n < 1) { n = 12; y--; } return y + '-' + ('0' + n).slice(-2); }
/* mês novo: o que a conferência achou na Caixa ou, se o servidor não consegue consultar a Caixa (o site recusa servidores
 * fora do Brasil), o que o calendário indica — a Caixa publica o mês M por volta do dia 10 do mês M+1 */
function sinNovo_(I) {
  let n = null;
  try { n = JSON.parse(PropertiesService.getScriptProperties().getProperty('SINAPI_NOVO') || 'null'); } catch (e) { n = null; }
  if (n && (!I.mes || n.mes > String(I.mes))) return Object.assign({ confirmado: true }, n);
  if (!I.mes) return null;
  const hoje = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'), m = hoje.slice(0, 7);
  const esperado = +hoje.slice(8, 10) >= 12 ? sinAntMes_(m) : sinAntMes_(sinAntMes_(m));
  return esperado > String(I.mes) ? { mes: esperado, url: sinUrls_(esperado)[2], confirmado: false } : null;
}

/* ---------- consulta ---------- */
function sinapiInfo_(q, ctx) {
  const ss = sinSS_(false), I = sinInfo_(ss), P = PropertiesService.getScriptProperties();
  const novo = sinNovo_(I);
  if (ctx.base === 'Gerir') sinGatilho_();
  return { mes: String(I.mes || ''), mes_txt: sinMesTxt_(I.mes), uf: String(I.uf || 'RS'), importado_em: String(I.importado_em || ''), importado_por: String(I.importado_por || ''),
    insumos: num_(I.insumos), composicoes: num_(I.composicoes), itens: num_(I.itens), resumo: String(I.resumo || ''), novo: novo, verificado_em: P.getProperty('SINAPI_VERIFICADO') || '', nivel: ctx.base };
}
/* índice enxuto para a busca no app (guardado no aparelho até mudar o mês) */
function sinapiIndice_(q, ctx) {
  const ss = sinSS_(false);
  if (!ss) return { mes: '', composicoes: [], insumos: [] };
  const I = sinInfo_(ss), r4 = n => Math.round(num_(n) * 10000) / 10000;
  return {
    mes: String(I.mes || ''),
    composicoes: sinTab_('SinapiComposicoes', ss).all().map(c => [String(c.codigo), c.descricao, c.unidade, c.grupo, c.situacao, r4(c.custo_sd), r4(c.custo_cd),
      [r4(c.mat_sd), r4(c.mo_sd), r4(c.eq_sd), r4(c.sv_sd)], [r4(c.mat_cd), r4(c.mo_cd), r4(c.eq_cd), r4(c.sv_cd)]]),
    insumos: sinTab_('SinapiInsumos', ss).all().map(i => [String(i.codigo), i.descricao, i.unidade, i.classe, r4(i.preco_sd), r4(i.preco_cd)])
  };
}
/* uma composição aberta: itens (insumos e composições auxiliares) com preço nos dois regimes */
function sinapiComposicao_(q, ctx) {
  const ss = sinSS_(false);
  if (!ss) throw new Error('O SINAPI ainda não foi importado.');
  // q.codigos (lista): várias de uma vez, lendo as abas uma vez só (Excel do orçamento); as que não estão no mês ficam de fora
  const lista = Array.isArray(q.codigos) ? q.codigos.map(String) : [String(q.codigo)], C = {}, I = {}, por = {};
  sinTab_('SinapiComposicoes', ss).all().forEach(c => { C[String(c.codigo)] = c; });
  if (!Array.isArray(q.codigos) && !C[lista[0]]) throw new Error('Composição ' + lista[0] + ' não está no SINAPI deste mês.');
  sinTab_('SinapiInsumos', ss).all().forEach(i => { I[String(i.codigo)] = i; });
  lista.forEach(k => { por[k] = []; });
  sinTab_('SinapiItens', ss).all().forEach(x => {
    const dono = por[String(x.composicao)];
    if (!dono) return;
    const k = String(x.codigo), aux = x.tipo === 'C', r = aux ? C[k] : I[k];
    dono.push({ tipo: aux ? 'C' : 'I', codigo: k, descricao: r ? r.descricao : '(não encontrado)', unidade: r ? r.unidade : '', classe: aux ? 'COMPOSIÇÃO' : r ? r.classe : '', coef: num_(x.coef),
      preco_sd: r ? num_(aux ? r.custo_sd : r.preco_sd) : 0, preco_cd: r ? num_(aux ? r.custo_cd : r.preco_cd) : 0 });
  });
  const comp = k => { const c = C[k]; return { codigo: k, descricao: c.descricao, unidade: c.unidade, grupo: c.grupo, situacao: c.situacao, custo_sd: num_(c.custo_sd), custo_cd: num_(c.custo_cd) }; };
  const mes = String(sinInfo_(ss).mes || '');
  if (Array.isArray(q.codigos)) return { mes: mes, composicoes: lista.filter(k => C[k]).map(k => ({ composicao: comp(k), itens: por[k] })) };
  return { mes: mes, composicao: comp(lista[0]), itens: por[lista[0]] };
}
/* custo por categoria de um item do SINAPI (composição ou insumo) no regime pedido — usado no orçamento */
function sinCustoItem_(ix, fonte, codigo, regime) {
  const r = regime === 'cd' ? 'cd' : 'sd', k = String(codigo);
  if (fonte === 'SINAPI-INSUMO') {
    const i = ix.I[k];
    if (!i) throw new Error('Insumo ' + k + ' não está no SINAPI deste mês.');
    const p = num_(i['preco_' + r]), cat = sinCat_(i.classe), o = { unit_mat: 0, unit_mo: 0, unit_eq: 0, unit_sv: 0 };
    o['unit_' + cat] = p;
    return o;
  }
  const c = ix.C[k];
  if (!c) throw new Error('Composição ' + k + ' não está no SINAPI deste mês.');
  return { unit_mat: num_(c['mat_' + r]), unit_mo: num_(c['mo_' + r]), unit_eq: num_(c['eq_' + r]), unit_sv: num_(c['sv_' + r]) };
}
function sinIndiceServidor_() {
  const ss = sinSS_(false), ix = { C: {}, I: {}, mes: '' };
  if (!ss) return ix;
  sinTab_('SinapiComposicoes', ss).all().forEach(c => { ix.C[String(c.codigo)] = c; });
  sinTab_('SinapiInsumos', ss).all().forEach(i => { ix.I[String(i.codigo)] = i; });
  ix.mes = String(sinInfo_(ss).mes || '');
  return ix;
}
/* classe do insumo SINAPI → categoria do orçamento */
function sinCat_(classe) {
  const s = norm_(classe);
  if (/mao de obra|encargos/.test(s)) return 'mo';     // encargos complementares (EPI, transporte, alimentação) andam com a mão de obra
  if (/equipamento/.test(s)) return 'eq';
  if (/servico/.test(s)) return 'sv';
  return 'mat';
}

/* ---------- importação (o app manda em lotes) ---------- */
function sinapiImportar_(q, ctx) {
  const etapa = String(q.etapa);
  if (etapa === 'inicio') {
    const mes = String(q.mes || '');
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mês de referência inválido.');
    const ss = sinSS_(true);
    // abas novas em rascunho ("_novo"): o SINAPI em uso continua valendo até o fim da importação
    Object.keys(SIN_LOTE_TAB_).forEach(k => {
      const n = '_novo_' + SIN_LOTE_TAB_[k], sh = ss.getSheetByName(n);
      if (sh) ss.deleteSheet(sh);
      Object.keys(_tabs).forEach(t => { if (t.indexOf(ss.getId() + '|') === 0) delete _tabs[t]; });
      tabela_(ss, n, SIN_SCHEMA_[SIN_LOTE_TAB_[k]]);
    });
    CacheService.getScriptCache().put('sin_imp', JSON.stringify({ mes: mes, uf: String(q.uf || 'RS'), origem: String(q.origem || '').slice(0, 200), por: ctx.u.nome }), 21600);
    return { ok: true };
  }
  const cfg = JSON.parse(CacheService.getScriptCache().get('sin_imp') || 'null');
  if (!cfg) throw new Error('Importação expirou: comece de novo.');
  const ss = sinSS_(false);
  if (etapa === 'lote') {
    const nome = SIN_LOTE_TAB_[q.tab];
    if (!nome) throw new Error('Lote inválido.');
    const cols = SIN_SCHEMA_[nome], linhas = [].concat(q.linhas || []);
    if (!linhas.length) return { n: 0 };
    const sh = ss.getSheetByName('_novo_' + nome);
    if (!sh) throw new Error('Importação expirou: comece de novo.');
    const ini = Math.max(sh.getLastRow(), 1) + 1;
    // texto que o Planilhas trocaria por número/data (código "0123", "1.1") vai com apóstrofo
    sh.getRange(ini, 1, linhas.length, cols.length).setValues(linhas.map(l => cols.map((c, j) => { const v = l[j] == null ? '' : l[j]; return typeof v === 'string' && TEXTO_FORCADO_.test(v) ? "'" + v : v; })));
    return { n: linhas.length };
  }
  if (etapa === 'fim') {
    const novos = {};
    // os lotes gravaram direto nas abas "_novo_": esquece o que já tinha sido lido delas
    Object.keys(_tabs).forEach(t => { if (t.indexOf(ss.getId() + '|') === 0) delete _tabs[t]; });
    Object.keys(SIN_LOTE_TAB_).forEach(k => { novos[k] = tabela_(ss, '_novo_' + SIN_LOTE_TAB_[k], SIN_SCHEMA_[SIN_LOTE_TAB_[k]]).all(); });
    if (!novos.insumos.length || !novos.composicoes.length) throw new Error('O arquivo não trouxe insumos ou composições do ' + cfg.uf + '.');
    // o que mudou de preço nos insumos (fica no histórico)
    const ant = {}, H = sinTab_('SinapiHist', ss), mudou = [];
    const antInfo = sinInfo_(ss);
    sinTab_('SinapiInsumos', ss).all().forEach(i => { ant[String(i.codigo)] = i; });
    let soma = 0, nVar = 0;
    novos.insumos.forEach(i => {
      const a = ant[String(i.codigo)];
      if (!a) return;
      const de = num_(a.preco_sd), para = num_(i.preco_sd);
      if (Math.abs(de - para) > 0.004 || Math.abs(num_(a.preco_cd) - num_(i.preco_cd)) > 0.004) {
        mudou.push({ mes: cfg.mes, codigo: String(i.codigo), descricao: String(i.descricao).slice(0, 120), de_sd: de, para_sd: para, de_cd: num_(a.preco_cd), para_cd: num_(i.preco_cd) });
        if (de > 0) { soma += (para - de) / de; nVar++; }
      }
    });
    if (antInfo.mes && String(antInfo.mes) !== cfg.mes) H.insertMany(mudou);
    // troca as abas: as novas passam a valer
    Object.keys(SIN_LOTE_TAB_).forEach(k => {
      const nome = SIN_LOTE_TAB_[k], velha = ss.getSheetByName(nome), nova = ss.getSheetByName('_novo_' + nome);
      if (velha) ss.deleteSheet(velha);
      nova.setName(nome);
    });
    Object.keys(_tabs).forEach(t => { if (t.indexOf(ss.getId() + '|') === 0) delete _tabs[t]; });
    const resumo = antInfo.mes && String(antInfo.mes) !== cfg.mes ? plural_(mudou.length, 'insumo mudou', 'insumos mudaram') + ' de preço desde ' + sinMesTxt_(antInfo.mes) + (nVar ? ' (média ' + (soma / nVar * 100 >= 0 ? '+' : '') + (Math.round(soma / nVar * 1000) / 10).toLocaleString('pt-BR') + '%)' : '') : 'primeira importação';
    sinInfoGravar_(ss, { mes: cfg.mes, uf: cfg.uf, importado_em: agora_(), importado_por: cfg.por, origem: cfg.origem, insumos: novos.insumos.length, composicoes: novos.composicoes.length, itens: novos.itens.length, resumo: resumo });
    CacheService.getScriptCache().remove('sin_imp');
    log_(ctx, 'sinapi_importar', cfg.uf + ' ' + cfg.mes + ' · ' + novos.insumos.length + ' insumos · ' + novos.composicoes.length + ' composições');
    return { msg: 'SINAPI ' + cfg.uf + ' ' + sinMesTxt_(cfg.mes) + ' importado: ' + plural_(novos.insumos.length, 'insumo', 'insumos') + ' e ' + plural_(novos.composicoes.length, 'composição', 'composições') + ' · ' + resumo + '.', mes: cfg.mes };
  }
  throw new Error('Etapa desconhecida.');
}

/* ---------- arquivo da Caixa: o servidor baixa e entrega ao app em partes ---------- */
const SIN_PARTE_ = 4 * 1024 * 1024;
function sinUrls_(mes) { const b = SIN_URL_ + mes + '-formato-xlsx'; return [b + '_Retificacao02.zip', b + '_Retificacao01.zip', b + '.zip']; }
/* procura o arquivo do mês na Caixa (pede só o 1º byte para não baixar à toa); devolve o endereço ou o motivo de não ter achado */
function sinAchar_(mes) {
  const motivos = [];
  for (const u of sinUrls_(mes)) {
    try {
      const r = UrlFetchApp.fetch(u, { method: 'get', headers: { Range: 'bytes=0-0' }, muteHttpExceptions: true, followRedirects: true });
      const c = r.getResponseCode(), tipo = String((r.getHeaders() || {})['Content-Type'] || '');
      if ((c === 200 || c === 206) && !/html/i.test(tipo)) return { url: u };
      motivos.push(c === 404 ? 404 : c + (tipo ? ' ' + tipo.split(';')[0] : ''));
    } catch (e) { motivos.push('erro: ' + String(e.message || e).slice(0, 80)); }
  }
  const bloqueio = motivos.some(m => m !== 404);
  return { url: '', bloqueio: bloqueio, motivo: bloqueio ? 'o site da Caixa recusou o servidor (' + motivos.filter(m => m !== 404).join(', ') + ')' : 'o arquivo ainda não está no site da Caixa' };
}
function sinapiBaixar_(q, ctx) {
  const mes = String(q.mes || ''), parte = Math.max(0, Math.round(num_(q.parte)));
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mês inválido.');
  const P = PropertiesService.getScriptProperties();
  let guardado = null;
  try { guardado = JSON.parse(P.getProperty('SINAPI_ZIP') || 'null'); } catch (e) { guardado = null; }
  let arq = null;
  if (guardado && guardado.mes === mes) { try { arq = DriveApp.getFileById(guardado.id); } catch (e) { arq = null; } }
  if (!arq) {
    const ach = sinAchar_(mes), url = ach.url;
    if (!url) throw new Error(ach.bloqueio ? 'Não deu para baixar pelo servidor: ' + ach.motivo + '. Use "Baixar da Caixa" (o arquivo baixa pelo seu navegador) e depois "Escolher arquivo".'
      : 'O SINAPI de ' + sinMesTxt_(mes) + ' ainda não está no site da Caixa. Escolha um mês anterior ou importe um arquivo baixado.');
    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) throw new Error('Não consegui baixar o arquivo da Caixa (código ' + r.getResponseCode() + ').');
    const blob = r.getBlob().setName('SINAPI-' + mes + '.zip');
    if (guardado) { try { DriveApp.getFileById(guardado.id).setTrashed(true); } catch (e) { /* já foi */ } }
    arq = DriveApp.createFile(blob);
    P.setProperty('SINAPI_ZIP', JSON.stringify({ mes: mes, id: arq.getId(), url: url }));
  }
  const bytes = arq.getBlob().getBytes(), partes = Math.ceil(bytes.length / SIN_PARTE_);
  if (parte >= partes) throw new Error('Parte inexistente.');
  return { partes: partes, tamanho: bytes.length, parte: parte, b64: Utilities.base64Encode(bytes.slice(parte * SIN_PARTE_, (parte + 1) * SIN_PARTE_)) };
}

/* ---------- conferência diária: a Caixa já publicou o mês seguinte? ---------- */
function sinapiVerificar() {
  const ss = sinSS_(false), I = sinInfo_(ss), P = PropertiesService.getScriptProperties();
  const hoje = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM');
  P.setProperty('SINAPI_VERIFICADO', agora_());
  // a Caixa publica o mês M lá pelo dia 10 do mês M+1: confere do mais novo possível (mês passado) para trás até o seguinte ao importado
  const ant = m => { let y = +m.slice(0, 4), n = +m.slice(5, 7) - 1; if (n < 1) { n = 12; y--; } return y + '-' + ('0' + n).slice(-2); };
  const ultimo = I.mes ? String(I.mes) : ant(ant(ant(hoje)));
  for (let m = ant(hoje), k = 0; m > ultimo && k < 3; m = ant(m), k++) {
    const ach = sinAchar_(m);
    if (ach.url) { P.setProperty('SINAPI_NOVO', JSON.stringify({ mes: m, url: ach.url, achado_em: agora_() })); return 'novo ' + m; }
    if (ach.bloqueio) { P.setProperty('SINAPI_VERIFICADO', agora_() + ' (a Caixa recusa o servidor: o aviso segue o calendário)'); return 'bloqueado'; }
  }
  return I.mes && ant(hoje) <= String(I.mes) ? 'em dia' : 'ainda não saiu';
}
function sinGatilho_() {
  try {
    if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'sinapiVerificar')) ScriptApp.newTrigger('sinapiVerificar').timeBased().everyDays(1).atHour(7).create();
  } catch (e) { /* sem permissão de gatilho: a conferência roda quando alguém abre a tela do SINAPI */ }
}
/* aviso no sino para quem gerencia a base de preços */
function sinNotif_(ctx) {
  if (ctx.base !== 'Gerir' && !ctx.admin) return [];
  const novo = sinNovo_(sinInfo_(sinSS_(false)));
  if (!novo) return [];
  return [{ id: 'sinapi|' + novo.mes, obra: '', obra_nome: 'Orçamentos', numero: 'SINAPI ' + sinMesTxt_(novo.mes), rota: '#/orc/sinapi', etapa: 'sinapi', texto: 'SINAPI ' + sinMesTxt_(novo.mes) + (novo.confirmado ? ' publicado pela Caixa' : ' deve ter saído na Caixa') + ' — baixar e importar', resumo: '', situacao: '', prioridade: '', quando: novo.achado_em || '' }];
}

/* ---------- trazer do SINAPI para a base da Size ---------- */
const sinFonte_ = (mes, regime) => ('SINAPI RS ' + sinMesTxt_(mes) + ' · ' + SIN_REGIMES_[regime]).slice(0, 80);
/* insumo do SINAPI vira (ou atualiza) o insumo SINAPI-<código> da base; devolve true se foi criado agora */
function sinInsBase_(i, regime, fonte, ctx) {
  const Ti = central_('Insumos'), agora = new Date(), ic = 'SINAPI-' + i.codigo, preco = num_(i['preco_' + regime]);
  const TIPO = { mat: 'Material', mo: 'Mão de obra', eq: 'Equipamento', sv: 'Serviço' };
  const r = Ti.all().find(x => String(x.codigo) === ic);
  if (!r) { Ti.insert({ codigo: ic, descricao: String(i.descricao).slice(0, 300), unidade: i.unidade, tipo: TIPO[sinCat_(i.classe)], grupo: 'SINAPI', preco: preco, data_preco: baseHoje_(), fonte: fonte, obs: '', ativo: 'Sim', criado_em: agora, atualizado_em: agora, atualizado_por: ctx.u.nome }); return true; }
  if (Math.abs(num_(r.preco) - preco) > 0.004 || String(r.fonte) !== fonte) {
    if (Math.abs(num_(r.preco) - preco) > 0.004) central_('InsumoPrecos').insert({ insumo: ic, data: agora, de: num_(r.preco), para: preco, origem: fonte, usuario: ctx.u.nome });
    Object.assign(r, { preco: preco, data_preco: baseHoje_(), fonte: fonte, ativo: 'Sim', atualizado_em: agora, atualizado_por: ctx.u.nome });
    Ti.update(r);
  }
  return false;
}
/* um insumo do SINAPI para a base (usado no editor de composição) */
function sinapiInsumoParaBase_(q, ctx) {
  const ss = sinSS_(false);
  if (!ss) throw new Error('O SINAPI ainda não foi importado.');
  const regime = q.regime === 'cd' ? 'cd' : 'sd', cod = String(q.codigo);
  const i = sinTab_('SinapiInsumos', ss).all().find(x => String(x.codigo) === cod);
  if (!i) throw new Error('Insumo ' + cod + ' não está no SINAPI deste mês.');
  if (String(i['preco_' + regime]) === '') throw new Error('O insumo ' + cod + ' está sem preço no SINAPI deste mês.');
  const novo = sinInsBase_(i, regime, sinFonte_(String(sinInfo_(ss).mes || ''), regime), ctx);
  return { codigo: 'SINAPI-' + cod, msg: (novo ? 'Insumo trazido do SINAPI: ' : 'Insumo do SINAPI atualizado na base: ') + 'SINAPI-' + cod + ' · ' + brl_(i['preco_' + regime]) + '/' + i.unidade + '.' };
}

/* ---------- copiar uma composição do SINAPI para a base da Size (vira composição de insumos, com a origem anotada) ---------- */
function sinapiParaBase_(q, ctx) {
  const ss = sinSS_(false);
  if (!ss) throw new Error('O SINAPI ainda não foi importado.');
  const regime = q.regime === 'cd' ? 'cd' : 'sd', cod = String(q.codigo), mes = String(sinInfo_(ss).mes || '');
  const C = {}, I = {}, itensDe = {};
  sinTab_('SinapiComposicoes', ss).all().forEach(c => { C[String(c.codigo)] = c; });
  sinTab_('SinapiInsumos', ss).all().forEach(i => { I[String(i.codigo)] = i; });
  sinTab_('SinapiItens', ss).all().forEach(x => { (itensDe[String(x.composicao)] = itensDe[String(x.composicao)] || []).push(x); });
  const c = C[cod];
  if (!c) throw new Error('Composição ' + cod + ' não está no SINAPI deste mês.');
  // abre as composições auxiliares até os insumos (coeficientes multiplicados)
  const acc = {};
  const abrir = (k, f, pilha) => (itensDe[k] || []).forEach(x => {
    const kk = String(x.codigo), cf = f * num_(x.coef);
    if (x.tipo === 'C') { if (pilha.indexOf(kk) < 0) abrir(kk, cf, pilha.concat(kk)); return; }
    acc[kk] = (acc[kk] || 0) + cf;
  });
  abrir(cod, 1, [cod]);
  if (!Object.keys(acc).length) throw new Error('A composição ' + cod + ' não tem insumos no analítico.');
  const fonte = sinFonte_(mes, regime), novoCod = 'SINAPI-' + cod;
  let nIns = 0;
  Object.keys(acc).forEach(k => { if (I[k] && sinInsBase_(I[k], regime, fonte, ctx)) nIns++; });
  const itens = Object.keys(acc).filter(k => I[k]).map(k => ({ ref: 'SINAPI-' + k, ref_tipo: 'I', coef: Math.round(acc[k] * 1e6) / 1e6 }));
  const existe = central_('Composicoes').all().some(x => String(x.codigo) === novoCod);
  baseComposicaoSalvar_({ composicao: { codigo: novoCod, original: existe ? novoCod : undefined, descricao: String(c.descricao).slice(0, 300), unidade: c.unidade, grupo: c.grupo || 'SINAPI', obs: 'Copiada do ' + fonte }, itens: itens }, ctx);
  const Tc = central_('Composicoes'), rc = Tc.all().find(x => String(x.codigo) === novoCod);
  if (rc) { rc.fonte = fonte; Tc.update(rc); }
  return { msg: 'Composição ' + cod + ' copiada para a base da Size como ' + novoCod + ' (' + plural_(itens.length, 'insumo', 'insumos') + (nIns ? ', ' + nIns + ' novos' : '') + ').', codigo: novoCod };
}
