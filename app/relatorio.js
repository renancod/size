'use strict';
/* =====================================================================
 * RELATÓRIO DE EXECUÇÃO / PROJEÇÃO (engenheiro → contratante)
 * Escolhe o que enviar (executado, previsão ou completo), o período no calendário, revisa o texto,
 * vê a prévia e gera o PDF para baixar, mandar pelo WhatsApp ou por e-mail.
 * Usa exec.js (EX, util, addD, DSEM, SX, barra…) e app.js (api, modal, view…).
 * ===================================================================== */
Object.assign(IC, {
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
  whats: 'M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5zM9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .7a3.5 3.5 0 0 1-1.7-1.7l.7-1-1-2z'
});
const REL = { chuva: {}, obra: '', tipo: 'completo', de: '', ate: '', pick: null, mes: '', manual: false, dados: null, erro: '', texto: '', editado: false, tok: 0, pdf: null, gerando: false };
const REL_TIPOS = {
  executado: ['Executado', 'O que foi feito no período, com clima e ocorrências', 'check'],
  previsao: ['Previsão', 'A meta e a projeção do que vem pela frente', 'clock'],
  completo: ['Completo', 'Executado e previsão no mesmo relatório', 'layers']
};
const REL_TITULO = { executado: 'RELATÓRIO DE EXECUÇÃO', previsao: 'PROJEÇÃO DE EXECUÇÃO', completo: 'RELATÓRIO DE EXECUÇÃO E PROJEÇÃO' };
const REL_ARQ = { executado: 'Execucao', previsao: 'Projecao', completo: 'Execucao_e_Projecao' };
const fc = s => s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) : '';
const dsemC = s => DSEM[new Date(s + 'T12:00').getDay()].slice(0, 3);
const segDa = s => addD(s, -((new Date(s + 'T12:00').getDay() + 6) % 7));
const mesNome = ym => { const [y, m] = ym.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };

/* o que o calendário sabe: dias com diário, parados por chuva e até onde vai a previsão cadastrada */
function relCal() {
  const D = EX.d, dia = {};
  D.diarios.forEach(d => { dia[d.data] = d; });
  const itens = D.etapas.filter(e => e.ativa).flatMap(e => e.itens.map(i => Object.assign({ etapa: e.nome }, i))).filter(i => i.situacao !== 'concluido' && i.inicio && i.termino);
  return { dia, itens, fimPrev: itens.map(i => i.termino).sort().pop() || '', ultimo: D.diarios.map(d => d.data).sort().pop() || '' };
}
function relPadrao(tipo) {
  const h = hoje(), seg = segDa(h), w = new Date(h + 'T12:00').getDay(), fimSem = w === 0 || w >= 5;
  const exe = fimSem ? [seg, h] : [addD(seg, -7), h]; // até hoje: não deixa de fora sábado/domingo nem o que foi lançado nesta semana
  const pre = fimSem ? [addD(seg, 7), addD(seg, 11)] : [h, addD(seg, 4)];
  return tipo === 'executado' ? exe : tipo === 'previsao' ? pre : [exe[0], pre[1]];
}
function relAplicarPadrao() { [REL.de, REL.ate] = relPadrao(REL.tipo); REL.pick = null; REL.mes = REL.de.slice(0, 7); }
const ATALHOS = [['passada', 'Semana passada'], ['esta', 'Esta semana'], ['proxima', 'Próxima semana'], ['ult7', 'Últimos 7 dias'], ['prevista', 'Até o fim da previsão']];
function relAtalho(k) {
  const h = hoje(), seg = segDa(h), C = relCal();
  let r = { passada: [addD(seg, -7), addD(seg, -3)], esta: [seg, addD(seg, 4)], proxima: [addD(seg, 7), addD(seg, 11)], ult7: [addD(h, -6), h] }[k];
  if (k === 'prevista') { if (!C.fimPrev) return toast('Não há previsão cadastrada.', 1); r = [h, C.fimPrev > addD(h, 92) ? addD(h, 92) : C.fimPrev]; }
  REL.de = r[0]; REL.ate = r[1]; REL.pick = null; REL.manual = true; REL.mes = REL.de.slice(0, 7);
  relMudou();
}

