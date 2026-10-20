# Testing & Quality Gates

## Quality Commands

All tasks and commits must pass the following quality gate before being marked complete:

```bash
# Typecheck
pnpm run build

# Linting
pnpm run lint

# Formatting check
pnpm run format:check
```

## Running the POC

```bash
# Run in development mode
pnpm run dev
```
