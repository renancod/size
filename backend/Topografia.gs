/**
 * TOPOGRAFIA · demandas do topógrafo (marcação, conferência, levantamento…), agenda automática,
 * diário do topógrafo (separado do RDO da obra) e produção.
 *
 * Regras combinadas:
 *  - fica na planilha central (não depende de obra): a demanda aponta para uma obra cadastrada ou "Outra" (nome digitado);
 *  - acesso pelo cadastro do usuário (Usuarios.topografia = Topógrafo | Gerir); o administrador é Gerir;
 *    o topógrafo vê e lança só as demandas dele; quem gere abre, agenda, edita e cancela;
 *  - a demanda pode durar vários dias: cada dia de trabalho é um lançamento com a quantidade (m, pontos ou unidades),
 *    "terminou?" e no mínimo 2 fotos; no lançamento que termina, croqui e o arquivo usado são obrigatórios;
 *  - o topógrafo pode mudar a data da demanda, sempre com o motivo (vai para o histórico e avisa quem abriu);
 *  - agenda automática: a produção média por dia (do histórico de cada topógrafo, ou o padrão TOPO_PRODUTIVIDADE)
 *    estima os dias de cada demanda e enfileira as demandas de cada topógrafo nos dias úteis (seg–sex sem feriado);
 *    quando uma atrasa, as seguintes andam junto.
 */
const TOPO_NIVEIS = ['Topógrafo', 'Gerir'];
const TOPO_TIPOS = ['Marcação', 'Conferência', 'Levantamento', 'Nivelamento', 'Locação', 'Cadastro (as built)', 'Outro'];
const TOPO_UNIDADES = { m: 'metros', pt: 'pontos', un: 'unidades' }, TOPO_UN_TXT_ = { m: 'm', pt: 'pontos', un: 'un' };
const TOPO_PROD_PADRAO_ = { m: 400, pt: 80, un: 30 };
const TOPO_FOTOS_MIN = 2;
const TOPO_ABERTAS_ = ['Agendada', 'Em execução'];

function nivelTopo_(u) {
  if (sim_(u.admin)) return 'Gerir';
  return TOPO_NIVEIS.find(n => norm_(n) === norm_(u.topografia)) || '';
}
function exigirTopo_(ctx, nivel) {
  const n = nivelTopo_(ctx.u);
  if (!n) throw new Error('Você não tem acesso à Topografia (peça ao administrador).');
  if (nivel === 'Gerir' && n !== 'Gerir') throw new Error('Só quem gere a Topografia pode fazer isso.');
  ctx.topo = n;
}
const topoGere_ = ctx => ctx.topo === 'Gerir';

/* ---------- utilidades ---------- */
const topoR3_ = n => Math.round((Number(n) || 0) * 1000) / 1000;
const topoUn_ = u => TOPO_UNIDADES[String(u || '').trim()] ? String(u).trim() : 'm';
const topoFer_ = (() => { let f = null; return () => (f = f || feriadosObra_(null)); })();
const topoUtil_ = s => { const w = dow_(s); return w >= 1 && w <= 5 && !topoFer_()(s); };
function topoProxUtil_(s) { let d = s; for (let i = 0; i < 30 && !topoUtil_(d); i++) d = addDias_(d, 1); return d; }
function topoHist_(d, ctx, acao, det) {
  const h = json_(d.historico_json, []);
  h.push({ em: agora_(), por: ctx.u.nome, acao: acao, det: String(det || '').slice(0, 400) });
  d.historico_json = JSON.stringify(h.slice(-80));
}
function topoTopografos_() {
  return central_('Usuarios').all().filter(u => !u.cliente_id && sim_(u.ativo) && norm_(u.topografia) === norm_('Topógrafo'))
    .map(u => ({ id: String(u.id), nome: String(u.nome), telefone: String(u.telefone || '') })).sort((a, b) => a.nome.localeCompare(b.nome));
}
function topoProdPadrao_() {
  const p = Object.assign({}, TOPO_PROD_PADRAO_);
  String(config_().TOPO_PRODUTIVIDADE || '').split(/[;,]/).forEach(s => {
    const a = s.split(':'); if (a.length === 2 && TOPO_UNIDADES[a[0].trim()] && num_(a[1]) > 0) p[a[0].trim()] = num_(a[1]);
  });
  return p;
}
function topoAchar_(id) {
  const d = central_('TopoDemandas').all().find(x => String(x.id) === String(id));
  if (!d) throw new Error('Demanda não encontrada.');
  return d;
}
/* topógrafo só mexe no que é dele */
function topoMinha_(ctx, d) {
  if (!topoGere_(ctx) && String(d.topografo_id) !== String(ctx.u.id)) throw new Error('Esta demanda é de outro topógrafo.');
}
function topoPasta_(d) {
  if (d.pasta_id) { try { return DriveApp.getFolderById(d.pasta_id); } catch (e) { /* recria */ } }
  const f = subpasta_(subpasta_(subpasta_(raizPasta_(), 'Topografia'), nomeArq_(d.obra_nome || 'Outras obras')), d.id);
  d.pasta_id = f.getId();
  return f;
}
const TOPO_MIMES_ = /^(application\/pdf|image\/(jpeg|png|webp)|application\/(dxf|acad|x-dxf|dwg|x-dwg|octet-stream|zip|x-zip-compressed|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)|text\/(plain|csv)|image\/vnd\.dxf)$/i;
function topoSalvarArq_(pasta, arq, prefixo) {
  const b64 = String((arq && arq.b64) || '').replace(/^data:[^,]+,/, '');
  if (!b64) throw new Error('Arquivo vazio.');
  if (b64.length > 14000000) throw new Error('Arquivo maior que 10 MB: ' + (arq.nome || ''));
  const nome = nomeArq_(arq.nome || 'arquivo') || 'arquivo', mime = TOPO_MIMES_.test(String(arq.mime || '')) ? String(arq.mime) : 'application/octet-stream';
  const f = pasta.createFile(Utilities.newBlob(Utilities.base64Decode(b64), mime, prefixo + ' · ' + nome));
  return { id: f.getId(), nome: nome, mime: mime };
}

