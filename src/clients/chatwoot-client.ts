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

  /**
   * Construtor do ChatwootClient configurado via AppConfig.
   *
   * @param config Configurações validadas do Chatwoot.
   */
  public constructor(config: AppConfig) {
    this.baseUrl = `${config.CHATWOOT_BASE_URL.replace(/\/+$/, '')}/api/v1`;
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
    const headers = {
      api_access_token: this.apiToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
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

    return (await response.json()) as T;
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
    return data.payload ?? [];
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
    const sanitizedLabels = labels.map(ChatwootClient.sanitizeLabel).filter(Boolean);
    if (sanitizedLabels.length === 0) return;
    await this.request<{payload: string[]}>(`/accounts/${this.accountId}/conversations/${conversationId}/labels`, {
      method: 'POST',
      body: JSON.stringify({labels: sanitizedLabels}),
    });
  }

  /**
   * Registra uma mensagem ou nota privada em uma conversa do Chatwoot.
   *
   * @spec REQ-MIG-006
   * @param conversationId ID da conversa de destino.
   * @param dto Dados da mensagem a ser criada.
   * @returns Mensagem criada.
   */
  public async createMessage(conversationId: number, dto: CreateMessageDTO): Promise<ChatwootMessage> {
    return await this.request<ChatwootMessage>(`/accounts/${this.accountId}/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(dto),
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
