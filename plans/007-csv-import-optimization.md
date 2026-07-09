# Plan 007: Optimize CSV imports to single stream passes

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 52029fe..HEAD -- server/src/sofifa/kaggle-csv.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `52029fe`, 2026-07-08

## Why this matters

The CSV database importer reads the dataset files (`male_players.csv` and `male_teams.csv`) multiple times sequentially. Specifically, `male_teams.csv` is read three times (to scan versions, calculate league statistics, and insert teams), and `male_players.csv` is read twice (to scan versions and insert players). For large files, this creates excessive disk I/O, heavy parsing overhead, and slow imports. Consolidating the team passes and optimizing the player scanner pass speeds up imports, especially on VPS targets.

## Current state

- Relevant file:
  - `server/src/sofifa/kaggle-csv.ts` — contains all the CSV streaming and processing logic.

- Excerpt showing the five sequential file reads:
  - Lines 123-125 (first 3 reads):
    ```typescript
    const playerLaunch = await launchUpdates(PLAYERS_CSV)
    const teamLaunch = await launchUpdates(TEAMS_CSV)
    const leagues = await canonicalLeagues(TEAMS_CSV)
    ```
  - Lines 140-150 (4th read):
    ```typescript
    const parser = createReadStream(TEAMS_CSV).pipe(parse({ columns: true, relaxQuotes: true }))
    // ... loops and inserts teams
    ```
  - Lines 163-172 (5th read):
    ```typescript
    const parser = createReadStream(PLAYERS_CSV).pipe(parse({ columns: true, relaxQuotes: true }))
    // ... loops and inserts players
    ```

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Build     | `npm run build`  | exit 0, compiles successfully |

## Scope

**In scope**:
- `server/src/sofifa/kaggle-csv.ts`

**Out of scope**:
- Modifying SQLite db indices or triggers.
- Modifying import job status routes.

## Git workflow

- Branch: `advisor/007-csv-import-optimization`
- Commit message: `perf: consolidate csv parsing passes to optimize dataset imports`

## Steps

### Step 1: Optimize launchUpdates for PLAYERS_CSV
Currently, `launchUpdates` pipes the entire file stream through the heavy `csv-parse` module, which parses every text block. Since we only need the `fifa_version` and `fifa_update` columns, replace this pass with a fast line-by-line read using Node's native `readline` module and basic string splitting for those specific columns:

```typescript
import readline from 'node:readline'

async function launchUpdates(csvPath: string): Promise<Map<number, number>> {
  const map = new Map<number, number>()
  const rl = readline.createInterface({
    input: createReadStream(csvPath),
    crlfDelay: Infinity,
  })

  let isHeader = true
  let verIdx = -1
  let updIdx = -1

  for await (const line of rl) {
    if (isHeader) {
      const cols = line.split(',')
      verIdx = cols.indexOf('fifa_version')
      updIdx = cols.indexOf('fifa_update')
      isHeader = false
      continue
    }
    // Extract first columns by simple splitting (since version and update are numbers near start)
    const cols = line.split(',', Math.max(verIdx, updIdx) + 2)
    const v = Number(cols[verIdx])
    const u = Number(cols[updIdx])
    if (!Number.isFinite(v) || !Number.isFinite(u)) continue
    const cur = map.get(v)
    if (cur === undefined || u < cur) map.set(v, u)
  }
  return map
}
```

**Verify**: Compile the code.

### Step 2: Consolidate TEAMS_CSV processing
Since `male_teams.csv` is small (typically < 10,000 rows), we can load its rows into memory *once*, and then calculate updates, canonical leagues, and insert teams without reading the file again:

1. Read `TEAMS_CSV` once using the CSV parser and store all rows in memory as an array of records.
2. Calculate `teamLaunch` and `leagues` directly from the array.
3. Call `flushTeams` using the rows in the array.

Example consolidated logic inside `importFromCsv`:
```typescript
  // 1. Read teams once
  const teamRowsArray: Record<string, any>[] = []
  const teamParser = createReadStream(TEAMS_CSV).pipe(parse({ columns: true, relaxQuotes: true }))
  for await (const row of teamParser) {
    teamRowsArray.push(row)
  }

  // 2. Compute min updates for teams in-memory
  const teamLaunch = new Map<number, number>()
  for (const row of teamRowsArray) {
    const v = Number(row.fifa_version)
    const u = Number(row.fifa_update)
    if (!Number.isFinite(v) || !Number.isFinite(u)) continue
    const cur = teamLaunch.get(v)
    if (cur === undefined || u < cur) teamLaunch.set(v, u)
  }

  // 3. Compute canonical leagues in-memory
  const leagues = new Map<number, { name: string; level: number | null }>()
  // ... adapt canonicalLeagues logic to process teamRowsArray instead of streaming

  // 4. Filter and insert teams
  const wanted = new Set(versions)
  const teamsToInsert = teamRowsArray.filter(
    (row) => wanted.has(Number(row.fifa_version)) && Number(row.fifa_update) === teamLaunch.get(Number(row.fifa_version))
  )
  flushTeams(teamsToInsert, insertTeam)
```

**Verify**: The project builds successfully with `npm run build`.

### Step 3: Run full verification
Verify the typescript compiles cleanly.

**Verify**: `npm run build` exits 0.

## Done criteria

- [ ] `launchUpdates` uses `readline` for fast column scanner instead of parsing full CSV rows.
- [ ] `male_teams.csv` file is read from disk only once instead of three times.
- [ ] Database imports execute successfully and yield identical records compared to the original code.
- [ ] `npm run build` exits 0.

## STOP conditions

- If CSV files have formats where `fifa_version` and `fifa_update` columns contain unescaped commas inside preceding columns (unlikely, as these columns are numeric indices and appear early in the schema).

## Maintenance notes

- None.
