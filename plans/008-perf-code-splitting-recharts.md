# Plan 008: Code-splitting por rota + lazy-load do Recharts

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize `plans/README.md`.
>
> **Drift check**: `git diff --stat feba0bf..HEAD -- web/src/App.tsx web/src/pages/Player.tsx web/vite.config.ts`

## Status
- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: performance
- **Planned at**: commit `feba0bf`, 2026-07-08

## Why this matters
O bundle inicial (~656 KB minificado — o próprio Vite emite o aviso de chunk &gt;500 KB) inclui
Recharts, a dependência mais pesada, usada **só** na rota `/jogador/:id` (rara). Todas as 7 páginas
são importadas estaticamente em `App.tsx`, então a Home paga por telas que talvez nunca sejam
abertas. Num PWA mobile, primeiro carregamento importa. Code-splitting por rota + lazy do Recharts
tira essa massa do caminho crítico com risco baixíssimo.

## Current state
`web/src/App.tsx` (linhas 1-9) — imports estáticos de todas as páginas:
```ts
import Home from './pages/Home'
import NewCareer from './pages/NewCareer'
import CareerPage from './pages/Career'
import ProspectsPage from './pages/Prospects'
import PlayerPage from './pages/Player'
import CapturePage from './pages/Capture'
import SettingsPage from './pages/Settings'
```
As rotas são declaradas com `<Routes><Route element={<Home/>} ... /></Routes>` (mais abaixo no
mesmo arquivo). `web/src/pages/Player.tsx:5` importa Recharts estaticamente:
`import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'`.
`web/vite.config.ts` não tem `manualChunks`. Estética/loading: seguir DESIGN.md (terminal); usar as
classes existentes (`text-steel`, etc.) num fallback simples.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck web | `npx tsc -p web/tsconfig.json --noEmit` | exit 0 |
| Build | `cd web && npx vite build` | files generated; **sem** aviso de chunk &gt;500KB no chunk principal |

## Scope
**In scope:** `web/src/App.tsx` (imports → `React.lazy` + `<Suspense>`), opcionalmente
`web/vite.config.ts` (`manualChunks` p/ vendor). Se o gráfico do Player for extraído para um
subcomponente para lazy-load mais fino, `web/src/pages/Player.tsx` também.
**Out of scope:** trocar Recharts por outra lib; mudar o visual do gráfico; qualquer página além do
wiring de lazy.

## Git workflow
Branch de `claude`; commit `perf: code-splitting por rota e lazy Recharts`. Não push/PR.

## Steps

### Step 1: `React.lazy` nas páginas + `<Suspense>`
Em `App.tsx`, troque os 7 imports estáticos por:
```ts
import { lazy, Suspense, useEffect, useState } from 'react'
const Home = lazy(() => import('./pages/Home'))
const NewCareer = lazy(() => import('./pages/NewCareer'))
const CareerPage = lazy(() => import('./pages/Career'))
const ProspectsPage = lazy(() => import('./pages/Prospects'))
const PlayerPage = lazy(() => import('./pages/Player'))
const CapturePage = lazy(() => import('./pages/Capture'))
const SettingsPage = lazy(() => import('./pages/Settings'))
```
Envolva o `<Routes>...</Routes>` com `<Suspense fallback={<p className="pt-6 text-slate-ink">Carregando…</p>}>`.
(Como cada página é um `export default`, `lazy(() => import(...))` funciona direto.)
**Verify**: `npx tsc -p web/tsconfig.json --noEmit` → exit 0.

### Step 2: Build e conferir o split
`cd web && npx vite build`. Confirme na saída do Vite que agora há **múltiplos** chunks de página e
que Recharts saiu para um chunk próprio (aparece um chunk grande separado, carregado sob demanda),
e que o chunk de entrada encolheu. O aviso de chunk &gt;500 KB deve sair do chunk de entrada (pode
permanecer no chunk isolado do Recharts — aceitável, pois é sob demanda).
**Verify**: `cd web && npx vite build` → "files generated"; a listagem de assets mostra ≥6 chunks
`.js` de página; o maior chunk não é mais o de entrada.

### Step 3 (opcional): `manualChunks` para vendor estável
Se quiser separar React/Router/Query num chunk de vendor cacheável, em `web/vite.config.ts` adicione
`build: { rollupOptions: { output: { manualChunks: { vendor: ['react','react-dom','react-router-dom','@tanstack/react-query'] } } } }`.
Não inclua Recharts aqui (deixe o lazy da rota isolá-lo).
**Verify**: build ok; surge um chunk `vendor-*.js`.

## Test plan
Sem testes unitários (é build/estrutura). Verificação:
1. `npx vite build` gera múltiplos chunks e o de entrada encolhe.
2. Manual: rodar `npm run dev:web`, abrir a Home e no Network tab confirmar que o chunk do Player
   (com Recharts) só é baixado ao navegar para `/jogador/:id`.

## Done criteria
- [ ] `npx tsc -p web/tsconfig.json --noEmit` → exit 0
- [ ] `cd web && npx vite build` → exit 0, ≥6 chunks de página
- [ ] `grep -c "lazy(" web/src/App.tsx` → 7
- [ ] `grep -n "Suspense" web/src/App.tsx` → presente envolvendo as rotas
- [ ] `git status --short` só arquivos in-scope
- [ ] `plans/README.md` atualizado

## STOP conditions
- Se o service worker (vite-plugin-pwa) reclamar de precache com muitos chunks — é esperado
  precachear mais entradas; se o build **falhar** por isso, reporte (pode precisar de config PWA).
- Se alguma página tiver `export` nomeado em vez de `default` e o `lazy` quebrar — ajuste para
  `lazy(() => import('./pages/X').then(m => ({ default: m.X })))` e siga.

## Maintenance notes
- Novas páginas devem entrar como `lazy` também.
- Se um dia o gráfico aparecer em mais telas, considere um subcomponente `PlayerChart` com lazy
  próprio para não puxar Recharts para essas telas.
- Revisor: confirmar no Network que a Home não baixa o chunk do Recharts.
