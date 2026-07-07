import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'FIFA Career Companion',
        short_name: 'Career',
        description: 'Companion do modo carreira do FIFA — prospecção e desenvolvimento de jogadores',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        lang: 'pt-BR',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3344',
      '/captures': 'http://localhost:3344'
    }
  }
})
