import type {MigrationDictionary} from './types';

/**
 * English (en-US) dictionary for migration texts and formatting.
 *
 * @spec REQ-MIG-006
 */
export const enUSDictionary: MigrationDictionary = {
  locale: 'en-US',

  roles: {
    admin: 'Administrator',
    agent: 'Agent',
    endUser: 'Customer',
    defaultClientName: 'Customer',
  },

  priorities: {
    urgent: 'Urgent',
    high: 'High',
    normal: 'Normal',
    low: 'Low',
  },

  statuses: {
    new: 'New',
    open: 'Open',
    pending: 'Pending',
    hold: 'On Hold',
    solved: 'Solved',
    closed: 'Closed',
  },

  messages: {
    commentHeader: (date, role, name, email) => `📌 [Zendesk | ${date} UTC | ${role}: ${name} (${email})]`,
    attachmentsHeader: '\n\n📎 Original ticket attachments:',
    attachmentItem: (fileName, sizeKb, url) => `\n • ${fileName} (${sizeKb} KB) - ${url}`,
    initialTicketHeader: id => `🎫 Ticket #${id} migrated from Zendesk`,
    zendeskUrlLabel: 'Zendesk Link',
    subjectLabel: 'Subject',
    requesterLabel: 'Requester',
    originalDateLabel: 'Original creation',
    priorityLabel: 'Priority',
    originalStatusLabel: 'Original status',
    initialDescriptionHeader: '--- Initial Description ---',
  },

  teams: {
    defaultDescription: groupName => `Team migrated from Zendesk group: ${groupName}`,
  },
};
