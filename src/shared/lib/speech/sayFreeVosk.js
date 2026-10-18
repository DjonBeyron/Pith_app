// Свободные фразы (по умолчанию ВКЛ, переключатель — админ → «Голос»): свободные фразы «Сказать фразу» (pattern / open) распознаёт Vosk с ОТКРЫТЫМ словарём, а не системное распознавание iOS.
// Зачем: системный движок iPhone сам играет сигналы начала и конца записи, и они сталкиваются со звуком верного ответа; у Vosk своих сигналов нет.
// Риск: у открытого словаря малой модели точность ниже закрытого (чужой акцент, редкие слова), а уверенность слов для него не отсекаем (minConf 0) —
// решение автора (2026-10-18): оставляем Vosk и для свободных фраз — без сигналов iOS и с голосовым ответом; если Vosk не готов, попытка идёт на системном. Флаг localStorage `pithy_say_free_vosk_v1`: нет значения = вкл, '0' = выкл.
export const SAY_FREE_VOSK_KEY = 'pithy_say_free_vosk_v1'

export function isSayFreeVoskOn(store = globalThis.localStorage) {
  try { return store?.getItem(SAY_FREE_VOSK_KEY) !== '0' } catch { return true }
}
export function setSayFreeVoskOn(on, store = globalThis.localStorage) {
  try { if (on) store?.removeItem(SAY_FREE_VOSK_KEY); else store?.setItem(SAY_FREE_VOSK_KEY, '0') } catch { /* приватный режим — живёт до перезагрузки */ }
}
