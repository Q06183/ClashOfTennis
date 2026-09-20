import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 5178, strictPort: true, proxy: { '/ws': { target: 'ws://127.0.0.1:7470', ws: true }, '/health': 'http://127.0.0.1:7470' } },
  build: { target: 'es2022', chunkSizeWarningLimit: 3000,
    rolldownOptions: { output: { codeSplitting: { groups: [
      { name: 'physics', test: /node_modules\/@dimforge/ },
      { name: 'three', test: /node_modules\/three/ }
    ] } } }
  }
});
