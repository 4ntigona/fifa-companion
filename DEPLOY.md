# Deploy do Prancheta — Debian 12 + CloudPanel

Passo a passo completo para colocar o app no ar numa VPS. O Prancheta roda como **um único
processo Node** que serve a API **e** o front buildado; o CloudPanel cuida do proxy reverso e
do HTTPS (que é o que faz a câmera do PWA funcionar no celular).

> **v0.4.000 em diante**: o app tem contas reais. Os dados dos usuários (carreiras, elencos,
> snapshots, prospecção, pareceres do conselheiro) ficam no **SQLite do servidor** — o backup
> de `server/data/` deixou de ser opcional. As chaves de IA continuam **BYOK**, no navegador
> de cada usuário: nunca vão para o servidor.

> **VPS ainda sem CloudPanel?** Este documento assume que ele já está instalado. Para o
> caminho completo a partir de uma VPS em branco (instalar o CloudPanel, DNS, swap, etc.),
> veja **[INSTALL.md](INSTALL.md)** primeiro.

---

## 0. Pré-requisitos

- VPS com **Debian 12** e **CloudPanel** instalado.
- Um domínio/subdomínio com DNS (registro A) apontando para o IP da VPS —
  ex.: `prancheta.seudominio.com`.
- **Node 20.12+ ou 22+** (o CloudPanel deixa escolher na criação do site). A versão mínima
  importa: usamos `--env-file-if-exists`, disponível a partir do 20.12.

---

## 1. Criar o site no CloudPanel

No painel: **Sites → Add Site → Create a Node.js Site**.

| Campo | Valor |
|---|---|
| Domain | `prancheta.seudominio.com` |
| Node.js version | 20 ou 22 |
| App Port | `3344` |
| Site User | anote o usuário criado (você vai usar no SSH) |

O CloudPanel cria o usuário do site, a pasta `~/htdocs/prancheta.seudominio.com` e o proxy
reverso apontando para a porta `3344`.

## 2. Emitir o certificado SSL

Aba **SSL/TLS → Actions → New Let's Encrypt Certificate**.

Obrigatório: sem HTTPS a câmera (input `capture`) e a instalação do PWA não funcionam.

## 3. Ferramentas de build (uma vez por VPS)

O `better-sqlite3` é um módulo nativo — precisa compilar na instalação:

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
```

## 4. Enviar o código e buildar

Conecte via SSH **como o usuário do site** (não como root):

```bash
ssh site-user@sua-vps
cd ~/htdocs/prancheta.seudominio.com

# Opção A — clonar o repositório
git clone <URL-DO-REPO> .
git checkout main

# Opção B — enviar da sua máquina, com rsync (exclui o que não deve subir)
#   rsync -avz --exclude node_modules --exclude server/data --exclude .git \
#     ./ site-user@sua-vps:~/htdocs/prancheta.seudominio.com/

npm install     # instala os workspaces (server + web)
npm run build   # gera web/dist e compila server/dist
```

## 5. Configurar o ambiente

```bash
cp server/.env.example server/.env
nano server/.env
```

No **primeiro deploy**, além do que já vem comentado no arquivo, defina:

```ini
# Restringe quem pode falar com a API (sem isso, ela reflete qualquer origem)
CORS_ORIGINS=https://prancheta.seudominio.com

# SÓ NO PRIMEIRO BOOT: semeia o primeiro administrador.
# Sem isso, o banco nasce sem usuários e NINGUÉM consegue entrar.
ADMIN_EMAIL=voce@seudominio.com
ADMIN_PASSWORD=uma-senha-forte-e-temporaria
```

> **Importante:** o seed só roda quando a tabela `users` está **vazia**. Depois de confirmar
> que você consegue entrar, **apague `ADMIN_EMAIL` e `ADMIN_PASSWORD` do `.env`** e reinicie
> (`pm2 restart prancheta`). Troque a senha pelo app em **Mais → Configurações**.

## 6. Subir com PM2

O CloudPanel já traz o PM2. Ainda na pasta do site:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup     # rode o comando que ele imprimir (com sudo) para subir no boot
```

Verifique:

