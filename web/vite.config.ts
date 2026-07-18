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
        name: 'Prancheta — companheiro de modo carreira',
        short_name: 'Prancheta',
        description: 'O companheiro do modo carreira do FIFA — desenvolvimento do time, prospecção e conselheiro de IA',
        theme_color: '#241b45',
        background_color: '#f2f1f7',
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
