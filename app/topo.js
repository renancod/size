'use strict';
/* =====================================================================
 * TOPOGRAFIA (fora de obra) · demandas do topógrafo em obra cadastrada ou "Outra", agenda automática pela produção,
 * lançamento do dia com fotos, croqui e arquivo usado (diário do topógrafo, separado do RDO da obra) e produção do mês.
 * Usa app.js (api, apiAgora, modal, view…) e exec.js (FILA da obra sem sinal, uid, dsem, addD).
 * ===================================================================== */
Object.assign(IC, {
  tripod: 'M12 2v3M8.5 5h7l-1.2 4.5H9.7zM10.6 9.5L6 22M13.4 9.5L18 22M12 9.5V22',
  alvo: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 1v5M12 18v5M1 12h5M18 12h5M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  estaca: 'M7 22V3l11 4.5L7 12M4 22h6',
  pin: 'M12 22s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  regua: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2'
});
const TP = { d: null, arq: {}, aba: 'abertas' };
const topoNivel = () => (S.sess && S.sess.usuario.topografia) || (admin() ? 'Gerir' : '');
const topoGere = () => topoNivel() === 'Gerir';
const TP_UN = { m: 'm', pt: 'pontos', un: 'un' }, TP_UNL = { m: 'Metros', pt: 'Pontos', un: 'Quantidade' };
const tpUn = (u, n) => u === 'pt' ? (n === 1 ? 'ponto' : 'pontos') : u === 'un' ? 'un' : 'm';
const tpQ = (q, u) => nf(q) + ' ' + tpUn(u, Number(q));
const TP_COR = { 'Marcação': 'mar', 'Conferência': 'con', 'Levantamento': 'lev', 'Nivelamento': 'niv', 'Locação': 'loc', 'Cadastro (as built)': 'cad', 'Outro': 'out' };
const TP_ST = { 'Agendada': 'ag', 'Em execução': 'ex', 'Concluída': 'ok', 'Cancelada': 'cn' };
const tpSt = s => `<span class="tp-st tp-st-${TP_ST[s] || 'ag'}">${esc(s)}</span>`;
const tpTit = d => [d.servico, d.local].filter(Boolean).join(' · ') || d.tipo;
const tpTag = t => `<span class="tp-tipo tp-c-${TP_COR[t] || 'out'}">${esc(t)}</span>`;
const TP_SERVICOS = ['Rede de água', 'Rede de esgoto', 'Drenagem pluvial', 'Rua / pavimento', 'Meio-fio', 'Lotes', 'Quadras', 'Edificação', 'Terraplenagem', 'Off-set', 'Curvas de nível', 'Divisa'];
const TP_MOTIVOS = ['Chuva', 'Frente não liberada', 'Outra demanda urgente', 'Equipamento', 'Falta projeto / arquivo'];
const fdc = s => { const d = new Date(s + 'T12:00'); return DSEM[d.getDay()].slice(0, 3) + ' ' + fd(s).slice(0, 5); };
const tpMes = (m, n) => { const d = new Date(m + '-15T12:00'); d.setMonth(d.getMonth() + n); return iso(d).slice(0, 7); };
const tpMesNome = m => new Date(m + '-15T12:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase());

async function topoCarregar(forcar) {
  if (forcar) agoraLimpar();
  TP.d = await apiAgora('topo_dados');
  LS.set('cs_topo', JSON.stringify(TP.d));
  contadores();
  return TP.d;
}
async function topoDados() {
  try { return await topoCarregar(); } catch (e) {
    const c = e.rede && LS.get('cs_topo');
    if (!c) throw e;
    TP.d = JSON.parse(c); TP.d.offline = true; return TP.d;
  }
}
/* pendências do menu: o topógrafo vê as dele de hoje e atrasadas; quem gere, as empurradas/atrasadas */
function contTopo(k) {
  if (!TP.d) return 0;
  const eu = S.sess.usuario.id, h = hoje();
  return TP.d.demandas.filter(d => ['Agendada', 'Em execução'].includes(d.status) && (topoGere() ? d.previsao && d.previsao.atrasada : d.topografo_id === eu && d.previsao && d.previsao.ini <= h)).length;
}
/* envia agora; sem sinal guarda na fila do aparelho (a mesma do diário de obra) e sobe sozinho depois */
async function topoEnviar(acao, dados) {
  try { return await api(acao, dados); } catch (e) {
    if (!e.rede || typeof FILA === 'undefined') throw e;
    await FILA.por({ id: uid(), acao, dados, obra: S.obraId || '', criado: Date.now() });
    await FILA.cfg().catch(() => {});
    try { const r = await navigator.serviceWorker?.ready; if (r && r.sync) await r.sync.register('size-fila'); } catch (x) { /* iPhone: envia ao abrir o app */ }
    if (typeof contarFila === 'function') contarFila();
    return { offline: true, msg: 'Sem sinal: guardado no aparelho. Envia sozinho quando a internet voltar.' };
  }
}
/* arquivo da topografia (anexo, foto, croqui): baixado uma vez e guardado na memória */
async function topoArq(id) {
  if (TP.arq[id]) return TP.arq[id];
  const a = await api('topo_arquivo', { id });
  const u = URL.createObjectURL(new Blob([Uint8Array.from(atob(a.b64), c => c.charCodeAt(0))], { type: a.mime }));
  return (TP.arq[id] = { url: u, nome: a.nome, mime: a.mime });
}
async function topoVer(id, lista) {
  modal('Arquivo', '<div class="carregando"><span class="spin"></span></div>', { semRodape: true, larga: true });
  try {
    const a = await topoArq(id), img = /^image\//.test(a.mime), i = lista ? lista.indexOf(id) : -1;
    $('#modal .mcorpo').innerHTML = `<div class="acoes">${i >= 0 && lista.length > 1 ? `<button type="button" class="btn sec peq" data-v="${i - 1}">${ic('left')}</button><small class="tp-vn">${i + 1} de ${lista.length}</small><button type="button" class="btn sec peq" data-v="${i + 1}">${ic('right')}</button>` : ''}
        <a class="btn peq" href="${a.url}" target="_blank" rel="noopener">Abrir</a><a class="btn sec peq" href="${a.url}" download="${esc(a.nome)}">${ic('download')} Baixar</a></div>
      <small>${esc(a.nome)}</small>${img ? `<img class="visor-img" src="${a.url}" alt="">` : /pdf/.test(a.mime) ? `<iframe class="visor" src="${a.url}"></iframe>` : '<p class="vazio">Arquivo de projeto: toque em Baixar para abrir no programa (CAD, planilha…).</p>'}`;
    $$('#modal [data-v]').forEach(b => { b.onclick = () => topoVer(lista[(+b.dataset.v + lista.length) % lista.length], lista); });
  } catch (e) { $('#modal .mcorpo').innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; }
}
/* miniaturas das fotos: carregam quando aparecem na tela */
function topoMinis(raiz) {
  const els = $$('[data-mini]', raiz);
  const carregar = async el => { el.removeAttribute('data-mini'); try { const a = await topoArq(el.dataset.id); if (/^image\//.test(a.mime)) el.style.backgroundImage = `url("${a.url}")`; el.classList.add('ok'); } catch (e) { el.classList.add('erro'); } };
  if (!('IntersectionObserver' in window)) return els.forEach(carregar);
  const io = new IntersectionObserver(l => l.forEach(x => { if (x.isIntersecting) { io.unobserve(x.target); carregar(x.target); } }), { rootMargin: '200px' });
  els.forEach(el => io.observe(el));
}
const tpFotos = (l, cl = '') => l.map(f => `<button type="button" class="tp-mini ${cl}" data-mini data-id="${esc(f.id)}" data-grupo title="${esc(f.nome)}">${ic('camera')}</button>`).join('');
function tpLigarArquivos(raiz) {
  $$('[data-arq]', raiz).forEach(b => { b.onclick = () => topoVer(b.dataset.arq); });
  $$('.tp-galeria', raiz).forEach(g => {
    const ids = $$('.tp-mini', g).map(x => x.dataset.id);
    $$('.tp-mini', g).forEach(b => { b.onclick = () => topoVer(b.dataset.id, ids); });
  });
  topoMinis(raiz);
}
const tpAnexo = a => `<button type="button" class="tp-anexo" data-arq="${esc(a.id)}">${ic(/^image\//.test(a.mime) ? 'camera' : /pdf/.test(a.mime) ? 'file' : 'regua')}<span>${esc(a.nome)}</span></button>`;
function tpBarra(d) {
  const p = Math.max(0, Math.min(100, Number(d.pct) || 0));
  return `<span class="tp-barra" title="${p.toLocaleString('pt-BR')}%"><i style="width:${p}%"></i></span>`;
}
const tpQtdTxt = d => d.qtd_prevista ? `${nf(d.qtd_feita)} de ${tpQ(d.qtd_prevista, d.unidade)}` : d.qtd_feita ? tpQ(d.qtd_feita, d.unidade) + ' feitos' : (d.dias_previstos ? plural(Number(d.dias_previstos), 'dia previsto', 'dias previstos') : 'sem quantidade');
function tpPrev(d) {
  const p = d.previsao;
  if (!p) return d.status === 'Concluída' ? `concluída ${fd(d.concluida_em)}` : '';
  const per = p.ini === p.fim ? fdc(p.ini) : fdc(p.ini) + ' → ' + fdc(p.fim);
  return `<span class="${p.atrasada ? 'atrasado' : p.empurrada ? 'tp-empur' : ''}">${ic('calendar')} ${per}${p.atrasada ? ' · atrasada' : p.empurrada ? ' · empurrada pela fila' : ''}</span>`;
}
/* cartão de uma demanda (listas, painel) */
function tpCartao(d, op = {}) {
  return `<a class="tp-card tp-b-${TP_COR[d.tipo] || 'out'} ${d.prioridade === 'Urgente' && d.status !== 'Concluída' ? 'tp-u' : ''}" href="#/topo/demanda/${enc(d.id)}">
    <span class="tp-card-h">${tpTag(d.tipo)}<code>${esc(d.id)}</code>${d.prioridade === 'Urgente' && ['Agendada', 'Em execução'].includes(d.status) ? '<span class="urg">URGENTE</span>' : ''}${tpSt(d.status)}</span>
    <b class="tp-card-t">${esc(tpTit(d))}</b>
    <small class="tp-card-o">${ic('building')} ${esc(d.obra_nome)}${d.cidade ? ' · ' + esc(d.cidade) : ''}${op.semTopo ? '' : ` · ${ic('user')} ${esc(d.topografo)}`}</small>
    <span class="tp-card-q">${tpBarra(d)}<small>${tpQtdTxt(d)}</small></span>
    <small class="tp-card-p">${tpPrev(d)}</small></a>`;
}
function tpHero(sub, tit, txt, nums, extra = '') {
  return `<div class="tp-hero"><div class="tp-hero-t"><span class="tp-selo">${ic('tripod')} ${sub}</span><h2>${tit}</h2>${txt ? `<p>${txt}</p>` : ''}${extra}</div>
    ${nums ? `<div class="tp-hero-n">${nums.map(([n, t, cl]) => `<div class="${cl || ''}"><b>${n}</b><small>${t}</small></div>`).join('')}</div>` : ''}
    <svg class="tp-hero-alvo" viewBox="0 0 24 24" aria-hidden="true"><path d="${IC.alvo}"/></svg></div>`;
}

/* =====================================================================
 * PAINEL
 * ===================================================================== */
async function vTopo() {
  titulo('Topografia');
  const D = await topoDados(), gere = topoGere(), h = hoje(), eu = S.sess.usuario.id;
  const ab = D.demandas.filter(d => ['Agendada', 'Em execução'].includes(d.status));
  const minhas = gere ? ab : ab.filter(d => d.topografo_id === eu);
  const deHoje = minhas.filter(d => d.previsao && d.previsao.ini <= h && d.previsao.fim >= h).concat(minhas.filter(d => d.previsao && d.previsao.fim < h));
  const atras = minhas.filter(d => d.previsao && (d.previsao.atrasada || d.previsao.empurrada));
  const prox = minhas.filter(d => d.previsao && d.previsao.ini > h).sort((a, b) => a.previsao.ini.localeCompare(b.previsao.ini));
  const mes = h.slice(0, 7), lm = D.lancamentos.filter(l => l.data.slice(0, 7) === mes && (gere || l.topografo_id === eu));
  const somaU = u => lm.filter(l => l.unidade === u).reduce((s, l) => s + l.qtd, 0);
  const lancHoje = D.lancamentos.filter(l => l.data === h && l.topografo_id === eu);
  const nome = esc(S.sess.usuario.nome.split(' ')[0]);
  const acoes = [
    gere && ['#/topo/nova', 'plus', 'Nova demanda', 'principal'],
    !gere && deHoje.length && ['#/topo/lancar/' + enc(deHoje[0].id), 'camera', 'Lançar o dia', 'principal'],
    ['#/topo/agenda', 'calendar', gere ? 'Agenda da equipe' : 'Minha agenda'],
    ['#/topo/demandas', 'list', 'Demandas'],
    ['#/topo/diarios', 'book', 'Diários do topógrafo'],
    ['#/topo/producao', 'chart', 'Produção']
  ].filter(Boolean);
  view(`<div class="tp">
    ${tpHero(gere ? 'Topografia · Size' : 'Topografia · ' + esc(S.sess.usuario.nome), gere ? 'Marcações, conferências e levantamentos' : `${empSaudacao()}, ${nome}!`,
      gere ? 'Abra a demanda, o topógrafo recebe no celular e a agenda se organiza pela produção dele.' : deHoje.length ? `Hoje você tem <b>${plural(deHoje.length, 'demanda', 'demandas')}</b>${lancHoje.length ? ' · já lançou ' + plural(lancHoje.length, 'vez', 'vezes') : ''}.` : 'Nada marcado para hoje na sua agenda.',
      [[ab.length && gere ? ab.length : minhas.length, 'abertas'], [deHoje.length, 'para hoje'], [atras.length, 'atrasadas ou empurradas', atras.length ? 'quente' : ''], [nf(somaU('m')), 'm no mês'], [nf(somaU('pt')), 'pontos no mês']])}
    ${D.offline ? '<div class="aviso warn">Sem sinal: mostrando o que estava guardado no aparelho. Os lançamentos ficam guardados e sobem quando o sinal voltar.</div>' : ''}
    ${typeof filaInfo === 'function' ? filaInfo() : ''}
    <div class="card emp-acoes"><div class="emp-ac">${acoes.map(([hr, i, t, cl]) => `<a class="emp-a tp-a ${cl || ''}" href="${hr}">${ic(i)}<span>${t}</span></a>`).join('')}</div></div>
    ${gere && !D.topografos.length ? `<div class="aviso warn">${ic('alert')} Nenhum topógrafo cadastrado. Em <a href="#/admin/usuarios">Usuários e acessos</a>, marque <b>Topografia: Topógrafo</b> no cadastro de cada um.</div>` : ''}
    ${gere ? tpEquipe(D) : ''}
    ${tpLocaisHtml(D)}
    <div class="tp-col2">
      <div class="card"><div class="bp-h"><h3>${ic('estaca')} Hoje · ${fdc(h)}</h3><a class="linkbtn" href="#/topo/agenda">Agenda</a></div>
        <div class="tp-cards">${deHoje.map(d => tpCartao(d, { semTopo: !gere })).join('') || '<p class="vazio">Nada para hoje.</p>'}</div></div>
      <div class="card"><div class="bp-h"><h3>${ic('calendar')} Próximos dias</h3><a class="linkbtn" href="#/topo/demandas">Todas</a></div>
        <div class="tp-cards">${prox.slice(0, 8).map(d => tpCartao(d, { semTopo: !gere })).join('') || '<p class="vazio">Nada agendado.</p>'}</div></div>
    </div></div>`);
  tpMapa(D);
}
/* equipe: ocupação dos próximos 10 dias úteis de cada topógrafo (agenda automática) */
function tpEquipe(D) {
  if (!D.topografos.length) return '';
  const dias = [];
  for (let d = hoje(); dias.length < 10; d = addD(d, 1)) if (![0, 6].includes(new Date(d + 'T12:00').getDay())) dias.push(d);
  return `<div class="card"><div class="bp-h"><h3>${ic('users')} Equipe · próximos 10 dias úteis</h3><small>quanto do dia já está ocupado</small></div>
    <div class="tp-eq">${D.topografos.map(t => {
      const oc = (D.ocupacao || {})[t.id] || {}, ab = D.demandas.filter(d => d.topografo_id === t.id && ['Agendada', 'Em execução'].includes(d.status));
      const livre = dias.find(d => (oc[d] || 0) < 0.999);
      return `<div class="tp-eq-l"><span class="tp-eq-n"><b>${esc(t.nome)}</b><small>${plural(ab.length, 'demanda aberta', 'demandas abertas')} · ${livre ? 'livre ' + (livre === hoje() ? 'hoje' : fdc(livre)) : 'cheio nos 10 dias'}</small></span>
        <span class="tp-eq-d">${dias.map(d => { const v = Math.min(1, oc[d] || 0); return `<i title="${fdc(d)} · ${Math.round(v * 100)}% ocupado" class="${v >= 0.999 ? 'cheio' : v > 0 ? 'parc' : ''}"><em style="height:${Math.round(v * 100)}%"></em><s>${fd(d).slice(0, 2)}</s></i>`; }).join('')}</span></div>`;
    }).join('')}</div></div>`;
}

/* =====================================================================
 * LISTA DE DEMANDAS
 * ===================================================================== */
const TP_FILTROS = {
  abertas: ['Abertas', d => ['Agendada', 'Em execução'].includes(d.status)], agendadas: ['Agendadas', d => d.status === 'Agendada'], execucao: ['Em execução', d => d.status === 'Em execução'],
  atrasadas: ['Atrasadas', d => d.previsao && (d.previsao.atrasada || d.previsao.empurrada)], concluidas: ['Concluídas', d => d.status === 'Concluída'], canceladas: ['Canceladas', d => d.status === 'Cancelada'], todas: ['Todas', () => true]
};
async function vTopoDemandas(qs) {
  titulo('Demandas da topografia');
  const D = await topoDados(), p = new URLSearchParams(qs || ''), gere = topoGere();
  if (p.get('s') && TP_FILTROS[p.get('s')]) TP.aba = p.get('s');
  view(`<div class="tp"><div class="cab"><h2>${ic('tripod')} Demandas</h2>${gere ? `<a class="btn tp-ac" href="#/topo/nova">${ic('plus')} Nova demanda</a>` : ''}</div>
    <div class="chips" id="tpAbas">${Object.entries(TP_FILTROS).map(([k, [t, f]]) => `<button type="button" class="chip ${TP.aba === k ? 'on' : ''}" data-k="${k}">${t}<b>${D.demandas.filter(f).length}</b></button>`).join('')}</div>
    <div class="tp-filtro"><div class="busca">${ic('search')}<input type="search" id="tpBusca" placeholder="Buscar rua, rede, obra, código…"></div>
      ${gere ? `<select id="tpQuem"><option value="">Todos os topógrafos</option>${D.topografos.map(t => `<option value="${esc(t.id)}">${esc(t.nome)}</option>`).join('')}</select>` : ''}</div>
    <div class="tp-cards grade" id="tpLst"></div></div>`);
  const desenhar = () => {
    const t = norm($('#tpBusca').value), quem = $('#tpQuem') ? $('#tpQuem').value : '';
    const l = D.demandas.filter(TP_FILTROS[TP.aba][1]).filter(d => (!quem || d.topografo_id === quem) && (!t || norm([d.id, d.tipo, d.servico, d.local, d.obra_nome, d.topografo, d.descricao].join(' ')).includes(t)))
      .sort((a, b) => String((a.previsao || {}).ini || a.data).localeCompare(String((b.previsao || {}).ini || b.data)) * (['concluidas', 'canceladas', 'todas'].includes(TP.aba) ? -1 : 1));
    $('#tpLst').innerHTML = l.map(d => tpCartao(d, { semTopo: !gere })).join('') || '<p class="vazio">Nenhuma demanda aqui.</p>';
  };
  $$('#tpAbas .chip').forEach(b => { b.onclick = () => { TP.aba = b.dataset.k; $$('#tpAbas .chip').forEach(x => x.classList.toggle('on', x === b)); desenhar(); }; });
  $('#tpBusca').oninput = desenhar;
  if ($('#tpQuem')) $('#tpQuem').onchange = desenhar;
  desenhar();
}

/* =====================================================================
 * DETALHE DA DEMANDA
 * ===================================================================== */
async function vTopoDemanda(id) {
  titulo('Demanda ' + id);
  const r = await api('topo_demanda', { id }), d = r.demanda, gere = topoGere(), eu = S.sess.usuario.id, minha = d.topografo_id === eu;
  const aberta = ['Agendada', 'Em execução'].includes(d.status), restante = d.qtd_prevista ? Math.max(0, d.qtd_prevista - d.qtd_feita) : 0;
  const p = d.previsao;
  view(`<div class="tp">
    <a class="linkbtn tp-volta" href="#/topo/demandas">${ic('back')} Demandas</a>
    <div class="tp-hero tp-hero-d tp-b-${TP_COR[d.tipo] || 'out'}"><div class="tp-hero-t">
      <span class="tp-selo">${ic('estaca')} ${esc(d.tipo)} · <code>${esc(d.id)}</code></span>
      <h2>${esc(tpTit(d))}</h2>
      <p>${ic('building')} ${esc(d.obra_nome)}${d.cidade ? ' · ' + esc(d.cidade) : ''}${d.obra_outra ? ' <small class="tp-outra">obra não cadastrada</small>' : ''}</p>
      <div class="tp-hero-st">${tpSt(d.status)}${d.prioridade === 'Urgente' && aberta ? '<span class="urg">URGENTE</span>' : ''}</div></div>
      <div class="tp-prog"><div class="tp-anel" style="--p:${d.pct}"><b>${Math.round(d.pct)}%</b></div><span><b>${tpQtdTxt(d)}</b><small>${restante ? 'faltam ' + tpQ(restante, d.unidade) : d.status === 'Concluída' ? 'concluída ' + fd(d.concluida_em) : ''}</small>
        <small>média ${tpQ(Math.round(r.media_dia * 10) / 10, d.unidade)}/dia</small></span></div>
      <svg class="tp-hero-alvo" viewBox="0 0 24 24" aria-hidden="true"><path d="${IC.alvo}"/></svg></div>
    <div class="acoes tp-acoes">
      ${aberta && (minha || gere) ? `<a class="btn tp-ac" href="#/topo/lancar/${enc(d.id)}">${ic('camera')} Lançar o dia</a>` : ''}
      ${aberta && (minha || gere) ? `<button type="button" class="btn sec" id="tpData">${ic('calendar')} Mudar a data</button>` : ''}
      ${gere && d.status !== 'Cancelada' ? `<a class="btn sec" href="#/topo/editar/${enc(d.id)}">${ic('edit')} Editar</a>` : ''}
      ${gere && aberta ? `<button type="button" class="btn sec" id="tpConcluir">${ic('check')} Concluir</button><button type="button" class="btn perigo" id="tpCancelar">Cancelar</button>` : ''}
      ${gere && !aberta ? `<button type="button" class="btn sec" id="tpReabrir">${ic('refresh')} Reabrir</button>` : ''}
    </div>
    <div class="tp-col2">
      <div class="card"><h3>${ic('alvo')} Execução</h3>
        <dl class="tp-dl">
          <dt>Topógrafo</dt><dd>${esc(d.topografo)}</dd>
          <dt>Data marcada</dt><dd>${fdc(d.data)}${p && p.ini !== d.data ? `<br><small>agenda: ${tpPrev(d)}</small>` : p ? `<br><small>${p.ini === p.fim ? '' : 'até ' + fdc(p.fim) + ' · '}~${nf(p.carga)} dia${p.carga > 1 ? 's' : ''} de trabalho</small>` : ''}</dd>
          <dt>Quantidade</dt><dd>${d.qtd_prevista ? tpQ(d.qtd_prevista, d.unidade) : d.dias_previstos ? plural(Number(d.dias_previstos), 'dia', 'dias') : '—'}</dd>
          <dt>Aberta por</dt><dd>${esc(d.criado_por)} <small>${fdh(d.criado_em)}</small></dd>
          ${d.arquivo_usado ? `<dt>Arquivo usado</dt><dd>${ic('regua')} ${esc(d.arquivo_usado)}</dd>` : ''}
          ${d.motivo && aberta ? `<dt>Última mudança de data</dt><dd>${esc(d.motivo)}</dd>` : ''}
        </dl>
        ${d.descricao ? `<div class="tp-desc">${esc(d.descricao).replace(/\n/g, '<br>')}</div>` : ''}
      </div>
      <div class="card"><h3>${ic('file')} Arquivos para usar</h3>
        <div class="tp-anexos">${d.anexos.map(tpAnexo).join('') || '<p class="vazio">Sem anexo: a execução segue a descrição.</p>'}</div></div>
    </div>
    <div class="card"><div class="bp-h"><h3>${ic('book')} Diário do topógrafo nesta demanda</h3><small>${plural(r.diarios.length, 'dia lançado', 'dias lançados')}</small></div>
      ${r.diarios.length ? `<div class="tp-tl">${r.diarios.map(x => tpLanc(x, d, gere || (minha && x.data === hoje()))).join('')}</div>` : '<p class="vazio">Nenhum dia lançado ainda.</p>'}</div>
    <details class="card tp-hist"><summary>${ic('clock')} Histórico (${r.historico.length})</summary>
      ${r.historico.map(h => `<div class="tp-h"><small>${esc(h.em)} · ${esc(h.por)}</small><b>${esc(h.acao)}</b>${h.det ? `<span>${esc(h.det)}</span>` : ''}</div>`).join('')}</details>
  </div>`);
  tpLigarArquivos($('#view'));
  const st = (op, tit, txt, campos = '') => modal(tit, `<p>${txt}</p>${campos}<label>Motivo / observação<textarea name="motivo" rows="2" ${op === 'cancelar' ? 'required minlength="4"' : ''}></textarea></label>`, {
    ok: tit, onOk: async f => { const x = await api('topo_status', { id, op, motivo: f.motivo.value, data: f.data ? f.data.value : '' }); toast(x.msg); vTopoDemanda(id); }
  });
  if ($('#tpData')) $('#tpData').onclick = () => tpMudarData(d);
  if ($('#tpCancelar')) $('#tpCancelar').onclick = () => st('cancelar', 'Cancelar demanda', 'A demanda sai da agenda do topógrafo.');
  if ($('#tpConcluir')) $('#tpConcluir').onclick = () => st('concluir', 'Concluir demanda', 'Marca como concluída sem lançamento do topógrafo (ex: feito por outro meio).');
  if ($('#tpReabrir')) $('#tpReabrir').onclick = () => st('reabrir', 'Reabrir demanda', 'Volta para a agenda do topógrafo.', `<label>Nova data <small>(opcional)</small><input type="date" name="data" min="${hoje()}"></label>`);
}
function tpLanc(x, d, editar) {
  return `<div class="tp-tl-i ${x.terminou ? 'fim' : ''}"><span class="tp-tl-dot">${ic(x.terminou ? 'check' : 'estaca')}</span><div class="tp-tl-c">
    <div class="tp-tl-h"><b>${fdc(x.data)}</b><span class="tp-tl-q">${tpQ(x.qtd, x.unidade)}</span>${x.terminou ? '<span class="tp-st tp-st-ok">terminou</span>' : ''}<small>${esc(x.topografo)}</small>
      ${editar ? `<a class="linkbtn" href="#/topo/lancar/${enc(d.id)}?l=${enc(x.id)}">${ic('edit')} corrigir</a>` : ''}</div>
    ${x.obs ? `<p>${esc(x.obs)}</p>` : ''}
    <div class="tp-galeria">${tpFotos(x.fotos)}${x.croquis.map(c => `<button type="button" class="tp-mini croqui" ${/^image\//.test(c.mime) ? 'data-mini' : ''} data-id="${esc(c.id)}" title="Croqui">${ic('regua')}<em>croqui</em></button>`).join('')}</div>
    ${x.arquivo_usado || x.arquivos.length ? `<small class="tp-usado">${ic('regua')} Arquivo usado: ${esc(x.arquivo_usado)}${x.arquivos.map(a => ` <button type="button" class="linkbtn" data-arq="${esc(a.id)}">${esc(a.nome)}</button>`).join('')}</small>` : ''}
    ${x.lat ? `<small><a class="linkbtn" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${x.lat}&mlon=${x.lng}#map=18/${x.lat}/${x.lng}">${ic('pin')} local do lançamento</a></small>` : ''}
  </div></div>`;
}
function tpMudarData(d) {
  const f = modal('Mudar a data', `<p><b>${esc(tpTit(d))}</b> está marcada para <b>${fdc(d.data)}</b>.</p>
    <label>Nova data<input type="date" name="data" required min="${hoje()}"></label>${datas('data')}
    <label>Por quê? <small>(obrigatório: ${esc(d.criado_por)} recebe o aviso)</small><textarea name="motivo" rows="2" required minlength="4" placeholder="Ex: chuva, frente não liberada"></textarea></label>
    <div class="chips">${TP_MOTIVOS.map(m => `<button type="button" class="chip" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div>`, {
    ok: 'Mudar a data', onOk: async f => { const r = await topoEnviar('topo_data', { id: d.id, data: f.data.value, motivo: f.motivo.value }); toast(r.msg); await topoCarregar(true).catch(() => {}); vTopoDemanda(d.id); }
  });
  $$('[data-m]', f).forEach(b => { b.onclick = () => { f.motivo.value = f.motivo.value ? f.motivo.value + '; ' + b.dataset.m : b.dataset.m; f.motivo.focus(); }; });
}

/* =====================================================================
 * NOVA DEMANDA / EDITAR
 * ===================================================================== */
async function vTopoNova(id) {
  titulo(id ? 'Editar demanda' : 'Nova demanda');
  if (!topoGere()) { view('<div class="aviso erro">Só quem gere a Topografia abre demandas.</div>'); return; }
  const D = await topoDados(), d = id ? (await api('topo_demanda', { id })).demanda : null;
  const outra = d && d.obra_outra, un = (d && d.unidade) || 'm';
  view(`<form class="tp tp-form" id="tpF">
    ${tpHero(id ? 'Editar · ' + esc(id) : 'Nova demanda', id ? esc(tpTit(d)) : 'O que o topógrafo vai fazer?', 'Ele recebe no celular assim que você salvar. Anexo é opcional.')}
    <div class="card tp-passo"><h3><span class="tp-n">1</span> Onde</h3>
      <label>Obra<select name="obra_id" required><option value="">Escolha…</option>${D.obras.map(o => `<option value="${esc(o.id)}" ${d && d.obra_id === o.id ? 'selected' : ''}>${esc(o.sigla ? o.sigla + ' · ' + o.nome : o.nome)}</option>`).join('')}
        <option value="outra" ${outra ? 'selected' : ''}>Outra (obra não cadastrada)…</option></select></label>
      <div class="g2" id="tpOutra" ${outra ? '' : 'hidden'}><label>Nome da obra<input name="obra_nome" value="${esc(outra ? d.obra_nome : '')}" placeholder="Ex: Loteamento Dunas"></label><label>Cidade <small>(opcional)</small><input name="cidade" value="${esc((d && d.cidade) || '')}"></label></div>
    </div>
    <div class="card tp-passo"><h3><span class="tp-n">2</span> O quê</h3>
      <div class="tp-tipos">${D.tipos.map(t => `<label class="tp-tipo-op tp-c-${TP_COR[t] || 'out'}"><input type="radio" name="tipo" value="${esc(t)}" ${(d ? d.tipo : 'Marcação') === t ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>
      <div class="g2"><label>Serviço<input name="servico" list="tpServ" value="${esc((d && d.servico) || '')}" placeholder="Ex: Rede de água"><datalist id="tpServ">${TP_SERVICOS.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
        <label>Local / trecho<input name="local" value="${esc((d && d.local) || '')}" placeholder="Ex: Rua 10, da esquina A até a B"></label></div>
      <label>Descrição da execução <small>(o que marcar, referências, cuidados)</small><textarea name="descricao" rows="3" placeholder="Ex: marcar eixo da rede DN 75 a cada 20 m com off-set de 1 m">${esc((d && d.descricao) || '')}</textarea></label>
    </div>
    <div class="card tp-passo"><h3><span class="tp-n">3</span> Quanto <small>(é o que calcula a agenda)</small></h3>
      <div class="seg tp-seg" id="tpUn">${Object.entries(TP_UNL).map(([k, t]) => `<button type="button" data-u="${k}" class="${un === k ? 'on' : ''}">${t}</button>`).join('')}</div><input type="hidden" name="unidade" value="${un}">
      <div class="g2"><label>Quantidade prevista <small id="tpUnT">(${TP_UN[un]})</small><input name="qtd_prevista" inputmode="decimal" value="${esc(d ? d.qtd_prevista : '')}" placeholder="Ex: 1200"></label>
        <label>ou dias de trabalho <small>(sem quantidade)</small><input name="dias_previstos" inputmode="decimal" value="${esc(d ? d.dias_previstos : '')}" placeholder="Ex: 2"></label></div>
    </div>
    <div class="card tp-passo"><h3><span class="tp-n">4</span> Quem e quando</h3>
      <label>Data da execução<input type="date" name="data" required value="${esc(d ? d.data : '')}" ${d ? '' : `min="${hoje()}"`}></label>${datas('data')}
      <div class="tp-quem" id="tpQuem">${D.topografos.length ? '' : '<div class="aviso warn">Nenhum topógrafo cadastrado ainda (Usuários e acessos → Topografia: Topógrafo).</div>'}</div>
      <input type="hidden" name="topografo_id" value="${esc(d ? d.topografo_id : 'auto')}">
      <label class="ck tp-urg"><input type="checkbox" name="urgente" ${d && d.prioridade === 'Urgente' ? 'checked' : ''}> <b>Urgente</b> · passa na frente na agenda do dia</label>
      ${d ? `<label>Motivo da mudança <small>(se mudar a data ou o topógrafo)</small><input name="motivo"></label>` : ''}
    </div>
    <div class="card tp-passo"><h3><span class="tp-n">5</span> Arquivo para usar <small>(opcional: projeto, DXF, planilha de pontos)</small></h3>
      ${d && d.anexos.length ? `<div class="tp-anexos">${d.anexos.map(a => `<label class="ck tp-anexo-x"><input type="checkbox" name="rem" value="${esc(a.id)}"> tirar <b>${esc(a.nome)}</b></label>`).join('')}</div>` : ''}
      <label class="tp-drop">${ic('upload')}<span><b>Escolher arquivos</b><small>PDF, DXF, DWG, imagem, CSV, TXT, planilha · até 10 MB cada</small></span><input type="file" name="anexos" multiple></label>
      <div id="tpAnx" class="tp-sel"></div>
    </div>
    <div class="tp-salvar"><a class="btn sec" href="${d ? '#/topo/demanda/' + enc(d.id) : '#/topo'}">Voltar</a><button class="btn tp-ac" type="submit">${ic('send')} ${d ? 'Salvar' : 'Abrir e avisar o topógrafo'}</button></div>
  </form>`);
  const f = $('#tpF');
  f.obra_id.onchange = () => { $('#tpOutra').hidden = f.obra_id.value !== 'outra'; f.obra_nome.required = f.obra_id.value === 'outra'; };
  f.obra_id.onchange();
  $$('#tpUn button').forEach(b => { b.onclick = () => { f.unidade.value = b.dataset.u; $$('#tpUn button').forEach(x => x.classList.toggle('on', x === b)); $('#tpUnT').textContent = '(' + TP_UN[b.dataset.u] + ')'; sugerir(); }; });
  f.anexos.onchange = () => { $('#tpAnx').innerHTML = [...f.anexos.files].map(x => `<span>${ic('file')} ${esc(x.name)} <small>${Math.round(x.size / 1024)} KB</small></span>`).join(''); };
  // sugestão da agenda: para cada topógrafo, o primeiro dia com folga e quantos dias leva pela média dele
  let tm, ultima = null;
  const desenharQuem = s => {
    const sel = f.topografo_id.value;
    $('#tpQuem').innerHTML = !D.topografos.length ? $('#tpQuem').innerHTML : `<div class="tp-op ${sel === 'auto' ? 'on' : ''}" data-t="auto"><span class="tp-op-i">${ic('alvo')}</span><span><b>Qualquer um</b><small>${s && s.melhor ? 'vai para ' + esc(s.melhor.nome) + ' · livre ' + (s.melhor.data === hoje() ? 'hoje' : fdc(s.melhor.data)) : 'o sistema escolhe quem está livre antes'}</small></span></div>` +
      D.topografos.map(t => { const x = s && s.sugestoes.find(z => z.id === t.id); return `<div class="tp-op ${sel === t.id ? 'on' : ''}" data-t="${esc(t.id)}"><span class="tp-op-i">${esc(t.nome.slice(0, 1))}</span><span><b>${esc(t.nome)}</b>
        <small>${x ? `livre ${x.data === hoje() ? 'hoje' : fdc(x.data)}${x.livre < 1 ? ' (meio dia)' : ''} · leva ~${nf(x.dias)} dia${x.dias > 1 ? 's' : ''} · ${plural(x.abertas, 'aberta', 'abertas')}` : '…'}</small></span>
        ${x && f.data.value && x.data > f.data.value ? `<em class="tp-op-w">${ic('alert')} ocupado em ${fd(f.data.value).slice(0, 5)}</em>` : ''}</div>`; }).join('');
    $$('#tpQuem .tp-op').forEach(o => { o.onclick = () => { f.topografo_id.value = o.dataset.t; desenharQuem(ultima); if (o.dataset.t === 'auto' && ultima && ultima.melhor && !d) f.data.value = f.data.value || ultima.melhor.data; }; });
  };
  const sugerir = () => {
    clearTimeout(tm);
    tm = setTimeout(async () => {
      try { ultima = await api('topo_sugerir', { tipo: (f.tipo.value || 'Marcação'), unidade: f.unidade.value, qtd: num(f.qtd_prevista.value), dias: num(f.dias_previstos.value), desde: f.data.value || hoje() }); } catch (e) { ultima = null; }
      desenharQuem(ultima);
    }, 350);
  };
  desenharQuem(null); sugerir();
  [f.qtd_prevista, f.dias_previstos, f.data].forEach(i => { i.addEventListener('change', sugerir); i.addEventListener('input', sugerir); });
  $$('input[name=tipo]', f).forEach(i => { i.onchange = sugerir; });
  f.onsubmit = async e => {
    e.preventDefault();
    const b = $('button[type=submit]', f), tx = b.innerHTML;
    b.disabled = true; b.textContent = 'Enviando…';
    try {
      const anexos = [];
      for (const x of f.anexos.files) anexos.push(await tpLer(x));
      const r = await api('topo_salvar', {
        demanda: { id: d && d.id, obra_id: f.obra_id.value, obra_nome: f.obra_nome.value, cidade: f.cidade.value, tipo: (f.tipo.value || ''), servico: f.servico.value, local: f.local.value, descricao: f.descricao.value,
          unidade: f.unidade.value, qtd_prevista: num(f.qtd_prevista.value), dias_previstos: num(f.dias_previstos.value), data: f.data.value, topografo_id: f.topografo_id.value, prioridade: f.urgente.checked ? 'Urgente' : 'Normal', motivo: f.motivo ? f.motivo.value : '' },
        anexos, remover: $$('input[name=rem]:checked', f).map(x => x.value)
      });
      toast(r.msg);
      await topoCarregar(true).catch(() => {});
      location.hash = '#/topo/demanda/' + enc(r.id);
    } catch (x) { toast(x.message, 1); b.disabled = false; b.innerHTML = tx; }
  };
}
/* arquivo para enviar: fotos grandes do celular são reduzidas */
async function tpLer(f) {
  if (/^image\//i.test(f.type) && !/gif/i.test(f.type) && f.size > 600000) {
    const b = await reduzirFoto(f);
    if (b) return { nome: f.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', b64: b };
  }
  if (f.size > 10 * 1024 * 1024) throw new Error('Arquivo maior que 10 MB: ' + f.name);
  const ext = (f.name.match(/\.(\w+)$/) || [])[1] || '';
  const mime = f.type || ({ dxf: 'application/dxf', dwg: 'application/acad', csv: 'text/csv', txt: 'text/plain' }[ext.toLowerCase()] || 'application/octet-stream');
  return { nome: f.name, mime, b64: await paraB64(f) };
}

/* =====================================================================
 * LANÇAR O DIA (diário do topógrafo)
 * ===================================================================== */
async function vTopoLancar(id, qs) {
  titulo('Lançar o dia');
  const lid = new URLSearchParams(qs || '').get('l');
  let r;
  try { r = await api('topo_demanda', { id }); } catch (e) {
    // sem sinal: usa a demanda guardada (sem os lançamentos anteriores)
    const c = e.rede && TP.d && TP.d.demandas.find(x => x.id === id);
    if (!c) throw e;
    r = { demanda: c, diarios: [], media_dia: 0, offline: true };
  }
  const d = r.demanda, x = lid ? r.diarios.find(z => z.id === lid) : null, fmin = (TP.d && TP.d.fotos_min) || 2;
  const resta = d.qtd_prevista ? Math.max(0, d.qtd_prevista - d.qtd_feita + (x ? x.qtd : 0)) : 0, jaCroqui = r.diarios.some(z => z.croquis.length && z !== x);
  const novas = { fotos: [], croquis: [], arquivos: [] }, tirar = new Set();
  view(`<form class="tp tp-form tp-lanc" id="tpL">
    <a class="linkbtn tp-volta" href="#/topo/demanda/${enc(d.id)}">${ic('back')} ${esc(d.id)}</a>
    <div class="tp-lanc-h tp-b-${TP_COR[d.tipo] || 'out'}">${tpTag(d.tipo)}<b>${esc(tpTit(d))}</b><small>${ic('building')} ${esc(d.obra_nome)}</small>
      <span class="tp-card-q">${tpBarra(d)}<small>${tpQtdTxt(d)}${resta ? ' · faltam ' + tpQ(resta, d.unidade) : ''}</small></span></div>
    ${r.offline ? '<div class="aviso warn">Sem sinal: o lançamento fica guardado no aparelho e sobe quando a internet voltar.</div>' : ''}
    <div class="card tp-passo"><h3><span class="tp-n">1</span> Quanto você fez ${x ? 'nesse dia' : 'hoje'}?</h3>
      <div class="g2"><label>Data<input type="date" name="data" required max="${hoje()}" value="${esc(x ? x.data : hoje())}" ${x ? 'readonly' : ''}></label>
        <label>Quantidade <small>(${TP_UN[d.unidade]})</small><span class="tp-qtd"><input name="qtd" inputmode="decimal" required value="${x ? esc(String(x.qtd).replace('.', ',')) : ''}" placeholder="0"><em>${TP_UN[d.unidade]}</em></span></label></div>
      ${resta ? `<button type="button" class="chip" id="tpTudo">Fiz o restante: ${tpQ(resta, d.unidade)}</button>` : ''}
      <h4>Terminou a demanda?</h4>
      <div class="seg tp-seg2" id="tpFim"><button type="button" data-f="0" class="${x && x.terminou ? '' : 'on'}">Não, continua</button><button type="button" data-f="1" class="${x && x.terminou ? 'on' : ''}">${ic('check')} Sim, terminei</button></div>
      <input type="hidden" name="terminou" value="${x && x.terminou ? '1' : '0'}">
    </div>
    <div class="card tp-passo"><h3><span class="tp-n">2</span> Fotos do serviço <small id="tpFc"></small></h3>
      <div class="tp-fotos" id="tpFotos"></div>
      <div class="acoes"><label class="btn tp-ac">${ic('camera')} Tirar foto<input type="file" accept="image/*" capture="environment" data-k="fotos" hidden></label>
        <label class="btn sec">${ic('upload')} Da galeria<input type="file" accept="image/*" multiple data-k="fotos" hidden></label></div>
    </div>
    <div class="card tp-passo" id="tpPassoFim"><h3><span class="tp-n">3</span> Croqui e arquivo usado <small id="tpReq"></small></h3>
      <h4>Croqui da marcação</h4><div class="tp-fotos" id="tpCroquis"></div>
      <div class="acoes"><label class="btn sec">${ic('camera')} Foto do croqui<input type="file" accept="image/*" capture="environment" data-k="croquis" hidden></label>
        <label class="btn sec">${ic('file')} PDF / imagem<input type="file" accept="application/pdf,image/*" multiple data-k="croquis" hidden></label></div>
      ${jaCroqui ? '<small class="ok">Já tem croqui em outro dia desta demanda.</small>' : ''}
      <h4>Qual arquivo você usou?</h4>
      <div class="tp-usou">${d.anexos.map(a => `<label class="tp-op"><input type="radio" name="usou" value="${esc('Anexo da demanda: ' + a.nome)}"><span class="tp-op-i">${ic('regua')}</span><span><b>${esc(a.nome)}</b><small>anexo da demanda</small></span></label>`).join('')}
        <label class="tp-op"><input type="radio" name="usou" value="outro"><span class="tp-op-i">${ic('tripod')}</span><span><b>Outro arquivo</b><small>do equipamento ou enviado agora</small></span></label></div>
      <div id="tpOutro" hidden><label>Nome do arquivo <small>(como está no equipamento / no computador)</small><input name="arq_nome" placeholder="Ex: RUA10_AGUA_REV02.dxf"></label>
        <label class="btn sec peq">${ic('upload')} Enviar o arquivo<input type="file" multiple data-k="arquivos" hidden></label><div class="tp-sel" id="tpArqs"></div></div>
    </div>
    <div class="card tp-passo"><h3><span class="tp-n">4</span> Observações <small>(opcional)</small></h3>
      <textarea name="obs" rows="3" placeholder="Ex: falta marcar o trecho da esquina, aguardando liberação">${esc(x ? x.obs : '')}</textarea>
      <label class="ck"><input type="checkbox" name="gps" ${x && x.lat ? 'checked' : ''}> ${ic('pin')} Guardar a localização deste lançamento</label></div>
    <div class="tp-salvar"><a class="btn sec" href="#/topo/demanda/${enc(d.id)}">Voltar</a><button class="btn tp-ac" type="submit">${ic('send')} ${x ? 'Salvar correção' : 'Enviar lançamento'}</button></div>
  </form>`);
  const f = $('#tpL');
  const terminou = () => f.terminou.value === '1';
  const usado = () => { const u = $('input[name=usou]:checked', f); return !u ? '' : u.value === 'outro' ? f.arq_nome.value.trim() : u.value; };
  // usado antes: marca o que já estava
  if (x && x.arquivo_usado) { const op = $$('input[name=usou]', f).find(i => i.value === x.arquivo_usado); if (op) op.checked = true; else { $('input[name=usou][value=outro]', f).checked = true; f.arq_nome.value = x.arquivo_usado; } }
  const prevs = (k, el) => {
    const velhos = x ? x[k].filter(a => !tirar.has(a.id)) : [];
    el.innerHTML = velhos.map(a => `<span class="tp-prev"><button type="button" class="tp-mini" data-mini data-id="${esc(a.id)}">${ic('camera')}</button><button type="button" class="tp-x" data-tirar="${esc(a.id)}" aria-label="Tirar">${ic('x')}</button></span>`).join('') +
      novas[k].map((a, i) => `<span class="tp-prev"><span class="tp-mini ok" ${/^image\//.test(a.mime) ? `style="background-image:url('data:${a.mime};base64,${a.b64}')"` : ''}>${/^image\//.test(a.mime) ? '' : ic('file') + `<em>${esc(a.nome.slice(0, 14))}</em>`}</span><button type="button" class="tp-x" data-nova="${k}|${i}" aria-label="Tirar">${ic('x')}</button></span>`).join('');
    $$('[data-tirar]', el).forEach(b => { b.onclick = () => { tirar.add(b.dataset.tirar); desenhar(); }; });
    $$('[data-nova]', el).forEach(b => { b.onclick = () => { const [kk, i] = b.dataset.nova.split('|'); novas[kk].splice(+i, 1); desenhar(); }; });
    topoMinis(el);
    return velhos.length + novas[k].length;
  };
  const desenhar = () => {
    const nf_ = prevs('fotos', $('#tpFotos')), nc = prevs('croquis', $('#tpCroquis'));
    $('#tpArqs').innerHTML = novas.arquivos.map((a, i) => `<span>${ic('file')} ${esc(a.nome)} <button type="button" class="linkbtn" data-na="${i}">tirar</button></span>`).join('');
    $$('[data-na]', f).forEach(b => { b.onclick = () => { novas.arquivos.splice(+b.dataset.na, 1); desenhar(); }; });
    $('#tpFc').innerHTML = nf_ >= fmin ? `<span class="ok">${ic('check')} ${nf_} fotos</span>` : `<span class="atrasado">${nf_} de no mínimo ${fmin}</span>`;
    const pronto = (nc || jaCroqui) && (usado() || novas.arquivos.length || d.arquivo_usado);
    $('#tpReq').innerHTML = !terminou() ? '(quando terminar)' : pronto ? `<span class="ok">${ic('check')} completo</span>` : '<span class="atrasado">obrigatório para terminar</span>';
    $('#tpPassoFim').classList.toggle('tp-req', terminou() && !(nc || jaCroqui));
    $('#tpOutro').hidden = !($('input[name=usou]:checked', f) && $('input[name=usou]:checked', f).value === 'outro');
  };
  $$('input[type=file][data-k]', f).forEach(i => {
    i.onchange = async () => {
      try { for (const fl of i.files) novas[i.dataset.k].push(await tpLer(fl)); } catch (e) { toast(e.message, 1); }
      i.value = ''; desenhar();
    };
  });
  $$('input[name=usou]', f).forEach(i => { i.onchange = desenhar; });
  $$('#tpFim button').forEach(b => { b.onclick = () => { f.terminou.value = b.dataset.f; $$('#tpFim button').forEach(z => z.classList.toggle('on', z === b)); desenhar(); }; });
  if ($('#tpTudo')) $('#tpTudo').onclick = () => { f.qtd.value = String(resta).replace('.', ','); $$('#tpFim button')[1].click(); };
  desenhar();
  const local = () => new Promise(ok => { if (!f.gps.checked || !navigator.geolocation) return ok(null); navigator.geolocation.getCurrentPosition(p => ok(p.coords), () => ok(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 }); });
  f.onsubmit = async e => {
    e.preventDefault();
    const nFotos = (x ? x.fotos.filter(a => !tirar.has(a.id)).length : 0) + novas.fotos.length;
    if (nFotos < fmin) return toast(`Mande pelo menos ${fmin} fotos do serviço.`, 1);
    if (terminou()) {
      const nCroq = (x ? x.croquis.filter(a => !tirar.has(a.id)).length : 0) + novas.croquis.length;
      if (!nCroq && !jaCroqui) return toast('Para terminar, anexe o croqui da marcação.', 1);
      if (!usado() && !novas.arquivos.length && !d.arquivo_usado) return toast('Para terminar, diga qual arquivo você usou.', 1);
    }
    const b = $('button[type=submit]', f), tx = b.innerHTML;
    b.disabled = true; b.textContent = 'Enviando…';
    try {
      const c = await local();
      const res = await topoEnviar('topo_lancar', { demanda: d.id, id: x ? x.id : '', data: f.data.value, qtd: num(f.qtd.value), terminou: terminou(), obs: f.obs.value, arquivo_usado: usado(),
        fotos: novas.fotos, croquis: novas.croquis, arquivos: novas.arquivos, remover: [...tirar], lat: c ? c.latitude : '', lng: c ? c.longitude : '' });
      toast(res.msg);
      await topoCarregar(true).catch(() => {});
      location.hash = res.offline ? '#/topo' : '#/topo/demanda/' + enc(d.id);
    } catch (x2) { toast(x2.message, 1); b.disabled = false; b.innerHTML = tx; }
  };
}

/* =====================================================================
 * AGENDA (semana): dias × topógrafos, montada pela agenda automática
 * ===================================================================== */
async function vTopoAgenda(qs) {
  titulo('Agenda da topografia');
  const D = await topoDados(), gere = topoGere(), p = new URLSearchParams(qs || '');
  const seg = s => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
  const ini = seg(p.get('w') || hoje()), dias = [0, 1, 2, 3, 4].map(n => addD(ini, n));
  const tops = gere ? D.topografos : D.topografos.filter(t => t.id === S.sess.usuario.id).concat(D.topografos.some(t => t.id === S.sess.usuario.id) ? [] : [{ id: S.sess.usuario.id, nome: S.sess.usuario.nome }]);
  const ab = D.demandas.filter(d => d.previsao && ['Agendada', 'Em execução'].includes(d.status));
  const noDia = (t, s) => ab.filter(d => d.topografo_id === t && d.previsao.ini <= s && d.previsao.fim >= s)
    .sort((a, b) => a.previsao.ini.localeCompare(b.previsao.ini) || (b.prioridade === 'Urgente') - (a.prioridade === 'Urgente'));
  const feitoDia = (t, s) => D.lancamentos.filter(l => l.topografo_id === t && l.data === s);
  const bloco = (d, s) => `<a class="tp-bl tp-b-${TP_COR[d.tipo] || 'out'} ${d.prioridade === 'Urgente' ? 'tp-u' : ''} ${d.previsao.atrasada ? 'atr' : ''}" href="#/topo/demanda/${enc(d.id)}" title="${esc(d.id + ' · ' + tpTit(d))}">
    <b>${esc(tpTit(d))}</b><small>${esc(d.obra_nome)}${d.previsao.ini !== d.previsao.fim ? ` · dia ${dias.indexOf(s) >= 0 ? tpDiaN(d, s) : ''}` : ''}</small></a>`;
  view(`<div class="tp">
    <div class="cab"><h2>${ic('calendar')} ${gere ? 'Agenda da equipe' : 'Minha agenda'}</h2>
      <div class="acoes"><a class="btn sec peq" href="#/topo/agenda?w=${addD(ini, -7)}">${ic('left')}</a><a class="btn sec peq" href="#/topo/agenda">Hoje</a><a class="btn sec peq" href="#/topo/agenda?w=${addD(ini, 7)}">${ic('right')}</a></div></div>
    <p class="tp-sub">Semana de ${fd(dias[0])} a ${fd(dias[4])} · a agenda se arruma sozinha pela produção média de cada topógrafo: quando uma demanda atrasa, as próximas andam junto.</p>
    <div class="tp-ag" style="--n:${tops.length || 1}">
      <div class="tp-ag-c"></div>${tops.map(t => `<div class="tp-ag-c tp-ag-t">${ic('user')} ${esc(t.nome)}</div>`).join('')}
      ${dias.map(s => `<div class="tp-ag-d ${s === hoje() ? 'hoje' : ''}"><b>${DSEM[new Date(s + 'T12:00').getDay()]}</b><small>${fd(s).slice(0, 5)}</small></div>
        ${tops.map(t => { const l = noDia(t.id, s), oc = ((D.ocupacao || {})[t.id] || {})[s] || 0, fe = feitoDia(t.id, s);
          return `<div class="tp-ag-x ${s === hoje() ? 'hoje' : ''}" data-dia="${fdc(s)}" data-t="${esc(t.nome)}">${l.map(d => bloco(d, s)).join('')}
            ${fe.length ? `<small class="tp-ag-f">${ic('check')} lançado: ${fe.map(x => tpQ(x.qtd, x.unidade)).join(' + ')}</small>` : ''}
            ${!l.length && !fe.length ? `<small class="tp-ag-v">${s < hoje() ? '—' : 'livre'}</small>` : oc > 0 && oc < 0.999 && s >= hoje() ? `<small class="tp-ag-v">${Math.round((1 - oc) * 100)}% livre</small>` : ''}</div>`; }).join('')}`).join('')}
    </div>
    <div class="tp-leg">${Object.entries(TP_COR).map(([t, c]) => `<span><i class="tp-b-${c}"></i>${esc(t)}</span>`).join('')}<span><i class="tp-u"></i>urgente</span></div>
  </div>`);
}
/* em qual dia (1, 2, 3…) da demanda cai a data s */
function tpDiaN(d, s) {
  let n = 0;
  for (let x = d.previsao.ini; x <= s; x = addD(x, 1)) if (![0, 6].includes(new Date(x + 'T12:00').getDay())) n++;
  return n;
}

/* =====================================================================
 * DIÁRIOS DO TOPÓGRAFO (separados do RDO da obra)
 * ===================================================================== */
async function vTopoDiarios(qs) {
  titulo('Diários do topógrafo');
  const p = new URLSearchParams(qs || ''), mes = p.get('m') || hoje().slice(0, 7), gere = topoGere();
  const [D, R] = await Promise.all([topoDados(), api('topo_diarios', { mes })]);
  const L = R.diarios, obras = [...new Set(L.map(x => x.obra_nome))].sort();
  view(`<div class="tp">
    <div class="cab"><h2>${ic('book')} Diários do topógrafo</h2>
      <div class="acoes"><a class="btn sec peq" href="#/topo/diarios?m=${tpMes(mes, -1)}">${ic('left')}</a><b class="tp-mes">${tpMesNome(mes)}</b><a class="btn sec peq" href="#/topo/diarios?m=${tpMes(mes, 1)}">${ic('right')}</a></div></div>
    <p class="tp-sub">Cada dia de trabalho do topógrafo: o que fez, quanto, fotos, croqui e o arquivo usado. Fica aqui, separado do diário de obra (RDO).</p>
    <div class="tp-filtro">${gere ? `<select id="tdQuem"><option value="">Todos os topógrafos</option>${D.topografos.map(t => `<option value="${esc(t.id)}">${esc(t.nome)}</option>`).join('')}</select>` : ''}
      <select id="tdObra"><option value="">Todas as obras</option>${obras.map(o => `<option>${esc(o)}</option>`).join('')}</select></div>
    <div id="tdLst"></div></div>`);
  const desenhar = () => {
    const q = $('#tdQuem') ? $('#tdQuem').value : '', o = $('#tdObra').value;
    const l = L.filter(x => (!q || x.topografo_id === q) && (!o || x.obra_nome === o)), dias = [...new Set(l.map(x => x.data))];
    $('#tdLst').innerHTML = dias.map(s => {
      const xs = l.filter(x => x.data === s);
      return `<div class="card tp-dia"><div class="tp-dia-h"><span class="tp-dia-n"><b>${fd(s).slice(0, 2)}</b><small>${DSEM[new Date(s + 'T12:00').getDay()].slice(0, 3)}</small></span>
        <span><b>${fdc(s)}</b><small>${plural(xs.length, 'lançamento', 'lançamentos')} · ${['m', 'pt', 'un'].map(u => { const t = xs.filter(x => x.unidade === u).reduce((a, x) => a + x.qtd, 0); return t ? tpQ(t, u) : ''; }).filter(Boolean).join(' · ')}</small></span></div>
        ${xs.map(x => `<button type="button" class="tp-di" data-d="${esc(x.id)}"><span class="tp-di-t">${tpTag(x.tipo)}<b>${esc([x.servico, x.local].filter(Boolean).join(' · '))}</b><small>${esc(x.obra_nome)} · ${esc(x.topografo)} · <code>${esc(x.demanda)}</code></small></span>
          <span class="tp-di-q"><b>${tpQ(x.qtd, x.unidade)}</b><small>${ic('camera')} ${x.fotos.length}${x.croquis.length ? ' · croqui' : ''}${x.terminou ? ' · <span class="ok">terminou</span>' : ''}</small></span></button>`).join('')}</div>`;
    }).join('') || `<p class="vazio">Nenhum lançamento em ${tpMesNome(mes).toLowerCase()}.</p>`;
    $$('#tdLst [data-d]').forEach(b => { b.onclick = () => tpDiarioModal(L.find(x => x.id === b.dataset.d)); });
  };
  if ($('#tdQuem')) $('#tdQuem').onchange = desenhar;
  $('#tdObra').onchange = desenhar;
  desenhar();
}
function tpDiarioModal(x) {
  modal(`Diário · ${fdc(x.data)}`, `<div class="tp">
    <div class="tp-lanc-h tp-b-${TP_COR[x.tipo] || 'out'}">${tpTag(x.tipo)}<b>${esc([x.servico, x.local].filter(Boolean).join(' · '))}</b><small>${ic('building')} ${esc(x.obra_nome)} · ${ic('user')} ${esc(x.topografo)}</small></div>
    <dl class="tp-dl"><dt>Feito no dia</dt><dd><b>${tpQ(x.qtd, x.unidade)}</b>${x.terminou ? ' · <span class="tp-st tp-st-ok">terminou a demanda</span>' : ''}</dd>
      <dt>Demanda</dt><dd><a href="#/topo/demanda/${enc(x.demanda)}">${esc(x.demanda)}</a></dd>
      ${x.arquivo_usado || x.arquivos.length ? `<dt>Arquivo usado</dt><dd>${esc(x.arquivo_usado)}${x.arquivos.map(a => ` <button type="button" class="linkbtn" data-arq="${esc(a.id)}">${esc(a.nome)}</button>`).join('')}</dd>` : ''}
      ${x.obs ? `<dt>Observações</dt><dd>${esc(x.obs)}</dd>` : ''}
      <dt>Lançado</dt><dd>${fdh(x.criado_em)}${x.atualizado_em !== x.criado_em ? ' · corrigido ' + fdh(x.atualizado_em) : ''}${x.lat ? ` · <a target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${x.lat}&mlon=${x.lng}#map=18/${x.lat}/${x.lng}">${ic('pin')} local</a>` : ''}</dd></dl>
    <h4>Fotos</h4><div class="tp-galeria">${tpFotos(x.fotos, 'grande')}</div>
    ${x.croquis.length ? `<h4>Croqui</h4><div class="tp-galeria">${x.croquis.map(c => `<button type="button" class="tp-mini grande croqui" ${/^image\//.test(c.mime) ? 'data-mini' : ''} data-id="${esc(c.id)}">${ic('regua')}<em>croqui</em></button>`).join('')}</div>` : ''}</div>`, { semRodape: true, larga: true });
  tpLigarArquivos($('#modal'));
}

/* =====================================================================
 * PRODUÇÃO DO MÊS
 * ===================================================================== */
async function vTopoProducao(qs) {
  titulo('Produção da topografia');
  const p = new URLSearchParams(qs || ''), mes = p.get('m') || hoje().slice(0, 7);
  const [D, R] = await Promise.all([topoDados(), api('topo_producao', { mes })]);
  const nome = id => (D.topografos.find(t => t.id === id) || {}).nome || '—';
  // dias do mês (gráfico de barras por dia, em metros e pontos)
  const ultimo = new Date(+mes.slice(0, 4), +mes.slice(5, 7), 0).getDate(), dias = Array.from({ length: ultimo }, (_, i) => mes + '-' + String(i + 1).padStart(2, '0'));
  const grafico = (t, u) => {
    const v = dias.map(s => R.serie.filter(x => x.data === s && x.topografo_id === t && x.unidade === u).reduce((a, x) => a + x.qtd, 0)), mx = Math.max(...v, 1);
    if (!v.some(Boolean)) return '';
    return `<div class="tp-graf"><small>${TP_UNL[u]} por dia</small><div class="tp-graf-b">${v.map((q, i) => `<i title="${fd(dias[i])}: ${tpQ(q, u)}" class="${[0, 6].includes(new Date(dias[i] + 'T12:00').getDay()) ? 'fds' : ''}"><em style="height:${Math.round(q / mx * 100)}%"></em></i>`).join('')}</div>
      <div class="tp-graf-x"><span>1</span><span>${Math.ceil(ultimo / 2)}</span><span>${ultimo}</span></div></div>`;
  };
  const tot = u => R.topografos.reduce((s, t) => s + t.un[u], 0);
  view(`<div class="tp">
    <div class="cab"><h2>${ic('chart')} Produção</h2>
      <div class="acoes"><a class="btn sec peq" href="#/topo/producao?m=${tpMes(mes, -1)}">${ic('left')}</a><b class="tp-mes">${tpMesNome(mes)}</b><a class="btn sec peq" href="#/topo/producao?m=${tpMes(mes, 1)}">${ic('right')}</a></div></div>
    <div class="bp-tiles tp-tiles"><div class="bp-tile"><b>${nf(tot('m'))}</b><span>metros</span></div><div class="bp-tile"><b>${nf(tot('pt'))}</b><span>pontos</span></div><div class="bp-tile"><b>${nf(tot('un'))}</b><span>unidades</span></div>
      <div class="bp-tile ok"><b>${R.topografos.reduce((s, t) => s + t.concluidas, 0)}</b><span>demandas concluídas</span></div><div class="bp-tile atu"><b>${R.abertas}</b><span>abertas agora</span></div></div>
    ${R.topografos.map(t => `<div class="card tp-prod"><div class="bp-h"><h3>${ic('user')} ${esc(t.nome)}</h3><small>${plural(t.dias, 'dia trabalhado', 'dias trabalhados')} · ${plural(t.fotos, 'foto', 'fotos')}</small></div>
      <div class="bp-tiles tp-tiles">${['m', 'pt', 'un'].filter(u => t.un[u]).map(u => `<div class="bp-tile"><b>${nf(t.un[u])}</b><span>${TP_UNL[u].toLowerCase()}</span><small>${t.dias ? 'média ' + tpQ(Math.round(t.un[u] / t.dias * 10) / 10, u) + '/dia' : ''}</small></div>`).join('')}
        <div class="bp-tile ok"><b>${t.concluidas}</b><span>concluídas</span><small>${t.concluidas ? Math.round(t.no_prazo / t.concluidas * 100) + '% sem mudar a data' : ''}</small></div></div>
      ${grafico(t.id, 'm')}${grafico(t.id, 'pt')}
      <div class="tp-col2"><div><h4>Por tipo</h4><table class="tp-tab">${t.tipos.map(x => `<tr><td>${tpTag(x.tipo)}</td><td class="n">${tpQ(x.qtd, x.unidade)}</td></tr>`).join('')}</table></div>
        <div><h4>Por obra</h4><table class="tp-tab">${t.obras.map(o => `<tr><td>${esc(o.obra)}</td><td class="n">${['m', 'pt', 'un'].filter(u => o[u]).map(u => tpQ(o[u], u)).join(' · ')}</td></tr>`).join('')}</table></div></div>
    </div>`).join('') || `<p class="vazio card">Nenhum lançamento em ${tpMesNome(mes).toLowerCase()}.</p>`}
    <details class="card"><summary>${ic('sliders')} Média usada pela agenda automática</summary>
      <p class="tp-sub">Com 3 ou mais dias lançados vale a média real do topógrafo naquele tipo de serviço; antes disso vale o padrão: ${Object.entries(R.padrao).map(([u, v]) => tpQ(v, u) + '/dia').join(' · ')} (Configurações → TOPO_PRODUTIVIDADE).</p>
      <table class="tp-tab"><tr><th>Topógrafo</th><th>Tipo</th><th class="n">Média/dia</th><th class="n">Dias</th></tr>${R.produtividade.filter(x => x.topografo_id && x.tipo).map(x => `<tr><td>${esc(nome(x.topografo_id))}</td><td>${tpTag(x.tipo)}</td><td class="n">${tpQ(x.media, x.unidade)}</td><td class="n">${x.dias}${x.dias < 3 ? ' <small>(ainda usa o padrão)</small>' : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="vazio">Sem lançamentos ainda.</td></tr>'}</table></details>
  </div>`);
}

/* ---------- localização do topógrafo (celular da empresa): manda ao abrir o app e a cada 10 min com ele aberto ---------- */
const TP_LOC = { em: 0, timer: null };
function topoLocalEnviar(forcar) {
  if (topoNivel() !== 'Topógrafo' || !navigator.geolocation || document.hidden) return;
  if (!forcar && Date.now() - TP_LOC.em < 9 * 60000) return;
  TP_LOC.em = Date.now();
  navigator.geolocation.getCurrentPosition(p => { api('topo_local', { lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy }).catch(() => {}); },
    () => { TP_LOC.em = 0; }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
}
function topoLocalIniciar() {
  if (topoNivel() !== 'Topógrafo' || !navigator.geolocation) return;
  const ligar = () => {
    topoLocalEnviar(true);
    clearInterval(TP_LOC.timer);
    TP_LOC.timer = setInterval(() => topoLocalEnviar(), 10 * 60000);
    if (!TP_LOC.vis) { TP_LOC.vis = true; document.addEventListener('visibilitychange', () => { if (!document.hidden && S.sess) topoLocalEnviar(); }); }
  };
  // aviso uma vez por aparelho (LGPD): o celular é da empresa e a localização é registrada com o app aberto
  if (LS.get('cs_topo_loc')) return ligar();
  modal(`${ic('pin')} Localização`, `<p>Este celular é da empresa. Com o app aberto, a <b>localização</b> dele é enviada para a Size (ao abrir e a cada 10 minutos), para a equipe saber onde a topografia está.</p>
    <p><small>Com o app fechado nada é enviado. O celular vai pedir a permissão de localização: toque em <b>Permitir</b>.</small></p>`, {
    ok: 'Entendi', onOk: () => { LS.set('cs_topo_loc', '1'); setTimeout(ligar, 50); }
  });
}
/* mapa da equipe (quem gere): último ponto de cada topógrafo e o caminho de hoje */
const tpHa = s => { if (!s) return ''; const m = Math.round((Date.now() - new Date(s.replace(' ', 'T')).getTime()) / 60000); return m < 2 ? 'agora' : m < 60 ? 'há ' + m + ' min' : m < 1440 ? 'há ' + Math.round(m / 60) + ' h' : fdh(s); };
function tpLocaisHtml(D) {
  if (!topoGere() || !D.topografos.length) return '';
  const L = D.locais || [];
  return `<div class="card"><div class="bp-h"><h3>${ic('pin')} Onde está a equipe</h3><small>localização enviada pelo celular ao abrir o app</small></div>
    ${L.length ? '<div class="tp-mapa" id="tpMapa"></div>' : ''}
    <div class="tp-loc">${D.topografos.map(t => { const x = L.find(l => l.id === t.id), rec = x && Date.now() - new Date(x.visto_em.replace(' ', 'T')).getTime() < 30 * 60000;
      return `<div class="tp-loc-i"><span class="tp-loc-d ${rec ? 'on' : ''}"></span><span><b>${esc(t.nome)}</b><small>${x ? `${rec ? 'com o app aberto · ' : 'último acesso · '}${tpHa(x.visto_em)} (${fdh(x.visto_em)})${x.precisao ? ' · precisão ~' + Math.round(x.precisao) + ' m' : ''}` : 'ainda não enviou a localização'}</small></span>
        ${x ? `<a class="linkbtn" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${x.lat},${x.lng}">${ic('pin')} abrir no mapa</a>` : ''}</div>`; }).join('')}</div></div>`;
}
async function tpMapa(D) {
  const el = $('#tpMapa');
  if (!el || typeof empLeaflet !== 'function') return;
  try { await empLeaflet(); } catch (e) { el.remove(); return; }
  if (!document.body.contains(el)) return;
  const m = L.map(el, { scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  const pts = [];
  (D.locais || []).forEach((x, n) => {
    const cor = ['#FF7A1A', '#14B8A6', '#2F6FEB', '#8B5CF6'][n % 4];
    if (x.hoje.length > 1) L.polyline(x.hoje.map(p => [p[0], p[1]]), { color: cor, weight: 3, opacity: .7, dashArray: '6 6' }).addTo(m);
    x.hoje.slice(0, -1).forEach(p => L.circleMarker([p[0], p[1]], { radius: 4, color: cor, fillOpacity: .8 }).bindTooltip(esc(x.nome.split(' ')[0]) + ' · ' + p[2] + (p[3] !== p[2] ? '–' + p[3] : '')).addTo(m));
    L.marker([x.lat, x.lng], { icon: L.divIcon({ className: '', html: `<span class="tp-pin" style="--c:${cor}"><i>${esc(x.nome.slice(0, 2))}</i></span>`, iconSize: [36, 36], iconAnchor: [18, 34] }) })
      .bindPopup(`<b>${esc(x.nome)}</b><br><small>${tpHa(x.visto_em)} · ${fdh(x.visto_em)}</small>${x.telefone ? `<br><a href="tel:${esc(x.telefone.replace(/\D/g, ''))}">${esc(x.telefone)}</a>` : ''}`).addTo(m);
    pts.push([x.lat, x.lng]);
  });
  if (pts.length === 1) m.setView(pts[0], 15); else m.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
  if (window.ResizeObserver) new ResizeObserver(() => m.invalidateSize()).observe(el);
}

/* ---------- Início da empresa: cartão da topografia ---------- */
function empTopo() {
  const n = topoNivel();
  if (!n) return '';
  return `<div class="card tp-emp"><div class="bp-h"><h3>${ic('tripod')} Topografia</h3><a class="linkbtn" href="#/topo">Abrir</a></div>
    <div class="emp-ac">${n === 'Gerir' ? `<a class="emp-a tp-a principal" href="#/topo/nova">${ic('plus')}<span>Nova demanda</span></a>` : ''}
      <a class="emp-a tp-a" href="#/topo/agenda">${ic('calendar')}<span>${n === 'Gerir' ? 'Agenda da equipe' : 'Minha agenda'}</span></a><a class="emp-a tp-a" href="#/topo/diarios">${ic('book')}<span>Diários</span></a><a class="emp-a tp-a" href="#/topo/producao">${ic('chart')}<span>Produção</span></a></div></div>`;
}

ROTAS.push(
  [/^#\/topo$/, vTopo], [/^#\/topo\/demandas(?:\?(.*))?$/, vTopoDemandas], [/^#\/topo\/demanda\/([^?]+)$/, vTopoDemanda],
  [/^#\/topo\/nova$/, () => vTopoNova()], [/^#\/topo\/editar\/([^?]+)$/, vTopoNova], [/^#\/topo\/lancar\/([^?]+)(?:\?(.*))?$/, vTopoLancar],
  [/^#\/topo\/agenda(?:\?(.*))?$/, vTopoAgenda], [/^#\/topo\/diarios(?:\?(.*))?$/, vTopoDiarios], [/^#\/topo\/producao(?:\?(.*))?$/, vTopoProducao]
);
