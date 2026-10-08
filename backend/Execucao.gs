/**
 * EXECUÇÃO DE OBRA · etapas, itens com quantidade prevista, diário de obra (RDO), clima, fotos,
 * avisos do engenheiro e os cálculos de produção (média, ritmo necessário, término projetado, produtividade).
 *
 * Regras combinadas:
 *  - um diário por dia da obra, com várias etapas dentro (numerado RDO 001, 002…);
 *  - executado acima do previsto não bloqueia: vira alerta para o engenheiro corrigir a quantidade;
 *  - dias úteis = segunda a sexta sem feriado nacional (e municipal da obra); lançar em sábado, domingo
 *    ou feriado é livre e marca o diário como "aditivo especial" (conta na produção, não muda o planejamento);
 *  - chuva ≥ CHUVA_LIMITE_MM (padrão 5 mm) entre 7h e 17h sugere "Parado por chuva"; dia parado sai da média;
 *  - o encarregado lança hoje e ontem (ontem cobre o envio atrasado de quem ficou sem sinal);
 *    dias anteriores e mudanças de quantidade/datas só o engenheiro, com motivo (tudo fica registrado).
 */
const CONDICOES_ = ['Trabalhável', 'Parcial', 'Parado por chuva'];
const SEVERIDADE_ = { concluido: 0, nao_iniciado: 1, no_ritmo: 2, atencao: 3, atrasado: 4 };

