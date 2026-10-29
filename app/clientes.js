/* Administração do portal do cliente: cadastro (obra, modelo Gestão/Global ou módulos um a um, cor), logins de cada cliente
 * e publicação do endereço próprio (c/<slug>/) com o ícone e o nome do empreendimento. Os ícones são recortados aqui no
 * navegador (canvas) a partir da imagem escolhida e enviados ao servidor, que publica no GitHub Pages. */
const CL = { d: null, img: null };
const CL_CORES = ['#1D6F5F', '#2B4C7E', '#8A5A2B', '#5B3E8C', '#9C2F3E', '#2E3440', '#0F6E8C', '#6B7A1F'];
const clSlug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

async function vClientes() {
  titulo('Portal do cliente');
  const A = CL.d = await api('cli_admin');
  view(`<div class="card"><div class="bp-h"><h3>${ic('eye')} Portal do cliente</h3><a class="btn" href="#/admin/cliente/novo">${ic('plus')} Novo cliente</a></div>
      <p class="mute" style="margin:0">Cada cliente acompanha uma obra pelo app com o nome, o ícone e a cor do empreendimento. Ele só vê o que você liberar e nunca custos, compras ou dados internos.</p></div>
    ${A.github ? '' : `<form class="card grid" id="clGh"><h3>${ic('download')} Publicação do endereço do cliente</h3>
      <p class="mute" style="margin:0">Para o sistema publicar o endereço próprio de cada cliente, ele precisa de uma chave do GitHub com permissão de escrita no repositório do app. Faça isso uma vez só:
      no GitHub, Settings → Developer settings → Fine-grained tokens → Generate new token, repositório <b>renancod/size</b>, permissão <b>Contents: Read and write</b>. Cole a chave abaixo: ela fica guardada só no servidor.</p>
      <div class="g2"><label>Chave (token)<input name="chave" type="password" autocomplete="off" required></label><label>Repositório<input name="repo" value="renancod/size" required></label></div>
      <button class="btn">Guardar chave</button></form>`}
    <div class="cl-lista">${A.clientes.map(c => `<a class="card cl-item" href="#/admin/cliente/${enc(c.id)}" style="text-decoration:none;color:inherit">
      <span class="cl-cor" style="background:${esc(c.cor)}">${ic('building')}</span>
      <span><b>${esc(c.nome)}</b> ${c.ativo ? '' : '<span class="bp-flag">desativado</span>'}<br><small>${esc(c.obra_nome)} · ${c.modelo === 'gestao' ? 'Gestão' : c.modelo === 'global' ? 'Global' : 'Personalizado'} · ${c.usuarios.length} ${c.usuarios.length === 1 ? 'acesso' : 'acessos'}${c.url ? ' · publicado' : ' · endereço não publicado'}</small></span>
      ${ic('chevron')}</a>`).join('') || '<div class="card vazio"><p>Nenhum cliente ainda.</p></div>'}</div>`);
  if ($('#clGh')) $('#clGh').onsubmit = async e => {
    e.preventDefault();
    // "chave", nunca "token": token é o login do app na chamada (sobrescrever derrubava a sessão)
    try { toast((await api('cli_github', { chave: e.target.chave.value, repo: e.target.repo.value })).msg); vClientes(); } catch (x) { toast(x.message, 1); }
  };
}

