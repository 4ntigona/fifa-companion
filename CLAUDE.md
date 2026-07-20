# Prancheta

Companheiro do modo carreira do FIFA/EA FC (foco em FIFA 15–24, com atenção especial ao 16 e
ao 22). O foco é **desenvolvimento do time** — elencos, base/regens, evolução por temporada,
prospecção e conselheiro de IA — não gerenciar campanhas/resultados.

Shell mobile-first com tab bar (Elenco · Scout · Captura · Mais) sobre uma **carreira ativa**
(contexto persistente: URL primeiro, `localStorage` como fallback — ver `web/src/hooks.ts`).

**Antes de propor mudanças de arquitetura ou produto, leia [`STATUS.md`](STATUS.md)** — tem o
histórico completo, o estado técnico verificado e a lista de dívida técnica/pendências
conhecidas. Evita redescobrir decisões já tomadas conscientemente (seção 3.5 de lá) ou
reabrir itens já resolvidos.

## Verificação

```bash
npm run verify   # typecheck (server+web) + testes (vitest) + build completo
```

Comandos individuais: `npm run typecheck`, `npm test`, `npm run build`. Não há lint configurado.

> **Não rebaixe o vitest**: o projeto usa vitest 4.x de propósito (o dist-tag `latest` do npm
> ainda aponta para 3.x). O pin escapa de um advisory crítico de RCE no happy-dom que as versões
> antigas puxavam. `npm i vitest@latest` seria um DOWNGRADE — não faça.

## Modelo de dados (leia antes de mexer)

Desde a v0.3.000 o app tem **contas reais**: os dados do usuário (carreiras, elencos,
jogadores da base/regens, snapshots, prospecção) vivem no **servidor**, por `user_id`
(`server/src/routes/careers.ts` etc.), atrás de sessão por cookie (`server/src/auth/`).
Cadastro é fechado: **admin cria usuários** (senha temporária + troca forçada no 1º login);
primeiro admin é semeado via `ADMIN_EMAIL`/`ADMIN_PASSWORD` no boot com `users` vazio.

O que continua fora do servidor / especial:

- **Chaves de IA (BYOK) ficam no localStorage do navegador** (`web/src/store.ts`) — invariante:
  o servidor NUNCA persiste chave de provedor. Vale para os DOIS consumidores de IA:
  `/api/analyze` (captura de foto) e `/api/careers/:id/advisor` (conselheiro). O encanamento
  é compartilhado em `server/src/ai/providers.ts` (`complete()` aceita texto e/ou imagem).
  Do conselheiro, o servidor persiste só a **resposta** (`advisor_reports`), nunca a chave.
  Toda chamada de IA é por **gatilho explícito** do usuário — nada automático (custa a ele).
- A database original do jogo é somente leitura (`sofifa_players` / `sofifa_teams`, importada
  por versão a partir de dumps públicos do SoFIFA/Kaggle) e compartilhada entre usuários.
  **Migrations nunca tocam nessas tabelas.**
- `sync_blobs` (chave de restauração do modelo antigo) está **deprecado**: só `GET /api/sync/:code`
  existe, como fonte da migração one-shot (`/api/me/import-local`); some numa release futura.
- Schema evolui via `server/src/db/migrations/00N-*.sql` (runner em `server/src/db/index.ts`).

## Invariante de produto

Os dados do jogo são **reais** (dumps do SoFIFA via Kaggle) — o app nunca inventa nem reduz
atributos. O que não foi importado aparece como indisponível, não como valor inventado.

## Layout

- `server/` — Fastify 5 + better-sqlite3 (síncrono), TypeScript ESM, Node 20+.
- `web/` — React 18 + Vite 6 + Tailwind v4 + TanStack Query v5 + Recharts, PWA em PT-BR
  (mobile-first — o app é usado no celular enquanto o FIFA roda na TV).
- Deploy: VPS Debian + CloudPanel, PM2 (`ecosystem.config.cjs`), processo único servindo a API e
  o `web/dist` buildado. VPS do zero: `INSTALL.md`. VPS já configurada (update/backup/
  troubleshooting): `DEPLOY.md`. Referência completa (arquitetura, env vars, config): `README.md`.
- QA: roteiro E2E + prints de referência em `screenshots/tests/` (rodar sempre contra a base
  isolada `server/data-qa`, nunca contra `server/data`).

## Estética

Segue `DESIGN.md` — identidade **Prancheta / "Goleiro 92"** (aprovada na concepção v0.4.000,
`design-proposals/`): roxo royal como ação, rosa-choque EXCLUSIVO do dado de crescimento,
amarelo só no padrão geométrico, Anybody (display) + Chivo (corpo) + Chivo Mono (números),
cards 14px / controles em pílula. O tema terminal anterior (PEDRO\RIVERA, raio zero) está
morto — não reintroduzir.

## plans/

Planos gerados pelo skill `improve` ficam em `plans/`. Antes de executar um, leia o plano inteiro
— cada um é autocontido (contexto, escopo, comandos de verificação, STOP conditions).
