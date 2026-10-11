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
const REL = { obra: '', tipo: 'completo', de: '', ate: '', pick: null, mes: '', manual: false, dados: null, erro: '', texto: '', editado: false, tok: 0, pdf: null, gerando: false };
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
const SIT_REL = { no_ritmo: 'No prazo', atencao: 'Atenção', atrasado: 'Atrasado', nao_iniciado: 'A iniciar', concluido: 'Concluído' };

/* o que o calendário sabe: dias com diário, parados por chuva e até onde vai a previsão cadastrada */
function relCal() {
  const D = EX.d, dia = {};
  D.diarios.forEach(d => { dia[d.data] = d; });
  const itens = D.etapas.filter(e => e.ativa).flatMap(e => e.itens.map(i => Object.assign({ etapa: e.nome }, i))).filter(i => i.situacao !== 'concluido' && i.inicio && i.termino);
  return { dia, itens, fimPrev: itens.map(i => i.termino).sort().pop() || '', ultimo: D.diarios.map(d => d.data).sort().pop() || '' };
}
function relPadrao(tipo) {
  const h = hoje(), seg = segDa(h), w = new Date(h + 'T12:00').getDay(), fimSem = w === 0 || w >= 5;
  const exe = fimSem ? [seg, addD(seg, 4)] : [addD(seg, -7), addD(seg, -3)];
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
  }
  $('#relPer').innerHTML = `<div class="rel-per"><span>${ic('calendar')}<b>${fc(REL.de)}</b> <small>${dsemC(REL.de)}</small> <i>→</i> <b>${fc(REL.ate)}</b> <small>${dsemC(REL.ate)}</small></span><em>${plural(u, 'dia útil', 'dias úteis')}</em></div>
    ${avisos.map(a => `<div class="aviso ${a[0]}">${esc(a[1])}</div>`).join('')}`;
}
function relTxtPor() { const t = $('#relTxt'); if (t && t.value !== REL.texto) t.value = REL.texto; }

async function relCarregar() {
  const t = ++REL.tok;
  REL.dados = null; REL.erro = ''; REL.pdf = null; relPrevDesenhar();
  try {
    const r = await api('exec_relatorio', { de: REL.de, ate: REL.ate });
    if (t !== REL.tok) return;
    REL.dados = r;
    if (!REL.editado) { REL.texto = textoAuto(r); relTxtPor(); }
  } catch (e) { if (t !== REL.tok) return; REL.erro = e.message; }
  relPrevDesenhar();
}

/* texto que abre o relatório: executado, chuva, meta da semana e reprogramações com o motivo */
function textoAuto(r) {
  const p = [], tipo = REL.tipo, per = `${fc(r.de)} a ${fc(r.ate)}`, h = hoje();
  if (tipo !== 'previsao') {
    const lst = r.executado.flatMap(e => e.itens.filter(i => i.periodo > 0).map(i => `${i.servico} (${nf(i.periodo)} ${i.unidade})`));
    if (lst.length) p.push(`No período de ${per} foram executados: ${lst.join('; ')}.`);
    else if (r.de <= h) p.push(`No período de ${per} não houve produção registrada.`);
    if (r.parados.length) p.push(`A execução foi paralisada por chuva em ${plural(r.parados.length, 'dia', 'dias')} (${r.parados.map(x => fc(x.data) + (x.mm ? ' · ' + nf(x.mm) + ' mm' : '')).join('; ')}), o que impactou o andamento dos serviços.`);
  }
  if (tipo !== 'executado' && r.ate >= h) {
    const its = r.previsto.flatMap(e => e.itens), meta = its.filter(i => i.meta > 0), pv = `${fc(r.prev_de)} a ${fc(r.ate)}`;
    if (meta.length) p.push(`Previsão para ${pv}, para cumprir o prazo: ${meta.map(i => `${i.servico} ${nf(i.meta)} ${i.unidade}`).join('; ')}.`);
    else if (!its.length) p.push(`Não há serviços previstos para ${pv}.`);
    const risco = its.filter(i => i.situacao === 'atrasado' || i.situacao === 'atencao');
    if (risco.length) p.push(`Atenção ao prazo: ${risco.map(i => i.servico + (i.projecao ? ' (término projetado ' + fd(i.projecao) + ')' : '')).join('; ')}.`);
  }
  r.reprogramacoes.forEach(x => p.push(`${x.servico}: ${x.campo} reprogramado de ${fmtAlt(x.de)} para ${fmtAlt(x.para)}${x.motivo ? ' — ' + x.motivo : ''}.`));
  return p.join('\n\n');
}