```bash
pm2 status
pm2 logs prancheta --lines 50
```

No boot você deve ver a linha do seed do admin (só na primeira vez) e
`Server listening at http://127.0.0.1:3344`. As **migrations do banco rodam sozinhas** a cada
boot — não há passo manual de schema.

Acesse `https://prancheta.seudominio.com` e faça login com o admin semeado.

## 7. Importar a database do jogo (uma vez por versão)

Logado como admin: **Mais → Databases do jogo** → selecione as versões (ex.: FIFA 16 e 22)
→ **Importar**. O servidor baixa o dataset público do Kaggle e popula o SQLite, com barra de
progresso.

O arquivo é grande e a primeira importação leva alguns minutos — pode deixar rodando. Se
preferir pelo terminal:

```bash
npm run import:data -- 16 22
```

> Os dados do jogo são **reais** (dumps do SoFIFA via Kaggle) e compartilhados por todos os
> usuários, em modo somente-leitura. As migrations nunca tocam essas tabelas.

## 8. Criar os usuários

O cadastro é fechado: **o admin cria as contas**. Em **Mais → Usuários → Criar usuário**,
informe o e-mail e o papel. O app mostra uma **senha temporária que aparece uma única vez** —
copie e entregue ao usuário. No primeiro login ele é obrigado a trocá-la.

## 9. Configurar a IA (cada usuário, no próprio aparelho)

Em **Mais → Configurações**, cada pessoa cola a chave do provedor que preferir (Anthropic,
OpenAI, Gemini ou OpenRouter). A chave fica no `localStorage` do navegador dela e é enviada a
cada requisição; o servidor apenas repassa ao provedor e **nunca a persiste**.

Isso habilita a leitura de fotos (tab **Captura**) e o **Conselheiro** no hub da carreira.

---

## Atualizações futuras

```bash
cd ~/htdocs/prancheta.seudominio.com
git pull
npm install
npm run build
pm2 restart prancheta
```

As migrations pendentes são aplicadas no restart. Os dados dos usuários e a database do jogo
sobrevivem ao deploy.

## Backup (faça isto)

Todo o estado do app vive num arquivo só. Com o app rodando, use o backup online do SQLite
(não copie o arquivo com `cp`, por causa do WAL):

```bash
sqlite3 ~/htdocs/prancheta.seudominio.com/server/data/companion.db \
  ".backup '/home/site-user/backups/prancheta-$(date +%F).db'"
```

Um cron diário resolve:

```bash
crontab -e
# 0 4 * * * sqlite3 ~/htdocs/prancheta.seudominio.com/server/data/companion.db ".backup '/home/site-user/backups/prancheta-$(date +\%F).db'"
```

> O arquivo inclui a database do jogo importada (centenas de MB). Se quiser backups enxutos,
> guarde só as tabelas de usuário — a database do jogo pode ser reimportada a qualquer momento.

## Notas e solução de problemas

- **Escuta em loopback:** o servidor sobe em `127.0.0.1:3344`; só o CloudPanel fala com ele.
  Nunca exponha a porta direto na internet.
- **Foto grande falhando (413):** o Nginx do CloudPanel limita o corpo da requisição. Em
  **Sites → seu site → Vhost**, aumente: `client_max_body_size 30M;`.
- **`npm install` falhando no better-sqlite3:** faltou o passo 3 (`build-essential python3`).
- **Ninguém consegue logar:** o banco nasceu sem usuários. Pare o app, garanta que `users`
  está vazia, defina `ADMIN_EMAIL`/`ADMIN_PASSWORD` no `.env` e reinicie.
- **Perdeu a senha do admin:** não há recuperação por e-mail. Se houver outro admin, ele
  reseta pela tela de Usuários. Se não houver, gere um novo hash `scrypt` e atualize a linha
  do usuário direto no SQLite (com o app parado).
- **Logs:** `pm2 logs prancheta`. Rotação: `pm2 install pm2-logrotate`.
- **Sem chaves de IA no servidor:** não existe `ANTHROPIC_API_KEY` no `.env` — é BYOK por
  design. Se algum dia aparecer uma, algo está errado.
