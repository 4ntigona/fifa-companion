module.exports = {
  apps: [
    {
      name: 'fifa-companion',
      script: './server/dist/index.js',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3344,
      },
    },
  ],
}
