# Plan 022: Promover a CSP de `reportOnly` para enforced

> **Executor instructions**: Siga passo a passo, rode cada verificação. STOP → pare e reporte.
> Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check (rode primeiro)**: `git diff --stat 9dffa82..HEAD -- server/src/index.ts web/index.html web/vite.config.ts`
> Se algum arquivo in-scope mudou desde `9dffa82`, **recalcule o hash do Step 1** — ele depende
> byte a byte do conteúdo do script inline.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: **HIGH** — uma CSP mal calibrada derruba o app em produção com tela branca. Toda a
  estratégia de verificação abaixo existe por causa disso.
- **Depends on**: 020 (CI) fortemente recomendado; 021 recomendado (menos peças móveis no diff)
- **Category**: segurança
- **Planned at**: commit `9dffa82`, 2026-07-19
- **Release alvo**: `0.4.003`

## Why this matters

A Content-Security-Policy está registrada desde o plano 004 (2026-07-08) em
**`reportOnly: true`** — modo em que ela *observa* violações e **não bloqueia nada**. O
comentário no código diz "por ora, para não quebrar o bundle Vite/PWA antes de calibrar".
Duas releases inteiras depois, a calibração nunca aconteceu
([STATUS.md §3.2](../STATUS.md#32--limpeza-planejada-e-ainda-não-feita)).

Na prática: o app tem hoje a **aparência** de proteção contra XSS/injeção de recurso, sem a
proteção em si. Ou a gente calibra e liga, ou assume que não tem CSP — o pior estado é o atual,
que engana quem lê o código.

## Current state (verificado em `9dffa82`)

### A configuração

`server/src/index.ts:31-45`:

```ts
await app.register(helmet, {
  contentSecurityPolicy: {
    reportOnly: true,                     // ← o alvo deste plano
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],              // ← vai bloquear o script inline (ver abaixo)
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
    },
  },
})
```

`@fastify/helmet` ^13.0.1.

### O que precisa ser calibrado — inventário verificado

| Recurso | Origem | Diretiva | Situação |
|---|---|---|---|
| **Script inline** de tema (anti-flash) em `web/index.html:15-24` | inline | `scriptSrc` | ❌ **seria bloqueado** — é o único problema real conhecido |
| Bundle JS do Vite | same-origin | `scriptSrc 'self'` | ✅ ok |
| Service worker (`registerSW.js`, `sw.js`, `workbox-*.js`) | same-origin | `scriptSrc`/`worker-src` | ⚠️ ver Step 2 |
| CSS do Google Fonts (`<link>` em `index.html:11`) | `fonts.googleapis.com` | `styleSrc` | ✅ já listado |
| Arquivos de fonte | `fonts.gstatic.com` | `fontSrc` | ✅ já listado |
| Tailwind v4 / estilos injetados | inline | `styleSrc 'unsafe-inline'` | ✅ já permitido |
| Preview de foto na Captura | `blob:` / `data:` | `imgSrc` | ✅ já listado |
| Chamadas de API (incl. IA) | same-origin (o servidor faz o proxy) | `connectSrc 'self'` | ✅ ok — o browser **nunca** fala direto com o provedor de IA |
| Ícones do PWA / manifest | same-origin | `defaultSrc 'self'` | ✅ ok |

**Insight que muda a estratégia de teste**: em desenvolvimento, o front é servido pelo **Vite
na 5173**, não pelo Fastify — o header de CSP do helmet **não chega no browser**. Ele só se
aplica quando o Fastify serve `web/dist` (produção). Consequência prática: **não dá para
validar este plano com `npm run dev:web`**. Tem que ser build de produção servido pelo
próprio servidor.

## Steps

### Step 1 — Liberar o script inline por hash

O script de tema em `web/index.html` roda antes do primeiro paint para evitar flash de tema
errado. Ele é estático, então a solução correta é um **hash** (não `'unsafe-inline'`, que
anularia o propósito da diretiva; e não um nonce, que exigiria gerar HTML dinamicamente).

Hash calculado sobre o conteúdo atual (371 bytes, entre `<script>` e `</script>`):

```
'sha256-pAapsw/mNkBCUgD9l4n4AuO9kQBXBPGW4BSW2W/So9I='
```

Para **recalcular** (obrigatório se o script mudar um único byte, inclusive espaços):

```bash
python3 - <<'PY'
import re, hashlib, base64, pathlib
html = pathlib.Path('web/index.html').read_text()
body = re.search(r'<script>(.*?)</script>', html, re.S).group(1)
print(f"'sha256-{base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()}'")
PY
```

Adicione o hash ao `scriptSrc`:

```ts
scriptSrc: ["'self'", "'sha256-pAapsw/mNkBCUgD9l4n4AuO9kQBXBPGW4BSW2W/So9I='"],
```

> ⚠️ **Armadilha conhecida**: qualquer edição no script (até um comentário ou indentação)
> invalida o hash e derruba o tema com CSP enforced. Deixe um comentário explícito no
> `index.html`, logo acima do `<script>`:
> ```html
> <!-- Se editar este script, RECALCULE o hash da CSP em server/src/index.ts (ver plans/022). -->
> ```

### Step 2 — Fechar as diretivas restantes

Acrescente, ainda em `reportOnly: true`:

```ts
workerSrc: ["'self'"],          // service worker do PWA (alguns browsers não caem no default-src)
objectSrc: ["'none'"],          // não usamos <object>/<embed> — fecha um vetor clássico
baseUri: ["'self'"],            // impede injeção de <base> para sequestrar URLs relativas
formAction: ["'self'"],         // formulários só postam para o próprio app
frameAncestors: ["'none'"],     // ninguém embute o app em iframe (anti-clickjacking)
```

Antes de escrever, **verifique** se o `@fastify/helmet` 13 já aplica `useDefaults: true` (que
mescla com os defaults do helmet). Se sim, algumas dessas já podem vir de graça — confirme
inspecionando o header real na verificação do Step 4, e mantenha explícito só o que não vier.

### Step 3 — Coletar violações reais (ainda em reportOnly)

Faça o build de produção e sirva pelo Fastify:

```bash
npm run build
npm start          # Fastify serve API + web/dist na 3344
```

Abra `http://localhost:3344` e **percorra o app inteiro** com o DevTools aberto na aba
Console, anotando toda mensagem de `Content Security Policy`:

- [ ] Login (claro e escuro)
- [ ] Home / seletor de carreiras
- [ ] Hub Elenco — incluindo o painel do Conselheiro
- [ ] Ficha de jogador — **atenção ao gráfico Recharts** (SVG inline, pode gerar estilo inline)
- [ ] Scout — busca, filtros, shortlist, comparação (modal)
- [ ] Captura — **tire uma foto de verdade** (o preview usa `blob:`)
- [ ] Mais, Configurações
- [ ] Admin — Databases e Usuários
- [ ] Instalação do PWA (service worker registrando)

Cada violação encontrada → ajuste a diretiva **específica** correspondente. Não caia na
tentação de resolver com `'unsafe-inline'` no `scriptSrc`: isso desliga a proteção principal.

### Step 4 — Virar a chave

Só depois do Step 3 estar **silencioso** (zero violações no console em todas as telas):

```ts
reportOnly: false,
```

Rebuild, reinicie e refaça o percurso completo do Step 3 — agora as violações **quebram**
funcionalidade em vez de só logar.

Confirme o header em produção-local:

```bash
curl -sI http://localhost:3344/ | grep -i content-security-policy
# deve aparecer "content-security-policy:" e NÃO "content-security-policy-report-only:"
```

### Step 5 — Documentar

- Em `server/src/index.ts`, substitua o comentário "CSP em report-only por ora (ver Step 5 do
  plano 004)" por uma nota que explique o hash e o risco de editá-lo.
- Em `STATUS.md §3.2`, marque o item da CSP como resolvido (mova a nota para o CHANGELOG da
  release).
- No `CHANGELOG.md`, registre na entrada `0.4.003`.

## Verification

1. `npm run verify` verde.
2. `curl -sI http://localhost:3344/ | grep -i content-security` → header **enforced**, não report-only.
3. Percurso completo do Step 3, com build de produção, **zero** violações no console.
4. **Teste negativo** (prova de que a CSP está de fato ativa): no console do browser, rode
   ```js
   const s = document.createElement('script'); s.src = 'https://example.com/x.js'; document.head.appendChild(s)
   ```
   Tem que ser **bloqueado** com erro de CSP. Se carregar, a política não está valendo.
5. Instale o PWA no celular (via HTTPS real, se já houver deploy) e confirme que abre e navega.

## STOP conditions

- **Qualquer violação que só se resolva com `'unsafe-inline'` ou `'unsafe-eval'` no
  `scriptSrc`** → STOP e reporte. Isso anularia o ganho; a causa precisa ser entendida antes
  (provavelmente é um recurso que dá para servir de outro jeito).
- **Tela branca depois de virar a chave** → volte `reportOnly: true` imediatamente, confirme
  que o app volta, e reporte a violação exata do console. Não tente adivinhar diretiva a
  diretiva no escuro.
- **Não conseguir testar com build de produção** (ex.: só validou no Vite dev) → STOP. O teste
  em dev **não prova nada** aqui: o header nem chega ao browser.
- **Recharts ou Tailwind exigindo `style-src` mais frouxo que `'unsafe-inline'`** (ex.:
  `'unsafe-eval'`) → STOP e reporte; provavelmente é outra causa.

## Maintenance notes

- O hash do Step 1 é **frágil por natureza**. Se aparecer um segundo script inline no futuro,
  a decisão correta passa a ser nonce por request (o que exige gerar o `index.html`
  dinamicamente) — aí vira outro plano, com outro custo.
- Se um dia o app precisar falar com um domínio externo direto do browser (ex.: CDN de
  imagens, telemetria), lembre que `connectSrc` está fechado em `'self'` — a mudança tem que
  ser deliberada, não acidental.
- `frameAncestors: 'none'` torna redundante o header `X-Frame-Options` do helmet; manter os
  dois não faz mal (navegadores antigos usam o segundo).
