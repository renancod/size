/**
 * CRONOGRAMA FÍSICO-FINANCEIRO
 *  - No orçamento de cliente: cada etapa tem data de início e data de fim; o valor da etapa (preço de venda) é distribuído
 *    por igual nos dias corridos entre as duas datas → quanto cai em cada mês, acumulado e curva S.
 *    Guardado em Propostas.cronograma_json ({ etapas: [{ codigo, nome, ini, fim }] }) e levado para a obra no "Gerar obra".
 *  - Na obra: cada frente geral (aba Frentes, colunas inicio e fim) com
 *      previsto  = mesma distribuição do valor da frente entre as datas;
 *      executado = avanço físico pelos registros do RDO (produção dos serviços ligados ao orçamento), valorizado pelo preço de venda;
 *      medido    = serviços das medições aprovadas ou pagas (só entra serviço concluído e com FVS aprovada), na data da aprovação.
 *    executado − medido = o que já foi feito e ainda espera FVS / medição.
 */
const CRONO_RE_ = /^\d{4}-\d{2}-\d{2}$/;
/* data em aaaa-mm-dd a partir de Date, "aaaa-mm-dd…" ou "dd/mm/aaaa…" */
function cronoData_(v) {
  if (!v) return '';
  if (v instanceof Date) return ymd_(v);
  const s = String(v).trim(), m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  return CRONO_RE_.test(s.slice(0, 10)) ? s.slice(0, 10) : '';
}
/* meses aaaa-mm de a até b */
function cronoMeses_(a, b) {
  const out = [];
  let y = +a.slice(0, 4), m = +a.slice(5, 7);
  const yb = +b.slice(0, 4), mb = +b.slice(5, 7);
  while (y < yb || (y === yb && m <= mb)) { out.push(y + '-' + ('0' + m).slice(-2)); if (++m > 12) { m = 1; y++; } }
  return out;
}
const cronoBr_ = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
const cronoDias_ = (a, b) => Math.round((utc_(b) - utc_(a)) / 864e5) + 1;
const cronoFimMes_ = mes => new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).toISOString().slice(0, 10);
/* parte do valor em cada mês (dias corridos, início e fim inclusive); o arredondamento vai para o último mês */
function cronoDistribuir_(valor, ini, fim) {
  const r = {}, tot = cronoDias_(ini, fim), ms = cronoMeses_(ini, fim);
  let soma = 0;
  ms.forEach(mes => {
    const a = [ini, mes + '-01'].sort().pop(), b = [fim, cronoFimMes_(mes)].sort()[0];
    soma += (r[mes] = r2_(valor * cronoDias_(a, b) / tot));
  });
  r[ms[ms.length - 1]] = r2_(r[ms[ms.length - 1]] + valor - soma);
  return r;
}
/* fração prevista até o fim do dia s */
function cronoFracao_(ini, fim, s) { return s < ini ? 0 : s >= fim ? 1 : cronoDias_(ini, s) / cronoDias_(ini, fim); }
function cronoValida_(ini, fim, nome) {
  ini = cronoData_(ini); fim = cronoData_(fim);
  if (!ini && !fim) return { ini: '', fim: '' };
  if (!ini || !fim) throw new Error(nome + ': informe a data de início e a de fim (ou deixe as duas em branco).');
  if (fim < ini) throw new Error(nome + ': a data de fim está antes da de início.');
  if (cronoDias_(ini, fim) > 3660) throw new Error(nome + ': prazo acima de 10 anos, confira as datas.');
  return { ini: ini, fim: fim };
}
/* linhas [{ valor, ini, fim }] → valor de cada linha por mês, total do mês, acumulado e % sobre o valor total */
function cronoMontar_(linhas) {
  const total = r2_(linhas.reduce((t, l) => t + num_(l.valor), 0)), com = linhas.filter(l => l.ini && l.fim);
  linhas.forEach(l => { l.meses = l.ini && l.fim ? cronoDistribuir_(num_(l.valor), l.ini, l.fim) : {}; l.dias = l.ini && l.fim ? cronoDias_(l.ini, l.fim) : 0; });
  const sem = r2_(linhas.filter(l => !(l.ini && l.fim)).reduce((t, l) => t + num_(l.valor), 0));
  if (!com.length) return { linhas: linhas, meses: [], total: total, sem_datas: sem, inicio: '', fim: '', dias: 0 };
  const ini = com.map(l => l.ini).sort()[0], fim = com.map(l => l.fim).sort().pop();
  let acc = 0;
  const meses = cronoMeses_(ini, fim).map(mes => {
    const v = r2_(linhas.reduce((t, l) => t + (l.meses[mes] || 0), 0));
    acc = r2_(acc + v);
    return { mes: mes, valor: v, acum: acc, pct: total ? r2_(v / total * 100) : 0, pct_acum: total ? r2_(acc / total * 100) : 0 };
  });
  return { linhas: linhas, meses: meses, total: total, sem_datas: sem, inicio: ini, fim: fim, dias: cronoDias_(ini, fim) };
}

