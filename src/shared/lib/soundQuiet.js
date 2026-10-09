// «Окно тишины» для звуков ПРИЛОЖЕНИЯ на время записи голоса («Сказать фразу»). Ученик слышит системные сигналы
// распознавания (iOS/Android «динь» в начале и конце записи) — любой наш звук рядом с ними он принимает за них же.
// Поэтому от тапа на микрофон до показа результата (+ короткий хвост) playSound() ничего не играет.
// Системные сигналы этим НЕ отключаются (веб-страница ими управлять не может) — убираем только свои.
//  - holdSoundQuiet() → release(): счётчик удержаний, несколько владельцев не мешают друг другу;
//  - пока окно открыто, playSound() отдаёт звук сюда (suppressSound): message-in и xp-gain откладываются и играют ОДИН раз
//    после закрытия окна, остальные (печатанье, «верно»/«неверно» и т.п.) в эту минуту не нужны — отбрасываются;
//  - suppressedCount() — сколько звуков окно проглотило (для админской строки модуля).
// Файл без импортов: sounds.js его читает, плеер и панель пишут.
const DEFER_NAMES = new Set(['message-in', 'xp-gain'])
const holds = new Set()
const deferred = new Map() // имя звука → replay() (последний запрос, по одному на имя)
let dropped = 0

export const isSoundQuiet = () => holds.size > 0
export const suppressedCount = () => dropped

/** Открыть окно тишины. Возвращает release() (повторный вызов безопасен); когда закрылось последнее удержание — играют отложенные */
export function holdSoundQuiet() {
  const token = {}
  holds.add(token)
  return () => {
    if (!holds.delete(token) || holds.size) return
    const replay = [...deferred.values()]
    deferred.clear()
    replay.forEach(fn => { try { fn() } catch { /* звук необязателен */ } })
  }
}

/** Для playSound(): true — окно открыто, звук перехвачен (replay сыграет его позже, если он из отложенных) */
export function suppressSound(name, replay) {
  if (!holds.size) return false
  dropped += 1
  if (DEFER_NAMES.has(name)) deferred.set(name, replay)
  return true
}

/** Только для тестов */
export function _resetSoundQuiet() { holds.clear(); deferred.clear(); dropped = 0 }
