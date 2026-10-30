'use strict';
/* =====================================================================
 * RELATÓRIO DA OBRA (andamento geral), dois modelos:
 *  - Andamento: % executado, curva S, avanço por frente e serviço, prazos com estimativa de atraso, clima, efetivo
 *    e fotos. Sem valores em R$ — pode ir para o cliente.
 *  - Gerencial (uso interno): tudo do andamento + resultado do empreendimento, déficit por frente, custos no tempo,
 *    materiais a comprar, mão de obra e os pontos para a reunião.
 * Gráficos em SVG (viram imagem nítida no PDF). Usa relatorio.js (pdfDeFolha, baixarBlob, relEscala, fc, fmtP),
 * orc.js (orPode, orGere, orGrupos) e app.js.
 * ===================================================================== */
const RO = { obra: '', modelo: 'andamento', de: '', ate: '', fotos: true, texto: '', editado: false, dados: null, erro: '', tok: 0, pdf: null, gerando: false };
const RO_MOD = {
  andamento: ['Andamento da obra', 'Percentual executado, prazos e estimativa de atraso. Sem valores — pode ir para o cliente.', 'chart'],
  gerencial: ['Gerencial · uso interno', 'Tudo do andamento + custos, déficits, materiais, mão de obra e pontos para a reunião.', 'money']
};
const RO_TIT = { andamento: 'RELATÓRIO DE ANDAMENTO DA OBRA', gerencial: 'RELATÓRIO GERENCIAL DA OBRA' };
const RO_SIT = { concluido: ['Concluído', ''], no_prazo: ['No prazo', ''], risco: ['Em risco', 'atencao'], atrasado: ['Atrasado', 'atrasado'], nao_iniciado: ['Não iniciado', 'nao_iniciado'] };
const roSit = s => `<span class="rl-sit ${RO_SIT[s] ? RO_SIT[s][1] : ''}">${RO_SIT[s] ? RO_SIT[s][0] : esc(s)}</span>`;
const COR = { prev: '#8A9BB5', real: '#04857A', proj: '#E07B00', chuva: '#1F5FBF', cinza: '#DCE4EC', verm: '#C0392B', azul: '#0E2A6B', txt: '#33425B', mute: '#6B7A90', linha: '#E6EDF2' };
const brlC = v => { const a = Math.abs(v); return a >= 1e6 ? 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : a >= 1e3 ? 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil' : brl(v); };
const roCurto = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const tsD = s => Date.parse(s + 'T12:00:00');
const mesAno = s => s.slice(5, 7) + '/' + s.slice(2, 4);
/* topo "redondo" da escala (80 mil, 100 mil, 2 mi…) para o eixo dividir em 4 partes certinhas */
const roRedondo = n => { const p = Math.pow(10, Math.floor(Math.log10(n))); return [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].map(x => x * p).find(x => x >= n) || 10 * p; };

/* ---------- gráficos (SVG → <img>, desenhado em 2× para sair nítido no PDF) ---------- */
function svgImg(w, h, corpo) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${h * 2}" viewBox="0 0 ${w} ${h}" font-family="Arial, Helvetica, sans-serif">${corpo}</svg>`;
  return `<img class="ro-graf" width="${w}" height="${h}" alt="" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}">`;
}
const txt = (x, y, t, o = {}) => `<text x="${x}" y="${y}" font-size="${o.s || 9}" fill="${o.c || COR.txt}" text-anchor="${o.a || 'start'}"${o.b ? ' font-weight="700"' : ''}>${esc(t)}</text>`;
const legenda = (itens, y = 10, x0 = 0) => { let x = x0; return itens.map(([cor, nome, trac]) => { const g = `<line x1="${x}" y1="${y - 3}" x2="${x + 16}" y2="${y - 3}" stroke="${cor}" stroke-width="${trac === 'barra' ? 7 : 2.5}"${trac === true ? ' stroke-dasharray="4 3"' : ''}/>${txt(x + 20, y, nome, { s: 9 })}`; x += 28 + nome.length * 5; return g; }).join(''); };

