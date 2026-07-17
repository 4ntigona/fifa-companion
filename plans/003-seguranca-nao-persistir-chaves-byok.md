# Plan 003: Não persistir chaves BYOK de IA no servidor (chave de restauração e backup)

> **Executor instructions**: Siga passo a passo, rode cada verificação, só toque arquivos in-scope.
> STOP condition → pare e reporte. Ao terminar, atualize `plans/README.md`.
>
> **Drift check**: `git diff --stat feba0bf..HEAD -- web/src/store.ts README.md`
> Se `web/src/store.ts` mudou, compare com os excertos abaixo antes de editar.

## Status
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 002 (para escrever o teste; se 002 não estiver pronto, faça o código e marque o teste como TODO no relatório)
- **Category**: security
- **Planned at**: commit `feba0bf`, 2026-07-08

## Why this matters
O README promete que as chaves BYOK de IA "vêm do navegador por request e **não são
persistidas**". Isso é verdade para o relay `/api/analyze`, mas **falso** para a chave de
restauração: ao gerar/atualizar a chave, o app serializa TODO o `localStorage` (incluindo
`ai.keys`, as chaves de API dos provedores) e envia para `sync_blobs` no servidor, em **texto
plano**, sob um código de 12 caracteres que "é a credencial". Qualquer um com o código (ou que o
adivinhe/abuse — ver plano 004) lê as chaves de API do usuário. O backup em arquivo (`exportBackup`)
também as inclui. Este plano remove as chaves BYOK de tudo que sai do dispositivo.

## Current state
`web/src/store.ts` — as chaves ficam em `ai.keys` (mapa provider→chave). O que sai do dispositivo:

`snapshotForSync` (linhas 427-431) — serializa tudo exceto `sync`, **mantendo `ai`**:
```ts
/** Serializa tudo, exceto o próprio ponteiro de sync (evita guardar código dentro do código). */
function snapshotForSync(db: LocalDb): string {
  const { sync: _sync, ...rest } = db
  return JSON.stringify(rest)
}
```
Usado por `generateRestoreKey` (POST /api/sync) e `pushToRestoreKey` (PUT /api/sync/:code).

`exportBackup` (linhas 397-405) — serializa `load()` inteiro (inclui `ai`) para o arquivo `.json`:
```ts
export function exportBackup() {
  const db = load()
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
  ...
}
```

`restoreFromKey` (linhas 455-469) e `importBackup` (linhas 407-415) fazem
`save({ ...emptyDb(), ...data, ai: { ...emptyDb().ai, ...data.ai }, sync: {...} })` — ou seja, se o
blob não trouxer `ai`, as chaves locais atuais são preservadas por `emptyDb().ai` (vazio) — ok.

Tipo `AiSettings` (linhas ~29-33): `{ activeProvider, keys: Partial<Record<AiProvider,string>>, models: Partial<...> }`.

Convenção do repo: funções puras no `store.ts`, sem libs novas. Testes (após plano 002) em
`web/src/store.test.ts` com `localStorage` fake (happy-dom).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck web | `npx tsc -p web/tsconfig.json --noEmit` | exit 0 |
| Test | `npm test --workspace web` | passa |
| Build | `cd web && npx vite build` | files generated |

## Scope
**In scope:**
- `web/src/store.ts` — remover `ai.keys` do snapshot de sync e do export
- `web/src/store.test.ts` (criar, se 002 pronto)
- `README.md` — corrigir a descrição da chave de restauração
**Out of scope:** `server/` (o servidor guarda o que recebe — a correção é não enviar); a UI de
Settings (o comportamento de salvar chave local não muda); cifrar o blob (é uma alternativa maior,
fora de escopo).

## Git workflow
Branch de `claude`; commit `fix(seg): não enviar chaves BYOK no sync/backup`. Não push/PR.

## Steps

### Step 1: Excluir `ai.keys` (mas manter `activeProvider`/`models`) do que sai do dispositivo
Em `web/src/store.ts`, crie um helper que produz uma cópia do `LocalDb` sem as chaves e use-o
tanto em `snapshotForSync` quanto em `exportBackup`. Alvo:

