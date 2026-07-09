# Plan 009: Create CLAUDE.md developer and agent guide

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git status --porcelain CLAUDE.md`
> If the file exists, compare it against this plan; otherwise proceed.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `52029fe`, 2026-07-08

## Why this matters

When AI coding assistants or new human developers onboard onto the repository, they need quick access to command-line recipes (build, run, lint, database seeding) and coding conventions (code styling, state boundaries, type definitions). Creating a standard `CLAUDE.md` at the root provides this vital instruction set, reducing startup friction and preventing coding style drift.

## Current state

- Relevant file:
  - `CLAUDE.md` — does not exist.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Verify    | `cat CLAUDE.md`  | prints content successfully |

## Scope

**In scope**:
- `CLAUDE.md` (create)

**Out of scope**:
- Modifying other files.

## Git workflow

- Branch: `advisor/009-claude-guide-creation`
- Commit message: `dx: create CLAUDE.md instructions file`

## Steps

### Step 1: Write CLAUDE.md
Create the `CLAUDE.md` file in the root of the project with the following guide content:

```markdown
# FIFA Career Companion Developer Guide

This guide details command references, project structures, and code style patterns for developers and AI agents.

## Build and Run Recipes

*   **Install dependencies**: `npm install`
*   **Run Development Server**:
    *   Backend (Fastify): `npm run dev:server` (API at `http://localhost:3344`)
    *   Frontend (React + Vite): `npm run dev:web` (Client at `http://localhost:5173`)
*   **Production Build**: `npm run build` (compiles server and builds frontend assets into `web/dist`)
*   **Database Seeding**: `npm run import:data -- <version>` (e.g. `npm run import:data -- 16 22` to seed SQLite tables from Kaggle CSVs)

## Code Style & Conventions

*   **JavaScript/TypeScript**: Single quotes, no semicolons, 2-space indentation.
*   **RAID/Zero Border-Radius**: In CSS / Tailwind, all elements must enforce `border-radius: 0 !important` matching the `DESIGN.md` guidelines.
*   **Architecture & State**:
    *   All user career progression data (careers, players, snapshots, shortlist) is stored strictly client-side inside the browser's `localStorage` (managed via `web/src/store.ts`).
    *   The Node.js server database is used for read-only lookups (original game stats imported from Kaggle), proxying OCR capture requests to AI endpoints, and cloud backups.
    *   User API keys must never be stored on the server side or included in synced backups.

## Tech Stack
*   **Frontend**: React, TanStack Query, Recharts, Vite, TailwindCSS (v4).
*   **Backend**: Node.js, Fastify, TypeScript, SQLite (better-sqlite3), Zod.
```

**Verify**: Check that `CLAUDE.md` exists and contains the correct instructions.

## Done criteria

- [ ] `CLAUDE.md` exists at the repository root.
- [ ] Coding rules, build commands, and state architecture are clearly defined.

## STOP conditions

- None.

## Maintenance notes

- Update this file if build tools, API ports, or coding conventions change.