/* ---------- produção média e agenda automática ---------- */
/* média por dia de trabalho: topógrafo + tipo + unidade → topógrafo + unidade → todos + tipo + unidade → padrão */
function topoProdutividade_(diarios) {
  const s = {};
  const soma = (k, q) => { const x = s[k] = s[k] || { q: 0, n: 0 }; x.q += q; x.n++; };
  diarios.forEach(x => {
    const q = num_(x.qtd); if (q <= 0) return;
    const u = topoUn_(x.unidade), t = String(x.tipo || ''), p = String(x.topografo_id);
    soma(p + '|' + t + '|' + u, q); soma(p + '||' + u, q); soma('|' + t + '|' + u, q);
  });
  const pad = topoProdPadrao_();
  // poucas medições não mudam a estimativa: só a partir de 3 dias lançados
  const media = k => s[k] && s[k].n >= 3 ? s[k].q / s[k].n : 0;
  return {
    de: (p, t, u) => { u = topoUn_(u); return media(p + '|' + t + '|' + u) || media(p + '||' + u) || media('|' + t + '|' + u) || pad[u]; },
    tabela: Object.keys(s).filter(k => s[k].n >= 1).map(k => { const a = k.split('|'); return { topografo_id: a[0], tipo: a[1], unidade: a[2], media: topoR3_(s[k].q / s[k].n), dias: s[k].n }; }),
    padrao: pad
  };
}
/* carga em dias de uma demanda aberta (fração de dia; mínimo 1/4 de dia)
 * o prazo digitado por quem abriu vale sobre a média; com quantidade também, desconta o que já foi feito */
function topoCarga_(d, prod) {
  const prev = num_(d.qtd_prevista), feita = num_(d.qtd_feita), dias = num_(d.dias_previstos);
  const resta = prev > 0 ? Math.max(0, prev - feita) : 0;
  if (dias > 0) return Math.max(0.25, prev > 0 ? dias * resta / prev : dias);
  if (!(prev > 0)) return 1;
  return Math.max(0.25, resta / prod.de(d.topografo_id, d.tipo, d.unidade));
}
/* enfileira as demandas abertas de cada topógrafo; devolve {id: {ini, fim, carga, empurrada}} e a ocupação de cada dia */
function topoAgenda_(demandas, prod, hoje) {
  const por = {}, prev = {}, ocup = {};
  demandas.filter(d => TOPO_ABERTAS_.indexOf(d.status) >= 0 && d.topografo_id).forEach(d => { (por[d.topografo_id] = por[d.topografo_id] || []).push(d); });
  const h0 = topoProxUtil_(hoje);
  Object.keys(por).forEach(t => {
    const oc = ocup[t] = {};
    // ordem: data (as atrasadas contam como hoje), urgente na frente, em execução antes das agendadas, mais antiga primeiro
    const ef = d => { const x = ymd_(d.data) || hoje; return x < h0 ? h0 : topoProxUtil_(x); };
    por[t].sort((a, b) => ef(a).localeCompare(ef(b)) || (b.prioridade === 'Urgente') - (a.prioridade === 'Urgente') ||
      (b.status === 'Em execução') - (a.status === 'Em execução') || String(a.id).localeCompare(String(b.id)));
    let dia = h0, usado = 0;
    por[t].forEach(d => {
      const quer = ef(d);
      if (quer > dia) { dia = quer; usado = 0; }
      if (usado >= 0.999) { dia = topoProxUtil_(addDias_(dia, 1)); usado = 0; }
      const carga = topoCarga_(d, prod), ini = dia;
      let falta = carga;
      for (let i = 0; i < 400 && falta > 1e-9; i++) {
        const cabe = Math.min(falta, 1 - usado);
        oc[dia] = topoR3_((oc[dia] || 0) + cabe);
        usado += cabe; falta -= cabe;
        if (falta > 1e-9) { dia = topoProxUtil_(addDias_(dia, 1)); usado = 0; }
      }
      const marcada = ymd_(d.data);
      prev[d.id] = { ini: ini, fim: dia, carga: topoR3_(carga), empurrada: !!marcada && ini > topoProxUtil_(marcada < h0 ? h0 : marcada), atrasada: d.status === 'Agendada' && !!marcada && marcada < hoje };
    });
  });
  return { prev: prev, ocup: ocup };
}
function topoBase_() {
  const D = central_('TopoDemandas').all(), L = central_('TopoDiarios').all(), prod = topoProdutividade_(L), hoje = hojeYmd_();
  return { D: D, L: L, prod: prod, hoje: hoje, ag: topoAgenda_(D, prod, hoje) };
}

