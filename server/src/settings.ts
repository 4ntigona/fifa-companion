/**
 * Configuração do servidor.
 *
 * Desde a v0.3.000 os dados do usuário (carreiras, elencos, snapshots, prospecção,
 * pareceres do conselheiro) vivem no SQLite do servidor, por user_id. O que continua
 * fora daqui, por invariante: as chaves de IA (BYOK), que ficam no navegador de cada
 * usuário e nunca são persistidas pelo servidor.
 *
 * Sobra neste arquivo apenas a credencial opcional do Kaggle, usada para baixar a
 * database do jogo (recurso compartilhado, somente leitura). O dataset é público e o
 * download funciona sem autenticação; as credenciais só são necessárias se o Kaggle
 * passar a exigir login.
 */

export function kaggleCreds(): { username: string; key: string } | null {
  const username = process.env.KAGGLE_USERNAME
  const key = process.env.KAGGLE_KEY
  return username && key ? { username, key } : null
}
