import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Load all VITE_* vars from .env files and expose them as process.env.VITE_*
  // so that packages/core/src/lib/supabase.ts can use process.env on both platforms.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const define = Object.fromEntries(
    Object.entries(env).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)])
  )

  return {
    plugins: [react(), tailwindcss()],
    define,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
