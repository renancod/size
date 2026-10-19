/**
 * RELATÓRIO DA OBRA (andamento geral), em dois modelos:
 *  - andamento: % executado, curva S (previsto × realizado × projetado), avanço por frente e por serviço,
 *    prazos com a estimativa de atraso, clima, efetivo e fotos. Sem valores em R$: pode ir para o cliente;
 *  - gerencial (uso interno): tudo do andamento + receita, custo real, estimativa no fim, déficit por frente,
 *    materiais a comprar, mão de obra e a lista de pontos para a reunião.
 *
 * % executado: ponderado pelo valor de venda dos serviços do orçamento (o mesmo do painel da obra); sem orçamento,
 * pela média dos serviços das etapas.
 * Estimativa de atraso: para cada serviço em andamento, o ritmo real dos diários (média dos últimos 7 dias de trabalho)
 * aplicado ao saldo, em dias úteis, descontando a média de dias parados por chuva dos últimos 60 dias.
 * O app monta a folha e o PDF (relobra.js).
 */
const RO_RISCO_ = { concluido: 0, nao_iniciado: 1, no_prazo: 2, risco: 3, atrasado: 4 };

function obraRelatorio_(q, ctx) {
  const modelo = q.modelo === 'gerencial' ? 'gerencial' : 'andamento';
  if (modelo === 'gerencial' && !pode_(ctx, 'orc_gerir')) throw new Error('Só quem gerencia o orçamento emite o relatório gerencial.');
  const calc = calcExec_(ctx), hoje = calc.hoje, util = calc.util, parado = calc.parado, re = /^\d{4}-\d{2}-\d{2}$/;
  let ate = re.test(ymd_(q.ate)) ? ymd_(q.ate) : hoje;
  if (ate > hoje) ate = hoje;
  const de = re.test(ymd_(q.de)) ? ymd_(q.de) : addDias_(ate, -29);
  if (ate < de) throw new Error('A data final está antes da inicial.');
  const orc = orcCalc_(ctx, calc);
  const prod = obraTab_(ctx, 'Producao').all().filter(p => num_(p.qtd) && re.test(ymd_(p.data)) && ymd_(p.data) <= hoje)
    .map(p => ({ item: String(p.item_id), data: ymd_(p.data), qtd: num_(p.qtd) })).sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
  const diarios = obraTab_(ctx, 'Diarios').all().map(d => Object.assign({}, d, { data: ymd_(d.data) })).filter(d => re.test(d.data));
  const eqd = obraTab_(ctx, 'EquipesDia').all().map(e => ({ data: ymd_(e.data), pessoas: num_(e.pessoas) }));

  // ---- itens das etapas (frentes de execução) e o que cada um pesa no avanço da obra ----
  const itensEt = [];
  calc.etapas.forEach(e => e.itens.forEach(i => itensEt.push(Object.assign({ etapa_cod: e.codigo, etapa_nome: e.nome, etapa_frente: e.frente, etapa_ativa: e.ativa }, i))));
  const orcIt = {};
  orc.frentes.forEach(f => f.itens.forEach(i => { orcIt[i.id] = Object.assign({ frente_cod: f.codigo, frente_nome: f.nome }, i); }));
  const usaOrc = Object.keys(orcIt).length > 0;
  const chaves = {};      // chave de peso → { q (quantidade total), w (peso), frente }
  if (usaOrc) {
    const temRec = orc.frentes.some(f => f.resumo.emp.receita > 0 && f.itens.length), temVt = orc.frentes.some(f => f.resumo.v_total > 0);
    orc.frentes.forEach(f => {
      const R = f.resumo, n = f.itens.length;
      f.itens.forEach(i => {
        let w;
        if (temRec) w = R.emp.receita > 0 ? R.emp.receita * (R.v_venda > 0 ? i.v_venda / R.v_venda : R.v_total > 0 ? i.v_total / R.v_total : 1 / n) : 0;
        else w = temVt ? i.v_total : 1;
        chaves[i.id] = { q: num_(i.qtd), w: w, frente: f.codigo };
      });
    });
  } else itensEt.forEach(i => { if (i.etapa_ativa) chaves[i.id] = { q: i.prevista, w: 1, frente: '' }; });
  const chaveDe = {};     // item da etapa → chave de peso
  itensEt.forEach(i => { const k = usaOrc ? i.orc_item : i.id; if (k && chaves[k]) chaveDe[i.id] = k; });
  const W = Object.keys(chaves).reduce((t, k) => t + chaves[k].w, 0);
  const pctDe = (cum, frente) => {
    let s = 0, wt = 0;
    Object.keys(chaves).forEach(k => {
      const c = chaves[k];
      if (frente && c.frente !== frente) return;
      wt += c.w;
      if (c.q > 0) s += c.w * Math.min(1, (cum[k] || 0) / c.q);
    });
    return wt > 0 ? s / wt * 100 : 0;
  };

  // ---- calendário: dias úteis acumulados (contas rápidas de dias úteis entre datas) ----
  const datas = [].concat(prod.map(p => p.data), itensEt.map(i => i.inicio_original || i.inicio), itensEt.map(i => i.inicio)).filter(Boolean).sort();
  const inicioObra = datas[0] || de;
  const t0 = [inicioObra, de].sort()[0], tMax = addDias_(hoje, 3650);
  const U = {}, ordem = [];
  let acc = 0;
  const estender = ate2 => {
    let s = ordem.length ? addDias_(ordem[ordem.length - 1], 1) : t0;
    while (s <= ate2) { if (util(s)) acc++; U[s] = acc; ordem.push(s); s = addDias_(s, 1); }
  };
  estender(addDias_(hoje, 400));
  const u_ = s => { if (s < t0) return 0; if (U[s] === undefined) estender(s > tMax ? tMax : s); return U[s] || 0; };
  const uteis = (a, b) => b < a ? 0 : u_(b) - u_(addDias_(a, -1));
  // n-ésimo dia útil a partir de a (inclusive)
  const somaUteis = (a, n) => { if (n <= 0) return a; const alvo = u_(addDias_(a, -1)) + n; for (let s = a; s <= tMax; s = addDias_(s, 1)) if (u_(s) >= alvo) return s; return ''; };

  // chuva: parte dos dias úteis dos últimos 60 dias que ficou parada
  const ini60 = addDias_(hoje, -60);
  const u60 = uteis(ini60 < t0 ? t0 : ini60, hoje), p60 = Object.keys(parado).filter(s => s >= ini60 && s <= hoje && util(s)).length;
  const taxaChuva = u60 >= 10 ? Math.min(0.5, p60 / u60) : 0;

  // ---- projeção de cada serviço das etapas ----
  const proj = itensEt.map(i => {
    const ini = i.inicio, fim = i.termino, dur = ini && fim ? Math.max(1, uteis(ini, fim)) : 1;
    const saldo = Math.max(0, i.prevista - i.executado);
    const s0 = [i.hoje_qtd > 0 ? addDias_(hoje, 1) : hoje, ini || hoje].sort().pop();
    const ritmo = i.media7 > 0 ? i.media7 : i.media > 0 ? i.media : 0;
    let p = '', st = '', ini_proj = s0;
    if (i.situacao === 'concluido' || (i.prevista > 0 && saldo <= 0)) { st = 'concluido'; p = i.ultimo || fim; ini_proj = ''; }
    else if (!i.etapa_ativa) st = 'nao_iniciado';
    else if (ritmo > 0) p = somaUteis(s0, Math.ceil(Math.ceil(saldo / ritmo) / (1 - taxaChuva)));
    else if (ini && ini > hoje) { p = fim; ini_proj = ini; }                       // ainda vai começar: segue o planejado
    else if (ini && fim) p = somaUteis(s0, Math.ceil(dur / (1 - taxaChuva)));     // devia ter começado e não começou: leva o prazo todo a partir de hoje
    const atraso = !st && p && fim && p > fim ? uteis(addDias_(fim, 1), p) : 0;
    // tolerância: até 10% do prazo do serviço (mínimo 2 dias úteis) = em risco; acima disso, atrasado
    if (!st) st = !i.primeiro && ini && ini > hoje && !atraso ? 'nao_iniciado' : !atraso ? 'no_prazo' : atraso <= Math.max(2, Math.round(dur * 0.1)) ? 'risco' : 'atrasado';
    const restam = fim && fim >= s0 ? uteis(s0, fim) : 0;
    const nec = st === 'concluido' ? 0 : restam > 0 ? r2_(saldo / (restam * (1 - taxaChuva))) : null;
    return {
      id: i.id, etapa: i.etapa_cod, etapa_nome: i.etapa_nome, frente: i.etapa_frente, orc_item: i.orc_item, servico: i.servico, unidade: i.unidade,
      prevista: i.prevista, executado: i.executado, saldo: r2_(saldo), pct: i.pct, inicio: ini, termino: fim, termino_original: i.termino_original, inicio_original: i.inicio_original,
      ritmo: r2_(ritmo), ritmo_nec: nec, projecao: p, ini_proj: ini_proj, atraso: atraso, situacao: st, ativa: i.etapa_ativa
    };
  });
  const projPor = {};
  proj.forEach(p => { projPor[p.id] = p; });

  // ---- curva S: previsto (datas originais), realizado (diários) e projetado (ritmo atual) ----
  const fimPrev = itensEt.map(i => i.termino_original || i.termino).filter(Boolean).sort().pop() || hoje;
  const fimProj = proj.filter(p => p.ativa && p.projecao).map(p => p.projecao).sort().pop() || hoje;
  let fimEixo = [fimPrev, fimProj, ate].sort().pop();
  if (fimEixo > addDias_(hoje, 1460)) fimEixo = addDias_(hoje, 1460);
  const dias = Math.max(7, (utc_(fimEixo) - utc_(inicioObra)) / 864e5);
  const passo = dias > 1100 ? 28 : dias > 500 ? 14 : 7;
  const pontos = [];
  for (let s = inicioObra; s < fimEixo; s = addDias_(s, passo)) pontos.push(s);
  pontos.push(fimEixo);
  if (pontos.indexOf(hoje) < 0 && hoje > inicioObra && hoje < fimEixo) { pontos.push(hoje); pontos.sort(); }
  // realizado: produção acumulada por chave até cada ponto
  const cumPor = {}, curva = [];
  let ip = 0;
  const cum = {};
  const avancar = ate2 => { while (ip < prod.length && prod[ip].data <= ate2) { const k = chaveDe[prod[ip].item]; if (k) cum[k] = (cum[k] || 0) + prod[ip].qtd; ip++; } };
  const planejadoEm = s => {
    const c = {};
    itensEt.forEach(i => {
      const k = chaveDe[i.id], a = i.inicio_original || i.inicio, b = i.termino_original || i.termino;
      if (!k || !a || !b || !i.etapa_ativa && !i.executado) return;
      const f = s < a ? 0 : s >= b ? 1 : uteis(a, s) / Math.max(1, uteis(a, b));
      c[k] = (c[k] || 0) + i.prevista * f;
    });
    return c;
  };
  const projetadoEm = s => {
    const c = Object.assign({}, cumPor[hoje] || {});
    proj.forEach(p => {
      const k = chaveDe[p.id];
      if (!k || !p.ativa || p.situacao === 'concluido' || !p.projecao || !p.ini_proj || p.saldo <= 0) return;
      const f = s <= p.ini_proj ? 0 : s >= p.projecao ? 1 : uteis(p.ini_proj, addDias_(s, -1)) / Math.max(1, uteis(p.ini_proj, p.projecao));
      c[k] = (c[k] || 0) + p.saldo * f;
    });
    return c;
  };
  pontos.forEach(s => {
    const lim = s < hoje ? s : hoje;
    avancar(lim);
    if (s <= hoje) cumPor[s] = Object.assign({}, cum);
    if (s === hoje || (s > hoje && !cumPor[hoje])) cumPor[hoje] = Object.assign({}, cum);
    curva.push({ data: s, previsto: r2_(pctDe(planejadoEm(s))), realizado: s <= hoje ? r2_(pctDe(cum)) : null, projetado: s >= hoje ? r2_(pctDe(projetadoEm(s))) : null });
  });
  // acumulado até uma data qualquer (início e fim do período)
  const cumEm = s => { const c = {}; prod.forEach(p => { if (p.data <= s) { const k = chaveDe[p.item]; if (k) c[k] = (c[k] || 0) + p.qtd; } }); return c; };
  const cIni = cumEm(addDias_(de, -1)), cFim = cumEm(ate);
  const pctIni = r2_(pctDe(cIni)), pctFim = r2_(pctDe(cFim)), pctPrevAte = r2_(pctDe(planejadoEm(ate)));
  const pctProgramado = r2_(pctDe(planejadoEm('9999-12-31')));

  // ---- por frente geral (do orçamento) ----
  const nomeFrente = {};
  orc.frentes.forEach(f => { nomeFrente[norm_(f.nome)] = f.codigo; });
  const frenteDoItem = p => (p.orc_item && orcIt[p.orc_item] ? orcIt[p.orc_item].frente_cod : nomeFrente[norm_(p.frente)] || '');
  const piorSit = l => l.reduce((m, x) => RO_RISCO_[x] > RO_RISCO_[m] ? x : m, l.length && l.every(x => x === 'concluido') ? 'concluido' : 'nao_iniciado');
  const frentes = orc.frentes.filter(f => f.itens.length).map(f => {
    const ps = proj.filter(p => p.ativa && frenteDoItem(p) === f.codigo);
    const fimP = ps.map(p => p.termino).filter(Boolean).sort().pop() || '', fimJ = ps.map(p => p.projecao).filter(Boolean).sort().pop() || '';
    return {
      codigo: f.codigo, nome: f.nome, pct: usaOrc ? r2_(pctDe(cFim, f.codigo)) : f.resumo.pct_exec, pct_ini: r2_(pctDe(cIni, f.codigo)), pct_prev: r2_(pctDe(planejadoEm(ate), f.codigo)),
      termino: fimP, projecao: fimJ, atraso: fimP && fimJ && fimJ > fimP ? uteis(addDias_(fimP, 1), fimJ) : 0, situacao: ps.length ? piorSit(ps.map(p => p.situacao)) : 'nao_iniciado', etapas: [...new Set(ps.map(p => p.etapa))].length,
      itens: f.itens.map(i => ({ codigo: i.codigo, servico: i.servico, unidade: i.unidade, qtd: i.qtd, executado: r2_(cFim[i.id] || 0), periodo: r2_((cFim[i.id] || 0) - (cIni[i.id] || 0)), programado: i.programado, pct: i.qtd ? r2_(Math.min(100, (cFim[i.id] || 0) / i.qtd * 100)) : 0 })),
      emp: modelo === 'gerencial' ? f.resumo.emp : undefined,
      fin: modelo === 'gerencial' ? { v_mo: f.resumo.v_mo, mo_contratado: f.resumo.mo_contratado, falta_comprar: f.resumo.falta_comprar, materiais: f.resumo.materiais, pct_exec: f.resumo.pct_exec } : undefined
    };
  });

  // ---- etapas (prazo: previsto × projetado) ----
  const etapas = calc.etapas.filter(e => e.ativa).map(e => {
    const ps = proj.filter(p => p.etapa === e.codigo);
    const fimP = ps.map(p => p.termino).filter(Boolean).sort().pop() || '', fimJ = ps.map(p => p.projecao).filter(Boolean).sort().pop() || '';
    return {
      codigo: e.codigo, nome: e.nome, local: e.local, frente: e.frente, pct: e.pct, inicio: e.inicio, termino: fimP, projecao: fimJ,
      termino_original: ps.map(p => p.termino_original).filter(Boolean).sort().pop() || fimP,
      atraso: Math.max(0, ...ps.map(p => p.atraso)), situacao: piorSit(ps.map(p => p.situacao)),
      itens: ps.map(p => ({ servico: p.servico, unidade: p.unidade, prevista: p.prevista, executado: p.executado, saldo: p.saldo, pct: p.pct, ritmo: p.ritmo, ritmo_nec: p.ritmo_nec, termino: p.termino, projecao: p.projecao, atraso: p.atraso, situacao: p.situacao }))
    };
  }).filter(e => e.situacao !== 'concluido' || e.itens.some(i => i.projecao >= de))
    .sort((a, b) => RO_RISCO_[b.situacao] - RO_RISCO_[a.situacao] || String(a.inicio).localeCompare(String(b.inicio)));

  // ---- semanas: avanço, dias trabalhados × parados e efetivo ----
  let sIni = addDias_(de, -((dow_(de) + 6) % 7));
  const minSem = addDias_(addDias_(ate, -((dow_(ate) + 6) % 7)), -7 * 7);
  if (sIni > minSem) sIni = minSem;
  const maxSem = addDias_(minSem, -7 * 18);                // no máximo 26 semanas no gráfico
  if (sIni < maxSem) sIni = maxSem;
  if (sIni < addDias_(inicioObra, -((dow_(inicioObra) + 6) % 7))) sIni = addDias_(inicioObra, -((dow_(inicioObra) + 6) % 7));
  const diaTrab = {}, pessoasDia = {};
  prod.forEach(p => { diaTrab[p.data] = 1; });
  eqd.forEach(e => { pessoasDia[e.data] = (pessoasDia[e.data] || 0) + e.pessoas; });
  const semanas = [];
  for (let s = sIni; s <= ate; s = addDias_(s, 7)) {
    const f = addDias_(s, 6) < ate ? addDias_(s, 6) : ate;
    let tr = 0, pa = 0, ut = 0, pe = 0, dp = 0;
    for (let d = s; d <= f; d = addDias_(d, 1)) {
      if (util(d)) ut++;
      if (diaTrab[d]) tr++; else if (parado[d] && util(d)) pa++;
      if (pessoasDia[d]) { pe += pessoasDia[d]; dp++; }
    }
    semanas.push({ ini: s, fim: f, avanco: r2_(pctDe(cumEm(f)) - pctDe(cumEm(addDias_(s, -1)))), uteis: ut, trabalhados: tr, parados: pa, efetivo: dp ? Math.round(pe / dp) : 0 });
  }

  // ---- período: números do diário ----
  const noPer = s => s >= de && s <= ate;
  const dPer = diarios.filter(d => noPer(d.data));
  let pesP = 0, dpP = 0;
  Object.keys(pessoasDia).forEach(s => { if (noPer(s)) { pesP += pessoasDia[s]; dpP++; } });
  const periodo = {
    uteis: uteis(de, ate), trabalhados: Object.keys(diaTrab).filter(noPer).length, parados: dPer.filter(d => d.condicao === 'Parado por chuva').length,
    diarios: dPer.length, efetivo: dpP ? Math.round(pesP / dpP) : 0, homem_dia: pesP, chuva_mm: r2_(dPer.reduce((t, d) => t + num_(d.chuva_dia), 0))
  };
  const ocorrencias = dPer.filter(d => String(d.ocorrencias || '').trim()).map(d => ({ data: d.data, texto: String(d.ocorrencias).trim().slice(0, 400) }))
    .sort((a, b) => a.data.localeCompare(b.data)).slice(-15);
  let fotos = [];
  if (q.fotos !== false) {
    fotos = obraTab_(ctx, 'FotosExec').all().filter(f => noPer(ymd_(f.data))).sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.tirada_em).localeCompare(String(a.tirada_em))).slice(0, 6).map(f => {
      let b64 = '';
      try { b64 = Utilities.base64Encode(DriveApp.getFileById(f.mini_id || f.file_id).getBlob().getBytes()); } catch (e) { /* foto apagada */ }
      const et = calc.etapas.find(x => String(x.codigo) === String(f.etapa));
      return { b64: b64, legenda: f.legenda || '', data: ymd_(f.data), etapa: et ? et.nome : '' };
    }).filter(f => f.b64);
  }

  const ativos = proj.filter(p => p.ativa && p.situacao !== 'concluido');
  const geral = {
    pct: pctFim, pct_ini: pctIni, avanco: r2_(pctFim - pctIni), pct_prev: pctPrevAte, pct_programado: pctProgramado, usa_orcamento: usaOrc,
    inicio: inicioObra, termino: itensEt.filter(i => i.etapa_ativa).map(i => i.termino).filter(Boolean).sort().pop() || '', projecao: fimProj,
    taxa_chuva: r2_(taxaChuva * 100),
    servicos: { total: proj.filter(p => p.ativa).length, concluidos: proj.filter(p => p.ativa && p.situacao === 'concluido').length, no_prazo: ativos.filter(p => p.situacao === 'no_prazo').length, risco: ativos.filter(p => p.situacao === 'risco').length, atrasados: ativos.filter(p => p.situacao === 'atrasado').length, nao_iniciados: ativos.filter(p => p.situacao === 'nao_iniciado').length }
  };
  geral.atraso = geral.termino && fimProj > geral.termino ? uteis(addDias_(geral.termino, 1), fimProj) : 0;

  const out = {
    modelo: modelo, empresa: config_().EMPRESA || 'Size Engenharia', emissor: ctx.u.nome, hoje: hoje, de: de, ate: ate,
    obra: { nome: ctx.obra.nome, sigla: ctx.obra.sigla, endereco: ctx.obra.endereco, ativa: obraAtiva_(ctx) },
    geral: geral, curva: curva, frentes: frentes, etapas: etapas, semanas: semanas, periodo: periodo, ocorrencias: ocorrencias, fotos: fotos
  };
  if (modelo === 'gerencial') Object.assign(out, roGerencial_(ctx, orc, frentes, etapas, curva, chaveDe, prod, pctDe, geral));
  log_(ctx, 'obra_relatorio', modelo + ' ' + de + ' a ' + ate);
  return out;
}