/* ---------- datas como texto aaaa-mm-dd (sem fuso) ---------- */
function ymd_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}
function utc_(s) { const a = String(s).split('-'); return new Date(Date.UTC(+a[0], a[1] - 1, +a[2])); }
function dow_(s) { return utc_(s).getUTCDay(); }
function addDias_(s, n) { const d = utc_(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function hojeYmd_() { return ymd_(new Date()); }

/* ---------- feriados: nacionais calculados (inclui Carnaval, Sexta-feira Santa e Corpus Christi) + municipais da obra ---------- */
function pascoa_(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return y + '-' + ('0' + mes).slice(-2) + '-' + ('0' + dia).slice(-2);
}
function feriadosNacionais_(y) {
  const p = pascoa_(y), f = {};
  ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].forEach(d => { f[y + '-' + d] = 1; });
  f[addDias_(p, -48)] = 1; f[addDias_(p, -47)] = 1; // Carnaval (segunda e terça)
  f[addDias_(p, -2)] = 1;                           // Sexta-feira Santa
  f[addDias_(p, 60)] = 1;                           // Corpus Christi
  return f;
}
/* devolve uma função ymd → é feriado? (calcula os anos sob demanda) */
function feriadosObra_(obra) {
  const anos = {}, munFixo = {}, munData = {};
  String((obra && obra.feriados) || '').split(/[;,\n]/).map(s => s.trim()).filter(Boolean).forEach(s => {
    const a = s.split('/');
    if (a.length === 2) munFixo[('0' + a[1]).slice(-2) + '-' + ('0' + a[0]).slice(-2)] = 1;
    if (a.length === 3) munData[a[2] + '-' + ('0' + a[1]).slice(-2) + '-' + ('0' + a[0]).slice(-2)] = 1;
  });
  return s => {
    const y = +String(s).slice(0, 4);
    if (!anos[y]) anos[y] = feriadosNacionais_(y);
    return !!(anos[y][s] || munFixo[String(s).slice(5)] || munData[s]);
  };
}
function listaFeriados_(obra, anoIni, anoFim) {
  const eh = feriadosObra_(obra), out = [];
  for (let s = anoIni + '-01-01'; s <= anoFim + '-12-31'; s = addDias_(s, 1)) if (eh(s)) out.push(s);
  return out;
}

/* ---------- clima (Open-Meteo): o app consulta direto do celular e manda o resumo do dia para cá.
 * (Assim o script não precisa de permissão para acessar a internet; aqui só confere e grava.) ---------- */
function limiteChuva_() { return num_(config_().CHUVA_LIMITE_MM) || 5; }
function climaLimpo_(c, dia) {
  if (!c || typeof c !== 'object' || !c.manha) return null;
  const n = v => v === '' || v == null || isNaN(Number(v)) ? '' : Math.round(Number(v) * 10) / 10;
  const per = p => ({ mm: n(p && p.mm) || 0, codigo: n(p && p.codigo), desc: String((p && p.desc) || '—').slice(0, 40), tmin: n(p && p.tmin), tmax: n(p && p.tmax) });
  const trab = n(c.mm_trabalho) || 0, hoje = hojeYmd_();
  return {
    manha: per(c.manha), tarde: per(c.tarde), mm_trabalho: trab, mm_dia: n(c.mm_dia) || 0, tmin: n(c.tmin), tmax: n(c.tmax), vento: n(c.vento),
    sugestao: trab >= limiteChuva_() ? 'Parado por chuva' : 'Trabalhável', limite: limiteChuva_(),
    tipo: dia > hoje ? 'previsão' : dia === hoje ? 'hoje (atualiza a cada salvamento)' : 'registrado', fonte: 'Open-Meteo', em: fmtVal_(new Date())
  };
}
function gravarClima_(d, c, dia) {
  const cl = climaLimpo_(c, dia);
  if (!cl || d.clima_final === 'Sim') return false;
  d.clima_json = JSON.stringify(cl); d.chuva_manha = cl.manha.mm; d.chuva_tarde = cl.tarde.mm; d.chuva_trabalho = cl.mm_trabalho; d.chuva_dia = cl.mm_dia;
  d.tmin = cl.tmin; d.tmax = cl.tmax; d.vento = cl.vento; d.sugestao = cl.sugestao;
  if (dia < hojeYmd_()) d.clima_final = 'Sim'; // dia encerrado: o clima fica gravado
  return true;
}
function coordsObra_(ctx, gps) {
  const o = ctx.obra;
  if ((o.lat === '' || o.lat == null) && gps && gps.lat) {
    const O = central_('Obras'), r = O.all().find(x => String(x.id) === String(o.id));
    r.lat = Math.round(num_(gps.lat) * 1e5) / 1e5; r.lng = Math.round(num_(gps.lng) * 1e5) / 1e5;
    O.update(r); o.lat = r.lat; o.lng = r.lng;
  }
  return { lat: o.lat, lng: o.lng };
}
/* completa o clima de um diário que foi enviado sem sinal (não mexe em quantidades, então vale para qualquer data) */
function execClimaSalvar_(q, ctx) {
  const dia = ymd_(q.data), d = diarioDo_(ctx, dia, false);
  coordsObra_(ctx, q.gps);
  if (!d) return { msg: 'Sem diário nesse dia.' };
  if (!gravarClima_(d, q.clima, dia)) return { msg: 'Clima já registrado.' };
  if (!d.condicao) d.condicao = d.sugestao;
  obraTab_(ctx, 'Diarios').update(d);
  return { msg: 'Clima registrado.' };
}
/* ---------- catálogo de serviços (planilha central) ---------- */
const SERVICOS_PADRAO_ = [
  ['Serviços preliminares', 'Locação de obra', 'm'], ['Serviços preliminares', 'Limpeza e roçada do terreno', 'm²'], ['Serviços preliminares', 'Demolição', 'm²'],
  ['Terraplenagem', 'Escavação / corte', 'm³'], ['Terraplenagem', 'Aterro compactado', 'm³'], ['Terraplenagem', 'Bota-fora / carga e transporte', 'm³'],
  ['Terraplenagem', 'Regularização e compactação do subleito', 'm²'],
  ['Pavimentação', 'Sub-base', 'm²'], ['Pavimentação', 'Base', 'm²'], ['Pavimentação', 'Imprimação', 'm²'], ['Pavimentação', 'Pintura de ligação', 'm²'],
  ['Pavimentação', 'Asfalto (CBUQ)', 'm²'], ['Pavimentação', 'Paver / bloquete', 'm²'], ['Pavimentação', 'Meio-fio', 'm'], ['Pavimentação', 'Sarjeta', 'm'],
  ['Pavimentação', 'Calçada', 'm²'], ['Pavimentação', 'Sinalização horizontal', 'm²'],
  ['Drenagem pluvial', 'Escavação de vala', 'm³'], ['Drenagem pluvial', 'Escoramento de vala', 'm²'], ['Drenagem pluvial', 'Tubulação de concreto DN 400', 'm'],
  ['Drenagem pluvial', 'Tubulação de concreto DN 600', 'm'], ['Drenagem pluvial', 'Tubulação de concreto DN 800', 'm'], ['Drenagem pluvial', 'Boca de lobo', 'un'],
  ['Drenagem pluvial', 'Poço de visita', 'un'], ['Drenagem pluvial', 'Caixa de ligação', 'un'], ['Drenagem pluvial', 'Reaterro compactado', 'm³'],
  ['Esgoto', 'Rede coletora PVC DN 150', 'm'], ['Esgoto', 'Poço de visita de esgoto', 'un'], ['Esgoto', 'Ligação domiciliar de esgoto', 'un'],
  ['Água', 'Rede de água PEAD', 'm'], ['Água', 'Ligação domiciliar de água', 'un'], ['Água', 'Registro / válvula', 'un'],
  ['Elétrica e iluminação', 'Poste', 'un'], ['Elétrica e iluminação', 'Rede elétrica', 'm'], ['Elétrica e iluminação', 'Luminária', 'un'],
  ['Fundação', 'Estaca', 'm'], ['Fundação', 'Bloco de fundação', 'un'], ['Fundação', 'Viga baldrame', 'm'],
  ['Estrutura', 'Forma', 'm²'], ['Estrutura', 'Armação', 'kg'], ['Estrutura', 'Concreto estrutural', 'm³'], ['Estrutura', 'Laje', 'm²'],
  ['Alvenaria e revestimento', 'Alvenaria de vedação', 'm²'], ['Alvenaria e revestimento', 'Chapisco', 'm²'], ['Alvenaria e revestimento', 'Reboco / emboço', 'm²'],
  ['Alvenaria e revestimento', 'Contrapiso', 'm²'], ['Alvenaria e revestimento', 'Revestimento cerâmico', 'm²'],
  ['Acabamento', 'Forro', 'm²'], ['Acabamento', 'Pintura', 'm²'], ['Acabamento', 'Esquadrias', 'un'],
  ['Cobertura', 'Estrutura do telhado', 'm²'], ['Cobertura', 'Telhamento', 'm²']
];
function garantirCatalogo_() {
  const T = central_('ServicosPadrao');
  if (T.all().length) return T;
  T.insertMany(SERVICOS_PADRAO_.map((s, i) => ({ codigo: 'S' + ('000' + (i + 1)).slice(-4), grupo: s[0], servico: s[1], unidade: s[2], ativo: 'Sim' })));
  return T;
}
function adminServicoSalvar_(q, ctx) {
  const T = garantirCatalogo_(), nome = String(q.servico || '').trim();
  if (!nome) throw new Error('Informe o nome do serviço.');
  if (!String(q.unidade || '').trim()) throw new Error('Informe a unidade (m, m², m³, un…).');
  let s = q.codigo ? T.all().find(x => String(x.codigo) === String(q.codigo)) : null;
  if (T.all().some(x => x !== s && norm_(x.servico) === norm_(nome))) throw new Error('Serviço já está no catálogo.');
  const novo = !s;
  if (novo) s = { codigo: T.proxCodigo('codigo', 'S', 4) };
  s.servico = nome; s.grupo = String(q.grupo || '').trim(); s.unidade = String(q.unidade).trim();
  s.ativo = q.ativo === false ? 'Não' : 'Sim';
  if (novo) T.insert(s); else T.update(s);
  return { msg: 'Serviço salvo no catálogo (' + s.codigo + ').' };
}

/* ---------- leitura: tudo da execução com os cálculos ---------- */
function calcExec_(ctx, ate) {
  const hoje = ate || hojeYmd_(), ontem = addDias_(hoje, -1);
  const fer = feriadosObra_(ctx.obra);
  const util = s => { const w = dow_(s); return w >= 1 && w <= 5 && !fer(s); };
  const etapas = obraTab_(ctx, 'Etapas').all(), itens = obraTab_(ctx, 'EtapaItens').all().filter(i => !/^n/i.test(String(i.ativo)));
  const prod = obraTab_(ctx, 'Producao').all(), diarios = obraTab_(ctx, 'Diarios').all(), eqd = obraTab_(ctx, 'EquipesDia').all();
  const parado = {};
  diarios.forEach(d => { if (d.condicao === 'Parado por chuva') parado[ymd_(d.data)] = 1; });
  const homem = {}, equipesDia = {};
  eqd.forEach(e => { const k = ymd_(e.data) + '|' + e.etapa; homem[k] = (homem[k] || 0) + num_(e.pessoas); equipesDia[k] = (equipesDia[k] || 0) + 1; });
  const porItem = {};
  prod.forEach(p => { if (ymd_(p.data) <= hoje) (porItem[p.item_id] = porItem[p.item_id] || []).push(p); });
  // conta dias de trabalho entre a e b: úteis não parados + dias extras (aditivo) em que houve produção
  const diasTrab = (a, b, comProd) => { let n = 0; for (let s = a; s <= b; s = addDias_(s, 1)) if (util(s) ? !parado[s] : comProd[s]) n++; return n; };
  const uteis = (a, b) => { let n = 0; for (let s = a; s <= b; s = addDias_(s, 1)) if (util(s)) n++; return n; };
  const somaUteis = (a, n) => { let s = a, k = 0; while (true) { if (util(s)) { k++; if (k >= n) return s; } s = addDias_(s, 1); if (s > addDias_(a, 3650)) return ''; } };

  const alertas = [];
  const its = itens.map(i => {
    const ls = porItem[i.id] || [], dia = {};
    ls.forEach(p => { const s = ymd_(p.data); dia[s] = (dia[s] || 0) + num_(p.qtd); });
    const dias = Object.keys(dia).filter(s => dia[s] > 0).sort();
    const prev = num_(i.qtd_prevista), exec = Object.keys(dia).reduce((t, s) => t + dia[s], 0);
    const ini = ymd_(i.inicio), fim = ymd_(i.termino), primeiro = dias[0] || '', ultimo = dias[dias.length - 1] || '';
    const ateCalc = dia[hoje] ? hoje : ontem;
    const n = primeiro && primeiro <= ateCalc ? diasTrab(primeiro, ateCalc, dia) : 0;
    const media = n ? exec / n : (dia[hoje] || 0);
    // últimos 7 dias de trabalho
    let k = 0, s7 = ateCalc, e7 = 0;
    while (primeiro && k < 7 && s7 >= primeiro) { if (util(s7) ? !parado[s7] : dia[s7]) { k++; e7 += dia[s7] || 0; } s7 = addDias_(s7, -1); }
    const media7 = k ? e7 / k : media;
    const saldo = Math.max(0, prev - exec);
    const iniRest = dia[hoje] ? addDias_(hoje, 1) : hoje, de = ini && ini > iniRest ? ini : iniRest;
    const restam = fim && de <= fim ? uteis(de, fim) : 0;
    const ritmo = saldo > 0 ? (restam ? saldo / restam : null) : 0;
    const projecao = saldo <= 0 ? ultimo : media > 0 ? somaUteis(de, Math.ceil(saldo / media)) : '';
    const totU = ini && fim ? uteis(ini, fim) : 0, decU = ini && fim && hoje >= ini ? uteis(ini, hoje < fim ? hoje : fim) : 0;
    const planejado = totU ? Math.min(100, decU / totU * 100) : 0;
    let sit;
    if (prev > 0 && exec >= prev) sit = 'concluido';
    else if (!primeiro) sit = !ini || hoje < ini ? 'nao_iniciado' : fim && hoje > fim ? 'atrasado' : 'atencao';
    else if (fim && hoje > fim) sit = 'atrasado';
    else if (projecao && fim && projecao > fim) sit = 'atrasado';
    else if (ritmo === null || (ritmo > 0 && ritmo > media * 1.1)) sit = 'atencao';
    else sit = 'no_ritmo';
    const hd = dias.reduce((t, s) => t + (homem[s + '|' + i.etapa] || 0), 0), ed = dias.reduce((t, s) => t + (equipesDia[s + '|' + i.etapa] || 0), 0);
    // dias úteis sem lançamento desde o último (até ontem), com a etapa em andamento
    let sem = 0;
    if (sit !== 'concluido' && ini && hoje >= ini) for (let s = addDias_(ultimo || addDias_(ini, -1), 1); s <= ontem; s = addDias_(s, 1)) if (util(s) && !parado[s]) sem++;
    const r = {
      id: i.id, etapa: i.etapa, servico: i.servico, servico_cod: i.servico_cod, grupo: i.grupo, unidade: i.unidade, ordem: i.ordem,
      prevista: prev, original: num_(i.qtd_original) || prev, inicio: ini, termino: fim, inicio_original: ymd_(i.inicio_original) || ini, termino_original: ymd_(i.termino_original) || fim,
      executado: r2_(exec), saldo: r2_(saldo), pct: prev ? r2_(exec / prev * 100) : 0, planejado: r2_(planejado), media: r2_(media), media7: r2_(media7),
      ritmo: ritmo === null ? null : r2_(ritmo), projecao: projecao, dias_trab: n, dias_restantes: restam, primeiro: primeiro, ultimo: ultimo,
      homem_dia: hd, equipe_dia: ed, prod_hd: hd ? r2_(exec / hd) : null, prod_ed: ed ? r2_(exec / ed) : null, situacao: sit, sem_lanc: sem,
      hoje_qtd: r2_(dia[hoje] || 0), alterado: num_(i.qtd_original) && num_(i.qtd_original) !== prev || ymd_(i.termino_original) && ymd_(i.termino_original) !== fim
    };
    if (exec > prev && prev > 0) alertas.push({ tipo: 'excedido', item: i.id, etapa: i.etapa, texto: i.servico + ': executado ' + nfmt_(exec) + ' de ' + nfmt_(prev) + ' ' + i.unidade + ' — corrigir a quantidade prevista' });
    if (sit === 'atrasado') alertas.push({ tipo: 'atrasado', item: i.id, etapa: i.etapa, texto: i.servico + ': ' + (fim && hoje > fim ? 'prazo vencido em ' + fmtBr_(fim) : 'término projetado ' + fmtBr_(projecao) + ' (previsto ' + fmtBr_(fim) + ')') });
    if (sem >= 2) alertas.push({ tipo: 'sem_lancamento', item: i.id, etapa: i.etapa, texto: i.servico + ': ' + sem + ' dias úteis sem lançamento' });
    return r;
  });
  const ets = etapas.map(e => {
    const li = its.filter(i => String(i.etapa) === String(e.codigo)).sort((a, b) => num_(a.ordem) - num_(b.ordem));
    const sit = li.length ? li.reduce((m, i) => SEVERIDADE_[i.situacao] > SEVERIDADE_[m] ? i.situacao : m, li.every(i => i.situacao === 'concluido') ? 'concluido' : 'nao_iniciado') : 'nao_iniciado';
    return {
      codigo: e.codigo, nome: e.nome, local: e.local, frente: e.frente, responsavel: e.responsavel, obs: e.obs, ativa: !/^n/i.test(String(e.ativa)),
      pct: li.length ? r2_(li.reduce((t, i) => t + Math.min(100, i.pct), 0) / li.length) : 0,
      planejado: li.length ? r2_(li.reduce((t, i) => t + i.planejado, 0) / li.length) : 0,
      inicio: li.map(i => i.inicio).filter(Boolean).sort()[0] || '', termino: li.map(i => i.termino).filter(Boolean).sort().pop() || '',
      situacao: sit, itens: li
    };
  });
  return { hoje: hoje, etapas: ets, alertas: alertas, util: util, parado: parado };
}
function r2_(n) { return Math.round(num_(n) * 100) / 100; }
function nfmt_(n) { return Number(r2_(n)).toLocaleString('pt-BR'); }
function fmtBr_(s) { return s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) : ''; }
function dataTxt_(s) { return s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : ''; }

