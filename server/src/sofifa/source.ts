/**
 * Fonte de dados da database original do jogo.
 *
 * Implementações:
 *  - KaggleCsvSource (padrão): dumps reais extraídos do SoFIFA (datasets de Stefano Leone).
 *  - SofifaApiSource: api.sofifa.net — requer whitelist de parceiro do SoFIFA;
 *    mantida pronta para quando/se o acesso for liberado.
 */
export interface GameDataSource {
  /** Importa a database completa de uma versão do FIFA para o SQLite local. */
  importVersion(fifaVersion: number, onProgress: (done: number, total: number) => void): Promise<void>
}

export const KNOWN_VERSIONS = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24] as const
/** Versões com "Criar seu Clube" no modo carreira (FIFA 22 em diante). */
export const CREATE_CLUB_MIN_VERSION = 22