/* ---------- leitura ---------- */
function topoPub_(d, ag) {
  const p = (ag && ag.prev[d.id]) || {}, prev = num_(d.qtd_prevista), feita = num_(d.qtd_feita);
  return {
    id: d.id, obra_id: String(d.obra_id || ''), obra_nome: d.obra_nome, obra_outra: sim_(d.obra_outra), cidade: d.cidade, tipo: d.tipo, servico: d.servico, local: d.local,
    descricao: d.descricao, unidade: topoUn_(d.unidade), qtd_prevista: prev || '', qtd_feita: topoR3_(feita), dias_previstos: num_(d.dias_previstos) || '',
    pct: prev > 0 ? Math.min(100, Math.round(feita / prev * 1000) / 10) : (d.status === 'Concluída' ? 100 : 0),
    topografo_id: String(d.topografo_id || ''), topografo: d.topografo, data: ymd_(d.data), prioridade: d.prioridade || 'Normal', status: d.status,
    anexos: json_(d.anexos_json, []), criado_em: fmtVal_(d.criado_em), criado_por: d.criado_por, criado_por_id: String(d.criado_por_id || ''),
    iniciada_em: ymd_(d.iniciada_em), concluida_em: ymd_(d.concluida_em), motivo: d.motivo || '', arquivo_usado: d.arquivo_usado || '', atualizado_em: fmtVal_(d.atualizado_em),
    previsao: p.ini ? { ini: p.ini, fim: p.fim, carga: p.carga, empurrada: p.empurrada, atrasada: p.atrasada } : null
  };
}
function topoDiarioPub_(x) {
  return {
    id: x.id, demanda: x.demanda, data: ymd_(x.data), topografo_id: String(x.topografo_id), topografo: x.topografo, obra_id: String(x.obra_id || ''), obra_nome: x.obra_nome,
    tipo: x.tipo, servico: x.servico || '', local: x.local || '', unidade: topoUn_(x.unidade), qtd: topoR3_(x.qtd), terminou: sim_(x.terminou), obs: x.obs || '', arquivo_usado: x.arquivo_usado || '',
    fotos: json_(x.fotos_json, []), croquis: json_(x.croquis_json, []), arquivos: json_(x.arquivos_json, []), lat: x.lat, lng: x.lng,
    criado_em: fmtVal_(x.criado_em), atualizado_em: fmtVal_(x.atualizado_em)
  };
}
function topoDados_(q, ctx) {
  const B = topoBase_(), gere = topoGere_(ctx), limite = addDias_(B.hoje, -90);
  const minhas = d => gere || String(d.topografo_id) === String(ctx.u.id);
  const dem = B.D.filter(d => minhas(d) && (TOPO_ABERTAS_.indexOf(d.status) >= 0 || (ymd_(d.concluida_em || d.atualizado_em) || B.hoje) >= limite));
  const lanc = B.L.filter(x => (gere || String(x.topografo_id) === String(ctx.u.id)) && ymd_(x.data) >= addDias_(B.hoje, -35));
  return {
    nivel: ctx.topo, eu: { id: String(ctx.u.id), nome: ctx.u.nome }, hoje: B.hoje,
    topografos: topoTopografos_(), tipos: TOPO_TIPOS, unidades: TOPO_UNIDADES, fotos_min: TOPO_FOTOS_MIN,
    obras: gere ? central_('Obras').all().filter(o => sim_(o.ativa)).map(o => ({ id: String(o.id), sigla: o.sigla, nome: o.nome, endereco: o.endereco || '' })) : [],
    demandas: dem.map(d => topoPub_(d, B.ag)),
    lancamentos: lanc.map(x => ({ id: x.id, demanda: x.demanda, data: ymd_(x.data), topografo_id: String(x.topografo_id), qtd: topoR3_(x.qtd), unidade: topoUn_(x.unidade), terminou: sim_(x.terminou), fotos: json_(x.fotos_json, []).length })),
    ocupacao: gere ? B.ag.ocup : { [ctx.u.id]: B.ag.ocup[ctx.u.id] || {} },
    locais: gere ? topoLocais_() : [],
    produtividade: { padrao: B.prod.padrao, tabela: B.prod.tabela.filter(p => gere || p.topografo_id === String(ctx.u.id)) }
  };
}
function topoDemanda_(q, ctx) {
  const B = topoBase_(), d = B.D.find(x => String(x.id) === String(q.id));
  if (!d) throw new Error('Demanda não encontrada.');
  topoMinha_(ctx, d);
  return {
    demanda: topoPub_(d, B.ag), historico: json_(d.historico_json, []).reverse(),
    diarios: B.L.filter(x => String(x.demanda) === String(d.id)).map(topoDiarioPub_).sort((a, b) => b.data.localeCompare(a.data) || String(b.criado_em).localeCompare(String(a.criado_em))),
    media_dia: topoR3_(B.prod.de(d.topografo_id, d.tipo, d.unidade))
  };
}
/* sugestão de data: primeiro dia útil (a partir de "desde") com folga na agenda de cada topógrafo, e quantos dias leva */
function topoSugerir_(q, ctx) {
  const B = topoBase_(), desde = topoProxUtil_(ymd_(q.desde) > B.hoje ? ymd_(q.desde) : B.hoje), un = topoUn_(q.unidade);
  const sug = topoTopografos_().map(t => {
    const oc = B.ag.ocup[t.id] || {}, d = { topografo_id: t.id, tipo: q.tipo, unidade: un, qtd_prevista: num_(q.qtd), qtd_feita: 0, dias_previstos: num_(q.dias) };
    let dia = desde;
    for (let i = 0; i < 260 && (oc[dia] || 0) >= 0.999; i++) dia = topoProxUtil_(addDias_(dia, 1));
    const carga = topoCarga_(d, B.prod), abertas = B.D.filter(x => String(x.topografo_id) === t.id && TOPO_ABERTAS_.indexOf(x.status) >= 0).length;
    const fila = Object.keys(oc).filter(k => k >= B.hoje).reduce((s, k) => s + oc[k], 0);
    return { id: t.id, nome: t.nome, data: dia, livre: topoR3_(1 - (oc[dia] || 0)), dias: topoR3_(carga), media: topoR3_(B.prod.de(t.id, q.tipo, un)), abertas: abertas, fila: topoR3_(fila) };
  }).sort((a, b) => a.data.localeCompare(b.data) || a.fila - b.fila);
  return { sugestoes: sug, melhor: sug[0] || null };
}

