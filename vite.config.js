import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { makeAiHandler } from './server/aiCore.js'
import { makeSpeechHandler } from './server/speech.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const aiHandler = makeAiHandler(env)
  const speechHandler = makeSpeechHandler(env)
  const aiPlugin = {
    name: 'ecopulse-ai-proxy',
    configureServer(server) { server.middlewares.use(speechHandler); server.middlewares.use(aiHandler) },
    configurePreviewServer(server) { server.middlewares.use(speechHandler); server.middlewares.use(aiHandler) },
  }

  return {
    plugins: [react(), aiPlugin],
    worker: { format: 'es' },
    server: { port: 5173 },
  }
})