```ts
/** Remove segredos (chaves BYOK) de um db antes de exportá-lo/enviá-lo. Mantém provider/models. */
function stripSecrets(db: LocalDb): Omit<LocalDb, 'sync'> {
  const { sync: _sync, ...rest } = db
  return { ...rest, ai: { ...rest.ai, keys: {} } }
}

function snapshotForSync(db: LocalDb): string {
  return JSON.stringify(stripSecrets(db))
}
```
E em `exportBackup`, troque `JSON.stringify(db, null, 2)` por `JSON.stringify(stripSecrets(load()), null, 2)`
(mantendo a indentação `, null, 2`). Como `stripSecrets` já remove `sync`, o arquivo exportado não
levará o código de restauração nem as chaves — ambos são segredos; isso é desejado.

Nota: `restoreFromKey`/`importBackup` já fazem merge com `emptyDb().ai` (keys vazias), então dados
sem `ai.keys` restauram sem apagar as chaves que o usuário já tenha localmente. Não mude essa parte.

**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0.

### Step 2: Teste de regressão (se plano 002 concluído)
Crie `web/src/store.test.ts` com um caso que prova que o snapshot de sync e o export NÃO contêm
chaves:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setAiSettings, generateRestoreKey } from './store'
// mock do fetch usado por generateRestoreKey (api() em ./api/client)
beforeEach(() => localStorage.clear())
it('não inclui ai.keys no payload enviado ao servidor', async () => {
  setAiSettings({ key: { provider: 'openai', value: 'sk-secreta-NAO-VAZA' } })
  let sentBody = ''
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sentBody = String(init.body)
    return { ok: true, json: async () => ({ code: 'AAAA-BBBB-CCCC' }) } as Response
  }) as typeof fetch
  await generateRestoreKey()
  expect(sentBody).not.toContain('sk-secreta-NAO-VAZA')
  expect(sentBody).not.toContain('"keys"')  // ou: JSON.parse(...).ai.keys vazio
})
```
Ajuste o mock ao shape real de `api()` (ver `web/src/api/client.ts`: faz `fetch` e `res.json()`).
**Verify**: `npm test --workspace web` → o novo teste passa.

### Step 3: Corrigir o README
Em `README.md`, na descrição da chave de restauração / backup, deixe explícito que **as chaves de
IA NÃO são incluídas** na chave de restauração nem no arquivo de backup (por segurança) — o usuário
reconfigura a chave de IA em cada dispositivo. Ajuste qualquer frase que diga o contrário.
**Verify**: `grep -n "restauraç\|backup" README.md` e leitura humana confirmam a ressalva.

## Test plan
- Novo teste em `web/src/store.test.ts`: o payload de `generateRestoreKey`/`pushToRestoreKey` e o
  conteúdo de `exportBackup` não contêm nenhuma chave BYOK. Modele o mock de `fetch` conforme
  `web/src/api/client.ts`.
- Verificação manual: em Settings, salvar uma chave de IA, gerar chave de restauração, e conferir
  no servidor que `sync_blobs.data` não contém a string da chave (ou inspecionar o corpo no
  Network tab).

## Done criteria
- [ ] `npx tsc -p web/tsconfig.json --noEmit` → exit 0
- [ ] `cd web && npx vite build` → exit 0
- [ ] `grep -n "keys: {}" web/src/store.ts` → mostra o strip em `stripSecrets`
- [ ] (se 002 pronto) `npm test --workspace web` → novo teste passa
- [ ] `git status --short` só arquivos in-scope
- [ ] `plans/README.md` atualizado

## STOP conditions
- Se `snapshotForSync`/`exportBackup` já tiverem sido alterados por outro plano e não baterem com
  os excertos — reconcilie antes; em dúvida, PARE.
- Se remover `sync` do export quebrar algum fluxo que dependa do código estar no arquivo — não
  deveria (o código é segredo), mas se `importBackup` esperar `data.sync.code`, reporte.

## Maintenance notes
- Blobs de sync já criados em produção contêm chaves antigas em texto plano → tratar como
  comprometidas e orientar o usuário a **rotacionar** as chaves de IA e **regenerar** a chave de
  restauração após o deploy deste fix.
- Alternativa futura mais forte: cifrar o blob no cliente com passphrase derivada da própria chave
  de restauração (E2E), aí as chaves poderiam voltar ao blob sem exposição no servidor.
- Revisor: garantir que `activeProvider`/`models` continuam no snapshot (só `keys` sai) — restaurar
  em outro aparelho deve manter o provedor/modelo escolhidos, só pedindo a chave de novo.
