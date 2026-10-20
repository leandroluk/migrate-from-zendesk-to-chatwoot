/**
 * Representa um anexo vinculado a um comentário no Zendesk.
 *
 * @spec REQ-MIG-006
 */
export interface ZendeskAttachment {
  id: number;
  file_name: string;
  content_url: string;
  content_type: string;
  size: number;
}

/**
 * Representa um comentário em um chamado do Zendesk.
 *
 * @spec REQ-MIG-006
 */
export interface ZendeskComment {
  id: number;
  type: string;
  author_id: number;
  body: string;
  html_body?: string;
  plain_body?: string;
  public: boolean;
  created_at: string;
  attachments?: ZendeskAttachment[];
}

/**
 * Representa um usuário (requisitante ou agente) no Zendesk.
 *
 * @spec REQ-MIG-002
 * @spec REQ-MIG-003
 */
export interface ZendeskUser {
  id: number;
  name: string;
  email: string;
  role: "end-user" | "agent" | "admin";
  active: boolean;
  verified?: boolean;
}

/**
 * Representa um grupo de atendimento no Zendesk.
 *
 * @spec REQ-MIG-003
 */
export interface ZendeskGroup {
  id: number;
  name: string;
  description?: string;
  deleted?: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Representa uma tag registrada no Zendesk.
 *
 * @spec REQ-MIG-003
 */
export interface ZendeskTag {
  name: string;
  count?: number;
}

/**
 * Representa a estrutura de um chamado (ticket) retornado pela API v2 do Zendesk.
 *
 * @spec REQ-MIG-004
 * @spec REQ-MIG-005
 * @spec REQ-MIG-006
 */
export interface ZendeskTicket {
  id: number;
  url: string;
  subject: string;
  description: string;
  status: "new" | "open" | "pending" | "hold" | "solved" | "closed";
  priority?: "urgent" | "high" | "normal" | "low";
  requester_id: number;
  submitter_id?: number;
  assignee_id?: number;
  group_id?: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

/**
 * Resposta paginada de busca de chamados na API do Zendesk.
 *
 * @spec REQ-MIG-005
 */
export interface ZendeskSearchResponse {
  results: ZendeskTicket[];
  count: number;
  next_page: string | null;
  previous_page: string | null;
}
