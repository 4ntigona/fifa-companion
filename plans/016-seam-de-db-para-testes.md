# Plan 016: Seam de DB injetável — testes do server em base efêmera, não na base real

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check (rode primeiro)**: `git diff --stat fe420d4..HEAD -- server/src/db/index.ts server/src/routes/sync.test.ts server/src/routes/game-data.test.ts server/vitest.config.ts`
> Se algum arquivo in-scope mudou desde fe420d4, compare os excertos de "Current state" com o
> código vivo antes de prosseguir; divergência = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (o módulo de DB roda schema/pragmas no import e é importado por todas as rotas — a seam precisa resolver ANTES de qualquer import de rota; cuidado com ordem de import ESM)
- **Depends on**: none
- **Category**: tests / tech-debt
- **Planned at**: commit `fe420d4`, 2026-07-14

## Why this matters

Hoje os testes do server (`sync.test.ts`, `game-data.test.ts`) rodam contra a **base real de
desenvolvimento** (`server/data/companion.db`, que contém ~36k jogadores importados), porque
`db/index.ts` abre um singleton hardcoded no import. Os testes se protegem com cleanup manual e
"valores mágicos" (fifa_version=9999), mas: um teste que falhe no meio deixa lixo na base real,
testes de escrita pesada (quota MAX_BLOBS do sync, GC por TTL, import) são inviáveis com
segurança, e não há como rodar em CI com fixture limpa. Uma variável de ambiente que redirecione
o diretório de dados resolve tudo isso com ~5 linhas de produção.

## Current state

- `server/src/db/index.ts` (arquivo completo, 17 linhas):
  ```ts
  import Database from 'better-sqlite3'
  import { readFileSync } from 'node:fs'
  import { mkdirSync } from 'node:fs'
  import { dirname, join } from 'node:path'
  import { fileURLToPath } from 'node:url'

  const here = dirname(fileURLToPath(import.meta.url))
  export const DATA_DIR = join(here, '..', '..', 'data')
  mkdirSync(DATA_DIR, { recursive: true })
  mkdirSync(join(DATA_DIR, 'captures'), { recursive: true })

  export const db = new Database(join(DATA_DIR, 'companion.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const schema = readFileSync(join(here, 'schema.sql'), 'utf-8')
  db.exec(schema)
  ```
  `DATA_DIR` é const sem override; o schema (`server/src/db/schema.sql`) usa
  `CREATE TABLE IF NOT EXISTS` em tudo, então rodar contra um diretório vazio funciona.
- `server/src/routes/sync.test.ts:6-8` — comentário admitindo o problema:
  ```
  // Usa o mesmo singleton `db` das rotas (não há injeção de :memory: no db/index.ts —
  // fora de escopo deste plano). Por isso, todo código criado aqui é registrado e
  // removido ao final, para não deixar lixo na base real de desenvolvimento.
  ```
  Segue com `createdCodes` + `afterEach` deletando linha a linha.
- `server/src/routes/game-data.test.ts:6-8` — usa `const V = 9999` (fifa_version fictício) +
  `beforeEach/afterEach` com `DELETE FROM sofifa_players WHERE fifa_version = ?`.
- `server/vitest.config.ts`:
  ```ts
  import { defineConfig } from 'vitest/config'
  export default defineConfig({
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  })
  ```
- O build copia o schema para `dist/db/schema.sql` (script `build` em `server/package.json`) — o
  caminho do schema é relativo a `here`, NÃO a `DATA_DIR`; não mexa nele.
- Produção (PM2, `ecosystem.config.cjs`) não define `DATA_DIR` — o default atual (`server/data`)
  deve continuar valendo quando a env não existe. `README.md:131-132` promete que
  `server/data/` sobrevive a deploys — o default não pode mudar.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Testes server | `npm test --workspace server` | todos passam |
| Typecheck | `npx tsc -p server/tsconfig.json --noEmit` | exit 0 |
| Build | `npm run build --workspace server` | exit 0 |
| Verify completo | `npm run verify` | exit 0 |

## Scope

**In scope** (únicos arquivos a modificar):
- `server/src/db/index.ts` (a seam: ~2 linhas)
- `server/vitest.config.ts` (setar a env para os testes)
- `server/src/test-setup.ts` (criar, se optar por setupFile)
- `server/src/routes/sync.test.ts` (simplificar cleanup — opcional, ver Step 4)
- `server/src/routes/game-data.test.ts` (idem)

**Out de scope** (não toque):
- `server/src/db/schema.sql` — nada muda no schema.
- O caminho do `schema.sql` em `db/index.ts` (relativo a `here`) — só o `DATA_DIR` ganha
  override, o schema continua vindo do código.
- `ecosystem.config.cjs` / `.env.example` — produção não precisa saber da env (é um knob de
  teste; documentar em .env.example é opcional e NÃO necessário).
- Refatorar o singleton para injeção por parâmetro/factory — explicitamente rejeitado: a env
  resolve o problema com fração do risco.

## Git workflow

- Branch: `claude` (continuar nela).
- Um commit: `test(server): DATA_DIR via env — testes rodam em base efêmera, não na base real`.
- Não fazer push nem PR.

## Steps

### Step 1: A seam em `db/index.ts`

Troque a linha do `DATA_DIR` por:

```ts
// Testes apontam DATA_DIR para um diretório temporário (ver server/vitest.config.ts);
// em produção/dev a env não existe e o default (server/data) permanece.
export const DATA_DIR = process.env.DATA_DIR ?? join(here, '..', '..', 'data')
```

Nada mais muda no arquivo.