/* ---------- orçamento de cliente ---------- */
function propCronoLer_(p) {
  try { const c = JSON.parse(p.cronograma_json || '{}'); return c && Array.isArray(c.etapas) ? c : { etapas: [] }; } catch (e) { return { etapas: [] }; }
}
/* datas de cada etapa do orçamento: pelo nome (as etapas podem mudar de ordem); se o nome mudou, pelo número.
 * Valores: preço de venda, com ou sem o BDI e a gestão (escolha só do cronograma; o orçamento não muda) */
function propCrono_(p, calc) {
  const C = propCronoLer_(p), usado = {}, nomes = calc.etapas.map(e => norm_(e.descricao));
  const bdi = C.bdi !== false, ges = C.gestao !== false;
  const acha = fn => { const n = C.etapas.findIndex((c, k) => !usado[k] && fn(c)); if (n >= 0) usado[n] = 1; return n >= 0 ? C.etapas[n] : null; };
  const pares = calc.etapas.map(e => acha(c => norm_(c.nome) === norm_(e.descricao)));
  const linhas = calc.etapas.map((e, k) => {
    const x = pares[k] || acha(c => String(c.codigo) === String(e.codigo) && nomes.indexOf(norm_(c.nome)) < 0);
    return { codigo: e.codigo, descricao: e.descricao, itens: e.itens, preco: e.preco, bdi: e.bdi, gestao: e.gestao,
      valor: r2_(e.preco - (bdi ? 0 : e.bdi) - (ges ? 0 : e.gestao)), ini: x ? cronoData_(x.ini) : '', fim: x ? cronoData_(x.fim) : '' };
  });
  return Object.assign(cronoMontar_(linhas), { com_bdi: bdi, com_gestao: ges });
}
function propCronoSalvar_(q, ctx) {
  const T = central_('Propostas'), p = propAchar_(q.id);
  if (p.obra_id) throw new Error('Este orçamento já virou obra: o cronograma agora é ajustado dentro da obra (Orçamento da obra → Cronograma).');
  if (['Revisado', 'Cancelado'].indexOf(p.status) >= 0) throw new Error('Orçamento ' + p.status.toLowerCase() + ': o cronograma não muda mais.');
  const calc = propCalc_(p, propItens_(p.id)), ets = [];
  [].concat(q.etapas || []).forEach(x => {
    const e = calc.etapas.find(y => String(y.codigo) === String(x.codigo));
    if (!e) return;
    const d = cronoValida_(x.ini, x.fim, 'Etapa ' + e.codigo + ' ' + e.descricao);
    if (d.ini) ets.push({ codigo: e.codigo, nome: e.descricao, ini: d.ini, fim: d.fim });
  });
  const ant = propCronoLer_(p), bdi = q.bdi === undefined ? ant.bdi !== false : sim_(q.bdi), ges = q.gestao === undefined ? ant.gestao !== false : sim_(q.gestao);
  p.cronograma_json = ets.length || !bdi || !ges ? JSON.stringify(Object.assign({ etapas: ets }, bdi ? {} : { bdi: false }, ges ? {} : { gestao: false })) : '';
  p.atualizado_em = new Date(); p.atualizado_por = ctx.u.nome;
  const C = propCrono_(p, calc);
  propHist_(p, ctx, 'Cronograma', (ets.length ? cronoBr_(C.inicio) + ' a ' + cronoBr_(C.fim) + ' · ' + plural_(ets.length, 'etapa', 'etapas') : 'sem datas') + ' · ' + cronoBase_(C));
  T.update(p);
  log_(ctx, 'proposta_cronograma', propRotulo_(p) + ' · ' + ets.length + ' etapas');
  return { msg: ets.length ? 'Cronograma salvo: ' + cronoBr_(C.inicio) + ' a ' + cronoBr_(C.fim) + ' (' + plural_(C.meses.length, 'mês', 'meses') + ').' : 'Cronograma sem datas.', cronograma: C };
}

