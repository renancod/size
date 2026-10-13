'use strict';
/* =====================================================================
 * MINUTA do contrato de empreiteiro em PDF (texto de verdade, não imagem), montada com o que foi cadastrado em ctr.js.
 * As cláusulas seguem os modelos de contrato de mão de obra da Size (VN × Prime Beach e Confiança × Verde Mar); o que muda
 * de contrato para contrato (partes, objeto, preço, pagamento, prazo, multas, garantia, foro) vem dos campos do cadastro.
 * Revise a minuta antes de assinar: ela é um ponto de partida, não substitui a conferência do jurídico.
 * ===================================================================== */
const CT_UNID = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const CT_DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CT_CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function ctAte999(n) {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100, p = [];
  if (c) p.push(CT_CEM[c]);
  if (r) p.push(r < 20 ? CT_UNID[r] : CT_DEZ[Math.floor(r / 10)] + (r % 10 ? ' e ' + CT_UNID[r % 10] : ''));
  return p.join(' e ');
}
function ctInteiro(n) {
  if (n === 0) return 'zero';
  const partes = [];
  [[1e9, 'bilhão', 'bilhões'], [1e6, 'milhão', 'milhões'], [1e3, 'mil', 'mil']].forEach(([b, s, p]) => {
    const q = Math.floor(n / b);
    if (q) { partes.push({ t: b === 1e3 && q === 1 ? 'mil' : ctAte999(q) + ' ' + (q === 1 ? s : p), v: q * b }); n %= b; }
  });
  if (n) partes.push({ t: ctAte999(n), v: n });
  // "mil e duzentos", "setecentos e quatorze mil, duzentos e quatro": o último grupo liga com "e" só quando é menor que 100 ou redondo
  return partes.map((p, i) => i === 0 ? p.t : (i === partes.length - 1 && (p.v < 100 || p.v % 100 === 0) ? ' e ' : ', ') + p.t).join('');
}
function ctReais(v) {
  const cent = Math.round((Number(v) || 0) * 100), r = Math.floor(cent / 100), c = cent % 100;
  return [r ? ctInteiro(r) + (r === 1 ? ' real' : ' reais') : '', c ? ctInteiro(c) + (c === 1 ? ' centavo' : ' centavos') : ''].filter(Boolean).join(' e ') || 'zero reais';
}
const ctDataExt = s => { if (!s) return ''; const m = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'], a = String(s).split('-'); return `${+a[2]} de ${m[+a[1] - 1]} de ${a[0]}`; };

/* cláusulas: cada item é um parágrafo numerado; ['sub', texto] é um subitem (alínea) sem número */
function ctClausulas(d) {
  const emp = d.emp, nomeEmp = emp.empresa || emp.nome, r = d.resumo, B = v => brl(v), valor = r.contratado;
  const per = (d.pag_periodicidade || 'Mensal').toLowerCase(), obra = d.obra.nome + (d.obra.endereco ? ' (' + d.obra.endereco + ')' : '');
  const sub = t => ['sub', t], pc = n => String(n).replace('.', ',');
  const forma = (d.pag_forma === 'Valor fixo / parcelas' ? '' : `mediante medição ${per}, `) + (d.pag_obs || 'à vista, após a aprovação da medição pela CONTRATANTE');
  const perm = Number(d.permuta_valor) || 0, saldo = Math.round((valor - perm) * 100) / 100;
  const nf = Number(d.fat_nf_pct) || 0, rc = Number(d.fat_recibo_pct) || 0;
  const docs = ['Relatórios de execução e registros de produtividade;', 'Recibo quitado do pagamento dos salários, cópia do cartão ponto e recibos de férias, 13º salário e rescisões quitadas (quando houver);',
    'GPS, GFIP/SEFIP quitadas, com a relação de trabalhadores e protocolo, inclusive do 13º salário;', 'Certidões negativas de débito: Dívida Ativa da União e tributos federais, FGTS (com a guia de pagamento), INSS, municipal e estadual.'];
  const C = [];
  C.push({ t: 'DO OBJETO', p: [
    `O objeto deste contrato consiste em ${d.objeto.replace(/\.$/, '').replace(/^./, c => c.toLowerCase())}, a ser prestado pela CONTRATADA à CONTRATANTE no empreendimento ${obra}, observadas as quantidades, unidades, preços e demais condições da planilha de serviços (Anexo I), que integra este contrato para todos os efeitos.`,
    ...(d.escopo ? [d.escopo] : []),
    'A CONTRATADA declara possuir as condições técnicas, comerciais e operacionais necessárias ao cumprimento do objeto, estando apta à prestação dos serviços.',
    'A prestação abrange os serviços previstos na planilha anexa e as frentes de trabalho indicadas pela CONTRATANTE, não se presumindo incluídos serviços, quantitativos ou frentes não previstos ou não autorizados previamente e por escrito pela CONTRATANTE.',
    'A CONTRATADA é responsável pelo fornecimento de mão de obra, equipamentos e ferramentas necessários à perfeita execução dos serviços, salvo disposição em contrário entre as partes.',
    'Fica reservado o direito da CONTRATANTE de contratar terceiros, à sua escolha, para os demais serviços da obra e para serviços semelhantes, devendo a CONTRATADA coordenar seus serviços com as demais empresas, cabendo à CONTRATANTE estabelecer prioridades.']});
  C.push({ t: 'DO LOCAL DE EXECUÇÃO', p: [
    `Os serviços serão executados nos locais indicados pela CONTRATANTE, no empreendimento ${d.obra.nome}, observadas as condições de acesso, as frentes de trabalho, o cronograma e as orientações repassadas.`,
    'A CONTRATADA declara ter ciência das condições de execução, comprometendo-se a atender às frentes, áreas, quantidades, especificações, cronograma e prazos solicitados, de acordo com a planilha anexa.']});
  C.push({ t: 'DO PREÇO E DA FORMA DE PAGAMENTO', p: [
    `A CONTRATANTE pagará à CONTRATADA o preço global de ${B(valor)} (${ctReais(valor)}), correspondente aos serviços da planilha do Anexo I.`,
    ...(perm > 0 ? [`Do valor total, ${B(perm)} (${ctReais(perm)}) serão pagos mediante permuta${d.permuta_desc ? ', ' + d.permuta_desc.replace(/\.$/, '') : ''}. O saldo remanescente, de ${B(saldo)} (${ctReais(saldo)}), será pago ${forma.replace(/\.$/, '')}.`] : [`Os pagamentos serão realizados ${forma.replace(/\.$/, '')}.`]),
    ...(nf || rc ? [`O faturamento será realizado na proporção de ${pc(nf)}% via Nota Fiscal e ${pc(rc)}% mediante Recibo de Pagamento, mediante aprovação da CONTRATANTE quanto aos serviços executados.`] : []),
    'Os pagamentos serão calculados com base na multiplicação dos preços unitários da planilha pelas quantidades efetivamente concluídas e aceitas pela CONTRATANTE. Os preços unitários valem apenas para efeito das medições, sendo o contrato firmado a preço global, ainda que haja variação dos quantitativos da planilha, para mais ou para menos, ressalvados os aditivos previstos neste instrumento.',
    'No preço estão incluídos todos os insumos atribuídos à CONTRATADA: salários e encargos de seus funcionários, transporte, alojamento, refeições, equipamentos, maquinário e ferramentas, EPIs, seguros e demais despesas necessárias ao cumprimento do contrato, não cabendo revisão do preço por oscilações de mercado.',
    d.retencoes || 'A CONTRATANTE efetuará as retenções de tributos devidas em lei.',
    'Qualquer pagamento somente será realizado à vista de nota fiscal ou documento fiscal equivalente emitido pela CONTRATADA, no valor efetivo da medição.',
    'A nota fiscal deverá ser entregue até o último dia útil de cada mês, acompanhada dos documentos abaixo, sendo autorizada a retenção do pagamento na falta de qualquer deles:', ...docs.map(sub),
    'O não pagamento pela CONTRATANTE nas datas pactuadas implicará multa de 2% sobre o valor devido, juros de mora de 1% ao mês e correção monetária pela variação do IGP-M.',
    'Qualquer alteração de data, forma de pagamento ou valor deverá ser ajustada por escrito, com concordância expressa das partes.',
    'Os serviços semelhantes acrescidos pela CONTRATANTE serão pagos pelos preços unitários da planilha ou, não havendo, pactuados com base nos custos correntes dos insumos, sempre mediante termo aditivo. Só se admite revisão de preço por inclusão, acréscimo, redução ou supressão de serviços não previstos no escopo.',
    d.reajuste || 'Somente haverá reajustamento mediante aditivo.']});
  C.push({ t: 'DAS MEDIÇÕES', p: [
    `As medições dos serviços serão feitas conforme a periodicidade ${per}, pelas quantidades efetivamente executadas.`,
    'Somente serão medidos os serviços concluídos, conferidos pela CONTRATANTE (ou pela administradora da obra) e com a Ficha de Verificação de Serviço (FVS) aprovada, sendo medidos uma única vez, pela quantidade executada.',
    'A medição aprovada recebe numeração própria e é arquivada com o aceite eletrônico de quem a aprovou.']});
  C.push({ t: 'DO PRAZO DE VIGÊNCIA E DE EXECUÇÃO', p: [
    `O contrato vigora ${d.vigencia_ini ? 'de ' + fd(d.vigencia_ini) : 'a partir da assinatura'}${d.vigencia_fim ? ' até ' + fd(d.vigencia_fim) : ', pelo prazo necessário à integral execução dos serviços'}, ressalvadas alterações de cronograma ajustadas previamente e por escrito entre as partes.${d.prazo_txt ? ' Prazo estimado de execução: ' + d.prazo_txt.replace(/\.$/, '') + '.' : ''}`,
    'Os serviços serão executados conforme o cronograma e as necessidades da obra, respondendo a CONTRATADA pelos serviços previstos e não concluídos no período, e a mora no término de uma etapa não poderá prejudicar o início da etapa seguinte.',
    'O cronograma poderá sofrer alterações em decorrência de chuvas intensas que inviabilizem a execução do serviço.',
    'Estando a CONTRATADA em mora, a CONTRATANTE poderá contratar terceiros para auxiliar na execução, descontando o preço cobrado dos créditos da CONTRATADA.']});
  C.push({ t: 'DAS OBRIGAÇÕES DA CONTRATANTE', p: [
    'Efetuar os pagamentos acordados, nos termos deste contrato;',
    'Fornecer à CONTRATADA as informações necessárias à correta execução: locais, acessos, horários, frentes liberadas, quantidades e orientações indispensáveis;',
    'Conferir os serviços executados quanto a quantidades, especificações e qualidade, comunicando imediatamente divergências ou necessidade de correção;',
    'Efetuar as retenções de tributos devidas, quando aplicáveis;',
    'Permitir o livre acesso de veículos, equipamentos e prepostos da CONTRATADA necessários à execução, observadas as regras internas do local.']});
  C.push({ t: 'DAS OBRIGAÇÕES DA CONTRATADA', p: [
    'A CONTRATADA obriga-se a:',
    sub('a) executar os serviços observando rigorosamente descrição, unidade, quantidade, preço, local, prazos e especificações da planilha anexa e as orientações da CONTRATANTE;'),
    sub('b) utilizar mão de obra qualificada e em número suficiente, zelando pela disciplina, mantendo na obra somente empregados regularmente registrados e com salários em dia;'),
    sub('c) executar os serviços de forma organizada, sem acúmulo de materiais e entulhos, guardando equipamentos e insumos em local adequado e dando destinação legal aos resíduos de sua responsabilidade;'),
    sub('d) fornecer e utilizar ferramentas e equipamentos apropriados e em bom estado, transporte, refeições, uniformes e EPIs nos moldes das NRs, respeitando as normas de segurança e as normas internas da obra;'),
    sub('e) informar com antecedência a necessidade de reposição de materiais ou equipamentos sob responsabilidade da CONTRATANTE, para não alterar o cronograma;'),
    sub('f) corrigir, refazer ou regularizar, às suas expensas, os serviços executados em desconformidade com a planilha, as especificações, as normas técnicas ou as exigências da CONTRATANTE;'),
    sub('g) apresentar, quando solicitado, a documentação trabalhista e de segurança: exames ocupacionais, treinamentos (NR-35, NR-10, NR-18), PGR, GRO, PCMSO, LTCAT, PPP e registros dos funcionários;'),
    sub('h) manter responsável técnico pela execução na forma da lei, apresentando a respectiva ART, e cumprir a legislação do CREA referente aos serviços;'),
    sub('i) executar exclusivamente os serviços da planilha ou expressamente autorizados pela CONTRATANTE, sendo que serviços adicionais não autorizados não serão remunerados;'),
    sub('j) responsabilizar-se pela guarda e segurança de suas máquinas, veículos, equipamentos e ferramentas;'),
    sub('k) não efetuar o pagamento de seus empregados nas dependências da CONTRATANTE.'),
    'A CONTRATADA permitirá a fiscalização pela CONTRATANTE quanto à execução, medição, conferência e qualidade, não havendo, porém, subordinação entre as partes.',
    'É vedado subempreitar, no todo ou em parte, os serviços, ou ceder créditos deste contrato, sem anuência prévia e expressa da CONTRATANTE, via aditivo, sob pena de rescisão. Se autorizada, a CONTRATADA responderá solidariamente pelos atos dos subcontratados.',
    'Para o ingresso de empregados ou prepostos no empreendimento, a CONTRATADA repassará à CONTRATANTE, com antecedência mínima de 7 (sete) dias, a identificação dos profissionais e a documentação exigida, podendo a CONTRATANTE negar o acesso a quem não constar da lista ou não tiver vínculo comprovado.']});
  C.push({ t: 'DAS OBRIGAÇÕES FISCAIS E TRABALHISTAS', p: [
    'São de inteira responsabilidade da CONTRATADA a regularidade quanto a FGTS, INSS, encargos trabalhistas, previdenciários e fiscais, bem como a defesa de reclamatórias trabalhistas da equipe empregada neste contrato e a fiscalização dos órgãos municipais, estaduais e federais, mantendo a CONTRATANTE e a administradora isentas.',
    'Em caso de reclamação trabalhista, a CONTRATADA arcará com todos os ônus do processo, incluindo condenação, custas e honorários, e, se a CONTRATANTE vier a ser incluída como reclamada, disponibilizará de imediato toda a documentação pertinente.',
    'A CONTRATADA responde civil e criminalmente por atos e omissões de si, seus empregados e prepostos, e por danos a pessoas, bens ou ao meio ambiente, bem como por multas de órgãos fiscalizadores, resguardado à CONTRATANTE o direito de regresso.',
    'Em nenhuma hipótese haverá vínculo de emprego entre os empregados da CONTRATADA e a CONTRATANTE ou a administradora da obra.']});
  C.push({ t: 'DA AUTONOMIA DAS PARTES E DA CONFIDENCIALIDADE', p: [
    'O presente contrato não estabelece sociedade, associação, agência, consórcio ou vínculo empregatício entre as partes, que são independentes e distintas, regendo-se pelas disposições do Código Civil (arts. 593 e seguintes), sem exclusividade.',
    'A CONTRATADA manterá absoluto sigilo das informações, dados, documentos, projetos, preços e condições deste contrato a que tiver acesso, não podendo divulgá-los sem consentimento escrito da CONTRATANTE. A confidencialidade não se vincula ao término do contrato, e o descumprimento gera indenização por perdas e danos.']});
  C.push({ t: 'DA GARANTIA', p: [d.garantia || 'A CONTRATADA assume plena responsabilidade pela qualidade, segurança e conformidade dos serviços, obrigando-se a corrigir, refazer ou regularizar, às suas expensas, qualquer serviço em desconformidade, sem prejuízo de perdas e danos.']});
  C.push({ t: 'DA RESCISÃO E DAS PENALIDADES', p: [
    'Constituem motivos para rescisão, sem prejuízo das penalidades cabíveis: o descumprimento de cláusulas; atraso ou lentidão injustificados; execução parcial sem autorização; paralisação sem justa causa; reiteração de faltas; execução em desconformidade com a planilha sem correção no prazo indicado; imperícia, negligência ou desídia que causem prejuízo; e recusa em corrigir serviços em desconformidade.',
    'O contrato será considerado rescindido de pleno direito, sem indenização, em caso de inadimplemento, falência, recuperação judicial, insolvência, dissolução, caso fortuito ou força maior.',
    `Pelo descumprimento das obrigações serão aplicadas à CONTRATADA, sem prejuízo de perdas e danos: a) advertência; b) multa de ${pc(d.multa1_pct || 10)}% sobre o valor atualizado do contrato por descumprimento total ou parcial do objeto, atraso injustificado, execução parcial sem autorização ou em desconformidade, devendo o motivo ser corrigido em 48 (quarenta e oito) horas; c) multa de ${pc(d.multa2_pct || 15)}% sobre o valor atualizado do contrato por descumprimento de outras cláusulas; d) multa diária de ${B(d.multa_diaria || 500)}, cumulativa com a da alínea "b" se a correção não for feita no prazo.`,
    `A parte que postular a rescisão sem causa justificada observará aviso prévio de ${d.aviso_dias || 15} (${ctInteiro(Number(d.aviso_dias) || 15)}) dias, sem direito a indenização, e a CONTRATADA receberá proporcionalmente pelos serviços regularmente executados, medidos e aceitos até a rescisão, restituindo em 48 (quarenta e oito) horas os valores recebidos em excesso, corrigidos pelo IGP-M.`,
    'Rescindido o contrato, a CONTRATADA devolverá todos os arquivos e documentos relacionados aos serviços.']});
  C.push({ t: 'DA PROTEÇÃO DE DADOS', p: [
    'As partes comprometem-se a tratar os dados pessoais a que tiverem acesso em conformidade com a Lei nº 13.709/2018 (LGPD), unicamente para as finalidades e pelo tempo necessários à execução do contrato, adotando medidas de segurança técnicas e administrativas e comunicando à outra parte, em até 72 (setenta e duas) horas, qualquer incidente de segurança relevante. Em caso de rescisão, os dados pessoais serão devolvidos ou eliminados, salvo base legal para sua manutenção.']});
  C.push({ t: 'DAS CLÁUSULAS GERAIS', p: [
    'Qualquer alteração deste contrato só poderá ser feita por acordo entre as partes, por escrito, mediante aditivo contratual.',
    'É vedada a cessão ou transferência, total ou parcial, de direitos e obrigações deste contrato sem autorização prévia e expressa da outra parte.',
    'A mera liberalidade quanto a prazos ou concessões não constitui novação, nem impede o exercício posterior de qualquer direito.',
    'Os comunicados e notificações poderão ser feitos por carta ou por meios eletrônicos (e-mail e mensagens), com a mesma validade.',
    ...(d.administradora ? ['A administradora da obra, qualificada neste instrumento, representa a CONTRATANTE perante a CONTRATADA para todos os fins relacionados a este contrato, com as prerrogativas da CONTRATANTE.'] : []),
    'Integram este contrato, para todos os efeitos, a planilha de serviços (Anexo I) e os documentos nela referidos.',
    ...(d.clausulas_extra ? d.clausulas_extra.split(/\n+/).map(x => x.trim()).filter(Boolean) : [])]});
  C.push({ t: 'DO FORO', p: [`Elegem as partes o foro da comarca de ${d.foro || 'Capão da Canoa/RS'} como único competente para dirimir quaisquer dúvidas oriundas deste contrato, em detrimento de qualquer outro, por mais privilegiado que seja.`]});
  return C;
}

async function ctMinutaPdf(d) {
  await relLibs();
  const { jsPDF } = window.jspdf, pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const ML = 20, TW = 170, TOP = 20, BOT = 272;
  const emp = d.emp, nomeEmp = emp.empresa || emp.nome;
  let y = TOP;
  // fontes padrão do PDF (WinAnsi): troca aspas e travessões "bonitos" por equivalentes simples
  const L = t => String(t == null ? '' : t).replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...').replace(/ /g, ' ').replace(/[•·]/g, '-').replace(/→/g, '>');
  const lh = s => s * 0.3528 * 1.4;
  const nova = () => { pdf.addPage(); y = TOP; };
  const txt = (t, o = {}) => {
    const s = o.size || 10, ind = o.ind || 0, h = lh(s);
    pdf.setFont('helvetica', o.b ? 'bold' : 'normal'); pdf.setFontSize(s); pdf.setTextColor(o.cor || 20);
    pdf.splitTextToSize(L(t), TW - ind).forEach(l => {
      if (y + h > BOT) nova();
      if (o.c) pdf.text(l, ML + TW / 2, y, { align: 'center' }); else pdf.text(l, ML + ind, y);
      y += h;
    });
    y += o.gap == null ? 2.2 : o.gap;
  };
  const titulo = t => { if (y + 24 > BOT) nova(); y += 3; txt(t, { b: true, size: 10.5, gap: 2.4 }); };

  // cabeçalho do contrato
  txt('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', { b: true, size: 14, c: true, gap: 1 });
  txt('Contrato nº ' + d.rotulo, { c: true, size: 10, gap: 1, cor: 90 });
  txt(d.objeto, { c: true, size: 10, gap: 5, cor: 90 });
  const parteContratante = `${d.contratante_nome || '[CONTRATANTE]'}, pessoa jurídica de direito privado${d.contratante_doc ? ', inscrita no CNPJ sob o nº ' + d.contratante_doc : ''}${d.contratante_end ? ', com sede em ' + d.contratante_end : ''}, adiante denominada CONTRATANTE;`;
  const parteContratada = `${nomeEmp}${emp.documento ? ', inscrita no CNPJ/CPF sob o nº ' + emp.documento : ''}${emp.endereco ? ', com sede em ' + emp.endereco : ''}${emp.responsavel ? ', neste ato representada por ' + emp.responsavel : ''}${emp.email ? ', e-mail ' + emp.email : ''}${emp.telefone ? ', telefone ' + emp.telefone : ''}, adiante denominada CONTRATADA.`;
  txt(parteContratante + ' e');
  txt(parteContratada);
  if (d.administradora) txt('ADMINISTRADORA DA OBRA: ' + d.administradora.replace(/\.$/, '') + '.');
  txt('Têm entre si justo e combinado o presente instrumento particular de Contrato de Prestação de Serviços, que se regerá pelas cláusulas e condições seguintes:', { gap: 3 });

  const clausulas = ctClausulas(d);
  clausulas.forEach((c, ci) => {
    if (ci === clausulas.length - 1 && y + 100 > BOT) nova();   // a última cláusula nunca fica separada das assinaturas
    titulo(`${ci + 1}. ${c.t}:`);
    let k = 0;
    c.p.forEach(p => {
      if (Array.isArray(p)) txt(p[1], { ind: 7, gap: 1.2 });
      else txt(`${ci + 1}.${++k}. ${p}`);
    });
  });
  // fechamento e assinaturas
  if (y + 75 > BOT) nova();
  y += 4;
  txt(`${d.local_assinatura || 'Capão da Canoa/RS'}, ${d.data_assinatura ? ctDataExt(d.data_assinatura) : '____ de ______________ de ______'}.`, { gap: 12 });
  const ass = (x, nome, papel) => {
    pdf.setDrawColor(60); pdf.line(x, y, x + 76, y); pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
    const ls = pdf.splitTextToSize(L(nome), 76).slice(0, 2);
    ls.forEach((l, k) => pdf.text(l, x, y + 4.5 + k * 4));
    pdf.setFont('helvetica', 'normal'); pdf.text(papel, x, y + 4.5 + ls.length * 4);
  };
  ass(ML, d.contratante_nome || 'CONTRATANTE', 'CONTRATANTE'); ass(ML + 94, nomeEmp, 'CONTRATADA');
  y += 24;
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.text('Testemunhas:', ML, y); y += 12;
  [ML, ML + 94].forEach(x => { pdf.line(x, y, x + 76, y); pdf.text('Nome:', x, y + 4.5); pdf.text('CPF/MF nº:', x, y + 9); });

  // Anexo I: planilha de serviços
  nova();
  txt('ANEXO I - PLANILHA DE SERVIÇOS CONTRATADOS', { b: true, size: 12, c: true, gap: 1 });
  txt(`${nomeEmp} - ${d.obra.nome}`, { c: true, size: 9.5, gap: 4, cor: 90 });
  const W = [14, 80, 12, 22, 20, 22], X = [ML]; W.forEach((w, i) => X.push(X[i] + w));
  const cab = () => {
    pdf.setFillColor(14, 42, 107); pdf.rect(ML, y, TW, 6.2, 'F'); pdf.setTextColor(255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5);
    ['Item', 'Descrição', 'Un.', 'Qtd.', 'Unit. (R$)', 'Total (R$)'].forEach((h, i) => { if (i < 2) pdf.text(h, X[i] + 1.2, y + 4.3); else pdf.text(h, X[i] + W[i] - 1.2, y + 4.3, { align: 'right' }); });
    y += 6.2; pdf.setTextColor(20);
  };
  const num = v => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  cab();
  let grupoAtual = null;
  d.itens.forEach(i => {
    if ((i.grupo || '') !== grupoAtual) {
      grupoAtual = i.grupo || '';
      if (grupoAtual) {
        if (y + 14 > BOT) { nova(); cab(); }
        pdf.setFillColor(230, 234, 244); pdf.rect(ML, y, TW, 6, 'F'); pdf.setDrawColor(190); pdf.rect(ML, y, TW, 6);
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.text(L(grupoAtual).slice(0, 95), ML + 1.2, y + 4.2);
        const sub = d.itens.filter(x => (x.grupo || '') === grupoAtual).reduce((t, x) => t + x.total, 0);
        pdf.text(num(sub), X[5] + W[5] - 1.2, y + 4.2, { align: 'right' }); y += 6;
      }
    }
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
    const ls = pdf.splitTextToSize(L(i.servico), W[1] - 2.4), h = Math.max(6, ls.length * lh(8.5) + 2);
    if (y + h > BOT) { nova(); cab(); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); }
    pdf.setDrawColor(200); pdf.rect(ML, y, TW, h);
    pdf.text(L(i.codigo || '').slice(0, 10), X[0] + 1.2, y + 4.2);
    ls.forEach((l, k) => pdf.text(l, X[1] + 1.2, y + 4.2 + k * lh(8.5)));
    pdf.text(L(i.unidade), X[2] + 1.2, y + 4.2);
    [num(i.qtd), num(i.unitario), num(i.total)].forEach((v, k) => pdf.text(v, X[3 + k] + W[3 + k] - 1.2, y + 4.2, { align: 'right' }));
    y += h;
  });
  if (y + 24 > BOT) nova();
  const R = d.resumo;
  const linha = (t, v, b) => { pdf.setFont('helvetica', b ? 'bold' : 'normal'); pdf.setFontSize(9); pdf.text(t, X[4] + W[4] - 1.2, y + 4.4, { align: 'right' }); pdf.text(v, ML + TW - 1.2, y + 4.4, { align: 'right' }); y += 6; };
  y += 2;
  linha('Soma da planilha (R$):', num(R.soma_itens));
  if (R.valor_global && Math.abs(R.diferenca) >= 0.005) linha('Ajuste ao preço global (R$):', num(R.diferenca));
  linha('VALOR GLOBAL DO CONTRATO (R$):', num(R.valor_global || R.soma_itens), true);
  y += 3;
  txt(`Os preços unitários servem apenas para efeito das medições; o contrato é firmado a preço global de ${brl(R.valor_global || R.soma_itens)} (${ctReais(R.valor_global || R.soma_itens)}).`, { size: 8.5, cor: 70 });

  const n = pdf.getNumberOfPages();
  for (let p = 1; p <= n; p++) { pdf.setPage(p); pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(120); pdf.text(L(`Contrato ${d.rotulo} - ${nomeEmp} - ${d.obra.nome}`).slice(0, 90), ML, 289); pdf.text(`Página ${p} de ${n}`, ML + TW, 289, { align: 'right' }); }
  return pdf.output('blob');
}
