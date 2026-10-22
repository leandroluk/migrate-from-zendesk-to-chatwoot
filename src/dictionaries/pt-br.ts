import type {MigrationDictionary} from './types';

/**
 * Dicionário em Português Brasileiro (pt-BR) para textos e formatações de migração.
 *
 * @spec REQ-MIG-006
 */
export const ptBRDictionary: MigrationDictionary = {
  locale: 'pt-BR',

  roles: {
    admin: 'Administrador',
    agent: 'Agente',
    endUser: 'Cliente',
    defaultClientName: 'Cliente',
    system: 'Sistema',
  },

  priorities: {
    urgent: 'Urgente',
    high: 'Alta',
    normal: 'Normal',
    low: 'Baixa',
  },

  statuses: {
    new: 'Novo',
    open: 'Aberto',
    pending: 'Pendente',
    hold: 'Em espera',
    solved: 'Resolvido',
    closed: 'Fechado',
  },

  messages: {
    commentHeader: (date, role, name, email) => `📌 [Zendesk | ${date} UTC | ${role}: ${name} (${email})]`,
    attachmentsHeader: '\n\n📎 Anexos originais do chamado:',
    attachmentItem: (fileName, sizeKb, url) => `\n • ${fileName} (${sizeKb} KB) - ${url}`,
    initialTicketHeader: id => `🎫 Chamado #${id} migrado do Zendesk`,
    zendeskUrlLabel: 'Link no Zendesk',
    subjectLabel: 'Assunto',
    requesterLabel: 'Requisitante',
    originalDateLabel: 'Abertura original',
    priorityLabel: 'Prioridade',
    originalStatusLabel: 'Status original',
    initialDescriptionHeader: '--- Descrição Inicial ---',
  },

  teams: {
    defaultDescription: groupName => `Equipe migrada do grupo Zendesk: ${groupName}`,
  },
};
