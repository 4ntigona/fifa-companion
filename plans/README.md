# Implementation Plans

Gerado pelo skill improve em 2026-07-07 (invocação: `plan` — melhorar a UX do app), contra o
commit `bdd5c7e`. Cada executor: leia o plano inteiro antes de começar, honre as STOP conditions
e atualize sua linha ao terminar.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001  | Feedback e interação confiáveis (erros amigáveis, debounce, "carregar mais", diálogos acessíveis, retry na captura) | P1 | M | — | DONE (implementado direto na árvore `claude` após o fluxo de worktree isolado se mostrar inviável neste ambiente — 2 dispatches receberam base defasada. tsc + vite build OK; 0 confirm() restantes; verificado no navegador: paginação +50, diálogo acessível com Escape/foco, exclusão em cascata, carreira-não-encontrada, card de erro de rede + retry.) |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (com motivo) | REJECTED (com justificativa)

## Dependency notes

- Nenhuma dependência entre planos (plano único).
- Os steps do 001 são independentes entre si na ordem dada; o step 6 depende do step 2
  (hook `useEscapeClose`) e o step 7 também.

## Findings considered and rejected / deferred

- **Bottom-nav fixa no mobile**: adiada — mexe no layout de todas as telas e é uma decisão de
  design (DESIGN.md registra densidade de navegação atual: 2 itens); reavaliar depois do 001.
- **Sistema de toasts global**: rejeitado por ora — as mensagens inline (`{ ok, text }` no padrão
  de `Settings.tsx`) cobrem os fluxos atuais sem dependência nova.
- **Instalar test runner (vitest)**: fora do escopo de UX; vale um plano próprio de qualidade se
  o projeto continuar crescendo.
- **Virtualização de listas / paginação por cursor no servidor**: desnecessário com o teto atual
  de 200 resultados por busca.
- **Focus-trap completo nos modais**: parcial de propósito (Escape + foco inicial + aria);
  suficiente para o tamanho do app — anotado como manutenção no plano 001.
