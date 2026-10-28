import { test, expect } from './fixtures.js'
import { bootPersona, openFeed, seedOnce, shiftDays, makeRng, think, fingerSwipe } from './helpers/newbiePersona.js'
import { soundOn, active } from './helpers/newbieFeedActions.js'
import { closeEverything } from './helpers/newbieMonkey.js'
import { profileOf, pauseOf, act, hscrollProblem, snapshot, invariantProblems } from './helpers/newbieCrowd.js'

// Массовый прогон «случайные пользователи»: N людей (CROWD_N, по умолчанию 50), у каждого свой seed (CROWD_SEED + номер, по умолчанию 7000+) и случайный
// профиль — экран 375 или 412 px, звук вкл/выкл, группа Пита control/prompts, первый или второй день, темп (быстрый / медленный / смешанный) и доля
// «обезьяньих» действий; 60–120 с жестов (спокойные + helpers/newbieMonkey.js). Что должно держаться всегда: ловец багов (fixtures.js) не поймал ошибок
// консоли и сети; нет горизонтального скролла; две шторки Пита не видны сразу; вне ленты (вкладка «Профиль») шторок ленты нет; вкладка «Память» видна
// только когда в памяти есть слово; в конце приложение отвечает (лента листается). В отчёте — профиль и статистика действий каждого человека.
// В обычный прогон (push, CI) НЕ входит: без CROWD_N / CROWD=1 спек пропускается. Запуск: CROWD_N=10 npx playwright test e2e/newbie-crowd.spec.js --project=newbie --workers=3
// Повтор одного упавшего: CROWD_SEED=<seed> CROWD_N=1 (seed печатается в названии теста и в приложении `crowd`). Видео и трасса — только у упавших.
const N = Number(process.env.CROWD_N) || (process.env.CROWD ? 50 : 0)
const BASE = Number(process.env.CROWD_SEED) || 7000

test.use({ video: 'retain-on-failure', trace: 'retain-on-failure' }) // проект newbie пишет видео всегда — для 50 людей это лишнее
test.describe.configure({ mode: 'parallel', retries: 0 })            // сид воспроизводит человека, а не тайминги: повтор упавшего ничего не докажет

// Человек открывает приложение: размер экрана, день, группа Пита
async function arrive(page, p) {
  await page.setViewportSize({ width: p.width, height: p.height })
  if (p.day === 2) { // вернулся на следующий день: слово сохранено, «Память» открывали, время напоминания выбрано, это 2-я сессия
    const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('sv')
    await seedOnce(page, {
      pithy_guest_memory_v1: { keep: { word: 'keep', step: 1, due_on: tomorrow, last_card_id: null, reviews: 0, lapses: 0 } },
      pithy_memory_tab_seen_v1: '1', pithy_remind_asked_v1: '1', pithy_remind_v1: { hh: 20, mm: 0, enabled: true }, pithy_prompts_v1: { sessions: 1 },
    })
    await shiftDays(page, 1)
  }
  await bootPersona(page, { group: p.group, keepIntro: p.day === 2 })
}

if (!N) {
  test('[CROWD] массовый прогон выключен: задайте CROWD_N=10 (или CROWD=1 — 50 человек)', () => { test.skip(true, 'выключен по умолчанию, см. шапку файла') })
}

for (let i = 0; i < N; i++) {
  const p = profileOf(BASE + i)
  const label = `${p.width}px, ${p.sound ? 'со звуком' : 'без звука'}, ${p.group}, день ${p.day}, ${p.tempo}, обезьяна ${Math.round(p.monkey * 100)}%, ${Math.round(p.durationMs / 1000)} с`

  test(`[CROWD] #${i} seed ${p.seed}: ${label}`, async ({ page }, testInfo) => {
    test.setTimeout(p.durationMs + 120_000)
    const rnd = makeRng(p.seed)
    const stat = {}
    const recent = []
    const violations = new Map() // текст → { n, step, sec, recent }
    let steps = 0
    let missed = 0
    let offSince = null
    const t0 = Date.now()
    const note = text => {
      if (!violations.has(text)) violations.set(text, { n: 0, step: steps, sec: Math.round((Date.now() - t0) / 1000), recent: [...recent] })
      violations.get(text).n++
    }

    try {
      await arrive(page, p)
      await openFeed(page)
      if (p.sound) await soundOn(page)

      await test.step(`жесты ${Math.round(p.durationMs / 1000)} с`, async () => {
        const until = t0 + p.durationMs
        while (Date.now() < until) {
          const tAct = Date.now()
          const r = await act(page, rnd, p)
          if (Date.now() - tAct > 20_000) note(`действие «${r.name}» тянулось ${Math.round((Date.now() - tAct) / 1000)} с (зависание страницы?)`)
          stat[r.name] = (stat[r.name] ?? 0) + 1
          if (!r.ok) missed++
          recent.push(r.name + (r.ok ? '' : ' (мимо)'))
          if (recent.length > 6) recent.shift()
          steps++
          await think(page, rnd, ...pauseOf(p, rnd))

          const snap = await snapshot(page)
          offSince = snap.feedOn ? null : (offSince ?? Date.now())
          for (const msg of invariantProblems(snap, { offFeedMs: offSince ? Date.now() - offSince : 0 })) note(msg)
          if (steps % 5 === 0) { const h = await hscrollProblem(page); if (h) note(h) }

          if (rnd.chance(0.06)) { // зашёл в «Профиль»: шторок ленты там быть не должно; вернулся в «Уроки»
            await page.getByRole('button', { name: 'Профиль', exact: true }).click({ timeout: 2000 }).catch(() => {})
            stat['зашёл в «Профиль» (проверка шторок)'] = (stat['зашёл в «Профиль» (проверка шторок)'] ?? 0) + 1
            await think(page, rnd, 1300, 1800)
            const s = await snapshot(page)
            if (s.feedOn) note('после тапа «Профиль» лента всё ещё видна (проверка шторок вне ленты слепа)')
            else if (s.sheetsDom > 0) note('шторка Пита (promptSheet) осталась на вкладке «Профиль»')
            const h = await hscrollProblem(page)
            if (h) note(`на «Профиле»: ${h}`)
            await page.getByRole('button', { name: 'Уроки', exact: true }).click({ timeout: 2000 }).catch(() => {})
          }
        }
      })

      await test.step('усталость: закрыть окна, вернуться в «Уроки», лента отвечает', async () => {
        await closeEverything(page)
        await page.getByRole('button', { name: 'Уроки', exact: true }).click({ timeout: 5000 })
        await expect(active(page)).toBeVisible({ timeout: 10_000 })
        let ok = false
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          const before = await active(page).locator('.feedPhrase').first().textContent()
          await fingerSwipe(page, 'next', { ms: 300 })
          ok = await expect.poll(() => active(page).locator('.feedPhrase').first().textContent(), { timeout: 4000 }).not.toBe(before).then(() => true, () => false)
          if (!ok) await page.locator('.promptSheet').getByRole('button', { name: 'Закрыть' }).first().click({ timeout: 1500 }).catch(() => {})
        }
        if (!ok) note('лента не листается после серии действий')
      })
    } finally {
      const summary = { profile: p, steps, missed, stat, violations: [...violations].map(([text, v]) => ({ text, ...v })) }
      await testInfo.attach('crowd', { body: JSON.stringify(summary), contentType: 'application/json' })
    }
    expect([...violations].map(([text, v]) => `${text} — ×${v.n}, первый раз на шаге ${v.step} (${v.sec} с), перед этим: ${v.recent.join(' → ')}`), `seed ${p.seed}: ${label}`).toEqual([])
  })
}
