# FIFA Career Companion

Companion do modo carreira do FIFA/EA FC (FIFA 15 → FC 24, com atenção especial ao 16 e ao 22).
Foco em **jogadores**, não em campanhas: prospecção na database original do jogo, elenco completo
da carreira, base/regens e acompanhamento de desenvolvimento por temporada — inclusive por
**foto da tela do jogo** interpretada por IA.

Todos os dados do jogo são **reais**: dumps públicos completos extraídos do SoFIFA
(datasets de Stefano Leone no Kaggle), importados uma única vez para SQLite local.
O app nunca inventa nem reduz atributos — o que não foi importado aparece como indisponível.

> A API oficial do SoFIFA (api.sofifa.net) é restrita a projetos parceiros aprovados.
> O client dela está pronto em `server/src/sofifa/sofifa-api.ts` como fonte plugável futura.

## Como rodar

```bash
npm install
npm run dev:server   # API em http://localhost:3344
npm run dev:web      # app em http://localhost:5173 (acessível na rede local)
```

Depois, tudo pelo próprio app:

1. **Tela inicial** → toque nas versões do FIFA que você joga e clique em **Importar**
   (download automático do dataset público + importação, com barra de progresso —
   não precisa de conta em lugar nenhum).
2. **⚙️ Configurações** → para a câmera/IA, cole sua chave da Anthropic
   (console.anthropic.com). Opcional: credenciais do Kaggle, só se o download
   anônimo falhar um dia. Os tokens ficam no SQLite local.

Alternativas por terminal: `npm run import:data -- 16 22` (usa o CLI do Kaggle), ou baixe
[o dataset](https://www.kaggle.com/datasets/stefanoleone992/ea-sports-fc-24-complete-player-dataset)
manualmente e coloque `male_players.csv` e `male_teams.csv` em `server/data/kaggle/`.
A `ANTHROPIC_API_KEY` também pode vir de `server/.env`.

No celular (mesma rede Wi-Fi): abra `http://<IP-do-Mac>:5173` e use
"Adicionar à Tela de Início" para instalar como PWA — a câmera funciona pelo navegador.

## Estrutura

- `server/` — Fastify + SQLite (better-sqlite3). Espelho da database do jogo
  (`sofifa_players`/`sofifa_teams`, somente leitura) + dados das carreiras
  (`careers`, `career_players`, `player_snapshots`, `prospects`, `captures`).
- `server/src/vision/` — análise de fotos da tela via Claude API (modelo em `VISION_MODEL`,
  padrão `claude-sonnet-5`). A IA só sugere; tudo passa por revisão antes de salvar.
- `web/` — React + Vite + Tailwind (PWA, PT-BR, mobile-first).

## Conceitos

- **Carreira**: versão do jogo + time original (elenco completo carregado automaticamente da
  database) ou clube criado (FIFA 22+: nome, verba, liga, time substituído, objetivos, qualidade —
  jogadores gerados entram manualmente ou por foto do elenco).
- **Temporada/data atual do save**: sempre visível no dashboard; toda evolução de stats vira um
  *snapshot* datado (nunca sobrescreve), gerando a linha do tempo e o gráfico de desenvolvimento.
- **Prospecção**: busca com filtros (posição, idade, overall, potencial, valor, liga) sobre a
  database original da versão da carreira; shortlist com status (observando → contratado, que
  move o jogador para o elenco).

Dados do jogo © EA Sports, compilados pela comunidade via [SoFIFA](https://sofifa.com).
Projeto pessoal, não comercial.
