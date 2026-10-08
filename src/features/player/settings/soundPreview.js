import { playSound } from '../../../shared/lib/sounds.js'

// Проигрыш звука при движении админского ползунка: не чаще PLAY_GAP мс.
// Первое движение играет сразу (оно внутри жеста — важно для iOS), дальше —
// последнее положение доигрывается «хвостом». Пользовательские выключатели
// шестерёнки («Звук печатанья», «Звук получения XP») превью не гасят: иначе
// ползунок этих звуков молчал бы у того, кто их выключил себе (ignoreFilter)
export const PLAY_GAP = 250

let lastPlay = 0
let trail = 0

export function previewSound(name, now = () => Date.now()) {
  clearTimeout(trail)
  const go = () => { lastPlay = now(); playSound(name, 'админ-ползунок', { ignoreFilter: true }) }
  const wait = PLAY_GAP - (now() - lastPlay)
  if (wait <= 0) go()
  else trail = setTimeout(go, wait)
}

export function cancelSoundPreview() { clearTimeout(trail) }