function execDados_(q, ctx) {
  const cat = garantirCatalogo_();
  const c = calcExec_(ctx), y = +c.hoje.slice(0, 4);
  return {
    hoje: c.hoje, etapas: c.etapas, alertas: c.alertas,
    equipes: obraTab_(ctx, 'Equipes').all().map(pub_),
    catalogo: cat.all().filter(s => !/^n/i.test(String(s.ativo))).map(pub_),
    avisos: obraTab_(ctx, 'AvisosExec').all().filter(a => a.status !== 'Encerrado').map(pub_).reverse(),
    diarios: obraTab_(ctx, 'Diarios').all().map(d => ({
      numero: d.numero, data: ymd_(d.data), status: d.status, condicao: d.condicao, aditivo: d.aditivo, responsavel: d.responsavel,
      mm: d.chuva_trabalho, revisado_por: d.revisado_por
    })).sort((a, b) => b.data.localeCompare(a.data)),
    feriados: listaFeriados_(ctx.obra, y - 1, y + 1),
    obra: { lat: ctx.obra.lat, lng: ctx.obra.lng, endereco: ctx.obra.endereco },
    limite_chuva: limiteChuva_()
  };
}

/* ---------- planejamento (engenheiro) ---------- */
function alteracao_(ctx, tipo, ref, campo, de, para, motivo, etapa) {
  obraTab_(ctx, 'AlteracoesExec').insert({ data: new Date(), usuario: ctx.u.nome, tipo: tipo, ref: ref, etapa: etapa || String(ref).split('-')[0], campo: campo, de: fmtVal_(de), para: fmtVal_(para), motivo: motivo || '' });
}
function execEtapaSalvar_(q, ctx) {
  const E = obraTab_(ctx, 'Etapas'), I = obraTab_(ctx, 'EtapaItens'), nome = String(q.nome || '').trim();
  if (!nome) throw new Error('Informe o nome da etapa (ex: Pavimentação · Rua X).');
  let e = q.codigo ? E.all().find(x => String(x.codigo) === String(q.codigo)) : null;
  const nova = !e;
  if (nova) e = { codigo: E.proxCodigo('codigo', 'ET', 3), criado_em: new Date(), criado_por: ctx.u.nome, ativa: 'Sim' };
  else if (norm_(e.nome) !== norm_(nome)) alteracao_(ctx, 'etapa', e.codigo, 'nome', e.nome, nome, q.motivo);
  e.nome = nome; e.local = String(q.local || '').trim(); e.frente = String(q.frente || '').trim();
  e.responsavel = String(q.responsavel || '').trim(); e.obs = String(q.obs || '').trim();
  if (q.ativa !== undefined) e.ativa = q.ativa ? 'Sim' : 'Não';
  const novos = [].concat(q.itens || []).filter(x => x && !x.id);
  if (nova && !novos.length) throw new Error('Inclua pelo menos um serviço na etapa.');
  const cat = garantirCatalogo_().all();
  let ordem = I.all().filter(i => String(i.etapa) === String(e.codigo)).reduce((m, i) => Math.max(m, num_(i.ordem)), 0);
  const linhas = novos.map(x => {
    const sc = x.servico_cod ? cat.find(s => String(s.codigo) === String(x.servico_cod)) : cat.find(s => norm_(s.servico) === norm_(x.servico));
    const servico = sc ? sc.servico : String(x.servico || '').trim(), unidade = sc ? sc.unidade : String(x.unidade || '').trim();
    if (!servico) throw new Error('Informe o serviço de cada item.');
    if (!unidade) throw new Error('Informe a unidade de ' + servico + '.');
    const qtd = num_(x.qtd_prevista);
    if (!(qtd > 0)) throw new Error('Informe a quantidade prevista de ' + servico + '.');
    const ini = dataDe_(x.inicio), fim = dataDe_(x.termino);
    if (!ini || !fim) throw new Error('Informe início e término previstos de ' + servico + '.');
    if (ymd_(fim) < ymd_(ini)) throw new Error('O término de ' + servico + ' está antes do início.');
    return {
      id: e.codigo + '-' + Utilities.getUuid().slice(0, 6), etapa: e.codigo, servico_cod: sc ? sc.codigo : '', servico: servico, grupo: sc ? sc.grupo : 'Avulso',
      unidade: unidade, qtd_prevista: qtd, qtd_original: qtd, inicio: ini, termino: fim, inicio_original: ini, termino_original: fim, ativo: 'Sim', ordem: ++ordem
    };
  });
  if (nova) E.insert(e); else E.update(e);
  I.insertMany(linhas);
  if (!nova) linhas.forEach(l => alteracao_(ctx, 'item', l.id, 'incluído', '', l.servico + ' ' + l.qtd_prevista + ' ' + l.unidade, q.motivo));
  log_(ctx, nova ? 'exec_etapa_criar' : 'exec_etapa_editar', e.codigo + ' ' + e.nome);
  return { msg: nova ? 'Etapa ' + e.nome + ' criada com ' + linhas.length + ' serviço(s).' : 'Etapa salva.', codigo: e.codigo };
}
function execItemAlterar_(q, ctx) {
  const I = obraTab_(ctx, 'EtapaItens'), i = I.all().find(x => String(x.id) === String(q.id));
  if (!i) throw new Error('Serviço não encontrado.');
  const motivo = String(q.motivo || '').trim();
  if (motivo.length < 5) throw new Error('Explique o motivo da mudança (fica registrado).');
  if (q.remover) {
    if (obraTab_(ctx, 'Producao').all().some(p => String(p.item_id) === String(i.id))) throw new Error('Este serviço já tem lançamentos. Ajuste a quantidade em vez de remover.');
    i.ativo = 'Não'; I.update(i);
    alteracao_(ctx, 'item', i.id, 'removido', i.servico, '', motivo);
    return { msg: 'Serviço removido da etapa.' };
  }
  const mud = [];
  if (q.qtd_prevista !== undefined && num_(q.qtd_prevista) !== num_(i.qtd_prevista)) {
    if (!(num_(q.qtd_prevista) > 0)) throw new Error('Quantidade inválida.');
    mud.push(['qtd_prevista', i.qtd_prevista, num_(q.qtd_prevista)]);
  }
  ['inicio', 'termino'].forEach(k => { if (q[k] && ymd_(q[k]) !== ymd_(i[k])) mud.push([k, i[k], dataDe_(q[k])]); });
  if (!mud.length) throw new Error('Nada mudou.');
  mud.forEach(m => { alteracao_(ctx, 'item', i.id, m[0], m[1], m[2], motivo); i[m[0]] = m[2]; });
  if (ymd_(i.termino) < ymd_(i.inicio)) throw new Error('O término ficou antes do início.');
  I.update(i);
  log_(ctx, 'exec_item_alterar', i.id + ' ' + mud.map(m => m[0]).join(','));
  return { msg: 'Alteração registrada: ' + mud.map(m => ({ qtd_prevista: 'quantidade', inicio: 'início', termino: 'término' }[m[0]])).join(', ') + '.' };
}
function execEquipeSalvar_(q, ctx) {
  const T = obraTab_(ctx, 'Equipes'), nome = String(q.nome || '').trim();
  if (!nome) throw new Error('Informe o nome da equipe.');
  let e = q.codigo ? T.all().find(x => String(x.codigo) === String(q.codigo)) : null;
  if (T.all().some(x => x !== e && norm_(x.nome) === norm_(nome))) throw new Error('Já existe uma equipe com esse nome.');
  const nova = !e;
  if (nova) e = { codigo: T.proxCodigo('codigo', 'EQ', 2) };
  e.nome = nome; e.pessoas = Math.max(0, Math.round(num_(q.pessoas))); e.encarregado = String(q.encarregado || '').trim();
  e.ativa = q.ativa === false ? 'Não' : 'Sim';
  if (nova) T.insert(e); else T.update(e);
  return { msg: 'Equipe salva.', codigo: e.codigo };
}

