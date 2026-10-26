/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
  // Load VITE_* envs from .env files and process.env
  const env = loadEnv(mode, process.cwd());

  // Base path for the app
  const base = env.VITE_BASE_PATH
  return {
    base,
    root: fileURLToPath(new URL('.', import.meta.url)),
    resolve: {
      alias: {
        '@edanalytics/common-ui': fileURLToPath(new URL('../common-ui/src/index.ts', import.meta.url)),
        '@edanalytics/models': fileURLToPath(new URL('../models/src/index.ts', import.meta.url)),
        '@edanalytics/models-server': fileURLToPath(new URL('../models-server/src/index.ts', import.meta.url)),
        '@edanalytics/utils': fileURLToPath(new URL('../utils/src/index.ts', import.meta.url)),
      },
    },
    build: {
      outDir: '../../dist/packages/fe',
      emptyOutDir: true,
      reportCompressedSize: true,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    cacheDir: '../../node_modules/.vite/fe',

    server: {
      port: 4200,
      host: true,
      fs: {
        // Allow serving files from the app dir and repo root
        allow: [fileURLToPath(new URL('.', import.meta.url)), '../../','../../node_modules/@fontsource'],
      },
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'deny',
        //Content Security Policy cannot be set locally, but should be in production
      },
    },

    preview: {
      port: 4300,
      host: 'localhost',
    },

    plugins: [react(), visualizer()],

    // Uncomment this if you are using workers.
    // worker: {
    //  plugins: [
    //    viteTsConfigPaths({
    //      root: '../../',
    //    }),
    //  ],
    // },
  };
});
