# Instalação do zero — Prancheta numa VPS nova

Checklist sequencial para sair de uma **VPS Debian 12 completamente nova** (sem nada instalado)
até o Prancheta no ar, com HTTPS, um administrador e a primeira database do jogo importada.

Se você **já tem o CloudPanel instalado** e só quer subir o app, pule para o
[Passo 5](#5-criar-o-site-no-cloudpanel) — ou use direto o [DEPLOY.md](DEPLOY.md), que cobre
deploy + atualização + backup de forma mais compacta. Este documento é o caminho completo,
para quem está partindo de uma máquina em branco.

**Tempo estimado:** 30–45 min (a maior parte é esperar a importação da database do jogo).

---

## O que você precisa antes de começar

- [ ] Uma VPS com **Debian 12** limpo (mínimo recomendado: **2 vCPU / 4 GB RAM / 40 GB disco** —
  ver nota sobre RAM no Passo 2). Provedores comuns: Hetzner, DigitalOcean, Contabo, OVH.
- [ ] O **IP** da VPS e a senha (ou chave SSH) de root fornecida pelo provedor.
- [ ] Um **domínio ou subdomínio** que você controla (ex.: `prancheta.seudominio.com`), para
  apontar o DNS. HTTPS é obrigatório — a câmera do PWA não funciona sem ele.
- [ ] Acesso ao painel de DNS do domínio (Cloudflare, Registro.br, o painel do seu provedor…).
- [ ] Um terminal SSH na sua máquina (Terminal no Mac/Linux, PowerShell ou WSL no Windows).

---

## 1. Primeiro acesso e atualização do sistema

```bash
ssh root@SEU-IP-AQUI
```

Aceite a chave do host na primeira conexão. Uma vez dentro:

```bash
apt update && apt full-upgrade -y
reboot
```

Espere ~1 minuto e reconecte (`ssh root@SEU-IP-AQUI`).

> **Não configure firewall (ufw/iptables) manualmente antes do CloudPanel.** O instalador dele
> already gerencia as regras de firewall e vai conflitar com uma configuração feita à mão.

## 2. (VPS com pouca RAM) Adicionar swap

O build do `better-sqlite3` (módulo nativo) e a importação da database do jogo (CSV de
centenas de MB) usam memória de pico. Em VPS com **menos de 4 GB de RAM**, crie um swap file
antes de prosseguir — evita o processo morrer com "JavaScript heap out of memory" ou o `npm
install` travar:

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h   # confirme que o swap apareceu
```

Se sua VPS já tem 4 GB+ de RAM, pode pular este passo.

## 3. Apontar o DNS

No painel do seu domínio, crie um registro:

| Tipo | Nome | Valor |
|---|---|---|
| A | `prancheta` (ou o subdomínio que preferir) | IP da sua VPS |

Propagação costuma levar minutos, às vezes até 1h. Confirme antes de seguir:

```bash
# na sua máquina local (não na VPS)
dig +short prancheta.seudominio.com
# deve devolver o IP da VPS
```

## 4. Instalar o CloudPanel

De volta à VPS, como root, rode o instalador oficial (ele detecta o Debian 12 e configura
Nginx, PHP, o painel web, o firewall e o PM2 sozinho):

```bash
curl -sS https://installer.cloudpanel.io/ce/v2/install.sh -o install.sh
# opcional, recomendado: confira o hash do script contra o publicado em docs.cloudpanel.io
# antes de rodar — o comando abaixo executa o instalador oficial da CloudPanel.
bash install.sh
```

A instalação leva alguns minutos. No final, o terminal imprime a URL do painel, algo como:

```
https://SEU-IP:8443
```

Abra essa URL no navegador (aceite o aviso de certificado autoassinado — é só para o
primeiro acesso) e **crie sua conta de administrador do CloudPanel** (nome, e-mail, senha).
Isso é a conta do painel, diferente da conta de admin do Prancheta que você vai criar mais
adiante — não confunda as duas.

## 5. Criar o site no CloudPanel

Dentro do painel: **Sites → Add Site → Create a Node.js Site**.

| Campo | Valor |
|---|---|
| Domain Name | `prancheta.seudominio.com` (o mesmo do DNS do Passo 3) |
| Node.js Version | **20** ou **22** |
| App Port | `3344` |
| Site User | anote — você vai usar no SSH a partir de agora |

Clique em **Create**. O CloudPanel cria um usuário Linux próprio para o site, a pasta
`~/htdocs/prancheta.seudominio.com` e um proxy reverso Nginx apontando para a porta `3344`.

## 6. Emitir o certificado SSL

Ainda no site criado: aba **SSL/TLS → Actions → New Let's Encrypt Certificate** → Actions →
Create and Install.

Confirme que `https://prancheta.seudominio.com` abre no navegador (vai mostrar um erro do
Nginx/502 por enquanto — normal, o app ainda não está rodando na porta 3344). O que importa
aqui é o cadeado verde.

## 7. Ferramentas de build (uma vez por VPS)

Ainda como **root**, instale o necessário para compilar o `better-sqlite3` (módulo nativo):

```bash
apt-get install -y build-essential python3
```

## 8. Conectar como o usuário do site e clonar o código

A partir daqui, **nunca mais como root** — sempre como o usuário do site criado no Passo 5:

