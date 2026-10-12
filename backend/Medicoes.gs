/**
 * MEDIÇÕES de empreiteiros.
 *
 * Regras combinadas:
 *  - cada frente de trabalho (etapa) tem um empreiteiro (uma "equipe" com os dados da empresa) e, opcionalmente, um contrato
 *    (número e data) que aparece na medição; a medição de um empreiteiro soma as frentes dele;
 *  - só entra serviço CONCLUÍDO (executado ≥ previsto) e com FVS APROVADA; entra uma única vez, inteiro, no período em que foi
 *    concluído, pela quantidade EXECUTADA (mesmo que passe do previsto);
 *  - se um serviço já medido receber mais lançamentos depois, a diferença entra como "complemento" na medição seguinte;
 *  - fluxo: rascunho → aguardando aprovação → aprovada (numerada por empreiteiro, travada, PDF no Drive) → paga;
 *    quem lança (medicao_lancar) e quem aprova (medicao_aprovar) são permissões por obra; o sino avisa quem aprova;
 *  - rascunho e devolvida NÃO reservam serviços; aguardando, aprovada e paga reservam (não entram em outra medição).
 */
const MED_ST_ = { rasc: 'Rascunho', aprov: 'Aguardando aprovação', ok: 'Aprovada', dev: 'Devolvida', paga: 'Paga', canc: 'Cancelada' };
const MED_RESERVA_ = [MED_ST_.aprov, MED_ST_.ok, MED_ST_.paga];
const numMed_ = n => 'Medição ' + ('00' + n).slice(-3);

function medEmpreiteiro_(ctx, cod) {
  const e = obraTab_(ctx, 'Equipes').all().find(x => String(x.codigo) === String(cod));
  if (!e) throw new Error('Empreiteiro não encontrado.');
  return e;
}
function medContratoTxt_(e) {
  if (e.contrato_tipo === 'Com contrato') return 'Contrato nº ' + e.contrato_numero + (e.contrato_data ? ' de ' + dataTxt_(ymd_(e.contrato_data)) : '');
  if (e.contrato_tipo === 'Sem contrato') return 'Sem contrato';
  return '';
}
/* a frente já tem serviço em medição que reserva (usado para travar a troca de empreiteiro) */
function medEtapaMedida_(ctx, etapaCod) {
  const ativas = {};
  obraTab_(ctx, 'Medicoes').all().forEach(m => { if (MED_RESERVA_.indexOf(m.status) >= 0) ativas[m.id] = 1; });
  return obraTab_(ctx, 'MedicaoItens').all().some(i => ativas[i.medicao] && String(i.etapa) === String(etapaCod));
}
/* quanto de cada serviço já está reservado por medições enviadas/aprovadas/pagas (menos a medição `exceto`) */
function medReservado_(ctx, exceto) {
  const ativas = {};
  obraTab_(ctx, 'Medicoes').all().forEach(m => { if (MED_RESERVA_.indexOf(m.status) >= 0 && String(m.id) !== String(exceto)) ativas[m.id] = 1; });
  const r = {};
  obraTab_(ctx, 'MedicaoItens').all().forEach(i => { if (ativas[i.medicao]) r[i.item_id] = (r[i.item_id] || 0) + num_(i.qtd); });
  return r;
}

