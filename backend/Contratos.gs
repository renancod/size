/**
 * CONTRATOS de empreiteiros (mão de obra): planilha de serviços contratados × executado × medido × pago.
 *
 * Regras combinadas:
 *  - o contrato é cadastrado com a planilha (etapa/grupo, serviço, unidade, quantidade e preço unitário) e vinculado a um empreiteiro;
 *  - rascunho → vigente (ativado) → encerrado / rescindido (ou cancelado, se ainda era rascunho);
 *  - a frente de trabalho (etapa) escolhe um contrato vigente do empreiteiro e seus serviços nascem dos itens do contrato
 *    (ou a frente fica "sem contrato"); sem "lógica pesada": nada bloqueia a execução, o painel só avisa quando passa do contratado;
 *  - o preço global é o do contrato (valor_global); a soma dos itens aparece ao lado, para conferência;
 *  - aditivos são registrados (tipo, descrição, valor, nova vigência) e somam ao valor do contrato;
 *  - o contrato assinado (PDF) fica no Drive em Obra → Contratos.
 */
const CTR_ST_ = { rasc: 'Rascunho', vig: 'Vigente', enc: 'Encerrado', resc: 'Rescindido', canc: 'Cancelado' };
const CTR_NUM_ = ['valor_global', 'permuta_valor', 'fat_nf_pct', 'fat_recibo_pct', 'multa1_pct', 'multa2_pct', 'multa_diaria', 'aviso_dias'];
const CTR_DATAS_ = ['data_assinatura', 'vigencia_ini', 'vigencia_fim'];
const CTR_TXT_ = {
  numero: 60, objeto: 1500, escopo: 3000, local_assinatura: 120, prazo_txt: 200, permuta_desc: 600, pag_forma: 60, pag_periodicidade: 40, pag_obs: 1500, retencoes: 800,
  reajuste: 600, garantia: 800, contratante_nome: 200, contratante_doc: 40, contratante_end: 300, administradora: 500, foro: 120, clausulas_extra: 6000, obs: 1500
};
const CTR_TIPOS_ADITIVO_ = ['Acréscimo de serviços', 'Supressão de serviços', 'Prazo', 'Preço ou forma de pagamento', 'Outro'];
const ctrRotulo_ = c => (c.numero ? String(c.numero) : String(c.id));

