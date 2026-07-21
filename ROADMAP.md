# Roadmap — Prancheta

> Escrito em 2026-07-19, sobre a `v0.4.000`. Cronograma **indicativo**: este é um projeto
> pessoal tocado em rajadas, não um produto com time dedicado. As semanas abaixo são ordem e
> tamanho relativo, não compromisso de calendário. O que **não** é negociável é a **ordem** —
> ela existe por dependência técnica e de risco, explicada em cada bloco.
>
> Fonte dos itens: [`STATUS.md §5`](STATUS.md#5-sugestões-de-iterações-futuras).

## Como ler as versões (PrideVer)

O projeto usa [PrideVer](https://pridever.org) — `PROUD.DEFAULT.SHAME`:

| Bump | De → Para | Significado | Uso aqui |
|---|---|---|---|
| **SHAME** | `0.4.000` → `0.4.001` | consertando coisa embaraçosa demais para admitir | dívida técnica: código morto, promessa quebrada, CSP que nunca foi ligada |
| **DEFAULT** | `0.4.003` → `0.5.000` | release normal | marcos e funcionalidades |
| **PROUD** | `0.x.xxx` → `1.0.000` | release que é motivo de orgulho | reservado — ver [1.0.000](#o-que-seria-a-10000) |

Não é acidente que a limpeza de curto prazo seja toda **SHAME**: são coisas que já deveriam
estar feitas.

---

## Panorama

| Bloco | Versões | Itens (STATUS §5) | Semanas |
|---|---|---|---|
| **Curto prazo** — deixar o app pronto para ser posto à prova | `0.4.001` → `0.5.000` | 1–5 | 1–3 |
| **Médio prazo** — confiança antes de crescer | `0.5.00x` → `0.7.000` | 6–10 | 4–7 |
| **Longo prazo** — por gatilho, não por data | — | 11–14 | condicional |

---

## Curto prazo: `0.4.001` → `0.5.000`

**Objetivo**: sair de "funciona na minha máquina" para "está no ar e foi provado".
Detalhamento executável nos planos [`020`](plans/020-ci-minimo.md),
[`021`](plans/021-higiene-codigo-morto-e-sync-blobs.md),
[`022`](plans/022-csp-enforced.md) e [`023`](plans/023-deploy-real-e-validacao.md).

| Versão | Entrega | Item | Esforço | Risco |
|---|---|---|---|---|
| `0.4.001` | CI mínimo (`npm run verify` em push/PR, Node 20.12 + 22) | 4 | S | LOW |
| `0.4.002` | Higiene: código morto, comentários mentirosos, decisão do `sync_blobs` | 1, 3 | M | MED |
| `0.4.003` | CSP promovida de `reportOnly` para **enforced** | 2 | M | **HIGH** |
| **`0.5.000`** | **Primeiro deploy real + validação em produção** | 5 | L | MED |

### Por que nesta ordem

1. **CI primeiro** porque é a rede de proteção de tudo que vem depois. Fazer a limpeza e a CSP
   sem CI é trabalhar sem cinto de segurança.
2. **Higiene antes da CSP** para que o diff da CSP — que é o mais arriscado — tenha o mínimo
   de peças móveis em volta.
3. **CSP antes do deploy** porque a política precisa ir para produção já calibrada; ligar CSP
   num app que já tem usuários é pedir para derrubar a experiência de alguém.
4. **Deploy por último** porque é o único passo que valida os três anteriores de verdade.

### O que "posto à prova" significa concretamente

O `0.5.000` só fecha quando estes três buracos históricos forem tapados — nenhum deles jamais
foi exercido na vida do projeto:

- **O caminho de instalação** nunca foi rodado numa VPS real (só documentado).
- **A câmera** nunca funcionou de verdade (exige HTTPS; impossível testar em rede local).
- **Nenhuma chamada real de IA jamais aconteceu** — `advisor_reports` tem 0 linhas na base
  real, e os planos 012/017 registram que os smokes de IA foram pulados por falta de chave.
  Testes mockam, QA semeia dados falsos. O conselheiro nunca respondeu de verdade.

---

## Médio prazo: `0.5.00x` → `0.7.000`

**Princípio que organiza este bloco**: *confiança antes de expansão*. Cada item de
infraestrutura vem antes da funcionalidade que ele protege.

### Semana 4 — Auditoria (atividade, não release)

**Item 8 — nova auditoria `improve`/`deep`.**

As duas auditorias anteriores (2026-07-08 e 2026-07-14) aconteceram **antes** de contas, área
admin, conselheiro de IA e de toda a refatoração visual. Ou seja: `server/src/auth/`,
`server/src/ai/`, as rotas per-user e o shell do front **nunca passaram por auditoria formal**.

- **Por que agora**: com o `0.5.000` no ar, existe uso real para dar contexto — e ainda há
  poucos usuários, então corrigir é barato.
- **Por que antes das features**: os achados devem moldar o que vem depois, não virar retrabalho.
- **Saída**: planos numerados a partir de `024`, priorizados. Correções críticas viram
  `0.5.001`, `0.5.002` (SHAME) conforme aparecerem.

> Auditoria não é release. Se ela não achar nada relevante — ótimo, custou pouco. Se achar,
> era exatamente o ponto.

### Semana 5 — `0.6.000`: guard-rails e QA automatizado

| Item | Entrega |
|---|---|
| **9** | Guard-rails de custo do BYOK |
| **10** | Roteiro Playwright (`screenshots/tests/`) rodando em CI |

**Item 9 — guard-rails de custo.** Cada chamada ao conselheiro ou à captura gasta dinheiro
real do usuário. Hoje não existe **nenhum** limite, contador ou aviso. Escopo mínimo:

- contador de chamadas por carreira/período, visível na UI;
- limite configurável pelo próprio usuário ("me avise/bloqueie acima de N por dia");
- registro do custo estimado por chamada, se o provedor devolver `usage`.

O plano `023` (Step 3.2) vai medir o custo real de um parecer — esse número define se o limite
padrão é generoso ou apertado.

**Item 10 — QA visual em CI.** Estender o CI do `020` para rodar o roteiro E2E contra base
isolada. Começa **não-bloqueante** (informativo), vira gate depois de provar estabilidade.

**Por que os dois antes do item 6/7**: expandir a superfície de IA sem guard-rail de custo é
irresponsável com o bolso do usuário; e mexer no hub sem QA automatizado é apostar que ninguém
esqueceu de rodar o roteiro manual.

### Semanas 6–7 — `0.7.000`: Conselheiro completo

| Item | Entrega |
|---|---|
| **6** | Parecer individual de prospecto ("vale a pena contratar?") |
| **7** | Plano de temporada e parecer de janela de transferências |

Ambos já estão desenhados em [`design-proposals/blueprint.md`](design-proposals/blueprint.md)
como explicitamente **fora de escopo da v0.4.000** — não são features novas inventadas agora,
são a continuação planejada.

Reaproveitam quase toda a infraestrutura existente (`server/src/ai/advisor.ts`,
`ai/providers.ts`, tabela `advisor_reports`); o trabalho real é de **prompt e contexto**: o
que exatamente enviar para cada tipo de parecer, e como apresentar a resposta.

- **Item 6** entra na tab Scout (na ficha do prospecto da shortlist).
- **Item 7** entra no hub, ao lado do parecer geral.

> Depois do `0.7.000`, o conselheiro cobre as quatro perguntas que um técnico de verdade faz:
> *como está meu elenco?*, *vale a pena este jogador?*, *o que faço nesta temporada?* e
> *o que faço nesta janela?*

---

## Longo prazo: por gatilho, não por data

Estes quatro itens **não entram em cronograma**. Cada um resolve um problema que o projeto
**ainda não tem** — e construir para problema hipotético é a forma mais cara de errar. Cada um
tem um gatilho objetivo: enquanto ele não acontecer, o item fica dormindo aqui.

| Item | O que é | Gatilho para começar | Custo estimado |
|---|---|---|---|
| **11** | Migrar para a API oficial do SoFIFA | **Aprovação como parceiro** pela SoFIFA. O client já existe pronto em `server/src/sofifa/sofifa-api.ts` — sem aprovação, não há o que fazer. | M — o client existe; é trocar a fonte e reconciliar schema |
| **12** | Modo offline real | Você (ou um usuário) **efetivamente se irritar** com a falta. Hoje o app assume rede quando logado; ninguém reclamou porque quase ninguém usou. | **L** — exige repensar a camada de dados no cliente (cache local + sincronização) |
| **13** | Multiplayer / carreira compartilhada | **Uma segunda pessoa real** querer usar de forma compartilhada. Hoje: 2 usuários, 1 carreira, zero sinal de demanda. | **L** — exige modelo de permissões que não existe |
| **14** | Internacionalização | **Um usuário não-lusófono** pedir. Hoje: zero. | M — mecânico, mas invasivo (toda string do app) |

### Sobre o item 12 (offline), especificamente

É o mais tentador de fazer "porque seria legal" e o mais caro de todos. Antes de começar,
**meça**: em uso real, quantas vezes o app falhou por falta de rede? Se a resposta for "nenhuma"
ou "uma vez no ônibus", a solução certa é uma mensagem de erro melhor, não uma arquitetura
offline-first.

### Sobre o item 13 (multiplayer)

Note que ele muda a natureza do produto: hoje o Prancheta é um caderno pessoal. Uma carreira
compartilhada implica permissões, conflito de edição e provavelmente notificações. Não é uma
feature — é um produto diferente. Vale uma conversa de escopo antes de qualquer linha de código.

---

## O que seria a `1.0.000`

O bump **PROUD** é o único que ainda não tem dono neste roadmap, e isso é de propósito: ele não
se conquista com uma feature específica, e sim quando as três coisas abaixo forem verdade ao
mesmo tempo:

1. **Está em uso real e continuado** — não "instalado", mas aberto durante partidas, temporada
   após temporada.
2. **O conselheiro presta** — os pareceres mudaram decisões de verdade dentro do jogo, e não
   são só texto bonito.
3. **Não dá medo mexer** — CI verde, QA automatizado, backup testado, auditoria em dia.

O bloco de curto prazo entrega o item 3. O de médio prazo entrega o 2. O item 1 só o tempo (e
o uso) entregam.

---

## Resumo em uma tela

```
AGORA ─────────────────────────────────────────────────────────────────────▶

  0.4.001   0.4.002   0.4.003        0.5.000          0.6.000      0.7.000
    CI    → higiene → CSP enforced → DEPLOY REAL  →  guard-rails → conselheiro
                                     (posto à       + QA em CI     completo
                                      prova)        ↑
                                          ↑         auditoria improve/deep
                                          │         (semana 4, não-versionada)
                                   semanas 1-3       semanas 4-7

  LONGO PRAZO (por gatilho, sem data):
    11 API SoFIFA ······ gatilho: aprovação como parceiro
    12 offline ········· gatilho: incômodo real medido
    13 multiplayer ····· gatilho: segunda pessoa querendo compartilhar
    14 i18n ············ gatilho: usuário não-lusófono pedindo
```

---

## Manutenção deste documento

- Quando uma versão sair, mova a linha correspondente para o [`CHANGELOG.md`](CHANGELOG.md) e
  **apague daqui** — roadmap com item já entregue vira ruído.
- Quando um gatilho de longo prazo disparar, o item vira plano numerado em `plans/` e ganha
  versão no cronograma.
- Se um item ficar aqui por muito tempo sem gatilho, considere **removê-lo**: uma ideia que
  ninguém sente falta há meses provavelmente não era necessária.
