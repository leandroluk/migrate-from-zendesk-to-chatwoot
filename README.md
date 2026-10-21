# Migrador de Chamados: Zendesk ➜ Chatwoot (POC)

Ferramenta desenvolvida em **TypeScript** orientada a objetos (POO) para realizar a extração, transformação e carga (ETL) de chamados, comentários, anexos e metadados do **Zendesk** para o **Chatwoot**.

---

## 📚 Documentações Oficiais de Referência

- [Zendesk API v2 Reference](https://developer.zendesk.com/api-reference/)
- [Chatwoot Application APIs Guide](https://developers.chatwoot.com/contributing-guide/chatwoot-apis)
- [Chatwoot API Documentation](https://www.chatwoot.com/developers/api/)

---

## 🔑 Guia: Onde Obter Cada Variável do `.env`

Crie um arquivo `.env` na raiz do projeto (copiando do `.env.example`):

```bash
cp .env.example .env
```

Abaixo está o passo a passo detalhado de onde encontrar cada uma das credenciais em ambas as plataformas.

---

### 1. Variáveis do Zendesk

| Variável            | Exemplo                            | Como Obter no Zendesk                                                                                  |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ZENDESK_BASE_URL`  | `https://minhaempresa.zendesk.com` | A URL completa de acesso ao seu Zendesk (incluindo `https://`).                                        |
| `ZENDESK_EMAIL`     | `admin@empresa.com`                | O endereço de e-mail do usuário com papel de **Administrador** ou **Agente** que gerou o token de API. |
| `ZENDESK_API_TOKEN` | `a1b2c3d4...`                      | Token gerado no Centro de Administração do Zendesk (instruções abaixo).                                |

#### 🛠️ Como Gerar o `ZENDESK_API_TOKEN`:

1. Acesse o Zendesk com um usuário Administrador.
2. No menu superior ou lateral, abra o **Centro de Administração (Admin Center)**.
3. No menu lateral esquerdo, navegue até:
   - **Aplicativos e integrações (Apps and integrations)** ➜ **APIs** ➜ **API do Zendesk (Zendesk API)**.
4. Na aba **Configurações (Settings)**, certifique-se de que a opção **Acesso por token (Token Access)** está **Ativa**.
5. Clique no botão **Adicionar token de API (Add API token)**.
6. Dê uma descrição para o token (ex: `Migracao Chatwoot POC`) e clique em **Copiar**.
   > ⚠️ **Importante**: O Zendesk só exibe o token completo uma única vez no momento da criação. Salve-o imediatamente no `.env`.
7. Clique em **Salvar**.

---

### 2. Variáveis do Chatwoot

| Variável              | Exemplo                    | Como Obter no Chatwoot                                                                                                                                                              |
| --------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHATWOOT_BASE_URL`   | `https://app.chatwoot.com` | Se você usa o Chatwoot Cloud, use `https://app.chatwoot.com`. Se você usa uma instalação própria (self-hosted), use a URL da sua instância (ex: `https://chatwoot.suaempresa.com`). |
| `CHATWOOT_API_TOKEN`  | `qW3eR5tY...`              | O token de acesso pessoal do usuário Administrador da conta (instruções abaixo).                                                                                                    |
| `CHATWOOT_ACCOUNT_ID` | `1`                        | O ID numérico da conta dentro do Chatwoot (instruções abaixo).                                                                                                                      |
| `CHATWOOT_INBOX_ID`   | `1`                        | O ID da caixa de entrada de destino onde as conversas serão criadas (instruções abaixo).                                                                                            |

#### 🛠️ Como Obter o `CHATWOOT_API_TOKEN`:

1. No Chatwoot, clique na foto/nome do seu perfil no **canto inferior esquerdo**.
2. Selecione **Configurações do Perfil (Profile Settings)**.
3. Role a página até a seção final intitulada **Token de Acesso à API (API Access Token)**.
4. Clique no ícone de cópia ao lado do token exibido e cole no `CHATWOOT_API_TOKEN`.
   > ⚠️ **Atenção**: O usuário proprietário desse token precisa ter perfil de **Administrador** na conta do Chatwoot para poder criar contatos, tags, equipes e conversas via API.

#### 🛠️ Como Obter o `CHATWOOT_ACCOUNT_ID`:

1. Olhe para a barra de endereços do seu navegador enquanto estiver navegando no Chatwoot.
2. A URL segue o formato:
   ```
   https://app.chatwoot.com/app/accounts/{ACCOUNT_ID}/dashboard
   ```
3. O número que aparece logo após `/accounts/` é o seu **`CHATWOOT_ACCOUNT_ID`**.

#### 🛠️ Como Obter o `CHATWOOT_INBOX_ID`:

1. No menu lateral do Chatwoot, clique em **Configurações (Settings)** ➜ **Caixas de Entrada (Inboxes)**.
2. Clique na caixa de entrada que você deseja utilizar como destino dos chamados (ex: uma caixa de API, E-mail ou Chat Web).
3. Na barra de endereços do navegador, você verá uma URL como:
   ```
   https://app.chatwoot.com/app/accounts/1/settings/inboxes/{INBOX_ID}
   ```
4. O número no final da URL é o seu **`CHATWOOT_INBOX_ID`**.
   _(Você também pode ver o ID listado na aba "Configurações da Caixa")._

---

### 3. Configurações de Migração

| Variável                   | Opções                        | Descrição                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MIGRATION_TICKET_ID_LIST` | `101`<br>`101,102,103`<br>`*` | • **ID único** (ex: `101`): modo de segurança máxima para testes em produção com apenas 1 chamado.<br>• **Lista delimitada por vírgula** (ex: `101,102,103`): processa apenas a lista específica informada.<br>• **Asterisco `*`**: modo lote contínuo, busca chamados sem a tag `chatwoot` até zerar a fila. |
| `MIGRATION_LOCALE`         | `pt-BR` ou `en-US`            | Dicionário de internacionalização utilizado para formatar notas, datas, papéis de usuários, sumário de anexos e textos de abertura no Chatwoot.                                                                                                                                                               |
| `MIGRATION_DRY_RUN`        | `true` ou `false`             | Se `true`, conecta nas APIs, valida permissões, busca chamados e simula todo o fluxo no terminal com logs **sem criar registros** no Chatwoot e **sem alterar tags** no Zendesk.                                                                                                                              |
| `MIGRATION_BATCH_SIZE`     | `25`                          | Tamanho da página nas consultas do Zendesk (padrão: 25).                                                                                                                                                                                                                                                      |

---

## 🚀 Como Executar o Projeto

Instale as dependências:

```bash
pnpm install
```

### Executar a Migração (desenvolvimento via tsx):

```bash
pnpm run dev
```

### Compilar e checar tipos (TypeScript):

```bash
pnpm run build
```

### Executar Linter (`oxlint`):

```bash
pnpm run lint
```

### Executar Formatação (`oxfmt`):

```bash
pnpm run format
pnpm run format:check
```

---

## 🔄 Fluxo de Execução da Aplicação

1. **Passo 1 (Autenticação & Permissões)**: Conecta no Zendesk (`/users/me.json`) e Chatwoot (`/profile`) e valida papéis de agente/administrador.
2. **Passo 2 (Mensuração e Migração de Arestas)**: Compara tags, grupos e Custom Roles do Zendesk com o Chatwoot. Cria automaticamente as tags (labels) e equipes (teams) faltantes.
3. **Passo 3 (Resolução de Alvo)**:
   - Se houver lista de IDs (`MIGRATION_TICKET_ID_LIST=101,102`), verifica se cada um existe no Zendesk antes de processar.
   - Se for `*`, inicia o loop de busca por chamados sem a tag `chatwoot`.
4. **Passo 4 & 5 (Extração, Anexos e Cadastro)**:
   - Extrai o chamado, comentários e links/metadados de anexos.
   - Sincroniza o contato do solicitante no Chatwoot.
   - Cria a conversa vinculada e insere as mensagens cronológicas (com notas privadas preservadas).
   - Marca o chamado no Zendesk com a tag `chatwoot` para garantir idempotência.
