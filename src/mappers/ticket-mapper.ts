import type { CreateMessageDTO } from "../types/chatwoot.js";
import type { ZendeskComment, ZendeskTicket, ZendeskUser } from "../types/zendesk.js";

/**
 * Classe utilitária responsável por mapear e transformar entidades do Zendesk
 * nos formatos equivalentes esperados pela API do Chatwoot.
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
   * preservando metadados de autoria, data original de envio e referências completas aos anexos.
   *
   * @spec REQ-MIG-006
   * @param comment Objeto do comentário no Zendesk.
   * @param author Objeto do usuário autor do comentário.
   * @returns DTO pronto para postagem da mensagem no Chatwoot.
   */
  public static toChatwootMessageDTO(
    comment: ZendeskComment,
    author: ZendeskUser,
  ): CreateMessageDTO {
    const formattedDate = new Date(comment.created_at).toLocaleString("pt-BR", {
      timeZone: "UTC",
    });

    const isInternalNote = !comment.public;
    const authorRoleLabel =
      author.role === "admin" ? "Administrador" : author.role === "agent" ? "Agente" : "Cliente";

    // Cabeçalho de preservação histórica
    let content = `📌 [Zendesk | ${formattedDate} UTC | ${authorRoleLabel}: ${author.name} (${author.email})]\n\n`;

    // Corpo da mensagem
    const rawBody = comment.plain_body || comment.body || "";
    content += rawBody.trim();

    // Sumário e links diretos dos anexos
    if (comment.attachments && comment.attachments.length > 0) {
      content += "\n\n📎 Anexos originais do chamado:";
      for (const att of comment.attachments) {
        const sizeKb = (att.size / 1024).toFixed(1);
        content += `\n • ${att.file_name} (${sizeKb} KB) - ${att.content_url}`;
      }
    }

    return {
      content,
      private: isInternalNote,
      message_type: author.role === "end-user" ? "incoming" : "outgoing",
    };
  }

  /**
   * Gera o texto da mensagem inicial de abertura da conversa no Chatwoot a partir dos dados do ticket.
   *
   * @spec REQ-MIG-006
   * @param ticket Objeto do chamado no Zendesk.
   * @param requester Objeto do usuário requisitante.
   * @returns Texto explicativo da abertura do chamado.
   */
  public static generateInitialConversationMessage(
    ticket: ZendeskTicket,
    requester: ZendeskUser,
  ): string {
    const formattedDate = new Date(ticket.created_at).toLocaleString("pt-BR", { timeZone: "UTC" });
    let text = `🎫 Chamado #${ticket.id} migrado do Zendesk\n`;
    text += `Assunto: ${ticket.subject}\n`;
    text += `Requisitante: ${requester.name} (${requester.email})\n`;
    text += `Abertura original: ${formattedDate} UTC\n`;
    text += `Prioridade: ${ticket.priority ?? "normal"} | Status original: ${ticket.status}\n\n`;
    text += `--- Descrição Inicial ---\n${ticket.description}`;
    return text;
  }
}
