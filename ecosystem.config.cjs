/**
 * Configuração do PM2 para rodar o Prancheta em produção.
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup   # para reiniciar junto com o servidor
 *
 * O CloudPanel faz o proxy reverso (HTTPS) para a porta abaixo.
 * Passo a passo completo: ver DEPLOY.md.
 */
module.exports = {
  apps: [
    {
      name: 'prancheta',
      script: 'server/dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      // Lê server/.env sem depender do `npm start` — o PM2 não carrega .env sozinho.
      // Requer Node 20.12+ / 22+. O bloco `env` abaixo tem precedência sobre o arquivo.
      node_args: '--env-file-if-exists=server/.env',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3344',
      },
      // O resto vive em server/.env (ver server/.env.example):
      //   CORS_ORIGINS=https://prancheta.seudominio.com  ← recomendado em produção
      //   ADMIN_EMAIL / ADMIN_PASSWORD                   ← só no PRIMEIRO boot, para semear
      //     o primeiro administrador (sem isso ninguém consegue logar). Remova depois.
      // As chaves de IA são BYOK: ficam no navegador de cada usuário, nunca aqui.
      max_memory_restart: '400M',
      autorestart: true,
    },
  ],
}
