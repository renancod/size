/**
 * Administração: usuários, acessos por obra, obras, perfis, configurações e materiais padrão.
 */
/**
 * Perfis v2: Compras deixa de aprovar e nasce o perfil Aprovador.
 * Roda uma vez (marca PERFIS_V2 em Config) e ajusta também quem já tinha o perfil Compras.
 */
function atualizarPerfis_() {
  const C = central_('Config');
  if (C.all().some(r => r.chave === 'PERFIS_V2')) return;
  const P = central_('Perfis');
  PERFIS_PADRAO.forEach(d => {
    const p = P.all().find(x => norm_(x.perfil) === norm_(d[0]));
    if (!p) P.insert({ perfil: d[0], permissoes: d[1], descricao: d[2] });
    else if (d[0] === 'Compras') { p.permissoes = d[1]; p.descricao = d[2]; P.update(p); }
  });
  const A = central_('Acessos');
  A.all().filter(a => a.perfil === 'Compras').forEach(a => { a.permissoes = PERFIS_PADRAO.find(d => d[0] === 'Compras')[1]; A.update(a); });
  C.insert({ chave: 'PERFIS_V2', valor: 'Sim', descricao: 'Ajuste automático: Compras sem aprovação + perfil Aprovador' });
}

function adminDados_(q, ctx) {
  atualizarPerfis_();
  garantirGatilhos_();
  return {
    usuarios: central_('Usuarios').all().map(pub_),
    acessos: central_('Acessos').all().map(a => {
      const o = pub_(a);
      o.permissoes = String(a.permissoes || '').split(',').map(s => s.trim()).filter(Boolean);
      return o;
    }),
    obras: central_('Obras').all().map(o => {
      const r = pub_(o);
      r.planilha_url = o.planilha_id ? 'https://docs.google.com/spreadsheets/d/' + o.planilha_id + '/edit' : '';
      r.pasta_url = o.pasta_id ? 'https://drive.google.com/drive/folders/' + o.pasta_id : '';
      return r;
    }),
    perfis: central_('Perfis').all().map(p => ({ perfil: p.perfil, descricao: p.descricao, permissoes: String(p.permissoes || '').split(',').map(s => s.trim()).filter(Boolean) })),
    config: central_('Config').all().map(pub_),
    padrao: central_('MateriaisPadrao').all().map(pub_),
    unidades: central_('Unidades').all().map(r => String(r.unidade).trim()).filter(Boolean),
    permissoes: PERMISSOES,
    central_url: centralSS_().getUrl()
  };
}

function adminUsuarioSalvar_(q, ctx) {
  const U = central_('Usuarios'), d = q.usuario || {};
  const nome = String(d.nome || '').trim(), login = String(d.login || '').trim().toLowerCase();
  if (!nome || !login) throw new Error('Preencha nome e usuário (login).');
  if (!/^[a-z0-9._@-]{3,}$/.test(login)) throw new Error('Login: só letras minúsculas, números, ponto, hífen ou @ (mín. 3).');
  let u = d.id ? U.all().find(x => String(x.id) === String(d.id)) : null;
  if (U.all().some(x => x !== u && norm_(x.login) === login)) throw new Error('Já existe um usuário com esse login.');
  const novo = !u;
  if (novo) {
    u = { id: U.proxCodigo('id', 'U', 3), criado_em: new Date(), trocar_senha: 'Sim' };
    definirSenha_(u, q.senha);
  }
  if (String(u.id) === String(ctx.u.id) && (!sim_(d.admin) || !sim_(d.ativo))) throw new Error('Você não pode tirar o seu próprio acesso de administrador.');
  u.nome = nome;
  u.login = login;
  u.email = String(d.email || '').trim();
  u.telefone = String(d.telefone || '').trim();
  u.admin = sim_(d.admin) ? 'Sim' : 'Não';
  u.ativo = sim_(d.ativo) ? 'Sim' : 'Não';
  if (novo) U.insert(u); else U.update(u);

  if (q.acessos) {
    const obras = central_('Obras').all(), A = central_('Acessos');
    A.removeWhere(a => String(a.usuario_id) === String(u.id));
    A.insertMany([].concat(q.acessos).filter(a => a && a.obra_id && (a.permissoes || []).length).map(a => {
      const o = obras.find(x => String(x.id) === String(a.obra_id));
      return {
        usuario_id: u.id, usuario: u.nome, obra_id: a.obra_id, obra: o ? o.nome : '', perfil: a.perfil || 'Personalizado',
        permissoes: [].concat(a.permissoes).filter(p => PERMISSOES[p]).join(',')
      };
    }));
  }
  log_(ctx, novo ? 'usuario_criar' : 'usuario_editar', u.login);
  return { msg: (novo ? 'Usuário criado: ' : 'Usuário salvo: ') + u.login + '.', id: u.id };
}

