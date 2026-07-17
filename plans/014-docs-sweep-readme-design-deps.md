# Plan 014: Docs sweep — README de produção, rotas, DESIGN.md stale, notas de deps

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check (rode primeiro)**: `git diff --stat fe420d4..HEAD -- README.md DESIGN.md CLAUDE.md web/src/store.ts server/src/vision/analyze.ts package.json`
> Se algum arquivo in-scope mudou desde fe420d4, compare os excertos de "Current state" com o
> código vivo antes de prosseguir; divergência = STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (só documentação e comentários — zero mudança de comportamento)
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `fe420d4`, 2026-07-14

## Why this matters

O README é o runbook de deploy do app, e ele **não menciona** as duas variáveis de ambiente que
importam para produção (`CORS_ORIGINS` e `ADMIN_TOKEN`, adicionadas pelo hardening do plano 004) —
quem seguir só o README publica com CORS refletindo qualquer origem e sem token de admin no
import. Além disso: a lista de rotas do README omite endpoints vivos, o DESIGN.md carrega uma
contagem de componentes stale desde o plano 001, o pin do vitest 4.x é uma armadilha silenciosa
para quem rodar `npm i vitest@latest` (rebaixaria para 3.x e reintroduziria o advisory de RCE do
happy-dom que motivou o pin), e a união `AiProvider` existe em dois arquivos sem referência
cruzada. Este plano fecha todas essas lacunas de documentação de uma vez.

## Current state

- `README.md:90` — o setup de produção diz apenas:
  ```
  cp server/.env.example server/.env   # ajuste PORT/HOST se precisar (padrão já serve)
  ```
- `README.md:134-142` — a seção "### Notas" fala de porta, upload e BYOK, mas nunca nomeia
  `CORS_ORIGINS` nem `ADMIN_TOKEN`.
