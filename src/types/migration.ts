import type { ZendeskGroup, ZendeskTag } from "./zendesk";

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