/* linhas no tempo: séries [{nome, cor, vals:[n|null], trac}] sobre as datas; max fixo (ex.: 100) ou automático */
function grLinhas(datas, series, { max, fmt = v => fmtP(v) + '%', hoje: hj, alto = 220, rotFim = true } = {}) {
  const W = 548, H = alto, L = 46, R = 40, T = 24, B = 24;
  const vs = series.flatMap(s => s.vals).filter(v => v != null), mx = Math.max(0, ...vs);
  // %: escala que mostra o detalhe quando a obra ainda está no começo (ex.: 0 a 10%); valores: 10% de folga
  const M = max === 'pct' ? (mx >= 60 ? 100 : [1, 2, 5, 10, 20, 25, 40, 50, 60, 80, 100].find(n => n >= mx * 1.15) || 100) : max || roRedondo(Math.max(1, mx) * 1.1);
  const x0 = tsD(datas[0]), x1 = tsD(datas[datas.length - 1]);
  const X = s => L + (tsD(s) - x0) / ((x1 - x0) || 1) * (W - L - R), Y = v => T + (1 - v / M) * (H - T - B);
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = M * k / 4, y = Y(v); g += `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="${COR.linha}"/>${txt(L - 5, y + 3, fmt(v), { a: 'end', c: COR.mute, s: 8.5 })}`; }
  // datas do eixo espaçadas no tempo (não colam umas nas outras)
  const longo = (x1 - x0) / 864e5 > 200, nT = Math.max(2, Math.min(7, Math.round((x1 - x0) / 864e5 / 3)));
  for (let k = 0; k < nT; k++) { const s = new Date(x0 + (x1 - x0) * k / (nT - 1)).toISOString().slice(0, 10); g += txt(X(s), H - 8, longo ? mesAno(s) : fc(s), { a: k === 0 ? 'start' : k === nT - 1 ? 'end' : 'middle', c: COR.mute, s: 8.5 }); }
  if (hj && hj > datas[0] && hj < datas[datas.length - 1]) g += `<line x1="${X(hj)}" y1="${T}" x2="${X(hj)}" y2="${H - B}" stroke="${COR.azul}" stroke-dasharray="2 3"/>${txt(X(hj) + 3, T + 8, 'hoje', { c: COR.azul, s: 8.5, b: 1 })}`;
  series.forEach(s => {
    const pts = datas.map((d, i) => s.vals[i] == null ? null : [X(d), Y(Math.min(M, s.vals[i]))]).filter(Boolean);
    if (!pts.length) return;
    g += `<polyline fill="none" stroke="${s.cor}" stroke-width="${s.grosso ? 2.8 : 2}" stroke-linejoin="round"${s.trac ? ' stroke-dasharray="5 4"' : ''} points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>`;
    if (rotFim) { const u = pts[pts.length - 1], v = s.vals.filter(x => x != null).pop(); g += `<circle cx="${u[0]}" cy="${u[1]}" r="3" fill="${s.cor}"/>${txt(Math.min(W - 2, u[0] + 5), u[1] - 5, fmt(v), { c: s.cor, s: 9, b: 1, a: u[0] > W - R - 10 ? 'end' : 'start' })}`; }
  });
  g = legenda(series.map(s => [s.cor, s.nome, !!s.trac]), 10, L) + g;
  return svgImg(W, H, g);
}
/* barras horizontais de % por linha, com a marca do previsto */
function grBarrasPct(linhas) {
  const W = 548, LW = 170, R = 44, lh = 24, T = 18, H = T + linhas.length * lh + 6;
  const X = p => LW + Math.min(100, Math.max(0, p)) / 100 * (W - LW - R);
  let g = legenda([[COR.real, 'executado', 'barra'], [COR.azul, 'previsto até a data']], 10, LW);
  linhas.forEach((l, i) => {
    const y = T + i * lh + 6;
    g += txt(0, y + 9, roCurto(l.nome, 34), { s: 9.5, b: 1, c: COR.azul });
    g += `<rect x="${LW}" y="${y}" width="${W - LW - R}" height="12" rx="6" fill="${COR.cinza}"/><rect x="${LW}" y="${y}" width="${Math.max(0, X(l.pct) - LW)}" height="12" rx="6" fill="${COR.real}"/>`;
    if (l.prev != null && l.prev > 0) g += `<line x1="${X(l.prev)}" y1="${y - 3}" x2="${X(l.prev)}" y2="${y + 15}" stroke="${COR.azul}" stroke-width="2"/>`;
    g += txt(W - R + 6, y + 10, fmtP(l.pct) + '%', { s: 10, b: 1, c: COR.real });
  });
  return svgImg(W, H, g);
}
/* colunas por semana (avanço em pontos percentuais) */
function grColunas(sem) {
  const W = 548, H = 170, L = 34, R = 8, T = 18, B = 26, n = sem.length, M = Math.max(0.5, ...sem.map(s => s.avanco)) * 1.2;
  const bw = (W - L - R) / n, Y = v => T + (1 - v / M) * (H - T - B);
  let g = '';
  for (let k = 0; k <= 3; k++) { const v = M * k / 3; g += `<line x1="${L}" y1="${Y(v)}" x2="${W - R}" y2="${Y(v)}" stroke="${COR.linha}"/>${txt(L - 4, Y(v) + 3, fmtP(v) + '%', { a: 'end', c: COR.mute, s: 8 })}`; }
  sem.forEach((s, i) => {
    const x = L + i * bw + bw * 0.18, w = bw * 0.64, y = Y(Math.max(0, s.avanco));
    g += `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(0, H - B - y)}" rx="2" fill="${COR.real}"/>`;
    if (s.avanco > 0.05) g += txt(x + w / 2, y - 3, fmtP(s.avanco), { a: 'middle', s: 8, b: 1, c: COR.real });
    if (n <= 13 || i % 2 === 0) g += txt(x + w / 2, H - 10, fc(s.ini), { a: 'middle', s: 8, c: COR.mute });
  });
  return svgImg(W, H, g);
}
/* clima e efetivo: dias trabalhados × parados por chuva por semana e o efetivo médio (linha) */
function grClima(sem) {
  const W = 548, H = 180, L = 26, R = 34, T = 24, B = 26, n = sem.length, bw = (W - L - R) / n;
  const M = Math.max(5, ...sem.map(s => s.uteis)), ME = Math.max(1, ...sem.map(s => s.efetivo)) * 1.2;
  const Y = v => T + (1 - v / M) * (H - T - B), YE = v => T + (1 - v / ME) * (H - T - B);
  let g = legenda([[COR.real, 'dias trabalhados', 'barra'], [COR.chuva, 'parados por chuva', 'barra'], [COR.cinza, 'sem produção', 'barra'], [COR.proj, 'efetivo médio (pessoas)']], 10, L);
  for (let k = 0; k <= M; k++) g += k % (M > 5 ? 2 : 1) ? '' : `<line x1="${L}" y1="${Y(k)}" x2="${W - R}" y2="${Y(k)}" stroke="${COR.linha}"/>${txt(L - 4, Y(k) + 3, k, { a: 'end', c: COR.mute, s: 8 })}`;
  const pts = [];
  sem.forEach((s, i) => {
    const x = L + i * bw + bw * 0.2, w = bw * 0.6, outros = Math.max(0, s.uteis - s.trabalhados - s.parados);
    let y = H - B;
    [[s.trabalhados, COR.real], [s.parados, COR.chuva], [outros, COR.cinza]].forEach(([v, c]) => { if (v > 0) { const h = (H - T - B) * v / M; y -= h; g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`; } });
    if (s.efetivo) pts.push([x + w / 2, YE(s.efetivo), s.efetivo]);
    if (n <= 13 || i % 2 === 0) g += txt(x + w / 2, H - 10, fc(s.ini), { a: 'middle', s: 8, c: COR.mute });
  });
  if (pts.length) g += `<polyline fill="none" stroke="${COR.proj}" stroke-width="2" points="${pts.map(p => p[0] + ',' + p[1]).join(' ')}"/>` + pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="${COR.proj}"/>${txt(p[0], p[1] - 5, p[2], { a: 'middle', s: 8, b: 1, c: COR.proj })}`).join('');
  return svgImg(W, H, g);
}
/* prazo por etapa (tipo Gantt): previsto, quanto já foi feito e o término projetado */
function grGantt(ets, hj) {
  const l = ets.filter(e => e.inicio && e.termino).slice(0, 16);
  if (!l.length) return '';
  const W = 548, LW = 150, R = 10, lh = 22, T = 30, H = T + l.length * lh + 22;
  const ini = l.map(e => e.inicio).sort()[0], fim = [...l.map(e => e.termino), ...l.map(e => e.projecao).filter(Boolean), hj].sort().pop();
  const x0 = tsD(ini), x1 = tsD(fim) + 864e5, X = s => LW + (tsD(s) - x0) / ((x1 - x0) || 1) * (W - LW - R);
  let g = legenda([[COR.cinza, 'previsto', 'barra'], [COR.real, 'executado', 'barra'], ['#F2A49A', 'atraso projetado', 'barra'], [COR.proj, 'término projetado']], 10, LW);
  const longo = (x1 - x0) / 864e5 > 120;
  for (let k = 0; k <= 5; k++) { const t = x0 + (x1 - x0) * k / 5, s = new Date(t).toISOString().slice(0, 10), x = X(s); g += `<line x1="${x}" y1="${T - 6}" x2="${x}" y2="${H - 18}" stroke="${COR.linha}"/>${txt(x, H - 6, longo ? mesAno(s) : fc(s), { a: 'middle', s: 8, c: COR.mute })}`; }
  l.forEach((e, i) => {
    const y = T + i * lh, xa = X(e.inicio), xb = X(e.termino) + 2, w = Math.max(3, xb - xa);
    g += txt(0, y + 10, roCurto(e.nome, 30), { s: 9, b: 1, c: COR.azul });
    if (e.projecao && e.projecao > e.termino) g += `<rect x="${xb}" y="${y + 2}" width="${Math.max(2, X(e.projecao) - xb + 2)}" height="10" rx="2" fill="#F2A49A"/>`;
    g += `<rect x="${xa}" y="${y + 2}" width="${w}" height="10" rx="2" fill="${COR.cinza}"/><rect x="${xa}" y="${y + 2}" width="${w * Math.min(100, e.pct) / 100}" height="10" rx="2" fill="${COR.real}"/>`;
    if (e.projecao && e.situacao !== 'concluido') g += `<path d="M${X(e.projecao) + 2} ${y + 1} l4 6 -4 6 -4 -6z" fill="${COR.proj}"/>`;
  });
  if (hj >= ini && hj <= fim) g += `<line x1="${X(hj)}" y1="${T - 8}" x2="${X(hj)}" y2="${H - 18}" stroke="${COR.azul}" stroke-dasharray="2 3"/>${txt(X(hj), T - 10, 'hoje', { a: 'middle', s: 8.5, b: 1, c: COR.azul })}`;
  return svgImg(W, H, g);
}
/* barras horizontais agrupadas (valores em R$): linhas [{nome, vals:[]}], séries [[cor, nome]] */
function grGrupos(linhas, series, fmt = brlC) {
  const W = 548, LW = 150, R = 66, bh = 8, gap = 10, k = series.length, lh = k * (bh + 2) + gap, T = 18, H = T + linhas.length * lh + 4;
  const M = Math.max(1, ...linhas.flatMap(l => l.vals.map(v => Math.abs(v || 0))));
  const X = v => (W - LW - R) * Math.max(0, v) / M;
  let g = legenda(series.map(s => [s[0], s[1], 'barra']), 10, LW);
  linhas.forEach((l, i) => {
    const y = T + i * lh + 4;
    g += txt(0, y + k * (bh + 2) / 2 + 3, roCurto(l.nome, 30), { s: 9, b: 1, c: COR.azul });
    l.vals.forEach((v, j) => { const yy = y + j * (bh + 2), cor = (l.cores && l.cores[j]) || series[j][0]; if (v) g += `<rect x="${LW}" y="${yy}" width="${X(v)}" height="${bh}" rx="2" fill="${cor}"/>${txt(LW + X(v) + 4, yy + 7, fmt(v), { s: 8, c: COR.txt })}`; });
  });
  return svgImg(W, H, g);
}
/* barras horizontais empilhadas (contagens) */
function grEmpilhado(linhas, series) {
  const W = 548, LW = 150, R = 40, lh = 20, T = 18, H = T + linhas.length * lh + 4;
  const M = Math.max(1, ...linhas.map(l => l.vals.reduce((t, v) => t + v, 0)));
  let g = legenda(series.map(s => [s[0], s[1], 'barra']), 10, LW);
  linhas.forEach((l, i) => {
    const y = T + i * lh + 4;
    let x = LW;
    g += txt(0, y + 9, roCurto(l.nome, 30), { s: 9, b: 1, c: COR.azul });
    l.vals.forEach((v, j) => { const w = (W - LW - R) * v / M; if (w > 0) { g += `<rect x="${x}" y="${y}" width="${w}" height="12" fill="${series[j][0]}"/>${w > 16 ? txt(x + w / 2, y + 9, v, { a: 'middle', s: 8, b: 1, c: '#fff' }) : ''}`; x += w; } });
  });
  return svgImg(W, H, g);
}

/* ---------- tela ---------- */
async function vRelObra() {
  titulo('Relatório da obra');
  if (!orPode() && !can('exec_planejar')) return view('<div class="card vazio"><p>Você não tem acesso ao relatório desta obra.</p></div>');
  if (RO.obra !== S.obraId || !RO.de) { Object.assign(RO, { obra: S.obraId, editado: false, texto: '', dados: null, pdf: null }); roAtalho('mes', true); }
  if (RO.modelo === 'gerencial' && !orGere()) RO.modelo = 'andamento';
  view(`<div class="rel-hero">
      <div class="rel-hero-t"><span class="rel-sel">${ic('chart')} Relatório geral da obra</span><h2>Relatório da obra</h2><p>${esc(S.dados.obra.nome)}</p></div></div>
    <div class="rel-grid"><div class="rel-col">
      <section class="card rel-sec"><div class="rel-h"><b>1</b><div><h3>Modelo</h3><small>Para quem é o relatório</small></div></div><div class="rel-tipos ro-mods" id="roMods"></div></section>
      <section class="card rel-sec"><div class="rel-h"><b>2</b><div><h3>Período</h3><small>O avanço "no período" e as fotos usam estas datas; o acumulado é sempre até a data final</small></div></div>
        <div class="rel-atalhos" id="roAt"></div>
        <div class="g2"><label>De<input type="date" id="roDe"></label><label>Até<input type="date" id="roAte"></label></div>
        <label class="ck"><input type="checkbox" id="roFotos"> Incluir as fotos do período (últimas 6 dos diários)</label></section>
      <section class="card rel-sec"><div class="rel-h"><b>3</b><div><h3>Resumo</h3><small>Sugestão automática — edite à vontade</small></div></div>
        <textarea id="roTxt" rows="8" placeholder="Resumo que abre o relatório"></textarea>
        <div class="acoes"><button type="button" class="btn sec peq" id="roRefaz">${ic('refresh')} Refazer sugestão</button></div></section>
    </div><div class="rel-col"><section class="card rel-sec rel-prevcard"><div class="rel-h"><b>4</b><div><h3>Prévia</h3><small>É assim que o PDF vai sair</small></div></div>
      <div id="relPrev"></div>
      <div class="rel-acoes" id="roAcoes">
        <button type="button" class="btn" id="roBaixar">${ic('download')} Baixar PDF</button>
        <button type="button" class="btn zap" id="roZap">${ic('whats')} WhatsApp</button>
        <button type="button" class="btn sec" id="roMail">${ic('mail')} E-mail</button></div></section></div></div>`);
  roMods(); roAtalhos();
  $('#roDe').value = RO.de; $('#roAte').value = RO.ate; $('#roFotos').checked = RO.fotos;
  $('#roDe').onchange = $('#roAte').onchange = () => { RO.de = $('#roDe').value; RO.ate = $('#roAte').value; if (RO.de && RO.ate) roCarregar(); };
  $('#roFotos').onchange = () => { RO.fotos = $('#roFotos').checked; roCarregar(); };
  $('#roTxt').value = RO.texto;
  $('#roTxt').oninput = e => { RO.texto = e.target.value; RO.editado = true; RO.pdf = null; roPrev(); };
  $('#roRefaz').onclick = () => { RO.editado = false; if (RO.dados) { RO.texto = roTextoAuto(RO.dados); $('#roTxt').value = RO.texto; RO.pdf = null; roPrev(); } };
  $('#roBaixar').onclick = e => roComPdf(e.currentTarget, blob => { baixarBlob(blob, roNome()); toast('PDF baixado.'); });
  $('#roZap').onclick = roZap; $('#roMail').onclick = roEmail;
  roCarregar();
}
function roMods() {
  $('#roMods').innerHTML = Object.entries(RO_MOD).filter(([k]) => k !== 'gerencial' || orGere()).map(([k, v]) => `<button type="button" class="rel-tipo ${k === RO.modelo ? 'on' : ''}" data-m="${k}">${ic(v[2])}<b>${v[0]}</b><small>${v[1]}</small></button>`).join('')
    + (orGere() ? '' : '<small class="ct-dica">O modelo gerencial (com valores) é só para quem gerencia o orçamento.</small>');
  $$('#roMods [data-m]').forEach(b => { b.onclick = () => { RO.modelo = b.dataset.m; if (!RO.editado) RO.texto = ''; roMods(); roCarregar(); }; });
}
const RO_AT = [['mes', 'Este mês'], ['mesant', 'Mês passado'], ['sem', 'Últimos 7 dias'], ['d30', 'Últimos 30 dias'], ['tudo', 'Desde o início']];
function roAtalhos() {
  $('#roAt').innerHTML = RO_AT.map(([k, t]) => `<button type="button" class="rel-at" data-a="${k}">${t}</button>`).join('');
  $$('#roAt [data-a]').forEach(b => { b.onclick = () => { roAtalho(b.dataset.a); $('#roDe').value = RO.de; $('#roAte').value = RO.ate; roCarregar(); }; });
}
function roAtalho(k) {
  const h = hoje(), m1 = h.slice(0, 8) + '01';
  if (k === 'mes') { RO.de = m1; RO.ate = h; }
  else if (k === 'mesant') { const a = addD(m1, -1); RO.de = a.slice(0, 8) + '01'; RO.ate = a; }
  else if (k === 'sem') { RO.de = addD(h, -6); RO.ate = h; }
  else if (k === 'd30') { RO.de = addD(h, -29); RO.ate = h; }
  else if (k === 'tudo') { RO.de = (RO.dados && RO.dados.geral.inicio) || addD(h, -365); RO.ate = h; }
}
async function roCarregar() {
  const t = ++RO.tok;
  RO.dados = null; RO.erro = ''; RO.pdf = null; roPrev();
  try {
    const r = await api('obra_relatorio', { modelo: RO.modelo, de: RO.de, ate: RO.ate, fotos: RO.fotos });
    if (t !== RO.tok) return;
    RO.dados = r;
    if (!RO.editado) { RO.texto = roTextoAuto(r); const x = $('#roTxt'); if (x) x.value = RO.texto; }
  } catch (e) { if (t !== RO.tok) return; RO.erro = e.message; }
  roPrev();
}
function roPrev() {
  const el = $('#relPrev'); if (!el) return;
  $$('#roAcoes button').forEach(b => { b.disabled = !RO.dados; });
  if (RO.erro) { el.style.height = ''; el.innerHTML = `<div class="rel-vazio erro">${esc(RO.erro)}</div>`; return; }
  if (!RO.dados) { el.style.height = ''; el.innerHTML = '<div class="rel-vazio"><span class="spin"></span>Calculando…</div>'; return; }
  el.innerHTML = `<div class="rel-esc" id="relEsc">${roFolha(RO.dados)}</div>`;
  relEscala();
  $$('#relEsc img').forEach(i => { if (!i.complete) i.onload = relEscala; });
}

/* texto que abre o relatório */
function roTextoAuto(r) {
  const G = r.geral, p = [], per = `${fd(r.de)} a ${fd(r.ate)}`;
  p.push(`A obra está com ${fmtP(G.pct)}% executado${G.pct_prev > 0 ? ` (o previsto até ${fd(r.ate)} era ${fmtP(G.pct_prev)}%)` : ''}. De ${per} o avanço foi de ${fmtP(G.avanco)} pontos percentuais, com ${plural(r.periodo.trabalhados, 'dia trabalhado', 'dias trabalhados')}${r.periodo.parados ? ` e ${plural(r.periodo.parados, 'dia parado', 'dias parados')} por chuva` : ''}.`);
  if (G.termino) {
    if (G.atraso > 0) {
      const crit = r.etapas.filter(e => e.situacao === 'atrasado').slice(0, 3).map(e => e.nome);
      p.push(`No ritmo atual, o término projetado é ${fd(G.projecao)}, ${plural(G.atraso, 'dia útil', 'dias úteis')} depois do previsto (${fd(G.termino)}).${crit.length ? ' Pontos críticos: ' + crit.join('; ') + '.' : ''}`);
    } else p.push(`No ritmo atual, o término previsto (${fd(G.termino)}) está mantido.`);
  }
  if (G.usa_orcamento && G.pct_programado < 99.5) p.push(`As etapas abertas até agora cobrem ${fmtP(G.pct_programado)}% da obra; o restante ainda será programado.`);
  if (r.modelo === 'gerencial' && r.emp && r.emp.tem) {
    const E = r.emp;
    p.push(`Financeiro: gasto até agora ${brl(E.custo_real)} para ${fmtP(E.pct)}% executado; custo estimado no fim ${brl(E.custo_fim)} (${E.desvio > 0.005 ? brl(E.desvio) + ' acima' : E.desvio < -0.005 ? brl(-E.desvio) + ' abaixo' : 'igual ao'} do orçado). Lucro projetado ${brl(E.lucro_proj)}, margem ${fmtP(E.margem_proj)}% (orçada ${fmtP(E.margem_orcada)}%).`);
  }
  return p.join('\n\n');
}

/* ---------- a folha (a mesma na prévia e no PDF) ---------- */
function roFolha(r) {
  const G = r.geral, ger = r.modelo === 'gerencial', hj = r.hoje;
  const sec = (t, corpo, cl = '') => `<div class="rl-sec ${cl}"><div class="rl-sec-t">${t}</div>${corpo}</div>`;
  const kpi = (v, t, cl = '') => `<div class="rl-kpi ${cl}"><b>${v}</b><span>${t}</span></div>`;
  const S = G.servicos;
  const kpis = `<div class="ro-kpis rl-cut">
    ${kpi(fmtP(G.pct) + '<small>%</small>', 'executado até ' + fc(r.ate))}
    ${kpi('+' + fmtP(G.avanco) + '<small> p.p.</small>', 'avanço no período')}
    ${kpi(G.pct_prev > 0 ? fmtP(G.pct_prev) + '<small>%</small>' : '—', 'previsto até ' + fc(r.ate), G.pct_prev > G.pct + 2 ? 'risco' : '')}
    ${kpi(G.projecao && G.termino ? fd(G.projecao) : '—', G.termino ? `término projetado · previsto ${fd(G.termino)}` : 'término projetado', G.atraso > 0 ? 'risco' : '')}
    ${kpi(G.atraso > 0 ? G.atraso + '<small> dias úteis</small>' : 'No prazo', G.atraso > 0 ? 'de atraso projetado' : 'pelo ritmo atual', G.atraso > 0 ? 'ro-verm' : '')}
    ${kpi(`${S.atrasados}<small> atrasados</small>`, `${S.risco} em risco · ${S.no_prazo} no prazo · ${S.concluidos} concluídos de ${S.total}`, S.atrasados ? 'ro-verm' : '')}
  </div>`;
  // curva S
  const dts = r.curva.map(c => c.data);
  const curva = r.curva.length > 1 ? grLinhas(dts, [
    { nome: 'previsto', cor: COR.prev, vals: r.curva.map(c => c.previsto), trac: true },
    { nome: 'realizado', cor: COR.real, vals: r.curva.map(c => c.realizado), grosso: true },
    { nome: 'projetado (ritmo atual)', cor: COR.proj, vals: r.curva.map(c => c.projetado), trac: true }
  ], { max: 'pct', hoje: hj }) : '<p class="rl-vazio">Ainda não há etapas com datas para montar a curva.</p>';
  // por frente
  const frs = r.frentes;
  const frBar = frs.length ? grBarrasPct(frs.map(f => ({ nome: f.nome, pct: f.pct, prev: f.pct_prev }))) : '';
  const frTab = frs.map(f => `<div class="rl-bloco rl-et"><div class="rl-et-t"><div><b>${esc(f.nome)}</b><small>${f.etapas ? plural(f.etapas, 'etapa', 'etapas') + ' · ' : ''}${f.termino ? `término previsto ${fd(f.termino)}${f.projecao && f.projecao !== f.termino ? ' · projetado ' + fd(f.projecao) : ''}` : 'sem etapa programada'}</small>${f.etapas ? roSit(f.situacao) : ''}</div>
      <div class="rl-pct">${fmtP(f.pct)}%<small>+${fmtP(f.pct - f.pct_ini)} p.p. no período</small></div></div>
    <table class="rl-t"><thead><tr><th>Serviço</th><th class="n">Previsto</th><th class="n">Executado</th><th class="n">No período</th><th class="bar">%</th></tr></thead><tbody>
    ${f.itens.map(i => `<tr><td>${i.codigo ? `<small>${esc(i.codigo)}</small>` : ''}${esc(i.servico)}</td>${ehVerba(i.unidade) ? `<td class="n">verba</td><td class="n">${qun(i.executado, i.unidade, i.qtd)}</td><td class="n">${i.periodo ? qun(i.periodo, i.unidade, i.qtd) : '—'}</td>` : `<td class="n">${nf(i.qtd)} ${esc(i.unidade)}</td><td class="n">${nf(i.executado)}</td><td class="n">${i.periodo ? nf(i.periodo) : '—'}</td>`}<td class="bar"><span class="rl-bar">${i.pct > 0 ? `<i style="width:${Math.max(1.5, Math.min(100, i.pct))}%"></i>` : ''}</span><small>${fmtP(i.pct)}%</small></td></tr>`).join('')}
    </tbody></table></div>`).join('');
  // prazos
  const ets = r.etapas;
  const prazos = ets.length ? grGantt(ets, hj) + `<div class="rl-bloco"><table class="rl-t ro-prazo"><thead><tr><th>Etapa · serviço</th><th class="n">Feito</th><th class="n">Ritmo atual</th><th class="n">Ritmo p/ cumprir</th><th class="n">Término</th></tr></thead><tbody>
    ${ets.map(e => e.itens.filter(i => i.situacao !== 'concluido' || e.situacao === 'concluido').map((i, k) => `<tr class="${k ? 'ro-sub' : ''}"><td>${k ? '' : `<b class="ro-et">${esc(e.nome)}</b>`}${esc(i.servico)}<br>${roSit(i.situacao)}</td>
      <td class="n">${fmtP(i.pct)}%<small>${ehVerba(i.unidade) ? 'da verba' : `${nf(i.executado)} de ${nf(i.prevista)} ${esc(i.unidade)}`}</small></td>
      <td class="n">${i.ritmo ? esc(qun(i.ritmo, i.unidade, i.prevista)) + '/dia' : '—'}</td>
      <td class="n">${i.situacao === 'concluido' ? '—' : i.ritmo_nec == null ? '<b class="rl-venc">prazo vencido</b>' : `<b class="${i.ritmo && i.ritmo_nec > i.ritmo * 1.05 ? 'rl-venc' : ''}">${esc(qun(i.ritmo_nec, i.unidade, i.prevista))}/dia</b>`}</td>
      <td class="n">previsto ${fc(i.termino)}${i.projecao && i.situacao !== 'concluido' ? `<small class="${i.atraso ? 'atrasado' : ''}">projetado ${fc(i.projecao)}${i.atraso ? ' · +' + i.atraso + ' d.u.' : ''}</small>` : ''}</td></tr>`).join('')).join('')}
    </tbody></table></div>` : '<p class="rl-vazio">Nenhuma etapa aberta.</p>';
  // semanas e clima
  const P = r.periodo;
  const semanas = r.semanas.length ? `<div class="ro-sub-t">Avanço por semana (pontos percentuais da obra)</div>${grColunas(r.semanas)}<div class="ro-sub-t">Dias trabalhados, chuva e efetivo por semana</div>${grClima(r.semanas)}` : '';
  const clima = `<div class="ro-kpis ro-k4 rl-cut">${kpi(P.uteis, 'dias úteis no período')}${kpi(P.trabalhados, 'dias com produção')}${kpi(P.parados, 'parados por chuva' + (P.chuva_mm ? ` · ${nf(P.chuva_mm)} mm` : ''), 'chuva')}${kpi(P.efetivo || '—', 'efetivo médio (pessoas/dia)')}</div>`;
  const ocor = r.ocorrencias.length ? sec('Ocorrências do período', `<div class="rl-lis">${r.ocorrencias.map(o => `<div class="rl-li"><b>${fc(o.data)}</b><span>${esc(o.texto)}</span></div>`).join('')}</div>`) : '';
  const fotos = r.fotos.length ? sec('Registro fotográfico', `<div class="ro-fotos">${r.fotos.map(f => `<figure class="rl-cut"><div class="ro-foto" style="background-image:url(data:image/jpeg;base64,${f.b64})"></div><figcaption><b>${fd(f.data)}</b>${f.etapa ? ' · ' + esc(f.etapa) : ''}${f.legenda ? '<br>' + esc(f.legenda) : ''}</figcaption></figure>`).join('')}</div>`) : '';
  const nota = `Avanço físico ${G.usa_orcamento ? 'ponderado pelo valor dos serviços do orçamento da obra' : 'pela média dos serviços das etapas'}. Previsto: datas originais das etapas. Projeção: ritmo dos últimos 7 dias trabalhados, em dias úteis${G.taxa_chuva ? `, descontando ${fmtP(G.taxa_chuva)}% de dias parados por chuva (média dos últimos 60 dias)` : ''}.${G.usa_orcamento && G.pct_programado < 99.5 ? ` As etapas abertas cobrem ${fmtP(G.pct_programado)}% da obra: a curva prevista e a projetada só vão até aí.` : ''}`;

  // gerencial
  let gerHtml = '';
  if (ger) {
    const E = r.emp, outros = E.adm_local + E.indiretas + E.tributos;
    const pontos = r.pontos.length ? sec('Pontos para a reunião', `<div class="ro-pontos">${r.pontos.map(p => `<div class="ro-ponto ${p.nivel} rl-cut"><i></i><span>${esc(p.texto)}</span></div>`).join('')}</div>`) : '';
    const res = E.tem ? sec('Resultado do empreendimento', `<div class="ro-kpis rl-cut">
        ${kpi(brlC(E.receita), 'receita contratada')}
        ${kpi(brlC(E.custo_direto), 'custo direto orçado · + ' + brlC(outros) + ' adm, indiretas e tributos')}
        ${kpi(brlC(E.lucro_orcado), 'lucro orçado · margem ' + fmtP(E.margem_orcada) + '%')}
        ${kpi(brlC(E.custo_real), `gasto até agora · previsto p/ o avanço ${brlC(E.custo_previsto)}`, E.custo_real > E.custo_previsto * 1.1 ? 'risco' : '')}
        ${kpi(brlC(E.custo_fim), `custo estimado no fim · ${E.desvio > 0.005 ? '+' + brlC(E.desvio) + ' sobre o orçado' : E.desvio < -0.005 ? brlC(E.desvio) + ' abaixo do orçado' : 'igual ao orçado'}`, E.desvio > 0.005 ? 'ro-verm' : '')}
        ${kpi(brlC(E.lucro_proj), 'lucro projetado · margem ' + fmtP(E.margem_proj) + '%', E.lucro_proj < E.lucro_orcado - 0.005 ? 'ro-verm' : '')}</div>
      ${r.custo.length > 1 ? `<div class="ro-sub-t">Gasto real × custo orçado para o avanço executado</div>` + grLinhas(r.custo.map(c => c.data), [{ nome: 'custo orçado p/ o avanço', cor: COR.prev, vals: r.custo.map(c => c.previsto), trac: true }, { nome: 'gasto real', cor: COR.real, vals: r.custo.map(c => c.real), grosso: true }], { fmt: brlC, alto: 190 }) : ''}`) : '';
    const fe = frs.filter(f => f.emp && f.emp.tem);
    const porFrente = fe.length ? sec('Custo e resultado por frente', grGrupos(fe.map(f => ({ nome: f.nome, vals: [f.emp.custo_direto, f.emp.custo_real, f.emp.custo_fim], cores: [null, null, f.emp.desvio > 0.005 ? COR.verm : COR.proj] })), [[COR.prev, 'custo orçado'], [COR.real, 'gasto até agora'], [COR.proj, 'estimado no fim (vermelho = acima do orçado)']])
      + `<div class="rl-bloco"><table class="rl-t ro-fin"><thead><tr><th>Frente</th><th class="n">Receita</th><th class="n">Avanço</th><th class="n">Custo orçado</th><th class="n">Gasto</th><th class="n">No fim</th><th class="n">Desvio</th><th class="n">Lucro proj.</th></tr></thead><tbody>
      ${fe.map(f => { const x = f.emp; return `<tr class="${x.desvio > 0.005 ? 'ro-def' : ''}"><td><b>${esc(f.nome)}</b></td><td class="n">${brlC(x.receita)}</td><td class="n">${fmtP(f.pct)}%</td><td class="n">${brlC(x.custo_direto)}</td><td class="n">${brlC(x.custo_real)}</td><td class="n">${brlC(x.custo_fim)}</td><td class="n"><b>${x.desvio > 0.005 ? '+' : ''}${brlC(x.desvio)}</b></td><td class="n">${brlC(x.lucro_proj)}<small>${fmtP(x.margem_proj)}%</small></td></tr>`; }).join('')}
      <tr class="ro-tot"><td><b>Total</b></td><td class="n">${brlC(E.receita)}</td><td class="n">${fmtP(E.pct)}%</td><td class="n">${brlC(E.custo_direto)}</td><td class="n">${brlC(E.custo_real)}</td><td class="n">${brlC(E.custo_fim)}</td><td class="n"><b>${E.desvio > 0.005 ? '+' : ''}${brlC(E.desvio)}</b></td><td class="n">${brlC(E.lucro_proj)}<small>${fmtP(E.margem_proj)}%</small></td></tr>
      </tbody></table></div>`) : '';
    const fm = frs.filter(f => f.fin && f.fin.materiais);
    const mats = sec('Materiais', (fm.length ? grEmpilhado(fm.map(f => ({ nome: f.nome, vals: [f.fin.materiais - f.fin.falta_comprar, f.fin.falta_comprar] })), [[COR.real, 'materiais comprados'], [COR.verm, 'falta comprar (tudo ou parte)']]) : '')
      + (r.materiais.length ? `<div class="rl-bloco"><table class="rl-t"><thead><tr><th>Falta comprar</th><th>Frente</th><th class="n">Necessário</th><th class="n">Comprado</th><th class="n">Falta</th></tr></thead><tbody>
      ${r.materiais.map(m => `<tr><td>${esc(m.descricao)}</td><td><small>${esc(m.frente)}</small></td><td class="n">${nf(m.necessario)} ${esc(m.unidade)}</td><td class="n">${nf(m.comprado + m.em_compra)}${m.em_compra ? '<small>com ' + nf(m.em_compra) + ' em compra</small>' : ''}</td><td class="n"><b class="rl-venc">${nf(m.falta)}</b></td></tr>`).join('')}
      </tbody></table>${r.materiais_total > r.materiais.length ? `<small>+${r.materiais_total - r.materiais.length} materiais no painel da obra.</small>` : ''}</div>` : '<p class="rl-vazio">Nenhum material do orçamento falta comprar.</p>'));
    const mo = r.mao_obra.filter(m => m.orcado || m.contratado || m.medido);
    const maoObra = mo.length || r.a_pagar.medicoes ? sec('Mão de obra (empreiteiros)', (mo.length ? grGrupos(mo.map(m => ({ nome: m.nome, vals: [m.orcado, m.contratado, m.medido] })), [[COR.prev, 'orçado (referência)'], [COR.azul, 'contratado'], [COR.real, 'medido (aprovado/pago)']]) : '')
      + (r.a_pagar.medicoes ? `<div class="rl-chuva rk rl-cut"><b>A pagar</b><span>${plural(r.a_pagar.medicoes, 'medição aprovada', 'medições aprovadas')} aguardando pagamento: ${brl(r.a_pagar.valor)}.</span></div>` : '')) : '';
    gerHtml = { pontos, res, porFrente, mats, maoObra };
  }
  return `<div class="rl ro" id="relFolha">
    <div class="rl-top rl-cut"><div class="rl-logo"><img src="logo.png" alt="Size Engenharia"></div>
      <div class="rl-tit"><small>${esc(r.empresa)}</small><b>${RO_TIT[r.modelo]}</b><span>${esc(r.obra.nome)}${r.obra.endereco ? ' · ' + esc(r.obra.endereco) : ''}</span></div>
      <div class="rl-per"><small>Período</small><b>${fc(r.de)} a ${fc(r.ate)}</b><span>${r.ate.slice(0, 4)}</span></div></div>
    ${ger ? '<div class="ro-interno rl-cut">Uso interno · confidencial — não enviar ao cliente</div>' : ''}
    ${!r.obra.ativa ? '<div class="rl-chuva rl-cut"><b>Obra desativada</b><span>Os números são o histórico até a desativação.</span></div>' : ''}
    ${kpis}
    ${RO.texto.trim() ? `<div class="rl-callout rl-cut"><div class="rl-sec-t sm">Resumo</div>${esc(RO.texto.trim()).replace(/\n/g, '<br>')}</div>` : ''}
    ${ger ? gerHtml.pontos : ''}
    ${sec('Curva de avanço físico (curva S)', curva)}
    ${ger ? gerHtml.res : ''}
    ${frs.length ? sec('Avanço por frente', frBar + frTab) : ''}
    ${ger ? gerHtml.porFrente : ''}
    ${sec('Prazos e estimativa de atraso', prazos)}
    ${sec('Produção, clima e efetivo', clima + semanas)}
    ${ger ? gerHtml.mats + gerHtml.maoObra : ''}
    ${ocor}
    ${fotos}
    <div class="rl-leg rl-cut">${esc(nota)}</div>
    <div class="ro-ass rl-cut"><div><span></span>Responsável técnico</div><div><span></span>${ger ? 'Diretoria' : 'Contratante (ciente)'}</div></div>
    <div class="rl-nota rl-cut">Documento emitido por ${esc(r.emissor)} em ${new Date().toLocaleString('pt-BR')}.${ger ? ' Uso interno.' : ''}</div></div>`;
}

/* ---------- PDF, WhatsApp e e-mail ---------- */
const roNome = () => `Relatorio_${RO.modelo === 'gerencial' ? 'Gerencial' : 'Andamento'}_${RO.dados.obra.sigla || 'obra'}_${RO.dados.de}_a_${RO.dados.ate}.pdf`;
async function roGerarPdf() {
  if (RO.pdf) return RO.pdf;
  const d = RO.dados, ger = d.modelo === 'gerencial';
  RO.pdf = await pdfDeFolha(roFolha(d), { cab: `${RO_TIT[d.modelo]}${ger ? ' (USO INTERNO)' : ''} - ${d.obra.nome}`, rod: `${d.empresa} - ${d.obra.nome}${ger ? ' - CONFIDENCIAL' : ''}` });
  return RO.pdf;
}
async function roComPdf(botao, fn) {
  if (!RO.dados || RO.gerando) return;
  RO.gerando = true;
  const t = botao.innerHTML; botao.disabled = true; botao.innerHTML = '<span class="spin peq"></span> Gerando PDF…';
  try { await fn(await roGerarPdf()); } catch (e) { toast(e.message || 'Não consegui gerar o PDF.', 1); }
  RO.gerando = false; botao.disabled = false; botao.innerHTML = t;
}
const roMsg = () => `*${RO_TIT[RO.dados.modelo]}* - ${RO.dados.obra.nome}\nPeríodo: ${fd(RO.dados.de)} a ${fd(RO.dados.ate)}\n${RO.dados.empresa}`;
const roZap = e => roComPdf(e.currentTarget, async blob => {
  const arq = new File([blob], roNome(), { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [arq] })) {
    try { await navigator.share({ files: [arq], title: RO_TIT[RO.dados.modelo], text: roMsg() }); return; }
    catch (x) { if (x.name === 'AbortError') return; toast('PDF pronto — toque em WhatsApp de novo para enviar.'); return; }
  }
  baixarBlob(blob, roNome());
  open('https://wa.me/?text=' + enc(roMsg() + '\n(o PDF foi baixado — anexe na conversa)'), '_blank');
  toast('Este aparelho não envia o arquivo direto: o PDF foi baixado, anexe no WhatsApp.');
});
function roEmail() {
  if (!RO.dados) return;
  const d = RO.dados, ger = d.modelo === 'gerencial', ls = 'cs_relobra_para_' + S.obraId + '_' + d.modelo;
  modal('Enviar por e-mail', `${ger ? '<div class="aviso warn">Relatório gerencial: tem valores internos. Envie só para a equipe.</div>' : ''}
    <label>Para <small>(separe vários com vírgula)</small><input name="para" type="text" inputmode="email" autocomplete="email" required value="${esc(LS.get(ls))}" placeholder="${ger ? 'diretoria@sizeengenharia.com.br' : 'contratante@empresa.com.br'}"></label>
    <label>Assunto<input name="assunto" value="${esc((ger ? 'Relatório gerencial' : 'Relatório de andamento') + ' · ' + d.obra.nome + ' · ' + fc(d.de) + ' a ' + fc(d.ate))}"></label>
    <label>Mensagem<textarea name="msg" rows="4">${ger ? 'Segue o relatório gerencial' : 'Prezados, segue em anexo o relatório de andamento'} da obra ${esc(d.obra.nome)} referente ao período de ${fd(d.de)} a ${fd(d.ate)}.</textarea></label>
    <label class="ck"><input type="checkbox" name="copia" checked> Enviar uma cópia para mim</label>
    <small>O PDF vai em anexo, exatamente como na prévia.</small>`, {
    ok: 'Gerar PDF e enviar',
    onOk: async f => {
      const blob = await roGerarPdf();
      LS.set(ls, f.para.value.trim());
      toast((await api('obra_relatorio_email', { para: f.para.value, assunto: f.assunto.value, mensagem: f.msg.value, copia: f.copia.checked, pdf: { nome: roNome(), b64: await paraB64(blob) } })).msg);
    }
  });
}

ROTAS.push([/^#\/obra\/relatorio$/, vRelObra]);