function ctrAchar_(ctx, id) {
  const c = obraTab_(ctx, 'Contratos').all().find(x => String(x.id) === String(id));
  if (!c) throw new Error('Contrato não encontrado.');
  return c;
}
function ctrHist_(c, ctx, acao, nota) {
  const h = json_(c.historico_json, []);
  h.push({ q: Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'), por: ctx.u.nome, acao: acao, nota: String(nota || '').slice(0, 400) });
  c.historico_json = JSON.stringify(h);
  c.atualizado_em = new Date();
}
function ctrBase_(c) {
  const o = { id: c.id, rotulo: ctrRotulo_(c), empreiteiro_nome: c.empreiteiro_nome || '', status: c.status, pdf_nome: c.pdf_nome || '', tem_pdf: !!c.pdf_id, criado_por: c.criado_por || '', criado_em: fmtVal_(c.criado_em) };
  ['numero', 'empreiteiro'].forEach(k => { o[k] = String(c[k] == null ? '' : c[k]); });
  Object.keys(CTR_TXT_).forEach(k => { if (k !== 'numero') o[k] = String(c[k] == null ? '' : c[k]); });
  CTR_DATAS_.forEach(k => { o[k] = ymd_(c[k]); });
  CTR_NUM_.forEach(k => { o[k] = c[k] === '' || c[k] == null ? '' : num_(c[k]); });
  return o;
}

/* executado (diários), programado (frentes), medido e pago (medições) de cada item de contrato */
function ctrMetricas_(ctx, calc) {
  const r = {}, base = k => (r[k] = r[k] || { executado: 0, programado: 0, medido: 0, pago: 0 }), itemCi = {};
  (calc || calcExec_(ctx)).etapas.forEach(e => e.itens.forEach(i => {
    if (!i.contrato_item) return;
    itemCi[i.id] = i.contrato_item;
    const b = base(i.contrato_item); b.executado += num_(i.executado); b.programado += num_(i.prevista);
  }));
  const st = {};
  obraTab_(ctx, 'Medicoes').all().forEach(m => { st[m.id] = m.status; });
  obraTab_(ctx, 'MedicaoItens').all().forEach(i => {
    const k = itemCi[i.item_id], s = st[i.medicao];
    if (!k || MED_RESERVA_.indexOf(s) < 0) return;
    const b = base(k); b.medido += num_(i.qtd); if (s === MED_ST_.paga) b.pago += num_(i.qtd);
  });
  return r;
}
function ctrLinhas_(itens, met) {
  return itens.map(i => {
    const m = met[i.id] || { executado: 0, programado: 0, medido: 0, pago: 0 }, q = num_(i.qtd), u = num_(i.unitario);
    return {
      id: i.id, ordem: num_(i.ordem), grupo: i.grupo || '', codigo: i.codigo || '', servico_cod: i.servico_cod || '', servico: i.servico, unidade: i.unidade, qtd: q, unitario: u, total: r2_(q * u), orc_item: String(i.orc_item || ''), comp_cod: String(i.comp_cod || ''),
      programado: r2_(m.programado), executado: r2_(m.executado), medido: r2_(m.medido), pago: r2_(m.pago), saldo: r2_(q - m.medido), a_programar: r2_(q - m.programado),
      v_exec: r2_(m.executado * u), v_med: r2_(m.medido * u), v_pago: r2_(m.pago * u), v_saldo: r2_((q - m.medido) * u),
      pct_exec: q ? r2_(m.executado / q * 100) : 0, pct_med: q ? r2_(m.medido / q * 100) : 0, acima: m.executado > q + 0.0001
    };
  }).sort((a, b) => a.ordem - b.ordem);
}
function ctrResumo_(c, linhas, aditivos) {
  const soma = r2_(linhas.reduce((t, l) => t + l.total, 0)), global = num_(c.valor_global), adit = r2_(aditivos.reduce((t, a) => t + num_(a.valor), 0));
  const contratado = r2_((global > 0 ? global : soma) + adit);
  const exec = r2_(linhas.reduce((t, l) => t + l.v_exec, 0)), med = r2_(linhas.reduce((t, l) => t + l.v_med, 0)), pago = r2_(linhas.reduce((t, l) => t + l.v_pago, 0));
  return {
    soma_itens: soma, valor_global: global, aditivos: adit, contratado: contratado, diferenca: global > 0 ? r2_(global - soma) : 0,
    executado: exec, medido: med, pago: pago, saldo: r2_(contratado - med),
    pct_exec: contratado ? r2_(exec / contratado * 100) : 0, pct_med: contratado ? r2_(med / contratado * 100) : 0, pct_pago: contratado ? r2_(pago / contratado * 100) : 0
  };
}
function ctrAtivos_(ctx, id) {
  return obraTab_(ctx, 'ContratoItens').all().filter(i => (id == null || String(i.contrato) === String(id)) && !/^n/i.test(String(i.ativo)));
}

/* valores padrão para um contrato novo: copiados do último contrato da obra (partes, multas, garantia…) */
function ctrModelo_(ctx) {
  const ult = obraTab_(ctx, 'Contratos').all().slice().reverse()[0] || {}, pega = (k, pad) => (ult[k] !== undefined && ult[k] !== '' ? ult[k] : pad);
  return {
    contratante_nome: String(pega('contratante_nome', '')), contratante_doc: String(pega('contratante_doc', '')), contratante_end: String(pega('contratante_end', '')),
    administradora: String(pega('administradora', 'Size Engenharia Ambiental LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 45.457.452/0001-35, com sede na Avenida Cristóvão Colombo, 121, Guarani, Capão da Canoa/RS, CEP 95588-000')),
    foro: String(pega('foro', 'Capão da Canoa/RS')), local_assinatura: String(pega('local_assinatura', 'Capão da Canoa/RS')),
    pag_forma: String(pega('pag_forma', 'Por medição')), pag_periodicidade: String(pega('pag_periodicidade', 'Mensal')), pag_obs: String(pega('pag_obs', '')),
    fat_nf_pct: pega('fat_nf_pct', ''), fat_recibo_pct: pega('fat_recibo_pct', ''),
    multa1_pct: num_(pega('multa1_pct', 10)), multa2_pct: num_(pega('multa2_pct', 15)), multa_diaria: num_(pega('multa_diaria', 500)), aviso_dias: num_(pega('aviso_dias', 15)),
    retencoes: String(pega('retencoes', 'A CONTRATANTE efetuará todas as retenções de tributos federais, estaduais e municipais devidas, quando aplicáveis (INSS, ISS e demais), em cada pagamento.')),
    reajuste: String(pega('reajuste', 'Somente haverá reajustamento mediante aditivo contratual.')),
    garantia: String(pega('garantia', 'O(A) CONTRATADO(A) responderá pelo prazo de 5 (cinco) anos, contados do recebimento definitivo da obra, pela segurança e solidez dos serviços executados, obrigando-se a corrigir, refazer ou regularizar, às suas expensas, qualquer serviço em desconformidade.'))
  };
}

/* ---------- responsabilidade técnica (ART, RRT, TRT…): condição para liberar o contrato para assinatura ---------- */
const CTR_RT_TIPOS_ = ['ART', 'RRT', 'TRT', 'Outro documento com responsabilidade técnica'];
const ctrRtEmitida_ = r => !!(r.arquivo_id && String(r.numero).trim());
function ctrRtPub_(r) {
  return {
    id: r.id, tipo: r.tipo, descricao: r.descricao || '', numero: String(r.numero || ''), profissional: r.profissional || '', registro: r.registro || '', emissao: ymd_(r.emissao),
    tem_arquivo: !!r.arquivo_id, arquivo_nome: r.arquivo_nome || '', emitida: ctrRtEmitida_(r), anexado_por: r.anexado_por || '', anexado_em: fmtVal_(r.anexado_em)
  };
}
/* o contrato só é liberado para assinatura com todas as responsabilidades técnicas listadas emitidas (número + documento anexado) */
function ctrLiberacao_(rts) {
  const faltam = rts.filter(r => !ctrRtEmitida_(r)).map(r => r.tipo + (r.descricao ? ' - ' + r.descricao : ''));
  return { liberado: rts.length > 0 && !faltam.length, total: rts.length, emitidas: rts.length - faltam.length, faltam: faltam, motivo: !rts.length ? 'cadastre as responsabilidades técnicas do contrato (ART, RRT, TRT…)' : faltam.length ? 'faltam emitir/anexar: ' + faltam.join('; ') : '' };
}
function ctrExigeLiberado_(ctx, c) {
  const lib = ctrLiberacao_(obraTab_(ctx, 'ContratoRT').all().filter(r => String(r.contrato) === String(c.id)));
  if (!lib.liberado) throw new Error('Contrato bloqueado para assinatura: ' + lib.motivo + '.');
}
function ctrRtAchar_(ctx, id, rtId) {
  const c = ctrAchar_(ctx, id), T = obraTab_(ctx, 'ContratoRT'), r = T.all().find(x => String(x.id) === String(rtId) && String(x.contrato) === String(c.id));
  if (!r) throw new Error('Responsabilidade técnica não encontrada neste contrato.');
  return { c: c, T: T, r: r };
}
function ctrRtSalvar_(q, ctx) {
  const c = ctrAchar_(ctx, q.id), T = obraTab_(ctx, 'ContratoRT');
  if ([CTR_ST_.rasc, CTR_ST_.vig].indexOf(c.status) < 0) throw new Error('Contrato ' + c.status.toLowerCase() + ': não dá para mexer nas responsabilidades técnicas.');
  const tipo = CTR_RT_TIPOS_.indexOf(q.tipo) >= 0 ? q.tipo : '', desc = String(q.descricao || '').trim();
  if (!tipo) throw new Error('Escolha o tipo (ART, RRT, TRT ou outro documento).');
  if (desc.length < 3) throw new Error('Descreva a atividade coberta (ex: execução da rede de água).');
  let r = q.rt_id ? T.all().find(x => String(x.id) === String(q.rt_id) && String(x.contrato) === String(c.id)) : null;
  if (q.rt_id && !r) throw new Error('Responsabilidade técnica não encontrada neste contrato.');
  const nova = !r;
  if (nova) r = { id: 'RT-' + Utilities.getUuid().slice(0, 6), contrato: c.id, criado_por: ctx.u.nome, criado_em: new Date() };
  r.tipo = tipo; r.descricao = desc.slice(0, 300); r.numero = String(q.numero || '').trim().slice(0, 60); r.profissional = String(q.profissional || '').trim().slice(0, 150);
  r.registro = String(q.registro || '').trim().slice(0, 60); r.emissao = dataDe_(q.emissao) || '';
  if (nova) T.insert(r); else T.update(r);
  ctrHist_(c, ctx, nova ? 'Responsabilidade técnica incluída' : 'Responsabilidade técnica alterada', r.tipo + ' · ' + r.descricao + (r.numero ? ' · nº ' + r.numero : ''));
  obraTab_(ctx, 'Contratos').update(c);
  return { msg: nova ? tipo + ' incluída na lista do contrato.' : tipo + ' atualizada.', rt_id: r.id };
}
function ctrRtArquivo_(q, ctx) {
  const a = ctrRtAchar_(ctx, q.id, q.rt_id), arq = q.arquivo;
  if ([CTR_ST_.rasc, CTR_ST_.vig].indexOf(a.c.status) < 0) throw new Error('Contrato ' + a.c.status.toLowerCase() + ': não dá para anexar.');
  if (!arq || !arq.b64) throw new Error('Arquivo vazio.');
  if (arq.b64.length > 14000000) throw new Error('Arquivo maior que ~10 MB.');
  const nome = a.r.tipo.replace(/\s.*/, '') + '_' + limpa_(a.r.numero || a.r.id) + '_' + stamp_() + '_' + limpa_(arq.nome);
  const pasta = subpasta_(ctrPasta_(ctx, a.c, obraTab_(ctx, 'Contratos')), 'Responsabilidade técnica');
  const file = pasta.createFile(Utilities.newBlob(Utilities.base64Decode(arq.b64), arq.mime || 'application/pdf', nome));
  a.r.arquivo_id = file.getId(); a.r.arquivo_nome = String(arq.nome || file.getName()).slice(0, 120); a.r.anexado_por = ctx.u.nome; a.r.anexado_em = new Date();
  a.T.update(a.r);
  ctrHist_(a.c, ctx, a.r.tipo + ' anexada', (a.r.numero ? 'nº ' + a.r.numero + ' · ' : '') + a.r.arquivo_nome);
  obraTab_(ctx, 'Contratos').update(a.c);
  const lib = ctrLiberacao_(obraTab_(ctx, 'ContratoRT').all().filter(r => String(r.contrato) === String(a.c.id)));
  return { msg: lib.liberado ? 'Documento arquivado. Todas as responsabilidades técnicas estão emitidas: contrato liberado para assinatura.' : 'Documento arquivado.' + (!ctrRtEmitida_(a.r) ? ' Informe também o número do documento para contar como emitido.' : ''), liberado: lib.liberado };
}
function ctrRtRemover_(q, ctx) {
  const a = ctrRtAchar_(ctx, q.id, q.rt_id);
  if (a.c.status !== CTR_ST_.rasc) throw new Error('Só dá para retirar da lista enquanto o contrato é rascunho.');
  if (a.r.arquivo_id) { try { DriveApp.getFileById(a.r.arquivo_id).setTrashed(true); } catch (e) { /* já apagado */ } }
  a.T.removeWhere(x => String(x.id) === String(a.r.id));
  ctrHist_(a.c, ctx, 'Responsabilidade técnica retirada', a.r.tipo + ' · ' + a.r.descricao);
  obraTab_(ctx, 'Contratos').update(a.c);
  return { msg: 'Retirada da lista do contrato.' };
}
function ctrRtVer_(q, ctx) {
  const r = ctrRtAchar_(ctx, q.id, q.rt_id).r;
  if (!r.arquivo_id) throw new Error('Ainda não há documento anexado.');
  const file = DriveApp.getFileById(r.arquivo_id);
  return { nome: r.arquivo_nome || file.getName(), mime: file.getMimeType(), b64: Utilities.base64Encode(file.getBlob().getBytes()) };
}

/* ---------- leitura ---------- */
function ctrListar_(q, ctx) {
  if (obraTab_(ctx, 'Contratos').all().some(c => !String(c.numero).trim()) && pode_(ctx, 'contrato_gerir')) { const L = LockService.getScriptLock(); L.waitLock(20000); try { ctrNumerarPendentes_(ctx); } finally { L.releaseLock(); } }
  const C = obraTab_(ctx, 'Contratos').all(), I = ctrAtivos_(ctx), A = obraTab_(ctx, 'ContratoAditivos').all(), met = ctrMetricas_(ctx), RT = obraTab_(ctx, 'ContratoRT').all();
  const lista = C.map(c => {
    const linhas = ctrLinhas_(I.filter(i => String(i.contrato) === String(c.id)), met), res = ctrResumo_(c, linhas, A.filter(a => String(a.contrato) === String(c.id)));
    const lib = ctrLiberacao_(RT.filter(r => String(r.contrato) === String(c.id)));
    return Object.assign(ctrBase_(c), { itens: linhas.length, resumo: res, a_programar: r2_(linhas.reduce((t, l) => t + Math.max(0, l.a_programar), 0)), rt: { liberado: lib.liberado, total: lib.total, emitidas: lib.emitidas } });
  }).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
  return {
    contratos: lista,
    empreiteiros: obraTab_(ctx, 'Equipes').all().filter(e => !/^n/i.test(String(e.ativa))).map(e => ({ codigo: e.codigo, nome: e.nome, empresa: e.empresa || '', documento: e.documento || '' })),
    modelo: ctrModelo_(ctx), pode_gerir: pode_(ctx, 'contrato_gerir'), pode_ver: pode_(ctx, ['contrato_ver', 'contrato_gerir']),
    obra: { nome: ctx.obra.nome, endereco: ctx.obra.endereco }
  };
}
function ctrDetalhe_(q, ctx) {
  const c = ctrAchar_(ctx, q.id), calc = calcExec_(ctx), met = ctrMetricas_(ctx, calc);
  const itens = ctrAtivos_(ctx, c.id), linhas = ctrLinhas_(itens, met);
  // valor de referência de mão de obra do orçamento da obra (para comparar com o contratado)
  const orc = {};
  obraTab_(ctx, 'OrcItens').all().filter(orcAtivo_).forEach(i => { orc[i.id] = i; });
  linhas.forEach(l => { const o = orc[l.orc_item]; l.orc_unit_mo = o ? num_(o.unit_mo) : null; l.orc_servico = o ? o.servico : ''; });
  const comOrc = linhas.filter(l => l.orc_unit_mo != null), orcado = r2_(comOrc.reduce((t, l) => t + l.qtd * l.orc_unit_mo, 0)), contratadoOrc = r2_(comOrc.reduce((t, l) => t + l.total, 0));
  const aditivos = obraTab_(ctx, 'ContratoAditivos').all().filter(a => String(a.contrato) === String(c.id)).map(a => ({
    id: a.id, numero: num_(a.numero), data: ymd_(a.data), tipo: a.tipo, descricao: a.descricao, valor: num_(a.valor), nova_vigencia: ymd_(a.nova_vigencia), criado_por: a.criado_por
  })).sort((a, b) => a.numero - b.numero);
  const frentes = calc.etapas.filter(e => String(e.contrato_id) === String(c.id)), semVinculo = [];
  frentes.forEach(e => e.itens.forEach(i => { if (!i.contrato_item) semVinculo.push({ etapa: e.codigo, etapa_nome: e.nome, servico: i.servico, unidade: i.unidade, executado: i.executado }); }));
  const emp = obraTab_(ctx, 'Equipes').all().find(x => String(x.codigo) === String(c.empreiteiro)) || {};
  const rts = obraTab_(ctx, 'ContratoRT').all().filter(r => String(r.contrato) === String(c.id));
  return Object.assign(ctrBase_(c), {
    rts: rts.map(ctrRtPub_), liberacao: ctrLiberacao_(rts),
    orcamento: comOrc.length ? { linhas: comOrc.length, orcado: orcado, contratado: contratadoOrc, diferenca: r2_(contratadoOrc - orcado), pct: orcado ? r2_((contratadoOrc - orcado) / orcado * 100) : 0 } : null,
    itens: linhas, resumo: ctrResumo_(c, linhas, aditivos), aditivos: aditivos, historico: json_(c.historico_json, []),
    frentes: frentes.map(e => ({ codigo: e.codigo, nome: e.nome, local: e.local, pct: e.pct, situacao: e.situacao, servicos: e.itens.length, ativa: e.ativa })), sem_vinculo: semVinculo,
    pasta_url: c.pasta_id ? 'https://drive.google.com/drive/folders/' + c.pasta_id : '', minuta_em: fmtVal_(c.minuta_em),
    emp: { codigo: emp.codigo || c.empreiteiro, nome: emp.nome || c.empreiteiro_nome, empresa: emp.empresa || '', responsavel: emp.responsavel || '', telefone: emp.telefone || '', email: emp.email || '', documento: emp.documento || '', endereco: emp.endereco || '' },
    obra: { nome: ctx.obra.nome, sigla: ctx.obra.sigla, endereco: ctx.obra.endereco }, empresa: config_().EMPRESA || 'Size Engenharia',
    editavel: [CTR_ST_.rasc, CTR_ST_.vig].indexOf(c.status) >= 0 && pode_(ctx, 'contrato_gerir'), pode_gerir: pode_(ctx, 'contrato_gerir'), modelo: ctrModelo_(ctx)
  });
}
/* o que a tela de frentes de trabalho precisa (sem preços): contratos do empreiteiro e quanto ainda falta programar de cada item */
function ctrParaFrentes_(ctx) {
  const C = obraTab_(ctx, 'Contratos').all().filter(c => c.status !== CTR_ST_.canc && c.status !== CTR_ST_.rasc), I = ctrAtivos_(ctx), met = ctrMetricas_(ctx);
  return C.map(c => ({
    id: c.id, rotulo: ctrRotulo_(c), numero: String(c.numero || ''), empreiteiro: String(c.empreiteiro), status: c.status, objeto: String(c.objeto || '').slice(0, 160), data_assinatura: ymd_(c.data_assinatura),
    itens: ctrLinhas_(I.filter(i => String(i.contrato) === String(c.id)), met).map(l => ({ id: l.id, grupo: l.grupo, codigo: l.codigo, servico_cod: l.servico_cod, servico: l.servico, unidade: l.unidade, qtd: l.qtd, programado: l.programado, a_programar: l.a_programar, orc_item: l.orc_item }))
  }));
}

/* número do contrato: automático por obra (01, 02, 03…), nunca repete e nunca é reaproveitado (nem de contrato cancelado) */
const ctrNumTxt_ = n => ('0' + n).slice(-Math.max(2, String(n).length));
function ctrProximoNumero_(ctx) {
  return obraTab_(ctx, 'Contratos').all().reduce((m, c) => /^\d+$/.test(String(c.numero)) ? Math.max(m, parseInt(c.numero, 10)) : m, 0) + 1;
}
/* contratos criados antes da numeração automática recebem número, na ordem em que foram criados */
function ctrNumerarPendentes_(ctx) {
  const T = obraTab_(ctx, 'Contratos'), E = obraTab_(ctx, 'Etapas');
  T.all().filter(c => !String(c.numero).trim()).forEach(c => {
    c.numero = ctrNumTxt_(ctrProximoNumero_(ctx)); T.update(c);
    E.all().filter(e => String(e.contrato_id) === String(c.id)).forEach(e => { e.contrato_numero = c.numero; E.update(e); });
  });
}

/* ---------- gravação ---------- */
function ctrNum_(v, rot) { const n = num_(v); if (n < 0) throw new Error(rot + ' não pode ser negativo.'); return n; }
function ctrSalvar_(q, ctx) {
  const T = obraTab_(ctx, 'Contratos'), I = obraTab_(ctx, 'ContratoItens');
  let c = q.id ? ctrAchar_(ctx, q.id) : null;
  const nova = !c;
  if (c && [CTR_ST_.rasc, CTR_ST_.vig].indexOf(c.status) < 0) throw new Error('Contrato ' + c.status.toLowerCase() + ' não pode ser editado (reabra primeiro).');
  const vigente = !!c && c.status === CTR_ST_.vig, motivo = String(q.motivo || '').trim();
  if (vigente && motivo.length < 5) throw new Error('Contrato vigente: explique o motivo da alteração (fica registrado).');
  const emp = medEmpreiteiro_(ctx, q.empreiteiro);
  if (!String(q.objeto || '').trim()) throw new Error('Informe o objeto do contrato (ex: mão de obra para assentamento de rede de água).');
  const ligadas = c ? obraTab_(ctx, 'Etapas').all().filter(e => String(e.contrato_id) === String(c.id)) : [];
  if (c && String(c.empreiteiro) !== String(emp.codigo) && ligadas.length) throw new Error('Há frentes de trabalho ligadas a este contrato: não dá para trocar o empreiteiro.');
  if (nova) {
    ctrNumerarPendentes_(ctx);
    c = { id: T.proxCodigo('id', 'CT-', 3), numero: ctrNumTxt_(ctrProximoNumero_(ctx)), status: CTR_ST_.rasc, historico_json: '[]', criado_em: new Date(), criado_por: ctx.u.nome };
  }
  c.empreiteiro = emp.codigo; c.empreiteiro_nome = emp.nome;
  Object.keys(CTR_TXT_).forEach(k => { if (k !== 'numero' && q[k] !== undefined) c[k] = String(q[k] || '').trim().slice(0, CTR_TXT_[k]); });   // o número é automático
  CTR_NUM_.forEach(k => { if (q[k] !== undefined) c[k] = q[k] === '' || q[k] == null ? '' : ctrNum_(q[k], k); });
  CTR_DATAS_.forEach(k => { if (q[k] !== undefined) c[k] = dataDe_(q[k]) || ''; });
  if (c.vigencia_ini && c.vigencia_fim && ymd_(c.vigencia_fim) < ymd_(c.vigencia_ini)) throw new Error('O fim da vigência está antes do início.');
  if (num_(c.fat_nf_pct) + num_(c.fat_recibo_pct) > 100.0001) throw new Error('Nota fiscal + recibo passam de 100%.');

  // planilha: itens com id são atualizados; sem id entram; os que sumiram saem (se não estiverem em nenhuma frente)
  if (q.itens !== undefined) {
    const atuais = I.all().filter(i => String(i.contrato) === String(c.id) && !/^n/i.test(String(i.ativo))), mantidos = {}, linhas = [];
    const usados = {};
    obraTab_(ctx, 'EtapaItens').all().forEach(i => { if (i.contrato_item && !/^n/i.test(String(i.ativo))) usados[i.contrato_item] = i.servico; });
    let ordem = 0;
    const orcIds = {};
    obraTab_(ctx, 'OrcItens').all().filter(orcAtivo_).forEach(i => { orcIds[i.id] = 1; });
    [].concat(q.itens || []).forEach(x => {
      const servico = String(x.servico || '').trim(), unidade = String(x.unidade || '').trim();
      if (!servico && !num_(x.qtd) && !x.id) return;
      if (!servico) throw new Error('Informe o serviço de cada linha da planilha.');
      if (!unidade) throw new Error('Informe a unidade de ' + servico + '.');
      const qtd = num_(x.qtd), unit = ctrNum_(x.unitario, 'Preço unitário de ' + servico);
      if (!(qtd > 0)) throw new Error('Informe a quantidade de ' + servico + '.');
      if (x.orc_item && !orcIds[x.orc_item]) throw new Error('"' + servico + '" não está mais no orçamento da obra (atualize a tela).');
      const reg = { ordem: ++ordem, grupo: String(x.grupo || '').trim().slice(0, 120), codigo: String(x.codigo || '').trim().slice(0, 30), servico_cod: String(x.servico_cod || '').trim(), servico: servico.slice(0, 200), unidade: unidade.slice(0, 20), qtd: qtd, unitario: unit, orc_item: String(x.orc_item || ''), comp_cod: String(x.comp_cod || '').trim().slice(0, 40) };
      if (x.orc_item === undefined) delete reg.orc_item;          // tela antiga sem o campo: mantém o vínculo que já existe
      if (x.comp_cod === undefined) delete reg.comp_cod;
      const ex = x.id ? atuais.find(i => String(i.id) === String(x.id)) : null;
      if (x.id && !ex) throw new Error('Linha da planilha não pertence a este contrato.');
      if (ex) { Object.assign(ex, reg); mantidos[ex.id] = 1; I.update(ex); } else linhas.push(Object.assign({ id: 'CI-' + Utilities.getUuid().slice(0, 6), contrato: c.id, ativo: 'Sim' }, reg));
    });
    atuais.filter(i => !mantidos[i.id]).forEach(i => {
      if (usados[i.id]) throw new Error('"' + i.servico + '" já está em uma frente de trabalho: não dá para tirar da planilha.');
      i.ativo = 'Não'; I.update(i);
    });
    I.insertMany(linhas);
  }
  const itens = ctrAtivos_(ctx, c.id), soma = r2_(itens.reduce((t, i) => t + num_(i.qtd) * num_(i.unitario), 0));
  ctrHist_(c, ctx, nova ? 'Contrato criado' : 'Contrato alterado', (motivo ? motivo + ' · ' : '') + itens.length + ' serviço(s) · soma da planilha ' + brl_(soma));
  if (nova) T.insert(c); else T.update(c);
  // as frentes ligadas mostram o rótulo atual do contrato (número/data)
  obraTab_(ctx, 'Etapas').all().filter(e => String(e.contrato_id) === String(c.id)).forEach(e => { e.contrato_numero = ctrRotulo_(c); e.contrato_data = c.data_assinatura || ''; obraTab_(ctx, 'Etapas').update(e); });
  log_(ctx, nova ? 'contrato_criar' : 'contrato_editar', c.id + ' ' + emp.nome);
  return { msg: nova ? 'Contrato nº ' + ctrRotulo_(c) + ' salvo como rascunho. Quando estiver tudo certo, ative o contrato.' : 'Contrato salvo.', id: c.id };
}
function ctrStatus_(q, ctx) {
  const T = obraTab_(ctx, 'Contratos'), c = ctrAchar_(ctx, q.id), acao = String(q.op || ''), motivo = String(q.motivo || '').trim(), S = CTR_ST_;
  const ligadas = obraTab_(ctx, 'Etapas').all().filter(e => String(e.contrato_id) === String(c.id));
  const exige = () => { if (motivo.length < 5) throw new Error('Explique o motivo (fica registrado).'); };
  let novo, nota = motivo;
  if (acao === 'ativar') {
    if (c.status !== S.rasc) throw new Error('Só rascunho pode ser ativado.');
    if (!c.empreiteiro) throw new Error('Escolha o empreiteiro.');
    if (!c.vigencia_ini) throw new Error('Informe o início da vigência.');
    if (!ctrAtivos_(ctx, c.id).length && !(num_(c.valor_global) > 0)) throw new Error('Cadastre a planilha de serviços (ou informe o valor global) antes de ativar.');
    ctrExigeLiberado_(ctx, c);                                      // sem as responsabilidades técnicas emitidas não vai para assinatura
    novo = S.vig;
  } else if (acao === 'encerrar') { if (c.status !== S.vig) throw new Error('Só contrato vigente pode ser encerrado.'); novo = S.enc; }
  else if (acao === 'rescindir') { if (c.status !== S.vig) throw new Error('Só contrato vigente pode ser rescindido.'); exige(); novo = S.resc; }
  else if (acao === 'cancelar') {
    if (c.status !== S.rasc) throw new Error('Só rascunho pode ser cancelado. Para parar um contrato vigente, use encerrar ou rescindir.');
    if (ligadas.length) throw new Error('Há frentes de trabalho ligadas a este contrato.');
    novo = S.canc;
  } else if (acao === 'reabrir') {
    if ([S.enc, S.resc, S.canc].indexOf(c.status) < 0) throw new Error('Este contrato já está aberto.');
    exige(); novo = c.status === S.canc ? S.rasc : S.vig;
  } else throw new Error('Ação inválida.');
  nota = (nota ? nota + ' · ' : '') + c.status + ' → ' + novo;
  c.status = novo; ctrHist_(c, ctx, { ativar: 'Contrato ativado', encerrar: 'Contrato encerrado', rescindir: 'Contrato rescindido', cancelar: 'Rascunho cancelado', reabrir: 'Contrato reaberto' }[acao], nota);
  T.update(c);
  log_(ctx, 'contrato_' + acao, c.id + ' ' + c.empreiteiro_nome);
  return { msg: { ativar: 'Contrato ativado: já pode ser escolhido nas frentes de trabalho.', encerrar: 'Contrato encerrado.', rescindir: 'Contrato rescindido.', cancelar: 'Rascunho cancelado.', reabrir: 'Contrato reaberto.' }[acao] };
}
function ctrAditivo_(q, ctx) {
  const T = obraTab_(ctx, 'Contratos'), A = obraTab_(ctx, 'ContratoAditivos'), c = ctrAchar_(ctx, q.id);
  if (c.status !== CTR_ST_.vig) throw new Error('Aditivo só em contrato vigente.');
  const tipo = CTR_TIPOS_ADITIVO_.indexOf(q.tipo) >= 0 ? q.tipo : 'Outro', desc = String(q.descricao || '').trim();
  if (desc.length < 5) throw new Error('Descreva o aditivo.');
  const valor = q.valor === '' || q.valor == null ? 0 : num_(q.valor), nv = q.nova_vigencia ? dataDe_(q.nova_vigencia) : '';
  if (nv && c.vigencia_ini && ymd_(nv) < ymd_(c.vigencia_ini)) throw new Error('A nova vigência está antes do início do contrato.');
  const n = A.all().filter(a => String(a.contrato) === String(c.id)).reduce((m, a) => Math.max(m, num_(a.numero)), 0) + 1;
  A.insert({ id: 'AD-' + Utilities.getUuid().slice(0, 6), contrato: c.id, numero: n, data: dataDe_(q.data) || new Date(), tipo: tipo, descricao: desc.slice(0, 1000), valor: valor, nova_vigencia: nv, criado_por: ctx.u.nome, criado_em: new Date() });
  if (nv) c.vigencia_fim = nv;
  ctrHist_(c, ctx, 'Aditivo nº ' + n, tipo + (valor ? ' · ' + brl_(valor) : '') + (nv ? ' · vigência até ' + dataTxt_(ymd_(nv)) : ''));
  T.update(c);
  log_(ctx, 'contrato_aditivo', c.id + ' nº ' + n);
  return { msg: 'Aditivo nº ' + n + ' registrado.' };
}
function ctrPasta_(ctx, c, T) {
  if (c.pasta_id) { try { return DriveApp.getFolderById(c.pasta_id); } catch (e) { /* recria */ } }
  const p = subpasta_(pastaObra_(ctx), 'Contratos').createFolder(c.id + ' · ' + nomeArq_(c.empreiteiro_nome));
  c.pasta_id = p.getId(); T.update(c);
  return p;
}
function ctrAnexo_(q, ctx) {
  const T = obraTab_(ctx, 'Contratos'), c = ctrAchar_(ctx, q.id), arq = q.arquivo;
  if (!arq || !arq.b64) throw new Error('Arquivo vazio.');
  if (arq.b64.length > 14000000) throw new Error('Arquivo maior que ~10 MB.');
  const blob = Utilities.newBlob(Utilities.base64Decode(arq.b64), arq.mime || 'application/pdf', 'CONTRATO_' + stamp_() + '_' + limpa_(arq.nome));
  const file = ctrPasta_(ctx, c, T).createFile(blob);
  c.pdf_id = file.getId(); c.pdf_nome = String(arq.nome || file.getName()).slice(0, 120);
  ctrHist_(c, ctx, 'Contrato assinado anexado', c.pdf_nome);
  T.update(c);
  return { msg: 'Contrato assinado arquivado no Drive.', pdf_nome: c.pdf_nome };
}
/* minuta gerada no app (PDF): fica guardada no Drive, na pasta do contrato, a cada vez que é baixada e ao ativar o contrato */
function ctrMinuta_(q, ctx) {
  const T = obraTab_(ctx, 'Contratos'), c = ctrAchar_(ctx, q.id), arq = q.pdf;
  if (!arq || !arq.b64) throw new Error('PDF da minuta vazio.');
  if (arq.b64.length > 14000000) throw new Error('Minuta maior que ~10 MB.');
  if (c.status === CTR_ST_.rasc) ctrExigeLiberado_(ctx, c);       // minuta para assinatura só com as responsabilidades técnicas emitidas
  const nome = 'MINUTA_' + stamp_() + '_' + limpa_('Contrato ' + ctrRotulo_(c) + ' ' + c.empreiteiro_nome) + '.pdf';
  const file = ctrPasta_(ctx, c, T).createFile(Utilities.newBlob(Utilities.base64Decode(arq.b64), 'application/pdf', nome));
  c.minuta_id = file.getId(); c.minuta_em = new Date();
  ctrHist_(c, ctx, 'Minuta salva no Drive', nome);
  T.update(c);
  return { msg: 'Minuta salva no Drive (pasta Contratos).', minuta_em: fmtVal_(c.minuta_em), pasta_url: 'https://drive.google.com/drive/folders/' + c.pasta_id };
}
function ctrAnexoVer_(q, ctx) {
  const c = ctrAchar_(ctx, q.id);
  if (!c.pdf_id) throw new Error('Este contrato ainda não tem o arquivo assinado.');
  const file = DriveApp.getFileById(c.pdf_id);
  return { nome: c.pdf_nome || file.getName(), mime: file.getMimeType(), b64: Utilities.base64Encode(file.getBlob().getBytes()) };
}

/* ---------- perfis: o dono (admin) já tem tudo; as outras pessoas recebem por obra na tela de acessos ---------- */
function atualizarPerfisCtr_() {
  const C = central_('Config');
  if (C.all().some(r => r.chave === 'PERFIS_CTR_V1')) return;
  const P = central_('Perfis'), A = central_('Acessos'), novas = ['contrato_ver', 'contrato_gerir'];
  const une = txt => { const s = String(txt || '').split(',').map(x => x.trim()).filter(Boolean); novas.forEach(e => { if (s.indexOf(e) < 0) s.push(e); }); return s.join(','); };
  const p = P.all().find(x => norm_(x.perfil) === 'admin');
  if (p) { p.permissoes = une(p.permissoes); P.update(p); }
  A.all().filter(a => norm_(a.perfil) === 'admin').forEach(a => { a.permissoes = une(a.permissoes); A.update(a); });
  C.insert({ chave: 'PERFIS_CTR_V1', valor: 'Sim', descricao: 'Ajuste automático: permissões do módulo Contratos (Admin tem todas; as demais pessoas são liberadas por obra)' });
}
