'use strict';
/* Portal do fornecedor — acesso só pelo link assinado (?t=...) enviado pela Size. */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fd = s => { if (!s) return ''; const a = String(s).slice(0, 10).split('-'); return a.length === 3 ? `${a[2]}/${a[1]}/${a[0]}` : String(s); };
const brl = v => v === '' || v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const nf = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const hoje = () => new Date().toLocaleDateString('sv-SE');
const T = new URLSearchParams(location.search).get('t') || '';

function toast(t, erro) {
  const p = document.createElement('p');
  if (erro) p.className = 'erro';
  p.textContent = t;
  $('#toast').appendChild(p);
  setTimeout(() => p.remove(), erro ? 8000 : 4500);
}
async function api(acao, d = {}) {
  let r;
  try { r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao, t: T, ...d }) }); }
  catch (e) { throw new Error('Sem conexão. Verifique a internet e tente de novo.'); }
  let j;
  try { j = JSON.parse(await r.text()); } catch (e) { throw new Error('O servidor não respondeu corretamente. Tente de novo em instantes.'); }
  if (!j.ok) throw new Error(j.erro || 'Erro');
  return j.dados;
}
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

let D = null;
async function carregar() {
  if (!T) { $('#view').innerHTML = '<div class="card aviso erro">Link incompleto. Use o link enviado pela Size Engenharia.</div>'; return; }
  try { D = await api('forn_dados'); desenhar(); }
  catch (e) { $('#view').innerHTML = `<div class="card"><div class="aviso erro">${esc(e.message)}</div></div>`; }
}

const tabelaItens = (p, comRecebido) => `<div class="rolar"><table class="tab"><tr><th>Material</th><th class="n">Qtd</th>${comRecebido ? '<th class="n">Recebido</th>' : ''}</tr>
  ${p.itens.map(i => `<tr><td>${esc(i.descricao)}</td><td class="n">${nf(i.qtd)} ${esc(i.unidade)}</td>${comRecebido ? `<td class="n">${nf((p.compra.recebido.find(r => r.item === i.item) || {}).qtd_recebida)}</td>` : ''}</tr>`).join('')}</table></div>`;

function blocoCotacao(p) {
  const o = p.orcamento;
  return `${o ? `<div class="aviso ok">Orçamento enviado em ${esc(fd(o.enviado_em))}: <b>${brl(o.valor)}</b> · entrega ${esc(o.prazo_entrega)}${o.condicao ? ' · ' + esc(o.condicao) : ''}. Você pode atualizar abaixo enquanto a cotação estiver aberta.</div>` : ''}
    <form class="grid" data-acao="forn_orcamento" data-num="${esc(p.numero)}">
      <h3 style="margin:4px 0 0">${o ? 'Atualizar orçamento' : 'Enviar orçamento'}</h3>
      <div class="g2"><label>Valor total (R$)<input name="valor" inputmode="decimal" required placeholder="0,00" value="${o ? esc(String(o.valor).replace('.', ',')) : ''}"></label>
      <label>Prazo de entrega<input name="prazo_entrega" required placeholder="ex: 3 dias úteis" value="${esc(o?.prazo_entrega || '')}"></label></div>
      <label>Condição de pagamento<input name="condicao" placeholder="ex: 28 dias boleto / à vista PIX" value="${esc(o?.condicao || D.fornecedor.condicao || '')}"></label>
      <label>Observações <small>(opcional)</small><input name="obs" placeholder="marca, validade da proposta, frete…"></label>
      <label>Orçamento em PDF ou foto <small>(opcional)</small><input type="file" name="arquivo" accept="application/pdf,image/*"></label>
      <button class="btn">${o ? 'Atualizar orçamento' : 'Enviar orçamento'}</button>
    </form>`;
}

