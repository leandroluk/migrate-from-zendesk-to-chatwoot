# Integrations

## Zendesk API

- Base URL format: `https://{subdomain}.zendesk.com/api/v2`
- Authentication: Basic auth with `{email}/token:{api_token}` encoded in base64.
- Endpoints used:
  - `GET /api/v2/tickets/{id}.json`: Fetch single ticket
  - `GET /api/v2/tickets.json`: List tickets (paginated)
  - `GET /api/v2/tickets/{id}/comments.json`: Fetch all comments for a ticket
  - `GET /api/v2/users/{id}.json`: Fetch user/requester profile (name, email)

## Chatwoot API

- Base URL format: `{CHATWOOT_BASE_URL}/api/v1`
- Authentication: Header `api_access_token: {token}`
- Endpoints used:
  - `POST /api/v1/accounts/{account_id}/contacts`: Create or update contact
  - `GET /api/v1/accounts/{account_id}/contacts/search?q={email}`: Find contact by email
  - `POST /api/v1/accounts/{account_id}/conversations`: Create conversation under inbox
  - `POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages`: Post messages/comments (supports `private: true` for internal notes)
  - `POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/toggle_status`: Set conversation status (`open`, `resolved`, `pending`)
