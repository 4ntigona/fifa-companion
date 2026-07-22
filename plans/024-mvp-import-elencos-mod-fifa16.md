# Plan 024: MVP — importar a database de um mod do FIFA 16 (FIFA Friends) como uma versão do jogo

> **Executor instructions**: Este plano tem um **spike de viabilidade bloqueante** no Step 1.
> **Não escreva nenhuma linha de código de produto** (importador, rota, UI) antes de o Step 1
> fechar com um go/no-go explícito. A abordagem inteira depende de conseguir ler o `.db` do
> FIFA 16 **no macOS, em Node/TS**, sem as GUIs Windows-only, e de os nomes/nacionalidades/ligas
> saírem legíveis. Se isso não for possível, o plano muda de forma (ver "Caminho B" no Step 1) —
> reporte antes de seguir.
>
> **Drift check**: `git log --oneline f0dc50a..HEAD`. Este plano nasce depois do `0.5.000`
> (deploy real + câmera validada). Contexto de origem: [`STATUS.md §3.6`](../STATUS.md) e o item
> 15 (longo prazo) do [`ROADMAP.md`](../ROADMAP.md), cujo gatilho disparou: o dono quer começar
> pelo FIFA 16 + FIFA Friends.

## Status

- **Priority**: P3 (item de longo prazo cujo gatilho disparou; não bloqueia nada)
- **Effort**: **XL** — extrair a database **inteira** de times/jogadores e importá-la como uma
  versão nova é grande. Por isso o plano é estagiado e spike-gated; o valor entra em fases.
- **Risk**: **HIGH** — o risco não é quebrar o app, é **descobrir** que não dá para ler o `.db`
  em Node no Mac (ou que nomes/nacionalidades/ligas não resolvem). Todo o plano é estruturado
  para provar isso barato antes de investir.
- **Depends on**: nada de código; senta depois do `0.5.000`.
- **Category**: direção / integração (mods)
- **Planned at**: commit `f0dc50a`, 2026-07-21 (revisado no mesmo dia após decisão de escopo do
  dono: puxar a **base inteira**, não só o elenco do jogador)

## Why this matters

O Prancheta é sobre **desenvolvimento de elenco** — e no modo carreira isso é inseparável de
**transferências e scouting**. Não basta o app conhecer o time do jogador: para o Scout, a
prospecção e as negociações fazerem sentido, o app precisa da **base inteira** de times e
jogadores como ela está no jogo do dono. Quem joga com mod — no caso, **FIFA Friends v10 no
FIFA 16** — tem essa base inteira, atualizada e coerente, já dentro do jogo, mas o Prancheta hoje
só enxerga os dumps SoFIFA/Kaggle (rosters vanilla, muitas vezes defasados frente ao mod).

**A sacada de arquitetura**: os elencos do mod ocupam exatamente o papel que
`sofifa_players`/`sofifa_teams` já ocupam — a database do jogo, read-only, buscável, chaveada por
`fifa_version`. Então o caminho certo **não** é tratar o mod como "jogadores de carreira" (como a
foto). É **importar o mod como mais uma versão da database do jogo**. Feito isso, Scout, seleção
de time na criação de carreira, prospecção e perfil de jogador passam a funcionar sobre os
elencos do mod **sem código novo nessas telas** — elas já filtram por `fifa_version`.

O FIFA 16 é o alvo do **MVP** por dois motivos técnicos (ver análise no STATUS/ROADMAP): seu
formato de database é o clássico da EA, dominado pela comunidade há anos e com **bibliotecas
Node** que o entendem; o FIFA 22 (Frostbite/`.fifamod`, via FIFA Editor Tool) é a fase 2.

## Ambiente real (dado pelo dono — respeitar)

| Máquina | Papel |
|---|---|
| PC Windows (Ryzen 2400G, sem VGA dedicada, 16 GB RAM, SSD básico) | **só roda o jogo + mod**. Não forçar ferramenta pesada aqui. |
| Mac mini M4 (onde o Prancheta é desenvolvido) | **onde a ferramenta de extração roda**. |