function blocoCompra(p) {
  const c = p.compra;
  const situacao = c.fin === 'Aguardando pagamento'
    ? '<div class="aviso warn"><b>Aguardando pagamento antecipado.</b> Assim que for pago, o comprovante aparece aqui e a entrega fica liberada.</div>'
    : c.liberada
      ? `<div class="aviso ok"><b>Entrega liberada.</b> Local: ${esc(D.obra.nome)}${D.obra.endereco ? ' — ' + esc(D.obra.endereco) : ''}.${c.entrega === 'Recebido' ? ' Material recebido na obra. Obrigado!' : ''}</div>`
      : '<div class="aviso info"><b>Compra aprovada.</b> Aguarde a liberação da entrega pela Size. Você já pode informar a data prevista.</div>';
  return `${situacao}
    <dl class="kv"><dt>Valor</dt><dd>${brl(c.valor)}</dd><dt>Pagamento</dt><dd>${esc(c.condicao)}${c.prazo_fat ? ' ' + esc(c.prazo_fat) + ' dias' : ''}${c.pago_em ? ' · pago em ' + fd(c.pago_em) : ''}</dd>
      ${c.previsao ? `<dt>Entrega prevista</dt><dd>${fd(c.previsao)}</dd>` : ''}${c.nf_numero ? `<dt>Nota fiscal</dt><dd>${esc(c.nf_numero)}${c.nf_em ? ' · ' + fd(c.nf_em) : ''}</dd>` : ''}</dl>
    ${c.comprovantes.length ? `<div class="acoes" style="margin:10px 0">${c.comprovantes.map(a => `<button type="button" class="btn sec peq" data-comp="${esc(a.id)}" data-num="${esc(p.numero)}">Comprovante: ${esc(a.nome)}</button>`).join('')}</div>` : ''}
    ${c.entrega !== 'Recebido' ? `<form class="grid" data-acao="forn_entrega" data-num="${esc(p.numero)}" style="margin-top:14px">
      <h3 style="margin:0">Data prevista de entrega</h3>
      <div class="g2"><label>Data<input type="date" name="previsao" min="${hoje()}" required value="${esc(c.previsao || '')}"></label><label>Observação <small>(opcional)</small><input name="obs" placeholder="ex: entrega pela manhã"></label></div>
      <button class="btn sec">Salvar data de entrega</button></form>` : ''}
    <form class="grid" data-acao="forn_nf" data-num="${esc(p.numero)}" style="margin-top:14px">
      <h3 style="margin:0">Nota fiscal ${c.notas.length ? `<small>(${c.notas.length} enviada${c.notas.length > 1 ? 's' : ''})</small>` : ''}</h3>
      <small>Pode enviar antes ou depois da entrega — não trava o processo.</small>
      <div class="g2"><label>Número da NF<input name="nf_numero" inputmode="numeric"></label><label>Data de emissão<input type="date" name="nf_data" value="${hoje()}"></label></div>
      <label>PDF ou foto da nota<input type="file" name="arquivo" accept="application/pdf,image/*" required></label>
      <button class="btn">Enviar nota fiscal</button></form>`;
}

const MSG = {
  analise: '<div class="aviso info">Proposta recebida e <b>em análise</b>. Você será avisado se for escolhida.</div>',
  nao_escolhido: '<div class="aviso">Agradecemos a proposta. Para este pedido foi escolhida outra opção.</div>',
  cancelado: '<div class="aviso">Este pedido foi cancelado pela Size.</div>'
};

function desenhar() {
  $('#view').innerHTML = `<div class="card"><h2>${esc(D.fornecedor.nome)}</h2>
      <p class="mute" style="margin:6px 0 0">Obra <b>${esc(D.obra.nome)}</b>${D.obra.endereco ? ' — ' + esc(D.obra.endereco) : ''} · ${esc(D.empresa)}</p></div>
    ${D.pedidos.map(p => `<div class="card"><div class="cab"><h2>Pedido ${esc(p.numero)}</h2>${p.necessidade ? `<span class="badge b-apr">necessário até ${fd(p.necessidade)}</span>` : ''}</div>
      ${tabelaItens(p, p.etapa === 'compra')}
      ${p.observacoes ? `<p class="mute">Obs.: ${esc(p.observacoes)}</p>` : ''}
      <div style="margin-top:12px">${p.etapa === 'cotacao' ? blocoCotacao(p) : p.etapa === 'compra' ? blocoCompra(p) : MSG[p.etapa]}</div></div>`).join('')}
    <p class="mute" style="text-align:center"><small>Dúvidas: fale com o setor de Compras da ${esc(D.empresa)}.</small></p>`;

  $$('form[data-acao]').forEach(f => {
    f.onsubmit = async e => {
      e.preventDefault();
      const b = $('button', f), t = b.textContent;
      b.disabled = true; b.textContent = 'Enviando…';
      try {
        const d = { numero: f.dataset.num };
        $$('input', f).forEach(i => { if (i.type !== 'file') d[i.name] = i.value; });
        const arq = $('input[type=file]', f);
        if (arq) d.arquivo = await lerArquivo(arq);
        toast((await api(f.dataset.acao, d)).msg);
        await carregar();
      } catch (x) { toast(x.message, 1); b.disabled = false; b.textContent = t; }
    };
  });
  $$('[data-comp]').forEach(b => {
    b.onclick = async () => {
      const w = window.open('', '_blank');
      try {
        const a = await api('forn_arquivo', { numero: b.dataset.num, id: b.dataset.comp });
        const bytes = Uint8Array.from(atob(a.b64), c => c.charCodeAt(0)), u = URL.createObjectURL(new Blob([bytes], { type: a.mime }));
        if (w) w.location = u; else location.href = u;
      } catch (x) { if (w) w.close(); toast(x.message, 1); }
    };
  });
}

carregar();
