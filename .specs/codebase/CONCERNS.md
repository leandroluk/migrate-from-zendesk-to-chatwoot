# Architectural Concerns & Risks

## 1. Rate Limiting
- **Zendesk API Limits**: Zendesk enforces rate limits based on subscription tier (typically 700 requests/minute on Enterprise, lower on Team/Suite Growth).
- **Chatwoot API Limits**: Self-hosted Chatwoot or Chatwoot Cloud can rate-limit conversation/message creation.
- **Mitigation**: Introduce throttling / sleep delays between tickets and handle HTTP 429 status codes with `Retry-After`.

## 2. Conversation Message Ordering & Authorship
- Chatwoot conversation creation requires an initial message or contact.
- When creating subsequent messages via API, message timestamp in Chatwoot might default to current time unless handled or clearly attributed in the message body if historical timestamps are not directly overridable.
- **Mitigation**: Prepend header to migrated comments, e.g., `[Migrated from Zendesk | Date: YYYY-MM-DD | Author: John Doe]`.

## 3. Large Ticket Volumes with `*`
- When `MIGRATION_TICKET_ID=*`, migrating hundreds or thousands of tickets without interruption requires batching and fault tolerance.
- **Mitigation**: Process in batches, log each processed ticket ID, and keep running on errors.
