'use strict';
/* =====================================================================
 * Módulo EXECUÇÃO · etapas, diário de obra (RDO), painel do engenheiro, equipes,
 * fila sem sinal (envia sozinho quando a internet volta) e RDO para imprimir / salvar em PDF.
 * Usa as funções de app.js (api, modal, view, comEtapas…).
 * ===================================================================== */
Object.assign(IC, {
  chart: 'M3 3v18h18M7 16l4-4 3 3 6-6', camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  cloud: 'M18 10h-1.3A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z', printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  left: 'M15 18l-6-6 6-6', calendar: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18', right: 'M9 18l6-6-6-6', wifi: 'M5 12.6a10 10 0 0 1 14 0M1.4 9a15 15 0 0 1 21.2 0M8.5 16.1a5 5 0 0 1 7 0M12 20h.01', edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'
});
const DSEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const SX = {
  atrasado: ['Atrasado', 'alert'], atencao: ['Atenção', 'clock'], no_ritmo: ['No ritmo', 'check'], nao_iniciado: ['Não iniciado', 'minus'], concluido: ['Concluído', 'check']
};
const sxBadge = s => `<span class="badge sx sx-${s}">${SX[s] ? SX[s][0] : esc(s)}</span>`;
const pct = n => (Math.round(num(n) * 10) / 10).toLocaleString('pt-BR') + '%';
const dsem = s => DSEM[new Date(s + 'T12:00').getDay()];
const rdoN = n => 'RDO ' + String(n).padStart(3, '0');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 16);
const addD = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); };
function barra(i) {
  const p = num(i.pct), cl = p > 100 ? 'exc' : 'sx-' + (i.situacao || 'no_ritmo');
  return `<span class="pbar ${cl}" title="Executado ${pct(p)} · planejado até hoje ${pct(i.planejado)}"><span style="width:${Math.min(100, p)}%"></span>${i.planejado ? `<i style="left:${Math.min(100, num(i.planejado))}%"></i>` : ''}</span>`;
}

/* ---------- dados do módulo (guardados no aparelho para funcionar sem sinal) ---------- */
const EX = { d: null, obra: null, fila: 0, fotos: {} };
async function carregarExec(forcar) {
  if (EX.d && EX.obra === S.obraId && !forcar) return EX.d;
  try {
    EX.d = await api('exec_dados'); EX.obra = S.obraId;
    LS.set('cs_exec_' + S.obraId, JSON.stringify(EX.d));
  } catch (e) {
    const c = e.rede && LS.get('cs_exec_' + S.obraId);
    if (!c) throw e;
    EX.d = JSON.parse(c); EX.obra = S.obraId; EX.offline = true;
  }
  contadores();
  return EX.d;
}
function contExec(k) {
  if (k === 'exec-fila') return EX.fila;
  if (!EX.d || EX.obra !== S.obraId) return k === 'mod-execucao' ? EX.fila : 0;
  const alertas = can('exec_planejar') ? EX.d.alertas.length : 0;
  const revisar = can('exec_planejar') ? EX.d.diarios.filter(d => d.status === 'Enviado').length : 0;
  const avisos = can('exec_lancar') ? EX.d.avisos.filter(a => a.status === 'Aberto').length : 0;
  if (k === 'exec-alertas') return alertas;
  if (k === 'exec-revisar') return revisar;
  return EX.fila + alertas + revisar + avisos;
}
const etapaDe = cod => (EX.d?.etapas || []).find(e => e.codigo === cod);
const itemDe = id => { for (const e of EX.d?.etapas || []) { const i = e.itens.find(x => x.id === id); if (i) return i; } return null; };
const feriado = s => (EX.d?.feriados || []).includes(s);
const util = s => { const w = new Date(s + 'T12:00').getDay(); return w >= 1 && w <= 5 && !feriado(s); };

/* =====================================================================
 * FILA SEM SINAL (IndexedDB) — o service worker também lê esta fila e envia com o app fechado (Android/PC)
 * ===================================================================== */
const FILA = {
  abrir: () => new Promise((ok, no) => {
    const r = indexedDB.open('size-fila', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('ops', { keyPath: 'id' }); r.result.createObjectStore('cfg', { keyPath: 'k' }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  }),
  async tx(loja, modo, fn) {
    const db = await FILA.abrir();
    return new Promise((ok, no) => { const t = db.transaction(loja, modo), st = t.objectStore(loja), r = fn(st); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); });
  },
  todos: () => FILA.tx('ops', 'readonly', st => st.getAll()),
  por: op => FILA.tx('ops', 'readwrite', st => st.put(op)),
  tirar: id => FILA.tx('ops', 'readwrite', st => st.delete(id)),
  cfg: () => FILA.tx('cfg', 'readwrite', st => { st.put({ k: 'api', v: API_URL }); st.put({ k: 'token', v: S.token }); })
};
async function contarFila() {
  try { const l = await FILA.todos(); EX.fila = l.filter(o => o.obra === S.obraId).length; EX.filaErros = l.filter(o => o.erro); } catch (e) { EX.fila = 0; }
  contadores();
  const b = $('#filaInfo');
  if (b) b.outerHTML = filaInfo();
}
/* envia agora; sem sinal, guarda na fila e devolve { offline: true } */
async function enviarExec(acao, dados) {
  try { return await api(acao, dados); } catch (e) {
    if (!e.rede) throw e;
    await FILA.por({ id: uid(), acao, dados, obra: S.obraId, criado: Date.now() });
    await FILA.cfg().catch(() => {});
    try { const r = await navigator.serviceWorker?.ready; if (r && r.sync) await r.sync.register('size-fila'); } catch (x) { /* iPhone: envia ao abrir o app */ }
    contarFila();
    return { offline: true, msg: 'Sem sinal: guardado no aparelho. Envia sozinho quando a internet voltar.' };
  }
}
let SINC = false;
async function sincronizar() {
  if (SINC || !S.token) return;
  SINC = true;
  let enviados = 0;
  try {
    const l = (await FILA.todos()).sort((a, b) => a.criado - b.criado);
    for (const op of l) {
      let r;
      try {
        r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: op.acao, token: S.token, obra: op.obra, ...op.dados }) });
        r = await r.json();
      } catch (e) { break; } // ainda sem sinal
      if (r.ok) { await FILA.tirar(op.id); enviados++; if (op.acao === 'exec_diario_salvar') LS.del('cs_rasc_' + op.obra + '_' + op.dados.data); } else { op.erro = r.erro; op.tentativas = (op.tentativas || 0) + 1; await FILA.por(op); }
    }
  } catch (e) { /* IndexedDB indisponível */ }
  SINC = false;
  await contarFila();
  if (enviados) {
    toast(plural(enviados, 'lançamento guardado foi enviado', 'lançamentos guardados foram enviados') + '.');
    EX.offline = false; S.offline = false;
    await carregarExec(true).catch(() => {});
    if (/^#\/(diario|exec|diarios)/.test(location.hash)) rotear();
  }
}
let EX_LIGADO = false;
function iniciarExec() {
  contarFila();
  if (EX_LIGADO) { sincronizar(); return; }
  EX_LIGADO = true;
  sincronizar();
  addEventListener('online', sincronizar);
  setInterval(() => { if (EX.fila) sincronizar(); }, 45000);
  navigator.serviceWorker?.addEventListener('message', e => { if (e.data && e.data.tipo === 'fila-enviada') { contarFila(); carregarExec(true).catch(() => {}); } });
  FILA.cfg().catch(() => {});
}
function filaInfo() {
  const erros = (EX.filaErros || []).filter(o => o.obra === S.obraId);
  if (!EX.fila && !erros.length) return '<span id="filaInfo" hidden></span>';
  return `<div class="aviso ${erros.length ? 'erro' : 'warn'}" id="filaInfo">${ic('wifi')} ${EX.fila ? plural(EX.fila, 'envio guardado', 'envios guardados') + ' no aparelho — sobe sozinho quando o sinal voltar.' : ''}
    ${erros.length ? `<br><b>Não aceito pelo servidor:</b> ${erros.map(o => esc(o.erro)).join(' · ')} <button type="button" class="linkbtn" onclick="descartarErros()">descartar</button>` : ''}
    ${EX.fila ? ' <button type="button" class="linkbtn" onclick="sincronizar()">Enviar agora</button>' : ''}</div>`;
}
async function descartarErros() {
  if (!confirm('Descartar os envios que o servidor recusou?')) return;
  for (const o of EX.filaErros || []) await FILA.tirar(o.id);
  contarFila();
}

/* =====================================================================
 * PAINEL DA EXECUÇÃO (engenheiro)
 * ===================================================================== */
