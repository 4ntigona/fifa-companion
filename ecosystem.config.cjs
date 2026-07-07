/**
 * Configuração do PM2 para rodar o FIFA Career Companion em produção.
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup   # para reiniciar junto com o servidor
 *
 * O CloudPanel faz o proxy reverso (HTTPS) para a porta abaixo.
 */
module.exports = {
  apps: [
    {
      name: 'fifa-companion',
      script: 'server/dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3344',
      },
      // O .env do server (KAGGLE_*, PORT, etc.) é lido via node --env-file? Não em PM2:
      // defina aqui ou exporte no ambiente. As chaves de IA são BYOK (navegador).
      max_memory_restart: '400M',
      autorestart: true,
    },
  ],
}
