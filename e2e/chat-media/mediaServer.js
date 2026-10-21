import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'

// Медиа-сервер стенда «медиа в чате»: отдаёт файлы из dir с CORS, задержкой latencyMs на ответ и полосой bytesPerSec
// (имитация мобильной сети: байты идут порциями раз в 50 мс). Порт — свободный (0), адрес в result.base
const TYPES = { '.mp3': 'audio/mpeg', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.png': 'image/png' }
const TICK_MS = 50

export function startMediaServer({ dir, latencyMs = 0, bytesPerSec = 1e9 }) {
  const chunk = Math.max(256, Math.round(bytesPerSec * TICK_MS / 1000))
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length')
    if (req.method === 'OPTIONS') return res.end()
    const file = join(dir, basename(req.url.split('?')[0]))
    if (!existsSync(file)) { res.statusCode = 404; return res.end() }
    const buf = readFileSync(file)
    res.setHeader('content-type', TYPES[extname(file)] || 'application/octet-stream')
    res.setHeader('content-length', buf.length)
    let pos = 0
    const tick = () => {
      if (res.destroyed) return
      if (pos >= buf.length) return res.end()
      res.write(buf.subarray(pos, pos + chunk))
      pos += chunk
      setTimeout(tick, TICK_MS)
    }
    setTimeout(tick, latencyMs)
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ base: `http://127.0.0.1:${port}`, close: () => new Promise(r => server.close(r)) })
    })
  })
}