/* ---------- gravação ---------- */
function topoSalvar_(q, ctx) {
  const T = central_('TopoDemandas'), x = q.demanda || {};
  let d = x.id ? topoAchar_(x.id) : null;
  const novo = !d;
  if (d && d.status === 'Cancelada') throw new Error('Demanda cancelada: reabra antes de editar.');
  // obra cadastrada ou "Outra" (nome digitado)
  let obraId = String(x.obra_id || '').trim(), obraNome = '', outra = !obraId || obraId === 'outra';
  if (!outra) {
    const o = central_('Obras').all().find(z => String(z.id) === obraId);
    if (!o) throw new Error('Obra não encontrada.');
    obraNome = o.sigla ? o.sigla + ' · ' + o.nome : o.nome;
  } else {
    obraId = ''; obraNome = String(x.obra_nome || '').trim();
    if (!obraNome) throw new Error('Escolha a obra ou digite o nome da obra (opção "Outra").');
  }
  const tipo = TOPO_TIPOS.indexOf(x.tipo) >= 0 ? x.tipo : '', servico = String(x.servico || '').trim(), local = String(x.local || '').trim();
  if (!tipo) throw new Error('Escolha o tipo do serviço (marcação, conferência…).');
  if (!servico && !local) throw new Error('Diga o que será feito e onde (ex: Rede de água · Rua 10).');
  const data = ymd_(x.data);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a data da execução.');
  const prev = num_(x.qtd_prevista), dias = num_(x.dias_previstos);
  if (prev < 0 || dias < 0) throw new Error('Quantidade e dias não podem ser negativos.');
  let tp = String(x.topografo_id || '').trim();
  const tops = topoTopografos_();
  if (tp === 'auto' || !tp) {
    const s = topoSugerir_({ tipo: tipo, unidade: x.unidade, qtd: prev, dias: dias, desde: data }, ctx).melhor;
    if (!s) throw new Error('Nenhum topógrafo cadastrado. O administrador marca "Topografia: Topógrafo" no cadastro do usuário.');
    tp = s.id;
  }
  const t = tops.find(z => z.id === tp);
  if (!t) throw new Error('Topógrafo não encontrado (ou desativado).');
  const antes = d ? { tp: String(d.topografo_id), data: ymd_(d.data) } : null;
  if (novo) d = { id: T.proxCodigo('id', 'TP-', 4), status: 'Agendada', qtd_feita: 0, criado_em: new Date(), criado_por_id: ctx.u.id, criado_por: ctx.u.nome, anexos_json: '[]', historico_json: '[]' };
  Object.assign(d, {
    obra_id: obraId, obra_nome: obraNome, obra_outra: outra ? 'Sim' : '', cidade: String(x.cidade || '').trim(), tipo: tipo, servico: servico, local: local,
    descricao: String(x.descricao || '').trim().slice(0, 3000), unidade: topoUn_(x.unidade), qtd_prevista: prev || '', dias_previstos: dias || '',
    topografo_id: t.id, topografo: t.nome, data: data, prioridade: x.prioridade === 'Urgente' ? 'Urgente' : 'Normal', atualizado_em: new Date()
  });
  // anexos (projeto, DXF, planilha de pontos): opcionais; tirar os marcados
  const anexos = json_(d.anexos_json, []).filter(a => [].concat(q.remover || []).indexOf(a.id) < 0);
  const novos = [].concat(q.anexos || []).filter(a => a && a.b64);
  if (novos.length) { const pasta = topoPasta_(d); novos.forEach(a => anexos.push(Object.assign(topoSalvarArq_(pasta, a, d.id + ' · anexo'), { em: hojeYmd_(), por: ctx.u.nome }))); }
  d.anexos_json = JSON.stringify(anexos);
  if (novo) topoHist_(d, ctx, 'Demanda aberta', t.nome + ' · ' + fdT_(data) + (novos.length ? ' · ' + plural_(novos.length, 'anexo', 'anexos') : ''));
  else {
    const mud = [];
    if (antes.tp !== t.id) mud.push('topógrafo: ' + t.nome);
    if (antes.data !== data) mud.push('data: ' + fdT_(antes.data) + ' → ' + fdT_(data) + (x.motivo ? ' (' + String(x.motivo).trim() + ')' : ''));
    if (novos.length) mud.push(plural_(novos.length, 'anexo novo', 'anexos novos'));
    topoHist_(d, ctx, 'Demanda editada', mud.join(' · '));
  }
  if (novo) T.insert(d); else T.update(d);
  log_(ctx, novo ? 'topo_abrir' : 'topo_editar', d.id + ' ' + d.tipo + ' ' + d.servico);
  return { msg: (novo ? 'Demanda ' + d.id + ' aberta para ' : 'Demanda salva · ') + t.nome + ' em ' + fdT_(data) + '. Ele recebe o aviso no celular.', id: d.id };
}
const fdT_ = s => { const a = String(s || '').split('-'); return a.length === 3 ? a[2] + '/' + a[1] + '/' + a[0] : String(s || ''); };

