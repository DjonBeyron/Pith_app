// Админская настройка движка распознавания модуля «Сказать фразу» (Админ → «Голос» → настройки модуля; localStorage `pithy_say_engine_v1`):
//  auto   — Vosk, если он готов (модель в кэше И в памяти, библиотека загружена), иначе системное; ПО УМОЛЧАНИЮ (ключа нет)
//  system — только системное распознавание (Vosk не греем и не выбираем)
//  vosk   — только Vosk; если к тапу он не готов — эта попытка всё равно идёт на системном (тап не ждём), причина видна в строке админа
// У обычных пользователей ключа нет — всегда auto. Чистые функции, хранилище передаётся снаружи.
export const SAY_ENGINE_KEY = 'pithy_say_engine_v1'
export const SAY_ENGINE_MODES = ['auto', 'system', 'vosk']
export const SAY_ENGINE_DEFAULT = 'auto'
export const SAY_ENGINE_LABEL = { auto: 'Авто (Vosk, если готов)', system: 'Только системное', vosk: 'Только Vosk' }

/** Режим из хранилища; нет значения / мусор / нет localStorage → 'auto' */
export function readSayEngine(store = globalThis.localStorage) {
  try { const v = store?.getItem(SAY_ENGINE_KEY); return SAY_ENGINE_MODES.includes(v) ? v : SAY_ENGINE_DEFAULT } catch { return SAY_ENGINE_DEFAULT }
}

/** Сохранить режим (по умолчанию стирает ключ — у админа без настройки ничего не лежит); возвращает применённый режим */
export function writeSayEngine(mode, store = globalThis.localStorage) {
  const v = SAY_ENGINE_MODES.includes(mode) ? mode : SAY_ENGINE_DEFAULT
  try { if (v === SAY_ENGINE_DEFAULT) store?.removeItem(SAY_ENGINE_KEY); else store?.setItem(SAY_ENGINE_KEY, v) } catch { /* приватный режим — живёт до перезагрузки */ }
  return v
}
