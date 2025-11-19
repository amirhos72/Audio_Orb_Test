import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  // This ensures assets are linked relatively, so it works on custom domains or repo subfolders
  base: './', 
  build: {
    outDir: 'dist',
    target: 'esnext'
  }
})