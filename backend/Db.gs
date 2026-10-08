/**
 * Acesso às planilhas por NOME de coluna (a ordem das colunas pode mudar à vontade;
 * colunas que faltarem são criadas sozinhas no fim da aba).
 */
const SCHEMA_CENTRAL = {
  Config: ['chave', 'valor', 'descricao'],
  Usuarios: ['id', 'nome', 'login', 'email', 'telefone', 'admin', 'ativo', 'trocar_senha', 'senha_hash', 'salt', 'criado_em', 'ultimo_acesso'],
  Acessos: ['usuario_id', 'usuario', 'obra_id', 'obra', 'perfil', 'permissoes'],
  Obras: ['id', 'sigla', 'nome', 'endereco', 'ativa', 'planilha_id', 'pasta_id', 'criada_em', 'email_financeiro', 'lat', 'lng', 'feriados'],
  Perfis: ['perfil', 'permissoes', 'descricao'],
  MateriaisPadrao: ['codigo', 'descricao', 'unidade', 'categoria'],
  ServicosPadrao: ['codigo', 'grupo', 'servico', 'unidade', 'ativo'],
  Unidades: ['unidade'],
  Log: ['data', 'usuario', 'obra', 'acao', 'detalhe']
};
const SCHEMA_OBRA = {
  Pedidos: ['numero', 'criado_em', 'solicitante_id', 'solicitante', 'frente', 'prioridade', 'necessidade', 'observacoes',
    'status', 'entrega', 'fin', 'cotado_a', 'fornecedor_cod', 'fornecedor', 'valor_total', 'condicao', 'prazo_fat', 'previsao',
    'excecao_orc', 'aprovado_por', 'aprovado_em', 'liberado_em', 'recebido_em', 'nf_numero', 'nf_em', 'vencimento',
    'forma_pagto', 'pago_em', 'pago_por', 'pasta_url', 'historico', 'atualizado_em'],
  Itens: ['pedido', 'item', 'material_cod', 'descricao', 'unidade', 'qtd', 'qtd_recebida', 'valor_unit'],
  Orcamentos: ['id', 'pedido', 'fornecedor_cod', 'fornecedor', 'valor', 'prazo_entrega', 'condicao', 'arquivo_id', 'arquivo_url', 'origem', 'recebido_em', 'registrado_por'],
  Fornecedores: ['codigo', 'nome', 'cnpj', 'contato', 'telefone', 'email', 'cidade', 'materiais', 'condicao', 'obs', 'ativo'],
  Materiais: ['codigo', 'descricao', 'unidade', 'categoria', 'estoque_min', 'ativo'],
  Frentes: ['codigo', 'nome', 'descricao', 'ativa'],
  Recebimentos: ['id', 'pedido', 'item', 'material_cod', 'descricao', 'qtd', 'unidade', 'data', 'usuario', 'nf', 'obs'],
  Estoque: ['id', 'data', 'tipo', 'material_cod', 'descricao', 'unidade', 'qtd', 'pedido', 'frente', 'usuario', 'obs'],
  Arquivos: ['id', 'pedido', 'tipo', 'nome', 'url', 'file_id', 'data', 'usuario', 'origem'],
  // módulo Execução / Diário de obra
  Etapas: ['codigo', 'nome', 'local', 'frente', 'responsavel', 'obs', 'ativa', 'criado_em', 'criado_por'],
  EtapaItens: ['id', 'etapa', 'ordem', 'servico_cod', 'servico', 'grupo', 'unidade', 'qtd_prevista', 'inicio', 'termino', 'qtd_original', 'inicio_original', 'termino_original', 'ativo'],
  Equipes: ['codigo', 'nome', 'pessoas', 'encarregado', 'ativa'],
  Diarios: ['numero', 'data', 'status', 'condicao', 'aditivo', 'responsavel_id', 'responsavel', 'chuva_manha', 'chuva_tarde', 'chuva_trabalho', 'chuva_dia',
    'tmin', 'tmax', 'vento', 'sugestao', 'ocorrencias', 'obs', 'enviado_por', 'enviado_em', 'revisado_por', 'revisado_em', 'clima_final', 'clima_json', 'criado_em', 'atualizado_em'],
  Producao: ['id', 'diario', 'data', 'etapa', 'item_id', 'servico', 'unidade', 'qtd', 'obs', 'usuario_id', 'usuario', 'lancado_em', 'atualizado_em', 'cliente_id'],
  EquipesDia: ['diario', 'data', 'etapa', 'equipe', 'pessoas', 'usuario'],
  FotosExec: ['id', 'diario', 'data', 'etapa', 'legenda', 'tirada_em', 'lat', 'lng', 'usuario', 'nome', 'file_id', 'mini_id', 'enviada_em', 'cliente_id'],
  AlteracoesExec: ['data', 'usuario', 'tipo', 'ref', 'etapa', 'campo', 'de', 'para', 'motivo'],
  AvisosExec: ['id', 'data', 'etapa', 'etapa_nome', 'tipo', 'texto', 'autor', 'status', 'ciente_por', 'ciente_em']
};

let _central = null;
const _tabs = {};

function centralSS_() {
  if (_central) return _central;
  const id = PropertiesService.getScriptProperties().getProperty('CENTRAL_ID');
  if (!id) throw new Error('Sistema não configurado: rode setup() no editor do Apps Script.');
  return (_central = SpreadsheetApp.openById(id));
}
function central_(nome) { return tabela_(centralSS_(), nome, SCHEMA_CENTRAL[nome]); }
function obraTab_(ctx, nome) { return tabela_(ctx.ss, nome, SCHEMA_OBRA[nome]); }