Fluxo aceito pelo dono: **copiar os arquivos brutos** do mod (Windows → Mac) e trabalhar sobre
eles no Mac. A ferramenta recebe um **arquivo estático** (o `.db` do jogo modado), não precisa
conversar com o jogo nem rodar no Windows.

## Escopo do MVP (o que É e o que NÃO É)

**É** (o corte que entrega valor de verdade para transferências/scout):

1. Ler o `data/db/fifa_beta_db.db` do FIFA 16 + FIFA Friends **no Mac, em Node/TS**.
2. Extrair a database **inteira**: **todos os times e todos os jogadores**, com os campos que o
   Prancheta usa — nome, posição(ões), overall, potencial, valor, idade, nacionalidade, clube,
   liga, número; e o máximo de atributos que o db der para `attributes_json`.
3. Importar isso como uma **nova versão da database do jogo** (`sofifa_players`/`sofifa_teams`),
   reusando o pipeline de import que já existe para os dumps do Kaggle.
4. Resultado: Scout, criação de carreira (seleção de time real), prospecção e perfil de jogador
   funcionando sobre os rosters do mod — **sem reescrever essas telas**.

**NÃO é** (fica para depois — não deixar o escopo inchar):

- Faces, kits, estádios, narração — **descartados até segunda ordem** por decisão do dono.
  Nada de assets; só **dados de times e jogadores**.
- FIFA 22 / `.fifamod` / Frostbite (fase 2, plano próprio).
- "Casar" os jogadores do mod com os do dump vanilla (dedup entre versões). Cada versão é
  independente, como já são hoje as versões vanilla entre si.
- Escrever um parser do formato binário EA do zero, se as libs Node existentes já resolverem.

## Decisão de design a resolver no Step 1/2 (não hand-wave)

`fifa_version` é **INTEGER** (`15..24`) e chaveia tudo. Uma versão de mod do FIFA 16 **não** pode
ser `16` (colidiria com o dump vanilla) nem um valor não-inteiro. Precisa decidir **como
representar uma versão de mod** ao lado das vanilla:

- um código inteiro distinto (ex.: `116`, `1610`) reservado ao mod; **e**
- o rótulo exibido (`/api/versions` → `label`, `imported`, `createClub`) precisa aprender esse
  código — hoje há um mapa `fifa_version → label` ("FIFA 16") que terá de carregar algo como
  "FIFA 16 — FIFA Friends v10", além de `createClub` correto (FIFA 16 não tem criar-clube).

Investigar onde esse mapa vive (rotas de game-data / versões) faz parte do Step 2.

## Invariante de produto — o que muda e o que NÃO muda

O baseline diz que `sofifa_players`/`sofifa_teams` são **read-only, nunca inventadas, importadas
por versão de dumps SoFIFA/Kaggle** (ver `001-baseline.sql` e `CLAUDE.md`). Este plano **amplia a
fonte** sem quebrar a invariante:

- **NÃO muda**: os dados continuam **reais** (são o que está no jogo do dono, não inventados),
  as tabelas continuam **read-only para a aplicação**, e **migrations continuam sem tocá-las** —
  quem popula é o **import** (é assim que a vanilla entra também).
- **Muda**: a fonte deixa de ser só "dump do Kaggle" e passa a incluir "a database do jogo como o
  dono a tem instalada (vanilla **ou** mod)". Isso precisa de uma nota explícita em `CLAUDE.md` e
  em `STATUS.md` (a redação atual sugere Kaggle como única fonte). Ajustar no Step 4.

## Realidade técnica (pesquisada — a confirmar no Step 1)

Alvo (schema do Prancheta, de `001-baseline.sql`):