const cronoBase_ = C => C.com_bdi && C.com_gestao ? 'valores com BDI e gestão' : C.com_bdi ? 'valores sem gestão' : C.com_gestao ? 'valores sem BDI' : 'valores sem BDI e gestão (custo direto)';

/* ---------- lançamentos únicos na planilha (rodam uma vez, no primeiro acesso depois da publicação) ---------- */
/* cronograma geral do AVA (planilha 2026_CRONOGRAMA-FISICO-FINANCEIRO-24M_AVA-RESIDENCES_SIZE_PROPOSTA14): primeiro início e último fim
 * de cada etapa entre os setores; mobilização e canteiro no 1º mês. Só grava se o orçamento ainda não tem cronograma. */
const CRONO_AVA_ = [['1', 'terraplen', '2026-12-07', '2028-04-04'], ['2', 'paviment', '2027-10-05', '2028-12-15'], ['3', 'pluvial', '2027-08-05', '2028-07-04'],
  ['4', 'coletora', '2027-07-05', '2028-06-02'], ['5', 'bombeamento', '2027-09-06', '2028-07-04'], ['6', 'recalque', '2027-09-06', '2028-08-04'],
  ['7', 'agua', '2027-09-06', '2028-08-04'], ['8', 'muro', '2027-06-07', '2028-12-15'], ['9', 'gabiao', '2027-01-05', '2028-04-04'], ['10', 'mobiliza', '2026-12-07', '2027-01-04']];
function migCronoAva_() {
  const T = central_('Propostas'), p = T.all().find(x => String(x.id) === 'PR-17ff9676' && /AVA/i.test(String(x.empreendimento)));
  if (!p || String(p.cronograma_json || '').trim()) return 'sem alteração';
  const calc = propCalc_(p, propItens_(p.id)), ets = [];
  CRONO_AVA_.forEach(([cod, chave, ini, fim]) => {
    const e = calc.etapas.find(y => String(y.codigo) === cod);
    if (e && norm_(e.descricao).indexOf(chave) >= 0) ets.push({ codigo: e.codigo, nome: e.descricao, ini: ini, fim: fim });
  });
  if (!ets.length) return 'etapas não conferem';
  p.cronograma_json = JSON.stringify({ etapas: ets });
  propHist_(p, { u: { nome: 'Sistema' } }, 'Cronograma', 'datas da planilha do cronograma (proposta 14) · ' + plural_(ets.length, 'etapa', 'etapas'));
  T.update(p);
  return plural_(ets.length, 'etapa', 'etapas');
}
const MIGRACOES_ = [['crono_ava_2026_10', migCronoAva_]];
function migrar_() {
  const P = PropertiesService.getScriptProperties();
  MIGRACOES_.forEach(([k, fn]) => {
    if (P.getProperty('MIG_' + k)) return;
    const L = LockService.getScriptLock();
    if (!L.tryLock(10000)) return;
    try { if (!P.getProperty('MIG_' + k)) P.setProperty('MIG_' + k, agora_() + ' · ' + fn()); }
    catch (e) { P.setProperty('MIG_' + k, 'erro: ' + e.message); }
    finally { L.releaseLock(); }
  });
}

