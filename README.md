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

## 🚀 Guia de Deploy na VPS (Debian 12 + CloudPanel)

> [!NOTE]
> Este é o ambiente **oficialmente recomendado e homologado** para rodar o app. Se você estiver usando outro sistema ou painel, *que a força esteja com você para configurar*! 😅

Como o app armazena todas as carreiras locais direto no `localStorage` do navegador do usuário, o servidor VPS funciona de forma extremamente leve e stateless. Ele serve apenas para carregar a database do FIFA, processar o OCR das imagens com IA e sincronizar chaves curtas de backup.

Siga os passos didáticos abaixo para colocar o app no ar em minutos:

### 1. Preparação na VPS (Acesso Root)

Acesse sua VPS via SSH como `root` para instalar o gerenciador de processos Node.js:

```bash
# Instalar o PM2 globalmente no sistema
npm install -g pm2
```

---

### 2. Criar o site no CloudPanel

1. Acesse o painel web do seu **CloudPanel**.
2. Clique em **Add Site** no canto superior direito e selecione **Create a Node.js Site**.
3. Preencha as configurações:
   - **Domain Name**: O domínio onde o app vai rodar (ex.: `companion.meudominio.com`).
   - **Node.js Version**: Escolha a versão estável mais recente (recomenda-se **v20** ou superior).
   - **App Port**: Digite `3344` (essa é a porta em que nosso backend Fastify rodará por padrão).
   - **Site User**: Crie um usuário SSH para o site (ex.: `fifa-admin`). Guarde a senha dele!
4. Clique em **Create**.

---

### 3. Subir o Código e Configurar (SSH com Usuário do Site)

Acesse a VPS via SSH usando o **usuário criado para o site** (ex.: `fifa-admin`). Nunca rode estes passos como `root` para manter as permissões do CloudPanel organizadas!

```bash
# 1. Vá para o diretório htdocs criado pelo CloudPanel
cd /home/cloudpanel/htdocs/companion.meudominio.com

# 2. Clone o repositório do app direto nesta pasta
git clone <URL_DO_SEU_REPOSITORIO_GIT> .

# 3. Crie e configure o arquivo de variáveis de ambiente
cp server/.env.example server/.env
```

Abra o arquivo `server/.env` em um editor (como `nano server/.env`) e ajuste:
```env
PORT=3344
# Chave opcional. Se preferir colar a chave de IA direto na tela de configurações do app, pode deixar vazia!
ANTHROPIC_API_KEY=
```

---

### 4. Instalação e Compilação dos Assets

Com o código no local correto, execute a instalação de dependências e a compilação do monorepo:

```bash
# Instala as dependências de desenvolvimento e produção de todo o monorepo
npm install

# Compila o TypeScript do server e faz o build de produção do frontend React (Vite)
npm run build
```

*Didática técnica:* Esse comando gera a pasta `web/dist` com os arquivos estáticos compilados do frontend. Quando o servidor iniciar, o Fastify vai detectar essa pasta e servir a interface web na porta `3344` automaticamente!

---

### 5. Iniciar e Fixar o Processo com PM2

Para garantir que o app continue rodando em background após você fechar o terminal (e inicie automaticamente se a VPS for reiniciada):

```bash
# 1. Inicia o app usando a configuração do ecosystem
pm2 start ecosystem.config.cjs

# 2. Salva a lista de processos para persistir no boot da VPS
pm2 save
```

Pronto! Acesse `http://companion.meudominio.com` no seu navegador e o aplicativo estará funcionando.

---

### 6. Como Atualizar no Futuro

Sempre que fizermos atualizações no código, basta rodar esses comandos no SSH da VPS (com o usuário do site):

```bash
git pull
npm install
npm run build
pm2 restart fifa-companion
```

---

## 💾 Backup, Restauração e Sincronização

Na aba **⚙️ Configurações** do aplicativo, você encontrará duas formas de gerenciar seus dados:

1. **Backup por Arquivo (.json)**:
   - Baixa e importa o arquivo físico com todas as suas carreiras locais.
2. **Sincronização na Nuvem via Chave/Seed (VPS)**:
   - Clique em **Gerar Chave de Sincronização**: O navegador envia seu LocalStorage para uma tabela temporária do SQLite na sua VPS e retorna uma chave curta de 6 dígitos (ex.: `H5F9X2`).
   - Em qualquer outro computador, celular ou aba anônima, basta digitar essa chave e clicar em **Restaurar via Chave** para puxar todo o seu progresso instantaneamente, sem precisar mover arquivos.
