# Changelog

Este projeto segue o [PrideVer](https://pridever.org) — `PROUD.DEFAULT.SHAME`:

- **PROUD** — sobe quando a release é motivo de orgulho (zera os demais segmentos).
- **DEFAULT** — sobe numa release normal, ok.
- **SHAME** — sobe quando estamos consertando coisas embaraçosas demais para admitir.

O terceiro segmento usa 3 dígitos por decisão do projeto (`0.2.000`, `0.2.001`, …).

## 0.4.000 — 2026-07-19

**O app vira Prancheta.** Refatoração completa da interface: identidade própria, shell de
navegação por abas e um conselheiro de IA. A marca pessoal PEDRO\RIVERA (tema terminal) foi
aposentada — era prova de conceito.

- **Identidade "Goleiro 92"** (`DESIGN.md`, escolhida entre 5 direções em `design-proposals/`):
  roxo royal como ação, rosa-choque **exclusivo** do dado de crescimento, amarelo só no padrão
  geométrico, Anybody (display) + Chivo (corpo) + Chivo Mono (números), cards 14px e controles
  em pílula. Assinaturas: número de camisa como marca d'água e a faixa geométrica.
- **Shell de tabs**: Elenco · Scout · Captura · Mais, sobre uma **carreira ativa** persistente.
  Abrir o app cai direto na última carreira; sem carreira, as tabs de jogo ficam desabilitadas.
  Nova tela **Mais** (carreiras, conta, tema, admin); login e troca de senha ganham moldura
  própria com o wordmark.
- **Career vira hub de desenvolvimento**: contexto do save → objetivos da diretoria (agora
  marcáveis) → conselheiro → **radar de desenvolvimento** (quem cresceu desde a última captura)
  → elenco com filtro rápido.
- **Conselheiro de IA** (`POST /api/careers/:id/advisor`): parecer completo da carreira **ou**
  pergunta dirigida, com histórico persistido por carreira. O contexto é montado do banco
  (objetivos, elenco, evolução, shortlist); a resposta é estruturada e cita os jogadores.
  Encanamento BYOK generalizado (`server/src/ai/providers.ts`) e compartilhado com a captura.
- **Acessibilidade auditada**: contraste AA em todos os pares de token nos dois temas (o rosa
  do growpill ganhou variante `pink-deep` para texto), alvos de toque 98×62px, foco visível,
  `prefers-reduced-motion` respeitado.
- **Purga**: zero emojis de UI (viraram SVG), zero resquício do tema antigo no código.
- **Docs**: `DEPLOY.md` (passo a passo Debian 12 + CloudPanel, incluindo backup) e roteiro E2E
  com 29 prints de referência em `screenshots/tests/`.

Invariantes preservadas: chaves de IA seguem só no navegador (agora para os dois consumidores),
dados do jogo intocados, nenhuma funcionalidade removida.

## 0.3.000 — 2026-07-17

**Contas reais + desmembramento admin/frontend.** O app deixa o modelo local-first: os dados de
carreira migram do localStorage para o servidor, por usuário, atrás de login.

- **Auth**: sessão por cookie (HttpOnly/SameSite=Lax, SHA-256 do token no banco, 90 dias com
  expiração deslizante), senha com scrypt, check de Origin em mutações, rate-limit no login.
  Cadastro fechado: admin cria usuários com senha temporária (troca forçada no 1º login);
  primeiro admin semeado via `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- **Dados per-user no servidor**: carreiras (criação carrega o elenco real server-side),
  jogadores, snapshots, prospecção e captura em lote — com isolamento por `user_id` testado.
  Migrations sequenciais (`schema_migrations`) sem tocar em `sofifa_players`/`sofifa_teams`.
- **Migração**: banner one-shot pós-login importa os dados do modelo antigo (localStorage ou
  chave de restauração) via `/api/me/import-local`, remapeando ids em transação.
- **Área admin** (`/admin`): databases do jogo (import movido da Home) e gestão de usuários
  (criar/desativar/promover/resetar senha/derrubar sessões/excluir, com guardas de último admin).
- **Deprecações**: chave de restauração (só GET de migração), auto-sync, backup em arquivo,
  `ADMIN_TOKEN` (import agora aceita loopback ou admin logado).
- **Invariantes preservadas**: chaves de IA (BYOK) seguem só no navegador; `/api/analyze`
  continua proxy stateless; dados do jogo intocados (validado contra cópia da base real).

Deploy: no primeiro boot desta versão, defina `ADMIN_EMAIL`/`ADMIN_PASSWORD` (ver
`ecosystem.config.cjs`) — sem isso ninguém loga. Depois remova do ambiente.

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