/* ---------- prazo da obra em DIAS ÚTEIS (seg a sex, sem feriados nacionais e municipais da obra) ----------
 * Contrato: do início mais cedo ao fim mais tarde das frentes gerais (sem datas nelas, as frentes de execução),
 * mais os dias úteis dos aditivos de prazo (contratos do cliente). Projeção pelo ritmo: % executado ÷ dias úteis passados. */
function prazoObra_(ctx, A) {
  const fer = feriadosObra_(ctx.obra), util = s => { const w = dow_(s); return w >= 1 && w <= 5 && !fer(s); };
  const uteis = (a, b) => { let n = 0; for (let s = a; s <= b; s = addDias_(s, 1)) if (util(s)) n++; return n; };
  const somar = (a, n) => { let s = a; while (n > 0) { s = addDias_(s, 1); if (util(s)) n--; } return s; };
  const fr = orcFrentes_(ctx).map(f => ({ ini: cronoData_(f.inicio), fim: cronoData_(f.fim) })).filter(f => f.ini && f.fim);
  A = A || cliAndamento_(ctx);
  const ini = fr.length ? fr.map(f => f.ini).sort()[0] : A.inicio, fimOrig = fr.length ? fr.map(f => f.fim).sort().pop() : A.fim;
  if (!ini || !fimOrig) return null;
  let extra = 0;
  try { extra = ccAditivoDias_(ctx); } catch (e) { extra = 0; }
  const fim = extra > 0 ? somar(fimOrig, extra) : fimOrig, hoje = hojeYmd_(), pct = num_(A.pct_exec);
  const total = uteis(ini, fim), passados = hoje < ini ? 0 : uteis(ini, hoje < fim ? hoje : fim);
  const r = { inicio: ini, fim: fim, fim_original: fimOrig, aditivo_dias: extra, total: total, passados: passados,
    restantes: hoje < fim ? uteis(addDias_(hoje, 1), fim) : 0, vencidos: hoje > fim ? uteis(addDias_(fim, 1), hoje) : 0,
    pct_exec: pct, pct_prev: num_(A.pct_prev), projecao: '', atraso: 0,
    situacao: pct >= 99.95 ? 'concluida' : hoje < ini ? 'a_iniciar' : hoje > fim ? 'vencido' : 'andamento' };
  // ritmo atual (com pelo menos 10 dias úteis de obra e algum avanço)
  if (pct > 0 && pct < 99.95 && passados >= 10) {
    r.projecao = somar(hoje, Math.ceil((100 - pct) / (pct / passados)));
    if (r.projecao > fim) r.atraso = uteis(addDias_(fim, 1), r.projecao);
  }
  return r;
}

