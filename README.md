# FIFA Career Companion

Companion do modo carreira do FIFA/EA FC (FIFA 15 → FC 24, com atenção especial ao 16 e ao 22).
Foco em **jogadores**, não em campanhas: prospecção na database original do jogo, elenco completo
da carreira, base/regens e acompanhamento de desenvolvimento por temporada — inclusive por
**foto da tela do jogo** interpretada por IA.

Todos os dados do jogo são **reais**: dumps públicos completos extraídos do SoFIFA
(datasets de Stefano Leone no Kaggle), importados uma única vez para SQLite no servidor.
O app nunca inventa nem reduz atributos — o que não foi importado aparece como indisponível.

> A API oficial do SoFIFA (api.sofifa.net) é restrita a projetos parceiros aprovados.
> O client dela está pronto em `server/src/sofifa/sofifa-api.ts` como fonte plugável futura.

## Arquitetura (onde ficam os dados)

- **Na sua conta (servidor, SQLite):** carreiras, elencos, jogadores da base/regens, snapshots
  de evolução e prospecção — por usuário, atrás de login (sessão por cookie). O cadastro é
  fechado: o administrador cria usuários com senha temporária (troca obrigatória no 1º login).
- **No seu navegador (localStorage):** apenas as **chaves de IA (BYOK)** — elas nunca vão para
  o servidor; você as configura em cada dispositivo (⚙️ Configurações).
- **Área admin (`/admin`):** importação das databases do jogo e gestão de usuários
  (criar/desativar/promover/resetar senha/excluir).
- **Database do jogo (compartilhada, somente leitura):** `sofifa_players` / `sofifa_teams`,
  importada uma vez por versão a partir dos dumps públicos.
- **Migração do modelo antigo:** quem tinha dados no localStorage (ou uma chave de restauração)
  vê um banner após o login para importá-los para a conta — one-shot, sem perder nada.
- **Análise de fotos:** stateless. O navegador manda a imagem + o provedor/chave/modelo escolhidos
  para `POST /api/analyze`, que só faz proxy para o provedor de IA (Anthropic, OpenAI, Gemini ou
  OpenRouter) e devolve o JSON extraído. A chave de IA nunca é gravada no servidor.

## Rodando localmente

```bash
npm install
npm run dev:server   # API em http://localhost:3344
npm run dev:web      # app em http://localhost:5173 (acessível na rede local)
```

1. **Tela inicial** → toque nas versões do FIFA que você joga e clique em **Importar**
   (download automático do dataset público + importação, com barra de progresso — sem conta).
2. **⚙️ Configurações** → escolha o provedor de IA e cole sua chave (BYOK). As chaves ficam
   só no seu navegador.

No celular (mesma rede Wi-Fi): abra `http://<IP-do-Mac>:5173` e use "Adicionar à Tela de Início"
para instalar como PWA. **A câmera exige HTTPS** — em rede local funciona em `localhost`, mas no
celular via IP só com o deploy HTTPS abaixo.

---

## Deploy na VPS (Debian 12 + CloudPanel)

O app roda como **um único processo Node** que serve a API **e** o front buildado. O CloudPanel
cuida do proxy reverso e do SSL (Let's Encrypt) — que também é o que faz a câmera do PWA funcionar
no celular.

### 1. Criar o site no CloudPanel

No painel: **Sites → Add Site → Create a Node.js Site**.
- **Domain:** `companion.seudominio.com` (aponte o DNS para o IP da VPS antes).
- **Node.js version:** 20 ou 22.
- **App Port:** `3344` (o CloudPanel cria o proxy reverso para essa porta).
- Isso cria um usuário do site e a pasta `~/htdocs/companion.seudominio.com`.

### 2. Emitir o SSL

Aba **SSL/TLS → Actions → New Let's Encrypt Certificate**. Necessário para a câmera (getUserMedia
/ input capture) e para o PWA instalável.

### 3. Enviar o código e buildar

Conecte via SSH como o **usuário do site** (ex.: `ssh site-user@sua-vps`) e, na pasta do site:

```bash
cd ~/htdocs/companion.seudominio.com

# opção A: clonar o repositório
git clone <URL-DO-REPO> .
git checkout claude   # branch com estas mudanças

# opção B: enviar por rsync/scp a partir da sua máquina

npm install          # instala workspaces (server + web)
npm run build        # builda o web (web/dist) e compila o server (server/dist)

cp server/.env.example server/.env
# Em produção, configure no .env (detalhes no próprio .env.example):
#   CORS_ORIGINS=https://companion.seudominio.com   ← sem isso a API reflete qualquer origem
#   ADMIN_TOKEN=<um segredo>                        ← só se quiser disparar o import de fora do servidor
```

