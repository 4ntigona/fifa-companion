# Deploy do Prancheta — Debian 12 + CloudPanel

Passo a passo completo para colocar o app no ar numa VPS. O Prancheta roda como **um único
processo Node** que serve a API **e** o front buildado; o CloudPanel cuida do proxy reverso e
do HTTPS (que é o que faz a câmera do PWA funcionar no celular).

> **v0.4.000 em diante**: o app tem contas reais. Os dados dos usuários (carreiras, elencos,
> snapshots, prospecção, pareceres do conselheiro) ficam no **SQLite do servidor** — o backup
> de `server/data/` deixou de ser opcional. As chaves de IA continuam **BYOK**, no navegador
> de cada usuário: nunca vão para o servidor.

> **VPS ainda sem CloudPanel?** Este documento assume que ele já está instalado. Para o
> caminho completo a partir de uma VPS em branco (instalar o CloudPanel, DNS, swap, etc.),
> veja **[INSTALL.md](INSTALL.md)** primeiro.

> **Já tem outros sites nesse CloudPanel?** O Prancheta convive numa VPS compartilhada sem
> problema — cada site do CloudPanel é isolado. Mas há três pontos a acertar (porta, PM2 e
> recursos): leia a seção **[Coexistindo com outros sites](#coexistindo-com-outros-sites-no-mesmo-cloudpanel)**
> antes de começar. Onde este guia diz `3344`, troque pela porta que você escolher lá.

---

## 0. Pré-requisitos

- VPS com **Debian 12** e **CloudPanel** instalado.
- Um domínio/subdomínio com DNS (registro A) apontando para o IP da VPS —
  ex.: `prancheta.seudominio.com`.
- **Node 20.12+ ou 22+** (o CloudPanel deixa escolher na criação do site). A versão mínima
  importa: usamos `--env-file-if-exists`, disponível a partir do 20.12.

---

## Coexistindo com outros sites no mesmo CloudPanel

Se a VPS já roda outros sites, o Prancheta entra como só mais um. Cada site do CloudPanel tem
o **próprio usuário Linux, a própria pasta e o próprio proxy reverso** — então não há risco de
um pisar no outro *desde que* você resolva estes três pontos antes de seguir.

### 1) Porta: escolha uma livre e use a MESMA nos dois lugares

Todo site Node no CloudPanel escuta numa porta interna própria. `3344` é só o padrão deste
guia — se outro site já usa, ou você prefere outra, escolha uma porta livre. Confira o que já
está em uso na VPS (como root ou com sudo):

```bash
ss -tlnp | grep -E '127.0.0.1|0.0.0.0'   # lista as portas em escuta e o processo de cada uma
```

Escolha uma porta alta e livre (ex.: `3345`, `3401`…). Você vai usá-la em **dois lugares que
precisam bater** — se divergirem, o CloudPanel devolve `502 Bad Gateway`:

1. o campo **App Port** ao criar o site (Passo 1), que define o proxy reverso;
2. o `PORT` do app.

> **Onde mudar o `PORT` do app:** no `ecosystem.config.cjs`, no bloco `env` (`PORT: '3345'`).
> **Não** adianta só pôr no `server/.env`: o bloco `env` do PM2 vira variável de ambiente real
> do processo, que tem precedência sobre o `--env-file`. Ou seja, o ecosystem ganha — edite lá.

### 2) PM2: confirme que está isolado

No fluxo padrão do CloudPanel (um usuário por site), o PM2 roda **por usuário**, então o do
Prancheta é naturalmente separado dos outros. Ainda assim, valem duas cautelas:

- **Conecte via SSH como o usuário do site do Prancheta** (Passo 4) e rode `pm2 list` logo de
  cara. Se aparecerem processos de **outros** apps, é sinal de que os sites compartilham o
  mesmo usuário Linux — nesse caso, **nunca** use `pm2 stop`/`pm2 delete`/`pm2 restart` **sem
  nome** (isso atinge todos). Sempre com o nome: `pm2 restart prancheta`.
- O nome do processo é `prancheta` (em `ecosystem.config.cjs`). Se, por acaso, já existir um
  processo com esse nome na lista, renomeie o seu antes de subir.
- `pm2 startup` cria um serviço de boot **para aquele usuário**. Se já existe um (porque outro
  app do mesmo usuário já configurou), o PM2 apenas atualiza — não duplica. `pm2 save` grava a
  lista atual daquele usuário; rode-o **depois** de subir o Prancheta, para não apagar o que já
  estava salvo.

### 3) Recursos: disco, RAM e o pico da importação

- **Disco**: a database do jogo importada pesa **centenas de MB por versão** (o arquivo real
  chega a ~380 MB com várias versões). Confirme que há folga: `df -h`.
- **RAM**: o `ecosystem.config.cjs` já limita o processo a `400M` (`max_memory_restart`), então
  ele não sufoca os vizinhos por vazamento. O **pico** é a importação da database (Passo 7) —
  se a VPS for apertada de RAM, importe **uma versão de cada vez** e evite fazê-lo no horário
  de maior tráfego dos outros sites.
- **build tools** (Passo 3): se já há outros sites Node compilando módulos nativos, o
  `build-essential`/`python3` provavelmente já está instalado — o comando é idempotente, rodar
  de novo não faz mal.

O resto (`CORS_ORIGINS`, `client_max_body_size`, SSL, backup) é **por-site** e não interfere
em nada nos outros. Seguindo esses três pontos, o restante do guia vale como está — só lembre
de trocar `3344` pela sua porta onde ele aparecer.

---

## 1. Criar o site no CloudPanel

No painel: **Sites → Add Site → Create a Node.js Site**.

| Campo | Valor |
|---|---|
| Domain | `prancheta.seudominio.com` |
| Node.js version | 20 ou 22 |
| App Port | `3344` (ou a porta livre que você escolheu — ver [coexistência](#coexistindo-com-outros-sites-no-mesmo-cloudpanel)) |
| Site User | anote o usuário criado (você vai usar no SSH) |

O CloudPanel cria o usuário do site, a pasta `~/htdocs/prancheta.seudominio.com` e o proxy
reverso apontando para a porta que você informou. **Se escolheu uma porta diferente de `3344`,
lembre de refleti-la no `ecosystem.config.cjs` (`env.PORT`) antes do Passo 6** — as duas têm
que bater, senão o proxy devolve 502.

## 2. Emitir o certificado SSL

Aba **SSL/TLS → Actions → New Let's Encrypt Certificate**.

Obrigatório: sem HTTPS a câmera (input `capture`) e a instalação do PWA não funcionam.

## 3. Ferramentas de build (uma vez por VPS)

O `better-sqlite3` é um módulo nativo — precisa compilar na instalação:

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
```

## 4. Enviar o código e buildar

Conecte via SSH **como o usuário do site** (não como root):

```bash
ssh site-user@sua-vps
cd ~/htdocs/prancheta.seudominio.com

# Opção A — clonar o repositório
git clone <URL-DO-REPO> .
git checkout main

# Opção B — enviar da sua máquina, com rsync (exclui o que não deve subir)
#   rsync -avz --exclude node_modules --exclude server/data --exclude .git \
#     ./ site-user@sua-vps:~/htdocs/prancheta.seudominio.com/

npm install     # instala os workspaces (server + web)
npm run build   # gera web/dist e compila server/dist
```

## 5. Configurar o ambiente

```bash
cp server/.env.example server/.env
nano server/.env
```

No **primeiro deploy**, além do que já vem comentado no arquivo, defina:

```ini
# Restringe quem pode falar com a API (sem isso, ela reflete qualquer origem)
CORS_ORIGINS=https://prancheta.seudominio.com

# SÓ NO PRIMEIRO BOOT: semeia o primeiro administrador.
# Sem isso, o banco nasce sem usuários e NINGUÉM consegue entrar.
ADMIN_EMAIL=voce@seudominio.com
ADMIN_PASSWORD=uma-senha-forte-e-temporaria
```

> **Importante:** o seed só roda quando a tabela `users` está **vazia**. Depois de confirmar
> que você consegue entrar, **apague `ADMIN_EMAIL` e `ADMIN_PASSWORD` do `.env`** e reinicie
> (`pm2 restart prancheta`). Troque a senha pelo app em **Mais → Configurações**.

## 6. Subir com PM2

O CloudPanel já traz o PM2. Ainda na pasta do site:

```bash
pm2 list                 # numa VPS compartilhada, veja o que já roda por este usuário
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup              # rode o comando que ele imprimir (com sudo) para subir no boot
```

> **VPS com outros sites:** se `pm2 list` já mostrava outros processos, confirme que só o
> `prancheta` foi adicionado e sempre opere pelo nome (`pm2 restart prancheta`), nunca sem
> nome. Detalhes na seção [coexistência](#coexistindo-com-outros-sites-no-mesmo-cloudpanel).

Verifique:

```bash
pm2 status
pm2 logs prancheta --lines 50
```

No boot você deve ver a linha do seed do admin (só na primeira vez) e
`Server listening at http://127.0.0.1:3344`. As **migrations do banco rodam sozinhas** a cada
boot — não há passo manual de schema.

Acesse `https://prancheta.seudominio.com` e faça login com o admin semeado.

## 7. Importar a database do jogo (uma vez por versão)

Logado como admin: **Mais → Databases do jogo** → selecione as versões (ex.: FIFA 16 e 22)
→ **Importar**. O servidor baixa o dataset público do Kaggle e popula o SQLite, com barra de
progresso.

O arquivo é grande e a primeira importação leva alguns minutos — pode deixar rodando. Se
preferir pelo terminal:

```bash
npm run import:data -- 16 22
```

> Os dados do jogo são **reais** (dumps do SoFIFA via Kaggle) e compartilhados por todos os
> usuários, em modo somente-leitura. As migrations nunca tocam essas tabelas.

## 8. Criar os usuários

O cadastro é fechado: **o admin cria as contas**. Em **Mais → Usuários → Criar usuário**,
informe o e-mail e o papel. O app mostra uma **senha temporária que aparece uma única vez** —
copie e entregue ao usuário. No primeiro login ele é obrigado a trocá-la.

## 9. Configurar a IA (cada usuário, no próprio aparelho)

Em **Mais → Configurações**, cada pessoa cola a chave do provedor que preferir (Anthropic,
OpenAI, Gemini ou OpenRouter). A chave fica no `localStorage` do navegador dela e é enviada a
cada requisição; o servidor apenas repassa ao provedor e **nunca a persiste**.

Isso habilita a leitura de fotos (tab **Captura**) e o **Conselheiro** no hub da carreira.

---

## Atualizações futuras

**Antes de tudo, faça um backup** (ver a seção seguinte). Se a atualização trouxer uma
migration, esse backup é a única forma de voltar atrás.

```bash
cd ~/htdocs/prancheta.seudominio.com
sqlite3 server/data/companion.db ".backup '$HOME/backups/pre-update-$(date +%F).db'"
git pull
npm install
npm run build
pm2 restart prancheta
```

As migrations pendentes são aplicadas no restart. Os dados dos usuários e a database do jogo
sobrevivem ao deploy.

### ⚠️ Migration é via de mão única

Depois que uma migration roda, **o código antigo não funciona mais naquele banco**. Não existe
"desfazer migration" neste projeto — o runner só avança.

Consequência prática: se algo der errado depois de uma atualização, **não adianta voltar só o
código** (`git checkout` numa tag anterior, ou apontar o PM2 para um build velho). O app vai
quebrar no boot, porque a versão antiga espera um schema que não existe mais.

Quando uma atualização der problema, você tem duas saídas — e só duas:

1. **Avançar** (preferível): corrigir o problema e subir uma versão mais nova. O banco já está
   no formato certo.
2. **Voltar de verdade**: restaurar o backup do banco **de antes da migration** *e* voltar o
   código para a versão correspondente. Os dois juntos, nunca só um.

> Isso não é teórico: aconteceu em desenvolvimento na `0.4.002`. A migration `004` dropou a
> tabela `sync_blobs`; ao trocar de branch para uma versão anterior, o servidor passou a
> crashar no boot com `SqliteError: no such table: sync_blobs`. Ver o sintoma exato no
> troubleshooting abaixo.

## Backup (faça isto)

Todo o estado do app vive num arquivo só. Com o app rodando, use o backup online do SQLite
(não copie o arquivo com `cp`, por causa do WAL):

```bash
sqlite3 ~/htdocs/prancheta.seudominio.com/server/data/companion.db \
  ".backup '/home/site-user/backups/prancheta-$(date +%F).db'"
```

Um cron diário resolve:

```bash
crontab -e
# 0 4 * * * sqlite3 ~/htdocs/prancheta.seudominio.com/server/data/companion.db ".backup '/home/site-user/backups/prancheta-$(date +\%F).db'"
```

> O arquivo inclui a database do jogo importada (centenas de MB). Se quiser backups enxutos,
> guarde só as tabelas de usuário — a database do jogo pode ser reimportada a qualquer momento.

## Notas e solução de problemas

- **Escuta em loopback:** o servidor sobe em `127.0.0.1:3344`; só o CloudPanel fala com ele.
  Nunca exponha a porta direto na internet.
- **Foto grande falhando (413):** o Nginx do CloudPanel limita o corpo da requisição. Em
  **Sites → seu site → Vhost**, aumente: `client_max_body_size 30M;`.
- **`npm install` falhando no better-sqlite3:** faltou o passo 3 (`build-essential python3`).
- **App crasha no boot com `SqliteError: no such table: <alguma_tabela>`:** o banco está numa
  versão **mais nova** que o código. Quase sempre é rollback de código depois de uma migration
  ter rodado (ver "Migration é via de mão única", acima). Confirme comparando o que o banco diz
  ter aplicado com os arquivos de migration presentes no código:
  ```bash
  sqlite3 server/data/companion.db "SELECT id, name FROM schema_migrations ORDER BY id;"
  ls server/src/db/migrations/
  ```
  Se o banco lista migrations que **não existem** na pasta, o código é antigo demais para ele.
  Saída: volte para a versão do código que contém aquelas migrations (`git checkout main`,
  `npm run build`, `pm2 restart prancheta`) — ou restaure o backup do banco de antes da
  migration e o código correspondente, juntos.
- **Ninguém consegue logar:** o banco nasceu sem usuários. Pare o app, garanta que `users`
  está vazia, defina `ADMIN_EMAIL`/`ADMIN_PASSWORD` no `.env` e reinicie.
- **Perdeu a senha do admin:** não há recuperação por e-mail. Se houver outro admin, ele
  reseta pela tela de Usuários. Se não houver, gere um novo hash `scrypt` e atualize a linha
  do usuário direto no SQLite (com o app parado).
- **Logs:** `pm2 logs prancheta`. Rotação: `pm2 install pm2-logrotate`.
- **Sem chaves de IA no servidor:** não existe `ANTHROPIC_API_KEY` no `.env` — é BYOK por
  design. Se algum dia aparecer uma, algo está errado.