let FX = 'todas';
async function vExec() {
  titulo('Execução');
  const D = await carregarExec(true);
  const todas = D.etapas.filter(e => e.ativa);
  const ets = todas.filter(e => e.situacao !== 'concluido'); // concluídas só pelo filtro "Concluídas"
  const F = {
    todas: ['Em aberto', 'layers', () => true], atrasado: ['Atrasadas', 'alert', e => e.situacao === 'atrasado'], atencao: ['Atenção', 'clock', e => e.situacao === 'atencao'],
    no_ritmo: ['No ritmo', 'check', e => e.situacao === 'no_ritmo'], nao_iniciado: ['Não iniciadas', 'minus', e => e.situacao === 'nao_iniciado'], concluido: ['Concluídas', 'check', e => e.situacao === 'concluido']
  };
  const grupos = [{ t: 'Situação', itens: Object.entries(F).map(([k, v]) => ({ k, t: v[0], i: v[1], n: (k === 'todas' ? ets : todas).filter(v[2]).length, on: k === FX, cl: k === 'atrasado' ? 'quente' : '' })) }];
  const acoes = [];
  if (can(['exec_lancar', 'exec_planejar'])) acoes.push({ k: 'a:diario', t: 'Diário de hoje', i: 'book', cl: 'acao' });
  if (can('exec_planejar')) acoes.push({ k: 'a:etapa', t: 'Nova etapa', i: 'plus', cl: 'acao' }, { k: 'a:aviso', t: 'Avisar a equipe', i: 'alert', cl: 'acao' });
  acoes.push({ k: 'a:diarios', t: 'Diários (RDO)', i: 'file', cl: 'acao' });
  grupos.push({ t: 'Ações', itens: acoes });
  const lista = (FX === 'todas' ? ets : todas).filter(F[FX][2]);
  // visão semanal: em andamento · começam nesta semana · próximas
  const dom = new Date(hoje() + 'T12:00'); dom.setDate(dom.getDate() + (7 - dom.getDay()) % 7);
  const fimSem = dom.toLocaleDateString('sv-SE'), ini = e => String(e.inicio || '').slice(0, 10);
  const blocos = FX !== 'todas' ? [[null, lista]] : [
    ['Em andamento', lista.filter(e => e.situacao !== 'nao_iniciado')],
    ['Começam nesta semana', lista.filter(e => e.situacao === 'nao_iniciado' && ini(e) && ini(e) <= fimSem)],
    ['Próximas', lista.filter(e => e.situacao === 'nao_iniciado' && (!ini(e) || ini(e) > fimSem))]];
  const listaHtml = blocos.filter(b => b[1].length).map(([t, l]) => `${t ? `<h3 class="bloco-t">${t} <span class="contagem">${l.length}</span></h3>` : ''}<div class="exec-lista">${l.map(cartaoEtapa).join('')}</div>`).join('');
  const geral = ets.length ? ets.reduce((t, e) => t + Math.min(100, e.pct), 0) / ets.length : 0;
  const revisar = D.diarios.filter(d => d.status === 'Enviado');
  view(comEtapas(grupos, `<div class="cab"><h2>${F[FX][0]}</h2><span class="contagem">${esc(S.dados.obra.nome)}</span></div>
    ${filaInfo()}${EX.offline ? '<div class="aviso warn">Sem sinal: mostrando o último dado guardado.</div>' : ''}
    <div class="kpis"><div class="kpi destaque"><b>${pct(geral)}</b><span>Média das etapas</span></div>
      <a class="kpi ${D.alertas.length ? 'quente' : 'zero'}" href="#/exec" id="kAl"><b>${D.alertas.length}</b><span>Alertas</span></a>
      <a class="kpi ${revisar.length ? '' : 'zero'}" href="#/diarios?k=Enviado"><b>${revisar.length}</b><span>Diários a revisar</span></a>
      <div class="kpi ${ets.length ? '' : 'zero'}"><b>${ets.length}</b><span>Etapas ativas</span></div></div>
    ${D.alertas.length && can('exec_planejar') ? `<div class="card"><h3>${ic('alert')} Alertas</h3>${D.alertas.slice(0, 12).map(a => `<a class="alerta al-${a.tipo}" href="#/exec/etapa/${enc(a.etapa)}"><b>${esc(etapaDe(a.etapa)?.nome || a.etapa)}</b><small>${esc(a.texto)}</small></a>`).join('')}</div>` : ''}
    ${D.avisos.filter(a => a.status === 'Aberto').length ? `<div class="card"><h3>${ic('bell')} Avisos para a equipe</h3>${D.avisos.filter(a => a.status === 'Aberto').map(avisoHtml).join('')}</div>` : ''}
    ${listaHtml || `<div class="card vazio"><p>${todas.length ? (FX === 'todas' ? 'Nenhuma etapa em aberto. As concluídas ficam no filtro "Concluídas".' : 'Nenhuma etapa nesta situação.') : 'Nenhuma etapa cadastrada ainda.'}</p>${can('exec_planejar') && !todas.length ? '<button class="btn" id="primeira">Cadastrar a primeira etapa</button>' : ''}</div>`}`));
  ligarEtapas(k => {
    if (k === 'a:diario') { location.hash = '#/diario'; return; }
    if (k === 'a:diarios') { location.hash = '#/diarios'; return; }
    if (k === 'a:etapa') return mEtapa();
    if (k === 'a:aviso') return mAviso();
    FX = k; vExec();
  });
  if ($('#primeira')) $('#primeira').onclick = () => mEtapa();
  ligarAvisos();
}
function cartaoEtapa(e) {
  return `<a class="card etapa-card sxb-${e.situacao}" href="#/exec/etapa/${enc(e.codigo)}">
    <div class="l1"><b>${esc(e.nome)}</b>${sxBadge(e.situacao)}<span class="dir">${pct(e.pct)}</span></div>
    <small>${esc([e.local, e.frente, e.inicio && fd(e.inicio) + ' → ' + fd(e.termino)].filter(Boolean).join(' · '))}</small>
    ${barra(e)}
    <div class="its">${e.itens.map(i => `<div class="it"><span class="n">${esc(i.servico)}</span>${barra(i)}
      <small>${nf(i.executado)} / ${nf(i.prevista)} ${esc(i.unidade)}${i.media ? ' · média ' + nf(i.media) + '/dia' : ''}</small></div>`).join('')}</div></a>`;
}
const avisoHtml = a => `<div class="aviso-ex ${a.status === 'Aberto' ? '' : 'lido'}"><span><b>${esc(a.tipo)}</b> · ${esc(a.etapa_nome || 'Obra toda')}${a.texto ? '<br>' + esc(a.texto) : ''}
  <br><small>${esc(a.autor)} · ${fdh(a.data)}${a.ciente_por ? ' · ciente: ' + esc(a.ciente_por) + ' ' + fdh(a.ciente_em) : ''}</small></span>
  ${a.status === 'Aberto' && can('exec_lancar') ? `<button type="button" class="btn sec peq" data-ciente="${esc(a.id)}">Ciente</button>` : ''}
  ${a.status !== 'Encerrado' && can('exec_planejar') ? `<button type="button" class="btn sec peq" data-encerra="${esc(a.id)}">Encerrar</button>` : ''}</div>`;
function ligarAvisos() {
  $$('[data-ciente]').forEach(b => { b.onclick = async () => { try { toast((await enviarExec('exec_aviso_ciente', { id: b.dataset.ciente })).msg); await carregarExec(true); rotear(); } catch (e) { toast(e.message, 1); } }; });
  $$('[data-encerra]').forEach(b => { b.onclick = async () => { try { toast((await api('exec_aviso_ciente', { id: b.dataset.encerra, encerrar: true })).msg); await carregarExec(true); rotear(); } catch (e) { toast(e.message, 1); } }; });
}

