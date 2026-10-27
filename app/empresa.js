'use strict';
/* =====================================================================
 * INÍCIO DA EMPRESA (fora de obra), no estilo da tela inicial do RDObras: saudação, ações rápidas,
 * as obras (mapa + cartões; tocar = entrar na obra) e, para quem tem o módulo Orçamentos,
 * os orçamentos de clientes e a base de preços. Dentro da obra, o menu lateral mostra só o que é da obra.
 * Usa app.js (api, view, trocarObra, NOTIF…) e o visual do módulo Orçamentos (base.js / style.css).
 * ===================================================================== */
const EMP = { d: null, mapa: null };
const EMP_LEAFLET = ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'];
const empSaudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const empPend = id => (NOTIF.itens || []).filter(i => i.obra === id && !['meu', 'pago'].includes(i.etapa)).length;

async function vEmpresa() {
  titulo('Início');
  const nome = esc(S.sess.usuario.nome.split(' ')[0]), dataTxt = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase());
  let D;
  try { D = EMP.d = await api('empresa_dados'); }
  catch (e) {
    if (!e.rede) throw e;
    // sem sinal: só as obras da sessão guardada
    D = EMP.d = { obras: S.sess.obras.map(o => ({ id: o.id, sigla: o.sigla, nome: o.nome, ativa: o.ativa })), nivel: '', admin: admin(), offline: true };
  }
  const gere = D.nivel === 'Gerir', P = D.propostas || [];
  const ativas = D.obras.filter(o => o.ativa), inativas = D.obras.filter(o => !o.ativa);
  const aguardando = P.filter(p => p.status === 'Enviado'), rascunhos = P.filter(p => p.status === 'Rascunho');
  const resumo = [plural(ativas.length, 'obra ativa', 'obras ativas'), D.nivel && aguardando.length ? plural(aguardando.length, 'orçamento aguardando o cliente', 'orçamentos aguardando o cliente') : '',
    D.nivel && rascunhos.length ? plural(rascunhos.length, 'orçamento em elaboração', 'orçamentos em elaboração') : ''].filter(Boolean).join(' · ');
  const acoes = [
    gere && ['#/orc/orcamento/novo', 'plus', 'Novo orçamento', 'principal'],
    D.nivel && ['#/orc/orcamentos', 'file', 'Orçamentos'],
    gere && ['#/orc/composicao/nova', 'layers', 'Nova composição'],
    gere && ['ins', 'box', 'Novo insumo'],
    gere && ['#/orc/importar', 'upload', 'Importar do RDObras'],
    D.admin && ['#/admin/obras', 'building', 'Nova obra'],
    D.admin && ['#/admin/usuarios', 'users', 'Usuários e acessos']
  ].filter(Boolean);
  view(`<div class="emp">
    <div class="bp-hero emp-hero"><div class="bp-hero-t"><span class="bp-selo">${ic('home')} ${esc(D.empresa || 'Size Engenharia')}</span><h2>${empSaudacao()}, ${nome}!</h2><p>${esc(resumo || 'Bem-vindo ao sistema de gestão.')}</p></div>
      <div class="emp-data"><small>${esc(dataTxt)}</small></div></div>
    ${D.offline ? '<div class="aviso warn">Sem sinal: mostrando só a lista de obras guardada no aparelho.</div>' : ''}
    ${acoes.length ? `<div class="card emp-acoes"><div class="bp-h"><h3>${ic('send')} Ações rápidas</h3></div><div class="emp-ac">${acoes.map(([h, i, t, cl]) => h === 'ins'
      ? `<button type="button" class="emp-a ${cl || ''}" id="empIns">${ic(i)}<span>${t}</span></button>` : `<a class="emp-a ${cl || ''}" href="${h}">${ic(i)}<span>${t}</span></a>`).join('')}</div></div>` : ''}
    <div class="card"><div class="bp-h"><h3>${ic('building')} Obras <small>toque para entrar</small></h3>${D.admin ? `<a class="linkbtn" href="#/admin/obras">Gerenciar obras</a>` : ''}</div>
      ${ativas.some(o => o.lat !== '' && o.lat != null && o.lng !== '' && o.lng != null) ? '<div class="emp-mapa" id="empMapa"></div>' : ''}
      <div class="emp-obras">${ativas.map(empCartao).join('') || '<p class="vazio">Nenhuma obra liberada para você.</p>'}</div>
      ${inativas.length ? `<details class="emp-inat"><summary>${plural(inativas.length, 'obra desativada', 'obras desativadas')}</summary><div class="emp-obras">${inativas.map(empCartao).join('')}</div></details>` : ''}</div>
    ${D.nivel ? empOrcamentos(P) + empBase(D.base) : ''}
  </div>`);
  $$('[data-entrar]').forEach(b => { b.onclick = () => empEntrar(b.dataset.entrar); });
  if ($('#empIns')) $('#empIns').onclick = async () => { try { await bpCarregar(); bpInsumoModal(); } catch (e) { toast(e.message, 1); } };
  if ($('#empMapa')) empMapa(ativas).catch(() => { const m = $('#empMapa'); if (m) m.remove(); });
}
function empCartao(o) {
  const pend = empPend(o.id), diario = o.ultimo_diario ? fd(o.ultimo_diario) : '';
  return `<button type="button" class="emp-obra ${o.ativa ? '' : 'inativa'} ${o.id === S.obraId ? 'aberta' : ''}" data-entrar="${esc(o.id)}">
    <span class="emp-sig">${esc(o.sigla || o.nome.slice(0, 2))}</span>
    <span class="emp-ob-t"><b>${esc(o.nome)}</b><small>${esc(o.endereco || (o.lat !== '' && o.lat != null ? '' : 'sem endereço'))}</small></span>
    ${o.id === S.obraId ? '<span class="badge b-rec">aberta</span>' : ''}
    <span class="emp-ob-k">${o.ativa === false ? '<span>desativada</span>' : `
      ${pend ? `<span class="quente">${ic('bell')} ${plural(pend, 'pendência', 'pendências')}</span>` : ''}
      ${o.pedidos_andamento != null ? `<span>${ic('cart')} ${plural(o.pedidos_andamento, 'pedido', 'pedidos')}${o.pedidos_urgentes ? ` · <b class="atrasado">${o.pedidos_urgentes} urgente${o.pedidos_urgentes > 1 ? 's' : ''}</b>` : ''}</span>` : ''}
      ${o.frentes_exec ? `<span>${ic('book')} ${plural(o.frentes_exec, 'frente', 'frentes')}</span>` : ''}
      ${diario ? `<span>${ic('clock')} diário ${diario}</span>` : ''}`}</span>
    <span class="emp-entrar">${ic('chevron')}</span></button>`;
}
/* as notificações chegam depois da tela: redesenha os cartões das obras com as pendências */
function empAtualizarPend() {
  if (!EMP.d || !$('.emp-obras')) return;
  $$('.emp-obra[data-entrar]').forEach(b => {
    const o = EMP.d.obras.find(x => x.id === b.dataset.entrar);
    if (!o) return;
    const t = document.createElement('div');
    t.innerHTML = empCartao(o);
    const n = t.firstElementChild;
    n.onclick = () => empEntrar(o.id);
    b.replaceWith(n);
  });
}
async function empEntrar(id) {
  if (id === S.obraId && S.dados) { location.hash = '#/painel'; return; }
  await trocarObra(id);
}
/* mapa das obras (Leaflet + OpenStreetMap, como o do RDObras); carregado só quando precisa */
async function empMapa(obras) {
  if (!window.L) {
    await new Promise((ok, no) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = EMP_LEAFLET[0]; l.onload = ok; l.onerror = no; document.head.appendChild(l); });
    await new Promise((ok, no) => { const s = document.createElement('script'); s.src = EMP_LEAFLET[1]; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  }
  const el = $('#empMapa');
  if (!el) return;
  const com = obras.filter(o => o.lat !== '' && o.lat != null && o.lng !== '' && o.lng != null);
  const m = L.map(el, { scrollWheelZoom: false, attributionControl: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  const pts = com.map(o => {
    const pend = empPend(o.id);
    const mk = L.marker([o.lat, o.lng], { icon: L.divIcon({ className: '', html: `<span class="emp-pin ${pend ? 'quente' : ''}"><i>${esc(o.sigla || '•')}</i></span>`, iconSize: [40, 40], iconAnchor: [20, 38] }) }).addTo(m);
    mk.bindPopup(`<div class="emp-pop"><b>${esc(o.nome)}</b><small>${esc(o.endereco || '')}</small>${pend ? `<small class="atrasado">${plural(pend, 'pendência', 'pendências')}</small>` : ''}<button type="button" class="btn peq" data-pop="${esc(o.id)}">Entrar na obra</button></div>`);
    mk.on('popupopen', () => { const b = document.querySelector(`[data-pop="${CSS.escape(o.id)}"]`); if (b) b.onclick = () => empEntrar(o.id); });
    return [o.lat, o.lng];
  });
  if (pts.length === 1) m.setView(pts[0], 13); else m.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
  EMP.mapa = m;
}
const EMP_ST = { Rascunho: 'b-aberto', Enviado: 'b-apr', Aprovado: 'b-ok', Perdido: 'b-canc', Cancelado: 'b-canc', Revisado: '' };
function empOrcamentos(P) {
  const vivos = P.filter(p => p.status !== 'Revisado'), soma = l => l.reduce((s, p) => s + (p.total ? p.total.preco : 0), 0);
  const ano = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const r = vivos.filter(p => p.status === 'Rascunho'), e = vivos.filter(p => p.status === 'Enviado'), a = vivos.filter(p => p.status === 'Aprovado' && String(p.decidido_em || p.atualizado_em) >= ano), pe = vivos.filter(p => p.status === 'Perdido' && String(p.decidido_em || p.atualizado_em) >= ano);
  const conv = a.length + pe.length ? Math.round(a.length / (a.length + pe.length) * 100) + '%' : '—';
  return `<div class="card"><div class="bp-h"><h3>${ic('file')} Orçamentos de clientes</h3><a class="linkbtn" href="#/orc/orcamentos">Ver todos</a></div>
    <div class="bp-tiles emp-tiles">
      <a class="bp-tile" href="#/orc/orcamentos?s=Rascunho"><b>${r.length}</b><span>em elaboração</span><small>${brl(soma(r))}</small></a>
      <a class="bp-tile atu" href="#/orc/orcamentos?s=Enviado"><b>${e.length}</b><span>aguardando o cliente</span><small>${brl(soma(e))}</small></a>
      <a class="bp-tile ok" href="#/orc/orcamentos?s=Aprovado"><b>${a.length}</b><span>aprovados em 12 meses</span><small>${brl(soma(a))}</small></a>
      <div class="bp-tile"><b>${conv}</b><span>taxa de aprovação</span><small>${a.length} aprovados × ${pe.length} perdidos em 12 meses</small></div></div>
    ${vivos.length ? `<div class="emp-props">${vivos.slice(0, 6).map(p => `<a class="bp-linha" href="#/orc/orcamento/${enc(p.id)}"><span><b>${esc(p.empreendimento)}</b><small><code>${esc(p.rotulo)}</code> · ${esc(p.cliente)} · ${fdh(p.atualizado_em)}</small></span><span class="badge ${EMP_ST[p.status] || ''}">${esc(p.status)}</span><span class="bp-mono">${brl(p.total ? p.total.preco : 0)}</span></a>`).join('')}</div>`
      : `<p class="vazio">Nenhum orçamento ainda.${D_GERE() ? ` <a href="#/orc/orcamento/novo">Fazer o primeiro</a>` : ''}</p>`}</div>`;
}
const D_GERE = () => baseNivel() === 'Gerir';
function empBase(B) {
  if (!B) return '';
  return `<div class="card"><div class="bp-h"><h3>${ic('layers')} Base de preços</h3><a class="linkbtn" href="#/orc">Abrir</a></div>
    <div class="bp-tiles emp-tiles"><a class="bp-tile" href="#/orc/composicoes"><b>${B.composicoes}</b><span>composições</span></a><a class="bp-tile" href="#/orc/insumos"><b>${B.insumos}</b><span>insumos</span></a>
      <a class="bp-tile ${B.velhos ? 'warn' : ''}" href="#/orc/insumos?f=velhos"><b>${B.velhos}</b><span>preços com mais de 6 meses</span></a></div></div>`;
}

ROTAS.push([/^#?\/?(inicio)?$/, vEmpresa]);
