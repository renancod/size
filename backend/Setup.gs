/**
 * PRIMEIRA INSTALAÇÃO: rode instalarTudo() no editor (uma vez). Ele faz, nesta ordem:
 *  1. setup()            → cria a planilha central "Size · Cadastros", a pasta "Compras Size" e o usuário admin
 *                          (a senha provisória aparece no "Registro de execução").
 *  2. migrarPrimeBeach() → cria a obra Prime Beach e importa pedidos, fornecedores, materiais,
 *                          edificações (viram frentes de trabalho) e usuários da planilha antiga "Pedidos_Size".
 *  3. instalarGatilho()  → leitura automática dos e-mails (orçamentos e notas) a cada 10 min.
 * Depois: Implantar > Nova implantação > App da Web (executar como Eu, acesso Qualquer pessoa)
 * e cole a URL em config.js do app.
 */
const ID_PLANILHA_ANTIGA = '1zhKNyU-EdqdREuX3hkDY7euiWU0p5K1HoRPW_O3dRug'; // Pedidos_Size

function instalarTudo() {
  setup();
  migrarPrimeBeach();
  instalarGatilho();
  Logger.log('Pronto. Agora: Implantar > Nova implantação > App da Web.');
}

const CONFIG_PADRAO = [
  ['EMPRESA', 'Size Engenharia', 'Nome que aparece nos e-mails'],
  ['MIN_ORCAMENTOS', 1, 'Mínimo de orçamentos (fornecedores diferentes) para definir uma compra'],
  ['REGRAS_ORCAMENTO', '', 'Faixas por valor, ex: 5000:2; 20000:3 (a partir de R$ 5.000 exige 2; de R$ 20.000 exige 3)'],
  ['PRAZO_FATURADO_PADRAO', 30, 'Prazo padrão (dias) do faturamento'],
  ['EMAIL_FINANCEIRO', '', 'E-mail(s) do financeiro, separados por vírgula (aviso de pagamento pendente)'],
  ['APP_URL', 'https://renancod.github.io/size/', 'Endereço do app (ex: https://renancod.github.io/size/) para links nos e-mails'],
  ['FRENTES_PADRAO', 'Canteiro; Fundação; Estrutura; Alvenaria; Instalações elétricas; Instalações hidrossanitárias; Cobertura; Revestimentos; Pintura; Acabamento', 'Frentes de trabalho criadas em toda obra nova (separe com ;)']
];
const UNIDADES_PADRAO = ['un', 'pç', 'm', 'm²', 'm³', 'kg', 't', 'sc', 'L', 'gl', 'lata', 'cx', 'rolo', 'barra', 'par', 'jg', 'vb', 'h', 'dia', 'mês'];

function setup() {
  const pr = PropertiesService.getScriptProperties();
  if (!pr.getProperty('CENTRAL_ID')) {
    const novo = SpreadsheetApp.create('Size · Cadastros (Compras)');
    pr.setProperty('CENTRAL_ID', novo.getId());
    DriveApp.getFileById(novo.getId()).moveTo(raizPasta_());
  }
  const ss = centralSS_();
  Object.keys(SCHEMA_CENTRAL).forEach(n => central_(n));
  limparAbaPadrao_(ss);

  const C = central_('Config'), tem = C.all().map(r => String(r.chave));
  C.insertMany(CONFIG_PADRAO.filter(c => tem.indexOf(c[0]) < 0).map(c => ({ chave: c[0], valor: c[1], descricao: c[2] })));
  const P = central_('Perfis');
  if (!P.all().length) {
    P.insertMany(PERFIS_PADRAO.map(p => ({ perfil: p[0], permissoes: p[1], descricao: p[2] })));
    C.insert({ chave: 'PERFIS_V2', valor: 'Sim', descricao: 'Perfis já criados no formato atual' });
  }
  const Un = central_('Unidades');
  if (!Un.all().length) Un.insertMany(UNIDADES_PADRAO.map(u => ({ unidade: u })));

  const U = central_('Usuarios');
  if (!U.all().length) {
    const senha = 'Size' + Math.floor(100000 + Math.random() * 900000);
    const u = { id: 'U001', nome: 'Administrador', login: 'admin', admin: 'Sim', ativo: 'Sim', trocar_senha: 'Sim', criado_em: new Date() };
    definirSenha_(u, senha);
    U.insert(u);
    Logger.log('USUÁRIO: admin   SENHA PROVISÓRIA: ' + senha + '   (troque no primeiro acesso)');
  }
  segredo_();
  Logger.log('Planilha central: ' + ss.getUrl());
  Logger.log('Pasta no Drive: ' + raizPasta_().getUrl());
}

