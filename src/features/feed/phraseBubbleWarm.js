// Заготовки взрыва облачек «Ловли слов» (без React): всё тяжёлое, что раньше считалось на первом кадре взрыва, готовится
// заранее — в простое после сборки сетки (warmUp) — или, если взрыв пришёл раньше, один раз на старте (prepareExplosion):
//  · скорости и дальность частиц каждого облачка (prepareBubbles: sin/cos + предсказание полёта на сотни частиц);
//  · спрайты ещё не взорванных облачек (buildSprites): пока одно облачко взрывается, остальные висят статичным кадром и
//    рисуются одним drawImage на облачко вместо ~1400 дуг за кадр (drawSprites). Спрайт — картинка облачка с ТЕКУЩИХ
//    фаз (drawFloat с dt=0), строится на старте взрыва: дрейф в этот момент замирает без скачка.

import { PULSE_AMP, WANDER_Y_SCALE, WIGGLE_SECOND_RATIO } from './phraseBubbleConsts.js'
import { drawFloat, prepareBubbles } from './phraseBubbleDraw.js'

// Узлы по облачкам (разреженный массив по номеру региона)
export function groupByRegion(bubbles) {
  const groups = []
  for (const b of bubbles) (groups[b.region] ??= []).push(b)
  return groups
}

// Центр облачка по крайним узлам (без Math.min(...xs) на сотни аргументов)
export function groupCenter(list) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const b of list) {
    if (b.ax < x0) x0 = b.ax
    if (b.ax > x1) x1 = b.ax
    if (b.ay < y0) y0 = b.ay
    if (b.ay > y1) y1 = b.ay
  }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}

function prepareGroup(list) {
  const { cx, cy } = groupCenter(list)
  prepareBubbles(list, cx, cy)
}

// Подготовить скорости всех облачек разом (идемпотентно: повторный вызов, в том числе после warmUp, ничего не делает)
export function prepareExplosion(bubbles) {
  if (bubbles.prepared) return
  bubbles.prepared = true
  for (const list of groupByRegion(bubbles)) if (list) prepareGroup(list)
}

// Готовить в простое по одному облачку за тик таймера (каждое — доли миллисекунды; rIC в Safari нет). Возвращает отмену.
// Взрыв, начавшийся раньше, добирает остальное сам (prepareExplosion) — облачко, подготовленное здесь, повторно не считается
export function warmUp(bubbles) {
  const todo = groupByRegion(bubbles).filter(Boolean)
  let timer = 0
  const step = () => {
    timer = 0
    if (bubbles.prepared) return
    const list = todo.shift()
    if (list) prepareGroup(list)
    if (todo.length) timer = setTimeout(step, 0)
    else bubbles.prepared = true
  }
  timer = setTimeout(step, 0)
  return () => { clearTimeout(timer); timer = 0 }
}

// Спрайты облачек: groups[g] — узлы, only(g) — для каких облачек строить (ещё не взорванные). Спрайт { canvas, x, y, w, h }:
// ограничивающий прямоугольник облачка в координатах холста (целые px — drawImage 1:1 без сглаживания) с запасом на дыхание
// радиуса и размах покачивания каждого узла. mk — фабрика холста (в тестах подменяется)
export function buildSprites(groups, dpr, only = () => true, mk = () => document.createElement('canvas')) {
  return groups.map((list, g) => {
    if (!list || !only(g)) return null
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const b of list) {
      const wander = b.amp * (1 + WIGGLE_SECOND_RATIO)
      const rr = b.r * (1 + PULSE_AMP) + 1
      x0 = Math.min(x0, b.ax - wander - rr); x1 = Math.max(x1, b.ax + wander + rr)
      y0 = Math.min(y0, b.ay - wander * WANDER_Y_SCALE - rr); y1 = Math.max(y1, b.ay + wander * WANDER_Y_SCALE + rr)
    }
    const x = Math.floor(x0), y = Math.floor(y0)
    const w = Math.ceil(x1) - x, h = Math.ceil(y1) - y
    const canvas = mk()
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, -x * dpr, -y * dpr)
    drawFloat(ctx, list, 0)
    return { canvas, x, y, w, h }
  })
}

// Нарисовать спрайты ещё не взорванных облачек (pending — Set номеров) одним drawImage на облачко
export function drawSprites(ctx, sprites, pending) {
  for (const g of pending) {
    const s = sprites[g]
    if (s) ctx.drawImage(s.canvas, s.x, s.y, s.w, s.h)
  }
}
