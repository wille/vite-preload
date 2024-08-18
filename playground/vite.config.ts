import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import preloadPlugin from '../dist/plugin';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), preloadPlugin({
    __internal_importHelperModuleName: '../../src/__internal'
  })]
})
