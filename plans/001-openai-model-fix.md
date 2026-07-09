# Plan 001: Correct default OpenAI model to `gpt-4o`

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 52029fe..HEAD -- server/src/settings.ts web/src/store.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `52029fe`, 2026-07-08

## Why this matters

The application sets the default model for the OpenAI provider to `gpt-5.1`. Since this model does not exist in the OpenAI API, selecting OpenAI as the AI provider in Settings and attempting to upload/analyze an screen capture results in immediate API request failure (HTTP 404/400). Correcting this to a valid, widely available vision model like `gpt-4o` restores functionality for OpenAI users.

## Current state

- Relevant files:
  - `server/src/settings.ts` — contains server-side default model mappings.
  - `web/src/store.ts` — contains client-side default model mappings.

- Excerpts:
  - `server/src/settings.ts` line 34:
    ```typescript
    export const DEFAULT_MODELS: Record<AiProvider, string> = {
      anthropic: process.env.VISION_MODEL || 'claude-sonnet-5',
      openai: 'gpt-5.1',
      gemini: 'gemini-2.5-flash',
      openrouter: 'google/gemini-2.5-flash',
    }
    ```
  - `web/src/store.ts` line 24:
    ```typescript
    export const DEFAULT_MODELS: Record<AiProvider, string> = {
      anthropic: 'claude-sonnet-5',
      openai: 'gpt-5.1',
      gemini: 'gemini-2.5-flash',
      openrouter: 'google/gemini-2.5-flash',
    }
    ```

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Build     | `npm run build`  | exit 0, compiles successfully |

## Scope

**In scope**:
- `server/src/settings.ts`
- `web/src/store.ts`

**Out of scope**:
- Changing providers or adding new providers.
- Modifying client settings loading logic.

## Git workflow

- Branch: `advisor/001-openai-model-fix`
- Commit message: `fix: change default OpenAI model to gpt-4o`

## Steps

### Step 1: Update server configuration
In `server/src/settings.ts`, replace the value of `openai` in `DEFAULT_MODELS` from `'gpt-5.1'` to `'gpt-4o'`.

**Verify**: Check that `git diff server/src/settings.ts` shows the change from `'gpt-5.1'` to `'gpt-4o'`.

### Step 2: Update client configuration
In `web/src/store.ts`, replace the value of `openai` in `DEFAULT_MODELS` from `'gpt-5.1'` to `'gpt-4o'`.

**Verify**: Check that `git diff web/src/store.ts` shows the change from `'gpt-5.1'` to `'gpt-4o'`.

### Step 3: Verify build
Compile the project to confirm that no TypeScript errors were introduced.

**Verify**: `npm run build` runs successfully.

## Done criteria

- [ ] `DEFAULT_MODELS` in `server/src/settings.ts` maps `openai` to `'gpt-4o'`.
- [ ] `DEFAULT_MODELS` in `web/src/store.ts` maps `openai` to `'gpt-4o'`.
- [ ] `npm run build` exits with code 0.

## STOP conditions

- If `DEFAULT_MODELS` does not exist or matches different providers/keys in `server/src/settings.ts` or `web/src/store.ts`.
- If the build fails after making the substitutions.

## Maintenance notes

- When newer OpenAI vision models become the industry standard, these defaults should be updated in sync.