function adminSenha_(q, ctx) {
  const U = central_('Usuarios'), u = U.all().find(x => String(x.id) === String(q.usuario_id));
  if (!u) throw new Error('Usuário não encontrado.');
  definirSenha_(u, q.senha);
  u.trocar_senha = 'Sim';
  U.update(u);
  log_(ctx, 'usuario_senha', u.login);
  return { msg: 'Senha provisória definida. ' + u.nome + ' vai trocar no próximo acesso.' };
}

function adminObraCriar_(q, ctx) {
  const o = criarObra_(q.nome, q.sigla, q.endereco);
  if (q.email_financeiro) { o.email_financeiro = String(q.email_financeiro).trim(); central_('Obras').update(o); }
  log_(ctx, 'obra_criar', o.nome);
  return { msg: 'Obra ' + o.nome + ' criada com a planilha e a pasta no Drive.', id: o.id };
}

function adminObraSalvar_(q, ctx) {
  const O = central_('Obras'), o = O.all().find(x => String(x.id) === String(q.id));
  if (!o) throw new Error('Obra não encontrada.');
  const nome = String(q.nome || '').trim();
  if (!nome) throw new Error('Informe o nome da obra.');
  o.nome = nome;
  o.endereco = String(q.endereco || '').trim();
  o.email_financeiro = String(q.email_financeiro || '').trim();
  o.ativa = sim_(q.ativa) ? 'Sim' : 'Não';
  O.update(o);
  return { msg: 'Obra salva.' };
}

function adminConfigSalvar_(q, ctx) {
  const C = central_('Config'), dados = q.config || {};
  Object.keys(dados).forEach(k => {
    const r = C.all().find(x => String(x.chave) === k);
    if (r) { r.valor = dados[k]; C.update(r); } else C.insert({ chave: k, valor: dados[k], descricao: '' });
  });
  if (q.unidades) {
    const T = central_('Unidades');
    T.removeWhere(() => true);
    T.insertMany([].concat(q.unidades).map(s => String(s).trim()).filter(Boolean).map(u => ({ unidade: u })));
  }
  log_(ctx, 'config', JSON.stringify(dados).slice(0, 300));
  return { msg: 'Configurações salvas.' };
}

function adminPerfilSalvar_(q, ctx) {
  const P = central_('Perfis'), nome = String(q.perfil || '').trim();
  if (!nome) throw new Error('Informe o nome do perfil.');
  let p = P.all().find(x => norm_(x.perfil) === norm_(nome));
  const novo = !p;
  if (novo) p = { perfil: nome };
  p.permissoes = [].concat(q.permissoes || []).filter(x => PERMISSOES[x]).join(',');
  p.descricao = String(q.descricao || p.descricao || '').trim();
  if (novo) P.insert(p); else P.update(p);
  return { msg: 'Perfil ' + nome + ' salvo. (Usuários já cadastrados mantêm as permissões atuais.)' };
}

function adminPadraoSalvar_(q, ctx) {
  const T = central_('MateriaisPadrao'), desc = String(q.descricao || '').trim();
  if (!desc) throw new Error('Informe a descrição do material.');
  let m = q.codigo ? T.all().find(x => String(x.codigo) === String(q.codigo)) : null;
  if (T.all().some(x => x !== m && norm_(x.descricao) === norm_(desc))) throw new Error('Material padrão já cadastrado.');
  const novo = !m;
  if (novo) m = { codigo: T.proxCodigo('codigo', 'M', 4) };
  m.descricao = desc;
  m.unidade = String(q.unidade || '').trim();
  m.categoria = String(q.categoria || '').trim();
  if (novo) T.insert(m); else T.update(m);
  return { msg: 'Material padrão salvo (' + m.codigo + '). Vale para as próximas obras criadas.' };
}

function adminPadraoExcluir_(q, ctx) {
  const n = central_('MateriaisPadrao').removeWhere(x => String(x.codigo) === String(q.codigo));
  if (!n) throw new Error('Material não encontrado.');
  return { msg: 'Material removido da lista padrão.' };
}
