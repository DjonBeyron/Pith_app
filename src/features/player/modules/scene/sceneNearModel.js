// Чистая логика «какие замороженные сцены ленты рисуют SVG» (useSceneNear.js).
//
// Замороженная сцена (история / доигравшая) — статичный кадр ~190 DOM-узлов.
// В длинном уроке таких десятки, а нужны на глаз 1–3: остальным хватает пустой
// плашки той же высоты (SceneBody.jsx). Правило:
//  · всё, что пересекает экран, рисуется всегда (иначе ученик увидит плашку);
//  · из зоны запаса вокруг экрана (rootMargin в useSceneNear.js) рисуем ещё
//    ближайших к центру экрана ровно столько, чтобы вместе с видимыми вышло не больше
//    `cap` — это и есть бюджет «живых SVG-сцен» (PROJECT.md → «Целевые устройства и производительность»).

export const SCENE_LIVE_CAP = 3      // бюджет: сколько SVG-сцен одновременно в DOM (видимые + ближайшие соседи)
export const SCENE_LIVE_CAP_WEAK = 2 // слабое устройство (Mali-G72 и ниже): видимые + один сосед

// items: [{ id, top, bottom, near }] — координаты относительно окна, near — в зоне запаса.
// Возвращает Map id → 'view' (пересекает экран) | 'extra' (сосед из запаса). 'view' рисуется
// сразу и всегда, 'extra' — по очереди, по кадру на сцену (useSceneNear.js)
export function pickAllowed(items, { vh, cap = SCENE_LIVE_CAP } = {}) {
  const allowed = new Map()
  const rest = []
  for (const it of items) {
    if (!it.near) continue
    if (it.bottom > 0 && it.top < vh) allowed.set(it.id, 'view')
    else rest.push(it)
  }
  const mid = vh / 2
  const dist = it => Math.abs((it.top + it.bottom) / 2 - mid)
  rest.sort((a, b) => dist(a) - dist(b))
  for (const it of rest.slice(0, Math.max(0, cap - allowed.size))) allowed.set(it.id, 'extra')
  return allowed
}

// Что рисовать в рамке сцены:
//  'live'        — живой рендерер с режиссёром (ещё не доигравшая сцена, предрисовка за экраном);
//  'static'      — статичный кадр последней реплики (0 анимаций, без режиссёра/аудио/наблюдателей);
//  'placeholder' — плашка той же высоты, ≤ 3 узлов (замороженная и далеко от экрана).
// isHistory — нода истории; ended — сцена доиграла (защёлка useScenePlayback → SceneBubbleView)
export function sceneFrameKind({ isHistory = false, ended = false, near = true } = {}) {
  if (!isHistory && !ended) return 'live'
  return near ? 'static' : 'placeholder'
}
