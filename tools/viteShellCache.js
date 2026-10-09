import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

// Кеш оболочки (быстрый старт): после сборки считает BUILD_ID, список предзагрузки и подставляет их в dist/push-sw.js и dist/index.html.
// public/push-sw.js остаётся ИСХОДНИКОМ с токенами '__BUILD_ID__' / '__APP_VERSION__' / '__PRECACHE__' (в dev и тестах без подстановки
// кеш оболочки выключен). Что предзагружаем: index.html (ключ '/'), всё из /assets/ и несколько файлов public/ (STATIC_PRECACHE).
// Если всё вместе тяжелее лимита — только то, что нужно для первого кадра (файлы из index.html), остальное воркер докладывает в кеш
// по мере использования. Тесты: src/shared/lib/shellCachePlugin.test.js.
export const STATIC_PRECACHE = ['manifest.webmanifest', 'net-guard.js'] // + всё из icons/ (favicon.svg НЕ кладём: net-guard пингует его мимо кеша)
export const PRECACHE_LIMIT = 20 * 1024 * 1024
export const TOKENS = { id: '__BUILD_ID__', ver: '__APP_VERSION__', list: '__PRECACHE__' }

const sha1 = buf => createHash('sha1').update(buf).digest('hex')

// Все файлы папки: [{ path: 'assets/a.js' (posix, без ведущего слэша), size }]
export function walk(dir, base = dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, base))
    else out.push({ path: full.slice(base.length + 1).split(sep).join('/'), size: statSync(full).size })
  }
  return out
}

// Список предзагрузки: URL-ы с ведущим слэшем, '/' (index.html) первым. entryRe — что нужно для первого кадра при превышении лимита
export function collectPrecache(files, { limit = PRECACHE_LIMIT, html = '' } = {}) {
  const wanted = files.filter(f =>
    f.path.startsWith('assets/') || STATIC_PRECACHE.includes(f.path) || f.path.startsWith('icons/'))
  const total = wanted.reduce((n, f) => n + f.size, 0)
  let picked = wanted
  let lazyOmitted = 0
  if (total > limit) {
    const inHtml = new Set([...html.matchAll(/(?:src|href)="\/([^"]+)"/g)].map(m => m[1]))
    picked = wanted.filter(f => !f.path.startsWith('assets/') || inHtml.has(f.path))
    lazyOmitted = wanted.length - picked.length
  }
  const urls = ['/', ...picked.map(f => '/' + f.path).sort()]
  return { urls, bytes: picked.reduce((n, f) => n + f.size, 0), total, lazyOmitted }
}

// Идентификатор сборки: версия + хеш содержимого всего, что кладём в кеш, и самих файлов воркера (меняется логика — меняется кеш)
export function computeBuildId(version, entries) {
  const h = createHash('sha1')
  for (const e of [...entries].sort((a, b) => (a.path < b.path ? -1 : 1))) h.update(e.path).update('\0').update(e.hash).update('\0')
  return `${version}-${h.digest('hex').slice(0, 8)}`
}

export function applySwPlaceholders(src, { buildId, version, precache }) {
  let out = src
  for (const [token, value] of [[TOKENS.id, buildId], [TOKENS.ver, version], [TOKENS.list, precache]]) {
    if (!out.includes(`'${token}'`)) throw new Error(`push-sw.js: токен ${token} не найден`)
    out = out.replace(`'${token}'`, () => JSON.stringify(value))
  }
  return out
}

// Метка сборки в index.html: страница узнаёт «свой» BUILD_ID (плашка обновления, boot-ok)
export const applyHtmlBuild = (html, buildId) => html.replaceAll(TOKENS.id, buildId)

export function shellCachePlugin({ version }) {
  let outDir = ''
  return {
    name: 'pithy-shell-cache',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    closeBundle() {
      const swPath = join(outDir, 'push-sw.js')
      const htmlPath = join(outDir, 'index.html')
      if (!existsSync(swPath) || !existsSync(htmlPath)) return
      const html = readFileSync(htmlPath, 'utf8')
      const { urls, bytes, total, lazyOmitted } = collectPrecache(walk(outDir), { html })
      const entries = urls.map(u => ({ path: u, hash: sha1(u === '/' ? html : readFileSync(join(outDir, u.slice(1)))) }))
      for (const f of ['push-sw.js', 'sw-core.js']) entries.push({ path: '#' + f, hash: sha1(readFileSync(join(outDir, f))) })
      const buildId = computeBuildId(version, entries)
      writeFileSync(htmlPath, applyHtmlBuild(html, buildId))
      writeFileSync(swPath, applySwPlaceholders(readFileSync(swPath, 'utf8'), { buildId, version, precache: urls }))
      writeFileSync(join(outDir, 'precache.json'), JSON.stringify({ buildId, version, bytes, total, lazyOmitted, files: urls }))
      console.log(`[shell-cache] ${buildId}: ${urls.length} файлов, ${(bytes / 1048576).toFixed(2)} МБ${lazyOmitted ? `, лениво: ${lazyOmitted}` : ''}`)
    },
  }
}
