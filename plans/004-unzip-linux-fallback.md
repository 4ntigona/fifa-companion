# Plan 004: Validate unzip CLI presence with helpful fallback error

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 52029fe..HEAD -- server/src/sofifa/kaggle-download.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `52029fe`, 2026-07-08

## Why this matters

During dataset downloads, the backend fetches zipped Kaggle files and extracts them by executing the system's `unzip` CLI command. If the target system (e.g. a minimal Debian/Ubuntu VPS) does not have `unzip` installed, the spawn process fails with `ENOENT`. The current code does not handle this failure cleanly, printing confusing stack errors. Checking unzip availability beforehand and throwing a clear system requirement diagnostic message drastically improves onboarding and deployment DX.

## Current state

- Relevant file:
  - `server/src/sofifa/kaggle-download.ts` — contains the downloader and unzip subprocess execution logic.

- Excerpt from `server/src/sofifa/kaggle-download.ts` lines 71-80:
    ```typescript
      if (magic[0] === 0x50 && magic[1] === 0x4b) {
        const zipPath = `${dest}.zip`
        renameSync(tmp, zipPath)
        const r = spawnSync('unzip', ['-o', zipPath, '-d', KAGGLE_DIR], { encoding: 'utf-8' })
        rmSync(zipPath, { force: true })
        if (r.status !== 0 || !existsSync(dest)) {
          throw new Error(`Falha ao extrair ${fileName}: ${r.stderr || r.stdout || 'arquivo esperado não encontrado no zip'}`)
        }
      } else {
        renameSync(tmp, dest)
      }
    ```

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Build     | `npm run build`  | exit 0, compiles successfully |

## Scope

**In scope**:
- `server/src/sofifa/kaggle-download.ts`

**Out of scope**:
- Modifying import state or import CLI arguments.
- Adding third-party node-zip extraction modules.

## Git workflow

- Branch: `advisor/004-unzip-linux-fallback`
- Commit message: `fix: add system diagnostic check for unzip command during kaggle dataset download`

## Steps

### Step 1: Add availability check for unzip CLI
In `server/src/sofifa/kaggle-download.ts`, immediately before running `spawnSync('unzip', ...)`, execute a command probe check to see if the command exists on the OS PATH. If it doesn't, throw a clear instruction error:

```typescript
  if (magic[0] === 0x50 && magic[1] === 0x4b) {
    const zipPath = `${dest}.zip`
    renameSync(tmp, zipPath)

    // Verify unzip is installed on the system
    const checkUnzip = spawnSync('unzip', ['-v'])
    if (checkUnzip.error) {
      rmSync(zipPath, { force: true })
      throw new Error(
        `O comando 'unzip' não está instalado no sistema. ` +
        `Instale-o usando 'sudo apt install unzip' (Linux) ou 'brew install unzip' (macOS), ` +
        `ou extraia o arquivo manualmente para a pasta: ${KAGGLE_DIR}`
      )
    }

    const r = spawnSync('unzip', ['-o', zipPath, '-d', KAGGLE_DIR], { encoding: 'utf-8' })
    rmSync(zipPath, { force: true })
```

**Verify**: The project builds successfully with `npm run build`.

### Step 2: Verify typescript build compiles
Build the project using standard commands.

**Verify**: `npm run build` exits 0.

## Done criteria

- [ ] Probe command check `spawnSync('unzip', ['-v'])` integrated before actual zip extraction.
- [ ] Direct warning and instructions thrown if the check fails.
- [ ] Temporary downloaded zip file cleaned up on check failure.
- [ ] `npm run build` exits 0.

## STOP conditions

- If typescript compiler flags `spawnSync` as unresolved (ensure it is correctly imported from `'node:child_process'`).

## Maintenance notes

- None.
