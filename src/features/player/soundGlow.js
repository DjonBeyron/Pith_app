import { onSoundPlayed } from '../../shared/lib/sounds.js'
import { publishLevel, unpublishLevel } from './audioLevel.js'

// Звуки интерфейса (sounds.js: сообщение учителя, «верно»/«неверно», XP,
// «печатает», новый уровень, закреп, закрытый урок) → короткие импульсы
// свечения снизу чата (audioLevel.js). shared/lib фич не импортирует, поэтому
// sounds.js лишь сообщает о старте (`onSoundPlayed`), а огибающую на
// длительность файла синтезируем здесь: волны у mp3 нет, и Web Audio нельзя
// (на iOS он ломает категорию вывода, см. audioLevel.js).

// Амплитуда импульса по типу звука: заметнее — «верно» и новый уровень,
// тише — «печатает»
export const SOUND_GLOW_AMP = {
  'message-in':     0.5,
  'answer-correct': 0.7,
  'answer-wrong':   0.55,
  'xp-gain':        0.6,
  'level-up':       0.85,
  'pin-message':    0.5,
  'typing-1':       0.3,
  'typing-2':       0.2,
  'lesson-locked':  0.4,
}
export const DEFAULT_SOUND_SEC = 0.6   // длительность ещё не известна (нет метаданных)
const MAX_SOUND_SEC = 2.5              // длинный файл (level-up) — импульс не тянем дольше

// Огибающая импульса в момент t (с) от старта: вход за 40 мс, мерцание тела
// и спад на второй половине длительности до нуля; после dur — 0
export function soundImpulse(t, dur, amp) {
  if (!(t >= 0) || !(dur > 0) || t >= dur) return 0
  const head  = Math.min(1, t / 0.04)
  const body  = 0.6 + 0.4 * Math.abs(Math.sin(t * 27))
  const tail  = Math.min(1, (dur - t) / (dur * 0.5))
  return Math.max(0, Math.min(1, amp * head * body * tail))
}

// Подписка на старты звуков; возвращает функцию снятия. now — часы в
// миллисекундах той же шкалы, что timestamp rAF (performance.now)
export function startUiSoundGlow(now = () => performance.now()) {
  const timers = new Map()   // id источника → таймер снятия
  const off = onSoundPlayed((name, duration) => {
    const dur = duration > 0 ? Math.min(duration, MAX_SOUND_SEC) : DEFAULT_SOUND_SEC
    const amp = SOUND_GLOW_AMP[name] ?? 0.5
    const id  = `ui:${name}`
    const t0  = now()
    clearTimeout(timers.get(id))
    publishLevel(id, { playing: true, getLevel: n => soundImpulse((n - t0) / 1000, dur, amp) })
    timers.set(id, setTimeout(() => { timers.delete(id); unpublishLevel(id) }, dur * 1000 + 80))
  })
  return () => {
    off()
    timers.forEach((timer, id) => { clearTimeout(timer); unpublishLevel(id) })
    timers.clear()
  }
}
