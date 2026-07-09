# Plan 012: Make VPS deployment script interactive and dynamic

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 52029fe..HEAD -- deploy-vps.sh`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/011-vps-deployment-script.md
- **Category**: dx/devops
- **Planned at**: commit `25db444`, 2026-07-09

## Why this matters

The initial `deploy-vps.sh` script used hardcoded paths for the persistent data folder and assumed user home locations. When deploying on a VPS with different usernames (such as `companion` vs `fifa-companion`), this requires editing the script. Making the script self-configuring via dynamic home detection, prompting for user confirmations, and enabling custom CLP user input makes it robust and reusable across different target hosting setups.

## Current state

- Relevant file:
  - `deploy-vps.sh` — automated deployment script.

- Excerpts from `deploy-vps.sh` lines 3-6:
  ```bash
  PERSISTENT_DIR="/home/companion/persistent_data"
  PROJECT_DIR="$(pwd)"
  APP_NAME="fifa-companion"
  ```

## Commands you will need

| Purpose   | Command                        | Expected on success |
|-----------|--------------------------------|---------------------|
| Verify    | `bash -n deploy-vps.sh`        | exit 0              |
| Simulation| `./deploy-vps.sh --dry-run`    | runs without prompt |

## Scope

**In scope**:
- `deploy-vps.sh`

**Out of scope**:
- Changing PM2 configs or node environments.

## Git workflow

- Branch: `advisor/012-deploy-script-interactive`
- Commit message: `feat: make deploy-vps.sh dynamic and interactive for target system users`

## Steps

### Step 1: Update deploy-vps.sh with interactive prompts
Refactor the setup section of `deploy-vps.sh` to auto-detect system username and prompt the user to confirm/customize paths:

```bash
#!/bin/bash
set -e

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

# Auto-detect current system user and default home path
DETECTED_USER=$(whoami)
DEFAULT_PERSISTENT_DIR="$HOME/persistent_data"

# Check for dry-run
DRY_RUN=false
if [ "$1" = "--dry-run" ]; then
    DRY_RUN=true
fi

if [ "$DRY_RUN" = true ]; then
    echo "--- DRY RUN MODE: Simulando sequência de deploy ---"
    echo "1. Usuário CloudPanel: $DETECTED_USER"
    echo "2. Pasta de dados persistente: $DEFAULT_PERSISTENT_DIR/captures"
    echo "3. Migrar pasta física server/data (se existir e não for link simbólico) para $DEFAULT_PERSISTENT_DIR/"
    echo "4. Criar link simbólico de $DEFAULT_PERSISTENT_DIR para $PROJECT_DIR/server/data"
    echo "5. Atualizar repositório Git: git pull origin vps-deploy-persistence-setup"
    echo "6. Instalar dependências npm: npm install"
    echo "7. Compilar frontend e backend: npm run build"
    echo "8. Gerenciar processo PM2: reiniciar/iniciar $APP_NAME"
    echo "--- FIM DA SIMULAÇÃO ---"
    exit 0
fi

# Interactive path and user setup
echo "Configurações de Instalação:"
read -p "Nome de usuário do sistema/CloudPanel [Padrão: $DETECTED_USER]: " CLP_USER
CLP_USER=${CLP_USER:-$DETECTED_USER}

read -p "Caminho da pasta persistente de dados [Padrão: $DEFAULT_PERSISTENT_DIR]: " PERSISTENT_DIR
PERSISTENT_DIR=${PERSISTENT_DIR:-$DEFAULT_PERSISTENT_DIR}

# Confirm action
read -p "Deseja iniciar a atualização/instalação com as configurações acima? (s/N): " confirm
if [[ ! "$confirm" =~ ^[sS]$ ]]; then
    echo "Operação abortada pelo usuário."
    exit 0
fi

echo "-> Verificando integridade da pasta persistente em: $PERSISTENT_DIR..."
mkdir -p "$PERSISTENT_DIR/captures"

# Ensure correct owner for persistence path
echo "-> Ajustando permissões da pasta persistente para o usuário $CLP_USER..."
chown -R "$CLP_USER:$CLP_USER" "$PERSISTENT_DIR" || echo "Aviso: Não foi possível rodar chown (execute como sudo se necessário)."

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
```

**Verify**: Run `bash -n deploy-vps.sh` and verify that syntax is valid. Run `./deploy-vps.sh --dry-run` and verify that the simulation runs without interactive prompts.

## Done criteria

- [ ] Script dynamically detects target username and suggests it.
- [ ] User can customize system/CLP user and persistence directory paths during run.
- [ ] Script permissions adjustments (`chown`) use the verified or custom user value.
- [ ] `./deploy-vps.sh --dry-run` executes successfully without interactive prompt requests.

## STOP conditions

- If path resolution fails during dry-runs.

## Maintenance notes

- None.
