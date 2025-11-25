import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/digitaldefiance-eecp/',
  build: {
    outDir: 'dist',
    sourcemap: true,
    commonjsOptions: {
      transformMixedEsModules: true,
      requireReturnsDefault: 'auto',
    },
  },
  optimizeDeps: {
    include: [
      'tslib',
      '@digitaldefiance/ecies-lib',
      '@noble/hashes',
      '@noble/curves',
      'bson',
      'uuid',
    ],
  },
  resolve: {
    dedupe: ['@noble/hashes', '@noble/curves'],
  },
  define: {
    // Required for some packages that check for Node.js environment
    global: 'globalThis',
  },
})
