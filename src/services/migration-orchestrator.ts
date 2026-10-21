import {ChatwootClient, ZendeskClient} from '../clients';
import {ConfigService} from '../config';
import {DictionaryService} from '../dictionaries';
import {TicketMapper} from '../mappers';
import type {MessageAttachmentPayload, ZendeskTicket} from '../types';
import {TerminalUI, type MigrationViewStats} from '../ui';
import {EdgeMigrationService} from './edge-migration-service';
import {MappingService} from './mapping-service';
import {PermissionService} from './permission-service';

/**
 * Orquestrador principal da migração de chamados do Zendesk para o Chatwoot.
 * Coordena todos os 5 passos do fluxo:
 * 1. Autenticação e validação de permissões;
 * 2. Mensuração e migração de arestas (tags e grupos);
 * 3. Validação do modo seguro para chamado único por ID em produção;
 * 4. Loop paginado de busca para chamados sem a tag 'chatwoot';
 * 5. Extração completa, criação no Chatwoot, marcação de tag no Zendesk e exibição de progresso.
 *
 * @spec REQ-MIG-004
 * @spec REQ-MIG-005
 * @spec REQ-MIG-006
 * @spec REQ-MIG-007
 * @spec REQ-MIG-008
 * @spec REQ-MIG-011
 */
export class MigrationOrchestrator {
  private readonly configService: ConfigService;
  private readonly zendeskClient: ZendeskClient;
  private readonly chatwootClient: ChatwootClient;
  private readonly permissionService: PermissionService;
  private readonly edgeMigrationService: EdgeMigrationService;
  private readonly mappingService: MappingService;
  private readonly dictionaryService: DictionaryService;
  private readonly ui: TerminalUI;

  /**
   * Construtor que inicializa todos os clientes e serviços dependentes.
   */
  public constructor() {
    this.configService = ConfigService.getInstance();
    const config = this.configService.get();

    this.dictionaryService = DictionaryService.getInstance(config.MIGRATION_LOCALE);
    this.zendeskClient = new ZendeskClient(config);
    this.chatwootClient = new ChatwootClient(config);
    this.permissionService = new PermissionService(this.zendeskClient, this.chatwootClient);
    this.edgeMigrationService = new EdgeMigrationService(this.zendeskClient, this.chatwootClient);
    this.mappingService = new MappingService();
    this.ui = TerminalUI.getInstance();
  }

  /**
   * Ponto de entrada para disparar o fluxo de migração completo.
   *
   * @spec REQ-MIG-004
   * @spec REQ-MIG-005
   */
  public async run(): Promise<void> {
    const startTime = new Date();
    this.ui.printBanner();

    const config = this.configService.get();
    if (config.MIGRATION_DRY_RUN) {
      this.ui.logWarn('MODO DRY-RUN ATIVADO: Nenhuma gravação real será feita no Chatwoot ou Zendesk.');
    }

    // PASSO 1: Autenticação e Verificação de Permissões
    const permissionResult = await this.permissionService.validatePermissions();
    if (permissionResult.errors.length > 0) {
      this.ui.logError('Migração abortada devido a inconsistências de permissão nas contas configuradas.');
      return;
    }

    // PASSO 2: Mensuração e Migração de Arestas Pré-requisito
    const edgeAssessment = await this.edgeMigrationService.assessEdges();
    if (!config.MIGRATION_DRY_RUN) {
      await this.edgeMigrationService.migrateEdges(edgeAssessment);
    } else {
      this.ui.logInfo('[DRY-RUN] Criação de arestas no Chatwoot saltada.');
    }

    // PASSO 3 & 4: Execução por ID Seguro (Passo 3) ou Loop Contínuo (Passo 4)
    const stats: MigrationViewStats = {
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      startTime,
      endTime: new Date(),
    };

    if (this.configService.hasExplicitTicketList()) {
      const targetIds = this.configService.getTargetTicketIds();
      await this.executeExplicitTicketsMode(targetIds, stats);
    } else {
      await this.executeBatchLoopMode(stats);
    }

    stats.endTime = new Date();
    this.ui.printView(stats);
  }

