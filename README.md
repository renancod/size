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
- **Documentos:** minuta do contrato em PDF (texto, cláusulas baseadas nos modelos VN × Prime Beach e Confiança × Verde Mar, mais o Anexo I com a planilha); a minuta baixada (e a da ativação do contrato) é guardada sozinha no Drive em Obra → Contratos → pasta do contrato; o contrato assinado é anexado e arquivado na mesma pasta. **Revise a minuta antes de assinar.**
- Abas novas: `Contratos`, `ContratoItens`, `ContratoAditivos` (por obra); `Etapas.contrato_id`, `EtapaItens.contrato_item`, `Equipes.endereco`. O Admin recebe as permissões sozinho; as demais pessoas são liberadas por obra na tela de acessos.
