# Blueprint de experiência — v0.4.000

> Fase 0.3.001 (concepção). Este documento define a EXPERIÊNCIA proposta; as 5 direções
> visuais estão em `direcao-{1..5}/` (1 Quadro Tático · 2 Caderno do Olheiro · 3 Goleiro 92 ·
> 4 Placar de Flip · 5 Dossiê). Nada aqui vira código antes da aprovação do Pedro.

## 1. O que o produto é

**O companheiro de sofá do jogador de modo carreira.** O FIFA roda na TV; o celular está na
mão. O jogo já cuida de escalação, tática e partidas — o que ele NÃO faz bem é **memória e
planejamento de longo prazo**. É aí que o app vive:

| O jogo esquece | O app lembra |
|---|---|
| Como o elenco evoluiu temporada a temporada | Snapshots e gráficos de evolução por jogador |
| Quem você observava há 3 janelas | Shortlist com prioridade, status e notas |
| O que a diretoria cobrou no início do save | Objetivos da carreira, sempre visíveis |
| Quanto potencial ainda há na base | Base & regens com OVR/POT registrados |

**Princípio organizador: desenvolvimento do time.** Toda tela responde, direta ou
indiretamente, a uma pergunta: *"o que eu faço com este elenco para cumprir os objetivos?"*
A IA (BYOK, provedor à escolha) é a camada de conselho por cima desses dados — nunca a dona
deles.

Os 4 "jobs" do usuário, mapeados 1:1 nas tabs:

1. **Ver e desenvolver o elenco** → tab Elenco (o hub)
2. **Prospectar reforços** → tab Scout
3. **Registrar o estado do save** → tab Captura
4. **Todo o resto** (conta, config, admin, trocar de save) → tab Mais

## 2. Shell: tab bar + carreira ativa

- Tab bar fixa inferior: **Elenco · Scout · Captura · Mais** (mecânica da exploração C:
  carreira ativa lida da URL primeiro, persistida em `localStorage`, tabs de contexto
  desabilitadas sem carreira ativa).
- **A carreira ativa é o contexto do app.** Abrir o app = cair direto no hub da última
  carreira usada (não numa lista). Trocar de carreira é ação da tab Mais.
- Sem carreira ativa (conta nova): Elenco/Scout/Captura desabilitadas; o app conduz à
  criação da primeira carreira.
- Header enxuto: wordmark pequeno + clube/temporada da carreira ativa. Sem menu no topo —
  navegação mora toda na tab bar (polegar).
- **Login / troca forçada de senha**: fora do shell (sem tabs) — tela cheia, primeira
  impressão da identidade.
- **Admin** (databases/usuários): dentro do shell via Mais, com a moldura padrão; sem tab
  própria (é tarefa rara, de gestor, não de jogador).

## 3. Tab Elenco — o hub de desenvolvimento (reestruturação da Career.tsx)

Ordem vertical da tela (mobile, uma coluna):

1. **Contexto do save** (compacto): clube, versão, temporada (editável), verba, qualidade.
2. **Objetivos da diretoria** — promovidos a cidadãos de primeira classe (o dado já existe:
   `careers.objectives`). Lista com marcação de cumprido/pendente por temporada. É a régua
   contra a qual tudo se mede.
3. **Painel Conselheiro (IA)** — ver §5. Colapsado por padrão; mostra a última análise (com
   data) e o botão explícito "Analisar carreira".
4. **Radar de desenvolvimento** — o que mudou desde a última captura: quem subiu de OVR,
   quem estagnou, jovens perto do potencial, contratos/status marcados (emprestado/vendido).
   Derivado de `player_snapshots` — sem dado novo, só leitura melhor.
5. **Elenco** — lista atual (elenco/base & regens), com o filtro rápido por nome/posição
   (ideia aproveitada da exploração C) e as ações de sempre (+ jogador, excluir carreira).

O que hoje é a "banda navy" vira os itens 1–2; nada some, muda a hierarquia: objetivos e
evolução acima da lista bruta.

## 4. Demais tabs

- **Scout** (Prospects.tsx, reestruturação leve): busca com filtros colapsados + shortlist
  com prioridade/status/notas/comparação — fluxo mantido, hierarquia repensada para uma mão.
  Nota de euro (CurrencyNote) mantida.
- **Captura** (Capture.tsx, reskin): fluxo foto → IA → revisão → aplicar já é bom.
  Continua sendo o "coletor de dados" que alimenta todo o resto.
