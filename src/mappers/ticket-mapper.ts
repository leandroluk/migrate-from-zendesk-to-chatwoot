import {DictionaryService} from '../dictionaries';
import type {CreateMessageDTO, ExtractedAttachment, ZendeskComment, ZendeskTicket, ZendeskUser} from '../types';

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
  public static mapStatus(zendeskStatus: ZendeskTicket['status']): 'open' | 'pending' | 'resolved' {
    switch (zendeskStatus) {
      case 'new':
      case 'open':
        return 'open';
      case 'pending':
      case 'hold':
        return 'pending';
      case 'solved':
      case 'closed':
        return 'resolved';
      default:
        return 'open';
    }
  }

  /**
   * Verifica se uma cadeia de caracteres possui elementos ou marcação HTML.
   *
   * @param content Texto ou HTML a ser verificado.
   * @returns Verdadeiro caso contenha tags HTML reconhecidas.
   */
  public static hasHtml(content?: string): boolean {
    if (!content) return false;
    return /<\/?(table|tbody|thead|tr|td|th|div|p|br|span|b|strong|i|em|h[1-6]|ul|ol|li|img|a|blockquote|hr)\b/i.test(
      content
    );
  }

  /**
   * Formata o conteúdo textual e HTML de um comentário do Zendesk para o Chatwoot,
   * preservando metadados de autoria, data original de envio, formatação rica de e-mail (HTML)
   * e referências opcionais a anexos utilizando o dicionário configurado no sistema.
   *
   * @spec REQ-MIG-006
   * @param comment Objeto do comentário no Zendesk.
   * @param author Objeto do usuário autor do comentário.
   * @param authorRoleLabel Nome do papel resolvido da API ou do dicionário.
   * @param includeAttachmentLinks Se verdadeiro, inclui links de texto para anexos no corpo da mensagem.
   * @param ticketSubject Assunto do chamado para compor o cabeçalho do e-mail.
   * @param requesterEmail E-mail do solicitante para preencher destinatário.
   * @returns DTO pronto para postagem da mensagem no Chatwoot.
   */
  public static toChatwootMessageDTO(
    comment: ZendeskComment,
    author: ZendeskUser,
    authorRoleLabel?: string,
    includeAttachmentLinks = false,
    ticketSubject?: string,
    requesterEmail?: string
  ): CreateMessageDTO {
    const dictService = DictionaryService.getInstance();
    const dict = dictService.get();

    const formattedDate = new Date(comment.created_at).toLocaleString(dict.locale, {
      timeZone: 'UTC',
    });

    const isInternalNote = !comment.public;
    const resolvedRole = authorRoleLabel ?? dictService.getRoleLabel(author.role);

    // Cabeçalho de preservação histórica internacionalizado (versão texto)
    let content = `${dict.messages.commentHeader(formattedDate, resolvedRole, author.name, author.email)}\n\n`;

    // Corpo da mensagem textual
    let rawBody = comment.plain_body || comment.body || '';
    // Remove tags markdown de imagens embutidas para evitar poluição visual de links com autenticação externa
    rawBody = rawBody.replace(/!\[[^\]]*\]\(https?:\/\/[^\s)]+\/attachments\/token\/[^\s)]+\)/gi, '');
    content += rawBody.trim();

    // Sumário e links diretos dos anexos como fallback opcional
    if (includeAttachmentLinks && comment.attachments && comment.attachments.length > 0) {
      content += dict.messages.attachmentsHeader;
      for (const att of comment.attachments) {
        const sizeKb = (att.size / 1024).toFixed(1);
        content += dict.messages.attachmentItem(att.file_name, sizeKb, att.content_url);
      }
    }

    // Avalia se o comentário possui HTML rico a ser renderizado nativamente no Chatwoot
    const hasRichHtml = !isInternalNote && TicketMapper.hasHtml(comment.html_body);

    if (hasRichHtml && comment.html_body) {
      const bannerHtml =
        `<div style="margin-bottom: 14px; padding: 8px 12px; background-color: #f1f5f9; border-left: 3px solid #0284c7; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #475569; line-height: 1.4;">` +
        `📌 <strong>Zendesk</strong> &bull; ${formattedDate} UTC &bull; <strong>${resolvedRole}</strong>: ${author.name} (${author.email})` +
        `</div>`;

      let fullHtml = `${bannerHtml}\n${comment.html_body}`;

      if (includeAttachmentLinks && comment.attachments && comment.attachments.length > 0) {
        fullHtml += `<div style="margin-top: 16px; padding-top: 12px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #64748b;">`;
        fullHtml += `<strong>${dict.messages.attachmentsHeader.trim()}</strong><ul>`;
        for (const att of comment.attachments) {
          const sizeKb = (att.size / 1024).toFixed(1);
          fullHtml += `<li><a href="${att.content_url}" target="_blank" rel="noopener noreferrer">${att.file_name}</a> (${sizeKb} KB)</li>`;
        }
        fullHtml += `</ul></div>`;
      }

      return {
        content,
        private: isInternalNote,
        message_type: author.role === 'end-user' ? 'incoming' : 'outgoing',
        content_type: 'incoming_email',
        content_attributes: {
          email: {
            subject: ticketSubject || '',
            from: author.email ? [author.email] : [],
            to: requesterEmail ? [requesterEmail] : [],
            html_content: {
              full: fullHtml,
              reply: fullHtml,
            },
            text_content: {
              full: content,
              reply: content,
            },
          },
        },
      };
    }

    return {
      content,
      private: isInternalNote,
      message_type: author.role === 'end-user' ? 'incoming' : 'outgoing',
      content_type: 'text',
    };
  }

  /**
   * Extrai todos os anexos de um comentário do Zendesk, englobando tanto os anexos regulares
   * cadastrados na propriedade `attachments` quanto as imagens embutidas (inline) presentes
   * em `html_body` e referências Markdown em `body`.
   *
   * @spec REQ-MIG-006
   * @param comment Comentário do Zendesk.
   * @returns Lista unificada e desduplicada de anexos com URLs de download.
   */
  public static extractAllAttachments(comment: ZendeskComment): ExtractedAttachment[] {
    const results: ExtractedAttachment[] = [];
    const seenUrls = new Set<string>();

    // 1. Anexos regulares da API
    if (comment.attachments && comment.attachments.length > 0) {
      for (const att of comment.attachments) {
        if (!seenUrls.has(att.content_url)) {
          seenUrls.add(att.content_url);
          let cleanName = att.file_name;
          if (cleanName.includes('filename=')) {
            const match = cleanName.match(/filename=(?:UTF-8'')?["']?([^"';]+)["']?/i);
            if (match?.[1]) {
              try {
                cleanName = decodeURIComponent(match[1]);
              } catch {
                cleanName = match[1];
              }
            }
          }
          results.push({
            fileName: cleanName,
            contentUrl: att.content_url,
            contentType: att.content_type,
            isInline: false,
          });
        }
      }
    }

    // 2. Imagens inline no html_body (<img src="...attachments/token/...">)
    const htmlRegex = /src=["'](https?:\/\/[^"']+\/attachments\/token\/[^"']+)["']/gi;
    let htmlMatch: RegExpExecArray | null;
    while ((htmlMatch = htmlRegex.exec(comment.html_body || '')) !== null) {
      const url = htmlMatch[1];
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        results.push({
          fileName: TicketMapper.extractFileNameFromUrl(url),
          contentUrl: url,
          isInline: true,
        });
      }
    }

    // 3. Imagens inline no Markdown body (![alt](https://...attachments/token/...))
    const mdRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+\/attachments\/token\/[^\s)]+)\)/gi;
    let mdMatch: RegExpExecArray | null;
    while ((mdMatch = mdRegex.exec(comment.body || '')) !== null) {
      const url = mdMatch[2];
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        results.push({
          fileName: TicketMapper.extractFileNameFromUrl(url, mdMatch[1]),
          contentUrl: url,
          isInline: true,
        });
      }
    }

    return results;
  }

  /**
   * Extrai o nome de arquivo legível a partir de uma URL de anexo do Zendesk.
   */
  private static extractFileNameFromUrl(url: string, fallbackName?: string): string {
    try {
      const parsed = new URL(url);
      const nameParam = parsed.searchParams.get('name');
      if (nameParam) {
        return decodeURIComponent(nameParam);
      }
      const pathname = parsed.pathname;
      const lastSegment = pathname.split('/').filter(Boolean).pop();
      if (lastSegment && /\.(png|jpe?g|gif|webp|pdf)$/i.test(lastSegment)) {
        return decodeURIComponent(lastSegment);
      }
    } catch {
      // Ignora erro de parsing
    }

    if (fallbackName && fallbackName.trim() && fallbackName !== 'Imagem alinhada') {
      return fallbackName.trim();
    }

    return `anexo_${Date.now()}.png`;
  }

  /**
   * Gera o texto da nota/mensagem inicial de abertura da conversa no Chatwoot a partir dos dados do ticket,
   * incluindo o link direto para o chamado no Zendesk e metadados formatados.
   *
   * @spec REQ-MIG-006
   * @spec REQ-MIG-011
   * @param ticket Objeto do chamado no Zendesk.
   * @param requester Objeto do usuário requisitante.
   * @param zendeskTicketUrl URL direta de visualização do chamado no Zendesk para agentes.
   * @param includeDescription Se verdadeiro, inclui a descrição textual inicial do ticket. Padrão é falso para evitar duplicações quando os comentários são reproduzidos.
   * @returns Texto explicativo da abertura do chamado formatado pelo dicionário.
   */
  public static generateInitialConversationMessage(
    ticket: ZendeskTicket,
    requester: ZendeskUser,
    zendeskTicketUrl?: string,
    includeDescription = false
  ): string {
    const dictService = DictionaryService.getInstance();
    const dict = dictService.get();

    const formattedDate = new Date(ticket.created_at).toLocaleString(dict.locale, {
      timeZone: 'UTC',
    });
    const priorityLabel = dictService.getPriorityLabel(ticket.priority);
    const statusLabel = dictService.getStatusLabel(ticket.status);

    let text = `${dict.messages.initialTicketHeader(ticket.id)}\n`;
    if (zendeskTicketUrl) {
      text += `🔗 ${dict.messages.zendeskUrlLabel}: ${zendeskTicketUrl}\n`;
    }
    text += `${dict.messages.subjectLabel}: ${ticket.subject}\n`;
    text += `${dict.messages.requesterLabel}: ${requester.name} (${requester.email})\n`;
    text += `${dict.messages.originalDateLabel}: ${formattedDate} UTC\n`;
    text += `${dict.messages.priorityLabel}: ${priorityLabel} | ${dict.messages.originalStatusLabel}: ${statusLabel}`;

    if (includeDescription && ticket.description) {
      text += `\n\n${dict.messages.initialDescriptionHeader}\n${ticket.description}`;
    }

    return text;
  }
}