/* ---------- a folha do relatório (a mesma na prévia e no PDF) ---------- */
function relFolha(r) {
  const tipo = REL.tipo, h = hoje(), C = relCal();
  let ut = 0; for (let s = r.de; s <= (r.ate < h ? r.ate : h); s = addD(s, 1)) if (util(s)) ut++;
  const its = r.previsto.flatMap(e => e.itens), risco = its.filter(i => i.situacao === 'atrasado' || i.situacao === 'atencao').length;
  const kp = (v, t, cl = '') => `<div class="rl-kpi ${cl}"><b>${v}</b><span>${t}</span></div>`;
  const kpis = [];
  if (tipo !== 'previsao') kpis.push(kp(`${r.resumo.dias_trabalhados}<small>/${ut}</small>`, 'dias trabalhados'), kp(r.resumo.dias_parados, 'paradas por chuva', r.resumo.dias_parados ? 'chuva' : ''), kp(r.executado.length, 'etapas com produção'));
  if (tipo !== 'executado') kpis.push(kp(its.length, 'serviços projetados'), kp(risco, 'com risco de atraso', risco ? 'risco' : ''));
  if (tipo === 'previsao') kpis.push(kp(C.fimPrev ? fc(C.fimPrev) : '—', 'previsão cadastrada até'));
  const th = (t, c = '') => `<th class="${c}">${t}</th>`;
  const exec = r.executado.map(e => `<div class="rl-bloco rl-et"><div class="rl-et-t"><div><b>${esc(e.nome)}</b>${e.local ? `<small>${esc(e.local)}</small>` : ''}</div><span class="rl-pct">${pct(e.pct)}<small>acumulado</small></span></div>
      <table class="rl-t"><thead><tr>${th('Serviço')}${th('No período', 'n')}${th('Acumulado', 'n')}${th('Previsto', 'n')}${th('Avanço', 'bar')}</tr></thead><tbody>
      ${e.itens.map(i => `<tr><td>${esc(i.servico)}</td><td class="n"><b>${nf(i.periodo)}</b> ${esc(i.unidade)}</td><td class="n">${nf(i.acumulado)}</td><td class="n">${nf(i.previsto)}</td><td class="bar"><span class="rl-bar"><i style="width:${Math.min(100, i.pct)}%"></i></span><small>${pct(i.pct)}</small></td></tr>`).join('')}</tbody></table>
      ${e.equipes.length ? `<div class="rl-eq">${e.equipes.map(q => `<span>${esc(q.equipe)} · ${plural(q.pessoas, 'pessoa', 'pessoas')} · ${plural(q.dias, 'dia', 'dias')}</span>`).join('')}</div>` : ''}</div>`).join('');
  const inter = r.parados.map(x => `<div class="rl-li chuva"><b>${dsemC(x.data)} ${fc(x.data)}</b><span>Parado por chuva${x.mm ? ' · ' + nf(x.mm) + ' mm no horário de trabalho' : ''}</span></div>`)
    .concat(r.ocorrencias.map(x => `<div class="rl-li"><b>${dsemC(x.data)} ${fc(x.data)}</b><span>${esc(x.texto)}</span></div>`)).join('');
  const prev = r.previsto.map(e => `<div class="rl-bloco rl-et"><div class="rl-et-t"><div><b>${esc(e.nome)}</b>${e.local ? `<small>${esc(e.local)}</small>` : ''}</div></div>
      <table class="rl-t"><thead><tr>${th('Serviço')}${th('Saldo', 'n')}${th('Meta p/ cumprir o prazo', 'n')}${th('No ritmo atual', 'n')}${th('Término')}</tr></thead><tbody>
      ${e.itens.map(i => {
        const mudou = i.termino_original && i.termino_original !== i.termino;
        return `<tr><td>${esc(i.servico)}<br><span class="rl-sit ${i.situacao}">${SIT_REL[i.situacao] || ''}</span></td><td class="n">${nf(i.saldo)} ${esc(i.unidade)}</td>
          <td class="n">${i.meta === null ? '<span class="rl-venc">prazo vencido</span>' : `<b>${nf(i.meta)}</b> ${esc(i.unidade)}<small>${plural(i.dias_meta, 'dia útil', 'dias úteis')}</small>`}</td>
          <td class="n">${i.proj_periodo === null ? '—' : `${nf(i.proj_periodo)} ${esc(i.unidade)}<small>${nf(i.ritmo_atual)}/dia</small>`}</td>
          <td>${fd(i.termino)}${mudou ? `<small>original ${fd(i.termino_original)}</small>` : ''}${i.projecao && i.projecao !== i.termino ? `<small class="${i.situacao}">projetado ${fd(i.projecao)}</small>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>`).join('');
  const rep = r.reprogramacoes.map(x => `<div class="rl-li rep"><b>${fc(x.data)}</b><span><i>${esc(x.servico)}</i> · ${x.campo}: ${esc(fmtAlt(x.de))} → <b>${esc(fmtAlt(x.para))}</b>${x.motivo ? `<br><em>${esc(x.motivo)}</em>` : ''}</span></div>`).join('');
  const sec = (t, corpo, cl = '') => `<div class="rl-sec ${cl}"><div class="rl-sec-t">${t}</div>${corpo}</div>`;
  return `<div class="rl" id="relFolha">
    <div class="rl-top rl-cut"><div class="rl-logo"><img src="logo.png" alt="Size Engenharia"></div>
      <div class="rl-tit"><small>${esc(r.empresa)}</small><b>${REL_TITULO[tipo]}</b><span>${esc(r.obra.nome)}${r.obra.endereco ? ' · ' + esc(r.obra.endereco) : ''}</span></div>
      <div class="rl-per"><small>Período</small><b>${fc(r.de)} a ${fc(r.ate)}</b><span>${r.ate.slice(0, 4)}</span></div></div>
    <div class="rl-kpis rl-cut">${kpis.join('')}</div>
    ${REL.texto.trim() ? `<div class="rl-callout rl-cut"><div class="rl-sec-t sm">Resumo do período</div>${esc(REL.texto.trim()).replace(/\n/g, '<br>')}</div>` : ''}
    ${tipo !== 'previsao' ? sec('Executado no período', exec || '<p class="rl-vazio">Nenhuma produção registrada neste período.</p>') : ''}
    ${tipo !== 'previsao' && inter ? sec('Clima e ocorrências', `<div class="rl-bloco rl-lis">${inter}</div>`) : ''}
    ${tipo !== 'executado' ? sec(r.ate < h ? 'Previsão' : `Previsão de ${fc(r.prev_de)} a ${fc(r.ate)}`, r.ate < h ? '<p class="rl-vazio">O período escolhido já passou — não há o que projetar.</p>' : prev || '<p class="rl-vazio">Não há serviços previstos para este período.</p>') : ''}
    ${tipo !== 'executado' && rep ? sec('Reprogramações e justificativas', `<div class="rl-bloco rl-lis">${rep}</div>`) : ''}
    <div class="rl-nota rl-cut">${tipo !== 'executado' ? 'A projeção considera as quantidades e os prazos programados e o ritmo médio dos últimos 7 dias trabalhados; chuva e falta de insumos podem alterá-la. ' : ''}Documento emitido por ${esc(r.emissor)} em ${new Date().toLocaleString('pt-BR')}.</div></div>`;
}
function relPrevDesenhar() {
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