/* mudar a data: o topógrafo (da demanda dele) ou quem gere; o motivo é obrigatório */
function topoData_(q, ctx) {
  const T = central_('TopoDemandas'), d = topoAchar_(q.id);
  topoMinha_(ctx, d);
  if (TOPO_ABERTAS_.indexOf(d.status) < 0) throw new Error('A demanda está ' + d.status.toLowerCase() + ': não dá para mudar a data.');
  const data = ymd_(q.data), motivo = String(q.motivo || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error('Informe a nova data.');
  if (data < hojeYmd_()) throw new Error('A nova data não pode ser antes de hoje.');
  if (motivo.length < 4) throw new Error('Explique o porquê da mudança de data (ex: chuva, frente não liberada).');
  const de = ymd_(d.data);
  if (de === data) throw new Error('A demanda já está marcada para ' + fdT_(data) + '.');
  d.data = data; d.atualizado_em = new Date();
  // o aviso a quem abriu sai quando a mudança é do topógrafo
  if (!topoGere_(ctx) || String(d.topografo_id) === String(ctx.u.id)) { d.motivo = motivo; d.adiada_em = new Date(); d.adiada_por = ctx.u.nome; }
  topoHist_(d, ctx, 'Data alterada', fdT_(de) + ' → ' + fdT_(data) + ' · motivo: ' + motivo);
  T.update(d);
  log_(ctx, 'topo_data', d.id + ' ' + de + ' → ' + data);
  return { msg: 'Data alterada para ' + fdT_(data) + '.' + (String(d.criado_por_id) !== String(ctx.u.id) ? ' ' + d.criado_por + ' foi avisado.' : '') };
}
function topoStatus_(q, ctx) {
  const T = central_('TopoDemandas'), d = topoAchar_(q.id), motivo = String(q.motivo || '').trim();
  if (q.op === 'cancelar') {
    if (d.status === 'Cancelada') throw new Error('A demanda já está cancelada.');
    if (motivo.length < 4) throw new Error('Diga o motivo do cancelamento.');
    d.status = 'Cancelada'; topoHist_(d, ctx, 'Cancelada', motivo);
  } else if (q.op === 'reabrir') {
    if (TOPO_ABERTAS_.indexOf(d.status) >= 0) throw new Error('A demanda já está aberta.');
    d.status = num_(d.qtd_feita) > 0 || d.iniciada_em ? 'Em execução' : 'Agendada'; d.concluida_em = '';
    if (q.data && ymd_(q.data) >= hojeYmd_()) d.data = ymd_(q.data);
    topoHist_(d, ctx, 'Reaberta', motivo || 'para continuar');
  } else if (q.op === 'concluir') {
    if (TOPO_ABERTAS_.indexOf(d.status) < 0) throw new Error('A demanda não está aberta.');
    d.status = 'Concluída'; d.concluida_em = new Date(); topoHist_(d, ctx, 'Concluída por ' + ctx.u.nome, motivo);
  } else throw new Error('Operação inválida.');
  d.atualizado_em = new Date();
  T.update(d);
  log_(ctx, 'topo_' + q.op, d.id);
  return { msg: { cancelar: 'Demanda cancelada.', reabrir: 'Demanda reaberta.', concluir: 'Demanda concluída.' }[q.op] };
}
function topoExcluirArqs_(lista) { lista.forEach(a => { try { DriveApp.getFileById(a.id).setTrashed(true); } catch (e) { /* já não existe */ } }); }

/* lançamento do dia (diário do topógrafo): quantidade, terminou?, fotos (mín. 2), croqui e arquivo usado (obrigatórios ao terminar).
 * Editar: o topógrafo corrige o lançamento do próprio dia; dias anteriores só quem gere. */
function topoLancar_(q, ctx) {
  const T = central_('TopoDemandas'), L = central_('TopoDiarios'), d = topoAchar_(q.demanda);
  topoMinha_(ctx, d);
  const hoje = hojeYmd_(), data = ymd_(q.data) || hoje;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > hoje) throw new Error('A data do lançamento não pode ser depois de hoje.');
  let x = q.id ? L.all().find(z => String(z.id) === String(q.id) && String(z.demanda) === String(d.id)) : null;
  if (q.id && !x) throw new Error('Lançamento não encontrado.');
  if (x && !topoGere_(ctx) && (ymd_(x.data) !== hoje || String(x.topografo_id) !== String(ctx.u.id))) throw new Error('Só dá para corrigir o lançamento de hoje. Peça a quem gere a Topografia para corrigir dias anteriores.');
  if (!x && !topoGere_(ctx) && data < addDias_(hoje, -7)) throw new Error('Lançamento com mais de 7 dias: peça a quem gere a Topografia.');
  if (!x && TOPO_ABERTAS_.indexOf(d.status) < 0) throw new Error('A demanda está ' + String(d.status).toLowerCase() + '.' + (d.status === 'Concluída' ? ' Peça para reabrir se ainda falta fazer.' : ''));
  const qtd = num_(q.qtd), terminou = sim_(q.terminou);
  if (qtd < 0) throw new Error('A quantidade não pode ser negativa.');
  if (!(qtd > 0) && !terminou) throw new Error('Informe quanto foi feito hoje (' + TOPO_UNIDADES[topoUn_(d.unidade)] + ').');
  const fotosNovas = [].concat(q.fotos || []).filter(a => a && a.b64), croqNovos = [].concat(q.croquis || []).filter(a => a && a.b64), arqNovos = [].concat(q.arquivos || []).filter(a => a && a.b64);
  const tirar = [].concat(q.remover || []);
  const fotos = (x ? json_(x.fotos_json, []) : []).filter(a => tirar.indexOf(a.id) < 0), croquis = (x ? json_(x.croquis_json, []) : []).filter(a => tirar.indexOf(a.id) < 0), arquivos = (x ? json_(x.arquivos_json, []) : []).filter(a => tirar.indexOf(a.id) < 0);
  if (fotos.length + fotosNovas.length < TOPO_FOTOS_MIN) throw new Error('Mande pelo menos ' + TOPO_FOTOS_MIN + ' fotos do serviço.');
  const arqUsado = String(q.arquivo_usado || '').trim().slice(0, 300);
  if (terminou) {
    const temCroqui = croquis.length + croqNovos.length > 0 || L.all().some(z => String(z.demanda) === String(d.id) && z !== x && json_(z.croquis_json, []).length);
    if (!temCroqui) throw new Error('Para terminar, anexe o croqui da marcação (foto do croqui ou PDF).');
    if (!arqUsado && !arquivos.length && !arqNovos.length && !d.arquivo_usado) throw new Error('Para terminar, informe qual arquivo você usou (o anexo da demanda, o arquivo do equipamento ou envie o arquivo).');
  }
  const pasta = topoPasta_(d), pre = d.id + ' · ' + data;
  fotosNovas.forEach((a, i) => fotos.push(topoSalvarArq_(pasta, Object.assign({}, a, { mime: /^image\//.test(a.mime || '') ? a.mime : 'image/jpeg' }), pre + ' · foto ' + (fotos.length + 1))));
  croqNovos.forEach(a => croquis.push(topoSalvarArq_(pasta, a, pre + ' · croqui')));
  arqNovos.forEach(a => arquivos.push(topoSalvarArq_(pasta, a, pre + ' · arquivo')));
  // os arquivos tirados vão para a lixeira do Drive (dá para recuperar)
  if (x && tirar.length) topoExcluirArqs_(json_(x.fotos_json, []).concat(json_(x.croquis_json, []), json_(x.arquivos_json, [])).filter(a => tirar.indexOf(a.id) >= 0));
  const novo = !x;
  if (novo) x = { id: L.proxCodigo('id', 'TD-', 5), demanda: d.id, topografo_id: d.topografo_id, topografo: d.topografo, criado_em: new Date() };
  Object.assign(x, {
    data: data, obra_id: d.obra_id, obra_nome: d.obra_nome, tipo: d.tipo, servico: d.servico, local: d.local, unidade: topoUn_(d.unidade), qtd: qtd, terminou: terminou ? 'Sim' : 'Não',
    obs: String(q.obs || '').trim().slice(0, 2000), arquivo_usado: arqUsado, fotos_json: JSON.stringify(fotos), croquis_json: JSON.stringify(croquis), arquivos_json: JSON.stringify(arquivos),
    lat: q.lat != null && q.lat !== '' ? Math.round(num_(q.lat) * 1e6) / 1e6 : (x.lat || ''), lng: q.lng != null && q.lng !== '' ? Math.round(num_(q.lng) * 1e6) / 1e6 : (x.lng || ''), atualizado_em: new Date()
  });
  if (novo) L.insert(x); else L.update(x);
  // demanda: quantidade feita = soma dos lançamentos; terminou → concluída
  const meus = L.all().filter(z => String(z.demanda) === String(d.id));
  d.qtd_feita = topoR3_(meus.reduce((s, z) => s + num_(z.qtd), 0));
  if (arqUsado) d.arquivo_usado = arqUsado; else if (arqNovos.length) d.arquivo_usado = arqNovos.map(a => a.nome).join(', ');
  if (!d.iniciada_em) d.iniciada_em = new Date();
  const fim = meus.some(z => sim_(z.terminou));
  if (fim && d.status !== 'Concluída') { d.status = 'Concluída'; d.concluida_em = new Date(); }
  else if (!fim && d.status !== 'Cancelada') { d.status = 'Em execução'; d.concluida_em = ''; }
  const un = TOPO_UN_TXT_[topoUn_(d.unidade)];
  topoHist_(d, ctx, novo ? 'Lançamento do dia ' + fdT_(data) : 'Lançamento corrigido (' + fdT_(data) + ')', nfT_(qtd) + ' ' + un + (terminou ? ' · TERMINOU' : '') + ' · ' + plural_(fotos.length, 'foto', 'fotos') + (croquis.length ? ' · croqui' : '') + (arqUsado ? ' · arquivo: ' + arqUsado : ''));
  d.atualizado_em = new Date();
  T.update(d);
  log_(ctx, 'topo_lancar', d.id + ' ' + data + ' ' + qtd + ' ' + un);
  const prev = num_(d.qtd_prevista);
  return { msg: terminou ? 'Demanda ' + d.id + ' concluída. ' + d.criado_por + ' foi avisado.' : 'Lançamento salvo: ' + nfT_(qtd) + ' ' + un + (prev > 0 ? ' (' + nfT_(d.qtd_feita) + ' de ' + nfT_(prev) + ' ' + un + ')' : '') + '.', id: x.id, status: d.status };
}
const nfT_ = n => String(topoR3_(n)).replace('.', ',');

/* diários do topógrafo (separados do RDO da obra): por mês, topógrafo e obra */
function topoDiarios_(q, ctx) {
  const mes = /^\d{4}-\d{2}$/.test(String(q.mes || '')) ? String(q.mes) : hojeYmd_().slice(0, 7), gere = topoGere_(ctx);
  const L = central_('TopoDiarios').all().filter(x => ymd_(x.data).slice(0, 7) === mes && (gere || String(x.topografo_id) === String(ctx.u.id)));
  return { mes: mes, diarios: L.map(topoDiarioPub_).sort((a, b) => b.data.localeCompare(a.data) || a.topografo.localeCompare(b.topografo)) };
}
/* produção do mês: por topógrafo (por unidade e tipo), por obra, dias trabalhados, demandas concluídas e no prazo */
function topoProducao_(q, ctx) {
  const mes = /^\d{4}-\d{2}$/.test(String(q.mes || '')) ? String(q.mes) : hojeYmd_().slice(0, 7), gere = topoGere_(ctx);
  const B = topoBase_(), meu = x => gere || String(x.topografo_id) === String(ctx.u.id);
  const L = B.L.filter(x => ymd_(x.data).slice(0, 7) === mes && meu(x)), por = {};
  const P = id => (por[id] = por[id] || { id: id, nome: '', dias: {}, un: { m: 0, pt: 0, un: 0 }, tipos: {}, obras: {}, lancamentos: 0, concluidas: 0, no_prazo: 0, fotos: 0 });
  L.forEach(x => {
    const p = P(String(x.topografo_id)), u = topoUn_(x.unidade), qd = num_(x.qtd);
    p.nome = x.topografo; p.dias[ymd_(x.data)] = 1; p.un[u] += qd; p.lancamentos++; p.fotos += json_(x.fotos_json, []).length;
    const kt = x.tipo + '|' + u; p.tipos[kt] = (p.tipos[kt] || 0) + qd;
    const ko = x.obra_nome || '—'; p.obras[ko] = p.obras[ko] || { m: 0, pt: 0, un: 0 }; p.obras[ko][u] += qd;
  });
  B.D.filter(d => d.status === 'Concluída' && ymd_(d.concluida_em).slice(0, 7) === mes && meu(d)).forEach(d => {
    const p = P(String(d.topografo_id)); p.nome = p.nome || d.topografo; p.concluidas++;
    if (ymd_(d.concluida_em) <= ymd_(d.data) || !d.adiada_em) p.no_prazo++;
  });
  const lista = Object.keys(por).map(k => {
    const p = por[k], dias = Object.keys(p.dias).length;
    return { id: p.id, nome: p.nome, dias: dias, lancamentos: p.lancamentos, fotos: p.fotos, un: { m: topoR3_(p.un.m), pt: topoR3_(p.un.pt), un: topoR3_(p.un.un) },
      tipos: Object.keys(p.tipos).map(t => { const a = t.split('|'); return { tipo: a[0], unidade: a[1], qtd: topoR3_(p.tipos[t]) }; }).sort((a, b) => b.qtd - a.qtd),
      obras: Object.keys(p.obras).map(o => ({ obra: o, m: topoR3_(p.obras[o].m), pt: topoR3_(p.obras[o].pt), un: topoR3_(p.obras[o].un) })),
      concluidas: p.concluidas, no_prazo: p.no_prazo };
  }).sort((a, b) => a.nome.localeCompare(b.nome));
  // dia a dia (gráfico do mês)
  const serie = {};
  L.forEach(x => { const k = ymd_(x.data) + '|' + x.topografo_id + '|' + topoUn_(x.unidade); serie[k] = (serie[k] || 0) + num_(x.qtd); });
  return { mes: mes, topografos: lista, serie: Object.keys(serie).map(k => { const a = k.split('|'); return { data: a[0], topografo_id: a[1], unidade: a[2], qtd: topoR3_(serie[k]) }; }),
    abertas: B.D.filter(d => TOPO_ABERTAS_.indexOf(d.status) >= 0 && meu(d)).length, produtividade: B.prod.tabela.filter(p => gere || p.topografo_id === String(ctx.u.id)), padrao: B.prod.padrao };
}
/* arquivo (anexo, foto, croqui): só quem vê a demanda */
function topoArquivo_(q, ctx) {
  const id = String(q.id || '');
  if (!id) throw new Error('Arquivo não informado.');
  const tem = l => json_(l, []).some(a => a.id === id);
  let d = central_('TopoDemandas').all().find(x => tem(x.anexos_json));
  if (!d) { const x = central_('TopoDiarios').all().find(z => tem(z.fotos_json) || tem(z.croquis_json) || tem(z.arquivos_json)); if (x) d = topoAchar_(x.demanda); }
  if (!d) throw new Error('Arquivo não encontrado.');
  topoMinha_(ctx, d);
  const f = DriveApp.getFileById(id), b = f.getBlob();
  return { nome: f.getName(), mime: b.getContentType(), b64: Utilities.base64Encode(b.getBytes()) };
}

/* ---------- localização do topógrafo (celular da empresa): o app manda ao abrir e a cada 10 min aberto ----------
 * parado no mesmo lugar (até 60 m) só atualiza o horário do último ponto; guarda os últimos TOPO_LOCAIS_MAX pontos de cada um */
const TOPO_LOCAIS_MAX = 60;
function topoDist_(a, b) {
  const r = Math.PI / 180, x = (num_(b.lng) - num_(a.lng)) * r * Math.cos((num_(a.lat) + num_(b.lat)) / 2 * r), y = (num_(b.lat) - num_(a.lat)) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
}
function topoLocal_(q, ctx) {
  if (norm_(ctx.u.topografia) !== norm_('Topógrafo')) return { ok: true, ignorado: true };
  const lat = num_(q.lat), lng = num_(q.lng), prec = Math.round(num_(q.precisao));
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && lat && lng)) throw new Error('Localização inválida.');
  const T = central_('TopoLocais'), meus = T.all().filter(x => String(x.usuario_id) === String(ctx.u.id)), ult = meus[meus.length - 1], agora = new Date();
  const p = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  if (ult && topoDist_(ult, p) <= 60 && ymd_(ult.em) === hojeYmd_()) { ult.visto_em = agora; if (prec && (!num_(ult.precisao) || prec < num_(ult.precisao))) Object.assign(ult, p, { precisao: prec }); T.update(ult); }
  else {
    T.insert(Object.assign({ usuario_id: ctx.u.id, usuario: ctx.u.nome, precisao: prec || '', em: agora, visto_em: agora }, p));
    if (meus.length + 1 > TOPO_LOCAIS_MAX) { const velhos = meus.slice(0, meus.length + 1 - TOPO_LOCAIS_MAX); T.removeWhere(x => velhos.indexOf(x) >= 0); }
  }
  return { ok: true };
}
/* último ponto de cada topógrafo e o caminho de hoje (para o mapa de quem gere) */
function topoLocais_() {
  const hoje = hojeYmd_(), por = {};
  central_('TopoLocais').all().forEach(x => { (por[x.usuario_id] = por[x.usuario_id] || []).push(x); });
  return topoTopografos_().filter(t => por[t.id]).map(t => {
    const l = por[t.id], u = l[l.length - 1];
    return { id: t.id, nome: t.nome, telefone: t.telefone, lat: num_(u.lat), lng: num_(u.lng), precisao: num_(u.precisao) || '', em: fmtVal_(u.em), visto_em: fmtVal_(u.visto_em || u.em),
      hoje: l.filter(x => ymd_(x.em) === hoje).map(x => [num_(x.lat), num_(x.lng), fmtVal_(x.em).slice(11, 16), fmtVal_(x.visto_em || x.em).slice(11, 16)]) };
  });
}

/* ---------- avisos (sino e celular): o topógrafo recebe as demandas novas, mudanças de data e o lembrete da véspera;
 * quem abriu (e o administrador) recebe a data mudada pelo topógrafo e a demanda concluída ---------- */
function topoNotif_(ctx) {
  const n = nivelTopo_(ctx.u);
  if (!n) return [];
  const D = central_('TopoDemandas').all();
  if (!D.length) return [];
  const itens = [], eu = String(ctx.u.id), hoje = hojeYmd_(), recente = Date.now() - 3 * 864e5;
  const add = (d, etapa, texto, extra, prio) => itens.push({
    id: 'topo|' + d.id + '|' + etapa + (extra ? '|' + extra : ''), obra: '', obra_nome: d.obra_nome || 'Topografia', numero: d.id, etapa: etapa, rota: '#/topo/demanda/' + d.id,
    url: './#/topo/demanda/' + encodeURIComponent(d.id), texto: texto, resumo: topoResumo_(d), situacao: d.status, prioridade: prio || '', quando: fmtVal_(d.atualizado_em || d.criado_em)
  });
  D.forEach(d => {
    const minha = String(d.topografo_id) === eu, abriu = String(d.criado_por_id) === eu || ctx.admin;
    // a data e o topógrafo entram no id: mudou a data, sai um aviso novo
    if (minha && d.status === 'Agendada') add(d, 'topo_nova', (json_(d.historico_json, []).some(h => /Data alterada|editada/.test(h.acao)) ? 'Demanda para ' : 'Nova demanda para ') + fdT_(ymd_(d.data)) + ' · aberta por ' + d.criado_por, eu + '|' + ymd_(d.data), d.prioridade === 'Urgente' ? 'Urgente' : '');
    if (abriu && !minha && d.adiada_em instanceof Date && d.adiada_em.getTime() >= recente && TOPO_ABERTAS_.indexOf(d.status) >= 0)
      add(d, 'topo_adiada', d.adiada_por + ' mudou a data para ' + fdT_(ymd_(d.data)) + ' · ' + d.motivo, ymd_(d.data));
    if (abriu && !minha && d.status === 'Concluída' && d.concluida_em instanceof Date && d.concluida_em.getTime() >= recente)
      add(d, 'topo_concluida', 'Concluída por ' + d.topografo + ' · ' + nfT_(d.qtd_feita) + ' ' + TOPO_UN_TXT_[topoUn_(d.unidade)]);
  });
  // lembrete da véspera (a partir das 17h): o que a agenda automática põe no próximo dia útil
  if (n === 'Topógrafo' || D.some(d => String(d.topografo_id) === eu)) {
    const h = +Utilities.formatDate(new Date(), tz_(), 'H');
    if (h >= 17) {
      const amanha = topoProxUtil_(addDias_(hoje, 1)), ag = topoAgenda_(D, topoProdutividade_(central_('TopoDiarios').all()), hoje).prev;
      const l = D.filter(d => String(d.topografo_id) === eu && ag[d.id] && ag[d.id].ini <= amanha && ag[d.id].fim >= amanha);
      if (l.length) itens.push({ id: 'topo|agenda|' + amanha, obra: '', obra_nome: 'Topografia', numero: 'Agenda', etapa: 'topo_amanha', rota: '#/topo/agenda', url: './#/topo/agenda',
        texto: (amanha === addDias_(hoje, 1) ? 'Amanhã' : fdT_(amanha)) + ': ' + plural_(l.length, 'demanda', 'demandas'), resumo: l.map(topoResumo_).join(' · ').slice(0, 220), situacao: '', prioridade: '', quando: fmtVal_(new Date()) });
    }
  }
  return itens;
}
const topoResumo_ = d => [d.tipo, d.servico, d.local].filter(Boolean).join(' · ') + (d.obra_nome ? ' (' + d.obra_nome + ')' : '');
