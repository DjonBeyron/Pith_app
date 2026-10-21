import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { startMediaServer } from './chat-media/mediaServer.js'

// Стенд «медиа в чате прогружены для пользователя, а не только на цифрах» (PROJECT.md, 2026-10-21). Настоящий LessonPlayer
// (chat-media/bench.html, dev-сервер с мёртвым Supabase — проект chat-media в playwright.config.js) с синтетическим уроком из
// всех типов медиа (chat-media/lesson.js); файлы отдаёт локальный сервер с задержкой и ограничением полосы (mediaServer.js).
// Наблюдатель (observer.js) в момент появления строки ленты — ДО отрисовки — снимает состояние медиа. Утверждение: в момент
// появления картинка загружена и видна, у видео/кружка есть кадр, у голосового — волна и длительность, галерея «выбери фото» —
// с готовыми картинками. Медленный профиль проверяет гейт «печатает» (warmWait.js): точки держатся, пока файл качается.
// Не fixtures.js: там консольные ошибки = падение, а здесь запросы к мёртвому Supabase падают по плану; JS-исключения ловим сами
const MEDIA_DIR = fileURLToPath(new URL('./chat-media/media', import.meta.url))
const OBSERVER = fileURLToPath(new URL('./chat-media/observer.js', import.meta.url))
const PROFILES = [
  { name: 'обычная сеть (250 КБ/с, 100 мс)', latencyMs: 100, bytesPerSec: 250_000 },
  { name: 'очень медленная сеть (10 КБ/с, 500 мс)', latencyMs: 500, bytesPerSec: 10_000 },
]
// Порядок появления и что проверять у каждой записи
const ORDER = ['t1', 'ph', 't2', 'au1', 'ci', 't3', 'st1', 'vi', 'st2', 'pc', 'pc-gallery', 'au2', 'end']
const KIND = { ph: 'image', st1: 'image', au1: 'audio', au2: 'audio', ci: 'video', vi: 'video', st2: 'video', 'pc-gallery': 'gallery' }

function checkRecord(rec) {
  const a = rec.atAppear
  const msg = `#${rec.key} на ${rec.t} мс: ${JSON.stringify(a)}`
  switch (KIND[rec.key]) {
    case 'image':
      expect(a.imgs.length, msg).toBeGreaterThan(0)
      for (const i of a.imgs) {
        expect(i.complete && i.naturalWidth > 0, `${msg} — картинка не загружена`).toBe(true)
        expect(i.opacity, `${msg} — картинка невидима`).toBe('1')
        expect(i.visibility, msg).toBe('visible')
      }
      expect(a.placeholder, `${msg} — заглушка вместо медиа`).toBe(false)
      break
    case 'video':
      expect(a.video, `${msg} — нет <video>`).toBeTruthy()
      expect(a.video.readyState >= 2 || a.video.poster, `${msg} — ни кадра, ни постера`).toBe(true)
      expect(a.video.visibility, msg).toBe('visible')
      break
    case 'audio':
      expect(a.wave, `${msg} — нет волны`).toMatch(/playerAudioWave/)
      expect(a.wave, `${msg} — волна ещё «pending»`).not.toMatch(/--pending/)
      expect(a.dur, `${msg} — нет длительности`).toMatch(/^\d\d:\d\d$/)
      expect(a.canvases.some(c => c.w > 0 && c.h > 0), `${msg} — canvas волны пустой`).toBe(true)
      break
    case 'gallery': {
      const g = rec.after300 ?? a // картинки галереи монтируются после открытия — смотрим через 300 мс
      expect(g.imgs.length, msg).toBe(3)
      for (const i of g.imgs) expect(i.complete && i.naturalWidth > 0, `${msg} — фото галереи не загружено`).toBe(true)
      break
    }
    default:
  }
}

for (const profile of PROFILES) {
  test.describe(`медиа в чате: ${profile.name}`, () => {
    let media = null
    test.beforeAll(async () => { media = await startMediaServer({ dir: MEDIA_DIR, latencyMs: profile.latencyMs, bytesPerSec: profile.bytesPerSec }) })
    test.afterAll(async () => { await media?.close() })

    test('каждое сообщение появляется с уже готовым медиа', async ({ page }) => {
      test.setTimeout(180_000)
      const errors = []
      page.on('pageerror', e => errors.push(String(e)))
      await page.addInitScript({ path: OBSERVER })
      await page.goto(`/e2e/chat-media/bench.html?media=${encodeURIComponent(media.base)}`)

      // Цепочка идёт сама (таймеры в lesson.js); галерею «выбери фото» открываем тапом, как пользователь
      let galleryOpened = false
      const deadline = Date.now() + 160_000
      while (Date.now() < deadline) {
        if (!galleryOpened && await page.locator('.pcAttachBtn').count()) { galleryOpened = true; await page.locator('.pcAttachBtn').first().click() }
        if (await page.evaluate(() => window.__bench.some(b => b.key === 'end'))) break
        await page.waitForTimeout(100)
      }
      await page.waitForTimeout(400) // after300 последней записи

      const bench = await page.evaluate(() => window.__bench)
      expect(errors, 'исключения на странице').toEqual([])
      expect(bench.map(b => b.key), 'порядок появления').toEqual(ORDER)
      for (const rec of bench) checkRecord(rec)
      console.log(`[chat-media] ${profile.name}: ` + bench.map(b => `${b.key}@${(b.t / 1000).toFixed(1)}с`).join(' '))
    })
  })
}
