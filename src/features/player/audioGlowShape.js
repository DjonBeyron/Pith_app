// Форма свечения снизу чата (AudioGlow.jsx) — чистая математика, отдельно от
// компонента (react-refresh не любит не-компонентные экспорты в .jsx).
//
// Свечение читается как ОДНОРОДНАЯ масса света у нижней кромки, а не как
// столбики: узлы шире шага сетки (BAR_SPAN шагов, перекрытие ~140 %), у
// каждого — мягкий эллиптический градиент (audio-glow.css), так что соседи
// сливаются. Яркость по горизонтали «гуляет»: формы соседних узлов гладкие по
// индексу (фаза растёт с позицией), а не псевдослучайные — иначе между узлами
// читались бы вертикальные полосы. Самые яркие места — текущий фиолетовый
// (#a78bfa), тусклые — он же с меньшей opacity.
export const BAR_COUNT = 16
export const BAR_SPAN  = 2.4   // ширина узла в шагах сетки

export const BARS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const step = 100 / BAR_COUNT
  return {
    left:  (i + 0.5) * step - step * BAR_SPAN / 2,   // % от ширины слоя
    width: step * BAR_SPAN,
    u:     (i / (BAR_COUNT - 1)) * 6.283,            // позиция 0..2π
    edge:  0.62 + 0.38 * Math.sin(Math.PI * (i + 0.5) / BAR_COUNT), // края ниже
  }
})

// Минимальная высота узла: масса не пропадает в паузах речи, лишь тускнеет
export const MIN_SCALE = 0.12
export const MIN_ALPHA = 0.35

// Форма узла i при уровне речи level (0..1) в момент t (секунды):
// scale — высота (scaleY 0..1), alpha — яркость (opacity MIN_ALPHA..1).
// wander — медленные волны яркости, бегущие вдоль низа в разные стороны;
// jitter — быстрая дрожь речи; обе гладкие по соседям
export function barShape(i, level, t) {
  const b = BARS[i]
  const wander = 0.5 + 0.3 * Math.sin(t * 1.7 + b.u * 1.5) + 0.2 * Math.sin(-t * 2.9 + b.u * 2.7 + 1.3)
  const jitter = 0.5 + 0.5 * Math.sin(t * 7.3 + b.u * 2.2 + 0.7)
  const lift   = 0.25 + 0.75 * level
  const scale  = Math.min(1, Math.max(MIN_SCALE, lift * (0.62 + 0.28 * wander + 0.14 * jitter) * b.edge))
  const alpha  = MIN_ALPHA + (1 - MIN_ALPHA) * Math.min(1, level * (0.45 + 0.65 * wander))
  return { scale, alpha }
}

// Сдвиг подложки (% ширины, 0..-50): её горизонтальный градиент периодичен
// по половине ширины, поэтому translateX по кругу бесшовен
export function baseShift(t) {
  return -((t * 4) % 50)
}
