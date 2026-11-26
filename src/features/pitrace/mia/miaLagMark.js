// Метки анимаций Мии для трассера лагов (shared/lib/lagTrace.js): в журнал «[lag-mark] Мия: …» в момент начала каждого движения — падение коробки, прыжок на коробку, посадка, уход с коробкой за экран,
// прыжок одной. Длинный кадр во время движения трассер подпишет этой меткой («Мия: уход с коробкой за экран (идёт 240 мс)»). Чистая логика: шаг эпизода по позе кадра; запись — только на смене шага.
import { lagMark } from '../../../shared/lib/lagTrace.js'
import { ARR, LEAVE, SOLO } from './miaMotion.js'

/** Шаг эпизода по кадру: leaving — идёт уход, mode — режим часов RaceMia (arr / solo / rave / stuck / lv), flight — Мия в полёте на коробку, shown — коробка видна */
export const miaStep = (leaving, mode, flight, shown) => (leaving ? 'leave' : mode === 'solo' ? 'solo' : flight ? 'jump' : shown ? 'box' : '')

const MS = n => Math.round(n * 1000)
/** Подпись и длительность смены шага prev → step (alone — коробка отлетает без Мии); null — отмечать нечего */
export function miaStepMark(prev, step, alone = false) {
  if (step === 'leave') return alone ? ['коробка отлетает без Мии', MS(LEAVE.END)] : ['Мия: уход с коробкой за экран', MS(LEAVE.END)]
  if (step === 'solo') return ['Мия: прыжок одна за экран', MS(SOLO.END)]
  if (step === 'jump') return ['Мия: прыжок на коробку', MS(ARR.JUMP_LEN)]
  if (step === 'box' && prev === 'jump') return ['Мия: посадка на коробку', 600]
  if (step === 'box' && prev === '') return ['Мия: коробка падает на Пита', MS(ARR.FALL + 0.4)]
  return null
}

/** Отметить смену шага (зовётся из кадра RaceMia, только когда шаг сменился) */
export function markMiaStep(prev, step, alone) { const m = miaStepMark(prev, step, alone); if (m) lagMark(m[0], m[1]) }
