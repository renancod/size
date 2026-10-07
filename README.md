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

Logins da demo: `admin`/`admin123`, `compras`, `estoque`, `fin`, `joao` (senha `senha123`).
