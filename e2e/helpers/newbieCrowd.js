import { makeRng, fingerSwipe, expectNoHScroll } from './newbiePersona.js'
import { openPhrase, rubPhrase, tapVideo, active } from './newbieFeedActions.js'
import { pickAction, perform } from './newbieMonkey.js'

// Массовый прогон «случайные пользователи» (e2e/newbie-crowd.spec.js): профиль человека по seed, его спокойные действия и проверки-инварианты,
// которые должны держаться ВСЕГДА (что бы человек ни делал). Нарушения копятся без остановки теста (запись: что нарушено, на каком действии,
// последние действия), в конце спек падает со всем списком — по нему видно и сид, и шаги.

// Профиль: ширина экрана 375 (iPhone 12 mini) или 412 (Android), звук, группа Пита, первый или второй день, темп, доля «обезьяньих» действий, длительность 60–120 с
export function profileOf(seed) {
  const r = makeRng(seed)
  const width = r.pick([375, 412])
  return {
    seed,
    width,
    height: width === 375 ? 812 : 915,
    sound: r.chance(0.5),
    group: r.chance(0.25) ? 'control' : 'prompts',
    day: r.chance(0.4) ? 2 : 1,
    tempo: r.pick(['fast', 'slow', 'mixed']),
    monkey: r.pick([0.1, 0.25, 0.5, 0.75]),
    durationMs: r.int(60, 120) * 1000,
  }
}

// Пауза «подумал» по темпу: быстрый листает с паузами меньше 1 с (попадает под «слишком быстро»), медленный задерживается на 2–4,5 с
export const pauseOf = (profile, rnd) => {
  const slow = profile.tempo === 'slow' || (profile.tempo === 'mixed' && rnd.chance(0.5))
  return slow ? [2300, 4500] : [250, 900]
}

// Спокойные действия: листает вперёд (реже назад), открывает фразу и трёт перевод, ставит сердечко, тапает по видео
async function calm(page, rnd) {
  const r = rnd()
  if (r < 0.62) { await fingerSwipe(page, 'next', { ms: rnd.int(220, 480) }); return 'свайп вперёд' }
  if (r < 0.74) { await fingerSwipe(page, 'prev', { ms: rnd.int(220, 480) }); return 'свайп назад' }
  if (r < 0.84) { await openPhrase(page); if (rnd.chance(0.7)) await rubPhrase(page); return 'фраза / перевод' }
  if (r < 0.92) { await active(page).locator('.feedHud .feedHudBtn').first().click({ timeout: 1500 }); return 'сердечко' }
  await tapVideo(page)
  return 'пауза видео'
}

// Одно действие человека: «обезьяье» с вероятностью profile.monkey, иначе спокойное. → { name, ok }
export async function act(page, rnd, profile) {
  if (rnd.chance(profile.monkey)) {
    const action = pickAction(rnd)
    return { name: action[1], ok: await perform(page, rnd, action) }
  }
  try { return { name: await calm(page, rnd), ok: true } } catch (e) {
    if (/Timeout|not visible|not attached|detached|intercepts pointer|outside of the viewport|Target page|strict mode violation/i.test(e.message)) return { name: 'спокойное (мимо)', ok: false }
    throw e
  }
}

// ---------- инварианты ----------
// Горизонтальный скролл — та же проверка, что у персон, но без падения: возвращает текст нарушения или null
export async function hscrollProblem(page) {
  try { await expectNoHScroll(page); return null } catch (e) { return String(e.message).split('\n')[0].slice(0, 200) }
}

// Состояние для проверок: шторок Пита на экране (sheets — видимые, sheetsDom — все в DOM), лента видна, вкладка «Память» видна, слов в памяти гостя.
// «Видна» = checkVisibility: другая вкладка прячет ленту через visibility:hidden (shellV2TabHidden), getClientRects у неё остаётся непустым
export const snapshot = page => page.evaluate(() => {
  const vis = el => !!(el && el.checkVisibility({ visibilityProperty: true }))
  let mem = 0
  try { mem = Object.keys(JSON.parse(localStorage.getItem('pithy_guest_memory_v1') ?? '{}')).length } catch { /* битое хранилище */ }
  return {
    sheets: [...document.querySelectorAll('.promptSheet')].filter(vis).length,
    sheetsDom: document.querySelectorAll('.promptSheet').length,
    feedOn: vis(document.querySelector('.feedSlideWrapActive')),
    learnTab: vis(document.querySelector('[data-nav="learn"]')),
    mem,
  }
})

// Инварианты по снимку. offFeedMs — сколько уже человек не на ленте (шторка ленты на другой вкладке допустима лишь мгновение после ухода)
export function invariantProblems(snap, { offFeedMs }) {
  const out = []
  if (snap.sheets > 1) out.push(`две шторки Пита одновременно (${snap.sheets})`)
  if (!snap.feedOn && offFeedMs > 1200 && snap.sheetsDom > 0) out.push(`шторка Пита (promptSheet) висит ${Math.round(offFeedMs)} мс вне ленты`)
  if (snap.learnTab && snap.mem === 0) out.push('вкладка «Память» видна, а слов в памяти нет')
  return out
}