/* ---------- tela ---------- */
async function vRelatorio() {
  titulo('Relatórios');
  if (!can('exec_planejar')) return view('<div class="card vazio"><p>Só o engenheiro ou o administrador gera relatórios para o contratante.</p></div>');
  carregandoView();
  try { await carregarExec(true); } catch (e) { return view(`<div class="card vazio"><p>${esc(e.message)}</p></div>`); }
  if (REL.obra !== S.obraId || !REL.de) { REL.obra = S.obraId; REL.manual = false; REL.editado = false; REL.texto = ''; REL.dados = null; REL.pdf = null; relAplicarPadrao(); }
  const C = relCal();
  view(`<div class="rel-hero">
      <div class="rel-hero-t"><span class="rel-sel">${ic('send')} Relatório ao contratante</span><h2>Relatórios de execução</h2><p>${esc(S.dados.obra.nome)}</p></div>
      <div class="rel-chips">
        <span class="rel-chip ok">${ic('check')} Execução registrada até <b>${C.ultimo ? fd(C.ultimo) : '—'}</b></span>
        ${C.fimPrev ? `<button type="button" class="rel-chip prev" id="irFim">${ic('clock')} Previsão cadastrada até <b>${fd(C.fimPrev)}</b></button>` : `<span class="rel-chip">${ic('minus')} Sem previsão cadastrada</span>`}
      </div></div>
    <div class="rel-grid"><div class="rel-col">
      <section class="card rel-sec"><div class="rel-h"><b>1</b><div><h3>O que enviar</h3><small>Escolha o conteúdo do relatório</small></div></div><div class="rel-tipos" id="relTipos"></div></section>
      <section class="card rel-sec"><div class="rel-h"><b>2</b><div><h3>Período</h3><small>Toque na data inicial e depois na final</small></div></div>
        <div class="rel-atalhos" id="relAtalhos"></div><div id="relCal"></div><div id="relPer"></div></section>
      <section class="card rel-sec"><div class="rel-h"><b>3</b><div><h3>Texto do relatório</h3><small>Sugestão automática — edite à vontade</small></div></div>
        <textarea id="relTxt" rows="8" placeholder="Resumo que abre o relatório (chuva, atrasos, reprogramações…)"></textarea>
        <div class="acoes"><button type="button" class="btn sec peq" id="relRefaz">${ic('refresh')} Refazer sugestão</button></div></section>
    </div><div class="rel-col"><section class="card rel-sec rel-prevcard"><div class="rel-h"><b>4</b><div><h3>Prévia</h3><small>É assim que o PDF vai sair</small></div></div>
      <div id="relPrev"></div>
      <div class="rel-acoes" id="relAcoes">
        <button type="button" class="btn" id="relBaixar">${ic('download')} Baixar PDF</button>
        <button type="button" class="btn zap" id="relZap">${ic('whats')} WhatsApp</button>
        <button type="button" class="btn sec" id="relMail">${ic('mail')} E-mail</button></div></section></div></div>`);
  relTipos(); relAtalhos(); relCalDesenhar(); relPer(); relTxtPor();
  if ($('#irFim')) $('#irFim').onclick = () => { REL.mes = C.fimPrev.slice(0, 7); relCalDesenhar(); };
  $('#relTxt').oninput = e => { REL.texto = e.target.value; REL.editado = true; REL.pdf = null; relPrevDesenhar(); };
  $('#relRefaz').onclick = () => { REL.editado = false; if (REL.dados) { REL.texto = textoAuto(REL.dados); relTxtPor(); REL.pdf = null; relPrevDesenhar(); } };
  $('#relBaixar').onclick = relBaixar; $('#relZap').onclick = relZap; $('#relMail').onclick = relEmail;
  relCarregar();
}
function relTipos() {
  $('#relTipos').innerHTML = Object.entries(REL_TIPOS).map(([k, v]) => `<button type="button" class="rel-tipo ${k === REL.tipo ? 'on' : ''}" data-t="${k}">${ic(v[2])}<b>${v[0]}</b><small>${v[1]}</small></button>`).join('');
  $$('#relTipos [data-t]').forEach(b => {
    b.onclick = () => {
      REL.tipo = b.dataset.t;
      if (!REL.manual) relAplicarPadrao();
      REL.pdf = null; relTipos(); relCalDesenhar(); relPer();
      if (REL.dados && !REL.editado) { REL.texto = textoAuto(REL.dados); relTxtPor(); }
      if (!REL.manual) relCarregar(); else relPrevDesenhar();
    };
  });
}
function relAtalhos() {
  $('#relAtalhos').innerHTML = ATALHOS.map(([k, t]) => `<button type="button" class="rel-at" data-a="${k}">${t}</button>`).join('');
  $$('#relAtalhos [data-a]').forEach(b => { b.onclick = () => relAtalho(b.dataset.a); });
}
function relMudou() { REL.pdf = null; relCalDesenhar(); relPer(); relCarregar(); }
function relCalDesenhar() {
  const C = relCal(), h = hoje(), [y, m] = REL.mes.split('-').map(Number), off = (new Date(y, m - 1, 1).getDay() + 6) % 7, n = new Date(y, m, 0).getDate();
  const ant = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`, prox = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  let cel = '<span class="cd vz"></span>'.repeat(off);
  for (let d = 1; d <= n; d++) {
    const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, di = C.dia[s];
    let cl = '', tip = '';
    if (di) { cl = di.condicao === 'Parado por chuva' ? 'chuva' : 'exec'; tip = rdoN(di.numero) + ' · ' + di.condicao; }
    else if (!util(s)) cl = 'off';
    else if (s >= h) { const l = C.itens.filter(i => i.inicio <= s && s <= i.termino); if (l.length) { cl = 'prev'; tip = 'Previsto: ' + l.map(i => i.servico).join(', '); } }
    if (s === h) cl += ' hoje';
    if (s === C.fimPrev) { cl += ' fim'; tip += (tip ? ' · ' : '') + 'último dia com previsão'; }
    if (REL.de && s >= REL.de && s <= REL.ate) cl += ' sel' + (s === REL.de ? ' a' : '') + (s === REL.ate ? ' b' : '');
    cel += `<button type="button" class="cd ${cl}" data-d="${s}" title="${esc(tip)}"><span>${d}</span></button>`;
  }
  $('#relCal').innerHTML = `<div class="cal-cab"><button type="button" class="icbtn" id="cMenos" aria-label="Mês anterior">${ic('left')}</button><b>${mesNome(REL.mes)}</b><button type="button" class="icbtn" id="cMais" aria-label="Próximo mês">${ic('right')}</button></div>
    <div class="cal-sem">${['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(x => `<span>${x}</span>`).join('')}</div><div class="cal-g">${cel}</div>
    <div class="cal-leg"><span><i class="l-exec"></i>Executado</span><span><i class="l-chuva"></i>Parado por chuva</span><span><i class="l-prev"></i>Previsto</span><span><i class="l-fim"></i>Fim da previsão</span></div>`;
  $('#cMenos').onclick = () => { REL.mes = ant; relCalDesenhar(); };
  $('#cMais').onclick = () => { REL.mes = prox; relCalDesenhar(); };
  $$('#relCal [data-d]').forEach(b => {
    b.onclick = () => {
      const s = b.dataset.d;
      if (REL.pick) { REL.de = s < REL.pick ? s : REL.pick; REL.ate = s < REL.pick ? REL.pick : s; REL.pick = null; REL.manual = true; relMudou(); }
      else { REL.de = REL.ate = REL.pick = s; REL.manual = true; relCalDesenhar(); relPer(); }
    };
  });
}
function relPer() {
  const C = relCal(), h = hoje();
  let u = 0; for (let s = REL.de; s <= REL.ate; s = addD(s, 1)) if (util(s)) u++;
  const avisos = [];
  if (REL.pick) avisos.push(['info', 'Agora toque na data final do período.']);
  else {
    if (REL.tipo !== 'executado' && C.fimPrev && REL.ate > C.fimPrev) avisos.push(['warn', `Depois de ${fd(C.fimPrev)} não há nada previsto cadastrado — a previsão vai só até lá.`]);
    if (REL.tipo !== 'executado' && !C.fimPrev) avisos.push(['warn', 'Não há previsão cadastrada: cadastre etapas e serviços com datas para projetar.']);
    if (REL.tipo === 'executado' && REL.de > h) avisos.push(['warn', 'Esse período ainda não aconteceu — escolha "Previsão" ou "Completo".']);
    if (REL.tipo !== 'previsao' && C.ultimo && REL.de > C.ultimo) avisos.push(['warn', `A execução registrada vai só até ${fd(C.ultimo)}.`]);
    else if (REL.tipo !== 'previsao' && C.ultimo && REL.dados && !REL.dados.executado.length && REL.de <= h)
      avisos.push(['warn', `Não há produção lançada entre ${fc(REL.de)} e ${fc(REL.ate)}. A última execução registrada foi em ${fd(C.ultimo)}. <button type="button" class="linkbtn" id="relIrUlt">Usar a semana dessa execução</button>`, 1]);
  }
  $('#relPer').innerHTML = `<div class="rel-per"><span>${ic('calendar')}<b>${fc(REL.de)}</b> <small>${dsemC(REL.de)}</small> <i>→</i> <b>${fc(REL.ate)}</b> <small>${dsemC(REL.ate)}</small></span><em>${plural(u, 'dia útil', 'dias úteis')}</em></div>
    ${avisos.map(a => `<div class="aviso ${a[0]}">${a[2] ? a[1] : esc(a[1])}</div>`).join('')}`;
  if ($('#relIrUlt')) $('#relIrUlt').onclick = () => { const u = C.ultimo; REL.de = segDa(u); REL.ate = u; REL.pick = null; REL.manual = true; REL.mes = u.slice(0, 7); relMudou(); };
}
function relTxtPor() { const t = $('#relTxt'); if (t && t.value !== REL.texto) t.value = REL.texto; }

/* previsão de chuva (Open-Meteo, até 15 dias à frente): dias úteis com chuva forte no horário de trabalho (7h–17h) */
async function relChuvaPrev(de, ate) {
  const o = EX.d.obra, h = hoje(), a = de > h ? de : h, lim15 = addD(h, 15), b = ate < lim15 ? ate : lim15;
  if (!o || o.lat === '' || o.lat == null || o.lng === '' || o.lng == null || a > b) return {};
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${o.lat}&longitude=${o.lng}&hourly=precipitation,precipitation_probability&timezone=America%2FSao_Paulo&start_date=${a}&end_date=${b}`, { signal: ctl.signal });
    const hh = (await r.json()).hourly;
    if (!hh || !hh.time) return {};
    const limite = num(EX.d.limite_chuva) || 5, dias = {}, out = {};
    hh.time.forEach((x, i) => {
      const d = String(x).slice(0, 10), hr = +String(x).slice(11, 13);
      if (hr < 7 || hr >= 17) return;
      const e = dias[d] = dias[d] || { mm: 0, prob: 0 };
      e.mm += +hh.precipitation[i] || 0; e.prob = Math.max(e.prob, +hh.precipitation_probability[i] || 0);
    });
    Object.keys(dias).forEach(d => { const e = dias[d]; if (util(d) && (e.mm >= limite || (e.prob >= 70 && e.mm >= 1))) out[d] = { mm: Math.round(e.mm * 10) / 10, prob: Math.round(e.prob) }; });
    return out;
  } catch (e) { return {}; } finally { clearTimeout(tm); }
}
async function relCarregar() {
  const t = ++REL.tok;
  REL.dados = null; REL.erro = ''; REL.pdf = null; REL.chuva = {}; relPrevDesenhar();
  try {
    const r = await api('exec_relatorio', { de: REL.de, ate: REL.ate });
    if (t !== REL.tok) return;
    const ch = r.ate >= hoje() ? await relChuvaPrev(r.prev_de, r.ate) : {};
    if (t !== REL.tok) return;
    REL.dados = r; REL.chuva = ch;
    if (!REL.editado) { REL.texto = textoAuto(r); relTxtPor(); }
  } catch (e) { if (t !== REL.tok) return; REL.erro = e.message; }
  relPrevDesenhar(); relPer();
}

