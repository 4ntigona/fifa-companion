# Plan 005: Remove unused server-side state tables and routes

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 52029fe..HEAD -- server/src/index.ts server/src/db/schema.sql server/src/routes/`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `52029fe`, 2026-07-08

## Why this matters

The client application operates entirely on client-side state stored in the browser's `localStorage` (`web/src/store.ts`). It performs no state synchronization or mutations using the server endpoints. However, the server codebase maintains a fully fleshed out database schema and Fastify route endpoints for careers, career players, player snapshots, and prospects. This dead code increases maintenance overhead, file clutter, and cognitive load. Removing these unused files and tables streamlines the backend.

## Current state

- Relevant files:
  - `server/src/index.ts` — server router registrations.
  - `server/src/db/schema.sql` — SQLite database initialization script.
  - `server/src/routes/careers.ts` — unused server career CRUD routes.
  - `server/src/routes/players.ts` — unused server player/snapshot CRUD routes.
  - `server/src/routes/prospects.ts` — unused server prospect/shortlist CRUD routes.

- Excerpts from `server/src/index.ts`:
    - Lines 10-12 (imports):
      ```typescript
      import { careerRoutes } from './routes/careers.js'
      import { playerRoutes } from './routes/players.js'
      import { prospectRoutes } from './routes/prospects.js'
      ```
    - Lines 51-53 (registration):
      ```typescript
      careerRoutes(app)
      playerRoutes(app)
      prospectRoutes(app)
      ```

- Excerpt from `server/src/db/schema.sql` lines 92-154:
    - Tables: `careers`, `career_players`, `player_snapshots`, `prospects`
    - Line 157 (in `captures` table definition):
      ```sql
      career_id INTEGER REFERENCES careers(id) ON DELETE SET NULL,
      ```

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Build     | `npm run build`  | exit 0, compiles successfully |

## Scope

**In scope**:
- Deleting `server/src/routes/careers.ts`
- Deleting `server/src/routes/players.ts`
- Deleting `server/src/routes/prospects.ts`
- Modifying `server/src/index.ts`
- Modifying `server/src/db/schema.sql`

**Out of scope**:
- Deleting any of the database lookup files (`game-data.ts`, `import.ts`, `settings.ts`, `backups.ts`, `captures.ts`).
- Modifying client-side `web/src/store.ts` file structures.

## Git workflow

- Branch: `advisor/005-unused-server-crud-cleanup`
- Commit message: `refactor: clean up unused server-side routes and SQLite tables`

## Steps

### Step 1: Remove unused route registrations from index.ts
In `server/src/index.ts`, delete the imports of `careerRoutes`, `playerRoutes`, and `prospectRoutes` (lines 10-12) and their invocations (lines 51-53).

**Verify**: Compile the project with `npm run build`.

### Step 2: Delete route handler files
Remove the dead files from the filesystem:
- Delete `server/src/routes/careers.ts`
- Delete `server/src/routes/players.ts`
- Delete `server/src/routes/prospects.ts`

**Verify**: The files no longer exist under `server/src/routes/`.

### Step 3: Remove unused tables from database schema
In `server/src/db/schema.sql`, remove the `CREATE TABLE` definitions for `careers`, `career_players`, `player_snapshots`, and `prospects`.
Also, modify the `captures` table definition (lines 155-163) to remove the foreign key reference since the `careers` table will no longer exist:

```sql
CREATE TABLE IF NOT EXISTS captures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id INTEGER,
  file_name TEXT NOT NULL,
  screen_type TEXT,
  extracted_json TEXT,
  applied INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Verify**: Open `server/src/db/schema.sql` and check that the old tables have been removed and the `captures` definition is simplified.

### Step 4: Run full project compilation check
Verify everything compiles fine without typescript import errors.

**Verify**: `npm run build` exits with code 0.

## Done criteria

- [ ] Unused route handler files are deleted from the disk.
- [ ] Router registrations are cleaned up in `server/src/index.ts`.
- [ ] Unused database tables are dropped from `server/src/db/schema.sql`.
- [ ] Foreign key constraint in the `captures` table schema is removed.
- [ ] `npm run build` exits 0.

## STOP conditions

- If compiling flags references to any deleted router files in other files.
- If deleting these tables causes runtime startup issues on a fresh database generation.

## Maintenance notes

- If server-side backup syncing or state management is implemented in the future, these schema designs can be restored or redeployed in a more consolidated manner.
