/**
 * FVS · Ficha de Verificação de Serviço (controle de qualidade).
 *
 * Como funciona:
 *  - Modelos de FVS (central, valem para todas as obras): categoria → tipo → modelo com blocos e itens de verificação.
 *  - Ao abrir uma frente de trabalho (etapa), cada serviço recebe uma FVS (o engenheiro escolhe o modelo; o catálogo sugere).
 *    Também dá para abrir a FVS depois, pela tela do serviço.
 *  - A FVS fica vinculada aos diários de obra (RDO) em que o serviço teve produção: a lista cresce até o serviço terminar.
 *  - O engenheiro preenche (O aprovado · X reprovado · ⊗ aprovado após reinspeção · N não se aplica), anexa o croqui base
 *    (projeto com alturas e locações) e o croqui de execução (coletado em campo), informa se houve alteração em relação
 *    ao projeto (e quem autorizou) e envia para aprovação.
 *  - Quem tem permissão de aprovar (administrador/engenheiro) aprova ou devolve. Na aprovação a FVS ganha o número em sequência
 *    (FVS 001, 002…), é travada com um código de verificação e vai para Drive → obra → FVS → AAAA-MM → "FVS 001 · serviço".
 *  - Reinspeção: até 3 vistorias (a 3ª pode gerar multa para o executor, como na ficha de papel).
 */
const FVS_ST_ = { exec: 'Em execução', prep: 'Em preenchimento', aprov: 'Aguardando aprovação', ok: 'Aprovada', dev: 'Devolvida', canc: 'Cancelada' };
const FVS_TAXONOMIA_ = {
  Infraestrutura: ['Topografia e locação', 'Terraplenagem', 'Rede de esgoto', 'Rede pluvial', 'Rede de água', 'Rede elétrica', 'Pavimentação'],
  Civil: ['Fundação', 'Estrutura', 'Alvenaria', 'Revestimento', 'Piso', 'Impermeabilização', 'Cobertura', 'Esquadrias', 'Pintura', 'Instalações', 'Outros']
};
const FVS_RESULTADOS_ = ['', 'O', 'X', 'S', 'N'];