```bash
ssh site-user@SEU-IP
cd ~/htdocs/prancheta.seudominio.com
```

```bash
git clone <URL-DO-REPO> .
git checkout main
```

(Sem acesso Git na VPS? Envie os arquivos por `rsync` a partir da sua máquina:
`rsync -avz --exclude node_modules --exclude server/data --exclude .git ./ site-user@SEU-IP:~/htdocs/prancheta.seudominio.com/`)

## 9. Instalar dependências e buildar

```bash
npm install     # instala os workspaces (server + web) — pode levar alguns minutos
npm run build   # gera web/dist e compila server/dist
```

Se `npm install` falhar reclamando de compilação nativa, confirme que o Passo 7 foi feito.

## 10. Configurar o ambiente

```bash
cp server/.env.example server/.env
nano server/.env
```

Preencha, no mínimo:

```ini
CORS_ORIGINS=https://prancheta.seudominio.com

# só existem neste primeiro boot — apague depois que confirmar o login (Passo 13)
ADMIN_EMAIL=voce@seudominio.com
ADMIN_PASSWORD=escolha-uma-senha-forte-aqui
```

Salve (`Ctrl+O`, `Enter`, `Ctrl+X` no nano).

> **Por que isso importa:** sem `ADMIN_EMAIL`/`ADMIN_PASSWORD` no primeiro boot, o banco de
> dados nasce **sem nenhum usuário** e não existe nenhuma forma de criar o primeiro admin
> depois — o cadastro é fechado por design (só admin cria conta). Se isso acontecer, pare o
> app, edite o `.env` e reinicie.

## 11. Subir o app com PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

O último comando imprime uma linha começando com `sudo env PATH=...` — copie e rode **com
sudo** (fora do PM2, uma vez só). Isso garante que o app volta sozinho se a VPS reiniciar.

Confirme que subiu:

```bash
pm2 status                       # deve mostrar "prancheta" como "online"
pm2 logs prancheta --lines 30    # procure "Server listening at http://127.0.0.1:3344"
                                  # e a linha "Primeiro admin criado a partir do ambiente: ..."
```

## 12. Acessar e confirmar o login

Abra `https://prancheta.seudominio.com` no navegador. Você deve ver a tela de login do
Prancheta (fundo roxo, wordmark "Prancheta!"). Entre com o `ADMIN_EMAIL`/`ADMIN_PASSWORD` que
você definiu no Passo 10.

## 13. Remover as credenciais do primeiro boot

Com o login confirmado, volte ao `server/.env` e **apague (ou comente) as duas linhas**:

```bash
nano server/.env
# apague ADMIN_EMAIL e ADMIN_PASSWORD (ou comente com #)
```

```bash
pm2 restart prancheta
```

> O seed só roda quando a tabela de usuários está vazia — deixar as variáveis no `.env` depois
> disso não recria um segundo admin, mas é boa prática não deixar uma senha em texto puro
> parada num arquivo de configuração. Troque a senha propriamente pelo app, em
> **Mais → Configurações**.

## 14. Importar a database do jogo

Logado como admin no app: **Mais → Databases do jogo** → toque nas versões que você joga
(ex.: FIFA 16 e FIFA 22) → **Importar**.

O servidor baixa o dataset público (SoFIFA via Kaggle) e popula o SQLite, com barra de
progresso — a primeira importação de cada versão leva alguns minutos (arquivo de centenas de
MB). Pode navegar para outras abas do app enquanto isso roda em segundo plano.

## 15. Criar os usuários

Em **Mais → Usuários → Criar usuário**: informe o e-mail e o papel (usuário ou admin). O app
mostra uma **senha temporária que aparece uma única vez na tela** — copie e entregue à pessoa.
No primeiro login dela, o app força a troca por uma senha definitiva.

## 16. Configurar a IA (cada usuário, no próprio aparelho)

Cada pessoa, em **Mais → Configurações**, cola a chave do provedor de IA que preferir
(Anthropic, OpenAI, Gemini ou OpenRouter). A chave fica **só no navegador dela** — nunca é
enviada para o servidor além do proxy stateless de cada chamada. Isso habilita:

- a tab **Captura** (ler dados de uma foto da tela do jogo);
- o **Conselheiro** (parecer/consulta sobre a carreira, no hub Elenco).

---

## Pronto

O app está no ar, com HTTPS, um admin, pelo menos uma database do jogo importada e pronto
para criar carreiras. Para o dia a dia daqui em diante (atualizar o código, fazer backup,
resolver problemas comuns), use o **[DEPLOY.md](DEPLOY.md)**.

### Checklist final de verificação

- [ ] `https://prancheta.seudominio.com` abre com cadeado válido.
- [ ] Login com o admin funciona.
- [ ] `ADMIN_EMAIL`/`ADMIN_PASSWORD` removidos do `server/.env` (Passo 13).
- [ ] Pelo menos uma versão do jogo importada (Passo 14).
- [ ] `pm2 startup` configurado — reinicie a VPS uma vez (`reboot`, como root) e confirme que
  o app volta sozinho (`pm2 status` depois de reconectar).
- [ ] Backup configurado (ver a seção "Backup" em [DEPLOY.md](DEPLOY.md) — vale fazer isso
  **antes** de convidar outros usuários).