/* ---------- nova etapa / incluir serviços ---------- */
function mEtapa(e) {
  const D = EX.d, frentes = (S.dados.frentes || []).filter(x => ativo(x, 'ativa'));
  const cat = D.catalogo.slice().sort((a, b) => (a.grupo + a.servico).localeCompare(b.grupo + b.servico));
  const f = modal(e ? 'Editar etapa · incluir serviços' : 'Nova etapa', `
    <label>Etapa<input name="nome" required value="${esc(e?.nome || '')}" placeholder="ex: Pavimentação · Rua X"></label>
    <div class="g2"><label>Local / trecho<input name="local" value="${esc(e?.local || '')}" placeholder="ex: Rua X, estaca 0 a 25"></label>
      <label>Frente de trabalho<select name="frente"><option value="">—</option>${frentes.map(x => `<option ${e && e.frente === x.nome ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label></div>
    <div class="g2"><label>Responsável<input name="responsavel" value="${esc(e?.responsavel || '')}"></label><label>Observação<input name="obs" value="${esc(e?.obs || '')}"></label></div>
    ${e ? `<div class="aviso info">Serviços já cadastrados: ${e.itens.map(i => esc(i.servico)).join(', ')}. Para mudar quantidade ou datas deles, use <b>Alterar</b> no serviço.</div>` : ''}
    <h3 style="margin:6px 0 0">${e ? 'Incluir serviços' : 'Serviços da etapa'}</h3>
    <div class="g2"><label>Início previsto <small>(padrão dos serviços)</small><input type="date" name="ini" value="${hoje()}"></label><label>Término previsto<input type="date" name="fim"></label></div>
    <div id="srvs"></div><button type="button" class="btn sec" id="addSrv">${ic('plus')} Serviço</button>
    ${e ? '<label>Motivo da inclusão <small>(fica registrado)</small><input name="motivo" placeholder="ex: aditivo de contrato, serviço não previsto"></label>' : ''}
    <datalist id="dl-srv">${cat.map(s => `<option value="${esc(s.servico)}">${esc(s.grupo)} · ${esc(s.unidade)}</option>`).join('')}</datalist>`, {
    larga: true, ok: e ? 'Salvar' : 'Criar etapa',
    onOk: async f => {
      const itens = $$('.srv', f).map(d => ({ servico: $('[name=s]', d).value.trim(), unidade: $('[name=u]', d).value.trim(), qtd_prevista: $('[name=q]', d).value, inicio: $('[name=i]', d).value || f.ini.value, termino: $('[name=t]', d).value || f.fim.value }))
        .filter(x => x.servico || x.qtd_prevista);
      const r = await api('exec_etapa_salvar', { codigo: e?.codigo, nome: f.nome.value, local: f.local.value, frente: f.frente.value, responsavel: f.responsavel.value, obs: f.obs.value, itens, motivo: f.motivo?.value });
      toast(r.msg); await carregarExec(true);
      location.hash = '#/exec/etapa/' + enc(r.codigo); if (e) rotear();
    }
  });
  const add = () => {
    const d = document.createElement('div');
    d.className = 'srv';
    d.innerHTML = `<label class="s">Serviço<input name="s" list="dl-srv" autocomplete="off" placeholder="Digite para buscar no catálogo"></label>
      <label>Qtd prevista<input name="q" type="number" step="any" min="0" inputmode="decimal"></label><label>Unid.<input name="u" placeholder="m²"></label>
      <label>Início<input type="date" name="i"></label><label>Término<input type="date" name="t"></label><button type="button" class="rm" aria-label="Remover">${ic('x')}</button>`;
    const s = $('[name=s]', d), u = $('[name=u]', d);
    s.onchange = () => { const c = cat.find(x => norm(x.servico) === norm(s.value)); u.value = c ? c.unidade : u.value; u.readOnly = !!c; d.classList.toggle('avulso', !c && !!s.value); };
    $('.rm', d).onclick = () => d.remove();
    $('#srvs', f).appendChild(d);
    return s;
  };
  add();
  $('#addSrv', f).onclick = () => add().focus();
  f.ini.onchange = () => { if (!f.fim.value || f.fim.value < f.ini.value) f.fim.value = f.ini.value; };
}
function mAviso(etapa) {
  const D = EX.d;
  modal('Avisar a equipe', `<label>Etapa<select name="etapa"><option value="">Obra toda</option>${D.etapas.filter(e => e.ativa).map(e => `<option value="${esc(e.codigo)}" ${e.codigo === etapa ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></label>
    <label>Tipo<select name="tipo">${['Acelerar equipe', 'Rendimento baixo', 'Qualidade', 'Segurança', 'Outro'].map(x => `<option>${x}</option>`).join('')}</select></label>
    <label>Mensagem<textarea name="texto" placeholder="ex: faltam 400 m² e o prazo é dia 20 — reforçar a equipe"></textarea></label>
    <small>O encarregado vê o aviso ao abrir o diário (e no sino) e marca "ciente".</small>`, {
    ok: 'Enviar aviso', onOk: async f => { toast((await api('exec_aviso_salvar', { etapa: f.etapa.value, tipo: f.tipo.value, texto: f.texto.value })).msg); await carregarExec(true); rotear(); }
  });
}

/* ---------- detalhe da etapa ---------- */
async function vEtapa(cod) {
  await carregarExec();
  const r = await api('exec_etapa', { codigo: cod }), e = r.etapa, eng = can('exec_planejar');
  titulo(e.nome);
  const dias = {};
  r.lancamentos.forEach(l => { const s = String(l.data).slice(0, 10); (dias[s] = dias[s] || []).push(l); });
  const eqDia = {};
  r.equipes.forEach(x => { const s = String(x.data).slice(0, 10); (eqDia[s] = eqDia[s] || []).push(x); });
  view(`<a href="#/exec" class="linkbtn">${ic('back')} Painel</a>
    <div class="card det-cab"><div class="l1"><span class="num">${esc(e.nome)}</span>${sxBadge(e.situacao)}<span class="dir big">${pct(e.pct)}</span></div>
      <small>${esc([e.local, e.frente, e.responsavel && 'resp. ' + e.responsavel].filter(Boolean).join(' · '))}</small>${barra(e)}
      <small>Previsto ${fd(e.inicio)} → ${fd(e.termino)} · planejado até hoje ${pct(e.planejado)}</small>
      ${eng ? `<div class="acoes" style="margin-top:10px"><button class="btn sec peq" id="edE">${ic('plus')} Incluir serviço / editar</button><button class="btn sec peq" id="avE">${ic('alert')} Avisar a equipe</button></div>` : ''}</div>
    ${e.itens.map(i => `<div class="card item-ex sxb-${i.situacao}"><div class="l1"><b>${esc(i.servico)}</b>${sxBadge(i.situacao)}${i.pct > 100 ? '<span class="badge exc">acima do previsto</span>' : ''}<span class="dir">${pct(i.pct)}</span></div>
      ${barra(i)}
      <dl class="kv kv3"><dt>Executado</dt><dd><b>${nf(i.executado)}</b> de ${nf(i.prevista)} ${esc(i.unidade)}${i.alterado ? ` <small>(original ${nf(i.original)})</small>` : ''}</dd>
        <dt>Saldo</dt><dd>${nf(i.saldo)} ${esc(i.unidade)}</dd>
        <dt>Prazo</dt><dd>${fd(i.inicio)} → ${fd(i.termino)}${i.termino_original && i.termino_original !== i.termino ? ` <small>(original ${fd(i.termino_original)})</small>` : ''} · ${plural(i.dias_restantes, 'dia útil restante', 'dias úteis restantes')}</dd>
        <dt>Média</dt><dd>${nf(i.media)} ${esc(i.unidade)}/dia · últimos 7: ${nf(i.media7)} · ${plural(i.dias_trab, 'dia trabalhado', 'dias trabalhados')}</dd>
        <dt>Precisa</dt><dd>${i.saldo <= 0 ? '—' : i.ritmo == null ? '<span class="atrasado">prazo acabou</span>' : nf(i.ritmo) + ' ' + esc(i.unidade) + '/dia até o término'}</dd>
        <dt>Término</dt><dd class="${i.situacao === 'atrasado' ? 'atrasado' : ''}">${i.saldo <= 0 ? 'concluído ' + fd(i.ultimo) : i.projecao ? 'projetado ' + fd(i.projecao) : 'sem produção para projetar'}</dd>
        <dt>Produtividade</dt><dd>${i.prod_hd != null ? nf(i.prod_hd) + ' ' + esc(i.unidade) + '/homem-dia' : '—'}${i.prod_ed != null ? ' · ' + nf(i.prod_ed) + ' ' + esc(i.unidade) + '/equipe-dia' : ''}</dd></dl>
      ${eng ? `<div class="acoes"><button class="btn sec peq" data-alt="${esc(i.id)}">${ic('edit')} Alterar</button></div>` : ''}</div>`).join('')}
    <div class="card"><h3>Produção por dia</h3>${Object.keys(dias).sort().reverse().map(s => `<div class="dia-prod"><a href="#/diario/${s}"><b>${fd(s)}</b> <small>${dsem(s)}${util(s) ? '' : ' · aditivo'}</small></a>
      <small>${(eqDia[s] || []).map(x => esc(x.equipe) + ' (' + x.pessoas + ')').join(', ')}</small>
      ${dias[s].map(l => `<div class="lp ${eng ? 'click' : ''}" data-l="${esc(l.id)}"><span>${esc(l.servico)}</span><b>${nf(l.qtd)} ${esc(l.unidade)}</b><small>${esc(l.usuario)}</small></div>`).join('')}</div>`).join('') || '<p class="vazio">Nenhum lançamento ainda.</p>'}</div>
    ${r.avisos.length ? `<div class="card"><h3>Avisos</h3>${r.avisos.map(avisoHtml).join('')}</div>` : ''}
    <div class="card"><h3>Alterações registradas</h3>${r.alteracoes.map(a => `<div class="alt"><b>${esc(a.campo)}</b>: ${esc(fmtAlt(a.de))} → ${esc(fmtAlt(a.para))}<br><small>${esc(a.usuario)} · ${fdh(a.data)}${a.motivo ? ' · motivo: ' + esc(a.motivo) : ''}</small></div>`).join('') || '<p class="vazio">Nenhuma alteração. O previsto é o original.</p>'}</div>`);
  if ($('#edE')) $('#edE').onclick = () => mEtapa(e);
  if ($('#avE')) $('#avE').onclick = () => mAviso(e.codigo);
  $$('[data-alt]').forEach(b => { b.onclick = () => mAlterar(e.itens.find(i => i.id === b.dataset.alt)); });
  if (eng) $$('[data-l]').forEach(el => { el.onclick = () => mCorrigir(r.lancamentos.find(l => l.id === el.dataset.l)); });
  ligarAvisos();
}
const fmtAlt = v => /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? fd(v) : String(v ?? '');
function mAlterar(i) {
  modal('Alterar · ' + esc(i.servico), `<div class="g2"><label>Quantidade prevista (${esc(i.unidade)})<input name="q" type="number" step="any" min="0" inputmode="decimal" value="${i.prevista}"></label><span></span>
    <label>Início<input type="date" name="ini" value="${i.inicio}"></label><label>Término<input type="date" name="fim" value="${i.termino}"></label></div>
    <label>Motivo da mudança <small>(obrigatório, fica registrado)</small><textarea name="motivo" required minlength="5" placeholder="ex: chuva parou a obra 4 dias; medição de campo maior que o projeto"></textarea></label>
    <small>O previsto original (${nf(i.original)} ${esc(i.unidade)}, término ${fd(i.termino_original)}) continua guardado para comparar.</small>
    ${i.executado ? '' : '<label class="ck"><input type="checkbox" name="rem"> Remover este serviço da etapa</label>'}`, {
    ok: 'Registrar alteração',
    onOk: async f => {
      const r = await api('exec_item_alterar', { id: i.id, qtd_prevista: f.q.value, inicio: f.ini.value, termino: f.fim.value, motivo: f.motivo.value, remover: f.rem?.checked });
      toast(r.msg); await carregarExec(true); rotear();
    }
  });
}
function mCorrigir(l) {
  const s = String(l.data).slice(0, 10), antigo = s < addD(hoje(), -1);
  modal('Corrigir lançamento', `<p><b>${esc(l.servico)}</b> · ${fd(s)} · ${esc(l.usuario)}</p>
    <label>Quantidade (${esc(l.unidade)}) <small>(0 apaga o lançamento)</small><input name="q" type="number" step="any" min="0" inputmode="decimal" value="${num(l.qtd)}"></label>
    <label>Motivo <small>${antigo ? '(obrigatório, fica registrado)' : '(recomendado)'}</small><input name="motivo" ${antigo ? 'required minlength="5"' : ''}></label>`, {
    ok: 'Salvar correção',
    onOk: async f => {
      const r = await api('exec_diario_salvar', { data: s, motivo: f.motivo.value, lancamentos: [{ cliente_id: l.cliente_id || l.id, item_id: l.item_id, qtd: f.q.value, obs: l.obs }] });
      toast(r.msg); await carregarExec(true); rotear();
    }
  });
}

/* =====================================================================
 * DIÁRIO DE OBRA (encarregado)
 * ===================================================================== */
let DIA = null, GPS = null;
const chaveRasc = d => 'cs_rasc_' + S.obraId + '_' + d;
function pegarGPS(espera = 12000) {
  return new Promise(ok => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(p => { GPS = { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), em: Date.now() }; ok(GPS); }, () => ok(null), { enableHighAccuracy: true, timeout: espera, maximumAge: 120000 });
  });
}
/* troca de dia: só o conteúdo muda (o topo com a data fica); dias já abertos vêm da memória */
const DIAS = {};
let DIA_SEQ = 0;
async function buscarDia(dia) {
  const k = S.obraId + '|' + dia, c = DIAS[k];
  if (c && Date.now() - c.em < 90000) return c.srv;
  try { const srv = await api('exec_diario', { data: dia }); DIAS[k] = { srv, em: Date.now() }; return srv; } catch (e) {
    if (!e.rede) throw e;
    return { data: dia, util: util(dia), feriado: feriado(dia), diario: null, lancamentos: [], equipes: [], fotos: [], pode_editar: true, offline: true };
  }
}
const esquecerDia = d => { delete DIAS[S.obraId + '|' + d]; };
async function vDiario(data) {
  titulo('Diário de obra');
  await carregarExec();
  await carregarDia(data);
}
function irDia(d) {
  if (!d) return;
  if (d > hoje()) d = hoje();
  if (DIA && d === DIA.data) return;
  history.replaceState(null, '', '#/diario/' + d);
  carregarDia(d).catch(e => toast(e.message, 1));
}
async function carregarDia(data) {
  const dia = data && /^\d{4}-\d{2}-\d{2}$/.test(data) && data <= hoje() ? data : hoje(), seq = ++DIA_SEQ, D = EX.d;
  marcarNav(dia);
  const corpo = $('#diaCorpo');
  if (corpo) corpo.classList.add('trocando');
  const srv = await buscarDia(dia);
  if (seq !== DIA_SEQ) return; // o usuário já foi para outro dia
  // pré-carrega o dia anterior para a seta responder na hora
  setTimeout(() => { if (seq === DIA_SEQ && !DIAS[S.obraId + '|' + addD(dia, -1)]) buscarDia(addD(dia, -1)).catch(() => {}); }, 400);
  const eu = S.sess.usuario.id, eng = can('exec_planejar'), lancar = can(['exec_lancar', 'exec_planejar']);
  // estado do formulário: do servidor + rascunho guardado no aparelho (se houver)
  DIA = { data: dia, srv, etapas: [], lanc: {}, eq: {}, condicao: srv.diario?.condicao || '', ocorrencias: srv.diario?.ocorrencias || '', obs: srv.diario?.obs || '', motivo: '' };
  srv.lancamentos.forEach(l => {
    if (!DIA.etapas.includes(l.etapa)) DIA.etapas.push(l.etapa);
    if (String(l.usuario_id) === eu) DIA.lanc[l.item_id] = { cid: l.cliente_id || l.id, qtd: num(l.qtd), obs: l.obs || '', salvo: num(l.qtd) };
  });
  srv.equipes.forEach(x => { if (!DIA.etapas.includes(x.etapa)) DIA.etapas.push(x.etapa); (DIA.eq[x.etapa] = DIA.eq[x.etapa] || []).push({ equipe: x.equipe, pessoas: num(x.pessoas) }); });
  let rasc = null;
  try { rasc = JSON.parse(LS.get(chaveRasc(dia)) || 'null'); } catch (e) { /* ignora */ }
  if (rasc) Object.assign(DIA, { etapas: [...new Set([...DIA.etapas, ...rasc.etapas])], lanc: Object.assign(DIA.lanc, rasc.lanc), eq: Object.assign(DIA.eq, rasc.eq), condicao: rasc.condicao || DIA.condicao, ocorrencias: rasc.ocorrencias ?? DIA.ocorrencias, obs: rasc.obs ?? DIA.obs });
  // o que já chegou ao servidor conta como "salvo" (evita descontar duas vezes no saldo)
  Object.values(DIA.lanc).forEach(l => { const sv = srv.lancamentos.find(x => (x.cliente_id || x.id) === l.cid); l.salvo = sv ? num(sv.qtd) : 0; });
  if (rasc && Object.values(DIA.lanc).every(l => num(l.qtd || 0) === l.salvo) && (rasc.ocorrencias ?? '') === (srv.diario?.ocorrencias || '') && srv.diario) { LS.del(chaveRasc(dia)); rasc = null; }
  DIA.rasc = !!rasc;
  DIA.editavel = lancar && srv.pode_editar && !(srv.diario?.status === 'Revisado' && !eng);
  // clima: o do diário salvo; se ainda não tem (ou é hoje), consulta a Open-Meteo pela localização da obra ou do GPS
  DIA.clima = srv.diario?.clima || null;
  desenharDiario();
  const final = srv.diario?.clima_final === 'Sim';
  if ((!DIA.clima || (!final && dia === hoje())) && !srv.offline) {
    const c = await climaObra(dia);
    if (DIA.data !== dia) return;
    if (c) {
      DIA.clima = c;
      // diário que subiu sem sinal: completa o clima agora
      if (srv.diario && !final && dia < hoje() && DIA.editavel) api('exec_clima_salvar', { data: dia, clima: c, gps: GPS }).catch(() => {});
    }
    desenharClima();
  }
}
const WMO = {
  0: 'Céu limpo', 1: 'Predomínio de sol', 2: 'Parcialmente nublado', 3: 'Nublado', 45: 'Neblina', 48: 'Neblina', 51: 'Garoa fraca', 53: 'Garoa', 55: 'Garoa forte',
  56: 'Garoa congelante', 57: 'Garoa congelante', 61: 'Chuva fraca', 63: 'Chuva moderada', 65: 'Chuva forte', 66: 'Chuva congelante', 67: 'Chuva congelante',
  71: 'Neve fraca', 73: 'Neve', 75: 'Neve forte', 77: 'Granizo fino', 80: 'Pancadas fracas', 81: 'Pancadas de chuva', 82: 'Pancadas fortes', 85: 'Neve', 86: 'Neve',
  95: 'Trovoadas', 96: 'Trovoadas com granizo', 99: 'Trovoadas com granizo'
};
/* Open-Meteo (grátis, sem chave): chuva por hora → manhã (7–12h), tarde (12–17h), horário de trabalho e dia todo */
async function climaObra(dia) {
  let lat = EX.d.obra.lat, lng = EX.d.obra.lng;
  if (lat === '' || lat == null) {
    const g = GPS || await pegarGPS();
    if (!g) { DIA.climaMsg = 'Obra sem localização: ligue o GPS ou informe latitude/longitude em Administração → Obras.'; return null; }
    lat = g.lat; lng = g.lng;
  }
  const dif = Math.round((new Date(dia + 'T12:00') - new Date(hoje() + 'T12:00')) / 864e5);
  if (dif > 15) return null;
  const base = dif < -80 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(`${base}?latitude=${lat}&longitude=${lng}&hourly=precipitation,temperature_2m,weather_code,wind_speed_10m&timezone=America%2FSao_Paulo&start_date=${dia}&end_date=${dia}`, { signal: ctl.signal });
    const h = (await r.json()).hourly;
    if (!h || !h.time) return null;
    const faixa = (a, b) => {
      let mm = 0, cod = 0, n = 0; const t = [];
      h.time.forEach((x, i) => { const hr = +String(x).slice(11, 13); if (hr < a || hr >= b) return; mm += +h.precipitation[i] || 0; cod = Math.max(cod, +h.weather_code[i] || 0); t.push(+h.temperature_2m[i]); n++; });
      return { mm: Math.round(mm * 10) / 10, codigo: cod, desc: n ? WMO[cod] || '—' : '—', tmin: t.length ? Math.min(...t) : '', tmax: t.length ? Math.max(...t) : '' };
    };
    const trab = faixa(7, 17), d24 = faixa(0, 24), lim = num(EX.d.limite_chuva) || 5;
    return {
      manha: faixa(7, 12), tarde: faixa(12, 17), mm_trabalho: trab.mm, mm_dia: d24.mm, tmin: d24.tmin, tmax: d24.tmax, vento: Math.round(Math.max(0, ...h.wind_speed_10m.map(Number))),
      sugestao: trab.mm >= lim ? 'Parado por chuva' : 'Trabalhável', limite: lim, fonte: 'Open-Meteo', tipo: dif > 0 ? 'previsão' : dif === 0 ? 'hoje até agora' : 'registrado'
    };
  } catch (e) { DIA.climaMsg = 'Não consegui consultar o clima agora (sem sinal?). Tenta de novo ao enviar.'; return null; }
  finally { clearTimeout(tm); }
}
function salvarRascunho() {
  if (!DIA || !DIA.editavel) return;
  LS.set(chaveRasc(DIA.data), JSON.stringify({ etapas: DIA.etapas, lanc: DIA.lanc, eq: DIA.eq, condicao: DIA.condicao, ocorrencias: DIA.ocorrencias, obs: DIA.obs }));
  DIA.rasc = true;
}
/* topo do diário: ◀ data ▶ + botão de calendário (abre o seletor do aparelho) */
function marcarNav(dia) {
  const n = $('#diaNav');
  if (!n) return;
  $('#dTxt', n).innerHTML = `<b>${fd(dia)}</b> ${dsem(dia)}${dia === hoje() ? ' <small class="hoje-tag">hoje</small>' : ''}`;
  $('#dData', n).value = dia;
  $('#dData', n).max = hoje();
  $('#dProx', n).disabled = dia >= hoje();
  $('#dHoje', n).hidden = dia === hoje();
}
function ligarNav() {
  const n = $('#diaNav');
  n.innerHTML = `<button class="icbtn" id="dAnt" aria-label="Dia anterior">${ic('left')}</button>
    <button type="button" class="dia-data" id="dTxt" aria-label="Escolher a data"></button>
    <span class="cal"><button type="button" class="icbtn" id="dCal" aria-label="Abrir calendário">${ic('calendar')}</button><input type="date" id="dData" tabindex="-1" aria-hidden="true"></span>
    <button class="icbtn" id="dProx" aria-label="Próximo dia">${ic('right')}</button>
    <button type="button" class="chip" id="dHoje">Hoje</button>`;
  const inp = $('#dData', n);
  const abrir = () => { try { inp.showPicker(); } catch (e) { inp.focus(); inp.click(); } };
  $('#dCal', n).onclick = abrir;
  $('#dTxt', n).onclick = abrir;
  inp.onchange = () => irDia(inp.value);
  $('#dAnt', n).onclick = () => irDia(addD(DIA ? DIA.data : hoje(), -1));
  $('#dProx', n).onclick = () => irDia(addD(DIA ? DIA.data : hoje(), 1));
  $('#dHoje', n).onclick = () => irDia(hoje());
}
function desenharDiario() {
  const D = EX.d, s = DIA.srv, d = s.diario, dia = DIA.data, eng = can('exec_planejar');
  const antigo = dia < addD(hoje(), -1);
  const outras = D.etapas.filter(e => e.ativa && !DIA.etapas.includes(e.codigo) && e.situacao !== 'concluido');
  const avisos = D.avisos.filter(a => a.status === 'Aberto');
  if (!$('#diaNav')) { view(`<div class="dia-nav" id="diaNav"></div><div id="diaCorpo"></div>`); ligarNav(); marcarNav(dia); }
  const corpo = $('#diaCorpo');
  corpo.classList.remove('trocando');
  corpo.innerHTML = `<div class="cab"><h2>${d ? rdoN(d.numero) : 'Novo diário'}</h2>${d ? `<span class="badge ${d.status === 'Revisado' ? 'b-ok' : d.status === 'Enviado' ? 'b-lib' : 'b-apr'}">${esc(d.status)}</span>` : ''}
      ${!s.util ? `<span class="badge exc">${s.feriado ? 'Feriado' : dsem(dia)} · aditivo especial</span>` : ''}${DIA.rasc ? '<span class="badge">rascunho no aparelho</span>' : ''}</div>
    ${filaInfo()}${s.offline ? '<div class="aviso warn">Sem sinal: o diário fica guardado no aparelho e envia sozinho quando a internet voltar.</div>' : ''}
    ${!DIA.editavel ? `<div class="aviso info">${d?.status === 'Revisado' ? 'Diário revisado pelo engenheiro (' + esc(d.revisado_por) + '). Só ele pode corrigir.' : 'Somente leitura: lançamentos de dias anteriores são feitos pelo engenheiro.'}</div>` : ''}
    ${avisos.length && can('exec_lancar') ? `<div class="card avisos-dia"><h3>${ic('alert')} Avisos do engenheiro</h3>${avisos.map(avisoHtml).join('')}</div>` : ''}
    <div class="card clima" id="clima"></div>
    <div id="dEtapas">${DIA.etapas.map(blocoEtapa).join('')}</div>
    ${DIA.editavel ? `<div class="card add-et"><label>Adicionar etapa ao diário<select id="addEt"><option value="">Escolha a etapa…</option>${outras.map(e => `<option value="${esc(e.codigo)}">${esc(e.nome)} · ${pct(e.pct)}</option>`).join('')}</select></label>
      ${!D.etapas.length ? `<small>Nenhuma etapa cadastrada. ${eng ? '<a href="#/exec">Cadastre no painel</a>.' : 'Peça ao engenheiro para cadastrar.'}</small>` : ''}</div>` : ''}
    <div class="card"><div class="cab"><h3 style="flex:1;margin:0">${ic('camera')} Fotos</h3>${DIA.editavel ? `<label class="btn sec peq foto-btn">${ic('camera')} Tirar foto<input type="file" accept="image/*" capture="environment" data-foto=""></label>` : ''}</div>
      <div class="fotos" id="fotos">${fotosHtml()}</div></div>
    <div class="card grid"><label>Ocorrências <small>(atrasos, visitas, acidentes, falta de material…)</small><textarea id="ocorr" ${DIA.editavel ? '' : 'disabled'}>${esc(DIA.ocorrencias)}</textarea></label>
      <label>Observações<textarea id="obsD" ${DIA.editavel ? '' : 'disabled'}>${esc(DIA.obs)}</textarea></label>
      ${antigo && DIA.editavel ? '<label>Motivo do lançamento em dia anterior <small>(obrigatório, fica registrado)</small><input id="motivo" required></label>' : ''}</div>
    <div class="barra-acoes"><div class="acoes">
      ${DIA.editavel ? `<button class="btn sec" id="dSalvar">Salvar rascunho</button>${!d || d.status === 'Rascunho' ? '<button class="btn" id="dEnviar">' + ic('send') + ' Enviar diário</button>' : '<button class="btn" id="dEnviar">Salvar alterações</button>'}` : ''}
      ${eng && d && d.status === 'Enviado' ? '<button class="btn navy" id="dRev">' + ic('check') + ' Marcar revisado</button>' : ''}
      ${d ? `<button class="btn sec" id="dRdo">${ic('printer')} RDO (PDF)</button>` : ''}</div></div>`;
  desenharClima();
  ligarDiario();
  ligarAvisos();
  carregarMinis();
}
function blocoEtapa(cod) {
  const e = etapaDe(cod);
  if (!e) return '';
  const ed = DIA.editavel, eqs = DIA.eq[cod] || [];
  const outrosDe = id => DIA.srv.lancamentos.filter(l => l.item_id === id && String(l.usuario_id) !== S.sess.usuario.id);
  const equipes = (EX.d.equipes || []).filter(x => ativo(x, 'ativa'));
  return `<div class="card dia-et" data-et="${esc(cod)}">
    <div class="l1"><b>${esc(e.nome)}</b>${sxBadge(e.situacao)}<span class="dir">${pct(e.pct)}</span></div>
    <div class="eqs"><small>Equipes trabalhando</small>${eqs.map((x, k) => `<div class="eq" data-k="${k}">
      <select data-eqn ${ed ? '' : 'disabled'}><option value="">Equipe…</option>${[...new Set([...equipes.map(q => q.nome), x.equipe].filter(Boolean))].map(n => `<option ${n === x.equipe ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <label class="pes"><input type="number" min="0" inputmode="numeric" data-eqp value="${x.pessoas || ''}" ${ed ? '' : 'disabled'}><span>pessoas</span></label>
      ${ed ? `<button type="button" class="rm" data-eqrm aria-label="Remover">${ic('x')}</button>` : ''}</div>`).join('')}
      ${ed ? `<button type="button" class="linkbtn" data-eqadd>${ic('plus')} equipe</button> <button type="button" class="linkbtn" data-eqnova>${ic('users')} cadastrar equipe</button>` : ''}</div>
    ${e.itens.filter(i => i.situacao !== 'concluido' || DIA.lanc[i.id] || outrosDe(i.id).length).map(i => {
      const l = DIA.lanc[i.id] || {}, outros = outrosDe(i.id);
      const antes = num(i.executado) - num(l.salvo || 0), resta = num(i.prevista) - antes - num(l.qtd || 0);
      return `<div class="dia-it" data-it="${esc(i.id)}"><span class="nome"><b>${esc(i.servico)}</b>
        <small class="resta ${resta < 0 ? 'atrasado' : ''}">${resta < 0 ? 'acima do previsto em ' + nf(-resta) : 'faltam ' + nf(resta)} ${esc(i.unidade)} de ${nf(i.prevista)}</small>
        ${outros.length ? `<small>já lançado hoje: ${outros.map(x => esc(x.usuario) + ' ' + nf(x.qtd)).join(', ')}</small>` : ''}</span>
        <label class="q"><input type="number" step="any" min="0" inputmode="decimal" data-q value="${l.qtd || ''}" placeholder="0" ${ed ? '' : 'disabled'}><span>${esc(i.unidade)}</span></label>
        ${barra({ pct: i.prevista ? (antes + num(l.qtd || 0)) / i.prevista * 100 : 0, planejado: i.planejado, situacao: i.situacao })}</div>`;
    }).join('')}
    ${ed ? `<label class="linkbtn foto-et">${ic('camera')} Foto desta etapa<input type="file" accept="image/*" capture="environment" data-foto="${esc(cod)}"></label>` : ''}</div>`;
}
function desenharClima() {
  const el = $('#clima');
  if (!el) return;
  const c = DIA.clima, cond = DIA.condicao || c?.sugestao || '';
  const per = (t, p) => p ? `<div class="per"><small>${t}</small><b>${esc(p.desc)}</b><span>${nf(p.mm)} mm${p.tmax !== '' ? ' · ' + Math.round(p.tmin) + '–' + Math.round(p.tmax) + '°C' : ''}</span></div>` : '';
  el.innerHTML = `<div class="cab"><h3 style="flex:1;margin:0">${ic('cloud')} Clima</h3><small>${c ? esc(c.fonte + ' · ' + c.tipo) : ''}</small></div>
    ${c ? `<div class="pers">${per('Manhã (7–12h)', c.manha)}${per('Tarde (12–17h)', c.tarde)}<div class="per"><small>Dia</small><b>${nf(c.mm_dia)} mm</b><span>${Math.round(c.tmin)}–${Math.round(c.tmax)}°C · vento ${c.vento} km/h</span></div></div>
      ${c.sugestao === 'Parado por chuva' ? `<div class="aviso warn">${c.tipo === 'registrado' ? 'Choveu' : 'Chuva de'} ${nf(c.mm_trabalho)} mm entre 7h e 17h${c.tipo === 'registrado' ? '' : ' (hoje inclui a previsão das próximas horas)'} — limite ${nf(c.limite)} mm: sugestão <b>dia parado por chuva</b>. Confirme abaixo.</div>` : ''}`
      : `<small>${esc(DIA.climaMsg || (DIA.srv.offline ? 'Sem sinal: o clima é buscado quando o diário for enviado.' : 'Buscando o clima…'))}</small>`}
    <div class="seg" role="radiogroup" aria-label="Condição de trabalho">${['Trabalhável', 'Parcial', 'Parado por chuva'].map(x => `<button type="button" class="${cond === x ? 'on' : ''}" data-cond="${x}" ${DIA.editavel ? '' : 'disabled'}>${x}</button>`).join('')}</div>`;
  $$('#clima [data-cond]').forEach(b => { b.onclick = () => { DIA.condicao = b.dataset.cond; salvarRascunho(); desenharClima(); }; });
}
function ligarDiario() {
  if ($('#addEt')) $('#addEt').onchange = e => { if (!e.target.value) return; DIA.etapas.push(e.target.value); if (!DIA.eq[e.target.value]) DIA.eq[e.target.value] = [{ equipe: '', pessoas: '' }]; salvarRascunho(); redesenharEtapas(); };
  ligarEtapasDia();
  const ocorr = $('#ocorr'), obsD = $('#obsD');
  if (ocorr) ocorr.oninput = () => { DIA.ocorrencias = ocorr.value; salvarRascunho(); };
  if (obsD) obsD.oninput = () => { DIA.obs = obsD.value; salvarRascunho(); };
  $$('[data-foto]').forEach(inp => { inp.onchange = () => { const f = inp.files[0]; inp.value = ''; if (f) tirarFoto(f, inp.dataset.foto); }; });
  if ($('#dSalvar')) $('#dSalvar').onclick = () => enviarDiario(false);
  if ($('#dEnviar')) $('#dEnviar').onclick = () => enviarDiario(true);
  if ($('#dRev')) $('#dRev').onclick = async () => { try { toast((await api('exec_revisar', { data: DIA.data })).msg); esquecerDia(DIA.data); await carregarExec(true); vDiario(DIA.data); } catch (e) { toast(e.message, 1); } };
  if ($('#dRdo')) $('#dRdo').onclick = () => imprimirRdo(DIA.data);
}
function redesenharEtapas() {
  $('#dEtapas').innerHTML = DIA.etapas.map(blocoEtapa).join('');
  const sel = $('#addEt');
  if (sel) [...sel.options].forEach(o => { if (o.value && DIA.etapas.includes(o.value)) o.remove(); });
  if (sel) sel.value = '';
  ligarEtapasDia();
  $$('#dEtapas [data-foto]').forEach(inp => { inp.onchange = () => { const f = inp.files[0]; inp.value = ''; if (f) tirarFoto(f, inp.dataset.foto); }; });
}
function ligarEtapasDia() {
  $$('#dEtapas .dia-et').forEach(b => {
    const cod = b.dataset.et;
    $$('.dia-it', b).forEach(r => {
      const id = r.dataset.it, inp = $('[data-q]', r);
      inp.oninput = () => {
        const l = DIA.lanc[id] = DIA.lanc[id] || { cid: uid(), salvo: 0 };
        l.qtd = inp.value === '' ? '' : num(inp.value);
        salvarRascunho();
        const i = itemDe(id), antes = num(i.executado) - num(l.salvo || 0), resta = num(i.prevista) - antes - num(l.qtd || 0);
        const sm = $('.resta', r);
        sm.textContent = (resta < 0 ? 'acima do previsto em ' + nf(-resta) : 'faltam ' + nf(resta)) + ' ' + i.unidade + ' de ' + nf(i.prevista);
        sm.classList.toggle('atrasado', resta < 0);
        const p = i.prevista ? (antes + num(l.qtd || 0)) / i.prevista * 100 : 0, bar = $('.pbar', r);
        bar.classList.toggle('exc', p > 100);
        $('span', bar).style.width = Math.min(100, p) + '%';
      };
    });
    const eqs = () => (DIA.eq[cod] = DIA.eq[cod] || []);
    $$('.eq', b).forEach(row => {
      const k = +row.dataset.k, n = $('[data-eqn]', row), p = $('[data-eqp]', row);
      n.onchange = () => { eqs()[k].equipe = n.value; const q = (EX.d.equipes || []).find(x => x.nome === n.value); if (q && !p.value) { p.value = q.pessoas; eqs()[k].pessoas = num(q.pessoas); } salvarRascunho(); };
      p.oninput = () => { eqs()[k].pessoas = p.value === '' ? '' : num(p.value); salvarRascunho(); };
      const rm = $('[data-eqrm]', row);
      if (rm) rm.onclick = () => { eqs().splice(k, 1); salvarRascunho(); redesenharEtapas(); };
    });
    const add = $('[data-eqadd]', b);
    if (add) add.onclick = () => { eqs().push({ equipe: '', pessoas: '' }); salvarRascunho(); redesenharEtapas(); };
    const nova = $('[data-eqnova]', b);
    if (nova) nova.onclick = () => mEquipe(null, () => redesenharEtapas());
  });
}
async function enviarDiario(enviar) {
  const lancamentos = [];
  DIA.etapas.forEach(cod => (etapaDe(cod)?.itens || []).forEach(i => {
    const l = DIA.lanc[i.id];
    if (!l) return;
    if (l.qtd === '' && !l.salvo) return;
    lancamentos.push({ cliente_id: l.cid, item_id: i.id, qtd: l.qtd === '' ? 0 : l.qtd, obs: l.obs || '' });
  }));
  const equipes = [];
  DIA.etapas.forEach(cod => (DIA.eq[cod] || []).forEach(x => { if (x.equipe || num(x.pessoas)) equipes.push({ etapa: cod, equipe: x.equipe || 'Equipe', pessoas: num(x.pessoas) }); }));
  const motivo = $('#motivo') ? $('#motivo').value.trim() : '';
  if ($('#motivo') && motivo.length < 5) return toast('Informe o motivo do lançamento em dia anterior.', 1);
  if (enviar && !lancamentos.some(l => num(l.qtd) > 0) && DIA.condicao !== 'Parado por chuva' && !DIA.srv.lancamentos.length && !confirm('Nenhuma quantidade lançada. Enviar o diário mesmo assim?')) return;
  const b = enviar ? $('#dEnviar') : $('#dSalvar');
  if (b) { b.disabled = true; b.textContent = 'Enviando…'; }
  if (!EX.d.obra.lat && !GPS) await pegarGPS(6000);
  // hoje: atualiza o clima com as horas que já passaram
  if (DIA.data === hoje() && navigator.onLine !== false) { const c = await climaObra(DIA.data); if (c) DIA.clima = c; }
  try {
    const r = await enviarExec('exec_diario_salvar', {
      data: DIA.data, lancamentos, equipes, etapas: DIA.etapas, condicao: DIA.condicao || DIA.clima?.sugestao || '', ocorrencias: DIA.ocorrencias, obs: DIA.obs, enviar, motivo,
      clima: DIA.clima && DIA.srv.diario?.clima_final !== 'Sim' ? DIA.clima : null, gps: GPS ? { lat: GPS.lat, lng: GPS.lng } : null
    });
    LS.del(chaveRasc(DIA.data));
    toast(r.msg, r.excedidos && r.excedidos.length);
    if (r.offline) {
      // sem sinal: mantém o rascunho no aparelho até a fila subir (o mesmo código de lançamento evita somar duas vezes)
      LS.set(chaveRasc(DIA.data), JSON.stringify({ etapas: DIA.etapas, lanc: DIA.lanc, eq: DIA.eq, condicao: DIA.condicao, ocorrencias: DIA.ocorrencias, obs: DIA.obs }));
      if (b) { b.disabled = false; b.textContent = enviar ? 'Enviar diário' : 'Salvar rascunho'; }
      return;
    }
    esquecerDia(DIA.data);
    await carregarExec(true);
    vDiario(DIA.data);
  } catch (e) { toast(e.message, 1); if (b) { b.disabled = false; b.textContent = enviar ? 'Enviar diário' : 'Salvar rascunho'; } }
}

/* ---------- fotos: carimbo com data, hora e GPS gravado na própria imagem ---------- */
function carregarImg(f) {
  return new Promise((ok, no) => { const u = URL.createObjectURL(f), img = new Image(); img.onload = () => { ok(img); URL.revokeObjectURL(u); }; img.onerror = () => { URL.revokeObjectURL(u); no(new Error('Não consegui abrir a foto.')); }; img.src = u; });
}
async function tirarFoto(file, etapa) {
  const agora = new Date(), recente = Math.abs(agora - file.lastModified) < 10 * 60000;
  const quando = recente ? agora : new Date(file.lastModified);
  toast('Preparando a foto…');
  const [img, gps] = await Promise.all([carregarImg(file), recente ? pegarGPS(8000) : Promise.resolve(null)]).catch(e => { toast(e.message, 1); return []; });
  if (!img) return;
  const legenda = prompt('Legenda da foto (opcional):', '') || '';
  const e = etapaDe(etapa);
  const linhas = [
    `${S.dados.obra.nome}${e ? ' · ' + e.nome : ''}`,
    `${quando.toLocaleDateString('pt-BR')} ${quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${gps ? ` · ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : recente ? ' · sem GPS' : ' · da galeria'}`,
    legenda
  ].filter(Boolean);
  const desenha = max => {
    const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, c.width, c.height);
    const fs = Math.max(12, Math.round(c.width / 40)), h = fs * 1.45 * linhas.length + fs;
    g.fillStyle = 'rgba(10,31,82,.72)'; g.fillRect(0, c.height - h, c.width, h);
    g.fillStyle = '#fff'; g.font = `600 ${fs}px system-ui, sans-serif`; g.textBaseline = 'top';
    linhas.forEach((t, n) => g.fillText(t, fs * .7, c.height - h + fs * .5 + n * fs * 1.45, c.width - fs * 1.4));
    g.font = `700 ${Math.round(fs * .9)}px system-ui, sans-serif`; g.textAlign = 'right'; g.fillText('SIZE', c.width - fs * .7, c.height - h + fs * .5);
    return c.toDataURL('image/jpeg', max > 1000 ? 0.8 : 0.7).split(',')[1];
  };
  const op = {
    data: DIA.data, etapa: etapa || '', cliente_id: uid(), foto: { b64: desenha(1600) }, mini: { b64: desenha(480) },
    lat: gps ? gps.lat : '', lng: gps ? gps.lng : '', tirada_em: quando.toLocaleDateString('sv-SE') + ' ' + quando.toTimeString().slice(0, 5), legenda
  };
  DIA.locais = DIA.locais || [];
  DIA.locais.push({ id: op.cliente_id, mini: op.mini.b64, legenda, envio: 'enviando…' });
  $('#fotos').innerHTML = fotosHtml();
  try {
    const r = await enviarExec('exec_foto', op);
    const l = DIA.locais.find(x => x.id === op.cliente_id);
    l.envio = r.offline ? 'guardada no aparelho' : 'enviada';
    if (!r.offline) { EX.fotos[op.cliente_id] = op.mini.b64; esquecerDia(op.data); }
    toast(r.msg);
  } catch (x) { toast(x.message, 1); DIA.locais = DIA.locais.filter(l => l.id !== op.cliente_id); }
  $('#fotos').innerHTML = fotosHtml(); carregarMinis();
}
function fotosHtml() {
  const srv = DIA.srv.fotos || [], loc = (DIA.locais || []).filter(l => !srv.some(f => f.id === l.id || f.cliente_id === l.id));
  return srv.map(f => `<figure data-foto-id="${esc(f.id)}"><img alt="" ${EX.fotos[f.id] ? `src="data:image/jpeg;base64,${EX.fotos[f.id]}"` : ''}><figcaption>${esc(f.legenda || etapaDe(f.etapa)?.nome || '')}<small>${esc(String(f.tirada_em || '').slice(11, 16))}</small></figcaption></figure>`).join('')
    + loc.map(l => `<figure class="${l.envio === 'enviada' ? '' : 'local'}"><img alt="" src="data:image/jpeg;base64,${l.mini}"><figcaption>${esc(l.legenda)}<small>${esc(l.envio)}</small></figcaption></figure>`).join('')
    || '<small class="vazio">Nenhuma foto. As fotos saem com data, hora e localização gravadas.</small>';
}
async function carregarMinis() {
  for (const fig of $$('#fotos figure[data-foto-id]')) {
    const id = fig.dataset.fotoId, img = $('img', fig);
    fig.onclick = () => verFoto(id);
    if (EX.fotos[id]) continue;
    try { const r = await api('exec_foto_ver', { id, mini: true }); EX.fotos[id] = r.b64; img.src = 'data:image/jpeg;base64,' + r.b64; } catch (e) { /* sem sinal */ }
  }
}
async function verFoto(id) {
  modal('Foto', '<div class="carregando"><span class="spin"></span></div>', { semRodape: true, larga: true });
  try { const r = await api('exec_foto_ver', { id }); $('#modal .mcorpo').innerHTML = `<img class="visor-img" src="data:image/jpeg;base64,${r.b64}" alt=""><a class="btn sec" download="${esc(r.nome)}" href="data:image/jpeg;base64,${r.b64}">Baixar</a>`; }
  catch (e) { $('#modal .mcorpo').innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; }
}

