# Plan 008: Add standard linting and formatting configurations

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 52029fe..HEAD -- package.json`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `52029fe`, 2026-07-08

## Why this matters

The repository lacks ESLint or Prettier configurations, meaning code formatting is inconsistent and syntax checks are not automated. Adding standard tooling configurations prevents formatting drift, ensures clean commits, and improves developer velocity by catching issues early.

## Current state

- Relevant files:
  - `package.json` — root package settings.
  - `.prettierrc` — does not exist.
  - `eslint.config.js` — does not exist.

## Commands you will need

| Purpose   | Command                                         | Expected on success |
|-----------|-------------------------------------------------|---------------------|
| Install   | `npm install eslint prettier -D`                | packages installed with exit 0 |
| Format    | `npx prettier --write "server/src/**/*.ts" "web/src/**/*.{ts,tsx}"` | formats files successfully |

## Scope

**In scope**:
- `package.json`
- `.prettierrc` (create)
- `eslint.config.js` (create)

**Out of scope**:
- Rewriting codebase logic.
- Adding pre-commit husky hooks.

## Git workflow

- Branch: `advisor/008-lint-format-config`
- Commit message: `dx: add eslint and prettier configurations`

## Steps

### Step 1: Install devDependencies
Run the command to install `eslint` and `prettier` globally at the root:
```bash
npm install eslint prettier eslint-plugin-react eslint-plugin-react-hooks @typescript-eslint/parser @typescript-eslint/eslint-plugin -D
```

**Verify**: Check that the packages are listed under `devDependencies` in the root `package.json`.

### Step 2: Create Prettier configuration
Create a `.prettierrc` file in the repository root with these formatting settings (matching the codebase's semi-less SingleQuote conventions):
```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 120,
  "tabWidth": 2
}
```

**Verify**: The file exists at `.prettierrc`.

### Step 3: Create ESLint configuration
Create an `eslint.config.js` file (using the modern ESLint flat config format) at the root:
```javascript
import js from '@eslint/js'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/data/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': ts,
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      'no-unused-vars': 'off',
      'react/react-in-jsx-scope': 'off',
    },
  },
]
```

**Verify**: The file exists at `eslint.config.js`.

### Step 4: Run format command
Format all code files:
```bash
npx prettier --write "server/src/**/*.ts" "web/src/**/*.{ts,tsx}"
```

**Verify**: Files are formatted.

## Done criteria

- [ ] `eslint` and `prettier` installed as devDependencies in root `package.json`.
- [ ] `.prettierrc` created with correct formatting rules.
- [ ] `eslint.config.js` created and ignores compiled/build assets.
- [ ] Prettier formatting command runs successfully without errors.

## STOP conditions

- If package installation fails due to dependency conflicts.

## Maintenance notes

- None.