/* ---------- diário do dia ---------- */
function regraData_(ctx, dia, motivo) {
  const hoje = hojeYmd_(), ontem = addDias_(hoje, -1), eng = pode_(ctx, 'exec_planejar');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error('Data inválida.');
  if (dia > hoje) throw new Error('Não dá para lançar em data futura.');
  if (dia < ontem && !eng) throw new Error('Lançamentos de dias anteriores (antes de ontem) só o engenheiro pode fazer.');
  if (dia < ontem && String(motivo || '').trim().length < 5) throw new Error('Para mexer em um dia anterior, informe o motivo (fica registrado).');
  return { eng: eng, antigo: dia < ontem };
}
function diarioDo_(ctx, dia, criar) {
  const D = obraTab_(ctx, 'Diarios');
  let d = D.all().find(x => ymd_(x.data) === dia);
  if (!d && criar) {
    const util = (() => { const fer = feriadosObra_(ctx.obra), w = dow_(dia); return w >= 1 && w <= 5 && !fer(dia); })();
    d = D.insert({
      numero: D.all().reduce((m, x) => Math.max(m, num_(x.numero)), 0) + 1, data: dataDe_(dia), responsavel_id: ctx.u.id, responsavel: ctx.u.nome,
      status: 'Rascunho', aditivo: util ? '' : 'Sim', criado_em: new Date(), atualizado_em: new Date()
    });
  }
  return d;
}
function execDiario_(q, ctx) {
  const dia = ymd_(q.data) || hojeYmd_(), d = diarioDo_(ctx, dia, false);
  const fer = feriadosObra_(ctx.obra), w = dow_(dia);
  return {
    data: dia, util: w >= 1 && w <= 5 && !fer(dia), feriado: fer(dia), dia_semana: w,
    diario: d ? Object.assign(pub_(d), { clima: d.clima_json ? JSON.parse(d.clima_json) : null }) : null,
    lancamentos: obraTab_(ctx, 'Producao').all().filter(p => ymd_(p.data) === dia).map(pub_),
    equipes: obraTab_(ctx, 'EquipesDia').all().filter(e => ymd_(e.data) === dia).map(pub_),
    fotos: obraTab_(ctx, 'FotosExec').all().filter(f => ymd_(f.data) === dia).map(pub_),
    pode_editar: dia >= addDias_(hojeYmd_(), -1) || pode_(ctx, 'exec_planejar')
  };
}
function execDiarioSalvar_(q, ctx) {
  const dia = ymd_(q.data) || hojeYmd_(), regra = regraData_(ctx, dia, q.motivo), motivo = String(q.motivo || '').trim();
  const d = diarioDo_(ctx, dia, true), D = obraTab_(ctx, 'Diarios');
  if (d.status === 'Revisado' && !regra.eng) throw new Error('Este diário já foi revisado pelo engenheiro. Peça a ele para corrigir.');
  const I = obraTab_(ctx, 'EtapaItens'), P = obraTab_(ctx, 'Producao'), itens = I.all();
  const mudou = [];
  [].concat(q.lancamentos || []).forEach(l => {
    const it = itens.find(x => String(x.id) === String(l.item_id));
    if (!it) throw new Error('Serviço não encontrado (atualize o app).');
    const qtd = r2_(num_(l.qtd)), cid = String(l.cliente_id || '');
    if (qtd < 0) throw new Error('Quantidade negativa em ' + it.servico + '.');
    // o celular manda um código próprio por lançamento (cliente_id): reenviar da fila offline não duplica
    const ex = cid ? P.all().find(p => String(p.cliente_id) === cid || String(p.id) === cid)
      : P.all().find(p => ymd_(p.data) === dia && String(p.item_id) === String(it.id) && String(p.usuario_id) === String(ctx.u.id));
    if (ex) {
      if (r2_(num_(ex.qtd)) === qtd && String(ex.obs || '') === String(l.obs || '')) return;
      if (ex.usuario_id && String(ex.usuario_id) !== String(ctx.u.id) && !regra.eng) throw new Error('O lançamento de ' + it.servico + ' é de ' + ex.usuario + '. Só ele ou o engenheiro podem mudar.');
      if (regra.antigo || (regra.eng && ymd_(ex.lancado_em) < hojeYmd_() && dia < hojeYmd_())) alteracao_(ctx, 'lancamento', ex.id, it.servico + ' ' + dataTxt_(dia), ex.qtd, qtd, motivo || 'correção', it.etapa);
      if (!qtd) { P.removeWhere(p => p === ex); mudou.push(it.id); return; }
      ex.qtd = qtd; ex.obs = String(l.obs || ''); ex.atualizado_em = new Date(); P.update(ex); mudou.push(it.id);
    } else if (qtd > 0) {
      if (regra.antigo) alteracao_(ctx, 'lancamento', cid, it.servico + ' ' + dataTxt_(dia), '', qtd, motivo, it.etapa);
      P.insert({
        id: cid || Utilities.getUuid().slice(0, 12), cliente_id: cid, diario: d.numero, data: dataDe_(dia), etapa: it.etapa, item_id: it.id,
        servico: it.servico, unidade: it.unidade, qtd: qtd, obs: String(l.obs || ''), usuario_id: ctx.u.id, usuario: ctx.u.nome, lancado_em: new Date()
      });
      mudou.push(it.id);
    }
  });
  if (q.equipes) {
    const T = obraTab_(ctx, 'EquipesDia'), etapasEq = {};
    [].concat(q.equipes).forEach(e => { etapasEq[e.etapa] = 1; });
    [].concat(q.etapas || []).forEach(e => { etapasEq[e] = 1; });
    T.removeWhere(e => ymd_(e.data) === dia && etapasEq[e.etapa]);
    T.insertMany([].concat(q.equipes).filter(e => e && e.etapa && (e.equipe || num_(e.pessoas) > 0)).map(e => ({
      diario: d.numero, data: dataDe_(dia), etapa: e.etapa, equipe: String(e.equipe || 'Equipe').trim(), pessoas: Math.max(0, Math.round(num_(e.pessoas))), usuario: ctx.u.nome
    })));
  }
  // clima do dia (o app manda o que consultou na Open-Meteo); depois que o dia acaba fica gravado
  coordsObra_(ctx, q.gps);
  if (q.clima) gravarClima_(d, q.clima, dia);
  if (q.condicao && CONDICOES_.indexOf(q.condicao) >= 0) d.condicao = q.condicao;
  else if (!d.condicao) d.condicao = d.sugestao || 'Trabalhável';
  if (q.ocorrencias !== undefined) d.ocorrencias = String(q.ocorrencias || '').slice(0, 5000);
  if (q.obs !== undefined) d.obs = String(q.obs || '').slice(0, 5000);
  if (q.enviar && d.status === 'Rascunho') { d.status = 'Enviado'; d.enviado_em = new Date(); d.enviado_por = ctx.u.nome; }
  d.atualizado_em = new Date();
  D.update(d);
  // executado acima do previsto: não bloqueia, só avisa
  const excedidos = [];
  mudou.filter((x, i, a) => a.indexOf(x) === i).forEach(id => {
    const it = itens.find(x => String(x.id) === String(id));
    const tot = P.all().filter(p => String(p.item_id) === String(id)).reduce((t, p) => t + num_(p.qtd), 0);
    if (tot > num_(it.qtd_prevista)) excedidos.push(it.servico + ' (' + nfmt_(tot) + ' de ' + nfmt_(it.qtd_prevista) + ' ' + it.unidade + ')');
  });
  log_(ctx, 'exec_diario', 'RDO ' + d.numero + ' ' + dia + ' ' + mudou.length + ' lanç.');
  return {
    msg: (q.enviar ? 'Diário enviado' : 'Diário salvo') + ' (RDO ' + ('00' + d.numero).slice(-3) + ').' + (excedidos.length ? ' Acima do previsto: ' + excedidos.join('; ') + ' — o engenheiro foi avisado.' : ''),
    numero: d.numero, excedidos: excedidos
  };
}
function pastaDiario_(ctx, dia) {
  const sub = (pai, nome) => { const it = pai.getFoldersByName(nome); return it.hasNext() ? it.next() : pai.createFolder(nome); };
  return sub(sub(pastaObra_(ctx), 'Diário de obra'), dia);
}
function execFoto_(q, ctx) {
  const dia = ymd_(q.data) || hojeYmd_();
  regraData_(ctx, dia, q.motivo || (pode_(ctx, 'exec_planejar') ? 'foto incluída depois' : ''));
  const F = obraTab_(ctx, 'FotosExec'), cid = String(q.cliente_id || '');
  if (cid) { const ja = F.all().find(f => String(f.cliente_id) === cid); if (ja) return { msg: 'Foto já enviada.', id: ja.id }; }
  if (!q.foto || !q.foto.b64) throw new Error('Foto vazia.');
  if (q.foto.b64.length > 9000000) throw new Error('Foto grande demais.');
  const d = diarioDo_(ctx, dia, true), pasta = pastaDiario_(ctx, dia), nome = 'RDO' + ('00' + d.numero).slice(-3) + '_' + stamp_() + '_' + Utilities.getUuid().slice(0, 4) + '.jpg';
  const f = pasta.createFile(Utilities.newBlob(Utilities.base64Decode(q.foto.b64), 'image/jpeg', nome));
  let mini = '';
  if (q.mini && q.mini.b64) mini = pasta.createFile(Utilities.newBlob(Utilities.base64Decode(q.mini.b64), 'image/jpeg', 'mini_' + nome)).getId();
  const r = F.insert({
    id: cid || Utilities.getUuid().slice(0, 12), cliente_id: cid, diario: d.numero, data: dataDe_(dia), etapa: String(q.etapa || ''), file_id: f.getId(), mini_id: mini,
    nome: nome, lat: q.lat || '', lng: q.lng || '', tirada_em: q.tirada_em || '', legenda: String(q.legenda || '').slice(0, 300), usuario: ctx.u.nome, enviada_em: new Date()
  });
  coordsObra_(ctx, q.lat ? { lat: q.lat, lng: q.lng } : null);
  return { msg: 'Foto salva no diário.', id: r.id };
}
function execFotoVer_(q, ctx) {
  const f = obraTab_(ctx, 'FotosExec').all().find(x => String(x.id) === String(q.id));
  if (!f) throw new Error('Foto não encontrada.');
  const file = DriveApp.getFileById(q.mini && f.mini_id ? f.mini_id : f.file_id);
  return { nome: f.nome, mime: 'image/jpeg', b64: Utilities.base64Encode(file.getBlob().getBytes()) };
}
function execRevisar_(q, ctx) {
  const dia = ymd_(q.data), d = diarioDo_(ctx, dia, false);
  if (!d) throw new Error('Não há diário nesse dia.');
  d.status = 'Revisado'; d.revisado_por = ctx.u.nome; d.revisado_em = new Date();
  obraTab_(ctx, 'Diarios').update(d);
  return { msg: 'Diário marcado como revisado.' };
}

