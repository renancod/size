'use strict';
/* =====================================================================
 * CRONOGRAMA FÍSICO-FINANCEIRO (servidor: Cronograma.gs)
 *  - orçamento de cliente (#/orc/orcamento/<id>/cronograma): cada etapa com data de início e de fim — pelas datas, pela duração
 *    ou arrastando a barra —, "encadear" (a etapa começa no dia seguinte ao fim da anterior), desembolso por mês e curva S;
 *  - obra (#/obra/cronograma): frentes gerais com previsto × executado (registros do RDO) × medido (FVS aprovada).
 * O valor de cada etapa é distribuído por igual nos dias corridos entre as datas (mesma conta do servidor).
 * Usa app.js (api, view, modal…), base.js (bpTela, bpCarregar…) e orc.js (orGrupos, orPode…).
 * ===================================================================== */
const CR = { ed: null };
const CR_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const crMes = m => CR_MES[+m.slice(5, 7) - 1] + '/' + m.slice(2, 4);
const crUtc = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const crDias = (a, b) => Math.round((crUtc(b) - crUtc(a)) / 864e5) + 1;
const crSoma = (s, n) => new Date(crUtc(s) + n * 864e5).toISOString().slice(0, 10);
const crFimMes = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);
const crR2 = n => Math.round((Number(n) || 0) * 100) / 100;
const crK = v => { v = Number(v) || 0; const a = Math.abs(v); return a >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi' : a >= 1e3 ? 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : brl(v); };
const crPct = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const crData = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : '';
function crMeses(a, b) {
  const out = [];
  let y = +a.slice(0, 4), m = +a.slice(5, 7);
  const yb = +b.slice(0, 4), mb = +b.slice(5, 7);
  while (y < yb || (y === yb && m <= mb)) { out.push(y + '-' + ('0' + m).slice(-2)); if (++m > 12) { m = 1; y++; } }
  return out;
}
/* parte do valor em cada mês (igual a cronoDistribuir_ do servidor) */
function crDistribuir(valor, ini, fim) {
  const r = {}, tot = crDias(ini, fim), ms = crMeses(ini, fim);
  let soma = 0;
  ms.forEach(m => { const a = [ini, m + '-01'].sort().pop(), b = [fim, crFimMes(m)].sort()[0]; soma += (r[m] = crR2(valor * crDias(a, b) / tot)); });
  r[ms[ms.length - 1]] = crR2(r[ms[ms.length - 1]] + valor - soma);
  return r;
}
/* igual a cronoMontar_: valor de cada linha por mês, total do mês, acumulado e % */
function crMontar(linhas) {
  const total = crR2(linhas.reduce((t, l) => t + (Number(l.valor) || 0), 0)), com = linhas.filter(l => l.ini && l.fim);
  linhas.forEach(l => { l.meses = l.ini && l.fim ? crDistribuir(Number(l.valor) || 0, l.ini, l.fim) : {}; l.dias = l.ini && l.fim ? crDias(l.ini, l.fim) : 0; });
  const sem = crR2(linhas.filter(l => !(l.ini && l.fim)).reduce((t, l) => t + (Number(l.valor) || 0), 0));
  if (!com.length) return { meses: [], total, sem_datas: sem, inicio: '', fim: '', dias: 0 };
  const ini = com.map(l => l.ini).sort()[0], fim = com.map(l => l.fim).sort().pop();
  let acc = 0;
  const meses = crMeses(ini, fim).map(m => {
    const v = crR2(linhas.reduce((t, l) => t + (l.meses[m] || 0), 0));
    acc = crR2(acc + v);
    return { mes: m, valor: v, acum: acc, pct: total ? crR2(v / total * 100) : 0, pct_acum: total ? crR2(acc / total * 100) : 0 };
  });
  return { meses, total, sem_datas: sem, inicio: ini, fim, dias: crDias(ini, fim) };
}
const crPrazo = d => d ? (d >= 60 ? (d / 30.4).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' meses' : plural(d, 'dia', 'dias')) : '—';

/* ---------- desenho (comum ao orçamento e à obra) ---------- */
const CR_SIT = { sem_datas: ['Sem datas', 'fvb-exec'], a_iniciar: ['A iniciar', 'fvb-prep'], em_dia: ['Em dia', 'fvb-ok'], adiantada: ['Adiantada', 'fvb-ok'], atencao: ['Atenção', 'fvb-aprov'], atrasada: ['Atrasada', 'fvb-dev'], concluida: ['Concluída', 'fvb-ok'] };
const crSit = s => `<span class="badge fvb ${(CR_SIT[s] || ['', ''])[1]}">${(CR_SIT[s] || [s])[0]}</span>`;

/* escala da linha do tempo: do 1º dia do primeiro mês ao último dia do último mês */
function crEscala(E) {
  const ds = [];
  E.linhas.forEach(l => { if (l.ini && l.fim) ds.push(l.ini, l.fim); });
  if (E.tipo === 'obra') { ds.push(E.C.hoje); E.C.meses.forEach(m => { if (!m.futuro && (m.exec || m.med)) ds.push(m.mes + '-01'); }); }
  ds.sort();
  const a0 = ds[0] || hoje(), b0 = ds.length ? ds[ds.length - 1] : crSoma(hoje(), 150);
  const meses = crMeses(a0, b0 < crSoma(a0, 59) ? crSoma(a0, 59) : b0);
  E.a = meses[0] + '-01'; E.b = crFimMes(meses[meses.length - 1]); E.span = crDias(E.a, E.b); E.colMeses = meses;
}
const crX = (E, s) => (crDias(E.a, s) - 1) / E.span * 100;
const crW = (E, a, b) => crDias(a, b) / E.span * 100;

function crGradeMeses(E, rotulos) {
  const n = E.colMeses.length, k = n > 36 ? 6 : n > 24 ? 3 : n > 14 ? 2 : 1;
  return E.colMeses.map((m, i) => {
    const x = crX(E, m + '-01'), w = crW(E, m + '-01', crFimMes(m));
    return `<span class="cr-gm ${+m.slice(5, 7) === 1 ? 'ano' : ''}" style="left:${x}%;width:${w}%">${rotulos && i % k === 0 ? `<em>${+m.slice(5, 7) === 1 || i === 0 ? crMes(m) : CR_MES[+m.slice(5, 7) - 1]}</em>` : ''}</span>`;
  }).join('');
}
function crBarra(E, l, i) {
  if (!(l.ini && l.fim)) return E.edita ? `<span class="cr-vazio">${ic('plus')} toque na linha do tempo para marcar</span>` : '<span class="cr-vazio">sem datas</span>';
  const R = l.real, x = crX(E, l.ini), w = crW(E, l.ini, l.fim);
  return `<div class="cr-bar ${R ? 'sit-' + R.situacao : ''} ${E.edita ? 'mexe' : ''}" data-i="${i}" style="left:${x}%;width:${w}%" title="${fd(l.ini)} a ${fd(l.fim)} · ${plural(l.dias, 'dia', 'dias')}">
    ${R ? `<i class="cr-fx" style="width:${Math.min(100, R.pct_exec)}%"></i><i class="cr-fm" style="width:${Math.min(100, R.pct_med)}%"></i>` : ''}
    ${E.edita ? '<b class="cr-h" data-h="a"></b><b class="cr-h" data-h="b"></b>' : ''}<span>${R ? crPct(R.pct_exec) : plural(l.dias, 'dia', 'dias')}</span></div>`;
}
function crLinha(E, l, i) {
  const R = l.real, ed = E.edita;
  const datas = ed ? `<div class="cr-datas"><input type="date" data-k="ini" data-i="${i}" value="${l.ini || ''}" aria-label="Início"><span>a</span><input type="date" data-k="fim" data-i="${i}" value="${l.fim || ''}" aria-label="Fim">
      <label class="cr-dur"><input inputmode="numeric" data-k="dur" data-i="${i}" value="${l.dias || ''}" placeholder="—" aria-label="Duração em dias">dias</label>
      ${i ? `<button type="button" class="cr-mini" data-seq="${i}" title="Começar no dia seguinte ao fim da etapa de cima">${ic('chevron')} depois da anterior</button>` : ''}
      ${l.sug && !(l.ini === l.sug.ini && l.fim === l.sug.fim) ? `<button type="button" class="cr-mini" data-sug="${i}" title="Período das frentes de execução desta frente geral">${ic('clock')} ${fd(l.sug.ini)} a ${fd(l.sug.fim)}</button>` : ''}
      ${l.ini ? `<button type="button" class="cr-mini cr-limpa" data-limpa="${i}" title="Tirar as datas">${ic('x')}</button>` : ''}</div>`
    : `<div class="cr-datas ro">${l.ini ? `${fd(l.ini)} a ${fd(l.fim)} · ${crPrazo(l.dias)}` : '<i>sem datas</i>'}</div>`;
  return `<div class="cr-l ${l.ini ? '' : 'sem'}">
    <div class="cr-n"><div class="cr-nome"><code>${esc(l.codigo)}</code><b>${esc(l.nome)}</b><span class="bp-mono">${crK(l.valor)}</span></div>
      ${R ? `<div class="cr-real">${crSit(R.situacao)}<span>previsto hoje <b>${crPct(R.pct_prev)}</b></span><span class="x">executado <b>${crPct(R.pct_exec)}</b></span><span class="m">medido <b>${crPct(R.pct_med)}</b></span></div>` : l.info ? `<small class="cr-info">${esc(l.info)}</small>` : ''}
      ${datas}</div>
    <div class="cr-t" data-i="${i}">${crGradeMeses(E)}${E.tipo === 'obra' && E.C.hoje >= E.a && E.C.hoje <= E.b ? `<i class="cr-hoje" style="left:${crX(E, E.C.hoje)}%"></i>` : ''}${crBarra(E, l, i)}</div></div>`;
}
/* curva S: linhas de % acumulado no fim de cada mês */
function crCurva(meses, series) {
  if (!meses.length) return '';
  const W = 800, H = 240, L = 40, Rm = 26, T = 12, B = 28, n = meses.length;
  const X = i => L + (W - L - Rm) * i / n, Y = p => T + (H - T - B) * (1 - Math.min(100, Math.max(0, p)) / 100);
  const k = n > 24 ? Math.ceil(n / 12) : n > 12 ? 2 : 1;
  const grade = [0, 25, 50, 75, 100].map(p => `<line x1="${L}" x2="${W - Rm}" y1="${Y(p)}" y2="${Y(p)}" class="g"/><text x="${L - 6}" y="${Y(p) + 4}" text-anchor="end">${p}%</text>`).join('')
    + meses.map((m, i) => i % k === 0 ? `<text x="${X(i + 1)}" y="${H - 8}" text-anchor="middle">${crMes(m)}</text>` : '').join('');
  const linhas = series.map(s => {
    const pts = [[X(0), Y(0)]];
    s.v.forEach((p, i) => { if (p != null) pts.push([X(i + 1), Y(p)]); });
    return `<polyline class="${s.cl}" points="${pts.map(p => p.map(c => c.toFixed(1)).join(',')).join(' ')}"/>${pts.length > 1 ? `<circle class="${s.cl}" cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="4"/>` : ''}`;
  }).join('');
  return `<svg class="cr-curva" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva S">${grade}${linhas}</svg>
    <div class="cr-leg">${series.map(s => `<span class="${s.cl}"><i></i>${s.t}</span>`).join('')}</div>`;
}
/* colunas de desembolso por mês (orçamento) */
function crColunas(M) {
  const mx = Math.max(...M.meses.map(m => m.valor), 1);
  return `<div class="cr-cols">${M.meses.map(m => `<div class="cr-col"><div class="cr-colb"><i style="height:${Math.max(2, m.valor / mx * 100)}%"></i></div><b>${crMes(m.mes)}</b><span class="bp-mono">${crK(m.valor)}</span><small>${crPct(m.pct)} · acum. ${crPct(m.pct_acum)}</small></div>`).join('')}</div>`;
}

/* orçamento: valor da etapa com ou sem BDI e gestão (só no cronograma) */
const crBase = (bdi, ges) => bdi && ges ? 'com BDI e gestão' : bdi ? 'sem gestão' : ges ? 'sem BDI' : 'sem BDI e gestão (custo direto)';
function crValores(E) { E.linhas.forEach(l => { l.valor = crR2(l.preco - (E.bdi ? 0 : l.v_bdi) - (E.gestao ? 0 : l.v_ges)); }); }

function crDesenhar() {
  const E = CR.ed, obra = E.tipo === 'obra';
  if (!obra) crValores(E);
  const M = E.M = crMontar(E.linhas);
  crEscala(E);
  const tool = E.edita ? `<div class="cr-tool"><label>Início<input type="date" id="crIni" value="${M.inicio || E.inicioSug || hoje()}"></label>
      <button type="button" class="btn sec peq" id="crSeq" title="Uma etapa depois da outra, a partir da data de início (etapa sem datas fica com 30 dias)">${ic('chevron')} Encadear todas</button>
      ${obra && E.linhas.some(l => l.sug) ? `<button type="button" class="btn sec peq" id="crSug">${ic('clock')} Usar as datas das frentes de execução</button>` : ''}
      ${M.inicio ? `<button type="button" class="btn sec peq" id="crLimpa">${ic('x')} Limpar datas</button>` : ''}
      <small>Arraste a barra para mudar a data, ou as pontas para mudar o prazo.</small></div>` : '';
  const kpi = (t, v, s, cl) => `<div class="cr-kpi ${cl || ''}"><small>${t}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
  let topo;
  if (obra) {
    const G = E.C.geral, prevHoje = crR2(E.linhas.reduce((t, l) => t + (l.ini && l.fim ? l.valor * (E.C.hoje < l.ini ? 0 : E.C.hoje >= l.fim ? 1 : crDias(l.ini, E.C.hoje) / crDias(l.ini, l.fim)) : 0), 0));
    topo = `<div class="cr-kpis">${kpi('Valor da obra', crK(G.valor), M.inicio ? fd(M.inicio) + ' a ' + fd(M.fim) : 'sem datas')}
      ${kpi('Previsto até hoje', crPct(G.valor ? prevHoje / G.valor * 100 : 0), crK(prevHoje), 'p')}
      ${kpi('Executado (RDO)', crPct(G.pct_exec), crK(G.v_exec), 'x')}
      ${kpi('Medido (FVS aprovada)', crPct(G.pct_med), crK(G.v_med), 'm')}
      ${kpi('Feito, esperando FVS / medição', crK(G.aguardando), G.valor ? crPct(G.aguardando / G.valor * 100) + ' da obra' : '', 'a')}</div>`;
  } else {
    const preco = crR2(E.linhas.reduce((t, l) => t + l.preco, 0)), tg = (k, t) => `<button type="button" class="cr-tg ${E[k] ? 'on' : ''}" data-tg="${k}" aria-pressed="${E[k]}"><i></i>${t}</button>`;
    topo = `<div class="cr-base"><span>Valores do cronograma</span>${tg('bdi', 'BDI')}${tg('gestao', 'Gestão')}<small>${crBase(E.bdi, E.gestao)} · só muda o cronograma, o orçamento continua igual</small></div>
      ${!(E.bdi && E.gestao) ? `<div class="aviso warn">Cronograma ${crBase(E.bdi, E.gestao)}: o total (${brl(M.total)}) não bate com o preço de venda da proposta (${brl(preco)}). Para mandar ao cliente, ligue BDI e gestão.</div>` : ''}
      <div class="cr-kpis">${kpi('Início', M.inicio ? fd(M.inicio) : '—')}${kpi('Fim', M.fim ? fd(M.fim) : '—')}${kpi('Prazo', crPrazo(M.dias), M.meses.length ? plural(M.meses.length, 'mês', 'meses') + ' no cronograma' : '')}
      ${kpi('Valor ' + (E.bdi && E.gestao ? 'de venda' : E.bdi || E.gestao ? crBase(E.bdi, E.gestao) : 'de custo'), crK(M.total), M.sem_datas ? crK(M.sem_datas) + ' sem datas' : 'tudo distribuído', M.sem_datas ? 'a' : 'p')}${kpi('Maior mês', M.meses.length ? crK(Math.max(...M.meses.map(m => m.valor))) : '—', M.meses.length ? crMes(M.meses.reduce((a, b) => b.valor > a.valor ? b : a).mes) : '')}</div>`;
  }
  // série mensal da obra: previsto (datas da tela) + executado e medido (servidor)
  let curva, mensal = '';
  if (obra) {
    const real = {}; E.C.meses.forEach(m => { real[m.mes] = m; });
    const ms = crMeses(E.a, E.b).filter(m => (M.meses.length && m >= M.meses[0].mes && m <= M.meses[M.meses.length - 1].mes) || (real[m] && !real[m].futuro && (real[m].exec_acum || real[m].med_acum)));
    const pm = {}; M.meses.forEach(m => { pm[m.mes] = m; });
    let ap = 0;
    const L = ms.map(m => { ap = crR2(ap + (pm[m] ? pm[m].valor : 0)); const r = real[m]; return { mes: m, prev: pm[m] ? pm[m].valor : 0, prev_acum: ap, r: r && !r.futuro && m <= E.C.hoje.slice(0, 7) ? r : null }; });
    const G = E.C.geral;
    curva = crCurva(ms, [{ t: 'Previsto', cl: 's-p', v: L.map(x => G.valor ? x.prev_acum / G.valor * 100 : 0) }, { t: 'Executado (RDO)', cl: 's-x', v: L.map(x => x.r ? x.r.pct_exec : null) }, { t: 'Medido', cl: 's-m', v: L.map(x => x.r ? x.r.pct_med : null) }]);
    mensal = L.length ? `<div class="card"><div class="bp-h"><h3>${ic('list')} Mês a mês</h3><small>valores de venda</small></div><div class="rolar"><table class="tab cr-tab"><thead><tr><th>Mês</th><th class="n">Previsto</th><th class="n">Executado (RDO)</th><th class="n">Medido</th><th class="n">Previsto acum.</th><th class="n">Executado acum.</th><th class="n">Medido acum.</th></tr></thead><tbody>
      ${L.map(x => `<tr class="${x.mes === E.C.hoje.slice(0, 7) ? 'agora' : ''}"><td><b>${crMes(x.mes)}</b></td><td class="n bp-mono">${brl(x.prev)}</td><td class="n bp-mono">${x.r ? brl(x.r.exec) : '—'}</td><td class="n bp-mono">${x.r ? brl(x.r.med) : '—'}</td>
        <td class="n">${crPct(G.valor ? x.prev_acum / G.valor * 100 : 0)}</td><td class="n">${x.r ? crPct(x.r.pct_exec) : '—'}</td><td class="n">${x.r ? crPct(x.r.pct_med) : '—'}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  } else curva = crCurva(M.meses.map(m => m.mes), [{ t: 'Previsto acumulado', cl: 's-p', v: M.meses.map(m => m.pct_acum) }]);
  $('#cr').innerHTML = `${topo}
    ${M.sem_datas && M.inicio ? `<div class="aviso warn">${crK(M.sem_datas)} ainda sem datas: ${esc(E.linhas.filter(l => !l.ini).map(l => l.nome).join(', '))}.</div>` : ''}
    ${obra && E.C.sem_vinculo ? `<div class="aviso info">${plural(E.C.sem_vinculo, 'serviço das frentes de execução não está ligado', 'serviços das frentes de execução não estão ligados')} ao orçamento da obra e não ${E.C.sem_vinculo === 1 ? 'entra' : 'entram'} no executado.</div>` : ''}
    <div class="card cr-gantt"><div class="bp-h"><h3>${ic('cal')} ${obra ? 'Frentes gerais' : 'Etapas'}</h3>${obra ? '<small class="cr-legx"><i class="p"></i>previsto <i class="x"></i>executado <i class="m"></i>medido <i class="h"></i>hoje</small>' : `<small>${plural(E.linhas.length, 'etapa', 'etapas')}</small>`}</div>
      ${tool}
      <div class="cr-g"><div class="cr-l cr-cab"><div class="cr-n"></div><div class="cr-t">${crGradeMeses(E, true)}</div></div>${E.linhas.map((l, i) => crLinha(E, l, i)).join('')}</div></div>
    ${M.meses.length || obra ? `<div class="cr-2">${!obra ? `<div class="card"><div class="bp-h"><h3>${ic('money')} Desembolso por mês</h3><small>o que entra em cada mês</small></div>${crColunas(M)}</div>` : ''}
      <div class="card"><div class="bp-h"><h3>${ic('chart')} Curva S</h3><small>% acumulado do valor</small></div>${curva || '<p class="cr-vazio">Marque as datas para ver a curva.</p>'}</div></div>` : `<div class="card vazio"><p><b>Marque o início e o fim de cada etapa.</b><br>Digite as datas, a duração em dias, toque na linha do tempo ou use “Encadear todas”.</p></div>`}
    ${mensal}
    ${E.edita ? `<div class="barra-acoes cr-salvar ${E.sujo ? 'sujo' : ''}"><span>${E.sujo ? `${ic('alert')} Alterações não salvas` : `${ic('check')} Cronograma salvo`}</span><div class="acoes"><button type="button" class="btn bp-ac" id="crSalvar" ${E.sujo ? '' : 'disabled'}>${ic('check')} Salvar cronograma</button></div></div>` : ''}`;
  crLigar();
}

function crMudou() { CR.ed.sujo = true; crDesenhar(); }
function crLigar() {
  const E = CR.ed;
  // BDI e gestão: quem só consulta também liga e desliga para ver (sem gravar)
  $$('#cr [data-tg]').forEach(b => { b.onclick = () => { E[b.dataset.tg] = !E[b.dataset.tg]; if (E.edita) E.sujo = true; crDesenhar(); }; });
  if (!E.edita) return;
  const L = E.linhas;
  $$('#cr [data-k]').forEach(inp => {
    inp.onchange = () => {
      const l = L[+inp.dataset.i], k = inp.dataset.k;
      if (k === 'dur') {
        const n = Math.round(Number(String(inp.value).replace(',', '.')));
        if (!(n > 0)) { toast('Duração em dias (número inteiro).', 1); return crDesenhar(); }
        if (!l.ini) l.ini = $('#crIni').value || hoje();
        l.fim = crSoma(l.ini, n - 1);
      } else {
        const v = crData(inp.value);
        if (k === 'ini') { const d = l.ini && l.fim ? crDias(l.ini, l.fim) : 30; l.ini = v; if (v && (!l.fim || l.fim < v)) l.fim = crSoma(v, d - 1); if (!v) l.fim = ''; }
        else { l.fim = v; if (v && !l.ini) l.ini = crSoma(v, -29); if (v && l.ini > v) l.ini = v; if (!v) l.ini = ''; }
      }
      crMudou();
    };
  });
  $$('#cr [data-seq]').forEach(b => { b.onclick = () => {
    const i = +b.dataset.seq, ant = L.slice(0, i).reverse().find(x => x.fim), l = L[i];
    if (!ant) return toast('A etapa de cima ainda não tem datas.', 1);
    const d = l.ini && l.fim ? crDias(l.ini, l.fim) : 30;
    l.ini = crSoma(ant.fim, 1); l.fim = crSoma(l.ini, d - 1); crMudou();
  }; });
  $$('#cr [data-sug]').forEach(b => { b.onclick = () => { const l = L[+b.dataset.sug]; l.ini = l.sug.ini; l.fim = l.sug.fim; crMudou(); }; });
  $$('#cr [data-limpa]').forEach(b => { b.onclick = () => { const l = L[+b.dataset.limpa]; l.ini = l.fim = ''; crMudou(); }; });
  $('#crSeq').onclick = () => {
    let cur = crData($('#crIni').value) || hoje();
    L.forEach(l => { const d = l.ini && l.fim ? crDias(l.ini, l.fim) : 30; l.ini = cur; l.fim = crSoma(cur, d - 1); cur = crSoma(l.fim, 1); });
    crMudou();
  };
  if ($('#crSug')) $('#crSug').onclick = () => { let n = 0; L.forEach(l => { if (l.sug && !l.ini) { l.ini = l.sug.ini; l.fim = l.sug.fim; n++; } }); if (!n) return toast('As frentes que têm datas de execução já estão com datas. Use o botão de cada linha para trocar.'); crMudou(); };
  if ($('#crLimpa')) $('#crLimpa').onclick = () => { if (!confirm('Tirar as datas de todas as etapas?')) return; L.forEach(l => { l.ini = l.fim = ''; }); crMudou(); };
  $('#crSalvar').onclick = crSalvar;
  // linha do tempo: tocar numa linha sem datas marca 30 dias a partir dali; arrastar a barra muda as datas
  $$('#cr .cr-l:not(.cr-cab) .cr-t').forEach(t => {
    t.onclick = e => {
      const l = L[+t.dataset.i];
      if (l.ini || e.target.closest('.cr-bar')) return;
      const r = t.getBoundingClientRect(), dia = Math.max(0, Math.floor((e.clientX - r.left) / r.width * E.span));
      l.ini = crSoma(E.a, dia); l.fim = crSoma(l.ini, 29); crMudou();
    };
  });
  $$('#cr .cr-bar.mexe').forEach(bar => {
    bar.onpointerdown = e => {
      if (e.button) return;
      e.preventDefault();
      const i = +bar.dataset.i, l = L[i], t = bar.parentNode, porDia = E.span / t.getBoundingClientRect().width;
      const modo = e.target.dataset.h || 'mover', x0 = e.clientX, a0 = l.ini, b0 = l.fim;
      let mexeu = false;
      bar.setPointerCapture(e.pointerId);
      bar.classList.add('arrasta');
      const linha = bar.closest('.cr-l');
      bar.onpointermove = ev => {
        const dd = Math.round((ev.clientX - x0) * porDia);
        if (!dd && !mexeu) return;
        mexeu = true;
        if (modo === 'mover') { l.ini = crSoma(a0, dd); l.fim = crSoma(b0, dd); }
        else if (modo === 'a') { l.ini = crSoma(a0, dd) > b0 ? b0 : crSoma(a0, dd); }
        else { l.fim = crSoma(b0, dd) < a0 ? a0 : crSoma(b0, dd); }
        bar.style.left = crX(E, l.ini) + '%'; bar.style.width = crW(E, l.ini, l.fim) + '%';
        const n = crDias(l.ini, l.fim);
        bar.querySelector('span').textContent = fd(l.ini).slice(0, 5) + ' → ' + fd(l.fim).slice(0, 5) + ' · ' + n + ' d';
        $('[data-k="ini"]', linha).value = l.ini; $('[data-k="fim"]', linha).value = l.fim; $('[data-k="dur"]', linha).value = n;
      };
      bar.onpointerup = bar.onpointercancel = () => { bar.onpointermove = bar.onpointerup = bar.onpointercancel = null; bar.classList.remove('arrasta'); if (mexeu) crMudou(); };
    };
  });
}
async function crSalvar() {
  const E = CR.ed, b = $('#crSalvar');
  b.disabled = true;
  try {
    const r = E.tipo === 'obra' ? await api('crono_salvar', { frentes: E.linhas.map(l => ({ codigo: l.codigo, ini: l.ini, fim: l.fim })) })
      : await api('prop_cronograma', { id: E.id, bdi: E.bdi, gestao: E.gestao, etapas: E.linhas.map(l => ({ codigo: l.codigo, ini: l.ini, fim: l.fim })) });
    toast(r.msg);
    E.sujo = false;
    if (E.tipo === 'obra') return vObraCrono();
    crDesenhar();
  } catch (e) { toast(e.message, 1); b.disabled = false; }
}
/* sair com alteração sem salvar */
window.addEventListener('beforeunload', e => { if (CR.ed && CR.ed.sujo && $('#cr')) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- orçamento de cliente ---------- */
async function vPropCrono(id) {
  if (!baseNivel()) return bpSem();
  await bpCarregar();
  const d = PP.d = await api('prop_detalhe', { id }), p = d.proposta, C = d.cronograma;
  titulo('Cronograma · ' + p.rotulo);
  const edita = d.nivel === 'Gerir' && !p.obra_id && !['Revisado', 'Cancelado'].includes(p.status);
  CR.ed = { tipo: 'prop', id, edita, sujo: false, bdi: C.com_bdi !== false, gestao: C.com_gestao !== false,
    linhas: C.linhas.map(l => ({ codigo: l.codigo, nome: l.descricao, preco: l.preco, v_bdi: l.bdi, v_ges: l.gestao, valor: l.valor, ini: crData(l.ini), fim: crData(l.fim), info: plural(l.itens, 'item', 'itens') })) };
  bpTela('props', `<a href="#/orc/orcamento/${enc(id)}" class="linkbtn">${ic('back')} Voltar ao orçamento</a>
    <div class="bp-hero cr-hero"><div class="bp-hero-t"><span class="bp-selo">${ic('cal')} Cronograma físico-financeiro · <code>${esc(p.rotulo)}</code></span><h2>${esc(p.empreendimento)}</h2>
      <p>${esc(p.cliente)} · ${ppSt(p.status)}${p.obra_id ? ' · já virou obra: o cronograma agora se ajusta dentro da obra' : ''}</p>
      <div class="acoes"><a class="btn sec" href="#/orc/orcamento/${enc(id)}/proposta?m=c">${ic('file')} Proposta com o cronograma</a></div></div>
      <div class="bp-hero-custo"><div><small>Preço de venda</small><b class="bp-mono">${bpM(d.total.preco)}</b><small>${plural(C.linhas.length, 'etapa', 'etapas')}</small></div></div></div>
    <div class="cr" id="cr"></div>`);
  crDesenhar();
}

/* ---------- obra ---------- */
async function vObraCrono() {
  titulo('Cronograma físico-financeiro');
  if (!orPode()) return orSemAcesso();
  if (CR.ed && CR.ed.tipo === 'obra' && CR.ed.sujo && $('#cr') && !confirm('Descartar as alterações do cronograma?')) return;
  const C = await api('crono_obra');
  CR.ed = { tipo: 'obra', C, edita: C.pode_editar && !obraInativa(), sujo: false, inicioSug: C.frentes.map(f => f.sugestao && f.sugestao.ini).filter(Boolean).sort()[0],
    linhas: C.frentes.map(f => ({ codigo: f.codigo, nome: f.nome, valor: f.valor, ini: crData(f.ini), fim: crData(f.fim), sug: f.sugestao, real: f })) };
  view(comEtapas(orGrupos(OR.d, 'crono'), `<div class="cab"><h2>Cronograma físico-financeiro</h2><span class="contagem">${esc(obraAtual()?.nome || '')}</span></div>${obraInativa() ? AVISO_INATIVA : ''}
    ${!C.frentes.length ? `<div class="card vazio"><p><b>O cronograma usa as frentes gerais do orçamento da obra.</b><br>Monte o orçamento (ou gere a obra a partir de um orçamento aprovado) e volte aqui para marcar as datas.</p>${orGere() ? `<div class="acoes"><a class="btn" href="#/obra/orcamento">${ic('list')} Orçamento da obra</a></div>` : ''}</div>`
      : `<p class="cr-nota">${ic('alert')} <b>Executado</b> vem dos registros do RDO (serviços ligados ao orçamento, pelo preço de venda). <b>Medido</b> só conta serviço concluído, com FVS aprovada e medição aprovada.</p><div class="cr" id="cr"></div>`}`));
  orLigar(OR.d);
  if (C.frentes.length) crDesenhar();
}

ROTAS.push([/^#\/orc\/orcamento\/([^/?]+)\/cronograma$/, vPropCrono], [/^#\/obra\/cronograma$/, vObraCrono]);
