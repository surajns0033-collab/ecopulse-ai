import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { makeAiHandler } from './server/aiCore.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const aiHandler = makeAiHandler(env)
  const aiPlugin = {
    name: 'ecopulse-ai-proxy',
    configureServer(server) { server.middlewares.use(aiHandler) },
    configurePreviewServer(server) { server.middlewares.use(aiHandler) },
  }

  return {
    plugins: [react(), aiPlugin],
    // Photo classification runs on WASM. Use the matching ONNX backend and
    // keep its cache independent of changes to the app's photo advice.
    resolve: {
      alias: [{ find: /^onnxruntime-web\/webgpu$/, replacement: 'onnxruntime-web/wasm' }],
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [{ name: 'onnx-runtime', test: /[\\/]node_modules[\\/]onnxruntime-(?:web|common)[\\/]/ }],
          },
        },
      },
    },
    server: { port: 5173 },
  }
})

