import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { APP_VERSION } from './src/shared/lib/version.js'
import { debugSink } from './tools/viteDebugSink.js'
import { shellCachePlugin } from './tools/viteShellCache.js'

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

// Номер версии в подписи сплэша (index.html: v__APP_VERSION__) подставляем при сборке/в dev, а не скриптом в
// браузере: модульный скрипт приходил позже первого кадра, и текст «выскакивал» посреди проявления лого
const splashVersion = {
  name: 'pithy-splash-version',
  transformIndexHtml: html => html.replaceAll('__APP_VERSION__', APP_VERSION),
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

// Стенды e2e (playwright.config.js, проект feed-media): dev-сервер стенда поднят с PITHY_BENCH_STUBS=1 — вместо curriculaApi.js
// подставляется e2e/feed-media/curriculaApiStub.js (синтетические модули ленты). В обычной сборке/dev переменной нет — псевдонимов нет
const benchAliases = process.env.PITHY_BENCH_STUBS
  ? [{ find: /^.*\/shared\/lib\/curriculaApi\.js$/, replacement: fileURLToPath(new URL('./e2e/feed-media/curriculaApiStub.js', import.meta.url)) }]
  : []

export default defineConfig({
  resolve: { alias: benchAliases },
  // debugSink — только dev: принимает отчёты и rrweb-записи от дебаг-тулбара
  // и кладёт их в _debug/ (папка вне git), чтобы Claude читал их прямо с диска
  // shellCachePlugin (tools/viteShellCache.js) — кеш оболочки: после сборки подставляет BUILD_ID и список предзагрузки в
  // dist/push-sw.js, метку сборки в dist/index.html и пишет dist/precache.json
  plugins: [react(), nonBlockingCss, splashVersion, emitVersionJson, shellCachePlugin({ version: APP_VERSION }), debugSink()],
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
    // Vitest подменяет любой импорт .css пустой строкой — даже `.css?raw`. Пакету для дизайнера
    // (admin/scenes/designer-pack) нужен текст scene-v2-cat.css как строка — пропускаем ?raw как есть
    css: { include: [/\?raw$/] },
  },
})
