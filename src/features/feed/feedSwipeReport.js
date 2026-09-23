import { swipeTraceRaw, swiperMisalign } from './feedSwipeTrace.js'

// Текстовый отчёт трассировщика ленты (feedSwipeTrace.js) для DBG-панели:
// состояние Swiper сейчас → счётчики и аномалии → хронология событий.
// Аномалии помечены ⚠ — их и ищут, когда лента «летит» или «дёргается».

export function swipeTraceReport() {
  const { events, counts, swiper: s } = swipeTraceRaw()
  const state = s && !s.destroyed
    ? `слайд ${s.activeIndex} из ${s.virtual?.slides?.length ?? '?'}, высота ${s.size}px, translate ${s.translate.toFixed(1)}, мимо слайда ${swiperMisalign(s).toFixed(1)}px, анимация ${s.animating ? 'идёт' : 'нет'}, касание разрешено ${s.allowTouchMove}`
    : 'Swiper не смонтирован'
  const anomalies = ['ПОЛЁТ', 'ПРОСКОК', 'ПЕРЕКОС', 'ЗАВИСАНИЕ', 'СКРЫТАЯ ПОЕХАЛА']
    .map(k => `${k}: ${counts[k] || 0}`).join(', ')
  const plain = ['касаний', 'свайпов', 'тапов', 'смен слайда']
    .map(k => `${k}: ${counts[k] || 0}`).join(', ')
  return [
    `сейчас: ${state}`,
    `${plain}`,
    `аномалии: ${anomalies}`,
    '',
    'события (последние 80):',
    ...events.slice(-80).map(e =>
      `  [${(e.t / 1000).toFixed(2)}] ${e.anomaly ? '⚠ ' : ''}${e.kind} ${e.text}${e.n > 1 ? ` ×${e.n}` : ''} @слайд=${e.idx}`),
  ].join('\n')
}
