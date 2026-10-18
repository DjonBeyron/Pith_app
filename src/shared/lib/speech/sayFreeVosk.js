// Эксперимент (админ → «Голос»): свободные фразы «Сказать фразу» (pattern / open) распознаёт Vosk с ОТКРЫТЫМ словарём, а не системное распознавание iOS.
// Зачем: системный движок iPhone сам играет сигналы начала и конца записи, и они сталкиваются со звуком верного ответа; у Vosk своих сигналов нет.
// Риск: у открытого словаря малой модели точность ниже закрытого (чужой акцент, редкие слова), а уверенность слов для него не отсекаем (minConf 0) —
// поэтому флаг по умолчанию ВЫКЛЮЧЕН, включается админом на тест; если Vosk не готов, попытка по-прежнему идёт на системном. Флаг localStorage `pithy_say_free_vosk_v1` ('1' = вкл).
export const SAY_FREE_VOSK_KEY = 'pithy_say_free_vosk_v1'

export function isSayFreeVoskOn(store = globalThis.localStorage) {
  try { return store?.getItem(SAY_FREE_VOSK_KEY) === '1' } catch { return false }
}
export function setSayFreeVoskOn(on, store = globalThis.localStorage) {
  try { if (on) store?.setItem(SAY_FREE_VOSK_KEY, '1'); else store?.removeItem(SAY_FREE_VOSK_KEY) } catch { /* приватный режим — живёт до перезагрузки */ }
}
