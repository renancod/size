'use strict';
/* =====================================================================
 * Size Engenharia — app de gestão por módulos (hoje: Compras; próximos: Diário de obra…)
 * Dados: Google Apps Script (API_URL em config.js) → planilha central + uma planilha por obra.
 * ===================================================================== */

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const LS = {
  get: k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* modo privado */ } },
  del: k => { try { localStorage.removeItem(k); } catch (e) { /* modo privado */ } }
};
const norm = s => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fd = s => { if (!s) return ''; const a = String(s).slice(0, 10).split('-'); return a.length === 3 ? `${a[2]}/${a[1]}/${a[0]}` : String(s); };
const fdh = s => { if (!s) return ''; const h = String(s).slice(11, 16); return fd(s) + (h && h !== '00:00' ? ' ' + h : ''); };
const brl = v => v === '' || v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = v => { if (typeof v === 'number') return v; let s = String(v ?? '').trim().replace(/[R$\s]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = Number(s); return isNaN(n) ? 0 : n; };
const nf = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const iso = d => d.toLocaleDateString('sv-SE');
const hoje = () => iso(new Date());
const maisDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const vencido = s => s && String(s).slice(0, 10) < hoje();
const ativo = (o, k = 'ativo') => o[k] === '' || o[k] == null || /^(sim|s|true|1)$/i.test(String(o[k]));
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);

const IC = {
  menu: 'M3 6h18M3 12h18M3 18h18', x: 'M18 6L6 18M6 6l12 12', home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  plus: 'M12 5v14M5 12h14', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  cart: 'M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 7H6M9 21h.01M18 21h.01',
  box: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8', layers: 'M12 2l10 5-10 5L2 7l10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  money: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01',
  truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  building: 'M3 21h18M5 21V5l7-3 7 3v16M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6', back: 'M19 12H5M12 19l-7-7 7-7',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z', chevron: 'M9 18l6-6-6-6',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', check: 'M20 6L9 17l-5-5',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2', bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  minus: 'M5 12h14', sliders2: 'M12 20V10M18 20V4M6 20v-4', send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z', eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${IC[n]}"/></svg>`;

function toast(t, erro) {
  const p = document.createElement('p');
  if (erro) p.className = 'erro';
  p.textContent = t;
  $('#toast').appendChild(p);
  setTimeout(() => p.remove(), erro ? 8000 : 4000);
}

/* arquivos: fotos grandes do celular são reduzidas antes do envio */
const paraB64 = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(f); });
function reduzirFoto(f) {
  return new Promise(ok => {
    const img = new Image(), u = URL.createObjectURL(f);
    img.onload = () => {
      const k = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      ok(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(u); ok(null); };
    img.src = u;
  });
}
async function lerArquivo(input) {
  const f = input && input.files && input.files[0];
  if (!f) return null;
  if (/^image\//i.test(f.type) && !/gif/i.test(f.type) && f.size > 600000) {
    const b = await reduzirFoto(f);
    if (b) return { nome: f.name.replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', b64: b };
  }
  if (f.size > 10 * 1024 * 1024) throw new Error('Arquivo maior que 10 MB.');
  return { nome: f.name, mime: f.type || 'application/octet-stream', b64: await paraB64(f) };
}
const campoArquivo = (nome, rotulo, req) =>
  `<label>${rotulo}${req ? '' : ' <small>(opcional)</small>'}<input type="file" name="${nome}" accept="application/pdf,image/*" ${req ? 'required' : ''}></label>`;
const datas = campo => `<div class="datas">${[[0, 'Hoje'], [1, 'Amanhã'], [3, '3 dias'], [7, '1 semana'], [15, '15 dias'], [30, '30 dias']]
  .map(([d, t]) => `<button type="button" class="chip" data-campo="${campo}" data-dias="${d}">${t}</button>`).join('')}</div>`;
document.addEventListener('click', e => {
  const c = e.target.closest('.chip[data-dias]');
  if (!c) return;
  const f = c.closest('form');
  if (f && f.elements[c.dataset.campo]) { f.elements[c.dataset.campo].value = maisDias(+c.dataset.dias); f.elements[c.dataset.campo].dispatchEvent(new Event('change')); }
});
const wa = (tel, txt) => { let t = String(tel || '').replace(/\D/g, ''); if (!t) return ''; if (t.length <= 11) t = '55' + t; return `https://wa.me/${t}?text=${enc(txt)}`; };

/* ---------- instalação (PWA): Android e PC instalam pelo botão; iPhone/iPad pelo menu Compartilhar ---------- */
let PROMPT_INSTALAR = null;
const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); PROMPT_INSTALAR = e; });
addEventListener('appinstalled', () => { PROMPT_INSTALAR = null; $$('.instalar').forEach(b => b.remove()); toast('App instalado! Abra pelo ícone "Size".'); });
const botaoInstalar = cl => instalado() ? '' : `<button type="button" class="instalar ${cl}" onclick="instalar()">${ic('download')}<span>Instalar o app</span></button>`;
async function instalar() {
  if (PROMPT_INSTALAR) {
    PROMPT_INSTALAR.prompt();
    try { await PROMPT_INSTALAR.userChoice; } catch (e) { /* cancelado */ }
    PROMPT_INSTALAR = null;
    return;
  }
  const passos = ehIOS()
    ? `<h3>iPhone / iPad</h3><ol><li>Abra este endereço no <b>Safari</b>.</li><li>Toque em <b>Compartilhar</b> (o quadrado com a seta para cima ⬆️).</li>
       <li>Role e toque em <b>Adicionar à Tela de Início</b>.</li><li>Toque em <b>Adicionar</b>. O ícone "Size" aparece junto dos outros apps.</li></ol>`
    : `<h3>Android (Chrome)</h3><ol><li>Toque no menu <b>⋮</b> no canto superior.</li><li>Toque em <b>Instalar app</b> (ou <b>Adicionar à tela inicial</b>).</li></ol>
       <h3>Computador (Chrome ou Edge)</h3><ol><li>Clique no ícone de instalar na barra de endereço (monitor com seta ⬇️), ou no menu <b>⋮</b> → <b>Transmitir, salvar e compartilhar → Instalar página como app</b> (Chrome) / <b>Aplicativos → Instalar este site como aplicativo</b> (Edge).</li></ol>
       <h3>iPhone / iPad</h3><p>No Safari: Compartilhar ⬆️ → Adicionar à Tela de Início.</p>`;
  modal('Instalar o app', `${passos}<small>Endereço: <b>${esc(location.origin + location.pathname)}</b></small>`, { semRodape: true });
}

/* ---------- estado e API ---------- */
const S = { token: LS.get('cs_token'), sess: null, obraId: LS.get('cs_obra'), dados: null, ped: null, todos: false, adm: null };
const admin = () => !!(S.sess && S.sess.usuario.admin);
const can = p => admin() || [].concat(p).some(x => S.dados && S.dados.permissoes.includes(x));
const obraAtual = () => (S.sess?.obras || []).find(o => o.id === S.obraId);

async function api(acao, d = {}) {
  let r;
  try {
    r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao, token: S.token, obra: S.obraId, ...d }) });
  } catch (e) { throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.'); }
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch (e) { throw new Error('A API não respondeu corretamente. Confira a URL em config.js e a implantação do Apps Script (acesso "Qualquer pessoa").'); }
  if (!j.ok) {
    if (/^Sess[aã]o/.test(j.erro || '')) { sair(j.erro); }
    throw new Error(j.erro || 'Erro na API');
  }
  return j.dados;
}
async function pedidos(forcar) {
  if (!S.ped || forcar) { const r = await api('pedidos_listar'); S.ped = r.pedidos; S.todos = r.todos; contadores(); }
  return S.ped;
}
async function recarregarDados() { S.dados = await api('obra_dados'); }

/* ---------- situações e filtros ---------- */
const SIT_CL = {
  'Aberto': 'b-aberto', 'Em cotação': 'b-cot', 'Aguardando aprovação': 'b-apr', 'Aguardando pagamento': 'b-fin', 'A pagar': 'b-fin', 'Aguardando NF': 'b-fin',
  'Liberar entrega': 'b-lib', 'Entrega liberada': 'b-lib', 'Recebido parcial': 'b-rec', 'Recebido': 'b-rec', 'Concluído': 'b-ok', 'Cancelado': 'b-canc'
};
const badge = s => `<span class="badge ${SIT_CL[s] || ''}">${esc(s)}</span>`;
const PRIORIDADES = ['Baixa', 'Normal', 'Alta', 'Urgente'];
const prio = p => Math.max(0, PRIORIDADES.indexOf(p.prioridade));
// urgência (Alta/Urgente) só vale até o material chegar
const chegou = p => p.entrega === 'Recebido' || ['Concluído', 'Cancelado'].includes(p.status) || ['A pagar', 'Aguardando NF', 'Recebido'].includes(p.situacao) && !p.status;
const quente = p => prio(p) >= 2 && !chegou(p);
const tagPrio = p => quente(p) ? `<span class="urg">${esc(String(p.prioridade).toUpperCase())}</span>` : '';
const P_COMPRAS = ['compras_cotar', 'compras_definir', 'compras_aprovar', 'compras_liberar'];
const FILTROS = {
  andamento: { t: 'Em andamento', f: p => !['Concluído', 'Cancelado'].includes(p.status) },
  urgentes: { t: 'Urgentes', f: p => quente(p) && !['Concluído', 'Cancelado'].includes(p.status) },
  compras: { t: 'Compras', f: p => ['Aberto', 'Em cotação', 'Aguardando aprovação', 'Liberar entrega'].includes(p.situacao) },
  cotar: { t: 'Para cotar', f: p => p.situacao === 'Aberto' },
  cotacao: { t: 'Em cotação', f: p => p.situacao === 'Em cotação' },
  aprovar: { t: 'Aguardando aprovação', f: p => p.situacao === 'Aguardando aprovação' },
  liberar: { t: 'Liberar entrega', f: p => p.situacao === 'Liberar entrega' },
  receber: { t: 'A receber', f: p => p.status === 'Aprovado' && ['Entrega liberada', 'Recebido parcial'].includes(p.entrega) },
  nf: { t: 'Aguardando NF', f: p => p.status === 'Aprovado' && p.fin === 'Aguardando NF' },
  pagar: { t: 'A pagar', f: p => p.status === 'Aprovado' && ['Aguardando pagamento', 'A pagar'].includes(p.fin) },
  concluidos: { t: 'Concluídos', f: p => p.status === 'Concluído' },
  cancelados: { t: 'Cancelados', f: p => p.status === 'Cancelado' },
  todos: { t: 'Todos', f: () => true }
};
const conta = k => (S.ped || []).filter(FILTROS[k].f).length;

/* ---------- estrutura (menu lateral + topo) ---------- */
/* Módulos do app Size Engenharia. Cada módulo abre seus itens no menu lateral.
 * Para criar um novo módulo: acrescente aqui (itens + rotas) e as telas correspondentes. */
const MODULOS = [
  {
    id: 'compras', t: 'Compras', i: 'cart', home: '#/compras',
    desc: 'Pedidos de material, cotação, aprovação, recebimento, estoque e pagamentos',
    rotas: /^#\/(compras|novo|pedidos|pedido\/|estoque|financeiro|cad\/(materiais|fornecedores))/,
    itens: [
      { h: '#/compras', t: 'Painel', i: 'home', ok: () => true },
      { h: '#/novo', t: 'Novo pedido', i: 'plus', ok: () => can('pedido_abrir') },
      { h: '#/pedidos', t: 'Pedidos', i: 'list', ok: () => true },
      { h: '#/pedidos?k=compras', t: 'Cotação e compra', i: 'cart', ok: () => can(P_COMPRAS), c: 'compras' },
      { h: '#/pedidos?k=receber', t: 'Recebimento', i: 'box', ok: () => can('pedido_receber'), c: 'receber' },
      { h: '#/estoque', t: 'Estoque', i: 'layers', ok: () => can(['estoque_ver', 'estoque_movimentar', 'pedido_receber']) },
      { h: '#/financeiro', t: 'Financeiro', i: 'money', ok: () => can('financeiro'), c: 'pagar' },
      { h: '#/cad/materiais', t: 'Materiais', i: 'tag', ok: () => true },
      { h: '#/cad/fornecedores', t: 'Fornecedores', i: 'truck', ok: () => can(['cad_fornecedores', ...P_COMPRAS, 'financeiro']) }
    ]
  },
  { id: 'diario', t: 'Diário de obra', i: 'book', breve: true, desc: 'Registro diário da obra: clima, equipe, serviços executados, fotos e ocorrências' }
];
const NAV_GERAL = [
  { sep: 'Obra', ok: () => !!S.dados },
  { h: '#/cad/frentes', t: 'Frentes de trabalho', i: 'grid', ok: () => !!S.dados },
  { sep: 'Administração', ok: admin },
  { h: '#/admin/usuarios', t: 'Usuários e acessos', i: 'users', ok: admin },
  { h: '#/admin/obras', t: 'Obras', i: 'building', ok: admin },
  { h: '#/admin/config', t: 'Configurações', i: 'sliders', ok: admin }
];
/* pendências do usuário no módulo Compras (soma do que ele pode agir) */
function pendenciasCompras() {
  if (!S.ped) return 0;
  return [['cotar', 'compras_cotar'], ['aprovar', 'compras_aprovar'], ['liberar', 'compras_liberar'], ['receber', 'pedido_receber'], ['pagar', 'financeiro']]
    .filter(([, p]) => can(p)).reduce((s, [k]) => s + conta(k), 0);
}

