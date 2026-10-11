// Выбор движка распознавания на КАЖДУЮ попытку «Сказать фразу». Чистая функция по синхронному снимку состояния (voskRuntime.snapshot()): тап не ждёт НИЧЕГО.
// Vosk — только если всё готово прямо сейчас: режим не «только системное», фраза годится для Vosk (латиница и простые числа — numberWords.js; сложные числа и чужие буквы нет), Vosk не помечен «не работает», модель в кэше,
// в памяти и библиотека подгружена. Иначе — системное распознавание (эта попытка идёт на нём, пользователю ничего не сообщаем). Причина всегда возвращается (строка админа).
import { isVoskPhrase } from '../vosk/sayVoskGrammar.js'

export const PICK_REASON = {
  ready: 'Vosk готов',
  'mode-system': 'выбрано «Только системное»',
  phrase: 'фраза не подходит: не латиница или сложные числа',
  free: 'свободная фраза по шаблону: нужен открытый словарь, а у Vosk закрытый',
  broken: 'Vosk недавно сбоил (пауза 1 мин)',
  'no-model': 'модели нет в кэше',
  loading: 'модель ещё грузится в память',
  'not-loaded': 'модель ещё не в памяти',
  'no-lib': 'библиотека Vosk не подгрузилась',
}

/**
 * @param {{mode?: 'auto'|'system'|'vosk', phrase?: string, free?: boolean, cached?: boolean|null, loaded?: boolean, loading?: boolean, libReady?: boolean, brokenUntil?: number, now?: number}} s
 * @returns {{engine: 'vosk'|'system', reason: string}}
 */
export function pickEngine({ mode = 'auto', phrase = '', free = false, cached = null, loaded = false, loading = false, libReady = false, brokenUntil = 0, now = 0 } = {}) {
  const system = reason => ({ engine: 'system', reason })
  if (mode === 'system') return system('mode-system')
  if (free) return system('free') // шаблон (pattern): ученик говорит своё, словарь Vosk построен под одну фразу и такое «срежет»
  if (!isVoskPhrase(phrase)) return system('phrase')
  if (mode !== 'vosk' && brokenUntil > now) return system('broken') // «Только Vosk» сбой не прячет: админ проверяет именно его
  if (cached === false) return system('no-model')
  if (!loaded) return system(cached === true && loading ? 'loading' : 'not-loaded')
  if (!libReady) return system('no-lib')
  return { engine: 'vosk', reason: 'ready' }
}

/** Подпись для админа: «Vosk» | «системное (модели нет в кэше)» */
export const pickLabel = pick => (pick?.engine === 'vosk' ? 'Vosk' : `системное${pick?.reason ? ` (${PICK_REASON[pick.reason] ?? pick.reason})` : ''}`)
