// Сборка стенда «Встряхни память» для замеров производительности (dev-режим React искажает цифры): прод-сборка _stand/race/index.html в каталог OUT.
//   OUT=/tmp/perf-dist npx vite build -c _stand/race/vite.perf.config.mjs && OUT=/tmp/perf-dist npx vite preview -c _stand/race/vite.perf.config.mjs --port 5476 --host 127.0.0.1
// Прогон — _stand/race/perf-run.mjs, сводка — _stand/race/perf-report.mjs. В обычную сборку приложения стенд не входит.
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('../..', import.meta.url))
export default defineConfig({
  root,
  plugins: [react()],
  define: { __BUILD_TIME__: JSON.stringify('perf-stand') },
  build: { outDir: process.env.OUT || '/tmp/perf-dist', emptyOutDir: true, target: 'esnext', minify: process.env.MINIFY !== '0', /* MINIFY=0 — читаемые имена функций в трассе Chromium */ rollupOptions: { input: `${root}/_stand/race/index.html` } },
  preview: { strictPort: true },
})
