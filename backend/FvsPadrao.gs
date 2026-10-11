/** Modelos de FVS importados do Drive (SIZE Qualidade). Gerado automaticamente; edite os modelos pelo app. */
const FVS_MODELOS_PADRAO_ = [
  { codigo: 'FVS.02', nome: 'Locação Topográfica', categoria: 'Infraestrutura', tipo: 'Topografia e locação', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: '', itens: [
    'Posição geográfica da área condiz com a realidade, existe amarração no levantamento topográfico (item externo existente, ex.: cerca, meio-fio, poste etc.)?',
    'Foram usadas planilhas de locação/nivelação geométrica, e foram conferidas junto à FVS?',
    'Existem interferências na área não relatadas que exigiram alterações de cotas ou coordenadas projetadas? Quais foram, quem executou e por quem foram autorizadas? As notas de serviço devem estar junto à FVS.',
    'Existem marcos topográficos preexistentes? Observar e assinar quais foram usados.',
    'O uso da altimetria confere com os preexistentes?',
    'As estacas de demarcação foram bem fixadas, aprumadas, pintadas e as informações estão legíveis?',
    'Foram feitas imagens dos pontos e diário de serviço?'
  ] } ] },
  { codigo: 'FVS.03', nome: 'Execução de Rede Pluvial', categoria: 'Infraestrutura', tipo: 'Rede pluvial', revisao: '00', data_rev: '', revisar: true, nota: 'Conteúdo original era de tanque metálico; itens adaptados da FVS.04. Revisar.', blocos: [ { titulo: '', itens: [
    'Posição geográfica da área condiz com a do projeto apresentado?',
    'Foram usadas marcações topográficas para execução e foram respeitadas as demarcações topográficas? Houve necessidade de alguma alteração? Foram realizadas e autorizadas por quem?',
    'Existem interferências na área não relatadas no projeto que exigiram alterações na execução? Quais foram, quem executou e por quem foram autorizadas? As autorizações de serviço devem estar junto à FVS.',
    'Foram feitas imagens dos pontos e diário de serviço/obras?',
    'Foi executado o item na sua totalidade?',
    'Houve compactação do material do fundo das valas, está bem compactado? Existem falhas ou falta de nivelamento do material?',
    'Os tubos estão bem alinhados e nivelados, com declividade conforme projeto?',
    'As juntas de união (anéis) estão fixadas corretamente e alinhadas ao tubo, estão rejuntadas/cobertas?',
    'Os poços de visita estão bem rejuntados, alinhados, sem rachaduras ou trincas, estão tampados e limpos?',
    'As bocas de lobo e caixas coletoras foram instaladas, estão alinhadas, rejuntadas, limpas, com grelhas/tampas e bem fixadas?',
    'Houve escavação abaixo de 1,20m com necessidade de rebaixamento? Foram obedecidas as normas de segurança do trabalho? Juntar as ordens de serviço e NRs.'
  ] } ] },
  { codigo: 'FVS.04', nome: 'Execução de Rede Cloacal', categoria: 'Infraestrutura', tipo: 'Rede de esgoto', revisao: '00', data_rev: '2026-02-10', revisar: false, nota: '', blocos: [ { titulo: '', itens: [
    'Posição geográfica da área condiz com a do projeto apresentado?',
    'Foram usadas marcações topográficas para execução e foram respeitadas as demarcações topográficas? Houve necessidade de alguma alteração? Foram realizadas e autorizadas por quem?',
    'Existem interferências na área não relatadas no projeto que exigiram alterações na execução? Quais foram, quem executou e por quem foram autorizadas? As autorizações de serviço devem estar junto à FVS.',
    'Foram feitas imagens dos pontos e diário de serviço/obras?',
    'Foi executado o item na sua totalidade?',
    'Houve compactação do material do fundo das valas, está bem compactado? Existem falhas ou falta de nivelamento do material?',
    'Os tubos estão bem alinhados e nivelados?',
    'As juntas de união (anéis) estão fixadas corretamente e alinhadas ao tubo, estão rejuntadas/cobertas?',
    'Os poços de visita estão bem rejuntados, alinhados, sem rachaduras ou trincas, estão tampados e limpos?',
    'Houve escavação abaixo de 1,20m com necessidade de rebaixamento? Foram obedecidas as normas de segurança do trabalho com rebaixamento? Juntar as ordens de serviço e NRs.',
    'Caixas de passeio foram instaladas, estão alinhadas, rejuntadas, limpas, tampadas e bem fixadas?'
  ] } ] },
  { codigo: 'FVS.05', nome: 'Compactação de Aterro', categoria: 'Infraestrutura', tipo: 'Terraplenagem', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: ['Limpeza do terreno'] },
    { titulo: 'B. Execução do serviço', itens: [
      'Tubulações de hidráulica e elétrica',
      'Camadas de compactação, verificar uma vez por dia a qualquer hora, não devendo superar 20cm de espessura',
      'Acabamento, verificar uniformidade do terreno',
      'Limpeza'
    ] } ] },
  { codigo: 'FVS.06', nome: 'Locação da Obra', categoria: 'Infraestrutura', tipo: 'Topografia e locação', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: ['Definição de nível de referência'] },
    { titulo: 'B. Execução do serviço', itens: [
      'Locação dos piquetes (quando aplicável), devem ser conferidos ao menos 30% do total, através de diagonais (triangulação)',
      'Esquadro do gabarito, verificar através de triangulação',
      'Fixação, travamento, alinhamento e nível da tabeira, verificar através de linha e nível de mangueira ou laser após a sua conclusão',
      'Locação dos eixos das peças na tabeira, verificar por meio de trena metálica'
    ] } ] },
  { codigo: 'FVS.07.1', nome: 'Fundação com Estaca Rotativa Convencional - Microestaca', categoria: 'Civil', tipo: 'Fundação', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: '', itens: [
    'Locação do eixo da estaca ± 10% do diâmetro da estaca',
    'Verticalidade da perfuração, no prumo',
    'Diâmetro de perfuração',
    'Profundidade de perfuração',
    'Armadura conforme projeto',
    'Concretagem'
  ] } ] },
  { codigo: 'FVS.07.2', nome: 'Fundação com Estaca Pré-Moldada', categoria: 'Civil', tipo: 'Fundação', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: '', itens: [
    'Verificar se o espaçamento entre eixos de estaca atende às especificações',
    'Verificar a existência de ligações entre as estacas e os blocos e as emendas entre estacas',
    'Verificar as excentricidades nos eixos das estacas, confirmando se estão dentro das tolerâncias admitidas em projeto',
    'Verificação se a nega ou o material extraído indica presença de solo suficientemente resistente',
    'Verificação da estaca quanto ao desvio de inclinação',
    'Conferir, durante a execução, a integridade do gabarito e o recobrimento das armaduras, se está conforme projeto',
    'Conferir o lançamento, em planta, das informações das estacas (data da realização, profundidade alcançada, nega (se for o caso), quebras, emendas, reforços, excentricidades)',
    'Verificar, antes das concretagens, se as esperas de aço estão disponíveis'
  ] } ] },
  { codigo: 'FVS.07.3', nome: 'Fundação com Radier', categoria: 'Civil', tipo: 'Fundação', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: '', itens: [
    'Montagem do gabarito de acordo com o projeto (nível, esquadro, rebaixo, fixações)',
    'Conferir as esperas elétricas e hidráulicas de acordo com as esperas no gabarito',
    'Nivelamento da base até completar o volume abaixo do gabarito',
    'Conferir armaduras (telas, barras e reforços) e espaçadores indicados',
    'Conferir juntas de movimentação, quando aplicável',
    'Proteção contra trânsito de pessoas e impactos',
    'Conferir a cura do concreto aplicando água corrente periodicamente'
  ] } ] },
  { codigo: 'FVS.08', nome: 'Execução de Fôrma', categoria: 'Civil', tipo: 'Estrutura', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: ['Verificar a integridade da peça'] },
    { titulo: 'B. Execução do serviço', itens: [
      'Verificar medidas dos painéis conforme projeto',
      'Verificar medidas das fôrmas montadas conforme projeto',
      'Desmoldante, quando aplicável',
      'Conferir o prumo das fôrmas: ± 0,5cm a cada 5,00 m',
      'Conferir o esquadro: ± 0,2cm a cada 5,00 m',
      'Conferir nível das fôrmas: ± 0,5cm a cada 5,00 m. No caso de laje (L = dimensão): ± 10mm para L < 3m; ± 15mm para L > 3m',
      'Dimensões: ± 0,5cm a cada 5,00 m',
      'Conferir travamento',
      'Base de brita com lona ou concreto magro',
      'Vedação das juntas, estanqueidade, escoramento, travamento e limpeza',
      'Molhar as fôrmas, quando aplicável'
    ] } ] },
  { codigo: 'FVS.09', nome: 'Montagem de Armadura', categoria: 'Civil', tipo: 'Estrutura', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: [
      'Local limpo e organizado',
      'Alvenaria concluída',
      'Foi feito o reescoramento na laje inferior, se necessário',
      'Está instalada a proteção de periferia'
    ] },
    { titulo: 'B. Execução do serviço', itens: [
      'Verificar a integridade e as medidas das fôrmas montadas',
      'Verificar a posição, dimensão e bitola das armaduras',
      'Verificar os espaçadores',
      'Nível das fôrmas',
      'Travamento',
      'Foram realizadas as passagens elétricas, conforme projeto',
      'Foram realizadas as passagens hidráulicas, conforme projeto',
      'Foram usados espaçadores',
      'Concretagem',
      'Terminalidade e limpeza'
    ] } ] },
  { codigo: 'FVS.10', nome: 'Concretagem de Peça Estrutural', categoria: 'Civil', tipo: 'Estrutura', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Antes da concretagem', itens: [
      'Armadura (situação final): conforme projeto, bem posicionada, sem nenhum deslocamento e com espaçadores',
      'Tubulação: conforme projeto, bem posicionada/protegida',
      'Mangueiras/eletrodutos amarrados na armadura: devidamente amarrados, evitando a subida dos mesmos. Observar a posição das mangueiras/eletrodutos na laje (evitando possibilidade de subida ou descida dos mesmos durante a concretagem)',
      'Caixas: conforme projeto, bem posicionadas/protegidas',
      'Presença de espaçadores de no mínimo 2,5 cm sob a tela, com pouco espaçamento entre estes (para evitar que em pontos com poucos espaçadores o concreto pese e desloque as mangueiras/eletrodutos)'
    ] },
    { titulo: 'B. Concretagem', itens: [
      'Acabamento da superfície: ausência de “bicheiras”. Liso e reguado, se for o caso',
      'Junta de dilatação ou outras, se houver: conforme projeto',
      'Deformações: até 5 mm a cada 10 m'
    ] },
    { titulo: 'C. Depois da desforma', itens: [
      'Acabamento da superfície: ausência de “bicheiras”. Liso e reguado, se for o caso',
      'Junta de dilatação ou outras, se houver: conforme projeto',
      'Deformações: até 5 mm a cada 10 m',
      'Local pronto e limpo',
      'Limpeza nos entornos da edificação: local sem presença de resíduos e os mesmos destinados ao local devido (caçambas) ou áreas apropriadas de resíduos'
    ] } ] },
  { codigo: 'FVS.11', nome: 'Alvenaria Estrutural', categoria: 'Civil', tipo: 'Alvenaria', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: [
      'Verificar se o local está limpo',
      'Sistema de proteção coletiva está instalado'
    ] },
    { titulo: 'B. Execução do serviço - 1ª marcação', itens: [
      'Marcação, conforme projeto e eixos de laje. Tolerância de ± 2mm',
      'Posição dos arranques',
      'Blocos com janelas de visita',
      'Nivelamento da fiada de marcação, através de nível alemão ou mangueira e trena. Tolerância de ± 2mm',
      'Largura e alinhamento dos vãos de portas. Tolerância de ± 5mm'
    ] },
    { titulo: 'C. Execução do serviço - Elevação da 2ª à 5ª fiada', itens: [
      'Planeza e prumo da alvenaria (ambiente interno). Tolerância de ± 3mm',
      'Paginação da alvenaria',
      'Verificar armação da janela'
    ] },
    { titulo: 'D. Execução do serviço - Grauteamento da 5ª fiada', itens: [
      'Limpeza nas janelas de inspeção',
      'Fechamento das janelas de inspeção, o travamento deve impedir a fuga do graute',
      'Verificar armação das canaletas',
      'Grauteamento das colunas e canaletas, verificar visualmente o adensamento do graute e se as peças grauteadas foram molhadas'
    ] },
    { titulo: 'E. Execução do serviço - Elevação da 6ª fiada à última', itens: [
      'Planeza e prumo da alvenaria (ambiente interno). Tolerância de ± 3mm',
      'Paginação da alvenaria',
      'Largura, altura e alinhamento dos vãos de portas e janelas. Tolerância de ± 5mm',
      'Limpeza nas janelas de inspeção',
      'Fechamento das janelas de inspeção',
      'Grauteamento das colunas e canaletas, verificar visualmente o adensamento do graute e se as peças grauteadas foram molhadas',
      'Conferir nível e prumo',
      'Blocos da elétrica',
      'Ventilação de gás',
      'Terminalidade e limpeza'
    ] },
    { titulo: 'F. Após execução do serviço de grauteamento', itens: [
      'Verificar se todas as janelas de inspeção estão preenchidas',
      'Verificar o preenchimento dos pontos verticais',
      'Os pontos falhados foram recuperados'
    ] } ] },
  { codigo: 'FVS.12', nome: 'Execução de Alvenaria de Vedação', categoria: 'Civil', tipo: 'Alvenaria', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Antes da concretagem', itens: [
    'Marcação, tolerância de ± 5mm',
    'Nivelamento da fiada de marcação, tolerância de 1cm a cada 5m',
    'Planeza e prumo da alvenaria (ambiente interno), tolerância de ± 3mm',
    'Largura, altura e alinhamento dos vãos de portas e janelas, tolerância de ± 5mm',
    'Espessura do vão para fixação, tolerância de ± 5mm',
    'Terminalidade e limpeza'
  ] } ] },
  { codigo: 'FVS.13.1', nome: 'Revestimento Interno Argamassado', categoria: 'Civil', tipo: 'Revestimento', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: ['Preparação da base (remoção de sujeira)'] },
    { titulo: 'B. Execução do serviço', itens: [
      'Colocação de telas quando solicitado',
      'Planicidade e prumo de taliscas, tolerância de ± 3mm',
      'Esquadro entre as taliscas de canto',
      'Caimento em vãos de janelas',
      'Aspecto final e cantos (logo após o término do serviço)',
      'Terminalidade e limpeza'
    ] } ] },
  { codigo: 'FVS.13.2', nome: 'Revestimento Interno em Gesso', categoria: 'Civil', tipo: 'Revestimento', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Execução do serviço', itens: [
    'Verificar a planeza, incluir a verificação no rodapé, desvio máximo de 3mm desempenado e 2mm sarrafeado',
    'Verificar principalmente junto aos vãos de porta, desvio máximo de 1mm',
    'Verificar esquadro nos cantos e esquadro das paredes, desvio máximo de 2mm',
    'Verificar a linearidade e regularidade, riscando os cantos',
    'Verificar a rugosidade, ondulação, presença de fissuras ou desagregação',
    'O ambiente deve estar totalmente limpo, sem restos de gesso etc.'
  ] } ] },
  { codigo: 'FVS.13.3', nome: 'Revestimento Interno em Gesso Corrido de Paredes e Teto', categoria: 'Civil', tipo: 'Revestimento', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Preparação da base', itens: [
      'Superfície seca, limpa e isenta de patologias',
      'Superfície livre de agentes contaminantes que comprometam a aderência',
      'Eletrodutos e caixas de luz instalados e nivelados com a futura superfície do gesso',
      'Remoção de ponta de ferro e tratamento com zarcão',
      'Aderência adequada da base para receber o gesso'
    ] },
    { titulo: 'B. Execução do serviço', itens: [
      'Nivelamento e prumo conforme projeto, sem ondulações visíveis',
      'Espessura uniforme e dentro das especificações do fabricante/projeto',
      'Superfície lisa, uniforme, sem fissuras, manchas, empolamentos ou irregularidades grosseiras',
      'Juntas tratadas com fita e massa, imperceptíveis (marcar NA para gesso corrido)',
      'Recortes precisos e alinhados com as caixas ou pontos previstos',
      'Verificar a planeza, incluir a verificação no rodapé, desvio máximo de 3mm desempenado e 2mm sarrafeado',
      'Verificar principalmente junto aos vãos de porta, desvio máximo de 1mm',
      'Verificar esquadro nos cantos e esquadro das paredes, desvio máximo de 2mm',
      'Verificar a linearidade e regularidade, riscando os cantos',
      'Verificar a rugosidade, ondulação, presença de fissuras ou desagregação'
    ] },
    { titulo: 'C. Pós-execução e limpeza', itens: [
      'Área de trabalho limpa e organizada',
      'Superfícies protegidas contra respingos e danos',
      'O ambiente deve estar totalmente limpo, sem restos de gesso etc.'
    ] } ] },
  { codigo: 'FVS.14.1', nome: 'Revestimento Externo em Peça Cerâmica', categoria: 'Civil', tipo: 'Revestimento', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: ['Preparação da base (remoção de sujeira)'] },
    { titulo: 'B. Execução do serviço', itens: [
      'Colocação de telas quando solicitado',
      'Planicidade e prumo de taliscas, tolerância de ± 3mm',
      'Esquadro entre as taliscas de canto',
      'Caimento em vãos de janelas',
      'Aspecto final e cantos (logo após o término do serviço)',
      'Terminalidade e limpeza'
    ] } ] },
  { codigo: 'FVS.14.2', nome: 'Revestimento Externo Argamassado', categoria: 'Civil', tipo: 'Revestimento', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: [
      'Preparação da base e arremate das juntas da alvenaria, verificar se há imperfeições na base que possam comprometer a qualidade do serviço',
      'Limpeza do substrato com lava-jato'
    ] },
    { titulo: 'B. Execução do serviço', itens: [
      'Chapisco',
      'Conferir o prumo',
      'Planicidade das mestras, com auxílio de régua',
      'Limpeza e organização da área'
    ] } ] },
  { codigo: 'FVS.15.1', nome: 'Contrapiso Externo', categoria: 'Civil', tipo: 'Piso', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Condições de início', itens: [
    'Área nivelada e compactada',
    'Instalações enterradas concluídas e, quando for o caso, testadas',
    'Definição do traço do concreto ou argamassa do contrapiso',
    'Execução de lastro de brita compactada, quando aplicável',
    'Taliscas e mestras no nível do contrapiso',
    'Nivelamento do contrapiso com régua de alumínio (tolerância de ± 3 mm)',
    'Caimento em áreas molhadas, conforme previsto em projeto',
    'Desempeno com madeira ou mecanicamente (tolerância de ± 5mm)',
    'Juntas de movimentação, quando aplicável',
    'Regularidade da superfície',
    'Proteção contra trânsito de pessoas e impactos (no mínimo por 12 horas)',
    'Limpeza do ambiente'
  ] } ] },
  { codigo: 'FVS.15.2', nome: 'Contrapiso Interno', categoria: 'Civil', tipo: 'Piso', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Condições de início', itens: [
    'Nível marcado nas paredes',
    'Nivelamento do contrapiso com régua de alumínio (tolerância de ± 3 mm)',
    'Caimento em áreas molhadas, conforme previsto em projeto',
    'Juntas de movimentação, quando aplicável',
    'Proteção contra trânsito de pessoas e impactos (no mínimo por 12 horas)',
    'Limpeza do ambiente'
  ] } ] },
  { codigo: 'FVS.16', nome: 'Revestimento Interno Cerâmico de Piso Área Seca e Úmida', categoria: 'Civil', tipo: 'Piso', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: [
      'Contrapiso limpo e pontos de partida definidos',
      'Planicidade, tolerância de ± 2mm'
    ] },
    { titulo: 'B. Execução do serviço', itens: [
      'Dupla colagem, para peças acima de 30x30cm',
      'Espessura das juntas, tolerância de ± 1mm',
      'Caimento nas áreas molhadas conforme projeto',
      'Tonalidade das peças, verificar se as peças possuem a mesma tonalidade',
      'Fixação das peças, bater com um martelo de borracha para verificar peças ocas',
      'Limpeza, verificar ausência de manchas',
      'Preenchimento das juntas, devem estar 100% preenchidas, sem falhas',
      'Caimento nas áreas molhadas, através de água, após término do serviço',
      'Terminalidade e limpeza'
    ] } ] },
  { codigo: 'FVS.17', nome: 'Revestimento Interno Cerâmico de Parede Área Úmida', categoria: 'Civil', tipo: 'Revestimento', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: ['Paredes limpas e pontos de partida definidos'] },
    { titulo: 'B. Execução do serviço', itens: [
      'Planicidade, tolerância de ± 2mm',
      'Espessura das juntas',
      'Cantoneira',
      'Tonalidade das peças, verificar se as peças possuem a mesma tonalidade',
      'Preenchimento das juntas',
      'Limpeza'
    ] } ] },
  { codigo: 'FVS.18.1', nome: 'Piso Externo Intertravado de Concreto', categoria: 'Infraestrutura', tipo: 'Pavimentação', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: [
      'Conferir a limpeza da área, sem tocos e raízes',
      'Verificar em projeto os níveis desejados'
    ] },
    { titulo: 'B. Execução do serviço', itens: [
      'Verificar os níveis desejados',
      'Verificar se houve alinhamento de meio-fio e caixas de passagem de elétrica e esgoto',
      'Proteção dos ralos para evitar entupimento',
      'Verificar a compactação do bloco após o assentamento',
      'Compactação e regularização das áreas de confecção dos colchões de areia ou de pó de pedra, espessura de aproximadamente 5cm',
      'Assentamento de blocos de concreto e piso tátil, conforme modulação ou orientações do fabricante',
      'Verificar a compactação e planicidade dos blocos após o assentamento, até 3mm',
      'Conferir o caimento (cuidar de acessibilidade e PPCI), aproximadamente 0,5%',
      'Verificar o rejuntamento com areia fina',
      'Sinalização e pintura de estacionamento',
      'Limpeza da área'
    ] } ] },
  { codigo: 'FVS.18.2', nome: 'Piso Externo com Concreto Reguado', categoria: 'Infraestrutura', tipo: 'Pavimentação', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Condições de início', itens: [
    'Verificar os níveis desejados em projeto',
    'Verificar se a base foi regularizada e apiloada',
    'Verificar se houve alinhamento de meio-fio',
    'Verificar as juntas de dilatação',
    'Verificar se a superfície está regular e homogênea',
    'Verificar o traço 1:3:3 (cimento, brita e areia)',
    'Verificar se a cura úmida foi executada após 1 dia'
  ] } ] },
  { codigo: 'FVS.19', nome: 'Forro de Gesso', categoria: 'Civil', tipo: 'Revestimento', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: ['Definição do nível'] },
    { titulo: 'B. Execução do serviço', itens: [
      'Fixação dos pinos de aço no fundo da laje, mínimo de 1 tiro por placa',
      'Fixar arame galvanizado nos pinos, a prumo',
      'Posicionamento dos pontos de iluminação',
      'Fixação das placas nos arames',
      'Rejunte por cima das placas',
      'Rejunte dos furos de fixação',
      'Nivelamento do forro',
      'Rejunte das juntas inferiores com pasta de gesso'
    ] } ] },
  { codigo: 'FVS.20.1', nome: 'Execução de Impermeabilização com Manta Asfáltica', categoria: 'Civil', tipo: 'Impermeabilização', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: [
      'Verificar a regularização da superfície com argamassa',
      'Verificar os caimentos determinados em projeto na regularização'
    ] },
    { titulo: 'B. Execução do serviço', itens: [
      'Verificar o rebaixo da regularização próximo aos ralos',
      'Verificar se os cantos foram arredondados',
      'Verificar o recuo dos rodapés das paredes',
      'Verificar a limpeza e homogeneidade da regularização',
      'Verificar as juntas de dilatação conforme projeto',
      'Verificar a imprimação da superfície',
      'Verificar o transpasse da manta obedecendo à sobreposição do fabricante',
      'Verificar a estanqueidade do sistema por 72 horas, tolerância de 12h',
      'Verificar o elemento separador entre a manta e a proteção mecânica',
      'Verificar se a proteção mecânica respeitou os caimentos'
    ] } ] },
  { codigo: 'FVS.20.2', nome: 'Execução de Impermeabilização com Argamassa Polimérica', categoria: 'Civil', tipo: 'Impermeabilização', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: ['Verificar se a superfície está limpa e úmida'] },
    { titulo: 'B. Execução do serviço', itens: [
      'Verificar se a mistura dos componentes está conforme orientação do fabricante',
      'Verificar o consumo por m² por demão conforme contratado',
      'Verificar o modo de aplicação conforme procedimento de execução de serviços (PES) e/ou orientações do fabricante na embalagem',
      'Verificar a utilização de tela estrutural conforme procedimento, projeto ou orientações da engenharia',
      'Verificar se a superfície está sem falhas e saliências'
    ] } ] },
  { codigo: 'FVS.20.3', nome: 'Execução de Impermeabilização com Pintura Asfáltica', categoria: 'Civil', tipo: 'Impermeabilização', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Execução do serviço', itens: [
    'Limpeza e regularidade da superfície',
    'Proteção da impermeabilização',
    'Terminalidade e limpeza: verificar conclusão do serviço e limpeza dos ambientes'
  ] } ] },
  { codigo: 'FVS.20.4', nome: 'Execução de Impermeabilização com Base Cimentícia', categoria: 'Civil', tipo: 'Impermeabilização', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Execução do serviço', itens: [
    'Regularização com cimento e areia traço 3:1 (espessura mínima de 2 cm)',
    'Execução de reforços nos ralos e tubos condutores',
    'Arremates nos rodapés (mínimo de 20 cm do piso acabado e ideal de 30 cm, com no mínimo 2 cm de profundidade)',
    'Níveis definidos',
    'Pintura de solução com base cimentícia (aguardar cura por 24 horas)',
    'Juntas (primer + areia)',
    'Teste de estanqueidade (mínimo após 24 horas, ideal 72 horas)',
    'Execução de proteção mecânica com isolante, quando aplicável',
    'Acabamento de acordo com o projeto',
    'Limpeza do local'
  ] } ] },
  { codigo: 'FVS.20.5', nome: 'Execução de Impermeabilização com Membrana Líquida', categoria: 'Civil', tipo: 'Impermeabilização', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Preparo do substrato', itens: [
      'Superfície limpa, seca e isenta de pó, óleo, tinta ou resíduos',
      'Regularização executada com caimento mínimo de 1% para os ralos',
      'Cantos tratados em meia-cana',
      'Fissuras e pontos críticos selados com selante PU',
      'Substrato seco antes da aplicação da membrana'
    ] },
    { titulo: 'B. Preparo do produto', itens: [
      'Produto correto, conforme especificação',
      'Produto homogeneizado mecanicamente por ~5 minutos'
    ] },
    { titulo: 'C. Aplicação da membrana', itens: [
      'Primeira demão aplicada pura e de forma uniforme',
      'Uso de tela de poliéster em cantos, ralos e áreas críticas',
      'Intervalo entre demãos respeitado (2 a 3 horas)',
      'Demãos cruzadas executadas corretamente',
      'Consumo final conforme especificação (≈ 1 a 1,2 kg/m²)'
    ] },
    { titulo: 'D. Cura e teste de estanqueidade', itens: [
      'Secagem final respeitada antes do teste',
      'Teste de estanqueidade realizado por 72h',
      'Ausência de vazamentos/infiltrações'
    ] },
    { titulo: 'E. Proteção mecânica', itens: [
      'Proteção mecânica aplicada somente após teste aprovado',
      'Camada separadora instalada antes da argamassa'
    ] } ] },
  { codigo: 'FVS.21', nome: 'Cobertura em Telhado', categoria: 'Civil', tipo: 'Cobertura', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: [
      'Limpeza da área para início dos serviços',
      'Disponibilidade de projetos de telhado e detalhes construtivos',
      'Impermeabilização, quando aplicável'
    ] },
    { titulo: 'B. Execução do serviço', itens: [
      'Instalação prévia das calhas e condutores, verificando a existência de vazamentos',
      'Fixação das terças às tesouras, 2 cm a cada 10 m da estrutura',
      'Alinhamento horizontal e nível das terças, 2 cm a cada 10 m',
      'Fixação dos caibros às terças, 2 cm a cada 10 m',
      'Conferência das emendas de caibros (sempre executadas sobre as terças)',
      'Conferência do caimento do telhado, rigorosamente',
      'Fixação das ripas',
      'Colocação de duas ripas sobrepostas ou testeiras na 1ª fiada',
      'Alinhamento e recobrimento das telhas durante a colocação (início pelo beiral)',
      'Encaixe, amarração e fixação das telhas',
      'Verificação da estanqueidade do telhado',
      'Verificação da estanqueidade das calhas',
      'Terminalidade, limpeza e acabamento'
    ] } ] },
  { codigo: 'FVS.21.2', nome: 'Cobertura em Telhado com Estrutura Metálica', categoria: 'Civil', tipo: 'Cobertura', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Condições de início', itens: [
    'Verificar se a área onde o telhado será instalado está limpa e desobstruída',
    'Verificar a impermeabilização da laje, se aplicável',
    'Presença dos projetos, EPIs, EPCs, ferramentas e materiais necessários para realização do serviço',
    'Tubulações de água fria e barrilete concluídas e testadas',
    'Pontos de graute na alvenaria ou pilaretes executados',
    'Tubulação de ventilação dos banheiros/cozinhas locadas fora da área de calhas, a menos que seja ventilada',
    'Materiais empregados na fixação com modelo e espaçamento conforme projeto específico',
    'Estruturação montada com a inclinação, espaçamento e dimensões de acordo com projeto específico',
    'Verificação da instalação e impermeabilização correta das estruturas de funilaria como calhas, rufos e algeroz, de acordo com o previsto em projeto',
    'Telhamento realizado na direção do beiral à cumeeira',
    'Sobreposição das telhas em atendimento ao recobrimento lateral e longitudinal mínimos, de acordo com o especificado em projeto',
    'Fixação das telhas adequada e com os materiais especificados em projeto'
  ] } ] },
  { codigo: 'FVS.22', nome: 'Instalação de Portas', categoria: 'Civil', tipo: 'Esquadrias', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: [
      'Vãos de portas gabaritados e acabados, tolerância de ± 5mm',
      'Prumo e nível dos batentes, tolerância de ± 5mm',
      'Preenchimento dos sulcos no contrapiso'
    ] },
    { titulo: 'B. Execução do serviço', itens: [
      'Pregos ou pinos nas guarnições a cada 30cm, tolerância de ± 2mm',
      'Ferragens (dobradiças, fechadura e maçaneta)',
      'Proteção de dobradiças e ferragens',
      'Terminalidade e limpeza'
    ] } ] },
  { codigo: 'FVS.23', nome: 'Colocação de Esquadrias', categoria: 'Civil', tipo: 'Esquadrias', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Condições de início', itens: [
    'Conferência das folgas dos vãos (5 cm junto à contraverga e 3 cm nas demais faces, com tolerância de + 2 mm)',
    'Fios de prumo da fachada instalados',
    'Taliscas assentadas (para fixação de contramarco, quando previsto)',
    'Definição do nível de referência',
    'Cunhas verticais e horizontais',
    'Prumo, alinhamento e nível dos montantes e travessas (tolerância de ± 3 mm)',
    'Fixação dos marcos nas laterais das janelas em alinhamento com as taliscas ou reboco pronto',
    'Prumo, nível e alinhamento das janelas (tolerância de ± 3 mm)',
    'Instalação e proteção das ferragens',
    'Fixação das guarnições',
    'Aplicação de selante na junta da soleira com alvenaria até a esquadria',
    'Perfeito funcionamento das ferragens',
    'Limpeza do local'
  ] } ] },
  { codigo: 'FVS.24.1', nome: 'Execução de Guarda-Corpos Coletivo e Privado', categoria: 'Civil', tipo: 'Outros', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Condições de início', itens: [
    'Verificar fixação dos perfis conforme projeto',
    'Conferir altura do guarda-corpo conforme projeto',
    'Verificar se o vidro está íntegro, com as borrachas de vedação instaladas e bem fixadas. Para guarda-corpos, instalar apenas vidros laminado, temperado laminado ou aramado, e a proteção do vidro e perfis após conclusão dos serviços',
    'Verificar visualmente o acabamento dos perfis do guarda-corpo, não devem apresentar arranhões e partes amassadas, e a pintura deve estar sem irregularidades, manchas, respingos e outros',
    'Verificar conclusão dos serviços, terminalidade e limpeza da área'
  ] } ] },
  { codigo: 'FVS.24.2', nome: 'Execução de Corrimão Metálico', categoria: 'Civil', tipo: 'Outros', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Condições de início', itens: [
    'Verificar com trena metálica o afastamento mínimo de 40mm da parede. O corrimão deve estar firmemente fixado às paredes ou nas barras de suporte',
    'Conferir se os corrimãos estão instalados em ambos os lados das escadas e rampas, a 0,92 e a 0,70m do piso, ou conforme projeto',
    'Verificar se os corrimãos estão contínuos ao longo de toda sua extensão, sem qualquer obstrução ou arestas, e se têm acabamento recurvado nas extremidades',
    'Verificar visualmente o acabamento da pintura, sem irregularidades, manchas, respingos e outros',
    'Verificar se, na mudança de pavimentos, os corrimãos possuem sinalização tátil (caracteres em relevo e em braile), identificando o pavimento. Essa sinalização deve ser instalada na geratriz superior do prolongamento horizontal do corrimão'
  ] } ] },
  { codigo: 'FVS.25', nome: 'Execução de Pintura Interna', categoria: 'Civil', tipo: 'Pintura', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Condições de início', itens: [
    'Preparação da base, verificar visualmente se foram removidas as sujeiras, incrustações, pregos etc. antes da pintura',
    'Aplicação do selador, verificar o cobrimento e uniformidade da camada',
    'Aspecto final, verificar com lâmpada se a pintura está uniforme e, visualmente, sem falhas e escorrimentos',
    'Terminalidade e limpeza'
  ] } ] },
  { codigo: 'FVS.26', nome: 'Execução de Pintura Externa', categoria: 'Civil', tipo: 'Pintura', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Condições de início', itens: [
    'Verificar lixamento da base',
    'Aplicação de primeira demão de selador acrílico',
    'Aplicação da textura',
    'Avaliar uniformidade',
    'Conferir frisos',
    'Acabamento, uniformidade, existência de escorrimentos ou falhas de cobrimento',
    'Remoção das proteções'
  ] } ] },
  { codigo: 'FVS.27.1', nome: 'Instalação Elétrica Enterrada', categoria: 'Infraestrutura', tipo: 'Rede elétrica', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Tubulações enterradas (entrada de energia)', itens: [
      'Verificar posicionamento das caixas, tubulações e passagens, tolerância de 3mm',
      'Verificar distribuição da tubulação, conforme projeto',
      'Fechamento e fixação das caixas e tubulações',
      'Terminalidade e limpeza'
    ] },
    { titulo: 'B. Instalações enterradas (contrapiso)', itens: [
      'Verificar posicionamento das caixas, tubulações e passagens, tolerância de 3mm',
      'Verificar distribuição da tubulação, conforme projeto',
      'Verificar posicionamento das baixadas e subidas',
      'Fechamento e fixação das caixas e tubulações',
      'Terminalidade e limpeza'
    ] },
    { titulo: 'C. Tubulação em lajes', itens: [
      'Verificar a localização das caixas na fôrma, conforme projeto',
      'Verificar o traçado e a bitola dos eletrodutos na fôrma, conforme projeto',
      'Verificar se as caixas foram preenchidas com serragem ou papelão antes da concretagem',
      'Verificar as descidas e subidas de tubulação'
    ] } ] },
  { codigo: 'FVS.27.2', nome: 'Instalação Elétrica Interna', categoria: 'Civil', tipo: 'Instalações', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Tubulação em paredes', itens: [
      'Verificar a marcação dos pontos conforme projeto (4x2 ou 4x4) e sua devida ramificação com os pontos do teto do ambiente',
      'Verificar se o chumbamento das caixas respeitou a espessura do revestimento',
      'Verificar a bitola dos eletrodutos conforme projeto',
      'Verificar a retirada dos entulhos pelo eletricista'
    ] },
    { titulo: 'B. Enfiações', itens: [
      'Verificar a seção nominal dos fios conforme projeto',
      'Verificar as emendas de fios nas caixas'
    ] },
    { titulo: 'C. Centro de distribuição (CD)', itens: [
      'Verificar o número de disjuntores conforme projeto',
      'Verificar a ligação dos circuitos conforme projeto'
    ] },
    { titulo: 'D. Aterramento', itens: [
      'Verificar condutor de aterramento conforme projeto',
      'Verificar profundidade e nº de hastes conforme projeto',
      'Verificar disjuntor de proteção'
    ] } ] },
  { codigo: 'FVS.28.1', nome: 'Instalação Hidráulica Enterrada', categoria: 'Infraestrutura', tipo: 'Rede de água', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Condições de início', itens: [
    'Verificar a localização das esperas conforme projeto, tolerância de 1mm',
    'Verificar proteção dos ralos e esperas',
    'Verificar a localização dos ralos / caixa de gordura, conforme projeto, tolerância de 1mm',
    'Verificar o traçado da rede conforme projeto',
    'Verificar a seção nominal do traçado da rede conforme projeto',
    'Verificar as esperas após concretagem do contrapiso',
    'Terminalidade e limpeza'
  ] } ] },
  { codigo: 'FVS.28.2', nome: 'Instalação Hidráulica Distribuição', categoria: 'Infraestrutura', tipo: 'Rede de água', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Condições de início', itens: ['Posicionamento dos furos de passagem sobre a laje e vigas, verificar através de trena metálica, antes da concretagem da laje'] },
    { titulo: 'B. Execução do serviço', itens: [
      'Diâmetro e marcas das tubulações de prumadas',
      'Prumo e posicionamento de prumadas',
      'Desobstrução de boca, verificar se a boca ou junção da tubulação está protegida para evitar entrada de material na tubulação'
    ] } ] },
  { codigo: 'FVS.28.3', nome: 'Instalação Hidráulica Unidades', categoria: 'Infraestrutura', tipo: 'Rede de água', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [ { titulo: 'A. Condições de início', itens: [
    'Posicionamento dos pontos de consumo de água fria, tolerância de ± 10mm',
    'Posicionamento dos pontos de esgoto, tolerância de ± 10mm',
    'Diâmetro e marcas das tubulações de prumadas',
    'Colocação de fitas para suporte das tubulações de esgoto',
    'Desobstrução de boca',
    'Pressurização de tubulações de água fria: pressurizar a tubulação com carga de 1,5 vezes a pressão máxima estática'
  ] } ] },
  { codigo: 'FVS.28.4', nome: 'Execução de Tubulação Enterrada', categoria: 'Infraestrutura', tipo: 'Rede de esgoto', revisao: '00', data_rev: '', revisar: false, nota: '', blocos: [
    { titulo: 'A. Valetas', itens: [
      'Abertura das valetas',
      'Preparação da base com areia',
      'Colocação da tubulação hidráulica',
      'Envelopamento da tubulação com areia. Preencher os últimos 10 cm com terra',
      'Regularizar e compactar',
      'Limpeza e terminalidade'
    ] },
    { titulo: 'B. Fossa', itens: [
      'Preparação da base com uma camada de areia, mínimo de 10mm',
      'Concretagem do fundo da fossa, se aplicável',
      'Execução da tubulação interna e chumbamento junto à caixa',
      'Chumbamento dos anéis e tampas, se aplicável',
      'Reaterro',
      'Regularização e compactação',
      'Limpeza e terminalidade'
    ] },
    { titulo: 'C. Filtro anaeróbio', itens: [
      'Preparação da base com uma camada de areia, mínimo de 10mm',
      'Concretagem do fundo da fossa, se aplicável',
      'Execução da tubulação interna',
      'Colocação de brita sob o fundo falso',
      'Chumbamento dos anéis e tampas, se aplicável',
      'Reaterro',
      'Regularização e compactação',
      'Limpeza e terminalidade'
    ] },
    { titulo: 'D. Demais exemplos de tubulações enterradas', itens: [
      'Verificar a localização das esperas conforme projeto',
      'Verificar proteção dos ralos e esperas',
      'Verificar a localização dos ralos / caixa de gordura, conforme projeto, tolerância de 1mm',
      'Verificar o traçado da rede conforme projeto',
      'Verificar a seção nominal do traçado da rede conforme projeto',
      'Verificar as esperas após concretagem do contrapiso ou laje',
      'Terminalidade e limpeza'
    ] } ] },
  { codigo: 'FVS.30', nome: 'Execução de Assentamento de Paver', categoria: 'Infraestrutura', tipo: 'Pavimentação', revisao: '00', data_rev: '2026-06-05', revisar: false, nota: '', blocos: [ { titulo: '', itens: [
    'Posição geográfica da área condiz com a do projeto apresentado?',
    'Foram usadas marcações topográficas para execução e foram respeitadas as demarcações topográficas? Houve necessidade de alguma alteração? Foram realizadas e autorizadas por quem?',
    'Existem interferências na área não relatadas no projeto que exigiram alterações na execução? Quais foram, quem executou e por quem foram autorizadas? As autorizações de serviço devem estar junto à FVS.',
    'Foram feitas imagens e diário de serviço/obras?',
    'Foi executado o controle tecnológico dos pavers: dimensões, resistência ≥ 35 MPa, absorção ≤ 6%, camada de recobrimento mínima de 4 cm, rejuntamento completo?',
    'Compactação final: foi utilizada placa vibratória (90–120 kg, 70–90 Hz)? Estão bem compactados?',
    'Estão bem alinhados e nivelados os cortes ajustados, seguem a linha marcada existente?',
    'O rejuntamento com areia fina seca foi vibrado e reaplicado até as juntas ficarem totalmente preenchidas?',
    'Limpeza final do pavimento realizada antes da liberação da circulação?',
    'Conferir se o caimento está conforme projeto (evita poças e recalques), fazer teste (água ou bola) para verificar os caimentos da drenagem'
  ] } ] }
];
