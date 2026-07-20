# Roteiro de teste E2E — Prancheta v0.4.000

Os 29 prints desta pasta são a referência visual da v0.4.000 (identidade **Goleiro 92**,
shell de tabs, conselheiro de IA). Foram gerados por Playwright a 390×844 (mobile) contra
uma **base isolada** — a base real (`server/data/companion.db`) nunca foi aberta em escrita.

Para repetir o roteiro manualmente, siga os passos abaixo; cada um cita o print correspondente.

## Preparação

1. `npm run dev:server` e `npm run dev:web`.
2. Se for a primeira vez (banco vazio), defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` no
   `server/.env` antes de subir o servidor — o primeiro admin é semeado no boot.
3. Para não misturar com seus dados reais, use a base isolada (ver o fim deste documento).

## Roteiro

### 1. Login — a primeira impressão da identidade
- `01-login-claro.png` / `02-login-escuro.png` — wordmark **PRANCHETA!**, faixa geométrica
  coroando o card, formulário centralizado. Fora do shell (sem tab bar).

### 2. Admin: preparar o acesso do técnico
- `03-mais-admin.png` — tab **Mais** com a seção Administração visível (só para admin).
- `04-admin-databases.png` — versões do jogo importadas (verde) e disponíveis para importar.
- `05-admin-usuarios.png` — lista de contas.
- `06-admin-usuario-criado-senha-temp.png` — usuário criado: **a senha temporária aparece
  uma única vez**. Anote-a; não há como recuperá-la depois.

### 3. Primeiro login do técnico
- `07-troca-de-senha-obrigatoria.png` — entrar com a senha temporária força a tela
  "Defina sua senha" (bloqueante, fora do shell).
- `08-home-sem-carreira.png` — sem carreira, a Home é o seletor enxuto; as tabs de jogo
  (Elenco/Scout/Captura) ficam esmaecidas e desabilitadas.

### 4. Criar a carreira
- `09-nova-carreira.png` — escolha da versão do jogo.
- `10-nova-carreira-busca-time.png` — busca do time real na database importada.

### 5. O hub de desenvolvimento (a tela central do produto)
- `11-hub-elenco-claro.png` / `12-hub-elenco-escuro.png` — a ordem do blueprint:
  contexto do save → **objetivos da diretoria** (marcáveis) → **conselheiro** →
  **radar de desenvolvimento** (quem cresceu desde a última captura, com a pílula rosa) →
  elenco com números de camisa.
- `13-conselheiro-historico.png` — histórico aberto: consultas anteriores com a pergunta
  em itálico e suas orientações.
- `14-hub-base-regens.png` — aba Base & Regens.
- `15-hub-filtro-rapido.png` — filtro por nome/posição (aqui: `CB`).
- `16-hub-adicionar-jogador.png` — modal de jogador manual (base/regen/gerado), para os
  que só existem no seu save.

### 6. Ficha do jogador
- `17-jogador-claro.png` / `18-jogador-escuro.png` — número de camisa como marca d'água,
  OVR/POT com a pílula de crescimento, atributos, **gráfico de evolução** (roxo = overall,
  rosa tracejado = potencial) e o histórico de snapshots.
- `19-jogador-registrar-evolucao.png` — modal de registro, sempre atrelado a temporada/data.

### 7. Scout
- `20-scout-inicial.png` — busca vazia.
- `21-scout-busca.png` — resultados com badge de posição, margem OVR→POT e "+ Lista".
- `22-scout-filtros.png` — filtros colapsados abertos (com contagem de ativos).
- `23-scout-shortlist-claro.png` / `24-scout-shortlist-escuro.png` — shortlist com
  prioridade, status, notas e comparação.

### 8. Captura
- `25-captura.png` — foto da tela do jogo → IA extrai → você revisa antes de salvar.
  (O fluxo completo da IA exige uma chave BYOK real — ver "O que não é coberto".)

### 9. Mais e Configurações
- `26-mais-usuario-claro.png` / `27-mais-usuario-escuro.png` — hub do usuário comum:
  carreiras, conta, tema. **Sem** a seção Administração.
- `28-configuracoes.png` — chaves de IA (BYOK, só neste aparelho) e troca de senha.

### 10. Isolamento de permissão
- `29-usuario-comum-bloqueado-no-admin.png` — acessar `/admin/usuarios` pela URL como
  usuário comum redireciona para a Home. O servidor também barra por conta própria
  (ver `server/src/routes/admin-users.test.ts`).

## O que este roteiro NÃO cobre

- **Chamada real de IA** (captura de foto e conselheiro): exige chave BYOK de um provedor
  e consome créditos. Nos prints, o conselheiro está semeado com pareceres de exemplo e a
  captura mostra só a tela inicial. A lógica é coberta por testes com provedor mockado
  (`server/src/routes/advisor.test.ts`).
- **Importar uma database do zero**: baixa centenas de MB do Kaggle e leva minutos.
- **Migração do modelo antigo** (chave de restauração): o banner aparece na Home, mas
  testar ponta a ponta exige uma chave válida de antes das contas.
- **Ações administrativas de gestão** (desativar, resetar senha, promover, excluir,
  derrubar sessões): os botões estão em `/admin/usuarios`; as regras (não remover o
  último admin, não se auto-rebaixar) são cobertas por testes automatizados.

## Acessibilidade (auditada na v0.4.000)

- Contraste **AA em todos os pares de token nos dois temas** (o mais apertado: `error`
  sobre superfície clara, 4.71).
- Alvos de toque da tab bar: **98×62px** (mínimo AA é 44×44).
- Foco visível: contorno de 2px na cor primária em todo elemento focável.
- `prefers-reduced-motion`: transições zeradas.

## Testar sem sujar sua base real

```bash
# a partir da raiz do projeto, com o servidor de dev PARADO
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
  ADMIN_EMAIL='admin@prancheta.local' ADMIN_PASSWORD='SuaSenhaDeTeste' \
  npx tsx src/index.ts
```

Em outro terminal, `npm run dev:web` — o Vite já faz proxy de `/api` para `localhost:3344`.

Ao terminar: `Ctrl+C` no servidor e `rm -rf server/data-qa`.

> Dica: evite `!` na senha de teste — dependendo do shell ele vira expansão de histórico e
> o seed acaba com uma senha diferente da que você digitou.
