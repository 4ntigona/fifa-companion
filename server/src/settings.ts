/**
 * Configuração do servidor.
 *
 * Os dados do usuário (carreiras, jogadores, chaves BYOK de IA) ficam no navegador
 * (localStorage) — o servidor é stateless quanto a isso. Aqui sobra apenas a
 * credencial opcional do Kaggle, usada para baixar a database do jogo (recurso
 * compartilhado, somente leitura). O dataset é público e o download funciona sem
 * autenticação; as credenciais só são necessárias se o Kaggle passar a exigir login.
 */

export function kaggleCreds(): { username: string; key: string } | null {
  const username = process.env.KAGGLE_USERNAME
  const key = process.env.KAGGLE_KEY
  return username && key ? { username, key } : null
}

/**
 * Token opcional que autoriza disparar a importação da database (POST /api/import)
 * a partir de fora do loopback. Sem ele, o import só é aceito de 127.0.0.1/::1 —
 * ação de setup do dono do app, não de usuário final.
 */
export function adminToken(): string | null {
  return process.env.ADMIN_TOKEN || null
}
