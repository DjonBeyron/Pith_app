import { useLayoutEffect, useState } from 'react'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'
import { pickAllowed, SCENE_LIVE_CAP, SCENE_LIVE_CAP_WEAK } from './sceneNearModel.js'

// Общая пара IntersectionObserver на всё приложение (а не по наблюдателю на
// сцену): `wide` — зона запаса вокруг экрана, `view` — сам экран. Нужны оба: сцена,
// попавшая в запас четвёртой, но потом доехавшая до экрана БЕЗ нового пересечения
// границы запаса, иначе осталась бы плашкой на виду (событие даёт `view`).
// Подписчики — замороженные сцены (история/доигравшие); живая сцена сюда не попадает.
const subs = new Map() // el -> { set, near, allowed }
let wide = null
let view = null

// Сосед из запаса (extra) рисуется не разом со всеми, а по одному на кадр: монтаж
// ~190 узлов × несколько сцен за один кадр на слабом телефоне — это и есть рывок скролла
const pending = new Set()
let raf = 0
function drainOne() {
  raf = 0
  const el = pending.values().next().value
  if (el === undefined) return
  pending.delete(el)
  const s = subs.get(el)
  if (s && s.allowed !== true) { s.allowed = true; s.set(true) }
  if (pending.size) raf = requestAnimationFrame(drainOne)
}

function recompute() {
  const vh = window.innerHeight
  const items = []
  for (const [el, s] of subs) {
    if (!s.near) continue
    const r = el.getBoundingClientRect()
    items.push({ id: el, top: r.top, bottom: r.bottom, near: true })
  }
  const allowed = pickAllowed(items, { vh, cap: isWeakDevice() ? SCENE_LIVE_CAP_WEAK : SCENE_LIVE_CAP })
  for (const [el, s] of subs) {
    const how = allowed.get(el)
    if (how === undefined) {
      pending.delete(el)
      if (s.allowed !== false) { s.allowed = false; s.set(false) }
    } else if (how === 'view') {
      pending.delete(el)
      if (s.allowed !== true) { s.allowed = true; s.set(true) }
    } else if (s.allowed !== true) {
      pending.add(el)
      if (s.allowed === null) s.allowed = false
    }
  }
  if (pending.size && !raf) raf = requestAnimationFrame(drainOne)
}

function ensureObservers() {
  if (wide) return
  const onWide = entries => { for (const e of entries) { const s = subs.get(e.target); if (s) s.near = e.isIntersecting } recompute() }
  const onView = () => recompute()
  wide = new IntersectionObserver(onWide, { rootMargin: '50% 0px', threshold: 0 })
  view = new IntersectionObserver(onView, { threshold: 0 })
}

// Подписка: el сразу получает ответ (синхронно, до кадра), дальше — по событиям
export function watchSceneNear(el, set) {
  ensureObservers()
  const r = el.getBoundingClientRect()
  const vh = window.innerHeight
  const near = r.bottom > -vh * 0.5 && r.top < vh * 1.5
  subs.set(el, { set, near, allowed: null })
  wide.observe(el)
  view.observe(el)
  recompute()
  return () => {
    subs.delete(el)
    pending.delete(el)
    wide?.unobserve(el)
    view?.unobserve(el)
    if (!subs.size && raf) { cancelAnimationFrame(raf); raf = 0 }
    if (!subs.size && wide) { wide.disconnect(); view.disconnect(); wide = null; view = null }
  }
}

export function sceneNearWatchers() {
  return subs.size
}

// Рисовать ли SVG замороженной сцены. enabled=false — сцена живая, подписки нет.
// Без IntersectionObserver (SSR, тесты, старые WebView) — рисуем всегда
export function useSceneNear(rootRef, enabled) {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return undefined
    return watchSceneNear(el, setNear)
  }, [rootRef, enabled])
  return near
}
