# Size Engenharia — sistema de gestão

App único da Size Engenharia (PWA para Android, iPhone e computador), organizado em **módulos** no menu lateral:

| Módulo | O que faz |
|---|---|
| **Compras** | pedidos de material, cotação, aprovação, liberação de entrega, recebimento, estoque e financeiro |
| **Execução** | frentes de trabalho, diário de obra (RDO), equipes, clima, fotos, produção, avisos e **FVS** |
| **Medições** | medições de empreiteiros e **contratos de empreiteiros** |
| **Orçamento da obra** | o que cada frente geral precisa executar, valores, materiais, cronograma, contratos e documentos com o cliente, relatório da obra |
| **Orçamentos** | base de preços (insumos e composições), orçamentos de clientes e SINAPI (Caixa) |
| **Portal do cliente** | o cliente acompanha as obras e negocia os orçamentos, com a logo dele |
| **Administração** | usuários e acessos, obras, portal do cliente e configurações |

- **Frontend:** `app/` — HTML/CSS/JS puro, publicado no GitHub Pages (`.github/workflows/pages.yml`, roda os testes antes).
- **Backend:** `backend/` — Google Apps Script (API) + Google Sheets como banco de dados, publicado com `clasp`.
- Substituiu os apps `COMPRAS-SIZE-02` (abertura de pedido) e `COMPRAS-SIZE-03` (gestão de compras).

## Como os dados ficam organizados

As colunas são lidas pelo **nome do cabeçalho** (`backend/Db.gs`): dá para reordenar ou acrescentar colunas, e as que faltarem são criadas sozinhas no fim da aba.

| Onde | Abas |
|---|---|
| **Planilha central "Size · Cadastros (Compras)"** | Pessoas e acesso: `Usuarios`, `Acessos` (usuário × obra × permissões), `Perfis`, `Obras`, `Config`, `Log`, `Aparelhos` (push) · Cadastros padrão: `MateriaisPadrao`, `ServicosPadrao`, `FvsModelos`, `Unidades` · Base de preços: `Insumos`, `InsumoPrecos`, `Composicoes`, `ComposicaoItens` · Orçamentos de clientes: `Propostas`, `PropostaItens`, `PropostaComentarios` · Portal: `Clientes` |
| **Uma planilha por obra** (criada pelo app) | Compras: `Pedidos`, `Itens`, `Orcamentos`, `Fornecedores`, `Materiais`, `Recebimentos`, `Estoque`, `Arquivos` · Execução: `Etapas`, `EtapaItens`, `Equipes`, `Diarios`, `Producao`, `EquipesDia`, `FotosExec`, `AlteracoesExec`, `AvisosExec`, `Fvs` · Medições e contratos: `Medicoes`, `MedicaoItens`, `Contratos`, `ContratoItens`, `ContratoRT`, `ContratoAditivos` · Orçamento da obra: `Frentes`, `OrcItens`, `OrcMateriais`, `ContratosCliente` |
| **Planilha "Size · SINAPI"** | referência da Caixa (RS, mês atual), separada para não pesar a central |
| **Drive** | `Compras Size/<Obra>/…`: pedidos (orçamentos, NFs, comprovantes, fotos), FVS, medições, contratos, contratos do cliente, fotos do diário · `Base de preços/Fotos dos insumos` · `Backups` |

Ao criar uma obra, ela já nasce com os **materiais padrão** e as **frentes padrão** (Configurações).

## Perfis e permissões

Cada usuário recebe, **por obra**, um perfil (**Admin, Compras, Estoque, Financeiro, Solicitante, Encarregado, Engenheiro**) que marca as permissões padrão, e dá para ligar/desligar cada permissão individualmente. Administradores veem todas as obras. O módulo **Orçamentos** tem acesso próprio, que não depende de obra (*Ver* ou *Gerir*, em Usuários e acessos). Usuário de cliente (`Usuarios.cliente_id`) só entra no portal do cliente.

