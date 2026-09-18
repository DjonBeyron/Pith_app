import { Play, Pause } from 'lucide-react'

// Мелочь голосового сообщения, не зависящая от его состояния: размеры полос
// спектра, поиск самого громкого места записи и поиск самого громкого места. Вынесено
// из AudioModule.jsx — тот упёрся в потолок 400 строк, а здесь своя
// ответственность: как волна и кнопка ВЫГЛЯДЯТ, без единого знания о том,
// что сейчас играет.

// Базовые высоты полос: рисунок «спектра» до того, как посчитан настоящий.
// Массив, а не генератор: набор подобран на глаз, чтобы неозвученный пузырь
// не выглядел ни ровным забором, ни случайным шумом
export const WAVE_H_BASE = [7,11,16,22,14,19,24,17,10,20,13,22,18,11,25,21,15,9,18,24,16,12,21,14,19,10,17,23,15,9,13,19,21,14,17,24,11,18,22,15,10,19,13,25,16,9,20,23,12,17]
export const BAR_W = 2, BAR_GAP = 2
export const ACCENT = '#b6fe3b'

// Индекс центра самого громкого короткого участка записи (окно, а не
// одиночный сэмпл — иначе один щелчок/вдох решал бы, где заморозить кадр).
// wd — RMS-амплитуда 0..255 по кадрам (analyzeWaveform, 30 кадров/с).
export function loudestFrameIndex(wd, win = 9) {
  const w = Math.min(win, wd.length)
  let sum = 0
  for (let i = 0; i < w; i++) sum += wd[i]
  let bestSum = sum, bestCenter = Math.floor((w - 1) / 2)
  for (let start = 1; start <= wd.length - w; start++) {
    sum += wd[start + w - 1] - wd[start - 1]
    if (sum > bestSum) { bestSum = sum; bestCenter = start + Math.floor((w - 1) / 2) }
  }
  return bestCenter
}

// Сколько баров РЕАЛЬНО видно в дорожке (та обрезана overflow:hidden), а не
// формально существует в массиве рефов — barElsRef.current.length может
// отставать от настоящей вёрстки (пересчёт ширины ResizeObserver-ом ещё не
// докатился до рендера) или содержать «дыры» после смены плотности баров.
// Считаем один раз в момент старта воспроизведения (не на каждый кадр в
// tick() — getBoundingClientRect() форсирует reflow, дорого на 60fps) и
// дальше используем как знаменатель заливки — иначе прогресс считался от
// числа, которого ученик не видит, и зелёная полоса «доходила до края»
// задолго до конца записи
export function measureBarVisibility(waveRowRef, barElsRef) {
  const row = waveRowRef.current
  const all = barElsRef.current
  if (!row) return { visible: all.filter(Boolean).length, clipped: 0, hidden: 0, rowWidth: 0, rowRight: 0, lastBarRight: 0, barCount: all.length }
  const rowRect = row.getBoundingClientRect()
  let visible = 0, clipped = 0, hidden = 0, lastBarRight = 0
  for (const bar of all) {
    if (!bar) continue
    const r = bar.getBoundingClientRect()
    lastBarRight = r.right
    if (r.right <= rowRect.right + 0.5) visible++
    else if (r.left < rowRect.right) clipped++
    else hidden++
  }
  return { visible, clipped, hidden, rowWidth: rowRect.width, rowRight: rowRect.right, lastBarRight, barCount: all.length }
}
