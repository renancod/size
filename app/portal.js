/* Portal do cliente: o cliente acompanha a obra dele, só leitura, com a cor, o nome e o ícone do empreendimento.
 * Abre pelo endereço próprio (c/<slug>/, que define window.CLIENTE) ou pelo app normal quando quem entra é usuário de cliente.
 * O servidor só devolve o que o cliente pode ver (rotas cli_*); aqui é só a apresentação. */
Object.assign(IC, {
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  pdf: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15h6M9 18h4'
});
const PC = { fotos: new Map() };
/* no endereço próprio (c/<slug>/) a página usa <base href="../../"> para achar os arquivos do app; com isso um link "#/c/…"
 * iria para a raiz do site (o app da Size). Os links de tela trocam só o "#" do endereço atual. */
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="#"]');
  if (!a || !document.querySelector('base') || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  location.hash = a.getAttribute('href');
}, true);

/* cor do cliente: escurece cores claras demais para o texto continuar legível sobre o branco (contraste ≥ 4,5) */
function pcCor(hex) {
  let c = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#1D6F5F';
  const lum = h => { const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const esc = (h, f) => '#' + [1, 3, 5].map(i => Math.round(parseInt(h.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('');
  for (let k = 0; k < 20 && lum(c) > 0.18; k++) c = esc(c, 0.9);
  return c.toUpperCase();
}
function pcClaro(hex, a) { const n = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return '#' + n.map(x => Math.round(x * a + 255 * (1 - a)).toString(16).padStart(2, '0')).join(''); }
function pcTema(cor) {
  const c = pcCor(cor), r = document.documentElement.style;
  [['--pc', c], ['--pc-l', pcClaro(c, 0.1)], ['--navy', c], ['--navy2', c], ['--teal', c], ['--teal-l', pcClaro(c, 0.1)], ['--bg', '#F6F7F9']].forEach(([k, v]) => r.setProperty(k, v));
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = c;
  document.body.classList.add('portal');
}
const pcCli = () => (S.sess && S.sess.cliente) || window.CLIENTE || {};
const pcTem = m => (pcCli().modulos || []).includes(m);
const pcData = s => s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : '';
const pcPct = n => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString('pt-BR') + '%';
const PC_SIT = { concluida: ['Concluída', 'ok'], concluido: ['Concluída', 'ok'], atrasada: ['Atrasada', 'err'], atrasado: ['Atrasada', 'err'], atencao: ['Atenção', 'warn'], risco: ['Atenção', 'warn'],
  a_iniciar: ['A iniciar', ''], nao_iniciado: ['A iniciar', ''], adiantada: ['Adiantada', 'ok'], em_dia: ['Em dia', 'ok'], no_prazo: ['Em dia', 'ok'], sem_datas: ['Sem datas', ''] };
const pcSit = s => { const x = PC_SIT[s] || [s ? String(s).replace(/_/g, ' ') : '', '']; return x[0] ? `<span class="pc-chip ${x[1]}">${esc(x[0])}</span>` : ''; };
function pcBarra(prev, exec) { return `<div class="pc-bar"><i style="width:${Math.min(100, prev || 0)}%" class="prev"></i><i style="width:${Math.min(100, exec || 0)}%"></i></div>`; }

/* ---------- login com a marca do empreendimento ---------- */
function portalLogin(msg) {
  const C = window.CLIENTE || {};
  pcTema(C.cor);
  document.title = C.nome || 'Acompanhamento da obra';
  $('#raiz').innerHTML = `<div class="pc-login" ${C.capa ? `style="background-image:url('${esc(C.capa)}')"` : ''}><form class="card" id="f">
    <div class="pc-login-h"><img src="c/${esc(C.slug)}/icon-192.png" alt=""><div><b>${esc(C.nome || '')}</b><small>Acompanhamento da obra</small></div></div>
    ${msg ? `<div class="aviso warn">${esc(msg)}</div>` : ''}
    <label>Usuário ou e-mail<input name="login" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
    <label>Senha<input name="senha" type="password" autocomplete="current-password" required></label>
    <button class="btn full">Entrar</button>${botaoInstalar('no-login')}</form></div>`;
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, b = $('button', f);
    b.disabled = true; b.textContent = 'Entrando…';
    try {
      const d = await api('login', { login: f.login.value, senha: f.senha.value });
      if (!d.cliente) throw new Error('Este acesso é da equipe da Size: entre pelo app da Size.');
      S.token = d.token; LS.set('cs_token', d.token);
      S.sess = d; LS.set('cs_sess', JSON.stringify(d));
      iniciar();
    } catch (x) { toast(x.message, 1); b.disabled = false; b.textContent = 'Entrar'; }
  };
}

/* ---------- estrutura: topo com a marca, conteúdo e menu de baixo ---------- */
function portalIniciar() {
  const C = pcCli();
  pcTema(C.cor);
  document.title = C.nome;
  const nav = [['#/c', 'Início', 'home', true], ['#/c/cronograma', 'Cronograma', 'cal', pcTem('cronograma')], ['#/c/diario', 'Diário', 'camera', pcTem('diario')],
    ['#/c/qualidade', 'Qualidade', 'shield', pcTem('fvs') && !pcTem('financeiro')], ['#/c/financeiro', 'Financeiro', 'money', pcTem('financeiro')], ['#/c/conta', 'Conta', 'user', true]].filter(x => x[3]);
  $('#raiz').innerHTML = `<div class="pc-shell">
    <header class="pc-top"><img src="${C.slug && C.publicado ? 'c/' + esc(C.slug) + '/icon-192.png' : 'icon-192.png'}" alt=""><div><b>${esc(C.nome)}</b><small id="titulo">${esc(C.obra_nome || '')}</small></div></header>
    <main class="view pc-view" id="view"></main>
    <nav class="pc-nav">${nav.map(([h, t, i]) => `<a href="${h}" data-h="${h}">${ic(i)}<span>${t}</span></a>`).join('')}</nav></div>`;
  if (!/^#\/c(\/|$)/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#/c');
  portalRotear();
  if (typeof pushSincronizar === 'function') pushSincronizar();
}
async function portalRotear() {
  if (!$('.pc-shell')) return;
  const h = location.hash || '#/c', id = ++rotaN;
  $$('.pc-nav a').forEach(a => a.classList.toggle('on', a.dataset.h === '#/c' ? h === '#/c' : h.indexOf(a.dataset.h) === 0));
  fecharModal();
  const R = [[/^#\/c$/, pcInicio], [/^#\/c\/cronograma$/, pcCrono], [/^#\/c\/diario$/, pcDiarios], [/^#\/c\/diario\/(\d{4}-\d{2}-\d{2})$/, pcDiario],
    [/^#\/c\/qualidade$/, pcFvs], [/^#\/c\/financeiro$/, pcFin], [/^#\/c\/conta$/, pcConta]];
  const r = R.find(([re]) => re.test(h));
  if (!r) { location.hash = '#/c'; return; }
  carregandoView();
  try { await r[1](...h.match(r[0]).slice(1)); }
  catch (e) { if (id === rotaN && S.token) view(`<div class="aviso erro">${esc(e.message)}</div><button class="btn sec" data-acao="rotear">Tentar de novo</button>`); }
  window.scrollTo(0, 0);
}
const pcTit = t => { const e = $('#titulo'); if (e) e.textContent = t; };

/* foto (miniatura) carregada depois que a tela aparece, uma de cada vez */
async function pcFotos(raiz) {
  for (const el of $$('[data-pcfoto]', raiz || document)) {
    const id = el.dataset.pcfoto;
    try {
      if (!PC.fotos.has(id)) PC.fotos.set(id, 'data:image/jpeg;base64,' + (await api('cli_foto', { id, mini: 1 })).b64);
      el.style.backgroundImage = `url('${PC.fotos.get(id)}')`; el.classList.add('ok');
    } catch (e) { el.classList.add('falha'); }
  }
}
async function pcPdf(acao, id) {
  const w = window.open('', '_blank');
  try {
    const r = await api(acao, { id }), bin = atob(r.b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' }));
    if (w) w.location = url; else location.href = url;
  } catch (e) { if (w) w.close(); toast(e.message, 1); }
}

/* ---------- telas ---------- */
async function pcInicio() {
  pcTit(pcCli().obra_nome || '');
  const d = await api('cli_inicio'), A = d.andamento;
  view(`<section class="pc-card pc-hero"><div class="pc-k">Andamento da obra</div>
      <div class="pc-big">${pcPct(A.pct_exec)}</div>${pcBarra(A.pct_prev, A.pct_exec)}
      <div class="pc-k">previsto para hoje: ${pcPct(A.pct_prev)}${A.fim ? ' · término previsto ' + pcData(A.fim) : ''}</div></section>
    ${d.diario !== undefined ? (d.diario ? `<a class="pc-card pc-lnk" href="#/c/diario/${d.diario.data}"><div class="pc-k">Último diário · ${pcData(d.diario.data)}${d.diario.condicao ? ' · ' + esc(d.diario.condicao.toLowerCase()) : ''}</div>
      ${d.diario.foto ? `<div class="pc-fotos"><div class="pc-foto" data-pcfoto="${esc(d.diario.foto)}"></div></div>` : ''}
      <div>${d.diario.servicos.slice(0, 3).map(esc).join(' · ') || 'Sem serviços lançados'}${d.diario.servicos.length > 3 ? ' · +' + (d.diario.servicos.length - 3) : ''}</div></a>`
      : '<section class="pc-card"><div class="pc-k">Diário de obra</div><div>Os registros aparecem aqui assim que a equipe liberar.</div></section>') : ''}
    ${d.financeiro ? `<a class="pc-card pc-lnk" href="#/c/financeiro"><div class="pc-k">Financeiro</div><div class="pc-grid2"><div><small>Contratado</small><b>${brl(d.financeiro.contratado)}</b></div><div><small>Pago</small><b>${brl(d.financeiro.pago)}</b></div></div>
      ${d.medicao ? `<div class="pc-k" style="margin-top:6px">Última medição: ${esc(d.medicao.numero || '')} · ${esc(d.medicao.empreiteiro)} · ${brl(d.medicao.valor)} · ${esc(d.medicao.status.toLowerCase())}</div>` : ''}</a>` : ''}
    ${d.proximas.length ? `<section class="pc-card"><div class="pc-k">Próximas etapas</div>${d.proximas.map(p => `<div class="pc-lin"><span>${esc(p.nome)}</span><small>inicia ${pcData(p.ini)}</small></div>`).join('')}</section>` : ''}`);
  pcFotos();
}
async function pcCrono() {
  pcTit('Cronograma');
  const d = await api('cli_cronograma');
  const M = d.meses.filter(m => m.pct_prev != null);
  const curva = M.length > 1 ? (() => {
    const W = 320, H = 120, x = i => 8 + i * (W - 16) / (M.length - 1), y = p => H - 10 - (Math.min(100, p || 0) / 100) * (H - 20);
    const linha = k => M.map((m, i) => m[k] == null ? null : `${x(i)},${y(m[k])}`).filter(Boolean).join(' ');
    return `<svg class="pc-curva" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva do previsto e do executado"><polyline class="prev" points="${linha('pct_prev')}"/><polyline points="${linha('pct_exec')}"/></svg>
      <div class="pc-leg"><span class="prev">previsto</span><span>executado</span></div>`;
  })() : '';
  view(`<section class="pc-card"><div class="pc-k">Obra inteira${d.inicio ? ' · ' + pcData(d.inicio) + ' a ' + pcData(d.fim) : ''}</div><div class="pc-big">${pcPct(d.pct_exec)}</div>${pcBarra(d.pct_prev, d.pct_exec)}${curva}</section>
    <section class="pc-card"><div class="pc-k">Etapas</div>${d.frentes.map(f => `<div class="pc-et"><div class="pc-lin"><b>${esc(f.nome)}</b>${pcSit(f.situacao)}</div>
      ${pcBarra(f.pct_prev, f.pct_exec)}<div class="pc-lin"><small>${f.ini ? pcData(f.ini) + ' a ' + pcData(f.fim) : 'sem datas'}</small><small>${pcPct(f.pct_exec)} executado</small></div></div>`).join('') || '<div>Sem etapas cadastradas.</div>'}</section>`);
}
async function pcDiarios() {
  pcTit('Diário de obra');
  const L = (await api('cli_diarios')).diarios;
  view(L.length ? L.map(d => `<a class="pc-card pc-lnk pc-dia" href="#/c/diario/${d.data}">${d.foto ? `<div class="pc-foto" data-pcfoto="${esc(d.foto)}"></div>` : `<div class="pc-foto vazio">${ic('camera')}</div>`}
      <div><b>${pcData(d.data)}</b><small>${esc(d.condicao || '')}${d.tmax !== '' && d.tmax != null ? ' · ' + nf(d.tmin) + '° a ' + nf(d.tmax) + '°' : ''}${d.fotos ? ' · ' + d.fotos + (d.fotos > 1 ? ' fotos' : ' foto') : ''}</small>
      <span>${d.servicos.slice(0, 2).map(esc).join(' · ')}${d.servicos.length > 2 ? ' · +' + (d.servicos.length - 2) : ''}</span></div></a>`).join('')
    : '<section class="pc-card"><div>Nenhum diário liberado ainda. Assim que a equipe liberar, os dias aparecem aqui com as fotos.</div></section>');
  pcFotos();
}
async function pcDiario(data) {
  pcTit('Diário de ' + pcData(data));
  const d = await api('cli_diario', { data });
  view(`<a class="linkbtn" href="#/c/diario">${ic('back')} Todos os dias</a>
    <section class="pc-card"><div class="pc-k">${pcData(d.data)} · diário nº ${d.numero}</div>
      <div class="pc-lin"><span>${ic('sun')} ${esc(d.condicao || '—')}</span><small>${d.tmax !== '' && d.tmax != null ? nf(d.tmin) + '° a ' + nf(d.tmax) + '°' : ''}</small></div>
      ${d.chuva_manha || d.chuva_tarde ? `<small>Manhã: ${esc(d.chuva_manha || '—')} · Tarde: ${esc(d.chuva_tarde || '—')}</small>` : ''}
      ${d.pessoas ? `<div class="pc-k" style="margin-top:6px">${d.pessoas} ${d.pessoas > 1 ? 'pessoas' : 'pessoa'} trabalhando</div>` : ''}</section>
    <section class="pc-card"><div class="pc-k">Serviços do dia</div>${d.servicos.map(s => `<div class="pc-lin"><span>${esc(s.servico)}${s.etapa ? `<small> · ${esc(s.etapa)}</small>` : ''}</span><b>${nf(s.qtd)} ${esc(s.unidade || '')}</b></div>`).join('') || '<div>Sem serviços lançados.</div>'}</section>
    ${d.fotos.length ? `<section class="pc-card"><div class="pc-k">Fotos</div><div class="pc-galeria">${d.fotos.map(f => `<button type="button" class="pc-foto" data-pcfoto="${esc(f.id)}" data-ver="${esc(f.id)}" title="${esc(f.legenda)}"><span>${esc(f.legenda)}</span></button>`).join('')}</div></section>` : ''}`);
  $$('[data-ver]').forEach(b => { b.onclick = async () => {
    const f = d.fotos.find(x => x.id === b.dataset.ver);
    modal(esc(f.legenda || 'Foto'), '<div class="carregando"><span class="spin"></span></div>', { semRodape: true, larga: true });
    const caixa = $('#modal .mcaixa');
    try { const r = await api('cli_foto', { id: f.id }); if ($('#modal .mcaixa') === caixa) $('#modal .mcorpo').innerHTML = `<img class="pc-grande" src="data:image/jpeg;base64,${r.b64}" alt="${esc(f.legenda)}">${f.etapa ? `<small>${esc(f.etapa)}</small>` : ''}`; }
    catch (e) { fecharModal(); toast(e.message, 1); }
  }; });
  pcFotos();
}
async function pcFvs() {
  pcTit('Qualidade');
  const L = (await api('cli_fvs')).fvs;
  view(`<section class="pc-card"><div class="pc-k">Fichas de verificação aprovadas (FVS)</div>${L.map(f => `<div class="pc-lin"><span><b>${esc(f.numero || '')}</b> ${esc(f.servico || '')}${f.etapa ? `<small> · ${esc(f.etapa)}</small>` : ''}<br><small>aprovada ${pcData(f.aprovado_em)}</small></span>
    ${f.pdf ? `<button type="button" class="btn sec peq" data-fvs="${esc(f.id)}">${ic('pdf')} PDF</button>` : ''}</div>`).join('') || '<div>Nenhuma FVS aprovada ainda.</div>'}</section>`);
  $$('[data-fvs]').forEach(b => { b.onclick = () => pcPdf('cli_fvs_pdf', b.dataset.fvs); });
}
async function pcFin() {
  pcTit('Financeiro');
  const d = await api('cli_financeiro'), T = d.total;
  view(`<section class="pc-card"><div class="pc-grid2"><div><small>Contratado</small><b>${brl(T.contratado)}</b></div><div><small>Medido</small><b>${brl(T.medido)}</b></div>
      <div><small>Pago</small><b>${brl(T.pago)}</b></div><div><small>Saldo a medir</small><b>${brl(T.saldo)}</b></div></div></section>
    <section class="pc-card"><div class="pc-k">Contratos</div>${d.contratos.map(c => `<div class="pc-et"><div class="pc-lin"><b>${esc(c.numero || '')} · ${esc(c.empreiteiro)}</b><small>${esc(c.status)}</small></div>
      ${c.objeto ? `<small>${esc(c.objeto)}</small>` : ''}${pcBarra(c.pct_med, c.pct_pago)}
      <div class="pc-lin"><small>contratado ${brl(c.contratado)} · medido ${pcPct(c.pct_med)}</small><small>pago ${brl(c.pago)}</small></div></div>`).join('') || '<div>Nenhum contrato ainda.</div>'}</section>
    <section class="pc-card"><div class="pc-k">Medições</div>${d.medicoes.map(m => `<div class="pc-lin"><span><b>${esc(m.numero || '')}</b> ${esc(m.empreiteiro)}<br><small>${pcData(m.de)} a ${pcData(m.ate)} · ${m.status === 'Paga' ? 'paga ' + pcData(m.pago_em) : 'aprovada ' + pcData(m.aprovado_em)}</small></span>
      <span class="pc-dir"><b>${brl(m.valor)}</b>${m.pdf ? `<button type="button" class="btn sec peq" data-med="${esc(m.id)}">${ic('pdf')} PDF</button>` : ''}</span></div>`).join('') || '<div>Nenhuma medição aprovada ainda.</div>'}</section>
    ${pcTem('fvs') ? `<a class="pc-card pc-lnk" href="#/c/qualidade"><div class="pc-lin"><span>${ic('shield')} Qualidade (FVS aprovadas)</span>${ic('chevron')}</div></a>` : ''}`);
  $$('[data-med]').forEach(b => { b.onclick = () => pcPdf('cli_med_pdf', b.dataset.med); });
}
function pcConta() {
  pcTit('Minha conta');
  const u = S.sess.usuario, pode = typeof pushPossivel === 'function' && pushPossivel(), lig = pode && pushLigado();
  view(`<section class="pc-card"><div class="pc-k">Você</div><b>${esc(u.nome)}</b><small>${esc(u.login)}${u.email ? ' · ' + esc(u.email) : ''}</small></section>
    ${pode ? `<section class="pc-card"><div class="pc-k">Avisos no celular</div><div>Diário novo, medição aprovada ou paga e FVS aprovada.</div>
      <button type="button" class="btn ${lig ? 'sec' : ''}" id="pcPush" style="margin-top:8px">${ic('bell')} ${lig ? 'Desativar avisos' : 'Ativar avisos'}</button></section>` : ''}
    <form class="pc-card grid" id="f"><div class="pc-k">Trocar senha</div><label>Senha atual<input name="atual" type="password" autocomplete="current-password" required></label>
      <label>Nova senha (mín. 10 caracteres)<input name="nova" type="password" minlength="10" autocomplete="new-password" required></label><button class="btn">Salvar nova senha</button></form>
    ${botaoInstalar('')}
    <button class="btn perigo full" id="sair2">${ic('logout')} Sair</button>`);
  $('#sair2').onclick = () => sair();
  if ($('#pcPush')) $('#pcPush').onclick = async () => { try { if (pushLigado()) { await pushDesativar(); toast('Avisos desativados.'); } else { await pushAtivar(); toast('Avisos ativados.'); } pcConta(); } catch (e) { toast(e.message, 1); } };
  $('#f').onsubmit = async e => {
    e.preventDefault();
    try { const r = await api('trocarSenha', { atual: e.target.atual.value, nova: e.target.nova.value }); if (r.token) { S.token = r.token; LS.set('cs_token', r.token); } toast(r.msg); e.target.reset(); } catch (x) { toast(x.message, 1); }
  };
}