/* serviços do empreiteiro: prontos para medir no período × pendentes (com o motivo) */
function medApurar_(ctx, empCod, de, ate, exceto) {
  const c = calcExec_(ctx), prod = obraTab_(ctx, 'Producao').all(), fvs = obraTab_(ctx, 'Fvs').all().filter(f => f.status !== FVS_ST_.canc);
  const reservado = medReservado_(ctx, exceto), elegiveis = [], pendentes = [];
  c.etapas.filter(e => e.ativa && String(e.empreiteiro) === String(empCod)).forEach(e => {
    e.itens.forEach(i => {
      if (i.situacao !== 'concluido') return;
      const linhas = prod.filter(p => String(p.item_id) === String(i.id) && num_(p.qtd) > 0).sort((a, b) => ymd_(a.data).localeCompare(ymd_(b.data)));
      if (!linhas.length) return;
      let acum = 0, concl = '';
      linhas.forEach(p => { acum += num_(p.qtd); if (!concl && acum >= num_(i.prevista) - 0.0001) concl = ymd_(p.data); });
      const ultimo = ymd_(linhas[linhas.length - 1].data), medido = reservado[i.id] || 0, resto = r2_(i.executado - medido);
      if (resto <= 0.0001) return;                                  // já medido por inteiro
      const complemento = medido > 0, ref = complemento ? ultimo : (concl || ultimo);
      if (ref < de || ref > ate) return;                            // não foi concluído neste período
      const porRdo = {};
      linhas.forEach(p => { const k = num_(p.diario); porRdo[k] = porRdo[k] || { rdo: k, data: ymd_(p.data), qtd: 0 }; porRdo[k].qtd = r2_(porRdo[k].qtd + num_(p.qtd)); });
      const dias = Object.keys(porRdo).map(k => porRdo[k]).sort((a, b) => a.rdo - b.rdo);
      const fi = fvs.filter(f => String(f.item_id) === String(i.id));
      const linha = {
        item_id: i.id, etapa: e.codigo, etapa_nome: e.nome, etapa_local: e.local, servico: i.servico, unidade: i.unidade, qtd: resto, executado: i.executado, prevista: i.prevista,
        concluido_em: concl || ultimo, complemento: complemento, contrato: medContratoTxt_(e), dias: dias, rdos: dias.map(d => d.rdo),
        fvs: fi.filter(f => f.numero !== '').map(f => numFvs_(num_(f.numero))).join(', ')
      };
      const naoAprov = fi.filter(f => f.status !== FVS_ST_.ok);
      if (!fi.length) pendentes.push(Object.assign(linha, { motivo: 'sem FVS — todo serviço concluído precisa de FVS aprovada' }));
      else if (naoAprov.length) pendentes.push(Object.assign(linha, { motivo: 'FVS ainda não aprovada (' + naoAprov.map(f => (f.numero !== '' ? numFvs_(num_(f.numero)) : f.modelo) + ': ' + f.status.toLowerCase()).join('; ') + ')' }));
      else elegiveis.push(linha);
    });
  });
  const ord = (a, b) => String(a.concluido_em).localeCompare(String(b.concluido_em)) || String(a.etapa_nome).localeCompare(String(b.etapa_nome));
  return { elegiveis: elegiveis.sort(ord), pendentes: pendentes.sort(ord) };
}
function medPrever_(q, ctx) {
  const emp = medEmpreiteiro_(ctx, q.empreiteiro), de = ymd_(q.de), ate = ymd_(q.ate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) throw new Error('Escolha o período da medição.');
  if (ate < de) throw new Error('A data final está antes da inicial.');
  return Object.assign({ empreiteiro: { codigo: emp.codigo, nome: emp.nome, empresa: emp.empresa || '' } }, medApurar_(ctx, emp.codigo, de, ate, q.id));
}

