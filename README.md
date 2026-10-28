# Size Engenharia — sistema de gestão

App único da Size organizado em **módulos** (menu lateral). Hoje: **Compras**. Próximo: **Diário de obra**.

## Módulo Compras

App único (PWA para Android e iPhone) para **pedidos de material, cotação, aprovação, liberação de entrega, recebimento, estoque e financeiro** das obras da Size Engenharia.
Substitui os apps `COMPRAS-SIZE-02` (abertura de pedido) e `COMPRAS-SIZE-03` (gestão de compras).

- **Frontend:** `app/` — HTML/CSS/JS puro, publicado no GitHub Pages.
- **Backend:** `backend/` — Google Apps Script (API) + Google Sheets como banco de dados.

## Como os dados ficam organizados

| Onde | Abas |
|---|---|
| **Planilha central "Size · Cadastros"** | Usuarios, Acessos (usuário × obra × permissões), Obras, Perfis, MateriaisPadrao, Unidades, Config, Log |
| **Uma planilha por obra** (criada pelo app) | Pedidos, Itens, Orcamentos, Fornecedores, Materiais, Frentes, Recebimentos, Estoque, Arquivos |
| **Drive** | `Compras Size/<Obra>/<Nº do pedido>/` com orçamentos, NFs, comprovantes e fotos |

As colunas são lidas pelo **nome do cabeçalho** — dá para reordenar ou acrescentar colunas sem quebrar o sistema.
Ao criar uma obra, ela já nasce com os **materiais padrão** e as **frentes padrão** (Configurações).

## Fluxo do pedido

```
Aberto → Em cotação → Aguardando aprovação → Aprovado ─┬─ Faturamento direto: Financeiro paga → Liberar entrega → Recebimento → Concluído
                                                       └─ Faturado (ex: 30 dias): Liberar entrega → Recebimento → NF → Financeiro paga → Concluído
```

- **Definir compra** exige o mínimo de orçamentos de fornecedores diferentes (`MIN_ORCAMENTOS`, padrão 1; faixas por valor em `REGRAS_ORCAMENTO`, ex. `5000:2; 20000:3`). Abaixo do mínimo, só quem tem permissão de **aprovar** pode seguir, com justificativa registrada.
- **Faturamento direto:** a entrega fica bloqueada até o financeiro registrar o pagamento (com comprovante).
- **Faturado:** a entrega pode ser liberada logo após a aprovação; quando a NF é registrada (no recebimento, manualmente ou por e-mail) o pedido vai para o financeiro com vencimento = emissão + prazo.
- **Recebimento** por item, total ou parcial; cada entrada alimenta o estoque da obra. Dá para encerrar com falta (com motivo).
- Respostas dos fornecedores por e-mail com PDF entram sozinhas: na cotação viram **orçamento**; na liberação/pagamento viram **nota fiscal**.

## Perfis e permissões

Cada usuário recebe, **por obra**, um perfil (Admin, Compras, Estoque, Financeiro, Solicitante) que marca as permissões padrão — e dá para ligar/desligar cada permissão individualmente. Administradores veem todas as obras. O financeiro escolhe/troca a obra no menu e só vê os dados dela.

## Instalação (uma vez)