function limparAbaPadrao_(ss) {
  ss.getSheets().forEach(sh => {
    if (ss.getSheets().length > 1 && /^(Sheet1|Página1|Planilha1|Folha1)$/.test(sh.getName()) && sh.getLastRow() === 0) ss.deleteSheet(sh);
  });
}

/* ---------- obras ---------- */
function criarObra_(nome, sigla, endereco) {
  nome = String(nome || '').trim();
  sigla = norm_(sigla).toUpperCase().replace(/[^A-Z]/g, '');
  if (!nome) throw new Error('Informe o nome da obra.');
  if (sigla.length < 2 || sigla.length > 5) throw new Error('A sigla precisa ter de 2 a 5 letras (ex: PB). Ela vira o prefixo dos pedidos: PB-0001.');
  const O = central_('Obras');
  if (O.all().some(o => String(o.sigla).toUpperCase() === sigla)) throw new Error('Já existe uma obra com a sigla ' + sigla + '.');
  if (O.all().some(o => norm_(o.nome) === norm_(nome))) throw new Error('Já existe uma obra com esse nome.');

  const pasta = raizPasta_().createFolder(nome);
  const ss = SpreadsheetApp.create('Obra · ' + nome);
  DriveApp.getFileById(ss.getId()).moveTo(pasta);
  const ctx = { ss: ss };
  Object.keys(SCHEMA_OBRA).forEach(n => obraTab_(ctx, n));
  limparAbaPadrao_(ss);

  obraTab_(ctx, 'Materiais').insertMany(central_('MateriaisPadrao').all().map(m => ({
    codigo: m.codigo, descricao: m.descricao, unidade: m.unidade, categoria: m.categoria, estoque_min: '', ativo: 'Sim'
  })));
  const frentes = String(config_().FRENTES_PADRAO || '').split(';').map(s => s.trim()).filter(Boolean);
  obraTab_(ctx, 'Frentes').insertMany(frentes.map((f, i) => ({ codigo: 'FR' + ('0' + (i + 1)).slice(-2), nome: f, descricao: '', ativa: 'Sim' })));

  return O.insert({
    id: O.proxCodigo('id', 'OB', 3), sigla: sigla, nome: nome, endereco: String(endereco || '').trim(), ativa: 'Sim',
    planilha_id: ss.getId(), pasta_id: pasta.getId(), criada_em: new Date()
  });
}

/* ---------- migração da planilha antiga "Pedidos Size" ---------- */
function migrarPrimeBeach() {
  migrarPlanilhaAntiga_(ID_PLANILHA_ANTIGA, 'Prime Beach', 'PB');
}

function abaAntiga_(ss, nomes) {
  const sh = ss.getSheets().find(s => nomes.some(n => norm_(s.getName()).indexOf(n) >= 0));
  return sh ? sh.getDataRange().getValues().slice(1).filter(r => r.some(x => x !== '')) : [];
}

