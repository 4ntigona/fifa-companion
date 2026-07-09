#!/bin/bash
set -e

PERSISTENT_DIR="/home/fifa-companion/persistent_data"
PROJECT_DIR="$(pwd)"
APP_NAME="fifa-companion"

echo "=================================================="
echo "    FIFA Companion VPS Auto-Deploy Script         "
echo "=================================================="

# Check for dry-run
DRY_RUN=false
if [ "$1" = "--dry-run" ]; then
    DRY_RUN=true
fi

if [ "$DRY_RUN" = true ]; then
    echo "--- DRY RUN MODE: Simulando sequência de deploy ---"
    echo "1. Verificar instalação de dependências: node, npm, pm2, unzip"
    echo "2. Criar diretório persistente: $PERSISTENT_DIR/captures"
    echo "3. Migrar pasta física server/data (se existir e não for link simbólico) para $PERSISTENT_DIR/"
    echo "4. Criar link simbólico de $PERSISTENT_DIR para $PROJECT_DIR/server/data"
    echo "5. Atualizar repositório Git: git pull origin vps-deploy-persistence-setup"
    echo "6. Instalar dependências npm: npm install"
    echo "7. Compilar frontend e backend: npm run build"
    echo "8. Gerenciar processo PM2 (reiniciar se existir, iniciar se não existir): $APP_NAME"
    echo "--- FIM DA SIMULAÇÃO ---"
    exit 0
fi

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
