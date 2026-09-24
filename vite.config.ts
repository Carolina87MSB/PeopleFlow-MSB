import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      // participar.html: página leve de confirmação de presença por QR
      // (/participar/:token, ver vercel.json) — não carrega o portal inteiro.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        participar: fileURLToPath(new URL('./participar.html', import.meta.url)),
      },
    },
  },
})
