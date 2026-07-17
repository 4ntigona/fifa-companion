# Teste end-to-end — contas + admin (v0.3.000)

Roteiro de teste manual do fluxo completo de contas/admin, com os 32 prints em
`screenshots/tests/NN-nome.png` como referência de "como deveria ficar" em cada passo.
Gerados de forma automatizada (Playwright) em 17/07/2026 contra a branch `feat/accounts`,
**numa base de dados isolada** (cópia da produção com usuários/carreiras zerados, dados do
jogo preservados) — a base real (`server/data/companion.db`) não foi tocada em nenhum momento.

Se você quiser repetir este roteiro manualmente contra o seu ambiente de dev, siga os passos
abaixo na ordem. Cada passo referencia o print correspondente.

## Preparação

1. `npm run dev:server` e `npm run dev:web` (ou os dois juntos, se tiver um script combinado).
2. Confirme que existe pelo menos um admin. Se for a primeira vez (banco vazio), defina
   `ADMIN_EMAIL` e `ADMIN_PASSWORD` no `server/.env` antes de subir o servidor — o primeiro
   admin é semeado automaticamente no boot quando a tabela `users` está vazia.
3. Se **não** quiser testar na sua base real, copie-a antes: veja "Testar sem sujar sua base
   real", no fim deste documento.

## Roteiro

### 1. Login como admin
- `01-login-vazio.png` — tela `/login` vazia.
- `02-login-preenchido.png` — e-mail/senha do admin preenchidos.
- `03-home-admin-logado.png` — Home após login: usuário admin vê o link **Admin** no header.

### 2. Admin › Databases
- `04-admin-databases.png` — `/admin/databases`: versões do jogo importadas (FIFA 16, FIFA 22
  no exemplo), botão de importar versões novas.

### 3. Admin › Usuários — criar uma conta
- `05-admin-usuarios-vazio.png` — `/admin/usuarios`, lista de usuários (só o admin existe).
- `06-admin-usuarios-form-preenchido.png` — formulário "Criar usuário" com e-mail preenchido,
  papel "usuário".
- `07-admin-usuarios-criado-com-senha-temp.png` — usuário criado; **a senha temporária aparece
  uma única vez na tela**, nunca mais é recuperável. Anote-a.

### 4. Logout do admin, login do novo usuário
- `08-apos-logout-admin.png` — de volta à tela de login.
- `09-forcado-trocar-senha.png` — login com a senha temporária força a tela "Defina sua senha"
  (não dá pra usar o resto do app até trocar).
- `10-nova-senha-preenchida.png` — nova senha definitiva preenchida (mín. 8 caracteres).
- `11-home-usuario-comum-vazia.png` — Home do usuário comum: **sem** o link "Admin" no header,
  nenhuma carreira ainda. Repare no banner "Tem dados no modelo antigo?" — é a migração
  do modelo local antigo (pré-contas), aparece pra quem tem uma chave de restauração salva.

### 5. Criar uma carreira
- `12-nova-carreira-form.png` — `/nova-carreira`, escolha de versão do jogo.
- `13-nova-carreira-versao-escolhida.png` — FIFA 16 selecionado.
- `14-nova-carreira-busca-time.png` — busca por "Barcelona" na lista de times reais.
- `15-nova-carreira-time-selecionado.png` — FC Barcelona selecionado.
- `16-carreira-criada-dashboard.png` — carreira criada; dashboard com stats do time e elenco
  completo carregado a partir da database real do jogo.

### 6. Elenco e adicionar jogador manual (base/regen)
- `17-carreira-elenco.png` — aba "Elenco" com os 30 jogadores reais do time.
- `18-carreira-base-regens-vazia.png` — aba "Base & Regens", vazia.
- `19-adicionar-jogador-form.png` — modal "+ Jogador" aberto (para jogadores que só existem
  no seu save — base, regens, clube criado).
- `20-adicionar-jogador-preenchido.png` — formulário preenchido (nome, posições, idade,
  overall/potencial originais, pontos fortes).
- `21-adicionar-jogador-salvo.png` — modal fechado após salvar.
- `22-carreira-base-regens-com-jogador.png` — aba "Base & Regens" agora mostra o jogador criado.