/* ---------- avisos do engenheiro para a equipe ---------- */
const TIPOS_AVISO_ = ['Acelerar equipe', 'Rendimento baixo', 'Qualidade', 'Segurança', 'Outro'];
function execAvisoSalvar_(q, ctx) {
  const tipo = TIPOS_AVISO_.indexOf(q.tipo) >= 0 ? q.tipo : 'Outro', texto = String(q.texto || '').trim();
  if (!texto && tipo === 'Outro') throw new Error('Escreva o aviso.');
  const e = obraTab_(ctx, 'Etapas').all().find(x => String(x.codigo) === String(q.etapa));
  const a = obraTab_(ctx, 'AvisosExec').insert({
    id: 'AV' + Utilities.getUuid().slice(0, 6), data: new Date(), etapa: e ? e.codigo : '', etapa_nome: e ? e.nome : 'Obra toda', tipo: tipo,
    texto: texto, autor: ctx.u.nome, status: 'Aberto'
  });
  return { msg: 'Aviso enviado para a equipe.', id: a.id };
}
function execAvisoCiente_(q, ctx) {
  const T = obraTab_(ctx, 'AvisosExec'), a = T.all().find(x => String(x.id) === String(q.id));
  if (!a) throw new Error('Aviso não encontrado.');
  if (q.encerrar) { exigir_(ctx, 'exec_planejar'); a.status = 'Encerrado'; }
  else { a.status = 'Ciente'; a.ciente_por = ctx.u.nome; a.ciente_em = new Date(); }
  T.update(a);
  return { msg: q.encerrar ? 'Aviso encerrado.' : 'Ciente registrado.' };
}