function tabela_(ss, nome, cols) {
  const k = ss.getId() + '|' + nome;
  if (_tabs[k]) return _tabs[k];
  let sh = ss.getSheetByName(nome);
  if (!sh) { sh = ss.insertSheet(nome); sh.setFrozenRows(1); }
  const n = sh.getLastColumn();
  const head = n ? sh.getRange(1, 1, 1, n).getValues()[0].map(h => String(h).trim()) : [];
  while (head.length && !head[head.length - 1]) head.pop();
  const falta = cols.filter(c => head.indexOf(c) < 0);
  if (falta.length) {
    sh.getRange(1, head.length + 1, 1, falta.length).setValues([falta]).setFontWeight('bold');
    falta.forEach(c => head.push(c));
  }
  return (_tabs[k] = new Tabela_(sh, head));
}

function Tabela_(sh, head) { this.sh = sh; this.head = head; this._rows = null; }
Tabela_.prototype.all = function () {
  if (this._rows) return this._rows;
  const n = this.sh.getLastRow(), h = this.head, rows = [];
  const v = n > 1 ? this.sh.getRange(2, 1, n - 1, h.length).getValues() : [];
  v.forEach((r, i) => {
    if (r.every(x => x === '')) return;
    const o = { _l: i + 2 };
    h.forEach((c, j) => { o[c] = r[j]; });
    rows.push(o);
  });
  return (this._rows = rows);
};
Tabela_.prototype.linha_ = function (o) { return this.head.map(c => (o[c] == null ? '' : o[c])); };
Tabela_.prototype.insert = function (o) { return this.insertMany([o])[0]; };
Tabela_.prototype.insertMany = function (lista) {
  if (!lista.length) return lista;
  const all = this.all(), ini = this.sh.getLastRow() + 1;
  this.sh.getRange(ini, 1, lista.length, this.head.length).setValues(lista.map(o => this.linha_(o)));
  lista.forEach((o, i) => { o._l = ini + i; all.push(o); });
  return lista;
};
Tabela_.prototype.update = function (o) {
  this.sh.getRange(o._l, 1, 1, this.head.length).setValues([this.linha_(o)]);
};
Tabela_.prototype.removeWhere = function (fn) {
  const linhas = this.all().filter(fn).map(o => o._l).sort((a, b) => b - a);
  linhas.forEach(l => this.sh.deleteRow(l));
  this._rows = null;
  return linhas.length;
};
Tabela_.prototype.proxCodigo = function (campo, prefixo, digitos) {
  let max = 0;
  this.all().forEach(o => {
    const s = String(o[campo] || '');
    if (s.indexOf(prefixo) !== 0) return;
    const n = parseInt(s.slice(prefixo.length).replace(/\D/g, ''), 10);
    if (n > max) max = n;
  });
  return prefixo + ('0000000' + (max + 1)).slice(-digitos);
};

/* ---------- utilidades ---------- */
function tz_() { return Session.getScriptTimeZone(); }
function agora_() { return Utilities.formatDate(new Date(), tz_(), 'dd/MM/yyyy HH:mm'); }
function hoje_() { return Utilities.formatDate(new Date(), tz_(), 'dd/MM/yyyy'); }
function stamp_() { return Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd-HHmm'); }
function norm_(s) { return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function sim_(v) { return v === true || /^(sim|s|true|1|x|yes)$/i.test(String(v).trim()); }
function num_(x) {
  if (typeof x === 'number') return x;
  let s = String(x == null ? '' : x).trim().replace(/[R$\s]/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}
function h_(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function limpa_(t) { return String(t || 'arquivo').replace(/[^\w.\- ]/g, '_').slice(0, 80); }
function dataDe_(s) {
  if (!s) return '';
  if (s instanceof Date) return s;
  const a = String(s).slice(0, 10).split('-');
  return a.length === 3 ? new Date(+a[0], a[1] - 1, +a[2]) : '';
}
function brl_(v) { return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtVal_(v) { return v instanceof Date ? Utilities.formatDate(v, tz_(), 'yyyy-MM-dd HH:mm') : v; }
function pub_(o) {
  const r = {};
  Object.keys(o).forEach(k => { if (k !== '_l' && k !== 'senha_hash' && k !== 'salt') r[k] = fmtVal_(o[k]); });
  return r;
}
const APP_URL_PADRAO = 'https://renancod.github.io/size/';

function config_() {
  const c = {};
  const C = central_('Config');
  C.all().forEach(r => { c[String(r.chave).trim()] = r.valor; });
  // o app mudou de endereço (compras-size → size): corrige a configuração uma vez
  if (/\/compras-size\/?$/.test(String(c.APP_URL || ''))) {
    const r = C.all().find(x => String(x.chave).trim() === 'APP_URL');
    r.valor = APP_URL_PADRAO;
    C.update(r);
    c.APP_URL = APP_URL_PADRAO;
  }
  return c;
}
function log_(ctx, acao, detalhe) {
  try {
    central_('Log').insert({ data: new Date(), usuario: ctx.u.nome, obra: ctx.obra ? ctx.obra.nome : '', acao: acao, detalhe: String(detalhe || '').slice(0, 500) });
  } catch (e) { /* log nunca derruba a operação */ }
}