/* ---------- lista de diários ---------- */
async function vDiarios(qs) {
  titulo('Diários (RDO)');
  const D = await carregarExec(true);
  const k = new URLSearchParams(qs || '').get('k') || 'todos';
  const F = {
    todos: ['Todos', 'layers', () => true], Rascunho: ['Rascunhos', 'edit', d => d.status === 'Rascunho'], Enviado: ['A revisar', 'clock', d => d.status === 'Enviado'],
    Revisado: ['Revisados', 'check', d => d.status === 'Revisado'], aditivo: ['Aditivo especial', 'plus', d => d.aditivo === 'Sim'], chuva: ['Parados por chuva', 'cloud', d => d.condicao === 'Parado por chuva']
  };
  const grupos = [{ t: 'Ver', itens: Object.entries(F).map(([x, v]) => ({ k: x, t: v[0], i: v[1], n: D.diarios.filter(v[2]).length, on: x === k })) }];
  if (can(['exec_lancar', 'exec_planejar'])) grupos.push({ t: 'Ações', itens: [{ k: 'hoje', t: 'Diário de hoje', i: 'book', cl: 'acao' }] });
  const l = D.diarios.filter((F[k] || F.todos)[2]);
  view(comEtapas(grupos, `<div class="cab"><h2>${(F[k] || F.todos)[0]}</h2><span class="contagem">${plural(l.length, 'diário', 'diários')}</span></div>${filaInfo()}
    <div class="card" style="padding:4px 14px">${l.map(d => `<div class="arq rdo-l" data-d="${esc(d.data)}"><span class="nome"><b>${rdoN(d.numero)}</b> · ${fd(d.data)} <small>${dsem(d.data)}</small>
      ${d.aditivo === 'Sim' ? '<span class="badge exc">aditivo</span>' : ''}<br><small>${esc([d.condicao, d.mm !== '' && d.mm != null ? nf(d.mm) + ' mm' : '', d.responsavel, d.revisado_por && 'revisado: ' + d.revisado_por].filter(Boolean).join(' · '))}</small></span>
      <span class="badge ${d.status === 'Revisado' ? 'b-ok' : d.status === 'Enviado' ? 'b-lib' : 'b-apr'}">${esc(d.status)}</span>
      <button class="icbtn" data-rdo="${esc(d.data)}" title="RDO (PDF)">${ic('printer')}</button></div>`).join('') || '<p class="vazio">Nenhum diário.</p>'}</div>`));
  ligarEtapas(x => { if (x === 'hoje') { location.hash = '#/diario'; return; } location.hash = '#/diarios' + (x === 'todos' ? '' : '?k=' + x); });
  $$('[data-d]').forEach(el => { el.onclick = e => { if (e.target.closest('[data-rdo]')) return; location.hash = '#/diario/' + el.dataset.d; }; });
  $$('[data-rdo]').forEach(b => { b.onclick = () => imprimirRdo(b.dataset.rdo); });
}

