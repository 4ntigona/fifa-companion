# Estado atual, histórico e roadmap — Prancheta

> Documento vivo. Escrito em 2026-07-19 (v0.4.000), **atualizado em 2026-07-21** com o bloco
> de curto prazo do roadmap. Se você está lendo isto muito depois dessa data, confira o
> [CHANGELOG.md](CHANGELOG.md) para releases mais recentes — este documento descreve o estado
> **naquele momento**, não se atualiza sozinho.
>
> **Atualização de 2026-07-21** — o bloco de curto prazo do roadmap foi **entregue por
> inteiro** e o app está **no ar em produção**. Landaram na `main` os planos
> [020](plans/020-ci-minimo.md) (CI → `0.4.001`),
> [021](plans/021-higiene-codigo-morto-e-sync-blobs.md) (higiene + remoção do `sync_blobs` →
> `0.4.002`), [022](plans/022-csp-enforced.md) (CSP enforced → `0.4.003`) e o
> [023](plans/023-deploy-real-e-validacao.md) (**primeiro deploy real → `0.5.000`**). O
> `package.json` e o `CHANGELOG.md` foram atualizados para `0.5.000`.
>
> **O deploy aconteceu de verdade**: VPS Debian + CloudPanel em `prancheta.pedrorivera.me`,
> coexistindo com a versão anterior (`companion.pedrorivera.me`) na mesma máquina. E o
> **Conselheiro respondeu pela primeira vez na vida do projeto** (Gemini, carreira real) — dois
> dos três "buracos históricos" fechados (§3.3). **Resta validar a câmera** num celular real
> sobre HTTPS (terceiro buraco), e o bug de resiliência do conselheiro a navegação segue aberto
> (**§3.5-bug**).

## Resumo executivo

O Prancheta é um companheiro de modo carreira do FIFA/EA FC: um PWA mobile-first, em PT-BR,
que guarda o que o próprio jogo esquece — evolução de jogadores por temporada, objetivos da
diretoria, shortlist de prospecção e, desde a v0.4.000, um conselheiro de IA que analisa a
carreira sob demanda. Roda como um único processo Fastify + SQLite, com um front React
buildado servido pelo mesmo processo. Contas são reais (login por sessão, cadastro fechado
por admin) desde a v0.3.000. A identidade visual atual ("Goleiro 92") é a segunda que o
projeto teve — a primeira (tema terminal pessoal do dono) foi deliberadamente aposentada.

**Maturidade por área:**

| Área | Estado |
|---|---|
| Modelo de dados / carreiras / elenco / prospecção | Maduro — em produção desde antes das contas, testado |
| Contas e admin | Maduro — testado, isolamento por usuário verificado |
| Interface / identidade visual | Recém-refeita (v0.4.000), auditada em acessibilidade |
| Conselheiro de IA | **MVP validado em produção** — 1ª resposta real (Gemini) em 2026-07-21; o mesmo teste revelou bug de resiliência a navegação (§3.5-bug); faltam iterações de produto (ver roadmap) |
| Deploy / operações | **No ar** desde 2026-07-21 (`prancheta.pedrorivera.me`, VPS + CloudPanel, coexistindo com o app antigo). Caminho exercido de verdade; ainda falta validar a câmera em celular real (§3.3) |
| CI | **Existe desde `0.4.001`** — GitHub Actions roda `npm run verify` (Node 20.12 + 22) em push/PR, mais job informativo de `npm audit`. Lint continua ausente (decisão consciente) |
| Segurança de headers | CSP **enforced** desde `0.4.003` (era `reportOnly`) — ver seção 2 |
| Automação de QA visual | Roteiro Playwright ainda **manual**, fora de CI (item 10 do roadmap) |

---

## 1. Histórico completo

