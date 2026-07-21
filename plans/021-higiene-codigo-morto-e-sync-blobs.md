# Plan 021: Higiene — código morto, comentários mentirosos e o destino do `sync_blobs`

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check (rode primeiro)**: `git diff --stat 9dffa82..HEAD -- server/src/settings.ts server/src/index.ts server/src/routes/sync.ts web/src/components/MigrateLocalBanner.tsx server/.env.example`
> Se algum arquivo in-scope mudou desde `9dffa82`, compare com "Current state" antes de prosseguir.
>
> **⚠️ Este plano contém um ponto de DECISÃO do dono (Step 3) e uma operação destrutiva de
> banco. Não execute o Step 3 sem a decisão explícita e sem o backup do Step 0.**

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — a parte de código morto é trivial; a remoção do `sync_blobs` mexe em
  schema de produção e **há dado real lá** (ver "Current state")
- **Depends on**: 020 (CI) — recomendado, para que a limpeza nasça protegida
- **Category**: tech-debt
- **Planned at**: commit `9dffa82`, 2026-07-19
- **Release alvo**: `0.4.002`

## Why this matters

Três coisas apodrecem juntas aqui, todas verificadas no código nesta data
([STATUS.md §3.1 e §3.2](../STATUS.md#31--documentação-que-já-esteve-errada-e-foi-corrigida-agora)):

1. **Código morto que engana quem lê**: `adminToken()` continua exportado, com um comentário
   que descreve um comportamento de segurança que **não é mais o real**.
2. **Comentários que mentem sobre o modelo de dados**: o cabeçalho de `settings.ts` ainda
   descreve o app como local-first ("os dados do usuário ficam no navegador") — isso deixou de
   ser verdade na v0.3.000.
3. **Uma promessa quebrada duas releases seguidas**: o comentário em `index.ts` diz que o
   `sync_blobs` "sai na v0.3.000". Estamos na v0.4.000 e ele continua lá.

Nenhum desses é um bug funcional. Todos são armadilhas para o próximo leitor — humano ou
agente — que vai tomar decisão errada baseado em documentação interna falsa.

## Current state (verificado em `9dffa82`)

### 1. `server/src/settings.ts` — 2 problemas

```ts
/**
 * Configuração do servidor.
 *
 * Os dados do usuário (carreiras, jogadores, chaves BYOK de IA) ficam no navegador
 * (localStorage) — o servidor é stateless quanto a isso.        ← FALSO desde a v0.3.000
 * ...
 */

export function kaggleCreds() { ... }        // ← VIVO: usado em routes/import.ts:50

/**
 * Token opcional que autoriza disparar a importação da database (POST /api/import)
 * a partir de fora do loopback. Sem ele, o import só é aceito de 127.0.0.1/::1 —  ← FALSO
 */
export function adminToken(): string | null { ... }   // ← MORTO: zero chamadas
```

Verificação feita: `grep -rn "adminToken" server/src --include="*.ts"` devolve **apenas a
definição**. O guard real é `isAuthorizedForImport()` em `routes/import.ts:15-18`:

```ts
export function isAuthorizedForImport(req: FastifyRequest): boolean {
  if (LOOPBACK_IPS.has(req.ip)) return true
  return req.user?.role === 'admin'
}
```

### 2. `server/src/index.ts:77` — comentário com data vencida

```ts
syncRoutes(app)   // GET fica público como fonte de migração (deprecado; sai na v0.3.000)
```

### 3. `sync_blobs` — o estado real do banco de produção

**Importante: não é um no-op.** Na base real (`server/data/companion.db`, 384 MB):

| Item | Valor |
|---|---|
| Linhas em `sync_blobs` | **1** |
| Código | `Y9HU-U7UK-7ZDR` |
| Tamanho do blob | 85.420 bytes |
| `updated_at` | `2026-07-15 00:35:25` (**anterior** à v0.3.000, de 2026-07-17) |
| Usuários | 2 (`pedro@dev.local` id 1, `fifa@pedrorivera.me` id 4) |
| Carreiras | 1 — "FC Barcelona", 30 jogadores, de `pedro@dev.local` |

Ou seja: existe **um** backup do modelo antigo que pode ou não já ter sido migrado para a
conta. Só o dono sabe. **Nunca dropar essa tabela sem arquivar o conteúdo antes.**

Superfície viva do `sync_blobs` hoje:

- `server/src/routes/sync.ts` — só `GET /api/sync/:code` (escrita já foi removida na v0.3.000)
  + `pruneExpiredSyncBlobs()` (GC no boot, usa `SYNC_TTL_DAYS`).
- `server/src/index.ts` — registra a rota e chama o GC no boot.
- `web/src/components/MigrateLocalBanner.tsx` — **dois caminhos independentes**:
  - `readLegacyBlob()` (linha 14) → lê `localStorage`, **não depende do servidor**;
  - `migrate.mutate('code')` (linhas 27-30) → `GET /api/sync/:code`, **depende** do servidor.
- `server/.env.example` — documenta `SYNC_TTL_DAYS`.

## Steps

### Step 0 — Backup e arquivamento (OBRIGATÓRIO antes de qualquer coisa)

Com o servidor de dev **parado**:

```bash
cd "$(git rev-parse --show-toplevel)"

# 1. Backup completo do banco (online backup — nunca `cp`, por causa do WAL)
mkdir -p ~/backups
sqlite3 server/data/companion.db ".backup '$HOME/backups/prancheta-pre-021-$(date +%F).db'"

# 2. Arquivar o conteúdo do blob em JSON legível, fora do banco
sqlite3 server/data/companion.db \
  "SELECT data FROM sync_blobs WHERE code='Y9HU-U7UK-7ZDR';" \
  > ~/backups/sync-blob-Y9HU-U7UK-7ZDR.json

# 3. Conferir que o arquivo tem conteúdo plausível (~85 KB, JSON válido)
ls -la ~/backups/sync-blob-Y9HU-U7UK-7ZDR.json
python3 -c "import json,sys; d=json.load(open('$HOME/backups/sync-blob-Y9HU-U7UK-7ZDR.json')); print('carreiras:', len(d.get('careers', [])), '| jogadores:', len(d.get('careerPlayers', [])))"
```

**STOP** se o passo 3 falhar (JSON inválido ou arquivo vazio) — significa que o blob está
corrompido ou o schema mudou; reporte antes de continuar.

### Step 1 — Remover o código morto e corrigir os comentários mentirosos

Em `server/src/settings.ts`:

- **Apague** a função `adminToken()` inteira e seu bloco de comentário.
- **Reescreva** o cabeçalho do arquivo para descrever o modelo real:

```ts
/**
 * Configuração do servidor.
 *
 * Desde a v0.3.000 os dados do usuário (carreiras, elencos, snapshots, prospecção,
 * pareceres do conselheiro) vivem no SQLite do servidor, por user_id. O que continua
 * fora daqui, por invariante: as chaves de IA (BYOK), que ficam no navegador de cada
 * usuário e nunca são persistidas pelo servidor.
 *
 * Sobra neste arquivo apenas a credencial opcional do Kaggle, usada para baixar a
 * database do jogo (recurso compartilhado, somente leitura). O dataset é público e o
 * download funciona sem autenticação; as credenciais só são necessárias se o Kaggle
 * passar a exigir login.
 */
```

Em `server/.env.example`: confirme que **não há** menção a `ADMIN_TOKEN` (já foi removida em
`9dffa82`, mas verifique — se voltou, é regressão).

### Step 2 — Corrigir o comentário de data vencida

Em `server/src/index.ts:77`, substitua o comentário conforme a decisão do Step 3:

- Se **Caminho A** (remover): a linha inteira sai (ver Step 3A).
- Se **Caminho B** (manter): troque por algo honesto, sem data inventada:
  ```ts
  syncRoutes(app)   // legado só-leitura: fonte da migração one-shot do modelo pré-contas
  ```

### Step 3 — DECISÃO DO DONO: o que fazer com o `sync_blobs`

> **Não escolha por conta própria.** Apresente os dois caminhos ao dono com os fatos do
> "Current state" (existe 1 blob real, de antes das contas) e execute o escolhido.

**Recomendação**: Caminho A (remover), **depois** de confirmar que os dados daquele blob já
estão numa conta — o arquivamento do Step 0 garante que nada se perde de qualquer forma.

---

#### Caminho A — Remover de vez (recomendado)

Justificativa: a migração era one-shot para a transição local-first → contas. Manter significa
carregar para sempre uma rota **pública e não autenticada** (`GET /api/sync/:code`) cujo único
credential é um código de 12 caracteres, para servir um caso de uso que já passou.

1. **Migration `004-drop-sync-blobs.sql`** em `server/src/db/migrations/`:
   ```sql
   -- Remove o resto do modelo pré-contas (chave de restauração). O conteúdo foi
   -- arquivado fora do banco antes desta migration (ver plans/021, Step 0).
   -- Migrations NUNCA tocam sofifa_players/sofifa_teams — esta não é exceção.
   DROP TABLE IF EXISTS sync_blobs;
   ```

2. **Servidor**:
   - Apague `server/src/routes/sync.ts`.
   - Em `server/src/index.ts`: remova o `import { syncRoutes, pruneExpiredSyncBlobs }`, a
     chamada `syncRoutes(app)` e a chamada `pruneExpiredSyncBlobs()`.
   - Apague `server/src/routes/sync.test.ts`.

3. **Web** — remova **apenas** o caminho de código de restauração do
   `web/src/components/MigrateLocalBanner.tsx`, preservando o caminho `readLegacyBlob()`
   (localStorage), que não depende do servidor e continua útil de graça:
   - estados `restoreCode` / `showCode` e seus inputs/botões;
   - o ramo `source === 'code'` da mutation `migrate`;
   - o botão "Tem dados no modelo antigo (chave de restauração)?" (linhas 41-49) — sem o
     caminho de código, o banner só deve aparecer quando `legacy` existir de fato.

4. **Docs**: remova `SYNC_TTL_DAYS` de `server/.env.example`; atualize a menção a "chave de
   restauração (legado)" em `README.md` (seção Conceitos) e a linha correspondente no
   `CLAUDE.md` (seção "Modelo de dados"); marque o item como resolvido em `STATUS.md §3.2`.

#### Caminho B — Manter, mas parar de mentir

Se o dono quiser preservar a porta de entrada da migração por mais tempo:

1. Não crie migration. Não mexa no código.
2. Corrija **todos** os lugares que prometem uma data: `server/src/index.ts:77`,
   `CLAUDE.md` ("some numa release futura"), `README.md` ("sai numa versão futura"),
   `server/src/routes/sync.ts` (docblock "some na limpeza pós-v0.3.000").
3. Substitua a promessa por um **critério**, não uma data. Ex.: *"sai quando não houver mais
   nenhum blob em `sync_blobs` (hoje: 1)"*.
4. Atualize `STATUS.md §3.2` registrando a decisão consciente de manter.

---

## Verification

Independente do caminho:

1. `npm run verify` — typecheck + 61 testes + build, tudo verde.
   - No Caminho A, a contagem cai (os testes de `sync.test.ts` saem). Confirme que a queda é
     **exatamente** o número de testes daquele arquivo e que nenhum outro sumiu.
2. `grep -rn "adminToken" server/src` → zero resultados.
3. `grep -rn "sai na v0.3.000\|some numa release futura\|sai numa versão futura" . --include="*.md" --include="*.ts"`
   → zero resultados (Caminho A) ou zero promessas de data (Caminho B).

Adicionalmente, no **Caminho A**:

4. **Teste de migration contra cópia da base real** (o teste que mais importa aqui):
   ```bash
   cp ~/backups/prancheta-pre-021-*.db /tmp/teste-migration.db
   DATA_DIR=/tmp/teste-dir node -e "
     const fs=require('fs'); fs.mkdirSync('/tmp/teste-dir',{recursive:true});
     fs.copyFileSync('/tmp/teste-migration.db','/tmp/teste-dir/companion.db');
   "
   DATA_DIR=/tmp/teste-dir npx tsx server/src/index.ts   # sobe, aplica a 004, Ctrl+C
   sqlite3 /tmp/teste-dir/companion.db "SELECT name FROM sqlite_master WHERE name='sync_blobs';"   # vazio
   sqlite3 /tmp/teste-dir/companion.db "SELECT COUNT(*) FROM sofifa_players;"                      # 180021
   sqlite3 /tmp/teste-dir/companion.db "SELECT COUNT(*) FROM careers;"                             # 1
   ```
   Os dados do jogo e as carreiras **têm** que sobreviver intactos.
5. Suba o app e confirme que o banner de migração ainda aparece corretamente para quem tem
   blob no `localStorage` (e que não aparece quando não tem).

## STOP conditions

- **Step 0 não concluído** → não prossiga para o Step 3A em hipótese alguma.
- **A verificação 4 mostrar qualquer mudança em `sofifa_players`/`sofifa_teams`** → STOP
  imediato. É a invariante mais dura do projeto: migrations não tocam a database do jogo.
- **O dono não decidiu o Step 3** → execute Steps 0, 1 e 2 (que são seguros e independentes),
  entregue, e deixe o Step 3 explicitamente pendente. Não escolha por ele.
- **Tentação de "aproveitar a viagem" e mexer em outra coisa** → STOP. Este plano é de
  higiene; qualquer refatoração oportunista aqui polui o diff que precisa ser auditável.

## Maintenance notes

- O `MigrateLocalBanner` sobrevive no Caminho A porque o caminho de `localStorage` é
  server-independent e custa zero. Quando o próprio blob local deixar de fazer sentido
  (ninguém mais tem navegador com dados pré-contas), aí sim o componente inteiro sai — mas
  isso é outra decisão, outro dia.
- Se o Caminho B for escolhido, vale colocar um lembrete concreto: quando
  `SELECT COUNT(*) FROM sync_blobs` chegar a zero, o Caminho A vira trivial e sem risco.
