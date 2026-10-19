/**
 * Importação da obra AVA Residence (Dorata Empreendimentos · Maquiné/RS) — roda uma vez; rodar de novo não duplica.
 * Fonte: 2026_PLANILHA-ORCAMENTARIA_AVA-RESIDENCES_SIZE.xlsx (frentes, serviços e quantidades) e
 *        2026_QUANTITATIVOS-PEAD-DEFOFO_MAQUINE-DORATA_R01.xlsx (materiais por rede, já com a margem de 15% nos tubos).
 *        2026_ORCAMENTO-INFRA-SEM-CIVIL_AVA-RESIDENCES_R02.xlsx (por frente: preço cobrado da Dorata, custo direto, adm local, indiretas e tributos;
 *        terceiros — estacas e elétrica — ficam de fora).
 * Preços dos serviços: o da proposta é o preço de VENDA (material + mão de obra juntos). Tubo "(material)" também vai para R$ material
 * e "Assentamento" para R$ MO; nos demais material e MO ficam em aberto (custo de referência, para preencher depois).
 * No editor do Apps Script: escolha criarObraAvaResidence e clique em Executar. Rodar de novo completa o que faltar sem apagar o que você mudou.
 */
const AVA_FRENTES_ = ["Terraplenagem","Pavimentação e vias","Drenagem pluvial","Esgoto sanitário","Abastecimento de água","Urbanização e paisagismo","Contenções em gabião","Marina externa e heliponto"];
const AVA_VALORES_ = {"Terraplenagem":{"preco":33594526.64,"custo_direto":20809334,"adm_local":1248560.04,"indiretas":1982044.66,"tributos":2234036.02,"etapas":["Terraplenagem (canais, aterro, solo mole)"]},"Pavimentação e vias":{"preco":15363965.17,"custo_direto":9516844.4,"adm_local":571010.66,"indiretas":906459.12,"tributos":1021703.68,"etapas":["Pavimentação e vias"]},"Drenagem pluvial":{"preco":4050629.28,"custo_direto":2509066.39,"adm_local":150543.98,"indiretas":238983.22,"tributos":269366.85,"etapas":["Drenagem pluvial"]},"Esgoto sanitário":{"preco":11719315.87,"custo_direto":7259252.7,"adm_local":435555.16,"indiretas":691428.33,"tributos":779334.51,"etapas":["Esgoto (rede, 4 EBEs, ETE, reúso)"]},"Abastecimento de água":{"preco":4127545.08,"custo_direto":2556710.06,"adm_local":153402.6,"indiretas":243521.18,"tributos":274481.75,"etapas":["Água (rede, poços, EBAT, reservatório)"]},"Urbanização e paisagismo":{"preco":4791530.33,"custo_direto":2968000,"adm_local":178080,"indiretas":282695.67,"tributos":318636.77,"etapas":["Urbanização e fechamento (muro/gradil, mobiliário, placas)","Paisagismo de INFRAESTRUTURA (grama, arborização viária, canteiros, taludes)"]},"Contenções em gabião":{"preco":21902437.84,"custo_direto":16530631.36,"adm_local":991837.89,"indiretas":1292222.71,"tributos":1456512.13,"etapas":["S1 Margem da lagoa (gabião envolvendo os pilares, SEM as estacas), 1.480 m","S2 Escadas de acesso à APP, 33 un","S3 Gabião de gravidade puro, 280 m","S4 Fundo de lote dos canais (inclui rebaixamento, areia/aterro, esperas), 5.421 ","S5 Acesso de serviço à APP","Contenção lateral das 2 manchas (67,5 m³)"]},"Marina externa e heliponto":{"preco":5462813.2,"custo_direto":4123000,"adm_local":247380,"indiretas":322300.71,"tributos":363277.07,"etapas":["Píer flutuante de embarque comum (650 m²) + pedestais","Rampa de acesso ao canal","Estacionamento de barcos e carretas","Heliponto (pavimento + sinalização + registro ANAC)"]}};
const AVA_ITENS_ = [
  {"frente":"Terraplenagem","codigo":"1.1.1","servico":"Limpeza e regularização da gleba","unidade":"m²","qtd":490297,"unit_material":"","unit_mo":"","unit_venda":2.65,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Terraplenagem","codigo":"1.1.2","servico":"Escavação dos canais abaixo do NA, carga e espalhamento interno (DMT ≤ 1 km)","unidade":"m³","qtd":340000,"unit_material":"","unit_mo":"","unit_venda":23.85,"obs":"Fonte: Estimativa SIZE · ATENÇÃO: volume estimado pelas seções do projeto. Medição por m³ executado."},
  {"frente":"Terraplenagem","codigo":"1.1.3","servico":"Aterro compactado 95 % PN de lotes e vias, em camadas","unidade":"m³","qtd":669000,"unit_material":"","unit_mo":"","unit_venda":11.43,"obs":"Fonte: SINAPI-RS 105561 · ATENÇÃO: aterro médio de ≈ 2 m sobre o terreno natural. Medição por m³."},
  {"frente":"Terraplenagem","codigo":"1.1.4","servico":"Material de empréstimo (déficit de corte) posto obra","unidade":"m³","qtd":371000,"unit_material":"","unit_mo":"","unit_venda":50.88,"obs":"Fonte: Cotação de fornecedor · ATENÇÃO: depende do aproveitamento do material dos canais (ensaios). Medição por m³."},
  {"frente":"Terraplenagem","codigo":"1.1.5","servico":"Tratamento de solo mole (sobrecarga temporária + monitoramento)","unidade":"m²","qtd":90831,"unit_material":"","unit_mo":"","unit_venda":53,"obs":"Fonte: Estimativa SIZE · ATENÇÃO: 137 lotes. Solução a confirmar com sondagens; medição por m²."},
  {"frente":"Pavimentação e vias","codigo":"1.2.1","servico":"Regularização e compactação do subleito","unidade":"m²","qtd":51800,"unit_material":"","unit_mo":"","unit_venda":6.63,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Pavimentação e vias","codigo":"1.2.2","servico":"Base de brita graduada e = 15 cm","unidade":"m³","qtd":7770,"unit_material":"","unit_mo":"","unit_venda":238.92,"obs":"Fonte: SINAPI-RS 96396"},
  {"frente":"Pavimentação e vias","codigo":"1.2.3","servico":"Pavimento intertravado 8 cm (blocos 20x10)","unidade":"m²","qtd":51800,"unit_material":"","unit_mo":"","unit_venda":111.9,"obs":"Fonte: SINAPI-RS 92398"},
  {"frente":"Pavimentação e vias","codigo":"1.2.4","servico":"Meio-fio pré-moldado 100x15x13x30","unidade":"m","qtd":14800,"unit_material":"","unit_mo":"","unit_venda":70.57,"obs":"Fonte: SINAPI-RS 94273"},
  {"frente":"Pavimentação e vias","codigo":"1.2.5","servico":"Calçadas em paver, 2,0 m por lado, com base","unidade":"m²","qtd":25200,"unit_material":"","unit_mo":"","unit_venda":125.88,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Pavimentação e vias","codigo":"1.2.6","servico":"Sinalização viária e placas","unidade":"vb","qtd":1,"unit_material":"","unit_mo":"","unit_venda":397500,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Drenagem pluvial","codigo":"1.3.1","servico":"Tubo PEAD corrugado DN400 (material)","unidade":"m","qtd":3431.4,"unit_material":582.96,"unit_mo":"","unit_venda":582.96,"obs":"Fonte: SINAPI-RS (insumo) 41781"},
  {"frente":"Drenagem pluvial","codigo":"1.3.2","servico":"Tubo PEAD corrugado DN500 (material)","unidade":"m","qtd":199.54,"unit_material":821.5,"unit_mo":"","unit_venda":821.5,"obs":"Fonte: Estimativa SIZE · Preço por proporção do DN400 (SINAPI)."},
  {"frente":"Drenagem pluvial","codigo":"1.3.3","servico":"Tubo PEAD corrugado DN600 (material)","unidade":"m","qtd":89.24,"unit_material":1126.25,"unit_mo":"","unit_venda":1126.25,"obs":"Fonte: Estimativa SIZE · Preço por proporção do DN400 (SINAPI)."},
  {"frente":"Drenagem pluvial","codigo":"1.3.4","servico":"Assentamento dos tubos","unidade":"m","qtd":3720.18,"unit_material":"","unit_mo":39.75,"unit_venda":39.75,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Drenagem pluvial","codigo":"1.3.5","servico":"Escavação de vala (≈ 1,2 m³/m)","unidade":"m³","qtd":4464.216,"unit_material":"","unit_mo":"","unit_venda":18.27,"obs":"Fonte: SINAPI-RS 102306"},
  {"frente":"Drenagem pluvial","codigo":"1.3.6","servico":"Reaterro compactado de vala","unidade":"m³","qtd":3720.18,"unit_material":"","unit_mo":"","unit_venda":26.43,"obs":"Fonte: SINAPI-RS 104728"},
  {"frente":"Drenagem pluvial","codigo":"1.3.7","servico":"Poço de visita de drenagem completo","unidade":"un","qtd":105,"unit_material":"","unit_mo":"","unit_venda":3710,"obs":"Fonte: SINAPI-RS 98410"},
  {"frente":"Drenagem pluvial","codigo":"1.3.8","servico":"Caixa coletora / boca de lobo","unidade":"un","qtd":73,"unit_material":"","unit_mo":"","unit_venda":2385,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Drenagem pluvial","codigo":"1.3.9","servico":"Ala de lançamento em concreto","unidade":"un","qtd":32,"unit_material":"","unit_mo":"","unit_venda":4637.5,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Drenagem pluvial","codigo":"1.3.10","servico":"Dissipador de energia","unidade":"un","qtd":1,"unit_material":"","unit_mo":"","unit_venda":19875,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Esgoto sanitário","codigo":"1.4.1","servico":"Tubo PVC coletor DN150, fornecimento e assentamento","unidade":"m","qtd":5808.58,"unit_material":"","unit_mo":"","unit_venda":157.79,"obs":"Fonte: SINAPI-RS 90695"},
  {"frente":"Esgoto sanitário","codigo":"1.4.2","servico":"Escavação de vala (0,8 m x 1,92 m)","unidade":"m³","qtd":8921.9789,"unit_material":"","unit_mo":"","unit_venda":18.27,"obs":"Fonte: SINAPI-RS 102306"},
  {"frente":"Esgoto sanitário","codigo":"1.4.3","servico":"Reaterro compactado de vala","unidade":"m³","qtd":8364.3552,"unit_material":"","unit_mo":"","unit_venda":26.43,"obs":"Fonte: SINAPI-RS 104728"},
  {"frente":"Esgoto sanitário","codigo":"1.4.4","servico":"Escoramento de vala (2 faces)","unidade":"m²","qtd":21143.2312,"unit_material":"","unit_mo":"","unit_venda":39.75,"obs":"Fonte: Estimativa SIZE · Lençol freático alto: escoramento contínuo."},
  {"frente":"Esgoto sanitário","codigo":"1.4.5","servico":"Rebaixamento de lençol na vala (ponteiras)","unidade":"m","qtd":5808.58,"unit_material":"","unit_mo":"","unit_venda":66.25,"obs":"Fonte: Estimativa SIZE · Ponteiras filtrantes ao longo da vala."},
  {"frente":"Esgoto sanitário","codigo":"1.4.6","servico":"Poço de visita DN1000 completo (prof. média 2 m)","unidade":"un","qtd":102,"unit_material":"","unit_mo":"","unit_venda":5035,"obs":"Fonte: SINAPI-RS 98410"},
  {"frente":"Esgoto sanitário","codigo":"1.4.7","servico":"Inspeção tubular (IT)","unidade":"un","qtd":19,"unit_material":"","unit_mo":"","unit_venda":1060,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Esgoto sanitário","codigo":"1.4.8","servico":"Ligação predial completa (TIL, selim, ramal DN100, vala)","unidade":"un","qtd":310,"unit_material":"","unit_mo":"","unit_venda":1192.5,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Esgoto sanitário","codigo":"1.4.9","servico":"Elevatórias EBE 01 a 03 (civil + 2 bombas + elétrica/automação)","unidade":"un","qtd":3,"unit_material":"","unit_mo":"","unit_venda":463750,"obs":"Fonte: Estimativa SIZE · Inclui civil, 2 bombas por elevatória e automação."},
  {"frente":"Esgoto sanitário","codigo":"1.4.10","servico":"Elevatória EBE 04 (bombas 10 cv)","unidade":"un","qtd":1,"unit_material":"","unit_mo":"","unit_venda":596250,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Esgoto sanitário","codigo":"1.4.11","servico":"Recalque PEAD SDR17 DE75 a DE125 (tubo, solda, vala)","unidade":"m","qtd":1579.2,"unit_material":"","unit_mo":"","unit_venda":198.75,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Esgoto sanitário","codigo":"1.4.12","servico":"Travessia por MND sob o lago (EBE 02)","unidade":"m","qtd":57,"unit_material":"","unit_mo":"","unit_venda":795,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Esgoto sanitário","codigo":"1.4.13","servico":"ETE compacta (≈ 9,25 L/s, 1.510 hab)","unidade":"vb","qtd":1,"unit_material":"","unit_mo":"","unit_venda":2915000,"obs":"Fonte: Estimativa SIZE · Valor de referência; fornecedor a definir com o projeto da ETE."},
  {"frente":"Esgoto sanitário","codigo":"1.4.14","servico":"Reúso: EBAR + rede de distribuição 6,5 km","unidade":"vb","qtd":1,"unit_material":"","unit_mo":"","unit_venda":927500,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Abastecimento de água","codigo":"1.5.1","servico":"Rede PVC PBA DN100, fornecimento e assentamento","unidade":"m","qtd":6945,"unit_material":"","unit_mo":"","unit_venda":105.92,"obs":"Fonte: SINAPI-RS 106109"},
  {"frente":"Abastecimento de água","codigo":"1.5.2","servico":"Rede PVC PBA DN75, fornecimento e assentamento","unidade":"m","qtd":6724,"unit_material":"","unit_mo":"","unit_venda":79.5,"obs":"Fonte: Estimativa SIZE · Preço por proporção do DN100 (SINAPI)."},
  {"frente":"Abastecimento de água","codigo":"1.5.3","servico":"Escavação e reaterro de vala (0,6 x 1,1 m)","unidade":"m³","qtd":9021.54,"unit_material":"","unit_mo":"","unit_venda":44.71,"obs":"Fonte: SINAPI-RS 102306 + 104728"},
  {"frente":"Abastecimento de água","codigo":"1.5.4","servico":"Conexões FoFo dúctil (curvas, tês, reduções, caps)","unidade":"un","qtd":192,"unit_material":"","unit_mo":"","unit_venda":795,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Abastecimento de água","codigo":"1.5.5","servico":"Válvulas de gaveta + caixas de proteção + tampões","unidade":"un","qtd":10,"unit_material":"","unit_mo":"","unit_venda":7950,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Abastecimento de água","codigo":"1.5.6","servico":"Hidrantes de coluna DN100","unidade":"un","qtd":2,"unit_material":"","unit_mo":"","unit_venda":19875,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Abastecimento de água","codigo":"1.5.7","servico":"Blocos de ancoragem C-30","unidade":"m³","qtd":115,"unit_material":"","unit_mo":"","unit_venda":1192.5,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Abastecimento de água","codigo":"1.5.8","servico":"Ramais prediais (tê de serviço, PEAD 20, cavalete)","unidade":"un","qtd":300,"unit_material":"","unit_mo":"","unit_venda":596.25,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Abastecimento de água","codigo":"1.5.9","servico":"Captação: poços artesianos (adotado 2)","unidade":"un","qtd":2,"unit_material":"","unit_mo":"","unit_venda":198750,"obs":"Fonte: Estimativa SIZE · ATENÇÃO: quantidade e profundidade a confirmar por estudo hidrogeológico."},
  {"frente":"Abastecimento de água","codigo":"1.5.10","servico":"Reservatório inox 50 m³ + EBAT com 2 bombas, inversor e válvula de nível","unidade":"vb","qtd":1,"unit_material":"","unit_mo":"","unit_venda":728750,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Urbanização e paisagismo","codigo":"1.6.1","servico":"Muro/gradil perimetral (perímetro sem a frente da lagoa)","unidade":"m","qtd":2030,"unit_material":"","unit_mo":"","unit_venda":795,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Urbanização e paisagismo","codigo":"1.6.2","servico":"Paisagismo de vias, canteiros e áreas verdes comuns","unidade":"m²","qtd":60000,"unit_material":"","unit_mo":"","unit_venda":33.13,"obs":"Fonte: Estimativa SIZE · Paisagismo de infraestrutura. Paisagismo de projeto é item à parte."},
  {"frente":"Urbanização e paisagismo","codigo":"1.6.3","servico":"Mobiliário urbano, placas, lixeiras","unidade":"vb","qtd":1,"unit_material":"","unit_mo":"","unit_venda":331250,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Contenções em gabião","codigo":"2.1","servico":"Gabião caixa malha 8x10, arame Zn-Al + PVC, montado (gaiola + mão de obra)","unidade":"m³","qtd":17457.11,"unit_material":"","unit_mo":"","unit_venda":634.56,"obs":"Fonte: Cotação de fornecedor · Base: cotação Maccaferri/TLC do PM-PAN-01 + 7% de revalidação."},
  {"frente":"Contenções em gabião","codigo":"2.2","servico":"Colchão Reno 0,30 m, malha 6x8, arame 2,20 mm Zn-Al + PVC, montado","unidade":"m²","qtd":16263,"unit_material":"","unit_mo":"","unit_venda":286.5,"obs":"Fonte: Cotação de fornecedor · Base: cotação do PM-PAN-01 + 7%."},
  {"frente":"Contenções em gabião","codigo":"2.3","servico":"Pedra de enchimento (100-200 mm gabião / 70-100 mm colchão), posta obra","unidade":"m³","qtd":22336.01,"unit_material":"","unit_mo":"","unit_venda":130,"obs":"Fonte: Cotação de fornecedor · Volume de estrutura. Pedreira local."},
  {"frente":"Contenções em gabião","codigo":"2.4","servico":"Arame de amarração Ø 2,20 mm Zn-Al + PVC","unidade":"kg","qtd":16963.9,"unit_material":"","unit_mo":"","unit_venda":31.24,"obs":"Fonte: Cotação de fornecedor"},
  {"frente":"Contenções em gabião","codigo":"2.5","servico":"Geotêxtil não tecido ≥ 200 g/m², instalado","unidade":"m²","qtd":47085.5,"unit_material":"","unit_mo":"","unit_venda":10.54,"obs":"Fonte: Cotação de fornecedor · Base: cotação do PM-PAN-01 + 7%."},
  {"frente":"Contenções em gabião","codigo":"2.6","servico":"Filtro granular / brita graduada sob a base do muro","unidade":"m³","qtd":1813.89,"unit_material":"","unit_mo":"","unit_venda":229.93,"obs":"Fonte: SINAPI-RS 105727 · Elemento estrutural: garante o atrito da base."},
  {"frente":"Contenções em gabião","codigo":"2.7","servico":"Piso e capeamento em pedra de basalto (33 escadas)","unidade":"m²","qtd":95.04,"unit_material":"","unit_mo":"","unit_venda":394.58,"obs":"Fonte: SINAPI-RS 101090"},
  {"frente":"Contenções em gabião","codigo":"2.8","servico":"Escavação e regularização da fundação das contenções","unidade":"m³","qtd":2674.62,"unit_material":"","unit_mo":"","unit_venda":14.03,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Contenções em gabião","codigo":"2.9","servico":"Rebaixamento de lençol / ensecadeira (execução a seco)","unidade":"vb","qtd":1,"unit_material":"","unit_mo":"","unit_venda":387500,"obs":"Fonte: Estimativa SIZE · ATENÇÃO: supõe canais executados antes do enchimento."},
  {"frente":"Contenções em gabião","codigo":"2.10","servico":"Areia selecionada para regularização do talude (posta obra)","unidade":"m³","qtd":6505.2,"unit_material":"","unit_mo":"","unit_venda":48,"obs":"Fonte: Cotação de fornecedor · ATENÇÃO: atrito ≥ 36,6° e finos ≤ 5%, comprovar por ensaio."},
  {"frente":"Contenções em gabião","codigo":"2.11","servico":"Areia para aterro do degrau do muro (posta obra)","unidade":"m³","qtd":3035.76,"unit_material":"","unit_mo":"","unit_venda":48,"obs":"Fonte: Cotação de fornecedor"},
  {"frente":"Contenções em gabião","codigo":"2.12","servico":"Lançamento e compactação de areia (talude + degrau), GC ≥ 95% PN","unidade":"m³","qtd":9540.96,"unit_material":"","unit_mo":"","unit_venda":37.5,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Contenções em gabião","codigo":"2.13","servico":"Esperas para deck flutuante (tubo-camisa Ø 0,30, gola, tampa)","unidade":"un","qtd":960,"unit_material":"","unit_mo":"","unit_venda":437.5,"obs":"Fonte: Estimativa SIZE · 2 por lote (480 lotes de frente para canal)."},
  {"frente":"Contenções em gabião","codigo":"2.14","servico":"Contenção lateral das manchas alagadas (gabião completo)","unidade":"m³","qtd":67.5,"unit_material":"","unit_mo":"","unit_venda":854.49,"obs":"Fonte: Estimativa SIZE · ATENÇÃO: extensão depende do cadastro das manchas."},
  {"frente":"Contenções em gabião","codigo":"2.15","servico":"Esgotamento provisório das manchas","unidade":"vb","qtd":1,"unit_material":"","unit_mo":"","unit_venda":10000,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Contenções em gabião","codigo":"2.16","servico":"Mobilização de equipamentos de terraplenagem das contenções","unidade":"vb","qtd":1,"unit_material":"","unit_mo":"","unit_venda":62500,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Marina externa e heliponto","codigo":"3.1","servico":"Píer flutuante de embarque comum (passarela + 18 fingers), com estacas-guia","unidade":"m²","qtd":650,"unit_material":"","unit_mo":"","unit_venda":5962.5,"obs":"Fonte: Estimativa SIZE · ATENÇÃO: depende do projeto náutico."},
  {"frente":"Marina externa e heliponto","codigo":"3.2","servico":"Pedestais de água e energia nos píeres","unidade":"un","qtd":18,"unit_material":"","unit_mo":"","unit_venda":10600,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Marina externa e heliponto","codigo":"3.3","servico":"Rampa de acesso ao canal em concreto armado","unidade":"m²","qtd":150,"unit_material":"","unit_mo":"","unit_venda":2385,"obs":"Fonte: Estimativa SIZE · Executada a seco."},
  {"frente":"Marina externa e heliponto","codigo":"3.4","servico":"Estacionamento de barcos e carretas (pavimento)","unidade":"m²","qtd":1200,"unit_material":"","unit_mo":"","unit_venda":291.5,"obs":"Fonte: Estimativa SIZE"},
  {"frente":"Marina externa e heliponto","codigo":"3.5","servico":"Heliponto: pavimento de concreto 0,20 m","unidade":"m²","qtd":600,"unit_material":"","unit_mo":"","unit_venda":596.25,"obs":"Fonte: Estimativa SIZE · ATENÇÃO: depende de projeto e registro na ANAC."},
  {"frente":"Marina externa e heliponto","codigo":"3.6","servico":"Heliponto: sinalização, iluminação e registro","unidade":"vb","qtd":1,"unit_material":"","unit_mo":"","unit_venda":331250,"obs":"Fonte: Estimativa SIZE"}
];
const AVA_MATERIAIS_ = [
  {"frente":"Esgoto sanitário","rede":"EBE 01","categoria":"PEAD","descricao":"Tubo PE-100 SDR17 PN10 DE75, barra 12 m","unidade":"m","projeto":453.2,"qtd":521.18,"obs":"EBE 01; 44 barras/rolos"},
  {"frente":"Esgoto sanitário","rede":"EBE 01","categoria":"PEAD","descricao":"Curva 22,5° PE-100 SDR17 DE75 (solda de topo)","unidade":"pç","projeto":5,"qtd":5,"obs":"EBE 01; estimativa sem detalhe de projeto (validar)"},
  {"frente":"Esgoto sanitário","rede":"EBE 01","categoria":"PEAD","descricao":"Curva 45° PE-100 SDR17 DE75 (solda de topo)","unidade":"pç","projeto":1,"qtd":1,"obs":"EBE 01; estimativa sem detalhe de projeto (validar)"},
  {"frente":"Esgoto sanitário","rede":"EBE 01","categoria":"PEAD","descricao":"Colarinho (stub end) PE-100 DE75 + flange solto PN10 DN80","unidade":"cj","projeto":1,"qtd":1,"obs":"EBE 01; estimativa sem detalhe de projeto (validar)"},
  {"frente":"Esgoto sanitário","rede":"EBE 02","categoria":"PEAD","descricao":"Tubo PE-100 SDR17 PN10 DE90, barra 12 m","unidade":"m","projeto":340,"qtd":391,"obs":"EBE 02; 33 barras/rolos"},
  {"frente":"Esgoto sanitário","rede":"EBE 02","categoria":"PEAD","descricao":"Curva 22,5° PE-100 SDR17 DE90 (solda de topo)","unidade":"pç","projeto":1,"qtd":1,"obs":"EBE 02; estimativa sem detalhe de projeto (validar)"},
  {"frente":"Esgoto sanitário","rede":"EBE 02","categoria":"PEAD","descricao":"Colarinho (stub end) PE-100 DE90 + flange solto PN10 DN80","unidade":"cj","projeto":1,"qtd":1,"obs":"EBE 02; estimativa sem detalhe de projeto (validar)"},
  {"frente":"Esgoto sanitário","rede":"EBE 03","categoria":"PEAD","descricao":"Tubo PE-100 SDR17 PN10 DE110, barra 12 m","unidade":"m","projeto":373,"qtd":428.95,"obs":"EBE 03; 36 barras/rolos"},
  {"frente":"Esgoto sanitário","rede":"EBE 03","categoria":"PEAD","descricao":"Colarinho (stub end) PE-100 DE110 + flange solto PN10 DN100","unidade":"cj","projeto":1,"qtd":1,"obs":"EBE 03; estimativa sem detalhe de projeto (validar)"},
  {"frente":"Esgoto sanitário","rede":"EBE 04","categoria":"PEAD","descricao":"Tubo PE-100 SDR17 PN10 DE125, barra 12 m","unidade":"m","projeto":413,"qtd":474.95,"obs":"EBE 04; 40 barras/rolos"},
  {"frente":"Esgoto sanitário","rede":"EBE 04","categoria":"PEAD","descricao":"Curva 22,5° PE-100 SDR17 DE125 (solda de topo)","unidade":"pç","projeto":2,"qtd":2,"obs":"EBE 04; estimativa sem detalhe de projeto (validar)"},
  {"frente":"Esgoto sanitário","rede":"EBE 04","categoria":"PEAD","descricao":"Curva 45° PE-100 SDR17 DE125 (solda de topo)","unidade":"pç","projeto":2,"qtd":2,"obs":"EBE 04; estimativa sem detalhe de projeto (validar)"},
  {"frente":"Esgoto sanitário","rede":"EBE 04","categoria":"PEAD","descricao":"Curva 60° PE-100 SDR17 DE125 (solda de topo)","unidade":"pç","projeto":2,"qtd":2,"obs":"EBE 04; estimativa sem detalhe de projeto (validar)"},
  {"frente":"Esgoto sanitário","rede":"EBE 04","categoria":"PEAD","descricao":"Curva 90° PE-100 SDR17 DE125 (solda de topo)","unidade":"pç","projeto":1,"qtd":1,"obs":"EBE 04; estimativa sem detalhe de projeto (validar)"},
  {"frente":"Esgoto sanitário","rede":"EBE 04","categoria":"PEAD","descricao":"Colarinho (stub end) PE-100 DE125 + flange solto PN10 DN100","unidade":"cj","projeto":1,"qtd":1,"obs":"EBE 04; estimativa sem detalhe de projeto (validar)"},
  {"frente":"Drenagem pluvial","rede":"Drenagem","categoria":"PEAD","descricao":"Tubo corrugado parede dupla DN400, junta de encaixe c/ anel, barra 6 m","unidade":"m","projeto":3431.4,"qtd":3946.11,"obs":"658 barras/rolos","codigo_srv":"1.3.1","coef":1.15},
  {"frente":"Drenagem pluvial","rede":"Drenagem","categoria":"PEAD","descricao":"Anel de vedação EPDM DN400 (reposição)","unidade":"pç","projeto":33,"qtd":33,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Drenagem pluvial","rede":"Drenagem","categoria":"PEAD","descricao":"Luva de encaixe corrugado parede dupla DN400","unidade":"pç","projeto":127,"qtd":127,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Drenagem pluvial","rede":"Drenagem","categoria":"PEAD","descricao":"Anel de vedação de passagem em parede (PV/CC/ala) DN400","unidade":"pç","projeto":254,"qtd":254,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Drenagem pluvial","rede":"Drenagem","categoria":"PEAD","descricao":"Tubo corrugado parede dupla DN500, junta de encaixe c/ anel, barra 6 m","unidade":"m","projeto":199.54,"qtd":229.471,"obs":"39 barras/rolos","codigo_srv":"1.3.2","coef":1.15},
  {"frente":"Drenagem pluvial","rede":"Drenagem","categoria":"PEAD","descricao":"Anel de vedação EPDM DN500 (reposição)","unidade":"pç","projeto":2,"qtd":2,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Drenagem pluvial","rede":"Drenagem","categoria":"PEAD","descricao":"Luva de encaixe corrugado parede dupla DN500","unidade":"pç","projeto":5,"qtd":5,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Drenagem pluvial","rede":"Drenagem","categoria":"PEAD","descricao":"Anel de vedação de passagem em parede (PV/CC/ala) DN500","unidade":"pç","projeto":10,"qtd":10,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Drenagem pluvial","rede":"Drenagem","categoria":"PEAD","descricao":"Tubo corrugado parede dupla DN600, junta de encaixe c/ anel, barra 6 m","unidade":"m","projeto":89.24,"qtd":102.626,"obs":"18 barras/rolos","codigo_srv":"1.3.3","coef":1.15},
  {"frente":"Drenagem pluvial","rede":"Drenagem","categoria":"PEAD","descricao":"Anel de vedação EPDM DN600 (reposição)","unidade":"pç","projeto":1,"qtd":1,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Drenagem pluvial","rede":"Drenagem","categoria":"PEAD","descricao":"Luva de encaixe corrugado parede dupla DN600","unidade":"pç","projeto":4,"qtd":4,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Drenagem pluvial","rede":"Drenagem","categoria":"PEAD","descricao":"Anel de vedação de passagem em parede (PV/CC/ala) DN600","unidade":"pç","projeto":8,"qtd":8,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"PVC DEFOFO","descricao":"Tubo PVC 12 DEFOFO JE DN150 (NBR 7665), barra 6 m","unidade":"m","projeto":19,"qtd":21.85,"obs":"4 barras/rolos"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Extremidade flange x bolsa JGS DN150","unidade":"pç","projeto":1,"qtd":1,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Tê bolsas JGS p/ DEFOFO DN150 x 100","unidade":"pç","projeto":1,"qtd":1,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Adaptador ponta e bolsa JGS DN150 x PBA DN100","unidade":"pç","projeto":1,"qtd":1,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Adaptador ponta e bolsa JGS DN100 x PBA DN100","unidade":"pç","projeto":1,"qtd":1,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"PVC PBA","descricao":"Tubo PVC PBA JEI classe 15 DN100/DE110 (NBR 5647), barra 6 m","unidade":"m","projeto":6945,"qtd":7986.75,"obs":"1332 barras/rolos","codigo_srv":"1.5.1","coef":1.15},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"PVC PBA","descricao":"Tubo PVC PBA JEI classe 15 DN75/DE85 (NBR 5647), barra 6 m","unidade":"m","projeto":6724,"qtd":7732.6,"obs":"1289 barras/rolos","codigo_srv":"1.5.2","coef":1.15},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Tubo FoFo DN100 JGS, barra 6 m (trecho engastado na ponte)","unidade":"m","projeto":42,"qtd":48.3,"obs":"9 barras/rolos"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Conexão FoFo dúctil (Klikso ou similar): Curva 22°30' c/ bolsas DN100 p/ PBA","unidade":"pç","projeto":82,"qtd":82,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Conexão FoFo dúctil (Klikso ou similar): Curva 22°30' c/ bolsas DN75 p/ PBA","unidade":"pç","projeto":42,"qtd":42,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Conexão FoFo dúctil (Klikso ou similar): Curva 45° c/ bolsas DN100 p/ PBA","unidade":"pç","projeto":24,"qtd":24,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Conexão FoFo dúctil (Klikso ou similar): Curva 45° c/ bolsas DN75 p/ PBA","unidade":"pç","projeto":4,"qtd":4,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Conexão FoFo dúctil (Klikso ou similar): Curva 90° c/ bolsas DN100 p/ PBA","unidade":"pç","projeto":14,"qtd":14,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Conexão FoFo dúctil (Klikso ou similar): Curva 90° c/ bolsas DN75 p/ PBA","unidade":"pç","projeto":4,"qtd":4,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Conexão FoFo dúctil (Klikso ou similar): Redução c/ bolsa DN100 x 75 p/ PBA","unidade":"pç","projeto":6,"qtd":6,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Conexão FoFo dúctil (Klikso ou similar): Tê c/ bolsas DN100/DE110 p/ PBA","unidade":"pç","projeto":2,"qtd":2,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Conexão FoFo dúctil (Klikso ou similar): Tê c/ bolsas DN75/DE85 p/ PBA","unidade":"pç","projeto":4,"qtd":4,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"CAP c/ bolsa DN75 p/ PBA (pontas de rede)","unidade":"pç","projeto":8,"qtd":8,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Junta de desmontagem travada axialmente DN100","unidade":"pç","projeto":3,"qtd":3,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Válvula gaveta c/ bolsa Euro 24 DN100","unidade":"pç","projeto":4,"qtd":4,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Válvula gaveta c/ bolsa Euro 24 DN75","unidade":"pç","projeto":6,"qtd":6,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Tampão TD9 p/ registro","unidade":"pç","projeto":10,"qtd":10,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"Alvenaria","descricao":"Caixa de proteção de registro 1,00 x 1,00 m (padrão CORSAN)","unidade":"un","projeto":10,"qtd":10,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Hidrante de coluna DN100 PN10, kit completo","unidade":"cj","projeto":2,"qtd":2,"obs":""},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"FoFo","descricao":"Expurgo / descarga de rede","unidade":"un","projeto":4,"qtd":4,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"Concreto","descricao":"Bloco de ancoragem C-30 (0,6 m³ + 1,6 m² forma cada)","unidade":"un","projeto":192,"qtd":192,"obs":"estimativa sem detalhe de projeto (validar)"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"PEAD","descricao":"Tubo PEAD azul 20x2,3 PN10 PE80, rolo 100 m","unidade":"m","projeto":600,"qtd":690,"obs":"7 barras/rolos"},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"PP","descricao":"Tê de serviço integrado 85x20 (rede DN75/DE85)","unidade":"pç","projeto":172,"qtd":172,"obs":""},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"PP","descricao":"Tê de serviço integrado 110x20 (rede DN100/DE110)","unidade":"pç","projeto":128,"qtd":128,"obs":""},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"PP","descricao":"Adaptador PP p/ PEAD 20 x 3/4\"","unidade":"pç","projeto":300,"qtd":300,"obs":""},
  {"frente":"Abastecimento de água","rede":"Água","categoria":"Metal","descricao":"Cavalete padrão CORSAN 3/4\"","unidade":"un","projeto":300,"qtd":300,"obs":""}
];

function criarObraAvaResidence() {
  const O = central_('Obras');
  let o = O.all().find(x => String(x.sigla).toUpperCase() === 'AVA');
  const nova = !o;
  if (nova) o = criarObra_('AVA Residence', 'AVA', 'Maquiné/RS', AVA_FRENTES_);
  const u = central_('Usuarios').all().find(x => norm_(x.login) === 'renan') || { id: '', nome: 'Importação AVA Residence' };
  const ctx = { u: u, admin: true, obra: o, perms: Object.keys(PERMISSOES), ss: SpreadsheetApp.openById(o.planilha_id) };
  const L = LockService.getScriptLock();
  L.waitLock(30000);
  try {
    AVA_FRENTES_.forEach(n => { if (!orcFrente_(ctx, n)) orcFrenteSalvar_({ nome: n }, ctx); });
    // valores da R02 por frente: só onde ainda não há preço (não apaga o que você mudou)
    const Fr = obraTab_(ctx, 'Frentes');
    let nVal = 0;
    AVA_FRENTES_.forEach(n => {
      const f = orcFrente_(ctx, n), v = AVA_VALORES_[n];
      if (!v || num_(f.preco) > 0) return;
      ['preco', 'custo_direto', 'adm_local', 'indiretas', 'tributos'].forEach(k => { f[k] = v[k]; });
      if (!f.descricao && v.etapas.length > 1) f.descricao = v.etapas.join(' · ').slice(0, 300);
      Fr.update(f); nVal++;
    });
    // serviços: os que ainda não estão no orçamento da frente (pelo código do item); os que já estão ganham o preço de venda, se faltar
    const T = obraTab_(ctx, 'OrcItens');
    let nServ = 0;
    AVA_FRENTES_.forEach(n => {
      const f = orcFrente_(ctx, n), ja = {};
      T.all().filter(i => String(i.frente) === String(f.codigo) && orcAtivo_(i)).forEach(i => { ja[String(i.codigo)] = i; });
      AVA_ITENS_.filter(i => i.frente === n && ja[i.codigo] && ja[i.codigo].unit_venda === '' && i.unit_venda !== '').forEach(i => {
        const x = ja[i.codigo];
        x.unit_venda = i.unit_venda; x.obs = String(x.obs || '').replace(/^Proposta: [^·]*· total R\$ [\d.,]+( · )?/, '');
        T.update(x);
      });
      const novos = AVA_ITENS_.filter(i => i.frente === n && !ja[i.codigo]).map(i => ({ codigo: i.codigo, servico: i.servico, unidade: i.unidade, qtd: i.qtd, unit_material: i.unit_material, unit_mo: i.unit_mo, unit_venda: i.unit_venda, obs: i.obs }));
      if (novos.length) { orcItensSalvar_({ frente: f.codigo, itens: novos }, ctx); nServ += novos.length; }
    });
    // materiais: entram no cadastro da obra (para os pedidos casarem) e no orçamento da frente
    const Mt = obraTab_(ctx, 'Materiais'), M = obraTab_(ctx, 'OrcMateriais');
    let nMat = 0;
    AVA_MATERIAIS_.forEach(m => {
      let cad = Mt.all().find(x => norm_(x.descricao) === norm_(m.descricao));
      if (!cad) cad = Mt.insert({ codigo: Mt.proxCodigo('codigo', 'M', 4), descricao: m.descricao, unidade: m.unidade, categoria: m.categoria, estoque_min: '', ativo: 'Sim' });
      const f = orcFrente_(ctx, m.frente);
      const it = m.codigo_srv ? T.all().find(i => String(i.frente) === String(f.codigo) && String(i.codigo) === m.codigo_srv && orcAtivo_(i)) : null;
      if (M.all().some(x => orcAtivo_(x) && String(x.frente) === String(f.codigo) && String(x.material_cod) === String(cad.codigo))) return;
      orcMaterialSalvar_(it ? { orc_item: it.id, material_cod: cad.codigo, coef: m.coef, obs: m.obs } : { frente: f.codigo, material_cod: cad.codigo, qtd: m.qtd, obs: m.obs }, ctx);
      nMat++;
    });
    const r = 'AVA Residence (' + o.id + ')' + (nova ? ' criada' : ' já existia') + ' · ' + nServ + ' serviços e ' + nMat + ' materiais incluídos no orçamento · valores da R02 em ' + nVal + ' frentes';
    log_(ctx, 'importar_ava', r);
    Logger.log(r);
    return r;
  } finally { L.releaseLock(); }
}
