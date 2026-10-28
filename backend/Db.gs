/**
 * Acesso às planilhas por NOME de coluna (a ordem das colunas pode mudar à vontade;
 * colunas que faltarem são criadas sozinhas no fim da aba).
 */
const SCHEMA_CENTRAL = {
  Config: ['chave', 'valor', 'descricao'],
  Usuarios: ['id', 'nome', 'login', 'email', 'telefone', 'admin', 'ativo', 'trocar_senha', 'senha_hash', 'salt', 'criado_em', 'ultimo_acesso', 'orcamentos'],
  Acessos: ['usuario_id', 'usuario', 'obra_id', 'obra', 'perfil', 'permissoes'],
  Obras: ['id', 'sigla', 'nome', 'endereco', 'ativa', 'planilha_id', 'pasta_id', 'criada_em', 'email_financeiro', 'lat', 'lng', 'feriados'],
  Perfis: ['perfil', 'permissoes', 'descricao'],
  MateriaisPadrao: ['codigo', 'descricao', 'unidade', 'categoria'],
  ServicosPadrao: ['codigo', 'grupo', 'servico', 'unidade', 'ativo', 'fvs_modelo'],
  FvsModelos: ['codigo', 'nome', 'categoria', 'tipo', 'revisao', 'data_rev', 'blocos_json', 'ativo', 'revisar', 'nota'],
  Unidades: ['unidade'],
  Aparelhos: ['token', 'usuario_id', 'usuario', 'ua', 'criado_em', 'vistos'],
  Log: ['data', 'usuario', 'obra', 'acao', 'detalhe'],
  // base de preços da empresa (módulo Orçamentos): vale para todos os orçamentos, antes de existir a obra
  Insumos: ['codigo', 'descricao', 'unidade', 'tipo', 'grupo', 'preco', 'data_preco', 'fonte', 'obs', 'ativo', 'criado_em', 'atualizado_em', 'atualizado_por', 'foto_id'],
  InsumoPrecos: ['insumo', 'data', 'de', 'para', 'origem', 'usuario'],
  Composicoes: ['codigo', 'descricao', 'unidade', 'grupo', 'obs', 'fonte', 'ativo', 'criado_em', 'atualizado_em', 'atualizado_por'],
  // item da composição: insumo (I) ou composição auxiliar (C) × coeficiente por unidade; preço próprio vazio = preço do cadastro
  ComposicaoItens: ['composicao', 'ordem', 'ref_tipo', 'ref', 'coef', 'preco', 'obs'],
  // orçamentos de clientes (antes de existir a obra): cada revisão é uma linha; os custos dos itens ficam congelados no orçamento
  Propostas: ['id', 'numero', 'revisao', 'status', 'cliente', 'cliente_doc', 'contato', 'telefone', 'email', 'empreendimento', 'local', 'data_base', 'validade_dias',
    'bdi_pct', 'bdi_base', 'gestao_pct', 'gestao_base', 'prazo_txt', 'pagamento_txt', 'texto_cliente', 'obs', 'motivo', 'obra_id', 'historico_json',
    'criado_em', 'criado_por', 'atualizado_em', 'atualizado_por', 'enviado_em', 'decidido_em', 'cronograma_json'],
  // tipo E = etapa (título) · I = item (composição da base ou preço direto); unit_* = custo unitário por categoria
  // sem_bdi / sem_gestao: item fora do BDI ou da gestão (ex. AVA: mobilização e canteiro sem BDI)
  PropostaItens: ['proposta', 'ordem', 'tipo', 'codigo', 'comp_cod', 'descricao', 'unidade', 'qtd', 'unit_mat', 'unit_mo', 'unit_eq', 'unit_sv', 'obs', 'sem_bdi', 'sem_gestao']
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
  // frente geral; os valores (preço cobrado do cliente e custos orçados) são do orçamento do empreendimento; inicio/fim = cronograma físico-financeiro
  Frentes: ['codigo', 'nome', 'descricao', 'ativa', 'preco', 'custo_direto', 'adm_local', 'indiretas', 'tributos', 'inicio', 'fim'],
  Recebimentos: ['id', 'pedido', 'item', 'material_cod', 'descricao', 'qtd', 'unidade', 'data', 'usuario', 'nf', 'obs', 'frente'],
  Estoque: ['id', 'data', 'tipo', 'material_cod', 'descricao', 'unidade', 'qtd', 'pedido', 'frente', 'usuario', 'obs'],
  Arquivos: ['id', 'pedido', 'tipo', 'nome', 'url', 'file_id', 'data', 'usuario', 'origem'],
  // módulo Execução / Diário de obra
  Etapas: ['codigo', 'nome', 'local', 'frente', 'responsavel', 'obs', 'ativa', 'criado_em', 'criado_por', 'empreiteiro', 'contrato_tipo', 'contrato_numero', 'contrato_data', 'contrato_id'],
  EtapaItens: ['id', 'etapa', 'ordem', 'servico_cod', 'servico', 'grupo', 'unidade', 'qtd_prevista', 'inicio', 'termino', 'qtd_original', 'inicio_original', 'termino_original', 'ativo', 'contrato_item', 'orc_item'],
  Equipes: ['codigo', 'nome', 'pessoas', 'encarregado', 'ativa', 'empresa', 'responsavel', 'telefone', 'email', 'documento', 'endereco'],
  Diarios: ['numero', 'data', 'status', 'condicao', 'aditivo', 'responsavel_id', 'responsavel', 'chuva_manha', 'chuva_tarde', 'chuva_trabalho', 'chuva_dia',
    'tmin', 'tmax', 'vento', 'sugestao', 'ocorrencias', 'obs', 'enviado_por', 'enviado_em', 'revisado_por', 'revisado_em', 'clima_final', 'clima_json', 'criado_em', 'atualizado_em'],
  Producao: ['id', 'diario', 'data', 'etapa', 'item_id', 'servico', 'unidade', 'qtd', 'obs', 'usuario_id', 'usuario', 'lancado_em', 'atualizado_em', 'cliente_id'],
  EquipesDia: ['diario', 'data', 'etapa', 'equipe', 'pessoas', 'usuario'],
  FotosExec: ['id', 'diario', 'data', 'etapa', 'legenda', 'tirada_em', 'lat', 'lng', 'usuario', 'nome', 'file_id', 'mini_id', 'enviada_em', 'cliente_id'],
  AlteracoesExec: ['data', 'usuario', 'tipo', 'ref', 'etapa', 'campo', 'de', 'para', 'motivo'],
  AvisosExec: ['id', 'data', 'etapa', 'etapa_nome', 'tipo', 'texto', 'autor', 'status', 'ciente_por', 'ciente_em'],
  // FVS (ficha de verificação de serviço): uma por serviço da frente de trabalho
  Fvs: ['id', 'numero', 'modelo', 'modelo_nome', 'modelo_rev', 'categoria', 'tipo', 'modelo_json', 'etapa', 'item_id', 'servico', 'status', 'vistoria', 'checklist_json', 'nc_json', 'alteracao_sim', 'alteracao', 'alteracao_aut',
    'anexos_json', 'vistorias_json', 'historico_json', 'preenchido_por', 'enviado_em', 'enviado_por', 'aprovado_por', 'aprovado_em', 'motivo', 'hash', 'pasta_id', 'pdf_id', 'auto_aprovada', 'criado_em', 'criado_por', 'atualizado_em'],
  // Medições de empreiteiros (por frente de trabalho; só serviços concluídos e com FVS aprovada)
  Medicoes: ['id', 'numero', 'empreiteiro', 'empreiteiro_nome', 'de', 'ate', 'status', 'obs', 'criado_em', 'criado_por', 'enviado_em', 'enviado_por', 'aprovado_em', 'aprovado_por', 'motivo', 'hash', 'pasta_id', 'pdf_id', 'pago_em', 'pago_obs', 'auto_aprovada', 'historico_json', 'atualizado_em'],
  // Contratos de empreiteiros (planilha de serviços contratados; a frente de trabalho se liga a um contrato e a itens dele)
  Contratos: ['id', 'numero', 'empreiteiro', 'empreiteiro_nome', 'status', 'objeto', 'escopo', 'data_assinatura', 'local_assinatura', 'vigencia_ini', 'vigencia_fim', 'prazo_txt',
    'valor_global', 'permuta_valor', 'permuta_desc', 'pag_forma', 'pag_periodicidade', 'pag_obs', 'fat_nf_pct', 'fat_recibo_pct', 'retencoes', 'reajuste',
    'multa1_pct', 'multa2_pct', 'multa_diaria', 'garantia', 'aviso_dias', 'contratante_nome', 'contratante_doc', 'contratante_end', 'administradora', 'foro',
    'clausulas_extra', 'obs', 'pdf_id', 'pdf_nome', 'minuta_id', 'minuta_em', 'pasta_id', 'historico_json', 'criado_em', 'criado_por', 'atualizado_em'],
  // comp_cod: composição da base de preços (planilha central) de onde o serviço saiu
  ContratoItens: ['id', 'contrato', 'ordem', 'grupo', 'codigo', 'servico_cod', 'servico', 'unidade', 'qtd', 'unitario', 'ativo', 'orc_item', 'comp_cod'],
  // responsabilidades técnicas do contrato (ART, RRT, TRT…): condição para liberar o contrato para assinatura
  ContratoRT: ['id', 'contrato', 'tipo', 'descricao', 'numero', 'profissional', 'registro', 'emissao', 'arquivo_id', 'arquivo_nome', 'criado_por', 'criado_em', 'anexado_por', 'anexado_em'],
  ContratoAditivos: ['id', 'contrato', 'numero', 'data', 'tipo', 'descricao', 'valor', 'nova_vigencia', 'criado_por', 'criado_em'],
  MedicaoItens: ['medicao', 'item_id', 'etapa', 'etapa_nome', 'servico', 'unidade', 'qtd', 'concluido_em', 'complemento', 'contrato', 'fvs', 'rdos_json', 'dias_json'],
  // Orçamento da obra: o que cada frente geral (aba Frentes) precisa executar, com preço de referência de material e de mão de obra
  OrcItens: ['id', 'frente', 'ordem', 'codigo', 'servico_cod', 'servico', 'grupo', 'unidade', 'qtd', 'unit_material', 'unit_mo', 'obs', 'ativo', 'criado_em', 'criado_por', 'atualizado_em', 'unit_venda'],
  // materiais do orçamento: por serviço (coef = quanto gasta por unidade do serviço) ou direto na frente (qtd total)
  OrcMateriais: ['id', 'frente', 'orc_item', 'material_cod', 'descricao', 'unidade', 'coef', 'qtd', 'obs', 'ativo']
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
/* texto que o Google Planilhas trocaria por data ou número (código de item "1.1.1" vira 01/01/2001, "2.10" vira 2,1, "015/2026" vira data,
 * código de insumo "008" vira 8): vai com apóstrofo na frente, que força texto e não aparece na célula */
const TEXTO_FORCADO_ = /^(\d+(\.\d+)+|\d{1,4}\/\d{4}|0\d+)$/;
Tabela_.prototype.linha_ = function (o) { return this.head.map(c => { const v = o[c] == null ? '' : o[c]; return typeof v === 'string' && TEXTO_FORCADO_.test(v) ? "'" + v : v; }); };
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
/* regrava a aba inteira de uma vez (uma chamada só, em vez de apagar linha por linha) */
Tabela_.prototype.substituir = function (lista) {
  const w = this.head.length, linhas = lista.map(o => this.linha_(o)), tot = Math.max(this.sh.getLastRow() - 1, linhas.length);
  if (tot > 0) {
    for (let i = linhas.length; i < tot; i++) linhas.push(this.head.map(() => ''));
    this.sh.getRange(2, 1, tot, w).setValues(linhas);
  }
  lista.forEach((o, i) => { o._l = i + 2; });
  this._rows = lista.slice();
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