O projeto **não usa SemVer** — segue [PrideVer](https://pridever.org)
(`PROUD.DEFAULT.SHAME`, terceiro segmento com 3 dígitos por convenção do projeto). Isso é
deliberado, não um erro de versionamento.

### Pré-histórico (antes do `v0.2.000`) — commits `968589c` → `9dbd316`

Construção inicial do produto, sem tag de versão formal. Nesta fase o app era **100%
local-first**: todos os dados do usuário viviam em `localStorage` do navegador, sem conta,
sem servidor de estado — só a database do jogo (SoFIFA/Kaggle) e o proxy de IA eram
server-side. Duas rodadas de auditoria (`improve`/`deep`, 2026-07-08 e 2026-07-14) produziram
os planos **001–019** (catalogados em `plans/README.md`), todos concluídos antes do baseline
de versão. Entre o que essas rodadas entregaram:

- Fundação de testes (vitest) e `npm run verify` como portão único.
- Hardening de segurança pré-produção: chaves BYOK nunca no servidor/backup, rate-limit,
  CORS allowlist, headers, quota/TTL de blobs de sync.
- Performance: code-splitting por rota + lazy do Recharts (chunk de entrada 681 KB → 215 KB),
  projeção de colunas e dedup de `COUNT` na busca de prospecção.
- Produto: ciclo de vida de status do jogador (titular/reserva/emprestado/vendido), captura
  registrando evolução em jogador já existente (não só criando novos), prioridade e
  comparação lado a lado na shortlist, auto-sync da chave de restauração com debounce.
- Uma decisão de bump de dependência **fora do plano original**: `vitest` foi elevado para a
  major 4.x (não a 3.x que o plano previa) porque a 3.x arrastava um advisory crítico de RCE
  via `happy-dom`. Essa decisão virou uma regra permanente do projeto (ver
  [README.md](README.md#testes-e-verificação)).

### `v0.2.000` — 2026-07-14 — baseline

Primeira tag formal, declarada arbitrariamente sobre o estado consolidado da fase anterior.
Não é uma release "de verdade" — é o marco zero do versionamento.

### `v0.2.001` a `v0.2.006` (fases documentadas em commits, sem tags próprias) — rumo a `v0.3.000`

Seis fases sequenciais implementando **contas reais** e o **desmembramento admin/frontend**:
migrations + núcleo de auth (sessão por cookie, scrypt), API per-user no servidor, shell de
auth no web, conversão do `store.ts` local para dados server-backed com migração one-shot do
modelo antigo, área `/admin` (databases + usuários), e limpeza final.

### `v0.3.000` — 2026-07-17 — Contas reais + desmembramento admin/frontend

O app deixa de ser local-first. Detalhes técnicos:

- **Auth**: sessão por cookie (`HttpOnly`, `SameSite=Lax`, hash SHA-256 do token no banco, 90
  dias com expiração deslizante), senha com `scrypt` (`node:crypto`, sem dependência nativa
  extra), checagem de header `Origin` em mutações, rate-limit dedicado no login (10/min).
- **Cadastro fechado**: só admin cria contas; senha temporária + troca forçada no primeiro
  login. Primeiro admin semeado via `ADMIN_EMAIL`/`ADMIN_PASSWORD` quando o banco de usuários
  está vazio.
- **Dados per-user no servidor**: carreiras, jogadores, snapshots, prospecção e aplicação de
  captura em lote, todos isolados por `user_id` (com testes de isolamento entre contas).
- **Migrations sequenciais** (`schema_migrations` + arquivos `00N-*.sql`), com garantia
  testada de que a `001-baseline.sql` é *no-op* sobre uma cópia do schema real de produção —
  ou seja, aplicar as migrations novas numa base já em uso não recria nem toca
  `sofifa_players`/`sofifa_teams`.
- **Migração do modelo antigo**: banner one-shot pós-login (`/api/me/import-local`) importa
  os dados de quem tinha um blob local ou uma chave de restauração, remapeando ids numa
  transação.
- **Área admin**: databases do jogo (import, antes na Home) e gestão de usuários
  (criar/desativar/promover/resetar senha/derrubar sessões/excluir), com guardas contra
  remover ou rebaixar o último admin ativo.
- **Deprecações**: chave de restauração perdeu escrita (só `GET` sobrevive, como fonte de
  migração), auto-sync removido do cliente, backup em arquivo removido, `ADMIN_TOKEN`
  substituído por "loopback ou sessão de admin".

### `v0.4.000` — 2026-07-19 — Prancheta

Refatoração completa de interface, em 8 fases sequenciais (`0.3.001`–`0.3.008`, cada uma um
commit próprio rumo à tag final):

1. **0.3.001 — Concepção**: blueprint de experiência (`design-proposals/blueprint.md`) e
   **5 direções de identidade** exploradas em paralelo — "Quadro Tático", "Caderno do
   Olheiro", "Goleiro 92", "Placar de Flip", "Dossiê" — cada uma com mockups HTML estáticos
   de 4 telas núcleo em claro/escuro. O dono aprovou **Goleiro 92** e o nome **Prancheta**
   (descartando "Career Companion" e "Olheiro").
2. **0.3.002 — Sistema de design**: `DESIGN.md` reescrito do zero; tokens de cor/tipografia
   novos em `web/src/index.css` (mesmos *nomes* de token do tema antigo, valores novos — o
   app inteiro re-tematizou sem tocar as classes das páginas); fontes trocadas para Anybody +
   Chivo + Chivo Mono; manifest do PWA atualizado (nome, `theme_color`, ícones).
3. **0.3.003 — Shell**: tab bar fixa (Elenco/Scout/Captura/Mais) com "carreira ativa" como
   contexto persistente (URL como fonte primária, `localStorage` como fallback + evento
   customizado para sincronizar componentes fora da árvore de rotas); nova tela **Mais**.
4. **0.3.004 — Career vira hub**: reestruturação de UX (não só reskin) — contexto do save →
   objetivos da diretoria (agora marcáveis, não só texto) → conselheiro → radar de
   desenvolvimento → elenco. `Player.tsx` retematizado, incluindo o gráfico Recharts (que já
   usava variáveis CSS, então re-tematizou de graça).
5. **0.3.005 — Reskin dos fluxos**: Scout, Captura, Home (que virou "abre direto na carreira
   ativa"), Configurações, Nova Carreira.
6. **0.3.006 — Auth, admin e purga**: tela de login/troca de senha ganhou moldura de marca
   própria (`AuthShell`); telas de admin retematizadas (fluxo crítico da senha temporária
   preservado); **purga total de emojis de UI** (viraram SVG inline) e verificação de zero
   resíduo do tema antigo no código.
7. **0.3.007 — Conselheiro de IA**: encanamento BYOK generalizado
   (`server/src/ai/providers.ts`, extraído do que antes só servia a captura de fotos);
   `POST /api/careers/:id/advisor` monta o contexto da carreira a partir do banco (objetivos,
   elenco com evolução, base, shortlist) e devolve um parecer estruturado ou responde uma
   pergunta dirigida; histórico persistido por carreira (`advisor_reports`).
8. **0.3.008 — QA, acessibilidade, docs e release**: 29 capturas de tela de referência
   regeneradas (`screenshots/tests/`); **auditoria de acessibilidade que encontrou e corrigiu
   2 falhas reais de contraste AA** (ver seção 4); `DEPLOY.md` escrito; bump para `0.4.000`,
   merge e tag.

Em toda a refatoração: **nenhuma funcionalidade foi removida** — o próprio blueprint incluiu
um inventário explícito "funcionalidade existente → onde mora no novo desenho" que serviu de
checklist de regressão.

---

## 2. Estado técnico atual

### Stack

| Camada | Tecnologia |
|---|---|
| Servidor | Fastify 5, TypeScript (ESM), Node 20+ |
| Banco | SQLite via `better-sqlite3` (síncrono, um arquivo, sem serviço externo) |
| Front | React 18, Vite 6, Tailwind v4, TanStack Query v5, React Router v7, Recharts 2 |
| PWA | `vite-plugin-pwa`, manifest customizado, ícones próprios (roxo Goleiro 92) |
| IA | BYOK — Anthropic, OpenAI, Gemini, OpenRouter (proxy stateless no servidor) |
| Testes | Vitest 4.x (server + web), sem framework de E2E integrado a CI |
| Deploy | VPS Debian + CloudPanel, PM2, processo único |

### Modelo de dados (tabelas principais)

`users`, `sessions`, `careers`, `career_players`, `player_snapshots`, `prospects`,
`advisor_reports` — todas por `user_id`/`career_id`, com cascade delete e isolamento testado.
`sofifa_players`/`sofifa_teams` — database do jogo, somente leitura, compartilhada,
importada por versão a partir do Kaggle. A tabela `sync_blobs` (legado) **foi removida na
`0.4.002`** — migration 004 a dropou; não reintroduzir (ver seção 3).

### Segurança — o que está implementado

- Sessão por cookie `HttpOnly`/`SameSite=Lax`, hash do token (não o token em si) no banco.
- Senha com `scrypt`, sem biblioteca nativa extra.
- Rate-limit global (120/min) + dedicado no login (10/min).
- CORS allowlist configurável (`CORS_ORIGINS`), reflete qualquer origem se não definida
  (aceitável em dev, **deve** ser configurado em produção).
- Checagem de header `Origin` em mutações.
- `@fastify/helmet` registrado com CSP **enforced** (desde `0.4.003`; era `reportOnly`). O
  script inline de tema é liberado por hash SHA-256, e a política inclui `worker-src` (SW do
  PWA), `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` e `frame-ancestors 'none'`.
  Lembrete: o header só chega ao browser quando o Fastify serve `web/dist` — no dev (Vite 5173)
  ele não aparece. Editar o script inline de `web/index.html` **invalida o hash** — recalcular
  (ver `plans/022-csp-enforced.md`).
- `trustProxy: true` (necessário atrás do proxy do CloudPanel, para IP real do cliente no
  rate-limit).
- Chaves de IA nunca tocam o servidor além do repasse stateless por requisição.
- Import da database (`POST /api/import`) restrito a loopback ou sessão de admin.

### Testes (contagem verificada nesta versão)

**57 testes automatizados** — 46 no server, 11 no web — cobrindo: isolamento de dados entre
usuários, idempotência de migrations contra cópia do schema de produção (agora incluindo a
004 que dropa `sync_blobs`), ciclo de auth, regras de admin (não remover/rebaixar o último
admin), rotas de carreira/jogador/prospecção, e o conselheiro (contexto montado do banco +
chamada ao provedor **mockada** — nenhum teste automatizado gasta créditos de API real).
`npm run verify` roda typecheck + testes + build como portão único antes de qualquer commit.
(A contagem caiu de 61 para 57 na `0.4.002`: os testes do `sync_blobs`/`routes/sync.ts` saíram
junto com a feature.)

Desde a `0.4.001` esse portão também roda **no CI** (`.github/workflows/verify.yml`): `npm run
verify` numa matriz Node 20.12 + 22 a cada push/PR, mais um job informativo de `npm audit`
(`continue-on-error`, não bloqueia merge). O primeiro run real acusou 2 advisories `high`
transitivos (`brace-expansion`, `fast-uri`), zerados na hora com `npm audit fix`.

Fora disso, existe um **roteiro de QA end-to-end manual** (`screenshots/tests/README.md`),
executado com Playwright contra uma base de dados isolada (nunca `server/data/companion.db`)
— mas ele **não roda em CI**, é disparado manualmente quando alguém decide fazer uma rodada
de QA visual.

---

## 3. Passos faltantes e dívida técnica conhecida

Esta seção é a mais importante para quem for continuar o projeto — são itens **verificados
no código nesta data**, não suposições.

### 3.1 — Documentação que já esteve errada e foi corrigida agora

Ao escrever este documento, encontramos e corrigimos duas inconsistências reais entre a
documentação e o código (`server/.env.example` estava desatualizado):

- **`ADMIN_TOKEN`** estava documentado como forma de autorizar `POST /api/import` fora do
  loopback. Isso era **código morto** (`server/src/settings.ts` exportava `adminToken()` sem
  nenhum chamador; desde a v0.3.000 o guard real é "loopback OU sessão de admin"). **Removido
  na `0.4.002`** (plano 021): `settings.ts` ficou só com `kaggleCreds()`, e o cabeçalho
  mentiroso que descrevia o app como local-first foi reescrito.
- **`ADMIN_EMAIL`/`ADMIN_PASSWORD`** — essenciais para o primeiro boot (sem eles, ninguém
  consegue logar) — **não estavam no `.env.example`**, só documentadas em prosa no
  `DEPLOY.md`/`ecosystem.config.cjs`. Corrigido nesta rodada.
- **`SYNC_MAX_BLOBS`** estava documentado como variável de configuração — **nunca foi
  implementada**. Removida do exemplo. (O `SYNC_TTL_DAYS`, que existia de fato, saiu junto
  com o `sync_blobs` na `0.4.002`.)

### 3.2 — Limpeza planejada e ainda não feita

- ~~**`sync_blobs`/chave de restauração**~~ → **RESOLVIDO na `0.4.002`** (plano 021): o dono
  optou por remover. Migration 004 dropa a tabela; saíram a rota pública `GET /api/sync/:code`,
  o `routes/sync.ts` e o caminho de código no banner de migração (o de `localStorage`
  sobrevive). O último blob existente foi arquivado fora do banco antes do drop.
- ~~**CSP em `reportOnly: true`**~~ → **RESOLVIDO na `0.4.003`** (plano 022): a política foi
  calibrada e está **enforced**. O script inline de tema é liberado por hash SHA-256, e
  entraram `worker-src`, `object-src 'none'`, `base-uri`, `form-action` e
  `frame-ancestors 'none'`. Varredura automatizada de todas as telas (contra build de
  produção) acusou zero violações, e o teste negativo confirmou bloqueio real de script
  externo, `<object>` e `fetch` cross-origin.

### 3.3 — Qualidade de processo (nunca existiu, não é regressão)

- ~~**Sem CI**~~ → **RESOLVIDO na `0.4.001`** (plano 020): `.github/workflows/verify.yml` roda
  `npm run verify` em push/PR numa matriz Node 20.12 + 22 (`fail-fast: false`), mais um job
  informativo de `npm audit`. Ainda depende de disciplina para não commitar direto na `main`
  sem passar por PR, mas o portão automatizado existe.
- **Sem lint**: nem ESLint nem Prettier configurados (decisão consciente, registrada em
  `plans/README.md`: "legítimo, mas depende do 002; vira plano próprio se desejado" — nunca
  virou).
- **QA visual não é automatizado em CI**: o roteiro Playwright em `screenshots/tests/` é
  disparado manualmente; não há garantia de que alguém rode antes de cada release.
- ~~**Nenhum deploy real em produção**~~ → **FEITO em 2026-07-21** (`0.5.000`, plano 023). O
  app está no ar em `prancheta.pedrorivera.me` (VPS Debian + CloudPanel + PM2), coexistindo com
  a versão anterior (`companion.pedrorivera.me`) na mesma máquina. Dos **três buracos
  históricos** que nunca tinham sido exercidos, **dois fecharam**:
  - **Caminho de deploy** rodado ponta a ponta de verdade. A rodada rendeu correções no
    `DEPLOY.md` (coexistência com outros sites no mesmo CloudPanel; migration one-way) e
    documentou três armadilhas reais: `PORT` do ecosystem tem precedência sobre o `.env`; o
    seed do primeiro admin é de tiro único (só com `users` vazia); senha de admin com `#`/`$`
    precisa de aspas simples no `.env` (o parser do Node corta, senão).
  - **Primeira chamada real de IA**: o Conselheiro respondeu uma consulta de verdade (Gemini)
    numa carreira real — `advisor_reports` deixou de ter 0 linhas.
  - **Ainda aberto**: a **câmera** (captura) exige HTTPS num celular real e **não** foi
    validada neste deploy. É o terceiro buraco — segue como validação de acompanhamento.

### 3.4 — Produto: o que o Conselheiro de IA ainda não faz

Registrado deliberadamente no blueprint da concepção (`design-proposals/blueprint.md`) como
**fora de escopo da v0.4.000**, não como bug:

- Parecer **individual de um prospecto** específico ("vale a pena contratar este jogador?").
- Plano de temporada (ex.: sugestão de minutagem para jogadores da base).
- Parecer dedicado de janela de transferências.

O Conselheiro hoje só opera em dois modos: parecer completo da carreira, ou uma pergunta
livre em texto — ambos cobrindo bem o caso geral, mas sem essas superfícies mais específicas.

### 3.5-bug — Conselheiro não sobrevive a sair da tela (primeiro uso real, 2026-07-21)

Descoberto no **primeiro disparo real do conselheiro em produção** (até então `advisor_reports`
tinha 0 linhas — ver ROADMAP, "buracos históricos"): o dono mandou uma pergunta, a resposta
demorou, ele saiu da tela e, ao voltar, estava tudo vazio ("zerou"). Não é aleatório — é uma
fraqueza de arquitetura em duas camadas:

1. **A chamada é síncrona e lenta.** `POST /api/careers/:id/advisor`
   (`server/src/routes/advisor.ts`) chama o provedor (pode levar 20–60s, `maxTokens: 1500`) e
   **só persiste a resposta depois** que a IA responde. Antes disso não existe nada salvo — não
   há conceito de "análise em andamento".
2. **Todo o estado de progresso vive no componente.** Em `web/src/components/AdvisorPanel.tsx`
   o `useMutation` (`isPending`, mensagem de erro) é estado local. Sair da tela **desmonta** o
   componente e evapora esse estado. Em celular/PWA é pior: o navegador suspende/mata a conexão
   da aba em segundo plano.

Efeito combinado: se a chamada **completou** no servidor antes da saída, o parecer fica salvo e
reaparece ao voltar; se ainda estava **em voo** (ou errou por timeout/parse) quando a tela
trocou, a conexão morre em segundo plano, **nada é persistido e a mensagem de erro some junto** —
volta-se ao vazio, sem pista do que houve.

**Conserto desejado** (tornar o conselheiro resiliente a navegação): feedback que sobreviva ao
desmonte e, idealmente, registrar a tentativa antes/depois da chamada para o usuário nunca ficar
"no escuro". Fica na fronteira entre o `0.5.000` (o conselheiro precisa *de fato responder* — é
um dos três buracos históricos) e o item 9 do `0.6.000` (guard-rails/observabilidade do BYOK).
Ainda **não tem plano numerado próprio**.

### 3.5 — Limitações conhecidas e aceitas (não são bugs)

- **Offline**: o PWA cacheia o *shell* da aplicação (Workbox/`vite-plugin-pwa`), mas todos os
  dados exigem rede — não há modo offline funcional para consultar/editar carreiras sem
  conexão. Isso é uma decisão deliberada (ver `plans/README.md`, "Findings rejected": import
  em worker_thread e fontes auto-hospedadas foram avaliados e adiados por baixo
  custo-benefício no volume atual).
- **Nacionalidade na prospecção** é uma aproximação: o filtro usa o país predominante da liga
  (não a nacionalidade real de cada jogador), porque não existe endpoint dedicado para isso
  na API do jogo. Aceito conscientemente (plano 010).
- **Chave de restauração é um bearer token puro**: quem tiver o código de 12 caracteres tem
  acesso de leitura ao blob — não há dono/conta associada. Aceitável porque a superfície é
  só-leitura e vai ser removida (ver 3.2), não seria aceitável se a escrita ainda existisse.

---

## 4. O que a rodada de acessibilidade da v0.4.000 encontrou (para referência)

Vale registrar porque é o tipo de problema que **reaparece facilmente** se alguém mexer na
paleta sem reauditar: um script mediu contraste WCAG entre pares de token nos dois temas e
achou duas falhas reais:

1. O **growpill** (a pílula rosa que mostra crescimento de overall) reprovava em AA no tema
   claro — 2.96:1 contra o mínimo de 4.5:1. Corrigido criando um token `--color-pink-deep`
   específico para texto sobre wash (o rosa "puro" continua reservado para traços de
   gráfico/padrão, que não têm requisito de contraste de texto).
2. O roxo primário como texto no tema escuro dava 4.29:1 (abaixo do mínimo). Corrigido
   ajustando o tom para `#9578ff` (4.97:1).

**Recomendação para o futuro**: qualquer mudança de paleta em `web/src/index.css` deveria
rodar esse tipo de checagem antes de ir para produção — não existe hoje um teste automatizado
para isso, foi um script ad-hoc de uma sessão de QA. Vale a pena promovê-lo a um teste real
(mesmo que rodado manualmente antes de releases de design).

---

## 5. Sugestões de iterações futuras

> **Estas sugestões já viraram plano.** O cronograma de versões está em
> [`ROADMAP.md`](ROADMAP.md); os itens 1–5 (curto prazo) estão detalhados como planos
> executáveis em [`plans/020`](plans/020-ci-minimo.md) a
> [`plans/023`](plans/023-deploy-real-e-validacao.md). A lista abaixo permanece como a
> justificativa de **por que** cada item existe.

Organizadas por horizonte, não por prioridade absoluta — a prioridade real depende do que o
dono do produto quiser jogar/usar primeiro.

### Curto prazo (dívida técnica e higiene) — quase todo entregue em 2026-07-21

1. ~~**Decidir o destino de `sync_blobs`**~~ → **FEITO na `0.4.002`**: removido de vez
   (migration 004 + rota/testes/banner). Ver §3.2.
2. ~~**Calibrar e promover a CSP** para enforced~~ → **FEITO na `0.4.003`**. Ver §3.2.
3. ~~**Remover código morto** (`adminToken()`)~~ → **FEITO na `0.4.002`**. Ver §3.1.
4. ~~**CI mínimo**~~ → **FEITO na `0.4.001`**: `.github/workflows/verify.yml`. Ver §3.3.
5. ~~**Primeiro deploy real**~~ → **FEITO em 2026-07-21** (`0.5.000`, plano 023): app no ar em
   `prancheta.pedrorivera.me`. Ver §3.3 para o que fechou e o que resta (validação da câmera).

> **Formalização**: `CHANGELOG.md` e `package.json` foram atualizados para `0.5.000` (com as
> entradas `0.4.001`–`0.4.003`). Falta só criar as **tags git** correspondentes — o último
> `git tag` ainda é `v0.4.000`. Sugestão: taguear no momento em que este commit for para a
> `main` (ex.: `v0.5.000`, e opcionalmente as três SHAME intermediárias).

**Validações e bugs em aberto após o deploy:**
- **Câmera** (captura de foto) ainda não exercida — exige HTTPS em celular real (§3.3).
- **Resiliência do conselheiro a navegação** (§3.5-bug): sair da tela zera a resposta em voo.
  Sem plano numerado; fica entre o `0.5.000` e o item 9 abaixo.

### Médio prazo (produto)

6. **Conselheiro — parecer individual de prospecto**: já desenhado no blueprint, é a extensão
   mais natural do que existe hoje (reusa o mesmo encanamento de `server/src/ai/advisor.ts`).
7. **Conselheiro — plano de temporada / janela de transferências**: as outras duas extensões
   já registradas como intencionalmente adiadas.
8. **Auditoria `improve`/`deep` nova**: as duas rodadas anteriores (2026-07-08 e 2026-07-14)
   antecederam contas, admin e todo o redesenho — vale rodar uma auditoria fresca de
   correctness/segurança/performance sobre o código novo (`auth/`, `ai/`, rotas per-user,
   componentes do shell) antes de crescer a base de usuários.
9. **Rate-limit e observabilidade do Conselheiro/Captura**: como cada chamada custa dinheiro
   real do usuário (BYOK), considerar um limite de chamadas por período configurável pelo
   próprio usuário ("não me deixe gastar mais de X chamadas por dia sem avisar").
10. **Testar o roteiro de QA (`screenshots/tests/`) integrado a CI** — mesmo que só rodando
    contra a base isolada e sem virar gate obrigatório no início.

### Longo prazo (arquitetura/escala)

11. **Migrar a API oficial do SoFIFA** (`server/src/sofifa/sofifa-api.ts` já existe como
    client pronto) se o projeto algum dia for aprovado como parceiro — eliminaria a
    dependência do dump estático do Kaggle e permitiria dados mais recentes/atualizados.
12. **Modo offline real** (se a demanda justificar): exigiria repensar a camada de dados no
    cliente (algo como um cache local com sincronização em segundo plano) — hoje o app
    assume rede disponível o tempo todo quando logado.
13. **Multiplayer/compartilhamento de carreira**: hoje cada carreira pertence a um único
    usuário; se houver interesse em uso compartilhado (ex.: liga entre amigos, cada um com
    seu próprio time na mesma save), isso exigiria um modelo de permissões que não existe.
14. **Internacionalização**: o app é PT-BR "de fábrica", sem camada de i18n — se algum dia
    fizer sentido abrir para outros idiomas, isso é um projeto à parte, não um ajuste
    incremental.

---

## 6. Como usar este documento

- **Se você é o Pedro voltando depois de um tempo**: leia a seção 1 para lembrar o que
  aconteceu e a seção 3 para saber o que está pendente antes de continuar.
- **Se você é uma IA/agente retomando o trabalho**: comece pela seção 3 (passos faltantes) —
  é a lista mais acionável. Releia a seção 2 antes de propor mudanças de arquitetura, para
  não reinventar decisões já tomadas conscientemente (seção 3.5 existe exatamente para isso).
- **Mantenha este documento honesto**: se você resolver um item da seção 3, mova-o para o
  CHANGELOG.md da release correspondente e apague-o daqui — não deixe listas de pendências
  zumbis que ninguém mais confia.
