import type {ZendeskGroup, ZendeskTag} from './zendesk';

/**
 * Resultado do levantamento de arestas pré-requisito (Passo 2).
 *
 * @spec REQ-MIG-003
 */
export interface EdgeAssessmentResult {
  tags: ZendeskTag[];
  groups: ZendeskGroup[];
  missingLabelsCount: number;
  missingTeamsCount: number;
}

/**
 * Resultado da migração de arestas (Passo 2).
 *
 * @spec REQ-MIG-003
 */
export interface EdgeMigrationResult {
  labelsCreated: number;
  teamsCreated: number;
}

/**
 * Resultado da validação de permissões (Passo 1).
 *
 * @spec REQ-MIG-002
 */
export interface PermissionValidationResult {
  zendeskAuthenticated: boolean;
  zendeskUserRole: string;
  chatwootAuthenticated: boolean;
  chatwootIsAdmin: boolean;
  errors: string[];
}

/**
 * Registro de mapeamento entre um chamado do Zendesk e uma conversa do Chatwoot.
 *
 * @spec REQ-MIG-011
 */
export interface MigrationMappingEntry {
  zendeskTicketId: number;
  chatwootConversationId: number;
  zendeskUrl: string;
  chatwootUrl: string;
  subject: string;
  requesterEmail: string;
  attachmentsCount: number;
  migratedAt: string;
}
