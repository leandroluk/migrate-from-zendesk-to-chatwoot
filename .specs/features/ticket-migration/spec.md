# Spec: Zendesk to Chatwoot Ticket Migration Tool

## Summary

Ferramenta em TypeScript orientada a objetos (POO) com JSDocs detalhados em português para migrar chamados do Zendesk para o Chatwoot.
O fluxo valida permissões de acesso em ambas as plataformas, sincroniza "arestas" prévias (tags/rótulos, grupos/equipes e contatos/agentes), oferece modo seguro para validação em produção através de ID único configurado via `.env`, ou executa migração contínua em lote buscando chamados sem a tag `chatwoot` até zerar a fila, com suporte a anexos, marcação de tag no Zendesk e exibição visual de progresso via terminal UI.

## Referências Oficiais de API

- Chatwoot APIs: https://developers.chatwoot.com/contributing-guide/chatwoot-apis
- Zendesk API Reference: https://developer.zendesk.com/api-reference/

## Requirements

- REQ-MIG-001: Configuração de Ambiente (`.env`).
  Validar variáveis de ambiente via Zod (`ZENDESK_SUBDOMAIN`, `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN`, `CHATWOOT_BASE_URL`, `CHATWOOT_API_TOKEN`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_ID`, `MIGRATION_TICKET_ID_LIST`, `MIGRATION_DRY_RUN`). O `MIGRATION_TICKET_ID_LIST` pode ser um ID numérico único, uma lista delimitada por vírgula (ex: `"123,456,789"`), ou `*` (ou omitido) para migração em lote.

- REQ-MIG-002: Verificador de Autenticação e Permissões (Passo 1 do fluxo).
  Autenticar no Zendesk (`GET /api/v2/users/me.json`) e no Chatwoot (`GET /api/v1/profile` ou `/api/v1/accounts/{account_id}`) e verificar ativamente se as credenciais possuem permissões necessárias (Zendesk: permissão de agente/admin para ler tickets, usuários, tags e gravar tags; Chatwoot: permissão de administrador na conta para consultar/criar contatos, conversas, mensagens, tags e equipes).

- REQ-MIG-003: Levantamento e Migração de Arestas Pré-requisito (Passo 2 do fluxo).
  Mensurar e listar dependências do Zendesk antes de criar chamados:
  - Tags do Zendesk (`GET /api/v2/tags.json`) -> Criar Labels equivalentes no Chatwoot (`POST /api/v1/accounts/{id}/labels`).
  - Grupos do Zendesk (`GET /api/v2/groups.json`) -> Criar/Mapear Teams (equipes) no Chatwoot (`POST /api/v1/accounts/{id}/teams`).
  - Requisitantes e Agentes -> Sincronizar perfis de contatos/usuários no Chatwoot.
    Se alguma dessas arestas não existir no Chatwoot, criá-la antes de migrar os tickets.

- REQ-MIG-004: Resolução de Alvo e Lista Delimitada de Chamados (Passo 3 do fluxo).
  Quando a lista de IDs de chamados existir na variável de ambiente (diferente de `*`):
  - Interpretar como lista delimitada por vírgula (ex: `123,456,789`) e iterar sobre cada ID.
  - Para cada ID, consultar o Zendesk (`GET /api/v2/tickets/{id}.json`) para validar a existência exata do chamado.
  - Se algum não existir, registrar erro/alerta sem interromper os demais válidos.
  - Processar somente os chamados solicitados na lista informada.

- REQ-MIG-005: Loop de Busca por Tag de Controle (Passo 4 do fluxo).
  Caso o ID específico não esteja definido (ou seja `*`):
  - Buscar chamados no Zendesk que **não** possuam a tag `chatwoot` (utilizando query de busca `/api/v2/search.json?query=type:ticket -tags:chatwoot`).
  - Iterar paginadamente até que não haja mais chamados pendentes (fila zerada).

- REQ-MIG-006: Extração Completa, Upload de Anexos e Cadastro no Chatwoot (Passo 5 do fluxo).
  Para cada chamado:
  - Extrair o objeto completo do chamado (assunto, descrição, prioridade, status, datas, requisitante).
  - Extrair comentários (`/api/v2/tickets/{id}/comments.json`) e todos os anexos (arquivos, URLs, derivados).
  - Fazer download autenticado dos binários de anexos do Zendesk (lidando com redirecionamentos S3).
  - Criar/localizar o contato do requisitante no Chatwoot (`GET/POST /api/v1/accounts/{id}/contacts`).
  - Criar a conversa no Chatwoot (`POST /api/v1/accounts/{id}/conversations`) com os metadados, links e tags correspondentes.
  - Inserir mensagens históricas (`POST /api/v1/accounts/{id}/conversations/{id}/messages`) respeitando visibilidade pública ou nota interna (`private: true`), metadados originais de autoria e upload de anexos via multipart/form-data (`attachments[]`).

- REQ-MIG-007: Marcação de Tag no Zendesk e Continuidade do Loop (Passo 5 do fluxo).
  Após a criação bem-sucedida da conversa no Chatwoot:
  - Adicionar a tag `chatwoot` no chamado do Zendesk (`PUT /api/v2/tickets/{id}/tags.json` ou update de ticket) para marcar a conclusão da migração e evitar reprocessamento.
  - Retornar ao loop do Passo 4 para processar o próximo chamado.

- REQ-MIG-008: Terminal UI e Feedback Visual de Progresso.
  Utilizar interface visual no terminal:
  - Spinners (`ora`) para etapas de autenticação, verificação de permissões e mensuração de arestas.
  - Barra de progresso (`cli-progress`) com contadores, velocidade, percentual e tempo estimado para o loop de migração.
  - Cores e formatação contextual (`picocolors`).

- REQ-MIG-009: Arquitetura POO e Documentação JSDoc em Português.
  O código deve ser estritamente estruturado em classes orientadas a objetos com separação clara de responsabilidades (clients, services, mappers, UI, validators) e conter JSDocs explicativos em português brasileiro em todas as classes, métodos e interfaces.

- REQ-MIG-010: Logging Persistente Estruturado.
  Gravar todas as mensagens e etapas em `logs/migration.log` (ignorado no git) sem caracteres ANSI de formatação.

- REQ-MIG-011: Registro Persistente de Mapeamento De-Para e Links Cruzados (Zendesk <-> Chatwoot).
  - Manter registro persistente estruturado de cada chamado migrado em `logs/migration-mapping.json` e `logs/migration-mapping.csv` correlacionando IDs, URLs diretas, solicitante e data.
  - Inserir link direto para o chamado no Zendesk na conversa e nos atributos personalizados no Chatwoot (`custom_attributes.zendesk_ticket_url`).

## Affected Components (from graph)

- `src/config/env.ts` — Validação e parsing de variáveis de ambiente [REQ-MIG-001]
- `src/ui/terminal-ui.ts` — Renderizador de interface do terminal (spinners, progress bar, alerts) [REQ-MIG-008, REQ-MIG-010]
- `src/clients/zendesk-client.ts` — Cliente HTTP Zendesk para tickets, comentários, tags, grupos, download de anexos, permissões [REQ-MIG-002, REQ-MIG-003, REQ-MIG-004, REQ-MIG-005, REQ-MIG-006, REQ-MIG-007, REQ-MIG-011]
- `src/clients/chatwoot-client.ts` — Cliente HTTP Chatwoot para contatos, conversas, mensagens multipart, tags, times [REQ-MIG-002, REQ-MIG-003, REQ-MIG-006, REQ-MIG-011]
- `src/mappers/ticket-mapper.ts` — Mapeador de dados, status, comentários e anexos [REQ-MIG-006, REQ-MIG-011]
- `src/services/mapping-service.ts` — Serviço de persistência do de-para entre Zendesk e Chatwoot [REQ-MIG-011]
- `src/services/permission-service.ts` — Validação ativa de permissões em ambas as plataformas [REQ-MIG-002]
- `src/services/edge-migration-service.ts` — Mensuração e migração de tags, grupos e dependências prévias [REQ-MIG-003]
- `src/services/migration-orchestrator.ts` — Orquestrador principal com controle de fluxo seguro e loop [REQ-MIG-004, REQ-MIG-005, REQ-MIG-006, REQ-MIG-007, REQ-MIG-011]
- `src/index.ts` — Ponto de entrada CLI e inicialização dos serviços [REQ-MIG-009]

## Out of Scope

- Sincronização retroativa de alterações feitas no Zendesk pós-migração.
- Migração de base de conhecimento / FAQ do Zendesk Guide.