function json_(s, padrao) { try { const v = JSON.parse(s); return v == null ? padrao : v; } catch (e) { return padrao; } }
function hex_(bytes) { return bytes.map(b => ('0' + (b & 255).toString(16)).slice(-2)).join(''); }
function nomeArq_(t) { return String(t || '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90); }
function subpasta_(pai, nome) { const it = pai.getFoldersByName(nome); return it.hasNext() ? it.next() : pai.createFolder(nome); }
const numFvs_ = n => 'FVS ' + ('00' + n).slice(-3);

/* ---------- modelos ---------- */
function garantirFvsModelos_() {
  const T = central_('FvsModelos');
  if (T.all().length || typeof FVS_MODELOS_PADRAO_ === 'undefined') return T;
  T.insertMany(FVS_MODELOS_PADRAO_.map(m => ({
    codigo: m.codigo, nome: m.nome, categoria: m.categoria, tipo: m.tipo, revisao: m.revisao || '00', data_rev: m.data_rev || '',
    blocos_json: JSON.stringify(m.blocos || []), ativo: 'Sim', revisar: m.revisar ? 'Sim' : '', nota: m.nota || ''
  })));
  return T;
}
function modeloPub_(m) {
  const blocos = json_(m.blocos_json, []);
  return {
    codigo: m.codigo, nome: m.nome, categoria: m.categoria, tipo: m.tipo, revisao: m.revisao, data_rev: ymd_(m.data_rev), ativo: !/^n/i.test(String(m.ativo)),
    revisar: sim_(m.revisar), nota: m.nota || '', blocos: blocos, n_itens: blocos.reduce((t, b) => t + (b.itens || []).length, 0)
  };
}
function fvsModelos_(q, ctx) {
  return { modelos: garantirFvsModelos_().all().map(modeloPub_).sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt', { numeric: true })), taxonomia: FVS_TAXONOMIA_ };
}
function fvsModeloSalvar_(q, ctx) {
  const T = garantirFvsModelos_(), codigo = String(q.codigo || '').trim().toUpperCase(), nome = String(q.nome || '').trim();
  if (!/^[A-Z0-9][A-Z0-9. -]{1,19}$/.test(codigo)) throw new Error('Código da FVS inválido (ex.: FVS.04).');
  if (!nome) throw new Error('Informe o nome da FVS.');
  const categoria = String(q.categoria || '').trim(), tipo = String(q.tipo || '').trim();
  if (!FVS_TAXONOMIA_[categoria]) throw new Error('Escolha a categoria (Infraestrutura ou Civil).');
  if (!tipo) throw new Error('Informe o tipo (ex.: Rede de esgoto).');
  const blocos = [].concat(q.blocos || []).map(b => ({ titulo: String((b && b.titulo) || '').trim(), itens: [].concat((b && b.itens) || []).map(i => String(i || '').trim()).filter(Boolean) })).filter(b => b.itens.length);
  if (!blocos.length) throw new Error('Inclua pelo menos um item de verificação.');
  let m = q.original ? T.all().find(x => x.codigo === String(q.original).toUpperCase()) : T.all().find(x => x.codigo === codigo);
  if (T.all().some(x => x !== m && x.codigo === codigo)) throw new Error('Já existe uma FVS com esse código.');
  const novo = !m, hoje = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'), blocosJson = JSON.stringify(blocos);
  if (novo) m = { codigo: codigo, revisao: '00', data_rev: hoje, blocos_json: blocosJson };
  else if (m.blocos_json !== blocosJson) { m.revisao = ('0' + (num_(m.revisao) + 1)).slice(-2); m.data_rev = hoje; m.blocos_json = blocosJson; m.revisar = ''; }
  m.codigo = codigo; m.nome = nome; m.categoria = categoria; m.tipo = tipo; m.ativo = q.ativo === false ? 'Não' : 'Sim';
  if (novo) T.insert(m); else T.update(m);
  log_(ctx, novo ? 'fvs_modelo_criar' : 'fvs_modelo_editar', codigo + ' rev ' + m.revisao);
  return { msg: (novo ? 'Modelo criado: ' : 'Modelo salvo: ') + codigo + ' (revisão ' + m.revisao + ').', codigo: codigo };
}
/* sugestão de FVS para um serviço do catálogo (o engenheiro confirma ou troca) */
function fvsSugerido_(s, modelos) {
  if (s.fvs_modelo && modelos[s.fvs_modelo]) return s.fvs_modelo;
  const g = norm_(s.grupo), n = norm_(s.servico);
  const mapa = [
    [/drenagem pluvial/, 'FVS.03'], [/esgoto/, 'FVS.04'], [/locacao/, 'FVS.02'], [/compactac|aterro|regulariz/, 'FVS.05'],
    [/paver|bloquete/, 'FVS.30'], [/rede eletrica|eletrica enterrada/, 'FVS.27.1']
  ];
  for (let i = 0; i < mapa.length; i++) if ((mapa[i][0].test(g) || mapa[i][0].test(n)) && modelos[mapa[i][1]]) return mapa[i][1];
  return '';
}

/* ---------- abrir FVS (junto com a frente de trabalho ou depois) ---------- */
function fvsNova_(ctx, etapa, item, modelo) {
  const F = obraTab_(ctx, 'Fvs');
  if (F.all().some(f => String(f.item_id) === String(item.id) && String(f.modelo) === String(modelo.codigo) && f.status !== FVS_ST_.canc)) return null;
  const agora = new Date();
  return F.insert({
    id: 'FV-' + Utilities.getUuid().slice(0, 6), numero: '', modelo: modelo.codigo, modelo_nome: modelo.nome, modelo_rev: modelo.revisao, categoria: modelo.categoria, tipo: modelo.tipo,
    modelo_json: modelo.blocos_json || '[]', etapa: etapa.codigo, item_id: item.id, servico: item.servico, status: FVS_ST_.exec, vistoria: 1,
    checklist_json: '{}', nc_json: '[]', anexos_json: '[]', vistorias_json: '{}',
    historico_json: JSON.stringify([{ q: Utilities.formatDate(agora, tz_(), 'yyyy-MM-dd HH:mm'), por: ctx.u.nome, acao: 'Aberta', nota: 'Modelo ' + modelo.codigo + ' rev ' + modelo.revisao }]),
    criado_em: agora, criado_por: ctx.u.nome, atualizado_em: agora
  });
}
/* usado ao criar a etapa: escolhas = [{ item (linha criada), modelo (código | '-' | '') }] */
function fvsAbrirParaItens_(ctx, etapa, escolhas) {
  const modelos = {}, T = garantirFvsModelos_(), cat = garantirCatalogo_().all();
  T.all().forEach(m => { modelos[m.codigo] = m; });
  let abertas = 0;
  escolhas.forEach(e => {
    let cod = String(e.modelo || '').trim();
    if (cod === '-') return;
    if (!cod) { const sc = cat.find(s => String(s.codigo) === String(e.item.servico_cod)); cod = sc && sc.fvs_modelo ? String(sc.fvs_modelo) : ''; }
    const m = modelos[cod];
    if (m && fvsNova_(ctx, etapa, e.item, m)) abertas++;
  });
  return abertas;
}
function fvsCriar_(q, ctx) {
  const it = obraTab_(ctx, 'EtapaItens').all().find(x => String(x.id) === String(q.item_id) && !/^n/i.test(String(x.ativo)));
  if (!it) throw new Error('Serviço não encontrado.');
  const e = obraTab_(ctx, 'Etapas').all().find(x => String(x.codigo) === String(it.etapa)), m = garantirFvsModelos_().all().find(x => x.codigo === String(q.modelo));
  if (!m || /^n/i.test(String(m.ativo))) throw new Error('Escolha o modelo de FVS.');
  const f = fvsNova_(ctx, e, it, m);
  if (!f) throw new Error('Este serviço já tem uma FVS desse modelo.');
  log_(ctx, 'fvs_criar', f.id + ' ' + it.servico);
  return { msg: 'FVS aberta para ' + it.servico + '.', id: f.id };
}

/* ---------- leitura ---------- */
function fvsRdos_(ctx, f, prod) {
  const nums = {};
  (prod || obraTab_(ctx, 'Producao').all()).forEach(p => { if (String(p.item_id) === String(f.item_id) && num_(p.qtd) > 0) nums[num_(p.diario)] = ymd_(p.data); });
  return Object.keys(nums).map(n => ({ numero: +n, data: nums[n] })).sort((a, b) => a.numero - b.numero);
}
function fvsEditavel_(f) { return [FVS_ST_.exec, FVS_ST_.prep, FVS_ST_.dev].indexOf(f.status) >= 0; }
function fvsResultado_(c, n) { // resultado vigente do item: o da vistoria mais recente preenchida
  if (!c) return '';
  for (let i = n; i >= 1; i--) if (c['r' + i]) return c['r' + i];
  return '';
}
function fvsPendencias_(f) {
  const blocos = json_(f.modelo_json, []), chk = json_(f.checklist_json, {}), n = num_(f.vistoria) || 1, anexos = json_(f.anexos_json, []), p = [];
  let faltam = 0, reprov = 0;
  blocos.forEach((b, bi) => (b.itens || []).forEach((t, ii) => {
    const r = fvsResultado_(chk[bi + '.' + ii], n);
    if (!r) faltam++; else if (r === 'X') reprov++;
  }));
  if (faltam) p.push(faltam + (faltam === 1 ? ' item sem resposta' : ' itens sem resposta'));
  if (reprov) p.push(reprov + (reprov === 1 ? ' item reprovado' : ' itens reprovados') + ' — registre a não conformidade e faça a reinspeção');
  if (!anexos.some(a => a.tipo === 'base')) p.push('anexe o croqui base (projeto com alturas e locações)');
  if (!anexos.some(a => a.tipo === 'exec')) p.push('anexe o croqui de execução (coletado em campo)');
  if (!f.alteracao_sim) p.push('informe se houve alteração em relação ao projeto');
  else if (f.alteracao_sim === 'Sim' && (!String(f.alteracao || '').trim() || !String(f.alteracao_aut || '').trim())) p.push('descreva a alteração e quem autorizou');
  return p;
}
function fvsResumo_(ctx, f, prod, calcItens) {
  const rdos = fvsRdos_(ctx, f, prod), s = calcItens[f.item_id];
  return {
    id: f.id, numero: f.numero === '' ? '' : num_(f.numero), numero_txt: f.numero === '' ? '' : numFvs_(num_(f.numero)), modelo: f.modelo, modelo_nome: f.modelo_nome, categoria: f.categoria, tipo: f.tipo,
    etapa: f.etapa, item_id: f.item_id, servico: f.servico, status: f.status, vistoria: num_(f.vistoria) || 1, aprovado_por: f.aprovado_por, aprovado_em: fmtVal_(f.aprovado_em),
    enviado_por: f.enviado_por, criado_em: fmtVal_(f.criado_em), atualizado_em: fmtVal_(f.atualizado_em), rdos: rdos.length, rdo_de: rdos.length ? rdos[0].numero : '', rdo_ate: rdos.length ? rdos[rdos.length - 1].numero : '',
    servico_pct: s ? s.pct : 0, servico_concluido: !!(s && s.pct >= 100)
  };
}
function itensCalc_(ctx) {
  const c = calcExec_(ctx), m = {}, et = {};
  c.etapas.forEach(e => { et[e.codigo] = e; e.itens.forEach(i => { m[i.id] = i; }); });
  return { itens: m, etapas: et };
}
function fvsListar_(q, ctx) {
  const prod = obraTab_(ctx, 'Producao').all(), c = itensCalc_(ctx);
  const lista = obraTab_(ctx, 'Fvs').all().map(f => {
    const r = fvsResumo_(ctx, f, prod, c.itens), e = c.etapas[f.etapa];
    r.etapa_nome = e ? e.nome : f.etapa; r.local = e ? e.local : '';
    return r;
  }).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
  return { fvs: lista, pode_preencher: pode_(ctx, 'fvs_preencher'), pode_aprovar: pode_(ctx, 'fvs_aprovar') };
}
function fvsDetalhe_(q, ctx) {
  const f = obraTab_(ctx, 'Fvs').all().find(x => String(x.id) === String(q.id));
  if (!f) throw new Error('FVS não encontrada.');
  const prod = obraTab_(ctx, 'Producao').all(), c = itensCalc_(ctx), e = c.etapas[f.etapa] || {}, it = c.itens[f.item_id] || {};
  const rdos = fvsRdos_(ctx, f, prod), datas = {};
  rdos.forEach(r => { datas[r.data] = 1; });
  const eq = {};
  obraTab_(ctx, 'EquipesDia').all().filter(x => String(x.etapa) === String(f.etapa) && datas[ymd_(x.data)]).forEach(x => { eq[String(x.equipe || 'Equipe')] = 1; });
  const base = fvsResumo_(ctx, f, prod, c.itens);
  return Object.assign(base, {
    modelo_rev: f.modelo_rev, blocos: json_(f.modelo_json, []), checklist: json_(f.checklist_json, {}), nc: json_(f.nc_json, []), anexos: json_(f.anexos_json, []),
    vistorias: json_(f.vistorias_json, {}), historico: json_(f.historico_json, []), alteracao_sim: f.alteracao_sim || '', alteracao: f.alteracao || '', alteracao_aut: f.alteracao_aut || '',
    motivo: f.motivo || '', hash: f.hash || '', auto_aprovada: sim_(f.auto_aprovada), pasta_url: f.pasta_id ? 'https://drive.google.com/drive/folders/' + f.pasta_id : '',
    pdf_id: f.pdf_id || '',
    etapa_nome: e.nome || f.etapa, etapa_local: e.local || '', frente: e.frente || '', responsavel_etapa: e.responsavel || '',
    servico_info: { nome: f.servico, unidade: it.unidade || '', prevista: it.prevista || 0, executado: it.executado || 0, pct: it.pct || 0, inicio: it.inicio || '', termino: it.termino || '' },
    rdo_lista: rdos, equipes: Object.keys(eq),
    obra: { nome: ctx.obra.nome, sigla: ctx.obra.sigla, endereco: ctx.obra.endereco }, empresa: config_().EMPRESA || 'Size Engenharia',
    pendencias: fvsPendencias_(f), editavel: fvsEditavel_(f), proximo_numero: obraTab_(ctx, 'Fvs').all().reduce((m, x) => Math.max(m, num_(x.numero)), 0) + 1,
    pode_preencher: fvsEditavel_(f) && pode_(ctx, 'fvs_preencher'), pode_aprovar: f.status === FVS_ST_.aprov && pode_(ctx, 'fvs_aprovar')
  });
}

/* ---------- preenchimento ---------- */
function fvsAchar_(ctx, id, estados) {
  const T = obraTab_(ctx, 'Fvs'), f = T.all().find(x => String(x.id) === String(id));
  if (!f) throw new Error('FVS não encontrada.');
  if (estados && estados.indexOf(f.status) < 0) throw new Error('Esta FVS está "' + f.status + '" e não pode ser alterada agora.');
  return { T: T, f: f };
}
function fvsHist_(f, ctx, acao, nota) {
  const h = json_(f.historico_json, []);
  h.push({ q: Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), por: ctx.u.nome, acao: acao, nota: String(nota || '').slice(0, 300) });
  f.historico_json = JSON.stringify(h);
  f.atualizado_em = new Date();
}
const EDITAVEIS_ = [FVS_ST_.exec, FVS_ST_.prep, FVS_ST_.dev];
function fvsSalvar_(q, ctx) {
  const a = fvsAchar_(ctx, q.id, EDITAVEIS_), f = a.f, n = num_(f.vistoria) || 1, hoje = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  const blocos = json_(f.modelo_json, []), chk = json_(f.checklist_json, {}), validas = {};
  blocos.forEach((b, bi) => (b.itens || []).forEach((t, ii) => { validas[bi + '.' + ii] = 1; }));
  const novo = q.checklist || {};
  Object.keys(novo).forEach(k => {
    if (!validas[k]) throw new Error('Item inválido (atualize a tela).');
    const r = String((novo[k] && novo[k].r) || '');
    if (FVS_RESULTADOS_.indexOf(r) < 0) throw new Error('Resultado inválido.');
    if (r === 'S' && n < 2) throw new Error('"Aprovado após reinspeção" só vale a partir da 2ª vistoria.');
    chk[k] = chk[k] || {};
    chk[k]['r' + n] = r;
    chk[k].obs = String((novo[k] && novo[k].obs) || '').slice(0, 500);
  });
  f.checklist_json = JSON.stringify(chk);
  if (q.nc) f.nc_json = JSON.stringify([].concat(q.nc).filter(x => x && (x.ocorrencia || x.item)).slice(0, 60).map(x => ({
    item: String(x.item || '').slice(0, 60), ocorrencia: String(x.ocorrencia || '').slice(0, 500), local: String(x.local || '').slice(0, 200), solucao: String(x.solucao || '').slice(0, 500)
  })));
  if (q.alteracao_sim !== undefined) { f.alteracao_sim = ['Sim', 'Não'].indexOf(q.alteracao_sim) >= 0 ? q.alteracao_sim : ''; }
  if (q.alteracao !== undefined) f.alteracao = String(q.alteracao || '').slice(0, 1500);
  if (q.alteracao_aut !== undefined) f.alteracao_aut = String(q.alteracao_aut || '').slice(0, 200);
  const vs = json_(f.vistorias_json, {});
  vs[n] = /^\d{4}-\d{2}-\d{2}$/.test(String(q.vistoria_data || '')) ? q.vistoria_data : (vs[n] || hoje);
  f.vistorias_json = JSON.stringify(vs);
  f.preenchido_por = ctx.u.nome;
  if (f.status !== FVS_ST_.prep) { fvsHist_(f, ctx, f.status === FVS_ST_.dev ? 'Ajustes após devolução' : 'Preenchimento iniciado', ''); f.status = FVS_ST_.prep; }
  f.atualizado_em = new Date();
  a.T.update(f);
  return { msg: 'FVS salva.', pendencias: fvsPendencias_(f) };
}
function fvsNovaVistoria_(q, ctx) {
  const a = fvsAchar_(ctx, q.id, EDITAVEIS_), f = a.f, n = num_(f.vistoria) || 1, chk = json_(f.checklist_json, {});
  if (!Object.keys(chk).some(k => fvsResultado_(chk[k], n) === 'X')) throw new Error('Só há nova vistoria quando algum item foi reprovado (X).');
  if (n >= 3) throw new Error('Já foram feitas 3 vistorias. Resolva as não conformidades com o executor antes de continuar.');
  f.vistoria = n + 1;
  const vs = json_(f.vistorias_json, {});
  vs[n + 1] = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  f.vistorias_json = JSON.stringify(vs);
  f.status = FVS_ST_.prep;
  fvsHist_(f, ctx, 'Reinspeção', (n + 1) + 'ª vistoria' + (n + 1 === 3 ? ' (a 3ª pode gerar multa para o executor)' : ''));
  a.T.update(f);
  return { msg: (n + 1) + 'ª vistoria aberta. Marque os itens reprovados de novo (⊗ se corrigidos).' };
}
function fvsAnexo_(q, ctx) {
  const a = fvsAchar_(ctx, q.id, EDITAVEIS_), f = a.f, arq = q.arquivo, tipo = ['base', 'exec', 'outro'].indexOf(q.tipo) >= 0 ? q.tipo : 'outro';
  if (!arq || !arq.b64) throw new Error('Arquivo vazio.');
  if (arq.b64.length > 14000000) throw new Error('Arquivo maior que ~10 MB.');
  const rot = { base: 'CROQUI-BASE', exec: 'CROQUI-EXEC', outro: 'ANEXO' }[tipo];
  const blob = Utilities.newBlob(Utilities.base64Decode(arq.b64), arq.mime || 'application/octet-stream', rot + '_' + stamp_() + '_' + limpa_(arq.nome));
  const file = pastaFvs_(ctx, f, a.T).createFile(blob), lista = json_(f.anexos_json, []);
  lista.push({ id: file.getId(), tipo: tipo, nome: String(arq.nome || file.getName()).slice(0, 120), mime: arq.mime || '', por: ctx.u.nome, em: Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm') });
  f.anexos_json = JSON.stringify(lista);
  fvsHist_(f, ctx, 'Anexo', rot.toLowerCase() + ': ' + (arq.nome || ''));
  a.T.update(f);
  return { msg: 'Arquivo anexado.', anexos: lista };
}
function fvsAnexoRemover_(q, ctx) {
  const a = fvsAchar_(ctx, q.id, EDITAVEIS_), f = a.f, lista = json_(f.anexos_json, []), x = lista.find(y => y.id === String(q.arquivo));
  if (!x) throw new Error('Anexo não encontrado.');
  try { DriveApp.getFileById(x.id).setTrashed(true); } catch (e) { /* já apagado */ }
  f.anexos_json = JSON.stringify(lista.filter(y => y !== x));
  fvsHist_(f, ctx, 'Anexo removido', x.nome);
  a.T.update(f);
  return { msg: 'Anexo removido.', anexos: json_(f.anexos_json, []) };
}
function fvsAnexoVer_(q, ctx) {
  const f = obraTab_(ctx, 'Fvs').all().find(x => String(x.id) === String(q.id));
  if (!f) throw new Error('FVS não encontrada.');
  const x = json_(f.anexos_json, []).find(y => y.id === String(q.arquivo));
  if (!x) throw new Error('Anexo não pertence a esta FVS.');
  const file = DriveApp.getFileById(x.id);
  return { nome: x.nome, mime: file.getMimeType(), tipo: x.tipo, b64: Utilities.base64Encode(file.getBlob().getBytes()) };
}
/* pasta de trabalho da FVS (Drive → obra → FVS → Em andamento → id); na aprovação vai para a pasta do mês */
function pastaFvs_(ctx, f, T) {
  if (f.pasta_id) { try { return DriveApp.getFolderById(f.pasta_id); } catch (e) { /* recria */ } }
  const p = subpasta_(subpasta_(pastaObra_(ctx), 'FVS'), 'Em andamento').createFolder(f.id + ' · ' + nomeArq_(f.servico));
  f.pasta_id = p.getId();
  if (T) T.update(f);
  return p;
}

/* ---------- fluxo de aprovação ---------- */
function fvsEnviar_(q, ctx) {
  const a = fvsAchar_(ctx, q.id, EDITAVEIS_), f = a.f, pend = fvsPendencias_(f);
  if (pend.length) throw new Error('Falta: ' + pend.join('; ') + '.');
  f.status = FVS_ST_.aprov; f.enviado_em = new Date(); f.enviado_por = ctx.u.nome; f.motivo = '';
  fvsHist_(f, ctx, 'Enviada para aprovação', (num_(f.vistoria) || 1) + 'ª vistoria');
  a.T.update(f);
  log_(ctx, 'fvs_enviar', f.id);
  return { msg: 'FVS enviada para aprovação.' };
}
function fvsDevolver_(q, ctx) {
  const a = fvsAchar_(ctx, q.id, [FVS_ST_.aprov]), f = a.f, motivo = String(q.motivo || '').trim();
  if (motivo.length < 5) throw new Error('Explique o motivo da devolução.');
  f.status = FVS_ST_.dev; f.motivo = motivo;
  fvsHist_(f, ctx, 'Devolvida', motivo);
  a.T.update(f);
  return { msg: 'FVS devolvida para ajustes.' };
}
function fvsAprovar_(q, ctx) {
  const a = fvsAchar_(ctx, q.id, [FVS_ST_.aprov]), f = a.f;
  if (!q.pdf || !q.pdf.b64) throw new Error('O PDF da ficha não foi gerado. Tente de novo.');
  if (q.pdf.b64.length > 14000000) throw new Error('PDF grande demais.');
  const bytes = Utilities.base64Decode(q.pdf.b64);
  if (String.fromCharCode.apply(null, bytes.slice(0, 4).map(b => b & 255)) !== '%PDF') throw new Error('Arquivo inválido: não é um PDF.');
  const T = a.T, agora = new Date();
  if (f.numero === '' || f.numero == null) {
    f.numero = T.all().reduce((m, x) => Math.max(m, num_(x.numero)), 0) + 1;
    // o PDF já saiu com o número previsto: se outra pessoa aprovou antes, o número mudou e o PDF precisa ser refeito
    if (q.numero_previsto && num_(q.numero_previsto) !== num_(f.numero)) { f.numero = ''; throw new Error('Outra FVS foi aprovada enquanto você conferia e o número mudou. Aprove de novo para gerar o PDF com o número certo.'); }
  }
  const numTxt = numFvs_(num_(f.numero)), rdos = fvsRdos_(ctx, f);
  f.aprovado_por = ctx.u.nome; f.aprovado_em = agora; f.status = FVS_ST_.ok; f.motivo = '';
  f.auto_aprovada = String(f.enviado_por || '') === ctx.u.nome ? 'Sim' : '';
  // código de verificação: resumo do conteúdo travado (qualquer mudança depois muda o código)
  const conteudo = JSON.stringify([f.modelo, f.modelo_rev, f.modelo_json, f.checklist_json, f.nc_json, f.alteracao_sim, f.alteracao, f.alteracao_aut, f.anexos_json, f.vistorias_json, rdos, f.numero, f.aprovado_por, fmtVal_(agora)]);
  f.hash = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, conteudo, Utilities.Charset.UTF_8));
  // Drive: pasta da FVS (com croquis e anexos) vai para FVS → AAAA-MM, com o PDF dentro
  const pasta = pastaFvs_(ctx, f, null), mes = subpasta_(subpasta_(pastaObra_(ctx), 'FVS'), Utilities.formatDate(agora, tz_(), 'yyyy-MM'));
  const pdf = pasta.createFile(Utilities.newBlob(bytes, 'application/pdf', numTxt + ' · ' + nomeArq_(f.servico) + ' · ' + stamp_() + '.pdf'));
  f.pdf_id = pdf.getId();
  pasta.setName(numTxt + ' · ' + nomeArq_(f.tipo + ' · ' + f.servico));
  pasta.moveTo(mes);
  fvsHist_(f, ctx, 'Aprovada', numTxt + ' · código ' + f.hash.slice(0, 10));
  T.update(f);
  log_(ctx, 'fvs_aprovar', numTxt + ' ' + f.id);
  return { msg: numTxt + ' aprovada e arquivada no Drive (pasta ' + Utilities.formatDate(agora, tz_(), 'yyyy-MM') + ').', numero: num_(f.numero), numero_txt: numTxt, hash: f.hash, pasta_url: pasta.getUrl() };
}
function fvsPdfVer_(q, ctx) {
  const f = obraTab_(ctx, 'Fvs').all().find(x => String(x.id) === String(q.id));
  if (!f || !f.pdf_id) throw new Error('Esta FVS ainda não tem PDF arquivado.');
  const file = DriveApp.getFileById(f.pdf_id);
  return { nome: file.getName(), mime: 'application/pdf', b64: Utilities.base64Encode(file.getBlob().getBytes()) };
}
function fvsReabrir_(q, ctx) {
  const a = fvsAchar_(ctx, q.id, [FVS_ST_.ok]), f = a.f, motivo = String(q.motivo || '').trim();
  if (motivo.length < 5) throw new Error('Explique o motivo para reabrir (fica registrado).');
  f.status = FVS_ST_.prep; f.motivo = motivo;
  fvsHist_(f, ctx, 'Reaberta', motivo);
  a.T.update(f);
  return { msg: 'FVS reaberta. O número ' + numFvs_(num_(f.numero)) + ' continua o mesmo e a versão anterior do PDF fica na pasta.' };
}
function fvsCancelar_(q, ctx) {
  const a = fvsAchar_(ctx, q.id, [FVS_ST_.exec, FVS_ST_.prep, FVS_ST_.dev, FVS_ST_.aprov]), f = a.f, motivo = String(q.motivo || '').trim();
  if (motivo.length < 5) throw new Error('Explique o motivo do cancelamento.');
  f.status = FVS_ST_.canc; f.motivo = motivo;
  fvsHist_(f, ctx, 'Cancelada', motivo);
  a.T.update(f);
  return { msg: 'FVS cancelada.' };
}

/* ---------- sino: o que cada perfil tem para fazer ---------- */
function notifFvs_(c, add) {
  const ver = pode_(c, ['fvs_ver', 'fvs_preencher', 'fvs_aprovar']);
  if (!ver) return;
  const F = obraTab_(c, 'Fvs').all().filter(f => f.status !== FVS_ST_.ok && f.status !== FVS_ST_.canc);
  if (!F.length) return;
  if (pode_(c, 'fvs_aprovar')) F.filter(f => f.status === FVS_ST_.aprov).forEach(f =>
    add({ id: 'fv|ap|' + f.id + '|' + fmtVal_(f.enviado_em), etapa: 'fvs_aprovar', numero: f.servico, texto: 'FVS de ' + f.servico + ' aguardando sua aprovação (enviada por ' + (f.enviado_por || '—') + ')', quando: fmtVal_(f.enviado_em), rota: '#/fvs/' + f.id }));
  if (pode_(c, 'fvs_preencher')) {
    F.filter(f => f.status === FVS_ST_.dev).forEach(f =>
      add({ id: 'fv|dev|' + f.id + '|' + fmtVal_(f.atualizado_em), etapa: 'fvs_devolvida', numero: f.servico, texto: 'FVS devolvida: ' + (f.motivo || 'ajustes pedidos'), quando: fmtVal_(f.atualizado_em), rota: '#/fvs/' + f.id }));
    const ab = F.filter(f => f.status === FVS_ST_.exec || f.status === FVS_ST_.prep);
    if (ab.length) {
      const it = itensCalc_(c).itens;
      ab.filter(f => it[f.item_id] && it[f.item_id].pct >= 100).forEach(f =>
        add({ id: 'fv|ver|' + f.id, etapa: 'fvs_verificar', numero: f.servico, texto: 'Serviço concluído — FVS para verificar', quando: fmtVal_(new Date()), rota: '#/fvs/' + f.id }));
    }
  }
}

/* ---------- perfis: quem faz o quê com FVS ---------- */
function atualizarPerfisFvs_() {
  const C = central_('Config');
  if (C.all().some(r => r.chave === 'PERFIS_FVS_V1')) return;
  const P = central_('Perfis'), A = central_('Acessos');
  const dar = { Admin: ['fvs_ver', 'fvs_preencher', 'fvs_aprovar'], Engenheiro: ['fvs_ver', 'fvs_preencher', 'fvs_aprovar'], Encarregado: ['fvs_ver'] };
  const une = (txt, extra) => { const s = String(txt || '').split(',').map(x => x.trim()).filter(Boolean); extra.forEach(e => { if (s.indexOf(e) < 0) s.push(e); }); return s.join(','); };
  Object.keys(dar).forEach(nome => {
    const p = P.all().find(x => norm_(x.perfil) === norm_(nome));
    if (p) { p.permissoes = une(p.permissoes, dar[nome]); P.update(p); }
    A.all().filter(a => norm_(a.perfil) === norm_(nome)).forEach(a => { a.permissoes = une(a.permissoes, dar[nome]); A.update(a); });
  });
  C.insert({ chave: 'PERFIS_FVS_V1', valor: 'Sim', descricao: 'Ajuste automático: permissões do módulo FVS (Admin e Engenheiro preenchem e aprovam; Encarregado consulta)' });
}
