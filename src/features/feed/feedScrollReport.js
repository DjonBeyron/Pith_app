import { scrollTraceRaw } from './feedScrollTrace.js'

// Текстовый отчёт трассировщика скролла (feedScrollTrace.js) для DBG-панели.
// Читается сверху вниз: сводка → строка на каждый жест → подробные кадры первых
// свайпов (там и живёт жалоба «дёргается в начале») → лента событий.

const px = v => (v >= 0 ? '+' : '') + v.toFixed(0)

// Одна строка на жест. Всё, что не ноль — уже подозрение, поэтому нулевые
// поля не печатаем: строка остаётся короткой и глазами видно только плохое
function gestureLine(g, h) {
  const parts = [
    `#${g.n} t=${(g.t / 1000).toFixed(2)}`,
    `${g.start.toFixed(0)}→${g.end.toFixed(0)} (${px(g.end - g.start)}px = ${g.slides.toFixed(2)} слайда)`,
    `${g.dur.toFixed(0)}мс кадров=${g.frames}`,
  ]
  if (g.worstDt > 0) parts.push(`худший кадр=${g.worstDt.toFixed(0)}мс${g.jank ? ` (пропусков ${g.jank})` : ''}`)
  if (g.maxStep) parts.push(`макс.шаг=${px(g.maxStep)}px`)
  if (g.rev) parts.push(`ОТСКОК×${g.rev}${g.revFree ? ` (без пальца ${g.revFree})` : ''} макс ${g.revMax.toFixed(0)}px`)
  if (g.teleports) parts.push(`ТЕЛЕПОРТ×${g.teleports}`)
  if (g.resizes) parts.push(`RESIZE×${g.resizes} (viewH ${g.viewH0}→${g.viewH1})`)
  if (g.liftTop !== null) parts.push(`после отрыва=${px(g.end - g.liftTop)}px`)
  if (g.wheel) parts.push(`колесо×${g.wheel}`)
  const off = Math.abs(g.align)
  parts.push(`перекос=${off < 1 ? '0' : px(g.align)}px${off > h * 0.02 ? ' ⚠НЕ ДОСНЭПЛЕНО' : ''}`)
  return parts.join(' ')
}

// Покадровая расшифровка: dt/dy, П — палец на экране. Видно ровно, на каком
// кадре лента поехала назад и был ли в этот момент провал по времени кадра
function stepsLine(g) {
  const s = g.steps.map(x => `${x.dt}/${x.dy >= 0 ? '+' : ''}${x.dy}${x.f ? 'П' : ''}`).join(' ')
  return `  #${g.n} кадры (dt/dy, П=палец): ${s}`
}

export function scrollTraceReport() {
  const { meta, events, gestures, live, touching } = scrollTraceRaw()
  const h = meta.viewH || 1
  const all = live ? [...gestures, live] : gestures
  const bad = gestures.filter(g => g.rev > 0)
  const janky = gestures.filter(g => g.jank > 0)
  const misaligned = gestures.filter(g => Math.abs(g.align) > h * 0.02)
  // Свайп вхолостую: лента заметно поехала, но вернулась на тот же слайд.
  // Именно это пользователь и называет «дёрганьем» — свайпнул, дёрнулось,
  // ничего не перелистнулось
  const idle = gestures.filter(g => Math.abs(g.slides) < 0.5 && Math.abs(g.maxStep) > h * 0.1)
  const out = [
    `viewH=${meta.viewH} len=${meta.len} cycles=${meta.cycles} палец=${touching}`,
    `жестов: ${gestures.length}${live ? ' (+1 идёт сейчас)' : ''}, с отскоком: ${bad.length}, с пропуском кадров: ${janky.length}, не доснэплено: ${misaligned.length}, вхолостую (дёрнулось и вернулось): ${idle.length}`,
    '',
    'жесты (последние 12):',
    ...(all.length
      ? all.slice(-12).map(g => (g === live ? '· идёт: ' : '  ') + gestureLine(g, h))
      : ['  (ещё не листали — свайпни ленту и жми «Обновить»; события старта ниже пишутся всегда)']),
    '',
    'кадры первых 3 жестов:',
    ...gestures.slice(0, 3).map(stepsLine),
  ]
  // Плюс покадровая запись худшего жеста — если он не попал в первую тройку
  const worst = bad.concat(janky).sort((a, b) => (b.revMax + b.worstDt) - (a.revMax + a.worstDt))[0]
  if (worst && worst.n > 3) out.push('кадры худшего жеста:', stepsLine(worst))
  out.push('', 'события скролла:')
  // Сортировка по времени, а не по порядку записи: в dev-режиме Vite модуль
  // трассировщика может ожить в двух копиях, и хронология визуально рвётся
  const byTime = [...events].sort((a, b) => a.t - b.t)
  out.push(...byTime.slice(-60).map(e => `  [${(e.t / 1000).toFixed(2)}] ${e.kind} ${e.text} @top=${e.top.toFixed(0)} scrollH=${e.sh}`))
  return out.join('\n')
}
