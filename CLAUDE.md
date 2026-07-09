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
