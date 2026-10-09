// «Окно тишины» для звуков ПРИЛОЖЕНИЯ на время записи голоса («Сказать фразу»). Ученик слышит системные сигналы
// распознавания (iOS/Android «динь» в начале и конце записи) — любой наш звук рядом с ними он принимает за них же.
// Поэтому от тапа на микрофон до показа результата (+ короткий хвост) playSound() ничего не играет.
// Системные сигналы этим НЕ отключаются (веб-страница ими управлять не может) — убираем только свои.
//  - holdSoundQuiet() → release(): счётчик удержаний, несколько владельцев не мешают друг другу;
//  - пока окно открыто, playSound() отдаёт звук сюда (suppressSound): message-in и xp-gain откладываются и играют ОДИН раз
//    после закрытия окна, остальные (печатанье, «верно»/«неверно» и т.п.) в эту минуту не нужны — отбрасываются;
//  - suppressedCount() — сколько звуков окно проглотило (для админской строки модуля).
// Второй флаг — «полная тишина» (holdSilence(reason) / releaseSilence(reason)): вкладка админки «Голос» и т.п. Пока он взят, МОЛЧИТ ВСЁ: playSound (без отложенных
// повторов), озвучка слов, беззвучный wav «разблокировки звука» (primedAudio) и разблокировка по касанию (sounds.js onGesture) — любое воспроизведение страницей
// на iOS переключает категорию аудиосессии, и следующее распознавание речи может оказаться «глухим» (см. soundLog.js, PROJECT.md «Надёжность второго запуска»).
// isMicBusy() = открыто окно записи ИЛИ взята полная тишина: по нему разблокировки звука не запускаются.
// Файл без импортов: sounds.js его читает, плеер и панель пишут.
const DEFER_NAMES = new Set(['message-in', 'xp-gain'])
const holds = new Set()
const silences = new Map() // причина → сколько удержаний
const deferred = new Map() // имя звука → replay() (последний запрос, по одному на имя)
let dropped = 0

export const isSoundQuiet = () => holds.size > 0
export const suppressedCount = () => dropped

/** Полная тишина: пока есть хоть одно удержание, не играет ничего и не разблокируется */
export const isSilenced = () => silences.size > 0
/** Идёт запись голоса (окно тишины) или полная тишина — разблокировки звука (беззвучный wav, resume контекста) запрещены */
export const isMicBusy = () => holds.size > 0 || silences.size > 0
export const silenceReasons = () => [...silences.keys()]

/** Взять полную тишину по причине reason. Возвращает release() (повторный вызов безопасен); то же делает releaseSilence(reason) */
export function holdSilence(reason = 'tab') {
  silences.set(reason, (silences.get(reason) ?? 0) + 1)
  let done = false
  return () => { if (!done) { done = true; releaseSilence(reason) } }
}
/** Снять одно удержание полной тишины по причине (нет такого — ничего) */
export function releaseSilence(reason = 'tab') {
  const n = silences.get(reason)
  if (n == null) return
  if (n <= 1) silences.delete(reason); else silences.set(reason, n - 1)
}

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
  if (silences.size) { dropped += 1; return true } // полная тишина: ничего не откладываем
  if (!holds.size) return false
  dropped += 1
  if (DEFER_NAMES.has(name)) deferred.set(name, replay)
  return true
}

/** Только для тестов */
export function _resetSoundQuiet() { holds.clear(); silences.clear(); deferred.clear(); dropped = 0 }