- `sofifa_players(fifa_version, player_id, short_name, long_name, positions, overall, potential,
  value_eur, age, nationality_name, club_team_id, club_name, league_name, league_level,
  club_jersey_number, …, pace/shooting/passing/dribbling/defending/physic, attributes_json)`.
- `sofifa_teams(fifa_version, team_id, team_name, league_id, league_name, league_level,
  nationality_name, overall, attack, midfield, defence, transfer_budget_eur, star_rating, …)`.

Fonte (o que a pesquisa indica sobre o `.db` do FIFA 16 — **não** verificado contra o arquivo
real ainda):

- Elenco/base em `data/db/fifa_beta_db.db` (+ `fifa_beta_db-meta.xml`), formato binário EA. O
  FIFA Friends reescreve esse arquivo. Também há "squad files" em `Documentos\FIFA 16`
  (candidatos alternativos se o mod guardar rosters lá).
- Tabelas de interesse: `players`, `teams`, `teamplayerlinks` (time↔jogador + número),
  `leagueteamlinks` (time↔liga), mais as tabelas de **strings** (nomes/nações/ligas).
- **Pegadinhas conhecidas — o spike TEM que vencer as três**:
  - **Nomes**: no db da EA os nomes de jogador/time são **índices** para tabelas de strings
    (ex.: `dcplayernames`), não strings diretas. Sem resolver o join, o elenco sai sem nome.
  - **Nacionalidade**: `nationality` é id → tabela de nações; precisa resolver para preencher
    `nationality_name` (o Scout filtra por isso).
  - **Idade/posição**: `birthdate` é numérico (dias desde uma época) → idade; `preferredposition`
    é enum numérico → "ST/CM/GK…". Libs como `fifatables` (`formatRawValue`) podem já tratar.
- **Agregados PAC/SHO/PAS/DRI/DEF/PHY**: o db da EA guarda os ~35 atributos **individuais**; os 6
  "de face" são computados. As colunas `pace..physic` são **nullable** no schema do Prancheta —
  para o MVP, é aceitável deixá-las NULL e jogar os atributos individuais em `attributes_json`
  (que é NOT NULL, mas o db do mod fornece atributos de sobra para preenchê-lo). Confirmar que a
  UI (Player.tsx / Scout) tolera `pace..physic` NULL.
