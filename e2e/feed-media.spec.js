import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { startMediaServer } from './chat-media/mediaServer.js'

// Стенд «лента рекомендаций прогружена для пользователя» (PROJECT.md, 2026-10-21). Настоящая FeedTab (feed-media/bench.html,
// dev-сервер стенда с PITHY_BENCH_STUBS=1: модули — из curriculaApiStub.js, остальной бэкенд мёртв по плану), шесть модулей
// с видео и постерами с локального медиа-сервера (задержка + полоса). Листаем стрелкой вниз, как клавиатурой/колесом, и в момент,
// когда слайд стал активным (observer.js), проверяем: постер уже загружен (или видео уже показано), скелетона нет, а видео
// показано (кадр есть, время идёт) не позже лимита — сосед прогревается заранее (videoPool), поэтому старт должен быть быстрым.
// Не fixtures.js: там консольные ошибки = падение, а запросы к мёртвому Supabase падают по плану; JS-исключения ловим сами
const MEDIA_DIR = fileURLToPath(new URL('./feed-media/media', import.meta.url))
const OBSERVER = fileURLToPath(new URL('./feed-media/observer.js', import.meta.url))
const SWIPES = 5
const PROFILES = [
  // shownMs — не позже скольких мс после активации видео должно быть показано (первый слайд — холодный старт, свой лимит)
  { name: 'обычная сеть (250 КБ/с, 100 мс)', latencyMs: 100, bytesPerSec: 250_000, shownMs: 800, firstMs: 6000, pauseMs: 2500 },
  { name: 'медленная сеть (60 КБ/с, 300 мс)', latencyMs: 300, bytesPerSec: 60_000, shownMs: 2500, firstMs: 10000, pauseMs: 3500 },
]

for (const profile of PROFILES) {
  test.describe(`лента рекомендаций: ${profile.name}`, () => {
    let media = null
    test.beforeAll(async () => { media = await startMediaServer({ dir: MEDIA_DIR, latencyMs: profile.latencyMs, bytesPerSec: profile.bytesPerSec }) })
    test.afterAll(async () => { await media?.close() })

    test('каждый слайд встаёт с постером и видео без чёрного кадра', async ({ page }) => {
      test.setTimeout(120_000)
      const errors = []
      page.on('pageerror', e => errors.push(String(e)))
      await page.addInitScript({ path: OBSERVER })
      await page.goto(`/e2e/feed-media/bench.html?media=${encodeURIComponent(media.base)}`)

      // Первый слайд: модули из стаба + ожидание карты памяти (RANK_WAIT_MS) → Swiper → активный слайд
      await page.waitForFunction(() => window.__feedBench.records.length > 0, null, { timeout: 30_000 })
      await page.waitForTimeout(profile.pauseMs)
      for (let i = 0; i < SWIPES; i++) {
        await page.keyboard.press('ArrowDown')
        await page.waitForTimeout(profile.pauseMs)
      }
      await page.waitForTimeout(500)

      const { records, splash } = await page.evaluate(() => window.__feedBench)
      expect(errors, 'исключения на странице').toEqual([])
      expect(records.length, 'слайдов активировано').toBe(SWIPES + 1)
      expect(new Set(records.map(r => r.atActive.posterUrl)).size, 'все слайды разные').toBe(SWIPES + 1)
      expect(splash, 'сигнал «первый кадр видео» для сплэша').toBeTruthy()
      expect(splash.why, 'сплэш отпущен по реальному кадру, не по страховке').toBe('первый кадр видео')
      records.forEach((r, i) => {
        const msg = `слайд ${i} (${r.atActive.posterUrl?.split('/').pop()}) на ${r.t} мс: ${JSON.stringify(r)}`
        const a = r.atActive
        expect(a.skeleton, `${msg} — скелетон вместо постера`).toBe(false)
        expect(a.poster && (a.posterLoaded || r.shownAfterMs === 0), `${msg} — постер ещё не загружен в момент активации`).toBe(true)
        expect(r.shownAfterMs, `${msg} — видео так и не показано`).not.toBeNull()
        expect(r.shownAfterMs, `${msg} — видео показано слишком поздно`).toBeLessThanOrEqual(i === 0 ? profile.firstMs : profile.shownMs)
      })
      console.log(`[feed-media] ${profile.name}: сплэш ${splash.t} мс (${splash.why}); ` + records.map((r, i) => `#${i}@${(r.t / 1000).toFixed(1)}с→видео +${r.shownAfterMs} мс`).join(' '))
    })
  })
}
