import { DictionaryService } from "../dictionaries";
import type { CreateMessageDTO, ZendeskComment, ZendeskTicket, ZendeskUser } from "../types";

/**
 * Classe utilitária responsável por mapear e transformar entidades do Zendesk
 * nos formatos equivalentes esperados pela API do Chatwoot.
 * Utiliza o DictionaryService ativo para internacionalização de todas as mensagens e rótulos.
 *
 * @spec REQ-MIG-006
 */
export class TicketMapper {
  /**
   * Converte o status de um chamado do Zendesk para o status correspondente de conversa no Chatwoot.
   *
   * @spec REQ-MIG-006
   * @param zendeskStatus Status original no Zendesk ('new', 'open', 'pending', 'hold', 'solved', 'closed').
   * @returns Status equivalente no Chatwoot ('open', 'pending', 'resolved').
   */
  public static mapStatus(zendeskStatus: ZendeskTicket["status"]): "open" | "pending" | "resolved" {
    switch (zendeskStatus) {
      case "new":
      case "open":
        return "open";
      case "pending":
      case "hold":
        return "pending";
      case "solved":
      case "closed":
        return "resolved";
      default:
        return "open";
    }
  }

  /**
   * Formata o conteúdo textual de um comentário do Zendesk para o Chatwoot,
   * preservando metadados de autoria, data original de envio e referências completas aos anexos
   * utilizando o dicionário configurado no sistema.
   *
   * @spec REQ-MIG-006
   * @param comment Objeto do comentário no Zendesk.
   * @param author Objeto do usuário autor do comentário.
   * @param authorRoleLabel Nome do papel resolvido da API ou do dicionário.
   * @returns DTO pronto para postagem da mensagem no Chatwoot.
   */
  public static toChatwootMessageDTO(
    comment: ZendeskComment,
    author: ZendeskUser,
    authorRoleLabel?: string,
  ): CreateMessageDTO {
    const dictService = DictionaryService.getInstance();
    const dict = dictService.get();

    const formattedDate = new Date(comment.created_at).toLocaleString(dict.locale, {
      timeZone: "UTC",
    });

    const isInternalNote = !comment.public;
    const resolvedRole = authorRoleLabel ?? dictService.getRoleLabel(author.role);

    // Cabeçalho de preservação histórica internacionalizado
    let content = `${dict.messages.commentHeader(formattedDate, resolvedRole, author.name, author.email)}\n\n`;

    // Corpo da mensagem
    const rawBody = comment.plain_body || comment.body || "";
    content += rawBody.trim();

    // Sumário e links diretos dos anexos a partir do dicionário
    if (comment.attachments && comment.attachments.length > 0) {
      content += dict.messages.attachmentsHeader;
      for (const att of comment.attachments) {
        const sizeKb = (att.size / 1024).toFixed(1);
        content += dict.messages.attachmentItem(att.file_name, sizeKb, att.content_url);
      }
    }

    return {
      content,
      private: isInternalNote,
      message_type: author.role === "end-user" ? "incoming" : "outgoing",
    };
  }

  /**
   * Gera o texto da mensagem inicial de abertura da conversa no Chatwoot a partir dos dados do ticket
   * utilizando as chaves e templates do dicionário ativo.
   *
   * @spec REQ-MIG-006
   * @param ticket Objeto do chamado no Zendesk.
   * @param requester Objeto do usuário requisitante.
   * @returns Texto explicativo da abertura do chamado formatado pelo dicionário.
   */
  public static generateInitialConversationMessage(
    ticket: ZendeskTicket,
    requester: ZendeskUser,
  ): string {
    const dictService = DictionaryService.getInstance();
    const dict = dictService.get();

    const formattedDate = new Date(ticket.created_at).toLocaleString(dict.locale, {
      timeZone: "UTC",
    });
    const priorityLabel = dictService.getPriorityLabel(ticket.priority);
    const statusLabel = dictService.getStatusLabel(ticket.status);

    let text = `${dict.messages.initialTicketHeader(ticket.id)}\n`;
    text += `${dict.messages.subjectLabel}: ${ticket.subject}\n`;
    text += `${dict.messages.requesterLabel}: ${requester.name} (${requester.email})\n`;
    text += `${dict.messages.originalDateLabel}: ${formattedDate} UTC\n`;
    text += `${dict.messages.priorityLabel}: ${priorityLabel} | ${dict.messages.originalStatusLabel}: ${statusLabel}\n\n`;
    text += `${dict.messages.initialDescriptionHeader}\n${ticket.description}`;

    return text;
  }
}
