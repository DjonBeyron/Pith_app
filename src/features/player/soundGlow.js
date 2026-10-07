import { onSoundPlayed } from '../../shared/lib/sounds.js'
import { publishLevel, unpublishLevel } from './audioLevel.js'

// Звуки интерфейса (sounds.js: «верно»/«неверно», XP, новый уровень, закреп,
// закрытый урок) → КОРОТКИЕ импульсы свечения в нижних углах чата
// (audioLevel.js): не дольше MAX_SOUND_SEC независимо от длины файла — свет не
// должен жить дольше ощущения звука. shared/lib фич не импортирует, поэтому
// sounds.js лишь сообщает о старте (`onSoundPlayed`), а огибающую и характер
// (какие полосы: низ/середина/верх) задаём здесь.

// НЕ светим на приход сообщения и «печатает» (три точки): это фон чата, а не
// событие — импульс для них не публикуется вообще
export const SOUND_GLOW_IGNORED = new Set(['message-in', 'typing-1', 'typing-2'])

// Амплитуда и полосы по типу звука: answer-correct — середина-верх, xp-gain —
// верх, level-up — все
export const SOUND_GLOW_AMP = {
  'answer-correct': 0.7,
  'answer-wrong':   0.55,
  'xp-gain':        0.6,
  'level-up':       0.85,
  'pin-message':    0.5,
  'lesson-locked':  0.4,
}
export const SOUND_GLOW_PROFILE = {
  'answer-correct': 'ui-mid',
  'answer-wrong':   'ui-low',
  'xp-gain':        'ui-high',
  'level-up':       'ui-all',
  'pin-message':    'ui-mid',
  'lesson-locked':  'ui-low',
}
export const DEFAULT_SOUND_SEC = 0.35   // длительность ещё не известна (нет метаданных)
export const MAX_SOUND_SEC     = 0.45   // длинный файл (level-up) — импульс всё равно короткий

// Огибающая импульса в момент t (с) от старта: вход за 30 мс, мерцание тела
// и спад на второй половине длительности до нуля; после dur — 0
export function soundImpulse(t, dur, amp) {
  if (!(t >= 0) || !(dur > 0) || t >= dur) return 0
  const head  = Math.min(1, t / 0.03)
  const body  = 0.6 + 0.4 * Math.abs(Math.sin(t * 27))
  const tail  = Math.min(1, (dur - t) / (dur * 0.5))
  return Math.max(0, Math.min(1, amp * head * body * tail))
}

// Подписка на старты звуков; возвращает функцию снятия. now — часы в
// миллисекундах той же шкалы, что timestamp rAF (performance.now)
export function startUiSoundGlow(now = () => performance.now()) {
  const timers = new Map()   // id источника → таймер снятия
  const off = onSoundPlayed((name, duration) => {
    if (SOUND_GLOW_IGNORED.has(name)) return
    const dur = Math.min(duration > 0 ? duration : DEFAULT_SOUND_SEC, MAX_SOUND_SEC)
    const amp = SOUND_GLOW_AMP[name] ?? 0.5
    const id  = `ui:${name}`
    const t0  = now()
    clearTimeout(timers.get(id))
    publishLevel(id, {
      playing: true,
      getLevel: n => soundImpulse((n - t0) / 1000, dur, amp),
      profile: SOUND_GLOW_PROFILE[name] ?? 'ui-mid',
    })
    timers.set(id, setTimeout(() => { timers.delete(id); unpublishLevel(id) }, dur * 1000 + 40))
  })
  return () => {
    off()
    timers.forEach((timer, id) => { clearTimeout(timer); unpublishLevel(id) })
    timers.clear()
  }
}
