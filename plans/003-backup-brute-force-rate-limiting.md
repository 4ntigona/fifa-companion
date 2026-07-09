# Plan 003: Rate-limit and protect backup recovery against brute-forcing

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 52029fe..HEAD -- server/package.json server/src/index.ts server/src/routes/backups.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/002-exclude-api-keys-backups.md
- **Category**: security
- **Planned at**: commit `52029fe`, 2026-07-08

## Why this matters

The server exposes an unauthenticated endpoint at `/api/backups/recover/:code` using 6-character alphanumeric backup keys. Since there are no rate limits on the endpoint, malicious actors can easily run brute-force query scripts to retrieve other users' entire career progression databases. Adding global and route-specific rate limiting via `@fastify/rate-limit` prevents brute-force sweeps.

## Current state

- Relevant files:
  - `server/package.json` — Fastify backend dependencies.
  - `server/src/index.ts` — Fastify server configuration and initialization.
  - `server/src/routes/backups.ts` — recovery GET route handler.

- Excerpts:
  - `server/src/index.ts` lines 21-25:
    ```typescript
    const app = Fastify({ logger: true })

    await app.register(cors, { origin: true })
    await app.register(multipart, { attachFieldsToBody: false })
    ```
  - `server/src/routes/backups.ts` lines 43-49:
    ```typescript
    app.get<{ Params: { code: string } }>('/api/backups/recover/:code', async (req, reply) => {
      const code = req.params.code.trim().toUpperCase()
      if (!code) {
        return reply.code(400).send({ error: 'Código de backup inválido.' })
      }
    ```

## Commands you will need

| Purpose   | Command                                         | Expected on success |
|-----------|-------------------------------------------------|---------------------|
| Install   | `npm install @fastify/rate-limit --workspace server` | package installed with exit 0 |
| Build     | `npm run build`                                 | exit 0              |

## Scope

**In scope**:
- `server/package.json`
- `server/src/index.ts`
- `server/src/routes/backups.ts`

**Out of scope**:
- Modifying SQLite backup storage schemas.
- Changing frontend sync page visual layout.

## Git workflow

- Branch: `advisor/003-backup-brute-force-rate-limiting`
- Commit message: `sec: install fastify-rate-limit and restrict recover endpoint`

## Steps

### Step 1: Install rate limiting package
Run the install command to install `@fastify/rate-limit` inside the server workspace:
```bash
npm install @fastify/rate-limit --workspace server
```

**Verify**: Check that `"@fastify/rate-limit"` is present in `server/package.json` under dependencies.

### Step 2: Register rate-limiter in Fastify server
In `server/src/index.ts`, import the rate limiting plugin and register it:
```typescript
import rateLimit from '@fastify/rate-limit'
// ...
const app = Fastify({ logger: true })

await app.register(cors, { origin: true })
await app.register(multipart, { attachFieldsToBody: false })
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
})
```

**Verify**: The project builds successfully with `npm run build`.

### Step 3: Configure strict limits for the recovery endpoint
In `server/src/routes/backups.ts`, restrict the `/api/backups/recover/:code` endpoint to a maximum of 5 requests per minute per IP address:
```typescript
  app.get<{ Params: { code: string } }>(
    '/api/backups/recover/:code',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    async (req, reply) => {
      const code = req.params.code.trim().toUpperCase()
      // ... rest of the handler
```

**Verify**: The project builds successfully with `npm run build`.

### Step 4: Run build verification
Confirm the typescript project compiles.

**Verify**: `npm run build` returns exit code 0.

## Done criteria

- [ ] `@fastify/rate-limit` dependency is present in `server/package.json`.
- [ ] Global rate limiting (100 reqs/min) registered in `server/src/index.ts`.
- [ ] Route `/api/backups/recover/:code` configured with max 5 reqs/min limit.
- [ ] `npm run build` exits with code 0.

## STOP conditions

- If the server crashes or hangs during startup tests on VM due to rate-limit cache driver errors.
- If Fastify types complain about `config.rateLimit` on route handlers.

## Maintenance notes

- Local environments should have rate limiting disabled or relaxed during automated frontend tests.
