import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
// Явный импорт, а не глобальный Buffer: eslint проекта настроен на браузерное
// окружение, и глобали Node тут не объявлены
import { Buffer } from 'node:buffer'

// Приёмник дебаг-файлов: браузер не умеет писать в папку проекта, поэтому
// тулбар шлёт отчёты и rrweb-записи сюда POST-запросом, а плагин кладёт их на
// диск рядом с кодом. Смысл — чтобы Claude читал их сразу с диска, а не ждал,
// пока файл найдут в Downloads и перешлют.
//
// Только dev-сервер (apply: 'serve'): в прод-сборке плагина нет вовсе, и
// эндпоинт наружу не выставляется.

const ENDPOINT = '/__pithy-debug'
// rrweb-запись длинного урока — это мегабайты JSON. 64 МБ хватает с запасом и
// при этом случайно (или злонамеренно) не забивает диск одним запросом
const MAX_BYTES = 64 * 1024 * 1024

// Имя приходит из браузера, то есть это недоверенный ввод: без чистки
// «../../» в нём увёл бы запись в любую точку диска
function safeName(raw) {
  const base = String(raw || 'debug').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120)
  return base.replace(/^[.-]+/, '') || 'debug'
}

export function debugSink({ dir = '_debug' } = {}) {
  return {
    name: 'pithy-debug-sink',
    apply: 'serve',
    configureServer(server) {
      const outDir = resolve(server.config.root, dir)

      server.middlewares.use(ENDPOINT, (req, res) => {
        const reply = (code, payload) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(payload))
        }
        if (req.method !== 'POST') return reply(405, { error: 'только POST' })

        const chunks = []
        let size = 0
        let aborted = false

        req.on('data', chunk => {
          if (aborted) return
          size += chunk.length
          if (size > MAX_BYTES) {
            aborted = true
            reply(413, { error: `запись больше ${MAX_BYTES} байт` })
            req.destroy()
            return
          }
          chunks.push(chunk)
        })

        req.on('end', () => {
          if (aborted) return
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            const data = body.payload ?? body
            // Лог плеера приходит готовым текстом (pLog-строки, трасса
            // [morph]) — его незачем заворачивать в JSON, читать построчно
            // удобнее. Всё остальное — структуры, их пишем как JSON.
            const isText = typeof data === 'string'
            let out
            if (isText) {
              out = data
            } else {
              // Отступы только у мелких файлов: rrweb-запись урока — это
              // десятки мегабайт, и форматирование раздувает её ещё вдвое ни
              // за чем (её читает плеер, а не человек)
              const compact = JSON.stringify(data)
              out = compact.length > 1024 * 1024 ? compact : JSON.stringify(data, null, 2)
            }
            const file = `${safeName(body.name)}.${isText ? 'txt' : 'json'}`
            mkdirSync(outDir, { recursive: true })
            writeFileSync(join(outDir, file), out, 'utf8')
            // Путь в лог dev-сервера — по нему сразу видно, что просить открыть
            server.config.logger.info(`  дебаг → ${dir}/${file}  (${(size / 1024).toFixed(0)} КБ)`)
            reply(200, { ok: true, file: `${dir}/${file}` })
          } catch (e) {
            reply(400, { error: String(e && e.message) })
          }
        })
      })
    },
  }
}
