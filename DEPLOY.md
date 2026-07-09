# Guia de Deploy VPS — FIFA Career Companion

> [!TIP]
> **Automação**: Você pode automatizar todos os passos manuais de atualização e deploy listados neste guia executando o script de deploy automatizado na raiz do projeto:
> ```bash
> ./deploy-vps.sh
> ```
> Para simular e ver o que o script fará sem realizar nenhuma alteração real, use o modo de demonstração:
> ```bash
> ./deploy-vps.sh --dry-run
> ```

Este guia descreve os passos para configurar, atualizar e manter a aplicação FIFA Career Companion em uma VPS com **Debian 12**, **CloudPanel** e **PM2**, garantindo a persistência dos dados (banco de dados SQLite e imagens capturadas).

---

## 🏗️ Arquitetura e Portas

*   **Runtime**: Node.js (v20+)
*   **Gerenciador de Processo**: PM2
*   **Porta padrão**: `3344` (executa a API Fastify que serve o SPA React estático de `/web/dist`)
*   **Diretório de dados persistent**: `server/data`
    *   Banco de dados: `server/data/companion.db`
    *   Uploads OCR: `server/data/captures/`

---

## 💾 Estratégia de Persistência

Como o banco de dados SQLite (`companion.db`) e as imagens carregadas (`captures/`) ficam dentro da pasta do projeto (`server/data`), eles correm risco de serem apagados se você deletar a pasta durante um deploy limpo. 

Para evitar isso, criamos uma pasta persistente **fora** do diretório da aplicação e apontamos a pasta `server/data` para ela via **link simbólico (symlink)**.

---

## 🚀 Guia Passo a Passo de Instalação e Deploy

### 1. Preparar Diretórios no Servidor
Acesse a VPS via SSH e execute os comandos abaixo para criar a estrutura persistente:

```bash
# Criar pasta persistente fora da pasta de build
mkdir -p /home/fifa-companion/persistent_data/captures

# Garantir as permissões corretas (ajuste o usuário conforme o CloudPanel)
chown -R clp-user:clp-user /home/fifa-companion/persistent_data
```

### 2. Configurar o Projeto e Criar o Link Simbólico
Navegue até a pasta do seu site criada no CloudPanel (ex: `/home/fifa-companion/htdocs/seu-site/`):

```bash
# Clonar/Acessar o repositório
cd /home/fifa-companion/htdocs/seu-site

# Criar o symlink ligando a pasta do servidor à pasta do projeto
ln -s /home/fifa-companion/persistent_data ./server/data
```

### 3. Instalar Dependências e Compilar
Execute o build do monorepo:

```bash
# Instalar todas as dependências
npm install

# Compilar backend e frontend
npm run build
```

### 4. Importar dados históricos do Sofifa (Kaggle)
Se for o primeiro deploy, certifique-se de que os arquivos do Kaggle (`male_players.csv` e `male_teams.csv`) estão em `server/data/` (dentro da pasta persistente) e execute o comando de importação:

```bash
npm run import:data -- 16 22 23 24
```

### 5. Iniciar a aplicação com PM2
Inicie o processo do Node.js em modo produção:

```bash
pm2 start server/dist/index.js --name "fifa-companion" --env NODE_ENV=production
pm2 save
```

---

## 🔄 Como atualizar a aplicação (Redeploy)

Sempre que fizer novas modificações e quiser atualizar a versão em produção, execute o seguinte script no diretório principal do projeto na VPS:

```bash
# 1. Puxar alterações do Git
git checkout vps-deploy-persistence-setup
git pull origin vps-deploy-persistence-setup

# 2. Instalar dependências atualizadas
npm install

# 3. Compilar novamente a aplicação
npm run build

# 4. Reiniciar o processo no PM2
pm2 restart "fifa-companion"
```

*Nota: Graças ao link simbólico criado no passo 2, o arquivo `companion.db` e as imagens de capturas não serão alterados ou apagados durante essa atualização.*

---

## 🌐 Configuração do CloudPanel (Reverse Proxy)

No painel do CloudPanel:

1. Adicione um novo site escolhendo a opção **Reverse Proxy**.
2. Defina o **Domain Name** (ex: `companion.seudominio.com`).
3. No campo **Reverse Proxy URL**, digite: `http://127.0.0.1:3344`.
4. Vá na aba **SSL/TLS** e ative o certificado gratuito **Let's Encrypt** para habilitar o HTTPS.