  /**
   * Executa a migração para uma lista delimitada de chamados específicos.
   *
   * @spec REQ-MIG-004
   * @param targetIds Lista de IDs de chamados informados via .env.
   * @param stats Estrutura mutável de estatísticas.
   */
  private async executeExplicitTicketsMode(targetIds: number[], stats: MigrationViewStats): Promise<void> {
    stats.total = targetIds.length;

    if (targetIds.length === 1) {
      this.ui.logInfo(`Modo Seguro ativado: Buscando chamado #${targetIds[0]} no Zendesk...`);
    } else {
      this.ui.logInfo(
        `Modo Lista Delimitada ativado: Processando ${targetIds.length} chamados (${targetIds.join(', ')})...`
      );
    }

    const useProgressBar = targetIds.length > 1;
    if (useProgressBar) {
      this.ui.createProgressBar(targetIds.length, 'Processando lista de chamados...');
    }

    for (let i = 0; i < targetIds.length; i++) {
      const ticketId = targetIds[i]!;

      if (!useProgressBar) {
        this.ui.startSpinner(`Validando existência do chamado #${ticketId} no Zendesk...`);
      }

      const ticket = await this.zendeskClient.getTicket(ticketId);

      if (!ticket) {
        if (!useProgressBar) {
          this.ui.failSpinner(`Chamado #${ticketId} NÃO foi localizado no Zendesk!`);
        }
        this.ui.logError(`O chamado #${ticketId} informado no .env não existe no Zendesk. Saltando...`);
        stats.failed++;
        if (useProgressBar) {
          this.ui.updateProgressBar(stats.success + stats.failed, {
            status: `Ticket #${ticketId} não encontrado`,
          });
        }
        continue;
      }

      if (!useProgressBar) {
        this.ui.doneSpinner(`Chamado #${ticketId} localizado com sucesso (Assunto: "${ticket.subject}").`);
      }

      const result = await this.processSingleTicket(ticket);
      if (result === 'migrated') {
        stats.success++;
      } else if (result === 'skipped') {
        stats.skipped++;
      } else {
        stats.failed++;
      }

      if (useProgressBar) {
        this.ui.updateProgressBar(stats.success + stats.failed + stats.skipped, {
          status: `Ticket #${ticketId} processado`,
        });
      }
    }

    if (useProgressBar) {
      this.ui.stopProgressBar();
    }
  }

  /**
   * Executa a migração em lote contínua, buscando chamados sem a tag 'chatwoot' até zerar a fila.
   *
   * @spec REQ-MIG-005
   * @param stats Estrutura mutável de estatísticas.
   */
  private async executeBatchLoopMode(stats: MigrationViewStats): Promise<void> {
    this.ui.logInfo("Modo Lote ativado: Buscando chamados pendentes (sem a tag 'chatwoot')...");

    let page = 1;
    let hasMore = true;

    // Busca preliminar para dimensionar o progresso
    const initialSearch = await this.zendeskClient.searchTicketsWithoutTag('chatwoot', 1);
    const totalPending = initialSearch.count;
    stats.total = totalPending;

    if (totalPending === 0) {
      this.ui.logDone("Nenhum chamado pendente de migração encontrado! Fila com tag 'chatwoot' já zerada.");
      return;
    }

    this.ui.logInfo(`Total de chamados identificados para migração: ${totalPending}`);
    this.ui.createProgressBar(totalPending, 'Iniciando lote...');

    while (hasMore) {
      const searchResult = await this.zendeskClient.searchTicketsWithoutTag('chatwoot', page);
      const tickets = searchResult.results;

      if (!tickets || tickets.length === 0) {
        hasMore = false;
        break;
      }

      for (const ticket of tickets) {
        this.ui.updateProgressBar(stats.success + stats.failed, {
          status: `Ticket #${ticket.id}`,
        });

        const result = await this.processSingleTicket(ticket);
        if (result === 'migrated') {
          stats.success++;
        } else if (result === 'skipped') {
          stats.skipped++;
        } else {
          stats.failed++;
        }

        this.ui.updateProgressBar(stats.success + stats.failed + stats.skipped, {
          status: `Ticket #${ticket.id} processado`,
        });
      }

      // Se marcamos os chamados com 'chatwoot', na próxima busca eles já não retornam na página 1
      // Porém, se estiver em dry-run ou para garantir avanço, incrementamos a página se não marcamos tags
      if (this.configService.get().MIGRATION_DRY_RUN) {
        page++;
        if (!searchResult.next_page) {
          hasMore = false;
        }
      }
    }

    this.ui.stopProgressBar();
    this.ui.logDone('Processamento do lote finalizado com sucesso.');
  }

