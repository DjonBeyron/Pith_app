// Порядок реакции на «Сказать фразу» с голосовым: ответ ученика → сообщение Пита («так-так, дай послушать») → ЗВУЧИТ голос ученика → дальше Пит.
// Раньше своя запись играла через 350 мс после пузыря — до того, как Пит что-то сказал, и следующее сообщение Пита могло её перебить.
// Теперь автозапуск ждёт ближайшего показа ноды после ответа (revealNode → notifyNodeRevealed), а граф держит следующее сообщение, пока клип играет
// (ownVoiceBusy → useGraphPlayer.tryReveal). Модуль без React — общий мост между пузырём ученика и графом.
export const OWN_VOICE_FALLBACK_MS = 4000 // следующей ноды так и не было — играем сами
export const OWN_VOICE_HOLD_PAD_MS = 800  // запас к длине клипа: hold снимается раньше, если клип кончился (markOwnVoiceDone)

let pending = null
let busyUntil = 0

// start() вызовется ОДИН раз: на показе следующей ноды либо через fallbackMs. Возвращает отмену (размонтирование пузыря)
export function armOwnVoice(start, fallbackMs = OWN_VOICE_FALLBACK_MS) {
  const entry = { start, timer: null }
  entry.timer = setTimeout(() => fire(entry), fallbackMs)
  pending = entry
  return () => { clearTimeout(entry.timer); if (pending === entry) pending = null }
}

function fire(entry) {
  clearTimeout(entry.timer)
  if (pending === entry) pending = null
  entry.start()
}

// Граф показал ноду — свой голос ученика, ждавший очереди, начинается
export function notifyNodeRevealed() {
  if (pending) fire(pending)
}

export function markOwnVoicePlaying(ms) { busyUntil = Date.now() + Math.max(0, ms) + OWN_VOICE_HOLD_PAD_MS }
export function markOwnVoiceDone() { busyUntil = 0 }
// Идёт ли (или вот-вот пойдёт) автозапущенный голос ученика — граф не открывает следующее сообщение
export const ownVoiceBusy = () => Date.now() < busyUntil
export function resetOwnVoiceGate() { if (pending) clearTimeout(pending.timer); pending = null; busyUntil = 0 }