function migrarPlanilhaAntiga_(idAntigo, nomeObra, sigla) {
  if (!idAntigo || /COLE_AQUI/.test(idAntigo)) throw new Error('Preencha ID_PLANILHA_ANTIGA no topo do Setup.gs (o código entre /d/ e /edit na URL da planilha).');
  const velha = SpreadsheetApp.openById(idAntigo);
  let obra = central_('Obras').all().find(o => String(o.sigla).toUpperCase() === sigla);
  if (!obra) obra = criarObra_(nomeObra, sigla, '');
  const ctx = { u: { id: '', nome: 'Migração' }, obra: obra, ss: SpreadsheetApp.openById(obra.planilha_id), perms: [], admin: true };

  // unidades (1ª coluna da aba Listas)
  const Un = central_('Unidades'), uns = Un.all().map(r => norm_(r.unidade));
  const novasUn = [];
  abaAntiga_(velha, ['lista']).forEach(r => {
    const u = String(r[0]).trim();
    if (u && uns.indexOf(norm_(u)) < 0) { uns.push(norm_(u)); novasUn.push({ unidade: u }); }
  });
  Un.insertMany(novasUn);

  // materiais → lista padrão da empresa + obra
  const MP = central_('MateriaisPadrao'), M = obraTab_(ctx, 'Materiais');
  abaAntiga_(velha, ['materia']).forEach(r => {
    const d = String(r[0]).trim();
    if (!d) return;
    let mp = MP.all().find(x => norm_(x.descricao) === norm_(d));
    if (!mp) mp = MP.insert({ codigo: MP.proxCodigo('codigo', 'M', 4), descricao: d, unidade: String(r[1] || '').trim(), categoria: '' });
    if (!M.all().some(x => norm_(x.descricao) === norm_(d))) M.insert({ codigo: mp.codigo, descricao: d, unidade: mp.unidade, categoria: '', estoque_min: '', ativo: 'Sim' });
  });

  // fornecedores (código, nome, cnpj, contato, telefone, email, cidade, materiais, condição, obs, ativo)
  const F = obraTab_(ctx, 'Fornecedores');
  abaAntiga_(velha, ['fornecedor']).forEach(r => {
    const nome = String(r[1] || '').trim();
    if (!nome || F.all().some(x => norm_(x.nome) === norm_(nome))) return;
    const cod = String(r[0] || '').trim();
    F.insert({
      codigo: cod && !F.all().some(x => String(x.codigo) === cod) ? cod : F.proxCodigo('codigo', 'F', 3),
      nome: nome, cnpj: r[2], contato: r[3], telefone: r[4], email: r[5], cidade: r[6], materiais: r[7], condicao: r[8], obs: r[9],
      ativo: r[10] === '' || sim_(r[10]) ? 'Sim' : 'Não'
    });
  });

  // edificações / centros de custo (aba Obras) → frentes de trabalho
  const Fr = obraTab_(ctx, 'Frentes');
  abaAntiga_(velha, ['obra']).forEach(r => {
    const nome = String(r[0]).trim();
    if (!nome || Fr.all().some(x => norm_(x.nome) === norm_(nome))) return;
    Fr.insert({ codigo: Fr.proxCodigo('codigo', 'FR', 2), nome: nome, descricao: 'Edificação / centro de custo', ativa: r[1] === '' || sim_(r[1]) ? 'Sim' : 'Não' });
  });

  // usuários (aba Acessos: nome, senha, perfil, ativo) → mesmo login e senha, com troca obrigatória no 1º acesso
  const U = central_('Usuarios'), A = central_('Acessos'), perfis = central_('Perfis').all();
  abaAntiga_(velha, ['acesso']).forEach(r => {
    const nome = String(r[0]).trim(), login = norm_(nome).replace(/\s+/g, '.');
    if (!nome || !String(r[1]) || U.all().some(x => norm_(x.login) === login)) return;
    const perfil = perfis.find(p => norm_(p.perfil) === norm_(r[2])) || perfis.find(p => p.perfil === 'Solicitante');
    const u = { id: U.proxCodigo('id', 'U', 3), nome: nome, login: login, admin: 'Não', ativo: r[3] === '' || sim_(r[3]) ? 'Sim' : 'Não', trocar_senha: 'Sim', criado_em: new Date(), salt: Utilities.getUuid() };
    u.senha_hash = hash_(String(r[1]).trim(), u.salt);
    U.insert(u);
    A.insert({ usuario_id: u.id, usuario: nome, obra_id: obra.id, obra: obra.nome, perfil: perfil.perfil, permissoes: perfil.permissoes });
    Logger.log('Usuário migrado: ' + login + ' (' + perfil.perfil + ') — mesma senha de antes, troca no 1º acesso');
  });

  // pedidos: cada linha antiga vira um pedido com 1 item
  const P = obraTab_(ctx, 'Pedidos'), I = obraTab_(ctx, 'Itens');
  const ja = P.all().map(p => String(p.numero));
  const ped = [], itens = [];
  abaAntiga_(velha, ['pedido']).forEach(r => {
    const num = String(r[0]).trim();
    if (!num || ja.indexOf(num) >= 0) return;
    const st = String(r[11] || 'Aberto').trim(), pag = String(r[20] || ''), aprovFin = /^Aprovado/i.test(String(r[21] || ''));
    const cond = String(r[24] || '');
    const direto = /direto/i.test(pag) || /direto|antecipad|à vista|a vista/i.test(cond);
    const lib = r[23] instanceof Date || String(r[23]).trim() !== '';
    const p = {
      numero: num, criado_em: r[1] instanceof Date ? r[1] : '', solicitante: r[2], frente: r[3] || r[4],
      solicitante_id: (U.all().find(x => norm_(x.nome) === norm_(r[2])) || {}).id || '',
      prioridade: r[8] || 'Normal', necessidade: r[9], observacoes: [r[4] ? 'Etapa: ' + r[4] : '', r[10]].filter(String).join(' · '),
      status: st, entrega: '', fin: '', cotado_a: r[22], fornecedor: r[12], valor_total: r[13], previsao: r[16],
      condicao: '', prazo_fat: '', forma_pagto: pag, pago_em: r[15], recebido_em: r[17], liberado_em: r[23], pasta_url: r[19],
      historico: 'Migrado da planilha antiga em ' + hoje_() + (r[18] ? '\nHistórico antigo: ' + r[18] : ''), atualizado_em: new Date()
    };
    if (p.fornecedor) {
      const f = F.all().find(x => norm_(x.nome) === norm_(p.fornecedor));
      p.fornecedor_cod = f ? f.codigo : '';
      p.condicao = direto ? 'Faturamento direto' : 'Faturado';
      p.prazo_fat = direto ? '' : (parseInt(String(pag + ' ' + cond).replace(/\D+/g, ' ').trim().split(' ')[0], 10) || 30);
    }
    let recebido = 0;
    if (st === 'Comprado') {
      if (!aprovFin) { p.status = 'Aguardando aprovação'; p.historico += '\nConferir condição de pagamento antes de aprovar.'; }
      else if (direto) { p.status = 'Aprovado'; p.fin = 'Pago'; p.entrega = lib ? 'Entrega liberada' : 'Aguardando liberação'; }
      else { p.status = 'Aprovado'; p.fin = 'Aguardando NF'; p.entrega = lib ? 'Entrega liberada' : 'Aguardando liberação'; }
    } else if (st === 'Pago') {
      p.status = 'Aprovado'; p.fin = 'Pago'; p.entrega = lib ? 'Entrega liberada' : 'Aguardando liberação';
    } else if (st === 'Entregue') {
      recebido = num_(r[6]);
      p.entrega = 'Recebido';
      if (r[15] instanceof Date || direto) { p.status = 'Concluído'; p.fin = 'Pago'; } else { p.status = 'Aprovado'; p.fin = 'Aguardando NF'; }
    } else if (['Aberto', 'Em cotação', 'Cancelado'].indexOf(st) < 0) {
      p.status = 'Aberto';
    }
    ped.push(p);
    itens.push({ pedido: num, item: 1, material_cod: (M.all().find(x => norm_(x.descricao) === norm_(r[5])) || {}).codigo || '', descricao: String(r[5]).trim(), unidade: r[7], qtd: num_(r[6]), qtd_recebida: recebido, valor_unit: '' });
  });
  P.insertMany(ped);
  I.insertMany(itens);
  Logger.log('Obra ' + obra.nome + ': ' + ped.length + ' pedido(s), ' + F.all().length + ' fornecedor(es), ' + M.all().length + ' material(is).');
  Logger.log('Planilha da obra: ' + ctx.ss.getUrl());
}
