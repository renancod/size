/* Portal do cliente: o cliente acompanha a obra dele, só leitura, com a cor, o nome e o ícone do empreendimento.
 * Abre pelo endereço próprio (c/<slug>/, que define window.CLIENTE) ou pelo app normal quando quem entra é usuário de cliente.
 * O servidor só devolve o que o cliente pode ver (rotas cli_*); aqui é só a apresentação. */
Object.assign(IC, {
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  pdf: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 15h6M9 18h4'
});
if (!IC.chart) IC.chart = 'M3 3v18h18M7 16l4-4 3 3 6-6';
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
/* empreendimentos do cliente e o escolhido (PC.obra, lembrado no aparelho); sessão antiga sem a lista = a obra única */
const pcEmps = () => { const C = pcCli(); return C.empreendimentos || (C.obra ? [{ id: '', nome: C.obra_nome || C.nome, modulos: C.modulos || [], tipo: '' }] : []); };
const pcEmp = () => { const L = pcEmps(); return L.find(e => e.id === PC.obra) || L[0] || null; };
const pcVarios = () => pcEmps().length > 1;
const pcTem = m => ((pcEmp() || {}).modulos || []).includes(m);
/* chamadas da obra levam o empreendimento escolhido */
const pcApi = (acao, d) => api(acao, Object.assign(pcEmp() && pcEmp().id ? { obra: pcEmp().id } : {}, d || {}));
function pcEscolher(id) {
  if (!pcEmps().some(e => e.id === id) || PC.obra === id) return;
  PC.obra = id; LS.set('pc_obra', id); PC.fotos.clear();
  pcNav();
}
const pcData = s => s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : '';
const pcPct = n => (Math.round((Number(n) || 0) * 10) / 10).toLocaleString('pt-BR') + '%';
const PC_SIT = { concluida: ['Concluída', 'ok'], concluido: ['Concluída', 'ok'], atrasada: ['Atrasada', 'err'], atrasado: ['Atrasada', 'err'], atencao: ['Atenção', 'warn'], risco: ['Atenção', 'warn'],
  a_iniciar: ['A iniciar', ''], nao_iniciado: ['A iniciar', ''], adiantada: ['Adiantada', 'ok'], em_dia: ['Em dia', 'ok'], no_prazo: ['Em dia', 'ok'], sem_datas: ['Sem datas', ''] };
const pcSit = s => { const x = PC_SIT[s] || [s ? String(s).replace(/_/g, ' ') : '', '']; return x[0] ? `<span class="pc-chip ${x[1]}">${esc(x[0])}</span>` : ''; };
function pcBarra(prev, exec) { return `<div class="pc-bar"><i style="width:${Math.min(100, prev || 0)}%" class="prev"></i><i style="width:${Math.min(100, exec || 0)}%"></i></div>`; }
/* anel de andamento: executado (cor do cliente) com a marca do previsto */
function pcAnel(exec, prev, n) {
  n = n || 132;
  const r = 52, C = 2 * Math.PI * r, e = Math.min(100, exec || 0), p = Math.min(100, prev || 0), ang = p / 100 * 2 * Math.PI - Math.PI / 2;
  return `<svg class="pc-anel" viewBox="0 0 132 132" width="${n}" height="${n}" role="img" aria-label="Executado ${pcPct(exec)}, previsto ${pcPct(prev)}">
    <circle cx="66" cy="66" r="${r}" class="fundo"/><circle cx="66" cy="66" r="${r}" class="feito" stroke-dasharray="${(e / 100 * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 66 66)"/>
    ${p ? `<circle cx="${(66 + r * Math.cos(ang)).toFixed(1)}" cy="${(66 + r * Math.sin(ang)).toFixed(1)}" r="5" class="prev"/>` : ''}
    <text x="66" y="64" text-anchor="middle" class="v">${pcPct(exec)}</text><text x="66" y="84" text-anchor="middle" class="t">executado</text></svg>`;
}
/* assinatura da Size: o app tem a marca do empreendimento, mas é uma plataforma da Size */
const pcAssina = cl => `<div class="pc-size ${cl || ''}"><img src="logo.png" alt="Size Engenharia"><span>Plataforma <b>Size Engenharia</b></span></div>`;
const pcRs = v => brl(v);
const pcIcone = C => C.slug && (C.publicado || window.CLIENTE) ? 'c/' + esc(C.slug) + '/icon-192.png' + (C.v || (window.CLIENTE || {}).v ? '?v=' + esc(C.v || window.CLIENTE.v) : '') : 'icon-192.png';
/* logo da empresa do cliente (quando publicada); sem ela, o ícone do app */
const pcLogo = (C, cl) => C.logo ? `<img class="pc-logo ${cl || ''}" src="${esc(C.logo)}" alt="${esc(C.nome || '')}">` : `<img src="${pcIcone(C)}" alt="">`;

