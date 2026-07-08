import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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

export default defineConfig({
  plugins: [react(), nonBlockingCss],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
})