/* ---------- leitura ---------- */
function medPub_(m, nItens) {
  return {
    id: m.id, numero: m.numero === '' ? '' : num_(m.numero), numero_txt: m.numero === '' ? '' : numMed_(num_(m.numero)), empreiteiro: m.empreiteiro, empreiteiro_nome: m.empreiteiro_nome,
    de: ymd_(m.de), ate: ymd_(m.ate), status: m.status, obs: m.obs || '', criado_por: m.criado_por, criado_em: fmtVal_(m.criado_em), enviado_por: m.enviado_por, enviado_em: fmtVal_(m.enviado_em),
    aprovado_por: m.aprovado_por, aprovado_em: fmtVal_(m.aprovado_em), pago_em: ymd_(m.pago_em), motivo: m.motivo || '', itens: nItens
  };
}
function medListar_(q, ctx) {
  const M = obraTab_(ctx, 'Medicoes').all(), I = obraTab_(ctx, 'MedicaoItens').all(), n = {};
  I.forEach(i => { n[i.medicao] = (n[i.medicao] || 0) + 1; });
  const lista = M.map(m => medPub_(m, n[m.id] || 0)).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
  const calc = calcExec_(ctx);
  const emps = obraTab_(ctx, 'Equipes').all().filter(e => !/^n/i.test(String(e.ativa))).map(e => {
    const ms = lista.filter(m => m.empreiteiro === e.codigo && m.status !== MED_ST_.canc);
    const reserv = ms.filter(m => MED_RESERVA_.indexOf(m.status) >= 0), pagas = ms.filter(m => m.status === MED_ST_.paga);
    const ap = medApurar_(ctx, e.codigo, '0000-01-01', '9999-12-31', '');
    return {
      codigo: e.codigo, nome: e.nome, empresa: e.empresa || '', responsavel: e.responsavel || '', telefone: e.telefone || '',
      medido_ate: reserv.map(m => m.ate).sort().pop() || '', pago_ate: pagas.map(m => m.ate).sort().pop() || '',
      a_medir: ap.elegiveis.length, aguardando_fvs: ap.pendentes.length,
      frentes: calc.etapas.filter(x => x.ativa && String(x.empreiteiro) === String(e.codigo)).length
    };
  });
  return { medicoes: lista, empreiteiros: emps, pode_lancar: pode_(ctx, 'medicao_lancar'), pode_aprovar: pode_(ctx, 'medicao_aprovar') };
}
function medDetalhe_(q, ctx) {
  const m = obraTab_(ctx, 'Medicoes').all().find(x => String(x.id) === String(q.id));
  if (!m) throw new Error('Medição não encontrada.');
  const itens = obraTab_(ctx, 'MedicaoItens').all().filter(i => String(i.medicao) === String(m.id)).map(i => ({
    item_id: i.item_id, etapa: i.etapa, etapa_nome: i.etapa_nome, servico: i.servico, unidade: i.unidade, qtd: num_(i.qtd), concluido_em: ymd_(i.concluido_em), complemento: sim_(i.complemento),
    contrato: i.contrato || '', fvs: i.fvs || '', rdos: json_(i.rdos_json, []), dias: json_(i.dias_json, [])
  }));
  const emp = obraTab_(ctx, 'Equipes').all().find(x => String(x.codigo) === String(m.empreiteiro)) || {};
  const totais = {};
  itens.forEach(i => { const k = i.servico + '|' + i.unidade; totais[k] = totais[k] || { servico: i.servico, unidade: i.unidade, qtd: 0 }; totais[k].qtd = r2_(totais[k].qtd + i.qtd); });
  const prox = obraTab_(ctx, 'Medicoes').all().filter(x => String(x.empreiteiro) === String(m.empreiteiro)).reduce((t, x) => Math.max(t, num_(x.numero)), 0) + 1;
  const base = medPub_(m, itens.length);
  return Object.assign(base, {
    itens: itens, totais: Object.keys(totais).map(k => totais[k]).sort((a, b) => a.servico.localeCompare(b.servico)), historico: json_(m.historico_json, []), hash: m.hash || '', auto_aprovada: sim_(m.auto_aprovada),
    pago_obs: m.pago_obs || '', pasta_url: m.pasta_id ? 'https://drive.google.com/drive/folders/' + m.pasta_id : '', pdf_id: m.pdf_id || '', proximo_numero: prox,
    emp: { codigo: emp.codigo, nome: emp.nome || m.empreiteiro_nome, empresa: emp.empresa || '', responsavel: emp.responsavel || '', telefone: emp.telefone || '', email: emp.email || '', documento: emp.documento || '' },
    obra: { nome: ctx.obra.nome, sigla: ctx.obra.sigla, endereco: ctx.obra.endereco }, empresa: config_().EMPRESA || 'Size Engenharia',
    editavel: [MED_ST_.rasc, MED_ST_.dev].indexOf(m.status) >= 0 && pode_(ctx, 'medicao_lancar'),
    pode_aprovar: m.status === MED_ST_.aprov && pode_(ctx, 'medicao_aprovar'), pode_lancar: pode_(ctx, 'medicao_lancar')
  });
}