/* ---------- detalhe da etapa: lançamentos por dia e alterações ---------- */
function execEtapa_(q, ctx) {
  const c = calcExec_(ctx), e = c.etapas.find(x => String(x.codigo) === String(q.codigo));
  if (!e) throw new Error('Etapa não encontrada.');
  const ids = e.itens.map(i => String(i.id));
  return {
    etapa: e,
    lancamentos: obraTab_(ctx, 'Producao').all().filter(p => String(p.etapa) === String(e.codigo)).map(pub_).sort((a, b) => String(b.data).localeCompare(String(a.data))),
    equipes: obraTab_(ctx, 'EquipesDia').all().filter(x => String(x.etapa) === String(e.codigo)).map(pub_),
    alteracoes: obraTab_(ctx, 'AlteracoesExec').all().filter(a => String(a.etapa) === String(e.codigo) || ids.indexOf(String(a.ref)) >= 0).map(pub_).reverse(),
    avisos: obraTab_(ctx, 'AvisosExec').all().filter(a => String(a.etapa) === String(e.codigo)).map(pub_).reverse()
  };
}

/* ---------- RDO: tudo o que vai no relatório do dia (o app monta a página para imprimir / salvar em PDF) ---------- */
function execRdo_(q, ctx) {
  const dia = ymd_(q.data), d = diarioDo_(ctx, dia, false);
  if (!d) throw new Error('Não há diário nesse dia.');
  const c = calcExec_(ctx, dia);
  const prod = obraTab_(ctx, 'Producao').all().filter(p => ymd_(p.data) === dia);
  const linhas = prod.map(p => {
    const e = c.etapas.find(x => String(x.codigo) === String(p.etapa)), i = e && e.itens.find(x => String(x.id) === String(p.item_id));
    return { etapa: e ? e.nome : p.etapa, servico: p.servico, unidade: p.unidade, dia: num_(p.qtd), acumulado: i ? i.executado : '', previsto: i ? i.prevista : '', pct: i ? i.pct : '', obs: p.obs };
  });
  const fotos = obraTab_(ctx, 'FotosExec').all().filter(f => ymd_(f.data) === dia).slice(0, 12).map(f => {
    let b64 = '';
    try { b64 = Utilities.base64Encode(DriveApp.getFileById(f.mini_id || f.file_id).getBlob().getBytes()); } catch (e) { /* foto apagada */ }
    return { b64: b64, legenda: f.legenda, tirada_em: f.tirada_em, lat: f.lat, lng: f.lng, etapa: f.etapa };
  });
  const etapasDia = {};
  prod.forEach(p => { etapasDia[p.etapa] = 1; });
  return {
    empresa: config_().EMPRESA || 'Size Engenharia',
    obra: { nome: ctx.obra.nome, sigla: ctx.obra.sigla, endereco: ctx.obra.endereco },
    diario: Object.assign(pub_(d), { clima: d.clima_json ? JSON.parse(d.clima_json) : null }),
    data: dia, dia_semana: dow_(dia), util: c.util(dia),
    equipes: obraTab_(ctx, 'EquipesDia').all().filter(e => ymd_(e.data) === dia).map(e => {
      const et = c.etapas.find(x => String(x.codigo) === String(e.etapa));
      return { etapa: et ? et.nome : e.etapa, equipe: e.equipe, pessoas: num_(e.pessoas) };
    }),
    servicos: linhas,
    avisos: obraTab_(ctx, 'AvisosExec').all().filter(a => ymd_(a.data) <= dia && (a.status !== 'Encerrado') && (!a.etapa || etapasDia[a.etapa])).map(pub_),
    fotos: fotos
  };
}

