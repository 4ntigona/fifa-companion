# Plan 010: Establish a test suite with Vitest

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 52029fe..HEAD -- package.json server/package.json web/package.json`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `52029fe`, 2026-07-08

## Why this matters

The codebase currently has no automated tests. This makes it risky to change data parsing structures, database serialization patterns, or security sanitization logic, as regressions can only be caught by manual interaction. Installing `vitest` and writing initial unit tests on core utility libraries (e.g. euro formatting, version labeling, and OCR JSON block extractors) provides a verification baseline.

## Current state

- Relevant files:
  - `package.json` — root workspace configurations.
  - `server/package.json` — backend dependencies.
  - `web/package.json` — frontend dependencies.
  - `web/src/api/client.ts` — contains frontend helper utilities (`fmtEur`, `versionLabel`).
  - `server/src/vision/analyze.ts` — contains the OCR regex JSON extraction logic.

## Commands you will need

| Purpose   | Command                                         | Expected on success |
|-----------|-------------------------------------------------|---------------------|
| Install   | `npm install vitest --workspace server`         | package installed with exit 0 |
| Install   | `npm install vitest --workspace web`            | package installed with exit 0 |
| Test      | `npm run test`                                  | runs tests and all pass |

## Scope

**In scope**:
- `package.json`
- `server/package.json`
- `web/package.json`
- `web/src/api/client.test.ts` (create)
- `server/src/vision/analyze.test.ts` (create)

**Out of scope**:
- Setting up visual browser E2E tests (Playwright).
- Modifying SQLite database file paths or schemas.

## Git workflow

- Branch: `advisor/010-setup-test-suite`
- Commit message: `test: configure vitest and add initial unit tests for helpers`

## Steps

### Step 1: Install Vitest in workspaces
Install `vitest` in both the server and web workspaces as a devDependency:
```bash
npm install vitest -D --workspace server
npm install vitest -D --workspace web
```

**Verify**: Vitest is listed in `server/package.json` and `web/package.json` under `devDependencies`.

### Step 2: Configure test scripts
Add test script commands to packages:
1. In the root `package.json` scripts:
   ```json
   "test": "npm run test --workspace server && npm run test --workspace web"
   ```
2. In `server/package.json` scripts:
   ```json
   "test": "vitest run"
   ```
3. In `web/package.json` scripts:
   ```json
   "test": "vitest run"
   ```

**Verify**: Check package configuration updates.

### Step 3: Write frontend helper unit tests
Create `web/src/api/client.test.ts` to test the formatting helpers:
```typescript
import { describe, it, expect } from 'vitest'
import { fmtEur, versionLabel } from './client'

describe('Formatting Utilities', () => {
  describe('fmtEur', () => {
    it('formats numbers correctly into currency labels', () => {
      expect(fmtEur(null)).toBe('—')
      expect(fmtEur(undefined)).toBe('—')
      expect(fmtEur(500)).toBe('€500')
      expect(fmtEur(1500)).toBe('€2K')
      expect(fmtEur(2300000)).toBe('€2.3M')
    })
  })

  describe('versionLabel', () => {
    it('applies correct FIFA vs FC prefix', () => {
      expect(versionLabel(16)).toBe('FIFA 16')
      expect(versionLabel(23)).toBe('FIFA 23')
      expect(versionLabel(24)).toBe('FC 24')
    })
  })
})
```

**Verify**: Run `npm run test --workspace web` and confirm all checks pass.

### Step 4: Write backend JSON parsing unit tests
Create `server/src/vision/analyze.test.ts` to test JSON block extraction boundaries:
```typescript
import { describe, it, expect } from 'vitest'

// Helper extractor extracted from server/src/vision/analyze.ts
function extractJsonBlock(text: string): any {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON')
  return JSON.parse(text.slice(start, end + 1))
}

describe('OCR JSON Extraction Helper', () => {
  it('correctly slices surrounding markdown block text', () => {
    const markdownOutput = 'Here is the data:\n```json\n{"screenType": "elenco", "players": []}\n```\nHope this helps!'
    const parsed = extractJsonBlock(markdownOutput)
    expect(parsed.screenType).toBe('elenco')
    expect(parsed.players).toBeTypeOf('object')
  })

  it('throws error when no brackets are present', () => {
    expect(() => extractJsonBlock('plain text output')).toThrow()
  })
})
```

**Verify**: Run `npm run test --workspace server` and confirm all checks pass.

### Step 5: Verify global test runner
Run the full test suite from the root package.

**Verify**: `npm run test` exits 0 and runs all tests successfully.

## Done criteria

- [ ] `vitest` configured in both server and web workspaces.
- [ ] Root package contains the combined `"test"` script.
- [ ] Frontend unit tests for `fmtEur` and `versionLabel` pass successfully.
- [ ] Backend unit tests for JSON extraction block boundary parser pass successfully.
- [ ] `npm run test` executes successfully and reports zero failed tests.

## STOP conditions

- If workspace compiler errors occur due to missing TS node environments or ES Module resolving settings inside test execution contexts.

## Maintenance notes

- Any future OCR prompt modifications should update the mock parsing test strings here.
