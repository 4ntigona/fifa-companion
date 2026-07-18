# Prancheta — Design System

> Identidade "Goleiro 92" (direção 3 da concepção v0.4.000, aprovada em 18/07/2026).
> Substitui integralmente o sistema anterior (PEDRO \ RIVERA / terminal). Referências da
> concepção: `design-proposals/direcao-3/` (identidade.html + telas.html + png/).

## Missão

O Prancheta é o companheiro de sofá do jogador de modo carreira do FIFA/EA FC: memória e
planejamento de longo prazo do save, focado em **desenvolvimento do time**, com IA
conselheira sob demanda. Mobile-first (o celular na mão, o jogo na TV), PT-BR, PWA.

## A identidade em uma frase

A energia gráfica das camisas de goleiro do início dos anos 90 — geometria ousada e cor sem
pedir desculpa — com disciplina de produto: **os padrões vivem só no topo e nas molduras; o
corpo é limpo, denso e legível**.

## Tokens de cor (semânticos — sempre via token, nunca hex solto)

| Token | Claro | Escuro | Papel |
|---|---|---|---|
| `canvas` | `#f2f1f7` | `#171034` | fundo do app (nunca branco/preto puros) |
| `surface` | `#ffffff` | `#201849` | cards e superfícies |
| `surface-soft` | `#f8f7fb` | `#1b1440` | superfícies rebaixadas |
| `hairline` / `-soft` / `-strong` | `#d9d5e6` / `#e7e4f0` / `#b4aed0` | `#322a5e` / `#281f52` / `#453c7a` | bordas e divisores |
| `ink` | `#241b45` | `#efedfa` | texto principal (roxo-tinta) |
| `charcoal` → `faint` | escala roxo-cinza | escala lilás | hierarquia de texto |
| `primary` | `#5230c9` | `#8b68ff` | AÇÃO (roxo royal); texto sobre ele = `primary-ink` |
| `primary-ink` | `#ffffff` | `#14092e` | texto sobre primary |
| `pink` (`tint-rose` como wash) | `#f43f7f` | `#ff5c93` | DESTAQUE — exclusivo do crescimento (OVR→POT) |
| `yellow` | `#ffd23e` | `#ffd23e` | SÓ no padrão geométrico; nunca toca texto |
| `success` / `warning` / `error` | `#177a4c` / `#9a6a00` / `#d13b52` | `#45d68c` / `#f5b04a` / `#ff6f85` | estados |

Regra de ouro da cor: **o rosa-choque é gasto num lugar só** — o dado de crescimento (a
margem OVR→POT, os "+N"). O amarelo existe apenas dentro do padrão geométrico. Todo o resto
da energia vem do roxo.

## Tipografia

- **Display**: `Anybody` (Google Fonts, variável) — peso 850–900, largura ~112–122
  (`font-variation-settings: 'wdth' 116`), caixa alta, itálico no wordmark. Títulos de
  seção, números de camisa, wordmark. Usada com moderação: é a voz, não o corpo.
- **Corpo**: `Chivo` 400/500/700 — grotesk latina sólida; aguenta densidade de dados.
- **Números**: `Chivo Mono` 400/600, `tabular-nums` sempre (colunas não dançam).
- Wordmark: `PRANCHETA!` — Anybody 900 itálico, "!" em rosa.

## Assinatura — o número de camisa

Cards de jogador e de carreira carregam o número gigante como marca d'água (Anybody 900,
wdth 85–90, opacidade 10–12%, cor primary). O elenco é um vestiário de mantos pendurados.
Elementos de apoio: a **faixa de padrão geométrico** (triângulos roxo/rosa/amarelo sobre
tinta, 10px de altura) no topo das telas; posições/números como âncora tipográfica das linhas.

## Forma

- Raio: cards **14px**, controles e chips **pílula cheia** (999px), inputs 12px. O raio zero
  do sistema anterior está morto.
- Sombra: mínima — profundidade vem de contraste e hairline, não de blur. Padrão:
  `0 1px 3px rgba(36,27,69,.18)` só em elementos "levantados" (segmented ativo).
- Densidade: linhas de lista com 10–11px de padding vertical; toque ≥44px.

## Movimento

- Entrada "em chute": translateY curto com overshoot de 4px, 180ms. Pressed: scale(0.97),
  120ms. Transições de cor 200ms.
- `prefers-reduced-motion: reduce`: sem overshoot, sem scale — troca seca. Obrigatório.

## Tom de voz

O locutor dos anos 90 — vivo, direto, sem ironia forçada. PT-BR, sentence case (caixa alta
só em display), verbos ativos ("Analisar carreira", não "Análise"). Erros dizem o que
aconteceu e como resolver; telas vazias convidam à ação.

## Componentes — estados obrigatórios

Todo componente interativo define: default, hover, focus-visible (outline 2px primary,
offset 2px), active/pressed, disabled, loading, error. Sem exceção.

- `.card` — surface, hairline, raio 14px.
- `.btn-primary` — pílula primary/primary-ink; hover escurece; disabled hairline+faint.
- `.btn-secondary` — pílula com borda hairline-strong, texto ink.
- `.btn-dark` — pílula ink/canvas (CTA alternativo).
- `.pill-tab` / `.pill-tab-active` — chips de filtro; ativa = ink invertido.
- `.input` — raio 12px, foco primary (borda + ring).
- `.tag-*` — etiquetas com wash (lavender=seleção/roxo, rose=crescimento, mint=ok, peach=alerta).
- `.growpill` — a pílula rosa do crescimento (`73 → 76`), Chivo Mono.
- `.patternband` — a faixa geométrica da marca (topo de tela/hero apenas).
- `.shirtno` — número de camisa (Anybody 900) em linhas de lista.
- `.watermark-no` — número gigante de fundo em cards.

## Acessibilidade (WCAG 2.2 AA)

- Contraste AA nos dois temas (verificar primary sobre surface, pink sobre wash).
- Foco visível sempre; navegação por teclado em tudo.
- Alvos de toque ≥44×44px na tab bar e controles primários.
- Reduced-motion respeitado em toda animação.

## Anti-padrões (proibido)

- Hex solto em componente (sempre token).
- Amarelo em texto ou fundo de texto; rosa fora do dado de crescimento.
- Padrão geométrico atrás de conteúdo legível.
- Gradiente decorativo, glassmorphism, sombra profunda.
- Raio zero ou raio gigante fora da escala (14/12/999).
- Emoji como ícone de UI (usar SVG inline).

## PWA / marca aplicada

- Nome: **Prancheta** (`short_name: Prancheta`); title "Prancheta — companheiro de modo carreira".
- `theme_color: #241b45`, `background_color: #f2f1f7`; ícones 192/512 com o "P!" sobre roxo
  e a faixa geométrica (`web/public/icon-*.png`).

## QA checklist (por tela migrada)

- [ ] Ambos os temas, 375px, sem scroll horizontal.
- [ ] Números em Chivo Mono tabular; display só em títulos.
- [ ] Rosa apenas em crescimento; amarelo apenas em padrão.
- [ ] Estados de foco/disabled/loading presentes.
- [ ] Reduced-motion sem animação.
- [ ] Nada do sistema antigo: grep `#ff0033`, `IBM Plex`, `PEDRO` = zero.