/* ---------- avisos na tela (sino) para o módulo Execução ---------- */
function notifExec_(c, add) {
  const pode = p => pode_(c, p);
  if (!pode(['exec_ver', 'exec_lancar', 'exec_planejar'])) return;
  if (!obraTab_(c, 'Etapas').all().length) return;
  const hoje = hojeYmd_(), calc = calcExec_(c);
  const ativa = {};
  calc.etapas.forEach(e => { ativa[e.codigo] = e; });
  if (pode('exec_lancar')) {
    obraTab_(c, 'AvisosExec').all().filter(a => a.status === 'Aberto').forEach(a =>
      add({ id: 'av|' + a.id, etapa: 'exec_aviso', numero: a.etapa_nome || 'Obra', texto: a.tipo + (a.texto ? ': ' + a.texto : '') + ' — ' + a.autor, quando: fmtVal_(a.data), rota: '#/diario' }));
    const emAndamento = calc.etapas.some(e => e.itens.some(i => i.situacao !== 'concluido' && i.inicio && i.inicio <= hoje));
    const d = obraTab_(c, 'Diarios').all().find(x => ymd_(x.data) === hoje);
    if (emAndamento && calc.util(hoje) && +Utilities.formatDate(new Date(), tz_(), 'HH') >= 16 && (!d || d.status === 'Rascunho'))
      add({ id: 'dia|' + hoje, etapa: 'exec_diario', numero: 'Diário de hoje', texto: d ? 'Diário em rascunho — envie antes de sair da obra' : 'Ainda não há diário lançado hoje', quando: fmtVal_(new Date()), rota: '#/diario' });
  }
  if (pode('exec_planejar')) {
    calc.alertas.forEach(a => add({
      id: 'al|' + a.tipo + '|' + a.item + (a.tipo === 'sem_lancamento' ? '|' + hoje : ''), etapa: 'exec_alerta',
      numero: (ativa[a.etapa] || {}).nome || a.etapa, texto: a.texto, quando: fmtVal_(new Date()), rota: '#/exec/etapa/' + encodeURIComponent(a.etapa)
    }));
    obraTab_(c, 'Diarios').all().filter(d => d.status === 'Enviado').forEach(d =>
      add({ id: 'rev|' + d.numero + '|' + fmtVal_(d.atualizado_em), etapa: 'exec_revisar', numero: 'RDO ' + ('00' + d.numero).slice(-3), texto: 'Diário de ' + dataTxt_(ymd_(d.data)) + ' enviado por ' + (d.enviado_por || d.responsavel) + ' — revisar', quando: fmtVal_(d.atualizado_em), rota: '#/diario/' + ymd_(d.data) }));
  }
}