- **Mais**: trocar/criar carreira (lista atual da Home), Configurações (chaves BYOK + conta),
  Admin (só role admin), tema claro/escuro/auto, sair. A Home atual se dissolve aqui.

## 5. IA como conselheira (não como chat)

Regras de produto:

- **Gatilho sempre explícito.** BYOK = cada chamada custa dinheiro do usuário. Nada de
  análise automática, polling ou "sugestões proativas".
- **Formato: parecer estruturado, não conversa.** Uma análise = um documento datado.
- **Todo conselho cita os dados** (jogador X, snapshot Y, objetivo Z) — coerente com a
  invariante "o app nunca inventa dado": a IA opina, os fatos são do banco.

MVP (v0.4.000): **Parecer da carreira** no hub — botão "Analisar carreira" monta contexto
no servidor (objetivos + elenco com idades/OVR/POT/status + evolução por snapshots +
shortlist) e devolve orientações priorizadas: lacunas do elenco vs. objetivos, quem
desenvolver, quem vender/emprestar, alvos da shortlist que resolvem lacunas. Cache local
com carimbo "analisado em".

Pós-v0.4.000 (fica registrado, não entra agora): parecer individual de prospecto ("vale a
pena?"), plano de temporada (minutagem da base), parecer de janela de transferências.

## 6. Inventário: funcionalidade existente → onde mora no novo desenho

Checklist de regressão de todas as fases. **Nada é removido.**

| Hoje | No novo desenho |
|---|---|
| Home: lista de carreiras | Mais → Minhas carreiras (e Elenco cai direto na ativa) |
| Home: status Câmera/IA | Mais → Configurações (e aviso contextual na Captura) |
| Home: banner migração modelo antigo | Mais (banner, enquanto o legado existir) |
| NewCareer completo (versão/time/clube criado) | Mais → Nova carreira (fluxo próprio, fora das tabs) |
| Career: temporada editável | Elenco → Contexto do save |
| Career: stats do time + verba + CurrencyNote | Elenco → Contexto do save |
| Career: objetivos (clube criado) | Elenco → Objetivos da diretoria (promovidos) |
| Career: elenco/base tabs, + jogador, excluir | Elenco → seção Elenco |
| Prospects: busca/filtros/ordenação | Scout → Buscar |
| Prospects: shortlist (prioridade/status/notas) | Scout → Shortlist |
| Prospects: comparação de 2 | Scout → Shortlist → Comparar |
| Capture: foto→IA→revisão→aplicar | Captura (igual) |
| Player: perfil/atributos/snapshots/gráfico/status | Ficha do jogador (rota mantida, aberta do Elenco/Scout) |
| Settings: chaves BYOK por provedor + modelo | Mais → Configurações |
| Settings: troca de senha | Mais → Configurações |
| Login / troca forçada de senha | Iguais, fora do shell |
| Admin databases (importar versões) | Mais → Admin → Databases |
| Admin usuários (criar/desativar/resetar/excluir) | Mais → Admin → Usuários |
| Tema claro/escuro/auto | Mais (sai do header) |
| Deep links `/carreira/:id`, `/jogador/:id`… | Mantidos (rotas não mudam) |

## 7. Nome do produto

A identidade PEDRO\RIVERA sai; o nome pode ficar ou mudar. Três candidatos:

| Candidato | A favor | Contra |
|---|---|---|
| **Career Companion** (manter) | Já estabelecido; descritivo; zero custo de migração | Genérico; anglicismo num app PT-BR; não tem personalidade |
| **Prancheta** ⭐ recomendado | A prancheta do treinador: o objeto que TODO técnico segura à beira do campo; PT-BR; curto; ícone óbvio; nada de clichê tech | Exige um subtítulo ("companheiro de modo carreira") na loja/README |
| **Olheiro** | Forte, PT-BR, uma palavra | Cobre só o scout — o app é mais que prospecção |

Os mockups das 3 direções usam **Prancheta** como wordmark de trabalho; se o Pedro preferir
outro, é troca de string (o visual não depende do nome).

## 8. O que a v0.4.000 NÃO é

- Não remove nenhuma funcionalidade (inventário §6 é o contrato).
- Não muda rotas/API além do endpoint novo do conselheiro.
- Não vira chat com IA.
- Não adiciona dado inventado (taxas de câmbio, atributos estimados, etc.).
- Não persiste chave de IA no servidor. Nunca.