function montarShell() {
  $('#raiz').innerHTML = `<div class="shell">
    <aside class="menu" id="menu">
      <div class="marca"><img src="icon-192.png" alt=""><div><b>Size Engenharia</b><small>Sistema de gestão</small></div></div>
      <label class="obrasel">Obra<select id="obrasel"></select></label>
      <nav class="nav" id="nav"></nav>
      ${botaoInstalar('no-menu')}
      <div class="rodape"><a href="#/conta">${ic('user')}<span>${esc(S.sess.usuario.nome)}</span></a><button id="sair" title="Sair">${ic('logout')}</button></div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="conteudo">
      <header class="topo"><button class="icbtn hamb" id="hamb" aria-label="Menu">${ic('menu')}</button><h1 id="titulo"></h1><span class="obra" id="obranome"></span>
        <button class="icbtn sino" id="sino" aria-label="Notificações">${ic('bell')}<span class="sino-n" hidden></span></button>
        <button class="icbtn" id="atualizar" aria-label="Atualizar">${ic('refresh')}</button></header>
      <main class="view" id="view"></main>
    </div></div>`;
  const abre = on => { $('#menu').classList.toggle('on', on); $('#scrim').classList.toggle('on', on); };
  $('#hamb').onclick = () => abre(true);
  $('#scrim').onclick = () => abre(false);
  $('#nav').onclick = e => { if (e.target.closest('a')) abre(false); };
  $('#sair').onclick = () => { if (confirm('Sair do app?')) sair(); };
  $('#atualizar').onclick = async () => { S.ped = null; try { await recarregarDados(); } catch (e) { toast(e.message, 1); } rotear(); };
  $('#obrasel').onchange = e => trocarObra(e.target.value);
  $('#sino').onclick = painelNotif;
  // arrastar da borda esquerda abre o menu; para a esquerda fecha (celular)
  let x0 = null;
  addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  addEventListener('touchend', e => {
    if (x0 == null || innerWidth >= 960) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (x0 < 24 && dx > 60) abre(true);
    if ($('#menu').classList.contains('on') && dx < -60) abre(false);
    x0 = null;
  }, { passive: true });
  montarMenu();
}