/* ---------- equipes ---------- */
async function vEquipes() {
  titulo('Equipes');
  const D = await carregarExec(true);
  view(`<div class="cab"><h2>${plural(D.equipes.length, 'equipe', 'equipes')}</h2><button class="btn" id="novaEq">${ic('plus')} Nova equipe</button></div>
    <div class="card" style="padding:4px 14px">${D.equipes.map(q => `<div class="arq" data-q="${esc(q.codigo)}" style="cursor:pointer"><span class="nome"><b>${esc(q.nome)}</b>${ativo(q, 'ativa') ? '' : ' <span class="badge b-canc">inativa</span>'}<br>
      <small>${plural(num(q.pessoas), 'pessoa', 'pessoas')}${q.encarregado ? ' · ' + esc(q.encarregado) : ''}</small></span></div>`).join('') || '<p class="vazio">Nenhuma equipe. Cadastre as equipes que trabalham na obra (ex: Equipe Pavimentação · 8 pessoas).</p>'}</div>
    <small>No diário, o encarregado marca qual equipe trabalhou em cada etapa; a quantidade de pessoas vem daqui e pode ser ajustada no dia.</small>`);
  $('#novaEq').onclick = () => mEquipe(null, vEquipes);
  $$('[data-q]').forEach(el => { el.onclick = () => mEquipe(D.equipes.find(q => q.codigo === el.dataset.q), vEquipes); });
}
function mEquipe(q, depois) {
  modal(q ? 'Editar equipe' : 'Nova equipe', `<label>Nome<input name="nome" required value="${esc(q?.nome || '')}" placeholder="ex: Equipe Pavimentação"></label>
    <div class="g2"><label>Pessoas<input name="pessoas" type="number" min="0" inputmode="numeric" value="${esc(q?.pessoas ?? '')}"></label><label>Encarregado <small>(opcional)</small><input name="encarregado" value="${esc(q?.encarregado || '')}"></label></div>
    ${q ? `<label class="ck"><input type="checkbox" name="ativa" ${ativo(q, 'ativa') ? 'checked' : ''}> Ativa</label>` : ''}`, {
    ok: 'Salvar', onOk: async f => { toast((await api('exec_equipe_salvar', { codigo: q?.codigo, nome: f.nome.value, pessoas: f.pessoas.value, encarregado: f.encarregado.value, ativa: f.ativa ? f.ativa.checked : true })).msg); await carregarExec(true); depois && depois(); }
  });
}