/* ---------- montar (rascunho) ---------- */
function medHist_(m, ctx, acao, nota) {
  const h = json_(m.historico_json, []);
  h.push({ q: Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), por: ctx.u.nome, acao: acao, nota: String(nota || '').slice(0, 300) });
  m.historico_json = JSON.stringify(h);
  m.atualizado_em = new Date();
}
function medGravarItens_(ctx, m, escolhidos, de, ate) {
  const ap = medApurar_(ctx, m.empreiteiro, de, ate, m.id), pedidos = [].concat(escolhidos || ap.elegiveis.map(x => x.item_id)).map(String);
  const sel = ap.elegiveis.filter(x => pedidos.indexOf(String(x.item_id)) >= 0);
  if (!sel.length) throw new Error('Nenhum serviço pronto para medir nesse período (concluído e com FVS aprovada).');
  const T = obraTab_(ctx, 'MedicaoItens');
  T.removeWhere(i => String(i.medicao) === String(m.id));
  T.insertMany(sel.map(x => ({
    medicao: m.id, item_id: x.item_id, etapa: x.etapa, etapa_nome: x.etapa_nome + (x.etapa_local ? ' · ' + x.etapa_local : ''), servico: x.servico, unidade: x.unidade, qtd: x.qtd, concluido_em: dataDe_(x.concluido_em),
    complemento: x.complemento ? 'Sim' : '', contrato: x.contrato, fvs: x.fvs, rdos_json: JSON.stringify(x.rdos), dias_json: JSON.stringify(x.dias)
  })));
  return sel.length;
}
function medCriar_(q, ctx) {
  const emp = medEmpreiteiro_(ctx, q.empreiteiro), de = ymd_(q.de), ate = ymd_(q.ate), M = obraTab_(ctx, 'Medicoes');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || ate < de) throw new Error('Escolha o período da medição.');
  const m = M.insert({
    id: 'MD-' + Utilities.getUuid().slice(0, 6), numero: '', empreiteiro: emp.codigo, empreiteiro_nome: emp.nome, de: dataDe_(de), ate: dataDe_(ate), status: MED_ST_.rasc, obs: String(q.obs || '').slice(0, 1500),
    historico_json: '[]', criado_em: new Date(), criado_por: ctx.u.nome, atualizado_em: new Date()
  });
  const n = medGravarItens_(ctx, m, q.itens, de, ate);
  medHist_(m, ctx, 'Rascunho criado', n + (n === 1 ? ' serviço' : ' serviços') + ' · ' + dataTxt_(de) + ' a ' + dataTxt_(ate));
  M.update(m);
  log_(ctx, 'medicao_criar', m.id + ' ' + emp.nome);
  return { msg: 'Rascunho da medição criado com ' + n + (n === 1 ? ' serviço.' : ' serviços.'), id: m.id };
}
function medAchar_(ctx, id, estados) {
  const T = obraTab_(ctx, 'Medicoes'), m = T.all().find(x => String(x.id) === String(id));
  if (!m) throw new Error('Medição não encontrada.');
  if (estados && estados.indexOf(m.status) < 0) throw new Error('Esta medição está "' + m.status + '" e não pode ser alterada agora.');
  return { T: T, m: m };
}
function medSalvar_(q, ctx) {
  const a = medAchar_(ctx, q.id, [MED_ST_.rasc, MED_ST_.dev]), m = a.m, de = ymd_(q.de || m.de), ate = ymd_(q.ate || m.ate);
  if (ate < de) throw new Error('A data final está antes da inicial.');
  const n = medGravarItens_(ctx, m, q.itens, de, ate);
  m.de = dataDe_(de); m.ate = dataDe_(ate); if (q.obs !== undefined) m.obs = String(q.obs || '').slice(0, 1500);
  medHist_(m, ctx, 'Rascunho atualizado', n + (n === 1 ? ' serviço' : ' serviços'));
  a.T.update(m);
  return { msg: 'Rascunho salvo.' };
}