- Ferramentas Node candidatas: [`Celtian/dbmaster-cli`](https://github.com/Celtian/dbmaster-cli)
  (converte tabelas, FIFA 16, Node ≥12) e [`Celtian/fifatables`](https://github.com/Celtian/fifatables)
  (schemas TS das tabelas + `formatRawValue`; **só descreve** as tabelas, não lê binário).

## Steps

### Step 1 — SPIKE de viabilidade (bloqueante, go/no-go)

**Objetivo**: provar, com o arquivo real do dono, que dá para transformar o `.db` do FIFA Friends
em dados legíveis de **times e jogadores** — a base inteira — **no Mac, em Node**. Nada de
UI/rota/importador ainda.

Preparação (dono): no PC Windows, localizar e copiar para o Mac:
- `<pasta do FIFA 16>/data/db/fifa_beta_db.db` **e** `fifa_beta_db-meta.xml`;
- por garantia, `Documentos\FIFA 16` (squad files), caso o mod guarde rosters lá.
Colocar em `/tmp/fifa16-mod/` (fora do repo — arquivos de jogo/mod, não versionar).

**Caminho A (preferido) — pipeline 100% Node no Mac:**
1. Em scratch (`/private/tmp/.../scratchpad`, **não** no repo), instalar/testar `dbmaster-cli`:
   ele lê o `fifa_beta_db.db` **bruto** e produz tabelas (txt/xml/csv/json)? Rodar
   `dbmaster --help` e converter `players`, `teams`, `teamplayerlinks`, `leagueteamlinks` e as
   tabelas de nomes/nações.
2. Se sim: contar **todos os times e jogadores** (sanidade vs o que o FIFA Friends anuncia —
   400+ times BR, elencos completos) e montar **um** time conhecido cruzando as tabelas.
3. Provar as três pegadinhas: **nome legível** (join de `dcplayernames`), **nacionalidade
   legível**, **idade/posição convertidas**. Conferir à mão contra o jogo.
4. Usar `fifatables` para validar/formatar tipos.

**Caminho B (fallback) — desempacotar uma vez, depois Node:**
Se nenhuma lib Node ler o `.db` bruto no Mac, o dono desempacota **uma vez** no Windows
(conversão `.db → txt/xml` por uma ferramenta como DB Master), copia os txt/xml para o Mac, e a
ferramenta opera sobre esses txt/xml (aí `fifatables` cobre os schemas). Ainda respeita "arquivos
brutos no Mac", só com um passo manual a mais no Windows.

**Portão go/no-go (obrigatório reportar):**
- ✅ **GO** se, ao fim do Step 1, existir: (a) a contagem plausível de todos os times/jogadores,
  e (b) o elenco de um time conferido contra o jogo — nome, nacionalidade, overall, potencial,
  idade, posição, número, **tudo legível**.
- 🟡 **GO-B** se só o Caminho B funcionar (registrar o passo manual do Windows como custo).
- ❌ **NO-GO** se nem A nem B produzirem dados legíveis. **PARE**, escreva o que travou (formato,
  criptografia, nomes/nações não-resolvíveis) e reporte — o resto do plano não se aplica.

> Este step não produz código de produto — produz **evidência** e um script de scratch
> descartável. Gastar horas, não dias, antes de decidir investir no importador.

### Step 2 — Ferramenta de extração da base inteira (`tools/mod-extract/`)

Só começa após GO. Utilitário Node/TS **no monorepo** (`tools/mod-extract/`, fora de
`server`/`web`), rodável no Mac:

```
npx tsx tools/mod-extract/index.ts --db /tmp/fifa16-mod/fifa_beta_db.db --out mod-fifa16.<fmt>
  → escreve a base INTEIRA (todos os times + todos os jogadores) no formato que o importador
    do Prancheta consome (ver Step 3)
```

- Entrada: caminho do `.db` (ou dos txt/xml, se Caminho B).
- Saída: a database inteira, mapeada para o schema `sofifa_players`/`sofifa_teams` — **confirmar
  em `server/src/routes/import.ts` qual formato o importador do Kaggle já ingere** (CSV com as
  colunas do dump?) e emitir **nesse mesmo formato**, para reusar o pipeline sem rota nova.
- Mapeamento EA → sofifa (trancar em teste): posição (enum→string), idade (`birthdate`→anos),
  nome (join de nomes), nacionalidade (join de nações), liga (`leagueteamlinks`), número
  (`teamplayerlinks`). `pace..physic` podem ir NULL; atributos individuais → `attributes_json`.
- Sem rede, sem chave, sem servidor. Determinístico. Teste com fixture mínima **sintética**
  (não versionar o `.db` real) trancando o mapeamento.

> **Não** embutir o parser de `.db` no `server/`. Leitura de arquivo de jogo é específica, pesada
> e só interessa offline — mantê-la à parte preserva o servidor enxuto e a superfície pequena.

### Step 3 — Importar como uma nova versão da database do jogo

Objetivo: a saída do Step 2 virar uma **versão importada** que as telas existentes enxergam.

1. Resolver a **identidade da versão** (ver "Decisão de design"): escolher o código inteiro do
   mod e ensinar o mapa de rótulos/`createClub` (rotas de game-data/versões) a exibir
   "FIFA 16 — FIFA Friends v10".
2. **Rodar o importador existente** com o arquivo do Step 2 apontando para esse código de versão.
   Idealmente **zero rota nova** — só reuso do pipeline do Kaggle. Se o importador presumir
   formato/origem Kaggle de forma rígida, o mínimo de adaptação para aceitar a fonte do mod.
3. Validar que as telas passam a funcionar sobre o mod **sem alteração**: `/api/versions` lista a
   versão do mod; Scout/prospecção buscam nela; criação de carreira lista os times do mod;
   perfil de jogador abre com `attributes_json`.

### Step 4 — Invariante, docs e limites

- Ajustar a redação da invariante em `CLAUDE.md` e `STATUS.md`: a fonte da database do jogo passa
  a ser "vanilla (Kaggle) **ou** a database do jogo modado do dono" — **ainda real, read-only,
  nunca inventada, migrations não tocam** (ver seção "Invariante" acima).
- Registrar em `STATUS.md` o que ficou de fora como dívida consciente (dedup entre versões,
  faces/kits/estádios, FIFA 22), alimentando um eventual plano 025.

## Verification

- [ ] **Step 1**: contagem plausível de **todos** os times/jogadores do mod, **e** o elenco de um
      time conferido contra o jogo (nome, nacionalidade, overall, potencial, idade, posição,
      número — legíveis). Go/no-go reportado.
- [ ] `tools/mod-extract` roda no Mac (`npx tsx …`) e produz a base inteira no formato do
      importador, determinística; teste do mapeamento verde.
- [ ] A versão do mod aparece em `/api/versions` com rótulo próprio e **é buscável no Scout**
      (uma busca retorna jogadores do mod, não da vanilla), **sem tocar em migrations**.
- [ ] Criar carreira selecionando um time do mod funciona; o perfil de um jogador do mod abre.
- [ ] `npm run verify` verde (a ferramenta nova não pode quebrar typecheck/testes/build) e CI
      verde.
- [ ] `CLAUDE.md`/`STATUS.md`/`ROADMAP.md` atualizados (invariante ampliada; o que ficou p/ 025).

## STOP conditions

- **Step 1 NO-GO** (nem Caminho A nem B produzem dados legíveis) → PARE. Documente o obstáculo
  técnico exato e reporte; não parta para "reverter engenharia do formato binário" sem uma nova
  decisão do dono — isso é um projeto à parte, não um MVP.
- **Nomes/nacionalidades não resolvem** (os joins de strings não fecham) → PARE no Step 1. Base
  sem nome/nação não serve para Scout nem transferências; investigue a resolução antes de tudo.
- **A ferramenta precisar rodar no Windows** (nenhum caminho funciona no Mac) → PARE e reporte;
  contraria a premissa do dono. Reavaliar escopo antes de seguir.
- **Qualquer tentação de fazer o import via MIGRATION** (em vez do pipeline de import) → PARE.
  Migrations nunca tocam `sofifa_*`; a versão do mod entra **pelo importador**, como a vanilla.
- **Escopo inflar** (faces/kits/estádios/narração, FIFA 22, dedup entre versões "de brinde") →
  PARE e corte; isso é plano 025, não MVP.

## Maintenance notes

- Guardar o `.db` de teste **fora do repo** (arquivos de jogo/mod, grandes e de mod comercial —
  não versionar). Fixtures de teste mínimas e sintéticas.
- Se o Caminho A funcionar, anotar exatamente **qual** lib/versão leu o `.db` bruto — é o
  conhecimento mais valioso do plano e o que habilita a fase 2 (FIFA 22 tem outro caminho, mas o
  padrão "ferramenta offline → formato do importador → nova versão" se repete).
- Fase 2 (plano futuro): FIFA 22 via export do FIFA Editor Tool (`.fifamod`/Frostbite) → CSV →
  mesmo importador, como outra versão. Só abrir com o FIFA 16 provado ponta a ponta.
- Custo de disco: cada versão importada pesa centenas de MB (ver `plans/023`); a do mod não é
  diferente. Confirmar folga antes de importar em produção.
- Legal/privacidade: ler o jogo comprado + mod do próprio dono, para uso pessoal, é análogo à
  captura por foto. Não redistribuir dados do mod; o import é local, para a conta do dono.