- `README.md:147` — lista de rotas:
  ```
  `/api/versions`, `/api/teams`, `/api/players`, `/api/team/...` (leitura), `/api/import/*`
  ```
  Rotas reais registradas em `server/src/routes/game-data.ts`: `/api/versions`,
  `/api/leagues/:version`, `/api/teams/:version`, `/api/team/:version/:teamId`,
  `/api/players/:version`, `/api/player/:version/:playerId`. Faltam `/api/leagues` (usado pelos
  filtros de prospecção) e `/api/player/:version/:playerId` (reidratação).
- `server/.env.example` — já documenta `CORS_ORIGINS`, `ADMIN_TOKEN`, `SYNC_MAX_BLOBS`,
  `SYNC_TTL_DAYS` (todos consumidos em `server/src/`). O README só precisa apontar para lá.
- `DESIGN.md:63` — contagem stale:
  ```
  - Include known page component density: links (9), cards (6), navigation (2), buttons (1).
  ```
  O plano 001 flagou essa contagem como incorreta ("navigation (2)" não bate com o app) e a
  correção nunca foi aplicada. O app real tem 7 rotas e um header com 2-3 itens de navegação
  variáveis — a contagem hardcoded não é ground truth de nada.
- `server/package.json:29` e `web/package.json` (devDependencies) — `"vitest": "^4.1.10"`.
  `npm outdated` mostra vitest Latest = 3.2.7 (o dist-tag `latest` está ATRÁS do 4.x instalado).
  O 4.x foi escolhido de propósito no plano 002 para escapar de um advisory crítico de RCE no
  happy-dom; não há nota disso em lugar nenhum fora de `plans/README.md`.
- `web/src/store.ts:13`:
  ```ts
  export type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'openrouter'
  ```
- `server/src/vision/analyze.ts:3-4`:
  ```ts
  export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter'] as const
  export type AiProvider = (typeof AI_PROVIDERS)[number]
  ```
  Mesma união declarada 2× (web e server), sem comentário cruzado. Hoje em sincronia. Decisão
  desta auditoria: **não** criar workspace `shared/` para 4 literais — só documentar o acoplamento.
- Convenções: docs em PT-BR, tom direto, sem emoji além dos já usados; commits estilo
  conventional-commit em português (ex.: `docs: ...`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 |
| Verify completo | `npm run verify` | exit 0 (não estritamente necessário — só docs/comentários — mas barato) |

## Scope

**In scope** (únicos arquivos a modificar):
- `README.md`
- `DESIGN.md`
- `web/src/store.ts` (SÓ comentário na linha do `AiProvider`)
- `server/src/vision/analyze.ts` (SÓ comentário na linha do `AI_PROVIDERS`)
- `server/package.json` e `web/package.json` (SÓ comentário não é possível em JSON — ver Step 3,
  a nota vai no README/CLAUDE.md, NÃO nos package.json)

**Out of scope** (não toque):
- Qualquer mudança de código executável — este plano é 100% documentação/comentários.
- `server/.env.example` — já está correto; não mexer.
- Criar workspace `shared/` para o `AiProvider` — decisão explícita de NÃO fazer (4 literais,
  sem drift ativo; o comentário cruzado basta).
- `CLAUDE.md` — exceto a única linha do Step 3 (nota do vitest).

## Git workflow

- Branch: `claude` (continuar nela — convenção deste repo).
- Um commit: `docs: env vars de produção no README, rotas, DESIGN.md e notas de manutenção`.
- Não fazer push nem PR.

## Steps

### Step 1: README — variáveis de produção e rotas

1a. Em `README.md`, logo após a linha 90 (`cp server/.env.example server/.env ...`), troque o
comentário da linha para apontar as vars de produção. Formato sugerido:

```
cp server/.env.example server/.env
# Em produção, configure no .env (detalhes no próprio .env.example):
#   CORS_ORIGINS=https://companion.seudominio.com   ← sem isso a API reflete qualquer origem
#   ADMIN_TOKEN=<um segredo>                        ← só se quiser disparar o import de fora do servidor
```

1b. Na seção "### Notas" (`README.md:134-142`), adicione um bullet:

```
- **Hardening:** `CORS_ORIGINS` restringe quais origens falam com a API e `ADMIN_TOKEN` protege
  `POST /api/import` fora do loopback. Ambos documentados em `server/.env.example`, junto com
  `SYNC_MAX_BLOBS`/`SYNC_TTL_DAYS` (quota e expiração das chaves de restauração).
```

1c. Na linha 147, corrija a lista de rotas para:

```
  `/api/versions`, `/api/leagues/:v`, `/api/teams/:v`, `/api/team/:v/:id`, `/api/players/:v`,
  `/api/player/:v/:id` (leitura), `/api/import/*`
```

**Verify**: `grep -n "CORS_ORIGINS" README.md` → ≥2 ocorrências; `grep -n "api/leagues" README.md` → 1 ocorrência.

### Step 2: DESIGN.md — remover a contagem stale

Em `DESIGN.md:63`, remova a linha inteira (`- Include known page component density: ...`). A
contagem hardcoded está errada desde o plano 001 e não serve de ground truth; remover é melhor
que atualizar um número que vai stale de novo.

**Verify**: `grep -n "component density" DESIGN.md` → sem matches.

### Step 3: Nota do vitest 4.x no CLAUDE.md

Em `CLAUDE.md`, na seção "## Verificação", adicione ao final:

```
> **Não rebaixe o vitest**: o projeto usa vitest 4.x de propósito (o dist-tag `latest` do npm
> ainda aponta para 3.x). O pin escapa de um advisory crítico de RCE no happy-dom que as versões
> antigas puxavam. `npm i vitest@latest` seria um DOWNGRADE — não faça.
```

**Verify**: `grep -n "Não rebaixe o vitest" CLAUDE.md` → 1 match.

### Step 4: Comentário cruzado no AiProvider (web e server)

4a. Em `web/src/store.ts`, na linha do tipo (hoje linha 13), adicione acima:

```ts
// Mantido em sincronia manualmente com AI_PROVIDERS em server/src/vision/analyze.ts —
// ao adicionar/remover um provedor, mude LÁ também (o zod do /api/analyze valida contra ele).
export type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'openrouter'
```

4b. Em `server/src/vision/analyze.ts`, na linha do array (hoje linhas 3-4), adicione acima:

```ts
// Mantido em sincronia manualmente com o tipo AiProvider em web/src/store.ts —
// ao adicionar/remover um provedor, mude LÁ também (PROVIDER_LABELS/DEFAULT_MODELS ficam no web).
export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter'] as const
```

**Verify**: `npm run typecheck` → exit 0; `grep -c "sincronia manualmente" web/src/store.ts server/src/vision/analyze.ts` → 1 em cada.

## Test plan

Sem testes novos (docs/comentários). Verificação = greps dos steps + `npm run typecheck`.

## Done criteria

- [ ] `npm run typecheck` → exit 0
- [ ] `grep -n "CORS_ORIGINS" README.md` → ≥2 matches
- [ ] `grep -n "api/leagues" README.md` → 1 match
- [ ] `grep -n "component density" DESIGN.md` → 0 matches
- [ ] `grep -n "Não rebaixe o vitest" CLAUDE.md` → 1 match
- [ ] `grep -l "sincronia manualmente" web/src/store.ts server/src/vision/analyze.ts` → ambos
- [ ] `git status --short` mostra só arquivos in-scope
- [ ] `plans/README.md` atualizado

## STOP conditions

- Se `README.md:147` já não contiver a lista antiga de rotas (alguém a mudou) — reconcilie com as
  rotas reais em `server/src/routes/game-data.ts` em vez de aplicar o texto do Step 1c às cegas.
- Se `DESIGN.md:63` não contiver mais "component density" — pule o Step 2 e anote.
- Se qualquer step parecer exigir mudança de código executável além dos comentários — STOP.

## Maintenance notes

- Quando um provedor de IA for adicionado, os dois comentários do Step 4 são o lembrete; se a
  lista crescer além de ~6 providers ou drifar de fato, aí sim reavaliar um workspace `shared/`.
- Quando o dist-tag `latest` do vitest alcançar/passar o 4.x, a nota do Step 3 pode ser removida.