/* ---------- obra: previsto × executado (RDO) × medido ---------- */
function cronoObra_(q, ctx) {
  const calc = calcExec_(ctx), orc = orcCalc_(ctx, calc), hoje = calc.hoje, cad = {};
  orcFrentes_(ctx).forEach(f => { cad[String(f.codigo)] = f; });
  const frDoOrc = {};
  orc.frentes.forEach(f => f.itens.forEach(i => { frDoOrc[i.id] = f.codigo; }));
  // item da frente de execução → serviço do orçamento (inclusive itens já desativados, que têm produção registrada)
  const orcDe = {};
  let semVinculo = 0;
  obraTab_(ctx, 'EtapaItens').all().forEach(i => { if (i.orc_item && frDoOrc[i.orc_item]) orcDe[i.id] = String(i.orc_item); else if (orcAtivo_(i)) semVinculo++; });
  // sugestão de datas: o período das frentes de execução que usam os serviços de cada frente geral
  const sug = {};
  calc.etapas.forEach(e => e.itens.forEach(i => {
    const fr = frDoOrc[i.orc_item];
    if (!fr) return;
    const a = i.inicio_original || i.inicio, b = i.termino_original || i.termino, s = sug[fr] = sug[fr] || { ini: '', fim: '' };
    if (a && (!s.ini || a < s.ini)) s.ini = a;
    if (b && b > s.fim) s.fim = b;
  }));
  // peso de cada serviço no valor da frente: preço de venda; sem ele, material + MO; sem valores, partes iguais
  const peso = {};
  const frentes = orc.frentes.filter(f => f.itens.length).map(f => {
    const R = f.resumo, n = f.itens.length, valor = R.emp.receita || R.v_venda || 0;
    f.itens.forEach(i => { peso[i.id] = { q: num_(i.qtd), w: valor * (R.v_venda > 0 ? i.v_venda / R.v_venda : R.v_total > 0 ? i.v_total / R.v_total : 1 / n), fr: f.codigo }; });
    const c = cad[f.codigo] || {}, s = sug[f.codigo];
    return { codigo: f.codigo, nome: f.nome, valor: r2_(valor), ini: cronoData_(c.inicio), fim: cronoData_(c.fim), sugestao: s && s.ini && s.fim ? s : null, servicos: n };
  });
  const prod = obraTab_(ctx, 'Producao').all().map(p => ({ k: orcDe[p.item_id], d: ymd_(p.data), q: num_(p.qtd) })).filter(p => p.k && p.q && CRONO_RE_.test(p.d) && p.d <= hoje);
  const stMed = {};
  obraTab_(ctx, 'Medicoes').all().forEach(m => { if ([MED_ST_.ok, MED_ST_.paga].indexOf(m.status) >= 0) stMed[m.id] = cronoData_(m.aprovado_em) || ymd_(m.ate); });
  const med = obraTab_(ctx, 'MedicaoItens').all().map(mi => ({ k: orcDe[mi.item_id], d: stMed[mi.medicao], q: num_(mi.qtd) })).filter(m => m.k && m.d && m.q);
  // valor acumulado por frente até a data s (cada serviço vale no máximo o seu peso)
  const valorAte = (lista, s) => {
    const cum = {}, out = {};
    lista.forEach(x => { if (x.d <= s) cum[x.k] = (cum[x.k] || 0) + x.q; });
    Object.keys(cum).forEach(k => { const p = peso[k]; if (p && p.q > 0) out[p.fr] = (out[p.fr] || 0) + p.w * Math.min(1, cum[k] / p.q); });
    return out;
  };
  const C = cronoMontar_(frentes);
  const datas = [C.inicio].concat(prod.map(p => p.d), med.map(m => m.d)).filter(Boolean).sort();
  const ini = datas[0] || '', fimReal = prod.length || med.length ? [hoje].concat(med.map(m => m.d)).sort().pop() : '';
  const fim = [C.fim, fimReal].filter(Boolean).sort().pop() || '';
  const meses = ini ? cronoMeses_(ini, fim) : [], total = C.total;
  const exHoje = valorAte(prod, hoje), mdHoje = valorAte(med, '9999-12-31');
  let eAnt = {}, mAnt = {};
  const porMes = meses.map(mes => {
    const fm = cronoFimMes_(mes), passado = mes <= hoje.slice(0, 7), corte = fm < hoje ? fm : hoje;
    const e = passado ? valorAte(prod, corte) : null, m = passado ? valorAte(med, corte) : null;
    const prev = r2_(frentes.reduce((t, f) => t + (f.meses[mes] || 0), 0));
    const linha = { mes: mes, prev: prev, exec: null, med: null, futuro: !passado };
    if (passado) {
      linha.exec = r2_(Object.keys(e).reduce((t, k) => t + e[k] - (eAnt[k] || 0), 0));
      linha.med = r2_(Object.keys(m).reduce((t, k) => t + m[k] - (mAnt[k] || 0), 0));
      frentes.forEach(f => { f.real = f.real || {}; f.real[mes] = { exec: r2_((e[f.codigo] || 0) - (eAnt[f.codigo] || 0)), med: r2_((m[f.codigo] || 0) - (mAnt[f.codigo] || 0)) }; });
      eAnt = e; mAnt = m;
    }
    return linha;
  });
  let ap = 0, ae = 0, am = 0;
  porMes.forEach(l => {
    ap = r2_(ap + l.prev); l.prev_acum = ap; l.pct_prev = total ? r2_(ap / total * 100) : 0;
    if (!l.futuro) { ae = r2_(ae + l.exec); am = r2_(am + l.med); l.exec_acum = ae; l.med_acum = am; l.pct_exec = total ? r2_(ae / total * 100) : 0; l.pct_med = total ? r2_(am / total * 100) : 0; }
  });
  const pct = (v, t) => t ? r2_(v / t * 100) : 0;
  frentes.forEach(f => {
    const prevHoje = f.ini && f.fim ? f.valor * cronoFracao_(f.ini, f.fim, hoje) : 0;
    f.v_prev = r2_(prevHoje); f.v_exec = r2_(exHoje[f.codigo] || 0); f.v_med = r2_(mdHoje[f.codigo] || 0);
    f.pct_prev = pct(prevHoje, f.valor); f.pct_exec = pct(f.v_exec, f.valor); f.pct_med = pct(f.v_med, f.valor);
    f.aguardando = r2_(Math.max(0, f.v_exec - f.v_med));
    const dif = f.pct_exec - f.pct_prev;
    f.situacao = !f.ini ? 'sem_datas' : f.pct_exec >= 99.9 ? 'concluida' : hoje < f.ini && !f.v_exec ? 'a_iniciar' : dif < -10 ? 'atrasada' : dif < -3 ? 'atencao' : dif > 3 ? 'adiantada' : 'em_dia';
    f.real = f.real || {};
  });
  const soma = k => r2_(frentes.reduce((t, f) => t + f[k], 0));
  const G = { valor: total, v_prev: soma('v_prev'), v_exec: soma('v_exec'), v_med: soma('v_med'), aguardando: soma('aguardando'), sem_datas: C.sem_datas, inicio: C.inicio, fim: C.fim };
  G.pct_prev = pct(G.v_prev, total); G.pct_exec = pct(G.v_exec, total); G.pct_med = pct(G.v_med, total);
  return { hoje: hoje, geral: G, frentes: frentes, meses: porMes, sem_vinculo: semVinculo, pode_editar: pode_(ctx, 'orc_gerir') };
}
function cronoObraSalvar_(q, ctx) {
  const Fr = obraTab_(ctx, 'Frentes');
  let n = 0;
  [].concat(q.frentes || []).forEach(x => {
    const f = Fr.all().find(y => String(y.codigo) === String(x.codigo));
    if (!f) return;
    const d = cronoValida_(x.ini, x.fim, f.nome);
    if (cronoData_(f.inicio) === d.ini && cronoData_(f.fim) === d.fim) return;
    f.inicio = d.ini; f.fim = d.fim;
    Fr.update(f);
    n++;
  });
  log_(ctx, 'cronograma_obra', plural_(n, 'frente alterada', 'frentes alteradas'));
  return { msg: n ? 'Cronograma salvo (' + plural_(n, 'frente alterada', 'frentes alteradas') + ').' : 'Nada mudou no cronograma.' };
}