/* parte interna: custos ao longo do tempo, materiais, mão de obra e os pontos para a reunião */
function roGerencial_(ctx, orc, frentes, etapas, curva, chaveDe, prod, pctDe, geral) {
  const E = orc.resumo.emp;
  const nomeFr = {};
  orc.frentes.forEach(f => { nomeFr[norm_(f.nome)] = f.codigo; });
  // custo real no tempo: pedidos aprovados (data de aprovação) + medições aprovadas/pagas (pelo preço do contrato)
  const gastos = [];
  obraTab_(ctx, 'Pedidos').all().forEach(p => {
    if (ORC_PED_COMPRADO_.indexOf(p.status) < 0 || !nomeFr[norm_(p.frente)]) return;
    gastos.push({ data: ymd_(p.aprovado_em || p.criado_em), v: num_(p.valor_total) });
  });
  const ciPor = {}, eiPor = {}, med = {};
  obraTab_(ctx, 'ContratoItens').all().forEach(i => { ciPor[i.id] = i; });
  obraTab_(ctx, 'EtapaItens').all().forEach(i => { eiPor[i.id] = i; });
  obraTab_(ctx, 'Medicoes').all().forEach(m => { med[m.id] = m; });
  let aPagar = 0, nAPagar = 0;
  const contadas = {};
  obraTab_(ctx, 'MedicaoItens').all().forEach(mi => {
    const m = med[mi.medicao], ei = eiPor[mi.item_id], ci = ei && ciPor[ei.contrato_item];
    if (!m || !ci || [MED_ST_.ok, MED_ST_.paga].indexOf(m.status) < 0) return;
    const v = num_(mi.qtd) * num_(ci.unitario);
    gastos.push({ data: ymd_(m.aprovado_em || m.criado_em), v: v });
    if (m.status === MED_ST_.ok) { aPagar += v; if (!contadas[m.id]) { contadas[m.id] = 1; nAPagar++; } }
  });
  gastos.sort((a, b) => a.data < b.data ? -1 : 1);
  // custo orçado para o avanço de cada ponto: custo direto de cada frente × avanço dela
  const cumAte = s => { const c = {}; prod.forEach(p => { if (p.data <= s) { const k = chaveDe[p.item]; if (k) c[k] = (c[k] || 0) + p.qtd; } }); return c; };
  const custo = curva.filter(c => c.realizado !== null).map(c => {
    const cm = cumAte(c.data);
    const prev = orc.frentes.reduce((t, f) => t + num_(f.resumo.emp.custo_direto) * pctDe(cm, f.codigo) / 100, 0);
    const real = gastos.filter(g => g.data <= c.data).reduce((t, g) => t + g.v, 0);
    return { data: c.data, previsto: r2_(prev), real: r2_(real) };
  });
  const materiais = [];
  orc.frentes.forEach(f => f.materiais.filter(m => m.orcado && m.falta_comprar > 0.0001).forEach(m => materiais.push({ frente: f.nome, descricao: m.descricao, unidade: m.unidade, necessario: m.necessario, comprado: m.comprado, em_compra: m.em_compra, falta: m.falta_comprar })));

  // pontos para a reunião (do mais grave para o mais leve)
  const pontosR = [];
  const add = (nivel, texto) => pontosR.push({ nivel: nivel, texto: texto });
  if (E.tem && E.lucro_proj < E.lucro_orcado - 0.005) add('alto', 'Lucro projetado de ' + brl_(E.lucro_proj) + ' (margem ' + nfmt_(E.margem_proj) + '%), abaixo do orçado ' + brl_(E.lucro_orcado) + ' (' + nfmt_(E.margem_orcada) + '%).');
  frentes.filter(f => f.emp && f.emp.custo_direto > 0 && f.emp.desvio > 0.005).sort((a, b) => b.emp.desvio - a.emp.desvio).slice(0, 5)
    .forEach(f => add('alto', f.nome + ': custo estimado no fim ' + brl_(f.emp.custo_fim) + ', ' + brl_(f.emp.desvio) + ' acima do orçado (gasto ' + brl_(f.emp.custo_real) + ' com ' + nfmt_(f.pct) + '% executado).'));
  if (geral.atraso > 0) add(geral.atraso > 10 ? 'alto' : 'medio', 'Término da obra projetado para ' + dataTxt_(geral.projecao) + ' (previsto ' + dataTxt_(geral.termino) + '): ' + geral.atraso + ' dias úteis de atraso no ritmo atual.');
  etapas.forEach(e => e.itens.filter(i => i.situacao === 'atrasado').slice(0, 2).forEach(i => add('alto', e.nome + ' · ' + i.servico + ': término projetado ' + dataTxt_(i.projecao) + ' (previsto ' + dataTxt_(i.termino) + ', ' + i.atraso + ' dias úteis). ' +
    (i.ritmo_nec ? 'Precisa de ' + nfmt_(i.ritmo_nec) + ' ' + i.unidade + '/dia' + (i.ritmo ? ' (ritmo atual ' + nfmt_(i.ritmo) + ')' : '') + '.' : 'Prazo já vencido.'))));
  etapas.forEach(e => e.itens.filter(i => i.situacao === 'risco').slice(0, 2).forEach(i => add('medio', e.nome + ' · ' + i.servico + ': em risco, término projetado ' + dataTxt_(i.projecao) + ' (previsto ' + dataTxt_(i.termino) + ').')));
  frentes.filter(f => f.etapas && f.fin && f.fin.falta_comprar > 0 && f.situacao !== 'concluido' && f.situacao !== 'nao_iniciado')
    .forEach(f => add('medio', f.nome + ' está em execução e tem ' + f.fin.falta_comprar + (f.fin.falta_comprar === 1 ? ' material' : ' materiais') + ' a comprar.'));
  orc.alertas.filter(a => ['programado', 'executado', 'contratado'].indexOf(a.tipo) >= 0).slice(0, 6).forEach(a => add('medio', a.frente_nome + ' · ' + a.texto + '.'));
  if (nAPagar) add('medio', (nAPagar === 1 ? '1 medição aprovada' : nAPagar + ' medições aprovadas') + ' aguardando pagamento: ' + brl_(aPagar) + '.');
  orc.alertas.filter(a => a.tipo === 'custo').slice(0, 3).forEach(a => add('baixo', a.frente_nome + ': ' + a.texto));

  const nv = { alto: 0, medio: 1, baixo: 2 };
  pontosR.forEach((p, i) => { p.i = i; });
  pontosR.sort((a, b) => nv[a.nivel] - nv[b.nivel] || a.i - b.i).forEach(p => { delete p.i; });
  const mo = orc.frentes.filter(f => f.itens.length).map(f => ({ nome: f.nome, orcado: f.resumo.v_mo, contratado: f.resumo.mo_contratado, medido: f.resumo.emp.custo_mo }));
  return {
    emp: E, custo: custo, materiais: materiais.sort((a, b) => a.frente.localeCompare(b.frente)).slice(0, 40), materiais_total: materiais.length,
    mao_obra: mo, a_pagar: { valor: r2_(aPagar), medicoes: nAPagar }, pontos: pontosR
  };
}
