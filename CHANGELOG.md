# Changelog

Este projeto segue o [PrideVer](https://pridever.org) — `PROUD.DEFAULT.SHAME`:

- **PROUD** — sobe quando a release é motivo de orgulho (zera os demais segmentos).
- **DEFAULT** — sobe numa release normal, ok.
- **SHAME** — sobe quando estamos consertando coisas embaraçosas demais para admitir.

O terceiro segmento usa 3 dígitos por decisão do projeto (`0.2.000`, `0.2.001`, …).

## 0.2.000 — 2026-07-14

Baseline do versionamento, definida arbitrariamente sobre o estado atual do app.

Estado consolidado até aqui:

- **Produto**: carreiras (time existente ou clube criado), elenco com ciclo de vida de status
  (titular/reserva/emprestado/vendido), base & regens, prospecção na database real do jogo
  (filtros de posição/idade/overall/potencial/valor/liga/nacionalidade), shortlist com
  prioridade e comparação lado a lado, evolução por temporada com gráfico, captura de tela por
  foto com IA (BYOK) — criando jogadores novos ou registrando evolução em existentes.
- **Dados**: databases reais do SoFIFA (dumps públicos via Kaggle) importadas por versão
  (FIFA 15–24); dados do usuário 100% no navegador (localStorage), com backup em arquivo e
  chave de restauração com auto-sync (debounce + indicador).
- **Infra**: Fastify 5 + better-sqlite3, React 18 + Vite 6 + Tailwind v4 (PWA pt-BR,
  mobile-first), hardening de produção (CORS allowlist, rate-limit, admin token, quota/TTL de
  blobs), testes vitest (server em base efêmera + web), deploy VPS via PM2.
- **Design**: tema terminal PEDRO\RIVERA (IBM Plex Mono, preto/vermelho, raio zero) — ver
  `DESIGN.md`.

Histórico detalhado: planos 001–019 em `plans/README.md` (auditorias `improve` de 2026-07-08 e
2026-07-14, todos DONE).

## Próximos passos

- **0.2.001** — primeira iteração planejada de UX/UI (o caminho até a `0.3.000` começa
  admitindo que a densidade atual do layout é o segmento SHAME em ação).