  /**
   * Executa o Passo 5 completo para um chamado individual:
   * Extração de dados, contato, criação de conversa, mensagens, anexos e etiquetagem no Zendesk.
   *
   * @spec REQ-MIG-006
   * @spec REQ-MIG-007
   * @spec REQ-MIG-011
   * @param ticket Chamado do Zendesk a ser migrado.
   * @returns 'migrated' se criado com sucesso, 'skipped' se já existia e não duplicou, 'failed' em caso de erro.
   */
  private async processSingleTicket(ticket: ZendeskTicket): Promise<'migrated' | 'skipped' | 'failed'> {
    const isDryRun = this.configService.get().MIGRATION_DRY_RUN;

    try {
      // 1. Obter requisitante no Zendesk
      const requester = await this.zendeskClient.getUser(ticket.requester_id);

      // 2. Obter comentários, anexos e link direto no Zendesk
      const comments = await this.zendeskClient.getTicketComments(ticket.id);
      const zendeskTicketUrl = this.zendeskClient.getTicketWebUrl(ticket.id);

      if (isDryRun) {
        this.ui.logInfo(
          `[DRY-RUN] Simulado: Chamado #${ticket.id} ("${ticket.subject}") -> Requisitante: ${requester.email}, ${comments.length} comentários.`
        );
        return 'migrated';
      }

      // 3. Localizar ou cadastrar o contato no Chatwoot
      const defaultClientName = this.dictionaryService.get().roles.defaultClientName;
      let contact = await this.chatwootClient.findContactByEmail(requester.email);

      // 4. Verificação de Idempotência e Anti-Duplicação no Chatwoot
      if (contact) {
        const existingConversation = await this.chatwootClient.findExistingConversation(contact.id, ticket.id);
        if (existingConversation) {
          const existingChatwootUrl = this.chatwootClient.getConversationWebUrl(existingConversation.id);

          if (!this.configService.isForceUpdate()) {
            this.ui.logWarn(
              `Chamado #${ticket.id} já existe no Chatwoot (Conversa #${existingConversation.id}). Ignorando duplicação.\n` +
                `    Chatwoot: ${existingChatwootUrl}\n` +
                `    Zendesk:  ${zendeskTicketUrl}\n` +
                `    (Para forçar atualização de atributos, defina MIGRATION_FORCE_UPDATE=true no .env)`
            );

            // Garante que o mapeamento está registrado no CSV e JSON
            this.mappingService.recordMapping({
              zendeskTicketId: ticket.id,
              chatwootConversationId: existingConversation.id,
              zendeskUrl: zendeskTicketUrl,
              chatwootUrl: existingChatwootUrl,
              subject: ticket.subject,
              requesterEmail: requester.email,
              attachmentsCount: 0,
              migratedAt: new Date().toISOString(),
            });

            return 'skipped';
          }

          // Se FORCE_UPDATE=true, ATUALIZAMOS a conversa existente SEM criar uma nova duplicada
          this.ui.logInfo(
            `[FORCE-UPDATE] Chamado #${ticket.id} já existia (Conversa #${existingConversation.id}). Atualizando atributos na conversa existente sem duplicar...`
          );

          await this.chatwootClient.updateConversation(existingConversation.id, {
            custom_attributes: {
              zendesk_link: zendeskTicketUrl,
              zendesk_ticket_id: ticket.id,
              zendesk_ticket_url: zendeskTicketUrl,
              zendesk_original_status: ticket.status,
              assunto_do_ticket: ticket.subject,
            },
          });

          if (ticket.tags && ticket.tags.length > 0) {
            await this.chatwootClient.addLabelsToConversation(existingConversation.id, ticket.tags);
          }

          this.mappingService.recordMapping({
            zendeskTicketId: ticket.id,
            chatwootConversationId: existingConversation.id,
            zendeskUrl: zendeskTicketUrl,
            chatwootUrl: existingChatwootUrl,
            subject: ticket.subject,
            requesterEmail: requester.email,
            attachmentsCount: 0,
            migratedAt: new Date().toISOString(),
          });

          this.ui.logDone(
            `Conversa existente #${existingConversation.id} atualizada com sucesso (zendesk_link e tags sincronizados, sem duplicação)!`
          );

          return 'migrated';
        }
      } else {
        contact = await this.chatwootClient.createContact({
          inbox_id: this.chatwootClient.getInboxId(),
          name: requester.name || requester.email.split('@')[0] || defaultClientName,
          email: requester.email,
        });
      }

      // 5. Criar a conversa no Chatwoot com custom_attribute zendesk_link
      const conversationStatus = TicketMapper.mapStatus(ticket.status);
      const conversation = await this.chatwootClient.createConversation({
        inbox_id: this.chatwootClient.getInboxId(),
        contact_id: contact.id,
        status: conversationStatus,
        custom_attributes: {
          zendesk_link: zendeskTicketUrl,
          zendesk_ticket_id: ticket.id,
          zendesk_ticket_url: zendeskTicketUrl,
          zendesk_original_status: ticket.status,
          assunto_do_ticket: ticket.subject,
        },
      });

      // 5. Vincular tags/labels na conversa
      if (ticket.tags && ticket.tags.length > 0) {
        await this.chatwootClient.addLabelsToConversation(conversation.id, ticket.tags);
      }

      // 6. Nota interna inicial com metadados do chamado e link do Zendesk
      const hasComments = comments && comments.length > 0;
      const initialMessageContent = TicketMapper.generateInitialConversationMessage(
        ticket,
        requester,
        zendeskTicketUrl,
        !hasComments
      );
      await this.chatwootClient.createMessage(conversation.id, {
        content: initialMessageContent,
        private: true,
      });

      // 7. Replay cronológico de comentários e anexos binários
      let totalAttachmentsMigrated = 0;
      for (const comment of comments) {
        const author = await this.zendeskClient.getUser(comment.author_id);
        const roleName = await this.zendeskClient.resolveUserRoleName(author, r =>
          this.dictionaryService.getRoleLabel(r)
        );

        // Download dos binários de anexos do Zendesk (regulares e imagens inline)
        const allAttachments = TicketMapper.extractAllAttachments(comment);
        const attachmentPayloads: MessageAttachmentPayload[] = [];
        if (allAttachments.length > 0) {
          for (const att of allAttachments) {
            try {
              const blob = await this.zendeskClient.downloadAttachment(att.contentUrl);
              if (blob) {
                attachmentPayloads.push({
                  blob,
                  fileName: att.fileName,
                });
                totalAttachmentsMigrated++;
              } else {
                this.ui.logWarn(
                  `Não foi possível baixar o binário do anexo '${att.fileName}' no Zendesk. Ele será referenciado como link.`
                );
              }
            } catch (attError) {
              this.ui.logWarn(`Erro ao baixar anexo '${att.fileName}':`, attError);
            }
          }
        }

        // Se algum download falhou, ativamos links de fallback no corpo da mensagem
        const hasFailedAttachments = allAttachments.length > 0 && attachmentPayloads.length < allAttachments.length;

        const messageDto = TicketMapper.toChatwootMessageDTO(
          comment,
          author,
          roleName,
          hasFailedAttachments,
          ticket.subject,
          requester.email
        );

        try {
          await this.chatwootClient.createMessage(conversation.id, messageDto, attachmentPayloads);
        } catch (msgError) {
          this.ui.logWarn(
            `Falha ao postar anexo na mensagem do comentário #${comment.id}. Tentando envio textual de fallback...`,
            msgError
          );
          const fallbackDto = TicketMapper.toChatwootMessageDTO(
            comment,
            author,
            roleName,
            true,
            ticket.subject,
            requester.email
          );
          await this.chatwootClient.createMessage(conversation.id, fallbackDto);
        }
      }

      // 8. Ajustar status final caso necessário
      if (conversationStatus !== 'open') {
        await this.chatwootClient.toggleStatus(conversation.id, conversationStatus);
      }

      // 9. Marcar chamado com a tag 'chatwoot' no Zendesk
      await this.zendeskClient.addTagToTicket(ticket.id, 'chatwoot');

      // 10. Registrar mapeamento de-para persistente
      const chatwootUrl = this.chatwootClient.getConversationWebUrl(conversation.id);
      this.mappingService.recordMapping({
        zendeskTicketId: ticket.id,
        chatwootConversationId: conversation.id,
        zendeskUrl: zendeskTicketUrl,
        chatwootUrl,
        subject: ticket.subject,
        requesterEmail: requester.email,
        attachmentsCount: totalAttachmentsMigrated,
        migratedAt: new Date().toISOString(),
      });

      this.ui.logDone(
        `Chamado #${ticket.id} migrado com sucesso -> Chatwoot Conversa #${conversation.id}\n` +
          `    Chatwoot: ${chatwootUrl}\n` +
          `    Zendesk:  ${zendeskTicketUrl}\n` +
          `    Anexos migrados: ${totalAttachmentsMigrated}`
      );

      return 'migrated';
    } catch (error) {
      this.ui.logError(`Falha ao processar chamado #${ticket.id}:`, error);
      return 'failed';
    }
  }
}
