# Plan 025: Instalador e atualizador (quase) visual — self-hosting fácil em Linux

> **Executor instructions**: Leia a seção "Realidade técnica" **inteira** antes de qualquer
> código. O pedido original ("igual ao WordPress: sobe arquivos, acessa a URL, instala tudo no
> navegador") **não transfere direto** para um app Node — há um ovo-e-galinha explicado abaixo.
> O plano reformula o pedido no que é **de fato construível e robusto**, em **fases
> independentes**. **Não comece a Fase 2 (atualizador) antes de a Fase 0 estar provada** em pelo
> menos duas distros — o atualizador é a parte arriscada.
>
> **Drift check**: `git log --oneline 1b00864..HEAD`. Nasce depois do `0.5.000`. Contexto:
> hoje a instalação é 100% manual ([`INSTALL.md`](../INSTALL.md), 16 passos, toda sobre
> CloudPanel) e a atualização também ([`DEPLOY.md`](../DEPLOY.md)).

## Status

- **Priority**: P3 (conveniência/distribuição; não bloqueia nada)
- **Effort**: **XL** (fatiado — cada fase é entregável sozinha)
- **Risk**: **MED-HIGH** — o `install.sh` é médio; o **atualizador visual é o risco real**
  (auto-restart do processo + migration mão-única podem brickar a instância).
- **Depends on**: nada de código; senta depois do `0.5.000`.
- **Category**: DX / operações / distribuição
- **Planned at**: commit `1b00864`, 2026-07-21

## Why this matters

Instalar o Prancheta hoje são 16 passos manuais numa VPS, presos ao CloudPanel. Isso trava dois
públicos: **o dono** (cada reinstalação/migração de servidor é trabalhosa) e **qualquer um que
queira auto-hospedar**. O sonho é a experiência do WordPress: subir os arquivos, acessar o
endereço, e um assistente conduzir instalação, configuração e onboarding na frente do usuário.

## Realidade técnica — por que não é "igual ao WordPress" (leia antes de tudo)

O instalador visual do WP funciona porque **PHP é interpretado pelo servidor web a cada
requisição**: o Apache/nginx já está no ar, então largar os `.php` no docroot e acessar a URL
**já executa** o instalador. O runtime já estava lá.

O Prancheta é um **processo Node de longa duração** (Fastify). Para servir **qualquer** página —
inclusive a do instalador — **o processo já precisa estar rodando**. Ovo-e-galinha: não existe
"servidor web executando meu entrypoint por requisição". Antes de qualquer URL responder, algo
teve que **instalar Node, `npm ci` (compila `better-sqlite3`), `npm run build` (Vite, consome
RAM), subir o processo (PM2) e configurar proxy reverso + HTTPS**.

Consequência — a fronteira do que pode ser visual:

| Camada | Visual (browser)? | Por quê |
|---|---|---|
| Node + build + subir processo | ❌ precisa de **1 comando** | Não há runtime servindo a página ainda |
| Proxy reverso + HTTPS (Let's Encrypt) | ❌ precisa **root**, é server-específico | apt≠dnf; nginx≠Apache≠Caddy≠CloudPanel |
| **Onboarding** (admin, domínio, 1ª database, IA) | ✅ sim | O app **já subiu** e serve o wizard |
| **Atualização** (backup→build→restart→rollback) | ✅ com cuidado | App no ar dispara script destacado |

**Precedente**: o [Ghost](https://ghost.org) (Node + DB, stack irmão) **divide de propósito**:
`ghost install` é um **CLI** que provisiona sistema (node, nginx, SSL, systemd); o onboarding
(criar conta, título) é **no navegador** depois que o servidor sobe. Vamos seguir o mesmo corte.

**Meta realista**: **um comando** e o resto é visual —
`git clone … && cd … && ./install.sh` → o script provisiona e **abre o wizard no navegador**.
Elimina os 16 passos manuais; não elimina o comando único (impossível num app Node).

## Requisitos mínimos e matriz de suporte (definir na Fase 0)

- **SO**: Linux, famílias **apt** (Ubuntu, Debian) e **dnf** (Fedora, e por tabela RHEL/Rocky/
  Alma). **Fora de escopo**: Windows/IIS, macOS como servidor, Alpine (musl quebra binários
  pré-compilados) — documentar como não suportado, não travar neles silenciosamente.
- **Node**: `>=20.12` (já é o piso do projeto; ver `package.json engines`). O script instala se
  faltar (NodeSource ou nvm).
- **Build nativo**: `better-sqlite3` precisa de toolchain (python3/make/g++) **se** não houver
  binário pré-compilado para a plataforma. Ver "Artefato de release" — a saída preferida é **não
  compilar no servidor**.
- **RAM/disco**: o `npm run build` (Vite) tem pico de memória; cada database do jogo importada
  pesa centenas de MB (ver `plans/023`). O script deve **medir e avisar** (abortar com mensagem
  clara se faltar), não descobrir no meio.

## Fases (cada uma entregável e independente)

### Fase 0 — `install.sh`: bootstrap de um comando (o backbone)

Um script POSIX-sh/bash na raiz do repo. Idempotente (rodar de novo não quebra). Faz:

1. **Detectar** distro/gerenciador de pacotes (apt vs dnf), arquitetura, RAM/disco livres —
   abortar com mensagem clara se abaixo do mínimo.
2. **Garantir Node** `>=20.12` (instalar via NodeSource/nvm se ausente) e ferramentas de build
   **só se** for compilar (ver artefato de release).
3. **`npm ci` + `npm run build`** (ou usar o artefato pré-buildado — Fase 0.5).
4. **Gerar `server/.env`** a partir de prompts (ou flags `--yes` p/ modo não-interativo): `PORT`
   livre (detectar com `ss -tlnp`), `CORS_ORIGINS`, e as credenciais do 1º admin. **Tratar as
   armadilhas já documentadas**: senha com `#`/`$` entra com aspas simples; o seed do admin é
   one-shot (ver `DEPLOY.md`).
5. **Subir com PM2** a partir do `ecosystem.config.cjs`, `pm2 save`, `pm2 startup`.
6. **Modos de proxy/HTTPS** (a decisão mais delicada):
   - `--panel` (ou autodetecção de CloudPanel): **NÃO** mexe em proxy/SSL — o painel já faz.
     Só imprime "aponte o App Port para a porta X". **Este é o modo do dono** (o prod dele é
     CloudPanel; ver a seção de coexistência do `DEPLOY.md`).
   - `--bare` (VPS crua): opcionalmente configura um proxy. **Recomendação forte: Caddy**, que
     emite HTTPS automático — é a única forma de tornar o SSL genuinamente "sem passos". nginx +
     certbot fica como alternativa documentada, não default.
7. Ao final, **imprimir a URL do wizard** e um **token de instalação** de uso único (ver
   Segurança), abrindo a Fase 1.

> **Sozinha, a Fase 0 já entrega ~80% do valor** e ajuda o dono imediatamente. Ela é o ponto de
> corte natural se o resto for adiado.

### Fase 0.5 — Artefato de release pré-buildado (habilita servidores fracos)

O WP não builda no servidor; o Prancheta builda. Em VPS de pouca RAM o `npm run build` pode dar
OOM. Publicar um **tarball de release** (via GitHub Releases) contendo `server/dist` + `web/dist`
já buildados + `package-lock.json`, de modo que o `install.sh` **baixe e rode sem buildar**
(`npm ci --omit=dev` só para deps de runtime). Isso aproxima de verdade do "sobe e roda" do WP e
reduce o requisito mínimo. Decisão de design: "clonar o git e buildar" **vs** "baixar release
pronto" — para o público de auto-hospedagem, **release pronto ganha**.

### Fase 1 — Wizard de onboarding no navegador (reusar o que já existe)

Servido **pelo próprio app** no primeiro boot. Muita coisa **já existe** — é costurar, não criar
do zero:

- **Já pronto**: seed do 1º admin + **troca forçada de senha no 1º login**, área admin, import de
  database do jogo, config de IA por usuário (BYOK no aparelho).
- **A construir**: uma tela de "primeiro uso" que detecta instalação nova e conduz: confirmar
  domínio/`CORS_ORIGINS`, **importar a 1ª database do jogo** (hoje é em Mais → Databases —
  trazer para o fluxo de boas-vindas), e um resumo final. O admin/senha reusa o fluxo existente.
- **Self-disabling**: terminado o onboarding, a tela some (flag em disco/DB); acessos posteriores
  não a reexibem.

### Fase 2 — Atualizador visual no admin (a parte arriscada — NÃO comece antes da Fase 0)

Um botão "Atualizar" na área admin que orquestra o que hoje é manual no `DEPLOY.md`. **Risco alto
por dois motivos estruturais** — o design precisa encará-los, não escondê-los:

1. **Auto-restart**: o processo que roda `pm2 restart prancheta` **se mata no meio**. Solução:
   disparar um **script destacado** (child process `detached`, ou um hook do PM2) que faz o
   trabalho e reinicia o app; a UI então faz **polling de health** até o app voltar.
2. **Migration é mão-única** (documentado no `DEPLOY.md`, e a gente já apanhou disso). Um "Update
   now" que roda migration **precisa**, nesta ordem, sem exceção:
   - **backup do banco ANTES** (o `.backup` online do SQLite);
   - aplicar update (pull/release + `npm ci` + build + migrations + restart);
   - **health-check** pós-restart;
   - se falhar, **rollback guiado** (restaurar o backup + voltar o código) — nunca só um dos dois.
- Guardas: exigir sessão de **admin**; mostrar o diff de versão (de→para) e se há migration nova;
  botão desabilitado enquanto outra operação roda; travar em produção sem backup gravado.

> Se, ao desenhar a Fase 2, o auto-restart confiável se mostrar frágil demais, o **fallback
> honesto** é um "atualizador semi-visual": a UI mostra o comando exato e o checklist (backup →
> `git pull` → build → restart), e o usuário roda no shell. Menos mágico, muito mais seguro.

## Segurança (transversal — um instalador web é superfície de ataque)

- Um instalador/wizard exposto na web que provisiona admin e roda comandos é, por definição,
  perigoso (é quase RCE-durante-o-install). Mitigações **obrigatórias**:
  - **Token de instalação de uso único** impresso no console pelo `install.sh`; o wizard exige
    ele. Sem token → 403. (O WP sofre exatamente desse problema de "quem acessa primeiro toma a
    instância" — não repetir.)
  - Bind em **loopback** durante a fase de instalação sempre que possível; expor só o necessário.
  - **Self-disable** após concluir: o endpoint de instalação retorna 404/410 depois.
- O atualizador roda comandos de shell a partir de uma ação web → **só com sessão de admin**, com
  as mesmas checagens de `Origin`/CSRF do resto do app, e escopo mínimo (nada de comando
  arbitrário vindo do cliente).

## Decisão de escopo a bater com o dono (antes da Fase 1+)

**Qual é o objetivo real?**
- Se é **facilitar as reinstalações do próprio dono** → **Fase 0 (+0.5)** basta e é barata. Pare
  aí até haver demanda.
- Se é **distribuição** (terceiros auto-hospedando) → aí Fases 1 e 2 se pagam, e o custo XL se
  justifica.

Este plano assume o segundo, mas **entrega o primeiro já na Fase 0** — então começar não exige
resolver a pergunta agora.

## Verification

- [ ] **Fase 0**: numa VM **Ubuntu**, numa **Debian** e numa **Fedora** limpas, `./install.sh`
      leva de repo clonado a app no ar em um comando; idempotente (rodar 2x não quebra); modo
      `--panel` não toca proxy/SSL.
- [ ] **Fase 0.5**: numa VM de RAM baixa, instalar pelo **release pré-buildado** sem rodar build,
      e o app sobe.
- [ ] **Fase 1**: instalação nova cai no wizard; ao fim, admin logado, database importada,
      `CORS_ORIGINS` gravado; o wizard **não** reaparece depois (self-disabled); sem token → 403.
- [ ] **Fase 2**: "Atualizar" faz backup→update→health-check com o app voltando sozinho; um
      **teste de migration que falha** dispara o rollback guiado e a instância **não fica
      brickada**.
- [ ] `npm run verify` verde e CI verde em todas as fases.
- [ ] `INSTALL.md`/`DEPLOY.md` atualizados: o caminho manual vira "fallback"; o caminho
      recomendado passa a ser o `install.sh`.

## STOP conditions

- **Prometer "instalação 100% no navegador" da camada de sistema** → PARE. É o ovo-e-galinha do
  Node; não existe sem um processo já rodando. O mínimo honesto é **um comando**.
- **Fase 2 sem backup-first + health-check + rollback** → PARE. Um atualizador que pode brickar a
  instância num migration ruim é pior que não ter atualizador. Migration é mão-única.
- **O `install.sh` tentar configurar proxy/SSL numa VPS com CloudPanel** → PARE. Vai conflitar
  com o painel. O modo `--panel` (default quando CloudPanel é detectado) **não** mexe nisso.
- **Suporte "amplo" virar suporte "infinito"** (cada painel/distro/musl) → PARE e corte para a
  matriz definida (apt+dnf, glibc). Documentar o resto como não suportado, explicitamente.
- **Auto-restart do atualizador se mostrar frágil** → não force mágica; caia para o "atualizador
  semi-visual" (UI mostra comando + checklist). Registre a decisão.

## Maintenance notes

- Manter a matriz de suporte **honesta e testada**: um instalador que promete Fedora e quebra
  em Fedora é pior que um que diz "só Ubuntu/Debian". Só liste o que passou no `Verification`.
- Cada fase que entrar **substitui** trechos manuais do `INSTALL.md`/`DEPLOY.md` — mover, não
  duplicar (senão viram docs zumbis divergentes).
- O `install.sh` e o `ecosystem.config.cjs` compartilham a verdade sobre `PORT`/paths — não
  deixar divergir (a armadilha do `PORT` do ecosystem vencer o `.env` já nos mordeu).
- Se a Fase 0.5 (release pré-buildado) entrar, ela cria uma responsabilidade nova: **publicar
  releases** a cada versão. Amarrar isso ao fluxo de tag/CHANGELOG que o `0.5.000` inaugurou.