/* texto que abre o relatório, em linguagem simples (o engenheiro pode editar) */
const fmtP = n => { n = Number(n) || 0; return (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('pt-BR'); };
function textoAuto(r) {
  const p = [], tipo = REL.tipo, h = hoje(), per = `${fc(r.de)} a ${fc(r.ate)}`;
  if (tipo !== 'previsao') {
    const lst = r.executado.flatMap(e => e.itens.filter(i => i.periodo > 0).map(i => `${i.servico} (${nf(i.periodo)} ${i.unidade})`));
    if (lst.length) p.push(`De ${per} foram executados: ${lst.join('; ')}.`);
    else if (r.de <= h) p.push(`De ${per} não houve execução registrada.`);
    if (r.parados.length) p.push(`Houve chuva em ${plural(r.parados.length, 'dia', 'dias')} (${r.parados.map(x => dsemC(x.data) + ' ' + fc(x.data)).join(', ')}) e a obra ficou parada.`);
  }
  if (tipo !== 'executado' && r.ate >= h) {
    const its = r.previsto.flatMap(e => e.itens).filter(i => i.plano.length);
    const ini = its.filter(i => i.inicia), cont = its.filter(i => !i.inicia);
    if (ini.length) p.push(`Início previsto de ${fc(r.prev_de)} a ${fc(r.ate)}: ${ini.map(i => `${i.servico} (${fc(i.plano[0].data)})`).join('; ')}.`);
    if (cont.length) p.push(`Seguem em andamento: ${cont.map(i => i.servico).join(', ')}.`);
    const rk = Object.keys(REL.chuva || {}).sort();
    if (rk.length) p.push(`Há previsão de chuva em ${rk.map(d => dsemC(d) + ' ' + fc(d)).join(', ')}; a execução pode atrasar.`);
    if (!its.length) p.push(`Não há serviços previstos para ${fc(r.prev_de)} a ${fc(r.ate)}.`);
  }
  return p.join('\n\n');
}

/* ---------- a folha do relatório (a mesma na prévia e no PDF) ---------- */
/* colunas: um dia por coluna (só dias úteis ou com produção); se forem muitos dias, uma coluna por semana */
function relColunas(de, ate, extra, parados, risco = {}) {
  const dias = [];
  for (let s = de; s <= ate; s = addD(s, 1)) if (util(s) || extra[s] || parados[s]) dias.push(s);
  const mk = (ini, fim, tit) => ({ ini, fim, tit, chuva: Object.keys(parados).some(d => d >= ini && d <= fim), risco: Object.keys(risco).some(d => d >= ini && d <= fim) });
  if (dias.length <= 8) return dias.map(s => mk(s, s, `${dsemC(s)}<br>${fc(s)}`));
  const cols = [];
  for (let seg = segDa(de); seg <= ate; seg = addD(seg, 7)) {
    const ds = dias.filter(s => s >= seg && s <= addD(seg, 6));
    if (ds.length) cols.push(mk(ds[0], ds[ds.length - 1], `${fc(ds[0])}<br>a ${fc(ds[ds.length - 1])}`));
  }
  return cols;
}
function relFolha(r) {
  const tipo = REL.tipo, h = hoje(), parados = {}, extra = {};
  r.parados.forEach(x => { parados[x.data] = x.mm; });
  r.executado.forEach(e => e.itens.forEach(i => Object.keys(i.dias_qtd || {}).forEach(s => { extra[s] = 1; })));
  let cols = relColunas(r.de, r.ate < h ? r.ate : h, extra, parados); // executado: só até hoje
  const soma = (mapa, c) => Object.keys(mapa).filter(s => s >= c.ini && s <= c.fim).reduce((t, s) => t + mapa[s], 0);
  const cab = fim => `<tr><th class="sv">Serviço</th>${cols.map(c => `<th class="d ${c.chuva ? 'chv' : ''} ${c.risco ? 'rsk' : ''}">${c.tit}${c.chuva ? '<i>chuva</i>' : ''}${c.risco ? '<i class="rk">possível chuva</i>' : ''}</th>`).join('')}<th class="d fim">${fim}</th></tr>`;
  const linha = (nome, total, mapaPct, concl, tags) => `<tr><td class="sv">${esc(nome)}<small>${total}</small></td>${cols.map(c => {
    const v = soma(mapaPct, c), tg = tags && tags(c);
    return `<td class="d ${c.chuva ? 'chv' : ''} ${c.risco ? 'rsk' : ''}">${v > 0.04 ? `<b>${fmtP(v)}%</b>` : '<span class="nd">—</span>'}${tg ? `<small class="tg">${tg}</small>` : ''}</td>`;
  }).join('')}<td class="d fim"><b>${fmtP(concl)}%</b><span class="rl-bar"><i style="width:${Math.min(100, concl)}%"></i></span></td></tr>`;
  const cartao = (e, linhas, fim) => `<div class="rl-bloco rl-et"><div class="rl-et-t"><div><b>${esc(e.nome)}</b>${e.local ? `<small>${esc(e.local)}</small>` : ''}</div></div>
    <table class="rl-t rl-sem"><thead>${cab(fim)}</thead><tbody>${linhas}</tbody></table></div>`;

  const exec = r.executado.map(e => cartao(e, e.itens.filter(i => i.periodo > 0).map(i => {
    const m = {}; Object.keys(i.dias_qtd || {}).forEach(s => { m[s] = i.previsto ? i.dias_qtd[s] / i.previsto * 100 : 0; });
    return linha(i.servico, `${nf(i.periodo)} ${esc(i.unidade)} no período`, m, i.pct);
  }).join(''), 'Já concluído')).join('');
  const risco = REL.chuva || {};
  cols = relColunas(r.prev_de, r.ate, {}, {}, risco); // previsão: só do que ainda vem pela frente
  const prev = r.previsto.map(e => {
    const its = e.itens.filter(i => i.plano.length);
    if (!its.length) return '';
    return cartao(e, its.map(i => {
      const m = {}; i.plano.forEach(x => { m[x.data] = x.pct; });
      const d0 = i.plano[0].data, d1 = i.plano[i.plano.length - 1].data;
      return linha(i.servico, `${nf(i.prevista)} ${esc(i.unidade)} no total`, m, i.pct_depois, c => (i.inicia && d0 >= c.ini && d0 <= c.fim ? 'início' : '') || (i.conclui && d1 >= c.ini && d1 <= c.fim ? 'conclusão' : ''));
    }).join(''), 'Concluído ao fim');
  }).join('');
  const chuva = r.parados.length ? `<div class="rl-chuva rl-cut"><b>Chuva no período</b><span>${r.parados.map(x => `${DSEM[new Date(x.data + 'T12:00').getDay()]}, ${fc(x.data)}`).join(' · ')} — obra parada.</span></div>` : '';
  const rkd = Object.keys(risco).sort();
  const aviso = tipo !== 'executado' && rkd.length && r.ate >= h ? `<div class="rl-chuva rk rl-cut"><b>Possibilidade de chuva</b><span>${rkd.map(d => `${DSEM[new Date(d + 'T12:00').getDay()]}, ${fc(d)} (${risco[d].prob}%)`).join(' · ')} — a execução pode atrasar.</span></div>` : '';
  const sec = (t, corpo) => `<div class="rl-sec"><div class="rl-sec-t">${t}</div>${corpo}</div>`;
  const passou = r.ate < h;
  return `<div class="rl" id="relFolha">
    <div class="rl-top rl-cut"><div class="rl-logo"><img src="logo.png" alt="Size Engenharia"></div>
      <div class="rl-tit"><small>${esc(r.empresa)}</small><b>${REL_TITULO[tipo]}</b><span>${esc(r.obra.nome)}${r.obra.endereco ? ' · ' + esc(r.obra.endereco) : ''}</span></div>
      <div class="rl-per"><small>Período</small><b>${fc(r.de)} a ${fc(r.ate)}</b><span>${r.ate.slice(0, 4)}</span></div></div>
    ${REL.texto.trim() ? `<div class="rl-callout rl-cut"><div class="rl-sec-t sm">Resumo</div>${esc(REL.texto.trim()).replace(/\n/g, '<br>')}</div>` : ''}
    ${chuva}
    ${tipo !== 'previsao' ? sec('O que foi executado', exec || '<p class="rl-vazio">Nenhuma execução registrada neste período.</p>') : ''}
    ${tipo !== 'executado' ? sec(passou ? 'O que está previsto' : `O que está previsto · ${fc(r.prev_de)} a ${fc(r.ate)}`, passou ? '<p class="rl-vazio">O período escolhido já passou.</p>' : aviso + (prev || '<p class="rl-vazio">Não há serviços previstos neste período.</p>')) : ''}
    <div class="rl-leg rl-cut">Cada número é a parte do serviço feita no dia, em % do total do serviço. A última coluna mostra quanto do serviço está pronto.${tipo !== 'executado' ? ' A previsão pode mudar com chuva ou outros imprevistos.' : ''}</div>
    <div class="rl-nota rl-cut">Documento emitido por ${esc(r.emissor)} em ${new Date().toLocaleString('pt-BR')}.</div></div>`;
}function relPrevDesenhar() {
  const el = $('#relPrev'); if (!el) return;
  const ac = $('#relAcoes');
  if (ac) $$('button', ac).forEach(b => { b.disabled = !REL.dados; });
  if (REL.erro) { el.style.height = ''; el.innerHTML = `<div class="rel-vazio erro">${esc(REL.erro)}</div>`; return; }
  if (!REL.dados) { el.style.height = ''; el.innerHTML = '<div class="rel-vazio"><span class="spin"></span>Calculando…</div>'; return; }
  el.innerHTML = `<div class="rel-esc" id="relEsc">${relFolha(REL.dados)}</div>`;
  relEscala();
}
function relEscala() {
  const w = $('#relPrev'), e = $('#relEsc');
  if (!w || !e) return;
  const s = Math.min(1, w.clientWidth / 600);
  e.style.transform = `scale(${s})`; e.style.transformOrigin = 'top left';
  w.style.height = Math.ceil(e.offsetHeight * s) + 'px';
}
addEventListener('resize', relEscala);

/* ---------- PDF (html2canvas + jsPDF, carregados só quando precisa) ---------- */
const LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
const carregarScript = u => new Promise((ok, no) => {
  const s = document.createElement('script');
  s.src = u; s.onload = ok; s.onerror = () => no(new Error('Não consegui carregar o gerador de PDF. Confira a internet e tente de novo.'));
  document.head.appendChild(s);
});
async function relLibs() {
  if (!window.html2canvas) await carregarScript(LIBS[0]);
  if (!window.jspdf) await carregarScript(LIBS[1]);
}
const relNome = () => `Relatorio_${REL_ARQ[REL.tipo]}_${REL.dados.obra.sigla || 'obra'}_${REL.dados.de}_a_${REL.dados.ate}.pdf`;
function imgCarregar(src) { return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }); }
async function relGerarPdf() {
  if (REL.pdf) return REL.pdf;
  await relLibs();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:600px;background:#fff';
  host.innerHTML = relFolha(REL.dados);
  document.body.appendChild(host);
  try {
    const folha = host.firstElementChild;
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Promise.all($$('img', folha).map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })));
    const E = 2.2, W = 600, base = folha.getBoundingClientRect();
    const canvas = await html2canvas(folha, { scale: E, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: W, scrollX: 0, scrollY: 0 });
    // pontos onde pode quebrar a página: fim de blocos e de linhas de tabela (em px da folha)
    const cortes = [...new Set($$('.rl-cut, .rl-bloco, .rl-t tr, .rl-li', folha).map(el => Math.round(el.getBoundingClientRect().bottom - base.top)))].sort((a, b) => a - b);
    const total = Math.round(base.height), MM = 190 / W, topo = 12, baixo = 14, dispH = Math.floor((297 - topo - baixo) / MM);
    const paginas = [];
    for (let ini = 0; ini < total - 2;) {
      let fim = ini + dispH;
      if (fim >= total) fim = total;
      else { const ok = cortes.filter(c => c <= fim && c > ini + dispH * 0.35); if (ok.length) fim = ok[ok.length - 1]; }
      paginas.push([ini, fim]); ini = fim;
    }
    const { jsPDF } = window.jspdf, pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    let marca = null;
    try { const im = await imgCarregar('logo.png'), c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); marca = { d: c.toDataURL('image/png'), r: im.naturalHeight / im.naturalWidth }; } catch (e) { /* sem marca d'água */ }
    paginas.forEach(([a, b], k) => {
      if (k) pdf.addPage();
      const pc = document.createElement('canvas'); pc.width = canvas.width; pc.height = Math.max(1, Math.round((b - a) * E));
      const cx = pc.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, pc.width, pc.height);
      cx.drawImage(canvas, 0, Math.round(a * E), canvas.width, pc.height, 0, 0, pc.width, pc.height);
      pdf.addImage(pc.toDataURL('image/jpeg', 0.93), 'JPEG', 10, topo, 190, (b - a) * MM);
      if (marca) { try { pdf.saveGraphicsState(); pdf.setGState(new pdf.GState({ opacity: 0.05 })); pdf.addImage(marca.d, 'PNG', 35, 100, 140, 140 * marca.r); pdf.restoreGraphicsState(); } catch (e) { /* sem transparência */ } }
      pdf.setFontSize(8); pdf.setTextColor(110);
      if (k) pdf.text(`${REL_TITULO[REL.tipo]} - ${REL.dados.obra.nome}`, 10, 8);
      pdf.text(`${REL.dados.empresa} - ${REL.dados.obra.nome}`, 10, 291);
      pdf.text(`Página ${k + 1} de ${paginas.length}`, 200, 291, { align: 'right' });
    });
    REL.pdf = pdf.output('blob');
    return REL.pdf;
  } finally { host.remove(); }
}
async function comPdf(botao, fn) {
  if (!REL.dados || REL.gerando) return;
  REL.gerando = true;
  const t = botao.innerHTML; botao.disabled = true; botao.innerHTML = '<span class="spin peq"></span> Gerando PDF…';
  try { await fn(await relGerarPdf()); } catch (e) { toast(e.message || 'Não consegui gerar o PDF.', 1); }
  REL.gerando = false; botao.disabled = false; botao.innerHTML = t;
}
function baixarBlob(blob, nome) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}
const relBaixar = e => comPdf(e.currentTarget, blob => { baixarBlob(blob, relNome()); toast('PDF baixado.'); });
const relMsg = () => `*${REL_TITULO[REL.tipo]}* - ${REL.dados.obra.nome}\nPeríodo: ${fd(REL.dados.de)} a ${fd(REL.dados.ate)}\n${REL.dados.empresa}`;
const relZap = e => comPdf(e.currentTarget, async blob => {
  const arq = new File([blob], relNome(), { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [arq] })) {
    try { await navigator.share({ files: [arq], title: REL_TITULO[REL.tipo], text: relMsg() }); return; }
    catch (x) { if (x.name === 'AbortError') return; toast('PDF pronto — toque em WhatsApp de novo para enviar.'); return; }
  }
  baixarBlob(blob, relNome());
  open('https://wa.me/?text=' + enc(relMsg() + '\n(o PDF foi baixado — anexe na conversa)'), '_blank');
  toast('Este aparelho não envia o arquivo direto: o PDF foi baixado, anexe no WhatsApp.');
});
const relEmail = e => {
  if (!REL.dados) return;
  const d = REL.dados, ls = 'cs_rel_para_' + S.obraId;
  modal('Enviar por e-mail', `<label>Para <small>(separe vários com vírgula)</small><input name="para" type="text" inputmode="email" autocomplete="email" required value="${esc(LS.get(ls))}" placeholder="contratante@empresa.com.br"></label>
    <label>Assunto<input name="assunto" value="${esc(REL_TITULO[REL.tipo].charAt(0) + REL_TITULO[REL.tipo].slice(1).toLowerCase() + ' · ' + d.obra.nome + ' · ' + fc(d.de) + ' a ' + fc(d.ate))}"></label>
    <label>Mensagem<textarea name="msg" rows="4">Prezados, segue em anexo o ${REL.tipo === 'previsao' ? 'relatório de projeção' : 'relatório'} da obra ${esc(d.obra.nome)} referente ao período de ${fd(d.de)} a ${fd(d.ate)}.</textarea></label>
    <label class="ck"><input type="checkbox" name="copia" checked> Enviar uma cópia para mim</label>
    <small>O PDF vai em anexo, exatamente como na prévia.</small>`, {
    ok: 'Gerar PDF e enviar',
    onOk: async f => {
      const blob = await relGerarPdf();
      LS.set(ls, f.para.value.trim());
      const r = await api('exec_relatorio_email', { para: f.para.value, assunto: f.assunto.value, mensagem: f.msg.value, copia: f.copia.checked, pdf: { nome: relNome(), b64: await paraB64(blob) } });
      toast(r.msg);
    }
  });
};

ROTAS.push([/^#\/exec\/relatorio$/, vRelatorio]);