/* =====================================================================
 * RDO — página pronta para imprimir ou "Salvar como PDF" (cabeçalho, rodapé e marca d'água)
 * ===================================================================== */
async function imprimirRdo(data) {
  toast('Montando o RDO…');
  let r;
  try { r = await api('exec_rdo', { data }); } catch (e) { return toast(e.message, 1); }
  const d = r.diario, c = d.clima, n = rdoN(d.numero);
  const per = (t, p) => p ? `<td><b>${t}</b><br>${esc(p.desc)}<br>${nf(p.mm)} mm · ${p.tmax !== '' ? Math.round(p.tmin) + '–' + Math.round(p.tmax) + '°C' : ''}</td>` : '';
  const totPes = r.equipes.reduce((t, e) => t + e.pessoas, 0);
  const el = document.createElement('div');
  el.id = 'rdo';
  el.innerHTML = `<div class="rdo-barra"><button class="btn" id="rdoImp">${ic('printer')} Imprimir / Salvar PDF</button><button class="btn sec" id="rdoFechar">Fechar</button>
      <small>Para PDF, escolha "Salvar como PDF" na impressora.</small></div>
    <div class="rdo-folha"><div class="rdo-marca"><img src="logo.png" alt=""></div>
    <table class="rdo-t"><thead><tr><td><div class="rdo-cab"><img src="logo.png" alt="Size Engenharia"><div><b>RELATÓRIO DIÁRIO DE OBRA</b><span>${esc(r.obra.nome)}${r.obra.endereco ? ' · ' + esc(r.obra.endereco) : ''}</span></div>
      <div class="rdo-num"><b>${n}</b><span>${fd(r.data)} · ${DSEM[r.dia_semana]}</span>${r.util ? '' : '<em>ADITIVO ESPECIAL</em>'}</div></div></td></tr></thead>
    <tfoot><tr><td><div class="rdo-rod"><span>${esc(r.empresa)} · ${n} · ${esc(r.obra.nome)}</span><span>${d.status === 'Revisado' ? 'Revisado por ' + esc(d.revisado_por) + ' em ' + fdh(d.revisado_em) : 'Status: ' + esc(d.status)}</span><span>Gerado em ${new Date().toLocaleString('pt-BR')}</span></div></td></tr></tfoot>
    <tbody><tr><td>
      <h4>Condições do dia</h4>
      <table class="rdo-g"><tr>${c ? per('Manhã', c.manha) + per('Tarde', c.tarde) + `<td><b>Total do dia</b><br>${nf(c.mm_dia)} mm de chuva<br>vento até ${c.vento} km/h</td>` : '<td>Clima não registrado</td>'}
        <td class="cond cond-${norm(d.condicao).replace(/\W+/g, '-')}"><b>Condição de trabalho</b><br>${esc(d.condicao || '—')}</td></tr></table>
      <h4>Efetivo</h4>
      ${r.equipes.length ? `<table class="rdo-g"><tr><th>Etapa</th><th>Equipe</th><th class="n">Pessoas</th></tr>${r.equipes.map(e => `<tr><td>${esc(e.etapa)}</td><td>${esc(e.equipe)}</td><td class="n">${e.pessoas}</td></tr>`).join('')}<tr class="tot"><td colspan="2">Total</td><td class="n">${totPes}</td></tr></table>` : '<p>Sem equipes registradas.</p>'}
      <h4>Serviços executados</h4>
      ${r.servicos.length ? `<table class="rdo-g"><tr><th>Etapa</th><th>Serviço</th><th class="n">No dia</th><th class="n">Acumulado</th><th class="n">Previsto</th><th class="n">%</th></tr>
        ${r.servicos.map(s => `<tr><td>${esc(s.etapa)}</td><td>${esc(s.servico)}${s.obs ? '<br><small>' + esc(s.obs) + '</small>' : ''}</td><td class="n"><b>${nf(s.dia)}</b> ${esc(s.unidade)}</td><td class="n">${nf(s.acumulado)}</td><td class="n">${nf(s.previsto)}</td><td class="n">${pct(s.pct)}</td></tr>`).join('')}</table>` : '<p>Nenhum serviço lançado.</p>'}
      <h4>Ocorrências</h4><p class="rdo-txt">${esc(d.ocorrencias || 'Nenhuma.')}</p>
      ${d.obs ? `<h4>Observações</h4><p class="rdo-txt">${esc(d.obs)}</p>` : ''}
      ${r.avisos.length ? `<h4>Avisos da engenharia</h4>${r.avisos.map(a => `<p class="rdo-txt"><b>${esc(a.tipo)}</b> · ${esc(a.etapa_nome)}: ${esc(a.texto)} <small>(${esc(a.autor)}, ${fd(a.data)}${a.ciente_por ? ' · ciente ' + esc(a.ciente_por) : ''})</small></p>`).join('')}` : ''}
      ${r.fotos.length ? `<h4>Registro fotográfico</h4><div class="rdo-fotos">${r.fotos.filter(f => f.b64).map(f => `<figure><img src="data:image/jpeg;base64,${f.b64}" alt=""><figcaption>${esc(f.legenda || '')} <small>${f.tirada_em ? new Date(f.tirada_em).toLocaleString('pt-BR') : ''}${f.lat ? ' · ' + Number(f.lat).toFixed(5) + ', ' + Number(f.lng).toFixed(5) : ''}</small></figcaption></figure>`).join('')}</div>` : ''}
      <div class="rdo-ass"><div><span></span>${esc(d.responsavel || 'Encarregado')}<small>Encarregado / responsável pelo diário</small></div><div><span></span>${esc(d.revisado_por || '')}<small>Engenheiro responsável</small></div></div>
    </td></tr></tbody></table></div>`;
  document.body.appendChild(el);
  document.body.classList.add('com-rdo');
  const fechar = () => { el.remove(); document.body.classList.remove('com-rdo'); document.title = 'Size Engenharia'; };
  $('#rdoFechar', el).onclick = fechar;
  $('#rdoImp', el).onclick = () => { document.title = n + ' ' + r.obra.nome + ' ' + fd(r.data).replace(/\//g, '-'); window.print(); };
}

/* ---------- rotas do módulo ---------- */
ROTAS.push(
  [/^#\/exec$/, vExec], [/^#\/exec\/etapa\/(.+)$/, vEtapa], [/^#\/exec\/equipes$/, vEquipes],
  [/^#\/diario(?:\/(\d{4}-\d{2}-\d{2}))?$/, vDiario], [/^#\/diarios(?:\?(.*))?$/, vDiarios]
);