function montarMenu() {
  const obras = S.sess.obras;
  $('#obrasel').innerHTML = obras.length ? obras.map(o => `<option value="${esc(o.id)}" ${o.id === S.obraId ? 'selected' : ''}>${esc(o.nome)}${o.ativa ? '' : ' (desativada)'}</option>`).join('') : '<option>Nenhuma obra liberada</option>';
  $('#obranome').textContent = obraAtual()?.nome || '';
  const link = n => `<a href="${n.h}" data-h="${n.h}">${ic(n.i)}<span>${n.t}</span>${n.c ? `<span class="cont" data-c="${n.c}" hidden></span>` : ''}</a>`;
  const aberto = LS.get('cs_mod') || 'compras';
  $('#nav').innerHTML = `<a href="#/inicio" data-h="#/inicio">${ic('home')}<span>Início</span></a>
    <div class="sep">Módulos</div>
    ${MODULOS.map(m => m.breve
      ? `<div class="mod breve">${ic(m.i)}<span>${m.t}</span><small>em breve</small></div>`
      : !S.dados ? '' : `<button type="button" class="mod" data-mod="${m.id}" aria-expanded="${aberto === m.id}">${ic(m.i)}<span>${m.t}</span><span class="cont" data-c="mod-${m.id}" hidden></span>${ic('chevron')}</button>
        <div class="sub" data-sub="${m.id}" ${aberto === m.id ? '' : 'hidden'}>${m.itens.filter(n => n.ok()).map(link).join('')}</div>`).join('')}
    ${NAV_GERAL.filter(n => n.ok()).map(n => n.sep ? `<div class="sep">${n.sep}</div>` : link(n)).join('')}`;
  $$('#nav .mod[data-mod]').forEach(b => {
    b.onclick = () => {
      const sub = $(`#nav [data-sub="${b.dataset.mod}"]`), abrir = sub.hidden;
      $$('#nav .sub').forEach(s => { s.hidden = true; });
      $$('#nav .mod[data-mod]').forEach(x => x.setAttribute('aria-expanded', 'false'));
      sub.hidden = !abrir;
      b.setAttribute('aria-expanded', String(abrir));
      LS.set('cs_mod', abrir ? b.dataset.mod : '-');
    };
  });
  marcarMenu();
  contadores();
}
function marcarMenu() {
  const h = location.hash || '#/inicio';
  $$('#nav a').forEach(a => a.classList.toggle('on', h === a.dataset.h || (a.dataset.h === '#/pedidos' && /^#\/pedido\//.test(h))));
  const m = MODULOS.find(x => x.rotas && x.rotas.test(h));
  if (m) {
    const sub = $(`#nav [data-sub="${m.id}"]`);
    if (sub && sub.hidden) { sub.hidden = false; $(`#nav [data-mod="${m.id}"]`).setAttribute('aria-expanded', 'true'); }
  }
}
function contadores() {
  $$('#nav .cont').forEach(c => {
    const n = !S.ped ? 0 : c.dataset.c === 'mod-compras' ? pendenciasCompras() : conta(c.dataset.c);
    c.textContent = n; c.hidden = !n;
  });
}
function titulo(t) { $('#titulo').textContent = t; document.title = t + ' · Size Engenharia'; }
function view(html) { $('#view').innerHTML = html; }
function carregandoView() { view('<div class="carregando"><span class="spin"></span></div>'); }

async function trocarObra(id) {
  S.obraId = id; LS.set('cs_obra', id); S.ped = null; S.dados = null;
  carregandoView();
  try { await recarregarDados(); } catch (e) { toast(e.message, 1); }
  montarMenu();
  if (/^#\/(pedido\/|inicio)/.test(location.hash) || !location.hash) location.hash = '#/inicio';
  rotear();
}

/* ---------- rotas ---------- */
const ROTAS = [
  [/^#?\/?(inicio)?$/, vHome], [/^#\/compras$/, vInicio], [/^#\/novo$/, vNovo], [/^#\/pedidos(?:\?(.*))?$/, vPedidos], [/^#\/pedido\/(.+)$/, vPedido],
  [/^#\/estoque$/, vEstoque], [/^#\/financeiro(?:\?(.*))?$/, vFinanceiro], [/^#\/cad\/(\w+)$/, vCad], [/^#\/conta$/, vConta],
  [/^#\/admin\/usuarios$/, vUsuarios], [/^#\/admin\/obras$/, vObras], [/^#\/admin\/config$/, vConfig]
];
let rotaN = 0;
async function rotear() {
  if (!S.sess) return;
  const h = location.hash || '#/inicio', id = ++rotaN;
  marcarMenu();
  fecharModal();
  if (!S.dados && !/^#\/(admin|conta)/.test(h)) return semObra();
  for (const [re, fn] of ROTAS) {
    const m = h.match(re);
    if (!m) continue;
    carregandoView();
    try { await fn(...m.slice(1).map(x => x && decodeURIComponent(x))); }
    catch (e) { if (id === rotaN && S.token) view(`<div class="aviso erro">${esc(e.message)}</div><button class="btn sec" onclick="rotear()">Tentar de novo</button>`); }
    window.scrollTo(0, 0);
    return;
  }
  location.hash = '#/inicio';
}
addEventListener('hashchange', rotear);
function semObra() {
  titulo('Compras');
  view(`<div class="card vazio"><p><b>Nenhuma obra liberada para você.</b></p>${admin() ? '<a class="btn" href="#/admin/obras">Criar a primeira obra</a>' : '<p>Peça ao administrador para liberar seu acesso.</p>'}</div>`);
}

/* ---------- login ---------- */
function telaLogin(msg) {
  $('#raiz').innerHTML = `<div class="login"><form class="card" id="f">
    <img class="logo" src="logo.png" alt="Size Engenharia"><div class="sistema">Sistema de gestão</div>
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
      S.token = d.token; LS.set('cs_token', d.token);
      S.sess = d;
      iniciar();
    } catch (x) { toast(x.message, 1); b.disabled = false; b.textContent = 'Entrar'; }
  };
}
function sair(msg) {
  S.token = ''; S.sess = null; S.dados = null; S.ped = null; S.adm = null;
  clearInterval(NOTIF.timer);
  LS.del('cs_token');
  fecharModal();
  telaLogin(typeof msg === 'string' ? msg : '');
}
function telaTrocarSenha() {
  $('#raiz').innerHTML = `<div class="login"><form class="card" id="f">
    <div class="marca"><img src="icon-192.png" alt=""><div><b>Defina sua senha</b><small>${esc(S.sess.usuario.nome)}</small></div></div>
    <div class="aviso info">Você entrou com uma senha provisória. Crie a sua para continuar.</div>
    <label>Senha provisória<input name="atual" type="password" autocomplete="current-password" required></label>
    <label>Nova senha (mín. 6)<input name="nova" type="password" minlength="6" autocomplete="new-password" required></label>
    <label>Repita a nova senha<input name="nova2" type="password" minlength="6" autocomplete="new-password" required></label>
    <button class="btn full">Salvar e entrar</button><button type="button" class="linkbtn" id="out">Sair</button></form></div>`;
  $('#out').onclick = () => sair();
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    if (f.nova.value !== f.nova2.value) return toast('As senhas não conferem.', 1);
    try { await api('trocarSenha', { atual: f.atual.value, nova: f.nova.value }); S.sess.usuario.trocar_senha = false; toast('Senha definida.'); iniciar(); }
    catch (x) { toast(x.message, 1); }
  };
}

async function iniciar() {
  if (S.sess.usuario.trocar_senha) return telaTrocarSenha();
  if (!S.sess.obras.some(o => o.id === S.obraId)) S.obraId = S.sess.obras[0]?.id || '';
  if (S.obraId) LS.set('cs_obra', S.obraId);
  S.dados = null;
  if (S.obraId) { try { await recarregarDados(); } catch (e) { toast(e.message, 1); } }
  montarShell();
  rotear();
  if (S.dados) pedidos().catch(() => {});
  iniciarNotif();
}
async function boot() {
  const qs = new URLSearchParams(location.search);
  if (qs.get('obra')) { S.obraId = qs.get('obra'); LS.set('cs_obra', S.obraId); history.replaceState(null, '', location.pathname + location.hash); }
  if (typeof API_URL === 'undefined' || /COLE_AQUI/.test(API_URL)) {
    $('#raiz').innerHTML = '<div class="login"><div class="card"><b>Configuração pendente</b><p>Cole a URL do Apps Script em <code>config.js</code>.</p></div></div>';
    return;
  }
  if (!S.token) return telaLogin();
  try { S.sess = await api('sessao'); } catch (e) { if (S.token) $('#raiz').innerHTML = `<div class="login"><div class="card"><div class="aviso erro">${esc(e.message)}</div><button class="btn" onclick="location.reload()">Tentar de novo</button></div></div>`; return; }
  iniciar();
}

/* ---------- modal ---------- */
function modal(tituloM, corpo, { ok = 'Confirmar', onOk, larga, semRodape } = {}) {
  const m = $('#modal');
  m.innerHTML = `<div class="mfundo"></div><form class="mcaixa ${larga ? 'larga' : ''}">
    <header><h2>${tituloM}</h2><button type="button" class="icbtn fechar" aria-label="Fechar">${ic('x')}</button></header>
    <div class="mcorpo">${corpo}</div>
    ${semRodape ? '' : `<footer><button type="button" class="btn sec fechar">Voltar</button><button class="btn" type="submit">${ok}</button></footer>`}</form>`;
  m.classList.add('on');
  document.body.classList.add('travado');
  const f = $('form', m);
  $$('.fechar', m).forEach(b => { b.onclick = fecharModal; });
  $('.mfundo', m).onclick = fecharModal;
  f.onsubmit = async e => {
    e.preventDefault();
    if (!onOk) return fecharModal();
    const b = $('button[type=submit]', f), t = b.textContent;
    b.disabled = true; b.textContent = 'Aguarde…';
    try { const r = await onOk(f); if (r !== false) fecharModal(); }
    catch (x) { toast(x.message, 1); }
    if (document.body.contains(b)) { b.disabled = false; b.textContent = t; }
  };
  return f;
}
function fecharModal() { const m = $('#modal'); m.classList.remove('on'); m.innerHTML = ''; document.body.classList.remove('travado'); }

/* ---------- notificações: o que cada perfil tem para fazer, em todas as obras ---------- */
const ETAPA_NOTIF = {
  cotar: ['Para cotar', 'cart'], definir: ['Orçamentos recebidos', 'file'], aprovar: ['Aprovar compra', 'check'], liberar: ['Liberar entrega', 'truck'],
  receber: ['Receber material', 'box'], pagar: ['Pagamentos', 'money'], nf: ['Aguardando nota fiscal', 'file'],
  pago: ['Pagamentos concluídos', 'check'], meu: ['Meus pedidos', 'clock']
};
const NOTIF = { itens: [], timer: null, primeira: true, conhecidos: new Set((() => { try { return JSON.parse(LS.get('cs_notif') || '[]'); } catch (e) { return []; } })()) };
async function buscarNotif() {
  if (!S.token || !S.sess) return;
  let r;
  try { r = await api('notificacoes'); } catch (e) { return; }
  const novos = r.itens.filter(i => !NOTIF.conhecidos.has(i.id));
  // na primeira vez que o aparelho usa o app, só registra; depois avisa tudo que for novo
  if (novos.length && (!NOTIF.primeira || NOTIF.conhecidos.size)) avisarNovos(novos);
  NOTIF.primeira = false;
  NOTIF.itens = r.itens;
  NOTIF.conhecidos = new Set(r.itens.map(i => i.id));
  LS.set('cs_notif', JSON.stringify([...NOTIF.conhecidos]));
  atualizarSino();
}
function iniciarNotif() {
  clearInterval(NOTIF.timer);
  NOTIF.primeira = true;
  buscarNotif();
  NOTIF.timer = setInterval(() => { if (!document.hidden) buscarNotif(); }, 60000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.sess) buscarNotif(); });
function atualizarSino() {
  const b = $('#sino .sino-n');
  if (!b) return;
  const n = NOTIF.itens.filter(i => !['meu', 'pago'].includes(i.etapa)).length; // avisos informativos não contam como pendência
  b.textContent = n > 99 ? '99+' : n;
  b.hidden = !n;
}
const urlNotif = i => './?obra=' + enc(i.obra) + '#/pedido/' + enc(i.numero);
function avisarNovos(novos) {
  const caixa = $('#avisos') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'avisos', className: 'avisos' }));
  novos.slice(0, 3).forEach(i => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'aviso-pop';
    el.innerHTML = `${ic((ETAPA_NOTIF[i.etapa] || [])[1] || 'bell')}<span><b>${esc(i.numero)} · ${esc((ETAPA_NOTIF[i.etapa] || [i.etapa])[0])}</b><small>${esc(i.texto)}${i.resumo ? ' — ' + esc(i.resumo) : ''}</small></span>`;
    el.onclick = () => { el.remove(); abrirNotif(i); };
    caixa.appendChild(el);
    setTimeout(() => el.remove(), 12000);
  });
  if (novos.length > 3) toast(`+${novos.length - 3} notificações. Toque no sino para ver.`);
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden && navigator.serviceWorker) {
    navigator.serviceWorker.ready.then(reg => novos.slice(0, 5).forEach(i => reg.showNotification(i.numero + ' · ' + ((ETAPA_NOTIF[i.etapa] || [i.etapa])[0]), {
      body: i.texto + (i.resumo ? ' — ' + i.resumo : '') + (S.sess.obras.length > 1 ? ' (' + i.obra_nome + ')' : ''), icon: 'icon-192.png', badge: 'icon-192.png', tag: i.id, data: { url: urlNotif(i) }
    }))).catch(() => {});
  }
}
async function abrirNotif(i) {
  fecharModal();
  if (i.obra !== S.obraId) await trocarObra(i.obra);
  location.hash = '#/pedido/' + enc(i.numero);
}
function painelNotif() {
  const grupos = Object.keys(ETAPA_NOTIF).map(k => [k, NOTIF.itens.filter(i => i.etapa === k)]).filter(([, l]) => l.length);
  const variasObras = new Set(NOTIF.itens.map(i => i.obra)).size > 1;
  const perm = 'Notification' in window ? Notification.permission : 'indisponivel';
  modal('Notificações', `${perm === 'default' ? `<button type="button" class="btn sec" id="ativarNotif">${ic('bell')} Avisar também quando o app estiver em segundo plano</button>` : ''}
    ${perm === 'denied' ? '<small>Os avisos do aparelho estão bloqueados nas configurações do navegador para este site.</small>' : ''}
    ${grupos.map(([k, l]) => `<div class="notif-grupo"><div class="notif-tit">${ic(ETAPA_NOTIF[k][1])}<b>${ETAPA_NOTIF[k][0]}</b><span>${l.length}</span></div>
      ${l.sort((a, b) => String(b.quando).localeCompare(String(a.quando))).map((i, n) => `<button type="button" class="notif" data-n="${esc(i.id)}">
        <span><b>${esc(i.numero)}</b>${quente(i) ? ' <span class="urg">' + esc(String(i.prioridade).toUpperCase()) + '</span>' : ''}${variasObras ? ` <small>${esc(i.obra_nome)}</small>` : ''}<br>
        <small>${esc(i.texto)}${i.resumo ? ' — ' + esc(i.resumo) : ''}</small></span><small>${fdh(i.quando)}</small></button>`).join('')}</div>`).join('')
    || '<p class="vazio">Nada pendente para você agora. 🎉</p>'}`, { semRodape: true });
  $$('#modal .notif').forEach(b => { b.onclick = () => abrirNotif(NOTIF.itens.find(i => i.id === b.dataset.n)); });
  if ($('#ativarNotif')) $('#ativarNotif').onclick = async () => {
    const r = await Notification.requestPermission();
    toast(r === 'granted' ? 'Pronto: o aparelho vai avisar das novidades.' : 'Os avisos do aparelho não foram permitidos.', r !== 'granted');
    painelNotif();
  };
  buscarNotif();
}

async function verArquivo(id) {
  modal('Arquivo', '<div class="carregando"><span class="spin"></span></div>', { semRodape: true, larga: true });
  try {
    const a = await api('arquivo_ver', { id });
    const bytes = Uint8Array.from(atob(a.b64), c => c.charCodeAt(0)), u = URL.createObjectURL(new Blob([bytes], { type: a.mime }));
    const img = /^image\//.test(a.mime);
    $('#modal .mcorpo').innerHTML = `<div class="acoes"><a class="btn" href="${u}" target="_blank" rel="noopener">Abrir</a><a class="btn sec" href="${u}" download="${esc(a.nome)}">Baixar</a></div>
      <small>${esc(a.nome)}</small>${img ? `<img class="visor-img" src="${u}" alt="">` : /pdf/.test(a.mime) ? `<iframe class="visor" src="${u}"></iframe>` : ''}`;
  } catch (e) { $('#modal .mcorpo').innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; }
}

/* =====================================================================
 * TELAS
 * ===================================================================== */

/* ---------- início ---------- */
/* ---------- início: módulos ---------- */
async function vHome() {
  titulo('Início');
  if (S.dados) await pedidos();
  const pend = pendenciasCompras();
  view(`<div class="cab"><h2>Olá, ${esc(S.sess.usuario.nome.split(' ')[0])}</h2>${obraAtual() ? `<span class="badge">${esc(obraAtual().nome)}</span>` : ''}</div>
    <div class="modulos">${MODULOS.map(m => m.breve
      ? `<div class="modulo breve"><span class="mic">${ic(m.i)}</span><b>${m.t}</b><small>${esc(m.desc)}</small><span class="badge">em breve</span></div>`
      : `<a class="modulo" href="${m.home}"><span class="mic">${ic(m.i)}</span><b>${m.t}</b><small>${esc(m.desc)}</small>
          ${m.id === 'compras' && pend ? `<span class="badge b-apr">${plural(pend, 'pendência', 'pendências')}</span>` : ''}</a>`).join('')}</div>
    ${can('pedido_abrir') ? `<div class="acoes" style="margin-top:16px"><a class="btn" href="#/novo">${ic('plus')} Novo pedido de material</a></div>` : ''}`);
}

/* ---------- compras: painel ---------- */
async function vInicio() {
  titulo('Compras');
  const ps = await pedidos();
  const cards = [
    ['cotar', 'compras_cotar'], ['cotacao', ['compras_cotar', 'compras_definir']], ['aprovar', 'compras_aprovar'], ['liberar', 'compras_liberar'],
    ['receber', 'pedido_receber'], ['pagar', 'financeiro'], ['nf', ['financeiro', 'compras_cotar']], ['urgentes', null]
  ].filter(([, p]) => !p || can(p));
  const meus = ps.filter(p => String(p.solicitante_id) === S.sess.usuario.id && FILTROS.andamento.f(p));
  const atrasados = ps.filter(p => FILTROS.andamento.f(p) && p.necessidade && vencido(p.necessidade) && !['Recebido', 'Concluído'].includes(p.situacao));
  view(`<div class="cab"><h2>Olá, ${esc(S.sess.usuario.nome.split(' ')[0])}</h2>${can('pedido_abrir') ? `<a class="btn" href="#/novo">${ic('plus')} Novo pedido</a>` : ''}</div>
    ${S.todos ? `<div class="kpis">${cards.map(([k]) => { const n = conta(k); return `<a class="kpi ${n ? '' : 'zero'} ${k === 'urgentes' && n ? 'quente' : ''}" href="#/pedidos?k=${k}"><b>${n}</b><span>${FILTROS[k].t}</span></a>`; }).join('')}</div>` : ''}
    ${atrasados.length && S.todos ? `<div class="card"><h3>Atrasados (data de necessidade vencida)</h3><div class="lista">${atrasados.slice(0, 8).map(p => cartao(p)).join('')}</div></div>` : ''}
    <div class="card"><h3>Meus pedidos em andamento</h3>${meus.length ? `<div class="lista">${meus.slice(0, 20).map(p => cartao(p)).join('')}</div>` : '<p class="vazio">Nenhum pedido seu em andamento.</p>'}</div>`);
  ligarCartoes();
}

/* ---------- cartão de pedido ---------- */
function cartao(p, sel) {
  const it = p.itens || [], f = it[0];
  const prazo = p.fin === 'A pagar' && p.vencimento ? `<span class="${vencido(p.vencimento) ? 'atrasado' : ''}">vence ${fd(p.vencimento)}</span>`
    : p.necessidade && FILTROS.andamento.f(p) ? `<span class="${vencido(p.necessidade) && !['Recebido'].includes(p.situacao) ? 'atrasado' : ''}">até ${fd(p.necessidade)}</span>` : '';
  return `<div class="ped" data-st="${SIT_CL[p.situacao] || ''}" data-num="${esc(p.numero)}">${sel ? `<input type="checkbox" class="sel" data-sel="${esc(p.numero)}" ${sel.has(p.numero) ? 'checked' : ''}>` : ''}
    <div class="corpo"><div class="l1"><b>${esc(p.numero)}</b>${badge(p.situacao)}${tagPrio(p)}<span class="dir">${brl(p.valor_total)}</span></div>
    <div class="l2">${esc(f ? f.descricao : '—')}${f ? ` <span class="mais">${nf(f.qtd)} ${esc(f.unidade)}${it.length > 1 ? ` · +${plural(it.length - 1, 'item', 'itens')}` : ''}</span>` : ''}</div>
    <div class="l3">${[p.frente, p.solicitante, p.fornecedor, p.n_orc && ['Aberto', 'Em cotação'].includes(p.status) ? plural(p.n_orc, 'orçamento', 'orçamentos') : '', prazo].filter(Boolean).join(' · ')}</div></div></div>`;
}
function ligarCartoes(onSel) {
  $$('#view .ped').forEach(c => {
    c.onclick = e => {
      if (e.target.matches('.sel')) { onSel && onSel(e.target.dataset.sel, e.target.checked); return; }
      location.hash = '#/pedido/' + enc(c.dataset.num);
    };
  });
}

/* ---------- novo pedido ---------- */
async function vNovo() {
  titulo('Novo pedido');
  if (!can('pedido_abrir')) return view('<div class="aviso warn">Você não tem permissão para abrir pedidos nesta obra.</div>');
  const D = S.dados, mats = D.materiais.filter(m => ativo(m)), frentes = D.frentes.filter(x => ativo(x, 'ativa'));
  view(`<form class="card grid" id="f">
    <div class="g2"><label>Frente de trabalho<select name="frente"><option value="">—</option>${frentes.map(x => `<option>${esc(x.nome)}</option>`).join('')}</select></label>
      <label>Prioridade<select name="prioridade">${PRIORIDADES.map(x => `<option ${x === 'Normal' ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
    <label>Precisa estar na obra até<input type="date" name="necessidade" min="${hoje()}">${datas('necessidade')}</label>
    <h3 style="margin:6px 0 0">Materiais</h3><div class="itens" id="itens"></div>
    <button type="button" class="btn sec" id="add">${ic('plus')} Adicionar material</button>
    <label>Observações<textarea name="observacoes" placeholder="Opcional: marca, especificação, local de descarga…"></textarea></label>
    <button class="btn full">Enviar pedido</button></form>
    <datalist id="dl-mat">${mats.map(m => `<option value="${esc(m.descricao)}">${esc(m.unidade || '')}</option>`).join('')}</datalist>`);
  const box = $('#itens');
  const addItem = () => {
    const d = document.createElement('div');
    d.className = 'item';
    d.innerHTML = `<label class="desc">Material<input list="dl-mat" name="desc" required autocomplete="off" placeholder="Digite para buscar"></label>
      <label>Qtd<input name="qtd" type="number" step="any" min="0" inputmode="decimal" required></label>
      <label>Unidade<select name="un">${D.unidades.map(u => `<option>${esc(u)}</option>`).join('')}</select></label>
      <button type="button" class="rm" aria-label="Remover">${ic('x')}</button>`;
    const desc = $('[name=desc]', d), un = $('[name=un]', d);
    desc.onchange = () => {
      const m = mats.find(x => norm(x.descricao) === norm(desc.value));
      if (m && m.unidade) {
        if (![...un.options].some(o => o.value === m.unidade)) un.add(new Option(m.unidade, m.unidade));
        un.value = m.unidade;
      }
    };
    $('.rm', d).onclick = () => { if ($$('.item', box).length > 1) d.remove(); };
    box.appendChild(d);
    return desc;
  };
  addItem();
  $('#add').onclick = () => addItem().focus();
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, b = $('button:not([type])', f);
    const itens = $$('.item', box).map(d => {
      const descricao = $('[name=desc]', d).value.trim(), m = mats.find(x => norm(x.descricao) === norm(descricao));
      return { descricao, material_cod: m ? m.codigo : '', qtd: $('[name=qtd]', d).value, unidade: $('[name=un]', d).value };
    });
    b.disabled = true; b.textContent = 'Enviando…';
    try {
      const r = await api('pedido_criar', { frente: f.frente.value, prioridade: f.prioridade.value, necessidade: f.necessidade.value, observacoes: f.observacoes.value, itens });
      toast(r.msg); S.ped = null;
      location.hash = '#/pedido/' + enc(r.numero);
    } catch (x) { toast(x.message, 1); b.disabled = false; b.textContent = 'Enviar pedido'; }
  };
}

/* ---------- coluna de etapas à direita (no celular vira uma faixa de blocos no topo) ---------- */
const ETAPA_IC = {
  andamento: 'clock', urgentes: 'alert', compras: 'cart', cotar: 'cart', cotacao: 'file', aprovar: 'check', liberar: 'truck', receber: 'box',
  nf: 'file', pagar: 'money', concluidos: 'check', cancelados: 'x', todos: 'layers', vencidos: 'alert', pagos: 'check'
};
function comEtapas(grupos, conteudo) {
  return `<div class="comlado"><div class="principal">${conteudo}</div><aside class="etapas">${grupos.map(g =>
    `${g.t ? `<div class="et-tit">${g.t}</div>` : ''}<div class="et-grupo">${g.itens.map(b => `<button type="button" class="et ${b.on ? 'on' : ''} ${b.n === 0 ? 'zero' : ''} ${b.cl || ''}" data-et="${esc(b.k)}">
      ${ic(b.i || ETAPA_IC[b.k] || 'list')}<span>${b.t}</span>${b.n != null ? `<b>${b.n}</b>` : ''}</button>`).join('')}</div>`).join('')}</aside></div>`;
}
function ligarEtapas(fn) { $$('#view .et[data-et]').forEach(b => { b.onclick = () => fn(b.dataset.et, b); }); }

/* ---------- lista de pedidos ---------- */
let SEL = new Set();
async function vPedidos(qs) {
  const q = new URLSearchParams(qs || ''), k = FILTROS[q.get('k')] ? q.get('k') : 'andamento';
  titulo(k === 'compras' ? 'Cotação e compra' : k === 'receber' ? 'Recebimento' : 'Pedidos');
  const ps = await pedidos();
  const grupos = k === 'compras' || (['cotar', 'cotacao', 'aprovar', 'liberar'].includes(k) && q.get('m') === 'c')
    ? [{ t: 'Etapas de compra', itens: ['compras', 'cotar', 'cotacao', 'aprovar', 'liberar'] }, { t: 'Atalhos', itens: ['urgentes', 'andamento'] }]
    : [{ t: 'Situação', itens: ['andamento', 'urgentes'] }, { t: 'Etapas', itens: ['cotar', 'cotacao', 'aprovar', 'liberar', 'receber', 'nf', 'pagar'] }, { t: 'Histórico', itens: ['concluidos', 'cancelados', 'todos'] }];
  const modo = grupos[0].t === 'Etapas de compra' ? '&m=c' : '';
  const selecionavel = ['cotar', 'cotacao', 'compras'].includes(k) && can('compras_cotar');
  SEL = new Set([...SEL].filter(n => ps.some(p => p.numero === n && ['Aberto', 'Em cotação'].includes(p.status))));
  view(comEtapas(grupos.map(g => ({ t: g.t, itens: g.itens.map(x => ({ k: x, t: FILTROS[x].t, n: conta(x), on: x === k })) })),
    `<div class="cab"><h2>${FILTROS[k].t}</h2><span class="contagem">${plural(ps.filter(FILTROS[k].f).length, 'pedido', 'pedidos')}</span></div>
    ${S.todos ? '' : '<div class="aviso info">Você vê apenas os pedidos que abriu.</div>'}
    <div class="busca">${ic('search')}<input type="search" id="busca" placeholder="Buscar nº, material, fornecedor, frente…"></div>
    <div id="lista" class="lista"></div><div id="barra"></div>`));
  ligarEtapas(x => { location.hash = '#/pedidos?k=' + x + (x === 'compras' ? '' : modo); });
  const desenhar = () => {
    const t = norm($('#busca').value);
    const lista = ps.filter(FILTROS[k].f).filter(p => !t || norm([p.numero, p.frente, p.solicitante, p.fornecedor, p.situacao, ...(p.itens || []).map(i => i.descricao)].join(' ')).includes(t))
      .sort((a, b) => quente(b) - quente(a) || prio(b) * !chegou(b) - prio(a) * !chegou(a) || String(a.necessidade || '9').localeCompare(String(b.necessidade || '9')) || String(b.numero).localeCompare(String(a.numero)));
    $('#lista').innerHTML = lista.length ? lista.map(p => cartao(p, selecionavel && ['Aberto', 'Em cotação'].includes(p.status) ? SEL : null)).join('') : '<p class="vazio">Nenhum pedido aqui.</p>';
    ligarCartoes((n, on) => { on ? SEL.add(n) : SEL.delete(n); barra(); });
    barra();
  };
  const barra = () => {
    $('#barra').innerHTML = selecionavel && SEL.size ? `<div class="barra-acoes"><div class="acoes"><button class="btn" id="cotarSel">Pedir cotação (${SEL.size})</button><button class="btn sec" id="limpaSel">Limpar</button></div></div>` : '';
    if ($('#cotarSel')) { $('#cotarSel').onclick = () => mCotar([...SEL]); $('#limpaSel').onclick = () => { SEL.clear(); desenhar(); }; }
  };
  $('#busca').oninput = desenhar;
  desenhar();
}

/* ---------- detalhe do pedido ---------- */
let DET = null;
async function vPedido(numero) {
  titulo('Pedido ' + numero);
  const d = DET = await api('pedido_detalhe', { numero });
  const p = d.pedido, st = p.status;
  const direto = p.condicao === 'Faturamento direto';
  const passo = (t, feito, atual, bloq) => `<div class="${feito ? 'feito' : bloq ? 'bloq' : atual ? 'atual' : ''}">${t}</div>`;
  const aprov = ['Aprovado', 'Concluído'].includes(st);
  const passos = st === 'Cancelado' ? '' : `<div class="passos">
    ${passo('Cotação', !['Aberto', 'Em cotação'].includes(st), ['Aberto', 'Em cotação'].includes(st))}
    ${passo('Aprovação', aprov, st === 'Aguardando aprovação')}
    ${direto ? passo('Pagamento', p.fin === 'Pago', p.fin === 'Aguardando pagamento') : ''}
    ${passo('Liberação', ['Entrega liberada', 'Recebido parcial', 'Recebido'].includes(p.entrega), p.entrega === 'Aguardando liberação', p.entrega === 'Bloqueada')}
    ${passo('Recebimento', p.entrega === 'Recebido', ['Entrega liberada', 'Recebido parcial'].includes(p.entrega))}
    ${direto ? '' : passo('Nota fiscal', aprov && p.fin !== 'Aguardando NF' && !!p.fin, p.fin === 'Aguardando NF' && p.entrega === 'Recebido')}
    ${direto ? '' : passo('Pagamento', p.fin === 'Pago', p.fin === 'A pagar')}
  </div>`;

  const A = [];
  if (['Aberto', 'Em cotação'].includes(st)) {
    if (can('compras_cotar')) A.push(['cotar', 'Pedir cotação', 'sec'], ['orc', 'Registrar orçamento', d.orcamentos.length ? 'sec' : '']);
    if (can('compras_definir') && d.orcamentos.length) A.push(['definir', 'Definir compra']);
  }
  if (st === 'Aguardando aprovação' && can('compras_aprovar')) A.push(['aprovar', 'Aprovar compra'], ['devolver', 'Reprovar', 'perigo']);
  if (st === 'Aprovado') {
    if (['Aguardando pagamento', 'A pagar'].includes(p.fin) && can('financeiro')) A.push(['pagar', 'Registrar pagamento']);
    if (p.entrega === 'Aguardando liberação' && can('compras_liberar')) A.push(['liberar', 'Liberar entrega']);
    if (['Entrega liberada', 'Recebido parcial'].includes(p.entrega) && can('pedido_receber')) A.push(['receber', 'Receber material']);
    if (can(['financeiro', 'pedido_receber', 'compras_cotar'])) A.push(['nf', p.nf_numero ? 'Corrigir NF' : 'Registrar nota fiscal', 'sec']);
  }
  if (!['Cancelado', 'Concluído', 'Aguardando aprovação'].includes(st) && can(['compras_cotar', 'compras_liberar', 'financeiro']) && (p.fornecedor_cod || ['Aberto', 'Em cotação'].includes(st))) A.push(['portal', 'Link do fornecedor', 'sec']);
  if (st !== 'Cancelado') A.push(['anexar', 'Anexar arquivo', 'sec']);
  if (!['Cancelado', 'Concluído'].includes(st) && can('compras_cancelar') && (st !== 'Aprovado' || admin())) A.push(['cancelar', 'Cancelar', 'perigo']);

  const minOk = d.fornecedores_orcados >= d.minimo;
  const forn = S.dados.fornecedores.find(f => f.codigo === p.fornecedor_cod || norm(f.nome) === norm(p.fornecedor));
  const itensTot = d.itens.some(i => i.valor_unit !== '' && i.valor_unit != null);
  view(`<a href="javascript:history.back()" class="linkbtn">${ic('back')} Voltar</a>
    <div class="card det-cab">
      <div class="l1"><span class="num">${esc(p.numero)}</span>${badge(p.situacao)}${tagPrio(p)}</div>
      ${passos}
      <dl class="kv">
        <dt>Aberto em</dt><dd>${fdh(p.criado_em)} · ${esc(p.solicitante)}</dd>
        ${p.frente ? `<dt>Frente</dt><dd>${esc(p.frente)}</dd>` : ''}
        ${p.necessidade ? `<dt>Necessário até</dt><dd class="${vencido(p.necessidade) && FILTROS.andamento.f(p) && p.entrega !== 'Recebido' ? 'atrasado' : ''}">${fd(p.necessidade)}</dd>` : ''}
        ${p.observacoes ? `<dt>Obs.</dt><dd>${esc(p.observacoes)}</dd>` : ''}
      </dl>
    </div>

    <div class="card"><h3>Materiais</h3><div class="rolar"><table class="tab"><tr><th>#</th><th>Material</th><th class="n">Pedido</th><th class="n">Recebido</th>${itensTot ? '<th class="n">Valor</th>' : ''}</tr>
      ${d.itens.map(i => `<tr><td>${i.item}</td><td>${esc(i.descricao)}${i.material_cod ? '' : ' <small>(fora do cadastro)</small>'}</td><td class="n">${nf(i.qtd)} ${esc(i.unidade)}</td>
        <td class="n ${num(i.qtd_recebida) >= num(i.qtd) ? '' : num(i.qtd_recebida) ? 'atrasado' : ''}">${nf(i.qtd_recebida)}</td>${itensTot ? `<td class="n">${i.valor_unit !== '' ? brl(num(i.valor_unit) * num(i.qtd)) : ''}</td>` : ''}</tr>`).join('')}
    </table></div></div>

    ${p.fornecedor ? `<div class="card"><h3>Compra</h3><dl class="kv">
      <dt>Fornecedor</dt><dd>${esc(p.fornecedor)}${forn && forn.telefone ? ` · <a href="${wa(forn.telefone, `Olá! Sobre o pedido ${p.numero} da obra ${S.dados.obra.nome} — Size Engenharia.`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</dd>
      <dt>Valor</dt><dd>${brl(p.valor_total)}</dd>
      <dt>Condição</dt><dd>${esc(p.condicao)}${p.prazo_fat ? ' ' + esc(p.prazo_fat) + ' dias' : ''}</dd>
      ${p.previsao ? `<dt>Previsão</dt><dd>${fd(p.previsao)}</dd>` : ''}
      ${p.aprovado_por ? `<dt>Aprovado</dt><dd>${esc(p.aprovado_por)} · ${fdh(p.aprovado_em)}</dd>` : ''}
      ${p.excecao_orc ? `<dt>Exceção</dt><dd class="atrasado">${esc(p.excecao_orc)}</dd>` : ''}
      ${p.liberado_em ? `<dt>Liberado</dt><dd>${fdh(p.liberado_em)}</dd>` : ''}
      ${p.nf_numero ? `<dt>Nota fiscal</dt><dd>${esc(p.nf_numero)} · ${fd(p.nf_em)}</dd>` : ''}
      ${p.vencimento ? `<dt>Vencimento</dt><dd class="${p.fin !== 'Pago' && vencido(p.vencimento) ? 'atrasado' : ''}">${fd(p.vencimento)}</dd>` : ''}
      ${p.fin ? `<dt>Financeiro</dt><dd>${esc(p.fin)}${p.pago_em ? ' em ' + fd(p.pago_em) + (p.forma_pagto ? ' · ' + esc(p.forma_pagto) : '') : ''}</dd>` : ''}
    </dl></div>` : ''}

    <div class="card"><h3>Orçamentos</h3>
      <div class="meta ${minOk ? 'aviso ok' : 'aviso warn'}"><span>${plural(d.fornecedores_orcados, 'fornecedor', 'fornecedores')} com orçamento · mínimo exigido: ${d.minimo}</span>${minOk ? '✓' : ''}</div>
      ${p.cotado_a ? `<small>Cotação enviada a: ${esc(p.cotado_a)}</small>` : ''}
      ${['Aberto', 'Em cotação'].includes(st) && can('compras_cotar') && p.cotado_a ? '<p><button class="linkbtn" id="capt">Buscar respostas no e-mail agora</button></p>' : ''}
      ${d.orcamentos.map(o => `<div class="orc ${o.fornecedor_cod && o.fornecedor_cod === p.fornecedor_cod ? 'venc' : ''}"><div class="corpo"><b>${esc(o.fornecedor)}</b> ${o.valor !== '' ? '· ' + brl(o.valor) : '<small class="atrasado">· sem valor</small>'}
        <br><small>${[o.prazo_entrega && 'entrega ' + o.prazo_entrega, o.condicao, o.origem === 'e-mail' ? 'recebido por e-mail' : '', fdh(o.recebido_em)].filter(Boolean).map(esc).join(' · ')}</small></div>
        ${o.arquivo_id ? `<button class="btn sec peq" data-ver="${esc(o.arquivo_id)}">Ver</button>` : ''}
        ${['Aberto', 'Em cotação'].includes(st) && can('compras_cotar') ? `<button class="btn sec peq" data-orc="${esc(o.id)}">Editar</button>` : ''}</div>`).join('') || '<p class="vazio" style="padding:10px">Nenhum orçamento ainda.</p>'}
    </div>

    ${d.recebimentos.length ? `<div class="card"><h3>Recebimentos</h3><div class="rolar"><table class="tab"><tr><th>Data</th><th>Material</th><th class="n">Qtd</th><th>Por</th></tr>
      ${d.recebimentos.map(r => `<tr><td>${fdh(r.data)}</td><td>${esc(r.descricao)}</td><td class="n">${nf(r.qtd)} ${esc(r.unidade)}</td><td>${esc(r.usuario)}${r.nf ? '<br><small>NF ' + esc(r.nf) + '</small>' : ''}</td></tr>`).join('')}</table></div></div>` : ''}

    <div class="card"><h3>Arquivos</h3>${d.arquivos.map(a => `<div class="arq"><span class="tipo">${esc(a.tipo)}</span><span class="nome">${esc(a.nome)}<br><small>${fdh(a.data)} · ${esc(a.usuario)}</small></span>
      <button class="btn sec peq" data-ver="${esc(a.file_id)}">Ver</button></div>`).join('') || '<small>Nenhum arquivo.</small>'}
      ${p.pasta_url && admin() ? `<p><a href="${esc(p.pasta_url)}" target="_blank" rel="noopener">Abrir pasta no Drive</a></p>` : ''}</div>

    <div class="card"><h3>Histórico</h3><pre class="hist">${esc(p.historico)}</pre></div>
    ${A.length ? `<div class="barra-acoes"><div class="acoes">${A.map(([a, t, cl]) => `<button class="btn ${cl || ''}" data-acao="${a}">${t}</button>`).join('')}</div></div>` : ''}`);

  $$('[data-ver]').forEach(b => { b.onclick = () => verArquivo(b.dataset.ver); });
  $$('[data-orc]').forEach(b => { b.onclick = () => mOrc(d, d.orcamentos.find(o => o.id === b.dataset.orc)); });
  const ACOES = {
    cotar: () => mCotar([p.numero]), orc: () => mOrc(d), definir: () => mDefinir(d), aprovar: () => mAprovar(d), devolver: () => mMotivo(d, 'pedido_devolver', 'Reprovar compra', 'Reprovar', 'A compra volta para Compras refazer a cotação. Para desistir do pedido de vez, use "Cancelar".'),
    pagar: () => mPagar(d), liberar: () => mLiberar(d), receber: () => mReceber(d), nf: () => mNF(d), anexar: () => mAnexar(d), portal: () => mPortal(d), cancelar: () => mMotivo(d, 'pedido_cancelar', 'Cancelar pedido', 'Cancelar pedido')
  };
  $$('[data-acao]').forEach(b => { b.onclick = ACOES[b.dataset.acao]; });
  if ($('#capt')) $('#capt').onclick = async e => {
    e.target.disabled = true; e.target.textContent = 'Buscando…';
    try { await depois(await api('capturar_emails')); } catch (x) { toast(x.message, 1); e.target.disabled = false; }
  };
}
async function depois(r) { toast(r.msg || 'Feito.'); S.ped = null; if (DET) await vPedido(DET.pedido.numero); pedidos().catch(() => {}); buscarNotif(); }

/* ---------- ações do pedido ---------- */
function mCotar(nums) {
  const fs = S.dados.fornecedores.filter(f => ativo(f));
  const f = modal(`Pedir cotação · ${plural(nums.length, 'pedido', 'pedidos')}`, `
    <div class="busca" style="margin:0">${ic('search')}<input type="search" id="bf" placeholder="Buscar fornecedor ou material…"></div>
    <div class="forn">${fs.map(x => `<div class="fi" data-t="${esc(norm(x.nome + ' ' + x.materiais))}"><label class="ck"><input type="checkbox" name="forn" value="${esc(x.codigo)}">
      <span>${esc(x.nome)}<br><small>${esc([x.materiais, x.email || 'sem e-mail'].filter(Boolean).join(' · '))}</small></span></label>
      ${x.email ? '' : `<input type="email" class="em" data-c="${esc(x.codigo)}" placeholder="E-mail (opcional — sem e-mail, envie o link pelo WhatsApp)" hidden>`}</div>`).join('') || '<small>Nenhum fornecedor cadastrado nesta obra. Cadastre em Fornecedores.</small>'}</div>
    <label>Responder até<input type="date" name="prazo" min="${hoje()}">${datas('prazo')}</label>
    <label>Mensagem <small>(opcional)</small><input name="msg"></label>
    <small>Cada fornecedor recebe um link próprio para preencher o orçamento (valor, prazo, condição e PDF). Depois do envio aparecem os botões de WhatsApp.</small>`, {
    ok: 'Enviar cotação',
    onOk: async f => {
      const fornecedores = $$('[name=forn]:checked', f).map(x => x.value);
      if (!fornecedores.length) throw new Error('Marque ao menos um fornecedor.');
      const emails = {};
      $$('input.em:not([hidden])', f).forEach(e => { if (e.value.trim()) emails[e.dataset.c] = e.value.trim(); });
      const r = await api('pedido_cotar', { numeros: nums, fornecedores, emails, prazo: f.prazo.value, msg: f.msg.value });
      SEL.clear();
      if (DET && nums.includes(DET.pedido.numero) && location.hash.startsWith('#/pedido/')) await depois(r); else { toast(r.msg); S.ped = null; rotear(); }
      setTimeout(() => mostrarLinks('Cotação enviada', r.msg, r.links, 'cotacao'), 50);
    }
  });
  $$('[name=forn]', f).forEach(cb => { cb.onchange = () => { const e = cb.closest('.fi').querySelector('input.em'); if (e) e.hidden = !cb.checked; }; });
  $('#bf', f).onkeydown = e => { if (e.key === 'Enter') e.preventDefault(); };
  $('#bf', f).oninput = e => { const t = norm(e.target.value); $$('.fi', f).forEach(x => { x.hidden = !x.dataset.t.includes(t); }); };
}

/* links do portal do fornecedor: WhatsApp e copiar */
function textoPortal(tipo, url) {
  const obra = S.dados.obra.nome;
  return tipo === 'cotacao'
    ? `Olá! A Size Engenharia solicita cotação para a obra ${obra}. Veja os itens e envie seu orçamento por este link:\n${url}`
    : `Olá! Sobre o pedido da Size Engenharia para a obra ${obra}: por este link você acompanha a compra, informa a data de entrega e envia a nota fiscal:\n${url}`;
}
function mostrarLinks(titulo, msg, links, tipo) {
  modal(titulo, `${msg ? `<div class="aviso ok">${esc(msg)}</div>` : ''}
    ${links.map((l, i) => `<div class="arq"><span class="nome"><b>${esc(l.nome)}</b><br><small>${esc(l.email || 'sem e-mail')}${l.telefone ? ' · ' + esc(l.telefone) : ''}</small></span>
      ${l.telefone ? `<a class="btn peq" href="${wa(l.telefone, textoPortal(tipo, l.url))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      <button type="button" class="btn sec peq" data-copia="${i}">Copiar link</button></div>`).join('')}
    <small>O link vale por 60 dias e só mostra os pedidos deste fornecedor.</small>`, { semRodape: true });
  $$('[data-copia]').forEach(b => {
    b.onclick = async () => {
      const l = links[+b.dataset.copia], txt = textoPortal(tipo, l.url);
      try { await navigator.clipboard.writeText(txt); toast('Link copiado. Cole no WhatsApp ou e-mail.'); }
      catch (e) { prompt('Copie o texto:', txt); }
    };
  });
}
async function mPortal(d) {
  const p = d.pedido, fs = S.dados.fornecedores.filter(f => ativo(f));
  const gerar = async cod => {
    const r = await api('forn_link', { fornecedor: cod, numeros: [p.numero] });
    mostrarLinks('Link do fornecedor', '', [Object.assign({ codigo: cod, email: (fs.find(f => f.codigo === cod) || {}).email }, r)], ['Aberto', 'Em cotação'].includes(p.status) ? 'cotacao' : 'compra');
  };
  if (p.fornecedor_cod && !['Aberto', 'Em cotação'].includes(p.status)) return gerar(p.fornecedor_cod).catch(e => toast(e.message, 1));
  modal('Link do fornecedor', `<label>Fornecedor<select name="forn" required><option value="">Escolha…</option>${fs.map(f => `<option value="${esc(f.codigo)}">${esc(f.nome)}</option>`).join('')}</select></label>
    <small>Gera o link do portal para este pedido: o fornecedor vê os itens e envia o orçamento por ali.</small>`,
  { ok: 'Gerar link', onOk: async f => { await gerar(f.forn.value); return false; } });
}

function mOrc(d, o) {
  const fs = S.dados.fornecedores.filter(f => ativo(f) || (o && f.codigo === o.fornecedor_cod));
  modal(o ? 'Editar orçamento' : 'Registrar orçamento', `
    <label>Fornecedor<select name="forn" required><option value="">Escolha…</option>${fs.map(f => `<option value="${esc(f.codigo)}" ${o && o.fornecedor_cod === f.codigo ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></label>
    ${o && !o.fornecedor_cod ? `<div class="aviso warn">Recebido de ${esc(o.fornecedor)} — escolha o fornecedor cadastrado.</div>` : ''}
    <div class="g2"><label>Valor total (R$)<input name="valor" inputmode="decimal" value="${o && o.valor !== '' ? esc(String(o.valor).replace('.', ',')) : ''}" placeholder="0,00"></label>
    <label>Prazo de entrega<input name="prazo" value="${esc(o?.prazo_entrega || '')}" placeholder="ex: 5 dias"></label></div>
    <label>Condição de pagamento<input name="cond" value="${esc(o?.condicao || '')}" placeholder="ex: 30 dias / à vista"></label>
    ${campoArquivo('arq', o ? 'Trocar arquivo' : 'PDF ou foto do orçamento', !o)}
    ${o ? '<button type="button" class="btn perigo" id="exc">Excluir orçamento</button>' : ''}`, {
    ok: 'Salvar',
    onOk: async f => depois(await api('orcamento_salvar', { pedido: d.pedido.numero, id: o?.id, fornecedor_cod: f.forn.value, valor: f.valor.value, prazo_entrega: f.prazo.value, condicao: f.cond.value, arquivo: await lerArquivo(f.arq) }))
  });
  if (o) $('#exc').onclick = async () => { if (!confirm('Excluir este orçamento?')) return; try { fecharModal(); await depois(await api('orcamento_excluir', { pedido: d.pedido.numero, id: o.id })); } catch (e) { toast(e.message, 1); } };
}

function minPara(valor) {
  const R = S.dados.regras;
  let m = R.min || 1;
  String(R.faixas || '').split(/[;\n]/).forEach(x => { const a = x.split(':'); if (a.length === 2 && num(valor) >= num(a[0]) && num(a[1]) > m) m = num(a[1]); });
  return m;
}
function mDefinir(d) {
  const p = d.pedido, orcs = d.orcamentos, nForn = d.fornecedores_orcados;
  const f = modal('Definir compra', `
    <h3>Orçamento escolhido</h3>
    ${orcs.map((o, i) => `<label class="ck orc"><input type="radio" name="orc" value="${esc(o.id)}" ${i === 0 ? 'checked' : ''} required><span><b>${esc(o.fornecedor)}</b> ${o.valor !== '' ? brl(o.valor) : '<small>(sem valor)</small>'}<br><small>${esc([o.prazo_entrega, o.condicao].filter(Boolean).join(' · '))}</small></span></label>`).join('')}
    <label>Valor total da compra (R$)<input name="valor" inputmode="decimal" required></label>
    <div id="regra"></div>
    <label id="lexc" hidden>Justificativa da exceção<textarea name="exc" placeholder="ex: fornecedor único na região / urgência"></textarea></label>
    <label>Forma de faturamento<select name="cond"><option>Faturado</option><option>Faturamento direto</option></select></label>
    <label id="lprazo">Prazo do faturamento (dias)<input name="prazo" type="number" min="0" inputmode="numeric" value="${S.dados.regras.prazo}"></label>
    <small id="dica"></small>
    <label>Previsão de entrega <small>(opcional)</small><input type="date" name="previsao" min="${hoje()}">${datas('previsao')}</label>
    ${d.itens.length > 1 ? `<details><summary>Valor unitário por item (opcional)</summary>${d.itens.map(i => `<label>${esc(i.descricao)} · ${nf(i.qtd)} ${esc(i.unidade)}<input name="v_${i.item}" inputmode="decimal" placeholder="R$ unitário"></label>`).join('')}</details>` : ''}
    ${can('compras_aprovar') ? '<label class="ck"><input type="checkbox" name="aprovar" checked> Já aprovar a compra (você tem permissão de aprovação)</label>' : '<small>Depois de definida, a compra vai para aprovação.</small>'}`, {
    ok: 'Definir compra',
    onOk: async f => {
      const valores = {};
      d.itens.forEach(i => { if (f['v_' + i.item] && f['v_' + i.item].value) valores[i.item] = f['v_' + i.item].value; });
      return depois(await api('pedido_definir', { numero: p.numero, orcamento: f.orc.value, valor: f.valor.value, condicao: f.cond.value, prazo_fat: f.prazo.value, previsao: f.previsao.value, excecao: f.exc.value, valores, aprovar: !!(f.aprovar && f.aprovar.checked) }));
    }
  });
  const atualiza = () => {
    const o = orcs.find(x => x.id === (f.orc.value || (f.orc[0] && f.orc[0].value)));
    const min = minPara(f.valor.value || (o && o.valor) || 0), falta = nForn < min;
    $('#regra').innerHTML = `<div class="aviso ${falta ? 'warn' : 'ok'}">${plural(nForn, 'fornecedor', 'fornecedores')} com orçamento · mínimo para este valor: ${min}${falta ? (can('compras_aprovar') ? ' — justifique a exceção abaixo.' : ' — registre mais orçamentos ou peça ao aprovador.') : ' ✓'}</div>`;
    $('#lexc').hidden = !falta || !can('compras_aprovar');
    const dir = f.cond.value === 'Faturamento direto';
    $('#lprazo').hidden = dir;
    $('#dica').textContent = dir ? 'Faturamento direto: depois de aprovada vai ao financeiro; o pagamento (com comprovante) já libera a entrega.'
      : 'Faturado: depois de aprovada a entrega pode ser liberada; quando a nota fiscal chegar, vai ao financeiro.';
  };
  const preenche = () => { const o = orcs.find(x => x.id === f.orc.value); if (o && o.valor !== '') f.valor.value = String(o.valor).replace('.', ','); if (o && /direto|antecipad|vista/i.test(o.condicao)) f.cond.value = 'Faturamento direto'; atualiza(); };
  $$('[name=orc]', f).forEach(r => { r.onchange = preenche; });
  f.valor.oninput = atualiza;
  f.cond.onchange = atualiza;
  preenche();
}

function mAprovar(d) {
  const p = d.pedido;
  modal('Aprovar compra', `<dl class="kv"><dt>Fornecedor</dt><dd>${esc(p.fornecedor)}</dd><dt>Valor</dt><dd>${brl(p.valor_total)}</dd>
    <dt>Condição</dt><dd>${esc(p.condicao)}${p.prazo_fat ? ' ' + p.prazo_fat + ' dias' : ''}</dd><dt>Orçamentos</dt><dd>${d.fornecedores_orcados} (mínimo ${d.minimo})</dd></dl>
    ${p.excecao_orc ? `<div class="aviso warn">Exceção: ${esc(p.excecao_orc)}</div>` : ''}
    <div class="aviso info">${p.condicao === 'Faturamento direto' ? 'Vai para o financeiro pagar; o pagamento já libera a entrega.' : 'Fica pronta para liberar a entrega.'}</div>`,
  { ok: 'Aprovar', onOk: async () => depois(await api('pedido_aprovar', { numero: p.numero })) });
}

function mMotivo(d, acao, t, ok, dica) {
  modal(t, `${dica ? `<div class="aviso info">${esc(dica)}</div>` : ''}<label>Motivo<textarea name="motivo" required></textarea></label>`, { ok, onOk: async f => depois(await api(acao, { numero: d.pedido.numero, motivo: f.motivo.value })) });
}

function mPagar(d) {
  const p = d.pedido, antecipado = p.fin === 'Aguardando pagamento';
  modal('Registrar pagamento', `<dl class="kv"><dt>Fornecedor</dt><dd>${esc(p.fornecedor)}</dd><dt>Valor</dt><dd>${brl(p.valor_total)}</dd>
    ${p.vencimento ? `<dt>Vencimento</dt><dd>${fd(p.vencimento)}</dd>` : ''}${p.nf_numero ? `<dt>NF</dt><dd>${esc(p.nf_numero)}</dd>` : ''}</dl>
    <div class="g2"><label>Forma<select name="forma"><option>PIX</option><option>Boleto</option><option>TED/DOC</option><option>Cartão</option><option>Dinheiro</option><option>Outro</option></select></label>
    <label>Data do pagamento<input type="date" name="data" value="${hoje()}" required></label></div>
    ${campoArquivo('comp', 'Comprovante de pagamento', true)}
    ${antecipado ? '<label class="ck"><input type="checkbox" name="avisar" checked> Enviar o comprovante ao fornecedor por e-mail</label><div class="aviso info">Faturamento direto: o pagamento <b>já libera a entrega</b>. O fornecedor recebe o comprovante e o link para informar a data de entrega e enviar a nota fiscal.</div>' : ''}`,
  {
    ok: 'Registrar pagamento',
    onOk: async f => {
      const r = await api('pedido_pagar', { numero: p.numero, forma: f.forma.value, data: f.data.value, comprovante: await lerArquivo(f.comp), avisar: !!(f.avisar && f.avisar.checked) });
      await depois(r);
      if (antecipado && p.fornecedor_cod) setTimeout(() => mPortal(DET), 50);
    }
  });
}

function mLiberar(d) {
  const p = d.pedido;
  modal('Liberar entrega', `<p>Envia e-mail para <b>${esc(p.fornecedor)}</b> liberando a entrega na obra, com o link do portal para ele informar a data de entrega e enviar a nota fiscal (que pode vir depois da entrega).</p>
    <label>Previsão de entrega <small>(opcional)</small><input type="date" name="previsao" min="${hoje()}" value="${p.previsao ? String(p.previsao).slice(0, 10) : ''}">${datas('previsao')}</label>
    <label>Mensagem <small>(opcional)</small><input name="msg" placeholder="ex: descarregar no portão 2, das 8h às 17h"></label>
    <small>Depois de liberar aparece o botão para avisar também pelo WhatsApp.</small>`,
  {
    ok: 'Liberar entrega',
    onOk: async f => {
      await depois(await api('pedido_liberar', { numero: p.numero, previsao: f.previsao.value, msg: f.msg.value }));
      if (p.fornecedor_cod) setTimeout(() => mPortal(DET), 50);
    }
  });
}

function mReceber(d) {
  const p = d.pedido, falta = i => Math.max(0, num(i.qtd) - num(i.qtd_recebida));
  const f = modal('Receber material', `
    <div class="acoes"><button type="button" class="btn sec peq" id="tudo">Recebi tudo</button><button type="button" class="btn sec peq" id="zera">Zerar</button></div>
    <div>${d.itens.map(i => `<div class="rec ${falta(i) ? '' : 'feito'}"><div><b>${esc(i.descricao)}</b><small>Pedido ${nf(i.qtd)} ${esc(i.unidade)} · já recebido ${nf(i.qtd_recebida)} · falta ${nf(falta(i))}</small></div>
      <input name="q_${i.item}" type="number" step="any" min="0" max="${falta(i)}" inputmode="decimal" placeholder="0" ${falta(i) ? '' : 'disabled'} data-falta="${falta(i)}"></div>`).join('')}</div>
    <div class="g2"><label>Nº da nota fiscal <small>(se veio)</small><input name="nfn" inputmode="numeric"></label><label>Emissão da NF<input type="date" name="nfd"></label></div>
    ${campoArquivo('nf', 'Foto/PDF da nota fiscal')}
    ${campoArquivo('foto', 'Foto da entrega')}
    <label>Observação<input name="obs" placeholder="ex: 2 sacos avariados"></label>
    <label class="ck"><input type="checkbox" name="encerrar"> Encerrar o recebimento — o que falta não vai ser entregue</label>`, {
    ok: 'Confirmar recebimento',
    onOk: async f => {
      const itens = {};
      d.itens.forEach(i => { const v = f['q_' + i.item].value; if (v) itens[i.item] = v; });
      if (f.encerrar.checked && !f.obs.value.trim()) throw new Error('Explique na observação por que o restante não virá.');
      return depois(await api('pedido_receber', { numero: p.numero, itens, nf_numero: f.nfn.value, nf_data: f.nfd.value, nf: await lerArquivo(f.nf), foto: await lerArquivo(f.foto), obs: f.obs.value, encerrar: f.encerrar.checked }));
    }
  });
  $('#tudo').onclick = () => $$('input[data-falta]', f).forEach(x => { if (!x.disabled) x.value = x.dataset.falta; });
  $('#zera').onclick = () => $$('input[data-falta]', f).forEach(x => { x.value = ''; });
}

function mNF(d) {
  const p = d.pedido;
  modal('Nota fiscal', `<div class="g2"><label>Número da NF<input name="nfn" inputmode="numeric" value="${esc(p.nf_numero === 's/ nº' ? '' : p.nf_numero || '')}"></label>
    <label>Data de emissão<input type="date" name="nfd" value="${p.nf_em ? String(p.nf_em).slice(0, 10) : hoje()}"></label></div>
    ${campoArquivo('arq', 'PDF ou foto da nota')}
    ${p.fin === 'Aguardando NF' ? `<div class="aviso info">Com a nota registrada o pedido vai para o financeiro (vencimento = emissão + ${esc(p.prazo_fat || 0)} dias).</div>` : ''}`,
  { ok: 'Salvar nota', onOk: async f => depois(await api('pedido_nf', { numero: p.numero, nf_numero: f.nfn.value, nf_data: f.nfd.value, arquivo: await lerArquivo(f.arq) })) });
}

function mAnexar(d) {
  modal('Anexar arquivo', `<label>Tipo<select name="tipo"><option value="ORC">Orçamento</option><option value="NF">Nota fiscal</option><option value="COMPROVANTE">Comprovante</option><option value="FOTO">Foto</option><option value="OUTRO" selected>Outro</option></select></label>
    ${campoArquivo('arq', 'Arquivo (PDF ou imagem)', true)}<small>Para o orçamento contar na regra de cotação, use "Registrar orçamento".</small>`,
  { ok: 'Anexar', onOk: async f => depois(await api('arquivo_anexar', { pedido: d.pedido.numero, tipo: f.tipo.value, arquivo: await lerArquivo(f.arq) })) });
}

/* ---------- financeiro ---------- */
async function vFinanceiro(qs) {
  titulo('Financeiro');
  const aba = new URLSearchParams(qs || '').get('aba') || 'pagar';
  const ps = await pedidos();
  const ordVenc = (a, b) => String(a.vencimento || a.aprovado_em || '').localeCompare(String(b.vencimento || b.aprovado_em || ''));
  const ABAS = {
    pagar: { t: 'A pagar', f: FILTROS.pagar.f, ord: ordVenc },
    antecipado: { t: 'Antecipados', i: 'truck', f: p => p.status === 'Aprovado' && p.fin === 'Aguardando pagamento', ord: ordVenc, dica: 'Faturamento direto: o pagamento libera a entrega.' },
    vencidos: { t: 'Vencidos', f: p => FILTROS.pagar.f(p) && vencido(p.vencimento), ord: ordVenc, cl: 'quente' },
    nf: { t: 'Aguardando NF', f: FILTROS.nf.f, ord: (a, b) => String(a.aprovado_em).localeCompare(String(b.aprovado_em)), dica: 'Faturado: entra em "A pagar" quando a nota fiscal chegar.' },
    pagos: { t: 'Pagos', f: p => p.fin === 'Pago' && p.status !== 'Cancelado', ord: (a, b) => String(b.pago_em).localeCompare(String(a.pago_em)) }
  };
  const A = ABAS[aba] || ABAS.pagar;
  const lista = ps.filter(A.f).sort(A.ord);
  const tot = lista.reduce((s, p) => s + num(p.valor_total), 0);
  const prox7 = lista.filter(p => p.vencimento && !vencido(p.vencimento) && String(p.vencimento).slice(0, 10) <= maisDias(7)).reduce((s, p) => s + num(p.valor_total), 0);
  view(comEtapas([
    { t: 'Pagamentos', itens: ['pagar', 'antecipado', 'vencidos'].map(k => ({ k, t: ABAS[k].t, i: ABAS[k].i, n: ps.filter(ABAS[k].f).length, on: k === aba, cl: ABAS[k].cl })) },
    { t: 'Acompanhar', itens: ['nf', 'pagos'].map(k => ({ k, t: ABAS[k].t, n: ps.filter(ABAS[k].f).length, on: k === aba })) }
  ], `<div class="cab"><h2>${A.t}</h2><span class="contagem">${plural(lista.length, 'pedido', 'pedidos')}</span></div>
    ${A.dica ? `<div class="aviso info">${A.dica}</div>` : ''}
    <div class="kpis k2"><div class="kpi destaque"><b>${brl(tot)}</b><span>Total ${A.t.toLowerCase()}</span></div>
      ${aba === 'pagar' ? `<div class="kpi"><b>${brl(prox7)}</b><span>Vence nos próximos 7 dias</span></div>` : ''}</div>
    <div class="lista">${lista.map(p => cartao(p)).join('') || '<p class="vazio">Nada por aqui.</p>'}</div>`));
  ligarEtapas(k => { location.hash = '#/financeiro?aba=' + k; });
  ligarCartoes();
}

/* ---------- estoque ---------- */
let FILTRO_EST = 'todos';
async function vEstoque() {
  titulo('Estoque');
  const r = await api('estoque_saldo');
  const pode = can('estoque_movimentar');
  const baixo = i => i.estoque_min && i.saldo < i.estoque_min;
  const VER = {
    todos: { t: 'Todos os materiais', i: 'layers', f: () => true },
    baixo: { t: 'Abaixo do mínimo', i: 'alert', f: baixo, cl: 'quente' },
    com: { t: 'Com saldo', i: 'box', f: i => i.saldo > 0 },
    zerados: { t: 'Zerados', i: 'minus', f: i => !(i.saldo > 0) }
  };
  if (!VER[FILTRO_EST]) FILTRO_EST = 'todos';
  const grupos = [{ t: 'Ver', itens: Object.entries(VER).map(([k, v]) => ({ k, t: v.t, i: v.i, cl: v.cl, n: r.itens.filter(v.f).length, on: k === FILTRO_EST })) }];
  if (pode) grupos.push({ t: 'Movimentar', itens: [{ k: 'mov:Saída', t: 'Saída p/ frente', i: 'send', cl: 'acao' }, { k: 'mov:Entrada', t: 'Entrada avulsa', i: 'plus', cl: 'acao' }, { k: 'mov:Ajuste', t: 'Ajuste de saldo', i: 'sliders2', cl: 'acao' }] });
  view(comEtapas(grupos, `<div class="cab"><h2>${VER[FILTRO_EST].t}</h2><span class="contagem">${esc(S.dados.obra.nome)}</span></div>
    <div class="busca">${ic('search')}<input type="search" id="busca" placeholder="Buscar material ou categoria…"></div>
    <div id="est" class="estoque"></div>`));
  ligarEtapas(k => { if (k.startsWith('mov:')) return mMov(k.slice(4), r.itens); FILTRO_EST = k; vEstoque(); });
  const desenhar = () => {
    const t = norm($('#busca').value);
    const l = r.itens.filter(VER[FILTRO_EST].f).filter(i => !t || norm(i.descricao + ' ' + (i.categoria || '')).includes(t));
    $('#est').innerHTML = l.map(i => {
      const ref = Math.max(i.estoque_min * 2 || 0, i.entradas || 0, i.saldo, 1), pct = Math.max(0, Math.min(100, i.saldo / ref * 100));
      return `<button type="button" class="est-item ${baixo(i) ? 'baixo' : ''}" data-ch="${esc(i.chave)}">
        <span class="est-nome"><b>${esc(i.descricao)}</b><small>${esc([i.categoria, i.material_cod || 'fora do cadastro', i.ultimo ? 'últ. mov. ' + fd(i.ultimo) : ''].filter(Boolean).join(' · '))}</small></span>
        <span class="est-saldo"><b>${nf(i.saldo)}</b><small>${esc(i.unidade || '')}</small></span>
        <span class="nivel"><span style="width:${pct}%"></span>${i.estoque_min ? `<i style="left:${Math.min(100, i.estoque_min / ref * 100)}%" title="mínimo ${nf(i.estoque_min)}"></i>` : ''}</span>
      </button>`;
    }).join('') || '<p class="vazio">Nenhum material aqui. As entradas são lançadas sozinhas no recebimento dos pedidos.</p>';
    $$('#est [data-ch]').forEach(b => { b.onclick = () => extrato(r.itens.find(i => i.chave === b.dataset.ch)); });
  };
  $('#busca').oninput = desenhar;
  desenhar();
}
async function extrato(i) {
  modal(esc(i.descricao), '<div class="carregando"><span class="spin"></span></div>', { semRodape: true, larga: true });
  try {
    const r = await api('estoque_extrato', { chave: i.chave });
    $('#modal .mcorpo').innerHTML = `<div class="aviso info">Saldo: <b>${nf(i.saldo)} ${esc(i.unidade || '')}</b> · entradas ${nf(i.entradas)} · saídas ${nf(i.saidas)}</div>
      <div class="rolar"><table class="tab"><tr><th>Data</th><th>Tipo</th><th class="n">Qtd</th><th>Detalhe</th></tr>${r.movimentos.map(m => `<tr><td>${fdh(m.data)}</td><td>${esc(m.tipo)}</td>
      <td class="n ${num(m.qtd) < 0 ? 'atrasado' : ''}">${num(m.qtd) > 0 ? '+' : ''}${nf(m.qtd)}</td><td>${esc([m.pedido, m.frente, m.usuario, m.obs].filter(Boolean).join(' · '))}</td></tr>`).join('')}</table></div>`;
  } catch (e) { $('#modal .mcorpo').innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; }
}
function mMov(tipo, itens) {
  const mats = S.dados.materiais.filter(m => ativo(m)), frentes = S.dados.frentes.filter(x => ativo(x, 'ativa'));
  const saldo = cod => { const x = itens.find(i => i.material_cod === cod); return x ? x.saldo : 0; };
  const f = modal(tipo === 'Saída' ? 'Saída para frente de trabalho' : tipo === 'Entrada' ? 'Entrada avulsa' : 'Ajuste de estoque', `
    <label>Material<select name="mat" required><option value="">Escolha…</option>${mats.map(m => `<option value="${esc(m.codigo)}">${esc(m.descricao)}${tipo !== 'Entrada' ? ' — saldo ' + nf(saldo(m.codigo)) + ' ' + esc(m.unidade || '') : ''}</option>`).join('')}</select></label>
    ${tipo === 'Ajuste' ? '<label>Ajuste<select name="sinal"><option value="+">Somar ao saldo (+)</option><option value="-">Tirar do saldo (−)</option></select></label>' : ''}
    <label>Quantidade<input name="qtd" type="number" step="any" min="0" inputmode="decimal" required></label>
    ${tipo === 'Saída' ? `<label>Frente de trabalho<select name="frente" required><option value="">Escolha…</option>${frentes.map(x => `<option>${esc(x.nome)}</option>`).join('')}</select></label>` : ''}
    <label>Observação${tipo === 'Ajuste' ? ' (motivo)' : ' <small>(opcional)</small>'}<input name="obs" ${tipo === 'Ajuste' ? 'required' : ''} placeholder="${tipo === 'Entrada' ? 'ex: sobra da obra X, doação…' : ''}"></label>`, {
    ok: 'Registrar',
    onOk: async f => { const r = await api('estoque_movimentar', { tipo, material_cod: f.mat.value, qtd: f.qtd.value, frente: f.frente?.value, sinal: f.sinal?.value, obs: f.obs.value }); toast(r.msg); vEstoque(); }
  });
  return f;
}

/* ---------- cadastros da obra ---------- */
const CAD = {
  materiais: {
    t: 'Materiais', perm: 'cad_materiais', ativo: 'ativo', lista: 'materiais',
    campos: [['descricao', 'Descrição', { req: 1 }], ['unidade', 'Unidade', { sel: 'unidades' }], ['categoria', 'Categoria'], ['estoque_min', 'Estoque mínimo', { type: 'number' }]],
    l1: m => m.descricao, l2: m => [m.codigo, m.unidade, m.categoria, m.estoque_min ? 'mín. ' + m.estoque_min : ''].filter(Boolean).join(' · ')
  },
  fornecedores: {
    t: 'Fornecedores', perm: 'cad_fornecedores', ativo: 'ativo', lista: 'fornecedores',
    campos: [['nome', 'Razão social / nome', { req: 1 }], ['cnpj', 'CNPJ / CPF'], ['contato', 'Contato'], ['telefone', 'Telefone / WhatsApp', { type: 'tel' }],
      ['email', 'E-mail (recebe as cotações)', { type: 'email' }], ['cidade', 'Cidade / UF'], ['materiais', 'Materiais que fornece'], ['condicao', 'Condição de pagamento'], ['obs', 'Observações']],
    l1: f => f.nome, l2: f => [f.codigo, f.cidade, f.telefone, f.email || 'sem e-mail', f.materiais].filter(Boolean).join(' · ')
  },
  frentes: {
    t: 'Frentes de trabalho', perm: 'cad_frentes', ativo: 'ativa', lista: 'frentes',
    campos: [['nome', 'Nome', { req: 1 }], ['descricao', 'Descrição']], l1: f => f.nome, l2: f => [f.codigo, f.descricao].filter(Boolean).join(' · ')
  }
};
async function vCad(tipo) {
  const C = CAD[tipo];
  if (!C) return (location.hash = '#/inicio');
  titulo(C.t);
  const pode = can(C.perm), itens = S.dados[C.lista];
  const inativos = itens.filter(x => !ativo(x, C.ativo)).length;
  const ICN = { materiais: 'tag', fornecedores: 'truck', frentes: 'grid' };
  const grupos = [{ t: 'Cadastros', itens: Object.keys(CAD).filter(k => k !== 'fornecedores' || can(['cad_fornecedores', ...P_COMPRAS, 'financeiro'])).map(k => ({ k: 'cad:' + k, t: CAD[k].t, i: ICN[k], n: S.dados[CAD[k].lista].filter(x => ativo(x, CAD[k].ativo)).length, on: k === tipo })) },
    { t: 'Mostrar', itens: [{ k: 'ativos', t: 'Ativos', i: 'check', on: !VER_INAT }, { k: 'inativos', t: 'Desativados', i: 'eye', n: inativos, on: VER_INAT }] }];
  if (pode) grupos.push({ t: 'Ações', itens: [{ k: 'novo', t: 'Novo cadastro', i: 'plus', cl: 'acao' }] });
  view(comEtapas(grupos, `<div class="cab"><h2>${C.t}</h2><span class="contagem">${esc(S.dados.obra.nome)}</span></div>
    <div class="busca">${ic('search')}<input type="search" id="busca" placeholder="Buscar…"></div>
    <div class="card" style="padding:4px 14px" id="lst"></div>`));
  ligarEtapas(k => {
    if (k === 'novo') return mCad(tipo);
    if (k.startsWith('cad:')) { location.hash = '#/cad/' + k.slice(4); return; }
    VER_INAT = k === 'inativos'; vCad(tipo);
  });
  const desenhar = () => {
    const t = norm($('#busca').value), inat = VER_INAT;
    const l = itens.filter(x => (inat ? !ativo(x, C.ativo) : ativo(x, C.ativo)) && (!t || norm(C.l1(x) + ' ' + C.l2(x)).includes(t))).sort((a, b) => String(C.l1(a)).localeCompare(String(C.l1(b))));
    $('#lst').innerHTML = l.map(x => `<div class="arq ${pode ? 'click' : ''}" data-c="${esc(x.codigo)}" style="${pode ? 'cursor:pointer' : ''}"><span class="nome"><b>${esc(C.l1(x))}</b>${ativo(x, C.ativo) ? '' : ' <span class="badge b-canc">desativado</span>'}<br><small>${esc(C.l2(x))}</small></span>
      ${tipo === 'fornecedores' && x.telefone ? `<a class="btn sec peq" href="${wa(x.telefone, 'Olá! Aqui é da Size Engenharia.')}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div>`).join('') || '<p class="vazio">Nenhum cadastro.</p>';
    if (pode) $$('#lst [data-c]').forEach(el => { el.onclick = e => { if (!e.target.closest('a')) mCad(tipo, itens.find(x => x.codigo === el.dataset.c)); }; });
  };
  $('#busca').oninput = desenhar;
  desenhar();
}
let VER_INAT = false;
function mCad(tipo, o) {
  const C = CAD[tipo];
  const campo = ([k, t, op = {}]) => op.sel
    ? `<label>${t}<select name="${k}"><option value="">—</option>${[...new Set([...(S.dados[op.sel] || []), o?.[k]].filter(Boolean))].map(u => `<option ${o && o[k] === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>`
    : `<label>${t}<input name="${k}" type="${op.type || 'text'}" ${op.type === 'number' ? 'step="any" inputmode="decimal"' : ''} value="${esc(o?.[k] ?? '')}" ${op.req ? 'required' : ''}></label>`;
  modal((o ? 'Editar ' : 'Novo ') + C.t.toLowerCase().replace(/s$/, '').replace(/frentes de trabalho/, 'frente'), `${C.campos.map(campo).join('')}
    ${o ? `<label class="ck"><input type="checkbox" name="ativo" ${ativo(o, C.ativo) ? 'checked' : ''}> Ativo</label>` : ''}`, {
    ok: 'Salvar',
    onOk: async f => {
      const dados = { codigo: o?.codigo };
      C.campos.forEach(([k]) => { dados[k] = f[k].value; });
      if (o) dados[C.ativo] = f.ativo.checked ? 'Sim' : 'Não';
      const r = await api('cad_salvar', { tipo, dados });
      toast(r.msg);
      await recarregarDados();
      vCad(tipo);
    }
  });
}

/* ---------- minha conta ---------- */
async function vConta() {
  titulo('Minha conta');
  const u = S.sess.usuario;
  view(`<div class="card"><dl class="kv"><dt>Nome</dt><dd>${esc(u.nome)}</dd><dt>Usuário</dt><dd>${esc(u.login)}</dd>${u.email ? `<dt>E-mail</dt><dd>${esc(u.email)}</dd>` : ''}
    <dt>Obra atual</dt><dd>${esc(obraAtual()?.nome || '—')}</dd><dt>Permissões</dt><dd>${u.admin ? 'Administrador (tudo)' : (S.dados?.permissoes || []).map(p => esc(S.sess.permissoes[p] || p)).join(' · ') || '—'}</dd></dl></div>
    <form class="card grid" id="f"><h3>Trocar senha</h3><label>Senha atual<input name="atual" type="password" autocomplete="current-password" required></label>
    <label>Nova senha (mín. 6)<input name="nova" type="password" minlength="6" autocomplete="new-password" required></label><button class="btn">Salvar nova senha</button></form>
    <button class="btn perigo full" id="sair2">${ic('logout')} Sair</button>`);
  $('#sair2').onclick = () => sair();
  $('#f').onsubmit = async e => {
    e.preventDefault();
    try { toast((await api('trocarSenha', { atual: e.target.atual.value, nova: e.target.nova.value })).msg); e.target.reset(); } catch (x) { toast(x.message, 1); }
  };
}

/* =====================================================================
 * ADMINISTRAÇÃO
 * ===================================================================== */
async function adm(forcar) { if (!S.adm || forcar) S.adm = await api('admin_dados'); return S.adm; }
async function recarregarSessao() { S.sess = Object.assign(S.sess, await api('sessao')); montarMenu(); }

async function vUsuarios() {
  titulo('Usuários e acessos');
  const A = await adm(true);
  const resumo = u => sim(u.admin) ? 'Administrador' : A.acessos.filter(a => a.usuario_id === u.id).map(a => `${A.obras.find(o => o.id === a.obra_id)?.sigla || a.obra}: ${a.perfil}`).join(' · ') || 'sem acesso';
  view(`<div class="cab"><h2>${plural(A.usuarios.length, 'usuário', 'usuários')}</h2><button class="btn" id="novo">${ic('plus')} Novo usuário</button></div>
    <div class="busca">${ic('search')}<input type="search" id="busca" placeholder="Buscar…"></div>
    <div class="card" style="padding:4px 14px" id="lst"></div>`);
  const desenhar = () => {
    const t = norm($('#busca').value);
    $('#lst').innerHTML = A.usuarios.filter(u => !t || norm(u.nome + ' ' + u.login + ' ' + u.email).includes(t)).sort((a, b) => a.nome.localeCompare(b.nome))
      .map(u => `<div class="arq" data-u="${esc(u.id)}" style="cursor:pointer"><span class="nome"><b>${esc(u.nome)}</b> <small>@${esc(u.login)}</small>${sim(u.ativo) ? '' : ' <span class="badge b-canc">inativo</span>'}<br><small>${esc(resumo(u))}</small></span><small>${u.ultimo_acesso ? fd(u.ultimo_acesso) : 'nunca entrou'}</small></div>`).join('');
    $$('#lst [data-u]').forEach(el => { el.onclick = () => mUsuario(A.usuarios.find(u => u.id === el.dataset.u)); });
  };
  $('#busca').oninput = desenhar;
  desenhar();
  $('#novo').onclick = () => mUsuario();
}
const sim = v => v === true || /^(sim|s|true|1)$/i.test(String(v));

function mUsuario(u) {
  const A = S.adm, perfis = A.perfis, P = A.permissoes;
  const ac = id => A.acessos.find(a => a.usuario_id === u?.id && a.obra_id === id);
  const perfilDe = lista => (perfis.find(p => p.permissoes.length === lista.length && p.permissoes.every(x => lista.includes(x))) || {}).perfil || (lista.length ? 'Personalizado' : '');
  const f = modal(u ? 'Editar usuário' : 'Novo usuário', `
    <div class="g2"><label>Nome<input name="nome" required value="${esc(u?.nome || '')}"></label>
      <label>Usuário (login)<input name="login" required autocapitalize="none" autocorrect="off" value="${esc(u?.login || '')}" placeholder="ex: joao.silva"></label>
      <label>E-mail<input name="email" type="email" value="${esc(u?.email || '')}"></label><label>Telefone<input name="telefone" type="tel" value="${esc(u?.telefone || '')}"></label></div>
    ${u ? '' : `<label>Senha provisória (mín. 6)<input name="senha" required minlength="6" autocomplete="new-password" value="${senhaAleatoria()}"></label><small>Já sugerimos uma senha. A pessoa cria a dela no primeiro acesso. Depois de salvar, aparece o convite para enviar por WhatsApp ou e-mail.</small>`}
    <label class="ck"><input type="checkbox" name="ativo" ${!u || sim(u.ativo) ? 'checked' : ''}> Ativo</label>
    <label class="ck"><input type="checkbox" name="admin" ${u && sim(u.admin) ? 'checked' : ''}> Administrador (acesso total a todas as obras e à administração)</label>
    <div id="acessos"><h3>Acesso por obra</h3>${A.obras.map(o => {
      const a = ac(o.id), lista = a ? a.permissoes : [];
      return `<div class="acesso" data-obra="${esc(o.id)}"><div class="topo2"><b>${esc(o.nome)} <small>${esc(o.sigla)}</small></b>
        <select class="perfil"><option value="">Sem acesso</option>${perfis.map(p => `<option ${a && a.perfil === p.perfil ? 'selected' : ''}>${esc(p.perfil)}</option>`).join('')}<option ${a && !perfis.some(p => p.perfil === a.perfil) ? 'selected' : ''}>Personalizado</option></select></div>
        <details ${a ? '' : ''}><summary>Ajustar permissões</summary><div class="perms">${Object.entries(P).map(([k, t]) => `<label class="ck"><input type="checkbox" value="${k}" ${lista.includes(k) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div></details></div>`;
    }).join('') || '<small>Nenhuma obra criada ainda.</small>'}</div>
    ${u ? '<button type="button" class="btn sec" id="senha">Definir senha provisória</button>' : ''}`, {
    larga: true, ok: 'Salvar',
    onOk: async f => {
      const acessos = $$('.acesso', f).map(el => ({ obra_id: el.dataset.obra, perfil: $('.perfil', el).value, permissoes: $$('.perms input:checked', el).map(x => x.value) })).filter(a => a.permissoes.length);
      const r = await api('admin_usuario_salvar', { usuario: { id: u?.id, nome: f.nome.value, login: f.login.value, email: f.email.value, telefone: f.telefone.value, admin: f.admin.checked, ativo: f.ativo.checked }, senha: f.senha?.value, acessos });
      toast(r.msg);
      if (u && u.id === S.sess.usuario.id) await recarregarSessao();
      await vUsuarios();
      if (!u) setTimeout(() => convite({ nome: f.nome.value, login: f.login.value.trim().toLowerCase(), email: f.email.value, telefone: f.telefone.value }, f.senha.value), 50);
    }
  });
  const sync = () => { $('#acessos', f).style.opacity = f.admin.checked ? .45 : 1; };
  f.admin.onchange = sync; sync();
  $$('.acesso', f).forEach(el => {
    const sel = $('.perfil', el), cks = $$('.perms input', el);
    sel.onchange = () => {
      if (sel.value === 'Personalizado') { $('details', el).open = true; return; }
      const p = perfis.find(x => x.perfil === sel.value);
      cks.forEach(c => { c.checked = !!p && p.permissoes.includes(c.value); });
    };
    cks.forEach(c => { c.onchange = () => { sel.value = perfilDe(cks.filter(x => x.checked).map(x => x.value)); }; });
  });
  if (u) $('#senha').onclick = () => modal('Nova senha provisória', `<p>Para <b>${esc(u.nome)}</b> (@${esc(u.login)}). A pessoa cria a própria senha no próximo acesso.</p>
    <label>Senha provisória (mín. 6)<input name="senha" required minlength="6" value="${senhaAleatoria()}"></label>`, {
    ok: 'Definir e gerar convite',
    onOk: async f2 => { toast((await api('admin_senha', { usuario_id: u.id, senha: f2.senha.value })).msg); setTimeout(() => convite(u, f2.senha.value), 50); }
  });
}

/* convite de acesso: link do app + usuário + senha provisória, pronto para WhatsApp ou e-mail */
function senhaAleatoria() {
  const c = 'abcdefghjkmnpqrstuvwxyz23456789', a = new Uint32Array(8);
  crypto.getRandomValues(a);
  return 'Size' + [...a].map(x => c[x % c.length]).join('').slice(0, 6);
}
function convite(u, senha) {
  const url = location.origin + location.pathname;
  const txt = `Olá, ${u.nome.split(' ')[0]}! Seu acesso ao app da Size Engenharia está pronto.\n\nEndereço: ${url}\nUsuário: ${u.login}\nSenha provisória: ${senha}\n\nNo primeiro acesso você cria a sua senha. Para instalar no celular ou no computador, toque em "Instalar o app" na tela de entrada.`;
  const tel = String(u.telefone || '').replace(/\D/g, '');
  modal('Enviar acesso', `<div class="aviso ok">Acesso de <b>${esc(u.nome)}</b> pronto. Envie o convite:</div>
    <pre class="convite">${esc(txt)}</pre>
    <div class="acoes">
      <a class="btn" href="${tel ? wa(tel, txt) : 'https://wa.me/?text=' + enc(txt)}" target="_blank" rel="noopener">WhatsApp${tel ? '' : ' (escolher contato)'}</a>
      <a class="btn sec" href="mailto:${esc(u.email || '')}?subject=${enc('Seu acesso ao app da Size Engenharia')}&body=${enc(txt)}">E-mail</a>
      <button type="button" class="btn sec" id="copiaConv">Copiar</button></div>
    <small>A senha provisória só aparece aqui. Se perder, defina outra em Usuários e acessos.</small>`, { semRodape: true });
  $('#copiaConv').onclick = async () => { try { await navigator.clipboard.writeText(txt); toast('Convite copiado.'); } catch (e) { prompt('Copie o convite:', txt); } };
}

async function vObras() {
  titulo('Obras');
  const A = await adm(true);
  view(`<div class="cab"><h2>${plural(A.obras.length, 'obra', 'obras')}</h2><button class="btn" id="nova">${ic('plus')} Nova obra</button></div>
    <div class="card" style="padding:4px 14px">${A.obras.map(o => `<div class="arq"><span class="nome"><b>${esc(o.nome)}</b> <span class="tipo">${esc(o.sigla)}</span>${sim(o.ativa) ? '' : ' <span class="badge b-canc">desativada</span>'}<br>
      <small>${esc(o.endereco || 'sem endereço')} · criada ${fd(o.criada_em)}${o.email_financeiro ? ' · financeiro: ' + esc(o.email_financeiro) : ''}</small><br><small><a href="${esc(o.planilha_url)}" target="_blank" rel="noopener">Planilha</a> · <a href="${esc(o.pasta_url)}" target="_blank" rel="noopener">Pasta no Drive</a></small></span>
      <button class="btn sec peq" data-o="${esc(o.id)}">Editar</button></div>`).join('') || '<p class="vazio">Nenhuma obra. Crie a primeira.</p>'}</div>
    <p><small>Planilha central: <a href="${esc(A.central_url)}" target="_blank" rel="noopener">Size · Cadastros</a></small></p>`);
  $('#nova').onclick = () => modal('Nova obra', `<label>Nome da obra<input name="nome" required placeholder="ex: Residencial Prime Beach"></label>
    <label>Sigla (2 a 5 letras)<input name="sigla" required maxlength="5" style="text-transform:uppercase" placeholder="ex: PB"></label><small>Os pedidos da obra ficam numerados com a sigla: PB-0001, PB-0002…</small>
    <label>Endereço (vai nos e-mails aos fornecedores)<input name="endereco"></label>
    <label>E-mail do financeiro desta obra <small>(opcional — recebe os avisos de pagamento)</small><input name="email_financeiro" placeholder="financeiro@…"></label>
    <div class="aviso info">Cria a planilha da obra (pedidos, fornecedores, materiais, estoque, frentes) já com os ${A.padrao.length} materiais padrão e as frentes padrão. Leva uns segundos.</div>`, {
    ok: 'Criar obra',
    onOk: async f => {
      const r = await api('admin_obra_criar', { nome: f.nome.value, sigla: f.sigla.value, endereco: f.endereco.value, email_financeiro: f.email_financeiro.value });
      toast(r.msg);
      await recarregarSessao();
      if (!S.obraId) { await trocarObra(r.id); location.hash = '#/admin/obras'; } else vObras();
    }
  });
  $$('[data-o]').forEach(b => {
    b.onclick = () => {
      const o = A.obras.find(x => x.id === b.dataset.o);
      modal('Editar obra', `<label>Nome<input name="nome" required value="${esc(o.nome)}"></label><label>Endereço<input name="endereco" value="${esc(o.endereco || '')}"></label>
        <label>E-mail do financeiro desta obra <small>(se vazio, usa o geral das Configurações)</small><input name="email_financeiro" value="${esc(o.email_financeiro || '')}" placeholder="financeiro@…"></label>
        <small>Quem tem o perfil Financeiro nesta obra (em Usuários e acessos) também recebe os avisos no e-mail do cadastro dele e as notificações no app.</small>
        <label class="ck"><input type="checkbox" name="ativa" ${sim(o.ativa) ? 'checked' : ''}> Obra ativa (desativada some para quem não é admin)</label>`, {
        ok: 'Salvar', onOk: async f => { toast((await api('admin_obra_salvar', { id: o.id, nome: f.nome.value, endereco: f.endereco.value, email_financeiro: f.email_financeiro.value, ativa: f.ativa.checked })).msg); await recarregarSessao(); vObras(); }
      });
    };
  });
}

async function vConfig() {
  titulo('Configurações');
  const A = await adm(true), c = k => (A.config.find(x => x.chave === k) || {}).valor ?? '';
  view(`<form class="card grid" id="fc"><h3>Regras e e-mails</h3>
      <div class="g2"><label>Mínimo de orçamentos<input name="MIN_ORCAMENTOS" type="number" min="1" value="${esc(c('MIN_ORCAMENTOS'))}"></label>
      <label>Prazo padrão do faturado (dias)<input name="PRAZO_FATURADO_PADRAO" type="number" min="0" value="${esc(c('PRAZO_FATURADO_PADRAO'))}"></label></div>
      <label>Faixas por valor <small>(valor:mínimo; ex: 5000:2; 20000:3)</small><input name="REGRAS_ORCAMENTO" value="${esc(c('REGRAS_ORCAMENTO'))}"></label>
      <label>E-mail do financeiro <small>(avisos de pagamento)</small><input name="EMAIL_FINANCEIRO" value="${esc(c('EMAIL_FINANCEIRO'))}"></label>
      <label>Endereço do app <small>(para links nos e-mails)</small><input name="APP_URL" value="${esc(c('APP_URL') || location.origin + location.pathname)}"></label>
      <label>Nome da empresa<input name="EMPRESA" value="${esc(c('EMPRESA'))}"></label>
      <label>Frentes padrão das obras novas <small>(separe com ;)</small><textarea name="FRENTES_PADRAO">${esc(c('FRENTES_PADRAO'))}</textarea></label>
      <label>Unidades <small>(separe com vírgula)</small><textarea name="unidades">${esc(A.unidades.join(', '))}</textarea></label>
      <button class="btn">Salvar configurações</button></form>
    <div class="card"><div class="cab"><h3 style="flex:1;margin:0">Materiais padrão (${A.padrao.length})</h3><button class="btn sec peq" id="novoMat">${ic('plus')} Adicionar</button></div>
      <small>Toda obra nova já nasce com estes materiais.</small>
      <div class="busca" style="margin-top:10px">${ic('search')}<input type="search" id="bm" placeholder="Buscar…"></div><div id="lm"></div></div>
    <div class="card"><h3>Perfis de acesso</h3><small>Modelos usados ao liberar acesso. Mudar um perfil não altera quem já tem acesso.</small><div id="perfis"></div></div>`);
  $('#fc').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, config = {};
    ['MIN_ORCAMENTOS', 'PRAZO_FATURADO_PADRAO', 'REGRAS_ORCAMENTO', 'EMAIL_FINANCEIRO', 'APP_URL', 'EMPRESA', 'FRENTES_PADRAO'].forEach(k => { config[k] = f[k].value; });
    try { toast((await api('admin_config_salvar', { config, unidades: f.unidades.value.split(',').map(s => s.trim()).filter(Boolean) })).msg); if (S.obraId) await recarregarDados(); } catch (x) { toast(x.message, 1); }
  };
  const lm = () => {
    const t = norm($('#bm').value);
    $('#lm').innerHTML = A.padrao.filter(m => !t || norm(m.descricao + ' ' + m.categoria).includes(t)).sort((a, b) => a.descricao.localeCompare(b.descricao))
      .map(m => `<div class="arq"><span class="nome">${esc(m.descricao)}<br><small>${esc([m.codigo, m.unidade, m.categoria].filter(Boolean).join(' · '))}</small></span><button class="btn sec peq" data-pm="${esc(m.codigo)}">Editar</button></div>`).join('') || '<p class="vazio">Nenhum material padrão.</p>';
    $$('[data-pm]').forEach(b => { b.onclick = () => mPadrao(A.padrao.find(m => m.codigo === b.dataset.pm)); });
  };
  $('#bm').oninput = lm;
  lm();
  $('#novoMat').onclick = () => mPadrao();
  $('#perfis').innerHTML = A.perfis.map((p, i) => `<details class="acesso"><summary><b>${esc(p.perfil)}</b> <small>${esc(p.descricao || '')}</small></summary>
    <div class="perms">${Object.entries(A.permissoes).map(([k, t]) => `<label class="ck"><input type="checkbox" value="${k}" ${p.permissoes.includes(k) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div>
    <button class="btn sec peq" data-pf="${i}" style="margin-top:10px">Salvar perfil</button></details>`).join('');
  $$('[data-pf]').forEach(b => {
    b.onclick = async () => {
      const p = A.perfis[+b.dataset.pf], box = b.closest('details');
      try { toast((await api('admin_perfil_salvar', { perfil: p.perfil, descricao: p.descricao, permissoes: $$('input:checked', box).map(x => x.value) })).msg); } catch (x) { toast(x.message, 1); }
    };
  });
}
function mPadrao(m) {
  const A = S.adm;
  modal(m ? 'Material padrão' : 'Novo material padrão', `<label>Descrição<input name="descricao" required value="${esc(m?.descricao || '')}"></label>
    <div class="g2"><label>Unidade<select name="unidade"><option value="">—</option>${A.unidades.map(u => `<option ${m && m.unidade === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
    <label>Categoria<input name="categoria" value="${esc(m?.categoria || '')}" placeholder="ex: Elétrica, Hidráulica, Estrutura"></label></div>
    ${m ? '<button type="button" class="btn perigo" id="exc">Remover da lista padrão</button>' : ''}`, {
    ok: 'Salvar', onOk: async f => { toast((await api('admin_padrao_salvar', { codigo: m?.codigo, descricao: f.descricao.value, unidade: f.unidade.value, categoria: f.categoria.value })).msg); vConfig(); }
  });
  if (m) $('#exc').onclick = async () => { if (!confirm('Remover ' + m.descricao + ' da lista padrão? (Obras já criadas não mudam.)')) return; try { toast((await api('admin_padrao_excluir', { codigo: m.codigo })).msg); fecharModal(); vConfig(); } catch (e) { toast(e.message, 1); } };
}

boot();
