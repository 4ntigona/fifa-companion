# Plan 006: Deduplicate default model and provider configs on the client

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 52029fe..HEAD -- web/src/store.ts web/src/pages/Home.tsx`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `52029fe`, 2026-07-08

## Why this matters

The default AI models (e.g. `gpt-4o` / `gpt-5.1`) and display labels (e.g. `Anthropic (Claude)`) are currently defined in three separate files: on the server (`server/src/settings.ts`), in the client data store (`web/src/store.ts`), and inline in the dashboard view (`web/src/pages/Home.tsx`). This duplication increases risk of drift (e.g. updating model versions in one file but leaving stale strings in another). Consolidating the client configurations into `web/src/store.ts` and importing them in `Home.tsx` reduces redundancy.

## Current state

- Relevant files:
  - `web/src/store.ts` — contains exported model configuration objects.
  - `web/src/pages/Home.tsx` — contains inline model/provider string fallbacks.

- Excerpts:
  - `web/src/store.ts` lines 15-27:
    ```typescript
    export const PROVIDER_LABELS: Record<AiProvider, string> = {
      anthropic: 'Anthropic (Claude)',
      openai: 'OpenAI (ChatGPT)',
      gemini: 'Google Gemini',
      openrouter: 'OpenRouter',
    }

    export const DEFAULT_MODELS: Record<AiProvider, string> = {
      anthropic: 'claude-sonnet-5',
      openai: 'gpt-5.1', // Note: Will be gpt-4o after Plan 001
      gemini: 'gemini-2.5-flash',
      openrouter: 'google/gemini-2.5-flash',
    }
    ```
  - `web/src/pages/Home.tsx` lines 60-61:
    ```typescript
    const providerLabel = localActiveProvider === 'anthropic' ? 'Anthropic (Claude)' : localActiveProvider === 'openai' ? 'OpenAI (ChatGPT)' : localActiveProvider === 'gemini' ? 'Google Gemini' : 'OpenRouter'
    const modelLabel = ai.models[localActiveProvider] || (localActiveProvider === 'anthropic' ? 'claude-sonnet-5' : localActiveProvider === 'openai' ? 'gpt-5.1' : localActiveProvider === 'gemini' ? 'gemini-2.5-flash' : 'google/gemini-2.5-flash')
    ```

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Build     | `npm run build`  | exit 0, compiles successfully |

## Scope

**In scope**:
- `web/src/store.ts`
- `web/src/pages/Home.tsx`

**Out of scope**:
- Changing server settings endpoints.
- Modifying settings forms.

## Git workflow

- Branch: `advisor/006-duplicate-ai-model-dedup`
- Commit message: `refactor: deduplicate default model mapping configurations on client`

## Steps

### Step 1: Export config helpers from store.ts
Ensure `PROVIDER_LABELS` and `DEFAULT_MODELS` are correctly exported in `web/src/store.ts`. (They are already exported).

### Step 2: Use store exports in Home.tsx
In `web/src/pages/Home.tsx`, import `PROVIDER_LABELS` and `DEFAULT_MODELS` from `../store`:
```typescript
import { listCareers, getAiSettings, PROVIDER_LABELS, DEFAULT_MODELS } from '../store'
```

Then, replace the inline nested ternary checks with the imported object mappings:
```typescript
  const ai = getAiSettings()
  const localActiveProvider = ai.activeProvider
  const localHasKey = Boolean(ai.keys[localActiveProvider])
  const providerLabel = PROVIDER_LABELS[localActiveProvider]
  const modelLabel = ai.models[localActiveProvider] || DEFAULT_MODELS[localActiveProvider]
```

**Verify**: The project builds successfully with `npm run build`.

### Step 3: Run full project compilation check
Verify the client compiles without errors.

**Verify**: `npm run build` exits with code 0.

## Done criteria

- [ ] Inline ternaries for labels/models in `web/src/pages/Home.tsx` are replaced with imports from `store.ts`.
- [ ] No duplicate model configuration definitions exist on client pages.
- [ ] `npm run build` exits 0.

## STOP conditions

- If import routes fail compilation due to package workspace resolution.

## Maintenance notes

- Future model version changes should be done strictly in `web/src/store.ts` and `server/src/settings.ts`.
