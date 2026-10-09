// Порог «мелькания» ошибочной формы для режима «Строго» модуля «Сказать фразу» — настройка АДМИНА, а не константа в коде.
// Зачем: после контрольной серии в пробе «Голос» (Тест 1: говорю с ошибкой / говорю правильно) админ видит, при каком пороге правило «первое увиденное»
// ловит ошибки и не даёт ложных тревог, и выставляет его здесь без правки кода. Хранится в localStorage `pithy_say_dwell_v1` (мс); нет значения — 500 (как было).
// 0 = ловить любое появление ошибочной формы в потоке interim. У учеников значения нет, поэтому работает порог по умолчанию.
import { DWELL_DEFAULT, clampDwell } from './flashDwell.js'

export const SAY_DWELL_KEY = 'pithy_say_dwell_v1'

/** Порог в мс (0–1200). Нет значения / битое / нет localStorage → DWELL_DEFAULT */
export function readSayDwell(store = globalThis.localStorage) {
  try {
    const raw = store?.getItem(SAY_DWELL_KEY)
    return raw == null || raw === '' ? DWELL_DEFAULT : clampDwell(raw)
  } catch { return DWELL_DEFAULT }
}

/** Сохранить порог; значение по умолчанию стирает ключ (чтобы у админа без настройки ничего не лежало) */
export function writeSayDwell(ms, store = globalThis.localStorage) {
  const v = clampDwell(ms)
  try { if (v === DWELL_DEFAULT) store?.removeItem(SAY_DWELL_KEY); else store?.setItem(SAY_DWELL_KEY, String(v)) } catch { /* приватный режим — живёт до перезагрузки */ }
  return v
}
