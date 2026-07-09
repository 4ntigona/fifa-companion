# Plan 011: Create automated VPS deployment script

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 52029fe..HEAD -- DEPLOY.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx/devops
- **Planned at**: commit `86d9be7`, 2026-07-09

## Why this matters

Deploying or redeploying the application on the VPS involves running several manual shell commands: updating git, preserving data directories, verifying unzip/pm2 system dependencies, rebuilding the workspaces, and restarting PM2. If these commands are executed incorrectly (e.g. erasing the unlinked `server/data` database folder), data loss or runtime downtime will occur. Creating a robust, interactive shell script (`deploy-vps.sh`) at the root automates this sequence safely.

## Current state

- Relevant files:
  - `DEPLOY.md` — contains manual deployment guidelines.
  - `deploy-vps.sh` — does not exist.

## Commands you will need

| Purpose   | Command                        | Expected on success |
|-----------|--------------------------------|---------------------|
| Executable| `chmod +x deploy-vps.sh`       | exit 0              |
| Test Run  | `./deploy-vps.sh --dry-run`    | displays sequence steps successfully |

## Scope

**In scope**:
- `deploy-vps.sh` (create at root)
- `DEPLOY.md` (minor addition pointing to script)

**Out of scope**:
- Modifying node-server configs.
- Automating Nginx or CloudPanel reverse proxy configurations.

## Git workflow

- Branch: `advisor/011-vps-deployment-script`
- Commit message: `feat: add deploy-vps.sh script for automated PM2 deployments`

## Steps

### Step 1: Create deploy-vps.sh script
Create the file `deploy-vps.sh` in the root of the project with a robust deployment script that handles:
- Interactive confirmation.
- Safe folder backups to `/home/fifa-companion/persistent_data` if a local `server/data` exists before clearing the project path.
- Symlink verification and mapping.
- Project compilation.
- PM2 reload/restart.

```bash
#!/bin/bash
set -e

PERSISTENT_DIR="/home/fifa-companion/persistent_data"
PROJECT_DIR="$(pwd)"
APP_NAME="fifa-companion"

echo "=================================================="
echo "    FIFA Companion VPS Auto-Deploy Script         "
echo "=================================================="

# Check requirements
for cmd in node npm pm2 unzip; do
    if ! command -v $cmd &> /dev/null; then
        echo "Erro: '$cmd' não está instalado. Por favor, instale-o antes de prosseguir."
        exit 1
    fi
done

# Confirm action
read -p "Deseja iniciar a atualização/instalação por cima da versão atual? (s/N): " confirm
if [[ ! "$confirm" =~ ^[sS]$ ]]; then
    echo "Operação abortada pelo usuário."
    exit 0
fi

echo "-> Verificando integridade da pasta persistente..."
mkdir -p "$PERSISTENT_DIR/captures"

# Safe migration: if a physical directory server/data/ exists (not a symlink), copy its contents
if [ -d "$PROJECT_DIR/server/data" ] && [ ! -L "$PROJECT_DIR/server/data" ]; then
    echo "-> MIGRANDO: Pasta física server/data encontrada. Copiando para local persistente..."
    cp -r "$PROJECT_DIR/server/data/"* "$PERSISTENT_DIR/"
    rm -rf "$PROJECT_DIR/server/data"
fi

# Recreate symlink if missing
if [ ! -L "$PROJECT_DIR/server/data" ]; then
    echo "-> Criando link simbólico para a pasta persistente..."
    rm -rf "$PROJECT_DIR/server/data" # Ensure no duplicate folder blocks symlink
    ln -s "$PERSISTENT_DIR" "$PROJECT_DIR/server/data"
fi

echo "-> Atualizando repositório Git..."
git pull origin vps-deploy-persistence-setup || echo "Aviso: Git pull falhou ou não configurado. Continuando com arquivos locais..."

echo "-> Instalando dependências npm..."
npm install

echo "-> Compilando frontend e backend..."
npm run build

echo "-> Gerenciando processo PM2..."
if pm2 show "$APP_NAME" &> /dev/null; then
    echo "-> Reiniciando aplicação existente com PM2..."
    pm2 restart "$APP_NAME"
else
    echo "-> Iniciando nova aplicação com PM2..."
    pm2 start server/dist/index.js --name "$APP_NAME" --env NODE_ENV=production
    pm2 save
fi

echo "=================================================="
echo "    DEPLOY CONCLUÍDO COM SUCESSO!                 "
echo "=================================================="
```

**Verify**: Make the script executable (`chmod +x deploy-vps.sh`) and verify no syntax/lint errors are present.

### Step 2: Reference script in DEPLOY.md
Add a note at the top of `DEPLOY.md` explaining that they can run `./deploy-vps.sh` to automate all of these manual deployment steps in one command.

**Verify**: Diff of `DEPLOY.md` shows the addition.

## Done criteria

- [ ] `deploy-vps.sh` created at project root.
- [ ] Script made executable via permissions.
- [ ] Safe copy migrations integrated to prevent data loss.
- [ ] PM2 reload/restart logic configured.
- [ ] Guide in `DEPLOY.md` updated to document the script.

## STOP conditions

- If the script contains relative directories that might resolve outside the home folder context during run.

## Maintenance notes

- None.
