# Plan 020: CI mínimo — `npm run verify` em cada push/PR

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check (rode primeiro)**: `git diff --stat 9dffa82..HEAD -- package.json server/vitest.config.ts web/vitest.config.ts package-lock.json`
> Se algum arquivo in-scope mudou desde `9dffa82`, compare com "Current state" antes de prosseguir.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (aditivo — não toca código de produção)
- **Depends on**: none
- **Category**: DX / processo
- **Planned at**: commit `9dffa82`, 2026-07-19
- **Release alvo**: `0.4.001`

## Why this matters

O projeto tem **61 testes automatizados** e um portão único (`npm run verify`) — mas nada
garante que alguém rode isso antes de commitar. Todo o histórico de qualidade depende de
disciplina manual. Este é o item de maior custo-benefício da lista de curto prazo do
[STATUS.md](../STATUS.md#33--qualidade-de-processo-nunca-existiu-não-é-regressão): o
comando já existe, os testes já existem, falta só automatizar a execução.

Ele vem **primeiro** na sequência 0.4.001→0.5.000 de propósito: os planos 021 (higiene) e
022 (CSP) mexem em código de produção, e é muito melhor que eles já nasçam protegidos por CI.

## Current state

- `package.json` (raiz, workspaces `server` + `web`):
  ```json
  "verify": "npm run typecheck && npm test && npm run build"
  ```
  `typecheck` = `tsc --noEmit` nos dois pacotes; `test` = vitest nos dois; `build` = web + server.
- `package-lock.json` existe na raiz (344 KB) → `npm ci` é viável e determinístico.
- `server/vitest.config.ts` cria um `DATA_DIR` temporário por execução (`mkdtempSync`) e usa
  `fileParallelism: false` — a suíte **nunca** toca `server/data/companion.db`. Roda igual em CI.
- `web/vitest.config.ts` usa `happy-dom`. Sem dependência de browser real.
- **Não há** `engines` declarado em nenhum `package.json`. O README/INSTALL afirmam
  "Node 20.12+ ou 22+" (o `--env-file-if-exists` do `ecosystem.config.cjs` exige 20.12+).
- **Não existe** diretório `.github/` no repositório.
- `better-sqlite3` é nativo; nos runners `ubuntu-latest` do GitHub as build tools já vêm
  instaladas e normalmente há binário pré-compilado — mas ver STOP condition abaixo.

## Steps

### Step 1 — Declarar a versão mínima de Node (torna a promessa verificável)

Em `package.json` (raiz), adicione:

```json
"engines": { "node": ">=20.12" }
```

Isso documenta no código o que hoje só existe em prosa no README/INSTALL, e faz o
`npm ci` avisar se alguém tentar instalar num Node velho.

### Step 2 — Criar o workflow

Crie `.github/workflows/verify.yml`:

```yaml
name: verify

on:
  push:
    branches: [main]
  pull_request:

# Um run por ref: um push novo cancela o anterior ainda em andamento.
concurrency:
  group: verify-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: ['20.12', '22']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run verify
```

Notas de decisão:

- **Matriz 20.12 + 22**: o projeto afirma suportar os dois. Sem a matriz, a afirmação nunca
  é testada. `20.12` (não `20`) porque é o piso real do `--env-file-if-exists`.
- **`fail-fast: false`**: se o 20.12 quebrar, ainda queremos saber se o 22 passa (e vice-versa).
- **`npm ci`** (não `npm install`): respeita o lockfile, é o comportamento correto em CI.
- **Sem `--workspaces`**: os scripts da raiz já orquestram os dois pacotes.

### Step 3 — Job informativo de auditoria de dependências

No mesmo arquivo, adicione um segundo job **que não bloqueia o merge** (o objetivo é
visibilidade, não travar o fluxo por um advisory transitivo de devDependency):

```yaml
  audit:
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm audit --audit-level=high
```

> Se um dia isso ficar barulhento demais, o certo é tratar o advisory — não remover o job.

### Step 4 — Badge no README

No topo de `README.md`, logo abaixo do título `# Prancheta`, adicione:

```markdown
[![verify](https://github.com/<OWNER>/<REPO>/actions/workflows/verify.yml/badge.svg)](https://github.com/<OWNER>/<REPO>/actions/workflows/verify.yml)
```

Substitua `<OWNER>/<REPO>` pelo remoto real (`git remote get-url origin` → hoje
`4ntigona/fifa-companion`).

### Step 5 — Registrar no CLAUDE.md

Na seção `## Verificação` do `CLAUDE.md`, acrescente uma linha:

```markdown
O CI (`.github/workflows/verify.yml`) roda `npm run verify` em Node 20.12 e 22 a cada
push/PR. Se ele falhar, o problema é seu — não do CI.
```

## Verification

1. `npm run verify` local continua verde (nada deve ter mudado no comportamento).
2. `node -e "console.log(process.version)"` — confirme que sua versão local satisfaz `>=20.12`;
   se não, o `npm ci` local vai avisar (é esperado e correto).
3. Faça push num branch e abra um PR de rascunho: os dois jobs da matriz devem rodar e passar.
4. Force uma falha proposital (ex.: quebre um teste num branch descartável) e confirme que o
   CI reprova — um CI que nunca falha não está testando nada.
5. Confirme que o badge no README renderiza verde depois do primeiro run em `main`.

## STOP conditions

- **`npm ci` falhando no `better-sqlite3` por falta de build tools no runner**: não
  "resolva" fixando uma versão antiga do pacote. Adicione o passo de instalação explícito
  (`sudo apt-get install -y build-essential python3`) antes do `npm ci` e reporte, para que a
  causa fique documentada.
- **Teste que passa local e falha só no CI**: STOP. Não marque como flaky nem re-rode até
  passar — isso quase sempre indica dependência de ordem, de fuso horário ou de estado de
  arquivo. Investigue e reporte a causa raiz.
- **Tentação de adicionar `continue-on-error: true` no job `verify`**: STOP. O job de
  auditoria pode ser informativo; o de verificação, não — senão o CI vira decoração.

## Maintenance notes

- **Lint (ESLint/Prettier) fica FORA deste plano de propósito.** Está registrado em
  `plans/README.md` como decisão consciente adiada desde 2026-07-08. Se um dia for adotado,
  vira um plano próprio e ganha um step neste workflow — não o enfie aqui de carona.
- O **QA visual com Playwright** (`screenshots/tests/`) também fica fora: é o item 10 do
  roadmap de médio prazo, com complexidade própria (precisa subir servidor + base isolada).
  Ver [`ROADMAP.md`](../ROADMAP.md).
- Se o tempo de CI incomodar, a otimização certa é cachear o build do `better-sqlite3`, não
  cortar a matriz de versões.
