# Plan 002: Exclude API Keys from exported and synced backups

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 52029fe..HEAD -- web/src/store.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `52029fe`, 2026-07-08

## Why this matters

The application stores user-configured Anthropic, OpenAI, Gemini, and OpenRouter API keys in browser `localStorage`. When a user exports their data to a JSON backup file or generates a 6-character cloud synchronization code, the entire `localStorage` payload—including the `ai.keys` cleartext object—is serialized and exported or stored on the VPS database. This leaks private API credentials. By sanitizing the keys object prior to export/sync, and preserving existing local keys during import, keys remain secure.

## Current state

- Relevant file:
  - `web/src/store.ts` — client-side database management, import/export, and backup syncing routines.

- Excerpts from `web/src/store.ts`:
  - Lines 390-398 (`exportBackup`):
    ```typescript
    export function exportBackup() {
      const db = load()
      const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `career-companion-backup-${nowIso().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
    }
    ```
  - Lines 400-408 (`importBackup`):
    ```typescript
    export async function importBackup(file: File): Promise<{ careers: number; players: number }> {
      const text = await file.text()
      const data = JSON.parse(text) as LocalDb
      if (data?.version !== 1 || !Array.isArray(data.careers) || !Array.isArray(data.careerPlayers)) {
        throw new Error('Arquivo de backup inválido (formato não reconhecido).')
      }
      save({ ...emptyDb(), ...data, ai: { ...emptyDb().ai, ...data.ai } })
      return { careers: data.careers.length, players: data.careerPlayers.length }
    }
    ```
  - Lines 414-432 (`shareBackupOnServer` and `recoverBackupFromServer`):
    ```typescript
    export async function shareBackupOnServer(): Promise<string> {
      const db = load()
      const res = await api<{ code: string }>('/api/backups/share', {
        method: 'POST',
        body: JSON.stringify(db),
      })
      return res.code
    }

    export async function recoverBackupFromServer(code: string): Promise<{ careers: number; players: number }> {
      const cleanCode = code.trim().toUpperCase()
      if (!cleanCode) throw new Error('Por favor, informe um código de backup válido.')
      const data = await api<LocalDb>(`/api/backups/recover/${cleanCode}`)
      if (data?.version !== 1 || !Array.isArray(data.careers) || !Array.isArray(data.careerPlayers)) {
        throw new Error('O backup recuperado do servidor possui formato inválido.')
      }
      save({ ...emptyDb(), ...data, ai: { ...emptyDb().ai, ...data.ai } })
      return { careers: data.careers.length, players: data.careerPlayers.length }
    }
    ```

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Build     | `npm run build`  | exit 0, compiles successfully |

## Scope

**In scope**:
- `web/src/store.ts`

**Out of scope**:
- Modifying settings UI files.
- Changing server-side `/api/backups/share` payload handling.

## Git workflow

- Branch: `advisor/002-exclude-api-keys-backups`
- Commit message: `sec: sanitize and exclude api keys from exported and shared backups`

## Steps

### Step 1: Strip API keys during export
In `web/src/store.ts` (`exportBackup`), clone the database state and clear the keys object before serializing:
```typescript
export function exportBackup() {
  const db = load()
  const cleanDb = { ...db, ai: { ...db.ai, keys: {} } }
  const blob = new Blob([JSON.stringify(cleanDb, null, 2)], { type: 'application/json' })
  // ... rest of downloading logic
}
```

### Step 2: Strip API keys during server sharing
In `web/src/store.ts` (`shareBackupOnServer`), do the same:
```typescript
export async function shareBackupOnServer(): Promise<string> {
  const db = load()
  const cleanDb = { ...db, ai: { ...db.ai, keys: {} } }
  const res = await api<{ code: string }>('/api/backups/share', {
    method: 'POST',
    body: JSON.stringify(cleanDb),
  })
  return res.code
}
```

### Step 3: Preserve existing browser API keys during backup file import
In `web/src/store.ts` (`importBackup`), fetch the current database state from the browser first and preserve the `keys` object when writing the imported database:
```typescript
export async function importBackup(file: File): Promise<{ careers: number; players: number }> {
  const text = await file.text()
  const data = JSON.parse(text) as LocalDb
  if (data?.version !== 1 || !Array.isArray(data.careers) || !Array.isArray(data.careerPlayers)) {
    throw new Error('Arquivo de backup inválido (formato não reconhecido).')
  }
  const current = load()
  save({
    ...emptyDb(),
    ...data,
    ai: {
      ...emptyDb().ai,
      ...data.ai,
      keys: current.ai.keys, // preserve keys local to this client
    },
  })
  return { careers: data.careers.length, players: data.careerPlayers.length }
}
```

### Step 4: Preserve existing browser API keys during cloud recovery
In `web/src/store.ts` (`recoverBackupFromServer`), apply the exact same key preservation technique:
```typescript
export async function recoverBackupFromServer(code: string): Promise<{ careers: number; players: number }> {
  const cleanCode = code.trim().toUpperCase()
  if (!cleanCode) throw new Error('Por favor, informe um código de backup válido.')
  const data = await api<LocalDb>(`/api/backups/recover/${cleanCode}`)
  if (data?.version !== 1 || !Array.isArray(data.careers) || !Array.isArray(data.careerPlayers)) {
    throw new Error('O backup recuperado do servidor possui formato inválido.')
  }
  const current = load()
  save({
    ...emptyDb(),
    ...data,
    ai: {
      ...emptyDb().ai,
      ...data.ai,
      keys: current.ai.keys, // preserve keys local to this client
    },
  })
  return { careers: data.careers.length, players: data.careerPlayers.length }
}
```

### Step 5: Verify build
Build the client workspace.

**Verify**: `npm run build` exits 0.

## Done criteria

- [ ] `exportBackup` writes backup JSONs with an empty `keys` object.
- [ ] `shareBackupOnServer` sends backup JSONs with an empty `keys` object.
- [ ] `importBackup` successfully loads data but keeps the client's current `ai.keys` unchanged.
- [ ] `recoverBackupFromServer` successfully loads data but keeps the client's current `ai.keys` unchanged.
- [ ] `npm run build` exits 0.

## STOP conditions

- If the typescript compiler objects to the cloned database structures or type definitions.
- If testing imports manually indicates that other data (careers, prospects) fails to overwrite correctly.

## Maintenance notes

- Any new secrets stored in `localStorage` in the future must be added to the sanitization process in `exportBackup` and `shareBackupOnServer`.