async function vCliente(id) {
  const A = CL.d && CL.d.clientes ? CL.d : (CL.d = await api('cli_admin'));
  const novo = id === 'novo', c = novo ? { nome: '', empresa: '', obra_id: (A.obras[0] || {}).id || '', modelo: 'gestao', modulos: A.modelos.gestao, cor: CL_CORES[0], slug: '', ativo: true, usuarios: [] } : A.clientes.find(x => String(x.id) === String(id));
  if (!c) { toast('Cliente não encontrado.', 1); location.hash = '#/admin/clientes'; return; }
  CL.img = null;
  titulo(novo ? 'Novo cliente' : c.nome);
  const E = { cor: c.cor, modelo: c.modelo || 'personalizado', modulos: c.modulos.slice() };
  view(`<a class="linkbtn" href="#/admin/clientes">${ic('back')} Clientes</a>
    <form class="card grid" id="clF"><h3>Empreendimento</h3>
      <div class="g2"><label>Nome do app (empreendimento)<input name="nome" required maxlength="40" value="${esc(c.nome)}" placeholder="AVA Residence"></label>
      <label>Cliente (empresa)<input name="empresa" value="${esc(c.empresa)}" placeholder="Construtora Mar Azul"></label></div>
      <div class="g2"><label>Obra<select name="obra_id" required>${A.obras.map(o => `<option value="${esc(o.id)}" ${String(o.id) === String(c.obra_id) ? 'selected' : ''}>${esc(o.nome)}</option>`).join('')}</select></label>
      <label>Endereço <small>(${esc(A.app_url)}c/…)</small><input name="slug" required pattern="[a-z0-9][a-z0-9\\-]{2,39}" value="${esc(c.slug)}" placeholder="ava-residence"></label></div>
      <label>O que o cliente vê</label>
      <div class="seg" id="clMod">${[['gestao', 'Gestão'], ['global', 'Global'], ['personalizado', 'Escolher']].map(([k, t]) => `<button type="button" data-m="${k}" class="${E.modelo === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="cl-mods" id="clMods"></div>
      <label>Cor do app</label>
      <div class="cl-sw" id="clSw">${CL_CORES.map(x => `<button type="button" data-cor="${x}" style="background:${x}" aria-label="Cor ${x}"></button>`).join('')}<input type="color" id="clCor" value="${esc(c.cor)}" aria-label="Outra cor"></div>
      <label>Imagem do empreendimento <small>(vira o ícone do app e o fundo do login; quadrada fica melhor)</small><input type="file" id="clImg" accept="image/*"></label>
      <div class="cl-prev"><canvas id="clIcone" width="192" height="192"></canvas><div class="cl-top" id="clTopo"><div><b id="clTn">${esc(c.nome || 'Nome do empreendimento')}</b><small>assim fica o topo do app do cliente</small></div></div></div>
      ${novo ? '' : `<label class="chk"><input type="checkbox" name="ativo" ${c.ativo ? 'checked' : ''}> Acesso ativo</label>`}
      <div class="acoes"><button class="btn">${ic('check')} Salvar</button>${novo ? '' : `<button type="button" class="btn sec" id="clPub">${ic('download')} Publicar endereço</button>`}</div>
      ${c.url ? `<div class="aviso info">Endereço do cliente: <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.url)}</a> <button type="button" class="linkbtn" id="clCop">copiar</button></div>` : novo ? '' : '<div class="aviso warn">Endereço ainda não publicado: escolha a imagem e toque em Publicar endereço. Enquanto isso, o cliente já pode entrar pelo app da Size (com a cor dele).</div>'}
    </form>
    ${novo ? '' : `<div class="card"><div class="bp-h"><h3>${ic('users')} Acessos do cliente</h3><button type="button" class="btn sec peq" id="clNovoU">${ic('plus')} Novo acesso</button></div>
      ${c.usuarios.map(u => `<div class="lin-sel" style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--line)"><span><b>${esc(u.nome)}</b> ${u.ativo ? '' : '<span class="bp-flag">desativado</span>'}<br><small>${esc(u.login)}${u.email ? ' · ' + esc(u.email) : ''}${u.ultimo_acesso ? ' · último acesso ' + esc(u.ultimo_acesso) : ' · ainda não entrou'}</small></span>
        <button type="button" class="btn sec peq" data-u="${esc(u.id)}">Editar</button></div>`).join('') || '<p class="mute">Nenhum acesso ainda. Crie um login para cada pessoa do cliente (dono, fiscal…).</p>'}</div>`}`);

  const mods = () => {
    const fixo = E.modelo !== 'personalizado';
    if (fixo) E.modulos = A.modelos[E.modelo].slice();
    $('#clMods').innerHTML = `<label class="chk"><input type="checkbox" checked disabled> Andamento da obra <small>(sempre)</small></label>` + Object.entries(A.modulos).map(([k, t]) =>
      `<label class="chk"><input type="checkbox" data-mk="${k}" ${E.modulos.includes(k) ? 'checked' : ''} ${fixo ? 'disabled' : ''}> ${esc(t)}</label>`).join('');
    $$('[data-mk]').forEach(i => { i.onchange = () => { E.modulos = $$('[data-mk]').filter(x => x.checked).map(x => x.dataset.mk); }; });
  };
  $$('#clMod [data-m]').forEach(b => { b.onclick = () => { E.modelo = b.dataset.m; $$('#clMod [data-m]').forEach(x => x.classList.toggle('on', x === b)); mods(); }; });
  mods();
  const pinta = () => {
    const cor = pcCor(E.cor);
    $('#clTopo').style.background = cor;
    $$('#clSw [data-cor]').forEach(b => b.classList.toggle('on', b.dataset.cor.toUpperCase() === String(E.cor).toUpperCase()));
    $('#clCor').value = E.cor;
    clDesenhar($('#clIcone'), 192, cor, true);
  };
  $$('#clSw [data-cor]').forEach(b => { b.onclick = () => { E.cor = b.dataset.cor; pinta(); }; });
  $('#clCor').oninput = e => { E.cor = e.target.value.toUpperCase(); pinta(); };
  pinta();
  const f = $('#clF');
  f.nome.oninput = () => { $('#clTn').textContent = f.nome.value || 'Nome do empreendimento'; if (novo && !f.slug.dataset.mexeu) f.slug.value = clSlug(f.nome.value); };
  f.slug.oninput = () => { f.slug.dataset.mexeu = '1'; };
  $('#clImg').onchange = async e => {
    const arq = e.target.files[0];
    if (!arq) return;
    try { CL.img = await clCarregar(arq); E.cor = clCorDaImagem(CL.img); pinta(); toast('Cor sugerida pela imagem. Troque se quiser.'); } catch (x) { toast(x.message, 1); }
  };
  if ($('#clCop')) $('#clCop').onclick = async () => { try { await navigator.clipboard.writeText(c.url); toast('Endereço copiado.'); } catch (e) { toast('Não consegui copiar.', 1); } };
  const salvar = async () => {
    const r = await api('cli_salvar', { cliente: { id: novo ? '' : c.id, nome: f.nome.value, empresa: f.empresa.value, obra_id: f.obra_id.value, slug: f.slug.value.trim(), modelo: E.modelo, modulos: E.modulos, cor: pcCor(E.cor), ativo: f.ativo ? f.ativo.checked : true } });
    CL.d = null;
    return r;
  };
  f.onsubmit = async e => {
    e.preventDefault();
    try { const r = await salvar(); toast(r.msg); if (novo) location.hash = '#/admin/cliente/' + enc(r.id); else vCliente(c.id); } catch (x) { toast(x.message, 1); }
  };
  if ($('#clPub')) $('#clPub').onclick = async () => {
    if (!CL.img) return toast('Escolha a imagem do empreendimento: ela vira o ícone do app.', 1);
    const b = $('#clPub'); b.disabled = true; b.textContent = 'Publicando…';
    try {
      await salvar();
      const cor = pcCor(E.cor), cv = n => { const k = document.createElement('canvas'); k.width = k.height = n; return k; };
      const png = (n, redondo) => { const k = cv(n); clDesenhar(k, n, cor, redondo); return k.toDataURL('image/png'); };
      const imagens = { 'icon-192.png': png(192, true), 'icon-512.png': png(512, true), 'icon-maskable-512.png': png(512, false), 'icon-180.png': png(180, false), 'capa.jpg': clCapa(CL.img) };
      const r = await api('cli_publicar', { id: c.id, imagens });
      toast(r.msg); vCliente(c.id);
    } catch (x) { toast(x.message, 1); b.disabled = false; b.textContent = 'Publicar endereço'; }
  };
  if ($('#clNovoU')) $('#clNovoU').onclick = () => clUsuario(c, null);
  $$('[data-u]').forEach(b => { b.onclick = () => clUsuario(c, c.usuarios.find(u => u.id === b.dataset.u)); });
}

/* login de uma pessoa do cliente: novo (com senha provisória) ou edição (nova senha opcional) */
function clUsuario(c, u) {
  modal(u ? 'Acesso de ' + esc(u.nome) : 'Novo acesso · ' + esc(c.nome), `<div class="grid">
    <label>Nome<input id="cuNome" value="${esc(u ? u.nome : '')}" required></label>
    <div class="g2"><label>Usuário (login)<input id="cuLogin" autocapitalize="none" value="${esc(u ? u.login : '')}" required></label><label>E-mail<input id="cuEmail" type="email" value="${esc(u ? u.email : '')}"></label></div>
    <label>${u ? 'Nova senha provisória <small>(deixe em branco para manter)</small>' : 'Senha provisória <small>(mín. 10; ele troca no primeiro acesso)</small>'}<input id="cuSenha" type="text" autocomplete="off" ${u ? '' : 'required'} minlength="10"></label>
    ${u ? `<label class="chk"><input type="checkbox" id="cuAtivo" ${u.ativo ? 'checked' : ''}> Acesso ativo</label>` : ''}</div>`, {
    ok: 'Salvar', onOk: async () => {
      const r = await api('cli_usuario_salvar', { cliente_id: c.id, usuario: { id: u ? u.id : '', nome: $('#cuNome').value, login: $('#cuLogin').value, email: $('#cuEmail').value, ativo: u ? $('#cuAtivo').checked : true }, senha: $('#cuSenha').value });
      toast(r.msg); CL.d = null; vCliente(c.id);
    }
  });
}

/* ---------- imagem → ícones ---------- */
function clCarregar(arq) {
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(arq), im = new Image();
    im.onload = () => ok(im); im.onerror = () => no(new Error('Não consegui abrir essa imagem.'));
    im.src = url;
  });
}
/* desenha o ícone: fundo na cor do cliente, imagem cobrindo o quadrado (recorte central); "redondo" = cantos arredondados transparentes */
function clDesenhar(k, n, cor, redondo) {
  const g = k.getContext('2d');
  g.clearRect(0, 0, n, n);
  g.save();
  if (redondo) { const r = n * 0.22; g.beginPath(); g.moveTo(r, 0); g.arcTo(n, 0, n, n, r); g.arcTo(n, n, 0, n, r); g.arcTo(0, n, 0, 0, r); g.arcTo(0, 0, n, 0, r); g.closePath(); g.clip(); }
  g.fillStyle = cor; g.fillRect(0, 0, n, n);
  const im = CL.img;
  if (im) { const s = Math.min(im.naturalWidth, im.naturalHeight); g.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, n, n); }
  else { g.fillStyle = 'rgba(255,255,255,.9)'; g.font = `700 ${Math.round(n * 0.42)}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((($('#clTn') || {}).textContent || '?').trim().charAt(0).toUpperCase(), n / 2, n / 2 + n * 0.02); }
  g.restore();
}
function clCapa(im) {
  const W = Math.min(1280, im.naturalWidth), H = Math.round(im.naturalHeight * W / im.naturalWidth), k = document.createElement('canvas');
  k.width = W; k.height = H;
  k.getContext('2d').drawImage(im, 0, 0, W, H);
  return k.toDataURL('image/jpeg', 0.8);
}
/* cor predominante (pixels mais saturados) → depois o pcCor escurece se ficar clara demais */
function clCorDaImagem(im) {
  const k = document.createElement('canvas'), n = 40;
  k.width = k.height = n;
  const g = k.getContext('2d');
  g.drawImage(im, 0, 0, n, n);
  const d = g.getImageData(0, 0, n, n).data;
  let r = 0, gg = 0, b = 0, w = 0;
  for (let i = 0; i < d.length; i += 4) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), sat = mx ? (mx - mn) / mx : 0, p = sat * sat * (d[i + 3] / 255);
    r += d[i] * p; gg += d[i + 1] * p; b += d[i + 2] * p; w += p;
  }
  if (w < 1) return '#2E3440';
  return pcCor('#' + [r, gg, b].map(x => Math.round(x / w).toString(16).padStart(2, '0')).join(''));
}

ROTAS.push([/^#\/admin\/clientes$/, vClientes], [/^#\/admin\/cliente\/(.+)$/, vCliente]);
