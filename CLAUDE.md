# FIFA Career Companion

Companion do modo carreira do FIFA/EA FC (foco em FIFA 15–24, com atenção especial ao 16 e ao 22).
O foco é **gerenciar jogadores** — elencos, prospecção, base/regens, desenvolvimento por
temporada — não gerenciar campanhas/resultados.

## Verificação

```bash
npm run verify   # typecheck (server+web) + testes (vitest) + build completo
```

Comandos individuais: `npm run typecheck`, `npm test`, `npm run build`. Não há lint configurado.

## Modelo de dados (contraintuitivo — leia antes de mexer)

Os dados do usuário (carreiras, elencos, jogadores da base/regens, snapshots de evolução,
prospecção/shortlist e as **chaves de IA — BYOK**) vivem no **localStorage do navegador**
(`web/src/store.ts`), **não no servidor**. O servidor é essencialmente stateless quanto ao
usuário; ele guarda apenas:

- A database original do jogo, somente leitura (`sofifa_players` / `sofifa_teams`, importada uma
  vez por versão a partir de dumps públicos do SoFIFA/Kaggle).
- Blobs opacos de backup (`sync_blobs`) — usados só pela "chave de restauração" opcional, para o
  usuário levar os dados para outro aparelho sem precisar de arquivo. O código de 12 caracteres é
  a única credencial; **nunca deve conter as chaves de IA do usuário** (ver `web/src/store.ts`
  `stripSecrets`/`snapshotForSync`).
- Nenhuma persistência de chave de provedor de IA: `/api/analyze` é um proxy stateless — o
  navegador manda a chave BYOK a cada request; o servidor nunca grava.

## Invariante de produto

Os dados do jogo são **reais** (dumps do SoFIFA via Kaggle) — o app nunca inventa nem reduz
atributos. O que não foi importado aparece como indisponível, não como valor inventado.

## Layout

- `server/` — Fastify 5 + better-sqlite3 (síncrono), TypeScript ESM, Node 20+.
- `web/` — React 18 + Vite 6 + Tailwind v4 + TanStack Query v5 + Recharts, PWA em PT-BR
  (mobile-first — o app é usado no celular enquanto o FIFA roda na TV).
- Deploy: VPS Debian + CloudPanel, PM2 (`ecosystem.config.cjs`), processo único servindo a API e
  o `web/dist` buildado.

## Estética

Segue `DESIGN.md` — tema terminal (marca PEDRO\RIVERA): IBM Plex Mono, paleta preto/vermelho,
**raio de borda zero** em todo o app. Decisão intencional, não drift.

## plans/

Planos gerados pelo skill `improve` ficam em `plans/`. Antes de executar um, leia o plano inteiro
— cada um é autocontido (contexto, escopo, comandos de verificação, STOP conditions).
