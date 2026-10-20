/**
 * Representa um contato cadastrado no Chatwoot.
 *
 * @spec REQ-MIG-003
 * @spec REQ-MIG-006
 */
export interface ChatwootContact {
  id: number;
  name: string;
  email: string;
  phone_number?: string | null;
  identifier?: string | null;
  thumbnail?: string | null;
  custom_attributes?: Record<string, unknown>;
}

/**
 * Representa uma conversa criada no Chatwoot.
 *
 * @spec REQ-MIG-006
 */
export interface ChatwootConversation {
  id: number;
  account_id: number;
  inbox_id: number;
  status: "open" | "resolved" | "pending" | "snoozed";
  contact_inbox?: {
    contact_id: number;
    inbox_id: number;
    source_id: string;
  };
  custom_attributes?: Record<string, unknown>;
  additional_attributes?: Record<string, unknown>;
}

/**
 * Representa uma mensagem registrada em uma conversa do Chatwoot.
 *
 * @spec REQ-MIG-006
 */
export interface ChatwootMessage {
  id: number;
  content: string;
  message_type: "incoming" | "outgoing" | "template";
  private: boolean;
  created_at: number | string;
  conversation_id: number;
}

/**
 * Representa um marcador (label/tag) no Chatwoot.
 *
 * @spec REQ-MIG-003
 */
export interface ChatwootLabel {
  id?: number;
  title: string;
  description?: string;
  color?: string;
  show_on_sidebar?: boolean;
}

/**
 * Representa uma equipe (team) no Chatwoot.
 *
 * @spec REQ-MIG-003
 */
export interface ChatwootTeam {
  id: number;
  name: string;
  description?: string;
  allow_auto_assign?: boolean;
}

/**
 * Parâmetros para criação de um novo contato no Chatwoot.
 *
 * @spec REQ-MIG-006
 */
export interface CreateContactDTO {
  inbox_id: number;
  name: string;
  email: string;
  phone_number?: string;
  identifier?: string;
  custom_attributes?: Record<string, unknown>;
}

/**
 * Parâmetros para criação de uma conversa no Chatwoot.
 *
 * @spec REQ-MIG-006
 */
export interface CreateConversationDTO {
  inbox_id: number;
  contact_id: number;
  status?: "open" | "resolved" | "pending";
  assignee_id?: number;
  team_id?: number;
  custom_attributes?: Record<string, unknown>;
  additional_attributes?: Record<string, unknown>;
}

/**
 * Parâmetros para postagem de uma mensagem no Chatwoot.
 *
 * @spec REQ-MIG-006
 */
export interface CreateMessageDTO {
  content: string;
  message_type?: "incoming" | "outgoing";
  private?: boolean;
}
