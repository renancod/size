/* Administração do portal do cliente: cadastro (empreendimentos com o tipo Gerenciamento/Execução ou módulos um a um e a foto
 * do cartão, cor), logins de cada cliente e publicação do endereço próprio (c/<slug>/) com a logo, o ícone e o fundo do login.
 * Os ícones são recortados aqui no navegador (canvas) a partir da logo e enviados ao servidor, que publica no GitHub Pages. */
const CL = { d: null, img: null, fundo: null };
if (!IC.copy) IC.copy = 'M9 9h11v11H9zM5 15H4V4h11v1';
if (!IC.mail) IC.mail = 'M4 4h16v16H4zM4 6l8 7 8-7';
const CL_CORES = ['#1D6F5F', '#2B4C7E', '#8A5A2B', '#5B3E8C', '#9C2F3E', '#2E3440', '#0F6E8C', '#6B7A1F'];
const clSlug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

async function vClientes() {
  titulo('Portal do cliente');
  const A = CL.d = await api('cli_admin');
  view(`<div class="card"><div class="bp-h"><h3>${ic('eye')} Portal do cliente</h3><a class="btn" href="#/admin/cliente/novo">${ic('plus')} Novo cliente</a></div>
      <p class="mute" style="margin:0">Cada cliente acompanha pelo app, com a logo e a cor da empresa dele, os empreendimentos que a Size gerencia ou executa e os orçamentos. Ele só vê o que você liberar e nunca custos, compras ou dados internos.</p></div>
    ${A.github ? '' : `<form class="card grid" id="clGh"><h3>${ic('download')} Publicação do endereço do cliente</h3>
      <p class="mute" style="margin:0">Para o sistema publicar o endereço próprio de cada cliente, ele precisa de uma chave do GitHub com permissão de escrita no repositório do app. Faça isso uma vez só:
      no GitHub, Settings → Developer settings → Fine-grained tokens → Generate new token, repositório <b>renancod/size</b>, permissão <b>Contents: Read and write</b>. Cole a chave abaixo: ela fica guardada só no servidor.</p>
      <div class="g2"><label>Chave (token)<input name="chave" type="password" autocomplete="off" required></label><label>Repositório<input name="repo" value="renancod/size" required></label></div>
      <button class="btn">Guardar chave</button></form>`}
    <div class="cl-lista">${A.clientes.map(c => `<a class="card cl-item" href="#/admin/cliente/${enc(c.id)}" style="text-decoration:none;color:inherit">
      ${c.logo_url ? `<span class="cl-cor cl-logo" style="border-color:${esc(c.cor)}"><img src="${esc(c.logo_url)}" alt="" loading="lazy" crossorigin="anonymous" data-cor="${esc(c.cor)}"></span>` : `<span class="cl-cor" style="background:${esc(c.cor)}">${ic('building')}</span>`}
      <span><b>${esc(c.nome)}</b> <span class="pc-chip ${c.estagio === 'Obra' ? 'ok' : c.estagio === 'Inativo' ? 'err' : 'warn'}">${esc(c.estagio)}</span>
        ${c.razao_social || c.cnpj ? `<br><small>${esc([c.razao_social, c.cnpj].filter(Boolean).join(' · '))}</small>` : ''}
        ${c.contato || c.telefone || c.email ? `<br><small>${ic('user')} ${esc([c.contato + (c.cargo ? ' (' + c.cargo + ')' : ''), c.telefone, c.email].filter(x => x && x.trim()).join(' · '))}</small>` : ''}
        <br><small>${c.empreendimentos.length ? c.empreendimentos.map(e => esc(e.nome) + ' (' + esc(A.tipos[e.modelo]) + ')').join(', ') : 'sem obra'} · ${c.orc_total} ${c.orc_total === 1 ? 'orçamento' : 'orçamentos'} · ${c.usuarios.length} ${c.usuarios.length === 1 ? 'acesso' : 'acessos'}${c.url ? ' · publicado' : ' · endereço não publicado'}</small></span>
      ${ic('chevron')}</a>`).join('') || '<div class="card vazio"><p>Nenhum cliente ainda.</p></div>'}</div>`);
  // logo que não carregou (endereço ainda subindo): volta ao quadrado na cor do cliente
  $$('.cl-logo img').forEach(im => {
    im.onerror = () => { const s = im.parentNode; s.className = 'cl-cor'; s.style.background = im.dataset.cor; s.innerHTML = ic('building'); };
    // logo com fundo próprio (ex: quadrado preto): o quadrado pega a cor do canto dela, sem moldura branca
    const pinta = () => { try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 1;
      const g = cv.getContext('2d'); g.drawImage(im, 1, 1, 1, 1, 0, 0, 1, 1);
      const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data;
      if (a > 200) im.parentNode.style.background = `rgb(${r},${gr},${b})`;
    } catch (e) { /* imagem de outro endereço sem permissão: fica o branco */ } };
    if (im.complete && im.naturalWidth) pinta(); else im.addEventListener('load', pinta);
  });
  if ($('#clGh')) $('#clGh').onsubmit = async e => {
    e.preventDefault();
    // "chave", nunca "token": token é o login do app na chamada (sobrescrever derrubava a sessão)
    try { toast((await api('cli_github', { chave: e.target.chave.value, repo: e.target.repo.value })).msg); vClientes(); } catch (x) { toast(x.message, 1); }
  };
}

