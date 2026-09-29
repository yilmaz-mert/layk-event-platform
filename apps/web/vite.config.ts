import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

export default defineConfig(({ command, mode }) => {
  // Fail the build instead of shipping a bundle without a Supabase project.
  // loadEnv merges .env files with VITE_* variables from the environment (e.g. Vercel).
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    const missing = REQUIRED_ENV.filter((key) => !env[key])
    if (missing.length) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}. See README.md → Environment.`)
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
