# Implementation Plans

Índice de planos gerados pelo skill `improve`. Execute na ordem abaixo salvo onde as dependências
disserem o contrário. Cada executor: leia o plano inteiro antes de começar, honre as STOP
conditions, rode as verificações, e atualize sua linha ao terminar.

- **001** (`plan` — UX): gerado contra `bdd5c7e`, já **DONE**.
- **002–013**: auditoria `deep` gerada contra `feba0bf` (2026-07-08).

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Feedback e interação confiáveis (erros/debounce/paginação/diálogos/retry) | P1 | M | — | DONE |
| 002 | Baseline de verificação — vitest, scripts agregados, CLAUDE.md | P1 | S | — | DONE (desvio: vitest ^2.1.8→^4.1.10 e happy-dom ^15→^20.10.6 — as versões do plano traziam advisory crítico de RCE em happy-dom e moderado em esbuild/vite via vitest; bump para as latest resolveu, `npm audit` limpo exceto o @fastify/static já coberto pelo plano 005) |
| 003 | Segurança: não persistir chaves BYOK no servidor/backup | P1 | S | 002 (p/ teste) | DONE |
| 004 | Segurança: hardening das rotas públicas (auth/rate-limit/quota/CORS/HOST/GC/headers) | P1 | M | 002 (p/ teste) | DONE (ecosystem.config.cjs já tinha HOST=127.0.0.1 corrigido de forma independente antes desta execução; import protegido por loopback+ADMIN_TOKEN em vez de "só token", verificado por teste unitário determinístico de `isAuthorizedForImport` — teste de rede real não é viável via curl na mesma máquina; quota de MAX_BLOBS não testada ao vivo contra a base real, só a lógica de leitura/escrita/PUT-404) |
| 005 | Deps/segurança: bump @fastify/static (advisory) | P2 | S | — | DONE (API do plugin sem mudanças de assinatura em v10 — `root`/`prefix`/`sendFile` idênticos; fumaça confirmou serving estático, fallback de SPA, 404 de /api/* e que um path com separador codificado não vaza arquivo fora de web/dist, apenas cai no fallback de SPA) |
| 006 | Testes de caracterização de store.ts | P1 | M | 002 | DONE (estendeu o `store.test.ts` do plano 003; 10 novos casos: CRUD+cascata de carreira, shortlist duplicada, contratação idempotente, snapshots por jogador, import válido/inválido, e `load()` de blob corrompido devolvendo estado vazio silenciosamente — documentado como comportamento atual, não corrigido aqui) |
| 007 | Correctness store/captura (quota/atômico/counters/retry/objectURL) | P2 | M | 002, 006 rec. | DONE (desvio no teste de quota: `vi.spyOn(Storage.prototype, 'setItem')` não intercepta o `localStorage` do happy-dom depois que ele já foi usado por outro teste no mesmo arquivo — troquei por `vi.stubGlobal('localStorage', {...})`, que substitui o global inteiro e funciona de forma determinística independente da ordem dos testes; o teste de caracterização de snapshots (006) precisou de um `seedCareer()` para satisfazer a nova checagem de `getCareerPlayer` que passou a exigir que a carreira exista de fato) |
| 008 | Perf: code-splitting + lazy Recharts | P2 | S | — | DONE (7 páginas viraram `lazy()`; chunk de entrada caiu de 681 KB para 215 KB, Recharts isolado no chunk sob demanda de Player.tsx (395 KB) — aviso de chunk >500KB do build some do caminho crítico; manualChunks de vendor do Step 3 não foi necessário, o split por rota já resolveu o aviso) |
| 009 | Perf: projeção de colunas + dedup COUNT em /api/players | P2 | M | 002/006 rec. | DONE (LIST_COLS na busca — sem attributes_json/atributos individuais; `COUNT(*) OVER()` elimina o segundo full-scan; `/api/player/:v/:id` segue `SELECT *` para a reidratação. `Prospects.tsx` reidrata o jogador completo em `/api/player` antes de gravar na shortlist, já que `updateProspect(contratado)` copia esse objeto para o elenco e `Player.tsx` depende de `attributes_json`. Testado manualmente contra os dados reais de FIFA 16: busca sem attributes_json, total correto, reidratação com attributes_json presente) |
| 010 | Direção: filtros liga/nacionalidade/idade-mín. na prospecção | P2 | S | — | DONE (a lista de "Nacionalidade" reusa `country` de `/api/leagues` — nacionalidade predominante da liga, não a nacionalidade real do jogador; é a mesma aproximação já usada em NewCareer.tsx e explicitamente aceita pelo plano por não haver endpoint dedicado. Testado manualmente contra FIFA 16 real: liga "Serie B" 16.706→574 resultados, nacionalidade "Brazil"+idade mín. 16 → 858, confirmado via Network que os params minAge/league/nationality chegam ao servidor) |
| 011 | Direção: prioridade da shortlist | P3 | S | — | DONE (pílulas 🔴 Alta/🟡 Média/⚪ Baixa por item, reusando `updateProspect` já existente; lista ordenada por prioridade via `sort` estável. Testado manualmente: marcar Cristiano Ronaldo como Alta o move acima de Messi (Média) e a ordem persiste após reload) |
| 012 | Direção: captura → evolução em jogador existente | P2 | M | 007 rec. | TODO |
| 013 | Direção: ciclo de vida do status do jogador | P3 | M | — | TODO |

Status: TODO | IN PROGRESS | DONE | BLOCKED (com motivo) | REJECTED (com justificativa)

## Recomendação de sequência

1. **002** primeiro — desbloqueia testes para tudo (é a baseline de verificação).
2. **Segurança antes de publicar no VPS**: 003, 004, 005 (o app está indo para produção; rotas de
   escrita anônimas + chaves BYOK no servidor são o cluster crítico).
3. **006** (caracterização de store.ts) antes de **007** (mexer em store.ts) e de **009** (que muda
   o fluxo de reidratação do store).
4. Perf (008, 009) e Direção (010–013) em paralelo depois, conforme apetite. 008/010/011 são S e
   independentes — bons "quick wins".

## Dependency notes

- 003, 004, 006, 007, 009 são mais seguros com o 002 (test runner) pronto — mas 003/004/005/008/010/011
  podem ser feitos sem testes se necessário (têm verificação por tsc/build/manual).
- 007 e 003 tocam ambos `web/src/store.ts` — se executados em paralelo, reconcilie os diffs.
- 006 (caracterização) deve ser ATUALIZADO após 007 mudar o comportamento (counters/quota).
- 012 fica mais limpo após 007 (apply atômico via `applyCapturedPlayers`), mas não depende dele.
- 009 e 010 ambos tocam a prospecção/`game-data.ts` — 010 não depende de 009 (usa `league_name`/
  `nationality_name`, que permanecem na projeção do 009).

## Findings considered and rejected

- **DESIGN.md "é doc de outro projeto"** → REJEITADO: a estética terminal (PEDRO\RIVERA, IBM Plex
  Mono, preto/vermelho, raio zero) foi **adotada de propósito** pelo dono nesta sessão. Não é erro.
  (Ficou apenas uma nota: `plans/README` do 001 cita "DESIGN.md registra 2 itens de navegação", que
  não existe no arquivo — correção trivial de doc, não vira plano.)
- **Injeção de SQL em game-data.ts** → REJEITADO: todos os filtros usam bind params; `ORDER BY` vem
  de allowlist (`sortMap`) com fallback fixo.
- **Código de sync "enumerável"** → REJEITADO: alfabeto 31 × 12 chars ≈ 59 bits (não brute-forçável);
  o risco real é ausência de rate-limit, coberto no plano 004.
- **XSS / segredos commitados / prompt-injection em arquivos** → nenhum encontrado (5 agentes).
- **Bottom-nav mobile, toasts globais, virtualização de lista, focus-trap completo** → adiados no
  001 (ver histórico); reavaliar depois.
- **Import em worker_thread (PERF/CORRECTNESS)** → NÃO planejado agora: efeito é grande (L) e o
  import é ação pontual de setup; o hardening do 004 (restringir/rate-limit o import) mitiga o
  vetor de abuso. Reabrir se a importação em produção travar o servidor na prática.
- **Blob localStorage: não duplicar attributes_json / migrar p/ IndexedDB (PERF)** → NÃO planejado:
  o 009 já corta o over-fetch na origem (servidor); a amplificação de escrita local é modesta no
  volume atual. Reabrir se `storageUsage()` crescer.
- **Auto-hospedar fonte IBM Plex Mono (PERF/PWA offline)** → NÃO planejado agora (S, MED): bom
  follow-up, mas abaixo do corte deste lote.
- **Comparação de jogadores lado a lado (DIRECTION-06)** → NÃO planejado agora: boa ideia, mas a
  forma (prospecto×prospecto vs elenco×elenco) é decisão de design em aberto; reabrir como spike.
- **Auto-sync da chave de restauração (DIRECTION-04)** → NÃO planejado agora: interage com o 004
  (rate-limit) e o 003 (o que vai no blob); reavaliar depois desses.
- **ESLint/Prettier/CI (DX)** → NÃO planejado neste lote: legítimo, mas depende do 002; vira plano
  próprio se desejado.

## Cobertura da auditoria (o que NÃO foi auditado a fundo)

`deep`, 5 de 6 subagentes concluíram (correctness, segurança, performance, testes+DX, direção). O
agente de **tech-debt/deps/docs** interrompeu por limite de sessão; o essencial foi complementado à
mão (deps via `npm outdated` — tudo dentro dos ranges, só `@fastify/static` força bump → plano 005;
duplicação de constantes `AiProvider`/modelos entre web e server observada, baixa alavancagem, não
planejada). Não coberto a fundo: duplicação/arquitetura fina (ex.: card de erro repetido em 3
páginas, `mask()` duplicado) e docs além do já apontado.
