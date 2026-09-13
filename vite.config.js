import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    emptyOutDir: false,
    // A classic IIFE bundle (not an ES module) so the inlined single-file
    // build in F1-Console.html runs straight off the filesystem. Chrome
    // refuses to load `type="module"` scripts over file://; an inline
    // classic script has no such restriction.
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.js',
        assetFileNames: 'assets/app.[ext]',
      },
    },
  },
  server: { port: 5173, strictPort: false, host: '127.0.0.1' },
})
