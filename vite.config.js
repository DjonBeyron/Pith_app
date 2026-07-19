import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { APP_VERSION } from './src/shared/lib/version.js'

// Собранный CSS (~115 КБ) Vite вставляет в <head> как render-blocking <link> —
// браузер не рисует ни одного кадра (включая инлайновый сплэш), пока файл не
// скачан, и до лого висела чернота. Переводим ссылку в неблокирующий режим
// (media=print → onload media=all): сплэш рисуется сразу из инлайновых стилей,
// а скрытие сплэша ждёт сигнала __pithyCssReady (см. index.html), чтобы не
// показать приложение без стилей. Регэксп ловит только тег, который вставляет
// Vite (rel сразу после <link) — ссылки на шрифты в исходнике не трогает.
const nonBlockingCss = {
  name: 'pithy-non-blocking-css',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      return html.replace(
        /<link rel="stylesheet" crossorigin href="([^"]+)">/g,
        '<link rel="stylesheet" crossorigin href="$1" media="print" data-app-css ' +
          'onload="this.media=\'all\';window.__pithyCssReady&&window.__pithyCssReady()">',
      )
    },
  },
}

// version.json в корне сборки — клиент (UpdateToast) сравнивает его со своей
// APP_VERSION раз в ~10 минут и предлагает обновиться: лечит вечную проблему
// «кэш браузера показывает старую версию» (этап 3 плана стабилизации)
const emitVersionJson = {
  name: 'pithy-version-json',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: APP_VERSION }) })
  },
}

export default defineConfig({
  plugins: [react(), nonBlockingCss, emitVersionJson],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  // Vitest (npm run test): только юниты в src/. Иначе он подхватывает
  // e2e/*.spec.js (Playwright) и падает — их гоняет отдельный `npm run e2e`.
  test: {
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  },
})