/* ---------- fluxo ---------- */
function medEnviar_(q, ctx) {
  const a = medAchar_(ctx, q.id, [MED_ST_.rasc, MED_ST_.dev]), m = a.m, de = ymd_(m.de), ate = ymd_(m.ate);
  const ap = medApurar_(ctx, m.empreiteiro, de, ate, m.id), prontos = {};
  ap.elegiveis.forEach(x => { prontos[x.item_id] = x; });
  const itens = obraTab_(ctx, 'MedicaoItens').all().filter(i => String(i.medicao) === String(m.id));
  if (!itens.length) throw new Error('A medição não tem serviços.');
  const mudou = itens.filter(i => !prontos[i.item_id] || Math.abs(prontos[i.item_id].qtd - num_(i.qtd)) > 0.0001);
  if (mudou.length) throw new Error('Mudou algo desde que o rascunho foi montado (' + mudou.map(i => i.servico).join(', ') + '): salve o rascunho de novo para recalcular.');
  m.status = MED_ST_.aprov; m.enviado_em = new Date(); m.enviado_por = ctx.u.nome; m.motivo = '';
  medHist_(m, ctx, 'Enviada para aprovação', itens.length + ' serviço(s)');
  a.T.update(m);
  log_(ctx, 'medicao_enviar', m.id);
  return { msg: 'Medição enviada para aprovação.' };
}
function medDevolver_(q, ctx) {
  const a = medAchar_(ctx, q.id, [MED_ST_.aprov]), m = a.m, motivo = String(q.motivo || '').trim();
  if (motivo.length < 5) throw new Error('Explique o motivo da devolução.');
  m.status = MED_ST_.dev; m.motivo = motivo;
  medHist_(m, ctx, 'Devolvida', motivo);
  a.T.update(m);
  return { msg: 'Medição devolvida para ajustes.' };
}
function medAprovar_(q, ctx) {
  const a = medAchar_(ctx, q.id, [MED_ST_.aprov]), m = a.m, T = a.T;
  if (!q.pdf || !q.pdf.b64) throw new Error('O PDF da medição não foi gerado. Tente de novo.');
  if (q.pdf.b64.length > 14000000) throw new Error('PDF grande demais.');
  const bytes = Utilities.base64Decode(q.pdf.b64);
  if (String.fromCharCode.apply(null, bytes.slice(0, 4).map(b => b & 255)) !== '%PDF') throw new Error('Arquivo inválido: não é um PDF.');
  // confere de novo se nada mudou (outra medição pode ter reservado os mesmos serviços)
  const ap = medApurar_(ctx, m.empreiteiro, ymd_(m.de), ymd_(m.ate), m.id), prontos = {};
  ap.elegiveis.forEach(x => { prontos[x.item_id] = x.qtd; });
  const itens = obraTab_(ctx, 'MedicaoItens').all().filter(i => String(i.medicao) === String(m.id));
  const ruim = itens.filter(i => prontos[i.item_id] === undefined || Math.abs(prontos[i.item_id] - num_(i.qtd)) > 0.0001);
  if (ruim.length) throw new Error('Os serviços mudaram desde o envio (' + ruim.map(i => i.servico).join(', ') + '). Devolva para recalcular.');
  const agora = new Date();
  if (m.numero === '' || m.numero == null) {
    m.numero = T.all().filter(x => String(x.empreiteiro) === String(m.empreiteiro)).reduce((t, x) => Math.max(t, num_(x.numero)), 0) + 1;
    if (q.numero_previsto && num_(q.numero_previsto) !== num_(m.numero)) { m.numero = ''; throw new Error('Outra medição deste empreiteiro foi aprovada enquanto você conferia e o número mudou. Aprove de novo para gerar o PDF com o número certo.'); }
  }
  const numTxt = numMed_(num_(m.numero));
  m.aprovado_por = ctx.u.nome; m.aprovado_em = agora; m.status = MED_ST_.ok; m.motivo = '';
  m.auto_aprovada = String(m.enviado_por || '') === ctx.u.nome ? 'Sim' : '';
  m.hash = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify([m.id, m.numero, m.empreiteiro, ymd_(m.de), ymd_(m.ate), itens.map(i => [i.item_id, num_(i.qtd), i.complemento, i.fvs, i.rdos_json]), m.aprovado_por, fmtVal_(agora)]), Utilities.Charset.UTF_8));
  // Drive: obra → Medições → empreiteiro → "Medição 001 · período" com o PDF
  const raiz = subpasta_(subpasta_(pastaObra_(ctx), 'Medições'), nomeArq_(m.empreiteiro_nome || m.empreiteiro));
  const pasta = subpasta_(raiz, numTxt + ' · ' + dataTxt_(ymd_(m.de)).replace(/\//g, '-') + ' a ' + dataTxt_(ymd_(m.ate)).replace(/\//g, '-'));
  const pdf = pasta.createFile(Utilities.newBlob(bytes, 'application/pdf', numTxt + ' · ' + nomeArq_(m.empreiteiro_nome) + ' · ' + stamp_() + '.pdf'));
  m.pasta_id = pasta.getId(); m.pdf_id = pdf.getId();
  medHist_(m, ctx, 'Aprovada', numTxt + ' · código ' + m.hash.slice(0, 10));
  T.update(m);
  log_(ctx, 'medicao_aprovar', numTxt + ' ' + m.id);
  return { msg: numTxt + ' aprovada e arquivada no Drive.', numero: num_(m.numero), numero_txt: numTxt, hash: m.hash };
}
function medCancelar_(q, ctx) {
  const m0 = obraTab_(ctx, 'Medicoes').all().find(x => String(x.id) === String(q.id));
  if (!m0) throw new Error('Medição não encontrada.');
  const aprovador = pode_(ctx, 'medicao_aprovar');
  const permitidos = aprovador ? [MED_ST_.rasc, MED_ST_.dev, MED_ST_.aprov, MED_ST_.ok] : [MED_ST_.rasc, MED_ST_.dev, MED_ST_.aprov];
  const a = medAchar_(ctx, q.id, permitidos), m = a.m, motivo = String(q.motivo || '').trim();
  if (motivo.length < 5) throw new Error('Explique o motivo do cancelamento.');
  m.status = MED_ST_.canc; m.motivo = motivo;
  medHist_(m, ctx, 'Cancelada', motivo + ' (os serviços ficam livres para outra medição)');
  a.T.update(m);
  return { msg: 'Medição cancelada.' };
}
function medPagar_(q, ctx) {
  const a = medAchar_(ctx, q.id, [MED_ST_.ok]), m = a.m, dia = ymd_(q.pago_em) || hojeYmd_();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error('Data do pagamento inválida.');
  m.status = MED_ST_.paga; m.pago_em = dataDe_(dia); m.pago_obs = String(q.obs || '').slice(0, 300);
  medHist_(m, ctx, 'Marcada como paga', dataTxt_(dia) + (m.pago_obs ? ' · ' + m.pago_obs : ''));
  a.T.update(m);
  return { msg: 'Medição marcada como paga em ' + dataTxt_(dia) + '.' };
}
function medPdfVer_(q, ctx) {
  const m = obraTab_(ctx, 'Medicoes').all().find(x => String(x.id) === String(q.id));
  if (!m || !m.pdf_id) throw new Error('Esta medição ainda não tem PDF arquivado.');
  const file = DriveApp.getFileById(m.pdf_id);
  return { nome: file.getName(), mime: 'application/pdf', b64: Utilities.base64Encode(file.getBlob().getBytes()) };
}

/* ---------- sino ---------- */
function notifMed_(c, add) {
  if (!pode_(c, ['medicao_ver', 'medicao_lancar', 'medicao_aprovar'])) return;
  const M = obraTab_(c, 'Medicoes').all().filter(m => m.status === MED_ST_.aprov || m.status === MED_ST_.dev);
  M.forEach(m => {
    if (m.status === MED_ST_.aprov && pode_(c, 'medicao_aprovar'))
      add({ id: 'md|ap|' + m.id + '|' + fmtVal_(m.enviado_em), etapa: 'medicao_aprovar', numero: m.empreiteiro_nome, texto: 'Medição de ' + m.empreiteiro_nome + ' (' + dataTxt_(ymd_(m.de)) + ' a ' + dataTxt_(ymd_(m.ate)) + ') aguardando aprovação — enviada por ' + (m.enviado_por || '—'), quando: fmtVal_(m.enviado_em), rota: '#/med/' + m.id });
    if (m.status === MED_ST_.dev && pode_(c, 'medicao_lancar'))
      add({ id: 'md|dev|' + m.id + '|' + fmtVal_(m.atualizado_em), etapa: 'medicao_devolvida', numero: m.empreiteiro_nome, texto: 'Medição devolvida: ' + (m.motivo || 'ajustes pedidos'), quando: fmtVal_(m.atualizado_em), rota: '#/med/' + m.id });
  });
}

/* ---------- perfis: o dono (admin) já tem tudo; as outras pessoas recebem por obra na tela de acessos ---------- */
function atualizarPerfisMed_() {
  const C = central_('Config');
  if (C.all().some(r => r.chave === 'PERFIS_MED_V1')) return;
  const P = central_('Perfis'), A = central_('Acessos'), novas = ['medicao_ver', 'medicao_lancar', 'medicao_aprovar'];
  const une = (txt) => { const s = String(txt || '').split(',').map(x => x.trim()).filter(Boolean); novas.forEach(e => { if (s.indexOf(e) < 0) s.push(e); }); return s.join(','); };
  const p = P.all().find(x => norm_(x.perfil) === 'admin');
  if (p) { p.permissoes = une(p.permissoes); P.update(p); }
  A.all().filter(a => norm_(a.perfil) === 'admin').forEach(a => { a.permissoes = une(a.permissoes); A.update(a); });
  C.insert({ chave: 'PERFIS_MED_V1', valor: 'Sim', descricao: 'Ajuste automático: permissões do módulo Medições (Admin tem todas; as demais pessoas são liberadas por obra)' });
}
