import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/gepkocsinyeremeny/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/otp-check': {
        target: 'https://www.otpbank.hu',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/otp-check/, '/apps/composite/api/carsweepstakes/check'),
      },
    },
  },
})
