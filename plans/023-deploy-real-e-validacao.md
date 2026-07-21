# Plan 023: Primeiro deploy real e validação em produção → `0.5.000`

> **Executor instructions**: Este plano é diferente dos outros — a maior parte acontece
> **numa VPS real**, não no repositório. Documente cada desvio; o resultado esperado inclui
> correções em `INSTALL.md`/`DEPLOY.md` além de eventuais correções de código.
>
> **Drift check**: `git log --oneline 9dffa82..HEAD` — os planos 020, 021 e 022 devem estar
> concluídos antes deste. Se não estiverem, reporte e pare.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED — o risco não é quebrar o código, é **descobrir** que algo nunca funcionou
- **Depends on**: 020, 021, 022
- **Category**: operações / validação
- **Planned at**: commit `9dffa82`, 2026-07-19
- **Release alvo**: **`0.5.000`** — o marco "o app foi posto à prova"

## Why this matters

Este é o plano que fecha a jornada 0.4.001 → 0.5.000. Até aqui, **nada do Prancheta jamais
rodou em produção de verdade** ([STATUS.md §3.3](../STATUS.md#33--qualidade-de-processo-nunca-existiu-não-é-regressão)).
Tudo foi validado em sandbox local. Isso significa que três classes de coisa nunca foram
provadas:

1. **O caminho de instalação inteiro** — `INSTALL.md` e `DEPLOY.md` foram escritos com cuidado
   e revisados contra o código, mas nunca executados numa VPS de verdade.
2. **A câmera** — `getUserMedia`/`input capture` **exige HTTPS**. É literalmente impossível
   testar isso em `localhost` via IP de rede local. A tab Captura nunca foi exercida no
   cenário real de uso (celular, foto da TV).
3. **As chamadas de IA de verdade** — e isto é o mais grave: a tabela `advisor_reports` na base
   real está com **0 linhas**, e o histórico dos planos 012 e 017 registra explicitamente que
   os smokes manuais de IA foram pulados por falta de chave. Os testes automatizados **mockam**
   o provedor; o QA visual **semeia** pareceres falsos. Ou seja: **nenhuma chamada real a um
   provedor de IA jamais foi feita por este projeto**, em nenhum momento da sua história.

"Pronto para ser posto à prova" significa fechar esses três buracos.

## Current state — fatos da base real (verificados em `9dffa82`)

| Item | Valor |
|---|---|
| Tamanho do `companion.db` | **384 MB** |
| Versões do jogo importadas | **10** (FIFA 15 → FC 24), 180.021 jogadores |
| Usuários | 2 |
| Carreiras | 1 (FC Barcelona, 30 jogadores) |
| `advisor_reports` | **0** ← o conselheiro nunca rodou de verdade |

O tamanho de 384 MB importa para o planejamento de backup e para o dimensionamento do disco
da VPS (o `INSTALL.md` recomenda 40 GB, folgado — mas confirme se o provedor entrega isso).

## Steps

### Step 1 — Executar o `INSTALL.md` à risca, cronometrando e anotando

Provisione uma VPS Debian 12 nova e siga [`INSTALL.md`](../INSTALL.md) **literalmente**, do
Passo 0 ao 16, sem improvisar. Para cada passo, registre:

- ✅ funcionou como documentado, ou
- ⚠️ funcionou mas o texto estava impreciso/ambíguo (anote a correção), ou
- ❌ não funcionou (anote o erro exato e o que resolveu).

Pontos onde a documentação tem maior chance de estar errada (atenção redobrada):

- **Passo 2 (swap)**: confirme se a VPS escolhida realmente precisa. Anote a RAM real.
- **Passo 4 (instalador do CloudPanel)**: a URL/fluxo pode ter mudado desde a escrita.
- **Passo 7 (`build-essential python3`)**: confirme se era mesmo necessário ou se o
  `better-sqlite3` baixou binário pré-compilado (muda a recomendação).
- **Passo 9 (`npm run build`)**: cronometre e observe o pico de memória (`free -h` durante).
  Com 384 MB de banco e o bundle do web, é o passo mais pesado.
- **Passo 11 (`pm2 startup`)**: o comando com `sudo` que ele imprime precisa ser rodado pelo
  usuário do site com permissão de sudo — confirme se o usuário criado pelo CloudPanel tem.

**Entregável deste step**: uma lista de correções para `INSTALL.md`, aplicada no fim (Step 6).

### Step 2 — Importar a database e medir

Importe **pelo menos duas versões** pela UI (Mais → Databases do jogo). Registre:

- tempo total por versão;
- se o servidor continuou responsivo durante a importação (o import roda no mesmo processo —
  o plano 004 já registrou isso como risco aceito; agora dá para medir de verdade);
- uso de memória no pico (`pm2 monit` ou `free -h`).

> Se o servidor ficar **inutilizável** durante a importação, isso reabre o item "import em
> worker_thread" que foi conscientemente adiado em `plans/README.md`. Registre o dado, não
> resolva agora.

### Step 3 — Validar o que só existe em produção

Este é o coração do plano. Cada item abaixo **nunca foi verificado** antes.

#### 3.1 — Câmera e PWA no celular real

- [ ] Instalar o PWA no celular ("Adicionar à Tela de Início") — confirmar ícone, nome
      ("Prancheta") e cor de tema corretos.
- [ ] Abrir a tab **Captura** e **tirar uma foto de verdade da tela da TV** com o jogo rodando.
- [ ] Confirmar que a foto é aceita e que o preview aparece.
- [ ] Testar em **modo escuro e claro**, e com o celular em orientação retrato.

#### 3.2 — Chamada de IA real (o buraco histórico)

Configure uma chave BYOK real (Mais → Configurações) — custo esperado: centavos.

- [ ] **Testar chave**: botão "Testar chave" → deve confirmar validade.
- [ ] **Captura → IA**: enviar a foto do 3.1 e verificar se a extração faz sentido
      (nomes/overalls plausíveis, nada inventado). Revisar e **aplicar** os dados.
- [ ] **Conselheiro → parecer**: no hub, "Analisar carreira". Verificar se a resposta:
      cita jogadores reais do elenco, respeita os objetivos cadastrados, e volta no formato
      estruturado (resumo + orientações priorizadas).
- [ ] **Conselheiro → consulta**: fazer uma pergunta livre e confirmar que ela aparece no
      histórico com a pergunta em itálico.
- [ ] Confirmar no banco que nada além da resposta foi persistido:
      ```bash
      sqlite3 server/data/companion.db "SELECT id,kind,provider,model,length(response_json) FROM advisor_reports;"
      # e a invariante mais importante:
      sqlite3 server/data/companion.db "SELECT response_json FROM advisor_reports;" | grep -i "sk-ant\|sk-\|AIza" && echo "❌ VAZOU CHAVE" || echo "✅ nenhuma chave persistida"
      ```
- [ ] Repetir com **pelo menos um segundo provedor** (ex.: OpenAI ou Gemini) — o encanamento
      genérico de `server/src/ai/providers.ts` nunca foi exercido fora do Anthropic.

> **Se a resposta da IA vier fora do formato esperado** (o `extractJson` falhar), registre o
> texto bruto retornado. Isso é informação de produto valiosa: pode significar que o prompt
> precisa ser mais rígido, ou que aquele modelo específico não serve.

#### 3.3 — Backup **e restauração** (drill completo)

Fazer backup é metade do trabalho; ninguém sabe se um backup presta até restaurá-lo.

- [ ] Criar o backup conforme `DEPLOY.md`:
      ```bash
      sqlite3 ~/htdocs/SEU-DOMINIO/server/data/companion.db \
        ".backup '$HOME/backups/prancheta-$(date +%F).db'"
      ```
- [ ] Medir tamanho e tempo (com 384 MB isso não é instantâneo).
- [ ] **Restaurar num diretório scratch** e provar que o arquivo abre e tem os dados:
      ```bash
      mkdir -p /tmp/restore-test
      cp ~/backups/prancheta-*.db /tmp/restore-test/companion.db
      sqlite3 /tmp/restore-test/companion.db "PRAGMA integrity_check;"          # deve dizer "ok"
      sqlite3 /tmp/restore-test/companion.db "SELECT COUNT(*) FROM users;"
      sqlite3 /tmp/restore-test/companion.db "SELECT COUNT(*) FROM sofifa_players;"
      DATA_DIR=/tmp/restore-test npx tsx server/src/index.ts   # sobe? Ctrl+C depois
      ```
- [ ] Configurar o cron diário do `DEPLOY.md` e **confirmar no dia seguinte** que o arquivo
      apareceu (um cron que nunca rodou não é backup).
- [ ] Verificar espaço em disco: backups diários de 384 MB enchem disco rápido. Definir
      retenção (ex.: manter 7 dias) e documentar.

#### 3.4 — Resiliência operacional

- [ ] **Reboot**: `sudo reboot` na VPS. Depois de voltar, confirmar que o app subiu sozinho
      (`pm2 status`) sem intervenção.
- [ ] **Crash**: `pm2 stop prancheta && pm2 start prancheta` — confirmar que volta limpo e
      que as migrations não reclamam.
- [ ] **Logs**: confirmar que `pm2 logs prancheta` mostra o esperado e instalar rotação
      (`pm2 install pm2-logrotate`), senão o disco enche com o tempo.

#### 3.5 — Segurança em produção

- [ ] `CORS_ORIGINS` definido: confirmar que uma chamada cross-origin é rejeitada.
      ```bash
      curl -s -I -H "Origin: https://exemplo-malicioso.com" https://SEU-DOMINIO/api/versions
      ```
- [ ] `ADMIN_EMAIL`/`ADMIN_PASSWORD` **removidos** do `.env` após o primeiro login (Passo 13
      do INSTALL) e app reiniciado.
- [ ] Confirmar que a porta 3344 **não** está exposta externamente:
      ```bash
      # de fora da VPS
      curl -m 5 http://IP-DA-VPS:3344/api/versions   # deve dar timeout/recusa
      ```
- [ ] CSP enforced (do plano 022) valendo em produção:
      ```bash
      curl -sI https://SEU-DOMINIO/ | grep -i content-security-policy
      ```
- [ ] Rate-limit do login funcionando: 11 tentativas erradas seguidas → a 11ª deve ser barrada.

#### 3.6 — Uso real, ponta a ponta

Criar uma carreira nova **do celular**, jogando de verdade:

- [ ] Criar carreira com time real.
- [ ] Registrar evolução de 2-3 jogadores ao longo de uma temporada.
- [ ] Usar o Scout para achar e adicionar 2 alvos à shortlist.
- [ ] Pedir um parecer ao Conselheiro **depois** de ter dados reais — e avaliar honestamente
      se a resposta foi **útil** (não só bem formatada).

### Step 4 — Corrigir o que aparecer

Tudo que os Steps 1-3 revelarem vira correção. Classifique cada achado:

| Tipo | Destino |
|---|---|
| Erro/imprecisão em `INSTALL.md`/`DEPLOY.md` | corrigir o doc (Step 6) |
| Bug de código pequeno e óbvio | corrigir neste plano, com teste |
| Bug de código grande ou de design | **não corrigir aqui** — abrir plano próprio e registrar no STATUS.md |
| Comportamento inesperado mas aceitável | documentar em `STATUS.md §3.5` (limitações aceitas) |

### Step 5 — Release `0.5.000`

Só depois de todos os checklists do Step 3 estarem verdes:

1. Bump `0.4.00N` → `0.5.000` nos três `package.json`.
2. Entrada no `CHANGELOG.md` descrevendo a jornada (CI, higiene, CSP, deploy real) e
   **listando explicitamente o que foi provado em produção pela primeira vez**.
3. Atualizar `STATUS.md`: mover os itens 1-5 resolvidos da seção 3 para o histórico da seção 1,
   e atualizar a tabela de maturidade (Deploy/operações deixa de ser "nunca exercido").
4. Tag `v0.5.000` e merge em `main`.

### Step 6 — Devolver o aprendizado para a documentação

Aplicar todas as correções de `INSTALL.md`/`DEPLOY.md` acumuladas. Acrescentar ao `INSTALL.md`
uma seção nova com os **dados reais medidos**: tempo de cada passo, RAM necessária de fato,
tempo de importação por versão, tamanho do backup. Isso transforma o documento de "teoria bem
escrita" em "relato verificado".

## Verification

O critério de saída deste plano — e da jornada 0.5.000 — é este checklist:

- [ ] App acessível em HTTPS com certificado válido.
- [ ] PWA instalado num celular real e funcionando.
- [ ] **Foto tirada da TV, processada por IA real, dados aplicados na carreira.**
- [ ] **Parecer do conselheiro gerado por IA real, com dados reais, e considerado útil.**
- [ ] Pelo menos **dois provedores de IA** exercitados.
- [ ] Nenhuma chave de IA encontrada no banco (grep do 3.2).
- [ ] Backup criado, **restaurado e verificado**; cron confirmado rodando.
- [ ] App sobrevive a reboot sem intervenção.
- [ ] Porta 3344 inacessível de fora; CORS e CSP valendo; rate-limit do login funcionando.
- [ ] `INSTALL.md`/`DEPLOY.md` atualizados com os desvios encontrados.
- [ ] `npm run verify` verde e CI verde.

## STOP conditions

- **Chave de IA aparecer no banco ou nos logs** → STOP imediato, é violação da invariante
  central do projeto. Trate como incidente: pare o app, rotacione a chave exposta, corrija,
  e só então continue.
- **`PRAGMA integrity_check` do backup restaurado não retornar `ok`** → STOP. Backup que não
  restaura não é backup; a estratégia inteira precisa ser revista antes de convidar usuários.
- **O import derrubar o servidor ou deixá-lo irresponsivo** → não force. Registre e reabra a
  discussão do import em worker thread.
- **Descobrir que a câmera não funciona no celular mesmo com HTTPS** → STOP e investigue a
  fundo antes de prosseguir: é uma funcionalidade central do produto e o motivo de todo o
  esforço de HTTPS.
- **Custo da IA surpreender** (ex.: um parecer custar muito mais que o esperado) → registre o
  número real. Isso é insumo direto para o item 9 do roadmap (guard-rails de custo), que passa
  a ser mais urgente do que se imaginava.

## Maintenance notes

- Guarde as medições reais (tempos, tamanhos, custo por chamada de IA) — elas alimentam tanto
  o `INSTALL.md` quanto as decisões de médio prazo no [`ROADMAP.md`](../ROADMAP.md).
- Se o deploy revelar que o app precisa de mais RAM do que o `INSTALL.md` sugere, corrija o
  documento **para cima**: é melhor recomendar folga do que alguém descobrir na hora.
- Depois deste plano, a próxima atividade recomendada é a **auditoria `improve`/`deep`**
  (item 8 do roadmap): o código de contas, IA e rotas per-user nunca passou por auditoria
  formal, e agora existe uso real para dar contexto.