async function vCliente(id) {
  const A = CL.d && CL.d.clientes ? CL.d : (CL.d = await api('cli_admin'));
  const novo = id === 'novo', c = novo ? { nome: '', empresa: '', empreendimentos: [], cor: CL_CORES[0], slug: '', ativo: true, usuarios: [] } : A.clientes.find(x => String(x.id) === String(id));
  if (!c) { toast('Cliente não encontrado.', 1); location.hash = '#/admin/clientes'; return; }
  CL.img = null; CL.fundo = null;
  titulo(novo ? 'Novo cliente' : c.nome);
  const E = { cor: c.cor, ativo: novo ? true : !!c.ativo, semFundo: false, emps: c.empreendimentos.map(e => ({ obra: e.obra, modelo: e.modelo, modulos: e.modulos.slice(), foto: e.foto, salvo: true })) };
  view(`<a class="linkbtn" href="#/admin/clientes">${ic('back')} Clientes</a>
    <form class="card grid" id="clF"><h3>Cliente</h3>
      <div class="g2"><label>Nome do app <small>(nome do cliente)</small><input name="nome" required maxlength="40" value="${esc(c.nome)}" placeholder="Mar Azul Incorporadora"></label>
      <label>Empresa <small>(nome fantasia; aparece embaixo do nome no app)</small><input name="empresa" value="${esc(c.empresa)}" placeholder="Construtora Mar Azul"></label></div>
      <label>Endereço <small>(${esc(A.app_url)}c/…)</small><input name="slug" required pattern="[a-z0-9][a-z0-9\\-]{2,39}" value="${esc(c.slug)}" placeholder="mar-azul"></label>
      <h3 style="margin:6px 0 0">${ic('file')} Dados cadastrais <small class="mute">(preenchem o orçamento quando ele é ligado a este cliente)</small></h3>
      <div class="g2"><label>Razão social<input name="razao_social" value="${esc(c.razao_social || '')}" placeholder="Construtora Mar Azul Ltda"></label>
        <label>CNPJ <small>(ou CPF)</small><input name="cnpj" inputmode="numeric" value="${esc(c.cnpj || '')}" placeholder="00.000.000/0000-00"></label></div>
      <div class="g2"><label>Contato principal<input name="contato" value="${esc(c.contato || '')}" placeholder="ex: Eng. Paulo Lima"></label><label>Cargo<input name="cargo" value="${esc(c.cargo || '')}" placeholder="ex: diretor, engenheiro"></label></div>
      <div class="g2"><label>E-mail<input name="email" type="email" value="${esc(c.email || '')}"></label><label>Telefone / WhatsApp<input name="telefone" type="tel" value="${esc(c.telefone || '')}" placeholder="(51) 99999-9999"></label></div>
      <label>Cidade / UF<input name="cidade" value="${esc(c.cidade || '')}" placeholder="Xangri-lá/RS"></label>
      <label>Observações <small>(internas: o cliente não vê)</small><textarea name="obs" rows="2">${esc(c.obs || '')}</textarea></label>
      <div class="bp-h" style="margin-top:6px"><h3 style="margin:0">${ic('building')} Empreendimentos</h3><button type="button" class="btn sec peq" id="clEmpN">${ic('plus')} Adicionar empreendimento</button></div>
      <small class="mute">As obras que a Size gerencia ou executa para este cliente. Sem nenhuma, ele está em negociação e só vê os orçamentos enviados.</small>
      <div id="clEmps" class="cl-emps"></div>
      <label>Cor do app</label>
      <div class="cl-sw" id="clSw">${CL_CORES.map(x => `<button type="button" data-cor="${x}" style="background:${x}" aria-label="Cor ${x}"></button>`).join('')}<input type="color" id="clCor" value="${esc(c.cor)}" aria-label="Outra cor"></div>
      <div class="g2"><label>Logo da empresa do cliente <small>(topo do app, login e ícone no celular; PNG com fundo transparente fica melhor)</small><input type="file" id="clImg" accept="image/*"></label>
      <label>Fundo do login <small>(opcional; foto deitada, 1920 × 1080 ou maior)</small><input type="file" id="clFundo" accept="image/*"></label></div>
      <div id="clFundoAv"></div>
      ${c.capa ? `<label class="chk"><input type="checkbox" id="clSemFundo"> Tirar o fundo do login publicado (fica só a cor)</label>` : ''}
      <div class="cl-prev"><canvas id="clIcone" width="192" height="192"></canvas><div class="cl-top" id="clTopo"><div><b id="clTn">${esc(c.nome || 'Nome do cliente')}</b><small>assim fica o topo do app do cliente</small></div></div></div>
      ${c.logo || c.url ? `<small class="mute">${c.logo ? 'Logo publicada. ' : ''}Escolha uma imagem só se quiser trocar; publicar sem imagem nova mantém as que estão no ar.</small>` : ''}
      <div class="acoes"><button class="btn">${ic('check')} Salvar</button>${novo ? '' : `<button type="button" class="btn sec" id="clPub">${ic('download')} Publicar endereço</button>
        <button type="button" class="btn ${c.ativo ? 'perigo' : 'sec'}" id="clAtivo">${c.ativo ? 'Encerrar acesso' : 'Reativar acesso'}</button>`}</div>
      ${!novo && !c.ativo ? '<div class="aviso warn">Acesso encerrado: ninguém deste cliente consegue entrar. Os orçamentos e o histórico continuam guardados.</div>' : ''}
      ${!novo && c.orcamentos.length ? `<div class="mute"><b>Orçamentos no portal:</b> ${c.orcamentos.map(o => `<a href="#/orc/orcamento/${enc(o.id)}">${esc(o.rotulo)}</a> (${esc(o.status.toLowerCase())}${o.aceite ? ', aceito no app' : ''}${o.abertos ? ', ' + o.abertos + ' consideração' + (o.abertos > 1 ? 'ões' : '') + ' para responder' : ''})`).join(' · ')}</div>` : ''}
      ${c.url ? `<div class="aviso info">Endereço do cliente: <a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.url)}</a> <button type="button" class="linkbtn" id="clCop">copiar</button></div>` : novo ? '' : '<div class="aviso warn">Endereço ainda não publicado: escolha a logo e toque em Publicar endereço. Enquanto isso, o cliente já pode entrar pelo app da Size (com a cor dele).</div>'}
    </form>
    ${novo ? '' : `<div class="card"><div class="bp-h"><h3>${ic('users')} Acessos do cliente</h3><button type="button" class="btn sec peq" id="clNovoU">${ic('plus')} Novo acesso</button></div>
      ${!c.ativo ? `<div class="aviso warn">O acesso deste cliente está <b>encerrado</b>: nenhum destes logins consegue entrar. <button type="button" class="btn peq" id="clReativar">Reativar acesso</button></div>` : ''}
      ${c.usuarios.map(u => `<div class="cl-u"><span><b>${esc(u.nome)}</b> ${u.ativo ? '' : '<span class="bp-flag">desativado</span>'}<br><small>${esc(u.login)}${u.email ? ' · ' + esc(u.email) : ''}${u.ultimo_acesso ? ' · último acesso ' + esc(u.ultimo_acesso) : ' · ainda não entrou'}</small>
        <span class="cl-u-ve">${clVeResumo(c, u.portal).map(x => `<span class="pc-chip">${esc(x)}</span>`).join('')}</span></span>
        <span class="acoes"><button type="button" class="btn sec peq" data-share="${esc(u.id)}" title="Mandar o link e o usuário">${ic('send')} Compartilhar</button><button type="button" class="btn sec peq" data-u="${esc(u.id)}">Editar</button></span></div>`).join('') || '<p class="mute">Nenhum acesso ainda. Crie um login para cada pessoa do cliente (dono, engenheiro, fiscal…) e escolha o que cada um vê.</p>'}</div>`}`);

  // empreendimentos: obra, tipo (Gerenciamento / Execução / escolher os módulos) e a foto do cartão
  const emps = () => {
    $('#clEmps').innerHTML = E.emps.map((e, i) => {
      const fixo = e.modelo !== 'personalizado';
      if (fixo) e.modulos = A.modelos[e.modelo].slice();
      return `<div class="cl-emp" data-i="${i}"><div class="cl-emp-f" data-foto="${i}">${e.foto && e.salvo ? '' : ic('camera')}</div><div class="grid">
        <div class="g2"><label>Obra<select data-ob="${i}"><option value="">— escolha a obra —</option>${A.obras.filter(o => o.ativa || o.id === e.obra).map(o => `<option value="${esc(o.id)}" ${o.id === e.obra ? 'selected' : ''}>${esc(o.nome)}${o.ativa ? '' : ' (desativada)'}</option>`).join('')}</select></label>
        <div><label>O que a Size faz</label><div class="seg">${[['gestao', 'Gerenciamento'], ['global', 'Execução'], ['personalizado', 'Escolher']].map(([k, t]) => `<button type="button" data-tp="${i}" data-m="${k}" class="${e.modelo === k ? 'on' : ''}">${t}</button>`).join('')}</div></div></div>
        <div class="cl-mods"><label class="chk"><input type="checkbox" checked disabled> Andamento <small>(sempre)</small></label>${Object.entries(A.modulos).map(([k, t]) => `<label class="chk"><input type="checkbox" data-mk="${i}" value="${k}" ${e.modulos.includes(k) ? 'checked' : ''} ${fixo ? 'disabled' : ''}> ${esc(t)}</label>`).join('')}</div>
        <div class="acoes">${e.salvo ? `<label class="btn sec peq" style="cursor:pointer">${ic('camera')} ${e.foto ? 'Trocar foto' : 'Escolher foto'}<input type="file" accept="image/*" data-fsel="${i}" hidden></label>${e.foto ? `<button type="button" class="btn sec peq" data-frem="${i}">Usar foto do diário</button>` : ''}` : '<small class="mute">Salve para escolher a foto (sem foto, o cartão usa a do último diário liberado).</small>'}
          <button type="button" class="btn sec peq perigo" data-rem="${i}">Retirar</button></div></div></div>`;
    }).join('') || '<p class="mute" style="margin:0">Nenhum empreendimento: cliente em negociação.</p>';
    $$('[data-ob]').forEach(s => { s.onchange = () => { const e = E.emps[+s.dataset.ob]; if (e.obra !== s.value) { e.obra = s.value; e.salvo = false; e.foto = false; emps(); } }; });
    $$('[data-tp]').forEach(b => { b.onclick = () => { E.emps[+b.dataset.tp].modelo = b.dataset.m; emps(); }; });
    $$('[data-mk]').forEach(x => { x.onchange = () => { const e = E.emps[+x.dataset.mk]; e.modulos = $$(`[data-mk="${x.dataset.mk}"]`).filter(y => y.checked).map(y => y.value); }; });
    $$('[data-rem]').forEach(b => { b.onclick = () => { E.emps.splice(+b.dataset.rem, 1); emps(); }; });
    $$('[data-fsel]').forEach(inp => { inp.onchange = async () => {
      const e = E.emps[+inp.dataset.fsel], arq = inp.files[0];
      if (!arq) return;
      try { const im = await clCarregar(arq); toast((await api('cli_emp_foto_salvar', { id: c.id, obra: e.obra, arquivo: { b64: clReduzir(im, 1280, 'image/jpeg') } })).msg); CL.d = null; vCliente(c.id); } catch (x) { toast(x.message, 1); }
    }; });
    $$('[data-frem]').forEach(b => { b.onclick = async () => { try { toast((await api('cli_emp_foto_salvar', { id: c.id, obra: E.emps[+b.dataset.frem].obra, remover: true })).msg); CL.d = null; vCliente(c.id); } catch (x) { toast(x.message, 1); } }; });
    // miniatura da foto escolhida (a mesma rota que o portal usa, na pré-visualização do administrador)
    E.emps.forEach((e, i) => { if (e.foto && e.salvo) api('cli_emp_foto', { cliente: c.id, obra: e.obra }).then(r => { const el = $(`[data-foto="${i}"]`); if (el && r.b64) el.style.backgroundImage = `url('data:image/jpeg;base64,${r.b64}')`; }).catch(() => {}); });
  };
  $('#clEmpN').onclick = () => { E.emps.push({ obra: '', modelo: 'gestao', modulos: A.modelos.gestao.slice(), foto: false, salvo: false }); emps(); };
  emps();
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
  f.nome.oninput = () => { $('#clTn').textContent = f.nome.value || 'Nome do cliente'; if (novo && !f.slug.dataset.mexeu) f.slug.value = clSlug(f.nome.value); };
  f.slug.oninput = () => { f.slug.dataset.mexeu = '1'; };
  // máscara: 14 números = CNPJ, 11 = CPF
  f.cnpj.onblur = () => { const s = f.cnpj.value.replace(/\D/g, '');
    if (s.length === 14) f.cnpj.value = s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'); else if (s.length === 11) f.cnpj.value = s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'); };
  $('#clImg').onchange = async e => {
    const arq = e.target.files[0];
    if (!arq) return;
    try { CL.img = await clCarregar(arq); E.cor = clCorDaImagem(CL.img); pinta(); toast('Cor sugerida pela logo. Troque se quiser.'); } catch (x) { toast(x.message, 1); }
  };
  $('#clFundo').onchange = async e => {
    const arq = e.target.files[0];
    if (!arq) return;
    try {
      CL.fundo = await clCarregar(arq);
      $('#clFundoAv').innerHTML = CL.fundo.naturalWidth < 1280 ? `<div class="aviso warn">Esta imagem tem só ${CL.fundo.naturalWidth} × ${CL.fundo.naturalHeight} px: no computador o fundo vai ficar borrado. Use uma de pelo menos 1280 px de largura (ideal 1920 × 1080).</div>` : '';
    } catch (x) { toast(x.message, 1); }
  };
  if ($('#clSemFundo')) $('#clSemFundo').onchange = e => { E.semFundo = e.target.checked; };
  if ($('#clCop')) $('#clCop').onclick = async () => { try { await navigator.clipboard.writeText(c.url); toast('Endereço copiado.'); } catch (e) { toast('Não consegui copiar.', 1); } };
  const salvar = async () => {
    if (E.emps.some(e => !e.obra)) throw new Error('Escolha a obra de cada empreendimento (ou retire a linha vazia).');
    const r = await api('cli_salvar', { cliente: { id: novo ? '' : c.id, nome: f.nome.value, empresa: f.empresa.value, slug: f.slug.value.trim(),
      ...Object.fromEntries(['razao_social', 'cnpj', 'contato', 'cargo', 'email', 'telefone', 'cidade', 'obs'].map(k => [k, f[k].value])), empreendimentos: E.emps.map(e => ({ obra: e.obra, modelo: e.modelo, modulos: e.modulos })), cor: pcCor(E.cor), ativo: E.ativo } });
    CL.d = null;
    return r;
  };
  f.onsubmit = async e => {
    e.preventDefault();
    try { const r = await salvar(); toast(r.msg); if (novo) location.hash = '#/admin/cliente/' + enc(r.id); else vCliente(c.id); } catch (x) { toast(x.message, 1); }
  };
  if ($('#clPub')) $('#clPub').onclick = async () => {
    if (!CL.img && !c.url) return toast('Escolha a logo da empresa do cliente: ela vira o ícone do app.', 1);
    const b = $('#clPub'), passo = t => { b.textContent = t; };
    b.disabled = true;
    // janela com o andamento: a ida ao GitHub leva uns 15 s e o site entra no ar 1–2 min depois
    modal('Publicando o endereço', '<div class="grid"><div id="clPasso">Salvando o cadastro…</div><div class="carregando"><span class="spin"></span></div><small class="mute">Pode continuar usando o app em outra aba; não feche esta.</small></div>', { semRodape: true });
    const msg = t => { const e = $('#clPasso'); if (e) e.textContent = t; passo(t); };
    try {
      await salvar();
      msg('Preparando os ícones…');
      const cor = pcCor(E.cor), cv = n => { const k = document.createElement('canvas'); k.width = k.height = n; return k; };
      const png = (n, redondo) => { const k = cv(n); clDesenhar(k, n, cor, redondo); return k.toDataURL('image/png'); };
      // logo nova: ícones + logo.png; sem logo nova, os ícones publicados continuam (o nome e a cor são atualizados)
      const imagens = CL.img ? { 'icon-192.png': png(192, true), 'icon-512.png': png(512, true), 'icon-maskable-512.png': png(512, false), 'icon-180.png': png(180, false), 'logo.png': clReduzir(CL.img, 512, 'image/png') } : {};
      if (CL.fundo) imagens['capa.jpg'] = clReduzir(CL.fundo, 1920, 'image/jpeg');
      msg('Enviando para o GitHub (uns 15 segundos)…');
      const r = await api('cli_publicar', { id: c.id, imagens, sem_capa: E.semFundo && !CL.fundo });
      msg('Enviado. O GitHub está colocando o endereço no ar (1 a 2 minutos)…');
      let noAr = false;
      for (let k = 0; k < 16 && !noAr; k++) {
        await new Promise(ok => setTimeout(ok, 15000));
        if (!$('#clPasso')) break;   // fechou a janela: segue sem esperar
        try { const x = await fetch(r.url + 'cliente.js?v=' + Date.now(), { cache: 'no-store' }); noAr = x.ok && (await x.text()).includes(f.nome.value.trim()); } catch (e) { /* tenta de novo */ }
      }
      fecharModal(); toast(noAr ? 'Endereço no ar: ' + r.url : 'Publicado. Se ainda não abrir, aguarde mais um minuto.'); vCliente(c.id);
    } catch (x) { fecharModal(); toast(x.message, 1); b.disabled = false; b.textContent = 'Publicar endereço'; }
  };
  if ($('#clAtivo')) $('#clAtivo').onclick = async () => {
    if (E.ativo && !confirm('Encerrar o acesso de ' + c.nome + '? Ninguém deste cliente consegue mais entrar (dá para reativar depois).')) return;
    E.ativo = !E.ativo;
    try { toast((await salvar()).msg); vCliente(c.id); } catch (x) { E.ativo = !E.ativo; toast(x.message, 1); }
  };
  if ($('#clReativar')) $('#clReativar').onclick = () => $('#clAtivo').click();
  if ($('#clNovoU')) $('#clNovoU').onclick = () => clUsuario(c, null);
  $$('[data-u]').forEach(b => { b.onclick = () => clUsuario(c, c.usuarios.find(u => u.id === b.dataset.u)); });
  $$('[data-share]').forEach(b => { b.onclick = () => clCompartilhar(c, c.usuarios.find(u => u.id === b.dataset.share), ''); });
}

