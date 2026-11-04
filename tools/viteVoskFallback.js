import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Запасная загрузка библиотеки Vosk (src/shared/lib/vosk/voskLibFallback.js): копия UMD-сборки vosk-browser под адресом /vosk-fallback.js.
// В репозитории копии нет: при сборке кладётся в dist/ (closeBundle), в dev отдаётся middleware'ом. В кеш оболочки НЕ попадает
// (collectPrecache берёт только /assets/*, манифест, net-guard, иконки), воркер этот адрес не перехватывает. Тесты: voskFallbackPlugin.test.js
export const FALLBACK_NAME = 'vosk-fallback.js'
export const voskSource = root => resolve(root, 'node_modules/vosk-browser/dist/vosk.js')

export function voskFallbackPlugin() {
  let root = process.cwd()
  let outDir = ''
  return {
    name: 'pithy-vosk-fallback',
    configResolved(config) { root = config.root; outDir = resolve(config.root, config.build.outDir) },
    configureServer(server) {
      server.middlewares.use(`/${FALLBACK_NAME}`, (req, res, next) => {
        const src = voskSource(root)
        if (!existsSync(src)) return next()
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        res.end(readFileSync(src))
      })
    },
    closeBundle() {
      const src = voskSource(root)
      if (!outDir || !existsSync(outDir) || !existsSync(src)) return
      writeFileSync(join(outDir, FALLBACK_NAME), readFileSync(src))
    },
  }
}
