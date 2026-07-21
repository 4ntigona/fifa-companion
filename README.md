# Prancheta

O companheiro do modo carreira do FIFA/EA FC (FIFA 15 → FC 24, com atenção especial ao 16 e
ao 22). Foco no **desenvolvimento do time** — elencos, base/regens, evolução por temporada,
prospecção e um **conselheiro de IA** — não em gerenciar campanhas/resultados.

O jogo roda na TV, o Prancheta fica no celular: PWA mobile-first em PT-BR, com navegação por
abas (**Elenco · Scout · Captura · Mais**) pensada para uso com uma mão.

> **Este README é a referência completa** — visão geral, arquitetura, rodar localmente,
> configuração (todas as variáveis de ambiente) e deploy. Para instalar do zero numa VPS
> nova, veja **[INSTALL.md](INSTALL.md)**. Para o dia a dia de uma VPS já configurada
> (atualizar, backup, troubleshooting), veja **[DEPLOY.md](DEPLOY.md)**. Para o histórico do
> projeto, o estado atual detalhado e o que falta, veja **[STATUS.md](STATUS.md)**. Para o
> que vem a seguir (cronograma de versões), veja **[ROADMAP.md](ROADMAP.md)**.

---

## Índice

- [O que o app faz](#o-que-o-app-faz)
- [Arquitetura — onde ficam os dados](#arquitetura--onde-ficam-os-dados)
- [Rodando localmente](#rodando-localmente)
- [Configuração (variáveis de ambiente)](#configuração-variáveis-de-ambiente)
- [Contas, cadastro e o primeiro admin](#contas-cadastro-e-o-primeiro-admin)
- [Configurar a IA (BYOK)](#configurar-a-ia-byok)
- [Deploy em produção](#deploy-em-produção)
- [Testes e verificação](#testes-e-verificação)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Conceitos do domínio](#conceitos-do-domínio)
- [Versionamento](#versionamento)

---

## O que o app faz

Todos os dados do jogo são **reais**: dumps públicos completos extraídos do SoFIFA (datasets
de Stefano Leone no Kaggle), importados uma única vez por versão para SQLite no servidor.
O app **nunca inventa nem reduz atributos** — o que não foi importado aparece como
indisponível, nunca como um valor estimado.

> A API oficial do SoFIFA (`api.sofifa.net`) é restrita a projetos parceiros aprovados. Um
> client para ela já está pronto em `server/src/sofifa/sofifa-api.ts`, como fonte plugável
> caso o projeto seja aprovado no futuro — hoje o caminho ativo é o dump do Kaggle.

Funcionalidades principais:

- **Elenco** — o hub de cada carreira: contexto do save (clube, temporada, verba), objetivos
  da diretoria (marcáveis), o **conselheiro de IA**, um radar de desenvolvimento (quem cresceu
  desde a última captura) e a lista completa do elenco + base/regens.
- **Scout** — busca com filtros (posição, idade, overall, potencial, valor, liga,
  nacionalidade) sobre a database real da versão da carreira; shortlist com prioridade,
  status e comparação lado a lado de dois prospectos.
- **Captura** — fotografe a tela do jogo (elenco, perfil de jogador, olheiros, negociação); a
  IA extrai os dados visíveis e você revisa e confirma antes de qualquer gravação.
- **Conselheiro de IA** — no hub da carreira, peça um parecer completo ou faça uma pergunta
  dirigida ("tenho verba pra um zagueiro?"); a resposta é estruturada, cita seus jogadores
  pelo nome e fica no histórico da carreira.
- **Mais** — trocar/criar carreira, configurações de conta e IA, e a área de administração.

## Arquitetura — onde ficam os dados

| Dado | Onde vive | Detalhe |
|---|---|---|
| Carreiras, elencos, base/regens, snapshots de evolução, prospecção, pareceres do conselheiro | **Servidor, SQLite**, por `user_id` | Atrás de sessão por cookie. Cadastro fechado: só admin cria contas. |
| Chaves de IA (BYOK) | **Navegador do usuário**, `localStorage` | Nunca chegam a tocar o servidor além de repassadas ao provedor a cada chamada. Vale para captura de foto **e** conselheiro. |
| Database do jogo (`sofifa_players`/`sofifa_teams`) | **Servidor, SQLite**, compartilhada | Somente leitura para os usuários; importada uma vez por versão pelo admin. Migrations nunca tocam essas tabelas. |
| Preferência de tema (claro/escuro/auto) | Navegador, `localStorage` | Puramente cosmético, não sincroniza entre aparelhos. |

O servidor é **um único processo Node/Fastify** que serve a API **e** o front React buildado
(`web/dist`) — sem microserviços, sem fila, sem cache externo. O banco é um arquivo SQLite
(`better-sqlite3`, síncrono) em `server/data/companion.db`.

### Rotas da API (visão geral)

| Área | Rotas | Autenticação |
|---|---|---|
| Auth | `POST /api/auth/login`, `/logout`, `/change-password`, `GET /api/auth/me` | pública (login) / sessão |
| Carreiras e jogadores | `/api/careers*`, `/api/career-players/*`, `/api/prospects/*` | sessão (isolado por `user_id`) |
| Conselheiro | `GET|POST /api/careers/:id/advisor` | sessão |
| Migração do modelo antigo | `POST /api/me/import-local` | sessão |
| Admin | `/api/admin/users*`, `/api/import/*` (importar database) | sessão + papel admin (import também aceita loopback) |
| Database do jogo (leitura) | `/api/versions`, `/api/leagues/:v`, `/api/teams/:v`, `/api/team/:v/:id`, `/api/players/:v`, `/api/player/:v/:id` | sessão |
| IA — proxy stateless | `POST /api/analyze` (foto), `POST /api/test-ai` | sessão |
| Legado (deprecado) | `GET /api/sync/:code` | pública — só leitura, fonte da migração one-shot |

## Rodando localmente

Pré-requisitos: **Node 20+**, npm. `better-sqlite3` compila na instalação (em Linux/WSL pode
exigir `build-essential`/`python3`; no macOS, as Command Line Tools do Xcode já bastam).

```bash
git clone <URL-DO-REPO>
cd fifa-companion
npm install
```

Crie `server/.env` a partir do exemplo e defina o primeiro admin (ver a seção de
[configuração](#configuração-variáveis-de-ambiente) abaixo):

```bash
cp server/.env.example server/.env
# edite server/.env e defina ADMIN_EMAIL / ADMIN_PASSWORD
```

Suba os dois processos (em terminais separados):

```bash
npm run dev:server   # API em http://localhost:3344
npm run dev:web      # app em http://localhost:5173 (Vite, com proxy pra API)
```

Abra `http://localhost:5173`, entre com o admin semeado e:

1. **Mais → Databases do jogo** → selecione as versões do FIFA que você joga → **Importar**
   (baixa o dataset público e popula o SQLite, com barra de progresso).
2. **Mais → Usuários** → crie as contas de quem for usar o app (ou use só a conta admin).
3. **Mais → Configurações** → cole a chave de um provedor de IA (BYOK) para habilitar a
   Captura por foto e o Conselheiro.

### No celular, na mesma rede Wi-Fi

```bash
HOST=0.0.0.0 npm run dev:server   # expõe a API na rede local
```

Abra `http://<IP-do-seu-computador>:5173` no celular e use "Adicionar à Tela de Início" para
instalar como PWA. **A câmera exige HTTPS** — em `localhost` funciona sem TLS, mas pelo IP na
rede local o navegador bloqueia `getUserMedia`/`capture`. Para testar a câmera de verdade,
use o [deploy](#deploy-em-produção) com HTTPS.

## Configuração (variáveis de ambiente)

Tudo em `server/.env` (veja `server/.env.example` para o template comentado). Nenhuma delas
é obrigatória para o app *subir*, exceto `ADMIN_EMAIL`/`ADMIN_PASSWORD` no primeiro boot.

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | `3344` | Porta em que o servidor escuta. |
| `HOST` | `127.0.0.1` | Endereço de escuta. Em produção atrás de proxy, mantenha loopback. `0.0.0.0` expõe na rede (uso em dev, para testar do celular). |
| `CORS_ORIGINS` | *(vazio → reflete qualquer origem)* | Allowlist de origens, separadas por vírgula. **Defina em produção** para o(s) domínio(s) reais do app. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | *(vazio)* | Só usadas **quando a tabela de usuários está vazia**: semeiam o primeiro administrador no boot. Remova depois de confirmar o login — não há re-seed com usuários existentes. |
| `WEB_DIST` | `../web/dist` (relativo ao server) | Caminho do front buildado, se estiver em outro lugar. |
| `KAGGLE_USERNAME` / `KAGGLE_KEY` | *(vazio)* | Só necessárias se o download anônimo do dataset falhar — ele é público e normalmente não exige credencial. |
| `SYNC_TTL_DAYS` | `180` | Dias sem atualização até uma chave de restauração (modelo antigo, deprecado) ser apagada no boot. |

Não existe (e nunca deve existir) uma variável de **chave de provedor de IA** no `.env` do
servidor — isso é BYOK por design: cada usuário traz e guarda a própria chave no navegador.

> **Nota de manutenção:** versões anteriores do `.env.example` documentavam `ADMIN_TOKEN`
> (usado para autorizar `POST /api/import` fora do loopback) e `SYNC_MAX_BLOBS`. O primeiro
> foi substituído por "loopback ou sessão de admin" na v0.3.000 e o segundo nunca chegou a
> ser implementado — nenhum dos dois faz efeito hoje. Se você tem um `.env` antigo com essas
> chaves, pode removê-las sem medo. Ver [STATUS.md](STATUS.md) para o histórico completo
> dessas decisões.

## Contas, cadastro e o primeiro admin

O cadastro é **fechado**: não existe tela de "criar conta" pública. O primeiro administrador
nasce de duas formas possíveis (só uma delas roda por vez, dependendo do estado do banco):

1. **Seed por ambiente** (recomendado): definir `ADMIN_EMAIL`/`ADMIN_PASSWORD` antes do
   primeiro boot com o banco de usuários vazio. É o único jeito de sair do zero.
2. **Admin cria outro admin**: uma vez logado, um admin pode criar outros admins em
   **Mais → Usuários → Criar usuário**, escolhendo o papel.

Usuários criados pelo admin recebem uma **senha temporária que aparece uma única vez na
tela** — não fica salva em lugar nenhum recuperável depois. No primeiro login, a pessoa é
obrigada a trocá-la por uma senha definitiva antes de usar qualquer outra parte do app.

> O admin **seedado por ambiente** não é forçado a trocar a senha automaticamente — troque-a
> manualmente em **Mais → Configurações** logo após o primeiro login, e remova
> `ADMIN_PASSWORD` do `.env`.

Ações disponíveis em **Mais → Usuários** (só para admin): criar, desativar/reativar,
promover/rebaixar, resetar senha, derrubar sessões, excluir. O sistema impede remover ou
rebaixar o último admin ativo, e impede um admin se auto-rebaixar ou se autoexcluir.

## Configurar a IA (BYOK)

Em **Mais → Configurações**, cada usuário escolhe um provedor — **Anthropic, OpenAI, Gemini
ou OpenRouter** — e cola a própria chave de API. A chave:

- fica **só no `localStorage` do navegador** daquele aparelho;
- é enviada ao servidor **a cada chamada** (não fica em cookie/sessão);
- o servidor **nunca a persiste** — ele só a repassa ao provedor escolhido e devolve a
  resposta (`POST /api/analyze` para fotos, `POST /api/careers/:id/advisor` para o
  conselheiro).

Isso habilita duas funcionalidades, ambas de **gatilho explícito** (nada roda automático —
cada chamada consome créditos do provedor, pagos pelo próprio usuário):

- **Captura**: ler uma foto da tela do jogo e extrair jogadores/atributos visíveis.
- **Conselheiro**: analisar a carreira (parecer completo) ou responder uma pergunta
  específica sobre ela, com base no elenco, objetivos, evolução e shortlist reais do banco.

## Deploy em produção

- **VPS nova, nada instalado ainda:** siga **[INSTALL.md](INSTALL.md)** — do zero até o app
  no ar, com CloudPanel, SSL, PM2, primeiro admin e primeira importação.
- **CloudPanel já instalado**, só falta o app: siga **[DEPLOY.md](DEPLOY.md)** diretamente —
  cobre também atualização de versão, **backup** do SQLite e solução de problemas comuns.

Resumo de uma atualização de código (com o app já no ar):

```bash
cd ~/htdocs/prancheta.seudominio.com
git pull && npm install && npm run build
pm2 restart prancheta
```

As migrations do banco (`server/src/db/migrations/*.sql`) rodam sozinhas a cada boot — não
há passo manual de schema. Backup é **essencial** a partir da v0.3.000: os dados de todos os
usuários vivem no SQLite do servidor (ver a seção de backup em DEPLOY.md).

## Testes e verificação

```bash
npm run verify     # typecheck (server+web) + testes (vitest) + build completo — rode isso antes de commitar
npm run typecheck   # só o typecheck
npm test             # só os testes
npm run build        # só o build
```

Não há lint configurado. O projeto pina `vitest` na major 4.x de propósito — o dist-tag
`latest` do npm ainda aponta para a 3.x, que puxa uma versão do `happy-dom` com um advisory
crítico de RCE. **Nunca rode `npm i vitest@latest`** nesse projeto — seria um downgrade.

Testes cobrem: isolamento de dados entre usuários, idempotência das migrations contra uma
cópia do schema de produção, auth (login/senha/sessão), regras de admin (não remover o
último admin, etc.), rotas de dados por carreira, e o conselheiro (contexto montado do banco
+ chamada ao provedor mockada, sem gastar créditos reais).

Há também um roteiro de QA end-to-end com capturas de tela de referência em
[`screenshots/tests/`](screenshots/tests/README.md), rodado sempre contra uma base de dados
isolada — nunca contra `server/data/companion.db`.

## Estrutura do projeto

```
server/
  src/
    routes/        # uma rota por arquivo: auth, careers, career-players, prospects,
                    #   admin-users, advisor, analyze, game-data, import, import-local, sync
    auth/          # sessão por cookie, hash de senha (scrypt), plugin de autenticação
    ai/            # providers.ts (encanamento BYOK genérico) + advisor.ts (contexto/prompt)
    vision/        # analyze.ts — extração de dados de fotos (consumidor de ai/providers)
    sofifa/        # download e import do dataset do Kaggle
    db/
      migrations/  # 00N-*.sql aplicadas em ordem no boot (runner em db/index.ts)
  data/            # companion.db (SQLite) — NÃO versionado, é o estado real do app
web/
  src/
    pages/         # uma página por rota; admin/ tem as telas exclusivas de administrador
    components/    # TabBar, AuthShell, AdvisorPanel, modais, etc.
    api/           # client.ts (fetch genérico + tipos) e user-data.ts (client das rotas de conta)
    store.ts       # o que É local por design: chaves BYOK de IA + leitor do blob legado
design-proposals/ # concepção visual da v0.4.000 (5 direções exploradas; Goleiro 92 venceu)
screenshots/tests/ # roteiro de QA e prints de referência da UI atual
plans/             # planos gerados pelo skill `improve` — cada um autocontido
```

## Conceitos do domínio

- **Carreira**: versão do jogo + time original (elenco completo carregado automaticamente da
  database) ou clube criado (FIFA 22+: nome, verba, liga, time substituído, objetivos,
  qualidade — jogadores gerados entram manualmente ou por foto do elenco).
- **Temporada/data atual do save**: sempre visível no hub; toda evolução de stats vira um
  *snapshot* datado (nunca sobrescreve), gerando a linha do tempo e o gráfico de
  desenvolvimento na ficha do jogador.
- **Radar de desenvolvimento**: no hub, quem tem snapshot registrado aparece ordenado pelo
  crescimento desde o overall original — destaca quem está subindo e quem estagnou.
- **Prospecção (Scout)**: busca com filtros sobre a database original da versão da carreira;
  shortlist com prioridade e status (observando → negociando → contratado, que move o
  jogador para o elenco; ou descartado).
- **BYOK**: "bring your own key" — a chave do provedor de IA vem do usuário, fica no
  navegador dele, nunca é persistida pelo servidor.
- **Conselheiro**: parecer completo ou pergunta dirigida sobre a carreira, com histórico.
  Sempre por gatilho explícito.
- **Chave de restauração** (legado, deprecada): código de 12 caracteres do modelo antigo,
  anterior às contas reais. Sobrevive só como fonte de migração one-shot para trazer dados
  antigos para uma conta nova; sai numa versão futura.

## Versionamento

O projeto segue o [PrideVer](https://pridever.org) — `PROUD.DEFAULT.SHAME`, terceiro segmento
com 3 dígitos por convenção (`0.4.000`). Ver [CHANGELOG.md](CHANGELOG.md) para o histórico de
releases, [STATUS.md](STATUS.md) para a narrativa completa de como o projeto chegou até aqui e
o que está pendente, e [ROADMAP.md](ROADMAP.md) para o cronograma das próximas versões.

---

Dados do jogo © EA Sports, compilados pela comunidade via [SoFIFA](https://sofifa.com).
Projeto pessoal, não comercial.
