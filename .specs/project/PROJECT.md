# Project: Zendesk to Chatwoot Migration Tool

Traceability: on

## Overview

Tool to migrate tickets, conversation threads, contacts, and metadata from Zendesk to Chatwoot.

## Objectives

- Extract tickets and conversation history from Zendesk REST API.
- Filter and target migrations by a specific ticket ID or batch migrate all tickets (`*`).
- Reconcile or create contacts in Chatwoot matching Zendesk requesters.
- Create conversations in Chatwoot matching Zendesk tickets, mapping status and custom metadata.
- Replay comments in chronological order preserving public messages and internal notes.
- Provide clear logging, error resilience, and dry-run capability.

## Tech Stack

- TypeScript + Node.js (ESNext / NodeNext)
- Fast toolchain: oxlint (linter) and oxfmt (formatter)
- Config & validation: dotenv + zod
- Runner: tsx