## Início da empresa e obra aberta
- **Início** (`#/inicio`, `empresa.js`): saudação, ações rápidas (novo orçamento, composição, insumo, importar orçamento, nova obra, usuários), **obras** em mapa (Leaflet + OpenStreetMap, pelas coordenadas do cadastro) e cartões com pedidos, frentes, último diário, pendências e **prazo em dias úteis**; **orçamentos de clientes** (em elaboração, aguardando o cliente, aprovados, taxa de aprovação) e a base de preços.
- **Dois níveis no menu:** sem obra aberta, só Início e **Empresa** (Orçamentos e administração). Ao tocar numa obra, ela fica em destaque no topo do menu (botão **Trocar**) e aparecem os módulos que dependem da planilha da obra, com o **Painel da obra** (`#/painel`).
- O app abre no Início; entra direto na obra quando o link é de uma tela da obra (notificação), está sem sinal (diário offline) ou a pessoa só tem uma obra e nada fora dela.

## Compras

### Fluxo do pedido

```
Aberto → Em cotação → Aguardando aprovação → Aprovado ─┬─ Faturamento direto: Financeiro paga → Liberar entrega → Recebimento → Concluído
                                                       └─ Faturado (ex: 30 dias): Liberar entrega → Recebimento → NF → Financeiro paga → Concluído
```

- **Definir compra** exige o mínimo de orçamentos de fornecedores diferentes (`MIN_ORCAMENTOS`, padrão 1; faixas por valor em `REGRAS_ORCAMENTO`, ex. `5000:2; 20000:3`). Abaixo do mínimo, só quem tem permissão de **aprovar** pode seguir, com justificativa registrada.
- **Faturamento direto:** a entrega fica bloqueada até o financeiro registrar o pagamento (com comprovante).
- **Faturado:** a entrega pode ser liberada logo após a aprovação; quando a NF é registrada (no recebimento, manualmente ou por e-mail) o pedido vai para o financeiro com vencimento = emissão + prazo.
- **Recebimento** por item, total ou parcial; cada entrada alimenta o estoque da obra. Dá para encerrar com falta (com motivo).
- **Fornecedor:** pedido de cotação por e-mail com o link do **portal do fornecedor** (`fornecedor.html`: envia o orçamento, informa a entrega e manda a NF); ao aprovar, o fornecedor recebe a **ordem de compra** em PDF; cancelamento também é avisado. Respostas por e-mail com PDF entram sozinhas: na cotação viram **orçamento**; na liberação/pagamento viram **nota fiscal**.
- **Financeiro:** recebe a NF e o **boleto** anexados ao aviso, lembrete diário (8h) dos vencimentos próximos e dos faturamentos diretos esperando pagamento; pagamento de faturado manda o comprovante ao fornecedor.