> `better-sqlite3` é nativo; se `npm install` reclamar de compilação, instale as ferramentas de
> build uma vez: `sudo apt-get install -y build-essential python3`.

### 4. Subir com PM2 (mantém o app no ar e reinicia sozinho)

O CloudPanel já traz o PM2. Ainda na pasta do site:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # rode o comando que ele imprimir (com sudo) p/ subir no boot
```

Acesse `https://companion.seudominio.com` — o app está no ar.

### 5. Importar a database do jogo (uma vez)

Abra o site → **tela inicial** → selecione as versões (ex.: FIFA 16 e 22) → **Importar**.
O servidor baixa o dataset público e popula o SQLite em `server/data/companion.db` com barra de
progresso. Alternativa por terminal, se preferir:

```bash
npm run import:data -- 16 22
```

Pronto. Cada usuário que abrir o site cria as próprias carreiras (guardadas no navegador dele) e
configura a própria chave de IA em ⚙️ Configurações.

### Atualizações futuras

```bash
cd ~/htdocs/companion.seudominio.com
git pull
npm install
npm run build
pm2 restart fifa-companion
```

A database importada (`server/data/`) e os dados dos usuários (nos navegadores) sobrevivem ao
deploy. Guarde `server/data/` num backup se quiser preservar a importação.

### Notas

- **Porta/So:** o servidor escuta em `127.0.0.1:3344` (via `ecosystem.config.cjs`); só o CloudPanel
  fala com ele, o mundo externo entra pelo HTTPS do proxy.
- **Upload de fotos:** o proxy do CloudPanel/Nginx tem limite de `client_max_body_size`. As fotos
  vão em base64 (~alguns MB); se uma foto grande falhar, aumente esse limite nas **Vhost settings**
  do site (ex.: `client_max_body_size 30M;`).
- **Sem chaves no servidor:** não há `ANTHROPIC_API_KEY` no `.env`. Cada usuário traz a sua (BYOK),
  salva no próprio navegador.
- **Hardening:** `CORS_ORIGINS` restringe quais origens falam com a API e `ADMIN_TOKEN` protege
  `POST /api/import` fora do loopback. Ambos documentados em `server/.env.example`, junto com
  `SYNC_MAX_BLOBS`/`SYNC_TTL_DAYS` (quota e expiração das chaves de restauração).

## Estrutura

- `server/` — Fastify + SQLite (better-sqlite3). Auth por sessão (`/api/auth/*`), dados
  per-user (`/api/careers*`, `/api/career-players/*`, `/api/prospects/*`, `/api/me/import-local`),
  admin (`/api/admin/users*`, `/api/import/*`), database do jogo somente leitura
  (`/api/versions`, `/api/leagues/:v`, `/api/teams/:v`, `/api/team/:v/:id`, `/api/players/:v`,
  `/api/player/:v/:id`) e `/api/analyze` + `/api/test-ai` (proxy de IA stateless).
  `GET /api/sync/:code` sobrevive deprecado só como fonte de migração. Em produção, também
  serve `web/dist` com fallback de SPA. Schema evolui via `src/db/migrations/`.
- `web/src/store.ts` — só o que é local por design: chaves BYOK de IA + leitor do blob legado.
- `web/src/api/user-data.ts` — client das rotas de dados da conta.
- `web/` — React + Vite + Tailwind (PWA, PT-BR, mobile-first).

## Conceitos

- **Carreira**: versão do jogo + time original (elenco completo carregado automaticamente da
  database) ou clube criado (FIFA 22+: nome, verba, liga, time substituído, objetivos, qualidade —
  jogadores gerados entram manualmente ou por foto do elenco).
- **Temporada/data atual do save**: sempre visível no dashboard; toda evolução de stats vira um
  *snapshot* datado (nunca sobrescreve), gerando a linha do tempo e o gráfico de desenvolvimento.
- **Prospecção**: busca com filtros (posição, idade, overall, potencial, valor, liga) sobre a
  database original da versão da carreira; shortlist com status (observando → contratado, que
  move o jogador para o elenco).
- **BYOK**: traga a chave do provedor de IA que preferir (Anthropic, OpenAI, Gemini, OpenRouter);
  fica no seu navegador e é usada só para ler as fotos da tela. Pode remover a qualquer momento.
- **Chave de restauração**: código único (12 caracteres) que aponta para uma cópia dos seus dados
  guardada no servidor — gerar, atualizar, restaurar em outro aparelho e remover, tudo em
  ⚙️ Configurações. Não é uma conta/login: é só um código, então quem o tiver acessa os dados.

Dados do jogo © EA Sports, compilados pela comunidade via [SoFIFA](https://sofifa.com).
Projeto pessoal, não comercial.
