import { feedSwiper, isVisible, sleep } from './feedMonkeyActions.js'

// Проверки «обезьяны» после каждого действия (см. feedMonkey.js).
// Возвращают список нарушений — пустой, если лента в порядке.

const FLIGHT_GAP_MS = 100

// Лента на экране: открыта вкладка «Уроки», вид «Рекомендации», не экран модуля
export function feedOnScreen() {
  const sw = feedSwiper()
  return !!sw && isVisible(sw.el)
}

// Ждём, пока анимация Swiper закончится (или сдаёмся — это само по себе баг)
export async function settle(maxMs = 1500) {
  const t0 = performance.now()
  while (performance.now() - t0 < maxMs) {
    const sw = feedSwiper()
    if (!sw || !sw.animating) return true
    await sleep(40)
  }
  return false
}

// Наблюдатель за сменами слайда — свой, независимый от трассировщика ленты
// (в dev-режиме у модулей может быть две копии): ловит полёт и проскоки
export function createWatcher() {
  const changes = []
  let bound = null
  const onChange = s => changes.push({ t: performance.now(), from: s.previousIndex, to: s.activeIndex })
  return {
    // Swiper пересоздаётся (экран модуля размонтирует ленту) — перепривязка
    bind() {
      const sw = feedSwiper()
      if (sw === bound) return
      if (bound && !bound.destroyed) bound.off('slideChange', onChange)
      bound = sw
      if (sw) sw.on('slideChange', onChange)
    },
    unbind() { if (bound && !bound.destroyed) bound.off('slideChange', onChange); bound = null },
    take() { return changes.splice(0, changes.length) },
  }
}

// Серия смен: полёт (3 подряд в одну сторону быстрее 100мс) и проскоки
function checkChanges(changes, maxStep) {
  const out = []
  let run = 1
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i]
    const d = c.to - c.from
    if (Math.abs(d) > 1 && Math.abs(d) < 20) out.push(`ПРОСКОК ${c.from} → ${c.to}`)
    const p = changes[i - 1]
    run = p && Math.sign(d) === Math.sign(p.to - p.from) && c.t - p.t < FLIGHT_GAP_MS ? run + 1 : 1
    if (run === 3) out.push(`ПОЛЁТ: 3 смены быстрее ${FLIGHT_GAP_MS}мс до ${c.to}`)
  }
  // Переносы круга (±десятки слайдов) — наши, программные, их не считаем
  const moved = changes.filter(c => Math.abs(c.to - c.from) === 1).length
  if (maxStep >= 0 && moved > maxStep) out.push(`СЛАЙДОВ БОЛЬШЕ ОЖИДАНИЯ: ${moved} при максимуме ${maxStep}`)
  return out
}

function checkVideos(onScreen) {
  const out = []
  const playing = [...document.querySelectorAll('video')].filter(v => !v.paused && !v.ended && v.readyState > 1)
  const inFeed = playing.filter(v => v.closest('.feedSwiper'))
  if (inFeed.length > 1) out.push(`ИГРАЮТ ${inFeed.length} ВИДЕО ЛЕНТЫ СРАЗУ`)
  if (onScreen) {
    const stray = inFeed.filter(v => !v.closest('.feedSlideWrapActive'))
    if (stray.length) out.push('ИГРАЕТ ВИДЕО НЕ АКТИВНОГО СЛАЙДА')
  } else if (inFeed.length) {
    out.push('ИГРАЕТ ВИДЕО СКРЫТОЙ ЛЕНТЫ')
  }
  return out
}

// Полная проверка после действия.
// ctx: { changes, maxStep, hiddenIdx } — hiddenIdx: слайд, на котором ленту спрятали
export function checkFeed(ctx) {
  const out = []
  const sw = feedSwiper()
  const onScreen = feedOnScreen()
  out.push(...checkChanges(ctx.changes, ctx.maxStep))
  if (sw && !sw.destroyed) {
    if (onScreen) {
      const want = sw.slidesGrid?.[sw.activeIndex] ?? 0
      const off = Math.abs(-sw.translate - want)
      if (!sw.animating && off > 1) out.push(`ПЕРЕКОС ${off.toFixed(1)}px на слайде ${sw.activeIndex}`)
      if (!sw.allowTouchMove) out.push('ЛЕНТА НА ЭКРАНЕ, НО ЖЕСТЫ ВЫКЛЮЧЕНЫ')
      const total = sw.virtual?.slides?.length ?? 0
      if (sw.activeIndex < 0 || sw.activeIndex >= total) out.push(`СЛАЙД ВНЕ КРУГА ${sw.activeIndex}/${total}`)
      if (!document.querySelector('.feedSlideWrapActive')) out.push('НЕТ АКТИВНОГО СЛАЙДА В DOM')
    } else {
      if (sw.allowTouchMove) out.push('СКРЫТАЯ ЛЕНТА ПРИНИМАЕТ ЖЕСТЫ')
      if (ctx.hiddenIdx != null && sw.activeIndex !== ctx.hiddenIdx) {
        out.push(`СКРЫТАЯ ПОЕХАЛА ${ctx.hiddenIdx} → ${sw.activeIndex}`)
      }
    }
  }
  out.push(...checkVideos(onScreen))
  return out
}