1. Em [script.google.com](https://script.google.com), crie um **projeto novo** (logado com a conta da empresa) e copie os arquivos de `backend/` (`.gs` e `appsscript.json` — ative "Mostrar appsscript.json" nas configurações do projeto).
2. Rode **`setup()`**. No *Registro de execução* aparecem o link da planilha central e a **senha provisória do usuário `admin`**.
3. Em `Setup.gs`, preencha `ID_PLANILHA_ANTIGA` (o código entre `/d/` e `/edit` na URL da planilha antiga "Pedidos Size") e rode **`migrarPrimeBeach()`** — cria a obra Prime Beach e importa pedidos, fornecedores, materiais e unidades. Pode rodar de novo sem duplicar.
4. Rode **`instalarGatilho()`** (leitura de e-mails a cada 10 min).
5. **Implantar → Nova implantação → App da Web**: executar como *Eu*, acesso *Qualquer pessoa*. Copie a URL `.../exec` para `app/config.js`.
6. Abra o app, entre como `admin`, troque a senha, e cadastre os usuários em **Usuários e acessos**.

Ao alterar o backend: *Implantar → Gerenciar implantações → editar → Nova versão* (a URL continua a mesma).

> Usuários do sistema antigo não são migrados (as senhas eram de outro formato): recrie-os em **Usuários e acessos** com uma senha provisória.

## Desenvolvimento

```bash
npm test          # testes do backend com simulador do Apps Script (test/gas-mock.js)
npm run demo      # app + API simulada com dados de exemplo em http://localhost:5173
```

Logins da demo: `admin`/`Admin#Size26`, `compras`, `estoque`, `fin`, `joao` (senha `Obra#Teste26`).

## Segurança e backup

- **Login:** 5 senhas erradas seguidas bloqueiam o usuário por 15 minutos (o administrador recebe um e-mail de alerta). Senhas **novas** precisam de 10+ caracteres e não podem ser óbvias; quem já tinha senha continua entrando com ela até trocar.
- **Sessão:** 14 dias. Trocar a senha encerra as sessões abertas nos outros aparelhos (a do aparelho atual recebe um token novo).
- **Navegador:** o `index.html` e o `fornecedor.html` trazem uma política de segurança (CSP) que só deixa o app carregar scripts dele e do `cdnjs.cloudflare.com` (usado só para gerar PDF) e só falar com o Apps Script e a Open-Meteo. Por isso não use `onclick="..."` nem `<script>` inline: use `data-acao` (veja `app.js`) ou um arquivo `.js`.
- **Backup:** todo dia às 3h o script copia a planilha central e as das obras para `Compras Size / Backups` no Drive (`AAAA-MM-DD · nome`), guardando `BACKUP_DIAS` dias (padrão 14). O gatilho é criado sozinho quando um administrador abre a administração; Administração → Configurações tem o botão "Fazer backup agora". Fotos e PDFs não são duplicados.

## FVS (ficha de verificação de serviço)

- **Modelos** (Execução → FVS → Modelos de FVS): 45 fichas importadas do Drive da qualidade (`backend/FvsPadrao.gs`), por categoria → tipo. Mudar os itens sobe a revisão; as fichas já emitidas guardam a revisão usada.
- **Abertura:** ao criar uma frente de trabalho (etapa), cada serviço recebe uma FVS (o catálogo sugere o modelo; "Sem FVS" é uma escolha explícita). Dá para abrir depois pela tela da etapa.
- **Ficha:** O / X / ⊗ (reinspeção, até 3 vistorias) / N/A, alteração em relação ao projeto (com quem autorizou), não conformidades, **croqui base** e **croqui de execução** (obrigatórios), outros anexos e os **RDOs vinculados** (vêm dos lançamentos do serviço).
- **Aprovação:** quem tem a permissão `fvs_aprovar` (Engenheiro e Admin) aprova ou devolve. Ao aprovar, a FVS ganha o número em sequência (FVS 001…), é travada com um código de verificação e vai para `Drive → obra → FVS → AAAA-MM → "FVS 001 · …"` com o PDF, os croquis e os anexos.
- Permissões novas: `fvs_ver`, `fvs_preencher`, `fvs_aprovar` (migração automática para Admin/Engenheiro/Encarregado no primeiro acesso).

## Medições de empreiteiros

- **Empreiteiros** = o painel de Equipes (empresa, responsável, telefone, e-mail, CNPJ/CPF, equipe em campo). Cada **frente de trabalho (etapa)** escolhe o empreiteiro e informa se é **com contrato** (número e data) ou **sem contrato**; isso aparece na medição. (O módulo **Contratos** aparece no menu como "em breve".)
- **Medição:** o empreiteiro soma as frentes dele. Só entra serviço **concluído** (executado ≥ previsto) **e com FVS aprovada**, **uma vez só**, inteiro, no período em que foi concluído, pela quantidade **executada**. Serviço já medido que recebe mais lançamento entra como **complemento** na medição seguinte.
- **Fluxo:** rascunho → aguardando aprovação → aprovada (numerada **por empreiteiro**, travada, PDF em `Drive → obra → Medições → empreiteiro → Medição 001 · período`) → paga. Rascunho e devolvida não reservam serviços; enviada, aprovada e paga reservam.
- **Permissões por obra:** `medicao_ver`, `medicao_lancar`, `medicao_aprovar` (administrador tem todas; as demais pessoas são liberadas na tela de acessos). O sino avisa quem aprova quando uma medição é enviada.
- Valores (contrato × pago × saldo por etapa) e descontos ficam para a próxima etapa.

## Avisos com o app fechado (push)
O sino continua igual (app aberto: som, vibração e janelinha). Com os avisos de fundo ativados, o aparelho também recebe o aviso com o app fechado, via Firebase Cloud Messaging.
- **No aparelho:** sino > "Ativar avisos neste aparelho". O app só pede a permissão e registra o aparelho (aba `Aparelhos`); quem mostra o aviso é o `sw.js`. iPhone: só iOS 16.4+ com o app instalado na tela inicial.
- **No servidor:** `pushVarrer()` (gatilho de 5 em 5 min, criado sozinho no primeiro registro) calcula o mesmo que o sino (`notificacoes_`) para cada pessoa com aparelho registrado e envia só o que ainda não foi avisado àquele aparelho. Se o app estiver aberto, ele marca os avisos como vistos e não duplica.
- **Configuração (uma vez):** em `app/config.js` preencher `FIREBASE_CFG` (apiKey, messagingSenderId, appId e a chave pública VAPID; não são segredos) e, no Apps Script, criar a propriedade do script `FCM_SA` com o JSON da conta de serviço do Firebase (segredo: nunca no GitHub). Depois, nova versão da implantação.
- Quem sai do app deixa de receber os avisos dele naquele aparelho.

## Contratos de empreiteiros
Módulo dentro de **Medições → Contratos** (`#/ctr`). O contrato é cadastrado com a planilha de serviços, vinculado a um empreiteiro, e a frente de trabalho nasce ligada a ele.
- **Número do contrato:** automático por obra (01, 02, 03…), dado ao salvar o rascunho; nunca repete nem é reaproveitado (nem de contrato cancelado) e cada obra começa do 01.
- **Cadastro** (permissão `contrato_gerir`): partes (contratante, administradora, empreiteiro com CNPJ e endereço do cadastro dele), objeto, vigência, **planilha** (etapa/grupo, item, serviço, unidade, quantidade e preço unitário; dá para **colar do Excel/Word**), preço global (vale o do contrato; a soma da planilha aparece ao lado para conferir), pagamento (medição semanal/quinzenal/mensal, permuta, % nota fiscal × recibo), retenções, reajuste, multas, garantia, aviso prévio, foro e cláusulas extras. Os valores iniciais vêm do último contrato da obra.
- **Situação:** rascunho → vigente (ativar) → encerrado ou rescindido (ou cancelado, se ainda era rascunho). Contrato vigente só é alterado com motivo (histórico). Aditivos: tipo, descrição, valor (soma ao contrato) e nova vigência.
- **Frente de trabalho (Execução → etapa):** escolhe o empreiteiro e o contrato vigente dele (ou "Sem contrato"; frentes antigas com número digitado continuam como estavam). Os serviços entram **pela planilha do contrato** (um toque, com a quantidade que falta programar) e ficam ligados ao item. Serviço fora da planilha ainda pode ser incluído (aparece como "sem vínculo" no contrato).
- **Acompanhamento** (permissão `contrato_ver`): contratado × executado (diários) × medido (medições enviadas/aprovadas/pagas) × pago × saldo, em quantidade e em R$, por item e total. Passou do contratado: só avisa, não trava a obra.
- **Responsabilidade técnica (condição para assinatura):** cada contrato tem a lista de ART, RRT, TRT (ou outro documento com responsabilidade técnica) exigidos: tipo, atividade, profissional, registro, número, data e o documento anexado (Drive → Contratos → pasta do contrato → Responsabilidade técnica). Só conta como **emitida** com número + documento. O contrato só é **liberado para assinatura** com a lista cadastrada e **toda** emitida: sem isso a minuta (rascunho) e a ativação ficam bloqueadas, no app e no servidor. As emitidas entram na minuta.
- **Documentos:** minuta do contrato em PDF (texto, cláusulas baseadas nos modelos VN × Prime Beach e Confiança × Verde Mar, mais o Anexo I com a planilha); a minuta baixada (e a da ativação do contrato) é guardada sozinha no Drive em Obra → Contratos → pasta do contrato; o contrato assinado é anexado e arquivado na mesma pasta. **Revise a minuta antes de assinar.**
- Abas novas: `Contratos`, `ContratoItens`, `ContratoAditivos` (por obra); `Etapas.contrato_id`, `EtapaItens.contrato_item`, `Equipes.endereco`. O Admin recebe as permissões sozinho; as demais pessoas são liberadas por obra na tela de acessos.

## Orçamento da obra
Módulo **Orçamento da obra** (`#/obra`). Cada **frente geral** (aba `Frentes`, ex: Rede de Esgoto) tem o que precisa executar no total; as frentes de execução, os contratos e as compras passam a se ligar a esse orçamento.
- **Obra nova:** ao criar, informe as frentes gerais (uma por linha); sem lista, entram as frentes padrão das Configurações. Novas frentes gerais também podem ser criadas no próprio orçamento (trocar o nome atualiza pedidos, estoque e frentes de execução).
- **Orçamento (quantidades):** por frente geral, os serviços (catálogo ou avulso) com a **quantidade total** (ex: 2.500 m de rede). Dá para **colar do Excel** (item · descrição · unidade · quantidade · R$ material · R$ mão de obra). Números no padrão brasileiro: "2.500" = dois mil e quinhentos.
- **Valores (financeiro):** R$ de **material** e de **mão de obra** por unidade do serviço; totais por frente e da obra.
- **Saldo:** a frente de execução escolhe o serviço do orçamento (um toque, já com o que falta distribuir) e a quantidade dela **consome o saldo** (total − programado em frentes). Passar do total **não bloqueia**: grava e vira alerta. Frente aberta pelo item de um contrato ligado ao orçamento herda o vínculo.
- **Contrato do empreiteiro:** "Puxar do orçamento da obra" traz os serviços com a quantidade que falta contratar e o **valor de mão de obra orçado** (pode ser mudado). O contrato mostra orçado × contratado; o orçamento mostra a MO contratada (contratos vigentes, encerrados ou rescindidos).
- **Materiais:** por serviço (composição: quanto gasta por unidade, já com a perda — ex: 1,05 m de tubo por metro de rede) ou direto na frente (quantidade total). Para cada material: **necessário × comprado** (pedidos aprovados da frente) **× em compra × recebido** (o recebimento pode escolher a frente) **× consumido** (teórico = executado × composição; real = saídas do estoque) e **falta comprar**. O vínculo com os pedidos é pelo material do cadastro.
- **Painel da obra:** orçado, executado (ponderado pelo R$; sem valores, média dos serviços), MO contratada, material comprado, materiais a comprar e alertas (falta comprar, consumo acima do recebido, programado/executado/contratado acima do orçado).
- **Relatório da obra** (`#/obra/relatorio`, `RelatorioObra.gs` + `relobra.js`): PDF A4 com logo, em dois modelos. **Andamento** (sem R$, pode ir ao cliente): % executado (ponderado pelo valor de venda, igual ao painel), curva S previsto × realizado × projetado, avanço por frente e serviço, prazos tipo Gantt com **estimativa de atraso** (ritmo dos últimos 7 dias trabalhados aplicado ao saldo, em dias úteis, descontando a média de dias parados por chuva dos últimos 60 dias; em risco = atraso até 10% do prazo), ritmo necessário para cumprir, produção/clima/efetivo por semana, ocorrências e as últimas 6 fotos do período. **Gerencial** (só `orc_gerir`, marcado "uso interno"): + resultado do empreendimento, gasto real × custo orçado no tempo, déficit por frente, materiais a comprar, mão de obra orçado × contratado × medido, medições a pagar e **pontos para a reunião** gerados automaticamente. Baixar, WhatsApp ou e-mail.
- Permissões `orc_ver` (ver, inclusive valores) e `orc_gerir` (cadastrar); o Admin recebe as duas sozinho, o perfil Engenheiro novo já vem com `orc_ver`. Abas novas: `OrcItens`, `OrcMateriais` (por obra); `EtapaItens.orc_item`, `ContratoItens.orc_item`, `Recebimentos.frente`.

## Orçamentos · base de preços
Módulo **Orçamentos** (`#/orc`, `Base.gs` + `base.js`): a base de preços da empresa para orçar novos clientes. Fica na **planilha central** (não depende de obra), então dá para orçar antes de a obra existir.
- **Insumos:** material, mão de obra, equipamento ou serviço de terceiro, com preço, **data-base** (o app marca o preço com mais de 3 e de 6 meses), grupo e fonte. Toda mudança de preço fica no histórico (aba `InsumoPrecos`, com gráfico no cadastro do insumo). **Reajuste em %** sobre a lista filtrada e **colar preços do Excel** (código · preço), por exemplo a resposta de uma cotação.
- **Composições:** serviço formado por insumos e/ou **composições auxiliares** × coeficiente por unidade. O item pode ter **preço próprio** só naquela composição (vazio = preço do cadastro). O custo unitário é calculado na hora e separado em material, mão de obra, equipamento e serviço; composição circular é recusada. Ficha analítica com a estrutura (abre as auxiliares), **curva ABC dos insumos** e **simulação de quantidade** (custo total e quanto comprar de cada insumo). Duplicar, exportar CSV.
- **Importar orçamento:** a planilha exportada (aba *Composições*: Item, Tipo, Código, Descrição, Un, Quant., Custo unit.) é lida no navegador (SheetJS, do cdnjs) e conferida **antes de gravar**: o coeficiente vem da quantidade do item ÷ quantidade do serviço; o mesmo código com itens diferentes vira variante (`10075-2`); serviço repetido entra uma vez; preço de insumo diferente dentro do arquivo vira preço próprio; item sem código ganha `INS-…`; se a aba do orçamento vier junto, a etapa vira o grupo da composição. Importar de novo atualiza, não duplica.
- **Acesso:** em Usuários e acessos → **Orçamentos**: *Ver* ou *Gerir* (o administrador gere). Quem só tem esse acesso entra direto na base de preços.
- Abas novas na planilha central: `Insumos`, `InsumoPrecos`, `Composicoes`, `ComposicaoItens`; coluna `Usuarios.orcamentos`. Códigos com zero à esquerda (`008`) são gravados como texto.
- **Foto do insumo:** no Drive (`Compras Size / Base de preços / Fotos dos insumos`, aberta para quem tem o link), ao lado do cadastro e em miniatura nas listas.
- **Contratos:** o serviço da planilha do contrato é escolhido na base (referência sem material), no catálogo ou digitado como novo; "Puxar da base de preços" traz vários de uma vez (`ContratoItens.comp_cod`).

## Início da empresa e obra aberta
- **Início** (`#/inicio`, `empresa.js`): saudação, ações rápidas (novo orçamento, composição, insumo, importar, nova obra, usuários), **obras** em mapa (Leaflet + OpenStreetMap, pelas coordenadas do cadastro da obra) e cartões com pedidos em andamento/urgentes, frentes, último diário e pendências; **orçamentos de clientes** (em elaboração, aguardando o cliente, aprovados, taxa de aprovação) e a base de preços. Rota `empresa_dados` (resumo de cada obra guardado 3 min).
- **Dois níveis no menu:** sem obra aberta, só Início e **Empresa** (Orçamentos e administração). Ao tocar numa obra, ela fica em destaque no topo do menu (botão **Trocar**) e aparecem só os módulos que dependem da planilha da obra, com o **Painel da obra** (`#/painel`). Tela de obra sem obra aberta volta para o Início.
- O app abre no Início; entra direto na obra quando o link é de uma tela da obra (notificação), está sem sinal (diário offline) ou a pessoa só tem uma obra e nada fora dela.

## Orçamentos de clientes
Módulo **Orçamentos → Orçamentos de clientes** (`#/orc/orcamentos`, `Propostas.gs` + `prop.js`), na planilha central (abas `Propostas`, `PropostaItens`).
- **Planilha:** etapas (1, 2, 3…) e itens (1.1, 1.2…): serviço da base × quantidade (o custo unitário por categoria fica **congelado** no orçamento; "Atualizar preços pela base" puxa de novo) ou **item de preço direto** (material e mão de obra por unidade).
- **BDI e gestão** com % e base configuráveis (mão de obra + equipamento + serviços, ou custo total). Preço de venda do item = custo + BDI + gestão (2 casas por item, como na planilha).
- **Situação:** rascunho → enviado → aprovado | perdido (com motivo) | cancelado; reabrir; **nova revisão** (ORC-0001 rev.1, a anterior fica "Revisado"); copiar como novo; histórico.
- **Proposta para imprimir/PDF:** a do cliente (preço de venda) e a planilha interna (custo, material, MO, BDI, gestão).
- **Gerar obra** (administrador, orçamento aprovado): cria a obra (planilha e pasta no Drive) com uma frente geral por etapa, os serviços com quantidade, material, mão de obra e preço de venda, a receita e o custo de cada frente e os **materiais** de cada serviço (insumos de material das composições, com o coeficiente) — o Orçamento da obra já nasce pronto.

## Cronograma físico-financeiro
`Cronograma.gs` + `crono.js`. O valor de cada etapa é distribuído por igual nos **dias corridos** entre a data de início e a de fim.
- **No orçamento** (`#/orc/orcamento/<id>/cronograma`, campo `Propostas.cronograma_json`): início e fim de cada etapa pelas datas, pela duração em dias ou **arrastando a barra** (as pontas mudam o prazo); "Encadear todas" põe uma etapa depois da outra. Mostra o desembolso por mês e a curva S; sai na proposta (PDF) e numa aba **Cronograma** do Excel. As datas acompanham a etapa pelo nome, mesmo se ela mudar de posição.
- **Gerar obra** leva as datas para as frentes gerais (aba `Frentes`, colunas `inicio` e `fim`).
- **Na obra** (`#/obra/cronograma`, quem vê o orçamento consulta e quem gerencia altera): por frente geral, **previsto** (datas) × **executado** (registros do RDO dos serviços ligados ao orçamento, pelo preço de venda) × **medido** (medições aprovadas ou pagas — só serviço concluído e com FVS aprovada). A diferença executado − medido é o que já foi feito e espera FVS / medição. Frente sem datas sugere o período das frentes de execução.
## SINAPI (Caixa)
`Sinapi.gs` + `sinapi.js`, tela **Orçamentos → SINAPI (Caixa)** (`#/orc/sinapi`).
- Referência oficial ao lado da base da Size, numa planilha separada no Drive (**Size · SINAPI**, id em `SINAPI_ID`): só o **RS** e o **mês atual** — insumos (preço sem e com desoneração), composições (custo sem e com desoneração, já dividido em material / mão de obra / equipamento / serviço pelo analítico) e os itens de cada composição. Insumos que mudaram de preço ficam em `SinapiHist`.
- A Caixa publica um arquivo por mês com todas as UFs (`SINAPI-aaaa-mm-formato-xlsx.zip`, ~15 MB; ~110 MB aberto). Ler isso no Apps Script estoura a memória, então **quem lê é o app** (de preferência no computador): o servidor baixa o zip da Caixa e entrega em partes (`sinapi_baixar`), o app separa o RS e manda em lotes (`sinapi_importar`: inicio → lote → fim; as abas novas só passam a valer no fim). Também aceita o arquivo escolhido à mão.
- **Conferência diária** (gatilho `sinapiVerificar`, 7h): se a Caixa já publicou o mês seguinte (inclusive retificações), aparece no sino de quem gerencia a base e na tela do SINAPI um **"Atualizar agora"**.
- **No orçamento:** a busca "Incluir serviço" mostra também composições e insumos do SINAPI (etiqueta SINAPI). O regime (**não desonerado / desonerado**) é escolhido em cada orçamento (BDI e gestão); o custo fica congelado no item. "Atualizar preços pela base" puxa o mês importado no regime do orçamento. "Ver insumos" abre a composição do SINAPI.
- **Copiar para a base da Size:** a composição vira `SINAPI-<código>` (insumos `SINAPI-<código>` com os coeficientes abertos até os insumos), com a origem anotada, para ajustar.
- O índice da busca (~3 MB) fica guardado no aparelho (IndexedDB) até mudar o mês.