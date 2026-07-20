# Prancheta

O companheiro do modo carreira do FIFA/EA FC (FIFA 15 → FC 24, com atenção especial ao 16 e ao 22).
Foco no **desenvolvimento do time**, não em campanhas: elenco completo da carreira, base/regens,
evolução por temporada, prospecção na database original do jogo — inclusive por **foto da tela
do jogo** interpretada por IA — e um **conselheiro de IA** que analisa a carreira sob demanda.

O jogo roda na TV, o Prancheta fica no celular: o app é mobile-first, com navegação por abas
(Elenco · Scout · Captura · Mais) pensada para uso com uma mão.

Todos os dados do jogo são **reais**: dumps públicos completos extraídos do SoFIFA
(datasets de Stefano Leone no Kaggle), importados uma única vez para SQLite no servidor.
O app nunca inventa nem reduz atributos — o que não foi importado aparece como indisponível.

> A API oficial do SoFIFA (api.sofifa.net) é restrita a projetos parceiros aprovados.
> O client dela está pronto em `server/src/sofifa/sofifa-api.ts` como fonte plugável futura.

## Arquitetura (onde ficam os dados)

- **Na sua conta (servidor, SQLite):** carreiras, elencos, jogadores da base/regens, snapshots
  de evolução e prospecção — por usuário, atrás de login (sessão por cookie). O cadastro é
  fechado: o administrador cria usuários com senha temporária (troca obrigatória no 1º login).
- **No seu navegador (localStorage):** apenas as **chaves de IA (BYOK)** — elas nunca vão para
  o servidor; você as configura em cada dispositivo (Mais → Configurações).
- **Área admin (`/admin`, via Mais):** importação das databases do jogo e gestão de usuários
  (criar/desativar/promover/resetar senha/excluir).
- **Database do jogo (compartilhada, somente leitura):** `sofifa_players` / `sofifa_teams`,
  importada uma vez por versão a partir dos dumps públicos.
- **Migração do modelo antigo:** quem tinha dados no localStorage (ou uma chave de restauração)
  vê um banner após o login para importá-los para a conta — one-shot, sem perder nada.
- **Análise de fotos:** stateless. O navegador manda a imagem + o provedor/chave/modelo escolhidos
  para `POST /api/analyze`, que só faz proxy para o provedor de IA (Anthropic, OpenAI, Gemini ou
  OpenRouter) e devolve o JSON extraído. A chave de IA nunca é gravada no servidor.
- **Conselheiro de IA:** mesmo padrão BYOK. `POST /api/careers/:id/advisor` monta o contexto da
  carreira **a partir do banco** (objetivos, elenco, evolução, shortlist), chama o provedor e
  guarda a **resposta** no histórico — a chave continua sem tocar o servidor. Gatilho sempre
  explícito: nada é analisado automaticamente (cada chamada custa ao usuário).

## Rodando localmente

```bash
npm install
npm run dev:server   # API em http://localhost:3344
npm run dev:web      # app em http://localhost:5173 (acessível na rede local)
```

Na primeira vez, defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` no `server/.env` — o primeiro
administrador é semeado no boot quando o banco não tem usuários.

1. **Mais → Databases do jogo** (admin) → toque nas versões do FIFA que você joga e clique em
   **Importar** (download automático do dataset público, com barra de progresso).
2. **Mais → Configurações** → escolha o provedor de IA e cole sua chave (BYOK). As chaves ficam
   só no seu navegador — habilitam a Captura por foto e o Conselheiro.

No celular (mesma rede Wi-Fi): abra `http://<IP-do-Mac>:5173` e use "Adicionar à Tela de Início"
para instalar como PWA. **A câmera exige HTTPS** — em rede local funciona em `localhost`, mas no
celular via IP só com o deploy HTTPS abaixo.

---

## Deploy na VPS (Debian 12 + CloudPanel)

O app roda como **um único processo Node** que serve a API **e** o front buildado. O CloudPanel
cuida do proxy reverso e do SSL (Let's Encrypt) — que também é o que faz a câmera do PWA
funcionar no celular.

**O passo a passo completo está em [DEPLOY.md](DEPLOY.md)**: criação do site, SSL, build,
variáveis de ambiente (incluindo o seed do primeiro admin), PM2, importação da database,
criação de usuários, atualizações, **backup** e solução de problemas.

Resumo para quem já conhece o caminho:

```bash
# na VPS, como usuário do site
cd ~/htdocs/prancheta.seudominio.com
git pull && npm install && npm run build
pm2 restart prancheta          # 1º deploy: pm2 start ecosystem.config.cjs && pm2 save
```

> **Backup:** desde a v0.4.000 os dados de todos os usuários vivem em
> `server/data/companion.db`. Use o backup online do SQLite (`.backup`), não `cp` — ver DEPLOY.md.

## Estrutura

- `server/` — Fastify + SQLite (better-sqlite3). Auth por sessão (`/api/auth/*`), dados
  per-user (`/api/careers*`, `/api/career-players/*`, `/api/prospects/*`, `/api/me/import-local`),
  admin (`/api/admin/users*`, `/api/import/*`), database do jogo somente leitura
  (`/api/versions`, `/api/leagues/:v`, `/api/teams/:v`, `/api/team/:v/:id`, `/api/players/:v`,
  `/api/player/:v/:id`) e `/api/analyze` + `/api/test-ai` (proxy de IA stateless).
  `GET /api/sync/:code` sobrevive deprecado só como fonte de migração. Em produção, também
  serve `web/dist` com fallback de SPA. Schema evolui via `src/db/migrations/`.
- `web/src/store.ts` — só o que é local por design: chaves BYOK de IA + leitor do blob legado.
- `web/src/api/user-data.ts` — client das rotas de dados da conta.
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
- **BYOK**: traga a chave do provedor de IA que preferir (Anthropic, OpenAI, Gemini, OpenRouter);
  fica no seu navegador e alimenta a leitura de fotos e o conselheiro. Remova quando quiser.
- **Conselheiro**: no hub da carreira, peça um **parecer** completo ou faça uma **pergunta
  dirigida**; a resposta é estruturada (orientações priorizadas, citando seus jogadores) e fica
  no histórico da carreira. Sempre por gatilho explícito — nada roda sozinho.
- **Chave de restauração** (legado): código de 12 caracteres do modelo antigo, pré-contas.
  Sobrevive apenas como **fonte de migração** para importar dados para a sua conta; sai numa
  versão futura.

Dados do jogo © EA Sports, compilados pela comunidade via [SoFIFA](https://sofifa.com).
Projeto pessoal, não comercial.
