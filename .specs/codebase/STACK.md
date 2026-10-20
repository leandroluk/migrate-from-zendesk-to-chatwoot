# Tech Stack

## Runtime & Language

- **Node.js**: v26+
- **TypeScript**: v7.0 (target ES2022, module NodeNext)
- **Package Manager**: pnpm

## Toolchain

- **Linter**: `oxlint` (Oxc fast Rust-based linter)
- **Formatter**: `oxfmt` (Oxc fast formatter)
- **Execution**: `tsx` (TypeScript execute without manual build step for development)
- **Compiler**: `tsc` (for type checking and build)

## Core Libraries

- **dotenv**: Environment variable loader (.env)
- **zod**: Schema validation for environment and external API payloads
- **Native fetch**: HTTP requests to Zendesk and Chatwoot APIs
