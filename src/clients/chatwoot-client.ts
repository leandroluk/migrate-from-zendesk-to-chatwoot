import type {AppConfig} from '../config';
import {DictionaryService} from '../dictionaries';
import type {
  ChatwootContact,
  ChatwootConversation,
  ChatwootLabel,
  ChatwootMessage,
  ChatwootTeam,
  CreateContactDTO,
  CreateConversationDTO,
  CreateMessageDTO,
  MessageAttachmentPayload,
} from '../types';

/**
 * Cliente HTTP orientado a objetos para interação com a API de Aplicação do Chatwoot.
 * Responsável por gerenciar contatos, conversas, mensagens, tags e equipes.
 *
 * @spec REQ-MIG-002
 * @spec REQ-MIG-003
 * @spec REQ-MIG-006
 */
export class ChatwootClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly accountId: number;
  private readonly inboxId: number;
  private readonly knownLabels = new Set<string>();

  /**
   * Construtor do ChatwootClient configurado via AppConfig.
   *
   * @param config Configurações validadas do Chatwoot.
   */
  public constructor(config: AppConfig) {
    this.baseUrl = `${new URL(config.CHATWOOT_BASE_URL).origin}/api/v1`;
    this.apiToken = config.CHATWOOT_API_TOKEN;
    this.accountId = config.CHATWOOT_ACCOUNT_ID;
    this.inboxId = config.CHATWOOT_INBOX_ID;
  }

  /**
   * Executa uma requisição HTTP genérica à API do Chatwoot com autenticação via token.
   *
   * @template T Tipo de retorno esperado.
   * @param endpoint Caminho relativo a partir de /api/v1.
   * @param options Parâmetros da requisição (método, body, headers adicionais).
   * @returns Promessa com os dados tipados retornados.
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const defaultHeaders: Record<string, string> = {
      api_access_token: this.apiToken,
      Accept: 'application/json',
    };
    if (!isFormData) {
      defaultHeaders['Content-Type'] = 'application/json';
    }

    const headers = {
      ...defaultHeaders,
      ...options.headers,
    };

    const response = await fetch(url, {...options, headers});

    if (response.status === 404) {
      throw new Error(`[ChatwootClient] Recurso não encontrado (404) em ${endpoint}`);
    }

    if (response.status === 429) {
      throw new Error('[ChatwootClient] Taxa de requisições excedida (429) no Chatwoot.');
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`[ChatwootClient] Erro HTTP ${response.status} ao acessar ${endpoint}: ${errorBody}`);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {} as T;
    }

    const text = await response.text();
    if (!text || !text.trim()) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  /**
   * Valida as credenciais do usuário atual e verifica se ele possui privilégio de administrador na conta.
   *
   * @spec REQ-MIG-002
   * @returns Resultado com indicador de validade, papel e e-mail do usuário.
   */
  public async verifyAdminAccess(): Promise<{valid: boolean; email?: string; role?: string}> {
    try {
      const profile = await this.request<{
        email: string;
        accounts?: Array<{id: number; role: string}>;
      }>('/profile');

      const currentAccount = profile.accounts?.find(acc => acc.id === this.accountId);
      const isAdmin = currentAccount?.role === 'administrator';

      return {
        valid: isAdmin,
        email: profile.email,
        role: currentAccount?.role ?? 'unknown',
      };
    } catch {
      return {
        valid: false,
      };
    }
  }

  /**
   * Obtém a lista de todas as tags/labels cadastradas na conta do Chatwoot.
   *
   * @spec REQ-MIG-003
   * @returns Lista de marcadores do Chatwoot.
   */
  public async listLabels(): Promise<ChatwootLabel[]> {
    const data = await this.request<{payload: ChatwootLabel[]}>(`/accounts/${this.accountId}/labels`);
    const labels = data.payload ?? [];
    labels.forEach(l => this.knownLabels.add(l.title.toLowerCase()));
    return labels;
  }

  /**
   * Sanitiza o nome de uma label/tag para atender aos requisitos estritos do Chatwoot:
   * Apenas letras (a-z, A-Z), números (0-9), hífens (-) e underscores (_) são permitidos.
   * Caracteres especiais, espaços e pontos (.) são convertidos para underscore.
   *
   * @spec REQ-MIG-003
   * @param title Nome original da tag.
   * @returns Nome sanitizado compatível com o Chatwoot.
   */
  public static sanitizeLabel(title: string): string {
    return title
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Cria um novo marcador (label) na conta do Chatwoot.
   * Sanitiza automaticamente o título para garantir compatibilidade.
   *
   * @spec REQ-MIG-003
   * @param title Nome do marcador a ser criado.
   * @param color Cor hexadecimal do marcador (opcional).
   * @returns Marcador criado.
   */
  public async createLabel(title: string, color: string = '#1f93ff'): Promise<ChatwootLabel> {
    const sanitizedTitle = ChatwootClient.sanitizeLabel(title);
    if (!sanitizedTitle) {
      throw new Error(`[ChatwootClient] O título da label '${title}' é inválido após sanitização.`);
    }

    const data = await this.request<{payload: ChatwootLabel}>(`/accounts/${this.accountId}/labels`, {
      method: 'POST',
      body: JSON.stringify({
        title: sanitizedTitle,
        color,
        show_on_sidebar: true,
      }),
    });
    this.knownLabels.add(sanitizedTitle.toLowerCase());
    return data.payload;
  }

  /**
   * Obtém a lista de todas as equipes cadastradas no Chatwoot.
   *
   * @spec REQ-MIG-003
   * @returns Lista de equipes.
   */
  public async listTeams(): Promise<ChatwootTeam[]> {
    const data = await this.request<ChatwootTeam[]>(`/accounts/${this.accountId}/teams`);
    return Array.isArray(data) ? data : [];
  }

  /**
   * Cria uma nova equipe no Chatwoot para representar um grupo do Zendesk.
   *
   * @spec REQ-MIG-003
   * @param name Nome da equipe.
   * @param description Descrição opcional da equipe.
   * @returns Equipe criada.
   */
  public async createTeam(name: string, description?: string): Promise<ChatwootTeam> {
    const dict = DictionaryService.getInstance().get();
    return await this.request<ChatwootTeam>(`/accounts/${this.accountId}/teams`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: description ?? dict.teams.defaultDescription(name),
        allow_auto_assign: true,
      }),
    });
  }

  /**
   * Localiza um contato no Chatwoot pelo seu endereço de e-mail.
   *
   * @spec REQ-MIG-006
   * @param email E-mail do contato procurado.
   * @returns Contato localizado ou null.
   */
  public async findContactByEmail(email: string): Promise<ChatwootContact | null> {
    const endpoint = `/accounts/${this.accountId}/contacts/search?q=${encodeURIComponent(email)}`;
    const data = await this.request<{payload: ChatwootContact[]}>(endpoint);

    if (data.payload && data.payload.length > 0) {
      const exactMatch = data.payload.find(c => c.email.toLowerCase() === email.toLowerCase());
      return exactMatch ?? data.payload[0] ?? null;
    }
    return null;
  }

  /**
   * Cria um novo contato no Chatwoot vinculado à caixa de entrada padrão.
   *
   * @spec REQ-MIG-006
   * @param dto Dados de criação do contato.
   * @returns Contato recém-criado.
   */
  public async createContact(dto: CreateContactDTO): Promise<ChatwootContact> {
    const data = await this.request<{payload: {contact: ChatwootContact}}>(`/accounts/${this.accountId}/contacts`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return data.payload.contact;
  }

  /**
   * Busca no Chatwoot se já existe uma conversa registrada para um chamado do Zendesk.
   * Consulta as conversas vinculadas ao contato e verifica custom_attributes (zendesk_link, zendesk_ticket_id)
   * e o histórico de mensagens para evitar duplicação de tickets.
   *
   * @spec REQ-MIG-006
   * @spec REQ-MIG-011
   * @param contactId ID do contato no Chatwoot.
   * @param zendeskTicketId ID numérico do chamado no Zendesk.
   * @returns A conversa existente ou null caso não exista.
   */
  public async findExistingConversation(
    contactId: number,
    zendeskTicketId: number
  ): Promise<ChatwootConversation | null> {
    try {
      const endpoint = `/accounts/${this.accountId}/contacts/${contactId}/conversations`;
      const raw = await this.request<ChatwootConversation[] | {payload: ChatwootConversation[]}>(endpoint);
      const conversations = Array.isArray(raw) ? raw : (raw?.payload ?? []);

      // Filtra apenas conversas pertencentes à caixa de entrada da migração
      const validConversations = conversations.filter(c => !c.inbox_id || c.inbox_id === this.inboxId);
      const targetIdStr = String(zendeskTicketId);

      for (const conv of validConversations) {
        const customAttrs = conv.custom_attributes as Record<string, unknown> | undefined;

        // 1. Checagem por zendesk_ticket_id
        if (customAttrs?.zendesk_ticket_id !== undefined && String(customAttrs.zendesk_ticket_id) === targetIdStr) {
          return conv;
        }

        // 2. Checagem por zendesk_link
        const zendeskLink = customAttrs?.zendesk_link ?? customAttrs?.zendesk_ticket_url;
        if (
          typeof zendeskLink === 'string' &&
          (zendeskLink.endsWith(`/${targetIdStr}`) || zendeskLink.includes(`/tickets/${targetIdStr}`))
        ) {
          return conv;
        }

        // 3. Checagem no histórico de mensagens (se retornado pela API)
        const messages = (conv as unknown as {messages?: Array<{content?: string}>}).messages;
        if (Array.isArray(messages)) {
          const matched = messages.some(
            m =>
              typeof m.content === 'string' &&
              (m.content.includes(`Chamado #${targetIdStr}`) || m.content.includes(`/tickets/${targetIdStr}`))
          );
          if (matched) {
            return conv;
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Cria uma nova conversa no Chatwoot para representar um chamado migrado.
   *
   * @spec REQ-MIG-006
   * @param dto Parâmetros da conversa a ser criada.
   * @returns Conversa criada.
   */
  public async createConversation(dto: CreateConversationDTO): Promise<ChatwootConversation> {
    return await this.request<ChatwootConversation>(`/accounts/${this.accountId}/conversations`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * Adiciona rótulos/labels a uma conversa existente no Chatwoot.
   *
   * @spec REQ-MIG-006
   * @param conversationId ID da conversa no Chatwoot.
   * @param labels Lista de nomes de marcadores.
   */
  public async addLabelsToConversation(conversationId: number, labels: string[]): Promise<void> {
    const sanitizedLabels = Array.from(new Set(labels.map(ChatwootClient.sanitizeLabel).filter(Boolean)));
    if (sanitizedLabels.length === 0) return;

    // Garante que cada label exista na conta antes de vincular à conversa
    for (const label of sanitizedLabels) {
      if (!this.knownLabels.has(label.toLowerCase())) {
        try {
          await this.createLabel(label);
        } catch {
          // Se já existir ou falhar pontualmente, prossegue
        }
      }
    }

    await this.request<{payload: string[]}>(`/accounts/${this.accountId}/conversations/${conversationId}/labels`, {
      method: 'POST',
      body: JSON.stringify({labels: sanitizedLabels}),
    });
  }

  /**
   * Registra uma mensagem ou nota privada em uma conversa do Chatwoot.
   * Suporta envio de arquivos binários anexos via multipart/form-data.
   *
   * @spec REQ-MIG-006
   * @param conversationId ID da conversa de destino.
   * @param dto Dados da mensagem a ser criada.
   * @param attachments Lista opcional de anexos binários.
   * @returns Mensagem criada.
   */
  public async createMessage(
    conversationId: number,
    dto: CreateMessageDTO,
    attachments?: MessageAttachmentPayload[]
  ): Promise<ChatwootMessage> {
    if (attachments && attachments.length > 0) {
      const formData = new FormData();
      formData.append('content', dto.content);
      if (dto.message_type) {
        formData.append('message_type', dto.message_type);
      }
      formData.append('private', String(Boolean(dto.private)));
      if (dto.content_type) {
        formData.append('content_type', dto.content_type);
      }
      if (dto.content_attributes) {
        formData.append('content_attributes', JSON.stringify(dto.content_attributes));
      }
      for (const att of attachments) {
        formData.append('attachments[]', att.blob, att.fileName);
      }

      return await this.request<ChatwootMessage>(
        `/accounts/${this.accountId}/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          body: formData,
        }
      );
    }

    return await this.request<ChatwootMessage>(`/accounts/${this.accountId}/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  /**
   * Retorna a URL de visualização da conversa no painel do Chatwoot dentro da caixa de entrada configurada.
   *
   * @spec REQ-MIG-011
   * @param conversationId ID da conversa no Chatwoot.
   * @returns URL web da conversa (ex: https://app.chatwoot.com/app/accounts/1/inbox/1/conversations/100).
   */
  public getConversationWebUrl(conversationId: number): string {
    const rootUrl = this.baseUrl.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
    return `${rootUrl}/app/accounts/${this.accountId}/inbox/${this.inboxId}/conversations/${conversationId}`;
  }

  /**
   * Atualiza os atributos ou status de uma conversa existente no Chatwoot.
   *
   * @spec REQ-MIG-006
   * @spec REQ-MIG-011
   * @param conversationId ID da conversa no Chatwoot.
   * @param data Dados para atualização (custom_attributes, status, etc.).
   */
  public async updateConversation(
    conversationId: number,
    data: {
      custom_attributes?: Record<string, unknown>;
      status?: 'open' | 'resolved' | 'pending';
    }
  ): Promise<void> {
    await this.request(`/accounts/${this.accountId}/conversations/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Altera o status de uma conversa no Chatwoot ('open', 'resolved', 'pending').
   *
   * @spec REQ-MIG-006
   * @param conversationId ID da conversa.
   * @param status Novo status da conversa.
   */
  public async toggleStatus(conversationId: number, status: 'open' | 'resolved' | 'pending'): Promise<void> {
    await this.request<{payload: {current_status: string}}>(
      `/accounts/${this.accountId}/conversations/${conversationId}/toggle_status`,
      {
        method: 'POST',
        body: JSON.stringify({status}),
      }
    );
  }

  /**
   * Retorna o ID da caixa de entrada (inbox) configurada.
   */
  public getInboxId(): number {
    return this.inboxId;
  }
}