### 7. Prospecção (scouting) e shortlist
- `23-prospeccao-inicial.png` — `/carreira/:id/prospeccao`, tela de busca.
- `24-prospeccao-busca-messi.png` — busca por "Messi" retorna jogadores reais da database.
- `25-prospeccao-adicionado-shortlist.png` — clique em "+ Shortlist" no primeiro resultado.
- `26-prospeccao-aba-shortlist.png` — aba "Shortlist (1)" mostra o jogador salvo, com os
  controles de prioridade/status/negociação.

### 8. Perfil de jogador
- `27-pagina-jogador.png` — `/jogador/:id`, atributos originais da database, área de
  "Desenvolvimento" (snapshots de evolução por temporada).

### 9. Captura de tela (câmera/IA)
- `28-captura-tela.png` — `/carreira/:id/captura`, tela de upload de foto. (O fluxo de IA em
  si não foi testado aqui — exige uma chave BYOK configurada em Configurações; ver nota abaixo.)

### 10. Configurações e tema
- `29-configuracoes.png` — `/config`: chaves de IA (BYOK), troca de senha. Note que a chave de
  restauração e o backup de arquivo **não aparecem mais** aqui — foram descontinuados com as
  contas reais.
- `30-configuracoes-tema-alternado.png` — alternância de tema (claro/escuro/auto) no header.

### 11. Logout e verificação de isolamento admin
- `31-logout-usuario-final.png` — logout do usuário comum, volta ao login.
- `32-usuario-comum-bloqueado-de-admin.png` — login de novo como o mesmo usuário comum e
  tentativa de acessar `/admin/usuarios` diretamente pela URL: **é redirecionado para a Home**,
  nunca vê a tela de admin. Confirma que o guard de role funciona tanto na UI quanto (segundo
  os testes automatizados do servidor) na API.

## O que este roteiro NÃO cobre

- Fluxo de análise de foto por IA de verdade (precisa de uma chave de provedor real — Anthropic/
  OpenAI/Gemini/OpenRouter — e consome créditos da API do provedor).
- Importação de uma database nova do zero (demora minutos, baixa ~centenas de MB do Kaggle).
- Migração de dados do modelo antigo (chave de restauração) para uma conta nova — o banner
  aparece na Home, mas testar de ponta a ponta exige ter uma chave de restauração válida de
  antes das contas.
- Ações administrativas de gerenciamento (desativar usuário, resetar senha, tornar admin,
  excluir usuário, derrubar sessões) — os botões existem em `/admin/usuarios` mas não foram
  exercidos neste roteiro; a suíte automatizada do servidor (`server/src/routes/admin-users.test.ts`)
  cobre essas regras (não pode remover o último admin, não pode se auto-rebaixar, etc.).

## Testar sem sujar sua base real

O jeito mais seguro de repetir este roteiro sem misturar contas/carreiras de teste com as suas
de verdade é rodar o servidor contra uma **cópia** do banco, com usuários e carreiras zerados
mas os dados do jogo preservados (evita ter que reimportar, que demora minutos):

```bash
# a partir da raiz do projeto, com o server de dev PARADO
cd server
mkdir -p data-qa/captures data-qa/kaggle
sqlite3 data/companion.db ".backup 'data-qa/companion.db'"   # cópia consistente (via WAL)
sqlite3 data-qa/companion.db "
  DELETE FROM sessions; DELETE FROM captures; DELETE FROM player_snapshots;
  DELETE FROM prospects; DELETE FROM career_players; DELETE FROM careers;
  DELETE FROM users; DELETE FROM sync_blobs; DELETE FROM server_backups;
  DELETE FROM import_jobs; VACUUM;
"

# sobe o servidor apontando pra cópia, com um admin de teste semeado no boot
DATA_DIR="$(pwd)/data-qa" PORT=3344 HOST=127.0.0.1 \
  ADMIN_EMAIL="qa-admin@teste.local" ADMIN_PASSWORD="SuaSenhaDeTeste" \
  npx tsx src/index.ts
```

Em outro terminal, `npm run dev:web` continua normal — o Vite já faz proxy de `/api` para
`localhost:3344`, então ele fala com o servidor de teste sem nenhuma mudança.

Ao terminar, `Ctrl+C` no servidor de teste e `rm -rf server/data-qa`. Sua base real nunca foi
aberta em modo de escrita durante o teste.