## Execução · diário de obra (RDO)
`Execucao.gs` + `exec.js` (`#/exec`, `#/diario`).
- **Frentes de trabalho (etapas):** nome, local, frente geral, responsável e empreiteiro (com ou sem contrato). Cada serviço tem unidade, **quantidade prevista** e início/término. O serviço vem do **orçamento da obra** (um toque, com o que falta distribuir), da **planilha do contrato** do empreiteiro ou do catálogo; serviço digitado à mão não dá baixa no orçamento da obra (aviso na etapa).
- **Diário:** um por dia da obra (RDO 001, 002…), com várias etapas dentro: equipes e pessoas, quantidade executada por serviço (o saldo desconta sozinho), fotos com legenda, ocorrências e observações. **Clima** pela Open-Meteo (manhã e tarde, mm de chuva); chuva ≥ `CHUVA_LIMITE_MM` (padrão 5 mm) entre 7h e 17h sugere "Parado por chuva", e dia parado sai da média.
- **Regras:** dias úteis = seg a sex sem feriado nacional (e municipal da obra); sábado, domingo ou feriado é livre e marca "aditivo especial". Executado acima do previsto **não bloqueia**: vira alerta. O encarregado lança hoje e ontem; dias anteriores e mudanças de quantidade ou datas só o engenheiro, com motivo (tudo fica em `AlteracoesExec`, com o previsto original guardado).
- **Sem sinal:** o diário fica no aparelho e sobe sozinho quando o sinal volta (no iPhone, ao reabrir o app).
- **Painel e cálculos:** % de cada etapa, média por dia, ritmo necessário, término projetado e produtividade (por homem-dia e equipe-dia); **avisos do engenheiro** para a equipe; diário para revisar.
- **RDO em PDF** (cabeçalho, rodapé e marca d'água), **relatório do período** com projeção, e o botão **Mostrar ao cliente** (o dia aparece no portal).
- **Verba (VB):** serviço sem medida (acompanhamento, administração) com unidade VB, verba ou % é lançado e mostrado **em %** do previsto (app `ehVerba`/`qun`, backend `ehVerba_`/`qun_`). Cada lançamento é o que andou no dia (10% + 20% = 30%); o gravado continua a fração (25% de 1 VB = 0,25). Passar de 100% gera aviso, sem travar.

### FVS (ficha de verificação de serviço)
- **Modelos** (Execução → FVS → Modelos de FVS): 45 fichas importadas do Drive da qualidade (`backend/FvsPadrao.gs`), por categoria → tipo. Mudar os itens sobe a revisão; as fichas já emitidas guardam a revisão usada.
- **Abertura:** ao criar uma frente de trabalho, cada serviço recebe uma FVS (o catálogo sugere o modelo; "Sem FVS" é uma escolha explícita). Dá para abrir depois pela tela da etapa.
- **Ficha:** O / X / ⊗ (reinspeção, até 3 vistorias) / N/A, alteração em relação ao projeto (com quem autorizou), não conformidades, **croqui base** e **croqui de execução** (obrigatórios), outros anexos e os **RDOs vinculados**.
- **Aprovação:** quem tem `fvs_aprovar` (Engenheiro e Admin) aprova ou devolve. Ao aprovar, a FVS ganha o número em sequência (FVS 001…), é travada com um código de verificação e vai para `Drive → obra → FVS → AAAA-MM → "FVS 001 · …"` com o PDF, os croquis e os anexos.
- Permissões: `fvs_ver`, `fvs_preencher`, `fvs_aprovar`.

## Medições de empreiteiros
- **Empreiteiros** = o painel de Equipes (empresa, responsável, telefone, e-mail, CNPJ/CPF, endereço, equipe em campo). Cada frente de trabalho escolhe o empreiteiro e o contrato dele (ou "Sem contrato"); isso aparece na medição.
- **Medição:** o empreiteiro soma as frentes dele. Só entra serviço **concluído** (executado ≥ previsto) **e com FVS aprovada**, **uma vez só**, inteiro, no período em que foi concluído, pela quantidade **executada**. Serviço já medido que recebe mais lançamento entra como **complemento** na medição seguinte. **Verba** é medida **em parcelas** (o lançado até o fim do período que ainda não foi medido), sem exigir FVS.
- **Fluxo:** rascunho → aguardando aprovação → aprovada (numerada **por empreiteiro**, travada, PDF em `Drive → obra → Medições → empreiteiro → Medição 001 · período`) → paga. Rascunho e devolvida não reservam serviços; enviada, aprovada e paga reservam.
- **Permissões por obra:** `medicao_ver`, `medicao_lancar`, `medicao_aprovar`. O sino avisa quem aprova quando uma medição é enviada.

### Contratos de empreiteiros
Dentro de **Medições → Contratos** (`#/ctr`, `Contratos.gs` + `ctr.js` + `ctr-doc.js`). O contrato é cadastrado com a planilha de serviços, vinculado a um empreiteiro, e a frente de trabalho nasce ligada a ele.
- **Número:** automático por obra (01, 02, 03…), dado ao salvar o rascunho; nunca repete nem é reaproveitado.
- **Cadastro** (`contrato_gerir`): partes, objeto, vigência, **planilha** (grupo, item, serviço, unidade, quantidade e preço unitário; dá para **colar do Excel/Word**, puxar do **orçamento da obra** ou da **base de preços**), preço global, pagamento (medição semanal/quinzenal/mensal, permuta, % nota × recibo), retenções, reajuste, multas, garantia, aviso prévio, foro e cláusulas extras. Os valores iniciais vêm do último contrato da obra.
- **Situação:** rascunho → vigente → encerrado ou rescindido (ou cancelado, se ainda era rascunho). Contrato vigente só muda com motivo (histórico). **Aditivos:** tipo, descrição, valor (soma ao contrato) e nova vigência.
- **Acompanhamento** (`contrato_ver`): contratado × executado (diários) × medido × pago × saldo, em quantidade e em R$, por item e total. Passou do contratado: só avisa.
- **Responsabilidade técnica:** lista de ART, RRT, TRT… exigidos, cada um com número e documento anexado. O contrato só é **liberado para assinatura** (minuta e ativação) com a lista cadastrada e **toda** emitida, no app e no servidor.
- **Documentos:** minuta em PDF (cláusulas baseadas nos modelos VN × Prime Beach e Confiança × Verde Mar, mais o Anexo I com a planilha), guardada sozinha em Obra → Contratos → pasta do contrato, junto do contrato assinado. **Revise a minuta antes de assinar.**

## Orçamento da obra
Módulo **Orçamento da obra** (`#/obra`, `Orcamento.gs` + `orc.js`). Cada **frente geral** (aba `Frentes`, ex: Rede de Esgoto) tem o que precisa executar no total; as frentes de execução, os contratos e as compras se ligam a esse orçamento.
- **Obra nova:** ao criar, informe as frentes gerais (uma por linha); sem lista, entram as frentes padrão. Novas frentes gerais também podem ser criadas aqui (trocar o nome atualiza pedidos, estoque e frentes de execução).
- **Orçamento (quantidades):** por frente geral, os serviços com a **quantidade total**. Dá para **colar do Excel** (item · descrição · unidade · quantidade · R$ material · R$ mão de obra). A frente geral mostra executado × total e o que **falta**.
- **Valores (financeiro):** R$ de material e de mão de obra por unidade do serviço; totais por frente e da obra.
- **Saldo:** a frente de execução escolhe o serviço do orçamento e consome o saldo (total − programado). Passar do total **não bloqueia**: grava e vira alerta.
- **Materiais:** por serviço (composição com a perda) ou direto na frente. Para cada material: **necessário × comprado × em compra × recebido × consumido** e **falta comprar** (só quantidade; o gasto em R$ vem dos pedidos).
- **Painel da obra:** orçado, executado (ponderado pelo R$), MO contratada, material comprado, materiais a comprar e alertas.
- **Cronograma físico-financeiro** (`#/obra/cronograma`, `Cronograma.gs` + `crono.js`): por frente geral, previsto (datas) × executado (RDO) × medido. A diferença executado − medido é o que já foi feito e espera FVS / medição.
- **Prazo em dias úteis** (`prazoObra_`, seg a sex sem feriados nacionais e municipais da obra): do início ao fim das frentes gerais + os dias úteis dos aditivos. O cartão da obra (Início e portal do cliente) mostra "Dia X de N dias úteis · faltam", o término e a projeção pelo ritmo.
- **Contratos e documentos** (`ContratosCliente.gs`, aba `ContratosCliente`, `#/obra/contratos`): o contrato principal nasce no Gerar obra; aditivo ou novo contrato pelo orçamento aprovado (**Incluir em obra existente**: as etapas viram frentes gerais novas, "Pavimentação · Aditivo 1") ou à mão, com valor, dias úteis a mais, documento e frentes gerais ligadas (`Frentes.contrato`). **Outros documentos:** ART, Licença, Projeto, Alvará, Outro (só arquivo, sem valor nem prazo). Cada um tem **"o cliente vê"** (contrato/aditivo marcados por padrão, documentos não), que aparece no portal na área **Documentos**.
- **Relatório da obra** (`#/obra/relatorio`, `RelatorioObra.gs` + `relobra.js`): PDF A4 com logo, em dois modelos. **Andamento** (sem R$, pode ir ao cliente): % executado, curva S previsto × realizado × projetado, avanço por frente e serviço, prazos tipo Gantt com **estimativa de atraso** (ritmo dos últimos 7 dias trabalhados, em dias úteis, descontando a chuva média dos últimos 60 dias), produção, clima, efetivo, ocorrências e as últimas fotos. **Gerencial** (só `orc_gerir`, "uso interno"): + resultado do empreendimento, gasto real × custo orçado, déficit por frente, materiais a comprar, mão de obra orçado × contratado × medido, medições a pagar e **pontos para a reunião**.
- Permissões `orc_ver` e `orc_gerir`.

## Orçamentos

### Base de preços
`#/orc`, `Base.gs` + `base.js`. Fica na **planilha central** (não depende de obra).
- **Insumos:** material, mão de obra, equipamento ou serviço de terceiro, com preço, **data-base** (marca o preço com mais de 3 e de 6 meses), grupo, fonte e **foto** (Drive, `Base de preços / Fotos dos insumos`). Toda mudança de preço fica no histórico (`InsumoPrecos`, com gráfico). **Reajuste em %** sobre a lista filtrada e **colar preços do Excel** (código · preço).
- **Composições:** serviço formado por insumos e/ou **composições auxiliares** × coeficiente por unidade; o item pode ter **preço próprio** só naquela composição. Custo unitário separado em material, mão de obra, equipamento e serviço; composição circular é recusada. Ficha analítica, **curva ABC**, **simulação de quantidade**, duplicar, exportar CSV.
- **Importar composições** (`#/orc/importar`): a planilha (aba *Composições*: Item, Tipo, Código, Descrição, Un, Quant., Custo unit.) é lida no navegador (SheetJS) e conferida **antes de gravar**: coeficiente = quantidade do insumo ÷ quantidade do serviço; o mesmo código com itens diferentes no arquivo vira variante (`10075-2`); serviço repetido entra uma vez; preço de insumo diferente dentro do arquivo vira preço próprio; item sem código ganha `INS-…`. Importar de novo atualiza, não duplica. **Código que já está na base com composição de outra planilha** não é sobrescrito: entra como variante, a não ser que se marque **"substituir"** na conferência. Aqui **não cria orçamento**.

### Orçamentos de clientes
`#/orc/orcamentos`, `Propostas.gs` + `prop.js`, na planilha central.
- **Planilha:** etapas (1, 2, 3…) e itens (1.1, 1.2…): serviço da base × quantidade (custo **congelado** no orçamento; "Atualizar preços pela base" puxa de novo) ou **item de preço direto**.
- **Importar orçamento** (`#/orc/orcamento/importar`): a planilha do orçamento (ex. a do RDObras) cria o orçamento **em rascunho**, com as etapas, as quantidades, o BDI, a gestão e os itens sem BDI, e leva as composições para a base (mesma conferência da importação de composições).
- **BDI e gestão** com % e base configuráveis (mão de obra + equipamento + serviços, ou custo total). Preço de venda do item = custo + BDI + gestão.
- **Situação:** rascunho → enviado → aprovado | perdido (com motivo) | cancelado; reabrir; **nova revisão** (ORC-0001 rev.1, a anterior fica "Revisado"); copiar como novo; histórico. Só o rascunho é editado.
- **Proposta para imprimir/PDF** (a do cliente e a planilha interna) e exportação para Excel.
- **Cronograma** (`#/orc/orcamento/<id>/cronograma`): início e fim de cada etapa pelas datas, pela duração ou **arrastando a barra**; desembolso por mês e curva S; sai na proposta e no Excel.
- **Gerar obra** (administrador, orçamento aprovado): cria a obra (planilha e pasta no Drive) com uma frente geral por etapa, os serviços, a receita e o custo de cada frente, os **materiais** das composições, as datas do cronograma e o **contrato principal**. **Incluir em obra existente:** o orçamento aprovado entra como **aditivo** ou **novo contrato** numa obra que já existe.
- **Portal do cliente** (quadro no orçamento): o cliente que vê, o modo (aberto ou fechado), o contrato anexado, o tipo que a Size fará quando virar obra e a foto do empreendimento. Ao ligar o cliente, os campos vazios (CNPJ, contato, telefone, e-mail, cidade) vêm do cadastro dele.

### SINAPI (Caixa)
`Sinapi.gs` + `sinapi.js`, tela **Orçamentos → SINAPI (Caixa)** (`#/orc/sinapi`).
- Referência oficial ao lado da base da Size, na planilha **Size · SINAPI** (id em `SINAPI_ID`): só o **RS** e o **mês atual** — insumos (sem e com desoneração), composições (já divididas em material / mão de obra / equipamento / serviço) e os itens de cada composição. Insumos que mudaram de preço ficam em `SinapiHist`.
- A Caixa publica um arquivo por mês com todas as UFs (~15 MB; ~110 MB aberto). Ler isso no Apps Script estoura a memória, então **quem lê é o app** (de preferência no computador): o servidor baixa o zip e entrega em partes (`sinapi_baixar`), o app separa o RS e manda em lotes (`sinapi_importar`: inicio → lote → fim). Também aceita o arquivo escolhido à mão.
- **Conferência diária** (gatilho `sinapiVerificar`, 7h): mês novo publicado aparece no sino de quem gerencia a base e na tela do SINAPI ("Atualizar agora").
- **No orçamento:** a busca "Incluir serviço" mostra também o SINAPI; o regime (**não desonerado / desonerado**) é escolhido em cada orçamento. **Copiar para a base da Size:** a composição vira `SINAPI-<código>` para ajustar.
- O índice da busca (~3 MB) fica guardado no aparelho (IndexedDB) até mudar o mês.

## Portal do cliente
`Clientes.gs` + `portal.js` (o que o cliente vê) + `clientes.js` (cadastro, **Administração → Portal do cliente**, `#/admin/clientes`).
- **Cadastro do cliente** (aba central `Clientes`): nome do app, empresa, **razão social, CNPJ/CPF** (conferido), contato, cargo, e-mail, telefone, cidade, observações internas, cor, logo e fundo do login. A lista mostra a **logo publicada** (o quadrado pega a cor do fundo dela) e todos os orçamentos ligados, inclusive rascunho.
- **Empreendimentos** (`Clientes.emps_json` = obra, tipo e foto): andamento sempre, mais **Gerenciamento** (cronograma, diário, FVS, financeiro e documentos), **Execução** (sem financeiro) ou áreas marcadas uma a uma. Com mais de um, o Início mostra um cartão por empreendimento e as telas da obra têm o seletor; as rotas `cli_*` recebem `obra`.
- **Áreas:** **Diário** (só os dias que o engenheiro liberar: serviços, clima, pessoas e fotos), **Qualidade** (FVS aprovadas), **Financeiro** (contratos das empreiteiras e medições aprovadas/pagas, com o PDF), **Documentos** (contratos, aditivos e documentos marcados "o cliente vê") e **Relatórios**.
- **Segurança no servidor:** usuário de cliente só chama as rotas `cli_*` e as da própria conta (`CLI_GERAIS_`); as rotas `cli_*` nunca devolvem custo, BDI, compras, fornecedores, estoque, ocorrências ou observações.
- **Acessos do cliente:** um login por pessoa, cada um com o que vê (`Usuarios.portal_json`): obras (todas, inclusive as próximas, ou só algumas), orçamentos sim/não e áreas. Perfis prontos: **Dono/diretoria** (tudo), **Engenheiro/fiscal** (sem orçamentos, financeiro e documentos; é o padrão do acesso novo) e **Financeiro**. **Compartilhar:** envia o acesso **por e-mail pelo sistema** (logo e cor do cliente, botão do portal; avisa quando o acesso não tem e-mail e guarda o que for digitado), pelo WhatsApp ou copiando a mensagem. A senha provisória só vai quando acabou de ser criada. **Excluir este acesso** apaga o login.
- **Negociação (antes do contrato):** cliente sem obra só vê **Orçamentos**. Ele vê só revisões **enviadas** (o orçamento some quando a revisão mais nova volta para a Size), com o que mudou desde a anterior; deixa **considerações** por item ou gerais (`PropostaComentarios`), que a Size responde (aviso no sino); e pode **aceitar pelo app** (nome, CPF/CNPJ, contrato assinado opcional; o orçamento vira Aprovado). **Gerar obra** com "Liberar o acompanhamento" marcado já põe a obra nos empreendimentos do cliente e avisa "Sua obra começou".
- **Endereço próprio** `c/<slug>/` (ícone, nome, cor e fundo do login): o cadastro recorta a imagem no navegador e o servidor publica em `app/c/<slug>/` direto no GitHub (chave em `GITHUB_TOKEN`, só no servidor); o Pages põe no ar em 1–2 min. **Atenção:** depois de publicar um cliente, o GitHub tem commits que não estão nesta pasta — rodar `git pull` antes do próximo `git push`. **Nunca apagar `app/c/`** (são os portais reais).
- **Avisos** (sino e push): diário liberado, medição aprovada/paga, FVS aprovada, documento novo, orçamento enviado, resposta da Size e obra iniciada.
- O app do cliente leva a assinatura **Plataforma Size Engenharia**.

## Avisos com o app fechado (push)
O sino (app aberto: som, vibração e janelinha) consulta o servidor a cada minuto. Com os avisos de fundo ativados, o aparelho também recebe o aviso com o app fechado, via Firebase Cloud Messaging.
- **No aparelho:** sino > "Ativar avisos neste aparelho" (aba `Aparelhos`); quem mostra o aviso é o `sw.js`. iPhone: só iOS 16.4+ com o app instalado na tela inicial.
- **No servidor:** `pushVarrer` (gatilho de 5 em 5 min) calcula o mesmo que o sino (`notificacoes_`) para cada pessoa com aparelho registrado e envia só o que ainda não foi avisado. Pelo gatilho, roda das 6h às 20h e só quando algo foi gravado desde a última varredura (no máximo 1 h sem varrer).
- **Configuração (uma vez):** em `app/config.js` preencher `FIREBASE_CFG` (não são segredos) e, no Apps Script, criar a propriedade `FCM_SA` com o JSON da conta de serviço do Firebase (segredo: nunca no GitHub).

## Velocidade, cotas do Google e uso do servidor
- **Telas guardadas no aparelho** (`apiAgora` no `app.js`): Início, Clientes e Orçamentos de clientes abrem na hora com o que já está no aparelho e conferem com o servidor por trás (desenham de novo só se mudou). Toda resposta que gravou algo vem com `w` e o app descarta o guardado. A **base de preços** fica no aparelho e só é baixada de novo quando a versão muda (`ger` em `base_dados`, `ger_base` no sino); foto de insumo atualiza só aquele insumo.
- **No servidor:** memória do Google (`memoria_` no `Db.gs`, CacheService) para login, base, orçamentos, pedidos e sino, renovada a cada gravação.
- **Cotas do Google** (`Uso.gs`; conta comum: tarefas automáticas 90 min/dia, 100 destinatários de e-mail/dia; os acessos ao app não têm limite diário, só 30 ao mesmo tempo): `pushVarrer` e `capturarEmails` pelo gatilho só rodam das 6h às 20h. Cada rodada e cada e-mail enviado são somados por dia (propriedade `USO_aaaa-mm-dd`). **Configurações → Uso do servidor** mostra o dia e os últimos 7; o sino avisa o administrador com 15 e-mails ou menos no dia ou tarefas em 80% do tempo.
- **Minha conta → Velocidade do app:** tempo de cada tela e de cada chamada (rede + Google + servidor), guardado só no aparelho, para mandar quando algo parecer lento. Para o administrador, a mesma tela mostra o **uso do servidor de todas as pessoas** (chamadas do dia por ação, tarefas e e-mails), que também vai no "Copiar relatório". As chamadas são contadas na memória do Google (`usoReq_`) e somadas ao total do dia pelas tarefas automáticas.

## Segurança e backup
- **Login:** 5 senhas erradas seguidas bloqueiam o usuário por 15 minutos (o administrador recebe um e-mail de alerta). Senhas **novas** precisam de 10+ caracteres e não podem ser óbvias.
- **Sessão:** 14 dias. Trocar a senha encerra as sessões abertas nos outros aparelhos.
- **Navegador:** o `index.html`, o `fornecedor.html` e o endereço de cada cliente trazem uma política de segurança (CSP): scripts só do próprio app, do `cdnjs.cloudflare.com` (PDF, planilhas, mapa) e do `www.gstatic.com` (Firebase); conexões só com o Apps Script, a Open-Meteo, o OpenStreetMap e o Firebase. Por isso não use `onclick="..."` nem `<script>` inline: use `data-acao` (veja `app.js`) ou um arquivo `.js`.
- **Backup:** todo dia às 3h o script copia a planilha central e as das obras para `Compras Size / Backups` no Drive (`AAAA-MM-DD · nome`), guardando `BACKUP_DIAS` dias (padrão 14). Configurações tem o botão "Fazer backup agora". Fotos e PDFs não são duplicados (ficam protegidos pelo histórico do Drive).

## Instalação (uma vez)

1. Em [script.google.com](https://script.google.com), crie um **projeto novo** (logado com a conta da empresa) e envie os arquivos de `backend/` (`clasp push` ou copiando os `.gs` e o `appsscript.json`).
2. Rode **`setup()`**. No *Registro de execução* aparecem o link da planilha central e a **senha provisória do usuário `admin`**.
3. Rode **`instalarGatilho()`** (leitura de e-mails a cada 10 min e lembretes das 8h). Os outros gatilhos (backup 3h, push 5 min, SINAPI 7h) são criados sozinhos no primeiro uso.
4. **Implantar → Nova implantação → App da Web**: executar como *Eu*, acesso *Qualquer pessoa*. Copie a URL `.../exec` para `app/config.js`.
5. Propriedades do script (segredos, nunca no GitHub): `FCM_SA` (push), `GITHUB_TOKEN` (endereço do cliente; também dá para colar pela tela do portal do cliente). `SINAPI_ID` é criada pelo próprio app.
6. Abra o app, entre como `admin`, troque a senha e cadastre os usuários em **Usuários e acessos**.

> Histórico: `migrarPrimeBeach()` (`Setup.gs`, com `ID_PLANILHA_ANTIGA`) importou a obra Prime Beach da planilha antiga "Pedidos Size"; os usuários do sistema antigo foram recriados à mão.

## Desenvolvimento e publicação

```bash
npm test          # testes do backend com simulador do Apps Script (test/gas-mock.js)
npm run demo      # app + API simulada com dados de exemplo em http://localhost:5173
```

Logins da demo: `admin`/`Admin#Size26`, `compras`, `estoque`, `fin`, `joao` (senha `Obra#Teste26`). Arquivo `.gs` novo precisa entrar na lista `ordem` do `test/gas-mock.js`; arquivo de teste novo, no `npm test` do `package.json`.

**Publicar:**
1. **App:** a cada mudança em `app/`, subir a versão em `app/sw.js` (`CACHE = 'size-vNN'`) e em `app/index.html` (`style.css?v=NN`), depois `git pull --rebase` e `git push` (o GitHub Pages publica em 1–2 min, depois dos testes).
2. **Servidor:** `cd backend` → `clasp push -f` → `clasp deploy -i <id da implantação> -d "descrição"` (a URL `/exec` continua a mesma).