**Verify**: `npx tsc -p server/tsconfig.json --noEmit` → exit 0; suba o dev server sem a env e
confirme que ele continua usando a base real: `curl -s localhost:3344/api/versions | head -c 120`
→ JSON com versões importadas (FIFA 16/22 com playerCount > 0). (Use a porta/config do
`.claude/launch.json` ou `PORT=… node server/dist/index.js` após build.)

### Step 2: Env de teste no vitest

A env precisa estar setada ANTES de qualquer teste importar `db/index.ts`. Duas opções — use a A:

**A (recomendada)** — `server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Um diretório temporário por execução da suíte — o singleton de db/index.ts
// abre companion.db aqui em vez de na base real de desenvolvimento.
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'fifa-companion-test-'))

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
```

(O config roda no processo pai; vitest propaga `process.env` aos workers. Se isso NÃO acontecer
no ambiente do executor — teste do Step 3 falhando por ver a base real — mude para a opção B:
`test.env: { DATA_DIR: ... }` no mesmo config, que injeta a env nos workers explicitamente.)

**Verify**: `npm test --workspace server` → todos os testes existentes passam (17 no momento da
escrita). Se `game-data.test.ts` falhar porque espera dados... ver Step 3 — os testes atuais já
criam seus próprios dados fake e não dependem dos reais; devem passar numa base vazia.

### Step 3: Prova de isolamento

Adicione um teste em `server/src/db/isolation.test.ts` (criar):

```ts
import { describe, it, expect } from 'vitest'
import { DATA_DIR, db } from './index.js'
import { tmpdir } from 'node:os'

describe('isolamento de teste', () => {
  it('a suíte roda numa base efêmera, não na base real de desenvolvimento', () => {
    expect(DATA_DIR.startsWith(tmpdir())).toBe(true)
    // base efêmera nasce vazia — nenhum jogador real importado
    const count = (db.prepare('SELECT COUNT(*) AS c FROM sofifa_players').get() as { c: number }).c
    expect(count).toBe(0)
  })
})
```

ATENÇÃO: se os testes de `game-data.test.ts` inserirem linhas antes deste teste rodar, o COUNT
pode ser >0 por ordem de execução — nesse caso restrinja o count a `WHERE fifa_version NOT IN
(9999)` ou apenas asserte o `DATA_DIR`. O assert do `DATA_DIR` é o essencial.

**Verify**: `npm test --workspace server` → passa, incluindo o novo teste.

### Step 4: Simplificar o cleanup defensivo (opcional, recomendado)

Com a base efêmera, o cleanup linha-a-linha vira redundância inofensiva — mas os COMENTÁRIOS
que dizem "para não deixar lixo na base real" agora mentem. No mínimo atualize os comentários em
`sync.test.ts:6-8` e `game-data.test.ts:6-8` para refletir a nova realidade (ex.: "a suíte roda
numa base efêmera via DATA_DIR — ver vitest.config.ts"). Remover os `afterEach` de cleanup é
opcional; se remover, rode a suíte 2× seguidas para confirmar que não há dependência de ordem.

**Verify**: `npm test --workspace server` → passa; rodar duas vezes seguidas → passa nas duas.

### Step 5: Confirmar que produção/dev não mudou

**Verify**: `npm run verify` → exit 0; `grep -n "process.env.DATA_DIR" server/src/db/index.ts` →
1 match; iniciar o server SEM a env (como no Step 1) ainda serve os dados reais.

## Test plan

- Novo: `server/src/db/isolation.test.ts` (Step 3) — prova que a suíte não toca a base real.
- Existentes: os 17 testes atuais devem passar inalterados numa base vazia (eles já criam os
  próprios dados). Se algum depender silenciosamente de dados reais, isso é um bug do teste — 
  STOP e reporte qual.
- Padrão estrutural: seguir `server/src/routes/sync.test.ts` (describe/it, imports `.js`).

## Done criteria

- [ ] `npm run verify` → exit 0
- [ ] `npm test --workspace server` → passa, incluindo `isolation.test.ts`
- [ ] `grep -n "process.env.DATA_DIR" server/src/db/index.ts` → presente
- [ ] Server iniciado sem `DATA_DIR` continua lendo `server/data/companion.db` (dados reais)
- [ ] Rodar a suíte NÃO altera `server/data/companion.db` (compare `md5`/`stat -f %m` antes/depois
      — atenção: WAL pode tocar arquivos auxiliares; compare o COUNT de `sofifa_players` e
      `sync_blobs` antes/depois em vez do mtime se necessário)
- [ ] `git status --short` só arquivos in-scope
- [ ] `plans/README.md` atualizado

## STOP conditions

- Se `process.env` setado no `vitest.config.ts` NÃO chegar aos workers (Step 2, teste do Step 3
  vendo a base real) e a opção B (`test.env`) também falhar — STOP e reporte a versão do vitest
  e o comportamento observado.
- Se algum teste existente depender de dados reais da base de dev — STOP e reporte qual (não
  "conserte" importando dados reais para o fixture).
- Se a mudança parecer exigir tocar o caminho do `schema.sql` ou o script de build — STOP.

## Maintenance notes

- Novos testes de server podem agora exercitar caminhos de escrita pesada com segurança:
  quota `MAX_BLOBS` do sync (plano 004 deixou isso de fora por rodar na base real), GC por TTL,
  e até o fluxo de import com CSVs fixture. São follow-ups naturais destravados por este plano.
- Se um dia os testes precisarem de dados de jogo realistas, criar um fixture SQL pequeno e
  carregá-lo no setup — nunca apontar `DATA_DIR` para `server/data` em teste.
- Revisor: conferir que o default sem env é byte-idêntico ao comportamento anterior.