/* ---------- login com a marca do empreendimento ---------- */
function portalLogin(msg) {
  const C = window.CLIENTE || {};
  pcTema(C.cor);
  document.title = C.nome || 'Acompanhamento da obra';
  $('#raiz').innerHTML = `<div class="pc-login" ${C.capa ? `style="background-image:url('${esc(C.capa)}')"` : ''}><form class="card" id="f">
    <div class="pc-login-h ${C.logo ? 'com-logo' : ''}">${C.logo ? `<img class="pc-logo" src="${esc(C.logo)}" alt="${esc(C.nome || '')}">` : `<img src="${pcIcone(C)}" alt="">`}<div><b>${esc(C.nome || '')}</b><small>Acompanhamento de obras e orçamentos</small></div></div>
    ${msg ? `<div class="aviso warn">${esc(msg)}</div>` : ''}
    <label>Usuário ou e-mail<input name="login" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
    <label>Senha<input name="senha" type="password" autocomplete="current-password" required></label>
    <button class="btn full">Entrar</button>${botaoInstalar('no-login')}${pcAssina()}</form></div>`;
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
  PC.obra = LS.get('pc_obra') || '';
  // celular: topo + menu embaixo; computador: menu à esquerda com a marca (o mesmo <nav>, arrumado pelo CSS)
  $('#raiz').innerHTML = `<div class="pc-shell">
    <header class="pc-top">${pcLogo(C)}<div><b>${esc(C.nome)}</b><small id="titulo"></small></div><span id="pcObraTopo"></span><span class="pc-selo">por Size Engenharia</span></header>
    <nav class="pc-nav"></nav>
    <main class="view pc-view" id="view"></main>
    <footer class="pc-rod">${pcAssina()}<small>Acompanhamento de obras e orçamentos · dados da obra mantidos pela Size Engenharia</small></footer></div>`;
  pcNav();
  if (!/^#\/c(\/|$)/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#/c');
  portalRotear();
  if (typeof pushSincronizar === 'function') pushSincronizar();
}
/* menu: as abas da obra seguem o empreendimento escolhido (cada um tem o seu tipo); com mais de um, o seletor fica no menu */
function pcNav() {
  const C = pcCli(), E = pcEmp(), ob = !!E, orc = C.ve_orcamentos !== false && (!ob || C.orcamentos > 0), vs = pcVarios();
  const nav = [['#/c', 'Início', 'home', true], ['#/c/orcamentos', 'Orçamentos', 'file', orc], ['#/c/cronograma', 'Cronograma', 'cal', ob && pcTem('cronograma')], ['#/c/diario', 'Diário', 'camera', ob && pcTem('diario')],
    ['#/c/qualidade', 'Qualidade', 'shield', ob && pcTem('fvs')], ['#/c/financeiro', 'Financeiro', 'money', ob && pcTem('financeiro')],
    ['#/c/relatorios', 'Relatórios', 'pdf', ob && (pcTem('cronograma') || pcTem('diario') || pcTem('financeiro'))], ['#/c/conta', 'Conta', 'user', true]].filter(x => x[3]);
  const n = $('.pc-nav');
  if (!n) return;
  $('.pc-shell').classList.toggle('muitos', nav.length > 5);
  n.innerHTML = `<div class="pc-marca">${pcLogo(C)}<div><b>${esc(C.nome)}</b><small>${esc(C.empresa || '')}</small></div></div>
    ${vs ? `<button type="button" class="pc-obra-sel lado" data-trocar>${ic('building')}<span><small>Empreendimento</small><b>${esc(E.nome)}</b></span>${ic('chevron')}</button>` : ''}
    ${nav.map(([h, t, i]) => `<a href="${h}" data-h="${h}">${ic(i)}<span>${t}</span></a>`).join('')}${pcAssina('lado')}`;
  // celular: o seletor fica no topo
  $('#pcObraTopo').innerHTML = vs ? `<button type="button" class="pc-obra-sel topo" data-trocar title="Trocar de empreendimento">${esc(E.sigla || E.nome)} ▾</button>` : '';
  pcMarcarNav();
  $$('[data-trocar]').forEach(b => { b.onclick = pcTrocar; });
}
function pcMarcarNav() {
  const h = location.hash || '#/c', hn = /^#\/c\/rel\//.test(h) ? '#/c/relatorios' : /^#\/c\/obra\//.test(h) ? '#/c' : h;
  $$('.pc-nav a').forEach(a => a.classList.toggle('on', a.dataset.h === '#/c' ? hn === '#/c' : hn.indexOf(a.dataset.h.replace(/s$/, '')) === 0));
}
/* trocar de empreendimento sem voltar ao início: fica na mesma aba se o outro também tiver */
function pcTrocar() {
  modal('Empreendimentos', `<div class="pc-troca">${pcEmps().map(e => `<button type="button" class="pc-lin ${e.id === (pcEmp() || {}).id ? 'on' : ''}" data-ob="${esc(e.id)}"><span><b>${esc(e.nome)}</b><br><small>${esc(e.tipo || '')}${e.endereco ? ' · ' + esc(e.endereco) : ''}</small></span>${ic('chevron')}</button>`).join('')}</div>`, { semRodape: true });
  $$('#modal [data-ob]').forEach(b => { b.onclick = () => {
    fecharModal(); pcEscolher(b.dataset.ob);
    const aba = (location.hash.match(/^#\/c\/(cronograma|diario|qualidade|financeiro|relatorios)/) || [])[1], mod = { cronograma: 'cronograma', diario: 'diario', qualidade: 'fvs', financeiro: 'financeiro' }[aba];
    const ir = aba && (aba === 'relatorios' ? (pcTem('cronograma') || pcTem('diario') || pcTem('financeiro')) : pcTem(mod)) ? '#/c/' + aba : '#/c/obra/' + enc(b.dataset.ob);
    if (location.hash === ir) portalRotear(); else location.hash = ir;
  }; });
}
async function portalRotear() {
  if (!$('.pc-shell')) return;
  // aviso do sino de outro empreendimento: "…?o=<obra>" escolhe a obra e sai do endereço
  const mo = (location.hash || '').match(/^(#\/c[^?]*)\?o=([\w-]+)$/);
  if (mo) { pcEscolher(decodeURIComponent(mo[2])); history.replaceState(null, '', location.pathname + location.search + mo[1]); }
  const h = location.hash || '#/c', id = ++rotaN;
  pcMarcarNav();
  fecharModal();
  const R = [[/^#\/c$/, pcInicio], [/^#\/c\/obra\/([\w-]+)$/, pcObra], [/^#\/c\/relatorios$/, pcRels], [/^#\/c\/rel\/andamento\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/, pcRelAnd],
    [/^#\/c\/rel\/rdo\/(\d{4}-\d{2}-\d{2})$/, pcRelRdo], [/^#\/c\/rel\/financeiro$/, pcRelFin], [/^#\/c\/orcamentos$/, pcOrcs], [/^#\/c\/orcamento\/([\w-]+)$/, pcOrc], [/^#\/c\/cronograma$/, pcCrono], [/^#\/c\/diario$/, pcDiarios], [/^#\/c\/diario\/(\d{4}-\d{2}-\d{2})$/, pcDiario],
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
      if (!PC.fotos.has(id)) PC.fotos.set(id, 'data:image/jpeg;base64,' + (await pcApi('cli_foto', { id, mini: 1 })).b64);
      el.style.backgroundImage = `url('${PC.fotos.get(id)}')`; el.classList.add('ok');
    } catch (e) { el.classList.add('falha'); }
  }
}
async function pcPdf(acao, id) {
  const w = window.open('', '_blank');
  try {
    const r = await pcApi(acao, { id }), bin = atob(r.b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' }));
    if (w) w.location = url; else location.href = url;
  } catch (e) { if (w) w.close(); toast(e.message, 1); }
}

/* ---------- telas ---------- */
const pcHero = (C, titulo, sub, lado, capa, cl) => `<section class="pc-hero ${capa ? 'com-capa' : ''} ${cl || ''}" ${capa ? `style="--capa:url('${esc(capa)}')"` : ''}>
    <div class="pc-hero-t"><small>${esc(C.empresa || C.nome || '')}</small><h1>${esc(titulo)}</h1><span>${sub}</span></div>${lado || ''}</section>`;
const pcOrcCard = L => L.length ? `<a class="pc-card pc-lnk" href="#/c/orcamentos"><div class="pc-k">${ic('file')} Orçamentos</div>${L.slice(0, 3).map(o => `<div class="pc-lin"><span><b>${esc(o.rotulo)}</b> ${esc(o.empreendimento || '')}${o.respostas ? ` <span class="pc-chip ok">${o.respostas} resposta${o.respostas > 1 ? 's' : ''}</span>` : ''}</span>${pcStOrc(o)}</div>`).join('')}</a>` : '';
/* foto de cada empreendimento (a do cadastro ou a do último diário liberado), depois que a tela aparece */
async function pcEmpFotos() {
  for (const el of $$('[data-empfoto]')) {
    const k = 'emp|' + el.dataset.empfoto;
    try {
      if (!PC.fotos.has(k)) { const r = await api('cli_emp_foto', { obra: el.dataset.empfoto }); PC.fotos.set(k, r.b64 ? 'data:image/jpeg;base64,' + r.b64 : ''); }
      if (PC.fotos.get(k)) { el.style.setProperty('--capa', `url('${PC.fotos.get(k)}')`); el.classList.add('com-capa'); }
    } catch (e) { /* fica com a cor */ }
  }
}
async function pcInicio() {
  pcTit('');
  const E = pcEmps();
  if (E.length === 1) return pcObra(E[0].id);
  const d = await api('cli_inicio'), C = Object.assign({}, pcCli(), d.cliente), orcs = pcOrcCard(d.orcamentos || []);
  if (!d.empreendimentos && C.ve_orcamentos === false) {
    // acesso só de obra (ex.: engenheiro) e o cliente ainda sem obra: nada de orçamentos
    view(pcHero(C, 'Olá, ' + (S.sess.usuario.nome || '').split(' ')[0], 'Acompanhamento de obras da Size Engenharia para ' + esc(C.nome) + '.', '', C.capa || (window.CLIENTE || {}).capa || '')
      + `<div class="pc-grade"><section class="pc-card"><div class="pc-k">${ic('building')} Obras</div><div>Assim que a obra começar, você acompanha por aqui o andamento, o cronograma, o diário com as fotos e a qualidade (FVS).</div></section></div>`);
    return;
  }
  if (!d.empreendimentos) {
    view(pcHero(C, 'Olá, ' + (S.sess.usuario.nome || '').split(' ')[0], 'Acompanhe aqui os orçamentos da Size Engenharia para ' + esc(C.nome) + '.', '', C.capa || (window.CLIENTE || {}).capa || '')
      + `<div class="pc-grade">${orcs || '<section class="pc-card"><div class="pc-k">Orçamentos</div><div>Assim que a Size enviar um orçamento, ele aparece aqui para você analisar, comentar e aceitar.</div></section>'}
        <section class="pc-card"><div class="pc-k">${ic('check')} Como funciona</div><ol class="pc-passos"><li>Você recebe o orçamento e analisa item a item.</li><li>Deixa suas considerações: incluir, retirar, mudar quantidade ou tirar dúvidas.</li><li>A Size responde e envia a revisão.</li><li>Fechou? Aceite pelo app. Depois você acompanha a obra por aqui.</li></ol></section></div>`);
    return;
  }
  // vários empreendimentos: um cartão para cada, com a foto, o tipo e o andamento
  view(`<div class="pc-boas">${C.logo ? `<img class="pc-logo" src="${esc(C.logo)}" alt="">` : ''}<div><small>${esc(C.empresa || C.nome)}</small><h1>Olá, ${esc((S.sess.usuario.nome || '').split(' ')[0])}</h1><span>${d.empreendimentos.length} empreendimentos acompanhados pela Size Engenharia</span></div></div>
    <div class="pc-emps">${d.empreendimentos.map(e => { const A = e.andamento || {};
      return `<a class="pc-emp" href="#/c/obra/${enc(e.id)}"><div class="pc-emp-f" data-empfoto="${esc(e.id)}"><span class="pc-chip">${esc(e.tipo || '')}</span><b>${esc(e.sigla || '')}</b></div>
        <div class="pc-emp-t"><b>${esc(e.nome)}</b><small>${esc(e.endereco || '')}</small>
        ${A.erro ? '<small class="mute">andamento indisponível</small>' : `${pcBarra(A.pct_prev, A.pct_exec)}<div class="pc-lin"><small><b>${pcPct(A.pct_exec)}</b> executado · previsto ${pcPct(A.pct_prev)}</small><small>${A.fim ? 'término ' + pcData(A.fim) : ''}</small></div>`}</div></a>`; }).join('')}</div>
    ${orcs ? `<div class="pc-grade">${orcs}</div>` : ''}`);
  pcEmpFotos();
}
/* painel de um empreendimento: andamento, último diário, financeiro, próximas etapas e os orçamentos ligados a ele */
async function pcObra(id) {
  if (id) pcEscolher(id);
  const E = pcEmp();
  pcTit(pcVarios() ? 'Painel da obra' : '');
  const d = await pcApi('cli_inicio'), A = d.andamento, C = Object.assign({}, pcCli(), d.cliente), orcs = pcOrcCard(d.orcamentos || []);
  view((pcVarios() ? `<a class="linkbtn" href="#/c">${ic('back')} Todos os empreendimentos</a>` : '')
    + pcHero(C, d.obra.nome || C.nome, (E && E.tipo ? esc(E.tipo) + ' · ' : '') + (A.fim ? 'término previsto ' + pcData(A.fim) : 'acompanhamento da obra'), `<div class="pc-hero-anel">${pcAnel(A.pct_exec, A.pct_prev)}<small>previsto para hoje: <b>${pcPct(A.pct_prev)}</b></small></div>`, '', '').replace('<section class="pc-hero', `<section data-empfoto="${esc(d.obra.id)}" class="pc-hero`)
    + `<div class="pc-grade">
    ${d.diario !== undefined ? (d.diario ? `<a class="pc-card pc-lnk" href="#/c/diario/${d.diario.data}"><div class="pc-k">Último diário · ${pcData(d.diario.data)}${d.diario.condicao ? ' · ' + esc(d.diario.condicao.toLowerCase()) : ''}</div>
      ${d.diario.foto ? `<div class="pc-fotos"><div class="pc-foto" data-pcfoto="${esc(d.diario.foto)}"></div></div>` : ''}
      <div>${d.diario.servicos.slice(0, 3).map(esc).join(' · ') || 'Sem serviços lançados'}${d.diario.servicos.length > 3 ? ' · +' + (d.diario.servicos.length - 3) : ''}</div></a>`
      : '<section class="pc-card"><div class="pc-k">Diário de obra</div><div>Os registros aparecem aqui assim que a equipe liberar.</div></section>') : ''}
    ${d.financeiro ? `<a class="pc-card pc-lnk" href="#/c/financeiro"><div class="pc-k">Financeiro</div><div class="pc-grid2"><div><small>Contratado</small><b>${brl(d.financeiro.contratado)}</b></div><div><small>Pago</small><b>${brl(d.financeiro.pago)}</b></div></div>
      ${d.medicao ? `<div class="pc-k" style="margin-top:6px">Última medição: ${esc(d.medicao.numero || '')} · ${esc(d.medicao.empreiteiro)} · ${brl(d.medicao.valor)} · ${esc(d.medicao.status.toLowerCase())}</div>` : ''}</a>` : ''}
    ${d.proximas.length ? `<section class="pc-card"><div class="pc-k">${ic('cal')} Próximas etapas</div>${d.proximas.map(p => `<div class="pc-lin"><span>${esc(p.nome)}</span><small>inicia ${pcData(p.ini)}</small></div>`).join('')}</section>` : ''}
    ${orcs}</div>`);
  pcEmpFotos().then(() => pcFotos());
}

/* ---------- orçamentos (negociação) ---------- */
const PC_ORC_ST = { Enviado: ['Em negociação', 'warn'], Aprovado: ['Aprovado', 'ok'], Revisado: ['Substituído', ''], Perdido: ['Encerrado', ''] };
const pcStOrc = o => { const s = o.aceite ? ['Aceito', 'ok'] : PC_ORC_ST[o.status] || [o.status, '']; return `<span class="pc-chip ${s[1]}">${esc(s[0])}</span>`; };
async function pcOrcs() {
  pcTit('Orçamentos');
  const L = (await api('cli_orcamentos')).orcamentos;
  view(`<h2 class="pc-h">Orçamentos</h2>` + (L.length ? `<div class="pc-grade">${L.map(o => `<a class="pc-card pc-lnk pc-orc" href="#/c/orcamento/${esc(o.id)}">
      <div class="pc-lin"><b>${esc(o.rotulo)}</b>${pcStOrc(o)}</div><div>${esc(o.empreendimento || '')}</div>
      <div class="pc-big sm">${pcRs(o.total)}</div><small>enviado ${pcData(o.data)}${o.respostas ? ` · ${o.respostas} resposta${o.respostas > 1 ? 's' : ''} da Size` : ''}${o.abertos ? ` · ${o.abertos} consideração${o.abertos > 1 ? 'ões' : ''} aguardando` : ''}</small></a>`).join('')}</div>`
    : '<section class="pc-card">Nenhum orçamento enviado ainda.</section>'));
}
async function pcOrc(id) {
  const o = await api('cli_orcamento', { id }), aberto = o.modo === 'aberto', D = o.diferencas || { novos: [], alterados: [], retirados: [] };
  pcTit('Orçamento ' + o.rotulo);
  const marca = c => D.novos.includes(c) ? '<span class="pc-chip ok">novo</span>' : D.alterados.includes(c) ? '<span class="pc-chip warn">alterado</span>' : '';
  const coms = o.comentarios;
  view(`<a class="linkbtn" href="#/c/orcamentos">${ic('back')} Orçamentos</a>
    ${o.foto ? `<section class="pc-hero pc-orc-foto" id="pcOrcFoto"><div class="pc-hero-t"><small>${esc(o.cliente || '')}</small><h1>${esc(o.empreendimento || '')}</h1><span>${esc(o.local || '')}${o.tipo ? ' · ' + esc(o.tipo) + ' pela Size Engenharia' : ''}</span></div></section>` : ''}
    <section class="pc-card pc-orc-cab"><div><small>${esc(o.cliente || '')}</small><h2>${esc(o.empreendimento || '')}</h2><div class="pc-lin" style="justify-content:flex-start;gap:8px"><b>${esc(o.rotulo)}</b>${pcStOrc(o)}${o.local ? `<small>${esc(o.local)}</small>` : ''}</div></div>
      <div class="pc-orc-tot"><small>Valor total</small><b>${pcRs(o.total)}</b><small>data-base ${pcData(o.data_base)}${o.validade_ate ? ' · válido até ' + pcData(o.validade_ate) : ''}</small></div></section>
    ${o.resumo ? `<section class="pc-card pc-resumo">${[['Custo direto', o.resumo.custo, `material ${pcRs(o.resumo.v_mat)} · MO/serv. ${pcRs(o.resumo.v_serv)}`], ['BDI ' + pcPct(o.resumo.bdi_pct), o.resumo.bdi, 'sobre ' + o.resumo.bdi_base],
      ['Administração ' + pcPct(o.resumo.gestao_pct), o.resumo.gestao, 'sobre ' + o.resumo.gestao_base], ['Preço de venda', o.total, '']].map(([t, v, s]) => `<div><small>${esc(t)}</small><b>${pcRs(v)}</b>${s ? `<small>${esc(s)}</small>` : ''}</div>`).join('')}</section>` : ''}
    ${o.revisoes.length > 1 ? `<div class="pc-revs">${o.revisoes.map(r => `<a class="pc-chip ${r.id === o.id ? 'on' : ''}" href="#/c/orcamento/${esc(r.id)}">${esc(r.rotulo)}</a>`).join('')}</div>` : ''}
    ${o.obra_id ? `<a class="aviso ok pc-lnk" href="#/c/obra/${enc(o.obra_id)}">${ic('building')} <span>Este orçamento virou obra. <b>Acompanhar a obra</b></span> ${ic('chevron')}</a>`
      : o.aceite ? `<div class="aviso ok">${ic('check')} Aceito por <b>${esc(o.aceite.nome)}</b> em ${esc(o.aceite.em)}. A Size entra em contato para os próximos passos.</div>` : ''}
    ${o.diferencas && (D.novos.length || D.alterados.length || D.retirados.length) ? `<div class="aviso info"><b>O que mudou desde ${esc(D.de)}:</b> ${[D.novos.length && D.novos.length + ' novo' + (D.novos.length > 1 ? 's' : ''), D.alterados.length && D.alterados.length + ' alterado' + (D.alterados.length > 1 ? 's' : ''), D.retirados.length && D.retirados.length + ' retirado' + (D.retirados.length > 1 ? 's' : '') + ' (' + D.retirados.map(esc).join(', ') + ')'].filter(Boolean).join(' · ')}</div>` : ''}
    <div class="pc-orc-grade"><div>
    ${o.etapas.map(e => `<section class="pc-card pc-et-orc"><div class="pc-lin"><b>${esc(e.codigo ? e.codigo + ' · ' : '')}${esc(e.descricao)}</b><b>${pcRs(e.preco)}</b></div>
      <table class="pc-tab"><thead><tr><th>Item</th><th class="n">Quant.</th>${aberto ? '<th class="n">Unit.</th><th class="n">Total</th>' : ''}<th></th></tr></thead><tbody>
      ${e.itens.map(i => `<tr><td><small>${esc(i.codigo)}</small> ${esc(i.descricao)} ${marca(i.codigo)}
        ${aberto ? `<div class="pc-det">custo ${pcRs(i.custo_unit)}/${esc(i.unidade || 'un')} <small>(material ${pcRs(i.unit_mat)} + MO/serv. ${pcRs(i.unit_serv)})</small> · BDI ${i.sem_bdi ? '<small>não incide</small>' : pcRs(i.bdi)} · adm. ${i.sem_gestao ? '<small>não incide</small>' : pcRs(i.gestao)}${i.insumos ? ` · <button type="button" class="linkbtn" data-ins="${esc(i.codigo)}">ver insumos${i.fonte ? ' (SINAPI)' : ''}</button>` : ''}</div>` : ''}</td><td class="n">${nf(i.qtd)} ${esc(i.unidade || '')}</td>${aberto ? `<td class="n">${pcRs(i.preco_unit)}</td><td class="n"><b>${pcRs(i.preco)}</b></td>` : ''}
        <td class="n">${o.pode_comentar ? `<button type="button" class="pc-mini" data-com="${esc(i.codigo)}" title="Comentar este item">${ic('plus')}</button>` : ''}</td></tr>`).join('')}</tbody></table></section>`).join('')}
    ${o.cronograma ? `<section class="pc-card"><div class="pc-k">${ic('cal')} Cronograma previsto</div>${o.cronograma.map(c => `<div class="pc-lin"><span>${esc(c.descricao)}</span><small>${pcData(c.ini)} a ${pcData(c.fim)}</small></div>`).join('')}</section>` : ''}
    ${o.prazo_txt || o.pagamento_txt || o.texto_cliente ? `<section class="pc-card"><div class="pc-k">Condições</div>${o.prazo_txt ? `<p><b>Prazo:</b> ${esc(o.prazo_txt)}</p>` : ''}${o.pagamento_txt ? `<p><b>Pagamento:</b> ${esc(o.pagamento_txt)}</p>` : ''}${o.texto_cliente ? `<p style="white-space:pre-wrap">${esc(o.texto_cliente)}</p>` : ''}</section>` : ''}
    </div><aside>
    <section class="pc-card pc-acao">${o.pode_aceitar ? `<button type="button" class="btn full" id="pcAceitar">${ic('check')} Aceitar orçamento</button>` : ''}
      ${o.pode_comentar ? `<button type="button" class="btn sec full" id="pcComGeral">${ic('plus')} Fazer uma consideração</button>` : ''}
      ${o.contrato ? `<button type="button" class="btn sec full" id="pcCtr">${ic('pdf')} Baixar contrato</button>` : ''}
      <button type="button" class="btn sec full" id="pcImp">${ic('download')} Imprimir / salvar PDF</button></section>
    <section class="pc-card"><div class="pc-k">Considerações</div>${coms.length ? coms.map(c => `<div class="pc-com ${c.status}"><small>${esc(c.tipo_txt)}${c.item_desc ? ' · ' + esc(c.item_desc) : ''} · ${esc(c.autor)} · ${esc(String(c.em).slice(0, 10).split('-').reverse().join('/'))}</small><p>${esc(c.texto)}</p>
      ${c.resposta ? `<div class="pc-resp"><small>Size Engenharia · ${esc(c.respondido_por)}</small><p>${esc(c.resposta)}</p></div>` : '<small class="mute">aguardando resposta da Size</small>'}</div>`).join('') : '<small class="mute">Nenhuma ainda. Use o + ao lado de um item ou “Fazer uma consideração”.</small>'}</section>
    </aside></div>`);
  const comentar = item => {
    const it = item ? o.etapas.flatMap(e => e.itens).find(i => i.codigo === item) : null;
    modal(it ? 'Sobre: ' + esc(it.descricao) : 'Consideração sobre o orçamento', `<div class="grid"><label>Tipo<select id="pcTipo">${(it ? [['quantidade', 'Mudar quantidade'], ['retirar', 'Retirar este item'], ['duvida', 'Dúvida']] : [['geral', 'Consideração geral'], ['incluir', 'Incluir um item'], ['duvida', 'Dúvida']]).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
      <label>Sua mensagem<textarea id="pcTxt" rows="4" required placeholder="${it ? 'ex: precisamos de 30 m, não 20 m' : 'ex: incluir iluminação da praça'}"></textarea></label></div>`, {
      ok: 'Enviar à Size', onOk: async () => { toast((await api('cli_orc_comentar', { id: o.id, item: item || '', tipo: $('#pcTipo').value, texto: $('#pcTxt').value })).msg); pcOrc(o.id); }
    });
  };
  $$('[data-com]').forEach(b => { b.onclick = () => comentar(b.dataset.com); });
  // foto do empreendimento no topo (chega depois da tela)
  if (o.foto) api('cli_orc_foto', { id: o.id }).then(r => { const el = $('#pcOrcFoto'); if (el && r.b64) { el.style.setProperty('--capa', `url('data:image/jpeg;base64,${r.b64}')`); el.classList.add('com-capa'); } }).catch(() => {});
  // insumos da composição: a janela abre na hora e a lista entra quando o servidor responder
  $$('[data-ins]').forEach(b => { b.onclick = async () => {
    const it = o.etapas.flatMap(e => e.itens).find(i => i.codigo === b.dataset.ins);
    modal('Insumos · ' + esc(it.descricao), '<div class="carregando"><span class="spin"></span></div>', { semRodape: true, larga: true });
    const caixa = $('#modal .mcaixa');
    try {
      const r = await api('cli_orc_insumos', { id: o.id, item: it.codigo });
      if ($('#modal .mcaixa') !== caixa) return;
      $('#modal .mcorpo').innerHTML = `<div class="pc-k">${nf(r.qtd)} ${esc(r.unidade || '')} no orçamento · custo ${pcRs(r.custo_unit)}/${esc(r.unidade || 'un')} · referência: ${esc(r.referencia)}</div>
        <div class="rolar"><table class="pc-tab"><thead><tr><th>Insumo</th><th>Tipo</th><th class="n">Coef.</th><th class="n">Preço</th><th class="n">Custo/${esc(r.unidade || 'un')}</th><th class="n">Quant. total</th></tr></thead><tbody>
        ${r.insumos.map(i => `<tr><td>${esc(i.descricao)} <small>${esc(i.codigo)}</small></td><td><small>${esc(i.tipo)}</small></td><td class="n">${nf(i.coef)} ${esc(i.unidade || '')}</td><td class="n">${pcRs(i.preco)}</td><td class="n"><b>${pcRs(i.custo)}</b></td><td class="n">${nf(i.qtd_total)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4">Soma dos insumos${Math.abs(r.soma - r.custo_unit) > 0.05 ? ' <small>(o custo do orçamento é o da data-base; os preços dos insumos podem ter mudado depois)</small>' : ''}</td><td class="n"><b>${pcRs(r.soma)}</b></td><td></td></tr></tfoot></table></div>`;
    } catch (e) { if ($('#modal .mcaixa') === caixa) fecharModal(); toast(e.message, 1); }
  }; });
  if ($('#pcComGeral')) $('#pcComGeral').onclick = () => comentar('');
  if ($('#pcCtr')) $('#pcCtr').onclick = () => pcArquivo(o.id, 'contrato');
  $('#pcImp').onclick = () => window.print();
  if ($('#pcAceitar')) $('#pcAceitar').onclick = () => modal('Aceitar ' + esc(o.rotulo), `<div class="grid">
      <div class="aviso info">Valor total <b>${pcRs(o.total)}</b>${o.validade_ate ? ' · proposta válida até ' + pcData(o.validade_ate) : ''}. Ao aceitar, a Size é avisada e o orçamento fica aprovado com o seu nome, a data e a hora.</div>
      <label>Seu nome completo<input id="pcAnome" required value="${esc(S.sess.usuario.nome || '')}"></label>
      <label>CPF ou CNPJ <small>(opcional)</small><input id="pcAdoc"></label>
      <label>Contrato assinado <small>(opcional, PDF ou foto)</small><input type="file" id="pcAarq" accept="application/pdf,image/jpeg,image/png"></label>
      <label class="chk"><input type="checkbox" id="pcAok"> Li o orçamento ${esc(o.rotulo)} e aceito os itens, valores e condições.</label></div>`, {
    ok: 'Aceitar orçamento', onOk: async () => {
      let arquivo = null;
      const f = $('#pcAarq').files[0];
      if (f) {
        if (f.size > 10e6) throw new Error('Arquivo grande demais (máx. 10 MB).');
        arquivo = { nome: f.name, mime: f.type, b64: await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(f); }) };
      }
      toast((await api('cli_orc_aceitar', { id: o.id, nome: $('#pcAnome').value, doc: $('#pcAdoc').value, concordo: $('#pcAok').checked, arquivo })).msg);
      pcOrc(o.id);
    }
  });
}
async function pcArquivo(id, qual) {
  const w = window.open('', '_blank');
  try {
    const r = await api('cli_orc_arquivo', { id, qual }), bin = atob(r.b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([u8], { type: r.mime || 'application/pdf' }));
    if (w) w.location = url; else location.href = url;
  } catch (e) { if (w) w.close(); toast(e.message, 1); }
}
async function pcCrono() {
  pcTit('Cronograma');
  const d = await pcApi('cli_cronograma');
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
  const L = (await pcApi('cli_diarios')).diarios;
  view(L.length ? L.map(d => `<a class="pc-card pc-lnk pc-dia" href="#/c/diario/${d.data}">${d.foto ? `<div class="pc-foto" data-pcfoto="${esc(d.foto)}"></div>` : `<div class="pc-foto vazio">${ic('camera')}</div>`}
      <div><b>${pcData(d.data)}</b><small>${esc(d.condicao || '')}${d.tmax !== '' && d.tmax != null ? ' · ' + nf(d.tmin) + '° a ' + nf(d.tmax) + '°' : ''}${d.fotos ? ' · ' + d.fotos + (d.fotos > 1 ? ' fotos' : ' foto') : ''}</small>
      <span>${d.servicos.slice(0, 2).map(esc).join(' · ')}${d.servicos.length > 2 ? ' · +' + (d.servicos.length - 2) : ''}</span></div></a>`).join('')
    : '<section class="pc-card"><div>Nenhum diário liberado ainda. Assim que a equipe liberar, os dias aparecem aqui com as fotos.</div></section>');
  pcFotos();
}
async function pcDiario(data) {
  pcTit('Diário de ' + pcData(data));
  const d = await pcApi('cli_diario', { data });
  view(`<div class="pc-lin"><a class="linkbtn" href="#/c/diario">${ic('back')} Todos os dias</a><a class="btn sec peq" href="#/c/rel/rdo/${d.data}">${ic('pdf')} RDO (PDF)</a></div>
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
    try { const r = await pcApi('cli_foto', { id: f.id }); if ($('#modal .mcaixa') === caixa) $('#modal .mcorpo').innerHTML = `<img class="pc-grande" src="data:image/jpeg;base64,${r.b64}" alt="${esc(f.legenda)}">${f.etapa ? `<small>${esc(f.etapa)}</small>` : ''}`; }
    catch (e) { fecharModal(); toast(e.message, 1); }
  }; });
  pcFotos();
}
async function pcFvs() {
  pcTit('Qualidade');
  const L = (await pcApi('cli_fvs')).fvs;
  view(`<section class="pc-card"><div class="pc-k">Fichas de verificação aprovadas (FVS)</div>${L.map(f => `<div class="pc-lin"><span><b>${esc(f.numero || '')}</b> ${esc(f.servico || '')}${f.etapa ? `<small> · ${esc(f.etapa)}</small>` : ''}<br><small>aprovada ${pcData(f.aprovado_em)}</small></span>
    ${f.pdf ? `<button type="button" class="btn sec peq" data-fvs="${esc(f.id)}">${ic('pdf')} PDF</button>` : ''}</div>`).join('') || '<div>Nenhuma FVS aprovada ainda.</div>'}</section>`);
  $$('[data-fvs]').forEach(b => { b.onclick = () => pcPdf('cli_fvs_pdf', b.dataset.fvs); });
}
async function pcFin() {
  pcTit('Financeiro');
  const d = await pcApi('cli_financeiro'), T = d.total;
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

/* ---------- relatórios: folhas para imprimir / salvar em PDF (cabeçalho Size + empreendimento, rodapé com a plataforma) ---------- */
const pcHoje = () => new Date().toLocaleDateString('sv-SE');
const pcMais = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
async function pcRels() {
  pcTit('Relatórios');
  const h = pcHoje(), m0 = h.slice(0, 8) + '01', ma = pcMais(m0, -1), mi = ma.slice(0, 8) + '01';
  const per = [['Últimos 7 dias', pcMais(h, -6), h], ['Este mês', m0, h], ['Mês passado', mi, ma], ['Últimos 90 dias', pcMais(h, -89), h]];
  const L = pcTem('diario') ? (await pcApi('cli_diarios')).diarios : [];
  view(`<h2 class="pc-h">Relatórios</h2><div class="pc-grade">
    ${pcTem('cronograma') ? `<section class="pc-card"><div class="pc-k">${ic('chart')} Andamento da obra</div><p class="mute" style="margin:0 0 8px">Executado × previsto, curva de avanço, etapas, prazos, clima e fotos do período.</p>
      <div class="pc-acao">${per.map(([t, a, b]) => `<a class="btn sec" href="#/c/rel/andamento/${a}/${b}">${esc(t)} <small>${pcData(a).slice(0, 5)} a ${pcData(b).slice(0, 5)}</small></a>`).join('')}
      <div class="g2"><label>De<input type="date" id="pcDe" value="${m0}"></label><label>Até<input type="date" id="pcAte" value="${h}"></label></div><button type="button" class="btn" id="pcRelOk">${ic('pdf')} Gerar período escolhido</button></div></section>` : ''}
    ${pcTem('diario') ? `<section class="pc-card"><div class="pc-k">${ic('camera')} Diário de obra (RDO)</div>${L.slice(0, 12).map(d => `<div class="pc-lin"><span><b>${pcData(d.data)}</b> <small>${esc(d.condicao || '')}</small></span><a class="btn sec peq" href="#/c/rel/rdo/${d.data}">${ic('pdf')} RDO</a></div>`).join('') || '<div class="mute">Nenhum diário liberado ainda.</div>'}${L.length > 12 ? `<a class="linkbtn" href="#/c/diario">ver todos os dias</a>` : ''}</section>` : ''}
    ${pcTem('financeiro') ? `<section class="pc-card"><div class="pc-k">${ic('money')} Resumo financeiro</div><p class="mute" style="margin:0 0 8px">Contratos (contratado, medido, pago e saldo) e medições aprovadas e pagas.</p><a class="btn" href="#/c/rel/financeiro">${ic('pdf')} Gerar resumo</a></section>` : ''}
  </div>`);
  if ($('#pcRelOk')) $('#pcRelOk').onclick = () => { const a = $('#pcDe').value, b = $('#pcAte').value; if (!a || !b || b < a) return toast('Escolha o período.', 1); location.hash = `#/c/rel/andamento/${a}/${b}`; };
}
/* a folha: barra (voltar / imprimir) + documento */
function pcDoc(titulo, sub, corpo, nomeArq) {
  const C = pcCli();
  view(`<div class="pc-doc-bar"><a class="linkbtn" href="#/c/relatorios">${ic('back')} Relatórios</a><button type="button" class="btn" id="pcDocImp">${ic('download')} Imprimir / salvar PDF</button><small class="mute">no celular: compartilhar → imprimir → salvar como PDF</small></div>
    <article class="pc-doc"><header class="pc-doc-h"><img class="sz" src="logo.png" alt="Size Engenharia"><div><b>${esc(titulo)}</b><span>${esc((pcEmp() || {}).nome || C.nome)}${sub ? ' · ' + sub : ''}</span></div><img class="emp" src="${pcIcone(C)}" alt=""></header>
    ${corpo}
    <footer class="pc-doc-f"><span>Emitido pela plataforma Size Engenharia em ${new Date().toLocaleString('pt-BR')}</span><span>${esc(C.nome)}</span></footer></article>`);
  $('#pcDocImp').onclick = () => { const t = document.title; document.title = nomeArq; window.print(); setTimeout(() => { document.title = t; }, 1500); };
}
const pcKpi = (v, t, cl) => `<div class="pc-kpi ${cl || ''}"><b>${v}</b><span>${t}</span></div>`;
/* curva S simples (SVG): previsto tracejado, realizado cheio e projeção */
function pcCurvaS(cv) {
  if (!cv || cv.length < 2) return '<p class="mute">Ainda não há etapas com datas para montar a curva.</p>';
  const W = 640, H = 200, x = i => 30 + i * (W - 40) / (cv.length - 1), y = p => H - 20 - Math.min(100, Math.max(0, p || 0)) / 100 * (H - 34);
  const linha = (k, cl) => { const pts = cv.map((c, i) => c[k] == null || c[k] === '' ? null : `${x(i).toFixed(1)},${y(c[k]).toFixed(1)}`).filter(Boolean); return pts.length > 1 ? `<polyline class="${cl}" points="${pts.join(' ')}"/>` : ''; };
  const grade = [0, 25, 50, 75, 100].map(p => `<line x1="30" x2="${W - 10}" y1="${y(p)}" y2="${y(p)}" class="g"/><text x="2" y="${y(p) + 4}">${p}%</text>`).join('');
  const rot = [0, Math.floor(cv.length / 2), cv.length - 1].map(i => `<text x="${x(i) - 14}" y="${H - 4}">${pcData(cv[i].data).slice(0, 5)}</text>`).join('');
  return `<svg class="pc-curvas" viewBox="0 0 ${W} ${H}" role="img" aria-label="Curva de avanço">${grade}${linha('previsto', 'prev')}${linha('projetado', 'proj')}${linha('realizado', 'real')}${rot}</svg>
    <div class="pc-leg"><span class="prev">previsto</span><span>realizado</span><span class="proj">projetado (ritmo atual)</span></div>`;
}
async function pcRelAnd(de, ate) {
  pcTit('Relatório de andamento');
  const r = await pcApi('cli_rel_andamento', { de, ate }), G = r.geral, P = r.periodo;
  const fr = r.frentes.map(f => `<div class="pc-doc-b"><div class="pc-lin"><b>${esc(f.nome)}</b><b>${pcPct(f.pct)}</b></div>${pcBarra(f.pct_prev, f.pct)}
    <table class="pc-tab"><thead><tr><th>Serviço</th><th class="n">Previsto</th><th class="n">Executado</th><th class="n">No período</th><th class="n">%</th></tr></thead><tbody>
    ${f.itens.map(i => `<tr><td>${esc(i.servico)}</td><td class="n">${nf(i.qtd)} ${esc(i.unidade || '')}</td><td class="n">${nf(i.executado)}</td><td class="n">${i.periodo ? nf(i.periodo) : '—'}</td><td class="n">${pcPct(i.pct)}</td></tr>`).join('')}</tbody></table></div>`).join('');
  const ets = r.etapas.map(e => { const t = e.itens.map(i => i.termino).filter(Boolean).sort().pop(), p = e.itens.map(i => i.projecao).filter(Boolean).sort().pop(); return `<tr><td>${esc(e.nome)}</td><td>${pcSit(e.situacao)}</td><td class="n">${t ? pcData(t) : '—'}</td><td class="n">${p && e.situacao !== 'concluido' ? pcData(p) : '—'}</td></tr>`; }).join('');
  pcDoc('Relatório de andamento da obra', `${pcData(r.de)} a ${pcData(r.ate)}`, `
    <div class="pc-kpis">${pcKpi(pcPct(G.pct), 'executado até ' + pcData(r.ate))}${pcKpi('+' + pcPct(G.avanco).replace('%', ' p.p.'), 'avanço no período')}${pcKpi(G.pct_prev > 0 ? pcPct(G.pct_prev) : '—', 'previsto até ' + pcData(r.ate))}
      ${pcKpi(G.termino ? pcData(G.termino) : '—', 'término previsto')}${pcKpi(G.projecao ? pcData(G.projecao) : '—', 'término projetado', G.atraso > 0 ? 'risco' : '')}${pcKpi(G.atraso > 0 ? G.atraso + ' dias úteis' : 'No prazo', G.atraso > 0 ? 'de atraso projetado' : 'pelo ritmo atual', G.atraso > 0 ? 'risco' : '')}</div>
    <h3 class="pc-doc-s">Curva de avanço físico</h3>${pcCurvaS(r.curva)}
    ${fr ? `<h3 class="pc-doc-s">Avanço por frente</h3>${fr}` : ''}
    ${ets ? `<h3 class="pc-doc-s">Prazos</h3><table class="pc-tab"><thead><tr><th>Etapa</th><th>Situação</th><th class="n">Término previsto</th><th class="n">Projetado</th></tr></thead><tbody>${ets}</tbody></table>` : ''}
    <h3 class="pc-doc-s">Produção e clima no período</h3><div class="pc-kpis">${pcKpi(P.uteis, 'dias úteis')}${pcKpi(P.trabalhados, 'dias com produção')}${pcKpi(P.parados, 'parados por chuva' + (P.chuva_mm ? ' · ' + nf(P.chuva_mm) + ' mm' : ''))}${pcKpi(P.efetivo || '—', 'efetivo médio (pessoas/dia)')}</div>
    ${r.fotos.length ? `<h3 class="pc-doc-s">Registro fotográfico</h3><div class="pc-doc-fotos">${r.fotos.map(f => `<figure><img src="data:image/jpeg;base64,${f.b64}" alt=""><figcaption><b>${pcData(f.data)}</b>${f.etapa ? ' · ' + esc(f.etapa) : ''}${f.legenda ? '<br>' + esc(f.legenda) : ''}</figcaption></figure>`).join('')}</div>` : ''}
    <p class="pc-doc-nota">Avanço físico ${G.usa_orcamento ? 'ponderado pelo valor dos serviços' : 'pela média dos serviços das etapas'}. Projeção pelo ritmo dos últimos dias trabalhados.</p>
    <div class="pc-doc-ass"><div><span></span>Responsável técnico · Size Engenharia</div><div><span></span>Contratante (ciente)</div></div>`, `Andamento ${pcCli().nome} ${r.de} a ${r.ate}`);
}
async function pcRelRdo(data) {
  pcTit('RDO');
  const r = await pcApi('cli_rdo', { data }), d = r.diario, c = d.clima, n = 'RDO ' + String(d.numero).padStart(3, '0');
  const per = (t, p) => p ? `<div><b>${t}</b><span>${esc(p.desc || '')}</span><small>${nf(p.mm)} mm${p.tmax !== '' && p.tmax != null ? ' · ' + Math.round(p.tmin) + '–' + Math.round(p.tmax) + '°C' : ''}</small></div>` : '';
  const pes = r.equipes.reduce((t, e) => t + e.pessoas, 0);
  pcDoc('Relatório diário de obra', `${n} · ${pcData(r.data)}`, `
    <h3 class="pc-doc-s">Condições do dia</h3><div class="pc-kpis">${c ? per('Manhã', c.manha) + per('Tarde', c.tarde) : ''}${pcKpi(esc(d.condicao || '—'), 'condição de trabalho')}${pcKpi(pes || '—', 'pessoas trabalhando')}</div>
    ${r.equipes.length ? `<h3 class="pc-doc-s">Efetivo</h3><table class="pc-tab"><thead><tr><th>Etapa</th><th>Equipe</th><th class="n">Pessoas</th></tr></thead><tbody>${r.equipes.map(e => `<tr><td>${esc(e.etapa)}</td><td>${esc(e.equipe)}</td><td class="n">${e.pessoas}</td></tr>`).join('')}</tbody></table>` : ''}
    <h3 class="pc-doc-s">Serviços executados</h3>${r.servicos.length ? `<table class="pc-tab"><thead><tr><th>Etapa</th><th>Serviço</th><th class="n">No dia</th><th class="n">Acumulado</th><th class="n">Previsto</th><th class="n">%</th></tr></thead><tbody>
      ${r.servicos.map(s => `<tr><td>${esc(s.etapa)}</td><td>${esc(s.servico)}</td><td class="n"><b>${nf(s.dia)}</b> ${esc(s.unidade || '')}</td><td class="n">${nf(s.acumulado)}</td><td class="n">${nf(s.previsto)}</td><td class="n">${s.pct === '' ? '—' : pcPct(s.pct)}</td></tr>`).join('')}</tbody></table>` : '<p class="mute">Nenhum serviço lançado.</p>'}
    ${r.fotos.length ? `<h3 class="pc-doc-s">Registro fotográfico</h3><div class="pc-doc-fotos">${r.fotos.map(f => `<figure><img src="data:image/jpeg;base64,${f.b64}" alt=""><figcaption>${esc(f.legenda || '')}</figcaption></figure>`).join('')}</div>` : ''}
    <div class="pc-doc-ass"><div><span></span>${esc(d.responsavel || 'Encarregado')}<small>responsável pelo diário</small></div><div><span></span>${esc(d.revisado_por || '')}<small>engenheiro responsável</small></div></div>`, `${n} ${pcCli().nome} ${r.data}`);
}
async function pcRelFin() {
  pcTit('Resumo financeiro');
  const d = await pcApi('cli_financeiro'), T = d.total;
  pcDoc('Resumo financeiro da obra', 'posição em ' + pcData(pcHoje()), `
    <div class="pc-kpis">${pcKpi(pcRs(T.contratado), 'contratado')}${pcKpi(pcRs(T.medido), 'medido')}${pcKpi(pcRs(T.pago), 'pago')}${pcKpi(pcRs(T.saldo), 'saldo a medir')}</div>
    <h3 class="pc-doc-s">Contratos</h3>${d.contratos.length ? `<table class="pc-tab"><thead><tr><th>Contrato</th><th class="n">Contratado</th><th class="n">Medido</th><th class="n">Pago</th><th class="n">Saldo</th></tr></thead><tbody>
      ${d.contratos.map(c => `<tr><td><b>${esc(c.numero || '')}</b> ${esc(c.empreiteiro)}${c.objeto ? `<br><small>${esc(c.objeto)}</small>` : ''}</td><td class="n">${pcRs(c.contratado)}</td><td class="n">${pcRs(c.medido)}<small> ${pcPct(c.pct_med)}</small></td><td class="n">${pcRs(c.pago)}</td><td class="n">${pcRs(c.saldo)}</td></tr>`).join('')}</tbody></table>` : '<p class="mute">Nenhum contrato ainda.</p>'}
    <h3 class="pc-doc-s">Medições aprovadas e pagas</h3>${d.medicoes.length ? `<table class="pc-tab"><thead><tr><th>Medição</th><th>Período</th><th>Situação</th><th class="n">Valor</th></tr></thead><tbody>
      ${d.medicoes.map(m => `<tr><td><b>${esc(m.numero || '')}</b> ${esc(m.empreiteiro)}</td><td>${pcData(m.de)} a ${pcData(m.ate)}</td><td>${m.status === 'Paga' ? 'paga ' + pcData(m.pago_em) : 'aprovada ' + pcData(m.aprovado_em)}</td><td class="n">${pcRs(m.valor)}</td></tr>`).join('')}</tbody></table>` : '<p class="mute">Nenhuma medição aprovada ainda.</p>'}
    <p class="pc-doc-nota">Valores das medições pelos preços dos contratos com as empreiteiras.</p>`, `Financeiro ${pcCli().nome} ${pcHoje()}`);
}