/* resumo do que um login vê (chips na lista de acessos) */
function clVeResumo(c, P) {
  P = P || { obras: 'todas', orcamentos: true, modulos: null };
  const nomes = (c.empreendimentos || []).filter(e => P.obras === 'todas' || P.obras.includes(e.obra)).map(e => e.nome);
  const r = [P.obras === 'todas' ? (c.empreendimentos.length ? 'todas as obras' : 'obras quando houver') : nomes.length ? nomes.join(', ') : 'nenhuma obra'];
  if (P.orcamentos) r.push('orçamentos');
  if (P.modulos) { const fora = Object.keys(CL.d.modulos).filter(m => !P.modulos.includes(m)); if (fora.length) r.push('sem ' + fora.map(m => ({ cronograma: 'cronograma', diario: 'diário', fvs: 'FVS', financeiro: 'financeiro' })[m]).join(', ')); }
  return r;
}
/* login de uma pessoa do cliente: novo (com senha provisória) ou edição (nova senha opcional) e o que ela vê */
const CL_PERFIS = {
  tudo: ['Dono / diretoria', 'Todas as obras, orçamentos e todas as áreas', { obras: 'todas', orcamentos: true, modulos: ['cronograma', 'diario', 'fvs', 'financeiro', 'documentos'] }],
  tecnico: ['Engenheiro / fiscal', 'Acompanha as obras (cronograma, diário e FVS), sem orçamentos, financeiro e documentos', { obras: 'todas', orcamentos: false, modulos: ['cronograma', 'diario', 'fvs'] }],
  financeiro: ['Financeiro', 'Orçamentos, o financeiro e os documentos das obras', { obras: 'todas', orcamentos: true, modulos: ['cronograma', 'financeiro', 'documentos'] }]
};
function clUsuario(c, u) {
  // acesso novo começa como Engenheiro / fiscal: orçamentos e financeiro só para quem o senhor liberar
  const A = CL.d, E = c.empreendimentos || [], P = JSON.parse(JSON.stringify(u && u.portal ? u.portal : CL_PERFIS.tecnico[2]));
  if (!P.modulos) P.modulos = Object.keys(A.modulos);
  modal(u ? 'Acesso de ' + esc(u.nome) : 'Novo acesso · ' + esc(c.nome), `<div class="grid">
    <label>Nome<input id="cuNome" value="${esc(u ? u.nome : '')}" required placeholder="ex.: Eng. Paulo Lima"></label>
    <div class="g2"><label>Usuário (login)<input id="cuLogin" autocapitalize="none" value="${esc(u ? u.login : '')}" required placeholder="ex.: paulo.eng"></label><label>E-mail<input id="cuEmail" type="email" value="${esc(u ? u.email : '')}"></label></div>
    <label>${u ? 'Nova senha provisória <small>(deixe em branco para manter)</small>' : 'Senha provisória <small>(mín. 10; ele troca no primeiro acesso)</small>'}<input id="cuSenha" type="text" autocomplete="off" ${u ? '' : 'required'} minlength="10"></label>
    <div class="cl-ve"><h4>${ic('eye')} O que esta pessoa vê</h4>
      <div class="cl-perfis">${Object.entries(CL_PERFIS).map(([k, [t, d]]) => `<button type="button" data-perfil="${k}"><b>${esc(t)}</b><small>${esc(d)}</small></button>`).join('')}</div>
      <div class="cl-ve-g"><div><label>Obras</label>
        <label class="chk"><input type="radio" name="cuOb" value="todas" ${P.obras === 'todas' ? 'checked' : ''}> Todas as obras do cliente <small>(inclusive as próximas)</small></label>
        <label class="chk"><input type="radio" name="cuOb" value="algumas" ${P.obras !== 'todas' ? 'checked' : ''} ${E.length ? '' : 'disabled'}> Só estas:</label>
        <div class="cl-ve-obras">${E.map(e => `<label class="chk"><input type="checkbox" data-cuob="${esc(e.obra)}" ${P.obras === 'todas' || P.obras.includes(e.obra) ? 'checked' : ''}> ${esc(e.nome)} <small>${esc(A.tipos[e.modelo] || '')}</small></label>`).join('') || '<small class="mute">O cliente ainda não tem obras; as próximas entram conforme a opção acima.</small>'}</div></div>
      <div><label>Áreas <small>(dentro do que cada obra libera)</small></label>
        <label class="chk"><input type="checkbox" checked disabled> Andamento da obra</label>
        ${Object.entries(A.modulos).map(([k, t]) => `<label class="chk"><input type="checkbox" data-cumod="${k}" ${P.modulos.includes(k) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}
        <label class="chk" style="margin-top:6px"><input type="checkbox" id="cuOrc" ${P.orcamentos ? 'checked' : ''}> Orçamentos <small>(ver, comentar e aceitar)</small></label></div></div></div>
    ${u ? `<label class="chk"><input type="checkbox" id="cuAtivo" ${u.ativo ? 'checked' : ''}> Acesso ativo <small>(desmarcado: não entra, mas o login fica guardado)</small></label>
      <div class="cl-excluir"><button type="button" class="btn perigo peq" id="cuExcluir">${ic('x')} Excluir este acesso</button><small class="mute">Para login de teste ou criado por engano. As considerações e aceites que ele fez continuam no orçamento.</small></div>` : ''}</div>`, {
    ok: u ? 'Salvar' : 'Criar acesso', larga: true, onOk: async () => {
      const algumas = $('[name=cuOb]:checked').value === 'algumas';
      const portal = { obras: algumas ? $$('[data-cuob]').filter(x => x.checked).map(x => x.dataset.cuob) : 'todas', orcamentos: $('#cuOrc').checked, modulos: $$('[data-cumod]').filter(x => x.checked).map(x => x.dataset.cumod) };
      const senha = $('#cuSenha').value, dados = { id: u ? u.id : '', nome: $('#cuNome').value, login: $('#cuLogin').value.trim().toLowerCase(), email: $('#cuEmail').value, ativo: u ? $('#cuAtivo').checked : true };
      const r = await api('cli_usuario_salvar', { cliente_id: c.id, usuario: dados, senha, portal });
      CL.d = null;
      // acesso novo (ou senha nova): já abre a mensagem pronta para mandar
      if (!u || senha) { await vCliente(c.id); const c2 = CL.d.clientes.find(x => x.id === c.id); clCompartilhar(c2, c2.usuarios.find(x => x.login === dados.login), senha); return false; }
      else { toast(r.msg); vCliente(c.id); }
    }
  });
  const marcarPerfil = k => {
    const p = CL_PERFIS[k][2];
    $$('[name=cuOb]').forEach(x => { x.checked = x.value === 'todas'; });
    $$('[data-cuob]').forEach(x => { x.checked = true; });
    $$('[data-cumod]').forEach(x => { x.checked = p.modulos.includes(x.dataset.cumod); });
    $('#cuOrc').checked = p.orcamentos;
    $$('[data-perfil]').forEach(b => b.classList.toggle('on', b.dataset.perfil === k));
  };
  $$('[data-perfil]').forEach(b => { b.onclick = () => marcarPerfil(b.dataset.perfil); });
  // marcar uma obra específica passa para "Só estas"
  $$('[data-cuob]').forEach(x => { x.onchange = () => { $$('[name=cuOb]').forEach(r => { r.checked = r.value === 'algumas'; }); }; });
  // perfil que bate com o que está salvo aparece selecionado
  const k0 = Object.keys(CL_PERFIS).find(k => { const p = CL_PERFIS[k][2]; return P.obras === 'todas' && p.orcamentos === P.orcamentos && p.modulos.length === P.modulos.length && p.modulos.every(m => P.modulos.includes(m)); });
  if (k0) $(`[data-perfil="${k0}"]`).classList.add('on');
  if ($('#cuExcluir')) $('#cuExcluir').onclick = async () => {
    if (!confirm('Excluir o acesso ' + u.login + ' (' + u.nome + ')? Ele não consegue mais entrar e o login some da lista.')) return;
    try { toast((await api('cli_usuario_excluir', { cliente_id: c.id, id: u.id })).msg); fecharModal(); CL.d = null; vCliente(c.id); } catch (x) { toast(x.message, 1); }
  };
}

/* mensagem pronta para mandar o acesso (WhatsApp, e-mail ou copiar): o link do cliente, o usuário e, quando acabou de
 * ser definida, a senha provisória; o texto diz o que a pessoa vai acompanhar */
function clCompartilhar(c, u, senha) {
  if (!u) return;
  const link = c.url || CL.d.app_url, P = u.portal || { obras: 'todas', orcamentos: true, modulos: null };
  const nome = String(u.nome).split(' ').filter(w => !/^(eng|eng\.|sr|sra|dr|dra)\.?$/i.test(w))[0] || u.nome;
  const obras = (c.empreendimentos || []).filter(e => P.obras === 'todas' || P.obras.includes(e.obra)).map(e => e.nome);
  const ve = [P.orcamentos ? 'os orçamentos' : '', obras.length ? (obras.length === 1 ? 'a obra ' + obras[0] : 'as obras ' + obras.slice(0, -1).join(', ') + ' e ' + obras.slice(-1)) : P.obras === 'todas' ? 'as obras' : ''].filter(Boolean).join(' e ');
  const txt = `Olá, ${nome}! Segue seu acesso ao portal ${c.nome} da Size Engenharia${ve ? ', onde você acompanha ' + ve : ''}:\n\n${link}\nUsuário: ${u.login}\n`
    + (senha ? `Senha provisória: ${senha}\n\nNo primeiro acesso, crie sua própria senha.` : `Senha: a que você já usa (se esqueceu, peça uma nova à Size).`)
    + `\nNo celular, toque em "Instalar o app" para ficar com o ícone na tela.`;
  modal(`${ic('send')} Compartilhar o acesso de ${esc(u.nome)}`, `<div class="grid">
    ${c.url ? '' : '<div class="aviso warn">O endereço próprio deste cliente ainda não foi publicado: a mensagem leva o link do app da Size (ele entra com a cor do cliente). Publique para mandar o link com a logo dele.</div>'}
    ${senha ? '' : '<div class="aviso info">A senha não vai na mensagem. Para mandar uma senha nova, toque em Editar e defina uma senha provisória.</div>'}
    <textarea id="cuMsg" rows="9" class="cl-msg">${esc(txt)}</textarea>
    <div class="acoes"><button type="button" class="btn" id="cuCopiar">${ic('copy')} Copiar mensagem</button>
      <a class="btn sec" id="cuZap" target="_blank" rel="noopener">${ic('send')} Abrir no WhatsApp</a>
      ${u.email ? `<a class="btn sec" id="cuMail">${ic('mail')} E-mail para ${esc(u.email)}</a>` : ''}</div></div>`, { semRodape: true, larga: true });
  const msg = () => $('#cuMsg').value;
  const links = () => {
    $('#cuZap').href = 'https://wa.me/?text=' + encodeURIComponent(msg());
    if ($('#cuMail')) $('#cuMail').href = 'mailto:' + encodeURIComponent(u.email) + '?subject=' + encodeURIComponent('Acesso ao portal ' + c.nome + ' · Size Engenharia') + '&body=' + encodeURIComponent(msg());
  };
  $('#cuMsg').oninput = links; links();
  $('#cuCopiar').onclick = async () => { try { await navigator.clipboard.writeText(msg()); toast('Mensagem copiada: cole no WhatsApp ou no e-mail.'); } catch (e) { $('#cuMsg').select(); toast('Selecionei o texto: copie com Ctrl+C.', 1); } };
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
/* reduz para caber em max px (lado maior), sem aumentar; PNG mantém o fundo transparente da logo */
function clReduzir(im, max, tipo) {
  const f = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), W = Math.round(im.naturalWidth * f), H = Math.round(im.naturalHeight * f), k = document.createElement('canvas');
  k.width = W; k.height = H;
  const g = k.getContext('2d');
  if (tipo === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
  g.drawImage(im, 0, 0, W, H);
  return k.toDataURL(tipo, 0.82);
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
