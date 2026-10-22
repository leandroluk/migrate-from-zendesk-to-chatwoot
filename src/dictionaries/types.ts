/**
 * Interface com todas as chaves e mensagens necessárias para geração de conteúdo
 * de chamados, mensagens, notas e entidades migradas.
 *
 * @spec REQ-MIG-006
 */
export interface MigrationDictionary {
  locale: string;

  roles: {
    admin: string;
    agent: string;
    endUser: string;
    defaultClientName: string;
    system?: string;
  };

  priorities: {
    urgent: string;
    high: string;
    normal: string;
    low: string;
  };

  statuses: {
    new: string;
    open: string;
    pending: string;
    hold: string;
    solved: string;
    closed: string;
  };

  messages: {
    commentHeader: (date: string, role: string, name: string, email: string) => string;
    attachmentsHeader: string;
    attachmentItem: (fileName: string, sizeKb: string, url: string) => string;
    initialTicketHeader: (id: number) => string;
    zendeskUrlLabel: string;
    subjectLabel: string;
    requesterLabel: string;
    originalDateLabel: string;
    priorityLabel: string;
    originalStatusLabel: string;
    initialDescriptionHeader: string;
  };

  teams: {
    defaultDescription: (groupName: string) => string;
  };
}
